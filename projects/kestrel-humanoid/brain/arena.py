"""The brain's test arena: the training terrain's 36 m flat strip, with coloured objects and a person-sized
mannequin, and a camera in the robot's head.

The objects are drawn only (no collision), and only in a separate rendering model: the physics runs in train/env.py's
Envs exactly as in training. The head camera's image is what the vision network sees.
"""
from __future__ import annotations

import math
import os
import re
import sys
from pathlib import Path

if "MUJOCO_GL" not in os.environ and sys.platform.startswith("linux") and not os.environ.get("DISPLAY"):
    os.environ["MUJOCO_GL"] = "osmesa"
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "train"))

import numpy as np          # noqa: E402
import mujoco               # noqa: E402

import env as E             # noqa: E402
import model as KM          # noqa: E402
import terrain as T         # noqa: E402

# name: (geom type, size, colour, height of the centre above the floor)
OBJECTS = {
    "red": ("box", (0.22, 0.22, 0.22), (0.85, 0.12, 0.10, 1), 0.22),
    "blue": ("sphere", (0.25,), (0.12, 0.30, 0.90, 1), 0.25),
    "green": ("cylinder", (0.10, 0.60), (0.10, 0.65, 0.20, 1), 0.60),
    "yellow": ("cylinder", (0.22, 0.25), (0.95, 0.78, 0.10, 1), 0.25),
    "person": ("capsule", (0.20, 0.62), (0.55, 0.50, 0.62, 1), 0.85),
}
NAMES = list(OBJECTS)
TARGETS = ["red", "blue", "green", "yellow"]          # what instructions may name; the person is never a target
CAM_W, CAM_H, CAM_FOVY = 96, 72, 80.0
FOV_X = 2 * math.atan(math.tan(math.radians(CAM_FOVY / 2)) * CAM_W / CAM_H)
X_MIN, X_MAX = -17.6, -12.4                          # the flat strip (terrain column 0) with a margin
Y_MIN, Y_MAX = -17.6, 17.6
START = (T.tile_center(0, 0)[0], -16.0)              # start near the strip's end, facing +y (down the strip)


def visual_xml(H):
    """The rendering model: the training model's visual XML plus the objects and a head camera that looks forward
    and 20 degrees down."""
    xml, hf = KM.build_xml(H, True)
    cam = (f'<camera name="ego" pos="0.10 0 0.02" xyaxes="0 -1 0 {math.sin(math.radians(20)):.3f} 0 '
           f'{math.cos(math.radians(20)):.3f}" fovy="{CAM_FOVY}"/>')
    xml = re.sub(r'(<body name="head"[^>]*>)', r"\1" + cam, xml, count=1)
    geoms = []
    for n, (typ, size, rgba, z) in OBJECTS.items():
        geoms.append(f'<geom name="obj_{n}" type="{typ}" size="{" ".join(map(str, size))}" pos="0 0 {z - 5}" '
                     f'rgba="{" ".join(map(str, rgba))}" contype="0" conaffinity="0" group="0"/>')
    xml = xml.replace("</worldbody>", "".join(geoms) + "</worldbody>", 1)
    return xml, hf


