// Tests: copies of bank questions plus their order and options.

import { TYPE_ORDER, duplicateQuestion, newId, normalizeQuestion, now } from './model.js';

export function newTest(title = 'Untitled test') {
  const t = now();
  return { id: newId(), title, items: [], narratives: [], mixTypes: false, typeOrder: [...TYPE_ORDER], seed: newId(), created: t, modified: t };
}

export function normalizeTest(t) {
  const test = { ...newTest(), ...t };
  test.typeOrder = [...new Set([...(t.typeOrder || []), ...TYPE_ORDER])].filter((x) => TYPE_ORDER.includes(x));
  test.items = (t.items || []).map((item) => ({ ...item, question: normalizeQuestion(item.question) }));
  test.narratives = t.narratives || [];
  return test;
}

// A test holds a copy of the bank question, remembering where it came from.
export function testItem(bankId, q) {
  return { question: duplicateQuestion(q), sourceBankId: bankId, sourceQuestionId: q.id };
}

// Questions sharing a narrative stay together: later ones move up behind the first,
// within the same type group when types aren't mixed.
export function keepNarrativesTogether(items, grouped) {
  const out = [];
  const placed = new Set();
  items.forEach((it, i) => {
    if (placed.has(it)) return;
    out.push(it);
    placed.add(it);
    const n = it.question.narrativeId;
    if (!n) return;
    for (let j = i + 1; j < items.length; j++) {
      const other = items[j];
      if (!placed.has(other) && other.question.narrativeId === n && (!grouped || other.question.type === it.question.type)) {
        out.push(other);
        placed.add(other);
      }
    }
  });
  return out;
}

// Items in the order they appear: by type group (in typeOrder) unless types are mixed.
export function displayOrder(test) {
  if (test.mixTypes) return keepNarrativesTogether(test.items, false);
  const rank = new Map(test.typeOrder.map((t, i) => [t, i]));
  const sorted = test.items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (rank.get(a.item.question.type) ?? 99) - (rank.get(b.item.question.type) ?? 99) || a.i - b.i)
    .map((x) => x.item);
  return keepNarrativesTogether(sorted, true);
}

export function typeGroups(test) {
  const order = displayOrder(test);
  if (test.mixTypes) return [{ type: null, items: order }];
  return test.typeOrder.map((type) => ({ type, items: order.filter((it) => it.question.type === type) })).filter((g) => g.items.length);
}

export function totalPoints(test) {
  return test.items.reduce((s, it) => s + (Number(it.question.points) || 0), 0);
}

// Comparable content of a question, ignoring ids and timestamps.
function contentKey(q) {
  const { id, created, modified, ...rest } = q;
  if (rest.choices) rest.choices = rest.choices.map(({ id: _id, ...c }) => c);
  return JSON.stringify(rest);
}

export function sourceOf(lib, item) {
  const bank = lib.banks.find((b) => b.id === item.sourceBankId);
  const question = bank?.questions.find((q) => q.id === item.sourceQuestionId);
  return question ? { bank, question } : null;
}

export function differsFromSource(lib, item) {
  const src = sourceOf(lib, item);
  return src ? contentKey(src.question) !== contentKey(item.question) : false;
}

// Bank questions that can still be added: not flagged "don't use" and not already on the test.
export function pool(lib, test, bankIds) {
  const used = new Set(test.items.map((it) => it.sourceQuestionId));
  const out = [];
  for (const bank of lib.banks) {
    if (bankIds && !bankIds.includes(bank.id)) continue;
    for (const q of bank.questions) {
      if (q.flags.doNotUse || used.has(q.id)) continue;
      out.push({ bank, q });
    }
  }
  return out;
}

export function addToTest(test, entries) {
  test.narratives ??= [];
  for (const { bank, q } of entries) {
    test.items.push(testItem(bank.id, q));
    // Bring the question's narrative along (once).
    const n = q.narrativeId && bank.narratives?.find((x) => x.id === q.narrativeId);
    if (n && !test.narratives.some((x) => x.id === n.id)) test.narratives.push(structuredClone(n));
  }
  test.modified = now();
}

// Pick n entries at random (unseeded: question selection needn't be reproducible).
export function pickRandom(entries, n, random = Math.random) {
  const copy = entries.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, n));
}

// ---- metadata fields used for selection and sorting ------------------------------

export const META_FIELDS = {
  difficulty: 'Difficulty',
  topic: 'Topic',
  reference: 'Reference',
  standards: 'Standard',
  objectives: 'Objective',
  keywords: 'Keyword',
};

