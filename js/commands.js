// Every menu and toolbar action. A command is { label, key, run, enabled, checked }.
// Keys are written like 'ctrl+t' or 'cmd+s' and shown as ⌃T / ⌘S.

import {
  BANK_FORMAT, ESSAY_KINDS, LIBRARY_FORMAT, QUESTION_TYPES, SINGLE_ANSWER, TEST_FORMAT, TYPE_ORDER, bankFile, changeType, duplicateQuestion,
  bankFileName, docHash, narrativeOf, newBank, newId, now, pruneImages, questionCountLabel, readBankFile, readTestFile, testFile, testFileName,
} from './model.js';
import { META_FIELDS, moveItem, newTest, scrambleTest, sortItems, sortValuesFor, sourceOf, summary, testItem } from './testmodel.js';
import { LETTERS, normalizeLayout } from './print/layout.js';
import { downloadJson, pickFile, pickFiles, store } from './store.js';
import { app } from './app.js';
import { documentEntries, documentSections, questionCount } from './views/document.js';
import { exportDialog } from './views/export.js';
import { importCartridge, importExamView, importText2qti } from './views/import.js';
import { narrativesPanel } from './views/narrative.js';
import { SELECT_METHODS } from './views/select.js';
import { h, add, clear, field, formatTime, openDialog, select, toast } from './ui.js';

const isTest = () => app.kind === 'test';
const hasDoc = () => Boolean(app.doc);
const hasQuestions = () => hasDoc() && questionCount(app.kind, app.doc) > 0;
const selected = () => (hasDoc() && app.selectedId ? documentEntries(app.kind, app.doc).find((e) => e.q.id === app.selectedId) ?? null : null);
const docHref = () => `#/${app.kind}/${app.doc.id}`;
const noun = () => (isTest() ? 'test' : 'question bank');

function touch() {
  if (app.doc) app.doc.modified = now();
}

function change(fn) {
  store.update(() => {
    fn();
    touch();
  });
}

// ---- small dialogs ----------------------------------------------------------------

export function askText(title, label, value = '', { multiline = false, hint = null } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const input = multiline ? h('textarea', { rows: 4, value }) : h('input', { value });
    const done = openDialog(title, [field(label, input, hint)], [
      { label: 'Cancel' },
      { label: 'OK', primary: true, onclick: () => { result = input.value; } },
    ]);
    if (!multiline) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.closest('dialog').querySelector('button.primary').click();
        }
      });
    }
    setTimeout(() => { input.focus(); input.select?.(); });
    done.then(() => resolve(result));
  });
}

// ---- tests and banks as files -----------------------------------------------------------------
// Each test and bank is its own file. Open ones stay in the app until closed,
// so nothing is lost if the window goes away before a save.

const openDocs = (kind) => (kind === 'test' ? store.lib.tests : store.lib.banks);
const docFile = (kind, doc) => (kind === 'test' ? testFile(store.lib, doc) : bankFile(store.lib, doc));
const docFileName = (kind, doc) => (kind === 'test' ? testFileName(doc) : bankFileName(doc));
const docChanged = (doc) => doc.fileHash !== docHash(doc);

function saveDocFile(kind, doc) {
  downloadJson(docFile(kind, doc), docFileName(kind, doc));
  store.update(() => { doc.fileHash = docHash(doc); });
  toast(`Saved ${docFileName(kind, doc)} to Downloads`);
}

// Closing frees the document's images, which earlier undo steps would need.
function removeOpenDoc(kind, doc) {
  const onScreen = app.doc === doc;
  store.update((lib) => {
    const list = kind === 'test' ? lib.tests : lib.banks;
    const i = list.indexOf(doc);
    if (i >= 0) list.splice(i, 1);
    pruneImages(lib);
  });
  store.forgetUndo();
  if (onScreen) location.hash = '#/';
}

export function closeDoc(kind, doc) {
  if (!docChanged(doc)) return removeOpenDoc(kind, doc);
  openDialog(`Save changes to “${doc.title}”?`, [h('p', `Its changes haven’t been saved to a ${kind === 'test' ? 'test' : 'bank'} file. If you don’t save them, they’ll be lost when it closes.`)], [
    { label: 'Don’t Save', onclick: () => removeOpenDoc(kind, doc) },
    { label: 'Cancel' },
    { label: 'Save', primary: true, onclick: () => { saveDocFile(kind, doc); removeOpenDoc(kind, doc); } },
  ]);
}

async function openDocFile(kind, file, navigate) {
  try {
    const read = kind === 'test' ? readTestFile : readBankFile;
    const data = read(JSON.parse(await file.text()));
    const doc = data[kind];
    const existing = openDocs(kind).find((d) => d.id === doc.id);
    if (existing && docChanged(existing) && !confirm(`“${existing.title}” is already open with unsaved changes. Replace it with this file?`)) return;
    store.update((lib) => {
      const list = kind === 'test' ? lib.tests : lib.banks;
      Object.assign(lib.images, data.images);
      if (existing) list[list.indexOf(existing)] = doc;
      else list.push(doc);
    });
    if (kind === 'bank' && app.view.hiddenBanks?.includes(doc.id)) {
      app.view.hiddenBanks = app.view.hiddenBanks.filter((id) => id !== doc.id);
      app.saveView();
    }
    if (navigate) location.hash = `#/${kind}/${doc.id}`;
    if (existing) app.refresh();
  } catch (err) {
    toast(err instanceof SyntaxError ? `${file.name} isn’t an Assessor file` : err.message, 'error');
  }
}

export async function chooseDocFiles(kind, navigate = true) {
  for (const file of await pickFiles('.json,application/json')) await openDocFile(kind, file, navigate);
}

export function saveAllDocs() {
  const changed = ['test', 'bank'].flatMap((kind) => openDocs(kind).filter(docChanged).map((doc) => [kind, doc]));
  changed.forEach(([kind, doc], i) => setTimeout(() => saveDocFile(kind, doc), i * 500));
  if (!changed.length) toast('Everything open is already saved');
}

export const unsavedDocs = () => [...store.lib.tests, ...store.lib.banks].filter(docChanged);

