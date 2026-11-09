"""Shared pieces of the salvaged-parts builds (variant_s1scrap.py, variant_k1scrap.py).

Actuator classes: mass, reflected-inertia data and total ratio per joint class. scrap/calc/scrap_select.py writes the
selected values to <DATA_DIR>/actuator_family.json; until then the defaults below are used (a salvaged 18 V drill
gearmotor in low gear, plus a bike-chain stage where the class name says so).
"""
from __future__ import annotations

import json

# placeholder: 18 V drill motor (RS-550 class) + its 2-stage planetary in low gear, see scrap/data/actuators.json
DRILL = dict(mass=0.75, rotor_J=1.2e-5, gear=48.0)
DEFAULT_CHAIN = {"X-HY": 1.0, "X-HR": 4.0, "X-HP": 4.0, "X-KN": 5.0, "X-AN": 1.0, "X-SH": 2.0, "X-EL": 1.0,
                 "X-WY": 1.0, "X-NK": 1.0, "X-SR": 1.0, "X-SY": 1.0}
DRIVE_KG = 0.30          # one bike-chain stage: 2 sprockets, chain, jackshaft, 2 x 608 bearings, tensioner


SERVO = dict(mass=0.06, rotor_J=0.0, gear=1.0)
DEFAULT_CHAIN.update({"K-HY": 2.0, "K-HR": 6.0, "K-HP": 2.0, "K-KN": 10.0, "K-AN": 3.0, "K-WY": 2.0, "K-SP": 2.0,
                      "K-SR": 2.0, "K-SY": 1.0, "K-EL": 1.0, "K-NK": 1.0})


def act_classes(data_dir, joints_left, joints_centre=None, servo_classes=()):
    classes = {c for c, _, _ in list(joints_left.values()) + list((joints_centre or {}).values())}
    out = {}
    for c in sorted(classes):
        ch = DEFAULT_CHAIN.get(c, 1.0)
        base = SERVO if c in servo_classes else DRILL
        out[c] = dict(mass=base["mass"], rotor_J=base["rotor_J"], ratio=base["gear"] * ch,
                      drive_kg=DRIVE_KG if (ch > 1.0 and c not in servo_classes) else 0.0, type="servo20" if c in servo_classes else "drill18")
    f = data_dir / "actuator_family.json"
    if f.exists():
        for c, v in json.loads(f.read_text()).items():
            if c in out:
                out[c].update({k: v[k] for k in ("mass", "rotor_J", "ratio", "drive_kg", "type") if k in v})
    return out


def add_ons(ns, B):
    """Builder add-ons, as for S1: <DATA_DIR>/add_ons.json, one line per bolted-on component."""
    Comp = ns["Comp"]
    f = ns["DATA_DIR"] / "add_ons.json"
    if not f.exists():
        return
    for a in json.loads(f.read_text()).get("add_ons", []):
        for b in B:
            side, key = (b.name[0], b.name[2:]) if b.name[:2] in ("l_", "r_") else ("c", b.name)
            if key != a["body"] or (side != "c" and a.get("side", "both") not in ("both", side)):
                continue
            x, y, z = a.get("xyz", (0.0, 0.0, 0.0))
            y = -y if side == "r" else y
            b.comps.append(Comp(f"add-on: {a['name']}", float(a["kg"]), (x, y, z), "box",
                                tuple(a.get("box", (0.05, 0.05, 0.05))), a.get("cat", "electronics")))
