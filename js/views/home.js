// Start page: library overview and how saving works.

import { questionCountLabel } from '../model.js';
import { store } from '../store.js';
import { h, formatTime } from '../ui.js';

export function homeView(main, { onNewBank }) {
  const lib = store.lib;
  const total = lib.banks.reduce((n, b) => n + b.questions.length, 0);
  const st = store.status;

  main.append(
    h('h2', 'Library'),
    lib.banks.length
      ? h(
          'div.bank-grid',
          lib.banks.map((b) =>
            h('a.bank-tile', { href: `#/bank/${b.id}` }, h('strong', b.title), b.subtitle ? h('span.muted', b.subtitle) : null, h('span', questionCountLabel(b.questions.length))),
          ),
        )
      : h('div.empty', h('p', 'No question banks yet.'), h('button.primary', { onclick: onNewBank }, 'Create your first bank')),
    lib.banks.length ? h('p.muted', `${lib.banks.length} bank${lib.banks.length === 1 ? '' : 's'}, ${questionCountLabel(total)} in total.`) : null,

    h('h2', 'Saving'),
    h(
      'div.info-card',
      h('p', 'Your work is kept in this browser as you go. The ', h('strong', 'library file'), ' is your real copy: use ', h('strong', 'Save Library'), ' (⌘S) to download it, and ', h('strong', 'Open Library'), ' to load it on this or another Mac.'),
      h(
        'dl.status-list',
        h('dt', 'Last saved to a file'),
        h('dd', st.lastFileSave ? `${formatTime(st.lastFileSave)} (${st.lastFileName})` : 'never'),
        h('dt', 'Changes since then'),
        h('dd', store.hasUnsavedChanges() ? `yes, since ${formatTime(st.unsavedSince)}` : 'none'),
        h('dt', 'Browser storage'),
        h('dd', st.persisted ? 'persistent (Safari won’t clear it)' : 'not marked persistent; Safari may clear it if unused for a while. Adding assessor to the Dock helps, and the library file is your backup either way.'),
      ),
    ),
  );
  return {};
}
