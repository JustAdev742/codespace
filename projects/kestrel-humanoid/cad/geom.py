"""Geometry helpers for the KESTREL K1 CadQuery model (all dimensions in mm)."""
from __future__ import annotations

import math

import cadquery as cq

AX = {"x": cq.Vector(1, 0, 0), "y": cq.Vector(0, 1, 0), "z": cq.Vector(0, 0, 1)}


def superellipse_pts(a, b, n=2.0, m=56, cx=0.0, cy=0.0):
    pts = []
    for i in range(m):
        t = 2 * math.pi * i / m
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        y = b * math.copysign(abs(s) ** (2 / n), s)
        pts.append((cx + x, cy + y))
    return pts


def section_wire(center, a, b, n=2.0, axis="z", m=56, ox=0.0, oy=0.0):
    """Closed periodic spline section. axis = normal direction ('z' sections lie in XY, 'x' in YZ, 'y' in XZ)."""
    cx, cy, cz = center
    vs = []
    for u, v in superellipse_pts(a, b, n, m, ox, oy):
        if axis == "z":
            vs.append(cq.Vector(cx + u, cy + v, cz))
        elif axis == "x":
            vs.append(cq.Vector(cx, cy + u, cz + v))
        else:
            vs.append(cq.Vector(cx + u, cy, cz + v))
    e = cq.Edge.makeSpline(vs, periodic=True)
    return cq.Wire.assembleEdges([e])


def loft(sections, axis="z"):
    """sections: list of (center(x,y,z), a, b, n[, ox, oy]) -> solid."""
    wires = []
    for s in sections:
        c, a, b, n = s[:4]
        ox, oy = (s[4], s[5]) if len(s) > 4 else (0.0, 0.0)
        wires.append(section_wire(c, a, b, n, axis, ox=ox, oy=oy))
    return cq.Workplane("XY").add(cq.Solid.makeLoft(wires, False))


def shell_open_ends(solid_wp, t, axis="z"):
    sel = {"z": "<Z or >Z", "x": "<X or >X", "y": "<Y or >Y"}[axis]
    return solid_wp.faces(sel).shell(-t)


def halfspace(axis, sign, offset=0.0, size=4000.0):
    """Box occupying sign*(coord - offset) > 0 along axis."""
    b = cq.Workplane("XY").box(size, size, size)
    v = [0.0, 0.0, 0.0]
    i = "xyz".index(axis)
    v[i] = offset + sign * size / 2
    return b.translate(tuple(v))


def _vol(wp):
    try:
        return sum(v.Volume() for v in wp.vals())
    except Exception:
        return 0.0


def split(wp, axis, at=0.0, gap=1.0):
    """Split a shape into (negative side, positive side) with a panel gap.

    Guards against an OCC boolean edge case on open shells where an intersect returns the
    filled region: if a half is larger than the whole, it is recomputed as whole - other half.
    """
    whole = _vol(wp)
    pos = wp.intersect(halfspace(axis, +1, at + gap / 2))
    neg = wp.intersect(halfspace(axis, -1, at - gap / 2))
    if _vol(pos) > whole * 1.01:
        pos = wp.cut(halfspace(axis, -1, at + gap / 2))
    if _vol(neg) > whole * 1.01:
        neg = wp.cut(halfspace(axis, +1, at - gap / 2))
    return neg, pos


def cyl(r, h, axis="z", center=(0, 0, 0)):
    """Cylinder centred at `center` along axis."""
    w = cq.Workplane("XY").circle(r).extrude(h).translate((0, 0, -h / 2))
    if axis == "x":
        w = w.rotate((0, 0, 0), (0, 1, 0), 90)
    elif axis == "y":
        w = w.rotate((0, 0, 0), (1, 0, 0), 90)
    return w.translate(center)


def tube(ro, ri, h, axis="z", center=(0, 0, 0)):
    return cyl(ro, h, axis, center).cut(cyl(ri, h + 2, axis, center))


