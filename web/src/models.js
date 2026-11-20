// Voxel models for scenery props, wildlife, people and the player's boat.
// One voxel = 1/12 of a terrain tile. Models face +x and are centred on x/z = 0.
import { Vox, mix } from './voxel.js';
import { hash2 } from './rng.js';

export const S = 1 / 12;

const cache = new Map();
function cached(key, fn) {
  let g = cache.get(key);
  if (!g) { g = fn(); cache.set(key, g); }
  return g;
}

const dark = (c, t = 0.25) => mix(c, 0x000000, t);
const light = (c, t = 0.25) => mix(c, 0xffffff, t);

// Two-tone leafy fill for foliage.
const leafy = (c) => (x, y, z) => (hash2(x * 3 + y * 17, z * 5 + y) < 0.3 ? dark(c, 0.12) : hash2(x + 9, y * 7 + z * 3) < 0.15 ? light(c, 0.12) : c);

function gableRoof(v, x0, x1, z0, z1, y, col, overhang = 1) {
  // Roof ridge runs along x; slopes down toward +/- z.
  const half = Math.ceil((z1 - z0 + 1) / 2) + overhang;
  const mid = (z0 + z1) / 2;
  for (let i = 0; i < half; i++) {
    const zz0 = Math.round(mid - (half - 1 - i) - 0.5 + (z1 - z0 + 1) % 2 * 0.5);
    const zz1 = Math.round(mid + (half - 1 - i) + 0.5 - (z1 - z0 + 1) % 2 * 0.5);
    const c = i % 2 ? col : dark(col, 0.08);
    v.box(x0 - overhang, y + i, zz0, x1 + overhang, y + i, zz1, c);
  }
}

function house(wall, roof, tall, chim, small = false) {
  const v = new Vox();
  const r = small ? 3 : 4;
  const h = small ? 4 : tall ? 9 : 6;
  v.box(-r, 0, -r, r, h, r, wall);
  // timber base line
  v.box(-r, 0, -r, r, 0, r, dark(wall, 0.18));
  // door and windows
  v.box(-1, 1, r, 0, 3, r, 0x6b4a2b);
  const win = 0x9ad0f0;
  const floors = tall ? [3, 7] : [3];
  for (const fy of floors) {
    if (!small) {
      for (const x of [-3, 2]) v.box(x, fy, -r, x + 1, fy + 1, -r, win);
      for (const z of [-2, 2]) { v.set(-r, fy, z, win); v.set(-r, fy + 1, z, win); v.set(r, fy, z, win); v.set(r, fy + 1, z, win); }
      if (fy !== 3) for (const x of [-3, 2]) v.box(x, fy, r, x + 1, fy + 1, r, win);
      else v.box(2, fy, r, 3, fy + 1, r, win);
    } else {
      v.set(r, 2, 1, win); v.set(-r, 2, -1, win);
    }
  }
  // window box flowers
  if (!small) for (const x of [2, 3]) v.set(x, 2, r + 1, 0xe85050);
  gableRoof(v, -r, r, -r, r, h + 1, roof);
  if (chim) v.box(2, h + 1, -2, 2, h + (small ? 4 : 6), -2, 0x8a5040);
  return v;
}

function chimneyTop(tall, small = false) {
  const h = small ? 4 : tall ? 9 : 6;
  return { x: 2.5 * S, y: (h + (small ? 5 : 7)) * S, z: -1.5 * S };
}

