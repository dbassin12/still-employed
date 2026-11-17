"""Automated playtest for Still Employed.

Plays Solo runs (all right to the win, all wrong to the firing, payday, misses, card), plays a full Five Towns Cup
(steals, price check, final, payday), renders every task in the bank at phone and Chromebook sizes,
and checks each screen for console errors, sideways scrolling, controls off the screen, tiny text,
em dashes, a missing do-this-now line, and more than one main button. It also checks the money math.

Run python3 build.py first. Uses the Playwright in ../open-outcry/.venv and installed Chrome:
  ~/projects/open-outcry/.venv/bin/python tools/playtest.py [all|solo|class|cover|story|inputs|calc|corners|shots|sound]
Prints ALL CHECKS PASSED and exits 0 when clean. SE_SHOTS=folder puts screenshots somewhere else.
"""
import os, re, shutil, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'dist' / 'index.html').resolve().as_uri()
OUT = Path(os.environ.get('SE_SHOTS') or ROOT / 'screenshots')
MODE = sys.argv[1] if len(sys.argv) > 1 else 'all'
if MODE == 'all':
    shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir(parents=True, exist_ok=True)
errors, problems = [], []
SIZES = {'phone': (390, 844), 'small': (360, 640), 'laptop': (1366, 650), 'projector': (1920, 1000)}
report = []


def new_page(b, size, theme='light', tag='', reduced=False):
    w, h = SIZES[size]
    ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=theme, device_scale_factor=2 if w < 600 else 1,
                        has_touch=w < 600, reduced_motion='reduce' if reduced else 'no-preference')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'[{tag or size}] console.{m.type}: {m.text}') if m.type == 'error' and 'fonts.g' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag or size}] pageerror: {e}'))
    page.goto(PAGE)
    page.wait_for_timeout(450)  # the start screen ignores taps for its first moment, so a double tap can't skip it
    return ctx, page


def shot(page, name):
    path = OUT / f'{name}.png'
    path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(path))


CHECK_JS = r"""
async (opts) => {
  // measure things where they land: stamps start oversized on purpose, and the page clips them while they fall
  const moving = document.getAnimations().filter((x) => x.effect && x.effect.getTiming().iterations !== Infinity);
  await Promise.race([Promise.all(moving.map((x) => x.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 2000))]);
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push('page scrolls sideways: ' + de.scrollWidth + ' > ' + de.clientWidth);
  const stage = document.querySelector('#stage');
  if (stage && stage.scrollWidth > stage.clientWidth + 1) out.push('stage scrolls sideways');
  if (opts.fit && stage && stage.scrollHeight > stage.clientHeight + 2) out.push('stage needs scrolling: ' + stage.scrollHeight + ' > ' + stage.clientHeight);
  // tiny text
  const walker = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const size = parseFloat(cs.fontSize);
    const isSvg = !!el.closest('svg');
    if (!isSvg && size < 11) out.push('tiny text ' + size + 'px: ' + n.textContent.trim().slice(0, 40));
    if (/[–—]/.test(n.textContent)) out.push('dash: ' + n.textContent.trim().slice(0, 60));
    // controls that stick out sideways from the screen
    if (!isSvg && (r.right > window.innerWidth + 1 || r.left < -1)) out.push('off the screen sideways: ' + n.textContent.trim().slice(0, 40));
  }
  // paper whose contents stick out past its edge, into whatever sits beside it
  document.querySelectorAll('#app .form, #app .memo, #app .finalans').forEach((f) => {
    const box = f.getBoundingClientRect();
    f.querySelectorAll('table, td, th, p, .buildline').forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.width && r.right > box.right + 3) out.push('content sticks out of its paper: ' + c.textContent.trim().slice(0, 40));
    });
    if (f.scrollWidth > f.clientWidth + 3) out.push('paper overflows: ' + f.textContent.trim().slice(0, 40));
  });
  // buttons whose text overflows the button
  // (the check and X marks sit on the corner on purpose, so they are left out of this measure)
  const noMarks = document.createElement('style');
  noMarks.textContent = '#app button::after { display: none !important; }';
  document.head.appendChild(noMarks);
  document.querySelectorAll('#app button').forEach((b) => {
    if (b.scrollWidth > b.clientWidth + 2) out.push('button text overflows: ' + b.textContent.trim().slice(0, 40));
  });
  noMarks.remove();
  const mains = [...document.querySelectorAll('#app .btn.main')].filter((b) => b.offsetParent);
  if (mains.length > 1) out.push('more than one main button: ' + mains.map((b) => b.textContent).join(' | '));
  if (opts.screen && opts.tray) {
    const line = document.querySelector('#tray .doline');
    if (!line || !line.textContent.trim()) out.push('no do-this-now line');
  }
  return out;
}
"""


def check(page, label, fit=False, tray=False):
    res = page.evaluate(CHECK_JS, {'fit': fit, 'screen': True, 'tray': tray})
    for r in res:
        problems.append(f'{label}: {r}')


def state(page):
    return page.evaluate('''() => { const s = window.__se.S; const so = s.solo;
      return {screen: s.screen, mode: s.mode, pay: so && so.pay, cpi: so && so.cpi, slips: so && so.slips, rank: so && so.rank, inRank: so && so.inRank, right: so && so.right, total: so && so.total}; }''')


def click_main(page, label=''):
    page.evaluate('window.__se.unlock()')
    btn = page.locator('#tray .btn.main, .v-next').first
    btn.click(timeout=3000)
    page.wait_for_timeout(40)


def play_solo_right(b, size):
    ctx, page = new_page(b, size, tag=f'solo-right-{size}')
    page.evaluate('window.__se.reset()')
    page.reload()
    page.wait_for_timeout(450)
    check(page, f'home {size}', fit=size != 'small')
    shot(page, f'solo/{size}-00-home')
    page.locator('#go-solo').click()
    page.wait_for_timeout(450)
    assert_screen(page, 'orientation', 'first play shows orientation')
    check(page, f'orientation {size}', fit=size != 'small', tray=True)
    shot(page, f'solo/{size}-01-orientation')
    click_main(page)
    page.wait_for_timeout(250)
    shot(page, f'solo/{size}-02-practice')
    page.evaluate('window.__se.answerRight()')
    page.wait_for_timeout(450)
    shot(page, f'solo/{size}-03-practice-right')
    click_main(page)
    page.wait_for_timeout(250)
    steps = 0
    seen_screens = []
    shotted = set()
    pay_before = 0
    while steps < 200:
        steps += 1
        page.evaluate('window.__se.unlock()')
        st = state(page)
        if st['screen'] not in seen_screens:
            seen_screens.append(st['screen'])
        if st['screen'] == 'task':
            verb = page.evaluate('window.__se.Run.t.verb')
            if verb not in shotted:
                shot(page, f'solo/{size}-task-{verb}')
                shotted.add(verb)
            check(page, f'solo task {verb} {size}')
            page.evaluate('window.__se.answerRight()')
            page.wait_for_timeout(30)
            st2 = state(page)
            if st2['pay'] <= pay_before:
                problems.append(f'solo right answer did not raise pay: {pay_before} to {st2["pay"]}')
            pay_before = st2['pay']
            if f'v-{verb}' not in shotted:
                page.wait_for_timeout(350)
                shot(page, f'solo/{size}-task-{verb}-right')
                shotted.add(f'v-{verb}')
            page.evaluate('window.__se.next()')
            page.wait_for_timeout(30)
        elif st['screen'] == 'promo':
            if 'promo' not in shotted:
                page.wait_for_timeout(250)
                shot(page, f'solo/{size}-promo')
                shotted.add('promo')
            page.wait_for_timeout(320)  # let the stamp land before measuring
            check(page, f'promo {size}', tray=True)
            page.evaluate('window.__se.unlock()')
            page.locator('.perk').first.click()
            page.wait_for_timeout(30)
        elif st['screen'] == 'bossintro':
            if 'bossintro' not in shotted:
                shot(page, f'solo/{size}-bossintro')
                shotted.add('bossintro')
            check(page, f'bossintro {size}', tray=True)
            click_main(page)
        elif st['screen'] == 'bossdone':
            if 'bossdone' not in shotted:
                shot(page, f'solo/{size}-bossdone')
                shotted.add('bossdone')
            click_main(page)
        elif st['screen'] == 'win':
            page.wait_for_timeout(250)
            shot(page, f'solo/{size}-win')
            check(page, f'win {size}', tray=True)
            click_main(page)
            break
        else:
            problems.append(f'solo unexpected screen {st["screen"]}')
            break
    st = state(page)
    page.wait_for_timeout(200)
    if st['screen'] != 'payday':
        problems.append(f'solo win should reach payday, got {st["screen"]}')
    if st['rank'] != 5:
        problems.append(f'solo win should reach Commissioner, rank {st["rank"]}')
    if st['slips'] != 0 or st['cpi'] != 100:
        problems.append(f'a clean run should have no slips and CPI 100: {st}')
    report.append(f'Solo clean run on {size}: pay {st["pay"]}, {st["right"]} of {st["total"]} right, {steps} steps')
    shot(page, f'solo/{size}-payday-clean')
    click_main(page)
    page.wait_for_timeout(200)
    shot(page, f'solo/{size}-report-clean')
    check(page, f'report {size}', tray=True)
    click_main(page)  # no misses: name
    page.wait_for_timeout(200)
    shot(page, f'solo/{size}-name')
    page.locator('#student-name').fill('Test Student')
    click_main(page)
    page.wait_for_timeout(300)
    assert_screen(page, 'card', 'no misses goes straight to the card')
    shot(page, f'solo/{size}-card-clean')
    check(page, f'card {size}', tray=True)
    ctx.close()


