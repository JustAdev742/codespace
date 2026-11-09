"""KESTREL K1-Scrap - the better salvaged-parts build (target A$1000). Loaded by params.py when KESTREL_VARIANT=k1scrap.

Same skeleton as S1 (1.75 m). Against S1-Scrap it adds what makes a K: more joints, hands, a face and a shell.
  * 25 actuated joints: legs 2 x 6, waist yaw, arms 2 x 4 (shoulder pitch / roll / yaw, elbow), neck 2; plus a
    one-servo three-finger gripper per hand
  * leg, waist and arm joints: salvaged 18 V drill gearmotors on hand-made Dyneema capstans (one or two per joint) or,
    where scrap/calc/scrap_select.py finds it cheaper, a hoverboard hub motor on a bike-chain reduction (two hoverboards
    give four hub motors, two FOC mainboards, two 36 V packs and two chargers)
  * neck and grippers: 20 kg·cm hobby servos on a PCA9685 board
  * head: an old smartphone (camera, IMU, screen face, Wi-Fi) in an EVA-foam helmet; body in heat-formed EVA-foam
    armour painted K1 white / graphite / amber
  * walks faster than S1-Scrap (0.25 m/s nominal, 0.36 m/s fast), 15 cm steps, 5 kg box, 1 kg per hand
"""
from __future__ import annotations

import json

from . import scrap_common as SC

NAME = "KESTREL K1-Scrap"
SUB = "k1"

JOINTS_LEFT = {
    "hip_yaw": ("K-HY", (-25, 35), "drill gearmotor + capstan"),
    "hip_roll": ("K-HR", (-20, 25), "drill gearmotor(s) + capstan, or hub motor + chain"),
    "hip_pitch": ("K-HP", (-100, 30), "drill gearmotor(s) + capstan, or hub motor + chain"),
    "knee": ("K-KN", (0, 120), "drill gearmotor(s) + capstan, or hub motor + chain"),
    "ankle_pitch": ("K-AN", (-40, 40), "2 drill gearmotors, parallel push-rods (shared with roll)"),
    "ankle_roll": ("K-AN", (-20, 20), "2 drill gearmotors, parallel push-rods (shared with pitch)"),
    "shoulder_pitch": ("K-SP", (-180, 60), "drill gearmotor + capstan"),
    "shoulder_roll": ("K-SR", (-10, 150), "drill gearmotor + capstan"),
    "shoulder_yaw": ("K-SY", (-90, 90), "drill gearmotor"),
    "elbow": ("K-EL", (-130, 0), "drill gearmotor"),
}
JOINTS_CENTRE = {
    "waist_yaw": ("K-WY", (-60, 60), "drill gearmotor + capstan"),
    "neck_yaw": ("K-NK", (-80, 80), "20 kg·cm servo"),
    "neck_pitch": ("K-NK", (-30, 40), "20 kg·cm servo"),
}
SERVO_CLASSES = ("K-NK",)

SCRAP = dict(walk=(0.20, 0.55, 0.25), walk_fast=(0.25, 0.50, 0.20), stair=0.15, stair_t=2.0, box=5.0, hand=1.0,
             step_up=0.15, step_up_t=1.8, drop=0.05, neck=False,          # phone head: slow turns (SUPP_OVERRIDE), no fast nod
             bus_V={"brushed": 18.0, "bldc": 36.0},
             reduction={"*": "capstan"})
