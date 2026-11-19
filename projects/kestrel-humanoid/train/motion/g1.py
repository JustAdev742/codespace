"""The full Unitree G1 (all 29 joints) for motion tracking, built from Unitree's official model (robots/unitree_g1).

Lean on purpose (the plan's idea 6): no meshes unless asked for, only the feet collide (four spheres each, against the
floor), no self-collision, PD position servos on every joint with Unitree's torque limits, 5 ms physics steps.
Keypoint sites mark where the human skeleton's keypoints go on the robot (skeleton.KEYPOINTS).
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
G1_DIR = ROOT / "robots" / "unitree_g1"
G1_XML = G1_DIR / "g1_29dof.xml"

# keypoint -> (G1 body, offset in that body's frame)
KEYPOINT_SITES = {
    "pelvis": ("pelvis", (0.0, 0.0, 0.0)),
    "l_hip": ("left_hip_roll_link", (0.0, 0.0, 0.0)), "r_hip": ("right_hip_roll_link", (0.0, 0.0, 0.0)),
    "l_knee": ("left_knee_link", (0.0, 0.0, 0.0)), "r_knee": ("right_knee_link", (0.0, 0.0, 0.0)),
    "l_ankle": ("left_ankle_roll_link", (0.0, 0.0, 0.0)), "r_ankle": ("right_ankle_roll_link", (0.0, 0.0, 0.0)),
    "l_toe": ("left_ankle_roll_link", (0.12, 0.0, -0.03)), "r_toe": ("right_ankle_roll_link", (0.12, 0.0, -0.03)),
    "chest": ("torso_link", (0.0, 0.0, 0.22)), "head": ("torso_link", (0.05, 0.0, 0.40)),
    "l_shoulder": ("left_shoulder_roll_link", (0.0, 0.0, 0.0)), "r_shoulder": ("right_shoulder_roll_link", (0.0, 0.0, 0.0)),
    "l_elbow": ("left_elbow_link", (0.0, 0.0, 0.0)), "r_elbow": ("right_elbow_link", (0.0, 0.0, 0.0)),
    "l_wrist": ("left_wrist_roll_link", (0.0, 0.0, 0.0)), "r_wrist": ("right_wrist_roll_link", (0.0, 0.0, 0.0)),
}

# PD gains by joint group (Unitree's G1 RL setup for the legs; waist and arms in the same spirit)
def _gains(name):
    if "knee" in name:
        return 150.0, 4.0
    if "hip" in name:
        return 100.0, 2.0
    if "ankle" in name:
        return 40.0, 2.0
    if "waist" in name:
        return 200.0, 5.0
    if "wrist" in name:
        return 20.0, 1.0
    return 40.0, 2.0                     # shoulders, elbows


def build_xml(visual=False, floor=True, actuator="position", timestep=0.005):
    """MJCF string of the full G1 for tracking. actuator="motor" gives torque-controlled joints (the whole-body
    controller, wbc.py, computes torques itself); "position" gives PD servos (the learned tracker)."""
    root = ET.parse(G1_XML).getroot()
    comp = root.find("compiler")
    comp.set("meshdir", str((G1_DIR / "meshes").resolve()))
    comp.set("autolimits", "true")
    for tag in ("actuator", "sensor", "option"):
        for el in root.findall(tag):
            root.remove(el)
    opt = ET.Element("option", timestep=f"{timestep}", integrator="implicitfast", iterations="20", ls_iterations="10")
    root.insert(1, opt)
    if not visual:
        asset = root.find("asset")
        for mesh in list(asset.findall("mesh")):
            asset.remove(mesh)
    wb = root.find("worldbody")
    pelvis = wb.find("body")
    joints = []
    for body in pelvis.iter("body"):
        for g in list(body.findall("geom")):
            if g.get("type") == "mesh":
                if visual:
                    g.set("contype", "0"), g.set("conaffinity", "0"), g.set("group", "1")
                else:
                    body.remove(g)
            elif body.get("name", "").endswith("ankle_roll_link"):
                body.remove(g)                           # Unitree's tiny foot spheres: replaced below
            else:
                g.set("contype", "0"), g.set("conaffinity", "0")
        for j in body.findall("joint"):
            if j.get("type", "hinge") == "hinge":
                joints.append((j.get("name"), j.get("actuatorfrcrange", "-50 50")))
                j.set("armature", "0.02"), j.set("damping", "0.5")
    for g in list(pelvis.findall("geom")):
        if g.get("type") == "mesh" and not visual:
            pelvis.remove(g)
        else:
            g.set("contype", "0"), g.set("conaffinity", "0")
    by = {b.get("name"): b for b in pelvis.iter("body")}
    by["pelvis"] = pelvis
    for side in ("left", "right"):
        foot = by[f"{side}_ankle_roll_link"]
        for i, (x, y) in enumerate([(-0.05, 0.026), (-0.05, -0.026), (0.12, 0.03), (0.12, -0.03)]):
            ET.SubElement(foot, "geom", name=f"{side}_foot_{i}", type="sphere", size="0.01", pos=f"{x} {y} -0.025",
                          friction="1.0 0.02 0.001", contype="1", conaffinity="1")
    for k, (b, off) in KEYPOINT_SITES.items():
        ET.SubElement(by[b], "site", name=f"kp_{k}", pos=" ".join(f"{v:g}" for v in off), size="0.01", rgba="1 0.5 0 0.5")
    cont = ET.SubElement(root, "contact")                    # the two feet do not collide with each other
    ET.SubElement(cont, "exclude", body1="left_ankle_roll_link", body2="right_ankle_roll_link")
    if floor:
        ET.SubElement(wb, "geom", name="floor", type="plane", size="0 0 1", friction="1.0 0.02 0.001",
                      contype="1", conaffinity="1", rgba="0.5 0.5 0.5 1")
        ET.SubElement(wb, "light", pos="0 0 4", dir="0 0 -1", directional="true")
    act = ET.SubElement(root, "actuator")
    for name, frc in joints:
        if actuator == "motor":
            ET.SubElement(act, "motor", name=name, joint=name, ctrlrange=frc, ctrllimited="true")
        else:
            kp, kv = _gains(name)
            ET.SubElement(act, "position", name=name, joint=name, kp=f"{kp}", kv=f"{kv}", forcerange=frc, ctrlrange="-6.3 6.3")
    return ET.tostring(root, encoding="unicode")


def load_model(visual=False, actuator="position", timestep=0.005):
    import mujoco
    return mujoco.MjModel.from_xml_string(build_xml(visual=visual, actuator=actuator, timestep=timestep))


def joint_info(m):
    """Names, qpos/qvel addresses and ranges of the 29 hinge joints, in actuator order."""
    names = [m.actuator(i).name for i in range(m.nu)]
    qadr = np.array([m.joint(n).qposadr[0] for n in names])
    vadr = np.array([m.joint(n).dofadr[0] for n in names])
    rng = np.array([m.joint(n).range for n in names])
    kp = m.actuator_gainprm[:m.nu, 0].copy()
    return names, qadr, vadr, rng, kp
