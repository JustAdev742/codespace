// Portal Traversal Lab: input, gun logic, HUD, scripted demos and the frame loop.

import * as THREE from 'three';
import { World, G } from './physics.js';
import { makeLevel } from './level.js';
import { PortalRenderer } from './render.js';
import { planPlacement, pairTransform, rotationOf, PORTAL_RADIUS } from './portal-math.js';

const C_LIGHT = 299792458;
const G_NEWTON = 6.6743e-11;
const M_JUPITER = 1.89813e27;
const RIM_MASS = (Math.PI / 2) * PORTAL_RADIUS * C_LIGHT ** 2 / G_NEWTON;   // kg, flat-face rim
const SHOT_COST = 0.34;
const RECHARGE_PER_S = 0.45;
const RANGE = 80;

const REASONS = {
  'out-of-range': 'Out of range',
  'surface-rejects': 'Surface rejects portals',
  'surface-too-small': 'Surface too small',
  'too-close-to-edge': 'Too close to an edge',
  'overlaps-other': 'Overlaps the other portal',
  obstructed: 'Obstructed',
  interlock: 'Closure deferred: aperture occupied',
  'no-surface': 'Nothing to hit',
  recharging: 'Capacitor recharging',
};

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const sci = (x) => {
  if (!Number.isFinite(x) || x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  return `${(x / 10 ** e).toFixed(1)}×10${String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`;
};

export class App {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#view');
    this.$ = (id) => root.querySelector(`#${id}`);
    this.settings = { mode: 'kinematic', drag: true, depth: 3, opaque: false, interlock: true };
    this.charge = 1;
    this.keys = new Set();
    this.locked = false;
    this.drag = null;
    this.touch = { move: null, look: null };
    this.lastHud = 0;
    this.toastTimer = 0;
    this.lastTraversal = null;
    this.newWorld();
    this.renderer = new PortalRenderer(this.canvas, this.world, { maxDepth: this.settings.depth });
    this.renderer.animateSwirl = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.bindInput();
    this.bindUi();
    this.runDemo('infinite', { quiet: true });
    this.last = performance.now();
    window.addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ world
  newWorld() {
    this.level = makeLevel();
    this.world = new World(this.level, { mode: this.settings.mode, drag: this.settings.drag, interlock: this.settings.interlock });
    const s = this.level.spawn;
    this.world.addPlayer({ pos: s.pos, yaw: s.yaw, pitch: s.pitch });
    if (this.renderer) {
      this.renderer.world = this.world;
      for (const [, rec] of this.renderer.bodyMeshes) this.renderer.scene.remove(rec.main, rec.clone);
      this.renderer.bodyMeshes.clear();
    }
    this.lastTraversal = null;
    this.seenSeq = 0;
  }

  viewDir(p = this.world.player) {
    return v3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  }

  /** Cast the gun ray, following it through linked portals (up to two hops). */
  aim() {
    const w = this.world;
    let origin = w.eyeOf();
    let dir = this.viewDir();
    let travelled = 0;
    for (let hop = 0; hop < 3; hop++) {
      const hit = w.raycast(origin, dir, RANGE);
      if (!hit) return { hit: null, plan: { ok: false, reason: 'no-surface' } };
      let through = null;
      if (w.linked()) {
        for (const k of ['A', 'B']) {
          const p = w.portals[k];
          const denom = dir.dot(p.frame.normal);
          if (denom >= -1e-6) continue;
          const t = -p.frame.signedDistance(origin) / denom;
          if (t < 0 || t > hit.t + 0.01) continue;
          const at = origin.clone().addScaledVector(dir, t);
          if (p.frame.lateralSq(at) < p.R * p.R) { through = { k, t, at }; break; }
        }
      }
      if (!through) {
        const total = travelled + hit.t;
        const other = (key) => w.portals[key]?.frame ?? null;
        const make = (which) => planPlacement({
          hit: hit.point, normal: hit.normal, box: hit.box, boxes: w.boxes, viewDir: dir,
          distance: total, other: other(which === 'A' ? 'B' : 'A'), range: RANGE,
        });
        return { hit, total, planFor: make, plan: make('A') };
      }
      const T = pairTransform(w.portals[through.k].frame, w.portals[w.partner(through.k)].frame);
      travelled += through.t;
      dir = dir.clone().applyMatrix3(rotationOf(T)).normalize();
      origin = through.at.clone().applyMatrix4(T).addScaledVector(dir, 0.01);
    }
    return { hit: null, plan: { ok: false, reason: 'no-surface' } };
  }

  shoot(which) {
    if (this.charge < SHOT_COST) { this.toast(`Portal ${which}: ${REASONS.recharging}`, 'bad'); return { ok: false, reason: 'recharging' }; }
    const a = this.aim();
    const plan = a.planFor ? a.planFor(which) : a.plan;
    if (!plan.ok) {
      this.toast(`Portal ${which} failed: ${REASONS[plan.reason] ?? plan.reason}${plan.detail ? ` (${plan.detail})` : ''}`, 'bad');
      return plan;
    }
    const res = this.world.placePortal(which, plan);
    if (!res.ok) { this.toast(`Portal ${which}: ${REASONS[res.reason] ?? res.reason}`, 'bad'); return res; }
    this.charge -= SHOT_COST;
    this.toast(`Portal ${which} opened${plan.nudged ? ' (slid to fit the surface)' : ''}`, which === 'A' ? 'a' : 'b');
    return res;
  }

  spawnBall() {
    const p = this.world.player;
    const pos = this.world.eyeOf().addScaledVector(this.viewDir(), 1.2);
    const vel = this.viewDir().multiplyScalar(3).add(p.vel);
    this.world.addSphere({ pos, vel });
  }

  // ------------------------------------------------------------------ demos
  placeAt(which, hit, normal, boxId, viewDir = v3(0, 0, -1)) {
    const box = this.world.boxes.find((b) => b.id === boxId);
    const plan = planPlacement({ hit, normal, box, boxes: this.world.boxes, viewDir, distance: 1, other: this.world.portals[which === 'A' ? 'B' : 'A']?.frame ?? null });
    if (plan.ok) this.world.placePortal(which, plan);
    return plan;
  }

  pose(pos, target) {
    const p = this.world.player;
    p.root.copy(pos);
    p.vel.set(0, 0, 0);
    const eye = pos.clone().add(v3(0, p.eye, 0));
    const d = target.clone().sub(eye);
    p.yaw = Math.atan2(-d.x, -d.z);
    p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    p.roll = 0;
  }

  runDemo(name, { quiet = false } = {}) {
    this.newWorld();
    const w = this.world;
    const piston = w.boxes.find((b) => b.id === 'piston');
    const demos = {
      infinite: () => {
        this.placeAt('A', v3(-4, 0, 3), v3(0, 1, 0), 'floor');
        this.placeAt('B', v3(-4, 10, 3), v3(0, -1, 0), 'ceiling');
        w.addSphere({ pos: v3(-4, 6, 3), color: new THREE.Color(0xffb347) });
        this.pose(v3(-4, 0, 12.5), v3(-4, 3.4, 3));
        return 'Stacked pair: a floor portal under a ceiling portal. Compare the two physics models.';
      },
      fling: () => {
        this.placeAt('A', v3(-2, 0, -6), v3(0, 1, 0), 'floor');
        this.placeAt('B', v3(-14, 1.1, 5), v3(1, 0, 0), 'wall-west');
        w.addSphere({ pos: v3(-2, 9.2, -6), color: new THREE.Color(0xffb347) });
        this.pose(v3(4, 0, 6), v3(-6, 2, -1));
        return 'Fling: a 9 m drop into a floor portal comes out of a wall portal sideways.';
      },
      piston: () => {
        this.placeAt('A', v3(7.7, piston.min.y, 7.7), v3(0, -1, 0), 'piston');
        this.placeAt('B', v3(0, 1.1, 14), v3(0, 0, -1), 'wall-south');
        w.addSphere({ pos: v3(7.7, 0.25, 7.7), color: new THREE.Color(0xffb347) });
        piston.enabled = true;
        this.pose(v3(-4, 0, 1), v3(3, 1.5, 11));
        return 'Moving mouth: the piston brings portal A down onto a resting ball. Watch it leave portal B.';
      },
      facing: () => {
        this.placeAt('A', v3(-4, 3.2, -14), v3(0, 0, 1), 'wall-north');
        this.placeAt('B', v3(-4, 3.2, 14), v3(0, 0, -1), 'wall-south');
        this.pose(v3(-4, 0, 3), v3(-4, 3, -14));
        return 'Facing portals: each view contains the other. Raise or lower the recursion depth.';
      },
      climb: () => {
        this.placeAt('A', v3(8, 0.5, -14), v3(0, 0, 1), 'wall-north');
        this.placeAt('B', v3(14, 8, 9), v3(-1, 0, 0), 'wall-east');
        this.pose(v3(8, 0, -8), v3(8, 1.4, -14));
        return 'Height test: portal B is 6.9 m higher. Walk in (W) under each physics model.';
      },
    };
    const msg = (demos[name] ?? demos.infinite)();
    this.renderer?.resize();
    if (!quiet) this.toast(msg, 'info', 5200);
    this.activeDemo = name;
    this.root.querySelectorAll('[data-demo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.demo === name)));
    return msg;
  }

  setMode(mode) {
    this.settings.mode = mode;
    this.world.mode = mode;
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const c = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      this.root.classList.toggle('is-locked', this.locked);
      this.skipMoves = 3; // Chrome can report a large spurious movement right after locking
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (this.locked) {
        if (e.button === 0) this.shoot('A');
        if (e.button === 2) this.shoot('B');
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        if (this.skipMoves > 0) { this.skipMoves--; return; }
        if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return; // discard warps
        this.look(e.movementX, e.movementY);
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.look(dx, dy);
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.drag) return;
      if (this.drag.moved < 6) {
        if (this.drag.button === 0) this.shoot('A');
        if (this.drag.button === 2) this.shoot('B');
      }
      this.drag = null;
    });
    window.addEventListener('keydown', (e) => {
      // let a focused slider keep its arrow keys; everything else drives the lab
      if (e.target?.tagName === 'INPUT' && e.target.type === 'range' && e.code.startsWith('Arrow')) return;
      this.keys.add(e.code);
      const map = {
        KeyQ: () => this.shoot('A'), KeyE: () => this.shoot('B'), KeyF: () => this.spawnBall(),
        KeyC: () => this.closeBoth(), KeyM: () => this.setMode(this.settings.mode === 'kinematic' ? 'conservative' : 'kinematic'),
        KeyR: () => this.runDemo(this.activeDemo ?? 'infinite'), KeyV: () => this.toggleLook(), KeyP: () => this.togglePiston(),
        Digit1: () => this.setDepth(1), Digit2: () => this.setDepth(2), Digit3: () => this.setDepth(3), Digit4: () => this.setDepth(4),
      };
      if (!e.repeat && map[e.code]) map[e.code]();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // touch: left half moves, right half looks
    c.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const left = t.clientX < window.innerWidth * 0.45;
        if (left && !this.touch.move) this.touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
        else if (!this.touch.look) this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) { this.touch.move.dx = t.clientX - this.touch.move.x0; this.touch.move.dy = t.clientY - this.touch.move.y0; }
        if (this.touch.look?.id === t.identifier) {
          this.look((t.clientX - this.touch.look.x) * 1.6, (t.clientY - this.touch.look.y) * 1.6);
          this.touch.look.x = t.clientX; this.touch.look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) this.touch.move = null;
        if (this.touch.look?.id === t.identifier) this.touch.look = null;
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  look(dx, dy) {
    const p = this.world.player;
    p.yaw -= dx * 0.0025;
    p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - dy * 0.0025));
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* pointer lock unavailable: drag-to-look stays active */ }
  }

  closeBoth() {
    let blocked = false;
    for (const k of ['A', 'B']) {
      const r = this.world.closePortal(k);
      if (!r.ok) blocked = true;
    }
    this.toast(blocked ? REASONS.interlock : 'Portals closed', blocked ? 'bad' : 'info');
  }

  toggleLook() {
    this.settings.opaque = !this.settings.opaque;
    this.renderer.opaque = this.settings.opaque;
    this.$('opt-look').checked = this.settings.opaque;
  }

  togglePiston() {
    const p = this.world.boxes.find((b) => b.id === 'piston');
    p.enabled = !p.enabled;
    this.$('opt-piston').checked = p.enabled;
  }

  setDepth(n) {
    this.settings.depth = n;
    this.renderer.maxDepth = n;
    this.$('opt-depth').value = String(n);
    this.$('depth-val').textContent = String(n);
  }

  bindUi() {
    // return keyboard focus to the lab after any HUD button press
    this.root.addEventListener('click', (e) => { if (e.target.closest('button')) e.target.closest('button').blur(); });
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    this.root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => this.runDemo(b.dataset.demo)));
    this.$('opt-depth').addEventListener('input', (e) => this.setDepth(Number(e.target.value)));
    this.$('opt-look').addEventListener('change', (e) => { this.settings.opaque = e.target.checked; this.renderer.opaque = e.target.checked; });
    this.$('opt-drag').addEventListener('change', (e) => { this.settings.drag = e.target.checked; this.world.drag = e.target.checked; });
    this.$('opt-interlock').addEventListener('change', (e) => { this.settings.interlock = e.target.checked; this.world.interlock = e.target.checked; });
    this.$('opt-piston').addEventListener('change', (e) => { this.world.boxes.find((b) => b.id === 'piston').enabled = e.target.checked; });
    this.$('btn-close').addEventListener('click', () => this.closeBoth());
    this.$('btn-ball').addEventListener('click', () => this.spawnBall());
    this.$('btn-reset').addEventListener('click', () => this.runDemo(this.activeDemo ?? 'infinite'));
    this.$('btn-enter').addEventListener('click', () => {
      this.$('intro').hidden = true;
      if (!matchMedia('(pointer: coarse)').matches) this.requestLock();
    });
    this.$('btn-help').addEventListener('click', () => { this.$('intro').hidden = false; });
    this.canvas.addEventListener('dblclick', () => this.requestLock());
    // on-screen buttons for touch devices
    const hold = (id, on, off) => {
      const el = this.$(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      if (off) for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, off);
    };
    hold('t-a', () => this.shoot('A'));
    hold('t-b', () => this.shoot('B'));
    hold('t-ball', () => this.spawnBall());
    hold('t-jump', () => { this.touchJump = true; }, () => { this.touchJump = false; });
  }

  // ------------------------------------------------------------------ loop
  applyInput() {
    const k = this.keys;
    const p = this.world.player;
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (this.touch.move) {
      fwd = Math.max(-1, Math.min(1, -this.touch.move.dy / 60));
      right = Math.max(-1, Math.min(1, this.touch.move.dx / 60));
    }
    p.input.forward = fwd;
    p.input.right = right;
    p.input.jump = k.has('Space') || !!this.touchJump;
    p.input.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  }

  frame(t) {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.applyInput();
    this.world.step(dt);
    this.charge = Math.min(1, this.charge + RECHARGE_PER_S * dt);
    const a = this.aim();
    this.aimState = a;
    this.renderer.setPreview(a.plan?.ok ? a.plan : null);
    this.renderer.render(dt);
    this.consumeEvents();
    if (t - this.lastHud > 100) { this.updateHud(); this.lastHud = t; }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  consumeEvents() {
    for (const e of this.world.events) {
      if (e.seq <= (this.seenSeq ?? 0)) continue;
      if (e.type === 'reflected') this.toast(`Reflected: climbing that step needs ${fmt(e.need, 1)} m/s`, 'bad');
      if (e.type === 'interlock') this.toast(REASONS.interlock, 'bad');
    }
    this.seenSeq = this.world.seq ?? 0;
    const tr = this.world.ledger.traversals;
    if (tr.length) this.lastTraversal = tr[tr.length - 1];
  }

  // ------------------------------------------------------------------ HUD
  toast(msg, kind = 'info', ms = 3200) {
    const el = this.$('toast');
    el.textContent = msg;
    el.dataset.kind = kind;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  updateHud() {
    const w = this.world;
    const p = w.player;
    for (const k of ['A', 'B']) {
      const chip = this.$(`chip-${k}`);
      chip.dataset.state = w.portals[k] ? 'open' : 'closed';
      chip.querySelector('b').textContent = w.portals[k] ? 'open' : 'closed';
    }
    this.$('chip-link').dataset.state = w.linked() ? 'open' : 'closed';
    this.$('chip-link').querySelector('b').textContent = w.linked() ? 'linked' : 'no link';
    this.$('charge-bar').style.setProperty('--fill', `${Math.round(this.charge * 100)}%`);
    this.$('charge-val').textContent = `${Math.round(this.charge * 100)}%`;
    const xh = this.$('crosshair');
    xh.dataset.a = w.portals.A ? 'on' : 'off';
    xh.dataset.b = w.portals.B ? 'on' : 'off';
    const a = this.aimState;
    const tgt = this.$('target');
    if (a?.hit) {
      const okA = a.planFor ? a.planFor('A') : a.plan;
      tgt.dataset.ok = okA.ok ? 'yes' : 'no';
      tgt.textContent = `${fmt(a.total, 1)} m · ${a.hit.box.name ?? a.hit.box.id} · ${okA.ok ? (okA.nudged ? 'will slide to fit' : 'ready') : REASONS[okA.reason] ?? okA.reason}`;
    } else {
      tgt.dataset.ok = 'no';
      tgt.textContent = 'no surface';
    }
    // ledger
    const L = w.ledger;
    this.$('led-ma').textContent = `${L.mouthMass.A >= 0 ? '+' : ''}${fmt(L.mouthMass.A, 0)} kg`;
    this.$('led-mb').textContent = `${L.mouthMass.B >= 0 ? '+' : ''}${fmt(L.mouthMass.B, 0)} kg`;
    this.$('led-e').textContent = `${L.energyByMouths >= 0 ? '+' : ''}${fmt(L.energyByMouths / 1000, 2)} kJ`;
    this.$('led-n').textContent = String(L.traversals.length);
    const lt = this.lastTraversal;
    this.$('led-last').textContent = lt
      ? `${lt.id === 'player' ? 'you' : lt.id}: ${lt.from}→${lt.to} ${fmt(lt.vIn, 1)} → ${lt.reflected ? 'reflected' : `${fmt(lt.vOut, 1)} m/s`}, Δh ${lt.yOut - lt.yIn >= 0 ? '+' : ''}${fmt(lt.yOut - lt.yIn, 1)} m`
      : 'none yet';
    // model readout: the same crossing under two real-physics models
    const speed = p.vel.length();
    const gam2 = 1 / (1 - (speed / C_LIGHT) ** 2);
    const tidal = gam2 * speed * speed * 1.8 / (PORTAL_RADIUS ** 2) / G;
    this.$('mod-speed').textContent = `${fmt(speed, 1)} m/s`;
    this.$('mod-tidal').textContent = `${fmt(tidal, 2)} g`;
    this.$('mod-tidal').dataset.level = tidal > 1 ? 'high' : 'ok';
    this.$('mod-rim').textContent = `−${sci(RIM_MASS)} kg (${fmt(RIM_MASS / M_JUPITER, 2)} M♃)`;
    this.$('mode-note').textContent = w.mode === 'kinematic'
      ? 'Game rule: speed relative to the mouth is kept. In gravity this creates energy.'
      : 'Energy-conserving: crossing to a higher mouth costs g·Δh of kinetic energy, or reflects you.';
  }
}
