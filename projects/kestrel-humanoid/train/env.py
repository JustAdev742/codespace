"""Vectorised KESTREL K1 locomotion environments (one worker process = M envs sharing a model).

Isaac-Lab-style velocity-tracking task, re-implemented on CPU MuJoCo:
  observations (actor, 124): base angular velocity (IMU), projected gravity, command (vx, vy, wz),
      gait clock (sin, cos), 12 joint positions (rel. default), 12 joint velocities, last action,
      11x7 height scan
  critic adds: base linear velocity, foot friction, motor-strength scale (privileged, 129)
  actions (12): leg joint position offsets x 0.25 rad (clipped to +-8) -> PD position servos at 200 Hz whose force
      limits are the sized actuator peaks (train/model.py)
  rewards: velocity tracking, posture/smoothness/torque penalties, biped feet air time, foot slip,
      joint and actuator-speed limits, termination, and a gait clock (as in unitree_rl_gym / Humanoid-Gym):
      foot contact should follow a 0.8 s alternating phase while a speed is commanded (both feet down at
      zero command), the swing foot should clear the terrain under it by at least 0.08 m, and the legs are drawn
      towards a clock-driven reference swing pose (Humanoid-Gym), which gives the dense signal that lets a
      few hundred CPU environments discover stepping. Without the clock the
      policy settles on standing still, which earns the survival and part of the tracking reward.
  curriculum: terrain row (difficulty) up/down by distance walked; randomisation of friction,
      added mass, motor strength, pushes, action latency and sensor noise
"""
from __future__ import annotations

import numpy as np
import mujoco

import model as KM
import terrain as T

DT_SIM, DECIM = 0.005, 4
DT = DT_SIM * DECIM               # 50 Hz policy
EP_LEN = 1000                     # 20 s
PROMOTE_MIN = 1.5                 # m, curriculum promotion floor for slow commands (see step())
ACTION_SCALE = 0.25
ACTION_CLIP = 8.0                 # x 0.25 = +-2 rad offsets (joint limits still apply); +-4 clipped ankle and knee on 18 cm stairs
OBS_DIM, CRITIC_DIM, ACT_DIM = 124, 129, 12
SCAN_X = np.linspace(-0.4, 0.8, 11)
SCAN_Y = np.linspace(-0.3, 0.3, 7)

# weights follow Isaac Lab's humanoid velocity configs (H1/G1 rough) where a term exists there; every term
# is multiplied by the policy step DT, as Isaac Lab's reward manager does
W = dict(track_lin=1.0, track_ang=0.5, lin_z=-0.2, ang_xy=-0.05, orient=-1.0, torque=-2e-6, dof_acc=-2.5e-7,
         action_rate=-0.01, air_time=0.25, slide=-0.2, hip_dev=-0.2, limits=-1.0, speed_limit=-0.02, termination=-20.0,
         alive=0.15, gait_contact=0.3, swing_height=-10.0, ref_gait=1.0)
# reward schedule (train.py): the reference swing pose teaches stepping, then gives way to velocity tracking
# so the stride can lengthen: ref_gait 1.0 -> 0.3 and track_lin 1.0 -> 1.5, linearly between these step counts
SCHEDULE = dict(start=15e6, end=25e6, ref_gait=(1.0, 0.3), track_lin=(1.0, 1.5))
AIR_T = 0.4                       # biped air-time reward saturates at 0.4 s (Isaac Lab threshold)
GAIT_PERIOD, STANCE = KM.GAIT["period"], KM.GAIT["stance"]   # s; fraction of the period each foot is down (K1/S1 0.8 s, 0.55)
# reference swing pose from the gait clock (Humanoid-Gym's joint_pos term): offsets from the default stance at
# mid-swing for hip pitch, knee, ankle pitch. Hip -a, knee +2a, ankle -a keeps the sole level and lifts it ~8 cm.
REF_SWING = np.array([-0.25, 0.50, -0.25])
SWING_CLEAR = 0.08                # m, minimum sole clearance above the terrain under the swing foot
# (-10 x 0.08^2 = 0.064 < 0.3: a barely lifted foot already gains reward, so stepping can be found by
#  small exploratory lifts; with 0.10 m and -20 a small lift cost more than it earned. The contact term is
#  0.3 per foot instead of unitree_rl_gym's 0.18 so stepping clearly beats standing with few samples)


