// Import text2qti plain-text quizzes (the Markdown-like format text2qti reads),
// plus a few assessor-only lines that text2qti itself would reject:
//
//   meta: topic = Kinematics; difficulty = Easy; standards = HS-PS2-1, HS-PS2-2
//   rationale: Explanation shown in answer keys
//   unit: m/s                       (numeric questions)
//   algorithm:                      (indented lines follow)
//       v = range(10, 20)
//   match: Velocity = m/s           (matching question: item = choice)
//   distractor: kg                  (extra matching choice)

import { newChoice, newId, newQuestion, parseNumber, splitList } from '../model.js';

const RE = {
  question: /^(\d+)\.\s+(.*)$/,
  choice: /^(\*?)([a-z])\)\s+(.*)$/,
  multi: /^\[(\*|\s)\]\s+(.*)$/,
  short: /^\*\s+(.*)$/,
  numeric: /^=\s+(.*)$/,
  essay: /^_{3,}\s*$/,
  upload: /^\^{3,}\s*$/,
  feedback: /^(\.\.\.|\+|-)\s+(.*)$/,
  points: /^points:\s*(.+)$/i,
  title: /^title:\s*(.*)$/i,
  header: /^(quiz title|quiz description|shuffle answers|show correct answers|one question at a time|cant go back|can't go back|feedback is shown|solutions sample groups|solutions randomize groups|solutions text|solutions remove groups):\s*(.*)$/i,
  group: /^(GROUP|END_GROUP)\s*$/,
  groupOpt: /^(pick|points per question):\s*(.*)$/i,
  text: /^text( title)?:\s*(.*)$/i,
  // assessor extensions
  meta: /^meta:\s*(.*)$/i,
  rationale: /^rationale:\s*(.*)$/i,
  unit: /^unit:\s*(.*)$/i,
  algorithm: /^algorithm:\s*$/i,
  match: /^match:\s*(.+?)\s*=\s*(.+)$/i,
  distractor: /^distractor:\s*(.+)$/i,
};

