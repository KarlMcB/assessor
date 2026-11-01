# assessor

A test generator for teachers: question banks, algorithmic questions, printed versions with answer keys, and Schoology export. See [GUIDE.md](GUIDE.md) for how to use it and how it's built, and [SPEC.md](SPEC.md) for the original plan.

## Status

- **M1 foundation:** question banks, an editor for True/False, Multiple Choice, Multiple Response, Numeric Response and Short Answer/Problem/Essay questions, LaTeX math via KaTeX, browser storage, and library files.
- **M2 algorithms:** dynamic questions with variables, conditions, user functions, about 120 built-in functions and display formats, seeded so each version's values are reproducible (`js/algo/`).
- **M3 test builder:** tests made of copies of bank questions; six ways to add questions (random, list, viewing, standard, criteria with search syntax, all), a quick wizard, reordering, sorting, scrambling, points, a summary report, and saving edits back to the bank.
- **M4 printing:** 1–26 versions with scrambled questions and choices and recalculated values, answer keys, answer strips, a version map, and layout settings (paper, margins, one or two columns, headers and footers, numbering, spacing, choice labels, points, instructions), laid out on measured pages and printed through the browser (`js/print/`).
- **M5 Schoology export:** tests and banks export as a Common Cartridge zip built like text2qti's output, with MathML math, images, rationales as feedback, numeric questions as fill-in-the-blank, and dynamic questions as fixed values or a random-pick pool of variants (`js/export/`).
- **M6:** matching questions (items, lettered choices and distractors; one printed number per item), narratives (shared passages with shared algorithm variables, kept together and printed once), Cartesian graphs and number lines written as ```` ```graph ```` / ```` ```numberline ```` blocks, text2qti text import with assessor extensions, and smart paste of multiple-choice questions.
- **Import:** File → Import reads ExamView Import Utility RTF files (one new bank per file, with embedded or linked images), Schoology exports (`.imscc`), text2qti zips and assessor's own exports. Each quiz becomes a bank (optionally a test too); MathML and `\( \)` math become LaTeX, packaged images are kept, and web-linked images stay as links (`js/import/`).
- **Desktop-style interface:** a start window, a title bar, File/Edit/View/Select/Question/Test/Help menus, a toolbar, the open test or bank shown as a page, and a status bar. Sub-windows open as sheets. Question types now also include Modified True/False, Bimodal, Yes/No, Completion, Case and Other.

## Running it

It's a static site with no build step, but it has to be served over http (Safari won't load the modules from a file). `serve.py` serves it without browser caching, so edits show up on reload:

```bash
python3 serve.py
```

Then open <http://127.0.0.1:8642/>. Unit tests run at <http://127.0.0.1:8642/tests.html>.

## Saving

**Tests and banks are separate files.** **Save** (⌘S) downloads `Title.assessor-test.json` or `Title.assessor-bank.json`. **File → Open**, or dragging a file onto the window, opens it, and **Close** removes it from the app (not from Finder). When adding questions, the Banks list chooses among open banks and can open or close bank files. Anything open stays in the browser until closed, so unsaved work survives closing the window. Safari can't write over a file, so each save is a new download to move from Downloads.

**Save Library File** downloads `library-YYYY-MM-DD.assessor.json`, a backup of everything open plus settings; **Open Library File** loads one. Question data never goes in this repo (`*.assessor.json`, `*.bank.json`, `*.assessor-test.json` and `*.assessor-bank.json` are ignored).

## Layout

- `index.html`, `css/`, `js/`: the app (`js/model.js` data model, `js/store.js` storage, `js/richtext.js` Markdown + math, `js/views/` screens)
- `tests.html`, `tests/`: in-browser unit tests
- `vendor/katex/`: KaTeX 0.16.11
- `schoology-tests/`: reference QTI imports verified in Schoology
