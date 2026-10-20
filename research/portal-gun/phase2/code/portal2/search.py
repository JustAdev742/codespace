"""Search over a space of static throat designs under explicit traveller constraints.

Design space (Compact family, r0 = 1 m): width of the exotic region a in [1e-3, 10] r0 (log),
redshift amplitude phi_a in [-3, 3], redshift width w in [1e-2, 3] (log).
Traveller (fixed in advance, not tuned): starts at 1 m/s far away, body 2 m long and 0.5 m wide.
Constraints: crossing possible; peak speed <= 0.01 c (a walk-in portal, not a particle beam);
radial and lateral tidal impulse <= 2 m/s; peak tidal acceleration <= 1e4 g.
Objective: the largest QI deficit over observers and positions (qi.scan, f = 0.01).
Random search with a fixed seed; the point is to see which direction the optimum runs, not to
find a feasible design by tuning.
"""
import numpy as np

from . import families as fam, qi, tides
from .constants import c, g0, l_P

REF = (4 * np.pi / 3) * 0.01**4 / l_P**2


def evaluate(a, phi_a, w, f=0.01):
    g = fam.Compact(1.0, a, phi_a, w)
    rec = {"a": a, "phi_a": phi_a, "w": w}
    vmin = tides.min_v_inf(g)
    if vmin > 0.01 * c:
        rec.update(feasible=False, why="redshift hill needs > 0.01 c")
        return rec
    t = tides.crossing(g, max(1.0, 1.001 * vmin), ell_b=2.0, w_b=0.5, span=20 * max(1.0, a))
    rec.update(beta_max=t["beta_max"], dv_r=t["dv_r"], dv_th=t["dv_th"],
               a_peak_g=max(t["a_r_max"], t["a_th_max"]) / g0)
    why = []
    if t["beta_max"] > 0.01:
        why.append("crossing speed > 0.01 c")
    if max(t["dv_r"], t["dv_th"]) > 2.0:
        why.append("tidal impulse > 2 m/s")
    if max(t["a_r_max"], t["a_th_max"]) > 1e4 * g0:
        why.append("peak tide > 1e4 g")
    best, _ = qi.scan(g, f, l_extent=3.0 + a)
    rec.update(D_over_ref=best["D"] / REF, feasible=not why, why="; ".join(why) or "ok")
    return rec


def random_search(n=400, seed=7):
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        a = 10 ** rng.uniform(-3, 1)
        phi = rng.uniform(-3, 3) if rng.random() < 0.7 else 0.0
        w = 10 ** rng.uniform(-2, np.log10(3))
        out.append(evaluate(a, phi, w))
    return out
