// app.js — wiring: puzzle loading, the step/run loop, and all the views.

import {
  NCELLS, parsePuzzle, formatPuzzle, validateGivens, candidatesFromGivens,
} from '../core/grid.js';
import { Reasoner, STRATEGIES } from '../core/reasoner.js';
import { countSolutions } from '../core/solver.js';
import { generatePuzzle } from '../core/difficulty.js';
import { PUZZLES, GRADES, GRADE_NOTES } from '../data/puzzles.js';
import { BoardView, renderCellBars } from './board.js';
import { TreeView } from './tree.js';
import { renderMoves } from './moves.js';
import { runBenchmark, renderBenchmark } from './benchmark.js';
import { ABOUT_HTML } from './about.js';

const $ = (id) => document.getElementById(id);
const DELAYS = [900, 420, 190, 80, 25, 6, 0];

const state = {
  puzzle: null,        // {name, puzzle, grade, note}
  givens: null,
  reasoner: null,
  selectedNode: null,
  selectedCell: -1,
  running: false,
  timer: null,
  editing: new Int8Array(NCELLS),
  editCursor: 0,
};

// --------------------------------------------------------------- settings UI

const settingsEl = $('settings');
settingsEl.className = 'controls';
settingsEl.innerHTML = `
  <label class="speed" style="margin:0">strategy
    <select id="optStrategy">
      ${Object.entries(STRATEGIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
    </select>
  </label>
  <label class="speed" style="margin:0" title="How many cells are probed per evaluation.">shortlist
    <select id="optShortlist">${[1, 3, 5, 10, 20, 81].map((n) => `<option value="${n}"${n === 10 ? ' selected' : ''}>${n === 81 ? 'all' : n}</option>`).join('')}</select>
  </label>
  <label class="speed" style="margin:0" title="Strength of the sound propagation run at each node.">propagation
    <select id="optLevel">
      <option value="0">singles</option>
      <option value="1">+ box-line</option>
      <option value="2" selected>+ all-different GAC</option>
    </select>
  </label>
  <label class="speed" style="margin:0" title="Which approximate inference produces the marginals.">inference
    <select id="optInference">
      <option value="bp" selected>loopy BP (permanent factors)</option>
      <option value="unit">per-unit exact counting</option>
    </select>
  </label>
  <label class="chk" style="font-size:11.5px;color:var(--fg3)"><input type="checkbox" id="optFindAll"> find all solutions</label>
  <span id="stratNote" class="hint" style="flex-basis:100%"></span>`;
$('board').closest('.pane').querySelector('.controls').after(settingsEl);

// ------------------------------------------------------------------- views

const board = new BoardView($('board'), { onSelect: selectCell });
const tree = new TreeView($('tree'), { onSelect: selectNode });
const editorBoard = new BoardView($('editorBoard'), {
  onSelect: (c) => { state.editCursor = c; renderEditor(); },
});
$('about').innerHTML = ABOUT_HTML;

// -------------------------------------------------------------- puzzle load

function loadPuzzle(entry) {
  const givens = parsePuzzle(entry.puzzle);
  const bad = validateGivens(givens);
  if (bad) { flashError(`invalid puzzle: ${bad}`); return false; }
  state.puzzle = entry;
  state.givens = givens;
  $('puzzleName').textContent = `${entry.name}${entry.grade ? ` · ${entry.grade}` : ''}${entry.note ? ` · ${entry.note}` : ''}`;
  $('puzzleName').title = entry.note || '';
  resetReasoner();
  renderLibrary();
  try {
    const u = new URL(location.href);
    u.searchParams.set('puzzle', entry.puzzle);
    history.replaceState(null, '', u);
  } catch { /* non-http origin */ }
  return true;
}

function resetReasoner() {
  stopRun();
  state.reasoner = new Reasoner(state.givens, {
    strategy: $('optStrategy').value,
    shortlist: Number($('optShortlist').value),
    level: Number($('optLevel').value),
    inference: $('optInference').value,
    findAll: $('optFindAll').checked,
  });
  state.selectedNode = state.reasoner.root;
  state.selectedCell = -1;
  state.rootBound = undefined;
  board.prev = null;
  $('log').innerHTML = '';
  tree.follow = $('treeFollow').checked;
  update({ initial: true });
}

// ------------------------------------------------------------------ stepping

