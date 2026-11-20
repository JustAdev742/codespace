"""G1 body for the walking trainer and the house: Unitree's official G1 model (robots/unitree_g1, 29 DOF), adapted.

Selected with KESTREL_VARIANT=g1; model.py hands build_xml() over to this module, as it does for the H2-X
(model_h2x.py, which this follows). The G1 is also the body the motion-dataset pipeline (train/motion/) retargets to.

What changes from Unitree's file, and why:

* joints are renamed to the trainer's names (left_hip_pitch_joint -> l_hip_pitch, ...); the 12 leg joints and, per
  arm, shoulder pitch and elbow stay free; waist, shoulder roll and yaw and the wrists are locked at Unitree's zero
  pose (the walking policy and the house skills drive legs and those four arm joints);
* the elbow gets ref = -pi/2, so 0 means a straight arm and negative means bent forward, as on KESTREL (Unitree's
  zero is bent 90 degrees, forearm forward);
* bodies the trainer and skills look up get their names: pelvis, torso, l_foot/r_foot (the ankle-roll links: the G1's
  ankle pitches first, then rolls), l_hand/r_hand (wrist-yaw links); the G1 has no head body, so a massless "head"
  is added on the torso where the head mesh is, for the head camera;
* feet: Unitree's four small spheres per foot become four corner spheres with a touch sensor; thighs and shanks get
  collision capsules; with SEAT_COLLISION, seat and back boxes for chairs;
* a hook beyond each rubber hand (the house's carrying method);
* actuators: PD position servos with Unitree's joint torque limits (hip 88 N m, knee 139, ankle 50, shoulder and
  elbow 25). Gains and the standing pose follow Unitree's own G1 RL setup (unitree_rl_gym).
"""
from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
G1_DIR = HERE.parent / "robots" / "unitree_g1"
G1_XML = "g1_29dof.xml"

LEGS = ["hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll"]
ARMS = ["shoulder_pitch", "elbow"]
DEFAULT = {"hip_yaw": 0.0, "hip_roll": 0.0, "hip_pitch": -0.10, "knee": 0.30, "ankle_pitch": -0.20, "ankle_roll": 0.0}
KP = {"hip_yaw": 100.0, "hip_roll": 100.0, "hip_pitch": 100.0, "knee": 150.0, "ankle_pitch": 40.0, "ankle_roll": 40.0}
KD = {"hip_yaw": 2.0, "hip_roll": 2.0, "hip_pitch": 2.0, "knee": 4.0, "ankle_pitch": 2.0, "ankle_roll": 2.0}
BASE_Z = 0.80              # spawn height of the pelvis above the ground
STAND_Z = 0.77             # nominal standing pelvis height, the height scan's reference
STAND_PELVIS = 0.70        # a pelvis above this (and upright) counts as standing
GAIT = dict(period=0.8, stance=0.55, cmd_scale=1.0)
HOOK = (0.15, 0.0, -0.02)  # hook point in the hand (wrist-yaw link) frame: beyond the rubber hand
CAM_POS = "0.03 0 0"       # head camera in the added head body (the face of the head mesh)
HEAD_POS = "0.05 0 0.40"   # where the head body goes in the torso frame (head mesh: z 0.27..0.48, x -0.06..0.08)
# reach and crouch profile: first estimates scaled from the H2-X by height; the stand spot for a handle is solved from
# this arm's own kinematics (REACH_SOLVE), so these mainly choose when and how deep to crouch
STAND_HIP, REACH_FWD, CROUCH_FWD, LOW_HANDLE, LOW_REACH = 0.70, 0.30, 0.18, 0.75, 0.25
CROUCH = [(0.55, (0.58, 0.2)), (0.45, (0.51, 0.4)), (0.35, (0.45, 0.5)), (0.0, (0.40, 0.6))]
CALM_S = 3.0
GATE_GAIN = 1.5
REACH_SOLVE = True
ARM_GRAVITY_COMP = False
SIT_Z = 0.50               # seated on the 46 cm chair: high for a 1.3 m robot (its knees are about 0.35 m up)
STIFF_ANKLE = 2.0
SIT = {"gain": 1.5}
RISE = {"lean_pose": [0.0, 0.35, -0.15], "knees_pose": [0.0, 0.65, -0.02],
        "path": [[0.04, 0.6, -0.02], [0.09, 0.55, -0.02], [0.15, 0.42, -0.02]],
        "dt": 1.4, "gain": 1.2, "com_up": 0.0}