function openDocDialog(kind) {
  const noun = kind === 'test' ? 'test' : 'bank';
  const docs = [...openDocs(kind)].sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  if (!docs.length) return chooseDocFiles(kind);
  const count = (d) => questionCountLabel(kind === 'test' ? d.items.length : d.questions.length);
  const list = h('div.open-list', docs.map((d) => h('div.open-test',
    h('button.open-row', { type: 'button', onclick: (e) => { location.hash = `#/${kind}/${d.id}`; e.target.closest('dialog').close(); } },
      h('strong', d.title), h('span.muted', `${count(d)} · ${docChanged(d) ? 'not saved to a file' : 'saved to a file'}`)),
    h('button', { type: 'button', onclick: (e) => { e.target.closest('dialog').close(); closeDoc(kind, d); } }, 'Close'))));
  openDialog(kind === 'test' ? 'Open Test' : 'Open Question Bank', [
    h('p', `These ${noun}s are open in Assessor. Choose one, or open a ${noun} file from Finder.`),
    list,
  ], [
    { label: 'Cancel' },
    { label: 'Save All to Files', onclick: saveAllDocs },
    { label: 'Choose File…', primary: true, onclick: () => { chooseDocFiles(kind); } },
  ]);
}

// Files dragged in from Finder. While adding questions, a bank joins the Banks list without leaving the page.
export async function openDroppedFiles(files) {
  const rtfs = files.filter((f) => /\.rtf$/i.test(f.name));
  if (rtfs.length) importExamView(rtfs, files.filter((f) => f.type.startsWith('image/')));
  for (const file of files.filter((f) => /\.json$/i.test(f.name))) {
    let format = null;
    try {
      format = JSON.parse(await file.text()).format;
    } catch {
      // Reported below.
    }
    if (format === TEST_FORMAT) await openDocFile('test', file, true);
    else if (format === BANK_FORMAT) await openDocFile('bank', file, !/\/add\//.test(location.hash));
    else if (format === LIBRARY_FORMAT) toast('To open a library file, use File → Open Library File', 'error');
    else toast(`${file.name} isn’t an Assessor test or bank file`, 'error');
  }
}

async function createDoc(kind) {
  const title = await askText(kind === 'test' ? 'New Test' : 'New Question Bank', 'Title', kind === 'test' ? 'Untitled test' : 'Untitled bank');
  if (title === null) return;
  const doc = kind === 'test' ? newTest(title.trim() || 'Untitled test') : newBank(title.trim() || 'Untitled bank');
  store.update((lib) => (kind === 'test' ? lib.tests : lib.banks).push(doc));
  location.hash = `#/${kind}/${doc.id}`;
}

async function saveAs() {
  const title = await askText('Save As', 'Save a copy named', `${app.doc.title} copy`);
  if (title === null) return;
  const copy = structuredClone(app.doc);
  copy.id = newId();
  copy.title = title.trim() || copy.title;
  copy.created = copy.modified = now();
  if (isTest()) copy.items.forEach((it) => (it.question.id = newId()));
  else copy.questions = copy.questions.map(duplicateQuestion);
  store.update((lib) => (isTest() ? lib.tests : lib.banks).push(copy));
  saveDocFile(app.kind, copy);
  location.hash = `#/${app.kind}/${copy.id}`;
}

async function saveLibraryFile() {
  await store.saveToFile();
  toast(`Saved ${store.status.lastFileName} to Downloads`);
}

async function openLibraryFile() {
  if (store.hasUnsavedChanges() && !store.isEmpty() &&
      !confirm('Opening a library file replaces the current library, which has changes not saved to a file. Continue?')) return;
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    await store.openFromFile(file);
    location.hash = '#/';
    app.refresh();
    toast(`Opened ${file.name}`);
  } catch (err) {
    toast(err.message || 'That file couldn’t be opened', 'error');
  }
}

async function importQti() {
  const file = await pickFile('.zip,.imscc,application/zip');
  if (file) importCartridge(file);
}

async function importTextFile() {
  const files = await pickFiles('.txt,.md,text/plain,text/markdown,image/*');
  const text = files.find((f) => /\.(txt|md|markdown|text)$/i.test(f.name));
  if (text) importText2qti(text, files.filter((f) => f.type.startsWith('image/')));
  else if (files.length) toast('Choose a text2qti .txt file, along with any images it uses', 'error');
}

async function importRtf() {
  const files = await pickFiles('.rtf,text/rtf,application/rtf,image/*');
  const rtfs = files.filter((f) => /\.rtf$/i.test(f.name));
  if (rtfs.length) importExamView(rtfs, files.filter((f) => f.type.startsWith('image/')));
  else if (files.length) toast('Choose an ExamView import .rtf file', 'error');
}

async function testToBank() {
  const title = await askText('Export as Question Bank', 'New bank title', app.doc.title);
  if (title === null) return;
  const bank = newBank(title.trim() || app.doc.title);
  bank.questions = documentEntries('test', app.doc).map((e) => structuredClone(e.q));
  bank.narratives = structuredClone(app.doc.narratives || []);
  store.update((lib) => lib.banks.push(bank));
  toast(`Created the bank “${bank.title}”`);
}

function printDocument() {
  if (isTest()) {
    location.hash = `${docHref()}/print`;
    return;
  }
  document.body.classList.add('print-doc');
  window.print();
  document.body.classList.remove('print-doc');
}

// ---- question commands ---------------------------------------------------------------

function newQuestionDialog() {
  const options = {};
  for (const t of TYPE_ORDER) {
    if (t === 'essay') for (const [k, label] of Object.entries(ESSAY_KINDS)) options[`essay:${k}`] = label;
    else options[t] = QUESTION_TYPES[t].label;
  }
  const choice = select(options, 'mc');
  openDialog('New Question', [field('Question type', choice)], [
    { label: 'Cancel' },
    { label: 'OK', primary: true, onclick: () => newQuestion(choice.value) },
  ]);
}

function newQuestion(spec) {
  const [type, kind] = spec.split(':');
  location.hash = `${docHref()}/new/${type}${kind ? `?kind=${kind}` : `?t=${Date.now()}`}`;
}

export function editSelected() {
  if (selected()) location.hash = `${docHref()}/q/${app.selectedId}`;
}

function insertCopy(q, afterId) {
  if (isTest()) {
    const item = { question: q, sourceBankId: null, sourceQuestionId: null };
    const i = app.doc.items.findIndex((it) => it.question.id === afterId);
    if (i === -1) app.doc.items.push(item);
    else app.doc.items.splice(i + 1, 0, item);
  } else {
    const i = app.doc.questions.findIndex((x) => x.id === afterId);
    if (i === -1) app.doc.questions.push(q);
    else app.doc.questions.splice(i + 1, 0, q);
  }
}

function duplicate() {
  const e = selected();
  const copy = duplicateQuestion(e.q);
  change(() => {
    if (isTest()) {
      const i = app.doc.items.indexOf(e.item);
      app.doc.items.splice(i + 1, 0, { ...e.item, question: copy });
    } else insertCopy(copy, e.q.id);
  });
  app.select(copy.id);
}

