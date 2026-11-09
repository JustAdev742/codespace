"""KESTREL S1 - the simple, cheap, modular build. Loaded by params.py when KESTREL_VARIANT=s1.

Same skeleton (segment lengths, joint layout of the legs, arm geometry) as K1, so the scenario set,
the requirement engine and the RL training package apply unchanged. Everything else is simpler:
  * frame (docs/research/R8 lessons): 2040/4040 T-slot extrusion box for torso and pelvis, Ø40 x 3 6061-T6
    tube in split clamp blocks for the upper arms, pocketed 6061-T6 plates (laser cut) with a 20 mm M5 hole
    grid at every joint; every member takes T-nuts, clamps or the grid, so components bolt on anywhere; no shells
  * actuators: off-the-shelf integrated QDD modules on CAN (selected by simple/calc/s1_select.py from
    data/cots_actuators.json against the simulated requirements)
  * 27 actuated joints (legs 2x6, waist yaw, arms 2x6, neck 2) + 2 parallel grippers on ISO 9409-1-50 tool
    flanges; waist pitch and wrist roll are dropped (no torso-bend scenario)
  * 48 V e-bike-class battery (13S), Jetson + CAN, a hard-wired e-stop contactor
Structure masses come from the S1 CAD (CAD_STRUCTURE_KG); purchased parts from datasheets (docs/research/R9).
Extra components a builder adds go in simple/data/add_ons.json (see ADD_ONS_FILE below): their mass and
position flow into the requirements and the actuator selection on the next run of simple/calc/s1_select.py.
"""
from __future__ import annotations

from math import radians  # noqa: F401  (kept for symmetry with params)

ACT_S1 = {
    # name: placeholder mass/inertia/ratio, replaced by simple/data/actuator_family.json after selection
    "S-LX": dict(mass=2.40, rotor_J=1.2e-3, ratio=9.0),    # hip pitch + knee (largest COTS class)
    "S-L": dict(mass=1.90, rotor_J=8.0e-4, ratio=9.0),     # hip roll
    "S-M": dict(mass=1.40, rotor_J=4.0e-4, ratio=9.0),     # hip yaw, waist yaw
    "S-A": dict(mass=1.40, rotor_J=4.0e-4, ratio=9.0),     # ankle push-rod drives (2 per leg)
    "S-SH": dict(mass=0.95, rotor_J=1.5e-4, ratio=10.0),   # shoulder pitch + roll
    "S-EL": dict(mass=0.70, rotor_J=8.0e-5, ratio=10.0),   # shoulder yaw + elbow
    "S-WR": dict(mass=0.36, rotor_J=2.5e-5, ratio=10.0),   # wrist yaw + pitch
    "S-NK": dict(mass=0.36, rotor_J=2.5e-5, ratio=10.0),   # neck yaw + pitch
}

JOINTS_LEFT_S1 = {
    "hip_yaw": ("S-M", (-30, 45), "direct"),
    "hip_roll": ("S-L", (-25, 30), "2:1 crank + push-rod (toggles beyond ~±30°, simple/cad cut list)"),
    "hip_pitch": ("S-LX", (-120, 30), "direct (hip-roll actuators touch beyond -120°)"),
    "knee": ("S-LX", (0, 130), "1.5:1 Gates Poly Chain GT Carbon 8MGT belt (36T/54T) from the X12 in the upper thigh"),
    "ankle_pitch": ("S-A", (-45, 45), "2x parallel push-rod (shared with roll)"),
    "ankle_roll": ("S-A", (-25, 25), "2x parallel push-rod (shared with pitch)"),
    "shoulder_pitch": ("S-SH", (-180, 60), "direct"),
    "shoulder_roll": ("S-SH", (-15, 160), "direct"),
    "shoulder_yaw": ("S-EL", (-90, 100), "direct"),
    "elbow": ("S-EL", (-145, 0), "direct"),
    "wrist_yaw": ("S-WR", (-90, 90), "direct"),
    "wrist_pitch": ("S-WR", (-70, 70), "direct"),
}
JOINTS_CENTRE_S1 = {
    "waist_yaw": ("S-M", (-70, 70), "direct"),
    "neck_yaw": ("S-NK", (-80, 80), "direct"),
    "neck_pitch": ("S-NK", (-35, 50), "direct"),
}


