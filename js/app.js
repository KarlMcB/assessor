// State shared by the window, the document page and the menu commands.
// main.js fills in the functions that need the window.

function loadView() {
  const defaults = { toolbar: true, variableNames: false, tags: true, answers: true, zoom: 1 };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('assessor-view') || '{}') };
  } catch {
    return defaults;
  }
}

export const app = {
  kind: null, // 'test' | 'bank' | null
  doc: null,
  selectedId: null,
  clipboard: null,
  sheetOpen: false,
  dialogOpen: () => Boolean(document.querySelector('dialog[open]')),
  view: loadView(),
  saveView() {
    try {
      localStorage.setItem('assessor-view', JSON.stringify(this.view));
    } catch {
      // A per-browser convenience only.
    }
  },
  // Set by main.js / commands.js:
  select: () => {},
  editSelected: () => {},
  run: () => {},
  refresh: () => {},
};