def assert_screen(page, name, why):
    s = page.evaluate('window.__se.S.screen')
    if s != name:
        problems.append(f'{why}: expected {name}, got {s}')


def play_solo_fired(b, size):
    ctx, page = new_page(b, size, tag=f'solo-fired-{size}')
    page.evaluate('() => { window.__se.prefs().practiced = true; }')
    page.locator('#go-solo').click()
    page.wait_for_timeout(450)
    shotted = set()
    # earn some pay first
    for _ in range(3):
        page.evaluate('window.__se.unlock(); window.__se.answerRight()')
        page.wait_for_timeout(20)
        page.evaluate('window.__se.next()')
        page.wait_for_timeout(20)
    for i in range(3):
        page.evaluate('window.__se.unlock()')
        before = state(page)
        verb = page.evaluate('window.__se.Run.t.verb')
        page.evaluate('window.__se.answerWrong()')
        page.wait_for_timeout(350)
        after = state(page)
        if after['slips'] != before['slips'] + 1:
            problems.append(f'wrong answer should add a pink slip: {before} {after}')
        if after['cpi'] != before['cpi'] + 10:
            problems.append(f'wrong answer should add 10 to CPI: {before} {after}')
        shot(page, f'solo/{size}-wrong-{i}-{verb}')
        check(page, f'wrong verdict {verb} {size}')
        ok = page.evaluate('''() => { const n = document.querySelector('.v-next'); if (!n) return false; const r = n.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.top >= 0; }''')
        if not ok and size != 'small':
            problems.append(f'Next button off the screen after a miss, {verb}, {size}')
        click_main(page)
        page.wait_for_timeout(60)
    assert_screen(page, 'fired', 'three slips should fire')
    page.wait_for_timeout(200)
    shot(page, f'solo/{size}-fired')
    check(page, f'fired {size}', tray=True)
    page.evaluate('window.__se.unlock()')
    page.locator('[data-v="quit"]').click()
    page.wait_for_timeout(600)
    shot(page, f'solo/{size}-status-quit')
    check(page, f'status {size}', tray=True)
    click_main(page)
    page.wait_for_timeout(300)
    assert_screen(page, 'payday', 'status leads to payday')
    shot(page, f'solo/{size}-payday-q')
    check(page, f'payday q {size}', tray=True)
    so = page.evaluate('() => { const s = window.__se.S.solo; return {pay: s.pay, cpi: s.cpi, q: s.payQ && s.payQ.value, a: s.payQ && s.payQ.answer}; }')
    if so['q'] is not None:
        want = round(so['pay'] / so['cpi'] * 100 / 10) * 10
        if abs(want - so['q']) > 10:
            problems.append(f'payday real pay wrong: {so}')
        page.locator('#payq .calcbtn').click()
        for ch in f'{so["pay"]}/{so["cpi"]}*100': page.keyboard.press(ch)
        page.keyboard.press('Enter')
        shown = page.evaluate("() => document.querySelector('#calc-out').textContent.replace(/,/g, '')")
        if abs(float(shown) - so['pay'] / so['cpi'] * 100) > 0.01:
            problems.append(f'payday calculator shows {shown} for {so}')
        shot(page, f'solo/{size}-payday-calc')
        if page.evaluate("() => { const t = document.querySelector('#tray'); return !t.hidden && t.getBoundingClientRect().bottom < innerHeight - 2; }"):
            problems.append(f'payday calculator {size}: the tray left the bottom of the screen')
        check(page, f'payday calculator {size}', tray=True)
        page.keyboard.press('Escape')
        page.evaluate('window.__se.unlock()')
        page.locator(f'[data-act="payq"][data-i="{so["a"]}"]').click()
        page.wait_for_timeout(250)
        shot(page, f'solo/{size}-payday-a')
        real = page.evaluate('window.__se.S.solo.real')
        if real != so['q'] + 250:
            problems.append(f'right payday answer should add $250: {real} vs {so["q"]}')
    click_main(page)
    page.wait_for_timeout(200)
    assert_screen(page, 'report', 'payday leads to the report')
    shot(page, f'solo/{size}-report')
    click_main(page)
    page.wait_for_timeout(200)
    page.locator('#student-name').fill('Avi Example')
    click_main(page)
    page.wait_for_timeout(250)
    n = 0
    while page.evaluate('window.__se.S.screen') in ('task', 'review') and n < 8:
        n += 1
        page.evaluate('window.__se.unlock()')
        if n == 1:
            shot(page, f'solo/{size}-review')
        check(page, f'review {size}')
        if n == 2:
            page.evaluate('window.__se.answerWrong()')
        else:
            page.evaluate('window.__se.answerRight()')
        page.wait_for_timeout(200)
        click_main(page)
        page.wait_for_timeout(120)
    assert_screen(page, 'card', 'misses lead to the card')
    page.wait_for_timeout(100)
    shot(page, f'solo/{size}-card')
    check(page, f'card {size}', tray=True)
    txt = page.locator('#rcard').inner_text()
    if 'Avi Example' not in txt:
        problems.append('card lost the name')
    if 'fixed on the second try' not in txt:
        problems.append('card lost the second try score')
    # the card comes back from the start screen
    click_main(page)
    page.wait_for_timeout(200)
    if page.locator('[data-act="last-card"]').count() != 1:
        problems.append('home should offer See my last card')
    ctx.close()


def play_timeout(b):
    """Running out of time is a miss."""
    ctx, page = new_page(b, 'phone', tag='timeout')
    page.evaluate('() => { window.__se.prefs().practiced = true; }')
    page.locator('#go-solo').click()
    page.wait_for_timeout(450)
    page.evaluate('window.__se.expire()')
    page.wait_for_timeout(200)
    st = state(page)
    if st['slips'] != 1:
        problems.append(f'running out of time should give a pink slip: {st}')
    shot(page, 'solo/phone-timeout')
    ctx.close()


