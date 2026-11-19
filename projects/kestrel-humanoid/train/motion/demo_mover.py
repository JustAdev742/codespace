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

# (start time s, caption, Mover.set_intent arguments)
SCRIPT = [
    (0.0, "standing", dict(action="stand")),
    (1.5, "walk forward", dict(action="walk", vx=0.3)),
    (6.0, "walk and turn left", dict(action="walk", vx=0.25, wz=0.4)),
    (9.0, "stop", dict(action="stand")),
    (10.5, "wave (right hand)", dict(action="wave-right-hand")),
    (14.5, "bow", dict(action="bow")),
    (18.0, "point forward", dict(action="stand", reach={"right": (0.45, -0.15, 1.05)}, look=0.2)),
    (21.0, "crouch, reach low", dict(action="stand", crouch=0.2, reach={"right": (0.35, -0.15, 0.45)})),
    (25.0, "walk tired", dict(action="walk", vx=0.25, style="tired")),
    (29.5, "walk and wave", dict(action="walk", vx=0.25, arms="wave-right-hand")),
    (34.0, "stop, guide the way", dict(action="guide")),
    (38.0, "stand", dict(action="stand")),
]


def _intent(item):
    """Script items: (t, caption, kwargs) or the older (t, caption, action, vx, vy, turn, style)."""
    if len(item) == 3 and isinstance(item[2], dict):
        return item[2]
    return dict(action=item[2], vx=item[3], vy=item[4], wz=item[5], style=item[6])


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
            mv.set_intent(**_intent(item))
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


def scene_model():
    """The visual G1 with a showroom: checker floor, sky gradient, soft light."""
    import xml.etree.ElementTree as ET

    import mujoco

    from . import g1 as G
    root = ET.fromstring(G.build_xml(visual=True))
    asset = root.find("asset")
    ET.SubElement(asset, "texture", name="sky", type="skybox", builtin="gradient", rgb1="0.55 0.68 0.85",
                  rgb2="0.12 0.14 0.2", width="256", height="256")
    ET.SubElement(asset, "texture", name="grid", type="2d", builtin="checker", rgb1="0.36 0.38 0.42",
                  rgb2="0.28 0.3 0.33", width="512", height="512", mark="edge", markrgb="0.5 0.52 0.56")
    ET.SubElement(asset, "material", name="floor", texture="grid", texrepeat="8 8")
    for g in root.iter("geom"):
        if g.get("name") == "floor":
            g.set("material", "floor")
            g.attrib.pop("rgba", None)
    vis = root.find("visual") or ET.SubElement(root, "visual")
    ET.SubElement(vis, "headlight", ambient="0.35 0.35 0.38", diffuse="0.5 0.5 0.5", specular="0.1 0.1 0.1")
    ET.SubElement(vis, "quality", shadowsize="4096")
    ET.SubElement(vis, "global", offwidth="1920", offheight="1080")
    return mujoco.MjModel.from_xml_string(ET.tostring(root, encoding="unicode"))


def render(frames, captions, out, size=(480, 360), fps=25):
    """Render recorded qpos frames with the visual G1 model; GIF or MP4 (needs ffmpeg) by extension."""
    import subprocess

    import mujoco
    from PIL import Image, ImageDraw, ImageFont

    m = scene_model()
    d = mujoco.MjData(m)
    r = mujoco.Renderer(m, size[1], size[0])
    cam = mujoco.MjvCamera()
    cam.type = mujoco.mjtCamera.mjCAMERA_FREE
    cam.distance, cam.elevation = 2.4, -10
    try:
        font = ImageFont.load_default(size=max(14, size[1] // 22))
    except TypeError:                                   # Pillow < 10.1
        font = ImageFont.load_default()
    look = frames[0][:2].copy()
    head = yaw_of(frames[0][3:7])
    imgs = []
    for qpos, cap in zip(frames, captions):
        d.qpos[:] = qpos
        mujoco.mj_forward(m, d)
        look += (qpos[:2] - look) * 0.08                      # the camera follows smoothly
        h = yaw_of(qpos[3:7])
        head += math.atan2(math.sin(h - head), math.cos(h - head)) * 0.03
        cam.lookat[:] = [look[0], look[1], 0.62]
        cam.azimuth = math.degrees(head) + 180 - 40           # in front of the robot, to its left: a 3/4 view
        r.update_scene(d, cam)
        im = Image.fromarray(r.render())
        dr = ImageDraw.Draw(im)
        bar = max(26, size[1] // 13)
        dr.rectangle([0, 0, size[0], bar], fill=(18, 20, 26))
        dr.text((12, bar // 2), cap, fill=(245, 245, 245), font=font, anchor="lm")
        imgs.append(im)
    if out.endswith(".gif"):
        small = [i.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for i in imgs[::2]]
        small[0].save(out, save_all=True, append_images=small[1:], duration=int(2000 / fps), loop=0, optimize=True)
    else:
        p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                              "-s", f"{size[0]}x{size[1]}", "-r", str(fps), "-i", "-", "-pix_fmt", "yuv420p",
                              "-vcodec", "libx264", "-crf", "23", out], stdin=subprocess.PIPE)
        for i in imgs:
            p.stdin.write(np.asarray(i.convert("RGB")).tobytes())
        p.stdin.close()
        p.wait()
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