function doStep() {
  const r = state.reasoner;
  if (!r || r.done) { stopRun(); update(); return false; }
  const ev = r.step();
  appendLog(ev);
  if (r.done) stopRun();
  return true;
}

function stepAndRender() {
  if (!doStep()) return;
  if (tree.follow) state.selectedNode = state.reasoner.current;
  update();
}

function startRun() {
  if (state.running || !state.reasoner || state.reasoner.done) return;
  state.running = true;
  $('btnRun').textContent = '❚❚ Pause';
  const tick = () => {
    if (!state.running) return;
    const delay = DELAYS[Number($('speed').value)];
    const batch = delay === 0 ? 40 : 1;
    for (let i = 0; i < batch; i++) if (!doStep()) break;
    if (tree.follow) state.selectedNode = state.reasoner.current;
    update();
    if (state.running && !state.reasoner.done) state.timer = setTimeout(tick, delay);
    else stopRun();
  };
  tick();
}

function stopRun() {
  state.running = false;
  clearTimeout(state.timer);
  state.timer = null;
  $('btnRun').textContent = '▶ Run';
}

function solveNow() {
  stopRun();
  const r = state.reasoner;
  if (!r || r.done) return;
  const t0 = performance.now();
  while (!r.done && performance.now() - t0 < 15000) {
    const ev = r.step();
    if (ev.type !== 'propagate' && ev.type !== 'infer') appendLog(ev);
  }
  state.selectedNode = r.current;
  update();
}

// ------------------------------------------------------------------- render

function update({ initial = false } = {}) {
  const r = state.reasoner;
  if (!r) return;
  const node = state.selectedNode && r.nodes.has(state.selectedNode.id) ? state.selectedNode : r.current;
  state.selectedNode = node;

  const isCurrent = node === r.current;
  const info = node.stats ? { beliefs: node.beliefs, stats: node.stats } : r.inspect(node);
  const beliefs = info.beliefs || node.beliefs;
  const stats = info.stats;
  const shownCand = info.cand || node.cand;

  // header metrics — the headline number is the sound entropy bound, which is
  // always defined and hits 0 exactly when the puzzle is solved.
  const H = stats.boundEntropy;
  $('mJoint').textContent = H < 0.005 ? '0.00' : H.toFixed(2);
  // Baseline for the progress bar: the entropy bound before any reasoning.
  if (node === r.root || state.rootBound === undefined) {
    state.rootBound = node === r.root ? H : (r.root.stats?.boundEntropy ?? H);
  }
  const rootH = state.rootBound;
  const frac = rootH > 0 ? 1 - H / rootH : (H === 0 ? 1 : 0);
  $('mJointBar').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  $('mSolutions').textContent = stats.reliable
    ? (stats.estSolutions < 1000 ? stats.estSolutions.toFixed(stats.estSolutions < 10 ? 2 : 0) : stats.estSolutions.toExponential(1))
    : (stats.method === 'bp' ? '—' : 'n/a');
  $('mSolutions').title = stats.reliable ? `Bethe log₂Z = ${stats.jointEntropy.toFixed(3)} bits`
    : stats.method === 'none' ? 'No inference has been run yet — press Step.'
    : stats.method === 'unit' ? 'Per-unit counting does not produce a free energy.'
    : 'Belief propagation did not reach a fixed point here, so the Bethe free energy is not reportable.';
  $('mMarginal').textContent = stats.marginalEntropy.toFixed(2);
  $('mSolved').textContent = `${stats.solved}/81`;
  $('mNodes').textContent = `${r.stats.nodesCreated} / ${r.stats.maxDepth}`;
  $('mRefs').textContent = `${r.stats.refutations}`;

  // phase strip
  const phases = ['propagate', 'infer', 'evaluate', 'learn', 'commit', 'backtrack'];
  $('phasebar').innerHTML = phases
    .map((p) => `<span class="${isCurrent && r.phase === p ? 'on' : ''}">${p}</span>`).join('') +
    (r.done ? `<span class="on">${r.outcome}</span>` : '');

  // board
  const hypoCells = new Set();
  for (let n = node; n && n.hypothesis; n = n.parent) hypoCells.add(n.hypothesis.cell);
  const flash = initial ? null : board.diff(shownCand);
  if (initial) board.diff(shownCand);
  board.render(shownCand, beliefs, {
    givens: state.givens,
    hypothesisCell: node.hypothesis ? node.hypothesis.cell : -1,
    hypoCells,
    selected: state.selectedCell,
    showBars: $('showBars').checked,
    flash,
  });

  if (state.selectedCell >= 0) renderCellBars($('cellinfo'), shownCand, beliefs, state.selectedCell);

  tree.follow = $('treeFollow').checked;
  tree.render(r, r.current.id, node.id);
  renderNodeInfo(node, stats, isCurrent);
  renderMoves($('moves'), node, r);
}

