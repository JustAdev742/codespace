"""Whole-body inverse dynamics for prescribed motions, with foot-wrench distribution.

Method
------
For a floating-base robot, mj_inverse returns the generalized force needed to realise
(q, qd, qdd) with *no* contacts. The first 6 rows (the floating base) cannot be produced
by joint motors, so they must equal the generalized force contributed by the foot
wrenches W = [f; m] at the sole sites:

    qfrc_inv[0:6] = sum_i J_i[:, 0:6]^T W_i

In single support this fixes W_stance uniquely (6 equations, 6 unknowns). In double
support we pick the weighted-minimum-norm split, with weights following the ZMP
transfer ratio, which is what a QP-based whole-body controller converges to when
it minimises contact wrench effort. Joint torques are then

    tau = qfrc_inv[6:] - sum_i J_i[:, 6:]^T W_i

The centre of pressure under each foot is reported so that physically infeasible
motions (CoP outside the sole, tensile normal force, friction > mu) are flagged
rather than silently producing optimistic torques.
"""
from __future__ import annotations

import mujoco
import numpy as np

from . import model as Mo
from . import params as P


class Robot:
    def __init__(self, mass_scale=P.DESIGN_MASS_GROWTH, payloads=None):
        xml = Mo.build_mjcf(mass_scale=mass_scale, payloads=payloads, floor=False, damping=0.0)
        self.m = mujoco.MjModel.from_xml_string(xml)
        self.m.opt.disableflags |= mujoco.mjtDisableBit.mjDSBL_CONSTRAINT
        self.d = mujoco.MjData(self.m)
        self.jnames = [self.m.joint(i).name for i in range(1, self.m.njnt)]
        self.qadr = {n: self.m.joint(n).qposadr[0] for n in self.jnames}
        self.vadr = {n: self.m.joint(n).dofadr[0] for n in self.jnames}
        self.sole = {s: mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_SITE, f"{s}_sole") for s in "lr"}
        self.palm = {s: mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_SITE, f"{s}_palm") for s in "lr"}
        self.leg = {s: [f"{s}_{j}" for j in ("hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll")] for s in "lr"}
        self.total_mass = float(sum(self.m.body_mass))
        self.jrange = {n: self.m.joint(n).range.copy() for n in self.jnames}

    # ------------------------------------------------------------------ kinematics
    def q0(self):
        q = np.zeros(self.m.nq)
        q[2] = P.DIM["ankle_h"] + P.DIM["shank"] + P.DIM["thigh"]
        q[3] = 1.0
        # seed the legs with a bent knee so IK never starts on the straight-knee singularity
        for s in "lr":
            q[self.qadr[f"{s}_hip_pitch"]] = -0.30
            q[self.qadr[f"{s}_knee"]] = 0.60
            q[self.qadr[f"{s}_ankle_pitch"]] = -0.30
        return q

    def set_joints(self, q, values):
        for k, v in values.items():
            q[self.qadr[k]] = v
        return q

    def fk(self, q):
        self.d.qpos[:] = q
        mujoco.mj_kinematics(self.m, self.d)
        mujoco.mj_comPos(self.m, self.d)
        return self.d

    def com(self, q):
        self.fk(q)
        return self.d.subtree_com[1].copy()

    def ik_leg(self, q, side, target_pos, target_R=np.eye(3), iters=50, tol=1e-7):
        """Damped-least-squares IK of one 6-DOF leg (sole site pose). Modifies q in place."""
        idx_q = [self.qadr[n] for n in self.leg[side]]
        idx_v = [self.vadr[n] for n in self.leg[side]]
        lo = np.array([self.jrange[n][0] for n in self.leg[side]])
        hi = np.array([self.jrange[n][1] for n in self.leg[side]])
        lo[3] = max(lo[3], 0.02)  # knee never through straight
        sid = self.sole[side]
        jp = np.zeros((3, self.m.nv))
        jr = np.zeros((3, self.m.nv))
        for _ in range(iters):
            self.fk(q)
            p = self.d.site_xpos[sid]
            R = self.d.site_xmat[sid].reshape(3, 3)
            ep = target_pos - p
            Re = target_R @ R.T
            er = 0.5 * np.array([Re[2, 1] - Re[1, 2], Re[0, 2] - Re[2, 0], Re[1, 0] - Re[0, 1]])
            e = np.concatenate([ep, er])
            if e @ e < tol**2:
                break
            mujoco.mj_jacSite(self.m, self.d, jp, jr, sid)
            J = np.vstack([jp[:, idx_v], jr[:, idx_v]])
            lam = 1e-6 + 1e-2 * max(0.0, 0.05 - abs(np.linalg.det(J))) 
            dq = J.T @ np.linalg.solve(J @ J.T + lam * np.eye(6), e)
            nrm = np.linalg.norm(dq)
            if nrm > 0.2:
                dq *= 0.2 / nrm
            q[idx_q] = np.clip(q[idx_q] + dq, lo, hi)
        return q

    def place_pelvis_for_com(self, q, target_xy, feet, iters=8):
        """Shift pelvis xy (re-solving leg IK to keep feet fixed) until CoM xy = target."""
        for _ in range(iters):
            for s, (pos, R) in feet.items():
                self.ik_leg(q, s, pos, R)
            c = self.com(q)
            err = np.asarray(target_xy) - c[:2]
            q[0:2] += err
            if np.linalg.norm(err) < 1e-5:
                break
        for s, (pos, R) in feet.items():
            self.ik_leg(q, s, pos, R)
        return q

    # ------------------------------------------------------------------ dynamics
    def derivatives(self, Q, dt):
        n = len(Q)
        V = np.zeros((n, self.m.nv))
        for k in range(n):
            a, b = max(k - 1, 0), min(k + 1, n - 1)
            mujoco.mj_differentiatePos(self.m, V[k], (b - a) * dt, Q[a], Q[b])
        A = np.gradient(V, dt, axis=0)
        return V, A

    def inverse_dynamics(self, Q, dt=None, V=None, A=None, wL=None, wR=None, mom_len=0.10):
        """Return dict of time series: tau (n x nj), qd, W_l, W_r, cop_l, cop_r, residual."""
        n = len(Q)
        if V is None:
            if dt is None:
                V = np.zeros((n, self.m.nv))
                A = np.zeros((n, self.m.nv))
            else:
                V, A = self.derivatives(Q, dt)
        wL = np.ones(n) * 0.5 if wL is None else np.asarray(wL)
        wR = 1.0 - wL if wR is None else np.asarray(wR)
        nj = len(self.jnames)
        tau = np.zeros((n, nj))
        W = {s: np.zeros((n, 6)) for s in "lr"}
        cop = {s: np.full((n, 2), np.nan) for s in "lr"}
        resid = np.zeros(n)
        Qinv = np.diag([1, 1, 1, 1 / mom_len**2, 1 / mom_len**2, 1 / mom_len**2])
        Qi = np.linalg.inv(Qinv)
        jp = np.zeros((3, self.m.nv))
        jr = np.zeros((3, self.m.nv))
        jidx = np.array([self.vadr[j] for j in self.jnames])
        for k in range(n):
            self.d.qpos[:] = Q[k]
            self.d.qvel[:] = V[k]
            self.d.qacc[:] = A[k]
            mujoco.mj_inverse(self.m, self.d)
            f = self.d.qfrc_inverse.copy()
            Js = {}
            for s in "lr":
                mujoco.mj_jacSite(self.m, self.d, jp, jr, self.sole[s])
                Js[s] = np.vstack([jp, jr]).copy()  # 6 x nv
            w = {"l": wL[k], "r": wR[k]}
            Msum = np.zeros((6, 6))
            for s in "lr":
                if w[s] > 1e-6:
                    As = Js[s][:, 0:6].T
                    Msum += w[s] * As @ Qi @ As.T
            lam = np.linalg.solve(Msum, f[0:6])
            for s in "lr":
                if w[s] > 1e-6:
                    W[s][k] = w[s] * Qi @ Js[s][:, 0:6] @ lam
            gen = sum(Js[s].T @ W[s][k] for s in "lr")
            resid[k] = np.linalg.norm(f[0:6] - gen[0:6])
            tau[k] = (f - gen)[jidx]
            for s in "lr":
                fz = W[s][k][2]
                if fz > 1.0:
                    mx, my = W[s][k][3], W[s][k][4]
                    cop[s][k] = (-my / fz, mx / fz)
        qd = V[:, jidx]
        qpos = np.array([[Q[k][self.qadr[j]] for j in self.jnames] for k in range(n)])
        return dict(tau=tau, qd=qd, q=qpos, W_l=W["l"], W_r=W["r"], cop_l=cop["l"], cop_r=cop["r"], resid=resid,
                    jnames=self.jnames)


def cop_feasible(cop, margin=0.0):
    """True where the CoP (relative to ankle projection, foot frame aligned with world) is inside the sole."""
    d = P.DIM
    x, y = cop[:, 0], cop[:, 1]
    ok = (x > -d["heel"] + margin) & (x < d["foot_len"] - d["heel"] - margin) & (np.abs(y) < d["foot_w"] / 2 - margin)
    return ok | np.isnan(x)
