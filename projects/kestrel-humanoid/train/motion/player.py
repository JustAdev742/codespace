"""Play motions on the physical G1 with the whole-body controller (wbc.py): no training.

A reference stream (from the retargeted library, or from motion matching, matching.py) gives joint angles, the
pelvis orientation and, for balance, where the centre of mass should be relative to the feet. Before each control
step the reference is re-anchored to where the robot actually stands (its heading and its feet), so drift never
accumulates, and the centre-of-mass target is kept inside the support area.
"""
from __future__ import annotations

import math

import numpy as np

from . import g1 as G


def yaw_of(q):
    w, x, y, z = q
    return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


def quat_yaw(yaw):
    return np.array([math.cos(yaw / 2), 0.0, 0.0, math.sin(yaw / 2)])


def qmul(a, b):
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2])


class RefModel:
    """Kinematics of the reference pose: its centre of mass and feet, for re-anchoring."""

    def __init__(self, m):
        import mujoco
        self.mj, self.m = mujoco, m
        self.d = mujoco.MjData(m)
        self.names, self.qadr, self.vadr, _, _ = G.joint_info(m)
        self.pelvis = m.body("pelvis").id
        self.feet = [m.body("left_ankle_roll_link").id, m.body("right_ankle_roll_link").id]

    def pose(self, q, root_pos, root_quat, full=False):
        d = self.d
        d.qpos[0:3], d.qpos[3:7] = root_pos, root_quat
        d.qpos[self.qadr] = q
        self.mj.mj_kinematics(self.m, d)
        self.mj.mj_comPos(self.m, d)
        if full:
            return (d.subtree_com[self.pelvis].copy(), [d.xpos[f].copy() for f in self.feet],
                    [d.xquat[f].copy() for f in self.feet])
        return d.subtree_com[self.pelvis].copy(), d.xpos[self.feet[0]].copy(), d.xpos[self.feet[1]].copy()


class Stream:
    """A reference motion at 50 Hz (q, root_pos, root_quat), read at any time t with derivatives."""

    def __init__(self, q, root_pos, root_quat, fps=50.0):
        self.q, self.rp, self.rq, self.fps = np.asarray(q), np.asarray(root_pos), np.asarray(root_quat), fps
        self.qd = np.gradient(self.q, 1 / fps, axis=0) if len(q) > 1 else np.zeros_like(self.q)
        self.qdd = np.gradient(self.qd, 1 / fps, axis=0) if len(q) > 2 else np.zeros_like(self.q)
        self.T = len(q) / fps

    def at(self, t):
        x = min(max(t * self.fps, 0.0), len(self.q) - 1.000001)
        i = int(x)
        a = x - i
        j = min(i + 1, len(self.q) - 1)
        lerp = lambda A: (1 - a) * A[i] + a * A[j]
        rq = (1 - a) * self.rq[i] + a * (self.rq[j] if np.dot(self.rq[i], self.rq[j]) >= 0 else -self.rq[j])
        return dict(q=lerp(self.q), qd=lerp(self.qd), qdd=lerp(self.qdd), root_pos=lerp(self.rp), root_quat=rq / np.linalg.norm(rq))


class Anchor:
    """Turns a reference frame into WBC targets, relative to the robot's own heading and feet."""

    def __init__(self, m, margin=0.03):
        self.ref = RefModel(m)
        self.margin = margin
        self.yaw_off = None

    def reset(self):
        self.yaw_off = None

    def targets(self, d, wbc, r, r_next, dt):
        c_ref, lf_ref, rf_ref = self.ref.pose(r["q"], r["root_pos"], r["root_quat"])
        c_nx, _, _ = self.ref.pose(r_next["q"], r_next["root_pos"], r_next["root_quat"])
        yaw_robot = yaw_of(d.xquat[wbc.pelvis])
        yaw_ref = yaw_of(r["root_quat"])
        if self.yaw_off is None:
            self.yaw_off = yaw_robot - yaw_ref
        dq = quat_yaw(self.yaw_off)
        pelvis_q = qmul(dq, r["root_quat"])
        pelvis_q_nx = qmul(dq, r_next["root_quat"])
        import mujoco
        w = np.zeros(3)
        mujoco.mju_subQuat(w, pelvis_q_nx, pelvis_q)
        w /= dt
        cy, sy = math.cos(self.yaw_off), math.sin(self.yaw_off)
        Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1.0]])
        mid_ref = 0.5 * (lf_ref + rf_ref)
        mid = 0.5 * (d.xpos[wbc.feet["left"]] + d.xpos[wbc.feet["right"]])
        com = mid + Rz @ (c_ref - mid_ref)
        com_vel = Rz @ (c_nx - c_ref) / dt
        # keep the target inside the support area (the contact points, shrunk by a margin), in the robot's heading
        pts = np.array(wbc.contact_points(d, "left") + wbc.contact_points(d, "right"))
        ch, sh = math.cos(yaw_robot), math.sin(yaw_robot)
        Rh = np.array([[ch, sh], [-sh, ch]])
        loc = (pts[:, :2] - mid[:2]) @ Rh.T
        c_loc = Rh @ (com[:2] - mid[:2])
        lo, hi = loc.min(0) + self.margin, loc.max(0) - self.margin
        c_loc = np.clip(c_loc, lo, hi)
        com[:2] = mid[:2] + Rh.T @ c_loc
        return dict(q=r["q"], qd=r["qd"], qdd=r["qdd"], pelvis_quat=pelvis_q, pelvis_angvel=w, com=com, com_vel=com_vel)