export function propGeometry(p) {
  switch (p.k) {
    case 'tree': return cached(`tree${p.c}`, () => {
      const v = new Vox();
      v.box(-1, 0, -1, 0, 5, 0, 0x7a5232);
      v.blob(-0.5, 8, -0.5, 4.2, 3.6, 4.2, null, leafy(p.c));
      v.blob(1, 11, 0, 2.5, 2, 2.5, null, leafy(light(p.c, 0.06)));
      return v.build(S);
    });
    case 'fruit_tree': return cached(`fruit${p.c}`, () => {
      const v = new Vox();
      v.box(-1, 0, -1, 0, 4, 0, 0x7a5232);
      v.blob(-0.5, 7, -0.5, 3.6, 3, 3.6, null, leafy(0x6aae45));
      for (const [k, s] of v.map) {
        const [x, y, z] = s ? k.split(',').map(Number) : [0, 0, 0];
        if (y >= 5 && hash2(x * 13 + y, z * 7 - y) < 0.12) v.map.set(k, p.c);
      }
      return v.build(S);
    });
    case 'pine': return cached(`pine${p.c}`, () => {
      const v = new Vox();
      v.box(-1, 0, -1, 0, 3, 0, 0x6b4a2b);
      const f = leafy(p.c);
      for (let layer = 0; layer < 4; layer++) {
        const base = 3 + layer * 3;
        const rad = 4 - layer;
        for (let y = 0; y < 3; y++) {
          const rr = rad - y * 0.6;
          for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
            if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= rr * rr) v.set(x, base + y, z, f(x, base + y, z));
          }
        }
      }
      v.box(-1, 15, -1, 0, 16, 0, p.c);
      return v.build(S);
    });
    case 'birch': return cached('birch', () => {
      const v = new Vox();
      for (let y = 0; y <= 8; y++) v.set(0, y, 0, hash2(y, 3) < 0.3 ? 0x303030 : 0xeeeeea);
      v.blob(0, 10, 0, 3, 3.5, 3, null, leafy(0x9acd5a));
      return v.build(S, 0.5, 0.5);
    });
    case 'bush': return cached('bush', () => new Vox().blob(0, 1.5, 0, 2.6, 2.2, 2.6, null, leafy(0x4f9a3a)).build(S));
    case 'flowers': return cached(`flowers${p.c}`, () => {
      const v = new Vox();
      for (const [x, z] of [[-2, -1], [0, 1], [1, -2], [2, 1], [-1, 2]]) {
        v.set(x, 0, z, 0x4f9a3a);
        v.set(x, 1, z, p.c);
      }
      return v.build(S);
    });
    case 'flowerbed': return cached(`bed${p.c}`, () => {
      const v = new Vox();
      v.box(-3, 0, -2, 3, 1, 2, 0x7a5232);
      v.box(-2, 1, -1, 2, 1, 1, 0x5a3c22);
      for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) {
        v.set(x, 2, z, (x + z) & 1 ? p.c : 0x4f9a3a);
      }
      return v.build(S);
    });
    case 'mushroom': return cached('mushroom', () => {
      const v = new Vox();
      v.box(0, 0, 0, 0, 1, 0, 0xf2ead8);
      v.box(-1, 2, -1, 1, 2, 1, 0xd94f4f);
      v.set(0, 3, 0, 0xd94f4f);
      v.set(1, 2, 1, 0xffffff);
      v.set(-1, 2, 0, 0xffffff);
      return v.build(S, 0.5, 0.5);
    });
    case 'rock': return cached('rock', () => {
      const v = new Vox();
      v.blob(0, 0.5, 0, 2.5, 1.8, 2, null, (x, y, z) => (hash2(x, y * 3 + z) < 0.3 ? 0x8a8a8a : 0x9e9e9a));
      return v.build(S);
    });
    case 'log': return cached('log', () => {
      const v = new Vox();
      v.box(-4, 0, -1, 4, 1, 0, 0x7a5232);
      v.box(-4, 0, -1, -4, 1, 0, 0xc9a070);
      v.box(4, 0, -1, 4, 1, 0, 0xc9a070);
      return v.build(S, 0, -0.5);
    });
    case 'reeds': return cached('reeds', () => {
      const v = new Vox();
      for (const [x, z, h] of [[-2, 0, 7], [0, -2, 9], [1, 1, 8], [-1, 2, 6], [2, -1, 7]]) {
        v.box(x, 0, z, x, h, z, 0x6a9a3a);
        if (h > 6) v.box(x, h + 1, z, x, h + 2, z, 0x6b4a2b);
      }
      return v.build(S);
    });
    case 'haybale': return cached('hay', () => {
      const v = new Vox();
      for (let y = 0; y < 5; y++) for (let z = -2; z <= 2; z++) {
        if ((y - 2) ** 2 + z * z <= 5) v.box(-2, y, z, 2, y, z, (y + z) & 1 ? 0xe0c060 : 0xd4b450);
      }
      return v.build(S);
    });
    case 'scarecrow': return cached('scarecrow', () => {
      const v = new Vox();
      v.box(0, 0, 0, 0, 7, 0, 0x7a5232);
      v.box(0, 5, -3, 0, 5, 3, 0x7a5232);
      v.box(0, 4, -1, 0, 6, 1, 0x4f7fd9);
      v.box(0, 7, -1, 0, 8, 0, 0xf2d0a0);
      v.box(-1, 9, -2, 1, 9, 1, 0xc9a050);
      v.set(0, 10, 0, 0xc9a050);
      return v.build(S, 0.5, 0.5);
    });
    case 'house': return cached(`house${p.wall}${p.roof}${!!p.tall}${!!p.chim}`, () => house(p.wall, p.roof, p.tall, p.chim).build(S));
    case 'hut': return cached(`hut${p.wall}${p.roof}`, () => house(p.wall, 0xc9a050, false, true, true).build(S));
    case 'warehouse': return cached(`ware${p.roof}`, () => {
      const v = new Vox();
      v.box(-5, 0, -5, 5, 7, 5, 0xa0663c);
      for (let x = -5; x <= 5; x += 2) v.box(x, 0, -5, x, 7, -5, 0x8a5432);
      for (let x = -5; x <= 5; x += 2) v.box(x, 0, 5, x, 7, 5, 0x8a5432);
      v.box(-2, 0, 5, 1, 5, 5, 0x4a3020);
      gableRoof(v, -5, 5, -5, 5, 8, p.roof, 0);
      return v.build(S);
    });
    case 'church': return cached(`church${p.wall}${p.roof}`, () => {
      const v = new Vox();
      v.box(-5, 0, -3, 2, 7, 3, p.wall);
      for (const x of [-3, 0]) { v.box(x, 3, -3, x, 5, -3, 0x9ad0f0); v.box(x, 3, 3, x, 5, 3, 0x9ad0f0); }
      gableRoof(v, -5, 2, -3, 3, 8, p.roof);
      v.box(3, 0, -2, 6, 13, 2, p.wall);
      v.box(4, 10, -2, 5, 11, -2, 0x303030);
      v.box(4, 10, 2, 5, 11, 2, 0x303030);
      v.box(6, 0, -1, 6, 2, 0, 0x6b4a2b);
      for (let i = 0; i < 5; i++) v.box(3 + i * 0.5 | 0, 14 + i, -2 + Math.floor(i / 2), 6 - Math.floor(i / 2), 14 + i, 2 - Math.floor(i / 2), p.roof);
      v.box(4, 19, 0, 4, 21, 0, 0xf2c14e);
      v.box(4, 20, -1, 4, 20, 1, 0xf2c14e);
      return v.build(S);
    });
    case 'tower': return cached(`tower${p.roof}`, () => {
      const v = new Vox();
      const stone = (x, y, z) => (hash2(x * 5 + y, z * 3 + y * 7) < 0.3 ? 0xa8a090 : 0xbcb4a2);
      for (let y = 0; y <= 15; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) === 3 || Math.abs(z) === 3 || y === 15) v.set(x, y, z, stone(x, y, z));
      }
      for (let x = -3; x <= 3; x += 2) for (const z of [-3, 3]) { v.set(x, 16, z, stone(x, 16, z)); v.set(z, 16, x, stone(z, 16, x)); }
      v.box(3, 0, -1, 3, 3, 0, 0x6b4a2b);
      for (const y of [6, 11]) { v.set(3, y, 0, 0x303030); v.set(-3, y, 0, 0x303030); v.set(0, y, 3, 0x303030); }
      v.box(0, 16, 0, 0, 20, 0, 0x6b4a2b);
      v.box(0, 19, 1, 0, 20, 3, p.roof);
      return v.build(S, 0, 0);
    });
    case 'well': return cached(`well${p.roof}`, () => {
      const v = new Vox();
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) === 2 || Math.abs(z) === 2) v.box(x, 0, z, x, 2, z, (x + z) & 1 ? 0x9e9e9a : 0xb0b0aa);
        else v.set(x, 1, z, 0x2a5a8a);
      }
      v.box(-2, 3, 0, -2, 6, 0, 0x7a5232);
      v.box(2, 3, 0, 2, 6, 0, 0x7a5232);
      v.box(-2, 7, -2, 2, 7, 2, p.roof);
      v.box(-1, 8, -1, 1, 8, 1, p.roof);
      v.set(0, 4, 0, 0x7a5232);
      return v.build(S);
    });
    case 'shrine': return cached(`shrine${p.wall}${p.roof}`, () => {
      const v = new Vox();
      v.box(-3, 0, -3, 3, 0, 3, 0xa8a090);
      v.box(-2, 1, -2, 2, 5, 2, p.wall);
      v.box(2, 1, 0, 2, 3, 0, 0x6b4a2b);
      gableRoof(v, -2, 2, -2, 2, 6, p.roof);
      v.box(0, 9, 0, 0, 10, 0, 0xf2c14e);
      return v.build(S);
    });
    case 'ruin': return cached('ruin', () => {
      const v = new Vox();
      const stone = (x, y, z) => (hash2(x * 5 + y, z * 3) < 0.35 ? 0x9a9488 : 0xb0a898);
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        if (Math.abs(x) !== 4 && Math.abs(z) !== 4) continue;
        const h = Math.floor(hash2(x + 20, z + 40) * 7);
        for (let y = 0; y <= h; y++) v.set(x, y, z, stone(x, y, z));
      }
      for (let i = 0; i < 6; i++) v.set(Math.floor(hash2(i, 1) * 7) - 3, 0, Math.floor(hash2(i, 2) * 7) - 3, 0x5a8a3a);
      return v.build(S);
    });
    case 'stall': return cached(`stall${p.c}`, () => {
      const v = new Vox();
      v.box(-3, 0, -2, 3, 3, 2, 0x9a6a3a);
      for (const [x, z] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) v.box(x, 4, z, x, 7, z, 0x6b4a2b);
      for (let x = -4; x <= 4; x++) v.box(x, 8, -3, x, 8, 3, (x & 1) ? p.c : 0xffffff);
      const goods = [0xe04040, 0xf2c14e, 0x5fae5f, 0xf28c3c];
      for (let x = -2; x <= 2; x++) v.set(x, 4, 0, goods[(x + 2) % 4]);
      return v.build(S);
    });
    case 'crate': return cached('crate', () => crateVox().build(S, 0.5, 0.5));
    case 'barrel': return cached('barrel', () => {
      const v = new Vox();
      for (let y = 0; y < 4; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
        if (Math.abs(x) + Math.abs(z) === 2 && (y === 0 || y === 3)) continue;
        v.set(x, y, z, y === 1 ? 0x5a4030 : 0x8a5a30);
      }
      return v.build(S, 0.5, 0.5);
    });
    case 'lamp': return cached('lamp', () => {
      const v = new Vox();
      v.box(0, 0, 0, 0, 8, 0, 0x303438);
      v.box(-1, 9, -1, 1, 10, 1, 0xffe9a0);
      v.box(-1, 11, -1, 1, 11, 1, 0x303438);
      return v.build(S, 0.5, 0.5, 0);
    });
    case 'bench': return cached('bench', () => {
      const v = new Vox();
      v.box(-3, 2, -1, 3, 2, 0, 0x9a6a3a);
      v.box(-3, 3, -1, 3, 4, -1, 0x9a6a3a);
      for (const x of [-3, 3]) v.box(x, 0, -1, x, 1, 0, 0x303438);
      return v.build(S);
    });
    case 'flag': return cached(`flag${p.c}`, () => {
      const v = new Vox();
      v.box(0, 0, 0, 0, 12, 0, 0xdddddd);
      v.box(0, 9, 1, 0, 12, 4, p.c);
      return v.build(S, 0.5, 0.5);
    });
    case 'windmill': return cached('windmill', () => {
      const v = new Vox();
      for (let y = 0; y <= 13; y++) {
        const r = y < 5 ? 3 : y < 10 ? 2 : 2;
        for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
          if (x * x + z * z <= r * r + 1) v.set(x, y, z, y % 4 === 0 ? 0xe0dccc : 0xf2ead8);
        }
      }
      v.box(3, 0, 0, 3, 2, 0, 0x6b4a2b);
      v.blob(0, 14.5, 0, 2.6, 2, 2.6, 0x8b3a3a);
      v.box(3, 13, 0, 3, 13, 0, 0x303030);
      return v.build(S);
    });
    case 'lighthouse': return cached('lighthouse', () => {
      const v = new Vox();
      for (let y = 0; y <= 22; y++) {
        const r = 3.4 - y * 0.06;
        for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
          if ((x) ** 2 + (z) ** 2 <= r * r) v.set(x, y, z, Math.floor(y / 4) % 2 ? 0xd94f4f : 0xf7f3ea);
        }
      }
      v.box(-2, 23, -2, 2, 23, 2, 0x303438);
      v.box(-1, 24, -1, 1, 26, 1, 0xfff2a0);
      v.blob(0, 27.5, 0, 2.2, 1.6, 2.2, 0x303438);
      v.box(3, 0, 0, 3, 2, 0, 0x6b4a2b);
      return v.build(S);
    });
    case 'crane': return cached('crane', () => {
      const v = new Vox();
      v.box(-1, 0, -1, 1, 1, 1, 0x6b4a2b);
      v.box(0, 2, 0, 0, 15, 0, 0x9a6a3a);
      v.box(-3, 15, 0, 9, 15, 0, 0x9a6a3a);
      v.box(9, 11, 0, 9, 14, 0, 0x303030);
      v.box(8, 9, -1, 10, 10, 1, 0x9a6a3a);
      return v.build(S, 0.5, 0.5);
    });
    case 'blanket': return cached('blanket', () => {
      const v = new Vox();
      for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) v.set(x, 0, z, (x + z) & 1 ? 0xd94f4f : 0xf7f3ea);
      v.box(2, 1, -4, 3, 2, -3, 0xb08040);
      v.set(-3, 1, 2, 0xe04040);
      return v.build(S);
    });
    case 'tent': return cached(`tent${p.c}`, () => {
      const v = new Vox();
      for (let i = 0; i < 5; i++) v.box(-4, i, -4 + i, 4, i, 4 - i, i === 4 ? dark(p.c, 0.2) : p.c);
      v.box(4, 0, -1, 4, 2, 1, 0x3a2a1a);
      return v.build(S, 0, 0);
    });
    case 'campfire': return cached('campfire', () => {
      const v = new Vox();
      for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [1, -1], [-1, 1]]) v.set(x, 0, z, 0x8a8a8a);
      v.box(-1, 0, 0, 1, 0, 0, 0x6b4a2b);
      v.box(0, 0, -1, 0, 0, 1, 0x6b4a2b);
      return v.build(S);
    });
    case 'standing_stone': return cached('stone', () => {
      const v = new Vox();
      const h = 7;
      v.box(-1, 0, -1, 0, h, 0, 0x8e8e90);
      v.box(-1, h + 1, -1, -1, h + 1, 0, 0x8e8e90);
      v.set(0, 2, -1, 0x6a9a4a);
      return v.build(S, -0.5, -0.5);
    });
    case 'beehive': return cached('hive', () => {
      const v = new Vox();
      v.box(-1, 0, -1, -1, 1, -1, 0x6b4a2b);
      v.box(1, 0, 1, 1, 1, 1, 0x6b4a2b);
      v.box(-2, 2, -2, 2, 4, 2, 0xe8c060);
      v.box(-2, 5, -2, 2, 5, 2, 0xd0a840);
      v.box(-1, 6, -1, 1, 7, 1, 0xe8c060);
      v.set(2, 3, 0, 0x3a2a1a);
      return v.build(S);
    });
  }
  return cached('missing', () => new Vox().box(0, 0, 0, 1, 1, 1, 0xff00ff).build(S));
}

