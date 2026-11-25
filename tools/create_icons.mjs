#!/usr/bin/env node
// Generates icons/icon{16,48,128}.png with no dependencies (dev only, not shipped logic).
// Same family as BlastBlastBlast: a dark rounded tile and a glowing amber disc — here
// seen through a sniper scope, with a ranging grid, crosshair, red dot and a soldier's
// helmeted head right on target.
//
//   node tools/create_icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function over(dst, rgb, alpha) {
  const a = alpha + dst[3] * (1 - alpha);
  if (!a) return [0, 0, 0, 0];
  return [...rgb.map((v, i) => (v * alpha + dst[i] * dst[3] * (1 - alpha)) / a), a];
}

function shade(u, v, size) {
  const detailed = size >= 48;
  const dx = u - 0.5;
  const dy = v - 0.5;
  const d = Math.hypot(dx, dy);
  let px = [0, 0, 0, 0];

  // Dark rounded tile.
  const corner = 0.22;
  const qx = Math.max(Math.abs(dx) - (0.5 - corner), 0);
  const qy = Math.max(Math.abs(dy) - (0.5 - corner), 0);
  if (Math.hypot(qx, qy) > corner) return px;
  px = [18, 16, 22, 1];

  const lensR = detailed ? 0.37 : 0.36;
  const ringR = detailed ? 0.46 : 0.47;
  if (d <= lensR) {
    // Fiery amber glow through the lens.
    const t = d / lensR;
    const col = t < 0.35 ? mix([255, 226, 130], [255, 145, 20], t / 0.35)
      : t < 0.75 ? mix([255, 145, 20], [200, 50, 5], (t - 0.35) / 0.4)
      : mix([200, 50, 5], [70, 14, 4], (t - 0.75) / 0.25);
    px = over(px, col, 1);
    if (detailed) {
      // Ranging grid.
      const step = 1 / 11;
      const gx = Math.abs(((u + step / 2) % step) - step / 2);
      const gy = Math.abs(((v + step / 2) % step) - step / 2);
      if (gx < 0.004 || gy < 0.004) px = over(px, [40, 10, 0], 0.35);
      // Soldier silhouette: shoulders, head and helmet, head on the crosshair.
      const sil = [28, 22, 18];
      const sx = dx / 0.2;
      const sy = (v - 0.73) / 0.11;
      if (sx * sx + sy * sy <= 1) px = over(px, sil, 0.92);
      if (Math.abs(dx) < 0.035 && v > 0.56 && v < 0.66) px = over(px, sil, 0.92);
      if (Math.hypot(dx, v - 0.52) < 0.07) px = over(px, sil, 0.92);
      if (Math.hypot(dx, v - 0.5) < 0.085 && v < 0.5) px = over(px, sil, 0.95);
      if (Math.abs(dx) < 0.1 && v >= 0.49 && v < 0.51) px = over(px, sil, 0.95);
    }
    // Crosshair: thin lines with thick posts toward the rim.
    const thin = detailed ? 0.007 : 0.03;
    if (Math.abs(dx) < thin || Math.abs(dy) < thin) px = over(px, [10, 8, 8], 0.95);
    if (detailed) {
      const post = 0.02;
      if ((Math.abs(dx) < post && Math.abs(dy) > 0.22) || (Math.abs(dy) < post && Math.abs(dx) > 0.22)) px = over(px, [10, 8, 8], 1);
      for (let i = 1; i <= 3; i++) {
        const m = i * 0.055;
        if (Math.abs(Math.abs(dx) - m) < 0.006 && Math.abs(dy) < 0.025) px = over(px, [10, 8, 8], 0.95);
        if (Math.abs(Math.abs(dy) - m) < 0.006 && Math.abs(dx) < 0.025) px = over(px, [10, 8, 8], 0.95);
      }
    }
    // Vignette at the lens edge.
    if (t > 0.8) px = over(px, [0, 0, 0], (t - 0.8) / 0.2 * 0.6);
  } else if (d <= ringR) {
    // Black scope tube with a metallic highlight.
    px = over(px, [8, 8, 10], 1);
    const edge = Math.abs(d - (ringR - 0.012));
    if (edge < 0.008) px = over(px, [120, 120, 125], detailed ? 0.55 : 0.4);
    const inner = Math.abs(d - (lensR + 0.008));
    if (inner < 0.006 && detailed) px = over(px, [70, 70, 75], 0.5);
  }

  // Red aiming dot with a soft glow.
  const dotR = detailed ? 0.03 : 0.07;
  if (d < dotR * 2.2) px = over(px, [255, 70, 50], Math.max(0, 1 - d / (dotR * 2.2)) * 0.45);
  if (d < dotR) px = over(px, [255, 59, 47], 1);
  return px;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const p = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, size);
          r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round(a / (ss * ss) * 255);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = buf => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(path.join(OUT, `icon${size}.png`), png(size));
  console.log(`icons/icon${size}.png`);
}
