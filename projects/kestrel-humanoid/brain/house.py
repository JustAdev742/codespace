"""KESTREL house: a whole single-storey home in the simulator, to test the robot as hard as a real home would.

    KESTREL_VARIANT=s1body python house.py              # renders an overview and room views to runs/house_*.png

14 m x 10 m, on a raised floor slab 14 cm above the garden:

* open-plan kitchen (L-shaped counters, island, fridge, stools), dining area (table, four chairs) and living room with
  a sunken lounge one 14 cm step down (sofa, coffee table, TV, armchair, rug);
* a hallway with a runner rug, console table, coat stand and shoes by the front door;
* bedroom (double bed, nightstands, wardrobe, rug), bathroom (bath, toilet, vanity, slippery tiles, a 1.5 cm door
  threshold), study (desk, desk chair, bookshelf, armchair);
* hinged doors (bedroom, bathroom, study, front door) that swing if pushed, windows, ceilings (head camera only);
* outside: a front porch with two 7 cm steps, a patio deck one step down from the living room, a lawn and a bench;
* things to fetch, each with a handle on top for the S1's hook hand: kettle, lunchbox, shopping bag, laundry basket,
  bucket, toolbox, watering can;
* people: one standing in the study, one walking a loop through the kitchen, hall and dining area (they stop for the
  robot), and "you", the person giving instructions; a robot vacuum wandering the kitchen and dining area.

Floors are real collision geometry; the walking policy's height scan reads a height map of exactly that floor (the
same kind of input it was trained on, with stairs), so steps, rugs and thresholds are seen and stepped over. Floor
friction differs by room (bathroom tiles 0.5, kitchen tiles 0.7, wood 0.8, carpet and rugs 1.0).

The house also provides what a robot that has mapped its home would know: an occupancy grid for path planning, named
rooms, furniture with places to stand, chairs it can sit on, and where each object belongs.
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("KESTREL_VARIANT", "s1body")
if "MUJOCO_GL" not in os.environ and not os.environ.get("DISPLAY"):
    os.environ["MUJOCO_GL"] = "osmesa"

import numpy as np            # noqa: E402
import mujoco                 # noqa: E402

import skills as SK           # noqa: E402
import arena as A             # noqa: E402
import env as E               # noqa: E402
import terrain as T           # noqa: E402

Z0 = 0.14                     # house floor (slab top) above the garden
WALL_H = 2.5
TEX_DIR = HERE / "data" / "house_tex"
TEX_VERSION = "v2"
GRID = 0.10                   # occupancy grid cell (m)
MAP_X, MAP_Y = (-3.0, 18.0), (-4.0, 13.0)
ROBOT_R = 0.30                # inflation radius for planning (half the robot's width plus a margin)
ROBOT_TOP = 1.55              # anything lower than this above the floor is in the robot's way


# ======================================================================= textures
def make_textures():
    """Procedural textures (PNG), made once: wood planks, tiles, carpet, paint, grass, pavers, rugs, fabric."""
    if (TEX_DIR / TEX_VERSION).exists():
        return
    from PIL import Image, ImageFilter
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)

    def save(name, a):
        Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(TEX_DIR / f"{name}.png")

    def noise(n, blur, amp):
        img = Image.fromarray((rng.random((n, n)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
        a = np.asarray(img, float)
        return (a - a.mean()) / (a.std() + 1e-6) * amp

    N = 512
    # oak planks: 8 planks across, staggered end joints, grain along the plank
    y, x = np.mgrid[0:N, 0:N]
    plank = x // (N // 8)
    shade = rng.uniform(-18, 18, 8)[plank]
    off = rng.integers(0, N, 8)[plank]
    grain = 9 * np.sin((y + off) * 0.06 + 3 * np.sin(x * 0.11 + plank)) + noise(N, 1.2, 6)
    base = np.stack([np.full((N, N), 168.0), np.full((N, N), 122.0), np.full((N, N), 78.0)], -1)
    wood = base + (shade + grain)[..., None] * np.array([1.0, 0.8, 0.6])
    wood[(x % (N // 8)) < 2] *= 0.6
    wood[((y + off) % 384) < 2] *= 0.65
    save("wood", wood)
    # darker furniture wood
    save("wood_dark", wood * np.array([0.55, 0.5, 0.48]))
    # kitchen tiles: 4 x 4 large grey-white tiles, grout lines
    n = 256
    t = np.full((n, n, 3), 226.0) + rng.uniform(-8, 8, (4, 4))[np.mgrid[0:n, 0:n][0] // 64, np.mgrid[0:n, 0:n][1] // 64][..., None]
    t += noise(n, 1.0, 3)[..., None]
    g = (np.mgrid[0:n, 0:n] % 64 < 3).any(0)
    t[g] = [150, 150, 148]
    save("tile", t)
    # bathroom: small blue-grey mosaic
    t = np.full((n, n, 3), [176.0, 196.0, 206.0]) + rng.uniform(-12, 12, (16, 16))[np.mgrid[0:n, 0:n][0] // 16, np.mgrid[0:n, 0:n][1] // 16][..., None]
    g = (np.mgrid[0:n, 0:n] % 16 < 2).any(0)
    t[g] = [235, 235, 235]
    save("bath_tile", t)
    # carpet
    save("carpet", np.array([150.0, 140.0, 128.0]) + noise(n, 0.8, 10)[..., None] + noise(n, 6, 6)[..., None])
    # wall paint: warm off-white, faint roller texture
    save("paint", np.array([234.0, 228.0, 216.0]) + noise(n, 2.0, 2.5)[..., None])
    # lawn
    gr = np.array([78.0, 128.0, 52.0]) + noise(n, 0.7, 16)[..., None] * np.array([0.6, 1.0, 0.5]) + noise(n, 10, 10)[..., None]
    save("grass", gr)
    # pavers / deck boards
    yy, xx = np.mgrid[0:n, 0:n]
    deck = np.array([140.0, 104.0, 74.0]) + rng.uniform(-14, 14, 8)[xx // 32][..., None] + noise(n, 1.0, 5)[..., None]
    deck[(xx % 32) < 2] = [70, 52, 40]
    save("deck", deck)
    # rugs: a red patterned one and a blue striped runner
    rug = np.full((n, n, 3), [150.0, 40.0, 38.0])
    border = (np.minimum(np.minimum(xx, n - 1 - xx), np.minimum(yy, n - 1 - yy)) < 20)
    rug[border] = [40, 40, 70]
    diamond = (np.abs(xx - n / 2) + np.abs(yy - n / 2)) % 48 < 6
    rug[diamond & ~border] = [215, 180, 110]
    rug += noise(n, 0.8, 6)[..., None]
    save("rug_red", rug)
    stripes = np.where((xx // 20) % 2 == 0, 1.0, 0.0)[..., None]
    save("rug_blue", np.array([40.0, 60.0, 110.0]) * stripes + np.array([200.0, 200.0, 190.0]) * (1 - stripes)
         + noise(n, 0.8, 6)[..., None])
    # fabrics
    save("fabric_grey", np.array([96.0, 104.0, 118.0]) + noise(n, 0.6, 8)[..., None])
    save("fabric_bed", np.array([210.0, 214.0, 222.0]) + noise(n, 0.6, 5)[..., None]
         + 10 * ((xx // 32 + yy // 32) % 2)[..., None])
    (TEX_DIR / TEX_VERSION).write_text("ok")


MATERIALS = {   # name: (texture or None, rgba, texrepeat per metre, reflectance)
    "wood_floor": ("wood", (1, 1, 1, 1), 0.6, 0.08),
    "tile_floor": ("tile", (1, 1, 1, 1), 0.8, 0.15),
    "bath_floor": ("bath_tile", (1, 1, 1, 1), 2.0, 0.2),
    "carpet": ("carpet", (1, 1, 1, 1), 1.0, 0.0),
    "paint": ("paint", (1, 1, 1, 1), 1.0, 0.0),
    "grass": ("grass", (1, 1, 1, 1), 0.5, 0.0),
    "deck": ("deck", (1, 1, 1, 1), 0.8, 0.02),
    "rug_red": ("rug_red", (1, 1, 1, 1), 0.4, 0.0),
    "rug_blue": ("rug_blue", (1, 1, 1, 1), 0.5, 0.0),
    "fabric_grey": ("fabric_grey", (1, 1, 1, 1), 1.0, 0.0),
    "fabric_bed": ("fabric_bed", (1, 1, 1, 1), 1.0, 0.0),
    "wood_dark": ("wood_dark", (1, 1, 1, 1), 1.0, 0.05),
    "wood_light": ("wood", (1, 1, 1, 1), 1.0, 0.05),
    "worktop": (None, (0.22, 0.22, 0.24, 1), 1, 0.2),
    "cabinet": (None, (0.93, 0.93, 0.91, 1), 1, 0.05),
    "steel": (None, (0.78, 0.80, 0.82, 1), 1, 0.35),
    "black": (None, (0.08, 0.08, 0.09, 1), 1, 0.2),
    "white": (None, (0.96, 0.96, 0.96, 1), 1, 0.15),
    "glass": (None, (0.70, 0.85, 0.95, 0.22), 1, 0.4),
    "plant": (None, (0.18, 0.45, 0.20, 1), 1, 0.0),
    "pot": (None, (0.65, 0.38, 0.25, 1), 1, 0.0),
    "lamp": (None, (1.0, 0.95, 0.80, 1), 1, 0.0),
}


def assets_xml():
    out = ['<texture type="skybox" builtin="gradient" rgb1="0.62 0.76 0.94" rgb2="0.95 0.96 1.0" width="256" height="256"/>']
    for f in sorted(TEX_DIR.glob("*.png")):
        out.append(f'<texture name="t_{f.stem}" type="2d" file="{f.as_posix()}"/>')
    for name, (tex, rgba, rep, refl) in MATERIALS.items():
        t = f' texture="t_{tex}" texrepeat="{rep} {rep}" texuniform="true"' if tex else ""
        out.append(f'<material name="{name}"{t} rgba="{" ".join(map(str, rgba))}" reflectance="{refl}"/>')
    return "<asset>\n    " + "\n    ".join(out) + "\n  </asset>"


# ======================================================================= builder
def f3(v):
    return " ".join(f"{a:.4f}" for a in v)


class Builder:
    """Collects the house's MJCF, and what the robot's map needs."""

    def __init__(self):
        self.world = []          # static geoms in world coordinates
        self.bodies = []         # bodies (chairs, doors, objects, people)
        self.floor = []          # (x0, x1, y0, y1, top): floor-level surfaces for the height map
        self.n = 0
        self.rooms, self.furniture, self.chairs, self.objects, self.doors = {}, {}, {}, {}, {}
        self.people = {}

    def nm(self, base):
        self.n += 1
        return f"{base}_{self.n}"

    def geom(self, typ, c, size, mat=None, rgba=None, name=None, col=True, group=None, fr=None, pri=None,
             euler=None, dst=None, mass=None):
        a = [f'type="{typ}"', f'pos="{f3(c)}"', f'size="{f3(size)}"']
        if name:
            a.insert(0, f'name="{name}"')
        if mat:
            a.append(f'material="{mat}"')
        if rgba:
            a.append(f'rgba="{f3(rgba)}"')
        if not col:
            a.append('contype="0" conaffinity="0"')
        if group is not None:
            a.append(f'group="{group}"')
        if fr is not None:
            a.append(f'friction="{fr} 0.02 0.001"')
        if pri is not None:
            a.append(f'priority="{pri}"')
        if euler is not None:
            a.append(f'euler="{f3(euler)}"')
        if mass is not None:
            a.append(f'mass="{mass}"')
        s = "<geom " + " ".join(a) + "/>"
        (self.world if dst is None else dst).append(s)
        return s

    def box(self, x0, x1, y0, y1, z0, z1, mat=None, rgba=None, **kw):
        """Axis-aligned box from its extents (world)."""
        return self.geom("box", ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                         ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat, rgba, **kw)

    def floor_box(self, x0, x1, y0, y1, top, mat, fr, kind="floor", bottom=None):
        """A walkable surface: collision geometry with its own friction (priority over the feet's), and the height map."""
        b = top - 0.3 if bottom is None else bottom
        self.box(x0, x1, y0, y1, b, top, mat, name=self.nm(kind), fr=fr, pri=1)
        self.floor.append((x0, x1, y0, y1, top))

    def body(self, name, pos, yaw, geoms, joint=None, extra=""):
        j = joint or ""
        self.bodies.append(f'<body name="{name}" pos="{f3(pos)}" euler="0 0 {yaw:.4f}">{j}{extra}{"".join(geoms)}</body>')


# ----------------------------------------------------------------------- walls
def wall(b, axis, fixed, a0, a1, t, openings=(), z0=Z0, h=WALL_H):
    """A wall along x (axis 'x', at y = fixed) or along y (axis 'y', at x = fixed), from a0 to a1, thickness t.
    openings: (s0, s1, kind[, sill]) with kind 'door' (to 2.1 m, lintel above), 'open' (no lintel above 2.3 m),
    'window' (sill height, glass, lintel)."""
    def seg(s0, s1, zz0, zz1, mat="paint", glass=False):
        if s1 - s0 < 1e-3 or zz1 - zz0 < 1e-3:
            return
        if axis == "x":
            x0, x1, y0, y1 = s0, s1, fixed - t / 2, fixed + t / 2
        else:
            x0, x1, y0, y1 = fixed - t / 2, fixed + t / 2, s0, s1
        if glass:
            if axis == "x":
                y0, y1 = fixed - 0.01, fixed + 0.01
            else:
                x0, x1 = fixed - 0.01, fixed + 0.01
        b.box(x0, x1, y0, y1, zz0, zz1, "glass" if glass else mat, name=b.nm("wall"), group=2 if glass else None)

    s = a0
    for op in sorted(openings):
        s0, s1, kind = op[:3]
        seg(s, s0, z0, z0 + h)
        if kind == "door":
            seg(s0, s1, z0 + 2.1, z0 + h)
        elif kind == "open":
            seg(s0, s1, z0 + 2.3, z0 + h)
        elif kind == "window":
            sill = op[3] if len(op) > 3 else 0.9
            seg(s0, s1, z0, z0 + sill)
            seg(s0, s1, z0 + sill, z0 + 2.1, glass=True)
            seg(s0, s1, z0 + 2.1, z0 + h)
        s = s1
    seg(s, a1, z0, z0 + h)


def door(b, name, hinge, closed_yaw, open_yaw, width):
    """A hinged door leaf. hinge: (x, y) of the hinge; closed_yaw: direction from the hinge to the far jamb when shut;
    open_yaw: how far it stands open (+ anticlockwise). It swings freely (damped) if pushed."""
    w = width - 0.04
    g = [b.geom("box", (w / 2 + 0.02, 0, 1.03), (w / 2, 0.02, 1.02), "wood_light", name=f"{name}_leaf", dst=[]),
         b.geom("sphere", (w - 0.05, 0.05, 1.0), (0.03,), "steel", col=False, dst=[]),
         b.geom("sphere", (w - 0.05, -0.05, 1.0), (0.03,), "steel", col=False, dst=[])]
    lo, hi = sorted([-open_yaw, 0.15 * math.copysign(1, open_yaw)])
    j = f'<joint name="{name}_hinge" type="hinge" axis="0 0 1" damping="6" frictionloss="2" range="{lo:.3f} {hi:.3f}"/>'
    inertial = f'<inertial pos="{w / 2 + 0.02} 0 1.03" mass="12" diaginertia="4.2 4.2 0.8"/>'
    b.body(name, (hinge[0], hinge[1], Z0 + 0.012), closed_yaw + open_yaw, g, joint=j + inertial)
    b.doors[name] = dict(hinge=hinge, closed_yaw=closed_yaw, open_yaw=open_yaw, width=width)


# ----------------------------------------------------------------------- furniture
def table(b, name, cx, cy, sx, sy, h, z0=Z0, mat="wood_light", legmat="wood_dark"):
    b.box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, z0 + h - 0.04, z0 + h, mat, name=b.nm("furn"))
    for ex in (-1, 1):
        for ey in (-1, 1):
            x, y = cx + ex * (sx / 2 - 0.06), cy + ey * (sy / 2 - 0.06)
            b.box(x - 0.025, x + 0.025, y - 0.025, y + 0.025, z0, z0 + h - 0.04, legmat, name=b.nm("furn"))
    b.furniture[name] = dict(xy=(cx, cy), size=(sx, sy), top=z0 + h)


