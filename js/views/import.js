// Import a Schoology / Common Cartridge / QTI zip: preview what was found,
// then add each quiz as a bank (and optionally as a test).

import { QUESTION_TYPES, TYPE_ORDER, newBank, questionCountLabel } from '../model.js';
import { newTest, addToTest } from '../testmodel.js';
import { readCartridge } from '../import/qti.js';
import { store } from '../store.js';
import { h, toast, openDialog } from '../ui.js';

export async function importCartridge(file) {
  let result;
  try {
    toast('Reading the file…');
    result = await readCartridge(file, store.lib.settings);
  } catch (err) {
    toast(err.message || 'That file couldn’t be read', 'error');
    return;
  }
  const { banks, images, skipped, notes } = result;
  const total = banks.reduce((n, b) => n + b.questions.length, 0);
  const picks = banks.map((b) => ({ bank: b, include: h('input', { type: 'checkbox', checked: b.questions.length > 0 }) }));
  const makeTests = h('input', { type: 'checkbox' });

  const typeSummary = (qs) => TYPE_ORDER.map((t) => [t, qs.filter((q) => q.type === t).length]).filter(([, n]) => n)
    .map(([t, n]) => `${n} ${QUESTION_TYPES[t].label.toLowerCase()}`).join(', ');

  const body = [
    h('p', `Found ${questionCountLabel(total)} in ${banks.length} quiz${banks.length === 1 ? '' : 'zes'}. Each one becomes a question bank.`),
    h('div.import-list', picks.map(({ bank, include }) =>
      h('label.check.import-row', include, h('span', h('strong', bank.title), h('br'), h('span.muted', `${questionCountLabel(bank.questions.length)}${bank.questions.length ? `: ${typeSummary(bank.questions)}` : ''}`))))),
    h('label.check', makeTests, 'Also make a test from each, with questions in the same order'),
    skipped.length
      ? h('details', h('summary', `${skipped.length} question${skipped.length === 1 ? '' : 's'} can’t be imported`),
          h('ul', skipped.map((s) => h('li', `${s.bank}, question ${s.number}: ${s.reason}`))))
      : null,
    notes.converted.length
      ? h('details', h('summary', `${notes.converted.length} question${notes.converted.length === 1 ? ' was' : 's were'} changed to fit`),
          h('ul', notes.converted.map((s) => h('li', `${s.bank}, question ${s.number}: ${s.note}`))))
      : null,
    notes.remoteImages
      ? h('p.field-hint', `${notes.remoteImages} image${notes.remoteImages === 1 ? ' is' : 's are'} linked from the web (e.g. Schoology or Google) rather than stored in the file. They show while those links work, which may need you to be signed in. To keep one for good, save it and paste it into the question.`)
      : null,
    notes.missingImages ? h('p.field-hint', `${notes.missingImages} image${notes.missingImages === 1 ? ' was' : 's were'} referenced but missing from the file.`) : null,
    notes.groups ? h('p.field-hint', 'Random-pick question groups were imported as ordinary questions.') : null,
    h('p.field-hint', 'Points aren’t stored in Schoology exports, so questions get the default points for their type. Answers, choices, feedback and images come across; fonts and colours don’t.'),
  ];

  openDialog('Import questions', body, [
    { label: 'Cancel' },
    {
      label: 'Import',
      primary: true,
      onclick: () => {
        const chosen = picks.filter((p) => p.include.checked && p.bank.questions.length).map((p) => p.bank);
        if (!chosen.length) return false;
        const created = [];
        store.update((lib) => {
          Object.assign(lib.images, images);
          for (const b of chosen) {
            const bank = newBank(b.title);
            bank.questions = b.questions;
            lib.banks.push(bank);
            created.push(bank);
            if (makeTests.checked) {
              const test = newTest(b.title);
              test.mixTypes = true; // keep the original order
              addToTest(test, bank.questions.map((q) => ({ bank, q })));
              lib.tests.push(test);
            }
          }
        });
        const n = created.reduce((s, b) => s + b.questions.length, 0);
        toast(`Imported ${questionCountLabel(n)} into ${created.length} bank${created.length === 1 ? '' : 's'}`);
        location.hash = `#/bank/${created[0].id}`;
      },
    },
  ], { wide: true });
}
