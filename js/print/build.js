// Assemble the printed documents for a test: each version's test pages, its
// answer key, answer strips and the version map, as paginator flows.

import { FONTS, PAPER, LETTERS, normalizeLayout, normalizePrint } from './layout.js';
import { buildVersions, versionMap } from './versions.js';
import {
  forcedWide, headerHtml, keyEntry, keySectionHeading, questionBlock, sectionHeading, stripLine, versionMapTable,
} from './render.js';

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export function buildFlows(lib, test, layoutIn, optsIn) {
  const layout = normalizeLayout(layoutIn);
  const opts = normalizePrint(optsIn);
  const built = buildVersions(test, layout, opts);
  const many = opts.versions > 1;
  const base = {
    paper: PAPER[layout.paper] ?? PAPER.letter,
    margin: layout.margin,
    fontCss: (FONTS[layout.fontFamily] ?? FONTS.serif).css,
    fontSize: layout.fontSize,
    gap: layout.questionSpacing,
  };
  const date = today();
  // With a single version, drop "Version {version}" from headers.
  const headerText = (text) => (many ? text : String(text).replace(/\s*[·|–—-]*\s*Version\s*\{version\}/gi, ''));
  const header = (letter, first, rest) => (i) =>
    headerHtml(headerText(i === 0 ? first : rest), { title: test.title, version: letter, date });
  const footer = (letter) => (i, n) => headerHtml(headerText(layout.footer), { title: test.title, version: letter, date, page: i + 1, pages: n });

  const testFlows = [];
  const keyFlows = [];
  const stripFlows = [];

  for (const v of built.versions) {
    // Test pages
    const blocks = [];
    if (layout.nameLine) blocks.push({ html: `<div class="name-line">${headerHtml(layout.nameLineText, {})}</div>`, wide: true });
    v.sections.forEach((section, si) => {
      section.items.forEach((entry, k) => {
        const heading = k === 0 ? sectionHeading(section, layout) : '';
        const html = heading + questionBlock(entry, { layout, images: lib.images, version: v.letter, columns: layout.columns });
        blocks.push({ html, wide: forcedWide(entry.question), section: si });
      });
    });
    testFlows.push({
      ...base,
      kind: 'test',
      letter: v.letter,
      columns: layout.columns,
      columnRule: layout.columnRule,
      keepSections: layout.typeNewPage,
      header: header(v.letter, layout.headerFirst, layout.headerRest),
      footer: footer(v.letter),
      blocks,
    });

    // Answer key
    const keyBlocks = [];
    v.sections.forEach((section) => {
      section.items.forEach((entry, k) => {
        keyBlocks.push({ html: (k === 0 ? keySectionHeading(section) : '') + keyEntry(entry, { layout, images: lib.images, version: v.letter }) });
      });
    });
    keyFlows.push({
      ...base,
      kind: 'key',
      letter: v.letter,
      columns: 1,
      gap: 6,
      header: (i) => headerHtml(i === 0 ? `**Answer Key:** {title}${many ? '  ·  Version {version}' : ''}` : `Answer Key: {title}${many ? '  ·  Version {version}' : ''}`, { title: test.title, version: v.letter, date }),
      footer: footer(v.letter),
      blocks: keyBlocks,
    });

    // Answer strip: narrow columns to hold beside the test while marking
    const stripBlocks = v.sections.flatMap((s) => s.items.map((entry) => ({ html: stripLine(entry, layout, v.letter, lib.images), noWiden: true })));
    stripFlows.push({
      ...base,
      kind: 'strip',
      letter: v.letter,
      columns: 4,
      columnWidth: 1.5,
      columnRule: true,
      gap: 0,
      header: () => headerHtml(`Answer strip: {title}${many ? '  ·  Version {version}' : ''}`, { title: test.title, version: v.letter }),
      footer: () => '',
      blocks: stripBlocks,
    });
  }

  const flows = [];
  if (opts.interleave) {
    built.versions.forEach((v, i) => {
      if (opts.includeTests) flows.push(testFlows[i]);
      if (opts.includeKeys) flows.push(keyFlows[i]);
      if (opts.includeStrip) flows.push(stripFlows[i]);
    });
  } else {
    if (opts.includeTests) flows.push(...testFlows);
    if (opts.includeKeys) flows.push(...keyFlows);
    if (opts.includeStrip) flows.push(...stripFlows);
  }

  if (opts.includeMap && many) {
    const rows = versionMap(built, layout);
    const letters = LETTERS.slice(0, opts.versions).split('');
    const chunk = 34;
    const blocks = [];
    for (let i = 0; i < rows.length; i += chunk) blocks.push({ html: versionMapTable(rows.slice(i, i + chunk), letters) });
    flows.push({
      ...base,
      kind: 'map',
      columns: 1,
      gap: 8,
      header: () => headerHtml('**Version map:** {title}', { title: test.title }),
      footer: () => '<span class="muted-print">Each row is a question in the test’s own order; columns give its number in each version.</span>',
      blocks,
    });
  }
  return { flows, built, layout, opts };
}
