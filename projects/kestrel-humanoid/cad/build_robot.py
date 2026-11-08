#!/usr/bin/env python3
"""KESTREL K1 full-robot CAD (CadQuery). Zero pose, world frame, millimetres.

Outputs (cad/out/):
  kestrel_k1.glb            complete robot, every part named <group>__<material>_<part>
  kestrel_k1_interior.glb   structure + actuators + electronics only (skeleton view)
  step/<part>.step          manufacturable parts (shells, frames) for fabrication
  stl/<part>.stl            same, for printing / quoting

Packaging (all positions from calc/kestrel/params.py where they exist):
  hip pitch actuator coaxial with the hip centre (y 61-149 mm) so the hanging arms clear the hips;
  knee actuator 160 mm below the hip (18 mm running clearance to the hip actuator);
  hip roll actuator behind the hip in the gluteal volume (x -158 .. -78 mm);
  two ankle actuators stacked in the calf, driving the foot through push-rods.
"""
from __future__ import annotations

import json
import math
import sys
import traceback
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "calc"))
from geom import actuator, cyl, loft, panels, rbox, rod_between, shell_open_ends, split, tube  # noqa: E402

OUT = HERE / "out"
(OUT / "step").mkdir(parents=True, exist_ok=True)
(OUT / "stl").mkdir(parents=True, exist_ok=True)

COLORS = {  # sRGB fallbacks; the viewer replaces these with PBR materials by prefix
    "shell": (0.925, 0.922, 0.905), "joint": (0.17, 0.18, 0.20), "act": (0.24, 0.25, 0.28), "alu": (0.72, 0.74, 0.77),
    "frame": (0.62, 0.64, 0.67), "cf": (0.10, 0.10, 0.11), "visor": (0.03, 0.035, 0.045), "accent": (0.96, 0.62, 0.28),
    "sole": (0.08, 0.08, 0.09), "batt": (0.86, 0.52, 0.16), "pcb": (0.10, 0.42, 0.26), "cam": (0.06, 0.06, 0.07),
    "ti": (0.55, 0.56, 0.58), "copper": (0.78, 0.45, 0.25),
}

# ---------------------------------------------------------------- key coordinates (mm)
HY, HZ, KZ, AZ = 105.0, 915.0, 495.0, 75.0
HIP_YAW_Z = 990.0
WY, WP = 1015.0, 1085.0
SY, SZ, EZ, WRZ = 200.0, 1420.0, 1120.0, 860.0
NY, NP = 1485.0, 1555.0
KNEE_ACT_Z = HZ - 160.0

PARTS = []      # (group, material, name, shape, export_step)


def add(group, mat, name, fn, step=False, mirror=False):
    try:
        shp = fn() if callable(fn) else fn
        PARTS.append((group, mat, name, shp, step))
        if mirror:
            g = group.replace("l_", "r_") if group.startswith("l_") else group
            PARTS.append((g, mat, name, shp.mirror("XZ"), False))
    except Exception as e:  # keep building; report
        print(f"!! {group}/{name}: {e}")
        traceback.print_exc(limit=1)


