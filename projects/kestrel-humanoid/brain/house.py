"""KESTREL house: a whole home in the simulator, to test the robot as hard as a real home would.

    KESTREL_VARIANT=s1body python house.py              # renders an overview and room views to runs/house_*.png

The ground floor, 14 m x 10 m, on a raised floor slab 14 cm above the garden:

* open-plan kitchen (L-shaped counters, island, fridge, stools) with a hob, a kettle on its base, a sink with a
  sensor tap over a drip tray (it fills what is put under it, by the amount asked for), and a bin; dining area
  (table with a trivet at its edge, four chairs) and living room with a sunken lounge one 14 cm step down (sofa,
  coffee table, TV, armchair, rug);
* a hallway with a runner rug, console table, coat stand and shoes by the front door;
* bedroom (double bed, nightstands, wardrobe, rug), bathroom (bath, toilet, vanity, slippery tiles, a 1.5 cm door
  threshold), study (desk, desk chair, bookshelf, armchair);
* hinged doors (bedroom, bathroom, study, front door) that swing if pushed, windows, ceilings (head camera only);
* outside: a front porch with two 7 cm steps, a patio deck one step down from the living room, a lawn, a bench and
  the garden bin.

Up a straight flight of 12 stairs (10 cm risers, 30 cm treads; KESTREL_RISER / KESTREL_NRISERS make them steeper),
an upper wing: a landing, a messy kids' room (bed, toy box, clothes hamper, table, toys and clothes on the floor) and
a laundry room with a washing machine.

Things to handle, each with a handle on top for the S1's hook hand: kettle, pot, pasta, four mugs, lunchbox,
shopping bag, laundry basket, bucket, toolbox, watering can, a stick vacuum, a rubbish bag, toys (teddy, truck,
blocks, ball) and clothes (shirt, jeans, socks). Containers (sink, bins, toy box, hamper) keep what is dropped in.
Touch controls on the worktop edge switch the hob, kettle, tap and washer on and off. The house keeps the state the
chores are scored on: water in each container, kettle temperature, pasta cooking time on a hot hob, the washer's
cycle, and 80 patches of dust that only the vacuum head picks up.

People and pets: one standing in the study, one walking a loop through the kitchen, hall and dining area (they stop
for the robot), "you", a visitor who rings at the front door and follows the robot, a dog that wanders and gets in
the way, a spill that can appear on the floor, a card tray at the dining table for Uno, and a robot vacuum. A test
can also push the robot, turn the lights down, or leave clutter on the stairs.

Floors are real collision geometry; the walking policy's height scan reads a height map of exactly that floor (the
same kind of input it was trained on, with stairs), so steps, rugs and thresholds are seen and stepped over. Floor
friction differs by room (bathroom tiles 0.6, kitchen tiles 0.7, wood 0.8, carpet and rugs 1.0).

The house also provides what a robot that has mapped its home would know: an occupancy grid per floor for path
planning, named rooms, the flight of stairs between them, furniture with places to stand, chairs it can sit on, and
where each object belongs.
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("KESTREL_VARIANT", "s1body")
if "MUJOCO_GL" not in os.environ and sys.platform.startswith("linux") and not os.environ.get("DISPLAY"):
    os.environ["MUJOCO_GL"] = "osmesa"

import numpy as np            # noqa: E402
import mujoco                 # noqa: E402

import skills as SK           # noqa: E402
import env as E               # noqa: E402
import terrain as T           # noqa: E402

Z0 = 0.14                     # house floor (slab top) above the garden
WALL_H = 2.5
TEX_DIR = HERE / "data" / "house_tex"
TEX_VERSION = "v2"
GRID = 0.10                   # occupancy grid cell (m)
MAP_X, MAP_Y = (-11.2, 18.0), (-4.0, 13.0)
# 12 risers of 10 cm: the S1's walking policy climbs those every time held straight at 0.6 m/s (12 cm: 3 in 5;
# 15 cm: rarely); KESTREL_RISER / KESTREL_NRISERS build steeper stairs for the stress test
RISER, TREAD, N_RISERS = float(os.environ.get("KESTREL_RISER", 0.10)), 0.30, int(os.environ.get("KESTREL_NRISERS", 12))
UP = Z0 + RISER * N_RISERS     # the upper wing's floor
SX = -TREAD * (N_RISERS - 1)   # the top of the stairs (the wing's east wall)
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
        self.plants = []         # pot positions, for watering
        self.containers = {}     # open-topped things to drop into: box (inside), bottom and rim heights
        self.controls = {}       # switches, knobs and buttons the hook can press: position and the side to press from
        self.dirt = []           # names of the dust specks (visual), placed when a room needs vacuuming
        # spots to look out of a window from: (floor point, facing, what is out there)
        self.windows = [((12.3, 9.25), math.pi / 2, "the back garden"), ((13.1, 2.6), 0.0, "the side lawn"),
                        ((4.2, 9.3), math.pi / 2, "the back fence"), ((6.0, 0.55), -math.pi / 2, "the front garden")]

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
    open_yaw: how far it stands open (+ anticlockwise). It swings if pushed firmly; a brush (a load hanging from the hook)
    does not move it, as with a real door's hinges and closer."""
    w = width - 0.04
    g = [b.geom("box", (w / 2 + 0.02, 0, 1.03), (w / 2, 0.02, 1.02), "wood_light", name=f"{name}_leaf", dst=[]),
         b.geom("sphere", (w - 0.05, 0.05, 1.0), (0.03,), "steel", col=False, dst=[]),
         b.geom("sphere", (w - 0.05, -0.05, 1.0), (0.03,), "steel", col=False, dst=[])]
    lo, hi = sorted([-open_yaw, 0.15 * math.copysign(1, open_yaw)])
    j = f'<joint name="{name}_hinge" type="hinge" axis="0 0 1" damping="15" frictionloss="25" range="{lo:.3f} {hi:.3f}"/>'
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
    b.plants.append((x, y))
    b.geom("cylinder", (x, y, z0 + 0.18), (0.16, 0.18), "pot", name=b.nm("furn"))
    b.geom("sphere", (x, y, z0 + 0.36 + h * 0.35), (0.28 * h,), "plant", name=b.nm("vis"), col=False)    # leaves


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
    "kettle": ("cylinder", (0.08, 0.10), (0.95, 0.95, 0.95, 1), 0.6, 0.17, ["kettle", "white kettle", "jug"], "kitchen counter"),
    "lunchbox": ("box", (0.11, 0.07, 0.05), (0.95, 0.55, 0.10, 1), 0.5, 0.12, ["lunchbox", "lunch box", "orange box"], "kitchen island"),
    "bag": ("box", (0.12, 0.05, 0.13), (0.10, 0.10, 0.12, 1), 0.9, 0.20, ["bag", "shopping bag", "black bag"], "hall table"),
    "basket": ("box", (0.17, 0.12, 0.10), (0.90, 0.80, 0.30, 1), 0.7, 0.36, ["basket", "laundry basket", "yellow basket"], "bedroom"),
    "bucket": ("cylinder", (0.12, 0.12), (0.15, 0.40, 0.85, 1), 0.6, 0.30, ["bucket", "blue bucket"], "bathroom"),
    "toolbox": ("box", (0.18, 0.08, 0.07), (0.80, 0.12, 0.10, 1), 1.4, 0.14, ["toolbox", "tool box", "red toolbox", "tools"], "study desk"),
    "can": ("cylinder", (0.09, 0.12), (0.20, 0.60, 0.25, 1), 0.4, 0.31, ["watering can", "can", "green can"], "patio"),
    # kitchen
    "pot": ("cylinder", (0.12, 0.08), (0.72, 0.74, 0.78, 1), 0.7, 0.17, ["pot", "saucepan", "cooking pot"], "kitchen counter"),
    "pasta": ("box", (0.07, 0.035, 0.10), (0.95, 0.80, 0.20, 1), 0.5, 0.18, ["pasta", "spaghetti", "pasta box", "packet of pasta"], "kitchen counter"),
    "mug_red": ("cylinder", (0.045, 0.05), (0.85, 0.15, 0.12, 1), 0.3, 0.11, ["red mug", "mug", "cup", "red cup", "tea mug"], "kitchen counter"),
    "mug_blue": ("cylinder", (0.045, 0.05), (0.15, 0.35, 0.85, 1), 0.3, 0.11, ["blue mug", "blue cup"], "kitchen counter"),
    "mug_green": ("cylinder", (0.045, 0.05), (0.20, 0.65, 0.30, 1), 0.3, 0.11, ["green mug", "green cup"], "kitchen counter"),
    "mug_yellow": ("cylinder", (0.045, 0.05), (0.95, 0.80, 0.15, 1), 0.3, 0.11, ["yellow mug", "yellow cup"], "kitchen counter"),
    "hoover": ("box", (0.13, 0.06, 0.03), (0.55, 0.20, 0.60, 1), 1.4, 0.90, ["vacuum cleaner", "hoover", "stick vacuum", "vacuum"], "kitchen"),
    "trash": ("box", (0.13, 0.11, 0.17), (0.12, 0.12, 0.13, 1), 0.8, 0.29, ["rubbish", "trash", "bin bag", "garbage", "rubbish bag"], "garden bin"),
    # the kids' room mess: every toy and bundle of clothes has a carry loop (the S1's hook hand needs one)
    "teddy": ("box", (0.10, 0.07, 0.12), (0.62, 0.42, 0.25, 1), 0.4, 0.27, ["teddy", "teddy bear", "bear", "soft toy"], "toy box"),
    "truck": ("box", (0.15, 0.07, 0.06), (0.95, 0.75, 0.10, 1), 0.6, 0.33, ["truck", "toy truck", "lorry"], "toy box"),
    "blocks": ("cylinder", (0.09, 0.08), (0.30, 0.65, 0.95, 1), 0.7, 0.31, ["blocks", "building blocks", "bucket of blocks", "lego"], "toy box"),
    "ball": ("sphere", (0.10,), (0.95, 0.25, 0.45, 1), 0.3, 0.29, ["ball", "football", "pink ball"], "toy box"),
    "shirt": ("box", (0.15, 0.11, 0.03), (0.92, 0.92, 0.96, 1), 0.3, 0.37, ["shirt", "t-shirt", "top", "clothes"], "hamper"),
    "jeans": ("box", (0.17, 0.10, 0.035), (0.20, 0.30, 0.55, 1), 0.5, 0.36, ["jeans", "trousers", "pants"], "hamper"),
    "socks": ("box", (0.07, 0.05, 0.03), (0.55, 0.55, 0.58, 1), 0.15, 0.37, ["socks", "pair of socks"], "hamper"),
}
WATER_CAP = {"pot": 2.0, "kettle": 1.2, "can": 2.0, "mug_red": 0.3, "mug_blue": 0.3, "mug_green": 0.3, "mug_yellow": 0.3}
import world as W                     # noqa: E402  (general rules: heat, food, grime, tools)
OBJECTS.update(W.NEW_OBJECTS)
COOK_S, WASH_S = 40.0, 30.0            # simulated cooking and washing times (a real one is minutes; the test is not)
TOYS = ["teddy", "truck", "blocks", "ball"]
CLOTHES = ["shirt", "jeans", "socks"]
MUGS = ["mug_red", "mug_blue", "mug_green", "mug_yellow"]