def chair(b, name, cx, cy, face, z0=Z0):
    """The standard dining chair (the one the sit and stand-up skills were trained on): seat 46 cm, four legs, back.
    face: the direction a seated person faces (world yaw)."""
    st = SK.SEAT_TOP
    g = [b.geom("box", (0, 0, st - 0.02), (0.22, 0.22, 0.02), "wood_light", name=f"{name}_seat", fr=1.0, dst=[]),
         b.geom("box", (0, 0.21, st + 0.25), (0.22, 0.02, 0.25), "wood_light", dst=[])]
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.append(b.geom("box", (sx * 0.19, sy * 0.19, st / 2 - 0.02), (0.02, 0.02, st / 2 - 0.02), "wood_dark", dst=[]))
    b.body(name, (cx, cy, z0), face + math.pi / 2, g)
    b.chairs[name] = dict(xy=(cx, cy), face=face, z=z0)


def sofa(b, name, cx, cy, yaw, w=2.1, d=0.9, z0=0.0, mat="fabric_grey"):
    """Back along the local +y side; a seated person faces local -y."""
    g = [b.geom("box", (0, 0, 0.21), (w / 2, d / 2, 0.21), mat, dst=[]),
         b.geom("box", (0, d / 2 - 0.1, 0.55), (w / 2, 0.1, 0.34), mat, dst=[]),
         b.geom("box", (-w / 2 + 0.1, 0, 0.32), (0.1, d / 2, 0.2), mat, dst=[]),
         b.geom("box", (w / 2 - 0.1, 0, 0.32), (0.1, d / 2, 0.2), mat, dst=[])]
    for k in range(3):                                       # cushions (visual)
        g.append(b.geom("box", (-w / 3 + k * w / 3, -0.05, 0.45), (w / 6 - 0.03, d / 2 - 0.15, 0.04), mat,
                        rgba=(0.42, 0.46, 0.55, 1), col=False, dst=[]))
    b.body(name, (cx, cy, z0), yaw, g)
    b.furniture[name] = dict(xy=(cx, cy), size=(w, d), top=z0 + 0.45)


