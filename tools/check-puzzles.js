// Validate a puzzles file the way the game does, then show what each level answers.
//
//   node tools/check-puzzles.js [path/to/puzzles.json]
//
// Exits non-zero if the file would fail to load in the browser.
import { readFileSync } from 'node:fs';
import { loadLevels, parse, run, fmt } from '../site/engine.js';

const file = process.argv[2] ?? new URL('../site/puzzles.json', import.meta.url);

let levels;
try {
  levels = loadLevels(JSON.parse(readFileSync(file, 'utf8')));
} catch (e) {
  console.error(`${file} will not load:\n\n${e.message}\n`);
  process.exit(1);
}

levels.forEach((L, i) => {
  const onPurpose = [...L.ex, ...L.more].filter(s => !run(parse(s)).ok).length;
  const notes = [
    `${L.ex.length} shown`,
    `${L.more.length} held back`,
    onPurpose ? `${onPurpose} crashing` : null,
    L.unlockAxes ? 'unlocks axes' : null,
  ].filter(Boolean);
  console.log(`${String(i + 1).padStart(2)}  ${L.title.padEnd(20)} ${fmt(run(parse(L.q)).v).padEnd(14)} ${notes.join(', ')}`);
});

console.log(`\n${levels.length} levels, every question answerable.`);
