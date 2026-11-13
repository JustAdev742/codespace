"""KESTREL S1-Sprint - S1-Fast with proximal actuation: every leg motor moved up to the hip.

The fast build's speed limit is swing inertia: two 1.9 kg hub motors ride on each thigh (knee) and two on each calf
(ankle), so every stride swings 7.6 kg of motor plus their reflected rotor inertia. Here, as on Cassie, Digit and the
MIT humanoid, the knee motors sit on the hip bracket above the hip axis and drive the knee through a chain over a
jackshaft coaxial with the hip pitch axis; the ankle motors sit on the upper thigh and drive the ankle cranks through
a second coaxial jackshaft at the knee. The joints, ratios and motors are S1-Fast's (scrap/s1fast/), so the reflected
inertia at each joint is unchanged; only where the motor mass rides changes. The chain over a coaxial jackshaft couples
the knee to the hip angle (and the ankle to the knee); the joint controller removes the coupling from the measured
angles, so the model treats the joints as independent.

Parallel springs ("tendons") at the knee and ankle are added in train/model.py (SPRINGS) for this variant.
Loaded by params.py when KESTREL_VARIANT=s1sprint."""
from __future__ import annotations

from . import variant_s1fast as F

NAME = "KESTREL S1-Sprint"
SUB = F.SUB
JOINTS_LEFT = F.JOINTS_LEFT
ALLOWED = F.ALLOWED
SUPP_OVERRIDE = F.SUPP_OVERRIDE


def apply(ns):
    F.apply(ns)
    ns["NAME"] = NAME
    base = ns["build_bodies"]
    Comp = ns["Comp"]

    def build_bodies():
        B = base()
        by = {b.name: b for b in B}
        for s in "lr":
            thigh, shank, hip = by[f"{s}_thigh"], by[f"{s}_shank"], by[f"{s}_hip_roll_link"]
            knee_m = [c for c in thigh.comps if c.name.startswith("knee gearmotor")]
            ankle_m = [c for c in shank.comps if c.name.startswith("ankle gearmotor")]
            thigh.comps = [c for c in thigh.comps if c not in knee_m]
            shank.comps = [c for c in shank.comps if c not in ankle_m]
            for c in knee_m:            # knee pair above the hip axis, on the hip bracket
                hip.comps.append(Comp("knee hub motors (on the hip bracket, chain over a hip-coaxial jackshaft)",
                                      c.mass, (0.0, 0.0, 0.11), "cyl", (0.07, 0.12, "y"), "actuator"))
            for i, c in enumerate(ankle_m):   # ankle pair high on the thigh
                thigh.comps.append(Comp(f"ankle hub motor {'AB'[i]} (upper thigh, chain over a knee-coaxial jackshaft)",
                                        c.mass, (-0.03, 0.0, -0.06 - 0.02 * i), "cyl", (0.07, 0.06, "y"), "actuator"))
            shank.comps.append(Comp("ankle drive: knee jackshaft, chains and cranks", 0.35, (-0.02, 0, -0.10), "box",
                                    (0.04, 0.04, 0.10), "structure"))
        return B

    ns["build_bodies"] = build_bodies
