// Animated pixel-art sea. A camera-following grid is displaced by wind-driven waves in the vertex
// shader and shaded in chunky quantised pixels. A sea-state map gives every waterway its own
// character: calm rivers (with the odd rapid), sheltered shallows, rough open sea and choppy straits.
import * as THREE from 'three';
import { WORLD, CELL, N, NAV, WATER_Y } from './archipelago.js';
import { Noise } from './rng.js';

const GLSL_WAVES = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform sampler2D uSea;
vec2 wrot(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(d.x * c - d.y * s, d.x * s + d.y * c); }
// Returns a wave height in roughly [-1.3, 1.3]; chop adds shorter waves. Each layer fades out
// when it is too fine for the pixel (or grid) size, so the sea never shimmers with aliasing.
float lp(float f, float pix) { return 1.0 - smoothstep(0.35, 1.0, f * pix); }
float seaWaves(vec2 p, float chop, float pix) {
  vec2 d = uWindDir;
  float t = uTime * (0.7 + 0.5 * uWind);
  float h = sin(dot(p, wrot(d, 0.3)) * 0.07 - t * 0.45) * 0.35 * lp(0.07, pix);
  h += sin(dot(p, d) * 0.55 - t * 1.6) * 0.5 * lp(0.55, pix);
  h += sin(dot(p, wrot(d, 0.6)) * 0.9 - t * 2.1 + 1.3) * 0.33 * lp(0.9, pix);
  h += sin(dot(p, wrot(d, -0.8)) * 1.45 - t * 2.7 + 2.1) * 0.24 * lp(1.45, pix);
  h += sin(dot(p, wrot(d, 1.9)) * 2.6 - t * 3.6) * 0.18 * chop * lp(2.6, pix);
  return h;
}
`;

export class Water {
  constructor(arch, scene) {
    this.a = arch;
    this._seaMap();
    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.5 },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uSea: { value: this.tex },
      uFocus: { value: new THREE.Vector3(0, 0, 100) },
      uPix: { value: 0.5 },
      uAmp: { value: 1 },
      uGrid: { value: 1 },
      uSun: { value: 1 },
    };

    const bed = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0x24485e }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(WORLD / 2, -4, WORLD / 2);
    scene.add(bed);

    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          ${GLSL_WAVES}
          uniform vec3 uFocus;
          uniform float uAmp;
          uniform float uGrid;
          varying vec2 vWXZ;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 wxz = (modelMatrix * vec4(transformed, 1.0)).xz;
          vWXZ = wxz;
          float fade = uAmp * (1.0 - smoothstep(uFocus.z * 0.9, uFocus.z * 2.2, distance(wxz, uFocus.xy)));
          if (fade > 0.001) {
            vec4 sea = texture2D(uSea, wxz / ${WORLD.toFixed(1)});
            float chop = sea.r * 2.0;
            float amp = 0.03 + 0.2 * chop * uWind;
            transformed.y += seaWaves(wxz, chop * uWind, uGrid) * amp * fade;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          ${GLSL_WAVES}
          uniform float uPix;
          uniform float uSun;
          varying vec2 vWXZ;
          float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 cell = floor(vWXZ / uPix);
          vec2 px = (cell + 0.5) * uPix;
          vec4 sea = texture2D(uSea, px / ${WORLD.toFixed(1)});
          float chop = sea.r * 2.0 * uWind;
          float h = seaWaves(px, chop, uPix);
          float n = hash21(cell + floor(uTime * 0.8 + hash21(cell) * 7.0) * 0.137);
          float v = clamp(h * 0.38 + 0.5 + (n - 0.5) * 0.14, 0.0, 1.0);
          v = floor(v * 5.0) / 4.0;
          vec3 deep = vec3(0.035, 0.16, 0.32);
          vec3 shallow = vec3(0.06, 0.42, 0.47);
          vec3 river = vec3(0.08, 0.30, 0.30);
          vec3 base = mix(shallow, deep, sea.g);
          base = mix(base, river, sea.b);
          vec3 col = base * (0.7 + 0.55 * v);
          diffuseColor.rgb = col;
          diffuseColor.a = mix(0.66, 0.9, sea.g) * mix(1.0, 0.82, sea.b);`);
    };

    this.mesh = new THREE.Mesh(this._grid(), mat);
    this.mesh.position.y = WATER_Y;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // A grid that is fine (1 unit) in the middle and grows geometrically out to the horizon.
  _grid() {
    const xs = [];
    for (let i = -64; i <= 64; i++) xs.push(i);
    let v = 64, step = 1;
    while (v < 100000) { step *= 1.14; v += step; xs.push(v); xs.unshift(-v); }
    const n = xs.length;
    const pos = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = xs[i]; pos[k + 1] = 0; pos[k + 2] = xs[j];
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  // Per-cell sea state: R = choppiness, G = depth, B = river.
  _seaMap() {
    const a = this.a;
    const region = new Noise(a.seed ^ 0x51ab, 1 / 700, 2);
    const rapids = new Noise(a.seed ^ 0x2a91, 1 / 90, 2);
    // Land fraction around each cell, for finding narrow straits.
    const land = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) land[k] = a.nav[k] <= NAV.RIVER ? 1 : 0;
    const lf = boxBlur(land, 6);
    const chop = new Float32Array(N * N), depth = new Float32Array(N * N), river = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
      const nv = a.nav[k];
      depth[k] = Math.min(1, Math.max(0, -a.coarseAt(x, z) / 4.2));
      if (nv <= NAV.RIVER) {
        river[k] = 1;
        chop[k] = 0.05 + 0.6 * Math.max(0, rapids.get2(x, z) - 0.25);
        continue;
      }
      const r = 0.3 + 1.3 * smooth(region.get2(x, z) * 0.6 + 0.5);
      const strait = Math.max(0, 1 - Math.abs(lf[k] - 0.45) / 0.25);
      chop[k] = (nv === NAV.DEEP ? 0.75 : 0.42) * r + 0.7 * strait;
    }
    this.chop = boxBlur(boxBlur(chop, 1), 1);
    const dep = boxBlur(depth, 1), riv = boxBlur(river, 1);
    const data = new Uint8Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      data[k * 4] = Math.min(255, this.chop[k] * 127.5);
      data[k * 4 + 1] = dep[k] * 255;
      data[k * 4 + 2] = riv[k] * 255;
      data[k * 4 + 3] = 255;
    }
    const tex = (this.tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat));
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }

  chopAt(x, z) {
    const i = Math.min(N - 1, Math.max(0, Math.floor(x / CELL))), j = Math.min(N - 1, Math.max(0, Math.floor(z / CELL)));
    return Math.min(2, this.chop[j * N + i]);
  }

  // CPU twin of the shader's waves so boats can ride them.
  heightAt(x, z) {
    const u = this.uniforms;
    const chop = this.chopAt(x, z) * u.uWind.value;
    const amp = 0.03 + 0.2 * chop;
    const d = u.uWindDir.value;
    const t = u.uTime.value * (0.7 + 0.5 * u.uWind.value);
    const dot = (ang, f) => { const c = Math.cos(ang), s = Math.sin(ang); return ((d.x * c - d.y * s) * x + (d.x * s + d.y * c) * z) * f; };
    const pix = u.uGrid.value;
    const lp = (f) => { const e = Math.min(1, Math.max(0, (f * pix - 0.35) / 0.65)); return 1 - e * e * (3 - 2 * e); };
    let h = Math.sin(dot(0.3, 0.07) - t * 0.45) * 0.35 * lp(0.07);
    h += Math.sin(dot(0, 0.55) - t * 1.6) * 0.5 * lp(0.55);
    h += Math.sin(dot(0.6, 0.9) - t * 2.1 + 1.3) * 0.33 * lp(0.9);
    h += Math.sin(dot(-0.8, 1.45) - t * 2.7 + 2.1) * 0.24 * lp(1.45);
    h += Math.sin(dot(1.9, 2.6) - t * 3.6) * 0.18 * chop * lp(2.6);
    return WATER_Y + h * amp * this.uniforms.uAmp.value;
  }

  update(time, rig, dist, wind, windDir, sun) {
    const u = this.uniforms;
    u.uTime.value = time * 0.5; // half speed: calm, readable motion
    u.uWind.value = wind;
    u.uWindDir.value.set(Math.cos(windDir), Math.sin(windDir));
    u.uSun.value = sun;
    u.uFocus.value.set(rig.tx, rig.tz, Math.max(30, dist));
    u.uPix.value = Math.max(0.25, 2 ** Math.ceil(Math.log2(dist / 220)));
    // The grid is 1 unit per cell when close and scales up with zoom.
    const s = Math.max(0.5, 2 ** Math.round(Math.log2(dist / 90)));
    u.uAmp.value = 1 - Math.min(1, Math.max(0, (dist - 100) / 150));
    u.uGrid.value = s;
    this.mesh.scale.set(s, 1, s);
    this.mesh.position.set(Math.round(rig.tx / s) * s, WATER_Y, Math.round(rig.tz / s) * s);
  }
}

function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

function boxBlur(src, r) {
  // Separable box blur on the N×N grid.
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    let s = 0, c = 0;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < N) { s += src[j * N + i]; c++; }
    for (let i = 0; i < N; i++) {
      tmp[j * N + i] = s / c;
      const o = i - r, n = i + r + 1;
      if (o >= 0) { s -= src[j * N + o]; c--; }
      if (n < N) { s += src[j * N + n]; c++; }
    }
  }
  for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let j = -r; j <= r; j++) if (j >= 0 && j < N) { s += tmp[j * N + i]; c++; }
    for (let j = 0; j < N; j++) {
      out[j * N + i] = s / c;
      const o = j - r, n = j + r + 1;
      if (o >= 0) { s -= tmp[o * N + i]; c--; }
      if (n < N) { s += tmp[n * N + i]; c++; }
    }
  }
  return out;
}
