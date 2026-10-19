import numpy as np
import pytest

from portalphys import constants as C
from portalphys import kinematics as K

rng = np.random.default_rng(3)


def rand_frame():
    n = rng.normal(size=3)
    u = rng.normal(size=3)
    return K.frame(rng.normal(size=3) * 10, n, u)


def test_pair_transform_is_proper_and_inverse_consistent():
    for _ in range(20):
        A, B = rand_frame(), rand_frame()
        T = K.pair_transform(A, B)
        assert np.linalg.det(T[:3, :3]) == pytest.approx(1.0, abs=1e-12)
        assert np.allclose(K.pair_transform(B, A), np.linalg.inv(T), atol=1e-10)


def test_entering_front_of_A_exits_front_of_B():
    A, B = rand_frame(), rand_frame()
    T = K.pair_transform(A, B)
    nA, nB = A[:3, 2], B[:3, 2]
    p_behind_A = A[:3, 3] - 0.1 * nA          # just past A's plane (inside the portal)
    q = T @ np.append(p_behind_A, 1.0)
    assert (q[:3] - B[:3, 3]) @ nB == pytest.approx(0.1, abs=1e-12)   # 0.1 in front of B
    v_in = -nA                                # moving into A
    v_out = T[:3, :3] @ v_in
    assert np.allclose(v_out, nB)             # moving out of B


def test_galilean_limit_of_relativistic_map():
    A, B = rand_frame(), rand_frame()
    v = rng.normal(size=3) * 3.0
    uA, uB = rng.normal(size=3), rng.normal(size=3)
    P_out, _ = K.traverse(K.four_momentum(2.0, v), A, B, uA, uB)
    assert np.allclose(K.velocity_of(P_out), K.galilean_exit_velocity(v, A, B, uA, uB), atol=1e-9)


def test_mass_shell_and_ledger_conservation():
    A, B = rand_frame(), rand_frame()
    m = 1.5
    P_in = K.four_momentum(m, np.array([1e7, -2e7, 3e7]))
    P_out, L = K.traverse(P_in, A, B, uA=[5e7, 0, 0], uB=[0, -8e7, 1e7])
    eta = np.diag([-1, 1, 1, 1])
    assert P_out @ eta @ P_out == pytest.approx(P_in @ eta @ P_in, rel=1e-9, abs=0)
    total = L["dP_mouth_A"] + L["dP_mouth_B"] + L["dP_object"]
    assert np.allclose(total, 0, atol=1e-6 * np.abs(P_in).max())


def test_moving_mouth_launches_resting_object():
    # Mouth A slams at 5 m/s onto a cube at rest; B is static: cube leaves B at 5 m/s.
    A = K.frame([0, 0, 0], [0, 0, 1], [0, 1, 0])
    B = K.frame([10, 0, 0], [1, 0, 0], [0, 1, 0])
    uA = 5.0 * A[:3, 2]                        # A advances along its own normal, onto the cube
    v_out = K.galilean_exit_velocity([0, 0, 0], A, B, uA=uA)
    assert np.allclose(v_out, 5.0 * B[:3, 2])


def test_energy_paid_by_mouths_relativistic():
    # Same set-up at 0.6 c, where (gamma - 1) m c^2 is resolvable in double precision.
    A = K.frame([0, 0, 0], [0, 0, 1], [0, 1, 0])
    B = K.frame([10, 0, 0], [1, 0, 0], [0, 1, 0])
    m = 1.0
    P_out, L = K.traverse(K.four_momentum(m, [0, 0, 0]), A, B, uA=0.6 * C.c * A[:3, 2])
    assert np.allclose(K.velocity_of(P_out), 0.6 * C.c * B[:3, 2], rtol=1e-12)
    ke = P_out[0] * C.c - m * C.c**2
    assert ke == pytest.approx(0.25 * m * C.c**2, rel=1e-12, abs=0)       # gamma = 1.25
    dE_mouths = (L["dP_mouth_A"][0] + L["dP_mouth_B"][0]) * C.c
    assert dE_mouths == pytest.approx(-ke, rel=1e-12, abs=0)              # mouths pay for it
