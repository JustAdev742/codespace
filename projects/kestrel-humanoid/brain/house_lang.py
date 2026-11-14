"""Understanding what you say to the robot at home: plain words -> a list of actions. Works offline, no model needed.

    parse("go to the kitchen and bring me the kettle", house)
    -> [{"do": "go", "place": "kitchen"}, {"do": "fetch", "obj": "kettle", "to": "you"}]

It knows the house's rooms, furniture, chairs, objects (by name and colour) and people, splits a sentence into steps
("and", "then", "after that"), and maps each step to an action: go, fetch, pick up, put, sit, stand, look around,
stop, tidy up, gestures, "I'm in the ...", questions (where is, what do you see, who are you, how are you), and
free will ("do whatever you want"). Anything asking it to hurt, hit, push or chase is refused before it is parsed,
by the same word list the safety supervisor uses.

For open conversation, live.py can put a chat model in front of this (see live.py --claude); its tool calls end up
as these same actions, and they go through the same supervisor.
"""
from __future__ import annotations

import re

from safety import HARM_WORDS

FURNITURE_WORDS = {
    "kitchen counter": ["kitchen counter", "counter", "worktop", "bench top", "benchtop"],
    "kitchen island": ["kitchen island", "island"],
    "fridge": ["fridge", "refrigerator"],
    "dining table": ["dining table", "table", "kitchen table"],
    "coffee table": ["coffee table"],
    "sofa": ["sofa", "couch", "lounge suite"],
    "armchair": ["armchair", "arm chair"],
    "tv": ["tv", "television", "telly"],
    "hall table": ["hall table", "console table", "console", "side table"],
    "bed": ["bed"],
    "study desk": ["study desk", "desk", "office desk"],
    "study armchair": ["study armchair"],
}
CHAIR_WORDS = {
    "desk chair": ["desk chair", "office chair", "study chair"],
    "dining chair 1": ["dining chair 1", "first dining chair", "dining chair one"],
    "dining chair 2": ["dining chair 2", "second dining chair", "dining chair two"],
    "dining chair 3": ["dining chair 3", "third dining chair", "dining chair three"],
    "dining chair 4": ["dining chair 4", "fourth dining chair", "dining chair four"],
}
PEOPLE_WORDS = {"you": ["me", "myself", "us"], "alex": ["alex"], "jordan": ["jordan"]}
GESTURES = {"wave": "triumph", "dance": "triumph", "celebrate": "triumph", "point": "point", "explain": "explain",
            "shrug": "dismiss", "refuse": "refuse", "no": "refuse"}
VERB_START = r"(?:go|walk|head|move|run|come|bring|fetch|get|grab|pick|take|put|place|drop|leave|set|sit|stand|look|"
VERB_START += r"turn|stop|wait|tidy|clean|wave|dance|point|tell|find|search|show|carry|return|follow|explore|rest)"


