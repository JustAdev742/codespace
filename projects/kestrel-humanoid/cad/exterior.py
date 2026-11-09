"""KESTREL K1 Mk II exterior: shells, joint caps, light guides, fasteners (mm, zero pose, world frame).

Design language "instrument, not armour", Mk II revision (docs/02-industrial-design.md):
  * satin warm-white MJF PA12 panels ('shell') over a graphite layer ('trim' = graphite-painted PA12,
    'joint' = black hard-anodised housings), one accent (amber light guides, 'accent');
  * sculpted asymmetric superellipse lofts: per-side semi-axes and per-quadrant exponents put volume
    where the mechanism is (quad-like thigh front over the knee crank sweep, a calf that houses the
    two ankle actuators, a forearm that tapers to the wrist) and square off a corner only where a
    linkage sweeps;
  * every joint reads as a precision actuator: machined bezel, graphite cap, screw circle, and on the
    main load joints an amber ring;
  * panel splits are service lines (1 mm gaps), fasteners where a panel is actually screwed.

Clearance rules used for every shell (verified by check_clearance.py):
  * a shell sits >= 2 mm (static) / >= 3 mm (moving) from the envelope of the parts it encloses;
  * where a shell crosses a joint, its edge is either concentric with that joint axis or outside
    the swept envelope of the neighbouring link over the checked range;
  * the knee push-rod sweep (data/knee_fourbar.json, 0..130 deg) is subtracted from the thigh and
    shank shells with 4 mm clearance.
Walls: MJF PA12 2.0-2.4 mm (arms 1.8 mm) - layout.WALL. Draft is not needed for MJF; minimum
internal radius 3 mm, no wall under 1.6 mm.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import cadquery as cq

from geom import aloft, ashell, cyl, halfspace, joint_cap, plane_cut, probe_surface, rbox, rod_between, screw_at, slab, tube
from layout import (ACT, AZ, EZ, GAP, HIP_PITCH_Y, HY, HZ, KNEE_ACT_Y, KNEE_ACT_Z, KZ, NP, ROD_Y, SH_ROLL_X, SH_YAW_Z, SY,
                    SZ, WALL, WP, WRZ)

HERE = Path(__file__).resolve().parent
G2 = GAP / 2


# ------------------------------------------------------------------ helpers
def offs(secs, d):
    """Offset every semi-axis of a section list by d (approximate normal offset)."""
    return [(s[0],) + tuple(max(v + d, 0.8) for v in s[1:5]) + (s[5],) for s in secs]


def band(secs, out, depth, region, axis="z"):
    """Thin skin band standing `out` mm proud of the loft surface and `depth` mm deep, clipped to region."""
    return aloft(offs(secs, out), axis).intersect(region).cut(aloft(offs(secs, -depth), axis))


def box(x0, x1, y0, y1, z0, z1):
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0).translate(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))


BIG = 2000.0


def keep_x(w, lo=-BIG, hi=BIG):
    return w.intersect(box(lo, hi, -BIG, BIG, -BIG, BIG))


def keep_y(w, lo=-BIG, hi=BIG):
    return w.intersect(box(-BIG, BIG, lo, hi, -BIG, BIG))


def keep_z(w, lo=-BIG, hi=BIG):
    return w.intersect(box(-BIG, BIG, -BIG, BIG, lo, hi))


def _vol(w):
    try:
        return sum(v.Volume() for v in w.vals())
    except Exception:
        return -1.0


class Shell:
    """Thin-wall panel kept as (outer solid, inner solid): every trim / cut / split is applied to the solid
    outer loft and the inner loft is subtracted once at the end. Booleans of solids against boxes and
    cylinders are far more robust (and faster) in OCC than booleans against thin B-spline shells.
    The operations are also recorded, so solid() can fall back to the shell-first order (and a fuzzy
    tolerance) when OCC silently returns an un-hollowed or empty result; every panel is volume-checked."""

    def __init__(self, outer, inner, loft_outer=None, ops=()):
        self.o, self.i = outer, inner
        self.loft = loft_outer if loft_outer is not None else outer
        self.ops = tuple(ops)

    @classmethod
    def make(cls, secs, t, axis="z", extend=("start", "end")):
        i_ax = "xyz".index(axis)
        sgn = 1 if secs[-1][0][i_ax] > secs[0][0][i_ax] else -1
        inner = []
        for k, sc in enumerate(secs):
            c = list(sc[0])
            if k == 0 and "start" in extend:
                c[i_ax] -= 4.0 * sgn
            if k == len(secs) - 1 and "end" in extend:
                c[i_ax] += 4.0 * sgn
            inner.append((tuple(c),) + tuple(max(v - t, 1.0) for v in sc[1:5]) + (sc[5],))
        o = aloft(secs, axis)
        return cls(o, aloft(inner, axis), o)

    def _n(self, w, op):
        return Shell(w, self.i, self.loft, self.ops + (op,))

    def cut(self, c):
        return self._n(self.o.cut(c), ("cut", c))

    def cuts(self, cs):
        sh = self
        for c in cs:
            sh = sh.cut(c)
        return sh

    def keep(self, region):
        return self._n(self.o.intersect(region), ("int", region))

    def kx(self, lo=-BIG, hi=BIG):
        return self.keep(box(lo, hi, -BIG, BIG, -BIG, BIG))

    def ky(self, lo=-BIG, hi=BIG):
        return self.keep(box(-BIG, BIG, lo, hi, -BIG, BIG))

    def kz(self, lo=-BIG, hi=BIG):
        return self.keep(box(-BIG, BIG, -BIG, BIG, lo, hi))

    def plane(self, point, normal, positive=True):
        """Trim to one side of a plane: the trimmed edge is open (a panel edge or a window)."""
        r = plane_cut(box(-BIG, BIG, -BIG, BIG, -BIG, BIG), point, normal, positive)
        return self.keep(r)

    def facet(self, point, normal, t):
        """Trim to the side the normal points to and close the cut with a flat wall of thickness t (a chamfer facet):
        the inner solid is trimmed by the same plane moved t inwards."""
        n = [c / math.sqrt(sum(v * v for v in normal)) for c in normal]
        sh = self.plane(point, normal, True)
        p_in = tuple(point[k] + t * n[k] for k in range(3))
        inner = self.i.intersect(plane_cut(box(-BIG, BIG, -BIG, BIG, -BIG, BIG), p_in, normal, True))
        return Shell(sh.o, inner, sh.loft, sh.ops)

    def _replay(self, w, tol=None):
        for kind, arg in self.ops:
            w = (w.cut(arg, tol=tol) if tol else w.cut(arg)) if kind == "cut" else (w.intersect(arg, tol=tol) if tol else w.intersect(arg))
        return w

    def solid(self, label=""):
        vo = _vol(self.o)
        ok = lambda r, v: v > 0 and v < 0.45 * vo
        r = self.o.cut(self.i)
        v = _vol(r)
        if ok(r, v):
            return r
        for attempt in ("fuzzy", "shell_first", "shell_first_fuzzy"):
            try:
                if attempt == "fuzzy":
                    r2 = self.o.cut(self.i, tol=1e-3)
                elif attempt == "shell_first":
                    r2 = self._replay(self.loft.cut(self.i))
                else:
                    r2 = self._replay(self.loft.cut(self.i, tol=1e-3), tol=1e-3)
                v2 = _vol(r2)
                if ok(r2, v2):
                    print(f"   {label}: shell boolean recovered ({attempt}), {v2 / 1000:.1f} cm3")
                    return r2
            except Exception:
                pass
        print(f"!! {label}: shell boolean suspect, {v / 1000:.1f} cm3 of {vo / 1000:.1f} cm3 region")
        return r


def screws(add, group, outer, probes, name, mirror=True, body=None, d=4.6):
    """Button-head screws where rays (origin, direction) meet the outer loft."""
    for k, (o, dvec) in enumerate(probes):
        p = probe_surface(outer, o, dvec)
        if p is None:
            continue
        n = tuple(-c for c in dvec)
        add(group, "ti", f"{name}_screw{k}", screw_at(p, n, d=d), mirror=mirror, body=body)


def knee_rod_cutters(frame="thigh", clr=4.0):
    """Push-rod (+ rod-end eye) positions over the knee range 0..130 deg, inflated by clr, expressed in the
    thigh or the shank frame (data/knee_fourbar.json). Each is cut from the shell separately (much faster
    than one boolean with the swept union); positions that never reach the shell are skipped."""
    import numpy as np
    import sys
    sys.path.insert(0, str(HERE.parent / "calc"))
    from kestrel.linkages import KneeFourBar, rot
    kf = json.loads((HERE.parent / "data" / "knee_fourbar.json").read_text())
    kb = KneeFourBar(kf["r1"], kf["r2"], math.radians(kf["beta_deg"]), math.radians(kf["phi0_deg"]), A=kf["A"])
    th = np.radians(np.arange(0, 131, 10))
    ph, _, _ = kb.solve(th)
    cut = []
    for t, p in zip(th, ph):
        C = (kb.A + kb.r1 * np.array([math.cos(p), math.sin(p)])) * 1e3
        S = (rot(t) @ (kb.r2 * kb.u0)) * 1e3
        if frame == "shank":       # express in the shank frame: rotate thigh-frame points by -theta about the knee
            R = rot(-t)
            C, S = R @ C, R @ S
        c3, s3 = (C[0], ROD_Y, KZ + C[1]), (S[0], ROD_Y, KZ + S[1])
        deg = round(math.degrees(t))
        if frame == "thigh":
            if deg >= 30:
                cut.append(rod_between(c3, s3, 7 + clr))
            if 40 <= deg <= 110:
                cut.append(cyl(11 + clr, 14 + 2 * clr, "y", c3))
            if deg >= 120:
                cut.append(cyl(11 + clr, 14 + 2 * clr, "y", s3))
        else:
            if deg % 20 == 0:
                cut.append(rod_between(c3, s3, 7 + clr))
            if deg == 0:
                cut.append(cyl(11 + clr, 14 + 2 * clr, "y", s3))
    return cut


def cut_all(w, cutters):
    for c in cutters:
        w = w.cut(c)
    return w


# ================================================================== HEAD
HEAD = [((10, 0, 1566), 56, 60, 54, 54, 2.3), ((10, 0, 1588), 92, 84, 84, 84, 2.5), ((10, 0, 1622), 106, 96, 94, 94, 2.7),
        ((10, 0, 1662), 108, 100, 96, 96, 2.8), ((10, 0, 1698), 99, 94, 88, 88, 2.6), ((10, 0, 1720), 74, 72, 66, 66, 2.3),
        ((10, 0, 1731), 44, 42, 40, 40, 2.0)]


def head(add, add_many):
    sh = Shell.make(HEAD, WALL["head"])
    sh = sh.cut(rbox(202, 262, 82, 29, (118, 0, 1652))).cut(cyl(40, 60, "z", (0, 0, 1735)))
    for s in (1, -1):
        sh = sh.cut(cyl(25, 40, "y", (-18, s * 95, 1648)))
    nrm = (-0.08, 0, 1)                                              # jaw line z = 1598 + 0.08 x
    helmet = sh.plane((0, 0, 1598 + G2), nrm, True)
    jaw = sh.plane((0, 0, 1598 - G2), nrm, False)
    for z in (1580, 1586, 1592):                                     # speaker / mic slots in the chin
        jaw = jaw.cut(rbox(40, 46, 2.4, 1.0, (112, 0, z)))
    add("head", "shell", "head_shell", helmet, step=True)
    add("head", "trim", "head_jaw", jaw, step=True)
    vis = aloft(offs(HEAD, -1.0)).intersect(rbox(199.5, 259, 79.5, 27.5, (118, 0, 1652))).cut(aloft(offs(HEAD, -3.6)))
    add("head", "visor", "visor", vis, step=True)
    for s, nm in ((1, "L"), (-1, "R")):                              # temple light slivers behind the visor ends
        yr = (40, 120) if s > 0 else (-120, -40)
        add("head", "accent", f"visor_light_{nm}", band(HEAD, 0.35, 1.2, box(9.5, 13.5, yr[0], yr[1], 1638, 1666)))
        add_many("head", joint_cap(23, "y" if s > 0 else "-y", (-18, s * 92.5, 1648), f"ear_{nm}", bolts=6, accent=True))
    # crown: LiDAR collar, window and cap (Mid-360 optical head clear of the shell, -7..+52 deg)
    add("head", "joint", "lidar_collar", lambda: tube(46, 33.5, 8, "z", (0, 0, 1724)))
    add("head", "alu", "lidar_collar_ring", lambda: tube(47, 45.5, 1.4, "z", (0, 0, 1728.6)))
    add("head", "visor", "lidar_window", lambda: tube(34.5, 32.8, 14, "z", (0, 0, 1735)))
    add("head", "joint", "lidar_cap", lambda: cyl(35, 8, "z", (0, 0, 1746)).edges(">Z").fillet(3))
    screws(add, "head", sh.loft, [((-40, 150, 1586), (0, -1, 0)), ((-40, -150, 1586), (0, 1, 0))], "jaw", mirror=False)


# ================================================================== NECK
def neck(add, add_many):
    secs = [((0, 0, 1497), 51, 51, 52, 52, 2.2), ((0, 0, 1530), 48, 46, 50, 50, 2.3), ((2, 0, 1566), 46, 44, 47, 47, 2.3)]
    # chin relief: the front of the sleeve rim is chamfered so the head mounting plate (37 mm above the pitch axis)
    # passes it to +56 deg neck pitch with 2 mm (plane 0.829 x + 0.559 (z - NP) <= 34.5)
    sl = Shell.make(secs, WALL["neck"]).plane((41.6, 0, NP), (-0.829, 0, -0.559), True)
    add("neck", "trim", "neck_sleeve", sl, step=True, body="neck_link")
    add("neck", "alu", "neck_ring", lambda: tube(54.8, 53.0, 2.0, "z", (0, 0, 1504)), body="neck_link")


# ================================================================== TORSO
TQ = (3.4, 3.4, 4.8, 4.8)     # rounder front, squarer back (the two 175 mm packs fill the rear corners)
TORSO = [((0, 0, 1150), 124, 134, 126, 126, (3.3, 3.3, 4.8, 4.8)), ((0, 0, 1167), 126, 134, 126.5, 126.5, TQ),
         ((0, 0, 1185), 128, 134, 127, 127, TQ), ((0, 0, 1250), 128, 134, 128, 128, TQ),
         ((0, 0, 1320), 126, 134, 128, 128, TQ), ((0, 0, 1385), 120, 134, 128, 128, (3.2, 3.2, 4.8, 4.8)), ((0, 0, 1440), 108, 121, 126, 126, 2.9),
         ((0, 0, 1480), 90, 104, 120, 120, 2.6), ((0, 0, 1505), 68, 76, 90, 90, 2.3), ((0, 0, 1520), 55, 59, 62, 62, 2.1)]
PACK = [((-92, 0, 1412), 108, 108, 62, 62, 5.0), ((-142, 0, 1412), 108, 108, 62, 62, 5.0), ((-160, 0, 1412), 99, 99, 56, 56, 4.2),
        ((-168, 0, 1412), 82, 82, 45, 45, 3.0), ((-170.6, 0, 1412), 58, 58, 30, 30, 2.3)]


def torso(add, add_many):
    sh = Shell.make(TORSO, WALL["torso"])
    sh = sh.cut(cyl(72, 400, "y", (0, 0, WP)))                             # concentric relief over the waist-pitch drum
    sh = sh.kz(hi=1515).cut(cyl(57, 80, "z", (0, 0, 1517)))                 # collar opening for the neck sleeve
    sh = sh.facet((52, 0, 1505), (-1.39, 0, -1), WALL["torso"])            # closed collar chamfer z <= 1505 - 1.39 (x - 52):
                                                                           # the jaw clears the chest by 2 mm to +54 deg neck pitch
    for s in (1, -1):
        sh = sh.cut(cyl(67, 60, "y", (0, s * 128, SZ)))                    # KH-25 shoulder-pitch output through the side wall
    sh = sh.cut(aloft([((-200, 0, 1412), 110.5, 110.5, 64.5, 64.5, 5.0), ((-96, 0, 1412), 110.5, 110.5, 64.5, 64.5, 5.0)], axis="x"))  # pack opening

    def shield(grow):          # white front shield, bounded by two leaning planes y = +-(84 + 0.14 (z - 1150))
        r = box(22.0 - grow, BIG, -BIG, BIG, -BIG, BIG)
        r = plane_cut(r, (0, 84 + grow, 1150), (0, -1, 0.14), True)
        return plane_cut(r, (0, -84 - grow, 1150), (0, 1, 0.14), True)
    front = sh.keep(shield(-G2))
    add("torso", "shell", "chest_plate", front.kz(lo=1252 + G2), step=True)
    add("torso", "shell", "abdomen_plate", front.kz(hi=1252 - G2).cut(rbox(200, 102, 30, 6, (120, 0, 1177))), step=True)
    add("torso", "visor", "abdomen_sensor_window", band(TORSO, 0.2, 1.4, box(40, BIG, -50, 50, 1163, 1191)))
    add("torso", "accent", "chest_light", band(TORSO, 0.35, 1.2, box(60, BIG, -1.3, 1.3, 1318, 1410)))
    sides = sh.kx(lo=-60 + G2).cut(shield(G2))
    add("torso", "trim", "torso_side_L", sides.ky(lo=G2), step=True)
    add("torso", "trim", "torso_side_R", sides.ky(hi=-G2))
    back = sh.kx(hi=-60 - G2)
    door = back.kz(hi=1346 - G2)
    hatch = lambda s, g: box(-BIG, -60, s * 53 - 44 - g, s * 53 + 44 + g, 1168 - g, 1338 + g).edges("|X").fillet(16 + g)
    df = door
    for s in (1, -1):
        df = df.cut(hatch(s, G2))
    add("torso", "shell", "back_door", df, step=True)      # rear service door frame
    for s, nm in ((1, "A"), (-1, "B")):                            # one gasketed hatch per pack (docs/03 §10.1)
        add("torso", "shell", f"battery_hatch_{nm}", door.keep(hatch(s, -G2)), step=(s > 0))
        add("torso", "trim", f"hatch_latch_{nm}", lambda s=s: rbox(10, 44, 12, 3, (-136, s * 53, 1316)))
        add("torso", "accent", f"hatch_led_{nm}", band(TORSO, 0.35, 1.2, box(-BIG, -100, s * 53 - 12, s * 53 + 12, 1298, 1301)))
    add("torso", "shell", "back_upper", back.kz(lo=1346 + G2), step=True)
    add("torso", "alu", "collar_ring", lambda: tube(56.9, 54.5, 3.0, "z", (0, 0, 1513.5)))
    screws(add, "torso", sh.loft, [((-300, s * 53 + d, z), (1, 0, 0)) for s in (1, -1) for d in (-32, 32) for z in (1180,)], "hatch", mirror=False)
    screws(add, "torso", sh.loft, [((300, s * 66, z), (-1, 0, 0)) for s in (1, -1) for z in (1290, 1400)], "chest", mirror=False)
    # radiator back pack (graphite): 2 x 92 mm fans exhaust through the grille
    pk = Shell.make(PACK, WALL["pack"], axis="x", extend=("start",)).cut(aloft(offs(TORSO, -WALL["torso"] - 0.5)))
    pk = pk.cuts([rbox(40, 164, 4.2, 1.8, (-172, 0, 1377 + 10 * k)) for k in range(8)])
    add("torso", "trim", "radiator_pack", pk, step=True)
    add("torso", "accent", "pack_status_light", band(PACK, 0.3, 1.2, box(-BIG, -150, -60, 60, 1361, 1364), axis="x"))
    screws(add, "torso", pk.loft, [((-400, s * 86, z), (1, 0, 0)) for s in (1, -1) for z in (1372, 1454)], "pack", mirror=False)


# ================================================================== PELVIS
# band z 1022..1112 (Mk II clearance pass: +16 mm over the raised hip-yaw stack and deck; the sides stay open over the drums)
PELVIS = [((-4, 0, 1012), 98, 104, 152, 152, 3.4), ((-4, 0, 1046), 104, 110, 156, 156, 3.6), ((-4, 0, 1084), 98, 104, 156, 156, 3.6),
          ((-4, 0, 1098), 92, 96, 152, 152, 3.2), ((-4, 0, 1112), 80, 84, 128, 128, 2.8)]


def pelvis(add, add_many):
    sh = Shell.make(PELVIS, WALL["pelvis"], extend=("start",)).kz(lo=1022).ky(-150.5, 150.5)   # open sides show the hip-yaw drums
    for s in (1, -1):
        sh = sh.cut(cyl(100, 170, "y", (0, s * HY, HZ)))                  # arches over the hips (thigh top sweep r <= 96)
    sh = sh.cut(cyl(82, 200, "z", (0, 0, 1100)))                          # waist-link opening (waist-pitch drum sweeps r 75)
    add("pelvis", "shell", "pelvis_front", sh.kx(lo=-10 + G2), step=True)
    add("pelvis", "shell", "pelvis_rear", sh.kx(hi=-10 - G2), step=True)
    add("pelvis", "accent", "belt_light", band(PELVIS, 0.35, 1.2, box(60, BIG, -40, 40, 1054, 1057)))
    low = [((0, 0, 902), 80, 84, 11, 11, 3.0), ((0, 0, 920), 94, 98, 15, 15, 3.2), ((0, 0, 934), 98, 104, 17, 17, 3.4),
           ((0, 0, 1028), 100, 108, 17, 17, 3.4)]
    lo = Shell.make(low, WALL["pelvis"], extend=("end",))
    add("pelvis", "trim", "pelvis_front_lower", lo.kx(lo=62), step=True)          # no rear piece: it would block hip roll
    screws(add, "pelvis", sh.loft, [((300, s * 120, 1068), (-1, 0, 0)) for s in (1, -1)], "pelvis", mirror=False)


# ================================================================== LEGS (left, mirrored)
# medial face flattened (Mk II hip-roll pass): medial semi-axis 74-76 puts the outer face at y 23-25.5 with the inner face
# >= 2 mm off the medial thigh plate (y 30, x +-30); front-medial exponents 3.8-4.2 keep it a flat face rather than a bulge
TH_N1 = (5.5, 3.4, 3.4, 3.9)
# lateral semi-axis 73-74.5 over z 630-840 (lateral face y 172-173.5, 3 mm round the push-rod sweep): the hanging hand's
# thumb (y >= 175.5) keeps >= 3.4 mm to the thigh over hip pitch -50..+18 deg
THIGH = [((0, 99, 905), 88, 86, 76, 77, (4.5, 3.2, 3.2, 3.6)), ((0, 99, 840), 95, 89, 74.5, 76, TH_N1),
         ((0, 99, 770), 98, 89, 73, 74, (4.4, 3.4, 3.4, 3.9)), ((0, 99, 700), 93, 85, 73, 73.8, (4.0, 3.8, 3.2, 3.8)),
         ((0, 99, 630), 80, 75, 73, 73.8, (3.6, 3.8, 3.0, 3.6)), ((0, 99, 570), 64, 64, 72, 74.5, (3.0, 4.0, 2.8, 3.4)),
         ((0, 99, 535), 58, 60, 70, 75, (2.8, 4.2, 2.6, 3.4))]
SH_N = (3.0, 3.0, 4.2, 4.2)
SHANK = [((0, 105, 478), 50, 60, 46, 47, (2.6, 2.6, 3.0, 3.0)), ((0, 105, 440), 46, 78, 47, 48, (2.8, 2.8, 3.8, 3.8)),
         ((0, 105, 370), 46, 88, 47, 48, SH_N), ((0, 105, 300), 43, 87, 48, 49, (3.0, 3.0, 4.4, 4.4)),
         ((0, 105, 230), 38, 78, 49, 49, (2.8, 2.8, 4.5, 4.5)), ((0, 105, 170), 33, 73, 49, 49, (2.6, 2.6, 4.5, 4.5)),
         ((0, 105, 130), 31, 71, 49, 49, (2.5, 2.5, 4.5, 4.5))]
BOOT_N = (2.5, 2.5, 4.5, 4.5)
BOOT = [((0, 105, 134), 29, 69, 48, 48, BOOT_N), ((0, 105, 120), 37, 74, 54, 54, BOOT_N), ((0, 105, 108), 36, 72, 53, 53, BOOT_N),
        ((0, 105, 95), 40, 75, 56, 56, BOOT_N), ((0, 105, 82), 39, 74, 56, 56, BOOT_N), ((0, 105, 66), 46, 75, 56, 56, (2.6, 2.6, 4.5, 4.5))]
FOOT = [((-82, HY, 28), 12, 12, 6, 14, 2.4), ((-74, HY, 30), 47, 47, 24, 24, 3.4), ((-52, HY, 32), 58, 56, 34, 26, 4.0),
        ((0, HY, 33), 60, 58, 38, 28, 4.0), ((60, HY, 32), 61, 59, 31, 28, 4.0), ((120, HY, 30), 62, 60, 21, 26, 4.0),
        ((160, HY, 28), 58, 56, 15, 24, 3.6), ((186, HY, 25), 46, 44, 10, 20, 3.0), ((200, HY, 21), 10, 9, 3, 13, 2.4)]
SOLE = [((-83, HY, 5.5), 13, 13, 5.5, 5.5, 6.0), ((-74, HY, 5.5), 47, 47, 5.5, 5.5, 6.0), ((-52, HY, 5.5), 57, 55, 5.5, 5.5, 6.0),
        ((60, HY, 5.5), 60, 58, 5.5, 5.5, 6.0), ((120, HY, 5.5), 61, 59, 5.5, 5.5, 6.0), ((160, HY, 5.5), 57, 55, 5.5, 5.5, 6.0),
        ((186, HY, 5.5), 45, 43, 5.5, 5.5, 6.0), ((201, HY, 5.5), 11, 10, 5.5, 5.5, 6.0)]


def legs(add, add_many):
    # ---------------- hip: KA-130H lateral cap (on the roll-pitch bracket side), gluteal pod around the KA-110P
    add_many("l_hip", joint_cap(60, "y", (0, 157.5, HZ), "hip_cap", bolts=12, accent=True, t=4.0), mirror=True, body="l_hip_roll")
    gp = [((-89, HY, HZ), 71, 71, 71, 71, 2.3), ((-100, HY, HZ), 71, 71, 71, 71, 2.4), ((-150, HY, HZ), 71, 71, 71, 71, 2.6),
          ((-176, HY, HZ), 60, 60, 60, 60, 2.4), ((-188, HY, HZ), 30, 30, 30, 30, 2.0)]
    pod = Shell.make(gp, WALL["glute"], axis="x", extend=("start",))
    pod = pod.cut(box(-170, -86, HY - 32, HY + 32, 975, 1000)).cut(box(-186, -168, HY - 44, HY + 44, 946, 1000))
    pod = pod.plane((0, 0, HZ), (-1, 0, 1.80), True)        # front-bottom chamfer 61 deg off the hip-pitch axis: the KA-130K
                                                            # and the lateral thigh plate pass under it to +30 deg extension
    add("l_hip", "shell", "glute_pod", pod, mirror=True, step=True, body="l_hip_yaw")
    add_many("l_hip", joint_cap(26, "-x", (-188, HY, HZ), "glute_cap", bolts=6, accent=False), mirror=True, body="l_hip_yaw")
    # ---------------- thigh
    th = Shell.make(THIGH, WALL["thigh"])
    th = th.cut(cyl(88, 220, "y", (0, 99, HZ)))                              # concentric with the hip-pitch axis
    th = th.plane((0, 0, 839), (0.384, 0, -1), True)                         # top edge: z < 839 + 0.384 x
    th = th.plane((0, 0, 828), (0.577, 0, -1), True)                         # rear-top edge z < 828 + 0.577 x: clears the
                                                                             # gluteal pod at +30 deg hip extension
    th = th.cut(cyl(58, 220, "y", (0, 99, KZ)))                              # knee drum (r 55) + patella clearance
    # popliteal window: behind x = -8 the thigh ends on the line z = 617 - 0.85 x (624 at x -8, 689 at the rear face); with
    # the calf top cut (z = 476 + 0.84 x) the shank folds into it to 130 deg with >= 4 mm (docs/02 §8)
    th = th.cut(plane_cut(box(-BIG, -8, -BIG, BIG, -BIG, BIG), (0, 0, 617), (-0.85, 0, -1), True))
    th = th.cut(box(-BIG, BIG, -BIG, BIG, 800, 1100).cut(cyl(98, 240, "y", (0, 99, HZ))))       # top within r 98: clears the pelvis arches
    th = th.cuts(knee_rod_cutters("thigh"))
    add("l_thigh", "shell", "thigh_front", th.ky(hi=151 - G2).kx(lo=-25 + G2), mirror=True, step=True)
    add("l_thigh", "shell", "thigh_rear", th.ky(hi=151 - G2).kx(hi=-25 - G2), mirror=True, step=True)
    add("l_thigh", "trim", "thigh_drive_cover", th.ky(lo=151 + G2), mirror=True, step=True)
    add("l_thigh", "accent", "thigh_light", band(THIGH, 0.35, 1.2, box(52, 55, 160, BIG, 650, 800)), mirror=True)
    screws(add, "l_thigh", th.loft, [((x, 400, z), (0, -1, 0)) for x, z in ((-48, 610), (40, 610), (-58, 790), (34, 800))], "cover")
    # knee: caps on the hub ends (they turn with the shank); the lateral cap stands off outside the push-rod plane
    add("l_shank", "frame", "knee_cap_standoff", lambda: cyl(10, 16.5, "y", (0, 160.25, KZ)), mirror=True)
    add_many("l_shank", joint_cap(36, "y", (0, 168.5, KZ), "knee_cap_lat", bolts=6, accent=True), mirror=True)
    add_many("l_shank", joint_cap(36, "-y", (0, 29, KZ), "knee_cap_med", bolts=6, accent=False, t=3.5), mirror=True)  # low medial
    # popliteal web: recessed graphite panel closing the thigh between the plates, behind the knee drum and under the KA-130K
    # (x -8..-6, outside the shank sweep, which the calf top cut keeps at x < -8 for every knee angle)
    add("l_thigh", "trim", "popliteal_web", lambda: rbox(2.2, 102, 128, 1.0, (-6.9, KNEE_ACT_Y, 617)), mirror=True, step=True)
    add("l_shank", "joint", "knee_cover", lambda: tube(55, 52.5, 82, "y", (0, KNEE_ACT_Y, KZ)), mirror=True)
    pat = [((62, 99, 458), 9, 4, 26, 26, 2.2), ((65, 99, 490), 13, 7, 34, 34, 2.4), ((62, 99, 526), 9, 4, 28, 28, 2.2)]
    add("l_shank", "shell", "knee_cap", aloft(pat), mirror=True)
    # ---------------- shank
    sk = Shell.make(SHANK, WALL["shank"]).cut(cyl(57, 220, "y", (0, 105, KZ))).kz(hi=478)
    # calf top-rear cut: behind x = -20 the calf ends on z = 476 + 0.84 x (459 at x -20, 402 at the rear face), the lower
    # half of the popliteal window; at 130 deg knee flexion it lies >= 4 mm outside everything the thigh carries
    sk = sk.cut(plane_cut(box(-BIG, -20, -BIG, BIG, -BIG, BIG), (0, 0, 476), (-0.84, 0, 1), True))
    sk = sk.cuts(knee_rod_cutters("shank"))
    kf = json.loads((HERE.parent / "data" / "knee_fourbar.json").read_text())
    ang = math.degrees(math.radians(kf["beta_deg"]))
    arm = box(0, kf["r2"] * 1e3 + 18, 141.5, 157.5, -17, 17).rotate((0, 0, 0), (0, 1, 0), -ang).translate((0, 0, KZ))
    sk = sk.cut(arm)                                                        # recess for the integral shank crank
    add("l_shank", "shell", "shin_front", sk.kx(lo=-22 + G2), mirror=True, step=True)
    add("l_shank", "trim", "calf_rear", sk.kx(hi=-22 - G2), mirror=True, step=True)
    screws(add, "l_shank", sk.loft, [((x, 400, z), (0, -1, 0)) for x, z in ((-60, 200), (-70, 400))], "calf")
    screws(add, "l_shank", sk.loft, [((300, 105, z), (-1, 0, 0)) for z in (210, 400)], "shin", d=4.2)
    # ---------------- ankle boot (TPU bellows) and foot
    add("l_foot", "boot", "ankle_boot", Shell.make(BOOT, WALL["boot"]), mirror=True, body="l_ankle")
    ft = Shell.make(FOOT, WALL["foot"], axis="x", extend=()).kz(lo=11.6)
    ft = ft.cut(rbox(124, 108, 80, 0, (-13, HY, 84)).edges("|Z").fillet(34))
    add("l_foot", "shell", "foot_shell", ft.kx(lo=-40 + G2, hi=130 - G2), mirror=True, step=True)
    add("l_foot", "trim", "toe_cap", ft.kx(lo=130 + G2), mirror=True, step=True)
    add("l_foot", "trim", "heel_counter", ft.kx(hi=-40 - G2), mirror=True, step=True)
    add("l_foot", "accent", "foot_light", band(FOOT, 0.35, 1.2, box(20, 90, HY + 40, BIG, 27, 29.5), axis="x"), mirror=True)
    sole = aloft(SOLE, axis="x")
    for x in range(-66, 190, 14):
        if abs(x - 130) > 8:
            sole = sole.cut(box(x - 2.2, x + 2.2, HY - 70, HY + 70, -1, 2.4))
    sole = sole.cut(box(127.5, 132.5, HY - 70, HY + 70, -1, 5.0))           # toe-break flex groove
    sole = sole.cut(box(-90, 210, HY - 2, HY + 2, -1, 1.6))
    add("l_foot", "sole", "sole", sole, mirror=True, step=True)
    screws(add, "l_foot", ft.loft, [((160, HY + s * 30, 200), (0, 0, -1)) for s in (1, -1)], "toe", d=4.0)
    screws(add, "l_foot", ft.loft, [((-300, HY + s * 30, 40), (1, 0, 0)) for s in (1, -1)], "heel", d=4.0)


# ================================================================== ARMS (left, mirrored)
UPPER = [((0, SY, 1302), 55, 55, 55, 55, 2.2), ((0, SY, 1255), 52, 50, 54, 50, 2.4), ((0, SY, 1205), 50, 47, 52, 48, 2.5),
         ((0, SY, 1165), 50, 48, 50, 48, 2.6), ((0, SY, 1130), 50, 50, 48, 48, 2.6)]
FORE = [((0, SY, 1074), 45, 45, 44, 44, 2.4), ((0, SY, 1040), 44, 43, 42, 42, 2.5), ((0, SY, 990), 40, 40, 39, 38, 2.6),
        ((0, SY, 945), 37, 37, 36, 35, 2.7), ((0, SY, 905), 35, 35, 34, 34, 2.7), ((0, SY, 884), 30, 30, 30, 29, 2.4)]
DELTOID = [((3, SY, SZ), 60, 60, 60, 60, 2.2), ((-8, SY, SZ), 67, 67, 67, 67, 2.35), ((-55, SY, SZ), 67.5, 67.5, 67.5, 67.5, 2.45),
           ((-92, SY, SZ), 62, 62, 62, 62, 2.3), ((-103, SY, SZ), 40, 40, 40, 40, 2.1)]


def arms(add, add_many):
    # deltoid pod around the KH-25 roll actuator: max radius 71.5 from the roll axis; the KH-20 yaw
    # collar stays outside r 76 -> the full roll range is free of contact
    dp = Shell.make(DELTOID, WALL["deltoid"], axis="x", extend=("start",)).cut(box(-92, 10, 120, 143, SZ - 62, SZ + 62))
    add("l_shoulder", "shell", "deltoid_cap", dp.kx(lo=-70 + G2), mirror=True, step=True)
    add("l_shoulder", "trim", "deltoid_rear", dp.kx(hi=-70 - G2), mirror=True, step=True)
    add_many("l_shoulder", joint_cap(24, "-x", (-103, SY, SZ), "deltoid_cap", bolts=6, accent=False), mirror=True)
    add_many("l_upper_arm", joint_cap(58, "x", (14, SY, SZ), "shoulder_cap", bolts=10, accent=True), mirror=True, body="l_upper_arm_a")
    ua = Shell.make(UPPER, WALL["arm"]).plane((0, 0, 1188.5), (-0.33, 0, 1), True)   # bottom edge rises at the front (elbow flexion)
    add("l_upper_arm", "shell", "upper_arm_front", ua.ky(lo=185 + G2), mirror=True, step=True)
    add("l_upper_arm", "trim", "upper_arm_rear", ua.ky(hi=185 - G2), mirror=True, step=True)
    add("l_upper_arm", "alu", "yaw_ring", lambda: tube(50.2, 48.0, 2.0, "z", (0, SY, SH_YAW_Z)), mirror=True, body="l_upper_arm_a")
    add_many("l_forearm", joint_cap(46, "y", (0, SY + 38.5, EZ), "elbow_cap_lat", bolts=8, accent=False), mirror=True)
    add_many("l_forearm", joint_cap(46, "-y", (0, SY - 38.5, EZ), "elbow_cap_med", bolts=8, accent=False), mirror=True)
    fa = Shell.make(FORE, WALL["arm"]).kz(hi=1066)
    add("l_forearm", "shell", "forearm_front", fa.ky(lo=184 + G2), mirror=True, step=True)
    add("l_forearm", "trim", "forearm_rear", fa.ky(hi=184 - G2), mirror=True, step=True)
    add("l_forearm", "accent", "forearm_light", band(FORE, 0.3, 1.0, box(-1.2, 1.2, SY + 20, BIG, 930, 1030)), mirror=True)
    add("l_hand", "joint", "wrist_cover", lambda: cyl(28, 44, "y", (0, SY, WRZ)).edges().fillet(4), mirror=True)
    add("l_hand", "alu", "wrist_ring", lambda: tube(28.6, 27.2, 1.6, "y", (0, SY + 16, WRZ)), mirror=True)
    from hand import hand_parts
    for mat, name, shp in hand_parts(SY, WRZ):
        add("l_hand", mat, name, shp, mirror=True, step=(name in ("palm_back", "palm_front")))


def exterior(add, add_many):
    for fn in (head, neck, torso, pelvis, legs, arms):
        fn(add, add_many)
