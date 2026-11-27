// rooms.js — online rooms and the authoritative 60 Hz match clock (see js/net.js for the model).
// Transport-agnostic: a "client" is anything with send(obj) and close(). Used by server.js and tests.
'use strict';
const path = require('path');
const JS = path.join(__dirname, '..', 'js');
for (const f of ['core.js', 'stages.js', 'sim.js', 'net.js']) require(path.join(JS, f));
const SG = globalThis.SG;
const C = SG.C;
const NET = SG.NET;

const MAX_ROOMS = 500;
const MAX_MSGS_PER_SEC = 240; // a device sends at most ~60 input updates/s plus a few control messages
const RESYNC_COOLDOWN_MS = 1000;
const LAG_RESET_MS = 250; // if the server falls this far behind, drop the backlog instead of bursting

class Rooms {
  // opts: { random: () => [0,1), ips: [], port }
  constructor(opts) {
    this.random = (opts && opts.random) || Math.random;
    this.ips = (opts && opts.ips) || [];
    this.port = (opts && opts.port) || 0;
    this.rooms = new Map();
  }

  connect(transport) {
    const client = { t: transport, room: null, slot: -1, msgs: 0, msgWindow: 0, lastResync: -Infinity, alive: true };
    this.send(client, { t: 'hello', v: NET.PROTOCOL });
    return client;
  }

  send(client, obj) {
    if (client.alive) client.t.send(obj);
  }

