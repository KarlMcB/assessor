// The Banks dropdown: a checklist of the open banks choosing which supply
// questions, which can also open and close bank files. It stores the unticked
// ones, so a newly opened bank starts out ticked.

import { app } from '../app.js';
import { store } from '../store.js';
import { chooseDocFiles, closeDoc } from '../commands.js';
import { h, add, clear } from '../ui.js';

export function shownBanks() {
  const hidden = new Set(app.view.hiddenBanks || []);
  return store.lib.banks.filter((b) => !hidden.has(b.id)).map((b) => b.id);
}

function setShown(ids) {
  app.view.hiddenBanks = store.lib.banks.filter((b) => !ids.includes(b.id)).map((b) => b.id);
  app.saveView();
}

export function bankMenu(onChange) {
  const label = h('span');
  const rows = h('div.bank-menu-rows');
  const boxes = new Map();
  let listed = '';

  const sorted = () => [...store.lib.banks].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const showLabel = () => { label.textContent = `Banks: ${shownBanks().length} of ${store.lib.banks.length}`; };
  const apply = (ids) => {
    setShown(ids);
    for (const [id, box] of boxes) box.checked = ids.includes(id);
    showLabel();
    onChange(ids);
  };
  function fill() {
    listed = store.lib.banks.map((b) => `${b.id}:${b.title}:${b.questions.length}`).join();
    boxes.clear();
    clear(rows);
    for (const b of sorted()) {
      const box = h('input', {
        type: 'checkbox',
        checked: shownBanks().includes(b.id),
        onchange: () => apply(store.lib.banks.filter((x) => boxes.get(x.id).checked).map((x) => x.id)),
      });
      boxes.set(b.id, box);
      add(rows, h('div.bank-menu-row',
        h('label.check', box, `${b.title} `, h('span.muted', `(${b.questions.length})`)),
        h('button', { type: 'button', title: `Close ${b.title}`, onclick: () => closeDoc('bank', b) }, 'Close')));
    }
    if (!store.lib.banks.length) add(rows, h('p.muted', 'No banks are open.'));
    showLabel();
  }
  fill();

  const menu = h('details.bank-menu',
    h('summary', label),
    h('div.bank-menu-panel',
      h('div.bank-menu-actions',
        h('button', { type: 'button', onclick: () => apply(store.lib.banks.map((b) => b.id)) }, 'All'),
        h('button', { type: 'button', onclick: () => apply([]) }, 'None'),
        h('button', { type: 'button', onclick: () => chooseDocFiles('bank', false) }, 'Open Bank File…')),
      rows));

  // Banks can open and close while this is showing, including by dragging one in.
  const onStoreChange = () => {
    if (!menu.isConnected) { store.removeEventListener('change', onStoreChange); return; }
    if (store.lib.banks.map((b) => `${b.id}:${b.title}:${b.questions.length}`).join() === listed) return;
    fill();
    onChange(shownBanks());
  };
  store.addEventListener('change', onStoreChange);
  const closeOutside = (e) => {
    if (!menu.isConnected) document.removeEventListener('click', closeOutside);
    else if (!menu.contains(e.target) && !e.target.closest?.('dialog.dialog')) menu.open = false;
  };
  document.addEventListener('click', closeOutside);
  return menu;
}
