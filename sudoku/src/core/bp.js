// bp.js — sum-product belief propagation on the Sudoku factor graph.
//
// Variables: 81 cells, each ranging over 9 digits.
// Factors:   27 all-different units. Each is a *permutation* factor:
//            f(x_u) = 1 iff the 9 cells of the unit carry the 9 digits bijectively.
//
// The exact factor-to-variable message of a permutation factor is a permanent:
//
//     mu_{a->i}(d)  =  perm( A_{-i,-d} ),   A[k][t] = mu_{k->a}(t)
//
// so one Ryser sweep per unit gives all 81 messages exactly. BP is therefore
// exact *within* each unit; the only approximation left is the loopy structure
// connecting rows, columns and boxes.
//
// The partition function Z of the uniform distribution over the remaining
// solutions equals the number of solutions, so the Bethe estimate of log2 Z is
// an estimate of the joint entropy of the maximum-entropy belief state. It is
// exactly zero when a single solution remains, which is the target the solver
// drives towards.

import {
  NCELLS, NUNITS, UNITS, UNITS_OF, SLOT_IN_UNIT, POPCOUNT, DIGITS_OF,
} from './grid.js';
import { permanentMinors } from './permanent.js';

const MSG_LEN = NUNITS * 9 * 9; // (unit, slot, digit)
const LOG2 = Math.LN2;

const mi = (u, s, d) => (u * 9 + s) * 9 + d;

const _mat = new Float64Array(81);
const _min = new Float64Array(81);
const _tmp = new Float64Array(9);

export class FactorGraph {
  constructor() {
    this.mV2F = new Float64Array(MSG_LEN);
    this.mF2V = new Float64Array(MSG_LEN);
    this.zUnit = new Float64Array(NUNITS);
    this.beliefs = new Float64Array(NCELLS * 9);
    this.initialised = false;
  }

  /** Uniform messages restricted to the current candidate sets. */
  reset(cand) {
    this.mV2F.fill(0);
    this.mF2V.fill(0);
    for (let u = 0; u < NUNITS; u++) {
      const cells = UNITS[u];
      for (let s = 0; s < 9; s++) {
        const ds = DIGITS_OF[cand[cells[s]]];
        const w = ds.length ? 1 / ds.length : 0;
        for (const d of ds) { this.mV2F[mi(u, s, d)] = w; this.mF2V[mi(u, s, d)] = w; }
      }
    }
    this.initialised = true;
  }

  /** Drop any message mass that the current candidate sets have ruled out. */
  restrict(cand) {
    for (let u = 0; u < NUNITS; u++) {
      const cells = UNITS[u];
      for (let s = 0; s < 9; s++) {
        const mask = cand[cells[s]];
        let sumV = 0, sumF = 0;
        for (let d = 0; d < 9; d++) {
          const k = mi(u, s, d);
          if (!(mask & (1 << d))) { this.mV2F[k] = 0; this.mF2V[k] = 0; }
          sumV += this.mV2F[k]; sumF += this.mF2V[k];
        }
        const ds = DIGITS_OF[mask];
        if (!(sumV > 0)) for (const d of ds) this.mV2F[mi(u, s, d)] = 1 / ds.length;
        else for (const d of ds) this.mV2F[mi(u, s, d)] /= sumV;
        if (!(sumF > 0)) for (const d of ds) this.mF2V[mi(u, s, d)] = 1 / ds.length;
        else for (const d of ds) this.mF2V[mi(u, s, d)] /= sumF;
      }
    }
  }

