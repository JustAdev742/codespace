"""The house's general rules: how things heat, cook, get dirty and come clean, and what tools do - for anything in
the house, not per chore.

No job is written down here. Nothing says "to cook a steak, do this". Instead the world behaves in general ways, and
the robot (Claude, in agent mode) has to work out what to do:

* heat: anything standing on a lit hob heats up. Water stops at 100 C (it boils). A dry pan gets far hotter. Off the
  heat, things cool towards the room's 20 C.
* contents: containers hold things - water, and food. Pouring one container into another moves its food and some
  of its water, mixing the temperatures. Hot water onto a tea bag (every mug has one) is tea; water on a plant waters it.
* food cooks by its temperature over time, and it shows:
  - pasta cooks in boiling water (40 s cooked; much longer and it turns to mush);
  - a steak browns on the side facing down in a hot pan (browned after about 45 s, burnt after about 2 minutes
    on one side) while its inside cooks through (rare at 45-52 C, medium at 57-63 C, well done above 68 C; medium
    takes 3-4 minutes in a hot pan). It has to be turned over, and it keeps cooking in a hot pan after the hob is off.
    Its colour shows how browned the side facing up is, so the camera sees it.
* grime: dirty patches on surfaces (the bath, the basin, the toilet, worktops, tables). Rubbing something that scrubs
  over a patch, touching it and moving, wears it away; sprayed with cleaner first, it comes off twice as fast.
* tools: what a thing does is a property, and it works through how it is used:
  - scrubs (the scrub brush, and the long-handled toilet brush): rubbing it over grime cleans it;
  - sprays (the spray bottle): using it at a surface wets the grime within 25 cm;
  - flips (the spatula): using it at food in a pan turns the food over; used at food on a board or plate it lifts
    the food onto itself, and used again over a pan or plate it slides it off;
  - vacuums (the stick vacuum): its head on the floor picks up dust.
  Using the wrong thing does nothing, and the robot finds that out by trying.

The house shows all of it - colours, steam, what is in what, and a short description from inspect() - and a test
(or a person) judges a job by the state, never by which steps were taken.
"""
from __future__ import annotations

import math

import numpy as np

ROOM_T = 20.0

# things to work with (merged into house.OBJECTS): shape, size, colour, kg, handle height above the middle, words, home
NEW_OBJECTS = {
    "pan": ("cylinder", (0.13, 0.025), (0.16, 0.16, 0.18, 1), 0.6, 0.15, ["frying pan", "pan", "skillet"], "kitchen counter"),
    "board": ("box", (0.10, 0.07, 0.015), (0.62, 0.45, 0.28, 1), 0.4, 0.16,
              ["board", "steak board", "chopping board", "steak", "meat"], "kitchen island"),
    "spatula": ("box", (0.05, 0.035, 0.008), (0.12, 0.12, 0.13, 1), 0.15, 0.20, ["spatula", "fish slice", "turner", "flipper"],
                "kitchen island"),
    "plate": ("cylinder", (0.11, 0.01), (0.96, 0.96, 0.94, 1), 0.3, 0.12, ["plate", "dinner plate", "dish"], "dining table"),
    "brush": ("box", (0.08, 0.04, 0.025), (0.20, 0.55, 0.85, 1), 0.25, 0.32,
              ["scrub brush", "brush", "scrubbing brush", "sponge", "scrubber"], "bathroom"),
    # a long-handled brush (the head hangs 0.45 m below the hook): reaches the toilet, too long for the basin
    "toilet_brush": ("box", (0.05, 0.05, 0.03), (0.92, 0.92, 0.95, 1), 0.25, 0.45,
                     ["toilet brush", "long brush", "long-handled brush"], "bathroom"),
    "spray": ("cylinder", (0.04, 0.09), (0.35, 0.80, 0.90, 1), 0.35, 0.24,
              ["spray bottle", "spray", "cleaner", "cleaning spray", "bathroom cleaner"], "bathroom"),
}
# where they start (x, y, surface z above the house floor Z0)
NEW_SPOTS = {"pan": (1.95, 0.55, 0.9), "board": (2.5, 2.42, 0.92), "spatula": (2.85, 2.42, 0.92),
             "plate": (6.35, 2.3, 0.75), "brush": (5.7, 7.42, 0.85), "spray": (5.7, 8.08, 0.85),
             "toilet_brush": (7.0, 9.2, 0.55)}

