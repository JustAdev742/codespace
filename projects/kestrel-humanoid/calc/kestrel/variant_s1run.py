"""KESTREL S1-Run - S1-Fast unchanged, trained with a running gait clock and commands to 3 m/s.
The control for the S1-Sprint experiment (variant_s1sprint.py): same hardware, only the training differs.
Loaded by params.py when KESTREL_VARIANT=s1run."""
from __future__ import annotations

from . import variant_s1fast as F

NAME = "KESTREL S1-Run"
SUB = F.SUB
JOINTS_LEFT = F.JOINTS_LEFT
ALLOWED = F.ALLOWED
SUPP_OVERRIDE = F.SUPP_OVERRIDE


def apply(ns):
    F.apply(ns)
    ns["NAME"] = NAME
