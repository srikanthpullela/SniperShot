"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../core.js");
const { hitTest, levelForScore, rankFor, perksFor, RANKS } = globalThis.SniperShotCore;

// Soldier scaled 2x with feet at (100, 200), peeking left of a cover box.
const shape = {
  px: 100, py: 200, angle: 0, scale: 2, facing: 1, ground: 200,
  cover: { left: 105, top: 100, right: 200, bottom: 200 }
};

test("head and body hits use the exact aimed point", () => {
  assert.equal(hitTest(shape, 100, 131), "head");
  assert.equal(hitTest(shape, 95, 160), "body");
  assert.equal(hitTest(shape, 100, 112), null);   // above the helmet
  assert.equal(hitTest(shape, 78, 160), null);    // beside the torso
});

test("cover and the ground line block shots", () => {
  assert.equal(hitTest(shape, 106, 131), null);
  assert.equal(hitTest(shape, 100, 201), null);
  assert.equal(hitTest({ ...shape, cover: null, ground: Infinity }, 106, 131), "head");
});

test("rotation and facing are applied to hitboxes", () => {
  const leaning = { ...shape, cover: null, angle: -Math.PI / 2 };
  // Rotated a quarter turn left, the head lies 69px left of the feet.
  assert.equal(hitTest(leaning, 31, 200), "head");
  const mirrored = { ...shape, cover: null, facing: -1 };
  assert.equal(hitTest(mirrored, 118, 160), "body");  // backpack side is mirrored
  assert.equal(hitTest({ ...shape, cover: null }, 118, 160), null);
});

test("level increases every 600 points", () => {
  assert.equal(levelForScore(0), 1);
  assert.equal(levelForScore(599), 1);
  assert.equal(levelForScore(600), 2);
});

test("career rank follows XP thresholds and reports progress to the next rank", () => {
  assert.equal(rankFor(0).name, "Paper Pusher");
  assert.equal(rankFor(299).number, 1);
  assert.equal(rankFor(300).number, 2);
  assert.equal(rankFor(550).progress, 0.5);
  const top = rankFor(1e9);
  assert.equal(top.number, RANKS.length);
  assert.equal(top.next, null);
});

test("perks unlock cumulatively with rank", () => {
  assert.deepEqual(perksFor(0), { magazine: 5, breath: 4, bolt: 900, hearts: 3, zoomMax: 16, reload: 1800 });
  assert.equal(perksFor(1).magazine, 6);
  assert.equal(perksFor(4).hearts, 4);
  assert.deepEqual(perksFor(RANKS.length - 1), { magazine: 7, breath: 6, bolt: 550, hearts: 5, zoomMax: 24, reload: 1100 });
});
