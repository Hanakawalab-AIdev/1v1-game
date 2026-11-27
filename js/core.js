// core.js — shared namespace, competitive constants and small utilities.
// Loaded first. Works both in the browser (classic <script>) and in Node (tests).
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});

  SG.GAME_TITLE = 'STOMP DUEL';

  // ===== Competitive rules (values identical to the Day 1 prototype) =====
  SG.C = Object.freeze({
    TICK_RATE: 60,               // physics always runs at 60 ticks/s (no monitor advantage)
    TICK_MS: 1000 / 60,
    COUNTDOWN_TICKS: 180,        // 3 s before each round, no control
    RESPAWN_INVULN: 90,          // 1.5 s of invulnerability after respawn
    ROUND_END_TICKS: 120,        // celebration pause after a round/match is decided
    GRAVITY: 0.6,
    MAX_FALL: 14,
    MOVE_SPEED: 4,
    JUMP_POWER: 12,
    JUMP_CUT: 0.5,               // applied every tick while rising with jump released
    STOMP_BOUNCE: 9,
    STOMP_TOLERANCE: 4,
    COYOTE_TICKS: 6,
    JUMP_BUFFER_TICKS: 6,
    PLAYER_W: 30,
    PLAYER_H: 40,
    PLATFORM_H: 12,
    VIEW_W: 800,
    VIEW_H: 400,
  });

  SG.NO_INPUT = Object.freeze({ left: false, right: false, jumpHeld: false, jumpPressed: false });

  SG.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  SG.lerp = (a, b, t) => a + (b - a) * t;

  // Seeded PRNG (mulberry32). Used only by AI decisions and cosmetic effects — never by physics.
  SG.makeRng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Deterministic hash → [0,1) for procedural cosmetic details (window lights, flowers...).
  SG.hash01 = function (n) {
    let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
