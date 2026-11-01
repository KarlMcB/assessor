import { defaultSettings, validateQuestion } from '../js/model.js';
import { pictureBlob, readRtf } from '../js/import/rtf.js';
import { parseExamView } from '../js/import/examview.js';
import { eq, ok } from './assert.js';

const settings = defaultSettings();
const rtf = (body) => `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0 Times;}}\\f0\\fs22\n${body}}`;
const texts = (body) => readRtf(rtf(body)).lines.map((l) => l.text);
const parse = (body) => parseExamView(readRtf(rtf(body)).lines, { settings, fileName: 'file.rtf' });
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export default {
  'rtf text, characters and formatting'() {
    eq(texts('Earth\\u8217?s \\\'e9 {\\b bold} {\\i it}\\par x\\~y \\{z\\}\\par'), ['Earth’s é **bold** *it*', 'x y {z}']);
  },
  'font tables are not text'() {
    eq(texts('Only this\\par'), ['Only this']);
  },
  'sub and superscripts become one formula'() {
    eq(texts('m/s{\\super 2} and v{\\sub i}{\\super 2}\\par'), ['m/s$^{2}$ and v$_{i}^{2}$']);
  },
  'dollar signs in text are escaped'() {
    eq(texts('costs $5\\par'), ['costs \\$5']);
  },
  'tables become table rows'() {
    const { lines } = readRtf(rtf('\\trowd\\cellx100\\cellx200\\pard\\intbl \\b A\\b0 \\cell B\\cell\\row\\trowd\\cellx100\\cellx200\\pard\\intbl 1\\cell 2\\cell\\row\\pard\\par'));
    eq(lines.filter((l) => l.table).map((l) => l.text), ['| **A** | B |', '| 1 | 2 |']);
  },
  'embedded and linked pictures'() {
    const { lines, pictures } = readRtf(rtf('{\\pict\\pngblip\\picwgoal4320\n89504e47\n0d0a}\\par{\\field{\\*\\fldinst { INCLUDEPICTURE "images/q 1.png" \\\\d }}{\\fldrslt }}\\par'));
    eq(pictures[0].kind, 'png');
    eq(pictures[0].hex, '89504e470d0a');
    eq(pictures[1].link, 'q 1.png');
    eq(lines[0].text, `![Figure](img:${pictures[0].id}|288)`);
    ok(lines[1].text.includes(`img:${pictures[1].id}`));
  },
  'word’s fallback picture is not imported twice'() {
    const { pictures } = readRtf(rtf('{\\*\\shppict{\\pict\\pngblip 00}}{\\nonshppict{\\pict\\wmetafile8 00}}\\par'));
    eq(pictures.map((p) => p.kind), ['png']);
  },
  async 'a metafile’s bitmap is extracted'() {
    const dib = new Uint8Array(40 + 4 + 4);
    const v = new DataView(dib.buffer);
    v.setUint32(0, 40, true);
    v.setInt32(4, 1, true);
    v.setInt32(8, 1, true);
    v.setUint16(12, 1, true);
    v.setUint16(14, 8, true);
    v.setUint32(32, 1, true);
    const record = new Uint8Array(28 + dib.length);
    const r = new DataView(record.buffer);
    r.setUint32(0, record.length / 2, true);
    r.setUint16(4, 0x0f43, true);
    record.set(dib, 28);
    const head = new Uint8Array(18);
    new DataView(head.buffer).setUint16(2, 9, true);
    const blob = pictureBlob({ kind: 'wmf', hex: hex([...head, ...record, 3, 0, 0, 0, 0, 0]) });
    eq(blob.type, 'image/bmp');
    const bmp = new Uint8Array(await blob.arrayBuffer());
    eq(String.fromCharCode(bmp[0], bmp[1]), 'BM');
    eq(new DataView(bmp.buffer).getUint32(10, true), 14 + 40 + 4);
    await createImageBitmap(blob);
  },
  'a non-rtf file is refused'() {
    let message = '';
    try { readRtf('plain text'); } catch (err) { message = err.message; }
    ok(/isn’t an RTF/.test(message));
  },

  'title, subtitle and every question type'() {
    const r = parse(`My Bank\\par Chapter 2\\par
True/False\\par 1. Sky is blue.\\par ANS: T DIF: Easy\\par\\par
Modified True/False\\par 2. Force is in joules.\\par ANS: F, newtons\\par\\par
Multiple Choice\\par 3. Pick.\\par a. one\\par b. two\\par c. three\\par ANS: B PTS: 2 TOP: Forces\\par\\par
Multiple Response\\par 4. Pick some.\\par a. one\\par b. two\\par c. three\\par ANS: A, C\\par\\par
Bimodal\\par 5. Bi.\\par a. one\\par b. two\\par ANS: A\\par\\par
Yes/No\\par 6. Ok?\\par ANS: N\\par\\par
Completion\\par 7. The unit is ___.\\par ANS: newton; N\\par\\par
Numeric Response\\par 8. How far?\\par ANS: 2.5 m/s\\par\\par
Short Answer\\par 9. Why?\\par ANS: Because.\\par\\par
Problem\\par 10. Solve.\\par ANS:\\par Line one.\\par Line two.\\par PTS: 3\\par\\par
Essay\\par 11. Discuss.\\par ANS: Text\\par\\par
Case\\par 12. A case.\\par ANS: Text\\par\\par
Other\\par 13. Other.\\par ANS: Text\\par`);
    eq(r.title, 'My Bank');
    eq(r.subtitle, 'Chapter 2');
    eq(r.skipped, []);
    eq(r.questions.map((q) => q.type), ['tf', 'mtf', 'mc', 'mr', 'bimodal', 'yn', 'comp', 'num', 'essay', 'essay', 'essay', 'essay', 'essay']);
    for (const q of r.questions) eq(validateQuestion(q), []);
    const [tf, mtf, mc, mr, , yn, comp, num, sa, prob, , kase, other] = r.questions;
    eq(tf.answer, true);
    eq(tf.meta.difficulty, 'Easy');
    eq(mtf.answer, { value: false, correction: 'newtons' });
    eq(mc.choices.map((c) => c.correct), [false, true, false]);
    eq(mc.points, 2);
    eq(mc.meta.topic, 'Forces');
    eq(mr.choices.map((c) => c.correct), [true, false, true]);
    eq(yn.answer, false);
    eq(comp.answer.accepted, ['newton', 'N']);
    eq([num.answer.value, num.answer.unit], ['2.5', 'm/s']);
    eq(sa.answer.model, 'Because.');
    eq(prob.kind, 'problem');
    eq(prob.answer.model, 'Line one.\n\nLine two.');
    eq(prob.points, 3);
    eq([kase.kind, other.kind], ['case', 'other']);
  },
  'locked choices, tabbed choices and numbering restarts'() {
    const r = parse(`B\\par Multiple Choice\\par 1. One.\\par a. x\\tab b. y\\par c! all\\par ANS: C\\par\\par Multiple Response\\par 1. Two.\\par a. x\\par b. y\\par ANS: AB\\par`);
    eq(r.questions.length, 2);
    eq(r.questions[0].choices.map((c) => c.text), ['x', 'y', 'all']);
    eq(r.questions[0].choices[2].lockPosition, true);
    eq(r.questions[1].choices.map((c) => c.correct), [true, true]);
  },
  'numbers inside a question don’t start a new one'() {
    const r = parse(`B\\par Short Answer\\par 1. Use this:\\par 2 is even.\\par ANS: 3. Some answer\\par 2 more lines\\par\\par 2. Next.\\par ANS: Yes\\par`);
    eq(r.questions.length, 2);
    eq(r.questions[0].stem, 'Use this:\n\n2 is even.');
    ok(r.questions[0].answer.model.includes('2 more lines'));
  },
  'narratives link by name'() {
    const r = parse(`B\\par Multiple Choice\\par NARRBEGIN: Fig 1\\par Some {\\i text}.\\par NARREND\\par 1. Q.\\par a. x\\par b. y\\par ANS: A NAR: Fig 1\\par\\par 2. Q.\\par a. x\\par b. y\\par ANS: B\\par`);
    eq(r.narratives[0].title, 'Fig 1');
    eq(r.narratives[0].body, 'Some *text*.');
    eq(r.questions[0].narrativeId, r.narratives[0].id);
    eq(r.questions[1].narrativeId, null);
  },
  'matching groups'() {
    const r = parse(`B\\par Matching\\par Match the units.\\par a. newton\\par b. joule\\par c. watt\\par 1. Force\\par 2. Energy\\par ANS: A PTS: 1\\par ANS: B PTS: 1\\par\\par Match again.\\par a. x\\par b. y\\par 3. First\\par ANS: B\\par`);
    eq(r.skipped, []);
    eq(r.questions.length, 2);
    const [q, q2] = r.questions;
    eq(q.stem, 'Match the units.');
    eq(q.choices.map((c) => c.text), ['newton', 'joule', 'watt']);
    eq(q.pairs.map((p) => p.prompt), ['Force', 'Energy']);
    eq(q.pairs[1].choiceId, q.choices[1].id);
    eq(q.points, 2);
    eq(validateQuestion(q), []);
    eq(q2.pairs[0].choiceId, q2.choices[1].id);
  },
  'problems are reported and notes are listed'() {
    const r = parse(`B\\par Multiple Choice\\par 1. Bad.\\par a. x\\par b. y\\par ANS: F\\par\\par 2. Missing.\\par a. x\\par\\par 3. Good.\\par a. x\\par b. y\\par ANS: A REF: Q9 NOT: verify me NAR: Nowhere\\par`);
    eq(r.questions.length, 1);
    eq(r.skipped.length, 2);
    ok(/no matching choice/.test(r.skipped[0].reason));
    ok(/no ANS/.test(r.skipped[1].reason));
    eq(r.notes.review, [{ number: '3 in Multiple Choice (Q9)', note: 'verify me' }]);
    ok(/Nowhere/.test(r.notes.converted[0].note));
  },
  'file name is the title when the first line is a label'() {
    eq(parse('True/False\\par 1. S.\\par ANS: T\\par').title, 'file');
  },
};
