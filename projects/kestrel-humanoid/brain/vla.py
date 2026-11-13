"""The vision-language-action layer ("System 2"): five times a second it looks through the head camera, keeps hold of
the current instruction, and proposes a walking command for the trained leg policy ("System 1", 50 Hz).

    image (head camera) --> vision.Eye ----------------\\
                                                        +--> action head --> safety.Supervisor --> walking policy
    instruction ---------> language.Ear --> task ------/          (vx, wz)        (fixed limits)        (50 Hz)
                                    |
                                    +--> persona.Persona (speech only, read-only events)

Perception is turned into a small world memory: every sighting becomes a floor point, smoothed over sightings, and
kept for a few seconds when the object leaves the view (it drops below the camera when the robot is close). The action
head pursues the remembered target: turn towards it, walk at the requested speed when roughly facing it, slow down on
arrival, and steer around a person in the way; it turns on the spot to search when it has never seen the target.
A large pretrained VLA (OpenVLA, pi-0, GR00T N1 class) can replace vision + language + action head behind the same
interface: step(image, pose, camera) -> (vx, vy, wz).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from safety import Supervisor, Limits
from persona import Persona

SPEED = {"slow": 0.5, "normal": 0.8, "fast": None}     # None = the supervisor's top speed (the leg policy
# walks noticeably slower than commanded below about 0.5 m/s)
ARRIVE = 0.9          # m from an object's centre
MEMORY_S = 4.0        # s a sighting is trusted after the object leaves the view


@dataclass
class Task:
    intent: str = "idle"
    target: str = "none"
    speed: str = "normal"
    text: str = ""
    t: float = 0.0
    done: bool = False
    seen: bool = False
    close: int = 0


@dataclass
class Track:
    xy: tuple = None
    age: float = 99.0
    n: int = 0

    def update(self, xy, alpha):
        self.xy = xy if self.xy is None else (self.xy[0] + alpha * (xy[0] - self.xy[0]), self.xy[1] + alpha * (xy[1] - self.xy[1]))
        self.age, self.n = 0.0, self.n + 1


class VLA:
    def __init__(self, eye, ear, limits=None, seed=0):
        self.eye, self.ear = eye, ear
        self.sup = Supervisor(limits or Limits())
        self.voice = Persona(seed)
        self.task = Task()
        self.tracks = {}
        self.status = ""
        self.said = self.voice.say("boot")
        self.last_view = {}
        self.detour = None          # (turn sign, phase, time) while stepping around a person

    # ---------------------------------------------------------------- instructions
    def instruct(self, text):
        p = self.ear.hear(text)
        self.tracks = {}
        self.detour = None
        ok, why = self.sup.check_instruction(text, p)
        if not ok:
            self.task = Task(intent="refused", text=text, done=True)
            self.said = self.voice.say("refuse_harm")
            self.status = "refused: harmful request"
            return p
        if p["conf"] < 0.6 or (p["intent"] == "goto" and p["target"] == "none"):
            self.task = Task(intent="unclear", text=text, done=True)
            self.said = self.voice.say("unclear")
            self.status = "did not understand"
            return p
        self.task = Task(intent=p["intent"], target=p["target"], speed=p["speed"], text=text)
        ev = {"goto": "accept" + {"fast": "_fast", "slow": "_slow"}.get(p["speed"], ""), "stop": "stop",
              "turn_left": "turn", "turn_right": "turn", "look_around": "look"}[p["intent"]]
        self.said = self.voice.say(ev, target=p["target"], seen="nothing yet")
        self.status = f"{p['intent']} {p['target'] if p['target'] != 'none' else ''}".strip()
        return p

    # ---------------------------------------------------------------- perception -> memory
    def _remember(self, view, pose, dt):
        rx, ry, yaw = pose
        for tr in self.tracks.values():
            tr.age += dt
        for n, (vis, b, d) in view.items():
            if vis and d < 14.0:
                xy = (rx + d * math.cos(yaw + b), ry + d * math.sin(yaw + b))
                tr = self.tracks.setdefault(n, Track())
                tr.update(xy, 0.5 if tr.n else 1.0)

    def _rel(self, n, pose):
        tr = self.tracks.get(n)
        if tr is None or tr.xy is None or tr.age > MEMORY_S:
            return None
        rx, ry, yaw = pose
        dx, dy = tr.xy[0] - rx, tr.xy[1] - ry
        b = (math.atan2(dy, dx) - yaw + math.pi) % (2 * math.pi) - math.pi
        return b, math.hypot(dx, dy), tr.age

    # ---------------------------------------------------------------- one 5 Hz step
    def step(self, img, pose, cam_pos, cam_mat, dt=0.2):
        view = self.eye.see(img, cam_pos, cam_mat, pose, thresh=0.3)   # far objects score lower; a false person only slows us
        self.last_view = view
        self._remember(view, pose, dt)
        tk = self.task
        tk.t += dt
        pr = self._rel("person", pose)
        person_dist = pr[1] if pr and pr[2] < 1.0 else None
        cmd, ev, tgt_dist = (0.0, 0.0, 0.0), None, None
        if tk.intent == "goto" and not tk.done:
            r = self._rel(tk.target, pose)
            if r is not None:
                b, d, age = r
                if not tk.seen:
                    tk.seen = True
                    ev = ("found", dict(target=tk.target, dist=d))
                tgt_dist = d
                stop_at = self.sup.lim.person_target_gap + 0.2 if tk.target == "person" else ARRIVE
                tk.close = tk.close + 1 if d < stop_at else 0
                if tk.close >= 2:
                    tk.done = True
                    ev = ("arrive", dict(target=tk.target))
                    self.status = f"at the {tk.target}"
                else:
                    v_req = SPEED[tk.speed] if SPEED[tk.speed] is not None else self.sup.lim.top_speed
                    face = max(0.0, math.cos(b)) ** 2
                    v = v_req * face * min(1.0, max(0.0, d - stop_at) / 1.5 + 0.2)
                    v = max(v, 0.25 * face)          # the walking policy stands still below about 0.2 m/s
                    wz = 1.8 * b
                    if pr and tk.target != "person" and pr[1] < 3.0 and abs(pr[0]) < 0.7 and pr[1] < d:
                        wz -= math.copysign(0.9 * (3.0 - pr[1]) / 3.0, pr[0] if abs(pr[0]) > 0.02 else 1.0)
                        if pr[1] < 1.5 and self.detour is None:   # blocked: commit to a sidestep
                            self.detour = [-math.copysign(1.0, pr[0] if abs(pr[0]) > 0.02 else 1.0), "turn", 0.0]
                    if self.detour is not None:  # turn until the person is off to the side, walk on, then resume
                        sgn, ph, tt = self.detour
                        self.detour[2] += dt
                        if ph == "turn":
                            v, wz = 0.0, 0.7 * sgn
                            if (pr is None or abs(pr[0]) > math.radians(75)) or tt > 3.0:
                                self.detour = [sgn, "walk", 0.0]
                        else:
                            v, wz = 0.45, 0.0
                            if tt > 1.6:
                                self.detour = None
                        self.status = f"stepping around a person · target {d:.1f} m"
                    cmd = (v, 0.0, max(-1.0, min(1.0, wz)))
                    if self.detour is None:
                        self.status = f"go to {tk.target}: {d:.1f} m, bearing {math.degrees(b):+.0f}°" + \
                                      (" (remembered)" if age > 0.1 else "")
            else:
                # search: a full turn on the spot (about 10.5 s at 0.6 rad/s), then walk on 2.5 s and look again
                cyc = tk.t % 13.0
                cmd = (0.0, 0.0, 0.6) if cyc < 10.5 else (0.5, 0.0, 0.0)
                self.status = f"searching for {tk.target}" + (" (moving on)" if cyc >= 10.5 else "")
                if tk.t > 0.6 and not tk.seen and int(tk.t / dt) % 15 == 3:
                    ev = ("search", {})
        elif tk.intent in ("turn_left", "turn_right") and not tk.done:
            cmd = (0.0, 0.0, 0.6 if tk.intent == "turn_left" else -0.6)
            if tk.t > 2.6:                       # about 90 degrees
                tk.done = True
        elif tk.intent == "look_around" and not tk.done:
            seen = [n for n, (v, _, _) in view.items() if v and n != "person"]
            tk.done = True
            ev = ("look", dict(seen=", ".join(seen) if seen else "nothing I recognise"))
        vx, vy, wz, note = self.sup.filter(cmd, pose, person_dist, tk.target == "person", tgt_dist,
                                           pr[0] if pr else 0.0)
        if note:
            self.status += f" · {note}"
            if "person" in note and tk.intent == "goto" and not ev and "person" not in self.said:
                ev = ("person_gap" if "gap" in note else "person_slow", {})
            if "edge" in note:
                ev = ev or ("fence", {})
        if ev:
            self.said = self.voice.say(ev[0], **ev[1])
        return (vx, vy, wz)

    def fell(self):
        self.sup.estop("fall")
        self.said = self.voice.say("fall")
        self.status = "fallen: e-stop latched"
