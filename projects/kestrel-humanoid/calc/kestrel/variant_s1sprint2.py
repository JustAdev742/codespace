"""KESTREL S1-Sprint 2 - S1-Sprint with stiffer knee and ankle springs (train/model.py SPRINGS), to see whether more of
the running load can go through the springs instead of the motors. Heating (RMS torque against the continuous rating)
is what limits S1-Sprint's sustained top speed. Loaded by params.py when KESTREL_VARIANT=s1sprint2."""
from __future__ import annotations

from . import variant_s1sprint as S

NAME = "KESTREL S1-Sprint 2"
SUB = S.SUB
JOINTS_LEFT = S.JOINTS_LEFT
ALLOWED = S.ALLOWED
SUPP_OVERRIDE = S.SUPP_OVERRIDE


def apply(ns):
    S.apply(ns)
    ns["NAME"] = NAME
