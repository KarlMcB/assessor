// Adding bank questions to a test: random, from a list, while viewing,
// by standard, by criteria, or all.

import { QUESTION_TYPES, TYPE_ORDER, narrativeOf, sortedByType } from '../model.js';
import { META_FIELDS, addToTest, distinctValues, metaValues, pickRandom, pool } from '../testmodel.js';
import { matchesQuery, parseQuery, questionSearchText } from '../search.js';
import { store } from '../store.js';
import { narrativeBody, narrativeContext, questionBody, typeLabel } from '../question-view.js';
import { renderRich } from '../richtext.js';
import { bankMenu, shownBanks } from './bank-menu.js';
import { h, add, clear, select, toast } from '../ui.js';

export const SELECT_METHODS = {
  random: 'Randomly',
  list: 'From a list',
  view: 'While viewing',
  standard: 'By standard',
  criteria: 'By criteria',
  all: 'All questions',
};

// Filters shown above the list and viewing methods. Kept while switching tabs.
const filters = { objectives: '', topic: '', difficulty: '', standards: '', type: '', text: '' };
const FILTER_FIELDS = { objectives: 'Objective', topic: 'Topic', difficulty: 'Difficulty', standards: 'Standard' };

export function filterEntries(entries, f = filters) {
  const clauses = parseQuery(f.text);
  return entries.filter((e) => {
    if (f.type && e.q.type !== f.type) return false;
    for (const k of Object.keys(FILTER_FIELDS)) if (f[k] && !metaValues(e.q, k).includes(f[k])) return false;
    return matchesQuery(clauses, questionSearchText(e.q));
  });
}

