#!/usr/bin/env python3
"""KESTREL K1 Mk II full-robot CAD (CadQuery). Zero pose, world frame, millimetres.

Outputs (cad/out/):
  kestrel_k1.glb            complete robot, every part named <group>__<material>_<part>
  kestrel_k1_interior.glb   structure + actuators + electronics only (skeleton view)
  step/<part>.step          manufacturable parts (shells, frames) for fabrication
  stl/<part>.stl            same, for printing / quoting
  parts.json                part names + kinematic body of each part (used by check_clearance.py)
  shell_mass.json           CAD shell masses (MJF PA12 / PC / TPU) against the params.py shell budget

Mk II packaging (constants and the reasons for every move in layout.py):
  KA-130H hip pitch / KA-130K knee: KM-130x50-LC, 50 mm stack in a liquid jacket (+8 mm), coolant
    ports on the jacket, hip pitch -> knee in series, dry-break quick-disconnects at the hip;
  KA-110P hip roll behind the hip in the gluteal pod, output flange 12x M5 on PCD 100;
  KH-25 shoulders and KH-20 shoulder-yaw / elbows: KM motors + two-disc cycloid (pin-ring housings);
  two side-by-side hot-swap 16S4P packs in the torso back behind a rear service door;
  radiator + 2 x 92 mm fans in the upper-back pack; 13-DOA hands with palm cameras.
Exterior shells (design language, two-tone CMF) are in exterior.py.

Run:  python build_robot.py            (full: GLB + STEP + STL + reports)
      KESTREL_FAST=1 python build_robot.py   (GLB only, for render iteration)
"""
from __future__ import annotations

import json
import math
import os
import sys
import traceback
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "calc"))
from geom import actuator, actuator_lc, cyl, cycloid_actuator, joint_cap, rbox, rod_between, tube  # noqa: E402
from layout import *  # noqa: E402,F401,F403
import layout as L  # noqa: E402

OUT = HERE / "out"
(OUT / "step").mkdir(parents=True, exist_ok=True)
(OUT / "stl").mkdir(parents=True, exist_ok=True)
FAST = os.environ.get("KESTREL_FAST") == "1"

COLORS = {  # sRGB fallbacks; the viewer replaces these with PBR materials by prefix
    "shell": (0.93, 0.92, 0.89), "trim": (0.16, 0.165, 0.175), "joint": (0.12, 0.125, 0.135), "act": (0.20, 0.21, 0.23),
    "alu": (0.74, 0.75, 0.77), "frame": (0.62, 0.64, 0.67), "cf": (0.10, 0.10, 0.11), "visor": (0.02, 0.025, 0.03),
    "accent": (1.0, 0.62, 0.22), "sole": (0.07, 0.07, 0.075), "batt": (0.86, 0.52, 0.16), "pcb": (0.10, 0.42, 0.26),
    "cam": (0.06, 0.06, 0.07), "ti": (0.50, 0.51, 0.53), "copper": (0.78, 0.45, 0.25), "cool": (0.20, 0.46, 0.62),
    "boot": (0.10, 0.10, 0.11), "steel": (0.62, 0.64, 0.66), "magnet": (0.48, 0.50, 0.53),
}
SKIN = ("shell", "trim", "visor", "accent", "sole", "boot")   # exterior materials (hidden in skeleton view)

PARTS = []      # (group, material, name, shape, export_step, body)


def _body_of(group):
    return group


def add(group, mat, name, fn, step=False, mirror=False, body=None):
    """Add a part (left side + optional XZ mirror for the right). body = kinematic link name."""
    try:
        shp = fn() if callable(fn) else fn
        if hasattr(shp, "solid") and hasattr(shp, "ops"):      # exterior.Shell -> evaluate (with fallbacks), labelled
            shp = shp.solid(label=f"{group}/{name}")
        b = body or group
        PARTS.append((group, mat, name, shp, step, b))
        if mirror:
            g = "r_" + group[2:] if group.startswith("l_") else group
            rb = "r_" + b[2:] if b.startswith("l_") else b
            PARTS.append((g, mat, name, shp.mirror("XZ"), False, rb))
    except Exception as e:  # keep building; report
        print(f"!! {group}/{name}: {e}")
        traceback.print_exc(limit=2)


