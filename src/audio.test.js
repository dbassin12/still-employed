'use strict';
// Run: node --test src/bank.test.js src/audio.test.js
// The music and sounds are generated, so these tests check the rules the teacher's brief turns into:
// background music and sound effects, "not overly cheesy." No beeps, nothing that speeds up, no audible loop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Score, Dsp } = require('./audio.js');

const LEVELS = [0, 1, 2, 3, 4, 5];
const PITCHED = new Set(['piano', 'bass', 'lead']);
const barsOf = (seed, scene, level, n) => {
  const s = Score.create(seed);
  s.setScene(scene, level);
  return Array.from({ length: n }, () => s.nextBar());
};
const hits = (bars, inst) => bars.reduce((sum, b) => sum + b.events.filter((e) => e.inst === inst).length, 0);
const rel = (midi, tonic) => ((midi - tonic) % 12 + 12) % 12;
const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

/* ---------- the score ---------- */
test('the same seed writes the same music, and a new seed writes different music', () => {
  assert.deepEqual(barsOf(7, 'work', 3, 16), barsOf(7, 'work', 3, 16));
  assert.notDeepEqual(barsOf(7, 'work', 3, 16), barsOf(8, 'work', 3, 16));
});

test('the tempo is slow and never changes, so the music cannot rush a student', () => {
  assert.ok(Score.BPM >= 66 && Score.BPM <= 80, `BPM ${Score.BPM}`);
  for (const scene of ['calm', 'work', 'release']) {
    for (const level of LEVELS) for (const b of barsOf(3, scene, level, 12)) assert.equal(b.bpm, Score.BPM);
  }
});

test('every event lands inside its bar with a sane length and volume', () => {
  for (const scene of ['calm', 'work', 'release']) {
    for (const level of LEVELS) {
      for (const b of barsOf(11, scene, level, 60)) {
        for (const e of b.events) {
          assert.ok(e.beat >= 0 && e.beat < 4, `beat ${e.beat} in ${scene} ${level}`);
          assert.ok(e.vel > 0 && e.vel <= 0.9, `vel ${e.vel} (${e.inst})`);
          if (PITCHED.has(e.inst)) assert.ok(e.dur > 0 && e.dur <= 8, `dur ${e.dur}`);
        }
      }
    }
  }
});

test('calm and work stay in the key, with no wrong-sounding notes', () => {
  for (const [scene, levels] of [['calm', [0]], ['work', LEVELS]]) {
    for (const level of levels) {
      for (const b of barsOf(5, scene, level, 200)) {
        for (const e of b.events) {
          if (PITCHED.has(e.inst)) assert.ok(MAJOR.has(rel(e.midi, b.tonic)), `${e.inst} ${e.midi} not in key ${b.tonic} (${b.name}, level ${level})`);
        }
      }
    }
  }
});

test('the Release only adds its one darker color to the key', () => {
  const allowed = new Set([...MAJOR, 10]);
  for (const level of LEVELS) {
    for (const b of barsOf(6, 'release', level, 120)) {
      for (const e of b.events) if (PITCHED.has(e.inst)) assert.ok(allowed.has(rel(e.midi, b.tonic)), `${e.midi} in ${b.name}`);
    }
  }
});

test('notes stay where they sound warm: no piano mud, no shrill top, real bass range', () => {
  for (const scene of ['calm', 'work', 'release']) {
    for (const level of LEVELS) {
      for (const b of barsOf(9, scene, level, 120)) {
        for (const e of b.events) {
          if (e.inst === 'piano') assert.ok(e.midi >= 50 && e.midi <= 79, `piano ${e.midi}`);
          if (e.inst === 'lead') assert.ok(e.midi >= 67 && e.midi <= 86, `lead ${e.midi}`);
          if (e.inst === 'bass') assert.ok(e.midi >= 33 && e.midi <= 50, `bass ${e.midi}`);
        }
      }
    }
  }
});

