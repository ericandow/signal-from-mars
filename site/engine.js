// Nock 4K: nouns, parsing, formatting, evaluation.
// No DOM in this file — the UI in index.html and tools/check-puzzles.js both import it.
export const isCell = n => Array.isArray(n);
export class Crash extends Error {}
const crash = (m) => { throw new Crash(m || 'crash'); };
const need = n => (isCell(n) ? n : crash('expected cell'));
const atom = n => (isCell(n) ? crash('expected atom') : n);

export function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { const s = i; while (i < src.length && /\s/.test(src[i])) i++; toks.push({ t: 'ws', s, e: i }); }
    else if (ch === '[' || ch === ']') { toks.push({ t: ch, s: i, e: i + 1 }); i++; }
    else if (/[0-9]/.test(ch)) { const s = i; while (i < src.length && /[0-9]/.test(src[i])) i++; toks.push({ t: 'num', s, e: i }); }
    else { toks.push({ t: 'bad', s: i, e: i + 1 }); i++; }
  }
  return toks;
}

export function parse(src) {
  const toks = tokenize(src).filter(t => t.t !== 'ws');
  let p = 0;
  const err = (msg, at) => { const e = new Error(msg); e.at = at; throw e; };
  function noun() {
    const tk = toks[p];
    if (!tk) err('The signal ends too soon.', src.length);
    if (tk.t === 'num') { p++; return BigInt(src.slice(tk.s, tk.e)); }
    if (tk.t === '[') {
      p++;
      const items = [];
      while (toks[p] && toks[p].t !== ']') items.push(noun());
      if (!toks[p]) err('A bracket opens here and never closes.', tk.s);
      p++;
      if (items.length < 2) err('A bracket must hold at least two things.', tk.s);
      let n = items[items.length - 1];
      for (let k = items.length - 2; k >= 0; k--) n = [items[k], n];
      return n;
    }
    if (tk.t === ']') err('This bracket closes nothing.', tk.s);
    err('Only digits, spaces and brackets belong here.', tk.s);
  }
  if (!toks.length) err('Nothing yet.', 0);
  const n = noun();
  if (p < toks.length) err('Something extra trails the answer.', toks[p].s);
  return n;
}

export function fmt(n) {
  if (!isCell(n)) return n.toString();
  const parts = [];
  let cur = n;
  while (isCell(cur)) { parts.push(fmt(cur[0])); cur = cur[1]; }
  parts.push(fmt(cur));
  return '[' + parts.join(' ') + ']';
}
export function fmtExplicit(n) {
  if (!isCell(n)) return n.toString();
  return '[' + fmtExplicit(n[0]) + ' ' + fmtExplicit(n[1]) + ']';
}

export function eq(a, b) {
  if (isCell(a) !== isCell(b)) return false;
  if (!isCell(a)) return a === b;
  return eq(a[0], b[0]) && eq(a[1], b[1]);
}
export function sameShape(a, b) {
  if (isCell(a) !== isCell(b)) return false;
  if (!isCell(a)) return true;
  return sameShape(a[0], b[0]) && sameShape(a[1], b[1]);
}

export function slot(ax, n) {
  ax = atom(ax);
  if (ax === 0n) crash('slot 0');
  const bits = ax.toString(2);
  let cur = n;
  for (let k = 1; k < bits.length; k++) { need(cur); cur = bits[k] === '0' ? cur[0] : cur[1]; }
  return cur;
}
export function edit(ax, val, n) {
  ax = atom(ax);
  if (ax === 0n) crash('edit 0');
  if (ax === 1n) return val;
  const parent = ax / 2n;
  if (ax % 2n === 0n) return edit(parent, [val, slot(ax + 1n, n)], n);
  return edit(parent, [slot(ax - 1n, n), val], n);
}

