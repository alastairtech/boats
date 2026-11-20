// Generates a 100 km x 100 km archipelago: islands, rivers/channels, a navigation grid and towns.
// World units: 1 unit = 25 m, so the world is 4000 x 4000 units. Structure lives on a coarse grid
// of 8-unit (200 m) cells; voxel tiles are derived on demand from it plus detail noise.
import { RNG, Noise, hash2 } from './rng.js';

export const WORLD = 4000;
export const CELL = 8;
export const N = WORLD / CELL; // 500 cells per side
export const WATER_Y = -0.15;
export const KM_PER_UNIT = 0.025;

// Navigation classes: what each boat class may sail through.
export const NAV = { LAND: 0, RIVER: 1, SHALLOW: 2, DEEP: 3 };
export const CLASS_MIN = { river: 1, coastal: 2, ocean: 3 };

export const TIER = {
  small: { label: 'Village', radius: 7, spacing: 14, pop: [300, 1400] },
  medium: { label: 'Town', radius: 11, spacing: 22, pop: [2000, 6000] },
  large: { label: 'Large town', radius: 16, spacing: 36, pop: [9000, 26000] },
  city: { label: 'Port city', radius: 24, spacing: 70, pop: [45000, 140000] },
};

const NAME_A = ['Mill', 'Wil', 'Ash', 'Brook', 'Fern', 'Hazel', 'Otter', 'Kings', 'Pebble', 'Wren', 'Bram', 'Elder',
  'Thistle', 'Moss', 'Heron', 'Lark', 'Apple', 'Rush', 'Clover', 'Bell', 'Puddle', 'Honey', 'Willow', 'Badger', 'Cobble',
  'Marigold', 'Sorrel', 'Tansy', 'Rook', 'Kettle', 'Gull', 'Salt', 'Cor', 'Pen', 'Tre', 'Lyn', 'Dun', 'Kil', 'Bally',
  'Strath', 'Inver', 'Aber', 'Holly', 'Raven', 'Oak', 'Birch', 'Stone', 'Fox', 'Swan', 'Tern', 'Puffin', 'Kelp', 'Shell',
  'Amber', 'Copper', 'Silver', 'North', 'South', 'East', 'West', 'High', 'Low', 'Long', 'Broad', 'Green', 'Red', 'Black'];
const NAME_B = ['brook', 'ford', 'bury', 'wick', 'mere', 'stead', 'ton', 'haven', 'dale', 'holm', 'bridge', 'wold',
  'combe', 'by', 'sey', 'worth', 'hythe', 'minster', 'field', 'well', 'ness', 'wich', 'cliff', 'more', 'garth', 'ley',
  'thorpe', 'sted', 'water', 'bay'];
const CITY_B = ['port', 'haven', 'mouth', 'quay', 'harbour', 'sound', 'firth', 'strand'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Binary min-heap keyed by Float64 priorities, storing integer ids.
class Heap {
  constructor() { this.ids = []; this.pri = []; }
  get size() { return this.ids.length; }
  push(id, p) {
    const ids = this.ids, pri = this.pri;
    let i = ids.length;
    ids.push(id); pri.push(p);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pri[par] <= p) break;
      ids[i] = ids[par]; pri[i] = pri[par];
      i = par;
    }
    ids[i] = id; pri[i] = p;
  }
  pop() {
    const ids = this.ids, pri = this.pri;
    const top = ids[0];
    const lid = ids.pop(), lp = pri.pop();
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= lp) break;
        ids[i] = ids[c]; pri[i] = pri[c];
        i = c;
      }
      ids[i] = lid; pri[i] = lp;
    }
    return top;
  }
}
export { Heap };