def grab_object(b, name, x, y, z_surface):
    shape, size, rgba, mass, hz, words, home = OBJECTS[name]
    half_h = size[-1]
    g = [b.geom(shape, (0, 0, 0), size, rgba=rgba, name=f"{name}_main", fr=0.25 if name == "hoover" else 1.0, dst=[])]
    if name == "hoover":                     # a stick vacuum: the floor head, a shaft up to the handle
        g.append(b.geom("cylinder", (0, 0, (half_h + hz) / 2), (0.016, (hz - half_h) / 2), rgba=(0.2, 0.2, 0.22, 1), dst=[], mass=0.01))
        g.append(b.geom("cylinder", (0, 0, 0.18), (0.05, 0.1), rgba=(0.55, 0.20, 0.60, 1), dst=[], mass=0.01))
    span = max(size[0] * 0.55, 0.05)
    g.append(b.geom("box", (0, 0, hz), (span, 0.008, 0.008), rgba=(0.12, 0.12, 0.12, 1), name=f"{name}_handle", dst=[]))
    for s in (-1, 1):
        g.append(b.geom("box", (s * span, 0, (half_h + hz) / 2), (0.008, 0.008, (hz - half_h) / 2 + 0.008),
                        rgba=(0.12, 0.12, 0.12, 1), dst=[]))
    # a little damping: a load hanging from the hook stops swinging in a second instead of swinging on
    inert = "0.09 0.09 0.01" if name == "hoover" else "0.004 0.004 0.003"
    j = f'<joint name="{name}_free" type="free" damping="0.12"/><inertial pos="0 0 0" mass="{mass}" diaginertia="{inert}"/>'
    b.body(name, (x, y, z_surface + half_h + 0.002), 0.0, g, joint=j)
    b.objects[name] = dict(home=home, words=words, handle_z=hz, half_h=half_h, start=(x, y, z_surface))


