"""Clock drift between portal mouths and the time needed to form a time machine.

Model (Morris-Thorne-Yurtsever 1988; Frolov & Novikov 1990): the throat is short and
initially "synchronised", so events at equal proper time on the two mouths' clocks are
connected through the portal. If the mouths sit at different gravitational potentials
or move relative to each other, their proper times drift apart at fractional rate
eps. After external time T the offset is eps*T. Once that offset exceeds the light-travel
time d/c between the mouths through ordinary space, a closed timelike curve exists:
go through the portal "into the past" and return the long way.

  T_ctc = (d / c) / eps

Caveats: assumes the throat interior is rigidly synchronised (a static alternative,
in which the potential is single valued and no drift accumulates, is discussed in
newtonian_portal.py); ignores back-reaction and the quantum instabilities expected
near a chronology horizon (Kim & Thorne 1991; Hawking 1992).
"""

from __future__ import annotations

import math

from . import constants as C


def rate_gravity(delta_phi: float) -> float:
    """Fractional clock-rate difference for a potential difference delta_phi [J/kg]."""
    return delta_phi / C.c**2


def rate_velocity(v: float) -> float:
    """Fractional rate deficit of a clock moving at speed v (1 - 1/gamma).

    Written as b^2 / (1 + sqrt(1 - b^2)) rather than 1 - sqrt(1 - b^2): the two are equal,
    but the second loses most of its digits to cancellation at everyday speeds."""
    b2 = (v / C.c)**2
    return b2 / (1 + math.sqrt(1 - b2))


def time_to_ctc(separation: float, eps: float) -> float:
    """External time until the accumulated offset equals the light-travel time [s]."""
    if eps <= 0:
        return math.inf
    return separation / C.c / eps


def vertical_pair_time_to_ctc(g: float = C.g0) -> float:
    """Mouths stacked vertically a height h apart in uniform gravity g: T = c/g (h cancels)."""
    return C.c / g


def scenarios():
    """A table of worked examples (name, separation m, eps, T seconds)."""
    out = []

    def add(name, d, eps, note):
        out.append({"scenario": name, "separation_m": d, "rate": eps,
                    "T_ctc_s": time_to_ctc(d, eps), "T_ctc_years": time_to_ctc(d, eps) / C.year, "note": note})

    h = 10.0
    add("vertical, 10 m apart, Earth surface", h, rate_gravity(C.g0 * h), "T = c/g, independent of h")
    add("ground vs 1 km mountain top, 100 km apart", 1e5, rate_gravity(C.g0 * 1000), "same geoid otherwise")
    add("Earth surface vs deep space, 1 AU apart", C.AU, rate_gravity(C.GM_earth / C.R_earth + 0.0), "Earth potential only")
    add("solar photosphere vs Earth orbit, 1 AU", C.AU, rate_gravity(C.GM_sun / C.R_sun - C.GM_sun / C.AU), "solar potential difference")
    add("mouth on car at 30 m/s, 10 km apart", 1e4, rate_velocity(30.0), "special-relativistic drift")
    add("mouth in LEO (7.8 km/s) vs ground, 400 km", 4e5,
        abs(rate_velocity(7.8e3) - rate_gravity(C.GM_earth / C.R_earth - C.GM_earth / (C.R_earth + 4e5))),
        "velocity and gravity partly cancel")
    return out
