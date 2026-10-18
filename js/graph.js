// Graphs inside question text, written as fenced blocks and drawn as SVG.
//
//   ```graph                          ```numberline
//   x: -10 to 10 step 1               range: -5 to 5 step 1
//   y: -10 to 10 step 2               point 2 closed "A"
//   size: 3 x 3          (inches)     segment -1 to 3 closed open
//   grid: on                          ray 2 right open
//   labels: t (s), v (m/s)            ```
//   f(x) = v0 + a*x ; domain 0 to 5 ; dashed ; color red
//   y <= x^2 - 4                      (shades the region)
//   point (2, 3) "A" ; open
//   segment (0, 0) to (3, 4)
//   text (1, 2) "label"
//   ```
//
// Every number can be an expression using the question's algorithm variables.

import { parseExpression } from './algo/parse.js';
import { evaluateTree, run } from './algo/engine.js';

const COLORS = { black: '#111', blue: '#1f5fbf', red: '#c0392b', green: '#1e8449', orange: '#d35400', purple: '#7d3c98', gray: '#777', grey: '#777' };
const PX = 96;
const emptyRun = run('');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Split "a ; b ; c" outside quotes.
function parts(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

const quoted = (s) => s.match(/"([^"]*)"/)?.[1] ?? null;

function makeEval(runResult) {
  const r = runResult && !runResult.error ? runResult : emptyRun;
  return (text, locals) => {
    const v = evaluateTree(r, parseExpression(String(text)), locals);
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`“${text}” isn’t a number`);
    return v;
  };
}

function range(spec, ev) {
  const m = spec.match(/^(.+?)\s+to\s+(.+?)(?:\s+step\s+(.+))?$/i);
  if (!m) throw new Error(`Expected “a to b step s”, got “${spec}”`);
  const lo = ev(m[1]);
  const hi = ev(m[2]);
  const step = m[3] ? ev(m[3]) : niceStep(hi - lo);
  if (!(hi > lo)) throw new Error('The range must go from low to high');
  if (!(step > 0)) throw new Error('The step must be more than zero');
  return { lo, hi, step };
}

function niceStep(span) {
  const raw = span / 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? p * 10;
}

const fmt = (v) => String(Number(v.toPrecision(10)));
const point = (s, ev) => {
  const m = s.match(/^\(\s*(.+?)\s*,\s*(.+?)\s*\)$/);
  if (!m) throw new Error(`Expected a point like (2, 3), got “${s}”`);
  return [ev(m[1]), ev(m[2])];
};

function styleOf(opts) {
  const color = COLORS[opts.find((o) => o.startsWith('color'))?.split(/\s+/)[1]] ?? COLORS.blue;
  const dashed = opts.includes('dashed');
  return { color, dashed };
}

// ---- Cartesian graphs ---------------------------------------------------------------

