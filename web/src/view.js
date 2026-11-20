// 3D view: overview map, streamed voxel chunks, water, the fleet, town labels, camera and picking.
import * as THREE from 'three';
import { WORLD, WATER_Y, N } from './archipelago.js';
import { Water } from './water.js';
import { FarChunks } from './lod.js';
import { Sky } from './sky.js';
import { ChunkManager, CHUNK, tileInfo, K } from './chunks.js';
import { Effects } from './fx.js';
import * as M from './models.js';
import { MODEL, CARGO } from './sim.js';

const SKY = 0xa9d9f2;
// [length, half-width] of each model in world units
const SHIP_DIM = { wren: [1.3, 0.25], mallard: [1.8, 0.35], puffin: [2.4, 0.45], gannet: [3, 0.45], kingfisher: [2, 0.25],
  heron: [2.4, 0.35], albatross: [5.2, 0.65], swift: [2.6, 0.35], osprey: [6.6, 0.75] };
const TIER_DIST = { city: 1e9, large: 1900, medium: 750, small: 320 };

export class View {
  constructor(canvas, arch, sim) {
    this.a = arch;
    this.sim = sim;
    this.canvas = canvas;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 100, 400);
    scene.add((this.hemi = new THREE.HemisphereLight(0xdff2ff, 0x6f8a4a, 1.6)));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 9000);
    this.rig = { tx: WORLD / 2, tz: WORLD / 2, dist: 80, yaw: 0.5, minD: 7, maxD: 8000 };

    this.mats = { land: new THREE.MeshLambertMaterial({ vertexColors: true }) };
    this.time = 0;
    this.world = new THREE.Group();
    scene.add(this.world);
    this._buildOverview();
    this.water = new Water(arch, scene);
    this.chunks = new ChunkManager(arch, this.world, this.mats);
    this.far = new FarChunks(arch, this.world, this.cut);
    this.fx = new Effects(scene);
    this.boats = new Map();
    this._buildPiers();
    this._buildLabels();
    this._buildSelection();
    this.sky = new Sky(this);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------------------------------------------------------------- static layers

  _buildOverview() {
    const a = this.a;
    const P = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = P;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(P, P);
    const u = WORLD / P;
    const col = (h, x, z) => {
      if (h < 0) {
        const t = Math.min(1, -h / 4);
        return [0xc9 * (1 - t) + 0x2a * t, 0xb9 * (1 - t) + 0x56 * t, 0x8a * (1 - t) + 0x6c * t];
      }
      if (h < 0.5) return [0xe9, 0xd7, 0xa0];
      if (h > 6) return [0xf0, 0xf2, 0xf4];
      if (h > 4.5) return [0x9a, 0x96, 0x8c];
      if (a.nForest.get2(x, z) > 0.08) return [0x4f, 0x8a, 0x3a];
      const t = Math.min(1, h / 5);
      return [0x7c + (0x9a - 0x7c) * t, 0xc0 + (0xae - 0xc0) * t, 0x4f + (0x5a - 0x4f) * t];
    };
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
      const x = (i + 0.5) * u, z = (j + 0.5) * u;
      const h = a.coarseAt(x, z);
      const c = col(h, x, z);
      const shade = h > 0 ? 1 + (a.coarseAt(x - u, z - u) - a.coarseAt(x + u, z + u)) * 0.12 : 1;
      const k = (j * P + i) * 4;
      img.data[k] = Math.min(255, c[0] * shade); img.data[k + 1] = Math.min(255, c[1] * shade); img.data[k + 2] = Math.min(255, c[2] * shade); img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#6fb2cf';
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const r of a.rivers) {
      ctx.lineWidth = Math.max(1.2, r.w * 2 / u);
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(x / u, z / u) : ctx.moveTo(x / u, z / u)));
      ctx.stroke();
    }
    for (const t of a.towns) {
      ctx.fillStyle = '#c8bfae';
      ctx.beginPath(); ctx.arc(t.x / u, t.z / u, t.radius / u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b5533c';
      for (let k = 0; k < t.radius * 1.5; k++) {
        const ang = k * 2.39996, rr = Math.sqrt(k / (t.radius * 1.5)) * t.radius * 0.9;
        ctx.fillRect((t.x + Math.cos(ang) * rr) / u - 0.5, (t.z + Math.sin(ang) * rr) / u - 0.5, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    const SEG = 250;
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.translate(WORLD / 2, 0, WORLD / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = a.coarseAt(pos.getX(i), pos.getZ(i));
      pos.setY(i, h < 0 ? Math.max(-3.4, h - 0.6) : Math.max(0.05, h * 0.9));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.cut = { value: new THREE.Vector4(0, 0, 0, 0) };
    this.cut2 = { value: new THREE.Vector4(0, 0, 0, 0) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCut = this.cut;
      sh.uniforms.uCut2 = this.cut2;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;\nuniform vec4 uCut;\nuniform vec4 uCut2;')
        .replace('void main() {', 'void main() {\nif (vWXZ.x > uCut.x && vWXZ.x < uCut.z && vWXZ.y > uCut.y && vWXZ.y < uCut.w) discard;\nif (vWXZ.x > uCut2.x && vWXZ.x < uCut2.z && vWXZ.y > uCut2.y && vWXZ.y < uCut2.w) discard;');
    };
    this.overview = new THREE.Mesh(geo, mat);
    this.overview.receiveShadow = true;
    this.scene.add(this.overview);
    this.mapCanvas = cv;
  }

  // One straight wooden jetty per town, from its berth to the shore.
  _buildPiers() {
    const a = this.a;
    const decks = [], posts = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
    for (const t of a.towns) {
      const dx = t.x - t.dockX, dz = t.z - t.dockZ, len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      let L = 0;
      while (L < 40 && a.isWaterAt(t.dockX + ux * L, t.dockZ + uz * L)) L += 0.25;
      L += 0.6;
      const sx = t.dockX - ux * 0.5, sz = t.dockZ - uz * 0.5;
      const ang = Math.atan2(-uz, ux);
      q.setFromAxisAngle(UP, ang);
      const w = t.tier === 'city' ? 1.6 : t.tier === 'large' ? 1.2 : 0.9;
      Object.assign(t, { pierUX: ux, pierUZ: uz, pierW: w, pierLen: L, pierEndX: sx, pierEndZ: sz });
      m.compose(new THREE.Vector3(sx + ux * L / 2, 0.06, sz + uz * L / 2), q, new THREE.Vector3(L + 0.5, 0.12, w));
      decks.push(m.clone());
      for (let d = 0; d <= L; d += 1.5) for (const side of [-1, 1]) {
        const px = sx + ux * d - uz * side * (w / 2 - 0.08), pz = sz + uz * d + ux * side * (w / 2 - 0.08);
        m.compose(new THREE.Vector3(px, -0.7, pz), q, new THREE.Vector3(0.12, 1.5, 0.12));
        posts.push(m.clone());
      }
      // mooring bollards at the end
      for (const side of [-1, 1]) {
        m.compose(new THREE.Vector3(sx - uz * side * (w / 2 - 0.15), 0.22, sz + ux * side * (w / 2 - 0.15)), q, new THREE.Vector3(0.14, 0.22, 0.14));
        posts.push(m.clone());
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mk = (arr, color) => {
      const im = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color }), arr.length);
      arr.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    };
    mk(decks, 0xb08050);
    mk(posts, 0x5a3c22);
  }

  _buildLabels() {
    this.labelLayer = document.getElementById('labels');
    this.labelLayer.innerHTML = '';
    this.townLabels = this.a.towns.map((t) => {
      const el = document.createElement('div');
      el.className = `tl ${t.tier}`;
      el.innerHTML = `<span class="nm">${t.name}</span>${t.shipyard ? '<span class="yd" title="Shipyard">⚓</span>' : ''}<span class="qm" title="Quest available">📜</span>`;
      this.labelLayer.appendChild(el);
      return el;
    });
    this.floats = [];
    this.stopLabels = [];
  }

  _buildSelection() {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.9, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 5;
    ring.visible = false;
    this.scene.add(ring);
    this.ring = ring;
    const tring = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 64), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.7, depthTest: false }));
    tring.rotation.x = -Math.PI / 2;
    tring.renderOrder = 5;
    tring.visible = false;
    this.scene.add(tring);
    this.townRing = tring;
    this.routeLine = null;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- boats

  _boatMesh(b) {
    let o = this.boats.get(b.id);
    if (o && o.model === b.model) return o;
    if (o) this.scene.remove(o.g);
    const g = new THREE.Group();
    const hull = new THREE.Mesh(M.shipGeometry(b.model), this.mats.land);
    hull.castShadow = hull.receiveShadow = true;
    g.add(hull);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xc9a060 }));
    cargo.castShadow = true;
    cargo.visible = false;
    g.add(cargo);
    let containers = null;
    if (b.model === 'osprey') { containers = new THREE.Mesh(M.containerStacks(), this.mats.land); containers.castShadow = true; g.add(containers); }
    this.scene.add(g);
    o = { g, hull, cargo, containers, model: b.model, smoke: 0, wake: 0 };
    this.boats.set(b.id, o);
    return o;
  }

  _updateBoats(dt, scale) {
    const live = new Set();
    const near = this.rig.dist < 220;
    const slots = new Map();
    for (const b of this.sim.boats) {
      live.add(b.id);
      const o = this._boatMesh(b);
      // Moored boats lie alongside the jetty, alternating sides.
      let tx = b.x, tz = b.z, th = b.heading;
      const t = b.at != null && b.state !== 'sail' ? this.a.towns[b.at] : null;
      if (t && t.pierUX !== undefined) {
        const i = slots.get(t.id) || 0;
        slots.set(t.id, i + 1);
        const [len, hw] = SHIP_DIM[b.model] || SHIP_DIM.wren;
        const side = i % 2 ? 1 : -1;
        const along = len / 2 + 0.2 + Math.floor(i / 2) * 1.2;
        const off = (t.pierW / 2 + hw * scale + 0.12) * side;
        tx = t.pierEndX + t.pierUX * along - t.pierUZ * off;
        tz = t.pierEndZ + t.pierUZ * along + t.pierUX * off;
        th = Math.atan2(-t.pierUZ, -t.pierUX);
      }
      if (b._vx === undefined || Math.hypot(tx - b._vx, tz - b._vz) > 8 * scale) { b._vx = tx; b._vz = tz; b._vh = th; }
      const k = 1 - Math.exp(-4 * dt);
      b._vx += (tx - b._vx) * k; b._vz += (tz - b._vz) * k;
      b._vh += Math.atan2(Math.sin(th - b._vh), Math.cos(th - b._vh)) * k;
      // Ride the waves: sample the sea under bow, stern and beam.
      const W = this.water, cs = Math.cos(b._vh), sn = Math.sin(b._vh), L = 0.8 * scale, B = 0.4 * scale;
      const hc = W.heightAt(b._vx, b._vz);
      const pitch = Math.atan2(W.heightAt(b._vx + cs * L, b._vz + sn * L) - W.heightAt(b._vx - cs * L, b._vz - sn * L), 2 * L);
      const roll = Math.atan2(W.heightAt(b._vx - sn * B, b._vz + cs * B) - W.heightAt(b._vx + sn * B, b._vz - cs * B), 2 * B);
      o.g.position.set(b._vx, hc - 0.15 + Math.sin(this.time * 2 + b.id) * 0.015, b._vz);
      o.g.rotation.set(0, -b._vh, 0, 'YXZ');
      o.g.rotateZ(pitch * 0.8);
      o.g.rotateX(-roll * 0.8);
      o.g.scale.setScalar(scale);
      const hold = M.HOLD[b.model];
      const load = this.sim.load(b) / this.sim.boatCap(b);
      if (hold && load > 0.01) {
        const [x0, x1, hw, y] = hold;
        const hgt = 0.5 + load * 2.5;
        o.cargo.visible = true;
        o.cargo.scale.set((x1 - x0) * M.SHIP_S, hgt * M.SHIP_S, hw * 2 * M.SHIP_S);
        o.cargo.position.set((x0 + x1) / 2 * M.SHIP_S, (y + hgt / 2) * M.SHIP_S, 0);
        o.cargo.material.color.set(CARGO[b.cargoType].color);
      } else o.cargo.visible = false;
      if (o.containers) o.containers.visible = load > 0.05;
      if (!near) continue;
      const dx = b.x - this.rig.tx, dz = b.z - this.rig.tz;
      if (dx * dx + dz * dz > 120 * 120) continue;
      const hx = Math.cos(b.heading), hz = Math.sin(b.heading);
      const len = (M.HOLD[b.model] ? 1.6 : 1) * scale;
      if (b.state === 'sail' && this.sim.speed) {
        o.wake -= dt;
        if (o.wake <= 0) { o.wake = 0.07; this.fx.wake(b.x - hx * len, WATER_Y, b.z - hz * len, -hz, hx); }
      }
      o.smoke -= dt;
      if (o.smoke <= 0) {
        o.smoke = b.state === 'broken' ? 0.12 : b.state === 'sail' ? 0.3 : 0.8;
        const p = new THREE.Vector3(-0.3, 1.1, 0).applyEuler(o.g.rotation).multiplyScalar(scale).add(o.g.position);
        this.fx.smoke(p.x, p.y, p.z, b.state === 'broken' ? 1.4 : 0.7);
        if (b.state === 'broken') this.fx.parts[this.fx.parts.length - 1].c = 0x404040;
      }
    }
    for (const [id, o] of this.boats) if (!live.has(id)) { this.scene.remove(o.g); this.boats.delete(id); }
  }

  // ---------------------------------------------------------------- selection and routes

  select(sel) {
    this.selection = sel;
    this.refreshRoute();
  }

  refreshRoute() {
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine.geometry.dispose(); this.routeLine = null; }
    for (const el of this.stopLabels) el.remove();
    this.stopLabels = [];
    const sel = this.selection;
    if (!sel || sel.type !== 'boat') return;
    const b = sel.obj;
    if (!b.orders.length) return;
    const cls = MODEL[b.model].cls;
    const pts = [];
    const towns = b.orders.map((o) => this.a.towns[o.town]);
    for (let i = 0; i < towns.length && towns.length > 1; i++) {
      const A = towns[i], B = towns[(i + 1) % towns.length];
      const r = this.sim.nav.route(A.berthX, A.berthZ, B, cls);
      if (!r) continue;
      for (let k = 0; k < r.length - 1; k++) pts.push(r[k][0], 0.4, r[k][1], r[k + 1][0], 0.4, r[k + 1][1]);
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.routeLine = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf2c14e, depthTest: false, transparent: true, opacity: 0.9 }));
      this.routeLine.renderOrder = 6;
      this.scene.add(this.routeLine);
    }
    towns.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'stop-num';
      el.textContent = String(i + 1);
      el._pos = [t.berthX, 1, t.berthZ];
      // offset repeated stops so numbers don't overlap
      el._off = towns.slice(0, i).filter((u) => u === t).length;
      this.labelLayer.appendChild(el);
      this.stopLabels.push(el);
    });
  }

  float(text, x, y, z, cls = '') {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    this.labelLayer.appendChild(el);
    this.floats.push({ el, x, y, z, t: 0 });
  }

  // ---------------------------------------------------------------- camera and frame

  pitch() {
    const t = Math.min(1, Math.max(0, (Math.log(this.rig.dist) - Math.log(25)) / (Math.log(2500) - Math.log(25))));
    return 0.82 + t * 0.62;
  }

  focus(x, z, dist) {
    this.rig.tx = x; this.rig.tz = z;
    if (dist) this.rig.dist = dist;
  }

  _camera() {
    const { rig, camera } = this;
    rig.tx = Math.min(WORLD + 200, Math.max(-200, rig.tx));
    rig.tz = Math.min(WORLD + 200, Math.max(-200, rig.tz));
    const dist = rig.dist * (camera.aspect < 1 ? Math.min(1.6, 1 / Math.sqrt(camera.aspect)) : 1);
    const p = this.pitch(), cp = Math.cos(p);
    camera.position.set(rig.tx + Math.sin(rig.yaw) * cp * dist, Math.sin(p) * dist, rig.tz - Math.cos(rig.yaw) * cp * dist);
    camera.lookAt(rig.tx, 0, rig.tz);
    const ins = this.inset || { right: 0, bottom: 0 };
    if (ins.right || ins.bottom) camera.setViewOffset(innerWidth, innerHeight, ins.right / 2, ins.bottom / 2, innerWidth, innerHeight);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.near = Math.max(0.3, dist * 0.02);
    camera.far = dist * 6 + 500;
    camera.updateProjectionMatrix();
    const fog = this.scene.fog;
    if (dist < 400) { fog.near = dist * 1.6; fog.far = dist * 4.5; } else { fog.near = 1e6; fog.far = 1e7; }
    const sun = this.sun;
    const span = Math.min(dist * 1.2, 180);
    sun.castShadow = dist < 260;
    sun.position.set(rig.tx - 140, 280, rig.tz - 105);
    sun.target.position.set(rig.tx, 0, rig.tz);
    const sc = sun.shadow.camera;
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 20; sc.far = 700; sc.updateProjectionMatrix(); }
    return dist;
  }

  frame(dt) {
    this.time += dt;
    const dist = this._camera();
    this.sky.update(dt, dist);
    this.water.update(this.time, this.rig, dist, this.sky.wind, this.sky.windDir, this.sky.sunK);
    // Voxel detail near the ground, the overview map everywhere else.
    let cut = null;
    if (dist < 230) {
      const radius = Math.min(6, Math.max(2, Math.ceil(dist * 1.25 / CHUNK)));
      const propR = dist < 70 ? Math.min(radius, 3) : dist < 140 ? 2 : 1;
      cut = this.chunks.stream(this.rig.tx, this.rig.tz, propR, propR, this.mobile ? 5 : 8);
    } else if (this.chunks.chunks.size) this.chunks.clear();
    if (cut) this.cut.value.set(cut.x0, cut.z0, cut.x1, cut.z1); else this.cut.value.set(0, 0, 0, 0);
    // Simplified voxels for the middle distance.
    let cut2 = null;
    if (dist < 1100) {
      const r2 = Math.min(this.mobile ? 6 : 8, Math.max(3, Math.ceil(dist * 0.8 / 64)));
      cut2 = this.far.stream(this.rig.tx, this.rig.tz, r2, this.mobile ? 4 : 6);
    } else if (this.far.chunks.size) this.far.clear();
    if (cut2) this.cut2.value.set(cut2.x0, cut2.z0, cut2.x1, cut2.z1); else this.cut2.value.set(0, 0, 0, 0);

    // Ambient life
    const simDt = dt * (this.sim.speed ? Math.min(this.sim.speed, 2) : 0);
    for (const c of this.chunks.chunks.values()) {
      for (const f of c.anim) f(this.time);
      if (!c.props) continue;
      for (const o of c.critters) this._critter(o, dt);
      if (dist < 120) for (const ch of c.chimneys) {
        ch.t -= dt;
        if (ch.t <= 0) { ch.t = 0.6 + Math.random() * 0.8; this.fx.smoke(ch.x, ch.y, ch.z, 1); }
      }
    }
    void simDt;
    if (dist < 120) this.fx.ambient(dt, this.rig.tx, this.rig.tz, Math.min(60, dist * 1.2), (x, z) => this.a.isWaterAt(x, z));
    this.fx.update(dt);

    const scale = Math.max(1, dist / 70);
    this._updateBoats(dt, scale);
    this._selection(scale);
    this._labels(dist);
    this.renderer.render(this.scene, this.camera);
  }

  _critter(o, dt) {
    const d = o.d;
    d.t += dt;
    if (d.wait > 0) d.wait -= dt;
    else {
      const tx = d.tgt.x - d.pos.x, tz = d.tgt.y - d.pos.y, len = Math.hypot(tx, tz);
      if (len < 0.08) {
        d.wait = 1 + Math.random() * 4;
        const cx = d.home.x + (Math.random() * 2 - 1) * d.radius, cz = d.home.y + (Math.random() * 2 - 1) * d.radius;
        if (this.chunks.zoneOk(d.zone, cx, cz)) d.tgt = { x: cx, y: cz };
      } else {
        const sp = { person: 0.8, kid: 1.1, gull: 2, deer: 1, rabbit: 1.6, fox: 1, duck: 0.6, swan: 0.4, sheep: 0.3, cow: 0.25, goat: 0.4, cat: 0.6, dog: 1.2, hedgehog: 0.3 }[d.k] || 0.5;
        const step = Math.min(sp * dt, len);
        const nx = d.pos.x + tx / len * step, nz = d.pos.y + tz / len * step;
        if (d.zone === 'air' || this.chunks.zoneOk(d.zone, nx, nz)) {
          d.pos.x = nx; d.pos.y = nz;
          let diff = Math.atan2(-tz, tx) - d.ang;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          d.ang += diff * Math.min(1, dt * 8);
          o.bob = d.zone === 'water' || d.k === 'gull' ? 0 : Math.abs(Math.sin(d.t * 12)) * 0.05;
        } else d.tgt = { x: d.pos.x, y: d.pos.y };
      }
    }
    if (d.k === 'gull') o.body.scale.z = 0.5 + Math.abs(Math.sin(d.t * 5)) * 0.5;
    this.chunks.placeCritter(o);
  }

  _selection(scale) {
    const sel = this.selection;
    this.ring.visible = !!sel && sel.type === 'boat';
    this.townRing.visible = !!sel && sel.type === 'town';
    if (!sel) return;
    if (sel.type === 'boat') {
      const b = sel.obj;
      this.ring.position.set(b._vx ?? b.x, 0.2, b._vz ?? b.z);
      this.ring.scale.setScalar(scale * (SHIP_DIM[b.model] || SHIP_DIM.wren)[0] * 0.75 + 0.3);
    } else {
      const t = sel.obj;
      this.townRing.position.set(t.x, t.baseH + 0.3, t.z);
      this.townRing.scale.setScalar(t.radius + 1);
    }
  }

  // Keep the selected thing visible beside the panel by shifting the projection centre.
  setInset(right, bottom) {
    this.inset = { right, bottom };
  }

  _project(x, y, z, v = new THREE.Vector3()) {
    v.set(x, y, z).project(this.camera);
    const w = innerWidth, h = innerHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, ok: v.z < 1 && v.z > -1 };
  }

  _labels(dist) {
    const v = new THREE.Vector3();
    const w = innerWidth, h = innerHeight;
    const questFrom = new Set(this.sim.quests.filter((q) => q.state === 'open').map((q) => q.from));
    this.a.towns.forEach((t, i) => {
      const el = this.townLabels[i];
      const hasQuest = questFrom.has(t.id);
      if (el._q !== hasQuest) { el._q = hasQuest; el.classList.toggle('quest', hasQuest); }
      const show = dist < TIER_DIST[t.tier] || hasQuest || (this.selection && this.selection.obj === t);
      const p = this._project(t.x, t.baseH + 1.5 + t.radius * 0.2, t.z, v);
      const vis = show && p.ok && p.x > -100 && p.x < w + 100 && p.y > -40 && p.y < h + 40;
      if (vis) {
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
        if (el.style.display !== '') el.style.display = '';
      } else if (el.style.display !== 'none') el.style.display = 'none';
      el.classList.toggle('sel', !!(this.selection && this.selection.obj === t));
    });
    for (const el of this.stopLabels) {
      const p = this._project(el._pos[0], el._pos[1], el._pos[2], v);
      el.style.display = p.ok ? '' : 'none';
      el.style.transform = `translate(${(p.x + el._off * 22).toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += 1 / 60;
      const p = this._project(f.x, f.y, f.z, v);
      f.el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - f.t * 40).toFixed(1)}px) translate(-50%, -100%)`;
      f.el.style.opacity = String(Math.max(0, 1.6 - f.t));
      if (f.t > 1.6 || !p.ok) { f.el.remove(); this.floats.splice(i, 1); }
    }
  }

  // Screen-space pick of the boat or town nearest to a tap.
  pick(cx, cy, townsOnly = false) {
    const r = this.canvas.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    const v = new THREE.Vector3();
    let best = null, bd = Infinity;
    if (!townsOnly) {
      for (const b of this.sim.boats) {
        const p = this._project(b._vx ?? b.x, 0.5, b._vz ?? b.z, v);
        const d = Math.hypot(p.x - x, p.y - y);
        if (p.ok && d < 30 && d < bd) { bd = d; best = { type: 'boat', obj: b }; }
      }
      if (best) return best;
    }
    const dist = this.rig.dist;
    for (const t of this.a.towns) {
      if (dist > TIER_DIST[t.tier] * 1.2) continue;
      const p = this._project(t.x, t.baseH, t.z, v);
      const pl = this._project(t.x, t.baseH + 1.5 + t.radius * 0.2, t.z, v);
      const rad = Math.max(26, Math.abs(this._project(t.x + t.radius, t.baseH, t.z, v).x - p.x));
      const d = Math.min(Math.hypot(p.x - x, p.y - y), Math.hypot(pl.x - x, pl.y + 10 - y));
      if (p.ok && d < rad && d < bd) { bd = d; best = { type: 'town', obj: t }; }
    }
    return best;
  }

  groundPoint(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  dispose() {
    this.chunks.clear();
    this.labelLayer.innerHTML = '';
  }
}

export { N, tileInfo, K };
