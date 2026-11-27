// net.js — network protocol shared by the browser client and the Node server (DOM-free).
//
// Netcode model ("server-clocked input relay"):
//   * Each device sends its own player's input (held buttons + a jump-press counter) to the server.
//   * The server owns the 60 Hz clock. Every tick it takes the latest input of both players, steps its
//     own copy of the deterministic simulation, and broadcasts that tick's two inputs to both devices.
//   * Both devices run the same simulation from the same input stream, so they show the same match.
//     Every HASH_EVERY ticks the server attaches a state fingerprint; a device that disagrees asks for
//     the full state (resync).
//   * Both players' inputs go through the same server hop, so neither side gets a latency advantage
//     from hosting.
(function (root) {
  'use strict';
  const SG = root.SG;

  SG.NET = Object.freeze({
    PROTOCOL: 1,
    HASH_EVERY: 60, // ticks between state fingerprints
    CODE_LEN: 4, // room codes are 4 digits
    START_BUFFER: 2, // frames a device collects before it starts playing them
    CATCH_UP: 6, // above this many queued frames, play 2 per tick
    FAST_FORWARD: 20, // above this many, jump to the newest frames
    PING_EVERY: 120, // ticks between latency measurements
    POST_MATCH_TICKS: 90, // the server keeps ticking this long after matchEnd (results animations)
  });

  const BIT_LEFT = 1;
  const BIT_RIGHT = 2;
  const BIT_HELD = 4;
  const BIT_PRESSED = 8;

  // Held buttons → bits (what a device sends).
  SG.packHeld = function (inp) {
    return (inp.left ? BIT_LEFT : 0) | (inp.right ? BIT_RIGHT : 0) | (inp.jumpHeld ? BIT_HELD : 0);
  };
  // One player's input for one tick → bits (what the server broadcasts).
  SG.packInput = function (inp) {
    return SG.packHeld(inp) | (inp.jumpPressed ? BIT_PRESSED : 0);
  };
  SG.unpackInput = function (bits) {
    return {
      left: (bits & BIT_LEFT) !== 0,
      right: (bits & BIT_RIGHT) !== 0,
      jumpHeld: (bits & BIT_HELD) !== 0,
      jumpPressed: (bits & BIT_PRESSED) !== 0,
    };
  };

  SG.validRoomCode = function (code) {
    return typeof code === 'string' && /^[0-9]{4}$/.test(code);
  };

  // The server only accepts these rules (same choices as the local match setup).
  SG.sanitizeOnlineOpts = function (o) {
    o = o && typeof o === 'object' ? o : {};
    const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
    return {
      stageId: SG.STAGES.some((s) => s.id === o.stageId) ? o.stageId : 'meadow',
      mode: 'online',
      winScore: int(o.winScore, 1, 10, 5),
      bestOf: [1, 3, 5].includes(o.bestOf) ? o.bestOf : 1,
      timeLimit: [0, 60, 90, 120].includes(o.timeLimit) ? o.timeLimit : 0,
      cpuLevel: null,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
