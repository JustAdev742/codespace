// Geometry of a pair of planar, circular portals.
//
// Each portal has a right-handed frame (right, up, normal) centred on the disc; the
// normal points out of the front face. Entering the FRONT of A means leaving the FRONT
// of B, so the map from A's neighbourhood to B's is a rotation by pi about the local up
// axis sandwiched between the two frames:
//
//     T(A->B) = M_B * R_y(pi) * M_A^-1
//
// This is the "flat-face" identification: space is flat on both sides and the map is an
// isometry, so straight lines stay straight through the portal and rendering a portal
// view is exact optics for this model (see report/02-technical-report.md, section 3.5).

import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';

export const PORTAL_RADIUS = 1.1;

const RY_PI = new Matrix4().makeRotationY(Math.PI);
const _v = new Vector3();
const _w = new Vector3();

export class PortalFrame {
  constructor(center, normal, up) {
    this.center = center.clone();
    this.normal = normal.clone().normalize();
    const u = up.clone().addScaledVector(this.normal, -up.dot(this.normal));
    if (u.lengthSq() < 1e-12) throw new Error('portal up vector is parallel to its normal');
    this.up = u.normalize();
    this.right = new Vector3().crossVectors(this.up, this.normal);
    this.matrix = new Matrix4().makeBasis(this.right, this.up, this.normal).setPosition(this.center);
    this.inverse = this.matrix.clone().invert();
  }

  signedDistance(p) {
    return _v.copy(p).sub(this.center).dot(this.normal);
  }

  /** Squared distance from the disc axis, measured in the portal plane. */
  lateralSq(p) {
    _v.copy(p).sub(this.center);
    const x = _v.dot(this.right);
    const y = _v.dot(this.up);
    return x * x + y * y;
  }

  toLocal(p, target = new Vector3()) {
    return target.copy(p).applyMatrix4(this.inverse);
  }

  translated(d) {
    return new PortalFrame(this.center.clone().add(d), this.normal, this.up);
  }
}

/** 4x4 rigid map taking points near A's front to points near B's front. */
export function pairTransform(a, b) {
  return new Matrix4().multiplyMatrices(b.matrix, RY_PI).multiply(a.inverse);
}

export function rotationOf(T) {
  return new Matrix3().setFromMatrix4(T);
}

/**
 * Velocity of an object leaving B, given its velocity entering A.
 *
 * mode 'kinematic'   : v' = R (v - uA) + uB. Velocity relative to the mouth is kept
 *                      (what games do). In a gravitational field this creates energy.
 * mode 'conservative': as above, then the relative speed is reduced (or increased) so
 *                      that kinetic + potential energy (g * height) is unchanged across
 *                      the jump: a lumped version of the single-valued static potential
 *                      computed in models/portalphys/newtonian_portal.py. If the object
 *                      cannot climb the step it is reflected off A instead of passing.
 */
export function exitVelocity({ mode, vIn, a, b, T, uA = new Vector3(), uB = new Vector3(), yIn = 0, yOut = 0, g = 9.81 }) {
  const R = rotationOf(T ?? pairTransform(a, b));
  const rel = vIn.clone().sub(uA);
  const out = rel.clone().applyMatrix3(R);
  if (mode === 'conservative') {
    const v2 = rel.lengthSq() - 2 * g * (yOut - yIn);
    if (v2 <= 0) {
      // Reflect off A in A's rest frame: mirror the normal component.
      const vn = rel.dot(a.normal);
      const refl = rel.clone().addScaledVector(a.normal, -2 * vn).add(uA);
      return { v: refl, reflected: true };
    }
    const s = rel.length();
    if (s > 0) out.multiplyScalar(Math.sqrt(v2) / s);
  }
  return { v: out.add(uB), reflected: false };
}

/**
 * Lengyel (2005) oblique near-plane clipping for an OpenGL-style projection matrix.
 * clipPlane is a camera-space plane (n.x, n.y, n.z, d) with the camera on its negative
 * side; points with n.p + d > 0 are kept. Returns a new Matrix4.
 * Matrix4.elements is column-major, so the third row is elements 2, 6, 10, 14.
 */
export function obliqueProjection(projection, clipPlane) {
  const m = projection.clone();
  const e = m.elements;
  const q = new Vector4(
    (Math.sign(clipPlane.x) + e[8]) / e[0],
    (Math.sign(clipPlane.y) + e[9]) / e[5],
    -1.0,
    (1.0 + e[10]) / e[14],
  );
  const c = clipPlane.clone().multiplyScalar(2.0 / clipPlane.dot(q));
  e[2] = c.x;
  e[6] = c.y;
  e[10] = c.z + 1.0;
  e[14] = c.w;
  return m;
}

/** Slab-method ray / axis-aligned box intersection. Returns {t, normal} or null. */
export function rayBox(origin, dir, min, max) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axisMin = -1;
  let signMin = 0;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const lo = [min.x, min.y, min.z];
  const hi = [max.x, max.y, max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    let t1 = (lo[i] - o[i]) / d[i];
    let t2 = (hi[i] - o[i]) / d[i];
    let s = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tmin) { tmin = t1; axisMin = i; signMin = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || axisMin < 0 || tmin < 0) return null;
  const normal = new Vector3();
  normal.setComponent(axisMin, signMin);
  return { t: tmin, normal };
}