# Structure mass per body from the S1 CAD (simple/cad/out/cut_list.md, after the weight-reduction pass), excluding
# fasteners; the counted fasteners (1.92 kg) are spread pro rata, so each body's structure = CAD x FASTENER_FACTOR.
CAD_STRUCTURE_KG = {
    "pelvis": 1.54, "waist_link": 0.15, "torso": 2.47, "neck_link": 0.13, "head": 0.35,
    "shoulder": 0.19, "upper_arm_a": 0.14, "upper_arm": 0.40, "forearm_a": 0.16, "forearm": 0.10, "wrist": 0.13,
    "hip_yaw_link": 1.11, "hip_roll_link": 0.79, "thigh": 1.73, "shank": 1.54, "ankle_link": 0.15, "foot": 0.61,
}
FASTENER_FACTOR = 20.71 / 18.79

# Builder add-ons: {"add_ons": [{"body": "head", "side": "both", "name": "...", "kg": 0.27,
#                   "xyz": [x, y, z], "cat": "sensor"}, ...]}. "body" is a body name without the l_/r_ prefix
# (pelvis, torso, head, upper_arm, forearm, wrist, hand, thigh, shank, foot, ...); "side" is l, r or both for limb
# bodies; xyz is metres in the body frame (the joint at the top of that body, z up, x forward).
ADD_ONS_FILE = "add_ons.json"


