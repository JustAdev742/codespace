"""KESTREL S1 CAD support library: 2D plate geometry, the M5 grid, DXF output, part registry.

All dimensions in millimetres. World frame: x forward, y left, z up, sole at z = 0.

A laser-cut plate is defined in 2D (outline polygon + circular holes + polygon cut-outs) in the
coordinates of the world plane it lies in, then extruded 6 mm and placed. The same 2D definition
writes the DXF, so the DXF and the 3D part cannot drift apart.
"""
from __future__ import annotations

import hashlib
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import cadquery as cq
import numpy as np

THK = 6.0          # plate thickness (6061-T6)
GRID_PITCH = 20.0  # M5 grid pitch
GRID_D = 5.5       # M5 clearance
EDGE_MIN = 7.0     # grid hole centre to plate edge
WEB_MIN = 3.0      # grid hole edge to any other hole/cut-out edge

RHO = {"6061-T6": 2700.0, "steel": 7850.0, "PA12-CF": 1100.0, "PETG-CF": 1300.0, "rubber": 1200.0,
       "belt": 1250.0, "bronze": 8800.0}


# ----------------------------------------------------------------------------- 2D geometry
def circle_pts(cx, cy, r, n=48, a0=0.0):
    a = a0 + np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.c_[cx + r * np.cos(a), cy + r * np.sin(a)]


def hull(points):
    """Convex hull (monotone chain), CCW, no repeated end point."""
    p = sorted(set(map(lambda q: (round(float(q[0]), 6), round(float(q[1]), 6)), points)))
    if len(p) < 3:
        return np.array(p)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in p:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) >= 2 and cross(up[-2], up[-1], q) <= 0:
            up.pop()
        up.append(q)
    return np.array(lo[:-1] + up[:-1])


def hull_shapes(circles=(), rects=(), n=64):
    """Convex hull of circles (x, y, r) and axis-aligned rectangles (x0, y0, x1, y1)."""
    pts = []
    for (x, y, r) in circles:
        pts.extend(circle_pts(x, y, r, n))
    for (x0, y0, x1, y1) in rects:
        pts.extend([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    return hull(pts)


def round_poly(pts, r, step_deg=8.0):
    """Fillet every corner of a simple polygon with radius r (convex or concave corners)."""
    pts = np.asarray(pts, float)
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        d1 = p1 - p0
        d2 = p2 - p1
        l1, l2 = np.linalg.norm(d1), np.linalg.norm(d2)
        if l1 < 1e-9 or l2 < 1e-9:
            continue
        d1, d2 = d1 / l1, d2 / l2
        cosang = np.clip(np.dot(-d1, d2), -1, 1)
        theta = math.acos(cosang)               # interior angle between the two edges
        if theta > math.radians(170) or r <= 0:
            out.append(p1)
            continue
        t = min(r / math.tan(theta / 2), 0.49 * l1, 0.49 * l2)
        rr = t * math.tan(theta / 2)
        a = p1 - d1 * t
        b = p1 + d2 * t
        bis = (-d1 + d2)
        bis /= np.linalg.norm(bis)
        c = p1 + bis * (rr / math.sin(theta / 2))
        a0 = math.atan2(*(a - c)[::-1])
        a1 = math.atan2(*(b - c)[::-1])
        turn = d1[0] * d2[1] - d1[1] * d2[0]    # >0: left turn (convex for CCW)
        da = a1 - a0
        if turn > 0:
            while da < 0:
                da += 2 * math.pi
        else:
            while da > 0:
                da -= 2 * math.pi
        k = max(2, int(abs(math.degrees(da)) / step_deg) + 1)
        for j in range(k + 1):
            ang = a0 + da * j / k
            out.append(c + rr * np.array([math.cos(ang), math.sin(ang)]))
    return np.array(out)


def rrect(x0, y0, x1, y1, r=8.0):
    return round_poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], r)


