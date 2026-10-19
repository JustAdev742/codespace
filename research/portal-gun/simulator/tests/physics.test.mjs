import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { World, G } from '../src/physics.js';
import { makeLevel } from '../src/level.js';
import { planPlacement } from '../src/portal-math.js';

const v = (x, y, z) => new Vector3(x, y, z);

function world(mode = 'kinematic', opts = {}) {
  return new World(makeLevel(), { mode, drag: false, ...opts });
}

function place(w, which, hit, normal, id, viewDir = v(0, 0, -1)) {
  const box = w.boxes.find((b) => b.id === id);
  const plan = planPlacement({ hit, normal, box, boxes: w.boxes, viewDir, distance: 5 });
  assert.ok(plan.ok, `${which}: ${plan.reason} ${plan.detail ?? ''}`);
  const res = w.placePortal(which, plan);
  assert.ok(res.ok);
  return plan;
}

function run(w, seconds, dt = 1 / 120, each = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { w.step(dt); if (each) each(w); }
}

test('a dropped ball settles on the floor', () => {
  const w = world();
  const b = w.addSphere({ pos: v(0, 3, 0) });
  run(w, 4);
  assert.ok(Math.abs(b.pos.y - b.r) < 0.01, `y = ${b.pos.y}`);
  assert.ok(b.vel.length() < 0.05);
});

test('ball rolling into a wall portal exits the partner with the mapped velocity', () => {
  const w = world();
  place(w, 'A', v(0, 1.1, -14), v(0, 0, 1), 'wall-north');      // faces +z
  place(w, 'B', v(-14, 1.1, 5), v(1, 0, 0), 'wall-west');       // faces +x
  const b = w.addSphere({ pos: v(0, 0.25, -10), vel: v(0, 0, -6) });
  let exited = null;
  run(w, 2.5, 1 / 120, () => { if (!exited && w.ledger.traversals.length) exited = b.vel.clone(); });
  assert.ok(exited, 'ball never traversed');
  assert.ok(exited.x > 5.0 && Math.abs(exited.z) < 0.3, `exit velocity ${exited.toArray()}`);
  assert.equal(w.ledger.mouthMass.A, b.m);
  assert.equal(w.ledger.mouthMass.B, -b.m);
});

test('stacked floor/ceiling pair: game rule accelerates without bound, conservative rule does not', () => {
  const peak = {};
  for (const mode of ['kinematic', 'conservative']) {
    const w = world(mode);
    place(w, 'A', v(-4, 0, 3), v(0, 1, 0), 'floor');
    place(w, 'B', v(-4, 10, 3), v(0, -1, 0), 'ceiling');
    const b = w.addSphere({ pos: v(-4, 6, 3) });
    const E0 = 0.5 * b.m * b.vel.lengthSq() + b.m * G * b.pos.y;
    let vmax = 0;
    let ymaxAfter = 0;
    run(w, 6, 1 / 240, () => { vmax = Math.max(vmax, b.vel.length()); if (w.time > 0.2) ymaxAfter = Math.max(ymaxAfter, b.pos.y); });
    peak[mode] = { vmax, ymaxAfter, E1: 0.5 * b.m * b.vel.lengthSq() + b.m * G * b.pos.y, E0, loops: w.ledger.traversals.length };
  }
  assert.ok(peak.kinematic.vmax > 50, `game rule only reached ${peak.kinematic.vmax}`);
  assert.ok(peak.kinematic.loops >= 5);
  // energy-conserving: never faster than free fall from the release height
  assert.ok(peak.conservative.vmax <= Math.sqrt(2 * G * 6) + 0.2, `vmax ${peak.conservative.vmax}`);
  assert.ok(peak.conservative.ymaxAfter <= 6.0 + 0.05);
});

test('conservative mode: walking into a portal that leads 6.9 m up is refused (reflected)', () => {
  for (const mode of ['kinematic', 'conservative']) {
    const w = world(mode);
    place(w, 'A', v(8, 0.5, -14), v(0, 0, 1), 'wall-north');
    place(w, 'B', v(14, 8, 9), v(-1, 0, 0), 'wall-east');
    const p = w.addPlayer({ pos: v(8, 0, -9), yaw: 0 });
    p.input.forward = 1;
    let maxY = 0;
    run(w, 3, 1 / 120, () => { maxY = Math.max(maxY, p.root.y); });
    if (mode === 'kinematic') assert.ok(maxY > 5, `kinematic should exit high, maxY ${maxY}`);
    else {
      assert.ok(maxY < 0.5, `conservative must not climb, maxY ${maxY}`);
      assert.ok(w.ledger.traversals.some((t) => t.reflected));
    }
  }
});

test('piston demo: a resting ball leaves the far portal at the piston speed; the mouths pay', () => {
  const w = world('kinematic');
  const piston = w.boxes.find((b) => b.id === 'piston');
  place(w, 'A', v(7.7, piston.min.y, 7.7), v(0, -1, 0), 'piston');
  place(w, 'B', v(0, 1.1, 14), v(0, 0, -1), 'wall-south');
  const ball = w.addSphere({ pos: v(7.7, 0.25, 7.7) });
  run(w, 0.5);
  piston.enabled = true;
  let out = null;
  run(w, 4, 1 / 240, () => { if (!out && w.ledger.traversals.length) out = { v: ball.vel.clone(), t: w.ledger.traversals[0] }; });
  assert.ok(out, 'ball was not swallowed');
  const slamSpeed = 6.0 / 0.75;
  assert.ok(Math.abs(out.v.length() - slamSpeed) < 0.6, `exit speed ${out.v.length()}`);
  assert.ok(out.v.z < -slamSpeed * 0.8, 'should leave the south wall heading north');
  assert.ok(w.ledger.energyByMouths > 0.5 * ball.m * (slamSpeed - 0.6) ** 2);
});

test('closure interlock refuses to close on a straddling body; override ejects it', () => {
  const w = world();
  place(w, 'A', v(0, 1.1, -14), v(0, 0, 1), 'wall-north');
  place(w, 'B', v(-14, 1.1, 5), v(1, 0, 0), 'wall-west');
  const b = w.addSphere({ pos: v(0, 1.1, -13.9) });       // centre 0.1 m in front of A, straddling
  const r1 = w.closePortal('A');
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, 'interlock');
  const r2 = w.closePortal('A', { override: true });
  assert.ok(r2.ok && r2.ejected === 1);
  assert.ok(b.pos.z >= -14 + b.r - 1e-9, 'ball should be pushed fully out of the plane');
});

test('an unlinked portal is solid', () => {
  const w = world();
  place(w, 'A', v(0, 1.1, -14), v(0, 0, 1), 'wall-north');
  const b = w.addSphere({ pos: v(0, 1.1, -12), vel: v(0, 0, -5) });
  run(w, 1.5);
  assert.equal(w.ledger.traversals.length, 0);
  assert.ok(b.pos.z > -14 + b.r - 0.02);
});

test('rim contact deflects an off-axis ball instead of letting it clip the wall', () => {
  const w = world();
  place(w, 'A', v(0, 1.1, -14), v(0, 0, 1), 'wall-north');
  place(w, 'B', v(-14, 1.1, 5), v(1, 0, 0), 'wall-west');
  const b = w.addSphere({ pos: v(1.0, 1.1, -11), vel: v(0, 0, -4) });   // centre 1.0 m off-axis, R = 1.1
  run(w, 2);
  // it either passed (pushed inward by the rim) or bounced back; it must never sit inside the wall
  assert.ok(w.ledger.traversals.length === 1 || b.pos.z > -14 + b.r - 0.05);
});
