"""Tell the G1 what to do and watch it move - no training: motion matching on human data + walker + balance control.

    python -m motion.live_mover --library runs/motion/bandai_library.npz             # type commands
    python -m motion.live_mover --library ... --claude                               # Claude decides the moves
    python -m motion.live_mover --library ... --local qwen3:8b                       # a local model (Ollama) decides

A 3D window shows the robot; type in the terminal. Plain commands always work: walk, walk fast, walk slowly, back,
step left / right, turn left / right, stop, any action from the motion library (wave, bow, guide, call, byebye,
raise hands, respond, ...), "style tired" (or old, proud, active, happy, sad, ... - any style in the library),
"free" (it does whatever it likes until you say stop), "list", "quit".

With --claude or --local the language model reads what you say and answers with a sequence of moves (one `move` tool
call per step: an action or a walk, a style, how long, or any movement described in words for the generator). The tool
only offers the library's actions; the library has no fighting moves (they are filtered out when it is built) and the
generator refuses such descriptions, so no model can make the robot strike.

With --claude it also sees what happened: when its moves are done it gets a picture of the robot and a report (did it
stay up, how far it went and turned, how low it got), and can adjust and try again - up to three times on its own per
request. Moves that worked can be saved under a name and replayed later, and it keeps notes on how this body moves;
both live in runs/motion/g1_memory.json, and the movements people asked for are kept there too (practice.py can take
them as prompts, so the generator practises what people actually want).

The library is built once from the Bandai Namco motion dataset (see motion/README.md, "Moving without training").
"""
from __future__ import annotations

import argparse
import json
import queue
import re
import sys
import threading
import time
from pathlib import Path

import numpy as np

from .mover import DT, LIMITS, Mover
from .safety import _RX as COMBAT

WALKS = {"walk", "walk-back", "walk-left", "walk-right", "walk-turn-left", "walk-turn-right", "run", "dash"}


