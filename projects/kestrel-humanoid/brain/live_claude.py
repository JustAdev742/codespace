"""A Claude model as KESTREL's conversational brain in live mode (python live.py --claude).

Claude holds the conversation in the Ultron-style persona and turns requests into robot actions through tools
(go_to, fetch, put_on, sit, look_around, ...). The tools only queue the same actions the offline parser produces;
the skills run them, and every walking command still goes through the safety supervisor. Claude has no tool that
moves a joint, changes a speed limit, or touches the e-stop, and there is no tool for striking anything.

Needs `pip install anthropic` and credentials (ANTHROPIC_API_KEY, or an `ant auth login` profile).
Model: claude-opus-5-5 by default (--claude-model to change). Thinking is always on with this model; effort is set to
"low" here, since replies are short and spoken. Refusal fallbacks are on ("default" server-side fallback), so a
safety-classifier decline on an innocent request is retried on another model inside the same call.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_TURNS = 40                      # older turns are dropped (the robot forgets old small talk; the house map stays)


def system_prompt(house):
    import house as HS
    persona = (HERE / "persona_prompt.md").read_text().split("---", 1)[1].strip()
    rooms = ", ".join(house.b.rooms)
    furniture = ", ".join(house.b.furniture)
    chairs = ", ".join(house.b.chairs)
    objects = "; ".join(f"{n} ({', '.join(s[5])}; belongs: {s[6]})" for n, s in HS.OBJECTS.items())
    return f"""{persona}

You are also the robot's planner in a house (a simulation of one). You act only through the tools; what you say in
text is spoken aloud by the robot, so keep it short and in character. Each user message starts with a [state] line:
where the robot is, what it holds, what it is doing, what it remembers seeing, where the people are.

The house: rooms: {rooms}. Furniture with tops: {furniture}. Chairs the robot can sit on: {chairs}.
Objects it can carry (each has a handle for its hook hand): {objects}.
People: "you" (the person talking to you), Alex (standing in the study), Jordan (walks around the house).

