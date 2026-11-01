// A small RTF reader: turns a document into lines of assessor text (Markdown and
// LaTeX) plus the pictures it holds. Fonts and sizes are dropped; bold, italic,
// sub/superscripts, tables and pictures are kept.

import { newId } from '../model.js';

const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'footnote', 'annotation', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'pntext', 'listtext', 'nonshppict', 'object', 'shpinst', 'sp']);
const SYMBOL = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ', qmspace: ' ', tab: '\t' };
const PICTURE_KINDS = { pngblip: 'png', jpegblip: 'jpeg', wmetafile: 'wmf', emfblip: 'emf', dibitmap: 'dib', macpict: 'pict', pmmetafile: 'pm', wbitmap: 'bitmap' };

const cp1252 = new TextDecoder('windows-1252');
const STYLE_KEY = (s) => `${s.b ? 1 : 0}${s.i ? 1 : 0}${s.sup ? 1 : 0}${s.sub ? 1 : 0}`;

function mathScript(run) {
  const part = (mark, on) => {
    if (!on) return '';
    const t = run.text.trim();
    return `${mark}{${/^[A-Za-z0-9+\-.,=()]+$/.test(t) ? t : `\\text{${t.replace(/[\\{}$%&#_^~]/g, '')}}`}}`;
  };
  return part('^', run.sup) + part('_', run.sub);
}

// Turn one line's styled runs into text.
function runsToText(runs) {
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && !last.raw && !r.raw && last.key === r.key) last.text += r.text;
    else merged.push({ ...r });
  }
  let out = '';
  let math = false; // an open $…$, so x_i^2 stays one formula
  for (const r of merged) {
    if (r.raw) { if (math) { out += '$'; math = false; } out += r.text; continue; }
    if ((r.sup || r.sub) && r.text.trim()) {
      const lead = r.text.match(/^\s*/)[0];
      const trail = r.text.match(/\s*$/)[0];
      if (math && lead) { out += '$'; math = false; }
      out += `${lead}${math ? '' : '$'}${mathScript(r)}`;
      math = true;
      if (trail) { out += `$${trail}`; math = false; }
      continue;
    }
    if (math) { out += '$'; math = false; }
    const text = r.text.replace(/\$/g, '\\$');
    const body = text.trim();
    if (!body) { out += text; continue; }
    const mark = r.b && r.i ? '***' : r.b ? '**' : r.i ? '*' : '';
    out += `${text.match(/^\s*/)[0]}${mark}${body}${mark}${text.match(/\s*$/)[0]}`;
  }
  return math ? `${out}$` : out;
}

// Returns { lines: [{ text, table }], pictures: [{ id, kind, hex, link, width }] }.
// Pictures appear in the text as ![Figure](img:ID|width).
export function readRtf(source) {
  if (!/^\s*\{\\rtf/.test(source.slice(0, 200))) throw new Error('That file isn’t an RTF document.');
  const lines = [];
  const pictures = [];
  let runs = [];
  let cells = null;
  let cell = [];
  let state = { b: false, i: false, sup: false, sub: false, uc: 1, dest: null, pic: null, inst: null, field: null, table: false };
  const stack = [];
  const len = source.length;
  let i = 0;

  const add = (text) => {
    const last = runs[runs.length - 1];
    const key = STYLE_KEY(state);
    if (last && !last.raw && last.key === key) last.text += text;
    else runs.push({ text, key, b: state.b, i: state.i, sup: state.sup, sub: state.sub });
  };
  const addImage = (id, width, alt = 'Figure') => runs.push({ raw: true, text: `![${alt}](img:${id}${width ? `|${width}` : ''})` });
  const endLine = () => {
    const text = runsToText(runs);
    runs = [];
    if (state.table) { if (text.trim()) cell.push(text.trim()); return; }
    lines.push({ text, table: false });
  };
  const endCell = () => {
    const text = runsToText(runs);
    runs = [];
    if (text.trim()) cell.push(text.trim());
    (cells ??= []).push(cell.join(' ').replace(/\|/g, '/'));
    cell = [];
  };
  const endRow = () => {
    if (runs.length) endCell();
    if (cells?.length) lines.push({ text: `| ${cells.join(' | ')} |`, table: true });
    cells = null;
    cell = [];
    state.table = false;
  };
  const closeGroup = () => {
    const closed = state;
    state = stack.pop() ?? state;
    if (closed.pic && closed.pic !== state.pic) {
      const p = closed.pic;
      if (p.kind) {
        const pic = { id: newId(), kind: p.kind, hex: p.hex.join(''), link: null, width: p.goal ? Math.round((p.goal * p.scale) / 100 / 15) : null };
        pictures.push(pic);
        addImage(pic.id, pic.width);
      }
    }
    if (closed.inst && closed.inst !== state.inst) {
      const m = closed.inst.text.match(/INCLUDEPICTURE\s+"?([^"\\]+?(?:\\\\?[^"\\]+?)*)"?(?:\s+\\|\s*$)/i);
      if (m) {
        const name = m[1].replace(/\\\\?/g, '/').split('/').pop().trim();
        const pic = { id: newId(), kind: 'link', hex: '', link: name, width: null };
        pictures.push(pic);
        addImage(pic.id, null, name.replace(/[\[\]]/g, ''));
        if (state.field) state.field.done = true;
      }
    }
  };

  const hexEnd = /[\\{}]/g;
  while (i < len) {
    const c = source[i];
    if (c === '{') { stack.push(state); state = { ...state }; i++; continue; }
    if (c === '}') { closeGroup(); i++; continue; }
    if (c === '\\') {
      const next = source[i + 1];
      if (next === "'") {
        if (state.dest !== 'skip') add(cp1252.decode(new Uint8Array([parseInt(source.substr(i + 2, 2), 16)])));
        i += 4;
        continue;
      }
      if (!/[a-zA-Z]/.test(next ?? '')) {
        i += 2;
        if (next === '*') {
          // An ignorable destination: keep the few that matter and skip the rest.
          const m = /^\\([a-z]+)/.exec(source.substr(i, 40));
          if (m?.[1] === 'fldinst') state.inst = { text: '' }, state.dest = 'inst';
          else if (m?.[1] !== 'shppict') state.dest = 'skip';
          if (m) i += m[0].length;
          if (source[i] === ' ') i++;
          continue;
        }
        if (state.dest === 'inst') state.inst.text += next ?? '';
        else if (state.dest === 'skip' || state.dest === 'pic') continue;
        else if (next === '~') add(' ');
        else if (next === '_') add('‑');
        else if (next === '\\' || next === '{' || next === '}') add(next);
        else if (next === '\n' || next === '\r') endLine();
        continue;
      }
      let j = i + 1;
      while (j < len && /[a-zA-Z]/.test(source[j])) j++;
      const word = source.slice(i + 1, j);
      let k = j;
      if (source[k] === '-') k++;
      while (k < len && source[k] >= '0' && source[k] <= '9') k++;
      const param = k > j ? Number(source.slice(j, k)) : null;
      if (source[k] === ' ') k++;
      i = k;

      if (state.dest === 'skip') continue;
      if (state.dest === 'pic') {
        const p = state.pic;
        if (PICTURE_KINDS[word]) p.kind = PICTURE_KINDS[word];
        else if (word === 'picwgoal') p.goal = param;
        else if (word === 'picscalex') p.scale = param || 100;
        else if (word === 'bin') i += param ?? 0;
        continue;
      }
      if (state.dest === 'inst') continue;
      if (SKIP.has(word)) { state.dest = 'skip'; continue; }
      switch (word) {
        case 'pict': state.pic = { kind: null, goal: null, scale: 100, hex: [] }; state.dest = 'pic'; break;
        case 'field': state.field = { done: false }; break;
        case 'fldrslt': if (state.field?.done) state.dest = 'skip'; break;
        case 'par': case 'sect': case 'page': case 'line': endLine(); break;
        case 'pard': state.table = false; break;
        case 'intbl': state.table = true; break;
        case 'cell': endCell(); break;
        case 'row': endRow(); break;
        case 'plain': state.b = state.i = state.sup = state.sub = false; break;
        case 'b': state.b = param !== 0; break;
        case 'i': state.i = param !== 0; break;
        case 'super': state.sup = true; state.sub = false; break;
        case 'sub': state.sub = true; state.sup = false; break;
        case 'nosupersub': state.sup = state.sub = false; break;
        case 'up': state.sup = param !== 0; break;
        case 'dn': state.sub = param !== 0; break;
        case 'uc': state.uc = param ?? 1; break;
        case 'u': {
          add(String.fromCharCode(param < 0 ? param + 65536 : param));
          for (let n = 0; n < state.uc && i < len; n++) {
            if (source[i] === '\\' && source[i + 1] === "'") i += 4;
            else i++;
          }
          break;
        }
        default:
          if (SYMBOL[word]) add(SYMBOL[word]);
      }
      continue;
    }
    if (state.dest === 'pic') {
      hexEnd.lastIndex = i;
      const m = hexEnd.exec(source);
      const end = m ? m.index : len;
      state.pic.hex.push(source.slice(i, end).replace(/\s+/g, ''));
      i = end;
      continue;
    }
    if (c === '\n' || c === '\r') { i++; continue; }
    if (state.dest === 'skip') { i++; continue; }
    if (state.dest === 'inst') { state.inst.text += c; i++; continue; }
    add(c);
    i++;
  }
  if (runs.length) endLine();
  return { lines, pictures };
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// A device-independent bitmap, wrapped so a browser can decode it as a BMP.
function dibToBmp(dib) {
  const v = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = v.getUint32(0, true);
  const bits = v.getUint16(14, true);
  const compression = v.getUint32(16, true);
  const used = v.getUint32(32, true);
  const palette = (bits <= 8 ? used || 1 << bits : used) * 4 + (compression === 3 && headerSize === 40 ? 12 : 0);
  const file = new Uint8Array(14 + dib.length);
  const out = new DataView(file.buffer);
  out.setUint16(0, 0x4d42, true);
  out.setUint32(2, file.length, true);
  out.setUint32(10, 14 + headerSize + palette, true);
  file.set(dib, 14);
  return new Blob([file], { type: 'image/bmp' });
}

// Windows metafiles can't be shown by browsers, but word processors usually
// save a picture as one wrapping a single bitmap. Returns that bitmap or null.
function wmfBitmap(wmf) {
  if (wmf.length < 18) return null;
  const v = new DataView(wmf.buffer, wmf.byteOffset, wmf.byteLength);
  let p = v.getUint16(2, true) * 2;
  let best = null;
  while (p + 6 <= wmf.length) {
    const words = v.getUint32(p, true);
    const fn = v.getUint16(p + 4, true);
    if (!words || fn === 0) break;
    const start = fn === 0x0f43 ? p + 28 : fn === 0x0b41 ? p + 26 : 0; // StretchDIB, DIBStretchBlt
    if (start && start + 40 <= p + words * 2 && (!best || words * 2 > best.length)) best = wmf.subarray(start, p + words * 2);
    p += words * 2;
  }
  return best;
}

// Returns an image Blob for a picture, or null if browsers can't show its format.
export function pictureBlob(pic) {
  const bytes = hexToBytes(pic.hex);
  if (pic.kind === 'png') return new Blob([bytes], { type: 'image/png' });
  if (pic.kind === 'jpeg') return new Blob([bytes], { type: 'image/jpeg' });
  if (pic.kind === 'dib') return dibToBmp(bytes);
  if (pic.kind === 'wmf') {
    const dib = wmfBitmap(bytes);
    return dib ? dibToBmp(dib) : null;
  }
  return null;
}
