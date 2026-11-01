# Assessor guide

Assessor builds question banks and tests, with algorithmic questions, printed versions with answer keys, and Schoology export. It's a recreation of ExamView Test Generator's core features that runs in the browser, built for one physics teacher who gives tests on paper or through Schoology.

Part 1 explains how to use it. Part 2 explains how it's built.

**Part 1: User guide**
[Getting started](#getting-started) ·
[Files and saving](#files-and-saving) ·
[Question banks](#question-banks) ·
[Question types](#question-types) ·
[Writing questions](#writing-questions) ·
[Tags](#tags) ·
[Narratives](#narratives) ·
[Dynamic questions](#dynamic-questions) ·
[Graphs](#graphs) ·
[Building a test](#building-a-test) ·
[Printing](#printing) ·
[Exporting to Schoology](#exporting-to-schoology) ·
[Importing](#importing) ·
[Menus and shortcuts](#menus-and-shortcuts) ·
[Known limits](#known-limits)

**Part 2: Technical reference**
[Architecture](#architecture) ·
[Project layout](#project-layout) ·
[Data model](#data-model) ·
[File formats](#file-formats) ·
[Key behaviors](#key-behaviors) ·
[Development](#development)

---

# Part 1: User guide

## Getting started

Open <https://karlmcb.github.io/assessor/> in Safari. To use it like an installed app, choose **File → Add to Dock** in Safari.

The start window offers the main tasks: create a test with the wizard or from scratch, create or open a question bank, open a test, or open a library file.

A typical first session:

1. Create a bank with **File → New Question Bank**, or bring one in with **File → Import**.
2. Add questions with **Question → New**. Double-click a question to edit it.
3. Save the bank with ⌘S, and move the downloaded file from Downloads to wherever you keep banks.
4. Create a test, using **File → QuickTest Wizard** or **File → New Test** followed by the **Select** menu.
5. Choose a look under the **Test** menu, then print with ⌘P or export with **File → Export → Schoology**.

**File → Switch to Question Bank Editor** or **Switch to Test Builder** moves between the two modes. The File, Question and other menus change to suit the mode.

## Files and saving

Each test and each bank is its own file.

| File | Name | Holds |
|---|---|---|
| Test | `Title.assessor-test.json` | One test and the images it uses |
| Bank | `Title.assessor-bank.json` | One bank and the images it uses |
| Library | `library-YYYY-MM-DD.assessor.json` | A backup of everything open, plus settings |

**Save (⌘S)** downloads the file you're working on. Safari can't write over a file, so every save is a new download, which Safari may name something like `Title-2`. Move it from Downloads and replace the old copy.

**Open** in either of these ways:

- **File → Open Test** or **Open Question Bank**, then **Choose File…**. If nothing is open, the file picker appears straight away.
- Drag the file from Finder onto the window. Double-clicking a file in Finder doesn't work, because Safari doesn't allow it.

**Close** removes a test or bank from Assessor but not from Finder. If it has unsaved changes, you're asked first. Closing also frees its images and clears the Undo history.

**Open but not closed:** anything open stays in browser storage, even after you quit Safari, so unsaved work survives. The title bar shows **Unsaved changes** for what's on screen. A banner names any other open files that aren't saved, with a **Save All to Files** button. Safari may ask permission to download several files at once.

**Library files** are an optional backup. **File → Save Library File** downloads everything open. **File → Open Library File** replaces everything open with the file's contents, so save your work first.

The website and a local copy (such as `serve.py`) keep separate browser storage, so work in one doesn't appear in the other.

## Question banks

A bank displays as a page of questions grouped by type. Click a question to select it, and double-click to edit it. The **Question** menu covers the rest:

- **New, Edit, Duplicate, Delete, Change Type**. Changing type keeps the question text and resets the answer.
- **Reorder**, by dragging in a list.
- **Go To**, **Assign Points**, **Adjust Choices/Columns** and **Narratives**.
- **Calculate Values** picks new numbers for dynamic questions.
- **Toggle Bimodal** switches bimodal questions between choices and short answer.

The **Edit** menu has Undo, Cut, Copy, Paste, Clear, Find, Find Again and Replace. **Edit → Question Bank Title** renames the bank.

## Question types

| Type | Answer | On paper | In Schoology |
|---|---|---|---|
| True/False | True or False | T / F, or lettered choices | True/False |
| Modified True/False | True, or False plus a correction | Blank for the correction | True/False, with the correction in feedback |
| Multiple Choice | One correct choice (2–8 choices) | Lettered choices | Multiple Choice |
| Multiple Response | One or more correct choices | Lettered choices | Multiple Answers |
| Bimodal | One correct choice | Choices or short answer | Multiple Choice |
| Yes/No | Yes or No | Answer blank | Multiple Choice |
| Numeric Response | Number, unit, tolerance, accepted forms | Answer space | Fill-in-the-blank with the accepted forms |
| Completion | One or more accepted answers | Answer space | Fill-in-the-blank |
| Matching | Up to 26 items, each pointing to a choice | Items with blanks, and a lettered list | Matching |
| Short Answer, Problem, Essay, Case, Other | Model answer | Lines or blank space | Essay |

**Matching:** one matching question holds all its items, and each item gets its own number on paper. Extra choices act as distractors.

**Numeric tolerance** applies only to paper keys, because Schoology has no numeric type and needs each accepted form listed exactly.

## Writing questions

The editor has a form on the left and a live preview on the right. Nothing changes in the bank or test until you save the question.

### Formatting

| You type | You get |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `^superscript^`, `~subscript~` | Raised or lowered text |
| `$F = ma$` | Inline math (LaTeX) |
| `$$E = mc^2$$` | Math on its own line |
| `- item` or `1. item` | Lists |
| `\| a \| b \|` | Tables (a `\| --- \| --- \|` second row makes the first a header) |
| `![label](img:ID\|300)` | An image 300 px wide (the editor writes this for you) |
| `[[name]]` | A dynamic value |

Paste or drop an image into a text field to add it. To type a literal dollar sign, write `\$`.

### Smart paste

Paste a whole multiple-choice question into an empty question field, and it splits off the choices. A `*` in front of a choice marks it correct.

### Choice options

- **Lock** keeps a choice in place when scrambling, which suits "All of the above".
- **Don't use on tests** hides the question from selection and bank exports.
- **Always one column** keeps a question full width in a two-column layout.

## Tags

These appear under **Question information** in the editor, and show on the page when **View → Question Tags** is on.

| Tag | Holds | Sort and By Criteria | By Standard tab | ExamView import tag |
|---|---|---|---|---|
| Difficulty | One value | Yes | Yes | `DIF:` |
| Topic | One value | Yes | Yes | `TOP:` |
| Reference | One value | Yes | No | `REF:` |
| Standards | List | Yes | Yes | `NAT:`, `STA:`, `LOC:` |
| Objectives | List | Yes | Yes | `OBJ:` |
| Keywords | List | Yes | Yes | `KEY:` |
| Notes | One value | No | No | `NOT:` |
| Misc | One value | No | No | `MSC:` |

Lists separate entries with commas or semicolons. National, state and local standards share one list, so name the source in the entry if it matters (for example `NGSS HS-PS2-1`).

## Narratives

A narrative is a shared passage, diagram or data table that several questions use. Manage them with **Question → Narratives**, and link a question to one in the editor.

- A narrative prints once, above its questions: "Use the following to answer questions 6–7".
- Linked questions stay together through reordering and scrambling.
- Adding a linked question to a test brings its narrative along.
- A narrative can have its own algorithm, whose variables all linked questions share.
- Schoology has no shared passages, so exports repeat the narrative in each question.

## Dynamic questions

A dynamic question has an algorithm, so its numbers can change for each version. Open **Algorithm (dynamic values)** in the editor. **⟳ Recalculate** tries new values in the preview, and **Functions and formats** lists what's available.

```
# A projectile launched horizontally
v = range(10, 30, 5)
h = range(5, 20)
g = 9.8
t = sqrt(2*h/g) :: sig 2
d = v*t :: sig 2
condition: d > 10
```

Then use the values in text, including inside math, answers and choices:

```
A ball leaves a [[h]] m cliff at [[v]] m/s. How far does it land?
$d = [[= v*t :: dp 1]]\ \text{m}$
```

### Script lines

| Line | Meaning |
|---|---|
| `m = range(1, 5, 0.5)` | Variable |
| `KE = 0.5*m*v^2 :: sig 3` | Variable with a display format |
| `sq(x) = x*x` | Your own function |
| `condition: isunique(a, b, c)` | Must be true, or all values are redrawn |
| `unique: m, v` | Variables that should differ between versions |
| `# comment` | Ignored |

Definitions can be in any order. If conditions keep failing or definitions are circular, the editor reports it.

### Placeholders

- `[[name]]` inserts a variable.
- `[[= 2*m]]` inserts a calculated value.
- `[[KE :: sig 2]]` or `[[= 2*m :: dp 1]]` adds a format.
- **View → Variable Names** shows names instead of values.

### Display formats

| Format | Effect |
|---|---|
| `general` | As calculated |
| `dp N` | Up to N decimal places |
| `fixed N` | Exactly N decimal places |
| `comma N` | Thousands separators, N decimal places |
| `sci N` | Scientific notation |
| `sig N` | N significant figures |
| `coef` | Coefficient: signed, hides 1 |
| `coef1` | Coefficient for a first term |

### Operators

From highest to lowest precedence: `( )`, `!` and unary `+ -`, `^`, `* / \ %` (`\` is integer division, `%` is remainder), `+ -` (`+` also joins text), `< <= > >=`, `= <> !=`, `&` or `and`, `|` or `or`. `NOT`, `XOR`, `MOD`, `EQV` and `IMP` also work.

Write `3*x`, not `3x`. Unlike ExamView, `-2^2` is −4, matching normal math.

Constants: `pi`, `e`, `inf`, `true`, `false`, `yes`, `no` and `testversion` (the printed version's letter).

### Functions

| Group | Functions |
|---|---|
| Math | `abs ceil floor frac int inv sgn sqrt sqr max min round pow exp ln log log10 logb` |
| Trig (radians) | `sin cos tan sec csc cot`, `asin acos atan asec acsc acot` (also `arcsin` and so on), `atan2`, `deg rad` |
| Trig (degrees) | `sind cosd tand asind acosd atand atan2d` |
| Hyperbolic | `sinh cosh tanh sech csch coth`, `asinh acosh atanh asech acsch acoth` (also `arcsinh` and so on) |
| Random and lists | `rand range prime unsort makelist list choose sort len` |
| Statistics | `sum mean median mode variance sdev quartile comb perm` |
| Number theory | `gcf lcd isprime isrelprime` |
| Logic | `isunique if` |
| Text | `str val left right mid instr lcase ucase trim ltrim rtrim strdup asc chr len` |
| Display only | `fracs mixfracs rfracs sfracs smixfracs srfracs decs sqrs sciens sgns sigfig format` |

`range(lo, hi)` without a step picks values at the precision of its bounds: `range(1, 10)` gives whole numbers and `range(1.5, 3.5)` gives tenths. Display-only functions produce formatted output that can't be used in further arithmetic.

Values are reproducible: reprinting a version gives the same numbers, and its key always matches.

## Graphs

Write graphs inside question text as fenced blocks. They're drawn as SVG, and every number can use algorithm variables.

````
```graph
x: 0 to 5 step 1
y: 0 to 20 step 5
size: 3 x 2
grid: on
labels: t (s), v (m/s)
f(x) = v0 + a*x ; domain 0 to 4 ; dashed ; color red
y <= x^2 - 4
point (2, 3) "A" ; open
segment (0, 0) to (3, 4)
text (1, 2) "label"
```
````

`size` is in inches. A relation such as `y <= …` shades the region. Colors are black, blue, red, green, orange, purple and gray.

````
```numberline
range: -5 to 5 step 1
point 2 closed "A"
segment -1 to 3 closed open
ray 2 right open
```
````

## Building a test

A test holds **copies** of questions, so editing one never changes its bank, and closing a bank doesn't affect tests made from it.

- **Save to test and bank**, in the editor, also updates the original. **Question → Update from Bank** does the reverse. Both need the bank to be open.
- Questions written on a test stay only on that test.
- **File → Export → Question Bank** turns a test into a new bank.

### Choosing banks

When adding questions or using the wizard, the **Banks** dropdown lists open banks by title.

- Tick the banks to draw from, or use **All** and **None**. Your choices are remembered, and new banks start ticked.
- **Open Bank File…** and each bank's **Close** button work without leaving the page.
- Dragging a bank file in also keeps you on the page.

### Ways to add questions

The **Select** menu has six methods. They all skip questions already on the test or marked "Don't use on tests".

| Method | Shortcut | How it works |
|---|---|---|
| Randomly | ⌃1 | Enter how many of each type |
| From a List | ⌃2 | Tick rows in a table, sortable by tag. Shows question text only |
| While Viewing | ⌃3 | Tick fully drawn questions, with narratives and images |
| By Standard | ⌃4 | Enter how many for each standard, objective, topic, difficulty or keyword |
| By Criteria | ⌃5 | Filter by type, tags and text, then add at random or by ticking |
| All Questions | ⌃6 | Adds everything remaining |

**Text search syntax** (not case-sensitive):

| Search | Finds |
|---|---|
| `a b` | Both words |
| `"a b"` | The exact phrase |
| `-a` | Without the word |
| `(a, b)` | Either word |
| `pro*` | Words starting with "pro" |

**File → QuickTest Wizard** (⌃T) asks for a title, banks and how many of each type, then picks at random.

### Arranging a test

- **Question → Reorder** moves questions by dragging, and **Sort…** orders them by a tag, with your choice of value order.
- **Question → Scramble** shuffles questions or choices.
- **View → Mix Question Types** removes the type sections and their instructions.
- **Select → Clear Selections** removes questions by bank or type.
- **Question → Assign Points** sets points in bulk.
- **Test → Summary** reports counts by bank and type, total points, and tag coverage.
- **Test → Version** sets the version letter shown on screen. Printing starts from it.

## Printing

**File → Print Test** (⌘P) shows settings beside a live page preview, and **Print Question Bank** prints a bank for review. Printing uses Safari's dialog, where you can also save a PDF.

In Safari's dialog, choose the same paper size and turn off **Print headers and footers**.

| Group | Options |
|---|---|
| Versions | 1–26 versions (A–Z); keep version A in order; scramble questions, choices or type sections; new values per version |
| Include | Test pages; answer key per version; answer strip; version map; tests then keys, or each test followed by its key |
| Page | US Letter or A4; margins; one or two columns; font and size; dividing lines |
| Header and footer | First page and other pages; a name line. Fill-ins: `{title} {version} {page} {pages} {date}` |
| Questions | First number; spacing; restart numbering by section; answer blanks; ruled lines or blank space; choice labels; points; T/F as choices; alternating letters (A–D, then F–J) |
| Instructions | Per type, with editable text |
| Answer key | Rationale, points, difficulty, reference, topic, standards, objectives and keywords, each on or off |

**Test → Style Gallery** offers five presets: Standard, Compact, Spacious, Clean sans-serif and Large print. **Use as default for other tests** saves the current layout as the default.

Questions, narratives and answer blocks aren't split across pages when they fit on one.

## Exporting to Schoology

**File → Export → Schoology** downloads a Common Cartridge zip. In Schoology, use **Resources → Import → Common Cartridge (IMSCC or ZIP)**.

- Math exports as MathML, and rationales and model answers can export as feedback.
- Images are packaged in the zip.
- Tags aren't exported.
- Questions marked "Don't use on tests" are left out of bank exports.

Schoology can't recalculate dynamic questions, so choose one of:

- **Fixed values**, from one version letter.
- **A pool of variants**, 2–20 per question, where each student gets one at random.

Confirmed by test imports: MathML, matching with distractors, and fill-in-the-blank grading. Variant pools and SVG graph images haven't been confirmed, so try one before relying on them.

## Importing

**File → Import** brings questions into new banks. A summary shows what was found and any problems before anything is added, and can also make a test from each bank.

### ExamView RTF

These are files written for ExamView's Import Utility. Each RTF becomes one bank, titled from its first line.

```
Chapter 2 Test
Multiple Choice
NARRBEGIN: Fig 1
(any text, tables or pictures)
NARREND
1. Which is a vector?
a. mass
b. velocity
c! all of these
ANS: B PTS: 1 DIF: Easy TOP: Vectors NAR: Fig 1

Short Answer
2. Define inertia.
ANS: Resistance to a change in motion.
```

- **Section labels** must match ExamView's: True/False, Modified True/False, Multiple Choice, Multiple Response, Bimodal, Yes/No, Completion, Matching, Numeric Response, Short Answer, Problem, Essay, Case, Other.
- **`e!`** locks a choice in place.
- **Numbering** can run through the file or restart in each section.
- **Answer-line tags:** `PTS DIF REF OBJ NAT STA LOC TOP KEY MSC NOT NAR`. See [Tags](#tags) for where they go.
- **Matching groups** have instructions, lettered choices, numbered items, then one `ANS:` line per item. This follows the guide's description and hasn't been tried with a real file.
- **Questions with `NOT:` notes** are listed in the summary for you to check.
- **Skipped questions** are listed with the reason, such as a missing `ANS:` line or an answer with no matching choice.
- **Superscripts and subscripts** become math, such as `m/s$^{2}$`. Bold, italics and tables are kept, but fonts and underlining aren't.

**Images:** pictures embedded as PNG, JPEG or bitmap-based Windows metafiles come through. Other embedded formats show as "missing image". Linked images need choosing separately:

1. Assessor asks for them after reading the RTF.
2. Click **Choose Images…**, open their folder and select them all.
3. They match by file name, ignoring the extension. Any not found show as "missing image".

### Schoology and Common Cartridge

Reads `.imscc` and `.zip` exports from Schoology, text2qti zips and Assessor's own exports. Each quiz becomes a bank. MathML becomes LaTeX and packaged images are kept. Web-linked images stay links, and may need you to be signed in. Schoology exports don't store points, so questions get default points.

### text2qti text

Reads text2qti's plain-text format, plus these Assessor-only lines. Select any images together with the text file.

```
meta: topic = Kinematics; difficulty = Easy; standards = HS-PS2-1, HS-PS2-2
rationale: Explanation shown in answer keys
unit: m/s
algorithm:
    v = range(10, 20)
match: Velocity = m/s
distractor: kg
```

## Menus and shortcuts

Shortcuts use ⌃ (Control) where Safari keeps the ⌘ version for itself.

| Action | Key | | Action | Key |
|---|---|---|---|---|
| Open | ⌘O | | Find | ⌘F |
| Save | ⌘S | | Find Again | F3 |
| Print | ⌘P | | Replace | ⌃R |
| Close | ⌃W | | New question | ⌃N |
| QuickTest Wizard | ⌃T | | Duplicate | ⌃D |
| Undo | ⌘Z | | Calculate selected | ⌃K |
| Cut question | ⌘X | | Toggle bimodal | ⌃B |
| Copy question | ⌘C | | Go To | ⌃G |
| Paste question | ⌘V | | Choices/Columns | ⌃J |

| Menu | Contents |
|---|---|
| File | New, Open, Save, Save As, Close; Import; Export; Print; recent items; library files; switch mode |
| Edit | Undo, Cut, Copy, Paste, Clear; Find, Replace; Preferences; title |
| View | Toolbar, Variable Names, Question Tags, Answers, Mix Question Types, Zoom |
| Select | The six add methods; Clear Selections (tests only) |
| Question | New, Edit, Duplicate, Delete, Change Type; Calculate Values; Toggle Bimodal; Update from Bank; Reorder, Scramble, Go To, Assign Points, Choices/Columns, Narratives |
| Test | Headers, Footers, Instructions, Layout, Style Gallery, Version, Summary (tests only) |
| Help | Assessor Help |

**Edit → Preferences** sets default points per type, default number of choices, and shows storage status.

## Known limits

- **Safari file handling:** each save is a new download, and there's no double-clicking files in Finder and no remembered folder.
- **Browser storage:** Safari can clear website storage for sites you rarely use, so keep your saved files safe. A Dock app with persistent storage reduces the risk.
- **Not included:** ExamView's own file formats (BNK, TST), online test delivery and grading, bubble forms, RTF or Word export, passwords, and a spelling dialog (Safari checks spelling as you type).
- **Copied questions and images:** a question on the clipboard loses its images if its bank closes before you paste.
- **Undo** keeps the last 40 changes and resets when anything closes.

---

# Part 2: Technical reference

## Architecture

- **Static site:** vanilla ES modules with no build step and no runtime dependencies other than vendored KaTeX 0.16.11. It's hosted on GitHub Pages from `main`.
- **Must be served over http(s):** Safari won't load modules from `file://`.
- **Storage:** an IndexedDB working copy of open documents, with a request for persistent storage. Files are explicit downloads, because Safari lacks folder and file-writing pickers.
- **Routing:** hash routes. The document page sits behind sheets for the editor, selection and print screens.
- **Commands:** every menu, toolbar and keyboard action is an entry in `COMMANDS` in `js/commands.js`.
- **Rendering:** plain DOM through the `h()` helper in `js/ui.js`. A store `change` event refreshes the window.

Main routes: `#/`, `#/test/ID`, `#/bank/ID`, `#/test/ID/add/METHOD`, `#/test/ID/summary`, `#/wizard`.

## Project layout

```
index.html, tests.html     App shell and test page
serve.py                   Local no-cache server (port 8642)
css/app.css                All styles, including print
icon.svg
js/
  main.js                  Window, routing, menu bar, toolbar
  commands.js              Commands, menus, shortcuts, dialogs, file open/save/close
  app.js                   State shared by window and commands
  model.js                 Data factories, validation, normalization, file wrappers
  testmodel.js             Test operations: add, sort, scramble, pool, summary
  store.js                 IndexedDB, undo stack, library files, file pickers
  containers.js            Editor's interface to a bank or a test
  question-view.js         Read-only question and narrative rendering
  richtext.js              Markdown subset and math
  graph.js                 Graph and number line blocks to SVG
  search.js                Criteria search syntax
  ui.js                    h(), dialogs, toasts, image resizing
  algo/                    parse.js, engine.js, functions.js, values.js, rng.js
  print/                   versions.js, build.js, render.js, paginate.js, layout.js
  export/                  qti.js, zip.js
  import/                  rtf.js, examview.js, qti.js, text2qti.js, html2text.js, unzip.js
  views/                   document, editor, select, bank-menu, wizard, print, export, import, narrative
tests/                     One suite per area, run by tests/run.js
schoology-tests/           Reference imports confirmed in Schoology, and their build scripts
vendor/katex/              KaTeX
ExamViewDocs/              Local reference only: copyrighted, git-ignored, never commit
```

## Data model

All data is plain JSON. IDs are short random strings.

```
Library  { format, version, created, modified, banks[], tests[], images{id: dataURL}, settings }
Bank     { id, title, subtitle, questions[], narratives[], matchingGroups[], created, modified, fileHash? }
Test     { id, title, items[], narratives[], mixTypes, typeOrder[], seed, version?, layout?, created, modified, fileHash? }
TestItem { question, sourceBankId, sourceQuestionId }
Narrative { id, title, body, algorithm }
```

`lib.banks` and `lib.tests` hold only what's currently open. `matchingGroups` is unused and kept for file compatibility.

**Question** fields common to all types: `id, type, stem, rationale, algorithm, points, narrativeId, meta, flags`.

- `meta`: `{ difficulty, reference, objectives[], standards[], topic, keywords[], notes, misc }`
- `flags`: `{ doNotUse, alwaysOneColumn }`

| `type` | Extra fields |
|---|---|
| `tf`, `yn` | `answer: boolean` |
| `mtf` | `answer: { value, correction }` |
| `mc`, `mr` | `choices[{ id, text, correct, lockPosition }], columns` |
| `bimodal` | As `mc`, plus `showAs: 'mc'\|'short', answerLines` |
| `num` | `answer: { value, unit, tolerance, toleranceType: 'abs'\|'pct', accepted[] }` |
| `comp` | `answer: { accepted[] }` |
| `match` | `choices[{ id, text }], pairs[{ id, prompt, choiceId }], columns` |
| `essay` | `kind: short\|problem\|essay\|case\|other, answer: { model }, answerLines` |

Limits: 2–8 choices, and up to 26 matching items and printed versions.

## File formats

```
{ "format": "assessor-test",    "version": 1, "test": {…}, "images": {…} }
{ "format": "assessor-bank",    "version": 1, "exported": "…", "bank": {…}, "images": {…} }
{ "format": "assessor-library", "version": 1, …library fields… }
```

`fileHash` is never written to a file. Readers refuse a higher `version` than they know, and normalize anything missing. `*.assessor.json`, `*.bank.json`, `*.assessor-test.json` and `*.assessor-bank.json` are git-ignored, since question data never goes in the repo.

**Schoology package:** `imsmanifest.xml` plus QTI 1.2 XML shaped like text2qti's output. Each item needs the `itemmetadata/qtimetadata` block, or Schoology silently imports an empty quiz. KaTeX's MathML output, without its LaTeX annotation, supplies the math.

## Key behaviors

**Unsaved tracking:** `docHash()` fingerprints a document without its `fileHash`. Saving or opening stores the fingerprint, and a document is unsaved when they differ. Documents created in the app have no `fileHash`, so they count as unsaved.

**Closing:** `removeOpenDoc()` removes the document, prunes images no open document uses, and clears the undo stack, since undo snapshots exclude images. Opening a file with an ID that's already open replaces the open copy, after a prompt if it has unsaved changes.

**Seeds:** random values come from a seeded generator, keyed on `test.seed`, version letter and question ID. Narratives use `test.seed|version|narrativeId`. Bank views and exports use their own seeds. **Calculate Values** changes the seed.

**Printing:** `versions.js` decides order, scrambling and seeds. `build.js` assembles flows for tests, keys, strips and the map. `render.js` produces HTML, and `paginate.js` measures blocks in the DOM to place them on fixed pages.

**RTF import** has two stages. `rtf.js` is a small group-stack parser that produces `{ text, table }` lines and pictures, with images as `img:ID` references. `examview.js` is a line-based state machine for sections, questions, answers and narratives, knowing nothing about RTF. Windows metafiles are scanned for a `StretchDIB` or `DIBStretchBlt` record, whose bitmap is wrapped as a BMP and converted to PNG by canvas. Images are scaled to at most 1600 px wide.

**A new question number** is recognized only when it can't be part of the current question: inside a stem, it needs a blank line and the next number in order. After an answer, it needs the next number with punctuation or a blank line before it, or a higher number after a blank line. This lets stems and multi-line answers contain numbers.

**Bank choice** is stored as a hidden list, `app.view.hiddenBanks`, in `localStorage`, so new banks default to shown. Opening a bank file unhides it. The list is a per-browser convenience.

**Circular imports:** `model.js` and `testmodel.js`, and `commands.js` and `views/bank-menu.js` (through `views/select.js`), import each other. It's safe only because they use each other's exports at call time, so don't call across them while a module loads.

## Development

```bash
python3 serve.py
```

Open <http://127.0.0.1:8642/>, with tests at <http://127.0.0.1:8642/tests.html>. Tests run in the browser, and `window.testResults` holds the totals. Add a suite by exporting an object of named functions and registering it in `tests/run.js`.

To deploy, push to `main`. GitHub Pages rebuilds in about a minute, and users reload to get the change.

Code conventions: vanilla JavaScript with no dependencies, `h('tag.class', attrs, ...children)` for DOM, plain data in `model.js` with no DOM access, and all user-visible text in plain language.

**Rules for the repo:**

- Never commit `ExamViewDocs/` or question data.
- `README.md` is the short overview, this guide is the current reference, and `SPEC.md` is the original plan with as-built notes. Where they differ, this guide and the code are current.
