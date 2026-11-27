// Headless test suite. Run:  node tests/run-tests.js
// Loads the DOM-free game modules into the global scope and exercises them.
'use strict';
const path = require('path');
const JS = path.join(__dirname, '..', 'js');
const fs = require('fs');
for (const f of ['core.js', 'i18n.js', 'stages.js', 'sim.js', 'ai.js', 'net.js', 'game.js']) {
  if (fs.existsSync(path.join(JS, f))) require(path.join(JS, f));
}
const SG = globalThis.SG;
const C = SG.C;

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + (msg || ''));
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function near(a, b, eps, msg) {
  if (Math.abs(a - b) > (eps || 1e-9)) throw new Error(`${msg || 'near'}: expected ${b}, got ${a}`);
}

const I = (o) => Object.assign({ left: false, right: false, jumpHeld: false, jumpPressed: false }, o || {});
const meadow = () => SG.buildStage(SG.getStageDef('meadow'));
const flat = () => SG.buildStage({ id: 'flat', width: 800, groundY: 340, spawnX: 150, platforms: [] });
function playingWorld(opts) {
  const w = SG.createWorld(Object.assign({ stageId: 'meadow' }, opts || {}));
  for (let i = 0; i < C.COUNTDOWN_TICKS; i++) SG.stepWorld(w, null);
  return w;
}

// ---------------------------------------------------------------- movement
test('spawn positions are symmetric and on the ground', () => {
  for (const def of SG.STAGES) {
    const s = SG.buildStage(def);
    eq(s.spawns[0] + C.PLAYER_W, s.width - s.spawns[1], def.id + ' spawn mirror');
    const p = SG.createPlayer(0, s);
    eq(p.y + p.h, s.groundY, 'on ground');
  }
});
test('Day 1 meadow layout is preserved exactly', () => {
  const s = meadow();
  const got = s.platforms.map((p) => [p.x, p.y, p.w].join(',')).sort();
  const want = ['80,260,160', '560,260,160', '320,190,160', '120,120,120', '560,120,120'].sort();
  eq(got.join(' '), want.join(' '));
  eq(s.spawns[0], 150);
  eq(s.spawns[1], 620);
});
test('horizontal movement is 4 px/tick and clamps to the stage', () => {
  const s = flat();
  const p = SG.createPlayer(0, s);
  SG.stepPlayer(p, I({ right: true }), s, true, []);
  eq(p.x, 154);
  eq(p.facing, 1);
  for (let i = 0; i < 300; i++) SG.stepPlayer(p, I({ right: true }), s, true, []);
  eq(p.x, 800 - 30);
  for (let i = 0; i < 300; i++) SG.stepPlayer(p, I({ left: true }), s, true, []);
  eq(p.x, 0);
  SG.stepPlayer(p, I({ left: true, right: true }), s, true, []);
  eq(p.vx, 0, 'left+right cancel');
});
test('no movement while canAct is false (countdown)', () => {
  const s = flat();
  const p = SG.createPlayer(0, s);
  SG.stepPlayer(p, I({ right: true, jumpPressed: true, jumpHeld: true }), s, false, []);
  eq(p.x, 150);
  eq(p.y + p.h, 340);
});

