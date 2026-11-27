// fighter.js — character art/animation and particle effects. Presentation only:
// nothing here reads input or writes simulation state, and visuals never change hitboxes
// (characters are drawn anchored to the 30x40 hitbox's feet).
(function (root) {
  'use strict';
  const SG = root.SG;

  const PAL = [
    { body: '#ea3f3a', shade: '#b4232a', light: '#ff9a87', ink: '#3a0b10', crest: '#ffb43c', crestTip: '#fff1a8', belly: '#ffd2c6', name: 'Ember' },
    { body: '#2f86ea', shade: '#1b56b0', light: '#9fd0ff', ink: '#0a1d3d', crest: '#7fe7ff', crestTip: '#e8fdff', belly: '#cfe7ff', name: 'Tide' },
  ];
  SG.PALETTE = PAL;

  // ============================================================== particles
  const MAX_PARTS = 420;
  const FX = {
    parts: [],
    shake: 0,
    flash: 0,
    flashColor: '#fff',
    ghosts: [],
    rng: SG.makeRng(12345),
    clear() {
      this.parts.length = 0;
      this.ghosts.length = 0;
      this.shake = 0;
      this.flash = 0;
    },
    add(p) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      this.parts.push(p);
    },
    r(a, b) { return a + (b - a) * this.rng(); },
    dust(x, y, n, spread, color) {
      for (let i = 0; i < n; i++) {
        this.add({ k: 'dot', x: x + this.r(-spread, spread), y, vx: this.r(-1.6, 1.6), vy: this.r(-1.8, -0.3), g: 0.06, life: this.r(16, 28), max: 28, size: this.r(2, 4.5), color: color || 'rgba(255,255,255,0.8)' });
      }
    },
    sideDust(x, y, dir) {
      for (let i = 0; i < 4; i++) this.add({ k: 'dot', x, y, vx: -dir * this.r(0.5, 2), vy: this.r(-1, -0.2), g: 0.05, life: 18, max: 18, size: this.r(2, 3.5), color: 'rgba(255,255,255,0.7)' });
    },
    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = this.r(0, Math.PI * 2);
        const s = this.r(speed * 0.4, speed);
        this.add({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.12, life: this.r(18, 32), max: 32, size: this.r(2, 4), color });
      }
    },
    stars(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + this.r(-1.3, 1.3);
        const s = this.r(2.5, 5);
        this.add({ k: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.15, life: this.r(28, 40), max: 40, size: this.r(5, 8), rot: this.r(0, 6), vr: this.r(-0.3, 0.3), color: '#ffe066' });
      }
    },
    ring(x, y, color, size, life) {
      this.add({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, life: life || 20, max: life || 20, size: size || 40, color });
    },
    text(x, y, str, color, size) {
      this.add({ k: 'text', x, y, vx: 0, vy: -0.9, g: 0.012, life: 60, max: 60, size: size || 22, color, str });
    },
    confetti(x0, x1, y, n) {
      const cols = ['#ff5a5a', '#ffd23f', '#3fd5ff', '#7cff6b', '#ff7ae6', '#ffffff'];
      for (let i = 0; i < n; i++) {
        this.add({ k: 'conf', x: this.r(x0, x1), y: y + this.r(-60, 0), vx: this.r(-1.5, 1.5), vy: this.r(-1, 2), g: 0.05, drag: 0.98, life: this.r(120, 200), max: 200, size: this.r(4, 8), rot: this.r(0, 6), vr: this.r(-0.25, 0.25), color: cols[i % cols.length] });
      }
    },
    trail(x, y, index) {
      this.add({ k: 'trail', x, y, vx: 0, vy: 0, g: 0, life: 10, max: 10, size: 1, color: PAL[index].light, who: index });
    },
    ghost(x, y, index, facing) {
      this.ghosts.push({ x, y, index, facing, t: 0 });
    },
    tick() {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.vy += p.g;
        if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
        p.x += p.vx;
        p.y += p.vy;
        if (p.vr) p.rot += p.vr;
        if (--p.life <= 0) this.parts.splice(i, 1);
      }
      for (let i = this.ghosts.length - 1; i >= 0; i--) if (++this.ghosts[i].t > 34) this.ghosts.splice(i, 1);
      this.shake *= 0.86;
      if (this.shake < 0.3) this.shake = 0;
      this.flash *= 0.8;
      if (this.flash < 0.02) this.flash = 0;
    },
    draw(ctx) {
      for (const g of this.ghosts) drawGhost(ctx, g);
      for (const p of this.parts) {
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = Math.min(1, a * 1.4);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        switch (p.k) {
          case 'dot':
          case 'spark':
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'star':
            starPath(ctx, p.x, p.y, p.size, p.rot);
            ctx.fill();
            break;
          case 'ring':
            ctx.lineWidth = 3 * a + 0.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - a) + 6, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'text':
            ctx.font = `900 ${p.size}px "Trebuchet MS", "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.strokeText(p.str, p.x, p.y);
            ctx.fillText(p.str, p.x, p.y);
            break;
          case 'conf':
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
            break;
          case 'trail':
            ctx.globalAlpha = a * 0.35;
            roundRect(ctx, p.x + 2, p.y + 2, 26, 36, 11);
            ctx.fill();
            break;
          default:
            break;
        }
      }
      ctx.globalAlpha = 1;
    },
  };
  SG.FX = FX;

  function starPath(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = rot + (i * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  SG.starPath = starPath;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  SG.roundRect = roundRect;

  // ============================================================== per-player animation state
  SG.createVis = function (index) {
    return { index, sy: 1, vsy: 0, walk: 0, lean: 0, happy: 0, hurt: 0, spawn: 0, blinkT: 90 + index * 37, blink: 0, result: null, t: 0, lastLand: 0, eyeY: 0 };
  };

  // Called once per simulation tick (presentation only).
  SG.tickVis = function (v, p, phase) {
    v.t++;
    const air = !p.onGround;
    let target = 1;
    if (air) target = p.vy < 0 ? 1 + Math.min(-p.vy, 12) / 70 : 1 + Math.min(p.vy, 14) / 90;
    else if (p.vx === 0 && !v.result) target = 1 + Math.sin(v.t * 0.08) * 0.02; // idle breathing
    v.vsy += (target - v.sy) * 0.28;
    v.vsy *= 0.72;
    v.sy += v.vsy;
    v.sy = SG.clamp(v.sy, 0.55, 1.35);
    if (!air && p.vx !== 0) v.walk += 0.32;
    else v.walk *= 0.8;
    v.lean += ((p.vx / 4) * 0.09 - v.lean) * 0.25;
    v.eyeY += ((air ? (p.vy < 0 ? -1.5 : 1.5) : 0) - v.eyeY) * 0.3;
    if (v.happy > 0) v.happy--;
    if (v.hurt > 0) v.hurt--;
    if (v.spawn > 0) v.spawn--;
    if (--v.blinkT <= 0) { v.blink = 7; v.blinkT = 150 + ((v.t * 37) % 120); }
    if (v.blink > 0) v.blink--;
    if (air && p.vy > 7 && v.t % 2 === 0) FX.trail(p.x, p.y, p.index);
    if (phase === 'countdown') v.result = null;
  };

  SG.visEvent = function (v, ev, p) {
    switch (ev.type) {
      case 'jump':
        v.sy = 1.28; v.vsy = 0;
        FX.dust(p.x + p.w / 2, p.y + p.h, 5, 10);
        break;
      case 'land': {
        const s = Math.min(ev.speed || 0, 14);
        v.sy = 1 - s / 30; v.vsy = 0;
        if (s > 3) FX.dust(p.x + p.w / 2, p.y + p.h, 3 + Math.round(s / 2), 14);
        break;
      }
      case 'stompTop':
        v.sy = 0.62; v.vsy = 0; v.happy = 40;
        break;
      case 'respawn':
        v.spawn = 20; v.hurt = 0; v.sy = 1; v.vsy = 0;
        break;
      default:
        break;
    }
  };

  // ============================================================== drawing
  // (x, y) = hitbox top-left in world coordinates. Drawn anchored at feet centre.
  SG.drawFighter = function (ctx, p, v, x, y, opts) {
    const pal = PAL[p.index];
    const cx = x + p.w / 2;
    const by = y + p.h;
    let sy = v.sy;
    let hop = 0;
    let mood = 'normal';
    if (v.result === 'win') { hop = -Math.abs(Math.sin(v.t * 0.16)) * 12; mood = 'happy'; }
    else if (v.result === 'lose') { sy = 0.88; mood = 'sad'; }
    if (v.happy > 0) mood = 'happy';
    if (!p.onGround && p.vy > 8) mood = mood === 'happy' ? mood : 'fierce';
    const sx = 1 + (1 - sy) * 0.9;
    let alpha = 1;
    if (p.invuln > 0) alpha = Math.floor(p.invuln / 5) % 2 === 0 ? 0.35 : 1; // Day 1 blink rhythm, readable
    let pop = 1;
    if (v.spawn > 0) pop = 1 - Math.pow(v.spawn / 20, 2) * 0.6;

    ctx.save();
    ctx.globalAlpha = alpha * (opts && opts.alpha !== undefined ? opts.alpha : 1);
    // ground shadow
    if (p.onGround) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, by + 1, 16 * sx, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(cx, by + hop);
    ctx.rotate(v.lean);
    ctx.scale(sx * pop, sy * pop);
    const f = p.facing || 1;

    // feet
    const step = Math.sin(v.walk);
    const air = !p.onGround;
    ctx.fillStyle = pal.ink;
    for (const side of [-1, 1]) {
      const ph = side * step;
      const fx = side * 8 + (air ? side * 1.5 : ph * 3.5);
      const fy = air ? -1 + (p.vy < 0 ? -3 : 2) : -2.5 - Math.max(0, ph) * 3;
      ctx.beginPath();
      ctx.ellipse(fx + f * 2, fy, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // crest (silhouette identifier) — Ember: flame tuft · Tide: wave curl
    if (p.index === 0) {
      ctx.fillStyle = pal.crest;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const w = Math.sin(v.t * 0.25) * 1.5;
      ctx.moveTo(-10, -38);
      ctx.quadraticCurveTo(-12 + w, -50, -6, -55 + w);
      ctx.quadraticCurveTo(-4, -47, -1, -46);
      ctx.quadraticCurveTo(0 - w, -58, 6, -61);
      ctx.quadraticCurveTo(5, -50, 8, -47);
      ctx.quadraticCurveTo(12 + w, -52, 13, -54);
      ctx.quadraticCurveTo(14, -44, 10, -38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.crestTip;
      ctx.beginPath();
      ctx.ellipse(2, -48, 2.5, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2.5;
      ctx.fillStyle = pal.crest;
      ctx.beginPath();
      const w = Math.sin(v.t * 0.12) * 1.2;
      ctx.moveTo(-12, -38);
      ctx.bezierCurveTo(-14, -52, 4, -60 + w, 12, -52);
      ctx.bezierCurveTo(16, -48, 10, -42, 5, -45);
      ctx.bezierCurveTo(1, -47, 1, -52, 6, -52);
      ctx.bezierCurveTo(0, -56, -6, -48, -4, -38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.crestTip;
      ctx.beginPath();
      ctx.arc(-6, -48, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // body
    const top = -42;
    const bottom = -3;
    ctx.fillStyle = pal.body;
    roundRect(ctx, -17, top, 34, bottom - top, 15);
    ctx.fill();
    // shading
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pal.shade;
    ctx.beginPath();
    ctx.ellipse(-f * 4, bottom + 4, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.light;
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.ellipse(-f * 8, top + 9, 6, 4, -0.5 * f, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = pal.ink;
    roundRect(ctx, -17, top, 34, bottom - top, 15);
    ctx.stroke();

    // belly emblem (shape-coded: ▲ for P1, ● for P2 — colour-blind friendly)
    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.ellipse(f * 1.5, -13, 9, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.shade;
    if (p.index === 0) {
      ctx.beginPath();
      ctx.moveTo(f * 1.5, -18.5);
      ctx.lineTo(f * 1.5 + 5.5, -9.5);
      ctx.lineTo(f * 1.5 - 5.5, -9.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(f * 1.5, -13, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // face
    const ex = f * 4;
    const ey = -29 + v.eyeY;
    ctx.fillStyle = 'rgba(255,120,140,0.45)';
    ctx.beginPath();
    ctx.ellipse(ex - 10, ey + 7, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(ex + 10, ey + 7, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.lineCap = 'round';
    if (mood === 'happy') {
      ctx.lineWidth = 2.6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex + s * 6, ey + 1.5, 3.6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ex, ey + 6, 4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (v.blink > 0 && mood !== 'fierce') {
      ctx.lineWidth = 2.4;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ex + s * 6 - 3.5, ey);
        ctx.lineTo(ex + s * 6 + 3.5, ey);
        ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ex + s * 6, ey, 4.6, mood === 'sad' ? 4.2 : 5.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = pal.ink;
        ctx.beginPath();
        ctx.arc(ex + s * 6 + f * 1.6, ey + (mood === 'sad' ? 1.5 : 0.5) + v.eyeY * 0.6, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex + s * 6 + f * 1.6 + 0.9, ey - 0.6, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mood === 'fierce') {
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(ex - 10, ey - 8); ctx.lineTo(ex - 3, ey - 5.5);
        ctx.moveTo(ex + 10, ey - 8); ctx.lineTo(ex + 3, ey - 5.5);
        ctx.stroke();
      } else if (mood === 'sad') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ex - 10, ey - 5); ctx.lineTo(ex - 3, ey - 8);
        ctx.moveTo(ex + 10, ey - 5); ctx.lineTo(ex + 3, ey - 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey + 10, 3.5, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
        // sweat drop
        ctx.fillStyle = '#9fe0ff';
        ctx.beginPath();
        ctx.ellipse(ex + f * 13, ey - 4 + ((v.t * 0.3) % 6), 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey + 6.5, 2.6, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  // Squashed "pancake" left behind where a fighter was stomped (then poofs).
  function drawGhost(ctx, g) {
    const pal = PAL[g.index];
    const k = g.t / 34;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(g.x, g.y + 40);
    const sy = 0.35 + k * 0.1;
    ctx.scale(1.45 - k * 0.3, sy);
    ctx.fillStyle = pal.body;
    roundRect(ctx, -17, -42, 34, 39, 15);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
    ctx.restore();
    // dizzy stars circling
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
      const a = g.t * 0.3 + (i * Math.PI * 2) / 3;
      starPath(ctx, g.x + Math.cos(a) * 16, g.y + 30 + Math.sin(a) * 4, 4, a);
      ctx.fill();
    }
    ctx.restore();
  }

  // Small emblem used in HUD/labels.
  SG.drawEmblem = function (ctx, index, x, y, r) {
    const pal = PAL[index];
    ctx.fillStyle = pal.body;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (index === 0) {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.95, y + r * 0.7);
      ctx.lineTo(x - r * 0.95, y + r * 0.7);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
