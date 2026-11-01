// Import a Schoology / Common Cartridge / QTI zip: preview what was found,
// then add each quiz as a bank (and optionally as a test).

import { QUESTION_TYPES, TYPE_ORDER, newBank, newId, questionCountLabel } from '../model.js';
import { parseText2qti } from '../import/text2qti.js';
import { newTest, addToTest } from '../testmodel.js';
import { readCartridge } from '../import/qti.js';
import { pictureBlob, readRtf } from '../import/rtf.js';
import { parseExamView } from '../import/examview.js';
import { pickFiles, store } from '../store.js';
import { h, toast, openDialog, imageFileToDataUrl } from '../ui.js';

export async function importCartridge(file) {
  let result;
  try {
    toast('Reading the file…');
    result = await readCartridge(file, store.lib.settings);
  } catch (err) {
    toast(err.message || 'That file couldn’t be read', 'error');
    return;
  }
  showImport(result);
}

// A text2qti text file, plus any image files it refers to (picked together).
export async function importText2qti(textFile, imageFiles = []) {
  const images = {};
  const byName = new Map();
  for (const f of imageFiles) {
    const id = newId();
    images[id] = await imageFileToDataUrl(f, 1600);
    byName.set(f.name, id);
  }
  let parsed;
  try {
    parsed = parseText2qti(await textFile.text(), { settings: store.lib.settings, images: byName });
  } catch (err) {
    toast(err.message || 'That file couldn’t be read', 'error');
    return;
  }
  if (!parsed.questions.length) {
    toast('No questions were found. Questions start with a number and a full stop, e.g. “1. …”.', 'error');
    return;
  }
  const title = parsed.title === 'Imported quiz' ? textFile.name.replace(/\.[^.]+$/, '') : parsed.title;
  showImport({
    banks: [{ title, questions: parsed.questions }],
    images,
    skipped: parsed.skipped.map((s) => ({ ...s, bank: title })),
    notes: {
      remoteImages: 0,
      missingImages: parsed.notes.missingImages.size,
      missingNames: [...parsed.notes.missingImages],
      groups: parsed.notes.groups,
      converted: parsed.notes.converted.map((c) => ({ ...c, bank: title })),
      text2qti: true,
    },
  });
}

const baseName = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();

// ExamView Import Utility RTF files, one bank each. Images may be embedded or
// linked; linked ones are usually in a subfolder, so they get their own picker.
export async function importExamView(rtfFiles, imageFiles = []) {
  const docs = [];
  try {
    toast('Reading the file…');
    for (const file of rtfFiles) {
      const source = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
      const { lines, pictures } = readRtf(source);
      const parsed = parseExamView(lines, { settings: store.lib.settings, fileName: file.name });
      docs.push({ file, pictures, parsed });
    }
  } catch (err) {
    toast(err.message || 'That file couldn’t be read', 'error');
    return;
  }
  if (!docs.some((d) => d.parsed.questions.length)) {
    toast('No questions were found. ExamView import files have a question type label, numbered questions and ANS: lines.', 'error');
    return;
  }
  const have = new Set(imageFiles.map((f) => baseName(f.name)));
  const linked = docs.flatMap((d) => d.pictures).filter((p) => p.link && !have.has(baseName(p.link)));
  if (!linked.length) {
    finishExamView(docs, imageFiles);
    return;
  }
  openDialog('Linked images', [
    h('p', `This file links to ${linked.length} image file${linked.length === 1 ? '' : 's'} instead of including ${linked.length === 1 ? 'it' : 'them'}, such as ${linked[0].link}. Choose them to bring them in. In the file picker, open the folder they’re in and select all of them.`),
  ], [
    { label: 'Import Without Them', onclick: () => { finishExamView(docs, imageFiles); } },
    {
      label: 'Choose Images…',
      primary: true,
      onclick: () => {
        pickFiles('image/*').then((more) => finishExamView(docs, [...imageFiles, ...more]));
      },
    },
  ]);
}