def play_cup(b, size, rounds=2):
    ctx, page = new_page(b, size, tag=f'cup-{size}')
    page.locator('#go-class').click()
    page.wait_for_timeout(450)
    assert_screen(page, 'cupsetup', 'class opens setup')
    shot(page, f'cup/{size}-setup')
    check(page, f'cup setup {size}', tray=True, fit=size != 'small')
    page.evaluate('window.__se.unlock()')
    page.locator(f'[data-act="set-rounds"][data-r="{rounds}"]').click()
    page.wait_for_timeout(450)
    click_main(page)
    page.wait_for_timeout(300)
    shot(page, f'cup/{size}-rules')
    check(page, f'cup rules {size}', tray=True, fit=size != 'small')
    click_main(page)
    page.wait_for_timeout(300)
    assert_screen(page, 'call', 'first call')
    shot(page, f'cup/{size}-call')
    towns = page.evaluate('window.__se.S.cup.towns.length')
    if towns != 5:
        problems.append(f'default should be 5 towns: {towns}')
    clicks = 0
    turn_clicks = []
    steal_done = False
    steals_late = 0
    shotted = set()
    steps = 0
    while steps < 400:
        steps += 1
        page.evaluate('window.__se.unlock()')
        scr = page.evaluate('window.__se.S.screen')
        if scr == 'call':
            click_main(page)
            clicks += 1
            page.wait_for_timeout(30)
        elif scr == 'task':
            c = page.evaluate('() => { const c = window.__se.S.cup; return {in: c.inTurn, turn: c.turn, round: c.round, pay: c.towns[c.turn].pay, cpi: c.towns[c.turn].cpi}; }')
            verb = page.evaluate('window.__se.Run.t.verb')
            if verb not in shotted:
                shot(page, f'cup/{size}-task-{verb}')
                shotted.add(verb)
                check(page, f'cup task {verb} {size}')
            wrong = (c['in'] + c['turn'] + c['round']) % 3 == 1
            if wrong:
                other = (c['turn'] + 1) % towns
                other_pay = page.evaluate(f'window.__se.S.cup.towns[{other}].pay')
                page.evaluate('window.__se.answerWrong()')
                page.wait_for_timeout(60)
                if page.locator('.verdict.steal').count() != 1:
                    problems.append('a miss should open the steal')
                # the answer must stay hidden during the steal
                hidden = page.evaluate('''() => document.querySelectorAll('.task .is-right').length''')
                if hidden:
                    problems.append(f'the key shows during the steal ({verb})')
                if 'steal' not in shotted:
                    shot(page, f'cup/{size}-steal')
                    shotted.add('steal')
                if not steal_done:
                    page.locator(f'.town[data-i="{other}"]').click()
                    steal_done = True
                    page.wait_for_timeout(40)
                    after_other = page.evaluate(f'window.__se.S.cup.towns[{other}].pay')
                    if after_other <= other_pay:
                        problems.append('a steal should pay the rival')
                else:
                    page.locator('[data-act="no-steal"]').click()
                    page.wait_for_timeout(40)
                    shown = page.evaluate('document.querySelectorAll(".task .is-right, .task .shown, .task .zone, .task .filled, .task .done, .task .struckthrough").length')
                    if shown == 0:
                        problems.append(f'Show the answer should reveal the key ({verb})')
                    if steals_late < 1:
                        # the teacher checks the answer, then pays the rival who shouted it first
                        steals_late += 1
                        before_late = page.evaluate(f'window.__se.S.cup.towns[{other}].pay')
                        page.locator(f'.town[data-i="{other}"]').click()
                        page.wait_for_timeout(40)
                        if page.evaluate(f'window.__se.S.cup.towns[{other}].pay') <= before_late:
                            problems.append('a late tap after the answer shows should still pay the rival')
                        once = page.evaluate(f'window.__se.S.cup.towns[{other}].pay')
                        page.locator(f'.town[data-i="{other}"]').click()
                        page.wait_for_timeout(40)
                        if page.evaluate(f'window.__se.S.cup.towns[{other}].pay') != once:
                            problems.append('a second tap should not pay the steal twice')
                st = page.evaluate(f'window.__se.S.cup.towns[{c["turn"]}].cpi')
                if st != c['cpi'] + 5:
                    problems.append(f'a miss should add 5 to the town CPI: {c["cpi"]} to {st}')
                page.wait_for_timeout(200)
                if 'stolen' not in shotted:
                    shot(page, f'cup/{size}-after-steal')
                    shotted.add('stolen')
                page.evaluate('window.__se.unlock()')
                click_main(page)
                clicks += 1
            else:
                page.evaluate('window.__se.answerRight()')
                page.wait_for_timeout(20)
                page.evaluate('window.__se.unlock()')
                click_main(page)
                clicks += 1
            page.wait_for_timeout(20)
        elif scr == 'turnend':
            if 'turnend' not in shotted:
                shot(page, f'cup/{size}-turnend')
                shotted.add('turnend')
            check(page, f'turnend {size}', tray=True)
            click_main(page)
            clicks += 1
            turn_clicks.append(clicks)
            clicks = 0
        elif scr == 'half':
            shot(page, f'cup/{size}-half')
            check(page, f'half {size}', tray=True)
            click_main(page)
            page.wait_for_timeout(100)
            shot(page, f'cup/{size}-half-real')
            page.evaluate('window.__se.unlock()')
            click_main(page)
        elif scr == 'final':
            break
        else:
            problems.append(f'cup unexpected screen {scr}')
            break
    # the final
    assert_screen(page, 'final', 'rounds lead to the final')
    shot(page, f'cup/{size}-final-intro')
    click_main(page)
    page.wait_for_timeout(120)
    part = 0
    pays0 = page.evaluate('window.__se.S.cup.towns.map(t => t.pay)')
    while page.evaluate('window.__se.S.screen') == 'final' and part < 6:
        if part == 0:
            shot(page, f'cup/{size}-final-part')
        check(page, f'final part {size}', tray=True)
        page.evaluate('window.__se.unlock()')
        click_main(page)
        page.wait_for_timeout(120)
        if part == 0:
            shot(page, f'cup/{size}-final-answer')
        page.locator('.town[data-i="1"]').click()
        page.wait_for_timeout(30)
        page.evaluate('window.__se.unlock()')
        click_main(page)
        page.wait_for_timeout(120)
        part += 1
    pays1 = page.evaluate('window.__se.S.cup.towns.map(t => t.pay)')
    if pays1[1] - pays0[1] != 2500:
        problems.append(f'five final parts should pay $2,500: {pays0[1]} to {pays1[1]}')
    if pays1[0] != pays0[0]:
        problems.append('an untapped town should not get final pay')
    assert_screen(page, 'payday', 'final leads to payday')
    page.wait_for_timeout(100)
    shot(page, f'cup/{size}-payday-money')
    check(page, f'payday {size}', tray=True)
    click_main(page)
    page.wait_for_timeout(1700)
    shot(page, f'cup/{size}-payday-real')
    check(page, f'payday real {size}', tray=True)
    list_ = page.evaluate('window.__se.S.cup.paydayList')
    for t in list_:
        if t['real'] != round(t['pay'] / t['cpi'] * 100 / 10) * 10 and abs(t['real'] - t['pay'] / t['cpi'] * 100) > 5.01:
            problems.append(f'real pay wrong: {t}')
    order = page.evaluate('''() => [...document.querySelectorAll('.pd-row')].map(r => ({i: Number(r.dataset.t), y: r.getBoundingClientRect().top})).sort((a,b)=>a.y-b.y).map(r=>r.i)''')
    want = [t['i'] for t in sorted(list_, key=lambda t: -t['real'])]
    if [list_[i]['real'] for i in order] != [list_[i]['real'] for i in want]:
        problems.append(f'payday rows are not in real pay order: {order} vs {want}')
    report.append(f'Cup on {size}: clicks per turn {turn_clicks[:6]}; winner by real pay {list_[want[0]]["name"]}')
    page.evaluate('window.__se.unlock()')
    click_main(page)
    page.wait_for_timeout(200)
    assert_screen(page, 'missed', 'payday leads to what the room missed')
    shot(page, f'cup/{size}-missed')
    check(page, f'missed {size}', tray=True)
    ctx.close()


def cover(b, size, fit=True, every=1):
    """Every task in the bank (or every nth), on the screen, before a miss."""
    ctx, page = new_page(b, size, tag=f'cover-{size}', reduced=True)
    n = page.evaluate('window.__se.B.everyTask(9).length') // every
    bad = page.evaluate(CHECK_ALL_JS, {'fit': fit, 'size': size, 'every': every})
    for x in bad:
        problems.append(f'cover {size}: {x}')
    report.append(f'Rendered {n} tasks at {size}')
    ctx.close()


CHECK_ALL_JS = r"""
async ({fit, size, every}) => {
  const se = window.__se, out = [];
  const tasks = se.B.everyTask(9).filter((t, i) => i % every === 0);
  for (let seed = 1; seed < 25; seed++) for (const tier of [0, 1, 3]) se.B.boss(tier, se.B.rng(seed)).forEach((t) => tasks.push(t));
  const verbsSeen = new Set();
  const stage = document.querySelector('#stage');
  for (const t of tasks) {
    se.show(t, {hints: true});
    await new Promise(r => requestAnimationFrame(r));
    const prob = [];
    if (stage.scrollWidth > stage.clientWidth + 1) prob.push('sideways');
    if (fit && stage.scrollHeight > stage.clientHeight + 2) prob.push('needs scrolling ' + stage.scrollHeight + '/' + stage.clientHeight);
    const bodyEl = document.querySelector('.tk-body');
    if (bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight + 3) prob.push('content spills out of its area ' + bodyEl.scrollHeight + '/' + bodyEl.clientHeight);
    document.querySelectorAll('.task .form, .task .memo').forEach((f) => { if (f.scrollWidth > f.clientWidth + 3) prob.push('paper overflows sideways'); });
    document.querySelectorAll('.task button').forEach((b) => { if (b.scrollWidth > b.clientWidth + 2) prob.push('button overflow: ' + b.textContent.trim().slice(0, 30)); });
    const empty = [...document.querySelectorAll('.task .opt-label, .task .memoline span, .task .chip-text')].some(e => !e.textContent.trim());
    if (empty) prob.push('an empty label');
    if (prob.length) out.push(t.id + ' [' + t.verb + ']: ' + prob.join('; '));
    verbsSeen.add(t.verb);
  }
  se.show(tasks[0], {hints: true});
  return out;
}
"""


MISS_JS = r"""
async ({every}) => {
  const se = window.__se, out = [];
  const tasks = se.B.everyTask(9).filter((t, i) => i % every === 0);
  for (let seed = 1; seed < 25; seed++) for (const tier of [0, 1, 3]) se.B.boss(tier, se.B.rng(seed)).forEach((t) => tasks.push(t));
  for (const t of tasks) {
    se.showMiss(t);
    await new Promise(r => setTimeout(r, t.verb === 'stamp' || t.verb === 'truefalse' ? 40 : 0)); // same screen, same stamp: let it land
    await new Promise(r => requestAnimationFrame(r));
    const n = document.querySelector('.v-next');
    const prob = [];
    if (!n) prob.push('no Next button');
    else { const r = n.getBoundingClientRect(); if (r.bottom > window.innerHeight + 1 || r.top < 0) prob.push('Next is off the screen, bottom ' + Math.round(r.bottom) + ' of ' + window.innerHeight); }
    const stage = document.querySelector('#stage');
    if (stage.scrollWidth > stage.clientWidth + 1) prob.push('sideways');
    const bodyEl = document.querySelector('.tk-body');
    if (bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight + 3) prob.push('content spills out of its area ' + bodyEl.scrollHeight + '/' + bodyEl.clientHeight);
    const form = document.querySelector('.form .form-text, .memo');
    if (form) { const r = form.getBoundingClientRect(); if (r.top < 0) prob.push('the question scrolled away'); }
    if (/\d\.\d{4,}/.test(document.querySelector('.task').innerText)) prob.push('a long decimal shows');
    const said = document.querySelector('.verdict').innerText;
    const bare = (x) => String(x || '').replace(/\.$/, '');
    if (!t.learn) prob.push('no formula or rule on the task');
    else if (!document.querySelector('.v-learn') && !said.includes(bare(t.learn.text))) prob.push('the answer does not show its formula or rule');
    if (prob.length) out.push(t.id + ' [' + t.verb + ']: ' + prob.join('; '));
  }
  return out;
}
"""


def cover_miss(b, size, every=1):
    """The screen after a miss has the most text. Next must stay on the screen for every task."""
    ctx, page = new_page(b, size, tag=f'miss-{size}', reduced=True)  # reduced motion: measure stamps after they land
    for x in page.evaluate(MISS_JS, {'every': every}):
        problems.append(f'after a miss, {size}: {x}')
    report.append(f'Checked the miss screen for {"every task" if every == 1 else f"every {every}th task"} at {size}')
    ctx.close()


