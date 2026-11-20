"""The robot's mind: Claude sees through the robot's eyes, acts with small skills, and learns from what works.

    python live.py --claude --agent                     # live mode: what you say becomes a goal for the agent
    from agent import RobotAgent; RobotAgent(house, bot).run("make Alex a cup of tea")

Nothing here is a fixed script. Claude gets a goal and, every step, two pictures (the robot's head camera, and a view
from behind it) plus a short state line (where it is, what it holds and how heavy, which appliances are on), and
chooses what to do next with small tools: go somewhere, look, pick up, put down, press a switch, fill, pour, wait,
say something. After each action it sees the result. It can also use whole skills:

* starter skills - the chores written for the robot (make tea, cook pasta, tidy the kids' room, ...). They are a
  kickstart: Claude can run one as it is, read its steps (show_skill) and change them, or ignore it;
* learned skills - when Claude works out a way to do something and it works, it saves the steps (save_skill) and can
  run them again later; each skill keeps a count of how often it worked;
* lessons - when something fails, Claude writes down why (note_lesson), and every later task starts with them.

Skills, lessons and a log of past tasks are kept in data/robot_memory.json, so the robot gets better across sessions.
That is learning by memory, not by changing a network's weights (the motion generator learns from practice instead:
train/motion/practice.py).

Safety does not change: every walking step still goes through the safety supervisor (speed near people, distance,
geofence, e-stop), and there is no tool that strikes anything.
"""
from __future__ import annotations

import base64
import io
import json
import math
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
MEMORY = HERE / "data" / "robot_memory.json"
VIEW_W, VIEW_H = 480, 360

# the chores, as the steps the agent's own tools would take (shown to Claude by show_skill; run_skill runs the tuned
# version in chores.py)
STARTER = {
    "make_tea": ("Make a cup of tea and bring it to someone (default: you).",
                 [("fill", {"object": "kettle", "litres": 0.3}), ("put", {"where": "kettle base"}),
                  ("press", {"control": "kettle"}), ("wait", {"seconds": 25, "until": "kettle boiled"}),
                  ("pick_up", {"object": "kettle"}), ("pour", {"into": "mug_red"}), ("put", {"where": "kettle base"}),
                  ("pick_up", {"object": "mug_red"}), ("put", {"where": "you"})]),
    "cook_pasta": ("Cook pasta and serve the pot on the dining table's trivet, hob off at the end.",
                   [("fill", {"object": "pot", "litres": 0.6}), ("put", {"where": "hob"}), ("press", {"control": "hob"}),
                    ("wait", {"seconds": 35, "until": "the water boils"}), ("pick_up", {"object": "pasta"}),
                    ("pour", {"into": "pot"}), ("put", {"where": "kitchen counter"}),
                    ("wait", {"seconds": 45, "until": "pasta cooked"}), ("press", {"control": "hob"}),
                    ("pick_up", {"object": "pot"}), ("put", {"where": "trivet"})]),
    "set_table": ("A mug at four places on the dining table.",
                  [("pick_up", {"object": m}) if k % 2 == 0 else ("put", {"where": "dining table"})
                   for m in ("mug_red", "mug_blue", "mug_green", "mug_yellow") for k in range(2)]),
    "wash_up": ("Every mug into the kitchen sink.",
                [("pick_up", {"object": "mug_red"}), ("put", {"where": "sink"}), ("...", {"note": "the same for each mug"})]),
    "tidy_kids_room": ("Toys into the toy box, clothes into the hamper (upstairs, in the kids' room).",
                       [("pick_up", {"object": "teddy"}), ("put", {"where": "toy box"}),
                        ("...", {"note": "truck, blocks, ball -> toy box; shirt, jeans, socks -> hamper"})]),
    "laundry": ("The laundry basket up to the laundry room, onto the counter, washing machine on.",
                [("pick_up", {"object": "basket"}), ("put", {"where": "laundry counter"}), ("press", {"control": "washer"})]),
    "take_out_trash": ("The bin bag out to the garden bin.",
                       [("pick_up", {"object": "trash"}), ("put", {"where": "garden bin"})]),
    "water_plants": ("Fill the watering can and water each indoor plant.",
                     [("fill", {"object": "can", "litres": 0.5}), ("pour", {"into": "plant 1"}), ("pour", {"into": "plant 2"}),
                      ("...", {"note": "each indoor plant"})]),
    "vacuum": ("Vacuum a room with the stick vacuum: its head picks up the dust it passes over.",
               [("pick_up", {"object": "hoover"}), ("go_to", {"place": "living room"}),
                ("move_hand", {"ahead": 0.45, "up": 0.90, "seconds": 1.5}),
                ("walk_to", {"x": 9.0, "y": 3.0}), ("walk_to", {"x": 12.5, "y": 3.0}),
                ("...", {"note": "lanes about 0.27 m apart over the floor; the head trails 0.2 m right of you, 0.45 m ahead"}),
                ("go_to", {"place": "kitchen"}), ("put", {"where": "floor"})]),
    "greet_visitor": ("Answer the door, greet the visitor, show them to the living room (keep 1.2 m from them).",
                      [("go_to", {"place": "hall"}), ("say", {"text": "Hello, come in."}),
                       ("go_to", {"place": "living room"}), ("gesture", {"name": "welcome"})]),
}


