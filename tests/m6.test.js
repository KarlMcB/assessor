import { newBank, newQuestion, newLibrary, newNarrative, newPair, validateQuestion, duplicateQuestion } from '../js/model.js';
import { newTest, addToTest, displayOrder } from '../js/testmodel.js';
import { instantiate } from '../js/algo/engine.js';
import { buildVersions } from '../js/print/versions.js';
import { buildFlows } from '../js/print/build.js';
import { keyEntry, questionBlock } from '../js/print/render.js';
import { normalizeLayout, normalizePrint } from '../js/print/layout.js';
import { buildPackage, testEntries } from '../js/export/qti.js';
import { makeZip } from '../js/export/zip.js';
import { readCartridge } from '../js/import/qti.js';
import { parseText2qti, splitPastedQuestion } from '../js/import/text2qti.js';
import { cartesianSvg, numberLineSvg, graphSvg } from '../js/graph.js';
import { renderRich } from '../js/richtext.js';
import { run } from '../js/algo/engine.js';
import { eq, ok } from './assert.js';

function matchQ() {
  const q = newQuestion('match');
  q.stem = 'Match each quantity with its unit.';
  ['m/s', 'N', 'J', 'kg'].forEach((t, i) => (q.choices[i].text = t));
  q.pairs = [newPair('Velocity', q.choices[0].id), newPair('Force', q.choices[1].id), newPair('Energy', q.choices[2].id)];
  return q;
}

const layout = normalizeLayout({});

