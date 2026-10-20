"""Curvature and stress-energy of static, spherically symmetric metrics.

Everything here is derived from the metric by sympy, not transcribed from a paper.
Geometric units G = c = 1; lengths in metres, curvature in 1/m^2.

Proper-length gauge:
    ds^2 = -exp(2 Phi(l)) dt^2 + dl^2 + r(l)^2 dOmega^2,
with static orthonormal frame e_t = exp(-Phi) d_t, e_l = d_l, e_th = d_th / r,
e_ph = d_ph / (r sin th).  Index order of every 4x4(x4x4) array: (t, l, theta, phi).

Sign conventions (MTW): R^a_{bcd} = d_c Gamma^a_{db} - d_d Gamma^a_{cb} + ..., so a
round 2-sphere of radius a has R_{th ph th ph} = +1/a^2, and the tidal acceleration
between geodesics is  d^2 xi^i / dtau^2 = -R^i_{t j t} xi^j.
"""
from functools import lru_cache

import numpy as np
import sympy as sp

# local data the curvature can depend on
r_, rp_, rpp_, Pp_, Ppp_ = sp.symbols("r rp rpp Pp Ppp", real=True)
LOCAL = (r_, rp_, rpp_, Pp_, Ppp_)


@lru_cache(maxsize=None)
def derive():
    """Return dict with symbolic orthonormal Riemann (4x4x4x4 nested list) and Einstein
    tensors as functions of the local data (r, r', r'', Phi', Phi'')."""
    t, l, th, ph = sp.symbols("t l theta phi", real=True)
    Phi = sp.Function("Phi")(l)
    r = sp.Function("r")(l)
    x = [t, l, th, ph]
    n = 4
    g = sp.diag(-sp.exp(2 * Phi), 1, r**2, r**2 * sp.sin(th) ** 2)
    ginv = g.inv()
    Gam = [[[sp.simplify(sum(ginv[a, d] * (sp.diff(g[d, b], x[c]) + sp.diff(g[d, c], x[b])
                                              - sp.diff(g[b, c], x[d])) for d in range(n)) / 2)
             for c in range(n)] for b in range(n)] for a in range(n)]

    def riem_up(a, b, c, d):  # R^a_{bcd}
        e = sp.diff(Gam[a][d][b], x[c]) - sp.diff(Gam[a][c][b], x[d])
        e += sum(Gam[a][c][k] * Gam[k][d][b] - Gam[a][d][k] * Gam[k][c][b] for k in range(n))
        return e

    Rup = [[[[riem_up(a, b, c, d) for d in range(n)] for c in range(n)] for b in range(n)] for a in range(n)]
    Rdn = [[[[sp.simplify(sum(g[a, k] * Rup[k][b][c][d] for k in range(n)))
              for d in range(n)] for c in range(n)] for b in range(n)] for a in range(n)]
    # diagonal tetrad: e_a = s_a * d_a
    s = [sp.exp(-Phi), 1, 1 / r, 1 / (r * sp.sin(th))]
    subs = {sp.Derivative(r, (l, 2)): rpp_, sp.Derivative(r, l): rp_,
            sp.Derivative(Phi, (l, 2)): Ppp_, sp.Derivative(Phi, l): Pp_}
    Rhat = [[[[sp.simplify(sp.trigsimp(sp.expand_trig(
        (Rdn[a][b][c][d] * s[a] * s[b] * s[c] * s[d]).subs(subs).subs(r, r_))))
               for d in range(n)] for c in range(n)] for b in range(n)] for a in range(n)]
    for a in range(n):
        for b in range(n):
            for c in range(n):
                for d in range(n):
                    if Rhat[a][b][c][d].has(th):
                        raise RuntimeError(f"angle dependence left in R[{a}{b}{c}{d}]")
    eta = sp.diag(-1, 1, 1, 1)
    ric = sp.zeros(n, n)
    for b in range(n):
        for d in range(n):
            ric[b, d] = sp.simplify(sum(eta[a, c] * Rhat[a][b][c][d] for a in range(n) for c in range(n)))
    Rs = sp.simplify(sum(eta[a, a] * ric[a, a] for a in range(n)))
    Ein = sp.simplify(ric - eta * Rs / 2)
    return {"Rhat": Rhat, "Ein": Ein}


