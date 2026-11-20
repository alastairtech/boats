// Weather visuals: drifting voxel clouds (that cast shadows), rain, lightning, fog and sky light.
import * as THREE from 'three';
import { Vox } from './voxel.js';
import { RNG } from './rng.js';
import { WORLD, WATER_Y } from './archipelago.js';
import { WEATHER } from './weather.js';

const SKY_CLEAR = new THREE.Color(0x9fd4f0);
const SKY_STORM = new THREE.Color(0x5d6873);
const SKY_FOG = new THREE.Color(0xc3ccd1);
const CLOUD_LIGHT = new THREE.Color(0xffffff);
const CLOUD_DARK = new THREE.Color(0x737b84);
const SPAN = WORLD + 800;
const VARIANTS = 4, PER = 90;
const RAIN_MAX = 2600;

export class Sky {
  constructor(view) {
    this.v = view;
    this.cur = null;
    this.drift = new THREE.Vector2();
    this.flash = 0;
    this.nextFlash = 3;
    this.skyColor = new THREE.Color();
    this._clouds();
    this._rain();
  }

  _clouds() {
    const rng = new RNG(4242);
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.92, emissive: 0x30363c });
    // Clouds between the camera and what it looks at fade away so they never block the view.
    this.cloudNear = { value: 50 };
    this.cloudMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNear = this.cloudNear;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNear;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= smoothstep(uNear, uNear * 1.7, length(vViewPosition));\n#include <opaque_fragment>');
    };
    this.clouds = [];
    this.casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let v = 0; v < VARIANTS; v++) {
      const vox = new Vox();
      const parts = 3 + rng.int(0, 3);
      for (let k = 0; k < parts; k++) {
        const rx = rng.range(3.5, 7), ry = rng.range(1.6, 3.2), rz = rng.range(2.5, 5);
        vox.blob(rng.range(-7, 7), ry * 0.5, rng.range(-4, 4), rx, ry, rz, 0xffffff,
          (x, y) => (y <= 0 ? 0xd9dee4 : 0xffffff));
      }
      for (const key of [...vox.map.keys()]) if (Number(key.split(',')[1]) < 0) vox.map.delete(key);
      const geo = vox.build(5, 0, 0, 0.04);
      const mesh = new THREE.InstancedMesh(geo, this.cloudMat, PER);
      // Only clouds near the camera can throw a visible shadow, so a small invisible twin casts them.
      const caster = new THREE.InstancedMesh(geo, this.casterMat, 12);
      caster.castShadow = true;
      caster.frustumCulled = false;
      caster.count = 0;
      this.v.scene.add(caster);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      const inst = [];
      for (let i = 0; i < PER; i++) {
        inst.push({ x: rng.range(0, SPAN), z: rng.range(0, SPAN), y: rng.range(105, 150), size: rng.range(0.7, 1.9), thr: rng.next(), yaw: rng.range(0, Math.PI * 2) });
        mesh.setMatrixAt(i, m.compose(p.set(0, -999, 0), q, s.set(0, 0, 0)));
      }
      this.v.scene.add(mesh);
      this.clouds.push({ mesh, inst, caster });
    }
  }

  _rain() {
    const pos = new Float32Array(RAIN_MAX * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc4d3e0, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.v.scene.add(this.rain);
    this.drops = new Float32Array(RAIN_MAX * 3).map(() => NaN);
  }

  update(dt, dist) {
    const v = this.v, sim = v.sim, wx = sim.weather, tgt = WEATHER[wx.kind];
    const t = { cloud: tgt.cloud, dark: tgt.dark, rain: tgt.rain, fog: tgt.fog, wind: wx.wind };
    if (!this.cur) this.cur = { ...t, dir: wx.windDir };
    const c = this.cur;
    const k = 1 - Math.exp(-dt * 0.35 * (sim.speed > 2 ? 2 : 1));
    for (const key in t) c[key] += (t[key] - c[key]) * k;
    c.dir += Math.atan2(Math.sin(wx.windDir - c.dir), Math.cos(wx.windDir - c.dir)) * k;

    // Light and sky colour.
    this._lightning(dt, wx.kind === 'storm');
    const sky = this.skyColor.copy(SKY_CLEAR).lerp(SKY_STORM, c.dark).lerp(SKY_FOG, c.fog * 0.55);
    if (this.flash > 0) sky.lerp(CLOUD_LIGHT, this.flash * 0.5);
    v.scene.background.copy(sky);
    v.scene.fog.color.copy(sky);
    v.hemi.intensity = 1.6 * (1 - 0.42 * c.dark) + this.flash * 2.5;
    v.sun.intensity = 2.4 * (1 - 0.8 * c.dark) * (1 - 0.35 * c.fog);

    // Fog thickens the haze already set up by the camera.
    const fog = v.scene.fog;
    if (dist < 400) { fog.near *= 1 - 0.75 * c.fog; fog.far *= 1 - 0.55 * c.fog; }
    else if (c.fog > 0.03) { fog.near = dist * (1.6 - c.fog); fog.far = dist * (2.2 + 12 * (1 - c.fog)); }

    // Clouds drift with the wind.
    const drift = c.wind * 5 * Math.max(0.35, Math.min(sim.speed, 4)) * dt;
    this.drift.x += Math.cos(c.dir) * drift;
    this.drift.y += Math.sin(c.dir) * drift;
    this.cloudMat.color.copy(CLOUD_LIGHT).lerp(CLOUD_DARK, c.dark);
    const camH = v.camera.position.y;
    this.cloudNear.value = dist * 0.6;
    this.cloudMat.opacity = camH < 90 ? 0.94 : camH < 420 ? 0.94 - (camH - 90) / 330 * 0.6 : 0.34 + Math.min(1, (camH - 420) / 2500) * 0.26;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const cover = c.cloud * 1.1;
    const shadows = v.sun.castShadow, near = Math.min(dist * 1.2, 180) + 150, tx = v.rig.tx, tz = v.rig.tz;
    for (const { mesh, inst, caster } of this.clouds) {
      let nc = 0;
      inst.forEach((o, i) => {
        const g = Math.min(1, Math.max(0, (cover - o.thr) / 0.12 + 0.5));
        const sc = o.size * g * (0.85 + 0.3 * c.cloud);
        const x = mod(o.x + this.drift.x, SPAN) - 400, z = mod(o.z + this.drift.y, SPAN) - 400;
        q.setFromAxisAngle(up, o.yaw);
        mesh.setMatrixAt(i, m.compose(p.set(x, sc > 0.01 ? o.y : -999, z), q, s.set(sc, sc * (0.8 + 0.4 * c.dark), sc)));
        if (shadows && sc > 0.01 && nc < caster.instanceMatrix.count && Math.abs(x - tx) < near && Math.abs(z - tz) < near) caster.setMatrixAt(nc++, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      caster.count = nc;
      caster.instanceMatrix.needsUpdate = true;
    }

    this._updateRain(dt, dist, c);
  }

  _lightning(dt, storm) {
    this.flash = Math.max(0, this.flash - dt * 5);
    if (!storm) return;
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.flash = 1;
      this.nextFlash = Math.random() < 0.3 ? 0.18 : 2 + Math.random() * 7;
    }
  }

  _updateRain(dt, dist, c) {
    const v = this.v;
    const n = dist < 520 && c.rain > 0.03 ? Math.floor(RAIN_MAX * Math.min(1, c.rain)) : 0;
    this.rain.geometry.setDrawRange(0, n * 2);
    if (!n) return;
    const R = Math.min(150, Math.max(14, dist * 0.8));
    const H = Math.min(120, Math.max(18, dist * 0.9));
    const fall = Math.max(22, R * 1.1) * dt;
    const len = Math.max(0.5, R * 0.035);
    const wx = Math.cos(c.dir) * c.wind * 0.35, wz = Math.sin(c.dir) * c.wind * 0.35;
    const cx = v.rig.tx, cz = v.rig.tz;
    const d = this.drops, pos = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      let y = d[j + 1] - fall;
      if (!(y > WATER_Y) || Math.abs(d[j] - cx) > R || Math.abs(d[j + 2] - cz) > R) {
        d[j] = cx + (Math.random() * 2 - 1) * R;
        d[j + 2] = cz + (Math.random() * 2 - 1) * R;
        y = Number.isNaN(d[j + 1]) ? Math.random() * H : H * (0.7 + Math.random() * 0.3);
        if (dist < 90 && Math.random() < 0.05 && v.a.isWaterAt(d[j], d[j + 2])) v.fx.splash(d[j], WATER_Y, d[j + 2], 1);
      }
      d[j] += wx * fall; d[j + 2] += wz * fall;
      d[j + 1] = y;
      const o = i * 6;
      pos[o] = d[j]; pos[o + 1] = y; pos[o + 2] = d[j + 2];
      pos[o + 3] = d[j] - wx * len * 2; pos[o + 4] = y + len; pos[o + 5] = d[j + 2] - wz * len * 2;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  get windDir() { return this.cur ? this.cur.dir : 0; }
  get wind() { return this.cur ? this.cur.wind : 0.5; }
  get sunK() { return this.cur ? 1 - this.cur.dark : 1; }
}

function mod(a, n) { return ((a % n) + n) % n; }
