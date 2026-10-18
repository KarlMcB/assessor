// Data model: factories, type conversion, validation and file normalization.
// Everything here is plain data (JSON-serializable); no DOM access.

export const LIBRARY_FORMAT = 'assessor-library';
export const BANK_FORMAT = 'assessor-bank';
export const FORMAT_VERSION = 1;

export const QUESTION_TYPES = {
  tf: { label: 'True/False', short: 'T/F' },
  mc: { label: 'Multiple Choice', short: 'MC', choices: true },
  mr: { label: 'Multiple Response', short: 'MR', choices: true },
  num: { label: 'Numeric Response', short: 'Num' },
  essay: { label: 'Short Answer / Problem / Essay', short: 'SA' },
};

// Order in which type groups appear in a bank or test.
export const TYPE_ORDER = ['tf', 'mc', 'mr', 'num', 'essay'];

export const ESSAY_KINDS = { short: 'Short Answer', problem: 'Problem', essay: 'Essay' };

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 8;

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function now() {
  return new Date().toISOString();
}

export function defaultSettings() {
  return {
    defaultPoints: { tf: 1, mc: 1, mr: 1, num: 1, essay: 5 },
    defaultChoices: 4,
    backupReminderDays: 3,
  };
}

export function newLibrary() {
  const t = now();
  return {
    format: LIBRARY_FORMAT,
    version: FORMAT_VERSION,
    created: t,
    modified: t,
    banks: [],
    tests: [],
    images: {},
    settings: defaultSettings(),
  };
}

export function newBank(title = 'Untitled bank', subtitle = '') {
  const t = now();
  return { id: newId(), title, subtitle, questions: [], narratives: [], matchingGroups: [], created: t, modified: t };
}

export function emptyMeta() {
  return { difficulty: '', reference: '', objectives: [], standards: [], topic: '', keywords: [], notes: '', misc: '' };
}

export function newChoice(text = '') {
  return { id: newId(), text, correct: false, lockPosition: false };
}

function typeFields(type, settings) {
  switch (type) {
    case 'mc':
    case 'mr': {
      const n = clamp(settings.defaultChoices ?? 4, MIN_CHOICES, MAX_CHOICES);
      return { choices: Array.from({ length: n }, () => newChoice()), columns: 1 };
    }
    case 'tf':
      return { answer: true };
    case 'num':
      return { answer: { value: '', unit: '', tolerance: '', toleranceType: 'abs', accepted: [] } };
    case 'essay':
      return { kind: 'short', answer: { model: '' }, answerLines: 4 };
    default:
      throw new Error(`Unknown question type: ${type}`);
  }
}

export function newQuestion(type, settings = defaultSettings()) {
  const t = now();
  return {
    id: newId(),
    type,
    stem: '',
    ...typeFields(type, settings),
    rationale: '',
    points: settings.defaultPoints?.[type] ?? 1,
    narrativeId: null,
    meta: emptyMeta(),
    flags: { doNotUse: false, alwaysOneColumn: false },
    created: t,
    modified: t,
  };
}

// Change a question's type, keeping everything that still makes sense.
export function changeType(q, type, settings = defaultSettings()) {
  if (q.type === type) return q;
  const fresh = typeFields(type, settings);
  const out = { ...stripTypeFields(q), type, ...fresh };
  const fromChoices = QUESTION_TYPES[q.type].choices;
  const toChoices = QUESTION_TYPES[type].choices;
  if (fromChoices && toChoices) {
    out.choices = q.choices.map((c) => ({ ...c }));
    out.columns = q.columns ?? 1;
    if (type === 'mc') {
      // single answer: keep only the first correct choice
      let seen = false;
      for (const c of out.choices) {
        if (c.correct && !seen) seen = true;
        else c.correct = false;
      }
    }
  }
  return out;
}

function stripTypeFields(q) {
  const { choices, columns, answer, kind, answerLines, ...rest } = q;
  return rest;
}

export function duplicateQuestion(q) {
  const copy = structuredClone(q);
  copy.id = newId();
  copy.created = copy.modified = now();
  if (copy.choices) copy.choices.forEach((c) => (c.id = newId()));
  return copy;
}

