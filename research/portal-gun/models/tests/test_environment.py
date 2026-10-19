import math

import pytest

from portalphys import constants as C
from portalphys import environment as EN


def test_choked_and_subsonic_branches_meet():
    pc = EN.critical_pressure_ratio() * C.P_sea_level
    a = EN.orifice_mass_flow(C.P_sea_level, C.T_air_sl, pc * (1 - 1e-9), 1.0)
    b = EN.orifice_mass_flow(C.P_sea_level, C.T_air_sl, pc * (1 + 1e-9), 1.0)
    assert a == pytest.approx(b, rel=1e-6, abs=0)


def test_flow_monotonic_in_back_pressure():
    flows = [EN.orifice_mass_flow(C.P_sea_level, C.T_air_sl, f * C.P_sea_level, 1.0) for f in (0.0, 0.3, 0.6, 0.9, 0.99)]
    assert all(x >= y for x, y in zip(flows, flows[1:]))
    assert EN.orifice_mass_flow(C.P_sea_level, C.T_air_sl, C.P_sea_level, 1.0) == 0.0


def test_blowdown_matches_analytic_choked_solution():
    g = C.gamma_air
    V, A, Cd = 50.0, 0.01, 0.8
    t, p = EN.blowdown(V, A, Cd=Cd, t_end=120.0)
    c0 = math.sqrt(g * C.R_air * C.T_air_sl)
    Gam = (2 / (g + 1))**((g + 1) / (2 * (g - 1)))
    k = (g - 1) * Cd * A * Gam * c0 / (2 * V)
    for ti, pi in list(zip(t, p))[::200]:
        exact = C.P_sea_level * (1 + k * ti)**(-2 * g / (g - 1))
        assert pi == pytest.approx(exact, rel=1e-5, abs=0)


def test_time_to_pressure_matches_analytic_inversion():
    # choked throughout (vacuum outside), so p/p0 = (1 + k t)^(-2g/(g-1)) can be inverted exactly
    g = C.gamma_air
    c0 = math.sqrt(g * C.R_air * C.T_air_sl)
    Gam = (2 / (g + 1))**((g + 1) / (2 * (g - 1)))
    for r in (1.0, 0.1, 0.01):
        A = math.pi * r * r
        k = (g - 1) * 0.8 * A * Gam * c0 / (2 * 50.0)
        exact = (0.5**(-(g - 1) / (2 * g)) - 1) / k
        assert EN.time_to_pressure(50.0, A, 0.5 * C.P_sea_level, Cd=0.8) == pytest.approx(exact, rel=1e-6, abs=0)


def test_sonic_exit_speed():
    v = EN.exit_velocity(C.P_sea_level, C.T_air_sl, 0.0)
    assert v == pytest.approx(math.sqrt(2 * C.gamma_air * C.R_air * C.T_air_sl / (C.gamma_air + 1)), rel=1e-9, abs=0)


def test_torricelli():
    v, *_ = EN.water_jet(10.0, 1.0)
    assert v == pytest.approx(math.sqrt(2 * C.g0 * 10.0), rel=1e-12, abs=0)
