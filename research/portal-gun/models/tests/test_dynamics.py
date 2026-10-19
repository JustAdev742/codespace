import math

import pytest

from portalphys import dynamics as D


@pytest.mark.parametrize("a0,M,beta2", [
    (1.0, 0.0, -1.0), (1.0, 0.0, 0.0),          # flat thin shell: stable iff beta2 < -1/2
    (5.0, 1.0, -2.0), (5.0, 1.0, 0.2),          # a0 > 3M: needs beta2 < -1.083
    (2.5, 1.0, 5.0), (2.5, 1.0, 1.0),           # 2M < a0 < 3M: needs beta2 > 3.5
])
def test_nonlinear_shell_motion_agrees_with_sign_of_Vpp(a0, M, beta2):
    kind, dev = D.classify_shell(a0, M, beta2, tau_end=150.0)
    expected = "oscillates" if D.Vpp(a0, M, beta2) > 0 else "runaway"
    assert kind == expected, (kind, dev)


def test_flat_shell_threshold():
    assert D.v2_critical(1.0, 1e-15) == pytest.approx(-0.5, abs=1e-9)


def test_loop_collapse_time_is_pi_R_over_2():
    for R in (0.5, 1.0, 3.0):
        _, _, tc = D.loop_collapse(R)
        assert tc == pytest.approx(math.pi * R / 2, rel=1e-6)


def test_poisson_visser_published_thresholds():
    # PV95 eq. 29: stable for beta0^2 <= -1/2 (a0 -> infinity limit) or, for 2M < a0 < 3M,
    # beta0^2 >= 3/2 + sqrt(3) at best.
    import numpy as np
    x = np.linspace(2.0001, 2.9999, 200001)
    assert min(D.v2_critical(a, 1.0) for a in x[::50]) == pytest.approx(1.5 + math.sqrt(3), abs=1e-3)
    assert D.v2_critical(1e6, 1.0) == pytest.approx(-0.5, abs=1e-5)