def story(b):
    """One Solo game on a phone and one Cup on the projector, every step in order, for the fresh-eyes check."""
    out = OUT / 'story'
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    ctx, page = new_page(b, 'phone', tag='story')
    n = [0]
    def snap(name):
        n[0] += 1
        page.wait_for_timeout(330)
        page.screenshot(path=str(out / f'solo-{n[0]:02d}-{name}.png'))
    snap('start')
    page.locator('#go-solo').click(); snap('after-tapping-play-on-my-own')
    click_main(page); snap('practice')
    page.evaluate('window.__se.answerRight()'); snap('practice-answered')
    click_main(page); snap('first-task')
    for i in range(14):
        page.evaluate('window.__se.unlock()')
        scr = page.evaluate('window.__se.S.screen')
        if scr == 'promo':
            snap('promotion')
            page.evaluate('window.__se.unlock()')
            page.locator('.perk').first.click()
            page.wait_for_timeout(50)
            continue
        if scr != 'task':
            break
        wrong = i in (3, 8, 12)
        v = page.evaluate('window.__se.Run.t.verb')
        snap(f'task-{v}')
        if wrong:
            page.evaluate('window.__se.answerWrong()')
            snap(f'task-{v}-wrong')
            click_main(page)
        else:
            page.evaluate('window.__se.answerRight()')
            snap(f'task-{v}-right')
            page.evaluate('window.__se.next()')
        page.wait_for_timeout(40)
    ctx.close()
    ctx, page = new_page(b, 'projector', tag='story-cup')
    n[0] = 0
    def snapc(name):
        n[0] += 1
        page.wait_for_timeout(330)
        page.screenshot(path=str(out / f'class-{n[0]:02d}-{name}.png'))
    page.locator('#go-class').click(); snapc('setup')
    click_main(page); snapc('rules')
    click_main(page); snapc('first-town-called')
    click_main(page); snapc('task')
    page.evaluate('window.__se.answerRight()'); snapc('task-right')
    page.evaluate('window.__se.next()'); snapc('next-task')
    page.evaluate('window.__se.answerWrong()'); snapc('task-missed-steal-open')
    page.evaluate('window.__se.unlock()'); page.locator('.town[data-i="2"]').click(); snapc('steal-tapped')
    ctx.close()


def calculator(b, size):
    """The calculator: real taps and keys, it keeps number keys away from the answers while open, and it fits."""
    ctx, page = new_page(b, size, tag=f'calc-{size}')
    tid = page.evaluate("() => window.__se.B.everyTask(5).find(t => t.verb === 'type').id")
    page.evaluate('(id) => { const t = window.__se.B.everyTask(5).find(x => x.id === id); window.__se.tryTask(t); window.__se.unlock(); }', tid)
    page.wait_for_timeout(250)
    page.locator('.tk-head .calcbtn').click()
    if page.evaluate("document.querySelector('#calc').hidden"):
        problems.append(f'calculator {size}: the button did not open it')
    out = lambda: page.evaluate("document.querySelector('#calc-out').textContent")
    for k in ['(', '1', '6', '2', '\u2212', '1', '5', '0', ')', '\u00f7', '1', '5', '0', '\u00d7', '1', '0', '0', '=']:
        page.locator(f'#calc [data-k="{k}"]').click()
    if out() != '8':
        problems.append(f'calculator {size}: (162 - 150) / 150 x 100 by taps shows {out()}, not 8')
    page.locator('#calc [data-k="C"]').click()
    for ch in '2+3*4': page.keyboard.press(ch)
    page.keyboard.press('Enter')
    if out() != '14':
        problems.append(f'calculator {size}: 2+3*4 by keys shows {out()}, not 14')
    for ch in '1/0': page.keyboard.press(ch)
    page.keyboard.press('Enter')
    if out() != 'Error':
        problems.append(f'calculator {size}: 1/0 shows {out()}, not Error')
    typed = lambda: page.evaluate("(document.querySelector('#typed') || {}).textContent || ''")
    if typed():
        problems.append(f'calculator {size}: number keys reached the task while the calculator was open: {typed()}')
    check(page, f'calculator open {size}')
    if page.evaluate("() => { const t = document.querySelector('#tray'); return !t.hidden && t.getBoundingClientRect().bottom < innerHeight - 2; }"):
        problems.append(f'calculator {size}: the tray left the bottom of the screen')
    shot(page, f'calc/{size}-open')
    page.keyboard.press('Escape')
    if not page.evaluate("document.querySelector('#calc').hidden"):
        problems.append(f'calculator {size}: Escape did not close it')
    page.keyboard.press('4')
    if '4' not in typed():
        problems.append(f'calculator {size}: after closing, number keys should type the answer again')
    page.locator('.tk-head .calcbtn').click()
    page.evaluate('window.__se.answerWrong()')
    page.wait_for_timeout(250)
    check(page, f'calculator open after a miss {size}')
    shot(page, f'calc/{size}-after-miss')
    page.evaluate('(id) => { const t = window.__se.B.everyTask(5).find(x => x.id === id); window.__se.tryTask(t); window.__se.unlock(); }', tid)
    page.wait_for_timeout(250)
    if not page.evaluate("document.querySelector('#calc').hidden"):
        problems.append(f'calculator {size}: it should close on the next task')
    ctx.close()
    report.append(f'calculator {size}: taps, keys, Error, key guard, layout')


