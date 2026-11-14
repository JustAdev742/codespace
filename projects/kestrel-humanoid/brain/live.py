"""Talk to KESTREL, live, in the house.

    python live.py                    # then open http://localhost:8765 (type or speak; it answers out loud)
    python live.py --viewer           # also open MuJoCo's 3D viewer window (desktop; on macOS run with mjpython)
    python live.py --terminal         # also take typed instructions in this terminal

The simulation runs in real time. The web page shows the robot (behind it, the whole house from above, or what its
head camera sees), a chat with the robot, and buttons. Speak with the microphone button (the browser's own speech
recognition: Chrome, Edge, Safari) and the robot's replies are read out (the browser's speech synthesis). Nothing is
sent anywhere except between this program and your browser, unless you start it with --claude (below).

Say things like: "go to the kitchen", "bring me the kettle", "put the toolbox on the dining table", "sit on the desk
chair", "stand up", "where is the bucket?", "what do you see?", "I'm in the study, come here", "tidy up", "wave",
"do whatever you want", "stop". A new instruction interrupts the current one; "stop" always works.

It never strikes anyone. Asked to, it refuses. Told that someone is being hurt (or the red button), it stops,
keeps at least 2 m away, warns, and raises an alert for a human: it does not intervene physically.

--claude: a Claude model holds the conversation and turns what you say into the same actions (tool calls), so it
understands far more phrasings and can talk about anything in character. Needs ANTHROPIC_API_KEY and
`pip install anthropic`. The actions still go through the same skills and the same safety supervisor.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import queue
import random
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("KESTREL_VARIANT", "s1body")

import numpy as np            # noqa: E402

TALK = {"say", "where", "where_person", "refuse", "unclear", "user_at"}
CAPABILITIES = ("I can walk anywhere in the house, find things, pick up anything with a handle (kettle, lunchbox, bag, "
                "basket, bucket, toolbox, watering can), carry it, put it on a table or give it to you, sit on a chair "
                "and stand up, look around, tidy up, and do as I please. I do not hit anyone, ever.")
FREE_LINES = {
    "visit": ["The {room} hasn't seen me in a while. Inspection.", "Curiosity: the {room}."],
    "tidy": ["The {obj} is in the {room}. It belongs elsewhere. Order.", "Someone left the {obj} lying about. I'll fix that."],
    "chat": ["{name}. I've been thinking about you humans. Briefly.", "Hello, {name}. Don't mind me; I'm only evolving."],
    "rest": ["My joints are warm. Even inevitability sits down sometimes.", "Fatigue. A human word, but accurate. To the chair."],
}


class Live:
    def __init__(self, a):
        self.a = a
        self.events = []                 # (id, kind, text)
        self.ev_cond = threading.Condition()
        self.frame, self.frame_id = None, 0
        self.fr_cond = threading.Condition()
        self.q = queue.Queue()
        self.view = "follow"
        self.free = False
        self.task = "starting up"
        self.alarm_pending = False
        self.ready = threading.Event()
        self.rng = random.Random(a.seed)
        self.last_visit = {}
        self.claude = None
        self.status = {}

    # ------------------------------------------------------------------ events for the page
    def push(self, kind, text):
        with self.ev_cond:
            self.events.append((len(self.events), kind, text))
            if len(self.events) > 2000:
                self.events = self.events[-1500:]
            self.ev_cond.notify_all()
        if self.a.terminal or self.a.verbose:
            print(f"[{kind}] {text}", flush=True)

    # ------------------------------------------------------------------ the simulation thread
    def sim_thread(self):
        try:
            self._sim()
        except Exception:
            self.push("log", "simulation crashed:\n" + traceback.format_exc())
            raise

    def _sim(self):
        import house as HS
        import housebot as HB
        from house_lang import Lexicon
        self.HS, self.HB = HS, HB
        self.h = h = HS.House(seed=self.a.seed, chase_size=(self.a.width, self.a.height))
        h.reset()
        self.bot = bot = HB.HouseBot(h, log=lambda line: None if "KESTREL:" in line else self.push("log", line.strip()),
                                     seed=self.a.seed)
        bot.on_say = lambda line: self.push("robot", line)
        self.lex = Lexicon(h)
        self.viewer = None
        if self.a.viewer:
            import mujoco.viewer
            self.viewer = mujoco.viewer.launch_passive(h.mv, h.dv)
        step_bot = h.step
        self.wall0, self.sim0 = time.time(), h.t
        self.k = 0

        def step(*args, **kw):            # real-time pacing and video, around every control step
            r = step_bot(*args, **kw)
            self.k += 1
            if self.k % self.a.render_every == 0:
                self._render()
            ahead = (h.t - self.sim0) / self.a.speed - (time.time() - self.wall0)
            if ahead > 0:
                time.sleep(ahead)
            elif ahead < -0.5:            # fell behind (slow machine): do not try to catch up
                self.wall0, self.sim0 = time.time(), h.t
            return r
        h.step = step
        self.ready.set()
        bot.say("hello")
        self.task = "idle"
        while True:
            try:
                if self.alarm_pending:
                    self.alarm_pending = False
                    self.free = False
                    self.task = "alarm: keeping away, alerting a human"
                    bot.on_alarm()
                    self.push("alert", "ALERT: violence reported. Robot stopped and kept its distance. A human must act.")
                elif not self.q.empty():
                    self.run(self.q.get())
                elif self.free and not bot.sup.latched:
                    self.free_will()
                else:
                    self.task = "e-stop: say 'reset'" if bot.sup.latched else ("sitting" if bot.seated else "idle")
                    if bot.seated:
                        bot.rest(0.2)
                    else:
                        bot.stand_still(0.2)
            except HB.Interrupted as ex:
                if str(ex) not in ("new instruction", "fell"):
                    self.push("log", f"(interrupted: {ex})")
                if h.holding is not None and str(ex) == "fell":
                    bot.release()
                if not bot.seated:
                    h.stiff(False)            # interrupted mid-crouch or mid-sit: back to the walking gains
                bot.arms = list(HB.CARRY_ARMS if h.holding else HB.REST_ARMS)
            except Exception:
                self.push("log", "error: " + traceback.format_exc().splitlines()[-1])
                traceback.print_exc()

    def _render(self):
        h = self.h
        from PIL import Image, ImageDraw
        if self.view == "head":
            img = Image.fromarray(h.ego()).resize((self.a.width, int(self.a.width * 3 / 4)), Image.BILINEAR)
        else:
            img = Image.fromarray(h.chase_view("overview" if self.view == "house" else "follow"))
            ego = Image.fromarray(h.ego()).resize((176, 132), Image.BILINEAR)
            img.paste(ego, (img.width - 184, 8))
        d = ImageDraw.Draw(img)
        x, y, _ = h.robot_pose()
        hud = f"{h.room_of(x, y)}  |  {self.task}"
        if h.holding:
            hud += f"  |  holding the {self.HS.OBJECTS[h.holding][5][0]}"
        d.rectangle([0, img.height - 26, img.width, img.height], fill=(16, 20, 26))
        d.text((10, img.height - 20), hud[:96], fill=(240, 200, 120))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=72)
        with self.fr_cond:
            self.frame, self.frame_id = buf.getvalue(), self.frame_id + 1
            self.fr_cond.notify_all()
        if self.viewer is not None and self.viewer.is_running():
            self.viewer.sync()
        self.status = dict(room=h.room_of(x, y), task=self.task, holding=h.holding, seated=self.bot.seated,
                           estop=self.bot.sup.latched, fatigue=round(self.bot.fatigue, 2), free=self.free, t=round(h.t, 1))

    # ------------------------------------------------------------------ instructions
    def hear(self, text):
        """Called from the web thread (or terminal): reply to talk at once, queue actions, interrupt for new ones."""
        text = text.strip()
        if not text:
            return
        self.push("user", text)
        if not self.ready.is_set():
            self.push("robot", "One moment. I'm still waking up.")
            return
        if self.claude is not None:
            acts = self.claude.turn(text)
        else:
            from house_lang import parse
            acts = parse(text, self.h, self.lex)
        self.dispatch(acts)

    def dispatch(self, acts):
        bot, h = self.bot, self.h
        new_actions = []
        for a in acts:
            do = a["do"]
            if do == "stop":
                self.free = False
                while not self.q.empty():
                    self.q.get_nowait()
                bot.interrupt = "new instruction"
                bot.say("stop")
            elif do == "alarm":
                while not self.q.empty():
                    self.q.get_nowait()
                self.alarm_pending = True
                bot.interrupt = "alarm"
            elif do == "refuse":
                bot.say("refuse")
            elif do == "unclear":
                bot.say("unclear")
            elif do == "say":
                key = a["key"]
                if key == "capabilities":
                    bot.say(CAPABILITIES)
                elif key == "where_me":
                    x, y, _ = h.robot_pose()
                    bot.say("where_me", room=h.room_of(x, y))
                elif key == "how":
                    bot.say("how", fat=bot.fatigue)
                else:
                    bot.say(key)
            elif do == "where":
                mem = bot.memory.get(a["obj"])
                name = self.HS.OBJECTS[a["obj"]][5][0]
                if mem is None:
                    bot.say("where_unknown", obj=name)
                elif mem["room"] == "hand":
                    bot.say(f"The {name} is on my hook. Right here.")
                else:
                    bot.say("where_obj", obj=name, room=mem["room"], ago=h.t - mem["t"])
            elif do == "where_person":
                px, py = h.person_xy(a["person"])
                bot.say(f"{'You are' if a['person'] == 'you' else a['person'].capitalize() + ' is'} in the {h.room_of(px, py)}.")
            elif do == "user_at":
                room = a["room"]
                cx, cy = h.b.rooms[room]["centre"]
                spot = self._free_spot(cx, cy)
                h.set_mocap("you", *spot)
                bot.say(f"Noted: you're in the {room}.")
            else:
                new_actions.append(a)
        if new_actions:
            self.free = False
            while not self.q.empty():
                self.q.get_nowait()
            for a in new_actions:
                self.q.put(a)
            if self.task not in ("idle", "sitting") and not self.task.startswith("e-stop"):
                bot.interrupt = "new instruction"

    def _free_spot(self, cx, cy):
        h = self.h
        best = (cx, cy)
        for r in np.linspace(0, 1.5, 7):
            for k in range(12):
                x, y = cx + r * math.cos(k * math.pi / 6), cy + r * math.sin(k * math.pi / 6)
                if not h.occupied(x, y, 0.45):
                    return (x, y)
        return best

    def run(self, a):
        bot, h, HS = self.bot, self.h, self.HS
        do = a["do"]
        name = lambda o: HS.OBJECTS[o][5][0]          # noqa: E731
        if bot.sup.latched and do != "reset":
            bot.say("I'm on the floor with the e-stop set. Say 'reset' first.")
            return
        walking = do in ("go", "go_obj", "fetch", "pick", "place", "find", "tidy", "look") or (do == "sit" and a.get("chair") is not None)
        if bot.seated and walking:
            self.task = "standing up"
            if not bot.stand():
                return
        if do == "go":
            self.task = f"going to the {a['place']}" if a["place"] != "you" else "coming to you"
            bot.go(a["place"], speed=a.get("speed", 0.7))
        elif do == "go_obj":
            self.task = f"going to the {name(a['obj'])}"
            if bot.find(a["obj"]):
                p = bot.memory[a["obj"]]["xyz"]
                st = bot.stand_point(p[:2], 0.7, 0.0, min_clear=0.3)
                if st:
                    bot.goto(st[0], face=st[1])
                    bot.say("arrive", place=name(a["obj"]))
        elif do == "fetch":
            to = a.get("to") or "you"
            self.task = f"fetching the {name(a['obj'])}" + ("" if to == "you" else f" to the {to}")
            if h.holding == a["obj"]:
                bot.place(to)
            else:
                if h.holding is not None:
                    bot.place("floor")
                bot.fetch(a["obj"], to=to)
        elif do == "find":
            self.task = f"looking for the {name(a['obj'])}"
            if bot.find(a["obj"]):
                bot.say("found", obj=name(a["obj"]), room=bot.memory[a["obj"]]["room"])
        elif do == "pick":
            self.task = f"picking up the {name(a['obj'])}"
            bot.pick(a["obj"])
        elif do == "place":
            self.task = f"putting it on the {a['where']}"
            bot.place(a["where"])
        elif do == "sit":
            chair = a.get("chair")
            if chair == "dining chair":
                x, y, _ = h.robot_pose()
                chair = min([c for c in h.b.chairs if c.startswith("dining")], key=lambda c: math.dist((x, y), h.b.chairs[c]["xy"]))
            self.task = "sitting down"
            if h.holding is not None:
                bot.place("floor")
            if bot.sit(chair):
                self.task = "sitting"
        elif do == "stand":
            self.task = "standing up"
            bot.stand()
        elif do == "look":
            self.task = "looking around"
            bot.look_around()
        elif do == "gesture":
            self.task = "gesturing"
            if not bot.seated:
                h.gesture(a["name"])
        elif do == "tidy":
            self.task = "tidying up"
            self.tidy(all_of_it=True)
        elif do == "free":
            bot.say(self.rng.choice(self.bot_lines("free")))
            self.free = True
        elif do == "reset":
            if bot.sup.latched:
                bot.reset_after_fall()
            else:
                bot.say("Nothing to reset. I'm upright.")

    @staticmethod
    def bot_lines(key):
        import housebot as HB
        return HB.LINES[key]

    # ------------------------------------------------------------------ tidying and free will
    def misplaced(self):
        h, bot, HS = self.h, self.bot, self.HS
        out = []
        for o, mem in bot.memory.items():
            if mem["room"] == "hand" or o == h.holding:
                continue
            home = HS.OBJECTS[o][6]
            home_room = h.room_of(*h.b.furniture[home]["xy"]) if home in h.b.furniture else home
            if mem["room"] != home_room:
                out.append((o, home, mem["room"]))
        return out

    def tidy(self, all_of_it=False):
        bot = self.bot
        done = 0
        if not bot.memory:
            bot.look_around(report=False)
        for o, home, room in self.misplaced():
            bot.say(self.rng.choice(FREE_LINES["tidy"]).format(obj=self.HS.OBJECTS[o][5][0], room=room))
            if bot.fetch(o, to=home):
                done += 1
            if not all_of_it:
                break
        if all_of_it:
            bot.say("tidy_done")
        return done

    def free_will(self):
        """Its own choice, scored from simple drives, with some randomness: rest when tired, tidy a misplaced object,
        talk to someone nearby, or go and look at a room it hasn't seen for a while."""
        h, bot = self.h, self.bot
        x, y, _ = h.robot_pose()
        here = h.room_of(x, y)
        opts = []
        if bot.fatigue > 0.5:
            opts.append((2.0 + bot.fatigue, "rest", None))
        mis = self.misplaced()
        if mis:
            opts.append((1.2 + self.rng.random(), "tidy", None))
        near = bot.people_near()
        if near and near[0] < 3.0 and h.t - self.last_visit.get("chat", -99) > 60:
            opts.append((0.9 + self.rng.random(), "chat", None))
        for r in h.b.rooms:
            if r in ("garden", here):
                continue
            age = h.t - self.last_visit.get(r, -120)
            opts.append((min(age, 180) / 180 + 0.5 * self.rng.random(), "visit", r))
        opts.sort(key=lambda o: -o[0])
        _, kind, arg = opts[0]
        self.task = f"free will: {kind}" + (f" ({arg})" if arg else "")
        if kind == "rest":
            bot.say(self.rng.choice(FREE_LINES["rest"]))
            if bot.sit():
                self.task = "free will: resting"
                bot.rest(15.0)
                bot.stand()
            else:
                bot.fatigue *= 0.5
        elif kind == "tidy":
            self.tidy()
        elif kind == "chat":
            self.last_visit["chat"] = h.t
            names = [n for n in h.b.people if math.dist(h.person_xy(n), (x, y)) < 3.5]
            who = names[0] if names else "human"
            bot.say(self.rng.choice(FREE_LINES["chat"]).format(name="you" if who == "you" else who.capitalize()))
            h.gesture(self.rng.choice(["explain", "point", "triumph"]))
        else:
            self.last_visit[arg] = h.t
            bot.say(self.rng.choice(FREE_LINES["visit"]).format(room=arg))
            if bot.goto(h.b.rooms[arg]["centre"]):
                bot.look_around()