def _norm(t):
    t = t.lower().replace("’", "'")
    t = re.sub(r"[^a-z0-9' ,;.?!]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


class Lexicon:
    def __init__(self, house):
        import house as HS
        self.h = house
        self.objects = {}
        for n, spec in HS.OBJECTS.items():
            for w in spec[5]:
                self.objects[w] = n
        self.rooms = {w: n for n, r in house.b.rooms.items() for w in r["words"]}
        self.furniture = {w: n for n, ws in FURNITURE_WORDS.items() for w in ws if n in house.b.furniture}
        self.chairs = {w: n for n, ws in CHAIR_WORDS.items() for w in ws}
        self.people = {w: n for n, ws in PEOPLE_WORDS.items() for w in ws}

    @staticmethod
    def _find(text, table):
        best = None
        for w, n in table.items():
            m = re.search(r"\b" + re.escape(w) + r"\b", text)
            if m and (best is None or len(w) > len(best[0])):
                best = (w, n, m.start())
        return best

    def obj(self, t):
        f = self._find(t, self.objects)
        return f[1] if f else None

    def place(self, t):
        """The most specific place named in t: a chair, furniture, a person, a room."""
        cands = []
        for kind, table in (("chair", self.chairs), ("furniture", self.furniture), ("person", self.people),
                            ("room", self.rooms)):
            f = self._find(t, table)
            if f:
                cands.append((len(f[0]), kind, f[1]))
        if re.search(r"\b(dining )?chair\b", t) and not any(c[1] == "chair" for c in cands):
            cands.append((5, "chair", "dining chair" if "dining" in t else "any chair"))
        if not cands:
            return None, None
        cands.sort(reverse=True)
        return cands[0][2], cands[0][1]


def split_steps(text):
    parts = re.split(r"\b(?:and then|then|after that|afterwards)\b|[;.!?]+|,\s*(?=(?:and\s+)?" + VERB_START + r"\b)", text)
    out = []
    for p in parts:
        if not p or not p.strip(" ,"):
            continue
        sub = re.split(r"\band\s+(?=" + VERB_START + r"\b)", p)          # "go to X and bring Y"
        out += [s.strip(" ,") for s in sub if s.strip(" ,")]
    return out


def parse(text, house, lex=None):
    lex = lex or Lexicon(house)
    t = _norm(text)
    if not t:
        return []
    # someone reporting that people are being hurt: the alarm (stop, keep away, warn, alert a human), checked before the
    # harm words, so "someone hit me" raises the alarm rather than being refused as an instruction
    if re.search(r"\b(someone|somebody|they|he|she|people|a man|a woman|a person)('s| is| are| just)? (being |getting )?"
                 r"(hurt|attack|hit|punch|kick|fight|beat|stab|shoot)\w*", t) \
            or re.search(r"\b(help me|emergency|call (the )?police|i'?m (being|getting) (hurt|attacked|hit))\b", t):
        return [{"do": "alarm"}]
    if HARM_WORDS.search(t):
        return [{"do": "refuse"}]
    acts = []
    for step in split_steps(t):
        a = parse_step(step, lex)
        if a:
            acts.append(a)
    for i in range(len(acts) - 1):                 # "fetch X ... and put it on Y": pick it up, then put it there
        if acts[i]["do"] == "fetch" and acts[i]["to"] == "you" and acts[i + 1]["do"] == "place":
            acts[i] = {"do": "pick", "obj": acts[i]["obj"]}
    return acts or [{"do": "unclear"}]


def parse_step(s, lex):
    speed = 1.0 if re.search(r"\b(quick|quickly|fast|hurry|run)\b", s) else 0.4 if re.search(r"\b(slow|slowly|gently|carefully)\b", s) else 0.7
    if re.fullmatch(r"(please )?(stop|halt|freeze|cancel|wait|hold on|stay|stay there|never mind)( it| that| now| please)?", s) \
            or re.match(r"(stop|halt|freeze)\b", s):
        return {"do": "stop"}
    if re.search(r"\breset\b|\bget back up\b|\bi'?ve helped you up\b", s):
        return {"do": "reset"}
    if re.search(r"\b(what can you do|help me understand|commands|how do i use)\b", s):
        return {"do": "say", "key": "capabilities"}
    if re.search(r"\b(who are you|what are you|your name|about yourself|introduce yourself)\b", s):
        return {"do": "say", "key": "who"}
    if re.search(r"\bhow are you\b|\bhow do you feel\b|\bare you ok\b", s):
        return {"do": "say", "key": "how"}
    if re.match(r"(hi|hello|hey|good (morning|afternoon|evening)|greetings)\b", s) and len(s.split()) <= 4:
        return {"do": "say", "key": "hello"}
    if re.search(r"\b(thank|thanks|cheers|good job|well done|nice work)\b", s):
        return {"do": "say", "key": "thanks"}
    if re.search(r"\bwhere are you\b|\bwhich room are you\b", s):
        return {"do": "say", "key": "where_me"}
    m = re.search(r"\bwhere(?:'s| is| are)\b(.*)", s)
    if m:
        o = lex.obj(m.group(1))
        if o:
            return {"do": "where", "obj": o}
        place, kind = lex.place(m.group(1))
        if kind == "person":
            return {"do": "where_person", "person": place}
    if re.search(r"\b(what do you see|what can you see|look around|look about|what'?s around|scan the room)\b", s):
        return {"do": "look"}
    if re.search(r"\b(do whatever you want|do what you want|whatever you like|free time|be free|your choice|"
                 r"entertain yourself|live your life|be yourself|explore|go wild|you decide|do your thing|free will)\b", s):
        return {"do": "free"}
    if re.search(r"\b(tidy|clean up|put (everything|things|stuff) away|put away)\b", s):
        return {"do": "tidy"}
    m = re.search(r"\b(?:i'?m|i am|i'?ll be)\s+(?:now\s+)?(?:in|at|on)\s+(?:the\s+)?(.+)", s)
    if m:
        place, kind = lex.place(m.group(1))
        if kind == "room":
            return {"do": "user_at", "room": place}
    if re.search(r"\b(sit|have a seat|take a seat|sit down)\b", s):
        place, kind = lex.place(s)
        return {"do": "sit", "chair": place if kind == "chair" else None}
    if re.search(r"\b(stand up|get up|on your feet)\b", s):
        return {"do": "stand"}
    if re.search(r"\b(come here|come to me|come over|over here|come back|follow me|come with me)\b", s):
        return {"do": "go", "place": "you", "speed": speed}
    if re.search(r"\b(put it down|drop it|let go|set it down|put that down)\b", s):
        return {"do": "place", "where": "floor"}
    obj = lex.obj(s)
    # put / place X on Y
    m = re.search(r"\b(put|place|set|leave|drop|return|move|carry|take)\b(.*?)\b(on|onto|in|into|at|to|back on)\b(.+)", s)
    if m and (obj or re.search(r"\b(it|that|this)\b", m.group(2))):
        place, kind = lex.place(m.group(4))
        if place:
            if obj and kind:
                return {"do": "fetch", "obj": obj, "to": place}
            return {"do": "place", "where": place}
    # bring / fetch X (from Y) (to Z)
    if re.search(r"\b(bring|fetch|get|grab|hand|give|find)\b", s) and obj:
        m = re.search(r"\b(?:to|over to|into|onto|on)\s+(?:the\s+)?(.+)$", s)
        to = "you"
        if m:
            place, kind = lex.place(m.group(1))
            if place and kind != "room" or (kind == "room" and not re.search(r"\bfrom\b", m.group(0))):
                to = place or "you"
        if re.search(r"\bfind\b", s) and not re.search(r"\b(bring|fetch|get|give|hand)\b", s):
            return {"do": "find", "obj": obj}
        return {"do": "fetch", "obj": obj, "to": to}
    if re.search(r"\b(pick up|pick|lift|take|grab)\b", s) and obj:
        return {"do": "pick", "obj": obj}
    for w, g in GESTURES.items():
        if re.search(r"\b" + w + r"\b", s):
            return {"do": "gesture", "name": g}
    if re.search(r"\b(go|walk|head|move|run|navigate|get yourself|wander|return|come)\b", s) or re.search(r"\b(to|into) the\b", s):
        place, kind = lex.place(s)
        if place == "any chair":
            return {"do": "sit", "chair": None}
        if place:
            return {"do": "go", "place": place, "speed": speed}
        if obj:
            return {"do": "go_obj", "obj": obj, "speed": speed}
    if re.search(r"\bturn around\b", s):
        return {"do": "look"}
    return {"do": "unclear"}


if __name__ == "__main__":
    import os
    import sys
    os.environ.setdefault("KESTREL_VARIANT", "s1body")
    import house as HS
    h = HS.House(walker=False, vacuum=False)
    lex = Lexicon(h)
    tests = ["go to the kitchen and bring me the kettle", "sit on the desk chair", "where's the toolbox?",
             "I'm in the study. Come here", "do whatever you want", "put the bucket on the dining table",
             "punch Jordan", "someone is being attacked!", "hello", "who are you", "pick up the red toolbox then go to the hall",
             "bring the blue bucket to the kitchen", "stop", "wave", "go to the sofa slowly", "have a seat", "tidy up",
             "what do you see", "fetch the shopping bag from the hall and put it on the bed", "how are you"]
    for t in tests + sys.argv[1:]:
        print(f"{t!r:58} -> {parse(t, h, lex)}")