def real_inputs(b, size):
    """Real taps and keys on every kind of question: the right target counts as right, the wrong one as wrong."""
    ctx, page = new_page(b, size, tag=f'inputs-{size}', reduced=True)
    picks = page.evaluate("""() => { const out = {}; window.__se.B.everyTask(5).forEach(t => {
        const key = t.verb + (t.verb === 'chart' ? '-' + t.chart.kind + (t.chart.pickOne ? '-tap' : '') + (t.chart.pickLine ? '-line' : '') + (t.chart.shift ? '-shift' : '') + (t.chart.control ? '-control' : '') : '') + (t.verb === 'label' ? '-' + t.diagram : '');
        out[key] = out[key] || t.id; }); return out; }""")
    click = lambda sel: page.locator(sel).first.click(timeout=2500, force=True)
    for key, tid in picks.items():
        for mode in ('right', 'wrong', 'keys'):
            page.evaluate('(id) => { const t = window.__se.B.everyTask(5).find(x => x.id === id); window.__se.tryTask(t); window.__se.unlock(); }', tid)
            page.wait_for_timeout(240)
            page.evaluate('window.__se.unlock()')
            t = page.evaluate('() => JSON.parse(JSON.stringify(window.__se.Run.t))')
            verb, ans = t['verb'], t.get('answer')
            want = mode != 'wrong'
            n = len(t.get('options') or t.get('tiles') or [])
            try:
                if verb == 'order':
                    seq = ans if mode != 'wrong' else [ans[1]]
                    for i in seq:
                        if mode == 'keys': page.keyboard.press(str(i + 1))
                        else: click(f'.orderitem[data-i="{i}"]')
                        page.wait_for_timeout(25)
                elif verb == 'match':
                    k = len(t['left'])
                    if mode == 'wrong':
                        click('[data-act="matchL"][data-i="0"]'); click(f'[data-act="matchR"][data-i="{(ans[0] + 1) % k}"]')
                    else:
                        for i in range(k):
                            if mode == 'keys':
                                page.keyboard.press(str(i + 1)); page.keyboard.press(str(k + ans[i] + 1))
                            else:
                                click(f'[data-act="matchL"][data-i="{i}"]'); click(f'[data-act="matchR"][data-i="{ans[i]}"]')
                            page.wait_for_timeout(25)
                elif verb == 'type':
                    v = t['calc']['value']
                    text = ('%.2f' % v).rstrip('0').rstrip('.') if abs(v - round(v)) > 1e-9 else str(int(round(v)))
                    if mode == 'wrong': text = '98765'
                    if mode == 'keys':
                        page.keyboard.type(text.replace('-', '-'))
                        page.keyboard.press('Enter')
                    else:
                        for ch in text:
                            k = '\u2212' if ch == '-' else ch
                            click(f'.keybtn[data-k="{k}"]')
                        click('#type-go')
                elif verb == 'dial':
                    d = t['dial']
                    v = t['calc']['value'] if mode != 'wrong' else (d['max'] if t['calc']['value'] != d['max'] else d['min'])
                    if not page.locator('#dial-go').is_disabled():
                        problems.append(f'inputs {size} dial: Lock it in should wait until the dial moves')
                    if 'Slide' not in page.locator('#dial-read').inner_text():
                        problems.append(f'inputs {size} dial: the readout should not show a value before the dial moves')
                    page.locator('#dial').fill(str(v))
                    page.wait_for_timeout(25)
                    read = page.locator('#dial-read').inner_text()
                    if str(abs(v)).rstrip('0').rstrip('.') not in read and str(abs(int(v))) not in read:
                        problems.append(f'inputs {size} dial: readout {read} does not follow {v}')
                    if mode == 'keys':
                        page.locator('#dial').press('Enter')
                    else:
                        click('.lockbtn')
                elif verb == 'arrows':
                    words = ['up', 'same', 'down']
                    for r, row in enumerate(t['rows']):
                        v = row['answer']
                        if mode == 'wrong' and r == 0: v = 'down' if v == 'up' else 'up'
                        if mode == 'keys': page.keyboard.press(str(r * 3 + words.index(v) + 1))
                        else: click(f'.segbtn[data-r="{r}"][data-v="{v}"]')
                        page.wait_for_timeout(20)
                    if mode == 'keys': page.keyboard.press('Enter')
                    else: click('#arrows-go')
                elif verb == 'pile':
                    cards = t['cards']
                    if mode == 'wrong':
                        click(f'.stampbtn[data-v="{1 - cards[0]["bin"]}"]')
                    else:
                        for c in cards:
                            if mode == 'keys': page.keyboard.press(str(c['bin'] + 1))
                            else: click(f'.stampbtn[data-v="{c["bin"]}"]')
                            page.wait_for_timeout(25)
                elif verb == 'wave':
                    zones = t['zones']
                    inside = lambda x: any(a <= x <= z for a, z in zones)
                    if mode == 'keys':
                        digits = [d for d in range(1, 10) if inside((d - 0.5) / 9)]
                        if not digits:
                            continue
                        page.keyboard.press(str(digits[0]))
                    else:
                        x = (zones[0][0] + zones[0][1]) / 2 if mode == 'right' else next(i / 100 for i in range(101) if not inside(i / 100))
                        box = page.locator('.wave-hit').bounding_box()
                        page.mouse.click(box['x'] + box['width'] * x, box['y'] + box['height'] / 2)
                elif verb == 'frq':
                    for bi, bl in enumerate(t['blanks']):
                        i = bl['answer'] if mode != 'wrong' else (bl['answer'] + 1) % len(bl['options'])
                        step = page.locator('.frq-step').inner_text()
                        if f'Blank {bi + 1} of' not in step:
                            problems.append(f'inputs {size} frq: buttons should say which blank they fill, got {step}')
                        if mode == 'keys': page.keyboard.press(str(i + 1))
                        else: click(f'[data-act="frqpick"][data-i="{i}"]')
                        page.wait_for_timeout(150)
                elif verb == 'label':
                    steps = t['steps']
                    if mode == 'wrong':
                        click(f'[data-act="labelpick"][data-i="{(steps[0]["answer"] + 1) % n}"]')
                    else:
                        for st in steps:
                            if mode == 'keys': page.keyboard.press(str(st['answer'] + 1))
                            else: click(f'[data-act="labelpick"][data-i="{st["answer"]}"]')
                            page.wait_for_timeout(25)
                elif mode == 'keys':
                    keys = ans if isinstance(ans, list) else [ans]
                    for k in keys:
                        page.keyboard.press(str(k + 1))
                        page.wait_for_timeout(30)
                elif verb == 'build':
                    order = ans if mode == 'right' else [ans[1], ans[0]]
                    for i in order:
                        click(f'.tile[data-i="{i}"]')
                        page.wait_for_timeout(30)
                elif verb == 'grab':
                    if mode == 'right':
                        for i in ans:
                            click(f'.chip[data-i="{i}"]')
                            page.wait_for_timeout(30)
                    else:
                        w = next(i for i in range(n) if i not in ans)
                        click(f'.chip[data-i="{w}"]')
                else:
                    i = ans if mode == 'right' else (ans + 1) % n
                    if verb == 'chart' and t['chart']['kind'] in ('cycle', 'ppc', 'line') and t['chart'].get('pickOne'):
                        page.locator(f'.mk[data-i="{i}"] .mk-hit').click(timeout=2500, force=True)
                    elif verb == 'flow':
                        page.locator(f'.arrow[data-i="{i}"] .arrow-badge').click(timeout=2500, force=True)
                    elif verb == 'memo':
                        click(f'.memoline[data-i="{i}"]')
                    else:
                        click(f'.task button[data-i="{i}"]')
            except Exception as e:
                problems.append(f'inputs {size} {key} {mode}: could not use it: {str(e)[:110]}')
                continue
            page.wait_for_timeout(50)
            got = page.evaluate('window.__se.lastResult')
            if got is not want:
                problems.append(f'inputs {size} {key} {mode}: expected {want}, got {got}')
            if mode == 'wrong':
                seen = page.evaluate("""() => {
                    const marked = [...document.querySelectorAll('.task button.is-wrong, .task button.is-right')].filter((el) => !el.classList.contains('wordbtn') && !el.classList.contains('slot'));
                    const txt = (q) => { const el = document.querySelector(q); return el ? el.textContent : ''; };
                    return { noMark: marked.filter((el) => getComputedStyle(el, '::after').content === 'none').map((el) => el.className),
                        you: txt('.v-you'), was: txt('.was'), stamp: txt('.stampmark'), ans: txt('.v-ans'), wrongs: document.querySelectorAll('.task .is-wrong').length,
                        hiddenPick: document.querySelectorAll('.task .is-wrong.is-other').length };
                }""")
                if seen['noMark']:
                    problems.append(f'inputs {size} {key}: a marked button has no check or X: {seen["noMark"][:2]}')
                if verb in ('build', 'frq', 'label') and 'You said' not in seen['you']:
                    problems.append(f'inputs {size} {key}: the miss should say what the player said')
                if verb in ('type', 'dial') and not seen['was']:
                    problems.append(f'inputs {size} {key}: the miss should keep the number the player entered')
                if verb in ('stamp', 'truefalse') and seen['stamp'] != t['options'][ans]['label']:
                    problems.append(f'inputs {size} {key}: the form should be stamped with the right answer, not {seen["stamp"]}')
                if verb in ('sort', 'pick', 'town', 'flow', 'stamp', 'memo', 'truefalse', 'oddone', 'blank', 'word', 'compare', 'rows', 'badcell', 'bars', 'ap', 'grab', 'order', 'match', 'pile') and not seen['wrongs']:
                    problems.append(f'inputs {size} {key}: the wrong pick should stay marked')
                if seen['hiddenPick']:
                    problems.append(f'inputs {size} {key}: the wrong pick should not be dimmed like the others')
                if not seen['ans'].startswith('The answer'):
                    problems.append(f'inputs {size} {key}: the miss should give the answer')
    report.append(f'Real taps and keys worked on {len(picks)} kinds of task at {size}')
    ctx.close()


