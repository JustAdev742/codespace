"""Realistic pictures of the house: MuJoCo 4's Filament renderer (physically based materials, image-based lighting,
soft shadows, ambient occlusion, bloom, tone mapping), on the GPU through Vulkan or OpenGL.

    from render_real import RealView
    rv = RealView(house)                       # once
    img = rv.render("follow")                  # an RGB array, like house.chase_view("follow")

    python render_real.py                      # stills of every room -> runs/real_*.png

On a computer with a GPU (an AMD Radeon RX 6700 XT, an NVIDIA or Intel card) it renders through Vulkan, in real time.
Without one (a cloud machine, a codespace) it falls back to software Vulkan (Mesa's lavapipe: apt install
mesa-vulkan-drivers), which is slow but gives the same pictures. The classic renderer (house.chase_view) stays
available everywhere and is what the robot's own camera uses when Filament can't start.

Filament works in physical units: lights are in candela, the camera exposure is for a lit room, so the house's lights
carry real intensities (house.py) and an image light (the sky through the windows) gives the ambient light.
"""
from __future__ import annotations

import math
import os

import numpy as np


class RealView:
    def __init__(self, house, width=960, height=600, api=None):
        import mujoco
        from mujoco import mjrf
        import mujoco.studio.window  # noqa: F401  (registers the filament: material and asset files)
        from mujoco.rendering.filament.renderer import Renderer, View
        self.mj, self.mjrf, self.View = mujoco, mjrf, View
        self.h = house
        self.w, self.ht = width, height
        api = api or os.environ.get("KESTREL_FILAMENT_API", "vulkan")
        gapi = mjrf.GraphicsApi.GRAPHICS_API_VULKAN if api == "vulkan" else mjrf.GraphicsApi.GRAPHICS_API_OPENGL
        soft = os.environ.get("KESTREL_FILAMENT_SOFTWARE", "auto")
        self.ctx = mjrf.Context(mjrf.ContextConfig(graphics_api=gapi,
                                                   software_rendering=None if soft == "auto" else soft == "1"))
        self.r = Renderer(self.ctx)
        m = house.mv
        self.scene = self.r.scene("house")
        self.scene.configure_from_model(m)
        self.res = mjrf.ModelResources(self.ctx, m)
        self.rend = mjrf.ModelRenderables(self.scene, self.res)
        self.lights = mjrf.ModelLights(self.scene, self.res)
        self.buf = np.zeros((height, width, 3), np.uint8)
        self.r.target("out", self.buf)
        self.cam = mujoco.MjvCamera()
        self.opt = mujoco.MjvOption()
        self.abstract = mujoco.MjvScene(m, maxgeom=20000)
        self.pert = mujoco.MjvPerturb()

    def _camera(self, view):
        """A camera like the classic renderer's views: behind the robot, the whole house, or the robot's head."""
        h, cam = self.h, self.cam
        x, y, yaw = h.robot_pose()
        z = h.floor_z(x, y)
        if view == "head" and getattr(h, "cam_id", None) is not None:
            cam.type = self.mj.mjtCamera.mjCAMERA_FIXED
            cam.fixedcamid = h.cam_id
        elif view == "house":
            cam.type = self.mj.mjtCamera.mjCAMERA_FREE
            cam.lookat[:] = [4.0, 4.5, 0.0]
            cam.distance, cam.elevation, cam.azimuth = 17.0, -55.0, 90.0
        else:
            cam.type = self.mj.mjtCamera.mjCAMERA_FREE
            cam.lookat[:] = [x, y, z + 0.8]
            cam.distance, cam.elevation, cam.azimuth = 3.2, -22.0, math.degrees(yaw) + 180.0 - 25.0
        return cam

    def render(self, view="follow"):
        h = self.h
        h._sync()                                    # the render model follows the simulation
        self.rend.update(h.dv)
        self.lights.update(h.dv)
        self.mj.mjv_updateScene(h.mv, h.dv, self.opt, self.pert, self._camera(view), self.mj.mjtCatBit.mjCAT_ALL,
                                self.abstract)
        glcam = self.abstract.camera[0]
        self.r.render([self.View(scene="house", target="out", camera=glcam)])
        return self.buf.copy()


def main():
    import house as HS
    from PIL import Image
    h = HS.House(chase_size=(960, 600))
    h.reset()
    for _ in range(25):
        h.step()
    rv = RealView(h)
    out = HS.HERE / "runs"
    shots = [("kitchen", 4.2, 4.0, -2.4), ("living", 10.0, 4.8, -0.9), ("bath", 6.7, 7.1, 1.57)]
    Image.fromarray(rv.render("house")).save(out / "real_overview.png")
    for name, x, y, yaw in shots:
        h.place_robot(x, y, yaw)
        for _ in range(10):
            h.step()
        Image.fromarray(rv.render("follow")).save(out / f"real_{name}.png")
    print("wrote", sorted(p.name for p in out.glob("real_*.png")))


if __name__ == "__main__":
    main()