def png_b64(img, size=None):
    from PIL import Image
    im = Image.fromarray(np.asarray(img))
    if size:
        im = im.resize(size)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


class Memory:
    def __init__(self, path=MEMORY):
        self.path = Path(path)
        self.d = dict(skills={}, lessons=[], episodes=[])
        if self.path.exists():
            try:
                self.d.update(json.loads(self.path.read_text()))
            except (ValueError, OSError):
                pass

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.d, indent=1))
        tmp.replace(self.path)

    def prompt(self):
        sk = self.d["skills"]
        lines = []
        if sk:
            lines.append("Skills you learned (run_skill to use, show_skill to read their steps):")
            for n, s in sorted(sk.items()):
                lines.append(f"- {n}: {s['description']} (worked {s.get('wins', 0)}x, failed {s.get('fails', 0)}x)")
        if self.d["lessons"]:
            lines.append("Lessons from earlier tasks:")
            lines += [f"- {x}" for x in self.d["lessons"][-30:]]
        if self.d["episodes"]:
            lines.append("Recent tasks:")
            lines += [f"- {e['goal']}: {'done' if e['ok'] else 'not done'} in {e['steps']} steps. {e['summary']}"
                      for e in self.d["episodes"][-8:]]
        return "\n".join(lines) or "(No memory yet: this is your first task.)"


