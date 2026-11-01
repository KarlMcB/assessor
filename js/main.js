// The application window: title bar, menu bar, toolbar, document area and
// status bar, plus routing. Sub-windows (question editor, selection, print…)
// open as sheets over the document.

import { totalPoints } from './testmodel.js';
import { store } from './store.js';
import { app } from './app.js';
import { h, add, clear, formatTime } from './ui.js';
import { bankContainer, testContainer } from './containers.js';
import { documentEntries, documentView, questionCount } from './views/document.js';
import { editorView } from './views/editor.js';
import { selectView } from './views/select.js';
import { wizardView, summaryView } from './views/wizard.js';
import { printView } from './views/print.js';
import { COMMANDS, KEY_LABEL, commandFor, handleShortcut, isEnabled, menus, noteRecent, setZoom } from './commands.js';

const main = document.getElementById('main');
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheet-body');
const menubar = document.getElementById('menubar');
const toolbar = document.getElementById('toolbar');
const docbar = document.getElementById('docbar');
const titleEl = document.getElementById('doc-title');
const statusEl = document.getElementById('status');
const banner = document.getElementById('banner');

let docView = null;
let docKey = null;
let sheetView = {};
let currentHash = null;

// ---- routing ------------------------------------------------------------------------

function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const parts = path.split('/').filter(Boolean);
  if ((parts[0] === 'bank' || parts[0] === 'test') && parts[1]) {
    const kind = parts[0];
    const base = { kind, id: parts[1], [`${kind}Id`]: parts[1] };
    if (parts[2] === 'q' && parts[3]) return { ...base, sheet: 'editor', questionId: parts[3] };
    if (parts[2] === 'new' && parts[3]) return { ...base, sheet: 'editor', newType: parts[3], newKind: params.kind };
    if (kind === 'test' && parts[2] === 'add' && parts[3]) return { ...base, sheet: 'select', method: parts[3] };
    if (kind === 'test' && parts[2] === 'summary') return { ...base, sheet: 'summary' };
    if (kind === 'test' && parts[2] === 'print') return { ...base, sheet: 'print' };
    return { ...base, focus: params.focus };
  }
  if (parts[0] === 'wizard') return { sheet: 'wizard' };
  if (parts[0] === 'empty') return {};
  return { start: true };
}

function findDoc(route) {
  if (route.kind === 'test') return store.lib.tests.find((t) => t.id === route.id) ?? null;
  if (route.kind === 'bank') return store.lib.banks.find((b) => b.id === route.id) ?? null;
  return null;
}

function render() {
  sheetView.destroy?.();
  sheetView = {};
  const route = parseRoute(location.hash);
  const doc = findDoc(route);

  // The document behind any sheet
  const key = doc ? `${route.kind}:${doc.id}` : null;
  if (key !== docKey) {
    docKey = key;
    app.kind = doc ? route.kind : null;
    app.doc = doc;
    app.selectedId = null;
    clear(main);
    docView = doc ? documentView(main, route.kind, doc) : null;
    if (doc) {
      noteRecent(route.kind, doc.id);
      main.scrollTop = 0;
    }
  } else {
    app.doc = doc;
    docView?.refresh();
  }
  if (route.focus) app.select(route.focus, true);

  // The sheet or start window
  clear(sheetBody);
  const showStart = route.start;
  sheet.hidden = !route.sheet && !showStart;
  sheet.classList.toggle('start', Boolean(showStart));
  sheet.classList.toggle('wide', route.sheet === 'print');
  document.body.classList.toggle('has-sheet', !sheet.hidden);
  app.sheetOpen = Boolean(route.sheet);
  sheetBody.scrollTop = 0;

  if (route.sheet === 'editor') sheetView = editorView(sheetBody, { ...route, container: doc && (route.kind === 'test' ? testContainer(doc) : bankContainer(doc)) });
  else if (route.sheet === 'select') sheetView = selectView(sheetBody, { testId: route.id, method: route.method });
  else if (route.sheet === 'summary') sheetView = summaryView(sheetBody, { testId: route.id });
  else if (route.sheet === 'print') sheetView = printView(sheetBody, { testId: route.id });
  else if (route.sheet === 'wizard') sheetView = wizardView(sheetBody);
  else if (showStart) startWindow();

  refreshChrome();
}

window.addEventListener('hashchange', () => {
  if (sheetView.canLeave && !sheetView.canLeave()) {
    history.replaceState(null, '', currentHash);
    return;
  }
  currentHash = location.hash;
  render();
});

function closeSheet() {
  location.hash = app.doc ? `#/${app.kind}/${app.doc.id}` : '#/';
}

// ---- start window ---------------------------------------------------------------------

function startWindow() {
  const tile = (icon, label, cmd) => h('button.start-tile', { type: 'button', onclick: () => COMMANDS[cmd].run() },
    h('span.start-icon', { html: ICONS[icon] }), h('span', label));
  add(sheetBody,
    h('div.start',
      h('h1', 'What do you want to do?'),
      h('div.start-grid',
        tile('wizard', 'Create a new test using a wizard', 'wizard'),
        tile('newBank', 'Create a new question bank', 'newBank'),
        tile('new', 'Create a new test from scratch', 'newTest'),
        tile('openBank', 'Open an existing question bank', 'openBank'),
        tile('open', 'Open an existing test', 'openTest'),
        tile('library', 'Open a library file from a backup', 'openLibrary')),
      h('div.start-foot',
        h('button', { type: 'button', onclick: () => COMMANDS.help.run() }, 'Help'),
        h('span.muted', libraryLine()),
        h('button', { type: 'button', onclick: () => { location.hash = '#/empty'; } }, 'Close'))));
}

function libraryLine() {
  const t = store.lib.tests.length;
  const b = store.lib.banks.length;
  return `${t} test${t === 1 ? '' : 's'}, ${b} question bank${b === 1 ? '' : 's'}`;
}

// ---- menu bar -----------------------------------------------------------------------------

let openMenuIndex = -1;

function closeMenus() {
  openMenuIndex = -1;
  renderMenubar();
}

function menuList(items) {
  const ul = h('div.menu', { role: 'menu' });
  for (const raw of items) {
    if (raw === '-') {
      ul.append(h('div.menu-sep'));
      continue;
    }
    if (raw.items) {
      ul.append(h('div.menu-item.has-sub', { role: 'menuitem', tabindex: -1 },
        h('span.menu-check'), h('span.menu-label', raw.label), h('span.menu-arrow', '›'), menuList(raw.items)));
      continue;
    }
    const cmd = commandFor(raw);
    const enabled = isEnabled(cmd);
    const checked = cmd.checked?.();
    ul.append(h('button.menu-item', {
      type: 'button',
      role: 'menuitem',
      disabled: !enabled,
      onclick: () => {
        closeMenus();
        cmd.run();
      },
    }, h('span.menu-check', checked ? '✓' : ''), h('span.menu-label', cmd.label), h('span.menu-key', KEY_LABEL(cmd.key) || '')));
  }
  return ul;
}

function renderMenubar() {
  clear(menubar);
  menus().forEach(([title, items], i) => {
    const wrap = h('div.menu-root', { class: i === openMenuIndex ? 'open' : '' },
      h('button.menu-title', {
        type: 'button',
        'aria-haspopup': 'true',
        'aria-expanded': String(i === openMenuIndex),
        onclick: (e) => {
          e.stopPropagation();
          openMenuIndex = openMenuIndex === i ? -1 : i;
          renderMenubar();
        },
        onmouseenter: () => {
          if (openMenuIndex !== -1 && openMenuIndex !== i) {
            openMenuIndex = i;
            renderMenubar();
          }
        },
      }, title));
    if (i === openMenuIndex) wrap.append(menuList(items));
    menubar.append(wrap);
  });
}

document.addEventListener('click', (e) => {
  if (openMenuIndex !== -1 && !e.target.closest('.menu-item.has-sub')) closeMenus();
});

// ---- toolbar ------------------------------------------------------------------------------

const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  wizard: svg('<path d="M4 20 15 9"/><path d="m13 7 4 4"/><path d="M18 3v4M16 5h4M6 4v2M5 5h2M20 14v2M19 15h2"/>'),
  new: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  open: svg('<path d="M3 19V6h6l2 2h8v3"/><path d="M3 19l3-8h15l-3 8z"/>'),
  save: svg('<path d="M4 4h13l3 3v13H4z"/><path d="M8 4v5h7V4M7 20v-7h10v7"/>'),
  print: svg('<path d="M7 8V3h10v5"/><path d="M7 17H4V8h16v9h-3"/><path d="M7 14h10v7H7z"/>'),
  find: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>'),
  replace: svg('<path d="M4 8h12l-3-3M20 16H8l3 3"/>'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>'),
  bimodal: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>'),
  reorder: svg('<path d="M8 4v16l-3-3M16 20V4l3 3"/>'),
  scramble: svg('<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M19 5l2 2-2 2M19 15l2 2-2 2"/>'),
  style: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>'),
  mix: svg('<path d="M5 6h6M5 12h14M5 18h9"/><circle cx="16" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>'),
  random: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>'),
  view: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  standard: svg('<path d="M5 21V4h13l-3 4 3 4H5"/>'),
  criteria: svg('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
  all: svg('<path d="M3 12l4 4 7-8M10 16l1 0 7-8"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  newBank: svg('<rect x="6" y="3" width="14" height="14" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/><path d="M13 7v6M10 10h6"/>'),
  openBank: svg('<rect x="6" y="3" width="14" height="14" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/><path d="M10 8h6M10 12h6"/>'),
  library: svg('<path d="M5 4v16M10 4v16M15 5l4 15"/>'),
};

function toolButton(icon, id, title) {
  const cmd = COMMANDS[id];
  return h('button.tool', { type: 'button', title: `${title}${cmd.key ? ` (${KEY_LABEL(cmd.key)})` : ''}`, 'aria-label': title, disabled: !isEnabled(cmd), html: ICONS[icon], onclick: () => cmd.run() });
}

function renderToolbar() {
  toolbar.hidden = !app.view.toolbar;
  clear(toolbar);
  const test = app.kind !== 'bank';
  const sep = () => h('span.tool-sep');
  add(toolbar,
    test ? toolButton('wizard', 'wizard', 'QuickTest Wizard') : null,
    toolButton('new', test ? 'newTest' : 'newBank', test ? 'New Test' : 'New Question Bank'),
    toolButton('open', test ? 'openTest' : 'openBank', test ? 'Open Test' : 'Open Question Bank'),
    toolButton('save', 'save', 'Save'),
    toolButton('print', 'print', 'Print'),
    sep(),
    toolButton('find', 'find', 'Find'),
    toolButton('replace', 'replace', 'Replace'),
    sep(),
    toolButton('calc', 'recalcSelected', 'Calculate Values'),
    toolButton('bimodal', 'bimodalSelected', 'Toggle Bimodal'),
    sep(),
    toolButton('reorder', 'reorder', 'Reorder Questions'),
    test ? toolButton('scramble', 'scramble', 'Scramble') : null,
    test ? toolButton('style', 'styleGallery', 'Style Gallery') : null,
    toolButton('mix', 'mixTypes', 'Mix Question Types'),
    sep(),
    h('select.tool-zoom', { 'aria-label': 'Zoom', disabled: !app.doc || app.sheetOpen, onchange: (e) => setZoom(Number(e.target.value)) },
      [0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => h('option', { value: z, selected: z === app.view.zoom }, `${Math.round(z * 100)}%`))),
    test ? sep() : null,
    test ? toolButton('random', 'select:random', 'Select Randomly') : null,
    test ? toolButton('list', 'select:list', 'Select From a List') : null,
    test ? toolButton('view', 'select:view', 'Select While Viewing') : null,
    test ? toolButton('standard', 'select:standard', 'Select by Standard') : null,
    test ? toolButton('criteria', 'select:criteria', 'Select by Criteria') : null,
    test ? toolButton('all', 'select:all', 'Select All Questions') : null,
    sep(),
    toolButton('help', 'help', 'Help'),
  );
}

// ---- status bar and title -------------------------------------------------------------------

function renderDocbar() {
  clear(docbar);
  docbar.hidden = !app.doc;
  if (!app.doc) return;
  const selectedEntry = app.selectedId ? documentEntries(app.kind, app.doc).find((e) => e.q.id === app.selectedId) : null;
  const n = questionCount(app.kind, app.doc);
  const points = app.kind === 'test' ? totalPoints(app.doc) : app.doc.questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
  const button = (label, id) => h('button', { type: 'button', disabled: !isEnabled(COMMANDS[id]), onclick: () => COMMANDS[id].run() }, label);
  add(docbar,
    button('New…', 'newSpecify'), button('Edit…', 'edit'), button('Delete', 'delete'),
    h('span.docbar-info', selectedEntry ? describe(selectedEntry) : 'Click a question to select it. Double-click to edit it.'),
    h('span.docbar-count', `${app.kind === 'test' ? 'Total questions on test' : 'Questions in bank'}: ${n}  ·  Points: ${points}`));
}

function describe(e) {
  const pts = `${e.q.points} pt${Number(e.q.points) === 1 ? '' : 's'}`;
  if (app.kind !== 'test') return `Question ${e.number} · ${pts}`;
  const bank = store.lib.banks.find((b) => b.id === e.item?.sourceBankId);
  return `Question ${e.number} · ${pts} · ${bank ? `from ${bank.title}` : e.item?.sourceBankId ? 'bank question deleted' : 'written for this test'}`;
}

function renderTitle() {
  const mode = app.kind === 'bank' ? 'Question Bank Editor' : 'Test Builder';
  titleEl.textContent = app.doc ? `${app.doc.title} — ${mode}` : 'Assessor';
  document.title = app.doc ? `${app.doc.title} — Assessor` : 'Assessor';
  const st = store.status;
  if (store.hasUnsavedChanges()) {
    statusEl.textContent = `Backup needed: changes since ${formatTime(st.unsavedSince)}`;
    statusEl.className = 'status dirty';
  } else {
    statusEl.textContent = st.lastFileSave ? `Backed up ${formatTime(st.lastFileSave)}` : '';
    statusEl.className = 'status';
  }
  banner.hidden = !store.needsBackupReminder();
  if (!banner.hidden) {
    add(clear(banner),
      h('span', st.lastFileSave
        ? `Changes since ${formatTime(st.unsavedSince)} aren’t in a library file yet.`
        : 'This library has never been saved to a file. The file is your backup.'),
      h('button.primary', { type: 'button', onclick: () => COMMANDS.saveLibrary.run() }, 'Save Library File'));
  }
}

function refreshChrome() {
  renderTitle();
  renderMenubar();
  renderToolbar();
  renderDocbar();
}

// ---- shared actions ---------------------------------------------------------------------------

app.select = (id, scroll = false) => {
  app.selectedId = id;
  docView?.showSelection(scroll);
  refreshChrome();
};

app.refresh = () => {
  docView?.refresh();
  docView?.showSelection();
  refreshChrome();
};

app.afterUndo = () => {
  // Undo replaces the library objects, so re-attach to the open document.
  docKey = null;
  render();
};

store.addEventListener('change', () => {
  const route = parseRoute(location.hash);
  const fresh = findDoc(route);
  if (route.id && fresh !== app.doc) {
    docKey = null;
    if (!route.sheet) return render();
    app.doc = fresh;
  }
  docView?.refresh();
  docView?.showSelection();
  refreshChrome();
  if (route.start && !sheetBody.querySelector('.start')) render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openMenuIndex !== -1) return closeMenus();
    if (app.sheetOpen && !app.dialogOpen()) return closeSheet();
  }
  handleShortcut(e);
});

document.getElementById('sheet-close').addEventListener('click', closeSheet);

// Write any pending change before the page goes away.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});

// ---- start ----------------------------------------------------------------------------------------

try {
  await store.load();
} catch (err) {
  add(clear(main), h('div.empty', h('h2', 'Storage unavailable'), h('p', `Assessor couldn’t open browser storage: ${err.message}`)));
  throw err;
}
clear(main);
currentHash = location.hash;
render();
