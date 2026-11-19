"""Text-to-motion: describe a movement in words and a generative model makes one, for the G1.

    python -m motion.generator train --libs runs/motion/bandai_library.npz runs/motion/cmu_library.npz \\
        --captions runs/motion/cmu_captions.json --out runs/motion/generator --hours 6
    python -m motion.generator sample --ckpt runs/motion/generator/model.pt --text "a person dances happily"

A diffusion model (the method behind today's image and motion generators) learns from the retargeted motion
libraries what human movement looks like and how it goes with words: each training clip has a description (CMU's own,
or one written from Bandai's action and style labels), turned into numbers by a small pretrained sentence encoder
(all-MiniLM-L6-v2) so that any phrasing works ("greet someone" lands near "wave"). Generating starts from noise and
removes it in 50 steps, steered by the text (classifier-free guidance), producing 3.2 s of whole-body G1 motion at a
time; longer motions continue from the end of the last piece. Parts can be fixed in advance and the model fills in the
rest (inpainting): the first frames (smooth continuation), or the legs and the body's path (walking from the walker,
upper body from the words).

What it can make is bounded by what it learned: combinations, variations and blends of the kinds of movement in the
libraries, not motions unlike anything in them. More data in, more movements out. No fighting motions are in the
data, and prompts asking for strikes are refused.

Output goes to the mover (mover.py), whose balance controller makes it physical or refuses what would fall over.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .matching import action_of
from .safety import _RX as COMBAT

FPS = 20                    # generator frame rate
T = 64                      # frames per window (3.2 s)
NQ = 29                     # G1 joints
D = NQ + 6                  # + root height, tilt (2), local velocity x y, yaw rate
LEG_DIMS = list(range(12))
ROOT_DIMS = list(range(NQ, D))
TEXT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


# ------------------------------------------------------------------------------------------------------- features
def _yaw(q):
    w, x, y, z = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    return np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


def _qmul(a, b):
    w1, x1, y1, z1 = np.moveaxis(a, -1, 0)
    w2, x2, y2, z2 = np.moveaxis(b, -1, 0)
    return np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], -1)


def _quat_yaw(y):
    return np.stack([np.cos(y / 2), np.zeros_like(y), np.zeros_like(y), np.sin(y / 2)], -1)


def clip_features(q, rp, rq, fps_in=50.0, fps_out=FPS):
    """[T, D] generator features from a library clip: joints, root height, tilt, local velocity, yaw rate."""
    yaw = np.unwrap(_yaw(rq))
    tilt = _qmul(_quat_yaw(-yaw), rq)
    tilt *= np.sign(tilt[:, :1] + 1e-9)
    dt = 1.0 / fps_in
    v = np.gradient(rp[:, :2], dt, axis=0) if len(rp) > 1 else np.zeros((len(rp), 2))
    c, s = np.cos(yaw), np.sin(yaw)
    vl = np.stack([c * v[:, 0] + s * v[:, 1], -s * v[:, 0] + c * v[:, 1]], 1)
    wz = np.gradient(yaw, dt) if len(yaw) > 1 else np.zeros(len(yaw))
    f = np.concatenate([q, rp[:, 2:3], tilt[:, 1:3], vl, wz[:, None]], 1)
    n = max(2, int(round(len(f) * fps_out / fps_in)))
    t_old, t_new = np.arange(len(f)) / fps_in, np.arange(n) / fps_out
    return np.stack([np.interp(t_new, t_old, f[:, k]) for k in range(f.shape[1])], 1).astype(np.float32)


def features_to_motion(f, fps=FPS, start_xy=(0.0, 0.0), start_yaw=0.0):
    """Generator features [N, D] -> q [N, 29], root_pos [N, 3], root_quat [N, 4] (integrating the root path)."""
    q = f[:, :NQ]
    yaw = start_yaw + np.concatenate([[0.0], np.cumsum(f[:-1, D - 1]) / fps])
    c, s = np.cos(yaw), np.sin(yaw)
    vw = np.stack([c * f[:, NQ + 3] - s * f[:, NQ + 4], s * f[:, NQ + 3] + c * f[:, NQ + 4]], 1)
    xy = np.asarray(start_xy, float) + np.concatenate([[[0.0, 0.0]], np.cumsum(vw[:-1], 0) / fps])
    tx, ty = f[:, NQ + 1], f[:, NQ + 2]
    tw = np.sqrt(np.clip(1 - tx ** 2 - ty ** 2, 0, 1))
    tilt = np.stack([tw, tx, ty, np.zeros_like(tx)], 1)
    rq = _qmul(_quat_yaw(yaw), tilt)
    rq /= np.linalg.norm(rq, axis=1, keepdims=True)
    rp = np.concatenate([xy, f[:, NQ:NQ + 1]], 1)
    return q, rp, rq


def upsample(x, fps_in, fps_out):
    n = max(2, int(round(len(x) * fps_out / fps_in)))
    t_old, t_new = np.arange(len(x)) / fps_in, np.arange(n) / fps_out
    flat = x.reshape(len(x), -1)
    out = np.stack([np.interp(t_new, t_old, flat[:, k]) for k in range(flat.shape[1])], 1)
    return out.reshape((n,) + x.shape[1:])


# -------------------------------------------------------------------------------------------------------- captions
BANDAI_ACTION = {
    "walk": ["walks forward", "walks", "takes a walk"], "walk-back": ["walks backward", "steps backwards"],
    "walk-left": ["walks to the left", "steps sideways to the left"], "walk-right": ["walks to the right",
                                                                                      "steps sideways to the right"],
    "walk-turn-left": ["walks and turns left", "turns to the left while walking"],
    "walk-turn-right": ["walks and turns right", "turns to the right while walking"],
    "run": ["runs", "jogs"], "dash": ["dashes forward", "sprints"], "bow": ["bows", "takes a bow", "bows politely"],
    "bye": ["waves goodbye", "says goodbye with a wave"], "byebye": ["waves goodbye with both hands", "waves bye bye"],
    "call": ["beckons someone over", "calls someone with a hand gesture"],
    "guide": ["points the way", "shows the way with an arm", "guides someone with a hand"],
    "raise-up-both-hands": ["raises both hands", "puts both arms up"], "raise-up-left-hand": ["raises the left hand"],
    "raise-up-right-hand": ["raises the right hand", "puts a hand up"],
    "respond": ["responds with a gesture", "answers with a nod and a gesture"],
    "wave-both-hands": ["waves both hands", "waves with both arms"], "wave-left-hand": ["waves the left hand"],
    "wave-right-hand": ["waves the right hand", "waves hello", "waves"],
}
BANDAI_STYLE = {"normal": "", "active": "energetically", "tired": "tiredly", "old": "like an old person",
                "proud": "proudly", "happy": "happily", "sad": "sadly", "angry": "angrily", "feminine": "femininely",
                "masculinity": "in a masculine way", "childish": "like a child", "giant": "like a giant",
                "chimpira": "with a swagger", "musical": "theatrically", "not-confident": "without confidence",
                "youthful": "youthfully", "elderly": "like an old person", "masculine": "in a masculine way"}


def captions_for(name, cmu):
    """Text variants for a library clip, or [] when it has none."""
    name = str(name)
    if name in cmu:
        d = re.sub(r"\s+", " ", cmu[name].replace("_", " ")).strip().lower()
        return [d, f"a person {d}", f"someone {d}"] if d else []
    if name.startswith("dataset-"):
        act, sty = action_of(name)
        if act not in BANDAI_ACTION:
            return []
        adv = BANDAI_STYLE.get(sty, sty.replace("-", " "))
        out = []
        for a in BANDAI_ACTION[act]:
            out.append(f"a person {a} {adv}".strip())
            out.append(f"{a} {adv}".strip())
        return out
    return []


def consistent(f, caption):
    """False for a clip that travels mostly sideways although its description says nothing about sideways, back,
    turning or circling: a sign that its recorded facing direction is off (a few CMU subjects)."""
    sp = np.hypot(f[:, NQ + 3], f[:, NQ + 4])
    moving = sp > 0.3
    if moving.mean() < 0.3:
        return True
    fwd = np.abs(f[moving, NQ + 3]).mean()
    side = np.abs(f[moving, NQ + 4]).mean()
    if side <= fwd:
        return True
    return bool(re.search(r"side|left|right|back|turn|circle|random|crab|around|zig|diagonal", caption))


def refused(text):
    t = re.sub(r"[\s\-\.]", "_", text.lower())
    return bool(COMBAT.search(t)) or bool(re.search(r"\b(hit|punch|kick|hurt|attack|stab|choke|strangle)", text.lower()))


class TextEncoder:
    def __init__(self, name=TEXT_MODEL):
        from transformers import AutoModel, AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(name)
        self.model = AutoModel.from_pretrained(name).eval()
        self.cache = {}

    @torch.no_grad()
    def __call__(self, texts):
        new = [t for t in dict.fromkeys(texts) if t not in self.cache]
        for i in range(0, len(new), 256):
            chunk = new[i:i + 256]
            b = self.tok(chunk, padding=True, truncation=True, max_length=48, return_tensors="pt")
            h = self.model(**b).last_hidden_state
            m = b["attention_mask"][..., None].float()
            e = F.normalize((h * m).sum(1) / m.sum(1), dim=-1).numpy()
            for t, v in zip(chunk, e):
                self.cache[t] = v
        return np.stack([self.cache[t] for t in texts]).astype(np.float32)


# ------------------------------------------------------------------------------------------------------------ data
class MotionSet:
    def __init__(self, libs, caption_files=(), log=print):
        cmu = {}
        for c in caption_files:
            cmu.update(json.loads(Path(c).read_text()))
        self.clips, self.caps, self.texts = [], [], []
        for lib in libs:
            z = np.load(lib, allow_pickle=True)
            q, rp, rq = z["q"], z["root_pos"], z["root_quat"]
            n_used = n_bad = 0
            for s, L, name in zip(z["clip_start"], z["clip_len"], z["clip_name"]):
                caps = captions_for(name, cmu)
                if not caps or L < 25:
                    continue
                f = clip_features(q[s:s + L], rp[s:s + L], rq[s:s + L])
                if not np.isfinite(f).all() or not consistent(f, caps[0]):
                    n_bad += 1
                    continue
                ids = []
                for c in caps:
                    ids.append(len(self.texts))
                    self.texts.append(c)
                self.clips.append(f)
                self.caps.append(ids)
                n_used += 1
            log(f"{lib}: {n_used} captioned clips ({n_bad} left out: motion contradicts its description)")
        allf = np.concatenate(self.clips)
        self.mu = allf.mean(0)
        self.sd = np.maximum(allf.std(0), 0.02)
        self.lens = np.array([len(c) for c in self.clips])
        self.p = np.minimum(self.lens, 20 * FPS).astype(float)
        self.p /= self.p.sum()
        log(f"{len(self.clips)} clips, {len(allf) / FPS / 3600:.2f} h, {len(self.texts)} captions")

    def batch(self, B, rng, emb):
        """x0 [B, T, D] (normalised), valid [B, T], text embeddings [B, 384] (zeros = no text), known, mask."""
        x = np.zeros((B, T, D), np.float32)
        valid = np.zeros((B, T), np.float32)
        txt = np.zeros((B, emb.shape[1]), np.float32)
        for b in range(B):
            c = rng.choice(len(self.clips), p=self.p)
            f = (self.clips[c] - self.mu) / self.sd
            L = len(f)
            s = rng.integers(0, max(1, L - T + 1))
            w = f[s:s + T]
            x[b, :len(w)] = w
            x[b, len(w):] = w[-1]                     # hold the last pose
            valid[b, :len(w)] = 1
            txt[b] = emb[rng.choice(self.caps[c])]
        known, mask = make_masks(B, rng, x)
        return x, valid, txt, known, mask


def make_masks(B, rng, x):
    """Training-time conditioning: nothing (45%), a prefix (35%), legs + root path given (12%), keyframes (8%)."""
    mask = np.zeros((B, T, D), np.float32)
    for b in range(B):
        r = rng.random()
        if r < 0.45:
            continue
        if r < 0.80:
            mask[b, :rng.integers(2, 25)] = 1
        elif r < 0.92:
            mask[b, :, LEG_DIMS + ROOT_DIMS] = 1
        else:
            for k in rng.choice(T, size=rng.integers(1, 4), replace=False):
                mask[b, k] = 1
    return x * mask, mask


# ----------------------------------------------------------------------------------------------------------- model
def cosine_schedule(K, s=0.008):
    t = np.linspace(0, K, K + 1) / K
    f = np.cos((t + s) / (1 + s) * math.pi / 2) ** 2
    ab = f / f[0]
    return torch.tensor(np.clip(ab[1:], 1e-5, 0.9999), dtype=torch.float32)


class Denoiser(nn.Module):
    def __init__(self, d=256, layers=6, heads=4, ff=768, text_dim=384, K=100, dropout=0.1):
        super().__init__()
        self.K = K
        self.inp = nn.Linear(3 * D, d)
        self.pos = nn.Parameter(torch.randn(T + 2, d) * 0.02)
        self.t_mlp = nn.Sequential(nn.Linear(d, d), nn.SiLU(), nn.Linear(d, d))
        self.txt = nn.Linear(text_dim, d)
        layer = nn.TransformerEncoderLayer(d, heads, ff, dropout, activation="gelu", batch_first=True, norm_first=True)
        self.enc = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)
        self.out = nn.Linear(d, D)
        self.d = d
        self.register_buffer("ab", cosine_schedule(K))

    def t_embed(self, k):
        half = self.d // 2
        fr = torch.exp(-math.log(10000) * torch.arange(half, device=k.device) / half)
        a = k.float()[:, None] * fr[None]
        return self.t_mlp(torch.cat([a.sin(), a.cos()], 1))

    def forward(self, x_t, k, txt, known, mask):
        h = self.inp(torch.cat([x_t, known, mask], -1))
        tok = torch.stack([self.t_embed(k), self.txt(txt)], 1)
        h = torch.cat([tok, h], 1) + self.pos[None]
        h = self.norm(self.enc(h))
        return self.out(h[:, 2:])                     # predicts the clean motion x0


def loss_fn(model, x0, valid, txt, known, mask, gen, p_uncond=0.1):
    B = x0.shape[0]
    k = torch.randint(0, model.K, (B,), generator=gen)
    noise = torch.randn(x0.shape, generator=gen)
    ab = model.ab[k][:, None, None]
    x_t = ab.sqrt() * x0 + (1 - ab).sqrt() * noise
    drop = (torch.rand(B, generator=gen) < p_uncond).float()[:, None]
    pred = model(x_t, k, txt * (1 - drop), known, mask)
    w = valid[..., None]
    l_pos = (((pred - x0) ** 2) * w).sum() / (w.sum() * D)
    wv = (valid[:, 1:] * valid[:, :-1])[..., None]
    l_vel = ((((pred[:, 1:] - pred[:, :-1]) - (x0[:, 1:] - x0[:, :-1])) ** 2) * wv).sum() / (wv.sum() * D)
    return l_pos + 2.0 * l_vel, l_pos.item(), l_vel.item()


@torch.no_grad()
def sample(model, txt, known=None, mask=None, steps=50, guidance=2.5, gen=None, n=1):
    """DDIM sampling with classifier-free guidance; known/mask [n, T, D] fix parts of the motion (inpainting)."""
    model.eval()
    if known is None:
        known = torch.zeros(n, T, D)
        mask = torch.zeros(n, T, D)
    x = torch.randn((n, T, D), generator=gen)
    ks = np.linspace(model.K - 1, 0, steps).round().astype(int)
    txt2 = torch.cat([txt, torch.zeros_like(txt)])
    for i, k in enumerate(ks):
        kk = torch.full((2 * n,), int(k))
        out = model(torch.cat([x, x]), kk, txt2, torch.cat([known, known]), torch.cat([mask, mask]))
        x0 = out[n:] + guidance * (out[:n] - out[n:])
        x0 = mask * known + (1 - mask) * x0
        ab = model.ab[k]
        if i == len(ks) - 1:
            x = x0
            break
        ab_prev = model.ab[ks[i + 1]]
        eps = (x - ab.sqrt() * x0) / (1 - ab).sqrt()
        x = ab_prev.sqrt() * x0 + (1 - ab_prev).sqrt() * eps
    return x


# ----------------------------------------------------------------------------------------------------- generating
class Generator:
    """Loads a trained model; makes motion from text, of any length, continuing smoothly from the last piece."""

    def __init__(self, ckpt, encoder=None, threads=None):
        if threads:
            torch.set_num_threads(threads)
        z = torch.load(ckpt, map_location="cpu", weights_only=False)
        self.model = Denoiser(**z["config"])
        self.model.load_state_dict(z["model"])
        self.model.eval()
        self.mu, self.sd = z["mu"], z["sd"]
        self.enc = encoder or TextEncoder(z.get("text_model", TEXT_MODEL))
        self.steps_done = z.get("step", 0)

    def norm(self, f):
        return (f - self.mu) / self.sd

    def denorm(self, f):
        return f * self.sd + self.mu

    def generate(self, text, seconds=3.2, prefix=None, legs_root=None, guidance=2.5, steps=50, seed=None):
        """Features [N, D] at 20 fps. prefix: earlier features to continue from (the last 16 frames are kept);
        legs_root: [N, D] features whose legs and root path must be followed (e.g. from the walker)."""
        if refused(text):
            raise ValueError("refused: the generator makes no striking or harmful motions")
        gen = torch.Generator().manual_seed(seed if seed is not None else int(time.time() * 1000) % 2 ** 31)
        e = torch.tensor(self.enc([text]))
        N = max(1, int(round(seconds * FPS)))
        out = []
        P = 16
        prev = None if prefix is None else self.norm(np.asarray(prefix, np.float32))[-P:]
        made = 0
        while made < N:
            known = np.zeros((1, T, D), np.float32)
            mask = np.zeros((1, T, D), np.float32)
            start = 0
            if prev is not None:
                p = len(prev)
                known[0, :p], mask[0, :p] = prev, 1
                start = p
            if legs_root is not None:
                lr = self.norm(np.asarray(legs_root, np.float32))
                seg = lr[max(0, made - start):max(0, made - start) + T]
                idx = LEG_DIMS + ROOT_DIMS
                known[0][:len(seg), idx] = seg[:, idx]
                mask[0][:len(seg), idx] = 1
            x = sample(self.model, e, torch.tensor(known), torch.tensor(mask), steps, guidance, gen)[0].numpy()
            new = x[start:]
            out.append(new)
            made += len(new)
            prev = x[-P:]
        return self.denorm(np.concatenate(out)[:N])


class GenStream:
    """Plays generated motion to the mover at 50 Hz with the Matcher's interface; generates ahead, continuing."""

    def __init__(self, generator, text="a person stands still", chunk=3.2):
        self.g, self.text, self.chunk = generator, text, chunk
        self.buf = None                  # 50 Hz q [N, 29], root_quat [N, 4]
        self.feat = None                 # 20 fps features generated so far (for continuation)
        self.i = 0
        self.action = "generated"

    def set_text(self, text):
        if text != self.text:
            self.text = text
            if self.buf is not None:      # keep 0.3 s of the current motion, then the new text continues from it
                keep = self.i + 15
                self.buf = {k: v[:keep] for k, v in self.buf.items()}
                self.feat = self.feat[:int(keep * FPS / 50) + 1]

    def _extend(self):
        f = self.g.generate(self.text, self.chunk, prefix=self.feat)
        self.feat = f if self.feat is None else np.concatenate([self.feat, f])
        q, rp, rq = features_to_motion(f)
        q50, rq50 = upsample(q, FPS, 50), upsample(rq, FPS, 50)
        rq50 /= np.linalg.norm(rq50, axis=1, keepdims=True)
        new = dict(q=q50, root_quat=rq50, vel=upsample(f[:, NQ + 3:D], FPS, 50))
        self.buf = new if self.buf is None else {k: np.concatenate([self.buf[k], new[k]]) for k in new}

    def step(self, now=None):
        if self.buf is None or self.i + 25 >= len(self.buf["q"]):
            self._extend()
        j = self.i
        self.i += 1
        q = self.buf["q"][j]
        qn = self.buf["q"][min(j + 1, len(self.buf["q"]) - 1)]
        return dict(q=q.copy(), qd=(qn - q) * 50, root_pos=np.zeros(3), root_quat=self.buf["root_quat"][j].copy(),
                    frame=-1, action="generated", vel=self.buf["vel"][j].copy())