def add_many(group, items, mirror=False, body=None):
    for mat, name, shp in items:
        add(group, mat, name, shp, mirror=mirror, body=body)


def hose(points, r=4.0):
    """Coolant hose through a polyline (rods + spheres at the bends)."""
    w = None
    for p0, p1 in zip(points[:-1], points[1:]):
        seg = rod_between(p0, p1, r)
        w = seg if w is None else w.union(seg)
    for p in points[1:-1]:
        w = w.union(cq.Workplane("XY").sphere(r).translate(p))
    return w


def fan(center, d=92.0, t=25.0):
    """Axial fan along x: square frame with a round duct, hub and 7 swept blades."""
    cx, cy, cz = center
    frame = rbox(t, d, d, 4, center).cut(cyl(d / 2 - 2, t + 2, "x", center))
    hub = cyl(d * 0.2, t * 0.8, "x", center)
    blades = None
    for k in range(7):
        a = 2 * math.pi * k / 7
        b = rbox(3, d * 0.30, 14, 1, (cx, cy, cz)).translate((0, 0, 0))
        b = b.translate((0, d * 0.30 * 0.5 + d * 0.18, 0)).rotate((cx, cy, cz), (cx + 1, cy, cz), math.degrees(a))
        b = b.rotate((cx, cy + (d * 0.33) * math.cos(a), cz + (d * 0.33) * math.sin(a)),
                     (cx, cy + (d * 0.33) * math.cos(a) * 2, cz + (d * 0.33) * math.sin(a) * 2), 25)
        blades = b if blades is None else blades.union(b)
    return frame, hub.union(blades)


# ================================================================= INTERIOR
def _roll_pitch_bracket():
    """7075-T6 plate between the KA-110P output flange (12x M5 on PCD 100, counterbored) and the KA-130H."""
    p = rbox(10, 118, 124, 4, (-79, HY, HZ)).cut(cyl(20, 20, "x", (-79, HY, HZ)))
    for k in range(12):
        a = 2 * math.pi * k / 12 + math.pi / 12
        y, z = HY + 50 * math.cos(a), HZ + 50 * math.sin(a)
        p = p.cut(cyl(2.75, 20, "x", (-79, y, z))).cut(cyl(4.6, 5.2, "x", (-76.5, y, z)))
    return p