def apply(ns):
    """Override params' globals for the S1 variant."""
    Comp, Body = ns["Comp"], ns["Body"]
    ns["NAME"] = "KESTREL S1"
    ns["DESIGN_MASS_GROWTH"] = 1.10
    ns["DATA_DIR"] = ns["ROOT"] / "simple" / "data"
    ns["GEN_DIR"] = ns["ROOT"] / "simple" / "generated"
    ns["SCENARIOS_SKIP"] = {"TB"}            # no waist pitch
    ns["WORKLOAD"] = "base"                  # S1 is sized for 20 kg box / 5 kg per hand, not the K1 Mk II work loads
    ns["FAST_WALK"] = (0.42, 0.34, 0.08, 0.80)   # 1.0 m/s fast walk (K1: 1.2 m/s) - keeps COTS legs feasible
    ns["ACT"].clear()
    ns["ACT"].update({k: dict(v) for k, v in ACT_S1.items()})
    ns["JOINTS_LEFT"] = dict(JOINTS_LEFT_S1)
    ns["JOINTS_CENTRE"] = dict(JOINTS_CENTRE_S1)
    ns["MIRROR_SIGN"] = {"hip_yaw", "hip_roll", "shoulder_roll", "ankle_roll"}
    ACT = ns["ACT"]
    # S1 keeps the K1 waist: K1 Mk II raised waist_pitch_above to 0.126 for its KA-110P / KA-90P housings, S1 stays at 0.070.
    # Replacing ns["DIM"] also re-points standing_heights(), which reads the module-global DIM.
    ns["DIM"] = dict(ns["DIM"], waist_pitch_above=0.070)
    ns["HEIGHT"] = 1.75
    d = ns["DIM"]

    def A(cls):
        return ACT[cls]["mass"]

    def build_bodies():
        B = []
        B.append(Body("pelvis", None, None, comps=[
            Comp("pelvis frame: 2040 box + 4040 hip cross-member + 2x 6 mm hip plates", 1.80, (0.0, 0, 0.040), "box", (0.20, 0.30, 0.12), "structure"),
            Comp("hip-yaw actuator L", A("S-M"), (0.0, d["hip_half_width"], 0.120), "cyl", (0.055, 0.060, "z"), "actuator"),
            Comp("hip-yaw actuator R", A("S-M"), (0.0, -d["hip_half_width"], 0.120), "cyl", (0.055, 0.060, "z"), "actuator"),
            Comp("waist-yaw actuator", A("S-M"), (0.0, 0, 0.075), "cyl", (0.055, 0.060, "z"), "actuator"),
            Comp("IMU + CAN hub board", 0.15, (-0.06, 0, 0.05), "box", (0.06, 0.08, 0.03), "electronics"),
            Comp("pelvis harness (CAN + 48 V)", 0.30, (-0.03, 0, 0.06), "box", (0.10, 0.20, 0.05), "harness"),
        ]))
        B.append(Body("waist_link", "pelvis", "waist_yaw", (0, 0, d["waist_yaw_above"]), (0, 0, 1), comps=[
            Comp("waist turntable plate + spine socket", 0.55, (0.0, 0, 0.035), "box", (0.12, 0.16, 0.06), "structure"),
        ]))
        h_sh = d["shoulder_z"]
        B.append(Body("torso", "waist_link", None, (0, 0, d["waist_pitch_above"]), (0, 1, 0), comps=[
            Comp("torso frame: 4x 2040 uprights + 6 mm plates (20 mm M5 grid)", 2.50, (-0.01, 0, 0.20), "box", (0.18, 0.30, 0.40), "structure"),
            Comp("battery 48 V (13S) ~1.0 kWh e-bike-class pack + BMS, slide-in cradle", 5.80, (-0.040, 0, 0.140), "box", (0.10, 0.20, 0.30), "battery"),
            Comp("compute (Jetson Orin NX/AGX class + carrier) + CAN-FD interfaces", 0.65, (0.05, 0, 0.30), "box", (0.05, 0.12, 0.10), "electronics"),
            Comp("power: e-stop contactor, fuses, precharge, 48->12/5 V DC-DC", 0.90, (0.07, 0, 0.16), "box", (0.04, 0.16, 0.10), "electronics"),
            Comp("shoulder-pitch actuator L", A("S-SH"), (0.0, d["shoulder_half_width"] - 0.065, h_sh), "cyl", (0.045, 0.055, "y"), "actuator"),
            Comp("shoulder-pitch actuator R", A("S-SH"), (0.0, -d["shoulder_half_width"] + 0.065, h_sh), "cyl", (0.045, 0.055, "y"), "actuator"),
            Comp("neck-yaw actuator", A("S-NK"), (0.0, 0, d["neck_yaw_z"] - 0.04), "cyl", (0.03, 0.04, "z"), "actuator"),
            Comp("chest depth camera (terrain)", 0.10, (0.11, 0, 0.18), "box", (0.03, 0.09, 0.03), "sensor"),
            Comp("torso harness + connectors", 0.70, (-0.02, 0, 0.22), "box", (0.10, 0.30, 0.30), "harness"),
        ]))
        B.append(Body("neck_link", "torso", "neck_yaw", (0, 0, d["neck_yaw_z"]), (0, 0, 1), comps=[
            Comp("neck-pitch actuator", A("S-NK"), (0, 0, d["neck_pitch_above"]), "cyl", (0.03, 0.04, "y"), "actuator"),
            Comp("neck bracket (6 mm plate)", 0.15, (0, 0, 0.03), "box", (0.05, 0.08, 0.05), "structure"),
        ]))
        B.append(Body("head", "neck_link", "neck_pitch", (0, 0, d["neck_pitch_above"]), (0, 1, 0), comps=[
            Comp("head depth camera + wide camera", 0.25, (0.07, 0, 0.075), "box", (0.04, 0.12, 0.04), "sensor"),
            Comp("head plate frame + mic, speaker, status LEDs", 0.45, (0.01, 0, 0.09), "box", (0.12, 0.14, 0.12), "structure"),
        ]))
        for side, s in (("l", 1), ("r", -1)):
            B.append(Body(f"{side}_shoulder", "torso", f"{side}_shoulder_pitch", (0, s * d["shoulder_half_width"], h_sh), (0, 1, 0), comps=[
                Comp("shoulder-roll actuator", A("S-SH"), (-0.045, 0.0, 0.0), "cyl", (0.045, 0.055, "x"), "actuator"),
                Comp("shoulder L-bracket (6 mm plate)", 0.28, (-0.01, 0, 0.0), "box", (0.08, 0.06, 0.08), "structure"),
            ]))
            B.append(Body(f"{side}_upper_arm_a", f"{side}_shoulder", f"{side}_shoulder_roll", (0, 0, 0), (1, 0, 0), comps=[
                Comp("shoulder-yaw actuator", A("S-EL"), (0, 0, -0.075), "cyl", (0.04, 0.05, "z"), "actuator"),
                Comp("roll output bracket", 0.20, (0, s * 0.01, -0.025), "box", (0.07, 0.05, 0.05), "structure"),
            ]))
            B.append(Body(f"{side}_upper_arm", f"{side}_upper_arm_a", f"{side}_shoulder_yaw", (0, 0, 0), (0, 0, 1), comps=[
                Comp("elbow actuator", A("S-EL"), (0, 0, -d["upper_arm"]), "cyl", (0.04, 0.05, "y"), "actuator"),
                Comp("upper arm: Ø40x3 tube + 2 clamp blocks", 0.30, (0, 0, -0.16), "box", (0.04, 0.05, 0.22), "structure"),
                Comp("upper-arm harness", 0.12, (0, 0, -0.18), "cyl", (0.02, 0.2, "z"), "harness"),
            ]))
            B.append(Body(f"{side}_forearm_a", f"{side}_upper_arm", f"{side}_elbow", (0, 0, -d["upper_arm"]), (0, 1, 0), comps=[
                Comp("wrist-yaw actuator", A("S-WR"), (0, 0, -0.035), "cyl", (0.03, 0.04, "z"), "actuator"),
                Comp("elbow output bracket", 0.15, (0, 0, -0.01), "box", (0.06, 0.06, 0.03), "structure"),
            ]))
            B.append(Body(f"{side}_forearm", f"{side}_forearm_a", f"{side}_wrist_yaw", (0, 0, -d["wrist_yaw_from_elbow"]), (0, 0, 1), comps=[
                Comp("wrist-pitch actuator", A("S-WR"), (0, 0, -0.17), "cyl", (0.03, 0.04, "y"), "actuator"),
                Comp("forearm: Ø30x2 tube + clamp blocks", 0.20, (0, 0, -0.09), "box", (0.04, 0.04, 0.16), "structure"),
                Comp("forearm harness", 0.06, (0, 0, -0.10), "cyl", (0.015, 0.18, "z"), "harness"),
            ]))
            wrist_z = -(d["forearm"] - d["wrist_yaw_from_elbow"])
            B.append(Body(f"{side}_wrist", f"{side}_forearm", f"{side}_wrist_pitch", (0, 0, wrist_z), (0, 1, 0), comps=[
                Comp("wrist output plate + ISO 9409-1-50 tool flange", 0.12, (0, 0, -0.01), "cyl", (0.03, 0.02, "z"), "structure"),
            ]))
            B.append(Body(f"{side}_hand", f"{side}_wrist", None, (0, 0, 0), (1, 0, 0), comps=[
                Comp("parallel gripper (servo + leadscrew, ~100 N) on the tool flange", 0.65, (0, 0, -0.08), "box", (0.05, 0.09, 0.12), "hand"),
            ]))
        for side, s in (("l", 1), ("r", -1)):
            B.append(Body(f"{side}_hip_yaw_link", "pelvis", f"{side}_hip_yaw", (0, s * d["hip_half_width"], d["hip_yaw_above"]), (0, 0, 1), comps=[
                Comp("hip-roll actuator", A("S-L"), (-0.110, 0, -d["hip_yaw_above"]), "cyl", (0.055, 0.06, "x"), "actuator"),
                Comp("hip yaw-roll bracket (2x 6 mm plates + spacers, outboard bearing)", 0.50, (-0.03, 0, -0.04), "box", (0.10, 0.09, 0.08), "structure"),
            ]))
            B.append(Body(f"{side}_hip_roll_link", f"{side}_hip_yaw_link", f"{side}_hip_roll", (0, 0, -d["hip_yaw_above"]), (1, 0, 0), comps=[
                Comp("hip-pitch actuator", A("S-LX"), (0, 0, 0), "cyl", (0.065, 0.07, "y"), "actuator"),
                Comp("hip roll-pitch bracket (6 mm plates)", 0.42, (-0.07, 0, 0), "box", (0.02, 0.12, 0.15), "structure"),
            ]))
            B.append(Body(f"{side}_thigh", f"{side}_hip_roll_link", f"{side}_hip_pitch", (0, 0, 0), (0, 1, 0), comps=[
                Comp("knee actuator (upper thigh, drives knee by belt)", A("S-LX"), (0, 0, -0.130), "cyl", (0.065, 0.07, "y"), "actuator"),
                Comp("thigh: Ø40x3 tube + 2 clamp blocks + 6 mm side plates", 0.80, (0, 0, -0.22), "box", (0.08, 0.07, 0.36), "structure"),
                Comp("knee belt drive: Gates Poly Chain 8MGT 36 mm belt, 36T/54T pulleys, slotted tensioner", 0.45, (0, 0, -0.28), "box", (0.04, 0.05, 0.30), "structure"),
                Comp("thigh harness", 0.20, (0, 0, -0.20), "box", (0.03, 0.03, 0.36), "harness"),
            ]))
            B.append(Body(f"{side}_shank", f"{side}_thigh", f"{side}_knee", (0, 0, -d["thigh"]), (0, 1, 0), comps=[
                Comp("knee output pulley + bearing block", 0.30, (0, 0, 0.0), "cyl", (0.05, 0.04, "y"), "structure"),
                Comp("ankle actuator A (calf, upper)", A("S-A"), (-0.015, 0, -0.095), "cyl", (0.055, 0.06, "y"), "actuator"),
                Comp("ankle actuator B (calf, lower)", A("S-A"), (-0.025, 0, -0.195), "cyl", (0.055, 0.06, "y"), "actuator"),
                Comp("shank: Ø40x3 tube + clamp blocks + 6 mm plates", 0.65, (0, 0, -0.22), "box", (0.07, 0.06, 0.36), "structure"),
                Comp("ankle push-rods x2 (Ø10 Al rod + M8 rod ends)", 0.20, (-0.035, 0, -0.30), "cyl", (0.008, 0.26, "z"), "structure"),
                Comp("shank harness", 0.15, (0, 0, -0.18), "box", (0.03, 0.03, 0.30), "harness"),
            ]))
            B.append(Body(f"{side}_ankle_link", f"{side}_shank", f"{side}_ankle_pitch", (0, 0, -d["shank"]), (0, 1, 0), comps=[
                Comp("ankle cross (steel, 2x bearing pairs)", 0.30, (0, 0, 0), "box", (0.05, 0.05, 0.04), "structure"),
            ]))
            B.append(Body(f"{side}_foot", f"{side}_ankle_link", f"{side}_ankle_roll", (0, 0, 0), (1, 0, 0), comps=[
                Comp("foot plate (8 mm 6061) + bumpers", 0.55, (0.06, 0, -0.050), "box", (0.24, 0.10, 0.03), "structure"),
                Comp("rubber sole (replaceable)", 0.20, (0.06, 0, -0.070), "box", (0.26, 0.11, 0.01), "structure"),
                Comp("4x FSR / load-cell foot contacts + board", 0.08, (0.06, 0, -0.058), "box", (0.20, 0.08, 0.01), "sensor"),
            ]))
        # replace the estimated structure masses by the CAD masses (keeping each component's share and position)
        for b in B:
            key = b.name[2:] if b.name[:2] in ("l_", "r_") else b.name
            cad = CAD_STRUCTURE_KG.get(key)
            st = [c for c in b.comps if c.cat == "structure"]
            est = sum(c.mass for c in st)
            if cad is not None and est > 0:
                for c in st:
                    c.mass *= cad * FASTENER_FACTOR / est
        # builder add-ons (simple/data/add_ons.json)
        f = ns["DATA_DIR"] / ADD_ONS_FILE
        if f.exists():
            import json
            for a in json.loads(f.read_text()).get("add_ons", []):
                for b in B:
                    side, key = (b.name[0], b.name[2:]) if b.name[:2] in ("l_", "r_") else ("c", b.name)
                    if key != a["body"] or (side != "c" and a.get("side", "both") not in ("both", side)):
                        continue
                    x, y, z = a.get("xyz", (0.0, 0.0, 0.0))
                    y = -y if side == "r" else y
                    b.comps.append(Comp(f"add-on: {a['name']}", float(a["kg"]), (x, y, z), "box",
                                        tuple(a.get("box", (0.05, 0.05, 0.05))), a.get("cat", "electronics")))
        return B

    ns["build_bodies"] = build_bodies
