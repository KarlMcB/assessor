import { newQuestion, newLibrary } from '../js/model.js';
import { buildPackage, numericAnswers, qtiItem } from '../js/export/qti.js';
import { instantiate } from '../js/algo/engine.js';
import { crc32, makeZip } from '../js/export/zip.js';
import { eq, ok } from './assert.js';

const parse = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`XML error: ${err.textContent.slice(0, 200)}`);
  return doc;
};
const field = (item, label) => [...item.querySelectorAll('qtimetadatafield')].find((f) => f.querySelector('fieldlabel').textContent === label)?.querySelector('fieldentry').textContent;

function mc() {
  const q = newQuestion('mc');
  q.stem = 'Force is $F = ma$. Which?';
  q.choices.forEach((c, i) => (c.text = `opt ${i}`));
  q.choices[2].correct = true;
  q.points = 2;
  q.rationale = 'Because *Newton*.';
  return q;
}

const ctx = { images: () => '', feedback: true };

export default {
  'crc32 matches the standard check value'() {
    eq(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  },

  'zip has local, central and end records'() {
    return makeZip([{ name: 'a.txt', data: 'hi' }, { name: 'd/', data: '' }]).arrayBuffer().then((buf) => {
      const v = new DataView(buf);
      eq(v.getUint32(0, true), 0x04034b50);
      eq(v.getUint32(buf.byteLength - 22, true), 0x06054b50);
      eq(v.getUint16(buf.byteLength - 22 + 10, true), 2);
    });
  },

  'multiple choice item matches the text2qti shape'() {
    const q = mc();
    const doc = parse(`<root>${qtiItem(q, { seed: 's', ctx })}</root>`);
    const item = doc.querySelector('item');
    eq(field(item, 'question_type'), 'multiple_choice_question');
    eq(field(item, 'points_possible'), '2');
    const ids = field(item, 'original_answer_ids').split(',');
    eq(ids.length, 4);
    const correct = [...doc.querySelectorAll('respcondition')].find((r) => r.querySelector('setvar'));
    eq(correct.querySelector('varequal').textContent, ids[2]);
    ok(doc.querySelector('itemfeedback[ident="general_fb"]'), 'rationale as general feedback');
    const stem = doc.querySelector('presentation > material > mattext').textContent;
    ok(stem.includes('<math'), 'math as MathML');
    ok(!stem.includes('katex') && !stem.includes('annotation'), 'no KaTeX HTML or annotation');
  },

  'true/false and multiple answers'() {
    const tf = newQuestion('tf');
    tf.stem = 'Inertia is a force.';
    tf.answer = false;
    let doc = parse(`<r>${qtiItem(tf, { seed: 's', ctx })}</r>`);
    eq(field(doc.querySelector('item'), 'question_type'), 'true_false_question');
    const ids = field(doc.querySelector('item'), 'original_answer_ids').split(',');
    eq([...doc.querySelectorAll('respcondition')].find((r) => r.querySelector('setvar')).querySelector('varequal').textContent, ids[1]);

    const mr = newQuestion('mr');
    mr.stem = 'Vectors?';
    mr.choices.forEach((c, i) => { c.text = `c${i}`; c.correct = i % 2 === 0; });
    doc = parse(`<r>${qtiItem(mr, { seed: 's', ctx })}</r>`);
    eq(field(doc.querySelector('item'), 'question_type'), 'multiple_answers_question');
    eq(doc.querySelector('response_lid').getAttribute('rcardinality'), 'Multiple');
    eq(doc.querySelectorAll('and > varequal').length, 2);
    eq(doc.querySelectorAll('and > not').length, 2);
  },

  'numeric becomes fill-in-the-blank with accepted forms'() {
    const q = newQuestion('num');
    q.stem = 'KE?';
    q.answer.value = '25';
    q.answer.unit = 'J';
    q.answer.accepted = ['25.00 J'];
    eq(numericAnswers(q, instantiate(q)), ['25', '25.0', '25 J', '25J', '25.00 J']);
    const doc = parse(`<r>${qtiItem(q, { seed: 's', ctx })}</r>`);
    eq(field(doc.querySelector('item'), 'question_type'), 'short_answer_question');
    eq([...doc.querySelectorAll('varequal')].map((v) => v.textContent), ['25', '25.0', '25 J', '25J', '25.00 J']);
  },

  'dynamic numeric answers use the version values'() {
    const q = newQuestion('num');
    q.algorithm = 'v = range(2, 9)';
    q.stem = 'v = [[v]]';
    q.answer.value = '[[= v*2]]';
    const inst = instantiate(q, { seed: 'x' });
    const v = inst.run.values.get('v');
    eq(numericAnswers(q, inst)[0], String(v * 2));
  },

  'essay is hand-graded with the model answer as feedback'() {
    const q = newQuestion('essay');
    q.stem = 'Explain.';
    q.answer.model = 'Objects keep moving.';
    const doc = parse(`<r>${qtiItem(q, { seed: 's', ctx })}</r>`);
    eq(field(doc.querySelector('item'), 'question_type'), 'essay_question');
    ok(doc.querySelector('itemfeedback mattext').textContent.includes('Objects keep moving.'));
  },

  'package: manifest, meta, images and groups'() {
    const lib = newLibrary();
    lib.images.pic = 'data:image/png;base64,iVBORw0KGgo=';
    const q = mc();
    q.stem += ' ![d](img:pic|100)';
    const dyn = newQuestion('num');
    dyn.algorithm = 'a = rand(9)';
    dyn.stem = 'a is [[a]]';
    dyn.answer.value = '[[a]]';
    dyn.points = 3;
    const entries = [
      { question: q, seed: 'q1', version: 'A' },
      { group: [1, 2, 3].map((k) => ({ question: dyn, seed: `p${k}`, version: 'A' })), points: 3 },
    ];
    const pkg = buildPackage(lib, 'Unit 1 & 2', entries);
    const assessment = parse(pkg.assessment);
    parse(pkg.manifest);
    const meta = parse(pkg.meta);
    eq(meta.querySelector('points_possible').textContent, '5.0');
    eq(assessment.querySelector('assessment').getAttribute('title'), 'Unit 1 & 2');
    const group = assessment.querySelector('section section');
    eq(group.querySelector('selection_number').textContent, '1');
    eq(group.querySelectorAll('item').length, 3);
    ok(pkg.files.some((f) => f.name === 'images/img_pic.png'), 'image file packaged');
    ok(pkg.manifest.includes('href="images/img_pic.png"'), 'image listed in manifest');
    ok(pkg.assessment.includes('%24IMS-CC-FILEBASE%24/images/img_pic.png'), 'image referenced like text2qti');
    ok(pkg.files.some((f) => f.name === 'non_cc_assessments/'));
  },
};
