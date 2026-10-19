"""Time-dependent checks: thin-shell stability and collapse of a portal rim.

1. Thin-shell wormhole (Visser 1989; Poisson & Visser 1995), G = c = 1. The shell radius
   obeys adot^2 + V(a) = 0 with V(a) = 1 - 2M/a - (2 pi a sigma)^2, the surface density
   follows d sigma/d a = -(2/a)(sigma + P), and the equation of state is linearised,
   P = P0 + beta2 (sigma - sigma0). The symbolic second derivative V''(a0) is in
   symbolic_gr.thin_shell_stability(); here the full non-linear motion is integrated so
   the sign of V'' can be checked against what the shell actually does.

2. A circular Nambu-Goto loop (the rim of a flat-face portal modelled as a string):
   r'' = -(1 - r'^2)/r (c = 1), independent of the mass per length mu, so negative-tension
   loops collapse exactly like ordinary ones: r(t) = R cos(t/R), collapse at pi R/2.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.integrate import solve_ivp


def static_shell(a0, M=0.0):
    s0 = -math.sqrt(1 - 2 * M / a0) / (2 * math.pi * a0)
    P0 = (1 - M / a0) / (4 * math.pi * a0 * math.sqrt(1 - 2 * M / a0))
    return s0, P0


def v2_critical(a0, M):
    """beta^2 at which V''(a0) changes sign (from the symbolic result)."""
    return (-3 * M**2 + 3 * M * a0 - a0**2) / (2 * (6 * M**2 - 5 * M * a0 + a0**2))


def Vpp(a0, M, beta2):
    """V''(a0) from symbolic_gr (copied closed form, tested against sympy)."""
    num = -12 * M**2 * beta2 - 3 * M**2 + 10 * M * a0 * beta2 + 3 * M * a0 - 2 * a0**2 * beta2 - a0**2
    return 2 * num / (a0**3 * (a0 - 2 * M))


def evolve_shell(a0, M, beta2, dsigma_frac=-1e-6, tau_end=200.0):
    """Integrate a perturbed shell. Returns (tau, a, sigma).

    The perturbation makes sigma slightly more negative than static, which gives the
    shell a small outward/inward velocity satisfying the constraint adot^2 = -V(a0).
    """
    s0, P0 = static_shell(a0, M)
    sig_init = s0 * (1 - dsigma_frac)          # dsigma_frac < 0 => |sigma| larger

    def P(sig):
        return P0 + beta2 * (sig - s0)

    def V(a, sig):
        return 1 - 2 * M / a - (2 * math.pi * a * sig)**2

    def dV(a, sig):
        return 2 * M / a**2 + 8 * math.pi**2 * a * sig * (sig + 2 * P(sig))

    V0 = V(a0, sig_init)
    adot0 = math.sqrt(max(-V0, 0.0))

    def rhs(tau, y):
        a, ad, sig = y
        return [ad, -0.5 * dV(a, sig), -(2 / a) * (sig + P(sig)) * ad]

    def hit(tau, y):  # stop on collapse to the horizon or runaway expansion
        return min(y[0] - (2 * M + 1e-6), 10 * a0 - y[0])
    hit.terminal = True
    sol = solve_ivp(rhs, (0, tau_end), [a0, adot0, sig_init], events=hit, rtol=1e-10, atol=1e-12, max_step=0.05)
    return sol.t, sol.y[0], sol.y[2]


def classify_shell(a0, M, beta2, **kw):
    """'oscillates' if the radius stays within 5 % of a0 for the whole run, else 'runaway'.

    With the default perturbation (|d sigma / sigma| = 1e-6) a stable shell oscillates with
    relative amplitude ~1e-3; an unstable one grows exponentially until a stop event.
    """
    tau_end = kw.get("tau_end", 200.0)
    t, a, _ = evolve_shell(a0, M, beta2, **kw)
    dev = np.max(np.abs(a - a0)) / a0
    finished = t[-1] >= tau_end * 0.999
    return ("oscillates" if dev < 0.05 and finished else "runaway"), dev


def loop_collapse(R=1.0, t_end=None):
    """Integrate r'' = -(1 - r'^2)/r from rest (c = 1). Returns (t, r, collapse_time)."""
    t_end = t_end or 2 * R

    def rhs(t, y):
        r, v = y
        return [v, -(1 - v * v) / r]

    def zero(t, y):
        return y[0] - 1e-6 * R
    zero.terminal = True
    sol = solve_ivp(rhs, (0, t_end), [R, 0.0], events=zero, rtol=1e-11, atol=1e-13, max_step=R / 500)
    tc = sol.t_events[0][0] if sol.t_events[0].size else math.nan
    return sol.t, sol.y[0], tc
