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
"""
from __future__ import annotations

import math

import numpy as np

N = 140                      # drops in flight at most
DROP_L = 0.003               # litres per drop
G = 9.81
MAX_FLOW = 0.6               # litres per second at most out of one container (a full pot tipped right over)
PARK = (20.0, 20.0, -5.0)
UPRIGHT_COS = math.cos(math.radians(35))      # an opening still catches water tipped up to 35 degrees


def build(b, Z0):
    """The drops, for the visual model (house.build calls this)."""
    from house import SKIN, f3
    g = [f'<geom name="drop_{k}" type="sphere" size="0.011" pos="{f3(PARK)}" rgba="0.62 0.78 0.95 0.75" '
         f'contype="0" conaffinity="0" group="0" mass="0"/>' for k in range(N)]
    b.world.append(SKIN[0] + "".join(g) + SKIN[1])


class Liquid:
    def __init__(self, house):
        import mujoco
        self.h = house
        mv = house.mv
        self.gid = np.array([mujoco.mj_name2id(mv, mujoco.mjtObj.mjOBJ_GEOM, f"drop_{k}") for k in range(N)])
        self.ok = bool((self.gid >= 0).all())
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
        self.owed = {}
        self.spilled = {"floor": 0.0, "worktop": 0.0, "sink": 0.0}
        self.into = {}               # litres landed in each container or plant since the last take()
        self.plant_l = {}
        self.floor_l, self.floor_xy = 0.0, None
        if self.ok:
            self.h.mv.geom_pos[self.gid] = PARK

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
        down = R.T @ np.array([0.0, 0.0, -1.0])                # world down, in the container's frame
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
    def tick(self, dt):
        if not self.ok:
            return
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
            ground, kind = self._surface(p[0], p[1], prev[2])
            if p[2] <= ground:
                self._spill(kind, p)
                self.alive[k] = False
                if self.trace is not None:
                    self.trace.append((float(p[0]), float(p[1]), float(p[2]), kind))
        self._draw()

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
        if kind == "floor":
            self.floor_l += DROP_L
            self.floor_xy = (float(p[0]), float(p[1]))
            if self.floor_l >= 0.1:                           # a puddle on the floor: slippery
                self.h.put_spill(*self.floor_xy)
                self.h.event("water spilled on the floor")
                self.floor_l = 0.0

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
