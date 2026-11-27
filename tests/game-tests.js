// Controller (state machine) tests — driven through the same API the browser uses.
'use strict';
module.exports = function (SG, { test, assert, eq, I }) {
  const C = SG.C;

  function make(stored) {
    const log = [];
    let saved = null;
    const g = new SG.Game({
      load: () => stored || null,
      save: (s) => { saved = s; },
      sfx: (n) => log.push('sfx:' + n),
      music: (t) => log.push('music:' + t),
      duck: (d) => log.push('duck:' + d),
      seed: () => 42,
    });
    return { g, log, saved: () => saved };
  }
  const press = (g, code) => { g.keyDown(code, false); g.keyUp(code); };
  const ticks = (g, n) => { for (let i = 0; i < n; i++) g.tick(); };
  const mainIndex = (g, id) => g.menuItems().findIndex((it) => it.id === id);
  const startVersus = (g) => {
    press(g, 'Enter'); // title → main
    eq(g.top(), 'main');
    press(g, 'Enter'); // Local 1v1 → setup
    eq(g.top(), 'setup');
    press(g, 'Enter'); // cursor starts on "Choose stage"
    eq(g.top(), 'stage');
    press(g, 'Enter'); // fight
    eq(g.top(), 'play');
  };

  test('controller: default flow title → main → setup → stage → play in 4 presses', () => {
    const { g, log } = make();
    eq(g.top(), 'title');
    assert(log.includes('music:menu'), 'menu music on title');
    startVersus(g);
    eq(g.session.world.phase, 'countdown');
    eq(g.session.ai, null, 'versus has no AI');
    assert(log.includes('music:battle'), 'battle music');
  });

  test('controller: defaults keep Day 1 controls and rules', () => {
    const { g } = make();
    eq(JSON.stringify(g.settings.keys), JSON.stringify({ p1: { left: 'KeyA', right: 'KeyD', jump: 'KeyW' }, p2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp' } }));
    startVersus(g);
    eq(g.session.world.opts.winScore, 5);
    eq(g.session.world.stage.id, 'meadow');
  });

  test('controller: menu key presses never leak into the match as jumps', () => {
    const { g } = make();
    press(g, 'Enter');
    press(g, 'KeyW'); // menu navigation with W
    press(g, 'KeyS');
    press(g, 'Enter');
    press(g, 'Enter');
    g.keyDown('ArrowUp', false); // held into the match from the stage screen
    press(g, 'Enter');
    eq(g.top(), 'play');
    eq(Object.keys(g.pressed).length, 0, 'pressed buffer is empty at match start');
    ticks(g, C.COUNTDOWN_TICKS + 5);
    eq(g.session.world.players[1].onGround, true, 'held key from menu did not jump');
  });

  test('controller: pause freezes the simulation and resumes exactly', () => {
    const { g, log } = make();
    startVersus(g);
    ticks(g, 50);
    const h = SG.hashWorld(g.session.world);
    press(g, 'Escape');
    eq(g.top(), 'pause');
    assert(log.includes('duck:true'), 'music ducked');
    g.keyDown('KeyD', false);
    ticks(g, 300);
    eq(SG.hashWorld(g.session.world), h, 'no physics while paused');
    press(g, 'Escape');
    eq(g.top(), 'play');
    g.keyUp('KeyD');
    ticks(g, 1);
    assert(SG.hashWorld(g.session.world) !== h, 'runs again after resume');
  });

  test('controller: window blur releases keys and auto-pauses', () => {
    const { g } = make();
    startVersus(g);
    ticks(g, C.COUNTDOWN_TICKS + 1);
    g.keyDown('KeyD', false);
    ticks(g, 5);
    g.blur();
    eq(g.top(), 'pause');
    eq(g.focusPaused, true);
    eq(Object.values(g.keys).filter(Boolean).length, 0, 'all keys released');
    press(g, 'Enter'); // resume
    eq(g.top(), 'play');
    const x = g.session.world.players[0].x;
    ticks(g, 10);
    eq(g.session.world.players[0].x, x, 'stuck key did not keep moving the player');
  });

  test('controller: restart from pause creates a fresh match', () => {
    const { g } = make();
    startVersus(g);
    ticks(g, C.COUNTDOWN_TICKS + 10);
    g.session.world.players[0].score = 3;
    press(g, 'Escape');
    press(g, 'ArrowDown');
    press(g, 'Enter'); // Restart
    eq(g.top(), 'play');
    eq(g.session.world.players[0].score, 0);
    eq(g.session.world.phase, 'countdown');
    eq(g.session.world.countdown, C.COUNTDOWN_TICKS);
  });

  test('controller: match end → results (input-locked briefly) → rematch / menu', () => {
    const { g, log } = make();
    startVersus(g);
    ticks(g, C.COUNTDOWN_TICKS + 1);
    const w = g.session.world;
    w.opts.winScore = 1;
    const [a, b] = w.players;
    b.x = 400; b.y = 300; a.x = 400; a.y = 258; a.vy = 5; a.onGround = false;
    ticks(g, 1);
    eq(w.phase, 'roundEnd');
    assert(log.includes('sfx:victory'), 'victory sound');
    assert(log[log.length - 1] !== 'music:battle', 'battle music stopped');
    ticks(g, C.ROUND_END_TICKS + 25);
    eq(g.top(), 'results');
    press(g, 'ArrowDown'); // ignored: lock
    eq(g.cursor.results, 0);
    ticks(g, 40);
    press(g, 'Enter');
    eq(g.top(), 'play', 'rematch');
    eq(g.session.world.players[0].score, 0);
    // second match → main menu via Escape on results
    const w2 = g.session.world;
    ticks(g, C.COUNTDOWN_TICKS + 1);
    w2.opts.winScore = 1;
    w2.players[1].x = 400; w2.players[1].y = 300; w2.players[0].x = 400; w2.players[0].y = 258; w2.players[0].vy = 5;
    ticks(g, C.ROUND_END_TICKS + 80);
    eq(g.top(), 'results');
    press(g, 'Escape');
    eq(g.top(), 'main');
    eq(g.session, null, 'session cleaned up');
    eq(log.filter((l) => l.startsWith('music:')).pop(), 'music:menu');
  });

  test('controller: vs CPU uses the selected level and the AI waits during menus', () => {
    const { g } = make();
    press(g, 'Enter');
    press(g, 'ArrowDown');
    press(g, 'Enter'); // vs CPU
    eq(g.settings.setup.mode, 'cpu');
    eq(g.menuItems()[0].id, 'cpuLevel');
    g.cursor.setup = 0;
    press(g, 'ArrowRight'); // level 4
    press(g, 'ArrowRight'); // level 5
    press(g, 'ArrowRight'); // clamp 5
    eq(g.settings.setup.cpuLevel, 5);
    g.cursor.setup = g.menuItems().findIndex((i) => i.id === 'next');
    press(g, 'Enter');
    press(g, 'Enter');
    eq(g.session.ai.level, 5);
    ticks(g, 30);
    press(g, 'Escape');
    const h = SG.hashWorld(g.session.world);
    ticks(g, 200);
    eq(SG.hashWorld(g.session.world), h, 'AI frozen while paused');
  });

  test('controller: in 1P modes P1 can also use the arrow keys', () => {
    const { g } = make();
    g.settings.setup.mode = 'cpu';
    g.startMatch(1);
    ticks(g, C.COUNTDOWN_TICKS + 1);
    const x = g.session.world.players[0].x;
    g.keyDown('ArrowRight', false);
    ticks(g, 5);
    g.keyUp('ArrowRight');
    eq(g.session.world.players[0].x, x + 20);
  });

  test('controller: practice is endless with a dummy by default', () => {
    const { g } = make();
    g.settings.setup.mode = 'practice';
    g.startMatch(1);
    eq(g.session.world.opts.winScore, 0);
    eq(g.session.ai.level, 0);
    g.settings.setup.practiceOpp = 'human';
    g.startMatch(1);
    eq(g.session.ai, null);
  });

  test('controller: stage selection wraps and starts on the chosen stage', () => {
    const { g } = make();
    press(g, 'Enter'); press(g, 'Enter'); press(g, 'Enter');
    eq(g.top(), 'stage');
    press(g, 'ArrowLeft');
    eq(SG.STAGES[g.stageIndex].id, SG.STAGES[SG.STAGES.length - 1].id);
    press(g, 'ArrowRight'); press(g, 'ArrowRight');
    press(g, 'Enter');
    eq(g.session.world.stage.id, SG.STAGES[1].id);
  });

  test('controller: settings persist and corrupt storage falls back to defaults', () => {
    const { g, saved } = make();
    press(g, 'Enter');
    g.cursor.main = mainIndex(g, 'settings');
    press(g, 'Enter');
    eq(g.top(), 'settings');
    press(g, 'ArrowLeft'); // music volume -1
    eq(saved().musicVol, 5);
    const again = make(saved()).g;
    eq(again.settings.musicVol, 5);
    const bad = make({ musicVol: 99, scale: 'huge', keys: { p1: { left: 'KeyD', right: 'KeyD', jump: 'KeyW' } }, setup: { winScore: -3, stageId: 'nope' } }).g;
    eq(bad.settings.musicVol, 6);
    eq(bad.settings.scale, 'fit');
    eq(bad.settings.keys.p1.left, 'KeyA', 'duplicate keys rejected');
    eq(bad.settings.setup.winScore, 5);
    eq(bad.settings.setup.stageId, 'meadow');
    eq(make('garbage').g.settings.sfxVol, 8);
  });

  test('controller: key remapping swaps conflicts, Esc cancels, F1 reserved', () => {
    const { g } = make();
    press(g, 'Enter');
    g.cursor.main = mainIndex(g, 'settings'); press(g, 'Enter');
    g.cursor.settings = g.menuItems().findIndex((i) => i.id === 'controls');
    press(g, 'Enter');
    eq(g.top(), 'controls');
    g.cursor.controls = 2; // P1 jump
    press(g, 'Enter');
    assert(g.capture, 'capturing');
    press(g, 'Space');
    eq(g.settings.keys.p1.jump, 'Space');
    press(g, 'Enter'); // capture again
    press(g, 'ArrowUp'); // already P2 jump → swap
    eq(g.settings.keys.p1.jump, 'ArrowUp');
    eq(g.settings.keys.p2.jump, 'Space');
    press(g, 'Enter');
    press(g, 'Escape');
    eq(g.settings.keys.p1.jump, 'ArrowUp', 'cancel keeps binding');
    eq(g.top(), 'controls', 'Esc during capture does not leave the screen');
    press(g, 'Enter');
    press(g, 'F1');
    eq(g.settings.keys.p1.jump, 'ArrowUp', 'F1 reserved');
  });

  test('controller: F1 debug toggle works everywhere and does not affect the sim', () => {
    const run = (debug) => {
      const { g } = make();
      g.startMatch(1);
      if (debug) press(g, 'F1');
      for (let i = 0; i < 400; i++) {
        if (i === 200) g.keyDown('KeyD', false);
        if (i === 260) g.keyDown('KeyW', false);
        g.tick();
      }
      return SG.hashWorld(g.session.world) + g.debug;
    };
    eq(run(false).replace('false', ''), run(true).replace('true', ''));
  });

  test('controller: Escape on main returns to title; back navigation works', () => {
    const { g } = make();
    press(g, 'Enter');
    press(g, 'Escape');
    eq(g.top(), 'title');
    press(g, 'Enter');
    g.cursor.main = mainIndex(g, 'howto'); press(g, 'Enter');
    eq(g.top(), 'howto');
    press(g, 'ArrowRight'); press(g, 'ArrowRight'); press(g, 'ArrowRight');
    eq(g.howPage, 2);
    press(g, 'Escape');
    eq(g.top(), 'main');
    g.cursor.main = mainIndex(g, 'credits'); press(g, 'Enter');
    eq(g.top(), 'credits');
    press(g, 'Enter');
    eq(g.top(), 'main');
  });

  test('controller: every menu item on every screen is actionable', () => {
    const { g } = make();
    const screens = ['main', 'setup', 'settings', 'controls', 'pause', 'results'];
    for (const mode of ['versus', 'cpu', 'practice']) {
      g.settings.setup.mode = mode;
      for (const s of screens) {
        g.stack = s === 'pause' || s === 'results' ? ['play', s] : ['main', s];
        for (const it of g.menuItems()) {
          assert(typeof it.label() === 'string' && it.label().length > 0, s + ' label');
          assert(it.ok || it.adjust, s + '/' + it.id + ' does something');
        }
      }
    }
  });

  test('i18n: every English key exists in Japanese', () => {
    const en = SG.STRINGS.en;
    const ja = SG.STRINGS.ja;
    for (const k in en) assert(k in ja, 'missing ja.' + k);
    eq(en.howPages.length, ja.howPages.length);
  });
};
