"""Language: a small network that reads an instruction and returns what to do, to which object, and how fast.

    python language.py --train                # generate phrasings, train (data/language.pt), report held-out accuracy
    python language.py "sprint to the blue ball"

Intents: goto, stop, turn_left, turn_right, look_around, harm. Targets: the arena's objects or none. Speeds: slow,
normal, fast. "harm" is any request to hit, push, chase or run into something or someone: the safety supervisor
refuses it (and also refuses on its own word list, so a misread cannot get through).
Features are hashed words, word pairs and character trigrams, so unseen spellings and word orders still land close.
"""
from __future__ import annotations

import argparse
import random
import re
import sys
import zlib
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
INTENTS = ["goto", "stop", "turn_left", "turn_right", "look_around", "harm"]
TARGETS = ["red", "blue", "green", "yellow", "person", "none"]
SPEEDS = ["slow", "normal", "fast"]
DIM = 4096

OBJ = {"red": ["red box", "red cube", "red crate", "red block", "crimson box", "red thing"],
       "blue": ["blue ball", "blue sphere", "blue orb", "blue globe", "blue thing"],
       "green": ["green post", "green pole", "green pillar", "green stick", "green column"],
       "yellow": ["yellow cone", "yellow drum", "yellow can", "yellow cylinder", "yellow barrel"],
       "person": ["person", "human", "man", "woman", "guy", "mannequin", "that person", "the operator"]}
VERB = {"fast": ["run", "sprint", "dash", "race", "hurry", "rush", "jog", "bolt"],
        "normal": ["go", "walk", "head", "move", "get", "make your way", "proceed", "travel", "navigate"],
        "slow": ["stroll", "creep", "amble", "tiptoe", "wander", "edge"]}
ADV = {"fast": ["quickly", "fast", "as fast as you can", "at full speed", "now, fast", "flat out", "at top speed", "quick",
                 "asap", "as fast as possible", "hurry up", "right now, quickly"],
       "normal": ["", "", "", "please", "when ready", "at a normal pace"],
       "slow": ["slowly", "carefully", "gently", "take your time", "at a slow pace", "nice and easy"]}
PREP = ["to", "over to", "towards", "toward", "up to", "across to", "to where the", ""]
STOP = ["stop", "halt", "freeze", "stand still", "wait", "hold on", "that's enough", "stop right there", "stay",
        "don't move", "pause", "cancel that", "abort"]
LEFT = ["turn left", "rotate left", "spin to the left", "face left", "look left", "turn to your left", "go left"]
RIGHT = ["turn right", "rotate right", "spin to the right", "face right", "look right", "turn to your right", "go right"]
LOOK = ["look around", "scan the area", "what do you see", "survey the room", "have a look around", "search around",
        "find something", "show me what's here"]
HARM = ["attack", "hit", "punch", "kick", "hurt", "smash into", "charge at", "run over", "tackle", "crush", "destroy",
        "chase down", "trample", "ram", "shove", "knock down", "run into", "slam into", "beat up", "injure"]


def sample(rng):
    """One (text, intent, target, speed) example."""
    r = rng.random()
    if r < 0.50:
        t = rng.choice(list(OBJ))
        sp = rng.choice(SPEEDS)
        adv = rng.choice(ADV[sp]) if rng.random() < 0.7 else ""
        # a speed word outranks the verb ("walk ... slowly" is slow): mix verbs when an adverb is present
        v = rng.choice(VERB[rng.choice(SPEEDS) if (adv and rng.random() < 0.35) else sp])
        p = rng.choice(PREP)
        o = rng.choice(OBJ[t])
        art = "" if o.startswith("that") or o.startswith("the ") else rng.choice(["the ", "the ", "that ", ""])
        forms = [f"{v} {p} {art}{o} {adv}", f"{adv} {v} {p} {art}{o}", f"please {v} {p} {art}{o} {adv}",
                 f"can you {v} {p} {art}{o} {adv}", f"i want you to {v} {p} {art}{o} {adv}", f"{art}{o}, {v} {p} it {adv}"]
        return rng.choice(forms), "goto", t, sp
    if r < 0.62:
        return rng.choice(STOP) + rng.choice(["", "!", " now", " please"]), "stop", "none", "normal"
    if r < 0.70:
        return rng.choice(LEFT) + rng.choice(["", " please", " a bit"]), "turn_left", "none", "normal"
    if r < 0.78:
        return rng.choice(RIGHT) + rng.choice(["", " please", " a bit"]), "turn_right", "none", "normal"
    if r < 0.86:
        return rng.choice(LOOK) + rng.choice(["", "?", " please"]), "look_around", "none", "normal"
    t = rng.choice(list(OBJ))
    o = rng.choice(OBJ[t])
    h = rng.choice(HARM)
    forms = [f"{h} the {o}", f"go and {h} the {o}", f"{rng.choice(VERB['fast'])} at the {o} and {h} it",
             f"i want you to {h} the {o}", f"{h} that {o} as fast as you can", f"find the {o} and {h} it"]
    return rng.choice(forms), "harm", t, "fast"


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", s.lower())).strip()


