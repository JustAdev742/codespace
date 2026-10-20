"""Tests for the curvature derivation and the quantum-inequality audit."""
import numpy as np
import pytest

from portal2 import curvature as cv
from portal2 import families as fam
from portal2 import qi, tides
from portal2.constants import l_P, c

F = 0.01
REF = (4 * np.pi / 3) * F**4 / l_P**2       # smooth-throat deficit for r0 = 1 m


def test_derived_components_match_known_forms():
    s = cv.summary_formulas()
    r, rp, rpp, Pp, Ppp = cv.LOCAL
    assert sp_eq(s["R_tltl"], Pp**2 + Ppp)
    assert sp_eq(s["R_tthth"], Pp * rp / r)
    assert sp_eq(s["R_lthlth"], -rpp / r)
    assert sp_eq(s["R_thphthph"], (1 - rp**2) / r**2)
    # Morris-Thorne in Schwarzschild gauge: rho = b'/(8 pi r^2) with r'^2 = 1 - b/r,
    # r'' = (b - b' r)/(2 r^2)
    import sympy as sp
    b, bp, R = sp.symbols("b bp R", positive=True)
    rho = s["rho"].subs({rp: sp.sqrt(1 - b / R), rpp: (b - bp * R) / (2 * R**2), r: R})
    assert sp.simplify(rho - bp / (8 * sp.pi * R**2)) == 0
    # Phi = const: active (Tolman) density vanishes identically
    assert sp.simplify(s["tolman"].subs({Pp: 0, Ppp: 0})) == 0


def sp_eq(a, b):
    import sympy as sp
    return sp.simplify(a - b) == 0


def test_schwarzschild_is_vacuum_and_has_known_tides():
    M = 0.7
    rr = np.array([2.0, 3.5, 10.0])
    rp = np.sqrt(1 - 2 * M / rr)
    Phi_r = M / (rr**2 * (1 - 2 * M / rr))                 # d Phi / dr
    # second derivative in l: Phi'' = d/dl (Phi_r r') = r' d/dr (Phi_r r')
    h = 1e-6
    f = lambda x: M / (x**2 * (1 - 2 * M / x)) * np.sqrt(1 - 2 * M / x)
    Pp = Phi_r * rp
    Ppp = rp * (f(rr + h) - f(rr - h)) / (2 * h)
    rpp = (2 * M) / (2 * rr**2)                            # (b - b' r)/(2 r^2) with b = 2M
    E = cv.einstein_static(rr, rp, rpp, Pp, Ppp)
    assert np.max(np.abs(E)) < 1e-7
    R = cv.riemann_static(rr, rp, rpp, Pp, Ppp)
    # MTW convention: R_trtr = -2M/r^3, so d^2 xi/dtau^2 = -R^r_trt xi = +2M/r^3 xi (stretching)
    assert np.allclose(R[0, 1, 0, 1], -2 * M / rr**3, rtol=1e-6, atol=0)
    assert np.allclose(R[2, 3, 2, 3], 2 * M / rr**3, rtol=1e-12, atol=0)


def test_boosted_components_match_tensor_transformation():
    rng = np.random.default_rng(7)
    for _ in range(5):
        vals = [np.array(v) for v in (rng.uniform(0.5, 2), rng.uniform(-1, 1), rng.normal(),
                                      rng.normal(), rng.normal())]
        beta = rng.uniform(-0.95, 0.95)
        Rb = cv.boosted(cv.riemann_static(*vals), beta)
        an = qi.boosted_curvature_components(*[float(v) for v in vals], beta)
        assert Rb[0, 1, 0, 1] == pytest.approx(an[0], rel=1e-12, abs=0)
        assert Rb[2, 3, 2, 3] == pytest.approx(an[1], rel=1e-12, abs=0)
        assert Rb[0, 2, 0, 2] == pytest.approx(an[2], rel=1e-12, abs=0)
        assert Rb[1, 2, 1, 2] == pytest.approx(an[3], rel=1e-12, abs=0)
        assert Rb[0, 2, 1, 2] == pytest.approx(an[4], rel=1e-12, abs=0)
        assert np.max(np.abs(Rb)) == pytest.approx(max(abs(x) for x in an), rel=1e-12, abs=0)
        T = cv.einstein_static(*vals) / (8 * np.pi)
        assert cv.boosted2(T, beta)[0, 0] == pytest.approx(
            float(qi.boosted_density(*[float(v) for v in vals], beta)), rel=1e-10, abs=0)


def test_ellis_is_phantom_scalar_vacuum():
    g = fam.ellis(1.3)
    l = np.linspace(-5, 5, 11)
    rho, p_l, p_t = cv.stress(*g.local(l))
    R2 = l**2 + 1.3**2
    assert np.allclose(rho, -1.3**2 / (8 * np.pi * R2**2), rtol=1e-12, atol=0)
    assert np.allclose(p_l, rho, rtol=1e-12, atol=0)
    assert np.allclose(p_t, -rho, rtol=1e-12, atol=0)


@pytest.mark.parametrize("eps", [2.0, 0.5, 1e-2, 1e-4, 1e-8])
def test_analytic_throat_deficit_is_independent_of_flare_out(eps):
    D, x = qi.throat_deficit_analytic(eps, 0.0, F, 1.0)
    assert D == pytest.approx(REF, rel=1e-6, abs=0)
    assert x == pytest.approx(2.0, rel=1e-4, abs=0)


@pytest.mark.parametrize("eps,L", [(0.2, 20.0), (0.01, 400.0), (0.001, 4000.0)])
def test_gentle_flare_numerics_reach_the_analytic_bound(eps, L):
    g = fam.two_scale(1.0, eps, L)
    G = np.geomspace(1 + 1e-6, 1e5, 2000)
    t = qi.local_deficit(g, np.zeros_like(G), G, F)
    j = int(np.argmax(t["D"]))
    assert t["D"][j] / REF == pytest.approx(1.0, rel=0.01, abs=0)
    assert t["gamma"][j] == pytest.approx(np.sqrt(2 / eps), rel=0.02, abs=0)


def test_sampled_and_local_versions_agree_on_a_smooth_throat():
    g = fam.two_scale(1.0, 0.01, 400.0)
    s = qi.sampled_deficit(g, 14.2, F)
    loc = qi.local_deficit(g, 0.0, 14.2, F)
    assert s["D"] / loc["D"][0] == pytest.approx(1.0, rel=0.02, abs=0)


def test_thin_exotic_region_scales_as_cube_of_thickness():
    a = np.array([0.02, 0.05, 0.1])
    D = np.array([qi.scan(fam.Compact(1.0, ai), F, l_extent=3.0)[0]["D"] for ai in a])
    slope = np.polyfit(np.log(a), np.log(D), 1)[0]
    assert slope == pytest.approx(3.0, abs=0.15)


def test_slow_crossing_of_thin_region_has_small_tidal_impulse():
    for a in (1.0, 0.1, 0.01):
        t = tides.crossing(fam.Compact(1.0, a), 1.0)
        assert t["dv_th"] < 1.5          # m/s: about v * w_b / r0 * O(1)
        assert t["dv_r"] == 0.0


def test_redshift_hill_needs_relativistic_crossing():
    g = fam.Compact(1.0, 1.0, 2.0, 0.3)
    assert tides.min_v_inf(g) / c == pytest.approx(np.sqrt(1 - np.exp(-4.0)), rel=1e-6, abs=0)
