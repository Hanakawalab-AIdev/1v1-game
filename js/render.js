// render.js — camera, stage art, world rendering, HUD and debug overlay.
// Pure presentation: reads world state, never modifies it.
(function (root) {
  'use strict';
  const SG = root.SG;
  const C = SG.C;
  const VW = C.VIEW_W;
  const VH = C.VIEW_H;
  const FONT = '"Trebuchet MS", "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif';
  SG.FONT = FONT;

  // ============================================================== camera
  // World → screen: screen = (world - (x, top)) * zoom. Bottom of the view stays at world y = 400.
  SG.createCamera = function (stage) {
    const cam = { x: 0, top: 0, zoom: 1, stage };
    SG.snapCamera(cam, null);
    return cam;
  };
  function camTarget(cam, players) {
    const st = cam.stage;
    if (!st.scrolling || !players) {
      const zoom = st.scrolling ? VW / st.width : 1;
      return { zoom, cx: st.width / 2 };
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of players) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x + p.w);
    }
    const zoom = SG.clamp(VW / (x1 - x0 + 380), VW / st.width, 1);
    return { zoom, cx: (x0 + x1) / 2 };
  }
  function applyCam(cam, zoom, cx) {
    const st = cam.stage;
    cam.zoom = zoom;
    const viewW = VW / zoom;
    cam.x = SG.clamp(cx - viewW / 2, 0, Math.max(0, st.width - viewW));
    cam.top = VH - VH / zoom;
    cam.cx = cx;
  }
  SG.snapCamera = function (cam, players) {
    const t = camTarget(cam, players);
    applyCam(cam, t.zoom, t.cx);
  };
  // Frame-rate independent smoothing (dt in seconds). Camera never affects physics.
  SG.updateCamera = function (cam, players, dt) {
    if (!cam.stage.scrolling) return applyCam(cam, 1, cam.stage.width / 2);
    const t = camTarget(cam, players);
    const k = 1 - Math.exp(-dt * 4.5);
    const zoom = cam.zoom + (t.zoom - cam.zoom) * k;
    const cx = (cam.cx === undefined ? t.cx : cam.cx) + (t.cx - (cam.cx === undefined ? t.cx : cam.cx)) * k;
    applyCam(cam, zoom, cx);
  };

  // ============================================================== stage themes
  const THEMES = {
    meadow: {
      sky: ['#5fb8ff', '#bfe6ff', '#e8f7ff'],
      far: '#a9d9a0', mid: '#86c47c', farAmp: 50, midAmp: 30,
      ground: '#8a5a32', groundDark: '#6d4424', top: '#58b947', topLight: '#7fd86a',
      plat: '#a1673b', platDark: '#6e4123', platTop: '#5cc14c', platTopLight: '#86e070',
      mover: '#b57b47', rail: 'rgba(80,50,20,0.25)',
    },
    docks: {
      sky: ['#ff8a5c', '#ffb77a', '#ffe0a8'],
      far: '#c0627a', mid: '#8f4a6a', farAmp: 28, midAmp: 0,
      ground: '#7a4a2f', groundDark: '#55311d', top: '#a8714b', topLight: '#c98d62',
      plat: '#9a6440', platDark: '#5e3a22', platTop: '#c48a5c', platTopLight: '#e0a878',
      mover: '#8b5a36', rail: 'rgba(255,255,255,0.25)',
    },
    cavern: {
      sky: ['#140b26', '#2a1748', '#3b2160'],
      far: '#241540', mid: '#311c55', farAmp: 40, midAmp: 30,
      ground: '#3a2d52', groundDark: '#271e3a', top: '#5e4b82', topLight: '#7d68a8',
      plat: '#54467a', platDark: '#322850', platTop: '#8fe6ff', platTopLight: '#d4f7ff',
      mover: '#475a8a', rail: 'rgba(143,230,255,0.25)',
    },
    neon: {
      sky: ['#070a26', '#141a4a', '#2c1b55'],
      far: '#1a1c48', mid: '#24275f', farAmp: 0, midAmp: 0,
      ground: '#23243a', groundDark: '#17182a', top: '#ff3df5', topLight: '#ff9cf9',
      plat: '#353a66', platDark: '#1e2142', platTop: '#39f3ff', platTopLight: '#c4fcff',
      mover: '#41306e', moverTop: '#ff5cf2', rail: 'rgba(255,92,242,0.28)',
    },
  };
  SG.THEMES = THEMES;

  function ridge(ctx, cam, f, baseScreenY, amp, color, seed, step) {
    // Parallax silhouette drawn in screen space; u = parallax world coordinate.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, VH);
    const z = cam.zoom;
    for (let sx = 0; sx <= VW + step; sx += step) {
      const u = (sx / z + cam.x * f) * 1;
      const h = amp * (0.55 + 0.25 * Math.sin(u * 0.011 + seed) + 0.2 * Math.sin(u * 0.027 + seed * 2.1));
      ctx.lineTo(sx, baseScreenY - h * z);
    }
    ctx.lineTo(VW, VH);
    ctx.closePath();
    ctx.fill();
  }

  function skyline(ctx, cam, f, baseY, color, seed, windowCol, time) {
    const z = Math.max(cam.zoom, 0.6);
    const u0 = cam.x * f;
    const bw = 46 * z;
    const first = Math.floor(u0 / 46) - 1;
    for (let i = first; i < first + Math.ceil(VW / bw) + 3; i++) {
      const hgt = (60 + SG.hash01(i * 7 + seed) * 110) * z;
      const sx = (i * 46 - u0) * z;
      const w = bw - 4 * z;
      ctx.fillStyle = color;
      ctx.fillRect(sx, baseY - hgt, w, hgt + 2);
      if (windowCol) {
        for (let wy = 0; wy < hgt - 14 * z; wy += 12 * z) {
          for (let wx = 5 * z; wx < w - 6 * z; wx += 10 * z) {
            const hsh = SG.hash01(i * 131 + Math.round(wy) * 17 + Math.round(wx) * 3 + seed);
            if (hsh < 0.33) {
              const flick = hsh < 0.02 && Math.floor(time / 40 + i) % 3 === 0;
              ctx.fillStyle = flick ? 'rgba(0,0,0,0)' : hsh < 0.12 ? windowCol[0] : windowCol[1];
              ctx.fillRect(sx + wx, baseY - hgt + 8 * z + wy, 4 * z, 5 * z);
            }
          }
        }
      }
    }
  }

  // Background in screen space (behind the world transform).
  function drawBackdrop(ctx, stage, cam, time) {
    const th = THEMES[stage.def.theme];
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.6, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    const groundScreen = (stage.groundY - cam.top) * cam.zoom;
    const theme = stage.def.theme;
    if (theme === 'meadow') {
      // sun
      const sg = ctx.createRadialGradient(660, 70, 10, 660, 70, 90);
      sg.addColorStop(0, 'rgba(255,250,210,1)');
      sg.addColorStop(0.3, 'rgba(255,240,170,0.9)');
      sg.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(560, -30, 200, 200);
      // clouds
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 197 + time * (0.12 + i * 0.03)) % (VW + 200)) - 100;
        const cy = 40 + ((i * 53) % 90);
        cloud(ctx, cx, cy, 0.7 + (i % 3) * 0.2);
      }
      ridge(ctx, cam, 0.15, groundScreen - 40 * cam.zoom, th.farAmp * 2.2, th.far, 1.3, 16);
      ridge(ctx, cam, 0.4, groundScreen, th.midAmp * 2.4, th.mid, 4.1, 16);
    } else if (theme === 'docks') {
      // big setting sun on the horizon + sea
      const hz = groundScreen - 70 * cam.zoom;
      const sg = ctx.createRadialGradient(400, hz, 10, 400, hz, 180);
      sg.addColorStop(0, 'rgba(255,245,200,1)');
      sg.addColorStop(0.35, 'rgba(255,200,120,0.9)');
      sg.addColorStop(1, 'rgba(255,160,100,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(200, hz - 190, 400, 380);
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(400, hz, 58, Math.PI, 0);
      ctx.fill();
      ridge(ctx, cam, 0.1, hz + 2, th.farAmp, th.far, 2.2, 20);
      const sea = ctx.createLinearGradient(0, hz, 0, groundScreen);
      sea.addColorStop(0, '#d9667a');
      sea.addColorStop(1, '#6b3a73');
      ctx.fillStyle = sea;
      ctx.fillRect(0, hz, VW, groundScreen - hz + 2);
      ctx.fillStyle = 'rgba(255,230,170,0.55)';
      for (let i = 0; i < 14; i++) {
        const y = hz + 6 + i * ((groundScreen - hz) / 14);
        const w = 90 - i * 4 + Math.sin(time * 0.05 + i) * 12;
        ctx.fillRect(400 - w / 2 + Math.sin(time * 0.03 + i * 1.7) * 8, y, w, 2);
      }
      // gulls
      ctx.strokeStyle = 'rgba(60,20,40,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const gx = ((time * (0.4 + i * 0.1) + i * 260) % (VW + 100)) - 50;
        const gy = 60 + i * 30 + Math.sin(time * 0.05 + i) * 6;
        const fl = Math.sin(time * 0.2 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(gx - 8, gy - fl);
        ctx.quadraticCurveTo(gx - 4, gy - 4, gx, gy);
        ctx.quadraticCurveTo(gx + 4, gy - 4, gx + 8, gy - fl);
        ctx.stroke();
      }
    } else if (theme === 'cavern') {
      // stalactites (top) and glowing crystals in the far wall
      ctx.fillStyle = th.far;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let sx = 0; sx <= VW; sx += 25) {
        const h = 20 + SG.hash01(Math.floor(sx / 25) + 3) * 50;
        ctx.lineTo(sx, 0);
        ctx.lineTo(sx + 12, h);
      }
      ctx.lineTo(VW, 0);
      ctx.fill();
      ridge(ctx, cam, 0.2, groundScreen - 20, th.farAmp * 2.5, th.far, 0.7, 14);
      ridge(ctx, cam, 0.45, groundScreen, th.midAmp * 2, th.mid, 3.3, 14);
      for (let i = 0; i < 9; i++) {
        const x = 40 + i * 92 + (i % 2) * 20;
        const y = groundScreen - 40 - SG.hash01(i + 40) * 140;
        const pulse = 0.55 + 0.45 * Math.sin(time * 0.04 + i * 1.3);
        crystal(ctx, x, y, 8 + (i % 3) * 4, i % 2 ? `rgba(255,120,220,${0.35 + pulse * 0.35})` : `rgba(120,230,255,${0.35 + pulse * 0.35})`);
      }
      // floating motes
      ctx.fillStyle = 'rgba(190,240,255,0.6)';
      for (let i = 0; i < 18; i++) {
        const x = (i * 47 + Math.sin(time * 0.01 + i) * 30 + 800) % VW;
        const y = (VH - ((time * (0.2 + (i % 4) * 0.08) + i * 60) % VH));
        ctx.fillRect(x, y, 2, 2);
      }
    } else if (theme === 'neon') {
      // stars + moon
      for (let i = 0; i < 60; i++) {
        const x = SG.hash01(i) * VW;
        const y = SG.hash01(i + 100) * 220;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.03 + i));
        ctx.fillStyle = `rgba(255,255,255,${tw * 0.8})`;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      ctx.fillStyle = '#fdf3c8';
      ctx.beginPath();
      ctx.arc(130, 70, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = th.sky[0];
      ctx.beginPath();
      ctx.arc(142, 62, 22, 0, Math.PI * 2);
      ctx.fill();
      skyline(ctx, cam, 0.15, groundScreen - 10, th.far, 3, null, time);
      skyline(ctx, cam, 0.4, groundScreen, th.mid, 9, ['#ffd75e', '#5ef0ff'], time);
    }
  }

  function cloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 22 * s, y - 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 46 * s, y, 17 * s, 0, Math.PI * 2);
    ctx.rect(x, y, 46 * s, 14 * s);
    ctx.fill();
  }

  function crystal(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2);
    ctx.lineTo(x + s * 0.7, y);
    ctx.lineTo(x, y + s * 1.2);
    ctx.lineTo(x - s * 0.7, y);
    ctx.closePath();
    ctx.fill();
  }

  // World-space ground band and decorations.
  function drawGround(ctx, stage, cam, time) {
    const th = THEMES[stage.def.theme];
    const gy = stage.groundY;
    const x0 = cam.x - 10;
    const x1 = cam.x + VW / cam.zoom + 10;
    const bottom = VH + 20;
    ctx.fillStyle = th.ground;
    ctx.fillRect(x0, gy, x1 - x0, bottom - gy);
    ctx.fillStyle = th.groundDark;
    const theme = stage.def.theme;
    if (theme === 'docks') {
      for (let x = Math.floor(x0 / 50) * 50; x < x1; x += 50) ctx.fillRect(x, gy, 3, bottom - gy);
      for (let x = Math.floor(x0 / 100) * 100 + 20; x < x1; x += 100) {
        ctx.fillStyle = '#4a2a17';
        ctx.fillRect(x, gy + 12, 12, bottom - gy);
        ctx.fillStyle = th.groundDark;
      }
    } else if (theme === 'neon') {
      for (let x = Math.floor(x0 / 80) * 80; x < x1; x += 80) ctx.fillRect(x, gy + 26, 40, 4);
    } else {
      for (let i = Math.floor(x0 / 37); i * 37 < x1; i++) {
        const h = SG.hash01(i + 7);
        ctx.fillRect(i * 37 + h * 20, gy + 18 + h * 30, 8 + h * 6, 4);
      }
    }
    ctx.fillStyle = th.top;
    ctx.fillRect(x0, gy, x1 - x0, theme === 'neon' ? 4 : 8);
    if (theme === 'neon') {
      ctx.shadowColor = th.top;
      ctx.shadowBlur = 12;
      ctx.fillRect(x0, gy, x1 - x0, 3);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = th.topLight;
    ctx.fillRect(x0, gy, x1 - x0, 2);
    if (theme === 'meadow') {
      // tufts & flowers (deterministic layout)
      for (let i = Math.floor(x0 / 23); i * 23 < x1; i++) {
        const h = SG.hash01(i * 3 + 1);
        const x = i * 23 + h * 12;
        ctx.fillStyle = th.top;
        ctx.beginPath();
        ctx.moveTo(x - 3, gy);
        ctx.lineTo(x, gy - 5 - h * 4);
        ctx.lineTo(x + 3, gy);
        ctx.fill();
        if (h > 0.82) {
          ctx.fillStyle = h > 0.91 ? '#fff3a0' : '#ff9ad5';
          ctx.beginPath();
          ctx.arc(x + 6, gy - 4, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (theme === 'cavern') {
      for (let i = Math.floor(x0 / 60); i * 60 < x1; i++) {
        const h = SG.hash01(i + 77);
        if (h > 0.5) crystal(ctx, i * 60 + h * 30, gy - 4, 4 + h * 3, h > 0.75 ? 'rgba(255,140,230,0.8)' : 'rgba(140,235,255,0.8)');
      }
    }
  }

  function drawPlatforms(ctx, stage, alpha, time) {
    const th = THEMES[stage.def.theme];
    const theme = stage.def.theme;
    // motion rails first (show where movers travel → predictable)
    for (const pl of stage.platforms) {
      if (!pl.move) continue;
      ctx.strokeStyle = th.rail;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      if (pl.move.axis === 'x') {
        const a = pl.baseX;
        const b = pl.baseX + pl.move.dir * pl.move.range;
        const y = pl.baseY + pl.h / 2;
        ctx.moveTo(Math.min(a, b) + 6, y);
        ctx.lineTo(Math.max(a, b) + pl.w - 6, y);
      } else {
        const x = pl.baseX + pl.w / 2;
        ctx.moveTo(x, pl.baseY + pl.h);
        ctx.lineTo(x, pl.baseY - pl.move.range);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const pl of stage.platforms) {
      const x = pl.px !== undefined ? SG.lerp(pl.px, pl.x, alpha) : pl.x;
      const y = pl.py !== undefined ? SG.lerp(pl.py, pl.y, alpha) : pl.y;
      const moving = !!pl.move;
      const w = pl.w;
      const h = pl.h;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 3, y + h, w - 6, 4);
      ctx.fillStyle = moving ? th.mover : th.plat;
      SG.roundRect(ctx, x, y, w, h + 2, 4);
      ctx.fill();
      ctx.fillStyle = th.platDark;
      ctx.fillRect(x + 2, y + h - 2, w - 4, 4);
      const topCol = moving && th.moverTop ? th.moverTop : th.platTop;
      if (theme === 'neon' || theme === 'cavern') {
        ctx.shadowColor = topCol;
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = topCol;
      ctx.fillRect(x, y, w, 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = th.platTopLight;
      ctx.fillRect(x + 2, y, w - 4, 1.5);
      if (theme === 'meadow') {
        ctx.fillStyle = th.platDark;
        for (let k = 18; k < w - 8; k += 28) ctx.fillRect(x + k, y + 6, 2, 5);
      } else if (theme === 'docks') {
        ctx.fillStyle = th.platDark;
        for (let k = 22; k < w; k += 22) ctx.fillRect(x + k, y + 4, 2, h - 2);
        if (moving) {
          ctx.fillStyle = '#e8d3a0';
          ctx.fillRect(x + 6, y + 5, 3, 6);
          ctx.fillRect(x + w - 9, y + 5, 3, 6);
        }
      } else if (moving) {
        // lift / slider arrows
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        const mx = x + w / 2;
        const my = y + 8;
        ctx.beginPath();
        if (pl.move.axis === 'y') {
          ctx.moveTo(mx - 4, my); ctx.lineTo(mx, my - 3); ctx.lineTo(mx + 4, my);
        } else {
          ctx.moveTo(mx - 7, my - 2); ctx.lineTo(mx - 10, my); ctx.lineTo(mx - 7, my + 2);
          ctx.moveTo(mx + 7, my - 2); ctx.lineTo(mx + 10, my); ctx.lineTo(mx + 7, my + 2);
        }
        ctx.fill();
      }
    }
  }

  // ============================================================== world
  SG.drawWorld = function (ctx, world, cam, vis, alpha, opts) {
    const time = opts.uiTicks || 0;
    const stage = world.stage;
    let shx = 0;
    let shy = 0;
    if (opts.shake && SG.FX.shake > 0) {
      shx = (SG.FX.rng() * 2 - 1) * SG.FX.shake;
      shy = (SG.FX.rng() * 2 - 1) * SG.FX.shake;
    }
    ctx.save();
    ctx.translate(shx, shy);
    drawBackdrop(ctx, stage, cam, time);
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.top);
    drawGround(ctx, stage, cam, time);
    drawPlatforms(ctx, stage, alpha, time);
    // fighters (draw the higher one last so the attacker reads on top)
    const order = world.players.slice().sort((a, b) => b.y - a.y);
    for (const p of order) {
      const ok = p.px !== undefined && Math.abs(p.px - p.x) < 40 && Math.abs(p.py - p.y) < 40;
      const x = ok ? SG.lerp(p.px, p.x, alpha) : p.x;
      const y = ok ? SG.lerp(p.py, p.y, alpha) : p.y;
      SG.drawFighter(ctx, p, vis[p.index], x, y);
      if (opts.labels) drawTag(ctx, p, x, y, opts.names[p.index], cam.zoom);
    }
    SG.FX.draw(ctx);
    if (opts.debug) drawHitboxes(ctx, world);
    ctx.restore();
    // off-screen indicators
    for (const p of world.players) {
      const sy = (p.y + p.h - cam.top) * cam.zoom;
      if (sy < 4) {
        const sx = (p.x + p.w / 2 - cam.x) * cam.zoom;
        ctx.fillStyle = SG.PALETTE[p.index].body;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, 4);
        ctx.lineTo(sx - 9, 18);
        ctx.lineTo(sx + 9, 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    if (SG.FX.flash > 0) {
      ctx.fillStyle = SG.FX.flashColor;
      ctx.globalAlpha = SG.FX.flash * 0.35;
      ctx.fillRect(-20, -20, VW + 40, VH + 40);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  function drawTag(ctx, p, x, y, name, zoom) {
    const cx = x + p.w / 2;
    const ty = y - 30;
    const s = 1 / Math.max(zoom, 0.75);
    ctx.save();
    ctx.translate(cx, ty);
    ctx.scale(s, s);
    ctx.globalAlpha = p.invuln > 0 ? 0.6 : 0.95;
    ctx.font = `bold 11px ${FONT}`;
    const tw = ctx.measureText(name).width + 22;
    ctx.fillStyle = SG.PALETTE[p.index].ink;
    SG.roundRect(ctx, -tw / 2, -9, tw, 16, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, 7);
    ctx.lineTo(4, 7);
    ctx.lineTo(0, 11);
    ctx.fill();
    SG.drawEmblem(ctx, p.index, -tw / 2 + 9, -1, 5);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 6, 0);
    ctx.restore();
  }

  function drawHitboxes(ctx, world) {
    ctx.lineWidth = 1;
    for (const pl of world.stage.platforms) {
      ctx.strokeStyle = 'rgba(255,255,0,0.9)';
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
    }
    for (const p of world.players) {
      ctx.strokeStyle = p.invuln > 0 ? 'rgba(0,255,255,0.95)' : 'rgba(0,255,0,0.95)';
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(255,0,0,0.9)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + C.STOMP_TOLERANCE);
      ctx.lineTo(p.x + p.w, p.y + C.STOMP_TOLERANCE);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, world.stage.groundY);
    ctx.lineTo(world.stage.width, world.stage.groundY);
    ctx.stroke();
  }

  // ============================================================== text helpers
  SG.text = function (ctx, str, x, y, o) {
    o = o || {};
    ctx.font = `${o.weight || 'bold'} ${o.size || 16}px ${FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.strokeWidth || 4;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(str, x, y);
  };

  const fmtTime = (ticks) => {
    const s = Math.max(0, Math.ceil(ticks / C.TICK_RATE));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  SG.fmtElapsed = (ticks) => {
    const ms = Math.floor(ticks * C.TICK_MS);
    return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
  };

  // ============================================================== HUD
  SG.createHud = () => ({ pulse: [0, 0], goT: 0, banner: null, lastCount: 3, countT: 0 });

  SG.hudEvent = function (hud, ev) {
    if (ev.type === 'score') hud.pulse[ev.who] = 1;
    if (ev.type === 'go') hud.goT = 50;
    if (ev.type === 'count' || ev.type === 'roundStart') { hud.lastCount = ev.n || 3; hud.countT = 0; }
    if (ev.type === 'suddenDeath') hud.banner = { kind: 'sudden', t: 0 };
    if (ev.type === 'roundEnd') hud.banner = { kind: 'round', winner: ev.winner, reason: ev.reason, matchOver: ev.matchOver, t: 0 };
    if (ev.type === 'roundStart') hud.banner = null;
  };
  SG.hudTick = function (hud) {
    for (let i = 0; i < 2; i++) hud.pulse[i] *= 0.9;
    if (hud.goT > 0) hud.goT--;
    hud.countT++;
    if (hud.banner) hud.banner.t++;
  };

  SG.drawHud = function (ctx, world, hud, names, time) {
    const t = SG.t;
    const [a, b] = world.players;
    const opts = world.opts;
    const practice = opts.winScore === 0;
    // score panel
    const pw = 300;
    const px = VW / 2 - pw / 2;
    ctx.fillStyle = 'rgba(10,12,30,0.62)';
    SG.roundRect(ctx, px, 8, pw, 50, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const p = world.players[i];
      const side = i === 0 ? -1 : 1;
      const sx = VW / 2 + side * 62;
      const scale = 1 + hud.pulse[i] * 0.5;
      ctx.save();
      ctx.translate(sx, 34);
      ctx.scale(scale, scale);
      SG.text(ctx, String(p.score), 0, 0, { size: 30, weight: '900', color: i === 0 ? '#ff7a70' : '#6fb8ff', stroke: 'rgba(0,0,0,0.5)', strokeWidth: 4 });
      ctx.restore();
      SG.drawEmblem(ctx, i, VW / 2 + side * 128, 24, 6);
      SG.text(ctx, names[i], VW / 2 + side * 128, 43, { size: 11, color: '#e8ecff' });
      if (!practice && opts.winScore > 1 && p.score === opts.winScore - 1 && world.phase === 'playing' && !world.suddenDeath) {
        const pulse = 0.7 + 0.3 * Math.sin(time * 0.2);
        ctx.globalAlpha = pulse;
        SG.text(ctx, t('matchPoint'), sx, 68, { size: 11, weight: '900', color: '#ffd23f', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });
        ctx.globalAlpha = 1;
      }
    }
    // centre: timer or elapsed
    if (opts.timeLimit > 0) {
      const left = opts.timeLimit * C.TICK_RATE - world.tick;
      const urgent = left < 10 * C.TICK_RATE && world.phase === 'playing' && !world.suddenDeath;
      SG.text(ctx, world.suddenDeath ? 'SD' : fmtTime(left), VW / 2, 30, { size: 20, weight: '900', color: urgent && Math.floor(time / 15) % 2 ? '#ff5a5a' : '#fff' });
      SG.text(ctx, t('timer'), VW / 2, 47, { size: 9, color: 'rgba(255,255,255,0.6)', weight: 'normal' });
    } else {
      SG.text(ctx, practice ? t('practiceTag') : 'VS', VW / 2, 28, { size: practice ? 12 : 16, weight: '900', color: '#ffffff' });
      SG.text(ctx, SG.fmtElapsed(world.tick), VW / 2, 46, { size: 10, weight: 'normal', color: 'rgba(255,255,255,0.7)' });
    }
    // round pips
    if (opts.bestOf > 1) {
      const need = SG.roundsToWin(world);
      for (let i = 0; i < 2; i++) {
        for (let k = 0; k < need; k++) {
          const x = VW / 2 + (i === 0 ? -1 : 1) * (28 + k * 12);
          ctx.beginPath();
          ctx.arc(x, 64, 4, 0, Math.PI * 2);
          ctx.fillStyle = k < world.roundWins[i] ? (i === 0 ? '#ff7a70' : '#6fb8ff') : 'rgba(0,0,0,0.45)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    if (practice) SG.text(ctx, t('practiceHint'), VW - 10, VH - 12, { size: 11, align: 'right', color: 'rgba(255,255,255,0.75)', stroke: 'rgba(0,0,0,0.5)', strokeWidth: 3 });

    // countdown
    if (world.phase === 'countdown') {
      const n = Math.ceil(world.countdown / C.TICK_RATE);
      const frac = (world.countdown % C.TICK_RATE) / C.TICK_RATE;
      const s = 1 + (frac > 0.75 ? (frac - 0.75) * 2.4 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, VW, VH);
      if (opts.bestOf > 1) {
        const last = world.roundWins[0] === SG.roundsToWin(world) - 1 && world.roundWins[1] === SG.roundsToWin(world) - 1;
        SG.text(ctx, last ? t('finalRound') : t('round', world.round), VW / 2, 120, { size: 26, weight: '900', color: '#ffd23f', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 5 });
      }
      ctx.save();
      ctx.translate(VW / 2, 200);
      ctx.scale(s, s);
      SG.text(ctx, String(n), 0, 0, { size: 86, weight: '900', color: '#fff', stroke: '#1a1030', strokeWidth: 8 });
      ctx.restore();
    } else if (hud.goT > 0) {
      const k = hud.goT / 50;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.save();
      ctx.translate(VW / 2, 200);
      ctx.scale(1 + (1 - k) * 0.6, 1 + (1 - k) * 0.6);
      SG.text(ctx, t('go'), 0, 0, { size: 90, weight: '900', color: '#ffd23f', stroke: '#1a1030', strokeWidth: 8 });
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // banners
    const bn = hud.banner;
    if (bn && bn.kind === 'sudden' && bn.t < 150) {
      const a1 = bn.t < 120 ? 1 : 1 - (bn.t - 120) / 30;
      ctx.globalAlpha = a1;
      SG.text(ctx, t('suddenDeath'), VW / 2, 170, { size: 46, weight: '900', color: '#ff5a5a', stroke: '#1a1030', strokeWidth: 7 });
      SG.text(ctx, t('suddenSub'), VW / 2, 210, { size: 18, color: '#fff', stroke: '#1a1030', strokeWidth: 4 });
      ctx.globalAlpha = 1;
    } else if (bn && bn.kind === 'round' && world.phase === 'roundEnd') {
      const k = Math.min(1, bn.t / 12);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
      ctx.fillRect(0, 140, VW, 110);
      const name = names[bn.winner];
      if (bn.reason === 'time') SG.text(ctx, t('timeUp'), VW / 2, 158, { size: 20, weight: '900', color: '#ffd23f', stroke: '#1a1030', strokeWidth: 4 });
      ctx.save();
      ctx.translate(VW / 2, 198);
      const s = 0.6 + 0.4 * k + (bn.t < 20 ? Math.sin(bn.t * 0.5) * 0.04 : 0);
      ctx.scale(s, s);
      const label = bn.matchOver ? t('winsRound', name) : t('roundTo', name);
      SG.text(ctx, label, 0, 0, { size: 44, weight: '900', color: bn.winner === 0 ? '#ff7a70' : '#6fb8ff', stroke: '#fff', strokeWidth: 6 });
      ctx.restore();
    }
  };

  // ============================================================== debug overlay
  SG.drawDebug = function (ctx, game, fps) {
    const lines = [`FPS ${fps}   screen ${game.stack.join('>')}`];
    const s = game.session;
    if (s) {
      const w = s.world;
      lines.push(`phase ${w.phase}  tick ${w.tick}  time ${w.time}  round ${w.round}  cd ${w.countdown}`);
      for (const p of w.players) {
        lines.push(`P${p.index + 1} pos ${p.x.toFixed(1)},${p.y.toFixed(1)}  v ${p.vx.toFixed(1)},${p.vy.toFixed(2)}`);
        lines.push(`   gnd ${p.onGround ? 1 : 0} ride ${p.riding} coy ${p.coyote} buf ${p.jumpBuffer} inv ${p.invuln}`);
      }
      const ov = SG.overlaps(w.players[0], w.players[1]);
      lines.push(`contact ${ov ? 'YES' : 'no'}`);
      if (s.online) {
        const o = s.online;
        const n = game.net;
        lines.push(`NET P${o.slot + 1} #${n ? n.code : '-'} rtt ${n && n.rtt >= 0 ? Math.round(n.rtt) + 'ms' : '?'} f ${o.n} buf ${o.queue.length} stall ${o.stalls} desync ${o.desyncs}`);
      }
      if (s.ai) lines.push(`AI L${s.ai.level} ${s.ai.mode}  plan ${s.ai.planLen}  in ${['left', 'right', 'jumpHeld'].filter((k) => s.aiInput[k]).join('+') || '-'}`);
    }
    ctx.font = `12px Consolas, monospace`;
    const w = 380;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(6, VH - 10 - lines.length * 15, w, lines.length * 15 + 6);
    ctx.fillStyle = '#5f5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 12, VH - 6 - lines.length * 15 + i * 15));
  };

  // Static preview of a stage (used by stage select / menu backgrounds).
  SG.drawStagePreview = function (ctx, stage, x, y, w, h, time, vis) {
    const zoom = w / stage.width;
    const cam = { x: 0, top: VH - h / zoom, zoom, stage, cx: stage.width / 2 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    // backdrop expects an 800x400 screen: scale it into the box
    ctx.save();
    ctx.scale(w / VW, h / VH);
    const bz = VW / stage.width;
    drawBackdrop(ctx, stage, { x: 0, top: VH - VH / bz, zoom: bz, stage }, time);
    ctx.restore();
    ctx.scale(zoom, zoom);
    ctx.translate(0, -cam.top);
    drawGround(ctx, stage, { x: 0, zoom: zoom, top: cam.top }, time);
    drawPlatforms(ctx, stage, 1, time);
    if (vis) {
      for (let i = 0; i < 2; i++) {
        const p = { index: i, x: stage.spawns[i], y: stage.groundY - C.PLAYER_H, w: C.PLAYER_W, h: C.PLAYER_H, vx: 0, vy: 0, onGround: true, facing: i === 0 ? 1 : -1, invuln: 0 };
        SG.drawFighter(ctx, p, vis[i], p.x, p.y);
      }
    }
    ctx.restore();
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