export function crateVox() {
  const v = new Vox();
  for (let x = -1; x <= 1; x++) for (let y = 0; y <= 2; y++) for (let z = -1; z <= 1; z++) {
    const edge = (Math.abs(x) === 1) + (y !== 1) + (Math.abs(z) === 1) >= 2;
    v.set(x, y, z, edge ? 0x9a6a30 : 0xc9a060);
  }
  return v;
}

// Animated parts that cannot be instanced.
export function windmillSails() {
  return cached('sails', () => {
    const v = new Vox();
    for (let i = -8; i <= 8; i++) {
      if (i === 0) continue;
      v.set(0, i, 0, 0x6b4a2b);
      v.set(0, 0, i, 0x6b4a2b);
      if (Math.abs(i) > 2) { v.set(0, i, i > 0 ? 1 : -1, 0xf7f3ea); v.set(0, i > 0 ? -1 : 1, i, 0xf7f3ea); }
    }
    v.set(0, 0, 0, 0x303030);
    return v.build(S, 0.5, 0.5);
  });
}
export const WINDMILL_HUB = { x: 3.6 * S, y: 13.5 * S, z: 0 };

export function flameGeometry() {
  return cached('flame', () => {
    const v = new Vox();
    v.box(-1, 0, -1, 0, 1, 0, 0xf28c3c);
    v.box(-1, 2, -1, 0, 2, 0, 0xf2c14e);
    v.set(0, 3, -1, 0xfff2a0);
    return v.build(S, -0.5, -0.5, 0);
  });
}

