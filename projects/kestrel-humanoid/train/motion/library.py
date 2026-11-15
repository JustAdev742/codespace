"""Build the training library from every dataset folder at once.

    python -m motion.library --data AMASS/ bandai/ nymeria/ --smplh smplh/ --out runs/motion/library.npz --procs 64

For each motion file: read it (formats.py), keep striking motions out (safety.py), resample to 50 Hz, retarget to
the G1 (retarget.py), make it feasible (feasible.py). Then cut every clip into windows, weight them by novelty and
group them into families (cluster.py). Exclusions and failures are written to <out>.log.json, never silently
dropped. Runs in parallel across CPU processes; with --device cuda each process retargets on the GPU.
"""
from __future__ import annotations

import argparse
import json
import os
import time
import traceback
from multiprocessing import get_context
from pathlib import Path

import numpy as np

FPS = 50
WIN = 50                         # 1 s windows for clustering
EP_WIN = 150                     # 3 s training windows (episodes start anywhere)


def _work(args):
    path, smplh, device, iters, max_frames = args
    import torch
    torch.set_num_threads(1)
    from . import formats as F, retarget as RT, feasible as FE, safety as SF
    global _FK
    try:
        _FK
    except NameError:
        _FK = RT.G1FK(device=device)
    try:
        m = F.load(path, smplh_dir=smplh, max_frames=max_frames)
        if m is None:
            return dict(path=str(path), status="skipped", reason="not a motion file")
        if len(m.pos) < 10 or not np.isfinite(m.pos).all():
            return dict(path=str(path), status="skipped", reason=f"too short or invalid ({len(m.pos)} frames)")
        why = SF.check(path, m.pos, m.fps)
        if why:
            return dict(path=str(path), status="excluded", reason=f"combat: {why}")
        m = RT.resample(m, FPS)
        r = RT.retarget(m, _FK, iters=iters)
        c = FE.make_feasible(r, _FK, FPS)
        c.update(name=m.name, path=str(path), err=float(r["err"].mean()), scale=r["scale"], source=m.meta.get("source"))
        return dict(path=str(path), status="ok", clip=c)
    except Exception as e:                             # noqa: BLE001 - every failure is logged, not hidden
        return dict(path=str(path), status="failed", reason=f"{type(e).__name__}: {e}",
                    trace=traceback.format_exc(limit=3))


def build(data, out, smplh=None, procs=1, device="cpu", iters=200, families=8, max_frames=None, quiet=False):
    from . import formats as F, cluster as CL
    files = F.find_files(data)
    if not quiet:
        print(f"{len(files)} files under {', '.join(map(str, data))}", flush=True)
    t0 = time.time()
    jobs = [(f, smplh, device, iters, max_frames) for f in files]
    results = []
    if procs > 1:
        with get_context("spawn" if device != "cpu" else "fork").Pool(procs) as pool:
            for i, r in enumerate(pool.imap_unordered(_work, jobs, chunksize=1)):
                results.append(r)
                if not quiet and (i + 1) % max(1, len(jobs) // 20) == 0:
                    print(f"  {i + 1}/{len(jobs)} files ({time.time() - t0:.0f} s)", flush=True)
    else:
        for j in jobs:
            results.append(_work(j))
    clips = sorted([r["clip"] for r in results if r["status"] == "ok"], key=lambda c: c["path"])
    log = [{k: v for k, v in r.items() if k != "clip"} for r in results if r["status"] != "ok"]
    if not clips:
        raise RuntimeError(f"no usable clips (see {out}.log.json)")
    # concatenate, then windows: clustering (1 s) and episode starts (every 0.5 s, 3 s long)
    starts, lens = [], []
    n = 0
    for c in clips:
        starts.append(n)
        lens.append(len(c["q"]))
        n += len(c["q"])
    cat = lambda k: np.concatenate([c[k] for c in clips])
    feats, win_clip, win_start = [], [], []
    for ci, c in enumerate(clips):
        for s, f in CL.window_features(c["q"], c["root_pos"], c["root_quat"], FPS, WIN):
            feats.append(f)
            win_clip.append(ci)
            win_start.append(s)
    weight, family, group = CL.assign(np.array(feats), families=families)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out, fps=FPS, q=cat("q"), qd=cat("qd"), root_pos=cat("root_pos"), root_quat=cat("root_quat"),
        root_vel=cat("root_vel"), clip_start=np.array(starts), clip_len=np.array(lens),
        clip_name=np.array([c["name"] for c in clips]), clip_path=np.array([c["path"] for c in clips]),
        clip_difficulty=np.array([c["difficulty"] for c in clips], np.float32),
        clip_err=np.array([c["err"] for c in clips], np.float32),
        win_clip=np.array(win_clip, np.int32), win_start=np.array(win_start, np.int32), win_weight=weight,
        win_family=family, win_group=group)
    summary = dict(files=len(files), clips=len(clips), frames=int(n), hours=round(n / FPS / 3600, 3),
                   windows=len(win_clip), families=int(family.max()) + 1,
                   excluded=sum(r["status"] == "excluded" for r in results),
                   failed=sum(r["status"] == "failed" for r in results),
                   skipped=sum(r["status"] == "skipped" for r in results),
                   mean_retarget_error_m=round(float(np.mean([c["err"] for c in clips])), 4),
                   seconds=round(time.time() - t0, 1))
    Path(str(out) + ".log.json").write_text(json.dumps(dict(summary=summary, not_used=log), indent=1))
    if not quiet:
        print(json.dumps(summary), flush=True)
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data", nargs="+", required=True, help="dataset folders or files (searched recursively)")
    ap.add_argument("--smplh", default=None, help="SMPL+H body model folder (for AMASS)")
    ap.add_argument("--out", default="runs/motion/library.npz")
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--device", default="cpu", help="cpu, or cuda to retarget on the GPU")
    ap.add_argument("--iters", type=int, default=200, help="retargeting optimisation steps per clip")
    ap.add_argument("--families", type=int, default=8, help="motion families = specialists (one per GPU)")
    ap.add_argument("--max-frames", type=int, default=None, help="cap frames per file (quick tests)")
    a = ap.parse_args()
    build(a.data, a.out, a.smplh, a.procs, a.device, a.iters, a.families, a.max_frames)


if __name__ == "__main__":
    main()
