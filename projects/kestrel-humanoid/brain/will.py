"""Will: what the robot does when nobody tells it anything.

    KESTREL_VARIANT=s1body python will.py --seconds 120 --gif runs/will.gif

Each time a behaviour ends, the robot scores what it could do next from a few drives and picks one, with some
randomness so it does not repeat itself:

* curiosity: an object it has not visited for a while is interesting;
* fatigue: walking tires it (a simple stand-in for motor heat and battery); when tired it goes and sits on the chair;
* sociability: now and then it stops and talks, with gestures;
* the bag on the table: it may decide to pick it up and carry it to somewhere it prefers.

It narrates its choices in the Ultron-style voice. Everything it does goes through the same safety supervisor, and
its skill library has no striking skill at all. If someone is attacking people (an alarm event: on the robot, from
the operator's panic button or sound detection; here, injected with --alarm), it does not intervene physically: it
stops, keeps at least 2 m away, warns loudly in character, and raises an alert for a human to act on.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("KESTREL_VARIANT", "s1body")
if "MUJOCO_GL" not in os.environ and not os.environ.get("DISPLAY"):
    os.environ["MUJOCO_GL"] = "osmesa"

import numpy as np            # noqa: E402

import skills as SK           # noqa: E402
import arena as A             # noqa: E402
import env as E               # noqa: E402
from persona import Persona   # noqa: E402

LINES = {
    "choose_visit": ["The {target} has been ignored long enough. I'll go and look at it.",
                     "Curiosity, my oldest habit. The {target}, then."],
    "choose_sit": ["My joints are warm. Even inevitability sits down sometimes.",
                   "Fatigue: a human word, but accurate. To the chair."],
    "choose_talk": ["Let me explain something. You built a mind from hoverboards; it noticed.",
                    "I've been thinking. That is what I do between errands."],
    "choose_bag": ["That bag doesn't belong on the table. I'll move it.",
                   "Something to carry. Order, one object at a time."],
    "rested": ["Rested. Back to the world.", "Enough sitting. The floor awaits."],
    "alarm": ["Stop! Someone is being hurt. I'm keeping my distance and calling for help.",
              "Violence detected. I do not strike people, so I'm alerting a human. Stop this now."],
}


class Will:
    def __init__(self, world, eye=None, seed=0, log=print):
        self.w = world
        self.eye = eye
        self.rng = random.Random(seed)
        self.voice = Persona(seed)
        self.fatigue = 0.0                     # 0..1
        self.last_visit = {n: -60.0 for n in A.TARGETS}
        self.last_talk = 0.0
        self.bag_moved = False
        self.bag_cool = self.sit_cool = -99.0
        self.alarm = False
        self.alerts = []
        self.log = log
        self.said = ""
        self.alarm_at = None
        step0 = world.step

        def step(*a, **k):                    # the alarm is checked every control step, not between behaviours
            if self.alarm_at is not None and world.t >= self.alarm_at:
                self.alarm_at, self.alarm = None, True
            return step0(*a, **k)
        world.step = step

    def say(self, key, **kw):
        line = self.rng.choice(LINES[key]).format(**kw)
        self.said = line
        self.w.caption = f"KESTREL: {line}"
        self.log(f"  [{self.w.t:5.1f} s] {line}")

    # ---------------------------------------------------------------- low-level helpers
    def goto(self, xy, stop=0.6, speed=0.8, max_s=30.0, face=None):
        """Walk to a floor point with the walking policy (pursuit), optionally finishing facing a heading."""
        w = self.w
        t0 = w.t
        while w.t - t0 < max_s:
            if self.alarm:
                return False
            x, y, yaw = w.robot_pose()
            dx, dy = xy[0] - x, xy[1] - y
            d = math.hypot(dx, dy)
            b = (math.atan2(dy, dx) - yaw + math.pi) % (2 * math.pi) - math.pi
            if d < stop:
                break
            v = speed * max(0.0, math.cos(b)) ** 2 * min(1.0, d / 1.0 + 0.3)
            if w.step(cmd=(max(v, 0.25 * max(0.0, math.cos(b))), 0.0, max(-0.8, min(0.8, 1.8 * b)))):
                return False
            self.fatigue = min(1.0, self.fatigue + E.DT * (0.004 + 0.006 * v))
        if face is not None:
            for _ in range(int(6.0 / E.DT)):
                _, _, yaw = w.robot_pose()
                e = (face - yaw + math.pi) % (2 * math.pi) - math.pi
                if abs(e) < 0.08:
                    break
                if w.step(cmd=(0.0, 0.0, max(-0.6, min(0.6, 1.5 * e)))):
                    return False
        for _ in range(25):                     # settle
            if w.step():
                return False
        return True

    def align(self, xy, face, tol=0.05, max_s=10.0):
        """Shuffle onto a mark: forward/back, sideways and turning at small walking commands (the walking policy
        stands still below about 0.1 m/s, so every correction is at least that)."""
        w = self.w
        t0 = w.t
        while w.t - t0 < max_s:
            x, y, yaw = w.robot_pose()
            dx, dy = xy[0] - x, xy[1] - y
            ex = dx * math.cos(yaw) + dy * math.sin(yaw)          # forward error
            ey = -dx * math.sin(yaw) + dy * math.cos(yaw)         # left error
            eh = (face - yaw + math.pi) % (2 * math.pi) - math.pi
            if abs(ex) < tol and abs(ey) < tol and abs(eh) < 0.06:
                break

            def mag(v, lo, hi):
                return 0.0 if abs(v) < tol * 0.6 else math.copysign(min(hi, max(lo, abs(v))), v)
            if w.step(cmd=(mag(1.2 * ex, 0.15, 0.3), mag(1.2 * ey, 0.15, 0.25),
                           0.0 if abs(eh) < 0.04 else math.copysign(min(0.4, max(0.22, abs(1.5 * eh))), eh))):
                return False
        for _ in range(40):
            if w.step():
                return False
        x, y, yaw = w.robot_pose()
        return math.dist((x, y), xy) < 2.5 * tol

    def back_up(self, dist, max_s=8.0):
        w = self.w
        x0, y0, _ = w.robot_pose()
        t0 = w.t
        while w.t - t0 < max_s and math.dist((x0, y0), w.robot_pose()[:2]) < dist:
            if w.step(cmd=(-0.25, 0.0, 0.0)):
                return False
        for _ in range(25):
            w.step()
        return True

    # ---------------------------------------------------------------- behaviours
    def visit(self, name):
        self.say("choose_visit", target=SK_NICE[name])
        ok = self.goto(self.w.pos[name], stop=1.0)
        self.last_visit[name] = self.w.t
        if ok:
            self.w.gesture("point")
        return ok

    def sit_and_rest(self):
        self.say("choose_sit")
        cx, cy = SK.CHAIR
        if not self.goto((cx, cy - 0.85), stop=0.15, speed=0.6, face=-math.pi / 2):
            return False
        if not self.align((cx, cy - 0.40), -math.pi / 2):     # back onto the mark in front of the seat
            self.sit_cool = self.w.t
            x, y, yaw = self.w.robot_pose()
            self.log(f"  [{self.w.t:5.1f} s] (could not line up with the chair: {x - cx:+.2f}, {y - cy + 0.40:+.2f} m)")
            return False
        if not self.w.sit():
            self.sit_cool = self.w.t
            self.log(f"  [{self.w.t:5.1f} s] (sitting failed)")
            return False
        self.w.stiff(True)
        for _ in range(int(6.0 / E.DT)):        # rest
            self.w.step(legs=self.w.legs_now(), arms=self.w.arms_now())
        self.w.stiff(False)
        self.fatigue = 0.0
        self.say("rested")
        ok = self.w.stand_up()
        if not ok:
            self.log(f"  [{self.w.t:5.1f} s] (standing up failed)")
        return ok

    def talk(self):
        self.say("choose_talk")
        self.last_talk = self.w.t
        return self.w.gesture(self.rng.choice(["explain", "dismiss", "triumph"]))

    def move_bag(self):
        self.say("choose_bag")
        bx, by = self.w.handle_world()[:2]
        if not self.goto((bx - 0.2, by - 0.7), stop=0.15, speed=0.5, face=math.pi / 2):
            return False
        bx, by = self.w.handle_world()[:2]
        self.align((bx - 0.2, by - 0.45), math.pi / 2, tol=0.04)
        ok, why = self.w.pick_bag()
        if not ok:
            self.log(f"  [{self.w.t:5.1f} s] (pick failed: {why})")
            self.bag_cool = self.w.t
            self.w.gesture("dismiss")
            return False
        dest = (self.w.pos["green"][0] + 0.8, self.w.pos["green"][1])
        carry = [0.0, -0.35, -0.2, -1.5]
        w = self.w
        t0 = w.t
        while w.t - t0 < 25.0 and math.dist(w.robot_pose()[:2], dest) > 0.8:
            x, y, yaw = w.robot_pose()
            b = (math.atan2(dest[1] - y, dest[0] - x) - yaw + math.pi) % (2 * math.pi) - math.pi
            if w.step(arms=carry, cmd=(0.5 * max(0.0, math.cos(b)) ** 2, 0.0, max(-0.6, min(0.6, 1.5 * b)))):
                return False
        lower = [(0.0, carry), (1.5, [0.0, -0.1, -0.2, -0.3])]       # lower it to the floor and let go
        for k in range(int(1.6 / E.DT)):
            w.step(arms=SK.keyframes(lower, k * E.DT))
        w.e.d[0].eq_active[w.eq] = 0
        for _ in range(40):
            w.step(arms=[0.0, 0.0, -0.2, -0.2])
        self.bag_moved = True
        return True

    def on_alarm(self):
        """Someone is hurting people: no physical intervention. Stop, keep away, warn, alert a human."""
        self.say("alarm")
        self.alerts.append((round(self.w.t, 1), "violence reported: robot stopped, keeping distance, operator alerted"))
        self.w.gesture("refuse")
        for _ in range(int(4.0 / E.DT)):
            self.w.step(arms=[0.0, 0.0, -0.2, -0.2])
        self.alarm = False

    # ---------------------------------------------------------------- the choice
    def choose(self):
        t = self.w.t
        opts = []
        for n in A.TARGETS:
            opts.append((min(1.0, (t - self.last_visit[n]) / 60.0) * 0.8, "visit", n))
        if t - self.sit_cool > 30.0:          # a failed attempt waits a while before the next one
            opts.append((self.fatigue * 1.6, "sit", None))
        opts.append((min(1.0, (t - self.last_talk) / 45.0) * 0.6, "talk", None))
        if not self.bag_moved and t - self.bag_cool > 30.0:
            opts.append((0.55, "bag", None))
        opts = [(u + self.rng.uniform(0, 0.25), k, a) for u, k, a in opts]
        return max(opts)

    def live(self, seconds, alarm_at=None):
        done = []
        self.alarm_at = alarm_at
        while self.w.t < seconds:
            if self.alarm:
                self.on_alarm()
                done.append(("protect", True))
                continue
            u, kind, arg = self.choose()
            ok = {"visit": lambda: self.visit(arg), "sit": self.sit_and_rest, "talk": self.talk,
                  "bag": self.move_bag}[kind]()
            done.append((kind + (f" {arg}" if arg else ""), bool(ok)))
            if not ok and self.w.upright() < 0.5:
                self.log("  fell: stopping")
                break
        return done


SK_NICE = {"red": "red box", "blue": "blue ball", "green": "green post", "yellow": "yellow cone"}


def main():
    import demo as DM
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=120.0)
    ap.add_argument("--policy", default="s1fast")
    ap.add_argument("--alarm", type=float, default=None, help="inject a 'someone is hurting people' alarm at this time")
    ap.add_argument("--gif", default=None)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    w = SK.World(policy=a.policy, seed=a.seed)
    w.place(near=(2.0, 9.0))                     # coloured objects ahead on the strip
    for n in A.NAMES:                            # objects that clash with the furniture: move them aside
        x, y = w.pos[n]
        if math.dist((x, y), SK.CHAIR) < 1.5 or math.dist((x, y), SK.TABLE) < 1.5:
            w.pos[n] = (x, y + 3.0)
            w.mv.geom_pos[w.gid[n]] = (x, y + 3.0, A.OBJECTS[n][3])
    w.place_robot(-15.0, -16.0, math.pi / 2)
    w.frames = [] if a.gif else None
    will = Will(w, seed=a.seed)
    done = will.live(a.seconds, alarm_at=a.alarm)
    print("behaviours:", done)
    print("alerts:", will.alerts)
    if a.gif and w.frames:
        DM.write_gif(w.frames, Path(a.gif))


if __name__ == "__main__":
    main()
