"""Motion-tracking environments: the G1 copies 3-second windows of the retargeted library, in MuJoCo, on the CPU.

Each episode starts at a window anywhere in any clip, with the robot placed in the reference pose (reference-state
initialisation, the plan's idea 5). The policy outputs a correction on top of the next reference pose (PD target =
reference + 0.25 x action), so a zero action already means "do what the clip does"; reinforcement learning only
has to add balance. Episodes end early when the robot strays (mean keypoint error over 0.5 m) or falls, and every
episode end reports (window, failed?) so the trainer can sample hard windows more often.

Lean (idea 6): 50 Hz control, 4 physics steps of 5 ms, feet-only contact, no rendering. Vectorised over processes
by vec.py.
"""
from __future__ import annotations

import hashlib

import numpy as np

from . import g1 as G

DECIM = 4
EP_LEN = 150                         # 3 s episodes
ACTION_SCALE = 0.25
TERM_ERR = 0.5                       # m, mean keypoint error that ends an episode


def quat_rotate_inv(q, v):
    """Rotate vectors v [3] by the inverse of unit quaternion q (w, x, y, z)."""
    w, x, y, z = q
    u = np.array([x, y, z])
    t = 2.0 * np.cross(-u, v)
    return v + w * t + np.cross(-u, t)


def yaw_of(q):
    w, x, y, z = q
    return np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


def eval_clip(name):
    """About 1 clip in 20 is held out for evaluation, chosen by its name (stable across runs and machines)."""
    return int(hashlib.md5(str(name).encode()).hexdigest(), 16) % 20 == 0


class Library:
    def __init__(self, path):
        z = np.load(path, allow_pickle=True)
        self.fps = float(z["fps"])
        for k in ("q", "qd", "root_pos", "root_quat", "root_vel", "clip_start", "clip_len", "clip_name", "win_clip",
                  "win_start", "win_weight", "win_family"):
            setattr(self, k, z[k])
        self.n_families = int(self.win_family.max()) + 1
        ev = np.array([eval_clip(n) for n in self.clip_name])
        if ev.all() or not ev.any():                    # tiny libraries: evaluate on everything
            ev = np.zeros_like(ev) if ev.all() else ev
        self.clip_eval = ev
        self.win_eval = ev[self.win_clip]


