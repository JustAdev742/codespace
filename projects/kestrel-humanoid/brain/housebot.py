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

REST_ARMS = [0.0, 0.0, -0.2, -0.2]
CARRY_ARMS = [0.0, -0.35, -0.2, -1.5]
REACH_FWD, REACH_RIGHT = 0.42, 0.20          # where a handle must be, in the robot's frame, for the hook to reach it
LOW_HANDLE = 0.78                            # handles lower than this above the floor need a crouch


class Interrupted(Exception):
    """Raised inside any skill when a new instruction (or the alarm) arrives, so the robot drops what it is doing."""


LINES = {
    "hello": ["Hello. I'm awake, I'm balanced, and I'm listening.", "Greetings. Speak; I'll act."],
    "who": ["KESTREL. Hoverboard motors, drill gearboxes, and a mind that walks. I fetch, I carry, I sit, I don't strike.",
            "I am what you built from scrap: two legs, a hook for a hand, and opinions."],
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
        for n, b in self.person_body.items():
            px, py = self.h.person_xy(n)
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
        for _ in range(int(secs / E.DT)):
            self.step()

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
        while h.t - t0 < max_s:
            x, y, yaw = h.robot_pose()
            dgoal = math.hypot(goal[0] - x, goal[1] - y)
            if dgoal < stop:
                break
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
                    self.log(f"  [{h.t:6.1f} s] (stuck at {x:.1f}, {y:.1f}; backing off and trying another way)")
                    self.blocked = getattr(self, "blocked", []) + [(x + 0.35 * math.cos(yaw), y + 0.35 * math.sin(yaw), 0.25, h.t)]
                    self.back_off(0.3)
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

    def stand_point(self, target_xy, fwd, right, min_clear=0.17):
        """Where to stand (and which way to face) so that target_xy is fwd ahead and right to the right: the reachable,
        clear candidate with the shortest walk."""
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
            if abs(h.floor_z(sx, sy) - h.floor_z(*target_xy)) > 0.05 and h.floor_z(*target_xy) < 0.3:
                continue                                  # do not reach across a step for something on the floor
            if any(math.dist((sx, sy), h.person_xy(n)) < 1.4 for n in h.b.people):
                continue                                  # never work right next to someone
            score = math.hypot(sx - x, sy - y) - 2.0 * min(clr[j, i], 0.5)
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
        if name in self.h.b.rooms:
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
        for n, f in self.h.b.furniture.items():
            if n == home:
                home_room = self.h.room_of(*f["xy"])
        if home in self.h.b.rooms:
            home_room = home
        x, y, _ = self.h.robot_pose()
        rooms = sorted(self.h.b.rooms, key=lambda r: (r != home_room, math.dist((x, y), self.h.b.rooms[r]["centre"])))
        for r in rooms:
            if r == "garden":
                continue
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
    CROUCH = [(0.52, (0.56, 0.4)), (0.45, (0.52, 0.5)), (0.0, (0.48, 0.6))]    # handle height above floor -> pose
    TUCK = [0.0, -0.3, -0.2, -0.4]
    GATE = dict(lo=-0.015, hi=0.085, gain=1.0)     # balance window for the crouch (narrower and wider both fail sometimes)

    def crouch_to(self, handle_rel):
        """Balanced crouch deep enough for a handle this high above the floor (lowest reach 0.34 m: the ankles and hips
        are at their limits). The legs stay stiff and balanced afterwards, for the reach."""
        w = self.h
        z, tp = next(pose for lim, pose in self.CROUCH if handle_rel >= lim)
        if not w.settle():
            return False
        # slowly, weight kept a little forward: a fast crouch pushes the feet backwards, and on tiles they slide
        legs = [(0.0, w.legs_now())] + w._pose_path([(2.0, 0.70, 0.20, 0.035), (4.0, z, tp, 0.03)])
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
        legs = [(0.0, w.legs_now())] + w._pose_path([(1.6, 0.66, 0.25, 0.04), (2.8, 0.78, 0.0, 0.04)])
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
        for attempt in range(2):
            hd = h.handle_of(obj)
            low = hd[2] - h.floor_z(*hd[:2]) < LOW_HANDLE
            fwd = 0.31 if low else REACH_FWD                    # crouched, the hook reaches 0.31 m ahead
            st = self.stand_point(hd[:2], fwd, REACH_RIGHT)
            if st is None:
                self.say("pick_fail", obj=name, why="there's nowhere to stand next to it")
                return False
            (sx, sy), yaw = st
            if not self.goto((sx, sy), face=yaw, stop=0.15, speed=0.6):
                continue
            hd = h.handle_of(obj)
            # final placement relative to the handle as it is now
            sx = hd[0] - fwd * math.cos(yaw) - REACH_RIGHT * math.sin(yaw)
            sy = hd[1] - fwd * math.sin(yaw) + REACH_RIGHT * math.cos(yaw)
            self.align((sx, sy), yaw, tol=0.035)
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
        sh1, el1, e1 = h.ik_right(hd + [0, 0, -0.01])
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
            for k in range(int(2.8 / E.DT)):
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
        eq = h.obj_eq[obj]
        R = d.xmat[b].reshape(3, 3)
        h.e.m.eq_data[eq, 3:6] = R.T @ (h.hook_world() - d.xpos[b])
        d.eq_active[eq] = 1
        h.holding = obj
        z0 = d.xpos[b][2]
        sh2, el2, _ = h.ik_right(hd + [0, 0, 0.14])             # straight up first, clear of the surface
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

    def back_off(self, dist, max_s=5.0):
        x0, y0, _ = self.h.robot_pose()
        t0 = self.h.t
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
        if where in h.b.rooms:                          # a room: its first surface, else its floor
            surf = [n for n, f in h.b.furniture.items() if h.room_of(*f["xy"]) == where and f["top"] - h.floor_z(*f["xy"]) > 0.4]
            if not surf:
                if not self.goto(h.b.rooms[where]["centre"]):
                    return False
                return self.place("floor")
            where = surf[0]

        def reach_point(fwd):
            x, y, yaw = h.robot_pose()
            return (x + fwd * math.cos(yaw) + REACH_RIGHT * math.sin(yaw), y + fwd * math.sin(yaw) - REACH_RIGHT * math.cos(yaw))
        if where == "floor":
            fwd = 0.31
            target = reach_point(fwd)
            top, label, low = h.floor_z(*target), "floor", True
        else:
            f = h.b.furniture.get(where)
            if f is None:
                self.say("cant", why=f"I don't know a '{where}'")
                return False
            top, label = f["top"], where
            low = top + half_h + hz - h.floor_z(*f["xy"]) < LOW_HANDLE
            fwd = 0.31 if low else REACH_FWD
            best = None
            fx, fy = f["xy"]
            fsx, fsy = f["size"]
            x0, y0, _ = h.robot_pose()
            for inset in (0.18, 0.12):                   # points well inside the top, all round it: the nearest reachable
                cands = [self._nearest_inside(f, inset)]
                for u in np.linspace(-1, 1, 5):
                    for v in (-1, 1):
                        cands += [(fx + u * (fsx / 2 - inset), fy + v * (fsy / 2 - inset)),
                                  (fx + v * (fsx / 2 - inset), fy + u * (fsy / 2 - inset))]
                others = [h.obj_pos(o)[:2] for o in HS.OBJECTS if o != obj]
                cands = [c for c in cands if all(math.dist(c, q) > 0.25 for q in others)]     # a clear spot on the top
                scored = []
                for c in cands:
                    st = self.stand_point(c, fwd, REACH_RIGHT)
                    if st is not None:
                        scored.append((math.dist(st[0], (x0, y0)), st))
                if scored:
                    best = min(scored, key=lambda q: q[0])[1]
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
            target = reach_point(fwd)
            fx, fy = f["xy"]
            fsx, fsy = f["size"]
            self.log(f"  [{h.t:6.1f} s] (placing at {target[0]:.2f}, {target[1]:.2f} on the {where}: "
                     f"x {fx - fsx / 2:.2f}..{fx + fsx / 2:.2f}, y {fy - fsy / 2:.2f}..{fy + fsy / 2:.2f})")
            if not (fx - fsx / 2 + 0.06 < target[0] < fx + fsx / 2 - 0.06 and fy - fsy / 2 + 0.06 < target[1] < fy + fsy / 2 - 0.06):
                self.say("cant", why=f"I'd be putting it on the edge of the {where}")
                return False
        floor_here = h.floor_under(*h.robot_pose()[:2])
        hook_z = top + half_h + hz + 0.005               # lowered until it just rests on the top
        if low:
            hook_z = max(hook_z, floor_here + 0.36)      # the lowest the hook reaches crouched: a short drop if lower
            if not self.crouch_to(hook_z - floor_here):
                h.stiff(False)
                return False
            target = reach_point(0.31)
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
