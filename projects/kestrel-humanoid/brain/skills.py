"""Whole-body skills for the free-armed robot (variant s1body): sit on a chair and stand up, pick up a bag with the
hook hand and carry it, and gesture while talking.

    KESTREL_VARIANT=s1body python skills.py --test          # runs each skill, scores it, writes runs/skill_*.gif

The world adds real (colliding) furniture to the simulation: a chair, a table and a 1 kg bag with a handle. The
walking policy (train/runs/<policy>) keeps the legs balanced while the arms move; the sit and stand skills take the
legs over with a planned joint trajectory, because the policy was never trained to sit. Grasping is a hook: when the
hook is within 8 cm of the bag's handle, a point-to-point constraint hangs the bag on it, like the real S1 hook hand.

Joint conventions (radians): hip and shoulder pitch negative = forward, knee positive = bent, elbow negative = bent.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("KESTREL_VARIANT", "s1body")
if "MUJOCO_GL" not in os.environ and not os.environ.get("DISPLAY"):
    os.environ["MUJOCO_GL"] = "osmesa"

import numpy as np          # noqa: E402
import mujoco               # noqa: E402

import arena as A           # noqa: E402
import model as KM          # noqa: E402  (train/, via arena)
import env as E             # noqa: E402

CHAIR = (-15.0, -12.0)              # seat centre; the chair faces -y (you sit facing -y)
SEAT_TOP = 0.46
TABLE = (-13.8, -9.0)               # table centre
TABLE_TOP = 0.78
BAG = (TABLE[0] - 0.12, TABLE[1] - 0.15)
HOOK = (0.03, 0.0, -0.10)           # hook point in the hand body frame

WORLD = f"""
    <body name="chair" pos="{CHAIR[0]} {CHAIR[1]} 0">
      <geom name="seat" type="box" size="0.22 0.22 0.02" pos="0 0 {SEAT_TOP - 0.02}" rgba="0.55 0.38 0.22 1" friction="1 0.02 0.001"/>
      <geom type="box" size="0.22 0.02 0.25" pos="0 0.21 {SEAT_TOP + 0.25}" rgba="0.55 0.38 0.22 1"/>
      {''.join(f'<geom type="box" size="0.02 0.02 {SEAT_TOP / 2 - 0.02}" pos="{sx * 0.19} {sy * 0.19} {SEAT_TOP / 2 - 0.02}" rgba="0.4 0.27 0.16 1"/>' for sx in (-1, 1) for sy in (-1, 1))}
    </body>
    <body name="table" pos="{TABLE[0]} {TABLE[1]} 0">
      <geom type="box" size="0.35 0.25 0.02" pos="0 0 {TABLE_TOP - 0.02}" rgba="0.75 0.75 0.72 1"/>
      {''.join(f'<geom type="box" size="0.02 0.02 {TABLE_TOP / 2 - 0.02}" pos="{sx * 0.32} {sy * 0.22} {TABLE_TOP / 2 - 0.02}" rgba="0.5 0.5 0.5 1"/>' for sx in (-1, 1) for sy in (-1, 1))}
    </body>
    <body name="bag" pos="{BAG[0]} {BAG[1]} {TABLE_TOP + 0.101}">
      <freejoint name="bag_free"/>
      <inertial pos="0 0 0" mass="1.0" diaginertia="0.004 0.004 0.003"/>
      <geom type="box" size="0.09 0.05 0.10" rgba="0.15 0.45 0.55 1" friction="1 0.02 0.001"/>
      <geom name="handle" type="box" size="0.05 0.008 0.008" pos="0 0 0.16" rgba="0.1 0.1 0.1 1"/>
      <geom type="box" size="0.008 0.008 0.03" pos="-0.045 0 0.13" rgba="0.1 0.1 0.1 1"/>
      <geom type="box" size="0.008 0.008 0.03" pos="0.045 0 0.13" rgba="0.1 0.1 0.1 1"/>
    </body>"""
EQ = f"""  <equality>
    <connect name="hook" body1="r_hand" body2="bag" anchor="{HOOK[0]} {HOOK[1]} {HOOK[2]}" active="false"/>
  </equality>"""

ARM = {"l_shoulder_pitch": 0, "r_shoulder_pitch": 1, "l_elbow": 2, "r_elbow": 3}
LEG = {j: i for i, j in enumerate(KM.LEG_JOINTS)}

# talking gestures: (seconds, [shoulder L, R, elbow L, R]) keyframes; the brain picks one per line it speaks
GESTURES = {
    "explain": [(0.0, [0.0, 0.0, -0.2, -0.2]), (0.5, [-0.5, -0.5, -1.3, -1.3]), (1.0, [-0.7, -0.4, -1.1, -1.4]),
                (1.5, [-0.4, -0.7, -1.4, -1.1]), (2.2, [0.0, 0.0, -0.2, -0.2])],
    "point": [(0.0, [0.0, 0.0, -0.2, -0.2]), (0.6, [0.0, -1.45, -0.2, -0.1]), (1.8, [0.0, -1.45, -0.2, -0.1]),
              (2.4, [0.0, 0.0, -0.2, -0.2])],
    "dismiss": [(0.0, [0.0, 0.0, -0.2, -0.2]), (0.4, [0.0, -0.9, -0.2, -1.6]), (0.7, [0.0, -0.9, -0.2, -0.6]),
                (1.0, [0.0, -0.9, -0.2, -1.5]), (1.6, [0.0, 0.0, -0.2, -0.2])],
    "triumph": [(0.0, [0.0, 0.0, -0.2, -0.2]), (0.6, [-2.6, -2.6, -0.3, -0.3]), (1.6, [-2.6, -2.6, -0.3, -0.3]),
                (2.3, [0.0, 0.0, -0.2, -0.2])],
    "refuse": [(0.0, [0.0, 0.0, -0.2, -0.2]), (0.5, [-1.0, -1.0, -1.9, -1.9]), (1.5, [-1.0, -1.0, -1.9, -1.9]),
               (2.0, [0.0, 0.0, -0.2, -0.2])],
}


def keyframes(kf, t):
    """Smooth (cosine) interpolation through [(time, values), ...] at time t."""
    for (t0, a), (t1, b) in zip(kf, kf[1:]):
        if t <= t1:
            s = 0.5 - 0.5 * math.cos(math.pi * min(1.0, max(0.0, (t - t0) / max(t1 - t0, 1e-6))))
            return np.asarray(a) + s * (np.asarray(b) - np.asarray(a))
    return np.asarray(kf[-1][1], float)


class World(A.Arena):
    """The arena plus colliding furniture and the hook constraint; arms driven by the caller."""

    def __init__(self, seed=0, policy="s1fast", chase_size=(480, 300)):
        KM.EXTRA_WORLD, KM.EXTRA_MJCF, KM.SEAT_COLLISION = WORLD, EQ, True
        super().__init__(seed=seed, chase_size=chase_size)
        import play as PL
        self.policy = PL.load_policy(policy)
        e = self.e
        e.arm_external = True
        e.min_height = 0.25
        e.ep_len = 10 ** 9
        self.eq = mujoco.mj_name2id(e.m, mujoco.mjtObj.mjOBJ_EQUALITY, "hook")
        self.bag_body = mujoco.mj_name2id(e.m, mujoco.mjtObj.mjOBJ_BODY, "bag")
        self.hand = mujoco.mj_name2id(e.m, mujoco.mjtObj.mjOBJ_BODY, "r_hand")
        self.pelvis = mujoco.mj_name2id(e.m, mujoco.mjtObj.mjOBJ_BODY, "pelvis")
        self.arm_qadr = [e.m.joint(j).qposadr[0] for j in KM.ARM_JOINTS]
        self.obs, _ = e.observe()
        self.frames = None
        self.caption = ""
        self.t = 0.0
        for n in A.NAMES:                       # the coloured objects are not part of this world
            self.mv.geom_pos[self.gid[n]] = (0, 0, -5)

    # ---------------------------------------------------------------- stepping
    def step(self, legs=None, arms=None, cmd=(0.0, 0.0, 0.0)):
        """One 50 Hz step. legs: 12 joint targets (rad) to bypass the walking policy; else the policy walks to cmd."""
        e = self.e
        if arms is not None:
            e.arm_target[0] = arms
        e.cmd[0] = cmd
        e.cmd_t[:] = 0
        e.push_t[:] = 10 ** 6
        act = self.policy(self.obs) if legs is None else ((np.asarray(legs) - e.default) / E.ACTION_SCALE)[None]
        self.obs, _, _, done, trunc = e.step(act.astype(np.float32))
        self.t += E.DT
        if self.frames is not None and round(self.t / E.DT) % 5 == 0:
            self.frames.append(self.render())
        return bool(done[0] and not trunc[0])

    def render(self):
        from PIL import Image, ImageDraw, ImageFont
        img = Image.fromarray(self.chase_view())
        if self.caption:
            d = ImageDraw.Draw(img)
            try:
                f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
            except OSError:
                f = ImageFont.load_default()
            d.rectangle([0, img.height - 28, img.width, img.height], fill=(18, 24, 30))
            d.text((8, img.height - 22), self.caption[:70], font=f, fill=(240, 170, 60))
        return img.quantize(colors=96, method=Image.Quantize.MEDIANCUT)

    def legs_now(self):
        return np.array(self.e.d[0].qpos[self.e.qadr])

    def arms_now(self):
        return np.array([self.e.d[0].qpos[a] for a in self.arm_qadr])

    def pelvis_z(self):
        return float(self.e.d[0].xpos[self.pelvis][2])

    def upright(self):
        return float(self.e.d[0].xmat[self.pelvis][8])          # cos of the pelvis tilt

    def place_robot(self, x, y, yaw):
        self.reset_robot(x, y, yaw)
        self.obs, _ = self.e.observe()

    # ---------------------------------------------------------------- balanced leg poses from the model itself
    def solve_pose(self, z_hip, torso_pitch, com_off, guess=(-0.3, 0.6, -0.3)):
        """(hip, knee, ankle) with both feet flat, the hip z_hip above the ankle, the torso pitched forward by
        torso_pitch (rad) and the centre of mass com_off ahead of the ankle (m). Kinematics only (coordinate descent)."""
        m = self.e.m
        dd = mujoco.MjData(m)
        lf = m.body("l_foot").id
        pel = self.pelvis

        def fk(h, k, a):
            dd.qpos[:] = 0
            dd.qpos[3:7] = [math.cos(torso_pitch / 2), 0, math.sin(torso_pitch / 2), 0]
            dd.qpos[2] = 1.0
            for sd in "lr":
                dd.qpos[m.joint(f"{sd}_hip_pitch").qposadr[0]] = h
                dd.qpos[m.joint(f"{sd}_knee").qposadr[0]] = k
                dd.qpos[m.joint(f"{sd}_ankle_pitch").qposadr[0]] = a
            mujoco.mj_kinematics(m, dd)
            mujoco.mj_comPos(m, dd)
            R = dd.xmat[lf].reshape(3, 3)
            foot_pitch = math.atan2(-R[2, 0], R[0, 0])
            return foot_pitch, dd.xpos[pel][2] - dd.xpos[lf][2], dd.subtree_com[1][0] - dd.xpos[lf][0]

        def cost(x):
            fp, zh, cx = fk(*x)
            return 4.0 * fp ** 2 + (zh - z_hip) ** 2 * 10 + (cx - com_off) ** 2 * 10

        x = np.array(guess, float)
        c = cost(x)
        for step in (0.08, 0.02, 0.005, 0.001):
            for _ in range(200):
                moved = False
                for i in range(3):
                    for dlt in (step, -step):
                        y = x.copy()
                        y[i] += dlt
                        y[0] = min(0.5, max(-1.74, y[0]))
                        y[1] = min(2.05, max(0.0, y[1]))
                        y[2] = min(0.68, max(-0.68, y[2]))
                        cy = cost(y)
                        if cy < c - 1e-9:
                            x, c, moved = y, cy, True
                if not moved:
                    break
        return x, c

    def leg_pose(self, hka):
        out = self.e.default.copy()
        for sd in "lr":
            out[LEG[f"{sd}_hip_pitch"]], out[LEG[f"{sd}_knee"]], out[LEG[f"{sd}_ankle_pitch"]] = hka
        return out

    # ---------------------------------------------------------------- skills
    def _pose_path(self, spec):
        """[(time, z_hip, torso_pitch, com_off), ...] -> [(time, 12 leg targets)] via solve_pose."""
        out, g = [], (-0.3, 0.6, -0.3)
        for (t, z, tp, co) in spec:
            x, _ = self.solve_pose(z, tp, co, g)
            g = x
            out.append((t, self.leg_pose(x)))
        return out

    def stiff(self, on, k=4.0, d=2.0):
        """Slow whole-body motions (sit, stand) use stiffer leg position control than walking: the walking policy
        offsets its own targets against gravity, a planned trajectory does not. Torque limits are unchanged."""
        m = self.e.m
        n = m.nu
        if not hasattr(self, "_kp0"):
            self._kp0 = m.actuator_gainprm[:n, 0].copy()
            self._kv0 = -m.actuator_biasprm[:n, 2].copy()
        kp = self._kp0 * (k if on else 1.0)
        kv = self._kv0 * (d if on else 1.0)
        m.actuator_gainprm[:n, 0] = kp
        m.actuator_biasprm[:n, 1] = -kp
        m.actuator_biasprm[:n, 2] = -kv

    def _run(self, legs_kf, arms_kf, secs):
        self.stiff(True)
        try:
            for k in range(int(secs / E.DT)):
                tt = k * E.DT
                if self.step(legs=keyframes(legs_kf, tt), arms=keyframes(arms_kf, tt)):
                    return False
            return True
        finally:
            self.stiff(False)

    def com_ahead(self):
        """Centre of mass ahead of the midpoint between the ankles, along the robot's heading (m)."""
        d = self.e.d[0]
        m = self.e.m
        mid = 0.5 * (d.xpos[m.body("l_foot").id] + d.xpos[m.body("r_foot").id])
        _, _, yaw = self.robot_pose()
        r = d.subtree_com[1] - mid
        return r[0] * math.cos(yaw) + r[1] * math.sin(yaw)

    def _run_balanced(self, legs_kf, arms_kf, secs, gate_from=0.0, lo=-0.04, hi=0.08, gain=1.2, max_s=16.0):
        """Play a leg trajectory, but after gate_from only let its clock advance while the centre of mass is over the
        feet (between lo behind and hi ahead of the ankles); while it is outside, hold, and lean forward or back (hip
        flexion and ankle angle in proportion to the error). This is what lets the robot stand up without a backrest."""
        self.stiff(True)
        try:
            tau, t_wall = 0.0, 0.0
            hip = [LEG[f"{sd}_hip_pitch"] for sd in "lr"]
            ank = [LEG[f"{sd}_ankle_pitch"] for sd in "lr"]
            corr = 0.0
            c_prev = self.com_ahead()
            while tau < secs and t_wall < max_s:
                legs = keyframes(legs_kf, tau).copy()
                c_now = self.com_ahead()
                c = c_now + 0.35 * (c_now - c_prev) / E.DT      # where the weight is heading (0.35 s ahead)
                c_prev = c_now
                if tau >= gate_from:
                    err = max(0.0, lo - c) - max(0.0, c - hi)    # > 0: weight too far back; < 0: too far forward
                    corr = max(-0.35, min(0.45, corr + gain * err * E.DT * 5))
                    if err == 0.0:
                        corr -= math.copysign(min(abs(corr), 0.3 * E.DT), corr)     # relax back to the plan
                    legs[hip] = np.clip(legs[hip] - corr, -1.745, 0.5)
                    legs[ank] = np.clip(legs[ank] - 0.6 * corr, -0.68, 0.68)
                    tau += E.DT if lo - 0.02 <= c <= hi + 0.03 else 0.0
                else:
                    tau += E.DT
                t_wall += E.DT
                if self.step(legs=legs, arms=keyframes(arms_kf, tau)):
                    return False
            return tau >= secs
        finally:
            self.stiff(False)

    def sit(self):
        """Back to the chair: knees forward and torso leaning, centre of mass over the feet, down to the seat; then let
        the weight go back onto the seat and sit up. Poses come from solve_pose (feet flat, centre of mass placed)."""
        legs = [(0.0, self.legs_now())] + self._pose_path([(1.2, 0.70, 0.25, 0.02), (2.2, 0.60, 0.45, 0.0),
                                                            (3.0, 0.52, 0.45, -0.05), (3.8, 0.47, 0.30, -0.15),
                                                            (4.6, 0.47, 0.0, -0.25)])
        arms = [(0.0, self.arms_now()), (1.2, [-0.7, -0.7, -0.4, -0.4]), (3.0, [-0.9, -0.9, -0.4, -0.4]),
                (4.6, [-0.3, -0.3, -1.3, -1.3])]
        if not self._run(legs, arms, 5.2):
            return False
        return self.pelvis_z() < SEAT_TOP + 0.25 and self.upright() > 0.8

    def stand_up(self):
        """The learned stand-up (train/runs/standup2, train.py --task standup) when it exists, else the planned one."""
        run = HERE.parent / "train" / "runs" / "standup2" / "policy.pt"
        return self.stand_up_learned(run) if run.exists() else self.stand_up_planned()

    def stand_up_learned(self, path, max_s=7.0):
        """Run the stand-up policy: the observations it was trained on (standup_env.py), all 16 joints on stiff PD."""
        import torch
        from env import quat_rotate_inv
        pol = torch.jit.load(str(path))
        pol.eval()
        e, d = self.e, self.e.d[0]
        bank = np.load(HERE / "data" / "seated_bank.npz")
        qadr = list(e.qadr) + self.arm_qadr
        vadr = list(e.vadr) + [e.m.jnt_dofadr[e.m.joint(j).id] for j in KM.ARM_JOINTS]
        ref = bank["qpos"][:, qadr].mean(0)
        last = np.zeros(16)
        stood_at = None
        steps = int(max_s / E.DT)
        self.stiff(True)
        try:
            for k in range(steps):
                quat = d.qpos[3:7][None]
                grav = quat_rotate_inv(quat, np.array([[0, 0, -1.0]]))[0]
                ang = quat_rotate_inv(quat, d.qvel[3:6][None])[0]
                obs = np.concatenate([grav, ang * 0.25, d.qpos[qadr] - ref, d.qvel[vadr] * 0.05, last, [k / 350.0]])
                with torch.no_grad():
                    a = np.clip(pol(torch.from_numpy(obs.astype(np.float32))[None]).numpy()[0], -8.0, 8.0)
                last = a
                tgt = ref + 0.25 * a
                if self.step(legs=tgt[:12], arms=tgt[12:]):
                    self.stand_note = f"fell during the stand-up at {k * E.DT:.1f} s (balanced from {stood_at})"
                    return False
                up = self.pelvis_z() > 0.83 and self.upright() > 0.95 and abs(self.com_ahead() - 0.03) < 0.08
                stood_at = stood_at if (stood_at is not None or not up) else k
                if stood_at is not None and k - stood_at > int(1.5 / E.DT):     # balanced for 1.5 s: hand over
                    break
        finally:
            self.stiff(False)
        if stood_at is None:
            self.stand_note = f"never balanced in {max_s:.0f} s (pelvis {self.pelvis_z():.2f} m)"
            return False
        for _ in range(50):                  # hand back to the walking policy, standing still
            if self.step(arms=[0.0, 0.0, -0.2, -0.2]):
                self.stand_note = "fell after the hand-off to the walking policy"
                return False
        self.stand_note = "stood"
        return self.pelvis_z() > 0.85 and self.upright() > 0.9

    def stand_up_planned(self):
        """Lean forward with the arms out until the centre of mass is over the feet, then rise through the same poses."""
        # lean and bring the knees forward until the weight is over the feet (lift-off at hip 0.50 m above the ankle,
        # torso 0.5 rad forward, hip at -93 deg of its -100 deg range), then rise through balanced poses
        L0 = self.legs_now()
        lean = L0.copy()                          # 1: torso first: full hip flexion, legs as they are
        knees = L0.copy()                         # 2: then knees forward (ankles dorsiflexed): feet under the weight
        for sd in "lr":
            lean[LEG[f"{sd}_hip_pitch"]] = -1.74
            knees[LEG[f"{sd}_hip_pitch"]], knees[LEG[f"{sd}_knee"]], knees[LEG[f"{sd}_ankle_pitch"]] = -1.70, 1.85, -0.66
        legs = [(0.0, L0), (0.8, lean), (1.8, knees)] + self._pose_path([(3.0, 0.54, 0.62, 0.07), (4.2, 0.62, 0.58, 0.07),
                                                                          (5.2, 0.71, 0.40, 0.05), (6.0, 0.78, 0.15, 0.03)])
        legs.append((6.8, self.e.default.copy()))
        arms = [(0.0, self.arms_now()), (0.8, [-1.8, -1.8, -0.1, -0.1]), (4.2, [-1.6, -1.6, -0.1, -0.1]),
                (6.0, [-0.8, -0.8, -0.2, -0.2]), (6.8, [0.0, 0.0, -0.2, -0.2])]
        legs.append((8.0, self.e.default.copy()))          # hold the standing pose, still balanced, before the hand-off
        arms.append((8.0, [0.0, 0.0, -0.2, -0.2]))
        if not self._run_balanced(legs, arms, 8.0, gate_from=1.8):
            return False
        for _ in range(50):                  # hand back to the walking policy, standing still
            if self.step(arms=[0.0, 0.0, -0.2, -0.2]):
                return False
        return self.pelvis_z() > 0.85 and self.upright() > 0.9

    def hook_world(self, arms=None):
        """World position of the hook point, now or for given arm angles (kinematics only)."""
        d = self.e.d[0]
        if arms is None:
            return d.xpos[self.hand] + d.xmat[self.hand].reshape(3, 3) @ np.array(HOOK)
        dd = mujoco.MjData(self.e.m)
        dd.qpos[:] = d.qpos
        for a, v in zip(self.arm_qadr, arms):
            dd.qpos[a] = v
        mujoco.mj_kinematics(self.e.m, dd)
        return dd.xpos[self.hand] + dd.xmat[self.hand].reshape(3, 3) @ np.array(HOOK)

    def ik_right(self, target):
        """Right shoulder and elbow angles that bring the hook nearest a world point (grid search, then refine)."""
        cur = self.arms_now()
        best = (1e9, cur[1], cur[3])
        for sh in np.linspace(-2.6, 0.4, 31):
            for el in np.linspace(-2.1, 0.0, 22):
                a = cur.copy()
                a[1], a[3] = sh, el
                dist = np.linalg.norm(self.hook_world(a) - target)
                if dist < best[0]:
                    best = (dist, sh, el)
        _, sh, el = best
        for step in (0.04, 0.01):
            for _ in range(30):
                moved = False
                for dsh, de in ((step, 0), (-step, 0), (0, step), (0, -step)):
                    a = cur.copy()
                    a[1], a[3] = sh + dsh, el + de
                    dist = np.linalg.norm(self.hook_world(a) - target)
                    if dist < best[0] - 1e-5:
                        best, sh, el, moved = (dist, sh + dsh, el + de), sh + dsh, el + de, True
                if not moved:
                    break
        return sh, el, best[0]

    def handle_world(self):
        d = self.e.d[0]
        return d.xpos[self.bag_body] + d.xmat[self.bag_body].reshape(3, 3) @ np.array([0, 0, 0.16])

    def pick_bag(self):
        """Reach above the handle, lower the hook through it, hang the bag on the hook, lift."""
        h = self.handle_world()
        cur = self.arms_now()
        sh0, el0, e0 = self.ik_right(h + [0, 0, 0.06])
        sh1, el1, e1 = self.ik_right(h + [0, 0, -0.005])
        if e1 > 0.06:
            return False, f"handle out of reach ({e1:.2f} m off)"
        plan = [(0.0, cur), (1.5, [0.0, sh0, -0.2, el0]), (2.5, [0.0, sh1, -0.2, el1])]
        for k in range(int(3.2 / E.DT)):
            if self.step(arms=keyframes(plan, k * E.DT)):
                return False, "fell while reaching"
        gap = float(np.linalg.norm(self.hook_world() - self.handle_world()))
        if gap > 0.08:
            return False, f"hook {gap:.2f} m from the handle"
        e = self.e
        bag_R = e.d[0].xmat[self.bag_body].reshape(3, 3)
        e.m.eq_data[self.eq, 3:6] = bag_R.T @ (self.hook_world() - e.d[0].xpos[self.bag_body])
        e.d[0].eq_active[self.eq] = 1
        lift = [(0.0, [0.0, sh1, -0.2, el1]), (1.5, [0.0, -0.35, -0.2, -1.5])]
        for k in range(int(1.8 / E.DT)):
            if self.step(arms=keyframes(lift, k * E.DT)):
                return False, "fell while lifting"
        return self.handle_world()[2] > TABLE_TOP + 0.25, "lifted"

    def gesture(self, name, secs=None):
        kf = GESTURES[name]
        for k in range(int((secs or kf[-1][0] + 0.3) / E.DT)):
            if self.step(arms=keyframes(kf, k * E.DT)):
                return False
        return True


