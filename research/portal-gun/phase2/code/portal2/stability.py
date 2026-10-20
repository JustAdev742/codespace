"""Linear stability of the Ellis-Bronnikov wormhole, and related stability calculations.

1. Ellis-Bronnikov wormhole (massless; phantom scalar).  Derived in
   scratch/derive_ellis_pert.py (sympy, reproduced by tests/test_stability.py) from
   G_ab = 8 pi T_ab with T_ab = -(d_a phi d_b phi - g_ab (d phi)^2 / 2), metric
   ds^2 = -e^{2a} dt^2 + e^{2c} dx^2 + R^2 dOmega^2 about a = c = 0, R0 = sqrt(x^2 + b^2),
   phi0 = arctan(x/b) / (2 sqrt(pi)), in the gauge delta-phi = 0 (regular everywhere because
   phi0' never vanishes).  The constraints give delta-c = dR'/R0', delta-a = delta-c - 2 dR/R0,
   and the dynamics reduce to one equation for the areal-radius perturbation dR(t, x):

       dR_tt = dR_xx - (2/x) dR_x + V1(x) dR,     V1 = (2 x^2 + b^2) / (x^2 + b^2)^2.

   Checks: dR = R0 (a change of b, with the x-shift that keeps phi fixed) solves it exactly;
   near x = 0 the indicial exponents are 0 (even, regular) and 3.  A mode dR = e^{s t} u(x) with
   s > 0 and u decaying is an instability; for large x the decaying solution is x e^{-s x}.
   Units: x in units of b, s in units of c/b.

2. Thin-shell wormholes (Poisson & Visser 1995 set-up, rederived): equation of motion
   adot^2 + V(a) = 0 for the shell radius; linear stability iff V''(a0) > 0.

3. Delayed feedback: stabilisability limits for a mode growing at rate s under a controller
   with delay tau (proportional and PD control).

4. Floquet (parametric) stabilisation of the Ellis mode.
"""
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq


def V1(x, b=1.0):
    return (2 * x**2 + b**2) / (x**2 + b**2) ** 2


# ------------------------------------------------------------------ method 1: shooting

def _rhs(x, y, s2):
    u, up = y
    return [up, (2.0 / x) * up - (V1(x) - s2) * u]


def shooting_mismatch(s, x_m=1.0, X=40.0, rtol=1e-11):
    """Wronskian mismatch at x_m between the regular even solution from x = 0 and the
    decaying solution from x = X.  Zero at an eigenvalue."""
    s2 = s * s
    x0 = 1e-4
    alpha = (V1(0.0) - s2) / 2.0                     # u = 1 + alpha x^2 + ...
    y0 = [1 + alpha * x0**2, 2 * alpha * x0]
    out = solve_ivp(_rhs, (x0, x_m), y0, args=(s2,), rtol=rtol, atol=1e-14, method="DOP853")
    # decaying solution, written as u = x e^{-s x} w with w -> 1; integrate u scaled by e^{s x}
    yX = [X, 1 - s * X]                                # x e^{-sx} without the exponential factor
    def rhs_scaled(x, y):
        # u = e^{-s x} v  =>  v'' - 2 s v' + s^2 v = u'' e^{s x}
        v, vp = y
        upp_over = (2.0 / x) * (vp - s * v) - (V1(x) - s2) * v   # u''e^{sx} from the ODE
        return [vp, upp_over + 2 * s * vp - s2 * v]
    inn = solve_ivp(rhs_scaled, (X, x_m), yX, rtol=rtol, atol=1e-14, method="DOP853")
    u1, u1p = out.y[0, -1], out.y[1, -1]
    v2, v2p = inn.y[0, -1], inn.y[1, -1]
    u2, u2p = v2, v2p - s * v2                          # common factor e^{-s x_m} dropped
    return (u1 * u2p - u1p * u2) / np.hypot(u1, u1p) / np.hypot(u2, u2p)


