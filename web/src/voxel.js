// Tiny voxel modelling kit: fill voxels with colours, then bake a face-culled BufferGeometry.
import * as THREE from 'three';
import { hash2 } from './rng.js';

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

export class Vox {
  constructor() { this.map = new Map(); }

  static k(x, y, z) { return `${x},${y},${z}`; }

  set(x, y, z, col) {
    if (col == null) this.map.delete(Vox.k(x, y, z));
    else this.map.set(Vox.k(x, y, z), col);
    return this;
  }

  has(x, y, z) { return this.map.has(Vox.k(x, y, z)); }

  // Fill an inclusive box.
  box(x0, y0, z0, x1, y1, z1, col) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, col);
    return this;
  }

  // Filled ellipsoid centred on (cx,cy,cz) with radii.
  blob(cx, cy, cz, rx, ry, rz, col, jitter = null) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1.0) this.set(x, y, z, jitter ? jitter(x, y, z) : col);
        }
    return this;
  }

  // Bake to geometry. `scale` is the size of one voxel in world units; the model is centred
  // on x/z around (ox, oz) voxels and sits with voxel y=0 at height 0.
  build(scale, ox = 0, oz = 0, shade = 0.06) {
    const pos = [], nor = [], col = [], idx = [];
    const c = new THREE.Color();
    for (const [k, hex] of this.map) {
      const [x, y, z] = k.split(',').map(Number);
      c.setHex(hex);
      if (shade) {
        const j = 1 + (hash2(x * 7 + z * 13, y * 31 + z) - 0.5) * shade;
        c.r = Math.min(1, c.r * j); c.g = Math.min(1, c.g * j); c.b = Math.min(1, c.b * j);
      }
      for (const f of FACES) {
        if (this.map.has(Vox.k(x + f.n[0], y + f.n[1], z + f.n[2]))) continue;
        const base = pos.length / 3;
        for (const v of f.c) {
          pos.push((x + v[0] - ox) * scale, (y + v[1]) * scale, (z + v[2] - oz) * scale);
          nor.push(f.n[0], f.n[1], f.n[2]);
          col.push(c.r, c.g, c.b);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Collects coloured axis-aligned quads/boxes into one geometry (used for terrain chunks).
export class QuadBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.c = new THREE.Color(); }

  quad(p0, p1, p2, p3, n, hex, mul = 1) {
    const base = this.pos.length / 3;
    this.c.setHex(hex);
    const r = this.c.r * mul, g = this.c.g * mul, b = this.c.b * mul;
    for (const p of [p0, p1, p2, p3]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(r, g, b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Top face of a column at height h covering [x0,x1]x[z0,z1].
  top(x0, z0, x1, z1, h, hex) {
    this.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], hex);
  }

  // Vertical side wall from y0 up to y1 on a given edge (dir: 0=+x,1=-x,2=+z,3=-z) of cell (x,z).
  side(x, z, dir, y0, y1, hex, mul = 0.82, size = 1) {
    if (y1 <= y0) return;
    const X0 = x, X1 = x + size, Z0 = z, Z1 = z + size;
    switch (dir) {
      case 0: this.quad([X1, y0, Z0], [X1, y1, Z0], [X1, y1, Z1], [X1, y0, Z1], [1, 0, 0], hex, mul); break;
      case 1: this.quad([X0, y0, Z1], [X0, y1, Z1], [X0, y1, Z0], [X0, y0, Z0], [-1, 0, 0], hex, mul); break;
      case 2: this.quad([X1, y0, Z1], [X1, y1, Z1], [X0, y1, Z1], [X0, y0, Z1], [0, 0, 1], hex, mul); break;
      case 3: this.quad([X0, y0, Z0], [X0, y1, Z0], [X1, y1, Z0], [X1, y0, Z0], [0, 0, -1], hex, mul); break;
    }
  }

  // Solid box from (x0,y0,z0) to (x1,y1,z1), all six faces.
  box(x0, y0, z0, x1, y1, z1, hex) {
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], hex, 0.85);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], hex, 0.85);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], hex);
    this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1], hex, 0.85);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], hex, 0.85);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function mix(a, b, t) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
