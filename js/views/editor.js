// Question editor: a form on the left, a live preview on the right.
// Edits go to a draft; nothing changes in the bank until Save.

import {
  ESSAY_KINDS, MAX_CHOICES, MIN_CHOICES, QUESTION_TYPES, TYPE_ORDER,
  changeType, newChoice, newId, newQuestion, splitList, validateQuestion,
} from '../model.js';
import { store } from '../store.js';
import { questionBody, typeLabel } from '../question-view.js';
import { h, clear, field, select, toast, imageFileToDataUrl, insertAtCursor } from '../ui.js';

const LETTERS = 'ABCDEFGH';

export function editorView(main, { bankId, questionId, newType }) {
  const bank = store.lib.banks.find((b) => b.id === bankId);
  const existing = bank?.questions.find((q) => q.id === questionId);
  if (!bank || (questionId && !existing) || (newType && !QUESTION_TYPES[newType])) {
    main.append(h('div.empty', h('h2', 'Question not found'), h('a', { href: bank ? `#/bank/${bank.id}` : '#/' }, 'Back')));
    return {};
  }

  let draft = existing ? structuredClone(existing) : newQuestion(newType, store.lib.settings);
  let dirty = false;

  const form = h('div.editor-form');
  const preview = h('div.preview-body');
  const problemsEl = h('ul.problems');

  const markDirty = () => {
    dirty = true;
    updatePreview();
  };

  main.append(
    h(
      'div.editor-head',
      h('a', { href: `#/bank/${bank.id}` }, `← ${bank.title}`),
      h('h2', existing ? 'Edit question' : 'New question'),
      h(
        'div.editor-actions',
        h('button', { onclick: cancel }, 'Cancel'),
        h('button', { onclick: () => save(true), title: 'Save and start another question of the same type' }, 'Save & new'),
        h('button.primary', { onclick: () => save(false), title: 'Save (⌘↩)' }, 'Save'),
      ),
    ),
    h('div.editor', form, h('aside.editor-preview', h('h3', 'Preview'), preview, problemsEl)),
  );

  // ---- form ----------------------------------------------------------------

  function renderForm() {
    clear(form);
    form.append(
      h(
        'div.row',
        field('Type', select(Object.fromEntries(TYPE_ORDER.map((t) => [t, QUESTION_TYPES[t].label])), draft.type, {
          onchange: (e) => {
            draft = changeType(draft, e.target.value, store.lib.settings);
            markDirty();
            renderForm();
          },
        })),
        draft.type === 'essay'
          ? field('Label', select(ESSAY_KINDS, draft.kind, { onchange: (e) => { draft.kind = e.target.value; markDirty(); } }))
          : null,
        field('Points', h('input.narrow', { type: 'number', min: 0, step: 'any', value: draft.points, oninput: (e) => { draft.points = e.target.value === '' ? 0 : Number(e.target.value); markDirty(); } })),
      ),
      field('Question', richArea(draft.stem, (v) => (draft.stem = v), 5), 'Math: $F = ma$ inline, $$…$$ on its own line. **bold**, *italic*, ^sup^, ~sub~. Paste or drop an image.'),
      typeSection(),
      field('Rationale', richArea(draft.rationale, (v) => (draft.rationale = v), 2), 'Shown in answer keys when enabled.'),
      metaSection(),
      h(
        'div.row',
        h('label.check', h('input', { type: 'checkbox', checked: draft.flags.doNotUse, onchange: (e) => { draft.flags.doNotUse = e.target.checked; markDirty(); } }), 'Don’t use on tests'),
        h('label.check', h('input', { type: 'checkbox', checked: draft.flags.alwaysOneColumn, onchange: (e) => { draft.flags.alwaysOneColumn = e.target.checked; markDirty(); } }), 'Always one column in two-column tests'),
      ),
    );
  }

  function typeSection() {
    switch (draft.type) {
      case 'mc':
      case 'mr':
        return choicesSection();
      case 'tf':
        return field(
          'Answer',
          h(
            'div.row',
            [true, false].map((v) =>
              h('label.check', h('input', { type: 'radio', name: 'tf', checked: draft.answer === v, onchange: () => { draft.answer = v; markDirty(); } }), v ? 'True' : 'False'),
            ),
          ),
        );
      case 'num':
        return numericSection();
      case 'essay':
        return h(
          'div',
          field('Model answer', richArea(draft.answer.model, (v) => (draft.answer.model = v), 3), 'For the answer key; students don’t see it.'),
          field('Answer lines on paper', h('input.narrow', { type: 'number', min: 0, max: 40, value: draft.answerLines, oninput: (e) => { draft.answerLines = Number(e.target.value) || 0; markDirty(); } })),
        );
    }
  }

  function choicesSection() {
    const multi = draft.type === 'mr';
    const rows = h('div.choices-edit');
    const renderRows = () => {
      clear(rows);
      draft.choices.forEach((c, i) => {
        rows.append(
          h(
            'div.choice-row',
            h('label.correct-toggle', { title: multi ? 'Correct (select all that apply)' : 'Correct answer' },
              h('input', {
                type: multi ? 'checkbox' : 'radio',
                name: 'correct',
                checked: c.correct,
                onchange: (e) => {
                  if (!multi) draft.choices.forEach((o) => (o.correct = false));
                  c.correct = e.target.checked;
                  markDirty();
                },
              }),
              h('span.choice-letter', LETTERS[i]),
            ),
            richArea(c.text, (v) => (c.text = v), 1, { 'aria-label': `Choice ${LETTERS[i]}` }),
            h('label.check.small', { title: 'Keep this choice in place when scrambling (e.g. “All of the above”)' },
              h('input', { type: 'checkbox', checked: c.lockPosition, onchange: (e) => { c.lockPosition = e.target.checked; markDirty(); } }), 'Lock'),
            h('button.icon', {
              title: 'Remove choice',
              disabled: draft.choices.length <= MIN_CHOICES,
              onclick: () => { draft.choices.splice(i, 1); markDirty(); renderRows(); },
            }, '✕'),
          ),
        );
      });
    };
    renderRows();
    return h(
      'div',
      h('span.field-label', multi ? 'Choices (check every correct one)' : 'Choices (select the correct one)'),
      rows,
      h(
        'div.row',
        h('button', {
          onclick: () => {
            if (draft.choices.length >= MAX_CHOICES) return toast(`At most ${MAX_CHOICES} choices`);
            draft.choices.push(newChoice());
            markDirty();
            renderRows();
            rows.querySelector('.choice-row:last-child textarea')?.focus();
          },
        }, '+ Add choice'),
        field('Columns', select({ 1: '1', 2: '2', 3: '3', 4: '4' }, draft.columns, { onchange: (e) => { draft.columns = Number(e.target.value); markDirty(); } })),
      ),
    );
  }

  function numericSection() {
    const a = draft.answer;
    return h(
      'div',
      h(
        'div.row',
        field('Answer', h('input', { value: a.value, placeholder: 'e.g. 25, -4.9, 6.02e23', oninput: (e) => { a.value = e.target.value; markDirty(); } })),
        field('Unit', h('input.narrow', { value: a.unit, placeholder: 'J', oninput: (e) => { a.unit = e.target.value; markDirty(); } })),
        field('Tolerance', h('input.narrow', { value: a.tolerance, placeholder: '0', oninput: (e) => { a.tolerance = e.target.value; markDirty(); } })),
        field('', select({ abs: '± value', pct: '± percent' }, a.toleranceType, { onchange: (e) => { a.toleranceType = e.target.value; markDirty(); } })),
      ),
      field(
        'Also accept in Schoology',
        h('textarea', { rows: 2, value: a.accepted.join('\n'), placeholder: 'One per line, e.g. 25.0 J', oninput: (e) => { a.accepted = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); markDirty(); } }),
        'Schoology has no numeric type, so it gets a fill-in-the-blank with these exact forms. Tolerance only applies on paper.',
      ),
    );
  }

  function metaSection() {
    const m = draft.meta;
    const listInput = (key, placeholder) =>
      h('input', { value: m[key].join(', '), placeholder, oninput: (e) => { m[key] = splitList(e.target.value); markDirty(); } });
    const textInput = (key, placeholder, list) =>
      h('input', { value: m[key], placeholder, list, oninput: (e) => { m[key] = e.target.value; markDirty(); } });
    const anyMeta = Object.values(m).some((v) => (Array.isArray(v) ? v.length : v));
    return h(
      'details.meta-edit',
      { open: anyMeta },
      h('summary', 'Question information'),
      suggestions('dl-difficulty', 'difficulty', ['Easy', 'Medium', 'Hard']),
      suggestions('dl-topic', 'topic'),
      h(
        'div.grid2',
        field('Difficulty', textInput('difficulty', 'Easy, Medium, Hard…', 'dl-difficulty')),
        field('Topic', textInput('topic', 'e.g. Kinematics', 'dl-topic')),
        field('Reference', textInput('reference', 'e.g. Textbook 3.2')),
        field('Standards', listInput('standards', 'e.g. HS-PS2-1, HS-PS2-2')),
        field('Objectives', listInput('objectives', 'Comma-separated')),
        field('Keywords', listInput('keywords', 'Comma-separated')),
        field('Notes', textInput('notes', 'Private notes')),
        field('Miscellaneous', textInput('misc', '')),
      ),
    );
  }

  // Values already used anywhere in the library, offered as autocomplete.
  function suggestions(id, key, extra = []) {
    const values = new Set(extra);
    for (const b of store.lib.banks) for (const q of b.questions) if (q.meta[key]) values.add(q.meta[key]);
    return h('datalist', { id }, [...values].sort().map((v) => h('option', { value: v })));
  }

  // A textarea that supports pasting/dropping images into the library.
  function richArea(value, set, rows, attrs = {}) {
    const ta = h('textarea', {
      rows,
      value,
      ...attrs,
      oninput: (e) => { set(e.target.value); markDirty(); },
      onpaste: (e) => {
        const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
        if (file) { e.preventDefault(); addImage(ta, file); }
      },
      ondrop: (e) => {
        const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
        if (file) { e.preventDefault(); addImage(ta, file); }
      },
    });
    return ta;
  }

  async function addImage(ta, file) {
    try {
      const dataUrl = await imageFileToDataUrl(file);
      const id = newId();
      store.update((lib) => (lib.images[id] = dataUrl));
      insertAtCursor(ta, `![image](img:${id}|300)`);
    } catch {
      toast('That image couldn’t be read', 'error');
    }
  }

  // ---- preview and saving --------------------------------------------------

  function updatePreview() {
    clear(preview).append(
      h('div.q-card-head', h('span.badge', typeLabel(draft)), h('span.muted', `${draft.points} pt${Number(draft.points) === 1 ? '' : 's'}`)),
      ...questionBody(draft, store.lib.images),
    );
    const problems = validateQuestion(draft);
    clear(problemsEl).append(...problems.map((p) => h('li', p)));
  }

  function save(andNew) {
    const problems = validateQuestion(draft);
    if (problems.length && !confirm(`This question isn’t complete:\n\n• ${problems.join('\n• ')}\n\nSave anyway?`)) return;
    draft.modified = new Date().toISOString();
    store.update(() => {
      const i = bank.questions.findIndex((q) => q.id === draft.id);
      if (i === -1) bank.questions.push(draft);
      else bank.questions[i] = draft;
      bank.modified = draft.modified;
    });
    dirty = false;
    toast('Question saved');
    location.hash = andNew ? `#/bank/${bank.id}/new/${draft.type}?t=${Date.now()}` : `#/bank/${bank.id}?focus=${draft.id}`;
  }

  function cancel() {
    location.hash = existing ? `#/bank/${bank.id}?focus=${existing.id}` : `#/bank/${bank.id}`;
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save(false);
    }
  };
  document.addEventListener('keydown', onKey);

  renderForm();
  updatePreview();
  form.querySelector('textarea')?.focus();

  return {
    keepsOwnState: true,
    canLeave: () => !dirty || confirm('Discard changes to this question?'),
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}