def growth_rate_shooting(bracket=(0.05, 3.0), **kw):
    ss = np.linspace(*bracket, 120)
    F = np.array([shooting_mismatch(s, **kw) for s in ss])
    roots = []
    for i in range(len(ss) - 1):
        if np.sign(F[i]) != np.sign(F[i + 1]):
            roots.append(brentq(lambda s: shooting_mismatch(s, **kw), ss[i], ss[i + 1], xtol=1e-13))
    return roots


# ------------------------------------------------------------------ method 2: matrix eigenvalues

def operator_fd(N=4000, X=60.0):
    """Second-order finite differences on x_j = (j + 1/2) h, j = 0..N-1 (even parity via the
    ghost point u(-h/2) = u(h/2)), Dirichlet at x = X.  Returns (x, dense matrix of L)."""
    h = X / N
    x = (np.arange(N) + 0.5) * h
    L = np.zeros((N, N))
    i = np.arange(N)
    L[i, i] = -2 / h**2 + V1(x)
    L[i[:-1], i[:-1] + 1] += 1 / h**2 - (2 / x[:-1]) / (2 * h)
    L[i[1:], i[1:] - 1] += 1 / h**2 + (2 / x[1:]) / (2 * h)
    L[0, 0] += 1 / h**2 + (2 / x[0]) / (2 * h)          # ghost point (even symmetry)
    return x, L


def growth_rate_matrix(N=4000, X=60.0):
    x, L = operator_fd(N, X)
    ev, vec = np.linalg.eig(L)
    k = int(np.argmax(ev.real))
    return float(np.sqrt(ev[k].real)) if ev[k].real > 0 else 0.0, x, vec[:, k].real


def growth_rate_chebyshev(N=200, X=30.0):
    """Collocation in z = x^2 with a linear map z = Z (1 + xi)/2: the basis is polynomials in z,
    i.e. even polynomials in x, so only the regular even branch is representable.
    L u = 4 z u_zz - 2 u_z + V1 u; at z = 0 the row reduces to -2 u_z + V1 u (no extra
    condition); u(Z) = 0.  Generalised eigenproblem A a = s^2 B a."""
    from numpy.polynomial import chebyshev as C
    from scipy.linalg import eig
    Z = X**2
    xi = np.cos(np.pi * np.arange(N + 1) / N)[::-1]
    T = np.zeros((N + 1, N + 1)); T1 = np.zeros_like(T); T2 = np.zeros_like(T)
    for k in range(N + 1):
        ck = np.zeros(k + 1); ck[k] = 1
        T[:, k] = C.chebval(xi, ck)
        T1[:, k] = C.chebval(xi, C.chebder(ck))
        T2[:, k] = C.chebval(xi, C.chebder(ck, 2))
    z = Z * (1 + xi) / 2
    uz = (2 / Z) * T1
    uzz = (4 / Z**2) * T2
    A = 4 * z[:, None] * uzz - 2 * uz + V1(np.sqrt(z))[:, None] * T
    Bm = T.copy()
    A[-1] = T[-1]; Bm[-1] = 0
    ev = eig(A, Bm, right=False)
    ev = ev[np.isfinite(ev)]
    real = ev[np.abs(ev.imag) < 1e-6 * np.maximum(1, np.abs(ev.real))].real
    return float(np.sqrt(real.max())) if real.size and real.max() > 0 else 0.0


# ------------------------------------------------------------------ method 3: time evolution

