import pytest

from portalphys import constants as C
from portalphys import timeshift as TS


def test_vertical_pair_is_independent_of_height():
    for h in (1.0, 10.0, 1000.0):
        T = TS.time_to_ctc(h, TS.rate_gravity(C.g0 * h))
        assert T == pytest.approx(C.c / C.g0, rel=1e-12)
    assert TS.vertical_pair_time_to_ctc() / 86400 == pytest.approx(353.8, abs=0.1)


def test_velocity_rate_low_speed_limit():
    v = 100.0
    assert TS.rate_velocity(v) == pytest.approx(v**2 / (2 * C.c**2), rel=1e-6)


def test_no_drift_means_no_time_machine():
    assert TS.time_to_ctc(1.0, 0.0) == float("inf")