# ----------------------------------------------------------------------- containers and controls
def container(b, name, x0, x1, y0, y1, z0, h, mat="white", t=0.02, words=(), floor=True):
    """An open-topped box (bin, toy box, hamper): a bottom and four walls; things dropped in stay in."""
    b.box(x0, x1, y0, y1, z0, z0 + 0.02, mat, name=b.nm("furn"))
    for (a0, a1, c0, c1) in ((x0, x0 + t, y0, y1), (x1 - t, x1, y0, y1), (x0, x1, y0, y0 + t), (x0, x1, y1 - t, y1)):
        b.box(a0, a1, c0, c1, z0, z0 + h, mat, name=b.nm("furn"))
    b.containers[name] = dict(box=(x0 + t, x1 - t, y0 + t, y1 - t), bottom=z0 + 0.02, rim=z0 + h, words=list(words) or [name])


def control(b, name, pos, face, rgba, words, kind="button"):
    """Something the hook presses: pos (world), face = the direction the robot faces to press it."""
    if kind == "knob":
        b.geom("cylinder", pos, (0.025, 0.012), rgba=rgba, name=f"ctl_{name}", col=False,
               euler=(math.pi / 2, 0, 0) if abs(math.sin(face)) > 0.5 else (0, math.pi / 2, 0))
    else:
        b.geom("box", pos, (0.025, 0.025, 0.015), rgba=rgba, name=f"ctl_{name}", col=False)
    b.controls[name] = dict(pos=tuple(pos), face=face, words=list(words))


# ----------------------------------------------------------------------- the upper wing
WING_O = SX + 2.1                # the wing sits west of the stairs: shift it with the stair length
MESS_SPOTS = [(-6.6 + WING_O, 6.4), (-5.4 + WING_O, 8.6), (-7.4 + WING_O, 7.0), (-5.0 + WING_O, 6.2),
              (-6.0 + WING_O, 9.2), (-7.0 + WING_O, 8.3), (-5.6 + WING_O, 7.4)]


def build_upper(b):
    """A split-level wing up the stairs (12 risers of 10 cm, 30 cm treads, 1.2 m wide, walls both sides): a landing, the
    kids' room (a mess of toys and clothes) and a laundry room (washing machine and dryer)."""
    o = WING_O
    for i in range(1, N_RISERS):
        b.floor_box(-TREAD * i, -TREAD * (i - 1), 5.3, 6.5, Z0 + RISER * i, "wood_floor", 0.9, kind="step", bottom=0.0)
    for yy in (5.24, 6.56):                                       # stairwell walls
        wall(b, "x", yy, SX, 0.0, 0.12, z0=0.0, h=UP + WALL_H)
    b.geom("box", (SX / 2, 5.36, Z0 + 0.95 + (UP - Z0) / 2), (-SX / 2 / math.cos(math.atan(RISER / TREAD)), 0.02, 0.02),
           "wood_dark", name=b.nm("vis"), col=False, euler=(0, -math.atan(RISER / TREAD), 0))      # handrail
    X0, X1, Y0, Y1 = -9.0 + o, SX, 0.6, 10.0
    XI = -4.3 + o                                                 # the landing's west wall
    b.floor_box(XI, X1, Y0, Y1, UP, "wood_floor", 0.8, bottom=0.0)                     # landing
    b.floor_box(X0, XI, 5.2, Y1, UP, "carpet", 1.0, bottom=0.0)                        # kids' room
    b.floor_box(X0, XI, Y0, 5.2, UP, "tile_floor", 0.7, bottom=0.0)                    # laundry
    b.floor_box(-7.6 + o, -5.6 + o, 6.6, 8.2, UP + 0.012, "rug_blue", 1.0, kind="rug", bottom=UP - 0.001)
    U = dict(z0=UP)
    wall(b, "y", X0, Y0, Y1, 0.2, [(2.0, 3.2, "window", 1.0), (7.0, 8.4, "window", 0.9)], **U)
    wall(b, "x", Y1, X0, X1, 0.2, [(XI + 0.7, XI + 1.5, "window", 0.9)], **U)
    wall(b, "x", Y0, X0, X1, 0.2, [(XI + 0.7, XI + 1.5, "window", 0.9)], **U)
    wall(b, "y", X1, Y0, Y1, 0.2, [(5.3, 6.5, "open")], **U)
    wall(b, "y", XI, Y0, Y1, 0.12, [(2.6, 3.6, "door"), (6.9, 7.9, "door")], **U)
    wall(b, "x", 5.2, X0, XI, 0.12, **U)
    b.box(X0, X1, Y0, Y1, UP + WALL_H, UP + WALL_H + 0.05, "white", name=b.nm("ceil"), col=False, group=3)
    # kids' room: bed, toy box, hamper, a little table, shelves
    b.box(-8.9 + o, -7.95 + o, 7.7, 9.9, UP, UP + 0.25, "wood_light", name=b.nm("furn"))
    b.box(-8.88 + o, -7.97 + o, 7.72, 9.88, UP + 0.25, UP + 0.45, "fabric_bed", name=b.nm("furn"))
    b.furniture["kids bed"] = dict(xy=(-8.43 + o, 8.8), size=(0.95, 2.2), top=UP + 0.45)
    container(b, "toy box", -6.2 + o, -5.4 + o, 9.35, 9.9, UP, 0.38, mat="wood_light", words=["toy box", "toybox", "toy chest"])
    container(b, "hamper", -4.95 + o, -4.45 + o, 5.32, 5.82, UP, 0.55, mat="fabric_grey",
              words=["hamper", "laundry hamper", "clothes hamper"])
    table(b, "kids table", -7.9 + o, 6.0, 0.7, 0.6, 0.5, z0=UP)
    b.box(-8.9 + o, -8.6 + o, 5.4, 6.8, UP, UP + 1.2, "wood_dark", name=b.nm("furn"))           # shelves
    # laundry: washing machine, dryer, folding counter
    b.box(-8.92 + o, -8.3 + o, 0.75, 1.4, UP, UP + 0.85, "white", name=b.nm("furn"))
    b.geom("cylinder", (-8.29 + o, 1.07, UP + 0.45), (0.2, 0.01), "glass", name=b.nm("vis"), col=False, euler=(0, math.pi / 2, 0))
    b.box(-8.92 + o, -8.3 + o, 1.5, 2.15, UP, UP + 0.85, "white", name=b.nm("furn"))
    b.furniture["washing machine"] = dict(xy=(-8.61 + o, 1.07), size=(0.62, 0.65), top=UP + 0.85)
    b.furniture["dryer"] = dict(xy=(-8.61 + o, 1.82), size=(0.62, 0.65), top=UP + 0.85)
    b.box(-8.92 + o, -8.35 + o, 2.6, 4.4, UP, UP + 0.86, "cabinet", name=b.nm("furn"))
    b.box(-8.92 + o, -8.33 + o, 2.6, 4.4, UP + 0.86, UP + 0.9, "worktop", name=b.nm("furn"))
    b.furniture["laundry counter"] = dict(xy=(-8.63 + o, 3.5), size=(0.59, 1.8), top=UP + 0.9)
    control(b, "washer", (-8.38 + o, 1.32, UP + 0.865), math.pi, (0.2, 0.8, 0.3, 1), ["washing machine", "washer", "start button"])
    b.flights = [dict(bottom=(0.55, 5.9), top=(SX - 0.45, 5.9), up_yaw=math.pi, box=(SX - 0.1, 0.25, 5.3, 6.5))]
    b.rooms_lights = [(-6.5 + o, 3.0, UP), (-6.5 + o, 7.5, UP), ((XI + X1) / 2, 5.9, UP)]


