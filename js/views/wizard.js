// Quick test wizard (title, banks, how many of each type) and the test summary report.

import { QUESTION_TYPES, TYPE_ORDER } from '../model.js';
import { addToTest, newTest, pickRandom, pool, summary } from '../testmodel.js';
import { store } from '../store.js';
import { h, add, clear, toast } from '../ui.js';

export function wizardView(main) {
  const banks = store.lib.banks;
  if (!banks.length) {
    add(main, h('div.empty', h('h2', 'Quick test'), h('p', 'Create a question bank first; the wizard picks questions from your banks.')));
    return {};
  }
  let chosen = banks.map((b) => b.id);
  const title = h('input.wide-input', { value: '', placeholder: 'e.g. Unit 2 Test: Kinematics', 'aria-label': 'Test title' });
  const counts = h('div');
  const totalEl = h('p.muted');
  const inputs = new Map();

  function renderCounts() {
    const avail = pool(store.lib, newTest(), chosen);
    inputs.clear();
    add(clear(counts), 
      h('table.select-table',
        h('thead', h('tr', h('th', 'Type'), h('th', 'Available'), h('th', 'How many'))),
        h('tbody', TYPE_ORDER.map((type) => {
          const n = avail.filter((e) => e.q.type === type).length;
          const input = h('input.narrow', { type: 'number', min: 0, max: n, placeholder: '0', disabled: !n, oninput: updateTotal });
          inputs.set(type, { input, entries: avail.filter((e) => e.q.type === type) });
          return h('tr', h('td', QUESTION_TYPES[type].label), h('td.num', String(n)), h('td', input));
        }))),
    );
    updateTotal();
  }

  function updateTotal() {
    let n = 0;
    for (const { input } of inputs.values()) n += Math.min(Number(input.value) || 0, Number(input.max));
    totalEl.textContent = `${n} question${n === 1 ? '' : 's'} will be picked at random.`;
  }

  add(main, 
    h('h2', 'Quick test'),
    h('p.muted', 'Picks questions at random. Afterwards you can add, remove, edit and reorder them.'),
    h('ol.wizard',
      h('li', h('span.field-label', 'Title'), title),
      h('li', h('span.field-label', 'Banks to use'),
        h('div.bank-picker', banks.map((b) => h('label.check', h('input', {
          type: 'checkbox',
          checked: true,
          onchange: (e) => {
            chosen = e.target.checked ? [...chosen, b.id] : chosen.filter((id) => id !== b.id);
            renderCounts();
          },
        }), `${b.title} `, h('span.muted', `(${b.questions.length})`))))),
      h('li', h('span.field-label', 'Questions of each type'), counts, totalEl),
    ),
    h('div.row', h('button.primary', { onclick: create }, 'Create test')),
  );
  renderCounts();
  title.focus();

  function create() {
    const picked = [];
    for (const { input, entries } of inputs.values()) picked.push(...pickRandom(entries, Math.min(Number(input.value) || 0, entries.length)));
    if (!picked.length) return toast('Choose how many questions of at least one type');
    const test = newTest(title.value.trim() || 'Untitled test');
    addToTest(test, picked);
    store.update((lib) => lib.tests.push(test));
    toast(`Created “${test.title}” with ${picked.length} questions`);
    location.hash = `#/test/${test.id}`;
  }
  return { keepsOwnState: true };
}

export function summaryView(main, { testId }) {
  const test = store.lib.tests.find((t) => t.id === testId);
  if (!test) {
    add(main, h('div.empty', h('h2', 'Test not found')));
    return {};
  }
  const s = summary(store.lib, test);
  const table = (title, label, map, keyLabel = (k) => k) =>
    map.size
      ? h('section.summary-section', h('h3', title),
          h('table.select-table', h('thead', h('tr', h('th', label), h('th', 'Questions'), h('th', 'Points'))),
            h('tbody', [...map].sort((a, b) => String(keyLabel(a[0])).localeCompare(String(keyLabel(b[0])), undefined, { numeric: true }))
              .map(([k, e]) => h('tr', h('td', keyLabel(k)), h('td.num', String(e.count)), h('td.num', String(e.points)))))))
      : null;
  add(main, 
    h('div.editor-head.no-print', h('a', { href: `#/test/${test.id}` }, `← ${test.title}`), h('div.editor-actions', h('button', { onclick: () => window.print() }, 'Print'))),
    h('h2', `Summary: ${test.title}`),
    h('p', `${s.count} questions, ${s.points} points.`),
    table('Question banks', 'Bank', s.byBank),
    table('Question types', 'Type', s.byType, (t) => QUESTION_TYPES[t]?.label ?? t),
    table('Standards', 'Standard', s.standards),
    table('Learning objectives', 'Objective', s.objectives),
    table('Topics', 'Topic', s.topics),
  );
  return {};
}
