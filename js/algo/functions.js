// Built-in functions and constants for the algorithm language.
// Names follow ExamView's algorithm functions where they exist; trig in
// degrees (sind, cosd, …) is an addition for physics.

import { AlgoError, reserved } from './parse.js';
import { Display, clean, plain, sciLatex, sigFigs, typeName } from './values.js';

// ---- argument checks ---------------------------------------------------------------

function num(v, fn, i) {
  if (typeof v !== 'number') throw new AlgoError(`${fn}(): argument ${i + 1} must be a number, not ${typeName(v)}`);
  return v;
}
function int(v, fn, i) {
  num(v, fn, i);
  const r = Math.round(v);
  if (Math.abs(v - r) > 1e-9) throw new AlgoError(`${fn}(): argument ${i + 1} must be a whole number`);
  return r;
}
function str(v, fn, i) {
  if (typeof v !== 'string') throw new AlgoError(`${fn}(): argument ${i + 1} must be text, not ${typeName(v)}`);
  return v;
}
function list(v, fn, i) {
  if (!Array.isArray(v)) throw new AlgoError(`${fn}(): argument ${i + 1} must be a list`);
  if (!v.length) throw new AlgoError(`${fn}(): the list is empty`);
  return v;
}
function numList(v, fn, i) {
  list(v, fn, i);
  v.forEach((x) => num(x, fn, i));
  return v;
}
function domain(ok, fn, message) {
  if (!ok) throw new AlgoError(`${fn}(): ${message}`);
}
// Lists can be passed as one list argument or as separate values.
function spread(args) {
  return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
}

const DEG = Math.PI / 180;

// ---- number theory helpers --------------------------------------------------------

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function isPrime(n) {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

function factorial(n, fn = 'factorial') {
  domain(Number.isInteger(n) && n >= 0, fn, 'needs a whole number zero or more');
  domain(n <= 170, fn, 'number too large');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
export { factorial };

// Best fraction p/q for x, with q up to maxDen.
export function rationalize(x, maxDen = 1_000_000) {
  if (Number.isInteger(x)) return [x, 1];
  const sign = Math.sign(x);
  let v = Math.abs(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(h1 / k1 - Math.abs(x)) < 1e-12 * Math.max(1, Math.abs(x))) break;
    const f = v - a;
    if (f < 1e-15) break;
    v = 1 / f;
  }
  return [sign * h1, k1];
}

function fraction(n, d, fn) {
  num(n, fn, 0); num(d, fn, 1);
  if (d === 0) return null;
  return rationalize(clean(n / d));
}

function stacked(p, q, small) {
  const frac = small ? '\\tfrac' : '\\frac';
  return `${p < 0 ? '-' : ''}${frac}{${Math.abs(p)}}{${q}}`;
}

function fracs(small) {
  return (fn) => (n, d) => {
    const r = fraction(n, d, fn);
    if (!r) return new Display('0');
    const [p, q] = r;
    return new Display(q === 1 ? String(p) : stacked(p, q, small));
  };
}

function mixfracs(small) {
  return (fn) => (n, d) => {
    const r = fraction(n, d, fn);
    if (!r) return new Display('0');
    const [p, q] = r;
    const whole = Math.trunc(Math.abs(p) / q);
    const rem = Math.abs(p) % q;
    if (!rem) return new Display(String(p < 0 ? -whole : whole));
    const frac = `${small ? '\\tfrac' : '\\frac'}{${rem}}{${q}}`;
    return new Display(`${p < 0 ? '-' : ''}${whole || ''}${frac}`);
  };
}

function rfracs(small) {
  return (fn) => (n, d) => {
    const r = fraction(n, d, fn);
    if (!r) return new Display('0');
    return new Display(stacked(r[0], r[1], small));
  };
}

// Repeating decimal with an overbar: 18.333… -> 18.\overline{3}
function decs(x) {
  num(x, 'decs', 0);
  const [p, q] = rationalize(clean(x), 10000);
  if (Math.abs(p / q - x) > 1e-9 * Math.max(1, Math.abs(x))) return new Display(plain(x));
  const sign = p < 0 ? '-' : '';
  let rem = Math.abs(p) % q;
  const whole = Math.floor(Math.abs(p) / q);
  if (!rem) return new Display(sign + whole);
  const digits = [];
  const seen = new Map();
  while (rem && !seen.has(rem) && digits.length < 60) {
    seen.set(rem, digits.length);
    rem *= 10;
    digits.push(Math.floor(rem / q));
    rem %= q;
  }
  if (!rem) return new Display(`${sign}${whole}.${digits.join('')}`);
  const start = seen.get(rem);
  if (start === undefined) return new Display(plain(x));
  return new Display(`${sign}${whole}.${digits.slice(0, start).join('')}\\overline{${digits.slice(start).join('')}}`);
}

// Simplified radical: sqrs(18) -> 3\sqrt{2}
function sqrs(x) {
  num(x, 'sqrs', 0);
  const n = Math.round(x);
  if (Math.abs(x - n) > 1e-9) return new Display(`\\sqrt{${plain(x)}}`);
  if (n === 0) return new Display('0');
  let rest = Math.abs(n);
  let outside = 1;
  for (let f = 2; f * f <= rest; f++) {
    while (rest % (f * f) === 0) {
      rest /= f * f;
      outside *= f;
    }
  }
  const i = n < 0 ? 'i' : '';
  if (rest === 1) return new Display(`${outside === 1 && i ? '' : outside}${i}`);
  return new Display(`${outside === 1 ? '' : outside}${i}\\sqrt{${rest}}`);
}

// C-style format: %d %i %f %.2f %e %g %s %% with optional flags and width.
function cformat(fmt, x) {
  str(fmt, 'format', 0);
  return fmt.replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?([dfieEgGs%])/g, (_, flags, width, prec, conv) => {
    if (conv === '%') return '%';
    let out;
    const p = prec === undefined ? undefined : Number(prec);
    if (conv === 's') out = typeof x === 'string' ? x : plain(x);
    else {
      num(x, 'format', 1);
      switch (conv) {
        case 'd': case 'i': out = String(Math.trunc(x)); break;
        case 'f': out = x.toFixed(p ?? 6); break;
        case 'e': case 'E': out = x.toExponential(p ?? 6).replace(/e([-+])(\d)$/, 'e$10$2'); if (conv === 'E') out = out.toUpperCase(); break;
        default: out = String(Number(x.toPrecision(p || 6))); break;
      }
      if (flags.includes('+') && x >= 0) out = `+${out}`;
    }
    const w = Number(width || 0);
    if (out.length < w) out = flags.includes('-') ? out.padEnd(w) : out.padStart(w, flags.includes('0') && conv !== 's' ? '0' : ' ');
    return out;
  });
}