test('chords can be voiced in every key, with no clashing neighbors, and hands barely move', () => {
  for (const scene of ['calm', 'work', 'release']) {
    for (const level of LEVELS) {
      let moved = 0, changes = 0, last = null;
      for (const b of barsOf(13, scene, level, 200)) {
        assert.equal(b.voicing.length, 4, `${b.name} has no voicing`);
        for (let j = 1; j < 4; j++) assert.ok(b.voicing[j] - b.voicing[j - 1] >= 2, `${b.name} has neighbors a half step apart: ${b.voicing}`);
        if (last && last.join() !== b.voicing.join()) {
          moved += b.voicing.reduce((sum, m, j) => sum + Math.abs(m - last[j]), 0) / 4;
          changes++;
        }
        last = b.voicing;
      }
      assert.ok(moved / Math.max(1, changes) <= 3.5, `${scene} ${level} moves ${moved / changes} semitones a voice`);
    }
  }
});

test('the band builds with rank: piano alone, then bass, kick, rim, snare, a few high notes', () => {
  const at = (level) => barsOf(21, 'work', level, 160);
  assert.equal(hits(at(0), 'kick') + hits(at(0), 'hat') + hits(at(0), 'rim') + hits(at(0), 'snare'), 0, 'Intern has no drums');
  assert.ok(hits(at(0), 'bass') > 0, 'Intern has bass');
  assert.ok(hits(at(1), 'kick') > 0 && hits(at(1), 'hat') > 0, 'level 1 adds kick and hat');
  assert.equal(hits(at(1), 'rim') + hits(at(1), 'snare'), 0, 'level 1 has no backbeat');
  assert.ok(hits(at(2), 'rim') > 0, 'level 2 adds a rim click');
  assert.equal(hits(at(2), 'snare'), 0, 'level 2 has no snare');
  assert.ok(hits(at(3), 'snare') > 0, 'level 3 adds a soft snare');
  for (const level of [0, 1, 2]) assert.equal(hits(at(level), 'lead'), 0, `level ${level} has no high notes`);
  assert.ok(hits(at(3), 'lead') > 0, 'level 3 adds a few high notes');
  const busy = (level) => at(level).reduce((sum, b) => sum + b.events.length, 0);
  assert.ok(busy(5) > busy(0) * 1.5, 'the top rank is fuller than the bottom');
});

test('menus are just the piano, and the Release has no backbeat or tune', () => {
  const calm = barsOf(31, 'calm', 0, 120);
  for (const inst of ['kick', 'snare', 'rim', 'hat', 'lead']) assert.equal(hits(calm, inst), 0, `calm has ${inst}`);
  assert.ok(calm.reduce((sum, b) => sum + b.events.length, 0) / calm.length <= 6, 'calm is sparse');
  const rel8 = barsOf(32, 'release', 3, 120);
  for (const inst of ['snare', 'rim', 'lead']) assert.equal(hits(rel8, inst), 0, `release has ${inst}`);
});

test('there is no tune to get stuck on: high notes are rare and eight bars never repeat', () => {
  const bars = barsOf(41, 'work', 5, 320);
  assert.ok(hits(bars, 'lead') / bars.length <= 1.2, `${hits(bars, 'lead') / bars.length} high notes a bar`);
  const seen = new Set();
  const noTime = bars.map((b) => JSON.stringify(b.events.map((e) => [e.inst, e.midi, Math.round(e.beat * 4)])));
  for (let i = 0; i + 8 <= noTime.length; i++) {
    const key = noTime.slice(i, i + 8).join('|');
    assert.ok(!seen.has(key), `the eight bars at ${i} repeat`);
    seen.add(key);
  }
  const progs = new Set();
  for (let i = 0; i < 64; i += 8) progs.add(bars.slice(i, i + 4).map((b) => b.name).join());
  assert.ok(progs.size >= 3, `only ${progs.size} chord patterns in 64 bars`);
});

test('a new scene or rank takes over on the very next bar', () => {
  const s = Score.create(4);
  s.setScene('work', 0);
  s.nextBar();
  s.setScene('release', 2);
  const next = s.nextBar();
  assert.equal(next.scene, 'release');
  assert.equal(next.level, 2);
  assert.equal(next.tonic, Score.keyPc(2));
  s.setScene('work', 3);
  assert.equal(s.nextBar().tonic, Score.keyPc(3));
});

