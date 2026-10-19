import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import {
  PortalFrame, pairTransform, rotationOf, exitVelocity, obliqueProjection, rayBox, planPlacement,
  closestPointOnRim, PORTAL_RADIUS,
} from '../src/portal-math.js';
import { makeLevel } from '../src/level.js';

const v = (x, y, z) => new Vector3(x, y, z);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const vecNear = (a, b, eps = 1e-9) => a.distanceTo(b) <= eps;

function randomFrame(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return new PortalFrame(v(rnd() * 9, rnd() * 9, rnd() * 9), v(rnd(), rnd(), rnd()), v(rnd(), rnd(), rnd()));
}

test('portal frames are orthonormal and right-handed', () => {
  for (let i = 1; i < 30; i++) {
    const f = randomFrame(i * 7919);
    assert.ok(near(f.right.length(), 1, 1e-12) && near(f.up.length(), 1, 1e-12) && near(f.normal.length(), 1, 1e-12));
    assert.ok(near(f.right.dot(f.up), 0, 1e-12) && near(f.up.dot(f.normal), 0, 1e-12));
    assert.ok(near(new Vector3().crossVectors(f.right, f.up).dot(f.normal), 1, 1e-12));
  }
});

test('T(A->B) is a proper rigid motion and T(B->A) is its inverse', () => {
  for (let i = 1; i < 20; i++) {
    const a = randomFrame(i * 104729);
    const b = randomFrame(i * 1299709);
    const T = pairTransform(a, b);
    assert.ok(near(rotationOf(T).determinant(), 1, 1e-10));
    const back = pairTransform(b, a).multiply(T);
    for (let k = 0; k < 16; k++) assert.ok(near(back.elements[k], new Matrix4().elements[k], 1e-9));
  }
});

test('a point just behind A maps just in front of B; inward velocity maps to outward', () => {
  const a = randomFrame(11);
  const b = randomFrame(23);
  const T = pairTransform(a, b);
  const p = a.center.clone().addScaledVector(a.normal, -0.2).addScaledVector(a.right, 0.3);
  const q = p.clone().applyMatrix4(T);
  assert.ok(near(b.signedDistance(q), 0.2, 1e-9));
  const vout = a.normal.clone().negate().applyMatrix3(rotationOf(T));
  assert.ok(vecNear(vout, b.normal, 1e-12));
});

test('kinematic rule keeps relative speed; conservative rule pays for height', () => {
  const a = new PortalFrame(v(0, 0, 0), v(0, 1, 0), v(0, 0, -1));    // floor
  const b = new PortalFrame(v(0, 6, 5), v(0, 0, 1), v(0, 1, 0));     // wall, 6 m higher
  const vIn = v(1, -12, 0);
  const k = exitVelocity({ mode: 'kinematic', vIn, a, b, yIn: 0, yOut: 6 });
  assert.ok(near(k.v.length(), vIn.length(), 1e-12));
  const c = exitVelocity({ mode: 'conservative', vIn, a, b, yIn: 0, yOut: 6, g: 9.81 });
  assert.ok(!c.reflected);
  assert.ok(near(c.v.lengthSq(), vIn.lengthSq() - 2 * 9.81 * 6, 1e-9));
  // direction is the same as the kinematic one
  assert.ok(near(c.v.clone().normalize().dot(k.v.clone().normalize()), 1, 1e-12));
  // too slow to climb: reflected off A, speed unchanged, normal component flipped
  const slow = exitVelocity({ mode: 'conservative', vIn: v(0, -5, 0), a, b, yIn: 0, yOut: 6, g: 9.81 });
  assert.ok(slow.reflected);
  assert.ok(vecNear(slow.v, v(0, 5, 0), 1e-12));
});

test('moving mouth: object at rest leaves with the mouth speed (relative-velocity rule)', () => {
  const a = new PortalFrame(v(0, 2, 0), v(0, -1, 0), v(0, 0, -1));   // piston underside, facing down
  const b = new PortalFrame(v(0, 1.1, 14), v(0, 0, -1), v(0, 1, 0));
  const out = exitVelocity({ mode: 'kinematic', vIn: v(0, 0, 0), a, b, uA: v(0, -8, 0) });
  assert.ok(vecNear(out.v, b.normal.clone().multiplyScalar(8), 1e-12));
});

