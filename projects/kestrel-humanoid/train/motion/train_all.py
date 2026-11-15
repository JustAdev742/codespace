"""The whole run, one command: every dataset in, one whole-body G1 motion controller out.

    python -m motion.train_all --data /data/AMASS /data/bandai /data/nymeria --smplh /data/smplh \\
        --out runs/motion --gpus 8 --cpus 76 --hours 22

Stages (each skipped if its output already exists, so re-running the same command resumes):
  1. library     read, filter (no striking motions), retarget, make feasible, cluster   (CPU, all cores)
  2. warmstart   behaviour cloning from the reference motions                            (GPU 0)
  3. specialists one PPO specialist per motion family, all at once, one per GPU          (all GPUs)
  4. distill     the specialists taught to one controller (DAgger)                       (GPU 0)
  5. evaluate    success on held-out clips                                               (GPU 0)

--hours is the training budget for stages 3 and 4 together (60 % / 35 %; preparation and evaluation are extra).
--smoke runs every stage for a few iterations on whatever data is given, to check the setup before the long run.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TRAIN = HERE.parent


def run(cmd, env=None, log=None):
    print("  $ " + " ".join(map(str, cmd)), flush=True)
    if log:
        with open(log, "a") as f:
            return subprocess.Popen(list(map(str, cmd)), cwd=TRAIN, env=env, stdout=f, stderr=subprocess.STDOUT)
    return subprocess.Popen(list(map(str, cmd)), cwd=TRAIN, env=env)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--smplh", default=None, help="SMPL+H body model folder (needed for AMASS)")
    ap.add_argument("--out", default="runs/motion")
    ap.add_argument("--gpus", type=int, default=None, help="GPUs to use (default: all visible; 0 = CPU only)")
    ap.add_argument("--cpus", type=int, default=max(1, (os.cpu_count() or 2) - 2), help="CPU processes for simulation")
    ap.add_argument("--hours", type=float, default=22.0, help="training budget for specialists + distillation")
    ap.add_argument("--families", type=int, default=None, help="motion families = specialists (default: number of GPUs)")
    ap.add_argument("--envs", type=int, default=64, help="robots per simulation process")
    ap.add_argument("--smoke", action="store_true", help="a few iterations of every stage, to test the setup")
    a = ap.parse_args()

    import torch
    gpus = torch.cuda.device_count() if a.gpus is None else a.gpus
    fams = a.families or max(1, gpus) if not a.smoke else (a.families or 2)
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    lib = out / "library.npz"
    dev = lambda i: f"cuda:{i % gpus}" if gpus > 0 else "cpu"
    t0 = time.time()
    plan = dict(gpus=gpus, families=fams, cpus=a.cpus, hours=a.hours, smoke=a.smoke)
    print(f"plan: {json.dumps(plan)}", flush=True)

    # 1. library
    if not lib.exists():
        print("[1/5] building the motion library", flush=True)
        cmd = [py, "-m", "motion.library", "--data", *a.data, "--out", lib, "--procs", max(1, a.cpus),
               "--families", fams]
        if a.smplh:
            cmd += ["--smplh", a.smplh]
        if a.smoke:
            cmd += ["--iters", "60", "--max-frames", "600"]
        if run(cmd).wait() != 0:
            sys.exit("library stage failed")
    summary = json.loads(Path(str(lib) + ".log.json").read_text())["summary"]
    fams = summary["families"]
    print(f"      library: {summary['clips']} clips, {summary['hours']} h, {fams} families, "
          f"{summary['excluded']} excluded, {summary['failed']} failed", flush=True)

    # 2. warm start
    ws = out / "warmstart.pt"
    if not ws.exists():
        print("[2/5] warm start (behaviour cloning)", flush=True)
        cmd = [py, "-m", "motion.trainers", "warmstart", "--lib", lib, "--out", ws, "--device", dev(0),
               "--samples", 400 if a.smoke else 50000, "--epochs", 3 if a.smoke else 20]
        if run(cmd).wait() != 0:
            sys.exit("warm start failed")

    # 3. specialists, in parallel, one per GPU
    spec_h = 0.6 * a.hours
    per = max(1, a.cpus // fams)
    procs = []
    for f in range(fams):
        d = out / f"spec{f}"
        if (d / "done").exists():
            continue
        d.mkdir(exist_ok=True)
        cmd = [py, "-m", "motion.trainers", "specialist", "--lib", lib, "--family", f, "--init", ws, "--out", d,
               "--device", dev(f), "--workers", per, "--envs", 4 if a.smoke else a.envs, "--hours", spec_h,
               "--seed", f]
        if a.smoke:
            cmd += ["--iters", "3", "--steps", "8"]
        procs.append((f, d, run(cmd, log=d / "train.log")))
    if procs:
        print(f"[3/5] {len(procs)} specialists running (logs: {out}/spec*/train.log)", flush=True)
    failed = []
    for f, d, p in procs:
        if p.wait() == 0:
            (d / "done").write_text("ok")
        else:
            failed.append(f)
    if failed:
        sys.exit(f"specialists failed: {failed} (see their train.log; re-run to resume)")

    # 4. distillation
    final = out / "final"
    if not (final / "done").exists():
        print("[4/5] distilling the specialists into one controller", flush=True)
        cmd = [py, "-m", "motion.trainers", "distill", "--lib", lib, "--teachers", str(out / "spec*"), "--out", final,
               "--device", dev(0), "--workers", max(1, a.cpus), "--envs", 4 if a.smoke else a.envs,
               "--hours", 0.35 * a.hours]
        if a.smoke:
            cmd += ["--iters", "2", "--steps", "8", "--epochs", "1"]
        if run(cmd, log=out / "distill.log").wait() != 0:
            sys.exit(f"distillation failed (see {out}/distill.log; re-run to resume)")
        (final / "done").write_text("ok")

    # 5. evaluation
    print("[5/5] evaluating on held-out clips", flush=True)
    cmd = [py, "-m", "motion.trainers", "evaluate", "--lib", lib, "--policy", final / "ckpt.pt", "--device", dev(0),
           "--workers", max(1, min(a.cpus, 16)), "--envs", 4 if a.smoke else 32, "--steps", 60 if a.smoke else 600,
           "--out", out / "eval.json"]
    if run(cmd).wait() != 0:
        sys.exit("evaluation failed")
    print(f"finished in {(time.time() - t0) / 3600:.2f} h: controller {final}/policy.pt, results {out}/eval.json",
          flush=True)


if __name__ == "__main__":
    main()