export function cartesianSvg(source, runResult) {
  const ev = makeEval(runResult);
  const cfg = { x: { lo: -10, hi: 10, step: 1 }, y: { lo: -10, hi: 10, step: 1 }, w: 3, h: 3, grid: true, labels: ['x', 'y'] };
  const items = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = line.match(/^x\s*:\s*(.+)$/i))) cfg.x = range(m[1], ev);
    else if ((m = line.match(/^y\s*:\s*(.+)$/i))) cfg.y = range(m[1], ev);
    else if ((m = line.match(/^size\s*:\s*(.+?)\s*x\s*(.+)$/i))) { cfg.w = ev(m[1]); cfg.h = ev(m[2]); }
    else if ((m = line.match(/^grid\s*:\s*(\w+)/i))) cfg.grid = !/off|no|false/i.test(m[1]);
    else if ((m = line.match(/^labels\s*:\s*(.+)$/i))) cfg.labels = m[1].split(',').map((s) => s.trim());
    else items.push(line);
  }
  const W = cfg.w * PX;
  const H = cfg.h * PX;
  const pad = { l: 30, r: 14, t: 14, b: 26 };
  const sx = (x) => pad.l + ((x - cfg.x.lo) / (cfg.x.hi - cfg.x.lo)) * (W - pad.l - pad.r);
  const sy = (y) => H - pad.b - ((y - cfg.y.lo) / (cfg.y.hi - cfg.y.lo)) * (H - pad.t - pad.b);
  const out = [];
  const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
  out.push(`<defs><clipPath id="${clipId}"><rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/></clipPath></defs>`);

  // Grid, axes, ticks
  const ticks = (r) => {
    const list = [];
    const start = Math.ceil(r.lo / r.step - 1e-9) * r.step;
    for (let v = start; v <= r.hi + 1e-9 && list.length < 400; v += r.step) list.push(Number(v.toPrecision(12)));
    return list;
  };
  const xt = ticks(cfg.x);
  const yt = ticks(cfg.y);
  const every = (n) => Math.max(1, Math.ceil(n / 10));
  if (cfg.grid) {
    for (const x of xt) out.push(`<line x1="${sx(x)}" y1="${pad.t}" x2="${sx(x)}" y2="${H - pad.b}" stroke="#ccc" stroke-width="0.6"/>`);
    for (const y of yt) out.push(`<line x1="${pad.l}" y1="${sy(y)}" x2="${W - pad.r}" y2="${sy(y)}" stroke="#ccc" stroke-width="0.6"/>`);
  }
  const ax = cfg.y.lo <= 0 && cfg.y.hi >= 0 ? sy(0) : H - pad.b;
  const ay = cfg.x.lo <= 0 && cfg.x.hi >= 0 ? sx(0) : pad.l;
  out.push(`<line x1="${pad.l}" y1="${ax}" x2="${W - pad.r}" y2="${ax}" stroke="#000" stroke-width="1.2"/>`);
  out.push(`<line x1="${ay}" y1="${pad.t}" x2="${ay}" y2="${H - pad.b}" stroke="#000" stroke-width="1.2"/>`);
  const fx = every(xt.length);
  xt.forEach((x, i) => {
    if (i % fx || (Math.abs(x) < 1e-12 && ay !== pad.l)) return;
    out.push(`<text x="${sx(x)}" y="${Math.min(H - 6, ax + 13)}" font-size="10" text-anchor="middle">${fmt(x)}</text>`);
  });
  const fy = every(yt.length);
  yt.forEach((y, i) => {
    if (i % fy || (Math.abs(y) < 1e-12 && ax !== H - pad.b)) return;
    out.push(`<text x="${Math.max(10, ay - 4)}" y="${sy(y) + 3.5}" font-size="10" text-anchor="end">${fmt(y)}</text>`);
  });
  out.push(`<text x="${W - pad.r}" y="${ax - 5}" font-size="11" font-style="italic" text-anchor="end">${esc(cfg.labels[0] ?? '')}</text>`);
  out.push(`<text x="${ay + 5}" y="${pad.t + 9}" font-size="11" font-style="italic">${esc(cfg.labels[1] ?? '')}</text>`);

  // Items
  const g = [];
  for (const line of items) {
    const [head, ...opts] = parts(line);
    const { color, dashed } = styleOf(opts);
    const dash = dashed ? ' stroke-dasharray="5 4"' : '';
    let m;
    if ((m = head.match(/^(?:f\(x\)|y)\s*(=|<=|>=|<|>)\s*(.+)$/i))) {
      const rel = m[1];
      const tree = parseExpression(m[2]);
      const dom = opts.find((o) => /^domain/i.test(o));
      let [d0, d1] = [cfg.x.lo, cfg.x.hi];
      if (dom) {
        const r = dom.replace(/^domain\s*/i, '').match(/^(.+?)\s+to\s+(.+)$/i);
        if (r) [d0, d1] = [Math.max(d0, ev(r[1])), Math.min(d1, ev(r[2]))];
      }
      const r = runResult && !runResult.error ? runResult : emptyRun;
      const pts = [];
      const N = 400;
      for (let i = 0; i <= N; i++) {
        const x = d0 + ((d1 - d0) * i) / N;
        let y;
        try { y = evaluateTree(r, tree, new Map([['x', x]])); } catch { y = NaN; }
        pts.push([x, typeof y === 'number' && Number.isFinite(y) ? y : NaN]);
      }
      const span = cfg.y.hi - cfg.y.lo;
      let d = '';
      let pen = false;
      pts.forEach(([x, y], i) => {
        const prev = pts[i - 1];
        if (Number.isNaN(y) || (prev && !Number.isNaN(prev[1]) && Math.abs(y - prev[1]) > span * 3)) { pen = false; if (Number.isNaN(y)) return; }
        d += `${pen ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(Math.max(cfg.y.lo - span, Math.min(cfg.y.hi + span, y))).toFixed(2)}`;
        pen = true;
      });
      if (rel !== '=') {
        const edge = rel.startsWith('<') ? cfg.y.lo - span : cfg.y.hi + span;
        const valid = pts.filter(([, y]) => !Number.isNaN(y));
        if (valid.length) {
          const poly = valid.map(([x, y]) => `${sx(x).toFixed(2)},${sy(Math.max(cfg.y.lo - span, Math.min(cfg.y.hi + span, y))).toFixed(2)}`);
          poly.push(`${sx(valid.at(-1)[0])},${sy(edge)}`, `${sx(valid[0][0])},${sy(edge)}`);
          g.push(`<polygon points="${poly.join(' ')}" fill="${color}" fill-opacity="0.18" stroke="none"/>`);
        }
      }
      const strictDash = rel === '<' || rel === '>' ? ' stroke-dasharray="5 4"' : dash;
      g.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"${strictDash}/>`);
    } else if ((m = head.match(/^point\s+(\(.+?\))\s*(".*")?$/i))) {
      const [x, y] = point(m[1], ev);
      const open = opts.includes('open');
      g.push(`<circle cx="${sx(x)}" cy="${sy(y)}" r="3.6" fill="${open ? '#fff' : color}" stroke="${color}" stroke-width="1.5"/>`);
      if (m[2]) g.push(`<text x="${sx(x) + 6}" y="${sy(y) - 6}" font-size="11">${esc(quoted(m[2]))}</text>`);
    } else if ((m = head.match(/^segment\s+(\(.+?\))\s+to\s+(\(.+?\))$/i))) {
      const [x1, y1] = point(m[1], ev);
      const [x2, y2] = point(m[2], ev);
      g.push(`<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(y2)}" stroke="${color}" stroke-width="1.8"${dash}/>`);
    } else if ((m = head.match(/^text\s+(\(.+?\))\s+(".*")$/i))) {
      const [x, y] = point(m[1], ev);
      g.push(`<text x="${sx(x)}" y="${sy(y)}" font-size="11" text-anchor="middle">${esc(quoted(m[2]))}</text>`);
    } else {
      throw new Error(`Don’t know how to draw “${head}”`);
    }
  }
  out.push(`<g clip-path="url(#${clipId})">${g.join('')}</g>`);
  return svgWrap(W, H, out.join(''));
}