def interior():
    od, ln = ACT["KA-90P"]
    od11, ln11 = ACT["KA-110P"]
    # ---------------- pelvis: machined deck carrying both hip-yaw actuators (hung from it) and a
    # cradle for the waist-yaw actuator; front/rear hangers sit outside the waist-pitch sweep (r 75)
    def pelvis_bowl():
        deck = rbox(172, 248, 12, 0, (0, 0, 1076)).edges("|Z").fillet(40).edges("not |Z").fillet(2)
        deck = deck.cut(cyl(79, 20, "z", (0, 0, 1076)))                           # waist-link opening (drum + caps sweep r 78)
        for s in (1, -1):
            deck = deck.cut(cyl(16, 30, "z", (0, s * HY, 1076)))                  # hip-yaw cable bores
        # waist-yaw housing clamped at its upper flange (z 990..1000) and hung from the front/rear bridges: nothing
        # below z 980, where the roll-pitch brackets and thigh hip bosses sweep in hip yaw / roll
        hang = rbox(6, 36, 76, 3, (80, 0, 1044)).union(rbox(6, 36, 76, 3, (-80, 0, 1044)))
        clamp = tube(58, 48.6, 10, "z", (0, 0, 1009)).union(rbox(160, 24, 10, 3, (0, 0, 1009))).cut(cyl(48.6, 20, "z", (0, 0, 1009)))
        return deck.union(hang).union(clamp)
    add("pelvis", "frame", "pelvis_bowl", pelvis_bowl, step=True)
    add("pelvis", "act", "waist_yaw_KA90P", lambda: actuator(od, ln, "z", (0, 0, WAIST_YAW_Z)))
    add("pelvis", "pcb", "pelvis_io_imu", lambda: rbox(12, 36, 80, 3, (58, 0, 990)))
    add("pelvis", "alu", "coolant_manifold", lambda: rbox(10, 56, 16, 3, (-92, 0, 1050)))
    # ---------------- waist (KA-110P Mk II envelope: OD 127)
    add("waist", "act", "waist_pitch_KA110P", lambda: actuator(od11, ln11, "y", (0, 0, WP), fins=False), body="waist_link")
    add("waist", "frame", "waist_yoke", lambda: rbox(84, 100, 6, 2, (0, 0, 1018)).union(rbox(64, 7, 80, 3, (0, -44, 1056))), body="waist_link")
    add_many("waist", joint_cap(56, "y", (0, 47.5, WP), "waist_cap_L", bolts=8, accent=False), body="waist_link")
    add_many("waist", joint_cap(56, "-y", (0, -47.5, WP), "waist_cap_R", bolts=8, accent=False), body="waist_link")
    # ---------------- torso: battery bay (rails, decks, front bulkhead = spine plate), compute, cooling
    def spine():
        p = rbox(6, 220, 192, 3, (SPINE_X, 0, 1254))
        for z in (1270, 1318):
            p = p.cut(rbox(12, 150, 36, 0, (SPINE_X, 0, z)).edges("|X").fillet(10))
        return p
    add("torso", "frame", "spine_plate", spine, step=True)
    add("torso", "frame", "rib_lower", lambda: rbox(150, 220, 8, 0, (-30, 0, 1154)).edges("|Z").fillet(25).union(rbox(60, 7, 64, 3, (0, 43.5, 1118))), step=True)
    add("torso", "frame", "rib_upper", lambda: rbox(150, 236, 8, 0, (-30, 0, 1350)).edges("|Z").fillet(30), step=True)
    for s, nm in ((1, "L"), (-1, "R")):
        add("torso", "frame", f"battery_rail_{nm}", lambda s=s: rbox(120, 6, 190, 2, (-20, s * 107, 1252)))
        yc = s * (BATT_Y[0] + BATT_Y[1]) / 2
        zc, hz, wy = (BATT_Z[0] + BATT_Z[1]) / 2, BATT_Z[1] - BATT_Z[0], BATT_Y[1] - BATT_Y[0]
        x_cap = BATT_X[0] + 25.0
        def pack(yc=yc):       # 2 layers x 4 x 8 Molicel P50B (axes fore-aft) in holders: 146 x 92 x 182 + enclosure
            b = cq.Workplane("XY").box(BATT_X[1] - x_cap, wy, hz).edges("|Z").fillet(10).edges("not |Z").fillet(3)
            return b.translate(((BATT_X[1] + x_cap) / 2, yc, zc))
        def endcap(yc=yc):     # rear end cap: BMS + FET switch, 100 A Class T fuse, cam lever, handle
            b = cq.Workplane("XY").box(60.0, wy, hz).edges("|Z").fillet(24).edges("not |Z").fillet(3)
            b = b.translate((BATT_X[0] + 30.0, yc, zc))
            return b.intersect(cq.Workplane("XY").box(25.0, 400, 400).translate(((BATT_X[0] + x_cap) / 2, yc, zc)))
        add("torso", "batt", f"battery_pack_{'A' if s > 0 else 'B'}_16S4P", pack)
        add("torso", "joint", f"battery_endcap_{nm}", endcap)
        add("torso", "alu", f"battery_cam_lever_{nm}", lambda yc=yc: rbox(4, 46, 14, 1.5, (BATT_X[0] - 2, yc, 1318)))
        add("torso", "cam", f"battery_connector_{nm}", lambda yc=yc: rbox(8, 34, 24, 2, (SPINE_X - 1, yc, 1200)))
    add("torso", "pcb", "pdu_bms", lambda: rbox(30, 170, 80, 3, (72, 0, 1198)))
    add("torso", "pcb", "jetson_thor_carrier", lambda: rbox(36, 160, 120, 3, (79, 0, 1300)))
    add("torso", "alu", "thor_coldplate", lambda: rbox(8, 150, 110, 2, (101, 0, 1300)))
    add("torso", "pcb", "rt_computer_safety", lambda: rbox(30, 92, 100, 3, (-73, 0, 1406)))
    add("torso", "alu", "radiator_core", lambda: rbox(22, 174, 96, 2, (-118, 0, 1410)))
    for s, nm in ((1, "L"), (-1, "R")):
        add("torso", "joint", f"radiator_tank_{nm}", lambda s=s: rbox(26, 7, 100, 3, (-118, s * 90.5, 1410)))
        fr, hub = fan((-144, s * 46.5, 1410))
        add("torso", "cam", f"fan92_{nm}", fr)
        add("torso", "act", f"fan92_rotor_{nm}", hub)
        add("torso", "act", f"coolant_pump_{nm}", lambda s=s: cyl(16, 44, "z", (-96, s * 78, 1380)))
    add("torso", "act", "electronics_blower", lambda: cyl(26, 28, "x", (80, 0, 1395)))
    add("torso", "cam", "speaker", lambda: rbox(20, 60, 30, 3, (84, 0, 1440)))
    add("torso", "cam", "abdomen_depth_cam", lambda: rbox(26, 96, 26, 4, (108, 0, 1176)).rotate((108, 0, 1176), (108, 1, 1176), 35))
    od25, ln25 = ACT["KH-25"]
    for s in (1, -1):
        add("torso", "act", f"shoulder_pitch_KH25_{'L' if s > 0 else 'R'}",
            lambda s=s: cycloid_actuator(od25, ln25, "y" if s > 0 else "-y", (0, s * SH_PITCH_Y, SZ)))
    od14, ln14 = ACT["KH-14"]
    add("torso", "act", "neck_yaw_KH14", lambda: actuator(od14, ln14, "z", (0, 0, 1450)))
    # coolant trunk: radiator tanks -> pumps -> down the back -> pelvis manifold; Thor cold-plate loop
    for s in (1, -1):
        add("torso", "cool", f"coolant_trunk_{'L' if s > 0 else 'R'}",
            lambda s=s: hose([(-118, s * 88, 1360), (-104, s * 104, 1352), (-95, s * 107, 1340), (-95, s * 107, 1170),
                              (-95, s * 62, 1157), (-72, s * 62, 1105), (-72, s * 40, 1070), (-86, s * 16, 1056)]))
        add("torso", "cool", f"coldplate_line_{'L' if s > 0 else 'R'}",
            lambda s=s: hose([(-96, s * 78, 1402), (-96, s * 44, 1470), (40, s * 40, 1470), (101, s * 40, 1357)], r=3.0))
    # ---------------- neck + head
    add("neck", "act", "neck_pitch_KH14", lambda: actuator(od14, ln14, "y", (0, 0, NP)), body="neck_link")
    add("neck", "frame", "neck_yoke", lambda: rbox(70, 84, 6, 2, (0, 0, 1489)).union(rbox(40, 5, 76, 2, (0, -35.5, 1528))), body="neck_link")
    add("head", "frame", "head_frame", lambda: rbox(120, 130, 10, 4, (5, 0, 1597)).union(rbox(40, 5, 60, 2, (0, 35.5, 1568))))
    add("head", "cam", "zedx_mini_stereo", lambda: rbox(37, 94, 32, 8, (72, 0, 1652)).rotate((72, 0, 1652), (72, 1, 1652), 10))
    for s in (1, -1):
        add("head", "cam", f"slam_cam_{'L' if s > 0 else 'R'}",
            lambda s=s: rbox(31, 31, 49, 4, (34, s * 62, 1658)).rotate((34, s * 62, 1658), (34, s * 62, 1659), s * 55))
    add("head", "cam", "lidar_mid360", lambda: cyl(32.5, 48, "z", (0, 0, 1714)))
    add("head", "pcb", "head_electronics", lambda: rbox(50, 100, 56, 3, (-40, 0, 1640)))
    # ---------------- arms (left, mirrored)
    od20, ln20 = ACT["KH-20"]
    add("l_shoulder", "frame", "shoulder_bracket",
        lambda: rbox(100, 8, 112, 6, (-40, 136, SZ)).union(cyl(52, 6, "y", (0, 135, SZ))), mirror=True)
    add("l_shoulder", "act", "shoulder_roll_KH25", lambda: cycloid_actuator(od25, ln25, "x", (SH_ROLL_X, SY, SZ)), mirror=True)
    add("l_upper_arm", "joint", "roll_output_bracket",
        lambda: cyl(50, 8, "x", (0, SY, SZ)).union(rbox(10, 84, 104, 4, (9, SY, 1396))).union(rbox(46, 84, 8, 3, (27, SY, 1348))),
        mirror=True, body="l_upper_arm_a")
    add("l_upper_arm", "act", "shoulder_yaw_KH20", lambda: cycloid_actuator(od20, ln20, "-z", (0, SY, SH_YAW_Z)), mirror=True, body="l_upper_arm_a")
    add("l_upper_arm", "cf", "upper_arm_tube", lambda: tube(25, 23, 100, "z", (0, SY, 1218)), mirror=True, step=True)
    add("l_upper_arm", "act", "elbow_KH20", lambda: cycloid_actuator(od20, ln20, "y", (0, SY, EZ)), mirror=True)
    add("l_forearm", "frame", "elbow_clevis",
        lambda: rbox(52, 80, 6, 3, (0, SY, 1068.2)),
        mirror=True)
    add("l_forearm", "act", "wrist_yaw_KH14", lambda: actuator(od14, ln14, "-z", (0, SY, WRIST_YAW_Z + 2)), mirror=True)
    add("l_forearm", "act", "wrist_lin_A", lambda: cyl(14, 100, "z", (14, SY + 12, WRIST_LIN_Z)), mirror=True)
    add("l_forearm", "act", "wrist_lin_B", lambda: cyl(14, 100, "z", (-14, SY - 12, WRIST_LIN_Z)), mirror=True)
    add("l_forearm", "frame", "forearm_frame",
        lambda: rbox(28, 2.5, 130, 1.2, (0, SY + 28.5, 965)).union(rbox(28, 2.5, 130, 1.2, (0, SY - 28.5, 965))), mirror=True, step=True)
    add("l_forearm", "pcb", "hand_controller", lambda: rbox(40, 24, 50, 2, (0, SY, 1080 - 104)).translate((0, 0, 0)), mirror=True)
    add("l_hand", "ti", "wrist_cross", lambda: rbox(28, 28, 22, 3, (0, SY, WRZ)), mirror=True)
    add("l_hand", "cam", "wrist_ft_sensor", lambda: cyl(24, 18, "z", (0, SY, 838)), mirror=True)
    from hand import hand_internals
    for mat, name, shp in hand_internals(SY, WRZ):
        add("l_hand", mat, name, shp, mirror=True)
    # ---------------- legs (left, mirrored)
    od13h, ln13h = ACT["KA-130H"]
    od13k, ln13k = ACT["KA-130K"]
    add("l_hip", "act", "hip_yaw_KA90P", lambda: actuator(od, ln, "-z", (0, HY, 1035)), mirror=True, body="pelvis")
    add("l_hip", "frame", "yaw_roll_yoke",
        lambda: rbox(150, 60, 14, 4, (-62, HY, 992)).union(rbox(70, 50, 8, 2, (-132, HY, 981))).union(rbox(10, 70, 80, 3, (-177, HY, 952))),
        mirror=True, step=True, body="l_hip_yaw")
    add("l_hip", "act", "hip_roll_KA110P", lambda: actuator(od11, ln11, "x", (HIP_ROLL_X, HY, HZ)), mirror=True, body="l_hip_yaw")
    from detail_parts import hip_roll_flange
    add("l_hip", "frame", "hip_roll_output_flange", lambda: hip_roll_flange().rotate((0, 0, 0), (0, 1, 0), 90).translate((-92, HY, HZ)),
        mirror=True, step=True, body="l_hip_roll")
    for k in range(12):
        a = 2 * math.pi * k / 12 + math.pi / 12
        add("l_hip", "ti", f"m5_shcs_{k:02d}", lambda a=a: cyl(4.1, 5, "x", (-76.6, HY + 50 * math.cos(a), HZ + 50 * math.sin(a))),
            mirror=True, body="l_hip_roll")
    add("l_hip", "frame", "roll_pitch_bracket",
        lambda: _roll_pitch_bracket(), mirror=True, step=True, body="l_hip_roll")
    add("l_hip", "act", "hip_pitch_KA130H", lambda: actuator_lc(od13h, ln13h, "-y", (0, HIP_PITCH_Y, HZ), port_angle=225),
        mirror=True, body="l_hip_roll")
    # dry-break quick-disconnect pair at the hip (supply / return), hoses into the pelvis manifold
    # dry-break quick-disconnect pair per leg on the pelvis (supply / return), hip side through service loops
    for k, x in enumerate((-66, -88)):
        add("l_hip", "alu", f"coolant_qd_{'supply' if k == 0 else 'return'}",
            lambda x=x: cyl(8.5, 20, "z", (x, 60, 1025)).union(cyl(10, 8, "z", (x, 60, 1039))).union(cyl(6, 10, "z", (x, 60, 1048))),
            mirror=True, body="pelvis")
    add("l_hip", "cool", "coolant_pelvis_supply", lambda: hose([(-66, 60, 1052), (-80, 40, 1058), (-92, 14, 1054)]), mirror=True, body="pelvis")
    add("l_hip", "cool", "coolant_pelvis_return", lambda: hose([(-88, 60, 1052), (-92, 22, 1050)]), mirror=True, body="pelvis")
    # hip-pitch ports (y 135.9 / 112.8) point down-rear, knee ports (y 59.7 / 84.4) up-rear: hip -> knee in series
    add("l_hip", "cool", "coolant_qd_to_hip",
        lambda: hose([(-66, 60, 1015), (-68, 44, 990), (-68, 44, 872), (-60, 85, 857), (-59.4, 112.8, 855.6)]), mirror=True, body="l_hip_roll")
    add("l_thigh", "cool", "coolant_hip_to_knee", lambda: hose([(-59.4, 135.9, 855.6), (-60, 115, 842), (-42, 84.4, 827.7)]), mirror=True)
    add("l_thigh", "cool", "coolant_knee_return",
        lambda: hose([(-42, 59.7, 827.7), (-62, 48, 850), (-80, 40, 872), (-80, 40, 990), (-88, 60, 1015)]), mirror=True)
    add("l_thigh", "act", "knee_KA130K", lambda: actuator_lc(od13k, ln13k, "y", (0, KNEE_ACT_Y, KNEE_ACT_Z), port_angle=240), mirror=True)
    from detail_parts import knee_hub, thigh_plate
    add("l_thigh", "frame", "thigh_plate_medial", lambda: thigh_plate().translate((0, 0, HZ)), mirror=True, step=True)
    def plate_lat():           # lateral plate: knee-bearing boss + ring round the KA-130K output (crank outside it)
        p = rbox(60, 7, 270, 3, (0, 143.5, 625)).union(cyl(45, 17, "y", (0, 138.5, KZ))).union(cyl(78, 7, "y", (0, 143.5, KNEE_ACT_Z)))
        return p.cut(cyl(36, 20, "y", (0, 138.5, KZ))).cut(cyl(46, 10, "y", (0, 143.5, KNEE_ACT_Z)))
    add("l_thigh", "frame", "thigh_plate_lateral", plate_lat, mirror=True, step=True)
    for nm, yb in (("med", 38.5), ("lat", 138.5)):
        add("l_thigh", "steel", f"knee_bearing_7207BE_{nm}", lambda yb=yb: tube(36, 17.5, 17, "y", (0, yb, KZ)), mirror=True)
    add("l_thigh", "cf", "thigh_tube", lambda: tube(20, 18, 116, "z", (15, KNEE_ACT_Y, 622)), mirror=True, step=True)
    kf = json.loads((HERE.parent / "data" / "knee_fourbar.json").read_text())
    Ax, Az = kf["A"]
    r1, r2, beta, phi0 = kf["r1"] * 1e3, kf["r2"] * 1e3, math.radians(kf["beta_deg"]), math.radians(kf["phi0_deg"])
    pinA = (Ax * 1e3 + r1 * math.cos(phi0), ROD_Y, KZ + Az * 1e3 + r1 * math.sin(phi0))
    pinK = (r2 * math.cos(beta), ROD_Y, KZ + r2 * math.sin(beta))
    add("l_thigh", "ti", "knee_pushrod", lambda: rod_between(pinA, pinK, 7).union(cyl(11, 14, "y", pinA)).union(cyl(11, 14, "y", pinK)),
        mirror=True, step=True, body="l_pushrod")
    add("l_thigh", "act", "knee_crank_act",
        lambda: rod_between((Ax * 1e3, CRANK_Y, KZ + Az * 1e3), (pinA[0], CRANK_Y, pinA[2]), 10).union(cyl(22, 6, "y", (0, CRANK_Y, KNEE_ACT_Z))),
        mirror=True, body="l_crank")
    add("l_shank", "alu", "knee_hub", lambda: knee_hub().translate((0, KNEE_ACT_Y, KZ)), mirror=True, step=True)   # crank integral
    add("l_shank", "act", "ankle_A_KA90P", lambda: actuator(od, ln, "y", (-15, HY, ANKLE_A_Z)), mirror=True)
    add("l_shank", "act", "ankle_B_KA90P", lambda: actuator(od, ln, "-y", (-25, HY, ANKLE_B_Z)), mirror=True)
    add("l_shank", "cf", "shank_tube", lambda: tube(20, 18, 118, "z", (8, HY, 179)), mirror=True, step=True)
    add("l_shank", "frame", "shank_upper_fitting",
        lambda: rbox(66, 56, 26, 5, (0, 99, 455)).cut(cyl(26.5, 120, "y", (0, 99, KZ))).cut(cyl(52.5, 11, "y", (0, KNEE_ACT_Y, KZ))),
        mirror=True, step=True)
    add("l_shank", "ti", "ankle_rod_lat", lambda: rod_between((-55, HY + 36, ANKLE_A_Z), (-52, HY + 36, 92), 5), mirror=True, step=True,
        body="l_ankle_rods")
    add("l_shank", "ti", "ankle_rod_med", lambda: rod_between((-65, HY - 36, ANKLE_B_Z), (-52, HY - 36, 92), 5), mirror=True,
        body="l_ankle_rods")
    add("l_foot", "ti", "ankle_cross", lambda: rbox(48, 48, 36, 4, (0, HY, AZ)), mirror=True, step=True, body="l_ankle")
    add("l_foot", "frame", "foot_plate", lambda: rbox(250, 104, 12, 0, (58, HY, 22)).edges("|Z").fillet(30).edges("not |Z").fillet(2),
        mirror=True, step=True)
    add("l_foot", "frame", "ankle_clevis",
        lambda: rbox(6, 40, 62, 2, (27, HY, 59)).union(rbox(6, 40, 62, 2, (-27, HY, 59))).union(rbox(60, 40, 6, 2, (0, HY, 31))), mirror=True)
    add("l_foot", "frame", "ankle_levers",
        lambda: rbox(14, 12, 64, 3, (-52, HY + 36, 60)).union(rbox(14, 12, 64, 3, (-52, HY - 36, 60))).union(rbox(14, 84, 10, 3, (-52, HY, 33))),
        mirror=True)
    for k, (x, y) in enumerate(((-30, 32), (-30, -32), (150, 32), (150, -32))):
        add("l_foot", "cam", f"load_cell_{k}", lambda x=x, y=y: cyl(11, 4.4, "z", (x, HY + y, 13.8)), mirror=True)