def build_extras(b):
    """The kitchen's working parts, bins, the card tray, hazards and extra visitors."""
    # kitchen: hob knob and kettle switch on the counter front, the sink's tap lever, the bin
    # touch controls on the worktop's front edge (the hook reaches 0.9-1.5 m standing; lower needs a crouch)
    control(b, "hob", (3.62, 0.74, Z0 + 0.915), -math.pi / 2, (0.85, 0.15, 0.1, 1), ["hob", "cooker", "stove", "hob switch"])
    control(b, "kettle", (2.2, 0.74, Z0 + 0.915), -math.pi / 2, (0.15, 0.35, 0.85, 1), ["kettle switch", "kettle"])
    control(b, "tap", (0.79, 2.5, Z0 + 0.915), math.pi, (0.7, 0.7, 0.75, 1), ["tap", "faucet"])
    b.zones = dict(hob=(2.9, 3.5, 0.40, 0.76), kettle_base=(2.42, 2.78, 0.44, 0.8), trivet=(6.55, 7.25, 2.08, 2.45))
    b.furniture["hob"] = dict(xy=(3.2, 0.58), size=(0.6, 0.36), top=Z0 + 0.9)
    b.furniture["kettle base"] = dict(xy=(2.6, 0.62), size=(0.36, 0.36), top=Z0 + 0.9)
    b.furniture["trivet"] = dict(xy=(6.9, 2.26), size=(0.6, 0.32), top=Z0 + 0.75)       # near the table's edge, in reach
    b.box(6.7, 7.1, 2.12, 2.4, Z0 + 0.75, Z0 + 0.752, "black", name=b.nm("vis"), col=False)        # the trivet
    b.box(2.9, 3.5, 0.40, 0.76, Z0 + 0.9, Z0 + 0.905, "black", name=b.nm("vis"), col=False)     # cooktop, near the front
    container(b, "kitchen bin", 4.33, 4.87, 0.24, 0.76, Z0, 0.45, mat="steel", words=["bin", "kitchen bin", "rubbish bin", "trash can"])
    container(b, "garden bin", 16.25, 16.95, 6.6, 7.3, 0.0, 0.75, mat="black", words=["garden bin", "wheelie bin", "outside bin", "big bin"])
    # dust to vacuum (visual specks, placed per test)
    for k in range(80):
        name = f"dirt_{k}"
        b.geom("cylinder", (20.0, 20.0, -5.0), (0.025, 0.002), rgba=(0.30, 0.22, 0.14, 1), name=name, col=False)
        b.dirt.append(name)
    # the card tray "you" pull up in front of the robot's chair for a game (mocap: placed when needed)
    tray = [b.geom("box", (0, 0, 0.705), (0.24, 0.18, 0.015), "wood_light", name="tray_top", dst=[]),
            b.geom("cylinder", (0, 0, 0.35), (0.02, 0.345), "wood_dark", dst=[]),
            b.geom("box", (-0.09, 0, 0.732), (0.035, 0.05, 0.012), rgba=(0.12, 0.12, 0.14, 1), name="uno_deck", col=False, dst=[]),
            b.geom("box", (0.08, 0, 0.724), (0.035, 0.05, 0.004), rgba=(0.85, 0.1, 0.1, 1), name="uno_pile", col=False, dst=[])]
    b.bodies.append(f'<body name="card_tray" mocap="true" pos="20 21 -5">{"".join(tray)}</body>')
    # hazards and visitors, parked out of sight until a test uses them
    b.bodies.append('<body name="spill" mocap="true" pos="20 22 -5"><geom name="spill_geom" type="box" size="0.45 0.3 0.0015" '
                    'rgba="0.55 0.75 0.95 0.55" friction="0.12 0.005 0.0001" priority="3"/></body>')
    dog = [b.geom("box", (0, 0, 0.32), (0.28, 0.1, 0.1), rgba=(0.55, 0.35, 0.18, 1), name="rex_body", dst=[]),
           b.geom("sphere", (0.32, 0, 0.45), (0.09,), rgba=(0.55, 0.35, 0.18, 1), name="rex_head", dst=[])]
    for lx in (-0.2, 0.2):
        for ly in (-0.07, 0.07):
            dog.append(b.geom("cylinder", (lx, ly, 0.11), (0.03, 0.11), rgba=(0.45, 0.28, 0.14, 1), dst=[]))
    b.bodies.append(f'<body name="rex" mocap="true" pos="20 23 -5">{"".join(dog)}</body>')
    person(b, "sam", 20.0, 24.0, -5.0, (0.75, 0.55, 0.20, 1), mocap=True)


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
    b.floor_box(5.4, 8.2, 6.6, 10, Z0, "bath_floor", 0.6)                      # bathroom: the most slippery floor
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
    wall(b, "y", 0.1, 0.2, 9.8, 0.2, [(2.0, 3.0, "window", 1.0), (5.3, 6.5, "door"), (7.6, 9.0, "window", 0.9)])
    wall(b, "y", 13.9, 0.2, 9.8, 0.2, [(1.6, 3.4, "window", 0.8), (5.45, 6.35, "door"), (7.6, 9.0, "window", 0.9)])
    wall(b, "x", 5.2, 0.2, 13.8, 0.12, [(2.2, 3.4, "open"), (6.0, 9.2, "open")])
    wall(b, "x", 6.6, 0.2, 13.8, 0.12, [(2.4, 3.3, "door"), (6.2, 7.1, "door"), (9.6, 10.5, "door")])
    wall(b, "y", 5.4, 6.66, 9.8, 0.12)
    wall(b, "y", 8.2, 6.66, 9.8, 0.12)
    wall(b, "y", 5.2, 3.6, 5.14, 0.12)
    # doors: they stand open, and swing if bumped
    # interior doors pushed right back against the wall (a door standing out at 90 degrees cut the bedroom in two)
    door(b, "door_bedroom", (2.4, 6.69), 0.0, math.radians(178), 0.9)
    door(b, "door_bath", (7.1, 6.69), math.pi, -math.radians(178), 0.9)
    door(b, "door_study", (9.6, 6.69), 0.0, math.radians(178), 0.9)
    door(b, "door_front", (13.8, 6.35), -math.pi / 2, -math.radians(88), 0.9)
    # ceilings: head camera only (group 3, no collision)
    for x0, x1, y0, y1 in [(0, 14, 0, 5.2), (0, 14, 5.2, 6.6), (0, 14, 6.6, 10)]:
        b.box(x0, x1, y0, y1, Z0 + WALL_H, Z0 + WALL_H + 0.05, "white", name=b.nm("ceil"), col=False, group=3)

    # ---- kitchen
    for y0, y1 in ((0.8, 2.2), (2.8, 4.0)):                                           # west counter run, the sink between
        b.box(0.2, 0.8, y0, y1, Z0, Z0 + 0.86, "cabinet", name=b.nm("furn"))
        b.box(0.2, 0.82, y0, y1, Z0 + 0.86, Z0 + 0.9, "worktop", name=b.nm("furn"))
    b.box(0.2, 0.8, 2.2, 2.8, Z0, Z0 + 0.68, "cabinet", name=b.nm("furn"))           # under the sink
    b.box(0.40, 0.76, 2.2, 2.8, Z0 + 0.68, Z0 + 0.70, "steel", name=b.nm("furn"))     # basin bottom (near the front:
    b.box(0.2, 0.40, 2.2, 2.8, Z0 + 0.68, Z0 + 0.9, "worktop", name=b.nm("furn"))     # in reach) and the worktop behind
    b.box(0.76, 0.82, 2.2, 2.8, Z0 + 0.68, Z0 + 0.9, "worktop", name=b.nm("furn"))    # basin front
    b.geom("cylinder", (0.32, 2.5, Z0 + 1.02), (0.015, 0.12), "steel", name=b.nm("vis"), col=False)    # tap: a sensor
    b.geom("cylinder", (0.45, 2.5, Z0 + 1.14), (0.012, 0.13), "steel", name=b.nm("vis"), col=False, euler=(0, math.pi / 2, 0))
    # the filling station: a drip tray on the worktop under a sensor tap (like a fridge's water dispenser): stand a
    # pot or kettle on it and it fills
    b.tap_stream = (0.62, 3.2)
    b.furniture["drip tray"] = dict(xy=(0.62, 3.2), size=(0.36, 0.5), top=Z0 + 0.9)
    b.box(0.45, 0.79, 2.97, 3.43, Z0 + 0.9, Z0 + 0.903, "steel", name=b.nm("vis"), col=False)
    b.geom("cylinder", (0.30, 3.2, Z0 + 1.15), (0.02, 0.25), "steel", name=b.nm("vis"), col=False)
    b.geom("cylinder", (0.47, 3.2, Z0 + 1.38), (0.015, 0.17), "steel", name=b.nm("vis"), col=False, euler=(0, math.pi / 2, 0))
    b.containers["sink"] = dict(box=(0.40, 0.76, 2.2, 2.8), bottom=Z0 + 0.70, rim=Z0 + 0.90, words=["sink", "kitchen sink"])
    b.furniture["sink"] = dict(xy=(0.58, 2.5), size=(0.36, 0.6), top=Z0 + 0.70)     # to stand a pot in, under the tap
    b.box(0.8, 3.8, 0.2, 0.8, Z0, Z0 + 0.86, "cabinet", name=b.nm("furn"))           # south counter run
    b.box(0.2, 3.82, 0.2, 0.82, Z0 + 0.86, Z0 + 0.9, "worktop", name=b.nm("furn"))
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
    b.geom("cylinder", (13.55, 4.92, Z0 + 0.8), (0.02, 0.8), "black", name=b.nm("furn"))   # floor lamp, in the corner
    b.geom("cylinder", (13.55, 4.92, Z0 + 1.6), (0.18, 0.12), "lamp", name=b.nm("vis"), col=False)
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

    build_upper(b)
    build_extras(b)
    W.build(b, Z0)

    # ---- objects to fetch (handles on top)
    grab_object(b, "kettle", 2.6, 0.62, Z0 + 0.9)
    grab_object(b, "lunchbox", 3.2, 2.42, Z0 + 0.92)
    grab_object(b, "bag", 11.7, 6.32, Z0 + 0.8)
    grab_object(b, "basket", 1.0, 7.2, Z0)
    grab_object(b, "bucket", 7.65, 7.15, Z0)
    grab_object(b, "toolbox", 11.2, 9.25, Z0 + 0.75)
    grab_object(b, "can", 12.1, -0.7, 0.07)
    grab_object(b, "pot", 1.5, 0.55, Z0 + 0.9)
    grab_object(b, "pasta", 0.66, 3.82, Z0 + 0.9)
    for k, mug in enumerate(MUGS):
        grab_object(b, mug, 0.68, 1.0 + 0.3 * k, Z0 + 0.9)
    grab_object(b, "hoover", 4.85, 4.7, Z0)
    grab_object(b, "trash", 4.6, 1.15, Z0)            # tied up, next to the kitchen bin, ready to go out
    for name, (x, y) in zip(TOYS + CLOTHES, MESS_SPOTS):
        grab_object(b, name, x, y, UP)
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
        "stairs": dict(box=(SX, 0.0, 5.26, 6.54), centre=(SX / 2, 5.9), words=["stairs", "staircase"]),
        "landing": dict(box=(-4.3 + WING_O, SX, 0.66, 9.94), centre=((-4.3 + WING_O + SX) / 2, 5.9),
                        words=["landing", "upstairs", "upstairs hall", "upstairs landing"]),
        "kids room": dict(box=(-8.94 + WING_O, -4.3 + WING_O, 5.26, 9.94), centre=(-6.0 + WING_O, 7.2),
                          words=["kids room", "kids' room", "children's room", "kid's room", "playroom", "messy room", "messy bedroom"]),
        "laundry": dict(box=(-8.94 + WING_O, -4.3 + WING_O, 0.66, 5.14), centre=(-6.2 + WING_O, 3.4),
                        words=["laundry", "laundry room", "utility room"]),
        "garden": dict(box=(14.0, 18.0, -3.0, 12.0), centre=(16.2, 4.0), words=["garden", "yard", "lawn"]),
    }
    return b


