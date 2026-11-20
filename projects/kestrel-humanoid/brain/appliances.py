"""The house's appliances as they look in a real home, and their lights and moving parts:

* the hob: black ceramic glass with its cooking zones; the rings glow red-orange while it is on;
* its touch panel: black glass, a power symbol, a red light when on; the oven under it: a steel frame, a dark glass
  door, a handle and its control strip;
* the sink: a steel basin with a drain and a chrome gooseneck tap; a chrome push button on the front of the sink with a
  blue ring that lights while the tap runs; the filling station's gooseneck over the drip tray; while water runs, you
  see it run;
* the kettle base: a base plate with a light ring that glows blue while the kettle boils, its cable and a wall socket;
* the washing machine and dryer: chrome-ringed portholes, a drum that turns while washing, a panel with a dial, a
  display and a start button that lights;
* the television: a picture on its screen.

Only the visual model changes (house.SKIN): the buttons sit exactly where the robot presses them, and the physics is
the same. Appliances.update() follows the house's state each step.
"""
from __future__ import annotations

import math

import numpy as np

import objects3d as O3

GEN = O3.GEN / "appliances"


def _mesh(name, mesh):
    from real_assets import _write_obj
    GEN.mkdir(parents=True, exist_ok=True)
    p = GEN / f"{name}.obj"
    _write_obj(p, mesh.V, mesh.N, mesh.UV, mesh.F)
    return p.as_posix()


def ring(cx, cy, z, r, t=0.003, n=48):
    a = np.linspace(0, 2 * math.pi, n + 1)
    return O3.tube(np.stack([cx + r * np.cos(a), cy + r * np.sin(a), np.full_like(a, z)], 1), t, 8, caps=False)


def _tv_picture(n):
    """A frame of a nature film: mountains, a lake, an evening sky."""
    y, x = np.mgrid[0:n, 0:n] / n
    sky = np.stack([255 * (0.95 - 0.35 * y), 255 * (0.62 - 0.2 * y), 255 * (0.45 + 0.4 * y)], -1)
    img = sky.copy()
    ridge = 0.48 + 0.08 * np.sin(x * 9) + 0.05 * np.sin(x * 23 + 1)
    img[y > ridge] = np.array([46, 62, 70]) * (1 - 0.3 * (y[y > ridge] - 0.5))[:, None]
    lake = y > 0.7
    img[lake] = np.stack([255 * (0.6 - 0.2 * y[lake]), 255 * (0.45 - 0.1 * y[lake]), 255 * (0.55 + 0.2 * y[lake])], -1)
    sun = (x - 0.68) ** 2 + (y - 0.36) ** 2 < 0.004
    img[sun] = (255, 236, 190)
    return img


