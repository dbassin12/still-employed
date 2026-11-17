/* Still Employed: the second half of the bank. Eighteen more question types, built from src/records.js and from number
   sets written out here so every one can be listed and checked. As in bank.js, every answer is computed from its data.
   src/bank.test.js recomputes these with separate formulas. */
(function (root) {
  'use strict';
  const inNode = typeof module !== 'undefined' && module.exports;
  const B = inNode ? require('./bank.js') : root.SE_BANK;
  const MORE = inNode ? require('./records.js') : root.SE_MORE;
  const { fmt, shuffle, pickOne, MINUS, wave } = B;
  const { kind, finish, GEN, SETS, bins, plain, VERB_CLOCK, VERB_PAY, VERB_WEIGHT, GDP, PEOPLE, EFFECTS, LOOP, REALNOM, COSTS, PHASES, NAMEIT, MICRO_ELASTIC, TYPES, MOVES, TOWNS, BOTHMOVES, PHIS, words } = B._kit;

  B.VERBS.push('truefalse', 'oddone', 'order', 'match', 'blank', 'word', 'compare', 'type', 'dial', 'arrows', 'rows', 'pile', 'wave', 'frq', 'bars', 'badcell', 'label', 'ap');
  /* Clocks are generous on purpose (teacher feedback, Nov 5, 2026). Reading time is added on top of these. */
  Object.assign(VERB_CLOCK, { truefalse: 19, oddone: 22, order: 26, match: 30, blank: 21, word: 23, compare: 26, type: 62, dial: 46, arrows: 27, rows: 28, pile: 34, wave: 20, frq: 28, bars: 23, badcell: 50, label: 36, ap: 56 });
  Object.assign(VERB_PAY, { truefalse: 1, oddone: 1, order: 1.5, match: 1.5, blank: 1, word: 1, compare: 1.5, type: 2.5, dial: 1.5, arrows: 1.5, rows: 1.5, pile: 2, wave: 1, frq: 1.5, bars: 1, badcell: 2, label: 1.5, ap: 2 });
  Object.assign(VERB_WEIGHT, { truefalse: 1, oddone: 1, order: 0.9, match: 0.9, blank: 1, word: 1, compare: 1, type: 0.9, dial: 0.8, arrows: 0.9, rows: 0.9, pile: 1, wave: 0.9, frq: 0.9, bars: 0.9, badcell: 0.7, label: 0.8, ap: 0.9 });

  /* adds reading time for text finish() does not know about */
  function fin(t, extra) {
    finish(t);
    let n = 0;
    (extra || []).forEach((s) => { n += words(s); });
    t.clock = Math.round((t.clock + n * 0.35) * 10) / 10;
    return t;
  }
  const byDesk = (list) => {
    const out = {};
    list.forEach((x) => { (out[x.d] = out[x.d] || []).push(x); });
    return out;
  };
  const eachDesk = (list, prefix, verb, build) => {
    const groups = byDesk(list);
    Object.keys(groups).forEach((d) => kind(`${prefix}-${d}`, d, verb, groups[d], build));
  };

  /* ================= true or false ================= */
  const TF = MORE.TF.map(([d, lvl, a, s, y]) => ({ d, lvl, a, s, y }));
  eachDesk(TF, 'tf', 'truefalse', (x) => finish({
    desk: x.d, verb: 'truefalse', lvl: x.lvl, order: 'TRUE OR FALSE?', text: x.s,
    options: [{ key: 't', label: 'True', stampClass: 'go' }, { key: 'f', label: 'False', stampClass: 'no' }], answer: x.a ? 0 : 1, why: x.y,
  }));

  /* ================= fill the blank ================= */
  const BLANKS = MORE.BLANK.map(([d, lvl, t, a, w1, w2, w3, y]) => ({ d, lvl, t, a, w: [w1, w2, w3], y }));
  eachDesk(BLANKS, 'blank', 'blank', (x) => {
    const options = B.steady([x.a].concat(x.w)).map((label) => ({ label }));
    return finish({ desk: x.d, verb: 'blank', lvl: x.lvl, order: 'FILL THE BLANK', text: x.t, options, answer: options.findIndex((o) => o.label === x.a), why: x.y });
  });

  /* ================= tap the wrong word ================= */
  function parseWord(src) {
    const parts = [];
    const re = /\[([^\]>]+)(?:>([^\]]+))?\]/g;
    let at = 0, m;
    while ((m = re.exec(src))) {
      if (m.index > at) parts.push({ text: src.slice(at, m.index) });
      parts.push(m[2] ? { w: m[1], bad: true, fix: m[2] } : { w: m[1] });
      at = m.index + m[0].length;
    }
    if (at < src.length) parts.push({ text: src.slice(at) });
    return parts;
  }
  const WORDS = MORE.WORD.map(([d, lvl, t, y]) => ({ d, lvl, t, y }));
  eachDesk(WORDS, 'word', 'word', (x) => {
    const parts = parseWord(x.t);
    const cand = parts.filter((p) => p.w);
    const bad = cand.find((p) => p.bad);
    return finish({
      desk: x.d, verb: 'word', lvl: x.lvl, order: 'TAP THE WRONG WORD', text: parts.map((p) => p.w || p.text).join(''), parts,
      options: cand.map((p) => ({ label: p.w })), answer: cand.indexOf(bad), fix: bad.fix, why: `It should say "${bad.fix}." ${x.y}`.slice(0, 140),
    });
  });

  /* ================= AP style ================= */
  /* Choices that are all numbers read low to high, the way the AP exam prints them. Word choices are shuffled. */
  const apNumber = (l) => { const m = /^\$?([0-9][0-9,]*\.?[0-9]*)%?( billion)?$/.exec(l); return m ? Number(m[1].replace(/,/g, '')) : null; };
  const apOrder = (r, labels) => (labels.every((l) => apNumber(l) !== null) ? labels.slice().sort((a, b) => apNumber(a) - apNumber(b)) : shuffle(r, labels));
  eachDesk(MORE.AP.concat(MORE.AP2 || []), 'ap', 'ap', (x, r) => {
    const options = apOrder(r, [x.a].concat(x.w)).map((label) => ({ label }));
    return fin({ desk: x.d, verb: 'ap', lvl: x.lvl, order: 'AP STYLE QUESTION', text: x.q, options, answer: options.findIndex((o) => o.label === x.a), why: x.y, f: x.f }, options.map((o) => o.label));
  });

  /* ================= finish the sentence ================= */
  eachDesk(MORE.FRQ, 'frq', 'frq', (x, r) => {
    const blanks = x.b.map((list) => {
      const options = B.steady(list);
      return { options, answer: options.indexOf(list[0]) };
    });
    return fin({ desk: x.d, verb: 'frq', lvl: x.lvl, order: 'FINISH THE SENTENCE', text: x.t, blanks, why: x.y }, [x.b[0].join(' '), x.b[1].join(' ')]);
  });

  /* ================= put in order ================= */
  eachDesk(MORE.ORDER, 'order', 'order', (x, r) => {
    const options = shuffle(r, x.items).map((label) => ({ label }));
    return fin({ desk: x.d, verb: 'order', lvl: x.lvl, order: 'PUT IN ORDER', ask: x.ask, options, answer: x.items.map((it) => options.findIndex((o) => o.label === it)), why: x.y }, x.items);
  });
  /* numbers to rank: the key comes from sorting the computed values */
  const RANK = [
    { id: 'urate', d: 'jobs', lvl: 2, f: 'urate', ask: 'Lowest unemployment rate to highest.', sets: [[[1000, 50], [2000, 160], [800, 48]], [[1500, 120], [500, 20], [3000, 150]], [[1200, 96], [1000, 100], [4000, 200]], [[2000, 60], [1000, 80], [2500, 125]]], label: ([lf, u]) => `${fmt.num(u)} unemployed, labor force ${fmt.num(lf)}`, inp: ([lf, u]) => ({ u, lf }), val: ([lf, u]) => u / lf, y: 'Unemployed ÷ labor force for each one. Big counts can still mean a low rate.' },
    { id: 'infl', d: 'prices', lvl: 2, f: 'infl', ask: 'Lowest inflation rate to highest.', sets: [[[120, 126], [200, 206], [100, 104]], [[150, 159], [250, 255], [125, 130]], [[300, 309], [110, 121], [160, 168]], [[140, 147], [200, 204], [220, 231 + 11]]], label: ([o, n]) => `CPI from ${o} to ${n}`, inp: ([old, neu]) => ({ old, neu }), val: ([o, n]) => (n - o) / o, y: 'Change ÷ old CPI for each one. The biggest point rise is not always the biggest rate.' },
    { id: 'wage', d: 'prices', lvl: 2, f: 'realwage', ask: 'Lowest real wage to highest.', sets: [[[25, 125], [18, 100], [33, 150]], [[24, 120], [26, 100], [36, 150]], [[30, 125], [21, 100], [44, 200]], [[15, 100], [27, 150], [25, 125]]], label: ([w, c]) => `${fmt.usd2(w)} when the CPI is ${c}`, inp: ([wage, cpi]) => ({ wage, cpi }), val: ([w, c]) => w / c, y: 'Wage ÷ CPI × 100 for each one.' },
    { id: 'percap', d: 'miss', lvl: 2, f: 'percap', ask: 'Lowest GDP per capita to highest.', sets: [[[800, 40], [1200, 30], [450, 15]], [[900, 60], [600, 20], [1000, 40]], [[2000, 25], [1500, 50], [500, 25]], [[720, 12], [800, 20], [350, 35]]], label: ([g, p]) => `$${fmt.num(g)} billion, ${p} million people`, inp: ([gdpB, popM]) => ({ gdpB, popM }), val: ([g, p]) => g / p, y: 'GDP ÷ population for each one. A bigger GDP is not always a higher GDP per capita.' },
    { id: 'real', d: 'real', lvl: 2, f: 'realgdp', ask: 'Lowest real GDP to highest.', sets: [[[1320, 110], [1000, 100], [1250, 125]], [[1500, 125], [1100, 100], [1300, 130]], [[1050, 105], [1440, 120], [1100, 110]].map((x) => x), [[880, 110], [900, 100], [1000, 125]]], label: ([n, d]) => `Nominal $${fmt.num(n)}, deflator ${d}`, inp: ([nom, def]) => ({ nom, def }), val: ([n, d]) => n / d, y: 'Nominal ÷ deflator × 100 for each one.' },
  ];
  RANK.forEach((spec) => {
    const recs = spec.sets.filter((set) => new Set(set.map(spec.val)).size === set.length).map((set, i) => ({ set, k: String(i + 1), lvl: spec.lvl }));
    kind('rank-' + spec.id, spec.d, 'order', recs, (x, r) => {
      const shuffled = shuffle(r, x.set);
      const options = shuffled.map((row) => ({ label: spec.label(row) }));
      const sorted = shuffled.map((row, i) => ({ i, v: spec.val(row) })).sort((a, b) => a.v - b.v);
      return fin({
        desk: spec.d, verb: 'order', lvl: spec.lvl, order: 'PUT IN ORDER', ask: spec.ask, options, answer: sorted.map((s) => s.i), why: spec.y,
        check: { f: spec.f, inputs: shuffled.map(spec.inp), dir: 'asc' },
      }, options.map((o) => o.label));
    });
  });

  /* ================= set the arrows ================= */
  const arrowTask = (d, lvl, t, rows, y) => fin({ desk: d, verb: 'arrows', lvl, order: 'SET THE ARROWS', text: t, rows: rows.map(([label, answer]) => ({ label, answer })), why: y }, rows.map((row) => row[0]));
  eachDesk(MORE.ARROWS, 'arrows', 'arrows', (x) => arrowTask(x.d, x.lvl, x.t, x.rows, x.y));
  const dirOf = (a, b) => (Math.abs(a - b) < 1e-9 ? 'same' : b > a ? 'up' : 'down');
  kind('arrows-move', 'jobs', 'arrows', MOVES.map((m) => Object.assign({}, m)), (m) => {
    const c = TOWNS[0], after = Object.assign({}, c);
    if (m.from !== m.to) { after[m.from]--; after[m.to]++; }
    const rate = (x) => x.u / (x.e + x.u), part = (x) => (x.e + x.u) / (x.e + x.u + x.n);
    return arrowTask('jobs', m.lvl, m.t, [['Unemployment rate', dirOf(rate(c), rate(after))], ['LFPR', dirOf(part(c), part(after))]], m.y);
  });
  kind('arrows-both', 'real', 'arrows', BOTHMOVES.map(([q, p], i) => ({ q, p, k: String(i + 1), lvl: q < 0 ? 3 : 2 })), (x) => {
    const qT = x.q === 0 ? 'Output does not change.' : x.q > 0 ? `Output rises ${x.q}%.` : `Output falls ${-x.q}%.`;
    const pT = x.p === 0 ? 'Prices do not change.' : `Prices rise ${x.p}%.`;
    return arrowTask('real', x.lvl, `${qT} ${pT}`, [['Nominal GDP', dirOf(0, x.q + x.p)], ['Real GDP', dirOf(0, x.q)], ['GDP deflator', dirOf(0, x.p)]], 'Real GDP follows output. The deflator follows prices. Nominal GDP follows both.');
  });

  /* ================= match them ================= */
  const combos = (n, want) => {
    const out = [];
    const walk = (start, picked) => {
      if (picked.length === 3) { out.push(picked); return; }
      for (let i = start; i < n; i++) walk(i + 1, picked.concat(i));
    };
    walk(0, []);
    return out.slice(0, want);
  };
  const matchRecs = [];
  MORE.MATCH.forEach((m) => combos(m.pairs.length, 6).forEach((pick, i) => matchRecs.push({ d: m.d, lvl: m.lvl, ask: m.ask, y: m.y, pairs: pick.map((p) => m.pairs[p]), k: `${m.k}${i}` })));
  eachDesk(matchRecs, 'match', 'match', (x, r) => {
    const left = shuffle(r, x.pairs.map((p) => p[0]));
    const right = shuffle(r, x.pairs.map((p) => p[1]));
    if (left.every((l, i) => x.pairs.find((p) => p[0] === l)[1] === right[i])) right.push(right.shift());
    const answer = left.map((l) => right.indexOf(x.pairs.find((p) => p[0] === l)[1]));
    return fin({ desk: x.d, verb: 'match', lvl: x.lvl, order: 'MATCH THEM', ask: x.ask, left, right, answer, why: x.y }, left.concat(right));
  });

  /* ================= which is bigger? two cards, one key, computed ================= */
  const COMPARES = [
    {
      id: 'wage', d: 'prices', lvl: 2, f: 'realwage', order: 'WHICH PAY BUYS MORE?', ask: 'Compare what the pay can buy.', a: 'Job A', b: 'Job B', inp: ([wage, cpi]) => ({ wage, cpi }), val: ([w, c]) => w / c * 100,
      rows: ([w, c]) => [['Wage', fmt.usd2(w)], ['CPI', c]], res: (v) => `Real wage ${fmt.usd2(v)}`, y: 'Real wage = wage ÷ CPI × 100. The bigger paycheck may buy less.',
      sets: [[[21, 100], [25, 125]], [[18, 120], [21, 150]], [[30, 120], [33, 150]], [[16, 100], [20, 130]], [[27, 135], [24, 100]], [[22, 110], [27, 150]], [[40, 160], [28, 100]], [[33, 110], [36, 125]], [[15, 100], [25, 200]], [[26, 130], [18, 100]], [[50, 200], [20, 100]], [[35, 140], [24, 100]]],
    },
    {
      id: 'urate', d: 'jobs', lvl: 2, f: 'urate', order: 'WHICH HAS THE HIGHER RATE?', ask: 'Compare the unemployment rates.', a: 'Town A', b: 'Town B', inp: ([u, lf]) => ({ u, lf }), val: ([u, lf]) => u / lf * 100,
      rows: ([u, lf]) => [['Unemployed', fmt.num(u)], ['Labor force', fmt.num(lf)]], res: (v) => `Rate ${fmt.pct(v)}`, y: 'Unemployed ÷ labor force. A bigger count can still mean a lower rate.',
      sets: [[[50, 1000], [120, 2000]], [[100, 2500], [40, 800]], [[60, 1500], [30, 500]], [[200, 5000], [90, 1500]], [[80, 1000], [150, 2500]], [[300, 4000], [70, 1000]], [[45, 900], [100, 1600]], [[160, 2000], [90, 1000]], [[250, 5000], [60, 800]], [[35, 500], [140, 2800]]],
    },
    {
      id: 'lfpr', d: 'jobs', lvl: 2, f: 'lfpr', order: 'WHICH HAS THE HIGHER LFPR?', ask: 'Compare the labor force participation rates.', a: 'Town A', b: 'Town B', inp: ([lf, adults]) => ({ lf, adults }), val: ([lf, a]) => lf / a * 100,
      rows: ([lf, a]) => [['Labor force', fmt.num(lf)], ['Adults', fmt.num(a)]], res: (v) => `LFPR ${fmt.pct(v)}`, y: 'Labor force ÷ adults. A bigger labor force can still mean a lower rate.',
      sets: [[[600, 1000], [1300, 2000]], [[1500, 2500], [700, 1000]], [[900, 1500], [1000, 1600]], [[2400, 4000], [650, 1000]], [[800, 1000], [1400, 2000]], [[1100, 2000], [600, 1000]], [[1800, 3000], [480, 800]].map((x) => x), [[750, 1000], [2800, 4000]]],
    },
    {
      id: 'infl', d: 'prices', lvl: 2, f: 'infl', order: 'WHICH HAS MORE INFLATION?', ask: 'Compare the inflation rates.', a: 'Country A', b: 'Country B', inp: ([old, neu]) => ({ old, neu }), val: ([o, n]) => (n - o) / o * 100,
      rows: ([o, n]) => [['CPI last year', o], ['CPI this year', n]], res: (v) => `Inflation ${fmt.pct(v)}`, y: 'Change ÷ old CPI. A bigger point rise can still be a lower rate.',
      sets: [[[120, 126], [200, 208]], [[100, 104], [250, 255]], [[150, 156], [125, 135]], [[300, 309], [110, 115.5]], [[160, 168], [240, 247.2]], [[110, 121], [200, 216]], [[140, 147], [220, 228.8]], [[130, 133.9], [180, 189]], [[100, 103], [300, 306]], [[175, 182], [125, 135]]],
    },
    {
      id: 'percap', d: 'miss', lvl: 2, f: 'percap', order: 'WHICH HAS MORE PER PERSON?', ask: 'Compare GDP per capita.', a: 'Country A', b: 'Country B', inp: ([gdpB, popM]) => ({ gdpB, popM }), val: ([g, p]) => g * 1e9 / (p * 1e6),
      rows: ([g, p]) => [['GDP', `$${fmt.num(g)} billion`], ['Population', `${p} million`]], res: (v) => `${fmt.usd(v)} per person`, y: 'GDP ÷ population. A bigger GDP can still mean less per person.',
      sets: [[[800, 20], [1200, 40]], [[900, 30], [600, 15]], [[1500, 60], [500, 10]], [[2000, 50], [750, 15]], [[450, 15], [1000, 20]], [[3000, 100], [700, 20]], [[1800, 60], [400, 10]], [[640, 16], [1500, 50]], [[720, 24], [1000, 25]], [[2500, 50], [900, 30]]],
    },
    {
      id: 'real', d: 'real', lvl: 2, f: 'realgdp', order: 'WHICH PRODUCED MORE?', ask: 'Compare real GDP, in billions of dollars.', a: 'Country A', b: 'Country B', inp: ([nom, def]) => ({ nom, def }), val: ([n, d]) => n / d * 100,
      rows: ([n, d]) => [['Nominal GDP', fmt.num(n)], ['Deflator', d]], res: (v) => `Real GDP ${fmt.num(v)}`, y: 'Nominal ÷ deflator × 100. Higher prices can make nominal GDP look bigger.',
      sets: [[[1200, 120], [1100, 100]], [[1320, 110], [1500, 125]], [[1050, 105], [1000, 125]], [[990, 110], [1000, 125]], [[1440, 120], [1300, 100]], [[880, 110], [900, 100]], [[1650, 150], [1200, 100]], [[1260, 105], [1500, 125]], [[1100, 110], [1200, 150]], [[2200, 110], [2500, 125]].map((x) => x).slice(0, 2)],
    },
    {
      id: 'rate', d: 'costs', lvl: 2, f: 'realrate', order: 'WHICH REAL RATE IS HIGHER?', ask: 'Two bank loans. Compare the real interest rates.', a: 'Loan A', b: 'Loan B', inp: ([i, pi]) => ({ i, pi }), val: ([i, pi]) => i - pi,
      rows: ([i, pi]) => [['Nominal rate', fmt.pct(i)], ['Inflation', fmt.pct(pi)]], res: (v) => `Real rate ${fmt.pct(v)}`, y: 'Real rate = nominal rate minus inflation. A higher stated rate can be a lower real rate.',
      sets: [[[8, 5], [5, 1]], [[9, 7], [6, 2]], [[4, 1], [7, 6]], [[10, 9], [3, 1]], [[6, 8], [4, 3]], [[5, 2], [8, 6]], [[12, 10], [6, 3]], [[7, 3], [9, 6]], [[3, 4], [2, 2]], [[6, 1], [11, 8]]],
    },
    {
      id: 'gap', d: 'cycle', lvl: 3, want: 'lower', f: 'gappct', order: 'WHICH GAP IS MORE NEGATIVE?', ask: 'Compare the output gaps as a percent of potential.', a: 'Country A', b: 'Country B', inp: ([actual, potential]) => ({ actual, potential }), val: ([a, p]) => (a - p) / p * 100,
      rows: ([a, p]) => [['Actual real GDP', fmt.num(a)], ['Potential real GDP', fmt.num(p)]], res: (v) => `Gap ${fmt.pct(v)}`, y: 'Divide the gap by potential. A bigger dollar gap can be a smaller percent.',
      sets: [[[1140, 1200], [485, 500]], [[950, 1000], [1960, 2000]], [[380, 400], [2850, 3000]].map((x) => x).slice(0, 2).concat([]), [[780, 800], [1900, 2000]], [[1470, 1500], [576, 600]], [[2400, 2500], [475, 500]], [[640, 700], [1900, 2000]], [[864, 900], [970, 1000]]],
    },
    {
      id: 'cyc', d: 'cycle', lvl: 2, f: 'cyclical', order: 'MORE CYCLICAL UNEMPLOYMENT?', ask: 'Which has more cyclical unemployment?', a: 'Country A', b: 'Country B', inp: ([actual, natural]) => ({ actual, natural }), val: ([a, n]) => a - n,
      rows: ([a, n]) => [['Actual rate', fmt.pct(a)], ['Natural rate', fmt.pct(n)]], res: (v) => `Cyclical ${fmt.pct(v)}`, y: 'Cyclical = actual minus natural. A higher actual rate can be less cyclical.',
      sets: [[[7, 5], [8, 6.5]], [[6, 4], [9, 8]], [[5.5, 5], [6, 4.5]], [[8, 6], [7, 4.5]], [[4.5, 4], [5, 5]], [[9, 7.5], [6.5, 4]], [[6, 5.5], [5, 4]], [[7.5, 4.5], [8, 6]]],
    },
    {
      id: 'index', d: 'prices', lvl: 2, f: 'cpi', order: 'WHOSE PRICES ROSE MORE?', ask: 'Compare each price index with its base year.', a: 'Country A', b: 'Country B', inp: ([base, now]) => ({ now, base }), val: ([b, n]) => n / b * 100,
      rows: ([b, n]) => [['Basket, base year', fmt.usd2(b)], ['Basket now', fmt.usd2(n)]], res: (v) => `Index ${fmt.idx(v)}`, y: 'Cost now ÷ cost in the base year × 100. A bigger dollar rise can be a smaller percent.',
      sets: [[[50, 60], [80, 92]], [[40, 46], [100, 110]], [[20, 25], [200, 230]], [[60, 66], [30, 36]], [[120, 150], [80, 88]], [[75, 90], [250, 275]], [[160, 200], [50, 55]], [[100, 125], [40, 48]]],
    },
  ];
  COMPARES.forEach((spec) => {
    const recs = spec.sets.filter((pair) => pair.length === 2 && Math.abs(spec.val(pair[0]) - spec.val(pair[1])) > 1e-6).map((pair, i) => ({ pair, k: String(i + 1), lvl: spec.lvl }));
    kind('cmp-' + spec.id, spec.d, 'compare', recs, (x) => {
      const cards = x.pair.map((set, i) => ({ title: i ? spec.b : spec.a, rows: set_rows(spec.rows(set)), result: spec.res(spec.val(set)), calc: { f: spec.f, in: spec.inp(set), value: spec.val(set) } }));
      const vals = cards.map((c) => c.calc.value);
      const want = spec.want || 'higher';
      const answer = want === 'lower' ? (vals[0] < vals[1] ? 0 : 1) : (vals[0] > vals[1] ? 0 : 1);
      return fin({ desk: spec.d, verb: 'compare', lvl: spec.lvl, order: spec.order, ask: spec.ask, cards, want, options: cards.map((c) => ({ label: c.title })), answer, why: spec.y }, [spec.y.split('.')[0]]);
    });
  });
  function set_rows(rows) { return rows.map((row) => [String(row[0]), String(row[1])]); }

  /* ================= type the answer: math tasks with a keypad instead of four choices ================= */
  const TOL = { pct: 0.1, idx: 0.1, usd2: 0.02, usd: 0.5, bil: 0.5, num: 0.5 };
  const UNIT = { pct: ['', '%'], idx: ['', ''], usd2: ['$', ''], usd: ['$', ''], bil: ['$', ' billion'], num: ['', ''] };
  function toType(task) {
    const name = task.calc.fmt, tol = TOL[name];
    const value = task.calc.value;
    const wrongVals = task.options.filter((o, i) => i !== task.answer && !/Check the arithmetic/.test(o.why) && Math.abs(o.v - value) > tol).map((o) => ({ v: o.v, why: o.why }));
    const oneDecimal = name === 'pct' || name === 'idx';
    const t = Object.assign({}, task, { verb: 'type', ask: `${task.ask ? task.ask.replace(/([^.?!])$/, '$1.') + ' ' : ''}Type the answer${oneDecimal ? ', to one decimal' : ''}.`, tol, unit: UNIT[name], wrongVals });
    delete t.options; delete t.answer;
    return finish(t);
  }
  [
    ['urate', 'urate', SETS.urate, 'jobs', 2], ['lfpr', 'lfpr', SETS.urate, 'jobs', 2], ['lf', 'lf', SETS.urate, 'jobs', 1],
    ['gdp', 'gdp', SETS.gdp, 'gdp', 2], ['xn', 'xn', SETS.xn, 'gdp', 2], ['income', 'income', SETS.income, 'gdp', 1], ['va', 'valueadded', SETS.chain, 'gdp', 2],
    ['percap', 'percap', SETS.percap, 'miss', 2], ['cpi', 'cpi', SETS.cpi, 'prices', 2], ['infl', 'infl', SETS.infl, 'prices', 2], ['wage', 'realwage', SETS.wage, 'prices', 2], ['convert', 'convert', SETS.convert, 'prices', 3], ['basket', 'basket', SETS.basket, 'prices', 1],
    ['real', 'realgdp', SETS.real, 'real', 2], ['def', 'deflator', SETS.real, 'real', 2], ['nom', 'nominal', SETS.real, 'real', 3], ['growth', 'growth', SETS.growth, 'real', 3], ['onegood', 'onegood', SETS.onegood, 'real', 2],
    ['cyc', 'cyclical', SETS.cyclical, 'jobs', 2], ['nat', 'natural', SETS.natural, 'jobs', 2], ['gap', 'gap', SETS.gap, 'cycle', 3], ['rate', 'realrate', SETS.realrate, 'costs', 2], ['wagechange', 'wagechange', SETS.wagechange, 'prices', 2],
  ].forEach(([id, gen, sets, desk, lvl]) => {
    kind('type-' + id, desk, 'type', sets, (set, r) => toType(GEN[gen](set, r, lvl)), { lvl });
  });

  /* ================= set the dial: only where the answer lands on a step ================= */
  const DIALS = [
    { id: 'urate', gen: 'urate', sets: SETS.urate, d: 'jobs', min: 0, max: 15, step: 0.5, pre: '', suf: '%' },
    { id: 'lfpr', gen: 'lfpr', sets: SETS.urate, d: 'jobs', min: 40, max: 90, step: 2.5, pre: '', suf: '%' },
    { id: 'infl', gen: 'infl', sets: SETS.infl, d: 'prices', min: 0, max: 15, step: 0.5, pre: '', suf: '%' },
    { id: 'cpi', gen: 'cpi', sets: SETS.cpi, d: 'prices', min: 100, max: 150, step: 2.5, pre: '', suf: '' },
    { id: 'deflator', gen: 'deflator', sets: SETS.real, d: 'real', min: 100, max: 130, step: 5, pre: '', suf: '' },
    { id: 'wage', gen: 'realwage', sets: SETS.wage, d: 'prices', min: 0, max: 40, step: 1, pre: '$', suf: '' },
    { id: 'cyc', gen: 'cyclical', sets: SETS.cyclical, d: 'cycle', min: -3, max: 5, step: 0.5, pre: '', suf: '%' },
    { id: 'nat', gen: 'natural', sets: SETS.natural, d: 'jobs', min: 0, max: 8, step: 0.5, pre: '', suf: '%' },
    { id: 'rate', gen: 'realrate', sets: SETS.realrate, d: 'costs', min: -5, max: 10, step: 1, pre: '', suf: '%' },
    { id: 'gap', gen: 'gap', sets: SETS.gap, d: 'cycle', min: -8, max: 8, step: 1, pre: '', suf: '%' },
  ];
  DIALS.forEach((sp) => {
    const r0 = B.rng(1);
    const onStep = (v) => v >= sp.min && v <= sp.max && Math.abs((v - sp.min) / sp.step - Math.round((v - sp.min) / sp.step)) < 1e-6;
    const recs = sp.sets.filter((set) => onStep(GEN[sp.gen](set, r0, 2).calc.value));
    kind('dial-' + sp.id, sp.d, 'dial', recs, (set, r) => {
      const task = GEN[sp.gen](set, r, 2);
      const v = task.calc.value;
      const mid = sp.min + Math.round((sp.max - sp.min) / sp.step / 2) * sp.step;
      const start = Math.abs(mid - v) > sp.step / 2 ? mid : sp.min;
      const t = Object.assign({}, task, { verb: 'dial', ask: `${task.ask ? task.ask.replace(/\.?$/, '.') + ' ' : ''}Drag the dial to the answer.`, tol: sp.step / 2, dial: { min: sp.min, max: sp.max, step: sp.step, start, pre: sp.pre, suf: sp.suf } });
      delete t.options; delete t.answer;
      return finish(t);
    }, { lvl: 2 });
  });

  /* ================= tap the row ================= */
  const YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
  function rowsTask(o) {
    return fin({
      desk: o.d, verb: o.verb || 'rows', lvl: o.lvl, order: o.order, ask: o.ask, columns: o.columns, cells: o.cells,
      options: o.cells.map((row) => ({ label: row[0] })), answer: o.answer, check: o.check, why: o.why, work: o.work,
    }, o.ask ? [] : []);
  }
  const first = (flags) => flags.findIndex(Boolean);
  const rowKind = (id, d, lvl, list, build) => kind('rows-' + id, d, 'rows', list.map((x, i) => Object.assign({ k: String(i + 1), lvl }, x)), build);
  const REALS = [
    { real: [1000, 1050, 1020, 1080], def: [100, 110, 120, 125] }, { real: [800, 840, 860, 830], def: [100, 105, 110, 120] }, { real: [500, 480, 500, 520], def: [100, 105, 110, 115] }, { real: [1200, 1260, 1320, 1280], def: [100, 110, 115, 125] },
    { real: [600, 630, 610, 640], def: [100, 110, 120, 125] }, { real: [400, 420, 400, 440], def: [100, 105, 110, 125] }, { real: [2000, 2100, 2050, 2200], def: [100, 110, 120, 125] }, { real: [1000, 950, 1000, 1050], def: [100, 110, 120, 130] },
  ];
  rowKind('realfell', 'real', 3, REALS, (x) => {
    const nominal = x.real.map((v, i) => v * x.def[i] / 100);
    const answer = first(x.real.map((v, i) => i > 0 && v < x.real[i - 1]));
    return rowsTask({ d: 'real', lvl: 3, order: 'TAP THE YEAR REAL GDP FELL', ask: 'Nominal GDP is in billions of dollars.', columns: ['Year', 'Nominal GDP', 'Deflator'], cells: YEARS.map((y, i) => [y, fmt.num(nominal[i]), String(x.def[i])]), answer, check: { kind: 'realfell', nominal, deflator: x.def }, why: 'Divide nominal by the deflator, times 100, for each year. Nominal can rise while real falls.', work: `Real GDP: ${x.real.map((v, i) => `Year ${i + 1} ${fmt.num(v)}`).join(', ')}` });
  });
  rowKind('baseyear', 'real', 1, [[95, 100, 104, 110], [90, 95, 100, 107], [100, 103, 108, 112], [92, 96, 100, 105], [85, 92, 100, 108]].map((d) => ({ d })), (x) => rowsTask({ d: 'real', lvl: 1, order: 'TAP THE BASE YEAR', columns: ['Year', 'GDP deflator'], cells: YEARS.map((y, i) => [y, String(x.d[i])]), answer: x.d.indexOf(100), check: { kind: 'baseyear', deflator: x.d }, why: 'The deflator equals 100 in the base year.' }));
  rowKind('equal', 'real', 2, [{ n: [950, 1000, 1100, 1210], r: [1000, 1000, 1050, 1100] }, { n: [800, 900, 1000, 1100], r: [900, 950, 1000, 1050] }, { n: [1000, 1100, 1210, 1300], r: [1000, 1050, 1100, 1150] }, { n: [700, 760, 800, 880], r: [760, 780, 790, 800].map((v, i) => [800, 800, 800, 800][i]) }, { n: [600, 640, 700, 770], r: [660, 680, 700, 720] }].filter((x) => x.n.filter((v, i) => v === x.r[i]).length === 1), (x) => rowsTask({ d: 'real', lvl: 2, order: 'TAP THE BASE YEAR', ask: 'Both are in billions of dollars.', columns: ['Year', 'Nominal GDP', 'Real GDP'], cells: YEARS.map((y, i) => [y, fmt.num(x.n[i]), fmt.num(x.r[i])]), answer: x.n.findIndex((v, i) => v === x.r[i]), check: { kind: 'equal', nominal: x.n, real: x.r }, why: 'Nominal GDP equals real GDP in the base year.' }));
  const rates = (c) => c.map((v, i) => (i ? (v - c[i - 1]) / c[i - 1] * 100 : null));
  rowKind('highinfl', 'prices', 2, [[100, 105, 112, 114], [120, 126, 128, 140], [100, 110, 112, 115], [150, 156, 165, 168], [200, 204, 220, 226], [80, 84, 92, 94], [110, 121, 124, 126], [160, 164, 168, 180]].map((cpi) => ({ cpi })), (x) => {
    const r = rates(x.cpi), m = Math.max(...r.slice(1));
    return rowsTask({ d: 'prices', lvl: 2, order: 'TAP THE HIGHEST INFLATION', ask: 'Which year had the highest inflation rate?', columns: ['Year', 'CPI'], cells: YEARS.map((y, i) => [y, String(x.cpi[i])]), answer: r.indexOf(m), check: { kind: 'highinfl', cpi: x.cpi }, why: 'Divide each change by the CPI before it.', work: `Inflation: ${r.slice(1).map((v, i) => `Year ${i + 2} ${fmt.pct(v)}`).join(', ')}` });
  });
  rowKind('deflation', 'prices', 1, [[120, 124, 122, 126], [100, 103, 101, 104], [150, 148, 152, 155], [200, 205, 210, 207], [130, 134, 132, 136], [90, 92, 95, 94], [110, 108, 111, 114], [175, 180, 178, 183]].map((cpi) => ({ cpi })), (x) => rowsTask({ d: 'prices', lvl: 1, order: 'TAP THE YEAR OF DEFLATION', columns: ['Year', 'CPI'], cells: YEARS.map((y, i) => [y, String(x.cpi[i])]), answer: first(x.cpi.map((v, i) => i > 0 && v < x.cpi[i - 1])), check: { kind: 'deflation', cpi: x.cpi }, why: 'Deflation is a fall in the price level, so the CPI went down.' }));
  rowKind('disinflation', 'prices', 3, [[100, 110, 114, 120], [100, 102, 110, 112], [120, 130, 135, 145], [100, 101, 103, 104], [200, 210, 213, 225], [160, 164, 172, 175], [80, 88, 90, 99], [100, 104, 110, 113]].map((cpi) => ({ cpi })), (x) => {
    const r = rates(x.cpi);
    return rowsTask({ d: 'prices', lvl: 3, order: 'TAP THE YEAR OF DISINFLATION', ask: 'Prices rose, but more slowly than the year before.', columns: ['Year', 'CPI'], cells: YEARS.map((y, i) => [y, String(x.cpi[i])]), answer: first(r.map((v, i) => i > 1 && v > 0 && v < r[i - 1])), check: { kind: 'disinflation', cpi: x.cpi }, why: 'Prices still rose that year, just more slowly.', work: `Inflation: ${r.slice(1).map((v, i) => `Year ${i + 2} ${fmt.pct(v)}`).join(', ')}` });
  });
  rowKind('highu', 'jobs', 2, [{ e: [950, 1880, 720, 1440], u: [50, 120, 80, 60] }, { e: [1150, 2300, 900, 1800], u: [50, 200, 100, 100] }, { e: [980, 1900, 3700, 760], u: [20, 100, 300, 40] }, { e: [1600, 640, 3200, 960], u: [100, 60, 100, 40] }, { e: [2850, 1425, 700, 5600], u: [150, 75, 100, 400] }, { e: [460, 1840, 920, 2760], u: [40, 100, 30, 120] }], (x) => {
    const r = x.e.map((e, i) => x.u[i] / (e + x.u[i]) * 100), m = Math.max(...r);
    return rowsTask({ d: 'jobs', lvl: 2, order: 'TAP THE HIGHEST RATE', ask: 'Which town has the highest unemployment rate?', columns: ['Town', 'Employed', 'Unemployed'], cells: ['Town A', 'Town B', 'Town C', 'Town D'].map((y, i) => [y, fmt.num(x.e[i]), fmt.num(x.u[i])]), answer: r.indexOf(m), check: { kind: 'highu', e: x.e, u: x.u }, why: 'Unemployed ÷ (employed + unemployed). The most unemployed is not always the highest rate.', work: `Rates: ${r.map((v, i) => `Town ${'ABCD'[i]} ${fmt.pct(v)}`).join(', ')}` });
  });
  const gapRows = [
    ['negative', 'TAP THE NEGATIVE GAP YEAR', [[4.5, [4, 4.5, 6, 3.5]], [5, [5, 4, 7, 4.5]], [4, [6, 4, 3.5, 3]], [5.5, [5, 5.5, 4.5, 8]], [4.5, [3.5, 7, 4.5, 4]]], 'Unemployment above the natural rate means real GDP is below potential.'],
    ['positive', 'TAP THE POSITIVE GAP YEAR', [[4.5, [4.5, 5, 6, 4]], [5, [6, 4, 5, 7]], [4, [3, 4, 5, 6]], [5.5, [6, 5.5, 5, 7]], [4.5, [5, 6, 3.5, 4.5]]], 'Unemployment below the natural rate means real GDP is above potential.'],
    ['atnatural', 'TAP THE ZERO GAP YEAR', [[4.5, [5, 4.5, 3.5, 6]], [5, [6, 4, 5, 7]], [4, [3, 5, 6, 4]], [5.5, [5.5, 4.5, 6.5, 7]], [4.5, [3, 6, 4.5, 5]]], 'At the natural rate, real GDP equals potential.'],
  ];
  gapRows.forEach(([id, order, sets, y]) => rowKind(id, 'cycle', 2, sets.map(([n, u]) => ({ n, u })), (x) => {
    const flags = x.u.map((v) => (id === 'negative' ? v > x.n : id === 'positive' ? v < x.n : v === x.n));
    return rowsTask({ d: 'cycle', lvl: 2, order, ask: `The natural rate is ${fmt.pct(x.n)}.`, columns: ['Year', 'Unemployment'], cells: YEARS.map((yr, i) => [yr, fmt.pct(x.u[i])]), answer: first(flags), check: { kind: id, u: x.u, natural: x.n }, why: y });
  }));
  rowKind('peak', 'cycle', 1, [[900, 960, 1000, 950], [1000, 1100, 1050, 1020], [700, 780, 760, 720], [500, 520, 560, 540], [1200, 1300, 1250, 1150]].map((real) => ({ real })), (x) => rowsTask({ d: 'cycle', lvl: 1, order: 'TAP THE PEAK', ask: 'Real GDP over four years, in billions of dollars.', columns: ['Year', 'Real GDP'], cells: YEARS.map((y, i) => [y, fmt.num(x.real[i])]), answer: x.real.indexOf(Math.max(...x.real)), check: { kind: 'peak', real: x.real }, why: 'The peak is the highest point. Real GDP falls after it.' }));
  rowKind('trough', 'cycle', 1, [[1000, 950, 900, 960], [1100, 1000, 1050, 1150], [900, 850, 800, 870], [600, 560, 580, 620], [1300, 1200, 1150, 1250]].map((real) => ({ real })), (x) => rowsTask({ d: 'cycle', lvl: 1, order: 'TAP THE TROUGH', ask: 'Real GDP over four years, in billions of dollars.', columns: ['Year', 'Real GDP'], cells: YEARS.map((y, i) => [y, fmt.num(x.real[i])]), answer: x.real.indexOf(Math.min(...x.real)), check: { kind: 'trough', real: x.real }, why: 'The trough is the lowest point. Real GDP rises after it.' }));

  /* ================= read the bars ================= */
  function barsTask(o) {
    return fin({ desk: o.d, verb: 'bars', lvl: o.lvl, order: o.order, ask: o.ask, bars: o.vals.map((v, i) => ({ label: YEARS[i], v })), line: o.line, suf: o.suf, lineLabel: o.lineLabel, options: YEARS.map((label) => ({ label })), answer: o.answer, check: o.check, why: o.why });
  }
  const barKind = (id, d, lvl, list, build) => kind('bars-' + id, d, 'bars', list.map((x, i) => Object.assign({ k: String(i + 1), lvl }, x)), build);
  barKind('contraction', 'cycle', 1, [[2, 3, -1, 2], [3, -2, 1, 2], [1, 2, 3, -1], [-1, 2, 3, 2], [2, -3, 1, 3], [4, 2, -1, 1], [3, 1, 2, -2], [2, 2.5, -0.5, 1]].map((v) => ({ v })), (x) => barsTask({ d: 'cycle', lvl: 1, order: 'TAP THE CONTRACTION YEAR', ask: 'Each bar is growth in real GDP.', vals: x.v, suf: '%', answer: x.v.findIndex((g) => g < 0), check: { kind: 'contraction', growth: x.v }, why: 'Negative growth means real GDP fell.' }));
  barKind('deflation', 'prices', 1, [[2, 3, -1, 1], [1, -1, 2, 3], [3, 2, 1, -1], [-2, 1, 2, 3], [2, -0.5, 1, 2], [4, 3, -1, 2]].map((v) => ({ v })), (x) => barsTask({ d: 'prices', lvl: 1, order: 'TAP THE DEFLATION YEAR', ask: 'Each bar is the inflation rate.', vals: x.v, suf: '%', answer: x.v.findIndex((g) => g < 0), check: { kind: 'deflationbar', rate: x.v }, why: 'A negative inflation rate means the price level fell.' }));
  barKind('disinflation', 'prices', 2, [[2, 5, 3, 4], [1, 4, 6, 2], [3, 4, 2, 5], [2, 3, 5, 1], [1, 6, 2, 3], [2, 7, 3, 8]].map((v) => ({ v })), (x) => barsTask({ d: 'prices', lvl: 2, order: 'TAP THE DISINFLATION YEAR', ask: 'Each bar is the inflation rate. Disinflation: the rate falls but stays above zero.', vals: x.v, suf: '%', answer: first(x.v.map((g, i) => i > 0 && g > 0 && g < x.v[i - 1])), check: { kind: 'disinflationbar', rate: x.v }, why: 'The rate fell but stayed above zero. Prices still rose, just more slowly.' }));
  barKind('negative', 'cycle', 2, [[5, [4, 4.5, 6, 3.5]], [4.5, [4, 7, 3, 4]], [5, [5, 3, 4, 8]], [4, [6, 3, 4, 2]], [6, [5, 4, 7, 6]], [5, [4, 8, 5, 3]]].map(([n, v]) => ({ n, v })), (x) => barsTask({ d: 'cycle', lvl: 2, order: 'TAP THE NEGATIVE GAP YEAR', ask: 'Each bar is the unemployment rate. The line is the natural rate.', vals: x.v, suf: '%', line: x.n, lineLabel: 'Natural rate', answer: x.v.findIndex((u) => u > x.n), check: { kind: 'negativebar', rate: x.v, natural: x.n }, why: 'Unemployment above the natural rate means real GDP is below potential.' }));
  barKind('positive', 'cycle', 2, [[5, [6, 4, 7, 5]], [4.5, [5, 6, 4, 7]], [5, [3.5, 5, 6, 8]], [6, [7, 6, 8, 5]], [4, [5, 4, 3, 6]], [5, [5, 7, 6, 4]]].map(([n, v]) => ({ n, v })), (x) => barsTask({ d: 'cycle', lvl: 2, order: 'TAP THE POSITIVE GAP YEAR', ask: 'Each bar is the unemployment rate. The line is the natural rate.', vals: x.v, suf: '%', line: x.n, lineLabel: 'Natural rate', answer: x.v.findIndex((u) => u < x.n), check: { kind: 'positivebar', rate: x.v, natural: x.n }, why: 'Unemployment below the natural rate means real GDP is above potential.' }));
  barKind('base', 'prices', 1, [[95, 100, 106, 110], [88, 94, 100, 105], [100, 104, 109, 115], [90, 95, 98, 100], [92, 100, 103, 108]].map((v) => ({ v })), (x) => barsTask({ d: 'prices', lvl: 1, order: 'TAP THE BASE YEAR', ask: 'Each bar is the price index.', vals: x.v, suf: '', answer: x.v.indexOf(100), check: { kind: 'basebar', rate: x.v }, why: 'The price index equals 100 in the base year.' }));

  /* ================= find the bad number ================= */
  const BADS = [
    { id: 'urate', d: 'jobs', f: 'urate', cols: ['Unemployed', 'Labor force', 'Rate'], sets: [[60, 1200], [40, 800], [100, 2500], [150, 2500], [80, 1000], [120, 1500], [50, 1000], [240, 4000]], inp: ([u, lf]) => ({ u, lf }), val: ([u, lf]) => u / lf * 100, bad: ([u, lf]) => u / (lf - u) * 100, show: fmt.pct, cells: ([u, lf]) => [fmt.num(u), fmt.num(lf)], y: 'Unemployment rate = unemployed ÷ labor force × 100.', tol: 0.06 },
    { id: 'lfpr', d: 'jobs', f: 'lfpr', cols: ['Labor force', 'Adults', 'LFPR'], sets: [[600, 1000], [1300, 2000], [900, 1500], [1500, 2500], [700, 1000], [2400, 4000], [800, 1000], [1000, 1600]], inp: ([lf, adults]) => ({ lf, adults }), val: ([lf, a]) => lf / a * 100, bad: ([lf, a]) => (a - lf) / a * 100, show: fmt.pct, cells: ([lf, a]) => [fmt.num(lf), fmt.num(a)], y: 'LFPR = labor force ÷ adults × 100.', tol: 0.06 },
    { id: 'cpi', d: 'prices', f: 'cpi', cols: ['Base cost', 'Cost now', 'Index'], sets: [[50, 60], [40, 42], [200, 230], [60, 66], [80, 100], [25, 30], [120, 132], [20, 25]], inp: ([base, now]) => ({ now, base }), val: ([b, n]) => n / b * 100, bad: ([b, n]) => b / n * 100, show: fmt.idx, cells: ([b, n]) => [fmt.usd2(b), fmt.usd2(n)], y: 'Price index = cost now ÷ base-year cost × 100.', tol: 0.06 },
    { id: 'infl', d: 'prices', f: 'infl', cols: ['Old CPI', 'New CPI', 'Inflation'], sets: [[120, 126], [200, 210], [150, 156], [125, 130], [110, 121], [160, 168], [250, 260], [180, 189]], inp: ([old, neu]) => ({ old, neu }), val: ([o, n]) => (n - o) / o * 100, bad: ([o, n]) => n - o, show: fmt.pct, cells: ([o, n]) => [String(o), String(n)], y: 'Inflation rate = (new ' + MINUS + ' old) ÷ old × 100.', tol: 0.06 },
    { id: 'real', d: 'real', f: 'realgdp', cols: ['Nominal GDP', 'Deflator', 'Real GDP'], sets: [[1050, 105], [1320, 110], [1000, 125], [600, 120], [660, 110], [1800, 120], [2200, 110], [500, 125]], inp: ([nom, def]) => ({ nom, def }), val: ([n, d]) => n / d * 100, bad: ([n, d]) => n * d / 100, show: fmt.num, cells: ([n, d]) => [fmt.num(n), String(d)], y: 'Real GDP = nominal GDP ÷ deflator × 100.', tol: 0.51 },
    { id: 'def', d: 'real', f: 'deflator', cols: ['Nominal GDP', 'Real GDP', 'Deflator'], sets: [[1050, 1000], [1320, 1200], [1000, 800], [600, 500], [660, 600], [1800, 1500], [2200, 2000], [500, 400]], inp: ([nom, real]) => ({ nom, real }), val: ([n, re]) => n / re * 100, bad: ([n, re]) => re / n * 100, show: fmt.idx, cells: ([n, re]) => [fmt.num(n), fmt.num(re)], y: 'Deflator = nominal GDP ÷ real GDP × 100.', tol: 0.06 },
    { id: 'wage', d: 'prices', f: 'realwage', cols: ['Wage', 'CPI', 'Real wage'], sets: [[18, 120], [22, 110], [25, 125], [30, 150], [27, 135], [24, 120], [33, 110], [36, 120]], inp: ([wage, cpi]) => ({ wage, cpi }), val: ([w, c]) => w / c * 100, bad: ([w, c]) => w * c / 100, show: fmt.usd2, cells: ([w, c]) => [fmt.usd2(w), String(c)], y: 'Real wage = nominal wage ÷ CPI × 100.', tol: 0.006 },
    { id: 'cyc', d: 'cycle', f: 'cyclical', cols: ['Actual', 'Natural', 'Cyclical'], sets: [[6.5, 4.5], [7, 5], [6, 4.5], [3.5, 4.5], [5.5, 4], [8, 5], [4, 5], [7.5, 5]], inp: ([actual, natural]) => ({ actual, natural }), val: ([a, n]) => a - n, bad: ([a, n]) => a + n, show: fmt.pct, cells: ([a, n]) => [fmt.pct(a), fmt.pct(n)], y: 'Cyclical = actual ' + MINUS + ' natural.', tol: 0.06 },
  ];
  BADS.forEach((sp) => {
    const recs = [0, 1, 2, 3, 4, 5].map((n) => ({ n, k: String(n + 1), lvl: 3 }));
    kind('bad-' + sp.id, sp.d, 'badcell', recs, (x) => {
      const rows = [0, 1, 2, 3].map((j) => sp.sets[(x.n * 2 + j) % sp.sets.length]);
      const answer = x.n % 4;
      const shown = rows.map((row, i) => (i === answer ? sp.bad(row) : sp.val(row)));
      const cells = rows.map((row, i) => [`Row ${i + 1}`].concat(sp.cells(row), [sp.show(shown[i])]));
      return fin({
        desk: sp.d, verb: 'badcell', lvl: 3, order: 'FIND THE BAD NUMBER', ask: 'A rookie filled in the last column. Tap the row with the wrong number.', columns: [''].concat(sp.cols), cells,
        options: cells.map((row) => ({ label: row[0] })), answer, fix: sp.show(sp.val(rows[answer])), check: { f: sp.f, inputs: rows.map(sp.inp), shown, tol: sp.tol }, why: sp.y,
      });
    });
  });

  /* ================= sort the pile ================= */
  const PILES = [
    { id: 'counted', d: 'gdp', lvl: 1, n: 14, ask: "Is each one in this year's U.S. GDP?", bins: ['Counted', 'Not counted'], pool: () => GDP.filter((g) => g.lvl <= 2).map((g) => ({ t: g.t, bin: g.line ? 0 : 1, y: g.y })) },
    { id: 'loop', d: 'gdp', lvl: 1, n: 10, ask: 'Does this money leave the circular flow or come in?', bins: ['Into the loop', 'Out of the loop'], pool: () => LOOP.map((l) => ({ t: l.t, bin: l.dir === 'in' ? 0 : 1, y: l.y })) },
    { id: 'labor', d: 'jobs', lvl: 1, n: 14, ask: 'Is each person in the labor force?', bins: ['In the labor force', 'Not in it'], pool: () => PEOPLE.map((p) => ({ t: p.t, bin: p.st === 'N' ? 1 : 0, y: p.y })) },
    { id: 'realnom', d: 'real', lvl: 1, n: 10, ask: 'Real or nominal?', bins: ['Real', 'Nominal'], pool: () => REALNOM.map((x) => ({ t: x.t, bin: x.key === 'Real' ? 0 : 1, y: x.y })) },
    { id: 'gainlose', d: 'costs', lvl: 1, n: 14, ask: 'Inflation turns out higher than everyone expected.', bins: ['Gains', 'Loses'], pool: () => EFFECTS.filter((e) => e.key !== 'protected').map((e) => ({ t: e.t, bin: e.key === 'gains' ? 0 : 1, y: e.y })) },
    { id: 'costs', d: 'costs', lvl: 2, n: 8, ask: 'Which cost of inflation is it?', bins: ['Menu costs', 'Shoe-leather costs'], pool: () => COSTS.map((c) => ({ t: c.t, bin: c.key === 'menu' ? 0 : 1, y: c.y })) },
    { id: 'phase', d: 'cycle', lvl: 1, n: 8, ask: 'Expansion or contraction?', bins: ['Expansion', 'Contraction'], pool: () => PHASES.filter((p) => p.key === 'expansion' || p.key === 'contraction').map((p) => ({ t: p.t, bin: p.key === 'expansion' ? 0 : 1, y: p.y })) },
    { id: 'types', d: 'jobs', lvl: 2, n: 8, ask: 'Frictional or cyclical?', bins: ['Frictional', 'Cyclical'], pool: () => TYPES.filter((x) => x.key !== 'S').map((x) => ({ t: x.t, bin: x.key === 'F' ? 0 : 1, y: x.y })) },
    { id: 'elastic', d: 'micro', lvl: 1, n: 6, ask: 'Is demand elastic or inelastic?', bins: ['Elastic', 'Inelastic'], pool: () => MICRO_ELASTIC.map((x) => ({ t: x.t, bin: x.key === 'Elastic' ? 0 : 1, y: x.y })) },
    { id: 'nameit', d: 'prices', lvl: 1, n: 8, ask: 'Prices still rising, or falling?', bins: ['Still rising', 'Falling'], pool: () => NAMEIT.filter((x) => x.key === 'dis' || x.key === 'de').map((x) => ({ t: x.t, bin: x.key === 'dis' ? 0 : 1, y: x.y })) },
  ];
  PILES.forEach((sp) => {
    const recs = Array.from({ length: sp.n }, (_, i) => ({ k: String(i + 1), lvl: sp.lvl }));
    kind('pile-' + sp.id, sp.d, 'pile', recs, (x, r) => {
      const pool = shuffle(r, sp.pool());
      const a = pool.filter((c) => c.bin === 0), b = pool.filter((c) => c.bin === 1);
      const nA = 1 + Math.floor(r() * 3);
      const cards = shuffle(r, a.slice(0, nA).concat(b.slice(0, 4 - nA)));
      return fin({ desk: sp.d, verb: 'pile', lvl: sp.lvl, order: 'SORT THE PILE', ask: sp.ask, cards, options: sp.bins.map((label, i) => ({ label, stampClass: 'neutral', key: i })), why: 'Every card went in the right pile.' }, cards.map((c) => c.t));
    });
  });

  /* ================= which one is different ================= */
  /* Every one of these says what the four things are being sorted by and names the possible groups,
     so a student is never guessing the rule. The reveal names each group in full. */
  const short = (s) => s.length <= 46;
  const PART = { C: 'consumption (C)', I: 'investment (I)', G: 'government purchases (G)', Xn: 'net exports (Xn)' };
  const LEFT_OUT = { used: 'a used good', intermediate: 'an intermediate good', financial: 'a stock or bond', transfer: 'a transfer', abroad: 'made abroad' };
  const LEFT_OUT3 = { used: 'used goods', intermediate: 'intermediate goods', financial: 'stocks and bonds', transfer: 'transfers', abroad: 'made abroad' };
  const binNote = (k) => `${B.BIN[k].label}: ${B.BIN[k].def}`;
  const SAME = 'Three are the same. Tap the one that is different.';
  const gdpNot = (a, b) => {
    const aIn = !!PART[a], bIn = !!PART[b];
    if (!aIn && !bIn) return { ask: 'None of these count in U.S. GDP. Three are left out for the same reason. Tap the one left out for a different reason.', why: `That one is ${LEFT_OUT[b]}. The other three are ${LEFT_OUT3[a]}.` };
    const ask = `Each one either counts in U.S. GDP or does not. ${SAME}`;
    if (aIn) return { ask, why: `That one does not count: it is ${LEFT_OUT[b]}. The other three count as ${PART[a]}.` };
    return { ask, why: `That one counts as ${PART[b]}. The other three do not count: they are ${LEFT_OUT3[a]}.` };
  };
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const ODD = [
    ...[['C', 'I'], ['I', 'C'], ['G', 'C'], ['C', 'G'], ['I', 'G'], ['G', 'I'], ['Xn', 'C'], ['C', 'Xn'], ['Xn', 'I'], ['I', 'Xn'], ['G', 'Xn'], ['Xn', 'G']].map(([a, b]) => ({ d: 'gdp', lvl: 2, ask: 'Each one counts in GDP as C, I, G, or Xn. Three are the same part. Tap the one that is a different part.', why: `That one is ${PART[b]}. The other three are ${PART[a]}.`, label: (g) => g.s, group: (k) => GDP.filter((g) => g.line === k && g.lvl <= 2), tag: (k) => B.BIN[k].label, note: binNote, a, b })),
    ...[['transfer', 'G'], ['G', 'transfer'], ['used', 'C'], ['C', 'used'], ['financial', 'I'], ['I', 'financial'], ['intermediate', 'C'], ['abroad', 'C'], ['C', 'abroad'], ['used', 'financial'], ['transfer', 'used']].map(([a, b]) => Object.assign({ d: 'gdp', lvl: 2, label: (g) => g.s, group: (k) => GDP.filter((g) => (g.line === k || g.no === k) && g.lvl <= 2 && !((a === 'G' || b === 'G') && /gift/i.test(g.s))), tag: (k) => B.BIN[k].label, note: (k) => (PART[k] ? `Counts as ${B.BIN[k].label}` : `Not counted: ${lower(B.BIN[k].label)}`), a, b }, gdpNot(a, b))),
    ...[['E', 'U'], ['U', 'E'], ['N', 'E'], ['E', 'N'], ['U', 'N'], ['N', 'U'], ['E', 'U'], ['U', 'N'], ['N', 'E']].map(([a, b], i) => ({ d: 'jobs', lvl: 1, ask: `The Bureau counts each person as employed, unemployed, or not in the labor force. Three get the same label. Tap the one who gets a different label.`, why: `That one is ${lower(B.BIN[b].label)}. The other three are ${lower(B.BIN[a].label)}.`, label: (p) => p.s, group: (k) => PEOPLE.filter((p) => p.st === k), tag: (k) => B.BIN[k].label, a, b, tagKey: i })),
    ...[['gains', 'loses'], ['loses', 'gains'], ['protected', 'loses'], ['loses', 'protected'], ['gains', 'protected'], ['protected', 'gains']].map(([a, b]) => ({ d: 'costs', lvl: 1, ask: 'Surprise inflation hits. Each one gains, loses, or is protected. Three get the same result. Tap the one that gets a different result.', why: `That one ${{ gains: 'gains', loses: 'loses', protected: 'is protected' }[b]}. The other three ${{ gains: 'gain', loses: 'lose', protected: 'are protected' }[a]}.`, label: (e) => e.s, group: (k) => EFFECTS.filter((e) => e.key === k), tag: (k) => B.BIN[k].label, a, b })),
    ...[['out', 'in'], ['in', 'out'], ['out', 'in'], ['in', 'out'], ['out', 'in'], ['in', 'out']].map(([a, b]) => ({ d: 'gdp', lvl: 1, ask: `Each one either takes money out of the circular flow or puts money into it. ${SAME}`, why: `That one ${b === 'out' ? 'takes money out of the loop' : 'puts money into the loop'}. The other three ${a === 'out' ? 'take money out' : 'put money in'}.`, label: (l) => l.s, group: (k) => LOOP.filter((l) => l.dir === k), tag: (k) => (k === 'out' ? 'Leaves the loop' : 'Comes into the loop'), a, b })),
    ...[['Real', 'Nominal'], ['Nominal', 'Real'], ['Real', 'Nominal'], ['Nominal', 'Real']].map(([a, b]) => ({ d: 'real', lvl: 1, ask: 'Each line describes real GDP or nominal GDP. Three describe the same one. Tap the line that describes the other one.', why: `That line describes ${lower(b)} GDP. The other three describe ${lower(a)} GDP.`, label: (x) => x.t, group: (k) => REALNOM.filter((x) => x.key === k && short(x.t) && !/\b(pay|rate|raise)\b/i.test(x.t)), tag: (k) => `${k} GDP`, a, b })),
    ...[['dis', 'de'], ['de', 'dis'], ['rising', 'de'], ['dis', 'rising'], ['rising', 'dis'], ['de', 'rising']].map(([a, b]) => ({ d: 'prices', lvl: 2, ask: `Each line is rising inflation, disinflation, or deflation. ${SAME}`, why: `That one is ${lower(B.BIN[b].label)}. The other three are ${lower(B.BIN[a].label)}.`, label: (x) => x.t, group: (k) => NAMEIT.filter((x) => x.key === k && short(x.t)), tag: (k) => B.BIN[k].label, note: binNote, a, b })),
    ...[['expansion', 'contraction'], ['contraction', 'expansion'], ['expansion', 'contraction'], ['contraction', 'expansion']].map(([a, b]) => ({ d: 'cycle', lvl: 1, ask: 'Each line describes an expansion or a contraction. Three describe the same phase. Tap the line that describes the other phase.', why: `That line describes ${b === 'expansion' ? 'an expansion' : 'a contraction'}. The other three describe ${a === 'expansion' ? 'an expansion' : 'a contraction'}.`, label: (x) => x.t, group: (k) => PHASES.filter((x) => x.key === k && short(x.t)), tag: (k) => B.BIN[k].label, note: binNote, a, b })),
    ...[['menu', 'shoe'], ['shoe', 'menu']].map(([a, b]) => ({ d: 'costs', lvl: 2, ask: `Each one is a menu cost or a shoe-leather cost of inflation. ${SAME}`, why: `That one is a ${b === 'menu' ? 'menu' : 'shoe-leather'} cost. The other three are ${a === 'menu' ? 'menu' : 'shoe-leather'} costs.`, label: (x) => x.t, group: (k) => COSTS.filter((x) => x.key === k && short(x.t)), tag: (k) => B.BIN[k].label, note: binNote, a, b })),
    ...[['Elastic', 'Inelastic'], ['Inelastic', 'Elastic']].map(([a, b]) => ({ d: 'micro', lvl: 1, ask: `The price goes up. For each one, demand is elastic (buyers switch away) or inelastic (buyers keep buying). ${SAME}`, why: `Demand for that one is ${lower(b)}. Demand for the other three is ${lower(a)}.`, label: (x) => x.t, group: (k) => MICRO_ELASTIC.filter((x) => x.key === k && !/%/.test(x.t)), tag: (k) => k, note: (k) => (k === 'Elastic' ? 'Elastic: buyers can switch away' : 'Inelastic: buyers keep buying'), a, b })),
  ];
  const oddRecs = ODD.filter((o) => o.group(o.a).length >= 3 && o.group(o.b).length >= 1).map((o, i) => Object.assign({ k: `o${i}` }, o));
  eachDesk(oddRecs, 'odd', 'oddone', (x, r) => {
    const three = shuffle(r, x.group(x.a)).slice(0, 3);
    const odd = pickOne(r, x.group(x.b));
    const all = shuffle(r, three.concat([odd]));
    const options = all.map((rec) => { const k = rec === odd ? x.b : x.a; return { label: x.label(rec), tag: x.tag(k), note: x.note ? x.note(k) : x.tag(k) }; });
    return fin({ desk: x.d, verb: 'oddone', lvl: x.lvl, order: 'WHICH ONE IS DIFFERENT?', ask: x.ask, options, answer: all.indexOf(odd), why: x.why }, options.map((o) => o.label));
  });

  /* ================= tap the wave: anywhere on the curve, no markers ================= */
  function zonesFor(prop, phi) {
    const h = 0.0005;
    const slope = (x) => (wave.actual(x + h, phi) - wave.actual(x - h, phi)) / (2 * h);
    const gap = (x) => wave.actual(x, phi) - wave.potential(x);
    if (prop === 'peak' || prop === 'trough') {
      const out = [];
      for (let x = 0.02; x < 0.98; x += 0.0015) {
        const a = slope(x), b = slope(x + 0.0015);
        if (prop === 'peak' && a > 0 && b <= 0) out.push([Math.max(0, x - 0.045), Math.min(1, x + 0.045)]);
        if (prop === 'trough' && a < 0 && b >= 0) out.push([Math.max(0, x - 0.045), Math.min(1, x + 0.045)]);
      }
      return out;
    }
    const test = { contraction: (x) => slope(x) < 0, expansion: (x) => slope(x) > 0, above: (x) => gap(x) > 0.012, below: (x) => gap(x) < -0.012 }[prop];
    const out = [];
    let start = null;
    for (let x = 0; x <= 1.0001; x += 0.002) {
      if (x <= 1 && test(x)) { if (start === null) start = x; } else if (start !== null) { if (x - start > 0.05) out.push([start, Math.min(1, x)]); start = null; }
    }
    return out;
  }
  const WAVES = [
    { prop: 'peak', order: 'TAP THE WAVE AT A PEAK', ask: 'Tap the top of the wave.', lvl: 1, y: 'The peak is the top of the wave. Real GDP falls next.' },
    { prop: 'trough', order: 'TAP THE WAVE AT A TROUGH', ask: 'Tap the bottom of the wave.', lvl: 1, y: 'The trough is the bottom of the wave. Real GDP rises next.' },
    { prop: 'contraction', order: 'TAP WHERE THE WAVE FALLS', ask: 'Contraction: tap anywhere real GDP is falling.', lvl: 1, y: 'Falling real GDP is a contraction.' },
    { prop: 'expansion', order: 'TAP WHERE THE WAVE RISES', ask: 'Expansion: tap anywhere real GDP is rising.', lvl: 1, y: 'Rising real GDP is an expansion.' },
    { prop: 'above', order: 'TAP THE WAVE ABOVE POTENTIAL', ask: 'Positive gap: tap where actual is above potential.', lvl: 2, y: 'Above the line is a positive gap. Unemployment is below the natural rate.' },
    { prop: 'below', order: 'TAP THE WAVE BELOW POTENTIAL', ask: 'Negative gap: tap where actual is below potential.', lvl: 2, y: 'Below the line is a negative gap. Unemployment is above the natural rate.' },
  ];
  const waveRecs = [];
  WAVES.forEach((w) => PHIS.forEach((phi, j) => { if (zonesFor(w.prop, phi).length) waveRecs.push(Object.assign({ k: `${w.prop}${j}`, phi }, w)); }));
  kind('wave', 'cycle', 'wave', waveRecs, (x) => finish({ desk: 'cycle', verb: 'wave', lvl: x.lvl, order: x.order, ask: x.ask, prop: x.prop, zones: zonesFor(x.prop, x.phi), chart: { kind: 'cycle', phi: x.phi, markers: [] }, why: x.y }));

  /* ================= label it: one spot lights up at a time ================= */
  const labelRecs = [];
  PHIS.forEach((phi, j) => { for (let i = 0; i < 3; i++) labelRecs.push({ k: `c${j}${i}`, phi, d: 'cycle', lvl: 1 }); });
  kind('label-cycle', 'cycle', 'label', labelRecs, (x, r) => {
    const pts = wave.points(x.phi);
    const of = (ph) => pts.filter((p) => p.phase === ph);
    let chosen = null;
    for (let tries = 0; tries < 60 && !chosen; tries++) {
      const trial = ['peak', 'trough', 'expansion', 'contraction'].map((ph) => pickOne(r, of(ph))).sort((a, b) => a.x - b.x);
      if (trial.every((p, i) => i === 0 || p.x - trial[i - 1].x >= 0.14)) chosen = trial;
    }
    if (!chosen) return null;
    const options = bins('expansion', 'peak', 'contraction', 'trough');
    const steps = shuffle(r, chosen.map((m, i) => ({ spot: i, answer: options.findIndex((o) => o.key === m.phase) })));
    return finish({ desk: 'cycle', verb: 'label', lvl: 1, diagram: 'cycle', order: 'LABEL THE GRAPH', ask: 'Name each lit point.', chart: { kind: 'cycle', phi: x.phi, markers: chosen, pickOne: false, labeling: true }, options, steps, why: 'Rising is expansion, falling is contraction, and the turning points are peak and trough.' });
  });
  const FLOW_SPOTS = ['Goods and services', 'Consumption expenditures', 'Factors of production', 'Wages, rent, interest, profit', 'Product market', 'Factor market'];
  kind('label-flow', 'gdp', 'label', Array.from({ length: 14 }, (_, i) => ({ k: `f${i}`, lvl: 2 })), (x, r) => {
    const spots = shuffle(r, FLOW_SPOTS.map((_, i) => i)).slice(0, 4);
    const options = FLOW_SPOTS.map((label) => ({ label }));
    return finish({ desk: 'gdp', verb: 'label', lvl: 2, diagram: 'flow', order: 'LABEL THE LOOP', ask: 'Name each lit part of the circular flow.', options, steps: spots.map((s) => ({ spot: s, answer: s })), why: 'Inner loop: real things. Outer loop: money. Top: product market. Bottom: factor market.' });
  });

  /* ================= more graphs (Nov 17, 2026) =================
     Three new pictures, all under the chart verb, so the clock, the pay, and the keys are the ones students know.
     - ppc: the production possibilities curve from Unit 1, read as Unit 2 reads it. On the curve is potential real GDP,
       inside it is a recession, and only growth moves the curve. After the answer the curve shifts or the dot moves.
     - sd: supply and demand from Unit 1. A price ceiling or floor to read, and a curve that shifts after the answer.
     - line: the inflation rate as a line. A falling line is not falling prices.
     Every key below is computed from the numbers in the record, and bank.test.js computes it again its own way. */
  const graphTask = (t, more) => { fin(t, t.options.map((o) => o.label)); t.clock = Math.round((t.clock + (more || 5)) * 10) / 10; return t; };
  const PPC_LAYOUTS = [
    { k: 'a', on: 52, inside: [0.44, 0.42], outside: [0.90, 0.74] },
    { k: 'b', on: 28, inside: [0.32, 0.56], outside: [0.74, 0.88] },
    { k: 'c', on: 66, inside: [0.58, 0.30], outside: [0.92, 0.66] },
  ];
  const PPC_ASKS = [
    { k: 'rec', prop: 'inside', lvl: 1, order: 'TAP THE RECESSION', ask: 'The curve is what the economy can make at full employment. Tap the point that shows a recession.', y: 'Inside the curve, workers and plants sit idle. Actual real GDP is below potential.' },
    { k: 'cyc', prop: 'inside', lvl: 2, order: 'TAP CYCLICAL UNEMPLOYMENT', ask: 'The curve is what the economy can make at full employment. Tap the point with cyclical unemployment.', y: 'Cyclical unemployment means idle workers, so output is inside the curve.' },
    { k: 'full', prop: 'on', lvl: 2, order: 'TAP FULL EMPLOYMENT', ask: 'Tap the point where actual real GDP equals potential real GDP.', y: 'On the curve, the economy is at full employment. Unemployment equals the natural rate.' },
    { k: 'out', prop: 'outside', lvl: 2, order: 'TAP THE POINT OUT OF REACH', ask: 'Tap the point the economy cannot reach until the curve shifts out.', y: 'Outside the curve takes more resources or better technology.' },
    { k: 'gap', prop: 'inside', lvl: 3, order: 'TAP THE NEGATIVE GAP', ask: 'The curve is potential real GDP. Tap the point with a negative output gap.', y: 'A negative gap means actual real GDP is below potential. That is inside the curve.' },
    { k: 'nat', prop: 'on', lvl: 3, order: 'TAP THE NATURAL RATE', ask: 'Tap the point where unemployment equals the natural rate.', y: 'At the natural rate there is no cyclical unemployment, so the economy is on the curve.' },
  ];
  const rad = (deg) => deg * Math.PI / 180;
  const ppcPoints = (L) => [
    { where: 'inside', x: L.inside[0], y: L.inside[1] },
    { where: 'on', x: Math.cos(rad(L.on)), y: Math.sin(rad(L.on)) },
    { where: 'outside', x: L.outside[0], y: L.outside[1] },
  ];
  const ppcTapRecs = [];
  PPC_ASKS.forEach((a) => PPC_LAYOUTS.forEach((L) => ppcTapRecs.push({ k: a.k + '-' + L.k, lvl: a.lvl, a, L })));
  kind('ppc-tap', 'cycle', 'chart', ppcTapRecs, (x, r) => {
    const pts = shuffle(r, ppcPoints(x.L));
    return finish({
      desk: 'cycle', verb: 'chart', lvl: x.a.lvl, order: x.a.order, ask: x.a.ask,
      chart: { kind: 'ppc', points: pts, pickOne: true, prop: x.a.prop },
      options: pts.map((p, i) => ({ label: 'Point ' + (i + 1) })), answer: pts.findIndex((p) => p.where === x.a.prop), why: x.a.y,
    });
  });

  /* curve: 'out', 'in', or null. dot: where the economy starts and, when the curve stays put, where it ends up. */
  const PPC_MOVES = [
    { k: 'layoffs', lvl: 2, t: 'A recession hits. Firms lay off workers and idle their plants.', curve: null, from: 'on', to: 'inside', y: 'The workers and plants still exist, so the curve stays. The economy moves to a point inside it.' },
    { k: 'rehire', lvl: 2, t: 'The recession ends. Laid-off workers are hired back.', curve: null, from: 'inside', to: 'on', y: 'Idle workers go back to work. The economy moves back to the same curve.' },
    { k: 'cyclical', lvl: 3, t: 'Cyclical unemployment rises from 0% to 3%.', curve: null, from: 'on', to: 'inside', y: 'More idle workers means less output from the same resources. A move inside the curve, not a shift.' },
    { k: 'natural', lvl: 3, t: 'Unemployment falls from 8% back to the natural rate of 5%.', curve: null, from: 'inside', to: 'on', y: 'The economy returns to full employment. It moves back to the curve it already had.' },
    { k: 'tech', lvl: 1, t: 'New technology lets every worker make more.', curve: 'out', from: 'on', y: 'More output from the same resources. Potential real GDP rises.' },
    { k: 'capital', lvl: 2, t: 'Firms build many new factories and machines.', curve: 'out', from: 'on', y: 'More capital means the economy can make more. Potential real GDP rises.' },
    { k: 'school', lvl: 2, t: 'Workers get more education and training.', curve: 'out', from: 'on', y: 'More skilled workers can make more. Potential real GDP rises.' },
    { k: 'laborforce', lvl: 2, t: 'The labor force grows by two million workers.', curve: 'out', from: 'on', y: 'More workers means more can be made. Potential real GDP rises.' },
    { k: 'storm', lvl: 1, t: 'A hurricane destroys factories, roads, and ports.', curve: 'in', from: 'on', y: 'With less capital, the economy can make less. Potential real GDP falls.' },
    { k: 'shrink', lvl: 3, t: 'The working-age population shrinks for a decade.', curve: 'in', from: 'on', y: 'Fewer workers means less can be made. Potential real GDP falls.' },
  ];
  const PPC_OPTS = ['Shifts out', 'Shifts in', 'No shift'];
  kind('ppc-move', 'cycle', 'chart', PPC_MOVES, (x) => graphTask({
    desk: 'cycle', verb: 'chart', lvl: x.lvl, order: 'DOES THE PPC SHIFT?', text: x.t,
    chart: { kind: 'ppc', dot: x.from, to: x.to || null, curve: x.curve },
    options: PPC_OPTS.map((label) => ({ label })), answer: x.curve === 'out' ? 0 : x.curve === 'in' ? 1 : 2, why: x.y,
  }));

  /* Supply and demand. Demand is P = 10 - Q and supply is P = Q, so equilibrium is at 5 and 5. */
  const SD_EQ = 5;
  const SD_CONTROLS = [
    { k: 'rent', lvl: 1, type: 'ceiling', p: 3, t: 'Apartments. The town sets the price ceiling on the graph.' },
    { k: 'tickets', lvl: 2, type: 'ceiling', p: 7, t: 'Concert tickets. The law sets the price ceiling on the graph.' },
    { k: 'gas', lvl: 1, type: 'ceiling', p: 3.5, t: 'Gasoline. The state sets the price ceiling on the graph.' },
    { k: 'wheat', lvl: 1, type: 'floor', p: 7, t: 'Wheat. The government sets the price floor on the graph.' },
    { k: 'milk', lvl: 2, type: 'floor', p: 3, t: 'Milk. The government sets the price floor on the graph.' },
    { k: 'sugar', lvl: 1, type: 'floor', p: 6.5, t: 'Sugar. The government sets the price floor on the graph.' },
    { k: 'minwage', lvl: 2, type: 'floor', p: 7, labor: true, t: 'Summer jobs. The minimum wage is the price floor on the graph.' },
    { k: 'minwage2', lvl: 2, type: 'floor', p: 3.5, labor: true, t: 'Tutors. The minimum wage is the price floor on the graph.' },
  ];
  const sdControlKey = (c) => (c.type === 'ceiling' ? (c.p < SD_EQ ? 'Shortage' : 'No effect') : (c.p > SD_EQ ? 'Surplus' : 'No effect'));
  const sdControlWhy = (c) => {
    const key = sdControlKey(c);
    if (key === 'Shortage') return 'The ceiling is below equilibrium, so it binds. Buyers want more than sellers offer. A shortage.';
    if (key === 'Surplus') return c.labor ? 'The floor is above the equilibrium wage, so it binds. More people want jobs than firms will hire. A surplus of labor.' : 'The floor is above equilibrium, so it binds. Sellers offer more than buyers want. A surplus.';
    return c.type === 'ceiling' ? 'The ceiling is above equilibrium, so it does not bind. The market stays at equilibrium.' : 'The floor is below equilibrium, so it does not bind. The market stays at equilibrium.';
  };
  kind('sd-control', 'micro', 'chart', SD_CONTROLS, (x) => {
    const options = plain('Shortage', 'Surplus', 'No effect');
    return graphTask({
      desk: 'micro', verb: 'chart', lvl: x.lvl, order: 'FLASHBACK: READ THE GRAPH', text: x.t,
      chart: { kind: 'sd', control: { type: x.type, p: x.p }, labor: !!x.labor },
      options, answer: options.findIndex((o) => o.label === sdControlKey(x)), why: sdControlWhy(x),
    });
  });

  /* c: which curve. d: +1 shifts right, -1 shifts left. The cause words match the Unit 1 list of shifters. */
  const SD_SHIFTS = [
    { k: 'meals', lvl: 1, c: 'D', d: 1, t: 'The market for restaurant meals, a normal good. Incomes rise in an expansion.', y: 'Higher income raises demand for a normal good.' },
    { k: 'cars', lvl: 1, c: 'D', d: -1, t: 'The market for new cars, a normal good. A recession cuts incomes.', y: 'Lower income cuts demand for a normal good.' },
    { k: 'tea', lvl: 2, c: 'D', d: 1, t: 'The market for tea. The price of coffee, a substitute, rises.', y: 'Buyers switch from coffee to tea.' },
    { k: 'buns', lvl: 2, c: 'D', d: -1, t: 'The market for hot dog buns. The price of hot dogs, a complement, rises.', y: 'Fewer hot dogs sold means fewer buns wanted.' },
    { k: 'sneakers', lvl: 3, c: 'D', d: 1, t: 'The market for sneakers today. Buyers expect the price to jump next month.', y: 'Buyers rush to buy before the price rises.' },
    { k: 'flour', lvl: 1, c: 'S', d: -1, t: 'The market for bagels. The price of flour rises.', y: 'A higher input cost cuts supply.' },
    { k: 'ovens', lvl: 1, c: 'S', d: 1, t: 'The market for bagels. New ovens bake twice as many an hour.', y: 'Better technology raises supply.' },
    { k: 'frost', lvl: 1, c: 'S', d: -1, t: 'The market for oranges. A frost kills part of the crop.', y: 'Less can be brought to market at every price.' },
    { k: 'shops', lvl: 2, c: 'S', d: 1, t: 'The market for pizza. Five new pizza shops open in town.', y: 'More sellers means more supply.' },
    { k: 'wages', lvl: 2, c: 'S', d: -1, t: 'The market for bicycles. The wage paid to bicycle factory workers rises.', y: 'A higher input cost cuts supply.' },
  ];
  const SD_SHIFT_OPTS = ['Demand shifts right', 'Demand shifts left', 'Supply shifts right', 'Supply shifts left'];
  const sdShiftResult = (x) => {
    const up = x.c === 'D' ? x.d > 0 : x.d < 0;          // price rises when demand rises or supply falls
    const more = x.d > 0;                                 // quantity follows the direction of the shift
    return `${x.c === 'D' ? 'Demand' : 'Supply'} shifts ${x.d > 0 ? 'right' : 'left'}. Price ${up ? 'rises' : 'falls'} and quantity ${more ? 'rises' : 'falls'}.`;
  };
  kind('sd-shift', 'micro', 'chart', SD_SHIFTS, (x) => graphTask({
    desk: 'micro', verb: 'chart', lvl: x.lvl, order: 'FLASHBACK: WHICH CURVE SHIFTS?', text: x.t,
    chart: { kind: 'sd', shift: { c: x.c, d: x.d } },
    options: SD_SHIFT_OPTS.map((label) => ({ label })), answer: (x.c === 'D' ? 0 : 2) + (x.d > 0 ? 0 : 1), why: `${x.y} ${sdShiftResult(x)}`,
  }));

  /* The inflation rate as a line, one point a year. Each ask is used only where exactly one year fits. */
  const INFL_LINES = [
    { k: 'fall', vals: [6, 5, 4, 3, 2] },
    { k: 'hump', vals: [2, 4, 7, 5, 3] },
    { k: 'dip', vals: [3, 4, 2, -2, 1] },
    { k: 'late', vals: [1, 2, 3, 5, -1] },
    { k: 'slow', vals: [8, 6, 4, 3, 1] },
    { k: 'wob', vals: [2, 3, 1, 4, 6] },
  ];
  const priceLevels = (vals) => { let p = 100; return vals.map((v) => (p *= 1 + v / 100)); };
  const only = (list) => (list.length === 1 ? list[0] : -1);
  const idxWhere = (vals, f) => vals.map((v, i) => (f(v, i) ? i : -1)).filter((i) => i >= 0);
  const INFL_ASKS = [
    { k: 'fastest', lvl: 1, order: 'TAP THE FASTEST PRICE RISE', ask: 'The line is the inflation rate. Tap the year prices rose fastest.', pick: (v) => only(idxWhere(v, (x) => x === Math.max(...v))), y: () => 'The highest point on the line is the highest inflation rate.' },
    { k: 'deflation', lvl: 1, order: 'TAP THE YEAR PRICES FELL', ask: 'The line is the inflation rate. Tap the year the price level fell.', pick: (v) => only(idxWhere(v, (x) => x < 0)), y: () => 'Prices fall only when the inflation rate is below zero. That is deflation.' },
    { k: 'dis', lvl: 2, order: 'TAP THE DISINFLATION YEAR', ask: 'The line is the inflation rate. Disinflation: the rate falls but stays above zero.', pick: (v) => only(idxWhere(v, (x, i) => i > 0 && x > 0 && x < v[i - 1])), y: () => 'The rate fell but stayed above zero. Prices still rose, just more slowly.' },
    { k: 'level', lvl: 3, order: 'TAP THE HIGHEST PRICE LEVEL', ask: 'The line is the inflation rate. Tap the year the price level was highest.', pick: (v) => { const p = priceLevels(v), top = Math.max(...p); return only(idxWhere(p, (x) => top - x < 0.05)); }, y: (v, a) => (v.every((x) => x > 0) ? `The rate stayed above zero, so prices rose every year.${v[v.length - 1] < Math.max(...v) ? ' A falling line is not falling prices.' : ' The last year is the highest.'}` : a === v.length - 1 ? 'Prices rose in every year but one, and ended at their highest.' : `Prices rose through Year ${a + 1}, then fell in Year ${a + 2}.${a + 2 < v.length ? ' The rise after that did not make up for the fall.' : ''}`) },
  ];
  const inflRecs = [];
  INFL_ASKS.forEach((a) => INFL_LINES.forEach((L) => { const ans = a.pick(L.vals); if (ans >= 0) inflRecs.push({ k: a.k + '-' + L.k, lvl: a.lvl, a, L, ans }); }));
  kind('infl-line', 'prices', 'chart', inflRecs, (x) => graphTask({
    desk: 'prices', verb: 'chart', lvl: x.a.lvl, order: x.a.order, ask: x.a.ask,
    chart: { kind: 'line', pts: x.L.vals.map((v, i) => ({ label: 'Year ' + (i + 1), v })), suf: '%', pickOne: true, prop: x.a.k },
    options: x.L.vals.map((v, i) => ({ label: 'Year ' + (i + 1) })), answer: x.ans, why: x.a.y(x.L.vals, x.ans),
  }, x.a.k === 'level' ? 8 : 1));
  B.GRAPHS = { PPC_LAYOUTS, PPC_ASKS, PPC_MOVES, SD_EQ, SD_CONTROLS, SD_SHIFTS, INFL_LINES };

  /* ================= AP style, with numbers (Nov 17, 2026) =================
     Five-choice number questions in AP wording, several number sets each, so the AP style topic does not repeat itself.
     v is the key. Each wrong choice is a named mistake a student really makes. Choices read low to high.
     bank.test.js works every key out again with its own formulas. */
  const one = (v) => Math.round(v * 10) / 10;
  const pct1 = (v) => `${v < 0 ? B.MINUS : ''}${String(one(Math.abs(v)))}%`;
  const bil = (v) => `$${fmt.num(Math.round(v))} billion`;
  const dol = (v) => fmt.usd(Math.round(v));
  const dol2 = (v) => `$${(Math.round(v * 100) / 100).toFixed(2)}`;
  const idx = (v) => String(one(v));
  const APN = [
    { k: 'urate', d: 'jobs', lvl: 2, f: 'urate', show: pct1,
      sets: [[1840, 160, 500], [930, 70, 250], [2760, 240, 1000], [475, 25, 300], [1410, 90, 500], [3680, 320, 1000]],
      q: ([e, u, n]) => `A country has ${fmt.num(e)} employed workers, ${fmt.num(u)} unemployed workers, and ${fmt.num(n)} adults who are not in the labor force. What is the unemployment rate?`,
      v: ([e, u]) => u / (e + u) * 100,
      w: [([e, u, n]) => u / (e + u + n) * 100, ([e, u]) => u / e * 100, ([e, u, n]) => (u + n) / (e + u + n) * 100, ([e, u]) => e / (e + u) * 100],
      y: ([e, u]) => `${fmt.num(u)} ÷ ${fmt.num(e + u)} × 100. The labor force is the employed plus the unemployed.` },
    { k: 'lfpr', d: 'jobs', lvl: 2, f: 'lfpr', show: pct1,
      sets: [[1840, 160, 500], [930, 70, 250], [2760, 240, 1000], [475, 25, 300], [1410, 90, 500], [3680, 320, 1000]],
      q: ([e, u, n]) => `A town has ${fmt.num(e)} people with jobs, ${fmt.num(u)} people looking for work, and ${fmt.num(n)} adults who are not looking. What is the labor force participation rate?`,
      v: ([e, u, n]) => (e + u) / (e + u + n) * 100,
      w: [([e, u, n]) => e / (e + u + n) * 100, ([e, u]) => u / (e + u) * 100, ([e, u, n]) => n / (e + u + n) * 100, ([e, u]) => e / (e + u) * 100],
      y: ([e, u, n]) => `${fmt.num(e + u)} ÷ ${fmt.num(e + u + n)} × 100. Divide the labor force by all adults.` },
    { k: 'gdp', d: 'gdp', lvl: 2, f: 'gdp', show: bil,
      sets: [[640, 130, 210, 90, 120], [420, 90, 160, 75, 45], [910, 200, 330, 150, 190], [550, 140, 180, 60, 110], [720, 160, 240, 130, 100]],
      q: ([c, i, g, x, m]) => `In billions of dollars, consumption is ${c}, investment is ${i}, government purchases are ${g}, exports are ${x}, and imports are ${m}. What is GDP?`,
      v: ([c, i, g, x, m]) => c + i + g + x - m,
      w: [([c, i, g, x, m]) => c + i + g + x + m, ([c, i, g]) => c + i + g, ([c, i, g, x]) => c + i + g + x, ([c, i, g, x, m]) => c + i + g + m - x],
      y: ([c, i, g, x, m]) => `${c} + ${i} + ${g} + (${x} ${B.MINUS} ${m}).` },
    { k: 'cpi', d: 'prices', lvl: 2, f: 'cpi', show: idx,
      sets: [[80, 92], [250, 270], [60, 75], [400, 460], [150, 168], [320, 352]],
      q: ([b, n]) => `A basket of goods cost $${b} in the base year. The same basket costs $${n} this year. What is the price index this year?`,
      v: ([b, n]) => n / b * 100,
      w: [([b, n]) => b / n * 100, ([b, n]) => (n - b) / b * 100, ([b, n]) => 100 + (n - b), ([b, n]) => 100 + (n - b) / n * 100],
      y: ([b, n]) => `${n} ÷ ${b} × 100.` },
    { k: 'infl', d: 'prices', lvl: 2, f: 'infl', show: pct1,
      sets: [[140, 147], [220, 231], [125, 135], [160, 164], [250, 265], [180, 171]],
      q: ([a, b]) => `The consumer price index goes from ${a} to ${b} in one year. What is the inflation rate for that year?`,
      v: ([a, b]) => (b - a) / a * 100,
      w: [([a, b]) => (b - a) / b * 100, ([a, b]) => b - a, ([a, b]) => b / a * 100, ([a, b]) => a / b * 100],
      y: ([a, b]) => `(${b} ${B.MINUS} ${a}) ÷ ${a} × 100. Divide by the old index.` },
    { k: 'realgdp', d: 'real', lvl: 2, f: 'realgdp', show: bil,
      sets: [[1380, 115], [2400, 120], [1650, 110], [1890, 105], [1560, 130], [840, 112]],
      q: ([n, d]) => `A country has a nominal GDP of $${fmt.num(n)} billion. With a GDP deflator of ${d}, what is its real GDP?`,
      v: ([n, d]) => n / d * 100,
      w: [([n, d]) => n * d / 100, ([n, d]) => n - d, ([n, d]) => n / d, ([n, d]) => n * (200 - d) / 100],
      y: ([n, d]) => `${fmt.num(n)} ÷ ${d} × 100.` },
    { k: 'deflator', d: 'real', lvl: 2, f: 'deflator', show: idx,
      sets: [[1320, 1200], [2100, 1750], [1890, 1800], [1610, 1400], [2760, 2400], [1375, 1250]],
      q: ([n, re]) => `Nominal GDP is $${fmt.num(n)} billion and real GDP is $${fmt.num(re)} billion. What is the GDP deflator?`,
      v: ([n, re]) => n / re * 100,
      w: [([n, re]) => re / n * 100, ([n, re]) => n - re, ([n, re]) => (n - re) / re * 100, ([n, re]) => 100 + (n - re) / n * 100],
      y: ([n, re]) => `${fmt.num(n)} ÷ ${fmt.num(re)} × 100.` },
    { k: 'realrate', d: 'costs', lvl: 2, f: 'realrate', show: pct1,
      sets: [[9, 4], [6, 2], [5, 7], [11, 3], [4, 6], [10, 6]],
      q: ([i, p]) => `A bank charges a nominal interest rate of ${i} percent on a loan. Inflation over the year is ${p} percent. What is the real interest rate?`,
      v: ([i, p]) => i - p,
      w: [([i, p]) => i + p, ([i, p]) => p - i, ([i]) => i, ([i, p]) => i * p],
      y: ([i, p]) => `${i} ${B.MINUS} ${p}.` },
    { k: 'percap', d: 'miss', lvl: 2, f: 'percap', show: dol,
      sets: [[840, 28], [1250, 50], [360, 12], [990, 45], [1560, 60], [480, 32]],
      q: ([g, p]) => `A country has a GDP of $${fmt.num(g)} billion and a population of ${p} million. What is its GDP per capita?`,
      v: ([g, p]) => g * 1000 / p,
      w: [([g, p]) => g / p, ([g, p]) => g * 100 / p, ([g, p]) => g * 10000 / p, ([g, p]) => g * p],
      y: ([g, p]) => `${fmt.num(g)} billion ÷ ${p} million.` },
    { k: 'gap', d: 'cycle', lvl: 2, f: 'gap', show: pct1,
      sets: [[1900, 2000], [1260, 1200], [2850, 3000], [1560, 1500], [2300, 2500], [1785, 1700]],
      q: ([a, p]) => `Actual real GDP is $${fmt.num(a)} billion and potential real GDP is $${fmt.num(p)} billion. What is the output gap as a percent of potential real GDP?`,
      v: ([a, p]) => (a - p) / p * 100,
      w: [([a, p]) => (p - a) / p * 100, ([a, p]) => (a - p) / a * 100, ([a, p]) => a / p * 100, ([a, p]) => (p - a) / a * 100],
      y: ([a, p]) => `(${fmt.num(a)} ${B.MINUS} ${fmt.num(p)}) ÷ ${fmt.num(p)} × 100.` },
    { k: 'cyclical', d: 'cycle', lvl: 2, f: 'cyclical', show: pct1,
      sets: [[7.5, 5], [4, 5.5], [9, 5], [3.5, 4.5], [6.5, 4]],
      q: ([u, n]) => `The unemployment rate is ${u} percent. The natural rate of unemployment is ${n} percent. What is cyclical unemployment?`,
      v: ([u, n]) => u - n,
      w: [([u, n]) => n - u, ([u, n]) => u + n, ([u]) => u, ([u, n]) => n],
      y: ([u, n]) => `${u} ${B.MINUS} ${n}. Cyclical is the part above or below the natural rate.` },
    { k: 'realwage', d: 'prices', lvl: 2, f: 'realwage', show: dol2,
      sets: [[26, 130], [21, 105], [36, 120], [33, 110], [45, 125]],
      q: ([w, c]) => `A worker earns $${w} an hour. The CPI is ${c}, and it was 100 in the base year. What is the real wage in base-year dollars?`,
      v: ([w, c]) => w / c * 100,
      w: [([w, c]) => w * c / 100, ([w, c]) => w * (200 - c) / 100, ([w]) => w, ([w, c]) => w * (c - 100) / 100],
      y: ([w, c]) => `${w} ÷ ${c} × 100.` },
    /* added Nov 17, 2026 (evening): the price level from two growth rates, and a whole basket worked in one question */
    { k: 'pricegrowth', d: 'real', lvl: 2, f: 'nomgrow', show: pct1,
      sets: [[5, 2], [6, 4], [4, 1], [3, 5], [9, 3], [8, 2]],
      q: ([n, re]) => `Nominal GDP grows ${n} percent in a year, and real GDP grows ${re} percent. By about how much does the price level change?`,
      v: ([n, re]) => n - re,
      w: [([n, re]) => n + re, ([n, re]) => re - n, ([n]) => n, ([n, re]) => re],
      y: ([n, re]) => `${n} ${B.MINUS} ${re}. Nominal growth is about real growth plus inflation.` },
    // [slices, slice price in Year 1 and Year 2, rides, ride price in Year 1 and Year 2]
    { k: 'basket', d: 'prices', lvl: 3, f: 'basketinfl', show: pct1,
      sets: [[10, 3, 4, 5, 4, 4], [8, 2, 3, 4, 4, 4], [20, 4, 5, 5, 4, 3], [5, 4, 5, 10, 3, 3], [4, 5, 3, 10, 2, 2], [10, 4, 6, 5, 2, 2]],
      q: ([q1, a1, b1, q2, a2, b2]) => `A basket holds ${q1} slices of pizza and ${q2} bus rides. A slice goes from $${a1} to $${b1}. ${a2 === b2 ? `A ride stays at $${a2}.` : `A ride goes from $${a2} to $${b2}.`} By what percent does the cost of the basket change?`,
      v: ([q1, a1, b1, q2, a2, b2]) => (q1 * b1 + q2 * b2 - (q1 * a1 + q2 * a2)) / (q1 * a1 + q2 * a2) * 100,
      w: [([q1, a1, b1, q2, a2, b2]) => (q1 * b1 + q2 * b2 - (q1 * a1 + q2 * a2)) / (q1 * b1 + q2 * b2) * 100, ([, a1, b1, , a2, b2]) => (b1 + b2 - (a1 + a2)) / (a1 + a2) * 100,
        ([q1, a1, b1, q2, a2, b2]) => (q1 * b1 + q2 * b2) / (q1 * a1 + q2 * a2) * 100, ([, a1, b1]) => (b1 - a1) / a1 * 100],
      y: ([q1, a1, b1, q2, a2, b2]) => { const o = q1 * a1 + q2 * a2, n = q1 * b1 + q2 * b2; return `The basket cost $${o}, then $${n}. (${n} ${B.MINUS} ${o}) ÷ ${o} × 100. Count each price by its quantity.`; } },
  ];
  APN.forEach((tp) => {
    kind('apn-' + tp.k, tp.d, 'ap', tp.sets.map((set, i) => ({ k: 's' + i, lvl: tp.lvl, set })), (rec) => {
      const value = tp.v(rec.set);
      const list = [{ v: value, right: true }].concat(tp.w.map((f) => ({ v: f(rec.set) })));
      const options = list.slice().sort((a, b) => a.v - b.v).map((o) => ({ label: tp.show(o.v), v: o.v, right: !!o.right }));
      return fin({ desk: tp.d, verb: 'ap', lvl: tp.lvl, order: 'AP STYLE QUESTION', text: tp.q(rec.set), options, answer: options.findIndex((o) => o.right), why: tp.y(rec.set), f: tp.f, apn: { k: tp.k, set: rec.set } }, options.map((o) => o.label));
    });
  });

  /* ================= the formula or rule shown with every answer =================
     The teacher asked for "formulas to every answer so kids can learn" (Nov 17, 2026). Every task gets t.learn:
     { label: 'Formula' or 'Rule', text }. A math task keeps the formula it already had. Every other task gets the
     formula its topic rests on, or, where the idea has no formula (what GDP misses, the phases of the cycle), the
     one-line rule. A kind listed in LEARN_KIND always uses that line. The catch-all kinds (true or false, AP style,
     fill the blank, and so on) pick a line by the words in the task, then fall back to the line for their desk. */
  const F = B.F, MN = B.MINUS;
  const LEARN = {
    gdp: F.gdp,
    counts: 'GDP = the market value of new, final goods and services made here this year',
    loop: 'Leaves the loop: savings, taxes, imports. Comes in: investment, government purchases, exports.',
    flow: 'Households sell factors and buy goods. Firms buy factors and sell goods. Money flows the other way.',
    income: F.income,
    approach: 'GDP = C + I + G + Xn = wages + rent + interest + profit = total value added',
    va: `Value added = sale price ${MN} cost of inputs. Add every stage and you get the final sale.`,
    percap: F.percap,
    percapgrow: `Growth in GDP per capita ≈ GDP growth ${MN} population growth`,
    misses: 'GDP misses unpaid work, hidden sales, leisure, quality, pollution, and how income is divided.',
    lf: 'Labor force = employed + unemployed. No job and not looking means not in the labor force.',
    urate: F.urate,
    lfpr: F.lfpr,
    natural: `Natural rate = frictional + structural. Cyclical = actual ${MN} natural.`,
    cyclical: `Cyclical unemployment = actual rate ${MN} natural rate`,
    cpi: F.cpi,
    infl: F.infl,
    naming: `Inflation rate = (new ${MN} old) \u00f7 old \u00d7 100. Falling but above 0: disinflation. Below 0: deflation.`,
    realwage: F.realwage,
    wagechange: `Change in real wage ≈ raise % ${MN} inflation %`,
    basket: 'Cost of the basket = price × quantity, added up for every item',
    bias: 'A fixed basket misses switching, new goods, and better quality, so the CPI overstates inflation.',
    convert: F.convert,
    realrate: F.realrate,
    surprise: `Real rate = nominal rate ${MN} inflation. Surprise inflation lowers it, so fixed-rate borrowers gain.`,
    surprisedefl: `Real rate = nominal rate ${MN} inflation. Surprise deflation raises it, so lenders and savers gain.`,
    realvalue: 'Real value = nominal value ÷ price index × 100. Fixed dollars buy less when prices rise.',
    menushoe: 'Menu costs: the cost of changing prices. Shoe-leather costs: the cost of holding less cash.',
    realgdp: F.realgdp,
    deflator: F.deflator,
    nomreal: "Nominal GDP = this year's prices \u00d7 output. Real GDP = base-year prices \u00d7 output.",
    nomgrow: 'Nominal growth ≈ real growth + inflation',
    baseyear: 'In the base year the index is 100, so real GDP = nominal GDP.',
    growth: F.growth,
    gap: `Output gap = actual real GDP ${MN} potential real GDP`,
    gapsign: `Output gap = actual ${MN} potential. A negative gap means unemployment is above the natural rate.`,
    phases: 'Expansion: real GDP rises. Contraction: it falls. The peak and trough are the turning points.',
    ppc: 'On the PPC, actual real GDP = potential real GDP. Inside the curve the output gap is negative.',
    shortage: `Shortage = quantity demanded ${MN} quantity supplied. A surplus is the reverse.`,
    csurplus: `Consumer surplus = the most you would pay ${MN} the price you pay`,
    elastic: 'Elasticity of demand = % change in quantity ÷ % change in price. Above 1 is elastic.',
    taxburden: 'The less elastic side of the market pays more of a tax.',
    tariff: 'A tariff is a tax on imports. The price at home rises and imports fall.',
    shifts: 'Demand shifts right: price and quantity rise. Supply shifts right: price falls and quantity rises.',
    dwl: 'A tax raises the price buyers pay, lowers the price sellers keep, and cuts the quantity sold.',
    potential: 'Potential real GDP grows with more workers, more capital, and better technology.',
    gapdollar: `Output gap = actual real GDP ${MN} potential real GDP`,
    nominal: F.nominal || 'Nominal GDP = real GDP \u00d7 deflator \u00f7 100',
  };
  const LEARN_KIND = {
    counted: 'counts', whynot: 'counts', 'pile-counted': 'counts', 'm-stock': 'gdp', line: 'gdp', grab: 'gdp', 'match-gdp': 'gdp', 'odd-gdp': 'gdp',
    flow: 'flow', 'label-flow': 'flow', loop: 'loop', 'pile-loop': 'loop', income: 'income', approach: 'approach',
    'c-final': 'va', 'c-va': 'va', 'type-va': 'va', 'order-gdp': 'va',
    miss: 'misses', 'match-miss': 'misses', percapmove: 'percapgrow', 'arrows-miss': 'percapgrow', 'cmp-percap': 'percap', 'rank-percap': 'percap', 'order-miss': 'percap',
    who: 'lf', 'pile-labor': 'lf', town: 'lf', 'arrows-move': 'lf', 'odd-jobs': 'lf', 'match-jobs': 'lf',
    type: 'natural', 'pile-types': 'natural', natural: 'natural', 'arrows-jobs': 'natural',
    'cmp-urate': 'urate', 'rank-urate': 'urate', 'rows-highu': 'urate', 'bad-urate': 'urate', 'order-jobs': 'urate', 'cmp-lfpr': 'lfpr', 'bad-lfpr': 'lfpr',
    nameit: 'naming', 'pile-nameit': 'naming', 'odd-prices': 'naming', 'rows-deflation': 'naming', 'rows-disinflation': 'naming', 'bars-deflation': 'naming', 'bars-disinflation': 'naming', 'infl-line': 'naming',
    bias: 'bias', 'c-basket': 'basket', 'type-basket': 'basket', 'c-wagechange': 'wagechange', 'type-wagechange': 'wagechange',
    'cmp-wage': 'realwage', 'rank-wage': 'realwage', 'bad-wage': 'realwage', 'cmp-infl': 'infl', 'rank-infl': 'infl', 'rows-highinfl': 'infl', 'bad-infl': 'infl', 'arrows-prices': 'infl',
    'cmp-index': 'cpi', 'bars-base': 'cpi', 'bad-cpi': 'cpi', 'order-prices': 'cpi',
    loan: 'surprise', deflation: 'surprisedefl', 'cmp-rate': 'realrate', 'order-costs': 'surprise', 'arrows-costs': 'surprise', menu: 'menushoe', 'pile-costs': 'menushoe',
    realnom: 'nomreal', 'pile-realnom': 'nomreal', 'odd-real': 'nomreal', 'match-real': 'nomreal', both: 'nomgrow', 'arrows-both': 'nomgrow', whichline: 'nomgrow',
    'c-onegood': 'nomreal', 'type-onegood': 'nomreal', basechart: 'baseyear', 'rows-baseyear': 'baseyear', 'rows-equal': 'baseyear',
    'rows-realfell': 'realgdp', 'cmp-real': 'realgdp', 'rank-real': 'realgdp', 'bad-real': 'realgdp', 'bad-def': 'deflator', 'order-real': 'growth',
    cycletap: 'phases', cycleread: 'phases', phase: 'phases', wave: 'phases', 'label-cycle': 'phases', 'order-cycle': 'phases', 'pile-phase': 'phases', 'odd-cycle': 'phases',
    'bars-contraction': 'phases', 'rows-peak': 'phases', 'rows-trough': 'phases', 'arrows-cycle': 'phases',
    sign: 'gapsign', 'm-gapcall': 'gapsign', 'm-gapword': 'gapsign', 'rows-negative': 'gapsign', 'rows-positive': 'gapsign', 'rows-atnatural': 'gapsign', 'bars-negative': 'gapsign', 'bars-positive': 'gapsign',
    'cmp-gap': 'gap', 'cmp-cyc': 'cyclical', 'bad-cyc': 'cyclical', 'ppc-tap': 'ppc', 'ppc-move': 'ppc',
    mkt: 'shortage', 'sd-control': 'shortage', 'order-micro': 'shortage', taxburden: 'taxburden', elastic: 'elastic', 'pile-elastic': 'elastic', 'odd-micro': 'elastic',
    'c-surplus': 'csurplus', 'sd-shift': 'shifts',
  };
  /* For the catch-all kinds: the first pattern that matches the words in the task wins. The last entry is the desk's fallback. */
  const LEARN_WORDS = {
    gdp: [[/factor market|product market|flows? (from|to)|in exchange for|households sell|firms (buy|sell)|revenue for firms/i, 'flow'], [/leaves the circular flow|into the circular flow|\bloop\b|leak|inject/i, 'loop'], [/circular flow/i, 'flow'], [/value added|each stage|final sale/i, 'va'], [/income approach|wages, rent|\brent\b.*profit/i, 'income'], [/\b(C|I|G|Xn) (means|rises|falls)|investment|consumption|government purchases|net exports/, 'gdp'], [/used|intermediate|transfer|stock|bond|resale|final good|market value|made abroad|inside the borders|counted/i, 'counts'], [/./, 'gdp']],
    miss: [[/population (rises|grows|grew)|grows faster than/i, 'percapgrow'], [/leisure|free time|traffic|hours a week|unpaid|nonmarket|underground|in cash|pollut|environment|forest|quality|divided|richest/i, 'misses'], [/per capita|per person|population/i, 'percap'], [/./, 'misses']],
    jobs: [[/participation|LFPR/i, 'lfpr'], [/frictional|structural|natural rate|full employment/i, 'natural'], [/cyclical/i, 'cyclical'], [/unemployment rate/i, 'urate'], [/./, 'lf']],
    prices: [[/real wage|buying power|buys (more|less)|purchasing/i, 'realwage'], [/disinflation|deflation|falls but stays|price level falls|still rose|more slowly/i, 'naming'], [/substitut|new goods|quality|overstate|fixed basket/i, 'bias'], [/basket|price index|base year|\bCPI is\b|index of/i, 'cpi'], [/./, 'infl']],
    costs: [[/menu|shoe/i, 'menushoe'], [/real (interest )?rate|nominal (interest )?rate|interest rates?|real return/i, 'realrate'], [/deflation|prices (then )?f(a|e)ll|falling prices/i, 'surprisedefl'], [/loan|lend|borrow|mortgage|bank|bond|fixed-rate|fixed rate/i, 'surprise'], [/./, 'realvalue']],
    real: [[/in the base year|base year.*(equal|100)/i, 'baseyear'], [/base-year prices|current prices/i, 'nomreal'], [/deflator/i, 'deflator'], [/grow|growth|rose|fell|rises|falls/i, 'nomgrow'], [/./, 'nomreal']],
    cycle: [[/PPC|production possibilities/i, 'ppc'], [/cyclical unemployment/i, 'cyclical'], [/gap|potential|natural rate|full employment/i, 'gapsign'], [/./, 'phases']],
    micro: [[/production possibilities|PPC/i, 'ppc'], [/consumer surplus|total surplus|would pay/i, 'csurplus'], [/tariff|quota|import/i, 'tariff'], [/deadweight|quantity sold/i, 'dwl'], [/tax/i, 'taxburden'], [/elastic|substitute|necessit|total revenue/i, 'elastic'], [/shifts? (right|left)|demand (rises|falls)|supply (rises|falls)/i, 'shifts'], [/./, 'shortage']],
  };
  const learnLine = (text) => ({ label: /[=≈]/.test(text) ? 'Formula' : 'Rule', text });
  B.LEARN = LEARN;
  B.SHEET = [
    ['gdp', ['counts', 'gdp', 'income', 'va', 'loop', 'flow']],
    ['miss', ['percap', 'percapgrow', 'misses']],
    ['jobs', ['lf', 'urate', 'lfpr', 'natural', 'cyclical']],
    ['prices', ['cpi', 'infl', 'naming', 'realwage', 'wagechange', 'convert', 'bias']],
    ['costs', ['realrate', 'surprise', 'surprisedefl', 'realvalue', 'menushoe']],
    ['real', ['nomreal', 'realgdp', 'deflator', 'nomgrow', 'growth', 'baseyear']],
    ['cycle', ['phases', 'gapdollar', 'gap', 'gapsign', 'potential', 'ppc']],
    ['micro', ['shortage', 'csurplus', 'elastic', 'taxburden', 'dwl', 'tariff', 'shifts']],
  ].map(([desk, keys]) => ({ desk, lines: keys.map((k) => learnLine(LEARN[k] || F[k])) }));
  B.learnFor = (t) => {
    if (!t || t.learn) return t;
    if (t.formula) { t.learn = learnLine(t.formula); return t; }
    let key = t.f || LEARN_KIND[t.kind];
    if (!key) {
      const hay = [t.order, t.ask, t.text, t.why].concat(t.lines || [], t.verb === 'ap' && t.options ? [t.options[t.answer].label] : []).filter(Boolean).join(' ');
      const rules = LEARN_WORDS[t.desk] || [[/./, 'gdp']];
      key = rules.find(([re]) => re.test(hay))[1];
    }
    t.learn = learnLine(LEARN[key] || F[key] || key);
    return t;
  };

  if (inNode) module.exports = B;
})(typeof globalThis !== 'undefined' ? globalThis : this);