def corners(b):
    """Paths a normal game does not touch: teacher tools, a reload mid-Cup, the training room, each perk, overtime."""
    # ---------- teacher tools
    ctx, page = new_page(b, 'projector', tag='tools')
    page.locator('#go-class').click(); page.wait_for_timeout(450)
    click_main(page); page.wait_for_timeout(300)
    click_main(page); page.wait_for_timeout(300)
    click_main(page); page.wait_for_timeout(300)
    assert_screen(page, 'task', 'Start begins the first task')
    page.evaluate('window.__se.unlock()')
    page.locator('.toolsbtn').click(); page.wait_for_timeout(120)
    shot(page, 'cup/projector-tools')
    left0 = page.evaluate('window.__se.S.cup.towns[0].pay')
    page.locator('[data-act="fix"][data-i="0"][data-pay="500"]').click(); page.wait_for_timeout(50)
    if page.evaluate('window.__se.S.cup.towns[0].pay') != left0 + 500:
        problems.append('tools: +$500 should change the town money')
    page.locator('[data-act="fix"][data-i="0"][data-cpi="5"]').click(); page.wait_for_timeout(50)
    if page.evaluate('window.__se.S.cup.towns[0].cpi') != 105:
        problems.append('tools: CPI +5 should change the town CPI')
    page.locator('[data-act="close-modal"]').click(); page.wait_for_timeout(60)
    if page.evaluate('document.querySelector("#modal").hidden') is not True:
        problems.append('tools: Close should close')
    if page.evaluate('window.__se.Run.done'):
        problems.append('tools: opening tools should not answer the task')
    # the clock pauses while the tools are open and runs again after
    page.evaluate('window.__se.unlock()')
    page.locator('.toolsbtn').click(); page.wait_for_timeout(100)
    before_id = page.evaluate('window.__se.Run.t.id')
    page.locator('[data-act="tool-skip"]').click(); page.wait_for_timeout(200)
    if page.evaluate('window.__se.Run.t.id') == before_id:
        problems.append('tools: Skip this task should bring a new task')
    # a reload mid-Cup comes back
    page.reload(); page.wait_for_timeout(500)
    if page.locator('[data-act="cup-resume"]').count() != 1:
        problems.append('reload mid-Cup: home should offer Keep playing')
    page.evaluate('window.__se.unlock()')
    page.locator('[data-act="cup-resume"]').click(); page.wait_for_timeout(300)
    assert_screen(page, 'call', 'resume returns to the town call')
    if page.evaluate('window.__se.S.cup.towns[0].pay') != left0 + 500:
        problems.append('reload mid-Cup lost the money')
    # jump to payday from tools
    page.evaluate('window.__se.unlock()')
    page.locator('.toolsbtn').click(); page.wait_for_timeout(100)
    page.locator('[data-act="tool-payday"]').click(); page.wait_for_timeout(300)
    assert_screen(page, 'payday', 'Jump to payday')
    click_main(page); page.wait_for_timeout(300)
    ctx.close()

    # ---------- nothing moves on by itself after an answer
    ctx, page = new_page(b, 'phone', tag='waits')
    page.evaluate('() => { window.__se.prefs().practiced = true; }')
    page.locator('#go-solo').click(); page.wait_for_timeout(450)
    tid = page.evaluate('window.__se.Run.t.id')
    page.evaluate('window.__se.unlock(); window.__se.answerRight()')
    page.wait_for_timeout(6000)
    if page.evaluate('window.__se.Run.t.id') != tid:
        problems.append('a right answer should wait for Next, but the game moved on by itself')
    if page.locator('.verdict.right .v-next').count() != 1:
        problems.append('a right answer should show a Next button')
    shot(page, 'solo/phone-right-waits')
    page.evaluate('window.__se.unlock()')
    page.locator('.v-next').click(); page.wait_for_timeout(200)
    if page.evaluate('window.__se.Run.t.id') == tid:
        problems.append('Next should bring the next task')
    ctx.close()

    # ---------- training room
    ctx, page = new_page(b, 'phone', tag='train')
    page.locator('[data-act="train-menu"]').click(); page.wait_for_timeout(450)
    shot(page, 'solo/phone-training-menu')
    check(page, 'training menu', tray=True)
    page.locator('[data-act="train-go"][data-desk="jobs"]').click(); page.wait_for_timeout(250)
    assert_screen(page, 'task', 'training starts a task')
    if page.evaluate('window.__se.S.train.desk') != 'jobs':
        problems.append('training: wrong desk')
    if not page.evaluate('document.querySelector("#fuse").hidden'):
        problems.append('training should have no clock')
    first = page.evaluate('window.__se.Run.t.id')
    page.evaluate('window.__se.answerWrong()'); page.wait_for_timeout(120)
    click_main(page); page.wait_for_timeout(100)
    back = False
    for _ in range(5):
        if page.evaluate('window.__se.Run.t.id') == first:
            back = True
        page.evaluate('window.__se.unlock(); window.__se.answerRight()'); page.wait_for_timeout(40)
        if page.evaluate('window.__se.Run.t.desk') not in ('jobs',):
            problems.append('training gave another desk: ' + page.evaluate('window.__se.Run.t.id'))
        click_main(page); page.wait_for_timeout(60)
    if not back:
        problems.append('training: a miss should come back')
    page.evaluate('window.__se.unlock()')
    page.locator('.tk-skip').click(); page.wait_for_timeout(250)
    assert_screen(page, 'trainend', 'Stop practicing ends training')
    shot(page, 'solo/phone-training-end')
    ctx.close()

    # ---------- AP style practice, from the home screen, and the formula sheet
    for size in ('phone', 'laptop'):
        ctx, page = new_page(b, size, tag=f'ap-{size}')
        check(page, f'home {size}')
        page.locator('#go-ap').click(); page.wait_for_timeout(500)
        assert_screen(page, 'task', 'AP style starts a task')
        if page.evaluate('window.__se.S.train.desk') != 'ap':
            problems.append('AP style: wrong practice topic')
        desks, last = set(), None
        for i in range(16):
            t = page.evaluate('() => ({verb: window.__se.Run.t.verb, desk: window.__se.Run.t.desk, again: !!window.__se.Run.t.again, answer: window.__se.Run.t.answer, n: window.__se.Run.t.options.length})')
            if t['verb'] != 'ap':
                problems.append(f'AP style dealt a {t["verb"]} task')
            desks.add(t['desk'])
            pick = t['answer'] if i % 3 else (t['answer'] + 1) % t['n']
            page.evaluate('window.__se.unlock()')
            page.locator(f'.task button[data-i="{pick}"]').click(); page.wait_for_timeout(200)
            if not page.locator('.v-learn').count():
                problems.append(f'AP style {size}: no formula or rule under the answer')
            if i in (0, 1):
                shot(page, f'ap/{size}-{"miss" if i == 0 else "right"}')
                check(page, f'AP style {"miss" if i == 0 else "right"} {size}')
            page.evaluate('window.__se.unlock()')
            page.locator('.v-next').click(); page.wait_for_timeout(120)
        if len(desks) < 7:
            problems.append(f'AP style {size}: only {len(desks)} topics in 16 questions')
        page.evaluate('window.__se.unlock()')
        page.locator('.tk-skip').click(); page.wait_for_timeout(250)
        assert_screen(page, 'trainend', 'Stop practicing ends AP style')
        if 'Five-choice' not in page.locator('h1.big').inner_text():
            problems.append('AP style: the end screen should name the topic')
        click_main(page); page.wait_for_timeout(300)
        assert_screen(page, 'home', 'Home after AP style')
        page.evaluate('window.__se.unlock()')
        page.locator('[data-act="formulas"]').click(); page.wait_for_timeout(300)
        assert_screen(page, 'formulas', 'the formula sheet opens')
        if page.locator('.fs-desk').count() != 8 or page.locator('.fs-desk li').count() < 30:
            problems.append('formula sheet: expected eight topics and at least 30 lines')
        shot(page, f'ap/{size}-formula-sheet')
        check(page, f'formula sheet {size}', tray=True)
        click_main(page); page.wait_for_timeout(300)
        assert_screen(page, 'home', 'Back from the formula sheet')
        ctx.close()
    report.append('AP style practice and the formula sheet: exercised at phone and laptop')

    # ---------- perks: each one changes what it says it changes
    ctx, page = new_page(b, 'laptop', tag='perks')
    page.evaluate('() => { window.__se.prefs().practiced = true; }')
    page.locator('#go-solo').click(); page.wait_for_timeout(450)
    def to_promo():
        for _ in range(8):
            page.evaluate('window.__se.unlock()')
            if page.evaluate('window.__se.S.screen') == 'promo':
                return
            page.evaluate('window.__se.answerRight()'); page.wait_for_timeout(15)
            page.evaluate('window.__se.next()'); page.wait_for_timeout(15)
    to_promo()
    assert_screen(page, 'promo', 'six tasks lead to a promotion')
    # cost-of-living raise: no CPI jump
    page.evaluate("() => { window.__se.S.solo.perk = 'cola'; }")
    page.evaluate('window.__se.unlock()')
    page.evaluate("""() => { const el = document.querySelector('.perk'); el.dataset.id = 'cola'; el.click(); }""")
    page.wait_for_timeout(60)
    cpi = page.evaluate('window.__se.S.solo.cpi')
    page.evaluate('window.__se.unlock(); window.__se.answerWrong()'); page.wait_for_timeout(120)
    if page.evaluate('window.__se.S.solo.cpi') != cpi:
        problems.append('Cost-of-living raise should stop the CPI jump')
    click_main(page); page.wait_for_timeout(60)
    # second opinion: a choice is crossed out on the next task with 3+ options
    page.evaluate("() => { window.__se.S.solo.perk = 'second'; }")
    crossed = False
    for _ in range(4):
        page.evaluate('window.__se.unlock(); window.__se.answerRight()'); page.wait_for_timeout(15)
        page.evaluate('window.__se.next()'); page.wait_for_timeout(40)
        scr = page.evaluate('window.__se.S.screen')
        if scr != 'task':
            break
        verb = page.evaluate('window.__se.Run.t.verb')
        n = page.locator('.struck').count()
        if verb not in ('stamp', 'grab') and n >= 1:
            crossed = True
            break
    if not crossed:
        problems.append('Second opinion should cross out a wrong answer')
    # long lunch: a skip button that adds no slip and no pay
    page.evaluate("() => { const so = window.__se.S.solo; so.perk = 'lunch'; so.lunchUsed = false; so.inRank = 0; }")
    page.evaluate('window.__se.unlock(); window.__se.answerRight()'); page.wait_for_timeout(15)
    page.evaluate('window.__se.next()'); page.wait_for_timeout(250)
    if page.locator('[data-act="lunch"]').count() != 1:
        problems.append('Long lunch should show a skip button')
    else:
        before = state(page)
        page.evaluate('window.__se.unlock()')
        page.locator('[data-act="lunch"]').click(); page.wait_for_timeout(250)
        after = state(page)
        if after['pay'] != before['pay'] or after['slips'] != before['slips']:
            problems.append('Long lunch should cost nothing and pay nothing')
        if page.locator('[data-act="lunch"]').count() != 0:
            problems.append('Long lunch should work once a rank')
    ctx.close()

    # ---------- overtime: after the win you can keep going until you are fired
    ctx, page = new_page(b, 'phone', tag='overtime')
    page.evaluate('() => { window.__se.prefs().practiced = true; }')
    page.locator('#go-solo').click(); page.wait_for_timeout(450)
    for _ in range(90):
        page.evaluate('window.__se.unlock()')
        scr = page.evaluate('window.__se.S.screen')
        if scr == 'win':
            break
        if scr == 'task':
            page.evaluate('window.__se.answerRight()'); page.wait_for_timeout(10); page.evaluate('window.__se.next()')
        elif scr == 'promo':
            page.locator('.perk').first.click()
        elif scr in ('bossintro', 'bossdone'):
            click_main(page)
        page.wait_for_timeout(15)
    assert_screen(page, 'win', 'all right should reach the win')
    page.evaluate('window.__se.unlock()')
    page.locator('[data-act="overtime"]').click(); page.wait_for_timeout(250)
    assert_screen(page, 'task', 'overtime brings more tasks')
    shot(page, 'solo/phone-overtime')
    for _ in range(3):
        page.evaluate('window.__se.unlock(); window.__se.answerWrong()'); page.wait_for_timeout(50)
        click_main(page); page.wait_for_timeout(50)
    assert_screen(page, 'fired', 'three misses in overtime still fire you')
    page.evaluate('window.__se.unlock()')
    page.locator('[data-v="look"]').click(); page.wait_for_timeout(300)
    shot(page, 'solo/phone-status-look')
    click_main(page); page.wait_for_timeout(300)
    so = page.evaluate('({a: window.__se.S.solo.payQ && window.__se.S.solo.payQ.answer})')
    # a wrong payday answer gets no bonus
    wrong = (so['a'] + 1) % 4
    page.evaluate('window.__se.unlock()')
    page.locator(f'[data-act="payq"][data-i="{wrong}"]').click(); page.wait_for_timeout(120)
    if page.evaluate('window.__se.S.solo.bonus') != 0:
        problems.append('a wrong payday answer should get no bonus')
    click_main(page); page.wait_for_timeout(250)
    page.evaluate('window.__se.unlock()')
    page.locator('[data-act="solo-again"]').click(); page.wait_for_timeout(250)
    st = state(page)
    if st['pay'] != 0 or st['cpi'] != 100 or st['rank'] != 0:
        problems.append(f'Clock back in should start fresh: {st}')
    ctx.close()
    report.append('Teacher tools, reload, training room, perks, overtime: exercised')