// ---- number lines ---------------------------------------------------------------------

export function numberLineSvg(source, runResult) {
  const ev = makeEval(runResult);
  let r = { lo: -5, hi: 5, step: 1 };
  let width = 5;
  const items = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = line.match(/^range\s*:\s*(.+)$/i))) r = range(m[1], ev);
    else if ((m = line.match(/^width\s*:\s*(.+)$/i))) width = ev(m[1]);
    else items.push(line);
  }
  const W = width * PX;
  const H = 0.9 * PX;
  const pad = 22;
  const base = H - 30;
  const sx = (x) => pad + ((x - r.lo) / (r.hi - r.lo)) * (W - 2 * pad);
  const out = [];
  out.push(`<line x1="6" y1="${base}" x2="${W - 6}" y2="${base}" stroke="#000" stroke-width="1.2"/>`);
  out.push(`<path d="M6,${base} l8,-4 v8 z M${W - 6},${base} l-8,-4 v8 z" fill="#000"/>`);
  const n = Math.round((r.hi - r.lo) / r.step);
  const every = Math.max(1, Math.ceil((n + 1) / 16));
  for (let i = 0; i <= n && i < 400; i++) {
    const v = Number((r.lo + i * r.step).toPrecision(12));
    out.push(`<line x1="${sx(v)}" y1="${base - 5}" x2="${sx(v)}" y2="${base + 5}" stroke="#000"/>`);
    if (i % every === 0) out.push(`<text x="${sx(v)}" y="${base + 18}" font-size="10" text-anchor="middle">${fmt(v)}</text>`);
  }
  let lift = 0;
  const marker = (x, kind, color, y) => {
    if (kind === 'open') return `<circle cx="${sx(x)}" cy="${y}" r="4" fill="#fff" stroke="${color}" stroke-width="1.6"/>`;
    if (kind === 'closed') return `<circle cx="${sx(x)}" cy="${y}" r="4" fill="${color}"/>`;
    if (kind === '(' || kind === ')') return `<text x="${sx(x)}" y="${y + 5}" font-size="16" text-anchor="middle" fill="${color}">${kind}</text>`;
    if (kind === '[' || kind === ']') return `<text x="${sx(x)}" y="${y + 5}" font-size="16" text-anchor="middle" fill="${color}">${kind}</text>`;
    return '';
  };
  for (const line of items) {
    const [head, ...opts] = parts(line);
    const { color } = styleOf(opts);
    const y = base - 10 - lift;
    let m;
    if ((m = head.match(/^point\s+(.+?)(?:\s+(open|closed))?\s*(".*")?$/i))) {
      const x = ev(m[1]);
      out.push(marker(x, m[2] || 'closed', color, base));
      if (m[3]) out.push(`<text x="${sx(x)}" y="${base - 10}" font-size="11" text-anchor="middle">${esc(quoted(m[3]))}</text>`);
    } else if ((m = head.match(/^segment\s+(.+?)\s+to\s+(.+?)(?:\s+(open|closed|\(|\[))?(?:\s+(open|closed|\)|\]))?$/i))) {
      const a = ev(m[1]);
      const b = ev(m[2]);
      out.push(`<line x1="${sx(a)}" y1="${y}" x2="${sx(b)}" y2="${y}" stroke="${color}" stroke-width="3"/>`);
      out.push(marker(a, m[3] || 'closed', color, y), marker(b, m[4] || 'closed', color, y));
      lift += 12;
    } else if ((m = head.match(/^ray\s+(.+?)\s+(left|right)(?:\s+(open|closed|\(|\[|\)|\]))?$/i))) {
      const a = ev(m[1]);
      const end = m[2].toLowerCase() === 'right' ? W - 8 : 8;
      out.push(`<line x1="${sx(a)}" y1="${y}" x2="${end}" y2="${y}" stroke="${color}" stroke-width="3"/>`);
      out.push(`<path d="M${end},${y} l${end > sx(a) ? -9 : 9},-5 v10 z" fill="${color}"/>`);
      out.push(marker(a, m[3] || 'closed', color, y));
      lift += 12;
    } else {
      throw new Error(`Don’t know how to draw “${head}”`);
    }
  }
  return svgWrap(W, H, out.join(''));
}

function svgWrap(W, H, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="q-graph" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">${body}</svg>`;
}

export function graphSvg(kind, source, runResult) {
  try {
    return kind === 'numberline' ? numberLineSvg(source, runResult) : cartesianSvg(source, runResult);
  } catch (err) {
    return `<span class="graph-error">Graph: ${esc(err.message)}</span>`;
  }
}

export const GRAPH_TEMPLATE = '```graph\nx: -10 to 10 step 1\ny: -10 to 10 step 1\nf(x) = 2*x - 3\npoint (2, 1) "A"\n```';
export const NUMBERLINE_TEMPLATE = '```numberline\nrange: -5 to 5 step 1\nsegment -2 to 3 closed open\n```';
