// On-demand voxel terrain chunks (32x32 tiles) with scenery, town buildings, piers and ambient wildlife.
import * as THREE from 'three';
import { QuadBuilder } from './voxel.js';
import { hash2 } from './rng.js';
import { WORLD, WATER_Y } from './archipelago.js';
import * as M from './models.js';

export const CHUNK = 32;
export const K = { DEEP: 0, WATER: 1, SHALLOW: 2, SAND: 3, GRASS: 4, FOREST: 5, FIELD: 6, TOWN: 7, ROAD: 8, ROCK: 9, SNOW: 10 };
export const WALLS = [0xf2e6c9, 0xf7f3ea, 0xf2c9c0, 0xc9dcef, 0xf4e19c, 0xd8e8c4, 0xe8d0b0, 0xffffff];
export const ROOFS = [0xb5533c, 0x4f6380, 0xc9a050, 0x5f7f4a, 0x8b3a3a, 0x6a4f7a, 0xa86a3a];
const SHIRTS = [0xd94f4f, 0x4f7fd9, 0xf2c14e, 0x5fae5f, 0xa05fd9, 0xf28c3c, 0xffffff, 0x2e4a6b, 0xe87fb0];
const SKINS = [0xf5d0b0, 0xe0ac85, 0xb97f55, 0x8a5a3a, 0x5e3b24];
const HAIRS = [0x3a2a1a, 0x7a4a20, 0xe8c060, 0x202020, 0xc0c0c0, 0xa03a20];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FLOOR = -3.5;

export function mix(a, b, t) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// Classify one tile. Returns [height, kind, town|null].
export function tileInfo(a, x, z) {
  const cx = x + 0.5, cz = z + 0.5;
  if (cx < 0 || cz < 0 || cx > WORLD || cz > WORLD) return [-3, K.DEEP, null];
  const raw = a.rawHeight(cx, cz);
  if (raw < 0) {
    const bed = Math.max(-3, Math.min(-0.5, Math.floor(raw * 2) / 2));
    return [bed, raw > -0.9 ? K.SHALLOW : raw > -2.2 ? K.WATER : K.DEEP, null];
  }
  const town = a.townAt(cx, cz);
  if (town && raw < town.baseH + 2.5) {
    const dx = Math.round(cx - town.x), dz = Math.round(cz - town.z);
    const sp = town.tier === 'small' ? 4 : 5;
    const road = (dx % sp === 0 || dz % sp === 0) && Math.hypot(dx, dz) < town.radius - 1;
    return [town.baseH, road ? K.ROAD : K.TOWN, town];
  }
  const h = Math.max(0, Math.floor(raw * 2) / 2);
  if (raw < 0.55) return [h, K.SAND, null];
  if (h >= 6) return [h, K.SNOW, null];
  if (h >= 4.5) return [h, K.ROCK, null];
  const f = a.nForest.get2(cx, cz);
  if (f > 0.08) return [h, K.FOREST, null];
  // farmland ring around towns
  const near = a.townAt(cx, cz) || nearTown(a, cx, cz);
  if (near && h <= near.baseH + 1.5) return [h, K.FIELD, null];
  return [h, K.GRASS, null];
}

function nearTown(a, x, z) {
  for (const t of a.towns) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.radius * 1.8 && d >= t.radius) return t;
  }
  return null;
}

export function tileColor(kind, h, x, z) {
  const j = hash2(x, z);
  const jj = (j * 8 | 0) / 7;
  switch (kind) {
    case K.DEEP: return mix(0x2c5f73, 0x285868, jj);
    case K.WATER: return mix(0x4f8a86, 0x48807c, jj);
    case K.SHALLOW: return mix(0xc9b98a, 0xbfae7f, jj);
    case K.SAND: return mix(0xe9d7a0, 0xdfcb92, jj);
    case K.GRASS: return mix(mix(0x7cc04f, 0x6fb347, jj), 0x9aae5a, Math.min(1, h / 5));
    case K.FOREST: return mix(0x5c9a42, 0x548f3c, jj);
    case K.FIELD: return (Math.floor(z / 2) + Math.floor(x / 6)) & 1 ? mix(0xe0c060, 0xd8b656, jj) : mix(0xa8c35a, 0x9cb850, jj);
    case K.TOWN: return mix(0xc8bfae, 0xbdb4a2, jj);
    case K.ROAD: return mix(0x8a8478, 0x827c70, jj);
    case K.ROCK: return mix(0x9a968c, 0x8a867c, jj);
    case K.SNOW: return mix(0xf4f6f8, 0xe8ecf0, jj);
  }
  return 0xff00ff;
}

