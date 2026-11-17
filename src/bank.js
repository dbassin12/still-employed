/* Still Employed: every task in the game.
   Words and definitions follow the class's Unit 2 Review Sheet and decks.
   Every record feeds one or more task kinds, and every answer is computed from the record or its numbers,
   so a label and its key can't disagree. src/bank.test.js recomputes all of it with separate formulas.
   House rules: plain teacher voice, short sentences, no em or en dashes (the minus sign U+2212 is fine),
   kosher-friendly examples, nothing that implies work on Shabbos, no interest-bearing loans between people. */
(function (root) {
  'use strict';
  const MORE = (typeof module !== 'undefined' && module.exports) ? require('./records.js') : root.SE_MORE;

  /* ================= desks ================= */
  const DESKS = {
    gdp: { code: '2.1', name: 'GDP', long: 'Circular flow and GDP' },
    miss: { code: '2.2', name: 'What GDP misses', long: 'Limitations of GDP' },
    jobs: { code: '2.3', name: 'Jobs', long: 'Unemployment' },
    prices: { code: '2.4', name: 'Prices', long: 'Price indices and inflation' },
    costs: { code: '2.5', name: 'Who pays', long: 'Costs of inflation' },
    real: { code: '2.6', name: 'Real GDP', long: 'Real v. nominal GDP' },
    cycle: { code: '2.7', name: 'Cycle', long: 'Business cycles' },
    micro: { code: 'Micro', name: 'Micro', long: 'Micro bridges M1 to M5' },
  };
  const VERBS = ['stamp', 'sort', 'pick', 'build', 'town', 'chart', 'flow', 'memo', 'grab'];

  const RANKS = [
    { name: 'Intern', base: 100, speed: 1, lvl: [1, 1], hints: true },
    { name: 'Junior Analyst', base: 150, speed: 0.97, lvl: [1, 2], hints: true },
    { name: 'Analyst', base: 200, speed: 0.94, lvl: [1, 2], hints: false },
    { name: 'Senior Analyst', base: 300, speed: 0.9, lvl: [2, 3], hints: false },
    { name: 'Deputy Commissioner', base: 400, speed: 0.85, lvl: [2, 3], hints: false },
    { name: 'Commissioner', base: 500, speed: 0.8, lvl: [1, 3], hints: false },
  ];

  /* ================= helpers ================= */
  function rng(seed) { // mulberry32: same seed, same run. Tests depend on this.
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pickOne = (r, a) => a[Math.floor(r() * a.length)];
  function shuffle(r, a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
    return b;
  }
  const MINUS = '−';
  const comma = (n) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sign = (n) => (n < 0 ? MINUS : '');
  const fmt = {
    usd: (n) => sign(n) + '$' + comma(Math.round(n)),
    usd2: (n) => sign(n) + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    bil: (n) => sign(n) + '$' + comma(Math.round(n * 100) / 100) + ' billion',
    pct: (n) => sign(n) + (Math.round(Math.abs(n) * 10) / 10).toFixed(1) + '%',
    idx: (n) => (Math.round(n * 10) / 10).toFixed(1),
    num: (n) => comma(n),
    pts: (n) => sign(n) + (Math.round(Math.abs(n) * 10) / 10).toFixed(1) + ' points',
  };
  const words = (s) => String(s || '').trim().split(/\s+/).length;

  /* clock = thinking time for this kind of task, plus reading time. Generous on purpose: the teacher's first read
     was "too fast", then "still a little too fast" (Nov 5, 2026), so these sit well above the Econ Arcade's clocks.
     RANKS speed shrinks them only a little. */
  const VERB_CLOCK = { stamp: 19, sort: 19, town: 24, chart: 20, flow: 21, grab: 25, build: 28, memo: 25, pick: 56 };
  const VERB_PAY = { stamp: 1, sort: 1, town: 1.5, chart: 1, flow: 1, grab: 1.5, build: 1.5, memo: 1.5, pick: 2 };
  const VERB_WEIGHT = { stamp: 1.1, sort: 1.1, pick: 1.1, build: 0.9, town: 0.9, chart: 1, flow: 0.8, memo: 0.9, grab: 0.8 };
  function finish(t) {
    let reading = words(t.text) + words(t.ask);
    (t.lines || []).forEach((l) => { reading += words(l); });
    (t.table || []).forEach(() => { reading += 2; });
    if (t.verb === 'grab') (t.options || []).forEach((o) => { reading += words(o.label); });
    t.clock = Math.round((VERB_CLOCK[t.verb] + reading * 0.35) * 10) / 10;
    t.pay = VERB_PAY[t.verb];
    return t;
  }

  /* ================= bins with short definitions ================= */
  const BIN = {
    C: { label: 'C', def: 'Households buying' },
    I: { label: 'I', def: 'New machines, buildings, homes, inventories' },
    G: { label: 'G', def: 'Government buying goods and services' },
    Xn: { label: 'Xn', def: 'Exports minus imports' },
    used: { label: 'Used good', def: 'Counted when it was new' },
    intermediate: { label: 'Intermediate', def: 'Already in the final price' },
    financial: { label: 'Stocks and bonds', def: 'Change who owns what' },
    transfer: { label: 'Transfer', def: 'Money moves, nothing is made' },
    abroad: { label: 'Made abroad', def: 'Produced in another country' },
    E: { label: 'Employed', def: 'Any paid work, part time counts' },
    U: { label: 'Unemployed', def: 'No job, available, looked in the past 4 weeks' },
    N: { label: 'Not in the labor force', def: 'No job and not looking' },
    F: { label: 'Frictional', def: 'Between jobs or new to the search' },
    S: { label: 'Structural', def: 'Skills or location do not match the jobs' },
    Cy: { label: 'Cyclical', def: 'Caused by a contraction' },
    nonmarket: { label: 'Nonmarket', def: 'Work for yourself or family, volunteering' },
    underground: { label: 'Underground', def: 'Sales hidden from the government' },
    leisure: { label: 'Leisure', def: 'Time off counts as $0' },
    quality: { label: 'Quality', def: 'Better goods at the same price' },
    environment: { label: 'Environment', def: 'Damage is never subtracted' },
    division: { label: 'Who gets it', def: 'GDP ignores the distribution of income' },
    recgap: { label: 'Recessionary gap', def: 'Negative gap: real GDP below potential' },
    infgap: { label: 'Inflationary gap', def: 'Positive gap: real GDP above potential' },
    fullemp: { label: 'Full employment', def: 'No gap: real GDP equals potential' },
    gains: { label: 'Gains', def: 'Helped: pays fixed dollars that buy less' },
    loses: { label: 'Loses', def: 'Hurt: holds or gets fixed dollars' },
    protected: { label: 'Protected', def: 'Little effect: tied to prices' },
    rising: { label: 'Rising inflation', def: 'The inflation rate goes up' },
    dis: { label: 'Disinflation', def: 'Prices still rise, just more slowly' },
    de: { label: 'Deflation', def: 'The price level falls' },
    substitution: { label: 'Substitution', def: 'People switch, the basket stays fixed' },
    newgoods: { label: 'New goods', def: 'New products are not in the basket yet' },
    betterq: { label: 'Better quality', def: 'Prices count, improvements do not' },
    menu: { label: 'Menu costs', def: 'Changing posted prices' },
    shoe: { label: 'Shoe-leather costs', def: 'Effort to hold less cash' },
    expansion: { label: 'Expansion', def: 'Real GDP rising' },
    peak: { label: 'Peak', def: 'Top turning point' },
    contraction: { label: 'Contraction', def: 'Real GDP falling' },
    trough: { label: 'Trough', def: 'Bottom turning point' },
    wages: { label: 'Wages', def: 'Paid for labor' },
    rent: { label: 'Rent', def: 'Paid for land' },
    interest: { label: 'Interest', def: 'Paid for capital' },
    profit: { label: 'Profit', def: 'Paid for entrepreneurship' },
  };
  const bins = (...keys) => keys.map((k) => Object.assign({ key: k }, BIN[k]));
  const plain = (...labels) => labels.map((l) => ({ key: l, label: l }));

  /* Stamp and sort choices are a fixed menu (Gains, Loses, Protected), so they stay in the order they are written here,
     on every deal. The teacher saw students who answer fast tap where "Gains" was last time and get it wrong
     (Nov 17, 2026). The right answer still lands in different places, because the key changes from task to task. */
  let currentR = null; // set before each build
  const mix = (opts) => opts;
  /* Number choices read low to high, the way the AP exam lists them. */
  const lowToHigh = (list) => list.slice().sort((a, b) => a.v - b.v);
  /* A word bank reads in one steady order: the cycle in cycle order, everything else A to Z. */
  const WORD_ORDER = ['expansion', 'peak', 'contraction', 'trough'];
  const steady = (labels) => {
    const low = labels.map((l) => String(l).toLowerCase());
    if (low.every((l) => WORD_ORDER.includes(l))) return labels.slice().sort((a, b) => WORD_ORDER.indexOf(String(a).toLowerCase()) - WORD_ORDER.indexOf(String(b).toLowerCase()));
    const num = (l) => { const m = /^[^0-9\u2212-]*([\u2212-]?[0-9][0-9,]*\.?[0-9]*)/.exec(String(l)); return m ? Number(m[1].replace(/,/g, '').replace('\u2212', '-')) : null; };
    if (labels.every((l) => num(l) !== null) && new Set(labels.map(num)).size === labels.length) return labels.slice().sort((a, b) => num(a) - num(b));
    return labels.slice().sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
  };
  function sortTask(o) {
    const options = mix(o.options, o.keep);
    return finish(Object.assign({ verb: 'sort' }, o, { options, answer: options.findIndex((b) => b.key === o.key) }));
  }
  function stampTask(o) {
    const options = mix(o.options, o.keep);
    return finish(Object.assign({ verb: 'stamp' }, o, { options, answer: options.findIndex((b) => b.key === o.key) }));
  }

  /* ================= 2.1 GDP records =================
     line: C, I, G, Xn when counted; no: the reason when not. s: short form for chips. */
  const GDP = [
    { k: 'slice', t: 'You buy a fresh slice on Central Avenue.', s: 'A fresh slice on Central Avenue', line: 'C', lvl: 1, y: 'A new final good, made and sold here this year. Consumption.' },
    { k: 'haircut', t: 'You pay for a haircut in Cedarhurst.', s: 'A haircut in Cedarhurst', line: 'C', lvl: 1, y: 'Services count too. A household buying one is consumption.' },
    { k: 'plumber', t: 'A Woodmere family pays a plumber to fix a leak.', s: 'A plumber fixing a leak', line: 'C', lvl: 1, y: 'A household buying a service. Consumption.' },
    { k: 'caterer', t: 'A family pays a caterer for a bar mitzvah lunch in Lawrence.', s: 'A bar mitzvah caterer', line: 'C', lvl: 1, y: 'A paid service, produced this year. Consumption.' },
    { k: 'knicks', t: 'You buy a ticket to a Knicks game.', s: 'A Knicks ticket', line: 'C', lvl: 1, y: 'A service sold to a household. Consumption.' },
    { k: 'lirr', t: 'You buy an LIRR ticket to Penn Station.', s: 'An LIRR ticket', line: 'C', lvl: 1, y: 'A household buying a ride. Consumption.' },
    { k: 'toyota', t: 'A U.S. family buys a new Toyota built in Kentucky.', s: 'A Toyota built in Kentucky', line: 'C', lvl: 3, y: 'Made in the U.S., so it counts. Who owns the plant does not matter.' },
    { k: 'broker', t: "A broker charges you a $10 fee to buy a stock for you.", s: "A broker's $10 fee", line: 'C', lvl: 3, y: "The stock is not counted. The broker's service is." },
    { k: 'dealerfee', t: 'A used car dealer earns a $500 fee for finding you a car.', s: "A used car dealer's fee", line: 'C', lvl: 3, y: "The used car is not counted. The dealer's service is new this year." },

    { k: 'mixer', t: 'A Hewlett bakery buys a new mixer made in Ohio.', s: "A bakery's new Ohio-made mixer", line: 'I', lvl: 1, y: 'A new machine a firm uses to make things. Investment.' },
    { k: 'vans', t: 'A delivery company buys new vans made in Michigan.', s: 'New Michigan-made vans for a firm', line: 'I', lvl: 1, y: 'New equipment for a firm. Investment.' },
    { k: 'office', t: 'A firm builds a new office in Garden City.', s: 'A new office in Garden City', line: 'I', lvl: 1, y: 'A new building for a firm. Investment.' },
    { k: 'robot', t: 'A U.S. factory buys a new robot made in Ohio.', s: "A factory's new Ohio-made robot", line: 'I', lvl: 1, y: 'New capital, made here. Investment.' },
    { k: 'house', t: 'A builder finishes a new house in Woodmere and sells it this year.', s: 'A brand new house in Woodmere', line: 'I', lvl: 2, y: 'New homes count as investment, not consumption.' },
    { k: 'inventory', t: 'A U.S. sneaker maker ends the year with 1,000 unsold pairs it made this year.', s: 'Unsold U.S.-made sneakers from this year', line: 'I', lvl: 2, y: 'A change in inventories counts as investment.' },
    { k: 'chairs', t: 'A Long Island factory makes 500 chairs this year but sells them next year.', s: 'U.S.-made chairs, sold next year', line: 'I', lvl: 2, y: 'They were produced this year. Change in inventories: investment.' },

    { k: 'policecars', t: 'Nassau County buys new police cars made in Michigan.', s: 'New Michigan-made county police cars', line: 'G', lvl: 1, y: 'Government buying a good. G.' },
    { k: 'pave', t: 'Cedarhurst pays a crew to repave Central Avenue.', s: 'A village repaving a street', line: 'G', lvl: 1, y: 'Government buying a service. G.' },
    { k: 'plow', t: 'New York State buys a new snowplow made in Ohio.', s: "A state's new Ohio-made snowplow", line: 'G', lvl: 1, y: 'Government buying a good. G.' },
    { k: 'lifeguard', t: 'The Town of Hempstead pays a lifeguard at a town beach.', s: "A town lifeguard's pay", line: 'G', lvl: 2, y: 'Government buying a service. A paycheck for work is not a transfer.' },
    { k: 'airforce', t: 'The U.S. Air Force buys new jets made in Texas.', s: 'New Texas-made Air Force jets', line: 'G', lvl: 2, y: 'Government purchases of goods. G.' },

    { k: 'boeing', t: 'El Al buys a new Boeing jet built in Washington State.', s: 'El Al buys a new U.S.-built Boeing jet', line: 'Xn', lvl: 1, y: 'Made here, sold abroad. An export adds to Xn.' },
    { k: 'textbooks', t: 'A school in Jerusalem buys textbooks printed in New York.', s: 'U.S.-printed textbooks sold to Jerusalem', line: 'Xn', lvl: 1, y: 'Made here, sold abroad. An export.' },
    { k: 'laptop', t: 'A buyer in Israel buys a laptop made in the U.S.', s: 'A U.S. laptop sold in Israel', line: 'Xn', lvl: 1, y: 'Made here, sold abroad. An export.' },
    { k: 'tourist', t: 'A tourist from Israel pays for a hotel room in Manhattan.', s: "An Israeli tourist's hotel room", line: 'Xn', lvl: 3, y: 'A service made here and sold to a foreign buyer. An export.' },

    { k: 'usedhonda', t: 'You buy a 2019 Honda from your neighbor.', s: 'A 2019 Honda from a neighbor', no: 'used', lvl: 1, y: 'Used. It was counted when it was new.' },
    { k: 'jordans', t: 'You resell your old Jordans online.', s: 'Reselling old Jordans', no: 'used', lvl: 1, y: 'Used. Those sneakers were counted when they were new.' },
    { k: 'oldhouse', t: 'A family buys a house in Lawrence built in the 1950s.', s: 'A house built in the 1950s', no: 'used', lvl: 2, y: 'Only new homes count. This one was counted long ago.' },
    { k: 'usedbook', t: 'You buy a used textbook from a senior.', s: 'A used textbook', no: 'used', lvl: 1, y: 'Used. Nothing new was produced.' },

    { k: 'cheese', t: 'A pizza shop buys cheese to make its pies.', s: 'Cheese for a pizza shop', no: 'intermediate', lvl: 1, y: 'Intermediate. It is already in the price of the pizza.' },
    { k: 'flour', t: 'A bakery buys flour for its challah.', s: 'Flour for a bakery', no: 'intermediate', lvl: 1, y: 'Intermediate. Counting it too would be double counting.' },
    { k: 'fabric', t: 'A hoodie factory buys fabric from a mill.', s: 'Fabric for a hoodie factory', no: 'intermediate', lvl: 1, y: 'Intermediate. The fabric is inside the final hoodie price.' },
    { k: 'tires', t: 'A truck maker buys tires for its new trucks.', s: 'Tires for new trucks', no: 'intermediate', lvl: 2, y: 'Intermediate. The tires are part of the final truck price.' },

    { k: 'stock', t: 'You buy 10 shares of Apple stock.', s: '10 shares of stock', no: 'financial', lvl: 1, y: 'Stocks change who owns a firm. Nothing new is made.' },
    { k: 'bond', t: 'Your grandfather buys a U.S. savings bond.', s: 'A savings bond', no: 'financial', lvl: 1, y: 'A financial asset. Nothing new is produced.' },
    { k: 'ipo', t: 'A firm sells new shares to raise money for a factory.', s: 'A firm selling new shares', no: 'financial', lvl: 3, y: 'Selling shares is not investment. Building the factory would be.' },

    { k: 'socsec', t: 'Your grandfather gets his monthly Social Security check.', s: 'A Social Security check', no: 'transfer', lvl: 1, y: 'A transfer. The government gets nothing new in return.' },
    { k: 'unempcheck', t: 'A laid-off worker gets an unemployment check.', s: 'An unemployment check', no: 'transfer', lvl: 1, y: 'A transfer. No good or service is bought.' },
    { k: 'gift', t: 'A bar mitzvah boy gets a $180 gift check.', s: 'A $180 gift check', no: 'transfer', lvl: 1, y: 'A gift moves money. Nothing new was produced.' },
    { k: 'tzedakah', t: 'A family gives $500 to a tzedakah fund.', s: 'A $500 tzedakah gift', no: 'transfer', lvl: 2, y: 'A gift moves money. Nothing new was produced.' },

    { k: 'yeshiva', t: 'Your parents pay for your year of yeshiva in Israel.', s: 'A year of yeshiva in Israel', no: 'abroad', lvl: 2, y: "Produced in Israel. It counts in Israel's GDP, not ours." },
    { k: 'japancar', t: 'A Woodmere family buys a new car made in Japan.', s: 'A new car made in Japan', no: 'abroad', lvl: 1, y: 'Spending rises, but imports subtract it back out. Net zero.' },
    { k: 'swisswatch', t: 'You buy a new watch made in Switzerland.', s: 'A watch made in Switzerland', no: 'abroad', lvl: 1, y: 'Made abroad. Imports subtract it back out.' },
    { k: 'mexico', t: 'A U.S. company builds cars at its plant in Mexico.', s: "A U.S. firm's plant in Mexico", no: 'abroad', lvl: 3, y: 'GDP counts where it is made, not who owns the firm.' },
  ];

  /* ================= 2.1 circular flow ================= */
  const ARROWS = ['Goods and services', 'Consumption expenditures', 'Factors of production', 'Wages, rent, interest, profit'];
  const FLOW = [
    { k: 'shift', t: 'Dovid works a shift at a pizza shop.', a: 2, lvl: 1, y: 'His work is a factor of production. It goes to the firm in the factor market.' },
    { k: 'paycheck', t: 'The shop pays Dovid for that shift.', a: 3, lvl: 1, y: 'Wages. Money flows from firms to households in the factor market.' },
    { k: 'five', t: 'Rina hands over $5 for a slice.', a: 1, lvl: 1, y: 'A consumption expenditure. Money flows to firms in the product market.' },
    { k: 'sliceflow', t: 'The shop hands Rina the slice.', a: 0, lvl: 1, y: 'A good. It flows from firms to households in the product market.' },
    { k: 'land', t: 'A landlord rents out a storefront to a bakery.', a: 2, lvl: 2, y: 'Land is a factor of production. It goes to firms in the factor market.' },
    { k: 'rentpaid', t: 'The bakery pays the landlord the rent.', a: 3, lvl: 2, y: 'Rent is factor income. Money flows to households in the factor market.' },
    { k: 'sneak', t: 'You pay $20 for sneakers at a store.', a: 1, lvl: 1, y: 'A consumption expenditure in the product market.' },
    { k: 'sneakhand', t: 'The store hands you the sneakers.', a: 0, lvl: 1, y: 'A good. It flows from firms to households in the product market.' },
    { k: 'owner', t: 'An owner keeps the money left after paying all her costs.', a: 3, lvl: 2, y: 'Profit is factor income for entrepreneurship.' },
    { k: 'founder', t: 'A founder puts her ideas and risk into a new firm.', a: 2, lvl: 3, y: 'Entrepreneurship is a factor of production.' },
    { k: 'barber', t: 'A barber cuts your hair.', a: 0, lvl: 2, y: 'A service. Real things flow from firms to households in the product market.' },
    { k: 'barberpay', t: 'You pay the barber $25.', a: 1, lvl: 1, y: 'A consumption expenditure. Money flows to firms in the product market.' },
  ];
  const LOOP = [
    { k: 'tax', t: 'A family pays income tax.', dir: 'out', s: 'Income tax', lvl: 1, y: 'Taxes leave the loop.' },
    { k: 'save', t: 'A family puts $500 in a savings account.', dir: 'out', s: '$500 into savings', lvl: 1, y: 'Savings leave the loop.' },
    { k: 'import', t: 'A Hewlett family buys a TV made in Korea.', dir: 'out', s: 'A TV made in Korea', lvl: 1, y: 'Imports leave the loop. That money goes abroad.' },
    { k: 'paytax', t: "Taxes come out of a worker's paycheck.", dir: 'out', s: 'Taxes from a paycheck', lvl: 1, y: 'Taxes leave the loop.' },
    { k: 'deposit', t: 'A senior puts his camp pay in the bank.', dir: 'out', s: 'Camp pay put in the bank', lvl: 2, y: 'Savings leave the loop.' },
    { k: 'swiss', t: 'You buy chocolate made in Switzerland.', dir: 'out', s: 'Swiss chocolate', lvl: 2, y: 'Imports leave the loop.' },
    { k: 'export', t: 'A buyer in Israel buys a laptop made in the U.S.', dir: 'in', s: 'A U.S. laptop sold abroad', lvl: 1, y: 'Exports come into the loop.' },
    { k: 'machine', t: 'A firm buys a new machine.', dir: 'in', s: 'A firm buys a machine', lvl: 1, y: 'Investment comes into the loop.' },
    { k: 'busesloop', t: 'Nassau County buys new school buses.', dir: 'in', s: 'County buys school buses', lvl: 1, y: 'Government purchases come into the loop.' },
    { k: 'elal', t: 'El Al buys a Boeing jet built in the U.S.', dir: 'in', s: 'El Al buys a Boeing jet', lvl: 2, y: 'Exports come into the loop.' },
    { k: 'oven', t: 'A pizzeria buys a new oven.', dir: 'in', s: 'A pizzeria buys an oven', lvl: 2, y: 'Investment comes into the loop.' },
    { k: 'crew', t: 'New York State pays a crew to fix a bridge.', dir: 'in', s: 'State pays a bridge crew', lvl: 2, y: 'Government purchases come into the loop.' },
  ];
  const INCOME = [
    { k: 'cashier', t: 'A cashier gets a paycheck.', key: 'wages', lvl: 1, y: 'Wages are the income paid for labor.' },
    { k: 'landlord', t: 'A landlord collects money for a storefront.', key: 'rent', lvl: 1, y: 'Rent is the income paid for land.' },
    { k: 'bankloan', t: 'A bank gets paid for a business loan.', key: 'interest', lvl: 1, y: 'Interest is the income paid for capital.' },
    { k: 'owneris', t: 'A shop owner keeps what is left after costs.', key: 'profit', lvl: 1, y: 'Profit is the income paid for entrepreneurship.' },
    { k: 'teacher', t: 'A camp pays its counselors for the summer.', key: 'wages', lvl: 1, y: 'Paid for labor. Wages.' },
    { k: 'parkinglot', t: 'A family gets paid for letting a firm use its parking lot.', key: 'rent', lvl: 2, y: 'Paid for land. Rent.' },
    { k: 'bondpay', t: 'A firm pays bondholders each year on money it borrowed.', key: 'interest', lvl: 2, y: 'Paid for capital. Interest.' },
    { k: 'startup', t: 'A founder earns what the firm makes above all its costs.', key: 'profit', lvl: 2, y: 'Paid for entrepreneurship. Profit.' },
  ];
  const APPROACH = [
    { k: 'exp', t: 'Add C + I + G + Xn.', key: 'Expenditures', y: 'The expenditures approach adds spending on final goods and services.' },
    { k: 'inc', t: 'Add wages, rent, interest, and profit.', key: 'Income', y: 'The income approach adds what the factors of production earn.' },
    { k: 'va', t: "Add each firm's sales minus what it bought from other firms.", key: 'Value added', y: 'The value-added approach avoids double counting.' },
    { k: 'exp2', t: 'Add what households, firms, government, and foreigners spend on final goods.', key: 'Expenditures', y: 'Spending on final output, with imports taken out. Expenditures.' },
    { k: 'inc2', t: 'Add up everyone who gets paid for land, labor, capital, and entrepreneurship.', key: 'Income', y: 'Factor payments. That is the income approach.' },
    { k: 'va2', t: 'A store buys a hoodie for $28 and sells it for $45, adding $17. Add up steps like that.', key: 'Value added', lvl: 2, y: 'Each step adds its own value. The steps sum to the final price.' },
  ];

  /* ================= 2.2 what GDP misses ================= */
  const MISS = [
    { k: 'dinner', t: 'Your mother makes dinner for the family.', key: 'nonmarket', lvl: 1, y: 'No market sale, no price. GDP counts it as $0.' },
    { k: 'lawn', t: 'You mow your own lawn.', key: 'nonmarket', lvl: 1, y: 'Work for yourself is nonmarket. GDP misses it.' },
    { k: 'hatzalah', t: 'You volunteer with Hatzalah on Sundays.', key: 'nonmarket', lvl: 1, y: 'Volunteering has no price, so GDP misses it.' },
    { k: 'zeyde', t: 'A grandfather watches his grandkids for free.', key: 'nonmarket', lvl: 1, y: 'Unpaid family care is nonmarket.' },
    { k: 'babysit', t: 'Shmuli babysits for cash and never reports it.', key: 'underground', lvl: 1, y: 'Hidden from the government: the underground economy.' },
    { k: 'painter', t: 'A painter takes cash and leaves it off his taxes.', key: 'underground', lvl: 1, y: 'Unreported sales are underground.' },
    { k: 'lawncash', t: 'A teen mows lawns for cash and reports none of it.', key: 'underground', lvl: 1, y: 'A real sale, but hidden. Underground.' },
    { k: 'fridays', t: 'Everyone gets Fridays off. Output falls a little, but people are happier.', key: 'leisure', lvl: 1, y: 'GDP falls even though people are better off. Leisure counts as $0.' },
    { k: 'overtime', t: 'A worker turns down overtime to keep his Sundays free.', key: 'leisure', lvl: 2, y: 'He gave up pay for time he values. GDP sees only the lost output.' },
    { k: 'safecar', t: 'A 2026 car costs what a 2016 car did but is far safer.', key: 'quality', lvl: 1, y: 'Same price, far better good. GDP can miss that gain.' },
    { k: 'tv', t: 'TVs keep getting better while prices stay about the same.', key: 'quality', lvl: 1, y: 'The improvement is hard to measure. Quality.' },
    { k: 'medicine', t: 'A new medicine works far better at the same price.', key: 'quality', lvl: 2, y: 'The gain in health is not in the price. Quality.' },
    { k: 'smoke', t: "A factory's smoke pollutes a town's air.", key: 'environment', lvl: 1, y: 'Its output counts. The damage is never subtracted.' },
    { k: 'river', t: 'A firm dumps waste in a river. All its output still counts.', key: 'environment', lvl: 1, y: 'GDP does not subtract environmental damage.' },
    { k: 'overfish', t: 'A fleet catches record fish and empties the bay.', key: 'environment', lvl: 2, y: 'The catch counts. The empty bay is not subtracted.' },
    { k: 'top1', t: 'GDP rises, but almost all the gain goes to the richest 1%.', key: 'division', lvl: 2, y: 'GDP does not show how income is divided.' },
    { k: 'twotowns', t: 'Two towns have the same GDP per person. In one, a few people earn nearly all of it.', key: 'division', lvl: 2, y: 'An average hides how income is divided.' },
    { k: 'ceos', t: 'Output grows 3%, but most workers see no raise.', key: 'division', lvl: 3, y: 'GDP says nothing about who gets the gain.' },
  ];
  const PERCAP_MOVES = [[1, 2], [2, 4], [3, 1], [4, 2], [1, 3], [3, 2], [2, 1], [5, 4], [1, 1], [2, 2]];

  /* ================= 2.3 jobs ================= */
  const PEOPLE = [
    { k: 'accountant', t: 'An accountant in Hewlett works full time.', s: 'A full-time accountant', st: 'E', lvl: 1, y: 'Any paid work counts as employed.' },
    { k: 'nurse', t: 'A nurse works full time at a Long Island hospital.', s: 'A full-time nurse', st: 'E', lvl: 1, y: 'Any paid work counts as employed.' },
    { k: 'yaakov', t: 'Yaakov works 12 hours a week at a pizza shop but wants full-time work.', s: 'A part-timer who wants more hours', st: 'E', lvl: 2, y: 'Part time still counts as employed. This is why the rate understates joblessness.' },
    { k: 'avi', t: 'Avi works Sundays at a bagel store while he finishes school.', s: 'A student with a Sunday job', st: 'E', lvl: 2, y: 'He has paid work. Being a student does not change that.' },
    { k: 'bakerretiree', t: 'A 70-year-old retiree works 15 hours a week at a bakery.', s: 'A retiree with a bakery job', st: 'E', lvl: 2, y: 'Paid work is paid work, at any age.' },
    { k: 'engineer', t: 'A laid-off engineer now drives a delivery van 10 hours a week.', s: 'An engineer driving a van part time', st: 'E', lvl: 3, y: 'Underemployed, but the survey counts him as employed.' },
    { k: 'eli', t: 'Eli graduated in June and has applied to 10 jobs this month.', s: 'A grad applying to jobs', st: 'U', lvl: 1, y: 'No job, available, looked in the past 4 weeks: unemployed.' },
    { k: 'factorylaid', t: 'A factory worker was laid off in a recession. He is looking for work.', s: 'A laid-off worker who is looking', st: 'U', lvl: 1, y: 'No job, available, looking: unemployed.' },
    { k: 'waiter', t: 'A waiter quit last week and is applying at other restaurants.', s: 'A waiter who quit, now applying', st: 'U', lvl: 1, y: 'No job and looking: unemployed.' },
    { k: 'teller', t: 'A bank teller lost her job to mobile apps. She is looking for work.', s: 'A laid-off teller who is looking', st: 'U', lvl: 1, y: 'No job and looking: unemployed.' },
    { k: 'retireeback', t: 'A retiree wants to work again and applied to 3 jobs this week.', s: 'A retiree applying to jobs', st: 'U', lvl: 3, y: 'Once he looks, he counts as unemployed. His age does not matter.' },
    { k: 'parentback', t: 'A stay-at-home parent starts sending out resumes.', s: 'A stay-at-home parent sending resumes', st: 'U', lvl: 2, y: 'Looking for work makes this parent unemployed, in the labor force.' },
    { k: 'ari', t: 'Ari is a full-time yeshiva student and is not looking for a job.', s: 'A student with no job, not looking', st: 'N', lvl: 1, y: 'No job and not looking: not in the labor force.' },
    { k: 'retired', t: 'A retired teacher spends her days with her grandchildren and is not looking for work.', s: 'A retired teacher, not looking', st: 'N', lvl: 1, y: 'Retirees who are not looking are not in the labor force.' },
    { k: 'athome', t: 'A stay-at-home parent is not looking for a job.', s: 'A stay-at-home parent, not looking', st: 'N', lvl: 1, y: 'Not looking: not in the labor force.' },
    { k: 'senior', t: 'A high school senior has no job and is not looking.', s: 'A high school senior, no job, not looking', st: 'N', lvl: 1, y: 'Not looking: not in the labor force.' },
    { k: 'moshe', t: 'Moshe stopped looking because he thinks there are no jobs for him.', s: 'A worker who gave up looking', st: 'N', lvl: 2, y: 'A discouraged worker left the labor force. He is not counted as unemployed.' },
    { k: 'gaveup', t: 'A laid-off worker gave up two months ago after finding nothing.', s: 'A worker who gave up 2 months ago', st: 'N', lvl: 2, y: 'He has not looked in the past 4 weeks. Discouraged, not unemployed.' },
  ];
  const TYPES = [
    { k: 'grad', t: 'Eli graduated in June and is applying to his first jobs.', key: 'F', lvl: 1, y: 'New to the search. Frictional.' },
    { k: 'closer', t: 'A waiter quit to find a restaurant closer to home. He is applying now.', key: 'F', lvl: 1, y: 'Between jobs while he searches. Frictional.' },
    { k: 'moved', t: 'A nurse moved to Long Island and is interviewing at hospitals.', key: 'F', lvl: 1, y: 'Her skills fit. Matching takes time. Frictional.' },
    { k: 'betterfit', t: 'An accountant turned down one offer and keeps applying for a better fit.', key: 'F', lvl: 2, y: 'Searching for a better match. Frictional.' },
    { k: 'reenter', t: 'A parent returns to the job hunt after five years at home.', key: 'F', lvl: 2, y: 'New to the search again. Frictional.' },
    { k: 'travel', t: 'A travel agent lost her job to booking apps. She is looking, but her skills do not fit the open jobs.', key: 'S', lvl: 1, y: 'Technology changed the work. Her skills no longer match. Structural.' },
    { k: 'video', t: 'A video store clerk is looking for work. Streaming ended that job for good.', key: 'S', lvl: 1, y: 'That kind of job is gone. Structural.' },
    { k: 'selfcheck', t: 'A cashier was replaced by self-checkout. He is looking but needs new skills to get hired.', key: 'S', lvl: 1, y: 'A skills mismatch. Structural.' },
    { k: 'mine', t: 'A coal mine closes for good. The miners are looking, but they live hours from any other mine.', key: 'S', lvl: 2, y: 'The jobs are not where the workers are. Structural.' },
    { k: 'welders', t: 'A factory moved overseas. Its welders are looking, but local firms want coders.', key: 'S', lvl: 2, y: 'Skills do not match the open jobs. Structural.' },
    { k: 'recession', t: 'A factory worker was laid off when sales fell in a recession. He is looking.', key: 'Cy', lvl: 1, y: 'Caused by a contraction. Cyclical.' },
    { k: 'cardealer', t: 'A downturn stopped car buyers, so a dealer cut staff. A salesman is looking.', key: 'Cy', lvl: 1, y: 'Spending fell across the economy. Cyclical.' },
    { k: 'crew', t: 'A builder lays off his crew as the economy contracts. They are looking.', key: 'Cy', lvl: 1, y: 'Caused by a contraction. Cyclical.' },
    { k: 'hotel', t: 'A hotel cuts staff when a recession hits. A clerk is applying elsewhere.', key: 'Cy', lvl: 2, y: 'When the economy recovers, these jobs come back. Cyclical.' },
    { k: 'manager', t: 'Spending falls across the economy and a store lays off a manager. She is looking.', key: 'Cy', lvl: 2, y: 'Falling spending economy-wide. Cyclical.' },
  ];
  const NATURAL = [
    { k: 'website', t: 'A new website helps workers find jobs faster.', key: 'Down', lvl: 2, y: 'Frictional falls, so the natural rate falls.' },
    { k: 'obsolete', t: "New technology makes many workers' skills obsolete.", key: 'Up', lvl: 2, y: 'Structural rises, so the natural rate rises.' },
    { k: 'layoffs', t: 'A recession leads firms to lay off workers.', key: 'No change', lvl: 2, y: 'That is cyclical. The natural rate is frictional plus structural.' },
    { k: 'training', t: 'A free program teaches laid-off workers the skills open jobs need.', key: 'Down', lvl: 3, y: 'Structural falls, so the natural rate falls.' },
    { k: 'hiring', t: 'The economy enters an expansion and hiring picks up.', key: 'No change', lvl: 2, y: 'Cyclical falls. The natural rate stays put.' },
    { k: 'belowrate', t: 'The actual rate falls below the natural rate.', key: 'No change', lvl: 3, y: 'A change in the actual rate does not move the natural rate.' },
  ];
  const MOVES = [
    { k: 'fired', from: 'e', to: 'u', t: 'A worker is laid off and starts looking right away.', lvl: 1, y: 'Fewer employed, more unemployed. The labor force stays the same size.' },
    { k: 'quitlook', from: 'e', to: 'u', t: 'A cashier quits and starts applying at other stores.', lvl: 1, y: 'She stays in the labor force, now as unemployed.' },
    { k: 'hired', from: 'u', to: 'e', t: 'A job seeker gets hired at a bagel store.', lvl: 1, y: 'Fewer unemployed. The labor force stays the same size.' },
    { k: 'firstjob', from: 'u', to: 'e', t: 'Eli, who was applying to jobs, lands his first job.', lvl: 1, y: 'He moved inside the labor force, so the LFPR does not change.' },
    { k: 'giveup', from: 'u', to: 'n', t: 'A laid-off worker gives up and stops looking.', lvl: 2, y: 'Discouraged. The rate falls, but nobody found a job.' },
    { k: 'backschool', from: 'u', to: 'n', t: 'A job seeker stops looking and goes back to school full time.', lvl: 2, y: 'Unemployed and the labor force both shrink, so the rate and LFPR fall.' },
    { k: 'startlook', from: 'n', to: 'u', t: 'A retiree starts applying for jobs.', lvl: 2, y: 'Good news can raise the rate. New job seekers count as unemployed.' },
    { k: 'gradlook', from: 'n', to: 'u', t: 'A student finishes yeshiva and starts applying for jobs.', lvl: 2, y: 'He joined the labor force as unemployed. Both rates rise.' },
    { k: 'retires', from: 'e', to: 'n', t: 'A worker retires and does not look for more work.', lvl: 3, y: 'The labor force shrinks but unemployed does not, so the rate rises.' },
    { k: 'stayhome', from: 'e', to: 'n', t: 'A worker quits to stay home with the kids and is not looking.', lvl: 3, y: 'Same count of unemployed over a smaller labor force: the rate rises.' },
    { k: 'hiredback', from: 'n', to: 'e', t: 'A retiree is hired back at his old firm.', lvl: 3, y: 'The labor force grows but unemployed does not, so the rate falls.' },
    { k: 'studentjob', from: 'n', to: 'e', t: 'A student who was not looking takes a job at a pizza shop.', lvl: 3, y: 'A bigger labor force and the same unemployed: the rate falls, LFPR rises.' },
    { k: 'parttime', from: 'e', to: 'e', t: 'A full-time worker is cut to part time.', lvl: 2, y: 'Part time still counts as employed. Neither rate moves.' },
    { k: 'hours', from: 'e', to: 'e', t: 'A firm cuts everyone from 40 hours a week to 25.', lvl: 3, y: 'They all still have jobs. Neither rate moves, which hides the pain.' },
  ];
  const TOWNS = [{ e: 57, u: 3, n: 40 }, { e: 46, u: 4, n: 50 }, { e: 72, u: 8, n: 20 }, { e: 54, u: 6, n: 40 }, { e: 63, u: 7, n: 30 }];
  const DIRS = [
    { rate: 'up', lfpr: 'up' }, { rate: 'up', lfpr: 'same' }, { rate: 'up', lfpr: 'down' },
    { rate: 'down', lfpr: 'up' }, { rate: 'down', lfpr: 'same' }, { rate: 'down', lfpr: 'down' },
    { rate: 'same', lfpr: 'same' },
  ];
  const dirLabel = (d) => `Rate ${d.rate}, LFPR ${d.lfpr}`;

  /* ================= 2.4 prices ================= */
  const NAMEIT = [
    { k: 'r1', t: 'The inflation rate rises from 2% to 4%.', key: 'rising', lvl: 1, y: 'The rate went up. Rising inflation.' },
    { k: 'd1', t: 'The inflation rate falls from 6% to 3%.', key: 'dis', lvl: 1, y: 'Prices still rise, just more slowly. Disinflation.' },
    { k: 'de1', t: 'The CPI falls from 215 to 214.', key: 'de', lvl: 1, y: 'The price level fell. Deflation.' },
    { k: 'd2', t: 'Prices rose 7% last year and 4% this year.', key: 'dis', lvl: 2, y: 'They still rose. Disinflation is not deflation.' },
    { k: 'r2', t: 'Prices rose 3% last year and 7% this year.', key: 'rising', lvl: 1, y: 'Faster price growth. Rising inflation.' },
    { k: 'de2', t: 'The price level fell 1% this year.', key: 'de', lvl: 1, y: 'A falling price level is deflation.' },
    { k: 'de3', t: 'The inflation rate goes from 1% to ' + MINUS + '1%.', key: 'de', lvl: 2, y: 'A negative inflation rate means prices fell. Deflation.' },
    { k: 'd3', t: 'The inflation rate falls from 9% to 8%.', key: 'dis', lvl: 2, y: 'A falling rate above zero. Disinflation.' },
    { k: 'd4', t: 'The CPI rises from 200 to 204, after rising 6% the year before.', key: 'dis', lvl: 3, y: 'That is 2% this year, down from 6%. Disinflation.' },
    { k: 'r3', t: 'The CPI rises from 100 to 102, then from 102 to 107.', key: 'rising', lvl: 3, y: 'That is 2%, then about 5%. Rising inflation.' },
  ];
  const BIAS = [
    { k: 'beef', t: 'Beef doubles in price. Families buy chicken. The basket still counts beef.', key: 'substitution', lvl: 1, y: 'People switched and the basket did not. Substitution bias.' },
    { k: 'bagels', t: 'Bagels double in price. Families switch to English muffins. The basket stays the same.', key: 'substitution', lvl: 1, y: 'A fixed basket misses the switch. Substitution bias.' },
    { k: 'gas', t: 'Gas gets pricey, so more people ride the LIRR. The basket does not change.', key: 'substitution', lvl: 2, y: 'People switched to something cheaper. Substitution bias.' },
    { k: 'tvs', t: 'A 2026 TV costs what a 2016 TV did but is far better.', key: 'betterq', lvl: 1, y: 'The CPI struggles to count improvements. Better quality.' },
    { k: 'cars', t: 'Cars cost a bit more but are much safer. The index mostly sees the price.', key: 'betterq', lvl: 2, y: 'Part of that price rise buys a better car. Better quality.' },
    { k: 'laptops', t: 'Laptops get faster every year at about the same price.', key: 'betterq', lvl: 1, y: 'More for the same money. Better quality.' },
    { k: 'cellphones', t: 'Cell phones were on sale for years before the CPI added them in 1998.', key: 'newgoods', lvl: 1, y: 'New products reach the basket late. New goods.' },
    { k: 'rides', t: 'Ride apps appear and cut travel costs. The old basket misses them.', key: 'newgoods', lvl: 2, y: 'A new product lowered costs before the basket caught it. New goods.' },
    { k: 'gadget', t: 'A new product saves people money, but the basket does not include it yet.', key: 'newgoods', lvl: 2, y: 'The basket updates late. New goods.' },
  ];

  /* ================= 2.5 who pays ================= */
  const EFFECTS = [
    { k: 'mortgage', t: 'A family with a fixed-rate mortgage.', s: 'A family with a fixed-rate mortgage', key: 'gains', lvl: 1, y: 'They repay in dollars that buy less.' },
    { k: 'tenant', t: 'A tenant with a fixed-rent lease.', s: 'A tenant with a fixed-rent lease', key: 'gains', lvl: 2, y: 'Rent stays put while other prices climb.' },
    { k: 'student', t: 'A graduate repaying a fixed-rate student loan from a bank.', s: 'A grad with a fixed-rate bank loan', key: 'gains', lvl: 1, y: 'The payments stay the same and buy less.' },
    { k: 'firmdebt', t: 'A firm that borrowed from a bank at a fixed rate to build a factory.', s: 'A firm with a fixed-rate bank loan', key: 'gains', lvl: 1, y: 'A borrower at a fixed rate repays in cheaper dollars.' },
    { k: 'treasury', t: 'The U.S. government, which owes money on fixed-rate bonds.', s: 'The government, on its fixed-rate bonds', key: 'gains', lvl: 2, y: 'The government is a fixed-rate borrower.' },
    { k: 'carloan', t: 'A car buyer with a fixed-rate loan from a bank.', s: 'A car buyer with a fixed-rate bank loan', key: 'gains', lvl: 1, y: 'A fixed-rate borrower repays in cheaper dollars.' },
    { k: 'boss', t: 'A firm that signed a 3-year contract at a fixed wage.', s: 'A firm paying a fixed 3-year wage', key: 'gains', lvl: 3, y: "Its prices rise but its wage bill does not." },
    { k: 'bank', t: 'A bank with fixed-rate mortgages.', s: 'A bank with fixed-rate mortgages', key: 'loses', lvl: 1, y: 'It gets repaid in dollars that buy less.' },
    { k: 'pension', t: 'A retiree with a fixed pension.', s: 'A retiree with a fixed pension', key: 'loses', lvl: 1, y: 'The same check buys less each year.' },
    { k: 'cash', t: 'Rina, who keeps $2,000 in cash.', s: 'Someone holding $2,000 in cash', key: 'loses', lvl: 1, y: 'Cash buys less when prices rise.' },
    { k: 'landlord', t: 'A landlord with a 3-year fixed-rent lease.', s: 'A landlord on a fixed-rent lease', key: 'loses', lvl: 2, y: 'The rent check is fixed and buys less.' },
    { k: 'salary', t: 'A worker on a fixed 3-year salary.', s: 'A worker on a fixed 3-year salary', key: 'loses', lvl: 1, y: 'Fixed pay buys less as prices climb.' },
    { k: 'bondholder', t: 'Someone who owns a fixed-rate bond.', s: 'Someone holding a fixed-rate bond', key: 'loses', lvl: 2, y: 'A bondholder is a lender at a fixed rate.' },
    { k: 'saver', t: 'A saver with a fixed-rate savings account.', s: 'A saver at a fixed rate', key: 'loses', lvl: 1, y: 'The interest was set for lower inflation.' },
    { k: 'cpipay', t: 'A worker whose pay is tied to the CPI.', s: 'A worker with pay tied to the CPI', key: 'protected', lvl: 1, y: 'Pay rises with prices, so real pay holds.' },
    { k: 'ss', t: 'A retiree on Social Security, which rises with the CPI.', s: 'A retiree on CPI-indexed Social Security', key: 'protected', lvl: 2, y: 'It is indexed. A cost-of-living raise keeps real income even.' },
    { k: 'cola', t: 'A worker with a cost-of-living raise in the contract.', s: 'A worker with a cost-of-living raise', key: 'protected', lvl: 2, y: 'Pay is indexed to prices. Protected.' },
    { k: 'adjustable', t: 'A bank whose loan rates adjust with inflation.', s: 'A bank with adjustable rates', key: 'protected', lvl: 3, y: 'The rate moves with inflation, so the real return holds.' },
    { k: 'indexedbond', t: 'A saver who holds bonds indexed to inflation.', s: 'A saver with indexed bonds', key: 'protected', lvl: 3, y: 'The payment rises with prices.' },
  ];
  const DEFLATION = [
    { k: 'bank', t: 'A bank that made fixed-rate car loans.', key: 'gains', lvl: 3, y: 'Surprise deflation makes fixed payments worth more. Lenders gain.' },
    { k: 'mortgage', t: 'A family paying a fixed-rate mortgage.', key: 'loses', lvl: 3, y: 'Each payment now buys more, so repaying costs them more.' },
    { k: 'pension', t: 'A retiree with a fixed pension.', key: 'gains', lvl: 3, y: 'The same check buys more when prices fall.' },
    { k: 'firmdebt', t: 'A firm that borrowed at a fixed rate from a bank.', key: 'loses', lvl: 3, y: 'A fixed-rate borrower loses when prices unexpectedly fall.' },
    { k: 'cash', t: 'Someone holding $2,000 in cash.', key: 'gains', lvl: 3, y: 'Cash buys more when prices fall.' },
    { k: 'gov', t: 'The government, which owes money on fixed-rate bonds.', key: 'loses', lvl: 3, y: 'It is a fixed-rate borrower. Surprise deflation hurts borrowers.' },
    /* added Nov 17, 2026: a saver is a lender too, and the bank that owes the saver is the borrower */
    { k: 'saver', t: 'A saver with a fixed-rate savings account at a bank.', key: 'gains', lvl: 3, y: 'The saver is the lender here. The fixed interest buys more when prices fall.' },
    { k: 'paysavers', t: 'A bank that owes its savers a fixed rate of interest.', key: 'loses', lvl: 3, y: 'Here the bank is the borrower. It repays savers in dollars worth more.' },
    { k: 'bondholder', t: 'Someone who owns a fixed-rate government bond.', key: 'gains', lvl: 3, y: 'A bondholder is a lender. The fixed payments buy more when prices fall.' },
    { k: 'lease', t: 'A shop that signed a two-year lease at a fixed rent.', key: 'loses', lvl: 3, y: 'The rent is fixed while other prices fall, so it costs more in real terms.' },
  ];
  const LOANS = [[5, 2, 8], [6, 2, 5], [7, 3, 9], [4, 2, 2], [6, 3, 1], [8, 4, 4], [5, 3, 6], [7, 5, 3], [9, 4, 7], [5, 2, 0], [6, 4, 4], [10, 6, 9]];
  const COSTS = [
    { k: 'labels', t: 'A grocery pays a clerk to swap its price stickers whenever costs climb.', key: 'menu', lvl: 1, y: 'Changing posted prices costs money. Menu costs.' },
    { k: 'priceboard', t: 'A barber keeps repainting his price board as his costs climb.', key: 'menu', lvl: 1, y: 'Changing posted prices again and again. Menu costs.' },
    { k: 'shelves', t: 'A store pays staff to update the prices on every shelf.', key: 'menu', lvl: 2, y: 'The labor to change prices is a menu cost.' },
    { k: 'catalog', t: 'A firm reprints its catalog because prices keep changing.', key: 'menu', lvl: 2, y: 'Reprinting prices is a menu cost.' },
    { k: 'race', t: 'Workers rush to the bank on payday before their cash loses value.', key: 'shoe', lvl: 1, y: 'Time and effort spent to avoid holding cash. Shoe-leather.' },
    { k: 'daily', t: 'A firm sends a worker to the bank every weekday so cash does not sit.', key: 'shoe', lvl: 2, y: 'Effort spent holding less money. Shoe-leather costs.' },
    { k: 'hours', t: 'A family spends hours moving savings so their cash keeps its value.', key: 'shoe', lvl: 3, y: 'Effort spent on avoiding cash losses. Shoe-leather.' },
  ];

  /* ================= 2.6 real v. nominal ================= */
  const REALNOM = [
    { k: 'current', t: 'Measured at current prices.', key: 'Nominal', lvl: 1, y: 'Nominal GDP uses this year\'s prices.' },
    { k: 'constant', t: 'Measured at constant base-year prices.', key: 'Real', lvl: 1, y: 'Real GDP holds prices at the base year.' },
    { k: 'spent', t: 'Tells you how much is spent on output.', key: 'Nominal', lvl: 1, y: 'Nominal GDP measures spending at current prices.' },
    { k: 'produced', t: 'Tells you how much is produced.', key: 'Real', lvl: 1, y: 'Real GDP measures output with price changes taken out.' },
    { k: 'priceup', t: 'Can rise just because prices rose.', key: 'Nominal', lvl: 2, y: 'Nominal GDP rises with prices, even if output does not.' },
    { k: 'outputonly', t: 'Rises only if output rises.', key: 'Real', lvl: 2, y: 'Prices are held constant, so only output moves it.' },
    { k: 'chained', t: 'The BEA reports it in chained dollars.', key: 'Real', lvl: 3, y: 'Chained dollars are how the BEA measures real GDP.' },
    { k: 'paycheck', t: 'Your pay: the dollar amount on the check.', key: 'Nominal', lvl: 1, y: 'The dollar amount, with no adjustment for prices, is nominal.' },
    { k: 'buys', t: 'Your pay: what it can actually buy.', key: 'Real', lvl: 1, y: 'What it buys, after taking out prices, is real.' },
    { k: 'ratestated', t: 'A bank rate of 6%, as written on the loan.', key: 'Nominal', lvl: 2, y: 'The stated rate is the nominal rate.' },
    { k: 'rateminus', t: 'A bank rate minus inflation.', key: 'Real', lvl: 2, y: 'Real interest rate = nominal rate minus inflation.' },
  ];
  const BOTHMOVES = [[0, 5], [3, 0], [-2, 6], [-3, 0], [2, 3], [0, 8], [4, 2], [-1, 4], [-4, 0], [5, 1], [0, 3], [-3, 7]];
  const MOVE_BINS = ['Nominal up, real same', 'Both up', 'Nominal up, real down', 'Both down'];

  /* ================= 2.7 cycle text ================= */
  const PHASES = [
    { k: 'up3', t: 'Real GDP has been rising for three years.', key: 'expansion', lvl: 1, y: 'Rising real GDP is an expansion.' },
    { k: 'falling', t: 'Real GDP is falling and layoffs are spreading.', key: 'contraction', lvl: 1, y: 'Falling real GDP is a contraction.' },
    { k: 'high', t: 'Real GDP just hit its highest point. It falls next.', key: 'peak', lvl: 1, y: 'The top turning point is the peak.' },
    { k: 'low', t: 'The contraction just ended. Real GDP turns up from here.', key: 'trough', lvl: 1, y: 'The bottom turning point is the trough.' },
    { k: 'hiring', t: 'Firms are hiring and real GDP keeps climbing.', key: 'expansion', lvl: 1, y: 'Rising output and jobs. An expansion.' },
    { k: 'stopped', t: 'Output has stopped rising. The next move is down.', key: 'peak', lvl: 2, y: 'An expansion ends at the peak.' },
    { k: 'turning', t: 'Output has stopped falling. The next move is up.', key: 'trough', lvl: 2, y: 'A contraction ends at the trough.' },
    { k: 'allfall', t: 'Spending, jobs, and output are all falling.', key: 'contraction', lvl: 1, y: 'A contraction. A deep, widespread one is a recession.' },
  ];
  const SIGNS = [[6.5, 4.5], [3.5, 4.5], [5, 5], [7, 5], [4, 5], [4.5, 4.5], [8, 5], [3, 4], [5.5, 4], [4.2, 4.2]];

  /* ================= memos: three lines, one is wrong ================= */
  const MEMOS = [
    { k: 'invest', d: 'gdp', lvl: 2, l: ['New homes count as investment.', 'Stocks count as investment.', 'Unsold goods made this year count as investment.'], bad: 1, y: 'Stocks change who owns a firm. I means new equipment, buildings, homes, inventories.' },
    { k: 'transfers', d: 'gdp', lvl: 2, l: ['Social Security checks count in G.', "A town's new fire truck counts in G.", 'A public school teacher\'s pay counts in G.'], bad: 0, y: 'Social Security is a transfer. G is purchases of goods and services.' },
    { k: 'where', d: 'gdp', lvl: 2, l: ['U.S. GDP counts goods made by U.S. firms abroad.', "U.S. GDP counts a foreign firm's output in the U.S.", 'GDP counts only final goods and services.'], bad: 0, y: 'GDP counts what is produced within the country, whoever owns the firm.' },
    { k: 'approaches', d: 'gdp', lvl: 2, l: ['The income approach adds wages, rent, interest, profit.', 'The value-added approach adds up every sale.', 'The expenditures approach adds C + I + G + Xn.'], bad: 1, y: 'Adding every sale double counts. Value added takes out what each firm bought.' },
    { k: 'flow', d: 'gdp', lvl: 1, l: ['Households sell factors to firms in the factor market.', 'Firms sell goods to households in the factor market.', 'Money and real things flow in opposite directions.'], bad: 1, y: 'Goods and services are sold in the product market.' },
    { k: 'loop', d: 'gdp', lvl: 2, l: ['Taxes, savings, and imports leave the loop.', 'Exports leave the loop.', 'Government purchases come into the loop.'], bad: 1, y: 'Exports bring money into the loop. Imports send it out.' },
    { k: 'identity', d: 'gdp', lvl: 3, l: ['Total spending equals total income.', 'One person\'s spending is another\'s income.', 'Imports add to GDP.'], bad: 2, y: 'Imports are subtracted. They were produced in another country.' },

    { k: 'volunteer', d: 'miss', lvl: 1, l: ['GDP per capita = GDP ÷ population.', 'GDP counts volunteer work at its market value.', 'GDP leaves out unpaid household work.'], bad: 1, y: 'Volunteering is nonmarket. It has no price, so GDP misses it.' },
    { k: 'flood', d: 'miss', lvl: 3, l: ['Rebuilding after a flood raises GDP.', 'GDP subtracts the homes a flood destroyed.', 'GDP can rise without people being better off.'], bad: 1, y: 'GDP never subtracts the loss. It only counts the rebuilding.' },
    { k: 'capita', d: 'miss', lvl: 2, l: ['A bigger total GDP always means a higher standard of living.', 'GDP per capita is a better measure of living standards.', 'If population grows faster than real GDP, real GDP per capita falls.'], bad: 0, y: 'Total GDP ignores how many people share it. Divide by population.' },

    { k: 'discouraged', d: 'jobs', lvl: 1, l: ['Discouraged workers count as unemployed.', 'Part-time workers count as employed.', 'Students who are not looking are not in the labor force.'], bad: 0, y: 'Discouraged workers stopped looking, so they are not in the labor force.' },
    { k: 'denominator', d: 'jobs', lvl: 1, l: ['The unemployment rate divides by all adults.', 'The labor force is employed plus unemployed.', 'The LFPR divides the labor force by adults.'], bad: 0, y: 'Unemployment rate = unemployed ÷ labor force, not all adults.' },
    { k: 'fullemp', d: 'jobs', lvl: 2, l: ['Full employment means zero unemployment.', 'The natural rate = frictional + structural.', 'Cyclical = actual ' + MINUS + ' natural.'], bad: 0, y: 'Full employment means zero cyclical unemployment, not zero unemployment.' },
    { k: 'lfprmoves', d: 'jobs', lvl: 2, l: ['A discouraged worker lowers the LFPR.', 'A new job seeker raises the LFPR.', 'A job seeker getting hired raises the LFPR.'], bad: 2, y: 'He moved inside the labor force, so the LFPR does not change.' },
    { k: 'understates', d: 'jobs', lvl: 2, l: ['The rate overstates joblessness because it counts part-timers.', 'The rate leaves out discouraged workers.', 'Part-timers who want full-time jobs count as employed.'], bad: 0, y: 'It understates joblessness: discouraged workers and part-timers are hidden.' },
    { k: 'rate-fell', d: 'jobs', lvl: 3, l: ['The unemployment rate fell, so more people must have jobs.', 'The rate can fall when people stop looking.', 'The rate can rise when people start looking.'], bad: 0, y: 'The rate also falls when discouraged workers leave the labor force.' },

    { k: 'threewords', d: 'prices', lvl: 1, l: ['Disinflation means prices fall.', 'Deflation means the price level falls.', 'Inflation means the price level rises.'], bad: 0, y: 'Disinflation: prices still rise, just more slowly.' },
    { k: 'overstates', d: 'prices', lvl: 1, l: ['The CPI understates true inflation.', 'The CPI uses a fixed basket.', 'The base-year index is 100.'], bad: 0, y: 'The CPI overstates true inflation: substitution, new goods, better quality.' },
    { k: 'baseyear', d: 'prices', lvl: 3, l: ['In the base year, the price index is 100.', 'In the base year, real GDP equals nominal GDP.', 'In the base year, the inflation rate is zero.'], bad: 2, y: 'Prices can still rise that year. The index just equals 100 by definition.' },
    { k: 'index120', d: 'prices', lvl: 2, l: ['An index of 120 means prices rose 20% since the base year.', 'An index of 120 means prices rose 20% this year.', 'A rise from 120 to 126 is 5% inflation.'], bad: 1, y: 'The index compares with the base year, not with last year.' },
    { k: 'realwage', d: 'prices', lvl: 2, l: ['Real wage = nominal wage ÷ CPI × 100.', 'If the CPI is 125, a $25 wage is worth $20 in base-year dollars.', 'If your wage rises, your real wage must rise.'], bad: 2, y: 'If prices rise faster than your wage, your real wage falls.' },

    { k: 'helps', d: 'costs', lvl: 1, l: ['Surprise inflation helps lenders.', 'Surprise inflation helps fixed-rate borrowers.', 'Surprise inflation hurts people on fixed incomes.'], bad: 0, y: 'Lenders get repaid in dollars that buy less.' },
    { k: 'expected', d: 'costs', lvl: 2, l: ['Expected inflation is built into interest rates.', 'Expected inflation moves a lot of wealth to borrowers.', 'Real interest rate = nominal rate ' + MINUS + ' inflation.'], bad: 1, y: 'Expected inflation is built in, so it redistributes little.' },
    { k: 'deflationmemo', d: 'costs', lvl: 3, l: ['Surprise deflation helps lenders.', 'Surprise deflation helps fixed-rate borrowers.', 'A dollar buys more when the price level falls.'], bad: 1, y: 'Borrowers repay in dollars worth more, so deflation hurts them.' },
    { k: 'indexed', d: 'costs', lvl: 2, l: ['Pay tied to the CPI protects a worker from surprise inflation.', 'A fixed pension protects a retiree from surprise inflation.', 'Indexed contracts rise with prices.'], bad: 1, y: 'A fixed pension buys less as prices rise.' },

    { k: 'nomfall', d: 'real', lvl: 1, l: ['Nominal GDP can rise while real GDP falls.', 'Real GDP is measured at current prices.', 'Real GDP takes out changes in the price level.'], bad: 1, y: 'Nominal uses current prices. Real uses constant base-year prices.' },
    { k: 'def110', d: 'real', lvl: 2, l: ['Deflator = nominal GDP ÷ real GDP × 100.', 'A deflator of 110 means prices are 10% above the base year.', 'A deflator of 110 means real GDP grew 10%.'], bad: 2, y: 'The deflator measures prices, not output.' },
    { k: 'covid', d: 'real', lvl: 3, l: ['Real GDP can fall while the price level rises.', 'If nominal GDP rose, the economy must have made more.', 'In 2020, real GDP fell more than nominal GDP.'], bad: 1, y: 'Nominal GDP can rise from prices alone. Check real GDP.' },

    { k: 'official', d: 'cycle', lvl: 1, l: ['The NBER decides when a recession starts.', 'Two quarters of falling real GDP is the official definition.', 'A recession is a significant, widespread contraction.'], bad: 1, y: 'Two quarters is only a rule of thumb. The NBER looks at many measures.' },
    { k: 'potentialfalls', d: 'cycle', lvl: 2, l: ['Potential real GDP falls in a contraction.', 'Actual real GDP falls in a contraction.', 'A trough comes right before an expansion.'], bad: 0, y: 'Actual falls. The potential line keeps climbing.' },
    { k: 'gaps', d: 'cycle', lvl: 2, l: ['A negative gap means unemployment above the natural rate.', 'A positive gap means unemployment below the natural rate.', 'At potential output, unemployment is zero.'], bad: 2, y: 'At potential, unemployment equals the natural rate.' },
    { k: 'gapdef', d: 'cycle', lvl: 2, l: ['Output gap = actual ' + MINUS + ' potential.', 'A negative gap means actual is above potential.', 'In a positive gap, prices tend to rise.'], bad: 1, y: 'Negative means actual is below potential.' },
    { k: 'atpotential', d: 'cycle', lvl: 3, l: ['A falling economy can pass right through potential.', 'Being at potential means the economy is at a peak.', 'Real GDP is on the vertical axis of the cycle graph.'], bad: 1, y: 'The peak is the top of the wave. The wave crosses potential on the way down too.' },

    { k: 'ceiling', d: 'micro', lvl: 2, l: ['A binding price ceiling creates a shortage.', 'A binding price floor creates a surplus.', 'A price ceiling above equilibrium creates a shortage.'], bad: 2, y: 'A ceiling above equilibrium is nonbinding. Nothing changes.' },
    { k: 'tax', d: 'micro', lvl: 2, l: ['A per-unit tax creates deadweight loss.', 'A per-unit tax raises the price buyers pay.', 'A per-unit tax raises the quantity sold.'], bad: 2, y: 'The tax cuts the quantity sold. Lost trades are the deadweight loss.' },
    { k: 'tariff', d: 'micro', lvl: 2, l: ['A tariff raises the U.S. price.', 'A tariff raises consumer surplus.', 'U.S. makers sell more under a tariff.'], bad: 1, y: 'A higher price means buyers lose consumer surplus.' },
    { k: 'quota', d: 'micro', lvl: 3, l: ['A quota raises the price buyers pay.', 'A tariff brings the government revenue.', 'A quota brings the government tariff revenue.'], bad: 2, y: 'A quota limits imports. It collects no tariff.' },
  ];

  /* ================= micro flashback records ================= */
  const MICRO_MKT = [
    { k: 'rent', t: 'Equilibrium rent is $2,000. The town sets a rent ceiling of $1,500.', key: 'Shortage', lvl: 1, y: 'A ceiling below equilibrium binds. A shortage.' },
    { k: 'rent2', t: 'Equilibrium rent is $2,000. The town sets a rent ceiling of $2,500.', key: 'No effect', lvl: 2, y: 'A ceiling above equilibrium does not bind.' },
    { k: 'wheat', t: 'Equilibrium wheat is $6 a bushel. The government sets a floor of $8.', key: 'Surplus', lvl: 1, y: 'A floor above equilibrium binds. A surplus.' },
    { k: 'minwage', t: 'The equilibrium wage is $18. The law sets a minimum wage of $15.', key: 'No effect', lvl: 2, y: 'A floor below equilibrium does not bind.' },
    { k: 'minwage2', t: 'The equilibrium wage is $15. The law sets a minimum wage of $18.', key: 'Surplus', lvl: 2, y: 'A binding floor: more workers looking than jobs. A surplus of labor.' },
  ];
  const MICRO_TAX = [
    { k: 'inelastic', t: 'Demand is very inelastic and supply slopes upward. A $1 tax goes on sellers.', key: 'Buyers', lvl: 2, y: 'Buyers cannot switch, so they pay most of it.' },
    { k: 'elastic', t: 'Buyers have many close substitutes and supply slopes upward. A $1 tax goes on sellers.', key: 'Sellers', lvl: 2, y: 'Buyers switch easily, so sellers absorb most of it.' },
    { k: 'nosub', t: 'Buyers have no good substitutes and supply slopes upward. A $1 tax goes on sellers.', key: 'Buyers', lvl: 2, y: 'Inelastic demand: buyers pay most of the tax.' },
    { k: 'elastic2', t: 'Demand is very elastic and supply slopes upward. A $2 tax goes on sellers.', key: 'Sellers', lvl: 3, y: 'Elastic demand: sellers pay most of the tax.' },
  ];
  const MICRO_ELASTIC = [
    { k: 'inhaler', t: 'An asthma inhaler, for someone who needs one.', key: 'Inelastic', lvl: 1, y: 'A necessity with no substitute. Inelastic.' },
    { k: 'brand', t: 'One pizza shop in a town with ten pizza shops.', key: 'Elastic', lvl: 1, y: 'Many close substitutes. Elastic.' },
    { k: 'p10q25', t: 'Price rises 10%. Quantity falls 25%.', key: 'Elastic', lvl: 2, y: 'Quantity moved more than price: 25 ÷ 10 = 2.5.' },
    { k: 'p20q5', t: 'Price rises 20%. Quantity falls 5%.', key: 'Inelastic', lvl: 2, y: 'Quantity moved less than price: 5 ÷ 20 = 0.25.' },
    { k: 'color', t: 'One color of a sneaker among many colors.', key: 'Elastic', lvl: 1, y: 'Close substitutes make demand elastic.' },
    { k: 'gasnow', t: 'Gas next week, for a driver who must drive.', key: 'Inelastic', lvl: 2, y: 'Few substitutes in the short run. Inelastic.' },
  ];
  const SURPLUS = [
    { f: 'cs', wtp: 10, price: 6 }, { f: 'cs', wtp: 25, price: 18 }, { f: 'cs', wtp: 200, price: 150 },
    { f: 'ps', price: 6, min: 3 }, { f: 'ps', price: 40, min: 25 }, { f: 'ps', price: 12, min: 7 },
  ];

  /* ================= math tasks =================
     numTask takes the right value and named mistakes. It keeps four different numbers, each with one reason. */
  function numTask(o) {
    const f = o.fmt || fmt.pct;
    const shown = f(o.value);
    const seen = new Set([shown]);
    const wrongs = [];
    (o.wrongs || []).forEach((w) => {
      const lab = f(w.v);
      if (!seen.has(lab) && wrongs.length < 3) { seen.add(lab); wrongs.push({ label: lab, why: w.why, v: w.v }); }
    });
    // A bank entry should always have enough named mistakes. This guards against repeats in rare number sets.
    let tryStep = 1;
    const nudge = Math.max(Math.abs(o.value) * 0.1, 1); // additive, so a right answer of zero can't loop forever
    while (wrongs.length < 3) {
      const lab = f(o.value + nudge * tryStep);
      if (!seen.has(lab)) { seen.add(lab); wrongs.push({ label: lab, why: 'Check the arithmetic.', v: o.value + nudge * tryStep }); }
      tryStep++;
    }
    const correct = { label: shown, why: 'Right. ' + (o.right || o.work), v: o.value };
    correct.why = correct.why.length > 80 ? 'Right.' : correct.why;
    const all = lowToHigh([correct].concat(wrongs));
    return finish({
      id: o.id, desk: o.desk, verb: 'pick', lvl: o.lvl, order: o.order, ask: o.ask, text: o.text, table: o.table, thead: o.thead,
      options: all, answer: all.indexOf(correct), why: o.why || o.work, work: o.work, formula: o.formula,
      calc: Object.assign({ f: o.calcF, in: o.calcIn, value: o.value, shown, fmt: Object.keys(fmt).find((k) => fmt[k] === f) }, o.calcExtra || {}),
    });
  }

  const F = {
    urate: 'Unemployment rate = unemployed ÷ labor force × 100',
    lfpr: 'LFPR = labor force ÷ adult population × 100',
    lf: 'Labor force = employed + unemployed',
    gdp: 'GDP = C + I + G + Xn, and Xn = X ' + MINUS + ' M',
    xn: 'Xn = exports ' + MINUS + ' imports',
    income: 'GDP = wages + rent + interest + profit',
    percap: 'GDP per capita = GDP ÷ population',
    cpi: 'Price index = cost of the basket ÷ cost in the base year × 100',
    infl: 'Inflation rate = (new ' + MINUS + ' old) ÷ old × 100',
    realwage: 'Real wage = nominal wage ÷ CPI × 100',
    convert: 'Into year B dollars: price in A × (CPI in B ÷ CPI in A)',
    realgdp: 'Real GDP = nominal GDP ÷ deflator × 100',
    deflator: 'GDP deflator = nominal GDP ÷ real GDP × 100',
    growth: 'Real growth = (new real ' + MINUS + ' old real) ÷ old real × 100',
    cyclical: 'Cyclical = actual ' + MINUS + ' natural',
    natural: 'Natural rate = frictional + structural',
    gap: 'Output gap % = (actual ' + MINUS + ' potential) ÷ potential × 100',
    realrate: 'Real interest rate = nominal rate ' + MINUS + ' inflation rate',
    basketinfl: 'Cost of the basket = price × quantity, added up. Then (new ' + MINUS + ' old) ÷ old × 100',
    basketcpi: 'Cost of the basket = price × quantity, added up. CPI = cost ÷ base-year cost × 100',
  };

  /* Number sets are written out, not random, so everyTask() can list and check every one. */
  const SETS = {
    urate: [[1200, 60, 800], [1000, 60, 600], [2000, 100, 1000], [2500, 100, 500], [1600, 80, 400], [800, 40, 500], [4000, 240, 1000], [5000, 200, 3000], [1250, 50, 750], [3000, 210, 2000], [1500, 120, 500]],
    gdp: [[600, 150, 200, 80, 100], [500, 120, 180, 60, 40], [800, 150, 300, 90, 140], [450, 100, 150, 70, 50], [1000, 250, 400, 200, 150], [300, 80, 120, 40, 60]],
    xn: [[120, 170], [200, 150], [90, 140], [300, 260], [75, 100], [410, 500]],
    income: [[600, 50, 70, 180], [400, 40, 30, 130], [800, 90, 60, 250], [500, 60, 40, 200], [350, 25, 25, 100]],
    chain: [[3, 9, 20, 40], [5, 12, 30, 50], [2, 8, 15, 30], [4, 11, 24, 35], [6, 15, 25, 60]],
    percap: [[800, 40], [1200, 30], [450, 15], [2000, 50], [750, 25], [1000, 20]],
    cpi: [[20, 25], [50, 60], [40, 42], [200, 230], [60, 66], [80, 100], [25, 30], [120, 132]],
    infl: [[120, 126], [200, 210], [150, 156], [125, 130], [110, 121], [160, 168], [250, 260], [100, 103], [180, 189]],
    wage: [[18, 120], [22, 110], [25, 125], [30, 150], [27, 135], [24, 120], [33, 110]],
    convert: [[20, 100, 150], [12, 150, 300], [40, 160, 240], [5, 120, 240], [15, 200, 320], [30, 125, 250]],
    basket: [[3, 4, 2, 15], [2, 5, 3, 12], [5, 3, 1, 20], [4, 4, 2, 11], [6, 2, 3, 10]],
    real: [[1000, 105], [1200, 110], [800, 125], [500, 120], [600, 110], [1500, 120], [2000, 110], [400, 125]],
    growth: [[800, 5, 110], [500, -4, 125], [1000, 10, 105], [600, 5, 120], [1000, -2, 110], [400, 5, 110], [700, -10, 120], [1000, 5, 120]],
    onegood: [[200, 5, 210, 6], [100, 4, 110, 5], [50, 8, 60, 10], [300, 2, 330, 3], [400, 3, 420, 4]],
    cyclical: [[6.5, 4.5], [7, 5], [6, 4.5], [3.5, 4.5], [5.5, 4], [8, 5], [4, 5], [5, 5]],
    natural: [[2, 3, 1], [1.5, 3, 2], [2.5, 2, 1.5], [1, 3, 2], [2, 2.5, 3]],
    gap: [[1200, 1140], [500, 520], [2000, 1900], [600, 630], [400, 380], [1500, 1530], [900, 864]],
    realrate: [[7, 3], [6, 9], [4, -2], [5, 8], [8, 2], [3, 1], [10, 4]],
    wagechange: [[3, 5], [5, 2], [6, 8], [7, 3], [10, 12], [4, 1]],
  };

  /* The second batch of number sets. Every one is checked by bank.test.js. */
  SETS.urate.push([1000, 50, 500], [2000, 80, 1000], [2500, 150, 1500], [1200, 84, 800], [1600, 112, 1000], [4000, 200, 2000], [800, 56, 400], [5000, 300, 2500], [2500, 175, 500], [1000, 70, 250], [3000, 150, 1000], [2000, 160, 500], [1500, 90, 1000], [4000, 160, 1000], [1250, 100, 250], [2400, 120, 1600], [3200, 160, 800]);
  SETS.gdp.push([550, 130, 170, 60, 90], [650, 160, 240, 70, 120], [950, 200, 350, 100, 130], [720, 180, 200, 90, 60], [480, 110, 160, 50, 70], [1100, 300, 400, 150, 250], [360, 90, 110, 40, 50], [820, 210, 290, 120, 80], [590, 140, 220, 75, 95], [1200, 260, 380, 140, 200]);
  SETS.xn.push([250, 300], [180, 120], [60, 95], [140, 90], [500, 620], [330, 280], [85, 40], [75, 125]);
  SETS.income.push([450, 40, 35, 125], [700, 70, 80, 200], [250, 30, 20, 100], [900, 100, 90, 310], [550, 50, 60, 140], [620, 45, 55, 180]);
  SETS.chain.push([3, 8, 18, 32], [4, 10, 22, 38], [2, 7, 16, 28], [5, 14, 26, 48], [6, 13, 29, 52], [3, 9, 21, 36]);
  SETS.percap.push([600, 30], [900, 30], [1500, 50], [2500, 50], [480, 12], [350, 10], [1800, 40], [640, 16], [720, 24], [3000, 60]);
  SETS.cpi.push([30, 33], [50, 55], [80, 88], [100, 125], [75, 90], [60, 75], [90, 108], [150, 180], [250, 275], [200, 210], [160, 200], [40, 50], [120, 150]);
  SETS.infl.push([140, 147], [220, 231], [300, 309], [120, 123], [130, 143], [170, 178.5], [240, 252], [210, 216.3], [260, 273], [110, 112.2], [320, 336], [400, 412]);
  SETS.wage.push([35, 125], [26, 130], [36, 120], [28, 140], [21, 105], [40, 160], [45, 150], [32, 128], [15, 125], [54, 135]);
  SETS.convert.push([8, 100, 200], [25, 125, 200], [9, 150, 250], [60, 200, 250], [16, 160, 320], [2, 100, 350], [50, 250, 300], [10, 120, 180]);
  SETS.basket.push([3, 5, 2, 10], [4, 3, 2, 14], [2, 6, 3, 8], [5, 4, 2, 12], [6, 3, 1, 18], [3, 6, 4, 9], [2, 7, 2, 15]);
  SETS.real.push([900, 110], [750, 120], [1100, 105], [1250, 120], [3000, 110], [2500, 120], [640, 125], [1800, 105], [1400, 110], [2200, 105], [320, 125], [1300, 120]);
  SETS.growth.push([900, 10, 110], [800, -5, 125], [1200, 5, 105], [500, 10, 120], [2000, -5, 110], [600, 10, 105], [1500, -2, 120], [400, -5, 105], [1000, 4, 125], [800, 10, 125]);
  SETS.onegood.push([100, 5, 120, 6], [80, 10, 90, 12], [250, 4, 260, 5], [150, 6, 165, 7], [60, 20, 66, 25], [500, 2, 520, 3]);
  SETS.cyclical.push([5.5, 4.5], [6, 5], [7.5, 5], [3, 4.5], [4.5, 4], [9, 5.5], [6.5, 5], [4, 4.5], [7, 4.5]);
  SETS.natural.push([1, 2.5, 1], [2.5, 3, 1], [1.5, 2, 2.5], [3, 2, 1], [2, 4, 1], [1.5, 2.5, 0.5]);
  SETS.gap.push([1000, 980], [800, 840], [2500, 2400], [1250, 1200], [700, 728], [1600, 1520], [300, 306], [2000, 2100], [1000, 1030], [1800, 1710]);
  SETS.realrate.push([6, 2], [9, 5], [4, 6], [5, 1], [3, 5], [8, 10], [6, -1], [2, 2]);
  SETS.wagechange.push([2, 4], [8, 3], [9, 4], [1, 3], [6, 2], [5, 7]);
  SURPLUS.push({ f: 'cs', wtp: 30, price: 22 }, { f: 'cs', wtp: 12, price: 8 }, { f: 'cs', wtp: 75, price: 50 }, { f: 'cs', wtp: 500, price: 420 }, { f: 'ps', price: 20, min: 12 }, { f: 'ps', price: 90, min: 60 }, { f: 'ps', price: 15, min: 9 }, { f: 'ps', price: 300, min: 220 });
  LOANS.push([4, 1, 3], [6, 2, 2], [8, 3, 1], [9, 5, 8], [7, 2, 6], [5, 1, 1], [6, 3, 0], [10, 5, 7], [3, 1, 0], [12, 8, 8]);
  SIGNS.push([5.5, 4.5], [3.5, 4], [6, 5], [4.5, 5], [5, 4.5], [7.5, 5], [4, 4], [3, 4.5], [8.5, 5], [6, 6]);
  PERCAP_MOVES.push([6, 2], [2, 5], [3, 3], [1, 4], [4, 4], [5, 2]);
  BOTHMOVES.push([0, 2], [1, 0], [-1, 5], [-2, 0], [3, 2], [2, 0], [0, 6], [-5, 2]);

  const GEN = {
    urate([lf, u, n], r, lvl) {
      const e = lf - u, adults = lf + n;
      return numTask({
        r, desk: 'jobs', lvl, order: 'UNEMPLOYMENT RATE?', table: [['Employed', fmt.num(e)], ['Unemployed', fmt.num(u)], ['Not in the labor force', fmt.num(n)]],
        value: u / lf * 100, calcF: 'urate', calcIn: { u, lf }, formula: F.urate,
        wrongs: [{ v: u / adults * 100, why: 'That divides by all adults.' }, { v: u / e * 100, why: 'That divides by the employed only.' }, { v: e / adults * 100, why: 'That is the share of adults with jobs.' }, { v: lf / adults * 100, why: 'That is the LFPR.' }],
        work: `${fmt.num(u)} ÷ ${fmt.num(lf)} × 100 = ${fmt.pct(u / lf * 100)}`,
      });
    },
    lfpr([lf, u, n], r, lvl) {
      const e = lf - u, adults = lf + n;
      return numTask({
        r, desk: 'jobs', lvl, order: 'LFPR?', ask: 'Labor force participation rate', table: [['Employed', fmt.num(e)], ['Unemployed', fmt.num(u)], ['Not in the labor force', fmt.num(n)]],
        value: lf / adults * 100, calcF: 'lfpr', calcIn: { lf, adults }, formula: F.lfpr,
        wrongs: [{ v: e / adults * 100, why: 'That counts only the employed.' }, { v: u / lf * 100, why: 'That is the unemployment rate.' }, { v: n / adults * 100, why: 'That is the share not in the labor force.' }],
        work: `${fmt.num(lf)} ÷ ${fmt.num(adults)} × 100 = ${fmt.pct(lf / adults * 100)}`,
      });
    },
    lf([lf, u, n], r, lvl) {
      const e = lf - u;
      return numTask({
        r, desk: 'jobs', lvl, order: 'LABOR FORCE?', table: [['Employed', fmt.num(e)], ['Unemployed', fmt.num(u)], ['Not in the labor force', fmt.num(n)]], fmt: fmt.num,
        value: e + u, calcF: 'lf', calcIn: { e, u }, formula: F.lf,
        wrongs: [{ v: e + u + n, why: 'That is all adults.' }, { v: e + n, why: 'People with no job who are not looking are out.' }, { v: e, why: 'That leaves out the unemployed.' }],
        work: `${fmt.num(e)} + ${fmt.num(u)} = ${fmt.num(lf)}`,
      });
    },
    gdp([c, i, g, x, m], r, lvl) {
      const val = c + i + g + x - m;
      return numTask({
        r, desk: 'gdp', lvl, order: 'GDP?', ask: 'In billions of dollars', fmt: fmt.bil, table: [['C', c], ['I', i], ['G', g], ['Exports', x], ['Imports', m]],
        value: val, calcF: 'gdp', calcIn: { c, i, g, x, m }, formula: F.gdp,
        wrongs: [{ v: c + i + g, why: 'That leaves out Xn.' }, { v: c + i + g + x, why: 'That never subtracts imports.' }, { v: c + i + g + x + m, why: 'Imports are subtracted, not added.' }, { v: c + i + g - x + m, why: 'Xn is exports minus imports. You flipped it.' }],
        work: `${c} + ${i} + ${g} + (${x} ${MINUS} ${m}) = ${fmt.num(val)}`,
      });
    },
    xn([x, m], r, lvl) {
      return numTask({
        r, desk: 'gdp', lvl, order: 'NET EXPORTS?', ask: 'In billions of dollars', fmt: fmt.bil, table: [['Exports', x], ['Imports', m]],
        value: x - m, calcF: 'xn', calcIn: { x, m }, formula: F.xn,
        wrongs: [{ v: m - x, why: 'Flipped. It is exports minus imports.' }, { v: x + m, why: 'Imports are subtracted, not added.' }, { v: x, why: 'That leaves out imports.' }],
        work: `${x} ${MINUS} ${m} = ${sign(x - m)}${comma(x - m)}`,
      });
    },
    income([w, re, n, p], r, lvl) {
      const val = w + re + n + p;
      return numTask({
        r, desk: 'gdp', lvl, order: 'GDP, INCOME APPROACH?', ask: 'In billions of dollars', fmt: fmt.bil, table: [['Wages', w], ['Rent', re], ['Interest', n], ['Profit', p]],
        value: val, calcF: 'income', calcIn: { w, r: re, n, p }, formula: F.income,
        wrongs: [{ v: w + re + n, why: 'That leaves out profit.' }, { v: w + p, why: 'That leaves out rent and interest.' }, { v: w, why: 'That is wages alone.' }],
        work: `${w} + ${re} + ${n} + ${p} = ${fmt.num(val)}`,
      });
    },
    finalprice(ch, r, lvl) {
      const [a, b, c, d] = ch;
      const total = a + b + c + d;
      return numTask({
        r, desk: 'gdp', lvl, order: 'HOW MUCH GDP?', ask: 'One hoodie, four sales', fmt: fmt.usd, table: [['Farm sells cotton', '$' + a], ['Mill sells fabric', '$' + b], ['Factory sells hoodie', '$' + c], ['Store sells it to you', '$' + d]],
        value: d, calcF: 'final', calcIn: { prices: ch },
        wrongs: [{ v: total, why: 'Double counting. Earlier sales are intermediate goods.' }, { v: d - a, why: 'The first sale is value added too. Do not subtract it.' }, { v: c, why: 'That stops before the final sale.' }],
        work: `Only the final price counts: $${d}. The value added at each step adds up to it.`,
      });
    },
    valueadded(ch, r, lvl) {
      const [, b, c, d] = ch;
      return numTask({
        r, desk: 'gdp', lvl, order: "THE FACTORY'S VALUE ADDED?", fmt: fmt.usd, table: [['Mill sells fabric', '$' + b], ['Factory sells hoodie', '$' + c], ['Store sells it to you', '$' + d]],
        value: c - b, calcF: 'va', calcIn: { sale: c, bought: b },
        wrongs: [{ v: c, why: "That is the factory's sale, with the fabric still in it." }, { v: b, why: 'That is what the mill sold.' }, { v: d - c, why: "That is the store's value added." }],
        work: `$${c} ${MINUS} $${b} = $${c - b}`,
      });
    },
    percap([g, p], r, lvl) {
      const v = g * 1e9 / (p * 1e6);
      return numTask({
        r, desk: 'miss', lvl, order: 'GDP PER CAPITA?', fmt: fmt.usd, table: [['GDP', '$' + fmt.num(g) + ' billion'], ['Population', fmt.num(p) + ' million']],
        value: v, calcF: 'percap', calcIn: { gdpB: g, popM: p }, formula: F.percap,
        wrongs: [{ v: v / 10, why: 'Check the zeros. A billion is 1,000 million.' }, { v: v * 10, why: 'Check the zeros. A billion is 1,000 million.' }, { v: g * 1000 / p / 100, why: 'Check the zeros. A billion is 1,000 million.' }],
        work: `$${fmt.num(g)} billion ÷ ${fmt.num(p)} million = ${fmt.usd(v)}`,
      });
    },
    cpi([base, now], r, lvl) {
      const v = now / base * 100;
      return numTask({
        r, desk: 'prices', lvl, order: 'PRICE INDEX?', fmt: fmt.idx, table: [['Basket in the base year', fmt.usd2(base)], ['Basket this year', fmt.usd2(now)]],
        value: v, calcF: 'cpi', calcIn: { now, base }, formula: F.cpi,
        wrongs: [{ v: base / now * 100, why: 'That is base ÷ now. Flip it.' }, { v: (now - base) / base * 100, why: 'That is the percent rise, not the index.' }, { v: now - base, why: 'That is the change in dollars.' }],
        work: `${fmt.usd2(now)} ÷ ${fmt.usd2(base)} × 100 = ${fmt.idx(v)}`,
      });
    },
    infl([old, neu], r, lvl) {
      const v = (neu - old) / old * 100;
      return numTask({
        r, desk: 'prices', lvl, order: 'INFLATION RATE?', table: [['CPI last year', old], ['CPI this year', neu]],
        value: v, calcF: 'infl', calcIn: { old, neu }, formula: F.infl,
        wrongs: [{ v: neu - old, why: 'That is the change in index points.' }, { v: (neu - old) / neu * 100, why: 'Divide by the old index, not the new one.' }, { v: neu - 100, why: 'That is the rise since the base year.' }, { v: neu / old * 100, why: 'Subtract the old index first. This is a ratio, not a rate.' }, { v: neu, why: 'That is the index itself, not the rate of change.' }],
        work: `(${neu} ${MINUS} ${old}) ÷ ${old} × 100 = ${fmt.pct(v)}`,
      });
    },
    realwage([w, c], r, lvl) {
      const v = w / c * 100;
      return numTask({
        r, desk: 'prices', lvl, order: 'REAL WAGE?', ask: 'In base-year dollars', fmt: fmt.usd2, table: [['Nominal wage', fmt.usd2(w)], ['CPI', c]],
        value: v, calcF: 'realwage', calcIn: { wage: w, cpi: c }, formula: F.realwage,
        wrongs: [{ v: w * c / 100, why: 'Divide by the CPI. Do not multiply.' }, { v: w * (1 - (c - 100) / 100), why: 'You cannot just subtract the percent.' }, { v: w, why: 'That is the nominal wage.' }],
        work: `${fmt.usd2(w)} ÷ ${c} × 100 = ${fmt.usd2(v)}`,
      });
    },
    convert([p, a, b], r, lvl) {
      const v = p * b / a;
      return numTask({
        r, desk: 'prices', lvl, order: "IN YEAR B DOLLARS?", fmt: fmt.usd2, table: [['Price in year A', fmt.usd2(p)], ['CPI in year A', a], ['CPI in year B', b]],
        value: v, calcF: 'convert', calcIn: { price: p, a, b }, formula: F.convert,
        wrongs: [{ v: p * a / b, why: "Flipped. Year B's CPI goes on top." }, { v: p + (b - a), why: 'Prices scale. Do not add index points.' }, { v: p, why: 'That ignores the price change.' }],
        work: `${fmt.usd2(p)} × (${b} ÷ ${a}) = ${fmt.usd2(v)}`,
      });
    },
    basket([q1, p1, q2, p2], r, lvl) {
      const v = q1 * p1 + q2 * p2;
      return numTask({
        r, desk: 'prices', lvl, order: 'COST OF THE BASKET?', fmt: fmt.usd2, text: `The basket: ${q1} slices at ${fmt.usd2(p1)} each and ${q2} movie tickets at ${fmt.usd2(p2)} each.`,
        value: v, calcF: 'basket', calcIn: { q1, p1, q2, p2 },
        wrongs: [{ v: p1 + p2, why: 'That adds one of each. Use the quantities.' }, { v: q1 * p1, why: 'That leaves out the tickets.' }, { v: (q1 + q2) * p2, why: 'Each good has its own price.' }],
        work: `${q1} × ${fmt.usd2(p1)} + ${q2} × ${fmt.usd2(p2)} = ${fmt.usd2(v)}`,
      });
    },
    realgdp([re, d], r, lvl) {
      const nom = re * d / 100;
      return numTask({
        r, desk: 'real', lvl, order: 'REAL GDP?', ask: 'In billions of dollars', fmt: fmt.bil, table: [['Nominal GDP', fmt.num(nom)], ['GDP deflator', d]],
        value: nom / d * 100, calcF: 'realgdp', calcIn: { nom, def: d }, formula: F.realgdp,
        wrongs: [{ v: nom * d / 100, why: 'Divide by the deflator. Do not multiply.' }, { v: nom - d, why: 'Do not subtract the index.' }, { v: nom, why: 'That is nominal GDP.' }],
        work: `${fmt.num(nom)} ÷ ${d} × 100 = ${fmt.num(re)}`,
      });
    },
    deflator([re, d], r, lvl) {
      const nom = re * d / 100;
      return numTask({
        r, desk: 'real', lvl, order: 'GDP DEFLATOR?', fmt: fmt.idx, table: [['Nominal GDP', '$' + fmt.num(nom) + ' billion'], ['Real GDP', '$' + fmt.num(re) + ' billion']],
        value: nom / re * 100, calcF: 'deflator', calcIn: { nom, real: re }, formula: F.deflator,
        wrongs: [{ v: re / nom * 100, why: 'Flipped. Nominal goes on top.' }, { v: nom - re, why: 'That is the gap in dollars, not an index.' }, { v: (nom - re) / re * 100, why: 'That is the percent price rise, not the index.' }],
        work: `${fmt.num(nom)} ÷ ${fmt.num(re)} × 100 = ${fmt.idx(d)}`,
      });
    },
    nominal([re, d], r, lvl) {
      const nom = re * d / 100;
      return numTask({
        r, desk: 'real', lvl, order: 'NOMINAL GDP?', ask: 'In billions of dollars', fmt: fmt.bil, table: [['Real GDP', fmt.num(re)], ['GDP deflator', d]],
        value: nom, calcF: 'nominal', calcIn: { real: re, def: d }, formula: 'Nominal GDP = real GDP × deflator ÷ 100',
        wrongs: [{ v: re / d * 100, why: 'Multiply by the deflator. Do not divide.' }, { v: re + d, why: 'Do not add the index.' }, { v: re, why: 'That is real GDP.' }],
        work: `${fmt.num(re)} × ${d} ÷ 100 = ${fmt.num(nom)}`,
      });
    },
    growth([r1, g, d], r, lvl) {
      const r2 = r1 * (1 + g / 100), n2 = r2 * d / 100;
      return numTask({
        r, desk: 'real', lvl, order: 'REAL GROWTH?', ask: 'Year 1 is the base year. Nominal GDP is in billions of dollars.',
        table: [['Nominal GDP, Year 1', fmt.num(r1)], ['Nominal GDP, Year 2', fmt.num(n2)], ['Deflator, Year 2', d]],
        value: (r2 - r1) / r1 * 100, calcF: 'growth', calcIn: { r1, r2 }, formula: F.growth,
        wrongs: [{ v: d - 100, why: 'That is how much prices rose.' }, { v: (n2 - r1) / r1 * 100, why: 'That is nominal growth: prices too.' }, { v: (r2 - r1) / r2 * 100, why: 'Divide by Year 1, not Year 2.' }, { v: -g, why: 'Check the sign.' }],
        work: `${fmt.num(n2)} ÷ ${d} × 100 = ${fmt.num(r2)}, then (${fmt.num(r2)} ${MINUS} ${fmt.num(r1)}) ÷ ${fmt.num(r1)} × 100 = ${fmt.pct(g)}`,
      });
    },
    onegood([q1, p1, q2, p2], r, lvl) {
      return numTask({
        r, desk: 'real', lvl, order: 'REAL GDP, YEAR 2?', ask: 'An economy makes only pizzas. Year 1 is the base year.', fmt: fmt.usd,
        table: [['Year 1', `${q1} pizzas at $${p1}`], ['Year 2', `${q2} pizzas at $${p2}`]],
        value: q2 * p1, calcF: 'onegood', calcIn: { q2, pBase: p1 },
        wrongs: [{ v: q2 * p2, why: "That is nominal GDP: this year's price." }, { v: q1 * p1, why: 'That is Year 1.' }, { v: q1 * p2, why: "That is Year 1's pizzas at this year's price." }],
        work: `${q2} pizzas × the base-year price of $${p1} = ${fmt.usd(q2 * p1)}`,
      });
    },
    cyclical([a, n], r, lvl, desk) {
      const v = a - n;
      return numTask({
        r, desk: desk || 'jobs', lvl, order: 'CYCLICAL UNEMPLOYMENT?', table: [['Actual rate', fmt.pct(a)], ['Natural rate', fmt.pct(n)]],
        value: v, calcF: 'cyclical', calcIn: { actual: a, natural: n }, formula: F.cyclical,
        wrongs: [{ v: a + n, why: 'Subtract the natural rate. Do not add it.' }, { v: n - a, why: 'Flipped. It is actual minus natural.' }, { v: a, why: 'That is all unemployment, not just cyclical.' }, { v: n, why: 'That is the natural rate.' }],
        work: `${fmt.pct(a)} ${MINUS} ${fmt.pct(n)} = ${fmt.pct(v)}`,
      });
    },
    natural([fr, s, c], r, lvl) {
      const v = fr + s;
      return numTask({
        r, desk: 'jobs', lvl, order: 'NATURAL RATE?', table: [['Frictional', fmt.pct(fr)], ['Structural', fmt.pct(s)], ['Cyclical', fmt.pct(c)]],
        value: v, calcF: 'natural', calcIn: { f: fr, s }, formula: F.natural,
        wrongs: [{ v: fr + s + c, why: 'That is the actual rate. Leave out cyclical.' }, { v: s + c, why: 'Frictional belongs in. Cyclical does not.' }, { v: fr + c, why: 'Structural belongs in. Cyclical does not.' }],
        work: `${fmt.pct(fr)} + ${fmt.pct(s)} = ${fmt.pct(v)}`,
      });
    },
    gap([p, a], r, lvl) {
      const v = (a - p) / p * 100;
      return numTask({
        r, desk: 'cycle', lvl, order: 'OUTPUT GAP?', ask: 'As a percent of potential', table: [['Actual real GDP', '$' + fmt.num(a) + ' billion'], ['Potential real GDP', '$' + fmt.num(p) + ' billion']],
        value: v, calcF: 'gappct', calcIn: { actual: a, potential: p }, formula: F.gap,
        wrongs: [{ v: -v, why: 'Check the sign. It is actual minus potential.' }, { v: (a - p) / a * 100, why: 'Divide by potential, not actual.' }, { v: a / p * 100, why: 'That is actual as a share of potential.' }],
        work: `(${fmt.num(a)} ${MINUS} ${fmt.num(p)}) ÷ ${fmt.num(p)} × 100 = ${fmt.pct(v)}`,
      });
    },
    realrate([i, pi], r, lvl) {
      const v = i - pi;
      return numTask({
        r, desk: 'costs', lvl, order: 'REAL INTEREST RATE?', ask: 'A bank made this loan.', table: [['Nominal rate', fmt.pct(i)], ['Inflation turned out', fmt.pct(pi)]],
        value: v, calcF: 'realrate', calcIn: { i, pi }, formula: F.realrate,
        wrongs: [{ v: i + pi, why: 'Subtract inflation. Do not add it.' }, { v: pi - i, why: 'Flipped. It is nominal minus inflation.' }, { v: i, why: 'That is the nominal rate.' }],
        work: `${fmt.pct(i)} ${MINUS} ${pi < 0 ? '(' + fmt.pct(pi) + ')' : fmt.pct(pi)} = ${fmt.pct(v)}`,
      });
    },
    wagechange([pay, prices], r, lvl) {
      const v = pay - prices;
      return numTask({
        r, desk: 'prices', lvl, order: 'REAL WAGE CHANGE?', ask: 'About how much?', table: [['Your pay rose', fmt.pct(pay)], ['Prices rose', fmt.pct(prices)]],
        value: v, calcF: 'wagechange', calcIn: { pay, prices },
        wrongs: [{ v: pay + prices, why: 'Subtract price growth. Do not add it.' }, { v: prices - pay, why: 'Flipped. It is pay growth minus price growth.' }, { v: pay, why: 'That is the nominal raise.' }],
        work: `${fmt.pct(pay)} ${MINUS} ${fmt.pct(prices)} = about ${fmt.pct(v)}`,
      });
    },
    surplus(o, r, lvl) {
      if (o.f === 'cs') {
        return numTask({
          r, desk: 'micro', lvl, order: 'CONSUMER SURPLUS?', fmt: fmt.usd, text: `You would pay up to $${o.wtp}. The price is $${o.price}.`,
          value: o.wtp - o.price, calcF: 'cs', calcIn: { wtp: o.wtp, price: o.price },
          wrongs: [{ v: o.price, why: 'That is the price.' }, { v: o.wtp, why: 'That is the most you would pay.' }, { v: o.wtp + o.price, why: 'Subtract the price. Do not add it.' }],
          work: `$${o.wtp} ${MINUS} $${o.price} = $${o.wtp - o.price}`,
        });
      }
      return numTask({
        r, desk: 'micro', lvl, order: 'PRODUCER SURPLUS?', fmt: fmt.usd, text: `A seller would take as little as $${o.min}. The price is $${o.price}.`,
        value: o.price - o.min, calcF: 'ps', calcIn: { price: o.price, min: o.min },
        wrongs: [{ v: o.min, why: 'That is the lowest the seller would take.' }, { v: o.price, why: 'That is the price.' }, { v: o.price + o.min, why: 'Subtract. Do not add.' }],
        work: `$${o.price} ${MINUS} $${o.min} = $${o.price - o.min}`,
      });
    },
  };

  /* ================= build-the-fraction tasks ================= */
  function buildTask(o) {
    const tiles = shuffle(o.r, o.tiles.map((x, i) => Object.assign({ correct: i < 2, ord: i }, x)));
    return finish({
      id: o.id, desk: o.desk, verb: 'build', lvl: o.lvl, order: o.order, formula: o.formula, tiles,
      build: { name: o.name, scale: o.scale, tail: o.scale === 100 ? ' × 100' : '' },
      answer: [tiles.findIndex((x) => x.ord === 0), tiles.findIndex((x) => x.ord === 1)],
      why: o.why, work: o.work,
      calc: { f: o.calcF, in: o.calcIn, value: o.value },
    });
  }
  const BUILD = {
    urate([lf, u, n], r, lvl) {
      const e = lf - u;
      return buildTask({
        r, desk: 'jobs', lvl, order: 'BUILD THE RATE', name: 'Unemployment rate', scale: 100, formula: F.urate,
        tiles: [{ label: `Unemployed ${fmt.num(u)}`, v: u }, { label: `Labor force ${fmt.num(lf)}`, v: lf }, { label: `Employed ${fmt.num(e)}`, v: e }, { label: `All adults ${fmt.num(lf + n)}`, v: lf + n }],
        why: 'Unemployed over the labor force, not over all adults.', work: `${fmt.num(u)} ÷ ${fmt.num(lf)} × 100 = ${fmt.pct(u / lf * 100)}`,
        calcF: 'urate', calcIn: { u, lf }, value: u / lf * 100,
      });
    },
    lfpr([lf, u, n], r, lvl) {
      const e = lf - u;
      return buildTask({
        r, desk: 'jobs', lvl, order: 'BUILD THE LFPR', ask: 'Labor force participation rate', name: 'LFPR', scale: 100, formula: F.lfpr,
        tiles: [{ label: `Labor force ${fmt.num(lf)}`, v: lf }, { label: `All adults ${fmt.num(lf + n)}`, v: lf + n }, { label: `Employed ${fmt.num(e)}`, v: e }, { label: `Unemployed ${fmt.num(u)}`, v: u }],
        why: 'The labor force over all adults.', work: `${fmt.num(lf)} ÷ ${fmt.num(lf + n)} × 100 = ${fmt.pct(lf / (lf + n) * 100)}`,
        calcF: 'lfpr', calcIn: { lf, adults: lf + n }, value: lf / (lf + n) * 100,
      });
    },
    cpi([base, now], r, lvl) {
      return buildTask({
        r, desk: 'prices', lvl, order: 'BUILD THE INDEX', name: 'Price index', scale: 100, formula: F.cpi,
        tiles: [{ label: `Basket now ${fmt.usd2(now)}`, v: now }, { label: `Basket in base year ${fmt.usd2(base)}`, v: base }, { label: `Change in cost ${fmt.usd2(now - base)}`, v: now - base }, { label: `Slices in basket 4`, v: 4 }],
        why: 'Cost now over cost in the base year.', work: `${fmt.usd2(now)} ÷ ${fmt.usd2(base)} × 100 = ${fmt.idx(now / base * 100)}`,
        calcF: 'cpi', calcIn: { now, base }, value: now / base * 100,
      });
    },
    infl([old, neu], r, lvl) {
      return buildTask({
        r, desk: 'prices', lvl, order: 'BUILD THE RATE', name: 'Inflation rate', scale: 100, formula: F.infl,
        tiles: [{ label: `Change in the CPI ${Math.round((neu - old) * 100) / 100}`, v: neu - old }, { label: `Old CPI ${old}`, v: old }, { label: `New CPI ${neu}`, v: neu }, { label: `Base year CPI 100`, v: 100 }],
        why: 'The change over the old CPI.', work: `(${neu} ${MINUS} ${old}) ÷ ${old} × 100 = ${fmt.pct((neu - old) / old * 100)}`,
        calcF: 'infl', calcIn: { old, neu }, value: (neu - old) / old * 100,
      });
    },
    realgdp([re, d], r, lvl) {
      const nom = re * d / 100;
      return buildTask({
        r, desk: 'real', lvl, order: 'BUILD REAL GDP', name: 'Real GDP', scale: 100, formula: F.realgdp,
        tiles: [{ label: `Nominal GDP ${fmt.num(nom)}`, v: nom }, { label: `Deflator ${d}`, v: d }, { label: `Potential real GDP ${fmt.num(re + 50)}`, v: re + 50 }, { label: `Population ${fmt.num(20)} million`, v: 20 }],
        why: 'Take prices out: nominal over the deflator, times 100.', work: `${fmt.num(nom)} ÷ ${d} × 100 = ${fmt.num(re)}`,
        calcF: 'realgdp', calcIn: { nom, def: d }, value: re,
      });
    },
    deflator([re, d], r, lvl) {
      const nom = re * d / 100;
      return buildTask({
        r, desk: 'real', lvl, order: 'BUILD THE DEFLATOR', name: 'GDP deflator', scale: 100, formula: F.deflator,
        tiles: [{ label: `Nominal GDP ${fmt.num(nom)}`, v: nom }, { label: `Real GDP ${fmt.num(re)}`, v: re }, { label: `Potential real GDP ${fmt.num(re + 50)}`, v: re + 50 }, { label: `Population ${fmt.num(20)} million`, v: 20 }],
        why: 'Nominal over real, times 100.', work: `${fmt.num(nom)} ÷ ${fmt.num(re)} × 100 = ${fmt.idx(d)}`,
        calcF: 'deflator', calcIn: { nom, real: re }, value: d,
      });
    },
    realwage([w, c], r, lvl) {
      return buildTask({
        r, desk: 'prices', lvl, order: 'BUILD THE REAL WAGE', name: 'Real wage', scale: 100, formula: F.realwage,
        tiles: [{ label: `Nominal wage ${fmt.usd2(w)}`, v: w }, { label: `CPI ${c}`, v: c }, { label: `Inflation rate 4%`, v: 4 }, { label: `Hours worked 40`, v: 40 }],
        why: 'Nominal wage over the CPI, times 100.', work: `${fmt.usd2(w)} ÷ ${c} × 100 = ${fmt.usd2(w / c * 100)}`,
        calcF: 'realwage', calcIn: { wage: w, cpi: c }, value: w / c * 100,
      });
    },
    percap([g, p], r, lvl) {
      const v = g * 1e9 / (p * 1e6);
      return buildTask({
        r, desk: 'miss', lvl, order: 'BUILD GDP PER CAPITA', name: 'GDP per capita', scale: 1, formula: F.percap,
        tiles: [{ label: `GDP $${fmt.num(g)} billion`, v: g * 1e9 }, { label: `Population ${fmt.num(p)} million`, v: p * 1e6 }, { label: `Labor force ${fmt.num(p * 0.5)} million`, v: p * 0.5e6 }, { label: `Real GDP growth 2%`, v: 2 }],
        why: 'GDP over the whole population, not just workers.', work: `$${fmt.num(g)} billion ÷ ${fmt.num(p)} million = ${fmt.usd(v)}`,
        calcF: 'percap', calcIn: { gdpB: g, popM: p }, value: v,
      });
    },
  };

  /* ================= the business cycle wave =================
     actual(x) = potential(x) + a sine. x runs 0 to 1 across the chart. Markers carry computed facts. */
  const wave = {
    potential: (x) => 0.32 + 0.3 * x,
    actual: (x, phi) => wave.potential(x) + 0.17 * Math.sin(2 * Math.PI * (x * 1.6 + phi)),
    points(phi) {
      const h = 0.0005, slope = (x) => (wave.actual(x + h, phi) - wave.actual(x - h, phi)) / (2 * h);
      const gap = (x) => wave.actual(x, phi) - wave.potential(x);
      const out = [];
      const add = (x, phase, gapWord) => out.push({ x, phase, gap: gapWord });
      const steps = 2000;
      for (let i = 1; i < steps; i++) {
        const a = 0.04 + (i - 1) / steps * 0.92, b = 0.04 + i / steps * 0.92;
        if (slope(a) > 0 && slope(b) <= 0) add((a + b) / 2, 'peak', gap((a + b) / 2) > 0 ? 'positive' : 'negative');
        if (slope(a) < 0 && slope(b) >= 0) add((a + b) / 2, 'trough', gap((a + b) / 2) > 0 ? 'positive' : 'negative');
        if (gap(a) > 0 && gap(b) <= 0) add((a + b) / 2, slope(b) > 0 ? 'expansion' : 'contraction', 'zero');
        if (gap(a) < 0 && gap(b) >= 0) add((a + b) / 2, slope(b) > 0 ? 'expansion' : 'contraction', 'zero');
      }
      out.sort((p, q) => p.x - q.x);
      // Add the point halfway between each neighbouring pair: these are the plain rising or falling points.
      const mids = [];
      for (let i = 0; i < out.length - 1; i++) {
        const x = (out[i].x + out[i + 1].x) / 2;
        const g = gap(x);
        mids.push({ x, phase: slope(x) > 0 ? 'expansion' : 'contraction', gap: g > 0 ? 'positive' : 'negative' });
      }
      return out.concat(mids).sort((p, q) => p.x - q.x);
    },
  };
  const PHIS = [0.02, 0.16, 0.31, 0.44, 0.58];

  /* Each question names a property; its markers are chosen so exactly one fits. */
  const CHART_ASKS = [
    { prop: 'peak', order: 'TAP THE PEAK', lvl: 1, y: 'The peak is the top of the wave. The next move is down.', fit: (p) => p.phase === 'peak' },
    { prop: 'trough', order: 'TAP THE TROUGH', lvl: 1, y: 'The trough is the bottom of the wave. The next move is up.', fit: (p) => p.phase === 'trough' },
    { prop: 'contraction', order: 'TAP A CONTRACTION', lvl: 1, y: 'Real GDP is falling here.', fit: (p) => p.phase === 'contraction' },
    { prop: 'expansion', order: 'TAP AN EXPANSION', lvl: 1, y: 'Real GDP is rising here.', fit: (p) => p.phase === 'expansion' },
    { prop: 'positive', order: 'TAP A POSITIVE GAP', lvl: 2, y: 'Actual real GDP is above potential.', fit: (p) => p.gap === 'positive' },
    { prop: 'negative', order: 'TAP A NEGATIVE GAP', lvl: 2, y: 'Actual real GDP is below potential.', fit: (p) => p.gap === 'negative' },
    { prop: 'zero', order: 'TAP A ZERO GAP', lvl: 2, y: 'Actual real GDP equals potential where the wave crosses the line.', fit: (p) => p.gap === 'zero' },
    { prop: 'above-natural', order: 'U ABOVE THE NATURAL RATE?', ask: 'Tap the point where unemployment is above the natural rate.', lvl: 2, y: 'Below potential, unemployment is above the natural rate.', fit: (p) => p.gap === 'negative' },
    { prop: 'below-natural', order: 'U BELOW THE NATURAL RATE?', ask: 'Tap the point where unemployment is below the natural rate.', lvl: 2, y: 'Above potential, unemployment is below the natural rate.', fit: (p) => p.gap === 'positive' },
    { prop: 'equal-natural', order: 'U AT THE NATURAL RATE?', ask: 'Tap the point where unemployment equals the natural rate.', lvl: 3, y: 'At potential, unemployment equals the natural rate.', fit: (p) => p.gap === 'zero' },
    { prop: 'falling-below', order: 'FALLING AND BELOW?', ask: 'Tap the point falling and below potential.', lvl: 3, y: 'A contraction with a negative gap.', fit: (p) => p.phase === 'contraction' && p.gap === 'negative' },
    { prop: 'rising-below', order: 'RISING AND BELOW?', ask: 'Tap the point rising but still below potential.', lvl: 3, y: 'An expansion with a negative gap: rising, but still below potential.', fit: (p) => p.phase === 'expansion' && p.gap === 'negative' },
    { prop: 'rising-above', order: 'RISING AND ABOVE?', ask: 'Tap the point rising and above potential.', lvl: 3, y: 'An expansion with a positive gap.', fit: (p) => p.phase === 'expansion' && p.gap === 'positive' },
    { prop: 'falling-above', order: 'FALLING BUT ABOVE?', ask: 'Tap the point falling but still above potential.', lvl: 3, y: 'A contraction that has not yet crossed potential.', fit: (p) => p.phase === 'contraction' && p.gap === 'positive' },
  ];

  function chartMarkers(phi, ask, r) {
    const pts = wave.points(phi);
    const yes = shuffle(r, pts.filter(ask.fit));
    const no = shuffle(r, pts.filter((p) => !ask.fit(p)));
    if (!yes.length || no.length < 3) return null;
    const hit = yes[0];
    const chosen = [hit];
    for (const p of no) {
      if (chosen.length === 4) break;
      if (chosen.every((c) => Math.abs(c.x - p.x) > 0.11)) chosen.push(p);
    }
    if (chosen.length < 4) return null;
    chosen.sort((a, b) => a.x - b.x);
    return { markers: chosen, answer: chosen.indexOf(hit) };
  }
  const CHART_MEANING = (p) => {
    const name = BIN[p.phase].label;
    const gapWord = p.gap === 'zero' ? 'Zero gap' : p.gap === 'positive' ? 'Positive gap' : 'Negative gap';
    return `${name}. ${gapWord}.`;
  };
  function chartTapTask(ask, phi, r, id) {
    const m = chartMarkers(phi, ask, r);
    if (!m) return null;
    return finish({
      id, desk: 'cycle', verb: 'chart', lvl: ask.lvl, order: ask.order, ask: ask.ask,
      chart: { kind: 'cycle', phi, markers: m.markers, pickOne: true, prop: ask.prop },
      options: m.markers.map((p, i) => ({ label: 'Point ' + (i + 1), meaning: CHART_MEANING(p) })), answer: m.answer, why: ask.y,
    });
  }
  /* The other way around: one point is lit. Say what it is. */
  const CHART_READS = [
    { id: 'phase', order: 'WHAT IS THIS POINT?', lvl: 1, options: () => bins('expansion', 'peak', 'contraction', 'trough'), expect: (f) => BIN[f.phase].label, y: (p) => (p.phase === 'peak' ? 'The top of the wave.' : p.phase === 'trough' ? 'The bottom of the wave.' : p.phase === 'expansion' ? 'Real GDP is rising here.' : 'Real GDP is falling here.') },
    { id: 'gap', order: 'WHAT IS THE GAP?', lvl: 2, options: () => plain('Positive', 'Negative', 'Zero'), expect: (f) => (f.gap === 'positive' ? 'Positive' : f.gap === 'negative' ? 'Negative' : 'Zero'), y: (p) => (p.gap === 'zero' ? 'The wave is on the potential line.' : p.gap === 'positive' ? 'The wave is above the potential line.' : 'The wave is below the potential line.') },
    { id: 'unemp', order: 'U v. THE NATURAL RATE?', ask: 'Unemployment here, compared with the natural rate:', lvl: 2, options: () => plain('Above', 'Below', 'Equal'), expect: (f) => (f.gap === 'positive' ? 'Below' : f.gap === 'negative' ? 'Above' : 'Equal'), y: (p) => (p.gap === 'zero' ? 'At potential, unemployment equals the natural rate.' : p.gap === 'positive' ? 'Output above potential: unemployment is below the natural rate.' : 'Output below potential: unemployment is above the natural rate.') },
  ];
  function chartReadTask(read, phi, idx, id) {
    const pts = wave.points(phi);
    const p = pts[idx % pts.length];
    const options = read.options();
    const label = read.expect(p).toLowerCase();
    const answer = options.findIndex((o) => o.label.toLowerCase() === label);
    return finish({
      id, desk: 'cycle', verb: 'chart', lvl: read.lvl, order: read.order, ask: read.ask,
      chart: { kind: 'cycle', phi, markers: [p], pickOne: false, focus: 0, expect: read.expect },
      options, answer, why: read.y(p),
    });
  }
  /* Real and nominal lines cross at the base year. */
  const BASECHARTS = [
    { k: 'y2', base: 1, years: [2021, 2022, 2023, 2024, 2025] },
    { k: 'y3', base: 2, years: [2021, 2022, 2023, 2024, 2025] },
    { k: 'y4', base: 3, years: [2021, 2022, 2023, 2024, 2025] },
    { k: 'yb', base: 1, years: [2018, 2019, 2020, 2021, 2022] },
    { k: 'yc', base: 2, years: [2016, 2017, 2018, 2019, 2020] },
  ];

  /* The second batch of hand-written records joins these lists before the kinds below are built from them. */
  const LISTS = { GDP, FLOW, LOOP, INCOME, MISS, PEOPLE, TYPES, NATURAL, MOVES, NAMEIT, BIAS, EFFECTS, COSTS, REALNOM, PHASES, MEMOS, MICRO_MKT, MICRO_TAX, MICRO_ELASTIC };
  Object.keys(LISTS).forEach((name) => { if (MORE && MORE[name]) LISTS[name].push(...MORE[name]); });

  /* ================= kinds ================= */
  const K = [];
  function kind(id, desk, verb, records, build, extra) {
    K.push(Object.assign({ id, desk, verb, records, build }, extra || {}));
  }
  const recLvl = (r, d) => (r && r.lvl) || d;

  const COUNTED_OPTS = () => [{ key: 'in', label: 'Counted', stampClass: 'go' }, { key: 'out', label: 'Not counted', stampClass: 'no' }];
  kind('counted', 'gdp', 'stamp', GDP, (g) => stampTask({ desk: 'gdp', lvl: g.lvl, order: 'COUNT IT?', ask: "In this year's U.S. GDP?", text: g.t, options: COUNTED_OPTS(), key: g.line ? 'in' : 'out', why: g.y }));
  kind('line', 'gdp', 'sort', GDP.filter((g) => g.line), (g) => sortTask({ desk: 'gdp', lvl: Math.max(g.lvl, 1), order: 'WHICH LINE?', ask: 'Which part of GDP?', text: g.t, options: bins('C', 'I', 'G', 'Xn'), keep: true, key: g.line, why: g.y }));
  kind('whynot', 'gdp', 'sort', GDP.filter((g) => g.no), (g) => sortTask({ desk: 'gdp', lvl: Math.max(g.lvl, 2), order: 'WHY NOT COUNTED?', text: g.t, options: bins('used', 'intermediate', 'financial', 'transfer', 'abroad'), key: g.no, why: g.y }));
  kind('flow', 'gdp', 'flow', FLOW, (f) => finish({ desk: 'gdp', verb: 'flow', lvl: f.lvl, order: 'WHICH ARROW?', text: f.t, options: ARROWS.map((l, i) => ({ label: l, arrow: i })), answer: f.a, why: f.y }));
  kind('loop', 'gdp', 'stamp', LOOP, (l) => stampTask({ desk: 'gdp', lvl: l.lvl, order: 'OUT OR IN?', ask: 'Does this money leave the circular flow or come into it?', text: l.t, options: [{ key: 'out', label: 'Out of the loop', stampClass: 'no' }, { key: 'in', label: 'Into the loop', stampClass: 'go' }], key: l.dir, why: l.y }));
  kind('income', 'gdp', 'sort', INCOME, (x) => sortTask({ desk: 'gdp', lvl: x.lvl, order: 'WHICH INCOME?', text: x.t, options: bins('wages', 'rent', 'interest', 'profit'), key: x.key, why: x.y }));
  kind('approach', 'gdp', 'sort', APPROACH, (x) => sortTask({ desk: 'gdp', lvl: x.lvl || 1, order: 'WHICH APPROACH?', text: x.t, options: plain('Expenditures', 'Income', 'Value added'), key: x.key, why: x.y }));
  kind('c-gdp', 'gdp', 'pick', SETS.gdp, (s, r) => GEN.gdp(s, r, 1));
  kind('c-xn', 'gdp', 'pick', SETS.xn, (s, r) => GEN.xn(s, r, 1));
  kind('c-income', 'gdp', 'pick', SETS.income, (s, r) => GEN.income(s, r, 1));
  kind('c-final', 'gdp', 'pick', SETS.chain, (s, r) => GEN.finalprice(s, r, 2));
  kind('c-va', 'gdp', 'pick', SETS.chain, (s, r) => GEN.valueadded(s, r, 3));

  const missBins = (key, r) => {
    const others = ['nonmarket', 'underground', 'leisure', 'quality', 'environment', 'division'].filter((k) => k !== key);
    const chosen = shuffle(r, others).slice(0, 3).concat([key]);
    const order = ['nonmarket', 'underground', 'leisure', 'quality', 'environment', 'division'];
    return bins(...order.filter((k) => chosen.includes(k)));
  };
  kind('miss', 'miss', 'sort', MISS, (m, r) => sortTask({ desk: 'miss', lvl: m.lvl, order: 'WHAT DOES GDP MISS?', text: m.t, options: missBins(m.key, r), key: m.key, why: m.y }));
  kind('c-percap', 'miss', 'pick', SETS.percap, (s, r) => GEN.percap(s, r, 1));
  kind('b-percap', 'miss', 'build', SETS.percap, (s, r) => BUILD.percap(s, r, 1));
  kind('percapmove', 'miss', 'sort', PERCAP_MOVES, ([g, p]) => {
    const key = g > p ? 'Rose' : g < p ? 'Fell' : 'Stayed the same';
    return sortTask({ desk: 'miss', lvl: 2, order: 'PER PERSON?', ask: 'What happened to real GDP per person?', text: `Real GDP grew ${g}%. Population grew ${p}%.`, options: plain('Rose', 'Fell', 'Stayed the same'), key, why: g === p ? 'Output and people grew at the same pace.' : g > p ? 'Output grew faster than the number of people sharing it.' : 'More people are sharing output that grew more slowly.' });
  });

  kind('who', 'jobs', 'sort', PEOPLE, (p) => sortTask({ desk: 'jobs', lvl: p.lvl, order: 'WHO IS THIS?', text: p.t, options: bins('E', 'U', 'N'), keep: true, key: p.st, why: p.y }));
  kind('type', 'jobs', 'sort', TYPES, (t) => sortTask({ desk: 'jobs', lvl: t.lvl, order: 'WHICH TYPE?', text: t.t, options: bins('F', 'S', 'Cy'), key: t.key, why: t.y }));
  kind('natural', 'jobs', 'sort', NATURAL, (n) => sortTask({ desk: 'jobs', lvl: n.lvl, order: 'THE NATURAL RATE?', ask: 'What happens to the natural rate?', text: n.t, options: plain('Up', 'Down', 'No change'), key: n.key, why: n.y }));
  const townRecords = [];
  MOVES.forEach((m) => { townRecords.push(m); });
  kind('town', 'jobs', 'town', townRecords, (m, r) => {
    const town = pickOne(r, TOWNS);
    const c = Object.assign({}, town);
    const rate0 = c.u / (c.e + c.u) * 100, part0 = (c.e + c.u) / 100;
    const after = Object.assign({}, c);
    if (m.from !== m.to) { after[m.from]--; after[m.to]++; }
    const rate1 = after.u / (after.e + after.u) * 100, part1 = (after.e + after.u) / 100;
    const word = (a, b) => (Math.abs(a - b) < 1e-9 ? 'same' : b > a ? 'up' : 'down');
    const right = { rate: word(rate0, rate1), lfpr: word(part0, part1) };
    const key = (d) => d.rate + d.lfpr;
    const others = shuffle(r, DIRS.filter((d) => key(d) !== key(right))).slice(0, 3);
    const options = shuffle(r, [right].concat(others)).map((d) => ({ label: dirLabel(d), dir: d }));
    return finish({
      desk: 'jobs', verb: 'town', lvl: m.lvl, order: 'WHAT MOVES?', text: m.t, town: Object.assign({ from: m.from, to: m.to }, c),
      after, rates: { rate0, rate1, part0: part0 * 100, part1: part1 * 100 }, options, answer: options.findIndex((o) => key(o.dir) === key(right)), why: m.y,
      work: `Unemployment rate ${fmt.pct(rate0)} to ${fmt.pct(rate1)}. LFPR ${fmt.pct(part0 * 100)} to ${fmt.pct(part1 * 100)}.`,
    });
  });
  kind('c-urate', 'jobs', 'pick', SETS.urate, (s, r) => GEN.urate(s, r, 1));
  kind('c-lfpr', 'jobs', 'pick', SETS.urate, (s, r) => GEN.lfpr(s, r, 2));
  kind('c-lf', 'jobs', 'pick', SETS.urate.slice(0, 6), (s, r) => GEN.lf(s, r, 1));
  kind('c-cyc', 'jobs', 'pick', SETS.cyclical, (s, r) => GEN.cyclical(s, r, 2));
  kind('c-nat', 'jobs', 'pick', SETS.natural, (s, r) => GEN.natural(s, r, 2));
  kind('b-urate', 'jobs', 'build', SETS.urate.slice(0, 8), (s, r) => BUILD.urate(s, r, 1));
  kind('b-lfpr', 'jobs', 'build', SETS.urate.slice(0, 8), (s, r) => BUILD.lfpr(s, r, 2));

  kind('nameit', 'prices', 'sort', NAMEIT, (n) => sortTask({ desk: 'prices', lvl: n.lvl, order: 'NAME IT', text: n.t, options: bins('rising', 'dis', 'de'), key: n.key, why: n.y }));
  kind('bias', 'prices', 'sort', BIAS, (b) => sortTask({ desk: 'prices', lvl: b.lvl, order: 'WHICH CPI BIAS?', text: b.t, options: bins('substitution', 'newgoods', 'betterq'), key: b.key, why: b.y }));
  kind('c-cpi', 'prices', 'pick', SETS.cpi, (s, r) => GEN.cpi(s, r, 1));
  kind('c-infl', 'prices', 'pick', SETS.infl, (s, r) => GEN.infl(s, r, 1));
  kind('c-wage', 'prices', 'pick', SETS.wage, (s, r) => GEN.realwage(s, r, 2));
  kind('c-convert', 'prices', 'pick', SETS.convert, (s, r) => GEN.convert(s, r, 3));
  kind('c-basket', 'prices', 'pick', SETS.basket, (s, r) => GEN.basket(s, r, 1));
  kind('c-wagechange', 'prices', 'pick', SETS.wagechange, (s, r) => GEN.wagechange(s, r, 2));
  kind('b-cpi', 'prices', 'build', SETS.cpi, (s, r) => BUILD.cpi(s, r, 1));
  kind('b-infl', 'prices', 'build', SETS.infl, (s, r) => BUILD.infl(s, r, 2));
  kind('b-wage', 'prices', 'build', SETS.wage, (s, r) => BUILD.realwage(s, r, 2));

  kind('effect', 'costs', 'sort', EFFECTS, (e) => sortTask({ desk: 'costs', lvl: e.lvl, order: 'GAIN OR LOSE?', ask: 'Inflation turns out higher than everyone expected.', text: e.t, options: bins('gains', 'loses', 'protected'), key: e.key, why: e.y }));
  kind('deflation', 'costs', 'stamp', DEFLATION, (e) => stampTask({ desk: 'costs', lvl: e.lvl, order: 'SURPRISE DEFLATION', ask: 'Prices fall when nobody expected it.', text: e.t, options: bins('gains', 'loses').map((b) => Object.assign(b, { stampClass: b.key === 'gains' ? 'go' : 'no' })), key: e.key, why: e.y }));
  kind('loan', 'costs', 'sort', LOANS, ([i, exp, act]) => {
    const key = act > exp ? 'Borrower' : act < exp ? 'Lender' : 'Neither';
    return sortTask({
      desk: 'costs', lvl: 2, order: 'WHO GAINS?', text: `A bank lends at a fixed ${i}%. Both sides expect ${exp}% inflation. It turns out to be ${act}%.`, options: plain('Borrower', 'Lender', 'Neither'), key,
      why: key === 'Neither' ? `The real rate came out as planned: ${i - exp}%. Expected inflation moves little wealth.` : key === 'Borrower' ? `Real rate: ${fmt.pct(i - act)}, below the ${fmt.pct(i - exp)} planned. The borrower gains.` : `Real rate: ${fmt.pct(i - act)}, above the ${fmt.pct(i - exp)} planned. The lender gains.`,
    });
  });
  kind('menu', 'costs', 'stamp', COSTS, (c) => stampTask({ desk: 'costs', lvl: c.lvl, order: 'WHICH COST?', text: c.t, options: bins('menu', 'shoe').map((b) => Object.assign(b, { stampClass: 'neutral' })), key: c.key, why: c.y }));
  kind('c-realrate', 'costs', 'pick', SETS.realrate, (s, r) => GEN.realrate(s, r, 2));

  kind('realnom', 'real', 'stamp', REALNOM, (x) => stampTask({ desk: 'real', lvl: x.lvl, order: 'REAL OR NOMINAL?', text: x.t, options: plain('Real', 'Nominal').map((b) => Object.assign(b, { stampClass: 'neutral' })), key: x.key, why: x.y }));
  kind('both', 'real', 'sort', BOTHMOVES, ([q, p]) => {
    const nom = q + p;
    const key = q === 0 ? MOVE_BINS[0] : q > 0 ? MOVE_BINS[1] : nom > 0 ? MOVE_BINS[2] : MOVE_BINS[3];
    const qT = q === 0 ? 'Output does not change.' : q > 0 ? `Output rises ${q}%.` : `Output falls ${-q}%.`;
    const pT = p === 0 ? 'Prices do not change.' : `Prices rise ${p}%.`;
    return sortTask({
      desk: 'real', lvl: q < 0 && nom > 0 ? 3 : 1, order: 'WHAT MOVES?', ask: 'Which measure of GDP moves?', text: `${qT} ${pT}`, options: plain(...MOVE_BINS), key,
      why: q === 0 ? 'Only prices changed, so only nominal GDP moves.' : q > 0 ? (p > 0 ? 'More output raises both. Rising prices add to nominal only.' : 'More output raises both.') : nom > 0 ? 'Output fell, so real GDP fell. Prices rose enough to lift nominal.' : p > 0 ? 'Output fell by more than prices rose. Both fall.' : 'Output fell and prices did not rise. Both fall.',
    });
  });
  kind('c-real', 'real', 'pick', SETS.real, (s, r) => GEN.realgdp(s, r, 1));
  kind('c-def', 'real', 'pick', SETS.real, (s, r) => GEN.deflator(s, r, 1));
  kind('c-nom', 'real', 'pick', SETS.real.slice(0, 5), (s, r) => GEN.nominal(s, r, 2));
  kind('c-growth', 'real', 'pick', SETS.growth, (s, r) => GEN.growth(s, r, 3));
  kind('c-onegood', 'real', 'pick', SETS.onegood, (s, r) => GEN.onegood(s, r, 2));
  kind('b-real', 'real', 'build', SETS.real, (s, r) => BUILD.realgdp(s, r, 1));
  kind('b-def', 'real', 'build', SETS.real, (s, r) => BUILD.deflator(s, r, 2));
  kind('basechart', 'real', 'chart', BASECHARTS, (c) => finish({
    desk: 'real', verb: 'chart', lvl: 2, order: 'TAP THE BASE YEAR', ask: 'Nominal GDP and real GDP are on this chart.',
    chart: { kind: 'base', base: c.base, years: c.years }, options: c.years.map((y) => ({ label: String(y) })), answer: c.base,
    why: 'In the base year, nominal GDP equals real GDP, so the lines cross.',
  }));
  kind('whichline', 'real', 'chart', BASECHARTS.slice(0, 3), (c) => finish({
    desk: 'real', verb: 'chart', lvl: 3, order: 'WHICH LINE IS NOMINAL?', ask: 'Prices rise every year on this chart.',
    chart: { kind: 'base', base: c.base, years: c.years, hideNames: true, pickLine: true, swap: c.k === 'y3' }, options: [{ label: 'Line A' }, { label: 'Line B' }], answer: c.k === 'y3' ? 1 : 0,
    why: 'After the base year, higher prices lift nominal GDP above real GDP.',
  }));

  const cycleTaps = [];
  CHART_ASKS.forEach((a) => PHIS.forEach((phi, j) => cycleTaps.push({ k: a.prop + '-' + j, a, phi })));
  kind('cycletap', 'cycle', 'chart', cycleTaps, (x, r) => chartTapTask(x.a, x.phi, r, 'x'));
  const cycleReads = [];
  CHART_READS.forEach((read) => PHIS.forEach((phi, j) => { for (let i = 0; i < 7; i += 2) cycleReads.push({ k: `${read.id}-${j}-${i}`, read, phi, idx: i + j }); }));
  kind('cycleread', 'cycle', 'chart', cycleReads, (x) => chartReadTask(x.read, x.phi, x.idx, 'x'));
  kind('phase', 'cycle', 'sort', PHASES, (p) => sortTask({ desk: 'cycle', lvl: p.lvl, order: 'WHERE ARE WE?', text: p.t, options: bins('expansion', 'peak', 'contraction', 'trough'), keep: true, key: p.key, why: p.y }));
  kind('sign', 'cycle', 'sort', SIGNS, ([u, n]) => {
    const key = u > n ? 'Below potential' : u < n ? 'Above potential' : 'At potential';
    return sortTask({
      desk: 'cycle', lvl: 2, order: 'READ THE SIGNS', ask: 'Where is real GDP?', text: `Unemployment is ${fmt.pct(u)}. The natural rate is ${fmt.pct(n)}.`, options: plain('Above potential', 'Below potential', 'At potential'), key,
      why: u > n ? 'Unemployment above the natural rate means a negative gap.' : u < n ? 'Unemployment below the natural rate means a positive gap.' : 'At the natural rate, output equals potential.',
    });
  });
  kind('c-cyc2', 'cycle', 'pick', SETS.cyclical.slice(0, 5), (s, r) => GEN.cyclical(s, r, 2, 'cycle'));
  kind('c-gap', 'cycle', 'pick', SETS.gap, (s, r) => GEN.gap(s, r, 2));

  kind('memo', 'memo', 'memo', MEMOS, (m, r) => {
    const place = shuffle(r, m.l.map((_, i) => i));
    const lines = place.map((i) => m.l[i]);
    return finish({ desk: m.d, verb: 'memo', lvl: m.lvl, order: 'CATCH THE MISTAKE', ask: 'A rookie wrote this memo. Tap the wrong line.', lines, answer: place.indexOf(m.bad), options: lines.map((l) => ({ label: l })), why: m.y });
  });

  kind('mkt', 'micro', 'sort', MICRO_MKT, (x) => sortTask({ desk: 'micro', lvl: x.lvl, order: 'FLASHBACK: WHAT HAPPENS?', text: x.t, options: plain('Shortage', 'Surplus', 'No effect'), key: x.key, why: x.y }));
  kind('taxburden', 'micro', 'stamp', MICRO_TAX, (x) => stampTask({ desk: 'micro', lvl: x.lvl, order: 'FLASHBACK: WHO PAYS MORE?', ask: 'Who pays most of the tax?', text: x.t, options: plain('Buyers', 'Sellers').map((b) => Object.assign(b, { stampClass: 'neutral' })), key: x.key, why: x.y }));
  kind('elastic', 'micro', 'stamp', MICRO_ELASTIC, (x) => stampTask({ desk: 'micro', lvl: x.lvl, order: 'FLASHBACK: ELASTIC?', ask: 'Is demand elastic or inelastic?', text: x.t, options: plain('Elastic', 'Inelastic').map((b) => Object.assign(b, { stampClass: 'neutral' })), key: x.key, why: x.y }));
  kind('c-surplus', 'micro', 'pick', SURPLUS, (s, r) => GEN.surplus(s, r, 1));

  /* ================= test-style tables (added Nov 16, 2026) =================
     The other math tables in this game are clean. AP tables are not: they mix in taxes, depreciation, transfers,
     income items, or the whole population, and the student has to pick the right rows. These kinds drill that,
     plus the words "recessionary gap" and "inflationary gap", plus inventories of goods made abroad, plus (Nov 17)
     the CPI worked out from a whole basket table.
     New numbers only. Never copy the teacher's test. Every kind here has drill: true, so Practice a topic can deal
     them as their own topic (DRILL), and the Solo deal leans on them a little. */
  const DRILL = { key: 'drill', code: 'Test tables', long: 'Messy tables and gaps' };
  /* AP style: a practice topic that deals only the five-choice questions, from every desk (asked for Nov 17, 2026). */
  const APSTYLE = { key: 'ap', code: 'AP style', long: 'Five-choice questions, all topics' };
  const cell = (n) => sign(n) + comma(n);
  const NAMES = [
    { c: 'Consumption spending', i: 'Gross private domestic investment', g: 'Government purchases' },
    { c: 'Personal consumption expenditures', i: 'Investment spending', g: 'Government purchases' },
    { c: 'Household consumption', i: 'Private investment', g: 'Government purchases' },
  ];
  const JUNK_WHY = {
    tax: 'Taxes are not spending on new goods. Leave them out.',
    transfer: 'Transfers buy nothing new. They are not in GDP.',
    dep: 'Depreciation is not a spending line. Leave it out.',
    income: 'Wages are income, not spending. Do not mix the two approaches.',
    used: 'Used goods were counted when they were new.',
    stock: 'Stocks and bonds change who owns what. Nothing is made.',
  };
  // x and m are exports and imports. nx: true shows one "Net exports" row (x − m) instead.
  const MESSY_GDP = [
    { k: 'mg1', lvl: 2, n: 0, c: 420, i: 90, g: 130, x: 60, m: 85, junk: [['Personal income taxes', 110, 'tax']] },
    { k: 'mg2', lvl: 3, n: 0, c: 900, i: 210, g: 300, x: 150, m: 190, nx: true, junk: [['Depreciation', 120, 'dep'], ['Corporate profit taxes', 60, 'tax']] },
    { k: 'mg3', lvl: 2, n: 1, c: 260, i: 55, g: 80, x: 35, m: 30, junk: [['Wages', 190, 'income']] },
    { k: 'mg4', lvl: 2, n: 2, c: 640, i: 150, g: 210, x: 90, m: 120, nx: true, junk: [['Social Security checks', 95, 'transfer'], ['Depreciation', 80, 'dep']] },
    { k: 'mg5', lvl: 3, n: 1, c: 1500, i: 320, g: 450, x: 240, m: 300, nx: true, junk: [['Indirect business taxes', 140, 'tax'], ['Purchases of stocks and bonds', 400, 'stock']] },
    { k: 'mg6', lvl: 2, n: 0, c: 85, i: 20, g: 30, x: 15, m: 22, junk: [['Transfer payments', 18, 'transfer']] },
    { k: 'mg7', lvl: 3, n: 2, c: 550, i: 125, g: 170, x: 70, m: 65, nx: true, junk: [['Transfer payments', 90, 'transfer'], ['Corporate profit taxes', 45, 'tax']] },
    { k: 'mg8', lvl: 3, n: 1, c: 2100, i: 480, g: 600, x: 350, m: 500, nx: true, junk: [['Wages and salaries', 1500, 'income'], ['Personal income taxes', 380, 'tax']] },
    { k: 'mg9', lvl: 2, n: 2, c: 330, i: 85, g: 105, x: 45, m: 60, junk: [['Purchases of used cars', 35, 'used']] },
  ];
  // Spending rows plus one or two income rows (never all four), so only the spending rows give GDP.
  const MIXED_GDP = [
    { k: 'mx1', lvl: 3, n: 0, c: 300, i: 70, g: 90, x: 40, m: 60, nx: true, inc: [['Wages', 250], ['Profit', 90]] },
    { k: 'mx2', lvl: 2, n: 1, c: 52, i: 13, g: 16, x: 8, m: 11, inc: [['Wages', 44]] },
    { k: 'mx3', lvl: 3, n: 2, c: 720, i: 160, g: 240, x: 110, m: 80, nx: true, inc: [['Employee compensation', 690], ['Interest', 70]] },
    { k: 'mx4', lvl: 3, n: 0, c: 34, i: 9, g: 8, x: 4, m: 7, nx: true, inc: [['Wages', 30], ['Rent', 4]] },
    { k: 'mx5', lvl: 2, n: 1, c: 1100, i: 260, g: 340, x: 180, m: 230, inc: [['Profit', 310]] },
  ];
  // All four income rows plus two spending rows (never all of them), so only the income rows give GDP.
  const MIXED_INC = [
    { k: 'mi1', lvl: 2, w: 520, re: 40, n: 60, p: 180, spend: [['Consumption spending', 540], ['Government purchases', 150]] },
    { k: 'mi2', lvl: 2, w: 310, re: 25, n: 35, p: 130, spend: [['Consumption spending', 330], ['Investment spending', 85]] },
    { k: 'mi3', lvl: 3, w: 1400, re: 120, n: 150, p: 530, spend: [['Consumption spending', 1500], ['Government purchases', 420]] },
  ];
  // [population of all ages, working-age population, unemployed, employed]
  const POP_JOBS = [
    { k: 'pj1', lvl: 2, t: 500, a: 400, u: 24, e: 276, al: 0 },
    { k: 'pj2', lvl: 2, t: 1000, a: 800, u: 30, e: 570, al: 1 },
    { k: 'pj3', lvl: 2, t: 2000, a: 1500, u: 90, e: 1110, al: 2 },
    { k: 'pj4', lvl: 3, t: 350, a: 280, u: 21, e: 189, al: 0 },
    { k: 'pj5', lvl: 3, t: 800, a: 640, u: 32, e: 368, al: 1 },
    { k: 'pj6', lvl: 3, t: 1200, a: 900, u: 36, e: 684, al: 2 },
  ];
  const ADULT_LABELS = [['Total population', 'Working-age population'], ['Population, all ages', 'Adults 16 and older'], ['Everyone in the country', 'Adult population']];
  // [population, labor force, employed]: no unemployed row, so the student finds it first
  const POP_LF = [
    { k: 'pl1', lvl: 2, p: 400000, lf: 250000, e: 230000 },
    { k: 'pl2', lvl: 2, p: 90000, lf: 60000, e: 57000 },
    { k: 'pl3', lvl: 3, p: 5000, lf: 3200, e: 2944 },
    { k: 'pl4', lvl: 2, p: 1500000, lf: 1000000, e: 940000 },
    { k: 'pl5', lvl: 3, p: 72000, lf: 48000, e: 44160 },
    { k: 'pl6', lvl: 3, p: 600000, lf: 420000, e: 399000 },
  ];
  // labor force and employed in tenths of a million, natural rate in percent
  const GAP_CALLS = [
    { k: 'gc1', lvl: 2, lf: 500, e: 460, nat: 5, table: true },
    { k: 'gc2', lvl: 2, lf: 800, e: 776, nat: 4.5 },
    { k: 'gc3', lvl: 2, lf: 600, e: 570, nat: 5, table: true },
    { k: 'gc4', lvl: 3, lf: 250, e: 235, nat: 4 },
    { k: 'gc5', lvl: 3, lf: 1200, e: 1152, nat: 4.5, table: true },
    { k: 'gc6', lvl: 3, lf: 2000, e: 1890, nat: 5.5 },
    { k: 'gc7', lvl: 2, lf: 700, e: 651, nat: 4.5, table: true },
    { k: 'gc8', lvl: 3, lf: 1500, e: 1455, nat: 4 },
  ];
  const GAP_WORDS = [
    { k: 'gw1', lvl: 1, t: 'The output gap is negative.', key: 'recgap', y: 'A negative gap is a recessionary gap. Real GDP is below potential.' },
    { k: 'gw2', lvl: 1, t: 'The output gap is positive.', key: 'infgap', y: 'A positive gap is an inflationary gap. Real GDP is above potential.' },
    { k: 'gw3', lvl: 1, t: 'Real GDP is $60 billion below potential real GDP.', key: 'recgap', y: 'Below potential is a recessionary gap.' },
    { k: 'gw4', lvl: 1, t: 'Real GDP is $45 billion above potential real GDP.', key: 'infgap', y: 'Above potential is an inflationary gap.' },
    { k: 'gw5', lvl: 1, t: 'Actual real GDP equals potential real GDP.', key: 'fullemp', y: 'No gap. The economy is at full employment.' },
    { k: 'gw6', lvl: 2, t: 'Unemployment is 7%. The natural rate is 5%.', key: 'recgap', y: 'Unemployment above the natural rate means real GDP is below potential.' },
    { k: 'gw7', lvl: 2, t: 'Unemployment is 3.5%. The natural rate is 4.5%.', key: 'infgap', y: 'Unemployment below the natural rate means real GDP is above potential.' },
    { k: 'gw8', lvl: 2, t: 'Unemployment equals the natural rate.', key: 'fullemp', y: 'At the natural rate there is no cyclical unemployment. Full employment.' },
    { k: 'gw9', lvl: 2, t: 'Cyclical unemployment is 1.5%.', key: 'recgap', y: 'Cyclical unemployment above zero means real GDP is below potential.' },
    { k: 'gw10', lvl: 2, t: 'Cyclical unemployment is zero.', key: 'fullemp', y: 'No cyclical unemployment means full employment, at potential.' },
    { k: 'gw11', lvl: 3, t: 'Cyclical unemployment is negative.', key: 'infgap', y: 'Unemployment is below the natural rate, so real GDP is above potential.' },
    { k: 'gw12', lvl: 2, t: 'The economy is at a trough.', key: 'recgap', y: 'At a trough, real GDP is at its lowest point, below potential. Recessionary gap.' },
    /* added Nov 17, 2026: the turning points, said the other ways a test says them */
    { k: 'gw13', lvl: 2, t: 'Real GDP has hit the bottom of the business cycle.', key: 'recgap', y: 'The bottom is the trough. Real GDP is below potential there. Recessionary gap.' },
    { k: 'gw14', lvl: 2, t: 'The economy is at a peak.', key: 'infgap', y: 'At a peak, real GDP is at its highest point, above potential. Inflationary gap.' },
    { k: 'gw15', lvl: 3, t: 'A long contraction has just ended, and unemployment is at its highest.', key: 'recgap', y: 'That is the trough. Unemployment is above the natural rate, so real GDP is below potential.' },
  ];
  const STOCKS = [
    { k: 'st1', lvl: 2, t: 'A Lawrence store ends the year with more Italian-made sneakers on its shelves.', key: 'out', y: 'Investment goes up, but imports go up by the same amount. U.S. GDP does not change.' },
    { k: 'st2', lvl: 2, t: 'A Hewlett car dealer ends the year with more Japanese-made cars on its lot.', key: 'out', y: 'Inventories rise, but so do imports, by the same amount. U.S. GDP does not change.' },
    { k: 'st3', lvl: 2, t: 'A Brooklyn furniture maker ends the year with more unsold chairs it built this year.', key: 'in', y: 'Made here this year and not sold yet. A rise in inventories counts as investment.' },
    { k: 'st4', lvl: 3, t: 'A Five Towns grocery ends the year with more Israeli-made olive oil in its storeroom.', key: 'out', y: 'Made abroad. Inventories and imports rise together, so U.S. GDP does not change.' },
    { k: 'st5', lvl: 2, t: 'A Long Island bike shop ends the year with more bikes made this year in Ohio.', key: 'in', y: 'New and made in the U.S. A rise in inventories counts as investment.' },
    { k: 'st6', lvl: 3, t: "A Cedarhurst toy store sells toys it had in stock since last year.", key: 'out', y: 'Made last year and counted then, as inventory. C goes up, inventories go down. No change.' },
  ];

  /* A CPI basket as a full table (added Nov 17, 2026): three items, a quantity that never changes, and two years of
     prices. The student costs the basket in each year, then finds the percent change (ask: 'change') or the Year 2
     index (ask: 'index'). Each wrong number is a named mistake. New items and new numbers only. */
  const BASKET_TABLES = [
    { k: 'bk1', lvl: 2, ask: 'change', rows: [['Bagels', 10, 2, 3], ['Bus rides', 8, 2, 2], ['Haircuts', 1, 24, 26]] },
    { k: 'bk2', lvl: 3, ask: 'change', rows: [['Notebooks', 10, 2, 3], ['Lunches', 6, 8, 9], ['Movie tickets', 2, 16, 13]] },
    { k: 'bk3', lvl: 3, ask: 'change', rows: [['Gallons of gas', 20, 3, 2], ['Bananas', 10, 1, 1], ['T-shirts', 2, 15, 20]] },
    { k: 'bk4', lvl: 2, ask: 'index', rows: [['Apples', 10, 1, 2], ['Sandwiches', 2, 10, 8], ['Bus passes', 1, 20, 24]] },
    { k: 'bk5', lvl: 2, ask: 'index', rows: [['Gym visits', 10, 8, 10], ['Textbooks', 2, 40, 45], ['Phone plan', 1, 40, 40]] },
    { k: 'bk6', lvl: 2, ask: 'change', rows: [['Pizza slices', 10, 2, 3], ['Juice bottles', 6, 2, 3], ['Concert tickets', 2, 24, 21]] },
    { k: 'bk7', lvl: 3, ask: 'index', rows: [['Bread loaves', 10, 2, 3], ['Milk cartons', 10, 3, 2], ['Backpacks', 1, 70, 76]] },
    { k: 'bk8', lvl: 3, ask: 'change', rows: [['Coffees', 10, 2, 3], ['Laundry loads', 2, 10, 10], ['Bus passes', 1, 10, 15]] },
  ];
  const BASKET_HEAD = ['Item', 'Quantity', 'Year 1', 'Year 2'];
  GEN.baskettable = (o, r) => {
    const q = o.rows.map((x) => x[1]), a = o.rows.map((x) => x[2]), b = o.rows.map((x) => x[3]);
    const sum = (xs) => xs.reduce((s, x) => s + x, 0);
    const old = sum(q.map((n, i) => n * a[i])), neu = sum(q.map((n, i) => n * b[i]));
    const noQty = (sum(b) - sum(a)) / sum(a) * 100; // the prices added up with no quantities
    const table = o.rows.map(([name, n, p1, p2]) => [name, fmt.num(n), fmt.usd(p1), fmt.usd(p2)]);
    const costs = `Year 1: ${q.map((n, i) => n * a[i]).join(' + ')} = ${fmt.usd(old)}. Year 2: ${q.map((n, i) => n * b[i]).join(' + ')} = ${fmt.usd(neu)}.`;
    const base = { r, desk: 'prices', lvl: o.lvl, table, thead: BASKET_HEAD, calcIn: { q, a, b } };
    let t;
    if (o.ask === 'index') {
      const v = neu / old * 100;
      t = numTask(Object.assign(base, {
        order: 'CPI IN YEAR 2?', ask: 'Year 1 is the base year. Prices are for one of each item.', fmt: fmt.idx, value: v, calcF: 'basketindex', formula: F.basketcpi,
        wrongs: [{ v: old / neu * 100, why: 'That is upside down. Put the Year 2 cost on top.' }, { v: (neu - old) / old * 100, why: 'That is the percent change. The index is 100 plus that.' }, { v: sum(b) / sum(a) * 100, why: 'That adds the prices and skips the quantities.' }, { v: 100 + (neu - old), why: 'That adds the dollar change to 100. Divide by the Year 1 cost.' }],
        work: `${costs} ${fmt.num(neu)} ÷ ${fmt.num(old)} × 100 = ${fmt.idx(v)}`,
      }));
    } else {
      const v = (neu - old) / old * 100;
      t = numTask(Object.assign(base, {
        order: 'HOW MUCH DID THE CPI CHANGE?', ask: 'The basket stays the same. Prices are for one of each item.', value: v, calcF: 'basketchange', formula: F.basketinfl,
        wrongs: [{ v: (neu - old) / neu * 100, why: 'That divides by the Year 2 cost. Divide by the Year 1 cost.' }, { v: noQty, why: 'That adds the prices and skips the quantities.' }, { v: neu / old * 100, why: 'That is the new index. The change is the index minus 100.' }, { v: -v, why: 'Check the direction. Compare the Year 2 cost with Year 1.' }],
        work: `${costs} (${fmt.num(neu)} ${MINUS} ${fmt.num(old)}) ÷ ${fmt.num(old)} × 100 = ${fmt.pct(v)}`,
      }));
    }
    t.clock = Math.max(t.clock, 100); // six products, two sums, then a division: the longest math in the game
    return t;
  };

  const spendRows = (o, r) => {
    const nm = NAMES[o.n || 0];
    const rows = [[nm.c, o.c], [nm.i, o.i], [nm.g, o.g]];
    if (o.nx) rows.push(['Net exports', o.x - o.m]); else rows.push(['Exports', o.x], ['Imports', o.m]);
    return rows;
  };
  const xnWork = (o) => (o.nx ? `(${cell(o.x - o.m)})` : `(${fmt.num(o.x)} ${MINUS} ${fmt.num(o.m)})`);
  const flipWhy = (o) => (o.nx ? (o.x - o.m < 0 ? 'Net exports are negative here. Subtract them.' : 'Net exports are positive here. Add them.') : 'Imports are subtracted, not added.');
  const flipVal = (o) => (o.nx ? o.c + o.i + o.g - (o.x - o.m) : o.c + o.i + o.g + o.x + o.m);
  const tableOf = (rows, r) => shuffle(r, rows).map(([l, v]) => [l, cell(v)]);

  GEN.messygdp = (o, r) => {
    const val = o.c + o.i + o.g + o.x - o.m;
    const junkSum = o.junk.reduce((s, j) => s + j[1], 0);
    const rows = spendRows(o, r).concat(o.junk.map((j) => [j[0], j[1]]));
    const work = `${fmt.num(o.c)} + ${fmt.num(o.i)} + ${fmt.num(o.g)} + ${xnWork(o)} = ${fmt.num(val)}`;
    return numTask({
      r, desk: 'gdp', lvl: o.lvl, order: 'GDP FROM A FULL TABLE?', ask: 'Use the expenditure approach. In billions of dollars.', fmt: fmt.bil, table: tableOf(rows, r),
      value: val, calcF: 'gdp', calcIn: { c: o.c, i: o.i, g: o.g, x: o.x, m: o.m }, formula: F.gdp,
      wrongs: [{ v: val + junkSum, why: 'Only C, I, G, and Xn count. Leave the other rows out.' }, { v: val + o.junk[0][1], why: JUNK_WHY[o.junk[0][2]] }, { v: flipVal(o), why: flipWhy(o) }, { v: o.c + o.i + o.g, why: 'That leaves out net exports.' }],
      work, why: 'Only spending on new final goods: ' + work,
    });
  };
  GEN.mixedgdp = (o, r) => {
    const val = o.c + o.i + o.g + o.x - o.m;
    const incSum = o.inc.reduce((s, j) => s + j[1], 0);
    const rows = spendRows(o, r).concat(o.inc);
    const work = `${fmt.num(o.c)} + ${fmt.num(o.i)} + ${fmt.num(o.g)} + ${xnWork(o)} = ${fmt.num(val)}`;
    return numTask({
      r, desk: 'gdp', lvl: o.lvl, order: 'GDP BY SPENDING?', ask: 'Use the expenditure approach. In billions of dollars.', fmt: fmt.bil, table: tableOf(rows, r),
      value: val, calcF: 'gdp', calcIn: { c: o.c, i: o.i, g: o.g, x: o.x, m: o.m }, formula: F.gdp,
      wrongs: [{ v: val + incSum, why: 'Spending and income measure the same GDP. Never add both.' }, { v: incSum, why: 'That adds income rows, and some are missing. Use spending.' }, { v: flipVal(o), why: flipWhy(o) }, { v: o.c + o.i + o.g, why: 'That leaves out net exports.' }],
      work, why: 'Spending rows only: ' + work,
    });
  };
  GEN.mixedinc = (o, r) => {
    const val = o.w + o.re + o.n + o.p;
    const spendSum = o.spend.reduce((s, j) => s + j[1], 0);
    const rows = [['Wages', o.w], ['Rent', o.re], ['Interest', o.n], ['Profit', o.p]].concat(o.spend);
    const work = `${fmt.num(o.w)} + ${fmt.num(o.re)} + ${fmt.num(o.n)} + ${fmt.num(o.p)} = ${fmt.num(val)}`;
    return numTask({
      r, desk: 'gdp', lvl: o.lvl, order: 'GDP BY INCOME?', ask: 'Use the income approach. In billions of dollars.', fmt: fmt.bil, table: tableOf(rows, r),
      value: val, calcF: 'income', calcIn: { w: o.w, r: o.re, n: o.n, p: o.p }, formula: F.income,
      wrongs: [{ v: val + spendSum, why: 'Income and spending measure the same GDP. Never add both.' }, { v: spendSum, why: 'That adds spending rows, and some are missing. Use income.' }, { v: val - o.re, why: 'That leaves out rent.' }, { v: o.w + o.p, why: 'That leaves out rent and interest.' }],
      work, why: 'Income rows only: ' + work,
    });
  };
  const popTable = (o) => {
    const [tl, al] = ADULT_LABELS[o.al];
    return [[tl, fmt.num(o.t)], [al, fmt.num(o.a)], ['Unemployed', fmt.num(o.u)], ['Employed', fmt.num(o.e)]];
  };
  GEN.popurate = (o, r) => {
    const lf = o.u + o.e;
    return numTask({
      r, desk: 'jobs', lvl: o.lvl, order: 'UNEMPLOYMENT RATE?', ask: 'Some rows do not belong in the math.', table: popTable(o),
      value: o.u / lf * 100, calcF: 'urate', calcIn: { u: o.u, lf }, formula: F.urate,
      wrongs: [{ v: o.u / o.a * 100, why: 'That divides by working-age people. Use the labor force.' }, { v: o.u / o.t * 100, why: 'That divides by everyone, even children.' }, { v: o.u / o.e * 100, why: 'That divides by the employed only.' }],
      work: `Labor force = ${fmt.num(o.u)} + ${fmt.num(o.e)} = ${fmt.num(lf)}. ${fmt.num(o.u)} ÷ ${fmt.num(lf)} × 100 = ${fmt.pct(o.u / lf * 100)}`,
    });
  };
  GEN.poplfpr = (o, r) => {
    const lf = o.u + o.e;
    return numTask({
      r, desk: 'jobs', lvl: o.lvl, order: 'LFPR?', ask: 'Labor force participation rate', table: popTable(o),
      value: lf / o.a * 100, calcF: 'lfpr', calcIn: { lf, adults: o.a }, formula: F.lfpr,
      wrongs: [{ v: lf / o.t * 100, why: 'That divides by everyone. Children are not adults.' }, { v: o.e / o.a * 100, why: 'The unemployed are in the labor force too.' }, { v: o.u / lf * 100, why: 'That is the unemployment rate.' }],
      work: `${fmt.num(lf)} ÷ ${fmt.num(o.a)} × 100 = ${fmt.pct(lf / o.a * 100)}`,
    });
  };
  GEN.lfurate = (o, r) => {
    const u = o.lf - o.e;
    return numTask({
      r, desk: 'jobs', lvl: o.lvl, order: 'UNEMPLOYMENT RATE?', ask: 'There is no unemployed row. Find it first.', table: [['Population', fmt.num(o.p)], ['Labor force', fmt.num(o.lf)], ['Employed', fmt.num(o.e)]],
      value: u / o.lf * 100, calcF: 'urate', calcIn: { u, lf: o.lf }, formula: F.urate,
      wrongs: [{ v: u / o.p * 100, why: 'That divides by the population. Use the labor force.' }, { v: o.e / o.lf * 100, why: 'That is the share of the labor force with jobs.' }, { v: (o.p - o.e) / o.p * 100, why: 'People not looking for work are not unemployed.' }],
      work: `Unemployed = ${fmt.num(o.lf)} ${MINUS} ${fmt.num(o.e)} = ${fmt.num(u)}. ${fmt.num(u)} ÷ ${fmt.num(o.lf)} × 100 = ${fmt.pct(u / o.lf * 100)}`,
    });
  };
  const mil = (tenths) => `${comma(tenths / 10)} million`;
  const gapCall = (o) => {
    const urate = Math.round((o.lf - o.e) / o.lf * 1000) / 10;
    return { urate, key: urate > o.nat ? 'recgap' : urate < o.nat ? 'infgap' : 'fullemp' };
  };

  kind('m-gdp', 'gdp', 'pick', MESSY_GDP, (o, r) => GEN.messygdp(o, r), { drill: true });
  kind('m-mixed', 'gdp', 'pick', MIXED_GDP, (o, r) => GEN.mixedgdp(o, r), { drill: true });
  kind('m-income', 'gdp', 'pick', MIXED_INC, (o, r) => GEN.mixedinc(o, r), { drill: true });
  kind('m-urate', 'jobs', 'pick', POP_JOBS, (o, r) => GEN.popurate(o, r), { drill: true });
  kind('m-lfpr', 'jobs', 'pick', POP_JOBS, (o, r) => GEN.poplfpr(o, r), { drill: true });
  kind('m-lfu', 'jobs', 'pick', POP_LF, (o, r) => GEN.lfurate(o, r), { drill: true });
  kind('m-basket', 'prices', 'pick', BASKET_TABLES, (o, r) => GEN.baskettable(o, r), { drill: true });
  kind('m-gapcall', 'cycle', 'sort', GAP_CALLS, (o) => {
    const { urate, key } = gapCall(o);
    const u = o.lf - o.e;
    const where = key === 'recgap' ? `Above the ${fmt.pct(o.nat)} natural rate, so real GDP is below potential.` : key === 'infgap' ? `Below the ${fmt.pct(o.nat)} natural rate, so real GDP is above potential.` : 'Equal to the natural rate, so real GDP is at potential.';
    const base = { desk: 'cycle', lvl: o.lvl, order: 'WHICH GAP?', ask: 'Where is this economy?', options: bins('recgap', 'infgap', 'fullemp'), key, why: `${mil(u)} ÷ ${mil(o.lf)} = ${fmt.pct(urate)} unemployed. ${where}` };
    return o.table
      ? sortTask(Object.assign(base, { table: [['Labor force', mil(o.lf)], ['Employed', mil(o.e)], ['Natural rate of unemployment', fmt.pct(o.nat)]] }))
      : sortTask(Object.assign(base, { text: `The labor force is ${mil(o.lf)}, and ${mil(o.e)} people have jobs. The natural rate of unemployment is ${fmt.pct(o.nat)}.` }));
  }, { drill: true });
  kind('m-gapword', 'cycle', 'sort', GAP_WORDS, (o) => sortTask({ desk: 'cycle', lvl: o.lvl, order: 'WHICH GAP?', ask: 'Name it the AP way.', text: o.t, options: bins('recgap', 'infgap', 'fullemp'), key: o.key, why: o.y }), { drill: true });
  kind('m-stock', 'gdp', 'stamp', STOCKS, (o) => stampTask({ desk: 'gdp', lvl: o.lvl, order: 'DOES GDP GO UP?', ask: "This year's U.S. GDP", text: o.t, options: [{ key: 'in', label: 'GDP goes up', stampClass: 'go' }, { key: 'out', label: 'No change', stampClass: 'no' }], key: o.key, why: o.y }), { drill: true });

  /* grab tasks: tap the three that fit, chosen from the same records */
  const GRABS = [
    { k: 'g-invest', desk: 'gdp', lvl: 2, order: 'TAP THE 3 INVESTMENTS', pool: GDP, yes: (g) => g.line === 'I', no: (g) => g.line !== 'I' && g.lvl <= 2, y: 'I means new machines, buildings, homes, and inventories.', tag: (g) => (g.line ? g.line : 'Not counted') },
    { k: 'g-notcounted', desk: 'gdp', lvl: 1, order: 'TAP THE 3 NOT COUNTED', pool: GDP, yes: (g) => g.no && g.lvl === 1, no: (g) => g.line && g.lvl === 1, y: 'Used goods, intermediate goods, stocks and bonds, transfers, and imports are not in GDP.', tag: (g) => (g.line ? 'Counted, ' + g.line : BIN[g.no].label) },
    { k: 'g-gov', desk: 'gdp', lvl: 2, order: 'TAP THE 3 IN G', pool: GDP, yes: (g) => g.line === 'G', no: (g) => (g.line === 'C' || g.line === 'I' || g.no === 'transfer') && g.lvl <= 2, y: 'G is government buying goods and services. Transfers do not count.', tag: (g) => (g.line ? g.line : BIN[g.no].label) },
    { k: 'g-in', desk: 'jobs', lvl: 1, order: 'TAP THE 3 IN THE LABOR FORCE', pool: PEOPLE, yes: (p) => p.st !== 'N', no: (p) => p.st === 'N', y: 'Labor force = employed + unemployed. People with no job who are not looking are out.', tag: (p) => BIN[p.st].label },
    { k: 'g-out', desk: 'jobs', lvl: 2, order: 'TAP 3 NOT IN THE LABOR FORCE', pool: PEOPLE, yes: (p) => p.st === 'N', no: (p) => p.st !== 'N', y: 'No job and not looking. That includes discouraged workers.', tag: (p) => BIN[p.st].label },
    { k: 'g-unemp', desk: 'jobs', lvl: 2, order: 'TAP THE 3 UNEMPLOYED', pool: PEOPLE, yes: (p) => p.st === 'U', no: (p) => p.st !== 'U', y: 'Unemployed: no job, available, looked in the past 4 weeks.', tag: (p) => BIN[p.st].label },
    { k: 'g-lose', desk: 'costs', lvl: 1, order: 'TAP THE 3 WHO LOSE', ask: 'Inflation turns out higher than everyone expected.', pool: EFFECTS, yes: (e) => e.key === 'loses', no: (e) => e.key !== 'loses', y: 'Lenders, savers, and fixed incomes lose. Borrowers gain. Indexed pay is protected.', tag: (e) => BIN[e.key].label },
    { k: 'g-gain', desk: 'costs', lvl: 2, order: 'TAP THE 3 WHO GAIN', ask: 'Inflation turns out higher than everyone expected.', pool: EFFECTS, yes: (e) => e.key === 'gains', no: (e) => e.key !== 'gains', y: 'They pay fixed dollars that buy less: borrowers, tenants, firms with fixed wages.', tag: (e) => BIN[e.key].label },
    { k: 'g-out-loop', desk: 'gdp', lvl: 1, order: 'TAP THE 3 THAT LEAVE THE LOOP', pool: LOOP, yes: (l) => l.dir === 'out', no: (l) => l.dir === 'in', y: 'Taxes, savings, and imports leave. G, I, and exports come back.', tag: (l) => (l.dir === 'out' ? 'Out' : 'In') },
    { k: 'g-in-loop', desk: 'gdp', lvl: 2, order: 'TAP THE 3 THAT COME IN', pool: LOOP, yes: (l) => l.dir === 'in', no: (l) => l.dir === 'out', y: 'G, I, and exports come into the loop.', tag: (l) => (l.dir === 'out' ? 'Out' : 'In') },
  ];
  const grabRecords = [];
  GRABS.forEach((g) => { for (let i = 0; i < 3; i++) grabRecords.push({ k: g.k + '-' + i, g, i }); });
  kind('grab', 'grab', 'grab', grabRecords, (x, r) => {
    const g = x.g;
    const yes = shuffle(r, g.pool.filter(g.yes)).slice(0, 3), no = shuffle(r, g.pool.filter(g.no)).slice(0, 3);
    const all = shuffle(r, yes.concat(no));
    return finish({
      desk: g.desk, verb: 'grab', lvl: g.lvl, order: g.order, ask: g.ask,
      options: all.map((rec) => ({ label: rec.s, tag: g.tag(rec) })), answer: all.map((rec, i) => (yes.includes(rec) ? i : -1)).filter((i) => i >= 0), why: g.y,
    });
  });

  /* ================= every task, for tests and the answer key report ================= */
  function buildFrom(k, rec, r, i) {
    currentR = r;
    const t = k.build(rec, r);
    if (!t) return null;
    t.id = `${k.id}:${(rec && rec.k) || i}`;
    t.kind = k.id;
    if (api.learnFor) api.learnFor(t);
    return t;
  }
  function everyTask(seed) {
    const r = rng(seed || 1), out = [];
    K.forEach((k) => k.records.forEach((rec, i) => {
      const t = buildFrom(k, rec, r, i);
      if (t) out.push(t);
    }));
    return out;
  }

  /* ================= boss chains: The 8:30 Release =================
     Tier 0: two steps. Tier 1: three. Tier 2: four. Tier 3: the FRQ, five steps, like the review sheet. */
  function step(task, i, n, table, label) {
    const t = Object.assign({}, task, { table, part: `Step ${i + 1} of ${n}${label ? ': ' + label : ''}`, id: `${task.id || 'boss'}:s${i}` });
    if (api.learnFor) api.learnFor(t);
    return t;
  }
  function pickFrom(o) { return numTask(o); }
  function sortFrom(o) { return sortTask(o); }

  const BOSS_JOBS = [[1200, 60, 800, 4], [2000, 100, 500, 4.5], [2500, 200, 1500, 5], [1000, 40, 600, 4], [1500, 90, 500, 5]];
  const BOSS_PRICES = [[40, 48, 50.4, 8], [50, 55, 57.2, 2], [20, 25, 26, 7], [80, 100, 105, 3], [100, 120, 126, 9], [40, 50, 52, 6]];
  const BOSS_GDP = [[800, 5, 110], [500, -4, 125], [1000, 10, 105], [600, 5, 120], [1000, -2, 110], [700, -10, 120]];
  const BOSS_FRQ = [
    { n1: 800, g: 5, d: 110, u1: 4, u2: 3.5, nat: 4.5 },
    { n1: 500, g: -4, d: 125, u1: 4, u2: 6, nat: 4.5 },
    { n1: 1000, g: 10, d: 105, u1: 5, u2: 4, nat: 5 },
    { n1: 700, g: -10, d: 120, u1: 5, u2: 8, nat: 5 },
    { n1: 1000, g: -2, d: 110, u1: 4, u2: 5.5, nat: 4 },
    { n1: 600, g: 5, d: 120, u1: 5, u2: 4, nat: 4.5 },
  ];
  const COUNTRIES = ['Lawrencia', 'Cedaria', 'Woodmeria', 'Inwoodia'];

  function bossJobs(r, nSteps) {
    const [lf, u, n, nat] = pickOne(r, BOSS_JOBS);
    const e = lf - u, adults = lf + n, rate = u / lf * 100;
    const table = [['Adults', fmt.num(adults)], ['Employed', fmt.num(e)], ['Unemployed', fmt.num(u)], ['Natural rate', fmt.pct(nat)]];
    const steps = [
      GEN.lf([lf, u, n], r, 2),
      GEN.urate([lf, u, n], r, 2),
      GEN.lfpr([lf, u, n], r, 2),
      GEN.cyclical([rate, nat], r, 2),
    ].map((t) => { delete t.ask; return t; });
    const key = rate > nat ? 'Below potential' : rate < nat ? 'Above potential' : 'At potential';
    steps.push(sortFrom({ desk: 'cycle', lvl: 2, order: 'WHERE IS REAL GDP?', options: plain('Above potential', 'Below potential', 'At potential'), key, why: rate > nat ? 'Unemployment above the natural rate means a negative gap.' : rate < nat ? 'Unemployment below the natural rate means a positive gap.' : 'At the natural rate, output equals potential.' }));
    const chosen = nSteps >= 4 ? steps.slice(1, 5) : nSteps === 3 ? [steps[0], steps[1], steps[3]] : [steps[0], steps[1]];
    return chosen.map((t, i) => step(t, i, chosen.length, table));
  }
  function bossPrices(r, nSteps) {
    const [base, last, now, prevInfl] = pickOne(r, BOSS_PRICES);
    const round1 = (v) => Math.round(v * 10) / 10;
    const i1 = round1(last / base * 100), i2 = round1(now / base * 100), inf = (i2 - i1) / i1 * 100;
    const table = [['Basket, base year', fmt.usd2(base)], ['Basket, last year', fmt.usd2(last)], ['Basket, this year', fmt.usd2(now)]];
    const mk = (b, n) => { const t = GEN.cpi([b, n], r, 2); delete t.table; return t; };
    const stepsAll = [mk(base, last), mk(base, now), GEN.infl([i1, i2], r, 2)];
    stepsAll[0].order = 'INDEX LAST YEAR?';
    stepsAll[1].order = 'INDEX THIS YEAR?';
    delete stepsAll[2].table;
    const key = inf > prevInfl ? 'rising' : 'dis';
    stepsAll.push(sortFrom({
      desk: 'prices', lvl: 3, order: 'NAME IT', ask: `The year before, inflation was ${prevInfl}%. This year it is ${fmt.pct(inf)}.`, options: bins('rising', 'dis', 'de'), key,
      why: inf > prevInfl ? 'The inflation rate went up. Rising inflation.' : 'Prices still rose, just more slowly. Disinflation.',
    }));
    const chosen = nSteps === 2 ? stepsAll.slice(0, 2) : stepsAll.slice(0, nSteps);
    return chosen.map((t, i) => step(t, i, chosen.length, table));
  }
  function bossGdp(r, nSteps) {
    const [r1, g, d] = pickOne(r, BOSS_GDP);
    const r2 = r1 * (1 + g / 100), n2 = r2 * d / 100;
    const table = [['Nominal GDP, Year 1 (base year)', '$' + fmt.num(r1) + ' billion'], ['Nominal GDP, Year 2', '$' + fmt.num(n2) + ' billion'], ['Deflator, Year 2', d]];
    const a = GEN.realgdp([r2, d], r, 2);
    delete a.ask; delete a.table;
    const b = GEN.growth([r1, g, d], r, 2);
    delete b.ask; delete b.table;
    const up = g > 0;
    const c = sortFrom({ desk: 'real', lvl: 2, order: 'DID OUTPUT RISE?', options: plain('Yes, more', 'No, less'), key: up ? 'Yes, more' : 'No, less', why: up ? `Real GDP rose from ${fmt.num(r1)} to ${fmt.num(r2)}.` : `Nominal GDP rose only because prices rose. Real GDP fell to ${fmt.num(r2)}.` });
    const dTask = sortFrom({ desk: 'cycle', lvl: 2, order: 'WHICH PHASE?', options: plain('Expansion', 'Contraction'), key: up ? 'Expansion' : 'Contraction', why: up ? 'Real GDP rose: an expansion.' : 'Real GDP fell: a contraction.' });
    const all = [a, b, c, dTask];
    const chosen = nSteps === 2 ? [a, b] : nSteps === 3 ? [a, b, dTask] : all;
    return chosen.map((t, i) => step(t, i, chosen.length, table));
  }
  function bossFrq(r) {
    const x = pickOne(r, BOSS_FRQ);
    const name = pickOne(r, COUNTRIES);
    const r2 = x.n1 * (1 + x.g / 100), n2 = r2 * x.d / 100;
    const table = [['Nominal GDP, Year 1', '$' + fmt.num(x.n1) + ' billion'], ['Nominal GDP, Year 2', '$' + fmt.num(n2) + ' billion'], ['GDP deflator, Year 1', 100], ['GDP deflator, Year 2', x.d], ['Unemployment, Year 2', fmt.pct(x.u2)], ['Natural rate', fmt.pct(x.nat)]];
    const a = GEN.realgdp([r2, x.d], r, 3);
    a.order = '(a) REAL GDP, YEAR 2?'; delete a.ask; delete a.table;
    a.calc.nom1 = x.n1;
    const b = GEN.infl([100, x.d], r, 3);
    b.order = '(b) INFLATION RATE?'; delete b.table;
    const up = r2 > x.n1;
    const c = sortFrom({ desk: 'real', lvl: 3, order: '(c) PRODUCE MORE?', ask: `Did ${name} produce more in Year 2?`, options: plain('Yes, more', 'No, less'), key: up ? 'Yes, more' : 'No, less', why: up ? `Real GDP rose from ${fmt.num(x.n1)} to ${fmt.num(r2)}.` : `Real GDP fell from ${fmt.num(x.n1)} to ${fmt.num(r2)}. Nominal rose only because prices rose.` });
    const dTask = sortFrom({ desk: 'cycle', lvl: 3, order: '(d) WHICH PHASE?', options: plain('Expansion', 'Contraction'), key: up ? 'Expansion' : 'Contraction', why: up ? 'Real GDP rose: an expansion.' : 'Real GDP fell: a contraction.' });
    const key = x.u2 > x.nat ? 'Below potential' : x.u2 < x.nat ? 'Above potential' : 'At potential';
    const e = sortFrom({ desk: 'cycle', lvl: 3, order: '(e) REAL GDP v. POTENTIAL?', options: plain('Above potential', 'Below potential', 'At potential'), key, why: x.u2 > x.nat ? `Unemployment is above the natural rate by ${(x.u2 - x.nat).toFixed(1)} percentage points: a negative gap.` : `Unemployment is below the natural rate by ${(x.nat - x.u2).toFixed(1)} percentage points: a positive gap.` });
    return [a, b, c, dTask, e].map((t, i) => step(t, i, 5, table));
  }
  function boss(tier, r) {
    currentR = r;
    if (tier >= 3) return bossFrq(r).map((t) => Object.assign(t, { title: 'The Big Release' }));
    const n = tier + 2;
    const fn = pickOne(r, [bossJobs, bossPrices, bossGdp]);
    return fn(r, n).map((t) => Object.assign(t, { title: 'The 8:30 Release' }));
  }

  /* ================= scheduler =================
     Rotates desks and task types so review stays mixed, prefers tasks not seen yet, and brings misses back soon. */
  function scheduler(r, opts) {
    const seen = (opts && opts.seen) || new Set();
    const deskCount = {};
    let lastDesk = null, lastVerb = null, n = 0;
    const recent = []; // the last few task types, so a shift keeps changing what your hands do
    const back = []; // misses waiting to return
    const verbUsed = {};
    const told = new Set(); // scenarios already used this shift, so the same story does not come back as a different kind of task
    const skip = new Set((opts && opts.skipVerbs) || []);
    const fit = (t, range) => t.lvl >= range[0] && t.lvl <= range[1];
    function candidates(rank) {
      const range = RANKS[rank].lvl;
      return K.filter((k) => !skip.has(k.verb) && !skip.has(k.id)).map((k) => {
        const open = k.records.filter((rec, i) => !seen.has(`${k.id}:${(rec && rec.k) || i}`) && recordFits(k, rec, range));
        return { k, open };
      }).filter((c) => c.open.length);
    }
    function recordFits(k, rec, range) {
      const lvl = levelOf(k, rec);
      return lvl >= range[0] && lvl <= range[1];
    }
    function verbScore(v) {
      return (VERB_WEIGHT[v] || 1) * Math.pow(0.22, recent.filter((x) => x === v).length) * Math.pow(0.68, verbUsed[v] || 0) * (0.35 + r());
    }
    function kindScore(c) {
      let s = Math.pow(0.45, deskCount[deskOf(c.k, c.open)] || 0);
      if (c.k.desk === 'micro') s *= 0.35;
      if (c.k.drill) s *= 2; // test-style tables: worth more practice than one kind among many
      return s * (0.35 + r());
    }
    function next(rank) {
      n++;
      for (let i = 0; i < back.length; i++) {
        const b = back[i];
        if (n >= b.due && b.task.desk !== lastDesk && b.task.verb !== lastVerb) {
          back.splice(i, 1);
          return mark(Object.assign({}, b.task, { again: true }));
        }
        if (n >= b.due + 3) { back.splice(i, 1); return mark(Object.assign({}, b.task, { again: true })); }
      }
      let pool = candidates(rank);
      if (!pool.length) { seen.clear(); pool = candidates(rank); }
      const byVerb = {};
      pool.forEach((c) => { (byVerb[c.k.verb] = byVerb[c.k.verb] || []).push(c); });
      for (let tries = 0; tries < 12; tries++) {
        const verbs = Object.keys(byVerb).map((v) => ({ v, s: verbScore(v) })).sort((a, b) => b.s - a.s);
        for (const { v } of verbs) {
          if (v === lastVerb || recent.includes(v)) continue;
          const kinds = byVerb[v].map((c) => ({ c, s: kindScore(c) })).sort((a, b) => b.s - a.s);
          for (const { c } of kinds) {
            const rec = pickOne(r, c.open);
            const t = buildFrom(c.k, rec, r, c.k.records.indexOf(rec));
            if (!t) { seen.add(`${c.k.id}:${(rec && rec.k) || c.k.records.indexOf(rec)}`); continue; }
            if (t.desk === lastDesk) continue;
            if (!fit(t, RANKS[rank].lvl)) continue;
            if (t.text && t.text.length > 24 && told.has(t.text) && tries < 6) continue;
            return mark(t);
          }
        }
        if (tries > 4 && recent.length) recent.shift(); // loosen only if nothing else fits
      }
      const c = pool[0];
      return mark(buildFrom(c.k, c.open[0], r, c.k.records.indexOf(c.open[0])));
    }
    function mark(t) {
      seen.add(t.id);
      if (t.text) told.add(t.text);
      deskCount[t.desk] = (deskCount[t.desk] || 0) + 1;
      verbUsed[t.verb] = (verbUsed[t.verb] || 0) + 1;
      recent.push(t.verb);
      if (recent.length > 5) recent.shift();
      lastDesk = t.desk; lastVerb = t.verb;
      return t;
    }
    function miss(t) { back.push({ task: t, due: n + 3 }); }
    return { next, miss, seen };
  }
  function levelOf(k, rec) {
    if (rec && rec.lvl) return rec.lvl;
    if (rec && rec.a && rec.a.lvl) return rec.a.lvl;
    if (rec && rec.read) return rec.read.lvl;
    if (rec && rec.g) return rec.g.lvl;
    if (k.lvl) return k.lvl;
    const fixed = { 'c-gdp': 1, 'c-xn': 1, 'c-income': 1, 'c-final': 2, 'c-va': 3, 'c-percap': 1, 'b-percap': 1, percapmove: 2, 'c-urate': 1, 'c-lfpr': 2, 'c-lf': 1, 'c-cyc': 2, 'c-nat': 2, 'b-urate': 1, 'b-lfpr': 2, 'c-cpi': 1, 'c-infl': 1, 'c-wage': 2, 'c-convert': 3, 'c-basket': 1, 'c-wagechange': 2, 'b-cpi': 1, 'b-infl': 2, 'b-wage': 2, loan: 2, 'c-realrate': 2, both: 1, 'c-real': 1, 'c-def': 1, 'c-nom': 2, 'c-growth': 3, 'c-onegood': 2, 'b-real': 1, 'b-def': 2, basechart: 2, whichline: 3, sign: 2, 'c-cyc2': 2, 'c-gap': 2, 'c-surplus': 1, approach: 1 };
    return fixed[k.id] || 1;
  }
  function deskOf(k, open) {
    if (k.desk === 'memo') return open[0].d;
    if (k.desk === 'grab') return open[0].g.desk;
    return k.desk;
  }

  /* ================= pay ================= */
  function streakMult(streak) { return streak >= 10 ? 3 : streak >= 6 ? 2 : streak >= 3 ? 1.5 : 1; }
  function payFor({ base, mult, left, streak }) {
    const raw = base * (mult || 1) * (1 + 0.5 * Math.max(0, Math.min(1, left || 0))) * streakMult(streak || 0);
    return Math.round(raw / 10) * 10;
  }
  function realPayOf(pay, cpi) { return Math.round(pay / cpi * 100 / 10) * 10; }
  function realPayQuestion(pay, cpi, r) {
    const value = realPayOf(pay, cpi);
    const near10 = (v) => Math.round(v / 10) * 10;
    const list = [
      { v: value, why: 'Right. Pay ÷ CPI × 100.' },
      { v: near10(pay * cpi / 100), why: 'Divide by the CPI. Do not multiply.' },
      { v: near10(pay * (1 - (cpi - 100) / 100)), why: 'You cannot just subtract the percent.' },
      { v: pay, why: 'That is your nominal pay. It ignores the price rise.' },
    ];
    const seen = new Set();
    const uniq = list.filter((o) => { const l = fmt.usd(o.v); if (seen.has(l)) return false; seen.add(l); return true; });
    let extra = 1;
    while (uniq.length < 4) {
      const v = value + 50 * extra;
      if (!seen.has(fmt.usd(v))) { seen.add(fmt.usd(v)); uniq.push({ v, why: 'Check the arithmetic.' }); }
      extra++;
    }
    const opts = lowToHigh(uniq.map((o) => ({ label: fmt.usd(o.v), why: o.why, v: o.v })));
    return { value, options: opts, answer: opts.findIndex((o) => o.v === value), work: `${fmt.usd(pay)} ÷ ${cpi} × 100 = ${fmt.usd(value)}` };
  }

  /* ================= desk topics for the training room ================= */
  function trainingTask(deskKey, r, seen) {
    const pool = [];
    K.forEach((k) => k.records.forEach((rec, i) => {
      const id = `${k.id}:${(rec && rec.k) || i}`;
      if (!seen.has(id)) {
        const d = deskKey === DRILL.key ? (k.drill ? DRILL.key : null) : deskKey === APSTYLE.key ? (k.verb === 'ap' ? APSTYLE.key : null) : deskOf(k, [rec]);
        if (d === deskKey) pool.push({ k, rec, i, id });
      }
    }));
    if (!pool.length) { seen.clear(); return trainingTask(deskKey, r, seen); }
    // AP style mixes every topic. It deals from the topic seen least so far, never the same topic twice in a row,
    // and counts a micro flashback three times so the Unit 2 topics get most of the turns.
    let from = pool;
    if (deskKey === APSTYLE.key) {
      const dealt = seen.dealt || (seen.dealt = {});
      const weight = (d) => (dealt[d] || 0) * (d === 'micro' ? 3 : 1) + (d === 'micro' ? 1.5 : 0);
      const open = pool.filter((c) => deskOf(c.k, [c.rec]) !== seen.lastDesk);
      const list = open.length ? open : pool;
      const least = Math.min(...list.map((c) => weight(deskOf(c.k, [c.rec]))));
      from = list.filter((c) => weight(deskOf(c.k, [c.rec])) === least);
    }
    for (let tries = 0; tries < 30; tries++) {
      const c = pickOne(r, from);
      const t = buildFrom(c.k, c.rec, r, c.i);
      if (t) { seen.add(t.id); seen.lastDesk = t.desk; if (seen.dealt) seen.dealt[t.desk] = (seen.dealt[t.desk] || 0) + 1; return t; }
    }
    return buildFrom(pool[0].k, pool[0].rec, r, pool[0].i);
  }

  const totalTasks = () => K.reduce((sum, k) => sum + k.records.length, 0);
  function oneTask(kindId, recKey, r) {
    const k = K.find((x) => x.id === kindId);
    const rec = k.records.find((x) => x.k === recKey);
    return buildFrom(k, rec, r, k.records.indexOf(rec));
  }
  /* ================= the calculator's math (app.js draws the keys) =================
     A four-function calculator with parentheses, like the one allowed on the AP exam.
     Order of operations: × and ÷ before + and −. Returns null for anything it cannot read,
     including dividing by zero. calcShow turns an answer into the words on the screen. */
  function calcEval(src) {
    const s = String(src == null ? '' : src).replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
    if (!s || /[^0-9.+\-*/()]/.test(s)) return null;
    let i = 0, bad = false;
    const factor = () => {
      if (s[i] === '-') { i++; return -factor(); }
      if (s[i] === '+') { i++; return factor(); }
      if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') { bad = true; return NaN; } i++; return v; }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) { bad = true; return NaN; }
      i += m[0].length;
      return Number(m[0]);
    };
    const term = () => {
      let v = factor();
      while (s[i] === '*' || s[i] === '/') {
        const op = s[i++], w = factor();
        if (op === '/' && w === 0) bad = true;
        v = op === '*' ? v * w : v / w;
      }
      return v;
    };
    function expr() {
      let v = term();
      while (s[i] === '+' || s[i] === '-') { const op = s[i++], w = term(); v = op === '+' ? v + w : v - w; }
      return v;
    }
    const v = expr();
    if (bad || i !== s.length || !Number.isFinite(v)) return null;
    return Object.is(v, -0) ? 0 : v;
  }
  function calcShow(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'Error';
    const r = Number(v.toPrecision(10));
    if (r === 0) return '0';
    const a = Math.abs(r), neg = r < 0 ? MINUS : '';
    if (a >= 1e15 || a < 1e-6) return neg + a.toExponential(4);
    const [ip, fp] = a.toFixed(10).replace(/0+$/, '').replace(/\.$/, '').split('.');
    return neg + ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fp ? '.' + fp : '');
  }

  const api = {
    DESKS, DRILL, APSTYLE, VERBS, RANKS, BIN, ARROWS, KINDS: K, MINUS, F, steady,
    rng, shuffle, pickOne, fmt, wave, everyTask, boss, scheduler, payFor, streakMult, realPayOf, realPayQuestion, trainingTask, totalTasks, oneTask, calcEval, calcShow,
    _kit: { kind, finish, GEN, BUILD, SETS, bins, plain, VERB_CLOCK, VERB_PAY, VERB_WEIGHT, GDP, PEOPLE, EFFECTS, LOOP, REALNOM, COSTS, PHASES, NAMEIT, MICRO_ELASTIC, TYPES, MOVES, TOWNS, BOTHMOVES, PHIS, words },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SE_BANK = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
