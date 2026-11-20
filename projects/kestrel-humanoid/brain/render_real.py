"""Realistic pictures of the house: MuJoCo 4's Filament renderer (physically based materials, image-based lighting,
shadows, reflections, ambient occlusion, tone mapping) on the GPU, through Vulkan or OpenGL.

    from render_real import RealView
    rv = RealView(house)                       # once: starts the renderer in its own process
    img = rv.render("follow")                  # an RGB array like house.chase_view("follow"), or None if it failed

    python live.py --real                      # the live page shows this view
    python render_real.py                      # stills of a few rooms -> runs/real_*.png

Filament runs in a separate process. Two GPU renderers in one process (MuJoCo's classic one, which the robot's own
camera uses, and Filament) can crash each other's graphics context; apart, they don't. And if Filament can't start on
a computer, or dies, only that process goes: RealView.render returns None and the caller shows the classic picture.

Each frame the house sends what moved (joint positions, people, shapes that change: dust, food, water, the cut-down
walls of the follow view) and the camera; the picture comes back through shared memory.

Graphics: on a computer with a GPU (an AMD Radeon RX 6700 XT, NVIDIA, Intel) it renders in real time. It tries the
backends in turn: on Windows OpenGL, then the build's default, then Vulkan (MuJoCo's Filament for Windows has no
Vulkan); on Linux Vulkan first. KESTREL_FILAMENT_API=opengl|vulkan|default picks one. Without a GPU, Filament falls
back to software rendering (Mesa's lavapipe for Vulkan, llvmpipe for OpenGL): slow, the same pictures.

Filament works in physical units (lights in lux and candela, a camera exposed for daylight), so the view adds a
headlight from the camera to light the rooms' interiors as indoor lamps would; KESTREL_FILAMENT_LIGHT scales it.
"""
from __future__ import annotations

import math
import os
import sys
import tempfile
import time

import numpy as np

HEADLIGHT_LUX = 9000.0                 # a camera-mounted fill light: rooms lit like a bright day indoors


def _child(conn, mjb, width, height, api, soft, shm_name):
    """The renderer process: load the visual model, then draw a frame for each state the house sends."""
    try:
        from multiprocessing import shared_memory
        import mujoco
        from mujoco import mjrf
        import mujoco.studio.window  # noqa: F401  (registers the filament: material and asset files)
        from mujoco.rendering.filament.renderer import Renderer, View
        m = mujoco.MjModel.from_binary_path(mjb)
        d = mujoco.MjData(m)
        apis = {"vulkan": mjrf.GraphicsApi.GRAPHICS_API_VULKAN, "opengl": mjrf.GraphicsApi.GRAPHICS_API_OPENGL,
                "default": mjrf.GraphicsApi.GRAPHICS_API_DEFAULT}
        if api not in apis:
            raise ValueError(f"unknown graphics backend '{api}' (opengl, vulkan or default)")
        gapi = apis[api]
        ctx = mjrf.Context(mjrf.ContextConfig(graphics_api=gapi, software_rendering=soft))
        r = Renderer(ctx)
        scene = r.scene("house")
        scene.configure_from_model(m)
        res = mjrf.ModelResources(ctx, m)
        rend = mjrf.ModelRenderables(scene, res)
        lights = mjrf.ModelLights(scene, res)
        out = np.zeros((height, width, 3), np.uint8)
        r.target("out", out)
        shm = shared_memory.SharedMemory(name=shm_name)
        img = np.ndarray((height, width, 3), np.uint8, buffer=shm.buf)
        opt, pert, cam = mujoco.MjvOption(), mujoco.MjvPerturb(), mujoco.MjvCamera()
        abstract = mujoco.MjvScene(m, maxgeom=20000)
        try:
            info = str(ctx.get_renderer_info())
        except Exception:
            info = api
        conn.send(("ready", info))
        while True:
            msg = conn.recv()
            if msg is None:
                break
            d.qpos[:] = msg["qpos"]
            d.mocap_pos[:] = msg["mocap_pos"]
            d.mocap_quat[:] = msg["mocap_quat"]
            m.geom_pos[:], m.geom_size[:], m.geom_rgba[:] = msg["geom_pos"], msg["geom_size"], msg["geom_rgba"]
            mujoco.mj_kinematics(m, d)
            mujoco.mj_camlight(m, d)
            opt.geomgroup[:] = msg["groups"]
            rend.set_options(opt)
            rend.update(d)
            lights.update(d)
            c = msg["cam"]
            if c["type"] == "fixed":
                cam.type, cam.fixedcamid = mujoco.mjtCamera.mjCAMERA_FIXED, c["id"]
            else:
                cam.type = mujoco.mjtCamera.mjCAMERA_FREE
                cam.lookat[:] = c["lookat"]
                cam.distance, cam.elevation, cam.azimuth = c["distance"], c["elevation"], c["azimuth"]
            mujoco.mjv_updateScene(m, d, opt, pert, cam, mujoco.mjtCatBit.mjCAT_ALL, abstract)
            r.render([View(scene="house", target="out", camera=abstract.camera[0], headlight=True,
                           headlight_intensity=msg["headlight"])])
            img[:] = out
            conn.send("ok")
    except Exception as e:                                    # tell the house why, then stop
        try:
            conn.send(("error", f"{type(e).__name__}: {e}"))
        except Exception:
            pass


