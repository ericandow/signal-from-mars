# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A puzzle game about deciphering an alien (programming?) language — the language is **Nock** (Urbit's combinator calculus). The player is shown example programs and their results, and must infer what an unseen program evaluates to.

The entire game is one self-contained file: `site/index.html`. There is no build step, no package manager, no dependency manifest, and no test suite. "Run" means opening the file in a browser:

```
xdg-open site/index.html
```

The only external requests are the Google Fonts `<link>`s; without network the CSS falls back to local monospace, which is fine.

## Publishing

Live at **https://ericandow.github.io/signal-from-mars/**. Every push to `main` runs
`.github/workflows/pages.yml`, which uploads **`site/` and only `site/`** as the Pages artifact
and deploys it — so `README.md`, `CLAUDE.md`, and `.jj/` never reach the public site.

Consequences worth keeping in mind:
- Anything the game needs at runtime (assets, extra scripts, split-out level data) must live under `site/`; the workflow needs no change when files are added there.
- The deploy serves the artifact verbatim — Jekyll never runs, so no `.nojekyll` is needed and underscore-prefixed filenames are safe.
- Pages is configured with `build_type: workflow` (not branch-deploy); don't switch the source in repo settings or the workflow's deploy step will start failing.
- Keep the page genuinely static — no server, no secrets, no build-time env. All state is client-side `localStorage`.

## Version control

The repo is a colocated **jj (jujutsu)** + git repo. `git branch` shows `(no branch)` because jj keeps git's HEAD detached — that is normal, not a broken state. Use `jj` for commits (`jj describe`, `jj new`, `jj bookmark set main`) rather than `git commit`, or git will fight jj's working-copy tracking.

## Architecture of `site/index.html`

Top: a small boilerplate `<head>` reset, then the game's own `<style>` (committed dark theme, all colors as `--void`/`--bone`/`--ice`… custom properties), then markup, then one `<script>` divided by comment banners:

**`// ---- engine`** — a Nock 4K interpreter.
- Noun representation: a `BigInt` is an atom, a 2-element JS array `[head, tail]` is a cell. `isCell`/`atom`/`need` are the only accessors; `need`/`atom` throw `Crash` on mismatch.
- `nock(subject, formula, budget)` implements opcodes 0–11. Tail-calling opcodes (2, 6, 7, 8, 9, 11) reassign `s`/`f` and `continue` the `while (true)` loop instead of recursing, so loops like the decrement core in `DEC` don't blow the JS stack. `budget` is a shared mutable step counter (default 200k) that crashes with `'too long'`; pass it down through every recursive call.
- `run(prog)` takes a *whole program noun* `[subject formula]` and returns `{ok: true, v}` or `{ok: false}`. It swallows `Crash` **and `RangeError`** (deep-recursion overflow) as ordinary Nock crashes; anything else rethrows.
- `slot(axis, noun)` / `edit(axis, val, noun)` use standard Nock binary tree addressing (axis bits after the leading 1 pick head/tail).
- `fmt` prints with right-nesting sugar (`[1 2 3]`); `fmtExplicit` prints fully paired (`[1 [2 3]]`). The readout shows both when they differ.
- `tokenize` returns tokens with source spans (`{t, s, e}`), and is deliberately shared by the parser *and* the syntax highlighter — any lexer change affects both. `parse` throws plain `Error`s carrying `e.at` (a source offset) so errors can be underlined in place; it rejects brackets holding fewer than two nouns.

**`// ---- puzzles`** — `LEVELS`, an array of `{ex, more, q, intro?, unlockAxes?}`. Every string in `ex` (shown examples), `more` ("another example" hints), and `q` (the line the player must answer) is a complete program noun.
- **Answers are never stored.** The expected answer is `run(parse(L.q)).v`, computed at submit time. Adding a level means writing programs whose results teach the rule.
- Programs that crash are legitimate teaching material — they render as `✕`. Several entries in `more` crash on purpose (e.g. `[9 0 2]`, `[[2 9] 4 0 1]`).
- `unlockAxes: true` on a level means solving it permanently turns on axis labels in the lens (`axesUnlocked()` derives this from `state.solved`, so it survives level navigation and reloads).
- Level order is the curriculum: opcode 1, cell sugar, slots 2/3, deeper axes, 4, 3, 5, autocons, 7, 6, 8, 2, 10, 11, 9, then the `DEC` decrement core as the finale.

**`// ---------- state`** — `state = {cur, solved: Set, revealed}` persisted to `localStorage` under `KEY = 'signal-from-mars-v1'`. Bump that key if the saved shape changes. `WAS` is the pre-rename key (`noun-signal-v1`), read only as a fallback so old saves survive — deletable once nobody is carrying one. `maxOpen()` decides which transmissions in the header strip are reachable (binary dot-glyphs encode the level number).

**`// ---------- highlighting`** — `highlight(src, {caret, errAt})` re-lexes the source, colors brackets by nesting depth modulo 4 (`.d0`–`.d3`), marks unbalanced brackets and the error offset as `.bad`, and highlights the bracket pair around the caret.

**`// ---------- lens`** — `drawTree(noun)` emits inline SVG: an in-order walk assigns each leaf the next x slot and each cell the midpoint of its children, so the tree needs no layout library. Axis numbers are drawn only when unlocked.

**`// ---------- rendering / input`** — `lineEl` builds one `*program → result` row and pins the lens on click/Enter; `renderLevel` rebuilds the feed with staggered `animationDelay`. The reply field is the standard overlay trick: a transparent `<textarea>` on top of a `<pre>` holding the highlighted copy — both must keep identical font, padding, border, and wrapping rules or the caret drifts.

## Conventions worth preserving

- Prose in the UI stays diegetic and spare ("Received.", "The shape is wrong.") — no mention of Nock, Urbit, opcodes, or axes anywhere the player can see. `unlockAxes` exists because the lens is allowed to teach only what the player has earned.
- Wrong answers are distinguished by `sameShape` so feedback can say "the shape is right; some numbers are not" without leaking the answer.
- Keep the accessibility affordances already in place: `aria-label`s on the strip buttons and lens SVG, `role="status"` on the verdict, keyboard activation on feed lines, and the `prefers-reduced-motion` block.

## Exercising the engine without a browser

There is no test harness; to check interpreter or puzzle changes, extract the engine section and drive it from node:

```sh
node -e "
const fs=require('fs');const h=fs.readFileSync('site/index.html','utf8');
const m=h.match(/\/\/ ---- engine[\s\S]*?\/\/ ---------- state/)[0];
fs.writeFileSync('/tmp/eng.js',m.replace('// ---------- state','')+'module.exports={LEVELS,run,parse,fmt};');
const {LEVELS,run,parse,fmt}=require('/tmp/eng.js');
LEVELS.forEach((L,i)=>console.log(i,fmt(run(parse(L.q)).v)));
"
```

Useful sanity check after editing `LEVELS`: confirm each `q` evaluates without crashing (a crashing `q` is unanswerable, since the player has no way to type `✕`).
