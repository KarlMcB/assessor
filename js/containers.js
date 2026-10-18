// Where an edited question lives: a bank, or a test (which holds copies).
// The question editor works through this interface.

import { now } from './model.js';
import { store } from './store.js';

export function bankContainer(bank) {
  return {
    kind: 'bank',
    owner: bank,
    narrativeSeed: (n) => n.id,
    title: bank.title,
    backHref: (focus) => `#/bank/${bank.id}${focus ? `?focus=${focus}` : ''}`,
    newHref: (type) => `#/bank/${bank.id}/new/${type}?t=${Date.now()}`,
    find: (id) => bank.questions.find((q) => q.id === id),
    seed: (q) => q.id,
    note: null,
    save(q) {
      store.update(() => {
        const i = bank.questions.findIndex((x) => x.id === q.id);
        if (i === -1) bank.questions.push(q);
        else bank.questions[i] = q;
        bank.modified = q.modified;
      });
    },
    extraActions: () => [],
  };
}

export function testSeed(test, q, version = 'A') {
  return `${test.seed}|${version}|${q.id}`;
}

export function testContainer(test) {
  const itemFor = (id) => test.items.find((it) => it.question.id === id);
  return {
    kind: 'test',
    owner: test,
    narrativeSeed: (n) => `${test.seed}|A|${n.id}`,
    title: test.title,
    backHref: (focus) => `#/test/${test.id}${focus ? `?focus=${focus}` : ''}`,
    newHref: (type) => `#/test/${test.id}/new/${type}?t=${Date.now()}`,
    find: (id) => itemFor(id)?.question,
    seed: (q) => testSeed(test, q),
    note: 'Changes here apply to this test only. The bank question is unchanged unless you also save to the bank.',
    save(q) {
      store.update(() => {
        const item = itemFor(q.id);
        if (item) item.question = q;
        else test.items.push({ question: q, sourceBankId: null, sourceQuestionId: null });
        test.modified = now();
      });
    },
    // Offer to copy the edit back to the bank question it came from.
    extraActions(draft) {
      const item = itemFor(draft.id);
      const bank = item && store.lib.banks.find((b) => b.id === item.sourceBankId);
      const source = bank?.questions.find((q) => q.id === item.sourceQuestionId);
      if (!source) return [];
      return [{
        label: 'Save to test and bank',
        title: `Also replace the original question in “${bank.title}”`,
        run(q) {
          store.update(() => {
            const i = bank.questions.indexOf(source);
            const copy = structuredClone(q);
            copy.id = source.id;
            copy.created = source.created;
            if (copy.choices) copy.choices.forEach((c, k) => (c.id = source.choices?.[k]?.id ?? c.id));
            bank.questions[i] = copy;
            bank.modified = now();
          });
        },
      }];
    },
  };
}