# --------------------------------------------------------------------------------------------------------- training
def train(a):
    torch.set_num_threads(a.threads or max(1, (os.cpu_count() or 2)))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    log_f = open(out / "train.log", "a")

    def log(*m):
        s = " ".join(str(x) for x in m)
        print(s, flush=True)
        log_f.write(s + "\n")
        log_f.flush()

    data = MotionSet(a.libs, a.captions, log)
    enc = TextEncoder()
    emb = enc(data.texts)
    cfg = dict(d=a.d, layers=a.layers, heads=a.heads, ff=a.ff)
    model = Denoiser(**cfg)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    step, ckpt = 0, out / "model.pt"
    if ckpt.exists():
        z = torch.load(ckpt, map_location="cpu", weights_only=False)
        model.load_state_dict(z["model"])
        opt.load_state_dict(z["opt"])
        step = z["step"]
        log(f"resumed at step {step}")
    log(f"model: {sum(p.numel() for p in model.parameters()) / 1e6:.2f} M parameters; batch {a.batch}")
    rng = np.random.default_rng(step + 1)
    gen = torch.Generator().manual_seed(step + 1)
    t0, last_save, ema = time.time(), time.time(), None
    deadline = t0 + a.hours * 3600

    def save():
        torch.save(dict(model=model.state_dict(), opt=opt.state_dict(), step=step, config=cfg, mu=data.mu,
                        sd=data.sd, text_model=TEXT_MODEL), out / "model.tmp")
        os.replace(out / "model.tmp", ckpt)

    while time.time() < deadline and step < a.max_steps:
        model.train()
        x, valid, txt, known, mask = (torch.tensor(v) for v in data.batch(a.batch, rng, emb))
        lr = a.lr * min(1.0, (step + 1) / 1000)
        for g in opt.param_groups:
            g["lr"] = lr
        loss, lp, lv = loss_fn(model, x, valid, txt, known, mask, gen)
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        step += 1
        ema = loss.item() if ema is None else 0.99 * ema + 0.01 * loss.item()
        if step % 200 == 0:
            el = time.time() - t0
            log(f"step {step}  loss {ema:.4f} (pos {lp:.4f} vel {lv:.4f})  {el / 60:.1f} min  "
                f"{200 / max(1e-9, el - getattr(train, '_last', 0)):.1f} it/s")
            train._last = el
        if time.time() - last_save > a.save_min * 60:
            save()
            last_save = time.time()
    save()
    log(f"saved {ckpt} at step {step}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--libs", nargs="+", required=True)
    t.add_argument("--captions", nargs="*", default=[])
    t.add_argument("--out", default="runs/motion/generator")
    t.add_argument("--hours", type=float, default=6.0)
    t.add_argument("--max-steps", type=int, default=10 ** 9)
    t.add_argument("--batch", type=int, default=32)
    t.add_argument("--lr", type=float, default=2e-4)
    t.add_argument("--d", type=int, default=256)
    t.add_argument("--layers", type=int, default=6)
    t.add_argument("--heads", type=int, default=4)
    t.add_argument("--ff", type=int, default=768)
    t.add_argument("--threads", type=int, default=None)
    t.add_argument("--save-min", type=float, default=10.0)
    s = sub.add_parser("sample")
    s.add_argument("--ckpt", default="runs/motion/generator/model.pt")
    s.add_argument("--text", required=True)
    s.add_argument("--seconds", type=float, default=6.4)
    s.add_argument("--out", default=None, help=".npz with q, root_pos, root_quat at 50 Hz")
    a = ap.parse_args()
    if a.cmd == "train":
        train(a)
    else:
        g = Generator(a.ckpt)
        f = g.generate(a.text, a.seconds)
        q, rp, rq = features_to_motion(f)
        print(f"{len(f)} frames ({len(f) / FPS:.1f} s); root travelled {np.linalg.norm(rp[-1, :2] - rp[0, :2]):.2f} m")
        if a.out:
            np.savez(a.out, q=upsample(q, FPS, 50), root_pos=upsample(rp, FPS, 50), root_quat=upsample(rq, FPS, 50))


if __name__ == "__main__":
    main()
