#!/usr/bin/env node
// Builds the Chrome Web Store package from only the files the extension needs at
// runtime (no tests, dev tools, docs or git metadata), with no dependencies:
//   dist/snipershot-<version>/      unpacked — chrome://extensions → Load unpacked
//   dist/snipershot-<version>.zip   upload to the Chrome Web Store
// Older builds in dist/ are removed first.
//
//   node tools/package.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_FILES = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "core.js",
  "game.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png"
];

const fail = message => { console.error(`package: ${message}`); process.exit(1); };
const read = file => readFileSync(path.join(ROOT, file), "utf8");

const manifest = JSON.parse(read("manifest.json"));
if (manifest.manifest_version !== 3) fail("manifest_version must be 3.");
if (manifest.key || manifest.update_url) fail("manifest.json must not contain store-injected 'key' / 'update_url'.");
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail(`invalid version "${manifest.version}".`);
if (manifest.name.length > 75) fail("name is longer than 75 characters.");
if (manifest.description.length > 132) fail("description is longer than 132 characters (Web Store limit).");

// Every file referenced by the manifest, the popup page and the injection call must ship.
const referenced = new Set([manifest.action && manifest.action.default_popup]);
for (const group of [manifest.icons, manifest.action && manifest.action.default_icon]) {
  for (const file of Object.values(group || {})) referenced.add(file);
}
for (const [, file] of read("popup.html").matchAll(/(?:src|href)="([^"]+)"/g)) referenced.add(file);
const injected = /files:\s*\[([^\]]*)\]/.exec(read("popup.js"));
if (!injected) fail("could not find the injected files list in popup.js.");
for (const [, file] of injected[1].matchAll(/"([^"]+)"/g)) referenced.add(file);
for (const file of referenced) {
  if (file && !RUNTIME_FILES.includes(file)) fail(`${file} is referenced but not in RUNTIME_FILES.`);
}
for (const file of RUNTIME_FILES) {
  if (!existsSync(path.join(ROOT, file))) fail(`missing runtime file: ${file}`);
}

// Store policy: no remote code or network calls in the shipped scripts.
for (const file of RUNTIME_FILES.filter(f => /\.(js|html)$/.test(f))) {
  const source = read(file);
  const hit = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|importScripts|eval)\s*\(|new Function\s*\(|https?:\/\//.exec(source);
  if (hit) fail(`${file} contains "${hit[0]}" (remote code / network access is not allowed).`);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal ZIP writer (deflate, fixed timestamps so builds are reproducible).
function zip(entries) {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(stored ? 0 : 8, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const DIST = path.join(ROOT, "dist");
mkdirSync(DIST, { recursive: true });
for (const old of readdirSync(DIST)) {
  if (/^snipershot-/.test(old)) rmSync(path.join(DIST, old), { recursive: true, force: true });
}

const name = `snipershot-${manifest.version}`;
const files = RUNTIME_FILES.map(file => ({ name: file, data: readFileSync(path.join(ROOT, file)) }));
const folder = path.join(DIST, name);
for (const file of files) {
  mkdirSync(path.dirname(path.join(folder, file.name)), { recursive: true });
  writeFileSync(path.join(folder, file.name), file.data);
}
const out = path.join(DIST, `${name}.zip`);
const bytes = zip(files);
writeFileSync(out, bytes);
console.log(`${path.relative(ROOT, folder)}/   (unpacked, for Load unpacked)`);
console.log(`${path.relative(ROOT, out)}  (${files.length} files, ${(bytes.length / 1024).toFixed(1)} KB, for upload)`);
for (const file of RUNTIME_FILES) console.log(`  ${file}`);
