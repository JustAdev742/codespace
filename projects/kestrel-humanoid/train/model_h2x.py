"""H2-X body for the walking trainer and the house: Unitree's official H2 model (robots/unitree_h2), adapted.

Selected with KESTREL_VARIANT=h2x; model.py hands build_xml() over to this module. Unitree has published no H2-X
model; the H2-X is a variant of the H2, so this is the closest faithful body.

What changes from Unitree's file, and why:

* joints are renamed to the trainer's names (left_hip_pitch_joint -> l_hip_pitch, ...); the 12 leg joints and, per
  arm, shoulder pitch and elbow stay free; waist, head, shoulder roll and yaw and the wrists are locked at Unitree's
  zero pose (the walking policy and the skills drive legs and those four arm joints);
* the elbow gets ref = -pi/2, so 0 means a straight arm and negative means bent forward, as on KESTREL (Unitree's
  zero is bent 90 degrees); every arm pose written for KESTREL then means the same on the H2-X;
* bodies the trainer and skills look up get their names: pelvis, torso, head, l_foot/r_foot (ankle-pitch links),
  l_hand/r_hand (wrist-yaw links);
* feet: Unitree's six small spheres and sole box become four corner spheres per foot with a touch sensor (as the
  trainer expects); thighs and shanks get collision capsules; with SEAT_COLLISION, seat and back boxes for chairs (the
  thigh capsules may not touch the robot's own pelvis and torso: at deep hip flexion they overlap where the real hip
  housing clears);
* a hook on each hand (the H2 ships without hands; the hook matches KESTREL's carrying method);
* the pelvis gets Unitree's mass (4.25 kg) as an explicit inertial: Unitree's file derives it from the collision mesh;
* actuators: PD position servos with Unitree's joint torque limits (hip and knee 360 N m, ankle pitch 67, ankle roll
  19, shoulder 130, elbow 60). Mesh visuals are kept only for rendering.
"""
from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
H2_DIR = HERE.parent / "robots" / "unitree_h2"

LEGS = ["hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll"]
ARMS = ["shoulder_pitch", "elbow"]
DEFAULT = {"hip_yaw": 0.0, "hip_roll": 0.0, "hip_pitch": -0.30, "knee": 0.60, "ankle_pitch": -0.30, "ankle_roll": 0.0}
KP = {"hip_yaw": 150.0, "hip_roll": 250.0, "hip_pitch": 250.0, "knee": 350.0, "ankle_pitch": 60.0, "ankle_roll": 30.0}
KD = {"hip_yaw": 5.0, "hip_roll": 6.0, "hip_pitch": 6.0, "knee": 8.0, "ankle_pitch": 2.0, "ankle_roll": 1.5}
BASE_Z = 1.04              # spawn height of the pelvis above the ground (standing: about 1.01 m above the soles)
STAND_Z = 1.00             # nominal standing pelvis height, the height scan's reference
STAND_PELVIS = 0.96        # a pelvis above this (and upright) counts as standing
GAIT = dict(period=0.8, stance=0.55, cmd_scale=1.5)
HOOK = (0.13, 0.0, -0.02)  # hook point in the hand (wrist-yaw link) frame: just beyond the wrist
CAM_POS = "0.11 0 0.08"    # head camera in the head (head-yaw link) frame: at eye height
# reach profile (measured on this model with brain/skills.py's solver): standing, the hook reaches down to 0.92 m and
# 0.36 m ahead at table height; crouching with the H2's deep hip and ankle range, down to 0.31 m
STAND_HIP, REACH_FWD, CROUCH_FWD, LOW_HANDLE, LOW_REACH = 0.946, 0.36, 0.21, 1.0, 0.33
CROUCH = [(0.75, (0.80, 0.2)), (0.60, (0.70, 0.4)), (0.50, (0.62, 0.5)), (0.40, (0.55, 0.6)), (0.0, (0.50, 0.7))]
SIT_Z = 0.52               # seated on the 46 cm chair: pelvis box on the seat, soles on the floor
STIFF_ANKLE = 4.0          # planned motions (sit, crouch): 71 kg with its centre of mass at pelvis height on 60 N m/rad
                           # ankle servos sags onto the toes or the heels; 4x (still within the 66.9 N m limit) holds it
SIT = {"gain": 2.0}        # sitting down: a faster balance correction (brain/skills.py sit; KESTREL's is 1.2)
# planned stand-up from the chair (brain/skills.py stand_up_planned; KESTREL uses its learned stand-up): seated poses
# solved from (hip above the seated height, torso pitch, CoM ahead of the ankle), then rise through balanced poses with
# the weight kept over the heel half of the sole - a 67 kg body with its CoM at pelvis height that comes up with the
# weight over the toes tips onto its face; 1.8 s per pose
RISE = {"lean_pose": [0.0, 0.35, -0.15], "knees_pose": [0.0, 0.65, -0.02],
        "path": [[0.05, 0.6, -0.02], [0.13, 0.55, -0.02], [0.22, 0.42, -0.02], [0.31, 0.28, -0.02]],
        "dt": 1.8, "gain": 1.2, "com_up": 0.0}
