"""Evaluate and render a trained policy (console, offscreen, no GPU).

    python play.py --run rough                      # success table per terrain type and difficulty
    python play.py --run rough --gif demo.gif       # also render flat walking, stairs up and stairs down
    python play.py --run rough --gif demo.gif --eval-envs 0   # render only

Evaluation: for every terrain type and difficulty row, E robots start at tile centres (E evenly spaced
headings) with no sensor noise and no randomisation, commanded forward at --speed m/s. A run is a
success if the robot gets 2.4 m from the centre (six steps up or down on a stair tile) before falling,
within 10 s (longer for slow commands: 1.6 x the time the commanded speed needs, see --seconds). Run it between training chunks: it competes with the trainer for the cores.
Rendering uses MuJoCo's offscreen renderer through OSMesa (software OpenGL), so it works on a headless CPU
machine: MUJOCO_GL=osmesa is set automatically when no display is present.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

if "MUJOCO_GL" not in os.environ and not os.environ.get("DISPLAY"):
    os.environ["MUJOCO_GL"] = "osmesa"
os.environ.setdefault("OMP_NUM_THREADS", "1")
if "--variant" in sys.argv:          # the robot model is chosen at import time (model.py / calc)
    os.environ["KESTREL_VARIANT"] = sys.argv[sys.argv.index("--variant") + 1]

import numpy as np
import torch
import mujoco

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env as E          # noqa: E402
import model as KM       # noqa: E402
import terrain as T      # noqa: E402

torch.set_num_threads(1)
REACH = 2.4                      # m from the tile centre


def load_policy(run):
    p = HERE / "runs" / run / "policy.pt"
    pol = torch.jit.load(str(p))
    pol.eval()
    return lambda o: pol(torch.from_numpy(o)).detach().numpy()


def setup(e, i, row, col, yaw=0.0, cmd=(0.6, 0.0, 0.0)):
    """Put env i at the centre of tile (row, col), heading `yaw`, with a fixed command."""
    e.row[i] = row
    e.cols = [col]
    e._reset(i)
    d = e.d[i]
    cx, cy = T.tile_center(row, col)
    d.qpos[0:2] = [cx, cy]
    d.qpos[2] = e.hs(np.array([cx]), np.array([cy]))[0] + 0.90
    d.qpos[3:7] = [np.cos(yaw / 2), 0, 0, np.sin(yaw / 2)]
    d.qpos[e.qadr] = e.default
    d.qvel[:] = 0
    d.ctrl[:] = e.default
    mujoco.mj_forward(e.m, d)
    e.start_xy[i] = [cx, cy]
    e.cmd[i] = cmd
    e.delay[i] = False


def hold(e):
    """No command resampling, no pushes during evaluation and rendering."""
    e.cmd_t[:] = 0
    e.push_t[:] = 10 ** 6


def evaluate(policy, n_env=16, speed=0.6, seconds=10.0, rows=range(T.ROWS), cols=range(T.COLS)):
    """Success = the robot gets REACH m from the tile centre before falling (then its run ends, so walking on
    into a neighbouring tile, e.g. a 1.26 m stair-bowl wall, does not count); fall = fell first; the rest
    stopped short of REACH within `seconds`."""
    e = E.Envs(M=n_env, seed=123, randomize=False, curriculum=False)
    table = np.full((T.COLS, len(rows), 3), np.nan)      # success, fall, mean reach (NaN: not evaluated)
    steps = int(seconds / E.DT)
    for c in cols:
        for ri, r in enumerate(rows):
            yaws = np.linspace(-np.pi, np.pi, n_env, endpoint=False)
            for i in range(n_env):
                setup(e, i, r, c, yaw=yaws[i], cmd=(speed, 0.0, 0.0))
            obs, _ = e.observe()
            running = np.ones(n_env, bool)
            ok = np.zeros(n_env, bool)
            fell = np.zeros(n_env, bool)
            far = np.zeros(n_env)
            centre = np.array(T.tile_center(r, c))
            for _ in range(steps):
                hold(e)
                obs, _, _, done, trunc = e.step(policy(obs))
                dist = np.linalg.norm(np.array([d.qpos[:2] for d in e.d]) - centre, axis=1)
                fell |= running & done & ~trunc          # Envs resets a fallen robot: stop tracking it
                running &= ~fell
                far = np.where(running, np.maximum(far, dist), far)
                ok |= running & (far >= REACH)
                running &= ~ok
                if not running.any():
                    break
            table[c, ri] = [ok.mean(), fell.mean(), far.mean()]
            print(f"  {T.NAMES[c]:12s} row {r} (step {T.params(r)['step'] * 100:4.1f} cm, slope "
                  f"{np.degrees(np.arctan(T.params(r)['slope'])):4.1f} deg): success {ok.mean():4.0%}  "
                  f"fall {fell.mean():4.0%}  stopped {(~ok & ~fell).mean():4.0%}  mean reach {far.mean():4.2f} m",
                  flush=True)
    return table


def speed_test(policy, speeds, n_env=8, secs=10.0, t0=4.0):
    """Top speed on flat ground: robots start at the first flat tile heading along the flat column (36 m of flat),
    yaw spread +-0.3 rad, commanded forward at each speed. Speed = distance along the heading from t0 to secs,
    divided by the time; robots that fall are left out of the mean and counted. Also from t0 on: the highest leg-joint
    speed as a fraction of its no-load speed (above 1 the motor is driven faster than its back-EMF matches the bus:
    the drive loses torque control) and, for the scrap and fast builds, the highest RMS torque as a fraction of the
    motor's continuous rating."""
    e = E.Envs(M=n_env, seed=123, randomize=False, curriculum=False)
    w_lim = e.w_lim if e.ts is None else e.ts[2]
    yaws = np.pi / 2 + np.linspace(-0.3, 0.3, n_env)
    out = []
    for v in speeds:
        for i in range(n_env):
            setup(e, i, 0, 0, yaw=yaws[i], cmd=(v, 0.0, 0.0))
        obs, _ = e.observe()
        fell = np.zeros(n_env, bool)
        p0 = None
        wpk, sq, n = 0.0, np.zeros(len(w_lim)), 0
        for k in range(int(secs / E.DT)):
            hold(e)
            obs, _, _, done, trunc = e.step(policy(obs))
            fell |= done & ~trunc
            if p0 is None and (k + 1) * E.DT >= t0:
                p0 = np.array([d.qpos[:2] for d in e.d])
            if p0 is not None and (~fell).any():
                ok = ~fell
                qd = np.array([d.qvel[e.vadr] for d in e.d])[ok]
                tau = np.array([d.actuator_force[:E.ACT_DIM] for d in e.d])[ok]
                wpk = max(wpk, float((np.abs(qd) / w_lim).max()))
                sq += (tau ** 2).sum(0)
                n += int(ok.sum())
        p1 = np.array([d.qpos[:2] for d in e.d])
        hd = np.stack([np.cos(yaws), np.sin(yaws)], 1)
        sp = np.sum((p1 - p0) * hd, 1) / (secs - t0)
        mean = float(sp[~fell].mean()) if (~fell).any() else float("nan")
        rms = float((np.sqrt(sq / max(n, 1)) / e.ts[3]).max()) if e.ts is not None else float("nan")
        out.append((v, mean, float(sp[~fell].min()) if (~fell).any() else float("nan"), fell.mean(), wpk, rms))
        print(f"  command {v:.2f} m/s: achieved {mean:.2f} m/s (slowest {out[-1][2]:.2f}), falls {fell.mean():.0%}, "
              f"peak joint speed {wpk:.0%} of no-load, RMS torque {rms:.0%} of continuous", flush=True)
    return out


