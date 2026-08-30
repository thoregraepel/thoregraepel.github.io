// benchmark.js — run reasoning strategies over the graded suite.
//
// The point of the test suite is not speed but *how much hypothesising* each
// strategy needs: hypotheses posited, branches refuted, backtracks, tree size.

import { parsePuzzle } from '../core/grid.js';
import { Reasoner, STRATEGIES } from '../core/reasoner.js';

const METRICS = [
  { key: 'solvedCount', label: 'solved', best: 'max', fmt: (v, n) => `${v}/${n}` },
  { key: 'nodes', label: 'tree nodes', best: 'min' },
  { key: 'backtracks', label: 'backtracks', best: 'min' },
  { key: 'probes', label: 'probes', best: 'min' },
  { key: 'refutations', label: 'refutations', best: 'max' },
  { key: 'learned', label: 'learned elim.', best: 'max' },
  { key: 'maxDepth', label: 'max depth', best: 'min' },
  { key: 'ms', label: 'ms', best: 'min', fmt: (v) => v.toFixed(0) },
];

/**
 * @param {Array} puzzles library entries
 * @param {string[]} strategies
 * @param {(progress: {done, total, label}) => void} onProgress
 * @returns {Promise<object>} results[grade][strategy] = aggregate
 */
export async function runBenchmark(puzzles, strategies, onProgress, opts = {}) {
  const timeLimitMs = opts.timeLimitMs ?? 8000;
  const results = {};
  const total = puzzles.length * strategies.length;
  let done = 0;

  for (const p of puzzles) {
    const givens = parsePuzzle(p.puzzle);
    for (const s of strategies) {
      const r = new Reasoner(givens, { strategy: s, keepBeliefs: false });
      const t0 = performance.now();
      const outcome = r.run({ timeLimitMs });
      const ms = performance.now() - t0;
      const g = (results[p.grade] ||= {});
      const agg = (g[s] ||= { n: 0, solvedCount: 0, nodes: 0, backtracks: 0, probes: 0, refutations: 0, learned: 0, maxDepth: 0, ms: 0 });
      agg.n++;
      if (outcome === 'solved') agg.solvedCount++;
      agg.nodes += r.stats.nodesCreated;
      agg.backtracks += r.stats.backtracks;
      agg.probes += r.stats.probes;
      agg.refutations += r.stats.refutations;
      agg.learned += r.stats.learnedEliminations;
      agg.maxDepth = Math.max(agg.maxDepth, r.stats.maxDepth);
      agg.ms += ms;
      done++;
      onProgress?.({ done, total, label: `${p.name} · ${s}` });
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  return results;
}

export function renderBenchmark(el, results, strategies) {
  const grades = Object.keys(results);
  if (!grades.length) { el.innerHTML = '<p class="note">No results.</p>'; return; }

  let html = '<table><thead><tr><th>grade / strategy</th>' +
    METRICS.map((m) => `<th class="mono">${m.label}</th>`).join('') + '</tr></thead><tbody>';

  for (const g of grades) {
    const row = results[g];
    const present = strategies.filter((s) => row[s]);
    const bests = {};
    for (const m of METRICS) {
      const vals = present.map((s) => row[s][m.key]);
      bests[m.key] = m.best === 'min' ? Math.min(...vals) : Math.max(...vals);
    }
    html += `<tr class="grp"><td colspan="${METRICS.length + 1}">${g} — ${row[present[0]].n} puzzle${row[present[0]].n === 1 ? '' : 's'}</td></tr>`;
    for (const s of present) {
      const a = row[s];
      html += `<tr><td>${STRATEGIES[s]?.label || s}</td>` + METRICS.map((m) => {
        const v = a[m.key];
        const txt = m.fmt ? m.fmt(v, a.n) : String(v);
        const isBest = v === bests[m.key] && present.length > 1;
        return `<td class="mono ${isBest ? 'best' : ''}">${txt}</td>`;
      }).join('') + '</tr>';
    }
  }
  html += '</tbody></table>';
  html += `<p class="note">Totals over the puzzles in each grade. Solving <em>faster</em> matters less here than
    solving with <em>fewer hypotheses</em>: the interesting column is backtracks, which counts how often a posited
    hypothesis had to be withdrawn.</p>`;
  el.innerHTML = html;
}