# ================================================================= INTERIOR
def interior():
    # ---------------- pelvis + waist
    add("pelvis", "frame", "pelvis_bowl", lambda: rbox(210, 250, 100, 18, (-15, 0, 975)).cut(rbox(170, 210, 90, 12, (-15, 0, 990))), step=True)
    add("pelvis", "act", "waist_yaw_KA90P", lambda: actuator(97, 70, "z", (0, 0, 995)))
    add("waist", "act", "waist_pitch_KA110P", lambda: actuator(97, 80, "y", (0, 0, WP)))
    add("waist", "frame", "waist_yoke", lambda: rbox(70, 130, 18, 4, (0, 0, 1040)))
    # ---------------- torso
    add("torso", "frame", "spine_plate", lambda: rbox(12, 120, 380, 4, (-95, 0, 1290)), step=True)
    add("torso", "frame", "rib_upper", lambda: rbox(170, 300, 10, 4, (-10, 0, 1440)), step=True)
    add("torso", "frame", "rib_lower", lambda: rbox(160, 250, 10, 4, (-10, 0, 1125)), step=True)
    add("torso", "batt", "battery_16S6P", lambda: rbox(150, 196, 185, 8, (-15, 0, 1228)))
    add("torso", "pcb", "pdu_bms", lambda: rbox(30, 170, 100, 3, (75, 0, 1262)))
    add("torso", "pcb", "jetson_thor_carrier", lambda: rbox(40, 168, 155, 3, (40, 0, 1370)))
    add("torso", "alu", "thor_coldplate", lambda: rbox(10, 150, 140, 2, (62, 0, 1370)))
    add("torso", "pcb", "rt_computer_safety", lambda: rbox(30, 105, 105, 3, (-70, 0, 1375)))
    add("torso", "act", "blower_L", lambda: cyl(28, 30, "x", (-75, 60, 1400)))
    add("torso", "act", "blower_R", lambda: cyl(28, 30, "x", (-75, -60, 1400)))
    add("torso", "cam", "abdomen_depth_cam", lambda: rbox(36, 124, 29, 4, (84, 0, 1172)).rotate((84, 0, 1172), (0, 1, 0), 35))
    for s in (1, -1):
        add("torso", "act", f"shoulder_pitch_KH25_{'L' if s > 0 else 'R'}", lambda s=s: actuator(97, 75, "y" if s > 0 else "-y", (0, s * 135, SZ)))
    add("torso", "act", "neck_yaw_KH14", lambda: actuator(62, 60, "z", (0, 0, 1450)))
    # ---------------- neck + head
    add("neck", "act", "neck_pitch_KH14", lambda: actuator(62, 60, "y", (0, 0, NP)))
    add("head", "frame", "head_frame", lambda: rbox(110, 130, 12, 4, (5, 0, 1600)))
    add("head", "cam", "zedx_mini_stereo", lambda: rbox(37, 94, 32, 8, (66, 0, 1655)))
    add("head", "cam", "slam_cam_L", lambda: rbox(31, 31, 49, 4, (22, 60, 1660)).rotate((22, 60, 1660), (0, 0, 1), 55))
    add("head", "cam", "slam_cam_R", lambda: rbox(31, 31, 49, 4, (22, -60, 1660)).rotate((22, -60, 1660), (0, 0, 1), -55))
    add("head", "cam", "lidar_mid360", lambda: cyl(32.5, 60, "z", (0, 0, 1698)))
    # ---------------- arms (left, mirrored)
    add("l_shoulder", "act", "shoulder_roll_KH25", lambda: actuator(97, 75, "x", (-45, SY, SZ)), mirror=True)
    add("l_upper_arm", "act", "shoulder_yaw_KH20", lambda: actuator(97, 70, "-z", (0, SY, 1340)), mirror=True)
    add("l_upper_arm", "cf", "upper_arm_tube", lambda: tube(25, 23, 150, "z", (0, SY, 1230)), mirror=True, step=True)
    add("l_upper_arm", "act", "elbow_KH20", lambda: actuator(97, 70, "y", (0, SY, EZ)), mirror=True)
    add("l_forearm", "act", "wrist_yaw_KH14", lambda: actuator(62, 60, "-z", (0, SY, 1072)), mirror=True)
    add("l_forearm", "act", "wrist_lin_A", lambda: cyl(14, 100, "z", (14, SY + 12, 985)), mirror=True)
    add("l_forearm", "act", "wrist_lin_B", lambda: cyl(14, 100, "z", (-14, SY - 12, 985)), mirror=True)
    add("l_forearm", "frame", "forearm_frame", lambda: rbox(20, 44, 140, 3, (0, SY, 960)), mirror=True, step=True)
    add("l_hand", "ti", "wrist_cross", lambda: rbox(28, 28, 22, 3, (0, SY, WRZ)), mirror=True)
    add("l_hand", "cam", "wrist_ft_sensor", lambda: cyl(24, 20, "z", (0, SY, 842)), mirror=True)
    # ---------------- legs (left, mirrored)
    add("l_hip", "act", "hip_yaw_KA90P", lambda: actuator(97, 70, "-z", (0, HY, 1035)), mirror=True)
    add("l_hip", "act", "yaw_roll_yoke", lambda: rbox(130, 60, 16, 4, (-60, HY, 992)).union(rbox(16, 60, 70, 4, (-125, HY, 955))), mirror=True, step=True)
    add("l_hip", "act", "hip_roll_KA110P", lambda: actuator(97, 80, "x", (-118, HY, HZ)), mirror=True)
    add("l_hip", "act", "hip_pitch_KA130H", lambda: actuator(142, 88, "-y", (0, HY, HZ)), mirror=True)
    add("l_hip", "act", "roll_pitch_bracket", lambda: rbox(16, 110, 150, 4, (-72, HY, HZ)), mirror=True, step=True)
    add("l_thigh", "act", "knee_KA130K", lambda: actuator(142, 95, "y", (0, HY, KNEE_ACT_Z)), mirror=True)
    add("l_thigh", "frame", "thigh_plate_medial", lambda: rbox(60, 7, 300, 3, (0, HY - 40, 640)), mirror=True, step=True)
    add("l_thigh", "frame", "thigh_plate_lateral", lambda: rbox(60, 7, 300, 3, (0, HY + 40, 640)), mirror=True, step=True)
    add("l_thigh", "cf", "thigh_tube", lambda: tube(20, 18, 150, "z", (15, HY, 600)), mirror=True, step=True)
    kf = json.loads((HERE.parent / "data" / "knee_fourbar.json").read_text())
    Ax, Az = kf["A"]
    r1, r2, beta, phi0 = kf["r1"] * 1e3, kf["r2"] * 1e3, math.radians(kf["beta_deg"]), math.radians(kf["phi0_deg"])
    pinA = (Ax * 1e3 + r1 * math.cos(phi0), HY + 28, KZ + Az * 1e3 + r1 * math.sin(phi0))
    pinK = (r2 * math.cos(beta), HY + 28, KZ + r2 * math.sin(beta))
    add("l_thigh", "ti", "knee_pushrod", lambda: rod_between(pinA, pinK, 7), mirror=True, step=True)
    add("l_thigh", "act", "knee_crank_act", lambda: rod_between((Ax * 1e3, HY + 28, KZ + Az * 1e3), pinA, 9), mirror=True)
    add("l_shank", "act", "knee_crank_shank", lambda: rod_between((0, HY + 28, KZ), pinK, 9), mirror=True)
    add("l_shank", "alu", "knee_hub", lambda: tube(34, 15, 90, "y", (0, HY, KZ)), mirror=True, step=True)
    add("l_shank", "act", "ankle_A_KA90P", lambda: actuator(97, 70, "y", (-15, HY, 400)), mirror=True)
    add("l_shank", "act", "ankle_B_KA90P", lambda: actuator(97, 70, "-y", (-25, HY, 300)), mirror=True)
    add("l_shank", "cf", "shank_tube", lambda: tube(20, 18, 230, "z", (8, HY, 210)), mirror=True, step=True)
    add("l_shank", "frame", "shank_upper_fitting", lambda: rbox(80, 70, 40, 5, (0, HY, 450)), mirror=True, step=True)
    add("l_shank", "ti", "ankle_rod_lat", lambda: rod_between((-55, HY + 36, 400), (-52, HY + 36, 92), 5), mirror=True, step=True)
    add("l_shank", "ti", "ankle_rod_med", lambda: rod_between((-65, HY - 36, 300), (-52, HY - 36, 92), 5), mirror=True)
    add("l_foot", "ti", "ankle_cross", lambda: rbox(48, 48, 36, 4, (0, HY, AZ)), mirror=True, step=True)
    add("l_foot", "frame", "foot_plate", lambda: rbox(250, 104, 12, 5, (58, HY, 22)), mirror=True, step=True)


