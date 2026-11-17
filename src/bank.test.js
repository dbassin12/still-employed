'use strict';
// Run: node --test src/bank.test.js src/audio.test.js
// These tests recompute every answer with formulas written here, apart from bank.js,
// so a typo in the bank's math or a mismatched option fails instead of reaching a student.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('./bank2.js');
let guard = null;
try { guard = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'testbank-guard.local.json'), 'utf8')); } catch (e) { guard = null; }

const FORMULAS = {
  urate: ({ u, lf }) => u / lf * 100,
  lfpr: ({ lf, adults }) => lf / adults * 100,
  lf: ({ e, u }) => e + u,
  gdp: ({ c, i, g, x, m }) => c + i + g + x - m,
  xn: ({ x, m }) => x - m,
  income: ({ w, r, n, p }) => w + r + n + p,
  final: ({ prices }) => prices[prices.length - 1],
  va: ({ sale, bought }) => sale - bought,
  percap: ({ gdpB, popM }) => gdpB * 1e9 / (popM * 1e6),
  cpi: ({ now, base }) => now / base * 100,
  infl: ({ old, neu }) => (neu - old) / old * 100,
  realwage: ({ wage, cpi }) => wage / cpi * 100,
  convert: ({ price, a, b }) => price * b / a,
  basket: ({ q1, p1, q2, p2 }) => q1 * p1 + q2 * p2,
  basketchange: ({ q, a, b }) => { const cost = (p) => q.reduce((s, n, i) => s + n * p[i], 0); return (cost(b) - cost(a)) / cost(a) * 100; },
  basketindex: ({ q, a, b }) => { const cost = (p) => q.reduce((s, n, i) => s + n * p[i], 0); return cost(b) / cost(a) * 100; },
  realgdp: ({ nom, def }) => nom / def * 100,
  deflator: ({ nom, real }) => nom / real * 100,
  nominal: ({ real, def }) => real * def / 100,
  growth: ({ r1, r2 }) => (r2 - r1) / r1 * 100,
  onegood: ({ q2, pBase }) => q2 * pBase,
  cyclical: ({ actual, natural }) => actual - natural,
  natural: ({ f, s }) => f + s,
  gappct: ({ actual, potential }) => (actual - potential) / potential * 100,
  realrate: ({ i, pi }) => i - pi,
  wagechange: ({ pay, prices }) => pay - prices,
  cs: ({ wtp, price }) => wtp - price,
  ps: ({ price, min }) => price - min,
};

const every = B.everyTask(7);
// every word a student could see, wherever a task keeps it
const strings = (t) => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (k !== 'calc' && k !== 'check') walk(v[k]); });
  };
  walk(t);
  return out;
};

test('the bank is three times the size it was: 27 kinds of question and 2,295 or more tasks', () => {
  assert.equal(B.VERBS.length, 27, 'there should be 27 question types, not ' + B.VERBS.length);
  assert.ok(every.length >= 2295, 'only ' + every.length + ' tasks');
  for (const v of B.VERBS) assert.ok(every.filter((t) => t.verb === v).length >= 12, 'too few tasks use ' + v);
  for (const d of Object.keys(B.DESKS)) {
    const here = every.filter((t) => t.desk === d);
    assert.ok(here.length >= (d === 'micro' ? 40 : 150), d + ' has only ' + here.length);
    const types = new Set(here.map((t) => t.verb)).size;
    assert.ok(types >= (d === 'micro' ? 5 : 10), `${d} has only ${types} types of question`);
  }
});

test('every task id is unique', () => {
  const ids = new Set();
  for (const t of every) { assert.ok(!ids.has(t.id), 'duplicate id ' + t.id); ids.add(t.id); }
});

test('every task has the fields the game needs', () => {
  for (const t of every) {
    assert.ok(B.DESKS[t.desk], t.id + ' desk');
    assert.ok(B.VERBS.includes(t.verb), t.id + ' verb');
    assert.ok([1, 2, 3].includes(t.lvl), t.id + ' lvl');
    assert.ok(t.order && t.order.length <= 30, t.id + ' order too long: ' + t.order);
    assert.ok(t.why && t.why.length <= 140, t.id + ' why length ' + (t.why || '').length + ': ' + t.why);
    assert.ok(t.pay >= 1, t.id + ' pay');
    assert.ok(t.clock >= 4, t.id + ' clock');
  }
});

test('single-answer tasks have one valid answer and unique labels', () => {
  for (const t of every.filter((x) => ['stamp', 'sort', 'pick', 'town', 'chart', 'flow', 'truefalse', 'oddone', 'blank', 'word', 'compare', 'rows', 'badcell', 'bars'].includes(x.verb))) {
    assert.ok(Array.isArray(t.options) && t.options.length >= 2 && t.options.length <= 5, t.id + ' options');
    assert.ok(Number.isInteger(t.answer) && t.answer >= 0 && t.answer < t.options.length, t.id + ' answer');
    const labels = t.options.map((o) => o.label);
    assert.equal(new Set(labels).size, labels.length, t.id + ' repeated label: ' + labels.join(' | '));
    labels.forEach((l) => assert.ok(l.length <= 46, t.id + ' long label: ' + l));
  }
});

test('stamp tasks offer two choices and sort tasks three to five', () => {
  for (const t of every.filter((x) => x.verb === 'stamp')) assert.equal(t.options.length, 2, t.id);
  for (const t of every.filter((x) => x.verb === 'sort')) assert.ok(t.options.length >= 2 && t.options.length <= 5, t.id);
});

test('math tasks: the keyed answer matches a separate calculation', () => {
  const nums = every.filter((t) => t.calc && FORMULAS[t.calc.f]);
  assert.ok(nums.length >= 90, 'only ' + nums.length + ' math tasks');
  for (const t of nums) {
    const v = FORMULAS[t.calc.f](t.calc.in);
    assert.ok(Math.abs(v - t.calc.value) < 1e-6, `${t.id}: ${t.calc.f} gives ${v}, bank says ${t.calc.value}`);
    if (t.verb === 'pick') {
      assert.equal(t.options.length, 4, t.id + ' needs four numbers');
      assert.equal(t.options[t.answer].label, t.calc.shown, t.id + ' keyed option is not the computed value');
      t.options.forEach((o) => assert.ok(o.why && o.why.length <= 80, t.id + ' option needs a short reason: ' + o.label));
      assert.ok(t.work, t.id + ' needs worked math');
    }
  }
});

test('build tasks: the two tiles to tap are the right pair and give the computed value', () => {
  const builds = every.filter((t) => t.verb === 'build');
  assert.ok(builds.length >= 25, 'only ' + builds.length + ' build tasks');
  for (const t of builds) {
    assert.equal(t.tiles.length, 4, t.id);
    assert.equal(new Set(t.tiles.map((o) => o.label)).size, 4, t.id + ' repeated tile');
    assert.equal(t.answer.length, 2, t.id);
    const [top, bot] = t.answer.map((i) => t.tiles[i]);
    assert.ok(top && bot && top !== bot, t.id);
    const scale = t.build.scale;
    const got = top.v / bot.v * scale;
    assert.ok(Math.abs(got - t.calc.value) < 1e-6, `${t.id}: ${top.v} / ${bot.v} x ${scale} = ${got}, not ${t.calc.value}`);
  }
});

test('town tasks: the keyed arrows match the head count before and after', () => {
  const towns = every.filter((t) => t.verb === 'town');
  assert.ok(towns.length >= 14, 'only ' + towns.length);
  for (const t of towns) {
    const { e, u, n, from, to } = t.town;
    assert.equal(e + u + n, 100, t.id + ' town must hold 100 people');
    const after = { e, u, n };
    if (from !== to) { after[from]--; after[to]++; }
    const rate = (c) => c.u / (c.e + c.u) * 100, part = (c) => (c.e + c.u) / (c.e + c.u + c.n) * 100;
    const word = (a, b) => (Math.abs(a - b) < 1e-9 ? 'same' : b > a ? 'up' : 'down');
    const want = { rate: word(rate({ e, u, n }), rate(after)), lfpr: word(part({ e, u, n }), part(after)) };
    assert.deepEqual(t.options[t.answer].dir, want, t.id);
    const keys = t.options.map((o) => o.dir.rate + o.dir.lfpr);
    assert.equal(new Set(keys).size, keys.length, t.id + ' repeated arrows');
  }
});

