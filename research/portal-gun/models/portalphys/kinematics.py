"""Portal-pair kinematics: rigid transforms, velocity mapping and the momentum ledger.

Geometry: each mouth has a frame M = [e_right, e_up, n_front | position]. An object
entering the FRONT of A leaves the FRONT of B. In A's local coordinates the entry side
is +z; the map to B's local coordinates is a rotation by pi about the local up axis,
R_y(pi) = diag(-1, 1, -1), so

    T_{A->B} = M_B  R_y(pi)  M_A^{-1}          (orientation preserving, det = +1)

Velocities (special relativity): the identification maps A's local rest frame onto B's.
With mouth 4-velocities u_A, u_B (constant), an incoming 4-momentum P transforms as

    P' = L(u_B) Rbar L(u_A)^{-1} P,      Rbar = diag(1, R_B R_y(pi) R_A^T)

Momentum ledger (Gauss-law bookkeeping of the mouths' exterior 4-momenta, as in
Visser's treatment of wormhole mouths): mouth A gains P, mouth B loses P'. The total
object + mouths 4-momentum is conserved by construction; the physics is in WHO pays:
an object that leaves faster than it entered is paid for by the mouths' mass-energy.
"""

from __future__ import annotations

import numpy as np

from . import constants as C

RY_PI = np.diag([-1.0, 1.0, -1.0])


def frame(position, normal, up):
    """4x4 homogeneous frame for a mouth facing `normal` with in-plane `up`."""
    n = np.asarray(normal, float); n /= np.linalg.norm(n)
    u = np.asarray(up, float); u = u - (u @ n) * n; u /= np.linalg.norm(u)
    rgt = np.cross(u, n)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = rgt, u, n, position
    return M


def pair_transform(MA, MB):
    """T_{A->B} = M_B R_y(pi) M_A^{-1} (4x4)."""
    F = np.eye(4); F[:3, :3] = RY_PI
    return MB @ F @ np.linalg.inv(MA)


def boost(u):
    """Lorentz boost matrix (ct, x, y, z) taking the rest frame of velocity u to the lab."""
    u = np.asarray(u, float)
    b = u / C.c
    b2 = b @ b
    if b2 == 0:
        return np.eye(4)
    g = 1 / np.sqrt(1 - b2)
    L = np.eye(4)
    L[0, 0] = g
    L[0, 1:] = L[1:, 0] = g * b
    L[1:, 1:] += (g - 1) * np.outer(b, b) / b2
    return L


def four_momentum(m, v):
    v = np.asarray(v, float)
    g = 1 / np.sqrt(1 - (v @ v) / C.c**2)
    return np.concatenate([[g * m * C.c], g * m * v])   # (E/c, p)


def velocity_of(P):
    return P[1:] / P[0] * C.c


def traverse(P_in, MA, MB, uA=(0, 0, 0), uB=(0, 0, 0)):
    """Map an incoming lab 4-momentum through the pair. Returns (P_out, ledger dict)."""
    Rbar = np.eye(4)
    Rbar[1:, 1:] = MB[:3, :3] @ RY_PI @ MA[:3, :3].T
    P_A = np.linalg.solve(boost(uA), P_in)
    P_out = boost(uB) @ (Rbar @ P_A)
    ledger = {"dP_mouth_A": P_in.copy(), "dP_mouth_B": -P_out, "dP_object": P_out - P_in}
    return P_out, ledger


def galilean_exit_velocity(v_in, MA, MB, uA=(0, 0, 0), uB=(0, 0, 0)):
    """Low-speed rule: v_out = R (v_in - u_A) + u_B."""
    R = MB[:3, :3] @ RY_PI @ MA[:3, :3].T
    return R @ (np.asarray(v_in) - np.asarray(uA)) + np.asarray(uB)