class Moves:
    """A queue of (action, vx, vy, turn, style, seconds); the physics loop pulls from it."""

    def __init__(self, gestures, styles, can_generate=False):
        self.q = queue.Queue()
        self.gestures, self.styles = gestures, styles
        self.can_generate = can_generate
        self.style = None
        self.free = False
        self.watch = None                                # set while a language model waits to see its moves done

    def put(self, action="stand", vx=0.0, vy=0.0, turn=0.0, style=None, seconds=None, arms=None, reach=None,
            crouch=0.0, lean=0.0, look=0.0, text=None, **_):
        if action == "generate":
            if not (self.can_generate and text):
                print("  (no generator loaded: train one with python -m motion.generator train, see README)")
                return
        elif action not in ("stand", "walk") and action not in self.gestures:
            print(f"  (no '{action}' in the motion library)")
            return
        if arms and arms not in self.gestures:
            arms = None
        self.q.put(dict(action=action, vx=float(vx or 0), vy=float(vy or 0), wz=float(turn or 0),
                        style=style or self.style, arms=arms, reach=reach, crouch=float(crouch or 0),
                        lean=float(lean or 0), look=float(look or 0), text=text, seconds=seconds))

    def clear(self):
        while not self.q.empty():
            self.q.get_nowait()

    # -------------------------------------------------------------------------------------------- plain commands
    def plain(self, text):
        t = text.lower().strip()
        if not t:
            return True
        if t in ("quit", "exit", "q"):
            return False
        if t == "list":
            print("  actions:", ", ".join(sorted(self.gestures)))
            print("  styles: ", ", ".join(sorted(self.styles)))
            return True
        if t in ("free", "free will", "do what you want", "whatever you want"):
            self.free = True
            print("  free will: on (say stop)")
            return True
        if t.startswith("style"):
            s = t.split(None, 1)[1].strip() if " " in t else ""
            self.style = s if s in self.styles else None
            print(f"  style: {self.style or 'any'}")
            return True
        self.free = False
        self.clear()
        speed = 0.4 if "fast" in t or "quick" in t else 0.15 if "slow" in t else 0.3
        if t in ("stop", "stand", "halt", "wait"):
            self.put("stand")
        elif "point" in t:
            self.put("stand", reach={"right": (0.45, -0.15, 1.05)} if "left" not in t else {"left": (0.45, 0.15, 1.05)})
        elif "reach up" in t or "hands up" in t:
            self.put("stand", reach={"right": (0.2, -0.2, 1.3), "left": (0.2, 0.2, 1.3)})
        elif "pick" in t or "reach down" in t or "floor" in t:
            self.put("stand", crouch=0.2, reach={"right": (0.35, -0.15, 0.45)}, seconds=4)
            self.put("stand")
        elif "crouch" in t or "squat" in t or "duck" in t:
            self.put("stand", crouch=0.2)
        elif "look" in t:
            self.put("stand", look=0.5 if "left" in t else -0.5 if "right" in t else 0.0, lean=0.2 if "down" in t else 0.0)
        elif ("walk" in t or "go" in t) and self.find(t.replace("walk", "")):
            self.put("walk", speed, arms=self.find(t.replace("walk", "")))       # e.g. "walk and wave"
        elif "turn" in t:
            self.put("walk", 0.0, 0.0, 0.3 if "left" in t else -0.3, seconds=5.2)      # about 90 degrees
            self.put("stand")
        elif "back" in t:
            self.put("walk", -0.15)
        elif "left" in t or "right" in t:
            self.put("walk", 0.0, 0.1 if "left" in t else -0.1)
        elif "walk" in t or "go" in t or "forward" in t:
            self.put("walk", speed)
        else:
            act = self.find(t)
            if t.startswith("do ") and self.can_generate:          # "do <anything>": the generator makes it
                self.put("generate", text=text.strip()[3:])
            elif act:
                self.put(act)
            elif self.can_generate:                                 # not a library action: describe it to the generator
                self.put("generate", text=text.strip())
            else:
                print("  ? try: walk, turn left, stop, wave, bow, guide, free, style tired, list")
        return True

    def find(self, t):
        words = re.sub(r"[^a-z ]", " ", t).split()
        if not words:
            return None
        best, key = None, (0,)
        for g in sorted(self.gestures):
            parts = g.split("-")
            sc = sum(1 for w in words if any(p.startswith(w[:4]) for p in parts))
            # ties: the right hand (most people's default), then the simplest name
            k = (sc, "right" in parts, -len(parts))
            if sc > 0 and k > key:
                best, key = g, k
        return best

    def next_free(self, rng):
        r = rng.random()
        if r < 0.5:
            self.put("walk", rng.uniform(0.1, 0.3), 0.0, rng.choice([0.0, 0.0, rng.uniform(-0.3, 0.3)]),
                     seconds=rng.uniform(2, 6), style=rng.choice([None] + sorted(self.styles)))
        elif r < 0.8:
            self.put(rng.choice(sorted(self.gestures - WALKS)), seconds=rng.uniform(3, 5))
        else:
            self.put("stand", seconds=rng.uniform(1, 3))


# ------------------------------------------------------------------------------------------------ language models
def move_tool(gestures, styles, can_generate=False):
    acts = ["stand", "walk"] + sorted(gestures - WALKS) + (["generate"] if can_generate else [])
    return {
        "name": "move",
        "description": ("Queue one move for the robot's body. Several calls make a sequence (they run in order). "
                        "walk: vx forward m/s (-0.15..0.35), vy sideways m/s (-0.1..0.1, left positive), turn rad/s "
                        "(-0.3..0.3, left positive; 0.3 for 5.2 s is about 90 degrees). Other actions are motions from human motion capture, done in place. "
                        "seconds: how long (default: until the next move)." +
                        (" generate: any other movement, described in words in `text` (e.g. 'a person dances "
                         "happily', 'stretch both arms above the head'); a generative model trained on hours of human "
                         "motion makes it, and the balance controller keeps it physical." if can_generate else "")),
        "input_schema": {"type": "object", "properties": {
            "action": {"type": "string", "enum": acts},
            "vx": {"type": "number"}, "vy": {"type": "number"}, "turn": {"type": "number"},
            "style": {"type": "string", "enum": sorted(styles), "description": "how it moves (optional)"},
            "arms": {"type": "string", "enum": sorted(gestures - WALKS),
                     "description": "an action for the arms only, layered over walking or standing (optional)"},
            "reach": {"type": "object", "description": "hand targets (optional), metres from the floor between the "
                      "feet: x forward, y left, z up; e.g. {\"right\": [0.45, -0.15, 1.05]} points ahead, z 0.45 with "
                      "crouch 0.2 reaches low. The arm is about 0.6 m long, the shoulders about 1.1 m up.",
                      "properties": {"left": {"type": "array", "items": {"type": "number"}},
                                     "right": {"type": "array", "items": {"type": "number"}}}},
            "crouch": {"type": "number", "description": "lower the body, m (0..0.25, standing only)"},
            "lean": {"type": "number", "description": "bend the torso forward, rad (-0.3..0.5)"},
            "look": {"type": "number", "description": "turn the torso to look, rad (+ left, -0.6..0.6)"},
            "text": {"type": "string", "description": "for action generate: the movement, described in words"},
            "seconds": {"type": "number"}}, "required": ["action"]},
    }


