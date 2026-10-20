"""Causal-consistency checker for networks of linked mouths (short throats).

Model (weak field, slow motion, first order in U/c^2 and v^2/c^2):
  * Each mouth i follows a worldline x_i(t) in a global inertial frame with Newtonian potential
    U(x) (J/kg, U = -GM/r etc.).  Its proper time runs at  dtau_i/dt = 1 + U(x_i)/c^2 - v_i^2/(2 c^2).
  * A link k joins mouths a_k and b_k through a throat of length L_k.  Clocks compared through
    the throat stay synchronised: the event at a_k with proper time tau_a is identified with the
    event at b_k with proper time tau_b = tau_a + C_k (Morris, Thorne & Yurtsever 1988).  In global
    time this is a time shift Delta_k(t) = C_k + tau_a(t) - tau_b(t): leaving a_k at t, one
    arrives at b_k at t + Delta_k(t) + L_k/c.
  * Ordinary travel from mouth i to mouth j takes at least |x_j - x_i| / c.

At a given moment the network is a weighted directed graph: external edges i -> j with weight
d_ij/c, link edges a -> b with weight Delta + L/c and b -> a with weight -Delta + L/c.  A closed
causal curve through at least one stretch of ordinary space exists iff some cycle containing an
external edge has total weight <= 0 (this treats the network as static over one cycle, valid when
cycle durations are short compared with the time over which Delta and the positions change).
Equivalently, the network is chronology-safe iff the difference constraints
T_b - T_a = Delta_k (L_k -> 0) and T_j - T_i < d_ij / c (strict) admit a solution T ("a time
function on the mouths").  With non-strict inequalities a weight-zero cycle (a closed null curve)
would count as safe.  The chronology margin is the smallest weight of a cycle containing an
external edge; it is what an operator must keep positive.
"""
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from .constants import c


@dataclass
class Mouth:
    name: str
    pos: Callable          # t (s) -> position (3,) in metres
    U: Callable            # position -> potential (J/kg)
    vel: Callable = None   # t -> velocity (3,); default: numerical derivative of pos

    def velocity(self, t):
        if self.vel is not None:
            return np.asarray(self.vel(t), float)
        h = 1e-3
        return (np.asarray(self.pos(t + h)) - np.asarray(self.pos(t - h))) / (2 * h)

    def rate_minus_1(self, t):
        """dtau/dt - 1, computed directly (adding 1 first would lose it to rounding)."""
        v = self.velocity(t)
        return self.U(np.asarray(self.pos(t))) / c**2 - float(v @ v) / (2 * c**2)


@dataclass
class Link:
    a: int
    b: int
    C: float = 0.0         # proper-time offset at the start (s)
    L: float = 0.0         # throat length (m)


@dataclass
class Network:
    mouths: list
    links: list
    t_grid: np.ndarray = field(default=None)

    def proper_times(self, t_grid):
        """Integrated proper-time deficit tau_i(t) - t for every mouth (s), on t_grid.
        Integrates (rate - 1) so that the small quantity is computed directly."""
        out = np.zeros((len(self.mouths), len(t_grid)))
        for i, m in enumerate(self.mouths):
            f = np.array([m.rate_minus_1(t) for t in t_grid])
            out[i, 1:] = np.cumsum(0.5 * (f[1:] + f[:-1]) * np.diff(t_grid))
        return out

    def shifts(self, t_grid):
        """Delta_k(t) = C_k + tau_a - tau_b on t_grid (s)."""
        tau = self.proper_times(t_grid)
        return np.array([lk.C + tau[lk.a] - tau[lk.b] for lk in self.links])

    def graph(self, t, deltas):
        """(W_ext, W_all): external-travel weights alone, and with link edges added."""
        P = np.array([np.asarray(m.pos(t), float) for m in self.mouths])
        W_ext = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=-1) / c
        np.fill_diagonal(W_ext, np.inf)
        W = W_ext.copy()
        for lk, d in zip(self.links, deltas):
            W[lk.a, lk.b] = min(W[lk.a, lk.b], d + lk.L / c)
            W[lk.b, lk.a] = min(W[lk.b, lk.a], -d + lk.L / c)
        return W_ext, W


def floyd_warshall(W):
    """All-pairs shortest paths; returns (D, has_negative_cycle)."""
    D = W.copy()
    n = len(D)
    np.fill_diagonal(D, np.minimum(np.diag(D), 0.0))
    for k in range(n):
        D = np.minimum(D, D[:, k:k + 1] + D[k:k + 1, :])
    return D, bool(np.any(np.diag(D) < -1e-30))


def margin(graphs):
    """Smallest weight (s) of a cycle that contains at least one stretch of ordinary travel;
    -inf if a negative cycle exists.  min over external edges (i -> j) of w_ij + D_ji, with D the
    all-edge shortest paths.  (A throat crossed and immediately re-crossed is a cycle of weight
    2L/c that returns the traveller to its own past position only in the limit L -> 0; it is
    not a time machine and is excluded.)"""
    W_ext, W = graphs
    D, neg = floyd_warshall(W)
    if neg:
        return -np.inf
    n = len(W)
    best = np.inf
    for i in range(n):
        for j in range(n):
            if i != j and np.isfinite(W_ext[i, j]):
                best = min(best, W_ext[i, j] + D[j, i])
    return best


def bellman_ford_has_negative_cycle(W):
    """Independent check of floyd_warshall: Bellman-Ford from a virtual source."""
    n = len(W)
    dist = np.zeros(n)
    edges = [(i, j, W[i, j]) for i in range(n) for j in range(n) if i != j and np.isfinite(W[i, j])]
    for _ in range(n):
        changed = False
        for i, j, w in edges:
            if dist[i] + w < dist[j] - 1e-30:
                dist[j] = dist[i] + w
                changed = True
        if not changed:
            return False
    return True


def margins_over_time(net, t_grid):
    deltas = net.shifts(t_grid)
    return np.array([margin(net.graph(t, deltas[:, k])) for k, t in enumerate(t_grid)])


def first_ctc_time(net, t_max, n=2001):
    """Earliest global time at which a closed causal curve appears (s), or None."""
    t = np.linspace(0, t_max, n)
    m = margins_over_time(net, t)
    bad = np.where(m <= 0)[0]
    if bad.size == 0:
        return None, t, m
    k = bad[0]
    if k == 0:
        return 0.0, t, m
    # linear interpolation of the margin between the last safe and first unsafe sample
    m0, m1 = m[k - 1], m[k] if np.isfinite(m[k]) else -abs(m[k - 1])
    return float(t[k - 1] + (t[k] - t[k - 1]) * m0 / (m0 - m1)), t, m


# ------------------------------------------------------------------ closed forms

def vertical_pair_ctc_time(g):
    """Two mouths at rest, one a height h above the other in uniform gravity g, synchronised at
    t = 0: Delta = -g h t / c^2, closed causal curve when |Delta| = h/c, i.e. t = c/g for any h."""
    return c / g


def launched_mouth_margin(beta):
    """A mouth launched from its partner at speed beta c to distance d (instantaneous
    acceleration, then at rest): time shift d/v (1 - 1/gamma); the cycle weight that remains is
    d/c - Delta = (d/c) [1 - (1 - sqrt(1 - beta^2)) / beta].  Returns the fraction in brackets."""
    return 1.0 - (1.0 - np.sqrt(1.0 - beta**2)) / beta
