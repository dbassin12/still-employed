'use strict';
// Writes docs/answer-key.md: every task in plain text, with the keyed answer marked by *. For the teacher and for reviewers.
// Math kinds show two number sets each, since every set uses the same formula and wrong-answer reasons (bank.test.js checks them all).
const fs = require('fs');
const path = require('path');
const B = require('../src/bank2.js');
const all = B.everyTask(21);
const counts = {};
const lines = ['# Still Employed: answer key', '', `Generated from src/bank.js. ${all.length} tasks in the game. A * marks the keyed answer.`, 'Math kinds show two number sets each; the rest of each kind uses the same formula and reasons.', ''];
const byDesk = {};
all.forEach((t) => { (byDesk[t.desk] = byDesk[t.desk] || []).push(t); });
Object.keys(B.DESKS).forEach((d) => {
  lines.push(`## ${B.DESKS[d].code} ${B.DESKS[d].long}`, '');
  (byDesk[d] || []).forEach((t) => {
    const k = t.kind;
    counts[k] = (counts[k] || 0) + 1;
    const limit = ['pick', 'build', 'type', 'dial', 'compare', 'rows', 'bars', 'badcell', 'wave', 'label', 'pile', 'oddone'].includes(t.verb) ? 2 : t.verb === 'chart' && t.chart.kind === 'cycle' ? 4 : 999;
    if (counts[k] > limit) return;
    lines.push(`**${t.id}** (${t.verb}, level ${t.lvl}). ${t.order}${t.ask ? ' ' + t.ask : ''}`);
    if (t.text) lines.push(`> ${t.text}`);
    if (t.table) lines.push(`> Data: ${t.table.map((r) => r[0] + ' = ' + r[1]).join('; ')}`);
    if (t.verb === 'order') { t.answer.forEach((idx, n) => lines.push(`- ${n + 1}. ${t.options[idx].label}`)); }
    else if (t.verb === 'match') { t.left.forEach((l, i) => lines.push(`- ${l} = ${t.right[t.answer[i]]}`)); }
    else if (t.verb === 'type' || t.verb === 'dial') { lines.push(`- * ${t.calc.shown}`); (t.wrongVals || []).forEach((w) => lines.push(`- typed ${w.v}: ${w.why}`)); }
    else if (t.verb === 'arrows') { t.rows.forEach((r) => lines.push(`- ${r.label}: * ${r.answer}`)); }
    else if (t.verb === 'compare') { t.cards.forEach((c, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${c.title}: ${c.rows.map((r) => r.join(' ')).join(', ')} -> ${c.result}`)); }
    else if (t.verb === 'rows' || t.verb === 'badcell') { lines.push(`- Columns: ${t.columns.join(' | ')}`); t.cells.forEach((row, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${row.join(' | ')}`)); if (t.fix) lines.push(`- Fix: ${t.fix}`); }
    else if (t.verb === 'bars') { t.bars.forEach((b, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${b.label}: ${b.v}${t.suf || ''}`)); if (t.line != null) lines.push(`- Natural rate line: ${t.line}`); }
    else if (t.verb === 'pile') { lines.push(`- Piles: ${t.options.map((o) => o.label).join(' / ')}`); t.cards.forEach((c) => lines.push(`- ${c.t} -> * ${t.options[c.bin].label} (${c.y})`)); }
    else if (t.verb === 'wave') { lines.push(`- Target: ${t.prop}`); }
    else if (t.verb === 'label') { t.steps.forEach((st, i) => lines.push(`- Spot ${st.spot + 1}: * ${t.options[st.answer].label}`)); }
    else if (t.verb === 'frq') { t.blanks.forEach((b, i) => lines.push(`- Blank ${i}: ${b.options.map((o, j) => (j === b.answer ? '*' + o : o)).join(' / ')}`)); }
    else if (t.verb === 'word') { lines.push(`- Wrong word: * ${t.options[t.answer].label} -> ${t.fix}`); }
    else if (t.verb === 'oddone') { t.options.forEach((o, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${o.label} [${o.tag}]`)); }
    else if (t.verb === 'memo') t.lines.forEach((l, i) => lines.push(`- ${i === t.answer ? '*WRONG LINE* ' : ''}${l}`));
    else if (t.verb === 'build') { t.tiles.forEach((x, i) => lines.push(`- ${t.answer[0] === i ? '*TOP* ' : t.answer[1] === i ? '*BOTTOM* ' : ''}${x.label}`)); lines.push(`- Fraction: ${t.build.name} = top ÷ bottom${t.build.tail}`); }
    else if (t.verb === 'grab') t.options.forEach((o, i) => lines.push(`- ${t.answer.includes(i) ? '*TAP* ' : ''}${o.label} [${o.tag}]`));
    else if (t.verb === 'town') { lines.push(`> Town of 100: ${t.town.e} employed, ${t.town.u} unemployed, ${t.town.n} not in the labor force. One person moves ${t.town.from} to ${t.town.to}.`); t.options.forEach((o, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${o.label}`)); }
    else if (t.verb === 'chart' && t.chart.kind === 'cycle') {
      const markers = t.chart.markers.map((m, i) => `point ${i + 1}: ${m.phase}, ${m.gap} gap`).join('; ');
      lines.push(`> Chart markers: ${markers}`);
      t.options.forEach((o, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${o.label}`));
    } else {
      if (t.verb === 'chart' && t.chart.kind === 'ppc' && t.chart.points) lines.push(`> PPC graph: ${t.chart.points.map((pt, i) => `point ${i + 1} is ${pt.where === 'on' ? 'on' : pt.where} the curve`).join('; ')}`);
      if (t.verb === 'chart' && t.chart.kind === 'ppc' && !t.chart.points) lines.push(`> PPC graph: the economy starts ${t.chart.dot === 'on' ? 'on' : 'inside'} the curve. After the answer ${t.chart.curve ? 'the curve shifts ' + t.chart.curve : 'the dot moves ' + (t.chart.to === 'on' ? 'back to the curve' : 'inside the curve')}.`);
      if (t.verb === 'chart' && t.chart.kind === 'sd' && t.chart.control) lines.push(`> Supply and demand graph: a ${t.chart.labor ? 'minimum wage' : 'price ' + t.chart.control.type} drawn ${t.chart.control.p > 5 ? 'above' : 'below'} equilibrium.`);
      if (t.verb === 'chart' && t.chart.kind === 'sd' && t.chart.shift) lines.push('> Supply and demand graph: after the answer the curve slides and the new price and quantity appear.');
      if (t.verb === 'chart' && t.chart.kind === 'line') lines.push(`> Line of the inflation rate: ${t.chart.pts.map((pt) => `${pt.label} = ${pt.v}%`).join('; ')}`);
      t.options.forEach((o, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${o.label}${o.why && t.verb === 'pick' ? ' (' + o.why + ')' : ''}`));
    }
    lines.push(`Why: ${t.why}`);
    if (t.work && t.work !== t.why) lines.push(`Work: ${t.work}`);
    if (t.learn) lines.push(`${t.learn.label} shown with the answer: ${t.learn.text}`);
    lines.push('');
  });
});
lines.push('## The 8:30 Release and The Big Release (sample chains)', '');
for (const tier of [0, 1, 3]) {
  B.boss(tier, B.rng(tier + 5)).forEach((t) => {
    lines.push(`**${t.title}, ${t.part}.** ${t.order}${t.ask ? ' ' + t.ask : ''}`);
    lines.push(`> Data: ${t.table.map((r) => r[0] + ' = ' + r[1]).join('; ')}`);
    t.options.forEach((o, i) => lines.push(`- ${i === t.answer ? '* ' : ''}${o.label}${o.why && t.verb === 'pick' ? ' (' + o.why + ')' : ''}`));
    lines.push(`Why: ${t.why}`, '');
  });
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'answer-key.md'), lines.join('\n'));
console.log('wrote docs/answer-key.md,', lines.length, 'lines');
