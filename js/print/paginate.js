// Lays blocks out on fixed-size pages by measuring them in the DOM.
//
// A flow is one printed document (a test version, a key, …):
//   { paper: {width, height} (in), margin (in), fontCss, fontSize (pt), gap (pt),
//     columns, columnWidth (in, optional), columnRule,
//     header(pageIndex) -> html, footer(pageIndex, pageCount) -> html,
//     blocks: [{ html, wide, section, newPageBefore }], keepSections }
// Blocks never split across pages or columns. In multi-column flows a wide
// block spans all columns and starts a new band below the columns so far.

const PX_PER_IN = 96;
const COLUMN_GAP_IN = 0.3;

let measurer = null;
const cache = new Map();

function getMeasurer() {
  if (!measurer) {
    measurer = document.createElement('div');
    measurer.className = 'print-root print-measure';
    measurer.setAttribute('aria-hidden', 'true');
    document.body.append(measurer);
  }
  return measurer;
}

function styleRoot(el, flow) {
  el.style.setProperty('--print-font', flow.fontCss);
  el.style.setProperty('--print-size', `${flow.fontSize}pt`);
  el.style.setProperty('--q-gap', `${flow.gap}pt`);
}

function measure(flow, html, widthIn) {
  const key = `${flow.fontCss}|${flow.fontSize}|${flow.gap}|${widthIn}|${html}`;
  if (cache.has(key)) return cache.get(key);
  const m = getMeasurer();
  styleRoot(m, flow);
  m.style.width = `${widthIn}in`;
  m.innerHTML = `<div class="measure-box">${html}</div>`;
  const box = m.firstChild;
  const h = box.getBoundingClientRect().height / PX_PER_IN;
  const tooWide = box.scrollWidth > box.clientWidth + 2;
  const result = { h, tooWide };
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}

// Render everything once so web fonts (KaTeX) are loaded before measuring.
export async function warmUp(flows) {
  const m = getMeasurer();
  m.style.width = '6in';
  m.innerHTML = flows.flatMap((f) => f.blocks.map((b) => b.html)).join('');
  await document.fonts.ready;
  m.innerHTML = '';
  cache.clear();
}

export function paginate(flow) {
  const contentW = flow.paper.width - 2 * flow.margin;
  const cols = Math.max(1, flow.columns || 1);
  const colW = flow.columnWidth ?? (contentW - COLUMN_GAP_IN * (cols - 1)) / cols;
  const pages = [];

  let page, content, used, avail, band, bandTop, colH, col;

  const newPage = () => {
    const index = pages.length;
    page = document.createElement('div');
    page.className = 'page print-root';
    styleRoot(page, flow);
    page.style.width = `${flow.paper.width}in`;
    page.style.height = `${flow.paper.height}in`;
    page.style.padding = `${flow.margin}in`;
    const headerHtml = flow.header?.(index) || '';
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = headerHtml;
    content = document.createElement('div');
    content.className = 'page-content';
    const footer = document.createElement('div');
    footer.className = 'page-footer';
    page.append(header, content, footer);
    const headH = headerHtml ? measure(flow, `<div class="page-header">${headerHtml}</div>`, contentW).h : 0;
    const footH = measure(flow, `<div class="page-footer">${flow.footer?.(index, 99) || '&nbsp;'}</div>`, contentW).h;
    avail = flow.paper.height - 2 * flow.margin - headH - footH;
    used = 0;
    band = null;
    pages.push(page);
  };

  const closeBand = () => {
    band = null;
  };

  const openBand = () => {
    band = document.createElement('div');
    band.className = `band cols${flow.columnRule ? ' rule' : ''}`;
    band.style.gridTemplateColumns = `repeat(${cols}, ${colW}in)`;
    band.style.columnGap = `${COLUMN_GAP_IN}in`;
    for (let i = 0; i < cols; i++) band.append(Object.assign(document.createElement('div'), { className: 'col' }));
    content.append(band);
    bandTop = used;
    colH = new Array(cols).fill(0);
    col = 0;
  };

  const place = (parent, html) => {
    const div = document.createElement('div');
    div.className = 'block';
    div.innerHTML = html;
    parent.append(div);
  };

  // Height of a whole section, to start it on a new page when it won't fit.
  const sectionHeight = (section) =>
    flow.blocks.filter((b) => b.section === section).reduce((s, b) => s + measure(flow, b.html, b.wide || cols === 1 ? contentW : colW).h, 0);

  newPage();
  let lastSection = null;
  for (const block of flow.blocks) {
    if (block.newPageBefore && used > 0) newPage();
    if (flow.keepSections && block.section !== undefined && block.section !== lastSection && used > 0) {
      if (sectionHeight(block.section) > avail - used) newPage();
    }
    lastSection = block.section;

    const multi = cols > 1 && !block.wide;
    if (multi) {
      const m = measure(flow, block.html, colW);
      if (m.tooWide && !block.noWiden) {
        // Doesn't fit a column (wide table or formula): span the page instead.
        placeFull({ ...block, html: block.html });
        continue;
      }
      if (!band) openBand();
      const room = () => avail - bandTop;
      for (;;) {
        if (colH[col] + m.h <= room()) break;
        // Taller than a whole empty page: place it anyway.
        if (colH[col] === 0 && bandTop === 0) break;
        if (col < cols - 1) col++;
        else {
          newPage();
          openBand();
        }
      }
      place(band.children[col], block.html);
      colH[col] += m.h;
      used = bandTop + Math.max(...colH);
    } else {
      placeFull(block);
    }
  }

  function placeFull(block) {
    closeBand();
    const m = measure(flow, block.html, contentW);
    if (used + m.h > avail && used > 0) newPage();
    place(content, block.html);
    used += m.h;
  }

  // Footers need the page count, so they're filled in last.
  pages.forEach((p, i) => {
    p.querySelector('.page-footer').innerHTML = flow.footer?.(i, pages.length) || '';
  });
  return pages;
}
