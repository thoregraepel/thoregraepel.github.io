// permanent.js — Ryser's formula for the permanent of a small matrix, plus
// *all* of its leave-one-out minors in a single O(2^m · m^2) sweep.
//
// Why this matters here: an all-different constraint over m cells and m values
// is a permutation factor. Its exact sum-product message is
//
//     mu_{a->i}(d)  =  perm( A with row i and column d deleted )
//
// where A[k][t] is the incoming message from cell k about value t. So one call
// to `permanentMinors` produces the exact factor-to-variable messages for a
// whole Sudoku unit. With 0/1 entries the same call yields exact generalised
// arc consistency: minor == 0 means "no completion uses value d in cell i".
//
// Ryser:  perm(A) = (-1)^m * sum_{S subset of cols} (-1)^{|S|} prod_k r_k(S)
// with r_k(S) = sum_{j in S} A[k][j]. Deleting row i and column d restricts the
// product to k != i and the subsets to S not containing d, hence:
//
//     minor(i,d) = (-1)^{m-1} * sum_{S: d not in S} (-1)^{|S|} prod_{k != i} r_k(S)
//
// The leave-one-out products prod_{k != i} r_k(S) come from prefix/suffix
// products, so no division by a possibly-zero r_i is needed.

const MAXM = 9;

const _r = new Float64Array(MAXM);
const _pre = new Float64Array(MAXM + 1);
const _suf = new Float64Array(MAXM + 1);
const _loo = new Float64Array(MAXM);

/**
 * @param {Float64Array} a   row-major m x m matrix with non-negative entries
 * @param {number} m         0 <= m <= 9
 * @param {Float64Array} out length >= m*m; receives minors[i*m + d]
 * @returns {number} the permanent of `a`
 */
export function permanentMinors(a, m, out) {
  if (m === 0) return 1;
  for (let k = 0; k < m * m; k++) out[k] = 0;
  for (let k = 0; k < m; k++) _r[k] = 0;

  const total = 1 << m;
  let acc = 0; // accumulates sum_S (-1)^{|S|} prod_k r_k(S)
  let S = 0;
  let sign = 1;

  // S = empty set: r is all zero, so the full product is 0 (m >= 1) and the
  // leave-one-out product is 0 unless m == 1 (empty product == 1).
  contribute(m, S, sign, out, /*full=*/false);

  for (let g = 1; g < total; g++) {
    // Gray code: successive subsets differ in bit ctz(g).
    let j = 0, x = g;
    while ((x & 1) === 0) { x >>= 1; j++; }
    const b = 1 << j;
    if (S & b) { S ^= b; for (let k = 0; k < m; k++) _r[k] -= a[k * m + j]; }
    else { S |= b; for (let k = 0; k < m; k++) _r[k] += a[k * m + j]; }
    sign = -sign;
    acc += sign * contribute(m, S, sign, out, true);
  }

  const permSign = m & 1 ? -1 : 1;      // (-1)^m
  const minorSign = m & 1 ? 1 : -1;     // (-1)^{m-1}
  for (let k = 0; k < m * m; k++) out[k] *= minorSign;
  return acc * permSign;
}

/** Adds this subset's contribution to the minors; returns prod_k r_k(S). */
function contribute(m, S, sign, out, nonEmpty) {
  _pre[0] = 1;
  for (let k = 0; k < m; k++) _pre[k + 1] = _pre[k] * _r[k];
  _suf[m] = 1;
  for (let k = m - 1; k >= 0; k--) _suf[k] = _suf[k + 1] * _r[k];
  for (let i = 0; i < m; i++) _loo[i] = _pre[i] * _suf[i + 1];

  for (let d = 0; d < m; d++) {
    if (S & (1 << d)) continue;
    for (let i = 0; i < m; i++) {
      const v = _loo[i];
      if (v !== 0) out[i * m + d] += sign * v;
    }
  }
  return nonEmpty ? _pre[m] : 0;
}

/** Permanent only (no minors) — used by tests and diagnostics. */
export function permanent(a, m) {
  if (m === 0) return 1;
  const r = new Float64Array(m);
  let acc = 0, S = 0, sign = 1;
  for (let g = 1; g < 1 << m; g++) {
    let j = 0, x = g;
    while ((x & 1) === 0) { x >>= 1; j++; }
    const b = 1 << j;
    if (S & b) { S ^= b; for (let k = 0; k < m; k++) r[k] -= a[k * m + j]; }
    else { S |= b; for (let k = 0; k < m; k++) r[k] += a[k * m + j]; }
    sign = -sign;
    let p = 1;
    for (let k = 0; k < m; k++) p *= r[k];
    acc += sign * p;
  }
  return acc * (m & 1 ? -1 : 1);
}
