import math
import random

import pytest
import sympy as sp

from portalphys import constants as C
from portalphys import symbolic_gr as S
from portalphys import tidal as T


def test_handcoded_tidal_matches_sympy_boosted_riemann():
    _, curv, _, boosted = S.morris_thorne()
    rr, bb, bp, P1, P2, be = sp.symbols("rr bb bp P1 P2 be")
    repl = {sp.Derivative(S.Phi, S.r, 2): P2, sp.Derivative(S.Phi, S.r): P1, sp.Derivative(S.b, S.r): bp}

    def lam(e):
        e = e.subs(repl).subs({S.b: bb, S.beta: be}).subs(S.r, rr)
        return sp.lambdify((rr, bb, bp, P1, P2, be), e)
    frad = lam(boosted["R_0p1p0p1p"])
    flat = lam(boosted["R_0p2p0p2p"])
    rnd = random.Random(7)
    for _ in range(25):
        r = rnd.uniform(1, 5); b = rnd.uniform(0.1, 0.99) * r
        bpv, p1, p2, beta = rnd.uniform(-2, 0.9), rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0, 0.9)
        xi = 2.0
        ar, al = T.mt_tidal(r, b, bpv, p1, p2, beta * C.c, xi)
        assert ar == pytest.approx(-C.c**2 * frad(r, b, bpv, p1, p2, beta) * xi, rel=1e-9, abs=0)
        assert al == pytest.approx(-C.c**2 * flat(r, b, bpv, p1, p2, beta) * xi, rel=1e-9, abs=0)


def test_schwarzschild_limit_of_tidal_formula():
    M = C.M_earth
    rs = 2 * C.G * M / C.c**2
    r = C.R_earth
    Phip = (rs / 2) / (r**2 * (1 - rs / r))
    Phipp = -(rs) * (r - rs / 2) / (r**4 * (1 - rs / r)**2)
    ar, al = T.mt_tidal(r, rs, 0.0, Phip, Phipp, 0.0, 1.0)
    assert ar == pytest.approx(2 * C.G * M / r**3, rel=1e-6, abs=0)    # radial stretch
    assert al == pytest.approx(-C.G * M / r**3, rel=1e-6, abs=0)       # lateral squeeze


def test_ellis_speed_limit_is_self_consistent():
    for r0 in (0.3, 1.0, 50.0):
        v = T.ellis_max_speed(r0, 2.0, C.g0)
        assert T.ellis_tidal(v, r0, 2.0)[1] == pytest.approx(C.g0, rel=1e-9, abs=0)
        assert v == pytest.approx(r0 * math.sqrt(C.g0 / 2.0), rel=1e-6, abs=0)   # non-relativistic


def test_ellis_has_no_radial_tidal_force():
    assert T.ellis_tidal(3.0, 1.0, 2.0)[0] == 0.0


def test_morris_thorne_tolerance_number():
    # MT88: |R| <= g_earth / (c^2 * 2 m) ~ 1/(1e10 cm)^2
    assert T.mt_tidal_limit_curvature() ** -0.5 == pytest.approx(1.35e8, rel=0.01, abs=0)


def test_reproduces_morris_thorne_appendix_speed_limit():
    # MT88 A.1: b = sqrt(b0 r) (b'_0 = 1/2), rounded bound 1/(1e8 m)^2 -> v <~ 60 m/s for b0 = 10 m
    v = T.throat_max_speed(10.0, 0.5, 1.0 / (1e8) ** 2)
    assert v == pytest.approx(60.0, rel=0.01, abs=0)
    # with the unrounded bound g/(c^2 2 m) the same wormhole allows ~44 m/s
    assert T.throat_max_speed(10.0, 0.5, T.mt_tidal_limit_curvature()) == pytest.approx(44.3, rel=0.01, abs=0)
    # Ellis (b'_0 = -1) is 2x stricter in speed than b'_0 = 1/2
    assert T.throat_max_speed(10.0, -1.0, 1e-16) == pytest.approx(T.throat_max_speed(10.0, 0.5, 1e-16) / 2, rel=1e-6, abs=0)
    assert T.throat_lateral_tidal(1.0, 1.0, 2.0, -1.0) == pytest.approx(T.ellis_tidal(1.0, 1.0, 2.0)[1], rel=1e-12, abs=0)
