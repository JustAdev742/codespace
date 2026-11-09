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


# ================================================================= Mk II styling helpers
def asym_pts(ap, an, bp, bn, n=2.4, m=64, cx=0.0, cy=0.0):
    """Superellipse with different semi-axes on each side: +u ap, -u an, +v bp, -v bn.

    n is one exponent or a 4-tuple per quadrant (u+v+, u+v-, u-v+, u-v-): a high exponent squares
    off one corner (e.g. where a linkage sweeps) while the others stay round. Tangents stay
    continuous across the axes for n > 1."""
    nq = n if isinstance(n, (tuple, list)) else (n, n, n, n)
    pts = []
    for i in range(m):
        t = 2 * math.pi * i / m
        c, s = math.cos(t), math.sin(t)
        a = ap if c >= 0 else an
        b = bp if s >= 0 else bn
        q = (0 if s >= 0 else 1) if c >= 0 else (2 if s >= 0 else 3)
        e = 2 / nq[q]
        pts.append((cx + a * math.copysign(abs(c) ** e, c), cy + b * math.copysign(abs(s) ** e, s)))
    return pts


def asym_wire(center, ap, an, bp, bn, n=2.4, axis="z", m=32):
    """Closed spline section. axis = section normal: 'z' -> (u,v)=(x,y); 'x' -> (y,z); 'y' -> (x,z)."""
    cx, cy, cz = center
    vs = []
    for u, v in asym_pts(ap, an, bp, bn, n, m):
        if axis == "z":
            vs.append(cq.Vector(cx + u, cy + v, cz))
        elif axis == "x":
            vs.append(cq.Vector(cx, cy + u, cz + v))
        else:
            vs.append(cq.Vector(cx + u, cy, cz + v))
    return cq.Wire.assembleEdges([cq.Edge.makeSpline(vs, periodic=True)])


_LOFTS = {}


def aloft(sections, axis="z", ruled=False):
    """sections: list of (center, ap, an, bp, bn, n) -> lofted solid (Workplane). Cached (shapes are immutable)."""
    key = (repr(sections), axis, ruled)
    if key not in _LOFTS:
        wires = [asym_wire(s[0], *s[1:6], axis=axis) for s in sections]
        _LOFTS[key] = cq.Workplane("XY").add(cq.Solid.makeLoft(wires, ruled))
    return _LOFTS[key]


def ashell(sections, t, axis="z", extend=("start", "end")):
    """Thin-wall shell of an asymmetric loft: outer loft minus an inner loft offset by t (open ends)."""
    i_ax = "xyz".index(axis)
    sgn = 1 if sections[-1][0][i_ax] > sections[0][0][i_ax] else -1
    inner = []
    for k, s in enumerate(sections):
        c = list(s[0])
        if k == 0 and "start" in extend:
            c[i_ax] -= 4.0 * sgn
        if k == len(sections) - 1 and "end" in extend:
            c[i_ax] += 4.0 * sgn
        inner.append((tuple(c),) + tuple(max(v - t, 1.0) for v in s[1:5]) + (s[5],))
    outer = aloft(sections, axis)
    return outer, outer.cut(aloft(inner, axis))


def rot_to(w, axis):
    """Rotate a shape built along +Z so that its +Z points along axis ('x','-x','y','-y','z','-z')."""
    if axis == "x":
        return w.rotate((0, 0, 0), (0, 1, 0), 90)
    if axis == "-x":
        return w.rotate((0, 0, 0), (0, 1, 0), -90)
    if axis == "y":
        return w.rotate((0, 0, 0), (1, 0, 0), -90)
    if axis == "-y":
        return w.rotate((0, 0, 0), (1, 0, 0), 90)
    if axis == "-z":
        return w.rotate((0, 0, 0), (1, 0, 0), 180)
    return w


def revolve_profile(pts):
    """Revolve an (r, z) polyline 360 deg about Z."""
    return cq.Workplane("XZ").polyline(pts).close().revolve(360, (0, 0, 0), (0, 1, 0))


def actuator_lc(od, length, axis, center, port_angle=0.0):
    """Mk II KA-130 liquid-cooled actuator: smooth jacket over the 50 mm stack, ribbed gear end,
    output flange, rear cap with two coolant ports (barbed, for the dry-break lines). +Z = output."""
    r, L = od / 2, length
    z0, z1 = -L / 2, L / 2
    body = revolve_profile([(0, z0 + 6), (r * 0.80, z0 + 6), (r * 0.80, z0), (r - 3, z0), (r - 3, z0 + 3), (r, z0 + 6),
                            (r, z0 + 0.62 * L), (r - 2.5, z0 + 0.62 * L), (r - 2.5, z0 + 0.66 * L), (r, z0 + 0.66 * L),
                            (r, z1 - 12), (r - 4, z1 - 8), (r * 0.82, z1 - 8), (r * 0.82, z1 - 2), (r * 0.62, z1 - 2),
                            (r * 0.62, z1), (0, z1)])
    # jacket: smooth sealed sleeve over the motor section, one machined land at the motor | gear split
    body = body.union(cyl(r + 0.6, 3.0, "z", (0, 0, z0 + 0.62 * L - 1.5)))
    a = math.radians(port_angle)
    ca, sa = math.cos(a), math.sin(a)
    for zz in (z0 + 0.22 * L, z0 + 0.46 * L):        # coolant in / out, radial bosses on the jacket
        body = body.union(rod_between((ca * (r - 3), sa * (r - 3), zz), (ca * (r + 6), sa * (r + 6), zz), 5.5))
        body = body.union(rod_between((ca * (r + 5), sa * (r + 5), zz), (ca * (r + 13), sa * (r + 13), zz), 3.2))
    return rot_to(body, axis).translate(center)


