// game.js — application state machine (screens, match sessions, pause, settings, input routing).
// DOM-free: presentation (audio, effects, display) is reached only through `hooks`, so the whole
// flow can be driven by tests in Node.
(function (root) {
  'use strict';
  const SG = root.SG;
  const C = SG.C;

  const DEFAULT_KEYS = {
    p1: { left: 'KeyA', right: 'KeyD', jump: 'KeyW' },
    p2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp' },
  };
  const RESERVED_KEYS = ['Escape', 'F1'];

  SG.defaultSettings = function (lang) {
    return {
      version: 1,
      musicVol: 6,
      sfxVol: 8,
      mute: false,
      battleMusic: true,
      shake: true,
      labels: true,
      scale: 'fit', // 'fit' | 1 | 2
      lang: lang || 'en',
      keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
      setup: { mode: 'versus', winScore: 5, bestOf: 1, timer: 0, cpuLevel: 3, practiceOpp: 0, stageId: 'meadow' },
    };
  };

  // Merge stored settings over defaults, validating every field (corrupt storage never breaks the game).
  SG.sanitizeSettings = function (raw, lang) {
    const d = SG.defaultSettings(lang);
    if (!raw || typeof raw !== 'object') return d;
    const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
    const bool = (v, def) => (typeof v === 'boolean' ? v : def);
    d.musicVol = int(raw.musicVol, 0, 10, d.musicVol);
    d.sfxVol = int(raw.sfxVol, 0, 10, d.sfxVol);
    d.mute = bool(raw.mute, d.mute);
    d.battleMusic = bool(raw.battleMusic, d.battleMusic);
    d.shake = bool(raw.shake, d.shake);
    d.labels = bool(raw.labels, d.labels);
    d.scale = ['fit', 1, 2].includes(raw.scale) ? raw.scale : d.scale;
    d.lang = SG.LANGS.includes(raw.lang) ? raw.lang : d.lang;
    if (raw.keys && typeof raw.keys === 'object') {
      for (const pl of ['p1', 'p2']) {
        for (const a of ['left', 'right', 'jump']) {
          const v = raw.keys[pl] && raw.keys[pl][a];
          if (typeof v === 'string' && v.length < 40 && !RESERVED_KEYS.includes(v)) d.keys[pl][a] = v;
        }
      }
      const all = ['p1', 'p2'].flatMap((pl) => ['left', 'right', 'jump'].map((a) => d.keys[pl][a]));
      if (new Set(all).size !== all.length) d.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
    }
    const s = raw.setup || {};
    d.setup.mode = ['versus', 'cpu', 'practice', 'online'].includes(s.mode) ? s.mode : d.setup.mode;
    d.setup.winScore = int(s.winScore, 1, 10, d.setup.winScore);
    d.setup.bestOf = [1, 3, 5].includes(s.bestOf) ? s.bestOf : d.setup.bestOf;
    d.setup.timer = [0, 60, 90, 120].includes(s.timer) ? s.timer : d.setup.timer;
    d.setup.cpuLevel = int(s.cpuLevel, 1, 5, d.setup.cpuLevel);
    d.setup.practiceOpp = s.practiceOpp === 'human' ? 'human' : int(s.practiceOpp, 0, 5, d.setup.practiceOpp);
    d.setup.stageId = SG.STAGES.some((st) => st.id === s.stageId) ? s.stageId : d.setup.stageId;
    return d;
  };

  const NAV = {
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    ok: ['Enter', 'NumpadEnter', 'Space'],
    back: ['Escape', 'Backspace'],
  };
  // Gamepads arrive as virtual key codes "Pad<slot><Button>" (see main.js): D-pad/stick, A, B, Start.
  const PAD_NAV = { Up: 'up', Down: 'down', Left: 'left', Right: 'right', A: 'ok', Start: 'ok', B: 'back' };
  const PAD_RE = /^Pad([01])(Up|Down|Left|Right|A|B|Start)$/;
  const isVirtual = (code) => /^(Pad|Touch)/.test(code);
  const navOf = (code) => {
    for (const k in NAV) if (NAV[k].includes(code)) return k;
    const m = PAD_RE.exec(code);
    return m ? PAD_NAV[m[2]] : null;
  };
  const isPauseKey = (code) => code === 'Escape' || code === 'TouchPause' || /^Pad[01]Start$/.test(code);
  const DIGIT_RE = /^(?:Digit|Numpad)([0-9])$/;
  // On-screen keypad of the Join Room screen (row-major, 3 columns).
  SG.JOIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];

  const OVERLAY_LOCK_TICKS = 30; // ignore menu input right after an overlay appears mid-action
  const noop = () => {};

  SG.Game = function (hooks) {
    const h = Object.assign(
      {
        sfx: noop, music: noop, duck: noop, applyAudio: noop, applyDisplay: noop,
        toggleFullscreen: noop, isFullscreen: () => false,
        load: () => null, save: noop,
        onMatchStart: noop, onWorldEvents: noop, onTick: noop,
        // Online: netConnect(onMessage, onClose) → { send(obj), close() } or null when no server is reachable.
        netConnect: null, now: () => 0, shareUrls: () => [], copyText: () => false,
      },
      hooks || {}
    );
    const g = this;
    g.hooks = h;
    g.settings = SG.sanitizeSettings(h.load(), h.defaultLang);
    SG.lang = g.settings.lang;
    g.stack = ['title'];
    g.cursor = {};
    g.keys = Object.create(null);
    g.pressed = Object.create(null);
    g.session = null;
    g.debug = false;
    g.capture = null;
    g.screenTicks = 0;
    g.uiTicks = 0;
    g.stageIndex = Math.max(0, SG.STAGES.findIndex((s) => s.id === g.settings.setup.stageId));
    g.howPage = 0;
    g.toast = null;
    g.focusPaused = false;
    g.matchCounter = 0;
    g.net = null; // online connection state (see "online" below)
    g.joinCode = '';
    g.joinCursor = 0;
    g.touchUI = false; // set by main.js once a touch screen is used
    g.serverHint = 0; // ticks left to flash the "start the server" instructions
    h.applyAudio(g.settings);
    h.applyDisplay(g.settings);
    g.updateMusic();
  };

  const P = SG.Game.prototype;

  // ---------------------------------------------------------------- screens
  P.top = function () { return this.stack[this.stack.length - 1]; };

  P.go = function (screen, replace) {
    if (replace) this.stack[this.stack.length - 1] = screen;
    else this.stack.push(screen);
    this.enterScreen();
  };
  P.back = function () {
    if (this.stack.length > 1) this.stack.pop();
    this.enterScreen();
  };
  P.reset = function (screen) {
    this.stack = [screen];
    this.enterScreen();
  };
  P.enterScreen = function () {
    this.screenTicks = 0;
    this.capture = null;
    this.clearPressed();
    const items = this.menuItems();
    if (items) {
      const top = this.top();
      if (this.cursor[top] === undefined || top === 'pause' || top === 'results') this.cursor[top] = this.defaultCursor(top, items);
      this.cursor[top] = Math.min(this.cursor[top], items.length - 1);
    }
    this.updateMusic();
  };
  P.defaultCursor = function (screen, items) {
    if (screen === 'setup') return items.findIndex((it) => it.id === 'next');
    return 0;
  };

  P.clearPressed = function () { this.pressed = Object.create(null); };
  P.releaseAll = function () {
    this.keys = Object.create(null);
    this.pressed = Object.create(null);
  };

  P.isMenuScreen = function (s) { return !['play', 'pause', 'results'].includes(s); };
  P.inMatchStack = function () { return this.stack.includes('play'); };

  P.updateMusic = function () {
    const top = this.top();
    let track = null;
    if (!this.inMatchStack()) track = 'menu';
    else if (this.stack.includes('results')) track = null;
    else if (this.settings.battleMusic && this.session && this.session.world.phase !== 'matchEnd' && !this.session.musicStopped) track = 'battle';
    this.hooks.music(track);
    this.hooks.duck(this.inMatchStack() && top !== 'play');
  };

  // ---------------------------------------------------------------- settings
  P.saveSettings = function () {
    this.settings.setup.stageId = SG.STAGES[this.stageIndex].id;
    this.hooks.save(JSON.parse(JSON.stringify(this.settings)));
  };
  P.changeSetting = function (key, value) {
    this.settings[key] = value;
    if (key === 'lang') SG.lang = value;
    this.hooks.applyAudio(this.settings);
    this.hooks.applyDisplay(this.settings);
    if (key === 'battleMusic') this.updateMusic();
    this.saveSettings();
  };
  P.resetSettings = function () {
    const lang = this.settings.lang;
    const setup = this.settings.setup;
    this.settings = SG.defaultSettings(lang);
    this.settings.setup = setup;
    SG.lang = lang;
    this.hooks.applyAudio(this.settings);
    this.hooks.applyDisplay(this.settings);
    this.updateMusic();
    this.saveSettings();
    this.toast = { text: SG.t('resetDone'), ticks: 120 };
  };
  P.bindKey = function (pl, action, code) {
    const k = this.settings.keys;
    const old = k[pl][action];
    for (const p2 of ['p1', 'p2']) {
      for (const a of ['left', 'right', 'jump']) {
        if (k[p2][a] === code && !(p2 === pl && a === action)) k[p2][a] = old; // swap on conflict
      }
    }
    k[pl][action] = code;
    this.saveSettings();
  };

  // ---------------------------------------------------------------- menus (model)
  const cycle = (list, cur, dir) => {
    let i = list.indexOf(cur);
    if (i < 0) i = 0;
    return list[(i + dir + list.length) % list.length];
  };

  P.menuItems = function () {
    const g = this;
    const s = g.settings;
    const su = s.setup;
    const t = SG.t;
    switch (g.top()) {
      case 'main':
        return [
          { id: 'versus', label: () => t('localVs'), ok: () => g.openSetup('versus') },
          { id: 'cpu', label: () => t('vsCpu'), ok: () => g.openSetup('cpu') },
          { id: 'practice', label: () => t('practice'), ok: () => g.openSetup('practice') },
          { id: 'online', label: () => t('online'), ok: () => g.go('online') },
          { id: 'settings', label: () => t('settings'), ok: () => g.go('settings') },
          { id: 'howto', label: () => t('howTo'), ok: () => { g.howPage = 0; g.go('howto'); } },
          { id: 'credits', label: () => t('credits'), ok: () => g.go('credits') },
        ];
      case 'setup': {
        const items = [];
        const mode = su.mode;
        if (mode === 'cpu') {
          items.push({ id: 'cpuLevel', label: () => t('cpuLevel'), value: () => t('level', su.cpuLevel) + '  ' + t('lvNames')[su.cpuLevel],
            adjust: (d) => { su.cpuLevel = SG.clamp(su.cpuLevel + d, 1, 5); g.saveSettings(); } });
        }
        if (mode === 'practice') {
          const opts = [0, 1, 2, 3, 4, 5, 'human'];
          items.push({ id: 'practiceOpp', label: () => t('opponent'),
            value: () => (su.practiceOpp === 0 ? t('dummy') : su.practiceOpp === 'human' ? t('human') : t('cpu') + ' ' + t('level', su.practiceOpp)),
            adjust: (d) => { su.practiceOpp = cycle(opts, su.practiceOpp, d); g.saveSettings(); } });
        } else {
          items.push({ id: 'winScore', label: () => t('winScore'), value: () => String(su.winScore),
            adjust: (d) => { su.winScore = SG.clamp(su.winScore + d, 1, 10); g.saveSettings(); } });
          items.push({ id: 'bestOf', label: () => t('format'), value: () => (su.bestOf === 1 ? t('single') : t('bestOf', su.bestOf)),
            adjust: (d) => { su.bestOf = cycle([1, 3, 5], su.bestOf, d); g.saveSettings(); } });
          items.push({ id: 'timer', label: () => t('timer'), value: () => (su.timer === 0 ? t('off') : t('seconds', su.timer)),
            adjust: (d) => { su.timer = cycle([0, 60, 90, 120], su.timer, d); g.saveSettings(); } });
        }
        items.push({ id: 'next', label: () => t('chooseStage'), ok: () => g.go('stage') });
        items.push({ id: 'back', label: () => t('back'), ok: () => g.back() });
        return items;
      }
      case 'settings': {
        const onOff = (v) => (v ? t('on') : t('off'));
        const toggle = (key) => () => g.changeSetting(key, !s[key]);
        return [
          { id: 'musicVol', label: () => t('musicVol'), slider: () => s.musicVol, adjust: (d) => g.changeSetting('musicVol', SG.clamp(s.musicVol + d, 0, 10)) },
          { id: 'sfxVol', label: () => t('sfxVol'), slider: () => s.sfxVol, adjust: (d) => { g.changeSetting('sfxVol', SG.clamp(s.sfxVol + d, 0, 10)); g.hooks.sfx('menuMove'); } },
          { id: 'mute', label: () => t('mute'), value: () => onOff(s.mute), adjust: toggle('mute'), ok: toggle('mute') },
          { id: 'battleMusic', label: () => t('battleMusic'), value: () => onOff(s.battleMusic), adjust: toggle('battleMusic'), ok: toggle('battleMusic') },
          { id: 'shake', label: () => t('shake'), value: () => onOff(s.shake), adjust: toggle('shake'), ok: toggle('shake') },
          { id: 'labels', label: () => t('labels'), value: () => onOff(s.labels), adjust: toggle('labels'), ok: toggle('labels') },
          { id: 'scale', label: () => t('display'), value: () => (s.scale === 'fit' ? t('fit') : s.scale + '×'),
            adjust: (d) => g.changeSetting('scale', cycle(['fit', 1, 2], s.scale, d)) },
          { id: 'fullscreen', label: () => t('fullscreen'), value: () => onOff(g.hooks.isFullscreen()),
            adjust: () => g.hooks.toggleFullscreen(), ok: () => g.hooks.toggleFullscreen() },
          { id: 'lang', label: () => t('language'), value: () => (s.lang === 'ja' ? '日本語' : 'English'),
            adjust: (d) => g.changeSetting('lang', cycle(SG.LANGS, s.lang, d)), ok: () => g.changeSetting('lang', cycle(SG.LANGS, s.lang, 1)) },
          { id: 'controls', label: () => t('controls'), ok: () => g.go('controls') },
          { id: 'reset', label: () => t('resetDefaults'), ok: () => g.resetSettings() },
          { id: 'back', label: () => t('back'), ok: () => g.back() },
        ];
      }
      case 'controls': {
        const items = [];
        for (const pl of ['p1', 'p2']) {
          for (const a of ['left', 'right', 'jump']) {
            items.push({ id: pl + a, player: pl, action: a,
              label: () => pl.toUpperCase() + '  ' + t(a === 'left' ? 'moveLeft' : a === 'right' ? 'moveRight' : 'jump'),
              value: () => (g.capture && g.capture.player === pl && g.capture.action === a ? '…' : SG.keyName(s.keys[pl][a])),
              ok: () => { g.capture = { player: pl, action: a }; } });
          }
        }
        items.push({ id: 'resetKeys', label: () => t('resetControls'), ok: () => { s.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); g.saveSettings(); } });
        items.push({ id: 'back', label: () => t('back'), ok: () => g.back() });
        return items;
      }
      case 'online':
        return [
          { id: 'create', label: () => t('createRoom'), ok: () => g.requireServer() && g.openSetup('online') },
          { id: 'join', label: () => t('joinRoom'), ok: () => { if (g.requireServer()) { g.joinCode = ''; g.joinCursor = 0; g.go('join'); } } },
          { id: 'back', label: () => t('back'), ok: () => g.back() },
        ];
      case 'lobby': {
        const items = [];
        if (g.net && g.net.phase === 'lobby' && g.net.urls.length) items.push({ id: 'copy', label: () => (g.net.copyMsg ? '✓ ' + t(g.net.copyMsg.key) : t('copyLink')), ok: () => g.copyInviteLink() });
        items.push({ id: 'cancel', label: () => t('cancel'), ok: () => g.cancelLobby() });
        return items;
      }
      case 'pause':
        if (g.session && g.session.online) {
          return [
            { id: 'resume', label: () => t('resume'), ok: () => g.resume() },
            { id: 'settings', label: () => t('settings'), ok: () => g.go('settings') },
            { id: 'leave', label: () => t('leaveMatch'), ok: () => g.quitToMenu() },
          ];
        }
        return [
          { id: 'resume', label: () => t('resume'), ok: () => g.resume() },
          { id: 'restart', label: () => t('restart'), ok: () => g.startMatch() },
          { id: 'settings', label: () => t('settings'), ok: () => g.go('settings') },
          { id: 'menu', label: () => t('mainMenu'), ok: () => g.quitToMenu() },
        ];
      case 'results':
        if (g.session && g.session.online) {
          return [
            { id: 'rematch', label: () => (g.net && g.net.votes[g.net.slot] ? t('waitRematch', g.net.votes.filter(Boolean).length) : t('rematch')), ok: () => g.voteRematch() },
            { id: 'leave', label: () => t('leaveMatch'), ok: () => g.quitToMenu() },
          ];
        }
        return [
          { id: 'rematch', label: () => t('rematch'), ok: () => g.startMatch() },
          { id: 'stage', label: () => t('changeStage'), ok: () => { g.endSession(); g.stack = ['main', 'setup', 'stage']; g.enterScreen(); } },
          { id: 'menu', label: () => t('mainMenu'), ok: () => g.quitToMenu() },
        ];
      default:
        return null;
    }
  };

  P.openSetup = function (mode) {
    this.settings.setup.mode = mode;
    this.cursor.setup = undefined;
    this.go('setup');
  };

  // ---------------------------------------------------------------- match sessions
  P.matchOptions = function () {
    const su = this.settings.setup;
    const practice = su.mode === 'practice';
    return {
      stageId: SG.STAGES[this.stageIndex].id,
      mode: su.mode,
      winScore: practice ? 0 : su.winScore,
      bestOf: practice ? 1 : su.bestOf,
      timeLimit: practice ? 0 : su.timer,
      cpuLevel: su.mode === 'cpu' ? su.cpuLevel : practice && su.practiceOpp !== 'human' ? su.practiceOpp : null,
    };
  };

  P.startMatch = function (seed) {
    const opts = this.matchOptions();
    this.saveSettings();
    this.matchCounter++;
    const aiSeed = seed !== undefined ? seed : (this.hooks.seed ? this.hooks.seed() : this.matchCounter * 7919);
    const world = SG.createWorld(opts);
    const ai = opts.cpuLevel === null || opts.cpuLevel === undefined ? null : SG.createAI(opts.cpuLevel, aiSeed);
    this.session = { opts, world, ai, resultsShown: false, musicStopped: false, aiInput: SG.NO_INPUT };
    this.releaseAll();
    this.stack = ['play'];
    this.focusPaused = false;
    this.enterScreen();
    this.hooks.onMatchStart(this.session);
    this.hooks.sfx('count', { n: 3 });
  };

  P.endSession = function () {
    this.session = null;
  };

  P.quitToMenu = function () {
    const wasOnline = !!(this.net || (this.session && this.session.online));
    this.netClose();
    this.endSession();
    this.releaseAll();
    if (wasOnline) {
      this.stack = ['main', 'online'];
      this.enterScreen();
    } else this.reset('main');
  };

  P.pause = function (focusLost) {
    if (this.top() !== 'play' || !this.session) return;
    if (this.session.world.phase === 'matchEnd') return;
    if (this.session.online) {
      // Online: the server pauses the match for both players; the overlay opens when it confirms.
      if (this.net) this.net.conn.send({ t: 'pause' });
      this.focusPaused = !!focusLost;
      return;
    }
    this.focusPaused = !!focusLost;
    this.hooks.sfx('pause');
    this.go('pause');
  };

  P.resume = function () {
    if (this.top() !== 'pause') return;
    if (this.session && this.session.online) {
      if (this.net) this.net.conn.send({ t: 'resume' });
      return;
    }
    this.focusPaused = false;
    this.back();
    this.hooks.sfx('resume');
  };

  // Which input sources control player i: keyboard set, gamepad slot, touch cluster.
  // In single-player and online modes the one local player may use either set.
  P.humanInput = function (i) {
    const s = this.session;
    const solo = !!(s && (s.ai || s.online));
    const srcs = solo && i === 0 ? [0, 1] : [i];
    const k = this.keys;
    const pr = this.pressed;
    const inp = { left: false, right: false, jumpHeld: false, jumpPressed: false };
    for (const src of srcs) {
      const b = this.settings.keys[src === 0 ? 'p1' : 'p2'];
      const pad = 'Pad' + src;
      const touch = 'Touch' + src;
      const L = [b.left, pad + 'Left', touch + 'Left'];
      const R = [b.right, pad + 'Right', touch + 'Right'];
      const J = [b.jump, pad + 'A', pad + 'B', touch + 'Jump'];
      inp.left = inp.left || L.some((c) => k[c]);
      inp.right = inp.right || R.some((c) => k[c]);
      inp.jumpHeld = inp.jumpHeld || J.some((c) => k[c]);
      inp.jumpPressed = inp.jumpPressed || J.some((c) => pr[c]);
    }
    return inp;
  };

  // Inputs for one local (offline) tick.
  P.localInputs = function (withInput) {
    const s = this.session;
    const w = s.world;
    if (withInput) {
      const i0 = this.humanInput(0);
      const i1 = s.ai ? s.ai.think(w, 1) : this.humanInput(1);
      s.aiInput = s.ai ? i1 : SG.NO_INPUT;
      return [i0, i1];
    }
    if (s.ai) s.ai.think(w, 1);
    return null;
  };

  P.stepMatch = function (inputs) {
    const s = this.session;
    const w = s.world;
    for (const p of w.players) { p.px = p.x; p.py = p.y; }
    for (const pl of w.stage.platforms) { pl.px = pl.x; pl.py = pl.y; }
    SG.stepWorld(w, inputs);
    for (const ev of w.events) this.onWorldEvent(ev);
    this.hooks.onWorldEvents(w.events, s);
    this.hooks.onTick(s);
    if (w.phase === 'matchEnd' && !s.resultsShown && w.phaseTimer >= 20) {
      s.resultsShown = true;
      this.go('results');
    }
  };

  P.onWorldEvent = function (ev) {
    const s = this.session;
    const sfx = this.hooks.sfx;
    switch (ev.type) {
      case 'count': sfx('count', { n: ev.n }); break;
      case 'go': sfx('go'); break;
      case 'roundStart': sfx('count', { n: 3 }); break;
      case 'jump': sfx('jump', { who: ev.who }); break;
      case 'land': if (ev.speed > 2) sfx('land', { who: ev.who, speed: ev.speed }); break;
      case 'bump': sfx('bump'); break;
      case 'stomp': sfx('stomp', { who: ev.top }); sfx('respawn'); break;
      case 'score': {
        const w = s.world;
        const ws = w.opts.winScore;
        const matchPoint = ws > 1 && ev.score === ws - 1 && !w.suddenDeath;
        sfx(matchPoint ? 'matchPoint' : 'score', { who: ev.who });
        break;
      }
      case 'suddenDeath': sfx('suddenDeath'); break;
      case 'roundEnd':
        if (ev.matchOver) {
          s.musicStopped = true;
          this.updateMusic();
          sfx('victory');
        } else sfx('roundWin');
        break;
      default: break;
    }
  };

  // ---------------------------------------------------------------- fixed tick (60 Hz)
  P.tick = function () {
    this.uiTicks++;
    this.screenTicks++;
    if (this.toast && --this.toast.ticks <= 0) this.toast = null;
    if (this.serverHint > 0) this.serverHint--;
    if (this.net && this.net.copyMsg && --this.net.copyMsg.ticks <= 0) this.net.copyMsg = null;
    const top = this.top();
    if (this.net && this.uiTicks % SG.NET.PING_EVERY === 0) this.net.conn.send({ t: 'ping', c: this.hooks.now() });
    if (this.session && this.session.online) this.tickOnline();
    else if (this.session && (top === 'play' || top === 'results')) this.stepMatch(this.localInputs(top === 'play'));
    this.clearPressed();
  };

  // ---------------------------------------------------------------- online (see js/net.js)
  P.requireServer = function () {
    if (this.hooks.netConnect) return true;
    // On the Online screen the instructions are already shown: flash them instead of covering the menu.
    if (this.top() === 'online') this.serverHint = 48;
    else this.toast = { text: SG.t('noServer'), ticks: 150 };
    this.hooks.sfx('back');
    return false;
  };

  P.onlineOpts = function () {
    const o = this.matchOptions();
    return SG.sanitizeOnlineOpts({ stageId: o.stageId, winScore: o.winScore, bestOf: o.bestOf, timeLimit: o.timeLimit });
  };

  // intent: 'create' | 'join'
  P.netOpen = function (intent, code) {
    this.netClose();
    const n = {
      intent, phase: 'connecting', code: code || '', urls: [], slot: -1, rtt: -1,
      votes: [false, false], pausedBy: -1, press: 0, sentPress: 0, lastBits: -1, conn: null, closing: false,
    };
    this.net = n;
    const conn = this.hooks.netConnect
      ? this.hooks.netConnect((msg) => { if (this.net === n) this.onNet(msg); }, () => { if (this.net === n) this.onNetClosed(); })
      : null;
    if (!conn) {
      this.net = null;
      this.requireServer();
      return false;
    }
    n.conn = conn;
    if (intent === 'create') conn.send({ t: 'create', v: SG.NET.PROTOCOL, opts: this.onlineOpts() });
    else conn.send({ t: 'join', v: SG.NET.PROTOCOL, code });
    this.go('lobby');
    return true;
  };

  P.onlineCreate = function () { return this.netOpen('create'); };
  P.onlineJoin = function (code) {
    if (!SG.validRoomCode(code)) return false;
    return this.netOpen('join', code);
  };
  // Opened from a shared link (…/?room=1234).
  P.autoJoin = function (code) {
    if (!SG.validRoomCode(code) || !this.hooks.netConnect) return false;
    this.stack = ['main', 'online', 'join'];
    this.joinCode = code;
    this.enterScreen();
    return this.onlineJoin(code);
  };

  P.netClose = function () {
    const n = this.net;
    if (!n) return;
    this.net = null;
    n.closing = true;
    try {
      n.conn.send({ t: 'leave' });
      n.conn.close();
    } catch (e) {
      /* already closed */
    }
  };

  // Copy the room's invite link (…/?room=1234) so it can be pasted into a chat app.
  P.copyInviteLink = function () {
    const n = this.net;
    if (!n || !n.urls.length) return false;
    const ok = !!this.hooks.copyText(n.urls[0]);
    n.copyMsg = { key: ok ? 'linkCopied' : 'copyFailed', ticks: 150 }; // shown on the button itself
    return ok;
  };

  P.cancelLobby = function () {
    this.netClose();
    if (this.top() === 'lobby') this.back();
  };

  // Connection or room ended unexpectedly: back to the Online menu with a message.
  P.endOnline = function (textKey) {
    this.netClose();
    this.endSession();
    this.releaseAll();
    this.stack = ['main', 'online'];
    this.enterScreen();
    this.toast = { text: SG.t(textKey), ticks: 180 };
    this.hooks.sfx('back');
  };

  P.onNetClosed = function () {
    if (this.net && !this.net.closing) this.endOnline(this.net.phase === 'connecting' ? 'noServer' : 'connLost');
  };

  P.onNet = function (msg) {
    const n = this.net;
    const s = this.session;
    const on = s && s.online;
    switch (msg.t) {
      case 'created':
        n.phase = 'lobby';
        n.code = msg.code;
        n.urls = this.hooks.shareUrls(msg.code, msg.ips || [], msg.port) || [];
        break;
      case 'error': {
        const key = { notFound: 'roomNotFound', full: 'roomFull', version: 'badVersion', busy: 'serverBusy' }[msg.reason] || 'connLost';
        this.netClose();
        if (this.top() === 'lobby') this.back();
        if (this.top() === 'join') this.joinCode = '';
        this.toast = { text: SG.t(key), ticks: 180 };
        this.hooks.sfx('back');
        break;
      }
      case 'start':
        this.startOnlineMatch(msg);
        break;
      case 'f':
        if (!on || !Array.isArray(msg.a)) break;
        for (let k = 0; k < msg.a.length; k++) on.queue.push({ n: msg.n + k, a: msg.a[k] });
        if (msg.h) for (const [hn, hv] of msg.h) on.hashes.set(hn, hv);
        break;
      case 'paused':
        n.pausedBy = msg.by;
        if (s && this.top() === 'play') {
          this.releaseAll();
          this.hooks.sfx('pause');
          this.go('pause');
        }
        break;
      case 'resumed':
        n.pausedBy = -1;
        this.focusPaused = false;
        if (s && this.stack.includes('pause')) {
          this.stack = ['play'];
          this.enterScreen();
          this.hooks.sfx('resume');
        }
        break;
      case 'votes':
        n.votes = msg.votes;
        break;
      case 'state':
        if (on) this.applyServerState(msg);
        break;
      case 'pong':
        if (typeof msg.c === 'number') n.rtt = Math.max(0, this.hooks.now() - msg.c);
        break;
      case 'left':
        this.endOnline('oppLeft');
        break;
      default:
        break;
    }
  };

  P.startOnlineMatch = function (msg) {
    const n = this.net;
    const opts = SG.sanitizeOnlineOpts(msg.opts);
    const world = SG.createWorld(opts);
    this.session = {
      opts, world, ai: null, resultsShown: false, musicStopped: false, aiInput: SG.NO_INPUT,
      online: { slot: msg.you, queue: [], history: [], hashes: new Map(), started: false, n: 0, stalls: 0, desyncs: 0, resyncs: 0 },
    };
    n.phase = 'match';
    n.slot = msg.you;
    n.code = msg.code || n.code;
    n.votes = [false, false];
    n.pausedBy = -1;
    this.releaseAll();
    this.stack = ['play'];
    this.focusPaused = false;
    this.enterScreen();
    this.hooks.onMatchStart(this.session);
    this.hooks.sfx('count', { n: 3 });
  };

  P.voteRematch = function () {
    if (!this.net) return;
    this.net.votes[this.net.slot] = true;
    this.net.conn.send({ t: 'rematch' });
  };

  P.tickOnline = function () {
    const s = this.session;
    const on = s.online;
    const n = this.net;
    if (!n) return;
    // 1) send this device's input (nothing is held while a menu is open over the match)
    const inp = this.top() === 'play' ? this.humanInput(0) : SG.NO_INPUT;
    if (inp.jumpPressed) n.press++;
    const bits = SG.packHeld(inp);
    if (bits !== n.lastBits || n.press !== n.sentPress) {
      n.conn.send({ t: 'in', b: bits, p: n.press });
      n.lastBits = bits;
      n.sentPress = n.press;
    }
    // 2) play the server's frames, keeping a small buffer against network jitter
    const NET = SG.NET;
    const q = on.queue;
    if (!on.started && q.length >= NET.START_BUFFER) on.started = true;
    let k = 0;
    if (on.started) {
      if (q.length > NET.FAST_FORWARD) k = q.length - NET.START_BUFFER;
      else if (q.length > NET.CATCH_UP) k = 2;
      else k = Math.min(1, q.length);
      if (q.length === 0 && s.world.phase !== 'matchEnd') {
        on.started = false; // ran dry: rebuild the buffer
        if (n.pausedBy < 0) on.stalls++;
      }
    }
    for (let j = 0; j < k && this.session === s; j++) this.applyFrame(q.shift());
    if (k === 0 && this.session === s) {
      const w = s.world;
      for (const p of w.players) { p.px = p.x; p.py = p.y; }
      for (const pl of w.stage.platforms) { pl.px = pl.x; pl.py = pl.y; }
      if (w.phase === 'matchEnd') this.hooks.onTick(s); // keep the celebration animating
    }
  };

  P.applyFrame = function (f) {
    const s = this.session;
    const on = s.online;
    if (f.n <= on.n) return;
    on.n = f.n;
    this.stepMatch([SG.unpackInput(f.a[0]), SG.unpackInput(f.a[1])]);
    on.history.push(f);
    if (on.history.length > 600) on.history.splice(0, on.history.length - 600);
    const h = on.hashes.get(f.n);
    if (h !== undefined) {
      on.hashes.delete(f.n);
      if (SG.hashWorld(s.world) !== h) {
        on.desyncs++;
        if (this.net) this.net.conn.send({ t: 'resync' });
      }
    }
  };

  // Replace the local world by the server's copy, then replay frames already played after it.
  P.applyServerState = function (msg) {
    const s = this.session;
    const on = s.online;
    const w = msg.w;
    if (!w || !w.players || !w.stage) return;
    w.events = [];
    if (msg.n >= on.n) {
      // we were behind: skip straight to the server's tick
      on.n = msg.n;
      on.queue = on.queue.filter((f) => f.n > msg.n);
    } else {
      for (const f of on.history) {
        if (f.n > msg.n) SG.stepWorld(w, [SG.unpackInput(f.a[0]), SG.unpackInput(f.a[1])]);
      }
    }
    w.events = [];
    for (const p of w.players) { p.px = p.x; p.py = p.y; }
    for (const pl of w.stage.platforms) { pl.px = pl.x; pl.py = pl.y; }
    s.world = w;
    on.resyncs++;
  };

  // ---------------------------------------------------------------- input
  P.keyDown = function (code, repeat) {
    if (code === 'F1') {
      if (!repeat) this.debug = !this.debug;
      return;
    }
    if (this.capture) {
      if (repeat) return;
      if (isVirtual(code)) {
        // controllers and touch buttons are fixed; B cancels the rebind
        if (/^Pad[01]B$/.test(code)) { this.hooks.sfx('back'); this.capture = null; }
        return;
      }
      if (code === 'Escape') this.hooks.sfx('back');
      else if (!RESERVED_KEYS.includes(code)) {
        this.bindKey(this.capture.player, this.capture.action, code);
        this.hooks.sfx('select');
      }
      this.capture = null;
      return;
    }
    const top = this.top();
    if (top === 'play') {
      if (isPauseKey(code)) {
        if (!repeat) this.pause(false);
        return;
      }
      if (!this.keys[code] && !repeat) this.pressed[code] = true;
      this.keys[code] = true;
      return;
    }
    this.keys[code] = true;
    if (top === 'join' && this.joinScreenKey(code, repeat)) return;
    this.menuKey(code, repeat);
  };

  P.keyUp = function (code) {
    this.keys[code] = false;
  };

  P.blur = function () {
    this.releaseAll();
    if (this.top() === 'play' && this.session && this.session.world.phase !== 'matchEnd') this.pause(true);
  };

  // Join Room screen: digits type the code; arrows / D-pad move over the on-screen keypad.
  P.joinScreenKey = function (code, repeat) {
    const m = DIGIT_RE.exec(code);
    if (m) { this.joinKey(m[1]); return true; }
    if (code === 'Backspace') { if (!repeat) this.joinKey('del'); return true; }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.joinCode.length === SG.NET.CODE_LEN) {
      if (!repeat) this.joinKey('ok');
      return true;
    }
    const nav = navOf(code);
    if (!nav) return true;
    const c = this.joinCursor;
    if (nav === 'left') this.joinCursor = c % 3 === 0 ? c + 2 : c - 1;
    else if (nav === 'right') this.joinCursor = c % 3 === 2 ? c - 2 : c + 1;
    else if (nav === 'up') this.joinCursor = (c + 9) % 12;
    else if (nav === 'down') this.joinCursor = (c + 3) % 12;
    else if (nav === 'ok') { if (!repeat) this.joinKey(SG.JOIN_KEYS[c]); return true; }
    else if (nav === 'back') { if (!repeat) { this.hooks.sfx('back'); this.back(); } return true; }
    this.hooks.sfx('menuMove');
    return true;
  };

  P.joinKey = function (key) {
    if (this.top() !== 'join') return;
    const i = SG.JOIN_KEYS.indexOf(key);
    if (i >= 0) this.joinCursor = i;
    if (/^[0-9]$/.test(key)) {
      if (this.joinCode.length < SG.NET.CODE_LEN) { this.joinCode += key; this.hooks.sfx('menuMove'); }
    } else if (key === 'del') {
      if (this.joinCode.length) { this.joinCode = this.joinCode.slice(0, -1); this.hooks.sfx('back'); }
    } else if (key === 'ok') {
      if (this.joinCode.length === SG.NET.CODE_LEN) { this.hooks.sfx('select'); this.onlineJoin(this.joinCode); }
      else this.hooks.sfx('back');
    }
  };

  P.menuKey = function (code, repeat) {
    const g = this;
    const top = g.top();
    const nav = navOf(code);
    if (!nav) return;
    if (top === 'lobby' && nav === 'back') {
      if (!repeat) { g.hooks.sfx('back'); g.cancelLobby(); }
      return;
    }
    // Results appear while players may still be mashing keys: ignore input for half a second.
    if (top === 'results' && g.screenTicks < OVERLAY_LOCK_TICKS) return;
    if (top === 'title') {
      if (nav === 'ok' && !repeat) { g.hooks.sfx('start'); g.go('main', true); }
      return;
    }
    if (top === 'howto') {
      const n = SG.t('howPages').length;
      if (nav === 'left' || nav === 'up') { if (g.howPage > 0) { g.howPage--; g.hooks.sfx('menuMove'); } }
      else if (nav === 'right' || nav === 'down' || nav === 'ok') {
        if (g.howPage < n - 1) { g.howPage++; g.hooks.sfx('menuMove'); }
        else if (nav === 'ok') { g.hooks.sfx('back'); g.back(); }
      } else if (nav === 'back') { g.hooks.sfx('back'); g.back(); }
      return;
    }
    if (top === 'credits') {
      if ((nav === 'back' || nav === 'ok') && !repeat) { g.hooks.sfx('back'); g.back(); }
      return;
    }
    if (top === 'stage') {
      const n = SG.STAGES.length;
      if (nav === 'left' || nav === 'up') { g.stageIndex = (g.stageIndex - 1 + n) % n; g.hooks.sfx('menuMove'); g.saveSettings(); }
      else if (nav === 'right' || nav === 'down') { g.stageIndex = (g.stageIndex + 1) % n; g.hooks.sfx('menuMove'); g.saveSettings(); }
      else if (nav === 'ok' && !repeat) {
        g.hooks.sfx('select');
        if (g.settings.setup.mode === 'online') g.onlineCreate();
        else g.startMatch();
      }
      else if (nav === 'back' && !repeat) { g.hooks.sfx('back'); g.back(); }
      return;
    }
    const items = g.menuItems();
    if (!items) return;
    let i = g.cursor[top] || 0;
    if (nav === 'up' || nav === 'down') {
      i = (i + (nav === 'up' ? -1 : 1) + items.length) % items.length;
      g.cursor[top] = i;
      g.hooks.sfx('menuMove');
    } else if (nav === 'left' || nav === 'right') {
      const it = items[i];
      if (it.adjust) { it.adjust(nav === 'left' ? -1 : 1); if (it.id !== 'sfxVol') g.hooks.sfx('menuMove'); }
    } else if (nav === 'ok') {
      if (repeat) return;
      const it = items[i];
      if (it.ok) { g.hooks.sfx(it.id === 'back' ? 'back' : 'select'); it.ok(); }
    } else if (nav === 'back') {
      if (repeat) return;
      g.hooks.sfx('back');
      if (top === 'pause') g.resume();
      else if (top === 'results') g.quitToMenu();
      else if (top === 'main') g.reset('title');
      else g.back();
    }
  };

  // Pointer support: select/activate a menu row by index.
  P.pointerSelect = function (index, activate) {
    const items = this.menuItems();
    if (!items || index < 0 || index >= items.length) return;
    if (this.cursor[this.top()] !== index) { this.cursor[this.top()] = index; if (!activate) this.hooks.sfx('menuMove'); }
    if (activate) this.menuKey('Enter', false);
  };
  // Pointer/touch: change a row's value (the ‹ › arrows).
  P.pointerAdjust = function (index, dir) {
    const items = this.menuItems();
    if (!items || index < 0 || index >= items.length || !items[index].adjust) return;
    this.cursor[this.top()] = index;
    this.menuKey(dir < 0 ? 'ArrowLeft' : 'ArrowRight', false);
  };

  // ---------------------------------------------------------------- touch controls (view coordinates)
  // Two clusters when two people share one touch screen, otherwise one big layout for one player.
  P.touchButtons = function () {
    const s = this.session;
    const shared = !!(s && !s.ai && !s.online);
    const VW = C.VIEW_W;
    const VH = C.VIEW_H;
    const b = [];
    if (shared) {
      const y = VH - 34;
      b.push({ code: 'Touch0Left', x: 46, y, r: 27, icon: 'left', who: 0 });
      b.push({ code: 'Touch0Right', x: 112, y, r: 27, icon: 'right', who: 0 });
      b.push({ code: 'Touch0Jump', x: 190, y, r: 30, icon: 'jump', who: 0 });
      b.push({ code: 'Touch1Jump', x: VW - 190, y, r: 30, icon: 'jump', who: 1 });
      b.push({ code: 'Touch1Left', x: VW - 112, y, r: 27, icon: 'left', who: 1 });
      b.push({ code: 'Touch1Right', x: VW - 46, y, r: 27, icon: 'right', who: 1 });
    } else {
      b.push({ code: 'Touch0Left', x: 56, y: VH - 42, r: 36, icon: 'left', who: 0 });
      b.push({ code: 'Touch0Right', x: 146, y: VH - 42, r: 36, icon: 'right', who: 0 });
      b.push({ code: 'Touch0Jump', x: VW - 72, y: VH - 46, r: 42, icon: 'jump', who: 0 });
    }
    b.push({ code: 'TouchPause', x: VW / 2, y: VH - 22, r: 17, icon: 'pause', who: -1 });
    return b;
  };
  // The button a finger at (x, y) is on (generous radius, nearest wins), or null.
  SG.touchHit = function (buttons, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const b of buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r * 1.35 && d < bestD) { best = b; bestD = d; }
    }
    return best;
  };

  // ---------------------------------------------------------------- key names
  const NAMES = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Backspace: 'Backspace', Tab: 'Tab', Slash: '/', Period: '.',
    Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
    Backslash: '\\', Backquote: '`',
  };
  SG.keyName = function (code) {
    if (!code) return '—';
    if (NAMES[code]) return NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