def write_speed_table(res, path, n_env, secs=10.0, t0=4.0):
    lines = [f"Flat ground, {n_env} robots per speed (heading spread +-0.3 rad), no noise or randomisation. Achieved = "
             f"distance along the heading from {t0:g} s to {secs:g} s / time, mean over the robots that did not fall. "
             "Joint speed: the fastest leg joint, as a fraction of its motor's no-load speed (over 100 %: driven faster "
             "than the motor's back-EMF matches the bus, so the drive loses torque control). RMS torque: the highest leg "
             "joint, as a fraction of its motor's continuous rating. **Within limits** needs both under 100 %.", "",
             "| Commanded (m/s) | Achieved (m/s) | Slowest robot (m/s) | Falls | Peak joint speed | RMS torque | Within limits |",
             "|---|---|---|---|---|---|---|"]
    lines += [f"| {v:.2f} | {m:.2f} | {lo:.2f} | {f:.0%} | {w:.0%} | " + ("–" if np.isnan(r) else f"{r:.0%}") + " | "
              + ("yes" if f == 0 and w < 1.0 and (np.isnan(r) or r < 1.0) else "**no**") + " |"
              for v, m, lo, f, w, r in res]
    Path(path).write_text("\n".join(lines) + "\n")


def write_table(table, path, speed, n_env, rows=range(T.ROWS), seconds=10.0):
    lines = [f"Commanded {speed} m/s forward from the tile centre, {n_env} evenly spaced headings per cell, no noise "
             f"or randomisation, {seconds:g} s limit. Cell = success rate: reached {REACH} m from the centre before falling "
             f"(on stairs: {int((REACH - T.PLATFORM) / T.TREAD)} or more steps climbed or descended). In brackets: "
             "falls.", "",
             "| Terrain | " + " | ".join(f"row {r}" for r in rows) + " |",
             "|---|" + "---|" * len(rows)]
    for c in range(T.COLS):
        if np.isnan(table[c, 0, 0]):
            continue
        lines.append(f"| {T.NAMES[c]} | " + " | ".join(f"{table[c, i, 0]:.0%} ({table[c, i, 1]:.0%})"
                                                         for i in range(len(rows))) + " |")
    lines += ["", "| Row | " + " | ".join(str(r) for r in rows) + " |", "|---|" + "---|" * len(rows),
              "| Stair step (cm) | " + " | ".join(f"{T.params(r)['step'] * 100:.1f}" for r in rows) + " |",
              "| Slope (deg) | " + " | ".join(f"{np.degrees(np.arctan(T.params(r)['slope'])):.1f}" for r in rows) + " |",
              "| Rough amplitude a (cm) | " + " | ".join(f"{T.params(r)['rough'] * 100:.0f}" for r in rows) + " |"]
    Path(path).write_text("\n".join(lines) + "\n")