class TrackEnvs:
    def __init__(self, lib_path, M=16, family=None, split="train", seed=0):
        import mujoco
        self.mj = mujoco
        self.lib = Library(lib_path)
        self.m = G.load_model()
        self.M = M
        self.d = [mujoco.MjData(self.m) for _ in range(M)]
        self.ref = [mujoco.MjData(self.m) for _ in range(M)]
        self.names, self.qadr, self.vadr, self.rng, self.kp = G.joint_info(self.m)
        self.nj = len(self.names)
        self.site = [self.m.site(f"kp_{k}").id for k in G.KEYPOINT_SITES]
        self.pelvis = self.m.body("pelvis").id
        self.rs = np.random.default_rng(seed)
        lib = self.lib
        ok = (lib.win_start + 20 < lib.clip_len[lib.win_clip])
        ok &= (lib.win_eval if split == "eval" else ~lib.win_eval) if lib.win_eval.any() else ok
        if family is not None:
            ok &= lib.win_family == family
        self.windows = np.where(ok)[0]
        if len(self.windows) == 0:
            raise ValueError(f"no windows for family {family} ({split})")
        self.base_w = lib.win_weight[self.windows].astype(np.float64)
        self.set_weights(np.ones(len(self.windows)))
        self.win = np.zeros(M, int)
        self.clip = np.zeros(M, int)
        self.t0 = np.zeros(M, int)
        self.t = np.zeros(M, int)
        self.last_a = np.zeros((M, self.nj), np.float32)
        self.ep_ret = np.zeros(M)
        for i in range(M):
            self._reset(i)

    # -------------------------------------------------------------------------------------------- sampling
    def set_weights(self, factor):
        """factor per window (e.g. 0.2 + failure rate) multiplies the novelty weight."""
        w = self.base_w * np.asarray(factor, np.float64)
        self.p = w / w.sum()

    def _frame(self, i, t):
        lib = self.lib
        c = self.clip[i]
        f = lib.clip_start[c] + min(t, lib.clip_len[c] - 1)
        return f

    def _reset(self, i):
        lib = self.lib
        k = self.rs.choice(len(self.windows), p=self.p)
        w = self.windows[k]
        self.win[i] = w
        self.clip[i] = lib.win_clip[w]
        self.t0[i] = lib.win_start[w]
        self.t[i] = 0
        f = self._frame(i, self.t0[i])
        d = self.d[i]
        self.mj.mj_resetData(self.m, d)
        d.qpos[0:3] = lib.root_pos[f]
        d.qpos[3:7] = lib.root_quat[f]
        d.qpos[self.qadr] = lib.q[f]
        d.qvel[0:3] = lib.root_vel[f]
        d.qvel[self.vadr] = lib.qd[f]
        d.ctrl[:] = lib.q[f]
        self.mj.mj_forward(self.m, d)
        self.last_a[i] = 0
        self.ep_ret[i] = 0

    def _set_ref(self, i, f):
        r = self.ref[i]
        lib = self.lib
        r.qpos[0:3] = lib.root_pos[f]
        r.qpos[3:7] = lib.root_quat[f]
        r.qpos[self.qadr] = lib.q[f]
        self.mj.mj_kinematics(self.m, r)
        return r

    # ------------------------------------------------------------------------------------------ observations
    def _obs_one(self, i):
        lib, d = self.lib, self.d[i]
        fn = self._frame(i, self.t0[i] + self.t[i] + 1)
        quat = d.qpos[3:7]
        grav = quat_rotate_inv(quat, np.array([0.0, 0.0, -1.0]))
        angv = d.qvel[3:6]                                   # body frame for a free joint
        q, qd = d.qpos[self.qadr], d.qvel[self.vadr]
        qref = lib.q[fn]
        r = self._set_ref(i, fn)
        yaw = yaw_of(quat)
        cy, sy = np.cos(yaw), np.sin(yaw)
        Rh = np.array([[cy, sy, 0], [-sy, cy, 0], [0, 0, 1.0]])         # world -> own heading frame
        pel = d.xpos[self.pelvis]
        kref = (r.site_xpos[self.site] - pel) @ Rh.T                     # reference keypoints, from my pelvis, my heading
        kme = (d.site_xpos[self.site] - pel) @ Rh.T
        vref = Rh @ lib.root_vel[fn]
        gref = quat_rotate_inv(lib.root_quat[fn], np.array([0, 0, -1.0]))   # gravity in the reference's body frame
        obs = np.concatenate([grav, angv * 0.25, q, qd * 0.05, self.last_a[i], qref, qref - q,
                              [lib.root_pos[fn][2] - pel[2]], vref, gref, kref.ravel()])
        vlin = Rh @ d.qvel[0:3]
        critic = np.concatenate([obs, vlin, (kref - kme).ravel()])
        return obs, critic

    def observe(self):
        o, c = zip(*[self._obs_one(i) for i in range(self.M)])
        o, c = np.array(o, np.float32), np.array(c, np.float32)
        return np.clip(np.nan_to_num(o), -100, 100), np.clip(np.nan_to_num(c), -100, 100)

    # ----------------------------------------------------------------------------------------------- step
    def step(self, actions):
        actions = np.clip(np.nan_to_num(np.asarray(actions, np.float32)), -6.0, 6.0)
        lib = self.lib
        rew = np.zeros(self.M, np.float32)
        done = np.zeros(self.M, bool)
        trunc = np.zeros(self.M, bool)
        ends = []
        for i in range(self.M):
            d = self.d[i]
            fn = self._frame(i, self.t0[i] + self.t[i] + 1)
            target = np.clip(lib.q[fn] + ACTION_SCALE * actions[i], self.rng[:, 0], self.rng[:, 1])
            d.ctrl[:] = target
            for _ in range(DECIM):
                self.mj.mj_step(self.m, d)
            self.t[i] += 1
            bad = not (np.isfinite(d.qpos).all() and np.isfinite(d.qvel).all()) or np.abs(d.qvel).max() > 200
            r = self._set_ref(i, fn)
            if bad:
                rew[i], done[i] = -1.0, True
            else:
                e_q = np.sum((d.qpos[self.qadr] - lib.q[fn]) ** 2)
                e_k = np.mean(np.sum((d.site_xpos[self.site] - r.site_xpos[self.site]) ** 2, axis=1))
                e_root = np.sum((d.qpos[0:3] - lib.root_pos[fn]) ** 2)
                e_v = np.sum((d.qvel[0:3] - lib.root_vel[fn]) ** 2)
                smooth = np.sum((actions[i] - self.last_a[i]) ** 2)
                rew[i] = (0.5 * np.exp(-0.5 * e_q) + 0.3 * np.exp(-20.0 * e_k) + 0.1 * np.exp(-4.0 * e_root)
                          + 0.1 * np.exp(-2.0 * e_v) - 0.005 * smooth)
                k_err = np.sqrt(e_k)
                fell = d.xpos[self.pelvis][2] < 0.25
                if (self.t[i] > 3 and k_err > TERM_ERR) or fell:
                    done[i] = True
                    rew[i] -= 1.0
            self.last_a[i] = actions[i]
            self.ep_ret[i] += rew[i]
            clip_end = self.t0[i] + self.t[i] + 2 >= lib.clip_len[self.clip[i]]
            if not done[i] and (self.t[i] >= EP_LEN or clip_end):
                done[i] = trunc[i] = True
            if done[i]:
                ends.append((int(self.win[i]), bool(not trunc[i]), float(self.ep_ret[i]), int(self.t[i]),
                             int(lib.win_family[self.win[i]])))
                self._reset(i)
        obs, critic = self.observe()
        fam = lib.win_family[self.win].astype(np.int32)
        return obs, critic, rew, done, trunc, ends, fam

    def obs_dims(self):
        o, c = self._obs_one(0)
        return len(o), len(c)
