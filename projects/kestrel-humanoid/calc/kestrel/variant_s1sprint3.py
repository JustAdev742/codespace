"""KESTREL S1-Sprint 3 - S1-Sprint with reflexive arm swing: the shoulder-pitch drills swing each arm against the
opposite leg (train/model.py ARM_SWING), as human arms do, to cancel the legs' yaw momentum at running speed.
Loaded by params.py when KESTREL_VARIANT=s1sprint3."""
from __future__ import annotations

from . import variant_s1sprint as S

NAME = "KESTREL S1-Sprint 3"
SUB = S.SUB
JOINTS_LEFT = S.JOINTS_LEFT
ALLOWED = S.ALLOWED
SUPP_OVERRIDE = S.SUPP_OVERRIDE


def apply(ns):
    S.apply(ns)
    ns["NAME"] = NAME