function removeSelected() {
  const e = selected();
  if (!isTest() && !confirm('Delete this question from the bank?')) return;
  change(() => {
    if (isTest()) app.doc.items.splice(app.doc.items.indexOf(e.item), 1);
    else app.doc.questions.splice(app.doc.questions.indexOf(e.q), 1);
  });
  app.selectedId = null;
  app.refresh();
  toast('Question removed. Edit → Undo brings it back.');
}

function replaceQuestion(e, q) {
  if (isTest()) e.item.question = q;
  else app.doc.questions[app.doc.questions.indexOf(e.q)] = q;
}

function changeTypeDialog() {
  const e = selected();
  const options = {};
  for (const t of TYPE_ORDER) {
    if (t === 'essay') for (const [k, label] of Object.entries(ESSAY_KINDS)) options[`essay:${k}`] = label;
    else options[t] = QUESTION_TYPES[t].label;
  }
  const choice = select(options, e.q.type === 'essay' ? `essay:${e.q.kind}` : e.q.type);
  openDialog('Change Type', [field('Change this question to', choice), h('p.field-hint', 'The question text stays. Answers that don’t fit the new type are cleared.')], [
    { label: 'Cancel' },
    {
      label: 'OK',
      primary: true,
      onclick: () => {
        const [type, kind] = choice.value.split(':');
        change(() => {
          const q = changeType(e.q, type, store.lib.settings);
          if (kind) q.kind = kind;
          replaceQuestion(e, q);
        });
      },
    },
  ]);
}

function recalcSelected() {
  const e = selected();
  change(() => { e.q.salt = newId(); });
}

function recalcAll() {
  change(() => {
    if (isTest()) app.doc.seed = newId();
    else app.doc.questions.forEach((q) => { q.salt = newId(); });
  });
  toast('New values for dynamic questions');
}

function toggleBimodal(all) {
  const flip = (q) => { q.showAs = q.showAs === 'short' ? 'mc' : 'short'; };
  if (all) {
    const entries = documentEntries(app.kind, app.doc).filter((e) => e.q.type === 'bimodal');
    if (!entries.length) return toast('There are no bimodal questions');
    const target = entries[0].q.showAs === 'short' ? 'mc' : 'short';
    change(() => entries.forEach((e) => { e.q.showAs = target; }));
  } else {
    const e = selected();
    if (e?.q.type !== 'bimodal') return toast('Select a bimodal question first');
    change(() => flip(e.q));
  }
}

function updateFromBank() {
  const e = selected();
  const src = e?.item && sourceOf(store.lib, e.item);
  if (!src) return toast('This question has no bank question to update from');
  if (!confirm('Replace this test’s copy with the current bank question?')) return;
  change(() => {
    const copy = structuredClone(src.question);
    copy.id = e.q.id;
    e.item.question = copy;
  });
}

