"""KESTREL S1: purchased-part data and reusable component builders (actuators, bearings, housings, hubs,
pulleys, belts, rod ends, clamp blocks, tubes, extrusions). All in mm, world coordinates, zero pose.

ACTUATORS is the single place where the makers' mounting dimensions live. Every value carries its
source; the ones I could not confirm are listed in UNVERIFIED and printed into the cut list as
"verify against your actuator before cutting".
"""
from __future__ import annotations

import math

import cadquery as cq
import numpy as np

import s1lib as L
from s1lib import box, cyl, fuse, ring, seg_cyl

# ============================================================================== actuators
# Sources
#   RS-manual: RobStride "<model> User Manual" sec. 1.1 "Outline and mounting dimensions" (RS04/RS02/RS00 260713,
#              RS03 261013), github.com/RobStride/Product_Information "Product Literature/CAN2.0/<model>/"
#   RS-step:   RobStride 3D models in the same folders (<model>-20261030.stp), measured with cadquery
#   MA-um:     MyActuator "User Manual for X Series Products V1.1-250516", Fig. 3-6 "X12-P20 appearance dimension
#              drawing" (zip linked in data/cots_actuators.json, myactuator.com downloads-xseries)
ACTUATORS = {
    "X12": dict(
        model="MyActuator RMD-X12-P20-320-E", mass=2.37, src="MA-um Fig. 3-6",
        # axial stack from the output face backwards: (diameter, length, label)
        stack=[(85.0, 3.0, "output flange"), (109.0, 9.5, "pilot spigot (h-tol, -0.03)"),
               (124.0, 65.0, "housing"), (46.0, 7.5, "rear connector boss")],
        front_face_offset=12.5,            # housing front face (stator mounting face) behind the output face
        stator=dict(face="front (output side) housing annulus", n=16, pcd=116.5, thread="M4-6H", depth=8,
                    pilot=109.0, clear=4.5),
        output=dict(n=12, pcd=72.0, thread="M5-6H", depth=9, recess=62.0, recess_depth=3.5,
                    dowels="3 x dia 4 +0.02 depth 8", clear=5.5),
        overall=85.0),
    "RS04": dict(
        model="RobStride RS04", mass=1.51, src="RS-manual + RS-step",
        stack=[(50.0, 0.5, "output flange"), (120.0, 39.0, "housing"), (94.0, 13.2, "rear cap")],
        front_face_offset=0.5,
        stator=dict(face="rear face annulus (also front face)", n=10, pcd=106.0, thread="M4", depth=6, clear=4.5,
                    front_depth=5, front_dowels="2 x dia 5 (0/-0.01) on PCD 106", rear_boss=94.0),
        output=dict(n=9, pcd=36.0, thread="M5", depth=6.5, pins="3 x dia 6 pins on PCD 35.86, 3 mm proud",
                    clearance_recess=65.0, clear=5.5),
        overall=52.7),
    "RS03": dict(
        model="RobStride RS03", mass=0.928, src="RS-manual + RS-step",
        stack=[(70.0, 2.5, "output boss"), (93.0, 39.5, "housing + 8 lugs"), (79.5, 14.6, "rear boss")],
        front_face_offset=2.5, lug_pcd=98.0, lug_d=11.0,
        stator=dict(face="lug faces, front and rear", n=8, pcd=98.0, thread="M4", depth=8, clear=4.5, rear_boss=79.5),
        output=dict(n=6, pcd=30.36, thread="M4", depth=6, dowels="3 x dia 4 +0.1 depth 7 on the same PCD", clear=4.5),
        overall=56.6),
    "RS02": dict(
        model="RobStride RS02", mass=0.418, src="RS-manual + RS-step",
        stack=[(43.0, 4.0, "output flange"), (78.5, 26.5, "housing"), (65.0, 15.0, "rear boss + connectors")],
        front_face_offset=4.0,
        stator=dict(face="rear face (6 x M3); front face has 9 x M3 on the same PCD", n=6, pcd=73.0, thread="M3",
                    depth=6, clear=3.4, rear_boss=65.0),
        output=dict(n=6, pcd=24.0, thread="M4", depth=7, dowels="3 x dia 4 +0.1 on PCD 24", clear=4.5),
        overall=45.5),
    "RS00": dict(
        model="RobStride RS00", mass=0.31, src="RS-manual + RS-step",
        stack=[(35.0, 1.0, "output flange"), (57.0, 50.0, "housing")],
        front_face_offset=1.0,
        stator=dict(face="rear face 4 x M3 depth 4 on PCD 38; front face 6 x M3 on PCD 50 + 2 x dia 3 dowels",
                    n=4, pcd=38.0, thread="M3", depth=4, clear=3.4, front_n=6, front_pcd=50.0),
        output=dict(n=6, pcd=27.0, thread="M3", depth=5, dowels="3 x dia 3 on PCD 24.46", clear=3.4),
        overall=51.0),
}

