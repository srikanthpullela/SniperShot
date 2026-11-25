/* SniperShot — injected on demand into the active tab's top frame.
 *
 *  - Hip view: the page with a tactical grid, a rifle and an inaccurate hip crosshair.
 *  - Scope (right-click / Space): full-screen black scope; the page itself is magnified
 *    by a temporary transform on <body> (restored on unscope and exit), and soldiers are
 *    drawn at the same magnification, so what you see under the reticle is what you hit.
 *  - Soldiers use the BlastBlastBlast look and hide behind real page elements.
 *  - Every shot flies along a visible bullet path; scoped headshots play a slow-motion bullet cam.
 *  - Sounds are synthesized with Web Audio; nothing is downloaded or stored.
 */
(() => {
  "use strict";
  if (globalThis.__sniperShot || window !== window.top || !(document.documentElement instanceof HTMLElement)) return;

  const core = globalThis.SniperShotCore;
  const TAU = Math.PI * 2;
  const ZOOM_MIN = 2;
  const HIP_SPREAD = 26;        // px: hip-fire spread while the mouse is moving
  const HIP_SETTLE = 70;        // px/s the spread closes once the mouse is still (≈0.4 s to dead-on)
  const CAM_EVERY = 4;          // every 4th headshot in a row plays the slow-motion bullet cam
  const COVER_SELECTOR = "p,h1,h2,h3,h4,img,picture,video,button,input,textarea,select,iframe,figure,blockquote,pre,table,label,svg,li";

  const BOMB_TIME = 10;             // s a bomber needs to plant; an unstopped bomb costs a heart
  // Only headshots kill. Peeks are long enough to scope in, lock on and squeeze.
  const TYPES = {
    rifleman: { label: "Rifleman", color: "#4b5d32", helmet: "#37432a", hold: [2.6, 3.8] },
    scout: { label: "Scout", color: "#6b5a3a", helmet: "#4a3f2a", hold: [1.8, 2.6] },
    heavy: { label: "Heavy", color: "#3d4a52", helmet: "#262d33", hold: [3.2, 4.4] },
    marksman: { label: "Marksman", color: "#2f3d25", helmet: "#24301c", hold: [5.2, 5.2], shoots: true },
    bomber: { label: "Bomber", color: "#55402c", helmet: "#3b2c1e", hold: [BOMB_TIME, BOMB_TIME], bomb: true },
    hvt: { label: "HVT", color: "#2a2a30", helmet: "#b3261e", hold: [1.5, 2.2], hvt: true, beret: true },
    civilian: { label: "Civilian", color: "#e9edf2", helmet: null, hold: [2.2, 3.4], civilian: true }
  };
  const HVT_NAMES = ["“The Shredder”", "“Red Ink” Rodriguez", "“The Auditor”", "“Overtime” Olsen", "“Reply-All” Rita"];
  const MEDALS = {
    noscope: { icon: "🎯", name: "NO-SCOPE", points: 150 },
    quickscope: { icon: "⚡", name: "QUICKSCOPE", points: 100 },
    longshot: { icon: "🔭", name: "LONGSHOT", points: 150 },
    collateral: { icon: "💥", name: "COLLATERAL", points: 400 },
    closecall: { icon: "😅", name: "CLOSE CALL", points: 200 },
    defused: { icon: "🧯", name: "BOMB STOPPED", points: 150 },
    lastsecond: { icon: "⏱️", name: "LAST SECOND", points: 250 },
    hvt: { icon: "👑", name: "HVT ELIMINATED", points: 1000 },
    streak5: { icon: "🔥", name: "ON FIRE", points: 250 },
    streak10: { icon: "☄️", name: "UNSTOPPABLE", points: 500 },
    streak15: { icon: "🗂️", name: "PAPER SHREDDER", points: 1000 }
  };
  const MARKSMAN_AIM_START = 1.0;   // s into a peek before the lens glint appears
  const MARKSMAN_FIRES_AT = 5.0;    // s into a peek when an unanswered marksman fires
  const NAMES = ["Sgt. Stapleton", "Pvt. Paperclip", "Cpl. Shredder", "Lt. Laminator", "Maj. Memo", "Courier Dave",
    "Intern Kevin", "Pvt. Post-it", "Capt. Clipboard", "Agent Toner", "Sgt. Spreadsheet", "Pvt. Highlighter"];
  const MISSIONS = [
    { title: "The suspicious stationery", objective: "Eliminate 3 operatives", type: "kill", goal: 3,
      line: "HQ: \"Only a headshot drops them. Scope in, wait for the peek, breathe, squeeze.\"" },
    { title: "A very sharp lead", objective: "2 headshots in a row", type: "streak", goal: 2,
      line: "HQ: \"Miss and they go back into hiding. Patience is a weapon, agent.\"" },
    { title: "Glint in the blinds", objective: "Neutralize 1 marksman", type: "marksman", goal: 1,
      line: "HQ: \"See a lens glint? That's a marksman. Take him before he takes you.\"" },
    { title: "Running late", objective: "Drop 1 runner mid-dash", type: "runner", goal: 1,
      line: "HQ: \"A courier is sprinting between covers with the punchline. Lead him.\"" },
    { title: "Long-distance relationship", objective: "2 kills beyond 450 m", type: "long", goal: 2,
      line: "HQ: \"The far ones look small. Scroll the wheel to zoom in further.\"" },
    { title: "Hostile takeover", objective: "Stop 2 bombers", type: "bomb", goal: 2,
      line: "HQ: \"They're rigging the printers. A red BOMB timer means drop everything.\"" },
    { title: "Show-off", objective: "Earn 2 medals", type: "medal", goal: 2,
      line: "HQ: \"No-scopes, quickscopes, collaterals. Accounts says style is tax-deductible.\"" },
    { title: "Out of office", objective: "Eliminate 6 operatives", type: "kill", goal: 6,
      line: "HQ: \"The ringleader left a note: 'Back after this meeting.'\"" },
    { title: "The missing punchline", objective: "4 headshots in a row", type: "streak", goal: 4,
      line: "HQ: \"Four clean shots and you'll see it in slow motion. HQ likes a replay.\"" },
    { title: "Case reopened", objective: "Neutralize 2 marksmen", type: "marksman", goal: 2,
      line: "HQ: \"The punchline was 'the friends we misfiled along the way'. We lost it again.\"" }
  ];
  const LEVEL_LINES = ["", "", "Bombers incoming. Watch for the red timers.",
    "Marksmen are on the roof. Watch for the glint.", "Every intern in the building is now armed. Godspeed.",
    "Management has joined the fight. Nobody knows why."];

  /* ── Overlay ─────────────────────────────────────────────────────────── */
  const host = document.createElement("div");
  host.id = "snipershot-overlay";
  host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .surface { position: fixed; inset: 0; overflow: hidden; cursor: none; color: #f2f4ee; user-select: none; -webkit-user-select: none;
        font: 600 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
      .panel { position: absolute; background: linear-gradient(180deg, rgba(10,13,11,.86), rgba(10,13,11,.72));
        border: 1px solid rgba(255,255,255,.12); border-radius: 4px; box-shadow: 0 6px 24px rgba(0,0,0,.4); text-shadow: 0 1px 2px #000; }
      .mission { top: 14px; left: 14px; width: min(350px, calc(100vw - 28px)); padding: 10px 12px; pointer-events: none; }
      .op { font-size: 10px; letter-spacing: .22em; color: #f0c35a; }
      .case { margin-top: 3px; font-size: 14px; }
      .objective { margin-top: 2px; font-size: 12px; color: #d3d9cb; }
      .bar { height: 3px; margin-top: 7px; background: rgba(255,255,255,.15); }
      .bar i { display: block; height: 100%; width: 0; background: #f0c35a; transition: width .25s; }
      .line { margin-top: 7px; font: italic 500 12px/1.35 Georgia, ui-serif, serif; color: #dcd5bf; }
      .stats { left: 14px; bottom: 14px; padding: 8px 14px; pointer-events: none; }
      .hearts { font-size: 17px; letter-spacing: 3px; color: #ff4d4d; }
      .hearts i { font-style: normal; color: rgba(255,255,255,.22); }
      .hearts.hurt { animation: hurt .5s; }
      @keyframes hurt { 0%, 100% { transform: none; } 25% { transform: translateX(-4px) scale(1.2); } 75% { transform: translateX(4px); } }
      .medals { position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); display: flex; flex-direction: column-reverse; align-items: center; gap: 6px; pointer-events: none; }
      .medal { display: flex; align-items: center; gap: 10px; padding: 6px 16px 6px 8px; border-radius: 30px; background: linear-gradient(90deg, rgba(60,40,0,.92), rgba(20,16,8,.85));
        border: 1px solid #f0c35a; box-shadow: 0 0 24px rgba(240,195,90,.45); white-space: nowrap; text-shadow: 0 1px 2px #000; }
      .medal .icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(#ffe7a0, #c8902a); font-size: 19px; text-shadow: none; }
      .medal b { font-size: 15px; letter-spacing: .14em; color: #ffe08a; }
      .medal span { font-size: 12px; color: #f2f4ee; letter-spacing: .08em; }
      .career { margin: 12px 0 6px; padding: 10px 12px; border: 1px dashed #8b7a55; font-size: 12px; color: #3b3220; }
      .career b { color: #7a1f17; }
      .rankbar { height: 6px; margin-top: 6px; background: rgba(43,36,24,.18); }
      .rankbar i { display: block; height: 100%; background: #b3261e; }
      .debrief .grid2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
      .debrief .stat { padding: 8px; background: rgba(43,36,24,.08); text-align: center; }
      .debrief .stat b { display: block; font: 800 22px Georgia, ui-serif, serif; color: #1f1a10; }
      .debrief .stat span { font-size: 10px; letter-spacing: .14em; color: #6a5a3a; }
      .debrief .medal-list { font-size: 13px; color: #3b3220; min-height: 18px; }
      .debrief .unlock { margin-top: 8px; padding: 8px 10px; background: #2b2418; color: #f0c35a; font-weight: 800; letter-spacing: .06em; }
      .debrief .unlock[hidden] { display: none; }
      .debrief .newbest { color: #b3261e; font-weight: 900; letter-spacing: .14em; }
      .row { display: flex; gap: 8px; }
      .ghost { margin-top: 6px; padding: 11px 18px; border: 1px solid #2b2418; background: transparent; color: #2b2418; font-size: 13px; font-weight: 800; letter-spacing: .1em; }
      .score { font-size: 26px; font-weight: 800; letter-spacing: .03em; }
      .meta { font-size: 11px; color: #c9cfc2; letter-spacing: .14em; }
      .ammo { left: 50%; bottom: 14px; transform: translateX(-50%); padding: 8px 16px; display: flex; align-items: center; gap: 14px; pointer-events: none; }
      .rounds { display: flex; gap: 4px; }
      .rounds i { width: 6px; height: 22px; border-radius: 3px 3px 1px 1px; background: linear-gradient(#e9c66a 0 32%, #b8913f 32%); box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
      .rounds i.spent { background: rgba(255,255,255,.16); }
      .ammo-text { font-size: 15px; letter-spacing: .06em; min-width: 96px; }
      .weapon { font-size: 10px; color: #c9cfc2; letter-spacing: .18em; }
      .feed { position: absolute; top: 14px; right: 14px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; pointer-events: none; }
      .kill { padding: 5px 10px; background: rgba(8,10,9,.78); border-left: 3px solid #f0c35a; font-size: 12px; white-space: nowrap; text-shadow: 0 1px 2px #000; }
      .kill b { color: #f0c35a; }
      .kill.head b { color: #ff5d4d; }
      .kill.bad { border-left-color: #ff5d4d; }
      .banner { position: absolute; left: 50%; top: 66%; transform: translateX(-50%); text-align: center; pointer-events: none; opacity: 0; white-space: nowrap; text-shadow: 0 2px 12px rgba(0,0,0,.9); }
      .banner b { display: block; font-size: 30px; font-weight: 900; letter-spacing: .2em; }
      .banner span { font-size: 13px; letter-spacing: .14em; color: #f0c35a; }
      .banner.head b { color: #ff5d4d; }
      .banner.warn b { color: #ffb347; }
      .banner.miss b { color: #d9dde3; }
      .banner.warn span, .banner.miss span { color: #f2f4ee; }
      .toast { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); padding: 8px 16px; font-size: 14px; letter-spacing: .12em; pointer-events: none; opacity: 0; white-space: nowrap; }
      .buttons { right: 14px; bottom: 14px; display: flex; gap: 6px; padding: 6px; cursor: default; }
      button { border: 1px solid rgba(255,255,255,.22); border-radius: 3px; padding: 6px 9px; background: rgba(255,255,255,.06); color: #eef2e8;
        font: inherit; font-size: 11px; letter-spacing: .06em; cursor: pointer; }
      button:hover, button:focus-visible { background: rgba(240,195,90,.22); outline: 1px solid #f0c35a; }
      .brief { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; background: radial-gradient(circle, rgba(0,0,0,.55), rgba(0,0,0,.85)); cursor: default; }
      .brief[hidden] { display: none; }
      .dossier { position: relative; max-width: 520px; padding: 28px 30px 24px; color: #2b2418; border-radius: 3px; text-shadow: none;
        background: linear-gradient(180deg, #efe3c4, #e2d2ab); box-shadow: 0 20px 60px rgba(0,0,0,.7), inset 0 0 40px rgba(120,90,40,.25); }
      .dossier .op { color: #7a5b22; padding-right: 130px; }
      .dossier h1 { margin: 6px 0 12px; font: 800 28px/1.1 Georgia, ui-serif, serif; color: #1f1a10; }
      .dossier p { margin: 0 0 10px; font: 500 14px/1.5 Georgia, ui-serif, serif; }
      .stamp { position: absolute; top: 18px; right: 18px; padding: 4px 10px; border: 3px solid #b3261e; color: #b3261e; font-weight: 900;
        letter-spacing: .18em; font-size: 13px; transform: rotate(8deg); opacity: .85; }
      .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 14px; margin: 14px 0; font-size: 12px; color: #3b3220; }
      kbd { display: inline-block; min-width: 18px; padding: 1px 5px; margin-right: 5px; border: 1px solid #8b7a55; border-radius: 3px; background: #f7efda;
        font: 700 11px ui-monospace, monospace; text-align: center; color: #2b2418; }
      .start { margin-top: 6px; padding: 11px 22px; border: 0; background: #2b2418; color: #f0c35a; font-size: 14px; font-weight: 800; letter-spacing: .14em; }
      .start:hover, .start:focus-visible { background: #3d3322; outline: 2px solid #b3261e; }
    </style>
    <div class="surface">
      <canvas></canvas>
      <div class="panel mission">
        <div class="op">OPERATION: PAPER TRAIL</div>
        <div class="case"></div>
        <div class="objective"></div>
        <div class="bar"><i></i></div>
        <div class="line" aria-live="polite"></div>
      </div>
      <div class="feed" aria-live="polite"></div>
      <div class="panel stats"><div class="hearts" aria-label="Lives"></div><div class="score">0</div><div class="meta"></div></div>
      <div class="medals" aria-live="polite"></div>
      <div class="panel ammo"><div class="rounds"></div><div><div class="ammo-text"></div><div class="weapon">BUREAU .338 · BOLT</div></div></div>
      <div class="banner"><b></b><span></span></div>
      <div class="panel toast"></div>
      <div class="panel buttons" aria-label="SniperShot controls">
        <button type="button" class="grid" aria-pressed="true">Grid [G]</button>
        <button type="button" class="sound" aria-pressed="false">Sound [M]</button>
        <button type="button" class="exit">Exit [Esc]</button>
      </div>
      <div class="brief">
        <div class="dossier" role="dialog" aria-label="Mission briefing">
          <div class="stamp">TOP SECRET</div>
          <div class="op">BUREAU OF MISPLACED DOCUMENTS · FILE 07-B</div>
          <h1>Operation: Paper Trail</h1>
          <p>Agent, the Bureau's top-secret punchline has been stolen. The thieves — a squad of over-caffeinated office mercenaries — are dug in across this very webpage. They hide behind paragraphs, peek around images and think the comments section is a fortress.</p>
          <p>You have one rifle, unlimited coffee and no sense of humour about any of this.</p>
          <div class="controls">
            <span><kbd>Right-click</kbd>Scope in / out</span><span><kbd>Click</kbd>Fire</span>
            <span><kbd>Wheel</kbd> / <kbd>+</kbd><kbd>−</kbd>Zoom 2× – 16×</span><span><kbd>Shift</kbd>Hold breath</span>
            <span><kbd>Space</kbd>Scope (keyboard)</span><span><kbd>R</kbd>Reload</span>
            <span><kbd>G</kbd>Grid · <kbd>M</kbd>Sound</span><span><kbd>Esc</kbd>Unscope · Exit</span>
          </div>
          <p style="font-size:12px"><b>Only headshots count.</b> Red markers show where soldiers hide. <b>Don't shoot civilians</b> (white shirts, no helmet). Stop <b>bombers</b> before their timer runs out, take out <b>marksmen</b> before they fire, and hunt the gold-marked <b>HVT</b> for a heart back. Civilians, bombs and marksmen each cost a ♥ — lose them all and the mission is over. Trick shots earn medals; XP ranks you up and unlocks new gear.</p>
          <div class="career brief-career"></div>
          <button type="button" class="start">ACCEPT MISSION</button>
        </div>
      </div>
      <div class="brief debrief" hidden>
        <div class="dossier" role="dialog" aria-label="Mission debrief">
          <div class="stamp">DEBRIEF</div>
          <div class="op">BUREAU OF MISPLACED DOCUMENTS · AFTER-ACTION REPORT</div>
          <h1 class="debrief-title">Mission failed</h1>
          <p class="debrief-line"></p>
          <div class="grid2">
            <div class="stat"><b class="d-score">0</b><span>SCORE</span></div>
            <div class="stat"><b class="d-kills">0</b><span>HEADSHOTS</span></div>
            <div class="stat"><b class="d-acc">0%</b><span>ACCURACY</span></div>
            <div class="stat"><b class="d-long">0 m</b><span>LONGEST</span></div>
            <div class="stat"><b class="d-streak">0</b><span>BEST STREAK</span></div>
            <div class="stat"><b class="d-best">0</b><span>PERSONAL BEST</span></div>
          </div>
          <div class="medal-list"></div>
          <div class="career debrief-career"></div>
          <div class="unlock" hidden></div>
          <div class="row"><button type="button" class="start again">PLAY AGAIN</button><button type="button" class="ghost quit">EXIT</button></div>
        </div>
      </div>
    </div>`;
  host.setAttribute("popover", "manual");
  document.documentElement.appendChild(host);

  const $ = selector => shadow.querySelector(selector);
  const surface = $(".surface");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const ui = {
    case: $(".case"), objective: $(".objective"), bar: $(".bar i"), line: $(".line"), feed: $(".feed"),
    score: $(".score"), meta: $(".meta"), rounds: $(".rounds"), ammo: $(".ammo-text"), banner: $(".banner"),
    toast: $(".toast"), grid: $(".grid"), sound: $(".sound"), brief: $(".brief"), start: $(".start"),
    hearts: $(".hearts"), medals: $(".medals"), briefCareer: $(".brief-career"), debrief: $(".debrief"),
    debriefTitle: $(".debrief-title"), debriefLine: $(".debrief-line"), debriefCareer: $(".debrief-career"),
    unlock: $(".unlock"), medalList: $(".medal-list"), again: $(".again"), quit: $(".quit")
  };

  /* ── State ───────────────────────────────────────────────────────────── */
  let running = true;
  let started = false;
  let grid = false;
  let score = 0;
  let level = 1;
  let kills = 0;
  let streak = 0;
  // Career (persisted in chrome.storage.local) and the perks it unlocks for this run.
  let career = { xp: 0, best: 0, headshots: 0, games: 0 };
  let perks = core.perksFor(0);
  let hearts = perks.hearts;
  let ending = false;           // hearts are gone; the debrief is about to show
  let run = newRunStats();
  let nextHvt = 0;
  let ammo = perks.magazine;
  let reloadUntil = 0;
  let boltUntil = 0;
  let autoReloadAt = 0;
  let missionIndex = 0;
  let progress = 0;
  let enemies = [];
  let bullets = [];
  let effects = [];
  let feedItems = [];
  let covers = [];
  let virtualCovers = [];
  let baseRectCached = new Map();   // cover rects from the last scan (unmagnified), for the mini-map
  let nextScan = 0;
  let nextSpawn = 0;
  let nextId = 1;
  let gameNow = 0;
  let lastReal = performance.now();
  let raf = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  let pointerVisible = false;
  let hipSpread = 0;
  let scoped = false;
  let zoomLevel = 4;
  let aim = { x: innerWidth / 2, y: innerHeight / 2 };
  let zoom = 1;
  let breath = 1;
  let holdingBreath = false;
  let gaspUntil = 0;
  let recoil = 0;
  let shake = 0;
  let rifleKick = 0;
  let hitMarker = null;
  let playerHitAt = -1e9;
  let killcam = null;
  let scopedAt = 0;
  let view = { B: { x: 0, y: 0 }, T: { x: 0, y: 0 }, z: 1 };

  /* ── Temporary page magnification ────────────────────────────────────────
     Scoping scales <html> with a transform (<html> already anchors absolutely
     positioned content, so layout barely changes). The overlay lives in the
     browser top layer, so the transform does not affect it. Original inline
     styles are saved and restored exactly. */
  const body = document.body;
  const rootEl = document.documentElement;
  const saveStyles = (el, props) => props.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
  const restoreStyles = (el, saved) => saved.forEach(([p, v, prio]) => v ? el.style.setProperty(p, v, prio) : el.style.removeProperty(p));
  const savedRoot = saveStyles(rootEl, ["transform", "transform-origin", "will-change", "overflow", "scrollbar-gutter"]);
  let canMagnify = false;
  const rootStyle = getComputedStyle(rootEl);
  const rootMargin = { x: parseFloat(rootStyle.marginLeft) || 0, y: parseFloat(rootStyle.marginTop) || 0 };
  let pageZoomed = false;
  let applied = { tx: 0, ty: 0, z: 1 };

  function applyPageZoom(tx, ty, z) {
    if (!canMagnify) return;
    if (z <= 1.001) { restorePage(); return; }
    if (!pageZoomed) {
      pageZoomed = true;
      const classicScrollbar = innerWidth - rootEl.clientWidth > 0;
      rootEl.style.setProperty("overflow", "hidden", "important");
      if (classicScrollbar) rootEl.style.setProperty("scrollbar-gutter", "stable", "important");
      rootEl.style.setProperty("transform-origin", "0 0", "important");
      rootEl.style.setProperty("will-change", "transform", "important");
    }
    rootEl.style.setProperty("transform", `translate(${tx}px, ${ty}px) scale(${z})`, "important");
    applied = { tx, ty, z };
  }

  function restorePage() {
    if (!pageZoomed) return;
    pageZoomed = false;
    restoreStyles(rootEl, savedRoot);
    applied = { tx: 0, ty: 0, z: 1 };
  }

  // Base coordinates = viewport coordinates of the unmagnified page.
  const toScreen = (x, y) => ({ x: view.B.x + view.T.x + view.z * (x - view.B.x), y: view.B.y + view.T.y + view.z * (y - view.B.y) });
  const toBase = (x, y) => ({ x: view.B.x + (x - view.B.x - view.T.x) / view.z, y: view.B.y + (y - view.B.y - view.T.y) / view.z });
  function rectToScreen(r) {
    if (!r) return null;
    const a = toScreen(r.left, r.top);
    const b = toScreen(r.right, r.bottom);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  /* ── Sound (synthesized) ─────────────────────────────────────────────── */
  let audio = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function audioContext() {
    if (muted) return null;
    if (!audio) {
      try {
        audio = new AudioContext();
        master = audio.createGain();
        master.gain.value = 0.45;
        master.connect(audio.destination);
        noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      } catch (error) {
        return null;
      }
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  }

  function envelope(a, t, peak, decay) {
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(master);
    return g;
  }

  function noise(a, t, decay, peak, type, freq, endFreq, q) {
    const src = a.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = a.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
    if (q) filter.Q.value = q;
    src.connect(filter).connect(envelope(a, t, peak, decay));
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  function tone(a, t, decay, peak, type, freq, endFreq) {
    const osc = a.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
    osc.connect(envelope(a, t, peak, decay));
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  function sfx(kind, delay = 0) {
    const a = audioContext();
    if (!a) return;
    const t = a.currentTime + delay;
    if (kind === "shot") {
      noise(a, t, 0.6, 1, "lowpass", 5000, 300);
      noise(a, t, 0.07, 0.5, "highpass", 3000);
      tone(a, t, 0.35, 0.9, "sine", 95, 38);
      noise(a, t + 0.08, 1.2, 0.12, "lowpass", 900, 200);
    } else if (kind === "bolt") {
      noise(a, t, 0.05, 0.35, "bandpass", 2600, 0, 4);
      noise(a, t + 0.17, 0.06, 0.4, "bandpass", 1900, 0, 4);
      tone(a, t + 0.17, 0.03, 0.15, "square", 220);
    } else if (kind === "reload") {
      [0, 0.45, 1.25, 1.6].forEach((d, i) => noise(a, t + d, 0.06, 0.35, "bandpass", i % 2 ? 1700 : 2500, 0, 4));
    } else if (kind === "dry") {
      noise(a, t, 0.03, 0.3, "bandpass", 3200, 0, 6);
    } else if (kind === "hit") {
      noise(a, t, 0.12, 0.5, "lowpass", 700, 150);
      tone(a, t, 0.06, 0.25, "triangle", 1300);
    } else if (kind === "head") {
      tone(a, t, 0.45, 0.25, "sine", 1850);
      tone(a, t, 0.35, 0.18, "sine", 2790);
      noise(a, t, 0.1, 0.4, "lowpass", 900, 200);
    } else if (kind === "armor") {
      tone(a, t, 0.25, 0.3, "triangle", 900, 600);
      noise(a, t, 0.08, 0.3, "highpass", 2500);
    } else if (kind === "ricochet") {
      tone(a, t, 0.3, 0.12, "sine", 2400, 900);
      noise(a, t, 0.08, 0.25, "bandpass", 1200, 0, 2);
    } else if (kind === "incoming") {
      noise(a, t, 0.25, 0.7, "bandpass", 1500, 500, 2);
      tone(a, t, 0.3, 0.3, "sawtooth", 420, 90);
    } else if (kind === "medal") {
      [0, 0.09, 0.18].forEach((d, i) => tone(a, t + d, 0.25, 0.16, "triangle", [880, 1108, 1318][i]));
    } else if (kind === "beep") {
      tone(a, t, 0.08, 0.14, "square", 1600);
    } else if (kind === "boom") {
      noise(a, t, 1.4, 1, "lowpass", 1800, 60);
      tone(a, t, 0.9, 0.9, "sine", 70, 28);
    } else if (kind === "intel") {
      tone(a, t, 0.12, 0.15, "sine", 660);
      tone(a, t + 0.14, 0.2, 0.15, "sine", 990);
    } else if (kind === "civilian") {
      tone(a, t, 0.35, 0.18, "sawtooth", 900, 1500);
    } else if (kind === "fail") {
      [0, 0.22, 0.44].forEach((d, i) => tone(a, t + d, 0.4, 0.2, "triangle", [392, 330, 262][i]));
    } else if (kind === "zoom") {
      noise(a, t, 0.08, 0.12, "bandpass", 1200, 2200, 3);
    }
  }

  /* ── HUD ─────────────────────────────────────────────────────────────── */
  function currentMission() { return MISSIONS[missionIndex % MISSIONS.length]; }

  function updateHud() {
    const mission = currentMission();
    ui.case.textContent = `CASE ${missionIndex + 1}: ${mission.title}`;
    ui.objective.textContent = `${mission.objective} — ${progress}/${mission.goal}`;
    ui.bar.style.width = `${Math.min(100, progress / mission.goal * 100)}%`;
    ui.line.textContent = mission.line;
    ui.score.textContent = String(score);
    ui.meta.textContent = `LEVEL ${level} · KILLS ${kills}${streak > 1 ? ` · STREAK ×${streak}` : ""}`;
    ui.hearts.textContent = "♥".repeat(Math.max(0, hearts));
    const lost = document.createElement("i");
    lost.textContent = "♥".repeat(Math.max(0, perks.hearts - hearts));
    ui.hearts.append(lost);
    ui.hearts.setAttribute("aria-label", `${hearts} of ${perks.hearts} lives`);
    ui.rounds.replaceChildren(...Array.from({ length: perks.magazine }, (_, i) => {
      const round = document.createElement("i");
      if (i >= ammo) round.className = "spent";
      return round;
    }));
    ui.ammo.textContent = reloadUntil ? "RELOADING…" : `${ammo} / ∞${scoped ? `  ·  ${zoomLevel.toFixed(1)}×` : ""}`;
    ui.grid.textContent = `Grid: ${grid ? "ON" : "OFF"} [G]`;
    ui.grid.setAttribute("aria-pressed", String(grid));
    ui.sound.textContent = `Sound: ${muted ? "OFF" : "ON"} [M]`;
    ui.sound.setAttribute("aria-pressed", String(!muted));
  }

  function banner(title, detail, kind) {
    ui.banner.className = kind ? `banner ${kind}` : "banner";
    ui.banner.firstChild.textContent = title;
    ui.banner.lastChild.textContent = detail;
    ui.banner.animate([
      { opacity: 0, transform: "translateX(-50%) scale(1.35)" },
      { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.12 },
      { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.75 },
      { opacity: 0, transform: "translateX(-50%) translateY(-12px)" }
    ], { duration: 1500, easing: "ease-out" });
  }

  function toast(text, color) {
    ui.toast.textContent = text;
    ui.toast.style.color = color || "#f2f4ee";
    ui.toast.animate([
      { opacity: 0, transform: "translateX(-50%) translateY(8px)" },
      { opacity: 1, transform: "translateX(-50%)", offset: 0.1 },
      { opacity: 1, transform: "translateX(-50%)", offset: 0.8 },
      { opacity: 0, transform: "translateX(-50%)" }
    ], { duration: 2400, easing: "ease-out" });
  }

  function medal(id, extra) {
    const m = MEDALS[id];
    score += m.points;
    run.medals[id] = (run.medals[id] || 0) + 1;
    run.medalCount++;
    const el = document.createElement("div");
    el.className = "medal";
    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = m.icon;
    const text = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = m.name;
    const pts = document.createElement("span");
    pts.textContent = `  +${m.points}${extra ? `  ·  ${extra}` : ""}`;
    text.append(name, pts);
    el.append(icon, text);
    ui.medals.append(el);
    el.animate([
      { opacity: 0, transform: "scale(.4) rotate(-8deg)" },
      { opacity: 1, transform: "scale(1.12)", offset: 0.12 },
      { opacity: 1, transform: "scale(1)", offset: 0.2 },
      { opacity: 1, transform: "scale(1)", offset: 0.85 },
      { opacity: 0, transform: "translateY(-14px)" }
    ], { duration: 2300, easing: "ease-out" }).onfinish = () => el.remove();
    sfx("medal");
    const mission = currentMission();
    if (mission.type === "medal") progress++;
  }

  function newRunStats() {
    return { shots: 0, headshots: 0, longest: 0, bestStreak: 0, medals: {}, medalCount: 0, civilians: 0, startedAt: performance.now() };
  }

  /* ── Career ──────────────────────────────────────────────────────────── */
  const storage = (() => { try { return chrome.storage.local; } catch (error) { return null; } })();

  function loadCareer() {
    if (!storage) { renderBriefCareer(); return; }
    storage.get("ssCareer").then(data => {
      if (data && data.ssCareer) career = { ...career, ...data.ssCareer };
      applyPerks();
      renderBriefCareer();
      updateHud();
    }).catch(() => renderBriefCareer());
  }

  function saveCareer() {
    if (storage) storage.set({ ssCareer: career }).catch(() => {});
  }

  function applyPerks() {
    perks = core.perksFor(core.rankFor(career.xp).index);
    if (!started) { hearts = perks.hearts; ammo = perks.magazine; }
    zoomLevel = Math.min(zoomLevel, perks.zoomMax);
  }

  function careerLine(target) {
    const rank = core.rankFor(career.xp);
    target.replaceChildren();
    const head = document.createElement("div");
    head.append("Rank ", Object.assign(document.createElement("b"), { textContent: `${rank.number} · ${rank.name}` }),
      `  ·  ${career.xp} XP  ·  best score ${career.best}`);
    const bar = document.createElement("div");
    bar.className = "rankbar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.round(rank.progress * 100)}%`;
    bar.append(fill);
    const next = document.createElement("div");
    next.style.marginTop = "5px";
    next.textContent = rank.next ? `${rank.next.xp - career.xp} XP to ${rank.next.name}: unlocks ${rank.next.unlock || "bragging rights"}` : "Maximum rank. The Bureau salutes you.";
    target.append(head, bar, next);
  }

  function renderBriefCareer() { careerLine(ui.briefCareer); }

  // Banks this run into the career once (on game over, or when you leave mid-run).
  function commitCareer() {
    if (run.committed || (!score && !run.shots)) return null;
    run.committed = true;
    const before = core.rankFor(career.xp);
    const gained = Math.round(score / 5);
    const newBest = score > career.best;
    career = {
      ...career,
      xp: career.xp + gained,
      best: Math.max(career.best, score),
      headshots: career.headshots + run.headshots,
      games: career.games + 1
    };
    saveCareer();
    return { gained, newBest, before, after: core.rankFor(career.xp) };
  }

  function gameOver() {
    setScoped(false);
    started = false;
    killcam = null;
    enemies = [];
    bullets = [];
    sfx("fail");
    const result = commitCareer() || { gained: 0, newBest: false, before: core.rankFor(career.xp), after: core.rankFor(career.xp) };
    const secs = Math.round((performance.now() - run.startedAt) / 1000);
    const held = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    ui.debriefTitle.textContent = "Mission failed";
    ui.debriefLine.textContent = `You held the page for ${held} and closed ${missionIndex} case${missionIndex === 1 ? "" : "s"}. ` +
      (run.civilians ? `HR would like a word about the ${run.civilians} spooked civilian${run.civilians === 1 ? "" : "s"}. ` : "") +
      `+${result.gained} XP.`;
    $(".d-score").textContent = String(score);
    $(".d-kills").textContent = String(run.headshots);
    $(".d-acc").textContent = run.shots ? `${Math.round(run.headshots / run.shots * 100)}%` : "—";
    $(".d-long").textContent = run.longest ? `${run.longest} m` : "—";
    $(".d-streak").textContent = String(run.bestStreak);
    $(".d-best").textContent = result.newBest ? "NEW!" : String(career.best);
    $(".d-best").classList.toggle("newbest", result.newBest);
    const earned = Object.entries(run.medals).map(([id, n]) => `${MEDALS[id].icon} ${MEDALS[id].name}${n > 1 ? ` ×${n}` : ""}`);
    ui.medalList.textContent = earned.length ? `Medals: ${earned.join("   ")}` : "No medals this time — try a no-scope, a quickscope or a collateral.";
    careerLine(ui.debriefCareer);
    const rankedUp = result.after.index > result.before.index;
    ui.unlock.hidden = !rankedUp;
    if (rankedUp) {
      const unlocks = core.RANKS.slice(result.before.index + 1, result.after.index + 1).map(r => r.unlock).filter(Boolean);
      ui.unlock.textContent = `RANK UP: ${result.after.name}!${unlocks.length ? ` Unlocked: ${unlocks.join(", ")}.` : ""}`;
    }
    ui.debrief.hidden = false;
    ui.again.focus();
  }

  function startRun() {
    applyPerks();
    score = 0;
    level = 1;
    kills = 0;
    streak = 0;
    missionIndex = 0;
    progress = 0;
    hearts = perks.hearts;
    ammo = perks.magazine;
    reloadUntil = 0;
    boltUntil = 0;
    autoReloadAt = 0;
    enemies = [];
    bullets = [];
    effects = [];
    killcam = null;
    breath = 1;
    ending = false;
    run = newRunStats();
    ui.brief.hidden = true;
    ui.debrief.hidden = true;
    ui.medals.replaceChildren();
    started = true;
    nextSpawn = performance.now() + 600;
    nextHvt = performance.now() + rand(35000, 50000);
    audioContext();
    updateHud();
  }

  function addFeed(parts, className) {
    const item = document.createElement("div");
    item.className = `kill ${className || ""}`;
    for (const [text, bold] of parts) {
      const node = bold ? document.createElement("b") : document.createTextNode(text);
      if (bold) node.textContent = text;
      item.append(node);
    }
    ui.feed.prepend(item);
    feedItems.push({ el: item, until: performance.now() + 5000 });
    while (ui.feed.children.length > 5) ui.feed.lastChild.remove();
  }

  /* ── Cover and spawning ──────────────────────────────────────────────── */
  function isPinned(el) {
    for (let n = el; n && n !== body; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      if (position === "fixed" || position === "sticky") return true;
    }
    return false;
  }

  function scanCovers(now) {
    nextScan = now + 1500;
    const found = [];
    const cached = new Map();
    const nodes = body ? body.querySelectorAll(COVER_SELECTOR) : [];
    for (let i = 0; i < nodes.length && i < 4000 && found.length < 60; i++) {
      const el = nodes[i];
      if (host.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 50 || r.height < 22 || r.width > width * 0.85 || r.height > height * 0.7) continue;
      if (r.left < 30 || r.right > width - 30 || r.top < 70 || r.bottom > height - 20) continue;
      const style = getComputedStyle(el);
      if (style.visibility !== "visible" || Number(style.opacity) < 0.2 || isPinned(el)) continue;
      found.push(el);
      cached.set(el, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    covers = found;
    baseRectCached = cached;
    if (!covers.length && !virtualCovers.length) {
      // A blank page: bring sandbags.
      const w = Math.min(170, width * 0.22);
      virtualCovers = [0.22, 0.5, 0.78].map((fx, i) => ({
        left: width * fx - w / 2, right: width * fx + w / 2, top: height * (0.45 + (i % 2) * 0.12), bottom: height * (0.45 + (i % 2) * 0.12) + 64
      }));
    }
  }

  function baseRect(el) {
    if (!el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const a = toBase(r.left, r.top);
    const b = toBase(r.right, r.bottom);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function chooseType() {
    const mission = currentMission();
    const elapsed = (performance.now() - run.startedAt) / 1000;
    const bombing = enemies.some(e => e.type.bomb && e.state !== "dying");
    if (!bombing && (level >= 2 || mission.type === "bomb") && Math.random() < (mission.type === "bomb" ? 0.4 : 0.14)) return TYPES.bomber;
    if (elapsed > 15 && Math.random() < 0.16) return TYPES.civilian;
    if ((level >= 2 || mission.type === "marksman") && Math.random() < (mission.type === "marksman" ? 0.45 : 0.2)) return TYPES.marksman;
    if (level >= 2 && Math.random() < 0.25) return TYPES.heavy;
    return Math.random() < 0.65 ? TYPES.rifleman : TYPES.scout;
  }

  function spawn(forced) {
    const busy = new Set(enemies.map(e => e.el || e.virtual));
    const options = covers.filter(el => el.isConnected);
    const free = options.filter(el => !busy.has(el));
    const list = free.length ? free : options;
    let el = list.length ? pick(list) : null;
    let virtual = null;
    if (!el) {
      if (!virtualCovers.length) return null;
      virtual = pick(virtualCovers);
    }
    const rect = virtual || baseRect(el);
    if (!rect) return null;
    const type = forced || chooseType();
    const dist = Math.round(type.hvt ? rand(420, 650) : rand(160, 650));
    const mission = currentMission();
    const runnerChance = mission.type === "runner" ? 0.35 : level >= 2 ? 0.1 : 0;
    let size = (1.75 - (dist - 160) / 490 * 0.8) * (type === TYPES.heavy ? 1.15 : 1);
    const h = rect.bottom - rect.top;
    const sideScale = Math.min(size, h / 42);
    const e = {
      id: nextId++, el, virtual, type, dist, name: type.hvt ? pick(HVT_NAMES) : pick(NAMES), exposure: 0,
      peeks: type.bomb ? 1 : type.hvt ? 3 : 2 + Math.floor(Math.random() * 2),
      state: "in", t0: gameNow, hold: rand(...type.hold), fx: rand(0.2, 0.8), facing: Math.random() < 0.5 ? -1 : 1,
      aim: 0, phase: Math.random() * TAU, shape: null, cover: rect
    };
    if (!type.shoots && !type.bomb && !type.hvt && Math.random() < runnerChance) {
      e.kind = "runner";
      e.scale = Math.max(0.9, size * 0.9);
      e.facing = Math.random() < 0.5 ? -1 : 1;
      e.x = e.facing > 0 ? -40 : width + 40;
      e.vx = e.facing * rand(55, 80);
      e.exposure = 1;
    } else if (sideScale >= 0.85 && Math.random() < 0.65) {
      e.kind = Math.random() < 0.5 ? "left" : "right";
      e.scale = sideScale;
      e.facing = e.kind === "left" ? -1 : 1;
      e.canSide = true;
    } else {
      if (rect.top < 50) return null;
      e.kind = "top";
      e.scale = size;
    }
    enemies.push(e);
    return e;
  }

  function bombLeft(e) {
    return e.state === "hold" ? Math.max(0, e.hold - (gameNow - e.t0) / 1000) : BOMB_TIME;
  }

  function spawnHvt() {
    const e = spawn(TYPES.hvt);
    if (!e) return false;
    toast(`INTEL: HVT ${e.name} SPOTTED — RED BERET · +1000 & ♥`, "#ffd27a");
    sfx("intel");
    return true;
  }

  function loseHeart(reason) {
    if (ending) return;
    hearts--;
    playerHitAt = performance.now();
    shake = 18;
    ui.hearts.classList.remove("hurt");
    void ui.hearts.offsetWidth;
    ui.hearts.classList.add("hurt");
    toast(`${reason}  −♥`, "#ff8a7a");
    updateHud();
    if (hearts <= 0) {
      ending = true;
      setTimeout(() => running && gameOver(), 1300);
    }
  }

  /* ── Soldier geometry (base coordinates) ─────────────────────────────── */
  function baseShape(e) {
    const s = e.scale;
    const cover = e.cover;
    const ease = 1 - Math.pow(1 - e.exposure, 3);
    let px;
    let py;
    let angle = 0;
    let rect = null;
    let ground = Infinity;
    if (e.kind === "runner") {
      if (!cover) return null;
      px = e.x;
      py = cover.bottom;
    } else {
      if (!cover) return null;
      rect = cover;
      ground = cover.bottom;
      if (e.kind === "left") { px = cover.left + 11 * s - 16 * s * ease; py = cover.bottom; angle = -0.3 * ease; }
      else if (e.kind === "right") { px = cover.right - 11 * s + 16 * s * ease; py = cover.bottom; angle = 0.3 * ease; }
      else { px = cover.left + e.fx * (cover.right - cover.left); py = cover.top + 41 * s - 23 * s * ease; }
    }
    if (e.state === "dying") {
      const k = Math.min(1, (gameNow - e.t0) / 650);
      const d = k * k;
      if (e.kind === "top") { py += 46 * s * d; angle += e.fall * 0.5 * d; }
      else if (e.kind === "runner") { angle += e.fall * 1.45 * d; }
      else { angle += e.fall * 1.25 * d; py += 4 * s * d; }
    }
    return { px, py, angle, scale: s, facing: e.facing, cover: rect, ground };
  }

  function screenShape(e) {
    const b = baseShape(e);
    if (!b) return null;
    const p = toScreen(b.px, b.py);
    return {
      px: p.x, py: p.y, angle: b.angle, scale: b.scale * view.z, facing: b.facing,
      cover: rectToScreen(b.cover), ground: b.ground === Infinity ? Infinity : toScreen(0, b.ground).y
    };
  }

  /* ── Updating ────────────────────────────────────────────────────────── */
  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.pinned) continue;
      if (!e.cover && e.state !== "dying") { enemies.splice(i, 1); continue; }
      const age = (gameNow - e.t0) / 1000;
      if (e.state === "dying") {
        if (age >= 1.1) enemies.splice(i, 1);
        continue;
      }
      if (e.kind === "runner") {
        e.x += e.vx * dt;
        e.phase += dt * 15;
        if (e.x < -80 || e.x > width + 80) enemies.splice(i, 1);
        continue;
      }
      if (e.state === "in") {
        e.exposure = Math.min(1, age / 0.6);
        if (age >= 0.6) { e.state = "hold"; e.t0 = gameNow; }
      } else if (e.state === "hold") {
        e.exposure = 1;
        if (e.type.shoots) {
          e.aim = Math.max(0, Math.min(1, (age - MARKSMAN_AIM_START) / (MARKSMAN_FIRES_AT - MARKSMAN_AIM_START)));
          if (age >= MARKSMAN_FIRES_AT) { marksmanFires(e); e.state = "out"; e.t0 = gameNow; }
        } else if (e.type.bomb) {
          const left = bombLeft(e);
          const tick = left > 3 ? Math.floor(left) : 100 + Math.floor(left * 4);   // faster beeps in the last 3 s
          if (tick !== e.tick) { e.tick = tick; sfx("beep"); }
          if (left <= 0) { explode(e); enemies.splice(i, 1); continue; }
        } else if (age >= e.hold) {
          e.state = "out";
          e.t0 = gameNow;
        }
      } else if (e.state === "out") {
        const dur = e.ducking ? 0.2 : 0.5;
        e.exposure = Math.min(e.exposure, Math.max(0, 1 - age / dur));
        e.aim = Math.max(0, e.aim - dt * 3);
        if (age >= dur) {
          e.ducking = false;
          e.peeks--;
          if (e.peeks > 0) { e.state = "wait"; e.t0 = gameNow; e.wait = rand(1.2, 2.4); }
          else {
            if (e.type.hvt) toast(`HVT ${e.name} ESCAPED`, "#ffb347");
            enemies.splice(i, 1);
          }
        }
      } else if (e.state === "wait") {
        e.exposure = 0;
        if (age >= e.wait) {
          if (e.canSide && Math.random() < 0.5) {
            e.kind = e.kind === "left" ? "right" : "left";
            e.facing = e.kind === "left" ? -1 : 1;
          }
          e.state = "in";
          e.t0 = gameNow;
          e.hold = rand(...e.type.hold);
        }
      }
    }
  }

  function marksmanFires(e) {
    const shape = e.shape;
    breakStreak();
    sfx("incoming");
    if (shape) {
      const muzzle = localToScreen(shape, 21, -28);
      effects.push({ kind: "incoming", x: muzzle.x, y: muzzle.y, born: performance.now() });
    }
    addFeed([[e.name, true], [" tagged ", false], ["YOU", true]], "bad");
    loseHeart("TAGGED BY A MARKSMAN");
  }

  function explode(e) {
    const now = performance.now();
    sfx("boom");
    const c = rectToScreen(e.cover);
    if (c) effects.push({ kind: "boom", x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2, r: Math.max(60, (c.right - c.left) * 0.6), born: now });
    addFeed([[e.name, true], ["  planted a bomb", false]], "bad");
    breakStreak();
    loseHeart("BOMB WENT OFF");
  }

  function localToScreen(shape, lx, ly) {
    const x = lx * shape.scale * shape.facing;
    const y = ly * shape.scale;
    const c = Math.cos(shape.angle);
    const s = Math.sin(shape.angle);
    return { x: shape.px + x * c - y * s, y: shape.py + x * s + y * c };
  }

  /* ── Shooting ────────────────────────────────────────────────────────── */
  function scopeBlend() { return Math.max(0, Math.min(1, (zoom - 1) / 0.8)); }

  function setScoped(value) {
    if (!started || value === scoped) return;
    if (value && reloadUntil) return;
    scoped = value;
    if (scoped) {
      // Aim starts where the hip crosshair was; with the pointer locked, mouse motion pans the scope.
      aim = { x: pointer.x, y: pointer.y };
      scopedAt = performance.now();
      try {
        const request = canvas.requestPointerLock();
        if (request && request.catch) request.catch(() => {});
      } catch (error) { /* panning falls back to the visible cursor */ }
    } else if (shadow.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    sfx("zoom");
    updateHud();
  }

  function fire() {
    const now = performance.now();
    if (!started || ending || killcam || reloadUntil || now < boltUntil) return;
    if (!ammo) { sfx("dry"); reload(); return; }
    ammo--;
    run.shots++;
    sfx("shot");
    const isScoped = scopeBlend() > 0.95;
    let point;
    if (isScoped) {
      point = { x: width / 2, y: height / 2 };
    } else {
      const a = Math.random() * TAU;
      const r = hipSpread * Math.sqrt(Math.random());
      point = { x: pointer.x + Math.cos(a) * r, y: pointer.y + Math.sin(a) * r };
    }
    let target = null;
    let part = null;
    const ordered = enemies.filter(e => e.shape && e.state !== "dying").sort((a, b) => b.shape.scale - a.shape.scale);
    for (const e of ordered) {
      part = core.hitTest(e.shape, point.x, point.y);
      if (part) { target = e; break; }
    }
    const coverHit = !target && enemies.some(e => e.shape && e.shape.cover &&
      point.x >= e.shape.cover.left && point.x < e.shape.cover.right && point.y >= e.shape.cover.top && point.y < e.shape.cover.bottom);
    // One round can pass through several heads lined up behind each other.
    const extras = part === "head" ? ordered.filter(e => e !== target && core.hitTest(e.shape, point.x, point.y) === "head") : [];
    const near = target ? null : nearestHead(point);
    for (const e of [target, ...extras]) if (e) e.pinned = true;
    const dist = target ? target.dist : 300;
    // Straight flight: up the middle of the scope into the reticle, or from the muzzle in hip view.
    const from = isScoped ? { x: width / 2, y: height / 2 + lensRadius(1) } : rifleMuzzle();
    const cam = isScoped && part === "head" && (streak + 1) % CAM_EVERY === 0;
    const duration = isScoped ? (cam ? 1000 : 160 + dist * 0.3) : 90;
    const quick = isScoped && now - scopedAt < 1000;
    const bullet = { born: now, duration, from, to: toBase(point.x, point.y), target, part, extras, coverHit, near, scoped: isScoped, quick, cam };
    bullets.push(bullet);
    if (cam) killcam = { bullet, start: now, impactAt: now + duration, end: now + duration + 900, target: bullet.to };
    recoil = isScoped ? 30 : 0;
    rifleKick = 1;
    effects.push({ kind: "flash", born: now, scoped: isScoped, x: from.x, y: from.y });
    if (ammo > 0) {
      boltUntil = now + perks.bolt;
      sfx("bolt", 0.4);
    } else {
      boltUntil = now + 500;
      autoReloadAt = now + 500;
    }
    updateHud();
  }

  // The exposed head nearest a missed shot, to say which way the round went.
  function nearestHead(point) {
    let best = null;
    for (const e of enemies) {
      if (!e.shape || e.state === "dying" || e.exposure < 0.5) continue;
      const head = localToScreen(e.shape, 0, -34.5);
      const d = Math.hypot(point.x - head.x, point.y - head.y);
      if (d < 6 * e.shape.scale * 8 && (!best || d < best.d)) best = { d, dx: point.x - head.x, dy: point.y - head.y, scale: e.shape.scale };
    }
    return best;
  }

  function missHint(near) {
    if (!near) return "No target there — wait for the peek";
    const parts = [];
    if (Math.abs(near.dy) > near.scale * 3) parts.push(near.dy < 0 ? "high" : "low");
    if (Math.abs(near.dx) > near.scale * 3) parts.push(near.dx < 0 ? "left" : "right");
    return parts.length ? `Just ${parts.join(" and ")} of the head` : "A hair off the head";
  }

  function breakStreak() {
    streak = 0;
    if (currentMission().type === "streak") progress = 0;
  }

  function resolveBullet(b) {
    const now = performance.now();
    const p = toScreen(b.to.x, b.to.y);
    const e = b.target;
    for (const x of [e, ...(b.extras || [])]) if (x) x.pinned = false;
    if (e && e.state !== "dying" && enemies.includes(e)) {
      if (e.type.civilian) { hitCivilian(e, p, now); return; }
      if (b.part === "head") {
        const extras = b.extras.filter(x => x.state !== "dying" && enemies.includes(x));
        kill(e, p, now, b);
        for (const x of extras) {
          if (x.type.civilian) hitCivilian(x, p, now);
          else kill(x, p, now, b);
        }
        if (extras.some(x => !x.type.civilian)) { medal("collateral", "one round"); updateHud(); }
        return;
      }
      // Body shot: not good enough. He flinches and ducks back behind cover, then peeks again.
      sfx("hit");
      effects.push({ kind: "puff", x: p.x, y: p.y, born: now, big: false });
      hitMarker = { x: p.x, y: p.y, born: now, head: false };
      if (e.kind !== "runner" && !e.type.bomb) {
        e.state = "out";
        e.ducking = true;
        e.t0 = gameNow;
        e.peeks++;
        e.aim = 0;
      }
      breakStreak();
      banner("HEADSHOT MISSED", e.type.bomb ? "Body shot — the timer's still running!" : "Body shot — he ducked back. Aim for the helmet.", "warn");
      updateHud();
      return;
    }
    effects.push({ kind: "puff", x: p.x, y: p.y, born: now, big: b.coverHit });
    if (b.coverHit) sfx("ricochet");
    breakStreak();
    banner("MISSED", b.coverHit && !b.near ? "Hit the cover — wait for him to peek" : missHint(b.near), "miss");
    updateHud();
  }

  // Civilians aren't hurt: they shriek, drop their coffee and run. It still costs you.
  function hitCivilian(e, p, now) {
    sfx("civilian");
    hitMarker = { x: p.x, y: p.y, born: now, head: false };
    effects.push({ kind: "puff", x: p.x, y: p.y, born: now, big: false });
    e.state = "out";
    e.ducking = true;
    e.t0 = gameNow;
    e.peeks = 0;
    run.civilians++;
    score = Math.max(0, score - 250);
    breakStreak();
    addFeed([["YOU", true], ["  spooked civilian ", false], [e.name, true], ["  −250", false]], "bad");
    banner("CIVILIAN!", "White shirt, no helmet — check before you squeeze", "warn");
    loseHeart("CIVILIAN HIT");
  }

  function kill(e, p, now, b) {
    e.state = "dying";
    e.t0 = gameNow;
    e.fall = e.kind === "left" ? -1 : e.kind === "right" ? 1 : -e.facing;
    e.headshot = true;
    sfx("head");
    hitMarker = { x: p.x, y: p.y, born: now, head: true };
    effects.push({ kind: "puff", x: p.x, y: p.y, born: now, big: true });
    if (e.shape) {
      const h = localToScreen(e.shape, 0, -36);
      effects.push({ kind: "helmet", x: h.x, y: h.y, vx: e.fall * rand(80, 160), vy: -rand(260, 360), rot: 0, vr: e.fall * rand(8, 14),
        scale: e.shape.scale, color: e.type.helmet, beret: e.type.beret, born: now, last: now });
    }
    streak++;
    kills++;
    run.headshots++;
    run.longest = Math.max(run.longest, e.dist);
    run.bestStreak = Math.max(run.bestStreak, streak);
    const multiplier = 1 + Math.min(streak - 1, 4) * 0.25;
    const points = Math.round((200 + Math.round(e.dist / 5)) * multiplier);
    score += points;
    addFeed([["YOU", true], ["  ⌖  ", false], [e.name, true], [`  HEADSHOT · ${e.dist} m`, false]], "head");
    const toCam = CAM_EVERY - (streak % CAM_EVERY);
    const camNote = streak % CAM_EVERY === 0 ? "BULLET CAM" : `${toCam} more for bullet cam`;
    banner("HEADSHOT", `+${points}  ·  ${e.dist} m  ·  ${streak > 1 ? `STREAK ×${streak}  ·  ` : ""}${camNote}`, "head");
    // Medals for style.
    if (b && !b.scoped && e.dist >= 350) medal("noscope", `${e.dist} m`);
    if (b && b.quick) medal("quickscope");
    if (e.dist >= 560) medal("longshot", `${e.dist} m`);
    if (e.type.shoots && e.aim > 0.75) medal("closecall");
    if (e.type.bomb) {
      const left = bombLeft(e);
      if (left < 2.5) medal("lastsecond", `${left.toFixed(1)} s left`);
      else medal("defused");
    }
    if (e.type.hvt) {
      medal("hvt", e.name);
      if (hearts < perks.hearts) { hearts++; toast("HVT DOWN — ♥ RESTORED", "#ffd27a"); }
    }
    if (streak === 5) medal("streak5", "5 in a row");
    if (streak === 10) medal("streak10", "10 in a row");
    if (streak === 15) medal("streak15", "15 in a row");
    registerKill({ marksman: e.type === TYPES.marksman, runner: e.kind === "runner", long: e.dist >= 450, bomb: !!e.type.bomb });
  }

  function registerKill(info) {
    const mission = currentMission();
    if (mission.type === "streak") progress = Math.min(streak, mission.goal);
    else if (mission.type === "kill" ||
      (mission.type === "marksman" && info.marksman) ||
      (mission.type === "runner" && info.runner) ||
      (mission.type === "long" && info.long) ||
      (mission.type === "bomb" && info.bomb)) progress++;
    if (progress >= mission.goal) {
      score += 300;
      toast(`CASE CLOSED: ${mission.title.toUpperCase()}  +300`, "#f0c35a");
      missionIndex++;
      progress = 0;
    }
    const newLevel = core.levelForScore(score);
    if (newLevel > level) {
      level = newLevel;
      const line = LEVEL_LINES[Math.min(level, LEVEL_LINES.length - 1)] || "They keep coming. Of course they do.";
      setTimeout(() => running && toast(`THREAT LEVEL ${level} — ${line}`, "#ffd27a"), 1600);
    }
    updateHud();
  }

  // Returns false while it can't start yet (for example during the bullet cam); callers retry.
  function reload() {
    if (!started || ammo === perks.magazine) return true;
    if (reloadUntil) return true;
    if (killcam) return false;
    reloadUntil = performance.now() + perks.reload;
    setScoped(false);
    sfx("reload");
    updateHud();
    return true;
  }

  /* ── Drawing ─────────────────────────────────────────────────────────── */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  // The BlastBlastBlast soldier, with feet at (0, 0) facing +x; extra detail shows when magnified.
  function drawSoldier(e, shape) {
    const civ = !!e.type.civilian;
    const bomber = !!e.type.bomb;
    const skin = civ ? "#e0b48a" : "#d2a877";
    const boot = "#23291a";
    const dark = "#2c3522";
    const isRunning = e.kind === "runner" && e.state !== "dying";
    const dead = e.state === "dying";
    const legSwing = isRunning ? Math.sin(e.phase) * 5 : 0;
    const bob = isRunning ? Math.abs(Math.cos(e.phase)) * 1.4 : 0;
    ctx.save();
    ctx.translate(shape.px, shape.py);
    ctx.rotate(shape.angle);
    ctx.scale(shape.scale * shape.facing, shape.scale);
    ctx.translate(0, -bob);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // legs + boots
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4.2;
    const lx = -3 + legSwing;
    const rx = 3 - legSwing;
    ctx.beginPath(); ctx.moveTo(-1.5, -13); ctx.lineTo(lx, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.5, -13); ctx.lineTo(rx, -1); ctx.stroke();
    ctx.fillStyle = boot;
    roundRect(lx - 3, -2, 6, 3, 1.2); ctx.fill();
    roundRect(rx - 3, -2, 6, 3, 1.2); ctx.fill();
    // backpack (a bomber carries a red charge instead)
    if (!civ) {
      ctx.fillStyle = bomber ? "#a3271d" : "#3a3022";
      roundRect(bomber ? -11 : -9.5, -26, bomber ? 6 : 4.5, 11, 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(bomber ? -11 : -9.5, -21, bomber ? 6 : 4.5, 1);
    }
    // torso: camo + tactical vest, or a civilian's shirt and tie
    ctx.fillStyle = e.type.color;
    roundRect(-6.5, -29, 13, 17, 3.5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.07)";
    roundRect(-6.5, -29, 5, 17, 3.5); ctx.fill();
    if (civ) {
      ctx.fillStyle = "rgba(0,0,0,.08)";
      roundRect(1.5, -29, 5, 17, 3.5); ctx.fill();
      ctx.fillStyle = "#b3261e";
      ctx.beginPath(); ctx.moveTo(1, -28.5); ctx.lineTo(2.6, -28.5); ctx.lineTo(3.2, -18); ctx.lineTo(1.8, -16.5); ctx.lineTo(0.6, -18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#3b4048";
      ctx.fillRect(-6.5, -14.5, 13, 2.4);
    } else {
      ctx.fillStyle = "rgba(0,0,0,.2)";
      roundRect(-5, -26, 10, 9, 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.28)";
      for (let i = 0; i < 3; i++) { roundRect(-4.4 + i * 3.2, -22, 2.4, 4, 0.6); ctx.fill(); }
      ctx.fillStyle = "#caa14a";
      ctx.fillRect(-6.5, -14.5, 13, 2.4);
    }
    if (e.type === TYPES.heavy) {
      ctx.fillStyle = "#1d2328";
      roundRect(-7, -28, 14, 12, 3); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(-6, -27, 12, 1);
    }
    // arms + rifle (civilians hold a coffee; bombers wire up a charge)
    ctx.strokeStyle = e.type.color;
    ctx.lineWidth = 3.6;
    if (civ) {
      ctx.beginPath(); ctx.moveTo(2, -25); ctx.lineTo(7, -20); ctx.stroke();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(7.5, -20, 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f4f1ea";
      roundRect(7, -25, 4.2, 5, 0.8); ctx.fill();
      ctx.strokeStyle = "#f4f1ea";
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(11.4, -22.6, 1.3, -1.4, 1.4); ctx.stroke();
      ctx.fillStyle = "#7a4a26";
      ctx.fillRect(7.4, -24.6, 3.4, 0.8);
    } else if (bomber && !dead) {
      ctx.beginPath(); ctx.moveTo(2, -25); ctx.lineTo(9, -15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -25); ctx.lineTo(6, -14); ctx.stroke();
      ctx.fillStyle = "#2a2a2a";
      roundRect(5, -13, 10, 7, 1.2); ctx.fill();
      ctx.fillStyle = "#a3271d";
      for (let i = 0; i < 3; i++) { roundRect(5.6 + i * 3.1, -12.4, 2.6, 5.8, 1); ctx.fill(); }
      const blink = Math.sin(gameNow / (bombLeft(e) < 3 ? 60 : 200)) > 0;
      ctx.fillStyle = blink ? "#ff3b2f" : "#5a1410";
      ctx.beginPath(); ctx.arc(10, -14, 1.1, 0, TAU); ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(9, -15, 1.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -14, 1.5, 0, TAU); ctx.fill();
    } else if (dead) {
      ctx.beginPath(); ctx.moveTo(3, -25); ctx.lineTo(12, -23); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -25); ctx.lineTo(-12, -21); ctx.stroke();
    } else {
      const aiming = !isRunning;
      const ry = aiming ? -27.5 : -25;
      ctx.beginPath(); ctx.moveTo(-2, -26); ctx.lineTo(5, ry + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -25); ctx.lineTo(10, ry + 0.5); ctx.stroke();
      ctx.fillStyle = "#1c2026";
      roundRect(-3, ry - 1.4, 15, 3, 1); ctx.fill();           // stock + receiver
      ctx.fillRect(11, ry - 0.7, 9, 1.4);                        // barrel
      roundRect(19.5, ry - 1.1, 2.6, 2.2, 0.6); ctx.fill();     // muzzle
      roundRect(5, ry + 1, 2.4, 4, 0.6); ctx.fill();            // magazine
      ctx.fillStyle = "#11141a";
      roundRect(3.5, ry - 3.6, 8, 2, 1); ctx.fill();            // scope
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(5, ry + 2, 1.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(10, ry + 0.5, 1.5, 0, TAU); ctx.fill();
    }
    // neck + head
    ctx.fillStyle = skin;
    ctx.fillRect(-1.6, -31, 3.2, 3);
    ctx.beginPath(); ctx.arc(0, -34, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.arc(-1, -33.5, 4.2, Math.PI * 0.6, Math.PI * 1.4); ctx.fill();
    ctx.fillStyle = "#c79a67";
    ctx.beginPath(); ctx.arc(-1.2, -33.8, 1, 0, TAU); ctx.fill();      // ear
    if (dead) {
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(1.6, -35.4); ctx.lineTo(3.2, -33.8); ctx.moveTo(3.2, -35.4); ctx.lineTo(1.6, -33.8);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#1d150d";
      ctx.beginPath(); ctx.arc(2.6, -34.6, 0.6, 0, TAU); ctx.fill();   // eye
      ctx.strokeStyle = "rgba(60,35,20,.6)";
      ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(2.2, -32.3); ctx.lineTo(3.6, -32.4); ctx.stroke();
    }
    if (e.type.hvt && !dead) {
      ctx.fillStyle = "#0b0b0d";
      roundRect(0.6, -35.8, 4.4, 1.8, 0.6); ctx.fill();          // sunglasses
    }
    // headgear: helmet, the HVT's beret, or a civilian's hair (knocked off by headshots)
    if (civ) {
      ctx.fillStyle = "#4a3020";
      ctx.beginPath(); ctx.arc(-0.4, -35.4, 4.9, Math.PI * 0.95, Math.PI * 0.05 + TAU); ctx.fill();
    } else if (!(dead && e.headshot)) {
      if (e.type.beret) drawBeret(e.type.helmet); else drawHelmet(e.type.helmet);
    }
    ctx.restore();
    if (e.type.shoots && e.aim > 0 && !dead) drawGlint(localToScreen(shape, 11.5, -30.1), e.aim, shape.scale);
  }

  function drawHelmet(color, x = 0, y = -35) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5.4, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 6, y - 0.4, 12, 2);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.beginPath(); ctx.arc(x - 1.5, y - 2, 2, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 0.35;
    ctx.beginPath(); ctx.moveTo(x + 4, y + 1.6); ctx.lineTo(x + 2.2, y + 4.6); ctx.stroke();
  }

  function drawBeret(color, x = 0, y = -35) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x - 0.6, y - 1, 5.8, 2.6, -0.12, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 2.4, y - 1.6, 3.6, 2.2, -0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f0c35a";
    ctx.beginPath(); ctx.arc(x + 2.6, y - 1.6, 0.9, 0, TAU); ctx.fill();    // badge
  }

  function drawGlint(p, strength, scale) {
    const size = (6 + scale * 6) * strength;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * strength})`);
    g.addColorStop(0.3, `rgba(255,240,200,${0.6 * strength})`);
    g.addColorStop(1, "rgba(255,220,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,240,${0.8 * strength})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x - size * 1.8, p.y); ctx.lineTo(p.x + size * 1.8, p.y);
    ctx.moveTo(p.x, p.y - size * 1.1); ctx.lineTo(p.x, p.y + size * 1.1);
    ctx.stroke();
    ctx.restore();
  }

  function drawSandbags(r) {
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    const bagW = w / 4;
    const bagH = h / 3;
    for (let row = 0; row < 3; row++) {
      const offset = row % 2 ? bagW / 2 : 0;
      for (let i = -1; i < 5; i++) {
        const x = r.left + offset + i * bagW;
        if (x < r.left - 1 || x + bagW > r.right + 1) continue;
        const y = r.bottom - (row + 1) * bagH;
        ctx.fillStyle = row % 2 ? "#a08a5c" : "#b09a68";
        roundRect(x + 1, y + 1, bagW - 2, bagH - 1, bagH / 2.3); ctx.fill();
        ctx.strokeStyle = "rgba(60,45,20,.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawGrid() {
    const step = 96;
    ctx.save();
    ctx.strokeStyle = "rgba(255,70,50,.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < width; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); }
    for (let y = step; y < height; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); }
    ctx.stroke();
    ctx.fillStyle = "rgba(200,40,30,.55)";
    ctx.font = "700 10px ui-monospace, monospace";
    for (let x = 0, c = 0; x < width; x += step, c++) {
      for (let y = 0, r = 1; y < height; y += step, r++) {
        if ((c + r) % 2) continue;
        ctx.fillText(`${String.fromCharCode(65 + (c % 26))}${r}`, x + 4, y + 12);
      }
    }
    ctx.restore();
  }

  function rifleMuzzle() {
    const bx = width - 70;
    const by = height + 40;
    const angle = Math.atan2(pointer.y - by, pointer.x - bx);
    const len = 300 - rifleKick * 30;
    return { x: bx + Math.cos(angle) * len, y: by + Math.sin(angle) * len };
  }

  function drawRifle(alpha) {
    const bx = width - 70;
    const by = height + 40;
    const angle = Math.atan2(pointer.y - by, pointer.x - bx);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bx, by);
    ctx.rotate(angle);
    ctx.translate(-rifleKick * 30 + (1 - alpha) * -120, 0);
    const metal = ctx.createLinearGradient(0, -20, 0, 20);
    metal.addColorStop(0, "#3a3d40");
    metal.addColorStop(0.5, "#1b1d1f");
    metal.addColorStop(1, "#0c0d0e");
    ctx.fillStyle = "#4a3b28";
    roundRect(-200, -16, 210, 34, 8); ctx.fill();            // stock
    ctx.fillStyle = metal;
    roundRect(0, -13, 140, 26, 5); ctx.fill();               // receiver
    roundRect(130, -6, 150, 12, 3); ctx.fill();              // barrel
    roundRect(276, -9, 26, 18, 3); ctx.fill();               // muzzle brake
    ctx.fillStyle = "#101112";
    roundRect(20, -36, 120, 18, 9); ctx.fill();              // scope
    roundRect(10, -40, 22, 26, 6); ctx.fill();
    roundRect(126, -42, 26, 30, 6); ctx.fill();
    ctx.fillStyle = "rgba(120,170,200,.35)";
    ctx.beginPath(); ctx.ellipse(152, -27, 3, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0a0b0c";
    roundRect(56, 13, 18, 30, 3); ctx.fill();                // magazine
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(0, -12, 280, 3);
    ctx.restore();
  }

  function drawHipCrosshair(alpha) {
    if (!pointerVisible) return;
    const { x, y } = pointer;
    const gap = 6 + hipSpread;
    const steady = hipSpread < 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [color, w] of [["rgba(0,0,0,.7)", 4], [steady ? "#7dff8a" : "#ffffff", 2]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x - gap - 12, y); ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + 12, y);
      ctx.moveTo(x, y - gap - 12); ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + 12);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 1;
    if (!steady) { ctx.beginPath(); ctx.arc(x, y, hipSpread, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = "#ff3b2f";
    ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function lensRadius(m) { return Math.min(width, height) * 0.46 * (0.82 + 0.18 * m); }

  function drawScope(m, now) {
    const cx = width / 2;
    const cy = height / 2;
    const R = lensRadius(m);
    const outer = Math.hypot(width, height);
    ctx.save();
    ctx.globalAlpha = m;
    // Black tube around the lens.
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(cx, cy, R, 0, TAU, true);
    const tube = ctx.createRadialGradient(cx, cy, R, cx, cy, outer / 2);
    tube.addColorStop(0, "#151515");
    tube.addColorStop(0.04, "#050505");
    tube.addColorStop(0.12, "#0d0d0d");
    tube.addColorStop(0.2, "#030303");
    tube.addColorStop(1, "#000");
    ctx.fillStyle = tube;
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(150,150,150,.22)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(110,110,110,.12)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.24, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    // Lens: edge shadow, faint tint and glare.
    const lens = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
    lens.addColorStop(0, "rgba(0,0,0,0)");
    lens.addColorStop(0.72, "rgba(0,0,0,.18)");
    lens.addColorStop(0.92, "rgba(0,0,0,.7)");
    lens.addColorStop(1, "rgba(0,0,0,.97)");
    ctx.fillStyle = lens;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(30,60,50,.05)";
    ctx.fill();
    const glare = ctx.createLinearGradient(cx - R, cy - R, cx, cy);
    glare.addColorStop(0, "rgba(255,255,255,.08)");
    glare.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glare;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.96, Math.PI * 1.05, Math.PI * 1.55); ctx.arc(cx, cy, R * 0.8, Math.PI * 1.55, Math.PI * 1.05, true); ctx.fill();
    // Reticle.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    if (grid) {
      ctx.strokeStyle = "rgba(0,0,0,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -5; i <= 5; i++) {
        if (!i) continue;
        ctx.moveTo(cx + i * R * 0.2, cy - R); ctx.lineTo(cx + i * R * 0.2, cy + R);
        ctx.moveTo(cx - R, cy + i * R * 0.2); ctx.lineTo(cx + R, cy + i * R * 0.2);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(5,5,5,.92)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - R * 0.5, cy);
    ctx.moveTo(cx + R * 0.5, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy + R * 0.5); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const d = i * R * 0.1;
      const t = i % 2 ? 4 : 7;
      ctx.moveTo(cx + d, cy - t); ctx.lineTo(cx + d, cy + t);
      ctx.moveTo(cx - d, cy - t); ctx.lineTo(cx - d, cy + t);
      ctx.moveTo(cx - t, cy + d); ctx.lineTo(cx + t, cy + d);
      ctx.moveTo(cx - t, cy - d); ctx.lineTo(cx + t, cy - d);
    }
    ctx.stroke();
    ctx.fillStyle = "#ff3b2f";
    ctx.shadowColor = "#ff3b2f";
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
    // Zoom, breath and bolt readouts below the lens.
    ctx.font = "700 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(240,195,90,.9)";
    const label = killcam ? "BULLET CAM" : `${zoomLevel.toFixed(1)}×${now < boltUntil ? "  ·  CHAMBERING" : ""}`;
    ctx.fillText(label, cx, cy + R + 22);
    const bw = 120;
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(cx - bw / 2, cy + R + 30, bw, 3);
    ctx.fillStyle = breath < 0.25 ? "#ff5d4d" : "#9fd4ff";
    ctx.fillRect(cx - bw / 2, cy + R + 30, bw * breath, 3);
    ctx.fillStyle = "rgba(200,210,200,.55)";
    ctx.font = "600 10px ui-sans-serif, system-ui";
    ctx.fillText("SHIFT  HOLD BREATH", cx, cy + R + 46);
    ctx.restore();
  }

  function drawBullets(now) {
    for (const b of bullets) {
      const k = Math.min(1, (now - b.born) / b.duration);
      const to = toScreen(b.to.x, b.to.y);
      // Dead straight from the muzzle to the point of aim.
      const at = t => ({ x: b.from.x + (to.x - b.from.x) * t, y: b.from.y + (to.y - b.from.y) * t });
      const size = b.scoped ? (b.cam ? 14 : 8) * (1 - k * 0.7) : 2.6;
      ctx.save();
      // Vapor trail: a spiralling wake of disturbed air behind the round.
      const steps = 26;
      for (let i = steps; i >= 1; i--) {
        const t = k - i * (b.scoped ? 0.018 : 0.04);
        if (t < 0) continue;
        const p = at(t);
        const fade = 1 - i / steps;
        ctx.fillStyle = `rgba(90,100,120,${0.32 * fade})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.8, size * (0.35 + 0.8 * i / steps)), 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.5 * fade})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, size * 0.25), 0, TAU); ctx.fill();
      }
      const p = at(k);
      if (b.scoped) {
        // Air ripples around the round.
        for (let i = 0; i < 3; i++) {
          const ring = ((now / 70 + i / 3) % 1);
          ctx.strokeStyle = `rgba(40,50,70,${0.35 * (1 - ring)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, size * (0.8 + ring * 2.2), size * (0.5 + ring * 1.4), 0, 0, TAU); ctx.stroke();
        }
      }
      const q = at(Math.max(0, k - (b.scoped ? 0.2 : 0.3)));
      const tracer = ctx.createLinearGradient(q.x, q.y, p.x, p.y);
      tracer.addColorStop(0, "rgba(255,150,60,0)");
      tracer.addColorStop(0.7, "rgba(255,190,90,.75)");
      tracer.addColorStop(1, "rgba(255,245,210,1)");
      ctx.strokeStyle = tracer;
      ctx.lineWidth = Math.max(2, size * 0.7);
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(255,170,60,.9)";
      ctx.shadowBlur = size * 1.5;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      // The round itself: a brass-and-copper slug pointing along its path.
      const dir = Math.atan2(p.y - q.y, p.x - q.x);
      ctx.translate(p.x, p.y);
      ctx.rotate(dir);
      ctx.shadowBlur = size * 2.5;
      const slug = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
      slug.addColorStop(0, "#ffe7a6");
      slug.addColorStop(0.5, "#c98a3a");
      slug.addColorStop(1, "#6e4419");
      ctx.fillStyle = slug;
      ctx.beginPath();
      ctx.moveTo(size * 1.1, 0);
      ctx.quadraticCurveTo(size * 0.6, -size * 0.45, -size * 0.6, -size * 0.42);
      ctx.lineTo(-size * 0.6, size * 0.42);
      ctx.quadraticCurveTo(size * 0.6, size * 0.45, size * 1.1, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEffects(now) {
    for (const fx of effects) {
      const age = now - fx.born;
      ctx.save();
      if (fx.kind === "puff") {
        const k = age / 650;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + fx.born;
          const r = (fx.big ? 16 : 9) * (0.4 + k) ;
          ctx.fillStyle = `rgba(170,150,120,${0.45 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r * 0.7 - k * 12, r * 0.7, 0, TAU); ctx.fill();
        }
      } else if (fx.kind === "spark") {
        const k = age / 220;
        ctx.strokeStyle = `rgba(255,220,120,${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU;
          ctx.moveTo(fx.x + Math.cos(a) * 6 * k, fx.y + Math.sin(a) * 6 * k);
          ctx.lineTo(fx.x + Math.cos(a) * 26 * k, fx.y + Math.sin(a) * 26 * k);
        }
        ctx.stroke();
      } else if (fx.kind === "helmet") {
        const dt = (now - fx.last) / 1000 * (killcam ? 0.18 : 1);
        fx.last = now;
        fx.vy += 900 * dt;
        fx.x += fx.vx * dt;
        fx.y += fx.vy * dt;
        fx.rot += fx.vr * dt;
        ctx.globalAlpha = Math.max(0, 1 - age / 1400);
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.rot);
        ctx.scale(fx.scale, fx.scale);
        if (fx.beret) drawBeret(fx.color, 0, 0); else drawHelmet(fx.color, 0, 0);
      } else if (fx.kind === "flash") {
        const k = age / 120;
        if (fx.scoped) {
          const R = lensRadius(1);
          const g = ctx.createRadialGradient(width / 2, height / 2 + R, 0, width / 2, height / 2 + R, R * 1.2);
          g.addColorStop(0, `rgba(255,210,140,${0.55 * (1 - k)})`);
          g.addColorStop(1, "rgba(255,180,100,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, width, height);
        } else {
          const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, 60);
          g.addColorStop(0, `rgba(255,240,190,${1 - k})`);
          g.addColorStop(0.4, `rgba(255,170,60,${0.7 * (1 - k)})`);
          g.addColorStop(1, "rgba(255,120,30,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(fx.x, fx.y, 60, 0, TAU); ctx.fill();
        }
      } else if (fx.kind === "boom") {
        const k = age / 900;
        const r = fx.r * (0.3 + k * 0.9);
        const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
        g.addColorStop(0, `rgba(255,250,210,${1 - k})`);
        g.addColorStop(0.35, `rgba(255,170,50,${0.9 * (1 - k)})`);
        g.addColorStop(0.7, `rgba(200,60,20,${0.6 * (1 - k)})`);
        g.addColorStop(1, "rgba(60,30,20,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,220,160,${0.6 * (1 - k)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.2 + k * 1.8), 0, TAU); ctx.stroke();
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU + fx.born;
          const d = fx.r * k * (1.1 + (i % 3) * 0.3);
          ctx.fillStyle = `rgba(90,80,70,${0.7 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d - k * 30, 5 + k * 10, 0, TAU); ctx.fill();
        }
      } else if (fx.kind === "incoming") {
        const k = age / 260;
        ctx.strokeStyle = `rgba(255,90,70,${1 - k})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(fx.x + (width / 2 - fx.x) * Math.min(1, k * 2), fx.y + (height - fx.y) * Math.min(1, k * 2));
        ctx.stroke();
      }
      ctx.restore();
    }
    effects = effects.filter(fx => now - fx.born < ({ puff: 650, spark: 220, helmet: 1400, flash: 120, incoming: 260, boom: 900 })[fx.kind]);
  }

  function drawHitMarker(now) {
    if (!hitMarker) return;
    const k = (now - hitMarker.born) / 350;
    if (k >= 1) { hitMarker = null; return; }
    const { x, y } = hitMarker;
    ctx.save();
    ctx.strokeStyle = hitMarker.head ? `rgba(255,70,50,${1 - k})` : `rgba(255,255,255,${1 - k})`;
    ctx.lineWidth = 2.5;
    const a = 7 + k * 4;
    const b = 16 + k * 4;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      ctx.moveTo(x + dx * a, y + dy * a);
      ctx.lineTo(x + dx * b, y + dy * b);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerHit(now) {
    const age = now - playerHitAt;
    if (age > 1300) return;
    const k = age / 1300;
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.7);
    g.addColorStop(0, "rgba(160,0,0,0)");
    g.addColorStop(1, `rgba(170,10,10,${0.6 * (1 - k)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
    ctx.lineWidth = 1.2;
    const ox = width * 0.68;
    const oy = height * 0.3;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + 0.3;
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a) * 60, oy + Math.sin(a) * 60);
      ctx.lineTo(ox + Math.cos(a + 0.15) * 130, oy + Math.sin(a + 0.15) * 130);
    }
    ctx.stroke();
  }

  /* ── Danger signals ──────────────────────────────────────────────────── */
  // Where a soldier is (or is about to show himself), in base coordinates.
  // Civilians get no marker: telling them apart is your job.
  function dangerAnchor(e) {
    const c = e.cover;
    if (!c || e.state === "dying" || e.type.civilian) return null;
    const s = e.scale;
    if (e.kind === "runner") return { x: e.x, y: c.bottom - 36 * s };
    if (e.kind === "left") return { x: c.left, y: c.bottom - 36 * s };
    if (e.kind === "right") return { x: c.right, y: c.bottom - 36 * s };
    return { x: c.left + e.fx * (c.right - c.left), y: c.top };
  }

  function threat(e) {
    if (e.type.bomb) return "bomb";
    if (e.type.hvt) return "hvt";
    if (e.type.shoots && e.aim > 0) return "sniper";
    return e.exposure > 0.5 ? "exposed" : "hidden";
  }

  function drawDangerMarkers(alpha, now) {
    ctx.save();
    ctx.font = "800 10px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    for (const e of enemies) {
      const a = dangerAnchor(e);
      if (!a) continue;
      // Once he shows himself the marker floats above his head, never over it.
      const exposed = e.shape && e.exposure > 0.3;
      const p = exposed ? localToScreen(e.shape, 0, -42) : toScreen(a.x, a.y);
      const level = threat(e);
      if (level === "bomb") { drawBombTimer(p.x, p.y - 26, e, alpha, now); continue; }
      const pulse = 0.5 + 0.5 * Math.sin(now / (level === "sniper" ? 90 : 220));
      const y = p.y - 16 - (level === "hidden" ? 0 : 10);
      if (level === "hvt") {
        ctx.globalAlpha = alpha * (0.75 + 0.25 * pulse);
        ctx.fillStyle = "#ffcf4a";
        ctx.beginPath(); ctx.moveTo(p.x, y + 10); ctx.lineTo(p.x - 9, y); ctx.lineTo(p.x, y - 10); ctx.lineTo(p.x + 9, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#3a2a00";
        ctx.fillText("★", p.x, y + 4);
        ctx.fillStyle = "#ffcf4a";
        ctx.fillText(`HVT ${e.name}`, p.x, y - 14);
        continue;
      }
      ctx.globalAlpha = alpha * (level === "hidden" ? 0.45 + pulse * 0.25 : 0.75 + pulse * 0.25);
      ctx.fillStyle = level === "hidden" ? "#e0453a" : "#ff2a1f";
      ctx.beginPath();
      ctx.moveTo(p.x, y + 9);
      ctx.lineTo(p.x - 8, y - 5);
      ctx.lineTo(p.x + 8, y - 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText("!", p.x, y + 2);
      if (level !== "hidden") {
        ctx.fillStyle = "#ff2a1f";
        ctx.fillText(level === "sniper" ? "SNIPER AIMING" : "DANGER", p.x, y - 9);
      }
    }
    ctx.restore();
  }

  function drawBombTimer(x, y, e, alpha, now) {
    const left = bombLeft(e);
    const urgent = left < 3;
    const pulse = 0.5 + 0.5 * Math.sin(now / (urgent ? 60 : 160));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgba(120,0,0,${0.55 + 0.25 * pulse})`;
    ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.stroke();
    ctx.strokeStyle = urgent ? "#ff2a1f" : "#ff7a4a";
    ctx.beginPath(); ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * left / BOMB_TIME); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "800 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(Math.ceil(left), x, y + 4);
    ctx.fillStyle = "#ff2a1f";
    ctx.font = "800 10px ui-sans-serif, system-ui";
    ctx.fillText("BOMB", x, y - 22);
    ctx.restore();
  }

  function drawScopeRadar(m, now) {
    const cx = width / 2;
    const cy = height / 2;
    const R = lensRadius(m);
    ctx.save();
    ctx.globalAlpha = m;
    // Red markers on the lens rim pointing to soldiers outside the view.
    for (const e of enemies) {
      const a = dangerAnchor(e);
      if (!a) continue;
      const p = toScreen(a.x, a.y);
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (Math.hypot(dx, dy) < R - 10) continue;
      const level = threat(e);
      const angle = Math.atan2(dy, dx);
      const pulse = 0.5 + 0.5 * Math.sin(now / (level === "sniper" ? 90 : 200));
      const strength = level === "hidden" ? 0.45 : 0.75 + 0.25 * pulse;
      const spread = level === "hidden" ? 0.06 : level === "bomb" ? 0.16 : 0.11;
      const rgb = level === "hvt" ? "255,207,74" : "255,42,31";
      ctx.strokeStyle = `rgba(${rgb},${strength})`;
      ctx.lineWidth = level === "hidden" ? 4 : 7;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, cy, R - 5, angle - spread, angle + spread); ctx.stroke();
      const tip = R + 18;
      ctx.fillStyle = `rgba(${rgb},${strength})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * tip, cy + Math.sin(angle) * tip);
      ctx.lineTo(cx + Math.cos(angle + 0.04) * (R + 6), cy + Math.sin(angle + 0.04) * (R + 6));
      ctx.lineTo(cx + Math.cos(angle - 0.04) * (R + 6), cy + Math.sin(angle - 0.04) * (R + 6));
      ctx.closePath();
      ctx.fill();
    }
    // Urgent alerts above the lens.
    const alerts = [];
    for (const e of enemies) {
      if (e.state === "dying") continue;
      if (e.type.bomb) alerts.push(["#ff2a1f", `⚠ BOMB ${bombLeft(e).toFixed(1)} s`]);
      if (e.type.hvt) alerts.push(["#ffcf4a", `★ HVT ${e.name} ON SITE`]);
    }
    ctx.font = "800 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    alerts.slice(0, 2).forEach(([color, label], i) => {
      const y = cy - R + 46 + i * 22;
      const w = ctx.measureText(label).width + 18;
      ctx.fillStyle = "rgba(0,0,0,.7)";
      roundRect(cx - w / 2, y - 14, w, 19, 4); ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(label, cx, y);
    });
    // Mini-map: the whole page view, where the scope is looking, and every soldier.
    const mw = Math.min(200, width * 0.18);
    const mh = mw * height / width;
    const mx = width - mw - 16;
    const my = height - mh - 66;
    const sx = mw / width;
    const sy = mh / height;
    ctx.fillStyle = "rgba(20,22,20,.85)";
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = "rgba(240,195,90,.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    ctx.fillStyle = "rgba(240,195,90,.8)";
    ctx.font = "700 9px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("MAP", mx + 4, my - 4);
    for (const r of covers) {
      if (!r.isConnected) continue;
      const c = baseRectCached.get(r);
      if (!c) continue;
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(mx + c.left * sx, my + c.top * sy, (c.right - c.left) * sx, (c.bottom - c.top) * sy);
    }
    const look = toBase(cx, cy);
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(mx + look.x * sx, my + look.y * sy, Math.max(2, R / view.z * sx), Math.max(2, R / view.z * sy), 0, 0, TAU);
    ctx.stroke();
    for (const e of enemies) {
      const a = dangerAnchor(e);
      if (!a) continue;
      const level = threat(e);
      const pulse = 0.5 + 0.5 * Math.sin(now / 150);
      ctx.fillStyle = level === "hvt" ? "#ffcf4a" : level === "hidden" ? "rgba(255,70,60,.55)" : `rgba(255,42,31,${0.7 + 0.3 * pulse})`;
      ctx.beginPath(); ctx.arc(mx + a.x * sx, my + a.y * sy, level === "hidden" ? 2.5 : level === "bomb" ? 4.5 : 3.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    if (!started) return;
    const m = scopeBlend();
    if (grid && m < 0.5) { ctx.globalAlpha = 1 - m * 2; drawGrid(); ctx.globalAlpha = 1; }
    for (const r of virtualCovers) drawSandbags(rectToScreen(r));
    const visible = enemies.slice().sort((a, b) => a.scale - b.scale);
    for (const e of visible) {
      const shape = screenShape(e);
      e.shape = shape;
      if (!shape) continue;
      ctx.save();
      if (shape.cover) {
        const c = shape.cover;
        ctx.beginPath();
        ctx.rect(-1e5, -1e5, 2e5, shape.ground + 1e5);
        ctx.rect(c.left, c.top, c.right - c.left, c.bottom - c.top);
        ctx.clip("evenodd");
      }
      if (e.state === "dying") ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (gameNow - e.t0) / 1100 - 0.5) * 2);
      drawSoldier(e, shape);
      ctx.restore();
    }
    if (m < 1) drawDangerMarkers(1 - m, now);
    drawEffects(now);
    drawBullets(now);
    if (m < 1) { drawRifle(1 - m); drawHipCrosshair(1 - m); }
    if (m > 0) { drawScope(m, now); drawScopeRadar(m, now); }
    drawHitMarker(now);
    drawPlayerHit(now);
  }

  /* ── Frame loop ──────────────────────────────────────────────────────── */
  function resize() {
    width = surface.clientWidth;
    height = surface.clientHeight;
    pixelRatio = devicePixelRatio || 1;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function killcamBlend(now) {
    if (!killcam) return 0;
    if (now >= killcam.end + 350) { killcam = null; return 0; }
    if (now < killcam.impactAt) return Math.min(1, (now - killcam.start) / (killcam.impactAt - killcam.start));
    if (now < killcam.end) return 1;
    return 1 - (now - killcam.end) / 350;
  }

  function frame(now) {
    if (!running) return;
    const rdt = Math.min(0.05, (now - lastReal) / 1000);
    lastReal = now;
    if (width !== surface.clientWidth || height !== surface.clientHeight || pixelRatio !== (devicePixelRatio || 1)) resize();
    const cam = killcamBlend(now);
    const timeScale = killcam && now < killcam.end ? 0.18 : 1;
    const dt = rdt * timeScale;
    gameNow += dt * 1000;

    // READ: body position and cover rects under the transform applied last frame.
    if (canMagnify) {
      // The transform origin is the top-left of <html>; its rect ignores its own transform, so use scroll.
      view = { B: { x: rootMargin.x - scrollX, y: rootMargin.y - scrollY }, T: { x: applied.tx, y: applied.ty }, z: applied.z };
    }
    if (started && applied.z === 1 && now >= nextScan) scanCovers(now);
    for (const e of enemies) e.cover = e.virtual || (e.el && baseRect(e.el)) || (e.state === "dying" ? e.cover : null);

    // UPDATE
    if (started) {
      if (reloadUntil && now >= reloadUntil) { reloadUntil = 0; ammo = perks.magazine; updateHud(); }
      if (autoReloadAt && now >= autoReloadAt && reload()) autoReloadAt = 0;
      const steady = holdingBreath && breath > 0 && now >= gaspUntil && scoped;
      if (steady) {
        breath = Math.max(0, breath - rdt / perks.breath);
        if (breath === 0) { gaspUntil = now + 1500; toast("OUT OF BREATH", "#9fd4ff"); }
      } else breath = Math.min(1, breath + rdt / 5);
      const alive = enemies.filter(e => e.state !== "dying").length;
      if (!ending && now >= nextHvt && alive < 4) nextHvt = now + (spawnHvt() ? rand(70000, 100000) : 3000);
      if (!ending && now >= nextSpawn && alive < Math.min(3, 1 + Math.ceil(level / 2))) {
        spawn();
        nextSpawn = now + Math.max(2000, 3600 - (level - 1) * 250) * (timeScale < 1 ? 3 : 1);
      }
      updateEnemies(dt);
      for (let i = bullets.length - 1; i >= 0; i--) {
        if (now - bullets[i].born >= bullets[i].duration) { const b = bullets[i]; bullets.splice(i, 1); resolveBullet(b); }
      }
      feedItems = feedItems.filter(item => {
        if (now < item.until) return true;
        item.el.remove();
        return false;
      });
    }

    // VIEW: magnify the page so the aim point sits under the reticle.
    const targetZoom = scoped ? zoomLevel : 1;
    zoom += (targetZoom - zoom) * Math.min(1, rdt * 10);
    if (Math.abs(targetZoom - zoom) < 0.005) zoom = targetZoom;
    const m = scopeBlend();
    const t = now / 1000;
    const steady = holdingBreath && breath > 0 && now >= gaspUntil;
    const amp = (steady ? 0.1 : now < gaspUntil ? 1.8 : 1) * 4 * Math.sqrt(zoom / 4) * m;
    const swayX = (Math.sin(t * 0.9) + Math.sin(t * 2.3) * 0.35) * amp;
    const swayY = (Math.sin(t * 1.3 + 1) * 0.8 + Math.cos(t * 2.9) * 0.3) * amp;
    recoil *= Math.exp(-rdt * 6);
    shake *= Math.exp(-rdt * 8);
    rifleKick *= Math.exp(-rdt * 9);
    hipSpread = Math.max(0, hipSpread - HIP_SETTLE * rdt);
    let A = scoped || m > 0 ? { x: aim.x, y: aim.y } : { x: pointer.x, y: pointer.y };
    let z = zoom;
    if (cam > 0) {
      A = { x: A.x + (killcam.target.x - A.x) * cam, y: A.y + (killcam.target.y - A.y) * cam };
      z = zoom * (1 + 0.9 * cam);
    }
    const jitter = shake ? (Math.random() - 0.5) * shake : 0;
    const S = {
      x: A.x + (width / 2 - A.x) * m + swayX * (1 - cam) + jitter,
      y: A.y + (height / 2 - A.y) * m + swayY * (1 - cam) + recoil + jitter
    };
    if (canMagnify && z > 1.001) {
      const B = view.B;
      const T = { x: S.x - B.x - z * (A.x - B.x), y: S.y - B.y - z * (A.y - B.y) };
      applyPageZoom(T.x, T.y, z);
      view = { B, T, z };
    } else {
      restorePage();
      view = { B: view.B, T: { x: 0, y: 0 }, z: 1 };
    }

    draw(now);
    raf = requestAnimationFrame(frame);
  }

  /* ── Input ───────────────────────────────────────────────────────────── */
  function onPointerDown(event) {
    if (!started) return;
    event.preventDefault();
    if (event.button === 2) setScoped(!scoped);
    else if (event.button === 0) fire();
  }

  function onWheel(event) {
    if (!started || !scoped) return;
    event.preventDefault();
    // Proportional to how far the wheel turned: one mouse notch (~100 px) is about 1.5×,
    // and a trackpad's small deltas zoom smoothly.
    const pixels = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    zoomBy(Math.exp(-Math.max(-250, Math.min(250, pixels)) * 0.004));
  }

  function zoomBy(factor) {
    const next = Math.max(ZOOM_MIN, Math.min(perks.zoomMax, zoomLevel * factor));
    if (Math.abs(next - zoomLevel) < 0.001) return;
    if (Math.floor(next) !== Math.floor(zoomLevel)) sfx("zoom");
    zoomLevel = next;
    updateHud();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (scoped) setScoped(false); else destroy();
      return;
    }
    if (!started || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.key === "Shift") { holdingBreath = true; return; }
    if (event.repeat) return;
    const handlers = {
      r: reload,
      g: () => { grid = !grid; updateHud(); },
      m: () => { muted = !muted; if (muted && audio) audio.suspend(); updateHud(); },
      " ": () => setScoped(!scoped),
      "=": () => scoped && zoomBy(1.6),
      "+": () => scoped && zoomBy(1.6),
      "-": () => scoped && zoomBy(1 / 1.6)
    };
    if (handlers[key]) { event.preventDefault(); event.stopPropagation(); handlers[key](); }
  }

  function onKeyUp(event) { if (event.key === "Shift") holdingBreath = false; }
  function onBlur() { holdingBreath = false; }
  function onMove(event) {
    if (scoped) {
      // Pan at a constant on-screen speed whatever the magnification.
      aim.x = Math.max(0, Math.min(width, aim.x + event.movementX / zoom));
      aim.y = Math.max(0, Math.min(height, aim.y + event.movementY / zoom));
    }
    if (shadow.pointerLockElement !== canvas) {
      // Moving opens up the hip-fire spread; it closes back to the red dot when you hold still.
      if (!scoped) hipSpread = Math.min(HIP_SPREAD, hipSpread + Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) * 0.6);
      pointer = { x: event.clientX, y: event.clientY };
    }
    pointerVisible = true;
  }

  // Chrome releases pointer lock on Esc; treat that as lowering the scope.
  function onPointerLockChange() {
    if (scoped && shadow.pointerLockElement !== canvas && lockedOnce) setScoped(false);
    lockedOnce = shadow.pointerLockElement === canvas;
  }
  let lockedOnce = false;
  function onLeave() { pointerVisible = false; }

  function destroy() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    restorePage();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    if (shadow.pointerLockElement === canvas) document.exitPointerLock();
    if (audio) audio.close().catch(() => {});
    commitCareer();
    host.remove();
    delete globalThis.__sniperShot;
    delete globalThis.SniperShotCore;
  }

  surface.addEventListener("pointermove", onMove);
  surface.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  surface.addEventListener("wheel", onWheel, { passive: false });
  ui.grid.addEventListener("click", () => { grid = !grid; updateHud(); });
  ui.sound.addEventListener("click", () => { muted = !muted; if (muted && audio) audio.suspend(); updateHud(); });
  $(".exit").addEventListener("click", destroy);
  ui.start.addEventListener("click", () => {
    startRun();
    toast("RIGHT-CLICK TO SCOPE IN · HEADSHOTS ONLY", "#f0c35a");
  });
  ui.again.addEventListener("click", startRun);
  ui.quit.addEventListener("click", destroy);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  globalThis.__sniperShot = { destroy };
  try {
    host.showPopover();
    canMagnify = true;
  } catch (error) {
    // Without the top layer the page transform would also scale the overlay; play unmagnified.
  }
  resize();
  updateHud();
  loadCareer();
  raf = requestAnimationFrame(frame);
  ui.start.focus();
})();
