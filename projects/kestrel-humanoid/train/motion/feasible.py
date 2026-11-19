"""Make retargeted clips doable by the G1 instead of throwing them away (the plan's idea 2, second half).

Kinematic feasibility, after retargeting (which already keeps every joint inside its range):

* joint speeds: a clip whose joints move faster than the G1's motors allow is slowed down (time-stretched) just
  enough;
* ground: the root height is corrected so the lowest foot meets the floor, using a rolling minimum so jumps keep
  their flight;
* jitter: a light smoothing filter.

Each clip also gets a difficulty score (joint speed, root acceleration). Hard clips stay in; the tracking policy then
learns what is physically possible for them, and the failure-weighted sampling (idea 5) spends extra time on them.
"""
from __future__ import annotations

import numpy as np
import torch

from .formats import K

VMAX = 15.0                        # rad/s: comfortable G1 joint speed


def _interp_rows(a, n_new):
    T = len(a)
    if T < 2:
        return a
    x_old = np.linspace(0, 1, T)
    x_new = np.linspace(0, 1, n_new)
    flat = a.reshape(T, -1)
    out = np.stack([np.interp(x_new, x_old, flat[:, c]) for c in range(flat.shape[1])], 1)
    return out.reshape((n_new,) + a.shape[1:]).astype(a.dtype)


def _smooth(a, k=3):
    if len(a) <= k:
        return a
    pad = np.concatenate([a[:1].repeat(k // 2, 0), a, a[-1:].repeat(k // 2, 0)])
    ker = np.ones(k) / k
    flat = pad.reshape(len(pad), -1)
    out = np.stack([np.convolve(flat[:, c], ker, mode="valid") for c in range(flat.shape[1])], 1)
    return out.reshape(a.shape).astype(a.dtype)


def make_feasible(r, fk, fps):
    """r: retarget() output. Returns the corrected clip dict with velocities and a difficulty score."""
    q, rp, rq = r["q"].copy(), r["root_pos"].copy(), r["root_quat"].copy()
    stretch = 1.0
    if len(q) > 1:
        vmax = np.abs(np.diff(q, axis=0)).max() * fps
        if vmax > VMAX:
            stretch = min(vmax / VMAX, 3.0)
            n = int(round(len(q) * stretch))
            q, rp, rq = _interp_rows(q, n), _interp_rows(rp, n), _interp_rows(rq, n)
            rq /= np.linalg.norm(rq, axis=1, keepdims=True)
    q = _smooth(q)
    # ground contact: the lowest foot keypoint on the floor (rolling minimum over 1 s keeps jumps)
    from .retarget import quat_to_mat
    with torch.no_grad():
        R = torch.tensor(np.stack([quat_to_mat(x) for x in rq]), dtype=fk.dtype, device=fk.device)
        P = fk(torch.tensor(q, dtype=fk.dtype, device=fk.device), torch.tensor(rp, dtype=fk.dtype, device=fk.device),
               R).cpu().numpy()
    # soles: 3.5 cm below the ankle sites, 0.5 cm below the toe sites (which sit 3 cm below the ankle)
    feet = np.minimum(P[:, [K["l_ankle"], K["r_ankle"]], 2].min(1) - 0.035, P[:, [K["l_toe"], K["r_toe"]], 2].min(1) - 0.005)
    w = max(1, int(fps * 0.5))
    lowest = np.array([feet[max(0, i - w):i + w + 1].min() for i in range(len(feet))])
    rp[:, 2] -= _smooth(lowest[:, None], 9)[:, 0]
    qd = np.gradient(q, 1.0 / fps, axis=0) if len(q) > 1 else np.zeros_like(q)
    vel = np.gradient(rp, 1.0 / fps, axis=0) if len(rp) > 1 else np.zeros_like(rp)
    acc = np.gradient(vel, 1.0 / fps, axis=0) if len(rp) > 2 else np.zeros_like(rp)
    difficulty = float(np.percentile(np.abs(qd), 99) / VMAX + np.percentile(np.linalg.norm(acc, axis=1), 99) / 20.0)
    return dict(q=q.astype(np.float32), qd=qd.astype(np.float32), root_pos=rp.astype(np.float32),
                root_quat=rq.astype(np.float32), root_vel=vel.astype(np.float32), stretch=stretch, difficulty=difficulty)
