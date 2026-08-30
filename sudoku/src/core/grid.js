// grid.js — indexing, bitmask helpers and the 27 all-different units of Sudoku.
//
// A belief/candidate state is an Int16Array(81) of 9-bit masks: bit d (0..8)
// set means "digit d+1 is still possible in this cell". A cell is *assigned*
// when its mask has exactly one bit.

export const N = 9;
export const NCELLS = 81;
export const ALL = 0x1ff;

export const bitOf = (d) => 1 << d;

export const rowOf = (c) => (c / 9) | 0;
export const colOf = (c) => c % 9;
export const boxOf = (c) => (((c / 27) | 0) * 3) + (((c % 9) / 3) | 0);

// --- units -----------------------------------------------------------------
// UNITS[0..8]   rows
// UNITS[9..17]  columns
// UNITS[18..26] boxes
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = ((b / 3) | 0) * 3;
  const c0 = (b % 3) * 3;
  const cells = [];
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push((r0 + dr) * 9 + c0 + dc);
  UNITS.push(cells);
}
export const NUNITS = UNITS.length; // 27

export const UNIT_KIND = UNITS.map((_, u) => (u < 9 ? 'row' : u < 18 ? 'col' : 'box'));

/** UNITS_OF[cell] = [rowUnit, colUnit, boxUnit] */
export const UNITS_OF = Array.from({ length: NCELLS }, (_, c) => [rowOf(c), 9 + colOf(c), 18 + boxOf(c)]);

/** SLOT_OF[unit][cell] -> position of cell inside that unit (or -1) */
export const SLOT_IN_UNIT = Array.from({ length: NUNITS }, () => new Int8Array(NCELLS).fill(-1));
for (let u = 0; u < NUNITS; u++) UNITS[u].forEach((c, s) => { SLOT_IN_UNIT[u][c] = s; });

/** PEERS[cell] = the 20 cells sharing a unit with it */
export const PEERS = Array.from({ length: NCELLS }, (_, c) => {
  const s = new Set();
  for (const u of UNITS_OF[c]) for (const p of UNITS[u]) if (p !== c) s.add(p);
  return Int8Array.from(s);
});

// --- bit tables ------------------------------------------------------------
export const POPCOUNT = new Uint8Array(512);
export const LOWEST = new Int8Array(512).fill(-1); // index of lowest set bit
export const DIGITS_OF = new Array(512);
for (let m = 0; m < 512; m++) {
  const ds = [];
  for (let d = 0; d < 9; d++) if (m & (1 << d)) ds.push(d);
  POPCOUNT[m] = ds.length;
  LOWEST[m] = ds.length ? ds[0] : -1;
  DIGITS_OF[m] = ds;
}

// --- construction / serialisation -----------------------------------------

/**
 * Parse an 81-cell puzzle. Accepts digits 1-9 as givens and `.`, `0`, `*`, `_`
 * as blanks. Every other character (whitespace, `|`, `+`, `-` box drawing) is
 * skipped, so grids pasted with separators still work.
 */
export function parsePuzzle(text) {
  const givens = new Int8Array(NCELLS);
  let n = 0;
  for (const ch of String(text)) {
    if (ch >= '1' && ch <= '9') { if (n < NCELLS) givens[n] = ch.charCodeAt(0) - 48; n++; }
    else if (ch === '.' || ch === '0' || ch === '*' || ch === '_') { n++; }
    // everything else (whitespace, box drawing) is skipped
  }
  if (n !== NCELLS) throw new Error(`expected 81 cells, found ${n}`);
  return givens;
}

/** Int8Array(81) of digits 0..9 -> candidate masks, ignoring consistency. */
export function candidatesFromGivens(givens) {
  const cand = new Int16Array(NCELLS);
  for (let c = 0; c < NCELLS; c++) cand[c] = givens[c] ? bitOf(givens[c] - 1) : ALL;
  return cand;
}

/** Candidate masks -> Int8Array(81) of digits (0 where unresolved). */
export function digitsOf(cand) {
  const out = new Int8Array(NCELLS);
  for (let c = 0; c < NCELLS; c++) out[c] = POPCOUNT[cand[c]] === 1 ? LOWEST[cand[c]] + 1 : 0;
  return out;
}

/** 81-character string, `.` for unresolved cells. */
export function formatPuzzle(gridOrCand) {
  const digits = gridOrCand instanceof Int16Array ? digitsOf(gridOrCand) : gridOrCand;
  let s = '';
  for (let c = 0; c < NCELLS; c++) s += digits[c] ? String(digits[c]) : '.';
  return s;
}

/** Human-readable cell name, e.g. r1c1 -> "R1C1". */
export const cellName = (c) => `R${rowOf(c) + 1}C${colOf(c) + 1}`;

export const countSolved = (cand) => {
  let n = 0;
  for (let c = 0; c < NCELLS; c++) if (POPCOUNT[cand[c]] === 1) n++;
  return n;
};

export const countCandidates = (cand) => {
  let n = 0;
  for (let c = 0; c < NCELLS; c++) n += POPCOUNT[cand[c]];
  return n;
};

/** Check that the givens do not already violate a constraint. */
export function validateGivens(givens) {
  for (let u = 0; u < NUNITS; u++) {
    const seen = new Int8Array(10);
    for (const c of UNITS[u]) {
      const d = givens[c];
      if (!d) continue;
      if (seen[d]) return `duplicate ${d} in ${UNIT_KIND[u]} ${(u % 9) + 1} (${cellName(c)})`;
      seen[d] = 1;
    }
  }
  return null;
}
