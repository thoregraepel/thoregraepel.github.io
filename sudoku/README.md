# Entropy Sudoku

An interactive Sudoku solver built as a **probabilistic reasoning system**: a maximum-entropy belief
state over 81 discrete variables, inference by message passing on a factor graph, and a search that
picks its next hypothesis by **expected entropy reduction**. Sudoku is the test rig, not the target —
the point is a reasoning architecture whose principles transfer to problems where the constraints are
soft and the evidence is noisy.

```
npm start        # http://localhost:8080  (no dependencies, no build step)
npm test         # 39 tests
npm run generate # rebuild the graded puzzle library
```

There is nothing to install. The app is plain ES modules; `server.js` is a ~40-line static file
server, needed only because ES modules will not load over `file://`.

---

## The idea

**Belief state.** 81 variables, nine values each, and 27 hard all-different constraints. Among all
distributions consistent with what has been *proved*, the maximum-entropy one is the uniform
distribution over the remaining solutions. That is what the board displays and what every number in
the app refers to.

**Inference.** An all-different constraint over *m* cells and *m* values is a **permutation factor**,
and the exact sum-product message out of a permutation factor is a matrix permanent:

```
μ_{a→i}(d) = perm( A with row i and column d deleted ),   A[k][t] = μ_{k→a}(t)
```

Ryser's formula evaluates a 9×9 permanent in 2⁹ terms, and with prefix/suffix products **all 81
leave-one-out minors come out of the same sweep**. Each factor update is therefore exact and costs
microseconds; the only approximation left is the loopy structure joining rows, columns and boxes.

**Entropy.** Every constraint is hard and the target distribution is uniform, so the partition
function *Z* literally counts the remaining solutions and `log₂ Z` *is* the joint entropy. The Bethe
approximation reads it off the converged messages, and it is exactly 0 when one solution remains —
which is precisely the objective.

**Reasoning.** When propagation stalls, the system posits hypotheses: it asserts each candidate
value, follows the consequences, and looks at where they lead. A contradiction **refutes** the value —
a sound elimination folded straight back into the parent belief state, reducing its entropy without
committing to anything. Otherwise the probe yields a posterior entropy `H_d`. The move taken
minimises the expected posterior entropy

```
E[H′ | test i] = Σ_d b_i(d) · H_d        choose  argmax_i ( H₀ − E[H′ | test i] )
```

which is the mutual information between the test and everything else — maximum-information
experimental design applied to reasoning moves. The annotated tree of probes, refutations and
commitments is the record of the reasoning process; click any node to load its belief state.

---

## Results

### Belief propagation works, then stops working

This is the substantive experimental finding, and it is not the one the design hoped for.

On easy and medium puzzles, sound propagation finishes before BP is needed. On some hard puzzles BP
converges and nails every remaining cell. But on the *expert* and *extreme* grades — including all
four famous puzzles in the library — **loopy BP does not converge, and it does not fail gracefully.**
Messages saturate onto the boundary of the simplex, the iteration settles into a limit cycle with the
residual pinned at exactly ½, and unit permanents underflow to zero: BP has become *certain* of
configurations that are locally impossible. The Bethe free energy then comes out **negative**, which
is impossible for a count of solutions.

Worse, it **degrades with iteration**. Fraction of undecided cells whose marginal argmax is the true
digit, on AI Escargot:

| BP sweeps | 1 | 2 | 3 | 5 | 10 | 30 | 100 | 300 |
|---|---|---|---|---|---|---|---|---|
| correct | 27/58 | 30/58 | 29/58 | **31/58** | 27/58 | 19/58 | 19/58 | 19/58 |

It peaks within the first five sweeps and then collapses, permanently: more computation buys a worse
guide. Damping does not fix it (0.3 through 0.95 all limit-cycle) and neither does sequential
scheduling.

Three responses, all selectable in the UI and all honest about what they are:

- **A message floor.** Each message is mixed with a little uniform mass, keeping it off the simplex
  boundary. This is exactly BP on a slightly softened model; it stops the permanents underflowing.
- **Best-iterate fallback.** The run returns the iterate that came *closest to a fixed point* rather
  than wherever the limit cycle stopped, recovering the good early-iterate behaviour with no
  hand-tuned iteration count.
- **A non-iterative alternative.** Per-unit exact counting: for each unit, count exactly how many
  completions place digit *d* in cell *i* — the same permanent minor, on the 0/1 candidate matrix —
  and multiply the three units a cell belongs to. It is the exact single-constraint max-entropy
  marginal combined as a product of experts, it cannot oscillate, and across the library it guides
  almost as well (80.4% argmax accuracy against 81.4% for BP with the fallback).