# ================================================================= ASSEMBLY / REPORTS
def shell_mass_report():
    """Net shell volumes -> mass, grouped onto the params.py shell lines (one side x2 for limbs)."""
    dens = {"shell": L.PA12_DENSITY, "trim": L.PA12_DENSITY, "visor": L.PC_DENSITY, "boot": L.TPU_DENSITY}
    line_of = {
        "pelvis": "pelvis shells", "torso": "torso shells (chest, back door, abdomen)", "head": "head shell + visor",
        "l_upper_arm": "upper-arm shells x2", "r_upper_arm": "upper-arm shells x2", "l_forearm": "forearm shells x2",
        "r_forearm": "forearm shells x2", "l_thigh": "thigh shells x2", "r_thigh": "thigh shells x2",
        "l_shank": "shank shells x2", "r_shank": "shank shells x2",
    }
    rows, extra, per_part = {}, {}, {}
    for group, mat, name, shp, step, body in PARTS:
        if mat not in dens:
            continue
        try:
            v = sum(s.Volume() for s in shp.vals())
        except Exception:
            continue
        m = v * dens[mat] * (1 + L.SHELL_EXTRA) / 1000.0
        key = line_of.get(group)
        tgt = rows if key else extra
        k = key or {"l_": "", "r_": ""}.get(group[:2], "") + (group[2:] if group[:2] in ("l_", "r_") else group) + " (no params line)"
        tgt.setdefault(k, 0.0)
        tgt[k] += m
        per_part[f"{group}/{name}"] = round(m, 4)
    total_budget = sum(L.SHELL_BUDGET.values())
    out = {"density_g_cm3": {"PA12": 1.01, "PC": 1.20, "TPU": 1.20}, "allowance_bosses_paint": L.SHELL_EXTRA,
           "lines": {k: {"cad_kg": round(rows.get(k, 0.0), 3), "budget_kg": b} for k, b in L.SHELL_BUDGET.items()},
           "shells_without_params_line": {k: round(v, 3) for k, v in sorted(extra.items())},
           "cad_total_kg": round(sum(rows.values()) + sum(extra.values()), 3), "budget_total_kg": round(total_budget, 3),
           "moved_from_params_centroid": L.MOVED, "pack_envelope_mm": L.PACK_ENVELOPE,
           "parts_kg": dict(sorted(per_part.items(), key=lambda kv: -kv[1]))}
    (OUT / "shell_mass.json").write_text(json.dumps(out, indent=1))
    print("shell mass  CAD %.2f kg  vs params %.2f kg" % (out["cad_total_kg"], total_budget))
    for k, v in out["lines"].items():
        print(f"   {k:44s} {v['cad_kg']:6.3f} / {v['budget_kg']:.3f}")
    for k, v in out["shells_without_params_line"].items():
        print(f"   {k:44s} {v:6.3f}")
    return out


