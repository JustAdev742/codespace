"""Tell the G1 what to do and watch it move - no training: motion matching on human data + walker + balance control.

    python -m motion.live_mover --library runs/motion/bandai_library.npz             # type commands
    python -m motion.live_mover --library ... --claude                               # Claude decides the moves
    python -m motion.live_mover --library ... --local qwen3:8b                       # a local model (Ollama) decides

A 3D window shows the robot; type in the terminal. Plain commands always work: walk, walk fast, walk slowly, back,
step left / right, turn left / right, stop, any action from the motion library (wave, bow, guide, call, byebye,
raise hands, respond, ...), "style tired" (or old, proud, active, happy, sad, ... - any style in the library),
"free" (it does whatever it likes until you say stop), "list", "quit".

With --claude or --local the language model reads what you say and answers with a sequence of moves (one `move` tool
call per step: an action or a walk, a style, how long). The tool only offers the library's actions; the library has no
fighting moves (they are filtered out when it is built), so no model can make the robot strike.

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


class ClaudeMover:
    def __init__(self, moves, model="claude-opus-5-5", key_file=None):
        import anthropic
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "brain"))
        from live_claude import read_key_file
        key, ws = read_key_file(key_file)
        headers = {"anthropic-workspace-id": ws} if ws else None
        self.betas = []
        if key is None:
            self.client = anthropic.Anthropic(default_headers=headers)
        elif key.startswith("sk-ant-oat"):
            self.client = anthropic.Anthropic(auth_token=key, default_headers=headers)
            self.betas.append("oauth-2025-04-20")
        else:
            self.client = anthropic.Anthropic(api_key=key, default_headers=headers)
        self.moves, self.model, self.msgs = moves, model, []
        self.tool = move_tool(moves.gestures, moves.styles, moves.can_generate)

    def turn(self, text):
        self.msgs.append({"role": "user", "content": text})
        kw = dict(model=self.model, max_tokens=4000, system=SYSTEM, tools=[self.tool], messages=self.msgs,
                  output_config={"effort": "low"})
        try:
            r = self.client.beta.messages.create(betas=self.betas, **kw) if self.betas else self.client.messages.create(**kw)
        except Exception as e:                          # offline, bad key, out of credit: plain commands still work
            self.msgs.pop()
            print(f"  (language model unavailable: {type(e).__name__}; using plain commands)")
            return self.moves.plain(text)
        calls = [b for b in r.content if b.type == "tool_use"]
        for b in r.content:
            if b.type == "text" and b.text.strip():
                print("  robot:", b.text.strip())
        if calls:
            self.moves.free = False
            self.moves.clear()
            for b in calls:
                self.moves.put(**b.input)
        self.msgs.append({"role": "assistant", "content": r.content})
        if calls:
            self.msgs.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": b.id, "content": "queued"}
                                                          for b in calls]})
            self.msgs.append({"role": "assistant", "content": "OK."})
        self.msgs = self.msgs[-30:]
        while self.msgs and self.msgs[0]["role"] != "user" or (self.msgs and not isinstance(self.msgs[0]["content"], str)):
            self.msgs.pop(0)
        return True


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


# ----------------------------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--library", default="runs/motion/bandai_library.npz")
    ap.add_argument("--claude", action="store_true")
    ap.add_argument("--claude-model", default="claude-opus-5-5")
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
    current, until = None, 0.0
    sim_t, wall0, last_print, last_sync = 0.0, time.time(), 0.0, 0.0
    while alive.is_set() and (viewer is None or viewer.is_running()):
        # next move: a timed move runs out; an untimed one lasts until another is queued
        if current is None or (until and sim_t >= until) or (not current["seconds"] and (not moves.q.empty() or moves.free)):
            if moves.q.empty() and moves.free:
                moves.next_free(rng)
            if not moves.q.empty():
                current = moves.q.get_nowait()
                secs = current["seconds"]
                try:
                    mv.set_intent(**{k: v for k, v in current.items() if k != "seconds"})
                except ValueError as e:                     # e.g. a refused description
                    print(f"\n  {e}\n> ", end="", flush=True)
                    mv.set_intent("stand")
                    current["action"] = "stand"
                until = sim_t + secs if secs else 0.0
                fmt = lambda v: f"{v:.2f}" if isinstance(v, float) else str(v)
                desc = ", ".join(f"{k} {fmt(v)}" for k, v in current.items() if v not in (None, 0.0, {}) and k != "action")
                print(f"\n  moving: {current['action']}" + (f" ({desc})" if desc else "") + "\n> ", end="", flush=True)
            elif current is not None and until:
                mv.set_intent("stand")
                current, until = None, 0.0
        if not mv.step():
            print("\n  the robot fell - restarting it standing")
            mv = Mover(a.library, db=mv.db, generator=gen)
            moves.clear()
            current, until = None, 0.0
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
