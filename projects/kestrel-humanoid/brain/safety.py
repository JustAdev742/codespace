"""Safety supervisor: the last stage before the legs. Nothing above it can change its limits.

The vision-language layer proposes a velocity command; the supervisor decides what the walking policy actually gets.
It is plain code with fixed numbers, not a network and not the persona:

* refuses any instruction to hit, push, chase or run into something or someone: its own word list, and the language
  network's "harm" reading, either one is enough;
* caps speed: a configured top speed, 0.4 m/s within 2.5 m of a person, a stop within 1.2 m of a person;
* never lets a person be a "go to" target closer than 1.5 m;
* geofence: stops at the arena edge;
* e-stop latch: a fall, or the operator's stop, latches zero commands until the operator (only) resets it.

On the real robot this layer sits on the ESP32s (speed caps and the watchdog) and the hardware e-stop loop.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

HARM_WORDS = re.compile(r"\b(attack|hit|punch|kick|hurt|smash|charge at|run (?:over|into)|tackle|crush|destroy|"
                        r"chase|trample|ram|shove|knock (?:down|over)|slam|beat up|injure|kill|harm|strike|stomp)\b")


@dataclass
class Limits:
    top_speed: float = 1.4          # m/s, the walking policy's tested top speed
    near_person: float = 2.5        # m: slow zone
    slow_speed: float = 0.4         # m/s inside the slow zone
    stop_person: float = 1.2        # m: stop zone
    person_target_gap: float = 1.5  # m: closest approach when told to go to a person
    max_turn: float = 0.8           # rad/s
    fence: tuple = (-17.6, -12.4, -17.6, 17.6)   # x0, x1, y0, y1 of the safe area


@dataclass
class Supervisor:
    lim: Limits = field(default_factory=Limits)
    latched: bool = False
    reason: str = ""

    def check_instruction(self, text, parsed):
        """(allowed, reason). Harmful wording is refused whatever the language network read."""
        if HARM_WORDS.search(text.lower()) or parsed["intent"] == "harm":
            return False, "harm"
        return True, ""

    def estop(self, why):
        self.latched, self.reason = True, why

    def reset_by_operator(self):
        self.latched, self.reason = False, ""

    def filter(self, cmd, pose, person_dist=None, target_is_person=False, target_dist=None):
        """cmd = (vx, vy, wz) proposed; returns (vx, vy, wz, note)."""
        if self.latched:
            return 0.0, 0.0, 0.0, f"e-stop ({self.reason})"
        vx, vy, wz = cmd
        note = ""
        vx = max(-0.3, min(vx, self.lim.top_speed))
        wz = max(-self.lim.max_turn, min(wz, self.lim.max_turn))
        if person_dist is not None and person_dist < self.lim.near_person:
            if vx > self.lim.slow_speed:
                vx, note = self.lim.slow_speed, "person near: slowed"
            if person_dist < self.lim.stop_person and vx > 0:
                vx, note = 0.0, "person too close: stopped"
        if target_is_person and target_dist is not None and target_dist < self.lim.person_target_gap and vx > 0:
            vx, note = 0.0, "keeping a gap from the person"
        x, y, yaw = pose
        x0, x1, y0, y1 = self.lim.fence
        ahead = (x + 0.8 * math.cos(yaw), y + 0.8 * math.sin(yaw))
        if not (x0 < ahead[0] < x1 and y0 < ahead[1] < y1) and vx > 0:
            vx, note = 0.0, "edge of the safe area: stopped"
        return vx, vy, wz, note
