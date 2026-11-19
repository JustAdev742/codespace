"""Walking anywhere without training: footsteps from the intent, a balanced centre-of-mass path from ZMP preview
control, and the whole-body controller (wbc.py) to carry it out.

* FootstepPlanner turns a walking command (forward / sideways speed, turning rate) into footsteps: alternating feet,
  a fixed rhythm (0.45 s on one foot, 0.1 s on both), step length = speed x step time, the hip width apart.
* ZMPPreview (Kajita et al. 2003, the method behind ASIMO-era and HRP walking) treats the body as a pendulum of
  constant height and plans the centre-of-mass path that keeps the zero-moment point - the centre of pressure under
  the feet - on the planned footsteps, looking 1.6 s ahead. A path that does so cannot tip the robot over.
* swing feet follow smooth arcs from one footstep to the next.

The legs come from this plan; the rest of the body (arms, waist, style) can come from human motion (matching.py).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.linalg import solve_discrete_are

G_ACC = 9.81
SOLE_FWD = 0.035                  # the middle of the G1's sole, ahead of the ankle


@dataclass
class Step:
    side: str                 # the foot that is on the ground for this step ("left" or "right")
    pos: np.ndarray           # [x, y] where it stands
    yaw: float


class ZMPPreview:
    """Cart-table model: state (c, c', c'') per axis, input = jerk, output = ZMP p = c - (zc/g) c''."""

    def __init__(self, zc, dt=0.01, horizon=1.6, qe=1.0, r=1e-6):
        self.dt, self.zc = dt, zc
        self.N = int(horizon / dt)
        A = np.array([[1, dt, dt * dt / 2], [0, 1, dt], [0, 0, 1]])
        B = np.array([[dt ** 3 / 6], [dt * dt / 2], [dt]])
        C = np.array([[1, 0, -zc / G_ACC]])
        # augmented system with the integral of the ZMP error (Katayama's preview servo, as in Kajita 2003)
        Aa = np.block([[np.eye(1), C @ A], [np.zeros((3, 1)), A]])
        Ba = np.vstack([C @ B, B])
        Q = np.zeros((4, 4))
        Q[0, 0] = qe
        P = solve_discrete_are(Aa, Ba, Q, np.array([[r]]))
        K = np.linalg.solve(r + Ba.T @ P @ Ba, Ba.T @ P @ Aa)
        self.Gi, self.Gx = K[0, 0], K[0, 1:]
        Ac = Aa - Ba @ K
        X = -Ac.T @ P @ np.vstack([[1], np.zeros((3, 1))])
        self.Gd = np.zeros(self.N)
        self.Gd[0] = -self.Gi
        for j in range(1, self.N):
            self.Gd[j] = float(np.linalg.solve(r + Ba.T @ P @ Ba, Ba.T @ X)[0, 0])
            X = Ac.T @ X
        self.A, self.B, self.C = A, B, C
        self.x = np.zeros((3, 2))           # columns: x axis, y axis
        self.e = np.zeros(2)

    def reset(self, c_xy):
        self.x[:] = 0
        self.x[0] = c_xy
        self.e[:] = 0

    def step(self, zmp_future):
        """zmp_future [N, 2]: the planned ZMP from now on. Advances one dt; returns (c, c', c'') [3, 2]."""
        p_now = (self.C @ self.x)[0]
        self.e += p_now - zmp_future[0]
        u = -self.Gi * self.e - self.Gx @ self.x - self.Gd @ zmp_future
        self.x = self.A @ self.x + self.B * u
        return self.x.copy()


class FootstepPlanner:
    def __init__(self, width=0.24, t_single=0.45, t_double=0.10, max_step=0.22, max_side=0.12, max_turn=0.35):
        self.width, self.ts, self.td = width, t_single, t_double
        self.max_step, self.max_side, self.max_turn = max_step, max_side, max_turn

    def plan(self, left, right, first_swing, cmd, n):
        """n future steps after the current stance. left/right: (pos [2], yaw). Returns [Step] (the stance foot of
        each step, in order) starting with the foot that stays down while first_swing moves."""
        vx, vy, wz = cmd
        T = self.ts + self.td
        feet = {"left": (np.array(left[0], float), left[1]), "right": (np.array(right[0], float), right[1])}
        steps = []
        swing = first_swing
        for k in range(n):
            stance = "right" if swing == "left" else "left"
            sp, syaw = feet[stance]
            steps.append(Step(stance, sp.copy(), syaw))
            # where the swing foot goes: from the stance foot, ahead by the step, out by the width, turned
            dyaw = np.clip(wz * T, -self.max_turn, self.max_turn)
            yaw = syaw + dyaw
            dx = np.clip(vx * T, -self.max_step * 0.6, self.max_step)
            dy = np.clip(vy * T, -self.max_side, self.max_side)
            side_sign = 1.0 if swing == "left" else -1.0
            # sideways: every step shifts by dy; the feet never come closer than 16 cm
            lat = side_sign * self.width + dy
            lat = side_sign * max(0.16, side_sign * lat)
            c, s = math.cos(yaw), math.sin(yaw)
            off = np.array([dx, lat])
            feet[swing] = (sp + np.array([c * off[0] - s * off[1], s * off[0] + c * off[1]]), yaw)
            swing = stance
        return steps, feet


class Walker:
    """Generates the whole lower-body plan, step by step: stance, swing-foot targets and the balanced CoM path."""

    def __init__(self, zc=0.62, dt=0.01, step_height=0.06, ankle_up=0.035):
        self.planner = FootstepPlanner()
        self.zmp = ZMPPreview(zc, dt)
        self.dt, self.zc, self.h, self.ankle_up = dt, zc, step_height, ankle_up
        self.cmd = np.zeros(3)
        self.t = 0.0
        self.phase_t = 0.0
        self.walking = False

    def start(self, left_pos, left_yaw, right_pos, right_yaw, com_xy):
        self.feet = {"left": (np.array(left_pos[:2]), left_yaw), "right": (np.array(right_pos[:2]), right_yaw)}
        self.swing = "right"                 # the first foot to move
        self.zmp.reset(com_xy)
        self.phase_t = 0.0
        self.in_double = True
        self.lift = {"left": None, "right": None}
        self.target = None
        self.standing = True
        self.td_first = 0.5                     # the first weight shift, from standing, takes its time

    def set_command(self, vx=0.0, vy=0.0, wz=0.0):
        self.cmd_goal = np.array([vx, vy, wz], float)

    def _zmp_sequence(self):
        """Planned ZMP for the preview horizon, from the current phase and the planned footsteps."""
        N, dt = self.zmp.N, self.dt
        ts, td = self.planner.ts, self.planner.td
        moving = np.linalg.norm(self.cmd) > 1e-3 or not self.standing
        out = np.zeros((N, 2))
        mid = 0.5 * (self.feet["left"][0] + self.feet["right"][0])
        my = 0.5 * (self.feet["left"][1] + self.feet["right"][1])
        mid = mid + SOLE_FWD * np.array([math.cos(my), math.sin(my)])
        if not moving:
            out[:] = mid
            return out, None
        stance_now = "left" if self.swing == "right" else "right"
        if self.in_double or self.target is None:
            steps, _ = self.planner.plan(self.feet["left"], self.feet["right"], self.swing, self.cmd, 6)
        else:
            # mid-step: the swing foot is committed to its landing spot; plan the rest from there
            feet2 = dict(self.feet)
            feet2[self.swing] = self.target
            rest, _ = self.planner.plan(feet2["left"], feet2["right"], stance_now, self.cmd, 5)
            st0 = self.feet[stance_now]
            steps = [Step(stance_now, st0[0].copy(), st0[1])] + rest
        # timeline: [double (td) | single on steps[0].side (ts)] | [double | single on steps[1]] ...
        t = self.phase_t
        seq = []
        sole = lambda st: st.pos + SOLE_FWD * np.array([math.cos(st.yaw), math.sin(st.yaw)])   # middle of the sole
        prev = mid if self.in_double else self.feet[stance_now][0]
        td0 = self.td_first if self.in_double else td
        for k, st in enumerate(steps):
            seq.append(("double", td0 if k == 0 else td, prev, sole(st)))
            seq.append(("single", ts, sole(st), sole(st)))
            prev = sole(st)
        # current position in the timeline
        T0 = 0.0 if self.in_double else td0
        tt = T0 + t
        for n in range(N):
            time = tt + n * dt
            acc = 0.0
            for kind, dur, a, b in seq:
                if time < acc + dur:
                    f = (time - acc) / dur
                    out[n] = a + (b - a) * (f if kind == "double" else 1.0)
                    break
                acc += dur
            else:
                out[n] = seq[-1][3]
        return out, steps

    def update(self):
        """Advance dt. Returns dict(com [3], com_vel, com_acc, stance {side: bool}, swing {side: (pos, vel, yaw)},
        pelvis_yaw)."""
        dt = self.dt
        # ease into a new command, like a person changing direction (0.6 m/s^2, 1.5 rad/s^2)
        goal = getattr(self, "cmd_goal", self.cmd)
        lim = np.array([0.6, 0.6, 1.5]) * dt
        self.cmd = self.cmd + np.clip(goal - self.cmd, -lim, lim)
        if np.linalg.norm(goal) < 1e-3 and np.linalg.norm(self.cmd) < 0.02:
            self.cmd[:] = 0.0
        zseq, steps = self._zmp_sequence()
        x = self.zmp.step(zseq)
        com = np.array([x[0, 0], x[0, 1], self.zc])
        com_vel = np.array([x[1, 0], x[1, 1], 0.0])
        com_acc = np.array([x[2, 0], x[2, 1], 0.0])
        stance = {"left": True, "right": True}
        swing = {}
        moving = steps is not None
        if moving:
            self.standing = False
            self.phase_t += dt
            ts, td = self.planner.ts, self.planner.td
            if self.in_double and self.phase_t >= self.td_first:
                self.in_double, self.phase_t = False, 0.0
                self.td_first = td
                # the swing foot's target: where the planner puts it
                _, feet_after = self.planner.plan(self.feet["left"], self.feet["right"], self.swing, self.cmd, 1)
                self.target = feet_after[self.swing]
                self.lift_from = (self.feet[self.swing][0].copy(), self.feet[self.swing][1])
            if not self.in_double:
                s = self.swing
                stance[s] = False
                f = min(self.phase_t / ts, 1.0)
                sm = f * f * (3 - 2 * f)                  # smoothstep: starts and stops gently
                dsm = 6 * f * (1 - f) / ts
                p0, y0 = self.lift_from
                p1, y1 = self.target
                pos = p0 + (p1 - p0) * sm
                vel = (p1 - p0) * dsm
                z = self.ankle_up + self.h * math.sin(math.pi * f)
                vz = self.h * math.pi / ts * math.cos(math.pi * f)
                yaw = y0 + (y1 - y0) * sm
                swing[s] = (np.array([pos[0], pos[1], z]), np.array([vel[0], vel[1], vz]), yaw)
                if self.phase_t >= ts:                  # touchdown
                    self.feet[s] = (p1.copy(), y1)
                    self.swing = "left" if s == "right" else "right"
                    self.in_double, self.phase_t = True, 0.0
                    if np.linalg.norm(self.cmd) < 1e-3:
                        self.standing = True
                        self.td_first = 0.5             # the next start shifts the weight slowly again
        yl, yr = self.feet["left"][1], self.feet["right"][1]
        pelvis_yaw = math.atan2(math.sin(yl) + math.sin(yr), math.cos(yl) + math.cos(yr))
        return dict(com=com, com_vel=com_vel, com_acc=com_acc, stance=stance, swing=swing, pelvis_yaw=pelvis_yaw)