/** Closest point on the rim circle (radius R, in the portal plane) to p. */
export function closestPointOnRim(frame, R, p, target = new Vector3()) {
  frame.toLocal(p, _w);
  let x = _w.x;
  let y = _w.y;
  const len = Math.hypot(x, y);
  if (len < 1e-9) { x = 1; y = 0; } else { x /= len; y /= len; }
  return target.set(R * x, R * y, 0).applyMatrix4(frame.matrix);
}

const AXES = ['x', 'y', 'z'];

/**
 * Decide where (and whether) a portal can open where the gun's ray hit a box face.
 * Implements the failure states shown in the simulator HUD.
 *
 * opts: { hit: Vector3, normal: Vector3 (axis aligned), box, boxes, viewDir, distance,
 *         other: PortalFrame|null, R, range, maxNudge }
 * Returns { ok: true, frame, nudged } or { ok: false, reason, detail }.
 */
export function planPlacement({ hit, normal, box, boxes, viewDir, distance, other = null, otherHost = null,
  R = PORTAL_RADIUS, range = 80, maxNudge = 1.2 }) {
  if (distance > range) return { ok: false, reason: 'out-of-range', detail: `${distance.toFixed(1)} m > ${range} m` };
  if (!box.portalable) return { ok: false, reason: 'surface-rejects', detail: 'this surface does not accept portals' };
  if (box.kinematic && Math.abs(normal.y) < 0.5) {
    return { ok: false, reason: 'surface-rejects', detail: 'only the underside of the piston accepts portals' };
  }
  const k = AXES.findIndex((ax) => Math.abs(normal[ax]) > 0.5);
  const [i, j] = [0, 1, 2].filter((x) => x !== k).map((x) => AXES[x]);
  const spanI = box.max[i] - box.min[i];
  const spanJ = box.max[j] - box.min[j];
  if (spanI < 2 * R || spanJ < 2 * R) {
    return { ok: false, reason: 'surface-too-small', detail: `face ${spanI.toFixed(1)} x ${spanJ.toFixed(1)} m, need ${(2 * R).toFixed(1)} m` };
  }
  const c = hit.clone();
  const clampAxis = (ax) => Math.min(Math.max(c[ax], box.min[ax] + R), box.max[ax] - R);
  const clampToFace = () => { c[i] = clampAxis(i); c[j] = clampAxis(j); };
  clampToFace();
  const kAx = AXES[k];
  const samePlane = other && other.normal.dot(normal) > 0.999 && Math.abs(other.signedDistance(c)) < 1e-3;
  // Slide the disc off the other portal and off any box crowding the face (like Portal's
  // placement "bump"), then validate. A box covering the disc centre cannot be slid off.
  const obstruction = () => {
    for (const bx of boxes) {
      if (bx === box || bx.id === box.id) continue;
      const front0 = c[kAx] + normal[kAx] * 0.001;
      const front1 = c[kAx] + normal[kAx] * 0.06;
      if (bx.max[kAx] <= Math.min(front0, front1) || bx.min[kAx] >= Math.max(front0, front1)) continue;
      const qi = Math.min(Math.max(c[i], bx.min[i]), bx.max[i]);
      const qj = Math.min(Math.max(c[j], bx.min[j]), bx.max[j]);
      const dist = Math.hypot(qi - c[i], qj - c[j]);
      if (dist < R - 1e-9) return { bx, qi, qj, dist };
    }
    return null;
  };
  let pushedByOther = false;
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    if (samePlane && other.center.distanceTo(c) < 2 * R + 0.02) {
      pushedByOther = true;
      const away = c.clone().sub(other.center);
      away.addScaledVector(normal, -away.dot(normal));
      if (away.lengthSq() < 1e-8) away.set(0, 0, 0)[i] = 1;
      away.normalize();
      c.copy(other.center).addScaledVector(away, 2 * R + 0.02);
      moved = true;
    }
    const ob = obstruction();
    if (ob) {
      if (ob.dist < 1e-6) return { ok: false, reason: 'obstructed', detail: `blocked by ${ob.bx.name ?? ob.bx.id}` };
      const push = (R - ob.dist + 0.002) / ob.dist;
      c[i] += (c[i] - ob.qi) * push;
      c[j] += (c[j] - ob.qj) * push;
      moved = true;
    }
    clampToFace();
    if (!moved) break;
  }
  const ob = obstruction();
  if (ob) return { ok: false, reason: 'obstructed', detail: `blocked by ${ob.bx.name ?? ob.bx.id}` };
  if (samePlane && other.center.distanceTo(c) < 2 * R) return { ok: false, reason: 'overlaps-other', detail: 'no room beside the other portal' };
  const nudge = c.distanceTo(hit);
  if (nudge > maxNudge) {
    return pushedByOther
      ? { ok: false, reason: 'overlaps-other', detail: `would need a ${nudge.toFixed(2)} m shift away from the other portal` }
      : { ok: false, reason: 'too-close-to-edge', detail: `would need a ${nudge.toFixed(2)} m shift` };
  }
  // portal "up": world up on walls; on floors and ceilings, the shooter's horizontal view
  // direction (so a floor portal and a ceiling portal shot facing the same way form a
  // pure vertical translation, as in the Newtonian analysis of the stacked pair)
  let up;
  if (Math.abs(normal.y) > 0.5) {
    up = viewDir.clone().addScaledVector(normal, -viewDir.dot(normal));
    if (up.lengthSq() < 1e-6) up = new Vector3(0, 0, -1);
    up.normalize();
  } else {
    up = new Vector3(0, 1, 0);
  }
  const frame = new PortalFrame(c, normal, up);
  return { ok: true, frame, nudged: nudge > 1e-6, hostId: box.id, otherHost };
}