TOOLS = {"brush": {"scrubs"}, "toilet_brush": {"scrubs"}, "spray": {"sprays"}, "spatula": {"flips"},
         "hoover": {"vacuums"}}
HEATS = ("pot", "pan")                        # stand on the hob and heat up (the kettle has its own base)
FOOD_HOLDERS = ("pot", "pan", "plate", "board", "pasta", "spatula")
# grime: where patches can be (name: x0, x1, y0, y1, surface z above Z0)
SURFACES = {
    "bath": (5.6, 7.1, 9.08, 9.22, 0.55), "basin": (5.52, 5.9, 7.36, 8.14, 0.85), "toilet": (7.62, 7.85, 8.15, 8.45, 0.42),
    "bathroom floor": (6.0, 7.5, 7.0, 8.8, 0.0), "worktop": (0.85, 3.7, 0.25, 0.75, 0.9),
    "dining table": (6.15, 7.65, 2.1, 2.9, 0.75), "kitchen island": (2.05, 3.75, 2.3, 3.1, 0.92),
}
SURFACE_ROOM = {"bath": "bathroom", "basin": "bathroom", "toilet": "bathroom", "bathroom floor": "bathroom",
                "worktop": "kitchen", "dining table": "dining room", "kitchen island": "kitchen"}
N_GRIME = 40
STEAK_RAW, STEAK_BROWN, STEAK_BURNT = np.array([0.72, 0.18, 0.20]), np.array([0.45, 0.26, 0.12]), np.array([0.08, 0.06, 0.05])


def build(b, Z0):
    """Add the new things, grime patches and food (render-only geoms) to a house being built."""
    from house import grab_object
    for n, (x, y, z) in NEW_SPOTS.items():
        grab_object(b, n, x, y, Z0 + z)
    b.grime = []
    for k in range(N_GRIME):
        b.geom("cylinder", (20.0, 20.0, -5.0), (0.035, 0.0015), rgba=(0.42, 0.36, 0.20, 1), name=f"grime_{k}", col=False)
        b.grime.append(f"grime_{k}")
    b.geom("box", (20.0, 20.0, -5.0), (0.07, 0.05, 0.012), rgba=(*STEAK_RAW, 1), name="food_steak", col=False)
    b.geom("cylinder", (20.0, 20.0, -5.0), (0.09, 0.012), rgba=(0.95, 0.85, 0.45, 1), name="food_pasta", col=False)
    b.geom("cylinder", (20.0, 20.0, -5.0), (0.10, 0.004), rgba=(0.55, 0.70, 0.90, 0.6), name="water_pot", col=False)


