// Tests for the Nock interpreter and the puzzles.json loader.
//
//   node tools/test-engine.js
//
// Self-contained on purpose: this checks the engine, so it must not start
// failing because a level was reworded. Exits non-zero on the first bad run.
import {
  parse, fmt, fmtExplicit, run, eq, sameShape, isCell, loadLevels, expandMacros,
} from '../site/engine.js';

let passed = 0;
const failures = [];

function is(what, got, want) {
  if (got === want) passed++;
  else failures.push(`${what}\n    expected  ${want}\n    got       ${got}`);
}

// A whole program, evaluated the way the page evaluates it.
const ev = src => {
  const r = run(parse(src));
  return r.ok ? fmt(r.v) : 'crash';
};
const nock = (what, src, want) => is(`${what}:  ${src}`, ev(src), want);

const throws = (what, fn, fragment) => {
  try {
    fn();
    failures.push(`${what}\n    expected a throw mentioning ${JSON.stringify(fragment)}, got none`);
  } catch (e) {
    if (e.message.includes(fragment)) passed++;
    else failures.push(`${what}\n    expected a throw mentioning ${JSON.stringify(fragment)}\n    got       ${JSON.stringify(e.message)}`);
  }
};

// ---------- the reader ----------

is('sugar folds right', eq(parse('[1 2 3]'), parse('[1 [2 3]]')), true);
is('deep sugar', eq(parse('[1 2 3 4]'), parse('[1 [2 [3 4]]]')), true);
is('parens are brackets', eq(parse('(1 2 3)'), parse('[1 2 3]')), true);
is('mixed pairs', eq(parse('[1 2)'), parse('[1 2]')), true);
is('nested parens', eq(parse('((1 2) 3)'), parse('[[1 2] 3]')), true);
is('fmt sugars', fmt(parse('[1 [2 3]]')), '[1 2 3]');
is('fmtExplicit pairs', fmtExplicit(parse('[1 2 3]')), '[1 [2 3]]');
is('atoms are bigints', fmt(parse('18446744073709551616')), '18446744073709551616');
is('leading zeros', fmt(parse('007')), '7');

throws('empty source', () => parse(''), 'Nothing yet');
throws('unclosed bracket', () => parse('[1 2'), 'never closes');
throws('stray closer', () => parse(']'), 'closes nothing');
throws('single-item cell', () => parse('[5]'), 'at least two things');
throws('trailing junk', () => parse('1 2'), 'trails the answer');
throws('bad character', () => parse('[1 {2}]'), 'Only digits');
is('error carries an offset', (() => { try { parse('[1 2'); } catch (e) { return e.at; } })(), 0);
is('offset points at the character', (() => { try { parse('[1 {2}]'); } catch (e) { return e.at; } })(), 3);

// ---------- axes: /[axis noun] ----------

nock('axis 1 is everything', '[[[1 2] [3 4]] 0 1]', '[[1 2] 3 4]');
nock('axis 2 is the head', '[[[1 2] [3 4]] 0 2]', '[1 2]');
nock('axis 3 is the tail', '[[[1 2] [3 4]] 0 3]', '[3 4]');
nock('axis 4', '[[[1 2] [3 4]] 0 4]', '1');
nock('axis 5', '[[[1 2] [3 4]] 0 5]', '2');
nock('axis 6', '[[[1 2] [3 4]] 0 6]', '3');
nock('axis 7', '[[[1 2] [3 4]] 0 7]', '4');
nock('axis 8', '[[[[1 2] 3] 4] 0 8]', '1');
nock('axis 9', '[[[[1 2] 3] 4] 0 9]', '2');
nock('axis 0 crashes', '[42 0 0]', 'crash');
nock('no tail on an atom', '[42 0 3]', 'crash');

// ---------- the opcodes ----------

nock('1 is a constant', '[42 1 57]', '57');
nock('1 keeps cells whole', '[0 1 [1 2 3]]', '[1 2 3]');
nock('1 ignores the subject', '[[9 9] 1 0]', '0');

nock('3 on an atom', '[42 3 0 1]', '1');
nock('3 on a cell', '[[1 2] 3 0 1]', '0');

nock('4 increments', '[42 4 0 1]', '43');
nock('4 nests', '[42 4 4 0 1]', '44');
nock('4 past 2^64', '[0 4 1 18446744073709551615]', '18446744073709551616');
nock('4 on a cell crashes', '[[1 2] 4 0 1]', 'crash');

nock('5 on equals', '[42 5 [1 7] [1 7]]', '0');
nock('5 on differents', '[42 5 [1 7] [1 8]]', '1');
nock('5 compares trees', '[[[1 2] [1 2]] 5 [0 2] [0 3]]', '0');

nock('a cell head autoconses', '[[6 7] [0 3] 0 2]', '[7 6]');
nock('autocons nests', '[1 [[1 2] [1 3]] 1 4]', '[[2 3] 4]');

nock('6 takes the yes branch', '[42 6 [1 0] [1 7] [1 8]]', '7');
nock('6 takes the no branch', '[42 6 [1 1] [1 7] [1 8]]', '8');
nock('6 wants a loobean', '[42 6 [1 2] [1 7] [1 8]]', 'crash');

