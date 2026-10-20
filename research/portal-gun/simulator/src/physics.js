// Physics for the portal simulator: rigid spheres, a player built from three spheres,
// axis-aligned static and kinematic boxes, and a linked portal pair cut into box faces.
//
// What is modelled
//   * Semi-implicit Euler; each frame step is split into equal sub-steps of at most 1/240 s
//     and 0.1 m of travel (up to 64), with gravity and optional quadratic air drag.
//   * Sphere/box collision. A box that hosts an open, linked portal has a circular hole:
//     bodies whose centre projects inside the aperture are exempt from the box and
//     collide only with the rim circle (a thin plate with a round hole).
//   * Traversal when a body's centre (the player's eye) crosses the portal plane inside
//     the aperture: position and orientation map through T(A->B) = M_B R_y(pi) M_A^-1;
//     velocity maps by one of two rules (see portal-math.exitVelocity).
//   * Moving mouths (a portal on the piston) use velocity relative to the mouth.
//   * A conservation ledger: apparent mouth masses (Gauss-law bookkeeping) and the
//     mechanical energy the mouths must have supplied for each traversal.
// What is not modelled: spacetime curvature, tidal forces, fields leaking through,
// fluids, rotation of bodies, stacking stability. See report/05-simulator-tutorial.md, limitations.

import { Vector3 } from 'three';
import { PORTAL_RADIUS, pairTransform, exitVelocity, closestPointOnRim, rotationOf } from './portal-math.js';

export const G = 9.81;
export const MAX_SPEED = 200; // numerical safety cap, not physics
const AIR_DENSITY = 1.2;

const tmp = new Vector3();
const tmp2 = new Vector3();

export class Ledger {
  constructor() { this.reset(); }
  reset() {
    this.mouthMass = { A: 0, B: 0 };
    this.energyByMouths = 0;   // J the mouths must supply for energy to balance
    this.traversals = [];
  }
  record(entry) {
    this.traversals.push(entry);
    if (this.traversals.length > 200) this.traversals.shift();
    if (!entry.reflected) {
      this.mouthMass[entry.from] += entry.m;
      this.mouthMass[entry.to] -= entry.m;
      this.energyByMouths += entry.dKE + entry.dPE;
    }
  }
}

function makePiston(spec) {
  // Bottom face height as a function of phase: hold up, slam down, hold, rise slowly.
  const { top, bottom, holdUp = 2.0, slam = 0.55, holdDown = 0.8, rise = 3.0 } = spec;
  const period = holdUp + slam + holdDown + rise;
  return {
    period,
    y(phase) {
      let t = ((phase % period) + period) % period;
      if (t < holdUp) return top;
      t -= holdUp;
      if (t < slam) return top + (bottom - top) * (t / slam);
      t -= slam;
      if (t < holdDown) return bottom;
      t -= holdDown;
      return bottom + (top - bottom) * (t / rise);
    },
  };
}

export class World {
  constructor(level, { mode = 'kinematic', drag = true, interlock = true } = {}) {
    this.boxes = level.boxes.map((b, i) => ({
      id: b.id ?? `box${i}`, name: b.name ?? b.id ?? `box${i}`, portalable: b.portalable !== false,
      min: b.min.clone(), max: b.max.clone(), vel: new Vector3(), kinematic: b.kinematic ?? null, color: b.color,
    }));
    for (const b of this.boxes) {
      if (b.kinematic) {
        b.piston = makePiston(b.kinematic);
        b.phase = 0;
        b.height = b.max.y - b.min.y;
        b.enabled = b.kinematic.enabled ?? false;
      }
    }
    this.level = level;
    this.mode = mode;
    this.drag = drag;
    this.interlock = interlock;
    this.portals = { A: null, B: null };
    this.bodies = [];
    this.player = null;
    this.time = 0;
    this.ledger = new Ledger();
    this.events = [];
    this.nextId = 1;
  }

  // ------------------------------------------------------------------ entities
  addSphere({ pos, vel = new Vector3(), r = 0.25, m = 10, restitution = 0.35, color = null }) {
    const body = { id: `ball${this.nextId++}`, kind: 'sphere', r, m, restitution, color,
      pos: pos.clone(), vel: vel.clone(), prev: pos.clone(), grounded: false, cdA: 0.47 * Math.PI * r * r };
    this.bodies.push(body);
    return body;
  }

  addPlayer({ pos, yaw = 0, pitch = 0 }) {
    this.player = {
      id: 'player', kind: 'player', root: pos.clone(), vel: new Vector3(), yaw, pitch, roll: 0,
      radius: 0.3, height: 1.8, eye: 1.62, m: 75, grounded: false, prevEye: pos.clone().add(new Vector3(0, 1.62, 0)),
      cdA: 0.7, input: { forward: 0, right: 0, jump: false, sprint: false },
    };
    return this.player;
  }

