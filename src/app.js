/* Still Employed: the game engine.
   Sections: helpers, sound, clock, task views, task runner, Solo run, firing and payday, misses and card,
   training room, the Five Towns Cup (class mode), tools, events, boot.
   Every screen has one do-this-now line and at most one main button. No alert(), confirm() or prompt(),
   so it also runs in a claude.ai artifact frame. Storage may be blocked; everything goes through `store`. */
(function () {
  'use strict';
  const B = window.SE_BANK;
  const { DESKS, RANKS, fmt, BIN } = B;

  /* ================= helpers ================= */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const KEY = 'still-employed:v1';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  const DEFAULTS = { music: true, sfx: true, mute: false, extra: false, practiced: false, best: null, lastCard: null, name: '', seen: [], cupTowns: null, cupRounds: 3 };
  let prefs = Object.assign({}, DEFAULTS);
  try { prefs = Object.assign(prefs, JSON.parse(store.get(KEY) || '{}')); } catch (e) { /* start clean */ }
  const savePrefs = () => store.set(KEY, JSON.stringify(prefs));
  let lockUntil = 0;
  const lock = (ms) => { lockUntil = performance.now() + (ms == null ? 400 : ms); };
  const locked = () => performance.now() < lockUntil;
  let stealTimer = null;
  const clearTimers = () => { clearTimeout(stealTimer); stealTimer = null; };

  const S = { screen: 'home', mode: null, solo: null, cup: null, train: null };
  const stage = () => $('#stage');
  const wall = (w) => { document.body.dataset.wall = w; };

  /* ================= sound: see audio.js. This part only decides what plays and when. ================= */
  const Sound = (function () {
    /* Sound is a garnish. If a browser's audio misbehaves, the game must carry on without it, so nothing below can throw. */
    const SILENT = { unlock() {}, configure() {}, scene() {}, play() {}, dipFor() {}, undip() {}, state: () => ({ ctx: null, playing: false }) };
    let engine = SILENT;
    try { engine = window.SE_AUDIO.createLive(); } catch (e) { engine = SILENT; }
    const live = {};
    Object.keys(SILENT).forEach((k) => { live[k] = (...args) => { try { return engine[k](...args); } catch (e) { engine = SILENT; return SILENT[k](...args); } }; });
    const made = [];
    const musicOn = () => prefs.music && !prefs.mute;
    const fxOn = () => prefs.sfx && !prefs.mute;
    const sync = () => live.configure(musicOn(), fxOn());
    sync();
    let lastDial = 0;
    return {
      sync,
      musicOn,
      fxOn,
      unlock() { live.unlock(); },
      /* Every effect goes through here, by name, so the playtest can see what the game asked for. */
      play(name, o) { made.push({ name, heard: fxOn() }); if (made.length > 300) made.shift(); live.play(name, o); },
      dial() { const t = performance.now(); if (t - lastDial > 70) { lastDial = t; this.play('tap', { soft: true }); } },
      scene(name, level) { live.scene(name, level || 0); },
      dipFor(to) { live.dipFor(to); },
      undip() { live.undip(); },
      state() { return Object.assign(live.state(), { heardLast: made.length ? made[made.length - 1] : null }); },
      log: () => made.map((m) => m.name),
      heard: () => made.filter((m) => m.heard).map((m) => m.name),
      clearLog() { made.length = 0; },
    };
  })();
  /* The music follows the game. Rank sets how full the band is and which key it is in. */
  function soundScene() {
    const screen = S.screen, mode = S.mode;
    if (screen === 'fired') return Sound.scene('none', 0);
    if (mode === 'class') return Sound.scene(screen === 'task' || screen === 'turnend' ? 'work' : 'calm', 2);
    if (mode === 'train') return Sound.scene(screen === 'task' ? 'work' : 'calm', 1);
    if (mode === 'solo' && S.solo) {
      const so = S.solo;
      if (screen === 'review') return Sound.scene('work', 1);
      if (so.boss || screen === 'bossintro') return Sound.scene('release', so.rank);
      if (screen === 'task' || screen === 'promo' || screen === 'bossdone') return Sound.scene('work', so.overtime ? 5 : so.rank);
    }
    return Sound.scene('calm', 0);
  }
  /* The corner button is for phones: one tap, no menu, any time. The Tools menu covers it in class. */
  function paintAudio() {
    const m = $('#mute');
    if (m) {
      m.hidden = S.mode === 'class' || ['home', 'cupsetup', 'cuprules'].includes(S.screen);
      m.setAttribute('aria-pressed', String(!!prefs.mute));
      m.setAttribute('aria-label', prefs.mute ? 'Turn music and sound back on' : 'Mute music and sound');
    }
    $$('[data-act="toggle-music"]').forEach((b) => { b.textContent = `Music: ${Sound.musicOn() ? 'on' : 'off'}`; b.setAttribute('aria-pressed', String(Sound.musicOn())); });
    $$('[data-act="toggle-sfx"]').forEach((b) => { b.textContent = `Sound: ${Sound.fxOn() ? 'on' : 'off'}`; b.setAttribute('aria-pressed', String(Sound.fxOn())); });
  }
  function toggleAudio(which) {
    if (prefs.mute) { prefs.mute = false; prefs.music = which === 'music'; prefs.sfx = which === 'sfx'; }
    else prefs[which] = !prefs[which];
    savePrefs();
    Sound.sync();
    Sound.unlock();
    if (which === 'sfx' && Sound.fxOn()) Sound.play('tap');
    paintAudio();
  }
  function toggleMute() {
    prefs.mute = !prefs.mute;
    savePrefs();
    Sound.sync();
    Sound.unlock();
    paintAudio();
  }

  /* ================= clock: the fuse across the top ================= */
  const Clock = {
    total: 0, left: 0, on: false, last: 0, cb: null, raf: 0, lastTick: 99,
    start(sec, cb) {
      this.total = sec; this.left = sec; this.on = true; this.cb = cb; this.last = performance.now(); this.lastTick = 99;
      const f = $('#fuse'); f.hidden = false;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.frame.bind(this));
      this.paint();
    },
    frame(now) {
      if (!this.on) return;
      const dt = (now - this.last) / 1000; this.last = now;
      if (!document.hidden) this.left -= Math.min(dt, 0.25);
      this.paint();
      if (this.left <= 3 && Math.ceil(this.left) < this.lastTick) { this.lastTick = Math.ceil(this.left); Sound.play('clock'); }
      if (this.left <= 0) { this.on = false; const cb = this.cb; this.cb = null; if (cb) cb(); return; }
      this.raf = requestAnimationFrame(this.frame.bind(this));
    },
    paint() {
      const i = $('#fuse i'); if (!i) return;
      const p = Math.max(0, this.left / this.total);
      i.style.transform = `scaleX(${p})`;
      const sec = $('#fuse b'), n = Math.max(0, Math.ceil(this.left));
      if (sec && sec.textContent !== String(n)) sec.textContent = n;
      const f = $('#fuse');
      f.classList.toggle('low', p <= 0.35 && p > 0.15);
      f.classList.toggle('crit', p <= 0.15);
    },
    stop() { const p = this.on && this.total ? Math.max(0, this.left / this.total) : 0; this.on = false; this.cb = null; cancelAnimationFrame(this.raf); return p; },
    hide() { this.on = false; this.cb = null; cancelAnimationFrame(this.raf); const f = $('#fuse'); if (f) f.hidden = true; },
  };

  /* ================= the Commissioner ================= */
  function face(mood) {
    const brows = mood === 'mad' ? '<path d="M15 24 L28 29 M49 24 L36 29"/>' : mood === 'glad' ? '<path d="M15 25 Q21 21 28 25 M36 25 Q43 21 49 25"/>' : '<path d="M15 26 L28 26 M36 26 L49 26"/>';
    const mouth = mood === 'mad' ? '<path d="M24 50 Q32 44 40 50"/>' : mood === 'glad' ? '<path d="M24 47 Q32 54 40 47"/>' : '<path d="M25 49 L39 49"/>';
    return `<svg class="face" viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="6" width="52" height="54" rx="10" fill="var(--bond)" stroke="var(--ink)" stroke-width="3"/><g fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round">${brows}<circle cx="22" cy="33" r="6"/><circle cx="42" cy="33" r="6"/><path d="M28 33 L36 33"/>${mouth}</g><path d="M20 44 Q32 38 44 44 Q38 47 32 44 Q26 47 20 44 Z" fill="var(--ink)"/></svg>`;
  }
  const LINES = {
    right: ['Fine.', 'Good.', 'Okay.', 'Not bad.', 'Correct.', 'Keep going.', 'I will allow it.', 'Filed.'],
    hot: ['Stop showing off.', 'Who hired you? Good hire.', 'Is that your third coffee?', 'You might get a desk.', 'Keep this up.'],
    wrong: ['No.', 'Absolutely not.', 'Read it again.', 'We talked about this.', 'That goes in your file.', 'Not even close.'],
  };
  const lineFor = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];

  /* ================= task views: each returns HTML for one kind of task ================= */
  const optBtn = (i, label, extra, cls) => `<button type="button" class="opt ${cls || ''}" data-act="pick" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="opt-text"><span class="opt-label">${esc(label)}</span>${extra || ''}</span></button>`;
  const defLine = (o, opts) => (opts.hints && o.def ? `<small class="opt-def">${esc(o.def)}</small>` : '');
  const formHTML = (inner, cls) => `<article class="form ${cls || ''}"><span class="punch" aria-hidden="true"></span>${inner}<span class="stamp-spot" id="stamp-spot"></span></article>`;
  const tableHTML = (t) => (t.table && t.table.length ? `<table class="data${t.table.length > 4 ? ' many' : ''}"><tbody>${t.table.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>` : '');
  const formulaHTML = (t, o) => (o.formula && t.formula ? `<p class="cheat">${esc(t.formula)}</p>` : '');

  const VIEW = {
    stamp(t) {
      const a = t.options[0], b = t.options[1];
      return `<div class="tk-body">${formHTML(`<p class="form-text">${esc(t.text)}</p>`)}</div>
        <div class="tk-controls stamps">
          <button type="button" class="stampbtn ${a.stampClass || 'neutral'}" data-act="pick" data-i="0" data-key="1"><kbd>1</kbd><span>${esc(a.label)}</span></button>
          <button type="button" class="stampbtn ${b.stampClass || 'neutral'}" data-act="pick" data-i="1" data-key="2"><kbd>2</kbd><span>${esc(b.label)}</span></button>
        </div>`;
    },
    sort(t, o) {
      const n = t.options.length;
      return `<div class="tk-body">${t.text ? formHTML(`<p class="form-text">${esc(t.text)}</p>`) : ''}${t.table ? formHTML(tableHTML(t), 'mini') : ''}</div>
        <div class="tk-controls bins n${n}">${t.options.map((b, i) => optBtn(i, b.label, defLine(b, o))).join('')}</div>`;
    },
    pick(t, o) {
      return `<div class="tk-body">${formHTML(`${t.text ? `<p class="form-text">${esc(t.text)}</p>` : ''}${tableHTML(t)}${formulaHTML(t, o)}`, t.table && !t.text ? 'mini' : '')}</div>
        <div class="tk-controls nums">${t.options.map((b, i) => optBtn(i, b.label, '')).join('')}</div>`;
    },
    build(t, o) {
      const b = t.build;
      return `<div class="tk-body">${formHTML(`<div class="buildline"><span class="bl-name">${esc(b.name)} =</span><span class="fraction"><button type="button" class="slot" data-act="unslot" data-s="0" aria-label="Top number"></button><i class="bar"></i><button type="button" class="slot" data-act="unslot" data-s="1" aria-label="Bottom number"></button></span>${b.tail ? `<span class="bl-op">${esc(b.tail.trim())}</span>` : ''}</div><p class="bl-help">Tap the top number, then the bottom number.</p>${formulaHTML(t, o)}`, 'mini')}</div>
        <div class="tk-controls nums tiles">${t.tiles.map((x, i) => `<button type="button" class="opt tile" data-act="tile" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="opt-text"><span class="opt-label">${esc(x.label)}</span></span></button>`).join('')}</div>`;
    },
    town(t) {
      return `<div class="tk-body town-body">${formHTML(`<p class="form-text">${esc(t.text)}</p>`, 'mini')}${townHTML(t)}</div>
        <div class="tk-controls nums dirs">${t.options.map((b, i) => optBtn(i, b.label, '')).join('')}</div>`;
    },
    chart(t, o) {
      const c = t.chart;
      if (c.kind === 'cycle') {
        const lit = c.pickOne ? '' : 'lit';
        const controls = c.pickOne
          ? `<div class="tk-controls points">${c.markers.map((m, i) => `<button type="button" class="opt pointbtn" data-act="pick" data-i="${i}" data-key="${i + 1}"><span class="opt-label">Point ${i + 1}</span></button>`).join('')}</div>`
          : `<div class="tk-controls bins n${t.options.length}">${t.options.map((b, i) => optBtn(i, b.label, defLine(b, o))).join('')}</div>`;
        return `<div class="tk-body chart-body ${lit}">${cycleSVG(t)}</div>${controls}`;
      }
      return `<div class="tk-body chart-body">${baseSVG(t)}</div>
        <div class="tk-controls points n${t.options.length}">${t.options.map((b, i) => `<button type="button" class="opt pointbtn" data-act="pick" data-i="${i}" data-key="${i + 1}"><span class="opt-label">${esc(b.label)}</span></button>`).join('')}</div>`;
    },
    flow(t, o) {
      return `<div class="tk-body flow-body">${formHTML(`<p class="form-text">${esc(t.text)}</p>`, 'mini')}${flowSVG(t)}</div>
        <div class="tk-controls bins n4 arrows">${t.options.map((b, i) => optBtn(i, o.hints ? `${i + 1}: ${b.label}` : 'Arrow ' + (i + 1), '')).join('')}</div>`;
    },
    memo(t) {
      return `<div class="tk-body"><article class="memo"><span class="punch" aria-hidden="true"></span><h2 class="memo-h">From the rookie</h2>${t.lines.map((l, i) => `<button type="button" class="memoline" data-act="pick" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span>${esc(l)}</span></button>`).join('')}</article></div>`;
    },
    grab(t) {
      return `<div class="tk-body chips-body"><div class="chips">${t.options.map((b, i) => `<button type="button" class="chip" data-act="grab" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="chip-text">${esc(b.label)}</span><small class="chip-tag"></small></button>`).join('')}</div></div>`;
    },
    truefalse(t) { return VIEW.stamp(t); },
    oddone(t) {
      return `<div class="tk-body chips-body"><div class="chips n4">${t.options.map((b, i) => `<button type="button" class="chip" data-act="pick" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="chip-text">${esc(b.label)}</span><small class="chip-tag"></small></button>`).join('')}</div></div>`;
    },
    order(t) {
      return `<div class="tk-body"><div class="orderlist">${t.options.map((o, i) => `<button type="button" class="opt orderitem" data-act="orderpick" data-i="${i}" data-key="${i + 1}"><b class="ordnum" aria-hidden="true"></b><span class="opt-text"><span class="opt-label">${esc(o.label)}</span></span><kbd>${i + 1}</kbd></button>`).join('')}</div><p class="wall-help">Tap them in order, first to last.</p></div>`;
    },
    match(t) {
      const n = t.left.length;
      const btn = (act, list, base) => list.map((label, i) => `<button type="button" class="opt mbtn" data-act="${act}" data-i="${i}" data-key="${base + i + 1}"><span class="mbadge" aria-hidden="true"></span><span class="opt-text"><span class="opt-label">${esc(label)}</span></span><kbd>${base + i + 1}</kbd></button>`).join('');
      return `<div class="tk-body"><div class="matchgrid"><div class="mcol">${btn('matchL', t.left, 0)}</div><div class="mcol">${btn('matchR', t.right, n)}</div></div><p class="wall-help">Tap one on the left, then its partner on the right.</p></div>`;
    },
    blank(t) {
      const [a, b] = t.text.split('____');
      return `<div class="tk-body">${formHTML(`<p class="form-text">${esc(a)}<span class="blankslot" id="blankslot"></span>${esc(b)}</p>`)}</div>
        <div class="tk-controls nums blanks">${t.options.map((o, i) => optBtn(i, o.label, '')).join('')}</div>`;
    },
    word(t) {
      const body = t.parts.map((p) => {
        if (!p.w) return esc(p.text);
        const k = t.options.findIndex((o) => o.label === p.w);
        return `<button type="button" class="wordbtn" data-act="pick" data-i="${k}" data-key="${k + 1}">${esc(p.w)}</button>`;
      }).join('');
      return `<div class="tk-body">${formHTML(`<p class="form-text wordline">${body}</p><p class="bl-help">Tap the underlined word that makes this wrong.</p>`)}</div>`;
    },
    compare(t) {
      return `<div class="tk-body"><div class="cmpgrid">${t.cards.map((c, i) => `<button type="button" class="cmpcard" data-act="pick" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><b class="cmp-title">${esc(c.title)}</b><span class="cmp-rows">${c.rows.map((r) => `<span class="cmp-row"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></span>`).join('')}</span><span class="cmp-result" hidden>${esc(c.result)}</span></button>`).join('')}</div></div>`;
    },
    type(t, o) {
      const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', B.MINUS, '0', '.'];
      return `<div class="tk-body type-body">${formHTML(`${t.text ? `<p class="form-text">${esc(t.text)}</p>` : ''}${tableHTML(t)}${formulaHTML(t, o)}`, 'mini')}
        <div class="typer"><div class="typed"><span>${esc(t.unit[0])}</span><b id="typed"></b><span>${esc(t.unit[1])}</span></div>
          <div class="keypad">${keys.map((k) => `<button type="button" class="keybtn" data-act="keypad" data-k="${esc(k)}">${esc(k)}</button>`).join('')}<button type="button" class="keybtn wide" data-act="keypad" data-k="back" aria-label="Erase">Erase</button></div>
          <button type="button" class="btn main lockbtn" id="type-go" data-act="typed-go" disabled>Lock it in</button></div></div>`;
    },
    dial(t, o) {
      const d = t.dial;
      return `<div class="tk-body">${formHTML(`${t.text ? `<p class="form-text">${esc(t.text)}</p>` : ''}${tableHTML(t)}${formulaHTML(t, o)}`, 'mini')}
        <div class="dialbox"><output class="dial-read untouched" id="dial-read">Slide to your answer</output><input type="range" id="dial" aria-label="Your answer" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.start}"><div class="dial-ends"><span>${esc(dialText(t, d.min))}</span><span>${esc(dialText(t, d.min + (d.max - d.min) / 2))}</span><span>${esc(dialText(t, d.max))}</span></div></div></div>
        <div class="tk-controls"><button type="button" class="btn main lockbtn" id="dial-go" data-act="dial-go" disabled>Lock it in</button></div>`;
    },
    arrows(t) {
      const WORD = { up: '\u25B2 Up', same: '= Same', down: '\u25BC Down' };
      return `<div class="tk-body">${formHTML(`<p class="form-text">${esc(t.text)}</p>`, 'mini')}
        <div class="arrowrows">${t.rows.map((row, r) => `<div class="arow" data-r="${r}"><span class="arow-label">${esc(row.label)}</span><div class="seg">${['up', 'same', 'down'].map((v, k) => `<button type="button" class="segbtn" data-act="arrowset" data-r="${r}" data-v="${v}" data-key="${r * 3 + k + 1}">${WORD[v]}</button>`).join('')}</div></div>`).join('')}</div></div>
        <div class="tk-controls"><button type="button" class="btn main lockbtn" id="arrows-go" data-act="arrows-go" disabled>Lock it in</button></div>`;
    },
    rows(t) {
      return `<div class="tk-body"><div class="rowtable" style="--cols:${t.columns.length}"><div class="rt-head">${t.columns.map((c) => `<span>${esc(c)}</span>`).join('')}</div>${t.cells.map((row, i) => `<button type="button" class="rt-row" data-act="pick" data-i="${i}" data-key="${i + 1}">${row.map((c) => `<span>${esc(c)}</span>`).join('')}</button>`).join('')}</div></div>`;
    },
    badcell(t) { return VIEW.rows(t); },
    pile(t) {
      const a = t.options[0], b = t.options[1];
      return `<div class="tk-body">${formHTML(`<p class="pile-count" id="pile-count">Card 1 of ${t.cards.length}</p><p class="form-text" id="pile-text">${esc(t.cards[0].t)}</p>`)}</div>
        <div class="tk-controls stamps">
          <button type="button" class="stampbtn neutral" data-act="pilebin" data-v="0" data-key="1"><kbd>1</kbd><span>${esc(a.label)}</span></button>
          <button type="button" class="stampbtn neutral" data-act="pilebin" data-v="1" data-key="2"><kbd>2</kbd><span>${esc(b.label)}</span></button>
        </div>`;
    },
    wave(t) { return `<div class="tk-body chart-body">${cycleSVG(t, true)}</div>`; },
    frq(t) {
      const parts = t.text.split(/\{(\d)\}/);
      /* a comma right after a blank stays with the blank instead of starting the next line */
      const body = parts.map((x, i) => {
        if (i % 2) { const tail = /^[,.;]/.test(parts[i + 1] || '') ? parts[i + 1][0] : ''; return `<span class="nowrap"><span class="blankslot${x === '0' ? ' active' : ''}" data-b="${x}"></span>${tail}</span>`; }
        return esc(i > 0 && /^[,.;]/.test(x) ? x.slice(1) : x);
      }).join('');
      return `<div class="tk-body">${formHTML(`<p class="form-text">${body}</p>`)}</div><div class="tk-controls nums blanks" id="frqopts" data-of="${t.blanks.length}">${frqOptions(t, 0)}</div>`;
    },
    bars(t) {
      return `<div class="tk-body chart-body">${barsSVG(t)}</div>
        <div class="tk-controls points n${t.options.length}">${t.options.map((b, i) => `<button type="button" class="opt pointbtn" data-act="pick" data-i="${i}" data-key="${i + 1}"><span class="opt-label">${esc(b.label)}</span></button>`).join('')}</div>`;
    },
    label(t) {
      const pic = t.diagram === 'cycle' ? cycleSVG(t) : flowLabelSVG();
      return `<div class="tk-body chart-body">${pic}</div>
        <div class="tk-controls bins n${t.options.length > 4 ? 'many' : t.options.length} labelopts">${t.options.map((o, i) => `<button type="button" class="opt" data-act="labelpick" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="opt-text"><span class="opt-label">${esc(o.label)}</span></span></button>`).join('')}</div>`;
    },
    ap(t) {
      return `<div class="tk-body ap-body">${formHTML(`<p class="ap-stem">${esc(t.text)}</p>`, 'mini')}<div class="ap-opts">${t.options.map((o, i) => `<button type="button" class="opt apopt" data-act="pick" data-i="${i}" data-key="${i + 1}"><b class="ap-letter" aria-hidden="true">${'ABCDE'[i]}</b><span class="opt-text"><span class="opt-label">${esc(o.label)}</span></span></button>`).join('')}</div></div>`;
    },
  };
  const dialText = (t, v) => {
    const d = t.dial;
    const clean = Math.round(Number(v) * 100) / 100; // 7.000000000000001 reads as 7
    return `${clean < 0 ? B.MINUS : ''}${d.pre}${Math.abs(clean)}${d.suf}`;
  };
  const frqOptions = (t, b) => `<p class="frq-step">Blank ${b + 1} of ${t.blanks.length}</p>` + t.blanks[b].options.map((label, i) => `<button type="button" class="opt" data-act="frqpick" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="opt-text"><span class="opt-label">${esc(label)}</span></span></button>`).join('');

  /* ---------- town of 100 ---------- */
  function townHTML(t) {
    const { e, u, n, from } = t.town;
    const dots = (key, count) => {
      let h = '';
      for (let i = 0; i < count; i++) h += `<i class="dot${key === from && i === count - 1 ? ' me' : ''}"></i>`;
      return h;
    };
    const group = (key, name, count) => `<div class="tg tg-${key}" data-group="${key}"><b class="tg-name">${name}</b><b class="tg-count" data-count="${key}">${count}</b><div class="dots">${dots(key, count)}</div></div>`;
    const r = t.rates;
    return `<div class="townwrap" aria-label="A town of 100 adults">
      <div class="groups">${group('e', 'Employed', e)}${group('u', 'Unemployed', u)}${group('n', 'Not in labor force', n)}</div>
      <div class="rates"><span>Unemployment rate <b id="rate-u">${fmt.pct(r.rate0)}</b></span><span>LFPR <b id="rate-l">${fmt.pct(r.part0)}</b></span></div>
    </div>`;
  }
  function moveTownPerson(t) {
    const { from, to } = t.town;
    const r = t.rates;
    const setRates = () => {
      const ru = $('#rate-u'), rl = $('#rate-l');
      if (ru) ru.textContent = fmt.pct(r.rate1);
      if (rl) rl.textContent = fmt.pct(r.part1);
      $$('.rates b').forEach((b) => b.classList.add('flash'));
    };
    if (from === to) { setRates(); return; }
    const me = $('.dot.me');
    const dest = $(`[data-group="${to}"] .dots`);
    const cFrom = $(`[data-count="${from}"]`), cTo = $(`[data-count="${to}"]`);
    if (cFrom) cFrom.textContent = t.after[from];
    if (cTo) cTo.textContent = t.after[to];
    if (!me || !dest) { setRates(); return; }
    const a = me.getBoundingClientRect();
    dest.appendChild(me);
    const b = me.getBoundingClientRect();
    if (!reduced() && me.animate) {
      me.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(2)` }, { transform: 'translate(0,0) scale(1)' }], { duration: 800, easing: 'cubic-bezier(.3,.7,.2,1)' });
    }
    setTimeout(setRates, reduced() ? 0 : 500);
  }

  /* ---------- business cycle chart ---------- */
  let CW = 640, CH = 300;
  const CL = 40, CR = 14, CT = 12, CB = 34;
  const chartSize = () => { const phone = window.innerWidth < 620; CW = phone ? 460 : 640; CH = phone ? 300 : 300; };
  const cx = (x) => CL + x * (CW - CL - CR);
  const cy = (v) => CH - CB - ((v - 0.08) / 0.78) * (CH - CB - CT);
  function cycleSVG(t, tapWave) {
    chartSize();
    const c = t.chart, phi = c.phi, W = B.wave;
    let actual = '', fillsPos = '', fillsNeg = '';
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      actual += `${i ? 'L' : 'M'}${cx(x).toFixed(1)} ${cy(W.actual(x, phi)).toFixed(1)} `;
      if (i < N) {
        const x2 = (i + 1) / N;
        const a1 = W.actual(x, phi), a2 = W.actual(x2, phi), p1 = W.potential(x), p2 = W.potential(x2);
        const seg = `<polygon points="${cx(x).toFixed(1)},${cy(a1).toFixed(1)} ${cx(x2).toFixed(1)},${cy(a2).toFixed(1)} ${cx(x2).toFixed(1)},${cy(p2).toFixed(1)} ${cx(x).toFixed(1)},${cy(p1).toFixed(1)}"/>`;
        if ((a1 + a2) / 2 >= (p1 + p2) / 2) fillsPos += seg; else fillsNeg += seg;
      }
    }
    const marks = c.markers.map((m, i) => {
      const X = cx(m.x), Y = cy(W.actual(m.x, phi));
      const act = c.pickOne ? `data-act="pick" data-i="${i}" role="button" aria-label="Point ${i + 1}"` : '';
      const num = c.pickOne || c.labeling ? i + 1 : '';
      return `<g class="mk ${c.pickOne ? 'tap' : c.labeling ? 'spot' : 'focus'}" data-mk="${i}" ${act}><circle class="mk-hit" cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="32"/><circle class="mk-dot" cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="17"/><text class="mk-num" x="${X.toFixed(1)}" y="${(Y + 6).toFixed(1)}" text-anchor="middle">${num}</text></g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="A business cycle graph: actual real GDP moves in a wave around a rising line of potential real GDP.">
      <g class="gapfill pos">${fillsPos}</g><g class="gapfill neg">${fillsNeg}</g>
      <line class="axis" x1="${CL}" y1="${CT}" x2="${CL}" y2="${CH - CB}"/><line class="axis" x1="${CL}" y1="${CH - CB}" x2="${CW - CR}" y2="${CH - CB}"/>
      <text class="ax" transform="translate(16 ${(CH - CB) / 2 + 6}) rotate(-90)" text-anchor="middle">Real GDP</text>
      <text class="ax" x="${(CW + CL) / 2}" y="${CH - 10}" text-anchor="middle">Time</text>
      <line class="pot" x1="${cx(0)}" y1="${cy(W.potential(0))}" x2="${cx(1)}" y2="${cy(W.potential(1))}"/>
      <path class="act" d="${actual}"/>
      <g class="legend"><line class="act-key" x1="${CL + 10}" y1="${CT + 8}" x2="${CL + 34}" y2="${CT + 8}"/><text class="lab" x="${CL + 40}" y="${CT + 14}">Actual Real GDP</text><line class="pot-key" x1="${CL + 176}" y1="${CT + 8}" x2="${CL + 204}" y2="${CT + 8}"/><text class="lab" x="${CL + 210}" y="${CT + 14}">Potential Real GDP</text></g>
      ${marks}
      ${tapWave ? `<rect class="wave-hit" data-act="wavetap" x="${CL}" y="${CT}" width="${CW - CL - CR}" height="${CH - CB - CT}" role="button" aria-label="Tap the wave"/>` : ''}
    </svg>`;
  }

  /* ---------- bars: a value label on every bar, and a dashed line for the natural rate ---------- */
  function barsSVG(t) {
    chartSize();
    const vals = t.bars.map((b) => b.v);
    const hi = Math.max(...vals, t.line || 0, 0), lo = Math.min(...vals, 0);
    const top = CT + 24, bottom = CH - CB - (lo < 0 ? 26 : 0);
    const y = (v) => bottom - (v - lo) / ((hi - lo) || 1) * (bottom - top);
    const n = t.bars.length, slot = (CW - CL - CR) / n, w = slot * 0.56;
    const zero = y(0);
    const num = (v) => `${v < 0 ? B.MINUS : ''}${Math.abs(v)}${t.suf || ''}`;
    const bars = t.bars.map((b, i) => {
      const x = CL + slot * i + (slot - w) / 2, yy = y(b.v), up = b.v >= 0;
      return `<g class="barwrap" data-mk="${i}" data-act="pick" data-i="${i}" role="button" aria-label="${esc(b.label)}"><rect class="barhit" x="${(CL + slot * i).toFixed(1)}" y="${CT}" width="${slot.toFixed(1)}" height="${CH - CB - CT}"/><rect class="bar" x="${x.toFixed(1)}" y="${Math.min(yy, zero).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(2, Math.abs(zero - yy)).toFixed(1)}"/><text class="bar-val" x="${(x + w / 2).toFixed(1)}" y="${(up ? yy - 7 : yy + 20).toFixed(1)}" text-anchor="middle">${esc(num(b.v))}</text></g>`;
    }).join('');
    const line = t.line != null ? `<line class="natline" x1="${CL}" x2="${CW - CR}" y1="${y(t.line).toFixed(1)}" y2="${y(t.line).toFixed(1)}"/><text class="lab" x="${CW - CR - 4}" y="${(y(t.line) - 7).toFixed(1)}" text-anchor="end">${esc(t.lineLabel)}: ${esc(num(t.line))}</text>` : '';
    const ticks = t.bars.map((b, i) => `<text class="ax" x="${(CL + slot * i + slot / 2).toFixed(1)}" y="${CH - 12}" text-anchor="middle">${esc(b.label)}</text>`).join('');
    return `<svg class="chart barschart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="A bar chart with one bar for each of four years.">
      ${bars}<line class="axis" x1="${CL}" y1="${zero.toFixed(1)}" x2="${CW - CR}" y2="${zero.toFixed(1)}"/>${line}${ticks}
    </svg>`;
  }

  /* ---------- base year chart: real and nominal cross at the base year ---------- */
  function baseSVG(t) {
    chartSize();
    const c = t.chart, n = c.years.length, b = c.base;
    const xAt = (i) => CL + 30 + i * ((CW - CL - CR - 60) / (n - 1));
    const real = (i) => 0.42 + 0.05 * (i - b), nom = (i) => 0.42 + 0.12 * (i - b);
    const line = (fn) => c.years.map((y, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${cy(fn(i)).toFixed(1)}`).join(' ');
    const ticks = c.years.map((y, i) => `<line class="tick" x1="${xAt(i)}" y1="${CH - CB}" x2="${xAt(i)}" y2="${CH - CB + 6}"/><text class="ax" x="${xAt(i)}" y="${CH - 12}" text-anchor="middle">${y}</text>`).join('');
    const lastI = n - 1;
    const upLab = c.hideNames ? (c.swap ? 'Line B' : 'Line A') : 'Nominal GDP', loLab = c.hideNames ? (c.swap ? 'Line A' : 'Line B') : 'Real GDP';
    const baseLine = c.pickLine ? '' : `<line class="baseline" x1="${xAt(b)}" y1="${CT}" x2="${xAt(b)}" y2="${CH - CB}"/>`;
    return `<svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Two lines of GDP over five years.">
      <line class="axis" x1="${CL}" y1="${CT}" x2="${CL}" y2="${CH - CB}"/><line class="axis" x1="${CL}" y1="${CH - CB}" x2="${CW - CR}" y2="${CH - CB}"/>
      <text class="ax" transform="translate(16 ${(CH - CB) / 2 + 6}) rotate(-90)" text-anchor="middle">GDP</text>
      ${ticks}
      <path class="act" d="${line(nom)}"/><path class="pot strong" d="${line(real)}"/>
      <text class="lab" x="${xAt(lastI) + 2}" y="${cy(nom(lastI)) + (nom(lastI) > 0.8 ? 24 : -10)}" text-anchor="end">${upLab}</text>
      <text class="lab" x="${xAt(lastI) + 2}" y="${cy(real(lastI)) + 24}" text-anchor="end">${loLab}</text>
      ${baseLine}
    </svg>`;
  }

  /* ---------- circular flow: same geometry as the review sheet. Inner loop real, outer loop money. ---------- */
  const FLOW_PATHS = [
    'M520 130 L520 80 L120 80 L120 130',
    'M70 130 L70 34 L570 34 L570 130',
    'M120 210 L120 262 L520 262 L520 210',
    'M570 210 L570 308 L70 308 L70 210',
  ];
  const FLOW_BADGE = [[420, 80], [190, 34], [190, 262], [420, 308]];
  function flowSVG() {
    const arrows = FLOW_PATHS.map((d, i) => {
      const real = i === 0 || i === 2;
      const [bx, by] = FLOW_BADGE[i];
      return `<g class="arrow ${real ? 'real' : 'money'}" data-arrow="${i}" data-act="pick" data-i="${i}" role="button" aria-label="Arrow ${i + 1}">
        <path class="arrow-hit" d="${d}"/><path class="arrow-line" d="${d}" marker-end="url(#ah${real ? 'r' : 'm'})"/>
        <circle class="arrow-badge" cx="${bx}" cy="${by}" r="22"/><text class="arrow-num" x="${bx}" y="${by + 9}" text-anchor="middle">${i + 1}</text>
      </g>`;
    }).join('');
    return `<svg class="chart flow" id="flowsvg" viewBox="0 0 640 342" role="img" aria-label="The circular flow: households on the left, firms on the right, the product market on top, the factor market on the bottom.">
      <defs>
        <marker id="ahr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="ah real"/></marker>
        <marker id="ahm" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="ah money"/></marker>
      </defs>
      ${arrows}
      <g class="node"><rect x="8" y="130" width="154" height="80" rx="4"/><text x="85" y="179" text-anchor="middle">Households</text></g>
      <g class="node"><rect x="478" y="130" width="154" height="80" rx="4"/><text x="555" y="179" text-anchor="middle">Firms</text></g>
      <g class="node mkt"><rect x="240" y="16" width="160" height="82" rx="4"/><text x="320" y="51" text-anchor="middle">Product</text><text x="320" y="79" text-anchor="middle">market</text></g>
      <g class="node mkt"><rect x="240" y="244" width="160" height="82" rx="4"/><text x="320" y="279" text-anchor="middle">Factor</text><text x="320" y="307" text-anchor="middle">market</text></g>
      <text class="flow-key" x="320" y="162" text-anchor="middle">Inner: real things</text>
      <text class="flow-key" x="320" y="192" text-anchor="middle">Outer: money</text>
    </svg>`;
  }
  function flowLabelSVG() {
    const arrows = FLOW_PATHS.map((d, i) => {
      const real = i === 0 || i === 2;
      const [bx, by] = FLOW_BADGE[i];
      return `<g class="arrow labelspot ${real ? 'real' : 'money'}" data-spot="${i}"><path class="arrow-line" d="${d}" marker-end="url(#ah${real ? 'r' : 'm'})"/><circle class="arrow-badge" cx="${bx}" cy="${by}" r="22"/><text class="arrow-num" x="${bx}" y="${by + 9}" text-anchor="middle">?</text></g>`;
    }).join('');
    return `<svg class="chart flow" id="flowsvg" viewBox="0 0 640 342" role="img" aria-label="The circular flow with parts to name.">
      <defs>
        <marker id="ahr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="ah real"/></marker>
        <marker id="ahm" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="ah money"/></marker>
      </defs>
      ${arrows}
      <g class="node"><rect x="8" y="130" width="154" height="80" rx="4"/><text x="85" y="179" text-anchor="middle">Households</text></g>
      <g class="node"><rect x="478" y="130" width="154" height="80" rx="4"/><text x="555" y="179" text-anchor="middle">Firms</text></g>
      <g class="node labelspot" data-spot="4"><rect x="240" y="16" width="160" height="82" rx="4"/><text class="spotname" x="320" y="66" text-anchor="middle">?</text><text class="spotname2" x="320" y="80" text-anchor="middle"></text></g>
      <g class="node labelspot" data-spot="5"><rect x="240" y="244" width="160" height="82" rx="4"/><text class="spotname" x="320" y="294" text-anchor="middle">?</text><text class="spotname2" x="320" y="308" text-anchor="middle"></text></g>
      <text class="flow-key" x="320" y="162" text-anchor="middle">Inner: real things</text>
      <text class="flow-key" x="320" y="192" text-anchor="middle">Outer: money</text>
    </svg>`;
  }
  function runFlowToken(i) {
    const svg = $('#flowsvg'); if (!svg) return;
    svg.classList.add('revealed');
    if (reduced()) return;
    const ns = 'http://www.w3.org/2000/svg';
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('r', '10');
    dot.setAttribute('class', 'token');
    const an = document.createElementNS(ns, 'animateMotion');
    an.setAttribute('dur', '1.1s'); an.setAttribute('fill', 'freeze'); an.setAttribute('begin', 'indefinite'); an.setAttribute('path', FLOW_PATHS[i]);
    dot.appendChild(an);
    svg.appendChild(dot);
    try { an.beginElement(); } catch (e) { /* older browsers just skip the token */ }
  }

  /* ================= calculator ================= */
  /* A four-function calculator with parentheses, like the one allowed on the AP exam. The math is B.calcEval.
     While it is open, the keyboard types into it (digits, + - * / x, parentheses, Enter, Backspace, Escape),
     so 1 to 9 and A to E cannot pick an answer by accident. It closes on each new screen but keeps its last line. */
  const CALC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6.5h8M8.5 11h1M12 11h0M15.5 11h0M8.5 14.5h0M12 14.5h0M15.5 14.5h0M8.5 18h0M12 18h0M15.5 18h0"/></svg>';
  const calcBtn = () => `<button type="button" class="calcbtn" data-act="calc" aria-expanded="${Calc.open}" aria-controls="calc">${CALC_ICON}Calculator</button>`;
  const Calc = { open: false, expr: '', prev: '', shown: '', done: false, err: false };
  const CALC_OPS = ['+', B.MINUS, '×', '÷'];
  function calcPretty(e) { return e.replace(/([+×÷])/g, ' $1 ').replace(/([0-9.)])−/g, '$1 − ').replace(/\s+/g, ' ').trim(); }
  function calcPaint() {
    const box = $('#calc'); if (!box) return;
    box.hidden = !Calc.open;
    document.body.classList.toggle('calc-open', Calc.open);
    $$('[data-act="calc"]').forEach((b) => b.setAttribute('aria-expanded', String(Calc.open)));
    const out = $('#calc-out'), prev = $('#calc-prev');
    prev.textContent = Calc.done ? Calc.prev : '';
    out.textContent = Calc.done ? Calc.shown : (calcPretty(Calc.expr) || '0');
    out.classList.toggle('err', Calc.done && Calc.err);
    out.scrollLeft = out.scrollWidth;
  }
  function calcToggle(open) { Calc.open = open === undefined ? !Calc.open : open; calcPaint(); }
  function calcKey(k) {
    let e = Calc.expr;
    if (Calc.done && (/^[0-9.(]$/.test(k) || k === 'back')) { e = ''; }
    if (Calc.done && Calc.err && CALC_OPS.includes(k)) e = '';
    Calc.done = false; Calc.err = false;
    const last = e.slice(-1), opens = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
    if (k === 'C') { e = ''; Calc.prev = ''; }
    else if (k === 'back') e = e.slice(0, -1);
    else if (k === '=') {
      if (!e) return;
      const full = e + ')'.repeat(Math.max(0, opens));
      const v = B.calcEval(full);
      Calc.prev = calcPretty(full) + ' =';
      Calc.shown = B.calcShow(v);
      Calc.err = v === null;
      Calc.done = true;
      e = v === null ? '' : String(Number(v.toPrecision(12))).replace('-', B.MINUS);
    } else if (/^[0-9]$/.test(k)) { e += (last === ')' ? '×' : '') + k; }
    else if (k === '.') {
      const seg = e.split(/[+×÷−()]/).pop();
      if (!seg.includes('.')) e += (last === ')' ? '×' : '') + (seg === '' ? '0.' : '.');
    } else if (CALC_OPS.includes(k)) {
      if (e === '' || last === '(') { if (k === B.MINUS) e += k; }
      else if (CALC_OPS.includes(last)) {
        if (k === B.MINUS && (last === '×' || last === '÷')) e += k;
        else if (e.length > 1 && !CALC_OPS.includes(e.slice(-2, -1)) && e.slice(-2, -1) !== '(') e = e.slice(0, -1) + k;
      } else e += k;
    } else if (k === '(') { e += (/[0-9.)]/.test(last) ? '×' : '') + '('; }
    else if (k === ')') { if (opens > 0 && /[0-9.)]/.test(last)) e += ')'; }
    if (e.length > 60) return;
    Calc.expr = e;
    calcPaint();
    Sound.play('key');
  }
  const CALC_KEYS = { '*': '×', x: '×', X: '×', '/': '÷', '-': B.MINUS, '=': '=', Enter: '=', Backspace: 'back', Delete: 'C', c: 'C', C: 'C', '(': '(', ')': ')', '+': '+', '.': '.' };

  /* ================= task runner ================= */
  const Run = { t: null, o: null, done: false, cb: null, slots: [], got: null };

  function startTask(t, o, cb) {
    clearTimers();
    document.body.classList.remove('answered');
    $$('.confetti').forEach((c) => c.remove());
    Run.t = t; Run.o = o || {}; Run.done = false; Run.cb = cb; Run.slots = []; Run.got = new Set();
    Run.seq = []; Run.sel = null; Run.matched = 0; Run.typed = ''; Run.arrows = []; Run.pileAt = 0; Run.whyOverride = null; Run.typedWhy = null; Run.frq = []; Run.li = 0; Run.labelWrong = null; Run.choice = undefined;
    S.screen = 'task';
    calcToggle(false);
    wall(t.desk);
    const part = t.part ? `<p class="tk-part">${esc(t.title || '')}. ${esc(t.part)}</p>` : '';
    const bannerText = o.banner || (t.again ? 'Back on your desk. You missed this one earlier.' : '');
    const practice = bannerText ? `<p class="tk-banner">${esc(bannerText)}</p>` : '';
    const skip = o.skip ? `<button type="button" class="linkbtn tk-skip" data-act="lunch">Long lunch: skip this task</button>` : '';
    const stop = o.stop ? `<button type="button" class="linkbtn tk-skip" data-act="${esc(o.stop)}">${esc(o.stopLabel || 'Stop')}</button>` : '';
    const skipReview = o.skipReview ? `<button type="button" class="linkbtn tk-skip" data-act="skipmiss">Skip this one</button>` : '';
    stage().innerHTML = `<section class="task v-${t.verb}" data-task="${esc(t.id || '')}">
      <header class="tk-head"><span class="tk-tab">${esc(DESKS[t.desk].name)} desk</span>${calcBtn()}${part}${practice}
        <h1 class="tk-order">${esc(t.order)}</h1>${t.ask ? `<p class="tk-ask">${esc(t.ask)}</p>` : ''}${skip}${stop}${skipReview}</header>
      ${t.table && (t.verb === 'sort') && !t.text ? '' : ''}
      ${VIEW[t.verb](t, Run.o)}
      <div id="verdict-slot" aria-live="polite"></div>
    </section>`;
    stage().scrollTop = 0;
    renderHud();
    renderTray(null);
    if (o.strike) strikeOne(t);
    if (t.verb === 'label') lightSpot(t);
    if (o.clock) Clock.start(o.clock, () => answer(null)); else Clock.hide();
    lock(200);
    Sound.undip();
    soundScene();
    paintAudio();
    Sound.play('paper');
  }

  /* Second opinion perk: cross out one wrong answer */
  function strikeOne(t) {
    if (!['sort', 'pick', 'build', 'town', 'chart', 'flow', 'memo', 'oddone', 'blank', 'word', 'rows', 'badcell', 'bars', 'ap'].includes(t.verb)) return;
    if (t.verb === 'build') {
      const wrong = t.tiles.map((x, i) => i).filter((i) => !t.answer.includes(i));
      const el = $(`[data-act="tile"][data-i="${wrong[0]}"]`);
      if (el) { el.classList.add('struck'); el.disabled = true; }
      return;
    }
    const wrong = t.options.map((x, i) => i).filter((i) => i !== t.answer);
    if (t.options.length < 3 || !wrong.length) return;
    const i = wrong[Math.floor(Math.random() * wrong.length)];
    $$(`[data-act="pick"][data-i="${i}"]`).forEach((el) => {
      el.classList.add('struck');
      if (el.tagName === 'BUTTON') el.disabled = true; else el.removeAttribute('data-act');
    });
  }

  const isRight = (t, c) => {
    switch (t.verb) {
      case 'build': return Array.isArray(c) && c[0] === t.answer[0] && c[1] === t.answer[1];
      case 'grab': case 'order': case 'match': case 'pile': case 'label': return c === 'all';
      case 'type': case 'dial': return typeof c === 'number' && Math.abs(c - t.calc.value) <= t.tol + 1e-9;
      case 'arrows': return Array.isArray(c) && c.every((v, i) => v === t.rows[i].answer);
      case 'frq': return Array.isArray(c) && c.every((v, i) => v === t.blanks[i].answer);
      case 'wave': return typeof c === 'number' && t.zones.some(([a, b]) => c >= a && c <= b);
      default: return c === t.answer;
    }
  };

  function answerText(t) {
    switch (t.verb) {
      case 'build': return `${labelOnly(t.tiles[t.answer[0]].label)} ÷ ${labelOnly(t.tiles[t.answer[1]].label)}`;
      case 'grab': return t.answer.map((i) => t.options[i].label).join(', ');
      case 'memo': return `This line is wrong: ${t.lines[t.answer]}`;
      case 'flow': return `Arrow ${t.answer + 1}: ${t.options[t.answer].label}`;
      case 'order': return t.answer.map((i, k) => { const s = t.options[i].label; return k && /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; }).join(', then ');
      case 'match': return t.left.map((l, i) => `${l}: ${t.right[t.answer[i]]}`).join('. ');
      case 'word': return `"${t.options[t.answer].label}" should be "${t.fix}"`;
      case 'compare': return `${t.cards[t.answer].title}. ${t.cards.map((c) => `${c.title}: ${c.result}`).join('. ')}`;
      case 'type': return t.calc.shown;
      case 'dial': return dialText(t, t.calc.value);
      case 'arrows': return t.rows.map((r) => `${r.label} ${r.answer}`).join(', ');
      case 'badcell': return `${t.options[t.answer].label} should be ${t.fix}`;
      case 'pile': { const c = t.cards[Run.pileAt]; return c ? `This card goes in ${t.options[c.bin].label}` : t.options[0].label; }
      case 'wave': return 'See the green part of the wave';
      case 'frq': return t.blanks.map((b) => b.options[b.answer]).join(', ');
      case 'label': { const st = t.steps[Math.min(Run.li, t.steps.length - 1)]; return t.options[st.answer].label; }
      case 'chart': if (t.chart.pickOne) return `Point ${t.answer + 1}${t.options[t.answer].meaning ? ': ' + t.options[t.answer].meaning : ''}`; return t.options[t.answer].label;
      default: return t.options[t.answer].label;
    }
  }
  /* The pick in words, for the tasks whose screen no longer shows it after the key goes up. */
  function youSaid(t, c) {
    if (t.verb === 'build' && Array.isArray(c)) return `${labelOnly(t.tiles[c[0]].label)} ÷ ${labelOnly(t.tiles[c[1]].label)}`;
    if (t.verb === 'frq' && Array.isArray(c)) return c.map((v, i) => t.blanks[i].options[v]).join(', ');
    if (t.verb === 'label' && typeof Run.labelWrong === 'number') return t.options[Run.labelWrong].label;
    return '';
  }
  const labelOnly = (s) => String(s).replace(/\s+[-−$\d.,%]+( million| billion)?$/, '').replace(/\s+[$\d].*$/, '');

  function answer(choice) {
    if (Run.done) return;
    Run.done = true;
    const left = Clock.stop();
    const t = Run.t;
    Run.choice = choice;
    const correct = choice != null && isRight(t, choice);
    markChoice(t, choice, correct);
    Sound.play(correct ? 'right' : 'miss');
    if (Run.cb) Run.cb(correct, choice, left);
  }

  /* Show what the player picked. revealAnswer shows the key; Class holds it back during a steal. */
  function markChoice(t, choice, correct) {
    if (choice == null) { const f = $('.form'); if (f) f.classList.add('timedout'); }
    if (typeof choice === 'number' && !correct) {
      $$(`.task [data-i="${choice}"]`).forEach((el) => { el.classList.add('is-wrong'); });
    }
    if (typeof choice === 'number' && correct) {
      $$(`.task [data-i="${choice}"]`).forEach((el) => { el.classList.add('is-right'); });
    }
    $$('.task [data-act]:not(.linkbtn)').forEach((el) => { el.classList.add('is-locked'); if (el.tagName === 'BUTTON') el.disabled = true; });
    $$('.lockbtn').forEach((el) => el.remove());
    const dial = $('#dial'); if (dial) dial.disabled = true;
    if (t.verb === 'chart' && t.chart.kind === 'base') { /* marker fills come from revealAnswer */ }
    if (correct) revealAnswer(t, choice);
  }

  function revealAnswer(t, choice) {
    document.body.classList.add('answered');
    if (t.verb === 'stamp' || t.verb === 'truefalse') {
      const o = t.options[t.answer];
      const spot = $('#stamp-spot');
      if (spot) spot.innerHTML = `<span class="stampmark ${o.stampClass || 'neutral'}">${esc(o.label)}</span>`;
    }
    if (['sort', 'pick', 'town', 'flow', 'stamp', 'memo', 'chart', 'truefalse', 'oddone', 'blank', 'word', 'compare', 'rows', 'badcell', 'bars', 'ap'].includes(t.verb)) {
      $$(`.task [data-i="${t.answer}"]`).forEach((el) => el.classList.add('is-right'));
    }
    if (t.verb === 'memo') {
      const el = $(`.memoline[data-i="${t.answer}"]`);
      if (el) el.classList.add('struckthrough');
    }
    if (t.verb === 'oddone') {
      t.options.forEach((o, i) => {
        const el = $(`.chip[data-i="${i}"]`); if (!el) return;
        if (i !== t.answer && !el.classList.contains('is-wrong')) el.classList.add('is-other');
        const tag = $('.chip-tag', el); if (tag) tag.textContent = o.tag || '';
      });
    }
    if (t.verb === 'order') {
      t.answer.forEach((optIndex, place) => {
        const el = $(`.orderitem[data-i="${optIndex}"]`); if (!el) return;
        if (!el.classList.contains('is-wrong')) el.classList.add('is-right');
        const num = $('.ordnum', el); if (num) num.textContent = place + 1;
      });
    }
    if (t.verb === 'match') {
      t.left.forEach((l, i) => {
        const a = $(`[data-act="matchL"][data-i="${i}"]`), b = $(`[data-act="matchR"][data-i="${t.answer[i]}"]`);
        [a, b].forEach((el) => { if (!el) return; el.classList.remove('sel'); if (!el.classList.contains('is-wrong')) el.classList.add('is-right'); const m = $('.mbadge', el); if (m) m.textContent = 'ABCD'[i]; });
      });
    }
    if (t.verb === 'blank') {
      const slot = $('#blankslot');
      if (slot) { slot.textContent = t.options[t.answer].label; slot.classList.add('filled'); }
    }
    if (t.verb === 'word') {
      const el = $(`.wordbtn[data-i="${t.answer}"]`);
      if (el && !$('.wordfix')) el.insertAdjacentHTML('afterend', `<span class="wordfix">${esc(t.fix)}</span>`);
    }
    if (t.verb === 'compare') $$('.cmp-result').forEach((el) => { el.hidden = false; });
    if (t.verb === 'type') {
      const box = $('.typed');
      if (box) {
        const missed = Run.typed && !isRight(t, Run.choice);
        box.innerHTML = `${missed ? `<s class="was">${esc(t.unit[0] + Run.typed + t.unit[1])}</s>` : ''}<b class="shown">${esc(t.calc.shown)}</b>`;
      }
    }
    if (t.verb === 'dial') {
      const read = $('#dial-read');
      if (read) {
        read.classList.remove('untouched');
        const missed = typeof Run.choice === 'number' && !isRight(t, Run.choice);
        read.innerHTML = `${missed ? `<s class="was">${esc(dialText(t, Run.choice))}</s> ` : ''}<b class="shown">${esc(dialText(t, t.calc.value))}</b>`;
      }
      const dl = $('#dial'); if (dl) dl.value = t.calc.value;
    }
    if (t.verb === 'arrows') {
      t.rows.forEach((row, r) => {
        const el = $(`.segbtn[data-r="${r}"][data-v="${row.answer}"]`);
        if (el) el.classList.add('is-right');
        const picked = Run.arrows[r];
        if (picked && picked !== row.answer) { const w = $(`.segbtn[data-r="${r}"][data-v="${picked}"]`); if (w) w.classList.add('is-wrong'); }
      });
    }
    if (t.verb === 'badcell') {
      const row = $(`.rt-row[data-i="${t.answer}"]`);
      if (row && !$('.rt-fix', row)) { const last = row.lastElementChild; last.innerHTML = `<s>${esc(last.textContent)}</s> <b class="rt-fix">${esc(t.fix)}</b>`; }
    }
    if (t.verb === 'pile') {
      const c = t.cards[Run.pileAt];
      if (c) { const el = $(`.stampbtn[data-v="${c.bin}"]`); if (el) el.classList.add('is-right'); }
    }
    if (t.verb === 'frq') {
      t.blanks.forEach((b, i) => {
        const el = $(`.blankslot[data-b="${i}"]`); if (!el) return;
        const right = b.options[b.answer];
        if (Run.frq[i] != null && Run.frq[i] !== b.answer) el.classList.add('was-wrong');
        el.textContent = right; el.classList.remove('active'); el.classList.add('filled');
      });
      const o = $('#frqopts'); if (o) o.remove();
    }
    if (t.verb === 'bars') { const m = $(`.barwrap[data-mk="${t.answer}"]`); if (m) m.classList.add('is-right'); }
    if (t.verb === 'wave') showZones(t);
    if (t.verb === 'label') { t.steps.forEach((st) => writeSpot(t, st, true)); $$('.labelopts').forEach((el) => el.remove()); }
    if (t.verb === 'grab') {
      t.options.forEach((o, i) => {
        const el = $(`.chip[data-i="${i}"]`); if (!el) return;
        if (!el.classList.contains('is-wrong')) el.classList.add(t.answer.includes(i) ? 'is-right' : 'is-other');
        const tag = $('.chip-tag', el); if (tag) tag.textContent = o.tag || '';
      });
    }
    if (t.verb === 'build') {
      fillSlot(0, t.answer[0], true); fillSlot(1, t.answer[1], true);
      t.answer.forEach((i) => { const el = $(`.tile[data-i="${i}"]`); if (el) el.classList.add('is-right'); });
    }
    if (t.verb === 'town') moveTownPerson(t);
    if (t.verb === 'flow') {
      runFlowToken(t.answer);
      const a = $(`.arrow[data-arrow="${t.answer}"]`); if (a) a.classList.add('is-right');
      $$('.arrows .opt').forEach((el, i) => { const lab = $('.opt-label', el); if (lab) lab.textContent = `${i + 1}: ${t.options[i].label}`; });
    }
    if (t.verb === 'chart') {
      const svg = $('.chart'); if (svg) svg.classList.add('revealed');
      if (t.chart.kind === 'cycle' && t.chart.pickOne) { const m = $(`.mk[data-mk="${t.answer}"]`); if (m) m.classList.add('is-right'); }
    }
  }
  /* wave: where the right zones are, drawn behind the curve */
  function showZones(t) {
    const svg = $('.chart'); if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    const anchor = svg.querySelector('.pot');
    t.zones.forEach(([a, b]) => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('class', 'zone');
      r.setAttribute('x', cx(a)); r.setAttribute('width', cx(b) - cx(a)); r.setAttribute('y', CT); r.setAttribute('height', CH - CB - CT);
      svg.insertBefore(r, anchor);
    });
  }
  /* label: the lit spot, and the name once it is known */
  function lightSpot(t) {
    $$('.current').forEach((el) => el.classList.remove('current'));
    const st = t.steps[Run.li]; if (!st) return;
    const el = t.diagram === 'cycle' ? $(`.mk.spot[data-mk="${st.spot}"]`) : $(`.labelspot[data-spot="${st.spot}"]`);
    if (el) el.classList.add('current');
  }
  function writeSpot(t, st, all) {
    const name = t.options[st.answer].label;
    if (t.diagram === 'cycle') {
      const m = t.chart.markers[st.spot];
      const svg = $('.chart'), el = $(`.mk.spot[data-mk="${st.spot}"]`);
      if (!svg || !el || el.dataset.named) return;
      el.dataset.named = '1'; el.classList.add('done');
      const X = cx(m.x), Y = cy(B.wave.actual(m.x, t.chart.phi));
      const ns = 'http://www.w3.org/2000/svg', tx = document.createElementNS(ns, 'text');
      tx.setAttribute('class', 'lab spotlab'); tx.setAttribute('x', Math.min(Math.max(X, CL + 50), CW - CR - 50)); tx.setAttribute('y', Y > (CH - CB) * 0.6 ? Y - 26 : Y + 38); tx.setAttribute('text-anchor', 'middle');
      tx.textContent = name;
      svg.appendChild(tx);
      return;
    }
    const el = $(`.labelspot[data-spot="${st.spot}"]`);
    if (!el) return;
    el.classList.add('done');
    const tx = $('.spotname', el), tx2 = $('.spotname2', el);
    if (tx && tx2) {
      const [one, two] = name.split(' ');
      tx.textContent = one; tx2.textContent = two || '';
      tx.setAttribute('y', Number(tx2.getAttribute('y')) - 28);
    }
    const badge = $('.arrow-num', el);
    if (badge) badge.textContent = '\u2713';
  }
  function fillSlot(s, tileIndex, right) {
    const t = Run.t, slot = $(`.slot[data-s="${s}"]`);
    if (!slot) return;
    const lab = t.tiles[tileIndex].label;
    slot.textContent = lab;
    slot.classList.add('filled');
    if (right) slot.classList.add('is-right');
  }

  /* verdict: every answer waits for Next. The clock only runs during a task, so there is always time to read why. */
  function showVerdict(v) {
    const slot = $('#verdict-slot'); if (!slot) return;
    const t = Run.t;
    const face_ = face(v.right ? 'glad' : 'mad');
    const showWork = t.work && t.work !== t.why && !(v.right && !['pick', 'build', 'town', 'type', 'dial', 'rows'].includes(t.verb));
    const work = showWork ? `<p class="v-work">${esc(t.work)}</p>` : '';
    const said = v.right ? '' : youSaid(t, Run.choice);
    const ans = v.right ? '' : `${said ? `<p class="v-you">You said: ${esc(said)}</p>` : ''}<p class="v-ans">The answer: <b>${esc(answerText(t))}</b></p>`;
    const pickedText = !v.right && t.verb === 'pick' && v.picked != null && t.options[v.picked] ? t.options[v.picked].why : !v.right && t.verb === 'type' ? Run.typedWhy : '';
    const pickedWhy = pickedText ? `<p class="v-why small">${esc(pickedText)}</p>` : '';
    const tag = v.amount ? `<span class="v-amt${v.right ? '' : ' bad'}">${esc(v.amount)}</span>` : '';
    const nextBtn = `<button type="button" class="btn main v-next" data-act="next">${esc(v.next || 'Next')}</button>`;
    slot.innerHTML = `<aside class="verdict ${v.right ? 'right' : 'wrong'}">
      ${face_}
      <div class="v-text"><p class="v-head"><b>${esc(v.head)}</b>${tag}</p>${ans}${pickedWhy}<p class="v-why">${esc(!v.right && Run.whyOverride ? Run.whyOverride : t.why)}</p>${work}${v.note ? `<p class="v-note">${esc(v.note)}</p>` : ''}</div>
      ${nextBtn}
    </aside>`;
    Run.onNext = v.onNext;
    const nb = $('.v-next');
    if (nb) { lock(350); try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); } }
    if (!v.right) { const task = $('.task'); if (task && !reduced() && task.animate) task.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
    const vd = $('.verdict'); if (vd && vd.scrollIntoView) { try { vd.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
  }
  function goNext() {
    clearTimers();
    document.body.classList.remove('answered');
    const fn = Run.onNext; Run.onNext = null;
    if (fn) fn();
  }

  /* ================= HUD and tray ================= */
  function renderHud() {
    const h = $('#hud'); if (!h) return;
    if (S.mode === 'solo' && S.solo && (S.screen === 'task' || S.screen === 'promo' || S.screen === 'bossintro')) {
      const so = S.solo, rk = RANKS[so.rank];
      const slips = [0, 1, 2].map((i) => `<i class="slip ${i < so.slips ? 'on' : ''}"></i>`).join('');
      const streak = B.streakMult(so.streak) > 1 ? `<span class="hud-streak">×${B.streakMult(so.streak)} streak</span>` : '';
      h.hidden = false;
      h.className = 'hud solo';
      h.innerHTML = `<div class="hud-rank"><b>${esc(so.overtime ? 'Overtime' : rk.name)}</b><span>${so.boss ? 'The Release' : so.overtime ? 'No promotions left' : `Task ${Math.min(so.inRank + 1, 6)} of 6`}</span></div>
        <div class="hud-slips" role="img" aria-label="Pink slips: ${so.slips} of 3"><div class="slips">${slips}</div><span>${so.slips} of 3 pink slips</span></div>
        <div class="hud-money"><span class="hud-lab">Pay</span><b id="hud-pay">${fmt.usd(so.pay)}</b><span>CPI ${so.cpi}${streak}</span></div>`;
      return;
    }
    if (S.mode === 'class' && S.cup && ['task', 'call', 'turnend', 'half', 'final'].includes(S.screen)) { renderScoreboard(h); return; }
    if (S.mode === 'train' && S.screen === 'task' && S.train) {
      h.hidden = false; h.className = 'hud solo';
      h.innerHTML = `<div class="hud-rank"><b>Training room</b><span>No clock, no pink slips</span></div><div class="hud-money"><b>${S.train.right} of ${S.train.total}</b><span>right so far</span></div>`;
      return;
    }
    if (S.screen === 'review' && S.solo) {
      h.hidden = false; h.className = 'hud solo';
      const so = S.solo;
      h.innerHTML = `<div class="hud-rank"><b>Review my misses</b><span>No clock, no pay</span></div><div class="hud-money"><b>${so.reviewAt + 1} of ${so.misses.length}</b><span>${so.second.right} right so far</span></div>`;
      return;
    }
    h.hidden = true;
    h.innerHTML = '';
  }
  function renderTray(spec) {
    const f = $('#tray'); if (!f) return;
    if (!spec) { f.hidden = true; f.innerHTML = ''; return; }
    f.hidden = false;
    f.innerHTML = `<p class="doline">${esc(spec.line)}</p>${spec.extra || ''}${spec.main ? `<button type="button" class="btn main" data-act="${esc(spec.act)}">${esc(spec.main)}</button>` : ''}`;
  }
  function setScreen(name, wallName, html, tray) {
    clearTimers();
    Clock.hide();
    document.body.classList.remove('answered');
    S.screen = name;
    calcToggle(false);
    wall(wallName);
    stage().innerHTML = html;
    stage().scrollTop = 0;
    renderHud();
    renderTray(tray || null);
    lock(350);
    Sound.undip();
    soundScene();
    paintAudio();
  }

  /* paper confetti: DOM pieces, gone in under 3 seconds */
  function confetti(n) {
    if (reduced()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['var(--paper)', 'var(--slip)', 'var(--bond)', '#7DE2C0'];
    for (let i = 0; i < (n || 34); i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.style.animationDuration = 1.2 + Math.random() * 0.8 + 's';
      p.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  /* ================= home ================= */
  function home() {
    S.mode = null;
    const cupSaved = loadCup();
    const best = prefs.best ? `<p class="bestline">Your best: <b>${fmt.usd(prefs.best.real)} real pay</b>, ${esc(prefs.best.rank)}</p>` : '';
    const resume = cupSaved ? `<button type="button" class="resume" data-act="cup-resume">Keep playing the Five Towns Cup: round ${cupSaved.round + 1} of ${cupSaved.rounds}</button>` : '';
    setScreen('home', 'home', `<section class="home">
      <div class="timecard" aria-hidden="true">
        <p class="tc-org">Five Towns Bureau of Statistics</p>
        <div class="tc-row"><span>Employee</span><b>You</b></div>
        <div class="tc-row"><span>Job</span><b>Count the economy</b></div>
        <div class="tc-row tall"><span>Status</span></div>
        <span class="logo-stamp">Still Employed</span>
      </div>
      <h1 class="vh">Still Employed</h1>
      <p class="home-lede">Your first job. Count the economy. Three pink slips and you are fired.</p>
      <p class="home-mix">${B.VERBS.length} kinds of questions and over ${fmt.num(Math.floor(B.totalTasks() / 100) * 100)} tasks. Every shift deals a new random mix.</p>
      ${resume}
      <div class="modes">
        <button type="button" class="mode" data-act="solo-start" id="go-solo"><b>Play on my own</b><span>Phone or laptop. About 15 minutes.</span></button>
        <button type="button" class="mode alt" data-act="cup-setup" id="go-class"><b>Play as a class</b><span>Project it. Town against town.</span></button>
      </div>
      ${best}
      <div class="home-tools">
        <button type="button" class="linkbtn" data-act="train-menu">Practice a topic, no clock</button>
        ${prefs.lastCard ? '<button type="button" class="linkbtn" data-act="last-card">See my last card</button>' : ''}
        <button type="button" class="linkbtn" data-act="toggle-extra" aria-pressed="${prefs.extra}">Extra time: ${prefs.extra ? 'on' : 'off'}</button>
        <button type="button" class="linkbtn" data-act="toggle-music"></button>
        <button type="button" class="linkbtn" data-act="toggle-sfx"></button>
      </div>
      <p class="home-foot">AP Macro, Unit 2. The Bureau is made up.</p>
    </section>`, null);
  }

  /* ================= Solo ================= */
  const TASKS_PER_RANK = 6;
  const BOSS_AT = { 1: 0, 3: 1, 5: 3 }; // rank: boss tier
  const PERKS = [
    { id: 'coffee', name: 'Extra coffee', text: 'Every clock runs 30% longer this rank.' },
    { id: 'cheat', name: 'Cheat sheet', text: 'Math tasks show the formula this rank.' },
    { id: 'second', name: 'Second opinion', text: 'One wrong answer is crossed out on most tasks this rank.' },
    { id: 'overtime', name: 'Overtime', text: 'Pay doubles this rank. Clocks run 15% faster.' },
    { id: 'cola', name: 'Cost-of-living raise', text: 'Your pay rises with prices this rank, so misses do not raise your CPI.' },
    { id: 'lunch', name: 'Long lunch', text: 'Skip one task this rank. No pay, no pink slip.' },
  ];

  function newRun() {
    const seed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const r = B.rng(seed);
    const seen = new Set(prefs.seen || []);
    S.mode = 'solo';
    S.solo = {
      r, sch: B.scheduler(r, { seen }), seen, rank: 0, inRank: 0, slips: 0, pay: 0, cpi: 100, streak: 0, bestStreak: 0, right: 0, total: 0,
      byDesk: {}, misses: [], perk: null, lunchUsed: false, boss: null, bossRight: 0, overtime: false, startedAt: Date.now(), status: null, bonus: 0, second: { right: 0, total: 0, skipped: 0 }, reviewAt: 0,
    };
  }
  function soloStart() {
    if (!prefs.practiced) { orientation(); return; }
    newRun();
    soloNext();
  }
  function orientation() {
    S.mode = 'solo-intro';
    setScreen('orientation', 'home', `<section class="sheet">
      <div class="sheet-head">${face('neutral')}<div><h1 class="big">Welcome to the Bureau.</h1><p>I am the Commissioner. Here is the job.</p></div></div>
      <ol class="rules">
        <li><b>Do each task before the clock runs out.</b> A clock bar runs across the top. It stops after you answer, and nothing moves on until you tap Next. Fast answers, streaks, and math tasks pay more.</li>
        <li><b>Miss one and you get a pink slip.</b> That is a firing notice. Three and you are fired. Every promotion tears one up.</li>
        <li><b>Every miss also raises your CPI 10 points,</b> and it never comes back down. Your score is your real pay: pay ÷ CPI × 100.</li>
      </ol>
      <p class="sheet-note">Start as an Intern. Try to make Commissioner. Every shift deals a new random mix, and you never need to see them all to win.</p>
    </section>`, { line: 'Try one task first. It does not count.', main: 'Try one', act: 'practice' });
  }
  function practiceTask() {
    prefs.practiced = true; savePrefs();
    S.mode = 'solo-intro';
    const t = B.oneTask('counted', 'slice', B.rng(Date.now() >>> 0));
    startTask(t, { hints: true, banner: 'Practice. This one does not count.' }, (correct) => {
      if (!correct) revealAnswer(t);
      showVerdict({ right: correct, head: correct ? 'Right. That is the job.' : 'That would be a pink slip.', next: 'Clock in', onNext: () => { newRun(); soloNext(); } });
    });
  }
  function soloNext() {
    const so = S.solo;
    if (so.slips >= 3) { fired(); return; }
    if (so.boss && so.boss.at < so.boss.steps.length) { runBossStep(); return; }
    if (so.boss) { finishBoss(); return; }
    if (so.overtime) { runSoloTask(so.sch.next(5)); return; }
    if (so.inRank < TASKS_PER_RANK) { runSoloTask(so.sch.next(so.rank)); return; }
    if (BOSS_AT[so.rank] != null && !so['bossDone' + so.rank]) { bossIntro(BOSS_AT[so.rank]); return; }
    if (so.rank >= RANKS.length - 1) { soloWin(); return; }
    promotion();
  }
  function clockFor(t, boss) {
    const so = S.solo, rk = RANKS[so.overtime ? 5 : so.rank];
    let c = t.clock * rk.speed;
    if (so.perk === 'coffee') c *= 1.3;
    if (so.perk === 'overtime') c *= 0.85;
    if (prefs.extra) c *= 1.5;
    if (boss) c *= 1.25;
    if (so.overtime) c *= 0.9;
    return Math.max(4, c);
  }
  function runSoloTask(t) {
    const so = S.solo, rk = RANKS[so.rank];
    startTask(t, {
      clock: clockFor(t, false), hints: rk.hints, formula: so.perk === 'cheat', strike: so.perk === 'second',
      skip: so.perk === 'lunch' && !so.lunchUsed,
    }, (correct, choice, left) => soloAnswered(t, correct, choice, left, false));
  }
  function deskStat(so, t, correct) {
    const d = so.byDesk[t.desk] = so.byDesk[t.desk] || { r: 0, n: 0 };
    d.n++; if (correct) d.r++;
  }
  function saveSeen() {
    prefs.seen = Array.from(S.solo.seen).slice(-2000);
    savePrefs();
  }
  function soloAnswered(t, correct, choice, left, boss) {
    const so = S.solo, rk = RANKS[so.rank];
    if (!t.again) { so.total++; if (correct) so.right++; deskStat(so, t, correct); }
    if (!boss) so.inRank++;
    if (correct) {
      so.streak++;
      so.bestStreak = Math.max(so.bestStreak, so.streak);
      const perkMult = so.perk === 'overtime' ? 2 : 1;
      const overtimeMult = so.overtime ? 1.5 : 1;
      const amount = B.payFor({ base: rk.base * perkMult * overtimeMult, mult: t.pay * (boss ? 1.25 : 1), left, streak: so.streak });
      so.pay += amount;
      if (boss) so.boss.right++;
      renderHud();
      const hot = so.streak >= 5 && so.streak % 5 === 0;
      showVerdict({ right: true, head: hot ? lineFor('hot') : lineFor('right'), amount: '+' + fmt.usd(amount), onNext: soloNext });
    } else {
      revealAnswer(t);
      so.streak = 0;
      const cola = so.perk === 'cola';
      if (!boss) so.slips++;
      if (!cola) so.cpi += 10;
      if (!so.misses.some((m) => m.id === t.id)) so.misses.push(t);
      if (!boss && !t.again) so.sch.miss(t);
      so.lastStraw = { text: t.text || t.order, answer: answerText(t) };
      renderHud();
      const chip = cola ? 'Your CPI stays put' : 'Your CPI +10';
      showVerdict({ right: false, head: boss ? 'Wrong number.' : `${lineFor('wrong')} Pink slip ${so.slips} of 3.`, amount: chip, picked: typeof choice === 'number' ? choice : null, onNext: soloNext });
    }
    saveSeen();
  }
  function promotion() {
    const so = S.solo;
    so.rank++; so.inRank = 0; so.perk = null; so.lunchUsed = false;
    const tore = so.slips > 0;
    if (tore) so.slips--;
    const offer = B.shuffle(so.r, PERKS).slice(0, 3);
    S.screen = 'promo';
    Sound.play('promoted', { level: so.rank, tore });
    setScreen('promo', 'promo', `<section class="sheet promo">
      <span class="promo-stamp">Promoted</span>
      <h1 class="big">${esc(RANKS[so.rank].name)}</h1>
      <p class="promo-line">${tore ? 'One pink slip torn up. ' : ''}You earn more per task now, and the clocks get a little shorter.</p>
      <h2 class="q">Pick one perk for this rank</h2>
      <div class="perks">${offer.map((p, i) => `<button type="button" class="perk" data-act="perk" data-id="${p.id}" data-key="${i + 1}"><kbd>${i + 1}</kbd><b>${esc(p.name)}</b><span>${esc(p.text)}</span></button>`).join('')}</div>
    </section>`, { line: 'Pick one perk for this rank.' });
    confetti();
  }
  function choosePerk(id) {
    S.solo.perk = id;
    soloNext();
  }
  function bossIntro(tier) {
    const so = S.solo;
    const steps = B.boss(tier, so.r);
    so.boss = { tier, steps, at: 0, right: 0 };
    so.boss.waiting = true;
    const title = steps[0].title;
    const frq = tier >= 3;
    setScreen('bossintro', 'boss', `<section class="sheet bossintro">
      <p class="boss-clock" aria-hidden="true">8:29</p>
      <h1 class="big">${esc(title)}</h1>
      <p>${frq ? 'One country, five parts, like the free-response question on Monday. Each answer leads to the next. Scrap paper and a calculator are fine.' : `The numbers go out at 8:30. ${steps.length} steps, and each one leads to the next. Scrap paper and a calculator are fine.`}</p>
      <p class="sheet-note">A wrong step does not get a pink slip, but your prices jump. Get every step right and one pink slip is torn up, plus a bonus.</p>
    </section>`, { line: 'Read the numbers on the next screen, then go.', main: 'Start the release', act: 'boss-go' });
  }
  function runBossStep() {
    const so = S.solo, b = so.boss;
    const t = b.steps[b.at];
    b.at++;
    startTask(t, { clock: clockFor(t, true), hints: false, formula: so.perk === 'cheat', strike: so.perk === 'second', boss: true },
      (correct, choice, left) => { if (correct) b.right++; soloAnswered(t, correct, choice, left, true); });
  }
  function finishBoss() {
    const so = S.solo, b = so.boss;
    const clean = b.right >= b.steps.length;
    const bonus = clean ? RANKS[so.rank].base * 5 : 0;
    so['bossDone' + so.rank] = true;
    so.boss = null;
    if (clean) { so.pay += bonus; if (so.slips > 0) so.slips--; }
    if (clean) { Sound.play('release', { level: so.rank }); confetti(20); }
    setScreen('bossdone', 'boss', `<section class="sheet bossintro">
      <p class="boss-clock" aria-hidden="true">8:30</p>
      <h1 class="big">${clean ? 'Clean release.' : 'It went out.'}</h1>
      <p>${clean ? `Every step right. Bonus: ${fmt.usd(bonus)}. One pink slip torn up.` : `You got ${b.right} of ${b.steps.length} steps right. The Commissioner has notes.`}</p>
    </section>`, { line: 'Back to your desk.', main: 'Next', act: 'solo-next' });
  }
  function fired() {
    const so = S.solo;
    Sound.play('fired');
    setScreen('fired', 'fired', `<section class="sheet fired">
      <h1 class="huge">You are fired.</h1>
      ${so.lastStraw ? `<article class="firing"><p class="firing-h">Reason for firing</p><p>${esc(so.lastStraw.text)}</p><p class="firing-a">The answer was: <b>${esc(so.lastStraw.answer)}</b></p></article>` : ''}
      <div class="sheet-head">${face('mad')}<p>Three pink slips, ${esc(RANKS[so.rank].name)}. Clean out your desk. One last question for the survey: are you looking for a new job?</p></div>
      <div class="twochoice">
        <button type="button" class="stampbtn go" data-act="status" data-v="look" data-key="1"><kbd>1</kbd><span>Yes, I am looking</span></button>
        <button type="button" class="stampbtn no" data-act="status" data-v="quit" data-key="2"><kbd>2</kbd><span>No, I give up</span></button>
      </div>
    </section>`, { line: 'Answer the survey.' });
  }
  function statusChosen(v) {
    const so = S.solo;
    so.status = v;
    const look = v === 'look';
    setScreen('status', 'fired', `<section class="sheet fired">
      <h1 class="big">${look ? 'You count as unemployed.' : 'You are not in the labor force.'}</h1>
      <div class="statusmap" aria-hidden="true">
        <div class="sm-box"><b>Employed</b></div>
        <div class="sm-box ${look ? 'here' : ''}"><b>Unemployed</b>${look ? '<i class="dot me2"></i>' : ''}</div>
        <div class="sm-box ${look ? '' : 'here'}"><b>Not in the labor force</b>${look ? '' : '<i class="dot me2"></i>'}</div>
      </div>
      <p>${look ? 'No job, available, and looking. You are between jobs, so this is frictional unemployment.' : 'No job, and you are not looking, so you are not in the labor force. If you gave up because you think there are no jobs, you are a discouraged worker. The unemployment rate does not count you at all.'}</p>
    </section>`, { line: 'Now see what your pay was worth.', main: 'Go to payday', act: 'payday' });
  }
  function soloWin() {
    const so = S.solo;
    Sound.play('win', { level: 5 });
    setScreen('win', 'promo', `<section class="sheet promo">
      <span class="promo-stamp">Still Employed</span>
      <h1 class="huge">Commissioner.</h1>
      <p class="promo-line">You ran the whole Bureau, ${so.right} of ${so.total} tasks right, out of over ${Math.floor(B.totalTasks() / 100) * 100} in the building. Clock out now, or keep going for more pay at top speed.</p>
      <button type="button" class="linkbtn dark" data-act="overtime">Keep going: overtime, until you are fired</button>
    </section>`, { line: 'Your shift is done.', main: 'Clock out and go to payday', act: 'payday' });
    confetti(50);
  }
  function startOvertime() {
    const so = S.solo;
    so.overtime = true; so.perk = null;
    soloNext();
  }

  /* Payday: the student works out their own real pay. */
  function payday() {
    const so = S.solo;
    const noMath = so.cpi === 100 || so.pay < 200;
    if (noMath) {
      so.real = B.realPayOf(so.pay, so.cpi);
      const line = so.cpi === 100 ? 'No pink slips ever raised your prices, so your real pay equals your pay.' : 'Your pay was too small to bother with the math. Your real pay is about the same.';
      setScreen('payday', 'promo', `<section class="sheet"><h1 class="big">Payday</h1><p class="bigline">${fmt.usd(so.pay)}</p><p>${esc(line)}</p></section>`, { line: 'See your report.', main: 'See my report', act: 'report' });
      return;
    }
    const q = B.realPayQuestion(so.pay, so.cpi, so.r);
    so.payQ = q;
    setScreen('payday', 'promo', `<section class="sheet" id="payq">
      <h1 class="big">Payday</h1>
      <div class="payrow"><div><span>Your pay</span><b>${fmt.usd(so.pay)}</b></div><div><span>Your CPI</span><b>${so.cpi}</b></div></div>
      <h2 class="q">What is your real pay? Get it right for a $250 bonus.</h2>${calcBtn()}
      <p class="sheet-note">Rounded to the nearest $10.</p>
      <div class="nums">${q.options.map((o, i) => `<button type="button" class="opt" data-act="payq" data-i="${i}" data-key="${i + 1}"><kbd>${i + 1}</kbd><span class="opt-text"><span class="opt-label">${esc(o.label)}</span></span></button>`).join('')}</div>
      <div id="payq-v" aria-live="polite"></div>
    </section>`, { line: 'Tap your answer.' });
  }
  function payAnswered(i) {
    const so = S.solo, q = so.payQ;
    if (so.payDone) return;
    so.payDone = true;
    const right = i === q.answer;
    so.bonus = right ? 250 : 0;
    so.payRight = right;
    so.real = q.value + so.bonus;
    $$('[data-act="payq"]').forEach((el, k) => { el.disabled = true; if (k === q.answer) el.classList.add('is-right'); else if (k === i) el.classList.add('is-wrong'); });
    Sound.play(right ? 'right' : 'miss');
    $('#payq-v').innerHTML = `<p class="v-why">${right ? 'Right. +$250.' : esc(q.options[i].why)}</p><p class="v-work">${esc(q.work)}</p>`;
    renderTray({ line: 'See your report.', main: 'See my report', act: 'report' });
    lock(350);
  }
  function report() {
    const so = S.solo;
    const rankName = so.overtime ? 'Commissioner, on overtime' : RANKS[so.rank].name;
    const isBest = !prefs.best || so.real > prefs.best.real;
    if (isBest) { prefs.best = { real: so.real, rank: rankName }; savePrefs(); }
    const nMiss = so.misses.length;
    setScreen('report', 'home', `<section class="sheet">
      <h1 class="big">Your shift report</h1>
      <div class="payrow three"><div><span>Real pay</span><b>${fmt.usd(so.real)}</b></div><div><span>Highest job</span><b class="small">${esc(rankName)}</b></div><div><span>Tasks right</span><b>${so.right} of ${so.total}</b></div></div>
      ${isBest ? '<p class="newbest">New personal best.</p>' : `<p class="sheet-note">Your best: ${fmt.usd(prefs.best.real)} real pay.</p>`}
      <div class="report-actions"><button type="button" class="btn ghost" data-act="solo-again">Clock back in</button></div>
    </section>`, { line: nMiss ? `Answer your ${nMiss === 1 ? 'miss' : nMiss + ' misses'} again to get your card.` : 'Get your card to show your teacher.', main: nMiss ? 'Fix my misses' : 'Get my card', act: 'name' });
  }
  function nameScreen() {
    setScreen('name', 'home', `<section class="sheet">
      <h1 class="big">Your name for the card</h1>
      <label class="namefield"><span class="vh">Your name</span><input id="student-name" type="text" maxlength="40" autocomplete="name" value="${esc(prefs.name)}" placeholder="First and last name"></label>
      <p class="sheet-note">Nothing is sent anywhere. The name only goes on your screen.</p>
    </section>`, { line: 'Type your name, then tap Continue.', main: 'Continue', act: 'name-go' });
    const inp = $('#student-name'); if (inp) inp.focus();
  }
  function startReview() {
    const so = S.solo, inp = $('#student-name');
    so.name = (inp && inp.value.trim()) || 'No name';
    prefs.name = so.name === 'No name' ? '' : so.name; savePrefs();
    so.reviewAt = 0;
    so.second = { right: 0, total: 0, skipped: 0 };
    reviewStep();
  }
  function reviewStep() {
    const so = S.solo;
    if (so.reviewAt >= so.misses.length) { showCard(); return; }
    S.mode = 'solo';
    const t = so.misses[so.reviewAt];
    startTask(Object.assign({}, t), { hints: false, skipReview: true }, (correct, choice) => {
      S.screen = 'review';
      so.second.total++;
      if (correct) so.second.right++;
      else revealAnswer(t);
      renderHud();
      showVerdict({ right: correct, head: correct ? 'Right this time.' : 'Not yet. Read why.', picked: typeof choice === 'number' ? choice : null, next: so.reviewAt + 1 < so.misses.length ? 'Next miss' : 'Get my card', onNext: () => { so.reviewAt++; reviewStep(); } });
    });
    S.screen = 'review';
    renderHud();
    soundScene();
  }
  function skipMiss(el) {
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Tap again to skip it'; return; }
    const so = S.solo;
    so.second.skipped++;
    so.reviewAt++;
    Run.done = true;
    reviewStep();
  }
  function cardHTML() {
    const so = S.solo;
    const when = new Date(so.startedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const rankName = so.overtime ? 'Commissioner, on overtime' : RANKS[so.rank].name;
    const pct = so.total ? Math.round(so.right / so.total * 100) : 0;
    const bars = Object.keys(DESKS).filter((d) => so.byDesk[d]).map((d) => {
      const x = so.byDesk[d];
      return `<div class="cbar"><span class="cb-name">${esc(DESKS[d].code)} ${esc(DESKS[d].name)}</span><span class="cb-track"><i style="width:${Math.round(x.r / x.n * 100)}%" data-desk="${d}"></i></span><span class="cb-val">${x.r} of ${x.n}</span></div>`;
    }).join('');
    const second = so.misses.length ? `${so.second.right} of ${so.misses.length} fixed on the second try${so.second.skipped ? `, ${so.second.skipped} skipped` : ''}` : 'No misses to fix';
    return `<article class="card" id="rcard">
      <header><span class="card-stamp">${so.status ? 'Fired' : 'Still Employed'}</span><p class="card-org">Five Towns Bureau of Statistics</p><h1>${esc(so.name || 'No name')}</h1><p class="card-when">${esc(when)}</p></header>
      <div class="card-nums"><div><span>Real pay</span><b>${fmt.usd(so.real)}</b></div><div><span>Highest job</span><b class="small">${esc(rankName)}</b></div><div><span>Tasks right</span><b>${so.right} of ${so.total}</b><em>${pct}%</em></div><div><span>Pay and prices</span><b class="small">${fmt.usd(so.pay)}, CPI ${so.cpi}</b></div><div><span>Best streak</span><b>${so.bestStreak}</b></div><div><span>Second tries</span><b class="small">${esc(second)}</b></div></div>
      <div class="cbars">${bars}</div>
    </article>`;
  }
  const TURNIN = `<div class="turnin"><p><b>To hand in this card</b> (the game does not send it): take a screenshot now, so you have a copy. Then show this screen to your teacher, or upload the screenshot to Schoology if your teacher asks.</p><p><b>Screenshot keys</b></p><ul class="keys"><li>Chromebook: Ctrl + Show windows, the top-row key that shows boxes (saved in Downloads)</li><li>Windows: Windows + Print Screen (saved in Pictures)</li><li>Mac: Shift + Command + 3 (saved on the Desktop)</li><li>iPhone: side button + volume up</li><li>Android: power + volume down</li></ul><p>This card stays saved on this device. Tap See my last card on the start screen to bring it back.</p></div>`;
  function showCard() {
    const html = cardHTML();
    prefs.lastCard = html; savePrefs();
    setScreen('card', 'home', `<section class="sheet cardsheet">${html}${TURNIN}<div class="report-actions"><button type="button" class="btn ghost" data-act="solo-again">Clock back in</button></div></section>`, { line: 'Take a screenshot of your card.', main: 'Home', act: 'home' });
  }
  function lastCard() {
    setScreen('card', 'home', `<section class="sheet cardsheet">${prefs.lastCard || ''}${TURNIN}</section>`, { line: 'Take a screenshot of your card.', main: 'Home', act: 'home' });
  }

  /* ================= training room ================= */
  function trainMenu() {
    S.mode = 'train';
    const buttons = Object.keys(DESKS).map((d, i) => `<button type="button" class="deskbtn" data-act="train-go" data-desk="${d}" data-key="${i + 1}" style="--d:var(--w-${d})"><b>${esc(DESKS[d].code)}</b><span>${esc(DESKS[d].long)}</span></button>`).join('')
      + `<button type="button" class="deskbtn" data-act="train-go" data-desk="${B.DRILL.key}" data-key="${Object.keys(DESKS).length + 1}" style="--d:var(--w-boss)"><b>${esc(B.DRILL.code)}</b><span>${esc(B.DRILL.long)}</span></button>`;
    setScreen('trainmenu', 'home', `<section class="sheet">
      <h1 class="big">Practice a topic</h1>
      <p>No clock and no pink slips. After each task you see why. Anything you miss comes back.</p>
      <div class="desks">${buttons}</div>
    </section>`, { line: 'Tap a topic to start.', extra: '<button type="button" class="linkbtn tray-link" data-act="home">Back</button>' });
  }
  function trainGo(desk) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    S.mode = 'train';
    S.train = { desk, r: B.rng(seed), seen: new Set(), right: 0, total: 0, back: [], n: 0 };
    trainNext();
  }
  function trainNext() {
    const tr = S.train;
    tr.n++;
    let t = null;
    const due = tr.back.findIndex((b) => tr.n >= b.due);
    if (due >= 0) t = tr.back.splice(due, 1)[0].t;
    else t = B.trainingTask(tr.desk, tr.r, tr.seen);
    startTask(t, { hints: true, formula: true, stop: 'train-stop', stopLabel: 'Stop practicing' }, (correct, choice) => {
      tr.total++; if (correct) tr.right++;
      if (!correct) { revealAnswer(t); tr.back.push({ t, due: tr.n + 3 }); }
      renderHud();
      showVerdict({ right: correct, head: correct ? 'Right.' : 'Not this time.', picked: typeof choice === 'number' ? choice : null, onNext: trainNext });
    });
  }
  function trainStop() {
    const tr = S.train;
    setScreen('trainend', 'home', `<section class="sheet"><h1 class="big">${esc((DESKS[tr.desk] || B.DRILL).long)}</h1><p class="bigline">${tr.right} of ${tr.total} right</p><p>Ready? Clock in and try to beat your best real pay.</p><div class="report-actions"><button type="button" class="btn ghost" data-act="train-menu">Practice another topic</button></div></section>`, { line: 'Go back to the start.', main: 'Home', act: 'home' });
  }

  /* ================= the Five Towns Cup (class mode) ================= */
  const TOWNS = ['Cedarhurst', 'Hewlett', 'Inwood', 'Lawrence', 'Woodmere', 'North Woodmere'];
  const TURN_TASKS = 4;
  const FINAL_PAY = 500;
  const STEAL_MS = 8000;
  const CUP_KEY = 'still-employed:cup';
  const CUP_SKIP = ['ap', 'badcell']; // too long for one player's turn on the big screen
  const saveCup = () => { const c = S.cup; if (!c) return; const copy = Object.assign({}, c); delete copy.r; delete copy.sch; delete copy.task; delete copy.finalSteps; store.set(CUP_KEY, JSON.stringify(copy)); };
  const loadCup = () => { try { const c = JSON.parse(store.get(CUP_KEY) || 'null'); return c && c.towns && c.phase !== 'over' ? c : null; } catch (e) { return null; } };
  const clearCup = () => store.set(CUP_KEY, 'null');
  const baseForRound = (r) => [100, 150, 200, 300, 400, 500][Math.min(r, 5)];
  const estMinutes = (n, rounds) => Math.round(n * rounds * 1.8 + 7);

  function cupSetup() {
    S.mode = 'class';
    const chosen = prefs.cupTowns || TOWNS.slice(0, 5);
    S.setup = { towns: chosen.slice(), rounds: prefs.cupRounds || 3 };
    drawSetup();
  }
  function drawSetup() {
    const su = S.setup;
    const chips = TOWNS.map((t) => `<button type="button" class="townchip ${su.towns.includes(t) ? 'on' : ''}" data-act="toggle-town" data-town="${esc(t)}" aria-pressed="${su.towns.includes(t)}">${esc(t)}</button>`).join('');
    const roundBtns = [2, 3, 4, 5].map((r) => `<button type="button" class="townchip ${su.rounds === r ? 'on' : ''}" data-act="set-rounds" data-r="${r}" aria-pressed="${su.rounds === r}">${r}</button>`).join('');
    setScreen('cupsetup', 'home', `<section class="sheet">
      <h1 class="big">The Five Towns Cup</h1>
      <p>Each town is a team of 3 or 4. One player at a time works the Bureau on the big screen, four tasks a turn.</p>
      <h2 class="q">Who is playing?</h2><div class="chipline">${chips}</div>
      <h2 class="q">How many rounds? Every town plays once a round.</h2><div class="chipline">${roundBtns}</div>
      <p class="sheet-note">About ${estMinutes(su.towns.length, su.rounds)} minutes, including the final. Have whiteboards and calculators out for the final.</p>
      <div class="home-tools"><button type="button" class="linkbtn" data-act="toggle-music"></button><button type="button" class="linkbtn" data-act="toggle-sfx"></button><button type="button" class="linkbtn" data-act="home">Back</button></div>
    </section>`, { line: 'Pick the towns and rounds, then start.', main: 'Show the rules', act: 'cup-rules' });
  }
  function cupRules() {
    const su = S.setup;
    if (su.towns.length < 2) return;
    prefs.cupTowns = su.towns; prefs.cupRounds = su.rounds; savePrefs();
    setScreen('cuprules', 'home', `<section class="sheet">
      <h1 class="big">How the Cup works</h1>
      <ol class="rules big-rules">
        <li><b>One player from your town takes the computer.</b> Four tasks, then the next town goes.</li>
        <li><b>Your town can help. Rival towns can shout wrong answers</b> to throw you off. You decide who to trust.</li>
        <li><b>Miss a task and your town's CPI jumps 5 points.</b> Then rivals get eight seconds: the first to shout the right answer steals the pay. The teacher taps that town at the top of the screen.</li>
        <li><b>The winner has the highest real pay.</b> Real pay = pay ÷ CPI × 100. So the money on the board is not the whole story. After the rounds comes a final on whiteboards, for every town.</li>
      </ol>
    </section>`, { line: 'Read this out loud, then start.', main: 'Start the Cup', act: 'cup-start' });
  }
  function cupStart() {
    const su = S.setup;
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const r = B.rng(seed);
    S.cup = {
      seed, towns: su.towns.map((name, i) => ({ name, i, pay: 0, cpi: 100, right: 0, total: 0, steals: 0 })), rounds: su.rounds, round: 0, turn: 0, inTurn: 0, turnStart: null,
      streak: 0, seen: [], missed: {}, phase: 'call', halfDone: false, finalAt: 0,
    };
    S.cup.r = r;
    S.cup.sch = B.scheduler(r, { seen: new Set(), skipVerbs: CUP_SKIP });
    clearCup();
    cupCall();
  }
  function cupEnsure() {
    const c = S.cup;
    if (!c.r) { c.r = B.rng((c.seed + c.round * 31 + c.turn * 7 + 1) >>> 0); c.sch = B.scheduler(c.r, { seen: new Set(c.seen || []), skipVerbs: CUP_SKIP }); }
  }
  function cupResume() {
    const c = loadCup();
    if (!c) { home(); return; }
    S.mode = 'class';
    S.cup = c;
    cupEnsure();
    if (c.phase === 'payday') { cupPayday(); return; }
    if (c.phase === 'final') {
      if (c.finalAt > 0 && c.finalAt < 5) { c.finalSteps = B.boss(3, c.r); finalPart(); return; }
      cupFinalIntro();
      return;
    }
    if (c.phase === 'half') { cupHalf(); return; }
    cupCall();
  }
  function renderScoreboard(h) {
    const c = S.cup;
    h.hidden = false;
    h.className = 'hud cup n' + c.towns.length;
    h.innerHTML = c.towns.map((t, i) => `<button type="button" class="town t${i} ${c.turn === i && c.phase !== 'final' ? 'up' : ''} ${c.stealOpen && i !== c.turn ? 'can-steal' : ''} ${c.finalOpen ? 'can-final' : ''} ${c.finalPicked && c.finalPicked[i] ? 'picked' : ''}" data-act="town-tap" data-i="${i}" style="--t:var(--t${i})">
      <b class="town-name">${esc(t.name)}</b><b class="town-pay">${fmt.usd(t.pay)}</b><span class="town-cpi">CPI ${t.cpi}</span></button>`).join('') + `<button type="button" class="toolsbtn" data-act="tools" aria-label="Teacher tools">Tools</button>`;
  }
  function cupCall() {
    const c = S.cup;
    c.phase = 'call';
    c.inTurn = c.inTurn || 0;
    const t = c.towns[c.turn];
    saveCup();
    setScreen('call', 'home', `<section class="sheet call" style="--t:var(--t${c.turn})">
      <p class="call-round">Round ${c.round + 1} of ${c.rounds}</p>
      <h1 class="huge call-town">${esc(t.name)}</h1>
      <p class="call-line">Send up your next player.</p>
      <p class="sheet-note">Four tasks. Your town can help. Rivals can shout wrong answers.</p>
    </section>`, { line: 'When the player is ready, tap Start.', main: `Start ${t.name}`, act: 'cup-go' });
  }
  function cupGo() {
    const c = S.cup;
    c.phase = 'turn';
    c.turnStart = { pay: c.towns[c.turn].pay, right: 0, cpi: c.towns[c.turn].cpi };
    c.streak = 0;
    c.inTurn = 0;
    cupTask();
  }
  function cupTask() {
    const c = S.cup;
    cupEnsure();
    const rankIndex = Math.min(c.round + 1, RANKS.length - 1);
    const rk = RANKS[Math.min(c.round, 3)];
    const t = c.sch.next(c.round === 0 ? 1 : rankIndex);
    c.task = t;
    c.seen.push(t.id);
    const clock = t.clock * rk.speed;
    startTask(t, { clock, hints: c.round === 0, banner: `${c.towns[c.turn].name}: task ${c.inTurn + 1} of ${TURN_TASKS}` }, (correct, choice, left) => cupAnswered(t, correct, choice, left));
  }
  function cupAnswered(t, correct, choice, left) {
    const c = S.cup, town = c.towns[c.turn], base = baseForRound(c.round);
    town.total++;
    c.inTurn++;
    if (correct) {
      c.streak++;
      town.right++;
      c.turnStart.right++;
      const amount = B.payFor({ base, mult: t.pay, left, streak: c.streak });
      town.pay += amount;
      renderHud();
      saveCup();
      showVerdict({ right: true, head: lineFor('right'), amount: '+' + fmt.usd(amount), onNext: cupAfter });
      return;
    }
    c.streak = 0;
    town.cpi += 5;
    const m = c.missed[t.id] = c.missed[t.id] || { n: 0, desk: t.desk, order: t.order, text: t.text || (t.lines ? t.lines.join(' / ') : ''), answer: answerText(t), why: t.why };
    m.n++;
    openSteal(t, base);
    renderHud();
    saveCup();
  }
  /* The steal: the key stays hidden for a few seconds so a rival can shout it. The teacher taps their town. */
  function openSteal(t, base) {
    const c = S.cup;
    c.stealOpen = true;
    c.stealShown = false;
    c.stealAmount = B.payFor({ base, mult: t.pay, left: 0.5, streak: 0 });
    Sound.play('knock');
    Sound.dipFor(0.3); // the room has to hear who shouted first
    renderHud();
    const slot = $('#verdict-slot');
    slot.innerHTML = `<aside class="verdict steal">
      ${face('mad')}
      <div class="v-text"><p class="v-head"><b>Missed. Rivals, shout the answer!</b><span class="v-amt">${fmt.usd(c.stealAmount)}</span></p><p class="v-why">The first right shout steals the pay. The answer shows when the bar runs out.</p><div class="stealbar"><i id="stealbar"></i></div></div>
      <button type="button" class="btn ghostdark v-next" data-act="no-steal">Show the answer</button>
    </aside>`;
    const bar = $('#stealbar');
    if (bar && bar.animate && !reduced()) bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: STEAL_MS, easing: 'linear', fill: 'forwards' });
    stealTimer = setTimeout(() => closeSteal(null), STEAL_MS);
    lock(300);
  }
  /* The town tabs stay live after the answer shows, so the teacher can check a shout before paying it. */
  function closeSteal(i) {
    Sound.undip();
    const c = S.cup;
    if (!c.stealOpen) return;
    clearTimeout(stealTimer);
    const t = Run.t;
    if (!c.stealShown) { c.stealShown = true; revealAnswer(t); }
    let head = 'The answer. Did a rival shout it first?';
    let note = 'Teacher: tap their town at the top to pay them.';
    if (i != null && i !== c.turn) {
      const thief = c.towns[i];
      thief.pay += c.stealAmount; thief.steals++;
      c.stealOpen = false;
      head = `${thief.name} steals ${fmt.usd(c.stealAmount)}.`;
      note = '';
      Sound.play('steal');
    }
    renderHud();
    saveCup();
    showVerdict({ right: false, head, note, amount: `${c.towns[c.turn].name} CPI +5`, onNext: () => { c.stealOpen = false; c.stealShown = false; renderHud(); cupAfter(); } });
  }
  function cupAfter() {
    const c = S.cup;
    if (c.inTurn >= TURN_TASKS) { cupTurnEnd(); return; }
    cupTask();
  }
  function cupTurnEnd() {
    const c = S.cup, t = c.towns[c.turn], s = c.turnStart;
    const earned = t.pay - s.pay;
    c.phase = 'turnend';
    saveCup();
    const lastTown = c.turn >= c.towns.length - 1;
    const lastRound = c.round >= c.rounds - 1;
    const half = lastTown && !c.halfDone && c.round + 1 === Math.ceil(c.rounds / 2) && !lastRound;
    const nextLine = lastTown ? (lastRound ? 'Everyone has played. Time for the final.' : half ? 'Halfway. Time for a price check.' : 'Next round.') : `${c.towns[c.turn + 1].name} is up next.`;
    setScreen('turnend', 'home', `<section class="sheet call" style="--t:var(--t${c.turn})">
      <h1 class="huge call-town">${esc(t.name)}</h1>
      <div class="payrow three"><div><span>Earned this turn</span><b>${fmt.usd(earned)}</b></div><div><span>Tasks right</span><b>${s.right} of ${TURN_TASKS}</b></div><div><span>Prices now</span><b>CPI ${t.cpi}</b></div></div>
    </section>`, { line: nextLine, main: 'Next', act: 'cup-next' });
    Sound.play('paper');
  }
  function cupNextTurn() {
    const c = S.cup;
    c.inTurn = 0;
    if (c.turn < c.towns.length - 1) { c.turn++; cupCall(); return; }
    c.turn = 0;
    const finishedRound = c.round;
    c.round++;
    if (c.round >= c.rounds) { cupFinalIntro(); return; }
    if (!c.halfDone && finishedRound + 1 === Math.ceil(c.rounds / 2)) { c.halfDone = true; cupHalf(); return; }
    cupCall();
  }
  function cupHalf() {
    const c = S.cup;
    c.phase = 'half';
    saveCup();
    const rows = c.towns.map((t, i) => `<tr style="--t:var(--t${i})"><th scope="row">${esc(t.name)}</th><td>${fmt.usd(t.pay)}</td><td>${t.cpi}</td><td class="realcell">?</td></tr>`).join('');
    setScreen('half', 'home', `<section class="sheet">
      <h1 class="big">Price check</h1>
      <p>Who is really ahead? Work it out on your whiteboards: real pay = pay ÷ CPI × 100.</p>
      <table class="halftable"><thead><tr><th>Town</th><th>Pay</th><th>CPI</th><th>Real pay</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`, { line: 'Give them a minute, then show the real pay.', main: 'Show real pay', act: 'half-show' });
  }
  function halfShow() {
    const c = S.cup;
    $$('.halftable tbody tr').forEach((tr, i) => { const cell = $('.realcell', tr); const t = c.towns[i]; cell.textContent = fmt.usd(B.realPayOf(t.pay, t.cpi)); cell.classList.add('flash'); });
    Sound.play('reveal');
    renderTray({ line: 'Back to work.', main: 'Next round', act: 'cup-call' });
    lock(350);
  }
  function cupFinalIntro() {
    const c = S.cup;
    cupEnsure();
    c.phase = 'final';
    c.finalAt = 0;
    c.finalSteps = B.boss(3, c.r);
    saveCup();
    setScreen('final', 'boss', `<section class="sheet bossintro">
      <p class="boss-clock" aria-hidden="true">8:29</p>
      <h1 class="big">The Big Release</h1>
      <p>Every town at once, on whiteboards. One country, five parts, like Monday's free-response question. Each right part pays ${fmt.usd(FINAL_PAY)}.</p>
    </section>`, { line: 'Whiteboards up. Calculators out.', main: 'Show part (a)', act: 'final-part' });
  }
  function finalPart() {
    const c = S.cup;
    if (!c.finalSteps) c.finalSteps = B.boss(3, c.r);
    const t = c.finalSteps[c.finalAt];
    c.finalPicked = {};
    c.finalOpen = false;
    S.screen = 'final';
    const secs = t.calc ? 90 : 45;
    setScreen('final', 'boss', `<section class="sheet finalpart">
      <p class="tk-part">The Big Release. ${esc(t.part)}</p>
      <h1 class="big">${esc(t.order)}</h1>
      ${t.ask ? `<p class="final-ask">${esc(t.ask)}</p>` : ''}
      <div class="final-grid">${formHTML(tableHTML(t), 'mini')}<div id="final-answer" aria-live="polite"></div></div>
    </section>`, { line: 'Write your answer. Hold it up when the clock ends.', main: 'Show the answer', act: 'final-show' });
    Clock.start(secs, () => { Sound.play('knock'); });
  }
  function finalShow() {
    const c = S.cup, t = c.finalSteps[c.finalAt];
    Clock.hide();
    c.finalOpen = true;
    renderHud();
    const a = t.options[t.answer].label;
    $('#final-answer').innerHTML = `<div class="finalans"><p class="v-head"><b>${esc(a)}</b></p><p class="v-why">${esc(t.why)}</p>${t.work && t.work !== t.why ? `<p class="v-work">${esc(t.work)}</p>` : ''}</div>`;
    Sound.play('reveal');
    const more = c.finalAt < c.finalSteps.length - 1;
    renderTray({ line: `Tap each town that got it right. ${fmt.usd(FINAL_PAY)} each.`, main: more ? 'Next part' : 'Go to payday', act: 'final-next' });
    lock(350);
  }
  function finalNext() {
    const c = S.cup;
    Object.keys(c.finalPicked || {}).forEach((k) => { if (c.finalPicked[k]) c.towns[k].pay += FINAL_PAY; });
    c.finalOpen = false;
    c.finalAt++;
    saveCup();
    if (c.finalAt < c.finalSteps.length) { finalPart(); return; }
    cupPayday();
  }
  /* Payday: first everyone's dollars, then the same bars with prices taken out. The order can flip. */
  function cupPayday() {
    const c = S.cup;
    c.phase = 'payday';
    saveCup();
    const list = c.towns.map((t) => Object.assign({}, t, { real: B.realPayOf(t.pay, t.cpi) }));
    const maxPay = Math.max.apply(null, list.map((t) => t.pay).concat([1]));
    const byPay = list.slice().sort((a, b) => b.pay - a.pay);
    c.paydayList = list;
    setScreen('payday', 'boss', `<section class="sheet paydaysheet">
      <h1 class="big" id="pd-title">Payday: the money</h1>
      <div id="pd-win"></div>
      <p id="pd-line">Here is what each town earned. Now, what can that money actually buy?</p>
      <div class="pd" style="--n:${list.length}">${byPay.map((t, k) => `<div class="pd-row" data-t="${t.i}" style="--t:var(--t${t.i}); --k:${k}"><span class="pd-name">${esc(t.name)}</span><span class="pd-track"><i style="width:${Math.max(3, t.pay / maxPay * 100)}%"></i></span><b class="pd-val">${fmt.usd(t.pay)}</b><small class="pd-work">CPI ${t.cpi}</small></div>`).join('')}</div>
    </section>`, { line: 'Now take the prices out.', main: 'Show real pay', act: 'pd-real' });
    S.screen = 'payday';
  }
  function pdReal() {
    const c = S.cup;
    const list = c.paydayList;
    const maxPay = Math.max.apply(null, list.map((t) => t.pay).concat([1]));
    const byReal = list.slice().sort((a, b) => b.real - a.real);
    const byPay = list.slice().sort((a, b) => b.pay - a.pay);
    byReal.forEach((t, k) => {
      const row = $(`.pd-row[data-t="${t.i}"]`); if (!row) return;
      row.style.setProperty('--k', k);
      $('.pd-track i', row).style.width = Math.max(3, t.real / maxPay * 100) + '%';
      $('.pd-val', row).textContent = fmt.usd(t.real);
      $('.pd-work', row).textContent = `${fmt.usd(t.pay)} ÷ ${t.cpi} × 100`;
    });
    const top = byReal[0];
    const tied = byReal.filter((t) => t.real === top.real);
    const flipped = byPay[0].i !== top.i && byPay[0].pay > byPay[1].pay;
    $('#pd-title').textContent = 'Payday: real pay';
    $('#pd-line').textContent = flipped ? `${byPay[0].name} earned the most dollars. ${top.name}'s dollars bought the most. That is real v. nominal.` : tied.length > 1 ? 'A tie for real pay.' : `${top.name} earned the most and kept the most. Prices did not change the order at the top.`;
    $('#pd-win').innerHTML = `<p class="pd-winner" style="--t:var(--t${top.i})">${tied.length > 1 ? 'Tie: ' + tied.map((t) => esc(t.name)).join(' and ') : esc(top.name) + ' wins the Cup.'}</p>`;
    Sound.play('win', { level: 2 });
    confetti(60);
    c.phase = 'over';
    clearCup();
    const count = Object.keys(c.missed).length;
    renderTray(count ? { line: 'Use the last minutes on what the room missed.', main: 'What the room missed', act: 'room-missed' } : { line: 'A clean game. Nothing to review.', main: 'Home', act: 'home' });
    lock(500);
  }
  function roomMissed() {
    const c = S.cup;
    const entries = Object.values(c.missed).sort((a, b) => b.n - a.n);
    const byDesk = {};
    entries.forEach((m) => { byDesk[m.desk] = (byDesk[m.desk] || 0) + m.n; });
    const worst = Object.keys(byDesk).sort((a, b) => byDesk[b] - byDesk[a])[0];
    setScreen('missed', 'home', `<section class="sheet missedlist">
      <h1 class="big">What the room missed</h1>
      ${worst ? `<p>Most misses: <b>${esc(DESKS[worst].code)} ${esc(DESKS[worst].long)}</b> (${byDesk[worst]}).</p>` : ''}
      <ol class="misses">${entries.map((m) => `<li><span class="m-desk" style="--d:var(--w-${m.desk})">${esc(DESKS[m.desk].code)}</span><div><p class="m-q"><b>${esc(m.order)}</b> ${esc(m.text)}</p><p class="m-a">The answer: <b>${esc(m.answer)}</b>. ${esc(m.why)}</p></div></li>`).join('')}</ol>
    </section>`, { line: 'Go through these out loud.', main: 'Home', act: 'home' });
  }

  /* ---------- teacher tools ---------- */
  function openTools() {
    const c = S.cup; if (!c) return;
    const rows = c.towns.map((t, i) => `<tr><th scope="row">${esc(t.name)}</th><td>${fmt.usd(t.pay)}</td><td><button type="button" class="mini" data-act="fix" data-i="${i}" data-pay="-500">${B.MINUS}$500</button><button type="button" class="mini" data-act="fix" data-i="${i}" data-pay="500">+$500</button></td><td>CPI ${t.cpi}</td><td><button type="button" class="mini" data-act="fix" data-i="${i}" data-cpi="-5">${B.MINUS}5</button><button type="button" class="mini" data-act="fix" data-i="${i}" data-cpi="5">+5</button></td></tr>`).join('');
    const inTask = S.screen === 'task' && !Run.done;
    const m = $('#modal');
    m.hidden = false;
    m.innerHTML = `<div class="modalcard" role="dialog" aria-label="Teacher tools">
      <h2 class="big">Teacher tools</h2>
      <table class="toolstable"><tbody>${rows}</tbody></table>
      <div class="toolrow">
        ${inTask ? '<button type="button" class="btn ghostdark" data-act="tool-skip">Skip this task</button>' : ''}
        <button type="button" class="btn ghostdark" data-act="tool-final">Jump to the final</button>
        <button type="button" class="btn ghostdark" data-act="tool-payday">Jump to payday</button>
        <button type="button" class="btn ghostdark" data-act="toggle-music"></button>
        <button type="button" class="btn ghostdark" data-act="toggle-sfx"></button>
      </div>
      <button type="button" class="btn main" data-act="close-modal">Close</button>
    </div>`;
    paintAudio();
    if (S.screen === 'task' && Clock.on) { Clock.pausedLeft = Clock.left; Clock.on = false; cancelAnimationFrame(Clock.raf); Clock.wasPaused = true; }
  }
  function closeModal() {
    const m = $('#modal');
    m.hidden = true; m.innerHTML = '';
    if (Clock.wasPaused && S.screen === 'task' && !Run.done) {
      Clock.wasPaused = false;
      Clock.on = true; Clock.last = performance.now(); Clock.cb = () => answer(null);
      Clock.raf = requestAnimationFrame(Clock.frame.bind(Clock));
    }
    Clock.wasPaused = false;
  }

  /* ================= events ================= */
  const ACTS = {
    home() { clearCupIfOver(); home(); },
    'solo-start': soloStart,
    practice: practiceTask,
    'solo-next': soloNext,
    next: goNext,
    pick(el) { if (S.screen === 'task' || S.screen === 'review') answer(Number(el.dataset.i)); },
    tile(el) {
      const i = Number(el.dataset.i), t = Run.t;
      if (Run.done || Run.slots.includes(i)) return;
      Run.slots.push(i);
      el.classList.add('used');
      fillSlot(Run.slots.length - 1, i, false);
      if (Run.slots.length === 2) answer(Run.slots.slice());
      else if (t) Sound.play('tap');
    },
    unslot(el) {
      const s = Number(el.dataset.s);
      if (Run.done || Run.slots.length <= s) return;
      const i = Run.slots[s];
      Run.slots.splice(s, 1);
      const tile = $(`.tile[data-i="${i}"]`); if (tile) tile.classList.remove('used');
      el.textContent = ''; el.classList.remove('filled');
    },
    grab(el) {
      const i = Number(el.dataset.i), t = Run.t;
      if (Run.done || Run.got.has(i)) return;
      if (t.answer.includes(i)) {
        Run.got.add(i);
        el.classList.add('is-right');
        if (Run.got.size === t.answer.length) answer('all');
        else Sound.play('check', { step: Run.got.size - 1 });
      } else {
        el.classList.add('is-wrong');
        answer(i);
      }
    },
    orderpick(el) {
      const i = Number(el.dataset.i), t = Run.t;
      if (Run.done || Run.seq.includes(i)) return;
      if (i === t.answer[Run.seq.length]) {
        Run.seq.push(i);
        el.classList.add('is-right');
        const num = $('.ordnum', el); if (num) num.textContent = Run.seq.length;
        if (Run.seq.length === t.answer.length) answer('all');
        else Sound.play('check', { step: Run.seq.length - 1 });
      } else {
        el.classList.add('is-wrong');
        answer(i);
      }
    },
    matchL(el) { matchTap('L', Number(el.dataset.i), el); },
    matchR(el) { matchTap('R', Number(el.dataset.i), el); },
    keypad(el) { typeKey(el.dataset.k); },
    calc() { calcToggle(); Sound.play('tap'); },
    'calc-key'(el) { calcKey(el.dataset.k); },
    'calc-close'() { calcToggle(false); },
    'typed-go'() {
      const t = Run.t;
      if (Run.done || !/\d/.test(Run.typed)) return;
      const v = parseFloat(Run.typed.replace(B.MINUS, '-'));
      const near = (t.wrongVals || []).find((w) => Math.abs(w.v - v) <= t.tol);
      Run.typedWhy = near ? near.why : '';
      answer(v);
    },
    'dial-go'() { const d = $('#dial'); if (d && !Run.done) answer(Number(d.value)); },
    arrowset(el) {
      if (Run.done) return;
      const r = Number(el.dataset.r);
      Run.arrows[r] = el.dataset.v;
      $$(`.segbtn[data-r="${r}"]`).forEach((b) => b.classList.toggle('on', b === el));
      Sound.play('tap');
      const go = $('#arrows-go');
      if (go) go.disabled = Run.t.rows.some((row, i) => !Run.arrows[i]);
    },
    'arrows-go'() { if (!Run.done && Run.t.rows.every((row, i) => Run.arrows[i])) answer(Run.arrows.slice()); },
    pilebin(el) {
      const t = Run.t;
      if (Run.done) return;
      const c = t.cards[Run.pileAt];
      if (Number(el.dataset.v) === c.bin) {
        Run.pileAt++;
        if (Run.pileAt >= t.cards.length) { Run.pileAt = t.cards.length - 1; answer('all'); return; }
        Sound.play('file', { step: Run.pileAt - 1 });
        $('#pile-count').textContent = `Card ${Run.pileAt + 1} of ${t.cards.length}`;
        $('#pile-text').textContent = t.cards[Run.pileAt].t;
        const f = $('.form'); if (f && f.animate && !reduced()) f.animate([{ transform: 'translateX(1.4rem) rotate(1deg)', opacity: 0.2 }, { transform: 'rotate(-.35deg)', opacity: 1 }], { duration: 180 });
      } else {
        el.classList.add('is-wrong');
        Run.whyOverride = c.y;
        answer('wrong');
      }
    },
    wavetap(el, e) {
      if (Run.done) return;
      const svg = el.ownerSVGElement, pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const at = pt.matrixTransform(svg.getScreenCTM().inverse());
      tapWaveAt((at.x - CL) / (CW - CL - CR));
    },
    frqpick(el) {
      const t = Run.t;
      if (Run.done) return;
      const b = Run.frq.length, i = Number(el.dataset.i);
      Run.frq.push(i);
      const slot = $(`.blankslot[data-b="${b}"]`);
      if (slot) { slot.textContent = t.blanks[b].options[i]; slot.classList.remove('active'); }
      if (Run.frq.length === t.blanks.length) { answer(Run.frq.slice()); return; }
      Sound.play('tap');
      const nextSlot = $(`.blankslot[data-b="${Run.frq.length}"]`); if (nextSlot) nextSlot.classList.add('active');
      $('#frqopts').innerHTML = frqOptions(t, Run.frq.length);
      lock(120);
    },
    labelpick(el) {
      const t = Run.t;
      if (Run.done) return;
      const st = t.steps[Run.li];
      if (Number(el.dataset.i) === st.answer) {
        writeSpot(t, st);
        Run.li++;
        if (Run.li >= t.steps.length) { answer('all'); return; }
        Sound.play('check', { step: Run.li - 1 });
        lightSpot(t);
      } else {
        el.classList.add('is-wrong');
        Run.labelWrong = Number(el.dataset.i);
        answer('wrong');
      }
    },
    lunch() { const so = S.solo; if (!so || Run.done) return; so.lunchUsed = true; Run.done = true; Clock.stop(); so.inRank++; soloNext(); },
    perk(el) { Sound.play('tap'); choosePerk(el.dataset.id); },
    'boss-go': runBossStep,
    status(el) { statusChosen(el.dataset.v); },
    payday,
    payq(el) { payAnswered(Number(el.dataset.i)); },
    report,
    name: nameScreen,
    'name-go': startReview,
    skipmiss: skipMiss,
    'solo-again'() { newRun(); soloNext(); },
    overtime: startOvertime,
    'last-card': lastCard,
    'toggle-extra'() { prefs.extra = !prefs.extra; savePrefs(); home(); },
    'toggle-music'() { toggleAudio('music'); },
    'toggle-sfx'() { toggleAudio('sfx'); },
    mute() { toggleMute(); },
    'train-menu': trainMenu,
    'train-go'(el) { trainGo(el.dataset.desk); },
    'train-stop'() { Run.done = true; Clock.stop(); trainStop(); },
    'cup-setup': cupSetup,
    'toggle-town'(el) { const su = S.setup, t = el.dataset.town; if (su.towns.includes(t)) { if (su.towns.length > 2) su.towns = su.towns.filter((x) => x !== t); } else su.towns = TOWNS.filter((x) => su.towns.includes(x) || x === t); drawSetup(); },
    'set-rounds'(el) { S.setup.rounds = Number(el.dataset.r); drawSetup(); },
    'cup-rules': cupRules,
    'cup-start': cupStart,
    'cup-resume': cupResume,
    'cup-go': cupGo,
    'cup-next': cupNextTurn,
    'cup-call': cupCall,
    'half-show': halfShow,
    'no-steal'() { closeSteal(null); },
    'town-tap'(el) {
      const c = S.cup, i = Number(el.dataset.i);
      if (!c) return;
      if (c.stealOpen) { if (i !== c.turn) closeSteal(i); return; }
      if (c.finalOpen) { c.finalPicked[i] = !c.finalPicked[i]; Sound.play('tap'); renderHud(); }
    },
    'final-part': finalPart,
    'final-show': finalShow,
    'final-next': finalNext,
    'pd-real': pdReal,
    'room-missed': roomMissed,
    tools: openTools,
    'close-modal': closeModal,
    fix(el) {
      const c = S.cup, t = c.towns[Number(el.dataset.i)];
      if (el.dataset.pay) t.pay = Math.max(0, t.pay + Number(el.dataset.pay));
      if (el.dataset.cpi) t.cpi = Math.max(100, t.cpi + Number(el.dataset.cpi));
      saveCup(); renderHud(); openTools();
    },
    'tool-skip'() { closeModal(); Run.done = true; Clock.stop(); S.cup.seen.push('skip'); cupTask(); },
    'tool-final'() { closeModal(); Run.done = true; cupFinalIntro(); },
    'tool-payday'() { closeModal(); Run.done = true; cupPayday(); },
  };
  function matchTap(side, i, el) {
    const t = Run.t;
    if (Run.done || el.classList.contains('is-right')) return;
    if (!Run.sel || Run.sel.side === side) {
      $$('.mbtn.sel').forEach((b) => b.classList.remove('sel'));
      Run.sel = { side, i, el };
      Sound.play('tap');
      el.classList.add('sel');
      return;
    }
    const l = side === 'L' ? i : Run.sel.i, r = side === 'R' ? i : Run.sel.i, other = Run.sel.el;
    Run.sel = null;
    other.classList.remove('sel');
    if (t.answer[l] === r) {
      [el, other].forEach((b) => { b.classList.add('is-right'); const m = $('.mbadge', b); if (m) m.textContent = 'ABCD'[Run.matched]; });
      Run.matched++;
      if (Run.matched === t.left.length) answer('all');
      else Sound.play('check', { step: Run.matched - 1 });
    } else {
      [el, other].forEach((b) => b.classList.add('is-wrong'));
      answer({ l, r });
    }
  }
  function typeKey(k) {
    const t = Run.t;
    if (Run.done || !t || t.verb !== 'type') return;
    if (k === 'back') Run.typed = Run.typed.slice(0, -1);
    else if (k === B.MINUS || k === '-') Run.typed = Run.typed.startsWith(B.MINUS) ? Run.typed.slice(1) : B.MINUS + Run.typed;
    else if (k === '.') { if (!Run.typed.includes('.')) Run.typed += Run.typed.replace(B.MINUS, '') === '' ? '0.' : '.'; }
    else if (Run.typed.replace(/[^\d]/g, '').length < 9) Run.typed += k;
    const out = $('#typed'); if (out) out.textContent = Run.typed;
    const go = $('#type-go'); if (go) go.disabled = !/\d/.test(Run.typed);
    Sound.play('key');
  }
  function tapWaveAt(x) {
    const t = Run.t;
    if (Run.done || !t || t.verb !== 'wave') return;
    const xx = Math.max(0, Math.min(1, x));
    const svg = $('.chart'), ns = 'http://www.w3.org/2000/svg';
    if (svg) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('class', 'tapdot'); dot.setAttribute('r', 11);
      dot.setAttribute('cx', cx(xx)); dot.setAttribute('cy', cy(B.wave.actual(xx, t.chart.phi)));
      svg.appendChild(dot);
    }
    answer(xx);
  }
  const NO_LOCK = new Set(['fix', 'close-modal', 'tools', 'town-tap', 'no-steal', 'tile', 'grab', 'unslot', 'orderpick', 'matchL', 'matchR', 'keypad', 'typed-go', 'dial-go', 'arrowset', 'arrows-go', 'pilebin', 'wavetap', 'frqpick', 'labelpick', 'toggle-town', 'set-rounds', 'toggle-music', 'toggle-sfx', 'mute', 'calc', 'calc-key', 'calc-close']);
  function clearCupIfOver() { if (S.cup && S.cup.phase === 'over') S.cup = null; }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (!act) return;
    const fn = ACTS[act];
    if (!fn) return;
    if (!NO_LOCK.has(act) && locked()) return;
    Sound.unlock();
    fn(el, e);
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'dial' && Run.t && Run.t.dial) {
      const read = $('#dial-read');
      if (read) { read.textContent = dialText(Run.t, e.target.value); read.classList.remove('untouched'); }
      Sound.dial();
      const go = $('#dial-go'); if (go) go.disabled = false;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Enter') return;
    if (e.target && e.target.id === 'dial' && e.key === 'Enter') { const go = $('.lockbtn'); if (go) { e.preventDefault(); go.click(); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (Calc.open) {
      if (e.key === 'Escape') { e.preventDefault(); calcToggle(false); return; }
      const k = /^[0-9]$/.test(e.key) ? e.key : CALC_KEYS[e.key];
      if (k) { e.preventDefault(); calcKey(k); return; }
    }
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); Sound.unlock(); toggleMute(); return; }
    const live = Run.t && S.screen === 'task' && !Run.done ? Run.t : null;
    if (live && live.verb === 'type') {
      if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); typeKey(e.key); return; }
      if (e.key === '-') { e.preventDefault(); typeKey(B.MINUS); return; }
      if (e.key === 'Backspace') { e.preventDefault(); typeKey('back'); return; }
      if (e.key === 'Enter') { e.preventDefault(); ACTS['typed-go'](); return; }
    }
    if (live && live.verb === 'wave' && /^[1-9]$/.test(e.key)) { e.preventDefault(); tapWaveAt((Number(e.key) - 0.5) / 9); return; }
    if (live && live.verb === 'ap' && /^[a-eA-E]$/.test(e.key)) { const el = $(`[data-key="${'abcde'.indexOf(e.key.toLowerCase()) + 1}"]:not([disabled])`); if (el) { e.preventDefault(); el.click(); } return; }
    if (live && (live.verb === 'dial' || live.verb === 'arrows') && e.key === 'Enter') { const go = $('.lockbtn:not([disabled])'); if (go) { e.preventDefault(); go.click(); } return; }
    if (/^[1-9]$/.test(e.key)) {
      const el = $(`[data-key="${e.key}"]:not([disabled])`);
      if (el) { e.preventDefault(); el.click(); }
      return;
    }
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); return; }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      if (!$('#modal').hidden) return;
      const main = $('.v-next') || $('#tray .btn.main') || (e.key !== 'ArrowRight' && document.activeElement && document.activeElement.closest('[data-act]'));
      if (main) { e.preventDefault(); main.click(); }
    }
  });

  /* ================= test hook, used only by tools/playtest.py ================= */
  window.__se = {
    S, Run, B, sound: Sound, calc: { key: (k) => calcKey(k), open: (v) => calcToggle(v), state: () => Object.assign({}, Calc), out: () => $('#calc-out').textContent },
    screen: () => S.screen,
    rightChoice() {
      const t = Run.t; if (!t) return null;
      return t.answer;
    },
    answerRight() {
      const t = Run.t; if (!t || Run.done) return false;
      switch (t.verb) {
        case 'build': Run.slots = t.answer.slice(); answer(t.answer.slice()); break;
        case 'grab': case 'order': case 'match': case 'pile': case 'label': answer('all'); break;
        case 'type': case 'dial': answer(t.calc.value); break;
        case 'arrows': Run.arrows = t.rows.map((r) => r.answer); answer(Run.arrows.slice()); break;
        case 'frq': Run.frq = t.blanks.map((b) => b.answer); answer(Run.frq.slice()); break;
        case 'wave': answer((t.zones[0][0] + t.zones[0][1]) / 2); break;
        default: answer(t.answer);
      }
      return true;
    },
    answerWrong() {
      const t = Run.t; if (!t || Run.done) return false;
      switch (t.verb) {
        case 'build': answer([t.answer[1], t.answer[0]]); break;
        case 'grab': answer(t.options.findIndex((o, i) => !t.answer.includes(i))); break;
        case 'order': { const w = t.answer[1]; const el = document.querySelector(`.orderitem[data-i="${w}"]`); if (el) el.classList.add('is-wrong'); answer(w); break; }
        case 'match': answer({ l: 0, r: (t.answer[0] + 1) % t.right.length }); break;
        case 'pile': Run.whyOverride = t.cards[0].y; answer('wrong'); break;
        case 'label': answer('wrong'); break;
        case 'type': { const w = t.calc.value + t.tol * 3 + 1; Run.typedWhy = ''; answer(w); break; }
        case 'dial': answer(t.calc.value === t.dial.min ? t.dial.max : t.dial.min); break;
        case 'arrows': Run.arrows = t.rows.map((r, i) => (i === 0 ? (r.answer === 'up' ? 'down' : 'up') : r.answer)); answer(Run.arrows.slice()); break;
        case 'frq': Run.frq = t.blanks.map((b) => (b.answer + 1) % b.options.length); answer(Run.frq.slice()); break;
        case 'wave': { let x = 0; for (let k = 0; k <= 200; k++) { const c = k / 200; if (!t.zones.some(([a, b]) => c >= a && c <= b)) { x = c; break; } } answer(x); break; }
        default: answer((t.answer + 1) % t.options.length);
      }
      return true;
    },
    tryTask(t, o) {
      S.mode = 'train'; S.train = S.train || { desk: t.desk, right: 0, total: 0 };
      window.__se.lastResult = null;
      startTask(t, o || { hints: true }, (correct) => {
        window.__se.lastResult = correct;
        if (!correct) revealAnswer(t);
        showVerdict({ right: correct, head: correct ? 'Right.' : 'Wrong.', onNext: () => {} });
      });
    },
    expire() { Clock.left = 0; },
    next: goNext,
    unlock() { lockUntil = 0; },
    show(t, o) { S.mode = 'train'; S.train = S.train || { desk: t.desk, right: 0, total: 0 }; startTask(t, o || { hints: true }, () => {}); },
    showMiss(t, o) {
      S.mode = 'train'; S.train = S.train || { desk: t.desk, right: 0, total: 0 };
      startTask(t, o || { hints: false }, (correct, choice) => {
        revealAnswer(t);
        showVerdict({ right: false, head: 'Pink slip 2 of 3.', picked: typeof choice === 'number' ? choice : null, note: 'Your CPI jumps 10 points. This one comes back to your desk soon.', onNext: () => {} });
      });
      window.__se.answerWrong();
    },
    closeSteal,
    prefs: () => prefs,
    reset() { prefs = Object.assign({}, DEFAULTS); savePrefs(); clearCup(); },
  };

  document.addEventListener('visibilitychange', () => { if (!document.hidden) Clock.last = performance.now(); });
  /* boot */
  home();
})();