def quat_rotate_inv(q, v):
    """Rotate vectors v (N,3) by the inverse of unit quaternions q (N,4, w first)."""
    w, x, y, z = q[:, 0:1], q[:, 1:2], q[:, 2:3], q[:, 3:4]
    qv = np.concatenate([x, y, z], 1)
    t = 2.0 * np.cross(qv, v)
    return v - w * t + np.cross(qv, t)


def yaw_of(q):
    w, x, y, z = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
    return np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


class Envs:
    def __init__(self, M=32, seed=0, terrain_seed=0, max_row=None, cmd_scale=None, curriculum=True, randomize=True,
                 cols=None, delay_prob=0.0):
        self.rng = np.random.default_rng(seed)
        self.H = T.make(terrain_seed)
        self.hs = T.HeightSampler(self.H)
        self.m = KM.build_model(self.H)
        self.M = M
        self.d = [mujoco.MjData(self.m) for _ in range(M)]
        self.curriculum, self.randomize = curriculum, randomize
        self.max_row = T.ROWS - 1 if max_row is None else max_row
        self.cmd_scale = KM.GAIT["cmd_scale"] if cmd_scale is None else cmd_scale
        self.delay_prob = delay_prob if randomize else 0.0
        self.cols = list(range(T.COLS)) if cols is None else list(cols)
        m = self.m
        self.qadr = np.array([m.joint(j).qposadr[0] for j in KM.LEG_JOINTS])
        self.vadr = np.array([m.joint(j).dofadr[0] for j in KM.LEG_JOINTS])
        self.default = np.array([KM.DEFAULT[j[2:]] for j in KM.LEG_JOINTS])
        self.lo = np.array([m.joint(j).range[0] for j in KM.LEG_JOINTS])
        self.hi = np.array([m.joint(j).range[1] for j in KM.LEG_JOINTS])
        _, Wn = KM.joint_limits()
        self.w_lim = np.array([Wn[j[2:]] for j in KM.LEG_JOINTS])
        ts = KM.torque_speed()          # motor torque-speed lines (scrap and fast builds), applied every physics step
        self.ts = None if ts is None else np.array([ts[j[2:]] for j in KM.LEG_JOINTS]).T     # 4 x 12: T, T_V, w0, T_cont
        self.foot_geoms = [[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_GEOM, f"{s}_foot_c{i}") for i in range(4)] for s in "lr"]
        self.sole_site = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_SITE, f"{s}_sole") for s in "lr"]
        self.hip_dev_idx = np.array([0, 1, 6, 7])
        self.base_kp = m.actuator_gainprm[:, 0].copy()
        self.base_kv = -m.actuator_biasprm[:, 2].copy()
        self.base_mass = m.body_mass[1]
        self.motor_scale = 1.0
        self.friction = 1.0
        # per-env state
        self.cmd = np.zeros((M, 3))
        self.t = np.zeros(M, int)
        self.last_a = np.zeros((M, ACT_DIM))
        self.prev_a = np.zeros((M, ACT_DIM))
        self.delay = np.zeros(M, bool)
        self.air = np.zeros((M, 2))
        self.stance = np.zeros((M, 2))
        self.contact = np.ones((M, 2), bool)
        self.row = np.zeros(M, int)
        self.col = np.zeros(M, int)
        self.start_xy = np.zeros((M, 2))
        self.push_t = np.zeros(M, int)
        self.cmd_t = np.zeros(M, int)
        self.prev_qvel = np.zeros((M, ACT_DIM))
        self.ep_ret = np.zeros(M)
        self.done_stats = []
        self.term_sum, self.term_n = {}, 0     # per-term reward sums (x DT) since the last stats call
        self.w = dict(W)                       # live weights (train.py anneals some of them)
        for i in range(M):
            self.row[i] = 0 if curriculum else self.rng.integers(0, self.max_row + 1)
            self._reset(i)

    # ------------------------------------------------------------------ randomisation
    def randomize_model(self):
        if not self.randomize:
            return
        m = self.m
        self.friction = self.rng.uniform(0.4, 1.25)
        for gs in self.foot_geoms:
            for g in gs:
                m.geom_friction[g, 0] = self.friction
        self.motor_scale = self.rng.uniform(0.88, 1.12)
        kp = self.base_kp * self.motor_scale
        m.actuator_gainprm[:, 0] = kp
        m.actuator_biasprm[:, 1] = -kp
        m.actuator_biasprm[:, 2] = -self.base_kv * self.rng.uniform(0.85, 1.15)
        m.body_mass[1] = self.base_mass + self.rng.uniform(-3.0, 6.0)

    def _resample_cmd(self, i):
        s = self.cmd_scale
        if self.rng.random() < 0.1:
            self.cmd[i] = 0.0
        else:
            self.cmd[i] = [self.rng.uniform(-0.4, 1.0) * s, self.rng.uniform(-0.3, 0.3) * s, self.rng.uniform(-0.6, 0.6) * s]
        self.cmd_t[i] = 0

    def _reset(self, i):
        d = self.d[i]
        mujoco.mj_resetData(self.m, d)
        self.col[i] = self.cols[self.rng.integers(0, len(self.cols))]
        cx, cy = T.tile_center(self.row[i], self.col[i])
        x, y = cx + self.rng.uniform(-0.4, 0.4), cy + self.rng.uniform(-0.4, 0.4)
        h = self.hs(np.array([x]), np.array([y]))[0]
        yaw = self.rng.uniform(-np.pi, np.pi)
        d.qpos[0:3] = [x, y, h + 0.90]
        d.qpos[3:7] = [np.cos(yaw / 2), 0, 0, np.sin(yaw / 2)]
        d.qpos[self.qadr] = self.default + self.rng.uniform(-0.05, 0.05, ACT_DIM)
        d.ctrl[:] = d.qpos[self.qadr]
        mujoco.mj_forward(self.m, d)
        self.start_xy[i] = [x, y]
        self.t[i] = 0
        self.last_a[i] = 0
        self.prev_a[i] = 0
        self.air[i] = 0
        self.stance[i] = 0
        self.contact[i] = True
        self.prev_qvel[i] = 0
        self.push_t[i] = self.rng.integers(300, 500)
        self.delay[i] = self.rng.random() < self.delay_prob     # one-step (20 ms) action latency
        self.ep_ret[i] = 0
        self._resample_cmd(i)

    # ------------------------------------------------------------------ step
    def step(self, actions):
        M = self.M
        actions = np.clip(actions, -ACTION_CLIP, ACTION_CLIP)
        applied = np.where(self.delay[:, None], self.last_a, actions)
        target = self.default + ACTION_SCALE * applied
        m = self.m
        if self.ts is None:
            for i, d in enumerate(self.d):
                d.ctrl[:] = target[i]
                mujoco.mj_step(m, d, DECIM)
        else:
            self._step_torque_speed(target)
        self.prev_a = self.last_a.copy()
        self.last_a = actions.copy()
        return self._post()

    def _step_torque_speed(self, target):
        """PD servo force capped every physics step by the motor's torque-speed line (KM.torque_speed): the position
        target is moved so MuJoCo's servo force kp (ctrl - q) - kv qd equals the capped force."""
        m = self.m
        T, TV, w0 = self.ts[:3]
        kp, kv = m.actuator_gainprm[:ACT_DIM, 0], -m.actuator_biasprm[:ACT_DIM, 2]
        for _ in range(DECIM):
            q = np.array([d.qpos[self.qadr] for d in self.d])
            qd = np.array([d.qvel[self.vadr] for d in self.d])
            F = kp * (target - q) - kv * qd
            lim = np.minimum(T, np.clip(TV * (1.0 - np.abs(qd) / w0), 0.0, None))
            F = np.clip(F, -np.where(qd < 0, lim, T), np.where(qd > 0, lim, T))
            ctrl = q + (F + kv * qd) / kp
            for i, d in enumerate(self.d):
                d.ctrl[:] = ctrl[i]
                mujoco.mj_step(m, d, 1)

    def _gather(self):
        """State of all M envs. Foot contact, position and velocity come from MuJoCo sensors (model.py):
        sensordata = [touch_l, touch_r, pos_l(3), pos_r(3), linvel_l(3), linvel_r(3)]."""
        M = self.M
        qpos = np.empty((M, self.m.nq))
        qvel = np.empty((M, self.m.nv))
        tau = np.empty((M, ACT_DIM))
        sd = np.empty((M, self.m.nsensordata))
        for i, d in enumerate(self.d):
            qpos[i] = d.qpos
            qvel[i] = d.qvel
            tau[i] = d.actuator_force
            sd[i] = d.sensordata
        touch = sd[:, 0:2] > 1.0
        foot = sd[:, 2:8].reshape(M, 2, 3)
        foot_v = sd[:, 8:14].reshape(M, 2, 3)
        return qpos, qvel, tau, foot, foot_v, touch

    def _post(self):
        M = self.M
        qpos, qvel, tau, foot, foot_v, touch = self._gather()
        quat = qpos[:, 3:7]
        lin_v = quat_rotate_inv(quat, qvel[:, 0:3])
        ang_v = qvel[:, 3:6]                      # free-joint angular velocity is in the body frame
        grav = quat_rotate_inv(quat, np.tile([0, 0, -1.0], (M, 1)))
        q = qpos[:, self.qadr]
        qd = qvel[:, self.vadr]
        qacc = (qd - self.prev_qvel) / DT
        self.prev_qvel = qd.copy()
        terr_base = self.hs(qpos[:, 0], qpos[:, 1])
        h_base = qpos[:, 2] - terr_base
        in_contact = touch                                  # MuJoCo contacts of the foot spheres
        # ---- rewards: raw terms, then r = DT * sum(W[k] * term[k])
        e_lin = np.sum((self.cmd[:, :2] - lin_v[:, :2]) ** 2, 1)
        e_ang = (self.cmd[:, 2] - ang_v[:, 2]) ** 2
        rt = {}
        rt["track_lin"] = np.exp(-e_lin / 0.25)
        rt["track_ang"] = np.exp(-e_ang / 0.25)
        rt["lin_z"] = lin_v[:, 2] ** 2
        rt["ang_xy"] = np.sum(ang_v[:, :2] ** 2, 1)
        rt["orient"] = np.sum(grav[:, :2] ** 2, 1)
        rt["torque"] = np.sum(tau ** 2, 1)
        rt["dof_acc"] = np.sum(qacc ** 2, 1)
        rt["action_rate"] = np.sum((self.last_a - self.prev_a) ** 2, 1)
        # biped air time (Isaac Lab feet_air_time_positive_biped): in single stance, reward the smaller of the
        # stance foot's contact time and the swing foot's air time, saturated at AIR_T; only when commanded to move
        self.air = np.where(in_contact, 0.0, self.air + DT)
        self.stance = np.where(in_contact, self.stance + DT, 0.0)
        mode_t = np.where(in_contact, self.stance, self.air)
        single = in_contact.sum(1) == 1
        moving = (np.linalg.norm(self.cmd[:, :2], axis=1) > 0.1) | (np.abs(self.cmd[:, 2]) > 0.2)
        rt["air_time"] = np.clip(np.where(single, mode_t.min(1), 0.0), 0, AIR_T) * moving
        self.contact = in_contact
        # gait clock: desired stance per foot from the phase; both feet down when no speed is commanded
        want = np.where(moving[:, None], self.phase() < STANCE, True)
        rt["gait_contact"] = np.sum(in_contact == want, 1).astype(float)
        clear = foot[:, :, 2] - self.hs(foot[:, :, 0].ravel(), foot[:, :, 1].ravel()).reshape(M, 2)
        # one-sided: only a swing foot LOWER than SWING_CLEAR is penalised. The terrain under the foot is the lower
        # tread until the foot crosses a riser, so a two-sided term punished the 20+ cm lift an 18 cm step needs
        rt["swing_height"] = np.sum(np.clip(SWING_CLEAR - clear, 0, None) ** 2 * ~in_contact, 1) * moving
        dq = np.linalg.norm(q - self.default - self.ref_offsets(moving), axis=1)
        rt["ref_gait"] = np.exp(-2.0 * dq) - 0.2 * np.clip(dq, 0, 0.5)
        rt["slide"] = np.sum(np.linalg.norm(foot_v[:, :, :2], axis=2) * in_contact, 1)
        rt["hip_dev"] = np.sum(np.abs(q[:, self.hip_dev_idx] - self.default[self.hip_dev_idx]), 1)
        span = self.hi - self.lo
        over = np.clip(q - (self.hi - 0.05 * span), 0, None) + np.clip((self.lo + 0.05 * span) - q, 0, None)
        rt["limits"] = np.sum(over, 1)
        rt["speed_limit"] = np.sum(np.clip(np.abs(qd) - 0.9 * self.w_lim, 0, None) ** 2, 1)
        rt["alive"] = np.ones(M)
        fell = (h_base < 0.55) | (grav[:, 2] > -0.5)
        rt["termination"] = fell.astype(float)
        r = np.zeros(M)
        for k, v in rt.items():
            r += self.w[k] * v
            self.term_sum[k] = self.term_sum.get(k, 0.0) + float(self.w[k] * v.sum() * DT)
        self.term_n += M
        r *= DT
        self.t += 1
        timeout = self.t >= EP_LEN
        done = fell | timeout
        self.ep_ret += r
        # pushes and command resampling
        self.push_t -= 1
        self.cmd_t += 1
        for i in np.where(self.push_t <= 0)[0]:
            self.d[i].qvel[0:2] += self.rng.uniform(-0.5, 0.5, 2)
            self.push_t[i] = self.rng.integers(300, 500)
        for i in np.where(self.cmd_t >= 400)[0]:
            self._resample_cmd(i)
        # ---- observations
        obs, critic = self._obs(qpos, lin_v, ang_v, grav, q, qd, terr_base)
        # ---- resets + curriculum
        info = {}
        for i in np.where(done)[0]:
            dist = np.linalg.norm(qpos[i, :2] - self.start_xy[i])
            want = np.linalg.norm(self.cmd[i, :2]) * self.t[i] * DT
            if self.curriculum:
                # promote after 2.4 m, or, when the command could not cover that in the episode (slow robots,
                # small commands), after 80 % of the commanded distance and at least 1.5 m (two stair risers)
                if dist > min(T.TILE / 2 * 0.8, max(PROMOTE_MIN, 0.8 * want)) and not fell[i]:
                    self.row[i] = min(self.row[i] + 1, self.max_row)
                elif dist < 0.4 * want:
                    self.row[i] = max(self.row[i] - 1, 0)
            self.done_stats.append((self.ep_ret[i], self.t[i], float(fell[i]), self.row[i], self.col[i]))
            self._reset(i)
        if done.any():
            qpos, qvel, tau, foot, foot_v, touch = self._gather()
            quat = qpos[:, 3:7]
            lin_v = quat_rotate_inv(quat, qvel[:, 0:3])
            grav = quat_rotate_inv(quat, np.tile([0, 0, -1.0], (M, 1)))
            obs, critic = self._obs(qpos, lin_v, qvel[:, 3:6], grav, qpos[:, self.qadr], qvel[:, self.vadr],
                                    self.hs(qpos[:, 0], qpos[:, 1]))
        return obs, critic, r.astype(np.float32), done, timeout & ~fell

    def ref_offsets(self, moving):
        """Reference joint offsets (M, 12) from the clock: a sin-shaped hip/knee/ankle flexion during each
        foot's swing (phase >= STANCE), zero in stance and whenever no motion is commanded."""
        ph = self.phase()
        s = np.clip((ph - STANCE) / (1.0 - STANCE), 0.0, 1.0)
        amp = np.where(ph >= STANCE, np.sin(np.pi * s), 0.0) * moving[:, None]     # (M, 2)
        ref = np.zeros((self.M, ACT_DIM))
        ref[:, 2:5] = amp[:, 0:1] * REF_SWING
        ref[:, 8:11] = amp[:, 1:2] * REF_SWING
        return ref

    @staticmethod
    def scheduled_weights(steps):
        a = float(np.clip((steps - SCHEDULE["start"]) / (SCHEDULE["end"] - SCHEDULE["start"]), 0.0, 1.0))
        return {k: v[0] + a * (v[1] - v[0]) for k, v in SCHEDULE.items() if k not in ("start", "end")}

    def phase(self):
        """Gait phase in [0, 1) per foot, (M, 2): left foot, and right foot half a period later."""
        p = (self.t * DT / GAIT_PERIOD) % 1.0
        return np.stack([p, (p + 0.5) % 1.0], 1)

    def _obs(self, qpos, lin_v, ang_v, grav, q, qd, terr_base):
        M = self.M
        p = 2 * np.pi * self.phase()[:, 0:1]
        yaw = yaw_of(qpos[:, 3:7])
        c, s = np.cos(yaw), np.sin(yaw)
        gx, gy = np.meshgrid(SCAN_X, SCAN_Y, indexing="ij")
        gx, gy = gx.ravel(), gy.ravel()
        px = qpos[:, 0:1] + c[:, None] * gx - s[:, None] * gy
        py = qpos[:, 1:2] + s[:, None] * gx + c[:, None] * gy
        heights = self.hs(px.ravel(), py.ravel()).reshape(M, -1)
        scan = np.clip(qpos[:, 2:3] - 0.88 - heights, -1, 1)
        clean = np.concatenate([ang_v * 0.25, grav, self.cmd * np.array([2.0, 2.0, 0.25]), np.sin(p), np.cos(p),
                                q - self.default, qd * 0.05, self.last_a, scan], 1)
        noise = np.concatenate([self.rng.uniform(-0.05, 0.05, (M, 3)), self.rng.uniform(-0.05, 0.05, (M, 3)), np.zeros((M, 5)),
                                self.rng.uniform(-0.01, 0.01, (M, 12)), self.rng.uniform(-0.075, 0.075, (M, 12)), np.zeros((M, 12)),
                                self.rng.uniform(-0.05, 0.05, (M, scan.shape[1]))], 1)
        obs = clean + noise if self.randomize else clean
        priv = np.concatenate([lin_v * 2.0, np.full((M, 1), self.friction), np.full((M, 1), self.motor_scale)], 1)
        critic = np.concatenate([clean, priv], 1)
        return obs.astype(np.float32), critic.astype(np.float32)

    def observe(self):
        qpos, qvel, tau, foot, foot_v, touch = self._gather()
        quat = qpos[:, 3:7]
        lin_v = quat_rotate_inv(quat, qvel[:, 0:3])
        grav = quat_rotate_inv(quat, np.tile([0, 0, -1.0], (self.M, 1)))
        return self._obs(qpos, lin_v, qvel[:, 3:6], grav, qpos[:, self.qadr], qvel[:, self.vadr], self.hs(qpos[:, 0], qpos[:, 1]))
