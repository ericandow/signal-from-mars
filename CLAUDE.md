# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A puzzle game about deciphering an alien (programming?) language — the language is **Nock** (Urbit's combinator calculus). The player is shown example programs and their results, and must infer what an unseen program evaluates to.

```
site/index.html    markup, all the CSS, and the UI as an inline ES module
site/engine.js     the Nock interpreter + the puzzles.json format. No DOM.
site/puzzles.json  the levels, fetched at run time
tools/check-puzzles.js  validates a puzzles file the way the browser does
package.json       no dependencies; exists only so node reads .js as ES modules
```

There is no build step and nothing to install.

## Running it

The page loads `engine.js` as a module and fetches `puzzles.json`, and browsers refuse both
over `file://`. **Opening `site/index.html` directly no longer works** — serve it:

```sh
python3 -m http.server 8000 -d site     # then http://localhost:8000/
```

`?puzzles=draft.json` loads a different level set from the same origin, so a work-in-progress
file can be played without touching `puzzles.json`. Puzzles are fetched with `cache: 'no-store'`,
so editing the file and reloading is enough — no cache busting needed.

Check a puzzles file before (or instead of) loading it in a browser:

```sh
node tools/check-puzzles.js                 # site/puzzles.json
node tools/check-puzzles.js path/to/x.json
```

It prints each level's answer and exits non-zero if the file would fail to load.

The only external requests are the Google Fonts `<link>`s; without network the CSS falls back to local monospace, which is fine.

## Publishing

Live at **https://ericandow.github.io/signal-from-mars/**. Every push to `main` runs
`.github/workflows/pages.yml`, which uploads **`site/` and only `site/`** as the Pages artifact
and deploys it — so `README.md`, `CLAUDE.md`, `tools/`, and `.jj/` never reach the public site.

Consequences worth keeping in mind:
- Anything the game needs at run time must live under `site/`; the workflow needs no change when files are added there.
- The deploy serves the artifact verbatim — Jekyll never runs, so no `.nojekyll` is needed and underscore-prefixed filenames are safe.
- Pages is configured with `build_type: workflow` (not branch-deploy); don't switch the source in repo settings or the workflow's deploy step will start failing.
- Keep the page genuinely static — no server, no secrets, no build-time env. All state is client-side `localStorage`.

## Version control

The repo is a colocated **jj (jujutsu)** + git repo. `git branch` shows `(no branch)` because jj keeps git's HEAD detached — that is normal, not a broken state. Use `jj` for commits (`jj describe`, `jj new`, `jj bookmark set main`) rather than `git commit`, or git will fight jj's working-copy tracking.

## `site/engine.js`

A Nock 4K interpreter, exported as plain functions. Imported unchanged by both the browser and
`tools/check-puzzles.js`, so **keep it free of DOM references**.

- Noun representation: a `BigInt` is an atom, a 2-element JS array `[head, tail]` is a cell. `isCell`/`atom`/`need` are the only accessors; `need`/`atom` throw `Crash` on mismatch.
- `nock(subject, formula, budget)` implements opcodes 0–11. Tail-calling opcodes (2, 6, 7, 8, 9, 11) reassign `s`/`f` and `continue` the `while (true)` loop instead of recursing, so loops like the `DEC` core don't blow the JS stack. `budget` is a shared mutable step counter (default 200k) that crashes with `'too long'`; pass it down through every recursive call.
- `run(prog)` takes a *whole program noun* `[subject formula]` and returns `{ok: true, v}` or `{ok: false}`. It swallows `Crash` **and `RangeError`** (deep-recursion overflow) as ordinary Nock crashes; anything else rethrows.
- `slot(axis, noun)` / `edit(axis, val, noun)` use standard Nock binary tree addressing (axis bits after the leading 1 pick head/tail).
- `fmt` prints with right-nesting sugar (`[1 2 3]`); `fmtExplicit` prints fully paired (`[1 [2 3]]`). The readout shows both when they differ.
- `tokenize` returns tokens with source spans (`{t, s, e}`), and is deliberately shared by the parser *and* the UI's syntax highlighter — any lexer change affects both. `(` and `)` lex as `[` and `]`: the token carries the canonical kind while the span still points at whatever was typed, so parens parse, colour and caret-match exactly like brackets without anything downstream knowing. Openers and closers are not required to agree (`[0 6)` is fine) — the point is to spare phone keyboards a layer switch, and half-enforcing it would defeat that. Output is always brackets, so the readout's "reads as [0 6]" doubles as confirmation that parens were understood. `parse` throws plain `Error`s carrying `e.at` (a source offset) so errors can be underlined in place; it rejects brackets holding fewer than two nouns.
- `loadLevels(doc)` turns a parsed `puzzles.json` into the array the UI renders. It is the one validator: the browser and the CLI tool both go through it, so a level set that passes `check-puzzles.js` will load. It collects **every** problem and throws them as one multi-line `Error` rather than stopping at the first.

## `site/puzzles.json`

