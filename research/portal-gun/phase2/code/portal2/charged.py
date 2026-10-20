"""Charged Ellis-Bronnikov wormholes near extremality: what the long-lived limit costs.

Background (Gonzalez, Guzman & Sarbach 2009, PRD 80, 024023, as written in Blazquez-Salcedo et
al. 2026, PLB 875, 140335, eqs. 2-7), phantom scalar plus Maxwell field, G = c = 1:

    ds^2 = -G(r) dt^2 + G(r)^-1 [dr^2 + (r^2 + r0^2) dOmega^2],   y = arctan(r/r0),

    critical (Q_e = M):          G = sigma^2 (1 - g1 y)^-2,           sigma = 1 - g1 pi/2,
    supercritical, symmetric:    G = sigma^2 cos(mu y)^-2,             sigma = cos(mu pi/2),

with sigma fixed by G -> 1 at r -> +inf.  The 2026 paper finds that the radial instability
survives the charge but its rate falls towards zero as the solution approaches the extremal
Reissner-Nordstrom black hole (Q_e = M = r_T); for a critical wormhole with r_T = 10 km it gives
tau0 = 0.13 s at Q_e/r_T = 0.95 and about 1.1 years at 0.9999.

This module computes what that limit implies for a human-scale portal (our calculation, not the
paper's): the redshift at the throat (how fast a traveller falling from rest arrives), the mass,
and the field strength compared with the Schwinger field, plus the Dirac-monopole count for the
magnetic version.
"""
import numpy as np
from scipy.optimize import brentq, minimize_scalar

from .constants import c, G

EPS0 = 8.8541878128e-12          # F/m
E_CHARGE = 1.602176634e-19       # C
HBAR = 1.054571817e-34           # J s
M_E = 9.1093837015e-31           # kg
ALPHA = 7.2973525693e-3
E_SCHWINGER = M_E**2 * c**3 / (E_CHARGE * HBAR)     # V/m
DIRAC_Q = E_CHARGE / (2 * ALPHA)                     # Dirac magnetic charge, electric-equivalent (C)


def critical(g1, r0=1.0):
    """Critical solution with asymmetry g1 in (0, 2/pi): throat radius, mass, charge, G at the throat."""
    sigma = 1 - g1 * np.pi / 2
    Gf = lambda r: sigma**2 / (1 - g1 * np.arctan(r / r0)) ** 2
    R = lambda r: np.sqrt((r**2 + r0**2) / Gf(r))
    # the throat moves outward roughly as sigma^(-1/3) near extremality: search in u = asinh(r/r0)
    res = minimize_scalar(lambda u: R(r0 * np.sinh(u)), bounds=(-20.0, 20.0), method="bounded",
                          options={"xatol": 1e-12})
    r_th = r0 * np.sinh(res.x)
    M = g1 * r0 / sigma                  # from G ~ 1 - 2M/r at r -> +inf
    return {"g1": g1, "r_T": float(R(r_th)), "M": M, "Q": M, "G_throat": float(Gf(r_th)),
            "r_throat": float(r_th)}


def critical_at(q_over_rT, r0=1.0):
    """Critical solution with Q_e/r_T = q_over_rT (0 < q < 1)."""
    f = lambda g: critical(g, r0)["Q"] / critical(g, r0)["r_T"] - q_over_rT
    g1 = brentq(f, 1e-9, 2 / np.pi - 1e-13, xtol=1e-15)
    return critical(g1, r0)


def supercritical_symmetric(mu, r0=1.0):
    """Symmetric supercritical solution (g1 = 0, 0 < mu < 1), in closed form:
    throat at r = 0 with G = cos^2(mu pi/2), r_T = r0/sigma, Q_e = mu r_T, M = mu sin(mu pi/2) r_T."""
    sigma = np.cos(mu * np.pi / 2)
    r_T = r0 / sigma
    return {"mu": mu, "r_T": r_T, "Q": mu * r_T, "M": mu * np.tan(mu * np.pi / 2) * r0,
            "G_throat": sigma**2, "r_throat": 0.0}


def crossing_gamma(G_throat):
    """Lorentz factor at the throat of a traveller falling from rest at infinity (E = gamma e^Phi = 1)."""
    return 1.0 / np.sqrt(G_throat)


def field_limits(r_T=1.0, q_over_rT=1.0):
    """SI field, charge, monopole count and mass for a throat of areal radius r_T (m) with
    Q_geo = q r_T (geometrised Gaussian units, Q^2 = G M^2 / (4 pi eps0) at extremality)."""
    Q_geo = q_over_rT * r_T
    E = c**2 / np.sqrt(4 * np.pi * EPS0 * G) * Q_geo / r_T**2       # V/m at the throat
    Q = c**2 * np.sqrt(4 * np.pi * EPS0 / G) * Q_geo                 # C
    return {"E_V_per_m": E, "E_over_Schwinger": E / E_SCHWINGER, "Q_C": Q,
            "Q_in_e": Q / E_CHARGE, "dirac_monopoles": Q / DIRAC_Q, "B_T": E / c,
            "extremal_mass_kg": r_T * c**2 / G,
            "r_T_for_E_eq_Schwinger_m": c**2 / np.sqrt(4 * np.pi * EPS0 * G) * q_over_rT / E_SCHWINGER}


def tau0_scaled(tau0_ref_s, r_T_ref_m, r_T_m):
    """At fixed dimensionless parameters the growth rate scales as 1/r_T, so tau0 scales as r_T."""
    return tau0_ref_s * r_T_m / r_T_ref_m