WALK_POLICY, BODY_NAME = "h2x4", "Unitree H2-X"   # walking policy trained for this body (train/runs/h2x4: h2x3 + standing still)
W_NOLOAD = {"hip_yaw": 20.0, "hip_roll": 20.0, "hip_pitch": 20.0, "knee": 20.0, "ankle_pitch": 25.0, "ankle_roll": 25.0}


# the pelvis inertial MuJoCo computes from Unitree's pelvis mesh (density 1000; total robot 71.3 kg)
PELVIS_INERTIAL = {"pos": "0 0.001509 -0.003244", "quat": "1 0.000415 0.00001 -0.0000476", "mass": "4.2481",
                   "diaginertia": "0.016355 0.013147 0.012838"}


def _name_map():
    m = {}
    for side, s in (("left", "l"), ("right", "r")):
        for j in LEGS + ARMS:
            m[f"{side}_{j}_joint"] = f"{s}_{j}"
    return m


def joint_limits():
    """(peak torque, no-load speed) per leg joint, from Unitree's model (torques) and typical motor speeds."""
    root = ET.parse(H2_DIR / "h2_mujoco.xml").getroot()
    T = {}
    for j in root.iter("joint"):
        n = j.get("name", "")
        for base in LEGS:
            if n == f"left_{base}_joint":
                T[base] = float(j.get("actuatorfrcrange").split()[1])
    return T, dict(W_NOLOAD)


