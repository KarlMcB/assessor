import {
  newLibrary, newBank, newQuestion, changeType, duplicateQuestion, validateQuestion, parseNumber,
  normalizeLibrary, bankFile, readBankFile, pruneImages, splitList, sortedByType,
} from '../js/model.js';
import { eq, ok, throws } from './assert.js';

function completeMc() {
  const q = newQuestion('mc');
  q.stem = 'Which is a vector?';
  q.choices.forEach((c, i) => (c.text = ['mass', 'velocity', 'time', 'energy'][i]));
  q.choices[1].correct = true;
  return q;
}

export default {
  'new questions get type defaults'() {
    eq(newQuestion('mc').choices.length, 4);
    eq(newQuestion('tf').answer, true);
    eq(newQuestion('essay').points, 5);
    eq(newQuestion('num').answer.toleranceType, 'abs');
  },

  'complete MC question validates'() {
    eq(validateQuestion(completeMc()), []);
  },

  'MC needs exactly one correct choice'() {
    const q = completeMc();
    q.choices[2].correct = true;
    ok(validateQuestion(q).some((p) => /exactly one/.test(p)));
  },

  'MR needs at least one correct'() {
    const q = changeType(completeMc(), 'mr');
    q.choices.forEach((c) => (c.correct = false));
    ok(validateQuestion(q).some((p) => /at least one/.test(p)));
  },

  'MR to MC keeps only the first correct choice'() {
    const q = changeType(completeMc(), 'mr');
    q.choices[3].correct = true;
    const mc = changeType(q, 'mc');
    eq(mc.choices.map((c) => c.correct), [false, true, false, false]);
    eq(mc.stem, 'Which is a vector?');
  },

  'changing to TF drops choices and keeps text'() {
    const tf = changeType(completeMc(), 'tf');
    eq(tf.choices, undefined);
    eq(tf.answer, true);
    eq(tf.stem, 'Which is a vector?');
  },

  'numeric answer must parse'() {
    const q = newQuestion('num');
    q.stem = 'KE?';
    q.answer.value = '25';
    eq(validateQuestion(q), []);
    q.answer.value = 'twenty';
    ok(validateQuestion(q).length === 1);
  },

  'parseNumber accepts physics notation'() {
    eq(parseNumber('25'), 25);
    eq(parseNumber('-4.9'), -4.9);
    eq(parseNumber('−4.9'), -4.9);
    eq(parseNumber('6.02e23'), 6.02e23);
    eq(parseNumber('1,200'), 1200);
    eq(parseNumber('1/4'), 0.25);
    ok(Number.isNaN(parseNumber('')));
    ok(Number.isNaN(parseNumber('5 J')));
  },

  'duplicate gets new ids'() {
    const q = completeMc();
    const d = duplicateQuestion(q);
    ok(d.id !== q.id);
    ok(d.choices[0].id !== q.choices[0].id);
    eq(d.stem, q.stem);
  },

  'library round-trips through JSON'() {
    const lib = newLibrary();
    const bank = newBank('Kinematics');
    bank.questions.push(completeMc());
    lib.banks.push(bank);
    const back = normalizeLibrary(JSON.parse(JSON.stringify(lib)));
    eq(back.banks[0].questions[0].choices[1].text, 'velocity');
    eq(back.settings.defaultChoices, 4);
  },

  'non-library files are rejected'() {
    throws(() => normalizeLibrary({ hello: 1 }), /not an assessor library/);
    throws(() => normalizeLibrary({ format: 'assessor-library', version: 99 }), /newer version/);
  },

  'older files gain new fields'() {
    const lib = normalizeLibrary({ format: 'assessor-library', version: 1, banks: [{ id: 'b1', title: 'Old', questions: [{ id: 'q1', type: 'tf', stem: 'x' }] }] });
    const q = lib.banks[0].questions[0];
    eq(q.meta.keywords, []);
    eq(q.flags.doNotUse, false);
  },

  'bank file carries only its images'() {
    const lib = newLibrary();
    const bank = newBank('B');
    const q = completeMc();
    q.stem = 'See ![d](img:abc|200)';
    bank.questions.push(q);
    lib.banks.push(bank);
    lib.images = { abc: 'data:image/png;base64,AAA', unused: 'data:x' };
    const file = bankFile(lib, bank);
    eq(Object.keys(file.images), ['abc']);
    eq(readBankFile(JSON.parse(JSON.stringify(file))).bank.title, 'B');
  },

  'pruneImages removes unreferenced images'() {
    const lib = newLibrary();
    const bank = newBank('B');
    const q = completeMc();
    q.choices[0].text = '![x](img:keep)';
    bank.questions.push(q);
    lib.banks.push(bank);
    lib.images = { keep: 'a', drop: 'b' };
    pruneImages(lib);
    eq(Object.keys(lib.images), ['keep']);
  },

  'sortedByType follows type order'() {
    const qs = [newQuestion('essay'), newQuestion('mc'), newQuestion('tf'), newQuestion('mc')];
    eq(sortedByType(qs).map((g) => [g.type, g.questions.length]), [['tf', 1], ['mc', 2], ['essay', 1]]);
  },

  'splitList handles commas and semicolons'() {
    eq(splitList('HS-PS2-1, HS-PS2-2; motion ,'), ['HS-PS2-1', 'HS-PS2-2', 'motion']);
  },
};
