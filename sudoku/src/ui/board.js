// board.js — the 9x9 belief display.
//
// A decided cell shows its digit; an undecided cell shows all nine marginals as
// a 3x3 micro bar chart, so the whole maximum-entropy belief state is visible
// at a glance.

import { NCELLS, POPCOUNT, LOWEST, rowOf, colOf, cellName } from '../core/grid.js';

export class BoardView {
  constructor(el, { onSelect } = {}) {
    this.el = el;
    this.cells = [];
    this.prev = null;
    el.innerHTML = '';
    for (let c = 0; c < NCELLS; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      if (rowOf(c) % 3 === 0 && rowOf(c) !== 0) div.classList.add('bt');
      if (colOf(c) % 3 === 0 && colOf(c) !== 0) div.classList.add('bl');
      div.title = cellName(c);
      const val = document.createElement('div');
      val.className = 'val';
      const cands = [];
      for (let d = 0; d < 9; d++) {
        const s = document.createElement('div');
        s.className = 'cand';
        const bar = document.createElement('i');
        bar.className = 'bar';
        const lbl = document.createElement('i');
        lbl.className = 'd';
        lbl.textContent = String(d + 1);
        s.append(bar, lbl);
        cands.push({ el: s, bar, lbl });
        div.append(s);
      }
      div.append(val);
      div.addEventListener('click', () => onSelect && onSelect(c));
      this.el.append(div);
      this.cells.push({ el: div, val, cands });
    }
  }

  /**
   * @param {Int16Array} cand
   * @param {?Float64Array} beliefs 81*9 marginals (null -> uniform over candidates)
   * @param {object} opts {givens, hypothesisCell, selected, showBars, flash:Set}
   */
  render(cand, beliefs, opts = {}) {
    const { givens, hypothesisCell = -1, selected = -1, showBars = true, hypoCells = null } = opts;
    const flash = opts.flash || null;
    for (let c = 0; c < NCELLS; c++) {
      const view = this.cells[c];
      const mask = cand[c];
      const n = POPCOUNT[mask];
      const el = view.el;
      const isGiven = givens && givens[c] > 0;

      el.classList.toggle('sel', c === selected);
      el.classList.toggle('hypo', c === hypothesisCell);
      el.classList.toggle('given', isGiven);
      el.classList.toggle('derived', !isGiven && n === 1 && !(hypoCells && hypoCells.has(c)));
      el.classList.toggle('hypoval', !isGiven && n === 1 && !!(hypoCells && hypoCells.has(c)));
      if (flash) {
        el.classList.remove('elim');
        if (flash.has(c)) { void el.offsetWidth; el.classList.add('elim'); }
      }

      if (n === 1) {
        view.val.textContent = String(LOWEST[mask] + 1);
        view.val.style.display = '';
        for (const cd of view.cands) cd.el.classList.add('off');
        continue;
      }
      view.val.style.display = 'none';
      if (n === 0) {
        view.val.style.display = '';
        view.val.textContent = '×';
        for (const cd of view.cands) cd.el.classList.add('off');
        continue;
      }

      let pmax = 0;
      if (beliefs) for (let d = 0; d < 9; d++) pmax = Math.max(pmax, beliefs[c * 9 + d]);
      for (let d = 0; d < 9; d++) {
        const cd = view.cands[d];
        const on = (mask & (1 << d)) !== 0;
        cd.el.classList.toggle('off', !on);
        if (!on) { cd.bar.style.height = '0'; continue; }
        const p = beliefs ? beliefs[c * 9 + d] : 1 / n;
        cd.bar.style.height = showBars ? `${Math.max(4, p * 100)}%` : '0';
        cd.bar.style.opacity = showBars ? String(0.18 + 0.72 * p) : '0';
        cd.el.classList.toggle('hot', pmax > 0 && p >= pmax * 0.999 && p > 1 / n + 1e-9);
      }
    }
  }

  /** Cells whose candidate set differs from the previous call. */
  diff(cand) {
    const changed = new Set();
    if (this.prev) {
      for (let c = 0; c < NCELLS; c++) if (this.prev[c] !== cand[c]) changed.add(c);
    }
    this.prev = Int16Array.from(cand);
    return changed;
  }
}

/** Bar chart of one cell's marginal distribution. */
export function renderCellBars(container, cand, beliefs, cell) {
  const mask = cand[cell];
  const n = POPCOUNT[mask];
  let h = 0;
  const ps = [];
  for (let d = 0; d < 9; d++) {
    const p = beliefs ? beliefs[cell * 9 + d] : ((mask & (1 << d)) ? 1 / n : 0);
    ps.push(p);
    if (p > 0) h -= p * Math.log2(p);
  }
  const pmax = Math.max(...ps, 1e-9);
  const bars = ps.map((p, d) => `
    <div class="barcol ${p > 0 ? '' : 'zero'}">
      <div class="p">${p > 0.0005 ? (p * 100).toFixed(0) : ''}</div>
      <div class="b" style="height:${(p / pmax) * 100}%"></div>
      <div class="n">${d + 1}</div>
    </div>`).join('');
  container.innerHTML = `
    <div class="ci-head"><b>${cellName(cell)}</b> — ${n === 1
      ? `decided: ${LOWEST[mask] + 1}, entropy 0 bits`
      : `${n} candidates, marginal entropy ${h.toFixed(3)} of at most ${Math.log2(n).toFixed(2)} bits`}</div>
    <div class="bars">${bars}</div>`;
}
