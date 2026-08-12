/* ============================================================
   Thore Graepel — site interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Year ---------- */
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- Theme toggle ---------- */
  var root = document.documentElement;
  var toggle = document.getElementById("themeToggle");
  var stored = null;
  try { stored = localStorage.getItem("tg-theme"); } catch (e) {}
  var urlTheme = (location.search.match(/[?&]theme=(dark|light)/) || [])[1];
  if (urlTheme) {
    root.setAttribute("data-theme", urlTheme);
  } else if (stored) {
    root.setAttribute("data-theme", stored);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.setAttribute("data-theme", "dark");
  }
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("tg-theme", next); } catch (e) {}
      if (board) board.repaint();
    });
  }

  /* ---------- Mobile nav (hamburger) ---------- */
  var navEl = document.getElementById("nav");
  var burger = document.getElementById("navBurger");
  if (navEl && burger) {
    function closeNav() { navEl.classList.remove("nav--open"); burger.setAttribute("aria-expanded", "false"); }
    burger.addEventListener("click", function () {
      var open = navEl.classList.toggle("nav--open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    Array.prototype.forEach.call(navEl.querySelectorAll(".nav__links a"), function (a) {
      a.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });
  }

  /* ---------- Scroll reveal ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- Nav active section ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav__links a"));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.getAttribute("id");
          navLinks.forEach(function (a) {
            a.classList.toggle("is-active", a.getAttribute("href") === "#" + id);
          });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ============================================================
     Interactive 19×19 Go board — AlphaGo vs. Lee Sedol, Game 2
     (Seoul, 10 March 2016). Black = AlphaGo. The board opens on
     the position after Black's celebrated Move 37 — a shoulder
     hit on the fifth line at P10 — which is highlighted.
     Move list transcribed from the game SGF record.
     ============================================================ */
  var HL_COLOR = "#e0533a";   // warm accent for Move 37 (echoes theme-color)

  // The complete game, all 211 moves, as [row, col] on a 19×19 grid
  // (origin top-left). Move 1 is Black (AlphaGo); colours alternate.
  // Transcribed from the game SGF record.
  var GAME = [
    [3,15],[15,3],[3,2],[15,16],[15,14],[16,14],[16,13],[16,15],[13,2],[16,5],[15,12],[13,16],[2,8],[9,3],[14,15],[14,16],[15,2],[16,2],[16,1],[14,2],[15,1],[14,1],[14,3],[13,1],[16,3],[15,4],[17,3],[12,2],[15,9],[6,2],[3,4],[5,16],[4,16],[5,15],[3,13],[8,15],[9,14],[8,14],[9,13],[7,12],[15,6],[16,6],[13,3],[12,3],[14,5],[15,7],[14,7],[14,4],[13,4],[13,5],[12,4],[11,4],[12,5],[13,6],[11,5],[14,6],[10,4],[10,3],[11,3],[11,2],[7,4],[8,3],[9,15],[8,16],[5,17],[6,17],[3,10],[13,7],[12,14],[4,17],[3,17],[5,18],[8,5],[10,6],[12,7],[13,8],[11,7],[14,10],[15,10],[2,6],[5,3],[3,8],[2,9],[4,6],[6,3],[5,2],[7,2],[7,1],[7,3],[8,1],[3,7],[4,7],[3,6],[3,5],[2,7],[4,5],[2,4],[7,6],[2,5],[8,6],[8,8],[10,7],[10,8],[11,8],[12,8],[9,8],[11,9],[9,9],[5,8],[12,10],[11,10],[9,11],[10,11],[14,11],[8,11],[9,10],[8,2],[9,2],[9,12],[17,13],[17,12],[16,11],[15,11],[16,12],[15,13],[17,11],[12,11],[7,10],[6,7],[2,16],[3,16],[2,17],[2,15],[3,18],[6,6],[4,2],[3,1],[1,16],[8,7],[6,9],[9,7],[1,14],[1,15],[0,15],[1,13],[4,3],[4,4],[9,6],[7,7],[9,4],[5,13],[5,12],[4,12],[10,17],[7,5],[11,4],[7,13],[6,13],[6,11],[7,11],[6,12],[6,14],[6,10],[8,13],[7,9],[0,13],[8,10],[8,12],[8,9],[2,13],[1,12],[3,14],[2,12],[2,14],[17,10],[18,12],[14,8],[15,8],[14,9],[13,9],[17,8],[17,7],[11,16],[11,17],[12,16],[12,17],[14,0],[12,1],[13,11],[13,10],[14,12],[4,1],[4,0],[5,0],[3,0],[0,12],[0,11],[0,14],[3,3],[6,1],[1,11],[13,15],[13,14],[17,4],[17,2],[15,5],[16,8],[16,7],[9,16],[9,17],[18,10]
  ];
  var HL = 36;                // index of Move 37 (the highlighted move)
  var MOVE37_RC = GAME[HL];   // [9, 14]

  function GoBoard(canvas) {
    var SIZE = 19;
    var ctx = canvas.getContext("2d");
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var grid = null;            // 19×19 board state: null | "b" | "w"
    var shown = 0;              // number of moves currently played onto `grid`
    var glow = 0;               // 0..1 pulse for the Move 37 marker
    var glowRAF = null;
    var playTimer = null;
    var visible = true;
    var self = this;

    function cssVar(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    /* ---- board state with capture rules ---- */
    function clearGrid() {
      grid = [];
      for (var r = 0; r < SIZE; r++) { grid.push([]); for (var c = 0; c < SIZE; c++) grid[r].push(null); }
      shown = 0;
    }
    function groupLiberties(r, c, color, remove) {
      // flood-fill the group at (r,c); return its liberty count, optionally removing it
      var stack = [[r, c]], seen = {}, group = [], libs = {};
      seen[r + "," + c] = 1;
      while (stack.length) {
        var cell = stack.pop(), a = cell[0], b = cell[1];
        group.push(cell);
        var nb = [[a-1,b],[a+1,b],[a,b-1],[a,b+1]];
        for (var i = 0; i < 4; i++) {
          var x = nb[i][0], yv = nb[i][1];
          if (x < 0 || yv < 0 || x >= SIZE || yv >= SIZE) continue;
          var v = grid[x][yv];
          if (v === null) { libs[x + "," + yv] = 1; }
          else if (v === color && !seen[x + "," + yv]) { seen[x + "," + yv] = 1; stack.push([x, yv]); }
        }
      }
      var count = 0; for (var k in libs) count++;
      if (remove && count === 0) group.forEach(function (g) { grid[g[0]][g[1]] = null; });
      return count;
    }
    function applyMove(i) {
      var m = GAME[i], r = m[0], c = m[1];
      var color = i % 2 === 0 ? "b" : "w", opp = color === "b" ? "w" : "b";
      grid[r][c] = color;
      var nb = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      for (var j = 0; j < 4; j++) {
        var x = nb[j][0], yv = nb[j][1];
        if (x < 0 || yv < 0 || x >= SIZE || yv >= SIZE) continue;
        if (grid[x][yv] === opp) groupLiberties(x, yv, opp, true);
      }
    }
    function playTo(n) {           // rebuild the board state up to move n
      clearGrid();
      for (var i = 0; i < n; i++) applyMove(i);
      shown = n;
    }

    function layout() {
      var rect = canvas.getBoundingClientRect();
      var cssW = rect.width || 460;
      canvas.width = cssW * dpr;
      canvas.height = cssW * dpr;
      self.pad = cssW * 0.052;
      self.gap = (cssW - self.pad * 2) / (SIZE - 1);
      self.cssW = cssW;
    }

    function pos(i) { return self.pad + i * self.gap; }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, self.cssW, self.cssW);

      // board wood
      var grad = ctx.createLinearGradient(0, 0, self.cssW, self.cssW);
      grad.addColorStop(0, cssVar("--board"));
      grad.addColorStop(1, cssVar("--board-2"));
      ctx.fillStyle = grad;
      roundRect(ctx, 0, 0, self.cssW, self.cssW, 10);
      ctx.fill();

      // grid
      ctx.strokeStyle = cssVar("--board-line");
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (var i = 0; i < SIZE; i++) {
        ctx.moveTo(pos(0), pos(i)); ctx.lineTo(pos(SIZE - 1), pos(i));
        ctx.moveTo(pos(i), pos(0)); ctx.lineTo(pos(i), pos(SIZE - 1));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // star points (hoshi) — standard 9 for 19×19
      var hoshi = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
      ctx.fillStyle = cssVar("--board-line");
      hoshi.forEach(function (h) {
        ctx.beginPath();
        ctx.arc(pos(h[1]), pos(h[0]), Math.max(1.5, self.gap * 0.12), 0, Math.PI * 2);
        ctx.fill();
      });

      // stones present on the board
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
        if (grid[r][c]) drawStone(c, r, grid[r][c]);
      }

      // Move 37 marker (only while that stone is still on the board)
      if (shown > HL && grid[MOVE37_RC[0]][MOVE37_RC[1]] === "b") drawMarker(MOVE37_RC[1], MOVE37_RC[0]);

      // last-move marker while replaying past 37
      if (shown > 0 && shown - 1 !== HL) {
        var lm = GAME[shown - 1];
        if (grid[lm[0]][lm[1]]) drawLast(lm[1], lm[0], grid[lm[0]][lm[1]]);
      }
    }

    function drawStone(c, r, color) {
      var x = pos(c), yv = pos(r), rad = self.gap * 0.47;
      if (rad <= 0) return;
      ctx.beginPath();
      ctx.arc(x + rad * 0.10, yv + rad * 0.14, rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      ctx.fill();
      var g = ctx.createRadialGradient(x - rad * 0.35, yv - rad * 0.4, rad * 0.1, x, yv, rad);
      if (color === "b") { g.addColorStop(0, "#6a655e"); g.addColorStop(0.5, "#26231f"); g.addColorStop(1, "#0d0c0a"); }
      else { g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, "#f4efe4"); g.addColorStop(1, "#d9d2c4"); }
      ctx.beginPath();
      ctx.arc(x, yv, rad, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    function drawLast(c, r, color) {
      var x = pos(c), yv = pos(r);
      ctx.beginPath();
      ctx.arc(x, yv, self.gap * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = color === "b" ? "rgba(255,255,255,.85)" : "rgba(20,20,20,.7)";
      ctx.fill();
    }

    function drawMarker(c, r) {
      var x = pos(c), yv = pos(r), rad = self.gap * 0.47;
      var gr = rad * (1.9 + glow * 0.9);
      var rg = ctx.createRadialGradient(x, yv, rad * 0.6, x, yv, gr);
      rg.addColorStop(0, "rgba(224,83,58," + (0.32 + glow * 0.28) + ")");
      rg.addColorStop(1, "rgba(224,83,58,0)");
      ctx.beginPath();
      ctx.arc(x, yv, gr, 0, Math.PI * 2);
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, yv, rad * 0.62, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.6, self.gap * 0.09);
      ctx.strokeStyle = HL_COLOR;
      ctx.stroke();
    }

    function roundRect(cc, x, yv, w, h, r) {
      cc.beginPath();
      cc.moveTo(x + r, yv);
      cc.arcTo(x + w, yv, x + w, yv + h, r);
      cc.arcTo(x + w, yv + h, x, yv + h, r);
      cc.arcTo(x, yv + h, x, yv, r);
      cc.arcTo(x, yv, x + w, yv, r);
      cc.closePath();
    }

    function caption(txt) { if (self.onCaption) self.onCaption(txt); }
    function atMove37() { caption("Move 37 · AlphaGo's shoulder hit at P10"); }

    /* Gentle continuous pulse on the Move 37 marker (paused offscreen). */
    function startGlow() {
      if (reduce || glowRAF || !visible) return;
      var t0 = performance.now();
      function frame(now) {
        glow = 0.5 + 0.5 * Math.sin((now - t0) / 900);
        if (playTimer === null && shown > HL && grid[MOVE37_RC[0]][MOVE37_RC[1]] === "b") draw();
        glowRAF = requestAnimationFrame(frame);
      }
      glowRAF = requestAnimationFrame(frame);
    }
    function stopGlow() { if (glowRAF) { cancelAnimationFrame(glowRAF); glowRAF = null; } }
    function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

    /* animate stones from the current `shown` up to move `target` */
    function run(target, speed, onDone) {
      stopGlow(); stopPlay();
      playTimer = setInterval(function () {
        if (shown >= target) { stopPlay(); if (onDone) onDone(); return; }
        applyMove(shown); shown++;
        if (shown < target) caption("Move " + shown + " / " + GAME.length);
        draw();
      }, speed);
    }

    /* Replay the opening from the first stone up to Move 37. */
    this.replay = function () {
      stopGlow(); stopPlay();
      playTo(0); draw();
      run(HL + 1, 95, function () { startGlow(); atMove37(); });
    };

    /* Continue from wherever we are to the end of the game. */
    this.playOn = function () {
      if (shown < HL + 1) { playTo(HL + 1); draw(); }
      if (shown >= GAME.length) { this.replay(); return; }
      run(GAME.length, 70, function () {
        startGlow();
        caption("AlphaGo wins by resignation · move " + GAME.length);
      });
    };

    this.repaint = function () { draw(); };
    this.resize = function () { layout(); draw(); };

    // pause the pulse when the board scrolls out of view
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible) startGlow(); else stopGlow();
        });
      }, { threshold: 0.15 }).observe(canvas);
    }

    layout();
    playTo(HL + 1);   // open on the position after Move 37
    draw();
    startGlow();
    window.addEventListener("resize", debounce(this.resize, 150));
  }

  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); var a = arguments, c = this; t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }

  var board = null;
  var canvas = document.getElementById("goban");
  if (canvas && canvas.getContext) {
    board = new GoBoard(canvas);
    var cap = document.getElementById("gobanCaption");
    board.onCaption = function (txt) { if (cap) cap.textContent = txt; };
    var replayBtn = document.getElementById("gobanReplay");
    if (replayBtn) replayBtn.addEventListener("click", function () { board.replay(); });
    var playBtn = document.getElementById("gobanPlayOn");
    if (playBtn) playBtn.addEventListener("click", function () { board.playOn(); });
  }

  /* ============================================================
     Publications — grouped by theme, rendered into three mounts
     ============================================================ */
  var REASONING = [
    {
      title: "TrueSkill™: A Bayesian Skill Rating System",
      venue: "NeurIPS", year: 2006,
      cite: "Herbrich, Minka, Graepel · Advances in Neural Information Processing Systems 19",
      cover: "img:images/TrueSkill-Factor-Graph.png",
      url: "https://papers.nips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system",
      abstract: "A Bayesian generalisation of chess's Elo: it tracks uncertainty over player skills, models draws, handles any number of competitors, and infers individual skill from team results via approximate message passing on a factor graph. It runs at scale as Xbox Live's TrueSkill, and is now textbook material."
    },
    {
      title: "TrueSkill Through Time: Revisiting the History of Chess",
      venue: "NeurIPS", year: 2007,
      cite: "Dangauthier, Herbrich, Minka, Graepel · Advances in Neural Information Processing Systems 20",
      cover: "img:images/TrueSkill-History-Of-Chess.png",
      url: "https://papers.nips.cc/paper/3331-trueskill-through-time-revisiting-the-history-of-chess",
      abstract: "By smoothing skill estimates through time — rather than only filtering forward — this model reconstructs the full skill trajectory of every player. Applied to 150 years of chess records, it lets us compare champions across eras and finds that overall playing strength has risen over the last century."
    },
    {
      title: "Web-Scale Bayesian Click-Through Rate Prediction (AdPredictor)",
      venue: "ICML", year: 2010,
      cite: "Graepel, Quiñonero-Candela, Borchert, Herbrich · ICML 2010 · Microsoft Bing",
      cover: "img:images/paper_illustrations/adpredictor.png",
      url: "https://quinonero.net/Publications/AdPredictorICML2010-final.pdf",
      abstract: "AdPredictor — a probit regression model with Gaussian beliefs over weights, updated online by approximate message passing — powers click-through prediction for sponsored search in Microsoft's Bing. Principled weight pruning and an approximate parallel implementation make Bayesian inference scale to the web."
    },
    {
      title: "Matchbox: Large Scale Online Bayesian Recommendations",
      venue: "WWW", year: 2009,
      cite: "Stern, Herbrich, Graepel · Proceedings of the 18th International World Wide Web Conference",
      cover: "img:images/paper_illustrations/matchbox.png",
      url: "https://www.herbrich.me/papers/www09.pdf",
      abstract: "A probabilistic recommender that fuses content (user and item metadata) with collaborative filtering by mapping features into a shared low-dimensional trait space. It learns online via assumed-density filtering, expressing calibrated uncertainty over every recommendation."
    },
    {
      title: "Bayesian Pattern Ranking for Move Prediction in the Game of Go",
      venue: "ICML", year: 2006,
      cite: "Stern, Herbrich, Graepel · ICML 2006",
      cover: "img:images/paper_illustrations/go-pattern-ranking.png",
      url: "https://www.herbrich.me/papers/p873-stern.pdf",
      abstract: "A Bayesian ranking model over local board patterns that learns a distribution over an expert's next move from game records — predicting the played move in roughly a third of positions. A conceptual ancestor of the policy network that would later guide AlphaGo's search: probabilistic reasoning meeting the game of Go, a decade early."
    },
    {
      title: "SiGMa: Simple Greedy Matching for Aligning Large Knowledge Bases",
      venue: "KDD", year: 2013,
      cite: "Lacoste-Julien, Palla, Davies, Kasneci, Graepel, Ghahramani · KDD 2013",
      cover: "img:images/paper_illustrations/sigma-aligning-knowledge.png",
      url: "https://arxiv.org/abs/1207.4525",
      abstract: "How do two machines agree on what they know? SiGMa aligns large knowledge bases — millions of entities and facts — by iteratively propagating matches through the relational graph and combining structure with property similarity. Reasoning over knowledge representations at scale, joint work with Zoubin Ghahramani."
    }
  ];

  var ALPHAGO = [
    {
      title: "Mastering the game of Go with deep neural networks and tree search",
      venue: "Nature", year: 2016,
      cite: "Silver, Huang, Maddison, … Graepel, Hassabis · Nature 529, 484–489",
      cover: "img:images/AlphaGo-Search-Tree.jpg",
      url: "https://www.nature.com/articles/nature16961",
      abstract: "AlphaGo combines value networks that evaluate board positions and policy networks that select moves — trained by supervised learning from human games and reinforcement learning from self-play — with Monte-Carlo tree search. It achieved a 99.8% win rate against other programs and defeated the European champion 5–0: the first program to beat a professional at full-sized Go."
    },
    {
      title: "Mastering the game of Go without human knowledge",
      venue: "Nature", year: 2017,
      cite: "Silver, Schrittwieser, Simonyan, … Graepel, Hassabis · Nature 550, 354–359",
      cover: "img:images/paper_illustrations/alphago-zero.png",
      url: "https://www.nature.com/articles/nature24270",
      preprint: "https://discovery.ucl.ac.uk/id/eprint/10045895/1/agz_unformatted_nature.pdf",
      abstract: "AlphaGo Zero learns tabula rasa — solely by reinforcement learning from self-play, with no human data or guidance beyond the rules. Becoming its own teacher, it reached superhuman play, winning 100–0 against the previously published, champion-defeating AlphaGo."
    },
    {
      title: "A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play",
      venue: "Science", year: 2018,
      cite: "Silver, Hubert, Schrittwieser, … Graepel, Lillicrap, Simonyan, Hassabis · Science 362 (6419)",
      cover: "img:images/paper_illustrations/alphazero.png",
      url: "https://www.science.org/doi/10.1126/science.aar6404",
      preprint: "https://discovery.ucl.ac.uk/id/eprint/10069050/1/alphazero_preprint.pdf",
      abstract: "AlphaZero generalises the AlphaGo Zero approach into a single algorithm that achieves superhuman performance across many games. Starting from random play and given no domain knowledge except the rules, it convincingly defeated world-champion programs in chess and shogi as well as Go — one method, three games, no human data."
    },
    {
      title: "Mastering Atari, Go, chess and shogi by planning with a learned model",
      venue: "Nature", year: 2020,
      cite: "Schrittwieser, Antonoglou, Hubert, … Graepel, Lillicrap, Silver · Nature 588, 604–609",
      cover: "img:images/paper_illustrations/mu-zero.png",
      url: "https://www.nature.com/articles/s41586-020-03051-3",
      preprint: "https://arxiv.org/pdf/1911.08265",
      abstract: "MuZero drops the last assumption AlphaZero still made: the rules. It learns its own model of an environment — just the parts that matter for value, policy and reward — and plans with that learned model. The same algorithm masters Go, chess and shogi and, without any simulator, the visually rich world of Atari: reasoning by planning, even when no one hands you the rules."
    }
  ];

  var OTHER = [
    {
      title: "How AI is reshaping discovery in maths and physics",
      venue: "Nature", year: 2026,
      cite: "Burtsev, He, Sobko, Bhattacharya, Graepel · Nature 654 (8118), 324–326",
      cover: "img:images/paper_illustrations/ai-for-discovery.jpeg",
      url: "https://www.nature.com/articles/d41586-026-01820-1",
      abstract: "A commentary on how AI is changing the practice of mathematics and theoretical physics — not by replacing human intuition, but by reimagining how questions are asked, explored and understood. We survey machine-learning tools that surface conjectures, expose hidden structure and search vast spaces of ideas, and argue for a partnership in which AI widens the range of problems theorists can reason about."
    },
    {
      title: "From AGI to ASI: the future of artificial intelligence",
      venue: "arXiv", year: 2026,
      cite: "Genewein, Franklin, Lerchner, … Graepel, Hutter, Legg · arXiv:2606.12683 · Google DeepMind",
      cover: "img:images/paper_illustrations/agi-to-asi.png",
      url: "https://arxiv.org/abs/2606.12683",
      abstract: "A technical report examining the transition from artificial general intelligence to artificial superintelligence — what changes as machine intelligence surpasses the human range, the advantages of digital over biological intelligence, and what these shifts mean for how we design and govern advanced AI. From my time on the Post-AGI team at Google DeepMind."
    },
    {
      title: "Escaping ageing through Cell Annealing — a phenomenological model",
      venue: "Cell Research", year: 2025,
      cite: "Memczak, Izpisúa Belmonte, Graepel · Cell Research 35 (8), 535–538",
      cover: "img:images/paper_illustrations/cell-annealing.jpg",
      url: "https://www.nature.com/articles/s41422-025-01138-z",
      abstract: "A physics-inspired model of cellular rejuvenation, from my time at Altos Labs. Borrowing from Hopfield networks and energy landscapes, we picture cell states as minima in a landscape: transiently raising cellular potency (\"annealing\") lets ageing cells escape dysfunctional local minima and settle back into youthful, healthy states — a conceptual bridge between machine learning and cellular reprogramming. Joint work with Sebastian Memczak."
    },
    {
      title: "Cooperative AI: machines must learn to find common ground",
      venue: "Nature", year: 2021,
      cite: "Dafoe, Bachrach, Hadfield, Horvitz, Larson, Graepel · Nature 593, 33–36",
      cover: "img:images/paper_illustrations/common-ground.jpg",
      url: "https://discovery.ucl.ac.uk/id/eprint/10132183/1/Cooperative%20AI%20-%20machines%20must%20learn%20to%20find%20common%20ground%20-%20Preprint.pdf",
      abstract: "A call to build AI that can cooperate — with humans and with other machines. We argue that the field has over-focused on raw capability and competition, and that learning to find common ground, build trust, and coordinate is essential if AI is to help solve society's hardest collective problems. This work helped catalyse the founding of the Cooperative AI Foundation, on whose board I now serve."
    },
    {
      title: "Open Problems in Cooperative AI",
      venue: "arXiv", year: 2020,
      cite: "Dafoe, Hughes, Bachrach, Collins, McKee, Leibo, Larson, Graepel · arXiv:2012.08630",
      cover: "img:images/paper_illustrations/open-problems-coop-ai.png",
      url: "https://arxiv.org/abs/2012.08630",
      abstract: "The longer technical report behind the Nature comment. It lays out a research agenda for Cooperative AI across four capabilities — understanding, communication, commitment, and institutions — and the norms and infrastructure needed to study cooperation among AIs, humans, and mixed groups. Together with the Nature comment, it laid the groundwork for the Cooperative AI Foundation, where I serve on the board."
    },
    {
      title: "Private traits and attributes are predictable from digital records of human behavior",
      venue: "PNAS", year: 2013,
      cite: "Kosinski, Stillwell, Graepel · PNAS 110 (15), 5802–5805",
      cover: "img:images/paper_illustrations/private-traits.jpg",
      url: "https://www.pnas.org/doi/10.1073/pnas.1218772110",
      abstract: "Facebook Likes alone can accurately predict highly sensitive attributes — sexual orientation, ethnicity, religious and political views, personality, intelligence, substance use, age and gender — for 58,000+ volunteers. The work sparked an intense public and expert debate on online personalisation and privacy."
    }
  ];

  // Generated SVG covers. "go" = a monochrome Go board motif;
  // "vc:<kind>" = a minimal, topic-characteristic cover plate.
  function coverSVG(cover) {
    var W = 400, H = 200;
    var open = '<svg class="cover-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">';

    // --- AlphaGo: a real Go board motif ---
    if (cover === "go") {
      var N = 7, size = 150, x0 = (W - size) / 2, y0 = (H - size) / 2, g = size / (N - 1);
      var s = "";
      for (var i = 0; i < N; i++) {
        var p = i * g;
        s += '<line class="board-line" x1="' + (x0 + p) + '" y1="' + y0 + '" x2="' + (x0 + p) + '" y2="' + (y0 + size) + '"/>';
        s += '<line class="board-line" x1="' + x0 + '" y1="' + (y0 + p) + '" x2="' + (x0 + size) + '" y2="' + (y0 + p) + '"/>';
      }
      var pt = function (c, r) { return [x0 + c * g, y0 + r * g]; };
      var stns = [[3,3,"b"],[2,2,"w"],[4,2,"b"],[2,4,"b"],[4,4,"w"],[5,3,"w"],[1,3,"b"]];
      stns.forEach(function (m) {
        var xy = pt(m[0], m[1]);
        s += '<circle class="st-' + m[2] + '" cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + (g * 0.42) + '"/>';
      });
      return open + s + '</svg>';
    }

    // --- faint dot-grid backdrop for venue covers ---
    var dots = "";
    for (var gx = 20; gx < W; gx += 20) {
      for (var gy = 20; gy < H; gy += 20) {
        dots += '<circle class="bgline" cx="' + gx + '" cy="' + gy + '" r="1" stroke="none" fill="#d3d3cf"/>';
      }
    }
    var kind = cover.indexOf("vc:") === 0 ? cover.slice(3) : cover;
    var art = "";
    switch (kind) {
      case "gauss": // Gaussian bell over an axis — Bayesian belief
        art = '<line class="glyph-thin" x1="90" y1="150" x2="310" y2="150"/>' +
              '<path class="glyph" d="M96 150 C150 150 158 66 200 66 C242 66 250 150 304 150"/>' +
              '<line class="glyph-thin" x1="200" y1="150" x2="200" y2="70"/>';
        break;
      case "matchbox": // user × item matrix with a shared latent cell
        art = '<rect class="glyph" x="150" y="64" width="100" height="72" rx="4"/>' +
              '<line class="glyph-thin" x1="150" y1="88" x2="250" y2="88"/>' +
              '<line class="glyph-thin" x1="150" y1="112" x2="250" y2="112"/>' +
              '<line class="glyph-thin" x1="183" y1="64" x2="183" y2="136"/>' +
              '<line class="glyph-thin" x1="217" y1="64" x2="217" y2="136"/>' +
              '<circle class="glyph-fill" cx="200" cy="100" r="7"/>';
        break;
      case "goranking": // a Go grid with a predicted move + ranked candidates
        var gg = "", gs = 22, gx0 = 132, gy0 = 56;
        for (var k = 0; k < 5; k++) {
          gg += '<line class="board-line" x1="' + (gx0 + k * gs) + '" y1="' + gy0 + '" x2="' + (gx0 + k * gs) + '" y2="' + (gy0 + 4 * gs) + '"/>';
          gg += '<line class="board-line" x1="' + gx0 + '" y1="' + (gy0 + k * gs) + '" x2="' + (gx0 + 4 * gs) + '" y2="' + (gy0 + k * gs) + '"/>';
        }
        gg += '<circle class="st-b" cx="' + (gx0 + 2 * gs) + '" cy="' + (gy0 + 2 * gs) + '" r="9"/>';
        gg += '<circle class="glyph" cx="' + (gx0 + 3 * gs) + '" cy="' + (gy0 + gs) + '" r="8"/>';
        gg += '<circle class="glyph-thin-o" cx="' + (gx0 + gs) + '" cy="' + (gy0 + 3 * gs) + '" r="7"/>';
        art = gg;
        break;
      case "muzero": // planning tree grown from a learned (dashed) model root
        art = '<line class="glyph-thin" x1="200" y1="54" x2="140" y2="108"/>' +
              '<line class="glyph-thin" x1="200" y1="54" x2="200" y2="108"/>' +
              '<line class="glyph-thin" x1="200" y1="54" x2="260" y2="108"/>' +
              '<line class="glyph-thin" x1="140" y1="108" x2="116" y2="158"/>' +
              '<line class="glyph-thin" x1="140" y1="108" x2="164" y2="158"/>' +
              '<line class="glyph-thin" x1="260" y1="108" x2="236" y2="158"/>' +
              '<line class="glyph-thin" x1="260" y1="108" x2="284" y2="158"/>' +
              '<circle class="glyph-dasho" cx="200" cy="54" r="13"/>' +
              '<circle class="st-b" cx="140" cy="108" r="9"/><circle class="st-w" cx="200" cy="108" r="9"/><circle class="st-b" cx="260" cy="108" r="9"/>' +
              '<circle class="glyph-fill" cx="116" cy="158" r="5"/><circle class="glyph-fill" cx="164" cy="158" r="5"/><circle class="glyph-fill" cx="236" cy="158" r="5"/><circle class="glyph-fill" cx="284" cy="158" r="5"/>';
        break;
      case "knowledge": // two small graphs aligned across a dashed link
        art = '<circle class="st-b" cx="150" cy="78" r="9"/><circle class="glyph-fill" cx="128" cy="120" r="6"/><circle class="glyph-fill" cx="172" cy="128" r="6"/>' +
              '<line class="glyph-thin" x1="150" y1="78" x2="128" y2="120"/><line class="glyph-thin" x1="150" y1="78" x2="172" y2="128"/><line class="glyph-thin" x1="128" y1="120" x2="172" y2="128"/>' +
              '<circle class="st-w" cx="256" cy="80" r="9"/><circle class="glyph-fill" cx="234" cy="126" r="6"/><circle class="glyph-fill" cx="280" cy="120" r="6"/>' +
              '<line class="glyph-thin" x1="256" y1="80" x2="234" y2="126"/><line class="glyph-thin" x1="256" y1="80" x2="280" y2="120"/><line class="glyph-thin" x1="234" y1="126" x2="280" y2="120"/>' +
              '<line class="glyph-dash" x1="159" y1="78" x2="247" y2="80"/>';
        break;
      case "ascend": // AGI → ASI: rising steps + arrow
        art = '<path class="glyph" d="M120 150 h34 v-24 h34 v-30 h34 v-40 h34"/>' +
              '<path class="glyph" d="M236 56 h20 v20"/><path class="glyph-thin" d="M256 56 L292 20"/>' +
              '<path class="glyph" d="M280 20 h14 v14"/>';
        break;
      case "cooperate": // two interlocking rings
        art = '<circle class="glyph" cx="172" cy="100" r="42"/><circle class="glyph" cx="228" cy="100" r="42"/>';
        break;
      case "privacy": // shield + scattered data dots
        art = '<path class="glyph" d="M200 58 l34 12 v34 c0 26 -20 40 -34 48 c-14 -8 -34 -22 -34 -48 v-34 z"/>' +
              '<path class="glyph" d="M186 104 l10 10 l20 -22"/>' +
              '<circle class="glyph-fill" cx="96" cy="70" r="4"/><circle class="glyph-fill" cx="120" cy="140" r="4"/><circle class="glyph-fill" cx="300" cy="150" r="4"/><circle class="glyph-fill" cx="312" cy="66" r="4"/>';
        break;
      case "agents": // multi-agent graph with a flag
        art = '<line class="glyph-thin" x1="120" y1="130" x2="200" y2="70"/><line class="glyph-thin" x1="200" y1="70" x2="280" y2="128"/>' +
              '<line class="glyph-thin" x1="120" y1="130" x2="280" y2="128"/>' +
              '<circle class="st-b" cx="120" cy="130" r="12"/><circle class="st-w" cx="200" cy="70" r="12"/><circle class="st-b" cx="280" cy="128" r="12"/>' +
              '<path class="glyph" d="M300 66 v78"/><path class="glyph-fill" d="M300 66 h30 l-8 11 l8 11 h-30 z"/>';
        break;
      case "football": // pitch, two agents, a ball
        art = '<rect class="glyph" x="112" y="56" width="176" height="88" rx="4"/>' +
              '<line class="glyph-thin" x1="200" y1="56" x2="200" y2="144"/>' +
              '<circle class="glyph" cx="200" cy="100" r="16"/>' +
              '<circle class="st-b" cx="152" cy="102" r="10"/>' +
              '<circle class="st-w" cx="250" cy="92" r="10"/>' +
              '<circle class="glyph-fill" cx="206" cy="120" r="4.5"/>';
        break;
      default:
        art = '<circle class="st-b" cx="176" cy="100" r="24"/><circle class="st-w" cx="230" cy="100" r="24"/>';
    }
    return open + '<g>' + dots + '</g>' + art + '</svg>';
  }

  function renderPubs(list, mountId) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    list.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "pub reveal";

      var coverHTML;
      if (p.cover && p.cover.indexOf("img:") === 0) {
        coverHTML = '<img src="' + p.cover.slice(4) + '" alt="Figure from: ' + escapeAttr(p.title) + '" loading="lazy" />';
      } else {
        coverHTML = coverSVG(p.cover);
      }

      card.innerHTML =
        '<div class="pub__cover">' +
          '<span class="pub__venue">' + p.venue + '</span>' +
          '<span class="pub__year">' + p.year + '</span>' +
          coverHTML +
        '</div>' +
        '<div class="pub__body">' +
          '<h3 class="pub__title">' + escapeHTML(p.title) + '</h3>' +
          '<p class="pub__cite">' + escapeHTML(p.cite) + '</p>' +
          '<p class="pub__abstract">' + escapeHTML(p.abstract) + '</p>' +
          '<div class="pub__actions">' +
            '<button class="pub__toggle" type="button" aria-expanded="false">read description</button>' +
            '<a href="' + p.url + '" target="_blank" rel="noopener">paper ↗</a>' +
            (p.preprint ? '<a href="' + p.preprint + '" target="_blank" rel="noopener">preprint ↗</a>' : '') +
          '</div>' +
        '</div>';

      var tog = card.querySelector(".pub__toggle");
      var title = card.querySelector(".pub__title");
      function flip() {
        var open = card.classList.toggle("is-open");
        tog.textContent = open ? "hide description" : "read description";
        tog.setAttribute("aria-expanded", open ? "true" : "false");
      }
      tog.addEventListener("click", flip);
      title.addEventListener("click", flip);

      mount.appendChild(card);
      if (io) io.observe(card);
    });
  }

  renderPubs(REASONING, "pubs-reasoning");
  renderPubs(ALPHAGO, "pubs-alphago");
  renderPubs(OTHER, "pubs-other");

  /* ---------- Open every off-page link in a new tab ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (a) {
    var href = a.getAttribute("href") || "";
    if (href && href.charAt(0) !== "#") {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  });

  /* ---------- Hide any institution logo that fails to load ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".org__ico"), function (img) {
    function hide() { img.style.display = "none"; }
    img.addEventListener("error", hide);
    if (img.complete && img.naturalWidth === 0) hide();
  });

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }
  function escapeAttr(s) { return escapeHTML(s).replace(/'/g, "&#39;"); }

})();