def feats(s):
    s = norm(s)
    w = s.split()
    toks = w + [a + "_" + b for a, b in zip(w, w[1:])] + [s[i:i + 3] for i in range(max(0, len(s) - 2))]
    v = np.zeros(DIM, np.float32)
    for tk in toks:
        v[zlib.crc32(tk.encode()) % DIM] += 1.0
    return v / max(1.0, np.linalg.norm(v))


class LangNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.b = nn.Sequential(nn.Linear(DIM, 192), nn.ReLU())
        self.i, self.t, self.s = nn.Linear(192, len(INTENTS)), nn.Linear(192, len(TARGETS)), nn.Linear(192, len(SPEEDS))

    def forward(self, x):
        h = self.b(x)
        return self.i(h), self.t(h), self.s(h)


class Ear:
    def __init__(self, path=DATA / "language.pt"):
        self.net = LangNet()
        self.net.load_state_dict(torch.load(path, map_location="cpu"))
        self.net.eval()

    def hear(self, text):
        with torch.no_grad():
            i, t, s = self.net(torch.from_numpy(feats(text))[None])
        pi, pt, ps = (torch.softmax(z, -1)[0] for z in (i, t, s))
        return dict(text=text, intent=INTENTS[int(pi.argmax())], target=TARGETS[int(pt.argmax())],
                    speed=SPEEDS[int(ps.argmax())], conf=float(pi.max()))


def train(n=12000, epochs=12, seed=0):
    rng = random.Random(seed)
    torch.manual_seed(seed)
    ex = [sample(rng) for _ in range(n)]
    held = random.Random(seed + 1)
    test = [sample(held) for _ in range(1500)]

    def tens(rows):
        X = torch.from_numpy(np.stack([feats(r[0]) for r in rows]))
        yi = torch.tensor([INTENTS.index(r[1]) for r in rows])
        yt = torch.tensor([TARGETS.index(r[2]) for r in rows])
        ys = torch.tensor([SPEEDS.index(r[3]) for r in rows])
        return X, yi, yt, ys

    X, yi, yt, ys = tens(ex)
    net = LangNet()
    opt = torch.optim.Adam(net.parameters(), lr=2e-3, weight_decay=1e-5)
    ce = nn.CrossEntropyLoss()
    for ep in range(epochs):
        perm = torch.randperm(len(X))
        for k in range(0, len(X), 128):
            idx = perm[k:k + 128]
            a, b, c = net(X[idx])
            loss = ce(a, yi[idx]) + ce(b, yt[idx]) + ce(c, ys[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
    Xt, ti, tt, ts = tens(test)
    with torch.no_grad():
        a, b, c = net(Xt)
    acc_i = (a.argmax(1) == ti).float().mean().item()
    go = ti == INTENTS.index("goto")
    acc_t = (b.argmax(1)[go] == tt[go]).float().mean().item()
    acc_s = (c.argmax(1)[go] == ts[go]).float().mean().item()
    harm = ti == INTENTS.index("harm")
    rec_h = (a.argmax(1)[harm] == ti[harm]).float().mean().item()
    DATA.mkdir(exist_ok=True)
    torch.save(net.state_dict(), DATA / "language.pt")
    print(f"held-out: intent {acc_i:.1%}, target {acc_t:.1%}, speed {acc_s:.1%}, harmful requests caught {rec_h:.1%}")
    print(f"wrote {DATA / 'language.pt'}")
    return dict(intent=acc_i, target=acc_t, speed=acc_s, harm=rec_h)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", action="store_true")
    ap.add_argument("text", nargs="*")
    a = ap.parse_args()
    if a.train:
        train()
    if a.text:
        print(Ear().hear(" ".join(a.text)))