class RobotAgent:
    MAX_TURNS = 40

    def __init__(self, house, bot, model="claude-sonnet-5-5", effort="medium", key_file=None, workspace=None,
                 client=None, memory=None, on_event=None):
        self.h, self.bot = house, bot
        self.model, self.effort = model, effort
        self.mem = memory or Memory()
        self.on_event = on_event or (lambda kind, text: None)
        self.betas = ["server-side-fallback-2026-07-01"]
        self.anthropic = None
        if client is None:
            import os
            import anthropic
            from live_claude import read_key_file
            key, ws_file = read_key_file(key_file)
            ws = workspace or ws_file or os.environ.get("ANTHROPIC_WORKSPACE_ID")
            headers = {"anthropic-workspace-id": ws} if ws else None
            if key is None:
                client = anthropic.Anthropic(default_headers=headers)
            elif key.startswith("sk-ant-oat"):
                client = anthropic.Anthropic(auth_token=key, default_headers=headers)
                self.betas.append("oauth-2025-04-20")
            else:
                client = anthropic.Anthropic(api_key=key, default_headers=headers)
            self.anthropic = anthropic
        self.client = client
        self.view = None
        self.done = None
        self.usage = dict(input=0, output=0, cache_read=0, cache_write=0, calls=0)

    # ---------------------------------------------------------------------------------------- seeing
    def views(self):
        """The head camera (what the robot sees) and a view from behind it (where it is), as PNG base64."""
        import mujoco
        h = self.h
        if self.view is None:
            self.view = mujoco.Renderer(h.mv, VIEW_H, VIEW_W)
        h._walls(False)
        h._sync()
        self.view.update_scene(h.dv, camera=h.cam_id, scene_option=h.opt_ego)
        head = self.view.render().copy()
        h.look = None
        follow = h.chase_view("follow")
        return png_b64(head), png_b64(follow, (VIEW_W, int(VIEW_W * follow.shape[0] / follow.shape[1])))

    def state(self):
        import house as HS
        h, bot = self.h, self.bot
        x, y, yaw = h.robot_pose()
        held = h.holding
        hold = "nothing"
        if held:
            kg = float(h.mass_of(held))
            hold = f"the {HS.OBJECTS[held][5][0]} ({kg:.2f} kg" + (f", {h.water[held]:.2f} l of water" if held in h.water and h.water[held] > 0 else "") + ")"
        app = []
        for n, v in h.st.items():
            app.append(f"{n} {'on' if v else 'off'}")
        if h.temp.get("kettle", 20) > 25:
            app.append(f"kettle {h.temp['kettle']:.0f} C")
        if h.temp.get("pot", 20) > 25:
            app.append(f"pot {h.temp['pot']:.0f} C" + (", pasta in" if h.pot_pasta else "") + (f", cooked {h.cook_t:.0f} s" if h.cook_t else ""))
        seen = "; ".join(f"{HS.OBJECTS[o][5][0]} ({m['room']})" for o, m in bot.memory.items()) or "nothing yet"
        people = "; ".join(f"{n}: {h.room_of(*h.person_xy(n))}" for n in h.b.people if h.person_xy(n)[0] < 19)
        return (f"[state t={h.t:.0f}s] in the {h.room_of(x, y)} at ({x:.1f}, {y:.1f}) facing {math.degrees(yaw):.0f} deg; "
                f"{'seated' if bot.seated else 'standing'}; holding {hold}; {', '.join(app)}; "
                f"{'FALLEN, e-stop set' if bot.sup.latched else ''} seen: {seen}; people: {people}")

    def observation(self, text):
        head, follow = self.views()
        return [{"type": "text", "text": f"{text}\n{self.state()}\nHead camera, then the view from behind you:"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": head}},
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": follow}}]

    # ---------------------------------------------------------------------------------------- tools
    def tools(self):
        import house as HS
        h = self.h
        objs = sorted(HS.OBJECTS)
        places = sorted(set(h.b.rooms) | set(h.b.furniture) | set(h.b.containers) | set(h.b.chairs) |
                        {"you", "floor"} | set(n for n in h.b.people if n != "sam"))

        STRICT = {"go_to", "pick_up", "put", "press", "fill", "pour", "sit", "walk_to", "shuffle", "move_hand", "crouch",
                  "use", "inspect", "move_body", "run_skill", "save_skill", "done"}      # the API allows 20 strict tools

        def t(name, desc, props, req=()):
            return {"name": name, "description": desc, "strict": name in STRICT,
                    "input_schema": {"type": "object", "properties": props, "required": list(req) or list(props),
                                     "additionalProperties": False}}
        S = {"type": "string"}
        return [
            t("look", "Look: turn on the spot by `turn_deg` first (0 to look where you face) and get fresh pictures.",
              {"turn_deg": {"type": "number"}}),
            t("go_to", "Walk to a place: a room, furniture, a chair, a container, a person ('you' is the person "
                       "talking). Stairs are climbed automatically.", {"place": {"type": "string", "enum": places}}),
            t("pick_up", "Find the object (searching likely rooms if needed), walk to it, hook its handle, lift it.",
              {"object": {"type": "string", "enum": objs}}),
            t("put", "Put what you hold on furniture, into a container (sink, bin, toy box, hamper), on the floor "
                     "here, or hand it to a person.", {"where": {"type": "string", "enum": places}}),
            t("press", "Press a switch or button with the hook (hand must be free).",
              {"control": {"type": "string", "enum": sorted(h.b.controls)}}),
            t("fill", "Fill a pot, kettle, watering can or mug at the filling station (drip tray with a metered sensor "
                      "tap) with this many litres, then pick it up again.",
              {"object": {"type": "string", "enum": sorted(HS.WATER_CAP)}, "litres": {"type": "number"}}),
            t("pour", "Pour what you hold into an object (pot, a mug) or onto a plant ('plant 1' .. 'plant 6').",
              {"into": S}),
            t("wait", "Stand (or sit) still for some seconds, e.g. while water boils.", {"seconds": {"type": "number"}}),
            t("sit", "Sit on a chair.", {"chair": {"type": "string", "enum": sorted(h.b.chairs)}}),
            t("stand", "Stand up from sitting.", {}),
            t("say", "Say something out loud.", {"text": S}),
            t("move_body", "Do any movement of your arms described in words (e.g. 'wave hello with both hands', 'stretch "
                           "both arms up', 'celebrate', 'beckon someone over'): a motion model trained on hours of human "
                           "motion makes it, so it can be anything, and it differs a little each time. Your arms only "
                           "swing forward/back and bend at the elbow, so you show a simplified version. Hand must be free.",
              {"text": S, "seconds": {"type": "number"}}),
            t("gesture", "An arm gesture.", {"name": {"type": "string", "enum": ["wave", "point", "explain", "shrug", "welcome", "refuse"]}}),
            t("walk_to", "Walk to a point on the floor (x, y in metres, the coordinates in your state line), e.g. "
                         "along lanes across a room. Your arms keep the pose they have.",
              {"x": {"type": "number"}, "y": {"type": "number"}}),
            t("shuffle", "A small body move onto a mark relative to where you stand: forward and left in metres "
                         "(each -0.6..0.6), and a turn in degrees (left positive).",
              {"forward": {"type": "number"}, "left": {"type": "number"}, "turn_deg": {"type": "number"}}),
            t("move_hand", "Move your hook to a point: `ahead` metres in front of your body's centre and `up` metres "
                           "above the floor you stand on (your shoulder is about 0.95 m up, the arm about 0.55 m long; "
                           "the arm swings in a plane 0.2 m to the right of your centre, so the point is in that "
                           "plane). Anything you hold moves with it. Returns how close the hook got.",
              {"ahead": {"type": "number"}, "up": {"type": "number"}, "seconds": {"type": "number"}}),
            t("grip", "Hook the handle that is at your hook now (within 7 cm), whatever it belongs to.", {}),
            t("use", "Use what you hold on something - an object, a piece of furniture, or a surface ('bath', 'basin', "
                     "'toilet', 'worktop', 'dining table', 'bathroom floor'): you bring it there and do what it is for "
                     "(rub it back and forth, spray, slide it under and lift). Whether anything happens depends on the "
                     "thing and the target: try, then look or inspect.", {"target": S}),
            t("inspect", "Look closely at something: an object, food, a surface or a room's grime - what it looks like, "
                         "what is in it, how hot it is (you have a thermometer).", {"thing": S}),
            t("let_go", "Unhook what you hold, where it is now; tells you where it came to rest.", {}),
            t("crouch", "Crouch, balanced, low enough to reach something `reach_height` metres above the floor "
                        "(0.34 lowest). Crouching can tip you over: keep the arm moves slow.",
              {"reach_height": {"type": "number"}}),
            t("stand_tall", "Stand up straight from a crouch.", {}),
            t("run_skill", "Run a skill you learned and saved yourself (all its steps, in order). The starter skills "
                           "can't be run whole: read them with show_skill and do the work yourself.", {"name": S}),
            t("show_skill", "Read the steps of a starter skill (an example written by your builders) or one you "
                            "learned, to follow, change or ignore.", {"name": S}),
            t("save_skill", "After something worked, save how you did it for next time. steps_json: a JSON list of "
                            "[tool, input] pairs using these tools (it can be replayed with run_skill). notes: what "
                            "matters (what to watch for, what failed before, when to use it); '' if none.",
              {"name": S, "description": S, "steps_json": S, "notes": S}),
            t("note_lesson", "Write down a lesson for next time (why something failed, what worked).", {"text": S}),
            t("done", "Finish the task. success: whether the goal was reached, judged from what you saw.",
              {"summary": S, "success": {"type": "boolean"}}),
        ]

    def system(self):
        import house as HS
        import model as KM
        h = self.h
        starter = "\n".join(f"- {n}: {d}" for n, (d, _) in STARTER.items())
        rooms = "; ".join(f"{n} ({b['box'][0]:.1f}, {b['box'][1]:.1f}, {b['box'][2]:.1f}, {b['box'][3]:.1f})"
                          for n, b in h.b.rooms.items() if n != "garden")
        return f"""You are the mind of {KM.BODY_NAME}, a small humanoid robot in a house (a physics simulation of one).
You see through its head camera and a camera following it, and you act through tools. Every step you get both
pictures and a state line. Decide what to do from what you see; after each action you see the result. Keep spoken
lines short (say), and use them sparingly.

Your body: you walk (stairs too), have one hook hand on the right arm that holds things by their handle (every object
here has one), and a left arm for balance. Your right arm swings in a plane beside your body: the low-level skills
line you up for it. You are small: heavy loads (over about 1.4 kg) may not come up, and you can't reach the back of a
deep worktop. You cannot run, jump, climb onto furniture, or open closed doors.

The house: rooms (x0, x1, y0, y1 in metres) {rooms}. Furniture with tops: {', '.join(h.b.furniture)}.
Containers (put drops things in): {', '.join(h.b.containers)}. Controls to press: {', '.join(h.b.controls)}.
Objects: {', '.join(HS.OBJECTS)}. Plants: {len(h.b.plants)} (plant 1 .. plant {len(h.b.plants)}). People: you (the
person talking), Alex, Jordan.

Things behave as they do at home: a lit hob heats what stands on it (water boils at 100 C, a dry pan gets much
hotter), food cooks with heat and time and burns if left, grime comes off when something that scrubs is rubbed over
it (cleaner spray helps), and a tool does what it is for only when used on the right thing.

Two kinds of tools. Errand tools do a whole common action (go_to, pick_up, put, press, fill, pour, sit). Body tools
are the parts those are made of (walk_to, shuffle, move_hand, grip, let_go, crouch, stand_tall, look), and use
and inspect work with tools and see how things are going: use them to
do things no errand tool covers, or when an errand tool keeps failing - for example, hold something in a new pose
while walking lanes, sweep the hook over a surface, or line up by hand for a handle the errand tool misses.

Starter skills: examples your builders wrote for a few chores. They are a starting point, not the way you have to
work, and you can't run them whole: read one with show_skill if it helps, then do the work yourself with your
tools - the same way, a better way, or a different one. Most things you'll be asked have no starter skill at all:
work them out from what you see and what your tools do.
{starter}

How to work: look first if you don't know where things are. After each action, check the pictures and the result:
did it do what you meant? When a step fails, think about why, try another way (another place to stand, another
pose, a different order, a body tool instead of an errand tool) and note_lesson what you learned. When something
works - especially something new - save_skill it, with notes on what mattered. Next time, run_skill your own skill
and watch that it still works. Finish with done, judged from what you saw.

If you are given free time, choose for yourself: practise something that failed before, try something you haven't
done, or improve a skill of yours that fails sometimes. One activity, then done.

Safety, always: never hit, push or chase anyone, never carry anything hot near a person's face, and if someone says
a person is being hurt, stop and say you are alerting a human. The safety supervisor limits your walking near people
whatever you ask for.

Your memory (from earlier tasks):
{self.mem.prompt()}"""

    def execute(self, name, inp):
        """Run one tool. Returns (ok, text)."""
        import house as HS
        h, bot = self.h, self.bot
        said0 = len(bot.said)
        ev0 = len(h.events)
        ok, note = True, ""
        if bot.sup.latched and name not in ("done", "note_lesson", "say", "look"):
            return False, "You are on the floor with the e-stop set: a person has to help you up. Call done."
        if name == "look":
            if inp.get("turn_deg"):
                x, y, yaw = h.robot_pose()
                bot.turn_to(yaw + math.radians(inp["turn_deg"]))
            bot.perceive()
        elif name == "go_to":
            ok = bot.go(inp["place"])
        elif name == "pick_up":
            ok = bot.pick(inp["object"])
        elif name == "put":
            ok = bot.place(inp["where"])
        elif name == "press":
            ok = bot.press(inp["control"])
        elif name == "fill":
            ok = bot.fill(inp["object"], float(inp["litres"]))
        elif name == "pour":
            tgt = inp["into"].strip().lower()
            if tgt.startswith("plant"):
                try:
                    tgt = int(tgt.split()[-1]) - 1
                except ValueError:
                    return False, "plants are 'plant 1' .. 'plant N'"
            ok = bot.pour(tgt)
        elif name == "wait":
            secs = max(0.5, min(120.0, float(inp["seconds"])))
            bot.rest(secs) if bot.seated else bot.stand_still(secs)
        elif name == "sit":
            ok = bot.sit(inp["chair"])
        elif name == "stand":
            ok = bot.stand()
        elif name == "say":
            bot.say(inp["text"])
        elif name == "move_body":
            from express import express
            ok, note = express(bot, inp["text"], float(inp.get("seconds") or 4.0))
        elif name == "gesture":
            if not bot.seated:
                h.gesture({"wave": "triumph"}.get(inp["name"], inp["name"]))
        elif name == "walk_to":
            ok = bot.goto((float(inp["x"]), float(inp["y"])), stop=0.15, speed=0.6)
        elif name == "shuffle":
            ok = bot.shuffle(float(inp["forward"]), float(inp["left"]), float(inp["turn_deg"]))
        elif name == "move_hand":
            err, hook = bot.move_hand(float(inp["ahead"]), float(inp["up"]), float(inp.get("seconds") or 1.5))
            ok = err < 0.05
            note = f"hook {err:.2f} m from the point, at height {hook[2] - h.floor_z(*hook[:2]):.2f} m"
        elif name == "grip":
            ok, note = bot.grip()
        elif name == "use":
            ok, note = bot.use(inp["target"].strip().lower())
        elif name == "inspect":
            thing = inp["thing"].strip().lower()
            words = {w: n for n, o in HS.OBJECTS.items() for w in o[5]}
            text = h.world.describe(words.get(thing, thing)) if getattr(h, "world", None) else None
            return (True, text) if text else (False, f"nothing called '{thing}' to look at closely")
        elif name == "let_go":
            ok, note = bot.let_go()
        elif name == "crouch":
            ok = bot.crouch(float(inp["reach_height"]))
        elif name == "stand_tall":
            ok = bot.stand_tall()
        elif name == "run_skill":
            n = inp["name"]
            if n in self.mem.d["skills"]:
                ok, note = self.replay(n)
            elif n in STARTER:
                return False, (f"'{n}' is a starter skill: an example, not something to run whole. show_skill it and "
                               f"do the steps yourself, changing what doesn't fit; save_skill your way when it works.")
            else:
                return False, f"no skill '{n}'. Learned: {', '.join(self.mem.d['skills']) or 'none yet'}"
        elif name == "show_skill":
            n = inp["name"]
            if n in STARTER:
                d, steps = STARTER[n]
                return True, f"{n}: {d}\nsteps: {json.dumps(steps)}"
            if n in self.mem.d["skills"]:
                s = self.mem.d["skills"][n]
                return True, (f"{n}: {s['description']}\nsteps: {json.dumps(s['steps'])}"
                              + (f"\nnotes: {s['notes']}" if s.get("notes") else ""))
            return False, f"no skill '{n}'"
        elif name == "save_skill":
            try:
                steps = json.loads(inp["steps_json"])
                assert isinstance(steps, list) and all(isinstance(s, list) and len(s) == 2 for s in steps)
            except (ValueError, AssertionError):
                return False, "steps_json must be a JSON list of [tool, input] pairs"
            old = self.mem.d["skills"].get(inp["name"], {})
            self.mem.d["skills"][inp["name"]] = dict(description=inp["description"], steps=steps,
                                                     notes=inp.get("notes", "").strip(),
                                                     wins=old.get("wins", 0) + 1, fails=old.get("fails", 0),
                                                     saved=time.strftime("%Y-%m-%d %H:%M"))
            self.mem.save()
            return True, f"saved skill '{inp['name']}' ({len(steps)} steps)"
        elif name == "note_lesson":
            self.mem.d["lessons"] = (self.mem.d["lessons"] + [inp["text"].strip()])[-60:]
            self.mem.save()
            return True, "noted"
        elif name == "done":
            self.done = (bool(inp["success"]), inp["summary"])
            return True, "ok"
        else:
            return False, f"unknown tool {name}"
        said = [l for _, l in bot.said[said0:]]
        events = [e for _, e in h.events[ev0:]]
        text = ("done" if ok else "FAILED") + (f": {note}" if note else "")
        if said:
            text += " | you said: " + " / ".join(said[-4:])
        if events:
            text += " | house: " + "; ".join(events)
        return bool(ok), text

    def replay(self, n):
        s = self.mem.d["skills"][n]
        for k, (tool, inp) in enumerate(s["steps"]):
            if tool in ("done", "save_skill", "run_skill", "..."):
                continue
            ok, text = self.execute(tool, inp if isinstance(inp, dict) else {})
            if not ok:
                s["fails"] = s.get("fails", 0) + 1
                self.mem.save()
                return False, f"step {k + 1} ({tool} {inp}) failed: {text}"
        s["wins"] = s.get("wins", 0) + 1
        self.mem.save()
        return True, f"all {len(s['steps'])} steps done"

    # ---------------------------------------------------------------------------------------- the loop
    def create(self, messages):
        kw = dict(model=self.model, max_tokens=16000, system=self.system(), tools=self.tools(), messages=messages,
                  output_config={"effort": self.effort}, cache_control={"type": "ephemeral"})
        if self.anthropic is None:                       # a stand-in client (tests)
            return self.client.messages.create(**kw)
        from live_claude import create_message
        return create_message(self.client, self.betas, **kw)

    def run(self, goal, max_turns=None):
        """Work on a goal until done (or out of turns). Returns (ok, summary). A new goal is a new conversation: the
        memory carries what was learned (the history itself is never edited)."""
        import housebot as HB
        self.done = None
        messages = [{"role": "user", "content": self.observation(f"Your goal: {goal}")}]
        steps = 0
        try:
            for _ in range(max_turns or self.MAX_TURNS):
                resp = self.create(messages)
                u = getattr(resp, "usage", None)
                if u is not None:
                    self.usage["calls"] += 1
                    self.usage["input"] += getattr(u, "input_tokens", 0) or 0
                    self.usage["output"] += getattr(u, "output_tokens", 0) or 0
                    self.usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
                    self.usage["cache_write"] += getattr(u, "cache_creation_input_tokens", 0) or 0
                messages.append({"role": "assistant", "content": resp.content})
                if resp.stop_reason == "refusal":
                    self.bot.say("refuse")
                    self.done = (False, "declined")
                    break
                calls = [b for b in resp.content if getattr(b, "type", "") == "tool_use"]
                for b in resp.content:
                    if getattr(b, "type", "") == "text" and b.text.strip():
                        self.on_event("thought", b.text.strip())
                if not calls:
                    self.done = self.done or (False, "stopped without calling done")
                    break
                results = []
                for i, b in enumerate(calls):
                    steps += 1
                    self.on_event("action", f"{b.name} {json.dumps(b.input)}")
                    try:
                        ok, text = self.execute(b.name, dict(b.input))
                    except HB.Interrupted as e:
                        if str(e) == "fell":
                            ok, text = False, "you FELL; the e-stop is set until a person helps you up"
                        else:
                            raise
                    self.on_event("result", text)
                    last = i == len(calls) - 1 and b.name not in ("note_lesson", "save_skill", "show_skill", "done")
                    content = self.observation(text) if last else [{"type": "text", "text": text}]
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": content, "is_error": not ok})
                messages.append({"role": "user", "content": results})
                if self.done is not None:
                    break
        except HB.Interrupted as e:                      # a new instruction, or stop
            self.done = (False, f"interrupted ({e})")
        ok, summary = self.done or (False, "ran out of steps")
        self.mem.d["episodes"] = (self.mem.d["episodes"] + [dict(goal=goal, ok=ok, steps=steps, summary=summary[:300],
                                                                 when=time.strftime("%Y-%m-%d %H:%M"))])[-100:]
        self.mem.save()
        return ok, summary