UNVERIFIED = [
    "X12-P20-320: dowel-hole positions on the output flange (3 x dia 4 shown, angular position not dimensioned) "
    "-> plates carry only the 12 x M5 pattern; drill dowel holes from the part",
    "X12-P20-320: rear connector boss size (~dia 46 x 7.5, scaled from the drawing) and cable exit direction",
    "X12-P20-320: the 16 x M4 stator holes are on the housing front annulus outside the dia 109 pilot (as drawn); "
    "the drawing does not say whether they are through or blind from the rear",
    "X12-P20-320: mass 2.37 kg (datasheet) vs 2.82 kg used in simple/data/actuator_family.json",
    "RS02: the 6 x M3 rear pattern on PCD 73 is taken from the STEP model only (the manual dimensions the 9 x M3 "
    "front pattern); overall length 45.5 mm in STEP vs 41.5 mm in the manual (connectors)",
    "RS03: whether the whole dia 70 output boss rotates (the plates leave a dia 72 clearance either way)",
    "RS04: output disc dia 50 protrudes only 0.5 mm -> every driven part sits on a 4.5-6 mm spacer ring",
    "RS00: newer revision listed at 17 N m / 330 g in the RobStride summary table; flange pattern assumed unchanged",
]


def actuator(m, key, body, out_pt, out_dir, lug_a0=0.0):
    """Place an actuator as stepped cylinders. out_pt = centre of the output face, out_dir = unit vector the output
    faces. Returns dict of useful axial points (front face, rear face, rear end)."""
    spec = ACTUATORS[key]
    out_pt = np.asarray(out_pt, float)
    a = np.asarray(out_dir, float)
    a = a / np.linalg.norm(a)
    shapes = []
    s = 0.0
    marks = {}
    for (dia, length, label) in spec["stack"]:
        p0 = out_pt - a * (s + length)
        shapes.append(cyl(dia / 2, length, tuple(p0), tuple(a)))
        marks[label] = s
        s += length
    if key == "RS03":   # 8 mounting lugs on PCD 98
        f0 = spec["stack"][0][1]
        ref = np.array([0, 0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0, 0])
        e1 = np.cross(a, ref)
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(a, e1)
        for i in range(8):
            ang = 2 * math.pi * i / 8 + math.radians(lug_a0)
            c = out_pt + (e1 * math.cos(ang) + e2 * math.sin(ang)) * spec["lug_pcd"] / 2 - a * (f0 + 39.5)
            shapes.append(cyl(spec["lug_d"] / 2, 39.5, tuple(c), tuple(a)))
    shp = shapes[0]
    for t in shapes[1:]:
        shp = shp.fuse(t)
    m.solid(f"ACT_{key}", shp, body, "act", "actuator", "-", "purchased: " + spec["model"],
            dims=f"dia {max(st[0] for st in spec['stack']):.1f} x {s:.1f} overall", structure=False, mass_kg=spec["mass"])
    front = out_pt - a * spec["front_face_offset"]
    body_len = [st for st in spec["stack"] if st[2] in ("housing", "housing + 8 lugs")][0][1]
    rear = front - a * body_len
    return dict(front=front, rear=rear, end=out_pt - a * s, axis=a, out=out_pt)


