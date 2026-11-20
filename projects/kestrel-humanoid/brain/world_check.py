"""Can the jobs in learn_test.py be done at all with the robot's own actions? This runs one way of doing each, step by
step through the same actions the agent has (pick up, put, press, pour, use, inspect), and reports where it breaks.
It is a check of the house and the actions - the robot never sees it, and it is not a skill.

    python world_check.py bathroom          # or: steak, wipe
"""
from __future__ import annotations

import random
import sys
import time


def run(job, seed=1):
    import house as HS
    import housebot as HB
    h = HS.House(seed=seed, walker=False, vacuum=False)
    h.reset()
    log = []
    bot = HB.HouseBot(h, log=lambda *a: (log.append(" ".join(map(str, a))), print(" ".join(map(str, a)), flush=True)), seed=seed)
    W = h.world
    rng = random.Random(seed)
    h.place_robot(7.0, 5.9, 0.0)
    for _ in range(25):
        h.step()
    t0 = time.time()

    def do(name, ok_note):
        ok, note = ok_note if isinstance(ok_note, tuple) else (ok_note, "")
        print(f"[{h.t:6.1f} s] {name}: {'ok' if ok else 'FAILED'} {note}", flush=True)
        return ok

    if job == "bathroom":
        W.soil(["bath", "basin", "toilet"], 6, rng)
        print(W.describe("bathroom"))
        do("pick up the spray", bot.pick("spray"))
        for s in ("bath", "basin", "toilet"):
            do(f"spray the {s}", bot.use(s))
        do("put the spray on the basin", bot.place("floor"))
        do("pick up the brush", bot.pick("brush"))
        for _ in range(10):
            if W.grime_left(room="bathroom") == 0:
                break
            do("scrub the bathroom", bot.use("bathroom"))
            print("  ", W.describe("bathroom"))
        ok = W.grime_left(room="bathroom") == 0
    elif job == "wipe":
        W.soil(["dining table"], 4, rng)
        do("pick up the brush", bot.pick("brush"))
        for _ in range(8):
            if W.grime_left(surfaces=["dining table"]) == 0:
                break
            do("scrub the table", bot.use("dining table"))
        ok = W.grime_left(surfaces=["dining table"]) == 0
    elif job == "steak":
        steps = [("pick up the pan", lambda: bot.pick("pan")), ("put it on the hob", lambda: bot.place("hob")),
                 ("hob on", lambda: bot.press("hob")), ("pick up the board", lambda: bot.pick("board")),
                 ("pour the steak into the pan", lambda: bot.pour("pan")), ("put the board down", lambda: bot.place("kitchen island")),
                 ("pick up the spatula", lambda: bot.pick("spatula"))]
        ok = all(do(n, f()) for n, f in steps)
        print("  ", W.describe("steak"))
        while ok and W.steak["sear"][W.steak["down"]] < 60 and h.t < 900:
            bot.stand_still(2.0)
        print("  ", W.describe("steak"))
        ok = ok and do("turn the steak over", bot.use("pan"))
        ok = ok and do("put the spatula down", bot.place("kitchen counter"))
        print("  ", W.describe("steak"))
        while ok and W.steak["core"] < 48 and h.t < 1200:        # off a little early: it keeps cooking in the pan
            bot.stand_still(2.0)
        print("  ", W.describe("steak"))
        ok = ok and do("hob off", bot.press("hob")) and do("pick up the pan", bot.pick("pan")) \
            and do("serve onto the plate", bot.pour("plate"))
        print("  ", W.describe("steak"), "| hob", "on" if h.st["hob"] else "off")
        ok = ok and W.food_in["steak"] == "plate" and W.doneness() in ("medium rare", "medium", "medium well") and not h.st["hob"]
    else:
        raise SystemExit(f"unknown job {job}")
    print(f"{job}: {'DONE' if ok else 'NOT DONE'} in {h.t:.0f} s simulated, {(time.time() - t0) / 60:.1f} min; fell {bot.sup.latched}")
    return ok


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "bathroom")