def place_on_floor(m, d, q, root_quat, xy=(0.0, 0.0)):
    """Put the robot in pose q with its lowest foot point on the floor."""
    import mujoco
    names, qadr, vadr, _, _ = G.joint_info(m)
    d.qpos[:] = 0
    d.qpos[0:2] = xy
    d.qpos[2] = 1.0
    d.qpos[3:7] = root_quat
    d.qpos[qadr] = q
    d.qvel[:] = 0
    mujoco.mj_kinematics(m, d)
    low = min(d.geom_xpos[m.geom(f"{s}_foot_{i}").id][2] - m.geom_size[m.geom(f"{s}_foot_{i}").id][0]
              for s in ("left", "right") for i in range(4))
    d.qpos[2] -= low - 0.0005
    mujoco.mj_forward(m, d)


SIDES = ("left", "right")
ANKLE_UP = 0.035                    # ankle-roll link origin above the sole when the foot is flat


class WalkAnchor:
    """Re-anchors a reference that steps: everything is taken relative to the reference's stance foot (or the middle
    of both feet in double support) and placed on the robot's actual stance foot, so errors never pile up across
    steps. A foot becomes support only once it really touches the floor; until then it is steered down onto it."""

    def __init__(self, m, margin=0.02, h_contact=0.025, v_contact=0.35, step_gain=1.0, step_max=0.15):
        self.ref = RefModel(m)
        self.m = m
        self.margin, self.hc, self.vc = margin, h_contact, v_contact
        self.step_gain, self.step_max = step_gain, step_max
        self.stance = {"left": True, "right": True}
        self.foot_geoms = {sd: {m.geom(f"{sd}_foot_{i}").id for i in range(4)} for sd in SIDES}
        self.floor = m.geom("floor").id if "floor" in [m.geom(i).name for i in range(m.ngeom)] else -1
        self.omega = math.sqrt(9.81 / 0.7)              # capture-point time constant (centre of mass about 0.7 m up)

    def touching(self, d, side):
        """A foot touches the floor (not the other foot, not anything else)."""
        g = self.foot_geoms[side]
        for i in range(d.ncon):
            c = d.contact[i]
            if (c.geom1 in g and c.geom2 == self.floor) or (c.geom2 in g and c.geom1 == self.floor):
                return True
        return False

    def _frame(self, pos, quat):
        y = yaw_of(quat)
        c, s = math.cos(y), math.sin(y)
        return np.array(pos), np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]]), y

    def targets(self, d, wbc, r, r_next, dt):
        c_ref, feet_ref, fq_ref = self.ref.pose(r["q"], r["root_pos"], r["root_quat"], full=True)
        c_nx, feet_nx, _ = self.ref.pose(r_next["q"], r_next["root_pos"], r_next["root_quat"], full=True)
        ref_contact = {}
        for k, sd in enumerate(SIDES):
            h = feet_ref[k][2] - ANKLE_UP
            v = np.linalg.norm((feet_nx[k] - feet_ref[k])[:2]) / dt
            ref_contact[sd] = h < self.hc and v < self.vc
        if not any(ref_contact.values()):                 # a flight phase (running): keep the lower foot
            k = int(np.argmin([feet_ref[0][2], feet_ref[1][2]]))
            ref_contact[SIDES[k]] = True
        # support: the reference's contact, but only on a foot that is really down and flat; a planted foot stays
        for sd in SIDES:
            if ref_contact[sd]:
                flat = d.xmat[wbc.feet[sd]][8] > math.cos(0.15)
                if not self.stance[sd] and self.touching(d, sd) and flat:
                    self.stance[sd] = True
            else:
                self.stance[sd] = False
        if not any(self.stance.values()):                 # never zero support: keep the foot that is lower
            k = int(np.argmin([d.xpos[wbc.feet[sd]][2] for sd in SIDES]))
            self.stance[SIDES[k]] = True
        # anchor frames: the reference's stance foot (or both) -> the robot's actual stance foot (or both)
        st = [sd for sd in SIDES if self.stance[sd]]
        ks = [SIDES.index(sd) for sd in st]
        if len(st) == 2:
            p_ref = 0.5 * (feet_ref[0] + feet_ref[1])
            y_ref = math.atan2(*(np.sin([yaw_of(fq_ref[0]), yaw_of(fq_ref[1])]).sum(),
                                np.cos([yaw_of(fq_ref[0]), yaw_of(fq_ref[1])]).sum()))
            p_act = 0.5 * (d.xpos[wbc.feet["left"]] + d.xpos[wbc.feet["right"]])
            ya = [yaw_of(d.xquat[wbc.feet[sd]]) for sd in SIDES]
            y_act = math.atan2(sum(math.sin(a) for a in ya), sum(math.cos(a) for a in ya))
        else:
            p_ref, y_ref = feet_ref[ks[0]], yaw_of(fq_ref[ks[0]])
            p_act, y_act = d.xpos[wbc.feet[st[0]]].copy(), yaw_of(d.xquat[wbc.feet[st[0]]])
        dy = y_act - y_ref
        cz, sz = math.cos(dy), math.sin(dy)
        Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1.0]])
        T = lambda p: p_act + Rz @ (np.asarray(p) - p_ref)
        dqz = quat_yaw(dy)
        com, com_vel = T(c_ref), Rz @ (c_nx - c_ref) / dt
        pelvis_q = qmul(dqz, r["root_quat"])
        import mujoco
        w = np.zeros(3)
        mujoco.mju_subQuat(w, qmul(dqz, r_next["root_quat"]), pelvis_q)
        w /= dt
        # balance by stepping (capture point, as in SIMBICON): the swing foot lands where it catches the body. The
        # error between the robot's capture point and the reference's moves the landing spot by the same amount.
        c_act, cv_act = wbc.com(d), wbc.com_vel(d)[0]
        cp_err = (c_act - com) + (cv_act - com_vel) / self.omega
        shift = np.clip(self.step_gain * cp_err[:2], -self.step_max, self.step_max)
        swing = {}
        for k, sd in enumerate(SIDES):
            if not self.stance[sd]:
                tgt = T(feet_ref[k])
                tgt[:2] += shift
                if ref_contact[sd]:
                    tgt[2] = min(tgt[2], ANKLE_UP - 0.01)      # landing: press gently onto the floor
                # the foot is kept level (the reference's heading only): it lands flat, ready to be planted
                swing[sd] = (tgt, Rz @ (feet_nx[k] - feet_ref[k]) / dt, quat_yaw(yaw_of(qmul(dqz, fq_ref[k]))))
        # standing still (both feet down, reference barely moving): keep the centre of mass inside the feet. While
        # walking, follow the reference's centre of mass: walking balance is dynamic, the steps catch the body.
        if len(st) == 2 and np.linalg.norm(com_vel[:2]) < 0.15:
            pts = np.array(sum([wbc.contact_points(d, sd) for sd in st], []))
            ch, sh = math.cos(y_act), math.sin(y_act)
            Rh = np.array([[ch, sh], [-sh, ch]])
            loc = (pts[:, :2] - p_act[:2]) @ Rh.T
            c_loc = np.clip(Rh @ (com[:2] - p_act[:2]), loc.min(0) + self.margin, loc.max(0) - self.margin)
            com[:2] = p_act[:2] + Rh.T @ c_loc
        return dict(q=r["q"], qd=r["qd"], qdd=r["qdd"], pelvis_quat=pelvis_q, pelvis_angvel=w, com=com,
                    com_vel=com_vel, swing=swing), dict(self.stance)


def double_support_start(m, q, root_pos, root_quat, h=ANKLE_UP + 0.015):
    """The first frame of a clip with both feet on the floor (clips often start mid-stride)."""
    rm = RefModel(m)
    for f in range(len(q)):
        _, lf, rf = rm.pose(q[f], root_pos[f], root_quat[f])
        if lf[2] < h and rf[2] < h:
            return f
    return 0