async function finishExamView(docs, imageFiles) {
  toast('Preparing images…');
  const byName = new Map(imageFiles.map((f) => [baseName(f.name), f]));
  const images = {};
  const banks = [];
  const skipped = [];
  const notes = { remoteImages: 0, missingImages: 0, missingNames: [], unreadable: 0, groups: 0, converted: [], review: [], ignored: 0, pickedWith: 'the RTF file', local: true, unit: ['file', 'files'] };
  for (const { pictures, parsed } of docs) {
    const title = parsed.title;
    for (const pic of pictures) {
      try {
        const blob = pic.link ? byName.get(baseName(pic.link)) : pictureBlob(pic);
        if (blob) images[pic.id] = await imageFileToDataUrl(blob, 1600);
        else if (pic.link) { notes.missingImages++; notes.missingNames.push(pic.link); }
        else notes.unreadable++;
      } catch {
        notes.unreadable++;
      }
    }
    banks.push({ title, subtitle: parsed.subtitle, questions: parsed.questions, narratives: parsed.narratives });
    const tag = (s) => ({ ...s, bank: title });
    skipped.push(...parsed.skipped.map(tag));
    notes.converted.push(...parsed.notes.converted.map(tag));
    notes.review.push(...parsed.notes.review.map(tag));
    notes.ignored += parsed.notes.ignored;
  }
  showImport({ banks, images, skipped, notes });
}

function showImport(result) {
  const { banks, images, skipped, notes } = result;
  const total = banks.reduce((n, b) => n + b.questions.length, 0);
  const picks = banks.map((b) => ({ bank: b, include: h('input', { type: 'checkbox', checked: b.questions.length > 0 }) }));
  const makeTests = h('input', { type: 'checkbox' });
  const unit = notes.unit ?? ['quiz', 'quizzes'];

  const typeSummary = (qs) => TYPE_ORDER.map((t) => [t, qs.filter((q) => q.type === t).length]).filter(([, n]) => n)
    .map(([t, n]) => `${n} ${QUESTION_TYPES[t].label.toLowerCase()}`).join(', ');

  const body = [
    h('p', `Found ${questionCountLabel(total)} in ${banks.length} ${banks.length === 1 ? unit[0] : unit[1]}. Each one becomes a question bank.`),
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
    notes.review?.length
      ? h('details', { open: true }, h('summary', `${notes.review.length} question${notes.review.length === 1 ? ' has a note' : 's have notes'} to check`),
          h('ul', notes.review.map((s) => h('li', `${s.bank}, question ${s.number}: ${s.note}`))))
      : null,
    notes.remoteImages
      ? h('p.field-hint', `${notes.remoteImages} image${notes.remoteImages === 1 ? ' is' : 's are'} linked from the web (e.g. Schoology or Google) rather than stored in the file. They show while those links work, which may need you to be signed in. To keep one for good, save it and paste it into the question.`)
      : null,
    notes.missingImages
      ? h('p.field-hint', notes.text2qti || notes.local
          ? `Image files not found: ${notes.missingNames.join(', ')}. ${notes.local ? 'These show as “missing image”. Import again and choose them to include them.' : 'Choose them together with the text file to include them.'}`
          : `${notes.missingImages} image${notes.missingImages === 1 ? ' was' : 's were'} referenced but missing from the file.`)
      : null,
    notes.unreadable ? h('p.field-hint', `${notes.unreadable} embedded picture${notes.unreadable === 1 ? ' is' : 's are'} in a format browsers can’t show, and will appear as “missing image”.`) : null,
    notes.ignored ? h('p.field-hint', `${notes.ignored} line${notes.ignored === 1 ? '' : 's'} outside any question ${notes.ignored === 1 ? 'was' : 'were'} left out.`) : null,
    notes.groups ? h('p.field-hint', 'Random-pick question groups were imported as ordinary questions.') : null,
    notes.text2qti || notes.local ? null : h('p.field-hint', 'Points aren’t stored in Schoology exports, so questions get the default points for their type. Answers, choices, feedback and images come across; fonts and colours don’t.'),
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
            const bank = newBank(b.title, b.subtitle ?? '');
            bank.questions = b.questions;
            bank.narratives = b.narratives ?? [];
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
