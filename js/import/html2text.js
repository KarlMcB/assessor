// Convert question HTML from QTI files (Schoology, Canvas, text2qti, assessor)
// into assessor's Markdown-and-LaTeX text. Formatting assessor can't express
// (fonts, colours, layout) is dropped; MathML becomes LaTeX.

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sinh', 'cosh', 'tanh', 'det']);
const MO = {
  '×': '\\times', '·': '\\cdot', '⋅': '\\cdot', '−': '-', '±': '\\pm', '∓': '\\mp', '≤': '\\le', '≥': '\\ge', '≠': '\\ne',
  '≈': '\\approx', '→': '\\to', '←': '\\leftarrow', '⇒': '\\Rightarrow', '∞': '\\infty', '∑': '\\sum', '∏': '\\prod',
  '∫': '\\int', '∂': '\\partial', '∇': '\\nabla', '÷': '\\div', '∝': '\\propto', '°': '^\\circ', '′': "'", '…': '\\ldots',
  '⁡': '', '⁢': '', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&',
};

const kids = (el) => [...el.childNodes].filter((n) => n.nodeType === 1);
const text = (el) => el.textContent.replace(/ /g, ' ');

export function mathmlToLatex(node) {
  const name = node.localName;
  const c = kids(node);
  const all = () => c.map(mathmlToLatex).join('');
  const arg = (i) => `{${c[i] ? mathmlToLatex(c[i]) : ''}}`;
  switch (name) {
    case 'semantics': {
      const tex = c.find((k) => k.localName === 'annotation' && /tex/i.test(k.getAttribute('encoding') || ''));
      return tex ? tex.textContent : c[0] ? mathmlToLatex(c[0]) : '';
    }
    case 'annotation':
    case 'annotation-xml':
    case 'mphantom':
      return '';
    case 'mi': {
      const t = text(node).trim();
      if (FUNCTIONS.has(t)) return `\\${t} `;
      if (t.length > 1) return `\\mathrm{${t}}`;
      return node.getAttribute('mathvariant') === 'normal' && /[A-Za-z]/.test(t) ? `\\mathrm{${t}}` : t;
    }
    case 'mn':
      return text(node).trim();
    case 'mo': {
      const t = text(node).trim();
      return MO[t] ?? t;
    }
    case 'mtext': {
      const t = text(node);
      if (!t.trim()) return '\\ ';
      return `\\text{${t.replace(/[\\{}]/g, '')}}`;
    }
    case 'mspace':
      return '\\ ';
    case 'mfrac':
      return `\\frac${arg(0)}${arg(1)}`;
    case 'msup':
      return `${arg(0)}^${arg(1)}`;
    case 'msub':
      return `${arg(0)}_${arg(1)}`;
    case 'msubsup':
      return `${arg(0)}_${arg(1)}^${arg(2)}`;
    case 'msqrt':
      return `\\sqrt{${all()}}`;
    case 'mroot':
      return `\\sqrt[${c[1] ? mathmlToLatex(c[1]) : ''}]${arg(0)}`;
    case 'mover': {
      const accent = c[1] ? text(c[1]).trim() : '';
      if (accent === '→' || accent === '⃗') return `\\vec${arg(0)}`;
      if (accent === '¯' || accent === '‾' || accent === '_') return `\\overline${arg(0)}`;
      if (accent === '^' || accent === 'ˆ') return `\\hat${arg(0)}`;
      if (accent === '˙' || accent === '.') return `\\dot${arg(0)}`;
      return `\\overset${arg(1)}${arg(0)}`;
    }
    case 'munder':
      return `\\underset${arg(1)}${arg(0)}`;
    case 'munderover':
      return `${arg(0)}_${arg(1)}^${arg(2)}`;
    case 'mfenced': {
      const open = node.getAttribute('open') ?? '(';
      const close = node.getAttribute('close') ?? ')';
      return `\\left${open === '{' ? '\\{' : open}${c.map(mathmlToLatex).join(',')}\\right${close === '}' ? '\\}' : close}`;
    }
    case 'mtable':
      return `\\begin{matrix}${c.map((row) => kids(row).map((cell) => kids(cell).map(mathmlToLatex).join('')).join(' & ')).join(' \\\\ ')}\\end{matrix}`;
    default:
      return all();
  }
}

// Turn LaTeX math into $…$ / $$…$$ text.
function mathText(tex, display) {
  const t = tex.trim();
  return display ? `\n\n$$${t}$$\n\n` : `$${t}$`;
}

