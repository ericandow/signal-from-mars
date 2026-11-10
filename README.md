# Signal From Mars

A puzzle game about deciphering an alien (programming?) language!

**Play it:** https://ericandow.github.io/signal-from-mars/

Three static files, no build step and nothing to install:

| file | what it is |
| --- | --- |
| `site/index.html` | the page: markup, styles, and the UI |
| `site/engine.js` | the Nock interpreter the game runs on |
| `site/puzzles.json` | the levels, loaded at run time |

## Working on it

The page uses ES modules and `fetch`, so it needs to be served rather than opened as a file:

```sh
python3 -m http.server 8000 -d site     # then http://localhost:8000/
```

## Writing puzzles

Edit `site/puzzles.json` and reload — nothing else to touch. Each level is

```json
{"title": "nothing but itself", "ex": ["[7 1 42]"], "more": ["[0 1 0]"], "q": "[[8 8] 1 [0 6]]"}
```

where every program string is a whole Nock program: `ex` is shown with its answer, `more` is held
back behind "Another example", and `q` is the one the player has to work out. The `title` appears
when the level is opened — the selector down the left side stays wordless. Answers are computed by
running the program, so there is nothing to keep in sync. `$NAME` splices in an entry from
`macros` at the top of the file.

Check a file before playing it — this reports every problem at once and exits non-zero:

```sh
node tools/check-puzzles.js
```

`http://localhost:8000/?puzzles=draft.json` plays an alternate set from `site/` without
disturbing `puzzles.json`.

Pushes to `main` publish automatically via `.github/workflows/pages.yml`.
