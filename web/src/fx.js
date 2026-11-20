// Voxel particle effects: smoke, boat wake, splashes, jumping fish, water sparkles, bird flocks, coins.
import * as THREE from 'three';
import { WATER_Y } from './archipelago.js';

const MAX = 2000;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const col = new THREE.Color();

export class Effects {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, col.setHex(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.parts = [];
    this.flocks = [];
    this.fishTimer = 2;
    this.flockTimer = 4;
    this.sparkTimer = 0;
  }

  clear() { this.parts.length = 0; this.flocks.length = 0; }

  add(p) {
    if (this.parts.length >= MAX) return;
    p.age = 0;
    p.vx ??= 0; p.vy ??= 0; p.vz ??= 0;
    p.g ??= 0;
    p.ry = Math.random() * Math.PI;
    this.parts.push(p);
  }

  smoke(x, y, z, size = 1) {
    this.add({ kind: 'smoke', x: x + (Math.random() - 0.5) * 0.05, y, z, vx: 0.12 + Math.random() * 0.1, vy: 0.45, vz: 0.05,
      life: 2.6, size: 0.1 * size, c: Math.random() < 0.5 ? 0xe8e8e8 : 0xd0d0d0 });
  }

  wake(x, y, z, nx, nz) {
    for (const s of [-1, 1]) {
      this.add({ kind: 'flat', x: x + nx * s * 0.2, y: y + 0.02, z: z + nz * s * 0.2, vx: nx * s * 0.45, vz: nz * s * 0.45,
        life: 1.3, size: 0.13, c: 0xf2fbff });
    }
  }

  splash(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 0.6;
      this.add({ kind: 'drop', x, y, z, vx: Math.cos(a) * sp, vy: 1.6 + Math.random(), vz: Math.sin(a) * sp, g: -7, life: 0.6, size: 0.06, c: 0xe8f6ff });
    }
  }

  fish(x, z, dx, dz) {
    this.add({ kind: 'fish', x, y: WATER_Y, z, vx: dx * 1.4, vy: 2.6, vz: dz * 1.4, g: -7.5, life: 0.72, size: 1, c: 0xd0d8e0, splashAt: true });
    this.splash(x, WATER_Y, z, 5);
  }

  coins(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({ kind: 'coin', x, y, z, vx: Math.cos(a) * 0.8, vy: 2.5 + Math.random() * 1.5, vz: Math.sin(a) * 0.8, g: -6, life: 1.1, size: 0.1, c: 0xf2c14e });
    }
  }

  sparkle(x, z) {
    this.add({ kind: 'spark', x, y: WATER_Y + 0.03, z, life: 0.7 + Math.random() * 0.5, size: 0.07, c: 0xffffff });
  }

  // Background life spawned around the camera's focus point.
  ambient(dt, cx, cz, spread, isWater) {
    this.sparkTimer -= dt;
    let n = 0;
    while (this.sparkTimer <= 0 && n++ < 20) {
      this.sparkTimer += 0.03;
      const x = cx + (Math.random() - 0.5) * spread, z = cz + (Math.random() - 0.5) * spread;
      if (isWater(x, z)) this.sparkle(x, z);
    }
    this.fishTimer -= dt;
    if (this.fishTimer <= 0) {
      this.fishTimer = 1.5 + Math.random() * 3;
      const x = cx + (Math.random() - 0.5) * spread * 0.6, z = cz + (Math.random() - 0.5) * spread * 0.6;
      if (isWater(x, z)) { const a = Math.random() * Math.PI * 2; this.fish(x, z, Math.cos(a) * 0.4, Math.sin(a) * 0.4); }
    }
    this.flockTimer -= dt;
    if (this.flockTimer <= 0) {
      this.flockTimer = 10 + Math.random() * 14;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const n2 = 3 + Math.floor(Math.random() * 5);
      const birds = [];
      for (let i = 0; i < n2; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        birds.push({ ox: -row * 0.7 * dir, oz: side * row * 0.6, ph: Math.random() * 6 });
      }
      this.flocks.push({ x: cx - dir * spread * 0.6, y: 6 + Math.random() * 3, z: cz + (Math.random() - 0.5) * spread * 0.5, vx: dir * 3.2, vz: (Math.random() - 0.5) * 0.8, t: 0, birds });
    }
  }

  update(dt) {
    const parts = this.parts;
    let n = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.splashAt) this.splash(p.x, WATER_Y, p.z, 5);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.age / p.life;
      let sx, sy, sz;
      e.set(0, p.ry, 0);
      switch (p.kind) {
        case 'smoke': {
          const s = p.size * (1 + t * 1.8) * (t > 0.7 ? (1 - t) / 0.3 : 1);
          sx = sy = sz = s;
          e.set(t * 2, p.ry + t * 2, 0);
          p.vx *= 1 - dt * 0.2;
          break;
        }
        case 'flat': {
          const s = p.size * (1 - t);
          sx = sz = s; sy = 0.02;
          p.vx *= 1 - dt * 2.5; p.vz *= 1 - dt * 2.5;
          break;
        }
        case 'spark': {
          const s = p.size * Math.sin(t * Math.PI);
          sx = sz = s; sy = s * 0.4;
          break;
        }
        case 'fish': {
          sx = 0.22; sy = 0.07; sz = 0.07;
          e.set(0, Math.atan2(-p.vz, p.vx), Math.atan2(p.vy, Math.hypot(p.vx, p.vz)));
          break;
        }
        case 'coin':
          sx = sz = p.size; sy = 0.03;
          e.set(p.age * 8, p.ry, 0);
          break;
        default:
          sx = sy = sz = p.size * (1 - t * 0.5);
      }
      parts[n++] = p;
      q.setFromEuler(e);
      m4.compose(p3.set(p.x, p.y, p.z), q, s3.set(sx, sy, sz));
      this.mesh.setMatrixAt(n - 1, m4);
      this.mesh.setColorAt(n - 1, col.setHex(p.c));
    }
    parts.length = n;

    // Bird flocks
    let k = n;
    for (let f = this.flocks.length - 1; f >= 0; f--) {
      const fl = this.flocks[f];
      fl.t += dt;
      fl.x += fl.vx * dt; fl.z += fl.vz * dt;
      if (fl.t > 22) { this.flocks.splice(f, 1); continue; }
      for (const bd of fl.birds) {
        if (k >= MAX - 1) break;
        const flap = Math.sin(fl.t * 9 + bd.ph);
        const bx = fl.x + bd.ox, by = fl.y + Math.sin(fl.t + bd.ph) * 0.1, bz = fl.z + bd.oz;
        q.identity();
        m4.compose(p3.set(bx, by, bz), q, s3.set(0.12, 0.08, 0.12));
        this.mesh.setMatrixAt(k, m4); this.mesh.setColorAt(k++, col.setHex(0x3a3a44));
        for (const s of [-1, 1]) {
          e.set(flap * 0.6 * s, 0, 0);
          q.setFromEuler(e);
          m4.compose(p3.set(bx, by + 0.02, bz + s * 0.13), q, s3.set(0.08, 0.03, 0.18));
          this.mesh.setMatrixAt(k, m4); this.mesh.setColorAt(k++, col.setHex(0x4a4a56));
        }
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