const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export class Archipelago {
  generate(seed) {
    this.seed = seed;
    const rng = (this.rng = new RNG(seed));
    const t0 = performance.now();
    this._heights(rng);
    this._islands();
    this._navSea();
    this._rivers(rng);
    this._towns(rng);
    this.genMs = performance.now() - t0;
  }

  // ---------------------------------------------------------------- coarse height field

  _heights(rng) {
    const M = N + 1;
    const e = new Float32Array(M * M);
    const warpA = new Noise(rng.u32(), 1 / 520, 3);
    const warpB = new Noise(rng.u32(), 1 / 520, 3);
    const coast = new Noise(rng.u32(), 1 / 240, 4);
    const fine = new Noise(rng.u32(), 1 / 60, 3);
    const hills = new Noise(rng.u32(), 1 / 140, 3);
    this.nDetail = new Noise(rng.u32(), 1 / 14, 2);
    this.nForest = new Noise(rng.u32(), 1 / 90, 3);
    this.nKind = new Noise(rng.u32(), 1 / 60, 2);

    const wx = new Float32Array(M * M), wz = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = i * CELL, z = j * CELL;
      wx[j * M + i] = x + warpA.get2(x, z) * 160;
      wz[j * M + i] = z + warpB.get2(x, z) * 160;
    }
    const bumps = [];
    const add = (n, r0, r1, p0, p1) => {
      for (let k = 0; k < n; k++) {
        bumps.push({ x: rng.range(350, WORLD - 350), z: rng.range(350, WORLD - 350), r: rng.range(r0, r1), p: rng.range(p0, p1) });
      }
    };
    add(4, 520, 900, 1.0, 1.35);
    add(14, 180, 380, 0.85, 1.2);
    add(65, 45, 150, 0.7, 1.05);
    for (const b of bumps) {
      const i0 = clamp(Math.floor((b.x - b.r - 200) / CELL), 0, N), i1 = clamp(Math.ceil((b.x + b.r + 200) / CELL), 0, N);
      const j0 = clamp(Math.floor((b.z - b.r - 200) / CELL), 0, N), j1 = clamp(Math.ceil((b.z + b.r + 200) / CELL), 0, N);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * M + i;
        const d = Math.hypot(wx[k] - b.x, wz[k] - b.z) / b.r;
        if (d >= 1) continue;
        const v = b.p * (1 - Math.pow(d, 1.5));
        if (v > e[k]) e[k] = v;
      }
    }
    const h = (this.h = new Float32Array(M * M));
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = i * CELL, z = j * CELL;
      const k = j * M + i;
      let v = e[k] + coast.get2(x, z) * 0.2 + fine.get2(x, z) * 0.07;
      v *= smooth(0, 260, Math.min(x, z, WORLD - x, WORLD - z));
      const s = v - 0.3;
      h[k] = s >= 0 ? 6.5 * (1 - Math.exp(-s * 1.25)) + Math.max(0, hills.get2(x, z)) * s * 5 : Math.max(-4.5, s * 15);
    }
  }

  corner(i, j) { return this.h[clamp(j, 0, N) * (N + 1) + clamp(i, 0, N)]; }

  coarseAt(x, z) {
    const fx = clamp(x / CELL, 0, N - 1e-4), fz = clamp(z / CELL, 0, N - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const M = N + 1, h = this.h, k = j * M + i;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + M] * (1 - tx) + h[k + M + 1] * tx) * tz;
  }

  cellH(i, j) { // centre height of a cell
    return (this.corner(i, j) + this.corner(i + 1, j) + this.corner(i, j + 1) + this.corner(i + 1, j + 1)) / 4;
  }

  _islands() {
    const isl = (this.island = new Int32Array(N * N).fill(-1));
    this.islands = [];
    for (let s = 0; s < N * N; s++) {
      if (isl[s] >= 0 || this.cellH(s % N, (s / N) | 0) < 0) continue;
      const id = this.islands.length;
      const cells = [s];
      isl[s] = id;
      for (let q = 0; q < cells.length; q++) {
        const c = cells[q], ci = c % N, cj = (c / N) | 0;
        for (const [dx, dz] of D8) {
          const ni = ci + dx, nj = cj + dz;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nk = nj * N + ni;
          if (isl[nk] >= 0 || this.cellH(ni, nj) < 0) continue;
          isl[nk] = id;
          cells.push(nk);
        }
      }
      this.islands.push({ id, cells, area: cells.length });
    }
  }

  _navSea() {
    const nav = (this.nav = new Uint8Array(N * N));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const m = Math.max(this.corner(i, j), this.corner(i + 1, j), this.corner(i, j + 1), this.corner(i + 1, j + 1));
      nav[j * N + i] = m < -2.2 ? NAV.DEEP : m < -0.7 ? NAV.SHALLOW : NAV.LAND;
    }
    this.snapX = new Float32Array(N * N).fill(NaN);
    this.snapZ = new Float32Array(N * N).fill(NaN);
  }

  // ---------------------------------------------------------------- rivers

  // Dijkstra over cells from `src` until `goal(cell)`; `cost(cell)` (Infinity = blocked).
  _carvePath(src, goal, cost, limit = 500000) {
    const dist = new Map([[src, 0]]);
    const prev = new Map();
    const heap = new Heap();
    heap.push(src, 0);
    let n = 0;
    while (heap.size && n++ < limit) {
      const c = heap.pop();
      if (goal(c)) {
        const path = [c];
        let p = c;
        while (prev.has(p)) { p = prev.get(p); path.push(p); }
        return path.reverse();
      }
      const dc = dist.get(c);
      const ci = c % N, cj = (c / N) | 0;
      for (const [dx, dz, w] of D8) {
        const ni = ci + dx, nj = cj + dz;
        if (ni < 1 || nj < 1 || ni >= N - 1 || nj >= N - 1) continue;
        const nk = nj * N + ni;
        const k = cost(nk);
        if (k === Infinity) continue;
        const nd = dc + k * w;
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, c); heap.push(nk, nd); }
      }
    }
    return null;
  }

  _rivers(rng) {
    this.rivers = [];
    const nav = this.nav;
    const landCost = (k) => {
      if (nav[k] >= NAV.SHALLOW) return 1;
      const h = this.cellH(k % N, (k / N) | 0);
      return 1 + Math.max(0, h) * 1.4 + (nav[k] === NAV.RIVER ? -0.5 : 0);
    };
    const isSea = (k) => nav[k] >= NAV.SHALLOW;
    const coastCells = (isl) => isl.cells.filter((c) => {
      const ci = c % N, cj = (c / N) | 0;
      return D8.some(([dx, dz]) => this.island[(cj + dz) * N + ci + dx] !== isl.id);
    });
    for (const isl of this.islands) {
      if (isl.area < 260) continue;
      const coast = coastCells(isl);
      if (coast.length < 10) continue;
      // Inland rivers: from high ground down to the nearest sea.
      const nRiv = Math.min(6, 1 + Math.floor(isl.area / 900));
      const inland = this._coastDistance(isl);
      const byD = [...isl.cells].sort((a, b) => inland.get(b) - inland.get(a));
      for (let r = 0; r < nRiv; r++) {
        const src = byD[Math.floor(rng.range(0, 0.25) * byD.length)];
        const path = this._carvePath(src, isSea, landCost);
        if (path && path.length > 6) this._addRiver(path, rng.range(1.3, 1.9));
      }
      // Channels right across larger islands, so river boats can take shortcuts.
      const nCh = isl.area > 5000 ? 2 : isl.area > 1100 ? 1 : 0;
      for (let r = 0; r < nCh; r++) {
        const a = coast[rng.int(0, coast.length - 1)];
        let best = -1, bd = 0;
        for (let s = 0; s < 50; s++) {
          const b = coast[rng.int(0, coast.length - 1)];
          const d = Math.hypot((a % N) - (b % N), ((a / N) | 0) - ((b / N) | 0));
          if (d > bd) { bd = d; best = b; }
        }
        if (bd < 25) continue;
        const bi = best % N, bj = (best / N) | 0;
        const startSea = this._nearest(a, isSea, 4);
        if (startSea < 0) continue;
        const path = this._carvePath(startSea, (k) => k === best || (isSea(k) && Math.hypot((k % N) - bi, ((k / N) | 0) - bj) < 3 && k !== startSea && this._far(k, startSea)),
          (k) => (nav[k] >= NAV.SHALLOW ? 30 : 1 + Math.max(0, this.cellH(k % N, (k / N) | 0)) * 2.2));
        if (path && path.length > 10) this._addRiver(path, rng.range(1.8, 2.4), true);
      }
    }
    this._riverIndex();
  }

  // Steps from each island cell to the sea (BFS).
  _coastDistance(isl) {
    const d = new Map();
    const q = [];
    for (const c of isl.cells) {
      const ci = c % N, cj = (c / N) | 0;
      if (D8.some(([dx, dz]) => this.island[(cj + dz) * N + ci + dx] !== isl.id)) { d.set(c, 0); q.push(c); }
    }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % N, cj = (c / N) | 0;
      for (const [dx, dz] of D8) {
        const k = (cj + dz) * N + ci + dx;
        if (this.island[k] === isl.id && !d.has(k)) { d.set(k, d.get(c) + 1); q.push(k); }
      }
    }
    for (const c of isl.cells) if (!d.has(c)) d.set(c, 0);
    return d;
  }

  _far(a, b) { return Math.hypot((a % N) - (b % N), ((a / N) | 0) - ((b / N) | 0)) > 10; }

  _nearest(c, pred, r) {
    const ci = c % N, cj = (c / N) | 0;
    for (let rr = 1; rr <= r; rr++)
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        const k = (cj + dz) * N + ci + dx;
        if (pred(k)) return k;
      }
    return -1;
  }

  _adjacent(c, pred) {
    const ci = c % N, cj = (c / N) | 0;
    for (const [dx, dz] of D8) {
      const k = (cj + dz) * N + ci + dx;
      if (pred(k)) return k;
    }
    return -1;
  }

  _addRiver(path, w, channel = false) {
    // Cell centres -> smoothed polyline.
    let pts = path.map((c) => [(c % N + 0.5) * CELL, (((c / N) | 0) + 0.5) * CELL]);
    for (let it = 0; it < 3; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    const river = { pts, w, channel };
    this.rivers.push(river);
    // Rasterise into the nav grid; each river cell remembers a point on the centre line.
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 0.8));
      for (let s = 0; s <= steps; s++) {
        const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
        const k = Math.floor(z / CELL) * N + Math.floor(x / CELL);
        if (this.nav[k] === NAV.LAND) this.nav[k] = NAV.RIVER;
        if (this.nav[k] === NAV.RIVER && Number.isNaN(this.snapX[k])) {
          // snap near the middle of the river's pass through the cell
          this.snapX[k] = x; this.snapZ[k] = z;
        }
      }
    }
  }

  _riverIndex() {
    this.segs = [];
    this.segIndex = new Map();
    for (const r of this.rivers) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const id = this.segs.length;
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        this.segs.push({ ax, az, bx, bz, w: r.w });
        const m = r.w + 6;
        const i0 = Math.floor((Math.min(ax, bx) - m) / CELL), i1 = Math.floor((Math.max(ax, bx) + m) / CELL);
        const j0 = Math.floor((Math.min(az, bz) - m) / CELL), j1 = Math.floor((Math.max(az, bz) + m) / CELL);
        for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
          const k = j * N + ii;
          let arr = this.segIndex.get(k);
          if (!arr) this.segIndex.set(k, (arr = []));
          arr.push(id);
        }
      }
    }
  }

  // Distance beyond the river's edge (negative = inside the river), or Infinity.
  riverEdge(x, z) {
    const arr = this.segIndex.get(Math.floor(z / CELL) * N + Math.floor(x / CELL));
    if (!arr) return Infinity;
    let best = Infinity;
    for (const id of arr) {
      const s = this.segs[id];
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.w;
      if (d < best) best = d;
    }
    return best;
  }

  // ---------------------------------------------------------------- fine tiles

  // Continuous terrain height at a point (water where < 0).
  rawHeight(x, z) {
    let h = this.coarseAt(x, z) + this.nDetail.get2(x, z) * 0.45;
    const re = this.riverEdge(x, z);
    if (re < 4) {
      if (re < 0) return Math.min(h, re < -0.8 ? -1.2 : -0.6);
      h = Math.min(h, 0.2 + re * 0.55);
    }
    return h;
  }

  isWaterAt(x, z) { return this.rawHeight(x, z) < 0; }

  // ---------------------------------------------------------------- towns

  _towns(rng) {
    const nav = this.nav;
    const towns = (this.towns = []);
    const cand = [];
    for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
      const k = j * N + i;
      if (nav[k] !== NAV.LAND) continue;
      const h = this.cellH(i, j);
      if (h < 0.15 || h > 3.2) continue;
      const isl = this.island[k];
      if (isl < 0) continue;
      let best = 0, dock = -1, river = false;
      for (const [dx, dz] of D8) {
        const nk = (j + dz) * N + i + dx;
        const v = nav[nk];
        if (v > best) { best = v; dock = nk; }
        if (v === NAV.RIVER) river = true;
      }
      if (dock < 0) continue;
      // Deep water a little offshore can be reached with a longer pier.
      let deep = best === NAV.DEEP ? dock : -1;
      for (let r = 2; r <= 3 && deep < 0; r++) {
        for (let dz = -r; dz <= r && deep < 0; dz++) for (let dx = -r; dx <= r; dx++) {
          const nk = (j + dz) * N + i + dx;
          if (nav[nk] === NAV.DEEP) { deep = nk; break; }
        }
      }
      cand.push({ k, i, j, isl, area: this.islands[isl].area, dock, dockNav: best, deep, river: best === NAV.RIVER, nearRiver: river });
    }
    rng.shuffle(cand);
    const usedNames = new Set();
    const name = (tier) => {
      for (let t = 0; t < 200; t++) {
        let n = rng.pick(NAME_A) + (tier === 'city' ? rng.pick(CITY_B) : rng.pick(NAME_B));
        if (!usedNames.has(n)) { usedNames.add(n); return n; }
      }
      return 'Town ' + towns.length;
    };
    const place = (tier, count, filter) => {
      let placed = 0;
      for (const c of cand) {
        if (placed >= count) break;
        if (c.used || !filter(c)) continue;
        const sp = TIER[tier].spacing;
        if (towns.some((t) => Math.hypot(t.ci - c.i, t.cj - c.j) < Math.max(Math.min(sp, TIER[t.tier].spacing), (TIER[tier].radius + t.radius) / CELL + 4))) continue;
        c.used = true;
        towns.push(this._makeTown(c, tier, name(tier), rng));
        placed++;
      }
    };
    place('city', 6, (c) => c.deep >= 0 && c.area > 500);
    place('large', 11, (c) => c.area > 250 && (c.dockNav >= NAV.SHALLOW || rng.randf() < 0.5));
    place('medium', 14, (c) => c.area > 120 && c.river);
    place('medium', 12, (c) => c.area > 80);
    place('small', 26, (c) => c.river);
    place('small', 34, () => true);
    towns.forEach((t, i) => { t.id = i; });
  }

  _makeTown(c, tier, name, rng) {
    const T = TIER[tier];
    const dk = (tier === 'city' || tier === 'large') && c.deep >= 0 ? c.deep : c.dock;
    const di = dk % N, dj = (dk / N) | 0;
    let dx = (di + 0.5) * CELL, dz = (dj + 0.5) * CELL;
    if (this.nav[dk] === NAV.RIVER && !Number.isNaN(this.snapX[dk])) { dx = this.snapX[dk]; dz = this.snapZ[dk]; }
    const x = (c.i + 0.5) * CELL, z = (c.j + 0.5) * CELL;
    // Pull the town centre onto solid ground a little away from the dock.
    const ax = x - dx, az = z - dz, al = Math.hypot(ax, az) || 1;
    let cx = x + ax / al * 2, cz = z + az / al * 2;
    const forest = this.nForest.get2(cx, cz);
    const pop = Math.round(rng.range(T.pop[0], T.pop[1]));
    const t = {
      name, tier, ci: c.i, cj: c.j, x: cx, z: cz, dockCell: dk, dockNav: this.nav[dk], dockX: dx, dockZ: dz,
      island: c.isl, pop, radius: T.radius, river: c.river,
      shipyard: tier === 'city' || tier === 'large',
      baseH: Math.max(0.5, Math.round(Math.max(0.5, this.coarseAt(cx, cz)) * 2) / 2),
      walls: rng.int(0, 7), roofs: rng.int(0, 6), seed: rng.u32(),
    };
    // Raw material/food speciality for smaller places, factories for big ones.
    if (tier === 'small' || tier === 'medium') {
      t.raw = !c.river && rng.randf() < 0.45 ? 'food' : forest > 0.02 ? 'timber' : 'grain';
    }
    t.factory = tier === 'large' || tier === 'city';
    this._pier(t);
    return t;
  }

  _pier(t) {
    // Walk from the dock toward the town; planks cover the water in between.
    const tiles = new Set();
    const dx = t.x - t.dockX, dz = t.z - t.dockZ, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    let x = t.dockX + ux * 0.8, z = t.dockZ + uz * 0.8;
    for (let s = 0; s < 60; s++) {
      if (!this.isWaterAt(Math.floor(x) + 0.5, Math.floor(z) + 0.5)) break;
      tiles.add(`${Math.floor(x)},${Math.floor(z)}`);
      x += ux * 0.5; z += uz * 0.5;
    }
    t.pier = tiles;
    t.berthX = t.dockX + ux * 0.2;
    t.berthZ = t.dockZ + uz * 0.2;
  }

  // Which town (if any) owns a tile, cheaply.
  townAt(x, z) {
    if (!this._townGrid) {
      this._townGrid = new Map();
      for (const t of this.towns) {
        const r = t.radius + 2;
        for (let j = Math.floor((t.z - r) / 32); j <= Math.floor((t.z + r) / 32); j++)
          for (let i = Math.floor((t.x - r) / 32); i <= Math.floor((t.x + r) / 32); i++) {
            const k = j * 1000 + i;
            if (!this._townGrid.has(k)) this._townGrid.set(k, []);
            this._townGrid.get(k).push(t);
          }
      }
    }
    const arr = this._townGrid.get(Math.floor(z / 32) * 1000 + Math.floor(x / 32));
    if (!arr) return null;
    for (const t of arr) if (Math.hypot(x - t.x, z - t.z) < t.radius) return t;
    return null;
  }
}

export { hash2, clamp };