def evolve(x_grid_N=3000, X=80.0, T=30.0, cfl=0.25, sponge=15.0, src_width=0.5, record_x=0.0):
    """Evolve dR_tt = L dR (finite differences, leapfrog) from a Gaussian bump, with a damping
    layer near x = X.  Returns (times, dR at record_x)."""
    x, L = operator_fd(x_grid_N, X)
    h = x[1] - x[0]
    dt = cfl * h
    sig = np.where(x > X - sponge, 3.0 * ((x - (X - sponge)) / sponge) ** 2, 0.0)
    u_prev = np.exp(-(x / src_width) ** 2)
    u = u_prev.copy()
    from scipy.sparse import csr_matrix
    Ls = csr_matrix(L)
    j = int(np.argmin(np.abs(x - record_x)))
    ts, rec = [], []
    nsteps = int(T / dt)
    for k in range(nsteps):
        acc = Ls @ u
        u_next = (2 * u - (1 - sig * dt / 2) * u_prev + dt**2 * acc) / (1 + sig * dt / 2)
        u_prev, u = u, u_next
        if k % 20 == 0:
            ts.append((k + 1) * dt)
            rec.append(u[j])
    return np.array(ts), np.array(rec)


def fit_growth(ts, rec, t_min):
    sel = ts >= t_min
    p = np.polyfit(ts[sel], np.log(np.abs(rec[sel])), 1)
    return float(p[0])


# ------------------------------------------------------------------ thin-shell wormholes

def thin_shell_Vpp(a0, M, beta2):
    """V''(a0) for a Schwarzschild thin-shell wormhole (two exteriors of mass M glued at a0,
    G = c = 1) with linearised equation of state p - p0 = beta2 (sigma - sigma0).
    Junction conditions (Visser 1989; Poisson & Visser 1995): sigma = -(1/2 pi a) sqrt(1 - 2M/a
    + adot^2) gives adot^2 + V(a) = 0 with V = 1 - 2M/a - (2 pi a sigma(a))^2, and the
    conservation law sigma' = -2 (sigma + p)/a.  Stable iff V''(a0) > 0."""
    s0 = np.sqrt(1 - 2 * M / a0)
    sig = -s0 / (2 * np.pi * a0)
    p = (1 - M / a0) / (4 * np.pi * a0 * s0)
    sp1 = -2 * (sig + p) / a0
    sp2 = 2 * (sig + p) / a0**2 - 2 * (1 + beta2) * sp1 / a0
    return (-4 * M / a0**3 - 8 * np.pi**2 * sig**2 - 32 * np.pi**2 * a0 * sig * sp1
            - 8 * np.pi**2 * a0**2 * (sp1**2 + sig * sp2))


def thin_shell_beta2_critical(a0, M):
    """beta^2 at which V''(a0) changes sign (V'' is linear in beta^2)."""
    v0 = thin_shell_Vpp(a0, M, 0.0)
    v1 = thin_shell_Vpp(a0, M, 1.0)
    return -v0 / (v1 - v0), np.sign(v1 - v0)     # stable for sign*(beta2 - crit) > 0


# ------------------------------------------------------------------ delayed feedback

def dde_rightmost_root(s, K, Dg, tau, n=40):
    """Rightmost characteristic root of  q'' = s^2 q - K q(t - tau) - Dg q'(t - tau)
    (an unstable mode under delayed PD feedback), by the pseudospectral discretisation of the
    infinitesimal generator (Breda, Maset & Vermiglio 2005).  State (q, q') on [-tau, 0]."""
    from numpy.polynomial import chebyshev as C
    # Chebyshev points on [-tau, 0]
    j = np.arange(n + 1)
    th = -tau * (1 - np.cos(np.pi * j / n)) / 2          # th[0] = 0, th[n] = -tau
    # differentiation matrix for nodes th (barycentric)
    x = th
    cw = np.ones(n + 1); cw[0] = cw[-1] = 2; cw *= (-1) ** j
    X = x[:, None] - x[None, :]
    Dm = (cw[:, None] / cw[None, :]) / (X + np.eye(n + 1))
    Dm -= np.diag(Dm.sum(axis=1))
    m = 2 * (n + 1)
    A = np.zeros((m, m))
    # rows for theta < 0: d/dt phi(theta) = d/dtheta phi(theta)
    for comp in range(2):
        off = comp * (n + 1)
        A[off + 1: off + n + 1, off: off + n + 1] = Dm[1:]
    # rows at theta = 0: the ODE
    iq0, iv0 = 0, n + 1
    iqt, ivt = n, 2 * n + 1
    A[iq0, iv0] = 1.0                                   # q' = v
    A[iv0, iq0] = s**2                                  # v' = s^2 q - K q(-tau) - D v(-tau)
    A[iv0, iqt] = -K
    A[iv0, ivt] = -Dg
    ev = np.linalg.eigvals(A)
    return float(ev.real.max())


