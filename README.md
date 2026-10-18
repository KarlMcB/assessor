# assessor

A test generator for teachers: question banks, algorithmic questions, printed versions with answer keys, and Schoology export. See [SPEC.md](SPEC.md) for the full plan.

## Status

Milestone 1 (foundation) is in place: question banks, an editor for True/False, Multiple Choice, Multiple Response, Numeric Response and Short Answer/Problem/Essay questions, LaTeX math via KaTeX, browser storage, and library files.

## Running it

It's a static site with no build step, but it has to be served over http (Safari won't load the modules from a file):

```bash
python3 -m http.server 8642 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8642/>. Unit tests run at <http://127.0.0.1:8642/tests.html>.

## Saving

Work is kept in the browser as you go. **Save Library** (⌘S) downloads `library-YYYY-MM-DD.assessor.json`, which is the real copy and backup; **Open Library** loads one. Question data never goes in this repo (`*.assessor.json` and `*.bank.json` are ignored).

## Layout

- `index.html`, `css/`, `js/`: the app (`js/model.js` data model, `js/store.js` storage, `js/richtext.js` Markdown + math, `js/views/` screens)
- `tests.html`, `tests/`: in-browser unit tests
- `vendor/katex/`: KaTeX 0.16.11
- `schoology-tests/`: reference QTI imports verified in Schoology
