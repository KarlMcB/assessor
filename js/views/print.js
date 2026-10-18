// Print screen: settings on the left, a live page preview on the right.
// Printing uses the browser's print dialog (Save as PDF works there).

import { QUESTION_TYPES, TYPE_ORDER, now } from '../model.js';
import { store } from '../store.js';
import { FONTS, PAPER, normalizeLayout, normalizePrint, alternationAllowed } from '../print/layout.js';
import { buildFlows } from '../print/build.js';
import { paginate, warmUp } from '../print/paginate.js';
import { h, add, clear, field, select, toast } from '../ui.js';

let zoom = 0.62;

export function printView(main, { testId }) {
  const test = store.lib.tests.find((t) => t.id === testId);
  if (!test) {
    add(main, h('div.empty', h('h2', 'Test not found')));
    return {};
  }
  let layout = normalizeLayout(test.layout, store.lib.settings.printLayout);
  let opts = normalizePrint(test.printOptions);

  const output = h('div.print-output', { id: 'print-output' });
  const statusEl = h('span.muted');
  const panel = h('div.print-settings');
  const preview = h('div.print-preview', output);
  output.style.zoom = zoom;

  add(main,
    h('div.editor-head.no-print',
      h('a', { href: `#/test/${test.id}` }, `← ${test.title}`),
      h('h2', 'Print'),
      statusEl,
      h('div.editor-actions',
        select({ 0.4: '40%', 0.5: '50%', 0.62: '62%', 0.8: '80%', 1: '100%' }, zoom, {
          'aria-label': 'Preview zoom',
          onchange: (e) => { zoom = Number(e.target.value); output.style.zoom = zoom; },
        }),
        h('button.primary', { onclick: doPrint }, 'Print…'))),
    h('p.print-tip.no-print', 'In Safari’s print dialog, choose the same paper size and turn off “Print headers and footers” (under Safari’s options) so the page edges stay clean. Use “PDF → Save as PDF” to keep a copy.'),
    h('div.print-layout', panel, preview),
  );

  // ---- settings ------------------------------------------------------------------

  const save = () => {
    store.update(() => {
      test.layout = layout;
      test.printOptions = opts;
      test.modified = now();
    });
    schedule();
  };
  const setL = (k, v) => { layout = { ...layout, [k]: v }; save(); };
  const setO = (k, v) => { opts = { ...opts, [k]: v }; save(); };

  const check = (label, value, onChange, attrs = {}) =>
    h('label.check', h('input', { type: 'checkbox', checked: value, onchange: (e) => onChange(e.target.checked), ...attrs }), label);
  const text = (value, onChange, attrs = {}) => h('input', { value, onchange: (e) => onChange(e.target.value), ...attrs });

  function renderPanel() {
    const questions = test.items.map((it) => it.question);
    const typesPresent = TYPE_ORDER.filter((t) => questions.some((q) => q.type === t));
    const altOk = alternationAllowed(questions);
    clear(panel);
    add(panel,
      group('Versions',
        field('Number of versions (A–Z)', h('input.narrow', { type: 'number', min: 1, max: 26, value: opts.versions, onchange: (e) => { setO('versions', Number(e.target.value)); renderPanel(); } })),
        check('Keep version A in the test’s own order', opts.keepAOriginal, (v) => setO('keepAOriginal', v)),
        check('Scramble question order', opts.scrambleQuestions, (v) => setO('scrambleQuestions', v)),
        check('Scramble answer choices (locked choices stay)', opts.scrambleChoices, (v) => setO('scrambleChoices', v)),
        check('Scramble the order of type sections', opts.scrambleSections, (v) => setO('scrambleSections', v), { disabled: test.mixTypes }),
        check('New values for dynamic questions in each version', opts.recalc, (v) => setO('recalc', v))),
      group('Include',
        check('Test pages', opts.includeTests, (v) => setO('includeTests', v)),
        check('Answer key for each version', opts.includeKeys, (v) => setO('includeKeys', v)),
        check('Answer strip (to hold beside a test while marking)', opts.includeStrip, (v) => setO('includeStrip', v)),
        check('Version map (with 2 or more versions)', opts.includeMap, (v) => setO('includeMap', v)),
        field('Order', select({ grouped: 'All tests, then all keys', interleave: 'Each test followed by its key' }, opts.interleave ? 'interleave' : 'grouped', { onchange: (e) => setO('interleave', e.target.value === 'interleave') }))),
      group('Page',
        h('div.row',
          field('Paper', select(Object.fromEntries(Object.entries(PAPER).map(([k, p]) => [k, p.label])), layout.paper, { onchange: (e) => setL('paper', e.target.value) })),
          field('Margins', select({ 0.5: '0.5 in', 0.75: '0.75 in', 1: '1 in' }, layout.margin, { onchange: (e) => setL('margin', Number(e.target.value)) }))),
        h('div.row',
          field('Columns', select({ 1: 'One', 2: 'Two' }, layout.columns, { onchange: (e) => setL('columns', Number(e.target.value)) })),
          field('Font', select(Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.label])), layout.fontFamily, { onchange: (e) => setL('fontFamily', e.target.value) })),
          field('Size', select({ 10: '10 pt', 11: '11 pt', 12: '12 pt', 13: '13 pt', 14: '14 pt' }, layout.fontSize, { onchange: (e) => setL('fontSize', Number(e.target.value)) }))),
        check('Line between columns', layout.columnRule, (v) => setL('columnRule', v)),
        check('Line above each section', layout.sectionRule, (v) => setL('sectionRule', v))),
      group('Header and footer',
        field('First page header', text(layout.headerFirst, (v) => setL('headerFirst', v))),
        field('Other pages header', text(layout.headerRest, (v) => setL('headerRest', v))),
        field('Footer', text(layout.footer, (v) => setL('footer', v)), 'Fill-ins: {title} {version} {page} {pages} {date}. **bold** and *italic* work.'),
        check('Name line on the first page', layout.nameLine, (v) => setL('nameLine', v)),
        layout.nameLine ? text(layout.nameLineText, (v) => setL('nameLineText', v), { 'aria-label': 'Name line text' }) : null),
      group('Questions',
        h('div.row',
          field('First number', h('input.narrow', { type: 'number', min: 0, value: layout.startNumber, onchange: (e) => setL('startNumber', Number(e.target.value) || 1) })),
          field('Space between', select({ 0: 'None', 6: 'Small', 12: 'Medium', 18: 'Large', 28: 'Extra large' }, layout.questionSpacing, { onchange: (e) => setL('questionSpacing', Number(e.target.value)) }))),
        check('Restart numbering in each type section', layout.restartNumbering, (v) => setL('restartNumbering', v), { disabled: test.mixTypes }),
        check('Start a section on a new page if it won’t fit', layout.typeNewPage, (v) => setL('typeNewPage', v)),
        check('Answer blank before T/F and multiple-choice numbers', layout.answerBlanks, (v) => setL('answerBlanks', v)),
        check('Ruled lines for written answers (otherwise blank space)', layout.essayLines, (v) => setL('essayLines', v)),
        check('Show True/False as lettered choices', layout.tfAsChoices, (v) => setL('tfAsChoices', v)),
        h('div.row',
          field('Choice labels', select({ 'A.': 'A. B. C.', 'a.': 'a. b. c.', '(a)': '(a) (b) (c)', '1.': '1. 2. 3.' }, layout.choiceStyle, { onchange: (e) => setL('choiceStyle', e.target.value) })),
          field('Points', select({ hidden: 'Don’t show', inline: 'Before the question', line: 'On their own line' }, layout.points, { onchange: (e) => setL('points', e.target.value) }))),
        check('Alternate letters (A–D, then F–J) on even questions', layout.alternateChoices && altOk, (v) => setL('alternateChoices', v), { disabled: !altOk || layout.choiceStyle === '1.' }),
        !altOk ? h('span.field-hint', 'Not available: a question has more than 5 choices.') : null),
      group('Instructions',
        test.mixTypes
          ? h('p.field-hint', 'Section instructions aren’t printed when question types are mixed.')
          : [check('Print instructions under each section heading', layout.showInstructions, (v) => { setL('showInstructions', v); renderPanel(); }),
            layout.showInstructions
              ? typesPresent.map((t) => field(QUESTION_TYPES[t].label, h('textarea', {
                  rows: 2,
                  value: layout.instructions[t],
                  onchange: (e) => { layout = { ...layout, instructions: { ...layout.instructions, [t]: e.target.value } }; save(); },
                })))
              : null]),
      group('Answer key shows',
        [['rationale', 'Rationale'], ['points', 'Points'], ['difficulty', 'Difficulty'], ['reference', 'Reference'], ['topic', 'Topic'], ['standards', 'Standards'], ['objectives', 'Objectives'], ['keywords', 'Keywords']]
          .map(([k, label]) => check(label, layout.key[k], (v) => { layout = { ...layout, key: { ...layout.key, [k]: v } }; save(); }))),
      h('div.row.panel-foot',
        h('button', { onclick: () => { store.update((lib) => (lib.settings.printLayout = layout)); toast('Saved as the default layout for tests'); } }, 'Use as default for other tests'),
        h('button', { onclick: () => { layout = normalizeLayout({}, {}); save(); renderPanel(); } }, 'Reset')),
    );
  }

  function group(title, ...children) {
    return h('details.print-group', { open: true }, h('summary', title), h('div.print-group-body', children));
  }

  // ---- preview ----------------------------------------------------------------------

  let timer = null;
  let generation = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(renderPreview, 250);
  }

  async function renderPreview() {
    const mine = ++generation;
    statusEl.textContent = 'Laying out pages…';
    if (!test.items.length) {
      clear(output);
      add(output, h('div.empty', h('p', 'This test has no questions yet.')));
      statusEl.textContent = '';
      return;
    }
    const { flows } = buildFlows(store.lib, test, layout, opts);
    await warmUp(flows);
    if (mine !== generation) return;
    const pages = flows.flatMap((f) => paginate(f));
    clear(output);
    output.append(...pages);
    setPageSize();
    const testPages = flows.filter((f) => f.kind === 'test').length;
    statusEl.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}${testPages > 1 ? ` · ${testPages} versions` : ''}`;
  }

  function setPageSize() {
    const paper = PAPER[layout.paper] ?? PAPER.letter;
    let style = document.getElementById('page-size-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-size-style';
      document.head.append(style);
    }
    style.textContent = `@page { size: ${paper.width}in ${paper.height}in; margin: 0; }`;
  }

  async function doPrint() {
    clearTimeout(timer);
    await renderPreview();
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
  }

  renderPanel();
  renderPreview();
  return {
    keepsOwnState: true,
    destroy: () => {
      clearTimeout(timer);
      document.getElementById('page-size-style')?.remove();
    },
  };
}