def best_delay_margin(s, tau, Ks=None, Ds=None):
    """Min over a (K, D) grid of the rightmost root: < 0 means some PD gain stabilises."""
    Ks = Ks if Ks is not None else s**2 * np.geomspace(1.0001, 50, 60)
    Ds = Ds if Ds is not None else s * np.geomspace(1e-3, 20, 60)
    best = (np.inf, None, None)
    for K in Ks:
        for Dg in Ds:
            r = dde_rightmost_root(s, K, Dg, tau)
            if r < best[0]:
                best = (r, K, Dg)
    return best


# ------------------------------------------------------------------ parametric (Kapitza) driving

def mathieu_max_multiplier(s, a, Om, n_steps=4000):
    """Largest |Floquet multiplier| of q'' = (s^2 + a cos(Om t)) q over one period."""
    T = 2 * np.pi / Om

    def f(t, y):
        return [y[1], (s**2 + a * np.cos(Om * t)) * y[0]]

    M = np.zeros((2, 2))
    for k, y0 in enumerate(([1.0, 0.0], [0.0, 1.0])):
        sol = solve_ivp(f, (0, T), y0, rtol=1e-10, atol=1e-12, method="DOP853")
        M[:, k] = sol.y[:, -1]
    return float(np.max(np.abs(np.linalg.eigvals(M))))


def kapitza_threshold(s, Om):
    """Smallest modulation amplitude a (same units as s^2) that makes all multipliers <= 1
    (searching upward from a = s^2 / 10).  Averaging theory predicts a ~ sqrt(2) s Om."""
    a_grid = np.geomspace(0.1 * s**2, 200 * s * Om, 500)
    for a in a_grid:
        if mathieu_max_multiplier(s, a, Om) <= 1 + 1e-6:
            return float(a)
    return float("nan")


def evolve_parametric(a, Om, U_width=1.0, N=3000, X=80.0, T=40.0, cfl=0.25, sponge=15.0, profile="gauss"):
    """Ellis master equation with a parametric drive:
    dR_tt = L dR + a cos(Om t) U(x) dR, U = exp(-x^2/U_width^2) ('gauss') or U = V1(x)/V1(0)
    ('V1': the whole exotic stress modulated in proportion).  Returns (t, max |dR| for |x| < 5)."""
    x, L = operator_fd(N, X)
    h = x[1] - x[0]
    dt = min(cfl * h, 2 * np.pi / Om / 40)
    sig = np.where(x > X - sponge, 3.0 * ((x - (X - sponge)) / sponge) ** 2, 0.0)
    U = np.exp(-(x / U_width) ** 2) if profile == "gauss" else V1(x) / V1(0.0)
    from scipy.sparse import csr_matrix
    Ls = csr_matrix(L)
    u_prev = np.exp(-(x / 0.5) ** 2)
    u = u_prev.copy()
    ts, rec = [], []
    nsteps = int(T / dt)
    for k in range(nsteps):
        t = k * dt
        acc = Ls @ u + a * np.cos(Om * t) * U * u
        u_next = (2 * u - (1 - sig * dt / 2) * u_prev + dt**2 * acc) / (1 + sig * dt / 2)
        u_prev, u = u, u_next
        if k % 10 == 0:
            ts.append((k + 1) * dt)
            rec.append(np.max(np.abs(u[: int(5.0 / h)])))
    return np.array(ts), np.array(rec)