// ---------------------------------------------------------------- jumping
function jumpApex(holdTicks) {
  const s = flat();
  const p = SG.createPlayer(0, s);
  let minY = p.y;
  for (let k = 0; k < 80; k++) {
    SG.stepPlayer(p, I({ jumpPressed: k === 0, jumpHeld: k < holdTicks }), s, true, []);
    minY = Math.min(minY, p.y);
  }
  return 300 - minY;
}
test('full jump reaches the Day 1 height (~114 px)', () => {
  const h = jumpApex(999);
  assert(h > 110 && h < 121, 'height ' + h);
});
test('variable jump: short tap is much lower than full hold', () => {
  const tap = jumpApex(1);
  const mid = jumpApex(8);
  const full = jumpApex(999);
  assert(tap < mid && mid < full, `${tap} < ${mid} < ${full}`);
  assert(tap < 30, 'tap ' + tap);
});
test('jump only triggers on press, not on hold', () => {
  const s = flat();
  const p = SG.createPlayer(0, s);
  for (let k = 0; k < 120; k++) SG.stepPlayer(p, I({ jumpPressed: k === 0, jumpHeld: true }), s, true, []);
  eq(p.onGround, true);
  SG.stepPlayer(p, I({ jumpHeld: true }), s, true, []);
  eq(p.onGround, true, 'holding does not re-jump');
});
test('coyote time: can jump up to 6 ticks after leaving a ledge, not 7', () => {
  const s = SG.buildStage({ id: 't', width: 800, groundY: 340, spawnX: 150, platforms: [{ x: 100, y: 260, w: 100 }] });
  for (const [late, ok] of [[6, true], [7, false]]) {
    const p = SG.createPlayer(0, s);
    p.x = 165; p.y = 260 - 40; p.onGround = true; p.riding = 0; p.coyote = C.COYOTE_TICKS;
    let left = -1;
    for (let k = 0; k < 40 && left < 0; k++) {
      SG.stepPlayer(p, I({ right: true }), s, true, []);
      if (!p.onGround) left = k;
    }
    assert(left >= 0, 'walked off');
    // `left` tick = airborne tick #1; step ticks #2..#(late-1), then press on tick #late
    for (let k = 1; k < late - 1; k++) SG.stepPlayer(p, I(), s, true, []);
    const ev = [];
    SG.stepPlayer(p, I({ jumpPressed: true, jumpHeld: true }), s, true, ev);
    eq(ev.some((e) => e.type === 'jump'), ok, 'jump after ' + late + ' airborne ticks');
  }
});
// Buffer of 6 ticks = the press tick + 5 more. A press `early` ticks before the landing
// tick (early=1 → on the landing tick) executes on the first grounded tick.
test('jump buffer: 6-tick window (press tick + 5) before the first grounded tick', () => {
  for (const [early, ok] of [[1, true], [5, true], [6, false]]) {
    const s = flat();
    const p = SG.createPlayer(0, s);
    p.y = 100; p.onGround = false; p.coyote = 0; p.vy = 0;
    // fall until about to land, recording ticks
    const q = Object.assign({}, p);
    let landTick = -1;
    for (let k = 0; k < 100; k++) {
      SG.stepPlayer(q, I(), s, true, []);
      if (q.onGround) { landTick = k; break; }
    }
    let jumped = false;
    for (let k = 0; k < landTick + 3; k++) {
      const ev = [];
      SG.stepPlayer(p, I({ jumpPressed: k === landTick - early + 1, jumpHeld: true }), s, true, ev);
      if (ev.some((e) => e.type === 'jump')) jumped = true;
    }
    eq(jumped, ok, 'buffer ' + early);
  }
});

