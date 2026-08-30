// constraints.js — sound logical propagation over candidate masks.
//
// Everything in here only ever *removes* candidates that provably appear in no
// solution, so the max-entropy distribution over the remaining solutions is
// preserved exactly. Three levels:
//
//   0  assignment elimination + hidden singles
//   1  + pointing / claiming (box-line reduction)
//   2  + full generalised arc consistency for each all-different unit, decided
//      exactly by testing whether the corresponding permanent minor is zero
//
// Level 2 subsumes all naked/hidden subsets inside a unit (pairs, triples,
// quads, ...) because GAC on AllDifferent is exactly Regin's condition, and for
// a 9x9 0/1 matrix the permanent minor is an exact integer in double precision.

import {
  NCELLS, NUNITS, UNITS, UNITS_OF, PEERS, POPCOUNT, LOWEST, DIGITS_OF,
  cellName, UNIT_KIND,
} from './grid.js';
import { permanentMinors } from './permanent.js';

const _mat = new Float64Array(81);
const _min = new Float64Array(81);

const CONTRADICTION = 'contradiction';

/**
 * Propagate `cand` (mutated in place) to a fixpoint.
 * @returns {{ok: boolean, changed: boolean, reason: ?string, trace: Array}}
 */
export function propagate(cand, opts = {}) {
  const level = opts.level ?? 2;
  const trace = opts.trace ? [] : null;
  let changed = false;

  // Units whose structure changed and therefore need re-checking at level 2.
  const dirty = new Uint8Array(NUNITS).fill(1);

  const eliminate = (cell, digit, rule, detail) => {
    const b = 1 << digit;
    if (!(cand[cell] & b)) return false;
    cand[cell] &= ~b;
    changed = true;
    for (const u of UNITS_OF[cell]) dirty[u] = 1;
    if (trace) trace.push({ rule, cell, digit, detail });
    return true;
  };

  for (;;) {
    let progress = false;

    // --- assignment elimination: a solved cell removes its digit from peers.
    for (let c = 0; c < NCELLS; c++) {
      const m = cand[c];
      if (m === 0) return fail(cand, trace, `${cellName(c)} has no candidates`);
      if (POPCOUNT[m] !== 1) continue;
      const d = LOWEST[m];
      for (const p of PEERS[c]) {
        if (cand[p] & m) {
          if (POPCOUNT[cand[p]] === 1) return fail(cand, trace, `${cellName(p)} conflicts with ${cellName(c)}`);
          if (eliminate(p, d, 'peer', `sees ${cellName(c)}=${d + 1}`)) progress = true;
        }
      }
    }

    // --- hidden singles: a digit with a single home inside a unit.
    for (let u = 0; u < NUNITS; u++) {
      const cells = UNITS[u];
      for (let d = 0; d < 9; d++) {
        const b = 1 << d;
        let count = 0, where = -1;
        for (const c of cells) if (cand[c] & b) { count++; where = c; }
        if (count === 0) return fail(cand, trace, `no home for ${d + 1} in ${UNIT_KIND[u]} ${(u % 9) + 1}`);
        if (count === 1 && POPCOUNT[cand[where]] > 1) {
          const removed = DIGITS_OF[cand[where] & ~b];
          cand[where] = b;
          changed = true; progress = true;
          for (const uu of UNITS_OF[where]) dirty[uu] = 1;
          if (trace) trace.push({ rule: 'hidden-single', cell: where, digit: d, removed, detail: `only place for ${d + 1} in ${UNIT_KIND[u]} ${(u % 9) + 1}` });
        }
      }
    }
    if (progress) continue;

    // --- pointing / claiming (level >= 1)
    if (level >= 1) {
      for (let b = 0; b < 9; b++) {
        const boxCells = UNITS[18 + b];
        for (let d = 0; d < 9; d++) {
          const bit = 1 << d;
          const hits = boxCells.filter((c) => cand[c] & bit);
          if (hits.length < 2) continue;
          const rows = new Set(hits.map((c) => (c / 9) | 0));
          const cols = new Set(hits.map((c) => c % 9));
          if (rows.size === 1) {
            const r = [...rows][0];
            for (const c of UNITS[r]) if (!boxCells.includes(c) && (cand[c] & bit)) {
              if (eliminate(c, d, 'pointing', `${d + 1} in box ${b + 1} is confined to row ${r + 1}`)) progress = true;
            }
          }
          if (cols.size === 1) {
            const cc = [...cols][0];
            for (const c of UNITS[9 + cc]) if (!boxCells.includes(c) && (cand[c] & bit)) {
              if (eliminate(c, d, 'pointing', `${d + 1} in box ${b + 1} is confined to column ${cc + 1}`)) progress = true;
            }
          }
        }
      }
      for (let u = 0; u < 18; u++) {
        const cells = UNITS[u];
        for (let d = 0; d < 9; d++) {
          const bit = 1 << d;
          const hits = cells.filter((c) => cand[c] & bit);
          if (hits.length < 2) continue;
          const boxes = new Set(hits.map((c) => (((c / 27) | 0) * 3) + (((c % 9) / 3) | 0)));
          if (boxes.size !== 1) continue;
          const bx = [...boxes][0];
          for (const c of UNITS[18 + bx]) if (!hits.includes(c) && (cand[c] & bit)) {
            if (eliminate(c, d, 'claiming', `${d + 1} in ${UNIT_KIND[u]} ${(u % 9) + 1} is confined to box ${bx + 1}`)) progress = true;
          }
        }
      }
      if (progress) continue;
    }

    // --- exact all-different GAC via zero permanent minors (level >= 2)
    if (level >= 2) {
      for (let u = 0; u < NUNITS; u++) {
        if (!dirty[u]) continue;
        dirty[u] = 0;
        const res = gacUnit(cand, u, eliminate);
        if (res === CONTRADICTION) return fail(cand, trace, `unit ${UNIT_KIND[u]} ${(u % 9) + 1} has no valid completion`);
        if (res) progress = true;
      }
      if (progress) continue;
    }

    break;
  }

  return { ok: true, changed, reason: null, trace };
}