export function sideColor(kind, top, level) {
  const DIRT = 0x9a7650, STONE = 0xa8a090;
  switch (kind) {
    case K.GRASS: case K.FOREST: case K.FIELD: return level === 0 ? mix(top, 0, 0.08) : level & 1 ? DIRT : mix(DIRT, 0, 0.08);
    case K.TOWN: case K.ROAD: return level & 1 ? STONE : mix(STONE, 0, 0.08);
    case K.ROCK: case K.SNOW: return level === 0 ? mix(top, 0, 0.06) : level & 1 ? 0x8a867c : 0x7e7a70;
    default: return mix(top, 0, 0.08);
  }
}

export class ChunkManager {
  constructor(arch, root, mats) {
    this.a = arch;
    this.root = root;
    this.mats = mats;
    this.chunks = new Map();
    this.n = Math.ceil(WORLD / CHUNK);
  }

  key(cx, cz) { return cz * 1000 + cx; }

  // Sample tile data for the chunk plus a 1-tile border.
  _tiles(cx, cz) {
    const S = CHUNK + 2;
    const H = new Float32Array(S * S), Kd = new Uint8Array(S * S), Tw = new Array(S * S);
    const x0 = cx * CHUNK - 1, z0 = cz * CHUNK - 1;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const [h, k, t] = tileInfo(this.a, x0 + i, z0 + j);
      H[j * S + i] = h; Kd[j * S + i] = k; Tw[j * S + i] = t;
    }
    return { H, Kd, Tw, S, x0, z0 };
  }

  _terrain(td) {
    const { H, Kd, S, x0, z0 } = td;
    const q = new QuadBuilder();
    for (let j = 1; j < S - 1; j++) for (let i = 1; i < S - 1; i++) {
      const k = j * S + i;
      const h = H[k], kind = Kd[k];
      const x = x0 + i, z = z0 + j;
      const col = tileColor(kind, h, x, z);
      q.top(x, z, x + 1, z + 1, h, col);
      for (let d = 0; d < 4; d++) {
        const nk = (j + DIRS[d][1]) * S + i + DIRS[d][0];
        const hn = x + DIRS[d][0] < 0 || z + DIRS[d][1] < 0 || x + DIRS[d][0] >= WORLD || z + DIRS[d][1] >= WORLD ? FLOOR : H[nk];
        if (hn >= h) continue;
        let level = 0;
        for (let top = h; top > hn + 1e-4; top -= 0.5, level++) {
          q.side(x, z, d, Math.max(hn, top - 0.5), top, sideColor(kind, col, level), d < 2 ? 0.86 : 0.78);
        }
      }
    }
    return q.geometry();
  }

  // Scenery and buildings as instanced meshes, plus animated bits and ambient critters.
  _props(td, chunk) {
    const { H, Kd, Tw, S, x0, z0 } = td;
    const groups = new Map();
    const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    const add = (geo, x, y, z, rot = 0, sc = 1) => {
      let arr = groups.get(geo);
      if (!arr) groups.set(geo, (arr = []));
      q.setFromAxisAngle(UP, rot);
      tmpM.compose(p.set(x, y, z), q, s.set(sc, sc, sc));
      arr.push(tmpM.clone());
    };
    const a = this.a;
    const seed = a.seed & 0xffff;
    const landmarks = new Set();
    for (let j = 1; j < S - 1; j++) for (let i = 1; i < S - 1; i++) {
      const k = j * S + i, kind = Kd[k], h = H[k];
      const x = x0 + i, z = z0 + j;
      const r = hash2(x * 7 + seed, z * 13 - seed);
      const r2 = hash2(x * 31 + 5, z * 17 + seed);
      const px = x + 0.25 + r2 * 0.5, pz = z + 0.25 + hash2(x + 3, z * 5 + 1) * 0.5;
      const rot = Math.floor(r2 * 4) * Math.PI / 2;
      switch (kind) {
        case K.FOREST:
          if (r < 0.4) {
            const kn = a.nKind.get2(x, z) + (r2 - 0.5) * 0.3;
            const tone = Math.floor(r2 * 3) / 2;
            if (kn > 0.1) add(M.propGeometry({ k: 'pine', c: mix(0x3f7a4a, 0x2f5f3a, tone) }), px, h, pz, rot, 0.8 + r2 * 0.5);
            else if (kn < -0.25) add(M.propGeometry({ k: 'birch' }), px, h, pz, rot, 0.8 + r2 * 0.4);
            else add(M.propGeometry({ k: 'tree', c: mix(0x5f9e40, 0x4a8a3a, tone) }), px, h, pz, rot, 0.8 + r2 * 0.5);
          } else if (r < 0.42) add(M.propGeometry({ k: 'mushroom' }), px, h, pz, rot);
          break;
        case K.GRASS:
          if (r < 0.025) add(M.propGeometry({ k: 'tree', c: mix(0x6aae45, 0x5a9e3a, Math.floor(r2 * 3) / 2) }), px, h, pz, rot, 0.9 + r2 * 0.5);
          else if (r < 0.05) add(M.propGeometry({ k: 'bush' }), px, h, pz, rot);
          else if (r < 0.1) add(M.propGeometry({ k: 'flowers', c: [0xf2f2f2, 0xf2c14e, 0xe87fb0, 0xa07fe0, 0xe85050][Math.floor(r2 * 5)] }), px, h, pz, rot);
          else if (r < 0.11) add(M.propGeometry({ k: 'rock' }), px, h, pz, rot);
          break;
        case K.SAND:
          if (r < 0.02) add(M.propGeometry({ k: 'rock' }), px, h, pz, rot);
          else if (r < 0.03) add(M.propGeometry({ k: 'log' }), px, h, pz, rot);
          break;
        case K.ROCK:
          if (r < 0.07) add(M.propGeometry({ k: 'rock' }), px, h, pz, rot, 1 + r2);
          else if (r < 0.1) add(M.propGeometry({ k: 'pine', c: 0x3f6a4a }), px, h, pz, rot, 0.7);
          break;
        case K.FIELD:
          if (r < 0.012) add(M.propGeometry({ k: 'haybale' }), px, h, pz, rot);
          else if (r < 0.014) add(M.propGeometry({ k: 'scarecrow' }), px, h, pz, rot);
          else if (r < 0.0155) {
            add(M.propGeometry({ k: 'windmill' }), x + 0.5, h, z + 0.5);
            const sails = new THREE.Mesh(M.windmillSails(), this.mats.land);
            sails.position.set(x + 0.5 + M.WINDMILL_HUB.x, h + M.WINDMILL_HUB.y, z + 0.5);
            sails.castShadow = true;
            chunk.group.add(sails);
            chunk.anim.push((t) => { sails.rotation.x = t * 0.8 + r * 10; });
          }
          break;
        case K.SHALLOW: {
          if (r < 0.12) {
            let land = false;
            for (const [dx, dz] of DIRS) { const nk = Kd[(j + dz) * S + i + dx]; if (nk >= K.SAND && nk !== K.TOWN && nk !== K.ROAD) land = true; }
            if (land) add(M.propGeometry({ k: 'reeds' }), px, h, pz, rot);
          }
          break;
        }
        case K.ROAD:
          if (r < 0.04) add(M.propGeometry({ k: 'lamp' }), px, h, pz);
          break;
        case K.TOWN: {
          const t = Tw[k];
          this._building(t, x, z, h, r, r2, add, chunk, landmarks, Kd, S, i, j);
          break;
        }
      }
    }
    for (const [geo, mats] of groups) {
      const im = new THREE.InstancedMesh(geo, this.mats.land, mats.length);
      mats.forEach((m, k) => im.setMatrixAt(k, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      chunk.group.add(im);
    }
  }

  _building(t, x, z, h, r, r2, add, chunk, landmarks, Kd, S, i, j) {
    const cx = x + 0.5, cz = z + 0.5;
    const d = Math.hypot(cx - t.x, cz - t.z) / t.radius;
    const dock = Math.hypot(cx - t.berthX, cz - t.berthZ);
    // face the nearest road
    let rot = 0;
    for (const [dx, dz, a] of [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]]) {
      if (Kd[(j + dz) * (S) + i + dx] === K.ROAD) { rot = a; break; }
    }
    const wall = WALLS[(t.walls + Math.floor(r2 * 3)) % WALLS.length];
    const roof = ROOFS[(t.roofs + Math.floor(r * 5)) % ROOFS.length];
    // Landmark at the town centre and a shipyard by the water.
    if (Math.round(cx - t.x - 1) === 0 && Math.round(cz - t.z - 1) === 0) {
      const lk = t.tier === 'large' ? 'tower' : 'church';
      add(M.propGeometry({ k: lk, wall: 0xe8e0d0, roof }), cx, h, cz, rot + Math.PI / 2);
      return;
    }
    if (t.shipyard && !t.yardTile) t.yardTile = this._yardTile(t);
    if (t.yardTile && t.yardTile[0] === x && t.yardTile[1] === z) {
      add(M.shipyardGeometry(), cx, h, cz, Math.atan2(-(t.dockZ - cz), t.dockX - cx) - Math.PI / 2);
      return;
    }
    if (t.tier === 'city' && !t.lightTile) t.lightTile = this._lightTile(t);
    if (t.lightTile && t.lightTile[0] === x && t.lightTile[1] === z) {
      add(M.propGeometry({ k: 'lighthouse' }), cx, h, cz);
      const lamp = new THREE.PointLight(0xffe9a0, 8, 14, 1.5);
      lamp.position.set(cx, h + 25 * M.S, cz);
      chunk.group.add(lamp);
      return;
    }
    const density = { small: 0.55, medium: 0.7, large: 0.82, city: 0.9 }[t.tier];
    if (r > density) {
      if (r > 0.97) add(M.propGeometry({ k: 'tree', c: 0x6aae45 }), cx, h, cz, rot, 0.8);
      else if (r > 0.94) add(M.propGeometry({ k: 'flowerbed', c: SHIRTS[Math.floor(r2 * 9)] }), cx, h, cz, rot);
      else if (r > 0.92) add(M.propGeometry({ k: 'bench' }), cx, h, cz, rot);
      return;
    }
    if (dock < 6 && (t.tier !== 'small' || r < 0.3)) {
      if (r < 0.25) add(M.propGeometry({ k: 'stall', c: [0xd94f4f, 0x4f7fd9, 0x5fae5f, 0xf2a03c][Math.floor(r2 * 4)] }), cx, h, cz, rot);
      else if (r < 0.5) { add(M.propGeometry({ k: r2 < 0.5 ? 'crate' : 'barrel' }), cx - 0.2, h, cz, 0); add(M.propGeometry({ k: 'crate' }), cx + 0.2, h, cz + 0.15, 0); }
      else add(M.propGeometry({ k: 'warehouse', roof: 0x6a6a70 }), cx, h, cz, rot);
      return;
    }
    if (t.tier === 'city' && d < 0.35) {
      if (r < density * 0.5) add(M.officeGeometry(3 + Math.floor(r2 * 5), r2 < 0.5 ? 0x4f7fd9 : 0x5fae5f), cx, h, cz, 0);
      else add(M.apartmentGeometry(wall, roof, 3 + Math.floor(r2 * 3)), cx, h, cz, rot);
    } else if ((t.tier === 'city' && d < 0.75) || (t.tier === 'large' && d < 0.45)) {
      add(M.apartmentGeometry(wall, roof, 2 + Math.floor(r2 * 2)), cx, h, cz, rot);
    } else if (t.tier === 'city' && r < 0.15) {
      add(M.propGeometry({ k: 'warehouse', roof }), cx, h, cz, rot);
    } else {
      const tall = r2 < (t.tier === 'small' ? 0.15 : 0.4);
      const chim = r < density * 0.6;
      add(M.propGeometry({ k: 'house', wall, roof, tall, chim }), cx, h, cz, rot);
      if (chim) {
        const ct = M.chimneyTop(tall);
        const c = Math.cos(rot), sn = Math.sin(rot);
        chunk.chimneys.push({ x: cx + ct.x * c + ct.z * sn, y: h + ct.y, z: cz - ct.x * sn + ct.z * c, t: r * 2 });
      }
    }
  }

  _yardTile(t) {
    // land tile nearest the dock, a little to the side of the pier
    let best = null, bd = Infinity;
    for (let dz = -t.radius; dz <= t.radius; dz++) for (let dx = -t.radius; dx <= t.radius; dx++) {
      const x = Math.floor(t.x) + dx, z = Math.floor(t.z) + dz;
      const [, k] = tileInfo(this.a, x, z);
      if (k !== K.TOWN) continue;
      const d = Math.hypot(x + 0.5 - t.dockX, z + 0.5 - t.dockZ) + (t.pier.has(`${x},${z}`) ? 99 : 0);
      const side = Math.abs((x + 0.5 - t.berthX) * (t.z - t.dockZ) - (z + 0.5 - t.berthZ) * (t.x - t.dockX)) / (Math.hypot(t.x - t.dockX, t.z - t.dockZ) || 1);
      const score = d + (side < 2 ? 50 : 0);
      if (score < bd) { bd = score; best = [x, z]; }
    }
    return best || [-1, -1];
  }

  _lightTile(t) {
    let best = null, bd = Infinity;
    for (let dz = -t.radius - 4; dz <= t.radius + 4; dz++) for (let dx = -t.radius - 4; dx <= t.radius + 4; dx++) {
      const x = Math.floor(t.x) + dx, z = Math.floor(t.z) + dz;
      const [, k, tw] = tileInfo(this.a, x, z);
      if (k !== K.TOWN || tw !== t) continue;
      const d = Math.hypot(x - t.dockX, z - t.dockZ);
      const side = Math.abs((x - t.dockX) * (t.z - t.dockZ) - (z - t.dockZ) * (t.x - t.dockX)) / (Math.hypot(t.x - t.dockX, t.z - t.dockZ) || 1);
      const score = d - side * 0.8 + (t.yardTile && Math.hypot(x - t.yardTile[0], z - t.yardTile[1]) < 3 ? 99 : 0);
      if (score < bd) { bd = score; best = [x, z]; }
    }
    return best || [-1, -1];
  }

  _critters(td, chunk) {
    const { H, Kd, Tw, S, x0, z0 } = td;
    const a = this.a;
    const out = [];
    const spawn = (k, x, z, zone, extra = {}) => {
      const d = { k, pos: { x, y: z }, tgt: { x, y: z }, home: { x, y: z }, zone, radius: extra.radius || 3, wait: hash2(x, z) * 3, t: hash2(z, x) * 10, ang: hash2(x + 1, z) * 6.28, ...extra };
      const body = k === 'person' || k === 'kid' ? new THREE.Mesh(M.personGeometry(d, false), this.mats.land) : new THREE.Mesh(M.critterGeometry(d), this.mats.land);
      body.castShadow = true;
      const g = new THREE.Group();
      g.add(body);
      if (k === 'kid') g.scale.setScalar(0.75);
      chunk.group.add(g);
      out.push({ d, g, body });
    };
    let townTiles = 0, people = 0, grazers = 0, ducks = 0, deer = 0, gulls = 0;
    for (let j = 1; j < S - 1; j += 1) for (let i = 1; i < S - 1; i += 1) {
      const k = j * S + i, kind = Kd[k];
      const x = x0 + i + 0.5, z = z0 + j + 0.5;
      const r = hash2(x * 3 + 11, z * 5 + a.seed % 997);
      if ((kind === K.ROAD || kind === K.TOWN) && Tw[k]) {
        townTiles++;
        if (r < 0.035 && people < 10) {
          const look = { shirt: SHIRTS[Math.floor(r * 2e3) % 9], skin: SKINS[Math.floor(r * 3e3) % 5], hair: HAIRS[Math.floor(r * 5e3) % 6], pants: 0x3a3a5a };
          spawn(r < 0.008 ? 'kid' : 'person', x, z, 'town', { ...look, radius: 4 });
          people++;
        } else if (r > 0.997) spawn(r > 0.9985 ? 'cat' : 'dog', x, z, 'town');
        if (Tw[k].tier === 'city' && r > 0.9 && r < 0.903 && gulls < 3) { spawn('gull', x, z, 'air', { radius: 8 }); gulls++; }
      } else if (kind === K.FIELD && r < 0.012 && grazers < 2) {
        const kindA = ['sheep', 'sheep', 'cow', 'goat'][Math.floor(r * 400) % 4];
        for (let n = 0; n < 4; n++) spawn(kindA, x + (hash2(n, x) - 0.5) * 2, z + (hash2(z, n) - 0.5) * 2, 'meadow', { radius: 3 });
        grazers++;
      } else if (kind === K.GRASS && r < 0.002) spawn(['rabbit', 'fox', 'hedgehog', 'rabbit'][Math.floor(r * 2000) % 4], x, z, 'land');
      else if (kind === K.FOREST && r < 0.0025 && deer < 2) { for (let n = 0; n < 2; n++) spawn('deer', x + n * 0.6, z, 'forest', { radius: 4, antlers: n === 0 }); deer++; }
      else if (kind === K.SHALLOW && r < 0.006 && ducks < 2) {
        spawn(r < 0.003 ? 'swan' : 'duck', x, z, 'water', { radius: 3 });
        ducks++;
      }
    }
    void townTiles;
    for (const c of out) this.placeCritter(c);
    return out;
  }

  placeCritter(o) {
    const d = o.d;
    let y;
    if (d.k === 'gull') y = 3.5 + Math.sin(d.t * 0.7) * 0.4;
    else if (d.zone === 'water') y = WATER_Y - 0.04 + Math.sin(d.t * 2.2) * 0.02;
    else y = tileInfo(this.a, Math.floor(d.pos.x), Math.floor(d.pos.y))[0];
    o.g.position.set(d.pos.x, y + (o.bob || 0), d.pos.y);
    o.g.rotation.y = d.ang;
  }

  zoneOk(zone, x, z) {
    const k = tileInfo(this.a, Math.floor(x), Math.floor(z))[1];
    switch (zone) {
      case 'town': return k === K.TOWN || k === K.ROAD;
      case 'meadow': return k === K.FIELD || k === K.GRASS;
      case 'forest': return k === K.FOREST || k === K.GRASS;
      case 'land': return k === K.GRASS || k === K.FOREST || k === K.FIELD || k === K.SAND;
      case 'water': return k <= K.SHALLOW;
      case 'air': return true;
    }
    return false;
  }

  build(cx, cz, withProps) {
    const chunk = { cx, cz, group: new THREE.Group(), anim: [], chimneys: [], critters: [], props: false };
    const td = this._tiles(cx, cz);
    const terrain = new THREE.Mesh(this._terrain(td), this.mats.land);
    terrain.castShadow = terrain.receiveShadow = true;
    terrain.userData.own = true;
    chunk.group.add(terrain);
    chunk.td = td;
    if (withProps) this.addProps(chunk);
    this.root.add(chunk.group);
    this.chunks.set(this.key(cx, cz), chunk);
    return chunk;
  }

  addProps(chunk) {
    if (chunk.props) return;
    chunk.props = true;
    this._props(chunk.td, chunk);
    chunk.critters = this._critters(chunk.td, chunk);
  }

  dropProps(chunk) {
    if (!chunk.props) return;
    chunk.props = false;
    for (const o of [...chunk.group.children]) {
      if (o.userData.own) continue;
      if (o.isInstancedMesh) o.dispose();
      chunk.group.remove(o);
    }
    chunk.anim = []; chunk.chimneys = []; chunk.critters = [];
  }

  unload(chunk) {
    this.root.remove(chunk.group);
    chunk.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && o.userData.own) o.geometry.dispose();
    });
    this.chunks.delete(this.key(chunk.cx, chunk.cz));
  }

  // Keep chunks loaded in a square around (x,z); returns the half-size of the fully loaded square.
  stream(x, z, radius, propRadius, budgetMs = 7) {
    const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
    const t0 = performance.now();
    for (const c of [...this.chunks.values()]) {
      const d = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (d > radius + 1) this.unload(c);
      else if (c.props && d > propRadius + 1) this.dropProps(c);
    }
    let full = -1;
    for (let r = 0; r <= radius; r++) {
      let ringDone = true;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < -1 || cz < -1 || cx > this.n || cz > this.n) continue;
        let c = this.chunks.get(this.key(cx, cz));
        if (!c) {
          if (performance.now() - t0 > budgetMs) { ringDone = false; continue; }
          c = this.build(cx, cz, r <= propRadius);
        } else if (!c.props && r <= propRadius) {
          if (performance.now() - t0 > budgetMs) continue;
          this.addProps(c);
        }
      }
      if (!ringDone) break;
      full = r;
    }
    if (full < 0) return null;
    return { x0: (ccx - full) * CHUNK, z0: (ccz - full) * CHUNK, x1: (ccx + full + 1) * CHUNK, z1: (ccz + full + 1) * CHUNK };
  }

  clear() { for (const c of [...this.chunks.values()]) this.unload(c); }
}
