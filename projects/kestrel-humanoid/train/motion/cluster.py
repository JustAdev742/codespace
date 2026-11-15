"""Novelty-weighted sampling and motion families (the plan's ideas 1 and 3).

Every clip is cut into 1 s windows; each window gets a feature vector (pose, pose spread, speed in the body frame,
height, turning), which is standardised and projected to 16 dimensions (PCA). k-means groups similar windows; a
window's sampling weight is the inverse of its group's size, so the hundredth walking clip costs no more training
than one rare motion, yet no clip is removed. The groups are then clustered again into F families, one per
specialist GPU.
"""
from __future__ import annotations

import numpy as np
import torch


def window_features(q, root_pos, root_quat, fps, win):
    from .retarget import quat_to_mat
    out = []
    for s in range(0, max(1, len(q) - win + 1), max(1, win // 2)):
        e = min(len(q), s + win)
        qq = q[s:e]
        R = quat_to_mat(root_quat[s])
        v = (root_pos[e - 1] - root_pos[s]) / max(1e-3, (e - 1 - s) / fps)
        vb = R.T @ v
        yaw = lambda qt: np.arctan2(2 * (qt[0] * qt[3] + qt[1] * qt[2]), 1 - 2 * (qt[2] ** 2 + qt[3] ** 2))
        dyaw = np.angle(np.exp(1j * (yaw(root_quat[e - 1]) - yaw(root_quat[s])))) / max(1e-3, (e - 1 - s) / fps)
        f = np.concatenate([qq.mean(0), qq.std(0), vb, [root_pos[s:e, 2].mean(), root_pos[s:e, 2].std(), dyaw]])
        out.append((s, f))
    return out


def kmeans(X, k, iters=30, seed=0):
    g = torch.Generator().manual_seed(seed)
    X = torch.as_tensor(X, dtype=torch.float32)
    k = max(1, min(k, len(X)))
    C = X[torch.randperm(len(X), generator=g)[:k]].clone()
    for _ in range(iters):
        lab = torch.cdist(X, C).argmin(1)
        for j in range(k):
            sel = X[lab == j]
            if len(sel):
                C[j] = sel.mean(0)
    return lab.numpy(), C.numpy()


def assign(feats, families=8, groups=None, seed=0):
    """feats [N, D] -> (sampling weight [N], family id [N], group id [N])."""
    X = np.asarray(feats, np.float64)
    X = (X - X.mean(0)) / (X.std(0) + 1e-6)
    if X.shape[0] > 3:
        U, S, Vt = np.linalg.svd(X - X.mean(0), full_matrices=False)
        X = X @ Vt[:min(16, Vt.shape[0])].T
    n = len(X)
    groups = groups or int(np.clip(n // 4, 1, 512))
    lab, C = kmeans(X, groups, seed=seed)
    size = np.bincount(lab, minlength=len(C)).astype(float)
    w = 1.0 / np.maximum(size[lab], 1.0)
    w /= w.sum()
    fam_of_group, _ = kmeans(C, min(families, len(C)), seed=seed + 1)
    fam = fam_of_group[lab]
    return w.astype(np.float32), fam.astype(np.int32), lab.astype(np.int32)