@lru_cache(maxsize=None)
def _numeric():
    d = derive()
    flat = [d["Rhat"][a][b][c][e] for a in range(4) for b in range(4) for c in range(4) for e in range(4)]
    fR = sp.lambdify(LOCAL, flat, "numpy")
    fE = sp.lambdify(LOCAL, [d["Ein"][a, b] for a in range(4) for b in range(4)], "numpy")
    return fR, fE


def _bcast(vals, shape):
    out = np.empty((len(vals),) + shape)
    for i, v in enumerate(vals):
        out[i] = np.broadcast_to(np.asarray(v, dtype=float), shape)
    return out


def riemann_static(r, rp, rpp, Pp, Ppp):
    """Orthonormal Riemann tensor R_{abcd} in the static frame, shape (4,4,4,4)+broadcast."""
    fR, _ = _numeric()
    shape = np.broadcast(r, rp, rpp, Pp, Ppp).shape
    arr = _bcast(fR(r, rp, rpp, Pp, Ppp), shape)
    return arr.reshape((4, 4, 4, 4) + shape)


def einstein_static(r, rp, rpp, Pp, Ppp):
    """Orthonormal Einstein tensor G_{ab} (1/m^2), shape (4,4)+broadcast.  T_ab = G_ab / 8 pi."""
    _, fE = _numeric()
    shape = np.broadcast(r, rp, rpp, Pp, Ppp).shape
    return _bcast(fE(r, rp, rpp, Pp, Ppp), shape).reshape((4, 4) + shape)


def stress(r, rp, rpp, Pp, Ppp):
    """(rho, p_l, p_t) in geometric units (1/m^2): rho = T_tt, p_l = T_ll = -tau, p_t = T_thth."""
    E = einstein_static(r, rp, rpp, Pp, Ppp) / (8 * np.pi)
    return E[0, 0], E[1, 1], E[2, 2]


def boost_matrix(beta):
    """Lambda[a, a'] with e_{a'} = Lambda[a, a'] e_a for a radial boost of speed beta (scalar)."""
    gam = 1.0 / np.sqrt(1.0 - beta**2)
    L = np.eye(4)
    L[0, 0] = L[1, 1] = gam
    L[1, 0] = L[0, 1] = gam * beta
    return L


def boosted(tensor4, beta):
    """Components of a rank-4 orthonormal tensor (4,4,4,4) in a radially boosted frame."""
    L = boost_matrix(beta)
    return np.einsum("ai,bj,ck,dl,abcd->ijkl", L, L, L, L, tensor4, optimize=True)


def boosted2(tensor2, beta):
    L = boost_matrix(beta)
    return np.einsum("ai,bj,ab->ij", L, L, tensor2)


def max_component(tensor4):
    """Largest |component| of an orthonormal rank-4 tensor (FR's 'smallest radius of curvature'
    is 1/sqrt of this)."""
    return float(np.max(np.abs(tensor4)))


def summary_formulas():
    """Human-readable independent components (used in the report and the tests)."""
    d = derive()
    R = d["Rhat"]
    E = d["Ein"]
    return {
        "R_tltl": sp.simplify(R[0][1][0][1]),
        "R_tthth": sp.simplify(R[0][2][0][2]),
        "R_lthlth": sp.simplify(R[1][2][1][2]),
        "R_thphthph": sp.simplify(R[2][3][2][3]),
        "R_tthlth": sp.simplify(R[0][2][1][2]),
        "rho": sp.simplify(E[0, 0] / (8 * sp.pi)),
        "p_l": sp.simplify(E[1, 1] / (8 * sp.pi)),
        "p_t": sp.simplify(E[2, 2] / (8 * sp.pi)),
        "rho_plus_pl": sp.simplify((E[0, 0] + E[1, 1]) / (8 * sp.pi)),
        "tolman": sp.simplify((E[0, 0] + E[1, 1] + 2 * E[2, 2]) / (8 * sp.pi)),
    }
