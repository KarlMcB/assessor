// Parse ExamView Import Utility documents: a title line, question type labels,
// numbered questions, ANS: lines with tags, and NARRBEGIN/NARREND narratives.
// Takes the lines from rtf.js, so this file knows nothing about RTF itself.

import { newChoice, newId, newNarrative, newPair, newQuestion, parseNumber, splitList, validateQuestion } from '../model.js';

const SECTIONS = {
  'true/false': { type: 'tf' },
  'modified true/false': { type: 'mtf' },
  'multiple choice': { type: 'mc' },
  'multiple response': { type: 'mr' },
  bimodal: { type: 'bimodal' },
  'yes/no': { type: 'yn' },
  completion: { type: 'comp' },
  matching: { type: 'match' },
  'numeric response': { type: 'num' },
  'short answer': { type: 'essay', kind: 'short' },
  problem: { type: 'essay', kind: 'problem' },
  essay: { type: 'essay', kind: 'essay' },
  case: { type: 'essay', kind: 'case' },
  other: { type: 'essay', kind: 'other' },
};
const CHOICE_TYPES = new Set(['mc', 'mr', 'bimodal']);
const TAG = /(?:^|\s)(PTS|DIF|REF|OBJ|NAT|STA|LOC|TOP|KEY|MSC|NOT|NAR):\s*/g;
const NUMBERED = /^(\d+)(?:[.):]\s*|\s+)(.*)$/;

const plain = (t) => t.replace(/\*\*/g, '').trim();
const sectionOf = (t) => {
  const key = plain(t).replace(/:$/, '').toLowerCase();
  return Object.hasOwn(SECTIONS, key) ? { ...SECTIONS[key], label: plain(t).replace(/:$/, '') } : null;
};

// Split "C PTS: 1 REF: Q1" into the answer and its tags.
function parseTags(text) {
  const tags = {};
  const found = [...text.matchAll(TAG)];
  for (let i = 0; i < found.length; i++) {
    const value = text.slice(found[i].index + found[i][0].length, found[i + 1]?.index ?? text.length).trim();
    tags[found[i][1]] = tags[found[i][1]] ? `${tags[found[i][1]]}; ${value}` : value;
  }
  return { answer: (found.length ? text.slice(0, found[0].index) : text).trim(), tags };
}

function applyTags(q, tags, settings) {
  const m = q.meta;
  const points = parseNumber(tags.PTS);
  if (points >= 0) q.points = points;
  if (tags.DIF) m.difficulty = tags.DIF;
  if (tags.REF) m.reference = tags.REF;
  if (tags.OBJ) m.objectives = splitList(tags.OBJ);
  if (tags.TOP) m.topic = tags.TOP;
  if (tags.KEY) m.keywords = splitList(tags.KEY);
  if (tags.MSC) m.misc = tags.MSC;
  if (tags.NOT) m.notes = tags.NOT;
  m.standards = [tags.NAT, tags.STA, tags.LOC].filter(Boolean).flatMap((s) => splitList(s));
}

const paragraphs = (lines) => {
  let out = '';
  lines.forEach((l, i) => {
    if (i) out += l.table && lines[i - 1].table ? '\n' : '\n\n';
    out += l.text;
  });
  return out.trim();
};

// Bold headings in the first row of a table are redundant once it's a header row.
export function withTableHeaders(lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (line.table && !lines[i - 1]?.table) {
      const head = line.text.replace(/\*\*/g, '');
      out.push({ ...line, text: head }, { ...line, text: `|${head.split('|').slice(1, -1).map(() => ' --- ').join('|')}|` });
    } else out.push(line);
  });
  return out;
}

function letters(text) {
  const t = plain(text);
  if (/^[a-z]+$/i.test(t)) return t.toUpperCase().split('');
  if (/^[a-z](?:(?:\s*[,;&]\s*|\s+)(?:and\s+)?[a-z])*$/i.test(t)) return t.toUpperCase().match(/\b[A-Z]\b/g) ?? [];
  return [];
}