test('cycle chart tasks: exactly one marker fits, checked on the curve itself', () => {
  const charts = every.filter((t) => t.verb === 'chart' && t.chart.kind === 'cycle');
  assert.ok(charts.length >= 20, 'only ' + charts.length);
  const h = 0.002;
  const facts = (phi, x) => {
    const a = B.wave.actual(x, phi), p = B.wave.potential(x);
    const slope = (B.wave.actual(x + h, phi) - B.wave.actual(x - h, phi)) / (2 * h);
    const gap = a - p;
    return {
      gap: Math.abs(gap) < 0.006 ? 'zero' : gap > 0 ? 'positive' : 'negative',
      phase: Math.abs(slope) < 0.012 ? (B.wave.actual(x + 0.04, phi) < a ? 'peak' : 'trough') : slope > 0 ? 'expansion' : 'contraction',
      gapSize: gap,
    };
  };
  const fits = {
    peak: (f) => f.phase === 'peak',
    trough: (f) => f.phase === 'trough',
    expansion: (f) => f.phase === 'expansion',
    contraction: (f) => f.phase === 'contraction',
    positive: (f) => f.gap === 'positive',
    negative: (f) => f.gap === 'negative',
    zero: (f) => f.gap === 'zero',
    'above-natural': (f) => f.gap === 'negative',
    'below-natural': (f) => f.gap === 'positive',
    'equal-natural': (f) => f.gap === 'zero',
    'falling-below': (f) => f.phase === 'contraction' && f.gap === 'negative',
    'rising-below': (f) => f.phase === 'expansion' && f.gap === 'negative',
    'rising-above': (f) => f.phase === 'expansion' && f.gap === 'positive',
    'falling-above': (f) => f.phase === 'contraction' && f.gap === 'positive',
  };
  for (const t of charts) {
    const list = t.chart.markers.map((m) => facts(t.chart.phi, m.x));
    t.chart.markers.forEach((m, i) => {
      assert.equal(list[i].gap, m.gap, `${t.id} marker ${i} gap`);
      assert.equal(list[i].phase, m.phase, `${t.id} marker ${i} phase`);
    });
    if (t.chart.pickOne) {
      const test = fits[t.chart.prop];
      assert.ok(test, t.id + ' unknown prop ' + t.chart.prop);
      const hits = list.map((f, i) => (test(f) ? i : -1)).filter((i) => i >= 0);
      assert.deepEqual(hits, [t.answer], `${t.id}: ${t.chart.prop} fits markers ${hits}, key is ${t.answer}`);
    } else {
      const m = t.chart.markers[t.chart.focus];
      const f = list[t.chart.focus];
      assert.ok(m, t.id + ' needs a focus marker');
      assert.equal(t.options[t.answer].label.toLowerCase(), t.chart.expect(f).toLowerCase(), t.id);
    }
  }
});

test('grab tasks: six chips with exactly three to tap', () => {
  const grabs = every.filter((t) => t.verb === 'grab');
  assert.ok(grabs.length >= 12, 'only ' + grabs.length);
  for (const t of grabs) {
    assert.equal(t.options.length, 6, t.id);
    assert.equal(new Set(t.options.map((o) => o.label)).size, 6, t.id + ' repeated chip');
    assert.equal(t.answer.length, 3, t.id);
    t.answer.forEach((i) => assert.ok(t.options[i], t.id));
    assert.equal(new Set(t.answer).size, 3, t.id);
  }
});

test('memo tasks: three lines, one bad, with a fix', () => {
  const memos = every.filter((t) => t.verb === 'memo');
  assert.ok(memos.length >= 24, 'only ' + memos.length);
  for (const t of memos) {
    assert.equal(t.lines.length, 3, t.id);
    assert.ok(Number.isInteger(t.answer) && t.answer >= 0 && t.answer < 3, t.id);
    t.lines.forEach((l) => assert.ok(l.length <= 84, t.id + ' long line: ' + l));
  }
});

test('true or false: True on the left, False on the right, one key', () => {
  const list = every.filter((t) => t.verb === 'truefalse');
  assert.ok(list.length >= 100, 'only ' + list.length);
  const counts = [0, 0];
  for (const t of list) {
    assert.deepEqual(t.options.map((o) => o.label), ['True', 'False'], t.id);
    assert.ok(t.text.length <= 120, t.id + ' long: ' + t.text);
    counts[t.answer]++;
  }
  assert.ok(Math.abs(counts[0] - counts[1]) <= list.length * 0.2, 'true and false should be about even: ' + counts);
});

test('odd one out: three share a tag and one does not', () => {
  const list = every.filter((t) => t.verb === 'oddone');
  assert.ok(list.length >= 60, 'only ' + list.length);
  for (const t of list) {
    assert.equal(t.options.length, 4, t.id);
    const odd = t.options[t.answer].tag;
    const others = t.options.filter((o, i) => i !== t.answer).map((o) => o.tag);
    assert.equal(new Set(others).size, 1, t.id + ' the other three should match: ' + others);
    assert.notEqual(odd, others[0], t.id);
  }
});

test('put in order: the key is a full sequence, and number orders are truly sorted', () => {
  const list = every.filter((t) => t.verb === 'order');
  assert.ok(list.length >= 30, 'only ' + list.length);
  for (const t of list) {
    assert.ok(t.options.length >= 3 && t.options.length <= 5, t.id);
    assert.deepEqual(t.answer.slice().sort((a, b) => a - b), t.options.map((_, i) => i), t.id);
    assert.equal(new Set(t.options.map((o) => o.label)).size, t.options.length, t.id + ' repeated item');
    if (t.check) {
      const vals = t.answer.map((i) => FORMULAS[t.check.f](t.check.inputs[i]));
      for (let i = 1; i < vals.length; i++) assert.ok(t.check.dir === 'asc' ? vals[i] > vals[i - 1] : vals[i] < vals[i - 1], `${t.id}: ${vals}`);
    }
  }
});

test('match: each left item has one partner on the right', () => {
  const list = every.filter((t) => t.verb === 'match');
  assert.ok(list.length >= 40, 'only ' + list.length);
  for (const t of list) {
    assert.equal(t.left.length, t.right.length, t.id);
    assert.ok(t.left.length >= 3 && t.left.length <= 4, t.id);
    assert.equal(new Set(t.left).size, t.left.length, t.id);
    assert.equal(new Set(t.right).size, t.right.length, t.id);
    assert.deepEqual(t.answer.slice().sort((a, b) => a - b), t.right.map((_, i) => i), t.id);
    assert.ok(t.right.every((x) => x.length <= 44), t.id + ' a long right label');
  }
});

test('fill the blank: one blank and four different choices', () => {
  const list = every.filter((t) => t.verb === 'blank');
  assert.ok(list.length >= 50, 'only ' + list.length);
  for (const t of list) {
    assert.equal(t.text.split('____').length, 2, t.id + ' needs exactly one blank');
    assert.equal(t.options.length, 4, t.id);
  }
});

test('tap the wrong word: candidates come from the sentence and the fix is different', () => {
  const list = every.filter((t) => t.verb === 'word');
  assert.ok(list.length >= 35, 'only ' + list.length);
  for (const t of list) {
    assert.ok(t.options.length >= 3, t.id + ' needs at least three words to choose from');
    t.options.forEach((o) => assert.ok(t.parts.some((p) => p.w === o.label), t.id));
    assert.ok(t.fix && t.fix !== t.options[t.answer].label, t.id);
  }
});

test('compare: the keyed card has the bigger value, by a separate calculation', () => {
  const list = every.filter((t) => t.verb === 'compare');
  assert.ok(list.length >= 60, 'only ' + list.length);
  for (const t of list) {
    assert.equal(t.cards.length, 2, t.id);
    const vals = t.cards.map((c) => FORMULAS[c.calc.f](c.calc.in));
    t.cards.forEach((c, i) => assert.ok(Math.abs(vals[i] - c.calc.value) < 1e-6, t.id));
    assert.ok(Math.abs(vals[0] - vals[1]) > 1e-6, t.id + ' a tie: ' + vals);
    const want = t.want === 'lower' ? (vals[0] < vals[1] ? 0 : 1) : (vals[0] > vals[1] ? 0 : 1);
    assert.equal(t.answer, want, `${t.id}: ${vals}`);
  }
});

