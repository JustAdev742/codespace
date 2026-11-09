#!/usr/bin/env python3
"""Offscreen renders of the KESTREL S1 CAD with MuJoCo (OSMesa). Reads simple/cad/out/render/ (written by
build_s1.py) and writes PNGs to simple/renders/.

    MUJOCO_GL=osmesa python3 render_s1.py [view ...]

Flat colours per part type: actuators dark grey, aluminium silver, printed parts orange, belts black, steel
blue-grey, battery blue, electronics green, rubber brown.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("MUJOCO_GL", "osmesa")
import mujoco  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

HERE = Path(__file__).resolve().parent
RD = Path(os.environ.get("S1_RENDER_DIR", HERE / "out" / "render"))
OUTD = HERE.parent / "renders"

LEGEND = [("actuators", "act"), ("aluminium", "alu"), ("printed", "print"), ("belt", "belt"), ("steel", "steel"),
          ("battery", "batt"), ("electronics", "pcb")]


def build_xml(manifest, explode=0.0, hide=(), only_bodies=None, w=1200, h=1600):
    assets, geoms = [], []
    for i, g in enumerate(manifest):
        if g["cat"] in hide:
            continue
        if only_bodies is not None and not any(g["body"].startswith(b) or g["body"] == b for b in only_bodies):
            continue
        off = np.zeros(3)
        if explode:
            o = np.array(g["origin"])
            c = np.array([0, 0, 1000.0])
            d = o - c
            off = np.array([d[0] * 0.25, d[1] * 0.9, d[2] * 0.30 + 300.0]) * explode / 1000.0
        name = f"m{i}"
        assets.append(f'<mesh name="{name}" file="{RD / g["file"]}" scale="0.001 0.001 0.001" inertia="shell"/>')
        r, gg, b = g["rgb"]
        spec = 0.5 if g["cat"] in ("alu", "steel") else 0.15
        geoms.append(f'<geom type="mesh" mesh="{name}" pos="{off[0]:.4f} {off[1]:.4f} {off[2]:.4f}" '
                     f'rgba="{r} {gg} {b} 1" contype="0" conaffinity="0" material="mat_{g["cat"]}"/>')
    mats = []
    for cat in ("act", "alu", "print", "belt", "steel", "rubber", "batt", "pcb", "sensor", "estop"):
        spec = {"alu": 0.6, "steel": 0.5, "act": 0.3}.get(cat, 0.1)
        shin = {"alu": 0.6, "steel": 0.5, "act": 0.4}.get(cat, 0.2)
        mats.append(f'<material name="mat_{cat}" specular="{spec}" shininess="{shin}" reflectance="0"/>')
    return f"""<mujoco model="kestrel_s1">
  <compiler meshdir="/" />
  <visual>
    <global offwidth="{w}" offheight="{h}" />
    <quality shadowsize="4096" offsamples="8" />
    <headlight ambient="0.42 0.42 0.42" diffuse="0.55 0.55 0.55" specular="0.15 0.15 0.15" />
    <map znear="0.01" zfar="20" />
  </visual>
  <asset>
    <texture name="sky" type="skybox" builtin="gradient" rgb1="1 1 1" rgb2="0.93 0.94 0.96" width="256" height="256"/>
    <texture name="grid" type="2d" builtin="checker" rgb1="0.90 0.90 0.90" rgb2="0.84 0.84 0.85" width="512" height="512"/>
    <material name="floor" texture="grid" texrepeat="8 8" reflectance="0.0"/>
    {' '.join(mats)}
    {' '.join(assets)}
  </asset>
  <worldbody>
    <light pos="1.5 -1.0 3.0" dir="-0.45 0.3 -1" diffuse="0.45 0.45 0.45" specular="0.1 0.1 0.1" castshadow="true"/>
    <light pos="-1.5 1.5 2.5" dir="0.5 -0.5 -1" diffuse="0.25 0.25 0.25" specular="0 0 0" castshadow="false"/>
    <geom type="plane" size="3 3 0.01" material="floor" contype="0" conaffinity="0"/>
    {' '.join(geoms)}
  </worldbody>
