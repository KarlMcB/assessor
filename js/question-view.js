// Read-only rendering of a question with its answer, used by the bank view
// and the editor preview.

import { ESSAY_KINDS, QUESTION_TYPES, parseNumber } from './model.js';
import { renderInline, renderRich, escapeHtml } from './richtext.js';
import { h } from './ui.js';

const LETTERS = 'ABCDEFGH';

export function questionBody(q, images, { showAnswer = true, showRationale = true } = {}) {
  const parts = [h('div.q-stem', { html: renderRich(q.stem, images) || '<p class="placeholder">No question text yet</p>' })];

  if (q.type === 'mc' || q.type === 'mr') {
    const cols = Math.max(1, Number(q.columns) || 1);
    parts.push(
      h(
        'ol.q-choices',
        { style: `--cols:${cols}` },
        q.choices.map((c, i) =>
          h(
            'li',
            { class: showAnswer && c.correct ? 'correct' : '' },
            h('span.choice-letter', `${LETTERS[i]}.`),
            h('span.choice-text', { html: renderInline(c.text, images) || '<span class="placeholder">empty</span>' }),
            c.lockPosition ? h('span.lock', { title: 'Stays in place when choices are scrambled' }, '🔒') : null,
          ),
        ),
      ),
    );
  }

  if (showAnswer) {
    const answer = answerText(q, images);
    if (answer) parts.push(h('div.q-answer', h('span.label', 'Answer: '), h('span', { html: answer })));
  }
  if (showRationale && q.rationale?.trim()) {
    parts.push(h('div.q-rationale', h('span.label', 'Rationale: '), h('div', { html: renderRich(q.rationale, images) })));
  }
  return parts;
}

export function answerText(q, images) {
  switch (q.type) {
    case 'tf':
      return q.answer ? 'True' : 'False';
    case 'mc':
    case 'mr': {
      const letters = q.choices.map((c, i) => (c.correct ? LETTERS[i] : null)).filter(Boolean);
      return letters.length ? letters.join(', ') : '<span class="warn">none marked</span>';
    }
    case 'num': {
      const a = q.answer;
      if (!String(a.value).trim()) return '<span class="warn">no answer</span>';
      let s = escapeHtml(a.value) + (a.unit ? ` ${escapeHtml(a.unit)}` : '');
      const tol = String(a.tolerance).trim();
      if (tol) s += a.toleranceType === 'pct' ? ` ± ${escapeHtml(tol)}%` : ` ± ${escapeHtml(tol)}`;
      if (Number.isNaN(parseNumber(a.value))) s += ' <span class="warn">(not a number)</span>';
      return s;
    }
    case 'essay':
      return q.answer.model?.trim() ? renderInline(q.answer.model, images) : '';
    default:
      return '';
  }
}

export function typeLabel(q) {
  if (q.type === 'essay') return ESSAY_KINDS[q.kind] || 'Short Answer';
  return QUESTION_TYPES[q.type].label;
}

export function metaChips(q) {
  const m = q.meta;
  const chips = [];
  if (m.difficulty) chips.push(['Difficulty', m.difficulty]);
  if (m.topic) chips.push(['Topic', m.topic]);
  if (m.reference) chips.push(['Ref', m.reference]);
  for (const s of m.standards) chips.push(['Std', s]);
  for (const o of m.objectives) chips.push(['Obj', o]);
  for (const k of m.keywords) chips.push(['Key', k]);
  return chips.map(([k, v]) => h('span.chip', h('span.chip-key', k), v));
}