def plant(b, x, y, z0, h=1.0):
    b.geom("cylinder", (x, y, z0 + 0.18), (0.16, 0.18), "pot", name=b.nm("furn"))
    b.geom("sphere", (x, y, z0 + 0.36 + h * 0.35), (0.28 * h,), "plant", name=b.nm("furn"))


def person(b, name, x, y, z0, rgba, mocap=False):
    g = [b.geom("capsule", (0, 0, 0.85), (0.2, 0.55), rgba=rgba, name=f"{name}_body", dst=[]),
         b.geom("sphere", (0, 0, 1.62), (0.11,), rgba=(0.85, 0.70, 0.58, 1), name=f"{name}_head", dst=[])]
    if mocap:
        b.bodies.append(f'<body name="{name}" mocap="true" pos="{f3((x, y, z0))}">{"".join(g)}</body>')
    else:
        b.body(name, (x, y, z0), 0.0, g)
    b.people[name] = dict(xy=(x, y), z=z0, mocap=mocap)


# objects with a handle on top for the hook hand: name -> (shape, half-size, rgba, mass, handle height above the
# object's centre, words that name it, where it belongs)
OBJECTS = {
    "kettle": ("cylinder", (0.08, 0.10), (0.95, 0.95, 0.95, 1), 0.8, 0.17, ["kettle", "white kettle", "jug"], "kitchen counter"),
    "lunchbox": ("box", (0.11, 0.07, 0.05), (0.95, 0.55, 0.10, 1), 0.5, 0.12, ["lunchbox", "lunch box", "orange box"], "kitchen island"),
    "bag": ("box", (0.12, 0.05, 0.13), (0.10, 0.10, 0.12, 1), 0.9, 0.20, ["bag", "shopping bag", "black bag"], "hall table"),
    "basket": ("box", (0.17, 0.12, 0.10), (0.90, 0.80, 0.30, 1), 0.7, 0.36, ["basket", "laundry basket", "yellow basket"], "bedroom"),
    "bucket": ("cylinder", (0.12, 0.12), (0.15, 0.40, 0.85, 1), 0.6, 0.30, ["bucket", "blue bucket"], "bathroom"),
    "toolbox": ("box", (0.18, 0.08, 0.07), (0.80, 0.12, 0.10, 1), 1.4, 0.14, ["toolbox", "tool box", "red toolbox", "tools"], "study desk"),
    "can": ("cylinder", (0.09, 0.12), (0.20, 0.60, 0.25, 1), 0.6, 0.20, ["watering can", "can", "green can"], "patio"),
}


