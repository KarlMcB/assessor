// Evaluates algorithm scripts and resolves [[…]] placeholders in question text.

import { AlgoError, parseExpression, parseProgram, references, splitFormat, parseFormat } from './parse.js';
import { CONSTANTS, FUNCTIONS, factorial } from './functions.js';
import { Display, clean, formatValue, plainText, typeName } from './values.js';
import { makeRng } from './rng.js';

const MAX_ATTEMPTS = 1000;
const MAX_DEPTH = 64;

// ---- expression evaluation ------------------------------------------------------

function isTrue(v) {
  if (typeof v !== 'number') throw new AlgoError(`Expected a true/false value, got ${typeName(v)}`);
  return v !== 0;
}

function numbers(op, a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    const bad = typeof a !== 'number' ? a : b;
    if (bad instanceof Display) throw new AlgoError('Display-only values (fracs, sqrs, …) can’t be used in calculations');
    throw new AlgoError(`“${op}” needs numbers, not ${typeName(bad)}`);
  }
}

function binary(op, a, b) {
  switch (op) {
    case '+':
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      numbers(op, a, b);
      return a + b;
    case '=':
    case '<>': {
      if (typeName(a) !== typeName(b)) throw new AlgoError(`Can’t compare ${typeName(a)} with ${typeName(b)}`);
      const eq = typeof a === 'number' ? clean(a) === clean(b) : a === b;
      return (op === '=') === eq ? 1 : 0;
    }
    case '<': case '<=': case '>': case '>=':
      if (typeof a === 'string' && typeof b === 'string') {
        const c = a.localeCompare(b);
        return { '<': c < 0, '<=': c <= 0, '>': c > 0, '>=': c >= 0 }[op] ? 1 : 0;
      }
      numbers(op, a, b);
      return { '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b }[op] ? 1 : 0;
  }
  numbers(op, a, b);
  switch (op) {
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) throw new AlgoError('Division by zero');
      return a / b;
    case '\\':
      if (b === 0) throw new AlgoError('Division by zero');
      return Math.trunc(a / b);
    case '%': case 'mod':
      return b === 0 ? 0 : a % b;
    case '^': {
      const r = a ** b;
      if (Number.isNaN(r)) throw new AlgoError('Power of a negative number gives no real result');
      return r;
    }
    case 'xor': return (isTrue(a) !== isTrue(b)) ? 1 : 0;
    case 'eqv': return (isTrue(a) === isTrue(b)) ? 1 : 0;
    case 'imp': return isTrue(a) && !isTrue(b) ? 1 : 0;
  }
  throw new AlgoError(`Unknown operator ${op}`);
}

class Context {
  constructor({ rng, version = 'A', funcs = new Map(), vars = new Map() }) {
    this.rng = rng;
    this.version = version;
    this.funcs = funcs; // user functions: name -> def
    this.vars = vars; // name -> value
    this.depth = 0;
  }

