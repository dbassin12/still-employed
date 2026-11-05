# Still Employed

A review game for AP Macroeconomics Unit 2 (circular flow and GDP, limitations of GDP, unemployment, price indices, costs of inflation, real v. nominal GDP, business cycles), plus a few micro flashbacks. Built for one section of about 18 seniors, 38-minute periods. It is deliberately different from Open Outcry, the Unit 1 game (~/projects/open-outcry): no betting, no price board, no 1-to-4 quiz loop. Lesson decks and worksheets stay free of games; this is a stand-alone app for review day and home study.

## The game

You work your first job at the made-up Five Towns Bureau of Statistics. There are 27 kinds of question and over 2,800 tasks, and each shift deals a random mix, so nobody sees them all and a win takes under 2% of the bank. The wall color tells you which desk (topic) a task comes from. The kinds: stamp, sort, tap a point on a chart, move a person in a town of 100, route money on the circular flow, build a fraction, pick the number, catch the mistake in a memo, tap all that fit, true or false, odd one out, put in order, match them, fill the blank, tap the wrong word, compare two cards, type the answer on a keypad, set the dial, set the arrows, tap the row in a table, sort a pile of cards, tap the wave, finish the FRQ sentence, read the bars, find the bad number in a table, label a diagram, and AP-style five-choice questions.

- **Play on my own.** Six tasks a rank, Intern to Commissioner. A miss or running out of time is a pink slip and raises your CPI 10 points. Three slips and you are fired. Each promotion tears up one slip and offers one of three perks. Junior Analyst, Senior Analyst, and Commissioner end with a Release: a chain of linked steps (the last is FRQ style, five parts). A wrong Release step raises your CPI but gives no slip. A clean Release pays a bonus and tears up a slip. Being fired asks if you are looking for work and shows where that puts you (unemployed, frictional, or a discouraged worker out of the labor force). Payday asks the student to compute their own real pay (right is +$250). Score is real pay = pay / CPI x 100. Then name, answer your misses again, and a results card to screenshot. Nothing is sent anywhere.
- **Practice a topic.** No clock, no slips. Misses come back three tasks later.
- **Play as a class: the Five Towns Cup.** Projected. Towns are teams of 3 or 4. One player per town takes the computer for four tasks. Teammates can help and rivals can shout wrong answers. A miss raises that town's CPI 5 points and opens an eight-second steal: the first rival to shout the right answer, and the teacher taps their town, either during the eight seconds or after the answer shows. Halfway there is a price check (work out real pay). The final is five FRQ-style parts on whiteboards at $500 each. Payday shows everyone's dollars, then the same bars with prices taken out, and the order can flip. Then What the room missed lists every missed task for the last minutes of class. Default 3 rounds (about 34 minutes, an estimate). 2 rounds runs about 25. 4 rounds gives all 18 students a turn but runs about 43 minutes, longer than a period.

## Files

- `src/records.js`: the second batch of hand-written questions, as plain data.
- `src/bank.js`: the first nine task types and the rules for dealing them. Records (GDP, PEOPLE, EFFECTS, and so on) feed one or more `kind`s, so one scenario can be a stamp, a sort, and a chip, all from one key. Math uses explicit number sets in `SETS`, and every wrong option carries a named mistake. `scheduler` picks a task type first so no type wins just by having more number sets, then a topic that needs coverage, prefers tasks not seen on this device, and brings misses back. Answer positions are shuffled on every deal unless their order means something (C, I, G, Xn).
- `src/bank2.js`: the other 18 task types, built from `records.js` and from number sets written out there.
- `src/bank.test.js`: run `node --test src/bank.test.js`. Recomputes every answer with separate formulas, re-reads the town counts, tables, bars, and the chart curve, checks clocks and the randomness of the deal, and checks the word rules (no em dashes, no gambling words, kosher, no Saturday, no ribbis). `tools/testbank-guard.local.json` is ignored by git on purpose: it holds details of the real test, so never commit it or copy its contents into a tracked file.
- `src/app.js`: the engine. Sections: helpers, sound, clock, task views (one per verb), runner, Solo, firing and payday, misses and card, training room, the Cup, tools, events. `window.__se` is the test hook.
- `src/style.css`: all styling. Everything is in rem, and the root size follows the screen. Desk walls and town colors are tokens on :root.
- `src/shell.html`, `build.py`: `python3 build.py` writes `dist/index.html` (the complete page) and `dist/artifact.html`.
- `tools/playtest.py`: run with `~/projects/open-outcry/.venv/bin/python tools/playtest.py` (uses installed Chrome). Plays full Solo runs and a full Cup at phone, Chromebook, and projector sizes, renders every task before and after a miss, makes real taps and key presses on every kind of task, and checks money math, overflow, tiny text, dashes, and one main button. Prints ALL CHECKS PASSED.
- `tools/dump_key.js`: writes `docs/answer-key.md`, a plain-text key of every task, for the teacher and for reviewers. The key stays on this computer: git ignores it, so it never becomes a public page. Run the tool to regenerate it.
- Hosting: GitHub Pages from `main` of `dbassin12/still-employed`, same as Open Outcry. `index.html` at the root sends visitors to `dist/`.

## Content rules

- Vocabulary follows the Unit 2 Review Sheet and decks: Xn, Potential Real GDP, expansion and contraction as phases with peak and trough as turning points (College Board's Oct 2026 correction), CPI overstates true inflation, Gains / Loses / Protected.
- If you add a task, recompute the answer, make sure no wrong option is defensible, and rerun the tests. Do not copy from the teacher's test bank: students play this before the test, and this repo is public.
- One defensible answer, whatever the deal. Tap the wrong word: only one tappable word may make the sentence true, so the others must be words no swap can fix. Odd one out: all four options must be the same kind of thing, or a student can defend a second answer. Put in order: merge any two steps that could honestly swap. AP style: the key should not be the longest option, and every wrong option should belong to the topic.
- Voice: plain, short sentences, no em or en dashes anywhere. Kosher-friendly. Nothing that implies work on Shabbos. No interest-bearing loan between two private people: a bank, firm, or government must be one side. No gambling words or casino look.
- The Bureau stays made up and the jokes stay apolitical. Do not name a real agency head or a real firing.

## How much of the bank a student sees

Tripling the bank did not lengthen the game. A win is still six ranks of six tasks plus 10 release steps, and it is dealt at random. The teacher's words: "students don't need to do all the questions to win the game." The class game skips AP-style and find-the-bad-number tasks because they run long for one player's turn.

## Pacing rules

The teacher's first read of the finished game was "too fast" (Nov 5, 2026). At 18 seconds a stamp and 42 for math it was "still a little too fast." So: at least 20 seconds for a simple task and 55 for math, with a floor for each of the 27 types (`VERB_CLOCK`, checked in `bank.test.js`), the top rank keeps at least 80% of the clock, the clock runs only during a task, and nothing moves on by itself after an answer. Every answer waits for Next.

## Page rules

One self-contained HTML page. No backend, no accounts, no frameworks. The only outside request is Google Fonts, with fallbacks. No alert, confirm, or prompt. localStorage can be blocked, so it goes through `store`. Must read from the back of a classroom on a projector and fit a 390px phone with no sideways scrolling, in light and dark. Respect reduced motion. Keys 1 to 9 pick answers; Enter, Space, or the right arrow goes on. One do-this-now line and at most one main button on every screen that is not a task. A miss shows the student's pick with an X and the right answer with a check, so color is never the only signal; where the key replaces the pick (build, FRQ sentence, label), a "You said" line keeps it.
