"""Actuator sizing: motor x gear x drive x linkage against every simulated operating point.

For each joint group the candidate actuator must cover, with margins, every
(torque, speed) sample of every normal-operation scenario after mapping through the
joint's linkage, plus the supplementary corners, while staying inside:
  * the motor's voltage-limited torque-speed line at the MINIMUM loaded bus voltage,
  * the drive's peak current, and the motor's saturation-limited peak torque,
  * the motor's continuous (thermal) torque for the continuous requirement,
  * the gear's repeated-peak / momentary / average ratings (strain-wave gears),
  * the gear's maximum input speed.
Masses here are estimates until replaced by CAD masses; the family table (data/
actuator_family.json) is fed back into params.ACT so the dynamic model and the
requirements are re-run with the sized actuators (one iteration converges).

Voltage-limited speed (surface-PM, L neglected, calibrated derate k_L):
    w_m(T) = k_L * (V_bus/sqrt(6) - R_ph * T/Kt) * 3/Kt
k_L = 0.75 reproduces TQ's published ILM115x25 rated speed at 48 V. Field weakening is
NOT counted (it is extra margin at low torque).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from math import sqrt
from pathlib import Path

import numpy as np

from . import linkages as LK
from . import motor_design as MD
from . import requirements as RQ

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
GEN = ROOT / "docs" / "generated"

V_MIN = 52.0       # V: 16S at ~3.25 V/cell under load (BMS derates power below this)
# Bus decision (docs/05 sec 2): 13S (<=54.6 V) was evaluated first; no motor/ratio covered the
# knee and hip-pitch envelopes at 42 V minimum (speed vs continuous torque, see the
# generated sizing report), so the bus is 16S (59.2 V nominal, 67.2 V max) as on Unitree H1/H1-2.
K_L = 0.75
THERMAL_DERATE = 0.85   # default: robot-joint mounting vs datasheet heatsink
THERMAL_DERATE_COOLED = 1.00  # potted stator in finned housing + ducted blower (KA-130K, KA-130H)
HOLD_FACTOR = 1.5       # 60 s (S2) rating ~ 1.5x continuous for these thermal masses

# --------------------------------------------------------------------------- motors
# status: V = verified datasheet values (docs/research/R1), C = custom design (motor_design)
MOTORS = {
    "RI115-PH": dict(Kt=0.29, R_LL=0.134, T_cont=5.5, T_pk=16.0, mass=1.108, J=3.9e-4, OD=0.115, len=0.0381, bore=0.074, status="V", src="CubeMars 2026 catalogue"),
    "ILM115x25": dict(Kt=0.281, R_LL=0.140, T_cont=3.9, T_pk=12.7, mass=1.070, J=4.0e-4, OD=0.115, len=0.0387, bore=0.074, status="V", src="TQ-RoboDrive"),
    "ILM85x26": dict(Kt=0.253, R_LL=0.320, T_cont=2.9, T_pk=9.37, mass=0.670, J=1.25e-4, OD=0.085, len=0.0403, bore=0.052, status="V", src="TQ-RoboDrive"),
    "RI85-PH": dict(Kt=0.13, R_LL=0.1385, T_cont=2.0, T_pk=5.0, mass=0.411, J=7.7e-5, OD=0.085, len=0.0273, bore=0.052, status="V", src="CubeMars 2026 catalogue"),
    "ILM85x13": dict(Kt=0.134, R_LL=0.220, T_cont=1.44, T_pk=4.66, mass=0.400, J=7.1e-5, OD=0.085, len=0.0269, bore=0.052, status="V", src="TQ-RoboDrive"),
    "RI100": dict(Kt=0.129, R_LL=0.126, T_cont=1.76, T_pk=4.95, mass=0.500, J=1.2e-4, OD=0.104, len=0.026, bore=0.060, status="V", src="CubeMars 2026 catalogue"),
    "RI80": dict(Kt=0.155, R_LL=0.330, T_cont=1.45, T_pk=4.1, mass=0.411, J=6.5e-5, OD=0.085, len=0.027, bore=0.040, status="V", src="CubeMars 2026 catalogue"),
    "ILM70x18": dict(Kt=0.187, R_LL=0.660, T_cont=1.25, T_pk=4.05, mass=0.330, J=4.5e-5, OD=0.069, len=0.0305, bore=0.042, status="V", src="TQ-RoboDrive"),
    "RI70": dict(Kt=0.130, R_LL=0.418, T_cont=0.94, T_pk=2.68, mass=0.270, J=4.0e-5, OD=0.076, len=0.024, bore=0.035, status="V", src="CubeMars 2026 catalogue"),
}

# custom KM-series frameless motors (analytic, calibrated model) - see docs/13
CUSTOM = {
    "KM-130x32": MD.MotorSpec("KM-130x32", D_o=0.130, split=0.74, L=0.032, Qs=36, poles=42, N_c=4, h_m=0.0030),
    "KM-130x40": MD.MotorSpec("KM-130x40", D_o=0.130, split=0.74, L=0.040, Qs=36, poles=42, N_c=3, h_m=0.0030),
    "KM-130x45": MD.MotorSpec("KM-130x45", D_o=0.130, split=0.74, L=0.045, Qs=36, poles=42, N_c=5, a=2, h_m=0.0030),
    "KM-135x40": MD.MotorSpec("KM-135x40", D_o=0.135, split=0.74, L=0.040, Qs=36, poles=42, N_c=3, h_m=0.0030),
    "KM-115x32": MD.MotorSpec("KM-115x32", D_o=0.115, split=0.735, L=0.032, Qs=36, poles=40, N_c=4, h_m=0.0028),
    "KM-50x20": MD.MotorSpec("KM-50x20", D_o=0.050, split=0.62, L=0.020, Qs=12, poles=14, N_c=18, h_m=0.0020, g=0.0004),
}
# --- Mk II motors (docs/research/R10 sec. 8: motor_design.py physics, K_R_CAL 1.30, T_pk saturation-corrected at
#     the intended drive's peak current; T_cont of the jacketed motors already includes liquid cooling -> derate 1.0)
MOTORS.update({
    "KM-130x50-LC": dict(Kt=0.2242, R_LL=0.02026, T_cont=18.85, T_pk=31.5, mass=2.615, J=1.258e-3, OD=0.130, len=0.066, bore=0.0855,
                         status="C", src="R10 Mk II: Ø130 die, 50 mm stack, N50UH, 3t x 2p, liquid jacket; T_pk @150 A"),
    "KM-150x50-LCS": dict(Kt=0.2300, R_LL=0.00942, T_cont=33.5, T_pk=46.0, mass=3.677, J=2.099e-3, OD=0.150, len=0.068, bore=0.0997,
                          status="C", src="R10 KA-150X option: segmented Ø150 stator, jacket; T_pk @200 A, needs 20S + HV drive"),
    "KM-115x32-N50": dict(Kt=0.2522, R_LL=0.0702, T_cont=5.49, T_pk=14.2, mass=1.355, J=4.99e-4, OD=0.115, len=0.047, bore=0.0746,
                          status="C", src="R10 KA-115R: N50UH, 3t; T_pk @60 A"),
    "KM-85x26-N50-3t": dict(Kt=0.1392, R_LL=0.0822, T_cont=2.01, T_pk=6.18, mass=0.642, J=1.08e-4, OD=0.085, len=0.038, bore=0.0515,
                            status="C", src="R10 KA-90P2"),
    "KM-85x26-N50-4t": dict(Kt=0.1856, R_LL=0.1461, T_cont=2.01, T_pk=6.18, mass=0.642, J=1.08e-4, OD=0.085, len=0.038, bore=0.0515,
                            status="C", src="R10 KH-C25"),
    "KM-85x17-N50-5t": dict(Kt=0.1517, R_LL=0.1713, T_cont=1.31, T_pk=4.04, mass=0.434, J=7.04e-5, OD=0.085, len=0.029, bore=0.0515,
                            status="C", src="R10 KH-C20"),
})
for k, spec in CUSTOM.items():
    d = MD.design(spec)
    MOTORS[k] = dict(Kt=d["Kt"], R_LL=d["R_LL"], T_cont=d["T_cont"], T_pk=d["T_pk"], mass=d["mass"], J=d["J_rotor"],
                     OD=spec.D_o, len=d["length_total"], bore=d["rotor_ID"], status="C", src="motor_design.py (calibrated)",
                     design=d)

# --------------------------------------------------------------------------- drives
DRIVES = {
    "HC": dict(name="high-current 100 V EtherCAT drive (Elmo Platinum Twitter R70/100 class, or custom GaN per TIDA-010979)", I_pk=99.0, I_cont=49.5),
    "EV": dict(name="Novanta Everest S NET (8-80 V, 45 A cont / 60 A 1 s)", I_pk=60.0, I_cont=45.0),
    "HC2": dict(name="150 A pk / 75 A cont GaN EtherCAT drive, 100 V class (EPC9186HC-class power stage), 16S - Mk II legs", I_pk=150.0, I_cont=75.0),
    "HV": dict(name="200 A pk, 150 V class, 20S only (custom) - KA-150X option", I_pk=200.0, I_cont=100.0),
}

# --------------------------------------------------------------------------- gears
HD_CSG = {  # size: ratio: (rated, repeated, average, momentary) N m ; mass kg, OD m, max input rpm
    14: dict(r={50: (7, 23, 9, 46), 80: (10, 30, 14, 61), 100: (10, 36, 14, 70)}, mass=0.09, OD=0.050, n_max=8500),
    17: dict(r={50: (21, 44, 34, 91), 80: (29, 56, 35, 113), 100: (31, 70, 51, 143)}, mass=0.15, OD=0.060, n_max=7300),
    20: dict(r={50: (33, 73, 44, 127), 80: (44, 96, 61, 165), 100: (52, 107, 64, 191)}, mass=0.28, OD=0.070, n_max=6500),
    25: dict(r={50: (51, 127, 72, 242), 80: (82, 178, 113, 332), 100: (87, 204, 140, 369)}, mass=0.42, OD=0.085, n_max=5600),
    32: dict(r={50: (99, 281, 140, 497), 80: (153, 395, 217, 738), 100: (178, 433, 281, 841)}, mass=0.89, OD=0.110, n_max=4800),
}
ETA = dict(planetary=0.92, harmonic=0.75, screw=0.88, cycloid=0.85)
# Machined two-disc cycloid reducers for the Mk II arms (R10 sec. 5.6/5.7): impact tolerant, higher peak than the
# strain-wave sizes they replace. Ratings are DESIGN TARGETS to be proven on the dyno (R10 sec. 7, item 6);
# C32 is scaled from C25 by pitch-diameter^3 (estimate). size: ratio: (rated, repeated, average, momentary) N m
CYC = {
    "C20": dict(r={30: (52, 105, 65, 160), 40: (52, 105, 65, 160)}, mass=0.43, OD=0.075, n_max=4500),
    "C25": dict(r={30: (80, 160, 100, 250), 40: (80, 160, 100, 250)}, mass=0.57, OD=0.090, n_max=4000),
    "C32": dict(r={30: (150, 300, 190, 450), 40: (150, 300, 190, 450)}, mass=0.95, OD=0.115, n_max=3500),
}


def omega_lim(m, T):
    Rph = m["R_LL"] / 2
    return K_L * (V_MIN / sqrt(6) - Rph * T / m["Kt"]) * 3 / m["Kt"]


def t_cont_eff(m, derate=THERMAL_DERATE):
    return m["T_cont"] * derate


# --------------------------------------------------------------------------- joint point clouds (actuator side)
def actuator_points(store, names, joint):
    """Return arrays (tau_a, w_a) at the actuator for all repeated + momentary samples, plus per-class tags."""
    jidx = {n: i for i, n in enumerate(names)}
    pts_t, pts_w, tag = [], [], []
    Gk = LK.knee_G_function()
    for s in RQ.REPEATED + RQ.MOMENTARY:
        tau = store[f"{s}/tau"]
        qd = store[f"{s}/qd"]
        q = store[f"{s}/q"]
        if joint == "knee":
            i = jidx["l_knee"]
            G = Gk(q[:, i])
            t, w = np.abs(tau[:, i]) / G, np.abs(qd[:, i]) * G
        elif joint == "ankle":
            ip, ir = jidx["l_ankle_pitch"], jidx["l_ankle_roll"]
            t = LK.ankle_actuator_torque(tau[:, ip], tau[:, ir])
            w = LK.ankle_actuator_speed(qd[:, ip], qd[:, ir])
        else:
            i = jidx[joint] if joint in jidx else jidx[f"l_{joint}"]
            t, w = np.abs(tau[:, i]), np.abs(qd[:, i])
        pts_t.append(t)
        pts_w.append(w)
        tag += [s] * len(t)
    return np.concatenate(pts_t), np.concatenate(pts_w), np.array(tag)


@dataclass
class Group:
    name: str
    joints: list
    gear: str                 # planetary | harmonic
    drive: str
    motors: list
    ratios: list
    hd_sizes: list = field(default_factory=list)
    electronics_kg: float = 0.12
    derate: float = THERMAL_DERATE
    notes: str = ""


GROUPS = [
    # ---- Mk II (docs/research/R10 sec. 5): legs on liquid-cooled KM-130x50 + 150 A GaN drives; arms on cycloids
    Group("KA-130K", ["knee"], "planetary", "HC2", ["KM-130x50-LC"], list(range(12, 21)),
          electronics_kg=0.40, derate=THERMAL_DERATE_COOLED, notes="Mk II KA-130K2: liquid jacket, N50UH, 50 mm stack, 150 A GaN drive"),
    Group("KA-130H", ["hip_pitch"], "planetary", "HC2", ["KM-130x50-LC"], list(range(12, 21)),
          electronics_kg=0.40, derate=THERMAL_DERATE_COOLED, notes="Mk II: same KA-130K2 hardware as the knee"),
    Group("KA-110P", ["hip_roll", "waist_pitch"], "planetary", "EV", ["KM-115x32-N50", "ILM115x25", "RI115-PH"], list(range(14, 31)),
          notes="Mk II KA-115R: KM-115x32 with N50UH magnets"),
    Group("KA-90P", ["hip_yaw", "waist_yaw", "ankle"], "planetary", "EV", ["KM-85x26-N50-3t", "ILM85x26", "RI85-PH"], list(range(14, 31)),
          notes="Mk II KA-90P2: KM-85x26 N50UH, 3 turns"),
    Group("KH-25", ["shoulder_pitch", "shoulder_roll"], "cycloid", "EV", ["KM-85x26-N50-4t", "KM-115x32-N50", "ILM85x26"], [30, 40], ["C25", "C32"],
          notes="Mk II KH-C25: machined two-disc cycloid (impact tolerant); 10 kg per hand at full reach"),
    Group("KH-20", ["shoulder_yaw", "elbow"], "cycloid", "EV", ["KM-85x17-N50-5t", "KM-85x26-N50-4t"], [30, 40], ["C20", "C25"],
          notes="Mk II KH-C20: machined cycloid"),
    Group("KH-14", ["wrist_yaw", "neck_yaw", "neck_pitch"], "harmonic", "EV", ["KM-50x20", "RI70", "ILM70x18"], [50, 80, 100], [14, 17], electronics_kg=0.06),
]


def gear_mass(gear, T_rep, hd=None):
    if gear == "planetary":
        return 0.0063 * T_rep**0.85
    if gear == "cycloid":
        return CYC[hd]["mass"]
    return HD_CSG[hd]["mass"]


def housing_mass(OD):
    return 0.25 + 4.0 * max(OD - 0.05, 0.0)


def evaluate(group, req, store, names):
    """Search motor x ratio (x HD size); return list of feasible candidates sorted by mass."""
    cands = []
    pts = {j: actuator_points(store, names, j) for j in group.joints}
    # supplementary corners + margins at actuator side
    corner = {}
    for j in group.joints:
        if j == "ankle":
            rp, rr = req["ankle_pitch"], req["ankle_roll"]
            T_rep = LK.ankle_actuator_torque(rp["T_rep_req"], rr["T_rep_req"])
            T_mom = LK.ankle_actuator_torque(rp["T_mom_req"], rr["T_rep_req"])
            w_req = LK.ankle_actuator_speed(rp["w_req"], 0)
            T_cont = LK.ankle_actuator_torque(rp["T_cont_req"], rr["T_cont_req"])
            T_hold = LK.ankle_actuator_torque(rp["T_hold_req"], rr["T_hold_req"])
        elif j == "knee":
            r = req["knee"]
            Gmin = min(LK.knee_G_function()(np.radians(np.linspace(0, 130, 66))))
            T_rep, T_mom, w_req = r["T_rep_req"] / 1.0, r["T_mom_req"] / 1.0, r["w_req"] * 1.0
            T_cont, T_hold = r["T_cont_req"] / Gmin, r["T_hold_req"] / Gmin
        else:
            r = req[j]
            T_rep, T_mom, w_req, T_cont, T_hold = r["T_rep_req"], r["T_mom_req"], r["w_req"], r["T_cont_req"], r["T_hold_req"]
        corner[j] = dict(T_rep=T_rep, T_mom=T_mom, w_req=w_req, T_cont=T_cont, T_hold=T_hold)
    drive = DRIVES[group.drive]
    sizes = group.hd_sizes or [None]
    for mn in group.motors:
        m = MOTORS[mn]
        T_avail = min(m["T_pk"], m["Kt"] * drive["I_pk"])
        for N in group.ratios:
            for hd in sizes:
                table = CYC if group.gear == "cycloid" else HD_CSG
                if group.gear in ("harmonic", "cycloid") and N not in table[hd]["r"]:
                    continue
                eta = ETA[group.gear]
                ok = True
                worst = 0.0
                for j in group.joints:
                    t_a, w_a, tag = pts[j]
                    mom = tag == "SD"
                    c = corner[j]
                    # normal operation: margin on torque and speed; momentary: torque only (may saturate -> checked vs gear)
                    t_m = np.where(mom, 0.0, t_a * RQ.MARGIN_T) / (N * eta)
                    w_m = np.where(mom, 0.0, w_a * RQ.MARGIN_W) * N
                    # supplementary corners: full repeated torque at low speed; 50 % torque at the speed
                    # requirement only where an analytic speed minimum governs (otherwise the simulated
                    # envelope, with margins, is the authority)
                    sim_w = w_a[~mom].max() * RQ.MARGIN_W if (~mom).any() else 0.0
                    if c["w_req"] > sim_w + 1e-6:
                        extra_t = np.array([c["T_rep"], 0.5 * c["T_rep"]]) / (N * eta)
                        extra_w = np.array([1.0, c["w_req"]]) * N
                    else:
                        extra_t = np.array([c["T_rep"]]) / (N * eta)
                        extra_w = np.array([1.0]) * N
                    t_all = np.concatenate([t_m, extra_t])
                    w_all = np.concatenate([w_m, extra_w])
                    if t_all.max() > T_avail:
                        ok = False
                        break
                    if np.any(w_all > np.maximum(omega_lim(m, t_all), 0)):
                        ok = False
                        break
                    if c["T_cont"] / (N * eta) > t_cont_eff(m, group.derate) or c["T_hold"] / (N * eta) > HOLD_FACTOR * t_cont_eff(m, group.derate):
                        ok = False
                        break
                    if group.gear in ("harmonic", "cycloid"):
                        rated, rep, avg, momr = table[hd]["r"][N]
                        if c["T_rep"] > rep or c["T_mom"] > momr or c["T_cont"] > avg:
                            ok = False
                            break
                        if w_all.max() * 60 / (2 * np.pi) > table[hd]["n_max"]:
                            ok = False
                            break
                    worst = max(worst, t_all.max() / T_avail)
                if not ok:
                    continue
                # planetary gear mass sized on 1.1 x the delivered peak (R10 sec. 8, change 2), not the requirement
                T_rep_g = max(max(corner[j]["T_mom"] for j in group.joints), 1.1 * T_avail * N * eta)
                gm = gear_mass(group.gear, T_rep_g, hd)
                OD = max(m["OD"] + 0.012, table[hd]["OD"] + 0.012 if hd else 0)
                mass = m["mass"] + gm + housing_mass(OD) + group.electronics_kg
                J_ref = m["J"] * 1.1 * N**2
                cands.append(dict(motor=mn, ratio=N, hd=hd, mass=mass, J_reflected=J_ref, rotor_J=m["J"] * 1.1,
                                  T_peak_out=T_avail * N * eta, T_cont_out=t_cont_eff(m, group.derate) * N * eta,
                                  w_noload_out=omega_lim(m, 0) / N, w_at_half_peak=omega_lim(m, 0.5 * T_avail) / N,
                                  utilisation=worst, OD=OD, motor_status=m["status"]))
    # prefer <= 90 % peak utilisation (headroom for disturbance rejection), then mass + reflected inertia
    cands.sort(key=lambda c: (c["utilisation"] > 0.90, c["mass"] + 0.8 * c["J_reflected"]))
    return cands, corner


def size_all(store, names, req):
    fam = {}
    report = {}
    for g in GROUPS:
        cands, corner = evaluate(g, req, store, names)
        report[g.name] = dict(group=g, cands=cands, corner=corner)
        if cands:
            c = cands[0]
            fam[g.name] = dict(mass=round(c["mass"], 3), rotor_J=c["rotor_J"], ratio=float(c["ratio"]), motor=c["motor"],
                               hd=c["hd"], gear=g.gear, drive=g.drive, joints=g.joints,
                               T_peak_out=c["T_peak_out"], T_cont_out=c["T_cont_out"], w_noload_out=c["w_noload_out"],
                               w_at_half_peak=c["w_at_half_peak"], J_reflected=c["J_reflected"], OD=c["OD"],
                               motor_status=c["motor_status"], n_feasible=len(cands))
    return fam, report
