// Value types and display formatting for algorithm results.
//
// Values are numbers (true/false are 1/0), strings, lists (arrays of numbers
// or strings) or Display values. A Display is formatted math such as a stacked
// fraction from fracs(); it can be shown but not used in further arithmetic.

import { AlgoError } from './parse.js';

export class Display {
  constructor(latex) {
    this.latex = latex;
  }
}

export function typeName(v) {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'text';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Display) return 'display-only value';
  return typeof v;
}

// Remove floating-point noise: 0.1 + 0.2 -> 0.3.
export function clean(x) {
  if (!Number.isFinite(x) || x === 0) return x === 0 ? 0 : x;
  return Number(x.toPrecision(12));
}

// A decimal string without exponent notation.
export function plain(x) {
  x = clean(x);
  let s = String(x);
  if (!/e/i.test(s)) return s;
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp < 0) return x.toFixed(Math.min(100, -exp + 11)).replace(/\.?0+$/, '');
  return BigInt(Math.round(x)).toString();
}

function roundTo(x, decimals) {
  const f = 10 ** decimals;
  return clean(Math.round(clean(x * f)) / f);
}

function groupThousands(s) {
  const [int, dec] = s.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + digits + (dec !== undefined ? `.${dec}` : '');
}

function sciParts(x, decimals) {
  if (x === 0) return { mant: (0).toFixed(decimals), exp: 0 };
  let exp = Math.floor(Math.log10(Math.abs(x)));
  let mant = roundTo(x / 10 ** exp, decimals);
  if (Math.abs(mant) >= 10) {
    exp += 1;
    mant = roundTo(x / 10 ** exp, decimals);
  }
  return { mant: mant.toFixed(decimals), exp };
}

export function sciLatex(x, decimals) {
  const { mant, exp } = sciParts(x, decimals);
  return `${mant} \\times 10^{${exp}}`;
}

// Significant figures, keeping trailing zeros (2.10 stays 2.10).
export function sigFigs(x, n) {
  if (x === 0) return n > 1 ? `0.${'0'.repeat(n - 1)}` : '0';
  const s = x.toPrecision(n);
  if (!/e/.test(s)) return s;
  const exp = Number(s.split('e')[1]);
  if (exp > 0) return BigInt(Math.round(Number(s))).toString();
  return Number(s).toFixed(n - 1 - exp);
}

const minusText = (s) => s.replace(/^-/, '−');
const latexNumber = (s) => s.replace(/,/g, '{,}');

// Format a number. Returns { latex, text }; text is null when the value can
// only be shown as math (scientific notation).
export function formatNumber(x, fmt) {
  if (Number.isNaN(x)) throw new AlgoError('The result isn’t a number');
  if (!Number.isFinite(x)) return { latex: x < 0 ? '-\\infty' : '\\infty', text: x < 0 ? '−∞' : '∞' };
  const kind = fmt?.kind ?? 'general';
  let s;
  switch (kind) {
    case 'general': {
      const v = clean(x);
      const a = Math.abs(v);
      if (v !== 0 && (a >= 1e10 || a < 1e-5)) {
        const mantissa = Number(v.toExponential(5).split('e')[0]);
        const decimals = (String(mantissa).split('.')[1] || '').length;
        return { latex: sciLatex(v, decimals), text: null };
      }
      s = plain(v);
      break;
    }
    case 'dp':
      s = plain(roundTo(x, fmt.digits));
      break;
    case 'fixed':
      s = roundTo(x, fmt.digits).toFixed(fmt.digits);
      break;
    case 'comma':
      s = groupThousands(plain(roundTo(x, fmt.digits)));
      break;
    case 'sci':
      return { latex: sciLatex(x, fmt.digits), text: null };
    case 'sig':
      s = sigFigs(x, fmt.digits);
      break;
    case 'coef': {
      const v = clean(x);
      const body = Math.abs(v) === 1 ? '' : plain(Math.abs(v));
      return { latex: (v < 0 ? '-' : '+') + body, text: (v < 0 ? '−' : '+') + body };
    }
    case 'coef1': {
      const v = clean(x);
      if (v === 1) return { latex: '', text: '' };
      if (v === -1) return { latex: '-', text: '−' };
      s = plain(v);
      break;
    }
    default:
      s = plain(x);
  }
  if (s === '-0') s = '0';
  return { latex: latexNumber(s), text: minusText(s) };
}

const LATEX_SPECIAL = /[\\{}$&#^_%~]/g;
export function latexText(s) {
  return `\\text{${s.replace(LATEX_SPECIAL, (c) => (c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : `\\${c}`))}}`;
}

export function formatValue(v, fmt) {
  if (typeof v === 'number') return formatNumber(v, fmt);
  if (typeof v === 'string') return { latex: latexText(v), text: v };
  if (v instanceof Display) return { latex: v.latex, text: null };
  if (Array.isArray(v)) {
    const parts = v.map((x) => formatValue(x, fmt));
    return {
      latex: parts.map((p) => p.latex).join(',\\ '),
      text: parts.every((p) => p.text !== null) ? parts.map((p) => p.text).join(', ') : null,
    };
  }
  throw new AlgoError('This value can’t be displayed');
}

// The value as plain text for places that aren't rendered (e.g. Schoology accepted answers).
export function plainText(v, fmt) {
  if (typeof v === 'number') {
    const kind = fmt?.kind;
    if (kind === 'sci') return v.toExponential(fmt.digits);
    const f = formatNumber(v, fmt);
    return f.text === null ? plain(v) : f.text.replace(/−/g, '-');
  }
  if (v instanceof Display) return v.latex;
  if (Array.isArray(v)) return v.map((x) => plainText(x, fmt)).join(', ');
  return String(v);
}