def render(policy, path, segments, fps=15, size=(560, 350), speed=0.6):
    from PIL import Image
    e = E.Envs(M=1, seed=7, randomize=False, curriculum=False)
    mv = KM.build_model(e.H, visual=True)
    dv = mujoco.MjData(mv)
    r = mujoco.Renderer(mv, height=size[1], width=size[0])
    cam = mujoco.MjvCamera()
    cam.type = mujoco.mjtCamera.mjCAMERA_FREE
    cam.distance, cam.elevation = 3.2, -14.0
    frames = []
    every = max(1, int(round(1 / (fps * E.DT))))
    for label, row, col, yaw, secs in segments:
        setup(e, 0, row, col, yaw=yaw, cmd=(speed, 0.0, 0.0))
        obs, _ = e.observe()
        look = e.d[0].qpos[:3].copy()
        for k in range(int(secs / E.DT)):
            hold(e)
            obs, _, _, done, _ = e.step(policy(obs))
            if done[0]:
                break
            if k % every:
                continue
            dv.qpos[:] = e.d[0].qpos
            mujoco.mj_forward(mv, dv)
            look = 0.85 * look + 0.15 * e.d[0].qpos[:3]
            cam.lookat[:] = look + [0, 0, -0.15]
            cam.azimuth = np.degrees(yaw) + 120.0
            r.update_scene(dv, camera=cam)
            img = Image.fromarray(r.render())
            frames.append(img.quantize(colors=64, method=Image.Quantize.MEDIANCUT))
        print(f"  rendered {label}: {len(frames)} frames so far")
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, optimize=True)
    print(f"wrote {path} ({len(frames)} frames)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", default="rough")
    ap.add_argument("--variant", default=None, choices=["k1", "s1", "s1scrap", "k1scrap", "s1fast", "k1fast"], help="robot model (default: from the run's checkpoint)")
    ap.add_argument("--eval-envs", type=int, default=16)
    ap.add_argument("--speed", type=float, default=0.6)
    ap.add_argument("--table", default=None, help="write the success table as markdown here")
    ap.add_argument("--gif", default=None)
    ap.add_argument("--terrains", default=None, help="comma-separated subset, e.g. stairs_up,stairs_down "
                                                     f"(default: all of {','.join(T.NAMES)})")
    ap.add_argument("--speed-test", default=None, help="comma-separated commanded speeds for the flat-ground top-speed "
                                                       "test, e.g. 0.6,0.8,1.0,1.2,1.4; table goes to --table")
    ap.add_argument("--seconds", type=float, default=None, help="time limit per run (default: 10 s, or 1.6 x "
                                                                 "REACH / speed if that is longer)")
    ap.add_argument("--stairs-row", type=int, default=None, help="difficulty row for the stair clips (default: hardest "
                                                                 "row with >= 50%% success in this evaluation, else 2)")
    args = ap.parse_args()
    policy = load_policy(args.run)
    table = None
    if args.speed_test:
        print(f"top-speed test, runs/{args.run}/policy.pt")
        res = speed_test(policy, [float(v) for v in args.speed_test.split(",")])
        if args.table:
            write_speed_table(res, args.table, 8)
        if args.gif:        # clip of the fastest commanded speed that stays within the motor limits, along the flat column
            ok = [v for v, m, lo, f, w, r in res if f == 0 and w < 1.0 and (np.isnan(r) or r < 1.0)]
            v = max(ok) if ok else min(r[0] for r in res)
            render(policy, args.gif, [(f"flat, commanded {v:.1f} m/s", 0, 0, np.pi / 2, 10.0)], speed=v)
        return
    if args.eval_envs > 0:
        print(f"evaluating runs/{args.run}/policy.pt")
        secs = args.seconds or round(max(10.0, 1.6 * REACH / args.speed), 1)
        cols = [T.NAMES.index(t) for t in args.terrains.split(",")] if args.terrains else range(T.COLS)
        table = evaluate(policy, args.eval_envs, args.speed, seconds=secs, cols=cols)
        if args.table:
            write_table(table, args.table, args.speed, args.eval_envs, seconds=secs)
    if args.gif:
        row = args.stairs_row
        if row is None:
            row = 2
            if table is not None:
                st = table[4:6, :, 0]                        # stairs down, stairs up
                okr = [r for r in range(T.ROWS) if not np.isnan(st[:, r]).all() and np.nanmin(st[:, r]) >= 0.5]
                row = max(okr) if okr else 2
        k = min(2.0, max(1.0, 0.6 / args.speed))     # slow builds: longer clips, so they get somewhere
        segments = [("flat walking", 0, 0, 0.0, 6.0 * k), (f"stairs up, row {row}", row, 5, 0.0, 8.0 * k),
                    (f"stairs down, row {row}", row, 4, 0.0, 8.0 * k)]
        render(policy, args.gif, segments, speed=args.speed)


if __name__ == "__main__":
    main()
