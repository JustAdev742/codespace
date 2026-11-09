"""Evaluate and render a trained policy (console, offscreen, no GPU).

    python play.py --run rough                      # success table per terrain type and difficulty
    python play.py --run rough --gif demo.gif       # also render flat walking, stairs up and stairs down
    python play.py --run rough --gif demo.gif --eval-envs 0   # render only

Evaluation: for every terrain type and difficulty row, E robots start at tile centres (E evenly spaced
headings) with no sensor noise and no randomisation, commanded forward at --speed m/s. A run is a
success if the robot gets 2.4 m from the centre (six steps up or down on a stair tile) before falling,
within 10 s. Run it between training chunks: it competes with the trainer for the cores.
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


def evaluate(policy, n_env=16, speed=0.6, seconds=10.0, rows=range(T.ROWS)):
    """Success = the robot gets REACH m from the tile centre before falling (then its run ends, so walking on
    into a neighbouring tile, e.g. a 1.26 m stair-bowl wall, does not count); fall = fell first; the rest
    stopped short of REACH within `seconds`."""
    e = E.Envs(M=n_env, seed=123, randomize=False, curriculum=False)
    table = np.zeros((T.COLS, len(rows), 3))      # success, fall, mean reach
    steps = int(seconds / E.DT)
    for c in range(T.COLS):
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


def write_table(table, path, speed, n_env, rows=range(T.ROWS)):
    lines = [f"Commanded {speed} m/s forward from the tile centre, {n_env} evenly spaced headings per cell, no noise "
             f"or randomisation, 10 s limit. Cell = success rate: reached {REACH} m from the centre before falling "
             f"(on stairs: {int((REACH - T.PLATFORM) / T.TREAD)} or more steps climbed or descended). In brackets: "
             "falls.", "",
             "| Terrain | " + " | ".join(f"row {r}" for r in rows) + " |",
             "|---|" + "---|" * len(rows)]
    for c in range(T.COLS):
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
    ap.add_argument("--variant", default=None, choices=["k1", "s1"], help="robot model (default: from the run's checkpoint)")
    ap.add_argument("--eval-envs", type=int, default=16)
    ap.add_argument("--speed", type=float, default=0.6)
    ap.add_argument("--table", default=None, help="write the success table as markdown here")
    ap.add_argument("--gif", default=None)
    ap.add_argument("--stairs-row", type=int, default=None, help="difficulty row for the stair clips (default: hardest "
                                                                 "row with >= 50%% success in this evaluation, else 2)")
    args = ap.parse_args()
    policy = load_policy(args.run)
    table = None
    if args.eval_envs > 0:
        print(f"evaluating runs/{args.run}/policy.pt")
        table = evaluate(policy, args.eval_envs, args.speed)
        if args.table:
            write_table(table, args.table, args.speed, args.eval_envs)
    if args.gif:
        row = args.stairs_row
        if row is None:
            row = 2
            if table is not None:
                okr = [r for r in range(T.ROWS) if min(table[4, r, 0], table[5, r, 0]) >= 0.5]
                row = max(okr) if okr else 2
        segments = [("flat walking", 0, 0, 0.0, 6.0), (f"stairs up, row {row}", row, 5, 0.0, 8.0),
                    (f"stairs down, row {row}", row, 4, 0.0, 8.0)]
        render(policy, args.gif, segments, speed=args.speed)


if __name__ == "__main__":
    main()