test('type the answer: the value recomputes, and no named mistake sits inside the tolerance', () => {
  const list = every.filter((t) => t.verb === 'type');
  assert.ok(list.length >= 100, 'only ' + list.length);
  for (const t of list) {
    const v = FORMULAS[t.calc.f](t.calc.in);
    assert.ok(Math.abs(v - t.calc.value) < 1e-6, t.id);
    assert.ok(t.tol > 0, t.id);
    (t.wrongVals || []).forEach((w) => assert.ok(Math.abs(w.v - t.calc.value) > t.tol, `${t.id}: ${w.v} is within tolerance`));
  }
});

test('set the dial: the answer is on the dial and the start is not the answer', () => {
  const list = every.filter((t) => t.verb === 'dial');
  assert.ok(list.length >= 40, 'only ' + list.length);
  for (const t of list) {
    const v = FORMULAS[t.calc.f](t.calc.in);
    assert.ok(Math.abs(v - t.calc.value) < 1e-6, t.id);
    assert.ok(v >= t.dial.min && v <= t.dial.max, `${t.id}: ${v} is off the dial`);
    const steps = (v - t.dial.min) / t.dial.step;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${t.id}: ${v} is not on a ${t.dial.step} step`);
    assert.ok(Math.abs(t.dial.start - v) > t.tol, t.id + ' starts on the answer');
  }
});

test('set the arrows: every row has one of three answers', () => {
  const list = every.filter((t) => t.verb === 'arrows');
  assert.ok(list.length >= 30, 'only ' + list.length);
  for (const t of list) {
    assert.ok(t.rows.length >= 2 && t.rows.length <= 3, t.id);
    t.rows.forEach((r) => assert.ok(['up', 'same', 'down'].includes(r.answer), t.id));
  }
});

const ROW_TESTS = {
  realfell: (d) => d.nominal.map((n, i) => (i ? n / d.deflator[i] < d.nominal[i - 1] / d.deflator[i - 1] : false)),
  baseyear: (d) => d.deflator.map((x) => x === 100),
  equal: (d) => d.nominal.map((n, i) => n === d.real[i]),
  highinfl: (d) => { const r = d.cpi.map((c, i) => (i ? (c - d.cpi[i - 1]) / d.cpi[i - 1] : -9)); const m = Math.max(...r); return r.map((x) => x === m); },
  deflation: (d) => d.cpi.map((c, i) => (i ? c < d.cpi[i - 1] : false)),
  disinflation: (d) => { const r = d.cpi.map((c, i) => (i ? (c - d.cpi[i - 1]) / d.cpi[i - 1] : null)); return r.map((x, i) => (i > 1 ? x > 0 && x < r[i - 1] : false)); },
  highu: (d) => { const r = d.e.map((e, i) => d.u[i] / (e + d.u[i])); const m = Math.max(...r); return r.map((x) => x === m); },
  negative: (d) => d.u.map((u) => u > d.natural),
  positive: (d) => d.u.map((u) => u < d.natural),
  atnatural: (d) => d.u.map((u) => u === d.natural),
  peak: (d) => d.real.map((x) => x === Math.max(...d.real)),
  trough: (d) => d.real.map((x) => x === Math.min(...d.real)),
  contraction: (d) => d.growth.map((g) => g < 0),
  deflationbar: (d) => d.rate.map((g) => g < 0),
  disinflationbar: (d) => d.rate.map((g, i) => (i ? g > 0 && g < d.rate[i - 1] : false)),
  negativebar: (d) => d.rate.map((u) => u > d.natural),
  positivebar: (d) => d.rate.map((u) => u < d.natural),
  basebar: (d) => d.rate.map((x) => x === 100),
};

test('tap the row and read the bars: exactly one row or bar fits, by a separate check', () => {
  const list = every.filter((t) => t.verb === 'rows' || t.verb === 'bars');
  assert.ok(list.length >= 60, 'only ' + list.length);
  for (const t of list) {
    const fits = ROW_TESTS[t.check.kind](t.check);
    const hits = fits.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(hits, [t.answer], `${t.id} (${t.check.kind}) fits ${hits}, key ${t.answer}`);
  }
});

test('find the bad number: exactly one row fails a separate calculation', () => {
  const list = every.filter((t) => t.verb === 'badcell');
  assert.ok(list.length >= 30, 'only ' + list.length);
  for (const t of list) {
    const wrong = t.check.inputs.map((inp, i) => Math.abs(FORMULAS[t.check.f](inp) - t.check.shown[i]) > t.check.tol);
    assert.deepEqual(wrong.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [t.answer], t.id);
  }
});

test('sort the pile: every card has a bin', () => {
  const list = every.filter((t) => t.verb === 'pile');
  assert.ok(list.length >= 50, 'only ' + list.length);
  for (const t of list) {
    assert.ok(t.cards.length >= 3 && t.cards.length <= 5, t.id);
    assert.equal(t.options.length, 2, t.id);
    assert.equal(new Set(t.cards.map((c) => c.t)).size, t.cards.length, t.id + ' repeated card');
    t.cards.forEach((c) => { assert.ok(c.bin === 0 || c.bin === 1, t.id); assert.ok(c.y, t.id + ' card needs a reason'); });
    assert.equal(new Set(t.cards.map((c) => c.bin)).size, 2, t.id + ' should use both bins');
  }
});

test('tap the wave: the target zones really fit the curve', () => {
  const list = every.filter((t) => t.verb === 'wave');
  assert.ok(list.length >= 25, 'only ' + list.length);
  const h = 0.002;
  const facts = (phi, x) => {
    const a = B.wave.actual(x, phi), p = B.wave.potential(x);
    const slope = (B.wave.actual(x + h, phi) - B.wave.actual(x - h, phi)) / (2 * h);
    return { gap: a - p, slope };
  };
  for (const t of list) {
    assert.ok(t.zones.length >= 1, t.id);
    for (const [x0, x1] of t.zones) {
      assert.ok(x1 > x0 && x0 >= 0 && x1 <= 1, t.id);
      const mid = facts(t.chart.phi, (x0 + x1) / 2);
      if (t.prop === 'contraction') assert.ok(mid.slope < 0, t.id);
      if (t.prop === 'expansion') assert.ok(mid.slope > 0, t.id);
      if (t.prop === 'above') assert.ok(mid.gap > 0, t.id);
      if (t.prop === 'below') assert.ok(mid.gap < 0, t.id);
      if (t.prop === 'peak' || t.prop === 'trough') {
        const c = (x0 + x1) / 2, a = B.wave.actual(c, t.chart.phi);
        assert.ok(t.prop === 'peak' ? a > B.wave.actual(c - 0.05, t.chart.phi) && a > B.wave.actual(c + 0.05, t.chart.phi) : a < B.wave.actual(c - 0.05, t.chart.phi) && a < B.wave.actual(c + 0.05, t.chart.phi), t.id);
      }
    }
  }
});

test('finish the sentence: two blanks, each with one right choice', () => {
  const list = every.filter((t) => t.verb === 'frq');
  assert.ok(list.length >= 20, 'only ' + list.length);
  for (const t of list) {
    assert.ok(t.text.includes('{0}') && t.text.includes('{1}'), t.id);
    assert.equal(t.blanks.length, 2, t.id);
    t.blanks.forEach((b) => { assert.ok(b.options.length >= 2 && b.options[b.answer], t.id); assert.equal(new Set(b.options).size, b.options.length, t.id); });
  }
});

test('label it: each step points at a real label', () => {
  const list = every.filter((t) => t.verb === 'label');
  assert.ok(list.length >= 20, 'only ' + list.length);
  for (const t of list) {
    assert.ok(t.steps.length >= 3 && t.steps.length <= 4, t.id);
    t.steps.forEach((st) => assert.ok(t.options[st.answer], t.id));
    assert.equal(new Set(t.options.map((o) => o.label)).size, t.options.length, t.id);
    if (t.diagram === 'cycle') t.steps.forEach((st) => { const m = t.chart.markers[st.spot]; if (m && m.phase) assert.equal(t.options[st.answer].label.toLowerCase(), m.phase, t.id); });
  }
});

test('AP style: a full stem and five different choices', () => {
  const list = every.filter((t) => t.verb === 'ap');
  assert.ok(list.length >= 50, 'only ' + list.length);
  const seen = new Set();
  for (const t of list) {
    assert.ok(t.text.length >= 25 && t.text.length <= 260, t.id + ' stem length ' + t.text.length);
    assert.equal(t.options.length, 5, t.id);
    assert.equal(new Set(t.options.map((o) => o.label)).size, 5, t.id);
    t.options.forEach((o) => assert.ok(o.label.length <= 96, t.id + ' long choice: ' + o.label));
    assert.ok(Number.isInteger(t.answer) && t.options[t.answer], t.id);
    assert.ok(!/\b(A|B|C|D|E)\)|\(A\)|\(B\)|\(C\)|\(D\)|\(E\)/.test(t.why), t.id + ' why should not name a letter; choices are shuffled');
    seen.add(t.answer);
  }
  assert.ok(seen.size >= 4, 'keys should land on most letters');
});

test('flow tasks use the four arrows on the review sheet', () => {
  const flows = every.filter((t) => t.verb === 'flow');
  assert.ok(flows.length >= 10, 'only ' + flows.length);
  for (const t of flows) {
    assert.equal(t.options.length, 4, t.id);
    assert.deepEqual(t.options.map((o) => o.label), ['Goods and services', 'Consumption expenditures', 'Factors of production', 'Wages, rent, interest, profit'], t.id);
  }
});

test('words follow the house rules', () => {
  const rules = [
    [/[–—]/, 'em or en dash'],
    [/casino|\bdice\b|wager|\bbets?\b|gambl/i, 'gambling word'],
    [/shrimp|pork|bacon|lobster|cheeseburger|\bham\b/i, 'not kosher'],
    [/saturday/i, 'implies work on Shabbos'],
    [/cousin|friend/i, 'check for ribbis: a loan needs a bank, firm, or government on one side'],
  ];
  for (const t of every) for (const s of strings(t)) for (const [re, why] of rules) assert.ok(!re.test(s), `${t.id}: ${why}: ${s}`);
});

test('no number on any task shows a long decimal', () => {
  for (const t of every) for (const str of strings(t)) assert.ok(!/\d\.\d{4,}/.test(str), `${t.id}: ${str}`);
});

test('boss chains stay consistent from step to step', () => {
  for (let tier = 0; tier < 4; tier++) {
    for (let seed = 1; seed < 40; seed++) {
      const steps = B.boss(tier, B.rng(seed));
      assert.ok(steps.length >= 2 && steps.length <= 5, 'tier ' + tier + ' has ' + steps.length + ' steps');
      for (const s of steps) {
        assert.ok(s.table && s.table.length >= 2, s.id + ' needs its table');
        assert.ok(s.part, s.id + ' needs a step label');
        assert.ok(Number.isInteger(s.answer) && s.options[s.answer], s.id);
        if (s.calc && FORMULAS[s.calc.f]) {
          const v = FORMULAS[s.calc.f](s.calc.in);
          assert.ok(Math.abs(v - s.calc.value) < 1e-6, `${s.id} ${s.calc.f}`);
          assert.equal(s.options[s.answer].label, s.calc.shown, s.id);
        }
        strings(s).forEach((x) => assert.ok(!/[–—]/.test(x), s.id + ' dash'));
      }
    }
  }
});

// Details of the real test stay out of this public file. tools/testbank-guard.local.json is ignored by git.
// Where that file is absent (anyone else's copy), this check has nothing to compare and skips itself.
test('nothing is too close to the private test bank guard', { skip: !guard }, () => {
  const phrases = guard.phrases.map((x) => new RegExp(x, 'i'));
  for (const t of every) {
    for (const str of strings(t)) for (const re of phrases) assert.ok(!re.test(str), `${t.id}: too close to the test: ${str}`);
    if (t.calc && t.calc.f === 'lfpr') guard.lfpr.forEach(([lf, adults]) => assert.ok(!(t.calc.in.lf === lf && t.calc.in.adults === adults), t.id));
    if (t.calc && t.calc.f === 'gdp') guard.gdpC.forEach((c) => assert.notEqual(t.calc.in.c, c, t.id));
    if (t.calc && t.calc.f === 'nominal') guard.nominal.forEach(([re, d]) => assert.ok(!(t.calc.in.real === re && t.calc.in.def === d), t.id));
    if (t.calc && t.calc.f === 'realwage') (guard.realwage || []).forEach(([w, c]) => assert.ok(!(t.calc.in.wage === w && t.calc.in.cpi === c), t.id));
  }
});

test('which line is nominal: the key is not always the same line', () => {
  const lines = every.filter((t) => t.kind === 'whichline');
  assert.equal(new Set(lines.map((t) => t.answer)).size, 2);
});

test('the frq chain reads the same way the review sheet does', () => {
  const steps = B.boss(3, B.rng(11));
  assert.equal(steps.length, 5);
  const real = steps[0].calc.value;
  const y1 = steps[0].calc.nom1;
  const produced = steps[2].options[steps[2].answer].label;
  assert.equal(produced, real > y1 ? 'Yes, more' : 'No, less');
  const phase = steps[3].options[steps[3].answer].label;
  assert.equal(phase, real > y1 ? 'Expansion' : 'Contraction');
});

test('the scheduler rotates tasks and desks and brings misses back', () => {
  for (let seed = 1; seed < 8; seed++) {
    const sch = B.scheduler(B.rng(seed), { seen: new Set() });
    let last = null;
    const ids = new Set(), desks = new Set();
    for (let i = 0; i < 40; i++) {
      const t = sch.next(i < 20 ? 1 : 4);
      assert.ok(!ids.has(t.id), 'repeat ' + t.id);
      ids.add(t.id);
      desks.add(t.desk);
      if (last) assert.equal(t.verb === last.verb, false, `same task type twice in a row: ${t.verb}`);
      if (last) assert.ok(t.desk !== last.desk, `same desk twice: ${t.desk}`);
      last = t;
    }
    ['gdp', 'miss', 'jobs', 'prices', 'costs', 'real', 'cycle'].forEach((d) => assert.ok(desks.has(d), 'never saw ' + d));
    const missed = sch.next(2);
    sch.miss(missed);
    let back = false;
    for (let i = 0; i < 7; i++) { const t = sch.next(2); if (t.id === missed.id) back = true; }
    assert.ok(back, 'a missed task should return within 7 tasks');
  }
});

test('a shift feels varied: at least five task types in any six tasks', () => {
  for (let seed = 1; seed < 30; seed++) {
    const sch = B.scheduler(B.rng(seed), { seen: new Set() });
    const verbs = [];
    for (let i = 0; i < 24; i++) verbs.push(sch.next(i < 12 ? 0 : 2).verb);
    for (let i = 0; i + 6 <= verbs.length; i++) {
      const n = new Set(verbs.slice(i, i + 6)).size;
      assert.ok(n >= 5, `seed ${seed} at ${i}: only ${n} types in ${verbs.slice(i, i + 6)}`);
    }
  }
});

test('a winning shift uses a wide mix of question types and a tiny slice of the bank', () => {
  for (let seed = 1; seed < 12; seed++) {
    const sch = B.scheduler(B.rng(seed), { seen: new Set() });
    const verbs = new Set();
    for (let rank = 0; rank < 6; rank++) for (let i = 0; i < 6; i++) verbs.add(sch.next(rank).verb);
    assert.ok(verbs.size >= 14, `seed ${seed}: only ${verbs.size} types in 36 tasks`);
  }
  assert.ok(36 / every.length < 0.02, 'a win should use under 2% of the bank');
});

test('two shifts are dealt differently', () => {
  const deal = (seed) => { const sch = B.scheduler(B.rng(seed), { seen: new Set() }); return Array.from({ length: 12 }, (_, i) => sch.next(i < 6 ? 0 : 1).id); };
  for (let seed = 1; seed < 15; seed++) {
    const a = deal(seed), b = new Set(deal(seed + 100));
    const same = a.filter((id) => b.has(id)).length;
    assert.ok(same <= 3, `seeds ${seed} and ${seed + 100} share ${same} of 12 tasks`);
  }
});

test('answer positions are mixed: the right answer is not always in the same place', () => {
  for (const kind of ['counted', 'type', 'effect', 'memo', 'nameit', 'realnom']) {
    const here = [];
    for (let seed = 1; seed < 6; seed++) here.push(...B.everyTask(seed).filter((t) => t.kind === kind));
    assert.ok(new Set(here.map((t) => t.answer)).size >= 2, `${kind} always keys the same position`);
  }
});

test('the class game can leave out the long question types', () => {
  const sch = B.scheduler(B.rng(4), { seen: new Set(), skipVerbs: ['ap', 'badcell', 'm-basket'] });
  for (let i = 0; i < 40; i++) { const t = sch.next(i < 10 ? 1 : 3); assert.ok(t.verb !== 'ap' && t.verb !== 'badcell', t.id); }
  // a single kind can be left out by its id: the basket table is too long for one turn in the class game
  for (const seed of [5, 6, 7, 8]) {
    const cup = B.scheduler(B.rng(seed), { seen: new Set(), skipVerbs: ['ap', 'badcell', 'm-basket'] });
    for (let i = 0; i < 60; i++) assert.notEqual(cup.next(3).kind, 'm-basket');
  }
});

test('rank 0 only deals easy tasks', () => {
  const sch = B.scheduler(B.rng(3), { seen: new Set() });
  for (let i = 0; i < 12; i++) assert.equal(sch.next(0).lvl, 1);
});

test('clocks are generous, and stay fair at the top rank', () => {
  // Teacher feedback, Nov 5, 2026: "too fast", then at 18 seconds a stamp and 42 for math, "still a little too fast".
  const floor = { stamp: 20, sort: 20, chart: 20, flow: 20, town: 24, grab: 26, build: 28, memo: 28, pick: 55,
    truefalse: 20, oddone: 24, order: 28, match: 34, blank: 22, word: 24, compare: 28, type: 60, dial: 45, arrows: 30, rows: 28, pile: 36, wave: 20, frq: 30, bars: 24, badcell: 50, label: 36, ap: 60 };
  const top = B.RANKS[B.RANKS.length - 1].speed;
  assert.ok(top >= 0.8, 'the top rank should keep at least 80% of the clock, not ' + top);
  for (const t of every) {
    assert.ok(t.clock >= floor[t.verb], `${t.id}: ${t.clock}s is under ${floor[t.verb]}s for a ${t.verb}`);
    if (t.verb === 'pick' || t.verb === 'type') assert.ok(t.clock * top >= 44, `${t.id}: math at the top rank gets only ${t.clock * top}s`);
    else assert.ok(t.clock * top >= 16, `${t.id}: only ${t.clock * top}s at the top rank`);
  }
});

test('pay: faster and longer streaks pay more and round to ten dollars', () => {
  const slow = B.payFor({ base: 100, mult: 1, left: 0, streak: 0 });
  const fast = B.payFor({ base: 100, mult: 1, left: 1, streak: 0 });
  const hot = B.payFor({ base: 100, mult: 1, left: 1, streak: 6 });
  assert.equal(slow, 100);
  assert.equal(fast, 150);
  assert.equal(hot, 300);
  assert.equal(B.payFor({ base: 150, mult: 1.5, left: 0.33, streak: 3 }) % 10, 0);
});

test('real pay: the options are the real mistakes and the key is pay over CPI', () => {
  for (const [pay, cpi] of [[3200, 120], [18400, 130], [950, 110], [40000, 160], [12340, 105]]) {
    const q = B.realPayQuestion(pay, cpi, B.rng(pay));
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.label)).size, 4, `${pay} ${cpi}: ` + q.options.map((o) => o.label));
    assert.equal(q.value, Math.round(pay / cpi * 100 / 10) * 10);
    assert.equal(q.options[q.answer].label, B.fmt.usd(q.value));
  }
});

test('match: the two columns are never dealt already lined up', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const list = B.everyTask(seed).filter((t) => t.verb === 'match');
    assert.ok(list.length > 0);
    for (const t of list) assert.ok(!t.answer.every((r, i) => r === i), `${t.id} is lined up straight across`);
  }
});

test('label: points on the wave sit far enough apart that their names do not collide', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const list = B.everyTask(seed).filter((t) => t.verb === 'label' && t.diagram === 'cycle');
    assert.ok(list.length > 0);
    for (const t of list) {
      const xs = t.chart.markers.map((m) => m.x).sort((a, b) => a - b);
      xs.forEach((x, i) => { if (i) assert.ok(x - xs[i - 1] >= 0.14, `${t.id}: ${xs}`); });
    }
  }
});

test('order: no step list leaves two steps that could honestly swap', () => {
  const swappable = [/Find the firm's sales/, /Find what it bought from other firms/, /each country's population/, /Add C, I, and G/, /Find its cost in the base year/, /Find real GDP at base-year prices/];
  for (const t of B.everyTask(3).filter((x) => x.verb === 'order')) {
    for (const o of t.options) for (const re of swappable) assert.ok(!re.test(o.label), `${t.id}: ${o.label}`);
  }
});

test('odd one out: all four options are the same kind of thing, so only one answer can be defended', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const t of B.everyTask(seed).filter((x) => x.verb === 'oddone')) {
      const labels = t.options.map((o) => o.label);
      if (t.desk === 'micro' && labels.some((l) => /elastic|Buyers|substitut|needs|pizza|sneaker|inhaler|medicine|Gas|gas/i.test(l))) assert.ok(!labels.some((l) => /%/.test(l)), `${t.id}: ${labels}`);
      if (t.desk === 'real') assert.ok(!labels.some((l) => /\b(pay|rate|raise)\b/i.test(l)), `${t.id}: ${labels}`);
      if (t.options.some((o) => o.tag === B.BIN.G.label)) assert.ok(!labels.some((l) => /gift/i.test(l)), `${t.id}: ${labels}`);
      if (t.desk === 'costs' && t.options.some((o) => /Gains|Loses|Protected/.test(o.tag || ''))) assert.match(t.ask, /Surprise inflation/, t.id);
    }
  }
});

test('house rules: no task implies work every day of the week, and a loan names a bank', () => {
  for (const t of B.everyTask(4)) {
    for (const str of strings(t)) {
      assert.ok(!/every day|seven days|Saturdays?\b/i.test(str), `${t.id}: ${str}`);
      assert.ok(!/so the lender\b/i.test(str), `${t.id}: ${str}`);
      assert.ok(!/^A \d+% loan\b/.test(str), `${t.id}: ${str}`);
    }
  }
});

test('type prompts read cleanly', () => {
  for (const t of B.everyTask(2)) {
    if (t.ask) assert.ok(!/[?!.]\./.test(t.ask), `${t.id}: ${t.ask}`);
    if (t.order === 'REAL GROWTH?') assert.ok(!/^In billions|\. In billions/.test(t.ask), `${t.id}: ${t.ask}`);
  }
});

// ================= test-style tables (added Nov 16, 2026) =================
// Recomputed here from the table rows the student sees, not from the bank's records.
const num = (s) => Number(String(s).replace(/−/g, '-').replace(/[$,%]|billion|million/g, '').trim());
const SPEND = /^(Consumption spending|Personal consumption expenditures|Household consumption|Gross private domestic investment|Investment spending|Private investment|Government purchases|Exports|Imports|Net exports)$/;
const INCOME = /^(Wages|Rent|Interest|Profit|Employee compensation)$/;
const drillTasks = every.filter((t) => B.KINDS.find((k) => k.id === t.kind).drill);

test('test-style tables: every drill kind deals, and there are enough of them', () => {
  const kinds = new Set(drillTasks.map((t) => t.kind));
  ['m-gdp', 'm-mixed', 'm-income', 'm-urate', 'm-lfpr', 'm-lfu', 'm-gapcall', 'm-gapword', 'm-stock', 'm-basket'].forEach((k) => assert.ok(kinds.has(k), k + ' is missing'));
  assert.ok(drillTasks.length >= 66, 'only ' + drillTasks.length + ' drill tasks');
});

test('test-style tables: the key uses only the right rows, and some rows are left out', () => {
  for (const t of drillTasks.filter((x) => x.verb === 'pick')) {
    const rows = t.table.map(([l, v]) => [l, num(v)]);
    let want;
    if (t.kind === 'm-gdp' || t.kind === 'm-mixed') {
      const used = rows.filter(([l]) => SPEND.test(l));
      want = used.reduce((s, [l, v]) => s + (l === 'Imports' ? -v : v), 0);
      assert.ok(used.length < rows.length, t.id + ' has no rows to leave out');
    } else if (t.kind === 'm-income') {
      const used = rows.filter(([l]) => INCOME.test(l));
      want = used.reduce((s, [, v]) => s + v, 0);
      assert.ok(used.length < rows.length, t.id + ' has no rows to leave out');
    } else if (t.kind === 'm-urate') {
      const u = rows.find(([l]) => l === 'Unemployed')[1], e = rows.find(([l]) => l === 'Employed')[1];
      want = u / (u + e) * 100;
    } else if (t.kind === 'm-lfpr') {
      const u = rows.find(([l]) => l === 'Unemployed')[1], e = rows.find(([l]) => l === 'Employed')[1];
      want = (u + e) / rows[1][1] * 100;
    } else if (t.kind === 'm-lfu') {
      const lf = rows.find(([l]) => l === 'Labor force')[1], e = rows.find(([l]) => l === 'Employed')[1];
      want = (lf - e) / lf * 100;
    } else if (t.kind === 'm-basket') {
      // item, quantity, Year 1 price, Year 2 price: cost the same basket in each year
      assert.deepEqual(t.thead, ['Item', 'Quantity', 'Year 1', 'Year 2'], t.id);
      assert.equal(t.table.length, 3, t.id + ' should have three items');
      const y1 = t.table.reduce((s, r) => s + num(r[1]) * num(r[2]), 0), y2 = t.table.reduce((s, r) => s + num(r[1]) * num(r[3]), 0);
      want = /CHANGE/.test(t.order) ? (y2 - y1) / y1 * 100 : y2 / y1 * 100;
      assert.ok(Number.isInteger(y1) && Number.isInteger(y2) && y1 !== y2, t.id);
      assert.ok(Math.abs(want * 2 - Math.round(want * 2)) < 1e-9, `${t.id}: ${want} is not a clean answer`);
      assert.ok(t.table.some((r) => num(r[2]) !== num(r[3])) && new Set(t.table.map((r) => r[1])).size > 1, t.id + ': the quantities should matter');
      assert.ok(t.clock >= 100, t.id + ' needs a long clock');
    } else assert.fail(t.id + ' has no check here');
    assert.ok(Math.abs(want - t.calc.value) < 1e-6, `${t.id}: rows give ${want}, bank says ${t.calc.value}`);
    assert.equal(t.options[t.answer].label, t.calc.shown, t.id);
    t.options.filter((o, i) => i !== t.answer).forEach((o) => assert.notEqual(o.why, 'Check the arithmetic.', `${t.id}: ${o.label} has no named mistake`));
  }
});

test('test-style tables: the gap call matches the unemployment rate the student can work out', () => {
  const KEY = { 'Recessionary gap': 1, 'Inflationary gap': -1, 'Full employment': 0 };
  for (const t of drillTasks.filter((x) => x.kind === 'm-gapcall')) {
    let lf, e, nat;
    if (t.table) { lf = num(t.table[0][1]); e = num(t.table[1][1]); nat = num(t.table[2][1]); }
    else { [lf, e, nat] = (t.text.match(/\d+(?:\.\d+)?/g) || []).map(Number); }
    const u = Math.round((lf - e) / lf * 1000) / 10;
    assert.equal(KEY[t.options[t.answer].label], Math.sign(u - nat), `${t.id}: ${u}% v. ${nat}%`);
  }
});

test('the Test tables practice topic deals only drill kinds, and reaches all of them', () => {
  const r = B.rng(11), seen = new Set(), got = new Set();
  for (let i = 0; i < 400; i++) {
    const t = B.trainingTask(B.DRILL.key, r, seen);
    assert.ok(B.KINDS.find((k) => k.id === t.kind).drill, t.id + ' is not a drill task');
    got.add(t.kind);
  }
  assert.equal(got.size, B.KINDS.filter((k) => k.drill).length);
});

test('test-style tables share no more than two numbers with any table on the real test', { skip: !guard || !guard.tables }, () => {
  for (const t of drillTasks.filter((x) => x.table)) {
    const mine = new Set(t.table.flatMap((row) => row.slice(1).map(num)));
    for (const real of guard.tables) {
      const same = real.filter((v) => mine.has(v)).length;
      assert.ok(same <= 2, `${t.id} shares ${same} numbers with a test table`);
    }
  }
});

test('a table with a heading row has a cell under every heading, and a plain table has two', () => {
  for (const t of every.filter((x) => x.table)) {
    const width = t.thead ? t.thead.length : 2;
    t.table.forEach((row) => assert.equal(row.length, width, `${t.id}: a row has ${row.length} cells, not ${width}`));
  }
  assert.ok(every.some((t) => t.thead), 'no grid table was dealt');
});

test('savers, turning points, growth rates, and cleanup: the thin spots have practice', () => {
  const text = (t) => [t.text, t.options && t.options[t.answer] && t.options[t.answer].label, t.why].join(' ');
  const count = (re, kinds) => every.filter((t) => (!kinds || kinds.test(t.kind)) && re.test(text(t))).length;
  // a saver is a lender, and the bank that owes the saver is the borrower
  const keyOf = (kindId, re) => { const t = every.find((x) => x.kind === kindId && re.test(x.text)); return t.options[t.answer].label; };
  assert.equal(keyOf('deflation', /saver with a fixed-rate savings account/), 'Gains');
  assert.equal(keyOf('deflation', /owes its savers/), 'Loses');
  assert.equal(keyOf('effect', /owes its savers/), 'Gains'); // the same bank, when prices rise instead
  assert.ok(count(/saver/i, /^(deflation|ap-costs|tf-costs)$/) >= 5, 'savers under deflation');
  // the gap at a turning point, in words
  assert.ok(count(/trough|lowest point|bottom of the business cycle/i, /^(m-gapword|ap-cycle|tf-cycle)$/) >= 8, 'the gap at a trough');
  // the price level from nominal and real growth
  assert.ok(every.filter((t) => t.kind === 'apn-pricegrowth').length >= 6);
  // paid cleanup counts, free goods do not
  assert.ok(count(/clean|repair|rebuild/i, /^(counted|line|ap-miss|tf-miss|miss|blank-miss)$/) >= 8, 'cleanup and repairs');
  assert.ok(count(/free (apps|map app|online)/i, /^(ap-miss|tf-miss)$/) >= 2, 'free digital goods');
  // the CPI from a whole basket, as a table and as an AP style question
  assert.ok(every.filter((t) => t.kind === 'm-basket').length >= 8 && every.filter((t) => t.kind === 'apn-basket').length >= 6);
});

/* ---------- the calculator ---------- */
test('calculator: order of operations, parentheses, and the minus sign', () => {
  const cases = [
    ['600+140+210+(70−95)', 925], ['2+3×4', 14], ['(2+3)×4', 20], ['(162−150)÷150×100', 8],
    ['−5+3', -2], ['5×−2', -10], ['3−−2', 5], ['1.5×4', 6], ['.5+.5', 1], ['36÷144×100', 25],
    ['1,800÷120×100', 1500], ['10−4−3', 3], ['100÷5÷2', 10], ['((1+2))×3', 9], ['8 × ( 2 + 1 )', 24],
  ];
  for (const [e, want] of cases) assert.ok(Math.abs(B.calcEval(e) - want) < 1e-9, `${e} should be ${want}, got ${B.calcEval(e)}`);
});
test('calculator: anything it cannot read is an Error, never a guess', () => {
  for (const e of ['', '1÷0', '5÷(2−2)', '2×', '×2', '((2)', '2)', '1..2', 'abc', '2^3', 'alert(1)', '1e5']) {
    assert.equal(B.calcEval(e), null, `${e} should not compute`);
  }
  assert.equal(B.calcShow(null), 'Error');
});
test('calculator: answers read like a calculator screen', () => {
  assert.equal(B.calcShow(0.1 + 0.2), '0.3');
  assert.equal(B.calcShow(2 / 3), '0.6666666667');
  assert.equal(B.calcShow(1234567.5), '1,234,567.5');
  assert.equal(B.calcShow(-0.25), B.MINUS + '0.25');
  assert.equal(B.calcShow(B.calcEval('2−2')), '0');
  assert.ok(!/[—–]/.test(B.calcShow(-12345)));
});
test('calculator: payday real pay typed on the calculator matches the key', () => {
  for (const [pay, cpi] of [[41000, 125], [12850, 110], [9600, 140], [27300, 130], [5000, 100]]) {
    const typed = B.calcEval(`${pay}÷${cpi}×100`);
    assert.equal(Math.round(typed / 10) * 10, B.realPayOf(pay, cpi), `${pay} at CPI ${cpi}`);
  }
});

/* ---------- which one is different (was: odd one out) ---------- */
test('which one is different: every prompt says what is being sorted and names the groups', () => {
  for (const seed of [1, 2, 3]) {
    for (const t of B.everyTask(seed).filter((x) => x.verb === 'oddone')) {
      assert.equal(t.order, 'WHICH ONE IS DIFFERENT?', t.id);
      assert.ok(!/go together/i.test(t.ask), `${t.id}: the old prompt did not say what to sort by`);
      assert.match(t.ask, /^(Each|None of these|The Bureau counts each|Surprise inflation hits\. Each|The price goes up\. For each)/, `${t.id}: ${t.ask}`);
      assert.match(t.ask, /Tap the (one|line)/, t.id);
      assert.ok(!/undefined/.test(t.ask + t.why), t.id);
      t.options.forEach((o) => assert.ok(o.note && o.note.length <= 60, `${t.id}: note ${o.note}`));
      // the reason names both groups
      assert.match(t.why, /^(That (one|line)|Demand for that one) .+\. (The other three|Demand for the other three) /, `${t.id}: ${t.why}`);
    }
  }
});

/* ---------- graphs added Nov 17, 2026 ---------- */
const graphTasks = (kindId) => every.filter((t) => t.kind === kindId);
test('PPC tap: exactly one point fits, measured from the curve', () => {
  const list = graphTasks('ppc-tap');
  assert.ok(list.length >= 15, 'only ' + list.length);
  for (const t of list) {
    const where = t.chart.points.map((p) => { const d = Math.hypot(p.x, p.y); return d < 0.85 ? 'inside' : d > 1.12 ? 'outside' : Math.abs(d - 1) < 0.01 ? 'on' : 'unclear'; });
    assert.ok(!where.includes('unclear'), `${t.id}: a point sits too close to the curve to call`);
    const fits = where.map((w, i) => (w === t.chart.prop ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(fits, [t.answer], `${t.id}: ${where}`);
    t.chart.points.forEach((p, i) => {
      assert.ok(p.x > 0.15 && p.y > 0.15 && p.x <= 1.2 && p.y <= 1.2, `${t.id}: point ${i + 1} is off the graph`);
      t.chart.points.forEach((q, j) => { if (j > i) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 0.25, `${t.id}: points ${i + 1} and ${j + 1} are too close to tap`); });
    });
    const want = { inside: /recession|cyclical|negative output gap/i, on: /equals potential|natural rate/i, outside: /cannot reach/i }[t.chart.prop];
    assert.match(t.ask, want, t.id);
  }
});
test('PPC shift: only more or fewer resources or technology move the curve; the cycle moves the dot', () => {
  const list = graphTasks('ppc-move');
  assert.ok(list.length >= 10, 'only ' + list.length);
  assert.deepEqual(list[0].options.map((o) => o.label), ['Shifts out', 'Shifts in', 'No shift']);
  for (const t of list) {
    const c = t.chart;
    const cycleWords = /recession|laid-off|unemployment/i.test(t.text), growthWords = /technology|factories|education|labor force|population|hurricane/i.test(t.text);
    assert.ok(cycleWords !== growthWords, `${t.id}: the scenario should be a cycle story or a growth story, not both: ${t.text}`);
    if (cycleWords) {
      assert.equal(c.curve, null, t.id); assert.equal(t.options[t.answer].label, 'No shift', t.id);
      assert.ok(c.to && c.to !== c.dot, `${t.id}: the dot has to move`);
      const worse = /hits|lay off|rises/i.test(t.text);
      assert.equal(c.to, worse ? 'inside' : 'on', `${t.id}: ${t.text}`);
    } else {
      const less = /destroys|shrinks/i.test(t.text);
      assert.equal(c.curve, less ? 'in' : 'out', t.id);
      assert.equal(t.options[t.answer].label, less ? 'Shifts in' : 'Shifts out', t.id);
      assert.equal(c.dot, 'on', t.id); assert.equal(c.to, null, t.id);
      assert.match(t.why, less ? /Potential real GDP falls/ : /Potential real GDP rises/, t.id);
    }
  }
});
test('supply and demand, price controls: the key is worked out from quantity demanded and supplied at the legal price', () => {
  const list = graphTasks('sd-control');
  assert.ok(list.length >= 8, 'only ' + list.length);
  const seen = new Set();
  for (const t of list) {
    const k = t.chart.control, eq = 5;
    assert.ok(Math.abs(k.p - eq) >= 1.4, `${t.id}: the line is too close to equilibrium to read`);
    const price = k.type === 'ceiling' ? Math.min(k.p, eq) : Math.max(k.p, eq);   // the price the market ends up at
    const qd = 10 - price, qs = price;
    const key = qd > qs ? 'Shortage' : qs > qd ? 'Surplus' : 'No effect';
    assert.equal(t.options[t.answer].label, key, `${t.id}: Qd ${qd}, Qs ${qs}`);
    assert.match(t.text, k.type === 'ceiling' ? /price ceiling/ : /price floor/, t.id);
    assert.match(t.why, key === 'No effect' ? /does not bind/ : /binds/, t.id);
    seen.add(k.type + key);
  }
  assert.equal(seen.size, 4, 'need a binding and a non-binding ceiling and floor: ' + [...seen]);
});
test('supply and demand, shifts: the new equilibrium is solved, and the words match it', () => {
  const list = graphTasks('sd-shift');
  assert.ok(list.length >= 10, 'only ' + list.length);
  const seen = new Set();
  for (const t of list) {
    const s = t.chart.shift, a = s.d * 2;
    const aD = s.c === 'D' ? a : 0, aS = s.c === 'S' ? a : 0;
    // demand: P = 10 - (Q - aD). supply: P = Q - aS.
    const Q = (10 + aD + aS) / 2, P = Q - aS;
    assert.ok(Math.abs(10 - (Q - aD) - P) < 1e-9, t.id);
    const label = `${s.c === 'D' ? 'Demand' : 'Supply'} shifts ${s.d > 0 ? 'right' : 'left'}`;
    assert.equal(t.options[t.answer].label, label, t.id);
    assert.ok(t.why.includes(`${label}. Price ${P > 5 ? 'rises' : 'falls'} and quantity ${Q > 5 ? 'rises' : 'falls'}.`), `${t.id}: ${t.why}`);
    // the cause words belong to the curve that moves
    const demandCause = /incomes|substitute|complement|Buyers expect/i.test(t.text), supplyCause = /price of flour|ovens|frost|shops open|wage paid/i.test(t.text);
    assert.ok(demandCause !== supplyCause, `${t.id}: ${t.text}`);
    assert.equal(s.c, demandCause ? 'D' : 'S', `${t.id}: ${t.text}`);
    seen.add(s.c + s.d);
  }
  assert.equal(seen.size, 4, 'need all four shifts');
});
test('inflation line: one year fits each ask, recomputed from the rates', () => {
  const list = graphTasks('infl-line');
  assert.ok(list.length >= 14, 'only ' + list.length);
  for (const t of list) {
    const v = t.chart.pts.map((p) => p.v);
    assert.equal(v.length, 5, t.id);
    let fits;
    if (t.chart.prop === 'fastest') fits = v.map((x, i) => (v.every((y) => y <= x) ? i : -1));
    else if (t.chart.prop === 'deflation') fits = v.map((x, i) => (x < 0 ? i : -1));
    else if (t.chart.prop === 'dis') fits = v.map((x, i) => (i > 0 && x > 0 && x < v[i - 1] ? i : -1));
    else {
      const level = []; let p = 100;
      for (const x of v) { p = p * (100 + x) / 100; level.push(p); }
      const top = Math.max(...level);
      fits = level.map((x, i) => (x === top ? i : -1));
      const runnerUp = Math.max(...level.filter((x) => x !== top));
      assert.ok(top - runnerUp >= 0.5, `${t.id}: the two highest price levels are too close: ${level.map((x) => x.toFixed(2))}`);
    }
    assert.deepEqual(fits.filter((i) => i >= 0), [t.answer], `${t.id}: ${v}`);
    assert.equal(t.options[t.answer].label, 'Year ' + (t.answer + 1), t.id);
  }
  assert.ok(list.some((t) => t.chart.prop === 'level' && t.chart.pts.every((p, i, a) => p.v > 0 && (i === 0 || p.v < a[i - 1].v)) && t.answer === 4), 'need the falling line where prices still end highest');
});

/* ---------- Nov 17, 2026: answers stay put, AP style practice, a formula with every answer ---------- */
test('answer buttons stay put: the same set of choices always comes in the same order', () => {
  const orders = {};
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const t of B.everyTask(seed)) {
      if (!['stamp', 'sort', 'blank', 'pick'].includes(t.verb)) continue;
      const labels = t.options.map((o) => o.label);
      const key = t.kind + ' | ' + labels.slice().sort().join(' | ');
      orders[key] = orders[key] || new Set();
      orders[key].add(labels.join(' | '));
    }
  }
  const moved = Object.entries(orders).filter(([, set]) => set.size > 1).map(([k]) => k);
  assert.deepEqual(moved, [], 'these choices change places from deal to deal: ' + moved.slice(0, 3).join(' // '));
  // the menus students see most: Gains, Loses, Protected is always in that order
  for (const t of every.filter((x) => x.kind === 'effect')) assert.deepEqual(t.options.map((o) => o.label), ['Gains', 'Loses', 'Protected'], t.id);
  for (const t of every.filter((x) => x.kind === 'counted')) assert.equal(t.options.map((o) => o.label).join('|'), every.find((x) => x.kind === 'counted').options.map((o) => o.label).join('|'), t.id);
});
test('number choices read low to high', () => {
  for (const t of every.filter((x) => x.verb === 'pick')) {
    const vs = t.options.map((o) => o.v);
    assert.ok(vs.every((v) => typeof v === 'number'), t.id);
    for (let i = 1; i < vs.length; i++) assert.ok(vs[i] > vs[i - 1], `${t.id}: ${t.options.map((o) => o.label).join(', ')}`);
  }
  const places = new Set(every.filter((x) => x.verb === 'pick').map((t) => t.answer));
  assert.equal(places.size, 4, 'the right number should still land in every position');
});
test('AP style: the right answer is never the longest choice, and lands on every letter', () => {
  const list = every.filter((t) => t.verb === 'ap');
  assert.ok(list.length >= 240, 'only ' + list.length + ' AP style questions');
  for (const t of list.filter((x) => x.kind.startsWith('ap-'))) {
    const key = t.options[t.answer].label.length, rest = Math.max(...t.options.filter((o, i) => i !== t.answer).map((o) => o.label.length));
    assert.ok(key <= rest, `${t.id}: the key is the longest choice: ${t.options[t.answer].label}`);
  }
  const by = {};
  list.forEach((t) => { by[t.desk] = (by[t.desk] || 0) + 1; });
  for (const d of ['gdp', 'miss', 'jobs', 'prices', 'costs', 'real', 'cycle']) assert.ok(by[d] >= 28, `${d} has only ${by[d]} AP style questions`);
  const letters = {};
  for (const seed of [1, 2, 3]) B.everyTask(seed).filter((t) => t.verb === 'ap').forEach((t) => { letters[t.answer] = (letters[t.answer] || 0) + 1; });
  assert.equal(Object.keys(letters).length, 5);
});
test('AP style with numbers: every key is worked out again here, and the choices read low to high', () => {
  const again = {
    urate: ([e, u]) => 100 * u / (e + u),
    lfpr: ([e, u, n]) => 100 * (e + u) / (e + u + n),
    gdp: ([c, i, g, x, m]) => c + i + g + (x - m),
    cpi: ([base, now]) => 100 * now / base,
    infl: ([was, is]) => 100 * (is - was) / was,
    realgdp: ([nom, def]) => 100 * nom / def,
    deflator: ([nom, real]) => 100 * nom / real,
    realrate: ([nominal, inflation]) => nominal - inflation,
    percap: ([billions, millions]) => (billions * 1e9) / (millions * 1e6),
    gap: ([actual, potential]) => 100 * (actual - potential) / potential,
    cyclical: ([actual, natural]) => actual - natural,
    realwage: ([wage, cpi]) => 100 * wage / cpi,
    pricegrowth: ([nominal, real]) => nominal - real,
    basket: ([slices, s1, s2, rides, r1, r2]) => { const before = slices * s1 + rides * r1, after = slices * s2 + rides * r2; return 100 * (after - before) / before; },
  };
  const list = every.filter((t) => t.kind.startsWith('apn-'));
  assert.ok(list.length >= 80, 'only ' + list.length);
  const kinds = new Set();
  for (const t of list) {
    const f = again[t.apn.k];
    assert.ok(f, t.id + ' has no check');
    kinds.add(t.apn.k);
    assert.equal(t.options.length, 5, t.id);
    assert.equal(new Set(t.options.map((o) => o.label)).size, 5, `${t.id}: two choices read the same: ${t.options.map((o) => o.label).join(', ')}`);
    assert.ok(Math.abs(t.options[t.answer].v - f(t.apn.set)) < 1e-9, `${t.id}: key ${t.options[t.answer].v}, should be ${f(t.apn.set)}`);
    for (let i = 1; i < 5; i++) assert.ok(t.options[i].v > t.options[i - 1].v, t.id + ' is not low to high');
    // a wrong choice must not round to the same label as the key
    t.options.forEach((o, i) => { if (i !== t.answer) assert.ok(Math.abs(o.v - t.options[t.answer].v) > 0.04, `${t.id}: ${o.label} is too close to the key`); });
  }
  assert.equal(kinds.size, Object.keys(again).length, 'every number template should deal');
});
test('AP style practice deals only AP style questions and moves through every topic', () => {
  const seen = new Set(), desks = {};
  const r = B.rng(11);
  let last = null, sameInARow = 0;
  for (let i = 0; i < 80; i++) {
    const t = B.trainingTask(B.APSTYLE.key, r, seen);
    assert.equal(t.verb, 'ap', t.id);
    desks[t.desk] = (desks[t.desk] || 0) + 1;
    if (t.desk === last) sameInARow++;
    last = t.desk;
  }
  assert.equal(Object.keys(desks).length, 8, 'topics dealt: ' + Object.keys(desks));
  assert.equal(sameInARow, 0, 'two questions in a row came from the same topic');
  const unit2 = Object.keys(desks).filter((d) => d !== 'micro').map((d) => desks[d]);
  assert.ok(Math.max(...unit2) - Math.min(...unit2) <= 1, 'Unit 2 topics should come up equally: ' + JSON.stringify(desks));
  assert.ok(desks.micro >= 2 && desks.micro <= Math.min(...unit2) / 2, 'micro flashbacks should be a small share: ' + JSON.stringify(desks));
});
test('every answer comes with a formula or a rule', () => {
  for (const seed of [1, 2]) {
    for (const t of B.everyTask(seed)) {
      assert.ok(t.learn && (t.learn.label === 'Formula' || t.learn.label === 'Rule'), t.id + ' has no formula or rule');
      assert.ok(t.learn.text.length >= 12 && t.learn.text.length <= 100, `${t.id}: ${t.learn.text.length} characters: ${t.learn.text}`);
      assert.ok(!/undefined|[–—]/.test(t.learn.text), `${t.id}: ${t.learn.text}`);
      assert.equal(t.learn.label === 'Formula', /[=≈]/.test(t.learn.text), `${t.id}: a formula has an equals sign: ${t.learn.text}`);
      if (t.formula) assert.equal(t.learn.text, t.formula, t.id);
    }
  }
  // the lines that matter most are the ones a student would expect
  const one = (kindId) => every.find((t) => t.kind === kindId).learn.text;
  assert.match(one('effect'), /^Real (interest rate|rate|value) =/);
  assert.match(one('who'), /^Labor force = employed \+ unemployed/);
  assert.match(one('counted'), /^GDP = the market value of new, final goods and services/);
  assert.match(one('nameit'), /^Inflation rate = /);
  assert.match(one('sign'), /^Output gap = /);
  for (const step of B.boss(2, B.rng(5))) assert.ok(step.learn && step.learn.text, 'a Release step has no formula');
  // the formula sheet lists real lines for all eight desks
  assert.equal(B.SHEET.length, 8);
  B.SHEET.forEach((b) => { assert.ok(B.DESKS[b.desk], b.desk); assert.ok(b.lines.length >= 3); b.lines.forEach((l) => assert.ok(l && l.text && !/undefined/.test(l.text), b.desk)); });
});
