// Rich text: a small Markdown subset with LaTeX math, rendered to HTML.
//
//   **bold**  *italic*  ^superscript^  ~subscript~
//   - bullet / 1. numbered lists, | pipe | tables |
//   $inline math$  $$display math$$  \$ for a literal dollar sign
//   ![alt](img:ID) or ![alt](img:ID|300) for an image 300 px wide
//   [[name]] algorithm variable (shown as a placeholder until M2)
//
// Blank lines separate paragraphs; single newlines become line breaks.

import katex from '../vendor/katex/katex.mjs';

const OPEN = '\u0001';
const CLOSE = '\u0002';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function renderMath(tex, displayMode) {
  return katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
}

// Pull math and variables out first so Markdown rules never touch them.
function protect(src, slots) {
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
      out += keep(`<div class="math-display">${renderMath(src.slice(i + 2, end), true)}</div>`);
      i = end + 2;
    } else if (src[i] === '$') {
      const end = findInlineEnd(src, i + 1);
      if (end === -1) { out += '$'; i += 1; continue; }
      out += keep(renderMath(src.slice(i + 1, end), false));
      i = end + 1;
    } else if (src.startsWith('[[', i)) {
      const end = src.indexOf(']]', i + 2);
      const name = end === -1 ? '' : src.slice(i + 2, end).trim();
      if (!name || /[\n[\]]/.test(name)) { out += '[['; i += 2; continue; }
      out += keep(`<span class="var-chip" title="Algorithm variable">${escapeHtml(name)}</span>`);
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
      const src = images?.[id];
      if (!src) return `<span class="missing-image">[missing image]</span>`;
      const style = width ? ` style="width:${Number(width)}px"` : '';
      return `<img class="q-image" src="${src}" alt="${alt}"${style}>`;
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

export function renderRich(src, images = {}) {
  if (!src) return '';
  const slots = [];
  const protectedText = protect(String(src).replace(/\r\n?/g, '\n'), slots);
  return restore(blocks(escapeHtml(protectedText), images), slots);
}

// For one-line contexts such as answer choices: no paragraph wrapper.
export function renderInline(src, images = {}) {
  const html = renderRich(src, images);
  const m = html.match(/^<p>([\s\S]*)<\/p>$/);
  return m && !m[1].includes('<p>') ? m[1] : html;
}
