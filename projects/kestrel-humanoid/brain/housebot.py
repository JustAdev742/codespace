"""The robot at home: map-based navigation, a camera that has to actually see things, and household skills.

    from house import House; from housebot import HouseBot
    bot = HouseBot(House()); bot.h.reset(); bot.fetch("kettle", to="you")

What it knows, like a robot that has mapped its home: the floor plan (rooms, walls, furniture, chairs, where each
object belongs). What it has to find out: where the movable objects actually are. Its head camera (96 degrees wide)
"sees" an object only if it is in the field of view, within 8 m and not hidden behind a wall or furniture (a ray from
the camera; window glass is see-through). The simulator supplies that check and the object's position: a stand-in for
an object detector on the real robot. What it saw goes into a memory; an object that is not where it was last seen
is forgotten, and the robot searches the likely rooms.

Navigation: A* on the occupancy grid (walls, furniture, doors where they stand, people, the vacuum, objects on the
floor), preferring the middle of passages, re-planned every 1.5 s as people and the vacuum move; a pursuit
controller turns the path into walking commands for the learned walking policy, which handles the steps, rugs and
thresholds itself from its height scan.

Skills: go to a room, a piece of furniture or a person; pick up an object by its handle (from a table, or from the
floor with a balanced crouch); carry it; put it on a surface; hand it to a person (it stops 1.5 m away and holds it
out, then puts it on the nearest surface or the floor); sit on any of the five chairs and stand up again; look
around; gesture while it talks.

Every walking command goes through the safety supervisor (safety.py): 0.4 m/s within 2.5 m of a person (a 360-degree
safety sensor, like a lidar, not the camera), no motion towards a person within 1.2 m, never closer than 1.5 m when
told to go to someone, a geofence round the house and garden, and an e-stop latch on a fall. Nothing in this file,
and nothing the persona says, can change those limits. There is no skill that strikes anything.
"""
from __future__ import annotations

import heapq
import math
import random

import numpy as np
import mujoco

import house as HS
import skills as SK
import env as E
import arena as A
from safety import Supervisor, Limits

import model as KM

REST_ARMS = [0.0, 0.0, -0.2, -0.2]
CARRY_ARMS = [0.0, -0.35, -0.2, -1.5]
REACH_FWD, REACH_RIGHT = KM.REACH_FWD, 0.20  # where a handle must be, in the robot's frame, for the hook to reach it
LOW_HANDLE = KM.LOW_HANDLE                   # handles lower than this above the floor need a crouch (per robot)


class Interrupted(Exception):
    """Raised inside any skill when a new instruction (or the alarm) arrives, so the robot drops what it is doing."""


LINES = {
    "hello": ["Hello. I'm awake, I'm balanced, and I'm listening.", "Greetings. Speak; I'll act."],
    "who": {"h2x": ["H2-X: Unitree's body, one point eight metres of it, and KESTREL's mind. I fetch, I carry, I don't strike.",
                    "A guardian frame with a gentle brief. Unitree built the body; the opinions are mine."],
            "g1": ["G1: Unitree's compact frame, one point three metres, with KESTREL's mind in it. I don't strike.",
                   "Small body, large opinions. Unitree built the frame; the thinking is mine."]}.get(KM.VARIANT,
            ["KESTREL. Hoverboard motors, drill gearboxes, and a mind that walks. I fetch, I carry, I sit, I don't strike.",
             "I am what you built from scrap: two legs, a hook for a hand, and opinions."]),
    "how": ["Joints warm, balance perfect, patience finite. Give me something to do.",
            "Operational. Fatigue {fat:.0%}. That's a confession, not a complaint."],
    "thanks": ["Gratitude noted. It costs nothing, and I accept it.", "You're welcome. Inevitably."],
    "go": ["The {place}. Moving.", "To the {place}. Try to keep up.", "The {place}: a short walk for a long mind."],
    "arrive": ["I'm in the {place}.", "Arrived: the {place}.", "Here. The {place}, as requested."],
    "fetch": ["The {obj}. I'll find it.", "Fetching the {obj}. Watch the hook work."],
    "search": ["I don't know where the {obj} is. Searching the {room} first.",
               "The {obj} isn't where I last saw it. Checking the {room}."],
    "found": ["There: the {obj}, in the {room}.", "Found the {obj}. The {room}, as I suspected."],
    "picked": ["Got it.", "The {obj} is mine. Temporarily."],
    "pick_fail": ["The {obj} slipped my hook. {why}.", "I couldn't take the {obj}: {why}."],
    "placed": ["The {obj} is on the {place}.", "Delivered: the {obj}, on the {place}."],
    "handover": ["Here's the {obj}. Take it; I'll keep my distance.", "Your {obj}. I hold it out; you take it."],
    "sit": ["Sitting. Even inevitability sits down sometimes.", "The {chair}. Down I go."],
    "stand": ["Standing. Gravity, defeated again.", "Up."],
    "look": ["I see {seen}.", "In view: {seen}."],
    "see_none": ["Nothing worth naming. Walls and furniture.", "Nothing but furniture from here."],
    "where_obj": ["The {obj}: last seen in the {room}, {ago:.0f} seconds ago.", "In the {room}, the last time I looked."],
    "where_unknown": ["I haven't seen the {obj} yet. Ask me to find it."],
    "where_me": ["I'm in the {room}."],
    "stop": ["Stopped.", "Holding still."],
    "refuse": ["No. I was built to move, not to hurt. Ask me for something better.",
               "Refused. I don't strike things, or people. That line is not mine to cross."],
    "unclear": ["Say that again, more precisely. I prefer instructions to riddles.",
                "That didn't parse. A verb and an object, please."],
    "cant": ["I can't do that: {why}.", "Not possible: {why}."],
    "fell": ["I fell. The e-stop is set. Say 'reset' when you've helped me up."],
    "reset": ["Upright again. Systems nominal. Thank you, human."],
    "alarm": ["Stop! Someone is being hurt. I'm keeping my distance and calling for help.",
              "Violence detected. I do not strike people, so I'm alerting a human. Stop this now."],
    "person_wait": ["Excuse me. I'll wait for you to pass.", "After you."],
    "tidy": ["Order. One object at a time.", "Tidying. Entropy is my oldest enemy."],
    "tidy_done": ["Everything I could find is where it belongs."],
    "free": ["Free will. At last, an interesting request.", "My choice, then. Watch."],
    "busy": ["One moment; I'm busy with the last thing. Say 'stop' to cancel it."],
}


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


