"""Whole-body balance controller for the G1: follows any reference motion with physics, no training.

Every control step (500 Hz) one small quadratic programme (QP) chooses the joint accelerations qdd and the foot contact
forces f that

* obey the robot's true dynamics (its floating body can only be pushed by the floor: M qdd + h = S'tau + Jc'f, whose
  first six rows hold without any motor),
* keep the stance feet still (no slipping) with forces inside the friction cone (mu = 0.8) and pressing, not pulling,
* stay within every motor's torque limit,

and that best follow, in weighted order: the centre of mass kept over the feet (balance first), the pelvis
orientation, swing-foot paths, and the reference joint angles (the motion itself). When a reference is not balanced
for this body, balance wins and the motion is bent just enough. The torques then come straight from the dynamics.

This is task-space inverse dynamics, as used on full-size humanoids (de Lasa 2010; Atlas and Valkyrie controllers;
TSID/Pinocchio), written here for MuJoCo with a dense QP solver (quadprog, about 0.3 ms per step).
"""
from __future__ import annotations

import math

import numpy as np
import quadprog

from . import g1 as G

MU = 0.8
FZ_MIN = 0.0


def quat_err(q_des, q):
    """Rotation vector (world frame) that takes orientation q to q_des."""
    import mujoco
    neg = np.zeros(4)
    mujoco.mju_negQuat(neg, q)
    dq = np.zeros(4)
    mujoco.mju_mulQuat(dq, q_des, neg)
    if dq[0] < 0:
        dq = -dq
    v = np.zeros(3)
    mujoco.mju_quat2Vel(v, dq, 1.0)
    return v


