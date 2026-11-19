"""Keep striking motions out of the training data: the robot must never learn to strike anyone.

A clip is excluded if its file path names combat (punch, kick, boxing, martial arts, bat swings, shoving, ...), or if
the motion itself looks like a strike: a hand or foot whipping out at striking speed (over 5.5 m/s relative to the
pelvis) at full extension, more than once. Every exclusion is logged with its reason.
"""
from __future__ import annotations

import re

import numpy as np

from .formats import K

COMBAT_WORDS = [
    "punch", "kick", "boxing", "boxer", "fight", "karate", "kung_?fu", "martial", "taekwondo", "muay", "kickbox",
    "jab", "uppercut", "hook_punch", "strike", "striking", "slap", "attack", "assault", "combat", "sparring",
    "stab", "slash", "sword", "katana", "fencing", "baton", "bat_?swing", "batting", "hitting", "shove", "shoving", "headbutt",
    "elbow_?strike", "knee_?strike", "throw_punch", "brawl", "wrestl", "grappl", "choke", "tackle", "melee",
]
_RX = re.compile("|".join(COMBAT_WORDS))


def by_name(path):
    s = re.sub(r"[\s\-\.]", "_", str(path).lower())
    m = _RX.search(s)
    return f"name contains '{m.group(0)}'" if m else None


def by_motion(pos, fps, speed=5.5, min_strikes=2):
    """A striking pattern in keypoint positions [T, 17, 3]: fast, extended hand or foot movements away from the body."""
    if len(pos) < 5:
        return None
    pel = pos[:, K["pelvis"]]
    reasons = []
    for side in ("l", "r"):
        for end, base, mid in (("wrist", "shoulder", "elbow"), ("ankle", "hip", "knee")):
            e, b, m = pos[:, K[f"{side}_{end}"]], pos[:, K[f"{side}_{base}"]], pos[:, K[f"{side}_{mid}"]]
            rel = e - pel
            v = np.linalg.norm(np.diff(rel, axis=0), axis=1) * fps
            limb = np.median(np.linalg.norm(m - b, axis=1) + np.linalg.norm(e - m, axis=1))
            ext = np.linalg.norm(e - b, axis=1)[1:] / max(limb, 1e-3)
            outward = (np.einsum("ij,ij->i", np.diff(rel, axis=0), (rel[1:] - (b - pel)[1:])) > 0)
            hits = (v > speed) & (ext > 0.85) & outward
            if end == "ankle":                       # a kick: the foot fast and up near hip height
                hits &= (e[1:, 2] - pel[1:, 2]) > -0.25 * limb
            n = int(np.sum(np.diff(hits.astype(int)) == 1))
            if n >= min_strikes:
                reasons.append(f"{n} fast extended {side}_{end} movements")
    return "; ".join(reasons) if reasons else None


def check(path, pos, fps):
    return by_name(path) or by_motion(pos, fps)
