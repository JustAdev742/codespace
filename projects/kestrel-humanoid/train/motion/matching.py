"""Motion matching: human-like movement straight from the datasets, with no training.

The games-industry technique for natural character motion, here driving the G1. The retargeted library is indexed
once (seconds): every frame gets a feature vector describing where the body is going over the next 0.6 s (root path
and facing, in its own frame) and how it is moving now (feet positions and velocities, root velocity). Then, ten
times a second, the robot builds the same vector from what it *wants* to do (a walking command or a chosen action,
from the brain or from free will) and from its current motion, finds the closest frame in the whole library (a
nearest-neighbour search) and continues from there. Every jump is hidden by inertialization: the difference between
the old and the new pose decays to zero over about 0.2 s with a critically damped spring, so the motion never pops.

The output is a continuous reference motion at 50 Hz (joint angles plus root path) for the whole-body controller
(wbc.py), which makes it physical and balanced.
"""
from __future__ import annotations

import math
import re

import numpy as np

FPS = 50
FUTURE = (10, 20, 30)                  # frames ahead: 0.2, 0.4, 0.6 s
LOCOMOTION = {"walk", "walk-left", "walk-right", "walk-back", "walk-turn-left", "walk-turn-right", "run", "dash",
              "idle", "stand"}


def yaw_of(q):
    w, x, y, z = q
    return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def action_of(name):
    """'dataset-2_wave-right-hand_active_003' -> ('wave-right-hand', 'active'); plain names -> (name, '')."""
    n = re.sub(r"^dataset-\d+_", "", str(name))
    m = re.match(r"(.+?)_([a-z-]+)_\d+$", n)
    return (m.group(1), m.group(2)) if m else (re.sub(r"_?\d+$", "", n), "")


class Database:
    def __init__(self, lib_path, fk=None):
        z = np.load(lib_path, allow_pickle=True)
        self.q, self.rp, self.rq = z["q"], z["root_pos"], z["root_quat"]
        self.starts, self.lens, self.names = z["clip_start"], z["clip_len"], z["clip_name"]
        n = len(self.q)
        self.clip_of = np.zeros(n, int)
        for c, (s, L) in enumerate(zip(self.starts, self.lens)):
            self.clip_of[s:s + L] = c
        self.actions = [action_of(nm)[0] for nm in self.names]
        self.styles = [action_of(nm)[1] for nm in self.names]
        self.action_of_frame = np.array([self.actions[c] for c in self.clip_of])
        self.style_of_frame = np.array([self.styles[c] for c in self.clip_of])
        self._feet(fk)
        self._features()

    # ------------------------------------------------------------------------------------------------- index
    def _feet(self, fk):
        """Foot positions of every frame (from the robot's kinematics)."""
        import torch
        from .formats import K
        from .retarget import G1FK, quat_to_mat
        fk = fk or G1FK()
        P = []
        for s in range(0, len(self.q), 4096):
            e = min(len(self.q), s + 4096)
            R = torch.tensor(np.stack([quat_to_mat(x) for x in self.rq[s:e]]), dtype=fk.dtype)
            with torch.no_grad():
                P.append(fk(torch.tensor(self.q[s:e], dtype=fk.dtype), torch.tensor(self.rp[s:e], dtype=fk.dtype), R).numpy())
        P = np.concatenate(P)
        self.feet = P[:, [K["l_ankle"], K["r_ankle"]]]                   # [N, 2, 3]
        self.kp = P

    def _local(self, i, p):
        """World point p into the frame of frame i (root position, heading only)."""
        y = yaw_of(self.rq[i])
        c, s = math.cos(y), math.sin(y)
        d = p - self.rp[i]
        return np.array([c * d[0] + s * d[1], -s * d[0] + c * d[1], d[2]])

    def _features(self):
        N = len(self.q)
        F = np.zeros((N, 24), np.float32)
        self.valid = np.zeros(N, bool)
        for c, (s, L) in enumerate(zip(self.starts, self.lens)):
            for i in range(s, s + L):
                last = s + L - 1
                y0 = yaw_of(self.rq[i])
                fut = []
                for k in FUTURE:
                    j = min(i + k, last)
                    lp = self._local(i, self.rp[j])
                    dy = wrap(yaw_of(self.rq[j]) - y0)
                    fut += [lp[0], lp[1], math.cos(dy), math.sin(dy)]
                j1 = min(i + 1, last)
                i0 = max(i - 1, s)
                feet = [self._local(i, self.feet[i, k]) for k in range(2)]
                fv = [(self._local(i, self.feet[j1, k]) - self._local(i, self.feet[i0, k])) * FPS / max(1, j1 - i0) for k in range(2)]
                rv = self._local(i, self.rp[j1]) - self._local(i, self.rp[i0])
                rv = rv * FPS / max(1, j1 - i0)
                F[i] = np.array(fut + list(feet[0]) + list(feet[1]) + list(fv[0][:2]) + list(fv[1][:2]) + list(rv[:2]))
                self.valid[i] = i + 5 < s + L                     # leave room to play on
        self.mu = F[self.valid].mean(0)
        self.sd = F[self.valid].std(0) + 1e-3
        # feature-group weights: future path, facing, feet, foot velocity, root velocity
        w = np.ones(24, np.float32)
        for k in range(3):
            w[4 * k:4 * k + 2] = 1.5                             # where it goes
            w[4 * k + 2:4 * k + 4] = 1.0                         # which way it faces
        w[12:18] = 0.75
        w[18:22] = 0.5
        w[22:24] = 1.0
        self.w = w
        self.F = (F - self.mu) / self.sd * w

    def search(self, query, allowed):
        """Index of the best frame among allowed frames for a raw (unnormalised) query vector."""
        qn = (query - self.mu) / self.sd * self.w
        idx = np.where(allowed & self.valid)[0]
        if len(idx) == 0:
            idx = np.where(self.valid)[0]
        d = np.sum((self.F[idx] - qn) ** 2, axis=1)
        k = int(np.argmin(d))
        return int(idx[k]), float(d[k])


