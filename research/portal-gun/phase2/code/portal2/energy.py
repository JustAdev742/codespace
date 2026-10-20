"""Energy bookkeeping for static wormholes (geometric units unless stated).

Integrated static-frame energy   E_static = Int rho dV   (dV = 4 pi r^2 dl, both sides of the throat)
Tolman (Komar) mass              M_T = Int (rho + p_l + 2 p_t) e^Phi dV
    From curvature.summary_formulas, (rho + p_l + 2 p_t) 4 pi r^2 e^Phi = d/dl (r^2 Phi' e^Phi),
    so M_T is a pure boundary term: the sum over the two ends of r^2 Phi' e^Phi, i.e. the ADM
    masses of the two mouths.  For Phi = const it vanishes identically.
ANEC along the radial null geodesic through the throat, with k normalised so that k^t = 1 at
infinity (affine dlambda = e^Phi dl):
    I = Int T_ab k^a k^b dlambda = Int e^(-Phi) (rho + p_l) dl
      = -(1/4 pi) Int e^(-Phi) (r'/r)^2 dl            (integration by parts, r'/r -> 0 at infinity)
    which is the Raychaudhuri defocusing identity Int R_kk dlambda = -Int theta^2/2 dlambda
    written out.  It is negative for every static spherically symmetric wormhole.
SI conversions: energy  E [J] = E_geo c^4 / G;  mass [kg] = E_geo c^2 / G;
                ANEC  [J/m^2] = I_geo c^4 / G.
"""
import numpy as np

from .constants import c, G
from .curvature import stress


def _grid(geom, n=400001, span=None):
    span = span or geom.l_max
    u = np.linspace(-1, 1, n)
    return span * np.sinh(10 * u) / np.sinh(10.0)


def integrated_energy(geom, **kw):
    l = _grid(geom, **kw)
    r, rp, rpp, Pp, Ppp = geom.local(l)
    rho, _, _ = stress(r, rp, rpp, Pp, Ppp)
    return float(np.trapezoid(rho * 4 * np.pi * r**2, l))


def tolman_mass(geom, **kw):
    l = _grid(geom, **kw)
    r, rp, rpp, Pp, Ppp = geom.local(l)
    rho, p_l, p_t = stress(r, rp, rpp, Pp, Ppp)
    return float(np.trapezoid((rho + p_l + 2 * p_t) * np.exp(geom.Phi(l)) * 4 * np.pi * r**2, l))


def anec_radial(geom, **kw):
    """(direct integral, defocusing-identity integral) along the radial null geodesic."""
    l = _grid(geom, **kw)
    r, rp, rpp, Pp, Ppp = geom.local(l)
    rho, p_l, _ = stress(r, rp, rpp, Pp, Ppp)
    eP = np.exp(-geom.Phi(l))
    direct = float(np.trapezoid(eP * (rho + p_l), l))
    identity = float(-np.trapezoid(eP * (rp / r) ** 2, l) / (4 * np.pi))
    return direct, identity


# ------------------------------------------------------------------ closed forms

def ellis_static_energy(r0):
    """Int rho dV for the Ellis wormhole: -(pi/2) r0 (geometric) -> kg via c^2/G."""
    return -np.pi * r0 / 2


def ellis_anec(r0):
    return -1.0 / (8.0 * r0)


def thin_shell_energy(a, M=0.0):
    """Surface energy of a Schwarzschild thin-shell wormhole (Visser 1989): sigma = -(1/2 pi a)
    sqrt(1 - 2M/a), surface pressure p = (1/4 pi a)(1 - M/a)/sqrt(1 - 2M/a).
    Returns (Int sigma dA, Tolman Int (sigma + 2p) dA)."""
    s = np.sqrt(1 - 2 * M / a)
    sigma = -s / (2 * np.pi * a)
    p = (1 - M / a) / (4 * np.pi * a * s)
    A = 4 * np.pi * a**2
    return sigma * A, (sigma + 2 * p) * A * s       # Tolman weight e^Phi = s at the shell


def flat_face_rim(R, excess=2 * np.pi):
    """Visser's flat-face (dihedral) portal: the rims are one closed string with conical excess
    angle `excess` (2 pi for the cross-glued disc pair).  Straight-string relation
    deficit = 8 pi G mu / c^2  =>  mu = -excess / (8 pi)  (geometric: per unit length).
    Returns (mu per length, total Int rho dV for a circle of radius R, Tolman mass of a static
    Nambu-Goto string: rho + p_parallel = 0 so the string itself has zero active mass)."""
    mu = -excess / (8 * np.pi)
    return mu, mu * 2 * np.pi * R, 0.0


def to_kg(E_geo):
    return E_geo * c**2 / G


def to_J_per_m2(I_geo):
    return I_geo * c**4 / G