def robot_xml(visual, seat_collision, leg_joints, arm_joints):
    """(asset xml, worldbody xml, actuator xml, sensor xml) of the adapted H2."""
    root = ET.parse(H2_DIR / "h2_mujoco.xml").getroot()
    names = _name_map()
    keep = set(leg_joints) | set(arm_joints)
    assets = []
    if visual:
        for mesh in root.find("asset").iter("mesh"):
            mesh.set("file", str((H2_DIR / "meshes" / mesh.get("file")).resolve()))
            assets.append(ET.tostring(mesh, encoding="unicode").strip())
    pelvis = root.find("worldbody").find("body")
    rename_body = {"pelvis": "pelvis", "torso_link": "torso", "head_yaw_link": "head",
                   "left_ankle_pitch_link": "l_foot", "right_ankle_pitch_link": "r_foot",
                   "left_wrist_yaw_link": "l_hand", "right_wrist_yaw_link": "r_hand",
                   "left_hip_yaw_link": "l_thigh", "right_hip_yaw_link": "r_thigh",
                   "left_knee_link": "l_shank", "right_knee_link": "r_shank"}
    for body in pelvis.iter("body"):
        n = body.get("name")
        if n in rename_body:
            body.set("name", rename_body[n])
        for child in list(body):
            if child.tag == "joint" and child.get("type") != "free":
                new = names.get(child.get("name"))
                if new is None or new not in keep:
                    body.remove(child)                  # locked at the zero pose
                    continue
                child.set("name", new)
                if new.endswith("_elbow"):              # 0 = straight, negative = bent forward (as on KESTREL)
                    lo, hi = (float(v) for v in child.get("range").split())
                    child.set("ref", f"{-math.pi / 2:.6f}")
                    child.set("range", f"{lo - math.pi / 2:.5f} {hi - math.pi / 2:.5f}")
                child.set("damping", "1.0")                # motor rotor inertia (armature) steadies the light links
                child.set("armature", "0.03" if new.endswith(("_shoulder_pitch", "_elbow")) else "0.06")
            elif child.tag == "joint":
                child.set("name", "root")
            elif child.tag == "geom":
                if child.get("type") == "mesh":
                    if not visual:
                        body.remove(child)
                    else:
                        child.set("contype", "0")
                        child.set("conaffinity", "0")
                        child.set("group", "1")
                else:
                    body.remove(child)                  # Unitree's foot spheres and sole box: replaced below
    if pelvis.find("inertial") is None:                 # Unitree gives the pelvis no <inertial>: MuJoCo derives it from the
        el = ET.Element("inertial")                       # collision mesh (inertiafromgeom); with that mesh gone, set the
        for k, v in PELVIS_INERTIAL.items():              # same values explicitly
            el.set(k, v)
        pelvis.insert(0, el)
    by = {b.get("name"): b for b in pelvis.iter("body")}

    def add(body, tag, **attrs):
        el = ET.SubElement(by[body], tag)
        for k, v in attrs.items():
            el.set(k, v)
        return el
    for s, sy in (("l", 1.0), ("r", -1.0)):
        r = 0.012
        for i, (x, y) in enumerate([(-0.075, 0.007), (-0.075, 0.066), (0.15, 0.007), (0.15, 0.066)]):
            add(f"{s}_foot", "geom", name=f"{s}_foot_c{i}", type="sphere", size=f"{r}", pos=f"{x} {sy * y:.4f} {-0.062 + r}",
                friction="1.0 0.02 0.001", rgba="0.1 0.1 0.1 1")
        add(f"{s}_foot", "site", name=f"{s}_sole", pos=f"0.0375 {sy * 0.0365:.4f} -0.062", size="0.01")
        add(f"{s}_foot", "site", name=f"{s}_touch", type="box", pos=f"0.0375 {sy * 0.0365:.4f} -0.05",
            size="0.125 0.045 0.03", rgba="0 0 0 0")
        add(f"{s}_thigh", "geom", name=f"{s}_thigh_col", type="capsule", fromto=f"0 0 -0.06 -0.01 {sy * 0.022:.3f} -0.29",
            size="0.075", rgba="0.3 0.3 0.3 0.0", mass="0")
        add(f"{s}_shank", "geom", name=f"{s}_shank_col", type="capsule", fromto=f"0 0 -0.06 0.03 {-sy * 0.02:.3f} -0.44",
            size="0.06", rgba="0.3 0.3 0.3 0.0", mass="0")
        hand = by[f"{s}_hand"]                          # a hook, like KESTREL's hand (the H2 has no hands)
        for g in [dict(type="capsule", fromto="0.02 0 0 0.12 0 0", size="0.018"),
                  dict(type="capsule", fromto="0.12 0 0 0.13 0 -0.035", size="0.012")]:
            el = ET.SubElement(hand, "geom")
            for k, v in g.items():
                el.set(k, v)
            el.set("rgba", "0.25 0.26 0.28 1")
            el.set("contype", "0")
            el.set("conaffinity", "0")
            el.set("mass", "0")
    if seat_collision:
        add("pelvis", "geom", name="pelvis_col", type="box", size="0.12 0.17 0.06", pos="-0.03 0 -0.06",
            rgba="0.3 0.3 0.3 0.0", friction="1 0.02 0.001", mass="0")
        add("torso", "geom", name="back_col", type="box", size="0.035 0.16 0.2", pos="-0.13 0 0.2", rgba="0.3 0.3 0.3 0.0",
            mass="0")
    if "head" in by:
        pass
    worldbody = ET.tostring(pelvis, encoding="unicode")
    T, _ = joint_limits()
    acts = []
    for jn in leg_joints:
        base = jn[2:]
        acts.append(f'    <position name="{jn}" joint="{jn}" kp="{KP[base]}" kv="{KD[base]}" '
                    f'forcerange="{-T[base]:.1f} {T[base]:.1f}" ctrlrange="-6 6"/>')
    for jn in arm_joints:
        sh = "shoulder" in jn
        acts.append(f'    <position name="{jn}" joint="{jn}" kp="{140 if sh else 90}" kv="{5 if sh else 3}" '
                    f'forcerange="{"-130 130" if sh else "-60 60"}" ctrlrange="-3 3"/>')
    sens = "".join(f'\n    <touch name="{s}_touch" site="{s}_touch"/>' for s in "lr")
    sens += "".join(f'\n    <framepos name="{s}_sole_pos" objtype="site" objname="{s}_sole"/>' for s in "lr")
    sens += "".join(f'\n    <framelinvel name="{s}_sole_vel" objtype="site" objname="{s}_sole"/>' for s in "lr")
    return "\n    ".join(assets), worldbody, "\n".join(acts), sens


def full_xml(visual, seat_collision, leg_joints, arm_joints):
    """A complete MJCF (robot only, no ground): the same top-level layout as KESTREL's design model, so model.py adds
    the terrain, the house and the extras the same way."""
    assets, body, acts, sens = robot_xml(visual, seat_collision, leg_joints, arm_joints)
    asset_block = f"<asset>\n    {assets}\n  </asset>\n  " if assets else ""
    return f"""<mujoco model="h2x">
  <compiler angle="radian" autolimits="true" inertiafromgeom="false"/>
  <option timestep="0.005" integrator="implicitfast" iterations="20" ls_iterations="10"/>
  <visual><global offwidth="1600" offheight="1200"/></visual>
  {asset_block}<worldbody>
    <light pos="0 0 4" dir="0 0 -1" directional="true"/>
    {body}
  </worldbody>
  <contact>
    <exclude body1="pelvis" body2="l_thigh"/>
    <exclude body1="pelvis" body2="r_thigh"/>
    <exclude body1="torso" body2="l_thigh"/>
    <exclude body1="torso" body2="r_thigh"/>
  </contact>
  <actuator>
{acts}
  </actuator>
  <sensor>{sens}
  </sensor>
</mujoco>"""