class Arena:
    """One robot (an Envs with M=1), a rendering model with objects, a head camera and a chase camera."""

    def __init__(self, seed=0, chase_size=(480, 300)):
        self.rng = np.random.default_rng(seed)
        self.e = E.Envs(M=1, seed=seed, randomize=False, curriculum=False)
        xml, hf = visual_xml(self.e.H)
        self.mv = mujoco.MjModel.from_xml_string(xml)
        for name, data in hf:
            k = mujoco.mj_name2id(self.mv, mujoco.mjtObj.mjOBJ_HFIELD, name)
            a = self.mv.hfield_adr[k]
            self.mv.hfield_data[a:a + data.size] = data.ravel()
        self.mv.light_castshadow[:] = 0
        self.dv = mujoco.MjData(self.mv)
        self.gid = {n: mujoco.mj_name2id(self.mv, mujoco.mjtObj.mjOBJ_GEOM, f"obj_{n}") for n in NAMES}
        self.cam_id = mujoco.mj_name2id(self.mv, mujoco.mjtObj.mjOBJ_CAMERA, "ego")
        self.r_ego = mujoco.Renderer(self.mv, height=CAM_H, width=CAM_W)
        self.r_chase = mujoco.Renderer(self.mv, height=chase_size[1], width=chase_size[0])
        self.chase = mujoco.MjvCamera()
        self.chase.type = mujoco.mjtCamera.mjCAMERA_FREE
        self.chase.distance, self.chase.elevation = 4.5, -18.0
        self.look = None
        self.pos = {}

    # ---------------------------------------------------------------- scene
    def place(self, near=(1.5, 11.0), robot_xy=None, yaw=None):
        """Scatter the objects ahead of the robot on the strip, at least 1.2 m apart."""
        rx, ry = robot_xy if robot_xy is not None else START
        self.pos = {}
        for n in NAMES:
            for _ in range(200):
                x = self.rng.uniform(X_MIN + 0.6, X_MAX - 0.6)
                y = ry + self.rng.uniform(*near)
                if y > Y_MAX - 0.6:
                    continue
                if n == "person" and math.hypot(x - rx, y - ry) < 2.5:
                    continue
                if all(math.hypot(x - a, y - b) > 1.2 for a, b in self.pos.values()):
                    break
            self.pos[n] = (x, y)
            self.mv.geom_pos[self.gid[n]] = (x, y, OBJECTS[n][3])
        self.reset_robot(rx, ry, math.pi / 2 if yaw is None else yaw)

    def reset_robot(self, x, y, yaw):
        e = self.e
        e.row[0] = 0
        e.cols = [0]
        e._reset(0)
        d = e.d[0]
        d.qpos[0:2] = [x, y]
        d.qpos[2] = e.hs(np.array([x]), np.array([y]))[0] + 0.90
        d.qpos[3:7] = [math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)]
        d.qpos[e.qadr] = e.default
        d.qvel[:] = 0
        d.ctrl[:len(e.default)] = e.default
        mujoco.mj_forward(e.m, d)
        e.start_xy[0] = [x, y]
        e.cmd[0] = 0
        e.delay[0] = False
        self.look = None

    def robot_pose(self):
        d = self.e.d[0]
        w, x, y, z = d.qpos[3:7]
        yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
        return float(d.qpos[0]), float(d.qpos[1]), yaw

    # ---------------------------------------------------------------- truth for labels and scoring
    def truth(self):
        """Per object: (visible, bearing rad, distance m) as seen from the robot's base heading."""
        rx, ry, yaw = self.robot_pose()
        out = {}
        for n, (x, y) in self.pos.items():
            dx, dy = x - rx, y - ry
            dist = math.hypot(dx, dy)
            b = math.atan2(dy, dx) - yaw
            b = (b + math.pi) % (2 * math.pi) - math.pi
            vis = abs(b) < FOV_X / 2 - 0.05 and 0.4 < dist < 12.0
            out[n] = (vis, b, dist)
        return out

    # ---------------------------------------------------------------- rendering
    def _sync(self):
        self.dv.qpos[:] = self.e.d[0].qpos
        mujoco.mj_forward(self.mv, self.dv)

    def ego(self):
        self._sync()
        self.r_ego.update_scene(self.dv, camera=self.cam_id)
        return self.r_ego.render()

    def cam_pose(self):
        """Head camera position and rotation (world), valid after ego(). On the robot: IMU + joint angles."""
        return self.dv.cam_xpos[self.cam_id].copy(), self.dv.cam_xmat[self.cam_id].reshape(3, 3).copy()

    def project(self, pw):
        """World point -> (u, v) in [0, 1] image coordinates and its depth along the view (after ego())."""
        cp, R = self.cam_pose()
        pc = R.T @ (np.asarray(pw) - cp)
        z = -pc[2]
        if z <= 1e-6:
            return None, None, z
        f = (CAM_H / 2) / math.tan(math.radians(CAM_FOVY / 2))
        return 0.5 + f * pc[0] / z / CAM_W, 0.5 - f * pc[1] / z / CAM_H, z

    def chase_view(self):
        self._sync()
        p = self.e.d[0].qpos[:3].copy()
        self.look = p if self.look is None else 0.85 * self.look + 0.15 * p
        _, _, yaw = self.robot_pose()
        self.chase.lookat[:] = self.look + [0, 0, -0.1]
        self.chase.azimuth = math.degrees(yaw) + 25.0
        self.r_chase.update_scene(self.dv, camera=self.chase)
        return self.r_chase.render()
