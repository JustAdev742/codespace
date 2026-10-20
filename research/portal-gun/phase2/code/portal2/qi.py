"""Quantum-inequality audit of static wormholes: a generalised Ford-Roman method.

The inequality (Ford & Roman 1995; massless minimally coupled scalar field in 4D Minkowski
space, inertial observer, Lorentzian sampling function of width t0):

    (t0/pi) Int <T_00>(tau) dtau / (tau^2 + t0^2)  >=  -3 hbar / (32 pi^2 c^3 t0^4).

Ford & Roman (1996) apply it in curved spacetime along a geodesic, with t0 much smaller than
the smallest proper radius of curvature seen by the observer and than the scale over which
the geometry changes.  Here L0 = c t0 = f * min(curvature length, variation length), f << 1.

In geometric units (energy density expressed as curvature, 1/m^2), the bound on the sampled
density is   rho_QI = 3 l_P^2 / (32 pi^2 L0^4),   and the deficit of a configuration is
D = -(sampled rho') / rho_QI.  D > 1: this method excludes the configuration.  D <= 1: this
method cannot exclude it (which is not the same as showing it is allowed).

Two versions are implemented:
  local_deficit     density and scales at one point of the worldline (Ford & Roman's form),
                    with the variation length measured along the observer's worldline;
  sampled_deficit   the Lorentzian-sampled average evaluated along the actual geodesic, with
                    a self-consistent window (largest L0 with L0 <= f * min curvature length
                    within +-k L0 of the centre).
What is new relative to Ford & Roman: the observer's speed is optimised rather than fixed, the
curvature length uses every orthonormal component in the observer's frame, the variation length
is measured in the observer's proper time, and the sampled version needs no constant-density
assumption.
"""
import numpy as np

from .constants import l_P
from .curvature import stress


def boosted_curvature_components(r, rp, rpp, Pp, Ppp, beta):
    """Independent orthonormal Riemann components seen by a radially moving observer.

    Static frame: R_tltl = Phi'' + Phi'^2, A = R_tthtth = Phi' r'/r, B = R_lthlth = -r''/r,
    C = R_thphthph = (1 - r'^2)/r^2, all other independent components zero (curvature.derive).
    Under a radial boost R_tltl and C are invariant and
        R_t'th t'th = g^2 (A + b^2 B),  R_l'th l'th = g^2 (B + b^2 A),  R_t'th l'th = g^2 b (A + B).
    (tests/test_curvature.py checks these against a direct tensor transformation.)
    """
    R_tltl = Ppp + Pp**2
    A = Pp * rp / r
    B = -rpp / r
    C = (1 - rp**2) / r**2
    g2 = 1.0 / (1.0 - beta**2)
    return R_tltl, C, g2 * (A + beta**2 * B), g2 * (B + beta**2 * A), g2 * beta * (A + B)


def curvature_length(r, rp, rpp, Pp, Ppp, beta):
    comps = boosted_curvature_components(r, rp, rpp, Pp, Ppp, beta)
    m = np.max(np.abs(np.stack(np.broadcast_arrays(*comps))), axis=0)
    with np.errstate(divide="ignore"):
        return 1.0 / np.sqrt(m)


def boosted_density(r, rp, rpp, Pp, Ppp, beta):
    rho, p_l, _ = stress(r, rp, rpp, Pp, Ppp)
    return (rho + beta**2 * p_l) / (1.0 - beta**2)


def rho_qi(L0):
    """Ford-Roman bound on the sampled energy density, geometric units (1/m^2)."""
    return 3.0 * l_P**2 / (32.0 * np.pi**2 * L0**4)


# ------------------------------------------------------------------ analytic throat result

