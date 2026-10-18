// Bank view: one bank's questions, grouped by type or in bank order.

import { QUESTION_TYPES, TYPE_ORDER, bankFile, duplicateQuestion, questionCountLabel, sortedByType, validateQuestion } from '../model.js';
import { downloadJson, store } from '../store.js';
import { questionBody, metaChips, typeLabel } from '../question-view.js';
import { h, clear, select, toast } from '../ui.js';

// View options survive re-renders and navigation within the session.
const viewState = new Map();

function stateFor(bankId) {
  if (!viewState.has(bankId)) viewState.set(bankId, { filter: '', type: 'all', grouped: true, answers: true });
  return viewState.get(bankId);
}

export function bankView(main, { bankId, focus }) {
  const bank = store.lib.banks.find((b) => b.id === bankId);
  if (!bank) {
    main.append(h('div.empty', h('h2', 'Bank not found'), h('a', { href: '#/' }, 'Back to start')));
    return {};
  }
  const st = stateFor(bankId);
  const list = h('div.question-list');
  const countEl = h('span.muted');

  const commit = (fn) => store.update(() => {
    fn(bank);
    bank.modified = new Date().toISOString();
  });

  const header = h(
    'div.bank-header',
    h(
      'div.bank-titles',
      h('input.title-input', {
        value: bank.title,
        'aria-label': 'Bank title',
        onchange: (e) => commit((b) => (b.title = e.target.value.trim() || 'Untitled bank')),
      }),
      h('input.subtitle-input', {
        value: bank.subtitle,
        placeholder: 'Subtitle (optional)',
        'aria-label': 'Bank subtitle',
        onchange: (e) => commit((b) => (b.subtitle = e.target.value.trim())),
      }),
      countEl,
    ),
    h(
      'div.bank-actions',
      h('button', { onclick: () => exportBank(bank) }, 'Export bank'),
      h('button.danger', { onclick: () => deleteBank(bank) }, 'Delete bank'),
    ),
  );

  const newButtons = h(
    'div.new-question',
    h('span.muted', 'New question:'),
    TYPE_ORDER.map((t) => h('button', { onclick: () => (location.hash = `#/bank/${bank.id}/new/${t}`) }, QUESTION_TYPES[t].label)),
  );

  const filterInput = h('input.filter', {
    type: 'search',
    placeholder: 'Filter by text, topic, standard…',
    value: st.filter,
    oninput: (e) => {
      st.filter = e.target.value;
      renderList();
    },
  });

  const toolbar = h(
    'div.toolbar',
    filterInput,
    select({ all: 'All types', ...Object.fromEntries(TYPE_ORDER.map((t) => [t, QUESTION_TYPES[t].label])) }, st.type, {
      'aria-label': 'Question type filter',
      onchange: (e) => {
        st.type = e.target.value;
        renderList();
      },
    }),
    h('label.check', h('input', { type: 'checkbox', checked: st.grouped, onchange: (e) => { st.grouped = e.target.checked; renderList(); } }), 'Group by type'),
    h('label.check', h('input', { type: 'checkbox', checked: st.answers, onchange: (e) => { st.answers = e.target.checked; renderList(); } }), 'Show answers'),
  );

  main.append(header, newButtons, toolbar, list);

  function visibleQuestions() {
    const needle = st.filter.trim().toLowerCase();
    return bank.questions.filter((q) => {
      if (st.type !== 'all' && q.type !== st.type) return false;
      if (!needle) return true;
      return searchText(q).includes(needle);
    });
  }

  // Questions in the order they're displayed (grouped or bank order).
  function displayOrder(qs) {
    return st.grouped ? sortedByType(qs).flatMap((g) => g.questions) : qs;
  }

  function renderList() {
    clear(list);
    countEl.textContent = questionCountLabel(bank.questions.length);
    const qs = visibleQuestions();
    if (!bank.questions.length) {
      list.append(h('div.empty', h('p', 'This bank has no questions yet. Use the buttons above to add one.')));
      return;
    }
    if (!qs.length) {
      list.append(h('div.empty', h('p', 'No questions match the filter.')));
      return;
    }
    const order = displayOrder(qs);
    const numberOf = new Map(order.map((q, i) => [q.id, i + 1]));
    if (st.grouped) {
      for (const g of sortedByType(qs)) {
        list.append(h('h3.type-heading', `${QUESTION_TYPES[g.type].label} `, h('span.muted', `(${g.questions.length})`)));
        for (const q of g.questions) list.append(card(q, numberOf.get(q.id), order));
      }
    } else {
      for (const q of order) list.append(card(q, numberOf.get(q.id), order));
    }
    if (focus) {
      const el = list.querySelector(`[data-qid="${focus}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('flash');
      }
      focus = null;
    }
  }

  function card(q, number, order) {
    const problems = validateQuestion(q);
    const editHref = `#/bank/${bank.id}/q/${q.id}`;
    const others = store.lib.banks.filter((b) => b.id !== bank.id);
    return h(
      'article.q-card',
      { 'data-qid': q.id, class: q.flags.doNotUse ? 'do-not-use' : '', ondblclick: () => (location.hash = editHref) },
      h(
        'header.q-card-head',
        h('span.q-number', `${number}.`),
        h('span.badge', typeLabel(q)),
        h('span.muted', `${q.points} pt${Number(q.points) === 1 ? '' : 's'}`),
        q.flags.doNotUse ? h('span.badge.warn', 'Not used on tests') : null,
        problems.length ? h('span.badge.warn', { title: problems.join('\n') }, `${problems.length} issue${problems.length > 1 ? 's' : ''}`) : null,
        h(
          'span.q-card-actions',
          h('a.button', { href: editHref }, 'Edit'),
          h('button', { onclick: () => duplicate(q) }, 'Duplicate'),
          h('button', { title: 'Move up', onclick: () => move(q, order, -1) }, '↑'),
          h('button', { title: 'Move down', onclick: () => move(q, order, 1) }, '↓'),
          others.length
            ? select(
                { '': 'Copy/move…', ...Object.fromEntries(others.flatMap((b) => [[`copy:${b.id}`, `Copy to ${b.title}`], [`move:${b.id}`, `Move to ${b.title}`]])) },
                '',
                { 'aria-label': 'Copy or move to another bank', onchange: (e) => transfer(q, e.target.value) },
              )
            : null,
          h('button.danger', { onclick: () => remove(q) }, 'Delete'),
        ),
      ),
      h('div.q-card-body', questionBody(q, store.lib.images, { showAnswer: st.answers, showRationale: st.answers })),
      metaChips(q).length ? h('footer.q-meta', metaChips(q)) : null,
    );
  }

  function duplicate(q) {
    commit((b) => {
      const i = b.questions.indexOf(q);
      b.questions.splice(i + 1, 0, duplicateQuestion(q));
    });
  }

  function move(q, order, dir) {
    // Swap with the neighbouring question in the current display order.
    const pos = order.indexOf(q);
    const other = order[pos + dir];
    if (!other) return;
    commit((b) => {
      const i = b.questions.indexOf(q);
      const j = b.questions.indexOf(other);
      [b.questions[i], b.questions[j]] = [b.questions[j], b.questions[i]];
    });
  }

  function transfer(q, value) {
    const [action, targetId] = value.split(':');
    const target = store.lib.banks.find((b) => b.id === targetId);
    if (!target) return;
    store.update(() => {
      target.questions.push(duplicateQuestion(q));
      target.modified = new Date().toISOString();
      if (action === 'move') bank.questions.splice(bank.questions.indexOf(q), 1);
      bank.modified = target.modified;
    });
    toast(`${action === 'move' ? 'Moved' : 'Copied'} to ${target.title}`);
  }

  function remove(q) {
    if (!confirm('Delete this question? This can’t be undone.')) return;
    commit((b) => b.questions.splice(b.questions.indexOf(q), 1));
  }

  renderList();
  return { refresh: renderList };
}

function searchText(q) {
  const parts = [q.stem, q.rationale, ...(q.choices || []).map((c) => c.text), q.answer?.model, q.answer?.value];
  const m = q.meta;
  parts.push(m.difficulty, m.reference, m.topic, m.notes, m.misc, ...m.standards, ...m.objectives, ...m.keywords);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function exportBank(bank) {
  const safe = bank.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'bank';
  downloadJson(bankFile(store.lib, bank), `${safe}.bank.json`);
  toast('Bank exported');
}

function deleteBank(bank) {
  const n = bank.questions.length;
  if (!confirm(`Delete the bank “${bank.title}” and its ${questionCountLabel(n)}? This can’t be undone.`)) return;
  store.update((lib) => lib.banks.splice(lib.banks.indexOf(bank), 1));
  location.hash = '#/';
}
