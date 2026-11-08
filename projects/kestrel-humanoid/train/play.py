"""Evaluate and render a trained policy (console, offscreen, no GPU).

    python play.py --run rough                      # success table per terrain type and difficulty
    python play.py --run rough --gif demo.gif       # also render flat walking, stairs up and stairs down
    python play.py --run rough --gif demo.gif --eval-envs 0   # render only

Evaluation: for every terrain type and difficulty row, E robots start at tile centres with no sensor noise
and no randomisation, and are commanded to walk forward at --speed m/s for 10 s. A run counts as a
success if the robot gets >= 2.4 m from its start (past most of the tile: five or more steps on a stair
tile) without falling.
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

import numpy as np
import torch
import mujoco

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env as E          # noqa: E402
import model as KM       # noqa: E402
import terrain as T      # noqa: E402

torch.set_num_threads(1)


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
    e = E.Envs(M=n_env, seed=123, randomize=False, curriculum=False)
    table = np.zeros((T.COLS, len(rows), 3))      # success, fall, distance
    steps = int(seconds / E.DT)
    for c in range(T.COLS):
        for ri, r in enumerate(rows):
            yaws = np.linspace(-np.pi, np.pi, n_env, endpoint=False)
            for i in range(n_env):
                setup(e, i, r, c, yaw=yaws[i], cmd=(speed, 0.0, 0.0))
            obs, _ = e.observe()
            alive = np.ones(n_env, bool)
            far = np.zeros(n_env)
            for _ in range(steps):
                hold(e)
                obs, _, _, done, trunc = e.step(policy(obs))
                for i in range(n_env):
                    if alive[i]:
                        far[i] = max(far[i], np.linalg.norm(e.d[i].qpos[:2] - np.array(T.tile_center(r, c))))
                alive &= ~(done & ~trunc)
                # an env that terminated was reset by Envs: keep it marked dead and ignore it from now on
            ok = alive & (far >= 2.4)
            # a robot that fell but had already crossed the tile still fails: the run must end standing
            table[c, ri] = [ok.mean(), (~alive).mean(), far.mean()]
            print(f"  {T.NAMES[c]:12s} row {r} (step {T.params(r)['step'] * 100:4.1f} cm, slope "
                  f"{np.degrees(np.arctan(T.params(r)['slope'])):4.1f} deg): success {ok.mean():4.0%}  "
                  f"fall {(~alive).mean():4.0%}  mean reach {far.mean():4.2f} m", flush=True)
    return table


def write_table(table, path, speed, n_env, rows=range(T.ROWS)):
    lines = [f"Commanded {speed} m/s forward for 10 s from the tile centre, {n_env} headings per cell, no noise or "
             "randomisation. Cell = success rate (reached >= 2.4 m from start and still standing).", "",
             "| Terrain | " + " | ".join(f"row {r}" for r in rows) + " |",
             "|---|" + "---|" * len(rows)]
    for c in range(T.COLS):
        lines.append(f"| {T.NAMES[c]} | " + " | ".join(f"{table[c, i, 0]:.0%}" for i in range(len(rows))) + " |")
    lines += ["", "Difficulty per row: " + ", ".join(
        f"row {r}: step {T.params(r)['step'] * 100:.1f} cm / slope {np.degrees(np.arctan(T.params(r)['slope'])):.1f} deg / "
        f"rough ±{T.params(r)['rough'] * 50:.0f} mm" for r in rows)]
    Path(path).write_text("\n".join(lines) + "\n")


def render(policy, path, segments, fps=25, size=(640, 400), speed=0.6):
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
            frames.append(img.quantize(colors=128, method=Image.Quantize.MEDIANCUT))
        print(f"  rendered {label}: {len(frames)} frames so far")
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, optimize=True)
    print(f"wrote {path} ({len(frames)} frames)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", default="rough")
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