  eyeOf(p = this.player) { return p.root.clone().add(new Vector3(0, p.eye, 0)); }

  linked() { return !!(this.portals.A && this.portals.B); }

  partner(which) { return which === 'A' ? 'B' : 'A'; }

  transform(which) {
    return pairTransform(this.portals[which].frame, this.portals[this.partner(which)].frame);
  }

  hostOf(which) {
    const p = this.portals[which];
    return p ? this.boxes.find((b) => b.id === p.hostId) : null;
  }

  mouthVelocity(which) {
    const h = this.hostOf(which);
    return h ? h.vel.clone() : new Vector3();
  }

  // ------------------------------------------------------------------ portals
  /** Bodies (and the player) currently straddling portal `which`. */
  occupants(which) {
    const p = this.portals[which];
    if (!p) return [];
    const R = p.R;
    const out = [];
    for (const b of this.bodies) {
      const d = p.frame.signedDistance(b.pos);
      if (Math.abs(d) < b.r && p.frame.lateralSq(b.pos) < (R + b.r) ** 2) out.push(b);
    }
    if (this.player) {
      for (const s of this.playerSpheres()) {
        const d = p.frame.signedDistance(s);
        if (Math.abs(d) < this.player.radius && p.frame.lateralSq(s) < (R + this.player.radius) ** 2) {
          out.push(this.player);
          break;
        }
      }
    }
    return out;
  }

  placePortal(which, plan) {
    if (!plan.ok) return plan;
    const old = this.portals[which];
    if (old && this.linked()) {
      const occ = this.occupants(which);
      if (occ.length && this.interlock) {
        this.emit({ type: 'interlock', which, count: occ.length });
        return { ok: false, reason: 'interlock', detail: 'aperture occupied: closure deferred' };
      }
      this.ejectOccupants(which, occ);
    }
    this.portals[which] = { frame: plan.frame, prevFrame: plan.frame, hostId: plan.hostId, R: PORTAL_RADIUS, openedAt: this.time };
    this.emit({ type: 'opened', which });
    return plan;
  }

  closePortal(which, { override = false } = {}) {
    if (!this.portals[which]) return { ok: true };
    const occ = this.linked() ? this.occupants(which) : [];
    if (occ.length && this.interlock && !override) {
      this.emit({ type: 'interlock', which, count: occ.length });
      return { ok: false, reason: 'interlock', detail: 'aperture occupied: closure deferred' };
    }
    this.ejectOccupants(which, occ);
    this.portals[which] = null;
    this.emit({ type: 'closed', which });
    return { ok: true, ejected: occ.length };
  }

  /** Safe-closure fallback: push straddling bodies fully onto the side holding their centre. */
  ejectOccupants(which, occ) {
    const p = this.portals[which];
    if (!p) return;
    for (const b of occ) {
      if (b.kind === 'player') {
        const eye = this.eyeOf(b);
        const d = p.frame.signedDistance(eye);
        b.root.addScaledVector(p.frame.normal, Math.max(0, b.radius + 0.05 - d));
        continue;
      }
      const d = p.frame.signedDistance(b.pos);
      b.pos.addScaledVector(p.frame.normal, b.r + 0.02 - d);
      this.emit({ type: 'ejected', id: b.id });
    }
  }

  emit(e) {
    e.t = this.time;
    e.seq = this.seq = (this.seq ?? 0) + 1;
    this.events.push(e);
    if (this.events.length > 100) this.events.shift();
  }