export function selectView(main, { testId, method }) {
  const test = store.lib.tests.find((t) => t.id === testId);
  if (!test || !SELECT_METHODS[method]) {
    add(main, h('div.empty', h('h2', 'Not found'), h('a', { href: test ? `#/test/${test.id}` : '#/' }, 'Back')));
    return {};
  }
  const banks = () => store.lib.banks;
  let chosenBanks = shownBanks();

  const body = h('div.select-body');
  const back = `#/test/${test.id}`;

  add(main, 
    h('div.editor-head', h('a', { href: back }, `← ${test.title}`), h('h2', `Add questions ${SELECT_METHODS[method].toLowerCase()}`)),
    h('nav.method-tabs', Object.entries(SELECT_METHODS).map(([m, label]) => h('a', { href: `#/test/${test.id}/add/${m}`, class: m === method ? 'active' : '' }, label))),
    h('div.bank-picker', bankMenu((ids) => { chosenBanks = ids; render(); })),
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

  // Ticked questions, kept while the filters change.
  const picked = new Set();
  const keyOf = (e) => `${e.bank.id}/${e.q.id}`;
  const pickedEntries = (avail) => avail.filter((e) => picked.has(keyOf(e)));

  // Drop-down filters for objective, topic, difficulty, standard and type, plus a text search.
  // The topic list narrows to the chosen objective.
  function filterBar(avail, onChange) {
    const selects = h('div.filter-selects');
    const reset = h('button', { type: 'button', onclick: () => {
      Object.keys(filters).forEach((k) => (filters[k] = ''));
      search.value = '';
      drawSelects(); onChange();
    } }, 'Clear filters');
    const search = h('input', { type: 'search', value: filters.text, placeholder: 'Search text, e.g. projectile -friction accel*',
      oninput: (e) => { filters.text = e.target.value; onChange(); } });
    function drawSelects() {
      const qs = avail.map((e) => e.q);
      const topicPool = filters.objectives ? avail.filter((e) => metaValues(e.q, 'objectives').includes(filters.objectives)).map((e) => e.q) : qs;
      const pool = { objectives: qs, topic: topicPool, difficulty: qs, standards: qs };
      for (const k of Object.keys(FILTER_FIELDS)) {
        if (filters[k] && !distinctValues(pool[k], k).includes(filters[k])) filters[k] = '';
      }
      const types = TYPE_ORDER.filter((t) => avail.some((e) => e.q.type === t));
      if (filters.type && !types.includes(filters.type)) filters.type = '';
      add(clear(selects),
        Object.entries(FILTER_FIELDS).map(([k, label]) => {
          const values = distinctValues(pool[k], k);
          return h('label.field', h('span.field-label', label),
            select({ '': `All (${values.length})`, ...Object.fromEntries(values.map((v) => [v, v])) }, filters[k], {
              disabled: !values.length,
              onchange: (e) => { filters[k] = e.target.value; drawSelects(); onChange(); },
            }));
        }),
        h('label.field', h('span.field-label', 'Type'),
          select({ '': 'All', ...Object.fromEntries(types.map((t) => [t, QUESTION_TYPES[t].label])) }, filters.type, {
            onchange: (e) => { filters.type = e.target.value; onChange(); },
          })),
      );
    }
    drawSelects();
    return h('div.filter-bar', selects,
      h('div.filter-search', h('label.field', h('span.field-label', 'Text search'), search), reset),
      h('span.field-hint', 'Words must all appear. "exact phrase" · -exclude · (either, or) · prefix* — not case-sensitive.'));
  }

  // The count of shown and ticked questions, with the Add button, kept current.
  function pickBar(avail) {
    const status = h('span.match-count');
    const btn = h('button.primary', { onclick: () => addEntries(pickedEntries(avail)) });
    const update = (shown) => {
      const n = pickedEntries(avail).length;
      status.textContent = `${shown} of ${avail.length} shown · ${n} ticked`;
      btn.textContent = n ? `Add ${n} ticked question${n === 1 ? '' : 's'}` : 'Add ticked questions';
      btn.disabled = !n;
    };
    return { el: h('div.row.pick-bar', btn, status), update };
  }

  function render() {
    clear(body);
    if (!chosenBanks.length) return add(body, h('p.muted', banks().length ? 'Choose at least one bank from the Banks list.' : 'No banks are open. Open a bank file from the Banks list.'));
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
    const sortKey = (e) => (listSort === 'order' ? '' : metaValues(e.q, listSort).join(', '));
    const numberInBank = (e) => e.bank.questions.indexOf(e.q) + 1;
    const results = h('div.filter-results');
    const bar = pickBar(avail);
    add(body,
      h('div.filter-sticky', filterBar(avail, draw),
        h('div.row', h('label.field', h('span.field-label', 'Sort by'), select(sortFields, listSort, { onchange: (e) => { listSort = e.target.value; draw(); } })),
          h('span.field-hint', 'Ticks are kept when you change the filters.')),
        bar.el),
      results,
    );
    function draw() {
      const shown = filterEntries(avail);
      const rows = listSort === 'order'
        ? shown
        : shown.slice().sort((a, b) => (sortKey(a) || '\uffff').localeCompare(sortKey(b) || '\uffff', undefined, { numeric: true }));
      bar.update(shown.length);
      add(clear(results), !avail.length
        ? h('p.muted', 'No questions left to add from these banks.')
        : !rows.length
          ? h('p.muted', 'No questions match these filters.')
          : h('table.select-table.list',
              h('thead', h('tr', h('th', ''), h('th', 'Bank'), h('th', '#'), h('th', 'Type'), h('th', 'Topic'), h('th', 'Difficulty'), listSort === 'order' || ['topic', 'difficulty'].includes(listSort) ? null : h('th', sortFields[listSort]), h('th', 'Question'))),
              h('tbody', rows.map((e) => {
                const box = h('input', { type: 'checkbox', checked: picked.has(keyOf(e)),
                  onchange: () => { box.checked ? picked.add(keyOf(e)) : picked.delete(keyOf(e)); bar.update(shown.length); } });
                return h('tr', { onclick: (ev) => { if (ev.target !== box) { box.checked = !box.checked; box.dispatchEvent(new Event('change')); } } },
                  h('td', box), h('td', e.bank.title), h('td.num', String(numberInBank(e))), h('td', typeLabel(e.q)),
                  h('td', e.q.meta.topic || ''), h('td', e.q.meta.difficulty || ''),
                  listSort === 'order' || ['topic', 'difficulty'].includes(listSort) ? null : h('td', sortKey(e)),
                  h('td.snippet', { html: renderRich(e.q.stem, store.lib.images) }));
              }))));
    }
    draw();
  }

  // ---- while viewing -----------------------------------------------------------------------

  function view() {
    const avail = available();
    const results = h('div.filter-results');
    const bar = pickBar(avail);
    add(body, h('div.filter-sticky', filterBar(avail, draw), bar.el), results);
    function draw() {
      const shown = filterEntries(avail);
      bar.update(shown.length);
      add(clear(results), !avail.length
        ? h('p.muted', 'No questions left to add from these banks.')
        : shown.length
          ? previewChecklist(shown, null, { picked, keyOf, onPick: () => bar.update(shown.length) })
          : h('p.muted', 'No questions match these filters.'));
    }
    draw();
  }

  // Rendered questions with checkboxes, grouped by bank then type.
  // With `keep`, ticks are stored in keep.picked and no Add buttons are drawn here.
  function previewChecklist(entries, onAdd, keep = null) {
    const checks = new Map();
    const container = h('div.view-list');
    const byBank = new Map();
    for (const e of entries) {
      if (!byBank.has(e.bank)) byBank.set(e.bank, []);
      byBank.get(e.bank).push(e);
    }
    const setPick = (e, on) => {
      checks.get(e).checked = on;
      if (keep) { on ? keep.picked.add(keep.keyOf(e)) : keep.picked.delete(keep.keyOf(e)); }
    };
    const groupBox = (members) =>
      h('input', { type: 'checkbox', title: 'Select all in this group', onchange: (ev) => { members.forEach((m) => setPick(m, ev.target.checked)); keep?.onPick(); } });
    for (const [bank, list] of byBank) {
      container.append(h('h3.view-bank', h('label.check', groupBox(list), bank.title)));
      for (const g of sortedByType(list.map((e) => e.q))) {
        const members = list.filter((e) => e.q.type === g.type);
        container.append(h('h4.type-heading', h('label.check', groupBox(members), `${QUESTION_TYPES[g.type].label} (${members.length})`)));
        let shown = null;
        for (const e of members) {
          const box = h('input', { type: 'checkbox', checked: keep ? keep.picked.has(keep.keyOf(e)) : false,
            onchange: () => { if (keep) { setPick(e, box.checked); keep.onPick(); } } });
          checks.set(e, box);
          // A narrative often holds the question's figure, so show it above the questions using it.
          const n = narrativeOf(e.bank, e.q);
          if (n && n !== shown) {
            container.append(h('div.narrative-card', h('div.narrative-title', n.title), h('div.narrative-text', { html: narrativeBody(n, store.lib.images) })));
          }
          shown = n;
          const narrative = narrativeContext(n, n?.id);
          const tags = [e.q.meta.topic, e.q.meta.difficulty, ...e.q.meta.standards].filter(Boolean).join(' · ');
          container.append(h('label.q-card.pickable', h('div.pick', box), h('div.q-card-body', tags ? h('div.q-tags', tags) : null, questionBody(e.q, store.lib.images, { narrative }))));
        }
      }
    }
    if (!entries.length) container.append(h('p.muted', 'No questions to show.'));
    if (keep) return container;
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
