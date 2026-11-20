"""Movements described in words, for the house robot: the text-to-motion generator (trained on hours of human motion
capture for the Unitree G1: train/motion/generator.py) makes the motion, and the robot's arms follow what they can of
it while the walking policy keeps it balanced.

    from express import express
    ok, note = express(bot, "wave hello with both hands", seconds=4)

Nothing is keyframed: any description works ("stretch your arms up", "celebrate", "beckon someone over", "conduct an
orchestra"), and two requests for the same thing come out a little different, as people's do. Descriptions of
striking or hurting are refused by the generator itself.

What the S1 can show: each of its arms has a shoulder that swings forward and back and an elbow (no shoulder roll or
twist, no wrists). So it follows the generated forward/back swing of each upper arm and the bend of each elbow - a
simplified, front-on version of the movement: a wave becomes a raised arm with the forearm going to and fro, a shrug
becomes a small lift of both forearms. Its legs stay with the walking policy (it stands; it does not dance its feet).

The generator is loaded the first time it is needed (a few seconds), from KESTREL_GENERATOR or
train/runs/motion/generator/model.pt; train one with `python -m motion.generator train` (see train/motion/README.md).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
TRAIN = HERE.parent / "train"
_gen = None

# the G1's joint order (train/motion/g1.py): the arm joints the S1 has a counterpart for
G1_L_PITCH, G1_L_ELBOW, G1_R_PITCH, G1_R_ELBOW = 15, 18, 22, 25
S1_PITCH, S1_ELBOW = (-3.1, 1.0), (-2.25, 0.0)      # the S1's ranges (rad); its elbow bends negative, the G1's positive


def generator_path():
    for p in (os.environ.get("KESTREL_GENERATOR"), TRAIN / "runs" / "motion" / "generator" / "model.pt",
              TRAIN / "models" / "generator.pt"):                 # trained here, else the one that comes with the code
        if p and Path(p).is_file():
            return Path(p)
    return None


def generator():
    global _gen
    if _gen is None:
        p = generator_path()
        if p is None:
            raise FileNotFoundError("no motion generator: train one (python -m motion.generator train) or set KESTREL_GENERATOR")
        sys.path.insert(0, str(TRAIN))
        from motion.generator import Generator
        _gen = Generator(str(p), threads=2)
    return _gen


def arm_track(text, seconds=4.0, seed=None):
    """The S1's four arm angles [N, 4] (l pitch, r pitch, l elbow, r elbow) at 50 Hz, for a description."""
    from motion.generator import FPS, features_to_motion, upsample
    g = generator()
    f = g.generate(text, max(1.6, min(8.0, seconds)), seed=seed)
    q, _, _ = features_to_motion(f)
    arms = np.stack([q[:, G1_L_PITCH], q[:, G1_R_PITCH], -q[:, G1_L_ELBOW], -q[:, G1_R_ELBOW]], 1)
    arms[:, :2] = arms[:, :2].clip(*S1_PITCH)
    arms[:, 2:] = arms[:, 2:].clip(*S1_ELBOW)
    return upsample(arms, FPS, 50)


def express(bot, text, seconds=4.0, seed=None):
    """Do a movement described in words with the arms, standing. Returns (ok, what happened)."""
    import env as E
    import skills as SK
    h = bot.h
    if h.holding is not None:
        return False, "my hook is holding something: put it down first"
    try:
        track = arm_track(text, seconds, seed)
    except ValueError as e:
        return False, str(e)
    except FileNotFoundError as e:
        return False, str(e)
    import housebot as HB

    def tick(a):                                                     # one control step with these arm targets
        if bot.seated:
            h.step(legs=h.legs_now(), arms=list(a))
        else:
            bot.arms = list(a)
            bot.stand_still(E.DT)
    cur = list(h.arms_now())
    lead = [(0.0, cur), (0.5, list(track[0]))]                       # ease in from where the arms are
    for k in range(int(0.5 / E.DT)):
        tick(SK.keyframes(lead, k * E.DT))
    step = max(1, int(round(E.DT * 50)))                             # the track is 50 Hz; the control step may differ
    for a in track[::step]:
        tick(a)
    back = [(0.0, list(h.arms_now())), (0.6, list(HB.REST_ARMS))]
    for k in range(int(0.7 / E.DT)):
        tick(SK.keyframes(back, k * E.DT))
    bot.arms = list(HB.REST_ARMS)
    if bot.sup.latched:
        return False, "I lost my balance doing it"
    return True, f"did '{text}' ({len(track) / 50:.1f} s; my arms show its forward-and-back and elbow parts)"