  /**
   * @param {Int16Array} cand candidate masks (should already be propagated)
   * @param {object} opts {maxIters, tol, damping, floor, warmStart}
   *
   * `floor` mixes every message with the uniform distribution over the cell's
   * candidates. Without it, plain loopy BP on a hard Sudoku becomes *certain*
   * of locally impossible configurations: messages collapse onto the boundary
   * of the simplex, unit permanents underflow to zero, and the iteration
   * hard-oscillates (residual pinned at 1/2) with an undefined free energy.
   * Keeping messages a hair inside the simplex is equivalent to running BP on a
   * slightly softened model; it costs a negligible bias and buys convergence.
   */
  run(cand, opts = {}) {
    const maxIters = opts.maxIters ?? 60;
    const tol = opts.tol ?? 1e-8;
    const damping = opts.damping ?? 0.35;
    const floor = opts.floor ?? 1e-3;

    if (!this.initialised || !opts.warmStart) this.reset(cand);
    else this.restrict(cand);

    let iters = 0;
    let residual = Infinity;
    let converged = false;
    let bestRes = Infinity, bestIter = 0;
    for (; iters < maxIters; iters++) {
      residual = this.factorPass(cand, damping, floor);
      this.variablePass(cand, floor);
      if (residual < tol) { converged = true; iters++; break; }
      // On hard instances loopy BP does not merely fail to converge, it
      // *degrades*: messages saturate, the iteration limit-cycles, and late
      // iterates are markedly worse guides than early ones. Keep the iterate
      // that came closest to a fixed point and fall back to it.
      if (residual < bestRes - 1e-12) {
        bestRes = residual; bestIter = iters + 1;
        (this.bestV2F ||= new Float64Array(MSG_LEN)).set(this.mV2F);
        (this.bestF2V ||= new Float64Array(MSG_LEN)).set(this.mF2V);
      }
    }
    if (!converged && this.bestF2V) {
      this.mV2F.set(this.bestV2F);
      this.mF2V.set(this.bestF2V);
      residual = bestRes;
      iters = bestIter;
    }
    // One clean undamped sweep so the reported beliefs and free energy are
    // consistent with each other.
    this.factorPass(cand, 0, floor);
    this.variablePass(cand, floor);

    return this.measure(cand, { iters, residual, converged });
  }

  /** Factor -> variable messages for every unit. Returns the max change. */
  factorPass(cand, damping, floor = 0) {
    let maxDelta = 0;
    for (let u = 0; u < NUNITS; u++) {
      const cells = UNITS[u];
      const freeSlots = [];
      let used = 0;
      for (let s = 0; s < 9; s++) {
        const mask = cand[cells[s]];
        if (POPCOUNT[mask] === 1) used |= mask; else freeSlots.push(s);
      }
      const digits = DIGITS_OF[0x1ff & ~used];
      const m = freeSlots.length;

      // Assigned cells: the factor tells them nothing new (delta message).
      for (let s = 0; s < 9; s++) {
        const mask = cand[cells[s]];
        if (POPCOUNT[mask] !== 1) continue;
        for (let d = 0; d < 9; d++) this.mF2V[mi(u, s, d)] = (mask & (1 << d)) ? 1 : 0;
      }

      if (m === 0 || m !== digits.length) { this.zUnit[u] = m === 0 ? 1 : 0; continue; }

      for (let i = 0; i < m; i++) {
        const s = freeSlots[i];
        for (let t = 0; t < m; t++) _mat[i * m + t] = this.mV2F[mi(u, s, digits[t])];
      }
      this.zUnit[u] = permanentMinors(_mat, m, _min);

      for (let i = 0; i < m; i++) {
        const s = freeSlots[i];
        let sum = 0;
        for (let t = 0; t < m; t++) {
          const v = _min[i * m + t];
          _tmp[t] = v > 0 ? v : 0;
          sum += _tmp[t];
        }
        if (!(sum > 0)) { // degenerate: fall back to the cell's own candidates
          const ds = DIGITS_OF[cand[cells[s]]];
          for (let d = 0; d < 9; d++) this.mF2V[mi(u, s, d)] = 0;
          for (const d of ds) this.mF2V[mi(u, s, d)] = 1 / ds.length;
          continue;
        }
        const mask = cand[cells[s]];
        for (let d = 0; d < 9; d++) if (!(mask & (1 << d))) this.mF2V[mi(u, s, d)] = 0;
        for (let t = 0; t < m; t++) {
          const d = digits[t];
          if (!(mask & (1 << d))) continue;
          const k = mi(u, s, d);
          const next = _tmp[t] / sum;
          const prev = this.mF2V[k];
          const val = damping > 0 ? damping * prev + (1 - damping) * next : next;
          const delta = Math.abs(val - prev);
          if (delta > maxDelta) maxDelta = delta;
          this.mF2V[k] = val;
        }
        // renormalise after damping, then nudge off the simplex boundary
        const ds = DIGITS_OF[mask];
        let s2 = 0;
        for (const d of ds) s2 += this.mF2V[mi(u, s, d)];
        if (s2 > 0) {
          const unif = floor / ds.length;
          for (const d of ds) this.mF2V[mi(u, s, d)] = (1 - floor) * this.mF2V[mi(u, s, d)] / s2 + unif;
        }
      }
    }
    return maxDelta;
  }