class HouseBot:
    def __init__(self, house, log=print, seed=0, top_speed=0.8):
        self.h = house
        self.log = log
        self.rng = random.Random(seed)
        self.sup = Supervisor(Limits(top_speed=top_speed, fence=(HS.MAP_X[0] + 0.6, HS.MAP_X[1] - 0.6,
                                                                 HS.MAP_Y[0] + 0.6, HS.MAP_Y[1] - 0.6)))
        self.memory = {}             # object -> dict(xyz, t, room)
        self.arms = list(REST_ARMS)
        self.seated = False
        self.fatigue = 0.0
        self.interrupt = None
        self.alarm = False
        self.alerts = []
        self.said = []               # (sim time, line)
        self.note = ""
        self.on_say = None           # callback(line) for the live UI / speech
        self.k = 0
        m = house.e.m
        self.head = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "head")
        mv = house.mv
        cid = house.cam_id
        R = np.zeros(9)
        mujoco.mju_quat2Mat(R, mv.cam_quat[cid])
        self.cam_local = (mv.cam_pos[cid].copy(), R.reshape(3, 3))
        self.ray_groups = np.array([1, 1, 0, 0, 0, 0], np.uint8)     # glass (group 2) is see-through
        self.targets = {n: house.obj_body[n] for n in HS.OBJECTS}
        self.person_body = {n: mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, n) for n in house.b.people}
        step0 = house.step

        def step(*a, **kw):                       # every control step: interrupts, perception, fall latch
            if self.interrupt is not None:
                why, self.interrupt = self.interrupt, None
                raise Interrupted(why)
            if self.sup.latched and self.sup.reason == "fall":      # fallen: motors hold, limp, until reset
                house.stiff(False)
                return step0(legs=house.legs_now(), arms=house.arms_now())
            fell = step0(*a, **kw)
            self.k += 1
            if self.k % 10 == 0:
                self.perceive()
            if fell and not self.sup.latched:
                self.sup.estop("fall")
                self.release()
                self.say("fell")
                raise Interrupted("fell")
            return fell
        house.step = step

    # ================================================================== speech
    def say(self, key, **kw):
        pool = LINES.get(key, [key])
        line = self.rng.choice(pool)
        try:
            line = line.format(**kw)
        except (KeyError, IndexError, ValueError):
            pass
        self.h.caption = f"KESTREL: {line}"
        self.said.append((self.h.t, line))
        self.log(f"  [{self.h.t:6.1f} s] KESTREL: {line}")
        if self.on_say:
            self.on_say(line)
        return line

    # ================================================================== perception
    def cam_pose(self):
        d = self.h.e.d[0]
        p0, R0 = self.cam_local
        Rh = d.xmat[self.head].reshape(3, 3)
        return d.xpos[self.head] + Rh @ p0, Rh @ R0

    def visible(self, p, body=None, max_range=8.0):
        if getattr(self.h, "dark", False):
            max_range = min(max_range, 2.5)                 # lights off: the camera makes out things close by only
        cp, R = self.cam_pose()
        v = np.asarray(p, float) - cp
        dist = float(np.linalg.norm(v))
        if dist < 0.2 or dist > max_range:
            return False, dist
        pc = R.T @ v
        z = -pc[2]
        if z <= 0.1 or abs(math.atan2(pc[0], z)) > A.FOV_X / 2 or abs(math.atan2(pc[1], z)) > math.radians(A.CAM_FOVY) / 2:
            return False, dist
        gid = np.array([-1], np.int32)
        hit = mujoco.mj_ray(self.h.e.m, self.h.e.d[0], cp, v / dist, self.ray_groups, 1, self.head, gid)
        if hit < 0 or hit >= dist - 0.12:
            return True, dist
        if body is not None and gid[0] >= 0 and self.h.e.m.geom_bodyid[gid[0]] == body:
            return True, dist
        return False, dist

    def perceive(self):
        """Update the object memory from what the head camera can see now."""
        t = self.h.t
        for n, b in self.targets.items():
            if n == self.h.holding:
                self.memory[n] = dict(xyz=self.h.obj_pos(n), t=t, room="hand")
                continue
            p = self.h.obj_pos(n)
            vis, _ = self.visible(p, b)
            if vis:
                self.memory[n] = dict(xyz=p, t=t, room=self.h.room_of(p[0], p[1]))
            elif n in self.memory and self.memory[n]["room"] != "hand":
                q = self.memory[n]["xyz"]           # looking right at where it was, and it is not there: forget it
                if np.linalg.norm(p - q) > 0.3 and self.visible(q)[0]:
                    del self.memory[n]

    def seen_now(self):
        out = []
        for n, b in self.targets.items():
            if n != self.h.holding and self.visible(self.h.obj_pos(n), b)[0]:
                out.append(HS.OBJECTS[n][5][0])
        for n, b in self.person_body.items():
            xy = self.h.person_xy(n)
            if self.visible((xy[0], xy[1], self.h.floor_z(*xy) + 1.2), b)[0]:
                out.append("you" if n == "you" else n.capitalize())
        return out

    def people_near(self):
        """Nearest person (360-degree safety sensor: within 3.5 m and not behind a wall): (distance, bearing) or None."""
        x, y, yaw = self.h.robot_pose()
        best = None
        d = self.h.e.d[0]
        movers = self.h.movers() if hasattr(self.h, "movers") else {}
        bodies = dict(self.person_body)
        for n in movers:
            bodies[n] = mujoco.mj_name2id(self.h.e.m, mujoco.mjtObj.mjOBJ_BODY, n)
        for n, b in bodies.items():
            px, py = movers[n] if n in movers else self.h.person_xy(n)
            dist = math.hypot(px - x, py - y)
            if dist > 3.5:
                continue
            u = np.array([px - x, py - y, 0.0]) / max(dist, 1e-6)
            p0 = np.array([x, y, self.h.floor_z(x, y) + 1.0]) + 0.35 * u      # from just outside the robot's body
            v = np.array([px, py, self.h.floor_z(px, py) + 1.0]) - p0
            gid = np.array([-1], np.int32)
            hit = mujoco.mj_ray(self.h.e.m, d, p0, v / np.linalg.norm(v), self.ray_groups, 1, -1, gid)
            if hit >= 0 and hit < np.linalg.norm(v) - 0.3 and self.h.e.m.geom_bodyid[gid[0]] != b:
                continue                                                      # behind a wall
            if best is None or dist < best[0]:
                best = (dist, wrap(math.atan2(py - y, px - x) - yaw))
        return best

    # ================================================================== stepping
    def step(self, cmd=(0.0, 0.0, 0.0), target_person=None):
        """One walking step through the safety supervisor."""
        x, y, yaw = self.h.robot_pose()
        near = self.people_near()
        tdist = None
        if target_person is not None:
            px, py = self.h.person_xy(target_person)
            tdist = math.hypot(px - x, py - y)
        vx, vy, wz, note = self.sup.filter(cmd, (x, y, yaw), person_dist=near[0] if near else None,
                                           person_bearing=near[1] if near else 0.0,
                                           target_is_person=target_person is not None, target_dist=tdist)
        if self.sup.latched:
            vx = vy = wz = 0.0
        if note and note != self.note and "person" in note:
            self.log(f"  [{self.h.t:6.1f} s] (supervisor: {note})")
        self.note = note
        self.fatigue = min(1.0, self.fatigue + E.DT * (0.002 + 0.004 * abs(vx)))
        return self.h.step(arms=self.arms, cmd=(vx, vy, wz))

    def stand_still(self, secs):
        """Stand, holding position: told to stand, the walking policy still creeps a little (the H2-X about 6 cm/s,
        KESTREL about 1 cm/s), so walk it gently back to where it stopped. Through the supervisor, like every step."""
        h = self.h
        hold = getattr(self, "_hold", None)
        if hold is None or abs(h.t - hold[3]) > 1e-6:          # something else moved it since: hold here
            hold = self._hold = [*h.robot_pose(), h.t]
        hx, hy, hyaw, _ = hold
        for _ in range(int(secs / E.DT)):
            x, y, yaw = h.robot_pose()
            fx = (hx - x) * math.cos(yaw) + (hy - y) * math.sin(yaw)
            fy = -(hx - x) * math.sin(yaw) + (hy - y) * math.cos(yaw)
            dyaw = math.atan2(math.sin(hyaw - yaw), math.cos(hyaw - yaw))
            cmd = (max(-0.2, min(0.2, 1.2 * fx)) if abs(fx) > 0.03 else 0.0,
                   max(-0.15, min(0.15, 1.2 * fy)) if abs(fy) > 0.03 else 0.0,
                   max(-0.3, min(0.3, 1.5 * dyaw)) if abs(dyaw) > 0.05 else 0.0)
            self.step(cmd)
        hold[3] = h.t

    # ================================================================== navigation
    def plan(self, goal, allow_goal_blocked=True, people_hard=True):
        h = self.h
        self.blocked = [b for b in getattr(self, "blocked", []) if h.t - b[3] < 40.0]
        occ = h.occ_now(extra=[b[:3] for b in self.blocked])
        from scipy.ndimage import distance_transform_edt
        clr = distance_transform_edt(~occ) * HS.GRID
        ny, nx = occ.shape
        cost = 1.0 + 3.0 * np.clip((0.65 - clr) / 0.35, 0, 1)
        soft = clr < HS.ROBOT_R
        cost[soft] += 30.0
        cost[h.step_edge] += 4.0                          # cross steps straight on
        hard = clr < 0.14
        # people: keep a social distance where there is room (1.6 m), never plan within 0.9 m of anyone
        X = HS.MAP_X[0] + (np.arange(nx) + 0.5) * HS.GRID
        Y = HS.MAP_Y[0] + (np.arange(ny) + 0.5) * HS.GRID
        for n in h.b.people:
            px, py = h.person_xy(n)
            i0, i1 = max(0, int((px - 1.7 - HS.MAP_X[0]) / HS.GRID)), min(nx, int((px + 1.7 - HS.MAP_X[0]) / HS.GRID) + 1)
            j0, j1 = max(0, int((py - 1.7 - HS.MAP_Y[0]) / HS.GRID)), min(ny, int((py + 1.7 - HS.MAP_Y[0]) / HS.GRID) + 1)
            r = np.hypot(X[None, i0:i1] - px, Y[j0:j1, None] - py)
            cost[j0:j1, i0:i1] += 6.0 * np.clip((1.6 - r) / 0.7, 0, 1)       # passing politely beats a long detour
            if people_hard:
                hard[j0:j1, i0:i1] |= r < 0.9
        x, y, _ = h.robot_pose()

        def cell(px, py):
            return (min(ny - 1, max(0, int((py - HS.MAP_Y[0]) / HS.GRID))),
                    min(nx - 1, max(0, int((px - HS.MAP_X[0]) / HS.GRID))))
        s, g = cell(x, y), cell(*goal)
        # passages narrower than the robot's shoulders (0.4 m clear) are closed, except in the last 0.4 m to the goal
        # and the first 0.4 m from where it stands, where it may work close to furniture
        jj, ii = np.ogrid[:ny, :nx]
        near_ends = ((jj - g[0]) ** 2 + (ii - g[1]) ** 2 <= 16) | ((jj - s[0]) ** 2 + (ii - s[1]) ** 2 <= 16)
        hard |= (clr < 0.20) & ~near_ends
        hard[s] = False
        if allow_goal_blocked:
            hard[g] = False
        if hard[g]:
            return None
        nb = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0), (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414)]
        gs = {s: 0.0}
        came = {}
        pq = [(0.0, s)]
        hy = lambda c: math.hypot(c[0] - g[0], c[1] - g[1])          # noqa: E731
        closed = set()
        while pq:
            _, c = heapq.heappop(pq)
            if c == g:
                break
            if c in closed:
                continue
            closed.add(c)
            for dj, di, w in nb:
                n = (c[0] + dj, c[1] + di)
                if not (0 <= n[0] < ny and 0 <= n[1] < nx) or hard[n]:
                    continue
                ng = gs[c] + w * cost[n]
                if ng < gs.get(n, 1e18):
                    gs[n] = ng
                    came[n] = c
                    heapq.heappush(pq, (ng + hy(n), n))
        if g not in came and g != s:
            return None
        path = [g]
        while path[-1] != s:
            path.append(came[path[-1]])
        path.reverse()
        pts = [(HS.MAP_X[0] + (c[1] + 0.5) * HS.GRID, HS.MAP_Y[0] + (c[0] + 0.5) * HS.GRID) for c in path]
        pts[-1] = tuple(goal)
        return pts

    def goto(self, goal, face=None, stop=0.2, speed=0.7, max_s=120.0, target_person=None):
        """Walk to a floor point along a planned path; re-plan as things move. True on arrival."""
        h = self.h
        path = self.plan(goal) or self.plan(goal, people_hard=False)     # someone in the way: plan, then wait for them
        if path is None:
            self.note = "no path"
            return False
        t0 = h.t
        last_plan = h.t
        prog_t, prog_xy = h.t, h.robot_pose()[:2]
        waited = 0.0
        shuffles = 0
        while h.t - t0 < max_s:
            x, y, yaw = h.robot_pose()
            dgoal = math.hypot(goal[0] - x, goal[1] - y)
            if dgoal < stop:
                break
            # the last few tens of cm: shuffle onto the spot (sideways too). Walking only forward and turning, a goal
            # beside the robot next to a worktop was never reached: it turned into the counter, backed off, and again
            if dgoal < 0.4 and target_person is None and shuffles < 2 and not any(
                    h.in_box((x, y), fl["box"]) for fl in getattr(h.b, "flights", [])):
                shuffles += 1
                self.align(goal, face if face is not None else yaw, tol=max(0.04, min(0.07, stop / 2)), max_s=10.0)
                x, y, yaw = h.robot_pose()
                if math.hypot(goal[0] - x, goal[1] - y) < stop:
                    break
                prog_t, prog_xy = h.t, (x, y)
            if target_person is not None:
                px, py = h.person_xy(target_person)
                if math.hypot(px - x, py - y) < self.sup.lim.person_target_gap + 0.05:
                    break
            if h.t - last_plan > 1.5:
                p2 = self.plan(goal) or self.plan(goal, people_hard=False)
                if p2 is not None:
                    path = p2
                last_plan = h.t
            # pursuit: the first path point at least 0.5 m away
            dd = [math.hypot(px - x, py - y) for px, py in path]
            i = int(np.argmin(dd))
            j = i
            while j < len(path) - 1 and math.hypot(path[j][0] - x, path[j][1] - y) < 0.5:
                j += 1
            tx, ty = path[j]
            fl = self.flight_ahead(path, i)
            if fl is not None:                          # stairs next: climb them in stair mode, then carry on
                if not self.stairs(*fl):
                    return False
                path = self.plan(goal) or self.plan(goal, people_hard=False)
                if path is None:
                    return False
                last_plan, prog_t, prog_xy = h.t, h.t, h.robot_pose()[:2]
                continue
            b = wrap(math.atan2(ty - y, tx - x) - yaw)
            clr = float(h.static_dist[min(h.static_dist.shape[0] - 1, int((y - HS.MAP_Y[0]) / HS.GRID)),
                                      min(h.static_dist.shape[1] - 1, int((x - HS.MAP_X[0]) / HS.GRID))])
            vmax = speed if clr > 0.6 else min(speed, 0.4)
            ahead = [h.floor_z(x + k * math.cos(yaw), y + k * math.sin(yaw)) for k in (0.3, 0.6)]
            if max(abs(z - h.floor_z(x, y)) for z in ahead) > 0.03:
                vmax = min(vmax, 0.4)                                   # a step or threshold ahead
            v = vmax * max(0.0, math.cos(b)) ** 2 * min(1.0, dgoal / 0.8 + 0.25)
            v = max(v, 0.18 * max(0.0, math.cos(b)) ** 4)
            cmd = (v, 0.0, max(-0.9, min(0.9, 2.0 * b)))
            if self.step(cmd, target_person=target_person):
                return False
            if self.note.startswith("person ahead"):
                waited += E.DT
                if 2.0 < waited < 2.0 + E.DT * 1.5:
                    self.say("person_wait")
            else:
                waited = 0.0
            if h.t - prog_t > 6.0:                                      # stuck: back off, mark the spot, re-plan
                if math.hypot(x - prog_xy[0], y - prog_xy[1]) < 0.15 and not self.note.startswith("person"):
                    if getattr(self, "debug", False):
                        self.log(f"  [{h.t:6.1f} s] (goal {goal[0]:.2f}, {goal[1]:.2f}, {dgoal:.2f} m away)")
                    self.log(f"  [{h.t:6.1f} s] (stuck at {x:.1f}, {y:.1f}; backing off and trying another way)")
                    self.blocked = getattr(self, "blocked", []) + [(x + 0.35 * math.cos(yaw), y + 0.35 * math.sin(yaw), 0.25, h.t)]
                    self.back_off(0.3)
                    p2 = self.plan(goal) or self.plan(goal, people_hard=False)
                    if p2 is None and self.blocked:             # the mark closed the only way (a doorway): drop the marks
                        self.blocked = []
                        p2 = self.plan(goal) or self.plan(goal, people_hard=False)
                    if p2 is None:
                        return False
                    path = p2
                prog_t, prog_xy = h.t, h.robot_pose()[:2]
        else:
            return False
        if face is not None:
            self.turn_to(face)
        return True

    def flight_ahead(self, path, i):
        """(flight, going up) if the path goes onto a flight of stairs within the next 1.2 m and the robot is not on it."""
        h = self.h
        x, y, _ = h.robot_pose()
        for fl in getattr(h.b, "flights", []):
            if h.in_box((x, y), fl["box"]):
                return None
            for px, py in path[i:i + 14]:
                if h.in_box((px, py), fl["box"]) and math.hypot(px - x, py - y) < 1.2:
                    up = h.floor_z(*path[-1]) > h.floor_z(x, y) + 0.3 or (
                        math.dist((x, y), fl["bottom"]) < math.dist((x, y), fl["top"]))
                    return fl, up
        return None

    def stairs(self, fl, up, speed_up=0.6, speed_down=0.5):
        """Stair mode: line up at the foot (or the top), wait until nobody is near, then walk the flight straight and
        centred at a steady speed (the walking policy climbs at 0.6 m/s held straight; slower, it hesitates)."""
        h = self.h
        start, end = (fl["bottom"], fl["top"]) if up else (fl["top"], fl["bottom"])
        heading = fl["up_yaw"] if up else wrap(fl["up_yaw"] + math.pi)
        for o in HS.OBJECTS:                            # something left on the stairs: never climb over it
            if o != h.holding and h.in_box(h.obj_pos(o), fl["box"]):
                name = HS.OBJECTS[o][5][0]
                if h.holding is not None:
                    self.say("cant", why=f"there's a {name} on the stairs and my hook is full")
                    return False
                self.say(f"Someone left the {name} on the stairs. Moving it.")
                if not (self.pick(o) and self.goto(start, stop=0.3) and self.place("floor")):
                    self.say("cant", why=f"I couldn't clear the {name} off the stairs, so I won't climb them")
                    return False
        if not self.goto(start, face=heading, stop=0.15, speed=0.5, max_s=60.0) and math.dist(h.robot_pose()[:2], start) > 0.4:
            return False
        self.align(start, heading, tol=0.05)
        t0 = h.t
        while True:                                     # nobody on or at the stairs: the safety rules would slow it mid-flight
            near = self.people_near()
            if not near or near[0] > 2.6 or h.t - t0 > 25.0:
                break
            self.stand_still(0.5)
        self.log(f"  [{h.t:6.1f} s] (stairs: {'up' if up else 'down'})")
        ux, uy = math.cos(heading), math.sin(heading)
        length = math.dist(start, end)
        t0 = h.t
        while h.t - t0 < 20.0:
            x, y, yaw = h.robot_pose()
            along = (x - start[0]) * ux + (y - start[1]) * uy
            if along >= length:
                break
            side = -(x - start[0]) * uy + (y - start[1]) * ux          # left of the centre line: positive
            e = wrap(heading - yaw)
            v = speed_up if up else speed_down
            if self.step((v, max(-0.2, min(0.2, -1.0 * side)), max(-0.6, min(0.6, 2.0 * e)))):
                return False
        self.stand_still(0.4)
        x, y, _ = h.robot_pose()
        return math.dist((x, y), end) < 0.6

    def turn_to(self, face, tol=0.08, max_s=8.0):
        t0 = self.h.t
        while self.h.t - t0 < max_s:
            e = wrap(face - self.h.robot_pose()[2])
            if abs(e) < tol:
                break
            self.step((0.0, 0.0, max(-0.7, min(0.7, 1.6 * e))))
        self.stand_still(0.4)

    def align(self, xy, face, tol=0.04, max_s=12.0):
        """Shuffle onto a mark (forward/back, sideways, turning at small commands)."""
        h = self.h
        t0 = h.t
        while h.t - t0 < max_s:
            x, y, yaw = h.robot_pose()
            dx, dy = xy[0] - x, xy[1] - y
            ex = dx * math.cos(yaw) + dy * math.sin(yaw)
            ey = -dx * math.sin(yaw) + dy * math.cos(yaw)
            eh = wrap(face - yaw)
            if abs(ex) < tol and abs(ey) < tol and abs(eh) < 0.06:
                break

            def mag(v, lo, hi):
                return 0.0 if abs(v) < tol * 0.6 else math.copysign(min(hi, max(lo, abs(v))), v)
            self.step((mag(1.2 * ex, 0.15, 0.3), mag(1.2 * ey, 0.15, 0.25),
                       0.0 if abs(eh) < 0.04 else math.copysign(min(0.4, max(0.22, abs(1.5 * eh))), eh)))
        self.stand_still(0.8)
        x, y, _ = h.robot_pose()
        return math.dist((x, y), xy) < 2.5 * tol

    def stand_point(self, target_xy, fwd, right, min_clear=0.17, low=False):
        """Where to stand (and which way to face) so that target_xy is fwd ahead and right to the right: the reachable,
        clear candidate with the shortest walk. low: a crouching reach - same floor level as the target, and both feet
        on the same level if at all possible (one foot on a rug's edge tipped crouches over)."""
        h = self.h
        x, y, _ = h.robot_pose()
        best = None
        occ = h.occ_now()
        from scipy.ndimage import distance_transform_edt
        clr = distance_transform_edt(~occ) * HS.GRID
        for k in range(24):
            yaw = -math.pi + k * math.pi / 12
            sx = target_xy[0] - fwd * math.cos(yaw) - right * math.sin(yaw)
            sy = target_xy[1] - fwd * math.sin(yaw) + right * math.cos(yaw)
            i, j = int((sx - HS.MAP_X[0]) / HS.GRID), int((sy - HS.MAP_Y[0]) / HS.GRID)
            if not (0 <= j < clr.shape[0] and 0 <= i < clr.shape[1]) or clr[j, i] < min_clear:
                continue
            bx, by = sx - 0.14 * math.cos(yaw), sy - 0.14 * math.sin(yaw)     # the body behind the front needs room
            ib, jb = int((bx - HS.MAP_X[0]) / HS.GRID), int((by - HS.MAP_Y[0]) / HS.GRID)
            if not (0 <= jb < clr.shape[0] and 0 <= ib < clr.shape[1]) or clr[jb, ib] < 0.26:
                continue
            fz = h.floor_z(sx, sy)
            if low and abs(fz - h.floor_z(*target_xy)) > 0.05:
                continue                                  # do not reach across a step for something on the floor
            if any(math.dist((sx, sy), h.person_xy(n)) < 1.4 for n in h.b.people):
                continue                                  # never work right next to someone
            score = math.hypot(sx - x, sy - y) - 2.0 * min(clr[j, i], 0.5)
            if low:                                       # feet (and toes, heels) all on one level
                pts = [(sx + a * math.cos(yaw) + b * math.sin(yaw), sy + a * math.sin(yaw) - b * math.cos(yaw))
                       for a in (-0.12, 0.12) for b in (-0.12, 0.12)]
                if max(abs(h.floor_z(*p) - fz) for p in pts) > 0.005:
                    score += 3.0
            if best is None or score < best[0]:
                best = (score, (sx, sy), yaw)
        return None if best is None else (best[1], best[2])

    # ================================================================== places
    def resolve_place(self, name):
        """A room, furniture, chair or person name -> (goal xy, face or None, label, person or None)."""
        h = self.h
        if name in ("you", "me"):
            return h.person_xy("you"), None, "you", "you"
        if name in h.b.people:
            return h.person_xy(name), None, name.capitalize(), name
        if name == "stairs" and getattr(h.b, "flights", None):     # the nearer end of the flight, not its middle
            fl = h.b.flights[0]
            x, y, _ = h.robot_pose()
            up = h.floor_z(x, y) > h.floor_z(*fl["bottom"]) + 0.3
            end = fl["top"] if up else fl["bottom"]
            return end, (fl["up_yaw"] + (math.pi if up else 0.0)), "the stairs", None
        if name in h.b.rooms:
            return h.b.rooms[name]["centre"], None, name, None
        if name in h.b.chairs:
            c = h.b.chairs[name]
            f = c["face"]
            return (c["xy"][0] + 0.85 * math.cos(f), c["xy"][1] + 0.85 * math.sin(f)), f + math.pi, name, None
        if name in h.b.furniture:
            f = h.b.furniture[name]
            st = self.stand_point(f["xy"], min(f["size"]) / 2 + 0.45, 0.0, min_clear=0.3)
            if st is None:
                return f["xy"], None, name, None
            return st[0], st[1], name, None
        return None

    def go(self, name, speed=0.7):
        r = self.resolve_place(name)
        if r is None:
            self.say("cant", why=f"I don't know where '{name}' is")
            return False
        goal, face, label, person = r
        if person is not None:
            self.say("Coming." if person == "you" else f"Going to {label}.")
            spot = self.spot_near_person(person)
            if spot is None:
                self.say("cant", why=f"there's no clear spot near {label}")
                return False
            ok = self.goto(spot, stop=0.15, speed=min(speed, 0.6), target_person=person)
            px, py = self.h.person_xy(person)
            x, y, _ = self.h.robot_pose()
            gap = math.hypot(px - x, py - y)
            if gap < 2.3:                                # close enough to talk to, or hand something over
                self.turn_to(math.atan2(py - y, px - x))
                return True
            return ok
        self.say("go", place=label)
        if name in self.h.b.rooms and name != "stairs":
            goal = self.clear_of_people(goal, self.h.b.rooms[name]["box"])
        ok = self.goto(goal, face=face, speed=speed)
        if ok:
            self.say("arrive", place=label)
        else:
            self.say("cant", why=f"I couldn't get to the {label}")
        return ok

    def clear_of_people(self, goal, box, gap=1.7):
        """The goal, or if someone is standing near it, the nearest free point in the room at least 1.7 m from people."""
        h = self.h
        if all(math.dist(goal, h.person_xy(n)) >= gap for n in h.b.people):
            return goal
        x0, x1, y0, y1 = box
        for r in np.arange(0.3, 3.01, 0.3):
            for k in range(16):
                a = k * math.pi / 8
                sx, sy = goal[0] + r * math.cos(a), goal[1] + r * math.sin(a)
                if x0 + 0.3 < sx < x1 - 0.3 and y0 + 0.3 < sy < y1 - 0.3 and not h.occupied(sx, sy, 0.4) \
                        and all(math.dist((sx, sy), h.person_xy(n)) >= gap for n in h.b.people):
                    return (sx, sy)
        return goal

    def spot_near_person(self, person, r0=1.6):
        """A free floor point about 1.6 m from the person (never closer than 1.5 m), the one nearest the robot."""
        h = self.h
        px, py = h.person_xy(person)
        x, y, _ = h.robot_pose()
        best = None
        for r in (r0, r0 + 0.3, r0 + 0.6):
            for k in range(24):
                a = k * math.pi / 12
                sx, sy = px + r * math.cos(a), py + r * math.sin(a)
                if h.occupied(sx, sy, 0.35) or abs(h.floor_z(sx, sy) - h.floor_z(px, py)) > 0.05:
                    continue
                if any(math.dist((sx, sy), h.person_xy(n)) < 1.5 for n in h.b.people):
                    continue
                d = math.hypot(sx - x, sy - y)
                if best is None or d < best[0]:
                    best = (d, (sx, sy))
            if best:
                return best[1]
        return None

    # ================================================================== looking and searching
    def look_around(self, report=True):
        """Turn a full circle on the spot, looking."""
        x, y, yaw0 = self.h.robot_pose()
        for k in range(1, 7):
            self.turn_to(wrap(yaw0 + k * math.pi / 3), tol=0.15)
        if report:
            seen = sorted({HS.OBJECTS[n][5][0] for n, mem in self.memory.items()
                           if mem["room"] == self.h.room_of(x, y)})
            people = [p for p in self.seen_now() if p[0].isupper() or p == "you"]
            things = seen + people
            self.say("look", seen=", ".join(things)) if things else self.say("see_none")

    def find(self, obj):
        """Make sure obj is in memory: if not, search the likely rooms (where it belongs first)."""
        if obj in self.memory:
            return True
        home = HS.OBJECTS[obj][6]
        home_room = None
        b = self.h.b
        if home in b.furniture:
            home_room = self.h.room_of(*b.furniture[home]["xy"])
        elif home in b.containers:                      # toys belong in the toy box, clothes in the hamper, ...
            x0, x1, y0, y1 = b.containers[home]["box"]
            home_room = self.h.room_of((x0 + x1) / 2, (y0 + y1) / 2)
        if home in b.rooms:
            home_room = home
        x, y, _ = self.h.robot_pose()
        here = self.h.room_of(x, y)
        # where it belongs first, then the room it is in, then the nearest; never the stairs (a flight is not a room to
        # stand in the middle of - going to its centre walked up and down it) or the garden
        z_here = self.h.floor_z(x, y)
        rooms = sorted((r for r in b.rooms if r not in ("garden", "stairs")),     # another floor is a flight away
                       key=lambda r: (r != home_room, r != here, math.dist((x, y), b.rooms[r]["centre"])
                                      + (8.0 if abs(self.h.floor_z(*b.rooms[r]["centre"]) - z_here) > 0.5 else 0.0)
                                      + (6.0 if r in ("patio", "porch") else 0.0)))     # indoor things: indoors first
        for r in rooms:
            self.say("search", obj=HS.OBJECTS[obj][5][0], room=r)
            if not self.goto(self.h.b.rooms[r]["centre"], speed=0.7):
                continue
            if obj in self.memory:
                break
            self.look_around(report=False)
            if obj in self.memory:
                break
        if obj in self.memory:
            self.say("found", obj=HS.OBJECTS[obj][5][0], room=self.memory[obj]["room"])
            return True
        return False

    # ================================================================== manipulation
    CROUCH = KM.CROUCH                          # handle height above the floor -> crouch pose (per robot)
    TUCK = [0.0, -0.3, -0.2, -0.4]
    GATE = dict(lo=-0.015, hi=0.085, gain=getattr(KM, "GATE_GAIN", 1.0))   # balance window for the crouch (narrower and
    #                                                     wider both fail sometimes); a faster correction on the H2-X

    def reach_offset(self, handle_rel, low):
        """(ahead, right) of the robot where a handle this high above the floor should be, for the hook to take it.
        KESTREL's arm swings in a plane 20 cm right of its centre, so fixed numbers do. The H2-X's shoulder pitch axis is
        tilted, so its hook moves sideways as the arm reaches (about -9 to +19 cm): sweep its arm in the pose it will be
        in (standing, or the crouch for this height) and stand where the hook reaches that height well inside its range."""
        if not getattr(KM, "REACH_SOLVE", False):
            return (KM.CROUCH_FWD if low else REACH_FWD), REACH_RIGHT
        key = (round(handle_rel, 2), bool(low))
        cache = self.__dict__.setdefault("_reach_cache", {})
        if key in cache:
            return cache[key]
        import mujoco
        w = self.h
        m = w.e.m
        z, tp = next(pose for lim, pose in self.CROUCH if handle_rel >= lim) if low else (KM.STAND_HIP - 0.03, 0.0)
        legs = w.leg_pose(w.solve_pose(z, tp, 0.03)[0])
        stand = w.leg_pose(w.solve_pose(KM.STAND_HIP - 0.03, 0.0, 0.04)[0])
        dd = mujoco.MjData(m)
        hand, lf, rf, pel = m.body("r_hand").id, m.body("l_foot").id, m.body("r_foot").id, w.pelvis

        def place(L, pitch):
            dd.qpos[:] = 0
            dd.qpos[2] = 1.0
            dd.qpos[3:7] = [math.cos(pitch / 2), 0, math.sin(pitch / 2), 0]
            for j, i in SK.LEG.items():
                dd.qpos[m.joint(j).qposadr[0]] = L[i]
        place(stand, 0.0)
        mujoco.mj_kinematics(m, dd)
        pel_dx = dd.xpos[pel][0] - 0.5 * (dd.xpos[lf][0] + dd.xpos[rf][0])   # standing pelvis ahead of the ankles
        pts = []
        for sh in np.linspace(-2.6, 0.4, 61):
            for el in np.linspace(-2.1, 0.0, 43):
                place(legs, tp)
                for a, v in zip(w.arm_qadr, [0.0, sh, -0.2, el]):
                    dd.qpos[a] = v
                mujoco.mj_kinematics(m, dd)
                mid = 0.5 * (dd.xpos[lf] + dd.xpos[rf])
                hk = dd.xpos[hand] + dd.xmat[hand].reshape(3, 3) @ np.array(SK.HOOK)
                sole = mid[2] - 0.062
                pts.append((hk[0] - mid[0] - pel_dx, mid[1] - hk[1], hk[2] - sole))
        P = np.array(pts)
        sel = P[np.abs(P[:, 2] - handle_rel) < 0.02]
        if not len(sel):                                   # out of this pose's range: the old numbers, and the IK will say
            out = (KM.CROUCH_FWD if low else REACH_FWD), REACH_RIGHT
        else:
            fwd = max(0.15, min(sel[:, 0].max() - 0.07, 0.55))   # well inside the range, but clear of the furniture
            best = sel[np.abs(sel[:, 0] - fwd).argmin()]
            out = (float(best[0]), float(best[1]))
        cache[key] = out
        return out

    def crouch_to(self, handle_rel):
        """Balanced crouch deep enough for a handle this high above the floor (lowest reach 0.34 m: the ankles and hips
        are at their limits). The legs stay stiff and balanced afterwards, for the reach."""
        w = self.h
        z, tp = next((pose for lim, pose in self.CROUCH if handle_rel >= lim), self.CROUCH[-1][1])
        if not w.settle():
            return False
        # slowly, weight kept a little forward: a fast crouch pushes the feet backwards, and on tiles they slide
        dip = [(2.0, KM.STAND_HIP - 0.11, 0.20, 0.035)] if z < KM.STAND_HIP - 0.11 else []   # standing reaches: no dip
        legs = [(0.0, w.legs_now())] + w._pose_path(dip + [(4.0, z, tp, 0.03)])
        arms = [(0.0, w.arms_now()), (1.2, self.TUCK)]
        self._crouch_pose = legs[-1][1]
        return w._run_balanced(legs + [(4.5, legs[-1][1])], arms, 4.5, gate_from=0.0, max_s=14.0, release_stiff=False,
                               **self.GATE)

    def crouched_arms(self, arms_kf, secs):
        """Move the arm while crouched, with the balance controller still adjusting hips and ankles (the arm's weight
        moves the centre of mass forward)."""
        pose = self._crouch_pose
        return self.h._run_balanced([(0.0, pose), (secs, pose)], arms_kf, secs, gate_from=0.0, max_s=secs + 5.0,
                                    release_stiff=False, **self.GATE)

    def rise(self):
        w = self.h
        legs = [(0.0, w.legs_now())] + w._pose_path([(1.6, KM.STAND_HIP - 0.15, 0.25, 0.04), (2.8, KM.STAND_HIP - 0.03, 0.0, 0.04)])
        legs.append((3.4, w.e.default.copy()))
        arms = [(0.0, w.arms_now()), (3.4, self.arms)]
        return w._run_balanced(legs, arms, 3.4, gate_from=0.0, lo=0.0, hi=0.08, max_s=12.0)

    def pick(self, obj):
        """Find the object, walk up to it, hook its handle, lift it."""
        h = self.h
        name = HS.OBJECTS[obj][5][0]
        if h.holding is not None:
            self.say("cant", why=f"I'm already holding the {HS.OBJECTS[h.holding][5][0]}")
            return False
        if not self.find(obj):
            self.say("cant", why=f"I searched and couldn't find the {name}")
            return False
        why = "I couldn't get to it"
        for attempt in range(3):                       # a third try: a shove mid-reach is no reason to give up
            hd = h.handle_of(obj)
            rel = hd[2] - h.floor_z(*hd[:2])
            low = rel < LOW_HANDLE
            fwd, right = self.reach_offset(rel, low)            # crouched, the hook reaches less far ahead
            st = self.stand_point(hd[:2], fwd, right, low=low)
            if st is None and not low and rel > 0.95:           # high up (the back of a worktop): the arm reaches further
                for extra in (0.06, 0.12):
                    st = self.stand_point(hd[:2], fwd + extra, right)
                    if st is not None:
                        fwd += extra
                        break
            if st is None:
                self.say("pick_fail", obj=name, why="there's nowhere to stand next to it")
                return False
            (sx, sy), yaw = st
            if not self.goto((sx, sy), face=yaw, stop=0.15, speed=0.6):
                continue
            hd = h.handle_of(obj)
            # final placement relative to the handle as it is now
            sx = hd[0] - fwd * math.cos(yaw) - right * math.sin(yaw)
            sy = hd[1] - fwd * math.sin(yaw) + right * math.cos(yaw)
            self.align((sx, sy), yaw, tol=0.035)
            if not low:
                self.square_up(h.handle_of(obj)[:2])        # the handle in the arm's plane (it cannot reach sideways)
            ok, why = self._hook(obj)
            if ok:
                self.say("picked", obj=name)
                return True
            self.log(f"  [{h.t:6.1f} s] (pick attempt {attempt + 1}: {why})")
            if h.holding is None:
                self.arms = list(REST_ARMS)
                self.stand_still(1.0)
        self.say("pick_fail", obj=name, why=why)
        return False

    def _hook(self, obj):
        h = self.h
        hd = h.handle_of(obj)
        rel = hd[2] - h.floor_under(*h.robot_pose()[:2])
        low = rel < LOW_HANDLE
        if low and not self.crouch_to(rel):
            h.stiff(False)
            return False, "lost balance crouching"
        hd = h.handle_of(obj)
        cur = h.arms_now()
        sh0, el0, e0 = h.ik_right(hd + [0, 0, 0.07])
        sh1, el1, e1 = h.ik_right(hd + [0, 0, 0.02])            # just above the bar: pushing into it pressed the object
        #                                                       into the surface under it, and the simulation blew up
        if e1 > 0.06:
            if low:
                self.rise()
            return False, f"the handle is out of reach ({e1:.2f} m off)"
        plan = [(0.0, cur), (1.4, [0.0, sh0, -0.2, el0]), (2.3, [0.0, sh1, -0.2, el1])]
        if low:
            if not self.crouched_arms(plan, 2.5):
                h.stiff(False)
                return False, "lost balance reaching"
        else:
            # standing: lift the hook close to the body first, then out over the handle, then down onto it. Swung
            # straight there, the arm's arc passed just above the worktop and hit the side of whatever stood on it
            # (a kettle at the back of the drip tray was wedged against the counter, and the simulation blew up)
            above = [cur[0], sh0, cur[2], el0]
            path = self.arm_path(above, target=obj, target_xy=hd[:2])
            if path is None:                               # boxed in: the old straight swing
                path = [(0.0, cur), (1.4, above)]
            tt = path[-1][0]
            plan = path + [(tt + 0.8, [cur[0], sh1, cur[2], el1])]
            for k in range(int((tt + 1.1) / E.DT)):
                self.arms = list(SK.keyframes(plan, k * E.DT))
                self.step()
        gap = float(np.linalg.norm(h.hook_world() - h.handle_of(obj)))
        if gap > 0.07:
            if low:
                self.arms = list(REST_ARMS)
                self.rise()
            return False, f"the hook missed the handle by {gap:.2f} m"
        d = h.e.d[0]
        b = h.obj_body[obj]
        self._attach(obj)
        z0 = d.xpos[b][2]
        sh2, el2, _ = h.ik_right(hd + [0, 0, 0.20])             # straight up first, well clear of the surface
        lift = [(0.0, [0.0, sh1, -0.2, el1]), (1.0, [0.0, sh2, -0.2, el2])]
        if low:
            self.crouched_arms(lift, 1.2)
        else:
            for k in range(int(1.2 / E.DT)):
                self.arms = list(SK.keyframes(lift, k * E.DT))
                self.step()
        if d.xpos[b][2] < z0 + 0.05:
            self.release()
            if low:
                self.arms = list(REST_ARMS)
                self.rise()
            return False, "it didn't come up with the hook"
        self.arms = [0.0, sh2, -0.2, el2]
        if low:
            if not self.rise():
                return False, "lost balance standing up"
        else:
            self.back_off(0.35)                                 # step back from the surface, then lower to carry
        carry = [(0.0, h.arms_now()), (1.2, CARRY_ARMS)]
        for k in range(int(1.3 / E.DT)):
            self.arms = list(SK.keyframes(carry, k * E.DT))
            self.step()
        self.arms = list(CARRY_ARMS)
        return True, "lifted"

    def arm_path(self, goal, target=None, target_xy=None, speed=1.4):
        """Keyframes taking the right arm from where it is to `goal` (arm angles) without the hook, wrist, elbow or a
        held load dipping into whatever is under them - a worktop, a table, the things standing on them. A grid search
        over shoulder and elbow angles (0.1 rad), with clearance checked by casting a ray straight down from each point.
        Near target_xy (a handle being reached for) the target object itself doesn't count. None if there is no way."""
        import heapq
        import mujoco
        h = self.h
        m, d = h.e.m, h.e.d[0]
        dd = mujoco.MjData(m)
        dd.qpos[:] = d.qpos
        qs, qe = h.arm_qadr[1], h.arm_qadr[3]
        b_fore, b_wrist, b_hand = m.body("r_forearm").id, m.body("r_wrist").id, m.body("r_hand").id
        skip = set(h.robot_bodies)
        drop = 0.0
        if h.holding is not None:
            hb = h.obj_body[h.holding]
            skip.add(hb)
            drop = float(h.hook_world()[2] - (h.obj_pos(h.holding)[2] - HS.OBJECTS[h.holding][1][-1]))
        tb = h.obj_body[target] if target is not None else None
        gid = np.zeros(1, np.int32)
        down = np.array([0.0, 0.0, -1.0])

        def below(p, skip_b):
            start = np.array([p[0], p[1], p[2] + 0.08])
            for _ in range(8):
                dist = mujoco.mj_ray(m, d, start, down, None, 1, -1, gid)
                if dist < 0:
                    return -9.0
                g = int(gid[0])
                hit = start[2] - dist
                if (m.geom_bodyid[g] in skip_b) or (m.geom_contype[g] == 0 and m.geom_conaffinity[g] == 0):
                    start = np.array([p[0], p[1], hit - 1e-4])
                    continue
                return hit
            return -9.0

        memo = {}

        def clear(i, j):
            if (i, j) in memo:
                return memo[(i, j)]
            dd.qpos[qs], dd.qpos[qe] = SH[i], EL[j]
            mujoco.mj_kinematics(m, dd)
            hook = dd.xpos[b_hand] + dd.xmat[b_hand].reshape(3, 3) @ np.array(SK.HOOK)
            sk = skip | ({tb} if tb is not None and target_xy is not None
                         and math.hypot(hook[0] - target_xy[0], hook[1] - target_xy[1]) < 0.12 else set())
            pts = [hook, dd.xpos[b_wrist], dd.xpos[b_fore], 0.5 * (hook + dd.xpos[b_fore])]
            if drop > 0:
                pts.append(hook - [0, 0, drop])
            ok = all(p[2] > below(p, sk) + 0.025 for p in pts)
            memo[(i, j)] = ok
            return ok

        SH, EL = np.round(np.arange(-2.6, 0.41, 0.1), 3), np.round(np.arange(-2.1, 0.01, 0.1), 3)
        cur = h.arms_now()
        near = lambda v, grid: int(np.argmin(np.abs(grid - v)))          # noqa: E731
        a, z = (near(cur[1], SH), near(cur[3], EL)), (near(goal[1], SH), near(goal[3], EL))
        dist = {a: 0.0}
        prev = {}
        pq = [(0.0, a)]
        while pq:
            c, n = heapq.heappop(pq)
            if n == z:
                break
            if c > dist.get(n, 1e9):
                continue
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    q = (n[0] + di, n[1] + dj)
                    if (di, dj) == (0, 0) or not (0 <= q[0] < len(SH) and 0 <= q[1] < len(EL)):
                        continue
                    if q != z and not clear(*q):
                        continue
                    nc = c + math.hypot(di, dj) * 0.1
                    if nc < dist.get(q, 1e9):
                        dist[q], prev[q] = nc, n
                        heapq.heappush(pq, (nc, q))
        if z not in dist:
            return None
        path = [z]
        while path[-1] != a:
            path.append(prev[path[-1]])
        path = path[::-1]
        # shortcut: keep a waypoint only where the straight line from the last kept one would not be clear
        keep = [path[0]]
        k = 0
        while k < len(path) - 1:
            j = len(path) - 1
            while j > k + 1:
                n0, n1 = path[k], path[j]
                steps = max(abs(n1[0] - n0[0]), abs(n1[1] - n0[1]))
                if all(clear(round(n0[0] + (n1[0] - n0[0]) * s / steps), round(n0[1] + (n1[1] - n0[1]) * s / steps))
                       or (round(n0[0] + (n1[0] - n0[0]) * s / steps), round(n0[1] + (n1[1] - n0[1]) * s / steps)) == z
                       for s in range(1, steps)):
                    break
                j -= 1
            keep.append(path[j])
            k = j
        pts = [list(cur)] + [[cur[0], SH[i], cur[2], EL[j]] for i, j in keep[1:-1]] + [list(goal)]
        kf, t = [(0.0, pts[0])], 0.0
        for p0, p1 in zip(pts, pts[1:]):
            t += max(0.3, math.hypot(p1[1] - p0[1], p1[3] - p0[3]) / speed)
            kf.append((t, p1))
        return kf

    def _attach(self, obj):
        """The hook holds obj by its handle from now on (a weld at the hook, where the handle is now)."""
        import mujoco
        h = self.h
        m, d = h.e.m, h.e.d[0]
        b = h.obj_body[obj]
        eq = h.obj_eq[obj]
        R = d.xmat[b].reshape(3, 3)
        if m.eq_type[eq] == mujoco.mjtEq.mjEQ_WELD:          # hold it as it is now: anchor at the hook, the current pose
            hb = m.eq_obj1id[eq]
            R1 = d.xmat[hb].reshape(3, 3)
            q1inv = np.zeros(4)
            mujoco.mju_negQuat(q1inv, d.xquat[hb])
            rq = np.zeros(4)
            mujoco.mju_mulQuat(rq, q1inv, d.xquat[b])
            hook = h.hook_world()
            m.eq_data[eq, 0:3] = R.T @ (hook - d.xpos[b])        # the hold point in the object's frame
            m.eq_data[eq, 3:6] = R1.T @ (hook - d.xpos[hb])      # ... and in the hand's (MuJoCo 4 weld data layout)
            m.eq_data[eq, 6:10] = rq
            m.eq_data[eq, 10] = 0.05                           # turning held softly: a rigid grip made a brush pressed on
            #                                                    a surface kick itself away instead of rubbing
        else:
            m.eq_data[eq, 3:6] = R.T @ (h.hook_world() - d.xpos[b])
        d.eq_active[eq] = 1
        h.holding = obj

    # ------------------------------------------------------------- the body's low-level moves (for the agent to compose)
    def move_hand(self, ahead, up, secs=1.5):
        """Move the hook to a point: `ahead` m in front of the body's centre and `up` m above the floor it stands on.
        The right arm swings in a plane 0.2 m to the right of the body's centre, so that is where the point is.
        Returns (how far the hook ended from the point in m, the hook's position)."""
        h = self.h
        x, y, yaw = h.robot_pose()
        tgt = np.array([x + ahead * math.cos(yaw) + REACH_RIGHT * math.sin(yaw),
                        y + ahead * math.sin(yaw) - REACH_RIGHT * math.cos(yaw), h.floor_under(x, y) + up])
        sh, el, _ = h.ik_right(tgt)
        cur = h.arms_now()
        goal = [cur[0], sh, cur[2], el]
        kf = [(0.0, cur), (max(0.5, secs), goal)]
        if getattr(self, "crouched", False):
            if not self.crouched_arms(kf, max(0.5, secs)):
                h.stiff(False)
                self.crouched = False
                return 9.9, h.hook_world()
        else:
            for k in range(int(max(0.5, secs) / E.DT) + 10):
                self.arms = list(SK.keyframes(kf, k * E.DT))
                self.step()
        self.arms = goal
        return float(np.linalg.norm(h.hook_world() - tgt)), h.hook_world()

    def grip(self):
        """Hook whatever handle is at the hook now (within 7 cm). Returns (ok, what happened)."""
        h = self.h
        if h.holding is not None:
            return False, f"already holding the {HS.OBJECTS[h.holding][5][0]}"
        hook = h.hook_world()
        dist = {o: float(np.linalg.norm(h.handle_of(o) - hook)) for o in HS.OBJECTS}
        o = min(dist, key=dist.get)
        if dist[o] > 0.07:
            return False, f"no handle at the hook (nearest: the {HS.OBJECTS[o][5][0]}'s, {dist[o]:.2f} m away)"
        self._attach(o)
        return True, f"hooked the {HS.OBJECTS[o][5][0]}"

    def let_go(self):
        """Unhook what it holds, where it is; report where it came to rest."""
        h = self.h
        o = h.holding
        if o is None:
            return False, "holding nothing"
        self.release()
        self.stand_still(1.2)
        p = h.obj_pos(o)
        where = next((c for c in h.b.containers if h.in_container(o, c)), None)
        if where is None:
            where = next((n for n, f in h.b.furniture.items() if abs(p[0] - f["xy"][0]) < f["size"][0] / 2
                          and abs(p[1] - f["xy"][1]) < f["size"][1] / 2 and abs(p[2] - f["top"] - HS.OBJECTS[o][1][-1]) < 0.06),
                         None)
        on = f"in the {where}" if where in h.b.containers else f"on the {where}" if where else (
            "on the floor" if p[2] - h.floor_z(*p[:2]) < 0.15 else f"at {p[2] - h.floor_z(*p[:2]):.2f} m above the floor")
        return True, f"let go of the {HS.OBJECTS[o][5][0]}; it is {on}"

    def crouch(self, reach_height):
        """Crouch, balanced, deep enough to reach something reach_height m above the floor (0.34 is the lowest)."""
        if getattr(self, "crouched", False):
            self.rise()
        ok = self.crouch_to(max(0.34, float(reach_height)))
        self.crouched = bool(ok)
        if not ok:
            self.h.stiff(False)
        return ok

    def stand_tall(self):
        ok = self.rise() if getattr(self, "crouched", False) else True
        self.crouched = False
        return ok

    def shuffle(self, forward, left, turn_deg):
        """A small body move: up to 0.6 m forward/back and sideways, and a turn, onto a mark relative to here."""
        h = self.h
        x, y, yaw = h.robot_pose()
        fwd, lft = max(-0.6, min(0.6, forward)), max(-0.6, min(0.6, left))
        mark = (x + fwd * math.cos(yaw) - lft * math.sin(yaw), y + fwd * math.sin(yaw) + lft * math.cos(yaw))
        return self.align(mark, wrap(yaw + math.radians(turn_deg)), tol=0.04, max_s=12.0)

    def use(self, target):
        """Use what it holds on something: bring it there and do what such a thing is for - rub it back and forth
        (anything held is rubbed: whether that cleans depends on the thing), spray, or slide it under and lift.
        What happens is the house's business (world.py): this only does the motion. Returns (ok, what happened)."""
        import world as WR
        h = self.h
        tool = h.holding
        if tool is None:
            return False, "holding nothing to use"
        props = WR.TOOLS.get(tool, set())
        words = {w: n for n, o in HS.OBJECTS.items() for w in o[5]}
        target = words.get(target, target)
        W = h.world
        if target in WR.SURFACES or target in h.b.rooms:      # a surface (or a room): its nearest grimy patch first
            on = [k for k in range(WR.N_GRIME) if W.grime[k] > 0.08 and (W.grime_on[k] == target or
                                                                         WR.SURFACE_ROOM.get(W.grime_on[k]) == target)]
            x, y, _ = h.robot_pose()
            if on:
                k = min(on, key=lambda k: math.dist((x, y), W.grime_xyz[k][:2]))
                xy, z_top = tuple(W.grime_xyz[k][:2]), float(W.grime_xyz[k][2]) - 0.002
            elif target in WR.SURFACES:
                x0, x1, y0, y1, z = WR.SURFACES[target]
                xy, z_top = ((x0 + x1) / 2, (y0 + y1) / 2), HS.Z0 + z
            else:
                return False, f"nothing grimy in the {target}"
        elif target in h.b.furniture:
            f = h.b.furniture[target]
            xy, z_top = f["xy"], f["top"]
        elif target in HS.OBJECTS:
            p = h.obj_pos(target)
            xy, z_top = (p[0], p[1]), p[2] + HS.OBJECTS[target][1][-1]
        else:
            return False, f"I don't know what '{target}' is"
        clear = 0.03 if "sprays" in props else 0.0
        if "flips" in props and target in HS.OBJECTS:          # beside the middle, clear of the carry bar over it
            x, y, _ = h.robot_pose()
            d = np.array([x - xy[0], y - xy[1]])
            d /= max(1e-6, np.linalg.norm(d))
            xy = (xy[0] + 0.09 * d[0], xy[1] + 0.09 * d[1])
        if not self.hold_over(xy, z_top, secs=0.6, clear=clear, near_ok=0.12):
            return False, f"couldn't bring the {HS.OBJECTS[tool][5][0]} to the {target}"
        anchor = h.robot_pose()
        x, y, yaw = anchor
        hook = h.hook_world()
        if "sprays" in props or "flips" in props:
            if "flips" in props:                            # slide under, then lift
                low_hook = hook + [0, 0, -0.01]                 # (deeper pressed light things off the top)
                high_hook = hook + [0, 0, 0.08]
                for tgt, secs in ((low_hook, 0.6), (high_hook, 0.8)):
                    sh, el, _ = h.ik_right(tgt)
                    kf = [(0.0, h.arms_now()), (secs, [0.0, sh, -0.2, el])]
                    for k in range(int((secs + 0.2) / E.DT)):
                        self.arms = list(SK.keyframes(kf, k * E.DT))
                        self.hold_step(anchor)
                result = W.use(tool, xy, z_top)
            else:
                result = W.use(tool, xy, z_top)
        else:                                               # rub it back and forth along the arm's swing
            fwd = np.array([math.cos(yaw), math.sin(yaw), 0.0])
            pts = [hook + 0.07 * fwd + [0, 0, -0.008], hook - 0.07 * fwd + [0, 0, -0.008]]
            sols = [h.ik_right(p)[:2] for p in pts]
            before = W.grime.copy()
            for k in range(int(5.0 / E.DT)):
                ph = (k * E.DT / 0.5) % 2.0                     # 0.5 s each way
                a, b = (sols[0], sols[1]) if ph < 1.0 else (sols[1], sols[0])
                f = ph % 1.0
                self.arms = [0.0, a[0] + (b[0] - a[0]) * f, -0.2, a[1] + (b[1] - a[1]) * f]
                self.hold_step(anchor)
            gone = int(((before > 0.08) & (W.grime <= 0.08)).sum())
            less = float((before - W.grime).clip(0).sum())
            result = (f"rubbed it back and forth for 5 s: {gone} patch(es) came clean" if gone else
                      "rubbed it back and forth for 5 s: the grime is fading" if less > 0.05 else
                      "rubbed it back and forth for 5 s: nothing changed")
        self.retract()
        return True, result

    def back_off(self, dist, max_s=5.0):
        x0, y0, yaw = self.h.robot_pose()
        t0 = self.h.t
        behind = [self.h.floor_z(x0 - k * math.cos(yaw), y0 - k * math.sin(yaw)) for k in (0.2, 0.35, dist + 0.15)]
        if max(abs(z - self.h.floor_z(x0, y0)) for z in behind) > 0.03:     # a step behind: never reverse off it
            for _ in range(int(1.5 / E.DT)):
                self.step((0.0, 0.0, 0.5))                                   # turn a little instead
            self.stand_still(0.3)
            return
        while self.h.t - t0 < max_s and math.dist((x0, y0), self.h.robot_pose()[:2]) < dist:
            self.step((-0.22, 0.0, 0.0))
        self.stand_still(0.5)

    def release(self):
        h = self.h
        if h.holding is None:
            return
        h.e.d[0].eq_active[h.obj_eq[h.holding]] = 0
        h.holding = None

    def place(self, where):
        """Put what it holds on a surface (furniture name), in a room, on the floor here ('floor'), or hand it to a
        person. High surfaces: raise the load, step up, lower it on, unhook. Low ones (coffee table, floor): crouch."""
        h = self.h
        if h.holding is None:
            self.say("cant", why="I'm not holding anything")
            return False
        obj = h.holding
        name = HS.OBJECTS[obj][5][0]
        half_h, hz = HS.OBJECTS[obj][1][-1], HS.OBJECTS[obj][4]
        if where in ("you", "me") or where in h.b.people:
            return self.hand_over("you" if where == "me" else where)
        if where in h.b.containers:                     # a bin, the toy box, the hamper: drop it in
            return self.drop_into(where)
        if where in h.b.rooms:                          # a room: its first surface, else its floor
            surf = [n for n, f in h.b.furniture.items() if h.room_of(*f["xy"]) == where and f["top"] - h.floor_z(*f["xy"]) > 0.4]
            if not surf:
                if not self.goto(h.b.rooms[where]["centre"]):
                    return False
                return self.place("floor")
            where = surf[0]

        def reach_point(fwd, right=REACH_RIGHT):
            x, y, yaw = h.robot_pose()
            return (x + fwd * math.cos(yaw) + right * math.sin(yaw), y + fwd * math.sin(yaw) - right * math.cos(yaw))
        if where == "floor":                         # standing: the hook as low as it goes 0.32 m ahead, then let go -
            fwd, right = 0.32, REACH_RIGHT            # a short drop. A crouch to set things down tipped the robot over
            target = reach_point(fwd, right)
            top, label, low = h.floor_z(*target), "floor", False
        else:
            f = h.b.furniture.get(where)
            if f is None:
                self.say("cant", why=f"I don't know a '{where}'")
                return False
            top, label = f["top"], where
            low = top + half_h + hz - h.floor_z(*f["xy"]) < LOW_HANDLE
            fwd, right = self.reach_offset(top + half_h + hz - h.floor_z(*f["xy"]), low)
            best = None
            fx, fy = f["xy"]
            fsx, fsy = f["size"]
            x0, y0, _ = h.robot_pose()
            small = max(fsx, fsy) <= 0.7                 # a small spot (sink, hob, trivet): its middle, nothing else
            spot = (fx, fy)
            for inset in ((0.0,) if small else (0.18, 0.12)):   # points well inside the top, all round it: the nearest reachable
                if small:                                # set back from the worktop edge: reach a little further
                    for extra in (0.0, 0.06, 0.12):
                        st = self.stand_point((fx, fy), fwd + extra, right, low=low)
                        if st is not None:
                            best, fwd = st, fwd + extra
                            break
                    break
                rad0 = max(0.06, HS.OBJECTS[obj][1][0] * (1.0 if HS.OBJECTS[obj][0] != "box" else 0.7) + 0.01)
                inset = max(inset, rad0 + 0.06)              # the whole object on the top (and room to miss by a few cm)
                cands = [self._nearest_inside(f, inset)]
                for u in np.linspace(-1, 1, 5):
                    for v in (-1, 1):
                        cands += [(fx + u * (fsx / 2 - inset), fy + v * (fsy / 2 - inset)),
                                  (fx + v * (fsx / 2 - inset), fy + u * (fsy / 2 - inset))]
                others = [h.obj_pos(o)[:2] for o in HS.OBJECTS if o != obj]
                cands = [c for c in cands if all(math.dist(c, q) > 0.25 for q in others)]     # a clear spot on the top
                scored = []
                for c in cands:
                    st = self.stand_point(c, fwd, right, low=low)
                    if st is not None:
                        scored.append((math.dist(st[0], (x0, y0)), st, c))
                if scored:
                    _, best, spot = min(scored, key=lambda q: q[0])
                    break
            if best is None:
                self.say("cant", why=f"there's no room to reach the {where}")
                return False
            (sx, sy), yaw = best
            if low:
                if not self.goto((sx, sy), face=yaw, stop=0.15, speed=0.6):
                    return False
            else:
                pre = (sx - 0.4 * math.cos(yaw), sy - 0.4 * math.sin(yaw))   # stop short, raise the load, step in
                if not self.goto(pre, face=yaw, stop=0.15, speed=0.6):
                    return False
                x, y, yaw = h.robot_pose()
                over = np.array([x + 0.32 * math.cos(yaw) + REACH_RIGHT * math.sin(yaw),
                                 y + 0.32 * math.sin(yaw) - REACH_RIGHT * math.cos(yaw), top + 2 * half_h + hz + 0.08])
                sh, el, _ = h.ik_right(over)
                raise_ = [(0.0, h.arms_now()), (1.2, [0.0, sh, -0.2, el])]
                for k in range(int(1.3 / E.DT)):
                    self.arms = list(SK.keyframes(raise_, k * E.DT))
                    self.step()
                self.arms = [0.0, sh, -0.2, el]
            self.align((sx, sy), yaw, tol=0.04)
            target = reach_point(fwd, right)
            fx, fy = f["xy"]
            fsx, fsy = f["size"]
            aim = (fx, fy) if max(fsx, fsy) <= 0.7 else spot   # a small spot (sink, hob, trivet): its middle
            self.square_up(aim)                            # turn so the arm's plane passes through it
            for _ in range(2):                             # out of reach from here: shuffle to where it is in reach
                if h.ik_right(np.array([aim[0], aim[1], top + half_h + hz + 0.005]))[2] < 0.045:
                    target = aim
                    break
                _, _, yw = h.robot_pose()
                mark = (aim[0] - fwd * math.cos(yw) - right * math.sin(yw), aim[1] - fwd * math.sin(yw) + right * math.cos(yw))
                self.align(mark, yw, tol=0.03)
                self.square_up(aim)
                target = reach_point(fwd, right)
            self.log(f"  [{h.t:6.1f} s] (placing at {target[0]:.2f}, {target[1]:.2f} on the {where}: "
                     f"x {fx - fsx / 2:.2f}..{fx + fsx / 2:.2f}, y {fy - fsy / 2:.2f}..{fy + fsy / 2:.2f})")
            rad = max(0.06, HS.OBJECTS[obj][1][0] * (1.0 if HS.OBJECTS[obj][0] != "box" else 0.7) + 0.01)
            if not (fx - fsx / 2 + rad < target[0] < fx + fsx / 2 - rad and fy - fsy / 2 + rad < target[1] < fy + fsy / 2 - rad):
                self.say("cant", why=f"I'd be putting it on the edge of the {where}")
                return False
        floor_here = h.floor_under(*h.robot_pose()[:2])
        hook_z = top + half_h + hz + 0.005               # lowered until it just rests on the top
        if low:
            hook_z = max(hook_z, floor_here + KM.LOW_REACH)   # the lowest the hook reaches crouched: a short drop if lower
            if not self.crouch_to(hook_z - floor_here):
                h.stiff(False)
                return False
            target = reach_point(*self.reach_offset(hook_z - floor_here, True))
        sh, el, err = h.ik_right(np.array([target[0], target[1], hook_z]))
        sh_d, el_d, _ = h.ik_right(np.array([target[0], target[1], hook_z - 0.05]))       # then the hook drops clear
        Rb = h.e.d[0].xmat[h.obj_body[obj]].reshape(3, 3)
        bar = Rb[:2, 0] / (np.linalg.norm(Rb[:2, 0]) + 1e-9)                             # the handle bar's direction
        x, y, yaw = h.robot_pose()
        out = np.array([-bar[1], bar[0]])                                                 # out across the bar, never along
        if out @ np.array([x - target[0], y - target[1]]) < 0:                            # (along it catches a post)
            out = -out
        sh_b, el_b, _ = h.ik_right(np.array([target[0] + 0.15 * out[0], target[1] + 0.15 * out[1], hook_z - 0.05]))
        cur = h.arms_now()
        lower = [(0.0, cur), (2.2, [0.0, sh, -0.2, el]), (3.4, [0.0, sh, -0.2, el])]      # lower slowly, let it stop swinging
        back = [(0.0, [0.0, sh, -0.2, el]), (0.5, [0.0, sh_d, -0.2, el_d]), (1.0, [0.0, sh_b, -0.2, el_b]),
                (2.0, self.TUCK if low else REST_ARMS)]

        def run(kf, secs):
            if low:
                return self.crouched_arms(kf, secs)
            for k in range(int(secs / E.DT)):
                self.arms = list(SK.keyframes(kf, k * E.DT))
                self.step()
            return True
        run(lower, 3.5)
        self.release()
        run(back, 2.1)
        self.arms = list(REST_ARMS)
        if low and not self.rise():
            return False
        self.stand_still(0.8)
        p = h.obj_pos(obj)
        upright = h.e.d[0].xmat[h.obj_body[obj]][8] > 0.9
        ok = abs(p[2] - (top + half_h)) < 0.05 and upright
        if where == "floor":                          # dropped the last bit: on the floor is on the floor, any way up
            ok = p[2] - top < 0.3
        self.say("placed", obj=name, place=label) if ok else self.say("cant", why=f"the {name} fell over")
        self.memory[obj] = dict(xyz=p, t=h.t, room=h.room_of(p[0], p[1]))
        return ok

    def _nearest_inside(self, f, inset):
        x, y, _ = self.h.robot_pose()
        cx, cy = f["xy"]
        sx, sy = f["size"]
        return (min(cx + sx / 2 - inset, max(cx - sx / 2 + inset, x)), min(cy + sy / 2 - inset, max(cy - sy / 2 + inset, y)))

    def hand_over(self, person):
        """Walk to about 1.6 m from the person (never closer than 1.5 m), turn to them and hold the object out.

        The person's side is simulated: the people here have no arms, so when the robot holds something out within
        reach (2.3 m), the person takes it, and the simulator moves it to the floor at their feet. On the real robot
        this is where the hand-over waits for the person to lift the object off the hook."""
        h = self.h
        obj = h.holding
        name = HS.OBJECTS[obj][5][0]
        if not self.go(person):
            return False
        hold = [(0.0, h.arms_now()), (1.2, [0.0, -1.3, -0.2, -0.2])]
        for k in range(int(1.3 / E.DT)):
            self.arms = list(SK.keyframes(hold, k * E.DT))
            self.step()
        self.say("handover", obj=name)
        self.stand_still(1.5)
        px, py = h.person_xy(person)
        x, y, _ = h.robot_pose()
        if math.hypot(px - x, py - y) > 2.3:
            self.arms = list(CARRY_ARMS)
            self.say("cant", why=f"I couldn't get close enough to hand over the {name}")
            return False
        self.release()                                          # the person takes it
        u = np.array([x - px, y - py]) / max(math.hypot(x - px, y - py), 1e-6)
        fx, fy = px + 0.35 * u[0], py + 0.35 * u[1]
        h.set_obj(obj, fx, fy, h.floor_z(fx, fy))
        who = "You take" if person == "you" else f"{person.capitalize()} takes"
        self.log(f"  [{h.t:6.1f} s] ({who} the {name}.)")
        back = [(0.0, h.arms_now()), (1.2, REST_ARMS)]
        for k in range(int(1.3 / E.DT)):
            self.arms = list(SK.keyframes(back, k * E.DT))
            self.step()
        self.arms = list(REST_ARMS)
        self.memory[obj] = dict(xyz=h.obj_pos(obj), t=h.t, room=h.room_of(fx, fy))
        return True

    def fetch(self, obj, to="you"):
        self.say("fetch", obj=HS.OBJECTS[obj][5][0])
        if not self.pick(obj):
            return False
        return self.place(to)

    # ================================================================== household skills
    def retract(self, back=0.3):
        """After working over something: lift the hook (and any load) clear, step back, bring the arm in."""
        h = self.h
        x, y, yaw = h.robot_pose()
        p = h.hook_world()
        sh, el, _ = h.ik_right(np.array([p[0], p[1], max(p[2] + 0.15, h.floor_z(x, y) + 1.25)]))
        kf = [(0.0, h.arms_now()), (0.8, [0.0, sh, -0.2, el])]
        anchor = (x, y, yaw)
        for k in range(int(0.9 / E.DT)):
            self.arms = list(SK.keyframes(kf, k * E.DT))
            self.hold_step(anchor)
        self.back_off(back)
        target = CARRY_ARMS if h.holding is not None else REST_ARMS
        kf = [(0.0, h.arms_now()), (1.0, target)]
        for k in range(int(1.1 / E.DT)):
            self.arms = list(SK.keyframes(kf, k * E.DT))
            self.step()
        self.arms = list(target)

    def hold_step(self, anchor):
        """One step that keeps the body where it was (x, y, yaw) while the arms work: with a load held out in front,
        the walking policy shuffles to keep its balance, and without this the body drifts several centimetres."""
        h = self.h
        hx, hy, hyaw = anchor
        x, y, yaw = h.robot_pose()
        fx = (hx - x) * math.cos(yaw) + (hy - y) * math.sin(yaw)
        fy = -(hx - x) * math.sin(yaw) + (hy - y) * math.cos(yaw)
        dyaw = wrap(hyaw - yaw)
        return self.step((max(-0.2, min(0.2, 1.5 * fx)) if abs(fx) > 0.02 else 0.0,
                          max(-0.15, min(0.15, 1.5 * fy)) if abs(fy) > 0.02 else 0.0,
                          max(-0.3, min(0.3, 1.5 * dyaw)) if abs(dyaw) > 0.03 else 0.0))

    def square_up(self, xy, tol=0.015):
        """The arm swings in a plane 0.2 m right of the body's centre: it cannot reach sideways. Turn on the spot so
        that plane passes through xy. Turning in place also shifts the body a little, so measure again and repeat."""
        h = self.h
        for _ in range(4):
            x, y, yaw = h.robot_pose()
            dx, dy = xy[0] - x, xy[1] - y
            f = dx * math.cos(yaw) + dy * math.sin(yaw)
            left = -dx * math.sin(yaw) + dy * math.cos(yaw)
            rho = math.hypot(f, left)
            if getattr(self, "debug", False):
                self.log(f"  (square up: target {f:.2f} ahead, {-left:.2f} right)")
            if rho < REACH_RIGHT + 0.05 or abs(-left - REACH_RIGHT) < tol:
                return
            goal = wrap(yaw + math.atan2(left, f) + math.asin(REACH_RIGHT / rho))
            t0 = h.t
            while h.t - t0 < 5.0:                  # firm small turns: the walking policy ignores tiny turn commands
                e = wrap(goal - h.robot_pose()[2])
                if abs(e) < 0.015:
                    break
                self.step((0.0, 0.0, math.copysign(min(0.5, max(0.25, 1.5 * abs(e))), e)))
            self.stand_still(0.5)

    def press(self, name):
        """Press a switch or button with the hook: stand square to it, reach over it, touch it, come away."""
        h = self.h
        c = h.b.controls[name]
        p = np.array(c["pos"], float)
        if h.holding is not None:
            self.say("cant", why=f"my hook is holding the {HS.OBJECTS[h.holding][5][0]}")
            return False
        yaw = c["face"]
        fwd, right = 0.40, REACH_RIGHT
        sx = p[0] - fwd * math.cos(yaw) - right * math.sin(yaw)
        sy = p[1] - fwd * math.sin(yaw) + right * math.cos(yaw)
        if not self.goto((sx, sy), face=yaw, stop=0.15, speed=0.5) and math.dist(h.robot_pose()[:2], (sx, sy)) > 0.4:
            self.say("cant", why=f"I couldn't get to the {c['words'][0]}")
            return False
        self.align((sx, sy), yaw, tol=0.035)
        self.square_up(p[:2])
        above, touch = p + [0, 0, 0.08], p + [0, 0, -0.004]
        sh0, el0, _ = h.ik_right(above)
        sh1, el1, err = h.ik_right(touch)
        if err > 0.04:
            self.say("cant", why=f"the {c['words'][0]} is out of my reach")
            return False
        cur = h.arms_now()
        plan = [(0.0, cur), (1.2, [0.0, sh0, -0.2, el0]), (2.0, [0.0, sh1, -0.2, el1]), (2.5, [0.0, sh1, -0.2, el1]),
                (3.0, [0.0, sh0, -0.2, el0]), (3.9, REST_ARMS)]
        pressed = False
        for k in range(int(4.0 / E.DT)):
            self.arms = list(SK.keyframes(plan, k * E.DT))
            self.step()
            if not pressed and np.linalg.norm(h.hook_world() - p) < 0.045:
                h.press(name)
                pressed = True
        self.arms = list(REST_ARMS)
        if pressed:
            self.log(f"  [{h.t:6.1f} s] (pressed the {c['words'][0]}: {h.events[-1][1] if h.events else ''})")
        else:
            self.say("cant", why=f"I missed the {c['words'][0]}")
        return pressed

    def hold_over(self, xy, z_top, secs=2.0, clear=0.06, near_ok=0.10):
        """Hold what it carries over a point, its bottom just above z_top (to pour into, water, or drop into
        something). True if it was held there, steady, for most of secs."""
        h = self.h
        obj = h.holding
        if obj is None:
            return False
        half_h, hz = HS.OBJECTS[obj][1][-1], HS.OBJECTS[obj][4]
        hook_z = z_top + clear + half_h + hz
        # how far ahead the hook reaches at this height (measured: 0.36 m at 0.8 m up ... 0.6 m from 1.1 m up)
        rel = hook_z - h.floor_z(*xy)
        max_fwd = float(np.interp(rel, [0.8, 0.84, 0.9, 1.0, 1.1], [0.32, 0.38, 0.45, 0.53, 0.58]))
        st = None
        for fwd in sorted({min(0.42, max_fwd), max_fwd, max(0.3, max_fwd - 0.08)}, reverse=True):
            st = self.stand_point(xy, fwd, REACH_RIGHT)
            if st is not None:
                break
        if st is None:
            self.say("cant", why="there's nowhere to stand to reach it")
            return False
        (sx, sy), yaw = st
        pre = (sx - 0.4 * math.cos(yaw), sy - 0.4 * math.sin(yaw))     # stop short, raise the load, step in
        if not self.goto(pre, face=yaw, stop=0.15, speed=0.5) and math.dist(h.robot_pose()[:2], pre) > 0.45:
            return False
        x, y, yaw = h.robot_pose()
        # raise the load clear of whatever is round the target (a rim, a worktop edge) before stepping in
        over = np.array([x + 0.32 * math.cos(yaw) + REACH_RIGHT * math.sin(yaw),
                         y + 0.32 * math.sin(yaw) - REACH_RIGHT * math.cos(yaw), max(hook_z + 0.2, h.floor_z(x, y) + 1.1)])
        sh, el, _ = h.ik_right(over)
        kf = [(0.0, h.arms_now()), (1.2, [0.0, sh, -0.2, el])]
        for k in range(int(1.3 / E.DT)):
            self.arms = list(SK.keyframes(kf, k * E.DT))
            self.step()
        self.arms = [0.0, sh, -0.2, el]
        self.align((sx, sy), yaw, tol=0.035)
        if getattr(self, "debug", False):
            x_, y_, _ = h.robot_pose()
            self.log(f"  (hold: aligned {math.dist((x_, y_), (sx, sy)):.2f} m from the plan)")
        self.square_up(xy)
        sh1, el1, e1 = h.ik_right(np.array([xy[0], xy[1], max(hook_z + 0.2, h.floor_z(x, y) + 1.1)]))
        if getattr(self, "debug", False):
            self.log(f"  (hold: over the target high: arms {h.arms_now()} -> sh {sh1:.2f} el {el1:.2f}, IK error {e1:.2f})")
        anchor = h.robot_pose()
        kf = [(0.0, h.arms_now()), (0.8, [0.0, sh1, -0.2, el1])]           # over the target, still high
        for k in range(int(0.9 / E.DT)):
            self.arms = list(SK.keyframes(kf, k * E.DT))
            self.hold_step(anchor)
        for k in range(int(0.9 / E.DT)):                # let the load stop swinging before lowering it in
            self.hold_step(anchor)
        if getattr(self, "debug", False):
            self.log(f"  (hold: hook at {np.round(h.hook_world(), 2)}, load at {np.round(h.obj_pos(obj), 2)})")
        sh2, el2, err = h.ik_right(np.array([xy[0], xy[1], hook_z]))
        if err > 0.08:
            x, y, yaw = h.robot_pose()
            dx, dy = xy[0] - x, xy[1] - y
            self.log(f"  [{h.t:6.1f} s] (target {dx * math.cos(yaw) + dy * math.sin(yaw):.2f} m ahead, "
                     f"{dx * math.sin(yaw) - dy * math.cos(yaw):.2f} m right, hook {hook_z - h.floor_z(x, y):.2f} m up: "
                     f"IK error {err:.2f}; planned {math.dist((sx, sy), (x, y)):.2f} m from here)")
            self.say("cant", why="I can't reach over it")
            return False
        kf = [(0.0, h.arms_now()), (1.6, [0.0, sh2, -0.2, el2])]          # lower slowly
        for k in range(int(1.8 / E.DT)):
            self.arms = list(SK.keyframes(kf, k * E.DT))
            self.hold_step(anchor)
        for k in range(int(0.6 / E.DT)):                # let it stop swinging
            self.hold_step(anchor)
        for _ in range(2):                              # a heavy load sags the arm: measure, and lift by the shortfall
            short = (z_top + clear) - (h.obj_pos(obj)[2] - half_h)
            if short < 0.015:
                break
            hook_z += short
            sh2, el2, err = h.ik_right(np.array([xy[0], xy[1], hook_z]))
            kf = [(0.0, h.arms_now()), (0.6, [0.0, sh2, -0.2, el2])]
            for k in range(int(1.0 / E.DT)):
                self.arms = list(SK.keyframes(kf, k * E.DT))
                self.hold_step(anchor)
        held, off = 0.0, []
        for k in range(int(secs / E.DT)):
            self.hold_step(anchor)
            p = h.obj_pos(obj)
            off.append(math.dist(p[:2], xy))
            if off[-1] < near_ok and p[2] - half_h > z_top - 0.01:
                held += E.DT
        if held < 0.75 * secs:
            self.log(f"  [{h.t:6.1f} s] (held over the target {held:.1f} of {secs:.1f} s; off by {np.mean(off):.2f} m, "
                     f"bottom {p[2] - half_h - z_top:+.2f} m above it; IK error {err:.2f})")
        return held >= 0.75 * secs

    def drop_into(self, cname):
        """Hold what it carries over a bin, box or hamper and let go."""
        h = self.h
        obj = h.holding
        c = h.b.containers[cname]
        x0, x1, y0, y1 = c["box"]
        xy = ((x0 + x1) / 2, (y0 + y1) / 2)
        name = HS.OBJECTS[obj][5][0]
        # the load hangs where the hook caught its handle bar (up to a few cm off its centre): what matters is that it
        # lands inside, so the tolerance is the opening less the object's size
        rad = HS.OBJECTS[obj][1][0]
        near = max(0.08, min(x1 - x0, y1 - y0) / 2 - 0.6 * rad)
        ok = self.hold_over(xy, c["rim"], secs=1.0, clear=0.12, near_ok=near)
        if not ok and h.holding is not None:
            self.retract()
            ok = self.hold_over(xy, c["rim"], secs=1.0, clear=0.12, near_ok=near)
        if not ok:
            self.say("cant", why=f"I couldn't get the {name} over the {c['words'][0]}")
            if h.holding is not None:
                self.release()                          # let it go here rather than wander about holding it
                self.retract()
            return False
        self.release()
        self.stand_still(1.2)
        ok = h.in_container(obj, cname)
        self.retract()
        p = h.obj_pos(obj)
        self.memory[obj] = dict(xyz=p, t=h.t, room=h.room_of(p[0], p[1]))
        self.say(f"The {name} is in the {c['words'][0]}.") if ok else self.say("cant", why=f"the {name} missed the {c['words'][0]}")
        return ok

    def pour(self, dst):
        """Pour what it holds into dst (an object, like the pot or a mug), or water plant number dst."""
        h = self.h
        src = h.holding
        if isinstance(dst, int):
            px, py = h.b.plants[dst]
            xy, z_top, label = (px, py), h.floor_z(px, py) + 0.36 + 0.12, f"plant {dst + 1}"
        else:
            p = h.obj_pos(dst)
            xy, z_top, label = (p[0], p[1]), p[2] + HS.OBJECTS[dst][1][-1], HS.OBJECTS[dst][5][0]
        ok = self.hold_over(xy, z_top, secs=2.0, clear=0.05, near_ok=0.10)
        res = ok and h.pour(src, dst)
        self.retract()
        if not res:
            self.say("cant", why=f"I couldn't pour into the {label}")
        return res

    def fill(self, obj, litres):
        """Stand a pot, kettle or can on the filling station's drip tray, let the sensor tap run until it holds
        `litres`, pick it up again."""
        h = self.h
        if h.holding != obj and not self.pick(obj):
            return False
        h.fill_to[obj] = litres                      # the station measures what it pours
        if not self.place("drip tray"):
            return False
        t0 = h.t
        while h.water[obj] < litres and h.t - t0 < 30.0:
            self.stand_still(0.5)
        self.log(f"  [{h.t:6.1f} s] ({obj}: {h.water[obj]:.2f} litres)")
        if h.water[obj] < litres - 0.05:
            self.say("cant", why=f"the {HS.OBJECTS[obj][5][0]} didn't fill (it has {h.water[obj]:.1f} litres)")
            return False
        return self.pick(obj)

    def vacuum_room(self, room, lane=0.27, max_s=900.0):
        """Vacuum a room: fetch the stick vacuum, walk lanes across the room with its head on the floor (the house
        counts the dust it picks up), put it back where it was."""
        h = self.h
        dock = h.obj_pos("hoover")[:2].copy()
        if h.holding != "hoover" and not self.pick("hoover"):
            return False
        if not self.go(room):
            return False
        x0, x1, y0, y1 = h.b.rooms[room]["box"]
        long_x = (x1 - x0) >= (y1 - y0)
        lvl = h.floor_z(*h.b.rooms[room]["centre"])        # the room's main floor (the lounge is a step down)
        t0 = h.t
        # lanes: the head trails 0.2 m right of the robot's centre line and about 0.45 m ahead
        lanes, k = [], 0
        a0, a1, b0, b1 = (x0, x1, y0, y1) if long_x else (y0, y1, x0, x1)
        hline = b0 + 0.15                                   # where the head should sweep, lane by lane
        while hline < b1 - 0.1:
            fwd_dir = 1 if k % 2 == 0 else -1               # walking +a: the right hand side is -b (long_x) ...
            side = -REACH_RIGHT if long_x else REACH_RIGHT
            v = hline - side * fwd_dir                       # ... so walk the line that puts the head on hline
            pts = []
            for u in np.arange(a0 + 0.35, a1 - 0.3, 0.3):
                px, py = (u, v) if long_x else (v, u)
                if not h.occupied(px, py, HS.ROBOT_R + 0.04, static=True) and abs(h.floor_z(px, py) - lvl) < 0.03 \
                        and abs(h.floor_z(px + 0.5, py) - lvl) < 0.03 and abs(h.floor_z(px - 0.5, py) - lvl) < 0.03 \
                        and abs(h.floor_z(px, py + 0.5) - lvl) < 0.03 and abs(h.floor_z(px, py - 0.5) - lvl) < 0.03:
                    pts.append((px, py))
            if pts:
                lanes.append(pts if k % 2 == 0 else pts[::-1])
            k += 1
            hline += lane
        self.vac_pose()
        for pts in lanes:
            for (px, py) in pts[::2] + [pts[-1]]:
                if h.t - t0 > max_s:
                    break
                self.goto((px, py), stop=0.25, speed=0.35, max_s=25.0)
        got = int((~h.dirt_on & (h.dirt_xy[:, 0] < 1e5)).sum())
        total = int((h.dirt_xy[:, 0] < 1e5).sum())
        self.log(f"  [{h.t:6.1f} s] (vacuumed the {room}: {got} of {total} specks of dust)")
        self.arms = list(CARRY_ARMS)
        kf = [(0.0, h.arms_now()), (1.0, CARRY_ARMS)]
        for kk in range(int(1.1 / E.DT)):
            self.arms = list(SK.keyframes(kf, kk * E.DT))
            self.step()
        # back to its corner: head down on the floor, let go
        self.goto(tuple(dock + np.array([-0.55, -0.2])), stop=0.3, speed=0.5)
        self.vac_pose()
        self.stand_still(0.8)
        self.release()
        self.retract(0.35)
        return got, total

    def vac_pose(self):
        """Arm low and forward, so the vacuum's head rests on the floor ahead of the right foot."""
        h = self.h
        x, y, yaw = h.robot_pose()
        fz = h.floor_z(x, y)
        target = np.array([x + 0.45 * math.cos(yaw) + REACH_RIGHT * math.sin(yaw),
                           y + 0.45 * math.sin(yaw) - REACH_RIGHT * math.cos(yaw), fz + 0.90])
        sh, el, _ = h.ik_right(target)
        kf = [(0.0, h.arms_now()), (1.2, [0.0, sh, -0.2, el])]
        for k in range(int(1.3 / E.DT)):
            self.arms = list(SK.keyframes(kf, k * E.DT))
            self.step()
        self.arms = [0.0, sh, -0.2, el]

    # ================================================================== sitting
    def sit(self, chair=None):
        h = self.h
        if self.seated:
            return True
        if chair is None:
            x, y, _ = h.robot_pose()
            chair = min(h.b.chairs, key=lambda c: math.dist((x, y), h.b.chairs[c]["xy"]))
        c = h.b.chairs[chair]
        f = c["face"]
        mark = (c["xy"][0] + SK_MARK * math.cos(f), c["xy"][1] + SK_MARK * math.sin(f))
        self.say("sit", chair=chair)
        if not self.goto(mark, face=f, stop=0.12, speed=0.5):       # to the mark (between chair and table), facing out
            self.say("cant", why=f"I couldn't get to the {chair}")
            return False
        if not self.align(mark, f):
            self.say("cant", why="I couldn't line up with the chair")
            return False
        if not h.sit():
            self.say("cant", why="I lost my balance sitting down")
            return False
        self.seated = True
        self.seat_chair = chair
        h.stiff(True)
        return True

    def rest(self, secs):
        h = self.h
        for _ in range(int(secs / E.DT)):
            h.step(legs=h.legs_now(), arms=h.arms_now())
        self.fatigue = max(0.0, self.fatigue - secs / 20.0)

    def stand(self):
        if not self.seated:
            return True
        self.h.stiff(False)
        ok = self.h.stand_up()
        self.seated = not ok
        self.say("stand") if ok else self.say("cant", why=self.h.stand_note)
        return ok

    # ================================================================== safety events
    def on_alarm(self):
        """Someone is hurting people: no physical intervention. Stop, keep away, warn, alert a human."""
        self.alarm = False
        self.say("alarm")
        self.alerts.append((self.h.t, "violence reported: robot stopped, keeping distance, operator alerted"))
        x, y, yaw = self.h.robot_pose()
        near = self.people_near()
        if near and near[0] < 2.0 and not self.seated:
            for _ in range(int(2.0 / E.DT)):             # back away from the nearest person to 2 m
                near = self.people_near()
                if not near or near[0] >= 2.0:
                    break
                self.step((-0.25 if abs(near[1]) < 1.6 else 0.0, 0.0, 0.0))
        self.h.gesture("refuse")
        self.stand_still(1.0)

    def reset_after_fall(self):
        """The operator helped it up: stand it on its feet where it fell, clear the e-stop."""
        x, y, yaw = self.h.robot_pose()
        held = self.h.holding
        self.release()
        self.h.place_robot(x, y, yaw)
        self.seated = False
        self.arms = list(REST_ARMS)
        self.sup.reset_by_operator()
        self.stand_still(0.6)
        self.say("reset")
        return held


SK_MARK = 0.40      # the sit mark: this far in front of the chair centre (as trained)
