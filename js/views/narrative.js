// Narratives: a shared passage, diagram or data table for several questions.
// Used by the bank view (and tests, which hold copies).

import { newNarrative } from '../model.js';
import { narrativeBody } from '../question-view.js';
import { narrativeRun } from '../algo/engine.js';
import { store } from '../store.js';
import { h, add, clear, field, openDialog, toast } from '../ui.js';

// Edit (or create, when `narrative` is null) a narrative belonging to `owner` (a bank or test).
export function editNarrative(owner, narrative = null) {
  const draft = narrative ? structuredClone(narrative) : newNarrative();
  const preview = h('div.narrative-preview');
  const errorEl = h('p.algo-error');
  const update = () => {
    clear(preview);
    preview.innerHTML = narrativeBody(draft, store.lib.images);
    const r = narrativeRun({ algorithm: draft.algorithm, seed: draft.id });
    errorEl.textContent = r.error ? `Algorithm line ${r.error.line ?? '?'}: ${r.error.message}` : '';
  };
  const body = [
    field('Name (for you; not printed)', h('input', { value: draft.title, oninput: (e) => (draft.title = e.target.value) })),
    field('Text', h('textarea', { rows: 6, value: draft.body, oninput: (e) => { draft.body = e.target.value; update(); } }),
      'Printed once before its questions. Math, images, tables and [[values]] work as in questions.'),
    field('Algorithm (optional)', h('textarea.algo-source', { rows: 3, value: draft.algorithm, spellcheck: false, placeholder: 'm = range(2, 6)\n# every linked question can use [[m]]', oninput: (e) => { draft.algorithm = e.target.value; update(); } }),
      'Variables defined here are shared by every question linked to this narrative.'),
    errorEl,
    h('div.field-label', 'Preview'),
    preview,
  ];
  update();
  return openDialog(narrative ? 'Edit narrative' : 'New narrative', body, [
    { label: 'Cancel' },
    {
      label: 'Save',
      primary: true,
      onclick: () => {
        draft.title = draft.title.trim() || 'Narrative';
        store.update(() => {
          owner.narratives ??= [];
          const i = owner.narratives.findIndex((n) => n.id === draft.id);
          if (i === -1) owner.narratives.push(draft);
          else owner.narratives[i] = draft;
        });
        toast('Narrative saved');
      },
    },
  ], { wide: true });
}

export function deleteNarrative(owner, narrative, questions) {
  const linked = questions.filter((q) => q.narrativeId === narrative.id);
  const msg = linked.length
    ? `Delete “${narrative.title}”? ${linked.length} question${linked.length === 1 ? ' uses' : 's use'} it and will be unlinked.`
    : `Delete “${narrative.title}”?`;
  if (!confirm(msg)) return;
  store.update(() => {
    owner.narratives = owner.narratives.filter((n) => n.id !== narrative.id);
    for (const q of linked) q.narrativeId = null;
  });
}

// The collapsible list of narratives shown above a bank's or test's questions.
export function narrativesPanel(owner, questions) {
  const list = owner.narratives || [];
  return h(
    'details.narratives-panel',
    { open: list.length > 0 && list.length <= 3 },
    h('summary', `Narratives (${list.length})`),
    h('p.field-hint', 'A narrative is a shared passage, diagram or data set. Link questions to it in the question editor; it prints once before them, and they stay together.'),
    list.map((n) => {
      const count = questions.filter((q) => q.narrativeId === n.id).length;
      return h('div.narrative-row',
        h('strong', n.title), h('span.muted', ` ${count} question${count === 1 ? '' : 's'}`),
        h('span.q-card-actions',
          h('button', { onclick: () => editNarrative(owner, n) }, 'Edit'),
          h('button.danger', { onclick: () => deleteNarrative(owner, n, questions) }, 'Delete')));
    }),
    h('div.row', h('button', { onclick: () => editNarrative(owner) }, '+ New narrative')),
  );
}

// The narrative shown above the first of a run of linked questions.
export function narrativeCard(narrative, images, seed) {
  const el = h('div.narrative-card', h('div.narrative-title', h('span.badge', 'Narrative'), ' ', narrative.title));
  add(el, h('div.narrative-text', { html: narrativeBody(narrative, images, { seed }) }));
  return el;
}