def throat_deficit_analytic(eps, Phi2_r0sq, f, r0):
    """Maximum over radial observers at a reflection-symmetric throat of the local deficit.

    eps = 1 - b'(r0) = 2 r0 r''(0) > 0 (flare-out), Phi2_r0sq = Phi''(0) r0^2 (Phi'(0) = 0).
    With x = eps gamma^2 the observer sees rho' = (1 - x)/(8 pi r0^2) and curvature
    max(x/2, 1, |Phi2| r0^2)/r0^2, the variation length being assumed no shorter than the
    curvature length (a 'smooth' throat).  Returns (D_max, x_at_max).
    """
    p = abs(Phi2_r0sq)
    x = np.geomspace(max(eps, 1.0) * (1 + 1e-12), max(eps, 1.0) * 1e8 + 4 * p + 10, 200001)
    x = x[x >= eps]
    curv = np.maximum.reduce([x / 2, np.ones_like(x), np.full_like(x, p)])
    D = (4 * np.pi / 3) * f**4 * (r0 / l_P) ** 2 * (x - 1) / curv**2
    i = int(np.argmax(D))
    return float(D[i]), float(x[i])


# ------------------------------------------------------------------ worldline quantities

def _along(geom, l, E):
    """rho', curvature length, local speed and gamma along a radial geodesic of energy E."""
    r, rp, rpp, Pp, Ppp = geom.local(l)
    gam = np.maximum(E * np.exp(-geom.Phi(l)), 1.0)
    beta = np.sqrt(np.clip(1 - 1 / gam**2, 0, None))
    return boosted_density(r, rp, rpp, Pp, Ppp, beta), curvature_length(r, rp, rpp, Pp, Ppp, beta), beta, gam


def _var_len(q, h):
    """Length over which q changes by O(1): min(|q/q'|, sqrt|2 q/q''|) from a 5-point stencil
    (axis 0 = stencil index -2..2)."""
    d1 = (q[3] - q[1]) / (2 * h)
    d2 = (q[3] - 2 * q[2] + q[1]) / h**2
    with np.errstate(divide="ignore", invalid="ignore"):
        s1 = np.where(d1 != 0, np.abs(q[2] / d1), np.inf)
        s2 = np.where(d2 != 0, np.sqrt(np.abs(2 * q[2] / d2)), np.inf)
    return np.minimum(s1, s2)


def local_deficit(geom, l_c, gamma_c, f):
    """Ford-Roman deficit for radial geodesic observers at positions l_c with Lorentz factors
    gamma_c there (arrays broadcast together; gamma_c = 1 is an observer at rest, geodesic
    only where Phi' = 0).

    Sampling length L0 = f * min(ell, d/gamma, d_t):
      ell  smallest radius of curvature in the observer's frame,
      d    static-frame proper distance over which the observer's density or curvature changes
           (Ford & Roman's 'distance to a boundary'), Lorentz-contracted by gamma,
      d_t  proper-time scale (x c) over which rho' changes along the worldline, which differs
           from d/gamma when the speed changes along the path (Phi' != 0).
    Returns a dict of arrays.
    """
    l_c, gamma_c = np.broadcast_arrays(np.asarray(l_c, float), np.asarray(gamma_c, float))
    l_c, gamma_c = l_c.ravel(), gamma_c.ravel()
    E = gamma_c * np.exp(geom.Phi(l_c))
    r, rp, rpp, Pp, Ppp = geom.local(l_c)
    beta = np.sqrt(np.clip(1 - 1 / gamma_c**2, 0, None))
    rho_c = boosted_density(r, rp, rpp, Pp, Ppp, beta)
    ell_c = curvature_length(r, rp, rpp, Pp, Ppp, beta)
    h = 1e-3 * np.minimum(ell_c, r)
    k = np.arange(-2, 3)[:, None]
    ls = l_c[None, :] + h[None, :] * k
    loc = geom.local(ls)
    # spatial variation at fixed observer velocity
    q_rho = boosted_density(*loc, beta[None, :])
    q_curv = 1.0 / curvature_length(*loc, beta[None, :]) ** 2
    d = np.minimum(_var_len(q_rho, h), _var_len(q_curv, h))
    # temporal variation along the geodesic (speed changes where Phi' != 0)
    gam_s = np.maximum(E[None, :] * np.exp(-geom.Phi(ls)), 1.0)
    beta_s = np.sqrt(np.clip(1 - 1 / gam_s**2, 0, None))
    rho_t = boosted_density(*loc, beta_s)
    v = gamma_c * beta                       # dl / dtau
    with np.errstate(divide="ignore", invalid="ignore"):
        d_t = np.where(v > 0, _var_len(rho_t, h) / np.where(v > 0, v, 1.0), np.inf)
    L0 = f * np.minimum.reduce([ell_c, d / gamma_c, d_t])
    with np.errstate(divide="ignore", invalid="ignore"):
        # a negative density with no limiting scale (flat, static) is excluded outright: D = inf
        D = np.where(rho_c < 0, -rho_c / rho_qi(L0), 0.0)
    return {"l": l_c, "gamma": gamma_c, "rho_b": rho_c, "ell": ell_c, "d": d, "d_t": d_t,
            "L0": L0, "D": D}