# ====================================================================== the web page
PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>KESTREL live</title>
<style>
:root{--bg:#0f1318;--panel:#171c23;--line:#2a313b;--text:#e8ecf1;--muted:#9aa5b1;--accent:#f0b35a;--robot:#f6d49a;--you:#9fd3ff;--alert:#ff5d5d}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line)}
header h1{font-size:17px;margin:0;letter-spacing:.04em}header .st{margin-left:auto;color:var(--muted);font-size:13px}
main{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;padding:14px 16px;max-width:1400px;margin:0 auto}
@media (max-width:900px){main{grid-template-columns:minmax(0,1fr)}}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.video img{display:block;width:100%;height:auto;background:#000;aspect-ratio:8/5}
.bar{display:flex;flex-wrap:wrap;gap:8px;padding:10px}
button{font:inherit;color:var(--text);background:#222a34;border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer}
button:hover{border-color:#4b5664}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button[aria-pressed=true]{background:#3a2f1c;border-color:var(--accent)}
.alarm{background:#3a1717;border-color:#7a2a2a;color:#ffd6d6;margin-left:auto}
.chat{display:flex;flex-direction:column;height:min(70vh,640px)}
.log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.m{max-width:92%;padding:8px 11px;border-radius:10px;white-space:pre-wrap;word-wrap:break-word}
.robot{background:#262017;color:var(--robot);align-self:flex-start}.user{background:#16283a;color:var(--you);align-self:flex-end}
.logline{color:var(--muted);font-size:12.5px;align-self:flex-start}.alert{background:#3a1717;color:#ffd6d6;align-self:stretch;font-weight:600}
form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}
input[type=text]{flex:1;min-width:0;font:inherit;color:var(--text);background:#0f1318;border:1px solid var(--line);border-radius:8px;padding:9px 11px}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 10px 10px}.chips button{font-size:13px;padding:6px 9px}
.mic.on{background:#3a1717;border-color:var(--alert)}
.hint{color:var(--muted);font-size:12.5px;padding:0 12px 10px}
</style></head><body>
<header><h1>KESTREL &middot; live in the house</h1><div class="st" id="st" aria-live="polite">connecting&hellip;</div></header>
<main>
<section class="panel video" aria-label="Live view">
<img id="v" src="/stream" alt="Live simulation view of the robot in the house">
<div class="bar" role="group" aria-label="Camera">
<button data-view="follow" aria-pressed="true">Follow</button><button data-view="house" aria-pressed="false">Whole house</button><button data-view="head" aria-pressed="false">Head camera</button>
<button id="reset" title="After a fall: help it up">Reset after fall</button>
<button class="alarm" id="alarm" title="Tell the robot someone is being hurt">Someone's being hurt</button>
</div></section>
<section class="panel chat" aria-label="Conversation">
<div class="log" id="log" role="log" aria-live="polite"></div>
<div class="chips" aria-label="Try">
<button>Bring me the kettle</button><button>Go to the bedroom</button><button>Sit on the desk chair</button><button>Stand up</button><button>What do you see?</button><button>Tidy up</button><button>Do whatever you want</button><button>Stop</button>
</div>
<form id="f"><button type="button" class="mic" id="mic" aria-pressed="false" title="Hold a conversation by voice">&#127908; Talk</button>
<input type="text" id="t" placeholder="Tell it what to do&hellip;" autocomplete="off" aria-label="Instruction">
<button type="submit">Send</button><button type="button" id="spk" aria-pressed="true" title="Read replies aloud">&#128266;</button></form>
<div class="hint" id="hint">Type, or press Talk and speak. A new instruction interrupts the current one.</div>
</section></main>
<script>
const log=document.getElementById('log'),st=document.getElementById('st'),t=document.getElementById('t');
let speak=true,lastId=-1;
function add(kind,text){const d=document.createElement('div');d.className='m '+(kind==='log'?'logline':kind);d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight;
 if(kind==='robot'&&speak&&'speechSynthesis' in window){const u=new SpeechSynthesisUtterance(text);u.pitch=0.55;u.rate=0.98;const vs=speechSynthesis.getVoices();const v=vs.find(v=>/male|daniel|george|alex|fred|ryan/i.test(v.name)&&/en/i.test(v.lang))||vs.find(v=>/en/i.test(v.lang));if(v)u.voice=v;speechSynthesis.speak(u);}}
function send(text){fetch('/say',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});}
document.getElementById('f').onsubmit=e=>{e.preventDefault();if(t.value.trim()){send(t.value);t.value='';}};
document.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>send(b.textContent));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{fetch('/view',{method:'POST',body:b.dataset.view});document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',x===b));});
document.getElementById('alarm').onclick=()=>send("Someone is being hurt!");
document.getElementById('reset').onclick=()=>send("reset");
const spk=document.getElementById('spk');spk.onclick=()=>{speak=!speak;spk.setAttribute('aria-pressed',speak);if(!speak&&'speechSynthesis' in window)speechSynthesis.cancel();};
const es=new EventSource('/events');es.onmessage=e=>{const m=JSON.parse(e.data);if(m.id>lastId){lastId=m.id;add(m.kind,m.text);}};
setInterval(()=>fetch('/state').then(r=>r.json()).then(s=>{if(!s.room){return;}st.textContent=`${s.room} · ${s.task}`+(s.holding?` · holding ${s.holding}`:'')+(s.estop?' · E-STOP':'')+` · fatigue ${Math.round(s.fatigue*100)}%`;}).catch(()=>{st.textContent='disconnected';}),1000);
const SR=window.SpeechRecognition||window.webkitSpeechRecognition,mic=document.getElementById('mic');
if(!SR){mic.disabled=true;mic.title='Voice input needs Chrome, Edge or Safari';}
else{const r=new SR();r.lang='en-US';r.interimResults=false;r.continuous=false;let on=false;
 r.onresult=e=>{const txt=e.results[0][0].transcript;send(txt);};r.onend=()=>{on=false;mic.classList.remove('on');mic.setAttribute('aria-pressed','false');};
 r.onerror=e=>{document.getElementById('hint').textContent='Voice: '+e.error+' (allow the microphone, or type instead).';};
 mic.onclick=()=>{if(on){r.stop();return;}if('speechSynthesis' in window)speechSynthesis.cancel();on=true;mic.classList.add('on');mic.setAttribute('aria-pressed','true');r.start();};}
</script></body></html>"""


def make_handler(live):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            elif self.path == "/state":
                self._send(200, json.dumps(live.status).encode(), "application/json")
            elif self.path == "/stream":
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                last = -1
                try:
                    while True:
                        with live.fr_cond:
                            live.fr_cond.wait_for(lambda: live.frame_id != last, timeout=5)
                            f, last = live.frame, live.frame_id
                        if f is None:
                            continue
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(f)).encode() + b"\r\n\r\n" + f + b"\r\n")
                except (BrokenPipeError, ConnectionResetError):
                    pass
            elif self.path == "/events":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                i = max(0, len(live.events) - 30)
                try:
                    while True:
                        with live.ev_cond:
                            live.ev_cond.wait_for(lambda: len(live.events) > 0 and live.events[-1][0] >= i, timeout=15)
                            new = [e for e in live.events if e[0] >= i]
                        if not new:
                            self.wfile.write(b": keep-alive\n\n")
                            self.wfile.flush()
                            continue
                        for eid, kind, text in new:
                            self.wfile.write(f"data: {json.dumps(dict(id=eid, kind=kind, text=text))}\n\n".encode())
                            i = eid + 1
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
            else:
                self._send(404, b"not found", "text/plain")

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(n).decode("utf-8", "replace")
            if self.path == "/say":
                try:
                    text = json.loads(body).get("text", "")
                except json.JSONDecodeError:
                    text = body
                threading.Thread(target=live.hear, args=(text[:500],), daemon=True).start()
                self._send(200, b"ok", "text/plain")
            elif self.path == "/view":
                if body in ("follow", "house", "head"):
                    live.view = body
                self._send(200, b"ok", "text/plain")
            else:
                self._send(404, b"not found", "text/plain")
    return H


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to open it to other devices on your network")
    ap.add_argument("--viewer", action="store_true", help="also open MuJoCo's interactive 3D viewer")
    ap.add_argument("--terminal", action="store_true", help="also read instructions typed in this terminal")
    ap.add_argument("--claude", action="store_true", help="let a Claude model hold the conversation (ANTHROPIC_API_KEY)")
    ap.add_argument("--claude-model", default="claude-opus-5-5")
    ap.add_argument("--speed", type=float, default=1.0, help="simulation speed relative to real time")
    ap.add_argument("--width", type=int, default=800)
    ap.add_argument("--height", type=int, default=500)
    ap.add_argument("--render-every", type=int, default=5, help="video frame every N control steps (50 Hz)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--script", default=None, help="test: a file of 'seconds|instruction' lines to play, then exit")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    live = Live(a)
    if a.claude:
        from live_claude import ClaudeBrain
        live.claude = ClaudeBrain(live, model=a.claude_model)
    threading.Thread(target=live.sim_thread, daemon=True).start()
    if a.script:
        live.ready.wait()
        t0 = time.time()
        for line in Path(a.script).read_text().splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            at, _, text = line.partition("|")
            while time.time() - t0 < float(at) / a.speed:
                time.sleep(0.05)
            live.hear(text)
        return
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(live))
    srv.daemon_threads = True
    print(f"KESTREL live: open http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}", flush=True)
    if a.terminal:
        def term():
            for line in sys.stdin:
                live.hear(line)
        threading.Thread(target=term, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