class Matcher:
    """Turns intents into a smooth reference motion, frame by frame."""

    def __init__(self, db, search_every=5, blend_halflife=0.1):
        self.db = db
        self.every = search_every
        self.hl = blend_halflife
        self.frame = int(np.where(db.valid)[0][0])
        self.n = 0
        self.root_pos = np.array([0.0, 0.0, float(db.rp[self.frame][2])])
        self.yaw = 0.0
        self.off_q = np.zeros(db.q.shape[1])
        self.off_v = np.zeros(db.q.shape[1])
        self.q_out = db.q[self.frame].copy()
        self.v_out = np.zeros_like(self.q_out)
        self.action = "walk"
        self.style = None
        self.cmd = np.zeros(3)                  # vx, vy (m/s, own frame), yaw rate (rad/s)
        self.cmd_s = np.zeros(3)                # smoothed command (a spring, like a person's intention)

    def set_intent(self, action="walk", vx=0.0, vy=0.0, yaw_rate=0.0, style=None):
        self.action, self.style = action, style
        self.cmd = np.array([vx, vy, yaw_rate], float)

    def _query(self):
        db, i = self.db, self.frame
        fut = []
        v = self.cmd_s
        for k in FUTURE:
            t = k / FPS
            dy = v[2] * t
            if abs(v[2]) > 1e-3:                # integrate a constant-curvature path
                x = (v[0] * math.sin(dy) + v[1] * (math.cos(dy) - 1)) / v[2]
                y = (v[0] * (1 - math.cos(dy)) + v[1] * math.sin(dy)) / v[2]
            else:
                x, y = v[0] * t, v[1] * t
            fut += [x, y, math.cos(dy), math.sin(dy)]
        cur = db.F[i] / db.w * db.sd + db.mu              # current motion features, from the playing frame
        return np.concatenate([fut, cur[12:24]])

    def _allowed(self):
        db = self.db
        a = self.action
        if a in ("walk", "move", "locomotion"):
            ok = np.isin(db.action_of_frame, list(LOCOMOTION))
        else:
            ok = db.action_of_frame == a
            if not ok.any():
                ok = np.char.find(db.action_of_frame.astype(str), a) >= 0
        if self.style:
            s_ok = ok & (db.style_of_frame == self.style)
            if s_ok.any():
                ok = s_ok
        return ok

    def step(self):
        """Advance one frame (1/50 s). Returns dict(q, qd, root_pos, root_quat, frame, action)."""
        db = self.db
        dt = 1.0 / FPS
        self.cmd_s += (self.cmd - self.cmd_s) * min(1.0, dt / 0.25)
        nxt = self.frame + 1
        end = nxt >= db.starts[db.clip_of[self.frame]] + db.lens[db.clip_of[self.frame]] - 1
        if self.n % self.every == 0 or end or not db.valid[min(nxt, len(db.q) - 1)]:
            best, cost = db.search(self._query(), self._allowed())
            same_clip = db.clip_of[best] == db.clip_of[self.frame] and abs(best - nxt) < 10
            if not same_clip or end:
                # inertialization: keep the current output pose and velocity, fade the difference out
                self.off_q = self.q_out - db.q[best]
                self.off_v = self.v_out - (db.q[min(best + 1, len(db.q) - 1)] - db.q[best]) * FPS
                nxt = best
        self.n += 1
        # root motion: the database's local displacement, applied in the world from the current heading
        i, j = self.frame, nxt
        if db.clip_of[i] == db.clip_of[j] and j == i + 1:
            dloc = db._local(i, db.rp[j])
            dyaw = wrap(yaw_of(db.rq[j]) - yaw_of(db.rq[i]))
        else:
            dloc, dyaw = np.zeros(3), 0.0
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        self.root_pos[:2] += [c * dloc[0] - s * dloc[1], s * dloc[0] + c * dloc[1]]
        self.root_pos[2] = db.rp[j][2]
        self.yaw = wrap(self.yaw + dyaw)
        self.frame = j
        # critically damped decay of the offset (half-life hl)
        y = 2.0 * 0.6931 / max(self.hl, 1e-3)
        e = math.exp(-y * dt / 2.0)
        j0 = self.off_v + self.off_q * y / 2.0
        self.off_q = e * (self.off_q + j0 * dt)
        self.off_v = e * (self.off_v - j0 * y / 2.0 * dt)
        q_new = db.q[j] + self.off_q
        self.v_out = (q_new - self.q_out) * FPS
        self.q_out = q_new
        # root orientation: the clip's tilt (pitch, roll) with the matcher's heading
        yq = yaw_of(db.rq[j])
        rel = np.array([math.cos(-yq / 2), 0, 0, math.sin(-yq / 2)])
        from .player import qmul
        tilt = qmul(rel, db.rq[j])
        root_quat = qmul(np.array([math.cos(self.yaw / 2), 0, 0, math.sin(self.yaw / 2)]), tilt)
        return dict(q=self.q_out.copy(), qd=self.v_out.copy(), root_pos=self.root_pos.copy(),
                    root_quat=root_quat / np.linalg.norm(root_quat), frame=j, action=db.actions[db.clip_of[j]])
