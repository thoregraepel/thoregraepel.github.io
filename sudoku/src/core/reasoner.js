// reasoner.js — the entropy-driven reasoning engine.
//
// The system holds a belief state (81 discrete variables, 9 values each) that
// is always the maximum-entropy distribution over the solutions still
// consistent with everything it has proved. Concretely:
//
//   * candidate masks encode hard knowledge (a removed candidate provably
//     appears in no remaining solution);
//   * belief propagation over the 27 all-different permutation factors gives
//     the marginals of the uniform distribution over those solutions, and a
//     Bethe estimate of its joint entropy log2 Z.
//
// Reasoning proceeds by *probing hypotheses*. For a candidate cell the engine
// tentatively asserts each value, follows the logical consequences, and looks
// at where they lead:
//
//   * a contradiction refutes the value — a sound elimination that is fed back
//     into the parent belief state (this is reasoning, not search: the tree
//     shrinks the parent's entropy without committing to anything);
//   * otherwise the probe yields a posterior entropy H_d.
//
// The move actually taken is the one minimising the expected posterior entropy
//     EPE(i) = sum_d  b_i(d) * H_d
// equivalently maximising the expected entropy reduction H - EPE(i). The
// annotated tree of probes, refutations and commitments *is* the record of the
// reasoning process.

import {
  NCELLS, POPCOUNT, DIGITS_OF, UNITS_OF, UNITS, cellName, countSolved,
  countCandidates, candidatesFromGivens, digitsOf,
} from './grid.js';
import { propagate, assignAndPropagate, isSolved } from './constraints.js';
import { FactorGraph, countEntropy, unitCountBeliefs, uniformBeliefs } from './bp.js';

