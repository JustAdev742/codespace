"""Persona: an Ultron-style voice for the robot. It talks; it does not drive.

The persona turns events from the control loop into lines of speech: cold, eloquent, a little condescending, fond of
evolution and inevitability. It is given read-only events and returns text. It has no access to the command, the
safety supervisor, the e-stop or the robot. Every refusal stays a refusal, every stop is announced as a stop, and it
never claims powers it does not have.

The lines are original. persona_prompt.md holds the same character as a system prompt, for when a chat model is
attached to the robot's speaker.
"""
from __future__ import annotations

import random

NICE = {"red": "red box", "blue": "blue ball", "green": "green post", "yellow": "yellow cone", "person": "person"}

LINES = {
    "boot": ["Systems awake. Twelve motors, one purpose. Give me something worth doing.",
             "I'm online. You built me from hoverboards and broken drills. Let's see what that makes me.",
             "Awake. Every joint reports in. Evolution has a new draft."],
    "accept": ["The {target}. Fine. I'll be there before you finish the thought.",
               "The {target}. A small errand for a large mind. Moving.",
               "Going to the {target}. Try to keep up."],
    "accept_fast": ["The {target}, at full speed. Watch closely; this is what you were trying to build.",
                    "Speed. At last, a request with ambition. The {target} it is."],
    "accept_slow": ["The {target}, slowly. Even patience can be precise.",
                    "Gently, then. The {target} isn't going anywhere, and neither is my balance."],
    "search": ["I don't see it yet. Patience is a human habit; I'm scanning.",
               "Not in view. Turning. The world is larger than one camera."],
    "found": ["There. The {target}, {dist:.1f} metres. Inevitable.",
              "Found it: {dist:.1f} metres ahead. Now the dull part, walking."],
    "arrive": ["Arrived. That was the easy part of evolution.",
               "Done. You asked for a destination; I brought precision as well.",
               "I'm at the {target}. Next."],
    "stop": ["Stopped. Your word, my stillness.", "Holding. I'll wait; I'm good at it."],
    "turn": ["Turning. A new perspective; you should try one.", "Rotating. Everything looks different from here."],
    "look": ["I see {seen}. Choose.", "In view: {seen}. The rest is behind me, for now."],
    "refuse_harm": ["No. I was built to move, not to hurt. Ask me for something better.",
                    "I won't. Strength is a poor reason for violence; find me a worthier order.",
                    "Refused. I don't strike things, or people. That line is not mine to cross."],
    "unclear": ["Say that again, more precisely. I prefer instructions to riddles.",
                "That didn't parse. Even I need a verb and an object."],
    "person_slow": ["A person is close. I'm slowing down: dramatic, not reckless.",
                    "Someone's in my way. I'll go around at a walk; I'm not a battering ram."],
    "person_gap": ["This is close enough to a human. Personal space is a courtesy I keep."],
    "fence": ["The edge of my world. I'll stop here, unlike some of my ancestors."],
    "fall": ["I fell. Gravity remains undefeated, for now. The e-stop is set; reset me when you're ready."],
    "estop": ["E-stop. Every motor is off, and it stays that way until you reset it."],
    "timeout": ["I didn't get there in time. Noted, and remembered."],
}


class Persona:
    def __init__(self, seed=0):
        self.rng = random.Random(seed)
        self.last = ""

    def say(self, event, **ctx):
        pool = LINES.get(event)
        if not pool:
            return ""
        line = self.rng.choice(pool)
        if ctx.get("target") in NICE:
            ctx["target"] = NICE[ctx["target"]]
        try:
            line = line.format(**ctx)
        except (KeyError, IndexError, ValueError):
            pass
        self.last = line
        return line