export { chimneyTop };

// ---------------------------------------------------------------- critters

// People: body and a separate arm so they can wave.
export function personGeometry(d, sitting) {
  const k = `person${d.shirt}${d.skin}${d.hair}${d.pants}${sitting}`;
  return cached(k, () => {
    const v = new Vox();
    let y = 0;
    if (sitting) {
      v.box(0, 0, -1, 1, 0, -1, d.pants);
      v.box(0, 0, 1, 1, 0, 1, d.pants);
      v.box(-1, 0, -1, -1, 0, 1, d.pants);
      y = 1;
    } else {
      v.box(0, 0, -1, 0, 1, -1, d.pants);
      v.box(0, 0, 1, 0, 1, 1, d.pants);
      v.box(-1, 0, -1, -1, 1, -1, d.pants);
      v.box(-1, 0, 1, -1, 1, 1, d.pants);
      v.set(-1, 2, 0, d.pants); v.set(0, 2, 0, d.pants);
      v.box(-1, 2, -1, 0, 2, 1, d.pants);
      y = 3;
    }
    v.box(-1, y, -1, 0, y + 2, 1, d.shirt);
    v.box(-1, y, -2, 0, y + 2, -2, dark(d.shirt, 0.15));
    v.set(0, y, -2, d.skin);
    v.box(-1, y + 3, -1, 0, y + 4, 1, d.skin);
    v.set(0, y + 4, -1, 0x202020);
    v.set(0, y + 4, 1, 0x202020);
    v.box(-1, y + 5, -1, 0, y + 5, 1, d.hair);
    v.box(-1, y + 3, -1, -1, y + 4, 1, d.hair);
    return v.build(S, 0, 0);
  });
}
export function armGeometry(d) {
  return cached(`arm${d.shirt}${d.skin}`, () => {
    const v = new Vox();
    v.box(0, -2, 0, 0, -1, 0, d.shirt);
    v.set(0, -3, 0, d.skin);
    return v.build(S, 0.5, 0.5);
  });
}
// Shoulder pivot in model space for the right arm (z = +2).
export function shoulder(sitting) { return { x: -0.5 * S, y: ((sitting ? 1 : 3) + 3) * S, z: 2.5 * S }; }