def rod_between(p0, p1, r):
    v = cq.Vector(*p1) - cq.Vector(*p0)
    L = v.Length
    w = cq.Workplane("XY").circle(r).extrude(L)
    z = cq.Vector(0, 0, 1)
    axis = z.cross(v)
    ang = math.degrees(math.acos(max(-1, min(1, z.dot(v) / L))))
    if axis.Length > 1e-9:
        w = w.rotate((0, 0, 0), axis.toTuple(), ang)
    elif v.z < 0:
        w = w.rotate((0, 0, 0), (1, 0, 0), 180)
    return w.translate(p0)


def rbox(lx, ly, lz, r=3.0, center=(0, 0, 0)):
    b = cq.Workplane("XY").box(lx, ly, lz)
    if r > 0:
        try:
            b = b.edges().fillet(min(r, min(lx, ly, lz) / 2.2))
        except Exception:
            pass
    return b.translate(center)


def actuator(od, length, axis, center, fins=True, bore=0.0):
    """Housed rotary actuator: finned body, output flange, rear cap (visual + mass-correct envelope)."""
    r = od / 2
    body = cyl(r - 2.0, length * 0.72, "z", (0, 0, -length * 0.08))
    if fins:
        nfin = max(3, int(length * 0.72 / 6))
        for i in range(nfin):
            z = -length * 0.08 - length * 0.36 + (i + 0.5) * length * 0.72 / nfin
            body = body.union(cyl(r, 2.0, "z", (0, 0, z)))
    flange = cyl(r * 0.86, length * 0.14, "z", (0, 0, length * 0.36))
    out = cyl(r * 0.62, length * 0.08, "z", (0, 0, length * 0.47))
    cap = cyl(r * 0.80, length * 0.10, "z", (0, 0, -length * 0.47))
    a = body.union(flange).union(out).union(cap)
    if bore:
        a = a.cut(cyl(bore / 2, length * 2, "z"))
    if axis == "x":
        a = a.rotate((0, 0, 0), (0, 1, 0), 90)
    elif axis == "-x":
        a = a.rotate((0, 0, 0), (0, 1, 0), -90)
    elif axis == "y":
        a = a.rotate((0, 0, 0), (1, 0, 0), -90)
    elif axis == "-y":
        a = a.rotate((0, 0, 0), (1, 0, 0), 90)
    elif axis == "-z":
        a = a.rotate((0, 0, 0), (1, 0, 0), 180)
    return a.translate(center)


def panels(sections, t, cuts, axis="z", extend=("start", "end")):
    """Shell panels by solid booleans: (outer loft  intersect  half-spaces) - inner loft.

    Robust where OCC offset-shelling of smooth lofts fails. Inner sections are the outer ones
    reduced by the wall thickness t; the inner loft is extended past the chosen ends so those
    ends are open. cuts: list of constraint lists [(axis, sign, offset), ...] (one per panel;
    an empty list returns the whole shell).
    """
    outer = loft(sections, axis)
    i_ax = "xyz".index(axis)
    inner = []
    for k, s in enumerate(sections):
        c, a, b, n = s[:4]
        c = list(c)
        if k == 0 and "start" in extend:
            c[i_ax] -= 3.0 * (1 if sections[-1][0][i_ax] > sections[0][0][i_ax] else -1)
        if k == len(sections) - 1 and "end" in extend:
            c[i_ax] += 3.0 * (1 if sections[-1][0][i_ax] > sections[0][0][i_ax] else -1)
        inner.append((tuple(c), max(a - t, 1.0), max(b - t, 1.0), n) + tuple(s[4:]))
    inner_solid = loft(inner, axis)
    out = []
    for cons in cuts:
        p = outer
        for ax, sg, off in cons:
            p = p.intersect(halfspace(ax, sg, off))
        out.append(p.cut(inner_solid))
    return out
