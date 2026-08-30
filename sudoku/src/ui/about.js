// about.js — the "How it works" panel.
//
// This is the written record of what the system does and what measuring it
// actually showed, including the places where the original design did not work.
// Every figure quoted here was measured on the bundled library; see the
// Benchmark tab to reproduce the strategy comparison.

export const ABOUT_HTML = `
<p class="lede">A Sudoku solver built as a probabilistic reasoning system: a maximum-entropy belief state,
inference by message passing on a factor graph, and a search that chooses its next hypothesis by expected
entropy reduction. Sudoku is the test rig, not the target.</p>

<div class="toc">
  <ol>
    <li><a href="#s1">Notation: naming cells</a></li>
    <li><a href="#s2">Glossary</a></li>
    <li><a href="#s3">What the system believes</a></li>
    <li><a href="#s4">The reasoning cycle</a></li>
    <li><a href="#s5">Moves, in depth</a></li>
    <li><a href="#s6">Backtracking</a></li>
    <li><a href="#s7">Sound elimination</a></li>
    <li><a href="#s8">Inference: permanents and BP</a></li>
    <li><a href="#s9">Entropy: which number is shown</a></li>
    <li><a href="#s10">Where BP breaks</a></li>
    <li><a href="#s11">Results</a></li>
    <li><a href="#s12">Where this is soft</a></li>
    <li><a href="#s13">Why not a SAT solver</a></li>
  </ol>
</div>

<h2 id="s1"><span class="num">1</span>Notation: naming cells</h2>
<p>Cells are named <code>R<i>r</i>C<i>c</i></code> — <b>R</b> for row, <b>C</b> for column. Rows are numbered
<b>1 to 9 from the top</b>, columns <b>1 to 9 from the left</b>. So <code>R1C1</code> is the top-left corner,
<code>R9C9</code> the bottom-right, and <code>R3C6</code> is the cell in the third row, sixth column. A hypothesis
is written <code>R3C6=8</code> ("suppose R3C6 holds an 8") and an elimination <code>R3C6 ≠ 8</code> ("R3C6 provably
does not hold an 8"). Tree nodes and the reasoning log use exactly this notation.</p>

<h2 id="s2"><span class="num">2</span>Glossary</h2>
<dl class="gloss">
  <dt class="sec">Abbreviations</dt>
  <dt>BP</dt><dd><b>Belief propagation.</b> An iterative message-passing algorithm that estimates the marginal
    probability of each variable by having constraints and variables repeatedly exchange summaries of their beliefs.</dd>
  <dt>MRV</dt><dd><b>Minimum remaining values.</b> The standard branching heuristic in constraint solving: when you
    must guess, pick the variable with the fewest legal options left. Also called "most constrained variable" or the
    "fail-first" principle — if a branch is doomed you would rather find out after 2 guesses than after 6. Used here
    as the honest baseline, and it is what the plain reference solver uses.</dd>
  <dt>GAC</dt><dd><b>Generalised arc consistency.</b> The strongest elimination you can do while looking at one
    constraint at a time: remove every value that participates in no satisfying assignment of that constraint.</dd>
  <dt>EPE</dt><dd><b>Expected posterior entropy.</b> The average entropy the belief state would have after running a
    given test, averaged over that test's possible outcomes.</dd>
  <dt>EER / ΔH</dt><dd><b>Expected entropy reduction.</b> Current entropy minus EPE — how much uncertainty a test is
    expected to destroy. The quantity the default strategy maximises.</dd>
  <dt>DFS</dt><dd><b>Depth-first search.</b> Guess, recurse, and on failure unwind to the last choice point. What the
    plain reference solver does.</dd>

  <dt class="sec">Board vocabulary</dt>
  <dt>unit</dt><dd>One of the 27 groups that must contain each digit exactly once: 9 rows, 9 columns, 9 boxes.</dd>
  <dt>box</dt><dd>One of the nine 3×3 blocks.</dd>
  <dt>peer</dt><dd>The 20 cells that share a unit with a given cell, and therefore cannot hold the same digit.</dd>
  <dt>candidate</dt><dd>A digit still possible in a cell. The candidate <i>set</i> of a cell is the system's hard
    knowledge about it; the small digits on the board are its candidates.</dd>
  <dt>given / clue</dt><dd>A digit supplied by the puzzle itself.</dd>
  <dt>decided</dt><dd>A cell whose candidate set is down to one digit.</dd>

  <dt class="sec">What the system does</dt>
  <dt>propagation</dt><dd>Applying the rules of Sudoku to delete candidates that provably cannot occur, repeating
    until nothing more can be deleted (a <i>fixpoint</i>). Propagation never guesses.</dd>
  <dt>sound</dt><dd>A deletion is sound if the deleted value appears in <i>no</i> remaining solution. Everything
    this system deletes is sound, so it can never lose the true answer.</dd>
  <dt>probing</dt><dd>Tentatively asserting a value in a cell, propagating the consequences, and observing the
    result — <i>without</i> adopting it. The probe is thrown away; only what it reveals is kept.</dd>
  <dt>refutation</dt><dd>A probe that reaches a contradiction. This proves the value is impossible, so it can be
    deleted for good. A refutation is a proof, not an estimate.</dd>
  <dt>contradiction</dt><dd>A state that cannot be completed: a cell with no candidates left, a digit with no
    remaining home in some unit, or a unit with no valid completion.</dd>
  <dt>hypothesis</dt><dd>A value the system adopts <i>tentatively</i> in order to explore its consequences.
    Adopting it never claims it is true, only that it has not been refuted.</dd>
  <dt>commit</dt><dd>To adopt a hypothesis and descend into it, creating a new node in the tree.</dd>
  <dt>backtrack</dt><dd>To withdraw a committed hypothesis after it turns out to be impossible.</dd>
  <dt>shortlist</dt><dd>The handful of cells selected for probing each round, since probing every cell would be
    wasteful. Adjustable in the toolbar.</dd>

  <dt class="sec">Probabilistic machinery</dt>
  <dt>belief state</dt><dd>Everything the system currently thinks: the candidate sets plus a probability
    distribution over them.</dd>
  <dt>marginal</dt><dd>The probability distribution over the nine digits for a <i>single</i> cell, ignoring how it
    correlates with the others. The nine bars drawn in each undecided cell.</dd>
  <dt>maximum entropy</dt><dd>The least-committed distribution consistent with what is known. Here it is the uniform
    distribution over all solutions still possible.</dd>
  <dt>entropy</dt><dd>Uncertainty measured in bits. Zero means one possibility remains; each extra bit doubles the
    number of possibilities.</dd>
  <dt>factor graph</dt><dd>A network with a node per variable (81 cells) and a node per constraint (27 units),
    connected where a constraint involves a variable. The structure BP runs on.</dd>
  <dt>loopy</dt><dd>A factor graph containing cycles. BP is exact on graphs without cycles and only approximate —
    sometimes badly so — when there are cycles. Sudoku is thoroughly loopy: every cell sits in three units.</dd>
  <dt>permanent</dt><dd>A number computed from a square matrix like a determinant but with all plus signs. It counts
    perfect matchings, which is exactly what "ways to complete this unit" means.</dd>
  <dt>Bethe free energy</dt><dd>An approximation to the log of the partition function, computable from converged BP
    messages. Meaningful only at a fixed point.</dd>
  <dt>fixed point</dt><dd>A state where another round of message passing changes nothing. BP has "converged".</dd>
  <dt>residual</dt><dd>How much the messages changed in the last round. It is the convergence measure; small means
    near a fixed point.</dd>
  <dt>damping</dt><dd>Blending each new message with the previous one to suppress oscillation.</dd>
  <dt>Hall violation</dt><dd>k cells in a unit confined between them to fewer than k digits — impossible, by the
    pigeonhole principle.</dd>
</dl>

<h2 id="s3"><span class="num">3</span>What the system believes</h2>
<p>The system holds 81 discrete random variables <code>X₁…X₈₁</code>, each ranging over the nine digits, and 27 hard
constraints — one per row, column and box — each asserting that its nine cells carry the nine digits bijectively.
Among all distributions consistent with what has been <i>proved</i>, the maximum-entropy one is the <b>uniform
distribution over the remaining solutions</b>. That is the distribution the board displays and the one every number
in this app refers to.</p>
<p>Two layers, and the distinction matters throughout. The <b>candidate sets</b> are hard knowledge: a digit is
removed only when it appears in no remaining solution. The <b>probabilities</b> layered on top are an approximation,
used to weight and rank. A bad probability estimate costs time; it can never cost correctness.</p>

<h2 id="s4"><span class="num">4</span>The reasoning cycle</h2>
<p>The system runs one loop, over and over, until the entropy reaches zero. In outline:</p>
<div class="fml">repeat:
    PROPAGATE   apply the rules until nothing more follows
    if contradiction        -> BACKTRACK
    INFER       estimate the probabilities and the entropy
    if all 81 cells decided -> done
    EVALUATE    probe a shortlist of cells; score each by expected entropy reduction
    if some cell has no surviving value -> BACKTRACK
    if any value was refuted            -> LEARN   (delete it; loop again, same node)
    otherwise                           -> COMMIT  (adopt the best hypothesis; descend)</div>
<p>Pressing <b>Step</b> advances exactly one of these phases, and the pill strip under the buttons shows which one
is next. Here is what each does.</p>

<div class="phase">
  <h4><span class="tag">propagate</span>Work out everything that already follows</h4>
  <p>Applies the sound rules of Sudoku to the current candidate sets, repeatedly, until a full pass changes nothing.
  It never guesses. Which rules are used depends on the <i>propagation</i> setting in the toolbar (see §7).</p>
  <p class="exit">Exits to: <b>backtrack</b> if this reaches a contradiction, otherwise <b>infer</b>.</p>
</div>

<div class="phase">
  <h4><span class="tag">infer</span>Put probabilities on what is left</h4>
  <p>Runs the chosen inference engine — loopy BP or per-unit counting — over the propagated candidate sets to produce
  the marginal for every cell, the entropy bound, and, when BP reaches a fixed point, the estimated number of
  remaining solutions. This phase changes no candidate sets; it only forms an opinion about them. Those opinions are
  what the bars on the board show and what weights the scoring in the next phase.</p>
  <p class="exit">Exits to: <b>done</b> if all 81 cells are decided, otherwise <b>evaluate</b>.</p>
</div>

<div class="phase">
  <h4><span class="tag">evaluate</span>Propose and test candidate moves</h4>
  <p>Shortlists a handful of cells, then <i>probes</i> every candidate value of each: assert it, propagate the
  consequences on a scratch copy, and record what came back — either a contradiction, or a posterior state with a
  measured entropy. From those it computes each cell's expected posterior entropy and ranks them. Nothing is changed
  yet; this phase only gathers evidence. The <b>Move analysis</b> tab shows exactly this table.</p>
  <p class="exit">Exits to: <b>backtrack</b> if some cell had every value refuted; <b>learn</b> if any value anywhere
  was refuted; otherwise <b>commit</b>.</p>
</div>

<div class="phase p-learn">
  <h4><span class="tag">learn</span>Bank the refutations — without committing to anything</h4>
  <p>Every refuted value found by probing is deleted from the current node's candidate sets. These are sound
  deletions: each was proved impossible. No hypothesis is adopted, <b>the tree does not grow</b>, and the loop
  returns to <i>propagate</i> so the new knowledge can cascade. The system has simply reasoned, and its entropy
  dropped. This is the phase that does most of the work.</p>
  <p class="exit">Exits to: <b>propagate</b>, at the same node.</p>
</div>

<div class="phase p-commit">
  <h4><span class="tag">commit</span>Adopt a hypothesis and descend</h4>
  <p>Reached only when probing refuted nothing — the system has no proof available and must take a position. The
  winning cell's surviving values each become a child node; the system descends into the most promising one (a probe
  that already completed the grid, otherwise the most probable value). This is the only phase that grows the tree,
  and the only point where anything is accepted. Acceptance is explicitly tentative: it means "not refuted", never
  "true".</p>
  <p class="exit">Exits to: <b>propagate</b>, at the new child node.</p>
</div>

<div class="phase p-backtrack">
  <h4><span class="tag">backtrack</span>Withdraw a hypothesis that proved impossible</h4>
  <p>The current node is marked refuted. The system returns to its parent and <b>deletes the withdrawn digit from the
  parent's candidate sets</b> — a permanent, sound elimination — then re-propagates and re-evaluates there with
  strictly more knowledge than before. The dead subtree stays on screen in red as the record of why. See §6.</p>
  <p class="exit">Exits to: <b>propagate</b>, at the parent — or <b>done</b> if the root itself is refuted, meaning
  the puzzle has no solution.</p>
</div>

<h2 id="s5"><span class="num">5</span>Moves, in depth</h2>

<h3>What a move is</h3>
<p>A move is <b>not</b> "write a digit in a cell". It is closer to an experiment: <i>pick a cell, and test what
happens under each of its possible values</i>. The unit of reasoning is a whole cell, not a single cell-value pair.
That matters — testing all of a cell's values at once is what makes refutation possible, because if every value
fails, the cell has told you something about the state you are in rather than about the cell.</p>

<h3>How moves are proposed</h3>
<p>Scoring every undecided cell would be wasteful, so a cheap prior shortlists about ten of them (adjustable from 1
to all 81 in the toolbar): <b>fewest candidates first</b>, ties broken by <b>most unsolved peers</b>. Few candidates
means a cheap, sharp test; many unsolved peers means its consequences propagate far. This prior only decides what is
worth spending the probe budget on — it never decides the move.</p>

<h3>How a move is scored — by measurement, not by guessing</h3>
<p>This is what separates it from a heuristic. For each shortlisted cell, and for <i>each</i> of its candidate
digits, the system copies the state, asserts that digit, propagates to a fixpoint, and looks at what came back.
Either propagation reaches a <b>contradiction</b> — that value is refuted, and it is a proof — or it yields a
posterior state whose entropy <code>H_d</code> is <i>measured</i> off the actual propagated result. Then, with
<code>b_i(d)</code> the belief that cell <i>i</i> holds digit <i>d</i>:</p>
<div class="fml">E[H′ | test i]  =  Σ_d  b_i(d) · H_d          score(i)  =  H₀ − E[H′ | test i]</div>
<p>A refuted branch contributes <code>H_d = 0</code>: discovering that a hypothesis is impossible is maximally
informative. Cells that produce refutations outrank all others; among the rest, the highest expected entropy
reduction wins. This is the mutual information between the test and everything else — maximum-information
experimental design, applied to reasoning moves.</p>
<p>So the word "expected" is doing less work than it sounds like. The posterior entropies are <i>observed</i>. Only
the weights <code>b_i(d)</code> and the one-step horizon are approximate.</p>

<h3>The three outcomes</h3>
<p>An evaluation ends in exactly one of three ways: refutations were found and get <b>learned</b> (no commitment, no
tree growth); nothing was refuted, so the best move is <b>committed</b>; or some cell had <i>every</i> value refuted,
which means the current node is itself impossible and must be <b>backtracked</b>.</p>

<h2 id="s6"><span class="num">6</span>Backtracking</h2>
<p>Backtracking is what happens when a <i>committed</i> hypothesis turns out to be wrong — because the node died as
above, because propagation contradicted, or because all of its children were refuted.</p>
<p>Crucially, a backtrack is not merely undoing. It converts a failed exploration into a permanent, sound
elimination at the parent, which then re-propagates with more knowledge than it had before. Work is never simply
discarded. A real trace from AI Escargot, the puzzle loaded by default:</p>
<div class="fml">root
 └── R3C6 = 8                          committed, tentatively
       probe R4C5:  1 survives, 7 impossible
       probe R5C3:  3 impossible, 4 impossible     ← no value left
     ⇒ R3C6 = 8 is refuted
     ⇒ back at root: learn R3C6 ≠ 8, re-propagate</div>
<p>The whole game is this. <b>A value can die cheaply during probing, or expensively after commitment.</b> Both give
the same sound elimination. Probing catches it for the price of one propagation; backtracking catches it only after
building and discarding a subtree. A good criterion converts would-be backtracks into probe refutations — which is
exactly what the numbers below measure.</p>

<h2 id="s7"><span class="num">7</span>Sound elimination</h2>
<p>Removing a candidate is legitimate only if it appears in no remaining solution; otherwise the belief state would
stop being the max-entropy distribution over the true solution set. Three levels, selectable in the toolbar:</p>
<ul>
  <li><b>Assignment elimination and hidden singles.</b> A decided cell removes its digit from its 20 peers; a digit
      with only one remaining home in a unit must go there.</li>
  <li><b>Pointing and claiming</b> (box-line reduction). If a digit's possible positions within a box all lie in one
      row, it can be removed from the rest of that row, and symmetrically.</li>
  <li><b>All-different arc consistency (GAC)</b>, decided <i>exactly</i> by the permanent machinery already present:
      run the minors on the 0/1 candidate matrix, and a zero minor means "no completion of this unit places
      <i>d</i> in that cell". This one test subsumes every naked and hidden subset inside a unit — pairs, triples,
      quads and all the rest — with no rule catalogue, and it detects every Hall violation. With integer entries the
      minors are exact in double precision, so the zero test is exact rather than a tolerance.</li>
</ul>
<p>The library grades puzzles by the weakest machinery that suffices: <i>easy</i> = singles, <i>medium</i> =
box-line, <i>hard</i> = arc consistency, <i>expert</i> and <i>extreme</i> = hypothesis testing required.</p>

<h2 id="s8"><span class="num">8</span>Inference: permanents and BP</h2>
<p>The factor graph has 81 variable nodes and 27 factor nodes; each variable touches exactly three factors, so the
graph is loopy. What makes Sudoku unusually tractable here is that an all-different constraint over <i>m</i> cells
and <i>m</i> values is a <b>permutation factor</b>, and the exact sum-product message out of a permutation factor is
a matrix permanent:</p>
<div class="fml">μ_{a→i}(d)  =  perm( A with row i and column d deleted ),   A[k][t] = μ_{k→a}(t)</div>
<p>Ryser's formula computes a 9×9 permanent in 2⁹ terms, and with prefix/suffix products all 81 leave-one-out minors
come out of the <i>same</i> sweep. So each factor update is exact and costs microseconds — no approximation inside a
unit, and the only thing left approximate is the loopy structure joining rows, columns and boxes. The same routine,
run on a 0/1 matrix instead of a matrix of messages, is what performs exact arc consistency in §7.</p>

<h2 id="s9"><span class="num">9</span>Entropy: which number is shown</h2>
<p>Because every constraint is hard and the target distribution is uniform, the partition function <i>Z</i> literally
counts the remaining solutions, so <code>log₂ Z</code> <i>is</i> the joint entropy of the belief state. The Bethe
approximation gives it from the converged messages:</p>
<div class="fml">log Z  ≈  Σ_a log z_a  +  Σ_i log z_i  −  Σ_{(i,a)} log z_{ia}</div>
<p>It is exact on a graph without cycles, and on a nearly-full grid it recovers the true solution count to within a
small factor. But it is meaningful only <i>at a fixed point</i>, and on hard puzzles there is no fixed point to
evaluate it at — where it can even come out negative, which is impossible for a count of solutions. The app
therefore withholds it rather than dressing it up: the "solutions" figure reads <code>—</code> whenever BP has not
converged.</p>
<p>So the headline figure is instead one that is always defined and never overclaims — the sound upper bound</p>
<div class="fml">H(X)  ≤  Σᵢ log₂ |Cᵢ|</div>
<p>the log of the number of candidate combinations still standing. It is a genuine bound because the true
distribution is supported on the candidate sets, it decreases monotonically as reasoning proceeds, and it reaches
exactly 0 when the puzzle is solved — so "drive the entropy to zero" remains literally the objective.</p>

<h2 id="s10"><span class="num">10</span>Where BP breaks</h2>
<p>This is the substantive experimental finding, and it is not the one the design hoped for.</p>
<p>On easy and medium puzzles sound propagation finishes the job before BP is needed at all. On some hard puzzles BP
converges and nails every remaining cell. But on the genuinely hard instances — the <i>expert</i> and <i>extreme</i>
grades, including all four famous puzzles here — <b>loopy BP does not converge, and it does not fail
gracefully</b>. Messages saturate onto the boundary of the simplex, the iteration settles into a limit cycle with
the residual pinned at exactly ½, and unit permanents underflow to zero: BP has become <i>certain</i> of
configurations that are locally impossible.</p>
<p>Worse, it <b>degrades with iteration</b>. Undecided cells whose marginal argmax is the true digit, on AI Escargot,
running raw BP with no mitigation:</p>
<table>
  <thead><tr><th>BP sweeps</th><th>1</th><th>2</th><th>3</th><th>5</th><th>10</th><th>30</th><th>100</th><th>300</th></tr></thead>
  <tbody><tr><td>correct</td><td>27</td><td>30</td><td>29</td><td>31</td><td>27</td><td>19</td><td>19</td><td>19</td></tr></tbody>
  <caption>Out of 58 undecided cells. It peaks within five sweeps, then collapses permanently.</caption>
</table>
<p>More computation buys a worse guide. Damping does not fix it — 0.3 through 0.95 all limit-cycle — and neither
does sequential scheduling. Three responses are in place, all selectable and all honest about what they are:</p>
<ul>
  <li><b>A message floor.</b> Every message is mixed with a little uniform mass, keeping it off the boundary of the
      simplex. This is exactly BP on a slightly softened model; it stops the permanents underflowing to zero.</li>
  <li><b>Best-iterate fallback.</b> Rather than returning wherever the limit cycle happened to stop, the run returns
      the iterate that came <i>closest to a fixed point</i> — the smallest residual it ever saw. That recovers the
      good early-iterate behaviour automatically, with no hand-tuned iteration count.</li>
  <li><b>A non-iterative alternative.</b> Switch <i>inference</i> to per-unit exact counting: for each unit, count
      exactly how many completions place digit <i>d</i> in cell <i>i</i> — the same permanent minor, on the 0/1
      candidate matrix — and multiply the three units a cell belongs to. It is the exact single-constraint
      max-entropy marginal combined as a product of experts, it cannot oscillate or become overconfident, and across
      the whole library it guides almost as well: <b>80.4%</b> argmax accuracy against <b>81.4%</b> for BP with the
      fallback.</li>
</ul>
<p>There is a reason none of these approximations can be pushed much further. For a puzzle with a unique solution the
<i>exact</i> max-entropy marginals are a point mass on the solution — so computing them exactly <i>is</i> solving the
puzzle. Approximate marginals can only ever be a guide; the sound layer below is what actually removes entropy.</p>

<h2 id="s11"><span class="num">11</span>Results</h2>

<h3>Does it solve them</h3>
<p>The bundled library is 27 puzzles: 5 easy, 5 medium, 5 hard, 5 expert and 7 extreme (3 generated plus the four
famous ones). Each is verified by an independent backtracking solver to have exactly one solution. With the default
configuration the reasoner solves <b>27 of 27</b>, checked digit-for-digit against that solver's answer. All six
strategies also solve all 27, with no timeouts — including the worst one, which needs nearly 4,000 tree nodes to do
it. Note that the library <i>is</i> the test set, and 23 of the 27 came from this project's own generator; only the
four famous puzzles are genuinely external.</p>

<h3>Comparing reasoning strategies</h3>
<p>Totals over the seven <i>extreme</i> puzzles. "Backtracks" counts hypotheses that had to be withdrawn — that is,
wasted commitment:</p>
<table>
  <thead><tr><th>strategy</th><th>backtracks</th><th>nodes</th><th>probes</th><th>learned</th><th>ms</th></tr></thead>
  <tbody>
    <tr class="win"><td>expected entropy reduction</td><td>12</td><td>56</td><td>1099</td><td>121</td><td>687</td></tr>
    <tr><td>… with learning switched off</td><td>35</td><td>99</td><td>1468</td><td>0</td><td>868</td></tr>
    <tr><td>minimum remaining values (MRV)</td><td>131</td><td>326</td><td>0</td><td>—</td><td>1328</td></tr>
    <tr><td>most confident belief</td><td>253</td><td>705</td><td>0</td><td>—</td><td>2305</td></tr>
    <tr><td>random cell</td><td>392</td><td>1293</td><td>0</td><td>—</td><td>3988</td></tr>
    <tr class="lose"><td>highest marginal entropy</td><td>1067</td><td>3979</td><td>0</td><td>—</td><td>10512</td></tr>
  </tbody>
  <caption>On the five <i>expert</i> puzzles the same ordering holds and the top two need 0 backtracks:
    0, 0, 3, 4, 6, 23.</caption>
</table>
<p>Backtracks alone would be a rigged comparison, since probing is real work and only the top two strategies pay for
it. The honest check is the last column: the criterion runs 1,099 probes the others never run and <b>still finishes
fastest</b>, roughly twice as fast as MRV. The probe budget is more than repaid.</p>
<p>The two ablations separate the two ideas. Turning learning off keeps the scoring but throws the refutations away
instead of folding them back: backtracks roughly triple, 12 to 35 — that is the value of <i>learning</i>. Even
without learning it still beats MRV nearly fourfold — that is the value of the <i>criterion</i>.</p>
<p>The last row deserves attention. Branching on the cell with the <b>highest</b> marginal entropy — the intuitive
reading of "test what you are most uncertain about" — is the worst strategy tested, nearly three times worse than
picking a cell at random. Maximum entropy is the right principle for the belief <i>state</i> and the wrong one for
choosing the <i>experiment</i>. A maximally uncertain cell is one whose constraints have not bitten yet, so testing
it propagates almost nothing. What you want is the test whose outcome collapses the entropy of everything else.</p>

<h3>Against a plain backtracking solver</h3>
<p>The project also contains an ordinary DFS solver — MRV branching, simple peer elimination — used only to validate
puzzles and provide ground truth. It is <b>dramatically faster</b>:</p>
<table>
  <thead><tr><th>grade</th><th>n</th><th>solver ms/puzzle</th><th>reasoner ms/puzzle</th><th>ratio</th></tr></thead>
  <tbody>
    <tr><td>easy</td><td>5</td><td>0.018</td><td>1.6</td><td>85×</td></tr>
    <tr><td>medium</td><td>5</td><td>0.059</td><td>1.2</td><td>19×</td></tr>
    <tr><td>hard</td><td>5</td><td>0.031</td><td>0.7</td><td>21×</td></tr>
    <tr><td>expert</td><td>5</td><td>0.054</td><td>11.6</td><td>216×</td></tr>
    <tr><td>extreme</td><td>7</td><td>0.597</td><td>110.6</td><td>185×</td></tr>
  </tbody>
  <caption>On AI Escargot specifically: 0.022 ms versus 208 ms, about 9,600×. Solver figures average 200
    repetitions; each reasoner figure is a single run, so the top three rows are largely timing noise.</caption>
</table>
<p>Per decision the reasoner does enormously more work. Solving AI Escargot it ran 19 propagations, 18 BP runs and
<b>326 probes</b> — and every probe is itself a full propagation to fixpoint. Its propagation is also far more
expensive: exact arc consistency means a permanent sweep per unit, against the DFS solver's simple "erase this digit
from 20 peers".</p>
<p>But the two are optimising different things. The DFS solver is built on the assumption that <b>a guess costs
nothing</b>: it guesses instantly, hits the contradiction instantly, unwinds instantly, and guesses again. At
nanosecond prices that is unbeatable. Which quantity matters depends on what a hypothesis costs you. If it is a CPU
branch, minimising hypotheses is pointless. If a hypothesis is a lab experiment, a database query, a question put to
a human, or an irreversible commitment, then withdrawn hypotheses <i>are</i> the cost function and CPU time is the
cheap resource. That is the regime this system targets, and why the benchmark leads with backtracks rather than
milliseconds.</p>
<p>Worth being precise about one thing: the reasoner is not slow <i>because</i> it is principled. Most of that
208 ms is the probe budget, and the probe budget is a dial. A shortlist of 1 instead of 10 cuts probing roughly
tenfold; dropping propagation from GAC to singles makes each probe far cheaper. Both settings trade hypotheses
against time, in either direction.</p>

<h2 id="s12"><span class="num">12</span>Where this is soft</h2>
<div class="caveat">
  <p><b>The weights are shaky.</b> The <code>b_i(d)</code> in the scoring come from approximate marginals, and on
  exactly these hard puzzles BP is unreliable. So the <i>ranking</i> of moves rests on a weak ingredient — though
  the refutations themselves do not, since those are proofs.</p>
  <p><b>The horizon is one step.</b> Probes look one assignment deep. A two-step probe would score better and cost
  quadratically more.</p>
  <p><b>The entropies are bounds, not exact posteriors.</b> <code>H_d</code> is the candidate-count bound, so the
  scores are ordinally sensible but not calibrated quantities.</p>
  <p><b>The evidence base is small.</b> 27 puzzles is enough to show the machinery works and to rank strategies; it
  is not enough to claim robustness. A larger external corpus would be the honest next test.</p>
  <p>None of this threatens correctness. Every elimination is a proof regardless of how the move was chosen, so a
  bad criterion costs time, never soundness.</p>
</div>

<h2 id="s13"><span class="num">13</span>Why not a SAT solver</h2>
<p>Deliberately. The point is to keep probability and entropy as the organising principle, so that the machinery — a
factor graph, a max-entropy belief state, hypothesis selection by expected entropy reduction, and a tree that
records the reasoning — transfers to problems where the constraints are soft, the evidence is noisy, and there is no
clause database to hand to a SAT solver. Sudoku is the test rig, not the target.</p>
`;
