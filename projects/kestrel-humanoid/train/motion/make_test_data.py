"""Synthetic motion clips for testing the whole pipeline before real datasets arrive.

Writes BVH files (a Mixamo-style human skeleton, centimetres, y up, 60 fps - like real mocap exports) of walking,
turning, squatting, waving, reaching and arm swings, plus one deliberately violent clip named 'punch' that the
combat filter must reject.

    python -m motion.make_test_data --out /tmp/motion_test
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

# name, parent, offset (cm, y up, z forward)
SKELETON = [
    ("Hips", None, (0, 95, 0)),
    ("LeftUpLeg", "Hips", (9, -5, 0)), ("LeftLeg", "LeftUpLeg", (0, -42, 0)), ("LeftFoot", "LeftLeg", (0, -42, 0)),
    ("LeftToeBase", "LeftFoot", (0, -6, 13)),
    ("RightUpLeg", "Hips", (-9, -5, 0)), ("RightLeg", "RightUpLeg", (0, -42, 0)), ("RightFoot", "RightLeg", (0, -42, 0)),
    ("RightToeBase", "RightFoot", (0, -6, 13)),
    ("Spine", "Hips", (0, 10, 0)), ("Spine1", "Spine", (0, 12, 0)), ("Spine2", "Spine1", (0, 12, 0)),
    ("Neck", "Spine2", (0, 14, 0)), ("Head", "Neck", (0, 10, 0)),
    ("LeftShoulder", "Spine2", (5, 10, 0)), ("LeftArm", "LeftShoulder", (12, 0, 0)), ("LeftForeArm", "LeftArm", (27, 0, 0)),
    ("LeftHand", "LeftForeArm", (25, 0, 0)),
    ("RightShoulder", "Spine2", (-5, 10, 0)), ("RightArm", "RightShoulder", (-12, 0, 0)),
    ("RightForeArm", "RightArm", (-27, 0, 0)), ("RightHand", "RightForeArm", (-25, 0, 0)),
]
NAMES = [s[0] for s in SKELETON]


def write_bvh(path, frames, fps=60):
    """frames: dict name -> [T, 3] (Z, X, Y rotation in degrees) plus 'root' [T, 3] position (cm)."""
    T = len(frames["root"])
    lines = ["HIERARCHY"]
    children = {n: [s[0] for s in SKELETON if s[1] == n] for n in NAMES}

    def emit(n, depth):
        off = dict((s[0], s[2]) for s in SKELETON)[n]
        pad = "  " * depth
        lines.append(f"{pad}{'ROOT' if depth == 0 else 'JOINT'} {n}")
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  OFFSET {off[0]:.3f} {off[1]:.3f} {off[2]:.3f}")
        if depth == 0:
            lines.append(f"{pad}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation")
        else:
            lines.append(f"{pad}  CHANNELS 3 Zrotation Xrotation Yrotation")
        for c in children[n]:
            emit(c, depth + 1)
        if not children[n]:
            lines.append(f"{pad}  End Site")
            lines.append(f"{pad}  {{")
            lines.append(f"{pad}    OFFSET 0 -3 0")
            lines.append(f"{pad}  }}")
        lines.append(f"{pad}}}")
    emit("Hips", 0)
    lines += ["MOTION", f"Frames: {T}", f"Frame Time: {1.0 / fps:.6f}"]
    order = []

    def walk(n):
        order.append(n)
        for c in children[n]:
            walk(c)
    walk("Hips")
    for t in range(T):
        row = list(frames["root"][t])
        for n in order:
            row += list(frames.get(n, np.zeros((T, 3)))[t])
        lines.append(" ".join(f"{v:.4f}" for v in row))
    Path(path).write_text("\n".join(lines) + "\n")


def clip(kind, secs=4.0, fps=60, speed=1.0):
    T = int(secs * fps)
    t = np.arange(T) / fps
    z = np.zeros(T)
    F = {n: np.zeros((T, 3)) for n in NAMES}
    root = np.stack([z, np.full(T, 95.0), z], 1)
    rest_arm = 75.0                                  # arms down: rotate the T-pose arms about Z
    F["LeftArm"][:, 0] = -rest_arm
    F["RightArm"][:, 0] = rest_arm
    if kind in ("walk", "turn"):
        w = 2 * math.pi * 0.9 * speed
        hip = 25 * np.sin(w * t)
        knee = 30 * np.clip(np.sin(w * t + 1.2), 0, None) + 5
        F["LeftUpLeg"][:, 1] = -hip
        F["RightUpLeg"][:, 1] = hip
        F["LeftLeg"][:, 1] = knee
        F["RightLeg"][:, 1] = 30 * np.clip(np.sin(w * t + 1.2 + math.pi), 0, None) + 5
        F["LeftArm"][:, 2] = -hip * 0.6          # channel 2 = Y: swings the lowered arm forward and back
        F["RightArm"][:, 2] = -hip * 0.6
        root[:, 2] = 110 * speed * t
        root[:, 1] = 95 - 2 * np.cos(2 * w * t)
        if kind == "turn":
            F["Hips"][:, 2] = np.degrees(0.5 * t)
    elif kind == "squat":
        d = 0.5 - 0.5 * np.cos(2 * math.pi * 0.35 * t)
        F["LeftUpLeg"][:, 1] = -80 * d
        F["RightUpLeg"][:, 1] = -80 * d
        F["LeftLeg"][:, 1] = 110 * d
        F["RightLeg"][:, 1] = 110 * d
        F["LeftFoot"][:, 1] = -30 * d
        F["RightFoot"][:, 1] = -30 * d
        F["Spine"][:, 1] = 25 * d
        root[:, 1] = 95 - 35 * d
        F["LeftArm"][:, 2] = -60 * d
        F["RightArm"][:, 2] = 60 * d
    elif kind == "wave":
        F["RightArm"][:, 0] = -80 + 10 * np.sin(t)
        F["RightForeArm"][:, 0] = -40 + 35 * np.sin(2 * math.pi * 1.5 * t)
    elif kind == "reach":
        d = 0.5 - 0.5 * np.cos(2 * math.pi * 0.3 * t)
        F["RightArm"][:, 2] = 80 * d
        F["Spine"][:, 1] = 30 * d
        F["LeftUpLeg"][:, 1] = -30 * d
        F["RightUpLeg"][:, 1] = -30 * d
        F["LeftLeg"][:, 1] = 40 * d
        F["RightLeg"][:, 1] = 40 * d
        root[:, 1] = 95 - 10 * d
    elif kind == "swing":
        F["LeftArm"][:, 2] = -40 * np.sin(2 * math.pi * 0.8 * t)
        F["RightArm"][:, 2] = -40 * np.sin(2 * math.pi * 0.8 * t)
    elif kind == "punch":                            # fast straight-arm strikes forward: must be filtered out
        ph = (t * 2.5) % 1.0
        ext = np.where(ph < 0.15, ph / 0.15, np.clip(1 - (ph - 0.15) / 0.5, 0, 1))
        F["RightArm"][:, 0] = 0.0                   # arm up at shoulder height, pointing forward
        F["RightArm"][:, 2] = 90.0
        F["RightForeArm"][:, 2] = 110 * (1 - ext)   # elbow bent, then snapped straight: the strike
    F["root"] = root
    for n in NAMES:
        F[n] = F[n].astype(float)
    return F


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="motion_test_data")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    kinds = [("walk_slow", "walk", 0.7), ("walk_fast", "walk", 1.3), ("turn_walk", "turn", 1.0), ("squat", "squat", 1.0),
             ("wave_hello", "wave", 1.0), ("reach_shelf", "reach", 1.0), ("arm_swing", "swing", 1.0),
             ("punch_combo", "punch", 1.0)]
    for name, kind, sp in kinds:
        write_bvh(out / f"{name}.bvh", clip(kind, speed=sp))
    print(f"wrote {len(kinds)} clips to {out}")


if __name__ == "__main__":
    main()
