"""Shared settings of the fast salvaged-parts builds (variant_s1fast.py, variant_k1fast.py).

The scrap builds walk slowly because a drill gearmotor reflects 2-4 kg m^2 at the knee. The fast builds put
quasi-direct-drive actuators in the legs: hoverboard hub motors run hard (up to 45 A) by ODESC V4.2 FOC drives on a
48 V bus, through a short bike-chain reduction (reflected inertia ~0.1-0.3 kg m^2, torque-controlled and
back-drivable). Drill gearmotors stay where speed and inertia matter less (hip yaw, arms, waist).
Target: walk 0.8 m/s, fast walk 1.0 m/s (4x the drill builds; Unitree H2 is quoted at about 1.4 m/s), 18 cm
stairs, 10 kg box.
"""
from __future__ import annotations

from . import scrap_common as SC

# Fast walk 1.0 m/s (S1's fast-walk case, 0.42 m steps). At 1.2 m/s (K1's 2.67 Hz cadence) the swing accelerations
# times the hub motors' reflected inertia (2 x 0.007 kg m^2 x ratio^2) exceed what two hub motors can push at the hip:
# hub rotors are large, so their torque-squared-over-inertia is ~12x below a commercial QDD module (S1's X12).
FAST = dict(walk=(0.40, 0.40, 0.10), walk_fast=(0.42, 0.34, 0.08), hip_h=(0.83, 0.80),
            stair=0.18, stair_t=0.9, tread=0.28, box=10.0, hand=2.0, step_up=0.25, step_up_t=1.2, drop=0.10, neck=False,
            bus_V={"brushed": 18.0, "bldc": 36.0, "bldc_hv": 48.0},
            reduction={"*": "capstan"})
LEG_QDD = [("hubfoc", 1), ("hubfoc", 2), ("hubfoc", 3), ("drill18", 1), ("drill18", 2)]   # hub motors are cheap: up to 3 per joint


def retarget(ns, name, sub, joints_left, joints_centre, servo_classes=()):
    """Point an already-applied scrap variant at the fast build: name, data folders, loads, actuator classes, and a
    48 V leg pack (13S4P salvaged 18650s) with an 18 V buck for the drill-driven joints."""
    ns["NAME"] = name
    ns["DATA_DIR"] = ns["ROOT"] / "scrap" / sub / "data"
    ns["GEN_DIR"] = ns["ROOT"] / "scrap" / sub / "generated"
    ns["SCRAP"] = dict(FAST)
    ns["ACT"].clear()
    ns["ACT"].update(SC.act_classes(ns["DATA_DIR"], joints_left, joints_centre, servo_classes))
    if not (ns["DATA_DIR"] / "actuator_family.json").exists():   # first pass: start the legs from hub-motor physics
        for j in ("hip_roll", "hip_pitch", "knee", "ankle_pitch"):
            c = joints_left[j][0]
            ns["ACT"][c].update(mass=3.8, rotor_J=0.014, ratio=6.0, drive_kg=0.6, type="hubfoc")
    base = ns["build_bodies"]
    Comp = ns["Comp"]

    def build_bodies():
        B = base()
        for b in B:
            if b.name == "torso":
                b.comps = [c for c in b.comps if c.cat != "battery"]
                b.comps.append(Comp("battery: salvaged 18650 13S4P (48 V, ~10 Ah) + 13S BMS", 2.65, (-0.040, 0, 0.140), "box", (0.10, 0.18, 0.16), "battery"))
                b.comps.append(Comp("48 -> 18 V 20 A buck for the drill-driven joints + ODESC drives' share", 0.35, (0.06, 0, 0.26), "box", (0.04, 0.10, 0.06), "electronics"))
        return B

    ns["build_bodies"] = build_bodies