def poly_area(p):
    p = np.asarray(p)
    x, y = p[:, 0], p[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def ccw(p):
    p = np.asarray(p, float)
    return p if poly_area(p) > 0 else p[::-1]


def point_in_poly(pt, poly):
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xin > x:
                inside = not inside
    return inside


def dist_to_poly(pt, poly):
    p = np.asarray(pt, float)
    a = np.asarray(poly, float)
    b = np.roll(a, -1, axis=0)
    ab = b - a
    t = np.clip(np.einsum("ij,ij->i", p - a, ab) / np.maximum(np.einsum("ij,ij->i", ab, ab), 1e-12), 0, 1)
    proj = a + ab * t[:, None]
    return float(np.min(np.linalg.norm(proj - p, axis=1)))


def dist_pts_poly(pts, poly):
    """Distance from each point (N,2) to the boundary of a closed polygon (M,2)."""
    p = np.asarray(pts, float)[:, None, :]
    a = np.asarray(poly, float)[None, :, :]
    b = np.roll(np.asarray(poly, float), -1, axis=0)[None, :, :]
    ab = b - a
    t = np.clip(np.sum((p - a) * ab, axis=2) / np.maximum(np.sum(ab * ab, axis=2), 1e-12), 0, 1)
    proj = a + ab * t[..., None]
    return np.min(np.linalg.norm(proj - p, axis=2), axis=1)


def wire_poly(wire, step=3.0):
    """Polygon from a planar wire: lines by their end points, curves sampled every ~step mm, in wire order."""
    from OCP.BRepTools import BRepTools_WireExplorer
    from OCP.TopAbs import TopAbs_REVERSED
    exp = BRepTools_WireExplorer(wire.wrapped)
    pts = []
    while exp.More():
        e = cq.Edge(exp.Current())
        n = 1 if e.geomType() == "LINE" else max(2, int(e.Length() / step))
        ts = np.linspace(0, 1, n + 1)
        ps = [e.positionAt(t) for t in ts]
        if exp.Orientation() == TopAbs_REVERSED:
            ps = ps[::-1]
        pts.extend([(p.x, p.y) for p in ps[:-1]])
        exp.Next()
    pts = np.array(pts)
    if len(pts) < 3:
        return pts
    keep = [0]
    for i in range(1, len(pts)):
        if np.linalg.norm(pts[i] - pts[keep[-1]]) > 0.25:
            keep.append(i)
    return ccw(pts[keep])


def strap(c1, c2, w):
    """Straight strap of width w between two points (a stadium)."""
    return hull_shapes(circles=[(c1[0], c1[1], w / 2), (c2[0], c2[1], w / 2)], n=32)


def union_outline(polys, fillet=8.0):
    """Outer boundary of the union of several polygons (OCC 2D boolean), concave corners filleted."""
    from OCP.BRep import BRep_Tool
    from OCP.BRepTools import BRepTools_WireExplorer
    faces = []
    for p in polys:
        p = ccw(p)
        w = cq.Wire.makePolygon([cq.Vector(float(x), float(y), 0) for x, y in p], close=True)
        faces.append(cq.Face.makeFromWires(w))
    f = faces[0]
    for g in faces[1:]:
        f = f.fuse(g)
    f = f.clean()
    face = max(f.Faces(), key=lambda q: q.Area())
    exp = BRepTools_WireExplorer(face.outerWire().wrapped)
    pts = []
    while exp.More():
        v = BRep_Tool.Pnt_s(exp.CurrentVertex())
        pts.append((v.X(), v.Y()))
        exp.Next()
    pts = np.array(pts)
    keep = [0]
    for i in range(1, len(pts)):
        if np.linalg.norm(pts[i] - pts[keep[-1]]) > 0.3:
            keep.append(i)
    pts = ccw(pts[keep])
    return round_poly(pts, fillet) if fillet else pts


# ----------------------------------------------------------------------------- plates
@dataclass
class Hole:
    x: float
    y: float
    d: float
    kind: str = "hole"     # grid | m5 | m4 | m3 | m6 | bore | dowel | tslot ...


class Plate2D:
    """A flat 6 mm plate: outline + circular holes + polygon cut-outs (2D, plane coordinates)."""

    def __init__(self, outline, thk=THK):
        self.outline = ccw(outline)
        self.thk = thk
        self.holes: list[Hole] = []
        self.cutouts: list[np.ndarray] = []
        self.pockets: list[np.ndarray] = []   # lightening pockets (inner contours like cut-outs)
        self.keepout: list[tuple] = []     # (x, y, r) regions the grid must avoid (bolted-on parts, bearings)

    # -- features
    def hole(self, x, y, d, kind="hole"):
        self.holes.append(Hole(float(x), float(y), float(d), kind))
        return self

    def bolt_circle(self, cx, cy, pcd, n, d, a0=0.0, kind="bolt", skip=()):
        for i in range(n):
            if i in skip:
                continue
            a = math.radians(a0) + 2 * math.pi * i / n
            self.hole(cx + pcd / 2 * math.cos(a), cy + pcd / 2 * math.sin(a), d, kind)
        return self

    def bore(self, cx, cy, d):
        return self.hole(cx, cy, d, "bore")

    def cut(self, poly):
        self.cutouts.append(ccw(poly))
        return self

    def keep(self, x, y, r):
        self.keepout.append((x, y, r))
        return self

    def tslot(self, x, y, depth=None, nut_at=None, d=None, nut_w=None, nut_t=None):
        """T-slot captive-nut notch entering from the plate edge nearest to (x, y), perpendicular to that edge.

        The screw (M5) passes through the mating plate into this plate's edge; a DIN 562 M5 square nut
        (8 x 2.7 mm) sits in the cross slot. The notch is spliced into the outline so the DXF stays one contour.
        Plates of 4 mm and less use M4 (DIN 562 M4, 7 x 2.2 mm).
        """
        if self.thk <= 4.0:
            dd = dict(depth=12.0, nut_at=7.0, d=4.5, nut_w=7.3, nut_t=2.6)
        else:
            dd = dict(depth=14.0, nut_at=8.0, d=5.5, nut_w=8.4, nut_t=3.0)
        depth = depth or dd["depth"]
        nut_at = nut_at or dd["nut_at"]
        d = d or dd["d"]
        nut_w = nut_w or dd["nut_w"]
        nut_t = nut_t or dd["nut_t"]
        P = self.outline
        n = len(P)
        best, bi, bt = 1e18, -1, 0.0
        for i in range(n):
            a_, b_ = P[i], P[(i + 1) % n]
            ab = b_ - a_
            L2 = float(ab @ ab)
            if L2 < 1e-9:
                continue
            t = float(np.clip((np.array([x, y]) - a_) @ ab / L2, 0, 1))
            dd = float(np.linalg.norm(a_ + t * ab - [x, y]))
            if dd < best:
                best, bi, bt = dd, i, t
        a_, b_ = P[bi], P[(bi + 1) % n]
        e = (b_ - a_) / np.linalg.norm(b_ - a_)
        if np.linalg.norm(b_ - a_) < nut_w + 4:
            raise ValueError(f"tslot at ({x:.1f},{y:.1f}): edge too short ({np.linalg.norm(b_ - a_):.1f} mm)")
        u = np.array([-e[1], e[0]])          # inward normal for a CCW outline
        E = a_ + bt * (b_ - a_)
        r = d / 2
        nb, ne, L = nut_at, nut_at + nut_t, depth
        prof = [(0, -r), (nb, -r), (nb, -nut_w / 2), (ne, -nut_w / 2), (ne, -r), (L, -r),
                (L, r), (ne, r), (ne, nut_w / 2), (nb, nut_w / 2), (nb, r), (0, r)]
        pts = [E + u * pu + e * pv for (pu, pv) in prof]
        self.outline = np.vstack([P[:bi + 1], pts, P[bi + 1:]])
        self.keepout.append((*(E + u * L / 2), L / 2 + 1))
        return self

    def validate(self, name=""):
        bad = []
        for h in self.holes:
            if not point_in_poly((h.x, h.y), self.outline) or dist_to_poly((h.x, h.y), self.outline) < h.d / 2 + 0.8:
                bad.append(f"hole d{h.d} at ({h.x:.1f},{h.y:.1f})")
        for c in self.cutouts + self.pockets:
            if any(not point_in_poly(p, self.outline) for p in c):
                bad.append("cut-out outside outline")
        for h in self.holes:                       # inner contours must not touch each other (invalid face)
            for c in self.cutouts + self.pockets:
                if point_in_poly((h.x, h.y), c) or dist_to_poly((h.x, h.y), c) < h.d / 2 + 0.3:
                    bad.append(f"hole d{h.d} at ({h.x:.1f},{h.y:.1f}) touches a cut-out")
                    break
        cs = self.cutouts
        for i in range(len(cs)):
            for j in range(i + 1, len(cs)):
                if dist_pts_poly(cs[i], cs[j]).min() < 0.3 or any(point_in_poly(q, cs[j]) for q in cs[i]) \
                        or any(point_in_poly(q, cs[i]) for q in cs[j]):
                    bad.append("two cut-outs touch")
        if bad:
            raise ValueError(f"plate {name}: " + "; ".join(bad[:6]))

    # -- lightening pockets
    def pocket(self, pitch=40.0, rib=8.0, edge=8.0, web=8.0, boss=11.0, min_area=150.0, fillet=3.0):
        """Lightening pockets by 2D booleans: the outline inset by `edge`, minus a `web` keep-out round every hole,
        cut-out and keep-out, minus a rib lattice (8 mm ribs on the 40 mm lines of the 20 mm grid) with a boss at every
        node (dia 21.5: a dia 5.5 grid hole with 8 mm of material round it). What is left becomes the pockets, corners
        filleted r 3. Returns the number of pockets."""
        V = cq.Vector

        def face_of(poly):
            return cq.Face.makeFromWires(cq.Wire.makePolygon([V(float(x), float(y), 0) for x, y in poly], close=True))
        try:
            inset = face_of(self.outline).outerWire().offset2D(-edge, "intersection")
        except Exception:
            return 0
        if not inset:
            return 0
        region = cq.Face.makeFromWires(inset[0])
        cut = []
        for h in self.holes:
            cut.append(cq.Face.makeFromWires(cq.Wire.makeCircle(h.d / 2 + web, V(h.x, h.y, 0), V(0, 0, 1))))
        for c in self.cutouts:
            try:
                cut.append(cq.Face.makeFromWires(face_of(c).outerWire().offset2D(web, "arc")[0]))
            except Exception:
                cut.append(face_of(c))
        for (kx, ky, kr) in self.keepout:
            cut.append(cq.Face.makeFromWires(cq.Wire.makeCircle(max(kr, 1.0), V(kx, ky, 0), V(0, 0, 1))))
        mn, mx = self.outline.min(axis=0) - pitch, self.outline.max(axis=0) + pitch
        for i in range(int(math.floor(mn[0] / pitch)), int(math.ceil(mx[0] / pitch)) + 1):
            x = i * pitch
            cut.append(face_of(np.array([(x - rib / 2, mn[1]), (x + rib / 2, mn[1]), (x + rib / 2, mx[1]), (x - rib / 2, mx[1])])))
            for j in range(int(math.floor(mn[1] / pitch)), int(math.ceil(mx[1] / pitch)) + 1):
                y = j * pitch
                cut.append(cq.Face.makeFromWires(cq.Wire.makeCircle(boss, V(x, y, 0), V(0, 0, 1))))
        for j in range(int(math.floor(mn[1] / pitch)), int(math.ceil(mx[1] / pitch)) + 1):
            y = j * pitch
            cut.append(face_of(np.array([(mn[0], y - rib / 2), (mx[0], y - rib / 2), (mx[0], y + rib / 2), (mn[0], y + rib / 2)])))
        tool = cut[0].fuse(*cut[1:]) if len(cut) > 1 else cut[0]
        res = region.cut(tool)
        n = 0
        for f in res.Faces():
            if f.Area() < min_area:
                continue
            if f.innerWires():          # an island (a feature boss) inside the pocket: keep the face solid
                continue
            poly = wire_poly(f.outerWire())
            if len(poly) < 3:
                continue
            poly = round_poly(poly, fillet, step_deg=15)
            if abs(poly_area(poly)) < min_area:
                continue
            self.pockets.append(ccw(poly))
            n += 1
        return n

    def solidity(self):
        return self.net_area() / abs(poly_area(self.outline))

    # -- the M5 grid
    def grid(self, pitch=GRID_PITCH, d=GRID_D, edge=EDGE_MIN, web=WEB_MIN, origin=(0.0, 0.0), pocket_web=8.0):
        ox, oy = origin
        mn, mx = self.outline.min(axis=0), self.outline.max(axis=0)
        i0, i1 = int(math.floor((mn[0] - ox) / pitch)), int(math.ceil((mx[0] - ox) / pitch))
        j0, j1 = int(math.floor((mn[1] - oy) / pitch)), int(math.ceil((mx[1] - oy) / pitch))
        r = d / 2
        fixed = list(self.holes)
        added = 0
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                p = (ox + i * pitch, oy + j * pitch)
                if not point_in_poly(p, self.outline) or dist_to_poly(p, self.outline) < edge:
                    continue
                ok = True
                for h in fixed:
                    if math.hypot(p[0] - h.x, p[1] - h.y) < r + h.d / 2 + web:
                        ok = False
                        break
                if ok:
                    for c in self.cutouts:
                        if point_in_poly(p, c) or dist_to_poly(p, c) < r + web:
                            ok = False
                            break
                if ok:
                    for c in self.pockets:
                        if point_in_poly(p, c) or dist_to_poly(p, c) < r + pocket_web - 0.5:
                            ok = False
                            break
                if ok:
                    for (kx, ky, kr) in self.keepout:
                        if math.hypot(p[0] - kx, p[1] - ky) < kr + r:
                            ok = False
                            break
                if ok:
                    self.holes.append(Hole(p[0], p[1], d, "grid"))
                    added += 1
        return added

    # -- derived
    def bbox(self):
        mn, mx = self.outline.min(axis=0), self.outline.max(axis=0)
        return float(mn[0]), float(mn[1]), float(mx[0]), float(mx[1])

    def net_area(self):
        a = abs(poly_area(self.outline))
        a -= sum(math.pi * h.d ** 2 / 4 for h in self.holes)
        a -= sum(abs(poly_area(c)) for c in self.cutouts + self.pockets)
        return a

    def translated(self, dx, dy):
        q = Plate2D(self.outline + [dx, dy], self.thk)
        q.holes = [Hole(h.x + dx, h.y + dy, h.d, h.kind) for h in self.holes]
        q.cutouts = [c + [dx, dy] for c in self.cutouts]
        q.pockets = [c + [dx, dy] for c in self.pockets]
        q.keepout = [(x + dx, y + dy, r) for (x, y, r) in self.keepout]
        return q

    def signature(self):
        """Shape hash of the canonical (bbox-origin) plate, to detect identical parts."""
        x0, y0, _, _ = self.bbox()
        q = self.translated(-x0, -y0)
        s = [np.round(q.outline, 2).tobytes()]
        s += sorted(f"{h.x:.2f},{h.y:.2f},{h.d:.2f}" for h in q.holes)
        s += sorted(np.round(c, 2).tobytes().hex() for c in q.cutouts + q.pockets)
        return hashlib.md5("|".join(map(str, s)).encode()).hexdigest()

    def solid(self):
        """3D solid in plane coordinates (z from 0 to thk)."""
        def vec(p):
            return cq.Vector(float(p[0]), float(p[1]), 0.0)
        outer = cq.Wire.makePolygon([vec(p) for p in self.outline], close=True)
        inner = [cq.Wire.makeCircle(h.d / 2, cq.Vector(h.x, h.y, 0), cq.Vector(0, 0, 1)) for h in self.holes]
        inner += [cq.Wire.makePolygon([vec(p) for p in c], close=True) for c in self.cutouts + self.pockets]
        face = cq.Face.makeFromWires(outer, inner)
        return cq.Solid.extrudeLinear(face, cq.Vector(0, 0, self.thk))

    def write_dxf(self, path):
        import ezdxf
        doc = ezdxf.new("R2010")
        doc.header["$INSUNITS"] = 4   # mm
        doc.layers.add("CUT", color=7)
        msp = doc.modelspace()
        x0, y0, _, _ = self.bbox()
        q = self.translated(-x0, -y0)
        msp.add_lwpolyline([tuple(map(float, p)) for p in q.outline], close=True, dxfattribs={"layer": "CUT"})
        for h in q.holes:
            msp.add_circle((h.x, h.y), h.d / 2, dxfattribs={"layer": "CUT"})
        for c in q.cutouts + q.pockets:
            msp.add_lwpolyline([tuple(map(float, p)) for p in c], close=True, dxfattribs={"layer": "CUT"})
        doc.saveas(path)


# ----------------------------------------------------------------------------- placement
def plane_frame(plane, at, thk=THK):
    """Return (origin, xdir, normal) mapping plane coordinates (a, b) and thickness w in [0, thk] to world.

    plane 'xz': (a, b) = (x, z), plate occupies y in [at, at + thk]
    plane 'yz': (a, b) = (y, z), plate occupies x in [at, at + thk]
    plane 'xy': (a, b) = (x, y), plate occupies z in [at, at + thk]
    """
    if plane == "xz":     # u=+x, v=+z  => n = u x v = -y ; thickness runs toward -y from origin y = at + thk
        return (0.0, at + thk, 0.0), (1, 0, 0), (0, -1, 0)
    if plane == "yz":     # u=+y, v=+z  => n = +x
        return (at, 0.0, 0.0), (0, 1, 0), (1, 0, 0)
    if plane == "xy":     # u=+x, v=+y  => n = +z
        return (0.0, 0.0, at), (1, 0, 0), (0, 0, 1)
    raise ValueError(plane)


def loc_from(origin, xdir, normal):
    return cq.Location(cq.Plane(origin=cq.Vector(*origin), xDir=cq.Vector(*xdir), normal=cq.Vector(*normal)))


# ----------------------------------------------------------------------------- registry
@dataclass
class PartDef:
    name: str
    kind: str                # plate | machined | printed | extrusion | tube | rod | purchased | actuator | belt
    material: str
    process: str
    shape: object            # canonical shape (for STEP/STL export)
    volume: float            # mm^3
    structure: bool          # counts toward the structure mass
    cat: str                 # colour category
    dims: str = ""
    note: str = ""
    plate: Plate2D | None = None
    mass_kg: float | None = None   # overrides volume x density (purchased parts with datasheet mass)
    length: float | None = None    # extrusions / tubes / rods

    @property
    def mass(self):
        if self.mass_kg is not None:
            return self.mass_kg
        return self.volume * 1e-9 * RHO.get(self.material, 2700.0)


@dataclass
class Inst:
    name: str
    body: str
    shape: object            # world shape (zero pose)
    cat: str
    side: str = ""           # "l", "r" or ""
    mirror: bool = False     # mirror to the right side although the body is not an l_ body (torso-mounted arm parts)


class Model:
    def __init__(self):
        self.defs: dict[str, PartDef] = {}
        self.inst: list[Inst] = []
        self.fasteners = Counter()
        self.notes = defaultdict(list)
        self.force_mirror = False
        self.fast_mult = 1          # 2 while building the left leg/arm (the right side is a mirror)

    # --- registration
    def _def(self, d: PartDef, sig=None):
        if d.name in self.defs:
            old = self.defs[d.name]
            if abs(old.volume - d.volume) > max(1.0, 1e-4 * old.volume):
                raise ValueError(f"part {d.name} registered twice with different geometry "
                                 f"({old.volume:.0f} vs {d.volume:.0f} mm3)")
            return old
        self.defs[d.name] = d
        return d

    def plate(self, name, p2d: Plate2D, plane, at, body, cat="alu", grid=True, note="", structure=True, pocket=True):
        if pocket:
            p2d.pocket()
        if grid:
            p2d.grid()
        p2d.validate(name)
        x0, y0, x1, y1 = p2d.bbox()
        canon = p2d.translated(-x0, -y0)
        shp_local = canon.solid()
        d = PartDef(name, "plate", "6061-T6", f"laser or waterjet cut, {p2d.thk:.0f} mm 6061-T6", shp_local, shp_local.Volume(),
                    structure, cat, dims=f"{x1 - x0:.0f} x {y1 - y0:.0f} x {p2d.thk:.0f}", note=note, plate=canon)
        self._def(d)
        o, u, n = plane_frame(plane, at, p2d.thk)
        # canonical plate origin sits at (x0, y0) in plane coordinates
        if plane == "xz":
            o = (x0, o[1], y0)
        elif plane == "yz":
            o = (o[0], x0, y0)
        else:
            o = (x0, y0, o[2])
        world = shp_local.moved(loc_from(o, u, n))
        self.inst.append(Inst(name, body, world, cat, mirror=self.force_mirror))
        return world

    def solid(self, name, world_shape, body, cat, kind, material, process, dims="", note="", structure=True,
              mass_kg=None, length=None):
        if isinstance(world_shape, cq.Workplane):
            world_shape = world_shape.val() if len(world_shape.vals()) == 1 else cq.Compound.makeCompound(world_shape.vals())
        vol = world_shape.Volume()
        bb = world_shape.BoundingBox()
        canon = world_shape.moved(cq.Location(cq.Vector(-bb.xmin, -bb.ymin, -bb.zmin)))
        d = PartDef(name, kind, material, process, canon, vol, structure, cat, dims=dims, note=note,
                    mass_kg=mass_kg, length=length)
        self._def(d)
        self.inst.append(Inst(name, body, world_shape, cat, mirror=self.force_mirror))
        return world_shape

    def fast(self, spec, n=1):
        self.fasteners[spec] += n * self.fast_mult

    # --- mirroring: every left-side instance gets a mirrored right-side twin (same part number)
    def mirror_left(self):
        add = []
        for it in self.inst:
            if it.body.startswith("l_"):
                add.append(Inst(it.name, "r_" + it.body[2:], it.shape.mirror("XZ"), it.cat, "r"))
                it.side = "l"
            elif it.mirror:
                add.append(Inst(it.name, it.body, it.shape.mirror("XZ"), it.cat, "r"))
                it.side = "l"
        self.inst.extend(add)

    def qty(self):
        return Counter(i.name for i in self.inst)


# ----------------------------------------------------------------------------- 3D primitives (world)
def cyl(r, h, base, axis):
    """Cylinder of radius r and length h starting at base, along a unit axis given as 'x','y','z' or a vector."""
    if isinstance(axis, str):
        axis = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1), "-x": (-1, 0, 0), "-y": (0, -1, 0), "-z": (0, 0, -1)}[axis]
    return cq.Solid.makeCylinder(r, h, cq.Vector(*base), cq.Vector(*axis))


def ring(ro, ri, h, base, axis):
    return cyl(ro, h, base, axis).cut(cyl(ri, h, base, axis))


def box(x0, y0, z0, x1, y1, z1):
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, cq.Vector(x0, y0, z0))


def fuse(*shapes):
    s = shapes[0]
    for t in shapes[1:]:
        s = s.fuse(t)
    return s.clean() if hasattr(s, "clean") else s


def seg_cyl(r, p0, p1):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0
    L = float(np.linalg.norm(d))
    return cyl(r, L, tuple(p0), tuple(d / L))
