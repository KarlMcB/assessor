// HTML for printed pages: question blocks, section headings, answer keys,
// answer strips and version maps. Everything returns HTML strings that the
// paginator measures and places.

import { ESSAY_KINDS, QUESTION_TYPES } from '../model.js';
import { renderInline, renderRich, escapeHtml } from '../richtext.js';
import { instantiate } from '../algo/engine.js';
import { choiceKey, choiceLabel, fillTokens } from './layout.js';

const OBJECTIVE = new Set(['tf', 'mc', 'mr']);

function inst(entry, version) {
  const i = instantiate(entry.question, { seed: entry.seed, version });
  return { i, resolve: i.dynamic ? i.resolve : null };
}

const pointsText = (p) => `${p} point${Number(p) === 1 ? '' : 's'}`;

export function sectionTitle(section) {
  if (!section.type) return '';
  if (section.type === 'essay') {
    const kinds = new Set(section.items.map((e) => e.question.kind));
    return kinds.size === 1 ? `${ESSAY_KINDS[[...kinds][0]]}` : 'Short Answer, Problem and Essay';
  }
  return QUESTION_TYPES[section.type].label;
}

export function sectionHeading(section, layout) {
  if (!section.type) return '';
  const instr = layout.showInstructions ? layout.instructions[section.type] : '';
  return `<div class="ps-head${layout.sectionRule ? ' ruled' : ''}"><div class="ps-title">${escapeHtml(sectionTitle(section))}</div>${
    instr ? `<div class="ps-inst">${renderInline(instr)}</div>` : ''}</div>`;
}

export function questionBlock(entry, ctx) {
  const { layout, images, version, columns } = ctx;
  const q = entry.question;
  const { resolve } = inst(entry, version);
  const blank = layout.answerBlanks && OBJECTIVE.has(q.type) ? '<span class="pq-blank"></span>' : '';
  const pts = layout.points === 'inline' ? `<span class="pq-pts">(${pointsText(q.points)})</span> ` : '';
  let body = '';
  if (layout.points === 'line') body += `<div class="pq-pts-line">(${pointsText(q.points)})</div>`;
  const stem = renderRich(q.stem, images, resolve) || '<p></p>';
  body += `<div class="pq-stem">${pts ? stem.replace(/^<p>/, `<p>${pts}`) : stem}</div>`;

  const maxCols = columns === 2 ? 2 : 4;
  if (q.type === 'mc' || q.type === 'mr') {
    const cols = Math.min(maxCols, Math.max(1, Number(q.columns) || 1));
    body += `<ol class="pq-choices" style="--cols:${cols}">${q.choices
      .map((c, i) => `<li><span class="pq-label">${choiceLabel(i, entry.number, layout)}</span><span class="pq-choice">${renderInline(c.text, images, resolve)}</span></li>`)
      .join('')}</ol>`;
  } else if (q.type === 'tf' && layout.tfAsChoices) {
    body += `<ol class="pq-choices" style="--cols:2">${['True', 'False']
      .map((t, i) => `<li><span class="pq-label">${choiceLabel(i, entry.number, layout)}</span><span class="pq-choice">${t}</span></li>`).join('')}</ol>`;
  } else if (q.type === 'num') {
    body += '<div class="pq-answer-line">Answer: <span class="pq-write"></span></div>';
  } else if (q.type === 'essay') {
    const lines = Math.max(0, Number(q.answerLines) || 0);
    if (lines) body += layout.essayLines ? `<div class="pq-lines">${'<div class="pq-ruled"></div>'.repeat(lines)}</div>` : `<div class="pq-space" style="height:${lines * 0.36}in"></div>`;
  }
  return `<div class="pq"><div class="pq-num">${blank}<span>${entry.number}.</span></div><div class="pq-body">${body}</div></div>`;
}

// Whether a question must span both columns in a two-column layout.
export function forcedWide(q) {
  return Boolean(q.flags?.alwaysOneColumn) || /^\s*\|/m.test(q.stem);
}

// ---- answer keys -------------------------------------------------------------------

export function answerText(entry, layout, version, images) {
  const q = entry.question;
  const { i, resolve } = inst(entry, version);
  switch (q.type) {
    case 'tf':
      return layout.tfAsChoices ? choiceKey(q.answer ? 0 : 1, entry.number, layout) : q.answer ? 'T' : 'F';
    case 'mc':
    case 'mr': {
      const keys = q.choices.map((c, k) => (c.correct ? choiceKey(k, entry.number, layout) : null)).filter(Boolean);
      return keys.length ? keys.join(', ') : '?';
    }
    case 'num': {
      const a = q.answer;
      let s = escapeHtml(i.plain(a.value)) + (a.unit ? ` ${escapeHtml(a.unit)}` : '');
      const tol = String(a.tolerance ?? '').trim();
      if (tol) s += a.toleranceType === 'pct' ? ` ± ${escapeHtml(tol)}%` : ` ± ${escapeHtml(tol)}`;
      return s;
    }
    case 'essay':
      return q.answer.model?.trim() ? renderInline(q.answer.model, images, resolve) : '<i>Answers will vary.</i>';
  }
  return '';
}

export function keyEntry(entry, ctx) {
  const { layout, images, version } = ctx;
  const q = entry.question;
  const { resolve } = inst(entry, version);
  const k = layout.key;
  const meta = [];
  if (k.points) meta.push(`PTS: ${q.points}`);
  if (k.difficulty && q.meta.difficulty) meta.push(`DIF: ${escapeHtml(q.meta.difficulty)}`);
  if (k.reference && q.meta.reference) meta.push(`REF: ${escapeHtml(q.meta.reference)}`);
  if (k.topic && q.meta.topic) meta.push(`TOP: ${escapeHtml(q.meta.topic)}`);
  if (k.standards && q.meta.standards.length) meta.push(`STA: ${escapeHtml(q.meta.standards.join(', '))}`);
  if (k.objectives && q.meta.objectives.length) meta.push(`OBJ: ${escapeHtml(q.meta.objectives.join(', '))}`);
  if (k.keywords && q.meta.keywords.length) meta.push(`KEY: ${escapeHtml(q.meta.keywords.join(', '))}`);
  const rationale = k.rationale && q.rationale?.trim() ? `<div class="pk-rat">${renderRich(q.rationale, images, resolve)}</div>` : '';
  return `<div class="pk"><div class="pk-num">${entry.number}.</div><div class="pk-body"><div class="pk-ans"><span class="pk-label">ANS:</span> ${answerText(entry, layout, version, images)}</div>${rationale}${
    meta.length ? `<div class="pk-meta">${meta.join(' &nbsp;|&nbsp; ')}</div>` : ''}</div></div>`;
}

export function keySectionHeading(section) {
  return section.type ? `<div class="pk-section">${escapeHtml(sectionTitle(section))}</div>` : '';
}

// ---- answer strip and version map ----------------------------------------------------

export function stripLine(entry, layout, version, images) {
  const ans = entry.question.type === 'essay' ? '—' : answerText(entry, layout, version, images);
  return `<div class="strip-line"><span class="strip-num">${entry.number}.</span><span class="strip-ans">${ans}</span></div>`;
}

export function versionMapTable(rows, letters) {
  const head = `<tr><th>Question</th>${letters.map((l) => `<th>${l}</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => `<tr><td>${r.base}</td>${letters.map((l) => `<td>${r.numbers[l] ?? ''}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="vmap"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function headerHtml(text, values) {
  const filled = fillTokens(text, values);
  return filled.trim() ? renderInline(filled) : '';
}
