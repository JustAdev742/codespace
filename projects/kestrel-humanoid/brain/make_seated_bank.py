"""Record seated states (the sit skill from slightly different starting marks) for stand-up training.

    KESTREL_VARIANT=s1body python make_seated_bank.py 30                        # -> data/seated_bank.npz
    KESTREL_VARIANT=s1body python make_seated_bank.py 80 --add                  # add 80 more to the existing bank
    KESTREL_VARIANT=s1body python make_seated_bank.py 20 --walkup --part 1      # -> data/seated_part1.npz
    KESTREL_VARIANT=s1body python make_seated_bank.py --merge                   # add every part to the bank

Each sit starts the way it does in the will: mid-gait, after stepping in place for a random while, from a mark up to
8 cm and 7 degrees off. With --walkup each one is the will's whole approach instead: a random start on the floor, walk
to the chair, line up on the mark, sit. Parts run in parallel processes and are merged afterwards.

The bank also stores the reference pose the stand-up policy acts around ("ref"), fixed when the bank is first made, so
adding states does not shift a trained policy's inputs.
"""
import math
import os
import random
import sys
from pathlib import Path

os.environ.setdefault("KESTREL_VARIANT", "s1body")
os.environ.setdefault("MUJOCO_GL", "osmesa")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import numpy as np        # noqa: E402
import skills as SK       # noqa: E402

out = HERE / "data" / "seated_bank.npz"
args = sys.argv[1:]


def opt(name, default=None):
    return args[args.index(name) + 1] if name in args else default


def save(Q, V, add):
    old = np.load(out) if add else None
    Q, V = np.array(Q), np.array(V)
    if add:
        qadr = None
        ref = old["ref"] if "ref" in old else None
        if ref is None:
            w = SK.World()
            qadr = list(w.e.qadr) + w.arm_qadr
            ref = old["qpos"][:, qadr].mean(0)
        Q, V = np.concatenate([old["qpos"], Q]), np.concatenate([old["qvel"], V])
    else:
        w = SK.World()
        ref = Q[:, list(w.e.qadr) + w.arm_qadr].mean(0)
    np.savez(out, qpos=Q, qvel=V, ref=ref)
    print(f"wrote {out} ({len(Q)} states)")


if "--merge" in args:
    parts = sorted((HERE / "data").glob("seated_part*.npz"))
    Q = np.concatenate([np.load(p)["qpos"] for p in parts])
    V = np.concatenate([np.load(p)["qvel"] for p in parts])
    print(f"merging {len(parts)} parts, {len(Q)} states")
    save(Q, V, add=True)
    for p in parts:
        p.unlink()
    sys.exit(0)

n = int(args[0]) if args and args[0].isdigit() else 30
add = "--add" in args
walkup = "--walkup" in args
part = opt("--part")
w = SK.World()
w.frames = None
rng = random.Random(1000 + int(part) if part else (len(np.load(out)["qpos"]) + 7 if add else 1))
if walkup:
    import will as WL
Q, V = [], []
tries = 0
while len(Q) < n:
    tries += 1
    if walkup:
        w.place_robot(rng.uniform(-18.0, -12.0), rng.uniform(-17.5, -14.5), rng.uniform(-math.pi, math.pi))
        wl = WL.Will(w, seed=rng.randrange(10 ** 6), log=lambda *a: None)
        cx, cy = SK.CHAIR
        if not wl.goto((cx, cy - 0.85), stop=0.15, speed=0.6, face=-math.pi / 2):
            continue
        if not wl.align((cx, cy - WL.SIT_MARK), -math.pi / 2):
            continue
    else:
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
    print(f"  {len(Q)}/{n} seated ({tries} tries), pelvis {w.pelvis_z():.2f} m", flush=True)

if part:
    p = HERE / "data" / f"seated_part{part}.npz"
    np.savez(p, qpos=np.array(Q), qvel=np.array(V))
    print(f"wrote {p} ({len(Q)} states)")
else:
    save(Q, V, add)
