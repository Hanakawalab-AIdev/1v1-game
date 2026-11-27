// ui.js — draws every non-gameplay screen and overlay from the Game model (game.js).
// Also records clickable row rectangles for mouse support.
(function (root) {
  'use strict';
  const SG = root.SG;
  const C = SG.C;
  const VW = C.VIEW_W;
  const VH = C.VIEW_H;
  const t = (...a) => SG.t(...a);

  const UI = {
    rects: [],
    menuVis: [SG.createVis(0), SG.createVis(1)],
    resultVis: [SG.createVis(0), SG.createVis(1)],
    previewStages: {},
  };
  SG.UI = UI;

  function stageFor(id) {
    if (!UI.previewStages[id]) UI.previewStages[id] = SG.buildStage(SG.getStageDef(id));
    return UI.previewStages[id];
  }

  function panel(x, y, w, h, alpha) {
    const ctx = UI.ctx;
    ctx.fillStyle = `rgba(14,16,40,${alpha === undefined ? 0.82 : alpha})`;
    SG.roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function title(str, y, size, color) {
    SG.text(UI.ctx, str, VW / 2, y, { size: size || 32, weight: '900', color: color || '#fff', stroke: '#1a1030', strokeWidth: 6 });
  }

  function hint(str) {
    const ctx = UI.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, VH - 24, VW, 24);
    SG.text(ctx, str, VW / 2, VH - 12, { size: 12, weight: 'normal', color: 'rgba(255,255,255,0.85)' });
  }

  // Animated menu backdrop: the selected stage with both fighters idling.
  function backdrop(game, time) {
    const ctx = UI.ctx;
    const st = stageFor(SG.STAGES[game.stageIndex].id);
    const v = UI.menuVis;
    SG.drawStagePreview(ctx, st, 0, 0, VW, VH, time, v);
    ctx.fillStyle = 'rgba(8,8,30,0.45)';
    ctx.fillRect(0, 0, VW, VH);
  }

  function menuTickVis(time) {
    for (let i = 0; i < 2; i++) {
      const fake = { index: i, onGround: true, vx: 0, vy: 0, x: 0, y: 0 };
      SG.tickVis(UI.menuVis[i], fake, 'menu');
    }
  }
  UI.tick = menuTickVis;

  // Generic vertical list menu.
  function list(game, items, opt) {
    const ctx = UI.ctx;
    const n = items.length;
    const w = opt.w || 460;
    const x = VW / 2 - w / 2;
    const top = opt.top || 112;
    const avail = (opt.bottom || VH - 34) - top;
    const gap = Math.min(opt.gap || 36, avail / n);
    const size = gap < 24 ? 14 : 17;
    const sel = game.cursor[game.top()] || 0;
    const rowRects = [];
    const valueRects = []; // checked first: tapping the ‹ / › side of a value changes it
    panel(x, top - 14, w, gap * n + 22, opt.alpha);
    items.forEach((it, i) => {
      const y = top + gap * i + gap / 2;
      const active = i === sel;
      rowRects.push({ x, y: y - gap / 2, w, h: gap, index: i });
      if (it.adjust && !it.ok) {
        valueRects.push({ x: x + w - 250, y: y - gap / 2, w: 125, h: gap, index: i, action: 'dec' });
        valueRects.push({ x: x + w - 125, y: y - gap / 2, w: 125, h: gap, index: i, action: 'inc' });
      }
      if (active) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, 'rgba(255,90,90,0.55)');
        g.addColorStop(1, 'rgba(70,150,255,0.55)');
        ctx.fillStyle = g;
        SG.roundRect(ctx, x + 10, y - gap / 2 + 2, w - 20, gap - 4, Math.min(12, gap / 2 - 2));
        ctx.fill();
        const bob = Math.sin(game.uiTicks * 0.2) * 2;
        SG.text(ctx, '▶', x + 26 + bob, y, { size: size - 3, color: '#ffd23f' });
      }
      const label = it.label();
      const hasValue = it.value || it.slider;
      SG.text(ctx, label, hasValue ? x + 44 : VW / 2, y, { size, align: hasValue ? 'left' : 'center', color: active ? '#fff' : 'rgba(235,238,255,0.85)' });
      if (it.slider) {
        const v = it.slider();
        const bx = x + w - 200;
        for (let k = 0; k < 10; k++) {
          ctx.fillStyle = k < v ? (active ? '#ffd23f' : '#c9cff5') : 'rgba(255,255,255,0.15)';
          ctx.fillRect(bx + k * 15, y - 6, 11, 12);
        }
        SG.text(ctx, String(v), x + w - 30, y, { size: size - 2, color: '#fff' });
      } else if (it.value) {
        const val = it.value();
        const vx = x + w - 34;
        if (it.adjust && (active || game.touchUI)) {
          ctx.font = `bold ${size}px ${SG.FONT}`;
          const vw = ctx.measureText(val).width;
          SG.text(ctx, '‹', vx - vw - 14, y, { size: size + 2, color: '#ffd23f' });
          SG.text(ctx, '›', vx + 12, y, { size: size + 2, color: '#ffd23f' });
        }
        SG.text(ctx, val, vx, y, { size, align: 'right', color: active ? '#ffe9a0' : '#c9cff5' });
      }
    });
    UI.rects = valueRects.concat(rowRects);
  }

  function drawTitle(game, time) {
    const ctx = UI.ctx;
    backdrop(game, time);
    const bounce = Math.sin(time * 0.05) * 4;
    ctx.save();
    ctx.translate(VW / 2, 120 + bounce);
    const r = 1 + Math.sin(time * 0.03) * 0.015;
    ctx.scale(r, r);
    SG.text(ctx, 'STOMP', -92, 0, { size: 74, weight: '900', color: '#ff5a4f', stroke: '#1a0b1e', strokeWidth: 12 });
    SG.text(ctx, 'DUEL', 150, 0, { size: 74, weight: '900', color: '#3f9bff', stroke: '#1a0b1e', strokeWidth: 12 });
    ctx.restore();
    // crown star between the words
    ctx.fillStyle = '#ffd23f';
    SG.starPath(ctx, VW / 2 + 32, 76 + bounce, 13, time * 0.02);
    ctx.fill();
    SG.text(ctx, t('subtitle'), VW / 2, 178, { size: 17, color: '#fff', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 4 });
    if (Math.floor(time / 30) % 2 === 0) SG.text(ctx, game.touchUI ? t('tapStart') : t('pressStart'), VW / 2, 250, { size: 22, weight: '900', color: '#ffd23f', stroke: '#1a1030', strokeWidth: 5 });
    SG.text(ctx, 'v1.1', VW - 12, VH - 10, { size: 10, align: 'right', color: 'rgba(255,255,255,0.55)', weight: 'normal' });
  }

  function drawMain(game, time) {
    backdrop(game, time);
    title(SG.GAME_TITLE, 62, 40);
    list(game, game.menuItems(), { top: 108, gap: 38, w: 380 });
    hint(t('menuHint'));
  }

  function drawSetup(game, time) {
    backdrop(game, time);
    const mode = game.settings.setup.mode;
    title(mode === 'cpu' ? t('vsCpu') : mode === 'practice' ? t('practice') : mode === 'online' ? t('onlineTitle') : t('localVs'), 62, 34);
    SG.text(UI.ctx, t('matchSetup'), VW / 2, 92, { size: 14, color: 'rgba(255,255,255,0.8)' });
    list(game, game.menuItems(), { top: 124, gap: 40, w: 520 });
    hint(t('menuHint'));
  }

  function drawStageSelect(game, time) {
    const ctx = UI.ctx;
    const def = SG.STAGES[game.stageIndex];
    const st = stageFor(def.id);
    backdrop(game, time);
    title(t('stageSelect'), 40, 30);
    const bw = 440;
    const bh = 220;
    const bx = VW / 2 - bw / 2;
    const by = 64;
    ctx.fillStyle = '#000';
    SG.roundRect(ctx, bx - 6, by - 6, bw + 12, bh + 12, 14);
    ctx.fill();
    // live preview: platforms move as they do in-game
    const tt = Math.floor(time) % 100000;
    SG.updatePlatforms(st, tt);
    for (const pl of st.platforms) { pl.px = undefined; pl.py = undefined; }
    SG.drawStagePreview(ctx, st, bx, by, bw, bh, time, UI.menuVis);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    SG.roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 12);
    ctx.stroke();
    const pulse = Math.sin(time * 0.15) * 4;
    SG.text(ctx, '◀', bx - 34 - pulse, by + bh / 2, { size: 30, color: '#ffd23f', stroke: '#1a1030', strokeWidth: 5 });
    SG.text(ctx, '▶', bx + bw + 34 + pulse, by + bh / 2, { size: 30, color: '#ffd23f', stroke: '#1a1030', strokeWidth: 5 });
    UI.rects = [
      { x: bx - 60, y: by + bh / 2 - 30, w: 50, h: 60, index: -1, action: 'prev' },
      { x: bx + bw + 10, y: by + bh / 2 - 30, w: 50, h: 60, index: -1, action: 'next' },
      { x: bx, y: by, w: bw, h: bh, index: -1, action: 'start' },
    ];
    const name = def.name[SG.lang] || def.name.en;
    const desc = def.desc[SG.lang] || def.desc.en;
    SG.text(ctx, name, VW / 2, by + bh + 24, { size: 24, weight: '900', color: '#fff', stroke: '#1a1030', strokeWidth: 5 });
    SG.text(ctx, desc, VW / 2, by + bh + 47, { size: 13, color: '#e6e9ff', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });
    // tags
    let tx = VW / 2 - (def.tags.length - 1) * 75;
    for (const tag of def.tags) {
      const label = t('tag_' + tag);
      ctx.font = `bold 10px ${SG.FONT}`;
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = tag === 'moving' ? '#8a3df0' : tag === 'wide' ? '#1d8a6a' : '#b0602a';
      SG.roundRect(ctx, tx - w / 2, by - 2 + 10, w, 16, 8);
      ctx.fill();
      SG.text(ctx, label, tx, by + 16, { size: 10, color: '#fff' });
      tx += 150;
    }
    // page dots
    for (let i = 0; i < SG.STAGES.length; i++) {
      ctx.beginPath();
      ctx.arc(VW / 2 + (i - (SG.STAGES.length - 1) / 2) * 16, VH - 40, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === game.stageIndex ? '#ffd23f' : 'rgba(255,255,255,0.35)';
      ctx.fill();
    }
    hint(t('stageHint'));
  }

  function drawSettings(game, time, inMatch) {
    if (!inMatch) backdrop(game, time);
    title(t('settings'), 40, 30);
    list(game, game.menuItems(), { top: 74, gap: 26, w: 540, bottom: VH - 30 });
    hint(t('menuHint'));
  }

  function drawControls(game, time, inMatch) {
    const ctx = UI.ctx;
    if (!inMatch) backdrop(game, time);
    title(t('controlsTitle'), 40, 30);
    list(game, game.menuItems(), { top: 80, gap: 34, w: 480, bottom: VH - 40 });
    if (game.capture) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, VW, VH);
      panel(VW / 2 - 230, VH / 2 - 50, 460, 100);
      const pl = game.capture.player.toUpperCase();
      const act = t(game.capture.action === 'left' ? 'moveLeft' : game.capture.action === 'right' ? 'moveRight' : 'jump');
      SG.text(ctx, `${pl} — ${act}`, VW / 2, VH / 2 - 16, { size: 20, weight: '900', color: game.capture.player === 'p1' ? '#ff7a70' : '#6fb8ff' });
      SG.text(ctx, t('pressKey'), VW / 2, VH / 2 + 18, { size: 15, color: '#fff' });
    }
    hint(t('controlsHint'));
  }

  function keyLines() {
    const k = UI.game.settings.keys;
    const n = SG.keyName;
    return {
      p1: t('p1Line', n(k.p1.left), n(k.p1.right), n(k.p1.jump)),
      p2: t('p2Line', n(k.p2.left), n(k.p2.right), n(k.p2.jump)),
    };
  }

  function drawHowTo(game, time) {
    const ctx = UI.ctx;
    backdrop(game, time);
    const pages = t('howPages');
    const page = pages[game.howPage];
    title(t('howTo'), 40, 30);
    panel(90, 66, VW - 180, 280);
    SG.text(ctx, page.title, VW / 2, 92, { size: 22, weight: '900', color: '#ffd23f' });
    const kl = keyLines();
    let y = 128;
    const gap = page.lines.length > 6 ? 24 : game.howPage === 0 ? 25 : 30;
    for (const line of page.lines) {
      const str = line === '{p1}' ? kl.p1 : line === '{p2}' ? kl.p2 : line;
      const col = line === '{p1}' ? '#ff9a90' : line === '{p2}' ? '#8cc8ff' : '#eef0ff';
      SG.text(ctx, str, VW / 2, y, { size: 15, color: col, weight: line.startsWith('{') ? 'bold' : 'normal' });
      y += gap;
    }
    if (game.howPage === 0) {
      // little diagram: Ember stomping Tide
      const v = UI.menuVis;
      const a = { index: 0, x: 0, y: 0, w: 30, h: 40, vx: 0, vy: 9, onGround: false, facing: 1, invuln: 0 };
      const b = { index: 1, x: 0, y: 0, w: 30, h: 40, vx: 0, vy: 0, onGround: true, facing: -1, invuln: 0 };
      const ph = (time % 90) / 90;
      const ay = 238 + Math.min(ph * 2, 1) * 18;
      SG.drawFighter(ctx, b, v[1], VW / 2 - 15, 296);
      SG.drawFighter(ctx, a, v[0], VW / 2 - 12, ay);
      if (ph > 0.5 && ph < 0.75) {
        ctx.fillStyle = '#ffe066';
        SG.starPath(ctx, VW / 2 + 26, 293, 7, time * 0.1);
        ctx.fill();
        SG.text(ctx, '+1', VW / 2 + 50, 281, { size: 18, weight: '900', color: '#ffd23f', stroke: '#1a1030', strokeWidth: 4 });
      }
    }
    hint(t('page', game.howPage + 1, pages.length));
  }

  function drawCredits(game, time) {
    const ctx = UI.ctx;
    backdrop(game, time);
    panel(110, 40, VW - 220, 310);
    const lines = t('creditsLines');
    let y = 70;
    lines.forEach((l, i) => {
      SG.text(ctx, l, VW / 2, y, i === 0 ? { size: 28, weight: '900', color: '#ffd23f', stroke: '#1a1030', strokeWidth: 5 } : { size: 14, color: '#eef0ff', weight: 'normal' });
      y += i === 0 ? 36 : 26;
    });
    hint('Enter / Esc');
  }

  function drawPause(game, time) {
    const ctx = UI.ctx;
    ctx.fillStyle = 'rgba(6,6,24,0.62)';
    ctx.fillRect(0, 0, VW, VH);
    title(t('paused'), 92, 44);
    const net = game.net;
    if (net && net.pausedBy >= 0) {
      const who = net.pausedBy === net.slot ? t('you') : 'P' + (net.pausedBy + 1);
      SG.text(ctx, t('pausedBy', who), VW / 2, 128, { size: 13, color: '#ffd23f' });
    } else if (game.focusPaused) SG.text(ctx, t('focusLost'), VW / 2, 128, { size: 13, color: '#ffd23f' });
    list(game, game.menuItems(), { top: 150, gap: 40, w: 340 });
    hint(t('menuHint'));
  }

  function drawResults(game, time) {
    const ctx = UI.ctx;
    const s = game.session;
    const w = s.world;
    const win = w.matchWinner;
    const k = Math.min(1, game.screenTicks / 20);
    ctx.fillStyle = `rgba(6,6,24,${0.55 * k})`;
    ctx.fillRect(0, 0, VW, VH);
    const names = UI.names;
    ctx.save();
    ctx.translate(VW / 2, 62);
    const sc = 0.7 + 0.3 * k + Math.sin(time * 0.08) * 0.02;
    ctx.scale(sc, sc);
    const header = s.online ? (win === s.online.slot ? t('youWin') : t('youLose')) : t('wins', names[win]);
    SG.text(ctx, header, 0, 0, { size: 52, weight: '900', color: win === 0 ? '#ff6a5f' : '#4fa6ff', stroke: '#fff', strokeWidth: 8 });
    ctx.restore();
    // stats panel
    const px = VW / 2 - 230;
    panel(px, 100, 460, 136, 0.85);
    const [a, b] = w.players;
    const series = w.opts.bestOf > 1;
    SG.drawEmblem(ctx, 0, VW / 2 - 140, 124, 8);
    SG.drawEmblem(ctx, 1, VW / 2 + 140, 124, 8);
    SG.text(ctx, names[0], VW / 2 - 140, 142, { size: 12, color: '#ffb0a8' });
    SG.text(ctx, names[1], VW / 2 + 140, 142, { size: 12, color: '#a8d2ff' });
    const big = series ? `${w.roundWins[0]} - ${w.roundWins[1]}` : `${a.score} - ${b.score}`;
    SG.text(ctx, series ? t('rounds') : t('finalScore'), VW / 2, 116, { size: 11, color: 'rgba(255,255,255,0.7)', weight: 'normal' });
    SG.text(ctx, big, VW / 2, 140, { size: 32, weight: '900', color: '#fff' });
    const rows = [
      [t('stomps'), w.stats.stomps[0], w.stats.stomps[1]],
      [t('bestStreak'), w.stats.longestStreak[0], w.stats.longestStreak[1]],
      [t('matchTime'), SG.fmtElapsed(w.totalTicks), null],
    ];
    rows.forEach((r, i) => {
      const y = 172 + i * 20;
      SG.text(ctx, r[0], VW / 2, y, { size: 12, color: 'rgba(255,255,255,0.7)', weight: 'normal' });
      if (r[2] === null) SG.text(ctx, String(r[1]), VW / 2 + 140, y, { size: 13, color: '#fff' });
      else {
        SG.text(ctx, String(r[1]), VW / 2 - 140, y, { size: 13, color: '#fff' });
        SG.text(ctx, String(r[2]), VW / 2 + 140, y, { size: 13, color: '#fff' });
      }
    });
    // big winner (cheering) and loser (slumped) on either side
    for (let i = 0; i < 2; i++) {
      const v = UI.resultVis[i];
      v.result = i === win ? 'win' : 'lose';
      v.t = time;
      const fx = i === 0 ? 92 : VW - 92;
      const p = { index: i, x: 0, y: 0, w: 30, h: 40, vx: 0, vy: 0, onGround: true, facing: i === 0 ? 1 : -1, invuln: 0 };
      ctx.save();
      ctx.translate(fx, 300);
      const s = i === win ? 2.2 : 1.6;
      ctx.scale(s, s);
      SG.drawFighter(ctx, p, v, -15, -40);
      ctx.restore();
      if (i === win) {
        ctx.fillStyle = '#ffd23f';
        SG.starPath(ctx, fx, 300 - 150 + Math.sin(time * 0.1) * 4, 14, time * 0.03);
        ctx.fill();
      }
    }
    if (game.screenTicks > 25) list(game, game.menuItems(), { top: 262, gap: 34, w: 300, bottom: VH - 30 });
    else UI.rects = [];
    hint(t('menuHint'));
  }

  // ---------------------------------------------------------------- online screens
  function drawOnline(game, time) {
    const ctx = UI.ctx;
    backdrop(game, time);
    title(t('onlineTitle'), 44, 32);
    panel(110, 70, VW - 220, 128);
    const lines = t('onlineInfo');
    lines.forEach((l, i) => SG.text(ctx, l, VW / 2, 92 + i * 26, { size: 14, color: i === 1 ? '#ffe9a0' : '#eef0ff', weight: i === 1 ? 'bold' : 'normal' }));
    if (!game.hooks.netConnect) {
      // opened as a file: say exactly how to turn online on (flashes when Create/Join is pressed)
      const flash = game.serverHint > 0 && Math.floor(game.serverHint / 6) % 2 === 0;
      t('noServerInfo').forEach((l, i) => SG.text(ctx, l, VW / 2, 213 + i * 21, {
        size: i === 0 ? 13 : 14, weight: i === 0 ? 'normal' : '900',
        color: i === 0 ? '#ff9a90' : flash ? '#ffffff' : '#ffd23f', stroke: 'rgba(0,0,0,0.75)', strokeWidth: 4,
      }));
      list(game, game.menuItems(), { top: 266, gap: 33, w: 340, bottom: VH - 30 });
      hint(t('menuHint'));
      return;
    } else if (SG.deviceUrls && SG.deviceUrls.length) {
      SG.text(ctx, t('otherDevices', SG.deviceUrls[0]), VW / 2, 213, { size: 14, weight: '900', color: '#8cc8ff', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 4 });
    }
    list(game, game.menuItems(), { top: 236, gap: 38, w: 340, bottom: VH - 30 });
    hint(t('menuHint'));
  }

  function drawJoin(game, time) {
    const ctx = UI.ctx;
    backdrop(game, time);
    title(t('joinRoom'), 40, 30);
    SG.text(ctx, t('enterCode'), VW / 2, 74, { size: 15, color: '#eef0ff' });
    // code boxes
    const n = SG.NET.CODE_LEN;
    for (let i = 0; i < n; i++) {
      const bx = VW / 2 - (n * 52) / 2 + i * 52 + 4;
      ctx.fillStyle = 'rgba(14,16,40,0.9)';
      SG.roundRect(ctx, bx, 90, 44, 52, 10);
      ctx.fill();
      const caret = i === game.joinCode.length && Math.floor(time / 20) % 2 === 0;
      ctx.strokeStyle = caret ? '#ffd23f' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const ch = game.joinCode[i];
      if (ch) SG.text(ctx, ch, bx + 22, 117, { size: 30, weight: '900', color: '#fff' });
    }
    // keypad
    UI.rects = [];
    const kw = 74;
    const kh = 44;
    const kx = VW / 2 - (kw * 3 + 16) / 2;
    const ky = 156;
    SG.JOIN_KEYS.forEach((key, i) => {
      const x = kx + (i % 3) * (kw + 8);
      const y = ky + Math.floor(i / 3) * (kh + 6);
      const active = i === game.joinCursor;
      const ready = key === 'ok' && game.joinCode.length === n;
      ctx.fillStyle = active ? 'rgba(255,210,63,0.9)' : ready ? 'rgba(60,170,90,0.9)' : 'rgba(14,16,40,0.85)';
      SG.roundRect(ctx, x, y, kw, kh, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const label = key === 'del' ? '⌫' : key === 'ok' ? 'OK' : key;
      SG.text(ctx, label, x + kw / 2, y + kh / 2 + 1, { size: 20, weight: '900', color: active ? '#1a1030' : '#fff' });
      UI.rects.push({ x, y, w: kw, h: kh, index: -1, action: 'key', value: key });
    });
    hint(t('joinHint'));
  }

  function drawLobby(game, time) {
    const ctx = UI.ctx;
    backdrop(game, time);
    const net = game.net;
    title(t('onlineTitle'), 40, 30);
    panel(90, 64, VW - 180, 236);
    if (!net || net.phase === 'connecting') {
      const dots = '.'.repeat(1 + (Math.floor(time / 15) % 3));
      const msg = net && net.intent === 'join' ? t('joining', net.code) : t('connecting');
      SG.text(ctx, msg.replace('…', '') + dots, VW / 2, 180, { size: 20, weight: '900', color: '#fff' });
    } else {
      SG.text(ctx, t('roomCode'), VW / 2, 90, { size: 13, color: 'rgba(255,255,255,0.75)' });
      SG.text(ctx, net.code.split('').join(' '), VW / 2, 128, { size: 50, weight: '900', color: '#ffd23f', stroke: '#1a1030', strokeWidth: 6 });
      const pulse = 0.6 + 0.4 * Math.sin(time * 0.1);
      ctx.globalAlpha = pulse;
      SG.text(ctx, t('waitingOpp'), VW / 2, 170, { size: 16, color: '#fff' });
      ctx.globalAlpha = 1;
      if (net.urls.length) {
        SG.text(ctx, t('shareHint'), VW / 2, 200, { size: 12, color: 'rgba(255,255,255,0.75)', weight: 'normal' });
        net.urls.slice(0, 2).forEach((u, i) => SG.text(ctx, u, VW / 2, 222 + i * 22, { size: 16, color: '#8cc8ff' }));
      }
      SG.text(ctx, t('orJoin'), VW / 2, 282, { size: 12, color: 'rgba(255,255,255,0.7)', weight: 'normal' });
    }
    list(game, game.menuItems(), { top: 324, gap: 36, w: 260, bottom: VH - 30 });
    hint(t('menuHint'));
  }

  // On-screen buttons for touch screens (drawn over the match).
  UI.drawTouch = function (ctx, game, active) {
    for (const b of game.touchButtons()) {
      const on = active.has(b.code);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      const tint = b.who === 0 ? '255,110,100' : b.who === 1 ? '90,160,255' : '255,255,255';
      ctx.fillStyle = `rgba(${tint},${on ? 0.55 : 0.22})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255,255,255,${on ? 0.9 : 0.5})`;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const s = b.r * 0.42;
      ctx.beginPath();
      if (b.icon === 'left') { ctx.moveTo(b.x - s, b.y); ctx.lineTo(b.x + s * 0.7, b.y - s); ctx.lineTo(b.x + s * 0.7, b.y + s); }
      else if (b.icon === 'right') { ctx.moveTo(b.x + s, b.y); ctx.lineTo(b.x - s * 0.7, b.y - s); ctx.lineTo(b.x - s * 0.7, b.y + s); }
      else if (b.icon === 'jump') { ctx.moveTo(b.x, b.y - s); ctx.lineTo(b.x + s, b.y + s * 0.7); ctx.lineTo(b.x - s, b.y + s * 0.7); }
      else { ctx.rect(b.x - s * 0.6, b.y - s * 0.7, s * 0.4, s * 1.4); ctx.rect(b.x + s * 0.2, b.y - s * 0.7, s * 0.4, s * 1.4); }
      ctx.closePath();
      ctx.fill();
    }
  };

  // Entry point used by main.js
  UI.draw = function (ctx, game, time, inMatch) {
    UI.ctx = ctx;
    UI.game = game;
    switch (game.top()) {
      case 'title': drawTitle(game, time); break;
      case 'main': drawMain(game, time); break;
      case 'setup': drawSetup(game, time); break;
      case 'stage': drawStageSelect(game, time); break;
      case 'settings': if (inMatch) dim(ctx); drawSettings(game, time, inMatch); break;
      case 'controls': if (inMatch) dim(ctx); drawControls(game, time, inMatch); break;
      case 'howto': drawHowTo(game, time); break;
      case 'credits': drawCredits(game, time); break;
      case 'online': drawOnline(game, time); break;
      case 'join': drawJoin(game, time); break;
      case 'lobby': drawLobby(game, time); break;
      case 'pause': drawPause(game, time); break;
      case 'results': drawResults(game, time); break;
      default: UI.rects = []; break;
    }
    if (game.toast) {
      ctx.globalAlpha = Math.min(1, game.toast.ticks / 20);
      panel(VW / 2 - 130, VH - 64, 260, 30, 0.9);
      SG.text(ctx, game.toast.text, VW / 2, VH - 49, { size: 13, color: '#ffd23f' });
      ctx.globalAlpha = 1;
    }
    // lightweight fade-in on every screen change
    if (game.screenTicks < 10 && game.top() !== 'pause' && game.top() !== 'results') {
      ctx.fillStyle = `rgba(0,0,0,${(1 - game.screenTicks / 10) * 0.6})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  };

  function dim(ctx) {
    ctx.fillStyle = 'rgba(6,6,24,0.75)';
    ctx.fillRect(0, 0, VW, VH);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