class RealView:
    """The house through Filament, from a renderer process. render() returns None once it has failed."""

    @staticmethod
    def apis():
        """The graphics backends to try, in order. MuJoCo's Filament for Windows has no Vulkan ("Selected backend not
        supported in this build"), so OpenGL goes first there; Linux tries Vulkan first. KESTREL_FILAMENT_API picks one."""
        if os.environ.get("KESTREL_FILAMENT_API"):                     # one, or a list to try: "opengl,vulkan"
            return [a.strip() for a in os.environ["KESTREL_FILAMENT_API"].split(",") if a.strip()]
        if sys.platform.startswith("win") or sys.platform == "darwin":
            return ["opengl", "default", "vulkan"]
        return ["vulkan", "opengl", "default"]

    def __init__(self, house, width=960, height=600, api=None, timeout=60.0):
        import multiprocessing as mp
        from multiprocessing import shared_memory
        import mujoco
        self.mj, self.h, self.w, self.ht = mujoco, house, width, height
        self.error, self.info, self.frames = None, None, 0
        self.pending, self.sent, self.last = False, 0.0, None
        soft = os.environ.get("KESTREL_FILAMENT_SOFTWARE", "auto")
        soft = None if soft == "auto" else soft == "1"
        self.light = HEADLIGHT_LUX * float(os.environ.get("KESTREL_FILAMENT_LIGHT", "1"))
        fd, self.mjb = tempfile.mkstemp(suffix=".mjb", prefix="kestrel_house_")
        os.close(fd)
        mujoco.mj_saveModel(house.mv, self.mjb, None)        # the visual model, with its meshes and textures
        self.shm = shared_memory.SharedMemory(create=True, size=width * height * 3)
        self.img = np.ndarray((height, width, 3), np.uint8, buffer=self.shm.buf)
        self._mp, self._soft, self._timeout = mp.get_context("spawn"), soft, timeout
        self.remaining = [api] if api else self.apis()
        self.tried = []
        self._start()

    def _start(self):
        """Start the renderer process with the next graphics backend that works."""
        while self.remaining:
            api_ = self.remaining.pop(0)
            self.error = None
            self.conn, child = self._mp.Pipe()
            self.proc = self._mp.Process(target=_child, args=(child, self.mjb, self.w, self.ht, api_, self._soft,
                                                              self.shm.name), daemon=True)
            self.proc.start()
            why = None
            if not self.conn.poll(self._timeout):
                why = f"didn't start in {self._timeout:.0f} s"
            else:
                try:
                    kind, info = self.conn.recv()
                    if kind != "ready":
                        why = info
                except EOFError:
                    why = f"stopped (exit code {self.proc.exitcode})"
            if why is None:
                self.info, self.api = f"{api_}: {info}", api_
                return True
            self._give_up(api_, why)
        self.error = "; ".join(self.tried) or "no graphics backend to try"
        return False

    def _give_up(self, api_, why):
        self.tried.append(f"{api_} {why}")
        print(f"realistic view: {api_} {why}" + ("; trying the next" if self.remaining else ""), flush=True)
        try:
            self.proc.kill()
        except Exception:
            pass

    def _fail(self, why):
        """The renderer failed. Before its first picture (a backend that starts but can't draw), try the next one."""
        if not self.frames and self.remaining:
            self._give_up(getattr(self, "api", "?"), why)
            self.pending = False
            if self._start():
                return
        self.error = why if not self.tried else "; ".join(self.tried + [why])
        try:
            self.proc.kill()
        except Exception:
            pass

    @property
    def ok(self):
        return self.error is None

    def _camera(self, view):
        """Like the classic views: behind and above the robot (walls cut down), the whole house, or the robot's head."""
        h = self.h
        if view == "head" and getattr(h, "cam_id", None) is not None:
            return dict(type="fixed", id=int(h.cam_id))
        if view == "house":
            return dict(type="free", lookat=(3.6, 4.8, 0.4), distance=22.0, elevation=-60.0, azimuth=90.0)
        p = h.e.d[0].qpos[:3].copy()
        h.look = p if h.look is None else 0.85 * h.look + 0.15 * p
        _, _, yaw = h.robot_pose()
        return dict(type="free", lookat=tuple(h.look + [0, 0, -0.25]), distance=3.6, elevation=-38.0,
                    azimuth=math.degrees(yaw) + 20.0)

    def _state(self, view):
        h = self.h
        h._walls(False)                       # full-size walls; the cut-away views sink them instead (see sunk_walls)
        h._sync()
        groups = np.array([1, 1, 1, 1 if view == "head" else 0, 0, 0], np.uint8)   # ceilings: the head camera only
        mv, dv = h.mv, h.dv
        geom_pos = mv.geom_pos.copy()
        if view != "head":
            geom_pos[h.walls_v] = h.sunk_walls()
        return dict(qpos=dv.qpos.copy(), mocap_pos=dv.mocap_pos.copy(), mocap_quat=dv.mocap_quat.copy(),
                    geom_pos=geom_pos, geom_size=mv.geom_size.copy(), geom_rgba=mv.geom_rgba.copy(),
                    groups=groups, cam=self._camera(view), headlight=self.light)

    def latest(self, view="follow"):
        """Without waiting: the newest finished frame (None until the first is ready, or after a failure), and a new
        frame of the house as it is now is started if the renderer is free. For a live view: the simulation never waits
        for the picture (on a GPU it is a frame behind; on a software renderer, many)."""
        if self.error:
            return None
        if self.pending:
            try:
                if not self.conn.poll(0):
                    if time.time() - self.sent > (600.0 if not self.frames else 120.0):
                        self._fail("no frame for too long")
                        return None
                    return self.last
                reply = self.conn.recv()
            except (EOFError, BrokenPipeError, OSError) as e:
                self._fail(f"the renderer process stopped ({type(e).__name__}, exit code {self.proc.exitcode})")
                return None
            self.pending = False
            if reply != "ok":
                self._fail(reply[1] if isinstance(reply, tuple) else str(reply))
                return None
            self.frames += 1
            self.last = self.img.copy()
        try:
            self.conn.send(self._state(view))
            self.pending, self.sent = True, time.time()
        except (BrokenPipeError, OSError) as e:
            self._fail(f"the renderer process stopped ({type(e).__name__})")
        return self.last

    def render(self, view="follow", timeout=None):
        """A frame of the house as it is now (waits for it). None if the renderer has failed (after trying every
        graphics backend)."""
        while not self.error:
            img = self._render_once(view, timeout)
            if img is not None:
                return img
        return None

    def _render_once(self, view="follow", timeout=None):
        if self.error:
            return None
        if self.pending:                                    # a live frame still being drawn: let it finish
            try:
                if self.conn.poll(120.0):
                    self.conn.recv()
            except (EOFError, BrokenPipeError, OSError) as e:
                self._fail(f"the renderer process stopped ({type(e).__name__})")
                return None
            self.pending = False
        if timeout is None:                  # the first frame compiles the shaders (minutes on a software renderer)
            timeout = 600.0 if not self.frames else 120.0
        msg = self._state(view)
        try:
            self.conn.send(msg)
            if not self.conn.poll(timeout):
                self._fail(f"no frame in {timeout:.0f} s")
                return None
            reply = self.conn.recv()
        except (EOFError, BrokenPipeError, OSError) as e:
            self._fail(f"the renderer process stopped ({type(e).__name__}, exit code {self.proc.exitcode})")
            return None
        if reply != "ok":
            self._fail(reply[1] if isinstance(reply, tuple) else str(reply))
            return None
        self.frames += 1
        self.last = self.img.copy()
        return self.last

    def close(self):
        try:
            if self.proc.is_alive():
                self.conn.send(None)
                self.proc.join(3)
            if self.proc.is_alive():
                self.proc.kill()
        except Exception:
            pass
        for f in (lambda: self.shm.close(), lambda: self.shm.unlink(), lambda: os.remove(self.mjb)):
            try:
                f()
            except Exception:
                pass

    def __del__(self):
        self.close()


