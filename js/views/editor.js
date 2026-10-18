// Question editor: a form on the left, a live preview on the right.
// Edits go to a draft; nothing changes in the bank or test until Save.

import {
  ESSAY_KINDS, MAX_CHOICES, MIN_CHOICES, QUESTION_TYPES, TYPE_ORDER,
  changeType, newChoice, newId, newPair, newQuestion, splitList, MAX_MATCH,
} from '../model.js';
import { store } from '../store.js';
import { questionBody, questionProblems, typeLabel, narrativeContext } from '../question-view.js';
import { editNarrative, narrativeCard } from './narrative.js';
import { narrativeOf } from '../model.js';
import { GRAPH_TEMPLATE, NUMBERLINE_TEMPLATE } from '../graph.js';
import { splitPastedQuestion } from '../import/text2qti.js';
import { instantiate } from '../algo/engine.js';
import { FUNCTIONS, CONSTANT_DOCS } from '../algo/functions.js';
import { formatValue } from '../algo/values.js';
import { renderMath } from '../richtext.js';
import { h, add, clear, field, select, toast, imageFileToDataUrl, insertAtCursor } from '../ui.js';

const LETTERS = 'ABCDEFGH';

export function editorView(main, { container, questionId, newType }) {
  const existing = container && questionId ? container.find(questionId) : null;
  if (!container || (questionId && !existing) || (newType && !QUESTION_TYPES[newType])) {
    add(main, h('div.empty', h('h2', 'Question not found'), h('a', { href: container ? container.backHref() : '#/' }, 'Back')));
    return {};
  }

  let draft = existing ? structuredClone(existing) : newQuestion(newType, store.lib.settings);
  let dirty = false;
  // Preview values: the question's own seed first, a new one on each Recalculate.
  let recalcCount = 0;
  const previewSeed = () => (recalcCount ? `${container.seed(draft)}#${recalcCount}` : container.seed(draft));
  // The text field that [[name]] gets inserted into from the values table.
  let lastField = null;

  const form = h('div.editor-form');
  const preview = h('div.preview-body');
  const problemsEl = h('ul.problems');
  const valuesEl = h('div.algo-values');

  const markDirty = () => {
    dirty = true;
    updatePreview();
  };

  add(main, 
    h(
      'div.editor-head',
      h('a', { href: container.backHref() }, `← ${container.title}`),
      h('h2', existing ? 'Edit question' : 'New question'),
      h(
        'div.editor-actions',
        h('button', { onclick: cancel }, 'Cancel'),
        existing ? container.extraActions(draft).map((a) => h('button', { title: a.title, onclick: () => save(false, a) }, a.label)) : null,
        h('button', { onclick: () => save(true), title: 'Save and start another question of the same type' }, 'Save & new'),
        h('button.primary', { onclick: () => save(false), title: 'Save (⌘↩)' }, 'Save'),
      ),
    ),
    container.note ? h('p.editor-note', container.note) : null,
    h('div.editor', form, h('aside.editor-preview', h('h3', 'Preview'), preview, problemsEl)),
  );

  // ---- form ----------------------------------------------------------------

  function renderForm() {
    clear(form);
    add(form, 
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
      field('Question', richArea(draft.stem, (v) => (draft.stem = v), 5, { 'data-stem': 'true' }), 'Math: $F = ma$ inline, $$…$$ on its own line. **bold**, *italic*, ^sup^, ~sub~. Paste or drop an image. Pasting a question with lettered choices fills in the choices too. Algorithm values: [[m]] or [[= 2*m :: dp 1]].'),
      h('div.row.insert-row',
        h('span.field-hint', 'Insert into the last text field used:'),
        h('button', { onclick: () => insertBlock(GRAPH_TEMPLATE) }, 'Graph'),
        h('button', { onclick: () => insertBlock(NUMBERLINE_TEMPLATE) }, 'Number line')),
      narrativeField(),
      algorithmSection(),
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
      case 'match':
        return matchSection();
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
        add(rows, 
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

  // Matching: items (numbered) each choose one lettered choice; extra choices are distractors.
  function matchSection() {
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const choicesEl = h('div.choices-edit');
    const pairsEl = h('div.choices-edit');
    const render = () => {
      clear(choicesEl);
      draft.choices.forEach((c, i) => add(choicesEl, h('div.choice-row.match-row',
        h('span.choice-letter', ABC[i]),
        richArea(c.text, (v) => (c.text = v), 1, { 'aria-label': `Choice ${ABC[i]}` }),
        h('button.icon', {
          title: 'Remove choice',
          disabled: draft.choices.length <= 2,
          onclick: () => {
            draft.choices.splice(i, 1);
            draft.pairs.forEach((p) => { if (p.choiceId === c.id) p.choiceId = null; });
            markDirty();
            render();
          },
        }, '✕'))));
      clear(pairsEl);
      draft.pairs.forEach((p, i) => add(pairsEl, h('div.choice-row.pair-row',
        h('span.choice-letter', `${i + 1}.`),
        richArea(p.prompt, (v) => (p.prompt = v), 1, { 'aria-label': `Item ${i + 1}` }),
        select({ '': 'Answer…', ...Object.fromEntries(draft.choices.map((c, k) => [c.id, ABC[k]])) }, p.choiceId ?? '', {
          'aria-label': `Answer for item ${i + 1}`,
          onchange: (e) => { p.choiceId = e.target.value || null; markDirty(); },
        }),
        h('button.icon', {
          title: 'Remove item',
          disabled: draft.pairs.length <= 1,
          onclick: () => { draft.pairs.splice(i, 1); markDirty(); render(); },
        }, '✕'))));
    };
    render();
    return h('div.match-edit',
      h('span.field-label', 'Items to match (each picks a lettered choice)'),
      pairsEl,
      h('div.row', h('button', {
        onclick: () => {
          if (draft.pairs.length >= MAX_MATCH) return toast(`At most ${MAX_MATCH} items`);
          draft.pairs.push(newPair());
          markDirty();
          render();
        },
      }, '+ Add item')),
      h('span.field-label', 'Choices (extra ones act as distractors)'),
      choicesEl,
      h('div.row',
        h('button', {
          onclick: () => {
            if (draft.choices.length >= MAX_MATCH) return toast(`At most ${MAX_MATCH} choices`);
            draft.choices.push({ id: newId(), text: '' });
            markDirty();
            render();
          },
        }, '+ Add choice'),
        field('Columns', select({ 1: '1', 2: '2', 3: '3' }, draft.columns, { onchange: (e) => { draft.columns = Number(e.target.value); markDirty(); } }))),
    );
  }

  function numericSection() {
    const a = draft.answer;
    return h(
      'div',
      h(
        'div.row',
        field('Answer', h('input', { value: a.value, placeholder: 'e.g. 25, -4.9, [[= 0.5*m*v^2]]', onfocus: (e) => (lastField = e.target), oninput: (e) => { a.value = e.target.value; markDirty(); } })),
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

  // ---- narrative ---------------------------------------------------------------

  function narrativeField() {
    const owner = container.owner;
    const list = owner.narratives || [];
    return h('div.row',
      field('Narrative', select({ '': 'None', ...Object.fromEntries(list.map((n) => [n.id, n.title])) }, draft.narrativeId ?? '', {
        onchange: (e) => { draft.narrativeId = e.target.value || null; markDirty(); },
      }), list.length ? 'Shared passage printed before this question; its algorithm variables are available here.' : null),
      h('button', {
        title: 'Create a narrative and link this question to it',
        onclick: async () => {
          const before = new Set((owner.narratives || []).map((n) => n.id));
          await editNarrative(owner);
          const created = (owner.narratives || []).find((n) => !before.has(n.id));
          if (created) { draft.narrativeId = created.id; markDirty(); renderForm(); }
        },
      }, '+ New narrative'));
  }

  function insertBlock(text) {
    const target = lastField && form.contains(lastField) && lastField.tagName === 'TEXTAREA' ? lastField : form.querySelector('textarea');
    const before = target.value.slice(0, target.selectionStart ?? target.value.length);
    insertAtCursor(target, `${before && !before.endsWith('\n') ? '\n\n' : ''}${text}\n`);
  }

  function currentNarrative() {
    return narrativeOf(container.owner, draft);
  }

  // ---- algorithm ---------------------------------------------------------------

  function algorithmSection() {
    const source = h('textarea.algo-source', {
      rows: Math.max(4, draft.algorithm.split('\n').length + 1),
      value: draft.algorithm,
      spellcheck: false,
      placeholder: 'm = range(1, 5, 0.5)    # mass in kg\nv = rand(10)\nKE = 0.5*m*v^2 :: sig 3\ncondition: KE > 10',
      'aria-label': 'Algorithm definitions',
      oninput: (e) => { draft.algorithm = e.target.value; markDirty(); },
    });
    return h(
      'details.algo-edit',
      { open: Boolean(draft.algorithm.trim()) },
      h('summary', 'Algorithm (dynamic values)'),
      h('p.field-hint', 'One definition per line: ', h('code', 'name = expression'), ', optional ', h('code', ':: sig 3'), ' display format, ',
        h('code', 'f(x) = …'), ' functions, ', h('code', 'condition: …'), ' (values are redrawn until true), ', h('code', '# comment'), '.'),
      source,
      h('div.row', h('button', { onclick: () => { recalcCount++; updatePreview(); } }, '⟳ Recalculate'),
        h('span.field-hint', 'Click a name to insert it into the last text field you used.')),
      valuesEl,
      functionReference(),
    );
  }

  function renderValues(inst) {
    clear(valuesEl);
    const result = inst.run;
    if (result.error) {
      add(valuesEl, h('p.algo-error', `Line ${result.error.line ?? '?'}: ${result.error.message}`));
      return;
    }
    if (!result.program.vars.length) return;
    add(valuesEl, 
      h(
        'table.values-table',
        h('tbody', result.program.vars.map((v) => {
          let shown;
          try {
            const f = formatValue(result.values.get(v.name), result.formats.get(v.name));
            shown = f.text !== null ? h('span', f.text) : h('span', { html: renderMath(f.latex, false) });
          } catch (err) {
            shown = h('span.algo-error', err.message);
          }
          return h('tr',
            h('td', h('button.link', { title: `Insert [[${v.name}]]`, onclick: () => insertPlaceholder(v.name) }, v.name)),
            h('td', shown),
            h('td.muted', v.format ? `:: ${v.format.kind}${v.format.digits !== undefined ? ` ${v.format.digits}` : ''}` : ''));
        })),
      ),
    );
    if (result.attempts > 1) add(valuesEl, h('p.field-hint', `Conditions needed ${result.attempts} tries.`));
  }

  function insertPlaceholder(name) {
    const target = lastField && form.contains(lastField) ? lastField : form.querySelector('textarea');
    insertAtCursor(target, `[[${name}]]`);
  }

  function functionReference() {
    const groups = new Map();
    for (const f of Object.values(FUNCTIONS)) {
      if (!groups.has(f.cat)) groups.set(f.cat, []);
      groups.get(f.cat).push(f);
    }
    return h(
      'details.fn-ref',
      h('summary', 'Functions and formats'),
      h('p.field-hint', 'Operators: + − * / ^ (power), \\ (whole-number division), % or MOD, ! (factorial), = <> < <= > >=, & or AND, | or OR, NOT. Write 3*x, not 3x.'),
      h('p.field-hint', 'Formats after ::  general · dp N (up to N decimals) · fixed N · comma N · sci N · sig N (significant figures) · coef / coef1 (polynomial coefficients).'),
      h('p.field-hint', 'Constants: ', CONSTANT_DOCS.map(([k, v]) => `${k} = ${v}`).join(' · ')),
      [...groups].map(([cat, fns]) => h('div.fn-group', h('h4', cat), h('dl', fns.map((f) => [h('dt', h('code', f.sig)), h('dd', f.doc)])))),
    );
  }

  // A textarea that supports pasting/dropping images into the library.
  function richArea(value, set, rows, attrs = {}) {
    const ta = h('textarea', {
      rows,
      value,
      ...attrs,
      onfocus: (e) => (lastField = e.target),
      oninput: (e) => { set(e.target.value); markDirty(); },
      onpaste: (e) => {
        const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
        if (file) { e.preventDefault(); addImage(ta, file); return; }
        // Smart paste: a whole multiple-choice question pasted into an empty question field.
        if (attrs['data-stem'] && QUESTION_TYPES[draft.type].choices && !ta.value.trim()) {
          const split = splitPastedQuestion(e.clipboardData?.getData('text/plain') || '');
          if (!split) return;
          e.preventDefault();
          draft.stem = split.stem;
          draft.choices = split.choices.slice(0, MAX_CHOICES).map((c) => ({ ...newChoice(c.text), correct: c.correct }));
          if (draft.type === 'mc') {
            let seen = false;
            for (const c of draft.choices) { if (c.correct && !seen) seen = true; else c.correct = false; }
          }
          markDirty();
          renderForm();
          toast(`Split into the question and ${draft.choices.length} choices`);
        }
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
    const seed = previewSeed();
    const n = currentNarrative();
    const nctx = narrativeContext(n, n && container.narrativeSeed(n));
    add(clear(preview), 
      h('div.q-card-head', h('span.badge', typeLabel(draft)), h('span.muted', `${draft.points} pt${Number(draft.points) === 1 ? '' : 's'}`)),
      n ? narrativeCard(n, store.lib.images, container.narrativeSeed(n)) : null,
      ...questionBody(draft, store.lib.images, { seed, narrative: nctx }),
    );
    renderValues(instantiate(draft, { seed, narrative: nctx }));
    const problems = questionProblems(draft, seed, nctx);
    add(clear(problemsEl), ...problems.map((p) => h('li', p)));
  }

  function save(andNew, extra = null) {
    const n = currentNarrative();
    const problems = questionProblems(draft, container.seed(draft), narrativeContext(n, n && container.narrativeSeed(n)));
    if (problems.length && !confirm(`This question isn’t complete:\n\n• ${problems.join('\n• ')}\n\nSave anyway?`)) return;
    draft.modified = new Date().toISOString();
    container.save(draft);
    extra?.run(draft);
    dirty = false;
    toast(extra ? 'Saved to the test and the bank' : 'Question saved');
    location.hash = andNew ? container.newHref(draft.type) : container.backHref(draft.id);
  }

  function cancel() {
    location.hash = container.backHref(existing?.id);
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
