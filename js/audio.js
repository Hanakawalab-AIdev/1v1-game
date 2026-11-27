// audio.js — fully synthesized audio (Web Audio). No audio files → nothing can go missing.
// SFX are short oscillator/noise envelopes; music is a small look-ahead step sequencer.
(function (root) {
  'use strict';
  const SG = root.SG;

  let ctx = null;
  let master, musicBus, sfxBus, musicDuck, noiseBuf;
  let vol = { music: 0.6, sfx: 0.8, mute: false };
  let ducked = false;
  let wantTrack = null;
  let track = null;
  let step = 0;
  let nextTime = 0;
  let timer = null;
  const lastPlayed = Object.create(null);
  let voices = 0;
  const MAX_VOICES = 24;

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const nm = (s) => {
    const m = /^([A-G]#?)(\d)$/.exec(s);
    return m ? 12 * (+m[2] + 1) + NOTE[m[1]] : null;
  };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (e) {
      return false;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicDuck = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(musicDuck).connect(master);
    sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    const rng = SG.makeRng(99);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
    applyVolumes();
    if (wantTrack) startTrack(wantTrack);
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const m = vol.mute ? 0 : 1;
    master.gain.setTargetAtTime(m, now, 0.02);
    musicBus.gain.setTargetAtTime(vol.music * 0.55, now, 0.05);
    sfxBus.gain.setTargetAtTime(vol.sfx * 0.9, now, 0.02);
    musicDuck.gain.setTargetAtTime(ducked ? 0.3 : 1, now, 0.1);
  }

  function voice(end) {
    voices++;
    setTimeout(() => { voices--; }, Math.max(10, (end - ctx.currentTime) * 1000 + 50));
  }

  function panNode(dest, pan) {
    if (!pan || !ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  // Tone with pitch sweep and ADSR-ish envelope.
  function tone(o) {
    const t0 = (o.at || ctx.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.1;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    const v = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(panNode(o.dest || sfxBus, o.pan));
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    voice(t0 + dur);
  }

  function noise(o) {
    const t0 = (o.at || ctx.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.freq1) f.frequency.exponentialRampToValueAtTime(o.freq1, t0 + dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol === undefined ? 0.2 : o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(panNode(o.dest || sfxBus, o.pan));
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
    voice(t0 + dur);
  }

  const panFor = (who) => (who === 0 ? -0.35 : who === 1 ? 0.35 : 0);

  // name → [minimum interval in ms (per player), play function]
  const SFX = {
    menuMove: [35, () => tone({ type: 'square', f0: 620, dur: 0.05, vol: 0.06 })],
    select: [60, () => { tone({ type: 'square', f0: 660, dur: 0.06, vol: 0.08 }); tone({ type: 'square', f0: 990, dur: 0.09, vol: 0.08, delay: 0.05 }); }],
    back: [60, () => { tone({ type: 'square', f0: 520, f1: 330, dur: 0.1, vol: 0.07 }); }],
    start: [200, () => { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.08, delay: i * 0.06 })); }],
    pause: [100, () => { tone({ type: 'triangle', f0: 880, dur: 0.08, vol: 0.15 }); tone({ type: 'triangle', f0: 660, dur: 0.12, vol: 0.15, delay: 0.07 }); }],
    resume: [100, () => { tone({ type: 'triangle', f0: 660, dur: 0.08, vol: 0.15 }); tone({ type: 'triangle', f0: 880, dur: 0.12, vol: 0.15, delay: 0.07 }); }],
    count: [300, () => { tone({ type: 'square', f0: 440, dur: 0.16, vol: 0.12 }); tone({ type: 'sine', f0: 880, dur: 0.16, vol: 0.06 }); }],
    go: [300, () => { tone({ type: 'square', f0: 880, dur: 0.35, vol: 0.12 }); tone({ type: 'square', f0: 1320, dur: 0.35, vol: 0.06 }); noise({ dur: 0.25, vol: 0.08, filter: 'highpass', freq: 3000 }); }],
    jump: [40, (o) => tone({ type: 'square', f0: 280, f1: 560, dur: 0.11, vol: 0.07, pan: panFor(o.who) })],
    land: [70, (o) => noise({ dur: 0.07 + Math.min(o.speed || 0, 14) * 0.004, vol: 0.05 + Math.min(o.speed || 0, 14) * 0.008, freq: 900, freq1: 200, pan: panFor(o.who) })],
    bump: [140, () => { tone({ type: 'triangle', f0: 160, f1: 90, dur: 0.08, vol: 0.18 }); }],
    stomp: [60, (o) => {
      const p = panFor(o.who);
      noise({ dur: 0.18, vol: 0.3, freq: 2500, freq1: 300, pan: p });
      tone({ type: 'square', f0: 220, f1: 70, dur: 0.22, vol: 0.2, pan: p });
      tone({ type: 'sine', f0: 1200, f1: 1800, dur: 0.12, vol: 0.12, delay: 0.03, pan: p });
    }],
    score: [100, (o) => { const p = panFor(o.who); tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.09, delay: 0.08, pan: p }); tone({ type: 'square', f0: 1319, dur: 0.22, vol: 0.09, delay: 0.15, pan: p }); }],
    matchPoint: [100, (o) => { const p = panFor(o.who); [988, 1319, 1568].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.09, delay: 0.08 + i * 0.07, pan: p })); }],
    respawn: [100, () => { [523, 659, 784].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.1, vol: 0.06, delay: i * 0.04 })); }],
    suddenDeath: [500, () => { for (let i = 0; i < 3; i++) tone({ type: 'sawtooth', f0: 330, f1: 660, dur: 0.18, vol: 0.08, delay: i * 0.22 }); }],
    roundWin: [300, () => { [659, 784, 988, 1319].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.14, vol: 0.09, delay: i * 0.09 })); }],
    victory: [800, () => {
      const seq = [['C5', 0, 0.12], ['E5', 0.12, 0.12], ['G5', 0.24, 0.12], ['C6', 0.36, 0.3], ['A5', 0.72, 0.12], ['B5', 0.84, 0.12], ['C6', 0.96, 0.7]];
      for (const [n, t, d] of seq) {
        tone({ type: 'square', f0: midi(nm(n)), dur: d + 0.05, vol: 0.09, delay: t });
        tone({ type: 'triangle', f0: midi(nm(n) - 12), dur: d + 0.05, vol: 0.12, delay: t });
      }
      for (const n of ['C5', 'E5', 'G5']) tone({ type: 'sine', f0: midi(nm(n)), dur: 1.0, vol: 0.06, delay: 0.96 });
      noise({ dur: 0.6, vol: 0.06, filter: 'highpass', freq: 5000, delay: 0.96 });
    }],
  };

  // ---------------------------------------------------------------- music
  // Patterns are written per 8th note: note name, '-' to hold, '.' for rest.
  const seq8 = (str) => str.trim().split(/\s+/);
  const TRACKS = {
    menu: {
      bpm: 100,
      bars: 4,
      chords: [['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4']],
      bass: ['C3', 'A2', 'F2', 'G2'],
      lead: seq8('E5 . G5 . A5 G5 E5 .  C5 . E5 . D5 C5 A4 .  A4 C5 F5 . E5 . C5 .  D5 . B4 . G4 - - .'),
      leadType: 'triangle',
      leadVol: 0.12,
      drums: false,
      hat: true,
    },
    battle: {
      bpm: 148,
      bars: 8,
      chords: [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'], ['E3', 'G#3', 'B3']],
      bass: ['A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'G2', 'E2'],
      lead: seq8(
        'A4 . C5 E5 . D5 C5 .  A4 . F4 A4 . C5 A4 .  G4 . C5 E5 . G5 E5 .  D5 . B4 G4 . B4 D5 .' +
        '  E5 . A5 . G5 E5 . C5  F5 . E5 C5 . A4 C5 .  D5 . G5 . F5 D5 B4 .  G#4 . B4 . E5 - D5 B4'
      ),
      leadType: 'square',
      leadVol: 0.07,
      drums: true,
      hat: true,
    },
  };

  function scheduleStep(tr, s, t) {
    const spb = 60 / tr.bpm / 2; // seconds per 8th
    const per = 8;
    const bar = Math.floor(s / per) % tr.bars;
    const i = s % per;
    const dest = musicBus;
    // bass: 8th-note pulse with octave jumps
    const root = nm(tr.bass[bar]);
    const bassNote = tr.drums ? (i % 4 === 2 ? root + 12 : root) : i % 4 === 0 ? root : null;
    if (bassNote !== null) tone({ at: t, type: 'triangle', f0: midi(bassNote), dur: tr.drums ? spb * 0.9 : spb * 3.5, vol: tr.drums ? 0.22 : 0.2, dest });
    // chord arpeggio (soft)
    const ch = tr.chords[bar];
    const arpNote = nm(ch[i % 3]) + (i >= 4 ? 12 : 0);
    tone({ at: t, type: 'sine', f0: midi(arpNote), dur: spb * 0.9, vol: tr.drums ? 0.035 : 0.05, dest });
    // lead
    const li = (bar * per + i) % tr.lead.length;
    const ln = tr.lead[li];
    if (ln !== '.' && ln !== '-') {
      let len = 1;
      while (tr.lead[(li + len) % tr.lead.length] === '-' && len < 8) len++;
      tone({ at: t, type: tr.leadType, f0: midi(nm(ln)), dur: spb * len * 0.92, vol: tr.leadVol, dest, attack: 0.01 });
    }
    // drums
    if (tr.drums) {
      if (i === 0 || i === 4 || (i === 5 && bar % 2 === 1)) tone({ at: t, type: 'sine', f0: 150, f1: 45, dur: 0.14, vol: 0.4, dest });
      if (i === 2 || i === 6) noise({ at: t, dur: 0.12, vol: 0.12, filter: 'bandpass', freq: 1800, q: 0.8, dest });
    }
    if (tr.hat) noise({ at: t + (tr.drums ? 0 : spb * 0.5), dur: 0.03, vol: tr.drums ? 0.05 : 0.025, filter: 'highpass', freq: 7000, dest });
  }

  function pump() {
    if (!ctx || !track) return;
    const tr = TRACKS[track];
    const spb = 60 / tr.bpm / 2;
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05; // tab was in background
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(tr, step, nextTime);
      step++;
      nextTime += spb;
    }
  }

  function startTrack(name) {
    if (!ctx) return;
    track = name;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    if (!timer) timer = setInterval(pump, 50);
    pump();
  }

  function stopTrack() {
    track = null;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (ctx) {
      // fade out whatever is already scheduled
      const now = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      musicBus.gain.linearRampToValueAtTime(0, now + 0.15);
      const old = musicBus;
      setTimeout(() => {
        // fresh bus so later tracks start clean
        try { old.disconnect(); } catch (e) { /* already gone */ }
      }, 300);
      musicBus = ctx.createGain();
      musicBus.connect(musicDuck);
      musicBus.gain.value = vol.music * 0.55;
    }
  }

  SG.Audio = {
    unlock: ensure,
    get ready() { return !!ctx && ctx.state === 'running'; },
    apply(settings) {
      vol = { music: settings.musicVol / 10, sfx: settings.sfxVol / 10, mute: settings.mute };
      applyVolumes();
    },
    duck(on) {
      ducked = !!on;
      applyVolumes();
    },
    music(name) {
      if (name === wantTrack && (track === name || !ctx)) return;
      wantTrack = name;
      if (!ctx) return;
      if (track) stopTrack();
      if (name) startTrack(name);
    },
    play(name, o) {
      if (!ctx || ctx.state !== 'running' || vol.mute || vol.sfx <= 0) return;
      const def = SFX[name];
      if (!def) return;
      const opt = o || {};
      const key = name + (opt.who === undefined ? '' : opt.who);
      const now = performance.now();
      if (lastPlayed[key] && now - lastPlayed[key] < def[0]) return; // prevent stacking
      if (voices > MAX_VOICES && name !== 'stomp' && name !== 'victory') return;
      lastPlayed[key] = now;
      def[1](opt);
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
