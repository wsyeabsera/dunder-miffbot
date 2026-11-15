// A walkable grid over the building and A* over it. Pure: no three.js, so it is unit tested in plain Node.

export const CELL = 0.5;

export type Pt = { x: number; z: number };

export class Grid {
  readonly cols: number;
  readonly rows: number;
  /** 1 = solid (wall or furniture). */
  readonly solid: Uint8Array;
  private inflated: Uint8Array | null = null;

  readonly x0: number;
  readonly z0: number;

  constructor(x0: number, z0: number, width: number, depth: number) {
    this.x0 = x0;
    this.z0 = z0;
    this.cols = Math.round(width / CELL);
    this.rows = Math.round(depth / CELL);
    this.solid = new Uint8Array(this.cols * this.rows);
  }

  col(x: number) { return Math.floor((x - this.x0) / CELL); }
  row(z: number) { return Math.floor((z - this.z0) / CELL); }
  centerX(col: number) { return this.x0 + (col + 0.5) * CELL; }
  centerZ(row: number) { return this.z0 + (row + 0.5) * CELL; }
  inside(col: number, row: number) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  index(col: number, row: number) { return row * this.cols + col; }

  isSolid(col: number, row: number) { return !this.inside(col, row) || this.solid[this.index(col, row)] === 1; }
  /** True when the point is inside a wall or piece of furniture. */
  solidAt(x: number, z: number) { return this.isSolid(this.col(x), this.row(z)); }

  setRect(x0: number, z0: number, x1: number, z1: number, value: 0 | 1) {
    const c0 = Math.max(0, this.col(x0 + 1e-6));
    const c1 = Math.min(this.cols - 1, this.col(x1 - 1e-6));
    const r0 = Math.max(0, this.row(z0 + 1e-6));
    const r1 = Math.min(this.rows - 1, this.row(z1 - 1e-6));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.solid[this.index(c, r)] = value;
    this.inflated = null;
  }

  /** Solid cells grown by one cell, so paths keep a body's width from walls. */
  private clearance(): Uint8Array {
    if (this.inflated) return this.inflated;
    const out = new Uint8Array(this.solid.length);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.solid[this.index(c, r)]) continue;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (this.inside(c + dc, r + dr)) out[this.index(c + dc, r + dr)] = 1;
      }
    }
    return (this.inflated = out);
  }

  /** True when a point is far enough from walls and furniture for a body to stand there. */
  free(x: number, z: number) {
    const c = this.col(x);
    const r = this.row(z);
    return this.inside(c, r) && this.clearance()[this.index(c, r)] === 0;
  }

  /** The straight segment between two points crosses no inflated solid cell. */
  clear(a: Pt, b: Pt): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      if (!this.free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Shortest walking route between two free points, smoothed to as few corners as possible. Null when unreachable. */
  path(from: Pt, to: Pt): Pt[] | null {
    const blocked = this.clearance();
    const start = this.index(this.col(from.x), this.row(from.z));
    const goal = this.index(this.col(to.x), this.row(to.z));
    if (!this.inside(this.col(from.x), this.row(from.z)) || !this.inside(this.col(to.x), this.row(to.z))) return null;
    if (blocked[start] || blocked[goal]) return null;
    if (start === goal) return [to];

    const n = this.solid.length;
    const g = new Float32Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [start];
    const f = new Float32Array(n).fill(Infinity);
    const gc = goal % this.cols;
    const gr = Math.floor(goal / this.cols);
    const h = (i: number) => {
      const dc = Math.abs((i % this.cols) - gc);
      const dr = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dc, dr) + 0.41421356 * Math.min(dc, dr);
    };
    g[start] = 0;
    f[start] = h(start);
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i;
      const cur = open[best];
      open[best] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.inside(nc, nr)) continue;
          const ni = this.index(nc, nr);
          if (blocked[ni] || closed[ni]) continue;
          if (dc && dr && (blocked[this.index(c + dc, r)] || blocked[this.index(c, r + dr)])) continue; // no corner cutting
          const cost = g[cur] + (dc && dr ? 1.41421356 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            prev[ni] = cur;
            f[ni] = cost + h(ni);
            open.push(ni);
          }
        }
      }
    }
    if (prev[goal] === -1) return null;

    const cells: Pt[] = [];
    for (let i = goal; i !== -1; i = prev[i]) cells.push({ x: this.centerX(i % this.cols), z: this.centerZ(Math.floor(i / this.cols)) });
    cells.reverse();
    cells[0] = from;
    cells[cells.length - 1] = to;

    // String pulling: from each point jump to the furthest point still in line of sight.
    const out: Pt[] = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let far = anchor + 1;
      for (let i = cells.length - 1; i > anchor + 1; i--) {
        if (this.clear(cells[anchor], cells[i])) {
          far = i;
          break;
        }
      }
      out.push(cells[far]);
      anchor = far;
    }
    return out;
  }
}
