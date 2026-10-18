// Search syntax for selecting questions by criteria (case-insensitive):
//   a b        both words
//   "a b"      exact phrase
//   -a         without the word
//   (a, b)     either word (items may be negated: (a, -b))
//   pro*       a word starting with "pro"

export function parseQuery(text) {
  const clauses = [];
  const src = String(text || '');
  let i = 0;
  const term = (raw) => {
    let t = raw.trim().toLowerCase();
    let not = false;
    if (t.startsWith('-') && t.length > 1) { not = true; t = t.slice(1); }
    if (!t) return null;
    if (t.startsWith('"') && t.endsWith('"') && t.length > 1) return { not, phrase: t.slice(1, -1).replace(/\s+/g, ' ').trim() };
    if (t.endsWith('*') && t.length > 1) return { not, prefix: t.slice(0, -1) };
    return { not, word: t };
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const neg = c === '-' && (src[i + 1] === '"' || src[i + 1] === '(');
    const start = neg ? i + 1 : i;
    if (src[start] === '"') {
      const end = src.indexOf('"', start + 1);
      const stop = end === -1 ? src.length : end;
      const t = term(`${neg ? '-' : ''}"${src.slice(start + 1, stop)}"`);
      if (t) clauses.push(t);
      i = stop + 1;
    } else if (src[start] === '(') {
      const end = src.indexOf(')', start + 1);
      const stop = end === -1 ? src.length : end;
      const any = src.slice(start + 1, stop).split(',').map(term).filter(Boolean);
      if (any.length) clauses.push({ not: neg, any });
      i = stop + 1;
    } else {
      let j = i;
      while (j < src.length && !/\s/.test(src[j])) j++;
      const t = term(src.slice(i, j));
      if (t) clauses.push(t);
      i = j;
    }
  }
  return clauses;
}

function words(text) {
  return String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function termMatches(t, wordList, flat) {
  let hit;
  if (t.phrase !== undefined) hit = flat.includes(t.phrase);
  else if (t.prefix !== undefined) hit = wordList.some((w) => w.startsWith(t.prefix));
  else hit = wordList.includes(t.word);
  return t.not ? !hit : hit;
}

export function matchesQuery(clauses, text) {
  if (!clauses.length) return true;
  const wordList = words(text);
  const flat = wordList.join(' ');
  return clauses.every((c) => {
    if (c.any) {
      const hit = c.any.some((t) => termMatches(t, wordList, flat));
      return c.not ? !hit : hit;
    }
    return termMatches(c, wordList, flat);
  });
}

// All searchable text of a question.
export function questionSearchText(q) {
  const parts = [q.stem, q.rationale, q.algorithm, ...(q.choices || []).map((c) => c.text), q.answer?.model, q.answer?.value];
  const m = q.meta;
  parts.push(m.difficulty, m.reference, m.topic, m.notes, m.misc, ...m.standards, ...m.objectives, ...m.keywords);
  return parts.filter(Boolean).join(' ');
}