// Set a question's answer from its ANS: text. Returns an error message or null.
function setAnswer(q, answer) {
  const t = plain(answer);
  switch (q.type) {
    case 'tf':
      if (/^(t|true)\.?$/i.test(t)) q.answer = true;
      else if (/^(f|false)\.?$/i.test(t)) q.answer = false;
      else return `“${t}” isn’t True or False`;
      return null;
    case 'yn':
      if (/^(y|yes)\.?$/i.test(t)) q.answer = true;
      else if (/^(n|no)\.?$/i.test(t)) q.answer = false;
      else return `“${t}” isn’t Yes or No`;
      return null;
    case 'mtf': {
      const f = answer.trim().match(/^(?:\*\*)?(f|false)\b(?:\*\*)?[\s,.:;–-]*(.*)$/i);
      if (/^(t|true)\.?$/i.test(t)) q.answer = { value: true, correction: '' };
      else if (f) q.answer = { value: false, correction: f[2].trim() };
      else return `“${t}” isn’t True or False`;
      return null;
    }
    case 'mc':
    case 'bimodal':
    case 'mr': {
      const picks = q.type === 'mr' ? letters(t) : (t.match(/^[a-z]\b/i) ?? []).map((l) => l.toUpperCase());
      if (!picks.length) return `“${t}” isn’t an answer letter`;
      for (const l of picks) {
        const c = q.choices[l.charCodeAt(0) - 65];
        if (!c) return `answer ${l} has no matching choice`;
        c.correct = true;
      }
      return null;
    }
    case 'num': {
      const m = t.match(/^([-+−]?(?:\d[\d,]*\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(.*)$/i);
      if (!m || Number.isNaN(parseNumber(m[1]))) return `“${t}” doesn’t start with a number`;
      q.answer.value = m[1].replace(/\s+/g, '');
      q.answer.unit = m[2];
      return null;
    }
    case 'comp': {
      q.answer.accepted = answer.split(/\s*[;|]\s*|\s+or\s+|,\s+/i).map((a) => a.trim()).filter(Boolean);
      return q.answer.accepted.length ? null : 'it has no answer';
    }
    case 'essay':
      q.answer.model = answer.trim();
      return null;
    default:
      return null;
  }
}

// lines: [{ text, table }]. Returns { title, subtitle, questions, narratives, skipped, notes }.
export function parseExamView(rawLines, { settings, fileName = '' } = {}) {
  const lines = withTableHeaders(rawLines);
  const questions = [];
  const narratives = [];
  const skipped = [];
  const notes = { converted: [], review: [], ignored: 0 };
  const byName = new Map();
  const unresolved = [];

  let index = 0;
  const skipBlank = () => { while (index < lines.length && !lines[index].text.trim()) index++; };
  skipBlank();
  let title = '';
  let subtitle = '';
  const isStructure = (t) => sectionOf(t) || /^NARRBEGIN:/i.test(plain(t)) || /^ANS:/.test(plain(t)) || NUMBERED.test(plain(t));
  if (index < lines.length && !isStructure(lines[index].text)) title = plain(lines[index++].text).replace(/\*/g, '');
  skipBlank();
  if (index < lines.length && title && !isStructure(lines[index].text)) subtitle = plain(lines[index++].text).replace(/\*/g, '');
  title ||= fileName.replace(/\.[^.]+$/, '') || 'Imported bank';

  let section = null;
  let cur = null;
  let group = null;
  let last = 0;
  let narrative = null;
  let blank = false;

  const where = (num, ref) => `${num} in ${section?.label ?? 'no section'}${ref ? ` (${ref})` : ''}`;
  const refOf = (tags) => tags?.REF ?? '';

  const linkNarrative = (q, tags, label) => {
    if (!tags.NAR) return;
    const n = byName.get(tags.NAR.toLowerCase());
    if (n) q.narrativeId = n.id;
    else unresolved.push({ q, name: tags.NAR, label });
  };

  const finishQuestion = () => {
    if (!cur) return;
    const c = cur;
    cur = null;
    const label = where(c.num, refOf(c.tags));
    if (!c.answered) {
      skipped.push({ number: label, reason: 'it has no ANS: line' });
      return;
    }
    const q = newQuestion(section.type, settings);
    q.stem = paragraphs(c.stem);
    if (section.kind) q.kind = section.kind;
    if (CHOICE_TYPES.has(section.type)) {
      q.choices = c.choices.map((ch) => ({ ...newChoice(ch.text), lockPosition: ch.locked }));
    }
    let answer = c.answer;
    const extra = paragraphs(c.extra);
    if (section.type === 'essay' && extra) answer = answer ? `${answer}\n\n${extra}` : extra;
    else if (extra) q.rationale = extra;
    const error = setAnswer(q, answer);
    if (error) {
      skipped.push({ number: label, reason: error });
      return;
    }
    applyTags(q, c.tags, settings);
    linkNarrative(q, c.tags, label);
    if (c.tags.NOT) notes.review.push({ number: label, note: c.tags.NOT });
    for (const p of validateQuestion(q)) notes.converted.push({ number: label, note: p });
    questions.push(q);
  };

  const finishGroup = () => {
    if (!group) return;
    const g = group;
    group = null;
    if (!g.prompts.length) {
      if (g.instructions.length || g.choices.length) skipped.push({ number: where(last + 1), reason: 'a matching group with no numbered items' });
      return;
    }
    const label = where(g.prompts[0].num, refOf(g.answers[0]?.tags));
    if (g.answers.length !== g.prompts.length) {
      skipped.push({ number: label, reason: `a matching group with ${g.prompts.length} items but ${g.answers.length} answers` });
      return;
    }
    const q = newQuestion('match', settings);
    q.stem = paragraphs(g.instructions) || 'Match each item with the correct choice.';
    q.choices = g.choices.map((text) => ({ id: newId(), text }));
    q.pairs = [];
    for (let i = 0; i < g.prompts.length; i++) {
      const choice = q.choices[plain(g.answers[i].answer).toUpperCase().charCodeAt(0) - 65];
      if (!choice) {
        skipped.push({ number: where(g.prompts[i].num), reason: `answer “${g.answers[i].answer}” has no matching choice` });
        return;
      }
      q.pairs.push(newPair(g.prompts[i].text, choice.id));
    }
    const tags = g.answers[0].tags;
    applyTags(q, tags, settings);
    const pts = g.answers.map((a) => parseNumber(a.tags.PTS)).filter((n) => n >= 0);
    if (pts.length) q.points = pts.reduce((a, b) => a + b, 0);
    linkNarrative(q, tags, label);
    const remarks = g.answers.map((a) => a.tags.NOT).filter(Boolean);
    if (remarks.length) notes.review.push({ number: label, note: remarks.join('; ') });
    questions.push(q);
  };

  const finishAll = () => { finishQuestion(); finishGroup(); };

  for (; index < lines.length; index++) {
    const line = lines[index];
    const t = line.text.trim();
    const bare = plain(t);

    if (narrative) {
      if (/^NARREND\b/i.test(bare)) {
        narrative.body = paragraphs(narrative.lines);
        delete narrative.lines;
        narrative = null;
      } else if (t) narrative.lines.push({ text: t, table: line.table });
      blank = false;
      continue;
    }
    if (!t) { blank = true; continue; }

    const isTable = line.table;
    const next = isTable ? null : sectionOf(t);
    if (next) {
      finishAll();
      section = next;
      blank = false;
      continue;
    }
    const narr = isTable ? null : bare.match(/^NARRBEGIN:\s*(.*)$/i);
    if (narr) {
      finishAll();
      narrative = { ...newNarrative(narr[1].trim() || `Narrative ${narratives.length + 1}`), lines: [] };
      narratives.push(narrative);
      byName.set(narrative.title.toLowerCase(), narrative);
      blank = false;
      continue;
    }

    if (section?.type === 'match') {
      readMatching(t, bare, isTable);
      blank = false;
      continue;
    }

    const num = isTable ? null : bare.match(NUMBERED);
    if (num) {
      const n = Number(num[1]);
      const inOrder = n === last + 1 || n === 1;
      // Answers can run over several lines, so a bare "2 more lines" doesn't end one.
      const punctuated = /^\d+[.):]/.test(bare);
      const starts = !cur || (cur.phase === 'answer' ? (inOrder && (blank || punctuated)) || (blank && n > last) : blank && inOrder);
      if (starts) {
        finishQuestion();
        last = n;
        if (!section) {
          skipped.push({ number: n, reason: 'it comes before any question type label' });
          blank = false;
          cur = null;
          continue;
        }
        cur = { num: n, phase: 'stem', stem: [], choices: [], extra: [], answer: '', answered: false, tags: {} };
        const first = t.replace(/^\*{0,2}\d+(?:[.):]\s*|\s+)/, '');
        if (first.trim()) cur.stem.push({ text: first, table: false });
        blank = false;
        continue;
      }
    }

    if (!cur) { notes.ignored++; blank = false; continue; }

    if (!isTable && /^ANS:/.test(bare) && cur.phase !== 'answer') {
      const { answer, tags } = parseTags(t.replace(/^\*{0,2}ANS:\*{0,2}\s*/, ''));
      cur.answer = answer;
      cur.tags = tags;
      cur.answered = true;
      cur.phase = 'answer';
      blank = false;
      continue;
    }

    if (cur.phase === 'answer') {
      const parsed = parseTags(t);
      if (!isTable && !parsed.answer) Object.assign(cur.tags, parsed.tags);
      else cur.extra.push({ text: t, table: isTable });
      blank = false;
      continue;
    }

    if (CHOICE_TYPES.has(section.type) && !isTable) {
      const parts = t.split(/\t+(?=\*{0,2}[a-zA-Z][.!)](?:\s|$))/);
      const parsedChoices = parts.map((p) => p.match(/^\*{0,2}([a-zA-Z])([.!)])(?:\*{0,2}\s+(.*)|\*{0,2}\s*)$/));
      const expected = String.fromCharCode(65 + cur.choices.length);
      if (parsedChoices[0] && parsedChoices[0][1].toUpperCase() === expected) {
        parsedChoices.forEach((m, i) => {
          if (m) cur.choices.push({ text: (m[3] ?? '').trim(), locked: m[2] === '!' });
          else if (cur.choices.length) cur.choices[cur.choices.length - 1].text += ` ${parts[i].trim()}`;
        });
        cur.phase = 'choices';
        blank = false;
        continue;
      }
    }

    if (cur.phase === 'choices') {
      if (cur.choices.length) cur.choices[cur.choices.length - 1].text += ` ${t.replace(/\t/g, ' ')}`;
    } else cur.stem.push({ text: t.replace(/\t/g, ' '), table: isTable });
    blank = false;
  }
  finishAll();

  function readMatching(t, bare, isTable) {
    if (group && group.phase === 'answers' && group.answers.length >= group.prompts.length && !/^ANS:/.test(bare)) {
      const tagOnly = parseTags(t);
      if (!tagOnly.answer && !isTable) {
        Object.assign(group.answers[group.answers.length - 1].tags, tagOnly.tags);
        return;
      }
      finishGroup();
    }
    group ??= { phase: 'instructions', instructions: [], choices: [], prompts: [], answers: [] };
    const g = group;
    if (/^ANS:/.test(bare) && !isTable) {
      g.phase = 'answers';
      const { answer, tags } = parseTags(t.replace(/^\*{0,2}ANS:\*{0,2}\s*/, ''));
      g.answers.push({ answer, tags });
      return;
    }
    if (g.phase === 'answers') {
      const tagOnly = parseTags(t);
      if (g.answers.length && !tagOnly.answer) Object.assign(g.answers[g.answers.length - 1].tags, tagOnly.tags);
      return;
    }
    const num = isTable ? null : bare.match(NUMBERED);
    if (g.phase !== 'instructions' && num) {
      g.phase = 'prompts';
      last = Number(num[1]);
      g.prompts.push({ num: last, text: t.replace(/^\*{0,2}\d+(?:[.):]\s*|\s+)/, '').trim() });
      return;
    }
    const choice = isTable ? null : t.match(/^\*{0,2}([a-zA-Z])[.!)]\*{0,2}\s+(.*)$/);
    if (g.phase !== 'prompts' && choice && choice[1].toUpperCase() === String.fromCharCode(65 + g.choices.length)) {
      g.phase = 'choices';
      g.choices.push(choice[2].trim());
      return;
    }
    if (g.phase === 'instructions') g.instructions.push({ text: t, table: isTable });
    else if (g.phase === 'choices') g.choices[g.choices.length - 1] += ` ${t}`;
    else g.prompts[g.prompts.length - 1].text += ` ${t}`;
  }

  for (const u of unresolved) {
    const n = byName.get(u.name.toLowerCase());
    if (n) u.q.narrativeId = n.id;
    else notes.converted.push({ number: u.label, note: `narrative “${u.name}” wasn’t found` });
  }
  for (const n of narratives) if (n.lines) { n.body = paragraphs(n.lines); delete n.lines; }

  return { title, subtitle, questions, narratives, skipped, notes };
}