ALLOWED = {
    "*": [("drill18", 1), ("drill18", 2)],
    "K-HR": [("drill18", 1), ("drill18", 2), ("hub36", 1)],
    "K-HP": [("drill18", 1), ("drill18", 2), ("hub36", 1)],
    "K-KN": [("drill18", 1), ("drill18", 2), ("hub36", 1)],
    "K-NK": [("servo20", 1)],
}
SUPP_OVERRIDE = {
    "hip_yaw": dict(T=30.0, w=3.0, why="turning in place, K1-Scrap"),
    "hip_roll": dict(w=2.5), "ankle_pitch": dict(w=5.0), "ankle_roll": dict(w=3.0),
    "waist_yaw": dict(T=15.0, w=2.0, why="upper-body yaw, K1-Scrap"),
    "shoulder_pitch": dict(w=4.0), "shoulder_roll": dict(w=4.0),
    "shoulder_yaw": dict(T=5.0, w=4.0, why="arm rotation with 1 kg in the hand"),
    "elbow": dict(w=4.0),
    "neck_yaw": dict(T=0.8, w=4.0, why="phone head 0.25 kg"), "neck_pitch": dict(T=0.8, w=4.0, why="phone head 0.25 kg"),
}


def apply(ns):
    ns["NAME"] = NAME
    ns["DESIGN_MASS_GROWTH"] = 1.15
    ns["DATA_DIR"] = ns["ROOT"] / "scrap" / SUB / "data"
    ns["GEN_DIR"] = ns["ROOT"] / "scrap" / SUB / "generated"
    ns["SCENARIOS_SKIP"] = set()
    ns["WORKLOAD"] = "scrap"
    ns["SCRAP"] = dict(SCRAP)
    ns["SUPP_OVERRIDE"] = dict(SUPP_OVERRIDE)
    ns["DIM"] = dict(ns["DIM"], waist_pitch_above=0.070)
    ns["HEIGHT"] = 1.75
    ns["ACT"].clear()
    ns["ACT"].update(SC.act_classes(ns["DATA_DIR"], JOINTS_LEFT, JOINTS_CENTRE, SERVO_CLASSES))
    ns["JOINTS_LEFT"] = dict(JOINTS_LEFT)
    ns["JOINTS_CENTRE"] = dict(JOINTS_CENTRE)
    ns["MIRROR_SIGN"] = {"hip_yaw", "hip_roll", "shoulder_roll", "ankle_roll", "shoulder_yaw"}
    Comp, Body = ns["Comp"], ns["Body"]
    ACT = ns["ACT"]
    d = ns["DIM"]
    hubs = any(v.get("type") == "hub36" for v in ACT.values())

    def A(cls):
        return ACT[cls]["mass"]

    def drive(cls):
        return ACT[cls].get("drive_kg", 0.0)

    def build_bodies():
        B = []
        B.append(Body("pelvis", None, None, comps=[
            Comp("pelvis frame: aluminium angle box + 12 mm plywood plate", 1.30, (0.0, 0, 0.040), "box", (0.20, 0.30, 0.10), "structure"),
            Comp("hip-yaw gearmotor L", A("K-HY"), (0.0, d["hip_half_width"], 0.120), "cyl", (0.024, 0.18, "z"), "actuator"),
            Comp("hip-yaw gearmotor R", A("K-HY"), (0.0, -d["hip_half_width"], 0.120), "cyl", (0.024, 0.18, "z"), "actuator"),
            Comp("hip-yaw capstans", 2 * drive("K-HY"), (0.0, 0, 0.09), "box", (0.04, 0.24, 0.04), "structure"),
            Comp("waist-yaw gearmotor", A("K-WY"), (-0.04, 0, 0.075), "cyl", (0.024, 0.18, "z"), "actuator"),
            Comp("pelvis electronics: ESP32 + IMU + H-bridges", 0.40, (-0.06, 0, 0.05), "box", (0.08, 0.10, 0.04), "electronics"),
            Comp("pelvis wiring", 0.35, (-0.03, 0, 0.06), "box", (0.10, 0.20, 0.05), "harness"),
            Comp("pelvis EVA armour", 0.15, (0.0, 0, 0.04), "box", (0.24, 0.32, 0.12), "shell"),
        ]))
        B.append(Body("waist_link", "pelvis", "waist_yaw", (0, 0, d["waist_yaw_above"]), (0, 0, 1), comps=[
            Comp("waist turntable: plywood discs + lazy-Susan bearing + capstan sector", 0.45 + drive("K-WY"), (0.0, 0, 0.035), "box", (0.14, 0.14, 0.06), "structure"),
        ]))
        h_sh = d["shoulder_z"]
        torso = [
            Comp("torso frame: aluminium angle ladder + plywood back and shoulder plates", 1.80, (-0.01, 0, 0.20), "box", (0.16, 0.30, 0.40), "structure"),
            Comp("battery for drills: salvaged 18650 5S6P (18 V, ~15 Ah) + 5S BMS", 1.80, (-0.040, 0, 0.140), "box", (0.08, 0.16, 0.14), "battery"),
            Comp("power: e-stop + 2 x 40 A relays, fuses, bucks, H-bridges", 0.60, (0.06, 0, 0.16), "box", (0.04, 0.16, 0.10), "electronics"),
            Comp("shoulder-pitch gearmotor L", A("K-SP"), (0.0, d["shoulder_half_width"] - 0.08, h_sh), "cyl", (0.024, 0.18, "y"), "actuator"),
            Comp("shoulder-pitch gearmotor R", A("K-SP"), (0.0, -d["shoulder_half_width"] + 0.08, h_sh), "cyl", (0.024, 0.18, "y"), "actuator"),
            Comp("shoulder capstans", 2 * drive("K-SP"), (0.0, 0, h_sh), "box", (0.04, 0.30, 0.08), "structure"),
            Comp("neck-yaw servo + PCA9685", A("K-NK") + 0.02, (0.0, 0, d["neck_yaw_z"] - 0.03), "box", (0.04, 0.03, 0.04), "actuator"),
            Comp("torso wiring", 0.60, (-0.02, 0, 0.22), "box", (0.10, 0.30, 0.30), "harness"),
            Comp("torso EVA armour (chest, back, abdomen)", 0.65, (0.0, 0, 0.20), "box", (0.24, 0.36, 0.42), "shell"),
        ]
        if hubs:
            torso.append(Comp("battery for hub motors: 2 hoverboard 10S2P packs (36 V, 2 x 158 Wh)", 2.10, (-0.06, 0, 0.30), "box", (0.08, 0.20, 0.12), "battery"))
            torso.append(Comp("2 hoverboard mainboards (FOC firmware)", 0.30, (0.06, 0, 0.30), "box", (0.03, 0.16, 0.08), "electronics"))
        B.append(Body("torso", "waist_link", None, (0, 0, d["waist_pitch_above"]), (0, 1, 0), comps=torso))
        B.append(Body("neck_link", "torso", "neck_yaw", (0, 0, d["neck_yaw_z"]), (0, 0, 1), comps=[
            Comp("neck bracket + neck-pitch servo", 0.06 + A("K-NK"), (0, 0, 0.03), "box", (0.04, 0.05, 0.05), "structure"),
        ]))
        B.append(Body("head", "neck_link", "neck_pitch", (0, 0, d["neck_pitch_above"]), (0, 1, 0), comps=[
            Comp("head: old smartphone (camera, IMU, screen face)", 0.20, (0.05, 0, 0.08), "box", (0.01, 0.08, 0.16), "sensor"),
            Comp("EVA-foam helmet + phone cradle", 0.15, (0.0, 0, 0.09), "box", (0.14, 0.15, 0.15), "shell"),
        ]))
        for side, s in (("l", 1), ("r", -1)):
            B.append(Body(f"{side}_shoulder", "torso", f"{side}_shoulder_pitch", (0, s * d["shoulder_half_width"], h_sh), (0, 1, 0), comps=[
                Comp("shoulder-roll gearmotor", A("K-SR"), (-0.06, 0.0, 0.0), "cyl", (0.024, 0.18, "x"), "actuator"),
                Comp("shoulder-roll capstan + bracket", 0.15 + drive("K-SR"), (-0.01, 0, 0.0), "box", (0.08, 0.06, 0.08), "structure"),
                Comp("shoulder EVA cap", 0.05, (0, 0, 0.01), "box", (0.10, 0.10, 0.08), "shell"),
            ]))
            B.append(Body(f"{side}_upper_arm_a", f"{side}_shoulder", f"{side}_shoulder_roll", (0, 0, 0), (1, 0, 0), comps=[
                Comp("shoulder-yaw gearmotor", A("K-SY"), (0, 0, -0.10), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("roll output bracket", 0.10, (0, s * 0.01, -0.025), "box", (0.06, 0.05, 0.05), "structure"),
            ]))
            B.append(Body(f"{side}_upper_arm", f"{side}_upper_arm_a", f"{side}_shoulder_yaw", (0, 0, 0), (0, 0, 1), comps=[
                Comp("elbow gearmotor", A("K-EL"), (0, 0, -d["upper_arm"] + 0.09), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("upper arm: 25x25x1.6 aluminium square tube + plates", 0.25, (0, 0, -0.16), "box", (0.03, 0.04, 0.26), "structure"),
                Comp("upper-arm wiring", 0.08, (0, 0, -0.18), "cyl", (0.015, 0.2, "z"), "harness"),
                Comp("upper-arm EVA armour", 0.06, (0, 0, -0.16), "box", (0.08, 0.08, 0.22), "shell"),
            ]))
            B.append(Body(f"{side}_forearm_a", f"{side}_upper_arm", f"{side}_elbow", (0, 0, -d["upper_arm"]), (0, 1, 0), comps=[
                Comp("elbow output bracket", 0.08, (0, 0, -0.01), "box", (0.05, 0.05, 0.03), "structure"),
            ]))
            B.append(Body(f"{side}_forearm", f"{side}_forearm_a", None, (0, 0, -d["wrist_yaw_from_elbow"]), (0, 0, 1), comps=[
                Comp("forearm: 20x20 aluminium square tube + EVA armour", 0.17, (0, 0, -0.09), "box", (0.06, 0.06, 0.18), "structure"),
            ]))
            wrist_z = -(d["forearm"] - d["wrist_yaw_from_elbow"])
            B.append(Body(f"{side}_wrist", f"{side}_forearm", None, (0, 0, wrist_z), (0, 1, 0), comps=[
                Comp("wrist bolts", 0.03, (0, 0, -0.01), "box", (0.03, 0.03, 0.02), "structure"),
            ]))
            B.append(Body(f"{side}_hand", f"{side}_wrist", None, (0, 0, 0), (1, 0, 0), comps=[
                Comp("3-finger gripper: plywood / aluminium fingers, 1 servo + tendon", 0.25, (0, 0, -0.07), "box", (0.04, 0.09, 0.12), "hand"),
            ]))
        for side, s in (("l", 1), ("r", -1)):
            B.append(Body(f"{side}_hip_yaw_link", "pelvis", f"{side}_hip_yaw", (0, s * d["hip_half_width"], d["hip_yaw_above"]), (0, 0, 1), comps=[
                Comp("hip-roll actuator", A("K-HR"), (-0.10, 0, -d["hip_yaw_above"]), "cyl", (0.03, 0.18, "x"), "actuator"),
                Comp("hip-roll reduction", drive("K-HR"), (-0.05, 0, -d["hip_yaw_above"]), "box", (0.06, 0.03, 0.12), "structure"),
                Comp("hip yaw-roll bracket (aluminium angle + 608 bearings)", 0.50, (-0.03, 0, -0.04), "box", (0.10, 0.09, 0.08), "structure"),
            ]))
            B.append(Body(f"{side}_hip_roll_link", f"{side}_hip_yaw_link", f"{side}_hip_roll", (0, 0, -d["hip_yaw_above"]), (1, 0, 0), comps=[
                Comp("hip-pitch actuator", A("K-HP"), (-0.06, 0, 0.04), "cyl", (0.03, 0.18, "y"), "actuator"),
                Comp("hip-pitch reduction", drive("K-HP"), (-0.03, 0, 0.02), "box", (0.06, 0.03, 0.12), "structure"),
                Comp("hip roll-pitch bracket (aluminium angle)", 0.40, (-0.07, 0, 0), "box", (0.02, 0.12, 0.15), "structure"),
            ]))
            B.append(Body(f"{side}_thigh", f"{side}_hip_roll_link", f"{side}_hip_pitch", (0, 0, 0), (0, 1, 0), comps=[
                Comp("knee actuator (upper thigh)", A("K-KN"), (0, 0, -0.10), "cyl", (0.03, 0.18, "y"), "actuator"),
                Comp("knee reduction (capstan sector or chain)", drive("K-KN"), (0, 0, -0.25), "box", (0.04, 0.03, 0.30), "structure"),
                Comp("thigh: 40x40x2 aluminium square tube + side plates", 0.70, (0, 0, -0.22), "box", (0.06, 0.06, 0.36), "structure"),
                Comp("thigh wiring", 0.15, (0, 0, -0.20), "box", (0.03, 0.03, 0.36), "harness"),
                Comp("thigh EVA armour", 0.15, (0, 0, -0.20), "box", (0.12, 0.12, 0.34), "shell"),
            ]))
            B.append(Body(f"{side}_shank", f"{side}_thigh", f"{side}_knee", (0, 0, -d["thigh"]), (0, 1, 0), comps=[
                Comp("knee sector + bearing block", 0.25, (0, 0, 0.0), "cyl", (0.07, 0.03, "y"), "structure"),
                Comp("ankle gearmotor A (calf, upper)", A("K-AN"), (-0.015, 0, -0.10), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("ankle gearmotor B (calf, lower)", A("K-AN"), (-0.025, 0, -0.20), "cyl", (0.024, 0.18, "z"), "actuator"),
                Comp("ankle capstans", 2 * drive("K-AN"), (-0.02, 0, -0.15), "box", (0.04, 0.04, 0.20), "structure"),
                Comp("shank: 40x40x2 aluminium square tube + plates", 0.60, (0, 0, -0.22), "box", (0.06, 0.06, 0.36), "structure"),
                Comp("ankle push-rods x2 (M8 threaded rod + rod ends)", 0.18, (-0.035, 0, -0.30), "cyl", (0.008, 0.26, "z"), "structure"),
                Comp("shank wiring", 0.12, (0, 0, -0.18), "box", (0.03, 0.03, 0.30), "harness"),
                Comp("shank EVA armour", 0.12, (0, 0, -0.20), "box", (0.10, 0.10, 0.34), "shell"),
            ]))
            B.append(Body(f"{side}_ankle_link", f"{side}_shank", f"{side}_ankle_pitch", (0, 0, -d["shank"]), (0, 1, 0), comps=[
                Comp("ankle cross (steel bolts + 608 bearings)", 0.15, (0, 0, 0), "box", (0.05, 0.05, 0.04), "structure"),
            ]))
            B.append(Body(f"{side}_foot", f"{side}_ankle_link", f"{side}_ankle_roll", (0, 0, 0), (1, 0, 0), comps=[
                Comp("foot: 12 mm plywood + aluminium angle stiffeners", 0.38, (0.06, 0, -0.050), "box", (0.24, 0.10, 0.03), "structure"),
                Comp("rubber sole", 0.15, (0.06, 0, -0.070), "box", (0.26, 0.11, 0.01), "structure"),
                Comp("4x foot contact switches", 0.04, (0.06, 0, -0.058), "box", (0.20, 0.08, 0.01), "sensor"),
            ]))
        SC.add_ons(ns, B)
        return B

    ns["build_bodies"] = build_bodies