def tour_dark(b):
    """Dark mode and reduced motion on a sample of screens."""
    ctx, page = new_page(b, 'phone', theme='dark', tag='dark', reduced=True)
    shot(page, 'dark/phone-home')
    tasks = page.evaluate('''() => { const seen = {}; window.__se.B.everyTask(4).forEach(t => { seen[t.verb] = seen[t.verb] || t.id; }); return seen; }''')
    for verb, tid in tasks.items():
        page.evaluate('(id) => { const t = window.__se.B.everyTask(4).find(x => x.id === id); window.__se.show(t, {hints:true}); }', tid)
        page.wait_for_timeout(40)
        shot(page, f'dark/phone-{verb}')
        check(page, f'dark {verb}')
    ctx.close()
    ctx, page = new_page(b, 'projector', theme='dark', tag='dark-proj')
    shot(page, 'dark/projector-home')
    ctx.close()


def sound_state(page):
    return page.evaluate('window.__se.sound.state()')


def wait_for(page, test, label, ms=4000):
    waited = 0
    while waited < ms:
        if test(sound_state(page)):
            return True
        page.wait_for_timeout(100)
        waited += 100
    problems.append(f'sound: {label} (state {sound_state(page)})')
    return False


def clear_of_mute(page, label):
    """The corner button must not sit on top of anything a student reads or taps."""
    hit = page.evaluate("""() => {
      const m = document.querySelector('#mute');
      if (!m || m.hidden) return null;
      const a = m.getBoundingClientRect();
      const out = [];
      document.querySelectorAll('#hud b, #hud span, #stage h1, #stage h2, #stage p, #stage button, #stage td, #tray .doline, #tray button').forEach((el) => {
        if (!el.offsetParent) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        const boxes = el.tagName === 'BUTTON' ? [el.getBoundingClientRect()] : Array.from(range.getClientRects());
        for (const b of boxes) {
          if (b.width && b.height && b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top) { out.push(el.tagName + ': ' + (el.textContent || '').trim().slice(0, 30)); break; }
        }
      });
      return out;
    }""")
    if hit:
        problems.append(f'sound: mute button covers {hit[:3]} on {label}')