function quad(v, { len, h, w, body, legs, head, legH = 2 }) {
  // Generic quadruped: body from x=-len..len-1.
  const z0 = -Math.floor(w / 2), z1 = z0 + w - 1;
  for (const x of [-len, len - 1]) for (const z of [z0, z1]) v.box(x, 0, z, x, legH - 1, z, legs);
  v.box(-len, legH, z0, len - 1, legH + h - 1, z1, body);
  return { z0, z1, top: legH + h - 1 };
}

export function critterGeometry(d) {
  switch (d.k) {
    case 'duck': return cached('duck', () => {
      const v = new Vox();
      v.box(-2, 0, -1, 1, 1, 1, 0x8a6a4a);
      v.box(-2, 1, -1, -1, 1, 1, 0x6a5038);
      v.box(-3, 1, 0, -3, 1, 0, 0x6a5038);
      v.box(1, 2, -1, 2, 3, 0, 0x2f7a4a);
      v.set(3, 2, -1, 0xf2a03c); v.set(3, 2, 0, 0xf2a03c);
      v.set(2, 3, -1, 0x101010);
      return v.build(S, 0, -0.5);
    });
    case 'duckling': return cached('duckling', () => {
      const v = new Vox();
      v.box(-1, 0, 0, 0, 0, 0, 0xf2d84e);
      v.set(1, 1, 0, 0xf2d84e);
      v.set(2, 1, 0, 0xf2a03c);
      return v.build(S, 0, 0.5);
    });
    case 'swan': return cached('swan', () => {
      const v = new Vox();
      v.box(-3, 0, -1, 1, 1, 1, 0xf7f7f2);
      v.box(-4, 1, 0, -4, 2, 0, 0xf7f7f2);
      v.box(-2, 2, -1, 0, 2, 1, 0xeaeae4);
      v.box(2, 1, 0, 2, 5, 0, 0xf7f7f2);
      v.set(3, 5, 0, 0xf7f7f2);
      v.set(4, 5, 0, 0xf28c3c);
      v.set(3, 5, -1, 0x101010);
      return v.build(S, 0, 0.5);
    });
    case 'heron': return cached('heron', () => {
      const v = new Vox();
      v.box(0, 0, 0, 0, 3, 0, 0x5a5a50);
      v.box(-2, 4, -1, 1, 5, 0, 0x9aa2aa);
      v.box(-3, 5, -1, -2, 5, 0, 0x6a727a);
      v.box(1, 6, 0, 1, 7, 0, 0xd8dce0);
      v.set(2, 8, 0, 0xd8dce0);
      v.box(3, 8, 0, 4, 8, 0, 0xe8c040);
      v.set(1, 8, 0, 0x202020);
      return v.build(S, 0, 0.5);
    });
    case 'deer': return cached(`deer${!!d.antlers}`, () => {
      const v = new Vox();
      const { top } = quad(v, { len: 3, h: 3, w: 2, body: 0xa86a3a, legs: 0x7a4a28, legH: 3 });
      v.box(-3, top, 0, -3, top, 1, 0xf7f3ea);
      v.box(2, top + 1, 0, 3, top + 2, 1, 0xa86a3a);
      v.box(3, top + 3, 0, 4, top + 4, 1, 0xa86a3a);
      v.set(5, top + 3, 0, 0x202020); v.set(5, top + 3, 1, 0x202020);
      if (d.antlers) {
        for (const z of [-1, 2]) { v.box(3, top + 5, z, 3, top + 7, z, 0xd8c8a0); v.set(4, top + 7, z, 0xd8c8a0); }
      }
      return v.build(S, 0, 1);
    });
    case 'sheep': return cached('sheep', () => {
      const v = new Vox();
      for (const x of [-2, 1]) for (const z of [-1, 1]) v.box(x, 0, z, x, 1, z, 0x303030);
      v.blob(-0.5, 3, 0, 3, 1.8, 2.2, null, (x, y, z) => (hash2(x * 7 + y, z * 3 + y) < 0.3 ? 0xe8e4da : 0xf7f5ee));
      v.box(3, 3, -1, 4, 4, 1, 0x303030);
      return v.build(S);
    });
    case 'cow': return cached('cow', () => {
      const v = new Vox();
      quad(v, { len: 4, h: 3, w: 4, body: 0xf2f2ee, legs: 0xf2f2ee, legH: 3 });
      for (const [k, s] of v.map) {
        const [x, y, z] = k.split(',').map(Number);
        if (y >= 3 && hash2(Math.floor(x / 2) + 3, Math.floor(z / 2) * 5 + Math.floor(y / 2)) < 0.35) v.map.set(k, 0x303030);
      }
      v.box(4, 4, -1, 5, 6, 0, 0xf2f2ee);
      v.box(6, 4, -1, 6, 4, 0, 0xe8a0a0);
      v.set(5, 7, -2, 0xe8e0c0); v.set(5, 7, 1, 0xe8e0c0);
      v.box(-5, 3, 0, -5, 5, 0, 0x303030);
      return v.build(S);
    });
    case 'goat': return cached('goat', () => {
      const v = new Vox();
      const { top } = quad(v, { len: 2, h: 2, w: 2, body: 0xd8d0c0, legs: 0x8a8070, legH: 2 });
      v.box(2, top, 0, 3, top + 2, 1, 0xd8d0c0);
      v.set(4, top + 1, 0, 0x5a5048);
      v.box(2, top + 3, 0, 1, top + 4, 0, 0x6a6058);
      v.box(2, top + 3, 1, 1, top + 4, 1, 0x6a6058);
      v.set(3, top - 1, 0, 0xb0a890);
      return v.build(S, 0, 1);
    });
    case 'rabbit': return cached('rabbit', () => {
      const v = new Vox();
      v.box(-1, 0, 0, 1, 1, 1, 0x9a8670);
      v.set(-2, 1, 0, 0xffffff);
      v.box(2, 1, 0, 2, 2, 1, 0x9a8670);
      v.box(1, 3, 0, 1, 4, 0, 0x9a8670);
      v.box(1, 3, 1, 1, 4, 1, 0xd0a0a0);
      return v.build(S, 0, 1);
    });
    case 'fox': return cached('fox', () => {
      const v = new Vox();
      const { top } = quad(v, { len: 2, h: 2, w: 2, body: 0xe0763a, legs: 0x302820, legH: 1 });
      v.box(2, top - 1, 0, 3, top + 1, 1, 0xe0763a);
      v.set(4, top - 1, 0, 0x302820); v.set(4, top - 1, 1, 0x302820);
      v.set(3, top + 2, 0, 0x302820); v.set(3, top + 2, 1, 0x302820);
      v.box(-4, top - 1, 0, -3, top, 1, 0xe0763a);
      v.box(-5, top - 1, 0, -5, top, 1, 0xffffff);
      return v.build(S, 0, 1);
    });
    case 'hedgehog': return cached('hedgehog', () => {
      const v = new Vox();
      v.blob(0, 0.5, 0, 2, 1.6, 1.6, null, (x, y, z) => (hash2(x * 5 + y, z) < 0.5 ? 0x5a4030 : 0x7a5a40));
      v.set(2, 0, 0, 0xc0a080);
      v.set(3, 0, 0, 0x202020);
      return v.build(S);
    });
    case 'butterfly': return cached(`bfly${d.c}`, () => {
      const v = new Vox();
      v.box(-1, 0, -2, 1, 0, -1, d.c);
      v.box(-1, 0, 1, 1, 0, 2, d.c);
      v.box(-1, 0, 0, 1, 0, 0, 0x303030);
      return v.build(S * 0.6, 0, 0.5);
    });
    case 'gull': return cached('gull', () => {
      const v = new Vox();
      v.box(-2, 0, 0, 2, 1, 0, 0xffffff);
      v.box(-1, 1, -3, 0, 1, -1, 0xb0b8c0);
      v.box(-1, 1, 1, 0, 1, 3, 0xb0b8c0);
      v.set(3, 1, 0, 0xf2c14e);
      return v.build(S, 0, 0.5);
    });
    case 'rowboat': return cached(`row${d.shirt}${d.skin}${d.hair}`, () => {
      const v = new Vox();
      for (let x = -4; x <= 4; x++) {
        const hw = Math.abs(x) >= 4 ? 0 : Math.abs(x) >= 3 ? 1 : 2;
        v.box(x, 0, -hw, x, 1, hw, 0x8a5a30);
        if (hw > 0 && Math.abs(x) < 4) v.box(x, 1, -hw + 1, x, 1, hw - 1, null);
      }
      v.box(-1, 1, -1, 0, 3, 1, d.shirt);
      v.box(-1, 4, -1, 0, 5, 1, d.skin);
      v.box(-1, 6, -1, 0, 6, 1, d.hair);
      v.set(0, 5, -1, 0x202020); v.set(0, 5, 1, 0x202020);
      v.box(0, 2, -5, 0, 2, -3, 0xc9a070);
      v.box(0, 2, 3, 0, 2, 5, 0xc9a070);
      return v.build(S);
    });
    case 'otter': return cached('otter', () => {
      const v = new Vox();
      v.box(-2, 0, 0, 1, 1, 1, 0x6a4a30);
      v.box(2, 1, 0, 2, 2, 1, 0x6a4a30);
      v.set(3, 1, 0, 0xc0a080); v.set(3, 1, 1, 0xc0a080);
      v.set(2, 3, 0, 0x4a3020);
      v.box(-4, 0, 0, -3, 0, 0, 0x5a3a20);
      return v.build(S, 0, 1);
    });
    case 'cat': return cached('cat', () => {
      const v = new Vox();
      const { top } = quad(v, { len: 2, h: 1, w: 2, body: 0xe09040, legs: 0xe09040, legH: 1 });
      v.box(2, top, 0, 2, top + 1, 1, 0xe09040);
      v.set(2, top + 2, 0, 0xe09040); v.set(2, top + 2, 1, 0xe09040);
      v.box(-3, top, 0, -3, top + 2, 0, 0xc07030);
      return v.build(S, 0, 1);
    });
    case 'dog': return cached('dog', () => {
      const v = new Vox();
      const { top } = quad(v, { len: 2, h: 2, w: 2, body: 0xb08050, legs: 0x8a6038, legH: 2 });
      v.box(2, top, 0, 3, top + 1, 1, 0xb08050);
      v.set(4, top, 0, 0x202020);
      v.set(2, top + 1, -1, 0x6a4a30); v.set(2, top + 1, 2, 0x6a4a30);
      v.box(-3, top, 0, -3, top + 1, 0, 0xb08050);
      return v.build(S, 0, 1);
    });
    case 'hen': return cached('hen', () => {
      const v = new Vox();
      v.box(0, 0, 0, 0, 0, 0, 0xe8a040);
      v.box(-1, 1, -1, 1, 2, 0, 0xf7f3ea);
      v.set(-2, 2, -1, 0xf7f3ea);
      v.box(1, 3, -1, 1, 3, 0, 0xf7f3ea);
      v.set(1, 4, -1, 0xd94f4f);
      v.set(2, 3, -1, 0xf2a03c);
      return v.build(S, 0, -0.5);
    });
  }
  return cached('missing_c', () => new Vox().box(0, 0, 0, 1, 1, 1, 0xff00ff).build(S));
}

