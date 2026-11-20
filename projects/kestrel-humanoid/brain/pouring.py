"""Water that pours: a tipped container lets water out over its lowest rim, and the water falls as drops that go
wherever gravity takes them. Where they land decides where the water ends up: inside a mug, pot, kettle or can (its
water and temperature go up), on a plant's soil (it is watered), down the sink, or on the worktop or floor (spilled:
enough on the floor makes a puddle someone could slip on).

It is a small particle simulation running beside MuJoCo, not inside it: drops don't push anything, so thousands of
contacts don't slow the house down; the containers themselves are real bodies, and they tip because the robot tips
them (housebot.pour turns the hook's hold like a wrist) or because they fall over.

How fast water leaves (per container, a cylinder of radius r and height H holding water to depth f along its axis):
tilted by theta, the water surface reaches the rim on the low side when f + r tan(theta) >= H; past that, it flows
over the lip like a weir: Q = 0.6 * 2/3 * sqrt(2 g) * w * head^1.5, with the lip width w = r and the head the
height of the surface above the rim. Each drop carries DROP_L litres.

The drops are spheres in the visual model only (drop_0 ... drop_{N-1}), parked out of sight when not falling.

Water in a container sloshes: its surface is a damped pendulum (the standard equivalent model of liquid sloshing in a
tank: the first mode of a cylinder of radius r filled to depth f swings at w = sqrt(g k tanh(k f)), k = 1.841 / r,
damping ratio 0.06). Accelerating the container tips the surface against the acceleration; the surface swings,
pushes back on the container (the moving water's share of the weight, as a force), and the spill test above uses
the surface's tilt, not the container's: rush a full pot and it slops over the side.

Drops hit what is really there (rays against the physics model): they splash once, then settle into puddles that
spread to a 2 mm film (radius by volume) and evaporate slowly; a floor puddle of 0.08 l or more is slippery
(house.put_spill). Scrubbing over a puddle wipes it up (world.py). Boiling water steams.
"""
from __future__ import annotations

import math

import numpy as np

N = 140                      # drops in flight at most
DROP_L = 0.003               # litres per drop
G = 9.81
MAX_FLOW = 0.6               # litres per second at most out of one container (a full pot tipped right over)
PARK = (20.0, 20.0, -5.0)
SLOSH_ZETA = 0.06            # damping ratio of the sloshing mode (water in a small container)
FILM = 0.002                 # a puddle's thickness (m)
N_PUDDLE = 8                 # puddles drawn at once (each in three sizes: a renderer may fix sizes at load)
PUDDLE_R = (0.07, 0.15, 0.3)
N_STEAM = 30
UPRIGHT_COS = math.cos(math.radians(35))      # an opening still catches water tipped up to 35 degrees


def build(b, Z0):
    """The drops, for the visual model (house.build calls this)."""
    from house import SKIN, f3
    g = [f'<geom name="drop_{k}" type="sphere" size="0.011" pos="{f3(PARK)}" rgba="0.62 0.78 0.95 0.75" '
         f'contype="0" conaffinity="0" group="0" mass="0"/>' for k in range(N)]
    import house as HS
    for n in HS.MUGS:                                  # the water's surface in each mug (stays level)
        r = HS.OBJECTS[n][1][0] * 0.8
        g.append(f'<geom name="surf_{n}" type="cylinder" size="{r:.4f} 0.0015" pos="{f3(PARK)}" rgba="0.55 0.7 0.85 0.8" '
                 f'contype="0" conaffinity="0" group="0" mass="0"/>')
    for k in range(N_PUDDLE):
        for j, r in enumerate(PUDDLE_R):
            g.append(f'<geom name="puddle_{k}_{j}" type="cylinder" size="{r} 0.0012" pos="{f3(PARK)}" '
                     f'rgba="0.7 0.82 0.95 0.45" contype="0" conaffinity="0" group="0" mass="0"/>')
    for k in range(N_STEAM):
        g.append(f'<geom name="steam_{k}" type="sphere" size="0.02" pos="{f3(PARK)}" rgba="0.95 0.95 0.97 0.18" '
                 f'contype="0" conaffinity="0" group="0" mass="0"/>')
    b.world.append(SKIN[0] + "".join(g) + SKIN[1])


