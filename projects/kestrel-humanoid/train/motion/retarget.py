"""Retarget human motion onto the G1 in one batch (the plan's idea 2, first half).

A differentiable forward-kinematics model of the G1 in PyTorch, built from the MuJoCo model, fits every frame of a clip
at once: joint angles (kept inside the G1's ranges by construction), root position and root orientation that put the
G1's keypoint sites where the human's keypoints are, scaled to the G1's size, with a smoothness term over time. On a
GPU, many clips' frames run in one batch; on a CPU it is slower but identical.
"""
from __future__ import annotations

import math

import numpy as np
import torch

from . import g1 as G
from .formats import KEYPOINTS, K

KP_WEIGHT = {"l_ankle": 2.0, "r_ankle": 2.0, "l_toe": 2.0, "r_toe": 2.0, "l_wrist": 1.5, "r_wrist": 1.5, "pelvis": 2.0}


def quat_to_mat(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                     [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                     [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


def mat_to_quat(R):
    """Rotation matrices [..., 3, 3] -> unit quaternions (w, x, y, z) [..., 4]."""
    R = np.asarray(R)
    w = np.sqrt(np.maximum(0.0, 1 + R[..., 0, 0] + R[..., 1, 1] + R[..., 2, 2])) / 2
    x = np.sqrt(np.maximum(0.0, 1 + R[..., 0, 0] - R[..., 1, 1] - R[..., 2, 2])) / 2
    y = np.sqrt(np.maximum(0.0, 1 - R[..., 0, 0] + R[..., 1, 1] - R[..., 2, 2])) / 2
    z = np.sqrt(np.maximum(0.0, 1 - R[..., 0, 0] - R[..., 1, 1] + R[..., 2, 2])) / 2
    x = np.copysign(x, R[..., 2, 1] - R[..., 1, 2])
    y = np.copysign(y, R[..., 0, 2] - R[..., 2, 0])
    z = np.copysign(z, R[..., 1, 0] - R[..., 0, 1])
    q = np.stack([w, x, y, z], -1)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def rot6d_to_mat(r):
    a, b = r[..., :3], r[..., 3:]
    x = torch.nn.functional.normalize(a, dim=-1)
    y = torch.nn.functional.normalize(b - (x * b).sum(-1, keepdim=True) * x, dim=-1)
    z = torch.cross(x, y, dim=-1)
    return torch.stack([x, y, z], -1)                   # columns x, y, z


def axis_angle_mat(axis, ang):
    """axis [3] (tensor), ang [B] -> [B, 3, 3]."""
    k = axis / axis.norm()
    kx, ky, kz = k
    Kx = torch.tensor([[0, -kz, ky], [kz, 0, -kx], [-ky, kx, 0]], dtype=ang.dtype, device=ang.device)
    s, c = torch.sin(ang)[:, None, None], torch.cos(ang)[:, None, None]
    return torch.eye(3, dtype=ang.dtype, device=ang.device) + s * Kx + (1 - c) * (Kx @ Kx)


class G1FK:
    """Forward kinematics of the full G1 from its MuJoCo model, in torch."""

    def __init__(self, m=None, device="cpu", dtype=torch.float32):
        m = m or G.load_model()
        self.m, self.device, self.dtype = m, device, dtype
        t = lambda a: torch.tensor(np.asarray(a), dtype=dtype, device=device)
        self.parent = [int(p) for p in m.body_parentid]
        self.pos = [t(m.body_pos[b]) for b in range(m.nbody)]
        self.rot = [t(quat_to_mat(m.body_quat[b])) for b in range(m.nbody)]
        self.names, self.qadr, _, rng, _ = G.joint_info(m)
        self.lo, self.hi = t(rng[:, 0]), t(rng[:, 1])
        self.body_joint = {}
        for i, n in enumerate(self.names):
            j = m.joint(n).id
            self.body_joint[int(m.jnt_bodyid[j])] = (i, t(m.jnt_axis[j]))
        self.site_body = []
        self.site_pos = []
        for k in KEYPOINTS:
            s = m.site(f"kp_{k}").id
            self.site_body.append(int(m.site_bodyid[s]))
            self.site_pos.append(t(m.site_pos[s]))
        self.pelvis = m.body("pelvis").id

    def __call__(self, q, root_p, root_R):
        """q [B, 29], root_p [B, 3], root_R [B, 3, 3] -> keypoint positions [B, 17, 3]."""
        B = q.shape[0]
        Rw = [None] * self.m.nbody
        pw = [None] * self.m.nbody
        for b in range(1, self.m.nbody):
            p = self.parent[b]
            if b == self.pelvis:
                R, x = root_R, root_p
            else:
                R = Rw[p] @ self.rot[b]
                x = pw[p] + (Rw[p] @ self.pos[b])
                if b in self.body_joint:
                    i, ax = self.body_joint[b]
                    R = R @ axis_angle_mat(ax, q[:, i])
            Rw[b], pw[b] = R, x.expand(B, 3) if x.dim() == 1 else x
        out = [pw[b] + Rw[b] @ sp for b, sp in zip(self.site_body, self.site_pos)]
        return torch.stack(out, 1)


def human_scale(pos, fk):
    """Scale from the human to the G1: leg length and torso height ratios, averaged."""
    with torch.no_grad():
        q0 = torch.zeros(1, len(fk.names), dtype=fk.dtype, device=fk.device)
        g = fk(q0, torch.zeros(1, 3, dtype=fk.dtype, device=fk.device), torch.eye(3, dtype=fk.dtype, device=fk.device)[None])[0].cpu().numpy()
    leg = lambda P: np.median(np.linalg.norm(P[..., K["l_hip"], :] - P[..., K["l_knee"], :], axis=-1)
                              + np.linalg.norm(P[..., K["l_knee"], :] - P[..., K["l_ankle"], :], axis=-1))
    torso = lambda P: np.median(np.linalg.norm(P[..., K["chest"], :] - P[..., K["pelvis"], :], axis=-1))
    return 0.5 * (leg(g) / max(leg(pos), 1e-3) + torso(g) / max(torso(pos), 1e-3))


def heading_frame(pos):
    """Root orientation guess per frame from the hips and shoulders: x forward, y left, z up. [T, 3, 3]"""
    left = (pos[:, K["l_hip"]] - pos[:, K["r_hip"]]) + (pos[:, K["l_shoulder"]] - pos[:, K["r_shoulder"]])
    left[:, 2] = 0
    left /= np.maximum(np.linalg.norm(left, axis=1, keepdims=True), 1e-6)
    up = np.tile([0.0, 0.0, 1.0], (len(pos), 1))
    fwd = np.cross(left, up)
    return np.stack([fwd, left, up], -1)


def retarget(motion, fk, iters=200, lr=0.03, smooth=0.5):
    """Motion (already at the training frame rate) -> dict(q [T, 29], root_pos [T, 3], root_quat [T, 4], err [T])."""
    dev, dt = fk.device, fk.dtype
    pos = motion.pos.astype(np.float64)
    s = human_scale(pos, fk)
    target = pos * s
    T = len(target)
    tgt = torch.tensor(target, dtype=dt, device=dev)
    R0 = heading_frame(target)
    r6 = torch.tensor(np.concatenate([R0[:, :, 0], R0[:, :, 1]], 1), dtype=dt, device=dev, requires_grad=True)
    rp = torch.tensor(target[:, K["pelvis"]], dtype=dt, device=dev, requires_grad=True)
    mid = 0.5 * (fk.lo + fk.hi)
    u0 = torch.atanh(torch.clamp((0.0 - mid) / (0.5 * (fk.hi - fk.lo)), -0.95, 0.95))   # start at the zero pose
    u = u0.expand(T, -1).clone().requires_grad_(True)
    w = torch.tensor([KP_WEIGHT.get(k, 1.0) for k in KEYPOINTS], dtype=dt, device=dev)
    opt = torch.optim.Adam([u, rp, r6], lr=lr)
    for it in range(iters):
        q = mid + 0.5 * (fk.hi - fk.lo) * torch.tanh(u)
        R = rot6d_to_mat(r6)
        P = fk(q, rp, R)
        err = ((P - tgt) ** 2).sum(-1)
        loss = (err * w).mean()
        if T > 2:
            loss = loss + smooth * ((q[2:] - 2 * q[1:-1] + q[:-2]) ** 2).mean() \
                + smooth * ((rp[2:] - 2 * rp[1:-1] + rp[:-2]) ** 2).sum(-1).mean()
        loss = loss + 1e-3 * (q ** 2).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        if it == iters // 2:
            for g in opt.param_groups:
                g["lr"] = lr * 0.3
    with torch.no_grad():
        q = (mid + 0.5 * (fk.hi - fk.lo) * torch.tanh(u)).cpu().numpy()
        R = rot6d_to_mat(r6).cpu().numpy()
        P = fk(torch.tensor(q, dtype=dt, device=dev), rp, rot6d_to_mat(r6)).cpu().numpy()
    e = np.linalg.norm(P - target, axis=-1).mean(1)
    return dict(q=q.astype(np.float32), root_pos=rp.detach().cpu().numpy().astype(np.float32),
                root_quat=mat_to_quat(R).astype(np.float32), err=e.astype(np.float32), scale=float(s))


def resample(motion, fps):
    """Linear resampling of keypoint positions to the training rate."""
    T = len(motion.pos)
    if T < 2 or abs(motion.fps - fps) < 1e-6:
        return motion
    t_old = np.arange(T) / motion.fps
    t_new = np.arange(0.0, t_old[-1] + 1e-9, 1.0 / fps)
    flat = motion.pos.reshape(T, -1)
    out = np.stack([np.interp(t_new, t_old, flat[:, c]) for c in range(flat.shape[1])], 1)
    from .formats import Motion
    return Motion(motion.name, fps, out.reshape(len(t_new), *motion.pos.shape[1:]).astype(np.float32), dict(motion.meta))


def angle_wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi
