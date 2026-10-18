// App shell: header, sidebar, routing and library file commands.

import { newBank, questionCountLabel, readBankFile, newId } from './model.js';
import { pickFile, store } from './store.js';
import { h, clear, toast, formatTime } from './ui.js';
import { homeView } from './views/home.js';
import { bankView } from './views/bank.js';
import { editorView } from './views/editor.js';

const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');
const statusEl = document.getElementById('status');
const banner = document.getElementById('banner');

let current = {};
let currentHash = null;

// ---- routing -------------------------------------------------------------------

function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'bank' && parts[1]) {
    if (parts[2] === 'q' && parts[3]) return { view: 'editor', bankId: parts[1], questionId: parts[3] };
    if (parts[2] === 'new' && parts[3]) return { view: 'editor', bankId: parts[1], newType: parts[3] };
    return { view: 'bank', bankId: parts[1], focus: params.focus };
  }
  return { view: 'home' };
}

function render() {
  current.destroy?.();
  clear(main);
  const route = parseRoute(location.hash);
  if (route.view === 'bank') current = bankView(main, route);
  else if (route.view === 'editor') current = editorView(main, route);
  else current = homeView(main, { onNewBank: createBank });
  current.route = route;
  main.scrollTop = 0;
  if (route.view !== 'bank' || !route.focus) window.scrollTo(0, 0);
  renderSidebar();
}

window.addEventListener('hashchange', () => {
  if (current.canLeave && !current.canLeave()) {
    // Stay: restore the previous hash without re-rendering.
    history.replaceState(null, '', currentHash);
    return;
  }
  currentHash = location.hash;
  render();
});

// ---- sidebar, status and banner ------------------------------------------------

function renderSidebar() {
  const activeBank = current.route?.bankId;
  clear(sidebar).append(
    h('div.side-heading', 'Question banks'),
    h(
      'nav.bank-list',
      store.lib.banks.map((b) =>
        h('a', { href: `#/bank/${b.id}`, class: b.id === activeBank ? 'active' : '' }, h('span.bank-name', b.title), h('span.count', String(b.questions.length))),
      ),
    ),
    h('button.wide', { onclick: createBank }, '+ New bank'),
    h('button.wide', { onclick: importBank }, 'Import bank…'),
  );
}

function renderStatus() {
  const st = store.status;
  if (store.hasUnsavedChanges()) {
    statusEl.textContent = `Unsaved changes since ${formatTime(st.unsavedSince)}`;
    statusEl.className = 'status dirty';
  } else {
    statusEl.textContent = st.lastFileSave ? `Saved to file ${formatTime(st.lastFileSave)}` : 'Nothing to save';
    statusEl.className = 'status';
  }
  banner.hidden = !store.needsBackupReminder();
  if (!banner.hidden) {
    clear(banner).append(
      h('span', st.lastFileSave
        ? `Changes since ${formatTime(st.unsavedSince)} aren’t in a library file yet.`
        : 'This library has never been saved to a file. The file is your backup.'),
      h('button.primary', { onclick: saveLibrary }, 'Save Library'),
    );
  }
}

store.addEventListener('change', () => {
  renderStatus();
  if (current.keepsOwnState) return;
  if (current.refresh) {
    current.refresh();
    renderSidebar();
  } else {
    render();
  }
});

// ---- commands --------------------------------------------------------------------

function createBank() {
  const title = prompt('Name for the new bank:', 'Untitled bank');
  if (title === null) return;
  const bank = newBank(title.trim() || 'Untitled bank');
  store.update((lib) => lib.banks.push(bank));
  location.hash = `#/bank/${bank.id}`;
}

async function saveLibrary() {
  await store.saveToFile();
  toast(`Saved ${store.status.lastFileName} to Downloads`);
}

async function openLibrary() {
  if (store.hasUnsavedChanges() && !store.isEmpty() &&
      !confirm('Opening a library replaces the current one, which has changes not saved to a file. Continue?')) return;
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    await store.openFromFile(file);
    location.hash = '#/';
    render();
    toast(`Opened ${file.name}`);
  } catch (err) {
    toast(err.message || 'That file couldn’t be opened', 'error');
  }
}

async function importBank() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const { bank, images } = readBankFile(JSON.parse(await file.text()));
    if (store.lib.banks.some((b) => b.id === bank.id)) {
      bank.id = newId();
      bank.title += ' (imported)';
    }
    store.update((lib) => {
      lib.banks.push(bank);
      Object.assign(lib.images, images);
    });
    location.hash = `#/bank/${bank.id}`;
    toast(`Imported ${bank.title} (${questionCountLabel(bank.questions.length)})`);
  } catch (err) {
    toast(err.message || 'That file couldn’t be imported', 'error');
  }
}

document.getElementById('save-library').addEventListener('click', saveLibrary);
document.getElementById('open-library').addEventListener('click', openLibrary);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveLibrary();
  }
});

// Write any pending change before the page goes away.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});

// ---- start -------------------------------------------------------------------------

try {
  await store.load();
} catch (err) {
  main.append(h('div.empty', h('h2', 'Storage unavailable'), h('p', `assessor couldn’t open browser storage: ${err.message}`)));
  throw err;
}
currentHash = location.hash;
renderStatus();
render();
