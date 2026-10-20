"""Tests for energy bookkeeping, stability and the chronology checker."""
import numpy as np
import pytest

from portal2 import chronology as ch
from portal2 import energy as en
from portal2 import families as fam
from portal2 import stability as st
from portal2.constants import c, g0, day, year

S_ELLIS = 1.1819727      # c/b, from shooting (tests below check the other methods against it)


# ------------------------------------------------------------------ energy

def test_ellis_closed_forms():
    g = fam.ellis(1.0)
    d, i = en.anec_radial(g)
    assert d == pytest.approx(en.ellis_anec(1.0), rel=1e-4, abs=0)
    span = g.l_max
    # the identity integrand has a 1/l^2 tail beyond the grid: add it back (both sides)
    assert i - 2 / (4 * np.pi * span) == pytest.approx(d, rel=1e-3, abs=0)
    E = en.integrated_energy(g)
    tail = -2 * 0.5 / span                     # -(b^2/2) Int dx/R^2 beyond the grid, both sides
    assert E + tail == pytest.approx(en.ellis_static_energy(1.0), rel=1e-3, abs=0)


@pytest.mark.parametrize("geom", [fam.Compact(1.0, 1.0), fam.Compact(1.0, 0.05),
                                  fam.Compact(1.0, 1.0, -0.5, 1.0), fam.two_scale(1.0, 0.01, 400.0)])
def test_tolman_mass_vanishes_for_massless_mouths(geom):
    assert abs(en.tolman_mass(geom)) < 1e-10


def test_thin_region_tends_to_thin_shell_energy():
    E = en.integrated_energy(fam.Compact(1.0, 0.01))
    assert E == pytest.approx(en.thin_shell_energy(1.0)[0], rel=2e-3, abs=0)
    assert en.thin_shell_energy(1.0)[1] == pytest.approx(0.0, abs=1e-12)


def test_flat_face_rim_mass():
    mu, E, MT = en.flat_face_rim(1.0)
    assert mu == pytest.approx(-0.25, rel=1e-12, abs=0)            # -c^2/(4G) per unit length
    assert E == pytest.approx(-np.pi / 2, rel=1e-12, abs=0)
    assert MT == 0.0


def test_anec_negative_for_every_family():
    for g in (fam.ellis(1.0), fam.gen_ellis(1.0, 4), fam.Compact(1.0, 0.3), fam.two_scale(1.0, 0.2, 20.0)):
        d, i = en.anec_radial(g)
        assert d < 0 and i < 0


# ------------------------------------------------------------------ stability

def test_derived_master_equation_has_size_change_as_static_solution():
    x = np.linspace(0.1, 20, 200)
    R0 = np.sqrt(x**2 + 1)
    u, up, upp = R0, x / R0, 1 / R0**3
    assert np.max(np.abs(upp - 2 / x * up + st.V1(x) * u)) < 1e-12


def test_unstable_mode_by_independent_methods():
    s_shoot = st.growth_rate_shooting()
    assert len(s_shoot) == 1
    assert s_shoot[0] == pytest.approx(S_ELLIS, rel=1e-6, abs=0)
    assert st.growth_rate_chebyshev(N=220, X=30.0) == pytest.approx(S_ELLIS, rel=2e-6, abs=0)
    s1 = st.growth_rate_matrix(N=1000, X=60.0)[0]
    s2 = st.growth_rate_matrix(N=2000, X=60.0)[0]
    richardson = s2 + (s2 - s1) / 3                     # second-order convergence
    assert richardson == pytest.approx(S_ELLIS, rel=2e-5, abs=0)


def test_time_domain_growth_matches_eigenvalue():
    ts, rec = st.evolve(x_grid_N=2000, X=60.0, T=30.0)
    assert st.fit_growth(ts, rec, 15.0) == pytest.approx(S_ELLIS, rel=2e-3, abs=0)


def test_thin_shell_massless_condition():
    for a0 in (0.5, 1.0, 7.0):
        crit, sgn = st.thin_shell_beta2_critical(a0, 0.0)
        assert crit == pytest.approx(-0.5, rel=1e-9, abs=0) and sgn < 0


def test_delayed_pd_boundary_is_sqrt2():
    from scipy.optimize import minimize
    def best(tau):
        f = lambda p: st.dde_rightmost_root(1.0, np.exp(p[0]), np.exp(p[1]), tau, n=30)
        return min(minimize(f, x0, method="Nelder-Mead", options={"xatol": 1e-7, "fatol": 1e-10,
                                                                   "maxiter": 4000}).fun
                   for x0 in [(0.3, 0.4), (0.05, 0.35)])
    assert best(1.38) < 0
    assert best(1.44) > 0