const cleanAlt = (s) => String(s || '').replace(/[\[\]\n\r|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);

// Schoology stores typed math as \\( … \\) and \\[ … \\] in plain text.
function latexDelimiters(s) {
  return s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => `\n\n$$${tex.trim()}$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => `$${tex.trim()}$`);
}

// imageFor(src) -> assessor image reference: 'img:ID' or an http(s) URL, or null.
export function htmlToText(html, { imageFor = () => null } = {}) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = walk(doc.body, { imageFor, list: null });
  return latexDelimiters(out)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function walk(node, ctx) {
  let s = '';
  for (const n of node.childNodes) s += visit(n, ctx);
  return s;
}

function wrap(mark, inner) {
  const t = inner.trim();
  if (!t) return inner;
  const lead = inner.match(/^\s*/)[0] ? ' ' : '';
  const trail = inner.match(/\s*$/)[0] ? ' ' : '';
  return `${lead}${mark}${t}${mark}${trail}`;
}

function visit(n, ctx) {
  if (n.nodeType === 3) {
    return n.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\$/g, '\\$');
  }
  if (n.nodeType !== 1) return '';
  const tag = n.localName;
  switch (tag) {
    case 'script':
    case 'style':
      return '';
    case 'br':
      return '\n';
    case 'p':
    case 'div':
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
    case 'blockquote':
    case 'pre': {
      const inner = walk(n, ctx).trim();
      if (!inner) return '';
      return `\n\n${/^h\d$/.test(tag) ? `**${inner}**` : inner}\n\n`;
    }
    case 'strong':
    case 'b':
      return wrap('**', walk(n, ctx));
    case 'em':
    case 'i':
      return wrap('*', walk(n, ctx));
    case 'sup':
    case 'sub': {
      const inner = walk(n, ctx);
      const t = inner.trim();
      if (!t) return inner;
      const mark = tag === 'sup' ? '^' : '~';
      const out = /\s/.test(t) ? `$${tag === 'sup' ? '^' : '_'}{\\text{${t.replace(/[\\{}$]/g, '')}}}$` : `${mark}${t}${mark}`;
      return `${/^\s/.test(inner) ? ' ' : ''}${out}${/\s$/.test(inner) ? ' ' : ''}`;
    }
    case 'ul':
    case 'ol': {
      let k = 0;
      const items = [...n.children].filter((c) => c.localName === 'li')
        .map((li) => `${tag === 'ol' ? `${++k}.` : '-'} ${walk(li, ctx).replace(/\s*\n\s*/g, ' ').trim()}`);
      return `\n\n${items.join('\n')}\n\n`;
    }
    case 'table': {
      const rows = [...n.querySelectorAll('tr')].map((tr) =>
        [...tr.children].map((cell) => walk(cell, ctx).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim()));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r) => `| ${[...r, ...Array(width - r.length).fill('')].join(' | ')} |`;
      const hasHead = n.querySelector('thead, th');
      const lines = rows.map(line);
      if (hasHead) lines.splice(1, 0, `|${' --- |'.repeat(width)}`);
      return `\n\n${lines.join('\n')}\n\n`;
    }
    case 'math': {
      const display = n.getAttribute('display') === 'block';
      return mathText(mathmlToLatex(n), display);
    }
    case 'img': {
      // Canvas / text2qti equation images carry their LaTeX.
      const eq = n.getAttribute('data-equation-content');
      if (eq) return mathText(eq, false);
      const src = n.getAttribute('src') || '';
      const eqMatch = src.match(/equation_images\/([^?#]+)/);
      if (eqMatch) {
        try { return mathText(decodeURIComponent(decodeURIComponent(eqMatch[1])), false); } catch { /* fall through */ }
      }
      const ref = ctx.imageFor(src);
      if (!ref) return '';
      const width = parseInt(n.getAttribute('width') || (n.getAttribute('style') || '').match(/width:\s*(\d+)/)?.[1] || '', 10);
      return `![${cleanAlt(n.getAttribute('alt'))}](${ref}${width ? `|${width}` : ''})`;
    }
    case 'a': {
      const inner = walk(n, ctx);
      const href = n.getAttribute('href');
      return href && /^https?:/.test(href) && !inner.includes(href) ? `${inner} (${href})` : inner;
    }
    default:
      return walk(n, ctx);
  }
}

// Single-line version for answer choices.
export function htmlToInline(html, opts) {
  return htmlToText(html, opts).replace(/\s*\n+\s*/g, ' ').trim();
}