  // ------------------------------------------------------------------ stepping
  step(dt) {
    let vmax = 1;
    for (const b of this.bodies) vmax = Math.max(vmax, b.vel.length());
    if (this.player) vmax = Math.max(vmax, this.player.vel.length());
    const n = Math.min(64, Math.max(1, Math.ceil(dt / Math.min(1 / 240, 0.1 / vmax))));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  substep(h) {
    this.time += h;
    // remember where each mouth was, so crossings by a MOVING mouth are detected too
    for (const which of ['A', 'B']) if (this.portals[which]) this.portals[which].prevFrame = this.portals[which].frame;
    this.moveKinematic(h);
    for (const b of this.bodies) this.integrateSphere(b, h);
    if (this.player) this.integratePlayer(h);
    this.sphereContacts();
  }

  moveKinematic(h) {
    for (const box of this.boxes) {
      if (!box.kinematic) continue;
      if (!box.enabled) { box.vel.set(0, 0, 0); continue; }
      const yNow = box.min.y;
      const yNext = box.piston.y(box.phase + h);
      const dy = yNext - yNow;
      // safety stop: never crush a body that cannot pass through a portal on the piston
      if (dy < 0 && this.wouldCrush(box, dy)) { box.vel.set(0, 0, 0); this.emit({ type: 'piston-stop' }); continue; }
      box.phase += h;
      box.min.y += dy;
      box.max.y += dy;
      box.vel.set(0, dy / h, 0);
      for (const which of ['A', 'B']) {
        const p = this.portals[which];
        if (p && p.hostId === box.id) p.frame = p.frame.translated(new Vector3(0, dy, 0));
      }
    }
  }

  wouldCrush(box, dy) {
    const lo = box.min.y + dy;
    const test = (c, r) => {
      if (c.x < box.min.x - r || c.x > box.max.x + r || c.z < box.min.z - r || c.z > box.max.z + r) return false;
      if (c.y - r > box.min.y || c.y + r < lo) return false;
      // a body inside the aperture of a linked portal on this box will be swallowed, not crushed
      for (const which of ['A', 'B']) {
        const p = this.portals[which];
        if (p && p.hostId === box.id && this.linked() && p.frame.lateralSq(c) < (p.R - r * 0.5) ** 2) return false;
      }
      return true; // anything else in the swept volume would be crushed: stop
    };
    for (const b of this.bodies) if (test(b.pos, b.r)) return true;
    if (this.player) for (const s of this.playerSpheres()) if (test(s, this.player.radius)) return true;
    return false;
  }

  applyDrag(vel, cdA, m, h) {
    if (!this.drag) return;
    const s = vel.length();
    if (s < 1e-6) return;
    const a = 0.5 * AIR_DENSITY * cdA * s * s / m;
    vel.multiplyScalar(Math.max(0, 1 - (a * h) / s));
  }

  integrateSphere(b, h) {
    b.prev.copy(b.pos);
    b.vel.y -= G * h;
    this.applyDrag(b.vel, b.cdA, b.m, h);
    if (b.vel.length() > MAX_SPEED) b.vel.setLength(MAX_SPEED);
    b.pos.addScaledVector(b.vel, h);
    this.traverse(b, b.prev, b.pos);
    b.grounded = false;
    for (let it = 0; it < 3; it++) for (const box of this.boxes) this.collideSphereBox(b, b.pos, b.r, box, b);
  }

  /** Teleport `body` if the tracked point moved from in front of a portal to behind it. */
  traverse(body, prevPoint, point) {
    if (!this.linked()) return false;
    for (const which of ['A', 'B']) {
      const p = this.portals[which];
      const q = this.portals[this.partner(which)];
      const d1 = p.frame.signedDistance(point);
      if (d1 >= 0) continue;
      const d0 = (p.prevFrame ?? p.frame).signedDistance(prevPoint);
      if (d0 < 0) continue;
      // crossing point inside the aperture?
      const f = d0 / (d0 - d1);
      tmp.copy(prevPoint).lerp(point, f);
      if (p.frame.lateralSq(tmp) >= p.R * p.R) continue;
      const T = pairTransform(p.frame, q.frame);
      const vel = body.kind === 'player' ? body.vel : body.vel;
      const yIn = point.y;
      const mapped = point.clone().applyMatrix4(T);
      const uA = this.mouthVelocity(which);
      const uB = this.mouthVelocity(this.partner(which));
      const res = exitVelocity({ mode: this.mode, vIn: vel, a: p.frame, b: q.frame, T, uA, uB, yIn, yOut: mapped.y, g: G });
      const m = body.m;
      const entry = { t: this.time, id: body.id, m, from: which, to: this.partner(which), mode: this.mode,
        vIn: vel.length(), vOut: res.v.length(), yIn, yOut: mapped.y, reflected: res.reflected,
        dKE: res.reflected ? 0 : 0.5 * m * (res.v.lengthSq() - vel.lengthSq()),
        dPE: res.reflected ? 0 : m * G * (mapped.y - yIn) };
      if (res.reflected) {
        // potential step too high: bounce back out of A (mirror the overshoot)
        const back = -d1 + 1e-4;
        if (body.kind === 'player') body.root.addScaledVector(p.frame.normal, back - d1);
        else body.pos.addScaledVector(p.frame.normal, back - d1);
        vel.copy(res.v);
        this.ledger.record(entry);
        this.emit({ type: 'reflected', id: body.id, need: Math.sqrt(Math.max(0, 2 * G * (mapped.y - yIn))) });
        return true;
      }
      if (body.kind === 'player') {
        const delta = mapped.clone().sub(point);
        body.root.add(delta);
        this.reorientPlayer(body, rotationOf(T));
      } else {
        body.pos.copy(mapped);
        body.prev.copy(prevPoint).applyMatrix4(T);
      }
      vel.copy(res.v);
      this.ledger.record(entry);
      this.emit({ type: 'traversed', id: body.id, from: which });
      return true;
    }
    return false;
  }

  reorientPlayer(p, R) {
    const fwd = new Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    const up = new Vector3(Math.sin(p.yaw) * Math.sin(p.pitch), Math.cos(p.pitch), Math.cos(p.yaw) * Math.sin(p.pitch));
    // apply current roll to up
    up.applyAxisAngle(fwd, p.roll);
    fwd.applyMatrix3(R).normalize();
    up.applyMatrix3(R).normalize();
    if (Math.abs(fwd.y) > 0.995) {
      // looking straight up/down: take yaw from the up vector, no roll
      p.pitch = Math.sign(fwd.y) * (Math.PI / 2 - 0.02);
      const h = up.clone().multiplyScalar(-Math.sign(fwd.y));
      p.yaw = Math.atan2(-h.x, -h.z);
      p.roll = 0;
      return;
    }
    p.pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    p.yaw = Math.atan2(-fwd.x, -fwd.z);
    const levelUp = new Vector3(Math.sin(p.yaw) * Math.sin(p.pitch), Math.cos(p.pitch), Math.cos(p.yaw) * Math.sin(p.pitch));
    const cross = new Vector3().crossVectors(levelUp, up);
    p.roll = Math.atan2(cross.dot(fwd), levelUp.dot(up));
  }

  playerSpheres(p = this.player) {
    return [p.radius, 0.9, p.height - p.radius].map((y) => p.root.clone().add(new Vector3(0, y, 0)));
  }

  integratePlayer(h) {
    const p = this.player;
    const eye0 = this.eyeOf(p);
    // walking: accelerate toward the commanded horizontal velocity
    const speed = p.input.sprint ? 8 : 4.5;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const want = new Vector3(fx * p.input.forward - fz * p.input.right, 0, fz * p.input.forward + fx * p.input.right);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    const accel = p.grounded ? 40 : 6;
    const dvx = want.x - p.vel.x;
    const dvz = want.z - p.vel.z;
    const dv = Math.hypot(dvx, dvz);
    const lim = accel * h;
    if (dv > 0 && (want.lengthSq() > 0 || p.grounded)) {
      const k = Math.min(1, lim / dv);
      p.vel.x += dvx * k;
      p.vel.z += dvz * k;
    }
    if (p.input.jump && p.grounded) { p.vel.y = 5.0; p.grounded = false; }
    p.vel.y -= G * h;
    this.applyDrag(p.vel, p.cdA, p.m, h);
    if (p.vel.length() > MAX_SPEED) p.vel.setLength(MAX_SPEED);
    p.root.addScaledVector(p.vel, h);
    p.roll *= Math.exp(-h / 0.25);   // re-level the view after a tilted exit
    const eye1 = this.eyeOf(p);
    this.traverse(p, eye0, eye1);
    p.grounded = false;
    for (let it = 0; it < 3; it++) {
      for (const box of this.boxes) {
        for (const off of [p.radius, 0.9, p.height - p.radius]) {
          const c = p.root.clone().add(new Vector3(0, off, 0));
          const before = c.clone();
          this.collideSphereBox(p, c, p.radius, box, p);
          p.root.add(c.sub(before));
        }
      }
    }
  }

  /** Resolve one sphere (centre c, radius r) against one box; mutates c and owner.vel. */
  collideSphereBox(owner, c, r, box, ownerForGround) {
    // portal hole handling
    let hosted = null;
    if (this.linked()) {
      for (const which of ['A', 'B']) {
        const p = this.portals[which];
        if (p.hostId !== box.id) continue;
        if (p.frame.lateralSq(c) < p.R * p.R && p.frame.signedDistance(c) < r + 0.02) { hosted = p; break; }
      }
    }
    if (hosted) {
      // inside the aperture tunnel: only the rim circle can touch the body
      const q = closestPointOnRim(hosted.frame, hosted.R, c, tmp2);
      const d = c.distanceTo(q);
      if (d < r && d > 1e-9) {
        const nrm = c.clone().sub(q).divideScalar(d);
        c.addScaledVector(nrm, r - d);
        this.respond(owner, nrm, box.vel);
      }
      return;
    }
    const qx = Math.min(Math.max(c.x, box.min.x), box.max.x);
    const qy = Math.min(Math.max(c.y, box.min.y), box.max.y);
    const qz = Math.min(Math.max(c.z, box.min.z), box.max.z);
    let nx = c.x - qx;
    let ny = c.y - qy;
    let nz = c.z - qz;
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 >= r * r) return;
    let d = Math.sqrt(d2);
    let pen;
    if (d > 1e-9) {
      nx /= d; ny /= d; nz /= d;
      pen = r - d;
    } else {
      // centre inside the box: leave by the nearest face
      const opts = [
        [c.x - box.min.x, -1, 0, 0], [box.max.x - c.x, 1, 0, 0],
        [c.y - box.min.y, 0, -1, 0], [box.max.y - c.y, 0, 1, 0],
        [c.z - box.min.z, 0, 0, -1], [box.max.z - c.z, 0, 0, 1],
      ].sort((a, b) => a[0] - b[0]);
      [d, nx, ny, nz] = opts[0];
      pen = r + d;
    }
    const nrm = tmp.set(nx, ny, nz);
    c.addScaledVector(nrm, pen);
    this.respond(owner, nrm, box.vel);
    if (ny > 0.6) ownerForGround.grounded = true;
  }

