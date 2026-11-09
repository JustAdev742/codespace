"""KESTREL S1-Scrap - the salvaged-parts S1 (target A$500). Loaded by params.py when KESTREL_VARIANT=s1scrap.

Same skeleton as S1 (1.75 m, same leg and arm geometry), built by hand from scrap and AliExpress parts:
  * 16 actuated joints: legs 2 x 6 (hip yaw / roll / pitch, knee, 2-motor parallel ankle), arms 2 x 2 (shoulder
    pitch, elbow). Waist, neck, shoulder roll / yaw and wrists are fixed brackets; hands are fixed hooks.
  * every actuator is a salvaged 18 V cordless-drill motor + its planetary gearbox (torque clutch kept as a fuse),
    with a hand-made Dyneema capstan drive where a joint needs more reduction (scrap/calc/scrap_select.py sizes the
    sector), driven by a BTS7960 H-bridge with a magnetic angle sensor on the joint
  * frame: aluminium angle, flat bar and square tube from the hardware store plus 12 mm plywood, cut and drilled with
    hand tools; 608 skateboard bearings at every pivot
  * salvaged 18650 cells in a 5S pack (18 V, like the drills' own batteries), ESP32 controllers, MPU-class IMU,
    a hard-wired e-stop relay
Masses are estimates from the stock sizes (scrap/docs) until the robot is weighed; actuator data come from
scrap/data/actuators.json (docs/research/R11).
"""
from __future__ import annotations

import json

from . import scrap_common as SC

NAME = "KESTREL S1-Scrap"
SUB = "s1"

JOINTS_LEFT = {
    "hip_yaw": ("X-HY", (-25, 35), "drill gearmotor, direct"),
    "hip_roll": ("X-HR", (-20, 25), "drill gearmotor + capstan"),
    "hip_pitch": ("X-HP", (-100, 30), "drill gearmotor + capstan"),
    "knee": ("X-KN", (0, 120), "drill gearmotor + capstan from the upper thigh"),
    "ankle_pitch": ("X-AN", (-40, 40), "2 drill gearmotors, parallel push-rods (shared with roll)"),
    "ankle_roll": ("X-AN", (-20, 20), "2 drill gearmotors, parallel push-rods (shared with pitch)"),
    "shoulder_pitch": ("X-SH", (-180, 60), "drill gearmotor + capstan"),
    "elbow": ("X-EL", (-130, 0), "drill gearmotor, direct"),
}

# Load levels of the reduced design cases (calc/kestrel/scenarios.py, scrap_scenarios). High-ratio salvaged gearmotors
# reflect a large rotor inertia (J x ratio^2), so S1-Scrap walks the slow, always-balanced way: long double support,
# 0.12 m/s nominal and 0.24 m/s fast, low steps, 2 kg objects, small missed steps.
SCRAP = dict(walk=(0.15, 0.80, 0.40), walk_fast=(0.20, 0.60, 0.25), stair=0.10, stair_t=2.4, box=2.0, hand=0.5,
             step_up=0.10, step_up_t=2.0, drop=0.03, neck=False,
             bus_V={"brushed": 18.0, "bldc": 36.0},           # 5S Li-ion (18 V nominal, as the drills' own packs)
             reduction={"*": "capstan"})                      # hand-made Dyneema capstan drives (scrap guide)
# actuators each joint class may use in scrap/calc/scrap_select.py: (type in scrap/data/actuators.json, motors per joint)
ALLOWED = {"*": [("drill18", 1), ("drill18", 2)]}
# relaxed K1 minimums: a slow, light robot (turning, push-recovery stepping and reaching are slower)
SUPP_OVERRIDE = {
    "hip_yaw": dict(T=20.0, w=2.5, why="turning in place, scrap build: ~1.6 kg m^2 x 8 rad/s^2 + scrub, x1.4"),
    "hip_roll": dict(w=2.0, why="lateral stepping, scrap build"),
    "ankle_pitch": dict(w=4.0),
    "ankle_roll": dict(w=2.5),
    "shoulder_pitch": dict(w=3.0, why="reaching speed, scrap build"),
    "elbow": dict(w=3.0, why="reaching speed, scrap build"),
}