nock('7 composes', '[42 7 [4 0 1] 4 0 1]', '44');
nock('7 replaces the subject', '[42 7 [1 [1 2]] 0 3]', '2');

nock('8 pushes onto the subject', '[42 8 [4 0 1] 0 2]', '43');
nock('8 keeps the old subject', '[42 8 [4 0 1] 0 3]', '42');

nock('2 evaluates', '[42 2 [1 7] [1 4 0 1]]', '8');
nock('2 can build its own formula', '[7 2 [0 1] 1 [4 0 1]]', '8');

nock('10 edits the head', '[[1 2] 10 [2 1 9] 0 1]', '[9 2]');
nock('10 edits the tail', '[[1 2] 10 [3 1 9] 0 1]', '[1 9]');
nock('10 edits deep', '[[[1 2] [3 4]] 10 [5 1 99] 0 1]', '[[1 99] 3 4]');
nock('10 at axis 1 replaces all', '[[1 2] 10 [1 1 9] 0 1]', '9');

nock('11 passes through, static', '[42 11 1 4 0 1]', '43');
nock('11 passes through, dynamic', '[42 11 [1 1 7] 4 0 1]', '43');
nock('11 really runs its hint', '[42 11 [1 0 3] 4 0 1]', 'crash');

nock('9 pulls a formula from a core', '[[[4 0 3] 41] 9 2 0 1]', '42');

nock('an atom is not a formula', '[42 1]', 'crash');
nock('unknown opcode', '[42 99 0 1]', 'crash');

// A formula that forever evaluates itself. Must run out of budget, not hang.
nock('runaway loops are cut off', '[[2 [0 1] [0 1]] 2 [0 1] [0 1]]', 'crash');

// ---------- a real core, driven for many steps ----------
// The decrement from the last transmission. Kept here verbatim so this file
// stays honest if puzzles.json changes.
const DEC = '[8 [1 0] 8 [1 6 [5 [0 7] 4 0 6] [0 6] 9 2 [0 2] [4 0 6] 0 7] 9 2 0 1]';
nock('decrement 1', `[1 ${DEC}]`, '0');
nock('decrement 2', `[2 ${DEC}]`, '1');
nock('decrement 11', `[11 ${DEC}]`, '10');
nock('decrement 100', `[100 ${DEC}]`, '99');
nock('decrement 0 never finishes', `[0 ${DEC}]`, 'crash');

// ---------- noun comparison ----------

is('eq on equals', eq(parse('[1 2 3]'), parse('[1 [2 3]]')), true);
is('eq on differents', eq(parse('[1 2]'), parse('[1 3]')), false);
is('eq across kinds', eq(parse('1'), parse('[1 1]')), false);
is('sameShape ignores values', sameShape(parse('[1 2]'), parse('[8 9]')), true);
is('sameShape sees structure', sameShape(parse('[1 2]'), parse('[1 [2 3]]')), false);
is('isCell on a cell', isCell(parse('[1 2]')), true);
is('isCell on an atom', isCell(parse('42')), false);

// ---------- macros ----------

is('macro splices', expandMacros('[3 $X]', { X: '[1 2]' }), '[3 [1 2]]');
is('macros nest', expandMacros('$A', { A: '[$B $B]', B: '7' }), '[7 7]');
is('untouched without macros', expandMacros('[1 2]', {}), '[1 2]');
throws('unknown macro', () => expandMacros('$NOPE', {}), 'no macro named');
throws('macro cycle', () => expandMacros('$A', { A: '$B', B: '$A' }), 'expands into itself');

// ---------- the level loader ----------

const level = extra => ({ title: 't', ex: ['[42 1 7]'], q: '[42 1 7]', ...extra });
const load = doc => loadLevels(doc);

is('a good level loads', load({ levels: [level()] })[0].title, 't');
is('more defaults to empty', load({ levels: [level()] })[0].more.length, 0);
is('unlockAxes defaults false', load({ levels: [level()] })[0].unlockAxes, false);
is('titles are trimmed', load({ levels: [level({ title: '  spaced  ' })] })[0].title, 'spaced');
is('programs arrive expanded',
  load({ macros: { Q: '[42 1 7]' }, levels: [level({ ex: ['$Q'] })] })[0].ex[0], '[42 1 7]');

throws('no levels', () => load({ levels: [] }), 'non-empty "levels"');
throws('missing title', () => load({ levels: [level({ title: undefined })] }), 'needs a "title"');
throws('blank title', () => load({ levels: [level({ title: '   ' })] }), 'needs a "title"');
throws('missing ex', () => load({ levels: [level({ ex: undefined })] }), 'needs an "ex"');
throws('empty ex', () => load({ levels: [level({ ex: [] })] }), 'at least one example');
throws('unparseable program', () => load({ levels: [level({ ex: ['[1 2'] })] }), 'never closes');
throws('crashing question', () => load({ levels: [level({ q: '[42 0 3]' })] }), 'no answer to type');
throws('unknown key', () => load({ levels: [level({ unlockAxis: true })] }), 'unknown key');
throws('every problem at once',
  () => load({ levels: [level({ title: undefined }), level({ q: '[1 2' })] }), 'level 2');

// ---------- report ----------

if (failures.length) {
  console.error(`\n${failures.length} failed:\n`);
  failures.forEach(f => console.error(`  ${f}\n`));
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${passed} passed.`);
