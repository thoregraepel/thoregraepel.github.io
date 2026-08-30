// difficulty.js — grading and puzzle generation, shared by the browser app and
// the offline library generator.
//
// A puzzle is graded by the weakest machinery that suffices for it, which makes
// the grades meaningful for the reasoning experiment rather than cosmetic.

import { candidatesFromGivens, formatPuzzle } from './grid.js';
import { propagate, isSolved } from './constraints.js';
import { randomFullGrid, shuffle, countSolutions } from './solver.js';
import { Reasoner } from './reasoner.js';

export const GRADE_ORDER = ['easy', 'medium', 'hard', 'expert', 'extreme'];

export function grade(givens) {
  for (const [level, name] of [[0, 'easy'], [1, 'medium'], [2, 'hard']]) {
    const cand = candidatesFromGivens(givens);
    const res = propagate(cand, { level });
    if (res.ok && isSolved(cand)) return { grade: name, level, backtracks: 0 };
  }
  const r = new Reasoner(givens, { strategy: 'mrv', keepBeliefs: false, bpIters: 1 });
  r.run({ timeLimitMs: 15000 });
  const bt = r.stats.backtracks;
  return { grade: bt <= 8 ? 'expert' : 'extreme', level: 3, backtracks: bt };
}

export function describeGrade(g) {
  if (g.level === 0) return 'singles only';
  if (g.level === 1) return 'needs box-line reduction';
  if (g.level === 2) return 'needs all-different arc consistency';
  return g.backtracks === 0
    ? 'needs hypothesis testing, but no backtracking under MRV'
    : `needs hypothesis testing (MRV withdraws ${g.backtracks} hypothes${g.backtracks === 1 ? 'is' : 'es'})`;
}

/** Dig an irreducible, uniquely solvable puzzle out of a random full grid. */
export function digPuzzle(rng = Math.random) {
  const full = randomFullGrid(rng);
  const givens = Int8Array.from(full);
  for (const c of shuffle([...Array(81).keys()], rng)) {
    const saved = givens[c];
    givens[c] = 0;
    if (countSolutions(givens, 2) !== 1) givens[c] = saved;
  }
  return givens;
}

/**
 * Generate a puzzle of (approximately) the requested grade. Falls back to the
 * closest grade found within `tries`.
 */
export function generatePuzzle(target = 'hard', { rng = Math.random, tries = 60 } = {}) {
  const want = GRADE_ORDER.indexOf(target);
  let best = null, bestDist = Infinity;
  for (let i = 0; i < tries; i++) {
    const givens = digPuzzle(rng);
    const g = grade(givens);
    const dist = Math.abs(GRADE_ORDER.indexOf(g.grade) - want);
    if (dist < bestDist) { best = { givens, g }; bestDist = dist; }
    if (dist === 0) break;
  }
  return {
    givens: best.givens,
    puzzle: formatPuzzle(best.givens),
    grade: best.g.grade,
    note: describeGrade(best.g),
    clues: best.givens.reduce((a, b) => a + (b ? 1 : 0), 0),
  };
}
