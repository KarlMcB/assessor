// Print layout settings (saved with each test) and print options.

export const DEFAULT_INSTRUCTIONS = {
  tf: 'Indicate whether each statement is true or false.',
  mc: 'Identify the choice that best completes the statement or answers the question.',
  mr: 'Identify one or more choices that best complete the statement or answer the question.',
  num: 'Write the answer in the space provided. Include units where needed.',
  essay: 'Answer each question in the space provided. Show your work.',
};

export const DEFAULT_LAYOUT = {
  paper: 'letter', // letter | a4
  margin: 0.75, // inches
  columns: 1,
  columnRule: false,
  sectionRule: false,
  fontFamily: 'serif',
  fontSize: 12, // pt
  headerFirst: '**{title}**  ·  Version {version}',
  headerRest: '{title}  ·  Version {version}',
  footer: 'Page {page} of {pages}',
  nameLine: true,
  nameLineText: 'Name: ____________________________   Class: ___________   Date: ___________',
  startNumber: 1,
  restartNumbering: false,
  typeNewPage: false,
  questionSpacing: 12, // pt
  answerBlanks: true, // ____ 1. before objective questions
  essayLines: true, // ruled lines (otherwise blank space)
  choiceStyle: 'A.', // A. | a. | (a) | 1.
  alternateChoices: false, // A–D then F–J on alternate questions
  tfAsChoices: false,
  points: 'hidden', // hidden | inline | line
  showInstructions: true,
  instructions: { ...DEFAULT_INSTRUCTIONS },
  key: { rationale: true, points: false, difficulty: false, reference: false, topic: false, standards: false, objectives: false, keywords: false },
};

export const DEFAULT_PRINT = {
  versions: 1,
  keepAOriginal: true,
  scrambleSections: false,
  scrambleQuestions: true,
  scrambleChoices: true,
  recalc: true,
  includeTests: true,
  includeKeys: true,
  includeStrip: false,
  includeMap: true,
  interleave: false, // each test followed by its key
};

export const PAPER = {
  letter: { width: 8.5, height: 11, label: 'US Letter' },
  a4: { width: 8.27, height: 11.69, label: 'A4' },
};

export const FONTS = {
  serif: { label: 'Times', css: '"Times New Roman", Times, serif' },
  georgia: { label: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
  sans: { label: 'Helvetica', css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
};

export function normalizeLayout(layout, defaults = DEFAULT_LAYOUT) {
  const base = { ...DEFAULT_LAYOUT, ...defaults };
  return {
    ...base,
    ...layout,
    instructions: { ...DEFAULT_INSTRUCTIONS, ...defaults?.instructions, ...layout?.instructions },
    key: { ...DEFAULT_LAYOUT.key, ...defaults?.key, ...layout?.key },
  };
}

export function normalizePrint(opts) {
  const o = { ...DEFAULT_PRINT, ...opts };
  o.versions = Math.min(26, Math.max(1, Math.round(Number(o.versions) || 1)));
  return o;
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALT_LETTERS = 'FGHJKLMNPQ'; // skips I and O, as on standardized answer sheets

// Label for choice i of the question with this number, e.g. "B." or "(b)".
export function choiceLabel(i, number, layout) {
  const style = layout.choiceStyle;
  if (style === '1.') return `${i + 1}.`;
  const alternate = layout.alternateChoices && number % 2 === 0;
  let letter = alternate ? ALT_LETTERS[i] ?? LETTERS[i] : LETTERS[i];
  if (style === 'a.' || style === '(a)') letter = letter.toLowerCase();
  return style === '(a)' ? `(${letter})` : `${letter}.`;
}

// Bare letter (no punctuation) for answer keys.
export function choiceKey(i, number, layout) {
  return choiceLabel(i, number, layout).replace(/[.()]/g, '');
}

// Alternating letters only make sense with up to 5 choices.
export function alternationAllowed(questions) {
  return questions.every((q) => !q.choices || q.choices.length <= 5);
}

export function fillTokens(text, values) {
  return String(text || '').replace(/\{(title|version|page|pages|date)\}/g, (_, k) => values[k] ?? '');
}
