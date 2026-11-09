/* Still Employed: music and sound effects. Everything is generated here: no audio files, no downloads.
   The teacher's brief: background music and sound effects, "not overly cheesy." So there are no beeps, dings,
   buzzers, fanfares, coins, or applause. The effects are office objects: a rubber stamp, paper, a pen, an adding
   machine, knuckles on a desk, a door. The music is a quiet lo-fi study beat on a soft felt piano. It never speeds up.

   Score    writes the music one bar at a time. Pure and seeded, so tests can read it.
   Dsp      renders the piano, bass, drums, and office sounds into plain arrays. Pure, so tests can measure it.
   Engine   plays both through Web Audio, on a live context or an offline one (tools/render_audio.py).
   Live     owns the real AudioContext: browsers allow it only after a tap, and it sleeps when the tab is hidden. */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rngOf(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= Score: the notes ================= */
  const Score = (function () {
    const BPM = 72;
    const HOME_PC = 5; // F
    const LIFT = [0, 2, 4, 5, 7, 9]; // each promotion lifts the key: F, G, A, Bb, C, D
    const keyPc = (level) => (HOME_PC + LIFT[clamp(level | 0, 0, LIFT.length - 1)]) % 12;
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    const PENTA = [0, 2, 4, 7, 9];

    // Chords as semitones above the tonic. The root goes to the bass, so the piano plays color tones only.
    const CHORDS = {
      I: { root: 0, tones: [4, 7, 11, 2] }, // Fmaj9
      iii: { root: 4, tones: [7, 11, 2, 9] }, // Am7 with an 11th
      IV: { root: 5, tones: [9, 0, 4, 7] }, // Bbmaj9
      IVl: { root: 5, tones: [9, 11, 4, 7] }, // Bbmaj9 with a raised 11th
      Vs: { root: 7, tones: [5, 9, 0, 2] }, // C9sus: never resolves hard, which keeps it from sounding like a jingle
      vi: { root: 9, tones: [0, 4, 7, 11] }, // Dm9
      ii: { root: 2, tones: [5, 9, 0, 4] }, // Gm9
      bVII: { root: 10, tones: [2, 5, 9, 0] }, // Ebmaj9: the one note outside the key, for the Release
      IIIs: { root: 4, tones: [2, 5, 9, 11] }, // Asus with a flat 9: unresolved on purpose
    };
    const PROGS = [
      ['I', 'iii', 'IV', 'Vs'],
      ['vi', 'ii', 'IV', 'Vs'],
      ['IV', 'iii', 'ii', 'Vs'],
      ['vi', 'iii', 'IV', 'I'],
      ['IVl', 'I', 'ii', 'vi'],
      ['I', 'vi', 'IVl', 'Vs'],
    ];
    const RELEASE = [
      ['vi', 'ii', 'bVII', 'IIIs'],
      ['vi', 'bVII', 'vi', 'IIIs'],
      ['ii', 'vi', 'bVII', 'IIIs'],
    ];

    // Piano patterns. p is the position in sixteenths, part is which notes of the chord, hold is in beats.
    const SPARSE = [
      [{ p: 0, part: 'all', v: 0.9, hold: 3.6 }],
      [{ p: 0, part: 'all', v: 0.9, hold: 2.3 }, { p: 10, part: 'high', v: 0.6, hold: 1.5 }],
      [{ p: 2, part: 'all', v: 0.85, hold: 3.2 }],
      [{ p: 0, part: 'low', v: 0.85, hold: 3.2 }, { p: 3, part: 'high', v: 0.65, hold: 2.8 }],
      [{ p: 0, part: 'all', v: 0.85, hold: 2.8 }, { p: 14, part: 'next', v: 0.55, hold: 1 }],
    ];
    const BROKEN = [
      [{ p: 0, part: 'low', v: 0.85, hold: 3.6 }, { p: 4, part: 'mid', v: 0.6, hold: 2.6 }, { p: 6, part: 'top', v: 0.55, hold: 2.2 }, { p: 11, part: 'mid', v: 0.5, hold: 1.2 }],
      [{ p: 0, part: 'all', v: 0.85, hold: 1.8 }, { p: 6, part: 'high', v: 0.55, hold: 1.3 }, { p: 10, part: 'low', v: 0.55, hold: 1.3 }, { p: 14, part: 'next', v: 0.5, hold: 1 }],
      [{ p: 0, part: 'low', v: 0.85, hold: 3 }, { p: 3, part: 'top', v: 0.5, hold: 1.6 }, { p: 8, part: 'mid', v: 0.6, hold: 2 }, { p: 13, part: 'top', v: 0.45, hold: 0.9 }],
    ];
    // Bass patterns: [position, hold, which note, volume]
    const BASS = [
      [[0, 3.2, 'root', 0.8]],
      [[0, 2.2, 'root', 0.8], [10, 1.2, 'root', 0.55]],
      [[0, 1.3, 'root', 0.8], [6, 0.5, 'fifth', 0.5], [10, 1.1, 'root', 0.6]],
      [[0, 1.3, 'root', 0.8], [10, 0.9, 'root', 0.55], [14, 0.4, 'walk', 0.5]],
    ];
    const BASS_BY_LEVEL = [[0], [0, 1], [1, 2], [1, 2], [1, 2, 3], [1, 2, 3]];
    const KICKS = [[0, 10], [0, 7, 10], [0, 11], [0, 6, 10]];
    const CELLS = [[2, 5], [2, 3, 6], [6, 8, 11], [9, 11, 14], [1, 4, 6, 9]];

    function voiceChord(pcs, prev) {
      const low = 52, high = 77;
      const options = pcs.map((pc) => { const list = []; for (let m = low; m <= high; m++) if (m % 12 === pc) list.push(m); return list; });
      let best = null, bestCost = Infinity;
      const walk = (i, chosen) => {
        if (i === options.length) {
          const v = chosen.slice().sort((a, b) => a - b);
          for (let j = 1; j < v.length; j++) {
            const gap = v[j] - v[j - 1];
            if (gap < 2) return;
            if (v[j - 1] < 57 && gap < 3) return; // close intervals turn to mud down low
          }
          if (v[v.length - 1] - v[0] > 17) return;
          const center = v.reduce((a, b) => a + b, 0) / v.length;
          let cost = Math.abs(center - 64) * 0.7;
          if (prev) for (let j = 0; j < v.length; j++) cost += Math.abs(v[j] - prev[j]);
          if (cost < bestCost) { bestCost = cost; best = v; }
          return;
        }
        for (const m of options[i]) { chosen.push(m); walk(i + 1, chosen); chosen.pop(); }
      };
      walk(0, []);
      return best;
    }

    function create(seed) {
      const r = rngOf(seed == null ? 1 : seed);
      const ri = (n) => Math.floor(r() * n);
      const pick = (list) => list[ri(list.length)];
      let scene = 'calm', level = 0, tonic = keyPc(0), queue = [], lastVoicing = null, index = 0, lastProg = -1;

      const swing = (p) => p / 4 + (p % 2 ? 0.045 : 0);
      const loose = (beat, amount) => clamp(beat + r() * amount, 0, 3.97);

      function plan() {
        const pool = scene === 'release' ? RELEASE : PROGS;
        let i = ri(pool.length);
        if (i === lastProg) i = (i + 1) % pool.length;
        lastProg = i;
        const prog = pool[i];
        const seq = scene === 'calm' ? [prog[0], prog[0], prog[1], prog[1], prog[2], prog[2], prog[3], prog[3]] : prog.concat(prog);
        if (scene === 'work' && r() < 0.4) { const turn = pick(PROGS); seq[6] = turn[2]; seq[7] = turn[3]; }
        seq.forEach((name, j) => {
          const chord = CHORDS[name];
          const pcs = chord.tones.map((x) => (x + tonic) % 12);
          const voicing = voiceChord(pcs, lastVoicing);
          lastVoicing = voicing;
          queue.push({ name, root: (chord.root + tonic) % 12, pcs, voicing, sectionBar: j, scene, level, tonic, first: j === 0 || seq[j - 1] !== name });
        });
      }

      const bassNote = (pc) => 36 + ((pc - 0 + 12) % 12);
      function walkTo(nextRoot) {
        const target = bassNote(nextRoot);
        for (let d = 1; d <= 3; d++) if (MAJOR.includes(((target - d - tonic) % 12 + 12) % 12)) return target - d;
        return target;
      }

      function partOf(part, bar, next) {
        const v = bar.voicing;
        switch (part) {
          case 'all': return v.slice();
          case 'low': return [v[0], v[1]];
          case 'mid': return [v[1], v[2]];
          case 'high': return [v[2], v[3]];
          case 'top': return [v[3]];
          case 'next': return next ? [next.voicing[2], next.voicing[3]] : [v[2], v[3]];
          default: return [];
        }
      }

      function addPiano(events, bar, next, step, base) {
        const notes = partOf(step.part, bar, next);
        const at = swing(step.p);
        const rolled = notes.length > 2;
        const gap = rolled ? (bar.scene === 'calm' ? 0.05 + r() * 0.04 : 0.02 + r() * 0.015) : 0.008 + r() * 0.012;
        const order = rolled && r() < 0.2 ? notes.slice().reverse() : notes;
        const vel = clamp(base * step.v + (r() - 0.5) * 0.05, 0.08, 0.9);
        order.forEach((midi, j) => {
          events.push({ inst: 'piano', midi, beat: loose(at + j * gap, 0.014), dur: step.hold, vel: clamp(vel - j * 0.012, 0.08, 0.9) });
        });
      }

      function composeCalm(bar, next, events) {
        if (bar.first) {
          addPiano(events, bar, next, { p: 0, part: 'all', v: 1, hold: 7 }, 0.48 + r() * 0.07);
          if (r() < 0.6) events.push({ inst: 'bass', midi: bassNote(bar.root), beat: 0, dur: 6, vel: 0.36 });
          return;
        }
        const roll = r();
        if (roll < 0.3) return;
        if (roll < 0.65) addPiano(events, bar, next, { p: 8, part: 'top', v: 1, hold: 3.4 }, 0.34 + r() * 0.06);
        else {
          addPiano(events, bar, next, { p: 4, part: 'mid', v: 1, hold: 3.6 }, 0.32 + r() * 0.05);
          addPiano(events, bar, next, { p: 10, part: 'top', v: 1, hold: 2.6 }, 0.32 + r() * 0.05);
        }
      }

      function composeRelease(bar, next, events) {
        addPiano(events, bar, next, { p: 0, part: 'all', v: 1, hold: 3.7 }, 0.46 + r() * 0.05);
        [2, 6, 10, 14].forEach((p) => {
          if (r() < 0.85) events.push({ inst: 'piano', midi: bar.voicing[3], beat: loose(swing(p), 0.01), dur: 0.5, vel: 0.17 + r() * 0.05 });
        });
        events.push({ inst: 'bass', midi: bassNote(bar.root), beat: 0, dur: 3, vel: 0.72 });
        if (r() < 0.5) events.push({ inst: 'bass', midi: bassNote(bar.root), beat: swing(10), dur: 1, vel: 0.46 });
        events.push({ inst: 'kick', beat: 0, vel: 0.38 });
        [0, 4, 8, 12].forEach((p) => events.push({ inst: 'hat', beat: loose(swing(p), 0.008), vel: 0.34 + r() * 0.08 }));
      }

      function composeWork(bar, next, events) {
        const lv = bar.level;
        const base = 0.5 + lv * 0.012 + r() * 0.05;
        const brokenOdds = lv >= 4 ? 0.5 : lv >= 2 ? 0.3 : 0;
        const broken = r() < brokenOdds;
        const pattern = broken ? pick(BROKEN) : pick(SPARSE);
        pattern.forEach((step) => addPiano(events, bar, next, step, base));

        const nextRoot = next ? next.root : bar.root;
        BASS[pick(BASS_BY_LEVEL[lv])].forEach(([p, hold, which, v]) => {
          let midi = bassNote(bar.root);
          if (which === 'fifth') { midi += 7; if (midi > 50) midi -= 12; }
          if (which === 'walk') midi = walkTo(nextRoot);
          events.push({ inst: 'bass', midi, beat: loose(swing(p), 0.012), dur: hold, vel: clamp(v * (0.92 + r() * 0.12), 0.1, 0.9) });
        });

        if (lv >= 1) {
          const breath = lv >= 2 && bar.sectionBar === 7 && r() < 0.3;
          const kicks = breath ? [0] : lv === 1 ? [0, 10] : pick(KICKS.slice(0, lv >= 4 ? 4 : 3));
          kicks.forEach((p, j) => events.push({ inst: 'kick', beat: loose(swing(p), 0.008), vel: clamp((j ? 0.42 : 0.56) + r() * 0.08 + lv * 0.01, 0.1, 0.8) }));
          for (let p = 0; p < 16; p += 2) {
            const off = p % 4 === 2;
            if (lv === 1 && !off) continue;
            if (r() < 0.1) continue;
            events.push({ inst: 'hat', beat: loose(swing(p), 0.008), vel: (off ? 0.5 : 0.32) + r() * 0.1 });
          }
          if (lv >= 4) [7, 15].forEach((p) => { if (r() < 0.45) events.push({ inst: 'hat', beat: loose(swing(p), 0.006), vel: 0.22 + r() * 0.06 }); });
        }
        if (lv === 2) [4, 12].forEach((p) => events.push({ inst: 'rim', beat: loose(swing(p) + 0.012, 0.01), vel: 0.48 + r() * 0.1 }));
        if (lv >= 3 && !(bar.sectionBar === 7 && r() < 0.25)) {
          [4, 12].forEach((p) => events.push({ inst: 'snare', beat: loose(swing(p) + 0.014, 0.01), vel: 0.52 + r() * 0.1 }));
          if (r() < 0.22) events.push({ inst: 'snare', beat: loose(swing(15), 0.006), vel: 0.16 + r() * 0.06 });
        }

        if (lv >= 3 && !broken) {
          const odds = bar.sectionBar === 1 || bar.sectionBar === 5 ? 0.55 : bar.sectionBar === 3 || bar.sectionBar === 7 ? 0.18 : 0;
          if (r() < odds) {
            const pool = [];
            for (let m = 69; m <= 84; m++) {
              const pc = m % 12;
              if (bar.pcs.includes(pc) || PENTA.includes(((pc - bar.tonic) % 12 + 12) % 12)) pool.push(m);
            }
            let at = 1 + ri(Math.max(1, pool.length - 2));
            pick(CELLS).forEach((p, j) => {
              events.push({ inst: 'lead', midi: pool[at], beat: loose(swing(p), 0.012), dur: 1.6, vel: clamp(0.34 - j * 0.02 + r() * 0.05, 0.12, 0.45) });
              at = clamp(at + pick([-2, -1, 1, 1, 2]), 0, pool.length - 1);
            });
          }
        }
      }

      return {
        setScene(nextScene, nextLevel) {
          const lv = clamp(nextLevel | 0, 0, LIFT.length - 1);
          if (nextScene === scene && lv === level) return;
          scene = nextScene; level = lv;
          tonic = keyPc(scene === 'calm' ? 0 : level);
          queue = [];
        },
        nextBar() {
          while (queue.length < 2) plan();
          const bar = queue.shift(), next = queue[0], events = [];
          if (bar.scene === 'calm') composeCalm(bar, next, events);
          else if (bar.scene === 'release') composeRelease(bar, next, events);
          else composeWork(bar, next, events);
          events.sort((a, b) => a.beat - b.beat);
          return { index: index++, scene: bar.scene, level: bar.level, tonic: bar.tonic, name: bar.name, root: bar.root, pcs: bar.pcs, voicing: bar.voicing, bpm: BPM, events };
        },
      };
    }
    return { create, BPM, keyPc, CHORDS, PROGS, RELEASE, MAJOR };
  })();

  /* ================= Dsp: the sounds, rendered into arrays ================= */
  const Dsp = (function () {
    const KEYS_SR = 22050, FX_SR = 32000;
    const KEY_NOTES = [36, 41, 46, 51, 56, 61, 66, 71, 76, 81, 86, 91];
    const BASS_NOTES = [33, 38, 43, 48];
    const SFX_NAMES = ['stamp', 'paper', 'slip', 'tap', 'check', 'key', 'tick', 'tock', 'knock', 'door', 'tear'];
    const DRUM_NAMES = ['kick', 'snare', 'rim', 'hat'];
    const VARIANTS = { stamp: 3, paper: 3, slip: 2, tap: 2, check: 2, key: 3, tick: 1, tock: 1, knock: 2, door: 1, tear: 2, kick: 2, snare: 3, rim: 2, hat: 3 };
    const cache = new Map();
    const remember = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
    const nearest = (list, midi) => list.reduce((best, m) => (Math.abs(m - midi) < Math.abs(best - midi) ? m : best), list[0]);

    function biquad(x, type, fc, q, sr) {
      const w = TAU * clamp(fc, 10, sr * 0.45) / sr, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
      let b0, b1, b2;
      if (type === 'low') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
      else if (type === 'high') { b0 = (1 + cos) / 2; b1 = -1 - cos; b2 = b0; }
      else { b0 = alpha; b1 = 0; b2 = -alpha; }
      const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
      const out = new Float32Array(x.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < x.length; i++) {
        const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        out[i] = y; x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
      }
      return out;
    }
    function noise(n, rnd) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1; return x; }
    function damped(out, sr, freq, tau, amp, start) {
      const w = TAU * freq / sr, cr = Math.cos(w), ci = Math.sin(w), d = Math.exp(-1 / (tau * sr));
      let re = 1, im = 0, a = amp;
      for (let i = Math.floor((start || 0) * sr); i < out.length && a > 1e-5; i++) {
        out[i] += im * a;
        const nr = re * cr - im * ci; im = re * ci + im * cr; re = nr;
        a *= d;
      }
    }
    /* A burst of filtered noise: paper, felt, brushes, a pen tip. */
    function burst(out, sr, rnd, o) {
      const i0 = Math.floor((o.start || 0) * sr);
      const n = Math.min(out.length - i0, Math.ceil(((o.attack || 0) + (o.tau || 0.01) * 7) * sr));
      if (n <= 0) return;
      let x = noise(n, rnd);
      if (o.low) x = biquad(x, 'low', o.low, 0.7, sr);
      if (o.high) x = biquad(x, 'high', o.high, 0.7, sr);
      if (o.band) x = biquad(x, 'band', o.band, o.q || 1, sr);
      const attack = Math.max(1, (o.attack || 0.0004) * sr), d = Math.exp(-1 / ((o.tau || 0.01) * sr));
      let a = o.amp;
      for (let i = 0; i < n; i++) {
        const rise = i < attack ? i / attack : 1;
        out[i0 + i] += x[i] * a * rise;
        if (i >= attack) a *= d;
      }
    }
    /* Paper moves in tiny catches, so the noise gets a jittery swell while its pitch sweeps. */
    function swish(out, sr, rnd, o) {
      const i0 = Math.floor((o.start || 0) * sr), n = Math.min(out.length - i0, Math.floor(o.dur * sr));
      let low = 0, band = 0, grain = 0;
      const grainCoef = 1 - Math.exp(-TAU * (o.grain || 90) / sr);
      for (let i = 0; i < n; i++) {
        const p = i / n;
        const f = 2 * Math.sin(Math.PI * Math.min(0.2, (o.from + (o.to - o.from) * p) / sr));
        const input = rnd() * 2 - 1;
        const high = input - low - (1 / (o.q || 0.9)) * band;
        band += f * high; low += f * band;
        grain += grainCoef * (Math.abs(rnd() * 2 - 1) - grain);
        const env = Math.sin(Math.PI * Math.pow(p, o.lean || 0.7));
        out[i0 + i] += band * env * env * (0.45 + 1.1 * grain) * o.amp;
      }
    }
    /* Scale to a peak, ease in, ease out to true silence. */
    function fit(x, sr, peakTo) {
      let m = 0;
      for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
      const k = m > 0 ? peakTo / m : 1;
      const lead = Math.min(x.length >> 1, Math.ceil(0.0007 * sr)), tail = Math.min(x.length >> 1, Math.ceil(0.012 * sr));
      for (let i = 0; i < x.length; i++) {
        let g = k;
        if (i < lead) g *= i / lead;
        const fromEnd = x.length - 1 - i;
        if (fromEnd < tail) g *= fromEnd / tail;
        x[i] *= g;
      }
      return x;
    }
    const secs = (s, sr) => new Float32Array(Math.ceil(s * sr));

    const makers = {
      /* A rubber stamp on a pad of paper on a wooden desk: thud, knock, contact, and a small peel. */
      stamp(v, rnd) {
        const sr = FX_SR, x = secs(0.3, sr), j = 1 + (rnd() - 0.5) * 0.12;
        let phase = 0;
        for (let i = 0; i < x.length; i++) {
          const t = i / sr;
          phase += TAU * (96 + 130 * Math.exp(-t / 0.012)) * j / sr;
          x[i] += Math.sin(phase) * Math.exp(-t / 0.03) * 0.42;
        }
        [[334, 0.032, 0.8], [562, 0.023, 0.8], [948, 0.013, 0.6], [1540, 0.007, 0.36], [2350, 0.004, 0.2]].forEach(([f, tau, a]) => damped(x, sr, f * j * (1 + (rnd() - 0.5) * 0.05), tau, a));
        burst(x, sr, rnd, { low: 5200, tau: 0.0035, amp: 0.8 });
        burst(x, sr, rnd, { band: 1900, q: 0.7, start: 0.07 + rnd() * 0.012, attack: 0.008, tau: 0.012, amp: 0.1 });
        for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.2);
        return fit(x, sr, 0.92);
      },
      /* A sheet landing on the desk. */
      paper(v, rnd) {
        const sr = FX_SR;
        let x = secs(0.26, sr);
        swish(x, sr, rnd, { dur: 0.2, from: 1200 + rnd() * 300, to: 2800 + rnd() * 500, amp: 1 });
        x = biquad(x, 'low', 5600, 0.7, sr);
        burst(x, sr, rnd, { low: 500, start: 0.17 + rnd() * 0.012, attack: 0.002, tau: 0.014, amp: 0.34 });
        return fit(x, sr, 0.85);
      },
      /* A pink slip pushed across the desk, slower and lower than a new sheet. */
      slip(v, rnd) {
        const sr = FX_SR;
        let x = secs(0.44, sr);
        swish(x, sr, rnd, { dur: 0.36, from: 780 + rnd() * 120, to: 1750 + rnd() * 200, amp: 1, lean: 0.85, grain: 70 });
        x = biquad(x, 'low', 4800, 0.7, sr);
        burst(x, sr, rnd, { low: 420, start: 0.31, attack: 0.002, tau: 0.02, amp: 0.34 });
        damped(x, sr, 236, 0.022, 0.1, 0.31);
        damped(x, sr, 470, 0.012, 0.06, 0.31);
        return fit(x, sr, 0.9);
      },
      /* A ballpoint pen click. */
      tap(v, rnd) {
        const sr = FX_SR, x = secs(0.05, sr), j = 1 + (rnd() - 0.5) * 0.14;
        burst(x, sr, rnd, { band: 3000 * j, q: 2, tau: 0.0017, amp: 1 });
        damped(x, sr, 1250 * j, 0.0028, 0.3);
        burst(x, sr, rnd, { band: 2300 * j, q: 2, start: 0.018, tau: 0.0014, amp: 0.55 });
        damped(x, sr, 980 * j, 0.0022, 0.14, 0.018);
        return fit(x, sr, 0.85);
      },
      /* A pencil tick: a short stroke, then a longer one. */
      check(v, rnd) {
        const sr = FX_SR, x = secs(0.1, sr);
        burst(x, sr, rnd, { band: 3900 + rnd() * 500, q: 1.1, attack: 0.001, tau: 0.006, amp: 0.7 });
        burst(x, sr, rnd, { band: 2900 + rnd() * 500, q: 1, start: 0.03, attack: 0.002, tau: 0.014, amp: 1 });
        return fit(x, sr, 0.8);
      },
      /* A key on an old adding machine. */
      key(v, rnd) {
        const sr = FX_SR, x = secs(0.11, sr), j = 1 + (rnd() - 0.5) * 0.12;
        damped(x, sr, 415 * j, 0.012, 0.7);
        damped(x, sr, 830 * j, 0.006, 0.5);
        burst(x, sr, rnd, { band: 2900 * j, q: 1.4, tau: 0.0018, amp: 1 });
        damped(x, sr, 620 * j, 0.005, 0.2, 0.052);
        burst(x, sr, rnd, { band: 2200 * j, q: 1.4, start: 0.052, tau: 0.0014, amp: 0.25 });
        return fit(x, sr, 0.85);
      },
      /* A wooden wall clock. */
      tick(v, rnd) {
        const sr = FX_SR, x = secs(0.04, sr);
        damped(x, sr, 1840, 0.0035, 0.8);
        damped(x, sr, 930, 0.006, 0.55);
        burst(x, sr, rnd, { high: 2500, tau: 0.0011, amp: 0.45 });
        return fit(x, sr, 0.8);
      },
      tock(v, rnd) {
        const sr = FX_SR, x = secs(0.05, sr);
        damped(x, sr, 1240, 0.0045, 0.75);
        damped(x, sr, 620, 0.008, 0.6);
        burst(x, sr, rnd, { high: 1800, tau: 0.0012, amp: 0.35 });
        return fit(x, sr, 0.8);
      },
      /* Knuckles on a desk. */
      knock(v, rnd) {
        const sr = FX_SR, x = secs(0.17, sr), j = 1 + (rnd() - 0.5) * 0.08;
        [[214, 0.02, 0.42], [430, 0.02, 0.85], [880, 0.011, 0.7], [1500, 0.005, 0.35], [2300, 0.003, 0.18]].forEach(([f, tau, a]) => damped(x, sr, f * j, tau, a));
        burst(x, sr, rnd, { low: 3200, tau: 0.002, amp: 0.45 });
        return fit(x, sr, 0.9);
      },
      /* An office door shutting: weight first, then the latch. */
      door(v, rnd) {
        const sr = FX_SR, x = secs(1, sr);
        [[72, 0.1, 0.34], [118, 0.07, 0.38], [205, 0.05, 0.55], [340, 0.042, 0.82], [560, 0.03, 0.78], [870, 0.017, 0.52], [1260, 0.009, 0.3]].forEach(([f, tau, a]) => damped(x, sr, f, tau, a));
        burst(x, sr, rnd, { low: 1800, tau: 0.035, amp: 0.7 });
        damped(x, sr, 1760, 0.005, 0.42, 0.118);
        damped(x, sr, 985, 0.007, 0.4, 0.118);
        burst(x, sr, rnd, { band: 2600, q: 1.4, start: 0.118, tau: 0.002, amp: 0.45 });
        damped(x, sr, 1420, 0.004, 0.2, 0.152);
        for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.1);
        return fit(x, sr, 0.92);
      },
      /* A pink slip torn up: a run of tiny rips. */
      tear(v, rnd) {
        const sr = FX_SR, x = secs(0.36, sr);
        let t = 0;
        while (t < 0.3) {
          const shape = Math.sin(Math.PI * clamp(t / 0.3, 0, 1));
          burst(x, sr, rnd, { band: 2400 + rnd() * 2200, q: 0.8, start: t, tau: 0.004 + rnd() * 0.004, amp: (0.3 + rnd() * 0.7) * (0.3 + shape) });
          t += 0.006 + rnd() * 0.011;
        }
        return fit(x, sr, 0.82);
      },
      /* Drums stay soft and dark: this is a backing track, not a drum kit in the room. */
      kick(v, rnd) {
        const sr = FX_SR, x = secs(0.42, sr);
        let phase = rnd() * 0.2;
        for (let i = 0; i < x.length; i++) {
          const t = i / sr;
          phase += TAU * (47 + 66 * Math.exp(-t / 0.028)) / sr;
          x[i] = Math.tanh(Math.sin(phase) * Math.exp(-t / 0.11) * 1.7);
        }
        damped(x, sr, 236, 0.022, 0.3);
        damped(x, sr, 430, 0.011, 0.2);
        burst(x, sr, rnd, { low: 2400, tau: 0.003, amp: 0.3 });
        return fit(x, sr, 0.92);
      },
      snare(v, rnd) {
        const sr = FX_SR, x = secs(0.36, sr);
        burst(x, sr, rnd, { high: 800, low: 5200, attack: 0.002, tau: 0.075, amp: 1 });
        burst(x, sr, rnd, { band: 2100, q: 0.8, tau: 0.018, amp: 0.5 });
        damped(x, sr, 188 + rnd() * 10, 0.045, 0.34);
        damped(x, sr, 322, 0.026, 0.16);
        return fit(x, sr, 0.9);
      },
      rim(v, rnd) {
        const sr = FX_SR, x = secs(0.09, sr), j = 1 + (rnd() - 0.5) * 0.04;
        [[1720, 0.007, 0.8], [942, 0.012, 0.7], [478, 0.016, 0.42]].forEach(([f, tau, a]) => damped(x, sr, f * j, tau, a));
        burst(x, sr, rnd, { high: 1500, tau: 0.0016, amp: 0.3 });
        return fit(x, sr, 0.88);
      },
      hat(v, rnd) {
        const sr = FX_SR, x = secs(0.14, sr);
        burst(x, sr, rnd, { high: 5200, low: 11000, attack: 0.0008, tau: 0.018 + rnd() * 0.006, amp: 1 });
        return fit(x, sr, 0.8);
      },
    };

    function fx(name, variant) {
      const count = VARIANTS[name] || 1, v = (variant || 0) % count;
      return remember(`${name}:${v}`, () => makers[name](v, rngOf(4099 * (v + 1) + name.charCodeAt(0) * 131 + name.length * 17)));
    }

    /* A soft felt upright: a stack of slightly stretched partials, two strings per note, felt on the hammer. */
    function piano(midi) {
      return remember(`piano:${midi}`, () => {
        const sr = KEYS_SR, rnd = rngOf(midi * 7919 + 13);
        const f0 = 440 * Math.pow(2, (midi - 69) / 12);
        const low = clamp((84 - midi) / 48, 0, 1);
        const out = secs(1.5 + 2.9 * low, sr);
        const stretch = 0.00007 * Math.pow(2, (midi - 48) / 14);
        const felt = 760 + 900 * low;
        const fastBase = 0.13 + 0.5 * low, slowBase = 0.62 + 2.5 * low;
        for (let k = 1; k <= 18; k++) {
          const fk = k * f0 * Math.sqrt(1 + stretch * k * k);
          if (fk > 4800) break;
          const hammer = 0.4 + 0.6 * Math.abs(Math.sin(Math.PI * k / 7.6));
          // the first moment holds more of the upper partials than the ring does
          let ampFast = Math.pow(k, -0.9) * Math.exp(-fk / (felt * 2.2)) * hammer;
          let ampSlow = Math.pow(k, -1.2) * Math.exp(-fk / felt) * hammer;
          if (k === 1 && midi < 48) { ampFast *= 0.72; ampSlow *= 0.72; }
          const fast = fastBase / (1 + 0.24 * (k - 1)), slow = slowBase / (1 + 0.22 * (k - 1));
          const strings = k <= 6 ? 2 : 1;
          for (let s = 0; s < strings; s++) {
            const cents = strings === 1 ? 0 : (s ? 1 : -1) * (0.55 + rnd() * 0.75);
            const w = TAU * fk * Math.pow(2, cents / 1200) / sr, cr = Math.cos(w), ci = Math.sin(w);
            const start = rnd() * TAU;
            let re = Math.cos(start), im = Math.sin(start);
            let ef = ampFast * 0.55 / strings, es = ampSlow * 0.45 / strings;
            const df = Math.exp(-1 / (fast * sr)), ds = Math.exp(-1 / (slow * sr));
            for (let i = 0; i < out.length; i++) {
              const a = ef + es;
              if (a < 1e-5) break;
              out[i] += im * a;
              const nr = re * cr - im * ci; im = re * ci + im * cr; re = nr;
              ef *= df; es *= ds;
            }
          }
        }
        // the felt takes a moment to leave the string
        const attack = Math.floor((0.006 + 0.006 * low) * sr);
        for (let i = 0; i < attack; i++) { const u = i / attack; out[i] *= 0.5 - 0.5 * Math.cos(Math.PI * u); }
        let m = 0;
        for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
        burst(out, sr, rnd, { low: 1200, attack: 0.002, tau: 0.012, amp: m * 0.05 });
        damped(out, sr, 138 + rnd() * 20, 0.024, m * 0.03);
        // ring off rather than stop
        const ring = Math.floor(0.25 * sr);
        for (let i = 0; i < ring; i++) out[out.length - 1 - i] *= i / ring;
        return fit(out, sr, 0.9);
      });
    }

    /* A muted bass: a round note with enough overtones to survive a phone speaker. */
    function bass(midi) {
      return remember(`bass:${midi}`, () => {
        const sr = KEYS_SR, rnd = rngOf(midi * 3571 + 5);
        const f0 = 440 * Math.pow(2, (midi - 69) / 12), out = secs(1.9, sr);
        [1, 0.72, 0.52, 0.34, 0.22, 0.13, 0.07].forEach((a, i) => {
          const k = i + 1;
          damped(out, sr, k * f0 * (1 + 0.00012 * k * k), 0.95 / (1 + 0.55 * i), i >= 2 && midi < 40 ? a * 1.4 : a);
        });
        const attack = Math.floor(0.005 * sr);
        for (let i = 0; i < attack; i++) out[i] *= i / attack;
        burst(out, sr, rnd, { low: 800, attack: 0.001, tau: 0.008, amp: 0.05 });
        for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 1.5);
        const ring = Math.floor(0.2 * sr);
        for (let i = 0; i < ring; i++) out[out.length - 1 - i] *= i / ring;
        return fit(out, sr, 0.9);
      });
    }

    /* The hush of a quiet room with the faintest record crackle. It loops, and it is mostly felt, not heard. */
    function room() {
      return remember('room', () => {
        const sr = KEYS_SR, rnd = rngOf(2718), out = secs(7, sr);
        let hush = biquad(noise(out.length, rnd), 'low', 2400, 0.6, sr);
        hush = biquad(hush, 'high', 260, 0.6, sr);
        for (let i = 0; i < out.length; i++) out[i] = hush[i] * 0.05;
        const pops = 34;
        for (let p = 0; p < pops; p++) {
          const at = rnd() * 6.8, amp = 0.02 + Math.pow(rnd(), 3) * 0.16;
          burst(out, sr, rnd, { high: 1600, start: at, tau: 0.0006 + rnd() * 0.0012, amp });
        }
        const blend = Math.floor(0.2 * sr);
        for (let i = 0; i < blend; i++) {
          const u = i / blend;
          out[i] = out[i] * u + out[out.length - blend + i] * (1 - u);
        }
        return out.subarray(0, out.length - blend);
      });
    }

    /* A small, dark room for the reverb: a little pre-delay, then a soft tail that loses its top as it fades. */
    function impulse(sr) {
      const seconds = 1.5, n = Math.floor(seconds * sr), pre = Math.floor(0.011 * sr);
      return [11, 23].map((seed) => {
        const rnd = rngOf(seed), x = new Float32Array(n);
        let low = 0, band = 0;
        for (let i = pre; i < n; i++) {
          const t = (i - pre) / sr;
          const fc = 500 + 3600 * Math.exp(-t / 0.35);
          const f = 2 * Math.sin(Math.PI * Math.min(0.2, fc / sr));
          const input = (rnd() * 2 - 1) * Math.exp(-t / 0.3);
          const high = input - low - 1.1 * band;
          band += f * high; low += f * band;
          x[i] = low;
        }
        const fade = Math.floor(0.1 * sr);
        for (let i = 0; i < fade; i++) x[n - 1 - i] *= i / fade;
        return x;
      });
    }

    return { KEYS_SR, FX_SR, KEY_NOTES, BASS_NOTES, SFX_NAMES, DRUM_NAMES, fx, piano, bass, room, impulse, nearest, variants: (name) => VARIANTS[name] || 1 };
  })();

  /* ================= Engine: plays the score and the sounds on any AudioContext ================= */
  const LEVEL = {
    master: 0.92,
    music: 0.5,
    key: 0.43, bass: 0.11, kick: 0.27, snare: 0.135, rim: 0.09, hat: 0.045, room: 0.095,
    fxKey: 0.3,
    stamp: 0.24, paper: 0.08, slip: 0.19, tap: 0.1, check: 0.12, key_: 0.15, tick: 0.12, knock: 0.3, door: 0.5, tear: 0.22,
  };
  const LOOKAHEAD = 1.1;

  function createEngine(ctx, opts) {
    opts = opts || {};
    const now = opts.now || (() => ctx.currentTime);
    const score = Score.create(opts.seed == null ? 1 : opts.seed);
    const rand = rngOf((opts.seed == null ? 1 : opts.seed) + 977);
    const gainOf = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };

    // Output: music and effects meet in a gentle limiter.
    const output = gainOf(LEVEL.master, ctx.destination);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 4; limiter.attack.value = 0.004; limiter.release.value = 0.16;
    limiter.connect(output);

    // Music: everything passes through a touch of tape saturation and loses its top end.
    const musicOut = gainOf(0, limiter);
    const dip = gainOf(1, musicOut);
    const highpass = ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 34; highpass.Q.value = 0.5; highpass.connect(dip);
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 8200; dark.Q.value = 0.4; dark.connect(highpass);
    const tape = ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) { const x = (i - 1024) / 1024; curve[i] = Math.tanh(1.25 * x) / 1.25; }
    tape.curve = curve; tape.connect(dark);
    const musicIn = gainOf(1, tape);

    // Reverb: one room, shared. Music can fade its share out without cutting effects.
    const reverb = ctx.createConvolver();
    const ir = Dsp.impulse(ctx.sampleRate), irBuf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
    ir.forEach((chan, c) => irBuf.getChannelData(c).set(chan));
    reverb.buffer = irBuf;
    reverb.connect(gainOf(0.9, limiter));
    const musicSend = gainOf(0, reverb);

    const stems = {
      piano: gainOf(1), lead: gainOf(1), bass: gainOf(1, musicIn), drums: gainOf(1, musicIn), room: gainOf(LEVEL.room, musicOut),
    };
    stems.piano.connect(musicIn); stems.piano.connect(gainOf(0.26, musicSend));
    stems.lead.connect(musicIn); stems.lead.connect(gainOf(0.5, musicSend));
    const snareBus = gainOf(1, stems.drums); snareBus.connect(gainOf(0.1, musicSend));
    const hand = (pan) => {
      const g = ctx.createGain();
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(stems.piano); } else g.connect(stems.piano);
      return g;
    };
    const handLow = hand(-0.2), handMid = hand(0), handHigh = hand(0.2);
    const leadPan = (function () {
      const g = ctx.createGain();
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = 0.28; g.connect(p); p.connect(stems.lead); } else g.connect(stems.lead);
      return g;
    })();

    // Effects: dry to the limiter, with their own small share of the room.
    const fxBus = gainOf(1, limiter);
    const fxSend = gainOf(0.1, reverb); fxBus.connect(fxSend);
    const fxKeys = gainOf(1, fxBus);
    fxKeys.connect(gainOf(0.32, reverb));

    // A slow wow and a faint flutter, like a tape that has been played many times.
    const wobble = gainOf(1);
    const lfo = (hz, depth) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = gainOf(depth, wobble); o.connect(g); o.start(0); };
    lfo(0.31, 0.0028); lfo(5.1, 0.0007);

    const bank = { keys: new Map(), bass: new Map(), fx: new Map(), room: null };
    const toBuffer = (data, sr) => { const b = ctx.createBuffer(1, data.length, sr); b.getChannelData(0).set(data); return b; };
    const allFx = Dsp.SFX_NAMES.concat(Dsp.DRUM_NAMES);
    let fxReady = false;
    function prepareFx() {
      if (fxReady) return;
      allFx.forEach((name) => {
        const list = [];
        for (let v = 0; v < Dsp.variants(name); v++) list.push(toBuffer(Dsp.fx(name, v), Dsp.FX_SR));
        bank.fx.set(name, list);
      });
      fxReady = true;
    }
    const loaders = [];
    Dsp.BASS_NOTES.forEach((m) => loaders.push(() => bank.bass.set(m, toBuffer(Dsp.bass(m), Dsp.KEYS_SR))));
    Dsp.KEY_NOTES.slice().sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64)).forEach((m) => loaders.push(() => bank.keys.set(m, toBuffer(Dsp.piano(m), Dsp.KEYS_SR))));
    loaders.push(() => { bank.room = toBuffer(Dsp.room(), Dsp.KEYS_SR); });
    const keysReady = () => bank.keys.size === Dsp.KEY_NOTES.length && !!bank.room;

    let wantMusic = false, scene = 'calm', level = 0, playing = false, nextBarAt = 0, holdUntil = 0, barsDone = 0, roomOn = false, clockFlip = false, held = false;
    const voices = new Set();
    let timeline = [];

    function stopAt(src, t) { try { src.stop(t); } catch (e) { /* an old browser refuses a second stop; the fade already covers it */ } }

    function keyNote(midi, t, dur, vel, bus, track) {
      const sample = Dsp.nearest(Dsp.KEY_NOTES, midi), buffer = bank.keys.get(sample);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const rate = Math.pow(2, (midi - sample) / 12);
      src.playbackRate.value = rate;
      const wob = gainOf(rate); wobble.connect(wob); wob.connect(src.playbackRate);
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 900 + 3800 * vel; tone.Q.value = 0.6;
      const peak = (track ? LEVEL.key : LEVEL.fxKey) * vel;
      const g = gainOf(peak, bus);
      src.connect(tone); tone.connect(g);
      const off = t + dur;
      g.gain.setValueAtTime(peak, off);
      g.gain.setTargetAtTime(0, off, 0.13);
      src.start(t);
      stopAt(src, off + 1.1);
      const voice = { src, g, t };
      if (track) voices.add(voice);
      src.onended = () => {
        voices.delete(voice);
        try { wobble.disconnect(wob); wob.disconnect(); src.disconnect(); tone.disconnect(); g.disconnect(); } catch (e) { /* already gone */ }
      };
    }
    function bassNote(midi, t, dur, vel) {
      const sample = Dsp.nearest(Dsp.BASS_NOTES, midi), buffer = bank.bass.get(sample);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.pow(2, (midi - sample) / 12);
      const peak = LEVEL.bass * vel;
      const g = gainOf(peak, stems.bass);
      src.connect(g);
      const off = t + dur;
      g.gain.setValueAtTime(peak, off);
      g.gain.setTargetAtTime(0, off, 0.07);
      src.start(t);
      stopAt(src, off + 0.6);
      const voice = { src, g, t };
      voices.add(voice);
      src.onended = () => { voices.delete(voice); try { src.disconnect(); g.disconnect(); } catch (e) { /* already gone */ } };
    }
    function hit(name, t, gainValue, dest, o) {
      const list = bank.fx.get(name);
      if (!list) return null;
      o = o || {};
      const src = ctx.createBufferSource();
      src.buffer = list[Math.floor(rand() * list.length)];
      src.playbackRate.value = (o.rate || 1) * (1 + (rand() - 0.5) * (o.jitter == null ? 0.06 : o.jitter));
      const g = gainOf(gainValue, dest);
      src.connect(g);
      src.start(t);
      const voice = { src, g, t };
      if (o.track) voices.add(voice);
      src.onended = () => { voices.delete(voice); try { src.disconnect(); g.disconnect(); } catch (e) { /* already gone */ } };
      return voice;
    }

    function scheduleBar(bar, t0) {
      const beat = 60 / bar.bpm;
      timeline.push({ t0, bar });
      if (timeline.length > 8) timeline.shift();
      barsDone++;
      bar.events.forEach((e) => {
        const t = t0 + e.beat * beat;
        switch (e.inst) {
          case 'piano': keyNote(e.midi, t, e.dur * beat, e.vel, e.midi < 60 ? handLow : e.midi < 68 ? handMid : handHigh, true); break;
          case 'lead': keyNote(e.midi, t, e.dur * beat, e.vel, leadPan, true); break;
          case 'bass': bassNote(e.midi, t, e.dur * beat, e.vel); break;
          case 'kick': hit('kick', t, LEVEL.kick * e.vel, stems.drums, { jitter: 0.02, track: true }); break;
          case 'snare': hit('snare', t, LEVEL.snare * e.vel, snareBus, { jitter: 0.04, track: true }); break;
          case 'rim': hit('rim', t, LEVEL.rim * e.vel, stems.drums, { jitter: 0.03, track: true }); break;
          case 'hat': hit('hat', t, LEVEL.hat * e.vel, stems.drums, { jitter: 0.08, track: true }); break;
          default: break;
        }
      });
    }

    function releaseVoices(t, tau) {
      voices.forEach((v) => {
        if (v.t >= t) { stopAt(v.src, t); return; }
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(0, t, tau);
        stopAt(v.src, t + tau * 8);
      });
    }
    function setMusicLevel(on, tau) {
      const t = now();
      musicOut.gain.setTargetAtTime(on ? LEVEL.music : 0, t, tau);
      musicSend.gain.setTargetAtTime(on ? 1 : 0, t, tau);
    }
    function startRoom() {
      if (roomOn || !bank.room) return;
      roomOn = true;
      const src = ctx.createBufferSource();
      src.buffer = bank.room; src.loop = true;
      src.connect(stems.room);
      src.start(now());
    }
    function reconcile() {
      const should = wantMusic && scene !== 'none' && keysReady();
      const t = now();
      if (should && !playing) {
        playing = true;
        nextBarAt = Math.max(t + 0.12, holdUntil);
        setMusicLevel(true, 0.7);
        startRoom();
      } else if (!should && playing) {
        playing = false;
        setMusicLevel(false, 0.2);
        releaseVoices(t, 0.16);
      }
    }
    function pump(at) {
      if (!playing) return;
      const t = at == null ? now() : at;
      if (nextBarAt < t - 0.05) nextBarAt = t + 0.05;
      while (nextBarAt < t + LOOKAHEAD) {
        const bar = score.nextBar();
        scheduleBar(bar, nextBarAt);
        nextBarAt += 240 / bar.bpm;
      }
    }
    /* Clear the air for a stinger: the band stops, the stinger plays alone, and the next bar comes in after it. */
    function interrupt(t, gap) {
      releaseVoices(t, 0.09);
      holdUntil = t + gap;
      if (playing) nextBarAt = holdUntil;
    }
    function duck(t, to, hold, back) {
      if (held) return;
      dip.gain.cancelScheduledValues(t);
      dip.gain.setTargetAtTime(to, t, 0.03);
      dip.gain.setTargetAtTime(1, t + hold, back);
    }

    /* The chord the band is playing right now, so musical effects always fit it. */
    function chordAt(t) {
      for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].t0 <= t) return timeline[i].bar;
      const tonic = Score.keyPc(scene === 'calm' ? 0 : level);
      return { tonic, root: tonic, pcs: Score.CHORDS.I.tones.map((x) => (x + tonic) % 12) };
    }
    function tonesIn(pcs, low, high) {
      const list = [];
      for (let m = low; m <= high; m++) if (pcs.includes(m % 12)) list.push(m);
      return list;
    }
    const upTheKey = (level_, notes) => {
      const tonic = Score.keyPc(level_);
      const base = 55 + ((tonic - 55 % 12 + 12) % 12);
      return notes.map((n) => base + n);
    };

    const FX = {
      /* A new sheet lands on the desk. */
      paper(t) { hit('paper', t, LEVEL.paper, fxBus, { jitter: 0.12 }); },
      /* A pen click: the neutral "got it" for anything that is not yet right or wrong. */
      tap(t, o) { hit('tap', t, LEVEL.tap * (o.soft ? 0.55 : 1), fxBus, { jitter: 0.1 }); },
      /* The adding machine under the keypad. */
      key(t) { hit('key', t, LEVEL.key_, fxBus, { jitter: 0.08 }); },
      /* The wall clock, only for the last three seconds. */
      clock(t) { clockFlip = !clockFlip; hit(clockFlip ? 'tick' : 'tock', t, LEVEL.tick, fxBus, { jitter: 0.02 }); },
      /* Knuckles on the desk: the room's cue in class. */
      knock(t) { hit('knock', t, LEVEL.knock, fxBus); hit('knock', t + 0.17, LEVEL.knock * 0.72, fxBus); },
      /* A pencil tick on one correct part of a many-part task, and the notes climb as the parts add up. */
      check(t, o) {
        hit('check', t, LEVEL.check, fxBus, { jitter: 0.1 });
        const notes = tonesIn(chordAt(t).pcs, 67, 88), n = notes[Math.min(o.step || 0, notes.length - 1)];
        keyNote(n, t + 0.015, 0.5, 0.24, fxKeys, false);
      },
      /* A small stamp for each card filed from a pile. */
      file(t, o) {
        hit('stamp', t, LEVEL.stamp * 0.6, fxBus, { rate: 1.12 });
        const notes = tonesIn(chordAt(t).pcs, 67, 88), n = notes[Math.min(o.step || 0, notes.length - 1)];
        keyNote(n, t + 0.02, 0.5, 0.22, fxKeys, false);
      },
      /* Right: the stamp comes down, and two soft notes from whatever chord is playing. */
      right(t) {
        hit('stamp', t, LEVEL.stamp, fxBus);
        const notes = tonesIn(chordAt(t).pcs, 70, 86), i = Math.floor(rand() * Math.max(1, notes.length - 2));
        keyNote(notes[i], t + 0.035, 0.9, 0.3, fxKeys, false);
        keyNote(notes[Math.min(i + 2, notes.length - 1)], t + 0.105, 1.1, 0.27, fxKeys, false);
        duck(t, 0.74, 0.16, 0.22);
      },
      /* Wrong: a pink slip slides across the desk, and a hand rests on the low keys. No buzzer, no sad trombone. */
      miss(t) {
        hit('slip', t, LEVEL.slip, fxBus);
        const bar = chordAt(t), low = 41 + ((bar.root - 41 % 12 + 12) % 12);
        keyNote(low, t + 0.05, 0.55, 0.42, fxKeys, false);
        keyNote(low + 1, t + 0.075, 0.38, 0.24, fxKeys, false);
        duck(t, 0.52, 0.55, 0.45);
      },
      /* A steal in class: a stamp, and a firmer pair of notes so the room hears it. */
      steal(t) {
        hit('stamp', t, LEVEL.stamp * 1.1, fxBus);
        const notes = tonesIn(chordAt(t).pcs, 70, 86), n = notes[notes.length >> 1];
        keyNote(n, t + 0.03, 1, 0.34, fxKeys, false);
        keyNote(n + 7 <= 91 ? n + 7 : n, t + 0.1, 1.2, 0.3, fxKeys, false);
      },
      /* An answer shown to the room: a page turned, one note. */
      reveal(t) {
        hit('paper', t, LEVEL.paper * 1.8, fxBus);
        const notes = tonesIn(chordAt(t).pcs, 70, 84);
        keyNote(notes[notes.length >> 1], t + 0.05, 1.2, 0.3, fxKeys, false);
      },
      /* Promoted: the band stops, one firm stamp, and a chord opens up in the new key. Not a fanfare. */
      promoted(t, o) {
        const lv = o.level || 0, gap = 2.5;
        interrupt(t, gap);
        hit('stamp', t, LEVEL.stamp * 1.25, fxBus, { rate: 0.9 });
        if (o.tore) hit('tear', t + 0.3, LEVEL.tear, fxBus);
        upTheKey(lv, [0, 7, 11, 14, 16]).forEach((m, i) => keyNote(m, t + 0.2 + i * 0.09, 2.1 - i * 0.09, 0.44 - i * 0.02, fxKeys, false));
      },
      /* A clean Release: the finished stack thumps down, the same chord, quicker. */
      release(t, o) {
        const lv = o.level || 0;
        interrupt(t, 2);
        hit('stamp', t, LEVEL.stamp * 1.3, fxBus, { rate: 0.76 });
        hit('paper', t + 0.03, LEVEL.paper * 2, fxBus);
        upTheKey(lv, [0, 7, 11, 14]).forEach((m, i) => keyNote(m, t + 0.16 + i * 0.04, 1.7, 0.42, fxKeys, false));
      },
      /* The top: a slow climb that lands on one open chord, with the bass under it. */
      win(t, o) {
        const lv = o.level == null ? 5 : o.level, gap = 4;
        interrupt(t, gap);
        const climb = upTheKey(lv, [0, 7, 11, 14, 16, 19, 23]);
        climb.forEach((m, i) => keyNote(m, t + 0.1 + i * 0.16, 1.4, 0.34 + i * 0.01, fxKeys, false));
        const land = t + 0.1 + climb.length * 0.16 + 0.04;
        upTheKey(lv, [-12, 4, 7, 11, 14]).forEach((m, i) => keyNote(m, land + i * 0.018, 2.4, 0.36, fxKeys, false));
      },
      /* Fired: the music is gone, the door shuts, one low note. It is funnier played straight. */
      fired(t) {
        interrupt(t, 3);
        hit('door', t + 0.1, LEVEL.door, fxBus, { jitter: 0 });
        const bar = chordAt(t), low = 41 + ((bar.root - 41 % 12 + 12) % 12);
        keyNote(low, t + 0.34, 2.2, 0.36, fxKeys, false);
      },
      tear(t) { hit('tear', t, LEVEL.tear, fxBus); },
    };

    const api = {
      prepareFx,
      /* Render the instruments a little at a time so the first tap never stutters. */
      prepareKeys(done) {
        const step = () => {
          try {
            const job = loaders.shift();
            if (job) { job(); setTimeout(step, 0); return; }
            reconcile();
          } catch (e) { return; } // no piano is better than a broken page
          if (done) done();
        };
        step();
      },
      prepareNow() { prepareFx(); while (loaders.length) loaders.shift()(); reconcile(); },
      setMusic(on) { wantMusic = !!on; reconcile(); },
      setScene(nextScene, nextLevel) {
        const lv = nextLevel | 0;
        if (nextScene !== 'none') score.setScene(nextScene, lv);
        scene = nextScene; level = lv;
        reconcile();
      },
      pump,
      play(name, o) { const f = FX[name]; if (f && fxReady) f(now() + 0.004, o || {}); },
      holdDip(to) { const t = now(); held = true; dip.gain.cancelScheduledValues(t); dip.gain.setTargetAtTime(to, t, 0.08); },
      letGo() { if (!held) return; held = false; const t = now(); dip.gain.cancelScheduledValues(t); dip.gain.setTargetAtTime(1, t, 0.3); },
      setStems(gains) { Object.keys(gains).forEach((k) => { if (stems[k]) stems[k].gain.value = gains[k] * (k === 'room' ? LEVEL.room : 1); }); },
      state: () => ({ playing, wantMusic, scene, level, bars: barsDone, voices: voices.size, keysReady: keysReady(), fxReady, dipped: held }),
    };
    return api;
  }

  /* ================= Live: the real AudioContext, which a browser only allows after a tap ================= */
  function createLive() {
    const AC = root.AudioContext || root.webkitAudioContext;
    let ctx = null, engine = null, timer = 0, wantMusic = false, wantFx = false, scene = 'calm', level = 0, dipTo = null, loading = false;

    function boot() {
      if (ctx || !AC) return !!ctx;
      try {
        try { ctx = new AC({ latencyHint: 'balanced' }); } catch (e) { ctx = new AC(); }
        engine = createEngine(ctx, { seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 });
        // Old iPhones wake the audio only when something plays during the tap itself.
        const wake = ctx.createBufferSource();
        wake.buffer = ctx.createBuffer(1, 1, 22050);
        wake.connect(ctx.destination);
        wake.start(0);
      } catch (e) { ctx = null; engine = null; return false; }
      engine.prepareFx();
      engine.setScene(scene, level);
      engine.setMusic(wantMusic);
      return true;
    }
    const tick = () => { try { if (engine && ctx.state === 'running') engine.pump(ctx.currentTime); } catch (e) { clockOn(false); engine = null; } };
    function clockOn(on) {
      if (on && !timer) timer = setInterval(tick, 220);
      if (!on && timer) { clearInterval(timer); timer = 0; }
    }
    function loadKeys() {
      if (loading || !engine) return;
      loading = true;
      try { engine.prepareKeys(() => { tick(); }); } catch (e) { engine = null; }
    }
    function sync() {
      if (!engine) return;
      engine.setMusic(wantMusic);
      if (wantMusic) loadKeys();
      else if (wantFx) loadKeys(); // effects use the piano too
      clockOn(wantMusic);
      if (!wantMusic && !wantFx) { if (ctx.state === 'running' && ctx.suspend) ctx.suspend(); }
      else if (ctx.state !== 'running' && !root.document.hidden) resume();
      tick();
    }
    function resume() { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* the next tap tries again */ } }

    if (root.document && root.document.addEventListener) {
      root.document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (root.document.hidden) { if (ctx.suspend) ctx.suspend(); }
        else if (wantMusic || wantFx) { resume(); tick(); }
      });
    }

    return {
      /* Call from inside a tap. Starts the audio once, and wakes it if the phone put it to sleep. */
      unlock() {
        if (!wantMusic && !wantFx) return;
        if (!ctx && !boot()) return;
        if (ctx.state !== 'running') resume();
        if (dipTo != null) engine.holdDip(dipTo);
        sync();
      },
      configure(music, fx) { wantMusic = !!music; wantFx = !!fx; if (ctx) sync(); },
      scene(nextScene, nextLevel) {
        if (scene === nextScene && level === nextLevel) return;
        scene = nextScene; level = nextLevel;
        if (engine) { engine.setScene(scene, level); tick(); }
      },
      play(name, o) { if (engine && wantFx) { engine.play(name, o); tick(); } },
      dipFor(to) { dipTo = to; if (engine) engine.holdDip(to); },
      undip() { dipTo = null; if (engine) engine.letGo(); },
      state() {
        const s = engine ? engine.state() : {};
        return Object.assign({ ctx: ctx ? ctx.state : null, hasAudio: !!AC, music: wantMusic, fx: wantFx, scene, level }, s, { playing: !!s.playing });
      },
    };
  }

  /* Render a clip offline, for tools/render_audio.py and the playtest. The same engine, the same code path. */
  function renderClip(spec) {
    const sr = spec.sr || 44100, seconds = spec.seconds;
    const OC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const ctx = new OC(2, Math.ceil(seconds * sr), sr);
    let clock = 0;
    const engine = createEngine(ctx, { seed: spec.seed == null ? 7 : spec.seed, now: () => clock });
    engine.prepareNow();
    if (spec.stems) engine.setStems(spec.stems);
    engine.setMusic(spec.music !== false);
    const steps = (spec.events || []).slice().sort((a, b) => a.t - b.t);
    let at = 0;
    for (clock = 0; clock < seconds; clock += 0.05) {
      while (at < steps.length && steps[at].t <= clock) {
        const s = steps[at++];
        if (s.scene) engine.setScene(s.scene, s.level || 0);
        if (s.sfx) engine.play(s.sfx, s.o);
      }
      engine.pump(clock);
    }
    return ctx.startRendering();
  }

  const api = { Score, Dsp, createEngine, createLive, renderClip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SE_AUDIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
