"""Does the text-to-motion generator make what was asked? Three measures.

    python -m motion.eval_generator --ckpt runs/motion/generator/model.pt --bandai runs/motion/bandai_library.npz \\
        [--physics] [--samples 6]

1. Recognisable: an action classifier trained on real human motion (Bandai's 12 gestures and walking) labels the
   generated motions; prompts are new paraphrases, never seen in training ("greet someone by waving your right arm",
   not "waves the right hand"). Reference: the same classifier on held-out real clips.
2. Varied: different samples for one prompt differ (mean pairwise distance, against real clips of one action).
3. Physical (--physics): each generated motion is played on the simulated G1 through the mover; falls are counted.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import torch
import torch.nn as nn

from .generator import FPS, T, Generator, clip_features
from .matching import action_of

# unseen paraphrases for each action (training captions: generator.BANDAI_ACTION)
PROMPTS = {
    "wave-right-hand": ["greet someone by waving your right arm", "say hi with the right hand"],
    "wave-left-hand": ["greet someone by waving your left arm"],
    "wave-both-hands": ["wave hello with both arms over your head"],
    "bow": ["bend forward at the waist to show respect", "a polite Japanese bow"],
    "bye": ["wave someone goodbye as they leave"],
    "call": ["motion to someone to come here"],
    "guide": ["show a guest which way to go with your arm"],
    "raise-up-both-hands": ["lift both arms up high"],
    "raise-up-right-hand": ["put your right hand up like asking a question"],
    "walk": ["stroll forward at a normal pace"],
    "walk-back": ["step backwards"],
}


class Classifier(nn.Module):
    def __init__(self, D, n):
        super().__init__()
        self.net = nn.Sequential(nn.Conv1d(D, 128, 5, padding=2), nn.ReLU(), nn.Conv1d(128, 128, 5, padding=2, stride=2),
                                 nn.ReLU(), nn.Conv1d(128, 128, 5, padding=2, stride=2), nn.ReLU(),
                                 nn.AdaptiveAvgPool1d(1), nn.Flatten(), nn.Linear(128, n))

    def forward(self, x):                       # x [B, T, D]
        return self.net(x.transpose(1, 2))


def windows(f, step=16):
    if len(f) < T:
        f = np.concatenate([f, np.repeat(f[-1:], T - len(f), 0)])
    return [f[s:s + T] for s in range(0, len(f) - T + 1, step)]


def train_classifier(bandai, g, labels, epochs=12, seed=0):
    z = np.load(bandai, allow_pickle=True)
    Q, RP, RQ = z["q"], z["root_pos"], z["root_quat"]          # read once (each z[...] decompresses the whole array)
    rng = np.random.default_rng(seed)
    clips = []
    for s, L, name in zip(z["clip_start"], z["clip_len"], z["clip_name"]):
        a = action_of(name)[0]
        if a in labels:
            f = g.norm(clip_features(Q[s:s + L], RP[s:s + L], RQ[s:s + L]))
            clips.append((labels.index(a), f))
    rng.shuffle(clips)
    n_test = len(clips) // 5
    test, tr = clips[:n_test], clips[n_test:]
    X = np.stack([w for _, f in tr for w in windows(f)])
    Y = np.array([y for y, f in tr for _ in windows(f)])
    clf = Classifier(X.shape[2], len(labels))
    opt = torch.optim.Adam(clf.parameters(), 1e-3)
    Xt, Yt = torch.tensor(X, dtype=torch.float32), torch.tensor(Y)
    for ep in range(epochs):
        perm = torch.randperm(len(Xt))
        for i in range(0, len(Xt), 128):
            b = perm[i:i + 128]
            loss = nn.functional.cross_entropy(clf(Xt[b] + 0.05 * torch.randn_like(Xt[b])), Yt[b])
            opt.zero_grad()
            loss.backward()
            opt.step()
    clf.eval()
    correct = 0
    with torch.no_grad():
        for y, f in test:
            p = clf(torch.tensor(np.stack(windows(f)[:1]), dtype=torch.float32)).argmax(1).item()
            correct += p == y
    return clf, correct / max(1, len(test)), [f for _, f in tr]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--ckpt", default="runs/motion/generator/model.pt")
    ap.add_argument("--bandai", default="runs/motion/bandai_library.npz")
    ap.add_argument("--samples", type=int, default=6)
    ap.add_argument("--physics", action="store_true")
    ap.add_argument("--library", default=None, help="motion library for the mover (physics test); default --bandai")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()
    g = Generator(a.ckpt)
    labels = sorted(PROMPTS)
    clf, real_acc, _ = train_classifier(a.bandai, g, labels)
    print(f"classifier on held-out real clips: {real_acc:.0%} correct ({len(labels)} actions)")
    res, hits, total, div = {}, 0, 0, []
    for act, prompts in PROMPTS.items():
        for p in prompts:
            feats = [g.generate(p, T / FPS, seed=s) for s in range(a.samples)]
            X = torch.tensor(np.stack([g.norm(f)[:T] for f in feats]), dtype=torch.float32)
            with torch.no_grad():
                pred = clf(X).argmax(1).numpy()
            ok = int((pred == labels.index(act)).sum())
            hits += ok
            total += len(pred)
            Q = np.stack([f[:, :29] for f in feats])
            d = np.mean([np.abs(Q[i] - Q[j]).mean() for i in range(len(Q)) for j in range(i + 1, len(Q))])
            div.append(d)
            res[p] = dict(action=act, recognised=f"{ok}/{len(pred)}", as_=[labels[k] for k in pred], diversity=float(d))
            print(f"  {p!r:58s} -> {ok}/{len(pred)} recognised as {act}   (others: "
                  f"{sorted(set(labels[k] for k in pred if labels[k] != act))})")
    print(f"generated motions recognised as the asked action: {hits}/{total} = {hits / total:.0%} "
          f"(real clips: {real_acc:.0%}; chance: {1 / len(labels):.0%}); variety {np.mean(div):.3f} rad")
    out = dict(real_acc=real_acc, gen_acc=hits / total, per_prompt=res)
    if a.physics:
        from .mover import DT, Mover
        mv = Mover(a.library or a.bandai, generator=g)
        falls, tests = 0, 0
        extra = ["a person dances happily", "stretch both arms above the head", "jump up and down on the spot",
                 "look around nervously", "drink from a cup", "sweep the floor with a broom"]
        for p in [ps[0] for ps in PROMPTS.values()] + extra:
            try:
                mv.set_intent("generate", text=p)
            except ValueError as e:
                print(f"  {p!r}: {e}")
                continue
            ok = True
            for k in range(int(6.0 / DT)):
                if not mv.step():
                    ok = False
                    break
            tests += 1
            if not ok:
                falls += 1
                mv = Mover(a.library or a.bandai, db=mv.db, generator=g)
            print(f"  physics {p!r:50s}: {'ok' if ok else 'FELL'}; moved to ({mv.d.qpos[0]:+.2f}, {mv.d.qpos[1]:+.2f})")
            mv.set_intent("stand")
            for k in range(int(1.5 / DT)):
                mv.step()
        print(f"physical: {tests - falls}/{tests} generated motions done without falling")
        out["physics"] = dict(tests=tests, falls=falls)
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)


if __name__ == "__main__":
    main()