def apply(ns):
    ns["NAME"] = NAME
    ns["DESIGN_MASS_GROWTH"] = 1.15                  # hand-built: more uncertainty than CAD-built S1 (1.10)
    ns["DATA_DIR"] = ns["ROOT"] / "scrap" / SUB / "data"
    ns["GEN_DIR"] = ns["ROOT"] / "scrap" / SUB / "generated"
    ns["SCENARIOS_SKIP"] = set()
    ns["WORKLOAD"] = "scrap"
    ns["SCRAP"] = dict(SCRAP)
    ns["SUPP_OVERRIDE"] = dict(SUPP_OVERRIDE)
    ns["DIM"] = dict(ns["DIM"], waist_pitch_above=0.070)   # S1 skeleton (K1 Mk II raised its waist)
    ns["HEIGHT"] = 1.75
    ns["ACT"].clear()
    ns["ACT"].update(SC.act_classes(ns["DATA_DIR"], JOINTS_LEFT))
    ns["JOINTS_LEFT"] = dict(JOINTS_LEFT)
    ns["JOINTS_CENTRE"] = {}
    ns["MIRROR_SIGN"] = {"hip_yaw", "hip_roll", "shoulder_roll", "ankle_roll"}
    Comp, Body = ns["Comp"], ns["Body"]
    ACT = ns["ACT"]
    d = ns["DIM"]

    def A(cls):
        return ACT[cls]["mass"]

    def drive(cls):            # chain + 2 sprockets + jackshaft bearings, only where the class has a chain stage
        return ACT[cls].get("drive_kg", 0.0)

    def build_bodies():
        B = []
        B.append(Body("pelvis", None, None, comps=[
            Comp("pelvis frame: 25x25x3 aluminium angle box + 12 mm plywood plate", 1.20, (0.0, 0, 0.040), "box", (0.20, 0.30, 0.10), "structure"),
            Comp("hip-yaw gearmotor L", A("X-HY"), (0.0, d["hip_half_width"], 0.120), "cyl", (0.024, 0.18, "z"), "actuator"),
            Comp("hip-yaw gearmotor R", A("X-HY"), (0.0, -d["hip_half_width"], 0.120), "cyl", (0.024, 0.18, "z"), "actuator"),
            Comp("pelvis electronics: ESP32 + IMU + 4 H-bridges", 0.35, (-0.06, 0, 0.05), "box", (0.08, 0.10, 0.04), "electronics"),
            Comp("pelvis wiring", 0.30, (-0.03, 0, 0.06), "box", (0.10, 0.20, 0.05), "harness"),
        ]))
        B.append(Body("waist_link", "pelvis", None, (0, 0, d["waist_yaw_above"]), (0, 0, 1), comps=[
            Comp("waist post: 40x40 aluminium square tube + gussets", 0.35, (0.0, 0, 0.035), "box", (0.06, 0.06, 0.07), "structure"),
        ]))
        h_sh = d["shoulder_z"]
        B.append(Body("torso", "waist_link", None, (0, 0, d["waist_pitch_above"]), (0, 1, 0), comps=[
            Comp("torso frame: aluminium angle ladder + 12 mm plywood back and shoulder plates", 1.60, (-0.01, 0, 0.20), "box", (0.16, 0.30, 0.40), "structure"),
            Comp("battery: salvaged 18650 5S5P (18 V, ~12 Ah) in holders + 5S BMS", 1.50, (-0.040, 0, 0.140), "box", (0.08, 0.16, 0.12), "battery"),
            Comp("power: e-stop button + 40 A relay, fuses, 5 V buck, 4 H-bridges", 0.45, (0.06, 0, 0.16), "box", (0.04, 0.16, 0.10), "electronics"),
            Comp("shoulder-pitch gearmotor L", A("X-SH"), (0.0, d["shoulder_half_width"] - 0.08, h_sh), "cyl", (0.024, 0.18, "y"), "actuator"),
            Comp("shoulder-pitch gearmotor R", A("X-SH"), (0.0, -d["shoulder_half_width"] + 0.08, h_sh), "cyl", (0.024, 0.18, "y"), "actuator"),
            Comp("shoulder chain drives", 2 * drive("X-SH"), (0.0, 0, h_sh), "box", (0.04, 0.30, 0.08), "structure"),
            Comp("torso wiring", 0.50, (-0.02, 0, 0.22), "box", (0.10, 0.30, 0.30), "harness"),
        ]))
        B.append(Body("neck_link", "torso", None, (0, 0, d["neck_yaw_z"]), (0, 0, 1), comps=[
            Comp("neck post (aluminium angle)", 0.10, (0, 0, 0.03), "box", (0.03, 0.03, 0.06), "structure"),
        ]))
        B.append(Body("head", "neck_link", None, (0, 0, d["neck_pitch_above"]), (0, 1, 0), comps=[
            Comp("head: plywood box + USB webcam (or an old phone)", 0.35, (0.03, 0, 0.08), "box", (0.12, 0.14, 0.12), "sensor"),
        ]))
        for side, s in (("l", 1), ("r", -1)):
            B.append(Body(f"{side}_shoulder", "torso", f"{side}_shoulder_pitch", (0, s * d["shoulder_half_width"], h_sh), (0, 1, 0), comps=[
                Comp("shoulder bracket (aluminium angle, fixed roll)", 0.15, (0.0, 0, -0.02), "box", (0.06, 0.05, 0.06), "structure"),
            ]))
            B.append(Body(f"{side}_upper_arm_a", f"{side}_shoulder", None, (0, 0, 0), (1, 0, 0), comps=[
                Comp("shoulder-to-arm bolts", 0.03, (0, 0, -0.03), "box", (0.03, 0.03, 0.03), "structure"),
            ]))
            B.append(Body(f"{side}_upper_arm", f"{side}_upper_arm_a", None, (0, 0, 0), (0, 0, 1), comps=[
                Comp("elbow gearmotor", A("X-EL"), (0, 0, -d["upper_arm"] + 0.09), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("upper arm: 25x25x1.6 aluminium square tube + plates", 0.25, (0, 0, -0.16), "box", (0.03, 0.04, 0.26), "structure"),
                Comp("upper-arm wiring", 0.08, (0, 0, -0.18), "cyl", (0.015, 0.2, "z"), "harness"),
            ]))
            B.append(Body(f"{side}_forearm_a", f"{side}_upper_arm", f"{side}_elbow", (0, 0, -d["upper_arm"]), (0, 1, 0), comps=[
                Comp("elbow output bracket", 0.08, (0, 0, -0.01), "box", (0.05, 0.05, 0.03), "structure"),
            ]))
            B.append(Body(f"{side}_forearm", f"{side}_forearm_a", None, (0, 0, -d["wrist_yaw_from_elbow"]), (0, 0, 1), comps=[
                Comp("forearm: 20x20 aluminium square tube", 0.12, (0, 0, -0.09), "box", (0.02, 0.02, 0.18), "structure"),
            ]))
            wrist_z = -(d["forearm"] - d["wrist_yaw_from_elbow"])
            B.append(Body(f"{side}_wrist", f"{side}_forearm", None, (0, 0, wrist_z), (0, 1, 0), comps=[
                Comp("wrist bolts", 0.03, (0, 0, -0.01), "box", (0.03, 0.03, 0.02), "structure"),
            ]))
            B.append(Body(f"{side}_hand", f"{side}_wrist", None, (0, 0, 0), (1, 0, 0), comps=[
                Comp("hand: bent aluminium hook / plywood mitten", 0.12, (0, 0, -0.06), "box", (0.03, 0.08, 0.10), "hand"),
            ]))
        for side, s in (("l", 1), ("r", -1)):
            B.append(Body(f"{side}_hip_yaw_link", "pelvis", f"{side}_hip_yaw", (0, s * d["hip_half_width"], d["hip_yaw_above"]), (0, 0, 1), comps=[
                Comp("hip-roll gearmotor", A("X-HR"), (-0.10, 0, -d["hip_yaw_above"]), "cyl", (0.024, 0.18, "x"), "actuator"),
                Comp("hip-roll chain drive", drive("X-HR"), (-0.05, 0, -d["hip_yaw_above"]), "box", (0.06, 0.03, 0.12), "structure"),
                Comp("hip yaw-roll bracket (aluminium angle + 608 bearings)", 0.45, (-0.03, 0, -0.04), "box", (0.10, 0.09, 0.08), "structure"),
            ]))
            B.append(Body(f"{side}_hip_roll_link", f"{side}_hip_yaw_link", f"{side}_hip_roll", (0, 0, -d["hip_yaw_above"]), (1, 0, 0), comps=[
                Comp("hip-pitch gearmotor", A("X-HP"), (-0.06, 0, 0.04), "cyl", (0.024, 0.18, "y"), "actuator"),
                Comp("hip-pitch chain drive", drive("X-HP"), (-0.03, 0, 0.02), "box", (0.06, 0.03, 0.12), "structure"),
                Comp("hip roll-pitch bracket (aluminium angle)", 0.35, (-0.07, 0, 0), "box", (0.02, 0.12, 0.15), "structure"),
            ]))
            B.append(Body(f"{side}_thigh", f"{side}_hip_roll_link", f"{side}_hip_pitch", (0, 0, 0), (0, 1, 0), comps=[
                Comp("knee gearmotor (upper thigh)", A("X-KN"), (0, 0, -0.10), "cyl", (0.024, 0.18, "y"), "actuator"),
                Comp("knee chain drive (sprockets + chain to the knee)", drive("X-KN"), (0, 0, -0.25), "box", (0.04, 0.03, 0.30), "structure"),
                Comp("thigh: 40x40x2 aluminium square tube + side plates", 0.65, (0, 0, -0.22), "box", (0.06, 0.06, 0.36), "structure"),
                Comp("thigh wiring", 0.15, (0, 0, -0.20), "box", (0.03, 0.03, 0.36), "harness"),
            ]))
            B.append(Body(f"{side}_shank", f"{side}_thigh", f"{side}_knee", (0, 0, -d["thigh"]), (0, 1, 0), comps=[
                Comp("knee sprocket + bearing block", 0.25, (0, 0, 0.0), "cyl", (0.06, 0.03, "y"), "structure"),
                Comp("ankle gearmotor A (calf, upper)", A("X-AN"), (-0.015, 0, -0.10), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("ankle gearmotor B (calf, lower)", A("X-AN"), (-0.025, 0, -0.20), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("shank: 40x40x2 aluminium square tube + plates", 0.60, (0, 0, -0.22), "box", (0.06, 0.06, 0.36), "structure"),
                Comp("ankle push-rods x2 (M8 threaded rod + rod ends)", 0.18, (-0.035, 0, -0.30), "cyl", (0.008, 0.26, "z"), "structure"),
                Comp("shank wiring", 0.12, (0, 0, -0.18), "box", (0.03, 0.03, 0.30), "harness"),
            ]))
            B.append(Body(f"{side}_ankle_link", f"{side}_shank", f"{side}_ankle_pitch", (0, 0, -d["shank"]), (0, 1, 0), comps=[
                Comp("ankle cross (steel bolts + 608 bearings)", 0.15, (0, 0, 0), "box", (0.05, 0.05, 0.04), "structure"),
            ]))
            B.append(Body(f"{side}_foot", f"{side}_ankle_link", f"{side}_ankle_roll", (0, 0, 0), (1, 0, 0), comps=[
                Comp("foot: 12 mm plywood + aluminium angle stiffeners", 0.35, (0.06, 0, -0.050), "box", (0.24, 0.10, 0.03), "structure"),
                Comp("rubber sole (old tyre / door mat)", 0.15, (0.06, 0, -0.070), "box", (0.26, 0.11, 0.01), "structure"),
                Comp("4x microswitch / FSR foot contacts", 0.04, (0.06, 0, -0.058), "box", (0.20, 0.08, 0.01), "sensor"),
            ]))
        SC.add_ons(ns, B)
        return B

    ns["build_bodies"] = build_bodies
