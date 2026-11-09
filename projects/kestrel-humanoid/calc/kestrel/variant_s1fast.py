"""KESTREL S1-Fast - S1-Scrap with quasi-direct-drive legs (hoverboard hub motors on ODESC drives).
Loaded by params.py when KESTREL_VARIANT=s1fast. See fast_common.py for the idea and the targets."""
from __future__ import annotations

from . import fast_common as F
from . import variant_s1scrap as S

NAME = "KESTREL S1-Fast"
SUB = "s1fast"
JOINTS_LEFT = S.JOINTS_LEFT
ALLOWED = {"*": [("drill18", 1), ("drill18", 2)],
           "X-HR": F.LEG_QDD, "X-HP": F.LEG_QDD, "X-KN": F.LEG_QDD, "X-AN": F.LEG_QDD}
SUPP_OVERRIDE = {"hip_yaw": dict(T=35.0, w=5.0, why="turning in place, 40 kg robot")}


def apply(ns):
    S.apply(ns)
    ns["SUPP_OVERRIDE"] = dict(SUPP_OVERRIDE)
    F.retarget(ns, NAME, SUB, S.JOINTS_LEFT, {})