class Liquid:
    def __init__(self, house):
        import mujoco
        self.h = house
        mv = house.mv
        self.gid = np.array([mujoco.mj_name2id(mv, mujoco.mjtObj.mjOBJ_GEOM, f"drop_{k}") for k in range(N)])
        self.ok = bool((self.gid >= 0).all())
        import house as HS
        name = lambda nm: mujoco.mj_name2id(mv, mujoco.mjtObj.mjOBJ_GEOM, nm)        # noqa: E731
        self.surf = {n: name(f"surf_{n}") for n in HS.MUGS}
        self.pg = np.array([[name(f"puddle_{k}_{j}") for j in range(len(PUDDLE_R))] for k in range(N_PUDDLE)])
        self.sg = np.array([name(f"steam_{k}") for k in range(N_STEAM)])
        self.slosh = {n: np.zeros(4) for n in HS.WATER_CAP}        # surface tilt (x, y) and its rate, per container
        self.slosh_f = {n: np.zeros(2) for n in HS.WATER_CAP}      # the moving water's push on its container (N)
        self.prev_v = {}
        self.pos = np.zeros((N, 3))
        self.vel = np.zeros((N, 3))
        self.alive = np.zeros(N, bool)
        self.temp = np.zeros(N)
        self.src = [None] * N
        self.rng = np.random.default_rng(7)
        self.owed = {}               # litres a container has let out that aren't drops yet
        self.trace = None            # a list to record where spilled drops land (debugging)
        self.prev_lip = {}
        self.aim_z, self.cross = None, []        # where drops cross a height (the robot watching its stream)
        self.reset()

    def reset(self):
        self.alive[:] = False
        self.bounced = np.zeros(N, bool)
        self.owed = {}
        self.puddles = []            # dicts: x, y, z, litres, kind
        self.steam_p = np.zeros((N_STEAM, 3))
        self.steam_age = np.full(N_STEAM, 99.0)
        for st in getattr(self, "slosh", {}).values():
            st[:] = 0.0
        for f in getattr(self, "slosh_f", {}).values():
            f[:] = 0.0
        self.prev_v = {}
        self.spilled = {"floor": 0.0, "worktop": 0.0, "sink": 0.0}
        self.into = {}               # litres landed in each container or plant since the last take()
        self.plant_l = {}
        self.floor_l, self.floor_xy = 0.0, None
        if self.ok:
            mv = self.h.mv
            mv.geom_pos[self.gid] = PARK
            for g in list(getattr(self, "surf", {}).values()) + list(np.ravel(getattr(self, "pg", []))) + list(getattr(self, "sg", [])):
                if g >= 0:
                    mv.geom_pos[g] = PARK

    # ---------------------------------------------------------------- the containers
    def _shape(self, n):
        import house as HS
        size = HS.OBJECTS[n][1]
        return size[0], 2.0 * size[-1]                        # radius, height

    def geometry(self, n, toward=None):
        """Container n as it is tipped now: (its lowest lip point in the world, the outward direction there, the tilt,
        the tilt at which water reaches the lip, the head of water above the lip). `toward`: a world direction to use
        for the low side while it is still upright."""
        h = self.h
        w = h.water.get(n, 0.0)
        r, H = self._shape(n)
        d = h.e.d[0]
        b = h.obj_body[n]
        R = d.xmat[b].reshape(3, 3)
        sx, sy = self.slosh[n][:2] if n in self.slosh else (0.0, 0.0)
        ns = np.array([-sx, -sy, 1.0])                         # the water surface's normal (world): sloshing tips it
        ns /= np.linalg.norm(ns)
        down = R.T @ -ns                                       # "down" for the water, in the container's frame
        sin_t = math.hypot(down[0], down[1])
        cos_t = -down[2]
        tilt = math.atan2(sin_t, cos_t)
        f = min(H, w / 1000.0 / (math.pi * r * r))            # water depth along the axis when upright
        spill = math.atan2(H - f, r)                          # tan(spill) = (H - f) / r
        if cos_t <= 0.05:                                     # on its side or upside down: it all runs out
            head = H if w > 1e-4 else 0.0
        else:
            head = (f + r * sin_t / max(cos_t, 1e-3) - H) * cos_t if w > 1e-4 else 0.0
        if sin_t > 0.02 or toward is None:
            u = np.array([down[0], down[1], 0.0]) / max(sin_t, 1e-9)       # towards the low side, in its frame
        else:
            u = R.T @ np.asarray(toward, float)
            u[2] = 0.0
            u /= max(np.linalg.norm(u), 1e-9)
        lip = d.xpos[b] + R @ np.array([r * u[0], r * u[1], H / 2])
        out = R @ u
        out[2] = 0.0
        out /= max(np.linalg.norm(out), 1e-9)
        return lip, out, tilt, spill, head

    def flow(self, n):
        """How water would leave container n now: (litres per second, world point on the lip, outward direction)."""
        w = self.h.water.get(n, 0.0)
        if w <= 1e-4:
            return 0.0, None, None
        lip, out, tilt, spill, head = self.geometry(n)
        if head <= 0.0 or tilt < 1e-3:
            return 0.0, None, None
        r, _ = self._shape(n)
        q = 0.6 * (2.0 / 3.0) * math.sqrt(2 * G) * r * head ** 1.5 * 1000.0
        return min(q, MAX_FLOW, w / 0.02), lip, out

    @staticmethod
    def speed(q):
        """How fast water leaves the lip (m/s): a trickle falls straight off it, a gush shoots out."""
        return min(0.35, 0.08 + 0.35 * q)

    def landing(self, lip, out, q, z):
        """Where water leaving the lip now would come down at height z (the robot aims with this, watching its
        stream as a person does)."""
        v = self.speed(q)
        fall = max(0.0, lip[2] - z)
        t = (math.sqrt(2 * G * fall)) / G if fall > 0 else 0.0
        return np.array([lip[0] + out[0] * v * t, lip[1] + out[1] * v * t])

    def receivers(self):
        """Openings that catch water: containers the house tracks water in (standing upright), and plant pots."""
        import house as HS
        h = self.h
        d = h.e.d[0]
        out = []
        for n in HS.WATER_CAP:
            b = h.obj_body[n]
            R = d.xmat[b].reshape(3, 3)
            if R[2, 2] < UPRIGHT_COS:
                continue
            r, H = self._shape(n)
            top = d.xpos[b] + R[:, 2] * H / 2
            out.append((n, top, r * 0.92))
        for k, (px, py) in enumerate(h.b.plants):
            out.append((k, np.array([px, py, h.floor_z(px, py) + 0.36]), 0.15))
        return out

    # ---------------------------------------------------------------- each step
    def _slosh(self, dt):
        """Each container's water surface: a damped pendulum driven by the container's acceleration."""
        import house as HS
        h = self.h
        for n in HS.WATER_CAP:
            st = self.slosh[n]
            w = h.water.get(n, 0.0)
            v = h.obj_vel(n).copy()
            a_raw = (v - self.prev_v[n][0]) / dt if n in self.prev_v else np.zeros(3)
            a = a_raw if n not in self.prev_v else self.prev_v[n][1] + (a_raw - self.prev_v[n][1]) * min(1.0, dt / 0.08)
            self.prev_v[n] = (v, a)                            # (contact jitter filtered out of the acceleration)
            if w < 0.01:
                st[:] = 0.0
                self.slosh_f[n][:] = 0.0
                continue
            r, H = self._shape(n)
            f = min(H, w / 1000.0 / (math.pi * r * r))
            k = 1.841 / r
            om = math.sqrt(G * k * math.tanh(k * f))
            target = -np.clip(a[:2], -6, 6) / G                # the surface leans against the acceleration
            acc = -om * om * (st[:2] - target) - 2 * SLOSH_ZETA * om * st[2:]
            st[2:] += acc * dt
            st[:2] += st[2:] * dt
            st[:2] = np.clip(st[:2], -1.2, 1.2)
            # the sloshing share of the water (most of it in a shallow container) pushes the container
            m_s = 0.001 * w * 1000.0 * min(0.9, math.tanh(k * f) / (k * f) * 0.8 + 0.1)
            self.slosh_f[n][:] = m_s * G * (st[:2] - target)

    def _steam(self, dt):
        h = self.h
        src = []
        if h.temp.get("kettle", 20) >= 98 and h.water.get("kettle", 0) > 0.05:
            src.append(h.obj_pos("kettle") + np.array([0.0, 0.0, 0.12]))
        if h.temp.get("pot", 20) >= 95 and h.water.get("pot", 0) > 0.1:
            src.append(h.obj_pos("pot") + np.array([0.0, 0.0, 0.07]))
        self.steam_age += dt
        if src:
            old = np.argsort(-self.steam_age)[:max(1, int(25 * dt * 3))]
            for k in old:
                if self.steam_age[k] > 1.2:
                    self.steam_p[k] = src[self.rng.integers(len(src))] + self.rng.normal(0, 0.02, 3)
                    self.steam_age[k] = 0.0
        live = self.steam_age < 1.5
        self.steam_p[live, 2] += 0.22 * dt
        self.steam_p[live, :2] += self.rng.normal(0, 0.02, (int(live.sum()), 2)) * dt * 3
        mv = self.h.mv
        for k, g in enumerate(self.sg):
            if g < 0:
                continue
            if live[k]:
                mv.geom_pos[g] = self.steam_p[k]
                mv.geom_rgba[g] = (0.95, 0.95, 0.97, 0.22 * (1 - self.steam_age[k] / 1.5))
            else:
                mv.geom_pos[g] = PARK

    def _settle(self, p, kind):
        """A drop's water comes to rest at p: into the nearest puddle on that surface, or a new one."""
        for pd in self.puddles:
            if pd["kind"] == kind and abs(pd["z"] - p[2]) < 0.03 and math.hypot(pd["x"] - p[0], pd["y"] - p[1]) < max(0.12, self._radius(pd)):
                l2 = pd["litres"] + DROP_L
                pd["x"] = (pd["x"] * pd["litres"] + p[0] * DROP_L) / l2
                pd["y"] = (pd["y"] * pd["litres"] + p[1] * DROP_L) / l2
                pd["litres"] = l2
                return pd
        pd = dict(x=float(p[0]), y=float(p[1]), z=float(p[2]), litres=DROP_L, kind=kind)
        self.puddles.append(pd)
        if len(self.puddles) > N_PUDDLE:                       # the smallest dries up first
            self.puddles.remove(min(self.puddles, key=lambda q: q["litres"]))
        return pd

    @staticmethod
    def _radius(pd):
        return min(0.5, math.sqrt(pd["litres"] / 1000.0 / (math.pi * FILM)))

    def wipe(self, x, y, z, radius=0.12, litres=0.03):
        """Something that scrubs, rubbed at (x, y, z), soaks up water. Returns litres taken."""
        took = 0.0
        for pd in list(self.puddles):
            if abs(pd["z"] - z) < 0.06 and math.hypot(pd["x"] - x, pd["y"] - y) < radius + self._radius(pd):
                t = min(litres - took, pd["litres"])
                pd["litres"] -= t
                took += t
                if pd["litres"] < 0.002:
                    self.puddles.remove(pd)
        return took

    def _draw_rest(self):
        """Puddles and the water in mugs."""
        import house as HS
        h, mv = self.h, self.h.mv
        for k in range(N_PUDDLE):
            pd = self.puddles[k] if k < len(self.puddles) else None
            j = None
            if pd is not None:
                rr = self._radius(pd)
                j = int(np.argmin([abs(rr - r_) for r_ in PUDDLE_R]))
            for jj in range(len(PUDDLE_R)):
                g = self.pg[k, jj]
                if g < 0:
                    continue
                mv.geom_pos[g] = (pd["x"], pd["y"], pd["z"] + 0.0013) if jj == j else PARK
        d = h.e.d[0]
        for n, g in self.surf.items():
            if g < 0:
                continue
            w = h.water.get(n, 0.0)
            if w < 0.01:
                mv.geom_pos[g] = PARK
                continue
            b = h.obj_body[n]
            R = d.xmat[b].reshape(3, 3)
            r, H = self._shape(n)
            f = min(H * 0.92, w / 1000.0 / (math.pi * r * r))
            mv.geom_pos[g] = d.xpos[b] + R[:, 2] * (-H / 2 + 0.008 + f)
            sx, sy = self.slosh[n][:2]
            ax = np.array([-sy, sx, 0.0])
            ang = math.atan(math.hypot(sx, sy))
            if ang > 1e-4:
                ax /= np.linalg.norm(ax)
                mv.geom_quat[g] = (math.cos(ang / 2), *(math.sin(ang / 2) * ax))
            else:
                mv.geom_quat[g] = (1, 0, 0, 0)
            hot = h.temp.get(n, 20.0) > 60
            mv.geom_rgba[g] = (0.45, 0.27, 0.12, 0.92) if h.tea.get(n) else ((0.7, 0.8, 0.9, 0.8) if hot else (0.55, 0.7, 0.85, 0.75))

    def tick(self, dt):
        if not self.ok:
            return
        self._slosh(dt)
        self._steam(dt)
        for pd in list(self.puddles):                          # puddles dry slowly (about 2 ml a minute)
            pd["litres"] -= 0.00004 * dt * 1000.0 / 1000.0
            if pd["litres"] <= 0.001:
                self.puddles.remove(pd)
        self._draw_rest()
        import house as HS
        h = self.h
        for n in HS.WATER_CAP:                                # tipped containers let water out
            q, lip, out = self.flow(n)
            if q <= 0.0:
                self.owed.pop(n, None)
                self.prev_lip.pop(n, None)
                continue
            self.owed[n] = self.owed.get(n, 0.0) + q * dt
            pl = self.prev_lip.get(n)                         # the lip's own velocity (a swinging container flings)
            v0 = (lip - pl) / dt if pl is not None else h.obj_vel(n).copy()
            sp_ = np.linalg.norm(v0)
            if sp_ > 1.0:
                v0 *= 1.0 / sp_
            self.prev_lip[n] = lip.copy()
            while self.owed[n] >= DROP_L and h.water.get(n, 0.0) >= DROP_L:
                free = np.flatnonzero(~self.alive)
                if not len(free):
                    break                                     # a full stream: the rest waits in the container
                k = free[0]
                self.owed[n] -= DROP_L
                h.water[n] -= DROP_L
                jitter = self.rng.normal(0.0, 0.003, 3)
                self.pos[k] = lip + out * 0.004 + jitter
                self.vel[k] = v0 + out * self.speed(q) * (0.85 + 0.3 * self.rng.random()) + jitter * 5
                self.temp[k] = h.temp.get(n, 20.0)
                self.src[k] = n
                self.alive[k] = True
                if self.trace is not None:
                    self.trace.append(("spawn", self.pos[k].copy(), self.vel[k].copy(), v0.copy(), lip.copy(), q))
            h._set_mass(n)
        if not self.alive.any():
            return
        a = np.flatnonzero(self.alive)
        p0 = self.pos[a].copy()
        self.vel[a, 2] -= G * dt
        self.pos[a] += self.vel[a] * dt
        recv = self.receivers()
        for i, k in enumerate(a):
            p, prev = self.pos[k], p0[i]
            if self.aim_z is not None and prev[2] >= self.aim_z > p[2]:
                f_ = (prev[2] - self.aim_z) / max(prev[2] - p[2], 1e-9)
                self.cross.append(prev[:2] + f_ * (p[:2] - prev[:2]))
            caught = None
            for n, top, rad in recv:
                if n == self.src[k]:
                    continue
                if prev[2] >= top[2] >= p[2] and math.hypot(p[0] - top[0], p[1] - top[1]) < rad:
                    caught = n
                    break
            if caught is not None:
                self._land_in(caught, self.temp[k])
                self.alive[k] = False
                continue
            hit = self._ray(prev, p)                          # what is really there between here and there
            if hit is not None:
                q, kind = hit
                if not self.bounced[k] and np.linalg.norm(self.vel[k]) > 0.8:      # a splash: once, small and slow
                    self.bounced[k] = True
                    self.pos[k] = q + np.array([0.0, 0.0, 0.004])
                    sp = self.rng.normal(0, 0.25, 2)
                    self.vel[k] = np.array([sp[0], sp[1], 0.25 * abs(self.vel[k][2])])
                    continue
                self._spill(kind, q)
                self.alive[k] = False
                self.bounced[k] = False
                if self.trace is not None:
                    self.trace.append((float(q[0]), float(q[1]), float(q[2]), kind))
        self._draw()

    def _ray(self, p0, p1):
        """The first thing the segment p0 -> p1 hits in the physics model (not the robot's own drops): (point, kind)
        with kind 'sink' (its basin), 'floor' or 'worktop' (anything else: a table, a worktop, the robot)."""
        import mujoco
        h = self.h
        v = p1 - p0
        L = float(np.linalg.norm(v))
        if L < 1e-9:
            return None
        gid = np.array([-1], np.int32)
        dist = mujoco.mj_ray(h.e.m, h.e.d[0], p0, v / L, None, 1, -1, gid)
        if dist < 0 or dist > L:
            if p1[2] < h.floor_z(p1[0], p1[1]):                 # missed the floor's edge: it is the floor
                return np.array([p1[0], p1[1], h.floor_z(p1[0], p1[1])]), "floor"
            return None
        q = p0 + v / L * dist
        c = h.b.containers.get("sink")
        if c is not None:
            x0, x1, y0, y1 = c["box"]
            if x0 <= q[0] <= x1 and y0 <= q[1] <= y1 and q[2] < c["rim"]:
                return q, "sink"
        if abs(q[2] - h.floor_z(q[0], q[1])) < 0.02:
            return q, "floor"
        return q, "worktop"

    def _surface(self, x, y, z_above):
        """The highest surface under a point that is below z_above: (height, 'floor' | 'worktop' | 'sink')."""
        h = self.h
        best, kind = h.floor_z(x, y), "floor"
        c = h.b.containers.get("sink")
        if c is not None:
            x0, x1, y0, y1 = c["box"]
            if x0 <= x <= x1 and y0 <= y <= y1:
                return c["bottom"], "sink"
        for f in h.b.furniture.values():
            (cx, cy), (sx, sy) = f["xy"], f["size"]
            if abs(x - cx) <= sx / 2 and abs(y - cy) <= sy / 2 and best < f["top"] <= z_above + 1e-6:
                best, kind = f["top"], "worktop"
        return best, kind

    def _land_in(self, n, t):
        h = self.h
        if isinstance(n, (int, np.integer)):                  # a plant pot
            self.plant_l[int(n)] = self.plant_l.get(int(n), 0.0) + DROP_L
            if self.plant_l[int(n)] >= 0.15 and int(n) not in h.watered:
                h.watered.add(int(n))
                h.event(f"watered plant {int(n)}")
        else:
            cap = h.water_cap(n)
            room = max(0.0, cap - h.water[n])
            got = min(DROP_L, room)
            if got > 0:
                h.temp[n] = (h.temp[n] * h.water[n] + t * got) / (h.water[n] + got)
                h.water[n] += got
                h._set_mass(n)
            if got < DROP_L:                                  # overflowing: it runs down the outside
                self._spill("worktop", h.obj_pos(n))
        self.into[n] = self.into.get(n, 0.0) + DROP_L

    def _spill(self, kind, p):
        self.spilled[kind] = self.spilled.get(kind, 0.0) + DROP_L
        if kind == "sink":                                    # down the drain
            return
        pd = self._settle(p, kind)
        if kind == "floor" and pd["litres"] >= 0.08 and not pd.get("slippery"):
            pd["slippery"] = True                             # a puddle on the floor: slippery underfoot
            self.h.put_spill(pd["x"], pd["y"])
            self.h.event("water spilled on the floor")

    def _draw(self):
        mv = self.h.mv
        a = self.alive
        mv.geom_pos[self.gid[a]] = self.pos[a]
        mv.geom_pos[self.gid[~a]] = PARK

    def take(self):
        """Litres landed in each container or plant since the last take(), and what was spilled; then start counting
        again."""
        into, spilled = dict(self.into), dict(self.spilled)
        self.into, self.spilled = {}, {"floor": 0.0, "worktop": 0.0, "sink": 0.0}
        return into, spilled

    def flying(self):
        return int(self.alive.sum())
