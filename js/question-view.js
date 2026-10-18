// Read-only rendering of a question with its answer, used by the bank view
// and the editor preview. Algorithm values are filled in for the given seed.

import { ESSAY_KINDS, QUESTION_TYPES, parseNumber, validateQuestion } from './model.js';
import { renderInline, renderRich, escapeHtml } from './richtext.js';
import { instantiate, algorithmProblems, narrativeRun, resolvePlaceholder } from './algo/engine.js';
import { h } from './ui.js';

const LETTERS = 'ABCDEFGH';

// narrative: { algorithm, seed } for shared variables (see narrativeContext).
export function questionBody(q, images, { showAnswer = true, showRationale = true, seed, version, narrative = null } = {}) {
  const inst = instantiate(q, { seed: seed ?? q.id, version, narrative });
  const resolve = inst.dynamic ? inst.resolve : null;
  const parts = [h('div.q-stem', { html: renderRich(q.stem, images, resolve) || '<p class="placeholder">No question text yet</p>' })];

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
            h('span.choice-text', { html: renderInline(c.text, images, resolve) || '<span class="placeholder">empty</span>' }),
            c.lockPosition ? h('span.lock', { title: 'Stays in place when choices are scrambled' }, '🔒') : null,
          ),
        ),
      ),
    );
  }

  if (q.type === 'match') parts.push(matchBody(q, images, resolve, showAnswer));

  if (showAnswer) {
    const answer = answerText(q, images, inst);
    if (answer) parts.push(h('div.q-answer', h('span.label', 'Answer: '), h('span', { html: answer })));
  }
  if (showRationale && q.rationale?.trim()) {
    parts.push(h('div.q-rationale', h('span.label', 'Rationale: '), h('div', { html: renderRich(q.rationale, images, resolve) })));
  }
  return parts;
}

export function answerText(q, images, inst = instantiate(q)) {
  switch (q.type) {
    case 'tf':
      return q.answer ? 'True' : 'False';
    case 'mc':
    case 'mr': {
      const letters = q.choices.map((c, i) => (c.correct ? LETTERS[i] : null)).filter(Boolean);
      return letters.length ? letters.join(', ') : '<span class="warn">none marked</span>';
    }
    case 'match':
      return q.pairs.map((p, i) => `${i + 1}–${matchLetter(q, p)}`).join(', ');
    case 'num': {
      const a = q.answer;
      if (!String(a.value).trim()) return '<span class="warn">no answer</span>';
      const value = inst.plain(a.value);
      let s = escapeHtml(value) + (a.unit ? ` ${escapeHtml(a.unit)}` : '');
      const tol = String(a.tolerance).trim();
      if (tol) s += a.toleranceType === 'pct' ? ` ± ${escapeHtml(tol)}%` : ` ± ${escapeHtml(tol)}`;
      if (Number.isNaN(parseNumber(value))) s += ' <span class="warn">(not a number)</span>';
      return s;
    }
    case 'essay':
      return q.answer.model?.trim() ? renderInline(q.answer.model, images, inst.dynamic ? inst.resolve : null) : '';
    default:
      return '';
  }
}

export const matchLetter = (q, pair) => {
  const i = q.choices.findIndex((c) => c.id === pair.choiceId);
  return i === -1 ? '?' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i];
};

function matchBody(q, images, resolve, showAnswer) {
  return h(
    'div.q-match',
    h('ol.match-prompts', q.pairs.map((p) =>
      h('li', h('span.match-blank', showAnswer ? matchLetter(q, p) : ''), h('span', { html: renderInline(p.prompt, images, resolve) || '<span class="placeholder">empty</span>' })))),
    h('ol.q-choices.match-choices', { style: `--cols:${Math.max(1, Number(q.columns) || 1)}` }, q.choices.map((c, i) =>
      h('li', h('span.choice-letter', `${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]}.`), h('span.choice-text', { html: renderInline(c.text, images, resolve) || '<span class="placeholder">empty</span>' })))),
  );
}

// The narrative and seed a question's values depend on.
export function narrativeContext(narrative, seed) {
  return narrative ? { algorithm: narrative.algorithm || '', seed } : null;
}

// A narrative's text with its own algorithm values filled in.
export function narrativeBody(narrative, images, { seed = narrative.id, version = 'A' } = {}) {
  const r = narrativeRun({ algorithm: narrative.algorithm || '', seed }, version);
  const resolve = narrative.algorithm?.trim() || /\[\[/.test(narrative.body) ? Object.assign((c) => resolvePlaceholder(r, c), { run: r }) : null;
  return renderRich(narrative.body, images, resolve) || '<p class="placeholder">Empty narrative</p>';
}

// Validation plus algorithm problems.
export function questionProblems(q, seed, narrative = null) {
  const inst = instantiate(q, { seed: seed ?? q.id, narrative });
  return [...validateQuestion(q, inst.plain), ...(inst.dynamic ? algorithmProblems(q, inst) : [])];
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
