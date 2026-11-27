// ai.js — CPU opponents. The AI produces the SAME input structure a human produces
// ({left, right, jumpHeld, jumpPressed}) and goes through the same physics as everyone else.
//
// Fairness:
//  - It sees the opponent only through a reaction-delay buffer of PAST snapshots.
//  - It never reads the opponent's inputs.
//  - It may "imagine" its own jump arcs with the public physics rules (like a player does), and
//    extrapolate the opponent from the last snapshot it saw (level 5) — it never sees future states.
//  - Difficulty changes reaction delay, decision rate, aim error, mistakes and strategy only.
(function (root) {
  'use strict';
  const SG = root.SG;
  const C = SG.C;

  // level 0 = practice dummy (walks around, never attacks)
  const LEVELS = {
    0: { react: 30, interval: 40, err: 0, mistake: 0, plan: false, predict: false, dodge: 0, climb: false, invulnAware: false, awareness: 0, randomJump: 0, nearJump: 0 },
    1: { react: 30, interval: 26, err: 70, mistake: 0.4, plan: false, predict: false, dodge: 0.05, climb: false, invulnAware: false, awareness: 260, randomJump: 0.1, nearJump: 0.25 },
    2: { react: 22, interval: 16, err: 40, mistake: 0.3, plan: false, predict: false, dodge: 0.2, climb: false, invulnAware: false, awareness: 900, randomJump: 0.06, nearJump: 0.5 },
    3: { react: 16, interval: 12, err: 22, mistake: 0.3, plan: true, options: 'basic', predict: false, dodge: 0.35, climb: true, invulnAware: false, awareness: 9999, randomJump: 0, nearJump: 0 },
    4: { react: 9, interval: 6, err: 12, mistake: 0.12, plan: true, options: 'normal', predict: true, dodge: 0.75, climb: true, invulnAware: true, awareness: 9999, randomJump: 0, nearJump: 0 },
    5: { react: 6, interval: 4, err: 5, mistake: 0.06, plan: true, options: 'full', predict: true, dodge: 0.9, climb: true, invulnAware: true, awareness: 9999, randomJump: 0, nearJump: 0 },
  };
  SG.AI_LEVELS = LEVELS;

  const snap = (p) => ({
    index: p.index, x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, vy: p.vy, onGround: p.onGround,
    invuln: p.invuln, riding: p.riding, facing: p.facing, coyote: p.coyote, jumpBuffer: p.jumpBuffer,
    prevBottom: p.prevBottom, score: 0,
  });

  const mkInput = (dir, jumpHeld, jumpPressed) => ({ left: dir < 0, right: dir > 0, jumpHeld: !!jumpHeld, jumpPressed: !!jumpPressed });

  function cloneStage(stage) {
    return {
      width: stage.width,
      groundY: stage.groundY,
      platforms: stage.platforms.map((pl) => ({
        baseX: pl.baseX, baseY: pl.baseY, w: pl.w, h: pl.h, move: pl.move,
        x: pl.x, y: pl.y, prevX: pl.prevX, prevY: pl.prevY, dx: pl.dx, dy: pl.dy,
      })),
    };
  }

  function resetClone(clone, stage) {
    for (let i = 0; i < stage.platforms.length; i++) {
      const s = stage.platforms[i];
      const d = clone.platforms[i];
      d.x = s.x; d.y = s.y; d.prevX = s.prevX; d.prevY = s.prevY; d.dx = s.dx; d.dy = s.dy;
    }
  }

  function copyInto(dst, src) {
    for (const k in src) dst[k] = src[k];
    return dst;
  }

  SG.createAI = function (level, seed) {
    const cfg = LEVELS[level] || LEVELS[3];
    const rng = SG.makeRng((seed >>> 0) || 1);
    const hist = [];
    let plan = [];
    let nav = SG.NO_INPUT;
    let nextDecision = 0;
    let t = 0;
    let aimOffset = 0;
    let wanderTarget = -1;
    let stuck = 0;
    let lastX = -1;
    const ai = { level, cfg, mode: 'wait', planLen: 0, lastScore: 0 };

    ai.reset = function () {
      hist.length = 0;
      plan = [];
      nav = SG.NO_INPUT;
      nextDecision = 0;
      ai.mode = 'wait';
    };

    // Imagine one candidate action sequence for `ticks` ticks.
    function simulate(world, self, opp, cand, sc) {
      resetClone(sc, world.stage);
      const me = copyInto({}, self);
      const o = copyInto({}, opp);
      const inputs = [];
      const N = 48;
      let score = -1;
      for (let k = 0; k < N; k++) {
        const myCx = me.x + me.w / 2;
        const oCx = o.x + o.w / 2;
        let dir = cand.dir;
        if (k < cand.delay) dir = cand.walkDir;
        else if (cand.dir === 2) dir = Math.abs(oCx - myCx) < 4 ? 0 : Math.sign(oCx - myCx);
        const jk = k - cand.delay;
        const input = mkInput(dir, cand.jump ? jk >= 0 && jk < cand.hold : k < cand.hold, cand.jump && jk === 0);
        inputs.push(input);
        SG.updatePlatforms(sc, world.time + 1 + k);
        SG.stepPlayer(me, input, sc, true, null);
        if (cfg.predict) SG.stepPlayer(o, mkInput(Math.sign(o.vx), o.vy < 0, false), sc, true, null);
        else if (o.invuln > 0) o.invuln--;
        if (SG.overlaps(me, o)) {
          const iHit = me.vy > 0 && me.prevBottom <= o.y + C.STOMP_TOLERANCE;
          const theyHit = cfg.predict && o.vy > 0 && o.prevBottom <= me.y + C.STOMP_TOLERANCE && me.invuln <= k;
          if (theyHit && !iHit) { score = -1000; break; }
          if (iHit) {
            if (o.invuln > 0 && cfg.invulnAware) { score = -50; break; }
            score = 1000 - k * 8 - cand.delay * 2;
            inputs.length = k + 1;
            break;
          }
        }
      }
      return { score, inputs };
    }

    function candidates(grounded, self) {
      const out = [];
      // Decision quality scales with level: more imagined options at higher levels.
      const opt = cfg.options === 'full'
        ? { delays: [0, 5, 10], holds: [3, 8, 14, 30], dirs: [2, -1, 1, 0] }
        : cfg.options === 'normal'
          ? { delays: [0, 6], holds: [4, 10, 30], dirs: [2, -1, 1] }
          : { delays: [0], holds: [10, 30], dirs: [2] };
      if (grounded) {
        for (const delay of opt.delays) {
          for (const hold of opt.holds) {
            for (const dir of opt.dirs) out.push({ jump: true, delay, hold, dir, walkDir: 2 === dir ? 0 : dir });
          }
        }
        out.push({ jump: false, delay: 0, hold: 0, dir: 2, walkDir: 0 });
        out.push({ jump: false, delay: 0, hold: 0, dir: -1, walkDir: -1 });
        out.push({ jump: false, delay: 0, hold: 0, dir: 1, walkDir: 1 });
      } else {
        const holdNow = self.vy < 0 ? 30 : 0;
        for (const dir of [2, -1, 1, 0]) {
          out.push({ jump: false, delay: 0, hold: holdNow, dir, walkDir: dir });
          if (holdNow) out.push({ jump: false, delay: 0, hold: 0, dir, walkDir: dir });
        }
      }
      // walkDir for "delay" phases of homing plans: walk toward the opponent
      for (const c of out) if (c.dir === 2) c.walkDir = 3;
      return out;
    }

    function fixWalkDir(cands, self, opp) {
      const d = Math.sign(opp.x + opp.w / 2 - (self.x + self.w / 2));
      for (const c of cands) if (c.walkDir === 3) c.walkDir = d;
    }

    function startJumpPlan(dirFn, hold, len) {
      plan = [];
      for (let k = 0; k < len; k++) plan.push({ dirFn, hold, k });
    }

    function walkInput(self, goalX, dead) {
      const d = goalX - (self.x + self.w / 2);
      return mkInput(Math.abs(d) < (dead || 6) ? 0 : Math.sign(d), false, false);
    }

    function decide(world, self, opp, me) {
      const stage = world.stage;
      const myCx = self.x + self.w / 2;
      const oCx = opp.x + opp.w / 2;
      const dx = oCx - myCx;
      const myBottom = self.y + self.h;
      const oBottom = opp.y + opp.h;
      const grounded = self.onGround || self.coyote > 0;
      aimOffset = (rng() * 2 - 1) * cfg.err;

      // --- Practice dummy: wander between random points, never jump.
      if (level === 0) {
        if (wanderTarget < 0 || Math.abs(wanderTarget - myCx) < 8 || rng() < 0.15) wanderTarget = 40 + rng() * (stage.width - 80);
        nav = rng() < 0.3 ? SG.NO_INPUT : walkInput(self, wanderTarget, 8);
        ai.mode = 'wander';
        return;
      }

      // --- Defence: avoid being under a falling opponent, and avoid an invulnerable one.
      const meSafe = cfg.invulnAware && self.invuln > 15;
      const above = oBottom < self.y + 10 && Math.abs(dx) < 80 && opp.vy > -4 && self.y - oBottom < 170;
      const dangerous = cfg.invulnAware && opp.invuln > 15 && Math.abs(dx) < 150 && oBottom <= myBottom + 20;
      if (!meSafe && (above || dangerous) && rng() < cfg.dodge) {
        let away = dx > 0 ? -1 : 1;
        if (dx === 0) away = myCx < stage.width / 2 ? 1 : -1;
        if ((away < 0 && self.x < 30) || (away > 0 && self.x > stage.width - self.w - 30)) away = -away;
        nav = mkInput(away, false, false);
        ai.mode = 'evade';
        return;
      }

      // --- Limited awareness (level 1): wander if the opponent is far away.
      if (Math.abs(dx) > cfg.awareness) {
        if (wanderTarget < 0 || Math.abs(wanderTarget - myCx) < 10) wanderTarget = 40 + rng() * (stage.width - 80);
        nav = walkInput(self, wanderTarget);
        if (grounded && rng() < cfg.randomJump) startJumpPlan(() => (nav.left ? -1 : nav.right ? 1 : 0), 10 + Math.floor(rng() * 20), 30);
        ai.mode = 'wander';
        return;
      }

      // --- Attack planning (levels 3–5): imagine jump arcs and commit to the best stomp.
      if (cfg.plan && !(opp.invuln > 10 && cfg.invulnAware)) {
        let o = opp;
        if (cfg.predict) {
          // Extrapolate the stale observation forward by the reaction delay using public physics.
          const sc0 = cloneStage(stage);
          o = copyInto({}, opp);
          for (let k = 0; k < cfg.react; k++) {
            SG.updatePlatforms(sc0, world.time - cfg.react + 1 + k);
            SG.stepPlayer(o, mkInput(Math.sign(o.vx), o.vy < 0, false), sc0, true, null);
          }
        }
        const sc = cloneStage(stage);
        const cands = candidates(grounded, self);
        fixWalkDir(cands, self, o);
        let best = null;
        let danger = false;
        let safest = null;
        for (const c of cands) {
          const r = simulate(world, self, o, c, sc);
          if (r.score === -1000) danger = true;
          if (!best || r.score > best.score) best = r;
          // safest non-attacking option: prefer not jumping / small moves (first listed wins ties)
          if (r.score > -1000 && (!safest || r.score > safest.score)) safest = r;
        }
        ai.lastScore = best ? best.score : 0;
        if (best && best.score <= 0 && danger && safest && rng() < cfg.dodge) {
          // Some imagined futures end with me being stomped: take the safest one for a moment.
          plan = safest.inputs.slice(0, 10);
          ai.mode = 'defend';
          return;
        }
        if (best && best.score > 0) {
          if (rng() < cfg.mistake) {
            // Mistimed: hesitate a few ticks before executing.
            const wait = 3 + Math.floor(rng() * 10);
            plan = [];
            for (let k = 0; k < wait; k++) plan.push(SG.NO_INPUT);
            plan = plan.concat(best.inputs);
          } else {
            plan = best.inputs.slice();
          }
          ai.mode = 'attack';
          return;
        }
      }

      // --- Simple attack (levels 1–2): jump when close and roughly level.
      const adx = Math.abs(dx + aimOffset * 0.3);
      if (!cfg.plan && grounded && adx > 34 && adx < 110 && Math.abs(oBottom - myBottom) < 30) {
        if (rng() < cfg.nearJump) {
          startJumpPlan(null, 6 + Math.floor(rng() * 9), 40);
          ai.mode = 'attack';
          return;
        }
      }

      // --- Navigation.
      let goalX = oCx + aimOffset;
      ai.mode = 'chase';
      if (oBottom < myBottom - 30) {
        if (cfg.climb) {
          // Find a reachable platform (they are one-way: jump up through it from below).
          let bestPl = null;
          let bestCost = Infinity;
          for (const pl of stage.platforms) {
            if (pl.y >= myBottom - 8 || pl.y < myBottom - 112) continue;
            const pc = pl.x + pl.w / 2;
            const cost = Math.abs(pc - oCx) + Math.abs(pl.y - oBottom) * 0.6 + Math.abs(pc - myCx) * 0.4;
            if (cost < bestCost) { bestCost = cost; bestPl = pl; }
          }
          if (bestPl) {
            const inside = myCx > bestPl.x + 8 && myCx < bestPl.x + bestPl.w - 8;
            const near = myCx > bestPl.x - 40 && myCx < bestPl.x + bestPl.w + 40;
            if (grounded && (inside || near)) {
              const target = SG.clamp(oCx, bestPl.x + 12, bestPl.x + bestPl.w - 12);
              startJumpPlan((s) => {
                const d = target - (s.x + s.w / 2);
                return Math.abs(d) < 5 ? 0 : Math.sign(d);
              }, 30, 36);
              ai.mode = 'climb';
              return;
            }
            goalX = SG.clamp(myCx, bestPl.x + 15, bestPl.x + bestPl.w - 15);
            ai.mode = 'climb';
          }
        } else if (grounded && rng() < 0.3 && Math.abs(dx) < 140) {
          startJumpPlan(null, 30, 36);
          ai.mode = 'hop';
          return;
        }
      } else if (oBottom > myBottom + 30 && self.riding >= 0) {
        // Opponent is below: walk off the platform edge closest to them.
        const pl = stage.platforms[self.riding];
        if (Math.abs(dx) < pl.w) goalX = dx < 0 ? pl.x - 20 : pl.x + pl.w + 20;
        ai.mode = 'drop';
      }
      nav = walkInput(self, goalX);
      if (!cfg.plan && grounded && rng() < cfg.randomJump) startJumpPlan(null, 8 + Math.floor(rng() * 22), 30);
    }

    // Called once per simulation tick for player index `me`.
    ai.think = function (world, me) {
      const self = world.players[me];
      const oppNow = world.players[1 - me];
      hist.push(snap(oppNow));
      if (hist.length > 64) hist.shift();
      t++;
      if (world.phase !== 'playing') {
        plan = [];
        nav = SG.NO_INPUT;
        nextDecision = t + Math.floor(cfg.react / 2);
        ai.mode = 'wait';
        return SG.NO_INPUT;
      }
      const opp = hist[Math.max(0, hist.length - 1 - cfg.react)];

      // Unstick: walking into a wall for a while → hop.
      if (Math.abs(self.x - lastX) < 0.01 && (nav.left || nav.right) && plan.length === 0) stuck++;
      else stuck = 0;
      lastX = self.x;
      if (stuck > 20 && (self.onGround || self.coyote > 0) && level > 0) {
        stuck = 0;
        startJumpPlan(null, 30, 30);
      }

      const replan = cfg.plan && level >= 4 && t >= nextDecision;
      if (plan.length && !(replan && ai.mode !== 'attack')) {
        const step = plan.shift();
        ai.planLen = plan.length;
        if (step && step.k !== undefined) {
          // Lazily evaluated jump plan step.
          const myCx = self.x + self.w / 2;
          const d = step.dirFn ? step.dirFn(self) : Math.abs(opp.x + opp.w / 2 - myCx) < 5 ? 0 : Math.sign(opp.x + opp.w / 2 - myCx);
          return mkInput(d, step.k < step.hold, step.k === 0);
        }
        return step;
      }
      if (t >= nextDecision) {
        plan = [];
        nextDecision = t + cfg.interval + Math.floor(rng() * Math.max(1, cfg.interval / 2));
        decide(world, self, opp, me);
        if (plan.length) return ai.think.continuePlan(self, opp);
      }
      ai.planLen = plan.length;
      return { left: nav.left, right: nav.right, jumpHeld: false, jumpPressed: false };
    };

    ai.think.continuePlan = function (self, opp) {
      const step = plan.shift();
      ai.planLen = plan.length;
      if (step && step.k !== undefined) {
        const myCx = self.x + self.w / 2;
        const d = step.dirFn ? step.dirFn(self) : Math.abs(opp.x + opp.w / 2 - myCx) < 5 ? 0 : Math.sign(opp.x + opp.w / 2 - myCx);
        return mkInput(d, step.k < step.hold, step.k === 0);
      }
      return step || SG.NO_INPUT;
    };

    return ai;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
