import math

import pytest

from portalphys import raytrace as RT


@pytest.mark.parametrize("b", [0.05, 0.3, 0.7, 0.95, 0.995])
def test_transmitted_sweep_quadrature_vs_elliptic(b):
    num = RT._seg(-math.inf, math.inf, b, 1.0)
    assert num == pytest.approx(RT.sweep_transmitted_exact(b), rel=1e-8, abs=0)


@pytest.mark.parametrize("b", [1.005, 1.1, 1.5, 3.0, 20.0])
def test_reflected_sweep_quadrature_vs_elliptic(b):
    lt = math.sqrt(b * b - 1)
    num = 2 * RT._from_turning(lt, math.inf, b, 1.0)
    assert num == pytest.approx(RT.sweep_reflected_exact(b), rel=1e-8, abs=0)


def test_weak_field_deflection():
    for b in (30.0, 100.0):
        assert RT.deflection_exact(b) == pytest.approx(math.pi / (4 * b * b), rel=3e-3 * (30 / b) ** 2 + 1e-4, abs=0)


@pytest.mark.parametrize("psi", [0.1, 0.5, 0.9, 1.3, 2.0])
def test_ode_route_agrees_with_quadrature(psi):
    lc = 5.0
    q = RT.sweep_from_camera(psi, lc)
    o = RT.trace_ode(lc, psi)
    assert o[1] == q[1]
    assert o[0] == pytest.approx(q[0], abs=2e-6)


def test_disc_angular_size():
    assert RT.apparent_angular_radius(0.0) == pytest.approx(90.0)
    assert RT.apparent_angular_radius(100.0) == pytest.approx(math.degrees(math.asin(1 / math.sqrt(10001))), rel=1e-12, abs=0)


def test_second_order_weak_field_term():
    # Nakajima & Asada (2012): alpha = pi b0^2/(4 b^2) + 9 pi b0^4/(64 b^4) + ...
    b = 10.0
    approx = math.pi / (4 * b**2) + 9 * math.pi / (64 * b**4)
    assert RT.deflection_exact(b) == pytest.approx(approx, rel=1e-4, abs=0)
