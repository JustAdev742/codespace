"""Vision: a small CNN that reads the 96 x 72 head-camera image and reports, for each object in arena.NAMES, whether it
is in view, its bearing (rad, + is left) and its distance (m).

    python vision.py --make 5000      # render a labelled dataset of random scenes (data/vision.npz)
    python vision.py --train          # train the network (data/vision.pt), print validation errors

Labels come from the simulator, so the network learns from as many images as the CPU can render. On a real robot the
same network is trained on recorded images with labels from a tape measure, or replaced by a pretrained detector;
vla.py only needs (visible, bearing, distance) per object.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
K = 5          # objects


class VisionNet(nn.Module):
    def __init__(self, k=K):
        super().__init__()
        self.k = k
        self.f = nn.Sequential(
            nn.Conv2d(3, 24, 5, stride=2, padding=2), nn.ReLU(),
            nn.Conv2d(24, 48, 3, stride=2, padding=1), nn.ReLU(),
            nn.Conv2d(48, 64, 3, stride=2, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, stride=2, padding=1), nn.ReLU())
        self.h = nn.Sequential(nn.Flatten(), nn.Linear(64 * 5 * 6, 256), nn.ReLU(), nn.Linear(256, k * 4))

    def forward(self, x):                      # x: (B, 72, 96, 3) uint8
        x = x.permute(0, 3, 1, 2).float() / 255.0
        return self.h(self.f(x)).view(-1, self.k, 4)   # vis logit, sin b, cos b, dist / 10


def decode(out):
    """Network output -> list of dicts per image: name -> (p_visible, bearing, distance)."""
    from arena import NAMES
    out = out.detach().numpy()
    res = []
    for o in out:
        res.append({n: (float(1 / (1 + math.exp(-o[i, 0]))), float(math.atan2(o[i, 1], o[i, 2])), float(o[i, 3] * 10))
                    for i, n in enumerate(NAMES)})
    return res


class Eye:
    """Loads the trained network; see() returns name -> (visible, bearing, distance)."""

    def __init__(self, path=DATA / "vision.pt"):
        self.net = VisionNet()
        self.net.load_state_dict(torch.load(path, map_location="cpu"))
        self.net.eval()

    def see(self, img, thresh=0.5):
        with torch.no_grad():
            r = decode(self.net(torch.from_numpy(np.ascontiguousarray(img))[None]))[0]
        return {n: (p > thresh, b, d) for n, (p, b, d) in r.items()}


def make(n, seed=0):
    import arena as A
    a = A.Arena(seed=seed)
    rng = np.random.default_rng(seed)
    X = np.zeros((n, A.CAM_H, A.CAM_W, 3), np.uint8)
    Y = np.zeros((n, K, 4), np.float32)
    for i in range(n):
        x = rng.uniform(A.X_MIN + 0.5, A.X_MAX - 0.5)
        y = rng.uniform(A.Y_MIN + 0.5, A.Y_MAX - 12.0)
        yaw = math.pi / 2 + rng.uniform(-1.2, 1.2)
        a.place(near=(-2.0, 10.0), robot_xy=(x, y), yaw=yaw)
        d = a.e.d[0]                            # the walking robot's head bobs: tilt the base a little
        pit, rol = rng.uniform(-0.08, 0.08), rng.uniform(-0.06, 0.06)
        cy, sy, cp, sp, cr, sr = math.cos(yaw / 2), math.sin(yaw / 2), math.cos(pit / 2), math.sin(pit / 2), math.cos(rol / 2), math.sin(rol / 2)
        d.qpos[3:7] = [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy]
        X[i] = a.ego()
        for j, nm in enumerate(A.NAMES):
            vis, b, dist = a.truth()[nm]
            Y[i, j] = (float(vis), math.sin(b), math.cos(b), dist / 10)
        if (i + 1) % 500 == 0:
            print(f"  rendered {i + 1}/{n}", flush=True)
    DATA.mkdir(exist_ok=True)
    np.savez_compressed(DATA / "vision.npz", X=X, Y=Y)
    print(f"wrote {DATA / 'vision.npz'}: {n} images, visible fraction per object {Y[:, :, 0].mean(0).round(2)}")


def train(epochs=25, seed=0):
    torch.manual_seed(seed)
    torch.set_num_threads(2)
    z = np.load(DATA / "vision.npz")
    X, Y = torch.from_numpy(z["X"]), torch.from_numpy(z["Y"])
    n = len(X)
    nv = max(200, n // 10)
    Xt, Yt, Xv, Yv = X[nv:], Y[nv:], X[:nv], Y[:nv]
    net = VisionNet()
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs)
    bce = nn.BCEWithLogitsLoss()

    def loss_fn(o, y):
        vis = y[:, :, 0]
        l_vis = bce(o[:, :, 0], vis)
        m = vis > 0.5
        l_reg = ((o[:, :, 1:4] - y[:, :, 1:4]) ** 2).sum(-1)[m].mean() if m.any() else o.sum() * 0
        return l_vis + 2.0 * l_reg

    for ep in range(epochs):
        net.train()
        perm = torch.randperm(len(Xt))
        tot = 0.0
        for k in range(0, len(Xt), 64):
            idx = perm[k:k + 64]
            xb = Xt[idx]
            if torch.rand(1).item() < 0.5:                  # brightness jitter
                xb = (xb.float() * torch.empty(len(xb), 1, 1, 1).uniform_(0.8, 1.2)).clamp(0, 255).byte()
            loss = loss_fn(net(xb), Yt[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item() * len(idx)
        sched.step()
        if ep % 5 == 4 or ep == epochs - 1:
            print(f"  epoch {ep + 1}: train loss {tot / len(Xt):.4f}, " + evaluate(net, Xv, Yv), flush=True)
    torch.save(net.state_dict(), DATA / "vision.pt")
    print(f"wrote {DATA / 'vision.pt'}")


def evaluate(net, Xv, Yv):
    net.eval()
    with torch.no_grad():
        o = net(Xv)
    vis = Yv[:, :, 0] > 0.5
    pv = o[:, :, 0] > 0
    acc = (pv == vis).float().mean().item()
    b_err = torch.atan2(o[:, :, 1], o[:, :, 2]) - torch.atan2(Yv[:, :, 1], Yv[:, :, 2])
    b_err = torch.remainder(b_err + math.pi, 2 * math.pi) - math.pi
    d_err = (o[:, :, 3] - Yv[:, :, 3]) * 10
    return (f"in-view accuracy {acc:.1%}, bearing error {math.degrees(b_err[vis].abs().median().item()):.1f} deg (median), "
            f"distance error {d_err[vis].abs().median().item():.2f} m (median)")


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    ap = argparse.ArgumentParser()
    ap.add_argument("--make", type=int, default=0)
    ap.add_argument("--train", action="store_true")
    ap.add_argument("--epochs", type=int, default=25)
    a = ap.parse_args()
    if a.make:
        make(a.make)
    if a.train:
        train(a.epochs)
