"""Analytic design of inner-rotor surface-PM frameless BLDC motors (concentrated winding).

Used for (a) checking purchased frameless kits against first principles and (b) the
custom KM-series motors and the scratch-build track (docs/13). It is a lumped
magnetic-circuit + winding model: good to roughly +-15 % on torque constant and
resistance, and it must be confirmed by FEA (FEMM / Motor-CAD / Ansys) and by the
bench tests in docs/11 before any part is cut. Iron loss, slot leakage and cogging are
not modelled here (FEA step).

Conventions: Kt in N*m per A(rms phase); Ke_LL,peak = Kt*sqrt(2/3); R_LL = 2*R_phase;
Km = Kt / sqrt(3 R_phase) = T / sqrt(P_copper).

Calibration (run ``python -m kestrel.motor_design``): the model reproduces the CubeMars
RI115-PH datasheet (Kt 0.29 N m/A, Km 0.66 N m/sqrt(W)) within a few percent with
plausible geometry - see calibrate().
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from math import pi, sqrt

RHO_CU20 = 1.72e-8          # ohm m
ALPHA_CU = 0.00393          # 1/K
DENS = dict(fe=7650, cu=8900, mag=7500, al=2810)
# Calibration: the ideal-geometry model over-predicts Km by 12-17 % against the CubeMars
# RI115-PH and TQ ILM115x25 datasheets (end-winding length, proximity/AC effects, real fill,
# lead resistance). A single resistance factor of 1.30 brings both within +-5 %.
K_R_CAL = 1.30

# fundamental winding factors, double-layer concentrated (tooth) windings
KW1 = {(9, 8): .945, (9, 10): .945, (12, 10): .933, (12, 14): .933, (18, 16): .945, (18, 20): .945,
       (24, 20): .933, (24, 28): .933, (27, 24): .945, (27, 30): .945, (36, 30): .933, (36, 32): .945,
       (36, 40): .945, (36, 42): .933, (45, 42): .951, (48, 40): .933, (48, 56): .933, (54, 48): .945, (54, 60): .945}


@dataclass
class MotorSpec:
    name: str
    D_o: float = 0.115         # stator OD (m)
    split: float = 0.74        # airgap diameter / stator OD
    L: float = 0.026           # active stack length (m)
    Qs: int = 36               # slots
    poles: int = 40            # magnet poles (2p)
    g: float = 0.0006          # mechanical airgap (m)
    h_m: float = 0.0030        # magnet thickness (m)
    alpha_m: float = 0.85      # magnet arc / pole pitch
    Br20: float = 1.28         # remanence at 20 C (N42SH ~1.28-1.32 T)
    mu_r: float = 1.05
    B_tooth: float = 1.60      # design tooth flux density (T)
    B_yoke: float = 1.40       # design yoke flux density (T)
    h_tip: float = 0.0012      # tooth-tip depth (m)
    k_fill: float = 0.42       # copper fill (needle/hand-wound concentrated coils ~0.40-0.45)
    N_c: int = 9               # turns per coil
    a: int = 1                 # parallel paths
    T_wind: float = 120.0      # winding temperature for resistance (C)
    J_cont: float = 7.0e6      # continuous current density, conduction-cooled housing (A/m^2)
    J_peak: float = 28e6       # short-duration (few s) current density limit (A/m^2)
    sat_knee: float = 2.6      # electric loading multiple above which torque saturates
    rotor_hub_ID: float = 0.0  # bore of rotor hub (m); 0 => computed from yoke


def design(s: MotorSpec):
    kw = KW1[(s.Qs, s.poles)]
    p = s.poles // 2
    r_o = s.D_o / 2
    D_g = s.split * s.D_o
    r_g = D_g / 2
    kc = 1.05
    Br = s.Br20 * (1 - 0.0012 * (80 - 20))          # magnets at 80 C
    Bg = Br * s.h_m / (s.h_m + s.mu_r * s.g * kc)
    Bg1 = 4 / pi * Bg * __import__("math").sin(s.alpha_m * pi / 2)
    # stator geometry
    k_st = 0.95
    pitch_g = pi * D_g / s.Qs
    w_t = Bg * pitch_g / (s.B_tooth * k_st)
    h_y = Bg1 * D_g / (2 * p * s.B_yoke * k_st) * 1.0
    r_slot_in = r_g + s.g / 2 + s.h_tip
    r_slot_out = r_o - h_y
    h_s = r_slot_out - r_slot_in
    A_slot = pi * (r_slot_out**2 - r_slot_in**2) / s.Qs - w_t * h_s
    w_s = A_slot / h_s
    A_cu_slot = s.k_fill * A_slot
    a_w = A_cu_slot / (2 * s.N_c)                       # conductor area per turn (double layer)
    N_ph = s.Qs / 3 * s.N_c / s.a
    Kt = 1.5 * sqrt(2) * kw * N_ph * Bg1 * D_g * s.L
    l_turn = 2 * s.L + 2 * 1.3 * (w_t + 0.5 * w_s) * pi / 2
    rho = RHO_CU20 * (1 + ALPHA_CU * (s.T_wind - 20))
    R_ph = K_R_CAL * rho * N_ph * l_turn / (a_w * s.a)
    R_ph20 = K_R_CAL * RHO_CU20 * N_ph * l_turn / (a_w * s.a)
    Km = Kt / sqrt(3 * R_ph)
    I_cont = s.J_cont * a_w * s.a
    I_pk = s.J_peak * a_w * s.a
    T_cont = Kt * I_cont
    T_lin_pk = Kt * I_pk
    T_sat = s.sat_knee * T_cont
    T_pk = T_lin_pk if T_lin_pk < T_sat else T_sat + 0.45 * (T_lin_pk - T_sat)
    I_pk_eff = I_pk
    # rotor
    r_mag_out = r_g - s.g / 2
    r_mag_in = r_mag_out - s.h_m
    h_ry = h_y * 0.9
    r_rotor_in = s.rotor_hub_ID / 2 if s.rotor_hub_ID else r_mag_in - h_ry
    # masses
    m_stator_fe = DENS["fe"] * s.L * k_st * (pi * (r_o**2 - r_slot_in**2) - s.Qs * A_slot + pi * (r_slot_in**2 - (r_g + s.g / 2)**2))
    m_cu = DENS["cu"] * 3 * N_ph * s.a * l_turn * a_w
    m_mag = DENS["mag"] * s.L * s.alpha_m * pi * (r_mag_out**2 - r_mag_in**2)
    m_rotor_fe = DENS["fe"] * s.L * pi * (r_mag_in**2 - (r_mag_in - h_ry)**2)
    m_total = (m_stator_fe + m_cu + m_mag + m_rotor_fe) * 1.08  # + insulation, varnish, sleeve
    J_rotor = 0.5 * m_mag * (r_mag_out**2 + r_mag_in**2) + 0.5 * m_rotor_fe * (r_mag_in**2 + (r_mag_in - h_ry)**2)
    J_rotor *= 1.25  # + hub, encoder disc share
    Ke_LL_pk = Kt * sqrt(2 / 3)
    out = dict(spec=asdict(s), kw=kw, Bg=Bg, Bg1=Bg1, D_g=D_g, w_t=w_t, h_y=h_y, h_s=h_s, A_slot=A_slot, w_s=w_s,
               a_w=a_w, wire_d_equiv=sqrt(4 * a_w / pi), N_ph=N_ph, Kt=Kt, Ke_LL_pk=Ke_LL_pk, R_ph=R_ph,
               R_LL=2 * R_ph, R_LL20=2 * R_ph20, Km=Km, I_cont=I_cont, I_pk=I_pk_eff, T_cont=T_cont, T_pk=T_pk,
               l_turn=l_turn, m_stator_fe=m_stator_fe, m_cu=m_cu, m_mag=m_mag, m_rotor_fe=m_rotor_fe,
               mass=m_total, J_rotor=J_rotor, rotor_OD=2 * r_mag_out, rotor_ID=2 * r_rotor_in,
               end_turn_overhang=1.3 * (w_t + 0.5 * w_s) * 0.6 + 0.002)
    out["length_total"] = s.L + 2 * out["end_turn_overhang"]
    out["P_cu_cont"] = 3 * I_cont**2 * R_ph
    out["P_cu_peak"] = 3 * I_pk_eff**2 * R_ph
    return out


def calibrate():
    """Reproduce CubeMars RI115-PH (Kt 0.29 N m/A, Km 0.66, OD 115, total length 38.1, 20 pp)."""
    s = MotorSpec("RI115-PH model", D_o=0.115, split=0.735, L=0.0255, Qs=36, poles=40, N_c=5, h_m=0.0028)
    return design(s)


if __name__ == "__main__":
    d = calibrate()
    for k in ("Kt", "Km", "R_LL", "T_cont", "T_pk", "mass", "J_rotor", "length_total", "wire_d_equiv", "Bg"):
        print(f"{k:14s} {d[k]:.4g}")
