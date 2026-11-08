#!/usr/bin/env python3
"""Detailed actuator cutaways (270-degree revolves = quarter-section views). Millimetres.

KA-130K  knee actuator: KM-130x45 frameless motor (36 slots / 42 poles), 2-stage planetary
         14:1 (stage 1 3.5:1 m0.8 nested inside the hollow rotor; stage 2 4.0:1 m1.25),
         crossed-roller output bearing, AksIM-2 motor + output encoder rings, annular drive
         PCB, finned 7075 housing with ducted-air rear cap, Ø20 cable bore.
KH-25    shoulder actuator: ILM85x13 frameless motor, CSG-25-50 strain-wave component set
         (wave generator + flexspline cup + circular spline), crossed-roller output,
         output-side torque-sensing flexure, dual encoders.
Axis = +Z, output at the top. Outputs cad/out/ka130k_cutaway.glb, kh25_cutaway.glb and
STEP of each revolved part (for drawings / machining).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_robot import COLORS  # noqa: E402

OUT = HERE / "out"
SWEEP = 270.0


def rev(profile, sweep=SWEEP):
    """Revolve an (r, z) polyline about Z by `sweep` degrees, leaving the +x/+y quadrant open."""
    w = cq.Workplane("XZ").polyline(profile).close().revolve(sweep, (0, 0, 0), (0, 1, 0))
    return w.rotate((0, 0, 0), (0, 0, 1), 90)


def ring(ri, ro, z0, z1, sweep=SWEEP):
    return rev([(ri, z0), (ro, z0), (ro, z1), (ri, z1)], sweep)


def teeth_ring(ri, ro, z0, z1, n, depth, outward=True, sweep=SWEEP):
    base = ring(ri, ro, z0, z1, sweep)
    return base


def planets(r_orbit, r_p, z0, z1, n=4, skip_quadrant=True):
    ps = []
    for k in range(n):
        a = 2 * math.pi * k / n + math.pi / 4
        x, y = r_orbit * math.cos(a), r_orbit * math.sin(a)
        if skip_quadrant and x > 0 and y > 0:
            continue
        ps.append(cq.Workplane("XY").circle(r_p).extrude(z1 - z0).translate((x, y, z0)))
    return ps


def ka130k():
    P = []
    # axial stack (z, mm): 0 rear cap .. 104 output face
    P.append(("housing", "act", "rear_cap_finned", rev([(10, 0), (66, 0), (66, 3), (70, 3), (70, 6), (66, 6), (66, 9), (70, 9), (70, 12), (60, 14), (14, 14), (10, 12)])))
    P.append(("pcb", "pcb", "drive_pcb_annular", ring(14, 58, 15, 17)))
    P.append(("pcb", "cam", "gan_power_stage", ring(40, 56, 17, 21)))
    P.append(("enc", "alu", "motor_encoder_ring_AksIM2", ring(28, 34, 21.5, 23.5)))
    P.append(("housing", "act", "motor_housing_finned", rev([(65, 20), (69, 20), (69, 24), (72, 24), (72, 27), (69, 27), (69, 31), (72, 31), (72, 34), (69, 34),
                                                              (69, 38), (72, 38), (72, 41), (69, 41), (69, 45), (72, 45), (72, 48), (69, 48), (69, 52), (72, 52),
                                                              (72, 55), (69, 55), (69, 59), (72, 59), (72, 62), (69, 62), (69, 66), (72, 66), (72, 69), (69, 69),
                                                              (69, 84), (65, 84)])))
    # stator: laminations + copper end turns
    P.append(("stator", "steel", "stator_laminations_0.2mm_NO20", ring(50.5, 65, 32, 77)))
    P.append(("stator", "copper", "winding_end_turns_rear", ring(51, 62, 24, 32)))
    P.append(("stator", "copper", "winding_end_turns_front", ring(51, 62, 77, 85)))
    # rotor: magnets + back iron + hollow hub carrying stage-1 sun
    P.append(("rotor", "magnet", "magnets_N42SH_42pole", ring(45, 47.8, 32, 77)))
    P.append(("rotor", "steel", "rotor_back_iron", ring(41, 45, 31, 78)))
    P.append(("rotor", "alu", "rotor_hub", rev([(12, 26), (41, 26), (41, 30), (24, 30), (24, 78), (12, 78)])))
    P.append(("rotor", "steel", "rotor_bearing_rear_6808", ring(20, 28, 23, 30)))
    # stage 1 nested in rotor bore: sun on hub, ring fixed to housing spider, carrier -> stage-2 sun
    P.append(("stage1", "steel", "s1_ring_gear_z50_m0.8", ring(20.5, 23.5, 40, 54)))
    for i, p in enumerate(planets(14.0, 6.0, 41, 53, 3)):
        P.append(("stage1", "steel", f"s1_planet_z15_{i}", p))
    P.append(("stage1", "steel", "s1_sun_z20", ring(5, 8.4, 40, 54)))
    P.append(("stage1", "alu", "s1_carrier", ring(10, 20, 54, 58)))
    # stage 2: sun z18 m1.25, 4 planets z18, ring z54 fixed in front housing
    P.append(("housing", "act", "front_housing", rev([(65, 84), (70, 84), (70, 112), (62, 112), (62, 96), (46, 96), (46, 86), (36, 86), (36, 84)])))
    P.append(("stage2", "steel", "s2_ring_gear_z54_m1.25", ring(33.75, 40, 86, 104)))
    for i, p in enumerate(planets(22.5, 11.25, 87, 103, 4)):
        P.append(("stage2", "steel", f"s2_planet_z18_{i}", p))
    P.append(("stage2", "steel", "s2_sun_z18", ring(10, 11.25, 86, 104)))
    P.append(("stage2", "alu", "s2_carrier_output", rev([(10, 104), (44, 104), (44, 112), (52, 112), (52, 118), (10, 118)])))
    # output crossed-roller bearing + flange + output encoder
    P.append(("bearing", "steel", "crossed_roller_bearing_ID90_OD120", ring(45.5, 60, 100, 114)))
    P.append(("output", "alu", "output_flange_PCD105", rev([(10, 118), (57, 118), (57, 124), (10, 124)])))
    P.append(("enc", "alu", "output_encoder_ring_AksIM2", ring(10.5, 16, 106, 108)))
    P.append(("output", "joint", "cable_bore_tube_ID20", ring(9.5, 10.5, 0, 124)))
    P.append(("housing", "accent", "status_ring", ring(70.2, 70.8, 100, 102)))
    return P


def kh25():
    P = []
    P.append(("housing", "act", "rear_cap", rev([(8, 0), (47, 0), (47, 8), (8, 8)])))
    P.append(("pcb", "pcb", "drive_pcb", ring(10, 40, 9, 11)))
    P.append(("enc", "alu", "motor_encoder", ring(14, 20, 12, 14)))
    P.append(("housing", "act", "motor_housing", rev([(43, 8), (47, 8), (47, 46), (43, 46)])))
    P.append(("stator", "steel", "stator_ILM85x13", ring(33, 42.5, 18, 34)))
    P.append(("stator", "copper", "end_turns_rear", ring(33.5, 40, 13, 18)))
    P.append(("stator", "copper", "end_turns_front", ring(33.5, 40, 34, 39)))
    P.append(("rotor", "magnet", "rotor_magnets", ring(29, 32.5, 18, 34)))
    P.append(("rotor", "alu", "rotor_hub_hollow", rev([(8, 14), (29, 14), (29, 18), (12, 18), (12, 44), (8, 44)])))
    # strain wave: wave generator (elliptical cam + flexible bearing), flexspline cup, circular spline
    P.append(("wave", "steel", "wave_generator_plug", ring(12, 30, 46, 58)))
    P.append(("wave", "steel", "flexspline_cup_CSG25", rev([(12, 46), (32, 46), (32, 72), (31, 72), (31, 47), (13, 47)])))
    P.append(("wave", "steel", "circular_spline", ring(32.2, 42.5, 52, 64)))
    P.append(("bearing", "steel", "crossed_roller_output", ring(34, 45, 64, 74)))
    P.append(("torque", "ti", "torque_flexure_strain_gauged", rev([(8, 72), (40, 72), (40, 76), (30, 76), (30, 80), (40, 80), (40, 84), (8, 84)])))
    P.append(("output", "alu", "output_flange", rev([(8, 84), (44, 84), (44, 90), (8, 90)])))
    P.append(("housing", "act", "front_housing", rev([(43, 46), (48, 46), (48, 74), (45.5, 74), (45.5, 64), (43, 64)])))
    P.append(("housing", "accent", "status_ring", ring(48.1, 48.6, 60, 62)))
    return P


def export(parts, name):
    asm = cq.Assembly(name=name)
    for grp, mat, nm, shp in parts:
        asm.add(shp, name=f"{grp}__{mat}_{nm}", color=cq.Color(*COLORS.get(mat, (0.6, 0.6, 0.6)), 1.0))
    from cadquery.occ_impl.exporters.assembly import exportGLTF
    exportGLTF(asm, str(OUT / f"{name}.glb"), binary=True, tolerance=0.08, angularTolerance=0.2)
    full = cq.Assembly(name=name + "_full")
    print(name, len(parts), "parts")


if __name__ == "__main__":
    export(ka130k(), "ka130k_cutaway")
    export(kh25(), "kh25_cutaway")
