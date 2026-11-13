"""Vision: find each object in the head-camera image, then place it on the floor by geometry.

    python vision.py --make 8000      # render a labelled dataset of random scenes (data/vision.npz)
    python vision.py --train          # train the network (data/vision.pt), print validation errors

The network (a small fully convolutional net with a spatial-softmax head per object) answers two questions per
object: is it in view, and where in the image is its centre. Geometry does the rest: the ray through that pixel,
from the camera's known position and tilt (on the robot: IMU + joint angles), meets the horizontal plane at the
object's centre height, which gives bearing and distance. Learning only the image position, which is what an image
holds, makes distances far more accurate than asking a network to guess metres from pixels.

Labels come from the simulator (the object centre projected into the camera). On a real robot the same network is
trained on recorded images with clicked centres, or replaced by a pretrained detector.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
K = 5          # objects, in arena.NAMES order


class VisionNet(nn.Module):
    def __init__(self, k=K):
        super().__init__()
        self.k = k
        self.f = nn.Sequential(
            nn.Conv2d(5, 32, 5, stride=2, padding=2), nn.ReLU(),           # 36 x 48
            nn.Conv2d(32, 48, 3, stride=2, padding=1), nn.ReLU(),          # 18 x 24
            nn.Conv2d(48, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=2, dilation=2), nn.ReLU())
        self.heat = nn.Conv2d(64, k, 1)
        self.vis = nn.Linear(64 * 2, k)

    def forward(self, x):                      # x: (B, 72, 96, 3) uint8 -> vis logits (B, k), uv (B, k, 2) in [0, 1]
        B = x.shape[0]
        x = x.permute(0, 3, 1, 2).float() / 255.0
        H, W = x.shape[2], x.shape[3]
        yy = torch.linspace(0, 1, H).view(1, 1, H, 1).expand(B, 1, H, W)
        xx = torch.linspace(0, 1, W).view(1, 1, 1, W).expand(B, 1, H, W)
        h = self.f(torch.cat([x, xx, yy], 1))   # coordinate channels help the net place things
        hm = self.heat(h)                       # (B, k, 18, 24)
        b, k, hh, ww = hm.shape
        p = Fn.softmax(hm.view(b, k, -1) * 2.0, -1).view(b, k, hh, ww)
        gy = (torch.arange(hh).float() + 0.5) / hh
        gx = (torch.arange(ww).float() + 0.5) / ww
        u = (p.sum(2) * gx).sum(-1)
        v = (p.sum(3) * gy).sum(-1)
        g = torch.cat([h.mean((2, 3)), h.amax((2, 3))], 1)
        return self.vis(g), torch.stack([u, v], -1)


def ray_to_floor_point(u, v, cam_pos, cam_mat, z_plane):
    """Pixel (u, v in [0, 1]) -> world point where its ray meets the plane z = z_plane (None if it never does)."""
    from arena import CAM_W, CAM_H, CAM_FOVY
    f = (CAM_H / 2) / math.tan(math.radians(CAM_FOVY / 2))
    dc = np.array([(u - 0.5) * CAM_W / f, -(v - 0.5) * CAM_H / f, -1.0])
    dw = cam_mat @ dc
    if dw[2] > -1e-4:
        return None
    s = (z_plane - cam_pos[2]) / dw[2]
    if s <= 0:
        return None
    return cam_pos + s * dw


class Eye:
    """see(img, cam_pos, cam_mat, pose) -> name -> (visible, bearing rad, distance m) from the robot's base."""

    def __init__(self, path=DATA / "vision.pt"):
        self.net = VisionNet()
        self.net.load_state_dict(torch.load(path, map_location="cpu"))
        self.net.eval()

    def see(self, img, cam_pos, cam_mat, pose, thresh=0.5):
        from arena import NAMES, OBJECTS
        with torch.no_grad():
            vl, uv = self.net(torch.from_numpy(np.ascontiguousarray(img))[None])
        pv = torch.sigmoid(vl)[0].numpy()
        uv = uv[0].numpy()
        rx, ry, yaw = pose
        out = {}
        for i, n in enumerate(NAMES):
            pt = ray_to_floor_point(uv[i, 0], uv[i, 1], cam_pos, cam_mat, OBJECTS[n][3])
            if pt is None:
                out[n] = (False, 0.0, 99.0)
                continue
            dx, dy = pt[0] - rx, pt[1] - ry
            b = (math.atan2(dy, dx) - yaw + math.pi) % (2 * math.pi) - math.pi
            out[n] = (bool(pv[i] > thresh), b, math.hypot(dx, dy))
        return out