SYSTEM = ("You control the body of a Unitree G1 humanoid robot (1.32 m tall) in a physics simulation. It moves by "
          "playing back real human motion capture, kept balanced by a controller. Turn what the person says into moves "
          "with the move tool: a sequence is fine (walk 3 s, turn, wave), and layers combine (walk with arms=wave, "
          "crouch with a hand reaching low, look while pointing). Compose new movements from these parts when no single "
          "action fits. If they ask you to do whatever you like, choose moves yourself. Keep spoken replies to one short sentence. It cannot run, jump, fight or strike anyone: "
          "refuse anything meant to hurt someone, briefly, and call no tool for it.")


MEMORY = Path(__file__).resolve().parents[1] / "runs" / "motion" / "g1_memory.json"


def load_memory(path=MEMORY):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return dict(moves={}, notes=[], requests=[])


def save_memory(mem, path=MEMORY):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(mem, indent=1))


class ClaudeMover:
    """Claude moves the G1 and sees the result: after the moves it asked for have been done, it gets a picture of the
    robot and how it went (did it stay up, where it is) as the tool result, and decides what next. Moves that worked
    can be saved under a name (remember_move) and replayed; notes and what people asked for are kept in
    runs/motion/g1_memory.json (the asked-for motions also feed practice.py). The conversation is only ever appended to."""

    AUTO_ROUNDS = 3                                   # follow-ups on its own after one request, then wait for you

    def __init__(self, moves, model="claude-sonnet-5-5", key_file=None, snapshot=None):
        import anthropic
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "brain"))
        from live_claude import create_message, read_key_file
        self._create = create_message
        key, ws = read_key_file(key_file)
        headers = {"anthropic-workspace-id": ws} if ws else None
        self.betas = ["server-side-fallback-2026-07-01"]
        if key is None:
            self.client = anthropic.Anthropic(default_headers=headers)
        elif key.startswith("sk-ant-oat"):
            self.client = anthropic.Anthropic(auth_token=key, default_headers=headers)
            self.betas.append("oauth-2025-04-20")
        else:
            self.client = anthropic.Anthropic(api_key=key, default_headers=headers)
        self.moves, self.model = moves, model
        self.tools = [move_tool(moves.gestures, moves.styles, moves.can_generate), REMEMBER_TOOL, REPLAY_TOOL, NOTE_TOOL]
        self.msgs, self.pending, self.rounds = [], [], 0
        self.lock = threading.Lock()
        self.snapshot = snapshot                      # () -> PNG base64 of the robot now
        self.mem = load_memory()

    def system(self):
        learned = "\n".join(f"- {n}: {m['description']} (worked {m.get('wins', 1)}x)" for n, m in self.mem["moves"].items())
        notes = "\n".join(f"- {x}" for x in self.mem["notes"][-25:])
        return (SYSTEM + " After the moves you asked for have been done you get a picture of the robot and how it went, "
                "as the move tool's result: check it, and adjust or try another way if it didn't look right or the "
                "robot fell. When a move (or sequence) worked well, remember_move it under a name; note what you learn."
                + (f"\nMoves you learned (do one with replay_move):\n{learned}" if learned else "")
                + (f"\nYour notes:\n{notes}" if notes else ""))

    def _image(self):
        if self.snapshot is None:
            return []
        try:
            return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": self.snapshot()}}]
        except Exception:                             # no renderer on this computer: words only
            return []

    def _call(self):
        kw = dict(model=self.model, max_tokens=8000, system=self.system(), tools=self.tools, messages=self.msgs,
                  output_config={"effort": "low"}, cache_control={"type": "ephemeral"})
        create = getattr(self, "_create", None)
        if create is None:
            sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "brain"))
            from live_claude import create_message as create
        r = create(self.client, self.betas, **kw)
        self.msgs.append({"role": "assistant", "content": r.content})
        if r.stop_reason == "refusal":
            print("  robot: I won't do that.")
            return
        calls = [b for b in r.content if b.type == "tool_use"]
        for b in r.content:
            if b.type == "text" and b.text.strip():
                print("  robot:", b.text.strip())
        if not calls:
            return
        moves = [b for b in calls if b.name in ("move", "replay_move")]
        if moves:
            self.moves.free = False
            self.moves.clear()
            self.moves.watch = dict(start=None)           # the physics loop reports back when these are done
        quick = []
        last_move = moves[-1].id if moves else None
        for b in calls:
            if b.name == "move":
                inp = dict(b.input)
                if b.id != last_move and not inp.get("seconds"):  # mid-sequence: an untimed move would be cut at once
                    inp["seconds"] = 6.4 if inp.get("action") == "generate" else 3.0 if inp.get("action") == "walk" else 4.0
                if inp.get("action") == "generate" and inp.get("text"):
                    self.mem["requests"] = (self.mem["requests"] + [inp["text"]])[-500:]
                self.moves.put(**inp)
            elif b.name == "replay_move":
                m = self.mem["moves"].get(b.input.get("name", ""))
                steps = m["moves"] if m else [{"action": "stand", "seconds": 1}]
                for k, step in enumerate(steps):
                    step = dict(step)
                    if (k < len(steps) - 1 or b.id != last_move) and not step.get("seconds"):
                        step["seconds"] = 6.4 if step.get("action") == "generate" else 4.0
                    self.moves.put(**step)
            elif b.name == "remember_move":
                try:
                    steps = json.loads(b.input["moves_json"])
                    self.mem["moves"][b.input["name"]] = dict(description=b.input["description"], moves=steps,
                                                              wins=self.mem["moves"].get(b.input["name"], {}).get("wins", 0) + 1)
                    quick.append((b.id, f"remembered '{b.input['name']}'"))
                except (ValueError, KeyError, TypeError):
                    quick.append((b.id, "moves_json must be a JSON list of move inputs"))
            elif b.name == "note":
                self.mem["notes"] = (self.mem["notes"] + [b.input["text"]])[-60:]
                quick.append((b.id, "noted"))
        save_memory(self.mem)
        self.pending = [b.id for b in moves] + [q[0] for q in quick]
        self.quick = dict(quick)
        if not moves:                                 # nothing to wait for: answer at once
            self._report_locked("")

    def turn(self, text):
        with self.lock:
            content = [{"type": "tool_result", "tool_use_id": i, "content": "stopped: the person said something new"}
                       for i in self.pending]
            self.pending = []
            content += [{"type": "text", "text": text}] + self._image()
            if self.msgs and self.msgs[-1]["role"] == "user":      # an unanswered report: add to it
                self.msgs[-1]["content"] = list(self.msgs[-1]["content"]) + content
            else:
                self.msgs.append({"role": "user", "content": content})
            self.rounds = 0
            try:
                self._call()
            except Exception as e:                    # offline, bad key, out of credit: plain commands still work
                print(f"  (language model unavailable: {type(e).__name__}; using plain commands)")
                return self.moves.plain(text)
        return True

    def moves_done(self, status):
        """Called by the physics loop when the queued moves are finished (or the robot fell)."""
        threading.Thread(target=self._report, args=(status,), daemon=True).start()

    def _report(self, status):
        with self.lock:
            self._report_locked(status)

    def _report_locked(self, status):
        if not self.pending:
            return
        res = []
        for k, i in enumerate(self.pending):
            if i in getattr(self, "quick", {}):
                res.append({"type": "tool_result", "tool_use_id": i, "content": self.quick[i]})
            elif k == max(j for j, p in enumerate(self.pending) if p not in getattr(self, "quick", {})):
                res.append({"type": "tool_result", "tool_use_id": i,
                            "content": [{"type": "text", "text": f"done: {status}"}] + self._image()})
            else:
                res.append({"type": "tool_result", "tool_use_id": i, "content": "done"})
        self.pending = []
        self.msgs.append({"role": "user", "content": res})
        if self.rounds < self.AUTO_ROUNDS:
            self.rounds += 1
            try:
                self._call()
            except Exception as e:
                print(f"  (language model unavailable: {type(e).__name__})")