  /** Variable -> factor messages: prior times all incoming except the target. */
  variablePass(cand, floor = 0) {
    for (let c = 0; c < NCELLS; c++) {
      const mask = cand[c];
      const us = UNITS_OF[c];
      const slots = [SLOT_IN_UNIT[us[0]][c], SLOT_IN_UNIT[us[1]][c], SLOT_IN_UNIT[us[2]][c]];
      for (let a = 0; a < 3; a++) {
        const b1 = (a + 1) % 3, b2 = (a + 2) % 3;
        let sum = 0;
        for (let d = 0; d < 9; d++) {
          const v = (mask & (1 << d))
            ? this.mF2V[mi(us[b1], slots[b1], d)] * this.mF2V[mi(us[b2], slots[b2], d)]
            : 0;
          _tmp[d] = v;
          sum += v;
        }
        const base = mi(us[a], slots[a], 0);
        if (sum > 0) {
          const ds = DIGITS_OF[mask];
          const unif = floor / ds.length;
          for (let d = 0; d < 9; d++) this.mV2F[base + d] = 0;
          for (const d of ds) this.mV2F[base + d] = (1 - floor) * _tmp[d] / sum + unif;
        } else {
          const ds = DIGITS_OF[mask];
          for (let d = 0; d < 9; d++) this.mV2F[base + d] = 0;
          for (const d of ds) this.mV2F[base + d] = 1 / ds.length;
        }
      }
    }
  }

  /**
   * Beliefs plus the Bethe approximation to log Z:
   *   log Z ~= sum_a log z_a + sum_i log z_i - sum_{(i,a)} log z_{ia}
   * with z_a = perm(A), z_i = sum_d prod_a mu_{a->i}(d), z_{ia} = <mu_{i->a}, mu_{a->i}>.
   * The expression is invariant to message rescaling, so normalised messages are fine.
   */
  measure(cand, info) {
    const beliefs = this.beliefs;
    let logZ = 0;
    let marginalEntropy = 0;
    let degenerate = false;

    for (let u = 0; u < NUNITS; u++) {
      const z = this.zUnit[u];
      if (z > 0) logZ += Math.log(z); else { degenerate = true; }
    }

    for (let c = 0; c < NCELLS; c++) {
      const mask = cand[c];
      const us = UNITS_OF[c];
      const slots = [SLOT_IN_UNIT[us[0]][c], SLOT_IN_UNIT[us[1]][c], SLOT_IN_UNIT[us[2]][c]];
      let zi = 0;
      for (let d = 0; d < 9; d++) {
        let v = (mask & (1 << d)) ? 1 : 0;
        if (v) for (let a = 0; a < 3; a++) v *= this.mF2V[mi(us[a], slots[a], d)];
        _tmp[d] = v;
        zi += v;
      }
      const off = c * 9;
      if (zi > 0) {
        for (let d = 0; d < 9; d++) beliefs[off + d] = _tmp[d] / zi;
        logZ += Math.log(zi);
      } else {
        const ds = DIGITS_OF[mask];
        for (let d = 0; d < 9; d++) beliefs[off + d] = 0;
        for (const d of ds) beliefs[off + d] = 1 / ds.length;
        degenerate = true;
      }
      for (let a = 0; a < 3; a++) {
        let zia = 0;
        for (let d = 0; d < 9; d++) zia += this.mV2F[mi(us[a], slots[a], d)] * this.mF2V[mi(us[a], slots[a], d)];
        if (zia > 0) logZ -= Math.log(zia); else degenerate = true;
      }
      for (let d = 0; d < 9; d++) {
        const p = beliefs[off + d];
        if (p > 0) marginalEntropy -= p * Math.log2(p);
      }
    }

    const jointEntropy = degenerate || !Number.isFinite(logZ) ? NaN : logZ / LOG2;
    // The Bethe free energy is only meaningful at a fixed point. When the
    // iteration limit-cycles it can even go negative, which is impossible for a
    // count of solutions, so we refuse to report it rather than dress it up.
    const reliable = info.converged && Number.isFinite(jointEntropy) && jointEntropy > -1e-6;
    return {
      beliefs,
      marginalEntropy,
      jointEntropy,
      reliable,
      method: 'bp',
      estSolutions: reliable ? Math.pow(2, Math.max(0, jointEntropy)) : NaN,
      iters: info.iters,
      residual: info.residual,
      converged: info.converged,
      degenerate,
    };
  }
}