export function nock(s, f, budget = { n: 200000 }) {
  while (true) {
    if (--budget.n < 0) crash('too long');
    const [op, rest] = need(f);
    if (isCell(op)) return [nock(s, op, budget), nock(s, rest, budget)];
    switch (op) {
      case 0n: return slot(rest, s);
      case 1n: return rest;
      case 2n: { const [b, c] = need(rest); const s2 = nock(s, b, budget); const f2 = nock(s, c, budget); s = s2; f = f2; continue; }
      case 3n: return isCell(nock(s, rest, budget)) ? 0n : 1n;
      case 4n: return atom(nock(s, rest, budget)) + 1n;
      case 5n: { const [b, c] = need(rest); return eq(nock(s, b, budget), nock(s, c, budget)) ? 0n : 1n; }
      case 6n: { const [b, cd] = need(rest); const [c, d] = need(cd); const t = nock(s, b, budget); if (t === 0n) f = c; else if (t === 1n) f = d; else crash('bad test'); continue; }
      case 7n: { const [b, c] = need(rest); s = nock(s, b, budget); f = c; continue; }
      case 8n: { const [b, c] = need(rest); s = [nock(s, b, budget), s]; f = c; continue; }
      case 9n: { const [b, c] = need(rest); const core = nock(s, c, budget); s = core; f = slot(b, core); continue; }
      case 10n: { const [bc, d] = need(rest); const [b, c] = need(bc); return edit(b, nock(s, c, budget), nock(s, d, budget)); }
      case 11n: { const [b, c] = need(rest); if (isCell(b)) nock(s, b[1], budget); f = c; continue; }
      default: crash('unknown');
    }
  }
}
// run a whole program noun [subject formula]
export function run(prog) {
  try { const [s, f] = need(prog); return { ok: true, v: nock(s, f) }; }
  catch (e) { if (e instanceof Crash || e instanceof RangeError) return { ok: false }; throw e; }
}

// ---- puzzle format: a puzzles.json document -> levels the UI can render ----
// Programs may use $NAME to splice in an entry from the document's "macros",
// so a reusable core (DEC, and whatever comes next) is written down once.
const MACRO = /\$([A-Z][A-Z0-9_]*)/g;
const LEVEL_KEYS = new Set(['ex', 'more', 'q', 'unlockAxes', 'note']);

function expand(src, macros, trail = []) {
  return src.replace(MACRO, (_, name) => {
    if (!(name in macros)) throw new Error(`no macro named $${name}`);
    if (trail.includes(name)) throw new Error(`macro $${name} expands into itself`);
    return expand(macros[name], macros, [...trail, name]);
  });
}

// Throws one Error listing every problem found, so a bad edit names all its
// own mistakes at once instead of surfacing one per reload.
export function loadLevels(doc) {
  const macros = (doc && doc.macros) || {};
  const raw = doc && doc.levels;
  if (!Array.isArray(raw) || !raw.length) throw new Error('needs a non-empty "levels" array');
  const problems = [];
  const levels = raw.map((L, i) => {
    const bad = m => problems.push(`level ${i + 1}: ${m}`);
    if (!L || typeof L !== 'object' || Array.isArray(L)) { bad('must be an object'); return null; }
    Object.keys(L).forEach(k => { if (!LEVEL_KEYS.has(k)) bad(`unknown key "${k}" (did you mean one of ${[...LEVEL_KEYS].join(', ')}?)`); });
    // Returns the expanded program, or null if it cannot be read at all.
    const prog = (s, what) => {
      if (typeof s !== 'string') { bad(`${what} must be a program string`); return null; }
      let out;
      try { out = expand(s, macros); } catch (e) { bad(`${what}: ${e.message}`); return null; }
      try { parse(out); } catch (e) { bad(`${what}: ${e.message} (${out})`); return null; }
      return out;
    };
    const list = (v, what) => {
      if (v == null) return [];
      if (!Array.isArray(v)) { bad(`${what} must be an array of programs`); return []; }
      return v.map((s, k) => prog(s, `${what}[${k}]`)).filter(s => s != null);
    };
    // Only complain about an empty "ex" when it really is empty — an example that
    // failed to parse has already said so, and need not also be counted missing.
    if (L.ex == null) bad('needs an "ex" array of examples');
    else if (Array.isArray(L.ex) && !L.ex.length) bad('needs at least one example in "ex"');
    const ex = list(L.ex, '"ex"');
    const q = prog(L.q, '"q"');
    // A crashing question is unanswerable: there is no way to type the "✕".
    if (q != null && !run(parse(q)).ok) bad('"q" crashes, so it has no answer to type');
    return { ex, more: list(L.more, '"more"'), q, unlockAxes: L.unlockAxes === true };
  });
  if (problems.length) throw new Error(problems.join('\n'));
  return levels;
}
