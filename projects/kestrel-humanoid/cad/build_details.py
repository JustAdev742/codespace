#!/usr/bin/env python3
"""Detailed Mk II actuator cutaways (270-degree revolves = quarter-section views). Millimetres.

KA-130K  knee actuator (Mk II, "KA-130K2"): KM-130x50-LC frameless motor (36 slots / 42 poles, 50 mm
         stack, N50UH), stator shrink-fitted into a liquid jacket (7075 core with a 6 x 3 mm helical
         channel under a sealed outer sleeve, O-rings, two radial ports), 2-stage planetary 17:1
         (docs/09 §5.1 Plan A: stage 1 4.25:1 m0.8 z16 / 4 x z18 / z52 inside the rotor; stage 2 4.0:1 m1.25
         z18 / 4 x z18 / z54), THK RB9016 crossed-roller output bearing (90 x 130 x 16, seat Ø130 H7 / Ø90 h5,
         hold H1), 61808 rotor bearings, AksIM-2 motor + output encoder rings, annular 150 A GaN drive PCB.
         No through-bore: the Plan A stage-1 sun (z16 m0.8, root Ø10.8) leaves none (hold H2); power and
         EtherCAT run in external service loops. 10 mm longer than K1 (45 -> 50 mm stack, RB9016 width).
KH-25    shoulder actuator (Mk II, "KH-C25", docs/10 P04 stack): KM-115x32-N50 frameless motor on a hollow input
         shaft (Ø12 bore, 61808 rotor bearings, 61803 front journal in the output front disc); machined two-disc
         cycloid 30:1: ring (42CrMo4) with 31 Ø5 pins in grooves on Ø84, fixed in the front housing; two 8 mm discs
         180 deg apart, each on an INA Fw20/Ew26 needle cage running on a Ø20 h5 eccentric sleeve (E 0.9) in a
         Ø26 G6 disc bore (hold H6); 8 solid Ø8 output pins on PCD 52, pressed into the output back ring and
         screwed into the output front disc (supported at both ends); THK RB5013 crossed roller (50 x 80 x 13);
         strain-gauged Ti torque flexure; dual encoders. Disc profile: cycloid_profile.py.
Axis = +Z, output at the top. Outputs cad/out/ka130k_cutaway.glb, kh25_cutaway.glb and STEP of each
machined part (for drawings / machining). File stems kept from K1 where the part still exists.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_robot import COLORS  # noqa: E402
from cycloid_profile import DESIGNS, profile  # noqa: E402

OUT = HERE / "out"
SWEEP = 270.0


def rev(profile_pts, sweep=None):
    """Revolve an (r, z) polyline about Z by `sweep` degrees, leaving the +x/+y quadrant open."""
    sweep = SWEEP if sweep is None else sweep
    w = cq.Workplane("XZ").polyline(profile_pts).close().revolve(sweep, (0, 0, 0), (0, 1, 0))
    return w.rotate((0, 0, 0), (0, 0, 1), 90)


def ring(ri, ro, z0, z1, sweep=None):
    return rev([(ri, z0), (ro, z0), (ro, z1), (ri, z1)], sweep)


def quadrant_cut(w):
    """Remove the +x/+y quadrant from a full solid (matches the 270-degree revolves)."""
    if SWEEP >= 360:
        return w
    return w.cut(cq.Workplane("XY").box(400, 400, 600).translate((200, 200, 0)))


def planets(r_orbit, r_p, z0, z1, n=4, skip_quadrant=True):
    ps = []
    for k in range(n):
        a = 2 * math.pi * k / n + math.pi / 4
        x, y = r_orbit * math.cos(a), r_orbit * math.sin(a)
        if skip_quadrant and SWEEP < 360 and x > 0 and y > 0:
            continue
        ps.append(cq.Workplane("XY").circle(r_p).extrude(z1 - z0).translate((x, y, z0)))
    return ps


def ka130k():
    P = []
    # axial stack (z, mm): 0 rear cap .. 132 output face
    P.append(("housing", "act", "rear_cap_finned", rev([(10, 0), (66, 0), (66, 8), (62, 11), (14, 11), (10, 9)])))
    P.append(("pcb", "pcb", "drive_pcb_annular", ring(14, 58, 12, 14)))
    P.append(("pcb", "cam", "gan_power_stage", ring(40, 56, 14, 18)))
    P.append(("enc", "alu", "motor_encoder_ring_AksIM2", ring(28, 34, 18.5, 20.5)))
    # liquid jacket: core with helical channel lands (drawn as rings), sealed outer sleeve, two ports
    core = [(64.5, 16), (69, 16), (69, 22)]
    z = 22.0
    while z < 86:
        core += [(66, z), (66, z + 6), (69, z + 6), (69, z + 9)]
        z += 9
    core += [(69, 92), (64.5, 92)]
    P.append(("housing", "act", "motor_housing_finned", rev(core)))
    P.append(("jacket", "act", "coolant_jacket_sleeve", rev([(69, 18), (71, 18), (71, 90), (69, 90)])))
    for zz in (30, 72):
        boss = cq.Workplane("YZ").circle(5.5).extrude(12).translate((70, 0, zz)).union(
            cq.Workplane("YZ").circle(3.2).extrude(10).translate((81, 0, zz)))
        P.append(("jacket", "alu", f"coolant_port_{zz}", boss.rotate((0, 0, 0), (0, 0, 1), 200)))
    P.append(("jacket", "joint", "o_ring_rear", ring(68.6, 69.4, 19, 21)))
    P.append(("jacket", "joint", "o_ring_front", ring(68.6, 69.4, 87, 89)))
    # stator: 50 mm lamination stack + copper end turns
    P.append(("stator", "steel", "stator_laminations_0.2mm_NO20", ring(50.5, 64.5, 30, 80)))
    P.append(("stator", "copper", "winding_end_turns_rear", ring(51, 62, 22, 30)))
    P.append(("stator", "copper", "winding_end_turns_front", ring(51, 62, 80, 88)))
    # rotor: magnets + back iron + hollow hub carrying the stage-1 sun
    P.append(("rotor", "magnet", "magnets_N50UH_42pole", ring(45, 47.8, 30, 80)))
    P.append(("rotor", "steel", "rotor_back_iron", ring(41, 45, 29, 81)))
    P.append(("rotor", "alu", "rotor_hub", rev([(4, 24), (41, 24), (41, 28), (26, 28), (26, 81), (24, 81), (24, 30), (8, 30), (8, 40), (4, 40)])))
    P.append(("rotor", "steel", "rotor_bearing_rear_61808", ring(20, 26, 17, 24)))
    # stage 1 nested in the rotor bore: sun z16 on the hub, 3 planets z18, ring z52 on the housing spider
    P.append(("stage1", "steel", "s1_ring_gear_z52_m0.8", ring(20.8, 23.5, 40, 54)))
    for i, p in enumerate(planets(13.6, 7.2, 41, 53, 4)):            # (16 + 52) / 4 = 17: equal spacing
        P.append(("stage1", "steel", f"s1_planet_z18_{i}", p))
    P.append(("stage1", "steel", "s1_sun_z16", rev([(0, 40), (7.2, 40), (7.2, 54), (0, 54)])))   # tip Ø14.4, root Ø10.8: no bore
    P.append(("stage1", "alu", "s1_carrier", ring(10, 20, 54, 58)))
    # stage 2: sun z18 m1.25, 4 planets z18, ring z54 fixed in the front housing
    # front housing: ring-gear spigot (Ø82 H7) and the THK RB9016 outer-ring seat Ø130 H7 x 16, clamp lip at the front
    P.append(("housing", "act", "front_housing",
              rev([(41, 92), (71, 92), (71, 130), (63, 130), (63, 128), (65, 128), (65, 112), (46, 112), (46, 96), (41, 96)])))
    P.append(("stage2", "steel", "s2_ring_gear_z54_m1.25", ring(33.75, 40.5, 94, 112)))
    for i, p in enumerate(planets(22.5, 11.25, 95, 111, 4)):        # (18 + 54) / 4 = 18
        P.append(("stage2", "steel", f"s2_planet_z18_{i}", p))
    P.append(("stage2", "steel", "s2_sun_z18", rev([(0, 94), (12.5, 94), (12.5, 112), (0, 112)])))   # tip Ø25, root Ø19.4
    P.append(("stage2", "alu", "s2_carrier_output", rev([(4, 112), (44.99, 112), (44.99, 128), (4, 128)])))  # RB9016 inner seat Ø90 h5
    # THK RB9016 crossed roller (ID 90, OD 130, B 16), output flange PCD 105 (12x M5 12.9), output encoder
    P.append(("bearing", "steel", "crossed_roller_bearing_THK_RB9016", ring(45, 65, 112, 128)))
    P.append(("output", "alu", "output_flange_PCD105", rev([(4, 128), (60, 128), (60, 134), (4, 134)])))
    P.append(("enc", "alu", "output_encoder_ring_AksIM2", ring(10.5, 16, 120, 122)))
    P.append(("housing", "accent", "status_ring", ring(71.1, 71.7, 116, 118)))
    return P


def kh25():
    d = DESIGNS["KH-C25"]
    R, Rr, E, N = d["R"], d["Rr"], d["E"], d["N"]
    P = []
    P.append(("housing", "act", "rear_cap", rev([(6, 0), (62, 0), (62, 8), (6, 8)])))           # Ø12 cable bore
    P.append(("pcb", "pcb", "drive_pcb", ring(10, 55, 9, 11)))
    P.append(("enc", "alu", "motor_encoder", ring(14, 20, 12, 14)))
    P.append(("housing", "act", "motor_housing", rev([(59, 8), (63.5, 8), (63.5, 58), (59, 58)])))
    P.append(("stator", "steel", "stator_KM115x32", ring(44, 57.5, 22, 54)))
    P.append(("stator", "copper", "end_turns_rear", ring(44.5, 55, 16, 22)))
    P.append(("stator", "copper", "end_turns_front", ring(44.5, 55, 54, 60)))
    P.append(("rotor", "magnet", "rotor_magnets", ring(40, 43.5, 22, 54)))
    P.append(("rotor", "steel", "rotor_back_iron", ring(37, 40, 21, 55)))
    # rotor hub = hollow input shaft (bore Ø12): Ø40 journal for the 61808 at the motor end, Ø15 eccentric seat,
    # Ø17 front journal for the 61803 in the output front disc
    P.append(("rotor", "alu", "rotor_hub_hollow", rev([(6, 12), (20, 12), (20, 18), (37, 18), (37, 22), (7.5, 22), (7.5, 80),
                                                       (8.5, 80), (8.5, 89), (6, 89)])))
    P.append(("rotor", "steel", "rotor_bearing_61808", ring(20, 26, 10, 17)))
    P.append(("output", "steel", "output_back_ring", ring(12, 36, 57, 61)))                    # carries the 8 output pins
    # two eccentric sleeves (Ø20 h5, E 0.9, keyed 180 deg apart) with Fw20/Ew26 needle cages, discs on Ø26 G6 bores
    for k, (zz, ex) in enumerate(((62, E), (71, -E))):
        sleeve = cq.Workplane("XY").circle(10).extrude(8).translate((ex, 0, zz)).cut(cq.Workplane("XY").circle(7.5).extrude(40).translate((0, 0, 50)))
        cage = cq.Workplane("XY").circle(13).circle(10).extrude(8).translate((ex, 0, zz))
        P.append(("cycloid", "steel", f"eccentric_sleeve_{'AB'[k]}", quadrant_cut(sleeve)))
        P.append(("cycloid", "copper", f"needle_cage_Fw20_Ew26_{'AB'[k]}", quadrant_cut(cage)))
    x, y = profile(R, Rr, E, N, n=1200)
    pts = [cq.Vector(float(a), float(b), 0) for a, b in zip(x[::4], y[::4])]
    base = cq.Workplane("XY").add(cq.Wire.assembleEdges([cq.Edge.makeSpline(pts, periodic=True)])).toPending().extrude(d["thick"])
    k_h, pcd_r, hole_r = d["holes"]
    for i in range(k_h):
        a = 2 * math.pi * i / k_h
        base = base.cut(cq.Workplane("XY").center(pcd_r * math.cos(a), pcd_r * math.sin(a)).circle(hole_r).extrude(20, both=True))
    base = base.cut(cq.Workplane("XY").circle(d["bore"] / 2).extrude(20, both=True))
    for k, (zz, ex, rot) in enumerate(((62, E, 0.0), (71, -E, 180.0 / (N - 1)))):
        disc = base.rotate((0, 0, 0), (0, 0, 1), rot).translate((ex, 0, zz))
        P.append(("cycloid", "steel", f"cycloid_disc_{'AB'[k]}", quadrant_cut(disc)))
    P.append(("cycloid", "steel", "disc_spacer_shim", ring(14, 30, 70, 71)))
    # ring with 31 pin grooves on Ø84 (pins roll freely), spigoted + dowelled into the front housing
    P.append(("cycloid", "act", "pin_ring_42CrMo4", ring(42, 52, 60, 81)))
    for i in range(N):
        a = 2 * math.pi * i / N
        px, py = R * math.cos(a), R * math.sin(a)
        if SWEEP < 360 and px > 0 and py > 0:
            continue
        P.append(("cycloid", "steel", f"ring_pin_{i:02d}", cq.Workplane("XY").circle(Rr).extrude(19.8).translate((px, py, 60.6))))
    for i in range(k_h):                                                                   # solid Ø8, supported both ends
        a = 2 * math.pi * i / k_h
        px, py = pcd_r * math.cos(a), pcd_r * math.sin(a)
        if SWEEP < 360 and px > 0 and py > 0:
            continue
        P.append(("output", "steel", f"output_pin_{i}", cq.Workplane("XY").circle(4.0).extrude(29).translate((px, py, 57))))
    P.append(("output", "alu", "output_front_disc", rev([(13, 82), (36, 82), (36, 88), (25, 88), (25, 101), (13, 101)])))
    P.append(("bearing", "steel", "journal_bearing_61803", ring(8.5, 13, 83, 88)))
    P.append(("housing", "act", "front_housing", rev([(52, 58), (63.5, 58), (63.5, 104), (44, 104), (44, 101), (40, 101), (40, 86), (52, 86)])))
    P.append(("bearing", "steel", "crossed_roller_THK_RB5013", ring(25, 40, 88, 101)))
    P.append(("housing", "alu", "bearing_clamp_ring", ring(37, 44, 101, 104)))
    P.append(("torque", "ti", "torque_flexure_strain_gauged", rev([(8, 101), (36, 101), (36, 105), (28, 105), (28, 109), (36, 109), (36, 113), (8, 113)])))
    P.append(("output", "alu", "output_flange", rev([(8, 113), (44, 113), (44, 119), (8, 119)])))
    P.append(("housing", "accent", "status_ring", ring(63.6, 64.1, 74, 76)))
    return P


def export(parts, name):
    asm = cq.Assembly(name=name)
    for grp, mat, nm, shp in parts:
        asm.add(shp, name=f"{grp}__{mat}_{nm}", color=cq.Color(*COLORS.get(mat, (0.6, 0.6, 0.6)), 1.0))
    from cadquery.occ_impl.exporters.assembly import exportGLTF
    exportGLTF(asm, str(OUT / f"{name}.glb"), binary=True, tolerance=0.06, angularTolerance=0.15)
    print(name, len(parts), "parts")


SKIP_STEP = ("planet", "bearing", "laminations", "magnets", "cycloid_disc", "ring_pin", "output_pin", "o_ring", "end_turns", "back_iron", "needle_cage", "shim")


def export_step_full():
    """Full 360-degree solids of the machined / gear parts for manufacturing."""
    global SWEEP
    SWEEP = 360.0
    for prefix, fn in (("ka130k", ka130k), ("kh25", kh25)):
        for grp, mat, nm, shp in fn():
            if mat in ("act", "alu", "steel", "ti") and not any(s in nm for s in SKIP_STEP):
                cq.exporters.export(shp, str(OUT / "step" / f"{prefix}__{nm}.step"))
    SWEEP = 270.0


if __name__ == "__main__":
    export(ka130k(), "ka130k_cutaway")
    export(kh25(), "kh25_cutaway")
    export_step_full()
