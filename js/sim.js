// sim.js — deterministic match simulation. No DOM, no randomness, no wall-clock time.
// Every call to stepWorld() advances exactly one 1/60 s tick from explicit per-player inputs.
// Player physics and player-vs-player rules are identical to the Day 1 prototype;
// the only additions are moving-platform carrying, rounds/timer and presentation events.
(function (root) {
  'use strict';
  const SG = root.SG;
  const C = SG.C;
  const clamp = SG.clamp;

  // ===== Stage / platforms =====
  function motionOffset(m, time) {
    const t = (((time + m.phase) % m.period) + m.period) % m.period;
    const u = t / m.period;
    const tri = u < 0.5 ? u * 2 : 2 - u * 2;
    return m.range * (tri * tri * (3 - 2 * tri)); // smoothstep ping-pong in [0, range]
  }

  function placePlatform(pl, time) {
    if (!pl.move) {
      pl.x = pl.baseX;
      pl.y = pl.baseY;
    } else if (pl.move.axis === 'x') {
      pl.x = pl.baseX + pl.move.dir * motionOffset(pl.move, time);
      pl.y = pl.baseY;
    } else {
      pl.x = pl.baseX;
      pl.y = pl.baseY - motionOffset(pl.move, time);
    }
  }

  SG.buildStage = function (def) {
    const W = def.width;
    const platforms = [];
    const add = (src, mirrored) => {
      const x = mirrored ? W - src.x - src.w : src.x;
      const move = src.move
        ? {
            axis: src.move.axis,
            range: src.move.range,
            period: src.move.period,
            phase: src.move.phase || 0,
            dir: src.move.axis === 'x' && mirrored ? -1 : 1,
          }
        : null;
      platforms.push({ baseX: x, baseY: src.y, w: src.w, h: C.PLATFORM_H, move, x, y: src.y, prevX: x, prevY: src.y, dx: 0, dy: 0 });
    };
    for (const p of def.platforms) {
      add(p, false);
      if (p.mirror) add(p, true);
    }
    const stage = {
      def,
      id: def.id,
      width: W,
      groundY: def.groundY,
      platforms,
      spawns: [def.spawnX, W - def.spawnX - C.PLAYER_W],
      scrolling: W > C.VIEW_W,
    };
    SG.resetPlatforms(stage, 0);
    return stage;
  };

  SG.resetPlatforms = function (stage, time) {
    for (const pl of stage.platforms) {
      placePlatform(pl, time);
      pl.prevX = pl.x;
      pl.prevY = pl.y;
      pl.dx = 0;
      pl.dy = 0;
    }
  };

  SG.updatePlatforms = function (stage, time) {
    for (const pl of stage.platforms) {
      pl.prevX = pl.x;
      pl.prevY = pl.y;
      placePlatform(pl, time);
      pl.dx = pl.x - pl.prevX;
      pl.dy = pl.y - pl.prevY;
    }
  };

  // ===== Players =====
  SG.createPlayer = function (index, stage) {
    const p = { index, w: C.PLAYER_W, h: C.PLAYER_H, score: 0, invuln: 0 };
    SG.spawnPlayer(p, stage);
    return p;
  };

  SG.spawnPlayer = function (p, stage) {
    p.x = stage.spawns[p.index];
    p.y = stage.groundY - p.h;
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
    p.facing = p.index === 0 ? 1 : -1;
    p.coyote = C.COYOTE_TICKS;
    p.jumpBuffer = 0;
    p.riding = -1;
    p.prevBottom = p.y + p.h;
  };

  // One player's movement: input → velocity → position → terrain. (Same order as Day 1.)
  SG.stepPlayer = function (p, input, stage, canAct, ev) {
    const wasGround = p.onGround;

    // Moving platform carry (before own movement, so a rider keeps their footing).
    if (p.riding >= 0) {
      const pl = stage.platforms[p.riding];
      p.x += pl.dx;
      p.y = pl.y - p.h;
    }
    p.x = clamp(p.x, 0, stage.width - p.w);
    p.prevBottom = p.y + p.h;

    p.vx = 0;
    if (canAct && input.left) p.vx -= C.MOVE_SPEED;
    if (canAct && input.right) p.vx += C.MOVE_SPEED;
    if (p.vx !== 0) p.facing = Math.sign(p.vx);
    p.x = clamp(p.x + p.vx, 0, stage.width - p.w);

    if (canAct && input.jumpPressed) p.jumpBuffer = C.JUMP_BUFFER_TICKS;
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = -C.JUMP_POWER;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      if (ev) ev.push({ type: 'jump', who: p.index });
    }
    if (!input.jumpHeld && p.vy < 0) p.vy *= C.JUMP_CUT;

    p.vy = Math.min(p.vy + C.GRAVITY, C.MAX_FALL);
    p.y += p.vy;

    const rodeOn = p.riding;
    const impact = p.vy;
    p.onGround = false;
    p.riding = -1;
    const bottom = p.y + p.h;
    if (bottom >= stage.groundY) {
      p.y = stage.groundY - p.h;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy >= 0) {
      // One-way platforms: land only when coming from above (pass through from below).
      let best = -1;
      for (let i = 0; i < stage.platforms.length; i++) {
        const pl = stage.platforms[i];
        if (!(p.x + p.w > pl.x && p.x < pl.x + pl.w)) continue;
        const topBefore = i === rodeOn ? pl.y : pl.prevY;
        if (p.prevBottom <= topBefore && bottom >= pl.y && (best < 0 || pl.y < stage.platforms[best].y)) best = i;
      }
      if (best >= 0) {
        p.y = stage.platforms[best].y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.riding = best;
      }
    }
    if (ev && p.onGround && !wasGround) ev.push({ type: 'land', who: p.index, speed: impact });

    p.coyote = p.onGround ? C.COYOTE_TICKS : Math.max(0, p.coyote - 1);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - 1);
    if (p.invuln > 0) p.invuln--;
  };

  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  SG.overlaps = overlaps;

  // Stomp: was above the victim's head last tick, is falling, and the victim is not invulnerable.
  const isStomp = (top, bottom) => top.vy > 0 && top.prevBottom <= bottom.y + C.STOMP_TOLERANCE && bottom.invuln === 0;
  SG.isStomp = isStomp;

  // Player-vs-player, evaluated once after BOTH players moved (no update-order advantage).
  SG.resolvePlayers = function (a, b, stage, ev) {
    if (!overlaps(a, b)) return null;
    const aStomps = isStomp(a, b);
    const bStomps = isStomp(b, a);
    if (aStomps !== bStomps) {
      const top = aStomps ? a : b;
      const bottom = aStomps ? b : a;
      const hitX = bottom.x + bottom.w / 2;
      const hitY = bottom.y;
      const victimFacing = bottom.facing;
      top.vy = -C.STOMP_BOUNCE;
      top.onGround = false;
      top.coyote = 0;
      top.riding = -1;
      SG.spawnPlayer(bottom, stage);
      bottom.invuln = C.RESPAWN_INVULN;
      if (ev) ev.push({ type: 'stomp', top: top.index, bottom: bottom.index, x: hitX, y: hitY, facing: victimFacing });
      return { top: top.index, bottom: bottom.index };
    }
    // Not a stomp → push apart by half the overlap each (fair).
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
    a.x += (dir * overlapX) / 2;
    b.x -= (dir * overlapX) / 2;
    a.x = clamp(a.x, 0, stage.width - a.w);
    b.x = clamp(b.x, 0, stage.width - b.w);
    if (ev) ev.push({ type: 'bump', x: (a.x + b.x + a.w) / 2, y: Math.max(a.y, b.y) + 20, strength: overlapX });
    return null;
  };

  // ===== Match / rounds =====
  // opts: { stageId, mode, winScore (0 = endless), bestOf (1/3/5), timeLimit (s, 0 = off), cpuLevel }
  SG.createWorld = function (opts) {
    const o = Object.assign({ stageId: 'meadow', mode: 'versus', winScore: 5, bestOf: 1, timeLimit: 0, cpuLevel: 3 }, opts || {});
    const stage = SG.buildStage(SG.getStageDef(o.stageId));
    const w = {
      opts: o,
      stage,
      players: [SG.createPlayer(0, stage), SG.createPlayer(1, stage)],
      roundWins: [0, 0],
      round: 1,
      matchWinner: -1,
      totalTicks: 0,
      stats: { stomps: [0, 0], longestStreak: [0, 0], streak: [0, 0] },
      events: [],
    };
    startRound(w);
    return w;
  };

  SG.roundsToWin = (w) => Math.ceil((w.opts.bestOf || 1) / 2);

  function startRound(w) {
    w.phase = 'countdown';
    w.countdown = C.COUNTDOWN_TICKS;
    w.tick = 0;
    w.time = 0;
    w.phaseTimer = 0;
    w.suddenDeath = false;
    w.roundWinner = -1;
    w.endReason = '';
    w.stats.streak = [0, 0];
    SG.resetPlatforms(w.stage, 0);
    for (const p of w.players) {
      p.score = 0;
      p.invuln = 0;
      SG.spawnPlayer(p, w.stage);
    }
    w.events.push({ type: 'roundStart', round: w.round });
  }

  function endRound(w, winner, reason) {
    w.phase = 'roundEnd';
    w.phaseTimer = 0;
    w.roundWinner = winner;
    w.endReason = reason;
    w.roundWins[winner]++;
    if (w.roundWins[winner] >= SG.roundsToWin(w)) w.matchWinner = winner;
    w.events.push({ type: 'roundEnd', winner, reason, matchOver: w.matchWinner >= 0 });
  }

  SG.stepWorld = function (w, inputs) {
    w.events = [];
    const ev = w.events;

    if (w.phase === 'countdown') {
      w.countdown--;
      if (w.countdown <= 0) {
        w.phase = 'playing';
        ev.push({ type: 'go' });
      } else if (w.countdown % C.TICK_RATE === 0) {
        ev.push({ type: 'count', n: w.countdown / C.TICK_RATE });
      }
    } else if (w.phase === 'playing') {
      w.tick++;
      w.totalTicks++;
      const limit = (w.opts.timeLimit || 0) * C.TICK_RATE;
      if (limit > 0 && !w.suddenDeath && w.tick >= limit) {
        const [a, b] = w.players;
        if (a.score !== b.score) endRound(w, a.score > b.score ? 0 : 1, 'time');
        else {
          w.suddenDeath = true;
          ev.push({ type: 'suddenDeath' });
        }
      }
    } else {
      w.phaseTimer++;
    }

    const canAct = w.phase === 'playing';
    w.time++;
    SG.updatePlatforms(w.stage, w.time);
    const NO = SG.NO_INPUT;
    SG.stepPlayer(w.players[0], (inputs && inputs[0]) || NO, w.stage, canAct, ev);
    SG.stepPlayer(w.players[1], (inputs && inputs[1]) || NO, w.stage, canAct, ev);

    if (canAct) {
      const hit = SG.resolvePlayers(w.players[0], w.players[1], w.stage, ev);
      if (hit) {
        const top = w.players[hit.top];
        top.score++;
        const s = w.stats;
        s.stomps[hit.top]++;
        s.streak[hit.top]++;
        s.streak[hit.bottom] = 0;
        s.longestStreak[hit.top] = Math.max(s.longestStreak[hit.top], s.streak[hit.top]);
        ev.push({ type: 'score', who: hit.top, score: top.score });
        const winScore = w.opts.winScore || 0;
        if (w.suddenDeath) endRound(w, hit.top, 'sudden');
        else if (winScore > 0 && top.score >= winScore) endRound(w, hit.top, 'score');
      }
    }

    if (w.phase === 'roundEnd' && w.phaseTimer >= C.ROUND_END_TICKS) {
      if (w.matchWinner >= 0) {
        w.phase = 'matchEnd';
        w.phaseTimer = 0;
        ev.push({ type: 'matchEnd', winner: w.matchWinner });
      } else {
        w.round++;
        startRound(w);
      }
    }
    return ev;
  };

  // Compact state fingerprint for determinism tests and the debug overlay.
  SG.hashWorld = function (w) {
    const r = (v) => Math.round(v * 1e6) / 1e6;
    const ps = w.players.map((p) => [r(p.x), r(p.y), r(p.vx), r(p.vy), p.score, p.invuln, p.coyote, p.jumpBuffer, p.riding].join(','));
    return [w.phase, w.tick, w.time, w.round, w.roundWins.join('/'), ps.join('|')].join(';');
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