REMEMBER_TOOL = {"name": "remember_move", "description": "Save a move or sequence that worked under a name, to do again "
                 "with replay_move. moves_json: a JSON list of move inputs as you gave them.",
                 "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"},
                                  "moves_json": {"type": "string"}}, "required": ["name", "description", "moves_json"]}}
REPLAY_TOOL = {"name": "replay_move", "description": "Do a move you saved with remember_move (it is queued like moves are).",
               "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}
NOTE_TOOL = {"name": "note", "description": "Write down something you learned about moving this body.",
             "input_schema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}


class LocalMover:
    """Any OpenAI-compatible chat server (Ollama, LM Studio)."""

    def __init__(self, moves, model, url="http://localhost:11434/v1"):
        t = move_tool(moves.gestures, moves.styles, moves.can_generate)
        self.tool = {"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                      "parameters": t["input_schema"]}}
        self.moves, self.model, self.url, self.msgs = moves, model, url.rstrip("/"), []

    def turn(self, text):
        import urllib.request
        self.msgs = (self.msgs + [{"role": "user", "content": text}])[-20:]
        body = {"model": self.model, "messages": [{"role": "system", "content": SYSTEM + " Do not think aloud."}] + self.msgs,
                "tools": [self.tool]}
        try:
            req = urllib.request.Request(f"{self.url}/chat/completions", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                msg = json.loads(r.read().decode())["choices"][0]["message"]
        except Exception as e:
            print(f"  (local model unavailable: {type(e).__name__}; using plain commands)")
            return self.moves.plain(text)
        say = re.sub(r"<think>.*?</think>", "", msg.get("content") or "", flags=re.S).strip()
        if say:
            print("  robot:", say)
        calls = msg.get("tool_calls") or []
        if calls:
            self.moves.free = False
            self.moves.clear()
            for c in calls:
                try:
                    a = json.loads(c["function"]["arguments"])
                    self.moves.put(**a)
                except (ValueError, TypeError, KeyError):
                    pass
        elif not say:
            return self.moves.plain(text)
        self.msgs.append({"role": "assistant", "content": say or "OK."})
        return True


class Snapshot:
    """A picture of the robot for Claude, rendered off-screen on the physics thread (OpenGL contexts belong to one
    thread) about once a second; other threads read the latest PNG."""

    def __init__(self, w=480, h=360):
        import mujoco

        from .demo_mover import scene_model
        self.mj = mujoco
        self.m = scene_model()                            # the visual G1 on a checker floor (the floor shows distance)
        self.d = mujoco.MjData(self.m)
        self.r = mujoco.Renderer(self.m, h, w)
        self.cam = mujoco.MjvCamera()
        self.cam.distance, self.cam.elevation = 3.2, -15
        self.png = None

    def update(self, data, yaw):
        import base64
        import io
        from PIL import Image
        self.d.qpos[:] = data.qpos[:self.m.nq]
        self.mj.mj_forward(self.m, self.d)
        self.cam.lookat[:] = [data.qpos[0], data.qpos[1], 0.65]
        self.cam.azimuth = np.degrees(yaw) + 150          # in front of it, a little to its left
        self.r.update_scene(self.d, self.cam)
        buf = io.BytesIO()
        Image.fromarray(self.r.render()).save(buf, "PNG")
        self.png = base64.b64encode(buf.getvalue()).decode()

    def __call__(self):
        if self.png is None:
            raise RuntimeError("no picture yet")
        return self.png


def yaw_of(q):
    w, x, y, z = q
    return float(np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))


# ----------------------------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--library", default="runs/motion/bandai_library.npz")
    ap.add_argument("--claude", action="store_true")
    ap.add_argument("--claude-model", default="claude-sonnet-5-5",
                    help="model that decides the moves and checks the pictures (claude-opus-5-5: stronger, about twice the cost)")
    ap.add_argument("--claude-key-file", default=None)
    ap.add_argument("--local", default=None, help="model name on an OpenAI-compatible server, e.g. qwen3:8b")
    ap.add_argument("--local-url", default="http://localhost:11434/v1")
    ap.add_argument("--no-viewer", action="store_true", help="no 3D window (prints the state instead)")
    ap.add_argument("--generator", default="runs/motion/generator/model.pt",
                    help="trained text-to-motion model (generator.py); used when the file exists")
    a = ap.parse_args()

    print("loading the motion library ...", flush=True)
    gen = None
    if a.generator and Path(a.generator).exists():
        from .generator import Generator
        print("loading the text-to-motion generator ...", flush=True)
        gen = Generator(a.generator)
    mv = Mover(a.library, generator=gen)
    gestures = {x for x in set(mv.db.actions) if not COMBAT.search(x.replace("-", "_"))}
    styles = {s for s in set(mv.db.styles) if s}
    moves = Moves(gestures, styles, can_generate=gen is not None)
    brain = ClaudeMover(moves, a.claude_model, a.claude_key_file) if a.claude else \
        LocalMover(moves, a.local, a.local_url) if a.local else None
    snap = None
    if isinstance(brain, ClaudeMover):
        try:
            snap = Snapshot()
            brain.snapshot = snap
        except Exception as e:                          # no off-screen OpenGL here: Claude gets words only
            print(f"  (no pictures for Claude: {type(e).__name__})")
    print(f"{len(mv.db.names)} human clips; actions: {', '.join(sorted(gestures - WALKS))}")
    print("type a command (walk, turn left, wave, bow, free, style tired, list, quit)" +
          (", or describe any movement (do a little dance, stretch your arms)" if gen else "") +
          (" or just talk to it" if brain else ""))

    alive = threading.Event()
    alive.set()

    def reader():
        while alive.is_set():
            try:
                line = input("> ")
            except EOFError:
                break
            ok = brain.turn(line) if (brain and line.strip() and line.strip().lower() not in ("quit", "exit", "q", "list", "free", "stop")) \
                else moves.plain(line)
            if not ok:
                break
        alive.clear()

    threading.Thread(target=reader, daemon=True).start()

    viewer, vd, vm = None, None, None
    if not a.no_viewer:
        import mujoco
        import mujoco.viewer
        from . import g1 as G
        try:
            vm = G.load_model(visual=True)
        except Exception:                               # no meshes: show the collision model
            vm = mv.m
        vd = mujoco.MjData(vm)
        viewer = mujoco.viewer.launch_passive(vm, vd, show_left_ui=False, show_right_ui=False)
        viewer.cam.distance, viewer.cam.elevation = 3.0, -15

    rng = np.random.default_rng()
    current, until, started = None, 0.0, 0.0
    last_snap = -9.0

    def status(fell=False):
        w = moves.watch
        p0, p = w["start"], mv.d.qpos
        yaw = np.degrees(yaw_of(p[3:7]) - w["yaw"])
        return (("the robot FELL during the moves (it has been restarted, standing). " if fell else "the robot stayed up. ")
                + f"Played: {'; '.join(w['played']) or 'nothing'}. It moved {p[0] - p0[0]:+.2f} m forward/back and "
                f"{p[1] - p0[1]:+.2f} m left/right (world), turned {(yaw + 180) % 360 - 180:+.0f} degrees; lowest pelvis "
                f"height {w['low']:.2f} m (standing is about 0.79). The picture is from in front of it, to its left.")
    sim_t, wall0, last_print, last_sync = 0.0, time.time(), 0.0, 0.0
    while alive.is_set() and (viewer is None or viewer.is_running()):
        # next move: a timed move runs out; an untimed one lasts until another is queued
        if current is None or (until and sim_t >= until) or (not current["seconds"] and (not moves.q.empty() or moves.free)):
            if moves.q.empty() and moves.free:
                moves.next_free(rng)
            if not moves.q.empty():
                current = moves.q.get_nowait()
                started = sim_t
                secs = current["seconds"]
                try:
                    mv.set_intent(**{k: v for k, v in current.items() if k != "seconds"})
                except ValueError as e:                     # e.g. a refused description
                    print(f"\n  {e}\n> ", end="", flush=True)
                    mv.set_intent("stand")
                    current["action"] = "stand"
                until = sim_t + secs if secs else 0.0
                if moves.watch is not None:
                    if moves.watch["start"] is None:
                        moves.watch.update(start=mv.d.qpos[:3].copy(), yaw=yaw_of(mv.d.qpos[3:7]), played=[], low=9.0)
                    moves.watch["played"].append(current["action"] + (f" '{current['text']}'" if current.get("text") else ""))
                fmt = lambda v: f"{v:.2f}" if isinstance(v, float) else str(v)
                desc = ", ".join(f"{k} {fmt(v)}" for k, v in current.items() if v not in (None, 0.0, {}) and k != "action")
                print(f"\n  moving: {current['action']}" + (f" ({desc})" if desc else "") + "\n> ", end="", flush=True)
            elif current is not None and until:
                mv.set_intent("stand")
                current, until = None, 0.0
        if not mv.step():
            print("\n  the robot fell - restarting it standing")
            fell = moves.watch is not None and moves.watch["start"] is not None
            if fell:
                if snap is not None:
                    snap.update(mv.d, yaw_of(mv.d.qpos[3:7]))      # the picture shows it fallen
                report = status(fell=True)
            mv = Mover(a.library, db=mv.db, generator=gen)
            moves.clear()
            current, until = None, 0.0
            if fell:
                moves.watch = None
                brain.moves_done(report)
        elif moves.watch is not None and moves.watch["start"] is not None:
            moves.watch["low"] = min(moves.watch["low"], float(mv.d.qpos[2]))
            # done: nothing queued and the last move finished (a timed one ran out; an untimed one has had a while -
            # a generated motion its length)
            hold = 6.4 if current is not None and current.get("action") == "generate" else 4.0   # two generated chunks
            if moves.q.empty() and (current is None or (not current["seconds"] and sim_t - started >= hold)):
                if snap is not None:
                    snap.update(mv.d, yaw_of(mv.d.qpos[3:7]))
                report = status()
                moves.watch = None
                brain.moves_done(report)
        if snap is not None and sim_t - last_snap >= 1.0:          # a fresh picture for whatever is said next
            last_snap = sim_t
            snap.update(mv.d, yaw_of(mv.d.qpos[3:7]))
        sim_t += DT
        if viewer is not None and sim_t - last_sync >= 1 / 30:
            last_sync = sim_t
            vd.qpos[:] = mv.d.qpos
            mujoco.mj_forward(vm, vd)
            viewer.cam.lookat[:] = [mv.d.qpos[0], mv.d.qpos[1], 0.7]
            viewer.sync()
        elif viewer is None and sim_t - last_print >= 2.0:
            last_print = sim_t
            print(f"  t={sim_t:5.1f} pos ({mv.d.qpos[0]:+.2f},{mv.d.qpos[1]:+.2f}) playing {mv.playing()}", flush=True)
        lag = sim_t - (time.time() - wall0)
        if lag > 0:
            time.sleep(lag)
        elif lag < -0.5:                                # slower than real time on this computer: don't try to catch up
            wall0 = time.time() - sim_t
    alive.clear()
    if viewer is not None:
        viewer.close()


if __name__ == "__main__":
    main()