// ---------------------------------------------------------------- platforms
test('land on platform from above, pass through from below', () => {
  const s = meadow();
  const p = SG.createPlayer(0, s);
  p.x = 150; // under the 80..240 platform at y=260
  let landedOn = -2;
  for (let k = 0; k < 120; k++) {
    SG.stepPlayer(p, I({ jumpPressed: k === 0, jumpHeld: true }), s, true, []);
    if (p.onGround && k > 0) { landedOn = p.riding; break; }
  }
  assert(landedOn >= 0, 'landed on a platform after jumping through it');
  eq(p.y + p.h, 260);
});
test('walking off a platform makes you fall', () => {
  const s = meadow();
  const p = SG.createPlayer(0, s);
  p.x = 200; p.y = 220; p.riding = 0; p.onGround = true;
  for (let k = 0; k < 30; k++) SG.stepPlayer(p, I({ right: true }), s, true, []);
  assert(p.y + p.h > 260, 'fell below platform');
});
test('moving platform carries a rider horizontally and vertically', () => {
  for (const id of ['docks', 'cavern']) {
    const w = playingWorld({ stageId: id });
    const s = w.stage;
    const idx = s.platforms.findIndex((pl) => pl.move);
    const pl = s.platforms[idx];
    const p = w.players[0];
    p.x = pl.x + pl.w / 2 - 15; p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.riding = idx;
    for (let k = 0; k < 200; k++) {
      w.time++;
      SG.updatePlatforms(s, w.time);
      SG.stepPlayer(p, I(), s, true, []);
      eq(p.riding, idx, id + ' still riding at ' + k);
      near(p.y + p.h, pl.y, 1e-9, id + ' feet on platform');
    }
    near(p.x + 15 - pl.w / 2, pl.x, 1e-6, id + ' carried horizontally');
  }
});
test('falling onto a rising lift lands on it (no tunnelling)', () => {
  const s = SG.buildStage(SG.getStageDef('cavern'));
  const idx = s.platforms.findIndex((pl) => pl.move);
  let landed = 0;
  for (let start = 0; start < 360; start += 7) {
    SG.resetPlatforms(s, start);
    const pl = s.platforms[idx];
    const p = SG.createPlayer(0, s);
    p.x = pl.x + 30; p.y = pl.y - 140; p.vy = 6; p.onGround = false; p.coyote = 0;
    let t = start;
    for (let k = 0; k < 60; k++) {
      SG.updatePlatforms(s, ++t);
      SG.stepPlayer(p, I(), s, true, []);
      if (p.onGround) break;
    }
    if (p.riding === idx) landed++;
    assert(!(p.y + p.h > pl.y + 1 && p.y < pl.y && p.riding === idx), 'not embedded');
  }
  assert(landed > 40, 'landed ' + landed + ' times');
});
test('stage platforms are mirror-symmetric on every tick', () => {
  for (const def of SG.STAGES) {
    const s = SG.buildStage(def);
    for (let t = 0; t < 800; t++) {
      SG.updatePlatforms(s, t);
      const boxes = s.platforms.map((p) => [p.x, p.y, p.w]);
      for (const [x, y, w] of boxes) {
        const mx = s.width - x - w;
        assert(boxes.some((b) => Math.abs(b[0] - mx) < 1e-6 && Math.abs(b[1] - y) < 1e-6 && b[2] === w), `${def.id} t=${t} no mirror for x=${x}`);
      }
    }
  }
});
test('stages: platforms in bounds, above ground, reachable', () => {
  const maxJump = 114;
  for (const def of SG.STAGES) {
    const s = SG.buildStage(def);
    for (let t = 0; t < 600; t += 5) {
      SG.updatePlatforms(s, t);
      for (const p of s.platforms) {
        assert(p.x >= 0 && p.x + p.w <= s.width, def.id + ' x bounds');
        assert(p.y > 40 && p.y < s.groundY - 20, def.id + ' y bounds ' + p.y);
      }
    }
    // reachability: BFS over static positions (lowest point of movers) from ground level.
    SG.resetPlatforms(s, 0);
    const levels = s.platforms.map((p) => p);
    const reached = new Set();
    let frontier = [{ y: s.groundY, x0: 0, x1: s.width }];
    while (frontier.length) {
      const next = [];
      for (const f of frontier) {
        levels.forEach((p, i) => {
          if (reached.has(i)) return;
          const lowY = p.move && p.move.axis === 'y' ? p.baseY : p.y;
          const highY = p.move && p.move.axis === 'y' ? p.baseY - p.move.range : p.y;
          const xr = p.move && p.move.axis === 'x' ? p.move.range : 0;
          const px0 = Math.min(p.baseX, p.baseX + p.move?.dir * xr || p.baseX);
          const px1 = Math.max(p.baseX, p.baseX + (p.move?.dir || 0) * xr) + p.w;
          const rise = f.y - lowY;
          const hgap = Math.max(0, px0 - f.x1, f.x0 - px1);
          if (rise <= maxJump && rise > 0 && hgap < 120) {
            reached.add(i);
            next.push({ y: highY, x0: px0, x1: px1 });
          }
        });
      }
      frontier = next;
    }
    eq(reached.size, s.platforms.length, def.id + ' reachable platforms');
  }
});