def make(n, seed=0):
    import arena as A
    a = A.Arena(seed=seed)
    rng = np.random.default_rng(seed)
    X = np.zeros((n, A.CAM_H, A.CAM_W, 3), np.uint8)
    Y = np.zeros((n, K, 3), np.float32)                 # visible, u, v
    for i in range(n):
        x = rng.uniform(A.X_MIN + 0.5, A.X_MAX - 0.5)
        y = rng.uniform(A.Y_MIN + 0.5, A.Y_MAX - 12.0)
        yaw = math.pi / 2 + rng.uniform(-1.2, 1.2)
        near = (-1.5, 6.0) if rng.random() < 0.5 else (-2.0, 11.0)     # half the scenes close up
        a.place(near=near, robot_xy=(x, y), yaw=yaw)
        d = a.e.d[0]                            # the walking robot's head bobs: tilt the base a little
        pit, rol = rng.uniform(-0.08, 0.08), rng.uniform(-0.06, 0.06)
        cy, sy, cp, sp, cr, sr = (math.cos(yaw / 2), math.sin(yaw / 2), math.cos(pit / 2), math.sin(pit / 2),
                                  math.cos(rol / 2), math.sin(rol / 2))
        d.qpos[3:7] = [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy,
                       cr * cp * sy - sr * sp * cy]
        X[i] = a.ego()
        for j, nm in enumerate(A.NAMES):
            ox, oy = a.pos[nm]
            u, v, z = a.project((ox, oy, A.OBJECTS[nm][3]))
            vis = u is not None and 0.02 < u < 0.98 and 0.02 < v < 0.98 and 0.3 < z < 13.0
            Y[i, j] = (float(vis), u if vis else 0.5, v if vis else 0.5)
        if (i + 1) % 1000 == 0:
            print(f"  rendered {i + 1}/{n}", flush=True)
    DATA.mkdir(exist_ok=True)
    np.savez_compressed(DATA / "vision.npz", X=X, Y=Y)
    print(f"wrote {DATA / 'vision.npz'}: {n} images, in-view fraction per object {Y[:, :, 0].mean(0).round(2)}")


def train(epochs=30, seed=0):
    from arena import CAM_W, CAM_H
    torch.manual_seed(seed)
    torch.set_num_threads(2)
    z = np.load(DATA / "vision.npz")
    X, Y = torch.from_numpy(z["X"]), torch.from_numpy(z["Y"])
    nv = max(300, len(X) // 10)
    Xt, Yt, Xv, Yv = X[nv:], Y[nv:], X[:nv], Y[:nv]
    net = VisionNet()
    opt = torch.optim.Adam(net.parameters(), lr=1.5e-3)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 1.5e-3, total_steps=epochs * ((len(Xt) + 63) // 64))
    bce = nn.BCEWithLogitsLoss()
    for ep in range(epochs):
        net.train()
        perm = torch.randperm(len(Xt))
        tot = 0.0
        for k in range(0, len(Xt), 64):
            idx = perm[k:k + 64]
            xb, yb = Xt[idx], Yt[idx]
            if torch.rand(1).item() < 0.5:
                xb = (xb.float() * torch.empty(len(xb), 1, 1, 1).uniform_(0.8, 1.2)).clamp(0, 255).byte()
            vl, uv = net(xb)
            m = yb[:, :, 0] > 0.5
            l_uv = (uv - yb[:, :, 1:3]).abs().sum(-1)[m].mean() if m.any() else uv.sum() * 0
            loss = bce(vl, yb[:, :, 0]) + 10.0 * l_uv
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += loss.item() * len(idx)
        if ep % 5 == 4 or ep == epochs - 1:
            net.eval()
            with torch.no_grad():
                vl, uv = net(Xv)
            m = Yv[:, :, 0] > 0.5
            acc = ((vl > 0) == m).float().mean().item()
            err = (uv - Yv[:, :, 1:3]).abs()[m]
            print(f"  epoch {ep + 1}: loss {tot / len(Xt):.4f}, in-view accuracy {acc:.1%}, centre error "
                  f"{err[:, 0].median().item() * CAM_W:.1f} px across, {err[:, 1].median().item() * CAM_H:.1f} px down "
                  f"(median)", flush=True)
    torch.save(net.state_dict(), DATA / "vision.pt")
    print(f"wrote {DATA / 'vision.pt'}")


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    ap = argparse.ArgumentParser()
    ap.add_argument("--make", type=int, default=0)
    ap.add_argument("--train", action="store_true")
    ap.add_argument("--epochs", type=int, default=30)
    a = ap.parse_args()
    if a.make:
        make(a.make)
    if a.train:
        train(a.epochs)
