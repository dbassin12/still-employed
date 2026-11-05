'use strict';
// Run: node --test src/
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
  const sch = B.scheduler(B.rng(4), { seen: new Set(), skipVerbs: ['ap', 'badcell'] });
  for (let i = 0; i < 40; i++) { const t = sch.next(i < 10 ? 1 : 3); assert.ok(t.verb !== 'ap' && t.verb !== 'badcell', t.id); }
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
