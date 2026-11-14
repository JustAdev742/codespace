"""Stand-up task: from sitting on a chair to standing balanced, for the free-armed robot (variant s1body).

    python train.py --task standup --variant s1body --name standup --workers 2 --threads 1 --hours 2

The same interface as env.Envs, so train.py's PPO trains it unchanged. Every episode starts from a recorded seated
state (brain/make_seated_bank.py) with a little noise. The policy commands all 16 joints (legs and arms) as offsets
from the mean seated pose, on stiff PD position servos (4 x the walking gains, as brain/skills.py uses for slow
whole-body motion), with the actuators' force limits. It is rewarded for raising the pelvis, staying upright, keeping
its centre of mass over the feet once it is up, and holding a balanced stand; it is penalised for falling, effort and
jerky commands, joint speeds near the motors' no-load speed, and rising faster than 0.8 m/s. Every physics step
caps each motor's force by its torque-speed line (as env.py does for walking), so the stand-up the policy learns is
one the hub motors and drills can actually deliver.
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import numpy as np
import mujoco

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import model as KM          # noqa: E402
from env import quat_rotate_inv   # noqa: E402

DT_SIM, DECIM = 0.005, 4
DT = DT_SIM * DECIM
EP_LEN = 350                                   # 7 s
ACTION_SCALE, ACTION_CLIP = 0.25, 8.0
CHAIR = (-15.0, -12.0)
SEAT_TOP = 0.46
WORLD = f"""
    <geom name="floor" type="plane" size="30 30 0.1" rgba="0.6 0.6 0.6 1" friction="1 0.02 0.001"/>
    <body name="chair" pos="{CHAIR[0]} {CHAIR[1]} 0">
      <geom name="seat" type="box" size="0.22 0.22 0.02" pos="0 0 {SEAT_TOP - 0.02}" friction="1 0.02 0.001"/>
      <geom type="box" size="0.22 0.02 0.25" pos="0 0.21 {SEAT_TOP + 0.25}"/>
    </body>"""
W = dict(height=1.0, upright=0.5, balance=-2.0, stand=1.0, effort=-2e-6, action_rate=-0.02, alive=0.1, fall=-5.0,
         speed_limit=-1.0, rise_rate=-2.0)
STAND_Z = 0.86


class Envs:
    W = W

    def __init__(self, M=32, seed=0, randomize=True, **kw):
        KM.SEAT_COLLISION, KM.EXTRA_WORLD, KM.EXTRA_MJCF = True, WORLD, ""
        xml, _ = KM.build_xml(None)
        self.m = m = mujoco.MjModel.from_xml_string(xml)
        self.M, self.rng, self.randomize = M, np.random.default_rng(seed), randomize
        self.joints = KM.LEG_JOINTS + KM.ARM_JOINTS
        assert len(self.joints) == 16, "variant s1body (free arms) needed"
        self.qadr = np.array([m.joint(j).qposadr[0] for j in self.joints])
        self.vadr = np.array([m.joint(j).dofadr[0] for j in self.joints])
        self.base_kp = m.actuator_gainprm[:16, 0].copy() * 4.0
        self.base_kv = -m.actuator_biasprm[:16, 2].copy() * 2.0
        self._set_gains(1.0)
        bank = np.load(HERE.parent / "brain" / "data" / "seated_bank.npz")
        self.bank_q, self.bank_v = bank["qpos"][:, :m.nq], bank["qvel"][:, :m.nv]   # robot first; the bag (skills world) after
        self.ref = self.bank_q[:, self.qadr].mean(0)
        # motor torque-speed lines for all 16 joints (as env.py applies to the legs): T, T_V, w0
        import json
        ts = KM.torque_speed()
        legs = np.array([ts[j[2:]][:3] for j in KM.LEG_JOINTS])
        fam = json.loads((HERE.parent / "scrap" / "s1fast" / "data" / "actuator_family.json").read_text())
        arm = []
        for j in KM.ARM_JOINTS:
            f = fam["X-SH" if "shoulder" in j else "X-EL"]
            arm.append((f["T_peak_joint"], f["T_peak_joint"] * (18.0 / 0.17) / 40.0, f["w_noload_joint"]))
        self.ts = np.vstack([legs, np.array(arm)]).T          # 3 x 16
        self.lf, self.rf = m.body("l_foot").id, m.body("r_foot").id
        self.pelvis = m.body("pelvis").id
        self.d = [mujoco.MjData(m) for _ in range(M)]
        self.t = np.zeros(M, int)
        self.last_a = np.zeros((M, 16))
        self.prev_a = np.zeros((M, 16))
        self.ep_ret = np.zeros(M)
        self.row, self.col = np.zeros(M, int), np.zeros(M, int)
        self.w = dict(W)
        self.done_stats, self.term_sum, self.term_n = [], {}, 0
        self.friction, self.motor_scale = 1.0, 1.0
        for i in range(M):
            self._reset(i)

    @staticmethod
    def scheduled_weights(steps):
        return {}

    def _set_gains(self, s):
        m = self.m
        m.actuator_gainprm[:16, 0] = self.base_kp * s
        m.actuator_biasprm[:16, 1] = -self.base_kp * s
        m.actuator_biasprm[:16, 2] = -self.base_kv

    def randomize_model(self):
        if not self.randomize:
            return
        m = self.m
        self.friction = self.rng.uniform(0.5, 1.2)
        for g in range(m.ngeom):
            if m.geom_bodyid[g] in (self.lf, self.rf):
                m.geom_friction[g, 0] = self.friction
        self.motor_scale = self.rng.uniform(0.9, 1.1)
        self._set_gains(self.motor_scale)
        m.body_mass[self.pelvis] = m.body_mass[self.pelvis]  # (masses kept: the bank's poses depend on them)

    def _reset(self, i):
        d = self.d[i]
        k = self.rng.integers(len(self.bank_q))
        d.qpos[:] = self.bank_q[k]
        d.qvel[:] = 0
        if self.randomize:
            d.qpos[self.qadr] += self.rng.uniform(-0.06, 0.06, 16)
        d.ctrl[:16] = d.qpos[self.qadr]
        mujoco.mj_forward(self.m, d)
        self.t[i] = 0
        self.last_a[i] = 0
        self.prev_a[i] = 0
        self.ep_ret[i] = 0

    # ---------------------------------------------------------------- observations
    def _state(self):
        M = self.M
        qpos = np.array([d.qpos for d in self.d])
        qvel = np.array([d.qvel for d in self.d])
        quat = qpos[:, 3:7]
        grav = quat_rotate_inv(quat, np.tile([0, 0, -1.0], (M, 1)))
        ang = quat_rotate_inv(quat, qvel[:, 3:6])
        lin = quat_rotate_inv(quat, qvel[:, 0:3])
        q, qd = qpos[:, self.qadr], qvel[:, self.vadr]
        pz = np.array([d.xpos[self.pelvis][2] for d in self.d])
        up = np.array([d.xmat[self.pelvis][8] for d in self.d])
        yaw = np.arctan2(2 * (quat[:, 0] * quat[:, 3] + quat[:, 1] * quat[:, 2]), 1 - 2 * (quat[:, 2] ** 2 + quat[:, 3] ** 2))
        ca = np.empty(M)
        for i, d in enumerate(self.d):
            r = d.subtree_com[1] - 0.5 * (d.xpos[self.lf] + d.xpos[self.rf])
            ca[i] = r[0] * math.cos(yaw[i]) + r[1] * math.sin(yaw[i])
        return grav, ang, lin, q, qd, pz, up, ca

    def _obs(self, s):
        grav, ang, lin, q, qd, pz, up, ca = s
        obs = np.concatenate([grav, ang * 0.25, q - self.ref, qd * 0.05, self.last_a, (self.t / EP_LEN)[:, None]], 1)
        critic = np.concatenate([obs, ca[:, None], pz[:, None], lin * 2.0], 1)
        return obs.astype(np.float32), critic.astype(np.float32)

    def observe(self):
        return self._obs(self._state())

    # ---------------------------------------------------------------- step
    def step(self, actions):
        M = self.M
        a = np.clip(actions, -ACTION_CLIP, ACTION_CLIP)
        target = self.ref + ACTION_SCALE * a
        m = self.m
        T, TV, w0 = self.ts
        kp, kv = m.actuator_gainprm[:16, 0], -m.actuator_biasprm[:16, 2]
        for _ in range(DECIM):                    # PD force capped by each motor's torque-speed line, every substep
            q = np.array([d.qpos[self.qadr] for d in self.d])
            qd = np.array([d.qvel[self.vadr] for d in self.d])
            F = kp * (target - q) - kv * qd
            lim = np.minimum(T, np.clip(TV * (1.0 - np.abs(qd) / w0), 0.0, None))
            F = np.clip(F, -np.where(qd < 0, lim, T), np.where(qd > 0, lim, T))
            ctrl = q + (F + kv * qd) / kp
            for i, d in enumerate(self.d):
                d.ctrl[:16] = ctrl[i]
                mujoco.mj_step(m, d, 1)
        self.prev_a, self.last_a = self.last_a, a.copy()
        self.t += 1
        s = self._state()
        grav, ang, lin, q, qd, pz, up, ca = s
        tau = np.array([d.actuator_force[:16] for d in self.d])
        lin_z = np.array([d.qvel[2] for d in self.d])          # pelvis rising speed (world), m/s
        risen = pz > 0.62
        rt = dict(height=np.clip((pz - 0.52) / (STAND_Z - 0.52), 0, 1),
                  upright=np.clip((up - 0.8) / 0.2, -1, 1),
                  balance=np.maximum(0.0, np.abs(ca - 0.03) - 0.07) * risen,
                  stand=((pz > STAND_Z - 0.03) & (up > 0.95) & (np.abs(ca - 0.03) < 0.07)).astype(float),
                  effort=np.sum(tau ** 2, 1),
                  action_rate=np.sum((self.last_a - self.prev_a) ** 2, 1),
                  alive=np.ones(M),
                  speed_limit=np.sum(np.clip(np.abs(qd) - 0.85 * self.ts[2], 0, None) ** 2, 1),
                  rise_rate=np.clip(lin_z - 0.8, 0, None) ** 2)
        fell = (up < 0.5) | (pz < 0.3)
        rt["fall"] = fell.astype(float)
        r = np.zeros(M)
        for k, v in rt.items():
            r += self.w[k] * v
            self.term_sum[k] = self.term_sum.get(k, 0.0) + float(self.w[k] * v.sum() * DT)
        self.term_n += M
        r = r * DT
        self.ep_ret += r
        timeout = self.t >= EP_LEN
        done = fell | timeout
        obs, critic = self._obs(s)
        for i in np.where(done)[0]:
            self.done_stats.append((self.ep_ret[i], self.t[i], float(fell[i]), 0, 0))
            self._reset(i)
        if done.any():
            obs, critic = self.observe()
        return obs, critic, r.astype(np.float32), done, timeout & ~fell


OBS_DIM, CRITIC_DIM, ACT_DIM = 3 + 3 + 16 * 3 + 1, 3 + 3 + 16 * 3 + 1 + 1 + 1 + 3, 16
