"""Static Newtonian gravity on the topology of a coaxial floor/ceiling portal pair.

Question: in a uniform gravitational field g, put portal A on the floor (z = 0, facing
up) and portal B on the ceiling (z = h, facing down), coaxial, radius R. In video games
an object dropped into A falls out of B and accelerates forever. What does a static,
self-consistent gravitational field on this space do?

Model: weak-field statics. The Newtonian potential phi solves Laplace's equation on the
3-space obtained by cutting the two discs and gluing crosswise (flat-face portal):
    above A  <->  below B      (fall into A's front, emerge from B's front)
    below A  <->  above B      (the backs, inside floor and ceiling)
Far from the portals phi -> g z. The rim is a conical line (total angle 4 pi); its
string stress has no Newtonian source (rho + 3p = 0 for a tension-equals-energy string),
so it enters only through the topology. Gravity passes through the floor/ceiling
material, so the backs are part of the problem.

Discretisation: axisymmetric finite volumes on a uniform (s, z) grid, cell centred,
discs on cell faces, Dirichlet phi = g z on the outer boundary. The identification is
imposed by re-wiring the face neighbours of the four rows that touch the discs. Solved
directly with scipy.sparse.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve


@dataclass
class PortalField:
    s: np.ndarray        # cell-centre radii (Ns,)
    z: np.ndarray        # cell-centre heights (Nz,)
    phi: np.ndarray      # potential (Nz, Ns), J/kg
    dx: float
    R: float
    h: float
    g: float
    kA: int              # face index of disc A (rows kA-1 below, kA above)
    kB: int
    nR: int              # columns i < nR lie under the discs
    identified: bool

    def axis_profile(self):
        """phi on the column of cells nearest the axis."""
        return self.z, self.phi[:, 0]


def solve(R=1.0, h=4.0, g=9.81, dx=0.05, pad=12.0, identified=True) -> PortalField:
    if abs(round(R / dx) - R / dx) > 1e-9 or abs(round(h / dx) - h / dx) > 1e-9:
        raise ValueError("R and h must be multiples of dx")
    nR = int(round(R / dx))
    H = int(round(h / dx))
    L = pad * max(R, h)                      # padding beyond the portal region
    K = int(round(L / dx))                   # rows below z = 0
    Ns = int(round((R + L) / dx))
    Nz = K + H + K
    s = (np.arange(Ns) + 0.5) * dx
    zmin = -K * dx
    z = zmin + (np.arange(Nz) + 0.5) * dx
    kA, kB = K, K + H                        # face indices of discs A and B

    idx = lambda i, j: j * Ns + i
    N = Ns * Nz
    rows, cols, vals = [], [], []
    rhs = np.zeros(N)

    def neighbour_south(i, j):
        if identified and i < nR:
            if j == kA:        # above A -> below B
                return (i, kB - 1)
            if j == kB:        # above B -> below A
                return (i, kA - 1)
        return (i, j - 1)

    def neighbour_north(i, j):
        if identified and i < nR:
            if j == kB - 1:    # below B -> above A
                return (i, kA)
            if j == kA - 1:    # below A -> above B
                return (i, kB)
        return (i, j + 1)

    for j in range(Nz):
        for i in range(Ns):
            p = idx(i, j)
            aE = float(i + 1)
            aW = float(i)
            aN = aS = i + 0.5
            diag = 0.0
            # east (outer radial boundary is Dirichlet)
            if i + 1 < Ns:
                rows.append(p); cols.append(idx(i + 1, j)); vals.append(aE)
            else:
                # face at s = Ns*dx; boundary value g*z at distance dx/2 -> coefficient doubled
                rhs[p] -= 2 * aE * g * z[j]
                diag -= aE  # extra half-cell coupling
            diag -= aE
            # west (axis: zero flux when i == 0 because aW = 0)
            if i > 0:
                rows.append(p); cols.append(idx(i - 1, j)); vals.append(aW)
                diag -= aW
            # north
            ni, nj = neighbour_north(i, j)
            if nj < Nz:
                rows.append(p); cols.append(idx(ni, nj)); vals.append(aN)
            else:
                rhs[p] -= 2 * aN * g * (z[j] + dx / 2)
                diag -= aN
            diag -= aN
            # south
            si, sj = neighbour_south(i, j)
            if sj >= 0:
                rows.append(p); cols.append(idx(si, sj)); vals.append(aS)
            else:
                rhs[p] -= 2 * aS * g * (z[j] - dx / 2)
                diag -= aS
            diag -= aS
            rows.append(p); cols.append(p); vals.append(diag)

    A = sparse.csr_matrix((vals, (rows, cols)), shape=(N, N))
    phi = spsolve(A.tocsc(), rhs).reshape(Nz, Ns)
    return PortalField(s=s, z=z, phi=phi, dx=dx, R=R, h=h, g=g, kA=kA, kB=kB, nR=nR, identified=identified)


def axis_loop_spline(field: PortalField):
    """Periodic cubic spline of phi on the axis loop 0 < z < h (A's front glued to B's front)."""
    from scipy.interpolate import CubicSpline
    zc, ph = field.axis_profile()
    mask = (zc > 0) & (zc < field.h)
    u = np.concatenate([zc[mask], [zc[mask][0] + field.h]])
    pu = np.concatenate([ph[mask], [ph[mask][0]]])
    return CubicSpline(u, pu, bc_type="periodic")


def axis_drop(field: PortalField, z0: float, t_end=20.0, dt=1e-3):
    """Drop a test mass from rest on the axis at height z0 (0 < z0 < h) and integrate.

    Motion stays on the axis by symmetry. The column between the discs is a closed loop:
    falling through A's face re-enters just below B (and the reverse). Uses a periodic
    cubic spline so force and potential are consistent (energy drift measures only the
    integrator). Returns dict with t, z (chart 0..h), v, E and the portal crossings.
    """
    h = field.h
    sp_ = axis_loop_spline(field)
    u0 = float(sp_.x[0])
    phi_at = lambda x: float(sp_(u0 + ((x - u0) % h)))
    grad_at = lambda x: float(sp_(u0 + ((x - u0) % h), 1))
    zz, vv = z0, 0.0
    ts, zs, vs, es = [0.0], [zz], [vv], [phi_at(zz)]
    crossings = []
    t = 0.0
    a = -grad_at(zz)
    while t < t_end:                              # velocity Verlet
        zn = zz + vv * dt + 0.5 * a * dt * dt
        an = -grad_at(zn)
        vn = vv + 0.5 * (a + an) * dt
        if zn < 0:
            crossings.append((t + dt, "down through A, out of B"))
            zn += h
        elif zn >= h:
            crossings.append((t + dt, "up through B, out of A"))
            zn -= h
        zz, vv, a = zn, vn, an
        t += dt
        ts.append(t); zs.append(zz); vs.append(vv); es.append(0.5 * vv * vv + phi_at(zz))
    return {"t": np.array(ts), "z": np.array(zs), "v": np.array(vs), "E": np.array(es), "crossings": crossings}


def face_field_stats(field: PortalField, probe=0.5):
    """Vertical field g_z = -dphi/dz on the axis at distance probe*R from each face."""
    sp_ = axis_loop_spline(field)
    zc, ph = field.axis_profile()
    from scipy.interpolate import CubicSpline
    full = CubicSpline(zc, ph)
    R, h = field.R, field.h
    d = probe * R
    return {
        "room_above_A": -float(sp_(d, 1)),
        "room_below_B": -float(sp_(h - d, 1)),
        "behind_A (below floor)": -float(full(-d, 1)),
        "behind_B (above ceiling)": -float(full(h + d, 1)),
        "room_midpoint": -float(sp_(h / 2, 1)),
        "phi_face_A": float(ph[field.kA]), "phi_face_B": float(ph[field.kB - 1]),
        "phi_loop_min": float(np.min(sp_(np.linspace(sp_.x[0], sp_.x[-1], 4001)))),
        "phi_loop_max": float(np.max(sp_(np.linspace(sp_.x[0], sp_.x[-1], 4001)))),
    }


def kinematic_drop(z0: float, h: float, g: float, t_end=3.0, dt=1e-4):
    """Video-game rule for comparison: uniform field, speed preserved through the portal."""
    zz, vv, t = z0, 0.0, 0.0
    ts, vs, es = [0.0], [0.0], [g * z0]
    while t < t_end:
        vv -= g * dt
        zz += vv * dt
        if zz < 0:
            zz += h
        t += dt
        ts.append(t); vs.append(vv); es.append(0.5 * vv * vv + g * zz)
    return np.array(ts), np.array(vs), np.array(es)
