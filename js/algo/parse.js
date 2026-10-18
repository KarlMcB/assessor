// Parsing for the algorithm language: expressions and definition scripts.
//
// Script lines (one definition per line, # starts a comment):
//   m = range(1, 5, 0.5)            variable
//   KE = 0.5*m*v^2 :: sig 3          variable with a display format
//   sq(x) = x*x                      user function
//   condition: isunique(a, b, c)     must be true, or all values are redrawn
//   unique: m, v                     variables that should differ between versions

export class AlgoError extends Error {
  constructor(message, line = null) {
    super(message);
    this.line = line;
  }
}

const WORD_OPS = { AND: '&', OR: '|', NOT: 'not', XOR: 'xor', MOD: 'mod', EQV: 'eqv', IMP: 'imp' };

// ---- tokenizer -----------------------------------------------------------------

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
      if (!m) throw new AlgoError(`Unexpected “${c}”`);
      tokens.push({ type: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') s += src[j++];
      if (j >= src.length) throw new AlgoError('Unclosed quotation mark');
      tokens.push({ type: 'str', value: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_]\w*/);
      const word = m[0];
      const op = WORD_OPS[word.toUpperCase()];
      tokens.push(op ? { type: 'op', value: op } : { type: 'id', value: word });
      i += word.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '<>', '!='].includes(two)) {
      tokens.push({ type: 'op', value: two === '!=' ? '<>' : two });
      i += 2;
      continue;
    }
    if ('+-*/\\%^!()=<>&|,'.includes(c)) {
      tokens.push({ type: c === '(' || c === ')' || c === ',' ? c : 'op', value: c });
      i++;
      continue;
    }
    if (c === '−') { tokens.push({ type: 'op', value: '-' }); i++; continue; }
    if (c === '×') { tokens.push({ type: 'op', value: '*' }); i++; continue; }
    throw new AlgoError(`Unexpected “${c}”`);
  }
  tokens.push({ type: 'end' });
  return tokens;
}

// ---- expression parser (Pratt) ----------------------------------------------------

const INFIX = {
  '|': 1, xor: 1, eqv: 1, imp: 1,
  '&': 2,
  '=': 4, '<>': 4,
  '<': 5, '<=': 5, '>': 5, '>=': 5,
  '+': 6, '-': 6,
  '*': 7, '/': 7, '\\': 7, '%': 7, mod: 7,
  '^': 9,
};
const RIGHT_ASSOC = new Set(['^']);
const PREFIX_BP = { '-': 8, '+': 8, not: 3 };
const POSTFIX_BP = 10; // factorial

export function parseExpression(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const expect = (type, what) => {
    const t = take();
    if (t.type !== type) throw new AlgoError(`Expected ${what}`);
    return t;
  };

  function expr(minBp) {
    let left = prefix();
    for (;;) {
      const t = peek();
      if (t.type === 'op' && t.value === '!') {
        if (POSTFIX_BP < minBp) break;
        take();
        left = { t: 'fact', e: left };
        continue;
      }
      if (t.type !== 'op' || !(t.value in INFIX)) break;
      const bp = INFIX[t.value];
      if (bp < minBp) break;
      take();
      const right = expr(RIGHT_ASSOC.has(t.value) ? bp : bp + 1);
      left = { t: 'bin', op: t.value, l: left, r: right };
    }
    return left;
  }

  function prefix() {
    const t = take();
    switch (t.type) {
      case 'num':
        return { t: 'num', v: t.value };
      case 'str':
        return { t: 'str', v: t.value };
      case 'id': {
        if (peek().type === '(') {
          take();
          const args = [];
          if (peek().type !== ')') {
            for (;;) {
              args.push(expr(0));
              if (peek().type === ',') { take(); continue; }
              break;
            }
          }
          expect(')', '“)” to close the function call');
          return { t: 'call', name: t.value, args };
        }
        return { t: 'id', name: t.value };
      }
      case '(': {
        const e = expr(0);
        expect(')', '“)”');
        return e;
      }
      case 'op':
        if (t.value in PREFIX_BP) return { t: 'un', op: t.value, e: expr(PREFIX_BP[t.value]) };
        throw new AlgoError(`Unexpected “${t.value}”`);
      case 'end':
        throw new AlgoError('Expression ends too soon');
      default:
        throw new AlgoError(`Unexpected “${t.value ?? t.type}”`);
    }
  }

  const tree = expr(0);
  const rest = peek();
  if (rest.type !== 'end') {
    if (rest.type === 'id' || rest.type === 'num' || rest.type === '(') {
      throw new AlgoError('Missing operator (write 3*x, not 3x)');
    }
    throw new AlgoError(`Unexpected “${rest.value ?? rest.type}”`);
  }
  return tree;
}