function fail(cand, trace, reason) {
  return { ok: false, changed: true, reason, trace };
}

/**
 * Generalised arc consistency for one all-different unit. Builds the 0/1
 * incidence matrix over free cells x unused digits and drops every (cell,digit)
 * whose minor permanent is zero — i.e. that participates in no perfect
 * matching, hence in no completion of this unit.
 */
function gacUnit(cand, u, eliminate) {
  const cells = UNITS[u];
  const free = [];
  let used = 0;
  for (const c of cells) {
    if (POPCOUNT[cand[c]] === 1) {
      if (used & cand[c]) return CONTRADICTION;
      used |= cand[c];
    } else free.push(c);
  }
  const digits = DIGITS_OF[0x1ff & ~used];
  const m = free.length;
  if (m !== digits.length) return CONTRADICTION;
  if (m === 0) return false;

  for (let i = 0; i < m; i++) {
    const mask = cand[free[i]];
    for (let t = 0; t < m; t++) _mat[i * m + t] = (mask & (1 << digits[t])) ? 1 : 0;
  }
  const perm = permanentMinors(_mat, m, _min);
  if (!(perm > 0.5)) return CONTRADICTION;

  let progress = false;
  for (let i = 0; i < m; i++) {
    for (let t = 0; t < m; t++) {
      if (!_mat[i * m + t]) continue;
      if (_min[i * m + t] < 0.5) {
        if (eliminate(free[i], digits[t], 'alldiff-gac',
          `${digits[t] + 1} in ${cellName(free[i])} leaves ${UNIT_KIND[u]} ${(u % 9) + 1} uncompletable`)) progress = true;
      }
    }
  }
  return progress;
}

/** Assign a digit and propagate on a copy; returns null on contradiction. */
export function assignAndPropagate(cand, cell, digit, opts) {
  const next = Int16Array.from(cand);
  next[cell] = 1 << digit;
  const res = propagate(next, opts);
  return res.ok ? next : null;
}

/** True when every cell is decided (assumes propagation already succeeded). */
export function isSolved(cand) {
  for (let c = 0; c < NCELLS; c++) if (POPCOUNT[cand[c]] !== 1) return false;
  return true;
}
