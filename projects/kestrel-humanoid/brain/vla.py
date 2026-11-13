"""The vision-language-action layer ("System 2"): five times a second it looks through the head camera, keeps hold of
the current instruction, and proposes a walking command for the trained leg policy ("System 1", 50 Hz).

    image (head camera) --> vision.Eye ----------------\
                                                        +--> action head --> safety.Supervisor --> walking policy
    instruction ---------> language.Ear --> task ------/          (vx, wz)        (fixed limits)        (50 Hz)
                                    |
                                    +--> persona.Persona (speech only, read-only events)

The action head is a pursuit controller on the perceived bearing and distance: turn towards the target, walk at the
requested speed when roughly facing it, slow down on arrival, search by turning when the target is out of view. It is
deliberately small and readable. A large pretrained VLA (OpenVLA, pi-0, GR00T N1 class) can replace vision + language
+ action head behind the same interface: step(image, pose) -> (vx, vy, wz), status.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from safety import Supervisor, Limits
from persona import Persona

SPEED = {"slow": 0.4, "normal": 0.8, "fast": None}     # None = the supervisor's top speed


@dataclass
class Task:
    intent: str = "idle"
    target: str = "none"
    speed: str = "normal"
    text: str = ""
    t: float = 0.0
    done: bool = False
    seen: bool = False


class VLA:
    def __init__(self, eye, ear, limits=None, seed=0):
        self.eye, self.ear = eye, ear
        self.sup = Supervisor(limits or Limits())
        self.voice = Persona(seed)
        self.task = Task()
        self.status = ""
        self.said = self.voice.say("boot")
        self.lost = 0
        self.last_d = None
        self.last_view = {}

    # ---------------------------------------------------------------- instructions
    def instruct(self, text):
        p = self.ear.hear(text)
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
        self.lost = 0
        self.last_d = None
        return p

    # ---------------------------------------------------------------- one 5 Hz step
    def step(self, img, pose, dt=0.2):
        view = self.eye.see(img)
        self.last_view = view
        tk = self.task
        tk.t += dt
        person = view.get("person")
        person_dist = person[2] if person and person[0] else None
        cmd, ev = (0.0, 0.0, 0.0), None
        tgt_dist = None
        if tk.intent == "goto" and not tk.done:
            vis, b, d = view.get(tk.target, (False, 0.0, 0.0))
            if vis:
                if not tk.seen:
                    tk.seen = True
                    ev = ("found", dict(target=tk.target, dist=d))
                self.lost = 0
                tgt_dist = d
                self.last_d = d
                stop_at = self.sup.lim.person_target_gap if tk.target == "person" else 1.0
                v_req = SPEED[tk.speed] if SPEED[tk.speed] is not None else self.sup.lim.top_speed
                if d < stop_at:
                    tk.done = True
                    ev = ("arrive", dict(target=tk.target))
                else:
                    face = max(0.0, math.cos(b)) ** 2
                    v = v_req * face * min(1.0, (d - stop_at) / 1.5 + 0.25)
                    cmd = (v, 0.0, max(-1.0, min(1.0, 1.8 * b)))
                self.status = f"go to {tk.target}: {d:.1f} m, bearing {math.degrees(b):+.0f}°"
            elif tk.seen and self.last_d is not None and self.last_d < 1.8 and self.lost < 3:
                self.lost += 1                   # dropped below the camera's view: it is right in front
                tk.done = True
                ev = ("arrive", dict(target=tk.target))
                self.status = f"at the {tk.target}"
            else:
                self.lost += 1
                cmd = (0.0, 0.0, 0.6)            # search: turn on the spot
                self.status = f"searching for {tk.target}"
                if self.lost == 3:
                    ev = ("search", {})
        elif tk.intent in ("turn_left", "turn_right") and not tk.done:
            cmd = (0.0, 0.0, 0.6 if tk.intent == "turn_left" else -0.6)
            if tk.t > 2.6:                       # about 90 degrees
                tk.done = True
        elif tk.intent == "look_around" and not tk.done:
            seen = [n for n, (v, _, _) in view.items() if v and n != "person"]
            tk.done = True
            ev = ("look", dict(seen=", ".join(seen) if seen else "nothing I recognise"))
        vx, vy, wz, note = self.sup.filter(cmd, pose, person_dist, tk.target == "person", tgt_dist)
        if note:
            self.status += f" · {note}"
            if "person" in note and "slow" not in self.said and tk.intent == "goto":
                ev = ev or ("person_gap" if "gap" in note else "person_slow", {})
            if "edge" in note:
                ev = ev or ("fence", {})
        if ev:
            self.said = self.voice.say(ev[0], **ev[1])
        return (vx, vy, wz)

    def fell(self):
        self.sup.estop("fall")
        self.said = self.voice.say("fall")
        self.status = "fallen: e-stop latched"