There is a reason none of this can be pushed much further: for a uniquely-solvable puzzle the
*exact* max-entropy marginals are a point mass on the solution, so computing them exactly **is**
solving the puzzle. Approximate marginals are a guide; the sound layer below is what removes entropy.

Because the Bethe number is often unavailable, the headline figure is one that is always defined and
never overclaims — the sound upper bound `H(X) ≤ Σᵢ log₂|Cᵢ|`, which decreases monotonically and
reaches exactly 0 when solved. The Bethe estimate is shown only at a fixed point, `—` otherwise.

### The entropy criterion earns its keep

Totals over the seven *extreme* puzzles. Backtracks counts hypotheses that had to be withdrawn — wasted
commitment. MRV is *minimum remaining values*, the standard "branch on the most constrained cell" heuristic:

| strategy | backtracks | nodes | probes | learned | ms |
|---|---|---|---|---|---|
| **expected entropy reduction** | **12** | 56 | 1099 | 121 | **687** |
| … with refutation learning off | 35 | 99 | 1468 | 0 | 868 |
| minimum remaining values (MRV) | 131 | 326 | 0 | — | 1328 |
| most confident belief | 253 | 705 | 0 | — | 2305 |
| random cell | 392 | 1293 | 0 | — | 3988 |
| highest marginal entropy | 1067 | 3979 | 0 | — | 10512 |

On the five *expert* puzzles the same ordering holds and the top two need no backtracks at all: 0, 0, 3, 4, 6, 23.

Backtracks alone would be a rigged comparison, since probing is real work and only the top two strategies pay for
it. The honest check is the last column: the criterion runs 1,099 probes the others never run and **still finishes
fastest**, about twice as fast as MRV. The probe budget is more than repaid.

Three things fall out.

*The criterion works.* It beats MRV by an order of magnitude on the extreme puzzles, and on every
expert puzzle it withdraws **no hypothesis at all** — probing plus refutation learning finishes them
outright, with the tree used only as a record.

*Both halves contribute.* The two ablations separate the ideas. Switching learning off keeps the scoring but
throws the refutations away instead of folding them back, and backtracks roughly triple (12 → 35) — that is the
value of *learning*. Even without it the criterion still beats MRV almost fourfold — that is the value of the
*criterion*.

*Maximum entropy is the wrong criterion for choosing the experiment.* The naive reading of "test the
most uncertain thing" — branch on the cell with the **highest** marginal entropy — is the worst
strategy in the table, nearly three times worse than picking a cell at random. Maximum entropy is
right for the belief *state*; for the *move* you want the test that most reduces the entropy of
everything else, which is what expected posterior entropy measures and raw marginal entropy does
not.

### It solves all of them, and it is far slower than a plain solver

With the default configuration the reasoner solves **27 of 27** library puzzles, checked digit-for-digit against
the reference solver. All six strategies solve all 27 with no timeouts. The library *is* the test set, though, and
23 of the 27 came from this project's own generator — only the four famous puzzles are genuinely external.

Against the ordinary DFS solver bundled for validation, the reasoner is **dramatically slower**:

| grade | n | solver ms/puzzle | reasoner ms/puzzle | ratio |
|---|---|---|---|---|
| easy | 5 | 0.018 | 1.6 | 85× |
| medium | 5 | 0.059 | 1.2 | 19× |
| hard | 5 | 0.031 | 0.7 | 21× |
| expert | 5 | 0.054 | 11.6 | 216× |
| extreme | 7 | 0.597 | 110.6 | 185× |

On AI Escargot specifically: 0.022 ms against 208 ms, roughly 9,600×. (Solver figures average 200 repetitions;
each reasoner figure is a single run, so the top three rows are largely timing noise.) Solving that one puzzle the
reasoner runs 19 propagations, 18 BP runs and **326 probes**, each probe a full propagation to fixpoint.

The two are optimising different things. The DFS solver assumes a guess costs nothing — it guesses, fails and
unwinds instantly, and at nanosecond prices that is unbeatable. Whether that is the right assumption depends on what
a hypothesis costs: a CPU branch, or a lab experiment, a database query, a question put to a human, an irreversible
commitment. In the latter regime withdrawn hypotheses *are* the cost function and CPU time is the cheap resource.
That is the regime this targets, and why the benchmark leads with backtracks rather than milliseconds.