// images: Map of file name -> library image id (for ![alt](file.png))
export function parseText2qti(text, { settings, images = new Map() } = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const raw = []; // question blocks
  const skipped = [];
  const notes = { groups: 0, missingImages: new Set(), converted: [] };
  let cur = null;
  let pendingPoints = null;
  let mode = null; // 'stem' | 'choice' | 'algorithm' | 'feedback'
  let lastChoice = null;

  const startQuestion = (num, first) => {
    cur = { num, stem: [first], choices: [], multi: [], short: [], numeric: null, essay: false, upload: false, feedback: [], rationale: [], meta: {}, unit: '', algorithm: [], match: [], distractors: [], points: pendingPoints };
    pendingPoints = null;
    raw.push(cur);
    mode = 'stem';
    lastChoice = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    let m;
    if (mode === 'algorithm') {
      if (!t || /^\s{2,}|\t/.test(line)) {
        if (t) cur.algorithm.push(line.replace(/^(\s{4}|\t|\s{2})/, ''));
        continue;
      }
      mode = null;
    }
    if (!t) {
      if (mode === 'stem') cur.stem.push('');
      continue;
    }
    if (!cur && (m = t.match(RE.header))) {
      if (/quiz title/i.test(m[1])) title = m[2].trim();
      continue;
    }
    if ((m = t.match(RE.group))) { if (m[1] === 'GROUP') notes.groups++; mode = null; continue; }
    if (RE.groupOpt.test(t)) continue;
    if ((m = t.match(RE.points))) { pendingPoints = Number(m[1]); continue; }
    if ((m = t.match(RE.title))) continue;
    if ((m = t.match(RE.text))) { skipped.push({ number: '–', reason: 'text-only block (“Text:”)' }); mode = null; continue; }
    if ((m = t.match(RE.question))) { startQuestion(Number(m[1]), m[2]); continue; }
    if (!cur) continue;

    if ((m = t.match(RE.meta))) {
      for (const part of m[1].split(';')) {
        const [k, ...v] = part.split('=');
        if (k && v.length) cur.meta[k.trim().toLowerCase()] = v.join('=').trim();
      }
      continue;
    }
    if ((m = t.match(RE.rationale))) { cur.rationale.push(m[1]); mode = null; continue; }
    if ((m = t.match(RE.unit))) { cur.unit = m[1].trim(); continue; }
    if (RE.algorithm.test(t)) { mode = 'algorithm'; continue; }
    if ((m = t.match(RE.match))) { cur.match.push([m[1], m[2]]); mode = null; continue; }
    if ((m = t.match(RE.distractor))) { cur.distractors.push(m[1]); mode = null; continue; }
    if ((m = t.match(RE.choice))) { lastChoice = { correct: m[1] === '*', text: [m[3]] }; cur.choices.push(lastChoice); mode = 'choice'; continue; }
    if ((m = t.match(RE.multi))) { lastChoice = { correct: m[1] === '*', text: [m[2]] }; cur.multi.push(lastChoice); mode = 'choice'; continue; }
    if ((m = t.match(RE.numeric))) { cur.numeric = m[1].trim(); mode = null; continue; }
    if (RE.essay.test(t)) { cur.essay = true; mode = null; continue; }
    if (RE.upload.test(t)) { cur.upload = true; mode = null; continue; }
    if ((m = t.match(RE.short)) && !cur.choices.length && !cur.multi.length) { cur.short.push(m[1]); mode = null; continue; }
    if ((m = t.match(RE.feedback))) {
      // General feedback ("...") becomes the rationale; choice feedback is kept as notes there too.
      if (m[1] === '...' || mode === 'stem') cur.feedback.push(m[2]);
      mode = 'feedback';
      continue;
    }
    // Continuation of the previous part
    if (mode === 'stem') cur.stem.push(t);
    else if (mode === 'choice' && lastChoice) lastChoice.text.push(t);
    else if (mode === 'feedback') cur.feedback[cur.feedback.length - 1] += ` ${t}`;
    else cur.stem.push(t);
  }

  const fixImages = (s) => s.replace(/!\[([^\]]*)\]\(([^)\s|]+)(\|\d+)?\)/g, (all, alt, src, w) => {
    if (/^(img:|https?:)/.test(src)) return all;
    const id = images.get(src.split('/').pop());
    if (!id) { notes.missingImages.add(src); return all; }
    return `![${alt}](img:${id}${w || ''})`;
  });
  const joinText = (arr) => fixImages(arr.join('\n').replace(/\n{3,}/g, '\n\n').trim());

  const questions = [];
  for (const r of raw) {
    const make = (type) => {
      const q = newQuestion(type, settings);
      q.stem = joinText(r.stem);
      q.rationale = joinText([...r.rationale, ...r.feedback]);
      if (r.points !== null && !Number.isNaN(r.points)) q.points = r.points;
      if (r.algorithm.length) q.algorithm = r.algorithm.join('\n');
      const md = r.meta;
      if (md.topic) q.meta.topic = md.topic;
      if (md.difficulty) q.meta.difficulty = md.difficulty;
      if (md.reference) q.meta.reference = md.reference;
      if (md.notes) q.meta.notes = md.notes;
      if (md.standards || md.standard) q.meta.standards = splitList(md.standards || md.standard);
      if (md.objectives || md.objective) q.meta.objectives = splitList(md.objectives || md.objective);
      if (md.keywords || md.keyword) q.meta.keywords = splitList(md.keywords || md.keyword);
      return q;
    };

    if (r.upload) { skipped.push({ number: r.num, reason: 'file-upload question' }); continue; }
    if (r.match.length) {
      const q = make('match');
      const choiceTexts = [...new Set([...r.match.map(([, c]) => c), ...r.distractors])];
      q.choices = choiceTexts.map((c) => ({ id: newId(), text: fixImages(c) }));
      q.pairs = r.match.map(([p, c]) => ({ id: newId(), prompt: fixImages(p), choiceId: q.choices[choiceTexts.indexOf(c)].id }));
      questions.push(q);
      continue;
    }
    if (r.choices.length) {
      const texts = r.choices.map((c) => joinText(c.text));
      if (texts.length === 2 && /^true$/i.test(texts[0]) && /^false$/i.test(texts[1])) {
        const q = make('tf');
        q.answer = r.choices[0].correct;
        questions.push(q);
        continue;
      }
      const several = r.choices.filter((c) => c.correct).length > 1;
      const q = make(several ? 'mr' : 'mc');
      q.choices = r.choices.map((c, i) => ({ ...newChoice(texts[i]), correct: c.correct }));
      questions.push(q);
      continue;
    }
    if (r.multi.length) {
      const q = make('mr');
      q.choices = r.multi.map((c) => ({ ...newChoice(joinText(c.text)), correct: c.correct }));
      questions.push(q);
      continue;
    }
    if (r.numeric !== null) {
      const q = make('num');
      const s = r.numeric;
      let m;
      if ((m = s.match(/^\[\s*(.+?)\s*,\s*(.+?)\s*\]$/))) {
        const a = parseNumber(m[1]);
        const b = parseNumber(m[2]);
        q.answer.value = String(Number(((a + b) / 2).toPrecision(12)));
        q.answer.tolerance = String(Number(((b - a) / 2).toPrecision(12)));
      } else if ((m = s.match(/^(.+?)\s*\+-\s*(.+?)(%?)$/))) {
        q.answer.value = m[1].trim();
        q.answer.tolerance = m[2].trim();
        if (m[3]) q.answer.toleranceType = 'pct';
      } else {
        q.answer.value = s;
      }
      q.answer.unit = r.unit;
      questions.push(q);
      continue;
    }
    if (r.short.length) {
      const first = r.short[0].match(/^(-?[\d.,]+(?:e[-+]?\d+)?)\s*(.*)$/i);
      if (first && !Number.isNaN(parseNumber(first[1]))) {
        const q = make('num');
        q.answer.value = first[1];
        q.answer.unit = r.unit || first[2].trim();
        q.answer.accepted = r.short.slice(1);
        questions.push(q);
      } else {
        // Decided: text answers become a Short Answer question with them as the model answer.
        const q = make('essay');
        q.kind = 'short';
        q.answer.model = r.short.join(' / ');
        notes.converted.push({ number: r.num, note: 'fill-in-the-blank with text answers became Short Answer' });
        questions.push(q);
      }
      continue;
    }
    // Essay (____) or a question with no recognisable answer part
    const q = make('essay');
    q.kind = 'essay';
    if (!r.essay) notes.converted.push({ number: r.num, note: 'no answer lines found, imported as an essay question' });
    questions.push(q);
  }
  return { title: title || 'Imported quiz', questions, skipped, notes };
}

// Split pasted multiple-choice text into a stem and choices ("smart paste").
// Recognises "A. text", "a) text", "(a) text", "1. text"; a leading * marks the correct one.
export function splitPastedQuestion(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const CHOICE = /^(\*?)\s*\(?([A-Ha-h]|[1-8])[.)]\)?\s+(.*)$/;
  const firstChoice = lines.findIndex((l, i) => i > 0 && CHOICE.test(l));
  if (firstChoice === -1) return null;
  const choiceLines = lines.slice(firstChoice);
  if (choiceLines.length < 2 || !choiceLines.every((l) => CHOICE.test(l))) return null;
  const stem = lines.slice(0, firstChoice).join('\n').replace(/^\d+[.)]\s+/, '');
  const choices = choiceLines.map((l) => {
    const m = l.match(CHOICE);
    return { text: m[3].replace(/\s*\*$/, '').trim(), correct: m[1] === '*' || /\*$/.test(m[3].trim()) };
  });
  return { stem, choices };
}
