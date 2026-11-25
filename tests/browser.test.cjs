"use strict";

// Exercises the unpacked extension through Chrome's DevTools protocol.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = path.resolve(__dirname, "..");
// SNIPER_EXT tests another build of the extension, e.g. the unzipped store package.
const extensionDir = path.resolve(process.env.SNIPER_EXT || root);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, description, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
  const server = http.createServer((request, response) => {
    // A sped-up build for the game-over check: one heart, an instant bomber, a 1.5 s fuse.
    const fast = (file, swaps) => swaps.reduce((src, [a, b]) => {
      if (!src.includes(a)) throw new Error(`fast build: ${file} no longer contains ${a}`);
      return src.replace(a, b);
    }, readFileSync(path.join(root, file), "utf8"));
    if (request.url === "/fast-core.js" || request.url === "/fast-game.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(request.url === "/fast-core.js"
        ? fast("core.js", [["hearts: has(9) ? 5 : has(5) ? 4 : 3,", "hearts: 1,"]])
        : fast("game.js", [["const BOMB_TIME = 10;", "const BOMB_TIME = 1.5;"],
          ['if (!bombing && (level >= 2 || mission.type === "bomb") && Math.random() < (mission.type === "bomb" ? 0.4 : 0.14)) return TYPES.bomber;', "if (!bombing) return TYPES.bomber;"]]));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (request.url === "/fast") {
      response.end(`<!doctype html><title>Fast</title><p style="margin:260px 400px;width:300px;height:80px;background:#ddd">Cover</p>
        <script src="/fast-core.js"></script><script src="/fast-game.js"></script>`);
      return;
    }
    if (request.url === "/frame") {
      response.end("<!doctype html><title>Frame</title><p>Embedded page</p>");
      return;
    }
    response.end(`<!doctype html><title>Fixture</title>
      <style>body{height:1800px} #cover{position:absolute;left:300px;top:230px;width:220px;height:120px;background:#ddd}
      iframe{position:absolute;left:650px;top:350px;width:200px;height:100px}</style>
      <h1 style="margin:90px 0 0 300px;font:700 34px Georgia">The Daily Memo</h1>
      <p id="cover">A perfectly ordinary document.</p>
      <p style="position:absolute;left:120px;top:470px;width:380px;font:16px Georgia;line-height:1.5">Quarterly stationery figures are up. The stapler declined to comment on reports of a missing punchline.</p>
      <button id="page-button" onclick="window.pageClicks=(window.pageClicks||0)+1">Page button</button>
      <iframe src="http://localhost:${server.address().port}/frame"></iframe>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = mkdtempSync(path.join(os.tmpdir(), "snipershot-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--window-size=1280,800", "about:blank"
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  let nextId = 0;
  const pending = new Map();
  let buffer = Buffer.alloc(0);
  chrome.stdio[4].on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(0)) !== -1) {
      const message = JSON.parse(buffer.subarray(0, end).toString());
      buffer = buffer.subarray(end + 1);
      if (message.method === "Runtime.exceptionThrown") console.error("Page exception:", message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (!message.id || !pending.has(message.id)) continue;
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result);
    }
  });
  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  }
  async function evaluate(sessionId, expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function openTab(url) {
    const { targetId } = await send("Target.createTarget", { url });
    await send("Target.activateTarget", { targetId });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    // Screenshots are taken at the Chrome Web Store screenshot size.
    if (process.env.SNIPER_SHOTS) await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await waitFor(() => evaluate(sessionId, `document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`).catch(() => false), "page load");
    return { targetId, sessionId };
  }
  async function openPopup(extensionId, tab) {
    const before = new Set((await send("Target.getTargets")).targetInfos.map(target => target.targetId));
    const targets = (await send("Target.getTargets")).targetInfos;
    const page = targets.find(target => target.targetId === tab.targetId);
    const tabs = (await send("Target.getTargets", { filter: [{ type: "tab" }] })).targetInfos;
    const tabTarget = tabs.find(target => target.targetId === page.parentId) || tabs.find(target => target.url === page.url);
    assert.ok(tabTarget, "Chrome tab target exists");
    await send("Extensions.triggerAction", { id: extensionId, targetId: tabTarget.targetId });
    const target = await waitFor(async () => (await send("Target.getTargets")).targetInfos
      .find(item => !before.has(item.targetId) && item.url.includes("/popup.html")), "extension popup");
    const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await send("Runtime.enable", {}, sessionId);
    await waitFor(() => evaluate(sessionId, "document.readyState === 'complete'"), "popup load");
    return sessionId;
  }
  async function findNode(sessionId, predicate) {
    const { root: document } = await send("DOM.getDocument", { depth: -1, pierce: true }, sessionId);
    const walk = node => {
      if (predicate(node)) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(document);
  }
  async function objectCall(sessionId, objectId, fn) {
    const result = await send("Runtime.callFunctionOn", { objectId, functionDeclaration: fn, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function nodeCall(sessionId, node, fn) {
    const { object } = await send("DOM.resolveNode", { nodeId: node.nodeId }, sessionId);
    return objectCall(sessionId, object.objectId, fn);
  }
  async function classNode(sessionId, className) {
    return findNode(sessionId, node => {
      const attrs = node.attributes || [];
      const i = attrs.indexOf("class");
      return i >= 0 && attrs[i + 1].split(" ").includes(className);
    });
  }
  async function text(sessionId, className) {
    const node = await classNode(sessionId, className);
    return node && nodeCall(sessionId, node, "function() { return this.textContent; }");
  }
  async function clickNode(sessionId, className) {
    const node = await classNode(sessionId, className);
    assert.ok(node, `${className} exists`);
    await nodeCall(sessionId, node, "function() { this.click(); }");
  }
  async function click(sessionId, x, y) {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }, sessionId);
    }
  }
  async function key(sessionId, name, code, number) {
    for (const type of ["rawKeyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key: name, code, windowsVirtualKeyCode: number }, sessionId);
    }
  }

  try {
    const { id } = await send("Extensions.loadUnpacked", { path: extensionDir });
    assert.ok(id);
    const tab = await openTab(`http://127.0.0.1:${server.address().port}/`);
    let popup = await openPopup(id, tab);
    await waitFor(() => evaluate(popup, "!document.querySelector('#toggle').disabled"), "launch button");
    assert.match(await evaluate(popup, "document.querySelector('#toggle').textContent"), /Launch/);
    await evaluate(popup, "document.querySelector('#toggle').click()").catch(() => {});
    await waitFor(() => evaluate(tab.sessionId, "!!document.querySelector('#snipershot-overlay')"), "game injection");
    await clickNode(tab.sessionId, "start");
    assert.equal(await text(tab.sessionId, "hearts"), "♥♥♥");
    assert.match(await text(tab.sessionId, "case"), /suspicious stationery/i);
    assert.match(await text(tab.sessionId, "ammo-text"), /^5 \/ ∞/);

    // Hip-fire over a cross-origin frame consumes a round; manual reload refills.
    await click(tab.sessionId, 700, 400);
    assert.match(await text(tab.sessionId, "ammo-text"), /^4 \/ ∞/);
    await sleep(300);
    assert.match(await text(tab.sessionId, "banner"), /MISSED/);
    await sleep(700);
    await key(tab.sessionId, "r", "KeyR", 82);
    assert.match(await text(tab.sessionId, "ammo-text"), /RELOADING/);
    await waitFor(async () => /^5 \/ ∞/.test(await text(tab.sessionId, "ammo-text")), "reload");
    // Emptying the magazine reloads automatically (it used to stall at 0 rounds).
    for (let i = 0; i < 5; i++) { await click(tab.sessionId, 1000, 600); await sleep(950); }
    await waitFor(async () => /^5 \/ ∞/.test(await text(tab.sessionId, "ammo-text")), "automatic reload", 4000);
    await key(tab.sessionId, "g", "KeyG", 71);
    assert.match(await text(tab.sessionId, "grid"), /ON/);
    await key(tab.sessionId, "g", "KeyG", 71);
    assert.match(await text(tab.sessionId, "grid"), /OFF/);
    await evaluate(tab.sessionId, "scrollTo(0, 250)");
    assert.equal(await evaluate(tab.sessionId, "scrollY"), 250);
    await evaluate(tab.sessionId, "scrollTo(0, 0)");

    const canvas = await findNode(tab.sessionId, node => node.nodeName === "CANVAS");
    const canvasObject = (await send("DOM.resolveNode", { nodeId: canvas.nodeId }, tab.sessionId)).object.objectId;
    // Mean position of solid face-coloured pixels (BlastBlastBlast skin tone), or null.
    const findFace = reach => objectCall(tab.sessionId, canvasObject, `function() {
      const w = this.width, h = this.height, d = this.getContext("2d").getImageData(0, 0, w, h).data;
      const ratio = w / this.clientWidth, k = ${reach};
      const skin = (x, y) => { const i = (y * w + x) * 4; return Math.abs(d[i] - 200) < 14 && Math.abs(d[i+1] - 162) < 12 && Math.abs(d[i+2] - 116) < 10; };
      let sx = 0, sy = 0, n = 0, best = null;
      for (let y = k; y < h - k; y += 2) for (let x = k; x < w - k; x += 2) {
        if (skin(x,y) && skin(x+k,y) && skin(x-k,y) && skin(x,y+k) && skin(x,y-k)) {
          if (!best) best = {x, y};
          if (Math.abs(x - best.x) < 40 && Math.abs(y - best.y) < 40) { sx += x; sy += y; n++; }
        }
      }
      return n ? { x: sx / n / ratio, y: sy / n / ratio } : null;
    }`);
    const shot = async name => {
      if (!process.env.SNIPER_SHOTS) return;
      const image = await send("Page.captureScreenshot", {}, tab.sessionId);
      writeFileSync(path.join(process.env.SNIPER_SHOTS, name), Buffer.from(image.data, "base64"));
    };
    const move = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, tab.sessionId);
    const mouse = async (button, x, y) => {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button, buttons: type === "mousePressed" ? (button === "left" ? 1 : 2) : 0, clickCount: 1 }, tab.sessionId);
      }
    };
    const shift = type => send("Input.dispatchKeyEvent", { type, key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 }, tab.sessionId);

    const center = await objectCall(tab.sessionId, canvasObject, "function() { return { x: this.clientWidth / 2, y: this.clientHeight / 2 }; }");
    // Scope in on a peeking soldier, center the head under the reticle and fire.
    let headshot = false;
    for (let attempt = 0; attempt < 12 && !headshot; attempt++) {
      const face = await waitFor(() => findFace(1), "soldier in hip view", 15000);
      await move(face.x, face.y);
      if (attempt === 0) await shot("hip.png");
      await mouse("right", face.x, face.y);
      await waitFor(async () => /scale\(4\)/.test(await evaluate(tab.sessionId, "document.documentElement.style.transform")), "4x page magnification");
      await shift("rawKeyDown");
      let aim = { x: face.x, y: face.y };   // mouse position; in the scope, motion pans the view 1:1 on screen
      let locked = false;
      for (let i = 0; i < 40; i++) {
        const seen = await findFace(5);
        if (!seen) { await sleep(80); continue; }
        const dx = seen.x - center.x, dy = seen.y - center.y;
        if (Math.hypot(dx, dy) < 5) { locked = true; break; }
        aim = { x: aim.x + dx, y: aim.y + dy };
        await move(aim.x, aim.y);
        await sleep(60);
      }
      if (locked) {
        await shot("scope.png");
        await mouse("left", aim.x, aim.y);
        await sleep(500);
        await shot("bullet-cam.png");
        headshot = await waitFor(async () => /HEADSHOT/.test(await text(tab.sessionId, "feed")), "headshot", 3000).catch(() => false);
      }
      await shift("keyUp");
      await sleep(1300);
      if (/scale/.test(await evaluate(tab.sessionId, "document.documentElement.style.transform"))) await mouse("right", aim.x, aim.y);
      await sleep(400);
    }
    assert.ok(headshot, "a scoped shot at a soldier's head registers a headshot");

    // One wheel notch zooms about 1.5×.
    await sleep(1200);
    await mouse("right", 640, 360);
    await waitFor(async () => /4\.0×/.test(await text(tab.sessionId, "ammo-text")), "scope for zoom check", 5000);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 360, deltaX: 0, deltaY: -100 }, tab.sessionId);
    await waitFor(async () => /6\.0×/.test(await text(tab.sessionId, "ammo-text")), "one-notch zoom to 6×", 3000);
    await mouse("right", 640, 360);
    await sleep(800);

    // Hip-fire: hold still on a head and the shot lands exactly on the red dot.
    const kills = async () => Number((/KILLS (\d+)/.exec(await text(tab.sessionId, "meta")) || [])[1]);
    const before = await kills();
    let hipHeadshot = false;
    // Soldiers duck back after a few seconds, so some attempts find nobody left to shoot.
    for (let attempt = 0; attempt < 25 && !hipHeadshot; attempt++) {
      const face = await waitFor(() => findFace(2), "soldier for hip-fire", 15000);
      await move(face.x, face.y);
      await sleep(430);
      // The red dot covers the face center, so check skin diagonally around it (clear of the crosshair arms).
      const still = await objectCall(tab.sessionId, canvasObject, `function() {
        const ratio = this.width / this.clientWidth, d = this.getContext("2d").getImageData(0, 0, this.width, this.height).data;
        let skin = 0;
        for (let a = 0; a < 8; a++) {
          const x = Math.round((${face.x} + Math.cos(a * Math.PI / 4 + 0.4) * 2.6) * ratio);
          const y = Math.round((${face.y} + Math.sin(a * Math.PI / 4 + 0.4) * 2.6) * ratio), i = (y * this.width + x) * 4;
          if (d[i] > 160 && d[i] < 225 && d[i+1] > 125 && d[i+1] < 185 && d[i+2] > 80 && d[i+2] < 135 && d[i] - d[i+2] > 60) skin++;
        }
        return skin >= 4;
      }`);
      if (!still) { await sleep(150); continue; }
      await mouse("left", face.x, face.y);
      hipHeadshot = await waitFor(async () => (await kills()) > before, "hip headshot", 1500).catch(() => false);
      await sleep(1000);
    }
    assert.ok(hipHeadshot, "a steady hip-fire shot on the red dot hits the head");
    assert.match(await text(tab.sessionId, "score"), /^[1-9]\d*/);

    await key(tab.sessionId, "Escape", "Escape", 27);
    assert.equal(await evaluate(tab.sessionId, "!!document.querySelector('#snipershot-overlay')"), false);
    assert.equal(await evaluate(tab.sessionId, "(document.body.getAttribute('style') || '') + (document.documentElement.getAttribute('style') || '')"), "");
    const pageButton = await evaluate(tab.sessionId, "(() => { const r = document.querySelector('#page-button').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
    await click(tab.sessionId, pageButton.x, pageButton.y);
    assert.equal(await evaluate(tab.sessionId, "window.pageClicks"), 1);
    assert.equal(await evaluate(tab.sessionId, "document.querySelector('#cover').textContent"), "A perfectly ordinary document.");

    popup = await openPopup(id, tab);
    // Leaving mid-run banks the XP; the popup shows the career rank.
    const saved = await evaluate(popup, "chrome.storage.local.get('ssCareer').then(r => r.ssCareer || null)");
    assert.ok(saved && saved.xp > 0, `career saved: ${JSON.stringify(saved)}`);
    assert.match(await waitFor(() => evaluate(popup, "!document.querySelector('#career').hidden && document.querySelector('#career').textContent"), "career in popup"), /Rank \d/);
    await waitFor(() => evaluate(popup, "!document.querySelector('#toggle').disabled"), "relaunch button");
    await evaluate(popup, "document.querySelector('#toggle').click()").catch(() => {});
    await waitFor(() => evaluate(tab.sessionId, "!!document.querySelector('#snipershot-overlay')"), "relaunch");
    popup = await openPopup(id, tab);
    await waitFor(() => evaluate(popup, "!document.querySelector('#toggle').disabled"), "remove button");
    assert.match(await evaluate(popup, "document.querySelector('#toggle').textContent"), /Remove/);
    await evaluate(popup, "document.querySelector('#toggle').click()").catch(() => {});
    await waitFor(async () => !(await evaluate(tab.sessionId, "!!document.querySelector('#snipershot-overlay')")), "popup removal");

    // Losing the last heart ends the run with a debrief; Play again starts fresh.
    const fastTab = await openTab(`http://127.0.0.1:${server.address().port}/fast`);
    await clickNode(fastTab.sessionId, "start");
    await waitFor(async () => /BOMB WENT OFF/.test(await text(fastTab.sessionId, "toast")), "bomb explosion", 10000);
    await waitFor(async () => {
      const node = await classNode(fastTab.sessionId, "debrief");
      return node && !(await nodeCall(fastTab.sessionId, node, "function() { return this.hidden; }"));
    }, "debrief", 5000);
    assert.match(await text(fastTab.sessionId, "debrief-title"), /Mission failed/);
    if (process.env.SNIPER_SHOTS) {
      const image = await send("Page.captureScreenshot", {}, fastTab.sessionId);
      writeFileSync(path.join(process.env.SNIPER_SHOTS, "debrief.png"), Buffer.from(image.data, "base64"));
    }
    await clickNode(fastTab.sessionId, "again");
    assert.equal(await text(fastTab.sessionId, "hearts"), "♥");
    assert.equal(await nodeCall(fastTab.sessionId, await classNode(fastTab.sessionId, "debrief"), "function() { return this.hidden; }"), true);

    const restricted = await openTab("chrome://extensions/");
    popup = await openPopup(id, restricted);
    await waitFor(() => evaluate(popup, "document.querySelector('#status').textContent"), "restricted-page message");
    assert.equal(await evaluate(popup, "document.querySelector('#toggle').disabled"), true);
    console.log("Browser checks passed: launch, story progression, iframe input, reload, grid, scrolling, scoped and hip headshots, wheel zoom, exit, career saved, relaunch, popup removal, game over and debrief, restricted page.");
  } finally {
    chrome.kill();
    await new Promise(resolve => chrome.once("exit", resolve));
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
