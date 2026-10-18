// Build Schoology import tests with assessor's own exporter (js/export/qti.js).
// Usage: node schoology-tests/build_assessor_export_tests.mjs
//   -> schoology-tests/assessor_export_fixed.zip  (every type, fixed values)
//   -> schoology-tests/assessor_export_pool.zip   (a dynamic question as a 5-variant random-pick group)

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { newLibrary, newQuestion } from '../js/model.js';
import { exportZip } from '../js/export/qti.js';

const here = new URL('.', import.meta.url);

// A 120x60 PNG: red square, blue square.
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) row.push(...(x < w / 2 ? [204, 51, 51] : [51, 51, 204]));
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const lib = newLibrary();
lib.images.diagram = `data:image/png;base64,${png(120, 60).toString('base64')}`;

const qs = [];
let q = newQuestion('mc');
q.stem = 'Test 1 (multiple choice, math, image). A 2.0 kg cart moves at 5.0 m/s. Using $K = \\frac{1}{2}mv^2$, what is its kinetic energy?\n\n![two squares](img:diagram|120)';
['$5\\ \\mathrm{J}$', '$10\\ \\mathrm{J}$', '$25\\ \\mathrm{J}$', '$50\\ \\mathrm{J}$'].forEach((t, i) => (q.choices[i].text = t));
q.choices[2].correct = true;
q.points = 2;
q.rationale = '$K = \\frac{1}{2}(2.0)(5.0)^2 = 25\\ \\mathrm{J}$';
qs.push(q);

q = newQuestion('tf');
q.stem = 'Test 2 (true/false with feedback). Inertia is a force.';
q.answer = false;
q.rationale = 'Inertia is a property of matter, not a force.';
qs.push(q);

q = newQuestion('mr');
q.stem = 'Test 3 (multiple answers). Which are vectors? Select all that apply.';
['$\\vec{v}$ velocity', 'speed', '$\\vec{F}$ force', 'mass'].forEach((t, i) => { q.choices[i].text = t; q.choices[i].correct = i % 2 === 0; });
qs.push(q);

q = newQuestion('num');
q.algorithm = 'v0 = range(10, 30, 0.5)\ntheta = range(20, 70, 5)\nR = v0^2*sind(2*theta)/9.8 :: dp 1';
q.stem = 'Test 4 (dynamic numeric as fill-in-the-blank). A ball is launched at $[[v0]]\\ \\mathrm{m/s}$ at $[[theta]]^\\circ$ above level ground. Using\n$$R = \\frac{v_0^2 \\sin 2\\theta}{g}$$\nhow far does it land, in metres? Give one decimal place.';
q.answer.value = '[[R]]';
q.answer.unit = 'm';
q.points = 3;
qs.push(q);

q = newQuestion('essay');
q.kind = 'problem';
q.stem = 'Test 5 (essay with model answer as feedback). Explain why a passenger lurches forward when a bus brakes suddenly.';
q.answer.model = 'The passenger’s body keeps moving at the bus’s original speed (inertia) while the bus slows.';
q.points = 4;
qs.push(q);

const fixed = exportZip(lib, 'assessor export test (fixed values)', qs.map((x) => ({ question: x, seed: `demo|A|${x.id}`, version: 'A' })), { feedback: true });
const dyn = qs[3];
const pool = exportZip(lib, 'assessor export test (variant pool)', [
  { question: qs[1], seed: `demo|A|${qs[1].id}`, version: 'A' },
  { group: [1, 2, 3, 4, 5].map((k) => ({ question: dyn, seed: `demo|pool${k}|${dyn.id}`, version: 'A' })), points: 3 },
], { feedback: true });

for (const [name, pkg] of [['assessor_export_fixed.zip', fixed], ['assessor_export_pool.zip', pool]]) {
  writeFileSync(new URL(name, here), Buffer.from(await pkg.blob.arrayBuffer()));
  const answers = [...pkg.assessment.matchAll(/<varequal respident="response1">([^<]*)<\/varequal>/g)].map((m) => m[1]).filter((a) => !a.startsWith('assessor_'));
  console.log(`wrote ${name}: ${pkg.points} points; fill-in answers: ${answers.join(' | ')}`);
}