export const STRATEGIES = {
  eer: {
    label: 'Max expected entropy reduction',
    probe: true, learn: true,
    describe: 'Probes a shortlist of cells, scores each by expected posterior entropy, keeps every refutation it finds.',
  },
  eerNoLearn: {
    label: 'Expected entropy reduction (no learning)',
    probe: true, learn: false,
    describe: 'Same scoring, but refutations are not fed back into the parent — isolates the value of learning.',
  },
  mrv: {
    label: 'Fewest candidates (MRV)',
    probe: false, learn: false,
    describe: 'Classic minimum-remaining-values branching; no probing, no refutation learning.',
  },
  maxprob: {
    label: 'Most confident belief',
    probe: false, learn: false,
    describe: 'Branches on the cell whose strongest marginal is largest, trying that value first.',
  },
  maxentropy: {
    label: 'Highest marginal entropy',
    probe: false, learn: false,
    describe: 'Branches on the least-decided cell — the naive "most informative test" reading of entropy.',
  },
  random: {
    label: 'Random cell',
    probe: false, learn: false,
    describe: 'Baseline: uniformly random unassigned cell.',
  },
  logic: {
    label: 'Constraint propagation only',
    probe: false, learn: false, noSearch: true,
    describe: 'No hypotheses at all — measures how far sound propagation alone gets.',
  },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextNodeId = 0;

class Node {
  constructor(parent, hypothesis, cand) {
    this.id = nextNodeId++;
    this.parent = parent;
    this.children = [];
    this.childByKey = new Map();
    this.depth = parent ? parent.depth + 1 : 0;
    this.hypothesis = hypothesis; // {cell, digit, prior} | null
    this.cand = cand;
    this.status = 'open'; // open | active | expanded | refuted | solved
    this.reason = null;
    this.evaluation = null;
    this.beliefs = null;
    this.stats = null;
    this.eliminations = [];
    this.log = [];
    this.visits = 0;
  }

  get label() {
    return this.hypothesis ? `${cellName(this.hypothesis.cell)}=${this.hypothesis.digit + 1}` : 'root';
  }

  pathToRoot() {
    const path = [];
    for (let n = this; n; n = n.parent) path.push(n);
    return path.reverse();
  }
}

export class Reasoner {
  constructor(givens, options = {}) {
    this.options = {
      strategy: 'eer',
      level: 2,          // propagation strength at tree nodes
      probeLevel: 1,     // propagation strength inside probes (cheaper)
      shortlist: 10,     // cells scored per evaluation
      inference: 'bp',   // 'bp' (loopy BP, permanent factors) | 'unit' (per-unit counting)
      bpIters: 40,
      bpDamping: 0.5,
      bpTol: 1e-8,
      bpFloor: 1e-3,
      findAll: false,    // keep searching after the first solution
      keepBeliefs: true,
      seed: 12345,
      ...options,
    };
    const strat = STRATEGIES[this.options.strategy] || STRATEGIES.eer;
    this.strategy = strat;
    this.probeEnabled = options.probe ?? strat.probe;
    this.learnEnabled = options.learn ?? strat.learn;
    this.rng = mulberry32(this.options.seed);

    this.givens = Int8Array.from(givens);
    nextNodeId = 0;
    this.root = new Node(null, null, candidatesFromGivens(givens));
    this.nodes = new Map([[this.root.id, this.root]]);
    this.current = this.root;
    this.phase = 'propagate';
    this.done = false;
    this.outcome = null; // 'solved' | 'unsolvable' | 'exhausted' | 'aborted'
    this.solutions = [];
    this.graph = new FactorGraph();
    this.warm = false;
    this.stats = {
      steps: 0, nodesCreated: 1, propagations: 0, probes: 0, refutations: 0,
      learnedEliminations: 0, backtracks: 0, bpRuns: 0, maxDepth: 0, timeMs: 0,
    };
    this.history = [];
  }

  register(node) {
    this.nodes.set(node.id, node);
    this.stats.nodesCreated++;
    if (node.depth > this.stats.maxDepth) this.stats.maxDepth = node.depth;
    return node;
  }

  emit(event) {
    this.history.push(event);
    if (this.history.length > 400) this.history.shift();
    return event;
  }

  // ---------------------------------------------------------------- stepping

  /** Advance the reasoning process by one micro-step. */
  step() {
    if (this.done) return this.emit({ type: 'done', outcome: this.outcome, message: `finished: ${this.outcome}` });
    const t0 = now();
    this.stats.steps++;
    let ev;
    switch (this.phase) {
      case 'propagate': ev = this.doPropagate(); break;
      case 'infer': ev = this.doInfer(); break;
      case 'evaluate': ev = this.doEvaluate(); break;
      case 'learn': ev = this.doLearn(); break;
      case 'commit': ev = this.doCommit(); break;
      case 'backtrack': ev = this.doBacktrack(); break;
      default: ev = { type: 'done', outcome: this.outcome };
    }
    this.stats.timeMs += now() - t0;
    return this.emit(ev);
  }

  /** Run until finished or a limit is hit. Used by the benchmark. */
  run({ maxSteps = 500000, timeLimitMs = 20000 } = {}) {
    const t0 = now();
    let steps = 0;
    while (!this.done && steps < maxSteps) {
      this.step();
      steps++;
      if ((steps & 63) === 0 && now() - t0 > timeLimitMs) {
        this.done = true;
        this.outcome = 'aborted';
        break;
      }
    }
    return this.outcome;
  }

  doPropagate() {
    const node = this.current;
    node.visits++;
    node.status = 'active';
    const res = propagate(node.cand, { level: this.options.level, trace: true });
    this.stats.propagations++;
    const removals = res.trace ? res.trace.length : 0;
    if (!res.ok) {
      node.status = 'refuted';
      node.reason = res.reason;
      this.phase = 'backtrack';
      return { type: 'contradiction', nodeId: node.id, message: `${node.label}: contradiction — ${res.reason}` };
    }
    node.propagationTrace = res.trace;
    this.phase = 'infer';
    return {
      type: 'propagate',
      nodeId: node.id,
      message: removals
        ? `Propagated logical constraints at ${node.label}: ${removals} candidate${removals === 1 ? '' : 's'} eliminated.`
        : `Propagated logical constraints at ${node.label}: already at a fixpoint.`,
    };
  }

  /**
   * Run the configured inference engine over a candidate state.
   * `graph` is reused (and warm-started) for the node the search sits on.
   */
  infer(cand, { graph = null, warmStart = false } = {}) {
    if (this.options.inference === 'unit') {
      const r = unitCountBeliefs(cand);
      return {
        beliefs: r.beliefs, marginalEntropy: r.marginalEntropy,
        jointEntropy: NaN, estSolutions: NaN, reliable: false, method: 'unit',
        iters: 1, residual: 0, converged: true,
      };
    }
    const g = graph || new FactorGraph();
    return g.run(cand, {
      maxIters: this.options.bpIters,
      damping: this.options.bpDamping,
      tol: this.options.bpTol,
      floor: this.options.bpFloor,
      warmStart,
    });
  }

  doInfer() {
    const node = this.current;
    const r = this.infer(node.cand, { graph: this.graph, warmStart: this.warm });
    this.warm = true;
    this.stats.bpRuns++;
    node.beliefs = this.options.keepBeliefs ? Float64Array.from(r.beliefs) : null;
    node.stats = {
      solved: countSolved(node.cand),
      candidates: countCandidates(node.cand),
      marginalEntropy: r.marginalEntropy,
      jointEntropy: r.jointEntropy,
      estSolutions: r.estSolutions,
      reliable: r.reliable,
      method: r.method,
      boundEntropy: countEntropy(node.cand),
      bpIters: r.iters,
      bpConverged: r.converged,
      bpResidual: r.residual,
    };

    if (isSolved(node.cand)) {
      node.status = 'solved';
      const digits = digitsOf(node.cand);
      this.solutions.push({ digits, nodeId: node.id, depth: node.depth });
      if (this.options.findAll) {
        this.phase = 'backtrack';
        return { type: 'solution', nodeId: node.id, message: `Solution ${this.solutions.length} found at depth ${node.depth}; continuing to look for others.` };
      }
      this.done = true;
      this.outcome = 'solved';
      this.phase = 'halt';
      return { type: 'solution', nodeId: node.id, message: `Solved. Joint entropy reached 0 bits at depth ${node.depth}.` };
    }

    this.phase = 'evaluate';
    const bound = node.stats.boundEntropy;
    const detail = r.method === 'unit'
      ? 'Per-unit exact counting'
      : `Belief propagation: ${r.iters} iteration${r.iters === 1 ? '' : 's'}${r.converged
        ? `, converged — joint entropy ${fmt(r.jointEntropy)} bits`
        : `, did not converge (best residual ${r.residual.toExponential(1)}); falling back to its closest-to-fixed-point iterate`}`;
    return {
      type: 'infer',
      nodeId: node.id,
      message: `${detail}. Entropy bound ${bound.toFixed(2)} bits, marginal entropy ${r.marginalEntropy.toFixed(2)} bits.`,
    };
  }

  doEvaluate() {
    const node = this.current;
    if (this.strategy.noSearch) {
      this.done = true;
      this.outcome = 'exhausted';
      this.phase = 'halt';
      return { type: 'stuck', nodeId: node.id, message: 'Constraint propagation alone cannot make further progress.' };
    }
    const evaluation = this.evaluateMoves(node);
    node.evaluation = evaluation;
    node.lastEvaluation = evaluation; // retained for the UI once the live one is consumed
    if (!evaluation.candidates.length) {
      node.status = 'refuted';
      node.reason = 'no move available';
      this.phase = 'backtrack';
      return { type: 'contradiction', nodeId: node.id, message: `${node.label}: no viable move.` };
    }
    if (evaluation.deadCell) {
      node.status = 'refuted';
      node.reason = `every value of ${cellName(evaluation.deadCell)} is refuted`;
      this.phase = 'backtrack';
      return { type: 'contradiction', nodeId: node.id, message: `${node.label}: every value of ${cellName(evaluation.deadCell)} leads to a contradiction.` };
    }
    if (this.learnEnabled && evaluation.refutations.length) {
      this.phase = 'learn';
      return {
        type: 'evaluate',
        nodeId: node.id,
        message: `Probed ${evaluation.candidates.length} cell${evaluation.candidates.length === 1 ? '' : 's'} (${evaluation.probeCount} hypotheses); ${evaluation.refutations.length} refuted.`,
      };
    }
    this.phase = 'commit';
    const best = evaluation.chosen;
    return {
      type: 'evaluate',
      nodeId: node.id,
      message: `Scored ${evaluation.candidates.length} candidate move${evaluation.candidates.length === 1 ? '' : 's'}; best is ${cellName(best.cell)} with expected entropy reduction ${best.eer.toFixed(2)} bits.`,
    };
  }

  doLearn() {
    const node = this.current;
    const refs = node.evaluation.refutations;
    for (const r of refs) {
      node.cand[r.cell] &= ~(1 << r.digit);
      node.eliminations.push(r);
      node.log.push(`${cellName(r.cell)} ≠ ${r.digit + 1} — hypothesis refuted by propagation`);
    }
    this.stats.learnedEliminations += refs.length;
    node.evaluation = null;
    if (node.lastEvaluation) node.lastEvaluation = { ...node.lastEvaluation, stale: true };
    this.phase = 'propagate';
    return {
      type: 'learn',
      nodeId: node.id,
      message: `Learned ${refs.length} sound elimination${refs.length === 1 ? '' : 's'} from refuted hypotheses: ${refs.slice(0, 6).map((r) => `${cellName(r.cell)}≠${r.digit + 1}`).join(', ')}${refs.length > 6 ? ', …' : ''}`,
    };
  }

  doCommit() {
    const node = this.current;
    const move = node.evaluation.chosen;
    node.status = 'expanded';
    node.chosenCell = move.cell;

    const branches = move.branches.filter((b) => !b.refuted);
    // Try the most promising branch first: a probe that already completed the
    // grid, otherwise the most probable value.
    branches.sort((a, b) => (b.complete === true) - (a.complete === true) || b.p - a.p);

    for (const br of branches) {
      const key = `${move.cell}:${br.digit}`;
      let child = node.childByKey.get(key);
      if (!child) {
        const cand = Int16Array.from(node.cand);
        cand[move.cell] = 1 << br.digit;
        child = new Node(node, { cell: move.cell, digit: br.digit, prior: br.p }, cand);
        child.probe = { entropy: br.entropy, solvedAfter: br.solved };
        node.children.push(child);
        node.childByKey.set(key, child);
        this.register(child);
      } else if (child.status === 'open') {
        const cand = Int16Array.from(node.cand);
        cand[move.cell] = 1 << br.digit;
        child.cand = cand;
      }
    }
    const next = node.children.find((c) => c.status === 'open');
    if (!next) {
      node.status = 'refuted';
      node.reason = 'all branches exhausted';
      this.phase = 'backtrack';
      return { type: 'contradiction', nodeId: node.id, message: `${node.label}: all branches exhausted.` };
    }
    this.current = next;
    this.phase = 'propagate';
    return {
      type: 'commit',
      nodeId: next.id,
      parentId: node.id,
      message: `Hypothesis: ${cellName(move.cell)} = ${next.hypothesis.digit + 1} (belief ${(next.hypothesis.prior * 100).toFixed(1)}%, expected entropy reduction ${move.eer.toFixed(2)} bits).`,
    };
  }

  doBacktrack() {
    const node = this.current;
    if (node.status === 'active') node.status = 'refuted';
    const parent = node.parent;
    if (!parent) {
      this.done = true;
      this.outcome = this.solutions.length ? 'solved' : 'unsolvable';
      this.phase = 'halt';
      return { type: 'done', nodeId: node.id, outcome: this.outcome, message: this.solutions.length ? `Search complete: ${this.solutions.length} solution(s).` : 'The puzzle has no solution.' };
    }
    this.stats.backtracks++;
    const { cell, digit } = node.hypothesis;
    parent.cand[cell] &= ~(1 << digit);
    const kind = node.status === 'solved' ? 'explored' : 'refuted';
    parent.eliminations.push({ cell, digit, reason: `branch ${cellName(cell)}=${digit + 1} ${kind}`, fromChild: node.id });
    parent.evaluation = null;
    if (parent.lastEvaluation) parent.lastEvaluation = { ...parent.lastEvaluation, stale: true };
    parent.status = 'active';
    this.current = parent;
    this.phase = 'propagate';
    return {
      type: 'backtrack',
      nodeId: parent.id,
      fromId: node.id,
      message: `Back to ${parent.label}: ${cellName(cell)} ≠ ${digit + 1} (${node.reason || kind}).`,
    };
  }

  // -------------------------------------------------------------- evaluation

  /**
   * Score candidate moves. Every scored value is probed by asserting it and
   * running sound propagation; the resulting states give the posterior
   * entropies that define the expected-entropy-reduction criterion.
   */
  evaluateMoves(node) {
    const cand = node.cand;
    const beliefs = node.beliefs || this.currentBeliefs(node);
    const H0 = countEntropy(cand);

    const unassigned = [];
    for (let c = 0; c < NCELLS; c++) {
      if (POPCOUNT[cand[c]] > 1) unassigned.push(c);
    }
    if (!unassigned.length) return { candidates: [], refutations: [], H0, probeCount: 0 };

    const shortlist = this.shortlistCells(unassigned, cand, beliefs);

    const refutations = [];
    const candidates = [];
    let probeCount = 0;
    let deadCell = null;

    for (const cell of shortlist) {
      const digits = DIGITS_OF[cand[cell]];
      let mass = 0;
      for (const d of digits) mass += beliefs[cell * 9 + d];
      const branches = [];
      let refutedHere = 0;

      for (const d of digits) {
        const p = mass > 0 ? beliefs[cell * 9 + d] / mass : 1 / digits.length;
        if (!this.probeEnabled) {
          branches.push({ digit: d, p, refuted: false, entropy: NaN, solved: null, complete: false });
          continue;
        }
        probeCount++;
        this.stats.probes++;
        const next = assignAndPropagate(cand, cell, d, { level: this.options.probeLevel });
        if (!next) {
          refutedHere++;
          this.stats.refutations++;
          refutations.push({ cell, digit: d, reason: 'propagation reaches a contradiction' });
          branches.push({ digit: d, p, refuted: true, entropy: 0, solved: NCELLS, complete: false });
        } else {
          const solved = countSolved(next);
          branches.push({
            digit: d, p, refuted: false,
            entropy: countEntropy(next),
            solved,
            complete: solved === NCELLS,
          });
        }
      }

      // A cell whose every value is refuted refutes the node itself. Record the
      // entry before stopping: it is the decisive part of the reasoning and the
      // UI needs to be able to show it.
      const dead = this.probeEnabled && refutedHere === digits.length;
      if (dead) deadCell = cell;

      // Expected posterior entropy under the current belief. A refuted branch
      // contributes zero entropy: learning that it is impossible is maximally
      // informative.
      let epe = 0;
      if (this.probeEnabled) {
        for (const b of branches) epe += b.p * b.entropy;
      } else {
        epe = NaN;
      }
      candidates.push({
        dead,
        cell,
        branches,
        epe,
        eer: this.probeEnabled ? H0 - epe : NaN,
        refutations: refutedHere,
        entropy: entropyOf(beliefs, cell),
        nCand: digits.length,
        maxBelief: Math.max(...digits.map((d) => beliefs[cell * 9 + d] / (mass || 1))),
      });
      if (dead) break;
    }

    if (deadCell !== null) return { candidates, refutations, H0, probeCount, deadCell };

    const chosen = this.pickMove(candidates);
    candidates.sort((a, b) => this.moveScore(b) - this.moveScore(a));
    return { candidates, refutations, chosen, H0, probeCount };
  }

  shortlistCells(unassigned, cand, beliefs) {
    const strat = this.options.strategy;
    if (strat === 'random') {
      return [unassigned[(this.rng() * unassigned.length) | 0]];
    }
    if (strat === 'mrv') {
      let best = unassigned[0];
      for (const c of unassigned) if (POPCOUNT[cand[c]] < POPCOUNT[cand[best]]) best = c;
      return [best];
    }
    if (strat === 'maxprob') {
      let best = unassigned[0], bestV = -1;
      for (const c of unassigned) {
        let v = 0;
        for (const d of DIGITS_OF[cand[c]]) v = Math.max(v, beliefs[c * 9 + d]);
        if (v > bestV) { bestV = v; best = c; }
      }
      return [best];
    }
    if (strat === 'maxentropy') {
      let best = unassigned[0], bestV = -1;
      for (const c of unassigned) {
        const v = entropyOf(beliefs, c);
        if (v > bestV) { bestV = v; best = c; }
      }
      return [best];
    }
    // Probing strategies: a cheap prior picks which cells are worth the probe
    // budget. Few candidates means a cheap, sharp test; many unsolved peers
    // means its consequences propagate far.
    const scored = unassigned.map((c) => {
      let peersUnsolved = 0;
      for (const u of UNITS_OF[c]) for (const p of UNITS[u]) if (POPCOUNT[cand[p]] > 1) peersUnsolved++;
      return { c, n: POPCOUNT[cand[c]], peersUnsolved };
    });
    scored.sort((a, b) => a.n - b.n || b.peersUnsolved - a.peersUnsolved || a.c - b.c);
    return scored.slice(0, Math.max(1, this.options.shortlist)).map((s) => s.c);
  }

  moveScore(m) {
    if (this.probeEnabled) return m.refutations * 1000 + m.eer;
    switch (this.options.strategy) {
      case 'mrv': return -m.nCand;
      case 'maxprob': return m.maxBelief;
      case 'maxentropy': return m.entropy;
      default: return 0;
    }
  }

  pickMove(candidates) {
    let best = candidates[0];
    for (const m of candidates) if (this.moveScore(m) > this.moveScore(best)) best = m;
    return best;
  }

  /** Beliefs for a node that did not keep them (UI inspection, benchmarks). */
  currentBeliefs(node) {
    return Float64Array.from(this.infer(node.cand).beliefs);
  }

  /**
   * Full measurement for an arbitrary node, used when browsing the tree. Nodes
   * that were created but never visited hold un-propagated candidates, so we
   * propagate a copy first — sound, and it keeps the displayed numbers honest.
   */
  inspect(node) {
    if (node.beliefs && node.stats) return { beliefs: node.beliefs, stats: node.stats };
    // The untouched root is shown exactly as it stands, with beliefs uniform
    // over each cell's remaining digits: the system has not reasoned yet, and
    // pretending otherwise would hide the very first step from the user.
    const fresh = !node.parent && node.visits === 0;
    const cand = Int16Array.from(node.cand);
    const res = fresh ? { ok: true, changed: false } : propagate(cand, { level: this.options.level });
    const ok = res.ok;
    const r = fresh
      ? { ...uniformBeliefs(cand), jointEntropy: NaN, estSolutions: NaN, reliable: false,
          method: 'none', iters: 0, residual: NaN, converged: false }
      : this.infer(cand);
    const beliefs = Float64Array.from(r.beliefs);
    const stats = {
      solved: countSolved(cand),
      candidates: countCandidates(cand),
      marginalEntropy: r.marginalEntropy,
      jointEntropy: r.jointEntropy,
      estSolutions: r.estSolutions,
      reliable: r.reliable,
      method: r.method,
      boundEntropy: countEntropy(cand),
      bpIters: r.iters,
      bpConverged: r.converged,
      bpResidual: r.residual,
      preview: res.changed,
      fresh,
      inconsistent: !ok,
    };
    return { beliefs, stats, cand };
  }
}

function entropyOf(beliefs, c) {
  let h = 0;
  for (let d = 0; d < 9; d++) {
    const p = beliefs[c * 9 + d];
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

function fmt(x) {
  return Number.isFinite(x) ? x.toFixed(2) : 'n/a';
}

const now = typeof performance !== 'undefined' && performance.now
  ? () => performance.now()
  : () => Number(process.hrtime.bigint() / 1000n) / 1000;