# ================================================================= EXTERIOR
def exterior():
    # ---------------- head (lofted, shelled, visor recessed)
    head_secs = [((8, 0, 1582), 52, 50, 2.2), ((10, 0, 1605), 88, 78, 2.4), ((10, 0, 1650), 100, 85, 2.7),
                 ((8, 0, 1700), 97, 82, 2.7), ((5, 0, 1733), 72, 62, 2.4), ((3, 0, 1749), 26, 22, 2.0)]
    band = rbox(120, 240, 62, 0, (95, 0, 1655))
    lidar_cut = cyl(39, 40, "z", (0, 0, 1748))
    side_win = [rbox(36, 30, 40, 6, (22, s * 80, 1660)).rotate((22, s * 80, 1660), (0, 0, 1), s * 55) for s in (1, -1)]
    (shell,) = panels(head_secs, 2.4, [[]], extend=("start",))
    shell = shell.cut(band).cut(lidar_cut).cut(side_win[0]).cut(side_win[1])
    add("head", "shell", "head_shell", shell, step=True)
    vis_secs = [((c[0], c[1], c[2]), a - 2.0, b - 2.0, n) for (c, a, b, n) in head_secs[1:5]]
    add("head", "visor", "visor", lambda: loft(vis_secs).intersect(band))
    add("head", "accent", "visor_light_L", lambda: rbox(14, 3, 46, 1.2, (40, 86, 1655)).rotate((40, 86, 1655), (0, 0, 1), 28))
    add("head", "accent", "visor_light_R", lambda: rbox(14, 3, 46, 1.2, (40, -86, 1655)).rotate((40, -86, 1655), (0, 0, 1), -28))
    add("head", "joint", "lidar_ring", lambda: tube(40, 34, 6, "z", (0, 0, 1736)))
    add("head", "visor", "lidar_window", lambda: cyl(34, 22, "z", (0, 0, 1739)).edges(">Z").fillet(8))
    for s in (1, -1):
        add("head", "visor", f"side_window_{'L' if s > 0 else 'R'}", lambda s=s: rbox(34, 6, 38, 5, (22, s * 77, 1660)).rotate((22, s * 77, 1660), (0, 0, 1), s * 55))
    # ---------------- neck
    add("neck", "joint", "neck_cover", lambda: loft([((0, 0, 1488), 60, 58, 2.2), ((2, 0, 1540), 52, 50, 2.1), ((4, 0, 1592), 54, 50, 2.1)]))
    # ---------------- torso
    t_secs = [((0, 0, 1110), 112, 138, 2.6), ((2, 0, 1180), 115, 150, 2.8), ((5, 0, 1290), 124, 186, 3.0),
              ((5, 0, 1380), 124, 206, 3.3), ((0, 0, 1440), 114, 200, 3.3), ((-4, 0, 1475), 96, 168, 3.0),
              ((-6, 0, 1502), 70, 98, 2.4)]
    chest, abd, back = panels(t_secs, 2.2, [[("x", +1, 0.5), ("z", +1, 1250.5)], [("x", +1, 0.5), ("z", -1, 1249.5)], [("x", -1, -0.5)]])
    for s in (1, -1):
        hole = cyl(57, 160, "y", (-25, s * SY, SZ))
        chest, back = chest.cut(hole), back.cut(hole)
    add("torso", "shell", "chest_plate", chest, step=True)
    add("torso", "shell", "abdomen_plate", abd, step=True)
    add("torso", "shell", "back_door", back, step=True)
    add("torso", "accent", "chest_light", lambda: rbox(4, 5, 64, 2, (130, 0, 1345)))
    add("torso", "visor", "abdomen_sensor_window", lambda: rbox(8, 136, 30, 8, (116, 0, 1168)).rotate((116, 0, 1168), (0, 1, 0), 25))
    # ---------------- waist bellows (graphite segments)
    for i, z in enumerate((1030, 1052, 1074, 1096)):
        a, b = 102 - 2 * abs(i - 1.5), 128 - 3 * abs(i - 1.5)
        add("waist", "joint", f"waist_ring_{i}", lambda a=a, b=b, z=z: loft([((0, 0, z - 9), a, b, 2.8), ((0, 0, z + 9), a, b, 2.8)]))
    # ---------------- pelvis
    pel_secs = [((-20, 0, 925), 140, 160, 2.6), ((-18, 0, 975), 148, 172, 2.8), ((-12, 0, 1020), 132, 160, 2.8)]
    pf, pb = panels(pel_secs, 2.2, [[("x", +1, -9.5)], [("x", -1, -10.5)]])
    for s in (1, -1):
        hole = cyl(74, 200, "y", (0, s * (HY + 60), HZ))
        pf, pb = pf.cut(hole), pb.cut(hole)
    add("pelvis", "shell", "pelvis_front", pf, step=True)
    add("pelvis", "shell", "pelvis_rear", pb, step=True)
    # ---------------- legs (left, mirrored)
    add("l_hip", "joint", "hip_side_cover", lambda: cyl(76, 8, "y", (0, HY + 49, HZ)).union(cyl(60, 4, "y", (0, HY + 55, HZ))), mirror=True)
    add("l_hip", "accent", "hip_ring", lambda: tube(66, 63, 1.5, "y", (0, HY + 54, HZ)), mirror=True)
    add("l_hip", "shell", "glute_cap", lambda: cyl(50, 8, "x", (-162, HY, HZ)).edges("<X").fillet(3), mirror=True)
    add("l_hip", "accent", "glute_ring", lambda: tube(44, 42, 1.2, "x", (-166.5, HY, HZ)), mirror=True)
    th_secs = [((-5, HY, 905), 94, 72, 2.4), ((-2, HY, 800), 92, 70, 2.6), ((0, HY, 690), 80, 64, 2.6),
               ((2, HY, 570), 62, 56, 2.4), ((2, HY, 528), 55, 52, 2.2)]
    tf, tb = panels(th_secs, 2.0, [[("x", +1, 0.5)], [("x", -1, -0.5)]])
    add("l_thigh", "shell", "thigh_front", tf, mirror=True, step=True)
    add("l_thigh", "shell", "thigh_rear", tb, mirror=True, step=True)
    add("l_shank", "joint", "knee_cover", lambda: cyl(42, 96, "y", (0, HY, KZ)), mirror=True)
    add("l_shank", "shell", "knee_cap", lambda: loft([((38, HY, 470), 14, 34, 2.2), ((44, HY, 500), 16, 36, 2.4), ((38, HY, 530), 12, 30, 2.2)]), mirror=True)
    sh_secs = [((-8, HY, 468), 58, 54, 2.4), ((-20, HY, 400), 74, 58, 2.6), ((-26, HY, 300), 70, 55, 2.6),
               ((-18, HY, 185), 58, 54, 2.7), ((-14, HY, 112), 52, 52, 2.6)]
    sf, sb = panels(sh_secs, 2.0, [[("x", +1, -9.5)], [("x", -1, -10.5)]])
    add("l_shank", "shell", "shin_front", sf, mirror=True, step=True)
    add("l_shank", "shell", "calf_rear", sb, mirror=True, step=True)
    add("l_foot", "joint", "ankle_cover", lambda: cyl(36, 84, "y", (0, HY, AZ)), mirror=True)
    for i, z in enumerate((84, 96, 108)):
        add("l_foot", "joint", f"ankle_gaiter_{i}", lambda z=z, i=i: loft([((-20, HY, z - 5), 50 - i, 45 - i, 2.3), ((-20, HY, z + 5), 50 - i, 45 - i, 2.3)]), mirror=True)
    foot = loft([((-66, HY, 34), 48, 26, 2.6), ((10, HY, 40), 53, 31, 2.8), ((120, HY, 30), 52, 22, 2.8),
                 ((186, HY, 18), 36, 9, 2.4)], axis="x")
    foot = foot.cut(rbox(400, 200, 20, 0, (60, HY, 0)))
    add("l_foot", "shell", "foot_shell", foot, mirror=True, step=True)
    add("l_foot", "sole", "sole", lambda: rbox(256, 108, 10, 4, (60, HY, 5)), mirror=True, step=True)
    add("l_foot", "accent", "foot_light", lambda: rbox(40, 2, 3, 1, (100, HY + 52, 22)), mirror=True)
    # ---------------- arms (left, mirrored)
    def deltoid():
        return loft([((-22, SY - 8, SZ + 6), 64, 60, 2.3), ((-22, SY + 30, SZ + 8), 62, 58, 2.3),
                     ((-22, SY + 56, SZ + 6), 46, 42, 2.2), ((-22, SY + 66, SZ + 4), 16, 14, 2.0)], axis="y")
    add("l_shoulder", "shell", "deltoid_cap", deltoid, mirror=True, step=True)
    ua_secs = [((0, SY, 1362), 50, 50, 2.2), ((0, SY, 1270), 48, 46, 2.3), ((0, SY, 1182), 43, 43, 2.2)]
    uf, ub = panels(ua_secs, 1.8, [[("x", +1, 0.5)], [("x", -1, -0.5)]])
    add("l_upper_arm", "shell", "upper_arm_front", uf, mirror=True, step=True)
    add("l_upper_arm", "shell", "upper_arm_rear", ub, mirror=True, step=True)
    add("l_upper_arm", "joint", "elbow_cover", lambda: cyl(47, 84, "y", (0, SY, EZ)), mirror=True)
    add("l_upper_arm", "shell", "elbow_cap_out", lambda: cyl(41, 5, "y", (0, SY + 44, EZ)).edges(">Y").fillet(2), mirror=True)
    add("l_upper_arm", "shell", "elbow_cap_in", lambda: cyl(41, 5, "y", (0, SY - 44, EZ)).edges("<Y").fillet(2), mirror=True)
    add("l_upper_arm", "accent", "elbow_ring", lambda: tube(44, 42, 1.2, "y", (0, SY + 45, EZ)), mirror=True)
    fa_secs = [((0, SY, 1094), 46, 46, 2.2), ((0, SY, 1000), 44, 41, 2.3), ((0, SY, 905), 34, 31, 2.2), ((0, SY, 882), 31, 29, 2.0)]
    ff, fb = panels(fa_secs, 1.8, [[("x", +1, 0.5)], [("x", -1, -0.5)]])
    add("l_forearm", "shell", "forearm_front", ff, mirror=True, step=True)
    add("l_forearm", "shell", "forearm_rear", fb, mirror=True, step=True)
    add("l_forearm", "accent", "forearm_light", lambda: rbox(3, 2, 40, 1, (45, SY, 1010)), mirror=True)
    add("l_hand", "joint", "wrist_cover", lambda: cyl(29, 52, "y", (0, SY, WRZ)), mirror=True)
    from hand import hand_parts
    for mat, name, shp in hand_parts(SY, WRZ):
        add("l_hand", mat, name, shp, mirror=True, step=(name == "palm_shell"))