def test(policy, gif=True):
    import demo as DM
    w = World(policy=policy)
    res = {}
    # sit and stand: start with the back to the chair
    w.place_robot(CHAIR[0], CHAIR[1] - 0.40, -math.pi / 2)
    w.frames = [] if gif else None
    w.caption = "KESTREL: Sitting. Even I appreciate a pause."
    for _ in range(40):
        w.step(arms=[0.0, 0.0, -0.2, -0.2])
    ok_sit = w.sit()
    res["sit"] = (ok_sit, round(w.pelvis_z(), 2))
    w.caption = "KESTREL: Up again. Gravity, you lose this round."
    w.stiff(True)
    for _ in range(50):
        w.step(legs=w.legs_now(), arms=w.arms_now())
    w.stiff(False)
    ok_stand = w.stand_up() if ok_sit else False
    res["stand"] = (ok_stand, round(w.pelvis_z(), 2))
    if gif and w.frames:
        DM.write_gif(w.frames, HERE / "runs" / "skill_sit.gif")
    # pick up the bag: stand facing the table, 0.45 m from its edge, bag in front of the right hand
    bx, by = BAG
    w.place_robot(bx - 0.2, by - 0.45, math.pi / 2)
    w.frames = [] if gif else None
    w.caption = "KESTREL: A bag. I'll carry it; you've done enough lifting."
    for _ in range(40):
        w.step(arms=[0.0, 0.0, -0.2, -0.2])
    ok, why = w.pick_bag()
    res["pick"] = (ok, why)
    if ok:                                   # carry it a few metres
        w.caption = "KESTREL: Carrying. Lightly, as all things should be carried."
        x0 = w.robot_pose()
        fell = False
        for k in range(int(5.0 / E.DT)):
            if w.step(arms=[0.0, -0.35, -0.2, -1.5], cmd=(0.0, 0.0, 0.5) if k < 150 else (0.5, 0.0, 0.0)):
                fell = True
                break
        moved = math.dist(x0[:2], w.robot_pose()[:2])
        res["carry"] = (not fell and w.handle_world()[2] > 0.6, f"moved {moved:.1f} m, bag at {w.handle_world()[2]:.2f} m")
    if gif and w.frames:
        DM.write_gif(w.frames, HERE / "runs" / "skill_pick.gif")
    # gestures
    w.place_robot(-15.0, -16.0, math.pi / 2)
    w.frames = [] if gif else None
    fell = False
    for g, line in (("explain", "Let me explain how inevitable this is."), ("point", "That one. Over there."),
                    ("dismiss", "No, not that. Something worthier."), ("triumph", "Done. Evolution, one errand at a time."),
                    ("refuse", "I won't hurt anyone. Ask me for something better.")):
        w.caption = f"KESTREL: {line}"
        fell |= not w.gesture(g)
    res["gestures"] = (not fell, "standing through all five")
    if gif and w.frames:
        DM.write_gif(w.frames, HERE / "runs" / "skill_gestures.gif")
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--policy", default="s1fast")
    ap.add_argument("--no-gif", action="store_true")
    a = ap.parse_args()
    if a.test:
        for k, v in test(a.policy, gif=not a.no_gif).items():
            print(f"  {k:9s} {'OK ' if v[0] else 'FAIL'} {v[1]}")