def scan(geom, f=0.01, l_grid=None, gammas=None, l_extent=10.0):
    """Maximise the local deficit over observer speed and position (|l| <= l_extent * r0).
    Observers at rest are included only where they are geodesic (Phi' = 0).
    Returns (best: dict of scalars, table: dict of arrays)."""
    if l_grid is None:
        pos = np.geomspace(1e-4, l_extent, 120) * geom.r0
        l_grid = np.concatenate([-pos[::-1], [0.0], pos])
    if gammas is None:
        gammas = np.concatenate([[1.0], np.geomspace(1.0 + 1e-6, 1e6, 240)])
    L, Gm = np.meshgrid(l_grid, gammas, indexing="ij")
    tab = local_deficit(geom, L, Gm, f)
    Pp = geom.local(tab["l"])[3]
    ok = (tab["gamma"] > 1.0) | (np.abs(Pp) < 1e-12)
    D = np.where(ok, tab["D"], -np.inf)
    i = int(np.argmax(D))
    best = {key: float(val[i]) for key, val in tab.items()}
    return best, tab


# ------------------------------------------------------------------ sampled version

def geodesic_profile(geom, E, n=20001, l_span=None):
    span = l_span or geom.l_max
    u = np.linspace(-1, 1, n)
    l = span * np.sinh(10 * u) / np.sinh(10.0)
    rho, ell, beta, gam = _along(geom, l, E)
    with np.errstate(divide="ignore"):
        dtau_dl = 1.0 / (gam * beta)
    tau = np.concatenate([[0.0], np.cumsum(0.5 * (dtau_dl[1:] + dtau_dl[:-1]) * np.diff(l))])
    tau -= np.interp(0.0, l, tau)
    return {"l": l, "tau": tau, "rho_b": rho, "ell": ell, "beta": beta}


def self_consistent_window(prof, tau_c, f, k=3.0):
    """Largest L0 with L0 <= f * min(curvature length within +-k L0 of tau_c), by bisection."""
    tau, ell = prof["tau"], prof["ell"]

    def g(L):
        sel = np.abs(tau - tau_c) <= k * L
        m = np.min(ell[sel]) if np.any(sel) else np.interp(tau_c, tau, ell)
        return f * m

    lo, hi = 0.0, f * float(np.max(ell[np.isfinite(ell)]))
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if mid <= g(mid):
            lo = mid
        else:
            hi = mid
    return lo


def sampled_deficit(geom, E, f, tau_c=0.0, k=3.0, m=8001):
    prof = geodesic_profile(geom, E)
    L0 = self_consistent_window(prof, tau_c, f, k)
    u = np.linspace(-np.pi / 2, np.pi / 2, m + 2)[1:-1]
    tau = tau_c + L0 * np.tan(u)
    rho = np.interp(tau, prof["tau"], prof["rho_b"], left=0.0, right=0.0)
    S = float(np.trapezoid(rho, u) / np.pi)
    return {"E": E, "tau_c": tau_c, "L0": L0, "sampled": S, "D": -S / rho_qi(L0)}