# ======================================================================= the simulated house with the robot in it
class House(SK.World):
    """The house with the robot (and people, a vacuum, objects). Same stepping and skills as skills.World."""

    def __init__(self, seed=0, policy=None, chase_size=(640, 400), walker=True, vacuum=True):
        import model as KM
        policy = policy or KM.WALK_POLICY            # each body walks with the policy trained for it
        make_textures()
        self.b = build()
        world_xml = "\n".join(self.b.world + self.b.bodies) + (
            '\n<light name="sun" directional="true" pos="7 5 30" dir="-0.35 -0.25 -1" diffuse="0.55 0.55 0.5" '
            'specular="0.1 0.1 0.1" castshadow="false"/>'
            + "".join(f'<light pos="{x} {y} {Z0 + 2.3}" dir="0 0 -1" diffuse="0.28 0.27 0.24" attenuation="1 0.08 0" '
                      f'cutoff="85" castshadow="false"/>' for x, y in [(3, 2.6), (11, 2.6), (7, 8.2)])
            + "".join(f'<light pos="{x} {y} {z + 2.3}" dir="0 0 -1" diffuse="0.28 0.27 0.24" attenuation="1 0.08 0" '
                      f'cutoff="85" castshadow="false"/>' for x, y, z in self.b.rooms_lights))
        # the hook's hold on a handle: a weld whose turning part is soft (torquescale), so a load can still swing a
        # little but the swing is damped. A pure ball joint (connect) let a 0.9 kg kettle, lifted off a worktop,
        # swing harder and harder against the counter until the simulation blew up. KESTREL_HOOK=connect: the old way
        if os.environ.get("KESTREL_HOOK", "weld") == "connect":
            eqs = "".join(f'<connect name="hook_{n}" body1="r_hand" body2="{n}" anchor="{f3(SK.HOOK)}" active="false"/>'
                          for n in OBJECTS)
        else:
            eqs = "".join(f'<weld name="hook_{n}" body1="r_hand" body2="{n}" torquescale="0.05" active="false"/>'
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
        self.mocap = {n: m.body_mocapid[nm(m, mujoco.mjtObj.mjOBJ_BODY, n)]
                      for n in ("jordan", "you", "vacuum", "sam", "rex", "spill", "card_tray")}
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
        self._init_extras()
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
        self.reset_extras()
        mujoco.mj_forward(self.e.m, self.e.d[0])

    # ---------------------------------------------------------------- the moving things
    def step(self, legs=None, arms=None, cmd=(0.0, 0.0, 0.0)):
        self._move_people()
        d = self.e.d[0]
        d.xfrc_applied[self.pelvis, :3] = self.push_f if self.t < self.push_until else 0.0
        for n, w in self.water_w.items():                  # the water's weight (see _set_mass)
            d.xfrc_applied[self.obj_body[n], 2] = -w
        r = super().step(legs=legs, arms=arms, cmd=cmd)
        self._tick_extras()
        return r

    # ---------------------------------------------------------------- the house's working parts
    def _init_extras(self):
        m, mv = self.e.m, self.mv
        gid = lambda mm, n: mujoco.mj_name2id(mm, mujoco.mjtObj.mjOBJ_GEOM, n)        # noqa: E731
        self.dirt_gv = np.array([gid(mv, n) for n in self.b.dirt])
        self.dirt_xy = np.full((len(self.b.dirt), 2), 1e6)
        self.dirt_on = np.zeros(len(self.b.dirt), bool)
        self.pile_gv = gid(mv, "uno_pile")
        self.base_mass = {n: float(m.body_mass[self.obj_body[n]]) for n in OBJECTS}
        self.base_inertia = {n: m.body_inertia[self.obj_body[n]].copy() for n in OBJECTS}
        self.world = None
        self.reset_extras()
        self.world = W.World(self, Z0)

    def reset_extras(self):
        """Appliances off, containers empty, no dust, hazards and visitors parked."""
        m = self.e.m
        self.st = dict(tap=False, hob=False, kettle=False, washer=False)
        self.washer_t, self.washed = 0.0, False
        self.water = {n: 0.0 for n in WATER_CAP}
        self.fill_to = {}                    # the filling station stops at the amount asked for
        self.temp = {n: 20.0 for n in WATER_CAP}
        self.pot_pasta, self.cook_t, self.burn_t, self.hob_empty_t = False, 0.0, 0.0, 0.0
        self.tea = {k: False for k in MUGS}
        self.watered = set()
        self.events = []
        self.push_f, self.push_until = np.zeros(3), -1.0
        self.dog_on, self.dog_goal = False, None
        self.visitor, self.crumbs, self.crumb_i = None, [], 0
        self.dark = False
        self.hazards = []
        self.water_w = {}
        if getattr(self, "world", None) is not None:
            self.world.reset()
        for n in OBJECTS:
            m.body_mass[self.obj_body[n]] = self.base_mass[n]
            m.body_inertia[self.obj_body[n]] = self.base_inertia[n]
            self.e.d[0].xfrc_applied[self.obj_body[n]] = 0.0
        self.set_dirt([])
        d = self.e.d[0]
        for k, n in enumerate(("sam", "rex", "spill", "card_tray")):
            d.mocap_pos[self.mocap[n]] = (20.0 + k, 25.0, -5.0)

    def event(self, text):
        self.events.append((round(self.t, 1), text))

    def in_box(self, p, box, margin=0.0):
        x0, x1, y0, y1 = box
        return x0 - margin <= p[0] <= x1 + margin and y0 - margin <= p[1] <= y1 + margin

    def in_container(self, obj, cname):
        c = self.b.containers[cname]
        p = self.obj_pos(obj)
        return self.in_box(p, c["box"], 0.02) and c["bottom"] - 0.02 <= p[2] - OBJECTS[obj][1][-1] <= c["rim"]

    def on_zone(self, obj, zone, z_top=Z0 + 0.9):
        p = self.obj_pos(obj)
        return self.in_box(p, self.b.zones[zone]) and abs(p[2] - OBJECTS[obj][1][-1] - z_top) < 0.04 and obj != self.holding

    def press(self, name):
        """A control was pressed (the robot's hook touched it): toggle it."""
        if name == "washer":
            self.st["washer"], self.washer_t = True, 0.0
            self.event("washing machine started")
            return
        self.st[name] = not self.st[name]
        self.event(f"{name} {'on' if self.st[name] else 'off'}")

    def pour(self, src, dst):
        """src held over dst long enough: food and water move by the general rules (world.py) - pasta into the pot,
        hot water onto a mug's tea bag (tea), water onto a plant, a steak into a pan or onto a plate."""
        if isinstance(dst, int):                             # a plant
            ok = self.water.get(src, 0.0) >= 0.15
            if ok:
                self.water[src] -= 0.15
                self._set_mass(src)
                self.watered.add(dst)
            self.event(f"watered plant {dst}" + ("" if ok else f" (the {src} has no water in it)"))
            return ok
        what = self.world.pour(src, dst)
        self.pot_pasta = self.world.food_in["pasta"] == "pot"
        if dst in MUGS and self.water[dst] >= 0.15 and self.temp[dst] >= 85.0 and not self.tea[dst]:
            self.tea[dst] = True
            what = (what or "") + "; tea made"
        elif dst in MUGS and src == "kettle" and self.temp["kettle"] < 85.0:
            what = (what or "") + " (but the kettle was not boiled)"
        if what:
            self.event(f"poured from the {src}: {what.lstrip('; ')}")
        return what is not None

    def _set_mass(self, n):
        """Water's weight, as a downward force on the container (applied every step in step()). Changing body_mass at
        run time left MuJoCo's precomputed constants (inverse weights, which scale how stiff contacts and the hook's
        hold feel) for the empty container, and a full kettle on the hook shook itself apart; recomputing them
        (mj_setConst) resets other parts of the model. So the arm, the balance and 'too heavy' all feel the water's
        full weight; only its inertia is left out."""
        self.water_w[n] = 9.81 * self.water.get(n, 0.0)

    def objects_half_h(self, n):
        return OBJECTS[n][1][-1]

    def obj_vel(self, n):
        d = self.e.d[0]
        a = self.e.m.jnt_dofadr[mujoco.mj_name2id(self.e.m, mujoco.mjtObj.mjOBJ_JOINT, f"{n}_free")]
        return d.qvel[a:a + 3]

    def water_cap(self, n):
        return WATER_CAP.get(n, 0.0)

    def mass_of(self, n):
        return self.base_mass[n] + self.water.get(n, 0.0)

    def set_dirt(self, points):
        self.dirt_on[:] = False
        self.dirt_xy[:] = 1e6
        for k, g in enumerate(self.dirt_gv):
            if k < len(points):
                x, y = points[k]
                self.dirt_xy[k] = (x, y)
                self.dirt_on[k] = True
                self.mv.geom_pos[g] = (x, y, self.floor_z(x, y) + 0.004)
            else:
                self.mv.geom_pos[g] = (20.0, 20.0, -5.0)

    def dirt_points(self, room, n, rng):
        """n dust specks on the open floor of a room (not under furniture)."""
        x0, x1, y0, y1 = self.b.rooms[room]["box"]
        out = []
        for _ in range(5000):
            x, y = rng.uniform(x0 + 0.2, x1 - 0.2), rng.uniform(y0 + 0.2, y1 - 0.2)
            lvl = self.floor_z(*self.b.rooms[room]["centre"])
            if not self.occupied(x, y, 0.12, static=True) and abs(self.floor_z(x, y) - lvl) < 0.03:
                out.append((x, y))
                if len(out) == n:
                    break
        return out

    def place_tray(self, x, y, yaw=0.0):
        d = self.e.d[0]
        d.mocap_pos[self.mocap["card_tray"]] = (x, y, self.floor_z(x, y))
        d.mocap_quat[self.mocap["card_tray"]] = (math.cos(yaw / 2), 0, 0, math.sin(yaw / 2))

    def set_pile(self, rgb):
        self.mv.geom_rgba[self.pile_gv] = (*rgb, 1.0)

    def put_spill(self, x, y):
        self.e.d[0].mocap_pos[self.mocap["spill"]] = (x, y, self.floor_z(x, y) + 0.0015)
        self.hazards = [(x, y, 0.55)]                    # the robot sees the wet floor and plans round it

    def push(self, f, secs=0.25):
        self.push_f, self.push_until = np.asarray(f, float), self.t + secs

    def movers(self):
        """Other moving things the safety sensor must treat like people (the dog)."""
        return {"rex": tuple(self.e.d[0].mocap_pos[self.mocap["rex"]][:2])} if self.dog_on else {}

    def _tick_extras(self):
        dt = E.DT
        # water: the sensor tap runs into whatever is held (or stands) under its spout; the tap control forces it on
        sx, sy = self.b.tap_stream
        for n, cap in WATER_CAP.items():
            p = self.obj_pos(n)
            under = (math.hypot(p[0] - sx, p[1] - sy) < 0.2 and abs(p[2] - OBJECTS[n][1][-1] - (Z0 + 0.9)) < 0.03
                     and n != self.holding)                  # standing on the drip tray
            want = min(cap, self.fill_to.get(n, cap)) if under else cap
            if (under or (self.st["tap"] and self.in_container(n, "sink"))) and self.water[n] < want:
                self.water[n] = min(want, self.water[n] + 0.15 * dt)
                self._set_mass(n)
        # kettle on its base
        if self.st["kettle"]:
            if self.on_zone("kettle", "kettle_base"):
                if self.water["kettle"] > 0.2:
                    self.temp["kettle"] = min(100.0, self.temp["kettle"] + 4.0 * dt)
                    if self.temp["kettle"] >= 100.0:
                        self.st["kettle"] = False
                        self.event("kettle boiled (switched itself off)")
                else:
                    self.st["kettle"] = False
                    self.event("kettle switched off: it was empty")
        # the hob and the pot
        pot_on = self.on_zone("pot", "hob")
        if self.st["hob"]:
            if pot_on:
                self.hob_empty_t = 0.0
                if self.water["pot"] > 0.4:
                    self.temp["pot"] = min(100.0, self.temp["pot"] + 2.5 * dt)
                else:
                    self.burn_t += dt
                    if abs(self.burn_t - 8.0) < dt / 2:
                        self.event("the empty pot is burning")
            elif not any(self.on_zone(n, "hob") for n in W.HEATS if n != "pot"):
                self.hob_empty_t += dt
                if abs(self.hob_empty_t - 30.0) < dt / 2:
                    self.event("hob left on with nothing on it")
        for n in WATER_CAP:
            if not ((n == "pot" and pot_on and self.st["hob"]) or (n == "kettle" and self.st["kettle"])):
                self.temp[n] = max(20.0, self.temp[n] - 0.15 * dt)
        if self.pot_pasta and pot_on and self.st["hob"] and self.temp["pot"] >= 95.0:
            self.cook_t += dt
            if abs(self.cook_t - COOK_S) < dt / 2:
                self.event("pasta cooked")
        # washing machine
        if self.st["washer"]:
            self.washer_t += dt
            if self.washer_t >= WASH_S:
                self.st["washer"] = False
                self.washed = True
                self.event("washing finished")
        # vacuum: the head on the floor picks up the dust under it
        if self.holding == "hoover" and self.dirt_on.any():
            p = self.obj_pos("hoover")
            if p[2] - self.floor_z(p[0], p[1]) < 0.09:
                hit = self.dirt_on & (((self.dirt_xy - p[:2]) ** 2).sum(1) < 0.17 ** 2)
                if hit.any():
                    self.dirt_on[hit] = False
                    for g in self.dirt_gv[hit]:
                        self.mv.geom_pos[g] = (20.0, 20.0, -5.0)
        self._move_dog()
        self._move_visitor()
        if self.world is not None:
            self.world.tick(dt)

    def _move_dog(self):
        if not self.dog_on:
            return
        d = self.e.d[0]
        rx, ry = d.qpos[0], d.qpos[1]
        x, y = d.mocap_pos[self.mocap["rex"]][:2]
        rng = self.vac_rng
        if self.dog_goal is None or math.dist((x, y), self.dog_goal) < 0.2:
            for _ in range(200):
                g = (rng.uniform(0.8, 13.2), rng.uniform(0.8, 9.2))
                if not self.occupied(*g, 0.3, static=True):
                    self.dog_goal = g
                    break
        gx, gy = self.dog_goal
        dx, dy = gx - x, gy - y
        dist = max(math.hypot(dx, dy), 1e-6)
        step = min(dist, 1.2 * E.DT)
        nx, ny = x + dx / dist * step, y + dy / dist * step
        if math.hypot(nx - rx, ny - ry) < 0.9 or self.occupied(nx, ny, 0.18, static=True):
            self.dog_goal = None                          # a dog steers clear of the robot (and of the walls)
            return
        d.mocap_pos[self.mocap["rex"]] = (nx, ny, self.floor_z(nx, ny))
        d.mocap_quat[self.mocap["rex"]] = (math.cos(math.atan2(dy, dx) / 2), 0, 0, math.sin(math.atan2(dy, dx) / 2))

    def start_visitor(self):
        """Sam walks up the garden path to the front door and waits there (the doorbell)."""
        self.visitor = "arriving"
        self.e.d[0].mocap_pos[self.mocap["sam"]] = (17.6, 9.0, 0.0)
        self.event("doorbell: someone is at the front door")

    def follow_me(self):
        """The visitor follows the robot from where they stand (along the robot's path from now on)."""
        x, y = self.e.d[0].mocap_pos[self.mocap["sam"]][:2]
        self.visitor, self.crumbs, self.crumb_i = "following", [(x, y)], 0

    def _move_visitor(self):
        if self.visitor is None:
            return
        d = self.e.d[0]
        x, y = d.mocap_pos[self.mocap["sam"]][:2]
        rx, ry = d.qpos[0], d.qpos[1]
        if not self.crumbs or math.dist(self.crumbs[-1], (rx, ry)) > 0.15:
            self.crumbs.append((rx, ry))
        if self.visitor == "arriving":
            target = (15.3, 5.9)
        elif self.visitor == "following":            # walk the robot's own path, staying 1.6 m behind it
            if math.hypot(rx - x, ry - y) < 1.6:
                return
            i = self.crumb_i
            while i < len(self.crumbs) - 1 and math.dist(self.crumbs[i], (x, y)) < 0.25:
                i += 1
            self.crumb_i = i
            target = self.crumbs[i]
        else:
            return
        dx, dy = target[0] - x, target[1] - y
        dist = math.hypot(dx, dy)
        if dist < 0.05:
            return
        step = min(dist, 0.9 * E.DT)
        nx, ny = x + dx / dist * step, y + dy / dist * step
        d.mocap_pos[self.mocap["sam"]] = (nx, ny, self.floor_z(nx, ny))

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
        from scipy.ndimage import distance_transform_edt, binary_dilation
        self.static_dist = distance_transform_edt(~occ) * GRID
        # step edges (floor height jumps over 4 cm): planning prefers to cross them straight on, not along them
        xs = MAP_X[0] + (np.arange(nx) + 0.5) * GRID
        ys = MAP_Y[0] + (np.arange(ny) + 0.5) * GRID
        X, Y = np.meshgrid(xs, ys)
        hz = self.e.hs(X.ravel(), Y.ravel()).reshape(ny, nx)
        edge = np.zeros_like(occ)
        edge[:, 1:] |= np.abs(np.diff(hz, axis=1)) > 0.04
        edge[1:, :] |= np.abs(np.diff(hz, axis=0)) > 0.04
        self.step_edge = binary_dilation(edge, iterations=2)

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
        for (x, y, r) in list(extra) + list(getattr(self, "hazards", [])):
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
        z0 = pos[:, 2] - size[:, 2]
        lvl = np.where(pos[:, 0] < SX + 0.05, UP, np.where(pos[:, 0] < 0.0, (Z0 + UP) / 2, Z0))
        top = lvl + 1.05
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
            self.chase.lookat[:] = (3.6, 4.8, 0.4)
            self.chase.distance, self.chase.elevation, self.chase.azimuth = 22.0, -60.0, 90.0
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
    o = WING_O
    shots = [("kitchen", 4.2, 4.0, -2.4), ("living", 10.0, 4.8, -0.9), ("hall", 7.0, 5.9, 0.0),
             ("bedroom", 4.0, 7.2, 2.4), ("bath", 6.7, 7.1, 1.57), ("study", 10.4, 7.4, 0.6),
             ("stairs", 1.4, 5.9, math.pi), ("landing", -3.6 + o / 2, 4.6, 1.57), ("kids_room", -4.9 + o, 6.3, 2.5),
             ("laundry", -5.0 + o, 3.6, -2.6), ("sink", 1.5, 3.2, math.pi)]
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