The reasoner is not slow *because* it is principled, either. Most of that 208 ms is the probe budget, and the probe
budget is a dial: a shortlist of 1 instead of 10 cuts probing roughly tenfold, and dropping propagation from GAC to
singles makes each probe far cheaper. Both trade hypotheses against time in either direction.

---

## Sound elimination without search

Removing a candidate is only legitimate if it appears in no remaining solution; otherwise the belief
state stops being the max-entropy distribution over the true solution set. Three levels, selectable:

| level | rules |
|---|---|
| 0 | assignment elimination, hidden singles |
| 1 | + pointing / claiming (box-line reduction) |
| 2 | + all-different generalised arc consistency |

Level 2 is decided *exactly* by the permanent machinery already present: run the minors on the 0/1
candidate matrix, and a zero minor means "no completion of this unit puts *d* in that cell". One test
subsumes every naked and hidden subset inside a unit — pairs, triples, quads and the rest — with no
rule catalogue. With integer entries the minors are exact in double precision, so the zero test is
exact rather than a tolerance.

The library grades puzzles by the weakest machinery that suffices: *easy* = singles, *medium* =
box-line, *hard* = arc consistency, *expert*/*extreme* = hypothesis testing required.

---

## Using it

**Controls.** `Step` advances one micro-step through the phase cycle — *propagate → infer → evaluate
→ learn / commit → backtrack* — so every stage of the reasoning is inspectable. `Run` animates it,
`Solve` runs to completion. Space steps, Enter runs, `R` resets.

**Board.** Decided cells show a digit; undecided cells show all nine marginals as a 3×3 micro bar
chart, so the whole belief state is visible at once. Click a cell for its distribution. Colours
distinguish givens, derived values and values held under an active hypothesis; recently eliminated
candidates flash.

**Reasoning tree.** Pan and zoom; colour records what each hypothesis yielded (open, expanded,
refuted, solved). Click a node to load its belief state onto the board.

**Move analysis.** The candidate moves at the current node with per-branch belief, posterior entropy
and refutation status, ranked by expected entropy reduction — the "why this move" panel.

**Puzzles.** 27 uniqueness-verified puzzles across five grades, including AI Escargot, Inkala 2012,
Easter Monster and Golden Nugget (all *extreme*). Also: paste a grid, open a file, fetch a URL
(subject to the remote site's CORS policy), generate a random puzzle at a target grade, or link a
puzzle directly with `?puzzle=<81 chars>`. The parser accepts `.`/`0`/`_`/`*` for blanks and ignores
box-drawing characters, so pasted 9-line grids work.

**Editor.** Click a cell and type; `Check` reports whether the grid has zero, one or many solutions.

**Benchmark.** Runs any subset of strategies over any subset of grades and tabulates tree size,
backtracks, probes, refutations, learned eliminations, depth and time.

---

## Layout

```
src/core/
  grid.js         indexing, bitmask candidate sets, the 27 units, parsing
  permanent.js    Ryser's formula: permanent + all leave-one-out minors in one sweep
  constraints.js  sound propagation, incl. exact all-different GAC via zero minors
  bp.js           belief propagation, Bethe log Z, per-unit counting, uniform priors
  reasoner.js     hypothesis probing, refutation learning, the reasoning tree
  solver.js       plain backtracking solver — validation and ground truth only
  difficulty.js   grading and puzzle generation
src/ui/           board, tree, move table, benchmark, app wiring
src/data/         generated puzzle library
test/run.js       39 tests
tools/generate.js offline library builder
```

`solver.js` is deliberately separate from the reasoning engine: it exists to validate puzzles, count
solutions and provide ground truth for the tests, never to help the reasoner.

## What is tested

The permanent and all its minors against brute force for every matrix up to 6×6; `perm(J₉) = 9!`.
That propagation at every level never removes a candidate belonging to the true solution. That GAC
catches Hall violations and performs naked-pair eliminations. That beliefs are normalised and vanish
on removed candidates; that a solved grid has entropy exactly 0; that Bethe `log Z` recovers the
exact solution count on an under-constrained grid; that the free energy is **withheld** whenever BP
has no fixed point. That per-unit counting assigns exactly zero probability to Hall violations. That
every strategy and both inference modes solve every library puzzle, that unsolvable input is reported
as such, and that `findAll` enumerates exactly the right number of solutions.

## Why not a SAT solver

Deliberately. The point is to keep probability and entropy as the organising principle so the
machinery — a factor graph, a max-entropy belief state, hypothesis selection by expected entropy
reduction, and a tree that records the reasoning — transfers to problems with soft constraints and
noisy evidence, where there is no clause database to hand to a SAT solver.
