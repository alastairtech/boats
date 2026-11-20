// Entry point: builds the archipelago, simulation, view and UI, and handles map input.
import * as THREE from 'three';
import { Archipelago } from './archipelago.js';
import { Navigator } from './nav.js';
import { Sim, dateString } from './sim.js';
import { View } from './view.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game');
const loading = document.getElementById('loading');

function boot() {
  const params = new URLSearchParams(location.search);
  const save = params.has('new') ? null : Sim.loadSave();
  const seed = save ? save.seed : Number(params.get('new')) || Number(params.get('seed')) || (Math.random() * 2 ** 31) | 0;

  const arch = new Archipelago();
  arch.generate(seed);
  const nav = new Navigator(arch);
  const sim = new Sim(arch, nav);
  if (save) sim.restore(save); else sim.newGame();

  let view;
  try { view = new View(canvas, arch, sim); } catch (err) {
    document.getElementById('nogl').classList.add('show');
    throw err;
  }
  let following = null;
  const ui = new UI(sim, view, {
    follow: (b) => { following = b; },
    following: () => following,
    newGame: () => { Sim.clearSave(); location.href = `${location.pathname}?new=${(Math.random() * 2 ** 31) | 0}`; },
  });

  // Start over the biggest port city.
  const home = [...arch.towns].filter((t) => t.tier === 'city').sort((a, b) => b.pop - a.pop)[0] || arch.towns[0];
  if (save && sim.boats.length) view.focus(sim.boats[0].x, sim.boats[0].z, 80);
  else view.focus(home.x, home.z, 90);
  if (!save) {
    ui.news(`Welcome! Your company starts at ${home.name}. Tap its shipyard ⚓ to buy your first boat, then hire a captain from 🧑‍✈️ Captains.`, 'good', home);
    ui.open('help');
  } else ui.news(`Welcome back! It's ${dateString(sim.day)}.`, 'info');

  // ------------------------------------------------------------- input
  const rig = view.rig;
  const pointers = new Map();
  let drag = null;
  let gesture = null;

  const twoFinger = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (pointers.size === 1) {
      if (e.button === 2) { gesture = { rotate: true, x: e.clientX, yaw: rig.yaw }; return; }
      const g = view.groundPoint(e.clientX, e.clientY);
      drag = g ? { gx: g.x, gz: g.z, moved: false } : null;
    } else if (pointers.size === 2) {
      drag = null;
      const g = twoFinger();
      gesture = { d: g.d, ang: g.ang, dist: rig.dist, yaw: rig.yaw };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (gesture?.rotate) { rig.yaw = gesture.yaw - (e.clientX - gesture.x) * 0.008; return; }
    if (pointers.size === 2 && gesture) {
      const g = twoFinger();
      rig.dist = THREE.MathUtils.clamp(gesture.dist * gesture.d / Math.max(g.d, 1), rig.minD, rig.maxD);
      rig.yaw = gesture.yaw - (g.ang - gesture.ang);
      return;
    }
    if (drag && pointers.size === 1) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) drag.moved = true;
      if (!drag.moved) return;
      following = null;
      // keep the grabbed ground point under the finger
      for (let i = 0; i < 2; i++) {
        view._camera();
        const g = view.groundPoint(e.clientX, e.clientY);
        if (!g) break;
        rig.tx += drag.gx - g.x;
        rig.tz += drag.gz - g.z;
      }
    }
  });

  const end = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    const tap = drag && !drag.moved && pointers.size === 0 && !gesture && performance.now() - p.t0 < 600;
    if (tap) {
      const hit = view.pick(e.clientX, e.clientY, !!ui.editing);
      if (hit) ui.select(hit);
      else if (!ui.editing) ui.select(null);
    }
    if (pointers.size === 0) { drag = null; gesture = null; } else if (pointers.size === 1) gesture = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 0.08 : 0.0018;
    const before = view.groundPoint(e.clientX, e.clientY);
    rig.dist = THREE.MathUtils.clamp(rig.dist * Math.exp(e.deltaY * k), rig.minD, rig.maxD);
    // zoom toward the cursor
    view._camera();
    const after = view.groundPoint(e.clientX, e.clientY);
    if (before && after && !following) { rig.tx += before.x - after.x; rig.tz += before.z - after.z; }
  }, { passive: false });

  const keys = new Set();
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') { sim.speed = sim.speed ? 0 : 1; ui._speedButtons(); e.preventDefault(); }
    const sp = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 }[e.code];
    if (sp) { sim.speed = sp; ui._speedButtons(); }
    if (e.code === 'Escape') ui.close();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const keyPan = (dt) => {
    let f = 0, r = 0, z = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f++;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f--;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r++;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) r--;
    if (keys.has('Equal') || keys.has('NumpadAdd')) z--;
    if (keys.has('Minus') || keys.has('NumpadSubtract')) z++;
    if (!f && !r && !z) return;
    following = null;
    const s = rig.dist * dt * 1.2;
    rig.tx += (-Math.sin(rig.yaw) * f - Math.cos(rig.yaw) * r) * s;
    rig.tz += (Math.cos(rig.yaw) * f - Math.sin(rig.yaw) * r) * s;
    rig.dist = THREE.MathUtils.clamp(rig.dist * Math.exp(z * dt * 1.5), rig.minD, rig.maxD);
  };

  addEventListener('visibilitychange', () => { if (document.hidden) sim.save(); });
  addEventListener('pagehide', () => sim.save());

  // ------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    sim.update(dt);
    keyPan(dt);
    if (following) {
      if (!sim.boats.includes(following)) following = null;
      else {
        const k = 1 - Math.exp(-4 * dt);
        rig.tx += (following.x - rig.tx) * k;
        rig.tz += (following.z - rig.tz) * k;
      }
    }
    view.frame(dt);
    ui.tick(dt);
    requestAnimationFrame(frame);
  }
  loading.classList.add('done');
  requestAnimationFrame(frame);
  window.__game = { arch, sim, view, ui, nav };
}

// Let the loading screen paint before the heavy generation work.
requestAnimationFrame(() => setTimeout(boot, 30));