# ============================================================================== bearings and housings
BEARINGS = {   # bore, OD, width, mass kg (C / C0 in kN in the comment, SKF class values)
    "6808-2RS": (40, 52, 7, 0.026),       # 4.9 / 4.3
    "6908-2RS": (40, 62, 12, 0.110),      # 13.8 / 10.0
    "6905-2RS": (25, 42, 9, 0.042),       # 7.0 / 4.3
    "61812-2RS": (60, 78, 10, 0.104),
    "6005-2RS": (25, 47, 12, 0.080),
    "6003-2RS": (17, 35, 10, 0.039),
    "6001-2RS": (12, 28, 8, 0.022),
    "608-2RS": (8, 22, 7, 0.012),
}


def bearing(m, kind, body, centre, axis):
    """Bearing centred on 'centre' (mid-width), axis unit vector."""
    bi, bo, w, mass = BEARINGS[kind]
    a = np.asarray(axis, float)
    p0 = np.asarray(centre, float) - a * w / 2
    m.solid(f"BRG_{kind}", ring(bo / 2, bi / 2, w, tuple(p0), tuple(a)), body, "steel", "purchased", "steel",
            "purchased bearing", dims=f"{bi} x {bo} x {w}", mass_kg=mass)


def housing(m, kind, body, face_pt, axis, plate_thk=L.THK, wide=False):
    """Light flanged bearing housing (machined 6061): spigot fills the plate bore, thin flange on the plate face,
    3 x M3 into the plate. face_pt = centre of the plate face the flange sits on; axis points away from the plate.
    Returns (plate bore, M3 PCD, bearing centre, flange radius)."""
    bi, bo, w, _ = BEARINGS[kind]
    a = np.asarray(axis, float)
    f = np.asarray(face_pt, float)
    sp_d = bo + 6.0
    fl_d = bo + (24.0 if wide else 18.0)            # wide: screws in slots outside a slotted (take-up) seat
    pcd = bo + (16.0 if wide else 10.0)
    fl_t = max(w - plate_thk, 3.0)
    spig = cyl(sp_d / 2, plate_thk, tuple(f - a * plate_thk), tuple(a))
    flange = cyl(fl_d / 2, fl_t, tuple(f), tuple(a))
    seat = cyl(bo / 2, plate_thk + fl_t, tuple(f - a * plate_thk), tuple(a))
    shp = spig.fuse(flange).cut(seat)
    m.solid(f"HSG_{kind}_{plate_thk:.0f}" + ("_SLIDE" if wide else ""), shp, body, "alu", "machined", "6061-T6",
            f"machined 6061-T6 (lathe): spigot dia {sp_d:.0f} x {plate_thk:.0f} (fits the plate bore), flange dia {fl_d:.0f} "
            f"x {fl_t:.0f}, bore {bo} H7 for {kind}, {4 if wide else 3} x M3 c'bored on PCD {pcd:.0f} "
            + ("through slots in the plate, nuts behind (slides +-3 mm for belt take-up)" if wide else
               "into the plate (tapped)"),
            dims=f"dia {fl_d:.0f} x {plate_thk + fl_t:.0f}")
    m.fast("M3x8 SHCS", 3)
    centre = f - a * plate_thk + a * (w / 2)
    bearing(m, kind, body, centre, a)
    return sp_d + 0.2, pcd, centre, fl_d / 2


def output_spacer(m, name, body, out_pt, out_dir, length, od=50.0, idd=22.0, note=""):
    """Machined 6061 spacer ring on an actuator output face; the driven plate's screws pass through it into the
    actuator's own output threads (no second bolt circle)."""
    a = np.asarray(out_dir, float)
    p = np.asarray(out_pt, float)
    shp = cyl(od / 2, length, tuple(p), tuple(a)).cut(cyl(idd / 2, length, tuple(p), tuple(a)))
    m.solid(name, shp, body, "alu", "machined", "6061-T6", "machined 6061-T6 ring: " + note,
            dims=f"dia {od:.0f} x {length:.1f}")
    return p + a * length


