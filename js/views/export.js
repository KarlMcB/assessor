// "Export to Schoology" dialog for tests and banks.

import { isDynamic } from '../algo/engine.js';
import { exportZip, testEntries, bankEntries, zipFileName } from '../export/qti.js';
import { displayOrder } from '../testmodel.js';
import { LETTERS } from '../print/layout.js';
import { store } from '../store.js';
import { h, field, select, toast, openDialog } from '../ui.js';

export function exportDialog({ test = null, bank = null }) {
  const questions = test ? displayOrder(test).map((it) => it.question) : bank.questions.filter((q) => !q.flags.doNotUse);
  if (!questions.length) return toast('There are no questions to export');
  const dynamicCount = questions.filter(isDynamic).length;
  const opts = { title: test?.title ?? bank.title, mode: 'fixed', version: 'A', poolSize: 5, feedback: true };

  const poolRow = h('div.row', { hidden: true },
    field('Variants per question', h('input.narrow', { type: 'number', min: 2, max: 20, value: opts.poolSize, onchange: (e) => (opts.poolSize = Math.min(20, Math.max(2, Number(e.target.value) || 5))) })));

  const body = [
    field('Quiz title in Schoology', h('input', { value: opts.title, onchange: (e) => (opts.title = e.target.value.trim() || opts.title) })),
    h('label.check', h('input', { type: 'checkbox', checked: true, onchange: (e) => (opts.feedback = e.target.checked) }), 'Include rationales (and model answers) as feedback'),
    dynamicCount
      ? h('div.export-dynamic',
          h('p', `${dynamicCount} dynamic question${dynamicCount === 1 ? '' : 's'}. Schoology can’t recalculate values, so choose:`),
          h('label.check', h('input', { type: 'radio', name: 'mode', checked: true, onchange: () => { opts.mode = 'fixed'; poolRow.hidden = true; } }),
            'Fixed values', test ? [' from version ', select(Object.fromEntries([...LETTERS].map((l) => [l, l])), 'A', { onchange: (e) => (opts.version = e.target.value) })] : null),
          h('label.check', h('input', { type: 'radio', name: 'mode', onchange: () => { opts.mode = 'pool'; poolRow.hidden = false; } }),
            'A pool of variants: each student gets one at random'),
          poolRow,
          h('p.field-hint', 'Pools use a random-pick question group. Schoology’s handling of these hasn’t been checked yet, so try one before relying on it.'))
      : null,
    h('p.field-hint', 'Numeric questions become fill-in-the-blank with their accepted answers. Import the zip in Schoology with Resources → Import → Common Cartridge (IMSCC or ZIP).'),
  ];

  openDialog('Export to Schoology', body, [
    { label: 'Cancel' },
    {
      label: 'Download zip',
      primary: true,
      onclick: () => {
        const entries = test ? testEntries(test, opts) : bankEntries(bank, opts);
        const { blob, points } = exportZip(store.lib, opts.title, entries, { feedback: opts.feedback });
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: zipFileName(opts.title) });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast(`Exported ${entries.length} question${entries.length === 1 ? '' : 's'} (${points} points)`);
      },
    },
  ]);
}
