// Mid-distance level of detail: 64×64-unit chunks of half-resolution voxel terrain with simple block
// trees and buildings baked into one mesh each. They fill the band between the full-detail chunks
// near the camera and the flat overview map, so the world reads as voxels from much further out.
import * as THREE from 'three';
import { QuadBuilder } from './voxel.js';
import { hash2 } from './rng.js';
import { WORLD } from './archipelago.js';
import { tileInfo, tileColor, sideColor, mix, K, WALLS, ROOFS } from './chunks.js';

export const FAR = 64;
const STEP = 2, CELLS = FAR / STEP;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FLOOR = -3.5;

export class FarChunks {
  constructor(arch, root, nearCut) {
    this.a = arch;
    this.root = root;
    this.chunks = new Map();
    this.n = Math.ceil(WORLD / FAR);
    // Hidden wherever the full-detail chunks are loaded.
    const mat = (this.mat = new THREE.MeshLambertMaterial({ vertexColors: true }));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCut = nearCut;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;\nuniform vec4 uCut;')
        .replace('void main() {', 'void main() {\nif (vWXZ.x > uCut.x && vWXZ.x < uCut.z && vWXZ.y > uCut.y && vWXZ.y < uCut.w) discard;');
    };
  }

  key(cx, cz) { return cz * 1000 + cx; }

  _build(cx, cz) {
    const a = this.a, S = CELLS + 2;
    const H = new Float32Array(S * S), Kd = new Uint8Array(S * S), Tw = new Array(S * S);
    const x0 = cx * FAR - STEP, z0 = cz * FAR - STEP;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const [h, k, t] = tileInfo(a, x0 + i * STEP, z0 + j * STEP);
      H[j * S + i] = h; Kd[j * S + i] = k; Tw[j * S + i] = t;
    }
    const q = new QuadBuilder();
    const seed = a.seed & 0xffff;
    for (let j = 1; j < S - 1; j++) for (let i = 1; i < S - 1; i++) {
      const k = j * S + i, h = H[k], kind = Kd[k];
      const x = x0 + i * STEP, z = z0 + j * STEP;
      const col = tileColor(kind, h, x, z);
      q.top(x, z, x + STEP, z + STEP, h, col);
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0] * STEP, nz = z + DIRS[d][1] * STEP;
        const hn = nx < 0 || nz < 0 || nx >= WORLD || nz >= WORLD ? FLOOR : H[(j + DIRS[d][1]) * S + i + DIRS[d][0]];
        if (hn >= h) continue;
        let level = 0;
        for (let top = h; top > hn + 1e-4; top -= 0.5, level++) {
          q.side(x, z, d, Math.max(hn, top - 0.5), top, sideColor(kind, col, level), d < 2 ? 0.86 : 0.78, STEP);
        }
      }
      // Simple scenery.
      const r = hash2(x * 7 + seed, z * 13 - seed), r2 = hash2(x * 31 + 5, z * 17 + seed);
      const ox = x + 0.3 + r2 * 0.6, oz = z + 0.3 + hash2(x + 3, z * 5 + 1) * 0.6;
      const tree = (c, sc) => {
        q.box(ox + 0.45 * sc, h, oz + 0.45 * sc, ox + 0.65 * sc, h + 0.5 * sc, oz + 0.65 * sc, 0x7a5a3a);
        q.box(ox, h + 0.4 * sc, oz, ox + 1.1 * sc, h + 1.5 * sc, oz + 1.1 * sc, c);
      };
      switch (kind) {
        case K.FOREST:
          if (r < 0.8) tree(mix(0x4f8a3a, 0x2f5f3a, Math.floor(r2 * 3) / 2), 0.9 + r2 * 0.4);
          if (r < 0.35) { const s = 0.7 + r * 0.5; q.box(x + 1.1, h + 0.3, z + 0.1, x + 1.1 + 0.8 * s, h + 1.3 * s, z + 0.1 + 0.8 * s, mix(0x5a9a40, 0x3f7a4a, r2)); }
          break;
        case K.GRASS:
          if (r < 0.08) tree(mix(0x6aae45, 0x5a9e3a, r2), 0.9 + r2 * 0.3);
          break;
        case K.ROCK:
          if (r < 0.15) q.box(ox, h, oz, ox + 0.9, h + 0.5 + r2 * 0.5, oz + 0.8, 0x8a867c);
          break;
        case K.TOWN: {
          const t = Tw[k];
          if (!t || r > 0.92) break;
          const centre = 1 - Math.min(1, Math.hypot(x + 1 - t.x, z + 1 - t.z) / t.radius);
          const tall = t.tier === 'city' ? 1.2 + centre * 3.5 * r2 : t.tier === 'large' ? 1 + centre * 1.8 * r2 : 0.8 + r2 * 0.5;
          const wall = WALLS[Math.floor(r * 97) % WALLS.length], roof = ROOFS[Math.floor(r2 * 89) % ROOFS.length];
          const w = 1.3 + r * 0.4;
          const bx = x + (STEP - w) / 2, bz = z + (STEP - w) / 2;
          q.box(bx, h, bz, bx + w, h + tall, bz + w, wall);
          q.box(bx - 0.05, h + tall, bz - 0.05, bx + w + 0.05, h + tall + 0.35, bz + w + 0.05, roof);
          break;
        }
      }
    }
    const mesh = new THREE.Mesh(q.geometry(), this.mat);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.chunks.set(this.key(cx, cz), { cx, cz, mesh });
  }

  _unload(c) {
    this.root.remove(c.mesh);
    c.mesh.geometry.dispose();
    this.chunks.delete(this.key(c.cx, c.cz));
  }

  // Load a square of chunks around (x,z), nearest rings first; returns the fully loaded rect.
  stream(x, z, radius, budgetMs) {
    const ccx = Math.floor(x / FAR), ccz = Math.floor(z / FAR);
    for (const c of [...this.chunks.values()]) {
      if (Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz)) > radius + 1) this._unload(c);
    }
    const t0 = performance.now();
    let full = -1;
    for (let r = 0; r <= radius; r++) {
      let done = true;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < -1 || cz < -1 || cx > this.n || cz > this.n) continue;
        if (this.chunks.has(this.key(cx, cz))) continue;
        if (performance.now() - t0 > budgetMs) { done = false; continue; }
        this._build(cx, cz);
      }
      if (!done) break;
      full = r;
    }
    if (full < 0) return null;
    return { x0: (ccx - full) * FAR, z0: (ccz - full) * FAR, x1: (ccx + full + 1) * FAR, z1: (ccz + full + 1) * FAR };
  }

  clear() { for (const c of [...this.chunks.values()]) this._unload(c); }
}