// ---- display formats --------------------------------------------------------------

const FORMATS = { general: 0, dp: 1, fixed: 1, comma: 1, sci: 1, sig: 1, coef: 0, coef1: 0 };

export function parseFormat(text) {
  const parts = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [kind, n] = parts;
  if (!(kind in FORMATS)) throw new AlgoError(`Unknown format “${kind}” (use general, dp N, fixed N, comma N, sci N, sig N, coef or coef1)`);
  if (FORMATS[kind]) {
    const digits = Number(n);
    if (!Number.isInteger(digits) || digits < 0 || digits > 15) throw new AlgoError(`Format “${kind}” needs a number of digits, e.g. “${kind} 2”`);
    if (kind === 'sig' && digits < 1) throw new AlgoError('sig needs at least 1 digit');
    return { kind, digits };
  }
  if (parts.length > 1) throw new AlgoError(`Format “${kind}” takes no number`);
  return { kind };
}

// Split "expr :: format" outside of string literals.
export function splitFormat(text) {
  let inStr = false;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '"') inStr = !inStr;
    if (!inStr && text[i] === ':' && text[i + 1] === ':') return [text.slice(0, i), text.slice(i + 2)];
  }
  return [text, null];
}

function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inStr = !inStr;
    if (!inStr && line[i] === '#') return line.slice(0, i);
  }
  return line;
}

// ---- scripts --------------------------------------------------------------------

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export function parseProgram(source) {
  const defs = [];
  const errors = [];
  const lines = String(source || '').split('\n');
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const text = stripComment(raw).trim();
    if (!text) return;
    try {
      defs.push(parseLine(text, line));
    } catch (err) {
      errors.push({ line, message: err.message });
    }
  });
  const seen = new Map();
  for (const d of defs) {
    if (!d.name) continue;
    if (seen.has(d.name)) errors.push({ line: d.line, message: `“${d.name}” is already defined on line ${seen.get(d.name)}` });
    else seen.set(d.name, d.line);
  }
  return { defs, errors };
}

function parseLine(text, line) {
  let m = text.match(/^condition(?:\s*:|\s+)\s*(.+)$/i);
  if (m) return { kind: 'cond', expr: parseExpression(m[1]), source: m[1].trim(), line };

  m = text.match(/^unique(?:\s*:|\s+)\s*(.+)$/i);
  if (m) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const n of names) if (!NAME.test(n)) throw new AlgoError(`“${n}” isn't a variable name`);
    return { kind: 'unique', names, line };
  }

  m = text.match(/^([A-Za-z]\w*)\s*\(([^)]*)\)\s*=(?![=])(.+)$/);
  if (m) {
    const params = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of params) if (!NAME.test(p)) throw new AlgoError(`“${p}” isn't a valid parameter name`);
    checkName(m[1]);
    return { kind: 'func', name: m[1], params, expr: parseExpression(m[3]), line };
  }

  m = text.match(/^([A-Za-z]\w*)\s*=(?![=])(.+)$/);
  if (m) {
    checkName(m[1]);
    const [exprText, formatText] = splitFormat(m[2]);
    return {
      kind: 'var',
      name: m[1],
      expr: parseExpression(exprText),
      format: formatText === null ? null : parseFormat(formatText),
      line,
    };
  }
  throw new AlgoError('Expected “name = expression”, “f(x) = expression”, “condition: …” or “unique: …”');
}

// Filled in by functions.js so reserved names can be checked here without a cycle.
export const reserved = new Set();

function checkName(name) {
  if (!NAME.test(name)) throw new AlgoError(`“${name}” is too long or has invalid characters`);
  if (reserved.has(name.toLowerCase())) throw new AlgoError(`“${name}” is a built-in function name`);
}

// Identifiers and calls used by an expression tree.
export function references(tree, ids = new Set(), calls = new Set()) {
  if (!tree) return { ids, calls };
  switch (tree.t) {
    case 'id': ids.add(tree.name); break;
    case 'call': calls.add(tree.name); tree.args.forEach((a) => references(a, ids, calls)); break;
    case 'un': case 'fact': references(tree.e, ids, calls); break;
    case 'bin': references(tree.l, ids, calls); references(tree.r, ids, calls); break;
  }
  return { ids, calls };
}