def build():
    interior()
    exterior()
    full = cq.Assembly(name="kestrel_k1")
    inner = cq.Assembly(name="kestrel_k1_interior")
    names = []
    for group, mat, name, shp, step in PARTS:
        nm = f"{group}__{mat}_{name}"
        c = COLORS[mat]
        try:
            full.add(shp, name=nm, color=cq.Color(*c, 1.0))
            if mat not in ("shell", "visor", "accent", "sole") and not name.endswith("_cover") and not name.startswith("waist_ring"):
                inner.add(shp, name=nm, color=cq.Color(*c, 1.0))
            names.append(nm)
        except Exception as e:
            print("assembly add failed", nm, e)
        if step and group in ("head", "torso", "pelvis", "waist", "neck") or (step and group.startswith("l_")):
            try:
                cq.exporters.export(shp, str(OUT / "step" / f"{group}__{name}.step"))
                cq.exporters.export(shp, str(OUT / "stl" / f"{group}__{name}.stl"), tolerance=0.2, angularTolerance=0.2)
            except Exception as e:
                print("export failed", nm, e)
    from cadquery.occ_impl.exporters.assembly import exportGLTF
    exportGLTF(full, str(OUT / "kestrel_k1.glb"), binary=True, tolerance=0.45, angularTolerance=0.35)
    exportGLTF(inner, str(OUT / "kestrel_k1_interior.glb"), binary=True, tolerance=0.45, angularTolerance=0.35)
    (OUT / "parts.json").write_text(json.dumps(names, indent=0))
    print(f"{len(PARTS)} parts -> {OUT}")


if __name__ == "__main__":
    build()