  respond(owner, nrm, surfVel) {
    const rel = owner.vel.clone().sub(surfVel);
    const vn = rel.dot(nrm);
    if (vn < 0) {
      const e = owner.kind === 'player' ? 0 : owner.restitution;
      rel.addScaledVector(nrm, -(1 + (Math.abs(vn) > 0.8 ? e : 0)) * vn);
      // Coulomb-like friction on the tangential part, proportional to the normal impulse
      const vt = rel.clone().addScaledVector(nrm, -rel.dot(nrm));
      const vtl = vt.length();
      if (vtl > 1e-9 && owner.kind !== 'player') {
        // rolling resistance (bodies do not spin in this model, so sliding friction would be wrong)
        const drop = Math.min(vtl, 0.03 * Math.abs(vn));
        rel.addScaledVector(vt, -drop / vtl);
      }
      owner.vel.copy(rel.add(surfVel));
    }
  }

  sphereContacts() {
    const list = this.bodies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) this.pairContact(list[i], list[i].pos, list[j], list[j].pos);
      if (this.player) {
        for (const off of [this.player.radius, 0.9, this.player.height - this.player.radius]) {
          const c = this.player.root.clone().add(new Vector3(0, off, 0));
          const before = c.clone();
          this.pairContact(list[i], list[i].pos, this.player, c, this.player.radius);
          this.player.root.add(c.sub(before));
        }
      }
    }
  }

  pairContact(a, pa, b, pb, rbOverride) {
    const rb = rbOverride ?? b.r;
    const dvec = pb.clone().sub(pa);
    const dist = dvec.length();
    const rs = a.r + rb;
    if (dist >= rs || dist < 1e-9) return;
    const n = dvec.divideScalar(dist);
    const pen = rs - dist;
    const wa = 1 / a.m;
    const wb = 1 / b.m;
    pa.addScaledVector(n, -pen * wa / (wa + wb));
    pb.addScaledVector(n, pen * wb / (wa + wb));
    const vrel = b.vel.clone().sub(a.vel).dot(n);
    if (vrel < 0) {
      const e = Math.min(a.restitution ?? 0.3, b.restitution ?? 0.3);
      const jimp = -(1 + e) * vrel / (wa + wb);
      a.vel.addScaledVector(n, -jimp * wa);
      b.vel.addScaledVector(n, jimp * wb);
    }
  }

  // ------------------------------------------------------------------ queries
  raycast(origin, dir, maxDist = 200) {
    let best = null;
    for (const box of this.boxes) {
      const hit = rayBoxLocal(origin, dir, box);
      if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) best = { ...hit, box };
    }
    if (!best) return null;
    best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }

  /** Total mechanical energy of the balls (KE + PE), for diagnostics. */
  mechanicalEnergy() {
    let e = 0;
    for (const b of this.bodies) e += 0.5 * b.m * b.vel.lengthSq() + b.m * G * b.pos.y;
    return e;
  }
}

function rayBoxLocal(o, d, box) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  const comps = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const a = comps[i];
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < box.min[a] || o[a] > box.max[a]) return null;
      continue;
    }
    let t1 = (box.min[a] - o[a]) / d[a];
    let t2 = (box.max[a] - o[a]) / d[a];
    let s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || axis < 0) return null;
  const normal = new Vector3();
  normal.setComponent(axis, sign);
  return { t: tmin, normal };
}
