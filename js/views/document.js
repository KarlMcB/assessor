// The open test or question bank, shown as a white page on a grey desk.
// Click a question to select it; double-click to edit it.

import { ESSAY_KINDS, QUESTION_TYPES, TYPE_ORDER, narrativeOf } from '../model.js';
import { differsFromSource, typeGroups } from '../testmodel.js';
import { bankSeed, testSeed } from '../containers.js';
import { narrativeFor } from '../print/versions.js';
import { normalizeLayout } from '../print/layout.js';
import { isDynamic } from '../algo/engine.js';
import { store } from '../store.js';
import { metaChips, narrativeBody, narrativeContext, questionBody, questionProblems } from '../question-view.js';
import { renderInline } from '../richtext.js';
import { app } from '../app.js';
import { h, add, clear } from '../ui.js';

// Sections of the document, in display order: [{ type, entries: [{ q, item, number, count }] }]
export function documentSections(kind, doc) {
  let number = 0;
  const entry = (q, item = null) => {
    const count = q.type === 'match' ? Math.max(1, q.pairs.length) : 1;
    const e = { q, item, number: number + 1, count };
    number += count;
    return e;
  };
  if (kind === 'test') {
    return typeGroups(doc).map((g) => ({ type: g.type, entries: g.items.map((it) => entry(it.question, it)) }));
  }
  if (doc.mixTypes) return [{ type: null, entries: doc.questions.map((q) => entry(q)) }];
  return TYPE_ORDER.map((type) => ({ type, questions: doc.questions.filter((q) => q.type === type) }))
    .filter((s) => s.questions.length)
    .map((s) => ({ type: s.type, entries: s.questions.map((q) => entry(q)) }));
}

export function documentEntries(kind, doc) {
  return documentSections(kind, doc).flatMap((s) => s.entries);
}

export function questionCount(kind, doc) {
  return kind === 'test' ? doc.items.length : doc.questions.length;
}

export function seedFor(kind, doc, q) {
  return kind === 'test' ? testSeed(doc, q) : bankSeed(q);
}

function narrativeContextFor(kind, doc, q) {
  if (kind === 'test') return narrativeFor(doc, q, doc.version || 'A');
  const n = narrativeOf(doc, q);
  return narrativeContext(n, n?.id);
}

function sectionLabel(section) {
  if (section.type === 'essay') {
    const kinds = new Set(section.entries.map((e) => e.q.kind));
    return kinds.size === 1 ? ESSAY_KINDS[[...kinds][0]] : 'Short Answer, Problem and Essay';
  }
  return QUESTION_TYPES[section.type].label;
}

export function documentView(main, kind, doc) {
  const page = h('div.doc-page');
  main.append(page);

  function row(e) {
    const { q, number, count } = e;
    const seed = seedFor(kind, doc, q);
    const narrative = narrativeContextFor(kind, doc, q);
    const problems = questionProblems(q, seed, narrative);
    const edited = kind === 'test' && e.item && differsFromSource(store.lib, e.item);
    const tags = [];
    if (app.view.tags) {
      if (isDynamic(q)) tags.push(h('span.dq-tag', { title: 'Dynamic: values change between versions' }, '⟳'));
      if (q.type === 'bimodal') tags.push(h('span.dq-tag', { title: 'Bimodal question' }, '◐'));
      if (edited) tags.push(h('span.dq-tag', { title: 'This copy differs from the bank question' }, '✎'));
    }
    if (problems.length) tags.push(h('span.dq-tag.warn', { title: problems.join('\n') }, '!'));
    return h(
      'div.dq',
      {
        'data-qid': q.id,
        class: `${q.id === app.selectedId ? 'selected' : ''} ${q.flags.doNotUse ? 'do-not-use' : ''}`,
        onclick: () => app.select(q.id),
        ondblclick: () => app.editSelected(),
      },
      h('div.dq-tags', tags),
      h('div.dq-number', count > 1 ? `${number}–${number + count - 1}.` : `${number}.`),
      h('div.dq-body',
        questionBody(q, store.lib.images, {
          showAnswer: app.view.answers,
          showRationale: app.view.answers,
          seed,
          narrative,
          version: kind === 'test' ? doc.version || 'A' : 'A',
          showVariableNames: app.view.variableNames,
        }),
        app.view.tags && metaChips(q).length ? h('div.q-meta', metaChips(q)) : null),
    );
  }

  function refresh() {
    clear(page);
    page.style.zoom = app.view.zoom;
    if (kind === 'test') {
      const layout = normalizeLayout(doc.layout, store.lib.settings.printLayout);
      add(page,
        h('div.doc-nameline', h('span', layout.nameLine ? layout.nameLineText : ''), h('strong', `ID: ${doc.version || 'A'}`)),
        h('div.doc-title', { ondblclick: () => app.run('testTitle') }, doc.title));
    } else {
      add(page, h('div.doc-title', { ondblclick: () => app.run('testTitle') }, doc.title, doc.subtitle ? h('div.doc-subtitle', doc.subtitle) : null));
    }
    const layout = kind === 'test' ? normalizeLayout(doc.layout, store.lib.settings.printLayout) : null;
    const sections = documentSections(kind, doc);
    if (!sections.length) {
      add(page, h('p.doc-empty', kind === 'test'
        ? 'Empty test. Use the Select menu to add questions from your banks, or New… to write one.'
        : 'Empty bank. Use New… to write a question, or File → Import.'));
    }
    for (const s of sections) {
      if (s.type) {
        add(page, h('div.doc-section', {
          ondblclick: kind === 'test' ? () => app.run(`instructions:${s.type}`) : null,
          title: kind === 'test' ? 'Double-click to edit the instructions' : null,
        },
        h('div.doc-section-title', sectionLabel(s)),
        layout?.showInstructions ? h('div.doc-instructions', { html: renderInline(layout.instructions[s.type] || '') }) : null));
      }
      let prev = null;
      for (const e of s.entries) {
        const n = narrativeOf(doc, e.q);
        if (n && n.id !== prev) {
          const ctx = narrativeContextFor(kind, doc, e.q);
          add(page, h('div.doc-narrative', { ondblclick: () => app.run('narratives'), title: `Narrative: ${n.title}` },
            h('div', { html: narrativeBody(n, store.lib.images, { seed: ctx.seed, version: kind === 'test' ? doc.version || 'A' : 'A' }) })));
        }
        prev = n?.id ?? null;
        add(page, row(e));
      }
    }
    const missing = app.selectedId && !documentEntries(kind, doc).some((e) => e.q.id === app.selectedId);
    if (missing) app.selectedId = null;
  }

  // Mark the selection without rebuilding the page.
  function showSelection(scroll = false) {
    page.querySelectorAll('.dq.selected').forEach((el) => el.classList.remove('selected'));
    const el = app.selectedId && page.querySelector(`[data-qid="${app.selectedId}"]`);
    if (el) {
      el.classList.add('selected');
      if (scroll) el.scrollIntoView({ block: 'center' });
    }
  }

  refresh();
  return { refresh, showSelection };
}

