"""Tidal load on a traveller crossing a static wormhole radially.

A body of length ell_b (along the motion) and width w_b moving radially feels the tidal tensor
E_ij = R_{i0j0} of its own frame (boosted components from qi.boosted_curvature_components):
    radial  a_r  = c^2 ell_b |R_tltl|                      (boost invariant)
    lateral a_th = c^2 w_b  gamma^2 |A + beta^2 B|          A = Phi' r'/r, B = -r''/r
(the content of Morris & Thorne 1988, eqs. 49-50, rederived from curvature.derive).  Besides the
peak acceleration we report the impulse Int a dtau, which is what matters when a large tidal
acceleration lasts only a very short time.

The traveller is specified by its speed far from the throat, v_inf (Phi -> 0 there), so that
redshift wells (which speed it up) and hills (which it must climb) are both handled.  The local
speed follows from energy conservation, gamma exp(Phi) = const, written in a form that keeps
full precision at everyday speeds:
    beta^2 = 1 - exp(-2 dPhi) (1 - beta_inf^2),  dPhi = -Phi(l) (relative to infinity).
"""
import numpy as np

from .constants import c
from .qi import boosted_curvature_components


def speed_profile(geom, l, v_inf):
    b2_inf = (v_inf / c) ** 2
    dPhi = -geom.Phi(l)
    b2 = -np.expm1(-2 * dPhi) + b2_inf * np.exp(-2 * dPhi)
    return b2


def crossing(geom, v_inf, ell_b=2.0, w_b=0.5, n=40001, span=None):
    """Peak tidal accelerations (m/s^2), impulses (m/s) and proper crossing time (s) for a
    radial crossing that starts at speed v_inf far away."""
    span = span or 20 * geom.r0
    u = np.linspace(-1, 1, n)
    l = span * np.sinh(8 * u) / np.sinh(8.0)
    b2 = speed_profile(geom, l, v_inf)
    if np.any(b2 <= 0):
        raise ValueError("traveller turns back: v_inf too small to climb the redshift hill")
    beta = np.sqrt(b2)
    r, rp, rpp, Pp, Ppp = geom.local(l)
    R_tltl, C, Rtt, Rll, Rtl = boosted_curvature_components(r, rp, rpp, Pp, Ppp, beta)
    a_r = c**2 * ell_b * np.abs(R_tltl)
    a_th = c**2 * w_b * np.abs(Rtt)
    gam = 1 / np.sqrt(1 - b2)
    dtau = np.gradient(l) / (gam * beta * c)
    return {"a_r_max": float(a_r.max()), "a_th_max": float(a_th.max()),
            "dv_r": float(np.sum(a_r * dtau)), "dv_th": float(np.sum(a_th * dtau)),
            "beta_max": float(beta.max()), "proper_time": float(np.sum(dtau))}


def min_v_inf(geom):
    """Smallest speed at infinity that crosses a redshift hill (0 if there is none)."""
    l = np.linspace(-geom.l_max, geom.l_max, 200001)
    Pmax = float(np.max(geom.Phi(l)))
    return 0.0 if Pmax <= 0 else c * float(np.sqrt(-np.expm1(-2 * Pmax)))