def output_hub(m, name, body, out_pt, out_dir, length, dia=62.0, note=""):
    """Machined 6061 output hub bolted to an actuator output face (so the driven part clears the housing)."""
    a = np.asarray(out_dir, float)
    shp = cyl(dia / 2, length, tuple(np.asarray(out_pt, float)), tuple(a)).cut(cyl(8, length, tuple(np.asarray(out_pt, float)), tuple(a)))
    m.solid(name, shp, body, "alu", "machined", "6061-T6", "machined 6061-T6 (lathe + drill): " + note,
            dims=f"dia {dia:.0f} x {length:.0f}")
    return np.asarray(out_pt, float) + a * length


# ============================================================================== belt drive
HTD8M = 8.0


def htd_pd(z):
    return z * HTD8M / math.pi


def belt_len(c, z1, z2):
    d1, d2 = htd_pd(z1), htd_pd(z2)
    return 2 * c + math.pi * (d1 + d2) / 2 + (d2 - d1) ** 2 / (4 * c)


def belt_centre(Lp, z1, z2):
    lo, hi = 50.0, 2000.0
    for _ in range(80):
        c = 0.5 * (lo + hi)
        if belt_len(c, z1, z2) < Lp:
            lo = c
        else:
            hi = c
    return 0.5 * (lo + hi)