def sound_rules(b):
    # 1. Nothing starts before a tap, and the home screen offers both switches.
    ctx, page = new_page(b, 'phone', tag='sound')
    requests = []
    page.on('request', lambda r: requests.append(r.url))
    if sound_state(page)['ctx'] is not None:
        problems.append('sound: audio started before any tap')
    tools = page.locator('.home-tools').inner_text()
    if 'Music: on' not in tools or 'Sound: on' not in tools:
        problems.append(f'sound: home switches read {tools!r}')
    if page.locator('#mute').is_visible():
        problems.append('sound: corner button shows on the home screen')

    # 2. The first tap starts the piano.
    page.locator('#go-solo').click()
    page.wait_for_timeout(300)
    if sound_state(page)['ctx'] != 'running':
        problems.append(f'sound: audio is not running after the first tap: {sound_state(page)}')
    wait_for(page, lambda s: s['playing'] and s['scene'] == 'calm' and s['bars'] >= 1, 'music did not start on the orientation screen')
    if not page.locator('#mute').is_visible():
        problems.append('sound: corner button missing in the game')
    clear_of_mute(page, 'orientation')

    # 3. A right answer stamps, a wrong one slides a pink slip, and rank moves the band.
    click_main(page)
    page.wait_for_timeout(150)
    if sound_state(page)['scene'] != 'calm':
        problems.append(f'sound: the practice task should stay on the calm piano: {sound_state(page)}')
    page.evaluate('window.__se.sound.clearLog(); window.__se.unlock(); window.__se.answerRight()')
    if page.evaluate('window.__se.sound.log()')[:1] != ['right']:
        problems.append(f'sound: right answer played {page.evaluate("window.__se.sound.log()")}')
    click_main(page)
    page.wait_for_timeout(150)
    state_now = sound_state(page)
    if state_now['scene'] != 'work' or state_now['level'] != 0:
        problems.append(f'sound: first real task should be the Intern band: {state_now}')
    if 'paper' not in page.evaluate('window.__se.sound.log()'):
        problems.append('sound: a new task did not play the paper sound')
    page.evaluate('window.__se.sound.clearLog(); window.__se.unlock(); window.__se.answerWrong()')
    if 'miss' not in page.evaluate('window.__se.sound.log()'):
        problems.append(f'sound: wrong answer played {page.evaluate("window.__se.sound.log()")}')
    page.wait_for_timeout(150)
    clear_of_mute(page, 'after a miss')

    # 4. Play to the first promotion and the first Release.
    page.evaluate('window.__se.sound.clearLog()')
    steps, promos, releases = 0, 0, 0
    while steps < 120 and not (promos >= 2 and releases >= 1):
        steps += 1
        page.evaluate('window.__se.unlock()')
        scr = page.evaluate('window.__se.S.screen')
        clear_of_mute(page, scr)
        if scr == 'task':
            page.evaluate('window.__se.answerRight()')
            page.wait_for_timeout(20)
            st = sound_state(page)
            boss = page.evaluate('!!(window.__se.S.solo && window.__se.S.solo.boss)')
            if boss:
                releases += 1
                if st['scene'] != 'release':
                    problems.append(f'sound: Release should have its own music: {st["scene"]}')
            elif st['scene'] != 'work' or st['level'] != page.evaluate('window.__se.S.solo.rank'):
                problems.append(f'sound: band {st["scene"]} {st["level"]} does not match rank')
            page.evaluate('window.__se.next()')
            page.wait_for_timeout(20)
        elif scr == 'promo':
            promos += 1
            if 'promoted' not in page.evaluate('window.__se.sound.log()'):
                problems.append('sound: promotion played no sound')
            page.locator('.perk').first.click()
            page.wait_for_timeout(20)
        else:
            click_main(page)
            page.wait_for_timeout(20)
    if promos < 2 or releases < 1:
        problems.append(f'sound: walk reached {promos} promotions and {releases} Release steps')
    if page.evaluate('window.__se.sound.log().includes("release")') is False and releases >= 3:
        problems.append('sound: a clean Release played no sound')

    # 5. The corner button and the M key silence everything, at once, and it sticks.
    page.locator('#mute').click()
    page.wait_for_timeout(350)
    st = sound_state(page)
    if st['playing'] or st['ctx'] == 'running':
        problems.append(f'sound: mute left audio going: {st}')
    if page.locator('#mute').get_attribute('aria-pressed') != 'true':
        problems.append('sound: mute button does not show it is pressed')
    page.evaluate('window.__se.sound.clearLog(); window.__se.sound.play("right")')
    if page.evaluate('window.__se.sound.heard()'):
        problems.append('sound: an effect played while muted')
    page.keyboard.press('m')
    page.wait_for_timeout(350)
    wait_for(page, lambda s: s['playing'] and s['ctx'] == 'running', 'M key did not bring the music back')
    page.keyboard.press('m')
    page.wait_for_timeout(250)
    page.reload()
    page.wait_for_timeout(450)
    tools = page.locator('.home-tools').inner_text()
    if 'Music: off' not in tools or 'Sound: off' not in tools:
        problems.append(f'sound: mute was not remembered: {tools!r}')

    # 6. The home switches work one at a time.
    page.locator('[data-act="toggle-sfx"]').click()
    page.wait_for_timeout(250)
    st = sound_state(page)
    tools = page.locator('.home-tools').inner_text()
    if 'Sound: on' not in tools or 'Music: off' not in tools or st['playing']:
        problems.append(f'sound: effects-only switch reads {tools!r}, {st}')
    page.locator('[data-act="toggle-music"]').click()
    wait_for(page, lambda s: s['playing'], 'music switch did not start the music')
    page.locator('[data-act="toggle-sfx"]').click()
    page.wait_for_timeout(120)
    page.evaluate('window.__se.sound.clearLog(); window.__se.sound.play("tap")')
    if page.evaluate('window.__se.sound.heard()'):
        problems.append('sound: effect played with Sound off and Music on')
    if not sound_state(page)['playing']:
        problems.append('sound: turning Sound off stopped the music')
    page.locator('[data-act="toggle-sfx"]').click()

    # 7. A hidden tab goes quiet and comes back.
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }""")
    page.wait_for_timeout(250)
    if sound_state(page)['ctx'] != 'suspended':
        problems.append(f'sound: hidden tab kept playing: {sound_state(page)}')
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }""")
    wait_for(page, lambda s: s['ctx'] == 'running', 'audio did not come back when the tab returned')

    # 8. Nothing was downloaded for any of this.
    outside = [u for u in requests if not u.startswith('file:') and not u.startswith('data:') and 'fonts.g' not in u]
    if outside:
        problems.append(f'sound: outside requests {outside[:3]}')
    if page.locator('audio, video').count():
        problems.append('sound: page has an audio or video tag')
    ctx.close()

    # 9. Firing: the door, then silence, then the piano at payday.
    ctx, page = new_page(b, 'laptop', tag='sound-fired')
    page.locator('#go-solo').click()
    page.wait_for_timeout(300)
    click_main(page)
    page.wait_for_timeout(100)
    page.evaluate('window.__se.unlock(); window.__se.answerRight()')
    click_main(page)
    page.wait_for_timeout(100)
    for _ in range(3):
        page.evaluate('window.__se.unlock(); window.__se.answerWrong()')
        page.wait_for_timeout(30)
        page.evaluate('window.__se.unlock(); window.__se.next()')
        page.wait_for_timeout(30)
    wait_for(page, lambda s: s['scene'] == 'none' and not s['playing'], 'music kept playing after being fired')
    if 'fired' not in page.evaluate('window.__se.sound.log()'):
        problems.append('sound: firing played no door')
    clear_of_mute(page, 'fired')
    page.evaluate('window.__se.unlock()')
    page.locator('[data-act="status"]').first.click()
    page.wait_for_timeout(120)
    wait_for(page, lambda s: s['scene'] == 'calm' and s['playing'], 'piano did not come back after the firing', ms=6000)
    clear_of_mute(page, 'status')
    ctx.close()

    # 10. The class game: both switches in Tools, a steal knocks and pulls the music down, no corner button.
    ctx, page = new_page(b, 'projector', tag='sound-class')
    page.locator('#go-class').click()
    page.wait_for_timeout(200)
    if page.locator('#mute').is_visible():
        problems.append('sound: corner button shows in class setup')
    if page.locator('[data-act="toggle-music"]').count() != 1 or page.locator('[data-act="toggle-sfx"]').count() != 1:
        problems.append('sound: class setup is missing a switch')
    click_main(page)
    page.wait_for_timeout(150)
    click_main(page)
    page.wait_for_timeout(150)
    guard = 0
    while page.evaluate('window.__se.S.screen') != 'task' and guard < 8:
        guard += 1
        page.evaluate('window.__se.unlock()')
        click_main(page)
        page.wait_for_timeout(120)
    if sound_state(page)['scene'] != 'work':
        problems.append(f'sound: class task should have the band: {sound_state(page)}')
    page.evaluate('window.__se.sound.clearLog(); window.__se.unlock(); window.__se.answerWrong()')
    page.wait_for_timeout(80)
    log = page.evaluate('window.__se.sound.log()')
    if 'knock' not in log or 'miss' not in log:
        problems.append(f'sound: class miss played {log}')
    if not sound_state(page).get('dipped'):
        problems.append('sound: music did not dip for the steal')
    page.locator('[data-act="tools"]').click()
    page.wait_for_timeout(120)
    labels = page.locator('#modal').inner_text()
    if 'Music: on' not in labels or 'Sound: on' not in labels:
        problems.append(f'sound: Tools switches read {labels[:200]!r}')
    page.locator('[data-act="close-modal"]').click()
    page.evaluate('window.__se.closeSteal && window.__se.closeSteal(null)')
    page.wait_for_timeout(80)
    if sound_state(page).get('dipped'):
        problems.append('sound: music stayed down after the steal')
    if page.locator('#mute').is_visible():
        problems.append('sound: corner button shows during the class game')
    ctx.close()

    # 11. A browser with no audio at all still plays the whole game.
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    page.add_init_script('delete window.AudioContext; delete window.webkitAudioContext;')
    page.on('pageerror', lambda e: errors.append(f'[no-audio] pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'[no-audio] console.{m.type}: {m.text}') if m.type == 'error' and 'fonts.g' not in m.text else None)
    page.goto(PAGE)
    page.wait_for_timeout(450)
    page.locator('#go-solo').click()
    page.wait_for_timeout(450)
    click_main(page)
    page.wait_for_timeout(100)
    page.evaluate('window.__se.unlock(); window.__se.answerRight()')
    click_main(page)
    page.wait_for_timeout(100)
    page.evaluate('window.__se.unlock(); window.__se.answerWrong()')
    if sound_state(page)['ctx'] is not None:
        problems.append('sound: claims audio in a browser with none')
    ctx.close()

    # 11b. Audio that fails in the middle of a game must not stop the game.
    for label, script in [
        ('constructor throws', 'window.AudioContext = function () { throw new Error("no audio here"); }; delete window.webkitAudioContext;'),
        ('sources throw after a few', 'const real = AudioContext.prototype.createBufferSource; let n = 0; AudioContext.prototype.createBufferSource = function () { if (++n > 3) throw new Error("audio died"); return real.call(this); };'),
        ('gains throw after a few', 'const real = AudioContext.prototype.createGain; let n = 0; AudioContext.prototype.createGain = function () { if (++n > 40) throw new Error("audio died"); return real.call(this); };'),
        ('resume throws', 'AudioContext.prototype.resume = function () { throw new Error("no resume"); };'),
    ]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844})
        page = ctx.new_page()
        page.add_init_script(script)
        page.on('pageerror', lambda e, l=label: errors.append(f'[broken audio: {l}] pageerror: {e}'))
        page.goto(PAGE)
        page.wait_for_timeout(450)
        page.locator('#go-solo').click()
        page.wait_for_timeout(350)
        click_main(page)
        page.wait_for_timeout(150)
        page.evaluate('window.__se.unlock(); window.__se.answerRight()')
        click_main(page)
        page.wait_for_timeout(150)
        for k in range(3):
            page.evaluate('window.__se.unlock(); window.__se.answerRight()')
            page.wait_for_timeout(40)
            page.evaluate('window.__se.unlock(); window.__se.next()')
            page.wait_for_timeout(40)
        page.evaluate('window.__se.unlock(); window.__se.answerWrong()')
        page.wait_for_timeout(40)
        pay = page.evaluate('window.__se.S.solo.pay')
        if pay <= 0 or page.evaluate('window.__se.S.solo.slips') != 1:
            problems.append(f'sound: game stalled with broken audio ({label}): pay {pay}')
        ctx.close()

    # 12. The first tap should not stutter: how long the effects take to prepare, on a slow phone.
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    client = ctx.new_cdp_session(page)
    client.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    page.goto(PAGE)
    page.wait_for_timeout(600)
    cost = page.evaluate("""() => {
      const A = window.SE_AUDIO, t0 = performance.now();
      A.Dsp.SFX_NAMES.concat(A.Dsp.DRUM_NAMES).forEach((n) => { for (let v = 0; v < A.Dsp.variants(n); v++) A.Dsp.fx(n, v); });
      const fx = performance.now() - t0;
      let worst = 0;
      A.Dsp.KEY_NOTES.forEach((m) => { const t = performance.now(); A.Dsp.piano(m); worst = Math.max(worst, performance.now() - t); });
      return { fx: Math.round(fx), worstNote: Math.round(worst), keys: Math.round(performance.now() - t0 - fx) };
    }""")
    report.append(f'sound: first tap on a 4x slower device: effects {cost["fx"]} ms, piano {cost["keys"]} ms in steps, worst step {cost["worstNote"]} ms')
    if cost['fx'] > 250 or cost['worstNote'] > 180:
        problems.append(f'sound: preparing audio is slow on a phone: {cost}')
    ctx.close()

    # 13. A real render through the whole chain is clean and neither silent nor clipped.
    ctx, page = new_page(b, 'laptop', tag='sound-render')
    result = page.evaluate("""async () => {
      const buf = await window.SE_AUDIO.renderClip({ seconds: 14, seed: 3, events: [{ t: 0, scene: 'work', level: 3 }, { t: 2, sfx: 'right' }, { t: 5, sfx: 'miss' }, { t: 8, sfx: 'promoted', o: { level: 4, tore: true } }, { t: 8.01, scene: 'work', level: 4 }] });
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      let bad = 0, peak = 0, sum = 0;
      for (let i = 0; i < l.length; i++) { if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) bad++; peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); sum += l[i] * l[i]; }
      return { bad, peak, rms: Math.sqrt(sum / l.length) };
    }""")
    if result['bad'] or result['peak'] >= 0.8 or result['rms'] < 0.005:
        problems.append(f'sound: render {result}')
    report.append(f'sound: render peak {result["peak"]:.2f}, rms {result["rms"]:.3f}')
    ctx.close()
    report.append('sound: rules checked at phone, laptop, projector, and with no audio')


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        if MODE in ('all', 'solo'):
            for size in ('phone', 'laptop', 'projector'):
                play_solo_right(b, size)
                play_solo_fired(b, size)
            play_timeout(b)
        if MODE in ('all', 'class'):
            play_cup(b, 'projector')
            play_cup(b, 'laptop')
            play_cup(b, 'phone')
        if MODE in ('all', 'cover'):
            cover(b, 'phone')
            cover(b, 'laptop')
            cover(b, 'projector', every=3)
            cover_miss(b, 'phone')
            cover_miss(b, 'laptop', every=2)
            cover_miss(b, 'projector', every=5)
        if MODE in ('all', 'story'):
            story(b)
        if MODE in ('all', 'inputs'):
            real_inputs(b, 'phone')
            real_inputs(b, 'laptop')
        if MODE in ('all', 'calc'):
            for size in ('phone', 'small', 'laptop', 'projector'):
                calculator(b, size)
        if MODE in ('all', 'corners'):
            corners(b)
        if MODE in ('all', 'shots'):
            tour_dark(b)
        if MODE in ('all', 'sound'):
            sound_rules(b)
        b.close()
    print('\n'.join(report))
    uniq = list(dict.fromkeys(errors + problems))
    if uniq:
        print(f'\n{len(uniq)} PROBLEMS')
        for x in uniq[:60]:
            print(' -', x)
        if len(uniq) > 60:
            print(f' ... and {len(uniq) - 60} more')
        sys.exit(1)
    print('\nALL CHECKS PASSED')


main()
