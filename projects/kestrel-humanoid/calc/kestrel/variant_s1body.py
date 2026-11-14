"""KESTREL S1-Body - S1-Fast with its arms free: both shoulders and elbows driven while the legs walk, so the leg
policy learns to keep its balance whatever the upper body does (gestures, reaching, carrying). In training the arms
follow random gestures, arm swing, carry and reach poses, with up to 2 kg in each hand (train/env.py); at run time
the brain (brain/skills.py) drives them. Loaded by params.py when KESTREL_VARIANT=s1body."""
from __future__ import annotations

from . import variant_s1fast as F

NAME = "KESTREL S1-Body"
SUB = F.SUB
JOINTS_LEFT = F.JOINTS_LEFT
ALLOWED = F.ALLOWED
SUPP_OVERRIDE = F.SUPP_OVERRIDE


def apply(ns):
    F.apply(ns)
    ns["NAME"] = NAME