// ---------------------------------------------------------------- player vs player
function duel(stageId) {
  const w = playingWorld({ stageId: stageId || 'meadow' });
  return w;
}
test('side collision pushes both apart equally and scores nothing', () => {
  const w = duel();
  const [a, b] = w.players;
  a.x = 300; b.x = 320; a.y = b.y = 300;
  SG.stepWorld(w, [I(), I()]);
  near(a.x + a.w, b.x, 1e-9, 'separated');
  near(a.x, 295, 1e-9, 'P1 pushed half the overlap');
  near(b.x, 325, 1e-9, 'P2 pushed half the overlap');
  eq(a.score + b.score, 0);
});
test('stomp scores, bounces the stomper, respawns the victim with invulnerability', () => {
  const w = duel();
  const [a, b] = w.players;
  b.x = 400; b.y = 300; b.vy = 0;
  a.x = 400; a.y = 258; a.vy = 5; a.onGround = false; a.coyote = 0;
  const ev = SG.stepWorld(w, [I({ jumpHeld: true }), I()]);
  eq(a.score, 1, 'scored');
  near(a.vy, -C.STOMP_BOUNCE, 1e-9, 'bounce');
  eq(b.x, w.stage.spawns[1], 'victim respawned');
  eq(b.invuln, C.RESPAWN_INVULN, 'invulnerable');
  assert(ev.some((e) => e.type === 'stomp' && e.top === 0), 'stomp event');
  assert(ev.some((e) => e.type === 'score' && e.who === 0), 'score event');
});
test('invulnerable players cannot be stomped (pushed instead)', () => {
  const w = duel();
  const [a, b] = w.players;
  b.x = 400; b.y = 300; b.invuln = 30;
  a.x = 400; a.y = 258; a.vy = 5; a.onGround = false;
  SG.stepWorld(w, [I(), I()]);
  eq(a.score, 0);
});
test('invulnerability lasts exactly 90 ticks', () => {
  const w = duel();
  const b = w.players[1];
  b.invuln = C.RESPAWN_INVULN;
  for (let k = 0; k < 89; k++) SG.stepWorld(w, null);
  eq(b.invuln, 1);
  SG.stepWorld(w, null);
  eq(b.invuln, 0);
});
test('stomp is symmetric: P2 stomping P1 mirrors P1 stomping P2', () => {
  const run = (top) => {
    const w = duel();
    const P = w.players;
    const t = P[top];
    const bt = P[1 - top];
    bt.x = top === 0 ? 400 : 800 - 400 - 30; bt.y = 300;
    t.x = bt.x + (top === 0 ? 5 : -5); t.y = 258; t.vy = 5; t.onGround = false;
    SG.stepWorld(w, null);
    return [t.score, t.vy, bt.x + (top === 0 ? 0 : 0)];
  };
  const r0 = run(0);
  const r1 = run(1);
  eq(r0[0], 1); eq(r1[0], 1); eq(r0[1], r1[1]);
});
test('simultaneous mutual stomp is not scored (treated as a push)', () => {
  const w = duel();
  const [a, b] = w.players;
  a.x = 400; b.x = 400; a.y = b.y = 200; a.vy = b.vy = 3; a.onGround = b.onGround = false;
  SG.stepWorld(w, null);
  eq(a.score + b.score, 0);
});
test('update order has no advantage: swapping roles mirrors outcome exactly', () => {
  // Scripted chase: P1 walks right and jumps; mirrored script for P2. Results must mirror.
  const script = (k) => I({ right: k % 90 < 50, left: k % 90 >= 70, jumpPressed: k % 45 === 0, jumpHeld: k % 45 < 20 });
  const mirror = (inp) => I({ left: inp.right, right: inp.left, jumpPressed: inp.jumpPressed, jumpHeld: inp.jumpHeld });
  const w1 = duel();
  const w2 = duel();
  for (let k = 0; k < 900; k++) {
    const s0 = script(k);
    const s1 = script(k + 23);
    SG.stepWorld(w1, [s0, s1]);
    SG.stepWorld(w2, [mirror(s1), mirror(s0)]);
    const [a1, b1] = w1.players;
    const [a2, b2] = w2.players;
    near(a1.x, 800 - b2.x - 30, 1e-6, 'mirror x @' + k);
    near(a1.y, b2.y, 1e-6, 'mirror y @' + k);
    near(b1.x, 800 - a2.x - 30, 1e-6, 'mirror x2 @' + k);
    eq(a1.score, b2.score, 'mirror score');
  }
});

