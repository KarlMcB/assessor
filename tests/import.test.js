import { htmlToText, htmlToInline, mathmlToLatex } from '../js/import/html2text.js';
import { readCartridge } from '../js/import/qti.js';
import { readZip } from '../js/import/unzip.js';
import { makeZip } from '../js/export/zip.js';
import { defaultSettings } from '../js/model.js';
import { mathmlOnly } from '../js/richtext.js';
import { eq, ok } from './assert.js';

const fetchBlob = async (path) => (await fetch(path, { cache: 'no-store' })).blob();
const settings = defaultSettings();

export default {
  // ---- HTML to text
  'paragraphs, emphasis and line breaks'() {
    eq(htmlToText('<p>One <strong>bold</strong> and <em>it</em>.</p><p>Two<br>three</p>'), 'One **bold** and *it*.\n\nTwo\nthree');
  },
  'sub and superscripts keep their spacing'() {
    eq(htmlToInline('CO<sub>2 </sub>is m<sup>2</sup>'), 'CO~2~ is m^2^');
  },
  'dollar signs are escaped'() {
    eq(htmlToInline('costs $5'), 'costs \\$5');
  },
  'Schoology \\( \\) math becomes $ $'() {
    eq(htmlToInline('absorbing \\(CO_2\\) and \\(CH_4\\).'), 'absorbing $CO_2$ and $CH_4$.');
  },
  'lists and tables'() {
    eq(htmlToText('<ul><li>a</li><li>b</li></ul>'), '- a\n- b');
    eq(htmlToText('<table><tr><th>t</th><th>x</th></tr><tr><td>1</td><td>2</td></tr></table>'), '| t | x |\n| --- | --- |\n| 1 | 2 |');
  },
  'images use the provided reference'() {
    const t = htmlToInline('<img alt="a [d]" src="x.png" width="200">', { imageFor: () => 'img:abc' });
    eq(t, '![a d](img:abc|200)');
    eq(htmlToInline('<img src="gone.png">', { imageFor: () => null }), '');
  },
  'Canvas equation images become LaTeX'() {
    eq(htmlToInline('<img class="equation_image" data-equation-content="x^2" src="/equation_images/x%255E2">'), '$x^2$');
  },
  'MathML round-trips through LaTeX'() {
    const cases = ['\\frac{1}{2}mv^2', 'v_0^2', '\\sqrt{\\frac{L}{g}}', '\\vec{F}'];
    for (const tex of cases) {
      const html = mathmlOnly(tex, false);
      const back = htmlToInline(html);
      ok(back.startsWith('$') && back.endsWith('$'), back);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      ok(mathmlToLatex(doc.querySelector('math')).length > 0);
    }
    eq(htmlToInline(mathmlOnly('\\frac{a}{b}', false)), '$\\frac{a}{b}$');
  },

  // ---- zip reader
  async 'zip round trip'() {
    const blob = makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/', data: '' }, { name: 'dir/b.txt', data: 'world' }]);
    const zip = await readZip(blob);
    eq(await zip.text('a.txt'), 'hello');
    eq(await zip.text('dir/b.txt'), 'world');
    ok(!zip.has('dir/'));
  },

  // ---- whole files
  async 'Schoology export imports as banks'() {
    const r = await readCartridge(await fetchBlob('schoology-tests/APES-Tests-Example-Tests.imscc'), settings);
    eq(r.banks.length, 3);
    eq(r.banks.reduce((n, b) => n + b.questions.length, 0), 87);
    eq(r.skipped.length, 0);
    ok(r.banks.flatMap((b) => b.questions).filter((q) => q.choices).every((q) => q.choices.filter((c) => c.correct).length === 1), 'every MC has one answer');
    eq(Object.keys(r.images).length, 6);
    ok(r.banks.flatMap((b) => b.questions).some((q) => q.choices?.some((c) => c.text.includes('$CO_2$'))));
  },
  async 'assessor export imports back'() {
    const r = await readCartridge(await fetchBlob('schoology-tests/assessor_export_fixed.zip'), settings);
    const qs = r.banks[0].questions;
    eq(qs.map((q) => q.type), ['mc', 'tf', 'mr', 'num', 'essay']);
    eq(qs[0].points, 2);
    eq(qs[0].choices.findIndex((c) => c.correct), 2);
    ok(qs[0].stem.includes('$K=\\frac{1}{2}m{v}^{2}$'), qs[0].stem);
    ok(/!\[two squares\]\(img:[a-z0-9]+\|120\)/.test(qs[0].stem), 'image comes back');
    ok(qs[0].rationale.includes('25'));
    eq(qs[1].answer, false);
    eq(qs[2].choices.map((c) => c.correct), [true, false, true, false]);
    eq(qs[3].answer.unit, 'm');
    ok(!Number.isNaN(Number(qs[3].answer.value)));
    ok(qs[4].answer.model.includes('inertia'));
  },
  async 'text2qti fill-in and pools'() {
    const r = await readCartridge(await fetchBlob('schoology-tests/fill_in_blank_test.zip'), settings);
    const qs = r.banks[0].questions;
    eq(qs[0].type, 'num');
    eq(qs[0].answer.value, '25');
    eq(qs[1].type, 'essay'); // text answers (newton, N)
    ok(qs[1].answer.model.includes('newton'));
    const pool = await readCartridge(await fetchBlob('schoology-tests/assessor_export_pool.zip'), settings);
    eq(pool.banks[0].questions.length, 6);
    eq(pool.notes.groups, 1);
  },
  async 'matching is reported as skipped'() {
    const r = await readCartridge(await fetchBlob('schoology-tests/matching_test.zip'), settings);
    eq(r.skipped.length, 4);
    ok(r.skipped.every((s) => s.reason === 'Matching'));
  },
};