def grab_object(b, name, x, y, z_surface):
    shape, size, rgba, mass, hz, words, home = OBJECTS[name]
    half_h = size[-1]
    g = [b.geom(shape, (0, 0, 0), size, rgba=rgba, name=f"{name}_main", fr=1.0, dst=[])]
    span = (size[0] if shape == "box" else size[0]) * 0.55
    g.append(b.geom("box", (0, 0, hz), (span, 0.008, 0.008), rgba=(0.12, 0.12, 0.12, 1), name=f"{name}_handle", dst=[]))
    for s in (-1, 1):
        g.append(b.geom("box", (s * span, 0, (half_h + hz) / 2), (0.008, 0.008, (hz - half_h) / 2 + 0.008),
                        rgba=(0.12, 0.12, 0.12, 1), dst=[]))
    j = f'<freejoint name="{name}_free"/><inertial pos="0 0 0" mass="{mass}" diaginertia="0.004 0.004 0.003"/>'
    b.body(name, (x, y, z_surface + half_h + 0.002), 0.0, g, joint=j)
    b.objects[name] = dict(home=home, words=words, handle_z=hz, half_h=half_h, start=(x, y, z_surface))


# ======================================================================= the house
def build():
    b = Builder()
    # ---- floors (slab top Z0); the sunken lounge is at garden level
    LX0, LX1, LY0, LY1 = 9.4, 13.4, 1.2, 4.4                  # sunken lounge
    b.floor_box(0, 5.2, 0, 5.2, Z0, "tile_floor", 0.7)                         # kitchen
    b.floor_box(5.2, 8.6, 0, 5.2, Z0, "wood_floor", 0.8)                       # dining
    b.floor_box(8.6, 14, 0, LY0, Z0, "wood_floor", 0.8)                        # living, around the lounge
    b.floor_box(8.6, 14, LY1, 5.2, Z0, "wood_floor", 0.8)
    b.floor_box(8.6, LX0, LY0, LY1, Z0, "wood_floor", 0.8)
    b.floor_box(LX1, 14, LY0, LY1, Z0, "wood_floor", 0.8)
    b.floor_box(LX0, LX1, LY0, LY1, 0.002, "carpet", 1.0, bottom=-0.1)       # the lounge, one step down
    b.floor_box(0, 14, 5.2, 6.6, Z0, "wood_floor", 0.8)                        # hall
    b.floor_box(0, 5.4, 6.6, 10, Z0, "carpet", 1.0)                            # bedroom
    b.floor_box(5.4, 8.2, 6.6, 10, Z0, "bath_floor", 0.5)                      # bathroom: slippery tiles
    b.floor_box(8.2, 14, 6.6, 10, Z0, "wood_floor", 0.8)                       # study
    # outside: porch (two 7 cm steps) and patio deck (one step down from the house, one to the lawn)
    b.floor_box(14.0, 15.3, 5.0, 6.8, Z0, "deck", 0.9, kind="step")
    b.floor_box(15.3, 15.6, 5.0, 6.8, 0.07, "deck", 0.9, kind="step")
    b.floor_box(9.8, 12.6, -1.6, 0.0, 0.07, "deck", 0.9, kind="step")
    # rugs (1.2 cm) and the bathroom door threshold (1.5 cm)
    b.floor_box(10.0, 12.8, 1.85, 3.65, 0.014, "rug_red", 1.0, kind="rug", bottom=0.001)
    b.floor_box(3.6, 12.4, 5.62, 6.18, Z0 + 0.012, "rug_blue", 1.0, kind="rug", bottom=Z0 - 0.001)
    b.floor_box(0.55, 1.35, 7.9, 9.3, Z0 + 0.012, "rug_red", 1.0, kind="rug", bottom=Z0 - 0.001)
    b.floor_box(6.2, 7.1, 6.54, 6.66, Z0 + 0.015, "white", 0.8, kind="thr", bottom=Z0 - 0.001)
    b.floor_box(6.0, 6.9, 8.4, 8.9, Z0 + 0.01, "white", 1.0, kind="rug", bottom=Z0 - 0.001)          # bath mat

    # ---- walls (exterior 0.2 m, interior 0.12 m)
    wall(b, "x", 0.1, 0, 14, 0.2, [(1.6, 2.8, "window", 1.0), (5.9, 7.9, "window", 0.8), (10.2, 12.2, "door"),
                                   (12.6, 13.5, "window", 0.8)])
    wall(b, "x", 9.9, 0, 14, 0.2, [(3.6, 4.8, "window", 0.9), (6.2, 7.0, "window", 1.4), (10.4, 12.6, "window", 0.9)])
    wall(b, "y", 0.1, 0.2, 9.8, 0.2, [(2.0, 3.0, "window", 1.0), (7.6, 9.0, "window", 0.9)])
    wall(b, "y", 13.9, 0.2, 9.8, 0.2, [(1.6, 3.4, "window", 0.8), (5.45, 6.35, "door"), (7.6, 9.0, "window", 0.9)])
    wall(b, "x", 5.2, 0.2, 13.8, 0.12, [(2.2, 3.4, "open"), (6.0, 9.2, "open")])
    wall(b, "x", 6.6, 0.2, 13.8, 0.12, [(2.4, 3.3, "door"), (6.2, 7.1, "door"), (9.6, 10.5, "door")])
    wall(b, "y", 5.4, 6.66, 9.8, 0.12)
    wall(b, "y", 8.2, 6.66, 9.8, 0.12)
    wall(b, "y", 5.2, 3.6, 5.14, 0.12)
    # doors: they stand open, and swing if bumped
    door(b, "door_bedroom", (2.4, 6.66), 0.0, math.radians(92), 0.9)
    door(b, "door_bath", (7.1, 6.66), math.pi, -math.radians(92), 0.9)
    door(b, "door_study", (9.6, 6.66), 0.0, math.radians(92), 0.9)
    door(b, "door_front", (13.8, 6.35), -math.pi / 2, -math.radians(88), 0.9)
    # ceilings: head camera only (group 3, no collision)
    for x0, x1, y0, y1 in [(0, 14, 0, 5.2), (0, 14, 5.2, 6.6), (0, 14, 6.6, 10)]:
        b.box(x0, x1, y0, y1, Z0 + WALL_H, Z0 + WALL_H + 0.05, "white", name=b.nm("ceil"), col=False, group=3)

    # ---- kitchen
    b.box(0.2, 0.8, 0.8, 4.0, Z0, Z0 + 0.86, "cabinet", name=b.nm("furn"))           # west counter run
    b.box(0.2, 0.82, 0.8, 4.0, Z0 + 0.86, Z0 + 0.9, "worktop", name=b.nm("furn"))
    b.box(0.8, 3.8, 0.2, 0.8, Z0, Z0 + 0.86, "cabinet", name=b.nm("furn"))           # south counter run
    b.box(0.2, 3.82, 0.2, 0.82, Z0 + 0.86, Z0 + 0.9, "worktop", name=b.nm("furn"))
    b.box(0.3, 0.7, 2.2, 2.8, Z0 + 0.9, Z0 + 0.905, "steel", name=b.nm("vis"), col=False)        # sink
    b.box(2.9, 3.5, 0.3, 0.7, Z0 + 0.9, Z0 + 0.905, "black", name=b.nm("vis"), col=False)        # cooktop
    b.box(0.2, 0.55, 0.8, 4.0, Z0 + 1.5, Z0 + 2.2, "cabinet", name=b.nm("furn"))     # wall cabinets
    b.box(0.2, 0.9, 4.2, 4.95, Z0, Z0 + 1.85, "steel", name=b.nm("furn"))            # fridge
    b.box(2.0, 3.8, 2.25, 3.15, Z0, Z0 + 0.88, "cabinet", name=b.nm("furn"))         # island
    b.box(1.98, 3.82, 2.23, 3.17, Z0 + 0.88, Z0 + 0.92, "worktop", name=b.nm("furn"))
    for x in (2.5, 3.3):                                                             # stools
        b.geom("cylinder", (x, 3.55, Z0 + 0.33), (0.17, 0.33), "wood_dark", name=b.nm("furn"))
    b.furniture["kitchen counter"] = dict(xy=(2.3, 0.5), size=(3.0, 0.6), top=Z0 + 0.9)
    b.furniture["kitchen island"] = dict(xy=(2.9, 2.7), size=(1.8, 0.9), top=Z0 + 0.92)
    b.furniture["fridge"] = dict(xy=(0.55, 4.57), size=(0.7, 0.75), top=Z0 + 1.85)
    # ---- dining
    table(b, "dining table", 6.9, 2.5, 1.6, 0.9, 0.75)
    for k, (x, y, face) in enumerate([(6.5, 0.85, math.pi / 2), (7.3, 0.85, math.pi / 2),       # pulled out 1.2 m
                                      (6.5, 4.15, -math.pi / 2), (7.3, 4.15, -math.pi / 2)]):
        chair(b, f"dining chair {k + 1}", x, y, face)
    plant(b, 5.6, 4.7, Z0, 1.1)
    # ---- living room (lounge at garden level)
    sofa(b, "sofa", 11.4, 3.95, 0.0)
    table(b, "coffee table", 11.4, 2.75, 1.1, 0.6, 0.42, z0=0.014)
    b.box(10.6, 12.2, 1.25, 1.65, 0.002, 0.5, "wood_dark", name=b.nm("furn"))          # TV stand
    b.box(10.8, 12.0, 1.42, 1.48, 0.55, 1.25, "black", name=b.nm("furn"))              # TV
    b.furniture["tv"] = dict(xy=(11.4, 1.45), size=(1.6, 0.4), top=0.5)
    sofa(b, "armchair", 9.95, 2.75, math.pi / 2, w=0.9, d=0.85)
    b.box(11.0, 11.25, 2.6, 2.75, 0.434, 0.46, "black", name=b.nm("vis"))              # remote (clutter)
    b.box(11.6, 11.9, 2.7, 2.92, 0.434, 0.49, "wood_dark", rgba=(0.6, 0.2, 0.2, 1), name=b.nm("vis"))   # books
    plant(b, 9.0, 4.75, Z0, 1.2)
    plant(b, 13.4, 0.6, Z0, 0.9)
    b.geom("cylinder", (13.3, 4.7, Z0 + 0.8), (0.02, 0.8), "black", name=b.nm("furn"))  # floor lamp
    b.geom("cylinder", (13.3, 4.7, Z0 + 1.6), (0.18, 0.12), "lamp", name=b.nm("vis"), col=False)
    # ---- hall
    b.box(11.2, 12.2, 6.2, 6.54, Z0 + 0.76, Z0 + 0.8, "wood_light", name=b.nm("furn"))   # console table
    for x in (11.25, 12.15):
        b.box(x - 0.02, x + 0.02, 6.24, 6.5, Z0, Z0 + 0.76, "wood_dark", name=b.nm("furn"))
    b.furniture["hall table"] = dict(xy=(11.7, 6.37), size=(1.0, 0.34), top=Z0 + 0.8)
    b.geom("cylinder", (13.35, 5.45, Z0 + 0.9), (0.03, 0.9), "wood_dark", name=b.nm("furn"))   # coat stand
    b.geom("cylinder", (13.35, 5.45, Z0 + 0.02), (0.22, 0.02), "wood_dark", name=b.nm("furn"))
    for x, y in [(13.1, 5.95), (13.0, 6.15)]:                                         # shoes
        b.box(x - 0.14, x + 0.14, y - 0.05, y + 0.05, Z0, Z0 + 0.09, "black", name=b.nm("clutter"))
    # ---- bedroom
    b.box(1.5, 3.1, 7.75, 9.7, Z0, Z0 + 0.3, "wood_dark", name=b.nm("furn"))           # bed base
    b.box(1.52, 3.08, 7.77, 9.68, Z0 + 0.3, Z0 + 0.55, "fabric_bed", name=b.nm("furn"))   # mattress + duvet
    b.box(1.5, 3.1, 9.7, 9.8, Z0, Z0 + 1.0, "wood_dark", name=b.nm("furn"))            # headboard
    for x in (1.95, 2.65):
        b.box(x - 0.3, x + 0.3, 9.3, 9.62, Z0 + 0.55, Z0 + 0.66, "white", name=b.nm("vis"), col=False)   # pillows
    for x in (1.0, 3.6):
        b.box(x - 0.22, x + 0.22, 9.35, 9.75, Z0, Z0 + 0.55, "wood_light", name=b.nm("furn"))   # nightstands
        b.geom("cylinder", (x, 9.55, Z0 + 0.7), (0.09, 0.15), "lamp", name=b.nm("vis"), col=False)
    b.box(4.75, 5.34, 7.0, 8.8, Z0, Z0 + 2.0, "wood_light", name=b.nm("furn"))         # wardrobe
    b.furniture["bed"] = dict(xy=(2.3, 8.75), size=(1.6, 2.05), top=Z0 + 0.55)
    # ---- bathroom
    b.box(5.5, 7.2, 9.05, 9.8, Z0, Z0 + 0.55, "white", name=b.nm("furn"))              # bath
    b.box(5.6, 7.1, 9.15, 9.7, Z0 + 0.55, Z0 + 0.551, "bath_floor", name=b.nm("vis"), col=False)
    b.box(7.6, 8.1, 8.1, 8.5, Z0, Z0 + 0.42, "white", name=b.nm("furn"))               # toilet bowl
    b.box(7.95, 8.14, 8.0, 8.6, Z0, Z0 + 0.8, "white", name=b.nm("furn"))              # cistern
    b.box(5.46, 5.96, 7.3, 8.2, Z0, Z0 + 0.85, "wood_light", name=b.nm("furn"))        # vanity
    b.box(5.5, 5.9, 7.45, 8.05, Z0 + 0.85, Z0 + 0.88, "white", name=b.nm("vis"), col=False)
    b.box(5.46, 5.48, 7.35, 8.15, Z0 + 1.1, Z0 + 1.8, "glass", rgba=(0.85, 0.9, 0.95, 1), name=b.nm("vis"), col=False)
    # ---- study
    table(b, "study desk", 10.9, 9.45, 1.4, 0.7, 0.75)
    chair(b, "desk chair", 10.9, 8.1, math.pi / 2)
    b.box(8.26, 8.62, 7.2, 9.2, Z0, Z0 + 1.9, "wood_dark", name=b.nm("furn"))          # bookshelf
    for k in range(4):                                                               # books (visual)
        b.box(8.6, 8.63, 7.3, 9.1, Z0 + 0.3 + 0.42 * k, Z0 + 0.6 + 0.42 * k, "wood_dark",
              rgba=(0.2 + 0.15 * k, 0.25, 0.5 - 0.08 * k, 1), name=b.nm("vis"), col=False)
    sofa(b, "study armchair", 12.9, 7.4, -math.pi / 2, w=0.9, d=0.85, z0=Z0)
    plant(b, 13.4, 9.4, Z0, 0.9)
    # ---- garden
    b.box(16.0, 17.4, 2.0, 2.45, 0, 0.45, "wood_dark", name=b.nm("furn"))              # bench
    plant(b, 9.4, -1.2, 0.0, 1.0)
    plant(b, 15.9, 7.3, 0.0, 1.0)

    # ---- objects to fetch (handles on top)
    grab_object(b, "kettle", 2.6, 0.62, Z0 + 0.9)
    grab_object(b, "lunchbox", 3.2, 2.42, Z0 + 0.92)
    grab_object(b, "bag", 11.7, 6.32, Z0 + 0.8)
    grab_object(b, "basket", 1.0, 7.2, Z0)
    grab_object(b, "bucket", 7.65, 7.15, Z0)
    grab_object(b, "toolbox", 11.2, 9.25, Z0 + 0.75)
    grab_object(b, "can", 12.1, -0.7, 0.07)
    # ---- people: one standing in the study, one walking, and "you"
    person(b, "alex", 12.6, 8.9, Z0, (0.30, 0.45, 0.65, 1))
    person(b, "jordan", 3.0, 4.2, Z0, (0.62, 0.35, 0.45, 1), mocap=True)
    person(b, "you", 8.95, 2.8, Z0, (0.35, 0.55, 0.35, 1), mocap=True)
    # ---- robot vacuum (mocap disk)
    b.bodies.append(f'<body name="vacuum" mocap="true" pos="5.8 0.9 {Z0 + 0.045}">'
                    f'<geom name="vacuum_body" type="cylinder" size="0.17 0.045" rgba="0.15 0.15 0.17 1"/>'
                    f'<geom type="cylinder" size="0.05 0.005" pos="0.07 0 0.047" rgba="0.2 0.8 0.3 1" contype="0" conaffinity="0"/></body>')

    # ---- rooms: extents, a free point near the middle, and words that name them
    b.rooms = {
        "kitchen": dict(box=(0.2, 5.2, 0.2, 5.14), centre=(4.4, 4.1), words=["kitchen"]),
        "dining room": dict(box=(5.2, 8.6, 0.2, 5.14), centre=(8.1, 3.0), words=["dining room", "dining", "dining area"]),
        "living room": dict(box=(8.6, 13.8, 0.2, 5.14), centre=(11.4, 2.3), words=["living room", "lounge", "sitting room", "tv room"]),
        "hall": dict(box=(0.2, 13.8, 5.26, 6.54), centre=(8.0, 5.9), words=["hall", "hallway", "corridor", "entrance"]),
        "bedroom": dict(box=(0.2, 5.34, 6.66, 9.8), centre=(3.9, 7.6), words=["bedroom", "bed room"]),
        "bathroom": dict(box=(5.46, 8.14, 6.66, 9.8), centre=(6.7, 7.8), words=["bathroom", "bath room", "toilet", "loo"]),
        "study": dict(box=(8.26, 13.8, 6.66, 9.8), centre=(11.2, 7.6), words=["study", "office"]),
        "patio": dict(box=(9.8, 12.6, -1.6, 0.0), centre=(11.2, -0.9), words=["patio", "deck", "outside"]),
        "porch": dict(box=(14.0, 15.6, 5.0, 6.8), centre=(14.7, 5.9), words=["porch", "front door", "front step"]),
        "garden": dict(box=(14.0, 18.0, -3.0, 12.0), centre=(16.2, 4.0), words=["garden", "yard", "lawn"]),
    }
    return b