  eval(node, locals) {
    switch (node.t) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'id': return this.lookup(node.name, locals);
      case 'un': {
        const v = this.eval(node.e, locals);
        if (node.op === 'not') return isTrue(v) ? 0 : 1;
        if (typeof v !== 'number') throw new AlgoError(`“${node.op}” needs a number, not ${typeName(v)}`);
        return node.op === '-' ? -v : v;
      }
      case 'fact': {
        const v = this.eval(node.e, locals);
        if (typeof v !== 'number') throw new AlgoError('“!” needs a number');
        return factorial(v);
      }
      case 'bin': {
        if (node.op === '&') return isTrue(this.eval(node.l, locals)) && isTrue(this.eval(node.r, locals)) ? 1 : 0;
        if (node.op === '|') return isTrue(this.eval(node.l, locals)) || isTrue(this.eval(node.r, locals)) ? 1 : 0;
        return binary(node.op, this.eval(node.l, locals), this.eval(node.r, locals));
      }
      case 'call': return this.call(node, locals);
    }
    throw new AlgoError('Unknown expression');
  }

  lookup(name, locals) {
    if (locals?.has(name)) return locals.get(name);
    if (this.vars.has(name)) return this.vars.get(name);
    const lower = name.toLowerCase();
    if (lower === 'testversion') return this.version;
    if (lower in CONSTANTS) return CONSTANTS[lower];
    if (this.funcs.has(name) || FUNCTIONS[lower]) throw new AlgoError(`“${name}” is a function; call it with parentheses`);
    throw new AlgoError(`“${name}” isn’t defined`);
  }

  call(node, locals) {
    const user = this.funcs.get(node.name);
    if (user) {
      if (node.args.length !== user.params.length) {
        throw new AlgoError(`${node.name}() takes ${user.params.length} argument${user.params.length === 1 ? '' : 's'}`);
      }
      if (++this.depth > MAX_DEPTH) throw new AlgoError(`${node.name}() calls itself too deeply`);
      try {
        const args = node.args.map((a) => this.eval(a, locals));
        return this.eval(user.expr, new Map(user.params.map((p, i) => [p, args[i]])));
      } finally {
        this.depth--;
      }
    }
    const fn = FUNCTIONS[node.name.toLowerCase()];
    if (!fn) throw new AlgoError(`Unknown function “${node.name}”`);
    const n = node.args.length;
    if (n < fn.min || n > fn.max) {
      const want = fn.min === fn.max ? fn.min : fn.max === Infinity ? `${fn.min} or more` : `${fn.min} to ${fn.max}`;
      throw new AlgoError(`${fn.name}() takes ${want} argument${want === 1 ? '' : 's'}`);
    }
    if (fn.lazy) {
      // if(condition, a, b): only the chosen branch is evaluated
      return isTrue(this.eval(node.args[0], locals)) ? this.eval(node.args[1], locals) : this.eval(node.args[2], locals);
    }
    const args = node.args.map((a) => this.eval(a, locals));
    const result = fn.impl.apply(this, args);
    if (typeof result === 'number' && Number.isNaN(result)) throw new AlgoError(`${fn.name}(): result isn’t a number`);
    return result;
  }
}

// ---- programs -----------------------------------------------------------------------

const programCache = new Map();

// Parse and order a script. Errors are reported with line numbers.
export function compile(source) {
  const key = String(source || '');
  if (programCache.has(key)) return programCache.get(key);
  const { defs, errors } = parseProgram(key);
  const funcs = new Map(defs.filter((d) => d.kind === 'func').map((d) => [d.name, d]));
  const vars = defs.filter((d) => d.kind === 'var');
  const conds = defs.filter((d) => d.kind === 'cond');
  const unique = defs.filter((d) => d.kind === 'unique').flatMap((d) => d.names);

  // Variables each variable depends on, following calls into user functions.
  const varNames = new Set(vars.map((v) => v.name));
  const depsOf = (expr, seenFuncs = new Set()) => {
    const { ids, calls } = references(expr);
    const deps = new Set([...ids].filter((id) => varNames.has(id)));
    for (const c of calls) {
      const f = funcs.get(c);
      if (f && !seenFuncs.has(c)) {
        seenFuncs.add(c);
        for (const d of depsOf(f.expr, seenFuncs)) if (!f.params.includes(d)) deps.add(d);
      }
    }
    return deps;
  };

  // Topological order so definitions can appear in any order.
  const order = [];
  const state = new Map();
  const byName = new Map(vars.map((v) => [v.name, v]));
  const visit = (v, path) => {
    if (state.get(v.name) === 'done') return;
    if (state.get(v.name) === 'active') {
      errors.push({ line: v.line, message: `Circular definition: ${[...path, v.name].join(' → ')}` });
      return;
    }
    state.set(v.name, 'active');
    for (const d of depsOf(v.expr)) visit(byName.get(d), [...path, v.name]);
    state.set(v.name, 'done');
    order.push(v);
  };
  for (const v of vars) visit(v, []);
  for (const u of unique) if (!varNames.has(u)) errors.push({ line: null, message: `unique: “${u}” isn’t a variable` });

  const program = { source: key, vars: order, funcs, conds, unique, errors, formats: new Map(vars.map((v) => [v.name, v.format])) };
  if (programCache.size > 300) programCache.clear();
  programCache.set(key, program);
  return program;
}