def main():
    import house as HS
    from PIL import Image
    h = HS.House(chase_size=(960, 600))
    h.reset()
    for _ in range(25):
        h.step()
    t = time.time()
    rv = RealView(h)
    if not rv.ok:
        print("Filament didn't start:", rv.error)
        sys.exit(1)
    print(f"renderer up in {time.time() - t:.1f} s: {rv.info}")
    out = HS.HERE / "runs"
    shots = [("kitchen", 4.2, 4.0, -2.4), ("living", 10.0, 4.8, -0.9), ("bedroom", 4.0, 7.2, 2.4)]
    if len(sys.argv) > 1:
        shots = [s_ for s_ in shots if s_[0] in sys.argv[1:]]
    t = time.time()
    img = rv.render("house")
    if img is None:
        print("failed:", rv.error)
        sys.exit(1)
    Image.fromarray(img).save(out / "real_overview.png")
    print(f"first frame {time.time() - t:.1f} s")
    for name, x, y, yaw in shots:
        h.place_robot(x, y, yaw)
        for _ in range(10):
            h.step()
        h.look = None
        t = time.time()
        img = rv.render("follow")
        if img is None:
            print("failed:", rv.error)
            sys.exit(1)
        Image.fromarray(img).save(out / f"real_{name}.png")
        Image.fromarray(rv.render("head")).save(out / f"real_{name}_head.png")
        print(f"{name}: {time.time() - t:.2f} s for two frames")
    rv.close()
    print("wrote", sorted(p.name for p in out.glob("real_*.png")))


if __name__ == "__main__":
    main()