</mujoco>"""




def render(name, cam, explode=0.0, hide=(), only_bodies=None, w=1200, h=1600, title=None):
    manifest = json.loads((RD / "manifest.json").read_text())
    xml = build_xml(manifest, explode, hide, only_bodies, w, h)
    model = mujoco.MjModel.from_xml_string(xml)
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    r = mujoco.Renderer(model, h, w)
    c = mujoco.MjvCamera()
    c.lookat[:] = cam["lookat"]
    c.distance = cam["distance"]
    c.azimuth = cam["azimuth"]
    c.elevation = cam["elevation"]
    opt = mujoco.MjvOption()
    r.update_scene(data, c, opt)
    img = r.render()
    r.close()
    im = Image.fromarray(img)
    draw = ImageDraw.Draw(im)
    cols = {g["cat"]: g["rgb"] for g in manifest}
    y = 14
    if title:
        draw.text((16, y), title, fill=(30, 30, 30))
        y += 22
    for label, cat in LEGEND:
        if cat in cols and cat not in hide:
            rgb = tuple(int(255 * v) for v in cols[cat])
            draw.rectangle([16, y, 34, y + 14], fill=rgb, outline=(60, 60, 60))
            draw.text((42, y + 1), label, fill=(30, 30, 30))
            y += 20
    OUTD.mkdir(parents=True, exist_ok=True)
    im.save(OUTD / f"{name}.png")
    print("rendered", name)


VIEWS = {   # MuJoCo azimuth = viewing direction: 180 looks from the front (+x), -90 from the left (+y), 0 from behind
    "s1_front": dict(cam=dict(lookat=[0, 0, 0.88], distance=2.75, azimuth=180, elevation=-4),
                     title="KESTREL S1 - front"),
    "s1_side": dict(cam=dict(lookat=[0, 0, 0.88], distance=2.75, azimuth=-90, elevation=-4),
                    title="KESTREL S1 - left side"),
    "s1_threequarter": dict(cam=dict(lookat=[0, 0, 0.88], distance=2.9, azimuth=-140, elevation=-14),
                            title="KESTREL S1 - three-quarter front left"),
    "s1_threequarter_rear": dict(cam=dict(lookat=[0, 0, 0.88], distance=2.9, azimuth=-40, elevation=-14),
                                 title="KESTREL S1 - three-quarter rear left"),
    "s1_leg_closeup": dict(cam=dict(lookat=[0.0, 0.10, 0.50], distance=1.6, azimuth=125, elevation=-6),
                           only=["l_hip", "l_thigh", "l_shank", "l_ankle", "l_foot"], w=1100, h=1600,
                           title="Left leg, inboard side: knee X12 + HTD-8M belt, calf plates, ankle push-rod"),
    "s1_leg_outer": dict(cam=dict(lookat=[0.0, 0.10, 0.50], distance=1.6, azimuth=-120, elevation=-6),
                         only=["l_hip", "l_thigh", "l_shank", "l_ankle", "l_foot"], w=1100, h=1600,
                         title="Left leg, outboard side: hip X12 on the outer cheek, ankle crank A"),
    "s1_hip_closeup": dict(cam=dict(lookat=[-0.06, 0.12, 0.96], distance=0.85, azimuth=-35, elevation=-14),
                           only=["l_hip", "l_thigh", "pelvis"], w=1300, h=1100,
                           title="Left hip from behind: RS04 hip-roll crank, push-rod, lever; yaw module"),
    "s1_exploded": dict(cam=dict(lookat=[0, 0, 1.12], distance=3.7, azimuth=-145, elevation=-12), explode=1.0,
                        w=1300, h=1600, title="KESTREL S1 - exploded by body"),
    "s1_arm_closeup": dict(cam=dict(lookat=[0.0, 0.2, 1.06], distance=1.4, azimuth=-125, elevation=-8),
                           only=["l_shoulder", "l_upper", "l_fore", "l_wrist", "l_hand", "torso"], w=1100, h=1500,
                           title="Left arm: RS04 shoulder, RS03 yaw/elbow, RS02 wrist, ISO flange + gripper"),
    "s1_frame_only": dict(cam=dict(lookat=[0, 0, 0.88], distance=2.9, azimuth=-140, elevation=-14),
                          hide=("act", "batt", "pcb", "sensor", "estop"), title="Structure only (actuators hidden)"),
}


if __name__ == "__main__":
    want = sys.argv[1:] or list(VIEWS)
    for v in want:
        p = VIEWS[v]
        render(v, p["cam"], p.get("explode", 0.0), p.get("hide", ()), p.get("only"), p.get("w", 1200),
               p.get("h", 1600), p.get("title"))
