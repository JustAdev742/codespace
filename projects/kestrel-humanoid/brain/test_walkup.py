"""Sit-and-stand from anywhere: the will's whole chair sequence from random places on the floor, scored.

    KESTREL_VARIANT=s1body python test_walkup.py --seeds 10-33 --procs 4

For each seed the robot starts at a random spot and heading near the chair, then runs Will.sit_and_rest(): walk to the
chair, line up on the mark, sit, rest 6 s, stand up with the learned policy, hand back to the walking policy.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("KESTREL_VARIANT", "s1body")
os.environ.setdefault("MUJOCO_GL", "osmesa")


def one(seed):
    import skills as SK
    import will as WL
    w = SK.World(policy="s1fast", seed=seed)
    w.frames = None
    g = random.Random(100 + seed)
    w.place_robot(g.uniform(-18.0, -12.0), g.uniform(-17.5, -14.5), g.uniform(-math.pi, math.pi))
    wl = WL.Will(w, seed=seed, log=lambda *a: None)
    sat = []
    sit0 = w.sit

    def sit():
        sat.append(sit0())
        return sat[-1]
    w.sit = sit
    ok = wl.sit_and_rest()
    return seed, bool(sat and sat[-1]), ok, getattr(w, "stand_note", "-"), w.t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="10-33")
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2)))
    a = ap.parse_args()
    lo, hi = (int(x) for x in a.seeds.split("-"))
    with Pool(a.procs) as pool:
        res = pool.map(one, range(lo, hi + 1), chunksize=1)
    for seed, sat, ok, note, t in res:
        print(f"  seed {seed}: sat {'yes' if sat else 'NO '}  stood {'yes' if ok else 'NO '}  ({note}, {t:.0f} s)")
    n = len(res)
    print(f"sat {sum(r[1] for r in res)} of {n}; sat, rested and stood up {sum(r[2] for r in res)} of {n}")


if __name__ == "__main__":
    main()
