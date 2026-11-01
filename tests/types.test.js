import { newBank, newLibrary, newQuestion, validateQuestion, changeType } from '../js/model.js';
import { newTest, addToTest } from '../js/testmodel.js';
import { buildVersions } from '../js/print/versions.js';
import { answerText, questionBlock } from '../js/print/render.js';
import { normalizeLayout, normalizePrint } from '../js/print/layout.js';
import { qtiItem, buildPackage } from '../js/export/qti.js';
import { makeZip } from '../js/export/zip.js';
import { readCartridge } from '../js/import/qti.js';
import { eq, ok } from './assert.js';

const layout = normalizeLayout({});
const ctx = { images: () => '', feedback: true };

function entryFor(q, version = 'A') {
  const bank = newBank('B');
  bank.questions.push(q);
  const test = newTest('T');
  addToTest(test, [{ bank, q }]);
  return buildVersions(test, layout, normalizePrint({ versions: 1, keepAOriginal: true })).versions[0].sections[0].items[0];
}

export default {
  'yes/no and modified true/false'() {
    const yn = newQuestion('yn');
    yn.stem = 'Is mass a vector?';
    yn.answer = false;
    eq(validateQuestion(yn), []);
    eq(answerText(entryFor(yn), layout, 'A', {}), 'N');
    ok(qtiItem(yn, { seed: 's', ctx }).includes('multiple_choice_question'));

    const m = newQuestion('mtf');
    m.stem = 'Force is measured in **joules**.';
    m.answer.value = false;
    ok(validateQuestion(m).some((p) => /correction/.test(p)), 'false needs a correction');
    m.answer.correction = 'newtons';
    eq(validateQuestion(m), []);
    eq(answerText(entryFor(m), layout, 'A', {}), 'F, newtons');
    const xml = qtiItem(m, { seed: 's', ctx });
    ok(xml.includes('true_false_question') && xml.includes('newtons'));
  },

  'completion'() {
    const q = newQuestion('comp');
    q.stem = 'The unit of force is the ____.';
    ok(validateQuestion(q).length === 1);
    q.answer.accepted = ['newton', 'N'];
    eq(validateQuestion(q), []);
    eq(answerText(entryFor(q), layout, 'A', {}), 'newton / N');
    const xml = qtiItem(q, { seed: 's', ctx });
    ok(xml.includes('short_answer_question') && xml.includes('>newton<') && xml.includes('>N<'));
  },

  'bimodal shows as choices or short answer'() {
    const q = newQuestion('bimodal');
    q.stem = 'Which is a vector?';
    ['mass', 'velocity', 'time', 'energy'].forEach((t, i) => (q.choices[i].text = t));
    q.choices[1].correct = true;
    eq(validateQuestion(q), []);
    const opts = { layout, images: {}, version: 'A', columns: 1 };
    ok(questionBlock(entryFor(q), opts).includes('pq-choices'));
    eq(answerText(entryFor(q), layout, 'A', {}), 'B');
    q.showAs = 'short';
    ok(!questionBlock(entryFor(q), opts).includes('pq-choices'));
    eq(answerText(entryFor(q), layout, 'A', {}), 'velocity');
    ok(qtiItem(q, { seed: 's', ctx }).includes('multiple_choice_question'));
  },

  'case and other are essay kinds'() {
    const q = newQuestion('essay');
    q.kind = 'case';
    q.stem = 'Discuss.';
    eq(validateQuestion(q), []);
    ok(qtiItem(q, { seed: 's', ctx }).includes('essay_question'));
  },

  'changing type keeps text and resets answers'() {
    const q = newQuestion('mr');
    q.stem = 'S';
    q.choices.forEach((c) => { c.text = 'x'; c.correct = true; });
    const b = changeType(q, 'bimodal');
    eq(b.choices.filter((c) => c.correct).length, 1);
    eq(b.showAs, 'mc');
    const comp = changeType(b, 'comp');
    eq(comp.stem, 'S');
    eq(comp.choices, undefined);
    eq(comp.showAs, undefined);
  },

  async 'completion round-trips through export and import'() {
    const q = newQuestion('comp');
    q.stem = 'Unit?';
    q.answer.accepted = ['newton'];
    const pkg = buildPackage(newLibrary(), 'C', [{ question: q, seed: 's', version: 'A' }]);
    const r = await readCartridge(makeZip(pkg.files), undefined);
    eq(r.banks[0].questions[0].type, 'comp');
    eq(r.banks[0].questions[0].answer.accepted, ['newton']);
  },

  'printing starts from the test’s version letter'() {
    const q = newQuestion('tf');
    q.stem = 'S';
    const bank = newBank('B');
    bank.questions.push(q);
    const test = newTest('T');
    addToTest(test, [{ bank, q }]);
    test.version = 'C';
    eq(buildVersions(test, layout, normalizePrint({ versions: 2 })).versions.map((v) => v.letter), ['C', 'D']);
  },
};