export function metaValues(q, field) {
  const v = q.meta[field];
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

// Distinct values of a field across questions, alphabetically.
export function distinctValues(questions, field) {
  const values = new Set();
  for (const q of questions) for (const v of metaValues(q, field)) values.add(v);
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Sort items by a field, using `valueOrder` for the order of values.
// Items without a value go last. Within type groups when types aren't mixed.
export function sortItems(test, field, valueOrder) {
  const rank = new Map(valueOrder.map((v, i) => [v, i]));
  // A field holding several values sorts as one combined value (as in ExamView).
  const key = (it) => {
    const vals = metaValues(it.question, field);
    if (!vals.length) return Infinity;
    const joined = vals.join(', ');
    return rank.has(joined) ? rank.get(joined) : rank.get(vals[0]) ?? Infinity;
  };
  const indexed = test.items.map((item, i) => ({ item, i }));
  indexed.sort((a, b) => key(a.item) - key(b.item) || a.i - b.i);
  test.items = indexed.map((x) => x.item);
  test.modified = now();
}

export function sortValuesFor(test, field) {
  const values = new Set();
  for (const it of test.items) {
    const vals = metaValues(it.question, field);
    if (vals.length) values.add(vals.join(', '));
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Shuffle choices, leaving locked ones (e.g. "All of the above") in place.
export function scrambleChoices(q, random = Math.random) {
  if (!q.choices) return q;
  const free = q.choices.map((c, i) => (c.lockPosition ? null : i)).filter((i) => i !== null);
  const moved = pickRandom(free.map((i) => q.choices[i]), free.length, random);
  const out = q.choices.slice();
  free.forEach((pos, k) => (out[pos] = moved[k]));
  return { ...q, choices: out };
}

export function scrambleTest(test, { questions = true, choices = false } = {}, random = Math.random) {
  if (questions) {
    if (test.mixTypes) test.items = pickRandom(test.items, test.items.length, random);
    else {
      // Shuffle within each type group, keeping groups where they are.
      const byType = new Map();
      for (const it of test.items) {
        if (!byType.has(it.question.type)) byType.set(it.question.type, []);
        byType.get(it.question.type).push(it);
      }
      for (const [type, items] of byType) byType.set(type, pickRandom(items, items.length, random));
      const next = new Map([...byType].map(([t]) => [t, 0]));
      test.items = test.items.map((it) => {
        const t = it.question.type;
        const i = next.get(t);
        next.set(t, i + 1);
        return byType.get(t)[i];
      });
    }
  }
  if (choices) test.items = test.items.map((it) => ({ ...it, question: scrambleChoices(it.question, random) }));
  test.modified = now();
}

// Move an item to just before `beforeId` (or to the end when null), within the display order.
export function moveItem(test, id, beforeId) {
  const order = displayOrder(test);
  const item = order.find((it) => it.question.id === id);
  if (!item) return false;
  if (!test.mixTypes && beforeId) {
    const target = order.find((it) => it.question.id === beforeId);
    if (target && target.question.type !== item.question.type) return false;
  }
  const rest = order.filter((it) => it !== item);
  let at = beforeId ? rest.findIndex((it) => it.question.id === beforeId) : -1;
  if (at === -1) {
    // End of its own type group when grouped, else end of test.
    at = test.mixTypes ? rest.length : rest.reduce((last, it, i) => (it.question.type === item.question.type ? i + 1 : last), rest.length);
  }
  rest.splice(at, 0, item);
  test.items = rest;
  test.modified = now();
  return true;
}

export function summary(lib, test) {
  const byBank = new Map();
  const byType = new Map();
  const standards = new Map();
  const objectives = new Map();
  const topics = new Map();
  const bump = (m, k, pts) => {
    const e = m.get(k) || { count: 0, points: 0 };
    e.count++;
    e.points += pts;
    m.set(k, e);
  };
  for (const it of test.items) {
    const q = it.question;
    const pts = Number(q.points) || 0;
    const bankTitle = lib.banks.find((b) => b.id === it.sourceBankId)?.title ?? (it.sourceBankId ? '(deleted bank)' : 'Written on this test');
    bump(byBank, bankTitle, pts);
    bump(byType, q.type, pts);
    for (const s of q.meta.standards) bump(standards, s, pts);
    for (const o of q.meta.objectives) bump(objectives, o, pts);
    if (q.meta.topic) bump(topics, q.meta.topic, pts);
  }
  return { count: test.items.length, points: totalPoints(test), byBank, byType, standards, objectives, topics };
}