// Run a script with a seed. Returns { values, formats, attempts, error }.
// If conditions fail, all values are redrawn (the random stream continues).
export function run(source, { seed = 'preview', version = 'A', parent = null } = {}) {
  const program = typeof source === 'object' ? source : compile(source);
  const result = { values: new Map(), formats: new Map(program.formats), attempts: 0, error: null, program };
  if (parent) for (const [k, f] of parent.formats) if (!result.formats.has(k)) result.formats.set(k, f);
  if (program.errors.length) {
    result.error = program.errors[0];
    return result;
  }
  const rng = makeRng(`${seed}`);
  const funcs = new Map([...(parent?.program.funcs || []), ...program.funcs]);
  let failed = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    result.attempts = attempt;
    const vars = new Map(parent?.values || []);
    const ctx = new Context({ rng, version, funcs, vars });
    let current = null;
    try {
      for (const v of program.vars) {
        current = v;
        const value = ctx.eval(v.expr);
        vars.set(v.name, typeof value === 'number' ? clean(value) : value);
      }
      failed = null;
      for (const c of program.conds) {
        current = c;
        if (!isTrue(ctx.eval(c.expr))) {
          failed = c;
          break;
        }
      }
    } catch (err) {
      if (!(err instanceof AlgoError)) throw err;
      result.error = { line: current?.line ?? null, message: err.message };
      return result;
    }
    if (!failed) {
      result.values = vars;
      result.ctx = ctx;
      return result;
    }
  }
  result.error = { line: failed.line, message: `Condition “${failed.source}” was never true in ${MAX_ATTEMPTS} tries` };
  return result;
}

// Evaluate one expression against a finished run (used by [[= …]]).
export function evaluateIn(runResult, exprText) {
  const ctx = runResult.ctx || new Context({ rng: makeRng('inline'), funcs: runResult.program.funcs, vars: runResult.values });
  return ctx.eval(parseExpression(exprText));
}

// Evaluate a parsed expression against a run, with extra local variables (e.g. x for graphs).
export function evaluateTree(runResult, tree, locals = new Map()) {
  const ctx = new Context({ rng: makeRng('graph'), funcs: runResult.program?.funcs ?? new Map(), vars: runResult.values ?? new Map() });
  return ctx.eval(tree, locals);
}

// ---- placeholders -------------------------------------------------------------------

// Resolve the inside of a [[…]] placeholder: "name", "name :: fmt", "= expr", "= expr :: fmt".
// Returns { latex, text } or { error }.
export function resolvePlaceholder(runResult, content) {
  try {
    const [body, fmtText] = splitFormat(content);
    const fmtOverride = fmtText === null ? null : parseFormat(fmtText);
    const trimmed = body.trim();
    let value;
    let fmt = fmtOverride;
    if (trimmed.startsWith('=')) {
      if (runResult.error) throw new AlgoError('Algorithm has an error');
      value = evaluateIn(runResult, trimmed.slice(1));
    } else {
      if (!/^[A-Za-z]\w*$/.test(trimmed)) throw new AlgoError(`“${trimmed}” isn’t a variable name (use [[= …]] for an expression)`);
      if (runResult.error) throw new AlgoError('Algorithm has an error');
      if (!runResult.values.has(trimmed)) {
        if (trimmed.toLowerCase() === 'testversion') value = runResult.ctx?.version ?? 'A';
        else throw new AlgoError(`“${trimmed}” isn’t defined`);
      } else {
        value = runResult.values.get(trimmed);
      }
      fmt = fmtOverride ?? runResult.formats.get(trimmed) ?? null;
    }
    if (typeof value === 'number') value = clean(value);
    return formatValue(value, fmt);
  } catch (err) {
    if (!(err instanceof AlgoError)) throw err;
    return { error: err.message };
  }
}