def build(b, Z0, UP, o):
    """Add the appliances' looks to the house being built (house.build_extras calls this)."""
    from house import SKIN, PHYS, SKINS, f3
    if not SKINS:
        return
    assets, geoms = b.skin_assets, []

    def mat(name, rgba, rough=0.4, metal=0.0, emission=0.0, tex=None):
        layer = ""
        if tex:
            assets.append(f'<texture name="ap_{name}_t" type="2d" file="{tex}"/>')
            layer = f'<layer texture="ap_{name}_t" role="rgb"/>'
        pbr = f' roughness="{rough}" metallic="{metal}"' if rgba[3] >= 1 and not tex else ""
        assets.append(f'<material name="ap_{name}" rgba="{f3(rgba)}" emission="{emission}" specular="0.5" shininess="0.7"{pbr}>'
                      f'{layer}</material>')
        return f"ap_{name}"

    def put(name, mesh, material, nm=None):
        assets.append(f'<mesh name="apm_{name}" file="{_mesh(name, mesh)}" inertia="shell"/>')
        geoms.append(f'<geom {"name=" + chr(34) + nm + chr(34) + " " if nm else ""}type="mesh" mesh="apm_{name}" '
                     f'material="{material}" contype="0" conaffinity="0" group="2" mass="0"/>')

    def prim(kind, pos, size, material, nm=None, euler=None):
        e = f' euler="{f3(euler)}"' if euler is not None else ""
        geoms.append(f'<geom {"name=" + chr(34) + nm + chr(34) + " " if nm else ""}type="{kind}" pos="{f3(pos)}" '
                     f'size="{f3(size)}" material="{material}"{e} contype="0" conaffinity="0" group="2" mass="0"/>')

    def hide_at(pos=None, name=None):                 # the plain look of a part, out of the visual model
        key = f'pos="{f3(pos)}"' if pos is not None else f'name="{name}"'
        for i, s in enumerate(b.world):
            if s.startswith("<geom") and key in s:
                b.world[i] = PHYS[0] + s + PHYS[1]

    glass = mat("glass_black", (0.02, 0.02, 0.025, 1), 0.06, 0.0)
    chrome = mat("chrome", (0.86, 0.87, 0.9, 1), 0.08, 1.0)
    steel = mat("steel", (0.72, 0.73, 0.75, 1), 0.3, 1.0)
    white = mat("white", (0.95, 0.95, 0.95, 1), 0.3)
    grey = mat("grey", (0.55, 0.56, 0.58, 1), 0.4)
    dark = mat("dark", (0.08, 0.08, 0.09, 1), 0.5)
    mat("hob_ring", (0.30, 0.30, 0.32, 1), 0.3)
    mat("led_off", (0.15, 0.15, 0.16, 1), 0.3)

    # ---- the hob: glass, zones, touch panel
    for p in ((3.2, 0.5, Z0 + 0.9025), (3.2, 0.58, Z0 + 0.9025)):
        hide_at(p)
    prim("box", (3.2, 0.58, Z0 + 0.903), (0.3, 0.18, 0.003), glass)
    zones = O3.Mesh()
    for (cx, cy, r) in ((3.2, 0.58, 0.095), (3.2, 0.58, 0.06), (2.99, 0.47, 0.045), (3.41, 0.47, 0.045), (2.99, 0.69, 0.04),
                        (3.41, 0.69, 0.04)):
        zones = zones + ring(cx, cy, Z0 + 0.9062, r, 0.0025)
    put("hob_zones", zones, "ap_hob_ring", nm="ap_hob_zones")
    hide_at(name="ctl_hob")
    prim("box", (3.62, 0.74, Z0 + 0.9025), (0.05, 0.03, 0.0025), glass)
    put("hob_power", ring(3.605, 0.74, Z0 + 0.9054, 0.011, 0.0018, 24) + O3.tube([(3.605, 0.74, Z0 + 0.9054),
        (3.605, 0.752, Z0 + 0.9054)], 0.0018, 6), white)
    prim("cylinder", (3.645, 0.74, Z0 + 0.9054), (0.004, 0.0006), "ap_led_off", nm="led_hob")
    # ---- the oven under it
    prim("box", (3.2, 0.807, Z0 + 0.43), (0.28, 0.004, 0.35), steel)
    prim("box", (3.2, 0.812, Z0 + 0.38), (0.22, 0.002, 0.19), glass)
    prim("box", (3.2, 0.812, Z0 + 0.74), (0.26, 0.002, 0.03), dark)
    put("oven_handle", O3.tube([(2.98, 0.82, Z0 + 0.64), (2.99, 0.845, Z0 + 0.64), (3.41, 0.845, Z0 + 0.64), (3.42, 0.82, Z0 + 0.64)],
                               0.009), chrome)
    for k, x in enumerate((3.0, 3.07, 3.33, 3.4)):
        prim("cylinder", (x, 0.817, Z0 + 0.74), (0.013, 0.006), chrome, euler=(math.pi / 2, 0, 0))
    prim("box", (3.2, 0.8145, Z0 + 0.74), (0.035, 0.0005, 0.012), mat("display", (0.1, 0.55, 0.9, 1), 0.2, 0.0, 0.6))

    # ---- the sink: basin, drain, gooseneck tap, push button; the filling station's tap
    for p in ((0.32, 2.5, Z0 + 1.02), (0.45, 2.5, Z0 + 1.14), (0.30, 3.2, Z0 + 1.15), (0.47, 3.2, Z0 + 1.38)):
        hide_at(p)
    basin = O3.Mesh()
    for (cx, cy, hx, hy) in ((0.58, 2.203, 0.18, 0.003), (0.58, 2.797, 0.18, 0.003), (0.403, 2.5, 0.003, 0.3), (0.757, 2.5, 0.003, 0.3)):
        basin = basin + O3.box(hx, hy, 0.1, c=(cx, cy, Z0 + 0.8))
    put("basin", basin, steel)
    prim("box", (0.58, 2.5, Z0 + 0.7015), (0.178, 0.298, 0.0015), steel)
    prim("cylinder", (0.6, 2.5, Z0 + 0.703), (0.03, 0.0012), dark)
    put("drain_ring", ring(0.6, 2.5, Z0 + 0.7035, 0.03, 0.003, 24), chrome)

    def gooseneck(x0, y0, x1, h_top, h_spout, name):
        a = np.linspace(0, math.pi, 20)
        mid = (x0 + x1) / 2
        rad = (x1 - x0) / 2
        arcp = np.stack([mid - rad * np.cos(a), np.full_like(a, y0), h_top + 0.06 * np.sin(a)], 1)
        path = np.vstack([[(x0, y0, Z0 + 0.9)], [(x0, y0, h_top - 0.02)], arcp, [(x1, y0, h_spout)]])
        put(name, O3.tube(path, 0.013) + O3.cyl(0.028, Z0 + 0.9, Z0 + 0.93, 24).moved(t=(x0, y0, 0)), chrome)
        lever = O3.tube([(x0 - 0.01, y0, Z0 + 0.98), (x0 - 0.08, y0, Z0 + 1.0)], 0.007)
        put(name + "_lever", lever, chrome)
    gooseneck(0.32, 2.5, 0.56, Z0 + 1.16, Z0 + 1.1, "tap_neck")
    gooseneck(0.30, 3.2, 0.62, Z0 + 1.36, Z0 + 1.33, "station_neck")
    hide_at(name="ctl_tap")
    prim("cylinder", (0.79, 2.5, Z0 + 0.906), (0.017, 0.006), chrome)
    put("tap_led", ring(0.79, 2.5, Z0 + 0.9125, 0.012, 0.002, 24), "ap_led_off", nm="led_tap")
    water = mat("water", (0.75, 0.86, 0.97, 0.55), 0.05)
    prim("cylinder", (20.0, 20.0, -5.0), (0.006, 0.2), water, nm="stream_tap")
    prim("cylinder", (20.0, 20.0, -5.0), (0.006, 0.12), water, nm="stream_station")

    # ---- the kettle: its base, cable and socket; its switch
    prim("cylinder", (2.6, 0.62, Z0 + 0.9025), (0.095, 0.0025), dark)
    put("kettle_led", ring(2.6, 0.62, Z0 + 0.905, 0.093, 0.0022, 48), "ap_led_off", nm="led_kettlebase")
    put("kettle_cable", O3.tube([(2.6, 0.53, Z0 + 0.903), (2.6, 0.3, Z0 + 0.905), (2.62, 0.215, Z0 + 0.95), (2.64, 0.21, Z0 + 1.08)],
                                0.004, 8), dark)
    prim("box", (2.64, 0.205, Z0 + 1.1), (0.045, 0.004, 0.045), white)
    prim("box", (2.64, 0.21, Z0 + 1.1), (0.012, 0.002, 0.012), dark)
    hide_at(name="ctl_kettle")
    prim("cylinder", (2.2, 0.74, Z0 + 0.905), (0.022, 0.005), white)
    put("kettle_switch_led", ring(2.2, 0.74, Z0 + 0.9105, 0.016, 0.002, 24), "ap_led_off", nm="led_kettle")

    # ---- the washing machine and the dryer
    hide_at((-8.29 + o, 1.07, UP + 0.45))
    for k, cy in enumerate((1.075, 1.825)):
        xf = -8.3 + o
        put(f"porthole{k}", O3.tube(np.stack([np.full(49, xf + 0.012), cy + 0.19 * np.cos(np.linspace(0, 2 * math.pi, 49)),
                                              UP + 0.42 + 0.19 * np.sin(np.linspace(0, 2 * math.pi, 49))], 1), 0.022, 12, caps=False), chrome)
        prim("cylinder", (xf + 0.004, cy, UP + 0.42), (0.17, 0.003), mat(f"door_glass{k}", (0.25, 0.3, 0.35, 0.45), 0.05),
             euler=(0, math.pi / 2, 0))
        prim("box", (xf + 0.004, cy, UP + 0.775), (0.004, 0.315, 0.055), grey)
        prim("cylinder", (xf + 0.01, cy - 0.08, UP + 0.775), (0.032, 0.012), white, euler=(0, math.pi / 2, 0))
        prim("box", (xf + 0.009, cy + 0.08, UP + 0.78), (0.001, 0.06, 0.02), mat(f"wdisplay{k}", (0.1, 0.7, 0.35, 1), 0.2, 0, 0.5))
        prim("box", (xf + 0.009, cy - 0.24, UP + 0.775), (0.001, 0.06, 0.035), white)          # detergent drawer
    drum = O3.Mesh()
    for k in range(6):                                                          # the drum's paddles, seen through the glass
        a = k * math.pi / 3
        drum = drum + O3.box(0.004, 0.02, 0.07, c=(0, 0.0, 0.0)).moved(t=(0, 0.1 * math.cos(a), 0.1 * math.sin(a)), roll=a)
    drum = drum + O3.cyl(0.165, -0.004, 0.0, 32).moved(pitch=math.pi / 2)
    put("drum", drum.moved(t=(-8.3 + o - 0.03, 1.075, UP + 0.42)), mat("drum", (0.55, 0.56, 0.6, 1), 0.3, 0.8), nm="ap_drum")
    hide_at(name="ctl_washer")
    prim("cylinder", (-8.38 + o, 1.32, UP + 0.853), (0.018, 0.004), white)
    put("washer_led", ring(-8.38 + o, 1.32, UP + 0.858, 0.013, 0.002, 24), "ap_led_off", nm="led_washer")

    # ---- the television's picture
    tex = O3._tex("tv_picture", _tv_picture, 512)
    prim("box", (11.4, 1.4815, 0.9), (0.57, 0.0015, 0.32), mat("tv_screen", (1, 1, 1, 1), 0.1, 0, 0.55, tex=tex))

    b.world.append(SKIN[0] + "".join(geoms) + SKIN[1])


