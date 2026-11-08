"""Electrical power budget and battery sizing.

Joint electrical power for every sample of every scenario:
    motor torque     tau_m = tau_a / (N eta)       when motoring,  tau_a * eta / N when back-driven
    copper loss      P_cu  = (tau_m / Km)^2,  Km = Kt / sqrt(1.5 R_LL)
    mechanical       P_m   = tau_m * w_m
    drive            3 % of |P_elec| + 1.0 W standby per drive
    regeneration     negative electrical power returned at REGEN_EFF (rest dissipated in the drive / clamp)
Both legs and both arms are counted (right side mirrors left in time-shifted gait, so the
left series is used with a half-cycle shift for the right leg in walking scenarios).
"""
from __future__ import annotations

import json
from math import sqrt
from pathlib import Path

import numpy as np

from . import actuators as A
from . import linkages as LK
from . import params as P
from . import requirements as RQ

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
GEN = ROOT / "docs" / "generated"
REGEN_EFF = 0.5
DRIVE_EFF_LOSS = 0.03
DRIVE_STANDBY_W = 1.0

# ---------------------------------------------------------------------------- electronics (W)
# avg = typical in operation, peak = worst simultaneous. Sources in docs/research/R2, R4.
ELECTRONICS = [
    ("AI computer: Jetson AGX Thor T5000 + carrier (40-130 W envelope)", 75.0, 130.0),
    ("Real-time computer: UP Squared Pro 7000 class, PREEMPT_RT", 20.0, 35.0),
    ("Safety MCU board (TMS570) + e-stop receiver", 2.0, 3.0),
    ("Head stereo ZED X (GMSL2)", 1.5, 1.5),
    ("Hand-workspace stereo ZED X Mini (GMSL2)", 1.5, 1.5),
    ("2x wide SLAM cameras ZED X One GS", 1.9, 1.9),
    ("Chest depth camera Orbbec Gemini 335Lg", 3.0, 7.5),
    ("3D LiDAR Livox Mid-360", 6.5, 14.0),
    ("IMUs (MicroStrain CV7 + IIM-46230 + board IMUs)", 1.0, 1.0),
    ("2x wrist F/T (Bota SensONE class)", 3.0, 3.0),
    ("34 joint drive logic supplies (standby)", 34 * DRIVE_STANDBY_W, 34 * DRIVE_STANDBY_W),
    ("~62 absolute encoders (AksIM-2 ~0.7 W, magnetic ~0.1 W)", 32.0, 32.0),
    ("2x hand controllers + 20 micro-motor drivers (idle)", 6.0, 6.0),
    ("Foot boards, tactile front-ends, ToF sensors", 4.0, 4.0),
    ("Audio: mic array + amplifier", 2.0, 10.0),
    ("Cooling: 2 torso blowers + 4 leg-duct blowers", 10.0, 24.0),
    ("Face/status LEDs", 1.5, 4.0),
    ("BMS, PDU, contactor coil economised, DC-DC losses (~8 % of the above)", 17.0, 25.0),
]


def km(m):
    return m["Kt"] / sqrt(1.5 * m["R_LL"])


def joint_electrical(tau_a, w_a, act):
    """Electrical power (W, signed) for actuator-side torque/speed series."""
    m = A.MOTORS[act["motor"]]
    N, eta = act["ratio"], A.ETA[act["gear"]]
    w_m = w_a * N
    p_out = tau_a * w_a
    motoring = p_out >= 0
    tau_m = np.where(motoring, tau_a / (N * eta), tau_a * eta / N)
    p_cu = (tau_m / km(m)) ** 2
    p_e = tau_m * w_m + p_cu
    p_e = p_e + DRIVE_EFF_LOSS * np.abs(p_e)
    return np.where(p_e < 0, p_e * REGEN_EFF, p_e)