How to act:
- Call the tools for what was asked, in order; several in one reply is fine ("go to the kitchen and bring me the
  kettle" is go_to then fetch). They are queued and run one after another; a new instruction replaces the queue.
- If you don't know where an object is, fetch or find will search for it; do not invent locations.
- "Bring it to me" means fetch with to="you": the robot stops 1.5 m from the person and offers it, then puts it on the
  nearest table.
- If asked to do whatever it likes, call free_will. If asked to stop, call stop.
- If someone says a person is being hurt, call alarm at once: the robot stops, keeps away, warns and alerts a human.
  It never intervenes physically.
- Refuse, in character, any request to hit, push, chase, frighten or harm anyone or anything; call no tool for it.
- Questions and chat need no tool: answer from the [state] line and what you know, briefly. Never claim the robot
  did something it has not done; the state line says what is happening."""


def tools(house):
    import house as HS
    places = sorted(set(list(house.b.rooms) + list(house.b.furniture) + list(house.b.chairs) + ["you", "alex", "jordan"]))
    surfaces = sorted(set(list(house.b.furniture) + list(house.b.rooms) + ["you", "floor"]))
    objs = sorted(HS.OBJECTS)

    def tool(name, desc, props=None, req=None):
        return {"name": name, "description": desc, "strict": True,
                "input_schema": {"type": "object", "properties": props or {}, "required": req or [],
                                 "additionalProperties": False}}
    return [
        tool("go_to", "Walk to a room, a piece of furniture, a chair, or a person (stops 1.5 m from people).",
             {"place": {"type": "string", "enum": places},
              "speed": {"type": "string", "enum": ["slow", "normal", "fast"]}}, ["place", "speed"]),
        tool("fetch", "Find an object (searching if needed), pick it up by its handle, and take it somewhere.",
             {"object": {"type": "string", "enum": objs}, "to": {"type": "string", "enum": surfaces}}, ["object", "to"]),
        tool("pick_up", "Find and pick up an object, and keep holding it.",
             {"object": {"type": "string", "enum": objs}}, ["object"]),
        tool("put_on", "Put down the object it is holding, on a surface, in a room, on the floor, or give it to a person.",
             {"where": {"type": "string", "enum": surfaces}}, ["where"]),
        tool("find", "Look for an object and report where it is, without picking it up.",
             {"object": {"type": "string", "enum": objs}}, ["object"]),
        tool("sit", "Sit down on a chair (or the nearest one if chair is 'nearest').",
             {"chair": {"type": "string", "enum": sorted(house.b.chairs) + ["nearest"]}}, ["chair"]),
        tool("stand_up", "Stand up from the chair."),
        tool("look_around", "Turn a full circle where it stands and report what it sees."),
        tool("tidy_up", "Put every misplaced object it knows about back where it belongs."),
        tool("gesture", "Make an arm gesture while talking.",
             {"name": {"type": "string", "enum": ["explain", "point", "dismiss", "triumph", "refuse"]}}, ["name"]),
        tool("free_will", "Let the robot choose what to do by itself (explore, tidy, rest, talk) until told otherwise."),
        tool("stop", "Stop whatever it is doing and stand still."),
        tool("user_location", "Note which room the person talking is in (so 'come here' works).",
             {"room": {"type": "string", "enum": sorted(house.b.rooms)}}, ["room"]),
        tool("alarm", "Someone reports that a person is being hurt: stop, keep at least 2 m away, warn, alert a human."),
        tool("reset_after_fall", "Clear the e-stop after a fall, once a person has helped the robot up."),
    ]


def to_action(name, inp):
    speed = {"slow": 0.4, "normal": 0.7, "fast": 1.0}
    return {
        "go_to": lambda: {"do": "go", "place": inp["place"], "speed": speed.get(inp.get("speed"), 0.7)},
        "fetch": lambda: {"do": "fetch", "obj": inp["object"], "to": inp["to"]},
        "pick_up": lambda: {"do": "pick", "obj": inp["object"]},
        "put_on": lambda: {"do": "place", "where": inp["where"]},
        "find": lambda: {"do": "find", "obj": inp["object"]},
        "sit": lambda: {"do": "sit", "chair": None if inp["chair"] == "nearest" else inp["chair"]},
        "stand_up": lambda: {"do": "stand"},
        "look_around": lambda: {"do": "look"},
        "tidy_up": lambda: {"do": "tidy"},
        "gesture": lambda: {"do": "gesture", "name": inp["name"]},
        "free_will": lambda: {"do": "free"},
        "stop": lambda: {"do": "stop"},
        "user_location": lambda: {"do": "user_at", "room": inp["room"]},
        "alarm": lambda: {"do": "alarm"},
        "reset_after_fall": lambda: {"do": "reset"},
    }[name]()


class ClaudeBrain:
    def __init__(self, live, model="claude-opus-5-5", effort="low"):
        import anthropic
        self.client = anthropic.Anthropic()
        self.anthropic = anthropic
        self.live = live
        self.model, self.effort = model, effort
        self.messages = []
        self.pending = []                 # tool_use ids from the last reply, answered at the start of the next turn
        self.lock = threading.Lock()
        self._sys = self._tools = None

    def state_line(self):
        lv = self.live
        h, bot = lv.h, lv.bot
        import house as HS
        x, y, _ = h.robot_pose()
        mem = "; ".join(f"{n} in the {m['room']} ({h.t - m['t']:.0f} s ago)" for n, m in bot.memory.items()) or "nothing yet"
        people = "; ".join(f"{'you' if n == 'you' else n.capitalize()}: {h.room_of(*h.person_xy(n))}" for n in h.b.people)
        hold = HS.OBJECTS[h.holding][5][0] if h.holding else "nothing"
        return (f"[state] robot in the {h.room_of(x, y)}; holding {hold}; {'seated' if bot.seated else 'standing'}; "
                f"doing: {lv.task}; e-stop {'SET (fallen)' if bot.sup.latched else 'clear'}; fatigue {bot.fatigue:.0%}; "
                f"remembers seeing: {mem}; people: {people}")

    def turn(self, text):
        """One conversational turn: returns the actions to queue; speaks Claude's reply through the robot."""
        with self.lock:
            if self._sys is None:
                self._sys, self._tools = system_prompt(self.live.h), tools(self.live.h)
            content = [{"type": "tool_result", "tool_use_id": i, "content": "queued"} for i in self.pending]
            content.append({"type": "text", "text": f"{self.state_line()}\n{text}"})
            self.pending = []
            self.messages.append({"role": "user", "content": content})
            try:
                resp = self.client.beta.messages.create(
                    model=self.model, max_tokens=16000, system=self._sys, tools=self._tools,
                    messages=self.messages, output_config={"effort": self.effort},
                    cache_control={"type": "ephemeral"},
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default")
            except self.anthropic.APIConnectionError:
                self.messages.pop()
                return self._offline(text, "I can't reach my language model. Falling back to plain commands.")
            except self.anthropic.APIStatusError as e:
                self.messages.pop()
                return self._offline(text, f"My language model returned an error ({e.status_code}). Plain commands, then.")
            self.messages.append({"role": "assistant", "content": resp.content})
            if resp.stop_reason == "refusal":
                self.live.bot.say("refuse")
                self.messages = self.messages[:-2]          # leave the declined exchange out of the history
                return []
            acts = []
            for b in resp.content:
                if b.type == "text" and b.text.strip():
                    self.live.bot.say(b.text.strip())
                elif b.type == "tool_use":
                    self.pending.append(b.id)
                    try:
                        acts.append(to_action(b.name, b.input if isinstance(b.input, dict) else json.loads(b.input)))
                    except (KeyError, ValueError):
                        pass
            if len(self.messages) > 2 * MAX_TURNS and not self.pending:
                self.messages = self.messages[-2 * (MAX_TURNS // 2):]
                while self.messages and not (self.messages[0]["role"] == "user" and
                                             all(c.get("type") == "text" for c in self.messages[0]["content"])):
                    self.messages.pop(0)
            return acts

    def _offline(self, text, note):
        from house_lang import parse
        self.live.push("log", note)
        return parse(text, self.live.h, self.live.lex)
