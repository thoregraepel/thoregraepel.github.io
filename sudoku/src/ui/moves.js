// moves.js — the move-analysis table: why the system picked the move it did.

import { cellName } from '../core/grid.js';

export function renderMoves(el, node, reasoner) {
  // A node the search has only just descended into has no evaluation of its
  // own yet. Showing its parent's is more useful than an empty panel: it is
  // exactly the decision that produced this node.
  let ev = node?.evaluation || node?.lastEvaluation;
  let inherited = false;
  if (!ev && node?.parent) {
    ev = node.parent.evaluation || node.parent.lastEvaluation;
    inherited = !!ev;
  }
  if (!ev) {
    el.innerHTML = `<p class="note">${node
      ? 'No evaluation at this node yet. Step until the <em>evaluate</em> phase to see how the next move is chosen.'
      : 'Nothing selected.'}</p>`;
    return;
  }
  const probed = reasoner.probeEnabled;
  const maxEer = Math.max(1e-9, ...ev.candidates.map((c) => (Number.isFinite(c.eer) ? c.eer : 0)));

  const rows = ev.candidates.map((m) => {
    const chosen = ev.chosen && m.cell === ev.chosen.cell;
    const branches = m.branches
      .slice()
      .sort((a, b) => b.p - a.p)
      .map((b) => {
        const cls = b.refuted ? 'ref' : b.complete ? 'done' : (chosen && b === bestOf(m)) ? 'win' : '';
        const post = b.refuted ? 'impossible' : Number.isFinite(b.entropy) ? `H′ ${b.entropy.toFixed(1)}` : '';
        return `<span class="branch ${cls}" title="${b.refuted
          ? 'Refuted: asserting this value propagates to a contradiction, so it is eliminated for good.'
          : `posterior entropy after propagation ≈ ${fmt(b.entropy)} bits; ${b.solved ?? '?'} of 81 cells decided`}">
          ${b.digit + 1}<span class="pp">${(b.p * 100).toFixed(0)}%</span><span class="pp">${post}</span></span>`;
      }).join('');

    return `<tr class="${chosen ? 'chosen' : m.dead ? 'dead' : ''}">
      <td class="cellname">${cellName(m.cell)}</td>
      <td class="num">${m.nCand}</td>
      <td class="num">${m.entropy.toFixed(2)}</td>
      <td>${branches}</td>
      <td class="num">${probed ? m.epe.toFixed(2) : '—'}</td>
      <td class="num">${probed ? m.eer.toFixed(2) : '—'}</td>
      <td>${probed ? `<div class="eerbar"><div style="width:${Math.max(0, (m.eer / maxEer) * 100)}%"></div></div>` : ''}</td>
      <td class="num">${m.refutations || ''}</td>
    </tr>`;
  }).join('');

  const chosenTxt = ev.chosen
    ? `Chosen: <b>${cellName(ev.chosen.cell)}</b>${probed
      ? ` — expected posterior entropy ${ev.chosen.epe.toFixed(2)} bits against a current ${ev.H0.toFixed(2)}, an expected reduction of <b>${ev.chosen.eer.toFixed(2)} bits</b>.`
      : ` — selected by the <b>${reasoner.strategy.label}</b> heuristic (no probing).`}`
    : '';

  el.innerHTML = `
    ${ev.deadCell !== undefined && ev.deadCell !== null ? `<p class="note" style="color:var(--bad)">
       Every value of <b>${cellName(ev.deadCell)}</b> propagated to a contradiction, so this node is refuted and its
       own hypothesis is eliminated in the parent. Probing stopped there.</p>` : ''}
    ${inherited ? `<p class="note" style="color:var(--accent)">Showing the evaluation at
       <b>${node.parent.label}</b> — the decision that produced the current node
       <b>${node.label}</b>. This node has not been evaluated yet.</p>` : ''}
    ${ev.stale ? `<p class="note" style="color:var(--warn)">This evaluation has been superseded: its refutations were
       already folded back into the belief state, so the values struck through below are gone from the board.
       Step again to see the next one.</p>` : ''}
    <p class="note">${probed
      ? `Each value below was asserted and propagated. <b>${ev.probeCount}</b> hypotheses were tested across
         <b>${ev.candidates.length}</b> cells; ${ev.refutations.length} propagated to a contradiction and are
         therefore sound eliminations. Current state entropy bound <span class="mono">H₀ = ${ev.H0.toFixed(2)}</span> bits.`
      : `Strategy <b>${reasoner.strategy.label}</b> does not probe, so posterior entropies are unknown; the move is
         picked directly from the belief state.`}</p>
    <table>
      <thead><tr>
        <th>cell</th><th>#</th><th title="entropy of this cell's marginal">H(Xᵢ)</th>
        <th>hypotheses (belief · posterior entropy)</th>
        <th title="expected posterior entropy, Σ p·H′">E[H′]</th>
        <th title="expected entropy reduction, H₀ − E[H′]">ΔH</th><th></th>
        <th title="values refuted by probing">ref</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">${chosenTxt}</p>`;
}

function bestOf(m) {
  let best = null;
  for (const b of m.branches) if (!b.refuted && (!best || b.p > best.p)) best = b;
  return best;
}

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
