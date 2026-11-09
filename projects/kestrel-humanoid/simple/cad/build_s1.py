#!/usr/bin/env python3
"""KESTREL S1 buildable CAD (CadQuery). Zero pose, world frame (x forward, y left, z up, sole at z = 0), mm.

Segment lengths and joint positions come from calc/kestrel/params.py with KESTREL_VARIANT=s1, so a DIM change
moves the joints, re-cuts the tubes, push-rods and extrusions and re-picks the knee belt.

    python3 build_s1.py            # full build: STEP, DXF, STL, cut list, render meshes
    python3 build_s1.py --quick    # geometry + render meshes + cut list only (no STEP/STL)

Outputs in simple/cad/out/: step/, dxf/, stl/, cut_list.md, parts.json, render/ (meshes for render_s1.py).

Frame standard (simple/README): 2040/4040 T-slot (20-series, 6 mm slot) torso box and pelvis cross-members;
dia 40x3 6061-T6 tube in split clamp blocks for thigh, shank and upper arm, dia 30x2 forearm; every bracket a
6 mm 6061-T6 laser/waterjet plate with a 20 mm grid of dia 5.5 holes; every actuator through an adapter
plate on its real bolt circle (s1parts.ACTUATORS); a support bearing opposite every leg actuator output.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
from pathlib import Path

os.environ["KESTREL_VARIANT"] = "s1"
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str((HERE / ".." / ".." / "calc").resolve()))

import cadquery as cq  # noqa: E402
import numpy as np  # noqa: E402

from kestrel import params as P  # noqa: E402
import s1lib as L  # noqa: E402
from s1lib import Plate2D, box, cyl, hull_shapes, ring, rrect, seg_cyl  # noqa: E402
import s1parts as S  # noqa: E402

assert P.NAME == "KESTREL S1", "params.py did not load the S1 variant"
OUT = HERE / "out"
D = {k: v * 1000.0 for k, v in P.DIM.items()}

# ------------------------------------------------------------------------------------------- joints from params
BODIES = P.build_bodies()


def joint_table():
    """World position of every body origin / joint in the zero pose (frames are world-aligned at zero pose)."""
    pos = {}
    out = {}
    for b in BODIES:
        base = np.zeros(3) if b.parent is None else pos[b.parent]
        p = base + np.array(b.jpos) * 1000.0
        pos[b.name] = p
        out[b.name] = dict(parent=b.parent, joint=b.joint, pos=p, axis=tuple(b.axis))
    return out


JT = joint_table()
PELVIS_Z = D["ankle_h"] + D["shank"] + D["thigh"]          # pelvis origin = midpoint of hip centres
for k in JT:
    JT[k]["pos"] = JT[k]["pos"] + np.array([0, 0, PELVIS_Z])

HY = D["hip_half_width"]
Z_ANK = D["ankle_h"]
Z_KNEE = Z_ANK + D["shank"]
Z_HIP = Z_KNEE + D["thigh"]
Z_WAIST = Z_HIP + D["waist_yaw_above"]
Z_TORSO = Z_WAIST + D["waist_pitch_above"]
Z_SH = Z_TORSO + D["shoulder_z"]
SH_Y = D["shoulder_half_width"]
Z_ELB = Z_SH - D["upper_arm"]
Z_WP = Z_ELB - D["forearm"]
Z_NY = Z_TORSO + D["neck_yaw_z"]
Z_NP = Z_NY + D["neck_pitch_above"]
Z_HEAD_TOP = Z_NP + D["head_top_above_neck_pitch"]

# consistency with the body tree (variant_s1.py)
assert np.allclose(JT["l_hip_roll_link"]["pos"], [0, HY, Z_HIP])
assert np.allclose(JT["l_shank"]["pos"], [0, HY, Z_KNEE])
assert np.allclose(JT["l_foot"]["pos"], [0, HY, Z_ANK])
assert np.allclose(JT["l_shoulder"]["pos"], [0, SH_Y, Z_SH])
assert np.allclose(JT["l_wrist"]["pos"], [0, SH_Y, Z_WP])
assert np.allclose(JT["head"]["pos"], [0, 0, Z_NP])

m = L.Model()


# =========================================================================================== plate thickness by load
# 6 mm: hip yoke (out-of-plane fore-aft load), X12 hip adapter (320 N m), cranks/levers, torso base plate.
# 5 mm: leg cheek pairs, cradle, hip-roll actuator plate, pelvis, foot, shoulder side plates. 4 mm: arms, head, neck,
# torso top/electronics/tray/camera plates, gripper. Hand calcs in the cut list (section 0).
T6, T5, T4 = 6.0, 5.0, 4.0
RS04_STATOR_N = 5          # 5 of the 10 M4 holes: friction capacity 5 x 7.8 kN x 0.15 x 53 mm = 310 N m vs 120 N m


def Pl(outline, thk=T6):
    return Plate2D(outline, thk)


def pcd_pts(cx, cy, pcd, n_of, use, a0=0.0):
    """Points of a bolt circle with n_of positions, keeping the indices in 'use'."""
    out = []
    for i in use:
        a = math.radians(a0) + 2 * math.pi * i / n_of
        out.append((cx + pcd / 2 * math.cos(a), cy + pcd / 2 * math.sin(a)))
    return out


def holes(p, pts, d, kind="bolt"):
    for (x, y) in pts:
        p.hole(x, y, d, kind)


# =========================================================================================== pelvis + yaw modules
# Hip-yaw stack (relative to the hip centre, zr): yaw top plate [86, 92] (clears the rolling cradle, which stays
# within r = 84 of the roll axis), output hub [92, 105], RS04 output face 105, bearing ring [95, 105.5],
# RS04 housing [105.5, 144.5], pelvis plate [144.5, 149.5]. The roll actuator and every yaw-link part stay below
# the pelvis plate, so nothing on the pelvis can collide with the legs at any yaw angle.
ZR_YAW_TOP = 86.0
ZR_OUT = ZR_YAW_TOP + T6 + 13.0
ZR_PELVIS = ZR_OUT + 0.5 + 39.0
Z_PELVIS = Z_HIP + ZR_PELVIS                                   # pelvis plate underside
RS04_OUT6 = [0, 1, 3, 4, 6, 7]                                 # 6 of the 9 M5 output holes (40 deg pitch)


def yaw_module(body_fixed, body_out, cx, cy, z_out, down, fixed_only=False):
    """RS04 yaw drive with a 61812 thin-section support bearing in a ring on the actuator's front face.

    z_out = output face height, down = output faces -z (hip yaw) or +z (waist yaw). fixed_only: register only the
    parts on the fixed side (used for the right hip, whose moving parts come from mirroring the left leg)."""
    s = -1.0 if down else 1.0
    act = S.actuator(m, "RS04", body_fixed, (cx, cy, z_out), (0, 0, s))
    m.fast("M4x12 SHCS", RS04_STATOR_N)
    zf = z_out - s * 0.5
    rg = ring(58, 45, 4.0, (cx, cy, zf), (0, 0, s)).fuse(ring(45, 39, 10.5, (cx, cy, zf), (0, 0, s)))
    m.solid("YAW_BEARING_RING", rg, body_fixed, "alu", "machined", "6061-T6",
            "machined 6061-T6 stepped ring: 4 mm flange dia 116 with 5 x dia 4.5 c'bored on PCD 106 (low-head M4, "
            "DIN 7984) to the RS04 front face; seat dia 78 H7 x 10.5 with a 1 mm lip for the 61812-2RS outer race",
            dims="dia 116 x 10.5")
    m.fast("M4x10 SHCS low head", 5)
    if fixed_only:
        return act
    S.bearing(m, "61812-2RS", body_out, (cx, cy, zf + s * 5.25), (0, 0, s))
    hub = ring(30, 26, 13.0, (cx, cy, z_out), (0, 0, s)).fuse(ring(26, 11, 5.0, (cx, cy, z_out), (0, 0, s)))
    m.solid("YAW_HUB", hub, body_out, "alu", "machined", "6061-T6",
            "machined 6061-T6 cup: seat dia 60 k6 x 13 for the 61812 inner race, 5 mm web with 3 x dia 6 H7 pin holes "
            "and 6 x dia 5.5 on PCD 36; the driven plate's 6 x M5x25 pass through into the RS04 output threads",
            dims="dia 60 x 13")
    m.fast("M5x25 SHCS", 6)
    return act


def pelvis():
    zp = Z_PELVIS
    p = Pl(rrect(-90, -178, 105, 178, 25), T5)
    for s in (1, -1):
        p.bore(0, s * HY, 96)
        holes(p, pcd_pts(0, s * HY, 106, 10, range(0, 10, 2), a0=18), 4.5)
        p.keep(0, s * HY, 60)
    ext_pts = [(70, -100), (90, -100), (70, 100), (90, 100), (-70, -100), (-70, -30), (-70, 30), (-70, 100)]
    holes(p, ext_pts, 5.5, "m5")
    m.fast("M5x12 SHCS", 8)
    m.fast("M5 T-nut", 8)
    m.plate("pelvis_plate", p, "xy", zp, "pelvis")
    S.extrusion(m, "EXT_4040_pelvis_front", "pelvis", "4040", (80, -130, zp + T5 + 20), (0, 1, 0), 260, (1, 0, 0))
    S.extrusion(m, "EXT_2040_pelvis_rear", "pelvis", "2040", (-70, -130, zp + T5 + 20), (0, 1, 0), 260, (1, 0, 0))
    zw = zp + T5 + 40.0                         # waist mount plate on the extrusions
    w = Pl(rrect(-82, -82, 102, 82, 14), T5)
    w.bore(0, 0, 96)
    holes(w, pcd_pts(0, 0, 106, 10, range(0, 10, 2), a0=18), 4.5)
    w.keep(0, 0, 60)
    holes(w, [(70, -60), (90, 60), (-70, -60), (-70, 60)], 5.5, "m5")
    m.fast("M5x12 SHCS", 4)
    m.fast("M5 T-nut", 4)
    m.plate("waist_mount_plate", w, "xy", zw, "pelvis")
    m.solid("PELVIS_IMU_CAN_HUB", box(-40, -45, zp + T5, 20, 45, zp + T5 + 22), "pelvis", "pcb", "purchased", "-",
            "IMU + CAN hub board in a printed tray", dims="60 x 90 x 22", structure=False, mass_kg=0.15)
    yaw_module("pelvis", "l_hip_yaw_link", 0, HY, Z_HIP + ZR_OUT, down=True)
    yaw_module("pelvis", "r_hip_yaw_link", 0, -HY, Z_HIP + ZR_OUT, down=True, fixed_only=True)
    return zw + T5


# =========================================================================================== left leg
# y_rel = y - HY. Thigh = two pocketed 5 mm cheeks (inner faces y_rel -76 and 53) tied by tube spacers through the
# knee-X12 bulkhead; shank = two pocketed 5 mm calf plates (inner faces +-26.5) carrying both ankle RS04s, the
# knee bearings and the ankle pivots. One load path per segment: no tube in the legs (length change = recut plates,
# DXF + belt + push-rods). Hip X12 output faces outboard onto the outer cheek; knee X12 output faces inboard, its 36T
# 8MGT pulley and the belt run inside the inner cheek, the 54T knee pulley bolts to the inner calf plate.
# Knee drive: Gates Poly Chain Carbon Volt / GT Carbon 8MGT, 36T driver : 54T knee = 1.5, 36 mm belt (lead's review,
# replacing the overloaded 30 mm HTD-8M). Stock 8MGT lengths from the Gates Carbon Volt brochure (8MGTV-640 ... 1280).
KZ1, KZ2 = 36, 54
KBELT_W, KBELT_T = 36.0, 5.9                      # belt width, total thickness (Gates: 8MGT tooth 3.4, belt 5.9 mm)
KFL, KMOUNT = 1.0, 6.5                            # pulley flange, X12 mounting web (low-head screws ahead of the teeth)
GT8M_STOCK = (640, 720, 800, 896, 960, 1000, 1040, 1120, 1200, 1224, 1280)
CH_IN = -76.0                                     # inner faces of the thigh cheeks (plates are 5 mm outboard of these)
CH_OUT = -76.0 + 1.5 + 85.0 + KMOUNT + 2 * KFL + KBELT_W + 2 + 2.0   # X12 + mounting web + toothed width + gaps = 59
D_ANKLE = 26.5 + 0.5 + (T4 + 0.5) + T6 + 6.0   # ankle push-rod half spacing: calf face, spacer, crank, rod-end centre
_FAM = json.loads((HERE.parent / "data" / "actuator_family.json").read_text())
R_ANKLE = float(_FAM.get("S-A", {}).get("reductions", {}).get("ankle", 1.0))
R_C = 40.0                                      # ankle crank (K1 linkage)
R_P = 52.0 * R_ANKLE                            # foot lever: 52 mm x the selected ankle reduction (actuator_selection)
HIP_PITCH_RED = float(_FAM.get("S-LX", {}).get("reductions", {}).get("hip_pitch", 1.0))
D_ROLL = 36.0                                  # foot-lever pin half spacing (roll lever, K1 value): rods lean in slightly
YR_RAIL = D_ROLL + 6.0 + T5 / 2                # foot side-rail centre plane
KNEE_BELT_LP = None


def Y(yr):
    return HY + yr


def Zh(zr):
    return Z_HIP + zr


def knee_belt():
    """Pick the stock 8MGT belt that puts the knee X12 195-215 mm below the hip, 36T:54T = 1.5:1."""
    best = None
    for Lp in GT8M_STOCK:
        c = S.belt_centre(Lp, KZ1, KZ2)
        below_hip = D["thigh"] - c
        if 195 <= below_hip <= 215:
            score = abs(below_hip - 203)
            if best is None or score < best[0]:
                best = (score, Lp, c)
    return best[1], best[2]


def leg():
    global KNEE_BELT_LP
    Lp, C = knee_belt()
    KNEE_BELT_LP = Lp
    ZKA = Z_KNEE + C                     # knee actuator axis height
    yawb, rollb, thighb, shankb, ankleb, footb = ("l_hip_yaw_link", "l_hip_roll_link", "l_thigh", "l_shank",
                                                  "l_ankle_link", "l_foot")

    # ---------------------------------------------------------------- hip yaw link (yoke + roll actuator)
    tp = Pl(rrect(-80, Y(-45), 94, Y(45), 10), T6)
    holes(tp, pcd_pts(0, HY, 36, 9, RS04_OUT6), 5.5)
    tp.bore(0, HY, 12)
    tp.keep(0, HY, 31)
    for yr in (-25, 25):
        tp.tslot(-80, Y(yr))                             # rear arm screws into this edge
        tp.hole(83, Y(yr), 5.5, "m5")                    # screws down into the front arm's top edge
    m.fast("M5x16 SHCS", 4)
    m.fast("M5 square nut", 4)
    m.plate("hip_yaw_top_plate", tp, "xy", Zh(ZR_YAW_TOP), yawb, pocket=False,
            note="not pocketed: carries the leg in bending between the yoke arms and the hub (calc 0.4)")

    fa = Pl(hull_shapes(circles=[(Y(0), Zh(0), 34)], rects=[(Y(-40), Zh(40), Y(40), Zh(ZR_YAW_TOP))]), T6)
    for yr in (-25, 25):
        fa.tslot(Y(yr), Zh(ZR_YAW_TOP))
    bore, pcd, _, fr = S.housing(m, "6905-2RS", yawb, (86, Y(0), Zh(0)), (1, 0, 0), T6)
    fa.bore(Y(0), Zh(0), bore)
    holes(fa, pcd_pts(Y(0), Zh(0), pcd, 3, range(3), 90), 2.5, "m3tap")
    fa.keep(Y(0), Zh(0), fr + 1)
    m.plate("hip_yaw_front_arm", fa, "yz", 80, yawb)

    st_pts = [(-35, 35), (-30, 128), (100, 128)]
    ra = Pl(hull_shapes(circles=[(Y(0), Zh(0), 34)] + [(Y(a), Zh(b), 12) for a, b in st_pts],
                        rects=[(Y(-45), Zh(80), Y(45), Zh(ZR_YAW_TOP + T6))]), T6)
    bore, pcd, _, fr = S.housing(m, "6905-2RS", yawb, (-86, Y(0), Zh(0)), (-1, 0, 0), T6)
    ra.bore(Y(0), Zh(0), bore)
    holes(ra, pcd_pts(Y(0), Zh(0), pcd, 3, range(3), 90), 2.5, "m3tap")
    ra.keep(Y(0), Zh(0), fr + 1)
    for a, b in st_pts:
        ra.hole(Y(a), Zh(b), 6.6, "m6")
    for yr in (-25, 25):
        ra.hole(Y(yr), Zh(ZR_YAW_TOP + T6 / 2), 5.5, "m5")
    m.plate("hip_yaw_rear_arm", ra, "yz", -86, yawb)

    # hip-roll RS04 behind the hip: axis x, output +x, 2:1 crank (35) -> vertical push-rod -> roll lever (70)
    RA_Y, RA_Z = Y(35), Zh(80)
    S.actuator(m, "RS04", yawb, (-118, RA_Y, RA_Z), (1, 0, 0))
    mp = Pl(hull_shapes(circles=[(RA_Y, RA_Z, 62)] + [(Y(a), Zh(b), 12) for a, b in st_pts]), T5)
    mp.bore(RA_Y, RA_Z, 96)
    holes(mp, pcd_pts(RA_Y, RA_Z, 106, 10, range(0, 10, 2), a0=18), 4.5)
    for a, b in st_pts:
        mp.hole(Y(a), Zh(b), 6.6, "m6")
    m.plate("hip_roll_actuator_plate", mp, "yz", -157.5 - T5, yawb)
    m.fast("M4x12 SHCS", RS04_STATOR_N)
    for a, b in st_pts:
        S.standoff(m, yawb, (-157.5, Y(a), Zh(b)), (-86, Y(a), Zh(b)))
    S.output_spacer(m, "RS04_OUTPUT_SPACER_6", yawb, (-118, RA_Y, RA_Z), (1, 0, 0), 6.0,
                    note="dia 50 x 6, bore 22: 9 x dia 5.5 on PCD 36 + 3 x dia 6 H7 for the RS04 output pins")
    cr = Pl(hull_shapes(circles=[(RA_Y, RA_Z, 27), (Y(70), RA_Z, 11)]), T6)
    holes(cr, pcd_pts(RA_Y, RA_Z, 36, 9, RS04_OUT6), 5.5)
    cr.bore(RA_Y, RA_Z, 12)
    cr.hole(Y(70), RA_Z, 8.0, "pin")
    m.plate("hip_roll_crank_35", cr, "yz", -112, yawb, grid=False, pocket=False)
    m.fast("M5x20 SHCS", 6)

    # ---------------------------------------------------------------- hip roll link (cradle round the hip X12)
    hf = CH_OUT - 12.5                                  # X12 housing front face (output face on the outer cheek)
    S.actuator(m, "X12", rollb, (0, Y(CH_OUT), Zh(0)), (0, 1, 0))
    co = Pl(rrect(-76, Zh(-70), 76, Zh(64), 14), T6)     # top at 64: clears the yaw plate at +30 deg roll
    co.bore(0, Zh(0), 110)
    holes(co, pcd_pts(0, Zh(0), 116.5, 16, range(0, 16, 2), a0=11.25), 4.5)
    m.fast("M4x12 SHCS", 8)
    ci_y = hf - 72.5 - 6 - T5                           # cradle inner plate (6 mm cable gap behind the X12)
    ci = Pl(rrect(-76, Zh(-84), 76, Zh(70), 14), T5)      # 14 mm deeper than the cradle: carries the fan window
    holes(ci, pcd_pts(0, Zh(0), 46, 4, range(4), 45), 5.5)
    ci.bore(0, Zh(0), 28)
    ci.keep(0, Zh(0), 28)
    FZ = 20.0 * round((Z_HIP - 55.0) / 20.0)            # fan centre on the 20 mm grid, below the support stub
    # (above the stub the fan would reach the yaw top plate at -25 deg roll)
    ci.bore(0, FZ, 38.0)                                 # air window: the fan blows through onto the X12 housing
    for x in (-40, 40):
        ci.hole(x, FZ, 5.5, "m5")
    for pl in (co, ci):
        for x in (-68.5, 68.5):
            for zr in (-45, 45):
                pl.hole(x, Zh(zr), 5.5, "m5")
    m.plate("hip_cradle_outer_plate", co, "xz", Y(hf), rollb, note="X12 stator adapter: 8 x M4 on PCD 116.5, "
            "dia 110 bore on the pilot")
    m.plate("hip_cradle_inner_plate", ci, "xz", Y(ci_y), rollb, note="carries the X12 cooling fan bracket")
    # X12 cooling: 40 x 40 x 10 mm 12 V fan (Noctua NF-A4x10 FLX 12 V) blowing through the inner plate's dia 38 window
    # across the X12 housing; the 6 mm X12 adapter plate is the heat spreader. Bracket on 2 x M5 standoffs (grid holes).
    yb0 = ci_y - 10.0 - 2.0                              # fan 10 mm + 2 mm air gap, then the bracket
    m.solid("FAN_40x40x10_12V", box(-20, Y(ci_y - 10.0), FZ - 20, 20, Y(ci_y), FZ + 20).cut(
        cyl(18.5, 10.0, (0, Y(ci_y - 10.0), FZ), "y")), rollb, "pcb", "purchased", "-",
        "Noctua NF-A4x10 FLX 12 V (40 x 40 x 10 mm, 9 g), 12 V from the torso DC-DC, run with the X12 temperature",
        dims="40 x 40 x 10", structure=False, mass_kg=0.009)
    fb = Pl(rrect(-48, FZ - 24, 48, FZ + 24, 6), T4)
    fb.bore(0, FZ, 38.0)
    for dx in (-16, 16):
        for dz in (-16, 16):
            fb.hole(dx, FZ + dz, 3.4, "m3")
    for x in (-40, 40):
        fb.hole(x, FZ, 5.5, "m5")
    m.plate("hip_fan_bracket", fb, "xz", Y(yb0 - T4), rollb, grid=False, pocket=False,
            note="4 mm; on the cradle inner plate's 20 mm grid via 2 x M5 standoffs, fan held by 4 x M3x16")
    for x in (-40, 40):
        S.standoff(m, rollb, (x, Y(ci_y - T5), FZ), (x, Y(yb0), FZ), d=10.0)
    m.fast("M3x16 SHCS", 4)
    m.fast("M3 Nylock nut", 4)
    m.fast("M5x12 SHCS", 4)
    for x0 in (66.0, -71.0):
        fp = Pl(rrect(Y(ci_y + T5), Zh(-70), Y(hf), Zh(70), 3), T5)
        for zr in (-45, 45):
            fp.tslot(Y(hf), Zh(zr))
            fp.tslot(Y(ci_y + T5), Zh(zr))
        fp.bore(Y(0), Zh(0), 25.2)
        holes(fp, pcd_pts(Y(0), Zh(0), 34, 4, range(4), 45), 3.3, "m4tap")
        fp.keep(Y(0), Zh(0), 22)
        m.plate("hip_cradle_end_plate", fp, "yz", x0, rollb, note="front and rear end plates are the same part")
    m.fast("M5x16 SHCS", 8)
    m.fast("M5 square nut", 8)
    # trunnion shafts (7075-T6, hollow): spigot in the end plate, flange outside, 6905s in the yoke arms
    fs = cyl(12.5, 26, (66, Y(0), Zh(0)), "x").fuse(cyl(22, 5, (71, Y(0), Zh(0)), "x"))
    fs = fs.cut(cyl(7.5, 26, (66, Y(0), Zh(0)), "x"))
    m.solid("HIP_ROLL_FRONT_STUB", fs, rollb, "alu", "machined", "7075-T6",
            "turned 7075-T6: spigot dia 25 in the end plate, flange dia 44 x 5 with 4 x dia 4.5 on PCD 34 (M4 into the "
            "plate), shaft dia 25 k6 x 16, bore 15, M5 end screw + 20 mm washer retains the 6905", dims="dia 44 x 26")
    rs = cyl(12.5, 46, (-66, Y(0), Zh(0)), "-x").fuse(cyl(22, 5, (-76, Y(0), Zh(0)), "x"))
    rs = rs.cut(cyl(7.5, 46, (-66, Y(0), Zh(0)), "-x")).cut(box(-113, Y(10.7), Zh(-14), -104, Y(14), Zh(14)))
    m.solid("HIP_ROLL_REAR_SHAFT", rs, rollb, "alu", "machined", "7075-T6",
            "turned 7075-T6: as the front stub but shaft 36 long with a 1.5 mm flat for the roll lever "
            "(torsion 240 N m: 90 MPa in the dia 25/15 section)", dims="dia 44 x 46")
    m.fast("M4x12 SHCS", 8)
    m.fast("M5x12 SHCS + 20 mm washer (shaft end)", 2)
    lv = Pl(hull_shapes(circles=[(Y(0), Zh(0), 20), (Y(70), Zh(0), 11)]), T6)
    lv.cut(S.d_hole(Y(0), Zh(0), 25.0))
    lv.hole(Y(70), Zh(0), 8.0, "pin")
    m.plate("hip_roll_lever_70", lv, "yz", -112, rollb, grid=False, pocket=False)
    S.push_rod(m, "PUSHROD_hip_roll", yawb, (-100, Y(70), RA_Z), (-100, Y(70), Zh(0)), (1, 0, 0))

    # hip-pitch support stub (7075, fixed to the cradle) and its 6808 in the thigh's inner cheek
    L_stub = (ci_y - T5) - (CH_IN - T5 - 3.5)          # to the outer end of the 6808 in the inner cheek
    stub = ring(27, 14, T5, (0, Y(ci_y), Zh(0)), "-y").fuse(ring(20, 14, L_stub, (0, Y(ci_y - T5), Zh(0)), "-y"))
    m.solid("HIP_PITCH_SUPPORT_STUB", stub, rollb, "alu", "machined", "7075-T6",
            "turned 7075-T6: flange dia 54 x 5 (4 x M5 from inside the cradle), stub dia 40 k6 bore 28 for the 6808, "
            "M5 end screw + 20 mm washer", dims="dia 54 x 42")
    m.fast("M5x12 SHCS", 4)
    m.fast("M5x12 SHCS + 20 mm washer (shaft end)", 1)

    # ---------------------------------------------------------------- thigh
    ties = [(64, ZKA + 33), (-64, ZKA + 33), (0, ZKA - 74)]       # through the knee-X12 bulkhead (2 mm off the X12)
    tie_k = (0, Z_KNEE + 90)                                      # cheek-to-cheek, inside the belt loop, over the 54T
    outline = L.union_outline([L.circle_pts(0, Zh(0), 45, 64), L.circle_pts(0, ZKA, 76, 64),
                               L.circle_pts(0, Z_KNEE, 34, 48), L.strap((0, Zh(0)), (0, ZKA), 80),
                               L.strap((0, ZKA), (0, Z_KNEE), 66)] + [L.circle_pts(x, z, 13, 24) for x, z in ties + [tie_k]])

    def cheek(inner):
        c = Pl(outline, T5)
        for (x, z) in ties + [tie_k]:
            c.hole(x, z, 4.5, "tie")
        c.bore(0, Z_KNEE, 25.2)
        if inner:
            face = Y(CH_IN - T5)
            bore, pcd, _, fr = S.housing(m, "6808-2RS", thighb, (0, face, Zh(0)), (0, -1, 0), T5)
            c.bore(0, Zh(0), bore)
            holes(c, pcd_pts(0, Zh(0), pcd, 3, range(3), 90), 2.5, "m3tap")
            c.keep(0, Zh(0), fr + 1)
            bore, pcd, _, fr = S.housing(m, "6908-2RS", thighb, (0, face, ZKA), (0, -1, 0), T5, wide=True)
            m.fast("M3 Nylock nut", 4)
            c.cut(rrect(-bore / 2, ZKA - bore / 2 - 3, bore / 2, ZKA + bore / 2 + 3, bore / 2 - 0.01))   # +-3 mm take-up
            for (hx, hz) in pcd_pts(0, ZKA, pcd, 18, (1, 8, 10, 17)):    # 4 screws at +-20 deg, in vertical slots
                c.cut(rrect(hx - 1.7, hz - 4.7, hx + 1.7, hz + 4.7, 1.69))
            m.fast("M3x8 SHCS", 1)
            c.keep(0, ZKA, fr + 4)
            for x in (-9, 9):                                               # belt tension block (jack screw)
                c.hole(x, ZKA - fr - 12, 5.5, "m5")
            c.keep(0, ZKA - fr - 12, 16)
        else:
            holes(c, pcd_pts(0, Zh(0), 72, 12, (0, 1, 3, 4, 6, 7, 9, 10), 15), 5.5)   # 8 of 12 M5 (calc 0.2)
            c.bore(0, Zh(0), 40)
            c.keep(0, Zh(0), 46)
            m.fast("M5x12 SHCS", 8)
        return c
    m.plate("thigh_outer_cheek", cheek(False), "xz", Y(CH_OUT), thighb)
    m.plate("thigh_inner_cheek", cheek(True), "xz", Y(CH_IN - T5), thighb)

    # knee X12: output inboard, 36T pulley on its output, 6908 support bearing in a slotted seat in the inner cheek
    y_out = CH_OUT - 1.5 - 85.0                        # rear boss 1.5 mm off the outer cheek
    S.actuator(m, "X12", thighb, (0, Y(y_out), ZKA), (0, -1, 0))
    kb_y = y_out + 12.5                                 # housing front face y_rel
    kb = Pl(hull_shapes(circles=[(0, ZKA, 66)] + [(x, z, 13) for x, z in ties]), T5)
    kb.bore(0, ZKA, 110)
    holes(kb, pcd_pts(0, ZKA, 116.5, 16, range(0, 16, 2), a0=11.25), 4.5)
    for (x, z) in ties:                                 # slotted +-3 mm along the thigh: belt take-up
        kb.cut(rrect(x - 2.25, z - 5.25, x + 2.25, z + 5.25, 2.24))
    m.plate("knee_actuator_bulkhead", kb, "xz", Y(kb_y - T5), thighb,
            note="tie holes slotted +-3 mm: the X12 and the 6908 seat slide together to tension the belt")
    m.fast("M4x12 SHCS", 8)
    for (x, z) in ties:                                 # one M5 through-bolt clamps cheek-tube-bulkhead-tube-cheek
        S.tie(m, thighb, (x, Y(CH_IN), z), (x, Y(kb_y - T5), z), od=16, wall=2, bolt=False)
        S.tie(m, thighb, (x, Y(kb_y), z), (x, Y(CH_OUT), z), od=16, wall=2, bolt=False)
        m.fast(f"M4x{int(5 * math.ceil((CH_OUT - CH_IN + 2 * T5 + 7) / 5))} SHCS", 1)
        m.fast("M4 Nylock nut", 1)
    S.tie(m, thighb, (tie_k[0], Y(CH_IN), tie_k[1]), (tie_k[0], Y(CH_OUT), tie_k[1]), od=16, wall=2, bolt=False)
    m.fast(f"M4x{int(5 * math.ceil((CH_OUT - CH_IN + 2 * T5 + 7) / 5))} SHCS", 1)
    m.fast("M4 Nylock nut", 1)
    L_boss = (y_out - KMOUNT - (2 * KFL + KBELT_W + 2)) - (CH_IN - T5 - 7.0 - 0.5)   # into the 6908
    S.pulley(m, f"PULLEY_8MGT_{KZ1}T", thighb, KZ1, (0, Y(y_out), ZKA), (0, -1, 0), width=KBELT_W, fl=KFL,
             mount=(14, 44, KMOUNT), mount_relief=6, far_web=(20, 4.0), boss=(40, L_boss, 28),
             note="8MGT (Poly Chain) profile; 6.5 mm mounting web dia 88 c'bored for 6 x DIN 7984 M5x12 low-head screws "
                  "on PCD 72 (X12 output), dia 62 spigot; dia 40 boss into a 6908 in the inner cheek")
    m.fast("M5x12 SHCS low head", 6)
    S.belt(m, "BELT_8MGT_36", thighb, (0, ZKA), (0, Z_KNEE), KZ1, KZ2, Y(y_out - KMOUNT - KFL - (KBELT_W + 1)), Lp=Lp,
           width=KBELT_W, thk=KBELT_T, product=f"Gates Poly Chain Carbon Volt 8MGTV-{Lp}-{KBELT_W:.0f} "
           f"(successor to Poly Chain GT Carbon 8MGT-{Lp}-{KBELT_W:.0f})")
    tb_z = ZKA - (62 + 24) / 2 - 12                   # tension block below the 6908 housing flange
    tblk = box(-14, Y(CH_IN - T5 - 8), tb_z - 8, 14, Y(CH_IN - T5), tb_z + 8).cut(cyl(2.5, 16, (0, Y(CH_IN - T5 - 4), tb_z - 8), "z"))
    m.solid("BELT_TENSION_BLOCK", tblk, thighb, "alu", "machined", "6061-T6",
            "6061 block 28 x 16 x 8 on the inner cheek (2 x M5), M6 jack screw pushes the 6908 housing flange up: loosen "
            "the 3 housing screws and the 3 bulkhead through-bolts, jack to the Gates sonic-meter tension, re-clamp",
            dims="28 x 16 x 8")
    m.fast("M5x16 SHCS", 2)
    m.fast("M6x25 set screw + M6 nut (jack)", 1)
    ks = ring(12.5, 7.5, CH_OUT + T5 - (CH_IN - T5), (0, Y(CH_IN - T5), Z_KNEE), "y")
    m.solid("KNEE_SHAFT", ks, thighb, "alu", "machined", "7075-T6",
            f"7075-T6 tube shaft dia 25 h6 bore 15 x {CH_OUT + T5 - (CH_IN - T5):.0f}, M5 end screws + washers, one flat for an "
            "anti-rotation screw (bending 94 N m: 70 MPa)", dims=f"dia 25 x {CH_OUT + T5 - (CH_IN - T5):.0f}")
    m.fast("M5x12 SHCS + 20 mm washer (shaft end)", 2)

    # ---------------------------------------------------------------- shank
    ZA, ZB = Z_KNEE - 95.0, Z_KNEE - 225.0               # ankle actuators A (upper) / B (lower), x = -12
    AX = -(R_P - R_C)                                    # actuator axis x so the crank pin sits above the foot lever pin
    CP = 26.5                                            # calf plates' inner faces at +-26.5
    TC = T4                                              # calf plate thickness (calc 0.5)
    ties_s = [(35, Z_KNEE - 35), (AX + 70, 0.5 * (ZA + ZB)), (0, Z_ANK + 75)]
    c_out = L.union_outline([L.circle_pts(0, Z_KNEE, 40, 48), L.circle_pts(AX, ZA, 62, 64), L.circle_pts(AX, ZB, 62, 64),
                             L.circle_pts(0, Z_ANK, 30, 48), L.strap((0, Z_KNEE), (AX, ZA), 70),
                             hull_shapes(circles=[(AX, ZA, 62), (AX, ZB, 62)]), L.strap((AX, ZB), (0, Z_ANK), 56)]
                            + [L.circle_pts(x, z, 13, 24) for x, z in ties_s])

    def calf(outer):
        c = Pl(c_out, TC)
        zc = ZA if outer else ZB
        c.bore(AX, zc, 54)
        holes(c, pcd_pts(AX, zc, 106, 10, range(0, 10, 2), a0=18), 4.5)
        c.hole(AX + 53, zc, 5.0, "dowel")
        c.keep(AX, zc, 60)
        for (x, z) in ties_s:
            c.hole(x, z, 4.5, "tie")
        c.hole(0, Z_ANK, 18.0, "bushing")
        c.keep(0, Z_ANK, 13)
        if outer:
            bore, pcd, _, fr = S.housing(m, "6905-2RS", shankb, (0, Y(CP + TC), Z_KNEE), (0, 1, 0), TC)
            c.bore(0, Z_KNEE, bore)
            holes(c, pcd_pts(0, Z_KNEE, pcd, 3, range(3), 90), 2.5, "m3tap")
            c.keep(0, Z_KNEE, fr + 1)
        else:
            c.bore(0, Z_KNEE, 27)
            holes(c, pcd_pts(0, Z_KNEE, 54, 6, range(6), 90), 5.5)        # 6 x M5 + 2 dowels: 456 N m (calc 0.1)
            holes(c, pcd_pts(0, Z_KNEE, 54, 2, range(2), 0), 5.0, "dowel")
            c.keep(0, Z_KNEE, 34)
            m.fast("M5x12 SHCS", 6)
        return c
    m.plate("calf_outer_plate", calf(True), "xz", Y(CP), shankb)
    m.plate("calf_inner_plate", calf(False), "xz", Y(-CP - TC), shankb)
    m.fast("M4x10 SHCS", 2 * RS04_STATOR_N)
    m.fast("igus GFM-1618 flange bushing", 2)
    for (x, z) in ties_s:
        S.tie(m, shankb, (x, Y(-CP), z), (x, Y(CP), z), od=16, wall=2, bolt=False)
        m.fast(f"M4x{int(5 * math.ceil((2 * CP + 2 * TC + 7) / 5))} SHCS", 1)
        m.fast("M4 Nylock nut", 1)
    # 54T knee pulley: collar bolted to the inner calf plate, two 6905s on the knee shaft
    y48 = -CP - TC
    S.pulley(m, f"PULLEY_8MGT_{KZ2}T", shankb, KZ2, (0, Y(y48), Z_KNEE), (0, -1, 0), width=KBELT_W, fl=KFL,
             mount=(23, 31, y48 - (y_out - KMOUNT)), web=True, hub_ring=(21, 24),
             note="collar dia 64 with 6 x M5 tapped + 2 x dia 5 dowels on PCD 54 to the inner calf plate; two 6905-2RS "
                  "in a dia 42 H7 bore; 6 relief windows in the 5 mm web")
    for yb in (y48 - 12, y48 - 30):
        S.bearing(m, "6905-2RS", shankb, (0, Y(yb), Z_KNEE), (0, 1, 0))
    ysp = CP + TC + max(9 - TC, 3)                       # end of the outer knee housing flange
    m.solid("KNEE_SPACER", ring(16, 12.7, CH_OUT - ysp, (0, Y(ysp), Z_KNEE), "y"), thighb,
            "alu", "machined", "6061-T6", "6061 tube spacer dia 32 x 25.4 bore", dims=f"dia 32 x {CH_OUT - ysp:.1f}")

    # ankle actuators: A front-mounted on the outer calf plate (output +y), B on the inner (output -y)
    for zc, sgn, nm, od in ((ZA, 1, "A", 14.0), (ZB, -1, "B", 12.0)):
        yo = sgn * (CP + 0.5)
        S.actuator(m, "RS04", shankb, (AX, Y(yo), zc), (0, sgn, 0))
        L_sp = TC + 0.5
        S.output_spacer(m, f"RS04_OUTPUT_SPACER_{L_sp:.1f}".replace(".", "p"), shankb, (AX, Y(yo), zc), (0, sgn, 0), L_sp,
                        note=f"dia 50 x {L_sp:.1f} (through the dia 54 plate bore), bore 22, 9 x dia 5.5 PCD 36, 3 pin holes")
        yc = yo + sgn * L_sp
        cr = Pl(hull_shapes(circles=[(AX, zc, 27), (AX - R_C, zc, 11)]), T6)
        holes(cr, pcd_pts(AX, zc, 36, 9, RS04_OUT6), 5.5)
        cr.bore(AX, zc, 12)
        cr.hole(AX - R_C, zc, 8.0, "pin")
        m.plate("ankle_crank_40", cr, "xz", Y(yc) if sgn > 0 else Y(yc - T6), shankb, grid=False, pocket=False)
        m.fast("M5x20 SHCS", 6)
        ypin = Y(sgn * D_ANKLE)
        S.push_rod(m, f"PUSHROD_ankle_{nm}", shankb, (AX - R_C, ypin, zc), (AX - R_C, Y(sgn * D_ROLL), Z_ANK), (0, 1, 0),
                   od=od)

    # ---------------------------------------------------------------- ankle cross + foot
    cross = box(-20, Y(-22), Z_ANK - 15, 20, Y(22), Z_ANK + 15)
    cross = cross.fuse(cyl(8, 66, (0, Y(-33), Z_ANK), "y")).fuse(cyl(6, 66, (-33, Y(0), Z_ANK), "x"))
    cross = cross.cut(cyl(8, 30, (0, Y(0), Z_ANK - 15), "z"))
    m.solid("ANKLE_CROSS", cross, ankleb, "alu", "machined", "7075-T6",
            "machined 7075-T6, hard anodised: block 40 x 44 x 30 with integral pitch pins dia 16 f7 (iglide bushings in "
            "the calf plates) and roll pins dia 12 f7 (iglide GFM-1214-06 in the foot clevis), dia 16 lightening bore",
            dims="66 x 66 x 30")
    z_sp = 4.0                                            # sole plate underside (4 mm rubber below)
    sp = Pl(rrect(-70, Y(-D["foot_w"] / 2), 190, Y(D["foot_w"] / 2), 20), T5)
    for x in (-28.5, 28.5):
        for yr in (-12, 12):
            sp.hole(x, Y(yr), 5.5, "m5")
    for yr in (-YR_RAIL, YR_RAIL):
        for x in (-50, 110):
            sp.hole(x, Y(yr), 5.5, "m5")
    m.plate("foot_sole_plate", sp, "xy", z_sp, footb)
    m.fast("M5x16 SHCS", 8)
    m.fast("M5 square nut", 8)
    sole = cq.Solid.extrudeLinear(cq.Face.makeFromWires(cq.Wire.makePolygon(
        [cq.Vector(float(x), float(y), 0) for x, y in rrect(-70, Y(-D["foot_w"] / 2), 190, Y(D["foot_w"] / 2), 20)],
        close=True)), cq.Vector(0, 0, z_sp))
    m.solid("FOOT_RUBBER_SOLE", sole, footb, "rubber", "purchased", "rubber",
            "4 mm NBR sole sheet, cut to the sole-plate outline, contact-cemented", dims=f"260 x {D['foot_w']:.0f} x 4",
            mass_kg=0.26 * D["foot_w"] * 1e-3 * 0.004 * 1200 * 0.95)
    z0 = z_sp + T5
    for x0 in (26.0, -31.0):
        cv = Pl(hull_shapes(circles=[(Y(0), Z_ANK, 18)], rects=[(Y(-24), z0, Y(24), z0 + 6)]), T5)
        cv.hole(Y(0), Z_ANK, 14.0, "bushing")
        for yr in (-12, 12):
            cv.tslot(Y(yr), z0)
        m.plate("foot_roll_clevis", cv, "yz", x0, footb, grid=False, note="front and rear are the same part; ream "
                "dia 14 H7 for igus GFM-1214-06")
    m.fast("igus GFM-1214-06 flange bushing", 2)
    for yr in (D_ROLL + 6.0, -(D_ROLL + 6.0) - T5):
        fr = Pl(hull_shapes(circles=[(-R_P, Z_ANK, 13)], rects=[(-70, z0, 150, z0 + 18)]), T5)
        fr.hole(-R_P, Z_ANK, 8.0, "pin")
        for x in (-50, 110):
            fr.tslot(x, z0)
        m.plate("foot_side_rail", fr, "xz", Y(yr), footb, note=f"foot lever ({R_P:.0f} mm behind the ankle) + sole stiffener")
    return dict(ZKA=ZKA, belt=Lp, C=C, d_ankle=D_ANKLE)


# =========================================================================================== waist + torso
Z_TOP = Z_SH + 60.0                         # torso top plate underside


def torso(z_waist_plate_top):
    zo = z_waist_plate_top + 39.0 + 0.5             # waist RS04 output face (rear face on the waist mount plate)
    yaw_module("pelvis", "waist_link", 0, 0, zo, down=False)
    zb = zo + 13.0                                  # torso base plate underside (on the waist hub)
    tb = "torso"
    ups = [(-100, 59), (-100, -59), (80, 59), (80, -59)]      # 2040 upright centres (20 in x, 40 in y)

    def cap_plate(extra, tslots, thk):
        p = Pl(rrect(-112, -79, 92, 79, 10), thk)
        for (x, y) in ups:
            p.hole(x, y, 5.5, "m5")
            p.keep(x, y, 14)
        if tslots:
            for x in (-40, 40):
                for sgn in (1, -1):
                    p.tslot(x, sgn * 79)
        extra(p)
        return p

    def base_extra(p):
        holes(p, pcd_pts(0, 0, 36, 9, RS04_OUT6), 5.5)
        p.bore(0, 0, 12)
        p.keep(0, 0, 31)
    m.plate("torso_base_plate", cap_plate(base_extra, False, T6), "xy", zb, tb)

    def top_extra(p):
        p.bore(0, 0, 37)                         # neck-yaw RS00 front face: 3 of 6 M3 on PCD 50, output through
        holes(p, pcd_pts(0, 0, 50, 6, (0, 2, 4)), 3.4)
        p.keep(0, 0, 30)
        p.hole(-85, 0, 22.5, "estop")
    m.plate("torso_top_plate", cap_plate(top_extra, True, T4), "xy", Z_TOP, tb)
    m.fast("M3x8 SHCS", 3)
    m.fast("M5x12 SHCS", 8)
    for (x, y) in ups:
        S.extrusion(m, "EXT_2040_torso_upright", tb, "2040", (x, y, zb + T6), (0, 0, 1), Z_TOP - zb - T6, (1, 0, 0))
    m.force_mirror = True
    sp = Pl(rrect(-112, Z_SH - 90, 92, Z_TOP + T4 + 8, 10), T5)
    sp.bore(0, Z_SH, 96)
    holes(sp, pcd_pts(0, Z_SH, 106, 10, range(0, 10, 2), a0=18), 4.5)
    sp.keep(0, Z_SH, 60)
    for x in (-100, 80):
        for z in (Z_SH - 75, Z_SH + 40):
            sp.hole(x, z, 5.5, "m5")
    for x in (-40, 40):
        sp.hole(x, Z_TOP + T4 / 2, 4.5, "m4")
    m.plate("torso_shoulder_plate", sp, "xz", 79.0, "torso")
    m.force_mirror = False
    m.fast("M5x12 SHCS", 8)
    m.fast("M5 T-nut", 8)
    m.fast("M4x16 SHCS", 4)
    m.fast("M4 square nut", 4)
    bt = Pl(rrect(-88, -69, 12, 69, 8), T4)
    for ang in (90, 150, 210, 270):                       # clear the waist-hub screw heads under the tray
        bt.hole(18 * math.cos(math.radians(ang)), 18 * math.sin(math.radians(ang)), 10.0, "clear")
    for x in (-78, -5):
        for y in (-55, 55):
            bt.hole(x, y, 4.5, "m4")
    m.plate("battery_tray", bt, "xy", zb + T6, tb)
    m.fast("M4x12 SHCS", 4)
    zbat = zb + T6 + T4
    m.solid("BATTERY_13S5P", box(-88, -65, zbat, 12, 65, zbat + 240), tb, "batt", "purchased", "-",
            "48 V 13S5P 21700 pack ~1.1 kWh + BMS in its own case, 100 x 130 x 240, 2 webbing straps",
            dims="100 x 130 x 240", structure=False, mass_kg=5.8)
    ep = Pl(rrect(-75, zb + 16, 75, Z_TOP - 10, 8), T4)
    for y in (-59, 59):
        for z in (zb + 40, Z_TOP - 40):
            ep.hole(y + (10 if y > 0 else -10), z, 5.5, "m5")
    m.plate("electronics_plate", ep, "yz", 70.0 - T4, tb, note="Jetson, CAN-FD, contactor, DC-DC bolt to the grid")
    m.fast("M5x10 SHCS", 4)
    m.fast("M5 T-nut", 4)
    m.solid("COMPUTE_JETSON_CARRIER", box(16, -60, Z_SH - 120, 64, 60, Z_SH - 20), tb, "pcb", "purchased", "-",
            "Jetson Orin NX/AGX + carrier + CAN-FD interfaces", dims="50 x 120 x 100", structure=False, mass_kg=0.65)
    m.solid("POWER_DISTRIBUTION", box(24, -75, zb + 20, 64, 75, zb + 120), tb, "pcb", "purchased", "-",
            "e-stop contactor, fuses, precharge, 48->12/5 V DC-DC", dims="40 x 150 x 100", structure=False, mass_kg=0.9)
    m.fast("M3x8 SHCS", 12)
    cb = Pl(rrect(-55, Z_SH - 185, 55, Z_SH - 125, 6), T4)
    for y in (-69, 69):
        cb.hole(y * 0.71, Z_SH - 165, 5.5, "m5")
    cb.bolt_circle(0, Z_SH - 150, 20, 2, 3.4)
    m.plate("chest_camera_plate", cb, "yz", 90.0, tb, grid=False)
    m.fast("M5x10 SHCS", 2)
    m.fast("M5 T-nut", 2)
    m.solid("CHEST_DEPTH_CAMERA", box(94, -45, Z_SH - 170, 120, 45, Z_SH - 140), tb, "sensor", "purchased", "-",
            "depth camera (RealSense D435i class)", dims="26 x 90 x 30", structure=False, mass_kg=0.10)
    m.solid("ESTOP_BUTTON", cyl(20, 30, (-85, 0, Z_TOP + T4), "z").fuse(cyl(11, 22, (-85, 0, Z_TOP - 18), "z")), tb,
            "estop", "purchased", "-", "22 mm twist-release e-stop (EAO 84 / Eaton M22-PVT), on the top plate",
            dims="dia 40", structure=False, mass_kg=0.06)
    S.actuator(m, "RS00", tb, (0, 0, Z_TOP + 1.0), (0, 0, 1))
    return zb


def neck_head():
    nb, hb = "neck_link", "head"
    zh0 = Z_TOP + 1.0
    m.solid("RS00_OUTPUT_HUB_8", ring(17, 6, 8, (0, 0, zh0), "z"), nb, "alu", "machined", "6061-T6",
            "machined 6061-T6 dia 34 x 8: 3 x dia 3.4 c'bored on PCD 27 to the RS00 output; 3 x M4 tapped on PCD 22",
            dims="dia 34 x 8")
    m.fast("M3x12 SHCS", 3)
    zbp = zh0 + 8.0
    bp = Pl(rrect(-40, -45, 40, 30, 8), T4)
    holes(bp, pcd_pts(0, 0, 22, 3, range(3), 90), 4.5)
    bp.bore(0, 0, 10)
    for x in (-20, 20):
        bp.hole(x, -33, 4.5, "m4")
    m.plate("neck_base_plate", bp, "xy", zbp, nb, grid=False)
    m.fast("M4x10 SHCS", 3)
    sp = Pl(rrect(-35, zbp + T4, 35, Z_NP + 40, 8), T4)
    holes(sp, pcd_pts(0, Z_NP, 38, 4, (0, 1, 2), 45), 3.4)
    sp.bore(0, Z_NP, 10)
    for x in (-20, 20):
        sp.tslot(x, zbp + T4)
    m.plate("neck_side_plate", sp, "xz", -31.0 - T4, nb)
    m.fast("M4x12 SHCS", 2)
    m.fast("M4 square nut", 2)
    m.fast("M3x8 SHCS", 3)
    S.actuator(m, "RS00", nb, (0, 20.0, Z_NP), (0, 1, 0))
    m.solid("RS00_OUTPUT_SPACER_3", ring(17, 6, 3, (0, 20.0, Z_NP), "y"), hb, "alu", "machined", "6061-T6",
            "6061 spacer dia 34 x 3 with the RS00 output pattern", dims="dia 34 x 3")
    m.fast("M3x10 SHCS", 3)
    yh0 = 23.0
    zt = Z_HEAD_TOP - T4
    hs = Pl(hull_shapes(circles=[(0, Z_NP, 30)], rects=[(-50, Z_NP + 45, 90, zt)]), T4)
    holes(hs, pcd_pts(0, Z_NP, 27, 6, (0, 2, 4)), 3.4)
    hs.bore(0, Z_NP, 12)
    for x in (-20, 50):
        hs.tslot(x, zt)
    for z in (Z_NP + 85, Z_NP + 160):
        hs.tslot(90, z)
    m.plate("head_side_plate", hs, "xz", yh0, hb)
    hf = Pl(rrect(-60, Z_NP + 45, yh0 + T4 + 8, zt, 8), T4)
    for z in (Z_NP + 85, Z_NP + 160):
        hf.hole(yh0 + T4 / 2, z, 4.5, "m4")
    for y in (-40, 0):
        hf.tslot(y, zt)
    m.plate("head_front_plate", hf, "yz", 90.0, hb, note="cameras bolt to the grid")
    ht = Pl(rrect(-50, -60, 102, yh0 + T4 + 8, 10), T4)
    for x in (-20, 50):
        ht.hole(x, yh0 + T4 / 2, 4.5, "m4")
    for y in (-40, 0):
        ht.hole(90 + T4 / 2, y, 4.5, "m4")
    m.plate("head_top_plate", ht, "xy", zt, hb)
    m.fast("M4x12 SHCS", 8)
    m.fast("M4 square nut", 8)
    m.solid("HEAD_DEPTH_CAMERA", box(94, -55, Z_NP + 60, 120, 35, Z_NP + 90), hb, "sensor", "purchased", "-",
            "head depth camera + wide camera", dims="26 x 90 x 30", structure=False, mass_kg=0.25)
    m.solid("HEAD_AUDIO_LED_BOARD", box(40, -50, Z_NP + 130, 88, 15, Z_NP + 150), hb, "pcb", "purchased", "-",
            "mic, speaker amp, status LEDs", dims="48 x 65 x 20", structure=False, mass_kg=0.15)
    m.fast("M3x8 SHCS", 8)


# =========================================================================================== left arm + gripper
def arm():
    shb, uab, uarb, fab, farb, wb, hb = ("l_shoulder", "l_upper_arm_a", "l_upper_arm", "l_forearm_a", "l_forearm",
                                         "l_wrist", "l_hand")
    TA = T4
    # shoulder pitch RS04: rear-mounted on the torso shoulder plate, output +y
    y_rear = 79.0 + T5
    m.force_mirror = True
    S.actuator(m, "RS04", "torso", (0, y_rear + 39.5, Z_SH), (0, 1, 0))
    m.force_mirror = False
    m.fast("M4x12 SHCS", RS04_STATOR_N)
    y_out = y_rear + 39.5
    yA = S.output_spacer(m, "RS04_OUTPUT_SPACER_6", shb, (0, y_out, Z_SH), (0, 1, 0), 6.0)[1]
    pa = Pl(hull_shapes(circles=[(0, Z_SH, 42)], rects=[(-112, Z_SH - 52, -60, Z_SH + 52)]), TA)
    holes(pa, pcd_pts(0, Z_SH, 36, 9, RS04_OUT6), 5.5)
    pa.bore(0, Z_SH, 12)
    pa.keep(0, Z_SH, 31)
    for z in (Z_SH - 35, Z_SH + 35):
        pa.hole(-102, z, 4.5, "m4")
    m.plate("shoulder_pitch_plate", pa, "xz", yA, shb)
    m.fast("M5x20 SHCS", 6)
    pb = Pl(hull_shapes(circles=[(SH_Y, Z_SH, 61.5)], rects=[(yA + TA, Z_SH - 50, 150, Z_SH + 50)]), TA)
    pb.bore(SH_Y, Z_SH, 96)
    holes(pb, pcd_pts(SH_Y, Z_SH, 106, 10, range(0, 10, 2), a0=18), 4.5)
    pb.keep(SH_Y, Z_SH, 60)
    for z in (Z_SH - 35, Z_SH + 35):
        pb.tslot(yA + TA, z)
    m.plate("shoulder_roll_plate", pb, "yz", -100.0 - TA, shb)
    m.fast("M4x12 SHCS", 2)
    m.fast("M4 square nut", 2)
    # shoulder roll RS04: axis x behind the shoulder, output +x
    S.actuator(m, "RS04", shb, (-60.5, SH_Y, Z_SH), (1, 0, 0))
    m.fast("M4x12 SHCS", RS04_STATOR_N)
    xC = S.output_spacer(m, "RS04_OUTPUT_SPACER_6", uab, (-60.5, SH_Y, Z_SH), (1, 0, 0), 6.0)[0]
    zD = Z_SH - 35.0                                  # plate D underside = RS03 rear lug face
    pc = Pl(hull_shapes(circles=[(SH_Y, Z_SH, Z_SH - zD - TA)], rects=[(SH_Y - 50, zD + TA, SH_Y + 50, zD + TA + 9)]), TA)
    holes(pc, pcd_pts(SH_Y, Z_SH, 36, 9, RS04_OUT6), 5.5)
    pc.bore(SH_Y, Z_SH, 12)
    pc.keep(SH_Y, Z_SH, 31)
    for yy in (SH_Y - 30, SH_Y + 30):
        pc.tslot(yy, zD + TA)
    m.plate("upper_arm_roll_plate", pc, "yz", xC, uab)
    m.fast("M5x20 SHCS", 6)
    pd = Pl(rrect(-58, SH_Y - 52, 58, SH_Y + 52, 10), TA)
    pd.bore(0, SH_Y, 81)
    holes(pd, pcd_pts(0, SH_Y, 98, 8, (1, 2, 5, 6), 22.5), 4.5)   # 4 of 8 lugs, clear of the roll plate
    pd.keep(0, SH_Y, 53)
    for yy in (SH_Y - 30, SH_Y + 30):
        pd.hole(xC + TA / 2, yy, 4.5, "m4")
    m.plate("upper_arm_yaw_plate", pd, "xy", zD, uab)
    m.fast("M4x12 SHCS", 4)
    m.fast("M4x12 SHCS", 2)
    m.fast("M4 square nut", 2)
    zE = zD - 42.0                                    # RS03 output face
    S.actuator(m, "RS03", uab, (0, SH_Y, zE), (0, 0, -1), lug_a0=22.5)
    pe = Pl(rrect(-32, SH_Y - 32, 32, SH_Y + 32, 6), TA)
    holes(pe, pcd_pts(0, SH_Y, 30.36, 6, (0, 2, 3, 5)), 4.5)
    pe.bore(0, SH_Y, 14)
    for dx in (-21, 21):
        for dy in (-21, 21):
            pe.hole(dx, SH_Y + dy, 4.5, "m4")
    m.plate("upper_arm_top_plate", pe, "xy", zE - TA, uarb, grid=False, pocket=False)
    m.fast("M4x10 SHCS", 4)
    m.fast("M4x30 SHCS", 4)
    S.clamp_block(m, "CLAMP_40_arm", uarb, (0, SH_Y, zE - TA - 16), (0, 0, 1), (1, 0, 0), 40, (56, 56, 32), printed=True)
    # elbow RS03: rear lug face on plate F (outboard), output -y
    yF = 229.0
    S.actuator(m, "RS03", uarb, (0, yF - 42.0, Z_ELB), (0, -1, 0))
    pf = Pl(hull_shapes(circles=[(0, Z_ELB, 56)], rects=[(-30, Z_ELB + 60, 30, Z_ELB + 96)]), TA)
    pf.bore(0, Z_ELB, 81)
    holes(pf, pcd_pts(0, Z_ELB, 98, 8, (0, 2, 4, 6)), 4.5)
    pf.keep(0, Z_ELB, 53)
    for dx in (-18, 18):
        for dz in (70, 86):
            pf.hole(dx, Z_ELB + dz, 4.5, "m4")
    m.plate("elbow_plate", pf, "xz", yF, uarb)
    m.fast("M4x12 SHCS", 4)
    m.fast("M4x25 SHCS", 4)
    S.clamp_block(m, "CLAMP_40_elbow", uarb, (0, SH_Y, Z_ELB + 78), (0, 0, 1), (1, 0, 0), 40, (56, 2 * (yF - SH_Y), 36),
                  printed=True)
    S.tube(m, "TUBE_40x3_upper_arm", uarb, (0, SH_Y, Z_ELB + 68), (0, SH_Y, zE - TA - 2), 40, 3)
    # forearm_a: plate G on the elbow output, two legs straddling the wrist-yaw RS02's rear boss down to plate H.
    # The wrist-yaw RS02 sits below the hip-yaw bearing ring (it would hit the hip-yaw RS04 and the pelvis plate at
    # elbow height): rear face at the hip centre + 89 mm.
    yG = yF - 42.0
    zH = Z_HIP + 89.0
    zb = zH + TA
    pg_out = L.union_outline([L.circle_pts(0, Z_ELB, 40, 48), L.strap((0, Z_ELB), (-46, zb + 14), 22),
                              L.strap((0, Z_ELB), (46, zb + 14), 22),
                              np.array([(-57, zb), (-35, zb), (-35, zb + 24), (-57, zb + 24)]),
                              np.array([(35, zb), (57, zb), (57, zb + 24), (35, zb + 24)])], fillet=4)
    pg = Pl(pg_out, TA)
    holes(pg, pcd_pts(0, Z_ELB, 30.36, 6, (0, 2, 3, 5)), 4.5)
    pg.bore(0, Z_ELB, 14)
    pg.keep(0, Z_ELB, 22)
    for x in (-46, 46):
        pg.tslot(x, zb)
    m.plate("forearm_elbow_plate", pg, "xz", yG - TA, fab)
    m.fast("M4x10 SHCS", 4)
    ph = Pl(rrect(-64, SH_Y - 44, 64, SH_Y + 44, 8), TA)
    ph.bore(0, SH_Y, 66)
    holes(ph, pcd_pts(0, SH_Y, 73, 6, (0, 2, 4), 30), 3.4)
    ph.keep(0, SH_Y, 41)
    for x in (-46, 46):
        ph.hole(x, yG - TA / 2, 4.5, "m4")
    m.plate("wrist_yaw_plate", ph, "xy", zH, fab)
    m.fast("M3x8 SHCS", 3)
    m.fast("M4x12 SHCS", 2)
    m.fast("M4 square nut", 2)
    zI = zH - 30.5                                    # RS02 output face
    S.actuator(m, "RS02", fab, (0, SH_Y, zI), (0, 0, -1))
    # forearm: the span between the two RS02s is ~70 mm, too short for a tube: an L-bracket of two 4 mm plates
    yJ = 225.0
    pi_ = Pl(rrect(-30, SH_Y - 28, 30, yJ + TA + 8, 6), TA)
    holes(pi_, pcd_pts(0, SH_Y, 24, 6, (0, 2, 4)), 4.5)
    pi_.bore(0, SH_Y, 10)
    for x in (-18, 18):
        pi_.hole(x, yJ + TA / 2, 4.5, "m4")
    m.plate("forearm_top_plate", pi_, "xy", zI - TA, farb, grid=False, pocket=False)
    m.fast("M4x10 SHCS", 3)
    m.fast("M4x12 SHCS", 2)
    m.fast("M4 square nut", 2)
    S.actuator(m, "RS02", farb, (0, yJ - 30.5, Z_WP), (0, -1, 0))
    pj = Pl(hull_shapes(circles=[(0, Z_WP, 44)], rects=[(-30, Z_WP + 30, 30, zI - TA)]), TA)
    pj.bore(0, Z_WP, 66)
    holes(pj, pcd_pts(0, Z_WP, 73, 6, (0, 2, 4)), 3.4)
    pj.keep(0, Z_WP, 41)
    for x in (-18, 18):
        pj.tslot(x, zI - TA)
    m.plate("wrist_pitch_plate", pj, "xz", yJ, farb, note="forearm: length set by this plate")
    m.fast("M3x8 SHCS", 3)
    # wrist: plate K on the RS02 output, plate L + ISO 9409-1-50-4-M6 flange
    yK = yJ - 30.5 - TA
    zL = Z_WP - 54.0
    pk = Pl(hull_shapes(circles=[(0, Z_WP, 32)], rects=[(-32, zL + TA, 32, zL + TA + 8)]), TA)
    holes(pk, pcd_pts(0, Z_WP, 24, 6, (0, 2, 4)), 4.5)
    pk.bore(0, Z_WP, 10)
    pk.keep(0, Z_WP, 20)
    for x in (-20, 20):
        pk.tslot(x, zL + TA)
    m.plate("wrist_output_plate", pk, "xz", yK, wb)
    m.fast("M4x10 SHCS", 3)
    pl = Pl(rrect(-34, SH_Y - 30, 34, SH_Y + 30, 6), TA)
    holes(pl, pcd_pts(0, SH_Y, 40, 4, range(4), 45), 4.5)
    pl.bore(0, SH_Y, 10)
    for x in (-20, 20):
        pl.hole(x, yK + TA / 2, 4.5, "m4")
    m.plate("tool_flange_plate", pl, "xy", zL, wb, grid=False, pocket=False)
    m.fast("M4x12 SHCS", 6)
    m.fast("M4 square nut", 2)
    fl = ring(30, 15.75, 8, (0, SH_Y, zL - 8), "z")
    m.solid("ISO9409_50_4_M6_FLANGE", fl, wb, "alu", "machined", "6061-T6",
            "machined 6061-T6 dia 60 x 8, ISO 9409-1-50-4-M6: 4 x M6 on PCD 50, dia 31.5 H7 x 6 recess, 1 x dia 6 H7 "
            "dowel on PCD 50; 4 x M4 c'bored on PCD 40 to the flange plate", dims="dia 60 x 8")
    # gripper: RS00 (axis z) under the base plate, m1 20T pinion between two racks, jaws on two dia 8 rods
    zg = zL - 8.0 - TA                                # gripper base plate underside
    gb = Pl(rrect(-84, SH_Y - 28, 84, SH_Y + 28, 6), TA)
    gb.bolt_circle(0, SH_Y, 50, 4, 6.6, a0=45)       # ISO 9409-1-50-4-M6
    holes(gb, pcd_pts(0, SH_Y, 38, 4, (0, 1, 2), 0), 3.4)
    gb.bore(0, SH_Y, 10)
    for x in (-74, 74):
        for dy in (-10, 10):
            gb.hole(x, SH_Y + dy, 4.5, "m4")
    m.plate("gripper_base_plate", gb, "xy", zg, hb, grid=False, structure=False)
    m.solid("ISO9409_TOOL_SPIGOT", ring(15.75, 5, 6, (0, SH_Y, zg + TA), "z"), hb,
            "alu", "machined", "6061-T6", "6061 disc dia 31.5 h7 x 6 locating the gripper in the flange recess, 2 x M3",
            dims="dia 31.5 x 6", structure=False)
    m.fast("M6x12 SHCS (gripper)", 4)
    m.fast("M3x8 SHCS (gripper)", 5)
    S.actuator(m, "RS00", hb, (0, SH_Y, zg - 51.0), (0, 0, -1))
    zp = zg - 51.0                                    # RS00 output face
    m.solid("GRIPPER_PINION_M1_20T", cyl(17, 3, (0, SH_Y, zp), "-z").fuse(cyl(11, 10, (0, SH_Y, zp - 3), "-z")), hb,
            "steel", "purchased", "steel", "module 1, 20 teeth spur pinion with a dia 34 flange drilled to the RS00 output "
            "(3 x M3 PCD 27)", dims="dia 34 x 13", structure=False, mass_kg=0.03)
    zrk = zp - 13.0                                   # rack bottom
    zrod = zrk - 14.0
    for xc, ys in ((-30.0, 1), (30.0, -1)):
        yr0 = SH_Y + 11 if ys > 0 else SH_Y - 19
        m.solid("GRIPPER_RACK_M1", box(-70 if xc < 0 else 0, yr0, zrk, 0 if xc < 0 else 70, yr0 + 8, zrk + 10), hb,
                "steel", "purchased", "steel", "module 1 steel rack 8 x 10 x 70", dims="8 x 10 x 70",
                structure=False, mass_kg=0.04)
        jaw = box(xc - 12, SH_Y - 26, zrod - 10, xc + 12, SH_Y + 26, zrk)
        jaw = jaw.fuse(box(xc - 6, SH_Y - 25, zrod - 70, xc + 6, SH_Y + 25, zrod - 10))
        for dy in (-18, 18):
            jaw = jaw.cut(cyl(7.5, 30, (xc - 15, SH_Y + dy, zrod), "x"))
        m.solid("GRIPPER_JAW", jaw, hb, "print", "printed", "PA12-CF",
                "printed PA12-CF jaw: 2 x LM8UU pockets, rack screwed on top, 2 mm TPU pad on the finger",
                dims="24 x 52 x 83", structure=False)
    for x0 in (-76.0, 76.0 - TA):
        ep = Pl(rrect(SH_Y - 28, zrod - 16, SH_Y + 28, zg, 6), TA)
        for dy in (-18, 18):
            ep.hole(SH_Y + dy, zrod, 8.0, "rod")
        for dy in (-10, 10):
            ep.tslot(SH_Y + dy, zg)
        m.plate("gripper_end_plate", ep, "yz", x0, hb, grid=False, structure=False, pocket=False)
    m.fast("M4x12 SHCS (gripper)", 4)
    m.fast("M4 square nut (gripper)", 4)
    for dy in (-18, 18):
        m.solid("GRIPPER_GUIDE_ROD_8", cyl(4, 152, (-76, SH_Y + dy, zrod), "x"), hb, "steel", "purchased", "steel",
                "dia 8 h6 linear rod x 152, M4 tapped ends", dims="dia 8 x 152", structure=False, mass_kg=0.06)
    m.fast("LM8UU linear bearing", 4)


# =========================================================================================== exports
COLOURS = {   # flat colours per part type (renders and assembly STEP)
    "act": (0.20, 0.21, 0.23), "alu": (0.78, 0.80, 0.83), "print": (0.96, 0.50, 0.10), "belt": (0.02, 0.02, 0.02),
    "steel": (0.42, 0.46, 0.54), "rubber": (0.30, 0.20, 0.14), "batt": (0.15, 0.35, 0.80), "pcb": (0.10, 0.50, 0.25),
    "sensor": (0.35, 0.20, 0.50), "estop": (0.85, 0.08, 0.08),
}
# steel ISO 4762 socket heads: head mass + shank per mm (g); nuts and inserts each (g)
FAST_HEAD = {3: 0.35, 4: 0.80, 5: 1.40, 6: 2.40, 8: 5.20}
FAST_SHANK = {3: 0.047, 4: 0.084, 5: 0.131, 6: 0.189, 8: 0.335}
FAST_NUT = {"ISO 7379 shoulder screw d8": 12.0, "M3 Nylock": 0.4, "M4 Nylock": 0.8, "M5 Nylock": 1.4, "M6 Nylock": 2.3, "M8 Nylock": 4.3,
            "M4 square": 0.7, "M5 square": 1.1, "M5 T-nut": 2.5, "M8 jam": 2.6, "igus": 1.5, "LM8UU": 9.0}
MANUFACTURED = ("plate", "machined", "printed", "extrusion", "tube", "rod")


def fastener_mass_g(spec):
    import re
    for k, g in FAST_NUT.items():
        if spec.startswith(k):
            return g
    mm = re.match(r"M(\d+)x(\d+)", spec)
    if mm:
        d, Lf = int(mm.group(1)), int(mm.group(2))
        g = FAST_HEAD[d] + FAST_SHANK[d] * Lf
        if "low head" in spec:
            g -= 0.3 * FAST_HEAD[d]
        if "washer" in spec:
            g += 1.5
        if "shoulder" in spec:
            g *= 1.15
        return g
    return 3.0


def structural_fastener(spec):
    return "(gripper)" not in spec and "LM8UU" not in spec


def write_stl(path, verts, tris):
    v = np.asarray(verts, np.float32)
    t = np.asarray(tris, np.int64)
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    n = np.cross(b - a, c - a)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(t), dtype=[("n", "<f4", 3), ("a", "<f4", 3), ("b", "<f4", 3), ("c", "<f4", 3), ("x", "<u2")])
    rec["n"], rec["a"], rec["b"], rec["c"] = n, a, b, c
    with open(path, "wb") as f:
        f.write(b"KESTREL S1".ljust(80, b" "))
        f.write(np.uint32(len(t)).tobytes())
        f.write(rec.tobytes())


def tess(shape, tol=0.35, ang=0.35):
    vs, ts = shape.tessellate(tol, ang)
    return np.array([(p.x, p.y, p.z) for p in vs], float), np.array(ts, int)


def variant_structure():
    """Structure mass per body as originally estimated in variant_s1.py (before its CAD_STRUCTURE_KG override, which
    feeds this CAD's masses back into the model)."""
    import importlib
    V = importlib.import_module("kestrel.variant_s1")
    saved = getattr(V, "CAD_STRUCTURE_KG", None)
    try:
        if saved is not None:
            V.CAD_STRUCTURE_KG = {}
        bodies = P.build_bodies()
    finally:
        if saved is not None:
            V.CAD_STRUCTURE_KG = saved
    return {b.name: sum(c.mass for c in b.comps if c.cat == "structure") for b in bodies}


def joint_requirement(name):
    """Repeated and momentary joint-side torque from simple/generated/joint_requirements.md."""
    import re
    f = HERE.parent / "generated" / "joint_requirements.md"
    for line in f.read_text().splitlines():
        if line.startswith(f"| {name} |"):
            nums = [float(x) for x in re.findall(r"([0-9.]+) N·m", line)]
            return nums[1], nums[2]
    return None


def interference(insts, min_vol=2.0):
    """Static interference check in the zero pose: boolean common of every pair with overlapping boxes."""
    boxes = []
    for it in insts:
        bb = it.shape.BoundingBox()
        boxes.append((bb.xmin, bb.ymin, bb.zmin, bb.xmax, bb.ymax, bb.zmax))
    B = np.array(boxes)
    hits = []
    n = len(insts)
    for i in range(n):
        lo = np.maximum(B[i, :3], B[i + 1:, :3])
        hi = np.minimum(B[i, 3:], B[i + 1:, 3:])
        cand = np.where(np.all(hi - lo > 0.3, axis=1))[0] + i + 1
        for j in cand:
            try:
                v = insts[i].shape.intersect(insts[j].shape).Volume()
            except Exception:
                continue
            if v > min_vol:
                hits.append((v, insts[i], insts[j]))
    return sorted(hits, key=lambda h: -h[0])


def export(info, quick=False, check=False):
    for sub in ("step", "dxf", "stl", "render"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    for f in (OUT / "dxf").glob("*.dxf"):
        f.unlink()
    for f in (OUT / "render").glob("*.stl"):
        f.unlink()
    qty = m.qty()
    # --- DXF (every laser-cut plate, one file per part number, quantity in the name)
    for name, d in sorted(m.defs.items()):
        if d.kind == "plate":
            d.plate.write_dxf(str(OUT / "dxf" / f"{name}_qty{qty[name]}.dxf"))
    # --- STEP + STL of every manufactured part, assembly STEP + STL
    if not quick:
        for f in (OUT / "step").glob("*.step"):
            f.unlink()
        for f in (OUT / "stl").glob("*.stl"):
            f.unlink()
        for name, d in sorted(m.defs.items()):
            if d.kind in MANUFACTURED:
                cq.exporters.export(cq.Workplane().add(d.shape), str(OUT / "step" / f"{name}.step"))
                v, t = tess(d.shape, 0.1, 0.2)
                write_stl(OUT / "stl" / f"{name}.stl", v, t)
        assy = cq.Assembly(name="kestrel_s1")
        for i, it in enumerate(m.inst):
            col = cq.Color(*COLOURS[it.cat], 1.0)
            assy.add(it.shape, name=f"{it.body}__{it.name}__{i}", color=col)
        assy.save(str(OUT / "step" / "kestrel_s1_assembly.step"))
    # --- render meshes grouped by (body, colour) + whole-robot STL
    groups = {}
    allv, allt, off = [], [], 0
    for it in m.inst:
        v, t = tess(it.shape)
        if len(t) == 0:
            continue
        g = groups.setdefault((it.body, it.cat), ([], [], [0]))
        g[0].append(v)
        g[1].append(t + g[2][0])
        g[2][0] += len(v)
        allv.append(v)
        allt.append(t + off)
        off += len(v)
    manifest = []
    for (body, cat), (vs, ts, _) in groups.items():
        fn = f"{body}__{cat}.stl"
        write_stl(OUT / "render" / fn, np.vstack(vs), np.vstack(ts))
        manifest.append(dict(file=fn, body=body, cat=cat, rgb=COLOURS[cat], origin=JT[body]["pos"].tolist(),
                             parent=JT[body]["parent"]))
    (OUT / "render" / "manifest.json").write_text(json.dumps(manifest, indent=1))
    if not quick:
        write_stl(OUT / "stl" / "kestrel_s1_assembly.stl", np.vstack(allv), np.vstack(allt))
    hits = interference(m.inst) if check else None
    report(info, qty, hits)


def hand_calcs(info):
    """Section 0 of the cut list: quick hand calcs behind the plate thicknesses, bolt counts and bearings."""
    E_AL, SY_6061, SY_7075 = 69000.0, 276.0, 500.0
    pre = {4: 7.8, 5: 11.0, 6: 16.0}                   # kN, class 12.9 assembly preload (~70 % proof)
    mu = 0.15
    rq = joint_requirement("knee") or (277.0, 332.0)
    t_rep, t_mom = rq[0] / 1.5 / 0.95, rq[1] / 1.5 / 0.95
    r32 = S.htd_pd(KZ1) / 2                            # driver pitch radius (36T 8MGT)
    T1r, T1m = t_rep / r32, t_mom / r32                 # kN (N m / mm)
    F_shaft = T1m + 0.3
    knee_peak = 320 * 1.5 * 0.95
    cheek_net = 2 * 2 * 8 * T5
    I_ks = math.pi * (25 ** 4 - 15 ** 4) / 64
    Z_ks = I_ks / 12.5
    M_ks = 0.67 * F_shaft * 23.5                        # N m: share on the pulley bearing x lever to the inner cheek
    f48 = 6 * pre[5] * mu * 27 + 2 * (math.pi * 2.5 ** 2) * 300 / 1000 * 27
    lines = []
    w = lines.append
    w("## 0. Hand calculations (sizing the plates, bolts and bearings)\n")
    w("Materials: 6061-T6 yield 276 MPa (fatigue ~96 MPa at 5e8), 7075-T6 yield 500 MPa. Bolts 12.9, assembly "
      "preload M4 7.8 kN / M5 11 kN / M6 16 kN, friction 0.15. Dynamic leg load 2.5 kN (3.5 g on one leg) unless "
      "stated. Webs = the 8 mm edge strips left by the pocketing.\n")
    w(f"**0.1 Knee belt reaction** (1.5:1, {KZ1}T 8MGT on the X12, {KZ2}T on the shank, {KBELT_W:.0f} mm Poly Chain)\n")
    w(f"- Joint requirement {rq[0]:.0f} N·m repeated / {rq[1]:.0f} N·m momentary (joint_requirements.md) -> actuator "
      f"side {t_rep:.0f} / {t_mom:.0f} N·m at eta 0.95.")
    w(f"- Tight side T1 = tau / r({KZ1}T = {r32:.2f} mm) = **{T1r:.2f} / {T1m:.2f} kN**; slack side ~0.3 kN "
      f"(installation tension) -> {F_shaft:.1f} kN on the pulley shafts.")
    w(f"- {KZ1}T pulley: shared by the X12 crossed-roller (5 kN radial rating) and the 6908 in the inner cheek "
      f"(C0 10 kN), lever arms ~25 mm each side -> ~{F_shaft / 2:.1f} kN each: 6908 static SF {10 / (F_shaft / 2):.1f}.")
    w(f"- Thigh cheeks in tension between the knee-X12 axis and the knee shaft: {F_shaft:.1f} kN over 4 edge webs "
      f"8 x {T5:.0f} mm = {cheek_net:.0f} mm^2 -> **{F_shaft * 1000 / cheek_net:.0f} MPa** (SF "
      f"{SY_6061 / (F_shaft * 1000 / cheek_net):.0f} on yield).")
    w(f"- Knee shaft 7075 tube dia 25/15: {M_ks:.0f} N·m at the inner cheek -> {M_ks * 1000 / Z_ks:.0f} MPa "
      f"(SF {SY_7075 / (M_ks * 1000 / Z_ks):.1f}). {KZ2}T pulley bearings 2 x 6905 (C0 2 x 4.3 kN).")
    w(f"- {KZ2}T pulley to the inner calf plate: knee peak {knee_peak:.0f} N·m (X12 320 N·m x 1.5 x 0.95); 6 x M5 "
      f"friction on PCD 54 + 2 x dia 5 dowels in shear = {f48:.0f} N·m (SF {f48 / knee_peak:.2f}).")
    w(f"- {KZ1}T pulley to the X12: 6 x M5 low-head on PCD 72 friction {6 * pre[5] * mu * 36:.0f} N·m vs {t_mom:.0f} "
      f"N·m (SF {6 * pre[5] * mu * 36 / t_mom:.1f}).")
    w(f"- **Belt:** {KBELT_W:.0f} mm Poly Chain 8MGT; allowable to be confirmed in Gates DesignFlex Pro against "
      f">= {t_mom * 1.4:.0f} N·m (momentary x SF 1.4) on the {KZ1}-groove sprocket - section 6. The 30 mm HTD-8M it "
      f"replaces (~1.3-1.6 kN working tension) was ~4x over.\n")
    Ix = 2 * 8 * T5 * 56 ** 2
    Zc = Ix / 60
    w("**0.2 Hip pitch, 320 N·m (X12 peak)**\n")
    w(f"- Stator: 8 of 16 x M4 on PCD 116.5 -> friction {8 * pre[4] * mu * 58.25:.0f} N·m (SF "
      f"{8 * pre[4] * mu * 58.25 / 320:.1f}) plus the dia 109 pilot in the 6 mm adapter for shear.")
    w(f"- Output -> outer cheek: 8 of 12 x M5 on PCD 72 -> {8 * pre[5] * mu * 36:.0f} N·m (SF "
      f"{8 * pre[5] * mu * 36 / 320:.1f}); add the 3 x dia 4 dowels drilled from the part.")
    w(f"- Outer cheek bending just below the flange, one cheek taking all of it before the ties share it: edge webs 8 x "
      f"{T5:.0f} mm at +-56 mm, Z = {Zc:.0f} mm^3 -> **{320e3 / Zc:.0f} MPa** (both cheeks: {160e3 / Zc:.0f} MPa).")
    w(f"- Cradle -> roll trunnions: couple 320 / 0.166 m = {320 / 0.166 / 1000:.2f} kN per 6905 (C0 4.3 kN, SF "
      f"{4.3 / (320 / 0.166 / 1000):.1f}); 7075 stub dia 25/15, 12 mm overhang -> "
      f"{320 / 0.166 * 12 / (math.pi * (25 ** 4 - 15 ** 4) / 32 / 25):.0f} MPa.")
    Zt = 90 * T6 ** 2 / 6
    w(f"- Yaw top plate (the whole leg hangs from it): 2.5 kN on two arms at x = +-83, hub edge r 30 -> 1.25 kN x 53 mm "
      f"= 66 N·m on 6 x 90 mm solid, Z = {Zt:.0f} mm^3 -> **{66e3 / Zt:.0f} MPa** at the 3.5 g peak (35 MPa at 1 g): "
      "left solid (grid only), the one leg plate that must not be pocketed.\n")
    I14 = math.pi * (14 ** 4 - 10 ** 4) / 64
    I12 = math.pi * (12 ** 4 - 8 ** 4) / 64
    La = Z_KNEE - 95.0 - Z_ANK
    Lb = Z_KNEE - 225.0 - Z_ANK
    Pa = math.pi ** 2 * E_AL * I14 / La ** 2 / 1000
    Pb = math.pi ** 2 * E_AL * I12 / Lb ** 2 / 1000
    ra = joint_requirement("ankle_pitch")
    w(f"**0.3 Ankle push-rods** (2 x RS04, {R_C:.0f} mm cranks, {R_P:.0f} mm foot levers = {R_ANKLE:.2f}:1)\n")
    w(f"- Rod force = actuator torque / 40 mm: RS04 peak 120 N·m -> **3.0 kN**; actuator-side requirement 73 N·m "
      f"repeated / 117 N·m momentary (actuator_selection.md, earlier pass) -> 1.8 / 2.9 kN. Joint side {ra[0]:.0f} / "
      f"{ra[1]:.0f} N·m pitch (both rods pushing on {R_P:.0f} mm levers)." if ra else "- Rod force = 120 N·m / 40 mm = 3.0 kN.")
    w(f"- Rod A (pin-pin {La:.0f} mm), 6061 tube dia 14 x 2: 40 MPa; Euler {Pa:.1f} kN -> SF {Pa / 3.0:.1f}. "
      f"Rod B ({Lb:.0f} mm) dia 12 x 2: Euler {Pb:.1f} kN.")
    w("- M8 rod ends (PHSA 8 class, static radial > 10 kN) on dia 8 ISO 7379 shoulder screws: 3 kN / 50 mm^2 = 60 MPa "
      "shear. Pin bearing in the 5 mm foot rail: 3 kN / (8 x 5) = 75 MPa (6061 bearing yield ~390).")
    w(f"- Crank 6 mm: 3 kN x 13 mm = 39 N·m at the hub edge, section 6 x 30 -> 43 MPa; 6 x M5 + the 3 RS04 pins: "
      f"{6 * pre[5] * mu * 18:.0f} N·m friction vs 120 N·m.")
    w(f"- Hip-roll rod: 120 N·m / 35 mm = 3.4 kN on an 80 mm rod (no buckling case); the lever carries 2 x 120 = 240 "
      "N·m into the 7075 shaft: 90 MPa in the dia 25/15 section.\n")
    w("**0.4 Plate thickness by load**\n")
    w(f"- Calf plates 4 mm: axial 3 kN on 4 webs 8 x 4 = 128 mm^2 -> 23 MPa; 750 N fore-aft foot force at mid-shank "
      f"(190 N·m) on webs at +-54 mm of both plates (I = {4 * 32 * 54 ** 2:.0f} mm^4) -> "
      f"{190e3 * 58 / (4 * 32 * 54 ** 2):.0f} MPa; ankle pivots iglide 16 x 4 mm: 1.5 kN / 64 mm^2 = 23 MPa (limit 80).")
    w("- Thigh cheeks 5 mm: 4 mm would pass the strength checks above (49 MPa belt tension, 104 MPa one-cheek "
      "bending), but the belt centre distance and the X12 output need the stiffness, so 5 mm.")
    w("- Torso base plate 6 mm: upper body 35 kg x 3 g over 4 uprights = 260 N at 90 mm from the hub -> 23 N·m on a "
      "60 mm strip: 65 MPa at 6 mm, 146 MPa at 4 mm. Shoulder plates 5 mm: arm + 5 kg load 100 N x 0.2 m out of "
      "plane on a 200 mm section -> 24 MPa static, ~72 MPa dynamic.")
    w("- 4 mm elsewhere (arms, head, neck, top/electronics/tray/camera plates, gripper): loads under 70 N·m in "
      "plane; T-slot joints in 4 mm plates use M4 + DIN 562 M4 nuts.\n")
    return lines


def design_notes(info, struct_total, est_total):
    rq = joint_requirement("knee") or (277.0, 332.0)
    T1m = rq[1] / 1.5 / 0.95 / (S.htd_pd(KZ1) / 2)
    lines = ["\n## 12. Design notes: problems found\n"]
    w = lines.append
    w(f"1. **Knee belt (fixed after review).** The specified 30 mm HTD-8M was ~4x overloaded. Now Gates Poly Chain "
      f"Carbon Volt / GT Carbon 8MGT, {KZ1}T:{KZ2}T, {KBELT_W:.0f} mm, belt 8MGTV-{info['belt']}: T1 {T1m:.1f} kN "
      "momentary. The thigh grew 6 mm (outer cheek at y_rel 59, the hanging arm still ~3 mm clear) and the cradle's X12 "
      "plate top dropped to zr 64 so it clears the yaw plate at +30 deg roll. The belt rating still has to be confirmed in "
      "Gates DesignFlex Pro (section 6); #50 chain 18T/27T is the fallback. K1's knee four-bar fails the continuous check "
      "with an X12 (lead's check: 0.61).")
    w("2. **Hip-roll 2:1 crank + push-rod toggles at about +-30 deg** (35 mm crank, 70 mm lever: the lever pin travels at "
      "most +-35 mm). The range is now -25..+30 deg in variant_s1.py; keep a soft limit a few degrees inside +30, where "
      "the effective ratio falls off.")
    w(f"3. **X12 output bolt circle vs the driver pulley.** PCD 72 sits just inside the {KZ1}T tooth root, so the pulley "
      "needs a 6.5 mm mounting web with counterbored DIN 7984 low-head screws in front of the teeth. Verify the X12 dowel "
      "positions before drilling.")
    w("4. **Hip yaw toe-out clash.** Both hip-roll RS04s sit behind the pelvis; if both legs toe out more than ~30 deg "
      "at the same time the actuators touch. Limit combined toe-out in software (walking uses < 15 deg).")
    w("5. **Deep hip flexion.** At -125 deg the knee X12 passes within a few mm of the front yoke arm and the pelvis "
      "4040; the range is now -120 deg in variant_s1.py.")
    w(f"6. **Ankle linkage.** Foot levers {R_P:.0f} mm ({R_ANKLE:.2f}:1 from the current actuator_family.json), cranks "
      f"{R_C:.0f} mm, roll pins at d = +-{D_ROLL:.0f} mm on the foot. The crank pins sit at +-{info['d_ankle']:.1f} mm "
      "because each RS04 (52.7 mm long) is between the calf plates, so the rods lean in by 1.3 deg (A) and 2.2 deg (B), "
      f"well inside the rod ends' +-13 deg. Ankle RS04 axes are {R_P - R_C:.0f} mm behind the shank line so the rods stay "
      "vertical in the side view.")
    if HIP_PITCH_RED != 1.0:
        w(f"6a. **Hip pitch reduction conflict.** The actuator selection regenerated at the CAD mass (design mass 76.4 kg) "
          f"now asks for hip pitch {HIP_PITCH_RED:.2f}:1. The CAD keeps the brief's direct X12 coaxial with the hip; a "
          "1.5:1 hip needs a second HTD/chain stage (X12 in the cradle above the hip, 48T on the hip axis, cradle about "
          "+60 mm taller) or a stronger direct actuator (X15-P20-450, 3.5 kg). Decide before cutting the hip plates.")
    w(f"7. **Foot {D['foot_w']:.0f} mm wide** (DIM): the side rails (foot levers) sit just outside the d = 36 mm rod ends.")
    w(f"8. **Mass.** CAD structure {struct_total:.2f} kg incl. fasteners vs the original {est_total:.2f} kg estimate "
      f"(+{(struct_total / est_total - 1) * 100:.0f} %). These per-body masses are now in calc/kestrel/variant_s1.py "
      "(CAD_STRUCTURE_KG); the re-run selection gives S1 66.9 kg estimated / 73.6 kg design with every class feasible, "
      "which needed the 1.25:1 ankle levers modelled here. The X12 datasheet mass is 2.37 kg vs 2.82 kg in "
      "actuator_family.json (1.8 kg of margin if the datasheet is right).")
    w("9. **RS04 outputs are only 0.5 mm proud** of the housing: every driven part sits on a 6 mm spacer ring and "
      "uses 6 of the 9 M5 holes with through-screws.")
    w("10. **First weight pass result:** 43.8 kg (6 mm plates everywhere, tubes + cheeks in the legs, solid pulleys) "
      "-> the current design. Remaining heavy items per leg: hip yoke + roll drive 1.1 kg (solid 6 mm yaw plate, "
      "61812, 2 x 6905), knee drive 0.9 kg (pulleys, belt, 6908, shaft), M8 rod ends 6 x 35 g.")
    return lines


def report(info, qty, hits):
    defs = m.defs
    struct_by_body = {}
    for it in m.inst:
        d = defs[it.name]
        if d.structure:
            struct_by_body[it.body] = struct_by_body.get(it.body, 0.0) + d.mass
    fast_kg = sum(n * fastener_mass_g(s) for s, n in m.fasteners.items() if structural_fastener(s)) / 1000
    fast_n = sum(n for s, n in m.fasteners.items() if structural_fastener(s))
    struct_cad = sum(struct_by_body.values())
    est = variant_structure()
    est_total = sum(est.values())
    act_mass = sum(defs[i.name].mass for i in m.inst if defs[i.name].kind == "actuator")
    lines = []
    w = lines.append
    w("# KESTREL S1 cut list and structure mass (generated)\n")
    w(f"Generated by `simple/cad/build_s1.py` from the parametric CadQuery model ({time.strftime('%Y-%m-%d')}). "
      "Do not edit by hand: change the model and re-run. Segment lengths and joint positions come from "
      "`calc/kestrel/params.py` with `KESTREL_VARIANT=s1` (same DIM as K1). Files: `out/dxf/` (one DXF per plate, "
      "quantity in the name), `out/step/` (every manufactured part + `kestrel_s1_assembly.step`), `out/stl/`.\n")
    w("Quantities are for the whole robot (left and right sides). Left and right plates are the same part "
      "turned over, so every DXF serves both sides.\n")
    # ---------------------------------------------------------------- mass
    w("## Structure mass from CAD\n")
    w("CAD volume x density (6061-T6 2700, steel 7850, PA12-CF 1100 kg/m^3); extrusions at the supplier's kg/m; "
      "bearings, rod ends and the belt at catalogue mass; fasteners counted by size below. Same scope as the "
      "'structure' components in `calc/kestrel/variant_s1.py` (frame, brackets, clamps, belt drive, push-rods, ankle "
      "cross, feet; not actuators, battery, electronics, harness or grippers).\n")
    w(f"| | Mass (kg) |\n|---|---|\n| Structure parts from CAD | {struct_cad:.2f} |\n| Fasteners (counted, "
      f"{fast_n} pcs, gripper excluded) | {fast_kg:.2f} |\n| **Structure total, CAD** | **{struct_cad + fast_kg:.2f}** |\n"
      f"| Structure estimate in variant_s1.py | {est_total:.2f} |\n| Difference | {struct_cad + fast_kg - est_total:+.2f} "
      f"({(struct_cad + fast_kg) / est_total * 100 - 100:+.0f} %) |\n| Actuators in the model (datasheet masses) | "
      f"{act_mass:.2f} |\n")
    w("Per body (CAD structure without fasteners vs the variant_s1.py estimate; targets from the weight review: "
      "structure <= 22 kg incl. fasteners, thigh <= 1.6 kg, shank <= 1.5 kg per leg without actuators):\n")
    w("| Body | CAD (kg) | Estimate (kg) | Delta | Target |\n|---|---|---|---|---|")
    for b in BODIES:
        if b.name.startswith("r_"):
            continue
        c, e = struct_by_body.get(b.name, 0.0), est.get(b.name, 0.0)
        tgt = {"l_thigh": "<= 1.60", "l_shank": "<= 1.50"}.get(b.name, "")
        if c or e:
            nm = b.name + (" (each side)" if b.name.startswith("l_") else "")
            w(f"| {nm} | {c:.2f} | {e:.2f} | {c - e:+.2f} | {tgt} |")
    groups = {"pelvis + waist": ["pelvis", "waist_link"], "torso": ["torso"], "neck + head": ["neck_link", "head"],
              "one arm (shoulder..wrist)": [n for n in struct_by_body if n.startswith("l_") and any(
                  k in n for k in ("shoulder", "upper_arm", "forearm", "wrist"))],
              "one leg (hip yaw..foot)": [n for n in struct_by_body if n.startswith("l_") and any(
                  k in n for k in ("hip", "thigh", "shank", "ankle", "foot"))]}
    w("\n| Group | CAD (kg) | Estimate (kg) |\n|---|---|---|")
    for g, names in groups.items():
        w(f"| {g} | {sum(struct_by_body.get(n, 0) for n in names):.2f} | {sum(est.get(n, 0) for n in names):.2f} |")
    w("")
    lines.extend(hand_calcs(info))
    # ---------------------------------------------------------------- plates
    w("## 1. Laser / waterjet-cut plates\n")
    w("6061-T6, 4, 5 or 6 mm by load (section 0), laser or waterjet cut from the DXF (layer CUT, mm). Pockets: the "
      "outline inset 8 mm, 8 mm round every hole and cut-out, 8 mm ribs on the 40 mm lines of the 20 mm grid with a "
      "dia 22 boss and a dia 5.5 hole at every node, so the plates still take M5 bolts on a 40 mm grid (20 mm in the "
      "solid areas). Solidity = net area / outline area. Ream bearing/bushing bores to H7 after cutting; holes marked "
      "dia 2.5 / 3.3 are M3 / M4 tap drills; T-slot notches take an M5 (M4 in 4 mm plates) screw + DIN 562 square nut. "
      "In Australia: Cut Fold Direct (instant quote; ask for 6061), O'Brien, Ferracut, or PCBWay/JLCCNC.\n")
    w("| Part | Qty | t (mm) | Overall (mm) | Solidity | Pockets | Mass each (kg) | DXF | Notes |\n"
      "|---|---|---|---|---|---|---|---|---|")
    plate_kg = 0.0
    for name, d in sorted(defs.items()):
        if d.kind == "plate":
            plate_kg += d.mass * qty[name]
            w(f"| {name} | {qty[name]} | {d.plate.thk:.0f} | {d.dims} | {d.plate.solidity() * 100:.0f} % | "
              f"{len(d.plate.pockets)} | {d.mass:.3f} | `{name}_qty{qty[name]}.dxf` | {d.note} |")
    np_ = sum(qty[n] for n, d in defs.items() if d.kind == "plate")
    w(f"\n{np_} plates, {sum(1 for d in defs.values() if d.kind == 'plate')} part numbers, {plate_kg:.2f} kg of plate.\n")
    # ---------------------------------------------------------------- tubes, extrusions, rods
    w("## 2. Tubes, extrusions and rods (cut to length)\n")
    w("| Part | Stock | Cut length (mm) | Qty | Total (mm) | Mass each (kg) |\n|---|---|---|---|---|---|")
    stock = {}
    for name, d in sorted(defs.items()):
        if d.kind in ("tube", "extrusion", "rod") or name.startswith("STANDOFF"):
            stk = d.process.split(",")[0]
            w(f"| {name} | {stk} | {d.length:.0f} | {qty[name]} | {d.length * qty[name]:.0f} | {d.mass:.3f} |")
            key = d.dims.split(" x ")[0] + (" x " + d.dims.split(" x ")[1] if d.kind == "tube" else "")
            stock[key] = stock.get(key, 0.0) + d.length * qty[name]
    w("\nOrder (add 10 % for saw kerf and squaring): " + ", ".join(f"{k}: {v / 1000:.2f} m" for k, v in stock.items()) + ".\n")
    w("Limb length: the upper arm is a dia 40 x 3 tube in two printed clamps, so it changes by cutting a new tube. The "
      "thigh and shank are pocketed cheek-plate pairs (one load path each, per the weight review), so they change by "
      "re-cutting four plates from the DXF plus a new belt (thigh) or new push-rods (shank); the forearm span between "
      "its two RS02s is ~70 mm, so it is a two-plate L-bracket.\n")
    # ---------------------------------------------------------------- clamp blocks + machined + printed
    w("## 3. Clamp blocks\n")
    w("| Part | Qty | Size (mm) | Make as |\n|---|---|---|---|")
    for name, d in sorted(defs.items()):
        if name.startswith("CLAMP"):
            w(f"| {name} | {qty[name]} | {d.dims} | {d.process} |")
    w("\nClamp blocks are only used on the upper arm (2 per arm, M5 clamp screws); the legs have no tubes.\n")
    w("## 4. Machined parts (lathe / mill)\n")
    w("| Part | Qty | Size | Material / description |\n|---|---|---|---|")
    for name, d in sorted(defs.items()):
        if d.kind == "machined" and not name.startswith("CLAMP") and not name.startswith("PULLEY"):
            w(f"| {name} | {qty[name]} | {d.dims} | {d.material}: {d.process} |")
    w("\n## 5. Printed parts\n")
    w("| Part | Qty | Size | Process |\n|---|---|---|---|")
    for name, d in sorted(defs.items()):
        if d.kind == "printed" and not name.startswith("CLAMP"):
            w(f"| {name} | {qty[name]} | {d.dims} | {d.process} |")
    # ---------------------------------------------------------------- belt drive
    Lp, C = info["belt"], info["C"]
    rq = joint_requirement("knee") or (277.0, 332.0)
    t_rep, t_mom = rq[0] / 1.5 / 0.95, rq[1] / 1.5 / 0.95
    r1 = S.htd_pd(KZ1) / 2
    T1r, T1m = t_rep / r1, t_mom / r1
    w(f"\n## 6. Knee belt drive (1.5:1, Gates Poly Chain 8MGT, {KBELT_W:.0f} mm)\n")
    w(f"| Item | Spec | Qty |\n|---|---|---|\n| Driver pulley | 8MGT **{KZ1} grooves** (pitch dia {S.htd_pd(KZ1):.2f} mm), "
      f"{KBELT_W:.0f} mm belt, lightened 6061 with a 6.5 mm mounting web: 6 x DIN 7984 M5x12 on the X12's PCD 72, dia 40 "
      f"boss into a 6908 in a slotted seat in the inner cheek | {qty[f'PULLEY_8MGT_{KZ1}T']} |\n| Knee pulley | 8MGT "
      f"**{KZ2} grooves** (pitch dia {S.htd_pd(KZ2):.2f} mm), lightened 6061, 2 x 6905-2RS on the fixed knee shaft, "
      f"6 x M5 + 2 dowels to the inner calf plate | {qty[f'PULLEY_8MGT_{KZ2}T']} |\n| Belt | **Gates Poly Chain Carbon "
      f"Volt 8MGTV-{Lp}-{KBELT_W:.0f}** ({Lp // 8} teeth; current successor of Poly Chain GT Carbon 8MGT-{Lp}-"
      f"{KBELT_W:.0f}; stock length per the Gates Carbon Volt brochure), centre distance {C:.1f} mm (knee X12 "
      f"{D['thigh'] - C:.0f} mm below the hip) | {qty['BELT_8MGT_36']} |\n| Tension | 6908 seat and X12 bulkhead both "
      "slotted +-3 mm along the thigh; BELT_TENSION_BLOCK with an M6 jack screw under the 6908 flange. Set the static "
      "tension with a Gates Sonic Tension Meter to the value Gates DesignFlex Pro gives for this drive, then clamp the "
      "3 housing screws and the 3 bulkhead through-bolts | - |\n")
    w(f"Ratio {KZ2}/{KZ1} = {KZ2 / KZ1:.2f}. Joint requirement (joint_requirements.md): knee {rq[0]:.0f} N·m repeated, "
      f"{rq[1]:.0f} N·m momentary -> actuator side {t_rep:.0f} / {t_mom:.0f} N·m at eta 0.95 -> tight-side tension "
      f"T1 = tau / {r1:.1f} mm = **{T1r:.2f} kN repeated / {T1m:.2f} kN momentary**; effective pull Te = T1 - T2 ~ "
      f"{T1r - 0.3:.1f} / {T1m - 0.3:.1f} kN.\n")
    w("**Allowable-tension check (VERIFY):** the Gates 8MGT rating tables (Poly Chain design manual / DesignFlex Pro) "
      "could not be retrieved in this session, so the belt is not yet verified. What Gates publishes (Carbon Volt "
      "brochure): 8MGT in 12/21/36/62 mm widths, tooth 3.4 mm, belt 5.9 mm, stock lengths 8MGTV-640 to 4480, and 'up to "
      "55 % more power at low speed than Poly Chain GT, 30 % more than Poly Chain GT2'. Pass criterion to check in "
      f"DesignFlex Pro: rated torque of the 8MGT-{KBELT_W:.0f} belt on a {KZ1}-groove sprocket at <= 125 rpm "
      f">= {t_mom:.0f} N·m x service factor 1.4 (shock loading) = **{t_mom * 1.4:.0f} N·m**, i.e. a rated effective pull "
      f">= {t_mom * 1.4 / r1:.1f} kN, and >= {t_rep * 1.4:.0f} N·m for the repeated case. If the 36 mm belt rates lower, "
      "use 62 mm (needs the thigh 26 mm wider) or the chain below.\n")
    p50 = 15.875
    n1, n2 = 18, 27
    pd1 = p50 / math.sin(math.pi / n1)
    pd2 = p50 / math.sin(math.pi / n2)
    links = 2 * C / p50 + (n1 + n2) / 2 + p50 * (n2 - n1) ** 2 / (4 * math.pi ** 2 * C)
    nl = int(2 * math.ceil(links / 2))
    T1c = t_mom / (pd1 / 2)
    w(f"**Fallback: ANSI #50 roller chain** (ISO 10A-1, 5/8 in pitch, roller width 3/8 in): **{n1}T driver / {n2}T knee "
      f"sprockets** (pitch dia {pd1:.1f} / {pd2:.1f} mm, ratio {n2 / n1:.2f}: the same envelope as the 8MGT pulleys), "
      f"{nl} links (exact length {links:.1f} pitches at C = {C:.1f} mm; take up the rest in the same slotted seat). "
      f"Tension {T1c:.1f} kN momentary vs 27.1 kN minimum ultimate (ANSI B29.1, 6,100 lbf) -> SF {27.1 / T1c:.1f}. Costs "
      "about 0.6 kg more per leg (chain ~1.0 kg/m), needs grease and a guard, and is single-strand 20 mm wide, so it fits "
      "inside the current thigh. Sprockets: hardened-tooth steel 18T/27T bored to the same X12 pattern and 6905 seats.\n")
    # ---------------------------------------------------------------- bearings etc.
    w("## 7. Bearings, bushings, rod ends, standoffs and purchased items\n")
    w("| Item | Spec | Qty |\n|---|---|---|")
    for name, d in sorted(defs.items()):
        if d.kind == "purchased" and d.cat not in ("pcb", "sensor", "batt", "estop"):
            w(f"| {name} | {d.process} ({d.dims}) | {qty[name]} |")
    w(f"| igus GFM-1214-06 | flange bushing 12 x 14 x 6, ankle roll (foot clevis) | "
      f"{m.fasteners['igus GFM-1214-06 flange bushing']} |")
    w(f"| igus GFM-1618 (iglide G300) | flange bushing 16 x 18, 4-5 mm long, ankle pitch (calf plates) | "
      f"{m.fasteners['igus GFM-1618 flange bushing']} |")
    w(f"| Hip X12 cooling fan | {defs['FAN_40x40x10_12V'].process} on HIP_FAN_BRACKET (section 1), 2 x STANDOFF_10 "
      f"to the cradle inner plate's 20 mm grid, blowing through a dia 38 window across the X12 housing | "
      f"{qty['FAN_40x40x10_12V']} |")
    w(f"| LM8UU | linear ball bushing, gripper jaws | {m.fasteners['LM8UU linear bearing']} |")
    w("\nSupport bearings opposite the leg actuator outputs: hip pitch (6808 on a 7075 stub from the cradle, in the "
      "inner cheek), knee X12 pulley (6908 in a slotted seat in the inner cheek), knee joint (2 x 6905 in the 54T pulley + 1 x 6905 in "
      "the outer calf plate, on a fixed 7075 shaft), hip yaw (61812 thin-section in a ring on the RS04 front face; the "
      "waist uses the same module), hip roll (2 x 6905 trunnions in the yoke arms), ankle drives (push-rods take no "
      "bending; ankle cross on iglide G300 flange bushings: 2 x 16 mm pitch, 2 x 12 mm roll).\n")
    # ---------------------------------------------------------------- actuators + adapter data
    w("## 8. Actuators and the adapter-plate bolt patterns\n")
    w("| Actuator | Qty | Mass each (kg) | Stator pattern used | Output pattern | Source |\n|---|---|---|---|---|---|")
    for key, a in S.ACTUATORS.items():
        n = qty.get(f"ACT_{key}", 0)
        st, op = a["stator"], a["output"]
        w(f"| {a['model']} | {n} | {a['mass']} | {st['n']} x {st['thread']} (depth {st['depth']}) on PCD {st['pcd']}, "
          f"{st['face']} | {op['n']} x {op['thread']} on PCD {op['pcd']} | {a['src']} |")
    w("\nThe table gives each maker's full pattern; the plates are drilled for a load-checked subset (section 0): X12 "
      "stator 8 of 16, X12 hip output 8 of 12 / knee pulley 6 of 12, RS04 stator 5 of 10 and output 6 of 9 (through the "
      "spacer ring, 3 pins kept), RS03 lugs 4 of 8 and output 4 of 6, RS02 and RS00 3 of each. Drill the rest from the "
      "DXF pattern if a joint ever needs it.")
    w("\n**Verify against your actuator before cutting:**\n")
    for u in S.UNVERIFIED + ["RS04: angular position of the 2 x dia 5 front dowel holes (the calf plates put them "
                             "between bolt holes at 0 and 180 deg); drill them from the actuator if they differ"]:
        w(f"- {u}")
    # ---------------------------------------------------------------- fasteners
    w("\n## 9. Fasteners (whole robot)\n")
    w("Socket-head cap screws ISO 4762 class 12.9 into T-nuts, square nuts (T-slot joints), Nylock nuts or the "
      "actuators' own threads; M8 rod ends on the push-rods. Lengths are nominal: check against the stack before "
      "ordering.\n")
    w("| Fastener | Qty |\n|---|---|")
    for spec, n in sorted(m.fasteners.items()):
        w(f"| {spec} | {n} |")
    bysize = {}
    for spec, n in m.fasteners.items():
        k = spec.split("x")[0].split(" ")[0] if spec[0] == "M" else spec.split(" ")[0]
        bysize[k] = bysize.get(k, 0) + n
    w("\nBy size: " + ", ".join(f"{k}: {v}" for k, v in sorted(bysize.items())) + ".\n")
    # ---------------------------------------------------------------- joints
    w("## 10. Joint check (positions from params.py, drive as built)\n")
    rng = {**{k: v[1] for k, v in P.JOINTS_LEFT.items()}, **{k: v[1] for k, v in P.JOINTS_CENTRE.items()}}
    w("Ranges are read from params.py / variant_s1.py at build time (left side; right side mirrors roll and yaw). Range "
      "limits set by the lead after the CAD review: hip_roll -25..+30 deg (crank toggle, design note 2), hip_pitch "
      "flexion to -120 deg (knee X12 vs front yoke arm and pelvis 4040, design note 5).\n")
    w("| Joint | Body | Position (mm) | Axis | Range (deg) | Drive in the CAD |\n|---|---|---|---|---|---|")
    drives = {"waist_yaw": "RS04 + 61812 support bearing", "hip_yaw": "RS04 + 61812 support bearing",
              "hip_roll": "RS04 behind the hip, 35 mm crank -> push-rod -> 70 mm lever (2:1)",
              "hip_pitch": "X12 coaxial, output on the outer cheek, 6808 on the inner cheek",
              "knee": "X12 in the thigh, Poly Chain 8MGT 36T:54T belt (36 mm), 3 x 6905 on a fixed shaft",
              "ankle_pitch": "2 x RS04 in the calf, 40 mm cranks, push-rods, 52 mm foot levers",
              "ankle_roll": "(same two push-rods, differential)", "shoulder_pitch": "RS04 in the torso side plate",
              "shoulder_roll": "RS04 behind the shoulder", "shoulder_yaw": "RS03", "elbow": "RS03",
              "wrist_yaw": "RS02", "wrist_pitch": "RS02 + ISO 9409-1-50-4-M6 flange", "neck_yaw": "RS00",
              "neck_pitch": "RS00"}
    for b in BODIES:
        if b.joint:
            base = b.joint[2:] if b.joint[:2] in ("l_", "r_") else b.joint
            if b.joint.startswith("r_"):
                continue
            p = JT[b.name]["pos"]
            r_ = rng.get(base)
            w(f"| {b.joint} | {b.name} | ({p[0]:.0f}, {p[1]:.0f}, {p[2]:.0f}) | {tuple(int(a) for a in b.axis)} | "
              f"{'' if r_ is None else f'{r_[0]}..{r_[1]}'} | {drives.get(base, '')} |")
    # ---------------------------------------------------------------- interference
    if hits is not None:
        w("\n## 11. Static interference check (zero pose)\n")
        if not hits:
            w("No overlapping parts above 2 mm^3 (boolean common of every pair with overlapping bounding boxes).\n")
        else:
            w("| Volume (mm^3) | Part A | Part B |\n|---|---|---|")
            for v, a, b in hits[:60]:
                w(f"| {v:.0f} | {a.body}/{a.name} | {b.body}/{b.name} |")
    lines.extend(design_notes(info, struct_cad + fast_kg, est_total))
    (OUT / "cut_list.md").write_text("\n".join(lines) + "\n")
    parts = {n: dict(kind=d.kind, material=d.material, qty=qty[n], mass_kg=round(d.mass, 4), dims=d.dims,
                     process=d.process, structure=d.structure) for n, d in defs.items()}
    (OUT / "parts.json").write_text(json.dumps(dict(parts=parts, fasteners=dict(m.fasteners),
                                                    structure_cad_kg=round(struct_cad + fast_kg, 3),
                                                    structure_estimate_kg=round(est_total, 3),
                                                    belt=dict(pitch_length=info["belt"], centre=round(info["C"], 2))),
                                               indent=1))
    print(f"structure CAD {struct_cad:.2f} kg + fasteners {fast_kg:.2f} kg = {struct_cad + fast_kg:.2f} kg "
          f"(estimate {est_total:.2f} kg); actuators {act_mass:.2f} kg")
    if hits:
        print(f"{len(hits)} interferences, largest:")
        for v, a, b in hits[:25]:
            print(f"  {v:8.0f} mm3  {a.body}/{a.name}  x  {b.body}/{b.name}")


def main():
    t0 = time.time()
    quick = "--quick" in sys.argv
    check = "--check" in sys.argv
    zw = pelvis()
    m.fast_mult = 2
    info = leg()
    m.fast_mult = 1
    torso(zw)
    neck_head()
    m.fast_mult = 2
    arm()
    m.fast_mult = 1
    m.mirror_left()
    print(f"{len(m.inst)} part instances, {len(m.defs)} part numbers, built in {time.time() - t0:.0f} s")
    export(info, quick=quick, check=check)
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
