import { newBank, newQuestion, newLibrary, normalizeLibrary } from '../js/model.js';
import {
  newTest, testItem, displayOrder, typeGroups, pool, addToTest, sortItems, sortValuesFor,
  scrambleChoices, scrambleTest, moveItem, differsFromSource, summary, pickRandom,
} from '../js/testmodel.js';
import { parseQuery, matchesQuery } from '../js/search.js';
import { eq, ok } from './assert.js';

function q(type, stem, meta = {}) {
  const x = newQuestion(type);
  x.stem = stem;
  Object.assign(x.meta, meta);
  return x;
}

function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function setup() {
  const lib = newLibrary();
  const bank = newBank('Kinematics');
  bank.questions.push(q('mc', 'mc1', { difficulty: 'Hard' }), q('tf', 'tf1', { difficulty: 'Easy' }), q('mc', 'mc2', { difficulty: 'Easy' }), q('essay', 'es1'));
  lib.banks.push(bank);
  const test = newTest('Unit 1');
  lib.tests.push(test);
  return { lib, bank, test };
}

const stems = (items) => items.map((it) => it.question.stem);

export default {
  'items are copies with a source'() {
    const { bank } = setup();
    const item = testItem(bank.id, bank.questions[0]);
    ok(item.question.id !== bank.questions[0].id);
    eq(item.sourceQuestionId, bank.questions[0].id);
    eq(item.question.stem, 'mc1');
  },

  'pool skips questions already on the test and "don’t use"'() {
    const { lib, bank, test } = setup();
    bank.questions[3].flags.doNotUse = true;
    addToTest(test, [{ bank, q: bank.questions[0] }]);
    eq(pool(lib, test).map((e) => e.q.stem), ['tf1', 'mc2']);
  },

  'grouped display follows type order'() {
    const { bank, test } = setup();
    addToTest(test, bank.questions.map((x) => ({ bank, q: x })));
    eq(stems(displayOrder(test)), ['tf1', 'mc1', 'mc2', 'es1']);
    eq(typeGroups(test).map((g) => g.type), ['tf', 'mc', 'essay']);
    test.mixTypes = true;
    eq(stems(displayOrder(test)), ['mc1', 'tf1', 'mc2', 'es1']);
  },

  'moveItem stays within a type group'() {
    const { bank, test } = setup();
    addToTest(test, bank.questions.map((x) => ({ bank, q: x })));
    const [mc1, tf1, mc2] = test.items;
    ok(moveItem(test, mc2.question.id, mc1.question.id));
    eq(stems(displayOrder(test)), ['tf1', 'mc2', 'mc1', 'es1']);
    ok(!moveItem(test, mc2.question.id, tf1.question.id), 'cannot move into another type group');
    ok(moveItem(test, mc2.question.id, null));
    eq(stems(displayOrder(test)), ['tf1', 'mc1', 'mc2', 'es1']);
  },

  'sortItems uses the chosen value order'() {
    const { bank, test } = setup();
    test.mixTypes = true;
    addToTest(test, bank.questions.map((x) => ({ bank, q: x })));
    eq(sortValuesFor(test, 'difficulty'), ['Easy', 'Hard']);
    sortItems(test, 'difficulty', ['Hard', 'Easy']);
    eq(stems(test.items), ['mc1', 'tf1', 'mc2', 'es1']);
    sortItems(test, 'difficulty', ['Easy', 'Hard']);
    eq(stems(test.items), ['tf1', 'mc2', 'mc1', 'es1']);
  },

  'scrambleChoices keeps locked choices in place'() {
    const x = newQuestion('mc');
    x.choices.forEach((c, i) => (c.text = 'ABCD'[i]));
    x.choices[3].lockPosition = true;
    for (let i = 0; i < 20; i++) eq(scrambleChoices(x).choices[3].text, 'D');
    const texts = scrambleChoices(x, seq(0, 0, 0)).choices.map((c) => c.text);
    eq(texts.slice().sort(), ['A', 'B', 'C', 'D']);
  },

  'scrambleTest keeps type groups intact'() {
    const { bank, test } = setup();
    addToTest(test, bank.questions.map((x) => ({ bank, q: x })));
    scrambleTest(test, { questions: true }, seq(0.1, 0.9, 0.5));
    eq(test.items.map((it) => it.question.type), ['mc', 'tf', 'mc', 'essay']);
  },

  'differsFromSource notices edits'() {
    const { lib, bank, test } = setup();
    addToTest(test, [{ bank, q: bank.questions[0] }]);
    const item = test.items[0];
    ok(!differsFromSource(lib, item));
    item.question.stem = 'changed';
    ok(differsFromSource(lib, item));
  },

  'summary counts banks, types and points'() {
    const { lib, bank, test } = setup();
    addToTest(test, bank.questions.map((x) => ({ bank, q: x })));
    const s = summary(lib, test);
    eq(s.count, 4);
    eq(s.points, 1 + 1 + 1 + 5);
    eq(s.byType.get('mc').count, 2);
    eq(s.byBank.get('Kinematics').count, 4);
  },

  'pickRandom never repeats'() {
    const picked = pickRandom([1, 2, 3, 4, 5], 3);
    eq(new Set(picked).size, 3);
    eq(pickRandom([1, 2], 5).length, 2);
  },

  'tests survive a library round trip'() {
    const { lib, bank, test } = setup();
    addToTest(test, [{ bank, q: bank.questions[0] }]);
    const back = normalizeLibrary(JSON.parse(JSON.stringify(lib)));
    eq(back.tests[0].items[0].question.stem, 'mc1');
    eq(back.tests[0].typeOrder.length, 5);
  },

  // ---- search syntax
  'search: all words'() {
    const c = parseQuery('projectile velocity');
    ok(matchesQuery(c, 'The velocity of a projectile'));
    ok(!matchesQuery(c, 'A projectile in flight'));
  },
  'search: exact phrase and exclusion'() {
    ok(matchesQuery(parseQuery('"Romeo and Juliet"'), 'romeo and   juliet act 1'));
    ok(!matchesQuery(parseQuery('"Romeo and Juliet"'), 'Juliet and Romeo'));
    ok(!matchesQuery(parseQuery('subjects -compound'), 'compound subjects'));
    ok(matchesQuery(parseQuery('subjects -compound'), 'simple subjects'));
  },
  'search: either word and prefix'() {
    const c = parseQuery('(adjectives, adverbs)');
    ok(matchesQuery(c, 'Adverbs modify verbs'));
    ok(!matchesQuery(c, 'nouns'));
    ok(matchesQuery(parseQuery('pro*'), 'a pronoun'));
    ok(!matchesQuery(parseQuery('-pro*'), 'proper noun'));
    ok(matchesQuery(parseQuery('noun (common, compound, -proper)'), 'a common noun'));
  },
  'search: words are whole words, case-insensitive'() {
    ok(!matchesQuery(parseQuery('the'), 'there them'));
    ok(matchesQuery(parseQuery('NEWTON'), 'Newton’s second law'));
  },
};
