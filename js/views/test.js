// Test view: the questions on a test, with ordering and test-wide commands.

import { QUESTION_TYPES, TYPE_ORDER, newId, now } from '../model.js';
import {
  META_FIELDS, differsFromSource, displayOrder, moveItem, scrambleTest, sortItems, sortValuesFor,
  sourceOf, summary, totalPoints, typeGroups,
} from '../testmodel.js';
import { testSeed } from '../containers.js';
import { store } from '../store.js';
import { questionBody, questionProblems, metaChips, typeLabel } from '../question-view.js';
import { isDynamic } from '../algo/engine.js';
import { exportDialog } from './export.js';
import { narrativesPanel, narrativeCard } from './narrative.js';
import { narrativeFor } from '../print/versions.js';
import { narrativeOf } from '../model.js';
import { h, add, clear, select, toast, openDialog } from '../ui.js';

export const SELECT_METHODS = {
  random: 'Randomly',
  list: 'From a list',
  view: 'While viewing',
  standard: 'By standard',
  criteria: 'By criteria',
  all: 'All questions',
};

const viewState = { answers: true };

export function testView(main, { testId, focus }) {
  const test = store.lib.tests.find((t) => t.id === testId);
  if (!test) {
    add(main, h('div.empty', h('h2', 'Test not found'), h('a', { href: '#/' }, 'Back to start')));
    return {};
  }
  const commit = (fn) => store.update(() => {
    fn(test);
    test.modified = now();
  });

  const countEl = h('span.muted');
  const list = h('div.question-list');
  const optionsRow = h('div.toolbar');

  add(main, 
    h(
      'div.bank-header',
      h(
        'div.bank-titles',
        h('input.title-input', { value: test.title, 'aria-label': 'Test title', onchange: (e) => commit((t) => (t.title = e.target.value.trim() || 'Untitled test')) }),
        countEl,
      ),
      h(
        'div.bank-actions',
        h('a.button.primary-link', { href: `#/test/${test.id}/print` }, 'Print…'),
        h('button', { onclick: () => exportDialog({ test }) }, 'Export to Schoology…'),
        h('a.button', { href: `#/test/${test.id}/summary` }, 'Summary'),
        h('button', { onclick: duplicateTest }, 'Duplicate'),
        h('button.danger', { onclick: deleteTest }, 'Delete test'),
      ),
    ),
    h(
      'div.new-question',
      h('span.muted', 'Add questions:'),
      Object.entries(SELECT_METHODS).map(([m, label]) => h('a.button', { href: `#/test/${test.id}/add/${m}` }, label)),
      select({ '': 'Write a new question…', ...Object.fromEntries(TYPE_ORDER.map((t) => [t, QUESTION_TYPES[t].label])) }, '', {
        'aria-label': 'Write a new question on this test',
        onchange: (e) => e.target.value && (location.hash = `#/test/${test.id}/new/${e.target.value}`),
      }),
    ),
    optionsRow,
    list,
  );

  function renderOptions() {
    add(clear(optionsRow), 
      h('label.check', h('input', { type: 'checkbox', checked: test.mixTypes, onchange: (e) => commit((t) => (t.mixTypes = e.target.checked)) }), 'Mix question types'),
      h('label.check', h('input', { type: 'checkbox', checked: viewState.answers, onchange: (e) => { viewState.answers = e.target.checked; renderList(); } }), 'Show answers'),
      h('span.spacer'),
      h('button', { onclick: sortDialog, disabled: !test.items.length }, 'Sort…'),
      h('button', { onclick: scrambleDialog, disabled: !test.items.length }, 'Scramble…'),
      h('button', { onclick: pointsDialog, disabled: !test.items.length }, 'Points…'),
      h('button', { onclick: clearDialog, disabled: !test.items.length }, 'Remove…'),
      h('button', { onclick: () => { commit((t) => (t.seed = newId())); toast('New values for dynamic questions'); }, title: 'Pick new values for every dynamic question' }, '⟳ Recalculate'),
    );
  }

  function renderList() {
    renderOptions();
    const n = test.items.length;
    countEl.textContent = `${n} question${n === 1 ? '' : 's'} · ${totalPoints(test)} point${totalPoints(test) === 1 ? '' : 's'}`;
    clear(list);
    if (test.narratives?.length) add(list, narrativesPanel(test, test.items.map((it) => it.question)));
    if (!n) {
      list.append(h('div.empty', h('p', 'No questions yet. Use “Add questions” above to pick from your banks, or write one just for this test.')));
      return;
    }
    let number = 0;
    const groups = typeGroups(test);
    groups.forEach((g, gi) => {
      if (g.type) {
        list.append(
          h(
            'h3.type-heading.with-actions',
            `${QUESTION_TYPES[g.type].label} `,
            h('span.muted', `(${g.items.length})`),
            groups.length > 1
              ? h('span.group-actions',
                  h('button', { title: 'Move this group up', disabled: gi === 0, onclick: () => moveGroup(g.type, -1) }, '↑'),
                  h('button', { title: 'Move this group down', disabled: gi === groups.length - 1, onclick: () => moveGroup(g.type, 1) }, '↓'))
              : null,
          ),
        );
      }
      let prevNarrative = null;
      for (const item of g.items) {
        const n = narrativeOf(test, item.question);
        if (n && n.id !== prevNarrative) list.append(narrativeCard(n, store.lib.images, narrativeFor(test, item.question, 'A').seed));
        prevNarrative = n?.id ?? null;
        const count = item.question.type === 'match' ? Math.max(1, item.question.pairs.length) : 1;
        list.append(card(item, count > 1 ? `${number + 1}–${number + count}` : number + 1));
        number += count;
      }
    });
    if (focus) {
      const el = list.querySelector(`[data-qid="${focus}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('flash');
      }
      focus = null;
    }
  }

  function card(item, number) {
    const q = item.question;
    const seed = testSeed(test, q);
    const narrative = narrativeFor(test, q, 'A');
    const problems = questionProblems(q, seed, narrative);
    const src = sourceOf(store.lib, item);
    const edited = src && differsFromSource(store.lib, item);
    const editHref = `#/test/${test.id}/q/${q.id}`;
    const el = h(
      'article.q-card',
      { 'data-qid': q.id, draggable: 'true', ondblclick: () => (location.hash = editHref) },
      h(
        'header.q-card-head',
        h('span.drag-handle', { title: 'Drag to reorder' }, '⠿'),
        h('span.q-number', `${number}.`),
        h('span.badge', typeLabel(q)),
        h('span.muted', `${q.points} pt${Number(q.points) === 1 ? '' : 's'}`),
        h('span.chip', { title: 'Where this question came from' }, src ? src.bank.title : item.sourceBankId ? 'Bank question deleted' : 'Written for this test'),
        isDynamic(q) ? h('span.badge.dynamic', 'Dynamic') : null,
        edited ? h('span.badge.edited', { title: 'This copy differs from the bank question' }, 'Edited') : null,
        problems.length ? h('span.badge.warn', { title: problems.join('\n') }, `${problems.length} issue${problems.length > 1 ? 's' : ''}`) : null,
        h(
          'span.q-card-actions',
          h('a.button', { href: editHref }, 'Edit'),
          edited ? h('button', { onclick: () => updateFromBank(item, src), title: 'Replace this copy with the current bank question' }, 'Update from bank') : null,
          h('button', { title: 'Move up', onclick: () => step(item, -1) }, '↑'),
          h('button', { title: 'Move down', onclick: () => step(item, 1) }, '↓'),
          h('button.danger', { onclick: () => remove(item) }, 'Remove'),
        ),
      ),
      h('div.q-card-body', questionBody(q, store.lib.images, { showAnswer: viewState.answers, showRationale: viewState.answers, seed, narrative })),
      metaChips(q).length ? h('footer.q-meta', metaChips(q)) : null,
    );
    addDragHandlers(el, item);
    return el;
  }

  // ---- reordering ------------------------------------------------------------------

  let dragId = null;
  function addDragHandlers(el, item) {
    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('button, a, input, select, textarea')) return e.preventDefault();
      dragId = item.question.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      dragId = null;
      el.classList.remove('dragging');
      list.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    });
    el.addEventListener('dragover', (e) => {
      if (!dragId || dragId === item.question.id) return;
      e.preventDefault();
      const after = e.clientY > el.getBoundingClientRect().top + el.offsetHeight / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = el.classList.contains('drop-after');
      el.classList.remove('drop-before', 'drop-after');
      const moving = test.items.find((it) => it.question.id === dragId);
      if (!moving || moving === item) return;
      if (!test.mixTypes && moving.question.type !== item.question.type) {
        toast('Questions are grouped by type. Turn on “Mix question types” to move between groups.');
        return;
      }
      const order = displayOrder(test);
      let beforeId = item.question.id;
      if (after) {
        const next = order[order.indexOf(item) + 1];
        beforeId = next && next !== moving && (test.mixTypes || next.question.type === item.question.type) ? next.question.id : null;
      }
      commit((t) => moveItem(t, moving.question.id, beforeId));
    });
  }

  function step(item, dir) {
    const order = displayOrder(test);
    const i = order.indexOf(item);
    const other = order[i + dir];
    if (!other || (!test.mixTypes && other.question.type !== item.question.type)) return;
    commit((t) => {
      const a = t.items.indexOf(item);
      const b = t.items.indexOf(other);
      [t.items[a], t.items[b]] = [t.items[b], t.items[a]];
    });
  }

  function moveGroup(type, dir) {
    const present = typeGroups(test).map((g) => g.type);
    const i = present.indexOf(type);
    const other = present[i + dir];
    if (!other) return;
    commit((t) => {
      const a = t.typeOrder.indexOf(type);
      const b = t.typeOrder.indexOf(other);
      [t.typeOrder[a], t.typeOrder[b]] = [t.typeOrder[b], t.typeOrder[a]];
    });
  }

  // ---- item commands -----------------------------------------------------------------

  function updateFromBank(item, src) {
    if (!confirm('Replace this test’s copy with the current bank question? Edits made on the test will be lost.')) return;
    commit(() => {
      const copy = structuredClone(src.question);
      copy.id = item.question.id;
      item.question = copy;
    });
    toast('Updated from the bank');
  }

  function remove(item) {
    const fromBank = sourceOf(store.lib, item);
    const msg = fromBank
      ? 'Remove this question from the test? The bank question isn’t affected.'
      : 'Remove this question? It was written for this test, so it will be gone.';
    if (!confirm(msg)) return;
    commit((t) => t.items.splice(t.items.indexOf(item), 1));
  }

  // ---- dialogs -------------------------------------------------------------------------

  function sortDialog() {
    const fields = Object.entries(META_FIELDS).filter(([f]) => sortValuesFor(test, f).length);
    if (!fields.length) {
      openDialog('Sort questions', h('p', 'None of the questions on this test have question information (difficulty, topic, standards…) to sort by.'));
      return;
    }
    let field = fields[0][0];
    let values = sortValuesFor(test, field);
    const valuesEl = h('ol.sort-values');
    const renderValues = () => {
      add(clear(valuesEl), 
        ...values.map((v, i) =>
          h('li', h('span', v),
            h('button', { disabled: i === 0, onclick: () => { [values[i - 1], values[i]] = [values[i], values[i - 1]]; renderValues(); } }, '↑'),
            h('button', { disabled: i === values.length - 1, onclick: () => { [values[i + 1], values[i]] = [values[i], values[i + 1]]; renderValues(); } }, '↓')),
        ),
      );
    };
    renderValues();
    openDialog(
      'Sort questions',
      [
        h('label.field', h('span.field-label', 'Sort by'), select(Object.fromEntries(fields), field, {
          onchange: (e) => { field = e.target.value; values = sortValuesFor(test, field); renderValues(); },
        })),
        h('p.field-hint', 'Questions follow this order of values; questions without one go last.', test.mixTypes ? '' : ' Types stay grouped, so sorting happens within each group.'),
        valuesEl,
      ],
      [{ label: 'Cancel' }, { label: 'Sort', primary: true, onclick: () => commit((t) => sortItems(t, field, values)) }],
    );
  }

  function scrambleDialog() {
    const opts = { questions: true, choices: false };
    openDialog(
      'Scramble',
      [
        h('p.field-hint', 'Rearranges this test once. Printing several versions (A, B, C…) scrambles each version separately.'),
        h('label.check', h('input', { type: 'checkbox', checked: true, onchange: (e) => (opts.questions = e.target.checked) }), test.mixTypes ? 'Question order' : 'Question order within each type'),
        h('label.check', h('input', { type: 'checkbox', onchange: (e) => (opts.choices = e.target.checked) }), 'Answer choices (locked choices stay put)'),
      ],
      [{ label: 'Cancel' }, { label: 'Scramble', primary: true, onclick: () => commit((t) => scrambleTest(t, opts)) }],
    );
  }

  function pointsDialog() {
    const types = TYPE_ORDER.filter((t) => test.items.some((it) => it.question.type === t));
    const inputs = new Map();
    const rows = types.map((t) => {
      const pts = [...new Set(test.items.filter((it) => it.question.type === t).map((it) => Number(it.question.points)))];
      const input = h('input.narrow', { type: 'number', min: 0, step: 'any', value: pts.length === 1 ? pts[0] : '', placeholder: 'mixed' });
      inputs.set(t, input);
      return h('tr', h('td', QUESTION_TYPES[t].label), h('td', input));
    });
    openDialog(
      'Points',
      [h('p.field-hint', 'Set the points for every question of a type. Leave a box empty to keep the current points.'), h('table.points-table', h('tbody', rows))],
      [{ label: 'Cancel' }, {
        label: 'Apply',
        primary: true,
        onclick: () => commit((t) => {
          for (const [type, input] of inputs) {
            if (input.value === '') continue;
            for (const it of t.items) if (it.question.type === type) it.question.points = Number(input.value);
          }
        }),
      }],
    );
  }

  function clearDialog() {
    const sum = summary(store.lib, test);
    const bankChecks = [...sum.byBank].map(([title, e]) => ({ title, count: e.count, input: h('input', { type: 'checkbox' }) }));
    const typeChecks = [...sum.byType].map(([type, e]) => ({ type, count: e.count, input: h('input', { type: 'checkbox' }) }));
    openDialog(
      'Remove questions',
      [
        h('p.field-hint', 'Removing questions doesn’t change the banks. Questions written for this test or edited on it lose those changes.'),
        h('h4', 'From'),
        bankChecks.map((b) => h('label.check', b.input, `${b.title} (${b.count})`)),
        h('h4', 'Of type'),
        typeChecks.map((t) => h('label.check', t.input, `${QUESTION_TYPES[t.type].label} (${t.count})`)),
      ],
      [
        { label: 'Cancel' },
        {
          label: 'Remove',
          danger: true,
          onclick: () => {
            const banks = new Set(bankChecks.filter((b) => b.input.checked).map((b) => b.title));
            const types = new Set(typeChecks.filter((t) => t.input.checked).map((t) => t.type));
            if (!banks.size && !types.size) return false;
            const titleOf = (it) => store.lib.banks.find((b) => b.id === it.sourceBankId)?.title ?? (it.sourceBankId ? '(deleted bank)' : 'Written on this test');
            commit((t) => (t.items = t.items.filter((it) => !banks.has(titleOf(it)) && !types.has(it.question.type))));
          },
        },
      ],
    );
  }

  // ---- test commands ---------------------------------------------------------------------

  function duplicateTest() {
    const copy = structuredClone(test);
    copy.id = newId();
    copy.title = `${test.title} (copy)`;
    copy.created = copy.modified = now();
    copy.items.forEach((it) => (it.question.id = newId()));
    store.update((lib) => lib.tests.push(copy));
    location.hash = `#/test/${copy.id}`;
  }

  function deleteTest() {
    if (!confirm(`Delete the test “${test.title}”? The banks aren’t affected.`)) return;
    store.update((lib) => lib.tests.splice(lib.tests.indexOf(test), 1));
    location.hash = '#/';
  }

  renderList();
  return { refresh: renderList };
}
