// Build the printed versions of a test: order, scrambled choices, numbers and seeds.

import { makeRng } from '../algo/rng.js';
import { displayOrder, typeGroups, scrambleChoices, keepNarrativesTogether } from '../testmodel.js';
import { testSeed } from '../containers.js';
import { LETTERS } from './layout.js';

// The narrative a question uses, with the seed for its shared values.
export function narrativeFor(test, q, versionKey) {
  const n = q.narrativeId && test.narratives?.find((x) => x.id === q.narrativeId);
  return n ? { ...n, seed: `${test.seed}|${versionKey}|${n.id}` } : null;
}

// Returns { versions: [{ letter, sections: [{ type, items: [{ item, question, number, seed, baseIndex }] }] }], baseOrder }
export function buildVersions(test, layout, opts) {
  const baseOrder = displayOrder(test);
  const baseIndex = new Map(baseOrder.map((it, i) => [it, i]));
  const baseGroups = typeGroups(test);
  const versions = [];

  for (const letter of LETTERS.slice(0, opts.versions)) {
    const rng = makeRng(`${test.seed}|${letter}|order`);
    const original = letter === 'A' && opts.keepAOriginal;
    let groups = baseGroups.map((g) => ({ type: g.type, items: g.items.slice() }));
    if (!original) {
      if (opts.scrambleSections && !test.mixTypes) groups = rng.shuffle(groups);
      if (opts.scrambleQuestions) groups = groups.map((g) => ({ ...g, items: keepNarrativesTogether(rng.shuffle(g.items), Boolean(g.type)) }));
    }
    let number = layout.startNumber;
    const sections = groups.map((g) => {
      if (layout.restartNumbering && !test.mixTypes) number = layout.startNumber;
      return {
        type: g.type,
        items: g.items.map((item) => {
          let q = !original && opts.scrambleChoices ? scrambleChoices(item.question, rng.next) : item.question;
          if (q.type === 'match' && !original && opts.scrambleChoices) q = { ...q, pairs: rng.shuffle(q.pairs) };
          // A matching question uses one number per item.
          const count = q.type === 'match' ? Math.max(1, q.pairs.length) : 1;
          const first = number;
          number += count;
          return {
            item,
            question: q,
            number: first,
            count,
            seed: testSeed(test, item.question, opts.recalc ? letter : 'A'),
            narrative: narrativeFor(test, item.question, opts.recalc ? letter : 'A'),
            baseIndex: baseIndex.get(item),
          };
        }),
      };
    });
    versions.push({ letter, sections });
  }
  return { versions, baseOrder };
}

// Version map rows: for each question in the test's own order, its number in every version.
export function versionMap(built, layout) {
  const rows = built.baseOrder.map((item, i) => ({ item, base: i + layout.startNumber, numbers: {} }));
  for (const v of built.versions) {
    for (const s of v.sections) for (const e of s.items) rows[e.baseIndex].numbers[v.letter] = e.number;
  }
  return rows;
}