# ======================================================================= the simulated house with the robot in it
class House(SK.World):
    """The house with the robot (and people, a vacuum, objects). Same stepping and skills as skills.World."""

    def __init__(self, seed=0, policy="s1fast", chase_size=(640, 400), walker=True, vacuum=True):
        make_textures()
        self.b = build()
        world_xml = "\n".join(self.b.world + self.b.bodies) + (
            '\n<light name="sun" directional="true" pos="7 5 30" dir="-0.35 -0.25 -1" diffuse="0.55 0.55 0.5" '
            'specular="0.1 0.1 0.1" castshadow="false"/>'
            + "".join(f'<light pos="{x} {y} {Z0 + 2.3}" dir="0 0 -1" diffuse="0.28 0.27 0.24" attenuation="1 0.08 0" '
                      f'cutoff="85" castshadow="false"/>' for x, y in [(3, 2.6), (11, 2.6), (7, 8.2)]))
        eqs = "".join(f'<connect name="hook_{n}" body1="r_hand" body2="{n}" anchor="{f3(SK.HOOK)}" active="false"/>'
                      for n in OBJECTS)
        top_xml = assets_xml() + f"\n  <equality>{eqs}</equality>"
        orig = T.make

        def flat_make(seed=0, rows=T.ROWS, cols=T.COLS):        # flat ground everywhere: the house brings its floor
            H = orig(seed, rows, cols)
            H[:] = 0
            flat_make.tiles = {}
            return H
        T.make = flat_make
        try:
            super().__init__(seed=seed, policy=policy, chase_size=chase_size, world_xml=world_xml, top_xml=top_xml)
        finally:
            T.make = orig
        e, m, mv = self.e, self.e.m, self.mv
        e.auto_reset = False                     # a fall leaves the robot where it fell
        # the walking policy's height scan reads the house floor
        H = np.zeros_like(e.H)
        hs = T.HeightSampler(H)
        for x0, x1, y0, y1, top in self.b.floor:     # floors first, then rugs and thresholds on top (build order)
            ix0, ix1 = int(math.ceil((x0 - hs.x0) / T.RES)), int(math.floor((x1 - hs.x0) / T.RES))
            iy0, iy1 = int(math.ceil((y0 - hs.y0) / T.RES)), int(math.floor((y1 - hs.y0) / T.RES))
            H[iy0:iy1 + 1, ix0:ix1 + 1] = top
        self.Hfloor = H
        e.hs = T.HeightSampler(H)
        # lawn on the ground plane
        for mm in (m, mv):
            g = mujoco.mj_name2id(mm, mujoco.mjtObj.mjOBJ_GEOM, "ground")
            mm.geom_matid[g] = mujoco.mj_name2id(mm, mujoco.mjtObj.mjOBJ_MATERIAL, "grass")
            mm.geom_rgba[g] = (1, 1, 1, 1)
        mv.light_castshadow[:] = 0
        # ids
        nm = lambda mm, t, n: mujoco.mj_name2id(mm, t, n)        # noqa: E731
        self.obj_body = {n: nm(m, mujoco.mjtObj.mjOBJ_BODY, n) for n in OBJECTS}
        self.obj_qadr = {n: m.jnt_qposadr[nm(m, mujoco.mjtObj.mjOBJ_JOINT, f"{n}_free")] for n in OBJECTS}
        self.obj_eq = {n: nm(m, mujoco.mjtObj.mjOBJ_EQUALITY, f"hook_{n}") for n in OBJECTS}
        self.door_qadr = {n: m.jnt_qposadr[nm(m, mujoco.mjtObj.mjOBJ_JOINT, f"{n}_hinge")] for n in self.b.doors}
        self.mocap = {n: m.body_mocapid[nm(m, mujoco.mjtObj.mjOBJ_BODY, n)] for n in ("jordan", "you", "vacuum")}
        self.walls_v = [g for g in range(mv.ngeom) if (mujoco.mj_id2name(mv, mujoco.mjtObj.mjOBJ_GEOM, g) or "").startswith("wall_")]
        self.wall_full = (mv.geom_size[self.walls_v].copy(), mv.geom_pos[self.walls_v].copy())
        root = m.body_rootid[self.pelvis]
        self.robot_bodies = {k for k in range(m.nbody) if m.body_rootid[k] == root and k != 0}
        self.holding = None
        self.walker_on, self.vacuum_on = walker, vacuum
        self.walk_path = [(3.0, 4.3), (3.0, 5.9), (12.0, 5.9), (8.4, 4.6), (4.6, 4.4)]
        self.walk_k, self.walk_pause = 1, 0.0
        self.vac_heading, self.vac_rng = 0.3, np.random.default_rng(seed + 11)
        self.static_occ = None
        self.occ_static()
        # render options: the follow camera cuts the walls down so it can see into rooms; the head camera sees ceilings
        self.opt_ego = mujoco.MjvOption()
        self.opt_ego.geomgroup[3] = 1
        self.opt_chase = mujoco.MjvOption()
        self.cam_mode = "follow"

    # ---------------------------------------------------------------- state
    def obj_pos(self, n):
        return self.e.d[0].xpos[self.obj_body[n]].copy()

    def handle_of(self, n):
        d = self.e.d[0]
        R = d.xmat[self.obj_body[n]].reshape(3, 3)
        return d.xpos[self.obj_body[n]] + R @ np.array([0, 0, OBJECTS[n][4]])

    def set_obj(self, n, x, y, z_surface, yaw=0.0):
        d = self.e.d[0]
        a = self.obj_qadr[n]
        d.qpos[a:a + 3] = (x, y, z_surface + OBJECTS[n][1][-1] + 0.002)
        d.qpos[a + 3:a + 7] = (math.cos(yaw / 2), 0, 0, math.sin(yaw / 2))
        d.qvel[self.e.m.jnt_dofadr[mujoco.mj_name2id(self.e.m, mujoco.mjtObj.mjOBJ_JOINT, f"{n}_free")]:][:6] = 0

    def floor_z(self, x, y):
        return float(self.e.hs(np.array([x]), np.array([y]))[0])

    def person_xy(self, n):
        if n in self.mocap:
            return tuple(self.e.d[0].mocap_pos[self.mocap[n]][:2])
        return self.b.people[n]["xy"]

    def set_mocap(self, n, x, y):
        self.e.d[0].mocap_pos[self.mocap[n]] = (x, y, self.floor_z(x, y) + (0.045 if n == "vacuum" else 0.0))

    def reset(self, x=7.0, y=5.9, yaw=0.0):
        """Robot standing in the hall; objects, people and doors as built (mj_resetData restores them)."""
        self.place_robot(x, y, yaw)
        for n, p in self.b.people.items():
            if p["mocap"]:
                self.set_mocap(n, *p["xy"])
        self.set_mocap("vacuum", 5.8, 0.9)
        self.walk_k, self.walk_pause = 1, 0.0
        self.holding = None
        mujoco.mj_forward(self.e.m, self.e.d[0])

    # ---------------------------------------------------------------- the moving things
    def step(self, legs=None, arms=None, cmd=(0.0, 0.0, 0.0)):
        self._move_people()
        return super().step(legs=legs, arms=arms, cmd=cmd)

    def _move_people(self):
        d = self.e.d[0]
        rx, ry = d.qpos[0], d.qpos[1]
        if self.walker_on:                      # Jordan walks a loop and stops for the robot
            x, y = self.person_xy("jordan")
            tx, ty = self.walk_path[self.walk_k]
            dx, dy = tx - x, ty - y
            dist = math.hypot(dx, dy)
            ahead = (rx - x) * dx + (ry - y) * dy > 0
            if math.hypot(rx - x, ry - y) < 1.3 and ahead:
                pass                            # wait for the robot to pass
            elif self.walk_pause > 0:
                self.walk_pause -= E.DT
            elif dist < 0.05:
                self.walk_k = (self.walk_k + 1) % len(self.walk_path)
                self.walk_pause = 2.0 if self.walk_k in (0, 2) else 0.0
            else:
                s = min(dist, 0.9 * E.DT)
                self.set_mocap("jordan", x + dx / dist * s, y + dy / dist * s)
        if self.vacuum_on:                      # the vacuum wanders the kitchen and dining area
            x, y = d.mocap_pos[self.mocap["vacuum"]][:2]
            for _ in range(8):
                nx, ny = x + math.cos(self.vac_heading) * 0.25 * E.DT, y + math.sin(self.vac_heading) * 0.25 * E.DT
                if (0.9 < nx < 8.4 and 0.9 < ny < 5.0 and not self.occupied(nx, ny, 0.2, static=True)
                        and math.hypot(nx - rx, ny - ry) > 0.45):
                    self.set_mocap("vacuum", nx, ny)
                    break
                self.vac_heading += self.vac_rng.uniform(1.0, 3.0)

    # ---------------------------------------------------------------- the robot's map
    def occ_static(self):
        """Occupancy of everything fixed (walls, furniture, the standing person): 1 where the robot cannot be."""
        m = self.e.m
        d = mujoco.MjData(m)
        mujoco.mj_forward(m, d)
        nx = int(round((MAP_X[1] - MAP_X[0]) / GRID))
        ny = int(round((MAP_Y[1] - MAP_Y[0]) / GRID))
        occ = np.zeros((ny, nx), bool)
        skip = ("floor_", "rug_", "step_", "thr_", "ground", "ceil_")
        for g in range(m.ngeom):
            b = m.geom_bodyid[g]
            if b in self.robot_bodies or m.geom_contype[g] == 0:
                continue
            name = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_GEOM, g) or ""
            if name.startswith(skip) or m.body_mocapid[b] >= 0 or m.body_jntnum[b] > 0:
                continue                       # floors, moving people, doors and objects are added when planning
            self._raster(occ, m, d, g)
        self.static_occ = occ
        from scipy.ndimage import distance_transform_edt
        self.static_dist = distance_transform_edt(~occ) * GRID

    def _raster(self, occ, m, d, g, pad=0.0):
        typ, size = m.geom_type[g], m.geom_size[g]
        p, R = d.geom_xpos[g], d.geom_xmat[g].reshape(3, 3)
        if typ == mujoco.mjtGeom.mjGEOM_BOX:
            half = np.abs(R) @ size
        elif typ in (mujoco.mjtGeom.mjGEOM_CYLINDER, mujoco.mjtGeom.mjGEOM_CAPSULE):
            half = np.array([size[0], size[0], size[1] + (size[0] if typ == mujoco.mjtGeom.mjGEOM_CAPSULE else 0)])
        elif typ == mujoco.mjtGeom.mjGEOM_SPHERE:
            half = np.full(3, size[0])
        else:
            return
        fz = self.floor_z(p[0], p[1]) if hasattr(self, "Hfloor") else 0.0
        if p[2] + half[2] < fz + 0.04 or p[2] - half[2] > fz + ROBOT_TOP:
            return
        x0, x1 = p[0] - half[0] - pad, p[0] + half[0] + pad
        y0, y1 = p[1] - half[1] - pad, p[1] + half[1] + pad
        i0, i1 = max(0, int((x0 - MAP_X[0]) / GRID)), min(occ.shape[1] - 1, int((x1 - MAP_X[0]) / GRID))
        j0, j1 = max(0, int((y0 - MAP_Y[0]) / GRID)), min(occ.shape[0] - 1, int((y1 - MAP_Y[0]) / GRID))
        if i1 < i0 or j1 < j0:
            return
        xs = MAP_X[0] + (np.arange(i0, i1 + 1) + 0.5) * GRID
        ys = MAP_Y[0] + (np.arange(j0, j1 + 1) + 0.5) * GRID
        X, Y = np.meshgrid(xs, ys)
        if typ == mujoco.mjtGeom.mjGEOM_BOX:                   # exact for boxes turned about z
            lx = (X - p[0]) * R[0, 0] + (Y - p[1]) * R[1, 0]
            ly = (X - p[0]) * R[0, 1] + (Y - p[1]) * R[1, 1]
            inside = (np.abs(lx) <= size[0] + pad + GRID / 2) & (np.abs(ly) <= size[1] + pad + GRID / 2)
        else:
            inside = (X - p[0]) ** 2 + (Y - p[1]) ** 2 <= (half[0] + pad + GRID / 2) ** 2
        occ[j0:j1 + 1, i0:i1 + 1] |= inside

    def occ_now(self, extra=()):
        """Static map plus doors where they stand now, objects not being carried, people and the vacuum."""
        m, d = self.e.m, self.e.d[0]
        occ = self.static_occ.copy()
        for g in range(m.ngeom):
            b = m.geom_bodyid[g]
            if b in self.robot_bodies or m.geom_contype[g] == 0:
                continue
            if m.body_jntnum[b] > 0 or m.body_mocapid[b] >= 0:
                if self.holding is not None and b == self.obj_body[self.holding]:
                    continue
                self._raster(occ, m, d, g)
        for (x, y, r) in extra:
            j, i = int((y - MAP_Y[0]) / GRID), int((x - MAP_X[0]) / GRID)
            k = int(r / GRID) + 1
            occ[max(0, j - k):j + k + 1, max(0, i - k):i + k + 1] = True
        return occ

    def occupied(self, x, y, r=0.0, static=False):
        dist = self.static_dist
        i, j = int((x - MAP_X[0]) / GRID), int((y - MAP_Y[0]) / GRID)
        if not (0 <= j < dist.shape[0] and 0 <= i < dist.shape[1]):
            return True
        return dist[j, i] <= r

    def room_of(self, x, y):
        for n, r in self.b.rooms.items():
            x0, x1, y0, y1 = r["box"]
            if x0 <= x <= x1 and y0 <= y <= y1:
                return n
        return "garden"

    # ---------------------------------------------------------------- rendering
    def _sync(self):
        d, dv = self.e.d[0], self.dv
        dv.qpos[:] = d.qpos
        dv.mocap_pos[:] = d.mocap_pos
        dv.mocap_quat[:] = d.mocap_quat
        mujoco.mj_forward(self.mv, dv)

    def _walls(self, cut):
        size, pos = self.wall_full
        if not cut:
            self.mv.geom_size[self.walls_v], self.mv.geom_pos[self.walls_v] = size, pos
            return
        top = Z0 + 1.05
        z0 = pos[:, 2] - size[:, 2]
        hz = np.clip((top - z0) / 2, 0.0005, size[:, 2])
        nsize, npos = size.copy(), pos.copy()
        nsize[:, 2], npos[:, 2] = hz, z0 + hz
        npos[z0 > top - 1e-3, 2] = -20.0          # lintels and the upper parts of windows: out of the way
        self.mv.geom_size[self.walls_v], self.mv.geom_pos[self.walls_v] = nsize, npos

    def ego(self):
        self._walls(False)
        self._sync()
        self.r_ego.update_scene(self.dv, camera=self.cam_id, scene_option=self.opt_ego)
        return self.r_ego.render()

    def chase_view(self, mode=None):
        """'follow': behind and above the robot, walls cut to 1 m; 'overview': the whole house from above."""
        mode = mode or self.cam_mode
        self._walls(True)
        self._sync()
        p = self.e.d[0].qpos[:3].copy()
        self.look = p if self.look is None else 0.85 * self.look + 0.15 * p
        _, _, yaw = self.robot_pose()
        if mode == "overview":
            self.chase.lookat[:] = (7.0, 4.6, 0.0)
            self.chase.distance, self.chase.elevation, self.chase.azimuth = 15.5, -62.0, 90.0
        else:
            self.chase.lookat[:] = self.look + [0, 0, -0.25]
            self.chase.distance, self.chase.elevation = 3.6, -38.0
            self.chase.azimuth = math.degrees(yaw) + 20.0
        self.r_chase.update_scene(self.dv, camera=self.chase, scene_option=self.opt_chase)
        img = self.r_chase.render()
        return img


def main():
    from PIL import Image
    h = House(chase_size=(960, 600))
    h.reset()
    for _ in range(25):
        h.step()
    out = HERE / "runs"
    out.mkdir(exist_ok=True)
    Image.fromarray(h.chase_view("overview")).save(out / "house_overview.png")
    shots = [("kitchen", 4.2, 4.0, -2.4), ("living", 10.0, 4.8, -0.9), ("hall", 7.0, 5.9, 0.0),
             ("bedroom", 4.0, 7.2, 2.4), ("bath", 6.7, 7.1, 1.57), ("study", 9.6, 7.2, 0.6)]
    for name, x, y, yaw in shots:
        h.place_robot(x, y, yaw)
        for _ in range(10):
            h.step()
        h.look = None
        Image.fromarray(h.chase_view("follow")).save(out / f"house_{name}.png")
        Image.fromarray(h.ego()).resize((288, 216)).save(out / f"house_{name}_ego.png")
    print("wrote", sorted(p.name for p in out.glob("house_*.png")))


if __name__ == "__main__":
    main()
