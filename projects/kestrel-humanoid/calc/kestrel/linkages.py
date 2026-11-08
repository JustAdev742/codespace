"""Leg / wrist linkage synthesis and transmission ratios.

Knee four-bar
-------------
The knee actuator sits in the upper thigh, 0.160 m below the hip axis, and drives the
shank through a crank-rod-crank four-bar. Moving the 4.2 kg actuator from the knee to 0.16 m below the hip
cuts the leg's inertia about the hip by ~0.63 kg m^2, which directly lowers the
hip-pitch swing torque. A single four-bar cannot sweep 145 deg with good transmission
angles, so the knee range is 0-130 deg (deep squat needs ~125 deg; hard stop at 132 deg) with
transmission angles held at 35-145 deg over 20-110 deg (where torque is high) and 20-160 deg
at the ends; rod force at the ends is checked in structure.py. The linkage is synthesised for a *variable* ratio
G(theta) = d(phi_actuator)/d(theta_knee) = tau_knee / tau_actuator:
~1.0 near extension (swing: speed matters) rising to ~1.5 at 60-110 deg (stairs, step-up,
lunge: torque matters), with transmission angles kept between 35 and 145 deg.

Sagittal coordinates in the thigh frame: x forward, z up, knee axis at the origin.

Ankle and wrist parallel linkages
---------------------------------
Two actuators drive pitch and roll together through push-rods (ankle) or ball-screw
links (wrist). For small angles: tau_pitch = 2 F r_p, tau_roll = (F1 - F2) d, with
F = tau_a / r_c. So per-actuator torque for a demanded (tau_p, tau_r) is
tau_a = r_c (|tau_p| / (2 r_p) + |tau_r| / (2 d)).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import params as P

ROOT = Path(__file__).resolve().parents[2]
KNEE_ACT_BELOW_HIP = 0.160   # knee actuator axis below hip axis (18 mm running clearance to the hip actuator)


def rot(th):
    c, s = np.cos(th), np.sin(th)
    return np.array([[c, s], [-s, c]])  # knee flexion: (0,-1) -> (-sin, -cos)


def circle_intersect(c0, r0, c1, r1, ref):
    d = np.linalg.norm(c1 - c0)
    if d > r0 + r1 or d < abs(r0 - r1) or d == 0:
        return None
    a = (r0**2 - r1**2 + d**2) / (2 * d)
    h = np.sqrt(max(r0**2 - a**2, 0.0))
    pm = c0 + a * (c1 - c0) / d
    perp = np.array([-(c1 - c0)[1], (c1 - c0)[0]]) / d
    p1, p2 = pm + h * perp, pm - h * perp
    return p1 if np.linalg.norm(p1 - ref) <= np.linalg.norm(p2 - ref) else p2


class KneeFourBar:
    def __init__(self, r1, r2, beta, phi0, A=None):
        self.A = np.array(A if A is not None else [0.0, P.DIM["thigh"] - KNEE_ACT_BELOW_HIP])
        self.r1, self.r2, self.beta, self.phi0 = r1, r2, beta, phi0
        self.u0 = np.array([np.cos(beta), np.sin(beta)])
        C0 = self.A + r1 * np.array([np.cos(phi0), np.sin(phi0)])
        S0 = r2 * self.u0
        self.L = float(np.linalg.norm(C0 - S0))

    def solve(self, thetas):
        phis, mus, nus = [], [], []
        C = self.A + self.r1 * np.array([np.cos(self.phi0), np.sin(self.phi0)])
        for th in thetas:
            S = rot(th) @ (self.r2 * self.u0)
            Cn = circle_intersect(self.A, self.r1, S, self.L, C)
            if Cn is None:
                return None
            C = Cn
            phis.append(np.arctan2(C[1] - self.A[1], C[0] - self.A[0]))
            rod = C - S
            crank2 = S
            crank1 = C - self.A
            mus.append(np.degrees(np.arccos(np.clip(rod @ crank2 / (np.linalg.norm(rod) * np.linalg.norm(crank2)), -1, 1))))
            nus.append(np.degrees(np.arccos(np.clip(-rod @ crank1 / (np.linalg.norm(rod) * np.linalg.norm(crank1)), -1, 1))))
        phis = np.unwrap(np.array(phis))
        return phis, np.array(mus), np.array(nus)

    def ratio(self, thetas):
        r = self.solve(thetas)
        if r is None:
            return None
        phis, mus, nus = r
        G = np.gradient(phis, thetas)
        return np.abs(G), mus, nus, phis


def target_G(th_deg):
    s = np.clip((th_deg - 25) / 60, 0, 1)
    s = s * s * (3 - 2 * s)
    return 1.0 + 0.55 * s


def _knee_cost(x, th, mu_lo_end=20, mu_hi_end=160, mu_lo_mid=35, mu_hi_mid=145):
    r1, r2, beta, phi0 = x
    if not (0.03 < r1 < 0.07 and 0.03 < r2 < 0.08):
        return 1e3
    kb = KneeFourBar(r1, r2, beta, phi0)
    if not (0.20 < kb.L < 0.36):
        return 1e3
    res = kb.ratio(th)
    if res is None:
        return 1e3
    G, mu, nu, _ = res
    deg = np.degrees(th)
    mid = (deg > 20) & (deg < 110)
    pen = 0.0
    for arr in (mu, nu):
        pen += np.sum(np.clip(mu_lo_end - arr, 0, None)**2 + np.clip(arr - mu_hi_end, 0, None)**2)
        pen += np.sum(np.clip(mu_lo_mid - arr[mid], 0, None)**2 + np.clip(arr[mid] - mu_hi_mid, 0, None)**2)
    return float(np.mean((G - target_G(deg))**2) + 1e-3 * pen)


def synthesize_knee(starts=300, seed=1, th_max=130.0):
    """Penalised Nelder-Mead from many random starts; returns the best feasible design."""
    from scipy.optimize import minimize

    rng = np.random.default_rng(seed)
    th = np.radians(np.linspace(0, th_max, int(th_max / 2) + 1))
    best = None
    for _ in range(starts):
        x0 = [rng.uniform(0.035, 0.065), rng.uniform(0.035, 0.075), rng.uniform(0, 2 * np.pi), rng.uniform(0, 2 * np.pi)]
        if _knee_cost(x0, th) >= 1e3:
            continue
        r = minimize(_knee_cost, x0, args=(th,), method="Nelder-Mead", options=dict(maxiter=600, xatol=1e-5, fatol=1e-7))
        if best is None or r.fun < best.fun:
            best = r
    r1, r2, beta, phi0 = best.x
    kb = KneeFourBar(r1, r2, beta, phi0)
    G, mu, nu, phis = kb.ratio(th)
    out = dict(r1=kb.r1, r2=kb.r2, beta_deg=float(np.degrees(kb.beta) % 360), phi0_deg=float(np.degrees(kb.phi0) % 360),
               L=kb.L, A=kb.A.tolist(), cost=float(best.fun), theta_max_deg=th_max,
               actuator_sweep_deg=float(np.degrees(phis.max() - phis.min())),
               theta_deg=np.degrees(th).tolist(), G=G.tolist(), mu_deg=mu.tolist(), nu_deg=nu.tolist())
    return out


ANKLE = dict(r_c=0.040, r_p=0.052, d=0.036)   # actuator crank, foot lever (pitch), half rod spacing (roll)
WRIST = dict(r_p=0.022, d=0.016)              # wrist lever arms for the two linear actuators (m)


def ankle_actuator_torque(tau_p, tau_r, g=ANKLE):
    return g["r_c"] * (np.abs(tau_p) / (2 * g["r_p"]) + np.abs(tau_r) / (2 * g["d"]))


def ankle_actuator_speed(w_p, w_r, g=ANKLE):
    return (np.abs(w_p) * g["r_p"] + np.abs(w_r) * g["d"]) / g["r_c"]


def wrist_actuator_force(tau_p, tau_r, g=WRIST):
    return np.abs(tau_p) / (2 * g["r_p"]) + np.abs(tau_r) / (2 * g["d"])


def wrist_actuator_speed(w_p, w_r, g=WRIST):
    return np.abs(w_p) * g["r_p"] + np.abs(w_r) * g["d"]


def knee_G_function(knee_json=None):
    k = knee_json or json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    th = np.radians(k["theta_deg"])
    G = np.array(k["G"])
    return lambda q: np.interp(np.abs(q), th, G)


if __name__ == "__main__":
    k = synthesize_knee()
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "knee_fourbar.json").write_text(json.dumps(k, indent=1))
    th = np.array(k["theta_deg"])
    for a in (0, 20, 40, 60, 80, 100, 120, 130):
        i = int(np.argmin(abs(th - a)))
        print(f"knee {a:3d} deg  G {k['G'][i]:.2f}  target {target_G(a):.2f}  mu {k['mu_deg'][i]:.0f}  nu {k['nu_deg'][i]:.0f}")
    print({x: round(k[x], 4) for x in ("r1", "r2", "beta_deg", "phi0_deg", "L", "cost", "actuator_sweep_deg")})