// ---------------------------------------------------------------- match flow
test('countdown lasts 180 ticks with count events 2,1 then go', () => {
  const w = SG.createWorld({ stageId: 'meadow' });
  const seen = [];
  for (let k = 0; k < C.COUNTDOWN_TICKS; k++) {
    for (const e of SG.stepWorld(w, [I({ right: true }), I({ left: true })])) seen.push(e.type === 'count' ? 'c' + e.n : e.type);
    if (k < C.COUNTDOWN_TICKS - 1) {
      eq(w.phase, 'countdown');
      eq(w.players[0].x, 150, 'no movement in countdown');
    }
  }
  eq(w.phase, 'playing');
  eq(seen.filter((s) => s !== 'land').join(','), 'c2,c1,go');
  eq(w.players[0].x, 154, 'control starts on the GO tick (same as Day 1)');
});
test('first to winScore wins; no double scoring after the round ends', () => {
  const w = playingWorld({ winScore: 2 });
  const [a, b] = w.players;
  const stompOnce = () => {
    b.invuln = 0; b.x = 400; b.y = 300; a.x = 400; a.y = 258; a.vy = 5; a.onGround = false;
    SG.stepWorld(w, null);
  };
  stompOnce();
  eq(a.score, 1);
  stompOnce();
  eq(a.score, 2);
  eq(w.phase, 'roundEnd');
  eq(w.matchWinner, 0);
  stompOnce();
  eq(a.score, 2, 'no scoring after round end');
  for (let k = 0; k < C.ROUND_END_TICKS; k++) SG.stepWorld(w, null);
  eq(w.phase, 'matchEnd');
});
test('best of 3: needs two rounds, scores reset between rounds', () => {
  const w = playingWorld({ winScore: 1, bestOf: 3 });
  const [a, b] = w.players;
  const stomp = (top) => {
    const t = w.players[top]; const v = w.players[1 - top];
    v.invuln = 0; v.x = 400; v.y = 300; t.x = 400; t.y = 258; t.vy = 5; t.onGround = false;
    SG.stepWorld(w, null);
  };
  const toPlaying = () => { while (w.phase !== 'playing') SG.stepWorld(w, null); };
  stomp(0);
  eq(w.phase, 'roundEnd'); eq(w.matchWinner, -1);
  toPlaying();
  eq(w.round, 2); eq(a.score, 0); eq(b.score, 0); eq(a.x, 150, 'respawned');
  stomp(1);
  toPlaying();
  eq(w.round, 3);
  stomp(0);
  eq(w.matchWinner, 0);
  eq(w.roundWins.join(), '2,1');
});
test('timer: leader wins at time up; tie goes to sudden death', () => {
  const w = playingWorld({ timeLimit: 1 });
  w.players[1].score = 1;
  for (let k = 0; k < 60; k++) SG.stepWorld(w, null);
  eq(w.phase, 'roundEnd'); eq(w.roundWinner, 1); eq(w.endReason, 'time');
  const w2 = playingWorld({ timeLimit: 1 });
  let sd = false;
  for (let k = 0; k < 60; k++) if (SG.stepWorld(w2, null).some((e) => e.type === 'suddenDeath')) sd = true;
  assert(sd && w2.suddenDeath && w2.phase === 'playing', 'sudden death');
  const [a, b] = w2.players;
  b.x = 400; b.y = 300; a.x = 400; a.y = 258; a.vy = 5; a.onGround = false;
  SG.stepWorld(w2, null);
  eq(w2.phase, 'roundEnd'); eq(w2.roundWinner, 0); eq(w2.endReason, 'sudden');
});
test('practice (winScore 0) never ends', () => {
  const w = playingWorld({ winScore: 0 });
  const [a, b] = w.players;
  for (let i = 0; i < 20; i++) {
    b.invuln = 0; b.x = 400; b.y = 300; a.x = 400; a.y = 258; a.vy = 5; a.onGround = false;
    SG.stepWorld(w, null);
  }
  eq(a.score, 20); eq(w.phase, 'playing');
});
test('determinism: identical inputs give identical states on every stage', () => {
  for (const def of SG.STAGES) {
    const runOnce = () => {
      const w = SG.createWorld({ stageId: def.id, winScore: 99 });
      const rng = SG.makeRng(1234);
      const hashes = [];
      let inA = I(); let inB = I();
      for (let k = 0; k < 3000; k++) {
        if (k % 7 === 0) inA = I({ left: rng() < 0.4, right: rng() < 0.5, jumpPressed: rng() < 0.3, jumpHeld: rng() < 0.6 });
        else inA = Object.assign({}, inA, { jumpPressed: false });
        if (k % 5 === 0) inB = I({ left: rng() < 0.5, right: rng() < 0.4, jumpPressed: rng() < 0.3, jumpHeld: rng() < 0.6 });
        else inB = Object.assign({}, inB, { jumpPressed: false });
        SG.stepWorld(w, [inA, inB]);
        if (k % 50 === 0) hashes.push(SG.hashWorld(w));
      }
      return hashes.join('\n') + SG.hashWorld(w);
    };
    eq(runOnce(), runOnce(), def.id);
  }
});

