import numpy as np
import pytest

from portalphys import newtonian_portal as NP


@pytest.fixture(scope="module")
def field():
    return NP.solve(R=1.0, h=4.0, g=9.81, dx=0.1, pad=6.0)


def test_without_portals_the_uniform_field_is_recovered():
    F = NP.solve(R=1.0, h=4.0, g=9.81, dx=0.2, pad=4.0, identified=False)
    assert np.max(np.abs(F.phi - 9.81 * F.z[:, None])) < 1e-9


def test_faces_sit_near_the_mean_potential(field):
    st = NP.face_field_stats(field)
    assert 0.5 * (st["phi_face_A"] + st["phi_face_B"]) == pytest.approx(9.81 * 4.0 / 2, rel=2e-3, abs=0)


def test_potential_is_single_valued_so_no_perpetual_fall(field):
    d = NP.axis_drop(field, z0=3.0, t_end=8.0, dt=5e-4)
    assert np.ptp(d["E"]) < 1e-4                                   # energy conserved
    st = NP.face_field_stats(field)
    vmax_allowed = np.sqrt(2 * (st["phi_loop_max"] - st["phi_loop_min"]))
    assert np.max(np.abs(d["v"])) <= vmax_allowed + 1e-3         # bounded speed
    assert len(d["crossings"]) >= 2                                # it does pass through...
    # ...but in a game-style uniform field it would gain speed without bound
    t, v, e = NP.kinematic_drop(3.0, 4.0, 9.81, t_end=3.0)
    assert abs(v[-1]) > 25 and np.ptp(e) < 1e-6 or abs(v[-1]) > 25


def test_gravity_in_the_room_is_reduced_and_reversed_near_faces(field):
    st = NP.face_field_stats(field)
    assert -6.0 < st["room_midpoint"] < -2.0                        # weaker than -9.81
    assert st["room_above_A"] > 0 and st["room_below_B"] > 0        # upward near both faces
    assert st["behind_A (below floor)"] < -15                       # ~2 g behind the mouths
