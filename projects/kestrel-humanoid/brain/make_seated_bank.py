"""Record seated states (the sit skill from slightly different starting marks) for stand-up training.

    KESTREL_VARIANT=s1body python make_seated_bank.py 30     # -> data/seated_bank.npz
"""
import math
import os
import random
import sys
from pathlib import Path

os.environ.setdefault("KESTREL_VARIANT", "s1body")
os.environ.setdefault("MUJOCO_GL", "osmesa")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np        # noqa: E402
import skills as SK       # noqa: E402

n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
w = SK.World()
rng = random.Random(1)
Q, V = [], []
while len(Q) < n:
    dx, dy, dh = rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), rng.uniform(-0.06, 0.06)
    w.place_robot(SK.CHAIR[0] + dx, SK.CHAIR[1] - 0.40 + dy, -math.pi / 2 + dh)
    for _ in range(40):
        w.step(arms=[0, 0, -0.2, -0.2])
    if not w.sit():
        continue
    w.stiff(True)
    for _ in range(100):
        w.step(legs=w.legs_now(), arms=w.arms_now())
    w.stiff(False)
    Q.append(w.e.d[0].qpos.copy())
    V.append(w.e.d[0].qvel.copy())
    print(f"  {len(Q)}/{n} seated, pelvis {w.pelvis_z():.2f} m", flush=True)
out = Path(__file__).resolve().parent / "data" / "seated_bank.npz"
np.savez(out, qpos=np.array(Q), qvel=np.array(V))
print(f"wrote {out}")
