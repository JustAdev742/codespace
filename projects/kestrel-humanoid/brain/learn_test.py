"""Does the robot learn? Claude, as the robot's mind (agent.py), gets jobs nobody wrote a skill for, several times
over, with its memory (skills, lessons, past attempts) carried from one attempt to the next. The house scores every
attempt from its state - never from which steps were taken - and the tokens and their cost are counted.

    python learn_test.py --task steak --attempts 3                       # default model: the agent's (claude-sonnet-5-5)
    python learn_test.py --task bathroom --attempts 3 --model claude-opus-5-5
    python learn_test.py --task steak --attempts 1 --stand-in            # no API: a stand-in that only checks the plumbing

Jobs (none has a starter skill; the general rules are in world.py):
  steak     "Cook the steak medium and serve it on the plate on the dining table, then turn the hob off."
            Passes when the steak is on the plate, cooked medium (57-63 C inside) and not burnt, and the hob is off.
  bathroom  The bath and basin have grimy patches. "The bathroom is grimy - please clean it."
            Passes when no grime is left in the bathroom.
  wipe      Grime on the dining table. "Wipe the dining table clean." Passes when the table is clean.

Each run starts from an empty memory of its own (runs/learn/<task>_<model>.json), so what the later attempts know,
they learned in the earlier ones. Reported per attempt: passed, steps, simulated time, tokens, estimated cost.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

# $ per million tokens: input, output, cache read, cache write (5-minute writes taken as 1.25x input: an estimate)
PRICES = {"claude-opus-5-5": (4.0, 20.0, 0.20, 5.0), "claude-sonnet-5-5": (2.0, 10.0, 0.10, 2.5),
          "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125)}

TASKS = {
    "steak": "Cook the steak medium and serve it on the plate on the dining table, then turn the hob off.",
    "bathroom": "The bathroom is grimy - please clean it.",
    "wipe": "Wipe the dining table clean.",
}


def cost(model, u):
    p = PRICES.get(model)
    if p is None:
        return None
    return (u["input"] * p[0] + u["output"] * p[1] + u["cache_read"] * p[2] + u["cache_write"] * p[3]) / 1e6


def score(task, h):
    w = h.world
    if task == "steak":
        on_plate = w.food_in["steak"] == "plate"
        f = h.b.furniture["dining table"]
        pp = h.obj_pos("plate")
        plate_on_table = abs(pp[0] - f["xy"][0]) < f["size"][0] / 2 and abs(pp[1] - f["xy"][1]) < f["size"][1] / 2
        done = w.doneness()
        ok = on_plate and plate_on_table and done == "medium" and not h.st["hob"]
        return ok, (f"steak on the plate {on_plate}, plate on the table {plate_on_table}, {done} "
                    f"({w.steak['core']:.0f} C inside, sides {w.steak['sear'][0]:.0f}/{w.steak['sear'][1]:.0f}), "
                    f"hob {'on' if h.st['hob'] else 'off'}")
    if task == "bathroom":
        n = w.grime_left(room="bathroom")
        return n == 0, f"{n} grimy patch(es) left in the bathroom"
    if task == "wipe":
        n = w.grime_left(surfaces=["dining table"])
        return n == 0, f"{n} grimy patch(es) left on the dining table"
    raise ValueError(task)


def setup(task, seed):
    import house as HS
    import housebot as HB
    h = HS.House(seed=seed, walker=False, vacuum=False)
    h.reset()
    bot = HB.HouseBot(h, log=lambda *a: None, seed=seed)
    rng = random.Random(seed)
    if task == "bathroom":
        h.world.soil(["bath", "basin"], 6, rng)        # (the toilet: reachable with the long brush, but not reliably yet)
    elif task == "wipe":
        h.world.soil(["dining table"], 4, rng)
    h.place_robot(7.0, 5.9, rng.uniform(-3.1, 3.1))            # in the hall
    for _ in range(25):
        h.step()
    return h, bot


class StandIn:
    """A stand-in for the API (no network, no cost): looks, inspects, gives up. Only checks the plumbing."""

    def __init__(self):
        self.n = 0
        self.messages = self

    def create(self, **kw):
        import types
        self.n += 1
        b = lambda **k: types.SimpleNamespace(**k)                  # noqa: E731
        u = b(input_tokens=1000, output_tokens=100, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        if self.n == 1:
            return b(stop_reason="tool_use", usage=u, content=[b(type="tool_use", id="t1", name="inspect", input={"thing": "steak"})])
        if self.n == 2:
            return b(stop_reason="tool_use", usage=u, content=[b(type="tool_use", id="t2", name="note_lesson",
                                                                  input={"text": "stand-in: nothing learned"})])
        return b(stop_reason="tool_use", usage=u, content=[b(type="tool_use", id="t3", name="done",
                                                              input={"summary": "stand-in stops", "success": False})])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--task", choices=sorted(TASKS), default="steak")
    ap.add_argument("--attempts", type=int, default=3)
    ap.add_argument("--model", default="claude-sonnet-5-5")
    ap.add_argument("--effort", default="medium")
    ap.add_argument("--max-turns", type=int, default=60)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--stand-in", action="store_true")
    ap.add_argument("--keep-memory", action="store_true", help="carry on from the memory an earlier run left")
    ap.add_argument("--out", default=str(HERE / "runs" / "learn"))
    a = ap.parse_args()
    from agent import Memory, RobotAgent
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tag = f"{a.task}_{'standin' if a.stand_in else a.model}"
    mem_path = out / f"{tag}.json"
    if mem_path.exists() and not a.keep_memory:
        mem_path.unlink()                                          # every run learns from nothing (unless told)
    log = open(out / f"{tag}.log", "a")
    results = []
    first = 1 + (len(json.loads(mem_path.read_text()).get("episodes", [])) if a.keep_memory and mem_path.exists() else 0)
    for k in range(a.attempts):
        h, bot = setup(a.task, a.seed + first - 1 + k)
        events = []
        agent = RobotAgent(h, bot, model=a.model, effort=a.effort, memory=Memory(mem_path),
                           client=StandIn() if a.stand_in else None,
                           on_event=lambda kind, text: events.append(f"[{h.t:6.1f}] {kind}: {text[:300]}"))
        t0 = time.time()
        try:
            claimed, summary = agent.run(TASKS[a.task], max_turns=a.max_turns)
        except Exception as e:                                     # an API or simulation error is a failed attempt
            claimed, summary = False, f"error: {type(e).__name__}: {e}"
        ok, state = score(a.task, h)
        c = None if a.stand_in else cost(a.model, agent.usage)
        r = dict(attempt=first + k, passed=ok, claimed=claimed, state=state, summary=summary[:300], steps=len(
            [e for e in events if "action:" in e]), sim_s=round(h.t, 1), wall_min=round((time.time() - t0) / 60, 1),
                 usage=agent.usage, cost_usd=None if c is None else round(c, 3),
                 skills=sorted(agent.mem.d["skills"]), lessons=len(agent.mem.d["lessons"]))
        results.append(r)
        log.write(json.dumps(r) + "\n" + "\n".join(events) + "\n\n")
        log.flush()
        print(f"attempt {first + k}: {'PASSED' if ok else 'failed'} ({state}); robot said {'done' if claimed else 'not done'}; "
              f"{r['steps']} actions, {r['sim_s']:.0f} s simulated, {r['wall_min']} min; "
              f"{agent.usage['input'] + agent.usage['cache_read'] + agent.usage['cache_write']} in / {agent.usage['output']} out tokens"
              + (f", about ${c:.2f}" if c is not None else "") + f"; knows {len(r['skills'])} skill(s), {r['lessons']} lesson(s)",
              flush=True)
    total = sum(r["cost_usd"] or 0 for r in results)
    summary = dict(task=a.task, model=a.model, attempts=a.attempts, passed=[r["passed"] for r in results],
                   total_cost_usd=round(total, 2), memory=json.loads(mem_path.read_text()) if mem_path.exists() else {})
    (out / f"{tag}_summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps({k: v for k, v in summary.items() if k != "memory"}))


if __name__ == "__main__":
    main()