test('each promotion lifts the key, so a higher rank sounds different', () => {
  assert.equal(new Set(LEVELS.map(Score.keyPc)).size, LEVELS.length);
});

/* ---------- the sounds ---------- */
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x) => Math.sqrt(x.reduce((m, v) => m + v * v, 0) / x.length);

function spectrum(x, sr) {
  let n = 1; while (n < x.length) n *= 2;
  n = Math.min(n, 1 << 16);
  const re = new Float64Array(n), im = new Float64Array(n);
  const len = Math.min(x.length, n);
  for (let i = 0; i < len; i++) re[i] = x[i] * (0.5 + 0.5 * Math.cos(Math.PI * i / len)); // keep the start: that is where a hit lives
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size *= 2) {
    const ang = -2 * Math.PI / size, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = i + k, b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
  const power = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  return { power, hz: sr / n };
}

/* How much of a sound is one steady pitch. A beep is nearly all one pitch and keeps going. */
function beepiness(x, sr) {
  const skip = Math.floor(0.06 * sr);
  const tail = x.subarray(skip);
  if (tail.length < 0.08 * sr) return 0;
  // A knock or a thud is over almost at once. Only judge a sound that still holds real energy after the hit.
  const energy = (y) => y.reduce((m, v) => m + v * v, 0);
  if (energy(tail) < energy(x) * 0.2) return 0;
  const { power, hz } = spectrum(tail, sr);
  let top = 0, total = 0;
  for (let i = 0; i < power.length; i++) { total += power[i]; if (power[i] > power[top]) top = i; }
  const band = Math.max(2, Math.round(top * hz * 0.03 / hz));
  let near = 0;
  for (let i = Math.max(0, top - band); i <= Math.min(power.length - 1, top + band); i++) near += power[i];
  return near / total;
}
const shareAbove = (x, sr, cut) => {
  const { power, hz } = spectrum(x, sr);
  let above = 0, total = 0;
  for (let i = 0; i < power.length; i++) { total += power[i]; if (i * hz >= cut) above += power[i]; }
  return above / total;
};

test('the beep check works: it flags a pure tone and two old game dings', () => {
  const sr = Dsp.FX_SR;
  const tone = (f, s) => Float32Array.from({ length: Math.floor(s * sr) }, (_, i) => Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / sr / s));
  assert.ok(beepiness(tone(988, 0.4), sr) > 0.8, 'sine');
  assert.ok(beepiness(tone(1319, 0.3), sr) > 0.8, 'ding');
});

test('every office sound renders clean: no bad numbers, no clipping, no click at the end', () => {
  assert.deepEqual([...Dsp.SFX_NAMES].sort(), ['check', 'door', 'key', 'knock', 'paper', 'slip', 'stamp', 'tap', 'tear', 'tick', 'tock']);
  for (const name of Dsp.SFX_NAMES) {
    for (let v = 0; v < Dsp.variants(name); v++) {
      const x = Dsp.fx(name, v);
      assert.ok(x.every(Number.isFinite), `${name} has a bad number`);
      assert.ok(peak(x) > 0.5 && peak(x) <= 1, `${name} peak ${peak(x)}`);
      assert.ok(Math.abs(x[x.length - 1]) < 0.002, `${name} ends with a click`);
      assert.ok(Math.abs(x[0]) < 0.05, `${name} starts with a click`);
    }
  }
});

test('office sounds are short, and only the door is allowed to linger', () => {
  for (const name of Dsp.SFX_NAMES) {
    const seconds = Dsp.fx(name, 0).length / Dsp.FX_SR;
    assert.ok(seconds <= (name === 'door' ? 1.1 : 0.5), `${name} lasts ${seconds}s`);
  }
});

test('nothing in the office is a beep', () => {
  for (const name of Dsp.SFX_NAMES) {
    for (let v = 0; v < Dsp.variants(name); v++) {
      const score = beepiness(Dsp.fx(name, v), Dsp.FX_SR);
      assert.ok(score < 0.6, `${name} scores ${score.toFixed(2)} as a beep`);
    }
  }
});