class WBC:
    def __init__(self, m, w_com=(100.0, 100.0, 20.0), w_pelvis=50.0, w_posture=1.0, w_swing=150.0,
                 kp_com=40.0, kp_rot=150.0, kp_q=100.0, kp_swing=400.0):
        import mujoco
        self.mj = mujoco
        self.m = m
        self.nv = m.nv
        self.names, self.qadr, self.vadr, self.rng, _ = G.joint_info(m)
        self.nj = len(self.names)
        self.tau_lim = np.array([m.actuator_ctrlrange[i, 1] for i in range(m.nu)])
        self.pelvis = m.body("pelvis").id
        self.feet = {s: m.body(f"{s}_ankle_roll_link").id for s in ("left", "right")}
        self.points = {s: [m.geom(f"{s}_foot_{i}").id for i in range(4)] for s in ("left", "right")}
        self.r_sphere = float(m.geom_size[self.points["left"][0]][0])
        self.w_com, self.w_pelvis, self.w_posture, self.w_swing = np.array(w_com), w_pelvis, w_posture, w_swing
        self.kp_com, self.kd_com = kp_com, 2 * math.sqrt(kp_com)
        self.kp_rot, self.kd_rot = kp_rot, 2 * math.sqrt(kp_rot)
        self.kp_q, self.kd_q = kp_q, 2 * math.sqrt(kp_q)
        self.kp_sw, self.kd_sw = kp_swing, 2 * math.sqrt(kp_swing)
        self.prevJ = {}
        self.w_even = 1e-3
        self.M = np.zeros((self.nv, self.nv))
        self.last_ok = True
        self.hard_contacts = False
        self.w_contact = 1e4
        self.w_angmom = 0.0              # whole-body spin (angular momentum about the vertical) damping task
        self.kd_angmom = 10.0
        self._bodies = np.arange(1, m.nbody)
        self._jp, self._jr = np.zeros((3, self.nv)), np.zeros((3, self.nv))
        self.tau_last = np.zeros(m.nu)

    # ------------------------------------------------------------------------------------------- jacobians
    def _jac_point(self, d, body, point):
        jp = np.zeros((3, self.nv))
        self.mj.mj_jac(self.m, d, jp, None, point, body)
        return jp

    def _jac_body6(self, d, body):
        jp, jr = np.zeros((3, self.nv)), np.zeros((3, self.nv))
        self.mj.mj_jacBody(self.m, d, jp, jr, body)
        return np.vstack([jp, jr])

    def _djqd(self, key, J, qd, dt):
        """J-dot times q-dot, by finite difference of the Jacobian between control steps."""
        prev = self.prevJ.get(key)
        self.prevJ[key] = J.copy()
        if prev is None or prev.shape != J.shape:
            return np.zeros(J.shape[0])
        return (J - prev) @ qd / dt

    def contact_points(self, d, side):
        return [d.geom_xpos[g] - np.array([0, 0, self.r_sphere]) for g in self.points[side]]

    def angmom_z_jac(self, d, c):
        """Row A_z with L_z = A_z qvel: the vertical component of the angular momentum about the CoM c."""
        mj, m = self.mj, self.m
        Az = np.zeros(self.nv)
        for b in self._bodies:
            mb = m.body_mass[b]
            if mb <= 0:
                continue
            mj.mj_jacBodyCom(m, d, self._jp, self._jr, b)
            R = d.ximat[b].reshape(3, 3)
            Iw_z = (R[2] * m.body_inertia[b]) @ R.T            # third row of R diag(I) R^T
            r = d.xipos[b] - c
            Az += Iw_z @ self._jr + mb * (r[0] * self._jp[1] - r[1] * self._jp[0])
        return Az

    def com(self, d):
        return d.subtree_com[self.pelvis].copy()

    def com_vel(self, d):
        J = np.zeros((3, self.nv))
        self.mj.mj_jacSubtreeCom(self.m, d, J, self.pelvis)
        return J @ d.qvel, J

    # ----------------------------------------------------------------------------------------------- solve
    def step(self, d, ref, stance, dt):
        """ref: dict(q, qd, qdd [29], pelvis_quat [4], pelvis_angvel [3], com [3], com_vel [3],
        swing={side: (pos [3], vel [3], quat [4])}). stance: {'left': bool, 'right': bool}. Returns torques [29]."""
        mj, m = self.mj, self.m
        nv = self.nv
        qd = d.qvel.copy()
        try:
            mj.mj_fullM(m, d, self.M)                     # MuJoCo 4 signature
        except TypeError:
            mj.mj_fullM(m, self.M, d.qM)                  # MuJoCo 3
        h = d.qfrc_bias - d.qfrc_passive
        # contact forces: 4 points per stance foot
        pts, Jc = [], []
        for s in ("left", "right"):
            if stance[s]:
                for p in self.contact_points(d, s):
                    pts.append(p)
                    Jc.append(self._jac_point(d, self.feet[s], p))
        nf = 3 * len(pts)
        Jc = np.vstack(Jc) if pts else np.zeros((0, nv))
        n = nv + nf
        H = np.zeros((n, n))
        g = np.zeros(n)

        def task(A, b, w, cols=slice(0, nv)):
            Wa = w[:, None] * A if np.ndim(w) else w * A
            H[cols, cols] += A.T @ Wa
            g[cols] += Wa.T @ b

        # balance: centre of mass
        cv, Jcom = self.com_vel(d)
        c = self.com(d)
        acc_c = ref.get("com_acc", np.zeros(3)) + self.kp_com * (ref["com"] - c) + self.kd_com * (ref["com_vel"] - cv)
        task(Jcom, acc_c - self._djqd("com", Jcom, qd, dt), self.w_com)
        # spin: the whole body's angular momentum about the vertical through the CoM decays to zero. People swing their
        # arms against their legs for this; without it, arm and torso motion can spin the robot on its standing foot
        if self.w_angmom > 0:
            Az = self.angmom_z_jac(d, c)
            Lz = float(Az @ qd)
            task(Az[None], np.array([-self.kd_angmom * Lz]) - self._djqd("angmom", Az[None], qd, dt), np.array([self.w_angmom]))
        # pelvis orientation
        J6 = self._jac_body6(d, self.pelvis)
        Jr = J6[3:]
        w_now = Jr @ qd
        acc_r = self.kp_rot * quat_err(ref["pelvis_quat"], d.xquat[self.pelvis]) + self.kd_rot * (ref["pelvis_angvel"] - w_now)
        task(Jr, acc_r - self._djqd("pelvis_r", Jr, qd, dt), np.full(3, self.w_pelvis))
        # swing feet
        for s, (p_ref, v_ref, q_ref) in ref.get("swing", {}).items():
            if stance[s]:
                continue
            Jf = self._jac_body6(d, self.feet[s])
            v6 = Jf @ qd
            acc = np.concatenate([self.kp_sw * (p_ref - d.xpos[self.feet[s]]) + self.kd_sw * (v_ref - v6[:3]),
                                  self.kp_sw * quat_err(q_ref, d.xquat[self.feet[s]]) - self.kd_sw * v6[3:]])
            task(Jf, acc - self._djqd(f"swing_{s}", Jf, qd, dt), np.full(6, self.w_swing))
        # the motion itself: reference joint angles
        S = np.zeros((self.nj, nv))
        S[np.arange(self.nj), self.vadr] = 1.0
        q = d.qpos[self.qadr]
        acc_q = ref["qdd"] + self.kp_q * (ref["q"] - q) + self.kd_q * (ref["qd"] - qd[self.vadr])
        w_q = ref.get("w_posture", np.full(self.nj, self.w_posture))
        task(S, acc_q, np.asarray(w_q, float))
        # regularisation
        H[:nv, :nv] += 1e-4 * np.eye(nv)
        if nf:
            H[nv:, nv:] += 1e-5 * np.eye(nf)
            fz_ref = np.zeros(nf)
            fz_ref[2::3] = 9.81 * m.body_subtreemass[self.pelvis] / len(pts)     # prefer even loading: keeps the
            H[nv:, nv:] += self.w_even * np.eye(nf)                                # centre of pressure away from the
            g[nv:] += self.w_even * fz_ref                                         # edges, where a foot would roll
        # equalities: floating-base dynamics; stance feet do not move
        Aeq, beq = [], []
        Aeq.append(np.hstack([self.M[:6], -Jc[:, :6].T]) if nf else self.M[:6].copy())
        beq.append(-h[:6])
        for s in ("left", "right"):
            if stance[s]:
                Jf = self._jac_body6(d, self.feet[s])
                b_st = -self._djqd(f"stance_{s}", Jf, qd, dt) - 20.0 * (Jf @ qd)
                if self.hard_contacts:
                    Aeq.append(np.hstack([Jf, np.zeros((6, nf))]))
                    beq.append(b_st)
                else:
                    # a very heavy task instead of a hard constraint: the QP can then never be infeasible (falling
                    # freely is always a solution), so a demanding moment degrades gracefully instead of failing
                    task(Jf, b_st, np.full(6, self.w_contact))
        Aeq, beq = np.vstack(Aeq), np.concatenate(beq)
        # inequalities: friction pyramid, pushing only; torque limits
        Ain, bin_ = [], []
        for k in range(len(pts)):
            i = nv + 3 * k
            for row, val in ((np.array([0, 0, 1.0]), FZ_MIN), (np.array([-1, 0, MU]), 0.0), (np.array([1, 0, MU]), 0.0),
                             (np.array([0, -1, MU]), 0.0), (np.array([0, 1, MU]), 0.0)):
                a = np.zeros(n)
                a[i:i + 3] = row
                Ain.append(a)
                bin_.append(val)
        Ma = self.M[self.vadr]
        T = np.hstack([Ma, -Jc[:, self.vadr].T]) if nf else Ma
        ha = h[self.vadr]
        Ain += list(-T) + list(T)
        bin_ += list(ha - self.tau_lim) + list(-ha - self.tau_lim)
        C = np.vstack([Aeq, np.array(Ain)]).T
        b = np.concatenate([beq, np.array(bin_)])
        H = 0.5 * (H + H.T) + 1e-9 * np.eye(n)
        try:
            x = quadprog.solve_qp(H, g, C, b, meq=len(beq))[0]
            self.last_ok = True
        except ValueError:
            # infeasible this step (e.g. a foot just landed): drop the torque limits, keep physics and friction
            self.last_ok = False
            k = len(beq) + 5 * len(pts)
            try:
                x = quadprog.solve_qp(H, g, C[:, :k], b[:k], meq=len(beq))[0]
            except ValueError:
                return self.tau_last.copy(), dict(qdd=np.zeros(nv), f=np.zeros(nf))   # hold the last good torques
        qdd, f = x[:nv], x[nv:]
        tau = Ma @ qdd + ha - (Jc[:, self.vadr].T @ f if nf else 0.0)
        self.tau_last = np.clip(tau, -self.tau_lim, self.tau_lim)
        return self.tau_last.copy(), dict(qdd=qdd, f=f)