def build():
    interior()
    from exterior import exterior
    exterior(add, add_many)
    full = cq.Assembly(name="kestrel_k1")
    inner = cq.Assembly(name="kestrel_k1_interior")
    names, bodies = [], {}
    for group, mat, name, shp, step, body in PARTS:
        nm = f"{group}__{mat}_{name}"
        c = COLORS[mat]
        try:
            full.add(shp, name=nm, color=cq.Color(*c, 1.0))
            if mat not in SKIN and not name.endswith("_cover"):
                inner.add(shp, name=nm, color=cq.Color(*c, 1.0))
            names.append(nm)
            bodies[nm] = body
        except Exception as e:
            print("assembly add failed", nm, e)
        if not FAST and step and (group in ("head", "torso", "pelvis", "waist", "neck") or group.startswith("l_")):
            try:
                cq.exporters.export(shp, str(OUT / "step" / f"{group}__{name}.step"))
                cq.exporters.export(shp, str(OUT / "stl" / f"{group}__{name}.stl"), tolerance=0.2, angularTolerance=0.2)
            except Exception as e:
                print("export failed", nm, e)
    from cadquery.occ_impl.exporters.assembly import exportGLTF
    exportGLTF(full, str(OUT / "kestrel_k1.glb"), binary=True, tolerance=0.4, angularTolerance=0.3)
    if not FAST:
        exportGLTF(inner, str(OUT / "kestrel_k1_interior.glb"), binary=True, tolerance=0.4, angularTolerance=0.3)
    (OUT / "parts.json").write_text(json.dumps({"parts": names, "body": bodies}, indent=0))
    shell_mass_report()
    print(f"{len(PARTS)} parts -> {OUT}")


if __name__ == "__main__":
    build()