function renderNodeInfo(node, stats, isCurrent) {
  const path = node.pathToRoot().slice(1).map((n) => n.label).join(' → ') || '—';
  const kv = (k, v, title = '') => `<span class="kv" title="${title}"><span>${k}</span> ${v}</span>`;
  const r = state.reasoner;
  $('treeInfo').innerHTML = `
    <div><b>${node.label}</b> ${isCurrent ? '<span style="color:var(--accent)">· current</span>' : ''}
      <span style="color:var(--fg3)">status: ${node.status}${node.reason ? ` — ${node.reason}` : ''}</span></div>
    <div style="margin-top:4px">
      ${kv('H ≤', `${stats.boundEntropy.toFixed(2)} bits`, 'sound upper bound on the joint entropy: Σ log₂ |Cᵢ|')}
      ${kv('log₂Z', stats.reliable ? `${stats.jointEntropy.toFixed(2)}` : 'n/a', stats.reliable ? 'Bethe free energy at a fixed point' : 'not at a BP fixed point — not reportable')}
      ${kv('ΣH(Xᵢ)', `${stats.marginalEntropy.toFixed(2)}`, 'sum of marginal entropies')}
      ${kv('decided', `${stats.solved}/81`)}
      ${kv('candidates', stats.candidates)}
      ${stats.method === 'none'
        ? kv('inference', 'not run yet', 'beliefs are uniform over each cell\u2019s remaining digits')
        : kv(stats.method === 'unit' ? 'counting' : 'BP',
            stats.method === 'unit' ? 'exact per unit' : `${stats.bpIters} it${stats.bpConverged ? ' \u2713' : ' \u2717'}`,
            stats.method === 'unit' ? 'non-iterative per-unit completion counting'
              : stats.bpConverged ? 'reached a fixed point' : 'no fixed point found; showing the closest iterate')}
      ${kv('depth', node.depth)}
      ${node.eliminations.length ? kv('learned', node.eliminations.length, 'candidates eliminated at this node by refuted hypotheses') : ''}
      ${stats.preview ? '<span class="kv" title="This node has not been visited yet; the display shows its state after sound propagation."><span>preview</span></span>' : ''}
    </div>
    <div style="margin-top:4px;color:var(--fg3);font-size:11px">path: ${path}
      ${r.solutions.length ? ` · solutions found: ${r.solutions.length}` : ''}</div>`;
}