class World:
    """The general rules, ticking with the house."""

    def __init__(self, h, Z0):
        import mujoco
        self.h, self.Z0 = h, Z0
        gid = lambda n: mujoco.mj_name2id(h.mv, mujoco.mjtObj.mjOBJ_GEOM, n)       # noqa: E731
        self.grime_g = np.array([gid(n) for n in h.b.grime])
        self.steak_g, self.pasta_g, self.water_g = gid("food_steak"), gid("food_pasta"), gid("water_pot")
        self.reset()

    def reset(self):
        h = self.h
        self.food_in = {"pasta": "pasta", "steak": "board"}         # which container each food is in (or on)
        self.steak = dict(core=8.0, sear=[0.0, 0.0], down=0)       # straight from the fridge
        self.pasta_t = 0.0
        self.grime = np.zeros(N_GRIME)                              # 1 = dirty, 0 = clean
        self.grime_xyz = np.full((N_GRIME, 3), 1e6)
        self.grime_on = np.full(N_GRIME, "", dtype=object)
        self.wet_until = np.zeros(N_GRIME)
        for n in HEATS + ("plate", "board"):
            h.temp.setdefault(n, ROOM_T)
        self._said = set()
        self._draw()

    # ------------------------------------------------------------------------------------------ setting up
    def soil(self, surfaces, n, rng):
        """n patches of grime spread over the named surfaces (random spots, not overlapping)."""
        free = [k for k in range(N_GRIME) if self.grime[k] <= 0]
        put = 0
        for _ in range(n * 30):
            if put >= n or not free:
                break
            s = surfaces[rng.randrange(len(surfaces))]
            x0, x1, y0, y1, z = SURFACES[s]
            p = (rng.uniform(x0, x1), rng.uniform(y0, y1))
            if any(self.grime[k] > 0 and math.dist(p, self.grime_xyz[k][:2]) < 0.09 for k in range(N_GRIME)):
                continue
            k = free.pop(0)
            self.grime[k] = 1.0
            self.grime_xyz[k] = (p[0], p[1], self.Z0 + z + 0.002 if z > 0 else self.h.floor_z(*p) + 0.002)
            self.grime_on[k] = s
            put += 1
        self._draw()
        return put

    def grime_left(self, surfaces=None, room=None):
        on = [k for k in range(N_GRIME) if self.grime[k] > 0.08
              and (surfaces is None or self.grime_on[k] in surfaces)
              and (room is None or SURFACE_ROOM.get(self.grime_on[k]) == room)]
        return len(on)

    # ------------------------------------------------------------------------------------------ every step
    def tick(self, dt):
        h = self.h
        hob = h.st.get("hob", False)
        for n in HEATS:                                              # the hob heats whatever stands on it
            if n == "pot" and h.water.get("pot", 0.0) > 0.4:         # (the house heats a pot of water itself)
                continue
            on = h.on_zone(n, "hob")
            wet = h.water.get(n, 0.0) > 0.2
            if hob and on:
                top = 100.0 if wet else 230.0
                h.temp[n] = min(top, h.temp[n] + (2.5 if wet else 6.0) * dt)
            else:                                                    # off the heat, a pan cools in a few minutes
                h.temp[n] = ROOM_T + (h.temp[n] - ROOM_T) * math.exp(-dt / 120.0)
        for n in ("plate", "board"):
            h.temp[n] = ROOM_T + (h.temp[n] - ROOM_T) * math.exp(-dt / 200.0)
        # food takes its container's heat
        s = self.steak
        where = self.food_in["steak"]
        if where in ("pan", "pot"):
            tc = h.temp[where]
            surface = min(tc, 100.0)                                 # a wet surface stays near 100 C however hot the pan
            s["core"] += (0.006 if h.water.get(where, 0) > 0.2 else 0.004) * (surface - s["core"]) * dt
            if h.water.get(where, 0.0) <= 0.2:                       # dry heat browns the side that's down
                s["sear"][s["down"]] += max(0.0, (tc - 120.0) / 160.0) * dt
        else:
            s["core"] += 0.002 * (ROOM_T - s["core"]) * dt
        if max(s["sear"]) > 90 and "steak burnt" not in self._said:
            self._said.add("steak burnt")
            h.event("the steak is burning (smoke)")
        if self.food_in["pasta"] == "pot" and h.temp.get("pot", ROOM_T) >= 95.0 and h.water.get("pot", 0) > 0.3:
            self.pasta_t += dt
        # scrubbing: something that scrubs, touching a patch and moving over it, wears the grime away
        held = h.holding
        if held in TOOLS and "scrubs" in TOOLS[held] and (self.grime > 0).any():
            p = h.obj_pos(held)
            bottom = p[2] - h.objects_half_h(held)
            v = np.linalg.norm(h.obj_vel(held)[:2])
            if v > 0.03:
                reach = h.objects_size(held)[0] + 0.035              # half the head's length plus a patch's radius
                near = (self.grime > 0) & (np.hypot(self.grime_xyz[:, 0] - p[0], self.grime_xyz[:, 1] - p[1]) < reach) \
                    & (np.abs(self.grime_xyz[:, 2] - bottom) < 0.035)
                if near.any():
                    rate = 0.5 * np.where(self.wet_until[near] > h.t, 2.0, 1.0)
                    self.grime[near] = np.maximum(0.0, self.grime[near] - rate * dt)
        self._draw()

    # ------------------------------------------------------------------------------------------ actions
    def pour(self, src, dst, water=True):
        """src tipped over dst: food moves, some water moves (temperatures mix). Returns what happened, or None.
        water=False: food only (real pouring moves the water itself, as drops: pouring.py)."""
        h = self.h
        said = []
        for f, where in self.food_in.items():
            if where == src and dst in FOOD_HOLDERS and dst != src:
                self.food_in[f] = dst
                said.append(f"the {f} into the {dst}")
        w = h.water.get(src, 0.0)
        if water and w >= 0.05 and not isinstance(dst, int):
            amount = min(w, 0.2)
            if dst in h.water:
                cap = h.water_cap(dst)
                amount = min(amount, max(0.0, cap - h.water[dst]))
                t_src, t_dst = h.temp.get(src, ROOM_T), h.temp.get(dst, ROOM_T)
                if amount > 0:
                    h.temp[dst] = (t_dst * h.water[dst] + t_src * amount) / (h.water[dst] + amount)
                    h.water[dst] += amount
                    h.water[src] -= amount
                    h._set_mass(src)
                    h._set_mass(dst)
                    said.append(f"{amount:.2f} l of water into the {dst}")
        return "; ".join(said) or None

    def use(self, tool, at_xy, at_z):
        """The robot uses the tool it holds at a point (after bringing it there). Returns what happened."""
        h = self.h
        props = TOOLS.get(tool, set())
        if "sprays" in props:
            d = np.hypot(self.grime_xyz[:, 0] - at_xy[0], self.grime_xyz[:, 1] - at_xy[1])
            hit = (self.grime > 0) & (d < 0.25) & (np.abs(self.grime_xyz[:, 2] - at_z) < 0.15)
            self.wet_until[hit] = h.t + 40.0
            return f"sprayed: {int(hit.sum())} grimy patch(es) wet with cleaner" if hit.any() else "sprayed: nothing grimy there"
        if "flips" in props:                             # a spatula: turns food over, or carries it
            tp = h.obj_pos(tool)
            near = [n for n in FOOD_HOLDERS if n in h.obj_body and n != tool
                    and math.hypot(tp[0] - h.obj_pos(n)[0], tp[1] - h.obj_pos(n)[1]) < 0.16
                    and abs(tp[2] - h.obj_pos(n)[2]) < 0.14]
            carried = [f for f, w in self.food_in.items() if w == tool]
            if carried:
                if not near:
                    return f"the {carried[0]} is still on the spatula: nothing here to slide it onto"
                self.food_in[carried[0]] = near[0]
                return f"slid the {carried[0]} off the spatula onto/into the {near[0]}"
            here = [n for n in near if self.food_in.get("steak") == n]
            if not here:
                return "nothing on the spatula, and no food here to turn over or lift"
            if here[0] == "pan":
                self.steak["down"] = 1 - self.steak["down"]
                return "turned the steak over"
            self.food_in["steak"] = tool
            return f"lifted the steak off the {here[0]} onto the spatula"
        if "scrubs" in props:
            if getattr(h, "liquid", None) is not None:      # it soaks up any water there too
                h.liquid.wipe(at_xy[0], at_xy[1], at_z)
            return "scrubbed (rubbing it over grime wears the grime away)"
        return f"the {tool} doesn't do anything there"

    # ------------------------------------------------------------------------------------------ what can be seen
    def doneness(self):
        c, sear = self.steak["core"], self.steak["sear"]
        if max(sear) > 90:
            return "burnt"
        for lim, name in ((45, "raw"), (52, "rare"), (57, "medium rare"), (63, "medium"), (68, "medium well")):
            if c < lim:
                return name
        return "well done"

    def describe(self, name):
        """What looking closely (and a kitchen thermometer, for food) tells: a line for inspect()."""
        h = self.h
        if name in ("steak", "board") or (name in FOOD_HOLDERS and self.food_in["steak"] == name and name != "pasta"):
            s = self.steak
            up, down = s["sear"][1 - s["down"]], s["sear"][s["down"]]
            look = lambda v: "raw red" if v < 8 else "lightly browned" if v < 30 else "browned" if v < 90 else "black, burnt"  # noqa: E731
            where = self.food_in["steak"]
            sizzle = " It is sizzling." if where == "pan" and h.temp.get("pan", ROOM_T) > 150 else ""
            return (f"steak (on/in the {where}): top side {look(up)}, underside {look(down)}; inside {s['core']:.0f} C "
                    f"({self.doneness()}).{sizzle}")
        if name == "pasta" or (name == "pot" and self.food_in["pasta"] == "pot"):
            extra = ""
            if self.food_in["pasta"] == "pot":
                st = "not cooking yet" if self.pasta_t <= 0 else "cooking" if self.pasta_t < 40 else \
                    "cooked" if self.pasta_t < 120 else "overcooked, mushy"
                extra = f" Pasta in it: {st} ({self.pasta_t:.0f} s at the boil)."
            if name == "pot":
                return f"pot: {h.water.get('pot', 0):.1f} l of water at {h.temp.get('pot', ROOM_T):.0f} C" + \
                       (" (boiling)" if h.temp.get("pot", 0) >= 99 else "") + "." + extra
            return f"pasta: in the {self.food_in['pasta']}." + extra
        if name in h.water or name in HEATS:
            boiling = h.temp.get(name, 0) >= 99 and h.water.get(name, 0.0) > 0.05
            return (f"{name}: {h.water.get(name, 0.0):.2f} l of water, {h.temp.get(name, ROOM_T):.0f} C"
                    + (" (boiling)" if boiling else "") + "."
                    + (" There is tea in it." if getattr(h, "tea", {}).get(name) else ""))
        if name in SURFACES or name in ("bathroom", "kitchen", "dining room"):
            n = self.grime_left(surfaces=[name]) if name in SURFACES else self.grime_left(room=name)
            wet = int(((self.grime > 0.08) & (self.wet_until > h.t)).sum())
            return f"{name}: {n} grimy patch(es)" + (f", {wet} wet with cleaner" if wet else "") + "."
        if name in TOOLS:
            on = [f for f, w in self.food_in.items() if w == name]
            return f"{name}: a tool; it {', '.join(sorted(TOOLS[name]))}." + (f" The {on[0]} is on it." if on else "")
        if name in ("hob", "cooker", "stove", "kettle base"):
            zone, ctl = ("hob", "hob") if name != "kettle base" else ("kettle_base", "kettle")
            on = [n for n in h.obj_body if h.on_zone(n, zone)]
            what = ", ".join(f"the {n} ({h.temp.get(n, ROOM_T):.0f} C)" for n in on) or "nothing"
            return f"{name}: {'on' if h.st.get(ctl) else 'off'}; on it: {what}. Pressing its control switches it on or off."
        return None

    # ------------------------------------------------------------------------------------------ drawing
    def _draw(self):
        h = self.h
        mv = h.mv
        for k, g in enumerate(self.grime_g):
            if self.grime[k] > 0.08:
                mv.geom_pos[g] = self.grime_xyz[k]
                wet = self.wet_until[k] > h.t
                c = (0.30, 0.42, 0.55) if wet else (0.42, 0.36, 0.20)
                mv.geom_rgba[g] = (*c, 0.35 + 0.65 * self.grime[k])
            else:
                mv.geom_pos[g] = (20.0, 20.0, -5.0)
        # the steak, in or on whatever holds it; its colour is the side facing up
        where = self.food_in["steak"]
        if where in h.obj_body:
            p = h.obj_pos(where)
            top = p[2] + h.objects_half_h(where) if where != "pot" else p[2] - h.objects_half_h(where) + 0.02
            if where == "spatula":
                top = p[2] + h.objects_half_h(where) - 0.004
            mv.geom_pos[self.steak_g] = (p[0], p[1], top + 0.012)
            up = self.steak["sear"][1 - self.steak["down"]]
            c = STEAK_RAW + (STEAK_BROWN - STEAK_RAW) * min(1.0, up / 30.0)
            if up > 90:
                c = STEAK_BURNT
            mv.geom_rgba[self.steak_g] = (*c, 1)
        else:
            mv.geom_pos[self.steak_g] = (20.0, 20.0, -5.0)
        where = self.food_in["pasta"]
        if where in ("pot", "pan", "plate"):
            p = h.obj_pos(where)
            mv.geom_pos[self.pasta_g] = (p[0], p[1], p[2] - h.objects_half_h(where) + 0.03 if where == "pot" else p[2] + 0.02)
        else:
            mv.geom_pos[self.pasta_g] = (20.0, 20.0, -5.0)
        w = h.water.get("pot", 0.0)
        if w > 0.05:
            p = h.obj_pos("pot")
            mv.geom_pos[self.water_g] = (p[0], p[1], p[2] - h.objects_half_h("pot") + min(0.15, 0.02 + 0.05 * w))
            hot = min(1.0, max(0.0, (h.temp.get("pot", ROOM_T) - 20) / 80))
            mv.geom_rgba[self.water_g] = (0.55 + 0.4 * hot, 0.70 + 0.25 * hot, 0.90, 0.6)
        else:
            mv.geom_pos[self.water_g] = (20.0, 20.0, -5.0)
