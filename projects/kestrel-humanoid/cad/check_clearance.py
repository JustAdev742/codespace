#!/usr/bin/env python3
"""Shell clearance and joint-sweep check for the KESTREL K1 Mk II CAD (mesh based, fast).

Reads cad/out/kestrel_k1.glb (tessellated by build_robot.py) and cad/out/parts.json (kinematic body of every
part), then:
  1. static: every exterior part ('shell', 'trim', 'visor', 'boot', 'sole') against every interior part and every
     exterior part of another body, at the zero pose - reports the minimum gap and any interference;
  2. sweeps: rotates the moving links about each joint axis through its range (params.py limits) and reports,
     per pair, the first angle where the parts touch - i.e. the shell-limited range of each joint.
Interior-interior contacts found by the sweeps are reported separately (packaging items, not shell items).

Needs trimesh + python-fcl (pip install trimesh python-fcl); not part of the robot build.
Usage:  python check_clearance.py [--quick]      -> prints a table, writes cad/out/clearance.json
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
SKIN = {"shell", "trim", "visor", "boot", "sole", "accent"}
TOUCH = 0.6           # mm: contacts shallower than this are mounting faces (cap on actuator face etc.)


def load():
    meta = json.loads((OUT / "parts.json").read_text())
    body = meta["body"]
    sc = trimesh.load(str(OUT / "kestrel_k1.glb"))
    parts = {}
    # glTF is Y-up: CAD (x, y, z) = (X, -Z, Y)
    R = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    for node in sc.graph.nodes_geometry:
        T, g = sc.graph[node]
        base = re.sub(r"_[0-9a-f]{6}$", "", node)
        if base not in body:
            continue
        m = sc.geometry[g].copy()
        m.apply_transform(R @ T)
        parts.setdefault(base, []).append(m)
    out = {}
    for k, ms in parts.items():
        m = trimesh.util.concatenate(ms) if len(ms) > 1 else ms[0]
        if m.bounds[1][0] - m.bounds[0][0] > 50 * 1000:      # metres -> mm safety
            pass
        mat = k.split("__")[1].split("_")[0]
        out[k] = dict(mesh=m, body=body[k], skin=mat in SKIN, mat=mat)
    return out


def mside(name, side):
    return name.replace("l_", side + "_", 1) if name.startswith("l_") else name


def collide(parts, moving, static, T, skin_only=True):
    """Collision pairs between moving parts (transformed by T) and static parts. Returns [(a, b, depth)]."""
    from trimesh.collision import CollisionManager
    ms, ss = CollisionManager(), CollisionManager()
    for k in moving:
        ms.add_object(k, parts[k]["mesh"], transform=T)
    for k in static:
        ss.add_object(k, parts[k]["mesh"])
    hit, names, data = ms.in_collision_other(ss, return_names=True, return_data=True)
    res = {}
    if hit:
        for d in data:
            a, b = list(d.names)
            if a not in moving:
                a, b = b, a
            if skin_only and not (parts[a]["skin"] or parts[b]["skin"]):
                continue
            res[(a, b)] = max(res.get((a, b), 0.0), d.depth)
    return [(a, b, dep) for (a, b), dep in res.items() if dep > TOUCH]


def rot(axis_pt, axis_dir, deg):
    return trimesh.transformations.rotation_matrix(math.radians(deg), axis_dir, axis_pt)


def static_check(parts):
    """Zero pose: skin vs everything of other bodies, skin vs own-body interior."""
    from trimesh.collision import CollisionManager
    cm = CollisionManager()
    for k, p in parts.items():
        cm.add_object(k, p["mesh"])
    hit, data = cm.in_collision_internal(return_data=True)
    best = {}
    for d in data:
        a, b = list(d.names)
        pa, pb = parts[a], parts[b]
        if not (pa["skin"] or pb["skin"]):
            continue
        if pa["skin"] and pb["skin"] and pa["body"] == pb["body"]:
            continue                       # panels of one body touching along a split / light guide in its panel
        if pa["body"] == pb["body"] and pa["body"].endswith("_hand"):
            continue                       # articulated-finger envelope model: joints sit inside the phalanx ends
        if {pa["mat"], pb["mat"]} & {"accent"}:
            continue                       # light guides are inset into their panel by design
        if "_screw" in a or "_screw" in b:
            continue                       # button heads seat 0.4 mm into the panel they hold
        if d.depth > TOUCH:
            k = tuple(sorted((a, b)))
            best[k] = max(best.get(k, 0.0), round(d.depth, 2))
    return sorted([(a, b, v) for (a, b), v in best.items()], key=lambda r: -r[2])


def sweep(parts, name, moving_bodies, static_bodies, pt, axis, angles):
    flex = lambda p: p["mat"] in ("cool", "boot")          # hoses with service loops, TPU bellows: flexible
    mov = [k for k, p in parts.items() if p["body"] in moving_bodies and not flex(p)]
    sta = [k for k, p in parts.items() if p["body"] in static_bodies and not flex(p)]
    first = {}
    interior = {}
    for ang in angles:
        if ang == 0:
            continue
        T = rot(pt, axis, ang)
        for a, b, dep in collide(parts, mov, sta, T, skin_only=False):
            key = (a, b)
            tgt = first if (parts[a]["skin"] or parts[b]["skin"]) else interior
            if key not in tgt or abs(ang) < abs(tgt[key][0]):
                tgt[key] = (ang, round(dep, 1))
    return first, interior


def free_range(first, angles):
    pos = [a for a in angles if a > 0]
    neg = [a for a in angles if a < 0]
    hit_pos = min([v[0] for v in first.values() if v[0] > 0], default=None)
    hit_neg = max([v[0] for v in first.values() if v[0] < 0], default=None)
    lo = (min([a for a in neg if hit_neg is None or a > hit_neg], default=0) if neg else 0)
    hi = (max([a for a in pos if hit_pos is None or a < hit_pos], default=0) if pos else 0)
    return lo, hi


def main():
    quick = "--quick" in sys.argv
    parts = load()
    print(f"{len(parts)} parts loaded")
    res = {"static": [], "sweeps": {}}
    st = static_check(parts)
    res["static"] = st
    print("\nSTATIC (zero pose) skin interferences > %.1f mm:" % TOUCH, len(st))
    for a, b, d in st[:40]:
        print(f"   {d:5.1f} mm  {a}  x  {b}")
    step = 15 if quick else 5
    L = ["l_thigh", "l_shank", "l_ankle", "l_foot", "l_pushrod", "l_crank", "l_ankle_rods"]
    arm = ["l_shoulder", "l_upper_arm_a", "l_upper_arm", "l_forearm", "l_hand"]
    upper = ["torso", "neck_link", "head"] + arm + [mside(b, "r") for b in arm]
    rng = lambda a, b: [v for v in range(a, b + 1, step)]
    jobs = [
        ("knee flexion (0..130)", ["l_shank", "l_ankle", "l_foot", "l_ankle_rods"], ["l_thigh"], (0, 0, 495), (0, 1, 0), rng(0, 130)),
        ("hip pitch (-125 flex .. +30 ext)", L, ["pelvis", "waist_link", "l_hip_yaw", "l_hip_roll", "torso", "l_forearm", "l_hand"],
         (0, 0, 915), (0, 1, 0), rng(-125, 30)),
        ("hip roll (-25 add .. +45 abd)", ["l_hip_roll"] + L, ["pelvis", "waist_link", "l_hip_yaw", "torso"] + [mside(b, "r") for b in L + ["l_hip_roll", "l_hip_yaw"]],
         (0, 105, 915), (1, 0, 0), rng(-25, 45)),
        ("hip yaw (-30 .. +45)", ["l_hip_yaw", "l_hip_roll"] + L, ["pelvis", "waist_link", "torso"] + [mside(b, "r") for b in L + ["l_hip_roll", "l_hip_yaw"]],
         (0, 105, 990), (0, 0, 1), rng(-30, 45)),
        ("ankle pitch (-45..45)", ["l_foot"], ["l_shank"], (0, 105, 75), (0, 1, 0), rng(-45, 45)),
        ("elbow flexion (0..-145)", ["l_forearm", "l_hand"], ["l_upper_arm", "l_upper_arm_a", "l_shoulder", "torso"], (0, 200, 1120), (0, 1, 0), rng(-145, 0)),
        ("shoulder pitch (-180 fwd .. +60 back)", arm, ["torso", "neck_link", "head", "pelvis", "waist_link"], (0, 0, 1420), (0, 1, 0), rng(-180, 60)),
        ("shoulder roll (-15 .. +160 abd)", ["l_upper_arm_a", "l_upper_arm", "l_forearm", "l_hand"], ["l_shoulder", "torso", "neck_link", "head"],
         (0, 200, 1420), (1, 0, 0), rng(-15, 160)),
        ("waist pitch (-15 back .. +75 fwd), arms held clear", ["torso", "neck_link", "head", "l_shoulder", "r_shoulder"],
         ["pelvis", "waist_link", "l_hip_yaw", "r_hip_yaw", "l_hip_roll", "r_hip_roll", "l_thigh", "r_thigh"], (0, 0, 1085), (0, 1, 0), rng(-15, 75)),
        ("waist yaw (-70..70), arms held clear", ["waist_link", "torso", "neck_link", "head", "l_shoulder", "r_shoulder"],
         ["pelvis", "l_hip_yaw", "r_hip_yaw", "l_hip_roll", "r_hip_roll"], (0, 0, 1000), (0, 0, 1), rng(-70, 70)),
        ("waist yaw (-70..70), arms hanging", ["waist_link"] + upper, ["pelvis", "l_hip_yaw", "r_hip_yaw", "l_hip_roll", "r_hip_roll"],
         (0, 0, 1000), (0, 0, 1), rng(-70, 70)),
        ("neck pitch (-35 up .. +50 down)", ["head"], ["neck_link", "torso"], (0, 0, 1555), (0, 1, 0), rng(-35, 50)),
        ("neck yaw (-80..80)", ["neck_link", "head"], ["torso"], (0, 0, 1485), (0, 0, 1), rng(-80, 80)),
    ]
    print("\nSWEEPS: shell-limited range (first skin contact) and interior contacts")
    for name, mov, sta, pt, ax, angs in jobs:
        first, interior = sweep(parts, name, set(mov), set(sta), pt, ax, angs)
        lo, hi = free_range(first, angs)
        res["sweeps"][name] = {"free_range_deg": [lo, hi],
                               "skin_contacts": {f"{a} x {b}": v for (a, b), v in sorted(first.items(), key=lambda kv: abs(kv[1][0]))[:12]},
                               "interior_contacts": {f"{a} x {b}": v for (a, b), v in sorted(interior.items(), key=lambda kv: abs(kv[1][0]))[:12]}}
        print(f"\n  {name}: free {lo:+d} .. {hi:+d} deg")
        for sgn in (-1, 1):
            side = [(k, v) for k, v in first.items() if v[0] * sgn > 0]
            for (a, b), (ang, dep) in sorted(side, key=lambda kv: abs(kv[1][0]))[:3]:
                print(f"      skin   {ang:+4d} deg  {dep:5.1f} mm  {a}  x  {b}")
        for (a, b), (ang, dep) in sorted(interior.items(), key=lambda kv: abs(kv[1][0]))[:4]:
            print(f"      inner  {ang:+4d} deg  {dep:5.1f} mm  {a}  x  {b}")
    (OUT / "clearance.json").write_text(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
