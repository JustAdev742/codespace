"""Tidal accelerations on a traveller crossing a Morris-Thorne throat.

Orthonormal Riemann components (verified symbolically in symbolic_gr.py, MTW sign
convention, geometric units, r and b in metres, Phi dimensionless):

  R_trtr   = (1 - b/r)(Phi'' + Phi'^2) - (b' r - b) Phi' / (2 r^2)        (boost invariant)
  R_0'2'0'2' = gamma^2 [ (1 - b/r) Phi'/r + beta^2 (b' r - b) / (2 r^3) ]   (radial boost beta)

Geodesic deviation gives the relative acceleration of two body points separated by xi
along a frame axis:  Delta a = -c^2 R_{0j0j} xi  (positive = stretching).
"""

from __future__ import annotations

import math

from . import constants as C


def mt_tidal(r, b, bp, Phip, Phipp, v, xi):
    """(radial, lateral) tidal accelerations [m/s^2] for a radially moving traveller."""
    beta = v / C.c
    gam2 = 1.0 / (1.0 - beta**2)
    R_rad = (1 - b / r) * (Phipp + Phip**2) - (bp * r - b) * Phip / (2 * r**2)
    R_lat = gam2 * ((1 - b / r) * Phip / r + beta**2 * (bp * r - b) / (2 * r**3))
    return -C.c**2 * R_rad * xi, -C.c**2 * R_lat * xi


def ellis_tidal(v, r0, xi, r=None):
    """Ellis wormhole (Phi = 0, b = r0^2/r): radial tidal force is zero; lateral is
    Delta a = gamma^2 v^2 xi r0^2 / r^4  (stretching), maximal at the throat."""
    r = r0 if r is None else r
    return mt_tidal(r, r0**2 / r, -r0**2 / r**2, 0.0, 0.0, v, xi)


def ellis_max_speed(r0, xi, a_max):
    """Largest radial speed keeping the lateral tidal acceleration <= a_max at the throat.

    gamma^2 beta^2 = k with k = a_max r0^2 / (xi c^2)  =>  v = c sqrt(k / (1 + k)).
    Non-relativistic limit: v ~ r0 sqrt(a_max / xi).
    """
    k = a_max * r0**2 / (xi * C.c**2)
    return C.c * math.sqrt(k / (1 + k))


def mt_tidal_limit_curvature(a_max=C.g0, xi=2.0):
    """Morris & Thorne's tolerance written as a curvature bound |R| <= a_max/(c^2 xi) [m^-2]."""
    return a_max / (C.c**2 * xi)


def schwarzschild_radial_tidal(M, r, xi):
    """Radial tidal stretch near a mass M at radius r: 2 G M xi / r^3 [m/s^2] (comparison)."""
    return 2 * C.G * M * xi / r**3