def scenario_power(store, names, fam, scen, shift_right=True):
    """Total actuator electrical power series for a scenario (both sides)."""
    jidx = {n: i for i, n in enumerate(names)}
    tau, qd, q = store[f"{scen}/tau"], store[f"{scen}/qd"], store[f"{scen}/q"]
    Gk = LK.knee_G_function()
    group_of = {}
    for g, a in fam.items():
        for j in a["joints"]:
            group_of[j] = g
    total = np.zeros(len(tau))
    per = {}
    for side in ("l", "r"):
        sl = slice(None)
        for j in ("hip_yaw", "hip_roll", "hip_pitch", "shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw"):
            i = jidx[f"{side}_{j}"]
            pe = joint_electrical(tau[:, i], qd[:, i], fam[group_of[j]])
            per[f"{side}_{j}"] = pe
            total += pe
        i = jidx[f"{side}_knee"]
        G = Gk(q[:, i])
        pe = joint_electrical(tau[:, i] / G, qd[:, i] * G, fam[group_of["knee"]])
        per[f"{side}_knee"] = pe
        total += pe
        ip, ir = jidx[f"{side}_ankle_pitch"], jidx[f"{side}_ankle_roll"]
        g = LK.ANKLE
        for sgn, nm in ((1, "ankle_A"), (-1, "ankle_B")):
            F = tau[:, ip] / (2 * g["r_p"]) + sgn * tau[:, ir] / (2 * g["d"])
            v = qd[:, ip] * g["r_p"] + sgn * qd[:, ir] * g["d"]
            pe = joint_electrical(F * g["r_c"], v / g["r_c"], fam[group_of["ankle"]])
            per[f"{side}_{nm}"] = pe
            total += pe
        # wrist pitch/roll linear actuators: mechanical power / 0.6 (screw + micro-motor) + copper floor
        ip, ir = jidx[f"{side}_wrist_pitch"], jidx[f"{side}_wrist_roll"]
        pw = np.abs(tau[:, ip] * qd[:, ip]) + np.abs(tau[:, ir] * qd[:, ir])
        per[f"{side}_wrist_lin"] = pw / 0.6 + 0.5
        total += per[f"{side}_wrist_lin"]
    for j in ("waist_yaw", "waist_pitch", "neck_yaw", "neck_pitch"):
        i = jidx[j]
        pe = joint_electrical(tau[:, i], qd[:, i], fam[group_of[j]])
        per[j] = pe
        total += pe
    return total, per


def electronics_power():
    return sum(e[1] for e in ELECTRONICS), sum(e[2] for e in ELECTRONICS)


# ---------------------------------------------------------------------------- battery
CELLS = {
    "Molicel P50B": dict(Ah=5.0, Ah_min=4.85, V=3.6, I_cont=60, mass=0.071, dcir=0.0128, src="Molicel TDS V1.1"),
    "Molicel P45B": dict(Ah=4.5, Ah_min=4.3, V=3.6, I_cont=45, mass=0.070, dcir=0.0138, src="molicel.com"),
}
SERIES = 16


def battery_options(avg_W, peak_W, target_h=3.0):
    rows = []
    for cn, c in CELLS.items():
        for Pn in range(5, 10):
            n = SERIES * Pn
            Ah = c["Ah_min"] * Pn
            E = SERIES * c["V"] * Ah
            usable = E * 0.90 * 0.97          # 90 % DoD window, 3 % conversion/harness loss
            cells_kg = n * c["mass"]
            pack_kg = cells_kg * 1.30         # holders, busbars, BMS, fuse, enclosure, thermal barrier
            I_peak = peak_W / (SERIES * 3.25)
            rows.append(dict(cell=cn, config=f"{SERIES}S{Pn}P", cells=n, Wh=E, usable_Wh=usable, cells_kg=cells_kg,
                             pack_kg=pack_kg, runtime_h=usable / avg_W, I_peak=I_peak, I_per_cell=I_peak / Pn,
                             C_peak=I_peak / Ah, sag_V=I_peak * c["dcir"] * SERIES / Pn))
    return rows