```jsonc
{
  "macros": { "DEC": "[8 [1 0] …]" },      // $NAME splices one of these into any program
  "levels": [
    { "title": "…",      // required; shown once the level is open, never in the rail
      "ex":  ["…"],      // examples shown with their results
      "more": ["…"],     // held back behind "Another example"; optional
      "q":   "…",        // the line the player must answer
      "unlockAxes": true,// optional; solving this reveals axis numbers in the lens, for good
      "note": "…" }      // optional; ignored by the game — JSON has no comments
  ]
}
```

Every string is a **complete program noun** `[subject formula]`. Parens work here too, since it
is the same lexer, but puzzle files should stay with brackets — that is the form the game displays.

- **Answers are never stored.** The expected answer is `run(parse(L.q)).v`, computed at submit time. Authoring a level means writing programs whose results teach the rule.
- Programs that crash are legitimate teaching material — they render as `✕`. Several entries in `more` crash on purpose. A crashing `q` is rejected, because the player has no way to type `✕`.
- Unknown level keys are an error, so a typo like `unlockAxis` is caught instead of silently doing nothing.
- Level order is the curriculum, and nothing else encodes it: opcode 1, cell sugar, slots 2/3, deeper axes, 4, 3, 5, autocons, 7, 6, 8, 2, 10, 11, 9, then the `DEC` decrement core as the finale. Reordering levels reorders the lessons.

## `site/index.html`

Markup, the whole stylesheet (committed dark theme, all colors as `--void`/`--bone`/`--ice`… custom properties), then the UI as one inline `<script type="module">`:

- **Loading** — `puzzleFile()` resolves `?puzzles=` against the page and refuses other origins; failures call `noSignal()`, which writes the problem list into the readout, disables the controls, and rethrows so nothing runs without levels. `.readout .err` is `pre-wrap` so the multi-line message from `loadLevels` stays one problem per line. Because the levels now arrive over the network, the feed ships with a `.waiting` placeholder in the markup so the first paint isn't an empty console; `renderLevel` and `noSignal` both clear the feed, so nothing has to remove it.
- **State** — `{cur, solved: Set, revealed}` persisted to `localStorage` under `KEY = 'signal-from-mars-v1'`. Bump that key if the saved shape changes. `WAS` is the pre-rename key (`noun-signal-v1`), read only as a fallback so old saves survive — deletable once nobody is carrying one. `maxOpen()` decides which transmissions in the rail are reachable.
- **Highlighting** — `highlight(src, {caret, errAt})` re-lexes with the engine's `tokenize`, colors brackets by nesting depth modulo 4 (`.d0`–`.d3`), marks unbalanced brackets and the error offset as `.bad`, and highlights the bracket pair around the caret.
- **Lens** — `drawTree(noun)` emits inline SVG: an in-order walk assigns each leaf the next x slot and each cell the midpoint of its children, so the tree needs no layout library. Axis numbers are drawn only once `axesUnlocked()`.
- **Layout** — a three-column grid: `.rail` | the open transmission | `.lens`. The rail (`renderRail`) runs down the left edge, each glyph a binary numeral in dots, right-aligned over hidden `i.pad` spacers so the column lines up at the ones place; it is sticky and scrolls internally, so a long level set can't strand its own tail. At ≤1000px the lens drops below the transmission; at ≤620px the rail lays back out horizontally above it and the pads are dropped.
- **What the rail reveals** — only `maxOpen() + 1` glyphs, so the set appears to end where the player has reached; solving the last visible one makes the next arrive with `.arriving`. `railShown` holds the previous count so only genuinely new glyphs animate, and stays `null` until the first render so a reload doesn't replay the whole history. Pad width comes from the *visible* count, not `LEVELS.length` — padding to the full set would quietly advertise how many are still to come, which is also why the index line reads "Transmission 3" with no total.
- **Rendering / input** — `lineEl` builds one `*program → result` row and pins the lens on click/Enter; `renderLevel` rebuilds the feed with staggered `animationDelay`. The reply field is the standard overlay trick: a transparent `<textarea>` on top of a `<pre>` holding the highlighted copy — both must keep identical font, padding, border, and wrapping rules or the caret drifts.

## Conventions worth preserving

- Prose in the UI stays diegetic and spare ("Received.", "The shape is wrong.") — no mention of Nock, Urbit, opcodes, or axes anywhere the player can see. `unlockAxes` exists because the lens is allowed to teach only what the player has earned. The one exception is puzzle-loading failures, which are for the author and say exactly what is wrong.
- `puzzles.json` ships to players, so it carries no explanatory notes by default — the curriculum lives here instead. Titles follow the same rule: they orient without naming the mechanism ("one more", not "increment"), because a title that gives away the lesson is the textbook this game is trying not to be.
- The rail stays wordless — dots only, and the same for its `aria-label`s. A transmission is a number until it is opened; the title is the reward for selecting it.
- Nothing in the UI says how many levels there are. The player learns the set is finite by reaching the end ("The signal goes quiet."), not by reading a counter. Anything that would leak the total — a progress bar, "3 of 16", padding sized to the full set — gives away the one thing the rail is withholding.
- Wrong answers are distinguished by `sameShape` so feedback can say "the shape is right; some numbers are not" without leaking the answer.
- Keep the accessibility affordances already in place: `aria-label`s on the strip buttons and lens SVG, `role="status"` on the verdict, keyboard activation on feed lines, and the `prefers-reduced-motion` block.