test('repeated sounds have variants, so forty stamps do not sound like one sample', () => {
  for (const name of ['stamp', 'paper', 'key', 'slip', 'tap', 'check']) {
    assert.ok(Dsp.variants(name) >= 2, `${name} has one variant`);
    assert.notDeepEqual(Dsp.fx(name, 0), Dsp.fx(name, 1), `${name} variants match`);
  }
});

test('effects can be heard on a phone speaker, which plays almost nothing below 300 Hz', () => {
  for (const name of Dsp.SFX_NAMES) {
    const share = shareAbove(Dsp.fx(name, 0), Dsp.FX_SR, 300);
    assert.ok(share >= 0.2, `${name} has only ${(share * 100).toFixed(0)}% of its energy above 300 Hz`);
  }
});

test('the piano is in tune and rings out cleanly on every sample', () => {
  for (const midi of Dsp.KEY_NOTES) {
    const x = Dsp.piano(midi);
    assert.ok(x.every(Number.isFinite), `piano ${midi} has a bad number`);
    assert.ok(peak(x) > 0.5 && peak(x) <= 1, `piano ${midi} peak ${peak(x)}`);
    assert.ok(Math.abs(x[x.length - 1]) < 0.002, `piano ${midi} ends with a click`);
    const target = 440 * Math.pow(2, (midi - 69) / 12);
    const n = Math.min(x.length, Math.floor(Dsp.KEYS_SR * 1.5));
    let best = 0, bestCents = 0;
    for (let cents = -12; cents <= 12; cents += 0.5) {
      const w = 2 * Math.PI * target * Math.pow(2, cents / 1200) / Dsp.KEYS_SR;
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) { re += x[i] * Math.cos(w * i); im += x[i] * Math.sin(w * i); }
      const m = re * re + im * im;
      if (m > best) { best = m; bestCents = cents; }
    }
    assert.ok(Math.abs(bestCents) <= 3, `piano ${midi} is ${bestCents} cents off`);
  }
});

test('the piano is soft felt, not a bright keyboard preset', () => {
  for (const midi of [51, 61, 71]) {
    const share = shareAbove(Dsp.piano(midi), Dsp.KEYS_SR, 3000);
    assert.ok(share < 0.02, `piano ${midi} has ${(share * 100).toFixed(1)}% of its energy above 3 kHz`);
  }
});

test('every played note is close to a sample, so nothing sounds stretched', () => {
  for (let midi = 33; midi <= 91; midi++) {
    const s = Dsp.nearest(Dsp.KEY_NOTES, midi);
    assert.ok(Math.abs(s - midi) <= 3, `${midi} plays from ${s}`);
  }
});

test('the bass and drums render clean and the room tone is very quiet', () => {
  for (const midi of Dsp.BASS_NOTES) {
    const x = Dsp.bass(midi);
    assert.ok(x.every(Number.isFinite) && peak(x) <= 1 && Math.abs(x[x.length - 1]) < 0.002, `bass ${midi}`);
    assert.ok(shareAbove(x, Dsp.KEYS_SR, 150) > 0.08 || midi > 40, `bass ${midi} has no overtones for small speakers`);
  }
  for (const name of Dsp.DRUM_NAMES) {
    for (let v = 0; v < Dsp.variants(name); v++) {
      const x = Dsp.fx(name, v);
      assert.ok(x.every(Number.isFinite) && peak(x) <= 1 && Math.abs(x[x.length - 1]) < 0.002, `${name} ${v}`);
    }
  }
  const room = Dsp.room();
  assert.ok(room.every(Number.isFinite));
  assert.ok(rms(room) < 0.08, `room rms ${rms(room)}`);
});

test('the reverb fades out on both sides and the sides differ', () => {
  const [l, r] = Dsp.impulse(44100);
  assert.equal(l.length, r.length);
  assert.notDeepEqual(l.subarray(2000, 2100), r.subarray(2000, 2100));
  const tail = l.subarray(Math.floor(l.length * 0.9));
  assert.ok(rms(tail) < rms(l.subarray(0, 8000)) * 0.03, 'tail is not quiet');
});