function sigfig(x, n, force = 0, rng) {
  num(x, 'sigfig', 0);
  n = int(n, 'sigfig', 1);
  domain(n >= 1 && n <= 15, 'sigfig', 'number of significant figures must be 1 to 15');
  let s = sigFigs(x, n);
  if (!force) {
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s;
  }
  // Forced: a whole number with too few real digits gets random ones (1400 -> 1427).
  if (!s.includes('.')) {
    const digits = s.replace('-', '').replace(/^0+/, '');
    if (digits.length >= n && /0$/.test(digits)) {
      const significant = digits.replace(/0+$/, '');
      if (significant.length < n) {
        let fill = '';
        for (let i = significant.length; i < n; i++) fill += String(rng.int(i === n - 1 ? 1 : 0, 9));
        const tail = digits.length - n;
        s = (x < 0 ? '-' : '') + significant + fill + '0'.repeat(tail);
      }
    }
  }
  return s;
}

// ---- statistics -------------------------------------------------------------------

const sortNum = (a) => a.slice().sort((x, y) => x - y);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function median(a) {
  const s = sortNum(a);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const variance = (a) => {
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length;
};
// Quartiles by the median-of-halves method (as on TI calculators).
function quartile(a, which) {
  const s = sortNum(a);
  const half = s.length >> 1;
  switch (which) {
    case 0: return s[0];
    case 1: return median(s.slice(0, half));
    case 2: return median(s);
    case 3: return median(s.slice(s.length % 2 ? half + 1 : half));
    case 4: return s[s.length - 1];
    default: throw new AlgoError('quartile(): which must be 0 to 4');
  }
}
function mode(a) {
  const counts = new Map();
  for (const x of a) counts.set(x, (counts.get(x) || 0) + 1);
  const max = Math.max(...counts.values());
  const top = [...counts].filter(([, c]) => c === max);
  return top.length === 1 && max > 1 ? top[0][0] : 0;
}

// A random data set with chosen extremes, quartiles and median (-1 = any value).
function makelist(rng, n, lo, q1, med, q3, hi, sorted) {
  n = int(n, 'makelist', 0);
  domain(n >= 1 && n <= 1000, 'makelist', 'number of values must be 1 to 1000');
  const given = (v) => v !== -1;
  const lower = given(lo) ? lo : 1;
  const upper = given(hi) ? hi : Math.max(lower + 100, 100);
  domain(lower <= upper, 'makelist', 'lower extreme is above upper extreme');
  const vals = new Array(n).fill(null);
  const pin = (i, v) => { if (i >= 0 && i < n) vals[i] = v; };
  const pinMedian = (start, len, v) => {
    if (len <= 0) return;
    const m = start + (len >> 1);
    if (len % 2) pin(m, v);
    else { pin(m - 1, v); pin(m, v); }
  };
  if (given(lo)) pin(0, lo);
  if (given(hi)) pin(n - 1, hi);
  if (given(med)) pinMedian(0, n, med);
  if (given(q1) && given(q3)) {
    const half = n >> 1;
    pinMedian(0, half, q1);
    pinMedian(n % 2 ? half + 1 : half, half, q3);
  }
  const whole = [lo, q1, med, q3, hi].filter(given).every(Number.isInteger);
  // Fill gaps with values between the neighbouring pinned values.
  for (let i = 0; i < n; i++) {
    if (vals[i] !== null) continue;
    let a = lower, b = upper;
    for (let j = i - 1; j >= 0; j--) if (vals[j] !== null) { a = vals[j]; break; }
    for (let j = i + 1; j < n; j++) if (vals[j] !== null) { b = vals[j]; break; }
    vals[i] = whole ? rng.int(Math.ceil(a), Math.floor(b)) : clean(a + rng.next() * (b - a));
  }
  const out = sortNum(vals);
  return sorted ? out : rng.shuffle(out);
}

function randomRange(rng, lo, hi, step) {
  num(lo, 'range', 0); num(hi, 'range', 1);
  if (lo > hi) [lo, hi] = [hi, lo];
  if (step === undefined) {
    const decimals = Math.max(...[lo, hi].map((v) => (plain(v).split('.')[1] || '').length));
    step = 10 ** -decimals;
  }
  num(step, 'range', 2);
  domain(step > 0, 'range', 'the step must be more than zero');
  const count = Math.floor((hi - lo) / step + 1e-9);
  domain(count <= 1e7, 'range', 'too many possible values; use a larger step');
  const decimals = (plain(step).split('.')[1] || '').length;
  const candidates = () => clean(Number((lo + rng.int(0, count) * step).toFixed(Math.min(15, decimals + 2))));
  for (let i = 0; i < 1000; i++) {
    const v = candidates();
    // With an explicit step spanning zero, ExamView never returns 0.
    if (!(v === 0 && lo < 0 && hi > 0)) return v;
  }
  throw new AlgoError('range(): no value available');
}

// ---- registry ----------------------------------------------------------------------

// Each entry: [min args, max args (Infinity for any), implementation, signature, description, category]
const F = {};
function def(name, min, max, impl, sig, doc, cat, opts = {}) {
  F[name] = { name, min, max, impl, sig, doc, cat, ...opts };
}
const m1 = (name, f, doc, cat = 'Math', check) =>
  def(name, 1, 1, (x) => {
    num(x, name, 0);
    if (check) domain(check(x), name, 'value out of range');
    return f(x);
  }, `${name}(x)`, doc, cat);

// Math
m1('abs', Math.abs, 'Absolute value');
m1('ceil', Math.ceil, 'Round up to a whole number');
m1('floor', Math.floor, 'Round down to a whole number');
m1('frac', (x) => clean(x - Math.floor(x)), 'Fractional part, 0 ≤ result < 1');
m1('int', Math.trunc, 'Whole-number part (toward zero)');
m1('inv', (x) => 1 / x, 'Reciprocal, 1/x', 'Math', (x) => x !== 0);
m1('sgn', Math.sign, 'Sign: −1, 0 or 1');
m1('sqrt', Math.sqrt, 'Square root', 'Math', (x) => x >= 0);
m1('sqr', Math.sqrt, 'Square root (ExamView name; not the square)', 'Math', (x) => x >= 0);
def('max', 1, Infinity, (...a) => Math.max(...spread(a).map((x, i) => num(x, 'max', i))), 'max(a, b, …)', 'Largest value', 'Math');
def('min', 1, Infinity, (...a) => Math.min(...spread(a).map((x, i) => num(x, 'min', i))), 'min(a, b, …)', 'Smallest value', 'Math');
def('round', 1, 2, (x, p = 0) => {
  num(x, 'round', 0);
  p = int(p, 'round', 1);
  if (p >= 10) return clean(Math.round(x / p) * p);
  return clean(Math.round(clean(x * 10 ** p)) / 10 ** p);
}, 'round(x, places)', 'Round to decimal places; places ≥ 10 rounds to the nearest multiple (round(1492, 100) = 1500)', 'Math');
def('pow', 2, 2, (x, y) => num(x, 'pow', 0) ** num(y, 'pow', 1), 'pow(x, y)', 'x to the power y', 'Math');

// Exponential and logarithmic
m1('exp', Math.exp, 'e to the power x', 'Exponential');
m1('ln', Math.log, 'Natural logarithm', 'Exponential', (x) => x > 0);
m1('log', Math.log, 'Natural logarithm (ExamView name)', 'Exponential', (x) => x > 0);
m1('log10', Math.log10, 'Base-10 logarithm', 'Exponential', (x) => x > 0);
def('logb', 2, 2, (x, b) => {
  domain(num(x, 'logb', 0) > 0 && num(b, 'logb', 1) > 0 && b !== 1, 'logb', 'arguments must be positive and the base not 1');
  return Math.log(x) / Math.log(b);
}, 'logb(x, b)', 'Base-b logarithm', 'Exponential');

// Trigonometry (radians)
const trig = [
  ['sin', Math.sin], ['cos', Math.cos], ['tan', Math.tan],
  ['sec', (x) => 1 / Math.cos(x)], ['csc', (x) => 1 / Math.sin(x)], ['cot', (x) => 1 / Math.tan(x)],
  ['sinh', Math.sinh], ['cosh', Math.cosh], ['tanh', Math.tanh],
  ['sech', (x) => 1 / Math.cosh(x)], ['csch', (x) => 1 / Math.sinh(x)], ['coth', (x) => 1 / Math.tanh(x)],
];
for (const [n, f] of trig) m1(n, f, `${n} of an angle in radians`, 'Trigonometry');
const inverse = [
  ['asin', Math.asin, (x) => x >= -1 && x <= 1], ['acos', Math.acos, (x) => x >= -1 && x <= 1], ['atan', Math.atan],
  ['asec', (x) => Math.acos(1 / x), (x) => Math.abs(x) >= 1], ['acsc', (x) => Math.asin(1 / x), (x) => Math.abs(x) >= 1],
  ['acot', (x) => Math.atan(1 / x), (x) => x !== 0],
  ['asinh', Math.asinh], ['acosh', Math.acosh, (x) => x >= 1], ['atanh', Math.atanh, (x) => x > -1 && x < 1],
  ['asech', (x) => Math.acosh(1 / x), (x) => x > 0 && x <= 1], ['acsch', (x) => Math.asinh(1 / x), (x) => x !== 0],
  ['acoth', (x) => Math.atanh(1 / x), (x) => Math.abs(x) > 1],
];
for (const [n, f, check] of inverse) {
  m1(n, f, `Inverse ${n.slice(1)}, result in radians`, 'Trigonometry', check);
  m1(`arc${n.slice(1)}`, f, `Same as ${n}`, 'Trigonometry', check);
}
const atan2 = (y, x) => Math.atan2(num(y, 'atan2', 0), num(x, 'atan2', 1));
def('atan2', 2, 2, atan2, 'atan2(y, x)', 'Angle of the point (x, y) in radians', 'Trigonometry');
def('arctan2', 2, 2, atan2, 'arctan2(y, x)', 'Same as atan2', 'Trigonometry');
m1('deg', (x) => x / DEG, 'Radians to degrees', 'Trigonometry');
m1('rad', (x) => x * DEG, 'Degrees to radians', 'Trigonometry');
m1('sind', (x) => clean(Math.sin(x * DEG)), 'Sine of an angle in degrees', 'Trigonometry');
m1('cosd', (x) => clean(Math.cos(x * DEG)), 'Cosine of an angle in degrees', 'Trigonometry');
m1('tand', (x) => clean(Math.tan(x * DEG)), 'Tangent of an angle in degrees', 'Trigonometry');
m1('asind', (x) => Math.asin(x) / DEG, 'Inverse sine, result in degrees', 'Trigonometry', (x) => x >= -1 && x <= 1);
m1('acosd', (x) => Math.acos(x) / DEG, 'Inverse cosine, result in degrees', 'Trigonometry', (x) => x >= -1 && x <= 1);
m1('atand', (x) => Math.atan(x) / DEG, 'Inverse tangent, result in degrees', 'Trigonometry');
def('atan2d', 2, 2, (y, x) => atan2(y, x) / DEG, 'atan2d(y, x)', 'Angle of the point (x, y) in degrees', 'Trigonometry');

// Random
def('rand', 1, 1, function (n) { n = int(n, 'rand', 0); domain(n >= 1, 'rand', 'needs 1 or more'); return this.rng.int(1, n); },
  'rand(n)', 'Random whole number from 1 to n', 'Random', { random: true });
def('range', 2, 3, function (lo, hi, step) { return randomRange(this.rng, lo, hi, step); },
  'range(lo, hi, step)', 'Random value from lo to hi in steps (step defaults to the precision of lo and hi: range(1, 10) gives whole numbers)', 'Random', { random: true });
def('prime', 2, 2, function (lo, hi) {
  lo = int(lo, 'prime', 0); hi = int(hi, 'prime', 1);
  domain(lo >= 2 && hi <= 1000 && lo <= hi, 'prime', 'range must be within 2 to 1000');
  const primes = [];
  for (let n = lo; n <= hi; n++) if (isPrime(n)) primes.push(n);
  domain(primes.length, 'prime', 'no primes in that range');
  return primes[this.rng.int(0, primes.length - 1)];
}, 'prime(lo, hi)', 'Random prime from lo to hi', 'Random', { random: true });
def('unsort', 1, 1, function (l) { return this.rng.shuffle(list(l, 'unsort', 0)); }, 'unsort(list)', 'Shuffle a list', 'Random', { random: true });
def('makelist', 7, 7, function (n, lo, q1, med, q3, hi, sorted) {
  [lo, q1, med, q3, hi].forEach((v, i) => num(v, 'makelist', i + 1));
  return makelist(this.rng, n, lo, q1, med, q3, hi, Boolean(sorted));
}, 'makelist(n, low, q1, median, q3, high, sorted)', 'Random data set with the given five-number summary (−1 = any)', 'Statistics', { random: true });

// Lists and choosing
def('list', 1, Infinity, (...a) => {
  const kinds = new Set(a.map(typeName));
  domain(kinds.size === 1 && (kinds.has('number') || kinds.has('text')), 'list', 'items must all be numbers or all be text');
  return a;
}, 'list(a, b, …)', 'A list of values', 'Lists');
def('choose', 2, Infinity, (i, ...a) => {
  i = int(i, 'choose', 0);
  const items = spread(a);
  domain(items.length > 0, 'choose', 'nothing to choose from');
  return items[(((i - 1) % items.length) + items.length) % items.length];
}, 'choose(i, a, b, …)', 'The i-th item (1-based); also choose(i, list)', 'Lists');
def('sort', 2, Infinity, (asc, ...a) => {
  const items = numList(spread(a), 'sort', 1);
  return asc ? sortNum(items) : sortNum(items).reverse();
}, 'sort(ascending, a, b, …)', 'Sorted list; also sort(ascending, list)', 'Lists');
def('len', 1, 1, (x) => (Array.isArray(x) ? x.length : str(x, 'len', 0).length), 'len(x)', 'Length of text or a list', 'Text');

// Statistics
const stat = (name, f, doc) => def(name, 1, Infinity, (...a) => f(numList(spread(a), name, 0)), `${name}(list)`, doc, 'Statistics');
stat('sum', (a) => clean(a.reduce((s, x) => s + x, 0)), 'Sum of the values');
stat('mean', (a) => clean(mean(a)), 'Average');
stat('median', (a) => median(a), 'Median');
stat('mode', mode, 'Most common value (0 if there is no single mode)');
stat('variance', (a) => clean(variance(a)), 'Population variance');
stat('sdev', (a) => clean(Math.sqrt(variance(a))), 'Population standard deviation');
def('quartile', 2, 2, (l, w) => quartile(numList(l, 'quartile', 0), int(w, 'quartile', 1)),
  'quartile(list, which)', '0 = min, 1 = Q1, 2 = median, 3 = Q3, 4 = max', 'Statistics');
def('comb', 2, 2, (m, n) => {
  m = int(m, 'comb', 0); n = int(n, 'comb', 1);
  domain(m >= 0 && n >= 0 && n <= m, 'comb', 'needs 0 ≤ n ≤ m');
  return Math.round(factorial(m, 'comb') / (factorial(n, 'comb') * factorial(m - n, 'comb')));
}, 'comb(m, n)', 'Combinations of n from m', 'Statistics');
def('perm', 2, 2, (m, n) => {
  m = int(m, 'perm', 0); n = int(n, 'perm', 1);
  domain(m >= 0 && n >= 0 && n <= m, 'perm', 'needs 0 ≤ n ≤ m');
  return Math.round(factorial(m, 'perm') / factorial(m - n, 'perm'));
}, 'perm(m, n)', 'Permutations of n from m', 'Statistics');

// Number theory
def('gcf', 2, 2, (x, y) => gcd(int(x, 'gcf', 0), int(y, 'gcf', 1)), 'gcf(x, y)', 'Greatest common factor', 'Number theory');
def('lcd', 2, 2, (x, y) => {
  x = int(x, 'lcd', 0); y = int(y, 'lcd', 1);
  return x && y ? Math.abs(x * y) / gcd(x, y) : 0;
}, 'lcd(x, y)', 'Least common multiple (lowest common denominator)', 'Number theory');
def('isprime', 1, 1, (x) => {
  x = int(x, 'isprime', 0);
  domain(x >= 2 && x <= 1_000_000, 'isprime', 'value must be 2 to 1,000,000');
  return isPrime(x) ? 1 : 0;
}, 'isprime(x)', '1 if x is prime, else 0', 'Number theory');
def('isrelprime', 2, 2, (x, y) => (gcd(int(x, 'isrelprime', 0), int(y, 'isrelprime', 1)) === 1 ? 1 : 0),
  'isrelprime(x, y)', '1 if x and y share no factor', 'Number theory');

// Logic
def('isunique', 2, Infinity, (...a) => {
  const items = spread(a);
  const kinds = new Set(items.map(typeName));
  domain(kinds.size === 1, 'isunique', 'values must all be numbers or all be text');
  const keys = items.map((v) => (typeof v === 'number' ? String(clean(v)) : v));
  return new Set(keys).size === keys.length ? 1 : 0;
}, 'isunique(a, b, …)', '1 if no two values are equal (use as a condition for distinct choices)', 'Logic');
F.if = { name: 'if', min: 3, max: 3, lazy: true, sig: 'if(condition, a, b)', doc: 'a if the condition is true, else b', cat: 'Logic' };

// Text
def('str', 1, 1, (x) => plain(num(x, 'str', 0)), 'str(x)', 'Number as text', 'Text');
def('val', 1, 1, (s) => {
  const v = Number(str(s, 'val', 0).trim());
  domain(!Number.isNaN(v), 'val', `“${s}” isn't a number`);
  return v;
}, 'val(text)', 'Text as a number', 'Text');
def('left', 2, 2, (s, n) => str(s, 'left', 0).slice(0, Math.max(0, int(n, 'left', 1))), 'left(text, n)', 'First n characters', 'Text');
def('right', 2, 2, (s, n) => { str(s, 'right', 0); n = int(n, 'right', 1); return n > 0 ? s.slice(-n) : ''; }, 'right(text, n)', 'Last n characters', 'Text');
def('mid', 3, 3, (s, start, n) => str(s, 'mid', 0).substr(int(start, 'mid', 1) - 1, int(n, 'mid', 2)), 'mid(text, start, n)', 'n characters from position start (1-based)', 'Text');
def('instr', 2, 2, (s, sub) => str(s, 'instr', 0).indexOf(str(sub, 'instr', 1)) + 1, 'instr(text, find)', 'Position of find in text (0 if absent)', 'Text');
def('lcase', 1, 1, (s) => str(s, 'lcase', 0).toLowerCase(), 'lcase(text)', 'Lowercase', 'Text');
def('ucase', 1, 1, (s) => str(s, 'ucase', 0).toUpperCase(), 'ucase(text)', 'Uppercase', 'Text');
def('trim', 1, 1, (s) => str(s, 'trim', 0).trim(), 'trim(text)', 'Remove surrounding spaces', 'Text');
def('ltrim', 1, 1, (s) => str(s, 'ltrim', 0).trimStart(), 'ltrim(text)', 'Remove leading spaces', 'Text');
def('rtrim', 1, 1, (s) => str(s, 'rtrim', 0).trimEnd(), 'rtrim(text)', 'Remove trailing spaces', 'Text');
def('strdup', 2, 2, (s, n) => str(s, 'strdup', 0).repeat(Math.max(0, int(n, 'strdup', 1))), 'strdup(text, n)', 'Text repeated n times', 'Text');
def('asc', 1, 1, (s) => (str(s, 'asc', 0).length ? s.charCodeAt(0) : 0), 'asc(text)', 'Character code of the first character', 'Text');
def('chr', 1, 1, (n) => { n = int(n, 'chr', 0); return n < 32 || n > 0x10ffff ? '?' : String.fromCodePoint(n); }, 'chr(n)', 'Character with code n', 'Text');

// Display only
const disp = (name, make, sig, doc) => def(name, 2, 2, make(name), sig, doc, 'Display', { display: true });
disp('fracs', fracs(false), 'fracs(n, d)', 'Reduced fraction, stacked (whole number if possible)');
disp('mixfracs', mixfracs(false), 'mixfracs(n, d)', 'Reduced mixed number, stacked');
disp('rfracs', rfracs(false), 'rfracs(n, d)', 'Reduced ratio, always stacked (2/1 stays 2/1)');
disp('sfracs', fracs(true), 'sfracs(n, d)', 'Like fracs, smaller');
disp('smixfracs', mixfracs(true), 'smixfracs(n, d)', 'Like mixfracs, smaller');
disp('srfracs', rfracs(true), 'srfracs(n, d)', 'Like rfracs, smaller');
def('decs', 1, 1, decs, 'decs(x)', 'Decimal with repeating digits under a bar', 'Display', { display: true });
def('sqrs', 1, 1, sqrs, 'sqrs(x)', 'Simplified square root: sqrs(18) = 3√2', 'Display', { display: true });
def('sciens', 1, 2, (x, d = 2) => new Display(sciLatex(num(x, 'sciens', 0), int(d, 'sciens', 1))), 'sciens(x, decimals)', 'Scientific notation (default 2 decimals)', 'Display', { display: true });
def('sgns', 1, 1, (x) => (num(x, 'sgns', 0) < 0 ? '-' : '+'), 'sgns(x)', '“−” or “+” as text', 'Display');
def('sigfig', 2, 3, function (x, n, force) { return sigfig(x, n, force, this.rng); }, 'sigfig(x, n, force)', 'Text with n significant figures; force = true keeps exactly n', 'Display', { random: true });
def('format', 2, 2, cformat, 'format(pattern, x)', 'C-style formatting: format("%.2f m/s", v)', 'Display');

export const FUNCTIONS = F;

for (const name of Object.keys(F)) reserved.add(name.toLowerCase());
reserved.add('condition');
reserved.add('unique');

export const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  inf: Infinity,
  true: 1,
  false: 0,
  yes: 1,
  no: 0,
};

export const CONSTANT_DOCS = [
  ['pi', '3.14159…'], ['e', '2.71828…'], ['inf', 'Infinity'], ['true, yes', '1'], ['false, no', '0'],
  ['testversion', 'Version letter being printed: "A", "B", …'],
];
