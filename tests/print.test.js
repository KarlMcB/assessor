import { newBank, newQuestion, newLibrary } from '../js/model.js';
import { newTest, addToTest } from '../js/testmodel.js';
import { buildVersions, versionMap } from '../js/print/versions.js';
import { choiceLabel, choiceKey, normalizeLayout, normalizePrint, fillTokens, alternationAllowed } from '../js/print/layout.js';
import { answerText, questionBlock } from '../js/print/render.js';
import { eq, ok } from './assert.js';

function setup(n = 6) {
  const lib = newLibrary();
  const bank = newBank('B');
  for (let i = 0; i < n; i++) {
    const q = newQuestion(i % 2 ? 'mc' : 'tf');
    q.stem = `Q${i + 1}`;
    if (q.choices) {
      q.choices.forEach((c, k) => (c.text = `c${k}`));
      q.choices[0].correct = true;
      q.choices[3].lockPosition = true;
    }
    bank.questions.push(q);
  }
  lib.banks.push(bank);
  const test = newTest('T');
  addToTest(test, bank.questions.map((q) => ({ bank, q })));
  return { lib, test };
}

const layout = normalizeLayout({});
const stemsOf = (v) => v.sections.flatMap((s) => s.items.map((e) => e.question.stem));

export default {
  'choice labels and alternation'() {
    eq(choiceLabel(1, 1, layout), 'B.');
    eq(choiceLabel(1, 1, { ...layout, choiceStyle: '(a)' }), '(b)');
    eq(choiceLabel(2, 1, { ...layout, choiceStyle: '1.' }), '3.');
    const alt = { ...layout, alternateChoices: true };
    eq(choiceLabel(0, 1, alt), 'A.');
    eq(choiceLabel(0, 2, alt), 'F.');
    eq(choiceLabel(3, 2, alt), 'J.');
    eq(choiceKey(3, 2, alt), 'J');
  },

  'alternation needs 5 or fewer choices'() {
    const q = newQuestion('mc');
    ok(alternationAllowed([q]));
    q.choices.push(...Array.from({ length: 2 }, () => ({ id: 'x', text: '', correct: false, lockPosition: false })));
    ok(!alternationAllowed([q]));
  },

  'tokens'() {
    eq(fillTokens('{title} p{page}/{pages} {version}', { title: 'T', page: 2, pages: 5, version: 'B' }), 'T p2/5 B');
  },

  'print options are clamped'() {
    eq(normalizePrint({ versions: 40 }).versions, 26);
    eq(normalizePrint({ versions: 0 }).versions, 1);
  },

  'version A keeps the test order; others scramble within types'() {
    const { test } = setup(10);
    const built = buildVersions(test, layout, normalizePrint({ versions: 4 }));
    eq(built.versions.map((v) => v.letter), ['A', 'B', 'C', 'D']);
    eq(stemsOf(built.versions[0]), ['Q1', 'Q3', 'Q5', 'Q7', 'Q9', 'Q2', 'Q4', 'Q6', 'Q8', 'Q10']);
    const orders = new Set(built.versions.map((v) => stemsOf(v).join()));
    ok(orders.size > 1, 'versions differ');
    for (const v of built.versions) eq(v.sections.map((s) => s.type), ['tf', 'mc']);
  },

  'versions are reproducible'() {
    const { test } = setup(10);
    const a = buildVersions(test, layout, normalizePrint({ versions: 3 }));
    const b = buildVersions(test, layout, normalizePrint({ versions: 3 }));
    eq(a.versions.map(stemsOf), b.versions.map(stemsOf));
  },

  'scrambled choices keep the locked one and the right answer'() {
    const { test } = setup(10);
    const built = buildVersions(test, layout, normalizePrint({ versions: 5 }));
    for (const v of built.versions) {
      for (const e of v.sections[1].items) {
        eq(e.question.choices[3].text, 'c3');
        eq(e.question.choices.find((c) => c.correct).text, 'c0');
        eq(answerText(e, layout, v.letter, {}), choiceKey(e.question.choices.findIndex((c) => c.correct), e.number, layout));
      }
    }
  },

  'numbering, restart and version map'() {
    const { test } = setup(4);
    const restart = { ...layout, restartNumbering: true };
    const built = buildVersions(test, restart, normalizePrint({ versions: 2 }));
    eq(built.versions[0].sections.map((s) => s.items.map((e) => e.number)), [[1, 2], [1, 2]]);
    const plain = buildVersions(test, layout, normalizePrint({ versions: 2 }));
    const rows = versionMap(plain, layout);
    eq(rows.length, 4);
    eq(rows.map((r) => r.numbers.A), [1, 2, 3, 4]);
    eq(rows.map((r) => r.numbers.B).sort(), [1, 2, 3, 4]);
  },

  'recalc gives each version its own seed'() {
    const { test } = setup(2);
    const on = buildVersions(test, layout, normalizePrint({ versions: 2, recalc: true }));
    const off = buildVersions(test, layout, normalizePrint({ versions: 2, recalc: false }));
    ok(on.versions[0].sections[0].items[0].seed !== on.versions[1].sections[0].items[0].seed);
    eq(off.versions[0].sections[0].items[0].seed, off.versions[1].sections[0].items[0].seed);
  },

  'question block has number, blank and labels'() {
    const { test } = setup(2);
    const built = buildVersions(test, layout, normalizePrint({ versions: 1 }));
    const entry = built.versions[0].sections[1].items[0];
    const html = questionBlock(entry, { layout, images: {}, version: 'A', columns: 1 });
    ok(html.includes('pq-blank'));
    ok(html.includes(`${entry.number}.`));
    ok(html.includes('>A.<') && html.includes('>D.<'));
  },
};