export function fishingRod() {
  return cached('rod', () => {
    const v = new Vox();
    for (let i = 0; i < 9; i++) v.set(1 + i, 2 + Math.floor(i * 0.8), 0, 0x6b4a2b);
    return v.build(S, 0, 0.5);
  });
}

// ---------------------------------------------------------------- the player's boat

export const BOAT_S = 1 / 10;

export function boatGeometry() {
  return cached('boat', () => {
    const v = new Vox();
    const red = 0xc0453a;
    for (let x = -7; x <= 8; x++) {
      const hw = x > 3 ? Math.max(0, Math.round(3 - (x - 3) * 0.7)) : x < -6 ? 2 : 3;
      for (let y = 0; y <= 3; y++) {
        const w = y === 0 ? Math.max(0, hw - 1) : hw;
        const c = y === 2 ? 0xf2f2f2 : y === 0 ? dark(red, 0.25) : red;
        v.box(x, y, -w, x, y, w, c);
      }
      v.box(x, 3, -hw + 1, x, 3, hw - 1, 0xd9b47a);
    }
    // cabin
    v.box(-5, 4, -2, 0, 7, 2, 0xf2ead8);
    for (const z of [-2, 2]) for (const x of [-4, -2]) v.set(x, 6, z, 0x9ad0f0);
    v.box(0, 6, -1, 0, 6, 1, 0x9ad0f0);
    v.box(-6, 8, -3, 1, 8, 3, 0x4f6f8f);
    // chimney
    v.box(-3, 9, 0, -3, 12, 0, 0x303030);
    v.set(-3, 11, 0, red);
    // stern rail
    v.box(-7, 4, -2, -7, 4, 2, 0x8a5a30);
    // flag pole
    v.box(-7, 5, 0, -7, 10, 0, 0xdddddd);
    return v.build(BOAT_S, 0, 0);
  });
}
export function boatFlag() {
  return cached('boatflag', () => new Vox().box(0, 0, 0, 2, 1, 0, 0xf2c14e).set(3, 1, 0, 0xf2c14e).build(BOAT_S, 0, 0.5));
}
export const BOAT_CHIMNEY = { x: -2.5 * BOAT_S, y: 13 * BOAT_S, z: 0.5 * BOAT_S };

