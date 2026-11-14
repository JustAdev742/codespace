"""Record seated states (the sit skill from slightly different starting marks) for stand-up training.

    KESTREL_VARIANT=s1body python make_seated_bank.py 30            # -> data/seated_bank.npz
    KESTREL_VARIANT=s1body python make_seated_bank.py 80 --add      # add 80 more to the existing bank

Each sit starts the way it does in the will: mid-gait, after stepping in place for a random while, from a mark up to
8 cm and 7 degrees off. The bank also stores the reference pose the stand-up policy acts around ("ref"), fixed when the
bank is first made, so adding states does not shift a trained policy's inputs.
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
add = "--add" in sys.argv
out = Path(__file__).resolve().parent / "data" / "seated_bank.npz"
w = SK.World()
qadr = list(w.e.qadr) + w.arm_qadr
old = np.load(out) if add else None
rng = random.Random(len(old["qpos"]) + 7 if add else 1)
Q, V = [], []
while len(Q) < n:
    dx, dy, dh = rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), rng.uniform(-0.12, 0.12)
    w.place_robot(SK.CHAIR[0] + dx, SK.CHAIR[1] - 0.40 + dy, -math.pi / 2 + dh)
    for _ in range(rng.randint(40, 90)):  # stepping in place: the sit begins at a random point of the gait
        w.step(arms=[0, 0, -0.2, -0.2])
    if not w.sit():
        continue
    w.stiff(True)                         # sit for a varied while (slumping settles in), arms anywhere comfortable
    arms = [rng.uniform(-0.8, 0.2), rng.uniform(-0.8, 0.2), rng.uniform(-1.6, -0.1), rng.uniform(-1.6, -0.1)]
    for _ in range(rng.randint(50, 400)):
        w.step(legs=w.legs_now(), arms=arms)
    w.stiff(False)
    Q.append(w.e.d[0].qpos.copy())
    V.append(w.e.d[0].qvel.copy())
    print(f"  {len(Q)}/{n} seated, pelvis {w.pelvis_z():.2f} m", flush=True)
Q, V = np.array(Q), np.array(V)
if add:
    ref = old["ref"] if "ref" in old else old["qpos"][:, qadr].mean(0)
    Q, V = np.concatenate([old["qpos"], Q]), np.concatenate([old["qvel"], V])
else:
    ref = Q[:, qadr].mean(0)
np.savez(out, qpos=Q, qvel=V, ref=ref)
print(f"wrote {out} ({len(Q)} states)")