function appendLog(ev) {
  if (!ev.message) return;
  const li = document.createElement('li');
  li.className = `t-${ev.type}`;
  li.innerHTML = `<span class="k">${ev.type}</span>${escapeHtml(ev.message)}`;
  const log = $('log');
  log.append(li);
  while (log.children.length > 300) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

function selectCell(c) {
  state.selectedCell = state.selectedCell === c ? -1 : c;
  if (state.selectedCell < 0) $('cellinfo').innerHTML = '<div class="ci-head">Click a cell to inspect its belief distribution.</div>';
  update();
}

function selectNode(id) {
  const n = state.reasoner.nodes.get(id);
  if (!n) return;
  state.selectedNode = n;
  $('treeFollow').checked = false;
  tree.follow = false;
  update();
}

// ------------------------------------------------------------------- library

function renderLibrary() {
  const el = $('library');
  const byGrade = {};
  for (const p of PUZZLES) (byGrade[p.grade] ||= []).push(p);
  el.innerHTML = '';
  for (const g of GRADES) {
    if (!byGrade[g]) continue;
    const h = document.createElement('h3');
    h.textContent = `${g} — ${GRADE_NOTES[g]}`;
    h.style.gridColumn = '1 / -1';
    el.append(h);
    for (const p of byGrade[g]) {
      const div = document.createElement('div');
      div.className = 'pcard' + (state.puzzle && state.puzzle.puzzle === p.puzzle ? ' on' : '');
      div.innerHTML = `<div class="nm">${escapeHtml(p.name)}</div>
        <div class="meta"><span class="badge ${p.grade}">${p.grade}</span>${p.clues} clues</div>
        <div class="note">${escapeHtml(p.note || '')}</div>`;
      div.addEventListener('click', () => loadPuzzle(p));
      el.append(div);
    }
  }
}

function flashError(msg) {
  $('importErr').textContent = msg;
  if (msg) setTimeout(() => { if ($('importErr').textContent === msg) $('importErr').textContent = ''; }, 6000);
}

function loadFromText(text, name = 'pasted puzzle') {
  let givens;
  try { givens = parsePuzzle(text); }
  catch (e) { flashError(e.message); return false; }
  const bad = validateGivens(givens);
  if (bad) { flashError(bad); return false; }
  const n = countSolutions(givens, 2);
  const note = n === 0 ? 'no solution' : n === 1 ? 'unique solution' : 'multiple solutions';
  flashError('');
  return loadPuzzle({ name, puzzle: formatPuzzle(givens), grade: '', note, clues: givens.reduce((a, b) => a + (b ? 1 : 0), 0) });
}

/** Best-effort extraction of a grid from an arbitrary remote response. */
function extractPuzzle(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const j = JSON.parse(trimmed);
      const board = j.board || j.puzzle || j.grid || j.value || j;
      if (Array.isArray(board)) return board.flat().map((v) => (v == null || v === 0 ? '.' : v)).join('');
      if (typeof board === 'string') return board;
    } catch { /* fall through to raw scan */ }
  }
  return trimmed;
}

// -------------------------------------------------------------------- editor

function renderEditor() {
  const cand = candidatesFromGivens(state.editing);
  editorBoard.render(cand, null, { givens: state.editing, selected: state.editCursor, showBars: false });
  $('edString').value = formatPuzzle(state.editing);
}

function editorKey(e) {
  if (!document.querySelector('.tabpane[data-tab=editor]').classList.contains('active')) return false;
  const c = state.editCursor;
  if (e.key >= '1' && e.key <= '9') { state.editing[c] = Number(e.key); }
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0' || e.key === '.') { state.editing[c] = 0; }
  else if (e.key === 'ArrowLeft') state.editCursor = Math.max(0, c - 1);
  else if (e.key === 'ArrowRight') state.editCursor = Math.min(80, c + 1);
  else if (e.key === 'ArrowUp') state.editCursor = Math.max(0, c - 9);
  else if (e.key === 'ArrowDown') state.editCursor = Math.min(80, c + 9);
  else return false;
  e.preventDefault();
  renderEditor();
  $('edStatus').textContent = '';
  return true;
}

// ----------------------------------------------------------------- benchmark

function setupBenchmark() {
  $('benchStrats').innerHTML = Object.entries(STRATEGIES).map(([k, v]) =>
    `<label title="${escapeHtml(v.describe)}"><input type="checkbox" value="${k}" ${['eer', 'eerNoLearn', 'mrv', 'maxprob'].includes(k) ? 'checked' : ''}> ${v.label}</label>`).join('');
  $('benchGrades').innerHTML = GRADES.map((g) =>
    `<label><input type="checkbox" value="${g}" ${g !== 'extreme' ? 'checked' : ''}> ${g}</label>`).join('');
}

async function doBenchmark() {
  const strategies = [...$('benchStrats').querySelectorAll('input:checked')].map((i) => i.value);
  const grades = new Set([...$('benchGrades').querySelectorAll('input:checked')].map((i) => i.value));
  const puzzles = PUZZLES.filter((p) => grades.has(p.grade));
  if (!strategies.length || !puzzles.length) { $('benchStatus').textContent = 'pick at least one strategy and grade'; return; }
  $('btnBench').disabled = true;
  const results = await runBenchmark(puzzles, strategies, ({ done, total, label }) => {
    $('benchStatus').textContent = `${done}/${total} — ${label}`;
  });
  $('benchStatus').textContent = 'done';
  $('btnBench').disabled = false;
  renderBenchmark($('benchOut'), results, strategies);
}

// -------------------------------------------------------------------- events