// A number as typed by the teacher: integer, decimal, scientific (6.02e23) or fraction (1/3).
export function parseNumber(text) {
  const s = String(text ?? '').trim().replace(/−/g, '-').replace(/,/g, '');
  if (s === '') return NaN;
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

// Returns a list of human-readable problems. An empty list means the question is complete.
export function validateQuestion(q) {
  const problems = [];
  if (!q.stem.trim()) problems.push('Question text is empty.');
  if (!(Number(q.points) >= 0)) problems.push('Points must be zero or more.');
  switch (q.type) {
    case 'mc':
    case 'mr': {
      const filled = q.choices.filter((c) => c.text.trim());
      if (filled.length < MIN_CHOICES) problems.push(`Needs at least ${MIN_CHOICES} choices with text.`);
      if (q.choices.some((c) => !c.text.trim())) problems.push('Some choices are empty.');
      const correct = q.choices.filter((c) => c.correct).length;
      if (q.type === 'mc' && correct !== 1) problems.push('Mark exactly one correct choice.');
      if (q.type === 'mr' && correct < 1) problems.push('Mark at least one correct choice.');
      break;
    }
    case 'num': {
      if (Number.isNaN(parseNumber(q.answer.value))) problems.push('Answer must be a number (e.g. 25, -4.9, 6.02e23 or 1/3).');
      const tol = q.answer.tolerance;
      if (String(tol).trim() !== '' && !(parseNumber(tol) >= 0)) problems.push('Tolerance must be a number zero or more.');
      break;
    }
    case 'essay':
      break;
  }
  return problems;
}

export function sortedByType(questions) {
  return TYPE_ORDER.map((type) => ({ type, questions: questions.filter((q) => q.type === type) })).filter(
    (g) => g.questions.length,
  );
}

// ---- image references ------------------------------------------------------

const IMG_REF = /!\[[^\]]*\]\(img:([a-z0-9]+)(?:\|\d+)?\)/g;

function textsOf(q) {
  const texts = [q.stem, q.rationale];
  if (q.choices) texts.push(...q.choices.map((c) => c.text));
  if (q.type === 'essay') texts.push(q.answer.model);
  return texts;
}

export function imageRefsInBank(bank) {
  const ids = new Set();
  for (const q of bank.questions) for (const t of textsOf(q)) for (const m of t.matchAll(IMG_REF)) ids.add(m[1]);
  for (const n of bank.narratives) for (const m of (n.body || '').matchAll(IMG_REF)) ids.add(m[1]);
  return ids;
}

export function imageRefsInLibrary(lib) {
  const ids = new Set();
  for (const b of lib.banks) for (const id of imageRefsInBank(b)) ids.add(id);
  for (const t of lib.tests) for (const item of t.items || []) for (const s of textsOf(item.question)) for (const m of s.matchAll(IMG_REF)) ids.add(m[1]);
  return ids;
}

export function pruneImages(lib) {
  const used = imageRefsInLibrary(lib);
  for (const id of Object.keys(lib.images)) if (!used.has(id)) delete lib.images[id];
}

// ---- files -------------------------------------------------------------------

// Validate a parsed library file and fill in anything missing. Throws on files that aren't libraries.
export function normalizeLibrary(data) {
  if (!data || data.format !== LIBRARY_FORMAT) throw new Error('This file is not an assessor library.');
  if (data.version > FORMAT_VERSION) throw new Error('This library was saved by a newer version of assessor.');
  const lib = { ...newLibrary(), ...data };
  lib.settings = { ...defaultSettings(), ...data.settings, defaultPoints: { ...defaultSettings().defaultPoints, ...data.settings?.defaultPoints } };
  lib.banks = (data.banks || []).map(normalizeBank);
  lib.tests = data.tests || [];
  lib.images = data.images || {};
  return lib;
}

export function normalizeBank(b) {
  const bank = { ...newBank(), ...b };
  bank.questions = (b.questions || []).map(normalizeQuestion);
  bank.narratives = b.narratives || [];
  bank.matchingGroups = b.matchingGroups || [];
  return bank;
}

export function normalizeQuestion(q) {
  if (!QUESTION_TYPES[q.type]) throw new Error(`Unknown question type "${q.type}".`);
  const base = newQuestion(q.type);
  const out = { ...base, ...q };
  out.meta = { ...emptyMeta(), ...q.meta };
  out.flags = { ...base.flags, ...q.flags };
  if (q.type === 'num') out.answer = { ...base.answer, ...q.answer };
  if (q.type === 'essay') out.answer = { ...base.answer, ...q.answer };
  return out;
}

export function bankFile(lib, bank) {
  const images = {};
  for (const id of imageRefsInBank(bank)) if (lib.images[id]) images[id] = lib.images[id];
  return { format: BANK_FORMAT, version: FORMAT_VERSION, exported: now(), bank, images };
}

export function readBankFile(data) {
  if (!data || data.format !== BANK_FORMAT) throw new Error('This file is not an assessor bank.');
  if (data.version > FORMAT_VERSION) throw new Error('This bank was saved by a newer version of assessor.');
  return { bank: normalizeBank(data.bank), images: data.images || {} };
}

// ---- helpers -----------------------------------------------------------------

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function splitList(text) {
  return String(text || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function questionCountLabel(n) {
  return `${n} question${n === 1 ? '' : 's'}`;
}
