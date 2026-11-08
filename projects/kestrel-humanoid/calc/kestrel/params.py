"""KESTREL K1 - single source of truth for geometry, kinematics and the mass budget.

Every other module (MJCF generator, inverse dynamics, actuator sizing, power budget,
BOM) reads from here. Change a number here and re-run ``run_all.py``.

Conventions
-----------
* SI units throughout (m, kg, s, N, N*m, rad unless a name ends in ``_deg``).
* World / body frame: x forward, y left, z up. Zero pose = standing straight,
  arms hanging, palms facing the thighs.
* Joint signs follow the right-hand rule about the listed axis, e.g. hip pitch about +y:
  negative = flexion (thigh forward), knee positive = flexion, ankle pitch positive =
  plantar-flexion (toes down), elbow negative = flexion.

Masses
------
Component masses are *engineering estimates* (status column in docs/04 and docs/08):
actuator masses come from ``actuators.py`` (sized, then fed back here), structure masses
from the CAD in ``cad/`` where it exists, and purchased-part masses from datasheets.
``DESIGN_MASS_GROWTH`` (applied when building the requirement model) covers the
mass growth every real robot programme experiences between concept and hardware.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import radians

NAME = "KESTREL K1"
HEIGHT = 1.75  # m, standing, top of head shell

# Requirement model is built at estimated mass x this factor (concept-stage contingency).
DESIGN_MASS_GROWTH = 1.10

# --------------------------------------------------------------------------------------
# Principal dimensions (joint-centre to joint-centre unless stated)
# Derived from Drillis & Contini segment ratios for a 1.75 m adult male, then adjusted
# for actuator packaging. Human reference values in comments (ratio x H).
# --------------------------------------------------------------------------------------
DIM = dict(
    ankle_h=0.075,            # ankle axes above sole (human lateral malleolus 0.039H = 0.068)
    shank=0.420,              # knee -> ankle (human 0.246H = 0.430)
    thigh=0.420,              # hip -> knee  (human 0.245H = 0.429)
    hip_half_width=0.105,     # hip joint centre lateral offset (human ~0.09)
    hip_yaw_above=0.075,      # hip-yaw joint above hip centre (roll/pitch intersect at centre)
    waist_yaw_above=0.100,    # waist-yaw joint above hip centre
    waist_pitch_above=0.070,  # waist-pitch joint above waist-yaw joint
    shoulder_z=0.335,         # shoulder centre above waist-pitch axis
    shoulder_half_width=0.200,  # shoulder centre lateral offset (biacromial 0.40 m)
    neck_yaw_z=0.400,         # neck-yaw joint above waist-pitch axis
    neck_pitch_above=0.070,   # neck-pitch joint above neck yaw
    head_top_above_neck_pitch=0.195,
    upper_arm=0.300,          # shoulder -> elbow (human 0.186H = 0.326)
    wrist_yaw_from_elbow=0.060,
    forearm=0.260,            # elbow -> wrist (human 0.146H = 0.256)
    hand_len=0.190,           # wrist -> fingertip (human 0.108H = 0.189)
    foot_len=0.260,           # human 0.152H = 0.266
    foot_w=0.110,
    heel=0.070,               # ankle axis forward of heel
)


def standing_heights():
    d = DIM
    hip = d["ankle_h"] + d["shank"] + d["thigh"]
    waist_pitch = hip + d["waist_yaw_above"] + d["waist_pitch_above"]
    return dict(
        hip=hip,
        waist_pitch=waist_pitch,
        shoulder=waist_pitch + d["shoulder_z"],
        neck_pitch=waist_pitch + d["neck_yaw_z"] + d["neck_pitch_above"],
        head_top=waist_pitch + d["neck_yaw_z"] + d["neck_pitch_above"] + d["head_top_above_neck_pitch"],
        wrist=waist_pitch + d["shoulder_z"] - d["upper_arm"] - d["forearm"],
    )


# --------------------------------------------------------------------------------------
# Actuator classes (mass in kg incl. housing, bearing, encoders, drive board;
# rotor inertia in kg m^2 at the motor; ratio). Values are replaced by the sizing
# results in actuators.py -> data/actuator_family.json once that has run.
# --------------------------------------------------------------------------------------
ACT = {
    # legs / waist: frameless BLDC + compound planetary (quasi-direct-drive family)
    "KA-130K": dict(mass=4.00, rotor_J=1.1e-3, ratio=15.0),   # knee (long stack)
    "KA-130H": dict(mass=3.80, rotor_J=1.0e-3, ratio=15.0),   # hip pitch (same housing, shorter stack)
    "KA-110P": dict(mass=2.05, rotor_J=4.2e-4, ratio=16.0),
    "KA-90P": dict(mass=1.30, rotor_J=1.9e-4, ratio=14.0),
    # arms / neck: frameless BLDC + strain-wave gear + output torque sensing
    "KH-25": dict(mass=1.45, rotor_J=6.5e-5, ratio=100.0),
    "KH-20": dict(mass=0.98, rotor_J=3.4e-5, ratio=100.0),
    "KH-14": dict(mass=0.52, rotor_J=1.0e-5, ratio=100.0),
    # wrist pitch/roll: miniature ball-screw linear actuator pair
    "KW-L": dict(mass=0.28, rotor_J=2.0e-6, ratio=1.0),
}


def load_actuator_overrides(path=None):  # noqa: D401
    """Replace ACT entries with sizing results if data/actuator_family.json exists."""
    import json
    from pathlib import Path

    p = Path(path) if path else Path(__file__).resolve().parents[2] / "data" / "actuator_family.json"
    if p.exists():
        fam = json.loads(p.read_text())
        for k, v in fam.items():
            if k in ACT:
                ACT[k].update({kk: v[kk] for kk in ("mass", "rotor_J", "ratio") if kk in v})


# --------------------------------------------------------------------------------------
# Joints: name -> (actuator class, range_deg (min, max), transmission note)
# Ranges are robot-side mechanical limits; soft limits sit 3 deg inside.
# Left side listed; right side mirrors roll/yaw signs.
# --------------------------------------------------------------------------------------
JOINTS_LEFT = {
    "hip_yaw": ("KA-90P", (-30, 45), "direct"),
    "hip_roll": ("KA-110P", (-25, 45), "direct"),
    "hip_pitch": ("KA-130H", (-125, 30), "direct"),
    "knee": ("KA-130K", (0, 130), "four-bar from actuator in upper thigh"),
    "ankle_pitch": ("KA-90P", (-45, 45), "2x parallel push-rod (shared with roll)"),
    "ankle_roll": ("KA-90P", (-25, 25), "2x parallel push-rod (shared with pitch)"),
    "shoulder_pitch": ("KH-25", (-180, 60), "direct"),
    "shoulder_roll": ("KH-25", (-15, 160), "direct"),
    "shoulder_yaw": ("KH-20", (-90, 100), "direct"),
    "elbow": ("KH-20", (-145, 0), "direct"),
    "wrist_yaw": ("KH-14", (-90, 90), "direct"),
    "wrist_pitch": ("KW-L", (-70, 70), "2x parallel linear (shared with roll)"),
    "wrist_roll": ("KW-L", (-35, 35), "2x parallel linear (shared with pitch)"),
}
JOINTS_CENTRE = {
    "waist_yaw": ("KA-90P", (-70, 70), "direct"),
    "waist_pitch": ("KA-110P", (-15, 75), "direct"),
    "neck_yaw": ("KH-14", (-80, 80), "direct"),
    "neck_pitch": ("KH-14", (-35, 50), "direct"),
}
MIRROR_SIGN = {"hip_yaw", "hip_roll", "shoulder_roll", "ankle_roll", "wrist_roll"}


def joint_table():
    """Return ordered dict name -> dict(act, lo, hi) for all 30 body joints."""
    out = {}
    for n, (a, r, t) in JOINTS_CENTRE.items():
        out[n] = dict(act=a, lo=radians(r[0]), hi=radians(r[1]), trans=t)
    for side, s in (("l", 1), ("r", -1)):
        for n, (a, r, t) in JOINTS_LEFT.items():
            lo, hi = r
            if n in MIRROR_SIGN and s < 0:
                lo, hi = -hi, -lo
            out[f"{side}_{n}"] = dict(act=a, lo=radians(lo), hi=radians(hi), trans=t)
    return out


# --------------------------------------------------------------------------------------
# Mass budget: components per body. pos is the component centroid in the BODY frame
# (origin at the body's joint). shape: box(lx,ly,lz) | cyl(r,h,axis) | sph(r).
# cat: actuator | structure | battery | electronics | shell | harness | sensor | hand
# --------------------------------------------------------------------------------------
@dataclass
class Comp:
    name: str
    mass: float
    pos: tuple
    shape: str
    size: tuple
    cat: str
    note: str = ""


@dataclass
class Body:
    name: str
    parent: str | None
    joint: str | None          # joint name (None for free base)
    jpos: tuple = (0, 0, 0)    # joint/body origin in parent frame
    axis: tuple = (0, 0, 1)
    comps: list = field(default_factory=list)


def _A(cls):
    return ACT[cls]["mass"]


def build_bodies():
    d = DIM
    B = []
    # ---------------- pelvis (floating base, origin = midpoint of hip centres) -----
    B.append(Body("pelvis", None, None, comps=[
        Comp("pelvis frame (7075-T6 machined bowl + CF closeout)", 1.50, (0.0, 0, 0.035), "box", (0.20, 0.28, 0.11), "structure"),
        Comp("hip-yaw actuator L", _A("KA-90P"), (0.0, d["hip_half_width"], 0.120), "cyl", (0.050, 0.075, "z"), "actuator"),
        Comp("hip-yaw actuator R", _A("KA-90P"), (0.0, -d["hip_half_width"], 0.120), "cyl", (0.050, 0.075, "z"), "actuator"),
        Comp("waist-yaw actuator", _A("KA-90P"), (0.0, 0, 0.075), "cyl", (0.050, 0.075, "z"), "actuator"),
        Comp("pelvis IMU + EtherCAT junction + pelvis I/O board", 0.35, (-0.06, 0, 0.05), "box", (0.06, 0.10, 0.04), "electronics"),
        Comp("pelvis shells (PA12-MJF, painted)", 0.55, (0.0, 0, 0.040), "box", (0.25, 0.36, 0.17), "shell"),
        Comp("pelvis harness", 0.35, (-0.03, 0, 0.06), "box", (0.10, 0.20, 0.05), "harness"),
    ]))
    # ---------------- waist yaw link (carries waist-pitch actuator stator) --------
    B.append(Body("waist_link", "pelvis", "waist_yaw", (0, 0, d["waist_yaw_above"]), (0, 0, 1), comps=[
        Comp("waist-pitch actuator", _A("KA-110P"), (0.0, 0, d["waist_pitch_above"]), "cyl", (0.058, 0.085, "y"), "actuator"),
        Comp("waist yoke (7075-T6)", 0.45, (0.0, 0, 0.035), "box", (0.10, 0.16, 0.06), "structure"),
    ]))
    # ---------------- torso (origin at waist-pitch axis) ---------------------------
    h_sh = d["shoulder_z"]
    B.append(Body("torso", "waist_link", "waist_pitch", (0, 0, d["waist_pitch_above"]), (0, 1, 0), comps=[
        Comp("spine + ribcage frame (7075-T6 + CF panels)", 2.40, (-0.01, 0, 0.20), "box", (0.18, 0.30, 0.40), "structure"),
        Comp("battery pack 16S6P (Molicel P50B, 1.68 kWh) incl. BMS, fuse, enclosure", 8.90, (-0.035, 0, 0.125), "box", (0.12, 0.24, 0.24), "battery"),
        Comp("AI computer (Jetson AGX Thor module + carrier + cold plate)", 1.45, (0.035, 0, 0.30), "box", (0.04, 0.16, 0.12), "electronics"),
        Comp("real-time control computer + safety MCU board", 0.45, (-0.07, 0, 0.30), "box", (0.03, 0.12, 0.10), "electronics"),
        Comp("power distribution unit (contactor, fuses, DC-DC)", 1.20, (0.05, 0, 0.12), "box", (0.05, 0.18, 0.12), "electronics"),
        Comp("cooling: 2 blowers, ducts, heat pipes", 0.55, (-0.08, 0, 0.32), "box", (0.04, 0.20, 0.08), "electronics"),
        Comp("shoulder-pitch actuator L", _A("KH-25"), (0.0, d["shoulder_half_width"] - 0.065, h_sh), "cyl", (0.050, 0.075, "y"), "actuator"),
        Comp("shoulder-pitch actuator R", _A("KH-25"), (0.0, -d["shoulder_half_width"] + 0.065, h_sh), "cyl", (0.050, 0.075, "y"), "actuator"),
        Comp("neck-yaw actuator", _A("KH-14"), (0.0, 0, d["neck_yaw_z"] - 0.04), "cyl", (0.035, 0.06, "z"), "actuator"),
        Comp("chest depth camera (terrain)", 0.15, (0.11, 0, 0.18), "box", (0.03, 0.10, 0.03), "sensor"),
        Comp("speaker + amplifier", 0.12, (0.09, 0, 0.36), "box", (0.03, 0.06, 0.04), "electronics"),
        Comp("torso shells (chest, back door, abdomen)", 1.60, (0.0, 0, 0.20), "box", (0.24, 0.44, 0.44), "shell"),
        Comp("torso harness + connectors", 0.90, (-0.02, 0, 0.22), "box", (0.10, 0.30, 0.30), "harness"),
    ]))
    # ---------------- neck + head -------------------------------------------------
    B.append(Body("neck_link", "torso", "neck_yaw", (0, 0, d["neck_yaw_z"]), (0, 0, 1), comps=[
        Comp("neck-pitch actuator", _A("KH-14"), (0, 0, d["neck_pitch_above"]), "cyl", (0.035, 0.06, "y"), "actuator"),
        Comp("neck yoke (7075-T6)", 0.18, (0, 0, 0.03), "box", (0.05, 0.08, 0.05), "structure"),
    ]))
    B.append(Body("head", "neck_link", "neck_pitch", (0, 0, d["neck_pitch_above"]), (0, 1, 0), comps=[
        Comp("stereo camera + 2 wide SLAM cameras", 0.45, (0.07, 0, 0.075), "box", (0.04, 0.14, 0.04), "sensor"),
        Comp("3D LiDAR (Livox Mid-360 class)", 0.27, (0.0, 0, 0.165), "cyl", (0.033, 0.06, "z"), "sensor"),
        Comp("head frame (6061-T6 + PA12-CF)", 0.40, (0.01, 0, 0.09), "box", (0.12, 0.14, 0.12), "structure"),
        Comp("head shell + visor (PA12 + PC visor)", 0.45, (0.015, 0, 0.10), "box", (0.20, 0.17, 0.21), "shell"),
        Comp("head electronics: GMSL serialisers, mic array, face LEDs", 0.28, (-0.03, 0, 0.08), "box", (0.05, 0.10, 0.06), "electronics"),
    ]))
    # ---------------- arms --------------------------------------------------------
    for side, s in (("l", 1), ("r", -1)):
        B.append(Body(f"{side}_shoulder", "torso", f"{side}_shoulder_pitch",
                      (0, s * d["shoulder_half_width"], h_sh), (0, 1, 0), comps=[
            Comp("shoulder-roll actuator", _A("KH-25"), (-0.045, s * 0.0, 0.0), "cyl", (0.050, 0.075, "x"), "actuator"),
            Comp("shoulder bracket (7075-T6)", 0.25, (-0.01, 0, 0.0), "box", (0.08, 0.06, 0.08), "structure"),
        ]))
        B.append(Body(f"{side}_upper_arm_a", f"{side}_shoulder", f"{side}_shoulder_roll", (0, 0, 0), (1, 0, 0), comps=[
            Comp("shoulder-yaw actuator", _A("KH-20"), (0, 0, -0.075), "cyl", (0.042, 0.065, "z"), "actuator"),
            Comp("roll output bracket (7075-T6)", 0.18, (0, s * 0.01, -0.025), "box", (0.07, 0.05, 0.05), "structure"),
        ]))
        B.append(Body(f"{side}_upper_arm", f"{side}_upper_arm_a", f"{side}_shoulder_yaw", (0, 0, 0), (0, 0, 1), comps=[
            Comp("elbow actuator", _A("KH-20"), (0, 0, -d["upper_arm"]), "cyl", (0.042, 0.065, "y"), "actuator"),
            Comp("upper-arm tube + end fittings (7075/CF)", 0.38, (0, 0, -0.18), "cyl", (0.030, 0.16, "z"), "structure"),
            Comp("upper-arm shells", 0.22, (0, 0, -0.18), "cyl", (0.050, 0.20, "z"), "shell"),
            Comp("upper-arm harness", 0.15, (0, 0, -0.18), "cyl", (0.02, 0.2, "z"), "harness"),
        ]))
        B.append(Body(f"{side}_forearm_a", f"{side}_upper_arm", f"{side}_elbow", (0, 0, -d["upper_arm"]), (0, 1, 0), comps=[
            Comp("wrist-yaw actuator", _A("KH-14"), (0, 0, -0.035), "cyl", (0.035, 0.06, "z"), "actuator"),
            Comp("elbow output bracket", 0.14, (0, 0, -0.01), "box", (0.06, 0.06, 0.03), "structure"),
        ]))
        B.append(Body(f"{side}_forearm", f"{side}_forearm_a", f"{side}_wrist_yaw", (0, 0, -d["wrist_yaw_from_elbow"]), (0, 0, 1), comps=[
            Comp("wrist linear actuator A", _A("KW-L"), (0.012, 0.012, -0.09), "cyl", (0.014, 0.10, "z"), "actuator"),
            Comp("wrist linear actuator B", _A("KW-L"), (-0.012, -0.012, -0.09), "cyl", (0.014, 0.10, "z"), "actuator"),
            Comp("hand controller board", 0.08, (0.0, 0, -0.05), "box", (0.04, 0.03, 0.06), "electronics"),
            Comp("forearm frame (7075-T6)", 0.25, (0, 0, -0.10), "cyl", (0.025, 0.18, "z"), "structure"),
            Comp("forearm shells", 0.18, (0, 0, -0.10), "cyl", (0.042, 0.18, "z"), "shell"),
            Comp("forearm harness", 0.08, (0, 0, -0.10), "cyl", (0.015, 0.18, "z"), "harness"),
        ]))
        wrist_z = -(d["forearm"] - d["wrist_yaw_from_elbow"])
        B.append(Body(f"{side}_wrist", f"{side}_forearm", f"{side}_wrist_pitch", (0, 0, wrist_z), (0, 1, 0), comps=[
            Comp("wrist cross (Ti-6Al-4V)", 0.06, (0, 0, 0), "box", (0.03, 0.03, 0.02), "structure"),
        ]))
        B.append(Body(f"{side}_hand", f"{side}_wrist", f"{side}_wrist_roll", (0, 0, 0), (1, 0, 0), comps=[
            Comp("wrist 6-axis F/T sensor", 0.10, (0, 0, -0.015), "cyl", (0.024, 0.02, "z"), "sensor"),
            Comp("hand (10 DOA, linkage-driven)", 0.92, (0, s * 0.0, -0.085), "box", (0.035, 0.085, 0.14), "hand"),
        ]))
    # ---------------- legs ----------------------------------------------------------
    for side, s in (("l", 1), ("r", -1)):
        B.append(Body(f"{side}_hip_yaw_link", "pelvis", f"{side}_hip_yaw",
                      (0, s * d["hip_half_width"], d["hip_yaw_above"]), (0, 0, 1), comps=[
            Comp("hip-roll actuator", _A("KA-110P"), (-0.075, 0, -d["hip_yaw_above"]), "cyl", (0.058, 0.085, "x"), "actuator"),
            Comp("hip yaw-roll yoke (7075-T6)", 0.48, (-0.03, 0, -0.04), "box", (0.10, 0.08, 0.08), "structure"),
        ]))
        B.append(Body(f"{side}_hip_roll_link", f"{side}_hip_yaw_link", f"{side}_hip_roll",
                      (0, 0, -d["hip_yaw_above"]), (1, 0, 0), comps=[
            Comp("hip-pitch actuator", _A("KA-130H"), (0, s * 0.075, 0), "cyl", (0.068, 0.090, "y"), "actuator"),
            Comp("hip roll-pitch bracket (7075-T6)", 0.35, (0, s * 0.02, 0), "box", (0.09, 0.05, 0.10), "structure"),
        ]))
        B.append(Body(f"{side}_thigh", f"{side}_hip_roll_link", f"{side}_hip_pitch", (0, 0, 0), (0, 1, 0), comps=[
            Comp("knee actuator (in upper thigh)", _A("KA-130K"), (0, -s * 0.02, -0.115), "cyl", (0.068, 0.090, "y"), "actuator"),
            Comp("thigh frame (7075-T6 twin-plate + CF tube)", 0.95, (0, 0, -0.22), "box", (0.08, 0.07, 0.36), "structure"),
            Comp("knee push-rod (Ti tube, 2 rod ends)", 0.16, (-0.04, 0, -0.26), "cyl", (0.009, 0.30, "z"), "structure"),
            Comp("thigh shells", 0.35, (0, 0, -0.20), "box", (0.15, 0.15, 0.36), "shell"),
            Comp("thigh harness", 0.25, (0, 0, -0.20), "box", (0.03, 0.03, 0.36), "harness"),
        ]))
        B.append(Body(f"{side}_shank", f"{side}_thigh", f"{side}_knee", (0, 0, -d["thigh"]), (0, 1, 0), comps=[
            Comp("ankle actuator A (upper shank)", _A("KA-90P"), (-0.02, 0.035, -0.10), "cyl", (0.050, 0.075, "y"), "actuator"),
            Comp("ankle actuator B (upper shank)", _A("KA-90P"), (-0.02, -0.035, -0.17), "cyl", (0.050, 0.075, "y"), "actuator"),
            Comp("shank frame (7075-T6 + CF tube)", 0.75, (0, 0, -0.22), "box", (0.07, 0.06, 0.36), "structure"),
            Comp("ankle push-rods x2 (Ti tube, rod ends)", 0.18, (-0.035, 0, -0.30), "cyl", (0.008, 0.26, "z"), "structure"),
            Comp("shank shells", 0.28, (0, 0, -0.20), "box", (0.12, 0.12, 0.36), "shell"),
            Comp("shank harness", 0.18, (0, 0, -0.18), "box", (0.03, 0.03, 0.30), "harness"),
        ]))
        B.append(Body(f"{side}_ankle_link", f"{side}_shank", f"{side}_ankle_pitch", (0, 0, -d["shank"]), (0, 1, 0), comps=[
            Comp("ankle cross (Ti-6Al-4V, 2x needle-roller pairs)", 0.22, (0, 0, 0), "box", (0.05, 0.05, 0.04), "structure"),
        ]))
        B.append(Body(f"{side}_foot", f"{side}_ankle_link", f"{side}_ankle_roll", (0, 0, 0), (1, 0, 0), comps=[
            Comp("foot plate (7075-T6) + heel/toe shells", 0.45, (0.06, 0, -0.050), "box", (0.24, 0.10, 0.03), "structure"),
            Comp("sole (NBR/PU tread, replaceable)", 0.20, (0.06, 0, -0.070), "box", (0.26, 0.11, 0.01), "structure"),
            Comp("4x sole load cells + foot board", 0.12, (0.06, 0, -0.058), "box", (0.20, 0.08, 0.01), "sensor"),
        ]))
    return B


def mass_summary(bodies=None):
    bodies = bodies or build_bodies()
    total = 0.0
    by_cat = {}
    by_body = {}
    for b in bodies:
        mb = sum(c.mass for c in b.comps)
        by_body[b.name] = mb
        total += mb
        for c in b.comps:
            by_cat[c.cat] = by_cat.get(c.cat, 0.0) + c.mass
    return total, by_cat, by_body


# Pull sized actuator masses / inertias / ratios in automatically when the family file exists.
load_actuator_overrides()