def test_kapitza_single_mode_threshold():
    s = S_ELLIS
    a = st.kapitza_threshold(s, 20 * s)
    assert a == pytest.approx(np.sqrt(2) * s * 20 * s, rel=0.03, abs=0)


# ------------------------------------------------------------------ chronology

U_EARTH = lambda x: g0 * x[2]


def test_vertical_pair_time_machine_after_c_over_g():
    for h in (2.5, 50.0):
        net = ch.Network([ch.Mouth("lo", lambda t: np.zeros(3), U_EARTH),
                          ch.Mouth("hi", lambda t, h=h: np.array([0, 0, h]), U_EARTH)], [ch.Link(0, 1)])
        T, _, _ = ch.first_ctc_time(net, 400 * day, n=8001)
        assert T == pytest.approx(c / g0, rel=2e-4, abs=0)


def test_horizontal_pair():
    net = ch.Network([ch.Mouth("gun", lambda t: np.array([0, 0, 1.2]), U_EARTH),
                      ch.Mouth("wall", lambda t: np.array([10, 0, 1.5]), U_EARTH)], [ch.Link(0, 1)])
    T, _, _ = ch.first_ctc_time(net, 100 * year, n=8001)
    assert T == pytest.approx(np.hypot(10, 0.3) / c / (g0 * 0.3 / c**2), rel=1e-3, abs=0)


def test_moving_mouth_twin_shift():
    v = 0.6 * c
    T1 = 1000.0
    def pos(t):
        return np.array([v * t if t < T1 else v * (2 * T1 - t) if t < 2 * T1 else 0.0, 0, 0])
    def vel(t):
        return np.array([v if t < T1 else -v if t < 2 * T1 else 0.0, 0, 0])
    net = ch.Network([ch.Mouth("home", lambda t: np.zeros(3), lambda x: 0.0, lambda t: np.zeros(3)),
                      ch.Mouth("trav", pos, lambda x: 0.0, vel)], [ch.Link(0, 1)])
    t = np.linspace(0, 2 * T1, 200001)
    shift = net.shifts(t)[0, -1]
    # first-order rate deficit v^2/2c^2 (the model is first order in v^2/c^2)
    # (rel 1e-5: trapezoid error at the velocity jump t = 2 T1)
    assert shift == pytest.approx(2 * T1 * (v / c) ** 2 / 2, rel=1e-5, abs=0)


def test_roman_ring_is_a_time_machine_although_no_pair_is():
    D, s, delta = 1000.0, 1.0, 10.0 / c
    corners = [np.array(p, float) for p in ((0, 0, 0), (D, 0, 0), (D, D, 0), (0, D, 0))]
    mouths, links = [], []
    for k in range(4):
        a, nxt = corners[k], corners[(k + 1) % 4]
        b = nxt - (nxt - a) / np.linalg.norm(nxt - a) * s
        mouths += [ch.Mouth(f"a{k}", lambda t, a=a: a, lambda x: 0.0),
                   ch.Mouth(f"b{k}", lambda t, b=b: b, lambda x: 0.0)]
        links.append(ch.Link(2 * k, 2 * k + 1, C=delta))
    net = ch.Network(mouths, links)
    assert ch.margin(net.graph(0.0, net.shifts(np.array([0.0]))[:, 0])) == -np.inf
    for k in range(4):
        pair = ch.Network([mouths[2 * k], mouths[2 * k + 1]], [ch.Link(0, 1, C=delta)])
        assert ch.margin(pair.graph(0.0, np.array([delta]))) > 0


def test_floyd_warshall_matches_bellman_ford():
    rng = np.random.default_rng(3)
    for _ in range(200):
        n = 6
        W = rng.uniform(0.2, 2, (n, n))
        np.fill_diagonal(W, np.inf)
        for _ in range(3):
            a, b = rng.choice(n, 2, replace=False)
            d = rng.normal(0, 1.5)
            W[a, b], W[b, a] = d, -d + 0.01
        assert ch.floyd_warshall(W)[1] == ch.bellman_ford_has_negative_cycle(W)


def test_launched_mouth_never_closes_a_loop_by_itself():
    b = np.linspace(1e-6, 1 - 1e-9, 1000)
    m = ch.launched_mouth_margin(b)
    assert np.all(m > 0) and m[0] == pytest.approx(1.0, abs=1e-5)


def test_master_equation_derivation_from_einstein_equations():
    import sys, sympy as sp
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent / "derivations"))
    from ellis_perturbations import reduce
    r = reduce()
    assert all(sp.simplify(v) == 0 for v in r["background"])
    assert r["tx"] == 0 and r["scalar"] == 0 and r["tt"] == 0
    x, b = sp.symbols("x"), sp.Symbol("b", positive=True)
    assert not r["xx_over_master"].has(sp.Function("dR"))      # proportional, factor independent of dR
