"""Light propagation through an Ellis-Bronnikov wormhole: what a real spherical portal looks like.

Metric (James et al. 2015 form, G = c = 1):  ds^2 = -dt^2 + dl^2 + r(l)^2 dOmega^2,
Ellis case r(l) = sqrt(l^2 + r0^2). Null geodesics are planar (spherical symmetry);
in the orbital plane with impact parameter b = r^2 dphi/dlambda:

    (dl/dlambda)^2 = 1 - b^2 / r^2,     dphi/dl = b / (r sqrt(r^2 - b^2))

Rays with b < r0 cross the throat to the other universe; rays with b > r0 turn round
at l_t = sqrt(b^2 - r0^2). Exact azimuth swept between l = -inf..+inf or l_t..+inf
(complete elliptic integral K with *modulus* k, scipy's ellipk takes m = k^2):

    transmitted (b < r0):  Delta phi = 2 (b/r0) K(b/r0)
    reflected   (b > r0):  Delta phi = 2 K(r0/b),   deflection alpha = 2K(r0/b) - pi

The weak-field limit alpha ~ pi r0^2 / (4 b^2). Two independent numerical routes are
provided (quadrature in l, and an ODE in the affine parameter) and are tested against
these closed forms in tests/test_raytrace.py.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import integrate, special
from scipy.integrate import solve_ivp


# ----------------------------------------------------------------------------- closed forms

def sweep_transmitted_exact(b, r0=1.0):
    k = b / r0
    return 2 * k * special.ellipk(k * k)


def sweep_reflected_exact(b, r0=1.0):
    k = r0 / b
    return 2 * special.ellipk(k * k)


def deflection_exact(b, r0=1.0):
    return sweep_reflected_exact(b, r0) - math.pi


# ----------------------------------------------------------------------------- quadrature

def _seg(l1, l2, b, r0):
    """Integral of b dl / (r sqrt(r^2-b^2)) over [l1, l2] with no turning point inside."""
    f = lambda l: b / (math.sqrt(l * l + r0 * r0) * math.sqrt(l * l + r0 * r0 - b * b))
    val, _ = integrate.quad(f, l1, l2, limit=400, epsabs=1e-12, epsrel=1e-11)
    return val


def _from_turning(l_t, l2, b, r0):
    """Integral from the turning point l_t to l2 (> l_t), singularity removed by l = l_t + s^2."""
    if math.isinf(l2):
        # split: finite part with substitution, tail with plain quad
        mid = l_t + 1.0 + 4 * r0
        return _from_turning(l_t, mid, b, r0) + _seg(mid, math.inf, b, r0)
    smax = math.sqrt(l2 - l_t)

    def f(s):
        l = l_t + s * s
        r = math.sqrt(l * l + r0 * r0)
        return 2 * b / (r * math.sqrt(l + l_t)) if s > 0 else 2 * b / (b * math.sqrt(2 * l_t))
    val, _ = integrate.quad(f, 0.0, smax, limit=400, epsabs=1e-12, epsrel=1e-11)
    return val


def sweep_from_camera(psi, l_c, r0=1.0):
    """Azimuth swept by a ray leaving a camera at l_c > 0, at angle psi to the inward radial.

    Returns (delta_phi, side) with side = +1 if the ray escapes to l -> +inf (our
    universe) and -1 if it ends at l -> -inf (the other universe).
    """
    rc = math.sqrt(l_c * l_c + r0 * r0)
    b = rc * math.sin(psi)
    if psi > math.pi / 2:                       # moving outward: straight out to +inf
        return (_seg(l_c, math.inf, b, r0), +1)
    if b < r0:                                  # inward and below critical: through the throat
        return (_seg(-math.inf, l_c, b, r0), -1)
    l_t = math.sqrt(max(b * b - r0 * r0, 0.0))
    return (_from_turning(l_t, l_c, b, r0) + _from_turning(l_t, math.inf, b, r0), +1)


# ----------------------------------------------------------------------------- ODE route

def trace_ode(l0, psi, r0=1.0, lam_max=400.0, l_escape=200.0):
    """Integrate the planar geodesic equations (James et al. 2015 eq. A.7 reduced to a plane).

    State (l, p_l, phi): dl/dlam = p_l, dp_l/dlam = b^2 r'/r^3, dphi/dlam = b/r^2.
    Returns (delta_phi, side).
    """
    r = lambda l: math.sqrt(l * l + r0 * r0)
    b = r(l0) * math.sin(psi)
    p0 = -math.cos(psi)                          # inward is decreasing l

    def rhs(lam, y):
        l, p, _ = y
        rr = r(l)
        return [p, b * b * (l / rr) / rr**3, b / rr**2]

    def esc(lam, y):
        return abs(y[0]) - l_escape
    esc.terminal = True
    sol = solve_ivp(rhs, (0, lam_max), [l0, p0, 0.0], events=esc, rtol=1e-11, atol=1e-12, max_step=0.5)
    l_end, _, phi_end = sol.y[:, -1]
    # add the asymptotic tail from l_escape to infinity analytically-small remainder
    tail = _seg(l_escape, math.inf, b, r0)
    return phi_end + tail, (1 if l_end > 0 else -1)


# ----------------------------------------------------------------------------- image synthesis

def _sky(n, side, rng_stars):
    """Procedural celestial spheres: our side = blue grid, far side = amber checker."""
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    lat = np.degrees(np.arcsin(np.clip(z, -1, 1)))
    lon = np.degrees(np.arctan2(y, x))
    img = np.zeros(n.shape)
    ours = side > 0
    # our universe: dark blue with 15-degree white grid
    grid = (np.abs(((lat + 7.5) % 15) - 7.5) < 0.6) | (np.abs(((lon + 7.5) % 15) - 7.5) < 0.6 * 1 / np.maximum(np.cos(np.radians(lat)), 0.05))
    base_o = np.stack([0.05 + 0.10 * (lat / 90 + 1) / 2, 0.12 + 0.2 * (lat / 90 + 1) / 2, 0.35 + 0.3 * (lat / 90 + 1) / 2], -1)
    img[ours] = base_o[ours]
    img[ours & grid] = [0.85, 0.9, 1.0]
    # other universe: amber/brown checkerboard 20 degrees
    chk = ((np.floor((lat + 90) / 20) + np.floor((lon + 180) / 20)) % 2) == 0
    far = ~ours
    img[far & chk] = [0.95, 0.55, 0.12]
    img[far & ~chk] = [0.35, 0.12, 0.05]
    # stars (fixed pseudo-random field per side) for texture
    flat_n = n.reshape(-1, 3)
    flat_side = side.reshape(-1)
    flat_img = img.reshape(-1, 3)
    cos_r = math.cos(math.radians(0.35))
    for sgn, stars in ((1, rng_stars[0]), (-1, rng_stars[1])):
        sel = np.nonzero(flat_side == sgn)[0]
        for k in range(0, sel.size, 8192):          # chunked to bound memory
            ch = sel[k:k + 8192]
            hit = (flat_n[ch] @ stars.T).max(axis=1) > cos_r
            flat_img[ch[hit]] = [1.0, 1.0, 0.95]
    return flat_img.reshape(img.shape)


def render(l_c, fov_deg=100.0, size=400, r0=1.0, look_inward=True, n_psi=6000, seed=1):
    """Render the view from a camera at proper radial distance l_c (> 0 or < 0).

    The camera looks along -e_r (towards the throat) when look_inward. Uses a 1-D lookup
    table delta_phi(psi), dense near the critical angle, interpolated per pixel.
    """
    flip = l_c < 0
    lc = abs(l_c)
    rc = math.sqrt(lc * lc + r0 * r0)
    psi_c = math.asin(min(r0 / rc, 1.0))
    # psi grid: dense around psi_c
    base = np.linspace(0, math.pi, n_psi)
    clus = psi_c + np.sign(np.linspace(-1, 1, n_psi)) * np.logspace(-9, 0, n_psi) * 0.5
    psis = np.unique(np.clip(np.concatenate([base, clus]), 0, math.pi))
    psis = psis[np.abs(psis - psi_c) > 1e-7]      # b == r0 exactly is the (measure-zero) photon sphere
    if lc == 0:
        table = np.array([sweep_at_throat(p, r0) for p in psis])
    else:
        table = np.array([sweep_from_camera(p, lc, r0) for p in psis])
    dphi_tab, side_tab = table[:, 0], table[:, 1]

    # pixel directions in camera frame: forward = -e_r, e_r = +x (camera on +x axis)
    half = math.tan(math.radians(fov_deg) / 2)
    u = np.linspace(-half, half, size)
    U, V = np.meshgrid(u, -u)
    d = np.stack([-np.ones_like(U), U, V], -1) if look_inward else np.stack([np.ones_like(U), U, V], -1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    er = np.array([1.0, 0.0, 0.0])
    cospsi = -(d @ er)                      # angle to the inward radial
    psi = np.arccos(np.clip(cospsi, -1, 1))
    perp = d - (d @ er)[..., None] * er
    pn = np.linalg.norm(perp, axis=-1, keepdims=True)
    perp = np.where(pn > 1e-12, perp / np.maximum(pn, 1e-12), np.array([0, 1.0, 0]))
    dphi = np.interp(psi, psis, dphi_tab)
    side = np.where(np.interp(psi, psis, side_tab) > 0, 1, -1)
    n_end = np.cos(dphi)[..., None] * er + np.sin(dphi)[..., None] * perp
    if flip:
        side = -side
    rng = np.random.default_rng(seed)
    stars = [rng.normal(size=(900, 3)), rng.normal(size=(900, 3))]
    stars = [s / np.linalg.norm(s, axis=1, keepdims=True) for s in stars]
    return _sky(n_end, side, stars), {"psi_c_deg": math.degrees(psi_c), "r_cam": rc}


def sweep_at_throat(psi, r0=1.0):
    """Camera exactly at the throat: b = r0 sin(psi) <= r0, rays never turn round."""
    b = r0 * math.sin(psi)
    if psi < math.pi / 2:
        return (_seg(-math.inf, 0.0, b, r0), -1)
    return (_seg(0.0, math.inf, b, r0), +1)


def apparent_angular_radius(l_c, r0=1.0):
    """Angular radius of the 'other universe' disc seen from l_c: sin(psi_c) = r0 / r(l_c)."""
    return math.degrees(math.asin(r0 / math.sqrt(l_c * l_c + r0 * r0)))
