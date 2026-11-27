// main.js — browser entry point: canvas/display, keyboard & mouse, storage, the fixed-timestep
// loop, and wiring simulation events to effects. Physics always runs at exactly 60 ticks/s;
// rendering runs every animation frame and interpolates between ticks.
(function () {
  'use strict';
  const SG = window.SG;
  const C = SG.C;
  const VW = C.VIEW_W;
  const VH = C.VIEW_H;
  const STORAGE_KEY = 'stompduel.settings.v1';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let backing = 1;

  // ---------------------------------------------------------------- display
  let scaleSetting = 'fit';
  function fitCanvas() {
    const pad = window.innerWidth < 900 ? 0 : 16; // phones: use the whole screen
    const maxW = window.innerWidth - pad;
    const maxH = window.innerHeight - pad;
    const fit = Math.max(0.5, Math.min(maxW / VW, maxH / VH));
    let s = scaleSetting === 'fit' || document.fullscreenElement ? fit : Math.min(scaleSetting, fit);
    if (!isFinite(s) || s <= 0) s = 1;
    const cssW = Math.round(VW * s);
    const cssH = Math.round(VH * s);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    backing = canvas.width / VW;
  }
  window.addEventListener('resize', fitCanvas);
  document.addEventListener('fullscreenchange', fitCanvas);

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    } catch (e) {
      /* fullscreen not allowed here */
    }
  }

  // ---------------------------------------------------------------- storage
  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function save(s) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      /* private mode / blocked storage: settings just won't persist */
    }
  }

  // ---------------------------------------------------------------- presentation state for a match
  const pres = { vis: null, hud: null, cam: null, touching: false };
  let game = null;

  function names() {
    const s = game.session;
    if (s && s.online) return s.online.slot === 0 ? ['P1 · ' + SG.t('you'), 'P2'] : ['P1', 'P2 · ' + SG.t('you')];
    if (!s || !s.ai) return ['P1', 'P2'];
    return ['P1', s.ai.level === 0 ? 'DUMMY' : SG.t('cpu') + ' ' + s.ai.level];
  }

  function onMatchStart(session) {
    SG.FX.clear();
    pres.vis = [SG.createVis(0), SG.createVis(1)];
    pres.hud = SG.createHud();
    pres.cam = SG.createCamera(session.world.stage);
    SG.snapCamera(pres.cam, session.world.players);
    pres.touching = false;
  }

  function onWorldEvents(events, session) {
    const w = session.world;
    const FX = SG.FX;
    const shakeOn = game.settings.shake;
    let touching = false;
    for (const ev of events) {
      SG.hudEvent(pres.hud, ev);
      switch (ev.type) {
        case 'jump':
        case 'land':
          SG.visEvent(pres.vis[ev.who], ev, w.players[ev.who]);
          break;
        case 'bump':
          touching = true;
          if (!pres.touching) FX.sideDust(ev.x, ev.y, 0);
          break;
        case 'stomp': {
          const top = w.players[ev.top];
          const victim = w.players[ev.bottom];
          victim.px = victim.x; // teleported: don't interpolate from the hit position
          victim.py = victim.y;
          SG.visEvent(pres.vis[ev.top], { type: 'stompTop' }, top);
          SG.visEvent(pres.vis[ev.bottom], { type: 'respawn' }, victim);
          FX.ghost(ev.x, ev.y, ev.bottom, ev.facing);
          FX.stars(ev.x, ev.y, 6);
          FX.burst(ev.x, ev.y, SG.PALETTE[ev.top].light, 14, 5);
          FX.ring(ev.x, ev.y, '#fff', 46, 18);
          FX.text(top.x + top.w / 2, top.y - 34, '+1', ev.top === 0 ? '#ff8a80' : '#82c4ff', 24);
          FX.ring(victim.x + victim.w / 2, victim.y + victim.h / 2, SG.PALETTE[ev.bottom].light, 34, 22);
          FX.dust(victim.x + victim.w / 2, victim.y + victim.h, 6, 12, SG.PALETTE[ev.bottom].light);
          if (shakeOn) FX.shake = Math.max(FX.shake, 7);
          FX.flash = 0.5;
          FX.flashColor = '#ffffff';
          break;
        }
        case 'go':
          FX.flash = 0.25;
          break;
        case 'roundStart':
          for (const p of w.players) { p.px = p.x; p.py = p.y; }
          for (const p of w.stage.platforms) { p.px = p.x; p.py = p.y; }
          SG.snapCamera(pres.cam, w.players);
          break;
        case 'suddenDeath':
          FX.flash = 0.6;
          FX.flashColor = '#ff3030';
          if (shakeOn) FX.shake = Math.max(FX.shake, 5);
          break;
        case 'roundEnd': {
          const winner = w.players[ev.winner];
          pres.vis[ev.winner].result = 'win';
          pres.vis[1 - ev.winner].result = 'lose';
          if (ev.matchOver) {
            FX.confetti(pres.cam.x, pres.cam.x + VW / pres.cam.zoom, pres.cam.top, 90);
            if (shakeOn) FX.shake = Math.max(FX.shake, 10);
          } else {
            FX.burst(winner.x + 15, winner.y + 10, '#ffd23f', 20, 5);
          }
          break;
        }
        default:
          break;
      }
    }
    pres.touching = touching;
  }

  function onTick(session) {
    const w = session.world;
    for (let i = 0; i < 2; i++) SG.tickVis(pres.vis[i], w.players[i], w.phase);
    SG.FX.tick();
    SG.hudTick(pres.hud);
  }

  // ---------------------------------------------------------------- online connection
  // Online play needs the page to be served by server.js (same host); file:// has no server.
  const onServer = location.protocol === 'http:' || location.protocol === 'https:';
  function netConnect(onMessage, onClose) {
    let sock;
    try {
      sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    } catch (e) {
      return null;
    }
    const outbox = [];
    let closed = false;
    sock.onopen = () => { while (outbox.length) sock.send(outbox.shift()); };
    sock.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      onMessage(msg);
    };
    sock.onclose = () => { if (!closed) { closed = true; onClose(); } };
    sock.onerror = () => { /* followed by onclose */ };
    return {
      send(obj) {
        const text = JSON.stringify(obj);
        if (sock.readyState === 1) sock.send(text);
        else if (sock.readyState === 0) outbox.push(text);
      },
      close() {
        closed = true;
        try { sock.close(); } catch (e) { /* ignore */ }
      },
    };
  }
  // Addresses to show the other player. When this page was opened as "localhost", other devices
  // need the computer's network address, which the server reports.
  function baseUrls(ips, port) {
    const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
    if (!local) return [location.origin];
    return ips.map((ip) => `http://${ip}:${port || location.port}`);
  }
  function shareUrls(code, ips, port) {
    return baseUrls(ips, port).map((u) => u + '/?room=' + code);
  }
  // Clipboard. Runs inside the key/tap handler (a user gesture). execCommand works on plain-http LAN
  // addresses too, where navigator.clipboard is unavailable (it needs a secure context).
  function copyText(text) {
    let ok = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
      ta.remove();
    } catch (e) {
      ok = false;
    }
    if (!ok && navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
      ok = true;
    }
    canvas.focus();
    return ok;
  }

  // Address other devices should open (shown on the Online screen).
  SG.deviceUrls = [];
  if (onServer) {
    fetch('/info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => { if (info && Array.isArray(info.ips)) SG.deviceUrls = baseUrls(info.ips, info.port); })
      .catch(() => { /* not served by server.js */ });
  }

  // ---------------------------------------------------------------- game
  const defaultLang = (navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  game = new SG.Game({
    defaultLang,
    sfx: (name, o) => SG.Audio.play(name, o),
    music: (track) => SG.Audio.music(track),
    duck: (on) => SG.Audio.duck(on),
    applyAudio: (s) => SG.Audio.apply(s),
    applyDisplay: (s) => {
      scaleSetting = s.scale;
      document.documentElement.lang = s.lang;
      fitCanvas();
    },
    toggleFullscreen,
    isFullscreen: () => !!document.fullscreenElement,
    load,
    save,
    seed: () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
    onMatchStart,
    onWorldEvents,
    onTick,
    netConnect: onServer && 'WebSocket' in window ? netConnect : null,
    now: () => performance.now(),
    shareUrls,
    copyText,
  });
  window.game = game; // handy for debugging from the console

  // ---------------------------------------------------------------- input
  const PASS_THROUGH = ['F5', 'F11', 'F12'];
  window.addEventListener('keydown', (e) => {
    SG.Audio.unlock();
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    if (PASS_THROUGH.includes(e.code)) return;
    e.preventDefault();
    game.touchUI = false; // a keyboard is in use: hide the on-screen buttons
    game.keyDown(e.code, e.repeat);
  });
  window.addEventListener('keyup', (e) => game.keyUp(e.code));
  window.addEventListener('blur', () => game.blur());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.blur();
      SG.Audio.suspend();
    } else SG.Audio.resume();
  });

  function toView(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  }
  function hit(pt) {
    for (const r of SG.UI.rects) if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return r;
    return null;
  }
  // Menus: mouse, pen and touch all select/activate rows.
  function menuPointer(pt) {
    const top = game.top();
    const r = hit(pt);
    if (top === 'title' || top === 'credits') return game.menuKey('Enter', false);
    if (top === 'howto') return game.menuKey('ArrowRight', false);
    if (!r) return;
    if (r.action === 'prev') game.menuKey('ArrowLeft', false);
    else if (r.action === 'next') game.menuKey('ArrowRight', false);
    else if (r.action === 'start') game.menuKey('Enter', false);
    else if (r.action === 'dec' || r.action === 'inc') game.pointerAdjust(r.index, r.action === 'dec' ? -1 : 1);
    else if (r.action === 'key') game.joinKey(r.value);
    else game.pointerSelect(r.index, true);
  }

  // Matches on a touch screen: every finger is mapped to an on-screen button; the set of pressed
  // buttons is turned into virtual key presses ("Touch0Left", "Touch0Jump", …).
  const fingers = new Map(); // pointerId → view point
  let touchDown = new Set();
  function syncTouch() {
    const now = new Set();
    if (game.top() === 'play') {
      const buttons = game.touchButtons();
      for (const pt of fingers.values()) {
        const b = SG.touchHit(buttons, pt.x, pt.y);
        if (b) now.add(b.code);
      }
    }
    for (const c of touchDown) if (!now.has(c)) game.keyUp(c);
    for (const c of now) if (!game.keys[c]) game.keyDown(c, false); // also re-presses after a pause
    touchDown = now;
  }
  SG.touchState = () => touchDown;

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (fingers.has(e.pointerId)) { fingers.set(e.pointerId, toView(e)); syncTouch(); }
      return;
    }
    const r = hit(toView(e));
    canvas.style.cursor = r || game.top() === 'title' ? 'pointer' : 'default';
    if (r && r.index >= 0 && !r.action) game.pointerSelect(r.index, false);
  });
  canvas.addEventListener('pointerdown', (e) => {
    SG.Audio.unlock();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const pt = toView(e);
    if (e.pointerType === 'touch') {
      game.touchUI = true;
      if (game.top() === 'play') {
        fingers.set(e.pointerId, pt);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        syncTouch();
        return;
      }
    }
    menuPointer(pt);
  });
  const fingerUp = (e) => {
    if (!fingers.delete(e.pointerId)) return;
    syncTouch();
  };
  canvas.addEventListener('pointerup', fingerUp);
  canvas.addEventListener('pointercancel', fingerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- gamepads
  // First connected controller is P1, second is P2 (in 1P / online modes either controls you).
  // Buttons become virtual keys "Pad<slot><Button>" so menus, pause and play reuse the keyboard paths.
  const PAD_BUTTONS = ['Left', 'Right', 'Up', 'Down', 'A', 'B', 'Start'];
  const padPrev = [{}, {}];
  const padHeld = [{}, {}];
  let padIds = [null, null];
  function readPad(gp) {
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0;
    const ay = gp.axes[1] || 0;
    return {
      Left: b(14) || ax < -0.5, Right: b(15) || ax > 0.5, Up: b(12) || ay < -0.5, Down: b(13) || ay > 0.5,
      A: b(0), B: b(1), Start: b(9),
    };
  }
  function pollPads() {
    if (!navigator.getGamepads) return;
    let list = [];
    try { list = Array.from(navigator.getGamepads()).filter((p) => p && p.connected); } catch (e) { return; }
    list.sort((a, b) => a.index - b.index);
    for (let slot = 0; slot < 2; slot++) {
      const gp = list[slot];
      const id = gp ? gp.index : null;
      if (id !== padIds[slot]) {
        if (id !== null) game.toast = { text: SG.t('padOn', slot + 1), ticks: 120 };
        else if (padIds[slot] !== null) game.toast = { text: SG.t('padOff', slot + 1), ticks: 120 };
        padIds[slot] = id;
      }
      const now = gp ? readPad(gp) : {};
      const prev = padPrev[slot];
      const held = padHeld[slot];
      for (const name of PAD_BUTTONS) {
        const code = 'Pad' + slot + name;
        if (now[name] && !prev[name]) {
          SG.Audio.unlock();
          game.touchUI = false;
          game.keyDown(code, false);
          held[name] = 0;
        } else if (now[name]) {
          // menu auto-repeat for directions (matches never see repeats)
          held[name]++;
          if (['Up', 'Down', 'Left', 'Right'].includes(name) && game.top() !== 'play' && held[name] > 22 && (held[name] - 22) % 6 === 0) {
            game.keyDown(code, true);
          }
        } else if (prev[name]) game.keyUp(code);
      }
      padPrev[slot] = now;
    }
  }

  // Opened from a shared room link: …/?room=1234
  try {
    const room = new URLSearchParams(location.search).get('room');
    if (room && SG.validRoomCode(room)) {
      game.autoJoin(room);
      history.replaceState(null, '', location.pathname); // a reload should not re-join
    }
  } catch (e) {
    /* no URL params */
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let acc = 0;
  let fps = 0;
  let frames = 0;
  let fpsTime = last;

  function render(alpha, dt) {
    ctx.setTransform(backing, 0, 0, backing, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const s = game.session;
    const top = game.top();
    UI_NAMES();
    if (s && game.inMatchStack()) {
      const w = s.world;
      const stepping = top === 'play' || top === 'results';
      const a = stepping ? alpha : 1;
      SG.updateCamera(pres.cam, w.players, stepping ? dt : 0);
      SG.drawWorld(ctx, w, pres.cam, pres.vis, a, {
        shake: game.settings.shake, labels: game.settings.labels, names: SG.UI.names, debug: game.debug, uiTicks: game.uiTicks,
      });
      SG.drawHud(ctx, w, pres.hud, SG.UI.names, game.uiTicks);
      if (s.online) {
        const rtt = game.net && game.net.rtt >= 0 ? `  ${Math.round(game.net.rtt)} ms` : '';
        const y = s.world.opts.bestOf > 1 ? 78 : 64; // below the round pips
        SG.text(ctx, SG.t('onlineTag') + rtt, VW / 2, y, { size: 9, weight: 'bold', color: 'rgba(170,255,200,0.95)', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });
      }
      if (top === 'play' && game.touchUI) SG.UI.drawTouch(ctx, game, touchDown);
      if (top !== 'play') SG.UI.draw(ctx, game, game.uiTicks, true);
      else SG.UI.rects = [];
    } else {
      SG.UI.draw(ctx, game, game.uiTicks, false);
    }
    if (game.debug) SG.drawDebug(ctx, game, fps);
  }
  function UI_NAMES() { SG.UI.names = names(); }

  function frame(now) {
    const dt = Math.min(now - last, 250); // clamp after tab switches (no catch-up spiral)
    last = now;
    acc += dt;
    while (acc >= C.TICK_MS) {
      pollPads();
      if (fingers.size || touchDown.size) syncTouch();
      game.tick();
      if (!game.inMatchStack()) SG.UI.tick();
      acc -= C.TICK_MS;
    }
    frames++;
    if (now - fpsTime >= 1000) {
      fps = frames;
      frames = 0;
      fpsTime = now;
    }
    render(acc / C.TICK_MS, dt / 1000);
    requestAnimationFrame(frame);
  }

  fitCanvas();
  canvas.focus();
  requestAnimationFrame(frame);
})();
