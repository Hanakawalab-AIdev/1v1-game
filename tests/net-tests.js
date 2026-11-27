// Multi-device tests: WebSocket framing, online rooms + netcode (two game clients talking to the
// real room logic over a simulated network with latency), gamepad and touch input.
'use strict';
const path = require('path');
const childProcess = require('child_process');

module.exports = function (SG, { test, assert, eq }) {
  const C = SG.C;
  const ws = require(path.join(__dirname, '..', 'server', 'ws.js'));
  const { Rooms } = require(path.join(__dirname, '..', 'server', 'rooms.js'));

  // ------------------------------------------------------------ simulated network
  function makeNet(latencyMs) {
    const net = { now: 0, latency: latencyMs === undefined ? 20 : latencyMs, inflight: [], seq: 0 };
    const rng = SG.makeRng(1234);
    net.rooms = new Rooms({ random: rng, ips: ['192.168.0.10'], port: 8123 });
    const later = (delay, fn) => net.inflight.push({ at: net.now + delay, seq: net.seq++, fn });
    const copy = (o) => JSON.parse(JSON.stringify(o)); // everything crosses the wire as JSON
    net.connect = (onMessage, onClose) => {
      let open = true;
      const transport = {
        send: (obj) => { const m = copy(obj); later(net.latency, () => open && onMessage(m)); },
        close: () => { if (open) { open = false; later(0, onClose); } },
      };
      const client = net.rooms.connect(transport);
      return {
        send: (obj) => { const m = copy(obj); later(net.latency, () => net.rooms.message(client, m, net.now)); },
        close: () => { if (open) { open = false; later(net.latency, () => net.rooms.disconnect(client)); } },
        client,
      };
    };
    net.advance = (ms) => {
      net.now += ms;
      net.rooms.update(net.now);
      for (;;) {
        net.inflight.sort((a, b) => a.at - b.at || a.seq - b.seq);
        if (!net.inflight.length || net.inflight[0].at > net.now) break;
        net.inflight.shift().fn();
      }
    };
    return net;
  }

  function makeGame(net) {
    const log = [];
    const g = new SG.Game({
      load: () => null,
      sfx: (n) => log.push(n),
      netConnect: net ? net.connect : null,
      now: () => (net ? net.now : 0),
      shareUrls: (code, ips, port) => ips.map((ip) => `http://${ip}:${port}/?room=${code}`),
      seed: () => 7,
    });
    return { g, log };
  }
  const press = (g, code) => { g.keyDown(code, false); g.keyUp(code); };
  const mainIndex = (g, id) => g.menuItems().findIndex((it) => it.id === id);
  // Advance the network and both devices by n ticks (each device runs its own 60 Hz loop).
  const run = (net, games, n) => {
    for (let i = 0; i < n; i++) {
      net.advance(C.TICK_MS);
      for (const g of games) g.tick();
    }
  };

  function hostRoom(net, setup) {
    const { g, log } = makeGame(net);
    Object.assign(g.settings.setup, setup || {});
    press(g, 'Enter'); // title → main
    g.cursor.main = mainIndex(g, 'online');
    press(g, 'Enter');
    eq(g.top(), 'online');
    press(g, 'Enter'); // Create Room → setup
    eq(g.top(), 'setup');
    eq(g.settings.setup.mode, 'online');
    press(g, 'Enter'); // Choose stage
    eq(g.top(), 'stage');
    press(g, 'Enter'); // create
    eq(g.top(), 'lobby');
    for (let i = 0; i < 60 && g.net.phase !== 'lobby'; i++) run(net, [g], 1);
    eq(g.net.phase, 'lobby');
    assert(SG.validRoomCode(g.net.code), 'room code ' + g.net.code);
    return { g, log };
  }
  function joinRoom(net, code) {
    const { g, log } = makeGame(net);
    press(g, 'Enter');
    g.cursor.main = mainIndex(g, 'online');
    press(g, 'Enter');
    g.cursor.online = 1; // Join Room
    press(g, 'Enter');
    eq(g.top(), 'join');
    for (const ch of code) press(g, 'Digit' + ch);
    eq(g.joinCode, code);
    press(g, 'Enter');
    eq(g.top(), 'lobby');
    return { g, log };
  }
  function onlinePair(latency, setup) {
    const net = makeNet(latency);
    const A = hostRoom(net, setup);
    const B = joinRoom(net, A.g.net.code);
    for (let i = 0; i < 60 && !(A.g.top() === 'play' && B.g.top() === 'play'); i++) run(net, [A.g, B.g], 1);
    return { net, A: A.g, B: B.g, room: net.rooms.rooms.get(A.g.net.code) };
  }
  // Pause the match on the server and let both devices drain their buffers → all three in lockstep.
  function settle(p) {
    p.A.keyDown('Escape', false);
    p.A.keyUp('Escape');
    run(p.net, [p.A, p.B], 30);
  }

  // ------------------------------------------------------------ websocket framing
  test('ws: frames round-trip (masked client frames, 16-bit lengths, partial data)', () => {
    const mask = (payload) => {
      const f = ws.encodeFrame(0x1, payload);
      const hl = f.length - payload.length;
      const key = Buffer.from([1, 2, 3, 4]);
      const head = Buffer.from(f.subarray(0, hl));
      head[1] |= 0x80;
      const body = Buffer.from(payload).map((b, i) => b ^ key[i & 3]);
      return Buffer.concat([head, key, body]);
    };
    for (const len of [0, 5, 125, 126, 300, 9000]) {
      const p = Buffer.alloc(len, 97);
      const d = ws.decodeFrame(mask(p));
      assert(d && d.fin && d.opcode === 1 && d.masked, 'decoded ' + len);
      eq(d.payload.toString(), p.toString(), 'payload ' + len);
    }
    const full = mask(Buffer.from('{"t":"in"}'));
    eq(ws.decodeFrame(full.subarray(0, full.length - 1)), null, 'incomplete frame waits');
    let threw = false;
    try { ws.decodeFrame(mask(Buffer.alloc(ws.MAX_MESSAGE + 1))); } catch (e) { threw = true; }
    assert(threw, 'oversized frame rejected');
    eq(ws.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=', 'RFC 6455 accept key');
  });

  test('net: input packing round-trips and online rules are sanitized', () => {
    for (let b = 0; b < 16; b++) eq(SG.packInput(SG.unpackInput(b)), b);
    const o = SG.sanitizeOnlineOpts({ stageId: 'nope', winScore: 99, bestOf: 4, timeLimit: 61, cpuLevel: 5 });
    eq(JSON.stringify(o), JSON.stringify({ stageId: 'meadow', mode: 'online', winScore: 5, bestOf: 1, timeLimit: 0, cpuLevel: null }));
    assert(SG.validRoomCode('0042') && !SG.validRoomCode('42') && !SG.validRoomCode('12a4') && !SG.validRoomCode(1234), 'codes');
  });

  // ------------------------------------------------------------ rooms + netcode
  test('online: host creates a room, guest joins by code, both start the same match', () => {
    const p = onlinePair(20, { winScore: 3, bestOf: 3, timer: 60 });
    eq(p.A.top(), 'play');
    eq(p.B.top(), 'play');
    eq(p.A.session.online.slot, 0);
    eq(p.B.session.online.slot, 1);
    eq(p.B.session.world.opts.winScore, 3, 'host rules reach the guest');
    eq(p.B.session.world.opts.bestOf, 3);
    eq(p.B.session.world.opts.timeLimit, 60);
    eq(p.A.net.urls[0], `http://192.168.0.10:8123/?room=${p.A.net.code}`, 'share link');
  });

  test('online: both devices and the server stay in lockstep while both players move', () => {
    const p = onlinePair(35);
    run(p.net, [p.A, p.B], C.COUNTDOWN_TICKS + 10);
    // P1 runs right and jumps on device A; P2 runs left on device B using its arrow keys
    p.A.keyDown('KeyD', false);
    p.B.keyDown('ArrowLeft', false);
    run(p.net, [p.A, p.B], 20);
    p.A.keyDown('KeyW', false);
    run(p.net, [p.A, p.B], 12);
    p.A.keyUp('KeyW');
    run(p.net, [p.A, p.B], 200);
    p.A.keyUp('KeyD');
    p.B.keyUp('ArrowLeft');
    settle(p);
    const server = SG.hashWorld(p.room.world);
    eq(p.A.session.online.n, p.room.n, 'A caught up');
    eq(p.B.session.online.n, p.room.n, 'B caught up');
    eq(SG.hashWorld(p.A.session.world), server, 'A matches server');
    eq(SG.hashWorld(p.B.session.world), server, 'B matches server');
    eq(p.A.session.online.desyncs + p.B.session.online.desyncs, 0, 'no desyncs');
    const [p1, p2] = p.room.world.players;
    assert(p1.x > p.room.world.stage.spawns[0] || p1.score + p2.score > 0, 'P1 moved (input from device A)');
    assert(p.room.world.stage.spawns[1] - p2.x > 0 || p1.score + p2.score > 0, 'P2 moved (input from device B)');
  });

  test('online: a jump press is applied exactly once, even with network delay', () => {
    const p = onlinePair(50);
    run(p.net, [p.A, p.B], C.COUNTDOWN_TICKS + 10);
    p.A.keyDown('KeyW', false);
    run(p.net, [p.A, p.B], 3);
    p.A.keyUp('KeyW');
    run(p.net, [p.A, p.B], 120);
    assert(p.room.world.players[0].onGround, 'landed again');
    // replay the frames device B received and count P1's jumps
    let jumps = 0;
    const w = SG.createWorld(p.room.opts);
    for (const f of p.B.session.online.history) {
      SG.stepWorld(w, [SG.unpackInput(f.a[0]), SG.unpackInput(f.a[1])]);
      for (const ev of w.events) if (ev.type === 'jump' && ev.who === 0) jumps++;
    }
    eq(jumps, 1, 'one jump');
  });

  test('online: either player pausing pauses both; resume continues both', () => {
    const p = onlinePair(20);
    run(p.net, [p.A, p.B], C.COUNTDOWN_TICKS + 20);
    press(p.B, 'Escape');
    run(p.net, [p.A, p.B], 10);
    eq(p.room.state, 'paused');
    eq(p.A.top(), 'pause', 'host sees pause');
    eq(p.B.top(), 'pause');
    eq(p.A.net.pausedBy, 1);
    const n = p.room.n;
    run(p.net, [p.A, p.B], 60);
    eq(p.room.n, n, 'server clock stopped');
    press(p.A, 'Enter'); // Resume
    run(p.net, [p.A, p.B], 10);
    eq(p.A.top(), 'play');
    eq(p.B.top(), 'play');
    assert(p.room.n > n, 'clock running again');
  });

  test('online: focus loss on one device pauses the match for both', () => {
    const p = onlinePair(20);
    run(p.net, [p.A, p.B], C.COUNTDOWN_TICKS + 5);
    p.A.keyDown('KeyD', false);
    run(p.net, [p.A, p.B], 5);
    eq(p.room.inputs[0].bits, 2, 'holding right');
    p.A.blur();
    run(p.net, [p.A, p.B], 10);
    eq(p.room.state, 'paused');
    eq(p.B.top(), 'pause');
    eq(p.room.inputs[0].bits, 0, 'held keys released');
  });

  test('online: a desynced device repairs itself from the server state', () => {
    const p = onlinePair(20);
    run(p.net, [p.A, p.B], C.COUNTDOWN_TICKS + 20);
    p.B.session.world.players[0].x += 33; // corrupt B's copy
    run(p.net, [p.A, p.B], SG.NET.HASH_EVERY * 2 + 20);
    assert(p.B.session.online.desyncs >= 1, 'desync detected');
    assert(p.B.session.online.resyncs >= 1, 'resynced');
    settle(p);
    eq(SG.hashWorld(p.B.session.world), SG.hashWorld(p.room.world), 'B repaired');
    eq(SG.hashWorld(p.A.session.world), SG.hashWorld(p.room.world), 'A untouched');
  });

  test('online: leaving or disconnecting returns the other player to the Online menu', () => {
    const p = onlinePair(20);
    run(p.net, [p.A, p.B], 30);
    press(p.A, 'Escape');
    run(p.net, [p.A, p.B], 10);
    p.A.cursor.pause = p.A.menuItems().findIndex((it) => it.id === 'leave');
    press(p.A, 'Enter');
    run(p.net, [p.A, p.B], 10);
    eq(p.A.stack.join('>'), 'main>online');
    eq(p.B.stack.join('>'), 'main>online');
    eq(p.B.toast && p.B.toast.text, SG.t('oppLeft'));
    eq(p.net.rooms.rooms.size, 0, 'room closed');
    eq(p.B.net, null);
    // a dropped connection (closed tab) behaves the same
    const q = onlinePair(20);
    q.A.net.conn.close();
    q.A.net = null; // the tab is gone
    run(q.net, [q.B], 10);
    eq(q.B.stack.join('>'), 'main>online');
  });

  test('online: full match to results, then rematch needs both votes', () => {
    const p = onlinePair(20, { winScore: 1 });
    run(p.net, [p.A, p.B], C.COUNTDOWN_TICKS + 5);
    // force a quick stomp on the server and both clients by giving both the same state
    const n0 = p.room.n;
    p.room.world.players[0].x = 300; p.room.world.players[0].y = 230; p.room.world.players[0].vy = 6; p.room.world.players[0].prevBottom = 270;
    p.room.world.players[1].x = 305;
    // clients learn the forced state through the resync path
    p.A.net.conn.send({ t: 'resync' });
    p.B.net.conn.send({ t: 'resync' });
    run(p.net, [p.A, p.B], C.ROUND_END_TICKS + 80);
    assert(p.room.n > n0, 'ran');
    eq(p.room.world.matchWinner, 0, 'P1 won on the server');
    eq(p.A.top(), 'results');
    eq(p.B.top(), 'results');
    eq(p.A.session.world.matchWinner, 0);
    eq(p.B.session.world.matchWinner, 0);
    run(p.net, [p.A, p.B], 40); // results input lock
    press(p.A, 'Enter'); // vote rematch
    run(p.net, [p.A, p.B], 10);
    eq(p.B.net.votes.join(), 'true,false', 'guest sees host vote');
    eq(p.A.top(), 'results', 'waits for the other player');
    press(p.B, 'Enter');
    run(p.net, [p.A, p.B], 10);
    eq(p.A.top(), 'play');
    eq(p.B.top(), 'play');
    eq(p.room.matchNo, 2);
    eq(p.B.session.world.phase, 'countdown');
  });

  test('online: wrong code, full room, no server and cancel are handled', () => {
    const net = makeNet(10);
    const J = joinRoom(net, '9999');
    run(net, [J.g], 5);
    eq(J.g.top(), 'join', 'back to code entry');
    eq(J.g.toast.text, SG.t('roomNotFound'));
    const p = onlinePair(10);
    const third = joinRoom(p.net, p.A.net.code);
    run(p.net, [third.g], 5);
    eq(third.g.toast.text, SG.t('roomFull'));
    // page opened without the server (file://): online buttons explain instead of failing
    const { g } = makeGame(null);
    press(g, 'Enter');
    g.cursor.main = mainIndex(g, 'online');
    press(g, 'Enter');
    press(g, 'Enter'); // Create Room
    eq(g.top(), 'online');
    eq(g.toast.text, SG.t('noServer'));
    // cancel from the lobby closes the room
    const net2 = makeNet(10);
    const H = hostRoom(net2);
    press(H.g, 'Escape');
    run(net2, [H.g], 5);
    eq(H.g.top(), 'stage');
    eq(net2.rooms.rooms.size, 0);
  });

  test('online: server rejects junk messages and floods', () => {
    const rooms = new Rooms({ random: SG.makeRng(5) });
    const sent = [];
    let closed = false;
    const c = rooms.connect({ send: (o) => sent.push(o), close: () => { closed = true; } });
    rooms.message(c, null, 0);
    rooms.message(c, { t: 'in', b: 99, p: -1 }, 0);
    rooms.message(c, { t: 'join', v: SG.NET.PROTOCOL, code: '12' }, 0);
    eq(sent[sent.length - 1].reason, 'notFound');
    rooms.message(c, { t: 'create', v: 999 }, 0);
    eq(sent[sent.length - 1].reason, 'version');
    for (let i = 0; i < 300; i++) rooms.message(c, { t: 'ping', c: i }, 10);
    assert(closed, 'flooding client dropped');
  });

  test('online: real server serves the game and relays a match over WebSockets', () => {
    const r = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'server-test.js')], { encoding: 'utf8', timeout: 30000 });
    if (r.status !== 0) throw new Error('server-test failed:\n' + (r.stdout || '') + (r.stderr || '') + (r.error || ''));
  });

  test('download: StompDuel.html is up to date and contains every script (works as a single file)', () => {
    const fs = require('fs');
    const { build, OUT } = require(path.join(__dirname, '..', 'tools', 'build-standalone.js'));
    const norm = (s) => s.replace(/\r\n/g, '\n');
    assert(fs.existsSync(OUT), 'StompDuel.html exists (run: node tools/build-standalone.js)');
    const built = build();
    eq(norm(fs.readFileSync(OUT, 'utf8')) === norm(built), true, 'StompDuel.html is stale: run node tools/build-standalone.js');
    assert(!/<script src=/.test(built), 'no external scripts left');
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(index.includes('window.game instanceof window.SG.Game') && index.includes('StompDuel.html'), 'index.html explains missing files instead of a blank page');
  });

  // ------------------------------------------------------------ gamepads (virtual keys from main.js)
  test('gamepad: controller 1 moves/jumps P1, controller 2 moves P2, Start pauses', () => {
    const { g } = makeGame(null);
    g.startMatch(1);
    for (let i = 0; i < C.COUNTDOWN_TICKS + 1; i++) g.tick();
    const w = g.session.world;
    const x1 = w.players[0].x;
    const x2 = w.players[1].x;
    g.keyDown('Pad0Right', false);
    g.keyDown('Pad1Left', false);
    for (let i = 0; i < 10; i++) g.tick();
    eq(w.players[0].x, x1 + 40);
    eq(w.players[1].x, x2 - 40);
    g.keyDown('Pad1A', false);
    g.tick();
    assert(w.players[1].vy < 0, 'P2 jumped with A');
    g.keyDown('Pad0Start', false);
    eq(g.top(), 'pause');
    press(g, 'Pad0A'); // Resume (first item)
    eq(g.top(), 'play');
  });

  test('gamepad: menus navigate with D-pad/A/B; either pad controls P1 vs CPU; pads are not remappable', () => {
    const { g } = makeGame(null);
    press(g, 'Pad0A'); // title → main
    eq(g.top(), 'main');
    press(g, 'Pad0Down');
    eq(g.cursor.main, 1);
    press(g, 'Pad0A'); // vs CPU → setup
    eq(g.top(), 'setup');
    press(g, 'Pad0B');
    eq(g.top(), 'main');
    g.settings.setup.mode = 'cpu';
    g.startMatch(3);
    for (let i = 0; i < C.COUNTDOWN_TICKS + 1; i++) g.tick();
    const x = g.session.world.players[0].x;
    g.keyDown('Pad1Right', false);
    for (let i = 0; i < 5; i++) g.tick();
    eq(g.session.world.players[0].x, x + 20, 'second pad controls P1 in 1P mode');
    g.quitToMenu();
    g.go('settings');
    g.go('controls');
    g.cursor.controls = 0;
    press(g, 'Enter');
    assert(g.capture, 'capturing');
    press(g, 'Pad0A');
    assert(g.capture, 'pad buttons are not bound');
    press(g, 'Pad0B');
    eq(g.capture, null, 'B cancels');
    eq(g.settings.keys.p1.left, 'KeyA');
  });

  // ------------------------------------------------------------ touch
  test('touch: layouts, hit testing, on-screen jump and pause', () => {
    const { g } = makeGame(null);
    g.startMatch(1);
    const shared = g.touchButtons();
    eq(shared.filter((b) => b.who === 0).length, 3, 'P1 cluster');
    eq(shared.filter((b) => b.who === 1).length, 3, 'P2 cluster on a shared screen');
    for (const b of shared) {
      assert(b.x - b.r >= 0 && b.x + b.r <= C.VIEW_W && b.y + b.r <= C.VIEW_H, 'on screen ' + b.code);
      eq(SG.touchHit(shared, b.x + b.r * 0.5, b.y).code, b.code, 'hit ' + b.code);
    }
    eq(SG.touchHit(shared, 400, 150), null, 'middle of the screen is not a button');
    for (let i = 0; i < C.COUNTDOWN_TICKS + 1; i++) g.tick();
    g.keyDown('Touch0Jump', false);
    g.tick();
    assert(g.session.world.players[0].vy < 0, 'touch jump');
    g.keyDown('TouchPause', false);
    eq(g.top(), 'pause');
    g.quitToMenu();
    g.settings.setup.mode = 'cpu';
    g.startMatch(1);
    const solo = g.touchButtons();
    eq(solo.filter((b) => b.who === 1).length, 0, 'one-player layout');
    // pointer adjust on setup rows
    g.quitToMenu();
    g.openSetup('versus');
    const wi = g.menuItems().findIndex((it) => it.id === 'winScore');
    g.pointerAdjust(wi, 1);
    eq(g.settings.setup.winScore, 6);
    g.pointerAdjust(wi, -1);
    eq(g.settings.setup.winScore, 5);
  });

  test('join screen: keypad works with keys, D-pad and taps', () => {
    const { g } = makeGame(makeNet(10));
    g.stack = ['main', 'online', 'join'];
    g.enterScreen();
    press(g, 'Digit1');
    press(g, 'Numpad2');
    press(g, 'Backspace');
    eq(g.joinCode, '1');
    // the keypad highlight follows the last key used ("⌫"); D-pad: up → "7", right → "8"
    eq(SG.JOIN_KEYS[g.joinCursor], 'del');
    press(g, 'Pad0Up');
    press(g, 'Pad0Right');
    press(g, 'Pad0A');
    eq(g.joinCode, '18');
    g.joinKey('0');
    g.joinKey('7');
    g.joinKey('9'); // full: ignored
    eq(g.joinCode, '1807');
    g.joinKey('ok');
    eq(g.top(), 'lobby');
    eq(g.net.intent, 'join');
  });
};