$('btnStep').addEventListener('click', () => { stopRun(); stepAndRender(); });
$('btnRun').addEventListener('click', () => (state.running ? stopRun() : startRun()));
$('btnSolve').addEventListener('click', solveNow);
$('btnReset').addEventListener('click', resetReasoner);
$('showBars').addEventListener('change', () => update());
$('treeFollow').addEventListener('change', () => { tree.follow = $('treeFollow').checked; update(); });
$('treeFit').addEventListener('click', () => { $('treeFollow').checked = false; tree.fit(state.reasoner); });

for (const id of ['optStrategy', 'optShortlist', 'optLevel', 'optInference', 'optFindAll']) {
  $(id).addEventListener('change', () => {
    $('stratNote').textContent = STRATEGIES[$('optStrategy').value].describe;
    resetReasoner();
  });
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  for (const x of $('tabs').children) x.classList.toggle('active', x === b);
  for (const p of document.querySelectorAll('.tabpane')) p.classList.toggle('active', p.dataset.tab === b.dataset.tab);
  if (b.dataset.tab === 'tree') tree.applyView();
});

$('btnImport').addEventListener('click', () => loadFromText($('importText').value));
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  loadFromText(extractPuzzle(await f.text()), f.name);
  e.target.value = '';
});
$('btnFetch').addEventListener('click', async () => {
  const url = $('importUrl').value.trim();
  if (!url) return;
  flashError('fetching…');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadFromText(extractPuzzle(await res.text()), new URL(url).hostname);
  } catch (err) {
    flashError(`fetch failed: ${err.message}. The remote site probably does not send CORS headers — download the file and use "Open file…" instead.`);
  }
});
$('btnRandom').addEventListener('click', () => {
  const btn = $('btnRandom');
  btn.disabled = true; btn.textContent = 'generating…';
  setTimeout(() => {
    const g = generatePuzzle($('randomGrade').value);
    loadPuzzle({ name: `Random ${g.grade}`, puzzle: g.puzzle, grade: g.grade, note: g.note, clues: g.clues });
    btn.disabled = false; btn.textContent = 'Generate random';
  }, 20);
});

$('edClear').addEventListener('click', () => { state.editing.fill(0); renderEditor(); $('edStatus').textContent = ''; });
$('edFromCurrent').addEventListener('click', () => { state.editing.set(state.givens); renderEditor(); });
$('edCheck').addEventListener('click', () => {
  const bad = validateGivens(state.editing);
  if (bad) { $('edStatus').textContent = `✗ ${bad}`; return; }
  const n = countSolutions(state.editing, 2);
  $('edStatus').textContent = n === 0 ? '✗ no solution'
    : n === 1 ? '✓ exactly one solution' : '⚠ more than one solution — the reasoner will report the residual entropy';
});
$('edUse').addEventListener('click', () => {
  const bad = validateGivens(state.editing);
  if (bad) { $('edStatus').textContent = `✗ ${bad}`; return; }
  const n = countSolutions(state.editing, 2);
  loadPuzzle({
    name: 'Custom puzzle',
    puzzle: formatPuzzle(state.editing),
    grade: '',
    note: n === 0 ? 'no solution' : n === 1 ? 'unique solution' : 'multiple solutions',
    clues: state.editing.reduce((a, b) => a + (b ? 1 : 0), 0),
  });
  document.querySelector('.tabs button[data-tab=tree]').click();
});
$('btnBench').addEventListener('click', doBenchmark);

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (editorKey(e)) return;
  if (e.code === 'Space') { e.preventDefault(); stopRun(); stepAndRender(); }
  else if (e.code === 'Enter') { e.preventDefault(); state.running ? stopRun() : startRun(); }
  else if (e.key === 'r' || e.key === 'R') resetReasoner();
});

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------- boot

setupBenchmark();
$('stratNote').textContent = STRATEGIES.eer.describe;
renderEditor();

const fromUrl = new URLSearchParams(location.search).get('puzzle');
if (!fromUrl || !loadFromText(fromUrl, 'from link')) {
  // Default to a puzzle that actually exercises the machinery. The easier
  // grades fall to propagation in a single step and the expert ones often
  // finish on refutations alone, leaving the reasoning tree a single node.
  loadPuzzle(PUZZLES.find((p) => p.id === 'ai-escargot')
    || PUZZLES.find((p) => p.grade === 'extreme')
    || PUZZLES[0]);
}