WALK_POLICY, BODY_NAME = "g1b", "Unitree G1"        # walking policy (train/runs/g1b: g1 plus 1.5 h more)
# a low-pass on its joint targets (env.ACTION_SMOOTH): g1b's own output shakes (77 % of the leg joints' motion above
# 5 Hz, smooth_eval.py); with 0.5 that is 60 % for 7.1 m walked in 12 s instead of 7.6 m
WALK_SMOOTH = 0.5
W_NOLOAD = {"hip_yaw": 32.0, "hip_roll": 32.0, "hip_pitch": 32.0, "knee": 20.0, "ankle_pitch": 37.0, "ankle_roll": 37.0}


def _name_map():
    m = {}
    for side, s in (("left", "l"), ("right", "r")):
        for j in LEGS + ARMS:
            m[f"{side}_{j}_joint"] = f"{s}_{j}"
    return m


def joint_limits():
    """(peak torque, no-load speed) per leg joint, from Unitree's model (torques) and the G1's motor speeds."""
    root = ET.parse(G1_DIR / G1_XML).getroot()
    T = {}
    for j in root.iter("joint"):
        n = j.get("name", "")
        for base in LEGS:
            if n == f"left_{base}_joint":
                T[base] = float(j.get("actuatorfrcrange").split()[1])
    return T, dict(W_NOLOAD)