function reorderDialog() {
  const listEl = h('div.reorder-list');
  const kind = app.kind;
  const doc = app.doc;
  let dragId = null;
  const moveTo = (id, beforeId) => {
    if (kind === 'test') {
      change(() => moveItem(doc, id, beforeId));
      return;
    }
    change(() => {
      const q = doc.questions.find((x) => x.id === id);
      const rest = doc.questions.filter((x) => x !== q);
      let at = beforeId ? rest.findIndex((x) => x.id === beforeId) : rest.length;
      if (!beforeId && !doc.mixTypes) {
        const last = rest.reduce((pos, x, i) => (x.type === q.type ? i + 1 : pos), rest.length);
        at = last;
      }
      rest.splice(at, 0, q);
      doc.questions = rest;
    });
  };
  const mixed = () => (kind === 'test' ? doc.mixTypes : doc.mixTypes);
  const render = () => {
    clear(listEl);
    const sections = documentSections(kind, doc);
    sections.forEach((s, si) => {
      if (s.type) {
        add(listEl, h('div.reorder-section', QUESTION_TYPES[s.type].label,
          kind === 'test' && sections.length > 1 ? h('span.group-actions',
            h('button', { type: 'button', disabled: si === 0, title: 'Move this group up', onclick: () => moveGroup(s.type, sections[si - 1].type) }, '↑'),
            h('button', { type: 'button', disabled: si === sections.length - 1, title: 'Move this group down', onclick: () => moveGroup(s.type, sections[si + 1].type) }, '↓')) : null));
      }
      s.entries.forEach((e, k) => {
        const prev = s.entries[k - 1];
        const next = s.entries[k + 1];
        const after = s.entries[k + 2];
        const row = h('div.reorder-row', { draggable: 'true' },
          h('span.drag-handle', '⠿'),
          h('span.reorder-num', `${e.number}.`),
          h('span.reorder-text', plainStem(e.q)),
          h('button', { type: 'button', disabled: !prev, title: 'Move up', onclick: () => moveTo(e.q.id, prev.q.id) }, '↑'),
          h('button', { type: 'button', disabled: !next, title: 'Move down', onclick: () => moveTo(e.q.id, after ? after.q.id : null) }, '↓'));
        row.addEventListener('dragstart', (ev) => { dragId = e.q.id; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', dragId); });
        row.addEventListener('dragover', (ev) => { ev.preventDefault(); row.classList.add('drop-before'); });
        row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
        row.addEventListener('drop', (ev) => {
          ev.preventDefault();
          row.classList.remove('drop-before');
          const moving = documentEntries(kind, doc).find((x) => x.q.id === dragId);
          if (!moving || moving.q.id === e.q.id) return;
          if (!mixed() && moving.q.type !== e.q.type) return toast('Questions are grouped by type. Turn on Mix Question Types to move between groups.');
          moveTo(moving.q.id, e.q.id);
        });
        add(listEl, row);
      });
    });
  };
  const moveGroup = (a, b) => change(() => {
    const i = doc.typeOrder.indexOf(a);
    const j = doc.typeOrder.indexOf(b);
    [doc.typeOrder[i], doc.typeOrder[j]] = [doc.typeOrder[j], doc.typeOrder[i]];
  });
  const onChange = () => render();
  store.addEventListener('change', onChange);
  render();
  openDialog('Reorder Questions', [
    h('p.field-hint', 'Drag a question, or use the arrows. Questions linked to a narrative stay together.'),
    listEl,
  ], [
    ...(kind === 'test' ? [{ label: 'Sort…', onclick: () => { sortDialog(); return false; } }] : []),
    { label: 'Done', primary: true },
  ], { wide: true }).then(() => store.removeEventListener('change', onChange));
}

function plainStem(q) {
  return q.stem.replace(/```[\s\S]*?```/g, '[graph]').replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]').replace(/[*$^~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110) || '(no text)';
}

function sortDialog() {
  const test = app.doc;
  const fields = Object.entries(META_FIELDS).filter(([f]) => sortValuesFor(test, f).length);
  if (!fields.length) {
    openDialog('Sort Questions', h('p', 'None of these questions have question information (difficulty, topic, standards…) to sort by.'));
    return;
  }
  let chosen = fields[0][0];
  let values = sortValuesFor(test, chosen);
  const valuesEl = h('ol.sort-values');
  const renderValues = () => {
    add(clear(valuesEl), ...values.map((v, i) =>
      h('li', h('span', v),
        h('button', { type: 'button', disabled: i === 0, onclick: () => { [values[i - 1], values[i]] = [values[i], values[i - 1]]; renderValues(); } }, '↑'),
        h('button', { type: 'button', disabled: i === values.length - 1, onclick: () => { [values[i + 1], values[i]] = [values[i], values[i + 1]]; renderValues(); } }, '↓'))));
  };
  renderValues();
  openDialog('Sort Questions', [
    field('Sort by', select(Object.fromEntries(fields), chosen, { onchange: (e) => { chosen = e.target.value; values = sortValuesFor(test, chosen); renderValues(); } })),
    h('p.field-hint', 'Questions follow this order; those without a value go last.', test.mixTypes ? '' : ' Types stay grouped, so sorting happens within each group.'),
    valuesEl,
  ], [{ label: 'Cancel' }, { label: 'Sort', primary: true, onclick: () => change(() => sortItems(test, chosen, values)) }]);
}

function scrambleDialog() {
  const test = app.doc;
  const opts = { questions: true, choices: false };
  openDialog('Scramble', [
    h('p.field-hint', 'Rearranges this test once. Printing several versions scrambles each version separately.'),
    h('label.check', h('input', { type: 'checkbox', checked: true, onchange: (e) => (opts.questions = e.target.checked) }), test.mixTypes ? 'Question order' : 'Question order within each type'),
    h('label.check', h('input', { type: 'checkbox', onchange: (e) => (opts.choices = e.target.checked) }), 'Answer choices (locked choices stay put)'),
  ], [{ label: 'Cancel' }, { label: 'Scramble', primary: true, onclick: () => change(() => scrambleTest(test, opts)) }]);
}

function goToDialog() {
  askText('Go To', 'Question number').then((text) => {
    if (text === null) return;
    const n = Number(text);
    const e = documentEntries(app.kind, app.doc).find((x) => n >= x.number && n < x.number + x.count);
    if (!e) return toast(`There’s no question ${text}`);
    app.select(e.q.id, true);
  });
}

function pointsDialog() {
  const entries = documentEntries(app.kind, app.doc);
  const types = TYPE_ORDER.filter((t) => entries.some((e) => e.q.type === t));
  const inputs = new Map();
  const rows = types.map((t) => {
    const pts = [...new Set(entries.filter((e) => e.q.type === t).map((e) => Number(e.q.points)))];
    const input = h('input.narrow', { type: 'number', min: 0, step: 'any', value: pts.length === 1 ? pts[0] : '', placeholder: 'mixed' });
    inputs.set(t, input);
    return h('tr', h('td', QUESTION_TYPES[t].label), h('td', input));
  });
  openDialog('Assign Points', [
    h('p.field-hint', 'Set the points for every question of a type. Leave a box empty to keep the current points.'),
    h('table.points-table', h('tbody', rows)),
  ], [{ label: 'Cancel' }, {
    label: 'OK',
    primary: true,
    onclick: () => change(() => {
      for (const [type, input] of inputs) {
        if (input.value === '') continue;
        for (const e of entries) if (e.q.type === type) e.q.points = Number(input.value);
      }
    }),
  }]);
}

function adjustColumnsDialog() {
  const entries = documentEntries(app.kind, app.doc).filter((e) => ['mc', 'mr', 'bimodal'].includes(e.q.type));
  if (!entries.length) return toast('There are no multiple choice or multiple response questions');
  const cols = select({ 1: '1 column', 2: '2 columns', 3: '3 columns', 4: '4 columns' }, selected()?.q.columns ?? 1);
  let scope = selected() && SINGLE_OR_MULTI(selected().q) ? 'selected' : 'all';
  openDialog('Adjust Choices/Columns', [
    field('Lay answer choices out in', cols),
    h('label.check', h('input', { type: 'radio', name: 'scope', checked: scope === 'selected', disabled: !selected() || !SINGLE_OR_MULTI(selected().q), onchange: () => (scope = 'selected') }), 'The selected question'),
    h('label.check', h('input', { type: 'radio', name: 'scope', checked: scope === 'all', onchange: () => (scope = 'all') }), 'All multiple choice and multiple response questions'),
  ], [{ label: 'Cancel' }, {
    label: 'OK',
    primary: true,
    onclick: () => change(() => {
      for (const e of scope === 'all' ? entries : [selected()]) e.q.columns = Number(cols.value);
    }),
  }]);
}

const SINGLE_OR_MULTI = (q) => SINGLE_ANSWER.has(q.type) || q.type === 'mr';

function narrativesDialog() {
  const box = h('div');
  const doc = app.doc;
  const questions = () => (app.kind === 'test' ? doc.items.map((it) => it.question) : doc.questions);
  const render = () => {
    clear(box);
    const panel = narrativesPanel(doc, questions());
    panel.open = true;
    add(box, panel);
  };
  store.addEventListener('change', render);
  render();
  openDialog('Narratives', [box], [{ label: 'Done', primary: true }], { wide: true })
    .then(() => store.removeEventListener('change', render));
}

// ---- clipboard ----------------------------------------------------------------------

function plainText(q, number) {
  const lines = [`${number ? `${number}. ` : ''}${q.stem}`];
  if (q.choices && q.type !== 'match') q.choices.forEach((c, i) => lines.push(`${c.correct ? '*' : ''}${LETTERS[i]}. ${c.text}`));
  if (q.type === 'match') {
    q.choices.forEach((c, i) => lines.push(`${LETTERS[i]}. ${c.text}`));
    q.pairs.forEach((p) => lines.push(`___ ${p.prompt}`));
  }
  return lines.join('\n');
}

function copyToSystem(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function copyQuestion() {
  const e = selected();
  const n = narrativeOf(app.doc, e.q);
  app.clipboard = { question: structuredClone(e.q), narrative: n ? structuredClone(n) : null };
  copyToSystem(plainText(e.q));
  toast('Question copied');
}

function copyAll() {
  const entries = documentEntries(app.kind, app.doc);
  copyToSystem(entries.map((e) => plainText(e.q, e.number)).join('\n\n'));
  toast(`Copied the whole ${noun()} as text`);
}

function cutQuestion() {
  copyQuestion();
  const e = selected();
  change(() => {
    if (isTest()) app.doc.items.splice(app.doc.items.indexOf(e.item), 1);
    else app.doc.questions.splice(app.doc.questions.indexOf(e.q), 1);
  });
  app.selectedId = null;
  app.refresh();
}

function pasteQuestion() {
  const { question, narrative } = app.clipboard;
  const copy = duplicateQuestion(question);
  change(() => {
    if (narrative) {
      app.doc.narratives ??= [];
      if (!app.doc.narratives.some((n) => n.id === narrative.id)) app.doc.narratives.push(structuredClone(narrative));
    }
    insertCopy(copy, app.selectedId);
  });
  app.select(copy.id, true);
}

// ---- find and replace ---------------------------------------------------------------

const findState = { text: '', matchCase: false, whole: false };

function makeMatcher({ text, matchCase, whole }, flags = '') {
  const body = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(whole ? `\\b${body}\\b` : body, `${matchCase ? '' : 'i'}${flags}`);
}

function textFields(q) {
  const fields = [['stem', () => q.stem, (v) => (q.stem = v)], ['rationale', () => q.rationale, (v) => (q.rationale = v)]];
  (q.choices || []).forEach((c) => fields.push(['choice', () => c.text, (v) => (c.text = v)]));
  (q.pairs || []).forEach((p) => fields.push(['item', () => p.prompt, (v) => (p.prompt = v)]));
  if (q.type === 'essay') fields.push(['model', () => q.answer.model, (v) => (q.answer.model = v)]);
  if (q.type === 'mtf') fields.push(['correction', () => q.answer.correction, (v) => (q.answer.correction = v)]);
  return fields;
}

function findNext() {
  if (!findState.text) return findDialog();
  const entries = documentEntries(app.kind, app.doc);
  const start = entries.findIndex((e) => e.q.id === app.selectedId);
  const re = makeMatcher(findState);
  for (let i = 1; i <= entries.length; i++) {
    const e = entries[(start + i + entries.length) % entries.length];
    if (textFields(e.q).some(([, get]) => re.test(get() || ''))) {
      app.select(e.q.id, true);
      return true;
    }
  }
  toast(`“${findState.text}” wasn’t found`);
  return false;
}

function findOptions() {
  return [
    h('label.check', h('input', { type: 'checkbox', checked: findState.matchCase, onchange: (e) => (findState.matchCase = e.target.checked) }), 'Match case'),
    h('label.check', h('input', { type: 'checkbox', checked: findState.whole, onchange: (e) => (findState.whole = e.target.checked) }), 'Whole words only'),
  ];
}

function findDialog() {
  const input = h('input', { value: findState.text, oninput: (e) => (findState.text = e.target.value) });
  openDialog('Find', [field('Find', input), ...findOptions()], [
    { label: 'Cancel' },
    { label: 'Find Next', primary: true, onclick: () => { findNext(); return false; } },
  ]);
  setTimeout(() => input.focus());
}

function replaceDialog() {
  let replacement = '';
  const input = h('input', { value: findState.text, oninput: (e) => (findState.text = e.target.value) });
  openDialog('Replace', [
    field('Find', input),
    field('Replace with', h('input', { oninput: (e) => (replacement = e.target.value) })),
    ...findOptions(),
    h('p.field-hint', 'Replace changes the selected question; Replace All changes every question here.'),
  ], [
    { label: 'Close' },
    { label: 'Find Next', onclick: () => { findNext(); return false; } },
    { label: 'Replace', onclick: () => { replaceIn(selected() ? [selected()] : [], replacement); return false; } },
    { label: 'Replace All', primary: true, onclick: () => { replaceIn(documentEntries(app.kind, app.doc), replacement); return false; } },
  ], { wide: true });
  setTimeout(() => input.focus());
}

function replaceIn(entries, replacement) {
  if (!findState.text) return;
  const re = makeMatcher(findState, 'g');
  let count = 0;
  change(() => {
    for (const e of entries) {
      for (const [, get, set] of textFields(e.q)) {
        const before = get() || '';
        const after = before.replace(re, () => { count++; return replacement; });
        if (after !== before) set(after);
      }
    }
  });
  toast(count ? `Replaced ${count} time${count === 1 ? '' : 's'}` : `“${findState.text}” wasn’t found`);
}

// ---- test settings -------------------------------------------------------------------

function layoutOf(test) {
  return normalizeLayout(test.layout, store.lib.settings.printLayout);
}

async function editLayoutText(title, key, { fallback = null, multiline = false, hint = null } = {}) {
  const test = app.doc;
  const layout = layoutOf(test);
  const value = await askText(title, title, layout[key] ?? fallback ?? '', { multiline, hint });
  if (value === null) return;
  change(() => { test.layout = { ...layout, [key]: value }; });
}

const TOKENS_HINT = 'Fill-ins: {title} {version} {page} {pages} {date}. **bold** and *italic* work.';

async function editInstructions(type) {
  const test = app.doc;
  const layout = layoutOf(test);
  const value = await askText(`${QUESTION_TYPES[type].label} Instructions`, 'Instructions', layout.instructions[type] ?? '', { multiline: true });
  if (value === null) return;
  change(() => { test.layout = { ...layout, instructions: { ...layout.instructions, [type]: value } }; });
}

const STYLES = {
  standard: { label: 'Standard', hint: 'One column, Times 12 pt, medium spacing', set: { columns: 1, fontFamily: 'serif', fontSize: 12, questionSpacing: 12, margin: 0.75, columnRule: false } },
  compact: { label: 'Compact (saves paper)', hint: 'Two columns with a dividing line, Times 10 pt', set: { columns: 2, fontFamily: 'serif', fontSize: 10, questionSpacing: 6, margin: 0.5, columnRule: true } },
  spacious: { label: 'Spacious', hint: 'One column, Georgia 13 pt, room to work', set: { columns: 1, fontFamily: 'georgia', fontSize: 13, questionSpacing: 28, margin: 1, columnRule: false } },
  clean: { label: 'Clean sans-serif', hint: 'One column, Helvetica 11 pt, a line above each section', set: { columns: 1, fontFamily: 'sans', fontSize: 11, questionSpacing: 12, margin: 0.75, columnRule: false, sectionRule: true } },
  large: { label: 'Large print', hint: 'One column, Helvetica 14 pt, extra spacing', set: { columns: 1, fontFamily: 'sans', fontSize: 14, questionSpacing: 18, margin: 0.75, columnRule: false } },
};

function styleGallery() {
  const test = app.doc;
  let chosen = 'standard';
  const rows = Object.entries(STYLES).map(([k, s]) =>
    h('label.check.style-row', h('input', { type: 'radio', name: 'style', checked: k === chosen, onchange: () => (chosen = k) }), h('span', h('strong', s.label), h('br'), h('span.muted', s.hint))));
  openDialog('Style Gallery', [h('div.open-list', rows), h('p.field-hint', 'You can fine-tune any of this afterwards under Test → Layout.')], [
    { label: 'Cancel' },
    { label: 'OK', primary: true, onclick: () => change(() => { test.layout = { ...layoutOf(test), ...STYLES[chosen].set }; }) },
  ]);
}

function versionDialog() {
  const test = app.doc;
  const choice = select(Object.fromEntries([...LETTERS].map((l) => [l, l])), test.version || 'A');
  openDialog('Version', [
    field('Version letter of this test', choice),
    h('p.field-hint', 'Shown as the ID on the test. Dynamic questions use this version’s values, and printing starts from this letter.'),
  ], [{ label: 'Cancel' }, { label: 'OK', primary: true, onclick: () => change(() => { test.version = choice.value; }) }]);
}

function clearSelections() {
  const test = app.doc;
  const sum = summary(store.lib, test);
  const bankChecks = [...sum.byBank].map(([title, e]) => ({ title, count: e.count, input: h('input', { type: 'checkbox' }) }));
  const typeChecks = [...sum.byType].map(([type, e]) => ({ type, count: e.count, input: h('input', { type: 'checkbox' }) }));
  openDialog('Clear Selections', [
    h('p.field-hint', 'Removing questions doesn’t change the banks. Questions written for this test or edited on it lose those changes.'),
    h('h4', 'From'), bankChecks.map((b) => h('label.check', b.input, `${b.title} (${b.count})`)),
    h('h4', 'Of type'), typeChecks.map((t) => h('label.check', t.input, `${QUESTION_TYPES[t.type].label} (${t.count})`)),
  ], [
    { label: 'Cancel' },
    {
      label: 'Clear',
      danger: true,
      onclick: () => {
        const banks = new Set(bankChecks.filter((b) => b.input.checked).map((b) => b.title));
        const types = new Set(typeChecks.filter((t) => t.input.checked).map((t) => t.type));
        if (!banks.size && !types.size) return false;
        const titleOf = (it) => store.lib.banks.find((b) => b.id === it.sourceBankId)?.title ?? (it.sourceBankId ? '(bank not open)' : 'Written on this test');
        change(() => { test.items = test.items.filter((it) => !banks.has(titleOf(it)) && !types.has(it.question.type)); });
      },
    },
  ]);
}

function preferencesDialog() {
  const s = store.lib.settings;
  const points = new Map();
  const st = store.status;
  const rows = TYPE_ORDER.map((t) => {
    const input = h('input.narrow', { type: 'number', min: 0, step: 'any', value: s.defaultPoints[t] ?? 1 });
    points.set(t, input);
    return h('tr', h('td', QUESTION_TYPES[t].label), h('td', input));
  });
  const choices = h('input.narrow', { type: 'number', min: 2, max: 8, value: s.defaultChoices });
  const days = h('input.narrow', { type: 'number', min: 1, max: 60, value: s.backupReminderDays });
  openDialog('Preferences', [
    h('h4', 'New questions'),
    field('Answer choices', choices),
    h('table.points-table', h('thead', h('tr', h('th', 'Default points'), h('th', ''))), h('tbody', rows)),
    h('h4', 'Library'),
    field('Remind me to save a library file after (days)', days),
    h('dl.status-list',
      h('dt', 'Last library file'), h('dd', st.lastFileSave ? `${formatTime(st.lastFileSave)} (${st.lastFileName})` : 'never'),
      h('dt', 'Browser storage'), h('dd', st.persisted ? 'persistent' : 'not marked persistent. The library file is your backup.')),
    h('p.field-hint', 'Page layout defaults are set under Test → Layout, with “Use as default for other tests”.'),
  ], [{ label: 'Cancel' }, {
    label: 'OK',
    primary: true,
    onclick: () => store.update(() => {
      for (const [t, input] of points) s.defaultPoints[t] = Number(input.value) || 0;
      s.defaultChoices = Number(choices.value) || 4;
      s.backupReminderDays = Number(days.value) || 3;
    }),
  }], { wide: true });
}

function helpDialog() {
  openDialog('Assessor Help', [
    h('p', 'Build question banks, then make tests from them. Tests hold copies, so editing a test never changes the bank unless you choose “Save to test and bank”.'),
    h('ul',
      h('li', h('strong', 'Files: '), 'each test and question bank is its own file. Save downloads it, so move it from Downloads to wherever you keep them. Open one with the File menu or by dragging it onto this window. Close removes it from Assessor, not from Finder.'),
      h('li', h('strong', 'Banks while adding questions: '), 'the Banks list chooses which open banks to use, and can open or close bank files.'),
      h('li', h('strong', 'Math: '), '$F = ma$ inline, $$…$$ on its own line.'),
      h('li', h('strong', 'Dynamic questions: '), 'define values under Algorithm in the editor and use them as [[name]].'),
      h('li', h('strong', 'Printing: '), 'in Safari’s print dialog, choose the same paper size and turn off “Print headers and footers”.'),
      h('li', h('strong', 'Shortcuts: '), 'menus show each key. ⌃ is the Control key, used where Safari keeps the ⌘ version for itself.')),
    h('p', h('a', { href: 'https://github.com/KarlMcB/assessor/blob/main/GUIDE.md', target: '_blank', rel: 'noopener' }, 'Full guide')),
  ], [{ label: 'Close', primary: true }], { wide: true });
}

function zoomDialog() {
  const choice = select({ 0.5: '50%', 0.75: '75%', 1: '100%', 1.25: '125%', 1.5: '150%', 2: '200%' }, app.view.zoom);
  openDialog('Zoom', [field('Show the page at', choice)], [
    { label: 'Cancel' },
    { label: 'OK', primary: true, onclick: () => setZoom(Number(choice.value)) },
  ]);
}

export function setZoom(z) {
  app.view.zoom = z;
  app.saveView();
  app.refresh();
}

function toggleView(key) {
  app.view[key] = !app.view[key];
  app.saveView();
  app.refresh();
}

// ---- registry ---------------------------------------------------------------------------

const sel = () => Boolean(selected());
const SELECT_KEYS = { random: 'ctrl+1', list: 'ctrl+2', view: 'ctrl+3', standard: 'ctrl+4', criteria: 'ctrl+5', all: 'ctrl+6' };
const SELECT_LABELS = { random: 'Randomly…', list: 'From a List…', view: 'While Viewing…', standard: 'By Standard…', criteria: 'By Criteria…', all: 'All Questions…' };

export const COMMANDS = {
  wizard: { label: 'QuickTest Wizard…', key: 'ctrl+t', run: () => { location.hash = '#/wizard'; } },
  newTest: { label: 'New Test…', run: () => createDoc('test') },
  openTest: { label: 'Open Test…', key: 'cmd+o', run: () => openDocDialog('test') },
  newBank: { label: 'New Question Bank…', run: () => createDoc('bank') },
  openBank: { label: 'Open Question Bank…', key: 'cmd+o', run: () => openDocDialog('bank') },
  save: { label: 'Save', key: 'cmd+s', enabled: hasDoc, run: () => saveDocFile(app.kind, app.doc) },
  saveAs: { label: 'Save As…', enabled: hasDoc, run: saveAs },
  close: { label: 'Close', key: 'ctrl+w', enabled: hasDoc, run: () => closeDoc(app.kind, app.doc) },
  importQti: { label: 'Schoology / Common Cartridge Zip…', run: importQti },
  importText: { label: 'text2qti Text File…', run: importTextFile },
  importRtf: { label: 'ExamView RTF File…', run: importRtf },
  exportSchoology: { label: 'Schoology…', enabled: hasQuestions, run: () => exportDialog(isTest() ? { test: app.doc } : { bank: app.doc }) },
  testToBank: { label: 'Question Bank…', enabled: hasQuestions, run: testToBank },
  print: { label: 'Print…', key: 'cmd+p', enabled: hasQuestions, run: printDocument },
  openLibrary: { label: 'Open Library File…', run: openLibraryFile },
  saveLibrary: { label: 'Save Library File', run: saveLibraryFile },

  undo: { label: 'Undo', key: 'cmd+z', enabled: () => store.canUndo(), run: () => { store.undo(); app.afterUndo?.(); } },
  cut: { label: 'Cut Question', key: 'cmd+x', enabled: sel, run: cutQuestion },
  copyQuestion: { label: 'Question', key: 'cmd+c', enabled: sel, run: copyQuestion },
  copyAll: { label: 'Everything, as Text', enabled: hasQuestions, run: copyAll },
  paste: { label: 'Paste Question', key: 'cmd+v', enabled: () => hasDoc() && Boolean(app.clipboard), run: pasteQuestion },
  clear: { label: 'Clear', enabled: sel, run: removeSelected },
  find: { label: 'Find…', key: 'cmd+f', enabled: hasQuestions, run: findDialog },
  findAgain: { label: 'Find Again', key: 'f3', enabled: hasQuestions, run: findNext },
  replace: { label: 'Replace…', key: 'ctrl+r', enabled: hasQuestions, run: replaceDialog },
  preferences: { label: 'Preferences…', run: preferencesDialog },
  testTitle: {
    label: 'Title…',
    enabled: hasDoc,
    run: async () => {
      const t = await askText(isTest() ? 'Test Title' : 'Question Bank Title', 'Title', app.doc.title);
      if (t !== null) change(() => { app.doc.title = t.trim() || app.doc.title; });
    },
  },

  viewToolbar: { label: 'Toolbar', checked: () => app.view.toolbar, run: () => toggleView('toolbar') },
  viewVariables: { label: 'Variable Names', checked: () => app.view.variableNames, enabled: hasDoc, run: () => toggleView('variableNames') },
  viewTags: { label: 'Question Tags', checked: () => app.view.tags, enabled: hasDoc, run: () => toggleView('tags') },
  viewAnswers: { label: 'Answers', checked: () => app.view.answers, enabled: hasDoc, run: () => toggleView('answers') },
  zoom: { label: 'Zoom…', enabled: hasDoc, run: zoomDialog },
  mixTypes: { label: 'Mix Question Types', checked: () => Boolean(app.doc?.mixTypes), enabled: hasDoc, run: () => change(() => { app.doc.mixTypes = !app.doc.mixTypes; }) },

  clearSelections: { label: 'Clear Selections…', enabled: () => isTest() && hasQuestions(), run: clearSelections },

  newSpecify: { label: 'Specify…', key: 'ctrl+n', enabled: hasDoc, run: newQuestionDialog },
  edit: { label: 'Edit…', enabled: sel, run: editSelected },
  duplicate: { label: 'Duplicate', key: 'ctrl+d', enabled: sel, run: duplicate },
  delete: { label: 'Delete', enabled: sel, run: removeSelected },
  changeType: { label: 'Change Type…', enabled: sel, run: changeTypeDialog },
  recalcSelected: { label: 'Selected Question', key: 'ctrl+k', enabled: sel, run: recalcSelected },
  recalcAll: { label: 'All Questions', enabled: hasQuestions, run: recalcAll },
  bimodalSelected: { label: 'Selected Question', key: 'ctrl+b', enabled: () => selected()?.q.type === 'bimodal', run: () => toggleBimodal(false) },
  bimodalAll: { label: 'All Bimodal Questions', enabled: hasQuestions, run: () => toggleBimodal(true) },
  updateFromBank: { label: 'Update from Bank…', enabled: () => Boolean(selected()?.item && sourceOf(store.lib, selected().item)), run: updateFromBank },
  reorder: { label: 'Reorder…', enabled: hasQuestions, run: reorderDialog },
  scramble: { label: 'Scramble…', enabled: () => isTest() && hasQuestions(), run: scrambleDialog },
  goTo: { label: 'Go To…', key: 'ctrl+g', enabled: hasQuestions, run: goToDialog },
  points: { label: 'Assign Points…', enabled: hasQuestions, run: pointsDialog },
  columns: { label: 'Adjust Choices/Columns…', key: 'ctrl+j', enabled: hasQuestions, run: adjustColumnsDialog },
  narratives: { label: 'Narratives…', enabled: hasDoc, run: narrativesDialog },

  headerFirst: { label: 'First Page…', enabled: isTest, run: () => editLayoutText('First Page Header', 'headerFirst', { hint: TOKENS_HINT }) },
  headerRest: { label: 'Subsequent Pages…', enabled: isTest, run: () => editLayoutText('Subsequent Pages Header', 'headerRest', { hint: TOKENS_HINT }) },
  footerFirst: { label: 'First Page…', enabled: isTest, run: () => editLayoutText('First Page Footer', 'footerFirst', { fallback: layoutOf(app.doc).footer, hint: TOKENS_HINT }) },
  footerRest: { label: 'Subsequent Pages…', enabled: isTest, run: () => editLayoutText('Subsequent Pages Footer', 'footer', { hint: TOKENS_HINT }) },
  layout: { label: 'Layout…', enabled: isTest, run: () => { location.hash = `${docHref()}/print`; } },
  styleGallery: { label: 'Style Gallery…', enabled: isTest, run: styleGallery },
  version: { label: 'Version…', enabled: isTest, run: versionDialog },
  summary: { label: 'Summary', enabled: () => isTest() && hasQuestions(), run: () => { location.hash = `${docHref()}/summary`; } },

  help: { label: 'Assessor Help', run: helpDialog },
  switchMode: {
    label: 'Switch',
    run: () => {
      const toKind = isTest() ? 'bank' : 'test';
      const recent = recentDocs().find((r) => r.kind === toKind);
      if (recent) location.hash = `#/${toKind}/${recent.doc.id}`;
      else createDoc(toKind);
    },
  },
};

for (const [m, label] of Object.entries(SELECT_LABELS)) {
  COMMANDS[`select:${m}`] = { label, key: SELECT_KEYS[m], enabled: isTest, run: () => { location.hash = `${docHref()}/add/${m}`; } };
}
for (const t of TYPE_ORDER) {
  if (t === 'essay') continue;
  COMMANDS[`new:${t}`] = { label: QUESTION_TYPES[t].label, enabled: hasDoc, run: () => newQuestion(t) };
  COMMANDS[`instructions:${t}`] = { label: QUESTION_TYPES[t].label, enabled: isTest, run: () => editInstructions(t) };
}
for (const [k, label] of Object.entries(ESSAY_KINDS)) {
  COMMANDS[`new:essay:${k}`] = { label, enabled: hasDoc, run: () => newQuestion(`essay:${k}`) };
}
COMMANDS['instructions:essay'] = { label: 'Short Answer, Problem, Essay', enabled: isTest, run: () => editInstructions('essay') };

export function recentDocs() {
  const out = [];
  for (const r of store.lib.settings.recent || []) {
    const list = r.kind === 'test' ? store.lib.tests : store.lib.banks;
    const doc = list.find((d) => d.id === r.id);
    if (doc) out.push({ kind: r.kind, doc });
  }
  return out;
}

export function noteRecent(kind, id) {
  const s = store.lib.settings;
  s.recent = [{ kind, id }, ...(s.recent || []).filter((r) => r.id !== id)].slice(0, 8);
}

// ---- menus --------------------------------------------------------------------------------

const SEP = '-';

export function menus() {
  const test = app.kind !== 'bank';
  const recents = recentDocs().filter((r) => r.kind === (test ? 'test' : 'bank')).slice(0, 5).map((r, i) => ({
    label: `${i + 1}  ${r.doc.title}`,
    run: () => { location.hash = `#/${r.kind}/${r.doc.id}`; },
  }));
  const sub = (label, items) => ({ label, items });
  const m = [
    ['File', [
      ...(test ? ['wizard', 'newTest', 'openTest'] : ['newBank', 'openBank']),
      'save', 'saveAs', 'close', SEP,
      sub('Import', ['importRtf', 'importQti', 'importText']),
      sub('Export', test ? ['exportSchoology', 'testToBank'] : ['exportSchoology']), SEP,
      { ...COMMANDS.print, label: test ? 'Print Test…' : 'Print Question Bank…' }, SEP,
      ...(recents.length ? [...recents, SEP] : []),
      'openLibrary', 'saveLibrary', SEP,
      { ...COMMANDS.switchMode, label: test ? 'Switch to Question Bank Editor' : 'Switch to Test Builder' },
    ]],
    ['Edit', [
      'undo', 'cut', sub('Copy', ['copyQuestion', 'copyAll']), 'paste', 'clear', SEP,
      'find', 'findAgain', 'replace', SEP,
      'preferences', { ...COMMANDS.testTitle, label: test ? 'Test Title…' : 'Question Bank Title…' },
    ]],
    ['View', ['viewToolbar', 'viewVariables', 'viewTags', 'viewAnswers', 'mixTypes', SEP, 'zoom']],
  ];
  if (test) m.push(['Select', [...Object.keys(SELECT_METHODS).map((k) => `select:${k}`), SEP, 'clearSelections']]);
  m.push(['Question', [
    sub('New', ['newSpecify', SEP, ...TYPE_ORDER.flatMap((t) => (t === 'essay' ? Object.keys(ESSAY_KINDS).map((k) => `new:essay:${k}`) : [`new:${t}`]))]),
    'edit', 'duplicate', 'delete', 'changeType',
    sub('Calculate Values', ['recalcSelected', 'recalcAll']),
    sub('Toggle Bimodal', ['bimodalSelected', 'bimodalAll']),
    ...(test ? ['updateFromBank'] : []), SEP,
    'reorder', ...(test ? ['scramble'] : []), 'goTo', 'points', 'columns', 'narratives',
  ]]);
  if (test) {
    m.push(['Test', [
      sub('Headers', ['headerFirst', 'headerRest']),
      sub('Footers', ['footerFirst', 'footerRest']),
      sub('Instructions', TYPE_ORDER.map((t) => `instructions:${t}`)),
      'layout', 'styleGallery', 'version', SEP, 'summary',
    ]]);
  }
  m.push(['Help', ['help']]);
  return m;
}

export const KEY_LABEL = (key) => key
  ?.replace('ctrl+', '⌃').replace('cmd+', '⌘').replace(/^f(\d)/, 'F$1')
  .replace(/([⌃⌘])(.)/, (_, a, b) => a + b.toUpperCase());

export function commandFor(item) {
  return typeof item === 'string' ? COMMANDS[item] : item;
}

export function isEnabled(cmd) {
  if (app.sheetOpen && cmd !== COMMANDS.help) return false;
  return cmd.enabled ? Boolean(cmd.enabled()) : true;
}

export function runCommand(id) {
  const cmd = COMMANDS[id];
  if (cmd && isEnabled(cmd)) cmd.run();
}

app.run = runCommand;
app.editSelected = editSelected;

// Keyboard shortcuts. Plain text editing keeps its own keys inside fields.
const TEXT_KEYS = new Set(['cmd+x', 'cmd+c', 'cmd+v', 'cmd+z', 'cmd+f']);
export function handleShortcut(e) {
  const combo = `${e.ctrlKey ? 'ctrl+' : ''}${e.metaKey ? 'cmd+' : ''}${e.key.toLowerCase()}`;
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (app.dialogOpen()) return;
  if (inField && (TEXT_KEYS.has(combo) || combo.startsWith('ctrl+'))) return;
  if (combo === 'cmd+c' || combo === 'cmd+x') {
    if (String(window.getSelection())) return; // copying selected page text
  }
  const test = app.kind !== 'bank';
  for (const [id, cmd] of Object.entries(COMMANDS)) {
    if (cmd.key !== combo) continue;
    if (id === 'openTest' && !test) continue;
    if (id === 'openBank' && test) continue;
    if (!isEnabled(cmd)) continue;
    e.preventDefault();
    cmd.run();
    return;
  }
}
