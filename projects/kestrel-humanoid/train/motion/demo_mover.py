"""Run the training-free mover through a sequence of intents and (optionally) render it.

    python -m motion.demo_mover --library path/to/library.npz [--gif out.gif] [--mp4 out.mp4]

Prints, per intent, which human clip it is playing and how the body is doing (balance, tracking); at the end the
falls, QP fallbacks and the speed against real time.
"""
from __future__ import annotations

import argparse
import math
import time

import numpy as np

from .matching import yaw_of
from .mover import DT, Mover

# (start time s, caption, action, vx, vy, turn, style)
SCRIPT = [
    (0.0, "standing", "stand", 0, 0, 0, None),
    (1.5, "walk forward", "walk", 0.3, 0, 0, None),
    (6.0, "walk and turn left", "walk", 0.25, 0, 0.4, None),
    (9.0, "stop", "stand", 0, 0, 0, None),
    (10.5, "wave (right hand)", "wave-right-hand", 0, 0, 0, None),
    (14.5, "stand", "stand", 0, 0, 0, None),
    (15.5, "bow", "bow", 0, 0, 0, None),
    (19.0, "stand", "stand", 0, 0, 0, None),
    (20.0, "walk, tired style", "walk", 0.25, 0, 0, "tired"),
    (24.5, "stop", "stand", 0, 0, 0, None),
    (26.5, "guide (point the way)", "guide", 0, 0, 0, None),
    (30.0, "stand", "stand", 0, 0, 0, None),
]


def run(library, script=SCRIPT, t_end=None, fps=25, verbose=True):
    mv = Mover(library)
    t_end = t_end or script[-1][0] + 1.5
    frames, captions, cur = [], [], None
    every = int(round(1.0 / fps / DT))
    t0 = time.time()
    fails = 0
    err_up = []
    fell = False
    for k in range(int(t_end / DT)):
        t = k * DT
        item = [s for s in script if t >= s[0]][-1]
        if item is not cur:
            cur = item
            mv.set_intent(item[2], item[3], item[4], item[5], item[6])
            if verbose:
                print(f"t={t:5.1f}  intent: {item[1]:<24s}", flush=True)
        ok = mv.step()
        fails += not mv.wbc.last_ok
        if k % every == 0:
            frames.append(mv.d.qpos.copy())
            captions.append(cur[1])
            up = ~mv.leg
            err_up.append(np.abs(mv.d.qpos[mv.qadr][up] - mv.human["q"][up]).mean() if mv.blend > 0.9 else np.nan)
        if verbose and k % int(1.0 / DT) == int(0.5 / DT):
            print(f"        t={t:5.1f} playing {mv.playing():<40s} pos ({mv.d.qpos[0]:+.2f},{mv.d.qpos[1]:+.2f}) "
                  f"heading {math.degrees(yaw_of(mv.d.qpos[3:7])):+5.0f} deg  pelvis {mv.d.qpos[2]:.3f} m  "
                  f"follow {mv.blend:.2f}", flush=True)
        if not ok:
            fell = True
            print(f"FELL at t={t:.2f}s during '{cur[1]}'")
            break
    wall = time.time() - t0
    e = np.array(err_up)
    stats = dict(fell=fell, t=t, qp_fallbacks=fails, realtime=t / wall,
                 upper_err_deg=float(np.degrees(np.nanmean(e))) if np.isfinite(e).any() else float("nan"))
    if verbose:
        print(f"fell={fell}  simulated {t:.1f} s in {wall:.1f} s ({stats['realtime']:.2f}x real time)  "
              f"QP fallbacks {fails}  upper-body tracking of the human motion {stats['upper_err_deg']:.1f} deg mean")
    return mv, np.array(frames), captions, stats


def render(frames, captions, out, size=(480, 360), fps=25):
    """Render recorded qpos frames with the visual G1 model; GIF or MP4 by extension."""
    import mujoco
    from PIL import Image, ImageDraw

    from . import g1 as G
    m = G.load_model(visual=True)
    d = mujoco.MjData(m)
    r = mujoco.Renderer(m, size[1], size[0])
    cam = mujoco.MjvCamera()
    cam.type = mujoco.mjtCamera.mjCAMERA_FREE
    cam.distance, cam.elevation = 2.6, -12
    look = frames[0][:2].copy()
    imgs = []
    for qpos, cap in zip(frames, captions):
        d.qpos[:] = qpos
        mujoco.mj_forward(m, d)
        look += (qpos[:2] - look) * 0.08                      # the camera follows smoothly
        cam.lookat[:] = [look[0], look[1], 0.65]
        cam.azimuth = 135
        r.update_scene(d, cam)
        im = Image.fromarray(r.render())
        dr = ImageDraw.Draw(im)
        dr.rectangle([0, 0, size[0], 26], fill=(20, 20, 24))
        dr.text((10, 7), f"intent: {cap}", fill=(240, 240, 240))
        imgs.append(im)
    if out.endswith(".gif"):
        small = [i.convert("P", palette=Image.ADAPTIVE, colors=128) for i in imgs[::2]]
        small[0].save(out, save_all=True, append_images=small[1:], duration=int(2000 / fps), loop=0, optimize=True)
    else:
        import imageio.v2 as iio
        iio.mimwrite(out, [np.asarray(i) for i in imgs], fps=fps, quality=7)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--library", required=True)
    ap.add_argument("--gif")
    ap.add_argument("--mp4")
    ap.add_argument("--seconds", type=float)
    a = ap.parse_args()
    _, frames, caps, _ = run(a.library, t_end=a.seconds)
    for out in (a.gif, a.mp4):
        if out:
            print("wrote", render(frames, caps, out))


if __name__ == "__main__":
    main()