def cycloid_actuator(od, length, axis, center, n_pins=16):
    """Mk II KH-C cycloid actuator: motor can, pin-ring housing (ring-pin bolt heads on a circle),
    output carrier with output-pin bolt circle. Distinct from the strain-wave KH silhouette. +Z = output."""
    r, L = od / 2, length
    z0, z1 = -L / 2, L / 2
    zm = z0 + 0.52 * L     # motor | reducer split
    body = revolve_profile([(0, z0), (r * 0.78, z0), (r * 0.92, z0 + 3), (r * 0.94, z0 + 4), (r * 0.94, zm - 3),
                            (r, zm - 1), (r, z1 - 9), (r - 3, z1 - 6), (r * 0.70, z1 - 6), (r * 0.70, z1), (0, z1)])
    body = body.union(cyl(r * 0.945, 1.6, "z", (0, 0, z0 + 0.25 * L))).union(cyl(r * 0.945, 1.6, "z", (0, 0, z0 + 0.38 * L)))
    for k in range(n_pins):
        t = 2 * math.pi * k / n_pins
        rr = r - 6.5
        body = body.union(cyl(2.6, 2.2, "z", (rr * math.cos(t), rr * math.sin(t), z1 - 5.0)))
    for k in range(8):
        t = 2 * math.pi * k / 8 + math.pi / 8
        rr = r * 0.48
        body = body.cut(cyl(2.2, 4, "z", (rr * math.cos(t), rr * math.sin(t), z1)))
    return rot_to(body, axis).translate(center)


def joint_cap(r, axis, center, name, bolts=8, accent=True, bezel=True, t=6.0):
    """Precision actuator end cap facing +axis at `center`: machined bezel ring (alu), graphite cap disc
    with a centre boss, amber light-guide ring and button-head screws. Returns [(mat, name, shape)]."""
    P = []
    base = revolve_profile([(0, 0), (r - 3.0, 0), (r - 3.0, t - 2.2), (r - 4.8, t), (r * 0.42, t), (r * 0.40, t + 1.6),
                            (r * 0.18, t + 1.6), (0, t + 1.6)])
    P.append(("joint", f"{name}_cap", base))
    if bezel:
        P.append(("alu", f"{name}_bezel", revolve_profile([(r - 3.4, 0), (r, 0), (r, t - 2.4), (r - 1.2, t - 1.2), (r - 3.4, t - 1.2)])))
    if accent:
        P.append(("accent", f"{name}_ring", revolve_profile([(r * 0.595, t - 0.2), (r * 0.62, t - 0.2), (r * 0.62, t + 0.45), (r * 0.595, t + 0.45)])))
    for k in range(bolts):
        a = 2 * math.pi * k / bolts + math.pi / bolts
        rr = r * 0.78
        P.append(("ti", f"{name}_screw{k}", cyl(1.9, 1.4, "z", (rr * math.cos(a), rr * math.sin(a), t - 0.5)).edges(">Z").fillet(0.6)))
    out = []
    for mat, nm, s in P:
        out.append((mat, nm, rot_to(s, axis).translate(center)))
    return out


def probe_surface(solid, origin, direction, far=400.0, iters=40):
    """Point where a ray from `origin` (outside) toward `direction` first enters `solid` (bisection)."""
    o = cq.Vector(*origin)
    d = cq.Vector(*direction).normalized()
    shp = solid.val() if hasattr(solid, "val") else solid
    # march to find first inside sample, then bisect
    step = 2.0
    prev = 0.0
    s = 0.0
    hit = None
    while s < far:
        if shp.isInside(o + d * s, 0.01):
            hit = s
            break
        prev = s
        s += step
    if hit is None:
        return None
    lo, hi = prev, hit
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        if shp.isInside(o + d * mid, 0.01):
            hi = mid
        else:
            lo = mid
    p = o + d * hi
    return (p.x, p.y, p.z)


def screw_at(p, normal, d=4.6, h=1.3):
    """Button-head screw head sitting on a surface point p, axis along `normal`."""
    n = cq.Vector(*normal).normalized()
    w = cq.Workplane("XY").circle(d / 2).extrude(h).edges(">Z").fillet(h * 0.45)
    z = cq.Vector(0, 0, 1)
    ax = z.cross(n)
    ang = math.degrees(math.acos(max(-1, min(1, z.dot(n)))))
    if ax.Length > 1e-9:
        w = w.rotate((0, 0, 0), ax.toTuple(), ang)
    elif n.z < 0:
        w = w.rotate((0, 0, 0), (1, 0, 0), 180)
    return w.translate((p[0] - n.x * 0.4, p[1] - n.y * 0.4, p[2] - n.z * 0.4))


def slab(axis, lo, hi, size=4000.0):
    """Box occupying lo < coord < hi along axis."""
    v = [0.0, 0.0, 0.0]
    dims = [size, size, size]
    i = "xyz".index(axis)
    dims[i] = hi - lo
    v[i] = (lo + hi) / 2
    return cq.Workplane("XY").box(*dims).translate(tuple(v))


def plane_cut(wp, point, normal, keep_positive=True, size=3000.0):
    """Keep the side of the plane (point, normal) that the normal points to (or the other side)."""
    n = cq.Vector(*normal).normalized()
    if not keep_positive:
        n = -n
    b = cq.Workplane("XY").box(size, size, size).translate((0, 0, size / 2))
    z = cq.Vector(0, 0, 1)
    ax = z.cross(n)
    ang = math.degrees(math.acos(max(-1, min(1, z.dot(n)))))
    if ax.Length > 1e-9:
        b = b.rotate((0, 0, 0), ax.toTuple(), ang)
    elif n.z < 0:
        b = b.rotate((0, 0, 0), (1, 0, 0), 180)
    return wp.intersect(b.translate(point))
