// Minimal in-browser test runner. Open tests.html (served over http).

import modelTests from './model.test.js';
import richtextTests from './richtext.test.js';
import algoTests from './algo.test.js';
import testModelTests from './testmodel.test.js';
import printTests from './print.test.js';
import exportTests from './export.test.js';
import importTests from './import.test.js';

const suites = { model: modelTests, richtext: richtextTests, algorithm: algoTests, tests: testModelTests, printing: printTests, export: exportTests, import: importTests };
const results = document.getElementById('results');
let passed = 0;
let failed = 0;

for (const [suite, tests] of Object.entries(suites)) {
  const heading = document.createElement('h2');
  heading.textContent = suite;
  results.append(heading);
  for (const [name, fn] of Object.entries(tests)) {
    const line = document.createElement('div');
    try {
      await fn();
      passed++;
      line.className = 'pass';
      line.textContent = `✓ ${name}`;
    } catch (err) {
      failed++;
      line.className = 'fail';
      line.textContent = `✗ ${name}`;
      const pre = document.createElement('pre');
      pre.textContent = err.message;
      line.append(pre);
    }
    results.append(line);
  }
}

const summary = document.getElementById('summary');
summary.textContent = `${passed} passed, ${failed} failed`;
summary.className = failed ? 'fail' : 'pass';
window.testResults = { passed, failed };