def robot_xml(visual, seat_collision, leg_joints, arm_joints):
    """(asset xml, worldbody xml, actuator xml, sensor xml) of the adapted G1."""
    root = ET.parse(G1_DIR / G1_XML).getroot()
    names = _name_map()
    keep = set(leg_joints) | set(arm_joints)
    assets = []
    if visual:
        for mesh in root.find("asset").iter("mesh"):
            mesh.set("file", str((G1_DIR / "meshes" / mesh.get("file")).resolve()))
            assets.append(ET.tostring(mesh, encoding="unicode").strip())
    pelvis = root.find("worldbody").find("body")
    rename_body = {"pelvis": "pelvis", "torso_link": "torso",
                   "left_ankle_roll_link": "l_foot", "right_ankle_roll_link": "r_foot",
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
                for k in ("class",):                    # the G1 file sets damping/armature per motor class: set here
                    child.attrib.pop(k, None)
                if new.endswith("_elbow"):              # 0 = straight, negative = bent forward (as on KESTREL)
                    lo, hi = (float(v) for v in child.get("range").split())
                    child.set("ref", f"{-math.pi / 2:.6f}")
                    child.set("range", f"{lo - math.pi / 2:.5f} {hi - math.pi / 2:.5f}")
                child.set("damping", "0.5")
                child.set("armature", "0.01" if new.endswith(("_shoulder_pitch", "_elbow")) else "0.03")
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
                    body.remove(child)                  # Unitree's foot spheres: replaced below
    by = {b.get("name"): b for b in pelvis.iter("body")}

    def add(body, tag, **attrs):
        el = ET.SubElement(by[body], tag)
        for k, v in attrs.items():
            el.set(k, v)
        return el
    head = add("torso", "body", name="head", pos=HEAD_POS)
    ET.SubElement(head, "inertial", pos="0 0 0", mass="0.001", diaginertia="1e-6 1e-6 1e-6")
    by["head"] = head
    r, z_sole = 0.010, -0.035
    for s in "lr":
        for i, (x, y) in enumerate([(-0.05, 0.026), (-0.05, -0.026), (0.12, 0.03), (0.12, -0.03)]):
            add(f"{s}_foot", "geom", name=f"{s}_foot_c{i}", type="sphere", size=f"{r}", pos=f"{x} {y} {z_sole + r}",
                friction="1.0 0.02 0.001", rgba="0.1 0.1 0.1 1")
        add(f"{s}_foot", "site", name=f"{s}_sole", pos=f"0.035 0 {z_sole}", size="0.01")
        add(f"{s}_foot", "site", name=f"{s}_touch", type="box", pos=f"0.035 0 {z_sole + 0.01}",
            size="0.095 0.04 0.03", rgba="0 0 0 0")
        add(f"{s}_thigh", "geom", name=f"{s}_thigh_col", type="capsule", fromto="0 0 -0.04 -0.06 0 -0.15",
            size="0.05", rgba="0.3 0.3 0.3 0.0", mass="0")
        add(f"{s}_shank", "geom", name=f"{s}_shank_col", type="capsule", fromto="0 0 -0.04 0.01 0 -0.25",
            size="0.042", rgba="0.3 0.3 0.3 0.0", mass="0")
        hand = by[f"{s}_hand"]                          # a hook beyond the rubber hand
        for g in [dict(type="capsule", fromto="0.06 0 0 0.14 0 0", size="0.012"),
                  dict(type="capsule", fromto="0.14 0 0 0.15 0 -0.03", size="0.009")]:
            el = ET.SubElement(hand, "geom")
            for k, v in g.items():
                el.set(k, v)
            el.set("rgba", "0.25 0.26 0.28 1")
            el.set("contype", "0")
            el.set("conaffinity", "0")
            el.set("mass", "0")
    if seat_collision:
        add("pelvis", "geom", name="pelvis_col", type="box", size="0.08 0.11 0.04", pos="-0.02 0 -0.08",
            rgba="0.3 0.3 0.3 0.0", friction="1 0.02 0.001", mass="0")
        add("torso", "geom", name="back_col", type="box", size="0.03 0.11 0.15", pos="-0.09 0 0.2", rgba="0.3 0.3 0.3 0.0",
            mass="0")
    worldbody = ET.tostring(pelvis, encoding="unicode")
    T, _ = joint_limits()
    acts = []
    for jn in leg_joints:
        base = jn[2:]
        acts.append(f'    <position name="{jn}" joint="{jn}" kp="{KP[base]}" kv="{KD[base]}" '
                    f'forcerange="{-T[base]:.1f} {T[base]:.1f}" ctrlrange="-6 6"/>')
    for jn in arm_joints:
        sh = "shoulder" in jn
        acts.append(f'    <position name="{jn}" joint="{jn}" kp="{40 if sh else 30}" kv="{2 if sh else 1.5}" '
                    f'forcerange="-25 25" ctrlrange="-3 3"/>')
    sens = "".join(f'\n    <touch name="{s}_touch" site="{s}_touch"/>' for s in "lr")
    sens += "".join(f'\n    <framepos name="{s}_sole_pos" objtype="site" objname="{s}_sole"/>' for s in "lr")
    sens += "".join(f'\n    <framelinvel name="{s}_sole_vel" objtype="site" objname="{s}_sole"/>' for s in "lr")
    return "\n    ".join(assets), worldbody, "\n".join(acts), sens


def full_xml(visual, seat_collision, leg_joints, arm_joints):
    """A complete MJCF (robot only, no ground), laid out like the other bodies so model.py adds terrain and house."""
    assets, body, acts, sens = robot_xml(visual, seat_collision, leg_joints, arm_joints)
    asset_block = f"<asset>\n    {assets}\n  </asset>\n  " if assets else ""
    return f"""<mujoco model="g1">
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