class Appliances:
    """Lights, glow, the turning drum and running water, following the house's state (visual model only)."""

    def __init__(self, house):
        import mujoco
        self.h = house
        mv = house.mv
        g = lambda n: mujoco.mj_name2id(mv, mujoco.mjtObj.mjOBJ_GEOM, n)            # noqa: E731
        mt = lambda n: mujoco.mj_name2id(mv, mujoco.mjtObj.mjOBJ_MATERIAL, n)        # noqa: E731
        self.led = {k: g(f"led_{k}") for k in ("hob", "tap", "kettle", "kettlebase", "washer")}
        self.zones, self.drum = g("ap_hob_zones"), g("ap_drum")
        self.stream = {k: g(f"stream_{k}") for k in ("tap", "station")}
        self.m_ring = mt("ap_hob_ring")
        self.ok = self.zones >= 0
        self.angle = 0.0
        self.heat = 0.0
        self.q0 = mv.geom_quat[self.drum].copy() if self.drum >= 0 else None

    def update(self, dt):
        if not self.ok:
            return
        h, mv = self.h, self.h.mv
        st = h.st
        on = {"hob": st["hob"], "tap": st["tap"], "kettle": st["kettle"], "kettlebase": st["kettle"], "washer": st["washer"]}
        col = {"hob": (1.0, 0.12, 0.05), "tap": (0.2, 0.6, 1.0), "kettle": (0.2, 0.6, 1.0), "kettlebase": (0.2, 0.6, 1.0),
               "washer": (0.2, 0.95, 0.4)}
        for k, gid in self.led.items():
            if gid >= 0:
                mv.geom_rgba[gid] = (*col[k], 1.0) if on[k] else (0.15, 0.15, 0.16, 1.0)
        self.heat += ((1.0 if st["hob"] else 0.0) - self.heat) * min(1.0, dt / 4.0)     # glass glows up and cools slowly
        c = self.heat
        mv.mat_rgba[self.m_ring] = (0.3 + 0.7 * c, 0.3 - 0.1 * c, 0.32 - 0.27 * c, 1.0)
        mv.mat_emission[self.m_ring] = 0.9 * c
        if self.drum >= 0 and st["washer"]:
            import mujoco
            self.angle += 6.0 * dt                     # turning about the machine's front-to-back axis (world x)
            q = np.array([math.cos(self.angle / 2), math.sin(self.angle / 2), 0.0, 0.0])
            out = np.zeros(4)
            mujoco.mju_mulQuat(out, q, self.q0)
            mv.geom_quat[self.drum] = out
        flows = getattr(h, "flowing", {})
        for k, gid in self.stream.items():
            if gid < 0:
                continue
            if k == "tap" and st["tap"]:
                mv.geom_pos[gid] = (0.56, 2.5, 1.1 + 0.14 - 0.2)       # from the spout down into the basin
            elif k == "station" and flows.get("station"):
                mv.geom_pos[gid] = (0.62, 3.2, 1.33 + 0.14 - 0.12)
            else:
                mv.geom_pos[gid] = (20.0, 20.0, -5.0)
