"""Training model: the design MJCF (calc/kestrel) with arms/waist/neck rigid, legs on PD position
actuators whose force limits are the sized actuator peaks (data/actuator_family.json), and a
primitive-geometry terrain (train/terrain.py). Same masses and inertias as the design model.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import mujoco
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "calc"))

import terrain as TR  # noqa: E402

LEGS = ["hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll"]
LEG_JOINTS = [f"{s}_{j}" for s in "lr" for j in LEGS]
DEFAULT = {"hip_yaw": 0.0, "hip_roll": 0.0, "hip_pitch": -0.28, "knee": 0.56, "ankle_pitch": -0.28, "ankle_roll": 0.0}
KP = {"hip_yaw": 150.0, "hip_roll": 250.0, "hip_pitch": 300.0, "knee": 300.0, "ankle_pitch": 80.0, "ankle_roll": 50.0}
KD = {"hip_yaw": 5.0, "hip_roll": 7.0, "hip_pitch": 8.0, "knee": 8.0, "ankle_pitch": 2.5, "ankle_roll": 2.0}


VARIANT = os.environ.get("KESTREL_VARIANT", "k1").lower()    # "s1": the simple off-the-shelf build


def joint_limits_s1():
    """S1: joint-side peak torque and no-load speed from the selected COTS modules (simple/data/actuator_family.json),
    through the external reductions (belt eta 0.95; ankle via the K1-geometry parallel push-rods, conservative
    independent limits as for K1)."""
    fam = json.loads((ROOT / "simple" / "data" / "actuator_family.json").read_text())
    r_c, r_p, d = 0.040, 0.052, 0.036

    def out(cls, joint):
        f = fam[cls]
        r = f["reductions"].get(joint, 1.0)
        tp = min(f["peak_Nm"], f.get("torque_cap_Nm", {}).get(joint, f["peak_Nm"]))   # knee: firmware cap for the belt
        return tp * r * (0.95 if r > 1 else 1.0), f["speed_rads"] / r

    T, W = {}, {}
    for j, cls in (("hip_yaw", "S-M"), ("hip_roll", "S-L"), ("hip_pitch", "S-LX"), ("knee", "S-LX")):
        T[j], W[j] = out(cls, j)
    ta, wa = out("S-A", "ankle")
    T["ankle_pitch"], W["ankle_pitch"] = 0.75 * 2 * ta * r_p / r_c, wa * r_c / r_p
    T["ankle_roll"], W["ankle_roll"] = 0.35 * 2 * ta * d / r_c, wa * r_c / d
    return T, W


SCRAP_SUB = {"s1scrap": "s1", "k1scrap": "k1", "s1fast": "s1fast", "k1fast": "k1fast"}
# gait clock and command range per variant: the scrap builds walk slowly (scrap/<sub>/generated/actuator_selection.md)
GAIT = {"s1scrap": dict(period=1.2, stance=0.58, cmd_scale=0.35), "k1scrap": dict(period=1.2, stance=0.58, cmd_scale=0.35),
        "s1fast": dict(period=0.8, stance=0.55, cmd_scale=1.4), "k1fast": dict(period=0.8, stance=0.55, cmd_scale=1.4)}.get(
    VARIANT, dict(period=0.8, stance=0.55, cmd_scale=1.0))


def joint_limits_scrap():
    """Scrap builds: joint peak torque and no-load speed from scrap/calc/scrap_select.py (actuator_family.json),
    ankle through the parallel push-rods as for K1 / S1 (conservative independent limits)."""
    fam = json.loads((ROOT / "scrap" / SCRAP_SUB[VARIANT] / "data" / "actuator_family.json").read_text())
    from kestrel import params as P
    cls = {j: c for j, (c, _, _) in P.JOINTS_LEFT.items()}
    r_c, r_p, d = 0.040, 0.052, 0.036
    T = {j: fam[cls[j]]["T_peak_joint"] for j in ("hip_yaw", "hip_roll", "hip_pitch", "knee")}
    W = {j: fam[cls[j]]["w_noload_joint"] for j in ("hip_yaw", "hip_roll", "hip_pitch", "knee")}
    ta, wa = fam[cls["ankle_pitch"]]["T_peak_joint"], fam[cls["ankle_pitch"]]["w_noload_joint"]
    T["ankle_pitch"], W["ankle_pitch"] = 0.75 * 2 * ta * r_p / r_c, wa * r_c / r_p
    T["ankle_roll"], W["ankle_roll"] = 0.35 * 2 * ta * d / r_c, wa * r_c / d
    return T, W


def joint_limits():
    """Joint-side peak torque and no-load speed per leg joint, from the sized actuator family."""
    if VARIANT == "s1":
        return joint_limits_s1()
    if VARIANT in SCRAP_SUB:
        return joint_limits_scrap()
    fam = json.loads((ROOT / "data" / "actuator_family.json").read_text())
    kf = json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    gmin = min(kf["G"])
    a90, r_c, r_p, d = fam["KA-90P"], 0.040, 0.052, 0.036
    T = {"hip_yaw": fam["KA-90P"]["T_peak_out"], "hip_roll": fam["KA-110P"]["T_peak_out"],
         "hip_pitch": fam["KA-130H"]["T_peak_out"], "knee": fam["KA-130K"]["T_peak_out"] * gmin,
         # parallel ankle: shared actuators -> conservative independent limits (pitch-dominant)
         "ankle_pitch": 0.75 * 2 * a90["T_peak_out"] * r_p / r_c, "ankle_roll": 0.35 * 2 * a90["T_peak_out"] * d / r_c}
    W = {"hip_yaw": fam["KA-90P"]["w_noload_out"], "hip_roll": fam["KA-110P"]["w_noload_out"],
         "hip_pitch": fam["KA-130H"]["w_noload_out"], "knee": fam["KA-130K"]["w_noload_out"] / gmin,
         "ankle_pitch": a90["w_noload_out"] * r_c / r_p, "ankle_roll": a90["w_noload_out"] * r_c / d}
    return T, W


def build_xml(H, visual=False):
    """MJCF of the training model. visual=True keeps the design model's visual geometry (for play.py
    rendering); the joint layout is identical, so a training state can be copied straight into it."""
    from kestrel import model as Mo
    xml = Mo.build_mjcf(mass_scale=1.0, floor=False, damping=0.5, timestep=0.005)
    # 1. lock everything that is not a leg joint (bodies become rigid at the zero pose)
    def keep(m):
        name = re.search(r'name="([^"]+)"', m.group(0)).group(1)
        return m.group(0) if name in LEG_JOINTS else ""
    xml = re.sub(r'\s*<joint name="[^"]+" type="hinge"[^>]*/>', keep, xml)
    # 2. visual geoms off (speed); feet keep their collision boxes
    if not visual:
        xml = re.sub(r'\s*<geom type="(box|cylinder|sphere)"[^>]*group="1"/>', "", xml)
    # 2b. feet: 4 corner spheres per sole instead of a box (<= 4 contacts per foot, analytic against boxes/plane)
    def spheres(mm):
        name = re.search(r'name="([^"]+)_sole"', mm.group(0)).group(1)
        r = 0.012
        pts = [(-0.062, 0.045), (-0.062, -0.045), (0.182, 0.045), (0.182, -0.045)]
        g = "".join(f'\n      <geom name="{name}_c{i}" type="sphere" size="{r}" pos="{x} {y} {-0.075 + r}" friction="1.0 0.02 0.001" rgba="0.1 0.1 0.1 1"/>'
                    for i, (x, y) in enumerate(pts))
        # touch-sensor volume around the four spheres (contact detection without Python-side contact parsing)
        return g + f'\n      <site name="{name[0]}_touch" type="box" pos="0.06 0 {-0.075 + r}" size="0.135 0.065 0.03" rgba="0 0 0 0"/>'

    xml = re.sub(r'<geom name="[^"]+_sole" type="box"[^>]*/>', spheres, xml)
    # 2c. thigh and shank collision capsules (envelopes of the actuator housings and shells), so a stair nosing
    #     cannot pass through a leg; no mass (inertiafromgeom is off), only feet are reported by the touch sensors
    caps = {"thigh": ("0 0 -0.06 0 0 -0.34", 0.070), "shank": ("-0.02 0 -0.06 -0.01 0 -0.36", 0.055)}
    for s in "lr":
        for seg, (ft, rad) in caps.items():
            xml = re.sub(rf'(<body name="{s}_{seg}"[^>]*>(?:\s*<joint[^>]*/>)*\s*<inertial[^>]*/>)',
                         lambda mm: mm.group(1) + f'\n      <geom name="{s}_{seg}_col" type="capsule" fromto="{ft}" size="{rad}" '
                                                   f'rgba="0.3 0.3 0.3 0.4"/>', xml, count=1)
    # 3. actuators: PD position servos with force limits = joint-side actuator peaks
    T, _ = joint_limits()
    acts = []
    for jn in LEG_JOINTS:
        base = jn[2:]
        acts.append(f'    <position name="{jn}" joint="{jn}" kp="{KP[base]}" kv="{KD[base]}" forcerange="{-T[base]:.1f} {T[base]:.1f}" '
                    f'ctrlrange="-3 3"/>')
    sens = "".join(f'\n    <touch name="{s}_touch" site="{s}_touch"/>' for s in "lr")
    sens += "".join(f'\n    <framepos name="{s}_sole_pos" objtype="site" objname="{s}_sole"/>' for s in "lr")
    sens += "".join(f'\n    <framelinvel name="{s}_sole_vel" objtype="site" objname="{s}_sole"/>' for s in "lr")
    xml = re.sub(r"<actuator>.*</actuator>", "<actuator>\n" + "\n".join(acts) + "\n  </actuator>\n  <sensor>" + sens +
                 "\n  </sensor>", xml, flags=re.S)
    xml = xml.replace('<option timestep="0.005" integrator="implicitfast"/>',
                      '<option timestep="0.005" integrator="implicitfast" iterations="20" ls_iterations="10"/>')
    if H is None:                    # robot only (for the Isaac Lab MJCF -> USD import)
        return xml, []
    # 4. terrain: plane + boxes (stairs) + convex meshes (slopes) + small heightfields (rough tiles only)
    assets, geoms, hfields = TR.mjcf(H)
    if visual:
        assets += ('\n    <texture name="grid" type="2d" builtin="checker" rgb1="0.62 0.64 0.67" rgb2="0.52 0.54 0.57" '
                   'width="512" height="512"/>\n    <material name="grid" texture="grid" texrepeat="40 40"/>'
                   '\n    <texture name="sky" type="skybox" builtin="gradient" rgb1="0.85 0.9 0.95" rgb2="0.45 0.55 0.65" '
                   'width="256" height="256"/>')
        geoms = geoms.replace('type="plane" size="0 0 0.05" rgba="0.55 0.57 0.6 1"', 'type="plane" size="0 0 0.05" material="grid"')
    xml = xml.replace("<worldbody>", f"<asset>\n    {assets}\n  </asset>\n  <worldbody>\n    {geoms}", 1)
    return xml, hfields


def build_model(H, visual=False):
    xml, hfields = build_xml(H, visual)
    m = mujoco.MjModel.from_xml_string(xml)
    for name, data in hfields:
        k = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_HFIELD, name)
        a = m.hfield_adr[k]
        m.hfield_data[a:a + data.size] = data.ravel()
    if visual:                       # hide the collision proxies; shade stair treads alternately; robot in the
        shell = np.array([0.92, 0.92, 0.90, 0.25], np.float32)        # design colours: warm-white opaque shells,
        for g in range(m.ngeom):                                       # graphite structure and joints
            n = m.geom(g).name
            if m.geom_bodyid[g] > 0 and np.allclose(m.geom_rgba[g], shell, atol=0.01):
                m.geom_rgba[g] = (0.93, 0.91, 0.87, 1.0)
            elif m.geom_bodyid[g] > 0 and np.allclose(m.geom_rgba[g, :3], (0.62, 0.64, 0.67), atol=0.01):
                m.geom_rgba[g, :3] = (0.30, 0.31, 0.33)
            if n.endswith("_col") or "_foot_c" in n:
                m.geom_rgba[g, 3] = 0.0
            elif re.match(r"t\d[45]_", n):
                k = int(n.split("_")[1])
                m.geom_rgba[g, :3] = (0.70, 0.71, 0.73) if k % 2 else (0.58, 0.60, 0.63)
        m.light_castshadow[:] = 0    # shadow acne on the far terrain at software-GL depth precision
    return m