test('Lengyel oblique projection puts the clip plane on the near plane', () => {
  const cam = new PerspectiveCamera(70, 1.6, 0.05, 300);
  cam.updateProjectionMatrix();
  const n = v(0.3, -0.25, -1).normalize();
  const p0 = v(0.4, 0.2, -6);
  const C = new Vector4(n.x, n.y, n.z, -n.dot(p0));
  assert.ok(C.w < 0);
  const M = obliqueProjection(cam.projectionMatrix, C);
  const ndc = (p) => { const c = new Vector4(p.x, p.y, p.z, 1).applyMatrix4(M); return c.z / c.w; };
  const u = v(1, 0, 0).cross(n).normalize();
  const w = n.clone().cross(u).normalize();
  for (const [s, t] of [[0, 0], [0.5, -0.3], [-0.7, 0.4]]) {
    assert.ok(near(ndc(p0.clone().addScaledVector(u, s).addScaledVector(w, t)), -1, 1e-6));
  }
  assert.ok(ndc(p0.clone().addScaledVector(n, -0.5)) < -1);          // camera side: clipped
  const beyond = ndc(p0.clone().addScaledVector(n, 2));
  assert.ok(beyond > -1 && beyond < 1);                               // kept
  const e0 = cam.projectionMatrix.elements;
  const e1 = M.elements;
  for (const k of [0, 4, 8, 12, 1, 5, 9, 13, 3, 7, 11, 15]) assert.equal(e0[k], e1[k]); // rows 1, 2, 4 unchanged
});

test('ray/box intersection', () => {
  const box = { min: v(-1, -1, -1), max: v(1, 1, 1) };
  const hit = rayBox(v(-5, 0, 0), v(1, 0, 0), box.min, box.max);
  assert.ok(near(hit.t, 4) && vecNear(hit.normal, v(-1, 0, 0)));
  assert.equal(rayBox(v(-5, 3, 0), v(1, 0, 0), box.min, box.max), null);
  assert.equal(rayBox(v(5, 0, 0), v(1, 0, 0), box.min, box.max), null);
});

test('closest point on the rim lies on the circle', () => {
  const f = new PortalFrame(v(1, 2, 3), v(0, 0, 1), v(0, 1, 0));
  const q = closestPointOnRim(f, PORTAL_RADIUS, v(1.3, 2.4, 3.5));
  assert.ok(near(q.distanceTo(f.center), PORTAL_RADIUS, 1e-12));
  assert.ok(near(f.signedDistance(q), 0, 1e-12));
});

// --- placement and failure states on the real level --------------------------------
const level = makeLevel();
const boxes = level.boxes.map((b) => ({ ...b, portalable: b.portalable !== false }));
const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
const plan = (hit, normal, id, extra = {}) => planPlacement({ hit, normal, box: byId[id], boxes, viewDir: v(0, 0, -1), distance: 5, ...extra });

test('valid wall placement, nudged off the floor edge', () => {
  const r = plan(v(0, 0.3, -14), v(0, 0, 1), 'wall-north');
  assert.ok(r.ok);
  assert.ok(near(r.frame.center.y, PORTAL_RADIUS, 1e-12));     // pushed up so the disc fits
  assert.ok(r.nudged);
  assert.ok(vecNear(r.frame.up, v(0, 1, 0)));
});

test('failure states: metal, too small, edge, range, overlap, obstruction', () => {
  assert.equal(plan(v(13.6, 3, 0), v(-1, 0, 0), 'metal-panel').reason, 'surface-rejects');
  assert.equal(plan(v(3, 4, -4), v(0, 0, 1), 'pillar').reason, 'surface-too-small');
  assert.equal(plan(v(0, 3, -14), v(0, 0, 1), 'wall-north', { distance: 120 }).reason, 'out-of-range');
  // a hit tucked into the corner where the north wall meets the east wall and the ceiling
  // needs a ~1.5 m slide: refused
  assert.equal(plan(v(13.95, 9.95, -14), v(0, 0, 1), 'wall-north').reason, 'too-close-to-edge');
  // next to just one adjoining wall it slides clear (to x = 14 - R)
  const slid = plan(v(13.5, 5, -14), v(0, 0, 1), 'wall-north');
  assert.ok(slid.ok && Math.abs(slid.frame.center.x - (14 - PORTAL_RADIUS - 0.002)) < 1e-6, slid.reason);
  const first = plan(v(0, 3, -14), v(0, 0, 1), 'wall-north');
  assert.equal(plan(v(0.5, 3, -14), v(0, 0, 1), 'wall-north', { other: first.frame }).reason, 'overlaps-other');
  const second = plan(v(1.5, 3, -14), v(0, 0, 1), 'wall-north', { other: first.frame });   // slides 0.72 m
  assert.ok(second.ok);
  assert.ok(second.frame.center.distanceTo(first.frame.center) >= 2 * PORTAL_RADIUS);
  // the platform blocks a floor-level portal on the west wall next to it
  assert.equal(plan(v(-14, 1.2, -9), v(1, 0, 0), 'wall-west').reason, 'obstructed');
});

test('floor and ceiling portals shot facing the same way form a pure translation', () => {
  const a = plan(v(-4, 0, 3), v(0, 1, 0), 'floor');
  const b = plan(v(-4, 10, 3), v(0, -1, 0), 'ceiling');
  const T = pairTransform(a.frame, b.frame);
  const R = rotationOf(T);
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  R.elements.forEach((x, k) => assert.ok(near(x, I[k], 1e-12)));
  const p = v(-4.2, -0.1, 3.3).applyMatrix4(T);
  assert.ok(vecNear(p, v(-4.2, 9.9, 3.3), 1e-12));
});