def pulley(m, name, body, z_teeth, centre_face, axis, width=30.0, fl=1.0, mount=None, web=False, far_web=None,
           hub_ring=None, boss=None, note="", mount_relief=0):
    """Lightened 6061 HTD-8M pulley along 'axis' from the mounting face centre_face:
    mount    = (r_in, r_out, t) disc or collar at the mounting face (bolted to the actuator / calf plate)
    rim      = 6 mm under the teeth, two fl mm flanges
    web      = 5 mm web with 6 relief holes from the hub ring to the rim, at the mounting side
    far_web  = (r_in, t) web at the far end carrying the boss
    hub_ring = (r_in, r_out) bearing sleeve along the toothed length
    boss     = (dia, length, bore) for a support bearing beyond the far flange."""
    a = np.asarray(axis, float)
    p = np.asarray(centre_face, float)
    od = htd_pd(z_teeth) - 1.37
    r_rim = od / 2 - 6.0
    parts = []
    s = 0.0
    ref = np.array([0, 0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = np.cross(a, ref)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(a, e1)
    if mount:
        md = ring(mount[1], mount[0], mount[2], tuple(p), tuple(a))
        for k in range(mount_relief):      # relief holes between the bolt holes, inside the bolt circle
            ang = k * 2 * math.pi / mount_relief + math.pi / mount_relief
            c = p + (e1 * math.cos(ang) + e2 * math.sin(ang)) * 24.0
            md = md.cut(cyl(5.0, mount[2], tuple(c), tuple(a)))
        parts.append(md)
        s += mount[2]
    t0 = s
    parts.append(ring(od / 2 + 4, od / 2 - 2, fl, tuple(p + a * s), tuple(a)))
    s += fl
    parts.append(ring(od / 2, r_rim, width + 2, tuple(p + a * s), tuple(a)))
    s += width + 2
    parts.append(ring(od / 2 + 4, od / 2 - 2, fl, tuple(p + a * s), tuple(a)))
    s += fl
    ref = np.array([0, 0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = np.cross(a, ref)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(a, e1)
    if web:
        r_in = hub_ring[1] if hub_ring else mount[1]
        w = ring(r_rim + 0.5, r_in - 0.5, 5.0, tuple(p + a * t0), tuple(a))
        rr, dh = (r_rim + r_in) / 2, r_rim - r_in - 6
        for k in range(6):
            ang = math.pi / 6 + k * math.pi / 3
            c = p + a * t0 + (e1 * math.cos(ang) + e2 * math.sin(ang)) * rr
            w = w.cut(cyl(dh / 2, 5.0, tuple(c), tuple(a)))
        parts.append(w)
    if hub_ring:
        parts.append(ring(hub_ring[1], hub_ring[0], s - t0, tuple(p + a * t0), tuple(a)))
    if far_web:
        parts.append(ring(r_rim + 0.5, far_web[0], far_web[1], tuple(p + a * (s - far_web[1])), tuple(a)))
    if boss is not None:
        parts.append(ring(boss[0] / 2, boss[2] / 2, boss[1], tuple(p + a * s), tuple(a)))
        s += boss[1]
    shp = parts[0]
    for t in parts[1:]:
        shp = shp.fuse(t)
    m.solid(name, shp, body, "alu", "machined", "6061-T6",
            f"lightened 6061 {z_teeth}T 8 mm-pitch pulley for a {width:.0f} mm belt (pitch dia {htd_pd(z_teeth):.2f}): 6 mm rim, "
            f"{fl:.0f} mm flanges; " + note, dims=f"dia {od + 8:.0f} x {s:.0f}")
    return od


def belt(m, name, body, c1, c2, z1, z2, y0, width=30.0, thk=5.6, Lp=None, product=None):
    """HTD-8M belt around two pulleys whose axes are along y, centres c1/c2 = (x, z); belt spans y0..y0+width."""
    r1, r2 = (htd_pd(z1) - 1.37) / 2 + 0.3, (htd_pd(z2) - 1.37) / 2 + 0.3   # 0.3 mm off the rim (no tooth model)
    out = L.hull_shapes(circles=[(c1[0], c1[1], r1 + thk), (c2[0], c2[1], r2 + thk)], n=96)
    inn = L.hull_shapes(circles=[(c1[0], c1[1], r1), (c2[0], c2[1], r2)], n=96)

    def solid(poly):
        w = cq.Wire.makePolygon([cq.Vector(float(x), 0, float(z)) for x, z in poly], close=True)
        f = cq.Face.makeFromWires(w)
        return cq.Solid.extrudeLinear(f, cq.Vector(0, width, 0))
    shp = solid(out).cut(solid(inn)).moved(cq.Location(cq.Vector(0, y0, 0)))
    m.solid(name, shp, body, "belt", "belt", "belt", product or f"purchased timing belt HTD {Lp:.0f}-8M-{width:.0f}",
            dims=f"{Lp:.0f} mm pitch length, {int(round(Lp / 8))} teeth, {width:.0f} wide",
            mass_kg=Lp * 1e-3 * 0.0063 * width)


# ============================================================================== rods, tubes, extrusions, blocks
def rod_end(m, body, pin_centre, pin_axis, rod_dir):
    """M8 female rod end (e.g. SIKAC / PHSA 8): eye dia 24 x 12 on the pin, body dia 14 toward the rod."""
    c = np.asarray(pin_centre, float)
    pa = np.asarray(pin_axis, float)
    rd = np.asarray(rod_dir, float)
    rd = rd / np.linalg.norm(rd)
    eye = cyl(12, 9, tuple(c - pa * 4.5), tuple(pa)).fuse(cyl(7, 12, tuple(c - pa * 6), tuple(pa)))
    eye = eye.cut(cyl(4, 12, tuple(c - pa * 6), tuple(pa)))          # housing dia 24 x 9, ball dia 14 x 12, bore 8
    shank = cyl(6, 20, tuple(c + rd * 12), tuple(rd))
    m.solid("ROD_END_M8", eye.fuse(shank), body, "steel", "purchased", "steel",
            "purchased M8 female rod end (PHSA 8 / SIKAC 8 class), RH or LH thread", dims="eye 24 x 12, M8", mass_kg=0.035)
    m.fast("ISO 7379 shoulder screw d8 x 16, M6 (rod-end pin)", 1)
    m.fast("M6 Nylock nut", 1)


def push_rod(m, name, body, p0, p1, pin_axis, od=12.0, wall=2.0):
    """Push-rod between two pin centres: steel M8 rod end at each end, 6061 tube with pressed and cross-pinned M8
    end plugs (one RH, one LH thread, so the length adjusts in place)."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    rod_end(m, body, p0, pin_axis, d)
    rod_end(m, body, p1, pin_axis, -d)
    a, b = p0 + d * 32, p1 - d * 32
    Lr = float(np.linalg.norm(b - a))
    shp = seg_cyl(od / 2, a, b).cut(seg_cyl(od / 2 - wall, a + d * 12, b - d * 12))
    m.solid(name, shp, body, "alu", "rod", "6061-T6",
            f"6061-T6 tube dia {od:.0f} x {wall:.0f}, cut to {Lr:.0f} mm, two 12 mm 6061 end plugs pressed + cross-pinned, "
            "tapped M8 RH / M8 LH", dims=f"dia {od:.0f} x {wall:.0f} x {Lr:.0f}", length=Lr)
    m.fast("M8 jam nut", 2)
    return Lr


def tie(m, body, p0, p1, od=16.0, wall=2.0, bolt=True):
    """Tube spacer between two plates, clamped by an M5 through-bolt: ties a cheek pair into a torsion box."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    Ls = float(np.linalg.norm(p1 - p0))
    m.solid(f"TIE_{od:.0f}x{wall:.0f}_{Ls:.0f}", seg_cyl(od / 2, p0, p1).cut(seg_cyl(od / 2 - wall, p0, p1)), body,
            "alu", "tube", "6061-T6", f"6061 tube dia {od:.0f} x {wall:.0f} spacer, cut to {Ls:.0f} mm, faced square",
            dims=f"dia {od:.0f} x {wall:.0f} x {Ls:.0f}", length=Ls)
    if bolt:
        m.fast(f"M5x{int(5 * math.ceil((Ls + 16) / 5))} SHCS", 1)
        m.fast("M5 Nylock nut", 1)


def tube(m, name, body, p0, p1, od, wall):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0
    Lt = float(np.linalg.norm(d))
    shp = seg_cyl(od / 2, p0, p1).cut(seg_cyl(od / 2 - wall, p0, p1))
    m.solid(name, shp, body, "alu", "tube", "6061-T6", f"6061-T6 round tube dia {od:.0f} x {wall:.0f}, cut to {Lt:.0f} mm",
            dims=f"dia {od:.0f} x {wall:.0f} x {Lt:.0f}", length=Lt)
    return Lt


EXTRUSION = {   # name: (w, h, kg/m, source)
    "2040": (20.0, 40.0, 0.89, "GAP Engineering 20x40 6 mm slot, 0.89 kg/m (R9)"),
    "4040": (40.0, 40.0, 1.30, "20-series 40x40 6 mm slot, ~1.3 kg/m (estimate, check supplier)"),
}


def _profile(w, h):
    """Simplified 20-series T-slot section: outer rectangle with a 6 mm x 6 mm slot centred on each 20 mm face cell."""
    pts = []
    def side(x0, y0, x1, y1, nx, ny):
        n = int(round(math.hypot(x1 - x0, y1 - y0) / 20))
        ux, uy = (x1 - x0) / (n * 20), (y1 - y0) / (n * 20)
        out = [(x0, y0)]
        for k in range(n):
            cx, cy = x0 + ux * (10 + 20 * k), y0 + uy * (10 + 20 * k)
            a, b = (cx - ux * 3, cy - uy * 3), (cx + ux * 3, cy + uy * 3)
            out += [a, (a[0] - nx * 6, a[1] - ny * 6), (b[0] - nx * 6, b[1] - ny * 6), b]
        return out
    pts += side(-w / 2, -h / 2, w / 2, -h / 2, 0, -1)
    pts += side(w / 2, -h / 2, w / 2, h / 2, 1, 0)
    pts += side(w / 2, h / 2, -w / 2, h / 2, 0, 1)
    pts += side(-w / 2, h / 2, -w / 2, -h / 2, -1, 0)
    return pts


def extrusion(m, name, body, kind, p0, axis, length, wdir):
    """T-slot extrusion. p0 = centre of the start face, axis = length direction, wdir = direction of the 'w' side."""
    w, h, kgm, src = EXTRUSION[kind]
    a = np.asarray(axis, float)
    u = np.asarray(wdir, float)
    v = np.cross(a, u)
    pts = _profile(w, h)
    p0 = np.asarray(p0, float)
    wire = cq.Wire.makePolygon([cq.Vector(*(p0 + u * x + v * y)) for x, y in pts], close=True)
    f = cq.Face.makeFromWires(wire)
    shp = cq.Solid.extrudeLinear(f, cq.Vector(*(a * length)))
    m.solid(name, shp, body, "alu", "extrusion", "6061-T6", f"{kind} T-slot extrusion ({src}), cut to {length:.0f} mm, "
            "ends tapped M5 in the centre bores", dims=f"{kind} x {length:.0f}", mass_kg=kgm * length * 1e-3, length=length)


def clamp_block(m, name, body, centre, tube_axis, split_dir, tube_d, size, printed=False):
    """Two-piece split clamp block around a tube. size = (along split_dir, across, along tube axis)."""
    c = np.asarray(centre, float)
    a = np.asarray(tube_axis, float)
    s = np.asarray(split_dir, float)
    t = np.cross(a, s)
    sx, sy, sz = size
    halves = []
    for sign in (+1, -1):
        # half block occupying split coordinate in [0.5, sx/2] (sign side)
        o = c + s * sign * (0.5 + (sx / 2 - 0.5) / 2)
        pl = cq.Plane(origin=cq.Vector(*o), xDir=cq.Vector(*s), normal=cq.Vector(*a))
        b = cq.Workplane(pl).box(sx / 2 - 0.5, sy, sz).val()
        halves.append(b)
    blk = halves[0].fuse(halves[1])
    blk = blk.cut(cyl(tube_d / 2, sz + 2, tuple(c - a * (sz / 2 + 1)), tuple(a)))
    if printed:
        m.solid(name, blk, body, "print", "printed", "PA12-CF",
                f"printed PA12-CF (MJF/SLS) or PETG-CF (FDM, 6 walls, 60 % gyroid), 2 halves, bore dia {tube_d:.0f}; "
                "or machine from 6061 (same drawing)", dims=f"{sx:.0f} x {sy:.0f} x {sz:.0f}")
    else:
        m.solid(name, blk, body, "alu", "machined", "6061-T6",
                f"machined 6061-T6 (or printed PA12-CF), 2 halves split through the bore, bore dia {tube_d:.0f} H8, "
                "2 x M6 clamp screws", dims=f"{sx:.0f} x {sy:.0f} x {sz:.0f}")
    m.fast("M5x30 SHCS (clamp)", 2)
    m.fast("M5 Nylock nut", 2)
    return blk


def standoff(m, body, p0, p1, d=12.0):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    Ls = float(np.linalg.norm(p1 - p0))
    m.fast("M6x12 SHCS" if d >= 12 else "M5x10 SHCS", 2)
    m.solid(f"STANDOFF_{d:.0f}x{Ls:.0f}", seg_cyl(d / 2, p0, p1).cut(seg_cyl(2.5, p0, p1)), body, "alu", "purchased",
            "6061-T6", f"aluminium standoff dia {d:.0f} (or hex), M{6 if d >= 12 else 5} female both ends, length {Ls:.0f}",
            dims=f"dia {d:.0f} x {Ls:.0f}", length=Ls)


def d_hole(cx, cy, d, flat=1.5, n=40):
    """Polygon for a D-shaped hole (shaft with one flat), flat on the +x side."""
    r = d / 2
    xf = r - flat
    pts = []
    for k in range(n + 1):
        ang = -math.acos(xf / r) + (2 * math.pi - 2 * math.acos(xf / r)) * k / n
        ang = math.acos(xf / r) + (2 * math.pi - 2 * math.acos(xf / r)) * k / n
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return np.array(pts)