export default {
  // ---- matching
  'matching validates and duplicates with linked ids'() {
    const q = matchQ();
    eq(validateQuestion(q), []);
    q.pairs[0].choiceId = null;
    ok(validateQuestion(q).some((p) => /matching choice/.test(p)));
    const d = duplicateQuestion(matchQ());
    ok(d.pairs.every((p) => d.choices.some((c) => c.id === p.choiceId)), 'pairs point at the new choice ids');
  },

  'matching uses one printed number per item, with keys'() {
    const lib = newLibrary();
    const bank = newBank('B');
    const tf = newQuestion('tf'); tf.stem = 'T?';
    bank.questions.push(tf, matchQ());
    const test = newTest('T');
    addToTest(test, bank.questions.map((q) => ({ bank, q })));
    const built = buildVersions(test, layout, normalizePrint({ versions: 1 }));
    const entries = built.versions[0].sections.flatMap((s) => s.items);
    eq(entries.map((e) => [e.number, e.count]), [[1, 1], [2, 3]]);
    const m = entries[1];
    const html = questionBlock(m, { layout, images: {}, version: 'A', columns: 1 });
    ok(html.includes('>2.<') && html.includes('>4.<'), 'items numbered 2–4');
    const key = keyEntry(m, { layout, images: {}, version: 'A' });
    ok(key.includes('>2.</div>') && key.includes('ANS:</span> A') && key.includes('ANS:</span> C'));
  },

  async 'matching exports and imports back'() {
    const lib = newLibrary();
    const pkg = buildPackage(lib, 'M', [{ question: matchQ(), seed: 's', version: 'A' }]);
    ok(pkg.assessment.includes('matching_question'));
    const blob = makeZip(pkg.files);
    const r = await readCartridge(blob, undefined);
    const q = r.banks[0].questions[0];
    eq(q.type, 'match');
    eq(q.pairs.map((p) => q.choices.find((c) => c.id === p.choiceId)?.text), ['m/s', 'N', 'J']);
    eq(q.choices.length, 4);
  },

  async 'verified Schoology matching file imports'() {
    const blob = await (await fetch('schoology-tests/matching_test.zip', { cache: 'no-store' })).blob();
    const r = await readCartridge(blob, undefined);
    const qs = r.banks[0].questions.filter((q) => q.type === 'match');
    eq(qs.length, 4);
    eq(qs[1].choices.length, 5);
    ok(qs.every((q) => q.pairs.every((p) => p.choiceId)), 'every item has its answer');
  },

  // ---- narratives
  'narrative questions stay together and come along to tests'() {
    const bank = newBank('B');
    const n = newNarrative('Data table');
    bank.narratives.push(n);
    const qs = ['a', 'b', 'c', 'd'].map((s) => { const q = newQuestion('mc'); q.stem = s; return q; });
    qs[0].narrativeId = n.id;
    qs[3].narrativeId = n.id;
    bank.questions.push(...qs);
    const test = newTest('T');
    addToTest(test, qs.map((q) => ({ bank, q })));
    eq(test.narratives.length, 1);
    eq(displayOrder(test).map((it) => it.question.stem), ['a', 'd', 'b', 'c']);
  },

  'narrative variables are shared by linked questions'() {
    const n = { algorithm: 'm = range(2, 9)', seed: 'narr' };
    const q1 = newQuestion('num'); q1.stem = 'm is [[m]]'; q1.answer.value = '[[m]]';
    const q2 = newQuestion('num'); q2.algorithm = 'w = m*10'; q2.stem = 'w is [[w]]'; q2.answer.value = '[[w]]';
    const a = instantiate(q1, { seed: 'x1', narrative: n });
    const b = instantiate(q2, { seed: 'x2', narrative: n });
    const m = Number(a.plain('[[m]]'));
    eq(Number(b.plain('[[w]]')), m * 10);
    ok(a.dynamic);
  },

  'narratives print once with the question range'() {
    const lib = newLibrary();
    const bank = newBank('B');
    const n = newNarrative('Graph');
    n.body = 'Use this data.';
    bank.narratives.push(n);
    const qs = [1, 2, 3].map((k) => { const q = newQuestion('tf'); q.stem = `S${k}`; q.narrativeId = k < 3 ? n.id : null; return q; });
    bank.questions.push(...qs);
    const test = newTest('T');
    addToTest(test, qs.map((q) => ({ bank, q })));
    const { flows } = buildFlows(lib, test, {}, { versions: 1, includeKeys: false });
    const html = flows[0].blocks.map((b) => b.html).join('');
    eq(html.match(/Use this data/g).length, 1);
    ok(html.includes('questions 1–2'));
  },

  'Schoology export repeats the narrative in each question'() {
    const lib = newLibrary();
    const bank = newBank('B');
    const n = newNarrative('P');
    n.body = 'Shared passage here.';
    bank.narratives.push(n);
    const qs = [1, 2].map(() => { const q = newQuestion('essay'); q.stem = 'Q'; q.narrativeId = n.id; return q; });
    bank.questions.push(...qs);
    const test = newTest('T');
    addToTest(test, qs.map((q) => ({ bank, q })));
    const pkg = buildPackage(lib, 'T', testEntries(test));
    eq(pkg.assessment.match(/Shared passage here/g).length, 2);
  },

  // ---- graphs
  'cartesian graph draws functions, points and shading'() {
    const svg = cartesianSvg('x: -5 to 5 step 1\ny: -5 to 5 step 1\nf(x) = 2*x - 1\ny <= x^2 - 4\npoint (1, 1) "A" ; open\nsegment (0, 0) to (2, 3)\ntext (3, 3) "hi"', null);
    ok(svg.startsWith('<svg'));
    eq((svg.match(/<path /g) || []).length, 2);
    ok(svg.includes('<polygon'), 'shaded inequality');
    ok(svg.includes('>A<') && svg.includes('>hi<'));
  },
  'graphs use algorithm variables'() {
    const r = run('a = 3\nb = -2');
    const svg = cartesianSvg('f(x) = a*x + b\npoint (a, b)', r);
    ok(!svg.includes('graph-error') && svg.includes('<circle'));
  },
  'number line draws points, segments and rays'() {
    const svg = numberLineSvg('range: -5 to 5 step 1\npoint 2 open "A"\nsegment -1 to 3 closed open\nray 4 right', null);
    ok(svg.includes('<svg') && (svg.match(/<circle/g) || []).length >= 3);
  },
  'graph errors are shown, not thrown'() {
    ok(graphSvg('graph', 'wobble (1, 2)', null).includes('graph-error'));
  },
  'graph blocks render inside rich text'() {
    const html = renderRich('Look:\n\n```graph\nf(x) = x\n```\n\nThen answer.');
    ok(html.includes('<svg') && html.includes('Then answer.'));
  },

  // ---- text2qti
  'text2qti text with every question type and extensions'() {
    const text = `Quiz title: Forces
shuffle answers: false

Points: 2
1. What is $F = ma$ for m = 2, a = 3?
meta: topic = Dynamics; difficulty = Easy; standards = HS-PS2-1, HS-PS2-2
a) 5 N
*b) 6 N
c) 1.5 N
... Multiply mass by acceleration.

2. Inertia is a force.
a) True
*b) False

3. Which are vectors?
[*] velocity
[ ] speed
[*] force

4. KE of a 2 kg cart at 5 m/s, in J?
= 25 +- 0.5
unit: J

5. The SI unit of force is the
* newton
* N

6. Explain Newton's first law.
____

7. Match each quantity with its unit.
match: Velocity = m/s
match: Force = N
distractor: kg

8. A cart moves at [[v]] m/s for 2 s. How far?
algorithm:
    v = range(2, 9)
= 10
`;
    const r = parseText2qti(text, {});
    eq(r.title, 'Forces');
    const qs = r.questions;
    eq(qs.map((q) => q.type), ['mc', 'tf', 'mr', 'num', 'essay', 'essay', 'match', 'num']);
    eq(qs[0].points, 2);
    eq(qs[0].choices.findIndex((c) => c.correct), 1);
    eq(qs[0].meta.standards, ['HS-PS2-1', 'HS-PS2-2']);
    eq(qs[0].rationale, 'Multiply mass by acceleration.');
    eq(qs[1].answer, false);
    eq(qs[2].choices.map((c) => c.correct), [true, false, true]);
    eq([qs[3].answer.value, qs[3].answer.tolerance, qs[3].answer.unit], ['25', '0.5', 'J']);
    eq(qs[4].answer.model, 'newton / N');
    eq(qs[6].pairs.length, 2);
    eq(qs[6].choices.length, 3);
    eq(qs[7].algorithm, 'v = range(2, 9)');
  },

  'smart paste splits a pasted question'() {
    const r = splitPastedQuestion('1. Which is a vector?\nA. mass\n*B. velocity\nC. time\nD. energy');
    eq(r.stem, 'Which is a vector?');
    eq(r.choices.map((c) => c.text), ['mass', 'velocity', 'time', 'energy']);
    eq(r.choices.map((c) => c.correct), [false, true, false, false]);
    eq(splitPastedQuestion('Just a sentence.'), null);
  },
};