// Replace [[…]] in plain text (not rendered), e.g. a numeric answer.
export function resolvePlainText(runResult, text) {
  return String(text ?? '').replace(/\[\[(.+?)\]\]/g, (_, content) => {
    const [body, fmtText] = splitFormat(content);
    try {
      const trimmed = body.trim();
      const fmt = fmtText === null ? (trimmed.startsWith('=') ? null : runResult.formats.get(trimmed)) : parseFormat(fmtText);
      const value = trimmed.startsWith('=') ? evaluateIn(runResult, trimmed.slice(1)) : runResult.values.get(trimmed);
      if (value === undefined) return `[[${content}]]`;
      return plainText(typeof value === 'number' ? clean(value) : value, fmt);
    } catch {
      return `[[${content}]]`;
    }
  });
}

// ---- questions ------------------------------------------------------------------------

const PLACEHOLDER = /\[\[(.+?)\]\]/g;

export function hasPlaceholders(text) {
  return /\[\[.+?\]\]/.test(String(text ?? ''));
}

// Texts in a question that may contain placeholders.
export function questionTexts(q) {
  const texts = [['Question', q.stem], ['Rationale', q.rationale]];
  if (q.choices) q.choices.forEach((c, i) => texts.push([`Choice ${'ABCDEFGH'[i]}`, c.text]));
  if (q.pairs) q.pairs.forEach((p, i) => texts.push([`Item ${i + 1}`, p.prompt]));
  if (q.type === 'num') {
    texts.push(['Answer', q.answer.value]);
    q.answer.accepted.forEach((a) => texts.push(['Accepted answer', a]));
  }
  if (q.type === 'essay') texts.push(['Model answer', q.answer.model]);
  return texts;
}

export function isDynamic(q) {
  return Boolean(q.algorithm?.trim()) || questionTexts(q).some(([, t]) => hasPlaceholders(t));
}

const instanceCache = new Map();

// Values for one question with one seed. `seed` defaults to the question id
// so a question looks the same every time it's previewed.
// Values for a narrative's own algorithm (shared by its questions).
export function narrativeRun(narrative, version = 'A') {
  if (!narrative) return null;
  const key = `N\u0000${narrative.algorithm || ''}\u0000${narrative.seed}\u0000${version}`;
  let r = instanceCache.get(key);
  if (!r) {
    r = run(narrative.algorithm || '', { seed: narrative.seed, version });
    instanceCache.set(key, r);
  }
  return r;
}

// Values for one question with one seed. `seed` defaults to the question id
// so a question looks the same every time it's previewed. A narrative
// ({ algorithm, seed }) supplies shared variables.
export function instantiate(q, { seed = q.id, version = 'A', narrative = null } = {}) {
  const parent = narrative?.algorithm?.trim() ? narrativeRun(narrative, version) : null;
  const key = `${q.algorithm || ''}\u0000${seed}\u0000${version}\u0000${parent ? `${narrative.algorithm}\u0000${narrative.seed}` : ''}`;
  let runResult = instanceCache.get(key);
  if (!runResult) {
    if (parent?.error) {
      runResult = { ...parent, error: { line: parent.error.line, message: `Narrative algorithm: ${parent.error.message}` } };
    } else {
      runResult = run(q.algorithm || '', { seed, version, parent });
    }
    if (instanceCache.size > 500) instanceCache.clear();
    instanceCache.set(key, runResult);
  }
  return {
    run: runResult,
    dynamic: isDynamic(q) || Boolean(parent),
    error: runResult.error,
    resolve: Object.assign((content) => resolvePlaceholder(runResult, content), { run: runResult }),
    plain: (text) => resolvePlainText(runResult, text),
  };
}

// Problems with a question's algorithm and placeholders, for validation.
export function algorithmProblems(q, inst = instantiate(q)) {
  const problems = [];
  if (inst.error) problems.push(`Algorithm${inst.error.line ? ` line ${inst.error.line}` : ''}: ${inst.error.message}`);
  else {
    for (const [where, text] of questionTexts(q)) {
      for (const m of String(text ?? '').matchAll(PLACEHOLDER)) {
        const r = inst.resolve(m[1]);
        if (r.error) problems.push(`${where}: [[${m[1]}]]: ${r.error}`);
      }
    }
  }
  return problems;
}
