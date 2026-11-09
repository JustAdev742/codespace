"""KESTREL K1-Fast - K1-Scrap with quasi-direct-drive legs (hoverboard hub motors on ODESC drives).
Loaded by params.py when KESTREL_VARIANT=k1fast. See fast_common.py for the idea and the targets."""
from __future__ import annotations

from . import fast_common as F
from . import variant_k1scrap as K

NAME = "KESTREL K1-Fast"
SUB = "k1fast"
JOINTS_LEFT = K.JOINTS_LEFT
JOINTS_CENTRE = K.JOINTS_CENTRE
LEG4 = F.LEG_QDD + [("hubfoc", 4)]      # K1-Fast is heavier (69 kg): up to four hub motors per big leg joint
ALLOWED = {"*": [("drill18", 1), ("drill18", 2)],
           "K-HR": F.LEG_QDD, "K-HP": LEG4, "K-KN": LEG4, "K-AN": F.LEG_QDD,
           "K-NK": [("servo20", 1)]}
LOADS = dict(box=5.0, hand=1.0, step_up=0.20)   # K1-Scrap's object loads; the walking speeds are the fast build's
SUPP_OVERRIDE = dict(K.SUPP_OVERRIDE, hip_yaw=dict(T=40.0, w=5.0, why="turning in place, 45 kg robot"),
                     shoulder_pitch=dict(w=6.0), shoulder_roll=dict(w=6.0), elbow=dict(w=6.0))


def apply(ns):
    K.apply(ns)
    ns["SUPP_OVERRIDE"] = dict(SUPP_OVERRIDE)
    F.retarget(ns, NAME, SUB, K.JOINTS_LEFT, K.JOINTS_CENTRE, K.SERVO_CLASSES)
    ns["SCRAP"].update(LOADS)
