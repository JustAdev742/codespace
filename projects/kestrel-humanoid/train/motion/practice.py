"""Practice: the motion generator learns what this robot's body can actually do.

    python -m motion.practice --ckpt runs/motion/generator/model.pt --library runs/motion/bandai_library.npz \\
        --captions runs/motion/cmu_captions.json --rounds 200            # -> runs/motion/practice/
    python -m motion.generator train --libs runs/motion/bandai_library.npz runs/motion/cmu_library.npz \\
        runs/motion/practice/practice_library.npz --captions runs/motion/cmu_captions.json \\
        runs/motion/practice/practice_captions.json --upweight practice=5 --out runs/motion/generator --hours 1

Each round: pick a description (one from the training data, an everyday movement, or something people asked the robot
for), generate a motion, play it on the simulated G1 through the balance controller, and score it: did it stay up,
did the body follow the generated motion, did it keep its footing. The motions it performed well are saved - the
joint angles the robot actually achieved, which are physically possible for this body, not the generated ones - as new
captioned clips. Fine-tuning the generator on them (alongside the original data, upweighted) teaches it to make motions
this body can do. Run practice again after fine-tuning and the success rate is the measure of what it learned.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from .generator import FPS, Generator, captions_for, refused

EVERYDAY = ["a person waves hello", "a person waves goodbye with both hands", "a person bows politely", "a person stretches "
            "both arms above the head", "a person looks around", "a person points to the left", "a person points forward",
            "a person claps their hands", "a person raises the right hand", "a person shrugs", "a person dances happily",
            "a person sways from side to side", "a person nods", "a person beckons someone over", "a person stands still",
            "a person crosses their arms", "a person scratches their head", "a person shows the way with the left arm",
            "a person celebrates with both arms up", "a person does a small dance on the spot", "a person reaches forward",
            "a person bends down", "a person walks forward slowly", "a person turns around", "a person steps to the side"]


def prompts(captions=(), extra=(), seed=0):
    cmu = {}
    for c in captions:
        cmu.update(json.loads(Path(c).read_text()))
    out = list(EVERYDAY) + list(extra)
    for name in cmu:
        out += captions_for(name, cmu)[1:2]
    return [p for p in dict.fromkeys(out) if not refused(p)]


def run_one(mv_factory, g, text, seconds, seed):
    """Generate a motion for text, play it on a fresh G1, return (ok, score dict, executed clip or None)."""
    from .mover import DT
    f = g.generate(text, seconds, seed=seed)
    mv = mv_factory()
    mv.set_intent("generate", text=text, preset=f)
    n = int((len(f) / FPS + 0.6) / DT)
    q_exec, rp, rq, err = [], [], [], []
    ok = True
    for k in range(n):
        if not mv.step():
            ok = False
            break
        if k % int(1 / (50 * DT)) == 0:                  # record at 50 Hz
            d = mv.d
            q_exec.append(d.qpos[mv.qadr].copy())
            rp.append(d.qpos[0:3].copy())
            rq.append(d.qpos[3:7].copy())
            if mv.blend > 0.9:
                err.append(float(np.abs(q_exec[-1] - mv.human["q"]).mean()))
    track = float(np.mean(err)) if err else 9.9
    good = ok and track < 0.25 and len(q_exec) > 40
    clip = dict(q=np.array(q_exec, np.float32), root_pos=np.array(rp, np.float32), root_quat=np.array(rq, np.float32)) if good else None
    return good, dict(text=text, fell=not ok, tracking_rad=round(track, 3), seconds=round(len(q_exec) / 50, 1)), clip


def save_library(path, caps_path, clips):
    """Append clips [(name, text, clip)] to a library .npz (the format library.py writes) and its captions."""
    path, caps_path = Path(path), Path(caps_path)
    q, rp, rq, starts, lens, names = [], [], [], [], [], []
    caps = json.loads(caps_path.read_text()) if caps_path.exists() else {}
    if path.exists():
        z = np.load(path, allow_pickle=True)
        q, rp, rq = [z["q"]], [z["root_pos"]], [z["root_quat"]]
        starts, lens, names = list(z["clip_start"]), list(z["clip_len"]), list(z["clip_name"])
    total = sum(len(a) for a in q)
    for name, text, c in clips:
        q.append(c["q"])
        rp.append(c["root_pos"])
        rq.append(c["root_quat"])
        starts.append(total)
        lens.append(len(c["q"]))
        names.append(name)
        caps[name] = text
        total += len(c["q"])
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, q=np.concatenate(q), root_pos=np.concatenate(rp), root_quat=np.concatenate(rq),
                        clip_start=np.array(starts), clip_len=np.array(lens), clip_name=np.array(names))
    caps_path.write_text(json.dumps(caps, indent=0))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--ckpt", default="runs/motion/generator/model.pt")
    ap.add_argument("--library", default="runs/motion/bandai_library.npz", help="motion library for the mover's walking")
    ap.add_argument("--captions", nargs="*", default=[], help="caption files to draw descriptions from")
    ap.add_argument("--prompts", default=None, help="a text file of extra descriptions, one per line (e.g. requests)")
    ap.add_argument("--from-memory", nargs="?", const="runs/motion/g1_memory.json", default=None,
                    help="also practise what people asked the robot for (live_mover.py --claude keeps them there)")
    ap.add_argument("--rounds", type=int, default=100)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="runs/motion/practice")
    ap.add_argument("--eval-only", action="store_true", help="score, save nothing (before/after fine-tuning)")
    a = ap.parse_args()
    from .mover import Mover
    g = Generator(a.ckpt)
    extra = Path(a.prompts).read_text().splitlines() if a.prompts else []
    if a.from_memory and Path(a.from_memory).exists():
        asked = json.loads(Path(a.from_memory).read_text()).get("requests", [])
        extra += [t if t.lower().startswith("a person") else f"a person {t}" for t in asked]
    pool = prompts(a.captions, extra)
    rng = np.random.default_rng(a.seed)
    base = Mover(a.library, generator=g)
    factory = lambda: Mover(a.library, db=base.db, generator=g)      # noqa: E731
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    log = open(out / "practice_log.jsonl", "a")
    keep, wins, t0 = [], 0, time.time()
    for r in range(a.rounds):
        text = str(rng.choice(pool))
        good, score, clip = run_one(factory, g, text, float(rng.choice([3.2, 4.8])), seed=int(rng.integers(1 << 30)))
        wins += good
        score.update(round=r, kept=good, model_step=g.steps_done)
        log.write(json.dumps(score) + "\n")
        log.flush()
        print(f"{r + 1:4d}/{a.rounds} {'KEPT' if good else 'no  '} fell={score['fell']!s:5} tracking {score['tracking_rad']:.2f} rad  "
              f"{text[:70]}", flush=True)
        if good and not a.eval_only:
            keep.append((f"practice_{int(time.time())}_{r}", text, clip))
            if len(keep) >= 10:
                save_library(out / "practice_library.npz", out / "practice_captions.json", keep)
                keep = []
    if keep and not a.eval_only:
        save_library(out / "practice_library.npz", out / "practice_captions.json", keep)
    print(json.dumps(dict(rounds=a.rounds, performed_well=wins, rate=round(wins / max(1, a.rounds), 3),
                          model_step=g.steps_done, minutes=round((time.time() - t0) / 60, 1))))


if __name__ == "__main__":
    main()