// ---------------------------------------------------------------- fleet models (company colours)

const HULL = 0xc0453a, HULL_D = dark(0xc0453a, 0.25), WHITE = 0xf2f2f2, DECK = 0xd9b47a, CABIN = 0xf2ead8, GLASS = 0x9ad0f0, ROOF = 0x4f6f8f, BLACK = 0x303030;

// Hull with a pointed bow. len in voxels, hw = half width, h = layers.
function hull(v, len, hw, h, { bow = 4, stern = 1, deck = DECK, stripe = 1 } = {}) {
  const x0 = -Math.floor(len / 2), x1 = x0 + len - 1;
  for (let x = x0; x <= x1; x++) {
    const fromBow = x1 - x, fromStern = x - x0;
    let w = hw;
    if (fromBow < bow) w = Math.max(0, Math.round(hw * (fromBow + 0.5) / bow));
    if (fromStern < stern) w = Math.max(1, hw - (stern - fromStern));
    for (let y = 0; y < h; y++) {
      const ww = y === 0 ? Math.max(0, w - 1) : w;
      const c = y === h - 1 - stripe ? WHITE : y === 0 ? HULL_D : HULL;
      v.box(x, y, -ww, x, y, ww, c);
    }
    if (w > 1) v.box(x, h - 1, -w + 1, x, h - 1, w - 1, deck);
  }
  return { x0, x1 };
}

function cabin(v, x0, x1, hw, y, floors, roof = ROOF) {
  for (let f = 0; f < floors; f++) {
    const yy = y + f * 3;
    v.box(x0, yy, -hw, x1, yy + 2, hw, CABIN);
    for (let x = x0 + 1; x < x1; x += 2) { v.set(x, yy + 1, -hw, GLASS); v.set(x, yy + 1, hw, GLASS); }
    v.box(x1, yy + 1, -hw + 1, x1, yy + 1, hw - 1, GLASS);
  }
  v.box(x0 - 1, y + floors * 3, -hw - 1, x1 + 1, y + floors * 3, hw + 1, roof);
}

function funnel(v, x, y, h, w = 0) {
  v.box(x, y, -w, x + w, y + h, w, BLACK);
  v.box(x, y + h - 1, -w, x + w, y + h - 1, w, HULL);
}

export const SHIP_S = 1 / 10;
// Where each model's hold sits (for the cargo-level block), in voxels: [x0, x1, hw, y].
export const HOLD = {
  mallard: [-6, 4, 2, 3], gannet: [-4, 9, 3, 5], heron: [-7, 6, 3, 3], albatross: [-12, 18, 5, 7], osprey: [-20, 22, 6, 8],
};

