# assessor: v1 specification

A personal test generator for one teacher (physics). It is modeled on the feature set of the ExamView Test Generator 8.1 user guide (`ExamViewDocs/`), trimmed to what matters when the tests are printed on paper or imported into Schoology.

Status: draft for review. Items marked **[decide]** need an answer before building.

---

## 1. Goals and non-goals

### Goals
1. Keep question banks: questions with answers, rationale and metadata.
2. Build tests from banks with several selection methods and a quick wizard.
3. Write algorithmic questions whose numbers change for every version.
4. Print 1–26 versions (A–Z) with scrambling, a matching answer key for each, and a clean print layout.
5. Render math (LaTeX) and simple graphs.
6. Export a test or bank as a QTI zip that Schoology imports correctly.

### Non-goals (v1)
- Accounts, servers, sharing, collaboration.
- Online test delivery, student results, grading, rosters (Schoology does this).
- Exports to LMSs other than Schoology, plus RTF/Word export and bubble forms.
- Passwords on banks/tests, spell-check dictionaries (Safari's built-in spell check is used), translation banks.
- A full word processor or WYSIWYG equation editor (replaced by Markdown + LaTeX with live preview).
- Compatibility with ExamView's file formats (BNK/TST/EOT/XML).

---

## 2. Platform and architecture

- **Type:** a static browser app (HTML/CSS/JavaScript ES modules). No server, no build step required.
- **Target browser:** Safari (macOS, current version). Chrome/Firefox should work but aren't the test target.
- **Libraries (vendored into `vendor/`, no CDN at runtime so it works offline):**
  - KaTeX for math rendering.
  - JSZip for building the QTI export zip.
  - Everything else (expression engine, graphs as SVG, print layout) is our own code.
- **Hosting (decided): GitHub Pages from a public repo.** ES modules don't load from `file://` in Safari, so the app must be served over https. Pages also enables Safari's *File → Add to Dock*, which makes it behave like an installed app.
  - Only code goes in the repo. `.gitignore` excludes library and bank files (`*.assessor.json`, `*.bank.json`) and `ExamViewDocs/`. The ExamView guide is copyrighted and must not be published.
  - For development, `python3 -m http.server` serves the folder locally.

### Storage in Safari
Safari doesn't support writing directly to a folder you choose (the File System Access API), so storage works like this:
- **Working copy:** IndexedDB in the browser. The app requests persistent storage (`navigator.storage.persist()`) so Safari doesn't evict it.
- **Source of truth: library files.** **Save Library** downloads a single `.assessor.json` file (all banks, tests, images, settings). **Open Library** loads one. Individual banks can also be exported/imported as `.bank.json`.
- **Safety net:** the app shows "last saved to file" and nags when unsaved changes are more than N days old. A dated filename (`library-2026-10-18.assessor.json`) keeps a backup history in Downloads (or wherever you move them, e.g. Drive).
- Rationale: Safari can clear website storage for sites you don't visit for a while. Running it as a Dock app with persistent storage reduces that risk, and the file is the backup either way.

---

## 3. Data model

All data is JSON. IDs are short random strings. Every object has `created` and `modified` timestamps.

### Library
```
Library { version, banks: Bank[], tests: Test[], settings: Settings, images: { [id]: dataURL } }
```

### Bank
```
Bank { id, title, subtitle, questions: Question[], narratives: Narrative[], matchingGroups: MatchingGroup[] }
```
- No hard limit (ExamView capped banks at 250 questions). The UI should stay fast at about 500 questions.

### Question
| Field | Notes |
|---|---|
| `id`, `type` | type from §4 |
| `stem` | rich text (§6) |
| `choices[]` | for choice types: `{ text, correct, lockPosition }`. `lockPosition` keeps "All of the above" etc. in place when scrambling |
| `answer` | type-specific (§4) |
| `rationale` | rich text, shown in answer keys if enabled |
| `points` | default from settings per type |
| `narrativeId` | optional link to a shared narrative |
| `matchingGroupId` | for matching questions |
| `algorithm` | optional definitions (§7) |
| `meta` | `difficulty`, `reference`, `objectives[]`, `standards[]`, `topic`, `keywords[]`, `notes`, `misc` |
| `flags` | `doNotUse` (hidden from selection), `alwaysOneColumn` |

Metadata simplification: ExamView had national/state/local standards plus two learning objectives. v1 keeps one free-text `standards[]` list (e.g. `NGSS HS-PS2-1`) and one `objectives[]` list.

### Narrative
`{ id, title, body }`. A shared passage, diagram or data table that several questions refer to. It's printed once, above its questions, and those questions always stay together and in order relative to it. It can carry its own algorithm, which all its linked questions share.

### MatchingGroup
`{ id, instructions, choices[], columns: 1|2, algorithm }`. Matching questions belong to exactly one group. All of a group's choices print even when only some questions are selected.

### Test
```
Test { id, title, items: TestItem[], layout: Layout, versionsDefault, created, modified }
TestItem { question: Question (a copy), sourceBankId, sourceQuestionId }
```
- A test holds **copies** of questions. Editing a question on a test doesn't change the bank, and the reverse is also true (as in ExamView). The test editor offers **"Update from bank"** and **"Save change back to bank"** per question.
- Questions created inside a test stay local to the test unless saved to a bank.

---

## 4. Question types (v1)

| Type | Answer | Print | Schoology QTI | Notes |
|---|---|---|---|---|
| **Multiple Choice** | one correct choice | lettered choices, 1–5 columns | `multiple_choice_question` | 2–8 choices |
| **Multiple Response** | 1+ correct choices | same | `multiple_answers_question` | |
| **True/False** | true/false | T / F (or as choices) | `true_false_question` | |
| **Numeric Response** | number + tolerance (absolute or %) or exact match | answer blank | Schoology has no numeric type: exported as a fill-in-the-blank (`short_answer_question`) with a list of accepted forms (e.g. `25`, `25.0`, `25 J`) (verified) | Tolerance is used for printing and keys only; it can't carry over to Schoology |
| **Matching** | question → choice letter | instruction, choice list, questions with blanks | `matching_question` (verified) | Up to 26 per group |
| **Short Answer / Problem / Essay** | model answer (rich text) | answer space or lines | `essay_question` | Three labels, same behavior; they differ in default instructions and answer space |

Decided: Bimodal and Completion are dropped. Also left out from ExamView: Modified True/False, Yes/No, Case, Other.

---

## 5. Question bank editor

- Bank list → bank view (questions grouped by type, or mixed) → question editor.
- **Question editor:** stem, choices or answer, rationale, points, metadata, narrative link, algorithm panel, flags. Live preview of the rendered question using freshly computed algorithm values, with a **Recalculate** button.
- **Smart paste:** paste a question copied from a document. The app splits it into stem and choices (lines starting `A.`, `a)`, `(1)`, etc.) and marks a choice as correct if it's prefixed with `*`.
- **Plain-text import (decided): text2qti syntax.** Paste or open a text2qti Markdown file and import its questions into a bank. Mapping:
  - multiple choice (`*a)` marks the correct choice) → Multiple Choice
  - multiple answers (`[*]` / `[ ]`) → Multiple Response
  - numerical (`=` answer, optional `+-` tolerance) → Numeric Response
  - essay (`____`) → Essay
  - true/false written as two choices → True/False
  - feedback lines → rationale
  - `$…$` LaTeX → kept as is
  - short-answer / fill-in (`*` answer lines) → Essay, with the accepted answers kept as the model answer (decided; Completion is dropped)
- **text2qti extensions:** text2qti has no syntax for matching, metadata or algorithms. Optional assessor-only lines fill the gap, ignored by text2qti itself: a matching block, `meta:` lines (topic, difficulty, standards, keywords) and an `algorithm:` block. Exact syntax to be set during M6.
- **Export back to text2qti [optional]:** write a bank as text2qti Markdown, for plain-text backup and editing.
- Duplicate, delete (with confirm), move/copy to another bank, reorder by drag (narrative and matching groups move as a unit), sort by any metadata field.
- Find and replace across a bank.
- Print a bank (all questions with answers and metadata), useful for reviewing on paper.

---

## 6. Rich text and math

- **Format:** a small subset of Markdown: bold, italic, sub/superscript, line breaks, lists, simple tables, images.
- **Math:** LaTeX between `$…$` (inline) and `$$…$$` (display), rendered with KaTeX. A LaTeX snippet palette (fractions, roots, vectors, units, Greek letters, ×10ⁿ) helps you remember syntax.
- **Variables** (§7) are inserted with `[[name]]` and work inside LaTeX too: `$v = [[v0]]\ \text{m/s}$`.
- **Images:** pasted or dropped. Stored as data URLs in the library with a width setting.
- **Graphs:** inserted as a graph block (§9).

---

## 7. Algorithmic (dynamic) questions

The most important feature. Modeled on ExamView's algorithm language so the guide's function list can serve as a reference.

### 7.1 Definitions
Each question, narrative or matching group can have an **algorithm**: an ordered list of definitions.

| Kind | Example | Notes |
|---|---|---|
| Variable | `m = range(2, 10, 0.5)` | Can be inserted into text, with a display format (§7.4) |
| Constant | `g = 9.8` | Evaluated once; can't use variables |
| Condition | `isunique(a, b, c, d)` | Must be true or the values are regenerated |
| User function | `KE(m, v) = 0.5*m*v^2` | |
| Comment | `# launch angle in degrees` | Anything after `#` |

**Scope:** a question's variables are visible only to that question. A narrative's variables are visible to all its linked questions, and likewise for a matching group.

**Evaluation:** definitions are evaluated in dependency order. If any condition is false, all random values are redrawn, up to 1,000 attempts, after which the editor shows "conditions can't be satisfied" with the failing condition.

### 7.2 Language
- **Types:** int, double, string, list (inferred, never declared).
- **Operators (by precedence):** `( )` · `!` unary `+ -` · `^` · `* / \ %` (`\` integer division, `%` modulus) · `+ -` (`+` also joins strings) · `< <= > >=` · `= <>` · `&` / `and` · `|` / `or`. Also `NOT`, `XOR`, `MOD`.
- Implicit multiplication isn't allowed (`3*x`, not `3x`), matching ExamView.
- Mixing strings and numbers in one expression is an error unless converted with `str()` / `val()`.
- Constants: `pi`, `e`, `inf`, `true`/`false`, `yes`/`no`, and `testversion` ("A", "B", …).
- **Safe evaluation:** our own parser. No `eval()`.

### 7.3 Functions (v1)
- **Math:** `abs ceil floor frac int inv max min sgn sqrt sqr pow exp ln log log10 logb round`.
- **Trig** (radians): `sin cos tan sec csc cot`, inverses (`asin` … plus `arcsin` aliases), `atan2`, hyperbolic versions, `deg rad`. Physics extras: `sind cosd tand asind acosd atand` (degree versions).
- **Random:** `rand(n)` (1..n), `range(lo, hi, step?)`, `prime(lo, hi)`, `choose(i, …)` / `choose(i, list)`, `list(…)`, `sort`, `unsort`.
- **Stats:** `mean median mode sdev variance sum quartile comb perm makelist`.
- **Number theory:** `gcf lcd isprime isrelprime`.
- **Logic and conditions:** `if(cond, a, b)`, `isunique(…)`.
- **Strings:** `str val len left right mid instr lcase ucase trim ltrim rtrim strdup asc chr`.
- **Display-only** (produce formatted output, can't be used in further arithmetic): `fracs mixfracs rfracs` (stacked fractions), `decs` (repeating decimal with overbar), `sqrs` (simplified radical), `sciens` (scientific notation), `sgns`, `sigfig(x, n, force)`, `format(fmt, x)` (C-style `%`).
- Left out of v1: `sentence`, `symbol`, the small-fraction variants (`sfracs` etc.). LaTeX covers their purpose.

### 7.4 Display formats per variable
- General, Number (decimal places, fixed or not), Comma-separated, Scientific (`1.44 × 10⁵`, decimal places), Significant figures (physics addition), Coefficient, and Coefficient (first term). The coefficient formats print `+3`, `−3`, hide `1`, etc. so polynomials read correctly.

### 7.5 Answers and choices
- Answers and choices can contain variables and expressions: `[[=0.5*m*v^2]]` evaluates inline using the variable's format.
- For MC with computed distractors, a condition like `isunique(A, B, C, D)` guarantees distinct choices.

### 7.6 Reproducibility
- Random values come from a seeded generator. The seed is derived from the test ID, version letter and question ID. Reprinting version B gives the same numbers, and its answer key always matches.
- **Recalculate** (per question or whole test) picks a new seed and stores it on the test.
- A **unique across versions** flag on a variable requests a different value in every version where possible.

### 7.7 Tests for the engine
The expression engine gets an automated test suite: every function, operator precedence, type errors, condition retries, and seed reproducibility. It runs in the browser from `tests.html`.

---

## 8. Test builder

### 8.1 Creating a test
- **New test:** enter a title, then add questions with any selection method.
- **Quick wizard:** title → choose banks → number of questions per type (shows how many are available) → number of matching groups if needed → summary → **Create**. Selection is random.

### 8.2 Selection methods
All methods work on one or more banks at once and skip questions already on the test or flagged `doNotUse`.
1. **Random:** a table per type showing Already selected / Remaining / Add / Total. Enter how many to add.
2. **From a list:** a checklist showing question number, type and a sortable column (difficulty, topic, standard, keywords…).
3. **While viewing:** a scrolling preview of fully rendered questions with checkboxes. Checking a bank, type header or narrative selects the whole group.
4. **By standard or objective:** a table of each standard/objective with Already selected / Remaining / Add.
5. **By criteria:** filter by type, difficulty, reference, objective/standard, topic, keywords and text. Search syntax:
   - `a b`: both words
   - `"a b"`: exact phrase
   - `-a`: exclude
   - `(a, b)`: either word
   - `pro*`: prefix match
   - Then add the matches by viewing or randomly.
6. **All questions:** add everything remaining.

Adding a question linked to a narrative brings the narrative along. Adding a matching question brings its group's choices.

### 8.3 Working with a test
- Edit (local copy) or create questions on the test.
- **Delete** a question; **Clear** by bank or type.
- **Reorder** by drag. Rules: when grouped by type, questions move within their type and type blocks move as units. Narrative groups and matching groups always stay intact.
- **Sort** by a metadata field, with a custom order for the field's values (e.g. difficulty Easy → Hard).
- **Mix question types** on or off. When on, per-type instructions are hidden.
- **Assign points** for all questions of a type, or individually.
- **Summary report:** counts by bank and type, total points, objectives and standards covered. Printable.

---

## 9. Graphs (v1 subset)

Rendered as SVG, so they print sharply. Every numeric parameter can be a variable or expression.

- **Cartesian graph:** axes (labels, units per tick, ticks per label, grid on/off, size, center or lower-left anchor).
  - Items: `f(x)` with domain, relation (`=`, `<`, `≤`, `>`, `≥` with shading), dash style and color; point (style, label); segment; text label.
  - Each item has an optional "show only if" condition.
- **Number line:** point, segment and ray with open/closed endpoints, labels.
- **Later:** parabola, circle, ellipse and hyperbola as named items (achievable now with `f(x)`), parametric, polar, polynomial-by-zeros, normal curve, box plot, vectors, pie chart, shapes, compound regions.

Decided: Cartesian graphs and number lines are in v1. Motion graphs (x-t, v-t) are covered by `f(x)` with a limited domain plus segments for piecewise-linear motion. Vector and free-body diagrams aren't in v1; images cover them for now.

---

## 10. Printing

Printing uses Safari's print dialog, so **Save as PDF** comes free. The app builds a print view for each version.

### 10.1 Print dialog (app side)
- Number of versions: 1–26, lettered A–Z.
- Scramble: sections (type blocks), questions, choices (locked choices stay put). Narrative and matching groups move as units; their questions scramble only within the group.
- Recalculate algorithm values per version: on/off. Off means all versions share numbers and differ only in order.
- Include: test pages, answer key per version, answer strip, version map (a table of where each question landed in each version).
- Output order: all tests then all keys, or each test followed by its key.

### 10.2 Layout settings (saved with the test; defaults in Settings)
- **Page:** US Letter or A4, margins, one or two columns (with optional column divider). Wide items fall back to one column automatically or via the `alwaysOneColumn` flag.
- **Header/footer:** separate first page and other pages. Tokens: `{title} {version} {page} {pages} {date}`. A name/date/class line is on by default.
- **Numbering:** starting number, restart per type, each type on a new page when it doesn't fit.
- **Instructions:** editable default text per question type, hidden when types are mixed.
- **Spacing:** space between questions (0–36 pt).
- **Answer space:** a blank before objective questions (`____ 1.`). Blank space or ruled lines (height set per question) after open-ended ones.
- **Style:** choice labels (`A.` `a.` `(a)` `1.`), alternate choice letters per question (A–D then F–J, so a skipped question on an answer sheet is noticeable), True/False as choices, points shown inline / on their own line / hidden, base font and size.
- **Answer key contents:** answer, rationale, points, difficulty, reference, objectives, standards, topic, keywords (each on/off).
- **Page breaks:** never split a question, narrative block or matching group across pages where it fits on one page.
- **Style presets [optional]:** a few saved layout presets (e.g. "Quiz, 2-column, compact", "Unit test, generous space").

---

## 11. Schoology export (QTI)

### 11.1 Format
- A zip in the format Schoology imports via **Import → Common Cartridge (IMSCC/ZIP)**: an `imsmanifest.xml` plus QTI 1.2 assessment XML, Canvas-flavored, like text2qti generates.
- Every item includes the `itemmetadata/qtimetadata` block (`question_type`, `points_possible`, `original_answer_ids`). Your earlier testing found Schoology silently imports an empty quiz without it (`schoology_quiz_workflow_claude.md`).
- **Golden reference:** before writing the exporter, generate a small quiz with text2qti covering each type, confirm it imports into Schoology, and use that output as the template. The exporter's output is compared against it in tests.

### 11.2 Content mapping
- Question types: see the §4 table. Rationale becomes general feedback, points become points.
- Narratives are prepended to each linked question (Schoology has no shared-passage concept).
- **Math (decided): MathML.** A test import confirmed Schoology renders MathML in questions. Questions are still written in LaTeX; on export each formula is converted to presentation MathML (KaTeX's MathML output, without the LaTeX annotation). `schoology-tests/build_mathml_test.py` builds the reference quiz for comparison.
- **Images:** packaged in the zip and referenced relatively.

### 11.3 Algorithmic questions in Schoology
Schoology has no dynamic questions, so export offers:
- **One version:** pick a version letter; values are fixed to it.
- **Variant pool:** export N computed variants of each algorithmic question (e.g. 5) into a Schoology question bank. A Schoology quiz can then draw one at random per student, so each student sees different numbers.

### 11.4 Bank export
Export a whole bank, or filtered questions, as a Schoology question bank.

---

## 12. Settings
- Teacher name, school, class names (for headers).
- Default points per question type.
- Default choices and columns for new MC/MR; default matching size.
- Default layout and style (§10.2), reusable as presets.
- Storage status, persistent-storage request, backup reminder interval.

---

## 13. Suggested build order

| Milestone | Delivers | Done when |
|---|---|---|
| **M1 Foundation** | App shell, data model, IndexedDB storage, Save/Open Library, bank editor for MC/MR/TF/Numeric/Essay, Markdown + KaTeX rendering | Write 20 real questions, save, close Safari, reopen, open the file on another Mac |
| **M2 Algorithm engine** | Parser, evaluator, function library, formats, conditions, seeded RNG, `tests.html` | Engine tests pass; a projectile-motion question regenerates correctly in the editor preview |
| **M3 Test builder** | Tests as copies, all six selection methods, wizard, reorder/sort/scramble, summary | Build a 25-question unit test from two banks in under 5 minutes |
| **M4 Printing** | Print view, versions A–Z, answer keys, version map, layout settings, two columns | Print versions A–D to PDF; every key matches its version, including recalculated numbers |
| **M5 Schoology export** | QTI zip matching the text2qti reference, variant pools | A test with every type imports into Schoology with correct answers and points |
| **M6 Matching, graphs, import** | Matching, narratives, Cartesian graphs, number lines, smart paste, text2qti import | An existing text2qti quiz file imports into a bank with correct answers; a v-t graph question prints with recalculated values |

---

## 14. Open decisions
Decided: GitHub Pages from a public repo (§2); drop Bimodal and Completion, keep Matching (§4); Cartesian graphs and number lines (§9); text2qti syntax for plain-text import, with short-answer questions imported as Essay (§5).

Schoology facts so far: no numeric question type (numeric exports as fill-in-the-blank); a native matching type exists; MathML renders in imported questions, so math exports as MathML.

Verified by test imports (October 2026), all working:
1. **MathML** in question text and answer choices (`schoology-tests/mathml_test.zip`).
2. **Matching:** hand-built Canvas-style `matching_question` items import and grade, including distractor choices and MathML in prompts and choices (`schoology-tests/matching_test.zip`). This replaces the earlier note that matching had to be built by hand in Schoology.
3. **Fill-in-the-blank:** text2qti-style `short_answer_question` items import auto-graded with their accepted answers (`schoology-tests/fill_in_blank_test.zip`).

The three build scripts in `schoology-tests/` are the reference output for the M5 exporter.