// ---------------------------------------------------------------- AI
function aiMatch(levelA, levelB, ticks, stageId, seed) {
  const w = SG.createWorld({ stageId: stageId || 'meadow', winScore: 999 });
  const A = levelA === null ? null : SG.createAI(levelA, seed || 7);
  const B = SG.createAI(levelB, (seed || 7) + 1);
  for (let k = 0; k < ticks; k++) {
    const ia = A ? A.think(w, 0) : I();
    const ib = B.think(w, 1);
    SG.stepWorld(w, [ia, ib]);
  }
  return w;
}
test('AI uses legal inputs only and obeys physics (speed, bounds)', () => {
  const w = SG.createWorld({ stageId: 'neon', winScore: 999 });
  const ai = SG.createAI(5, 3);
  let prevX = w.players[1].x;
  for (let k = 0; k < 3000; k++) {
    const inp = ai.think(w, 1);
    const keys = Object.keys(inp).sort().join();
    eq(keys, 'jumpHeld,jumpPressed,left,right', 'input shape');
    SG.stepWorld(w, [I(), inp]);
    const p = w.players[1];
    assert(p.x >= 0 && p.x <= w.stage.width - p.w, 'in bounds');
    assert(Math.abs(p.vx) <= C.MOVE_SPEED, 'speed');
    assert(p.vy >= -C.JUMP_POWER - 1e-9 && p.vy <= C.MAX_FALL, 'vy range');
    const moved = Math.abs(p.x - prevX);
    assert(moved <= C.MOVE_SPEED + 30 + 3, 'no teleport (moved ' + moved + ')');
    prevX = p.x;
  }
});
test('AI does nothing during countdown', () => {
  const w = SG.createWorld({ stageId: 'meadow' });
  const ai = SG.createAI(5, 1);
  for (let k = 0; k < C.COUNTDOWN_TICKS - 1; k++) {
    const inp = ai.think(w, 1);
    assert(!inp.left && !inp.right && !inp.jumpPressed, 'idle in countdown');
    SG.stepWorld(w, [I(), inp]);
  }
});
test('AI is deterministic for a given seed', () => {
  eq(SG.hashWorld(aiMatch(3, 4, 2000, 'docks', 11)), SG.hashWorld(aiMatch(3, 4, 2000, 'docks', 11)));
});
test('AI level 5 can score against an idle player on every stage', () => {
  for (const def of SG.STAGES) {
    const w = aiMatch(null, 5, 60 * 40, def.id, 5);
    assert(w.players[1].score >= 3, def.id + ' L5 scored ' + w.players[1].score);
  }
});
test('AI difficulty ordering: higher levels beat lower levels over many games', () => {
  const pairs = [[1, 3], [2, 4], [3, 5]];
  for (const [lo, hi] of pairs) {
    let loPts = 0; let hiPts = 0;
    for (const st of ['meadow', 'docks', 'cavern', 'neon']) {
      for (const seed of [1, 2]) {
        const w = aiMatch(lo, hi, 60 * 60, st, seed);
        loPts += w.players[0].score; hiPts += w.players[1].score;
      }
    }
    assert(hiPts > loPts, `L${hi} (${hiPts}) should beat L${lo} (${loPts})`);
  }
});
test('AI level 5 is beatable: it gets stomped by level 4 sometimes', () => {
  let lost = 0;
  for (const st of ['meadow', 'docks', 'cavern', 'neon']) lost += aiMatch(4, 5, 60 * 60, st, 3).players[0].score;
  assert(lost > 0, 'L5 conceded ' + lost);
});
test('practice dummy never jumps', () => {
  const w = SG.createWorld({ stageId: 'meadow', winScore: 0 });
  const ai = SG.createAI(0, 1);
  for (let k = 0; k < 3000; k++) {
    const inp = ai.think(w, 1);
    assert(!inp.jumpPressed, 'dummy jumped');
    SG.stepWorld(w, [I(), inp]);
  }
});

// ---------------------------------------------------------------- game controller
if (SG.Game) require('./game-tests.js')(SG, { test, assert, eq, near, I });
if (SG.Game && SG.NET) require('./net-tests.js')(SG, { test, assert, eq, near, I });

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFAILURES:\n- ' + failures.join('\n- '));
  process.exitCode = 1;
}
