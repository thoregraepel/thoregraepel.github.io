// solver.js — a plain, fast backtracking solver.
//
// This is deliberately *not* the reasoning system: it exists only to validate
// puzzles, count solutions (uniqueness), and provide ground truth for the test
// suite and the benchmark.

import { NCELLS, POPCOUNT, LOWEST, DIGITS_OF, PEERS, ALL, digitsOf } from './grid.js';

function assign(cand, cell, digit) {
  const b = 1 << digit;
  if (!(cand[cell] & b)) return false;
  cand[cell] = b;
  const stack = [cell];
  while (stack.length) {
    const c = stack.pop();
    const m = cand[c];
    const d = LOWEST[m];
    for (const p of PEERS[c]) {
      if (cand[p] & (1 << d)) {
        cand[p] &= ~(1 << d);
        if (cand[p] === 0) return false;
        if (POPCOUNT[cand[p]] === 1) stack.push(p);
      }
    }
  }
  return true;
}

function search(cand, solutions, limit) {
  let best = -1, bestCount = 10;
  for (let c = 0; c < NCELLS; c++) {
    const n = POPCOUNT[cand[c]];
    if (n > 1 && n < bestCount) { bestCount = n; best = c; if (n === 2) break; }
  }
  if (best === -1) { solutions.push(digitsOf(cand)); return solutions.length >= limit; }
  for (const d of DIGITS_OF[cand[best]]) {
    const next = Int16Array.from(cand);
    if (assign(next, best, d) && search(next, solutions, limit)) return true;
  }
  return false;
}

/** @returns {{solutions: Int8Array[], count: number}} up to `limit` solutions. */
export function solve(givens, limit = 1) {
  const cand = new Int16Array(NCELLS).fill(ALL);
  for (let c = 0; c < NCELLS; c++) {
    if (givens[c] && !assign(cand, c, givens[c] - 1)) return { solutions: [], count: 0 };
  }
  const solutions = [];
  search(cand, solutions, limit);
  return { solutions, count: solutions.length };
}

export function countSolutions(givens, limit = 2) {
  return solve(givens, limit).count;
}

/** Random completed grid (used by the generator). */
export function randomFullGrid(rng = Math.random) {
  const cand = new Int16Array(NCELLS).fill(ALL);
  const out = new Int8Array(NCELLS);
  const rec = () => {
    let best = -1, bestCount = 10;
    for (let c = 0; c < NCELLS; c++) {
      const n = POPCOUNT[cand[c]];
      if (n > 1 && n < bestCount) { bestCount = n; best = c; }
    }
    if (best === -1) return true;
    const ds = shuffle(DIGITS_OF[cand[best]].slice(), rng);
    const save = Int16Array.from(cand);
    for (const d of ds) {
      if (assign(cand, best, d) && rec()) return true;
      cand.set(save);
    }
    return false;
  };
  for (let c = 0; c < NCELLS; c++) if (POPCOUNT[cand[c]] === 1) out[c] = LOWEST[cand[c]] + 1;
  rec();
  for (let c = 0; c < NCELLS; c++) out[c] = LOWEST[cand[c]] + 1;
  return out;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
