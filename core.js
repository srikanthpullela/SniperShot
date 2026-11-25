"use strict";

globalThis.SniperShotCore = (() => {
  const MAGAZINE_SIZE = 5;
  // Hitboxes in soldier-local units: feet at (0, 0), facing +x, head up (negative y).
  const HEAD = { x: 0, y: -34.5, r: 5.8 };
  const BODY = [
    { left: -10, top: -30, right: 7, bottom: -12 },
    { left: -6, top: -13, right: 6, bottom: 0 }
  ];

  function contains(rect, x, y) {
    return !!rect && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
  }

  /** Where a screen point hits a soldier shape: "head", "body" or null. Cover and the ground line block shots. */
  function hitTest(shape, x, y) {
    if (y > shape.ground || contains(shape.cover, x, y)) return null;
    const dx = x - shape.px;
    const dy = y - shape.py;
    const cos = Math.cos(-shape.angle);
    const sin = Math.sin(-shape.angle);
    const lx = (dx * cos - dy * sin) / shape.scale * (shape.facing < 0 ? -1 : 1);
    const ly = (dx * sin + dy * cos) / shape.scale;
    const hx = lx - HEAD.x;
    const hy = ly - HEAD.y;
    if (hx * hx + hy * hy <= HEAD.r * HEAD.r) return "head";
    if (BODY.some(part => contains(part, lx, ly))) return "body";
    return null;
  }

  function levelForScore(score) {
    return Math.floor(score / 600) + 1;
  }

  // Career ranks: XP carries over between games; each rank from 2 to 9 unlocks one perk.
  const RANKS = [
    { name: "Paper Pusher", xp: 0 },
    { name: "Junior Clerk", xp: 300, unlock: "Extended magazine — 6 rounds" },
    { name: "Field Clerk", xp: 800, unlock: "Steady hands — hold your breath 50% longer" },
    { name: "Staple Sniper", xp: 1600, unlock: "Greased bolt — faster chambering" },
    { name: "Senior Shredder", xp: 2800, unlock: "Body armour — a 4th heart" },
    { name: "Memo Marksman", xp: 4500, unlock: "Hawk-eye scope — zoom to 24×" },
    { name: "Deadline Hunter", xp: 7000, unlock: "Speed loader — faster reloads" },
    { name: "Chief of Red Tape", xp: 10000, unlock: "Drum magazine — 7 rounds" },
    { name: "Director of Headshots", xp: 14000, unlock: "Plot armour — a 5th heart" },
    { name: "Legend of Accounts Payable", xp: 20000 }
  ];

  function rankFor(xp) {
    let index = 0;
    while (index + 1 < RANKS.length && xp >= RANKS[index + 1].xp) index++;
    const next = RANKS[index + 1] || null;
    const progress = next ? (xp - RANKS[index].xp) / (next.xp - RANKS[index].xp) : 1;
    return { index, number: index + 1, name: RANKS[index].name, next, progress };
  }

  function perksFor(rankIndex) {
    const has = n => rankIndex + 1 >= n;
    return {
      magazine: has(8) ? 7 : has(2) ? 6 : MAGAZINE_SIZE,
      breath: has(3) ? 6 : 4,
      bolt: has(4) ? 550 : 900,
      hearts: has(9) ? 5 : has(5) ? 4 : 3,
      zoomMax: has(6) ? 24 : 16,
      reload: has(7) ? 1100 : 1800
    };
  }

  return { MAGAZINE_SIZE, RANKS, hitTest, levelForScore, rankFor, perksFor };
})();
