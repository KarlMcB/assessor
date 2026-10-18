// Adding bank questions to a test: random, from a list, while viewing,
// by standard, by criteria, or all.

import { QUESTION_TYPES, TYPE_ORDER, sortedByType } from '../model.js';
import { META_FIELDS, addToTest, distinctValues, metaValues, pickRandom, pool } from '../testmodel.js';
import { matchesQuery, parseQuery, questionSearchText } from '../search.js';
import { store } from '../store.js';
import { questionBody, typeLabel } from '../question-view.js';
import { renderRich } from '../richtext.js';
import { SELECT_METHODS } from './test.js';
import { h, add, clear, select, toast } from '../ui.js';

// Bank choice is remembered while the app is open.
let chosenBanks = null;

export function selectView(main, { testId, method }) {
  const test = store.lib.tests.find((t) => t.id === testId);
  if (!test || !SELECT_METHODS[method]) {
    add(main, h('div.empty', h('h2', 'Not found'), h('a', { href: test ? `#/test/${test.id}` : '#/' }, 'Back')));
    return {};
  }
  const banks = store.lib.banks;
  if (!chosenBanks) chosenBanks = banks.map((b) => b.id);
  chosenBanks = chosenBanks.filter((id) => banks.some((b) => b.id === id));
  if (!chosenBanks.length) chosenBanks = banks.map((b) => b.id);

  const body = h('div.select-body');
  const back = `#/test/${test.id}`;

  add(main, 
    h('div.editor-head', h('a', { href: back }, `← ${test.title}`), h('h2', `Add questions ${SELECT_METHODS[method].toLowerCase()}`)),
    h('nav.method-tabs', Object.entries(SELECT_METHODS).map(([m, label]) => h('a', { href: `#/test/${test.id}/add/${m}`, class: m === method ? 'active' : '' }, label))),
    banks.length
      ? h(
          'div.bank-picker',
          h('span.field-label', 'From banks:'),
          banks.map((b) =>
            h('label.check', h('input', {
              type: 'checkbox',
              checked: chosenBanks.includes(b.id),
              onchange: (e) => {
                chosenBanks = e.target.checked ? [...chosenBanks, b.id] : chosenBanks.filter((id) => id !== b.id);
                render();
              },
            }), `${b.title} `, h('span.muted', `(${b.questions.length})`)),
          ),
        )
      : h('div.empty', h('p', 'There are no question banks yet.')),
    body,
  );

  const available = () => pool(store.lib, test, chosenBanks);
  const onTestFrom = (pred) => test.items.filter((it) => chosenBanks.includes(it.sourceBankId) && pred(it.question)).length;

  function addEntries(entries) {
    if (!entries.length) return toast('Nothing selected');
    store.update(() => addToTest(test, entries));
    toast(`Added ${entries.length} question${entries.length === 1 ? '' : 's'}`);
    location.hash = back;
  }

  function render() {
    clear(body);
    if (!chosenBanks.length) return add(body, h('p.muted', 'Choose at least one bank.'));
    ({ random, list, view, standard, criteria, all })[method]();
  }

  // ---- randomly -----------------------------------------------------------------------

  function random() {
    const avail = available();
    const inputs = new Map();
    const rows = TYPE_ORDER.map((type) => {
      const n = avail.filter((e) => e.q.type === type).length;
      const input = h('input.narrow', { type: 'number', min: 0, max: n, value: '', placeholder: '0', disabled: !n });
      inputs.set(type, input);
      return h('tr', h('td', QUESTION_TYPES[type].label), h('td.num', String(onTestFrom((q) => q.type === type))), h('td.num', String(n)), h('td', input));
    });
    add(body, 
      h('table.select-table', h('thead', h('tr', h('th', 'Type'), h('th', 'Already on test'), h('th', 'Available'), h('th', 'Add'))), h('tbody', rows)),
      h('div.row', h('button.primary', {
        onclick: () => {
          const picked = [];
          for (const [type, input] of inputs) {
            const want = Math.min(Number(input.value) || 0, Number(input.max));
            picked.push(...pickRandom(avail.filter((e) => e.q.type === type), want));
          }
          addEntries(picked);
        },
      }, 'Add questions')),
    );
  }

  // ---- from a list ----------------------------------------------------------------------

  let listSort = 'order';
  function list() {
    const avail = available();
    const sortFields = { order: 'Bank order', ...META_FIELDS };
    const keyOf = (e) => (listSort === 'order' ? '' : metaValues(e.q, listSort).join(', '));
    const rows = listSort === 'order'
      ? avail
      : avail.slice().sort((a, b) => (keyOf(a) || '￿').localeCompare(keyOf(b) || '￿', undefined, { numeric: true }));
    const checks = new Map();
    const numberInBank = (e) => e.bank.questions.indexOf(e.q) + 1;
    add(body, 
      h('div.row', h('label.field', h('span.field-label', 'Sort by'), select(sortFields, listSort, { onchange: (e) => { listSort = e.target.value; render(); } })),
        h('span.field-hint', 'Tip: print a bank with its question numbers, then tick the ones you want here.')),
      avail.length
        ? h('table.select-table.list',
            h('thead', h('tr', h('th', ''), h('th', 'Bank'), h('th', '#'), h('th', 'Type'), listSort === 'order' ? null : h('th', sortFields[listSort]), h('th', 'Question'))),
            h('tbody', rows.map((e) => {
              const box = h('input', { type: 'checkbox' });
              checks.set(e, box);
              return h('tr', { onclick: (ev) => { if (ev.target !== box) box.checked = !box.checked; } },
                h('td', box), h('td', e.bank.title), h('td.num', String(numberInBank(e))), h('td', typeLabel(e.q)),
                listSort === 'order' ? null : h('td', keyOf(e)),
                h('td.snippet', { html: renderRich(e.q.stem, store.lib.images) }));
            })))
        : h('p.muted', 'No questions left to add from these banks.'),
      h('div.row', h('button.primary', { onclick: () => addEntries(rows.filter((e) => checks.get(e).checked)) }, 'Add checked questions')),
    );
  }

  // ---- while viewing -----------------------------------------------------------------------

  function view() {
    const avail = available();
    add(body, previewChecklist(avail, (picked) => addEntries(picked)));
  }

  // Rendered questions with checkboxes, grouped by bank then type.
  function previewChecklist(entries, onAdd) {
    const checks = new Map();
    const container = h('div.view-list');
    const byBank = new Map();
    for (const e of entries) {
      if (!byBank.has(e.bank)) byBank.set(e.bank, []);
      byBank.get(e.bank).push(e);
    }
    const groupBox = (members) =>
      h('input', { type: 'checkbox', title: 'Select all in this group', onchange: (ev) => members.forEach((m) => (checks.get(m).checked = ev.target.checked)) });
    for (const [bank, list] of byBank) {
      container.append(h('h3.view-bank', h('label.check', groupBox(list), bank.title)));
      for (const g of sortedByType(list.map((e) => e.q))) {
        const members = list.filter((e) => e.q.type === g.type);
        container.append(h('h4.type-heading', h('label.check', groupBox(members), `${QUESTION_TYPES[g.type].label} (${members.length})`)));
        for (const e of members) {
          const box = h('input', { type: 'checkbox' });
          checks.set(e, box);
          container.append(h('label.q-card.pickable', h('div.pick', box), h('div.q-card-body', questionBody(e.q, store.lib.images))));
        }
      }
    }
    if (!entries.length) container.append(h('p.muted', 'No questions to show.'));
    const addBtn = () => h('button.primary', { onclick: () => onAdd(entries.filter((e) => checks.get(e).checked)) }, 'Add checked questions');
    return h('div', h('div.row', addBtn()), container, entries.length > 3 ? h('div.row', addBtn()) : null);
  }

  // ---- by standard ------------------------------------------------------------------------

  let standardField = 'standards';
  function standard() {
    const avail = available();
    const fields = { standards: 'Standard', objectives: 'Learning objective', topic: 'Topic', difficulty: 'Difficulty', keywords: 'Keyword' };
    const values = distinctValues(avail.map((e) => e.q).concat(test.items.map((it) => it.question)), standardField);
    const inputs = new Map();
    const rows = values.map((v) => {
      const n = avail.filter((e) => metaValues(e.q, standardField).includes(v)).length;
      const input = h('input.narrow', { type: 'number', min: 0, max: n, placeholder: '0', disabled: !n });
      inputs.set(v, input);
      return h('tr', h('td', v), h('td.num', String(test.items.filter((it) => metaValues(it.question, standardField).includes(v)).length)), h('td.num', String(n)), h('td', input));
    });
    add(body, 
      h('div.row', h('label.field', h('span.field-label', 'Choose by'), select(fields, standardField, { onchange: (e) => { standardField = e.target.value; render(); } }))),
      values.length
        ? h('table.select-table', h('thead', h('tr', h('th', fields[standardField]), h('th', 'On test'), h('th', 'Available'), h('th', 'Add'))), h('tbody', rows))
        : h('p.muted', `None of the questions in these banks have a ${fields[standardField].toLowerCase()} yet. Add one under “Question information” in the editor.`),
      h('p.field-hint', 'A question with several values counts under each, so totals can overlap.'),
      h('div.row', h('button.primary', {
        disabled: !values.length,
        onclick: () => {
          const picked = new Set();
          for (const [v, input] of inputs) {
            const want = Number(input.value) || 0;
            const candidates = avail.filter((e) => !picked.has(e) && metaValues(e.q, standardField).includes(v));
            pickRandom(candidates, want).forEach((e) => picked.add(e));
          }
          addEntries([...picked]);
        },
      }, 'Add questions')),
    );
  }

  // ---- by criteria --------------------------------------------------------------------------

  const crit = { type: '', text: '', difficulty: '', topic: '', reference: '', standards: '', objectives: '', keywords: '' };
  function criteria() {
    const avail = available();
    const questions = avail.map((e) => e.q);
    const results = h('div.criteria-results');

    const matchesNow = () => {
      const clauses = parseQuery(crit.text);
      return avail.filter((e) => {
        if (crit.type && e.q.type !== crit.type) return false;
        for (const f of Object.keys(META_FIELDS)) if (crit[f] && !metaValues(e.q, f).includes(crit[f])) return false;
        return matchesQuery(clauses, questionSearchText(e.q));
      });
    };

    const fieldSelect = (f) => {
      const values = distinctValues(questions, f);
      return h('label.field', h('span.field-label', META_FIELDS[f]),
        select({ '': 'Any', ...Object.fromEntries(values.map((v) => [v, v])) }, crit[f], { disabled: !values.length, onchange: (e) => { crit[f] = e.target.value; update(); } }));
    };

    add(body, 
      h('div.criteria-grid',
        h('label.field', h('span.field-label', 'Type'), select({ '': 'Any', ...Object.fromEntries(TYPE_ORDER.map((t) => [t, QUESTION_TYPES[t].label])) }, crit.type, { onchange: (e) => { crit.type = e.target.value; update(); } })),
        Object.keys(META_FIELDS).map(fieldSelect)),
      h('label.field',
        h('span.field-label', 'Text search'),
        h('input', { type: 'search', value: crit.text, placeholder: 'e.g. projectile (velocity, speed) -friction accel*', oninput: (e) => { crit.text = e.target.value; update(); } }),
        h('span.field-hint', 'Words must all appear. "exact phrase" · -exclude · (either, or) · prefix* — not case-sensitive.')),
      results,
    );

    function update() {
      const matches = matchesNow();
      const countInput = h('input.narrow', { type: 'number', min: 0, max: matches.length, placeholder: '0' });
      add(clear(results), 
        h('p.match-count', `${matches.length} question${matches.length === 1 ? '' : 's'} match.`),
        matches.length
          ? h('div.row', 'Add ', countInput, ' of them at random ',
              h('button.primary', { onclick: () => addEntries(pickRandom(matches, Math.min(Number(countInput.value) || 0, matches.length))) }, 'Add'),
              h('span.muted', '— or tick them below:'))
          : null,
        matches.length ? previewChecklist(matches, (picked) => addEntries(picked)) : null,
      );
    }
    update();
  }

  // ---- all ------------------------------------------------------------------------------------

  function all() {
    const avail = available();
    add(body, 
      h('p', avail.length ? `${avail.length} question${avail.length === 1 ? '' : 's'} from the chosen banks ${avail.length === 1 ? 'isn’t' : 'aren’t'} on the test yet.` : 'Every question from the chosen banks is already on the test.'),
      h('p.field-hint', 'Questions marked “Don’t use on tests” are left out.'),
      h('button.primary', { disabled: !avail.length, onclick: () => addEntries(avail) }, `Add all ${avail.length}`),
    );
  }

  render();
  return { keepsOwnState: true };
}
