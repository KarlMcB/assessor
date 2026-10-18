// Build the printed versions of a test: order, scrambled choices, numbers and seeds.

import { makeRng } from '../algo/rng.js';
import { displayOrder, typeGroups, scrambleChoices } from '../testmodel.js';
import { testSeed } from '../containers.js';
import { LETTERS } from './layout.js';

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
      if (opts.scrambleQuestions) groups = groups.map((g) => ({ ...g, items: rng.shuffle(g.items) }));
    }
    let number = layout.startNumber;
    const sections = groups.map((g) => {
      if (layout.restartNumbering && !test.mixTypes) number = layout.startNumber;
      return {
        type: g.type,
        items: g.items.map((item) => {
          const q = !original && opts.scrambleChoices ? scrambleChoices(item.question, rng.next) : item.question;
          return {
            item,
            question: q,
            number: number++,
            seed: testSeed(test, item.question, opts.recalc ? letter : 'A'),
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
