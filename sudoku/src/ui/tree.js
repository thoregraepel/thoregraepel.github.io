// tree.js — explorable rendering of the reasoning tree.
//
// Every node is a hypothesis the system posited; its colour records what the
// hypothesis yielded (still open, expanded further, refuted, or a solution).
// Clicking a node loads that belief state onto the board.

const NW = 58, NH = 22, XGAP = 10, YGAP = 44;

export class TreeView {
  constructor(svg, { onSelect } = {}) {
    this.svg = svg;
    this.onSelect = onSelect;
    this.view = { x: -200, y: -40, w: 800, h: 500 };
    this.follow = true;
    this.selectedId = null;
    this.positions = new Map();

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const k = Math.exp(e.deltaY * 0.0015);
      const nw = Math.min(20000, Math.max(120, this.view.w * k));
      const nh = nw * (this.view.h / this.view.w);
      this.view.x += (this.view.w - nw) * fx;
      this.view.y += (this.view.h - nh) * fy;
      this.view.w = nw; this.view.h = nh;
      this.applyView();
    }, { passive: false });

    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('drag');
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect();
      this.view.x = drag.vx - (e.clientX - drag.x) * (this.view.w / r.width);
      this.view.y = drag.vy - (e.clientY - drag.y) * (this.view.h / r.height);
      this.follow = false;
      this.applyView();
    });
    const end = () => { drag = null; svg.classList.remove('drag'); };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  applyView() {
    const { x, y, w, h } = this.view;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }

  layout(root) {
    const pos = new Map();
    let leaf = 0;
    const walk = (n) => {
      if (!n.children.length) { pos.set(n.id, { x: leaf * (NW + XGAP), y: n.depth * YGAP }); leaf++; return; }
      for (const c of n.children) walk(c);
      const first = pos.get(n.children[0].id), last = pos.get(n.children[n.children.length - 1].id);
      pos.set(n.id, { x: (first.x + last.x) / 2, y: n.depth * YGAP });
    };
    walk(root);
    this.positions = pos;
    return pos;
  }

  render(reasoner, activeId, selectedId) {
    const svg = this.svg;
    const pos = this.layout(reasoner.root);
    this.selectedId = selectedId;

    const parts = [];
    const walk = (n) => {
      const p = pos.get(n.id);
      for (const c of n.children) {
        const q = pos.get(c.id);
        const onPath = c.status === 'active' || c.id === activeId || isAncestorOf(c, reasoner.current);
        parts.push(`<path class="tedge${onPath ? ' on' : ''}" d="M${p.x + NW / 2},${p.y + NH} C${p.x + NW / 2},${p.y + NH + YGAP / 2} ${q.x + NW / 2},${q.y - YGAP / 2} ${q.x + NW / 2},${q.y}"/>`);
        walk(c);
      }
    };
    walk(reasoner.root);

    const nodeParts = [];
    for (const n of reasoner.nodes.values()) {
      const p = pos.get(n.id);
      if (!p) continue;
      // Terminal statuses win over 'active': a solved node the search is still
      // sitting on must not be painted as merely in-progress.
      const st = (n.status === 'solved' || n.status === 'refuted') ? n.status
        : (n.id === activeId ? 'active' : n.status);
      // The sound entropy bound, never the Bethe number: off a fixed point the
      // latter can come out negative, which is meaningless as an entropy.
      // Unvisited nodes show the bound their probe measured, prefixed with '~'.
      const sub = n.stats
        ? `H ${n.stats.boundEntropy.toFixed(1)}`
        : (n.probe && Number.isFinite(n.probe.entropy) ? `~${n.probe.entropy.toFixed(1)}` : '·');
      nodeParts.push(`<g class="tnode st-${st}${n.id === selectedId ? ' sel' : ''}" data-id="${n.id}" transform="translate(${p.x},${p.y})">
        <rect width="${NW}" height="${NH}" rx="4"/>
        <text x="${NW / 2}" y="10" text-anchor="middle">${esc(n.label)}</text>
        <text class="sub" x="${NW / 2}" y="18.5" text-anchor="middle">${esc(sub)}</text>
      </g>`);
    }

    svg.innerHTML = parts.join('') + nodeParts.join('');
    for (const g of svg.querySelectorAll('.tnode')) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect?.(Number(g.dataset.id)); });
    }

    if (this.follow && activeId != null && pos.has(activeId)) this.centerOn(pos.get(activeId));
    this.applyView();
  }

  centerOn(p) {
    this.view.x = p.x + NW / 2 - this.view.w / 2;
    this.view.y = p.y + NH / 2 - this.view.h * 0.5;
  }

  fit(reasoner) {
    const pos = this.positions.size ? this.positions : this.layout(reasoner.root);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pos.values()) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + NW); y1 = Math.max(y1, p.y + NH);
    }
    if (!Number.isFinite(x0)) return;
    const r = this.svg.getBoundingClientRect();
    const aspect = (r.height || 400) / (r.width || 800);
    const pad = 40;
    let w = Math.max(x1 - x0 + pad * 2, 200);
    let h = Math.max(y1 - y0 + pad * 2, 200);
    if (h / w < aspect) h = w * aspect; else w = h / aspect;
    this.view = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
    this.follow = false;
    this.applyView();
  }
}

function isAncestorOf(node, of) {
  for (let n = of; n; n = n.parent) if (n === node) return true;
  return false;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
