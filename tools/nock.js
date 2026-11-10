// Evaluate one program, for when you are writing a level and want to know what
// it does without putting it in puzzles.json first.
//
//   node tools/nock.js '[5 4 0 1]'
//   node tools/nock.js '[11 $DEC]'     ($NAME comes from site/puzzles.json's macros)
//   node tools/nock.js '(5 4 0 1)'     (parens, same as in the game)
//
// Exits 1 if the program cannot be read, 2 on no input. A program that crashes
// is a real answer here, so that still exits 0.
import { readFileSync } from 'node:fs';
import { parse, run, fmt, fmtExplicit, expandMacros, isCell } from '../site/engine.js';

const src = process.argv.slice(2).join(' ').trim();
if (!src) {
  console.error("usage: node tools/nock.js '[subject formula]'");
  process.exit(2);
}

// Macros are a convenience; carry on without them if the file is missing.
let macros = {};
try {
  macros = JSON.parse(readFileSync(new URL('../site/puzzles.json', import.meta.url), 'utf8')).macros || {};
} catch {}

let expanded = src, prog;
try {
  expanded = expandMacros(src, macros);
  prog = parse(expanded);
} catch (e) {
  console.error(expanded);
  if (e.at != null) console.error(`${' '.repeat(e.at)}^`);
  console.error(e.message);
  process.exit(1);
}

if (!isCell(prog)) {
  console.error(`${fmt(prog)}\nA program is a cell: [subject formula].`);
  process.exit(1);
}

const [subject, formula] = prog;
const r = run(prog);
console.log(`subject  ${fmt(subject)}`);
console.log(`formula  ${fmt(formula)}`);
console.log(`result   ${r.ok ? fmt(r.v) : 'crash'}`);
if (r.ok && isCell(r.v) && fmtExplicit(r.v) !== fmt(r.v)) {
  console.log(`paired   ${fmtExplicit(r.v)}`);
}
