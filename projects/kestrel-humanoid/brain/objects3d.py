"""What the house's handheld things look like: real shapes with their own handles, built as meshes (surfaces of
revolution, swept tubes, boxes) and procedural textures, so every object is the thing it is called: a glazed mug
with a handle on its side, a steel saucepan with loop handles, a frying pan with a long handle, a chopping board with
a hang-hole handle, a dome kettle with an arched handle on top, a bucket with a wire bail, a watering can, a wicker
basket, a red toolbox, a lunchbox, a shopping tote, a spaghetti packet, a stick vacuum, a tied bin bag, a teddy, a
toy truck, a tub of blocks, a ball in a net, a spray bottle, brushes, a spatula, a cake plate, folded clothes.

The handle the robot's hook takes is the object's own handle: HANDLES gives where it is on the object (the object's
frame: centre of its collision shape, z up). Things held by a handle at their side (mugs, the pot, the pan, the
board) are held firmly, like a wrist (FIRM); things with a handle on top hang from it.

Meshes and textures are made on first use into data/gen/ (a few MB; a second or two) and are visual only: the
physics keeps the simple collision shapes (house.py), plus a small collision part where a handle sticks out.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
GEN = HERE / "data" / "gen"
VERSION = 5

# the handle's grab point on each object (object frame), where it isn't straight above the centre
HANDLES = {
    "mug_red": (0.062, 0.0, 0.042), "mug_blue": (0.062, 0.0, 0.042), "mug_green": (0.062, 0.0, 0.042),
    "mug_yellow": (0.062, 0.0, 0.042), "pot": (0.158, 0.0, 0.074), "pan": (0.18, 0.0, 0.03),
    "board": (0.135, 0.0, 0.016),
}
FIRM = set(HANDLES)                   # held firmly by a handle at the side (like a wrist), not hanging
# where those handles stick out: collision boxes (object frame: centre, half sizes) so they bump into things too
HANDLE_SHAPES = {
    **{m: [((0.062, 0.0, 0.008), (0.012, 0.006, 0.032))] for m in ("mug_red", "mug_blue", "mug_green", "mug_yellow")},
    "pot": [((0.145, 0.0, 0.071), (0.02, 0.03, 0.006)), ((-0.145, 0.0, 0.071), (0.02, 0.03, 0.006))],
    "pan": [((0.225, 0.0, 0.035), (0.1, 0.012, 0.01))],
    "board": [((0.128, 0.0, 0.0), (0.032, 0.026, 0.015))],
}
START_YAW = {"pot": math.pi / 2, "pan": math.pi / 2, "board": -math.pi / 2}   # handles towards the room


# ======================================================================= mesh primitives
def _normals(V, F):
    N = np.zeros_like(V)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for i in range(3):
        np.add.at(N, F[:, i], fn)
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)


class Mesh:
    def __init__(self, V=None, F=None, UV=None, N=None):
        self.V = np.zeros((0, 3)) if V is None else np.asarray(V, float)
        self.F = np.zeros((0, 3), np.int64) if F is None else np.asarray(F, np.int64)
        self.UV = np.zeros((len(self.V), 2)) if UV is None else np.asarray(UV, float)
        self.N = _normals(self.V, self.F) if N is None and len(self.F) else (np.zeros_like(self.V) if N is None else N)

    def __add__(self, o):
        return Mesh(np.vstack([self.V, o.V]), np.vstack([self.F, o.F + len(self.V)]), np.vstack([self.UV, o.UV]),
                    np.vstack([self.N, o.N]))

    def moved(self, t=(0, 0, 0), yaw=0.0, pitch=0.0, roll=0.0, scale=(1, 1, 1)):
        cr, sr, cp, sp, cy, sy = math.cos(roll), math.sin(roll), math.cos(pitch), math.sin(pitch), math.cos(yaw), math.sin(yaw)
        R = (np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]]) @ np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
             @ np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]]))
        S = np.asarray(scale, float)
        V = (self.V * S) @ R.T + np.asarray(t, float)
        N = (self.N / S) @ R.T
        N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
        return Mesh(V, self.F.copy(), self.UV.copy(), N)


def lathe(profile, n=40, a0=0.0, a1=2 * math.pi):
    """A surface of revolution about z: profile [(r, z), ...] in order (outward faces for a profile going up the
    outside). Smooth shading along it; for a hard edge, make another lathe."""
    P = np.asarray(profile, float)
    K = len(P)
    a = np.linspace(a0, a1, n + 1)
    V = np.stack([np.outer(P[:, 0], np.cos(a)), np.outer(P[:, 0], np.sin(a)), np.repeat(P[:, 1:2], n + 1, 1)], -1).reshape(-1, 3)
    seg = np.r_[0, np.cumsum(np.hypot(np.diff(P[:, 0]), np.diff(P[:, 1])))]
    v = seg / max(seg[-1], 1e-9)
    UV = np.stack(np.meshgrid((a - a0) / (a1 - a0), v), -1).reshape(-1, 2)
    F = []
    for k in range(K - 1):
        for j in range(n):
            i0, i1, i2, i3 = k * (n + 1) + j, k * (n + 1) + j + 1, (k + 1) * (n + 1) + j + 1, (k + 1) * (n + 1) + j
            F += [(i0, i1, i3), (i1, i2, i3)]
    m = Mesh(V, F, UV)
    if abs(a1 - a0 - 2 * math.pi) < 1e-9:                # the seam: one normal for both copies
        for k in range(K):
            i0, i1 = k * (n + 1), k * (n + 1) + n
            nn = m.N[i0] + m.N[i1]
            m.N[i0] = m.N[i1] = nn / (np.linalg.norm(nn) + 1e-12)
    return m


def disc(r, z, n=40, up=True):
    m = lathe([(0.0, z), (r, z)] if not up else [(r, z), (0.0, z)], n)
    m.N[:] = (0, 0, 1 if up else -1)
    return m


def tube(path, radius, n=12, caps=True):
    """A round tube along a polyline (handles, wire bails, spouts)."""
    P = np.asarray(path, float)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    ref = np.array([0.0, 0.0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    Nv = np.cross(T[0], ref)
    Nv /= np.linalg.norm(Nv)
    frames = []
    for t in T:                                          # parallel transport
        Nv = Nv - (Nv @ t) * t
        Nv /= np.linalg.norm(Nv) + 1e-12
        frames.append((Nv.copy(), np.cross(t, Nv)))
    th = np.linspace(0, 2 * math.pi, n + 1)
    V, Nn, UV = [], [], []
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    for i, (p, (a, b)) in enumerate(zip(P, frames)):
        for t_ in th:
            d = math.cos(t_) * a + math.sin(t_) * b
            V.append(p + radius * d)
            Nn.append(d)
            UV.append((t_ / (2 * math.pi), seg[i] / max(seg[-1], 1e-9)))
    F = []
    for i in range(len(P) - 1):
        for j in range(n):
            i0, i1 = i * (n + 1) + j, i * (n + 1) + j + 1
            i3, i2 = (i + 1) * (n + 1) + j, (i + 1) * (n + 1) + j + 1
            F += [(i0, i3, i1), (i1, i3, i2)]
    m = Mesh(V, F, UV, np.asarray(Nn))
    if caps:
        for end, sgn in ((0, -1), (len(P) - 1, 1)):
            c = len(m.V)
            ring = [end * (n + 1) + j for j in range(n)]
            V2 = np.vstack([m.V, P[end]])
            N2 = np.vstack([m.N, sgn * T[end]])
            F2 = [(c, ring[(j + 1) % n], ring[j]) if sgn < 0 else (c, ring[j], ring[(j + 1) % n]) for j in range(n)]
            m = Mesh(V2, np.vstack([m.F, F2]), np.vstack([m.UV, [(0.5, 0.5)]]), N2)
    return m


def arc(c, rx, rz, a0, a1, n=24, axis="x"):
    """Points on an elliptical arc in the xz plane (axis 'x') or yz plane (axis 'y') round centre c."""
    a = np.linspace(a0, a1, n)
    c = np.asarray(c, float)
    if axis == "x":
        return np.stack([c[0] + rx * np.cos(a), np.full_like(a, c[1]), c[2] + rz * np.sin(a)], 1)
    return np.stack([np.full_like(a, c[0]), c[1] + rx * np.cos(a), c[2] + rz * np.sin(a)], 1)


def box(hx, hy, hz, c=(0, 0, 0), bevel=0.0):
    """A box (half sizes), each face mapped to the whole texture; bevel>0 rounds it a little (normals only)."""
    c = np.asarray(c, float)
    V, F, UV, N = [], [], [], []
    for ax in range(3):
        for s in (-1, 1):
            n = np.zeros(3)
            n[ax] = s
            u, v = [(1, 2), (0, 2), (0, 1)][ax]
            h = np.array([hx, hy, hz])
            base = len(V)
            for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = np.zeros(3)
                p[ax] = s * h[ax]
                p[u], p[v] = du * h[u], dv * h[v]
                V.append(c + p)
                UV.append(((du + 1) / 2, (dv + 1) / 2))
                nn = n + bevel * np.sign(p) * (1 - np.abs(n))
                N.append(nn / np.linalg.norm(nn))
            q = [base, base + 1, base + 2, base + 3]
            # outward winding
            a, b_, cc = np.array(V[q[0]]), np.array(V[q[1]]), np.array(V[q[2]])
            if np.cross(b_ - a, cc - a) @ n < 0:
                q = q[::-1]
            F += [(q[0], q[1], q[2]), (q[0], q[2], q[3])]
    return Mesh(V, F, UV, np.asarray(N))


def ellipsoid(rx, ry, rz, c=(0, 0, 0), n=20, noise=0.0, seed=0):
    ph = np.linspace(-math.pi / 2, math.pi / 2, n // 2 + 1)
    m = lathe([(math.cos(p), math.sin(p)) for p in ph], n)
    V = m.V * np.array([rx, ry, rz])
    if noise:
        rng = np.random.default_rng(seed)
        d = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-12)
        lump = sum(rng.normal(0, noise) * np.sin(f * d[:, 0] + rng.uniform(0, 6)) * np.sin(f * d[:, 1] + rng.uniform(0, 6))
                   for f in (3, 5, 8))
        V = V * (1 + lump)[:, None]
    return Mesh(V + np.asarray(c, float), m.F, m.UV)


def cyl(r, z0, z1, n=32, top=True, bottom=True):
    m = lathe([(r, z0), (r, z1)], n)
    if top:
        m = m + disc(r, z1, n, up=True)
    if bottom:
        m = m + disc(r, z0, n, up=False)
    return m


# ======================================================================= textures
def _tex(name, make, size=256):
    p = GEN / "tex" / f"{name}.png"
    if not p.exists():
        from PIL import Image
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.clip(make(size), 0, 255).astype(np.uint8)).save(p)
    return p.as_posix()


def _noise(n, scale, seed):
    rng = np.random.default_rng(seed)
    g = rng.normal(0, 1, (n // scale + 2, n // scale + 2))
    from PIL import Image
    im = Image.fromarray(((g - g.min()) / (np.ptp(g) + 1e-9) * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
    return np.asarray(im, float) / 255.0 - 0.5


def _woven(n):
    y, x = np.mgrid[0:n, 0:n] / n
    k = 16
    u, v = (x * k) % 1, (y * k) % 1
    over = ((np.floor(x * k) + np.floor(y * k)) % 2 == 0)
    strand = np.where(over, np.sin(u * math.pi), np.sin(v * math.pi)) ** 0.6
    base = np.array([176, 128, 72]) * (0.55 + 0.45 * strand[..., None]) * (1 + 0.15 * _noise(n, 8, 1)[..., None])
    return base


def _knit(rgb, seed):
    def f(n):
        y, x = np.mgrid[0:n, 0:n] / n
        rib = 0.75 + 0.25 * np.abs(np.sin(x * 40 * math.pi)) * (0.8 + 0.2 * np.sin(y * 80 * math.pi))
        return np.array(rgb) * rib[..., None] * (1 + 0.1 * _noise(n, 4, seed)[..., None])
    return f


def _denim(n):
    y, x = np.mgrid[0:n, 0:n] / n
    tw = 0.8 + 0.2 * np.sin((x + y) * 120 * math.pi)
    return np.array([52, 74, 128]) * tw[..., None] * (1 + 0.25 * _noise(n, 3, 5)[..., None])


def _fur(n):
    return np.array([158, 106, 62]) * (0.8 + 0.5 * _noise(n, 2, 9)[..., None]) * (1 + 0.2 * _noise(n, 16, 4)[..., None])


def _bag_black(n):
    return np.array([24, 24, 27]) * (1 + 1.6 * np.abs(_noise(n, 10, 3))[..., None] + 0.4 * _noise(n, 3, 2)[..., None])


def _ball(n):
    y, x = np.mgrid[0:n, 0:n] / n
    band = (np.sin(x * 2 * math.pi * 3) > 0.3) | (np.abs(y - 0.5) < 0.06)
    return np.where(band[..., None], np.array([250, 250, 250]), np.array([236, 70, 120])) * (1 + 0.05 * _noise(n, 4, 7)[..., None])


def _pasta(n):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (n, n), (24, 70, 160))
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(n * 0.62), n, n], fill=(245, 196, 40))
    d.rectangle([int(n * 0.2), int(n * 0.25), int(n * 0.8), int(n * 0.55)], fill=(232, 208, 140))   # the window
    for k in range(9):
        xx = int(n * (0.22 + 0.065 * k))
        d.line([xx, int(n * 0.26), xx + 3, int(n * 0.54)], fill=(214, 176, 92), width=2)
    d.text((int(n * 0.18), int(n * 0.07)), "SPAGHETTI", fill=(255, 255, 255))
    d.text((int(n * 0.36), int(n * 0.72)), "500 g", fill=(30, 30, 30))
    return np.asarray(im, float)


def _label(n):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (n, n), (90, 196, 220))
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(n * 0.3), n, int(n * 0.7)], fill=(250, 250, 250))
    d.text((int(n * 0.1), int(n * 0.42)), "MULTI CLEAN", fill=(20, 90, 140))
    return np.asarray(im, float)


def _wood(n):
    y, x = np.mgrid[0:n, 0:n] / n
    g = np.sin((x * 30 + 6 * _noise(n, 32, 11)) * math.pi)
    return np.array([196, 150, 96]) * (0.85 + 0.12 * g[..., None]) * (1 + 0.08 * _noise(n, 2, 12)[..., None])


def _cotton(rgb, seed):
    def f(n):
        return np.array(rgb) * (0.93 + 0.12 * _noise(n, 2, seed)[..., None] + 0.04 * _noise(n, 24, seed + 1)[..., None])
    return f


# ======================================================================= the objects
def _mat(rgba, rough=0.5, metal=0.0, tex=None):
    return dict(rgba=tuple(rgba), rough=rough, metal=metal, tex=tex)


def design(name, size, rgba, hz):
    """{material key: (Mesh, material)} for an object, in its frame (centre of its collision shape). None: keep the
    plain shape."""
    r = size[0]
    hh = size[-1]
    if name.startswith("mug"):
        glaze = _mat(rgba, 0.18)
        wall = lathe([(r * 0.82, hh - 0.006), (r * 0.82, -hh + 0.008)], 40)          # inside
        wall = wall + lathe([(r * 0.82, -hh + 0.008), (0.0, -hh + 0.008)], 40)      # inside bottom
        outer = lathe([(r * 0.80, -hh), (r * 0.97, -hh + 0.003), (r, -hh + 0.012), (r, hh - 0.003), (r * 0.97, hh)], 40)
        rim = lathe([(r * 0.97, hh), (r * 0.82, hh - 0.006)], 40)
        hp = arc((r + 0.004, 0, 0.011), 0.026, 0.032, -math.pi / 2, math.pi / 2, 20)       # up to the rim, as mugs are
        handle = tube(hp, 0.0065)
        bottom = disc(r * 0.8, -hh, 40, up=False)
        return {"glaze": (outer + rim + wall + handle + bottom, glaze)}
    if name == "pot":
        steel = _mat((0.80, 0.81, 0.83, 1), 0.28, 1.0)
        body = lathe([(r - 0.004, -hh), (r, -hh + 0.006), (r, hh - 0.006), (r + 0.004, hh), (r - 0.002, hh), (r - 0.004, hh - 0.004),
                      (r - 0.004, -hh + 0.006)], 48) + disc(r - 0.004, -hh + 0.006, 48) + disc(r - 0.004, -hh, 48, up=False)
        hs = Mesh()
        for s in (1, -1):                                # side loop handles, like a stockpot's
            hs = hs + tube([(s * (r + 0.002), -0.032, hh - 0.014), (s * (r + 0.028), -0.027, hh - 0.007),
                            (s * (r + 0.04), 0.0, hh - 0.005), (s * (r + 0.028), 0.027, hh - 0.007),
                            (s * (r + 0.002), 0.032, hh - 0.014)], 0.0065)
        return {"steel": (body + hs, steel)}
    if name == "pan":
        dark = _mat((0.12, 0.12, 0.13, 1), 0.45, 0.2)
        black = _mat((0.05, 0.05, 0.05, 1), 0.6)
        body = lathe([(r * 0.78, -hh), (r * 0.95, -hh + 0.01), (r, hh), (r - 0.004, hh), (r * 0.94, -hh + 0.012),
                      (r * 0.76, -hh + 0.005)], 48) + disc(r * 0.76, -hh + 0.005, 48) + disc(r * 0.78, -hh, 48, up=False)
        handle = tube([(r - 0.01, 0, hh - 0.008), (r + 0.06, 0, hh + 0.004), (r + 0.19, 0, hh + 0.02)], 0.011)
        ring = tube(arc((r + 0.172, 0, hh + 0.02), 0.009, 0.009, 0, 2 * math.pi, 14, "x"), 0.002, caps=False)
        return {"pan": (body, dark), "handle": (handle + ring, black)}
    if name == "board":
        wood = _mat((1, 1, 1, 1), 0.65, tex=_tex("wood_board", _wood))
        slab = box(0.10, 0.07, hh, bevel=0.3)
        grip = box(0.032, 0.026, hh, c=(0.128, 0, 0), bevel=0.3)
        hole = disc(0.011, hh + 0.0006, 20).moved(t=(0.135, 0, 0))
        return {"wood": (slab + grip, wood), "hole": (hole, _mat((0.08, 0.06, 0.04, 1), 0.9))}
    if name == "kettle":
        cream = _mat((0.93, 0.90, 0.82, 1), 0.25)
        chrome = _mat((0.85, 0.86, 0.88, 1), 0.15, 1.0)
        black = _mat((0.08, 0.06, 0.05, 1), 0.5)
        prof = [(0.0, -hh), (r * 0.9, -hh), (r, -hh + 0.02), (r, hh - 0.05), (r * 0.82, hh - 0.01), (r * 0.45, hh + 0.012), (0.0, hh + 0.016)]
        body = lathe(prof, 48)
        knob = ellipsoid(0.014, 0.014, 0.012, (0, 0, hh + 0.024), 12)
        spout = tube([(r * 0.85, 0, -hh + 0.05), (r + 0.03, 0, -hh + 0.09), (r + 0.06, 0, hh - 0.02)], 0.011)
        posts = (tube([(-0.045, 0, hh - 0.005), (-0.05, 0, hz - 0.02)], 0.005) +
                 tube([(0.045, 0, hh - 0.005), (0.05, 0, hz - 0.02)], 0.005))
        grip = tube([(-0.055, 0, hz - 0.012), (0.055, 0, hz - 0.012)], 0.012)
        base = cyl(r * 0.93, -hh, -hh + 0.012, 40)
        return {"body": (body, cream), "chrome": (posts + spout + base, chrome), "grip": (grip + knob, black)}
    if name == "bucket":
        blue = _mat(rgba, 0.4)
        wire = _mat((0.6, 0.6, 0.62, 1), 0.3, 1.0)
        body = lathe([(r * 0.82, -hh), (r * 0.98, hh - 0.01), (r, hh), (r * 0.96, hh), (r * 0.80, -hh + 0.006)], 40)
        body = body + disc(r * 0.80, -hh + 0.006, 40) + disc(r * 0.82, -hh, 40, up=False)
        bail = tube(arc((0, 0, hh - 0.02), r * 0.99, hz - hh + 0.02, 0, math.pi, 28), 0.0035)
        grip = tube([(-0.05, 0, hz), (0.05, 0, hz)], 0.012)
        return {"body": (body, blue), "bail": (bail, wire), "grip": (grip, _mat((0.1, 0.1, 0.1, 1), 0.6))}
    if name == "blocks":
        tub = _mat((0.95, 0.95, 0.96, 0.9), 0.3)
        body = lathe([(r * 0.85, -hh), (r, hh), (r * 0.95, hh), (r * 0.8, -hh + 0.006)], 36) + disc(r * 0.85, -hh, 36, up=False)
        bricks = Mesh()
        rng = np.random.default_rng(3)
        for k in range(14):
            a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.6)
            bricks = bricks + box(0.016, 0.008, 0.01, c=(rr * math.cos(a), rr * math.sin(a), hh - 0.03 + rng.uniform(0, 0.02)))
        bail = tube(arc((0, 0, hh - 0.01), r * 0.98, hz - hh + 0.01, 0, math.pi, 24), 0.004)
        return {"tub": (body, tub), "bricks": (bricks, _mat((0.85, 0.15, 0.12, 1), 0.3)), "bail": (bail, _mat((0.2, 0.5, 0.95, 1), 0.4))}
    if name == "can":
        green = _mat(rgba, 0.4)
        body = lathe([(0.0, -hh), (r * 0.95, -hh), (r, -hh + 0.01), (r, hh - 0.02), (r * 0.8, hh), (r * 0.35, hh + 0.01), (0.0, hh + 0.012)], 40)
        spout = tube([(r * 0.8, 0, -hh + 0.03), (r + 0.06, 0, 0.0), (r + 0.13, 0, hh + 0.06)], 0.009)
        rose = lathe([(0.0, 0.0), (0.022, 0.012), (0.022, 0.018), (0.0, 0.019)], 20).moved(t=(r + 0.135, 0, hh + 0.065), pitch=-0.9)
        handle = tube(arc((0, 0, hh), r * 0.85, hz - hh, 0.15, math.pi - 0.15, 24), 0.011)
        return {"can": (body + spout + rose + handle, green)}
    if name == "spray":
        blue = _mat((0.55, 0.85, 0.95, 0.85), 0.2, tex=_tex("cleaner_label", _label))
        white = _mat((0.95, 0.95, 0.96, 1), 0.4)
        body = lathe([(0.0, -hh), (r * 0.95, -hh), (r, -hh + 0.01), (r, hh - 0.02), (r * 0.6, hh), (r * 0.38, hh + 0.01), (r * 0.38, hh + 0.03)], 32)
        head = box(0.028, 0.016, 0.03, c=(0.008, 0, hh + 0.06), bevel=0.3)
        nozzle = box(0.012, 0.008, 0.008, c=(0.045, 0, hh + 0.075))
        trig = tube([(0.025, 0, hh + 0.045), (0.035, 0, hh + 0.02), (0.03, 0, hh + 0.005)], 0.005)
        loop = tube(arc((0, 0, hh + 0.09), 0.02, hz - hh - 0.09, 0, math.pi, 16), 0.004)
        return {"bottle": (body, blue), "head": (head + nozzle + trig + loop, white)}
    if name == "lunchbox":
        orange = _mat(rgba, 0.35)
        sx, sy = size[0], size[1]
        body = box(sx, sy, hh * 0.72, c=(0, 0, -hh * 0.28), bevel=0.35)
        lid = box(sx * 1.02, sy * 1.02, hh * 0.28, c=(0, 0, hh * 0.72), bevel=0.4)
        handle = tube([(-0.05, 0, hh), (-0.045, 0, hz - 0.006), (0.045, 0, hz - 0.006), (0.05, 0, hh)], 0.008)
        clips = box(0.012, sy * 1.06, 0.01, c=(0, 0, hh * 0.45))
        return {"body": (body, orange), "lid": (lid + handle, _mat((0.15, 0.55, 0.85, 1), 0.35)),
                "clips": (clips, _mat((0.95, 0.95, 0.95, 1), 0.4))}
    if name == "toolbox":
        red = _mat(rgba, 0.35, 0.3)
        sx, sy = size[0], size[1]
        body = box(sx, sy, hh * 0.7, c=(0, 0, -hh * 0.3), bevel=0.2)
        lid = box(sx * 1.01, sy * 1.03, hh * 0.3, c=(0, 0, hh * 0.7), bevel=0.4)
        metal = _mat((0.75, 0.76, 0.78, 1), 0.25, 1.0)
        latch = box(0.012, 0.004, 0.012, c=(-0.1, -sy * 1.03, hh * 0.35)) + box(0.012, 0.004, 0.012, c=(0.1, -sy * 1.03, hh * 0.35))
        posts = box(0.006, 0.012, (hz - hh) / 2, c=(-0.08, 0, (hz + hh) / 2)) + box(0.006, 0.012, (hz - hh) / 2, c=(0.08, 0, (hz + hh) / 2))
        grip = tube([(-0.085, 0, hz), (0.085, 0, hz)], 0.011)
        return {"box": (body + lid, red), "metal": (latch + posts, metal), "grip": (grip, _mat((0.08, 0.08, 0.08, 1), 0.7))}
    if name == "bag":
        black = _mat((0.10, 0.10, 0.12, 1), 0.8, tex=_tex("tote", _cotton((60, 60, 66), 21)))
        sx, sy = size[0], size[1]
        body = box(sx, sy, hh, bevel=0.15)
        straps = Mesh()
        for s in (-1, 1):
            straps = straps + tube([(-0.07, s * sy, hh - 0.01), (-0.05, s * sy * 0.6, hz - 0.03), (0.0, 0.0, hz),
                                    (0.05, s * sy * 0.6, hz - 0.03), (0.07, s * sy, hh - 0.01)], 0.006)
        return {"bag": (body + straps, black)}
    if name == "basket":
        wick = _mat((1, 1, 1, 1), 0.85, tex=_tex("woven", _woven))
        sx, sy = size[0], size[1]
        walls = Mesh()
        prof = lathe([(1.0, -1.0), (1.06, 1.0)], 48)
        prof = prof + lathe([(1.0, 1.0), (0.94, -0.92)], 48) + disc(0.94, -0.92, 48)
        walls = prof.moved(scale=(sx * 0.94, sy * 0.94, hh))
        handle = tube(arc((0, 0, hh), sx * 0.85, hz - hh, 0, math.pi, 28), 0.012)
        return {"basket": (walls + handle + disc(sx * 0.9, -hh, 40, up=False).moved(scale=(1, sy / sx, 1)), wick)}
    if name == "pasta":
        pack = _mat((1, 1, 1, 1), 0.5, tex=_tex("pasta", _pasta))
        sx, sy = size[0], size[1]
        body = box(sx, sy, hh, bevel=0.1)
        tab = box(0.025, 0.002, (hz - hh) / 2 + 0.005, c=(0, 0, (hz + hh) / 2))
        slot = box(0.012, 0.0025, 0.006, c=(0, 0, hz - 0.008))
        return {"pack": (body, pack), "tab": (tab, _mat((0.95, 0.95, 0.9, 1), 0.5)), "slot": (slot, _mat((0.05, 0.05, 0.05, 1), 0.9))}
    if name == "trash":
        bag = _mat((1, 1, 1, 1), 0.35, tex=_tex("binbag", _bag_black))
        sx, sy = size[0], size[1]
        blob = ellipsoid(sx * 1.05, sy * 1.05, hh, (0, 0, -0.01), 28, noise=0.06, seed=4)
        neck = tube([(0, 0, hh - 0.04), (0, 0, hh + 0.03)], 0.02)
        ears = tube(arc((0, 0, hh + 0.03), 0.04, hz - hh - 0.03, 0.2, math.pi - 0.2, 14), 0.008)
        return {"bag": (blob + neck + ears, bag)}
    if name == "teddy":
        fur = _mat((1, 1, 1, 1), 0.95, tex=_tex("fur", _fur))
        body = ellipsoid(0.07, 0.06, 0.075, (0, 0, -0.04), 20)
        head = ellipsoid(0.055, 0.05, 0.05, (0, 0, 0.065), 20)
        ears = ellipsoid(0.02, 0.012, 0.02, (0, 0.04, 0.11), 10) + ellipsoid(0.02, 0.012, 0.02, (0, -0.04, 0.11), 10)
        limbs = (ellipsoid(0.022, 0.022, 0.045, (0.02, 0.07, -0.02), 10) + ellipsoid(0.022, 0.022, 0.045, (0.02, -0.07, -0.02), 10)
                 + ellipsoid(0.05, 0.025, 0.022, (0.05, 0.035, -0.1), 10) + ellipsoid(0.05, 0.025, 0.022, (0.05, -0.035, -0.1), 10))
        snout = ellipsoid(0.02, 0.022, 0.018, (0.048, 0, 0.055), 12)
        eyes = ellipsoid(0.006, 0.006, 0.006, (0.047, 0.018, 0.077), 8) + ellipsoid(0.006, 0.006, 0.006, (0.047, -0.018, 0.077), 8)
        loop = tube(arc((0, 0, 0.11), 0.018, hz - 0.11, 0, math.pi, 14), 0.004)
        return {"fur": (body + head + ears + limbs, fur), "snout": (snout, _mat((0.85, 0.72, 0.55, 1), 0.9)),
                "eyes": (eyes, _mat((0.02, 0.02, 0.02, 1), 0.2)), "loop": (loop, _mat((0.85, 0.1, 0.15, 1), 0.7))}
    if name == "truck":
        yellow = _mat(rgba, 0.35)
        sx, sy = size[0], size[1]
        bed = box(sx * 0.6, sy, hh * 0.45, c=(-sx * 0.35, 0, hh * 0.05), bevel=0.2)
        cab = box(sx * 0.32, sy * 0.95, hh * 0.75, c=(sx * 0.62, 0, hh * 0.2), bevel=0.3)
        win = box(0.002, sy * 0.75, hh * 0.3, c=(sx * 0.95, 0, hh * 0.55))
        wheels = Mesh()
        for x in (-sx * 0.65, -sx * 0.15, sx * 0.62):
            for s in (-1, 1):
                wheels = wheels + cyl(0.022, -0.009, 0.009, 18).moved(t=(x, s * sy, -hh + 0.022), roll=math.pi / 2)
        handle = tube([(-0.08, 0, hh * 0.5), (-0.06, 0, hz), (0.06, 0, hz), (0.08, 0, hh * 0.9)], 0.007)
        return {"truck": (bed + cab + handle, yellow), "glass": (win, _mat((0.2, 0.3, 0.4, 1), 0.1)),
                "wheels": (wheels, _mat((0.08, 0.08, 0.08, 1), 0.8))}
    if name == "ball":
        ball = _mat((1, 1, 1, 1), 0.4, tex=_tex("ball", _ball))
        net = Mesh()
        for k in range(6):
            a = k * math.pi / 3
            net = net + tube([(r * 1.02 * math.cos(a) * math.sin(t), r * 1.02 * math.sin(a) * math.sin(t), r * 1.02 * math.cos(t))
                              for t in np.linspace(0.15, math.pi * 0.85, 14)], 0.0015, 6)
        cord = tube([(0, 0, r), (0, 0, hz - 0.03)], 0.002, 6) + tube(arc((0, 0, hz - 0.03), 0.015, 0.03, 0, math.pi, 12), 0.003, 6)
        return {"ball": (ellipsoid(r, r, r, (0, 0, 0), 28), ball), "net": (net + cord, _mat((0.95, 0.9, 0.3, 1), 0.7))}
    if name in ("shirt", "jeans", "socks"):
        tex = {"shirt": _tex("cotton_white", _cotton((236, 236, 242), 31)), "jeans": _tex("denim", _denim),
               "socks": _tex("knit_grey", _knit((150, 150, 156), 41))}[name]
        cloth = _mat((1, 1, 1, 1), 0.95, tex=tex)
        sx, sy = size[0], size[1]
        m = Mesh()
        layers = 3 if name != "socks" else 2
        for k in range(layers):                          # folded: a few soft layers
            m = m + box(sx * (1 - 0.04 * k), sy * (1 - 0.05 * k), hh / layers, c=(0.004 * k, 0, -hh + hh / layers * (2 * k + 1)), bevel=0.6)
        return {"cloth": (m, cloth)}
    if name == "hoover":
        purple = _mat(rgba, 0.35)
        dark = _mat((0.12, 0.12, 0.14, 1), 0.5)
        sx, sy = size[0], size[1]
        head = box(sx, sy, hh, bevel=0.4)
        brush = cyl(0.012, -sx * 0.9, sx * 0.9, 14).moved(t=(0, -sy * 0.7, -hh + 0.012), roll=math.pi / 2, yaw=math.pi / 2)
        motor = cyl(0.045, 0.52, 0.72, 24) + ellipsoid(0.045, 0.045, 0.025, (0, 0, 0.72), 16)
        loop = tube([(0, 0, 0.74), (-0.03, 0, hz - 0.03), (0, 0, hz), (0.03, 0, hz - 0.03), (0.0, 0.0, 0.74)], 0.011)
        shaft = tube([(0, 0, hh), (0, 0, 0.52)], 0.016)
        return {"body": (head + motor, purple), "dark": (brush + loop + shaft, dark)}
    if name in ("brush", "toilet_brush"):
        wood = _mat((0.62, 0.42, 0.25, 1), 0.6)
        white = _mat((0.95, 0.95, 0.95, 1), 0.5)
        sx, sy = size[0], size[1]
        if name == "brush":
            block = box(sx, sy, hh * 0.45, c=(0, 0, hh * 0.55), bevel=0.4)
            bristles = box(sx * 0.92, sy * 0.88, hh * 0.55, c=(0, 0, -hh * 0.45))
            rod = tube([(0, 0, hh), (0, 0, hz - 0.03)], 0.009)
            loop = tube(arc((0, 0, hz - 0.03), 0.016, 0.03, 0, math.pi, 12), 0.006)
            return {"wood": (block + rod + loop, wood), "bristles": (bristles, _mat((0.25, 0.55, 0.85, 1), 0.9))}
        head = ellipsoid(sx, sy, hh * 1.3, (0, 0, 0), 16)
        rod = tube([(0, 0, hh), (0, 0, hz - 0.03)], 0.008)
        loop = tube(arc((0, 0, hz - 0.03), 0.016, 0.03, 0, math.pi, 12), 0.006)
        return {"head": (head, _mat((0.85, 0.85, 0.9, 1), 0.95)), "rod": (rod + loop, white)}
    if name == "spatula":
        blade = box(size[0], size[1], 0.002, bevel=0.2)
        slots = Mesh()
        for k in range(-2, 3):
            slots = slots + box(size[0] * 0.55, 0.0025, 0.0022, c=(0.004, k * 0.012, 0.0))
        neck = tube([(-size[0], 0, 0.0), (-size[0] - 0.012, 0, 0.06), (-0.03, 0, hz - 0.01)], 0.004)
        grip = tube([(-0.035, 0, hz - 0.004), (0.06, 0, hz - 0.004)], 0.01)
        return {"steel": (blade + neck, _mat((0.82, 0.82, 0.84, 1), 0.3, 1.0)), "slots": (slots, _mat((0.1, 0.1, 0.1, 1), 0.9)),
                "grip": (grip, _mat((0.08, 0.08, 0.08, 1), 0.6))}
    if name == "plate":
        china = _mat((0.97, 0.97, 0.95, 1), 0.12)
        body = lathe([(0.0, -hh), (r * 0.55, -hh), (r * 0.62, -hh + 0.004), (r, hh), (r * 0.97, hh), (r * 0.6, -hh + 0.006),
                      (0.0, -hh + 0.006)], 48)
        band = lathe([(r * 0.93, hh - 0.002), (r * 0.88, hh - 0.004)], 48)
        rod = tube([(0, 0, -hh + 0.006), (0, 0, hz - 0.02)], 0.005)
        loop = tube(arc((0, 0, hz - 0.02), 0.016, 0.02, 0, 2 * math.pi, 20, "x"), 0.004, caps=False)
        gold = _mat((0.85, 0.7, 0.35, 1), 0.25, 1.0)
        return {"china": (body, china), "gold": (band + rod + loop, gold)}
    return None


def fetch(name, size, rgba, hz):
    """Make (once) and return the object's look: [(obj file, material dict)], or None."""
    out = GEN / "objects" / name
    meta = out / "meta.json"
    if meta.exists():
        try:
            m = json.loads(meta.read_text())
            if m.get("version") == VERSION:
                return [(str(out / p["obj"]), p["mat"]) for p in m["parts"]]
        except ValueError:
            pass
    parts = design(name, size, rgba, hz)
    if parts is None:
        return None
    from real_assets import _write_obj
    out.mkdir(parents=True, exist_ok=True)
    rec = []
    for k, (key, (mesh, mat)) in enumerate(parts.items()):
        if not len(mesh.F):
            continue
        f = f"{key}.obj"
        _write_obj(out / f, mesh.V, mesh.N, mesh.UV, mesh.F)
        rec.append(dict(obj=f, mat=mat))
    meta.write_text(json.dumps(dict(version=VERSION, parts=rec)))
    return [(str(out / p["obj"]), p["mat"]) for p in rec]
