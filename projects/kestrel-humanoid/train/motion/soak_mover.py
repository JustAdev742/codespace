"""Soak test for the training-free mover: random intents, styles and layers for a long time; counts falls.

    python -m motion.soak_mover --library runs/motion/bandai_library.npz --minutes 60 --seed 1

Every few seconds a new random intent: walking (any speed, direction and turn the mover allows, any style), an action
in place, standing, and on top of those the layers (an arms-only action, a hand target, crouch, lean, look). If the
robot falls, the fall and the last intents are logged and it starts again standing. Prints a summary as JSON.
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np

from .mover import DT, LIMITS, Mover
from .safety import _RX as COMBAT

WALKS = {"walk", "walk-back", "walk-left", "walk-right", "walk-turn-left", "walk-turn-right", "run", "dash"}


def random_intent(rng, gestures, styles, vmax=None, mode="all"):
    r = rng.random()
    if mode == "stand":
        r = 0.45 + 0.55 * r
    elif mode == "walk":
        r = 0.45 * r
    it = {}
    if r < 0.45:
        hi = min(LIMITS["vx"][1], vmax) if vmax else LIMITS["vx"][1]
        it = dict(action="walk", vx=float(rng.uniform(LIMITS["vx"][0], hi)), style=rng.choice([None] + styles))
        if rng.random() < 0.3:
            it["vy"] = float(rng.uniform(*LIMITS["vy"]))
        if rng.random() < 0.5:
            it["wz"] = float(rng.uniform(*LIMITS["wz"]))
        if rng.random() < 0.3:
            it["arms"] = rng.choice(gestures)
    elif r < 0.75:
        it = dict(action=rng.choice(gestures))
    else:
        it = dict(action="stand")
        k = rng.random()
        if k < 0.3:
            side = rng.choice(["left", "right"])
            sgn = 1 if side == "left" else -1
            it["reach"] = {side: (float(rng.uniform(0.15, 0.5)), sgn * float(rng.uniform(0.05, 0.35)),
                                  float(rng.uniform(0.7, 1.35)))}
        elif k < 0.5:
            it["crouch"] = float(rng.uniform(0.05, 0.25))
            if rng.random() < 0.5:
                it["reach"] = {"right": (float(rng.uniform(0.25, 0.4)), -0.15, float(rng.uniform(0.4, 0.7)))}
        elif k < 0.7:
            it["lean"] = float(rng.uniform(-0.2, 0.4))
            it["look"] = float(rng.uniform(-0.6, 0.6))
    return it


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--library", default="runs/motion/bandai_library.npz")
    ap.add_argument("--minutes", type=float, default=60.0)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--log", default=None)
    ap.add_argument("--vmax", type=float, default=None, help="cap the random forward speed")
    ap.add_argument("--mode", default="all", choices=["all", "stand", "walk"])
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    mv = Mover(a.library)
    gestures = sorted(x for x in set(mv.db.actions) if x not in WALKS and not COMBAT.search(x.replace("-", "_")))
    styles = sorted(s for s in set(mv.db.styles) if s)
    T = a.minutes * 60
    t, nxt, hist, falls, intents = 0.0, 0.0, [], [], 0
    qp_fail, t0 = 0, time.time()
    log = open(a.log, "a") if a.log else None
    k = 0
    while t < T:
        if t >= nxt:
            it = random_intent(rng, gestures, styles, a.vmax, a.mode)
            mv.set_intent(**it)
            hist = (hist + [(round(t, 1), it)])[-4:]
            intents += 1
            nxt = t + float(rng.uniform(1.5, 6.0))
        ok = mv.step()
        qp_fail += not mv.wbc.last_ok
        t += DT
        k += 1
        if not ok:
            rec = dict(t=round(t, 2), last_intents=hist)
            falls.append(rec)
            if log:
                log.write(json.dumps(rec) + "\n")
                log.flush()
            mv = Mover(a.library, db=mv.db)
            nxt = t
        if k % int(60 / DT) == 0:
            msg = f"seed {a.seed}: {t / 60:5.1f} min simulated, {len(falls)} falls, {intents} intents, " \
                  f"{t / (time.time() - t0):.2f}x real time"
            print(msg, flush=True)
            if log:
                log.write(msg + "\n")
                log.flush()
    out = dict(seed=a.seed, minutes=round(t / 60, 1), intents=intents, falls=len(falls),
               falls_per_hour=round(len(falls) / (t / 3600), 2), qp_fallbacks=qp_fail,
               realtime=round(t / (time.time() - t0), 2), fall_details=falls)
    print(json.dumps(out), flush=True)
    if log:
        log.write("RESULT " + json.dumps(out) + "\n")


if __name__ == "__main__":
    main()