/** Convenience: one-shot BP on a candidate state. */
export function inferBeliefs(cand, opts) {
  const g = new FactorGraph();
  const r = g.run(cand, opts);
  return { ...r, beliefs: Float64Array.from(r.beliefs), graph: g };
}

const _ucMat = new Float64Array(81);
const _ucMin = new Float64Array(81);

/**
 * Non-iterative alternative to BP: for each unit, count *exactly* how many
 * completions of that unit place digit d in cell i (the permanent minor of the
 * 0/1 candidate matrix), normalise, and multiply the three units a cell belongs
 * to. This is the exact single-constraint max-entropy marginal combined as a
 * product of experts — equivalently, one BP sweep from a uniform start.
 *
 * It is less sharp than converged BP, but it cannot oscillate or become
 * overconfident, which makes it the dependable fallback on hard instances.
 */
export function unitCountBeliefs(cand, out = new Float64Array(NCELLS * 9)) {
  out.fill(1);
  for (let u = 0; u < NUNITS; u++) {
    const cells = UNITS[u];
    const free = [];
    let used = 0;
    for (const c of cells) {
      if (POPCOUNT[cand[c]] === 1) used |= cand[c]; else free.push(c);
    }
    const digits = DIGITS_OF[0x1ff & ~used];
    const m = free.length;
    if (m === 0 || m !== digits.length) continue;
    for (let i = 0; i < m; i++) {
      const mask = cand[free[i]];
      for (let t = 0; t < m; t++) _ucMat[i * m + t] = (mask & (1 << digits[t])) ? 1 : 0;
    }
    permanentMinors(_ucMat, m, _ucMin);
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let t = 0; t < m; t++) s += Math.max(0, _ucMin[i * m + t]);
      for (let t = 0; t < m; t++) {
        out[free[i] * 9 + digits[t]] *= s > 0 ? Math.max(0, _ucMin[i * m + t]) / s : 1 / m;
      }
    }
  }
  let marginalEntropy = 0;
  for (let c = 0; c < NCELLS; c++) {
    let s = 0;
    for (let d = 0; d < 9; d++) {
      if (!(cand[c] & (1 << d))) out[c * 9 + d] = 0;
      s += out[c * 9 + d];
    }
    const ds = DIGITS_OF[cand[c]];
    if (s > 0) for (let d = 0; d < 9; d++) out[c * 9 + d] /= s;
    else { for (let d = 0; d < 9; d++) out[c * 9 + d] = 0; for (const d of ds) out[c * 9 + d] = 1 / ds.length; }
    for (let d = 0; d < 9; d++) {
      const p = out[c * 9 + d];
      if (p > 0) marginalEntropy -= p * Math.log2(p);
    }
  }
  return { beliefs: out, marginalEntropy };
}

/**
 * Cheap upper bound on the joint entropy: log2 of the number of candidate
 * combinations. Used to score probes without paying for a BP run.
 */
export function countEntropy(cand) {
  let h = 0;
  for (let c = 0; c < NCELLS; c++) h += Math.log2(POPCOUNT[cand[c]]);
  return h;
}

/**
 * The belief state before any inference has been run: uniform over each cell's
 * syntactically available digits. Its marginal entropy equals the sound bound
 * Sum_i log2 |C_i|, which is what makes it the honest "nothing done yet" view.
 */
export function uniformBeliefs(cand, out = new Float64Array(NCELLS * 9)) {
  out.fill(0);
  let marginalEntropy = 0;
  for (let c = 0; c < NCELLS; c++) {
    const ds = DIGITS_OF[cand[c]];
    for (const d of ds) out[c * 9 + d] = 1 / ds.length;
    if (ds.length) marginalEntropy += Math.log2(ds.length);
  }
  return { beliefs: out, marginalEntropy };
}
