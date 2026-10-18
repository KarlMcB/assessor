// Rich text: a small Markdown subset with LaTeX math, rendered to HTML.
//
//   **bold**  *italic*  ^superscript^  ~subscript~
//   - bullet / 1. numbered lists, | pipe | tables |
//   $inline math$  $$display math$$  \$ for a literal dollar sign
//   ![alt](img:ID) or ![alt](img:ID|300) for an image 300 px wide; ![alt](https://…) for a web image
//   [[name]] or [[= expression :: format]] algorithm value, also inside math
//
// Blank lines separate paragraphs; single newlines become line breaks.
// `resolve(content)` turns a placeholder into { latex, text } or { error };
// without it, placeholders show as chips.

import katex from '../vendor/katex/katex.mjs';

const OPEN = '\u0001';
const CLOSE = '\u0002';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function renderMath(tex, displayMode, mathml = false) {
  if (mathml) return mathmlOnly(tex, displayMode);
  return katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
}

// Plain presentation MathML (no KaTeX wrapper or LaTeX annotation), for export.
export function mathmlOnly(tex, displayMode) {
  const html = katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', output: 'mathml' });
  const m = html.match(/<math[\s\S]*<\/math>/);
  if (!m) return escapeHtml(tex);
  return m[0]
    .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
    .replace(/<\/?semantics>/g, '');
}

// Replace placeholders inside a LaTeX formula with their LaTeX values.
function substituteMath(tex, resolve) {
  return tex.replace(/\[\[(.+?)\]\]/g, (_, content) => {
    if (!resolve) return `\\boxed{\\texttt{${content.replace(/[\\{}$&#^_%~]/g, '')}}}`;
    const r = resolve(content);
    return r.error ? '\\color{red}{\\text{??}}' : `{${r.latex}}`;
  });
}

function placeholderHtml(content, resolve, mathml) {
  if (!resolve) return `<span class="var-chip" title="Algorithm value">${escapeHtml(content.trim())}</span>`;
  const r = resolve(content);
  if (r.error) return `<span class="var-error" title="${escapeHtml(r.error)}">[[${escapeHtml(content)}]]</span>`;
  return r.text !== null ? escapeHtml(r.text) : renderMath(r.latex, false, mathml);
}

// Pull math and placeholders out first so Markdown rules never touch them.
function protect(src, slots, resolve, mathml) {
  const keep = (html) => `${OPEN}${slots.push(html) - 1}${CLOSE}`;
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('\\$', i)) {
      out += keep('$');
      i += 2;
    } else if (src.startsWith('$$', i)) {
      const end = src.indexOf('$$', i + 2);
      if (end === -1) { out += src.slice(i); break; }
      const display = renderMath(substituteMath(src.slice(i + 2, end), resolve), true, mathml);
      out += keep(mathml ? display : `<div class="math-display">${display}</div>`);
      i = end + 2;
    } else if (src[i] === '$') {
      const end = findInlineEnd(src, i + 1);
      if (end === -1) { out += '$'; i += 1; continue; }
      out += keep(renderMath(substituteMath(src.slice(i + 1, end), resolve), false, mathml));
      i = end + 1;
    } else if (src.startsWith('[[', i)) {
      const end = src.indexOf(']]', i + 2);
      const content = end === -1 ? '' : src.slice(i + 2, end);
      if (!content.trim() || content.includes('\n')) { out += '[['; i += 2; continue; }
      out += keep(placeholderHtml(content, resolve, mathml));
      i = end + 2;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

// Closing $ on the same paragraph, skipping escaped \$.
function findInlineEnd(src, from) {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\' && src[j + 1] === '$') { j++; continue; }
    if (src[j] === '$') return j > from ? j : -1;
    if (src[j] === '\n' && src[j + 1] === '\n') return -1;
  }
  return -1;
}

function restore(html, slots) {
  return html.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g'), (_, n) => slots[Number(n)]);
}

function inline(text, images) {
  return text
    .replace(/!\[([^\]]*)\]\(img:([a-z0-9]+)(?:\|(\d+))?\)/g, (_, alt, id, width) => {
      const src = typeof images === 'function' ? images(id) : images?.[id];
      if (!src) return `<span class="missing-image">[missing image]</span>`;
      const style = width ? ` style="width:${Number(width)}px"` : '';
      return `<img class="q-image" src="${src}" alt="${alt}"${style}>`;
    })
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s|)]+)(?:\|(\d+))?\)/g, (_, alt, url, width) => {
      const style = width ? ` style="width:${Number(width)}px"` : '';
      return `<img class="q-image" src="${url}" alt="${alt}"${style}>`;
    })
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)(.+?)\*/g, '<em>$1</em>')
    .replace(/\^(?=\S)([^^\s]+?)\^/g, '<sup>$1</sup>')
    .replace(/~(?=\S)([^~\s]+?)~/g, '<sub>$1</sub>');
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function renderTable(lines, images) {
  const rows = lines.map(splitRow);
  const sepIdx = rows.findIndex((r) => r.every((c) => /^:?-{2,}:?$/.test(c)));
  const head = sepIdx === 1 ? rows[0] : null;
  const body = sepIdx === 1 ? rows.slice(2) : rows.filter((_, i) => i !== sepIdx);
  const cells = (r, tag) => r.map((c) => `<${tag}>${inline(c, images)}</${tag}>`).join('');
  return (
    '<table class="q-table">' +
    (head ? `<thead><tr>${cells(head, 'th')}</tr></thead>` : '') +
    `<tbody>${body.map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`
  );
}

function blocks(text, images) {
  const out = [];
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split('\n').filter((l, i, all) => l.trim() || all.length === 1);
    if (!lines.length || !para.trim()) continue;
    if (lines.every((l) => l.trim().startsWith('|'))) {
      out.push(renderTable(lines, images));
    } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''), images)}</li>`).join('')}</ul>`);
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''), images)}</li>`).join('')}</ol>`);
    } else {
      out.push(`<p>${lines.map((l) => inline(l, images)).join('<br>')}</p>`);
    }
  }
  return out.join('');
}

// `images` is a map of id -> data URL, or a function id -> URL.
// opts.mathml renders math as plain MathML (for Schoology export).
export function renderRich(src, images = {}, resolve = null, opts = {}) {
  if (!src) return '';
  const slots = [];
  const protectedText = protect(String(src).replace(/\r\n?/g, '\n'), slots, resolve, Boolean(opts.mathml));
  return restore(blocks(escapeHtml(protectedText), images), slots);
}

// For one-line contexts such as answer choices: no paragraph wrapper.
export function renderInline(src, images = {}, resolve = null, opts = {}) {
  const html = renderRich(src, images, resolve, opts);
  const m = html.match(/^<p>([\s\S]*)<\/p>$/);
  return m && !m[1].includes('<p>') ? m[1] : html;
}