  newCode() {
    for (let k = 0; k < 2000; k++) {
      const code = String(Math.floor(this.random() * 10000)).padStart(4, '0');
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  message(client, msg, now) {
    if (!client.alive) return;
    // flood guard
    if (now - client.msgWindow >= 1000) { client.msgWindow = now; client.msgs = 0; }
    if (++client.msgs > MAX_MSGS_PER_SEC) return this.drop(client);
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    const room = client.room;
    switch (msg.t) {
      case 'create': {
        if (room) return;
        if (msg.v !== NET.PROTOCOL) return this.send(client, { t: 'error', reason: 'version' });
        if (this.rooms.size >= MAX_ROOMS) return this.send(client, { t: 'error', reason: 'busy' });
        const code = this.newCode();
        if (!code) return this.send(client, { t: 'error', reason: 'busy' });
        const r = {
          code, opts: SG.sanitizeOnlineOpts(msg.opts), clients: [client, null], state: 'lobby',
          world: null, n: 0, due: 0, inputs: null, votes: [false, false], pausedBy: -1, matchNo: 0, postTicks: 0,
        };
        this.rooms.set(code, r);
        client.room = r;
        client.slot = 0;
        this.send(client, { t: 'created', code, opts: r.opts, ips: this.ips, port: this.port });
        return;
      }
      case 'join': {
        if (room) return;
        if (msg.v !== NET.PROTOCOL) return this.send(client, { t: 'error', reason: 'version' });
        if (!SG.validRoomCode(msg.code)) return this.send(client, { t: 'error', reason: 'notFound' });
        const r = this.rooms.get(msg.code);
        if (!r) return this.send(client, { t: 'error', reason: 'notFound' });
        if (r.clients[1] || r.state !== 'lobby') return this.send(client, { t: 'error', reason: 'full' });
        r.clients[1] = client;
        client.room = r;
        client.slot = 1;
        this.startMatch(r, now);
        return;
      }
      case 'in': {
        if (!room || !room.inputs) return;
        const b = msg.b;
        const p = msg.p;
        if (!Number.isInteger(b) || b < 0 || b > 7 || !Number.isInteger(p) || p < 0) return;
        const inp = room.inputs[client.slot];
        inp.bits = b;
        if (p > inp.press) inp.press = p; // press counter only moves forward
        return;
      }
      case 'pause':
        if (room && room.state === 'playing' && room.world.phase !== 'matchEnd') {
          room.state = 'paused';
          room.pausedBy = client.slot;
          this.flushFrames(room);
          this.broadcast(room, { t: 'paused', by: client.slot, n: room.n });
        }
        return;
      case 'resume':
        if (room && room.state === 'paused') {
          room.state = 'playing';
          room.pausedBy = -1;
          room.due = now;
          this.broadcast(room, { t: 'resumed', n: room.n });
        }
        return;
      case 'rematch':
        if (room && room.world && room.world.phase === 'matchEnd') {
          room.votes[client.slot] = true;
          this.broadcast(room, { t: 'votes', votes: room.votes.slice() });
          if (room.votes[0] && room.votes[1]) this.startMatch(room, now);
        }
        return;
      case 'resync':
        if (room && room.world && now - client.lastResync >= RESYNC_COOLDOWN_MS) {
          client.lastResync = now;
          this.send(client, { t: 'state', n: room.n, w: room.world });
        }
        return;
      case 'ping':
        if (typeof msg.c === 'number') this.send(client, { t: 'pong', c: msg.c });
        return;
      case 'leave':
        this.leave(client);
        return;
      default:
        return;
    }
  }

  startMatch(r, now) {
    r.matchNo++;
    r.world = SG.createWorld(r.opts);
    r.world.events = [];
    r.n = 0;
    r.state = 'playing';
    r.due = now;
    r.votes = [false, false];
    r.pausedBy = -1;
    r.postTicks = 0;
    r.pending = [];
    r.hashes = [];
    // Keep press counters monotonic across matches: only presses after the start count.
    const prev = r.inputs;
    r.inputs = [0, 1].map((i) => {
      const press = prev ? prev[i].press : 0;
      return { bits: 0, press, used: press };
    });
    r.clients.forEach((c, i) => this.send(c, { t: 'start', opts: r.opts, you: i, match: r.matchNo, code: r.code }));
  }

  stepRoom(r) {
    const inputs = r.inputs.map((inp) => {
      const pressed = inp.press > inp.used;
      inp.used = inp.press;
      return {
        left: (inp.bits & 1) !== 0,
        right: (inp.bits & 2) !== 0,
        jumpHeld: (inp.bits & 4) !== 0,
        jumpPressed: pressed,
      };
    });
    SG.stepWorld(r.world, inputs);
    r.world.events = []; // presentation-only; never sent
    r.n++;
    r.pending.push([SG.packInput(inputs[0]), SG.packInput(inputs[1])]);
    if (r.n % NET.HASH_EVERY === 0) r.hashes.push([r.n, SG.hashWorld(r.world)]);
    if (r.world.phase === 'matchEnd' && ++r.postTicks >= NET.POST_MATCH_TICKS) r.state = 'over';
  }

  flushFrames(r) {
    if (!r.pending || !r.pending.length) return;
    const msg = { t: 'f', n: r.n - r.pending.length + 1, a: r.pending };
    if (r.hashes.length) msg.h = r.hashes;
    r.pending = [];
    r.hashes = [];
    this.broadcast(r, msg);
  }

  // Advance every running room to wall-clock time `now` (ms). Call often (every few ms).
  update(now) {
    for (const r of this.rooms.values()) {
      if (r.state !== 'playing') continue;
      if (now - r.due > LAG_RESET_MS) r.due = now; // server was stalled: don't burst-simulate
      while (r.state === 'playing' && r.due <= now) {
        this.stepRoom(r);
        r.due += C.TICK_MS;
      }
      this.flushFrames(r);
    }
  }

  broadcast(r, obj) {
    for (const c of r.clients) if (c) this.send(c, obj);
  }

  leave(client) {
    const r = client.room;
    if (!r) return;
    client.room = null;
    client.slot = -1;
    for (const c of r.clients) {
      if (c && c !== client) {
        c.room = null;
        c.slot = -1;
        this.send(c, { t: 'left' });
      }
    }
    this.rooms.delete(r.code);
  }

  disconnect(client) {
    this.leave(client);
    client.alive = false;
  }

  drop(client) {
    this.disconnect(client);
    try { client.t.close(); } catch (e) { /* ignore */ }
  }
}

module.exports = { Rooms, SG };
