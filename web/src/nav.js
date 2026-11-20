// Boat pathfinding on the coarse navigation grid, with line-of-sight smoothing at sea and caching.
import { N, CELL, NAV, CLASS_MIN, Heap } from './archipelago.js';

const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export class Navigator {
  constructor(arch) {
    this.a = arch;
    this.cache = new Map();
    this.g = new Float32Array(N * N);
    this.from = new Int32Array(N * N);
    this.stamp = new Uint32Array(N * N);
    this.closed = new Uint32Array(N * N);
    this.run = 0;
  }

  ok(k, min) { return this.a.nav[k] >= min; }

  // Nearest navigable cell to a point for a boat class.
  cellNear(x, z, cls) {
    const min = CLASS_MIN[cls];
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let r = 0; r < 6; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const i = ci + dx, j = cj + dz;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = j * N + i;
        if (!this.ok(k, min)) continue;
        const d = Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - z);
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  canReach(town, cls) { return this.a.nav[town.dockCell] >= CLASS_MIN[cls]; }

  // Cell sequence from a to b (inclusive) or null.
  cells(a, b, cls) {
    const key = `${a}>${b}>${cls}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const min = CLASS_MIN[cls];
    const run = ++this.run;
    const { g, from, stamp, closed } = this;
    const bi = b % N, bj = (b / N) | 0;
    const h = (k) => { const dx = Math.abs((k % N) - bi), dz = Math.abs(((k / N) | 0) - bj); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); };
    const heap = new Heap();
    stamp[a] = run; g[a] = 0; from[a] = -1;
    heap.push(a, h(a));
    let found = false;
    const nav = this.a.nav;
    while (heap.size) {
      const c = heap.pop();
      if (closed[c] === run) continue;
      closed[c] = run;
      if (c === b) { found = true; break; }
      const ci = c % N, cj = (c / N) | 0;
      for (const [dx, dz, w] of D8) {
        const ni = ci + dx, nj = cj + dz;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        const v = nav[nk];
        if (v < min) continue;
        // no corner cutting past land
        if (dx && dz && (nav[cj * N + ni] < min || nav[nj * N + ci] < min)) continue;
        // prefer open water slightly over hugging shallows/rivers
        const ng = g[c] + w * (v === NAV.RIVER ? 1.15 : v === NAV.SHALLOW ? 1.05 : 1);
        if (stamp[nk] !== run || ng < g[nk]) {
          stamp[nk] = run; g[nk] = ng; from[nk] = c;
          heap.push(nk, ng + h(nk));
        }
      }
    }
    let path = null;
    if (found) {
      path = [];
      for (let c = b; c !== -1; c = from[c]) path.push(c);
      path.reverse();
    }
    this.cache.set(key, path);
    return path;
  }

  point(k) {
    const a = this.a;
    if (a.nav[k] === NAV.RIVER && !Number.isNaN(a.snapX[k])) return [a.snapX[k], a.snapZ[k]];
    return [(k % N + 0.5) * CELL, (((k / N) | 0) + 0.5) * CELL];
  }

  // Straight line between two sea cells stays on navigable, non-river water?
  clear(a, b, min) {
    const nav = this.a.nav;
    let x0 = a % N, y0 = (a / N) | 0;
    const x1 = b % N, y1 = (b / N) | 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      const k = y0 * N + x0;
      if (nav[k] < Math.max(min, NAV.SHALLOW)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) {
        // diagonal step: both side cells must be clear too
        if (nav[y0 * N + x0 + sx] < Math.max(min, NAV.SHALLOW) || nav[(y0 + sy) * N + x0] < Math.max(min, NAV.SHALLOW)) return false;
      }
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  // World-space waypoints from (x,z) to a town's berth.
  route(x, z, town, cls) {
    const a = this.cellNear(x, z, cls);
    const b = town.dockCell;
    if (a < 0 || this.a.nav[b] < CLASS_MIN[cls]) return null;
    const key = `w${a}>${b}>${cls}`;
    let pts = this.cache.get(key);
    if (pts === undefined) {
      const cells = this.cells(a, b, cls);
      pts = cells ? this._smooth(cells, CLASS_MIN[cls]) : null;
      this.cache.set(key, pts);
    }
    if (!pts) return null;
    const out = [[x, z], ...pts.slice(1, -1), [town.berthX, town.berthZ]];
    // Drop the first cell centre if it would make the boat double back.
    if (out.length > 2) {
      const [ax, az] = out[0], [bx, bz] = out[1], [cx, cz] = out[2];
      if ((bx - ax) * (cx - bx) + (bz - az) * (cz - bz) < 0 || Math.hypot(bx - ax, bz - az) < CELL * 0.6) out.splice(1, 1);
    }
    return out;
  }

  _smooth(cells, min) {
    const nav = this.a.nav;
    const keep = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      // Rivers: follow every cell. Sea: skip ahead while there's a clear line.
      if (nav[cells[i]] === NAV.RIVER || nav[cells[i + 1]] === NAV.RIVER) { i++; keep.push(cells[i]); continue; }
      let j = i + 1;
      for (let t = Math.min(cells.length - 1, i + 60); t > i + 1; t--) {
        if (nav[cells[t]] !== NAV.RIVER && this.clear(cells[i], cells[t], min)) { j = t; break; }
      }
      keep.push(cells[j]);
      i = j;
    }
    return keep.map((k) => this.point(k));
  }
}

export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}
