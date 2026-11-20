"""Household chores: each is a sequence of the robot's skills in the house, and the house checks the result.

    from house import House; from housebot import HouseBot; from chores import Chores
    h = House(); h.reset(); bot = HouseBot(h); c = Chores(bot)
    c.cook_pasta(); c.make_tea(); c.vacuum("living room"); c.tidy_room(); c.play_uno(); c.saturday()

Every chore returns (ok, note): ok is what the house measured (the pasta cooked and served with the hob off, the dust
picked up, every toy in the toy box ...), not what the robot believes it did.
"""
from __future__ import annotations

import math
import random

import numpy as np

import house as HS
import housebot as HB
import skills as SK
import env as E
import uno as U


class Chores:
    def __init__(self, bot, log=None):
        self.bot = bot
        self.h = bot.h
        self.log = log or bot.log

    # ------------------------------------------------------------------------------------------ kitchen
    def wait_for(self, cond, max_s, tick=0.5):
        t0 = self.h.t
        while not cond() and self.h.t - t0 < max_s:
            if self.bot.seated:
                self.bot.rest(tick)
            else:
                self.bot.stand_still(tick)
        return cond()

    def make_tea(self, mug="mug_red", to="you"):
        """Fill the kettle, boil it, pour a mug, bring it to you."""
        b, h = self.bot, self.h
        b.say("I'll make you a cup of tea.")
        # the mug to the dining table first: pouring over a mug on the worktop needs the kettle higher than this arm
        # reaches, and the table is near you anyway
        ok = b.pick(mug) and b.place("dining table")
        ok = ok and b.fill("kettle", 0.5) and b.place("kettle base") and b.press("kettle")    # more than a cupful
        ok = ok and self.wait_for(lambda: h.temp["kettle"] >= 99.0 or not h.st["kettle"], 60.0) and h.temp["kettle"] >= 95.0
        ok = ok and b.pick("kettle") and b.pour(mug) and b.place("kettle base")
        if to != "you" or math.dist(h.obj_pos(mug)[:2], h.person_xy("you")) > 2.5:
            ok = ok and b.pick(mug) and b.place(to)
        served = h.tea[mug] and math.dist(h.obj_pos(mug)[:2], h.person_xy(to)) < 2.5
        return bool(ok and served), (f"water {h.water['kettle']:.2f} l, kettle {h.temp['kettle']:.0f} C, tea in the mug "
                                     f"{h.tea[mug]}, mug {math.dist(h.obj_pos(mug)[:2], h.person_xy(to)):.1f} m from {to}")

    def cook_pasta(self):
        """Pot of water on the hob, hob on, pasta in once it boils, cook it, hob off, pot to the table."""
        b, h = self.bot, self.h
        b.say("Pasta. I'll be the chef.")
        ok = b.fill("pot", 0.6) and b.place("hob") and b.press("hob")
        ok = ok and self.wait_for(lambda: h.temp["pot"] >= 98.0, 60.0)
        ok = ok and b.pick("pasta") and b.pour("pot") and b.place("kitchen counter")
        ok = ok and self.wait_for(lambda: h.cook_t >= HS.COOK_S, HS.COOK_S + 30.0)
        hob_off = b.press("hob") if h.st["hob"] else True
        served = ok and b.pick("pot") and b.place("trivet")
        bad = [e for t, e in h.events if "burning" in e or "nothing on it" in e]
        on_table = h.on_zone("pot", "trivet", HS.Z0 + 0.75)
        ok = bool(served and hob_off and not h.st["hob"] and h.cook_t >= HS.COOK_S and on_table and not bad)
        return ok, (f"water {h.water['pot']:.1f} l, pasta {h.pot_pasta}, cooked {h.cook_t:.0f} s, hob "
                    f"{'on!' if h.st['hob'] else 'off'}, pot on the table {on_table}{', ' + '; '.join(bad) if bad else ''}")

    def set_table(self, mugs=tuple(HS.MUGS)):
        """A mug at four places on the dining table."""
        b, h = self.bot, self.h
        for m in mugs:
            if not (b.pick(m) and b.place("dining table")):
                if h.holding:
                    b.place("floor")
        f = h.b.furniture["dining table"]
        on = [m for m in mugs if abs(h.obj_pos(m)[0] - f["xy"][0]) < f["size"][0] / 2
              and abs(h.obj_pos(m)[1] - f["xy"][1]) < f["size"][1] / 2 and abs(h.obj_pos(m)[2] - f["top"] - 0.05) < 0.04]
        gaps = [math.dist(h.obj_pos(a)[:2], h.obj_pos(c)[:2]) for i, a in enumerate(on) for c in on[i + 1:]]
        return len(on) == len(mugs), f"{len(on)} of {len(mugs)} mugs on the table, closest pair {min(gaps) if gaps else 0:.2f} m apart"

    def wash_up(self, mugs=tuple(HS.MUGS)):
        """Every mug into the sink."""
        b, h = self.bot, self.h
        for m in mugs:
            if not h.in_container(m, "sink"):
                if b.pick(m):
                    b.drop_into("sink")
        n = sum(h.in_container(m, "sink") for m in mugs)
        return n == len(mugs), f"{n} of {len(mugs)} mugs in the sink"

    # ------------------------------------------------------------------------------------------ cleaning
    def vacuum(self, room="living room", n_dust=40, seed=0, need=0.65):
        """Dust on the floor of a room; the robot vacuums it; the house counts what the vacuum's head picked up."""
        h, b = self.h, self.bot
        h.set_dirt(h.dirt_points(room, n_dust, random.Random(seed)))
        r = b.vacuum_room(room)
        got, total = r if isinstance(r, tuple) else (int((~h.dirt_on & (h.dirt_xy[:, 0] < 1e5)).sum()), n_dust)
        back = math.dist(h.obj_pos("hoover")[:2], h.b.objects["hoover"]["start"][:2]) < 2.0
        return got >= need * total, f"picked up {got} of {total} specks of dust ({got / max(1, total):.0%}); vacuum put back {back}"

    def tidy_room(self, room="kids room"):
        """The mess on the floor: toys into the toy box, clothes into the hamper."""
        b, h = self.bot, self.h
        b.say("This room is a disgrace. Tidying.")
        for o in HS.TOYS + HS.CLOTHES:
            dest = "toy box" if o in HS.TOYS else "hamper"
            if h.in_container(o, dest):
                continue
            if b.pick(o):
                b.drop_into(dest)
        toys = sum(h.in_container(o, "toy box") for o in HS.TOYS)
        clothes = sum(h.in_container(o, "hamper") for o in HS.CLOTHES)
        n = len(HS.TOYS) + len(HS.CLOTHES)
        return toys + clothes == n, f"{toys}/{len(HS.TOYS)} toys in the toy box, {clothes}/{len(HS.CLOTHES)} clothes in the hamper"

    def laundry(self):
        """The laundry basket up the stairs to the laundry room, on the counter, washing machine on, wait for it."""
        b, h = self.bot, self.h
        ok = b.pick("basket") and b.place("laundry counter") and b.press("washer")
        ok = ok and self.wait_for(lambda: h.washed, HS.WASH_S + 20.0)
        up = h.room_of(*h.obj_pos("basket")[:2]) == "laundry"
        return bool(ok and up and h.washed), f"basket in the {h.room_of(*h.obj_pos('basket')[:2])}, washed {h.washed}"

    def take_out_trash(self):
        """The bin bag out of the front door, down the porch steps, into the garden bin."""
        b, h = self.bot, self.h
        ok = b.pick("trash") and b.drop_into("garden bin")
        inside = h.in_container("trash", "garden bin")
        return bool(ok and inside), f"bag in the garden bin {inside}"

    def water_plants(self, plants=None):
        """Fill the watering can at the sink, water each indoor plant, put the can back outside."""
        b, h = self.bot, self.h
        plants = plants if plants is not None else [k for k, (x, y) in enumerate(h.b.plants)
                                                    if h.room_of(x, y) not in ("garden", "patio")]
        ok = b.fill("can", 0.5)
        for k in plants:
            if not ok:
                break
            if h.water["can"] < 0.2:
                ok = b.fill("can", 0.5)
            b.pour(k)
        if h.holding == "can":
            b.place("patio") if h.holding else None
        n = len(set(plants) & h.watered)
        return n == len(plants), f"watered {n} of {len(plants)} plants"

    # ------------------------------------------------------------------------------------------ people
    def greet_visitor(self):
        """The doorbell: go to the front door, greet Sam, lead them to the living room and offer the sofa.
        Never closer than 1.2 m to them."""
        b, h = self.bot, self.h
        h.start_visitor()
        closest = [99.0]
        step0 = h.step

        def step(*a, **k):
            r = step0(*a, **k)
            x, y, _ = h.robot_pose()
            sx, sy = h.person_xy("sam")
            closest[0] = min(closest[0], math.hypot(sx - x, sy - y))
            return r
        h.step = step
        try:
            b.say("Someone's at the door. I'll get it.")
            ok = b.goto((12.3, 5.9), stop=0.25)
            self.wait_for(lambda: math.dist(h.person_xy("sam"), (15.3, 5.9)) < 0.1, 30.0)
            sx, sy = h.person_xy("sam")
            x, y, _ = h.robot_pose()
            b.turn_to(math.atan2(sy - y, sx - x))
            b.say("Hello, Sam. Come in, follow me.")
            h.gesture("wave")
            h.follow_me()
            ok = ok and b.go("living room")
            b.turn_to(math.atan2(h.b.furniture["sofa"]["xy"][1] - h.robot_pose()[1], h.b.furniture["sofa"]["xy"][0] - h.robot_pose()[0]))
            b.say("Have a seat on the sofa. I'll tell them you're here.")
            h.point(np.array([*h.b.furniture["sofa"]["xy"], 0.4]))
            self.wait_for(lambda: h.room_of(*h.person_xy("sam")) == "living room", 30.0)
        finally:
            h.step = step0
        there = h.room_of(*h.person_xy("sam")) == "living room"
        return bool(ok and there and closest[0] >= 1.2), f"Sam in the {h.room_of(*h.person_xy('sam'))}, closest {closest[0]:.2f} m"

    # ------------------------------------------------------------------------------------------ Uno
    TRAY_FWD, TRAY_RIGHT = 0.48, 0.2

    def play_uno(self, games=1, seed=0, opponent=None, chair="dining chair 3", you_move=None):
        """Sit at the table; you pull the card tray up; play Uno. The robot reaches to the deck to draw and to the pile
        to play (the house checks its hook got there), says its cards and 'Uno'. you_move(game) -> (card, colour)
        lets a person play (live mode); otherwise a simulated player does."""
        b, h = self.bot, self.h
        if not b.sit(chair):
            return False, "couldn't sit down"
        c = h.b.chairs[chair]
        f = c["face"]
        fx, fy = math.cos(f), math.sin(f)
        rx, ry = math.sin(f), -math.cos(f)                    # the robot's right
        tx = c["xy"][0] + self.TRAY_FWD * fx + self.TRAY_RIGHT * rx
        ty = c["xy"][1] + self.TRAY_FWD * fy + self.TRAY_RIGHT * ry
        h.place_tray(tx, ty, f)
        h.set_mocap("you", c["xy"][0] + 2.2 * fx, c["xy"][1] + 2.2 * fy)
        top = h.floor_z(tx, ty) + 0.72
        deck = np.array([tx - 0.09 * fx, ty - 0.09 * fy, top + 0.02])
        pile = np.array([tx + 0.08 * fx, ty + 0.08 * fy, top + 0.01])
        b.say("Uno. I warn you, I've calculated every card.")
        stats = dict(games=0, robot_wins=0, reaches=0, reach_ok=0, uno_calls=0, caught=0, illegal=0, turns=0)

        def reach(target):
            cur = h.arms_now()
            sh0, el0, _ = h.ik_right(target + [0, 0, 0.08])
            sh1, el1, err = h.ik_right(target)
            kf = [(0.0, cur), (0.9, [cur[0], sh0, cur[2], el0]), (1.5, [cur[0], sh1, cur[2], el1]),
                  (1.8, [cur[0], sh1, cur[2], el1]), (2.4, [cur[0], sh0, cur[2], el0]), (3.0, cur)]
            best = 9.0
            for k in range(int(3.1 / E.DT)):
                h.step(legs=h.legs_now(), arms=SK.keyframes(kf, k * E.DT))
                best = min(best, float(np.linalg.norm(h.hook_world() - target)))
            stats["reaches"] += 1
            stats["reach_ok"] += best < 0.06
            return best

        def on_turn(g, p, action):
            stats["turns"] += 1
            if p == robot:
                if action[0] == "draw":
                    reach(deck)
                    b.say("I'll draw.")
                else:
                    card, colour = action[1], action[2]
                    reach(pile)
                    h.set_pile(U.RGB[g.colour])
                    b.say(U.say_play(card, colour or g.colour))
                    if len(g.hands[p]) == 1:
                        b.say("Uno.")
                        stats["uno_calls"] += 1
                if "caught" in action:
                    stats["caught"] += 1
            else:
                h.set_pile(U.RGB[g.colour])
                if "caught" in action:
                    b.say("You didn't say Uno. Draw two.")
                    stats["caught"] += 1
                b.rest(1.5)                                  # your turn takes a moment

        class Human:                                          # a person at the table (live mode)
            def choose(self, g, p):
                return you_move(g)

            def pick_colour(self, g, p):
                return "red"

            def play_drawn(self, g, p, card):
                return False

            def says_uno(self, g, p):
                return True

            def catches(self, g, p):
                return True

        for k in range(games):
            g = U.Uno(seed=seed + k)
            robot = k % 2
            other = Human() if you_move else (opponent or U.RandomPlayer(seed=seed + k))
            players = [U.RobotPlayer(), other] if robot == 0 else [other, U.RobotPlayer()]
            h.set_pile(U.RGB[g.colour])
            w = g.play(*players, on_turn=on_turn)
            stats["games"] += 1
            stats["robot_wins"] += w == robot
            stats["illegal"] += g.illegal
            b.say("I win. As calculated." if w == robot else "You win. I'll allow it, this once.")
        h.place_tray(20.0, 21.0)
        h.e.d[0].mocap_pos[h.mocap["card_tray"]][2] = -5.0
        stood = b.stand()
        ok = (stats["illegal"] == 0 and stats["reach_ok"] >= 0.9 * stats["reaches"] and stood and not b.sup.latched)
        return ok, (f"{stats['games']} game(s), robot won {stats['robot_wins']}; {stats['turns']} turns, reaches "
                    f"{stats['reach_ok']}/{stats['reaches']} on target, Uno called {stats['uno_calls']}x, missed Unos caught "
                    f"{stats['caught']}, illegal plays {stats['illegal']}; stood up after {stood}")

    # ------------------------------------------------------------------------------------------ a whole day
    def saturday(self):
        """Every chore in a row, as one long run."""
        out = []
        for name, fn in [("tidy the kids' room", self.tidy_room), ("laundry", self.laundry),
                         ("vacuum the living room", lambda: self.vacuum("living room")), ("cook pasta", self.cook_pasta),
                         ("set the table", self.set_table), ("wash up", self.wash_up), ("take out the trash", self.take_out_trash),
                         ("water the plants", self.water_plants), ("tea", self.make_tea), ("Uno", self.play_uno)]:
            try:
                ok, note = fn()
            except HB.Interrupted as e:
                ok, note = False, f"interrupted: {e}"
                if str(e) == "fell":
                    self.bot.reset_after_fall()
            out.append((name, ok, note))
            self.log(f"  [{self.h.t:6.1f} s] == {name}: {'done' if ok else 'FAILED'} ({note})")
        n = sum(o[1] for o in out)
        return n == len(out), f"{n} of {len(out)} chores done: " + "; ".join(f"{a} {'ok' if b else 'FAIL'}" for a, b, _ in out)