export function shipGeometry(id) {
  return cached(`ship_${id}`, () => {
    const v = new Vox();
    switch (id) {
      case 'wren': {
        hull(v, 13, 2, 3, { bow: 4 });
        cabin(v, -4, 0, 1, 3, 1);
        funnel(v, -3, 7, 3);
        v.box(-6, 3, 0, -6, 7, 0, 0xdddddd);
        v.box(-6, 6, 1, -6, 7, 2, 0xf2c14e);
        break;
      }
      case 'mallard': {
        hull(v, 18, 3, 3, { bow: 3, stern: 1 });
        v.box(-7, 3, -3, 5, 3, -3, HULL); v.box(-7, 3, 3, 5, 3, 3, HULL);
        cabin(v, -9, -8, 2, 3, 1);
        funnel(v, -9, 7, 2);
        break;
      }
      case 'puffin': {
        hull(v, 24, 4, 4, { bow: 6 });
        cabin(v, -8, 5, 3, 4, 2);
        v.box(3, 10, -2, 6, 12, 2, CABIN);
        v.box(6, 11, -1, 6, 11, 1, GLASS);
        funnel(v, -3, 11, 4, 1);
        for (const z of [-4, 4]) v.box(-6, 4, z, -4, 5, z, 0xf28c3c);
        break;
      }
      case 'gannet': {
        hull(v, 30, 4, 5, { bow: 7 });
        v.box(-5, 5, -4, 10, 5, -4, HULL); v.box(-5, 5, 4, 10, 5, 4, HULL);
        cabin(v, -14, -9, 3, 5, 2);
        funnel(v, -12, 12, 4, 1);
        v.box(11, 5, 0, 11, 12, 0, 0x6b4a2b);
        v.box(3, 6, 0, 3, 10, 0, 0x6b4a2b);
        break;
      }
      case 'kingfisher': {
        hull(v, 20, 2, 3, { bow: 6, deck: 0xe8e0d0 });
        v.box(-7, 3, -2, 4, 5, 2, CABIN);
        for (let x = -6; x <= 3; x++) { v.set(x, 4, -2, GLASS); v.set(x, 4, 2, GLASS); }
        v.box(-8, 6, -2, 5, 6, 2, 0x2e6a8a);
        v.box(5, 3, -1, 6, 4, 1, GLASS);
        break;
      }
      case 'heron': {
        hull(v, 24, 3, 3, { bow: 3, stern: 1, deck: 0x8a8a80 });
        v.box(-8, 3, -3, 7, 3, -3, HULL); v.box(-8, 3, 3, 7, 3, 3, HULL);
        cabin(v, -11, -9, 2, 3, 2);
        funnel(v, -11, 10, 2);
        break;
      }
      case 'albatross': {
        hull(v, 52, 6, 7, { bow: 10, stern: 2 });
        v.box(-13, 7, -6, 19, 7, -6, HULL); v.box(-13, 7, 6, 19, 7, 6, HULL);
        cabin(v, -24, -16, 5, 7, 3);
        funnel(v, -21, 17, 5, 2);
        for (const x of [-6, 6]) { v.box(x, 7, 0, x, 18, 0, 0xf2c14e); v.box(x - 4, 18, 0, x + 4, 18, 0, 0xf2c14e); }
        v.box(22, 7, 0, 22, 11, 0, BLACK);
        break;
      }
      case 'swift': {
        hull(v, 26, 3, 3, { bow: 8, deck: 0xe8e0d0 });
        v.box(-9, 3, -3, 6, 6, 3, CABIN);
        for (let x = -8; x <= 5; x++) { v.set(x, 5, -3, GLASS); v.set(x, 5, 3, GLASS); }
        v.box(-10, 7, -3, 7, 7, 3, 0x2e6a8a);
        v.box(6, 4, -2, 8, 5, 2, GLASS);
        // foils
        for (const x of [-7, 7]) { v.box(x, -2, -5, x + 1, -2, 5, 0x606060); v.box(x, -1, -4, x, -1, -4, 0x606060); v.box(x, -1, 4, x, -1, 4, 0x606060); }
        break;
      }
      case 'osprey': {
        hull(v, 66, 7, 8, { bow: 12, stern: 2 });
        cabin(v, -31, -24, 6, 8, 4);
        funnel(v, -28, 21, 5, 2);
        break;
      }
      default:
        hull(v, 12, 2, 3);
    }
    return v.build(SHIP_S);
  });
}

// Static container stacks for the container ship (drawn always; cargo block shows load too).
export function containerStacks() {
  return cached('containers', () => {
    const v = new Vox();
    const cols = [0xd94f4f, 0x4f7fd9, 0x5fae5f, 0xf2c14e, 0xf28c3c, 0x8a5aa8];
    for (let x = -20; x <= 20; x += 4) for (let z = -5; z <= 5; z += 2) for (let y = 0; y < 3; y++) {
      if (hash2(x * 3 + y, z * 7) < 0.2 && y === 2) continue;
      v.box(x, 8 + y * 2, z, x + 3, 9 + y * 2, z + 1, cols[Math.floor(hash2(x + y * 11, z + 5) * cols.length)]);
    }
    return v.build(SHIP_S);
  });
}

// ---------------------------------------------------------------- town buildings

export function apartmentGeometry(wall, roof, floors) {
  return cached(`apt${wall}${roof}${floors}`, () => {
    const v = new Vox();
    const h = floors * 3 + 1;
    v.box(-5, 0, -5, 5, h, 5, wall);
    for (let f = 0; f < floors; f++) {
      const y = f * 3 + 2;
      for (let x = -4; x <= 4; x += 2) { v.box(x, y, -5, x, y + 1, -5, GLASS); v.box(x, y, 5, x, y + 1, 5, GLASS); }
      for (let z = -4; z <= 4; z += 2) { v.box(-5, y, z, -5, y + 1, z, GLASS); v.box(5, y, z, 5, y + 1, z, GLASS); }
    }
    v.box(-1, 0, 5, 0, 2, 5, 0x6b4a2b);
    v.box(-6, h + 1, -6, 6, h + 1, 6, roof);
    v.box(-2, h + 2, -2, 1, h + 3, 1, dark(roof, 0.2));
    return v.build(S);
  });
}

export function officeGeometry(floors, tint) {
  return cached(`office${floors}${tint}`, () => {
    const v = new Vox();
    const h = floors * 3;
    const glass = mix(0x8ab8d8, tint, 0.25);
    for (let y = 0; y <= h; y++) {
      const c = y % 3 === 0 ? 0xd8d4cc : glass;
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        if (Math.abs(x) === 5 || Math.abs(z) === 5) v.set(x, y, z, Math.abs(x) === 5 && Math.abs(z) === 5 ? 0xd8d4cc : c);
      }
    }
    v.box(-4, h, -4, 4, h, 4, 0xb0aca4);
    v.box(-2, h + 1, -2, 1, h + 2, 1, 0x909090);
    return v.build(S);
  });
}

export function shipyardGeometry() {
  return cached('shipyard', () => {
    const v = new Vox();
    v.box(-6, 0, -6, 6, 8, 6, 0x8a9aa8);
    for (let x = -6; x <= 6; x += 3) v.box(x, 0, -6, x, 8, 6, 0x6a7a88);
    v.box(-5, 0, 6, 5, 7, 6, 0x404850);
    for (let i = 0; i < 5; i++) v.box(-7, 9 + i, -6 + i, 7, 9 + i, 6 - i, i % 2 ? 0x5a6a78 : 0x4a5a68);
    v.box(4, 9, -3, 4, 18, -3, 0xf2c14e);
    v.box(-2, 18, -3, 10, 18, -3, 0xf2c14e);
    return v.build(S);
  });
}
