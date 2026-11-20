"""A Claude model as KESTREL's conversational brain in live mode (python live.py --claude).

Claude holds the conversation in the Ultron-style persona and turns requests into robot actions through tools
(go_to, fetch, put_on, sit, look_around, ...). The tools only queue the same actions the offline parser produces;
the skills run them, and every walking command still goes through the safety supervisor. Claude has no tool that
moves a joint, changes a speed limit, or touches the e-stop, and there is no tool for striking anything.

Needs `pip install anthropic` and a credential. In order: --claude-key-file PATH; a key file next to this program
(anthropic_key.txt or kestrel_api_anthropic_key.txt, both gitignored); then the SDK's own sources (ANTHROPIC_API_KEY,
ANTHROPIC_AUTH_TOKEN, an `ant auth login` profile). A key file holds the key on its first line and, for a key that
is not scoped to one workspace, the workspace id (wrkspc_...) on the second (or --claude-workspace, or
ANTHROPIC_WORKSPACE_ID). A Console API key (sk-ant-api...)
is sent as an API key; an OAuth token (sk-ant-oat...) is sent as a bearer token with the oauth beta. Whether a token
from a Claude subscription is accepted for direct API calls is Anthropic's decision, not this program's: if the API
answers 401 or 403, the robot says so and falls back to plain commands.
Model: claude-haiku-5-5 by default (--claude-model to change): turning what you say into queued actions is quick,
routing-style work, and Haiku is fast and cheap for it ($0.10 / $0.50 per million tokens). The house agent, which
plans and learns from pictures, uses a stronger model (live.py --agent-model, default claude-sonnet-5-5). Effort is
"low" here, since replies are short and spoken. On models that have it, the "default" server-side refusal fallback
is on, so a safety-classifier decline on an innocent request is retried on another model inside the same call
(Haiku 5.5 has no server-side fallback, so it isn't sent there).
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


KEY_FILES = ("anthropic_key.txt", "kestrel_api_anthropic_key.txt")

# which model does which job (each can be changed on the command line)
MODELS = dict(talk="claude-haiku-5-5",      # live.py --claude: speech -> queued actions (fast, cheap)
              agent="claude-sonnet-5-5",    # live.py --claude --agent: sees every step, plans, learns
              mover="claude-sonnet-5-5")    # train/motion/live_mover.py --claude: composes moves, judges a picture


def create_message(client, betas, **kw):
    """client.beta.messages.create with the server-side refusal fallback on models that have one. Haiku 5.5 has none,
    so the fallback field and its beta header are left out there; if the API rejects the field for another model, the
    call is retried once without it."""
    model = kw.get("model", "")
    base = [b for b in betas if not b.startswith("server-side-fallback")]
    if model.startswith("claude-haiku"):
        return client.beta.messages.create(betas=base, **kw) if base else client.messages.create(**kw)
    try:
        return client.beta.messages.create(betas=betas, fallbacks="default", **kw)
    except Exception as e:                              # a 400 naming the fallbacks field: once more without it
        if getattr(e, "status_code", None) == 400 and "fallback" in str(e).lower():
            return client.beta.messages.create(betas=base, **kw) if base else client.messages.create(**kw)
        raise


def read_key_file(path=None):
    """(key, workspace id or None) from a key file - the key on the first line, optionally a workspace id (wrkspc_...)
    on the second - or (None, None) to let the SDK find a credential itself. The key is never printed or logged."""
    paths = [Path(path).expanduser()] if path else [HERE / n for n in KEY_FILES]
    for p in paths:
        if p.is_file():
            lines = [ln.strip() for ln in p.read_text(encoding="utf-8-sig").splitlines() if ln.strip()]
            if lines:
                return lines[0], (lines[1] if len(lines) > 1 else None)
        elif path:
            raise FileNotFoundError(f"no key file at {p}")
    return None, None


def read_key(path=None):
    return read_key_file(path)[0]


class ClaudeBrain:
    def __init__(self, live, model=None, effort="low", key_file=None, workspace=None):
        import os
        import anthropic
        self.betas = ["server-side-fallback-2026-07-01"]
        model = model or MODELS["talk"]
        key, ws_file = read_key_file(key_file)
        # a key that is not scoped to one workspace must name the workspace on every request
        ws = workspace or ws_file or os.environ.get("ANTHROPIC_WORKSPACE_ID")
        headers = {"anthropic-workspace-id": ws} if ws else None
        if key is None:
            self.client = anthropic.Anthropic(default_headers=headers)   # ANTHROPIC_API_KEY, ..._AUTH_TOKEN or a profile
            self.cred = "the SDK's own credentials"
        elif key.startswith("sk-ant-oat"):                      # an OAuth access token: bearer auth plus the oauth beta
            self.client = anthropic.Anthropic(auth_token=key, default_headers=headers)
            self.betas.append("oauth-2025-04-20")
            self.cred = "an OAuth token from the key file"
        else:
            self.client = anthropic.Anthropic(api_key=key, default_headers=headers)
            self.cred = "an API key from the key file"
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
                resp = create_message(
                    self.client, self.betas, model=self.model, max_tokens=16000, system=self._sys, tools=self._tools,
                    messages=self.messages, output_config={"effort": self.effort},
                    cache_control={"type": "ephemeral"})
            except self.anthropic.APIConnectionError:
                self.messages.pop()
                return self._offline(text, "I can't reach my language model. Falling back to plain commands.")
            except self.anthropic.AuthenticationError as e:
                self.messages.pop()
                return self._offline(text, f"My language model rejected the credential (401, {self.cred}): {e.message}. "
                                           "Plain commands, then.")
            except self.anthropic.PermissionDeniedError as e:
                self.messages.pop()
                return self._offline(text, f"This credential may not call the API (403, {self.cred}): {e.message}. "
                                           "Plain commands, then.")
            except self.anthropic.RateLimitError:
                self.messages.pop()
                return self._offline(text, "My language model is rate-limited or out of credit right now (429). "
                                           "Plain commands, then.")
            except self.anthropic.BadRequestError as e:
                self.messages.pop()
                if "workspace" in str(e.message).lower():
                    return self._offline(text, "My API key is organisation-wide and needs a workspace id: put it on the "
                                               "second line of the key file (wrkspc_...), or pass --claude-workspace. "
                                               "Plain commands, then.")
                return self._offline(text, f"My language model returned an error (400: {e.message}). Plain commands.")
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
