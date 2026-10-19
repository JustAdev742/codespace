"""What flows through an open portal when its two ends sit in different environments.

Model: an open flat-face portal of radius R behaves, for fluids, like a sharp-edged
orifice of zero length joining two large reservoirs. Classical compressible-flow and
Bernoulli results then apply; the discharge coefficient Cd (0.6 for a sharp orifice,
up to ~1 for a rounded inlet) is the main uncertainty and is exposed as a parameter.
Radiation through the aperture is treated as black-body exchange.
"""

from __future__ import annotations

import math

from scipy.integrate import solve_ivp

from . import constants as C


def critical_pressure_ratio(gamma=C.gamma_air):
    return (2 / (gamma + 1))**(gamma / (gamma - 1))


def orifice_mass_flow(p0, T0, p_back, area, Cd=1.0, gamma=C.gamma_air, R=C.R_air):
    """Isentropic mass flow from reservoir (p0, T0) into back pressure p_back [kg/s]."""
    if p_back >= p0:
        return 0.0
    pr = max(p_back / p0, 0.0)
    if pr <= critical_pressure_ratio(gamma):   # choked
        flux = p0 * math.sqrt(gamma / (R * T0)) * (2 / (gamma + 1))**((gamma + 1) / (2 * (gamma - 1)))
    else:
        flux = p0 * math.sqrt(2 * gamma / ((gamma - 1) * R * T0) * (pr**(2 / gamma) - pr**((gamma + 1) / gamma)))
    return Cd * area * flux


def exit_velocity(p0, T0, p_back, gamma=C.gamma_air, R=C.R_air):
    """Jet speed at the throat [m/s] (sonic when choked)."""
    pr = max(p_back / p0, critical_pressure_ratio(gamma))
    T = T0 * pr**((gamma - 1) / gamma)
    return math.sqrt(2 * gamma * R / (gamma - 1) * (T0 - T))


def _room_rhs(volume, area, p0, T0, p_back, Cd, gamma, R):
    """Mass balance of a closed room venting through the aperture; gas expands isentropically."""
    m0 = p0 * volume / (R * T0)

    def rhs(t, y):
        p = p0 * (y[0] / m0)**gamma
        T = T0 * (p / p0)**((gamma - 1) / gamma)
        return [-orifice_mass_flow(p, T, p_back, area, Cd, gamma, R)]
    return m0, rhs


def blowdown(volume, area, p0=C.P_sea_level, T0=C.T_air_sl, p_back=0.0, Cd=0.8, t_end=600.0,
             gamma=C.gamma_air, R=C.R_air):
    """Adiabatic blow-down of a closed room through a portal to back pressure p_back.

    Returns (t, p) arrays. Room gas expands isentropically: T/T0 = (p/p0)^((g-1)/g).
    """
    m0, rhs = _room_rhs(volume, area, p0, T0, p_back, Cd, gamma, R)

    def floor(t, y):
        return y[0] / m0 - 1e-4
    floor.terminal = True
    sol = solve_ivp(rhs, (0, t_end), [m0], events=floor, max_step=t_end / 2000, rtol=1e-8)
    p = p0 * (sol.y[0] / m0)**gamma
    return sol.t, p


def time_to_pressure(volume, area, p_target, p0=C.P_sea_level, T0=C.T_air_sl, p_back=0.0, Cd=0.8,
                     t_end=1e7, gamma=C.gamma_air, R=C.R_air):
    """Time for the room to fall to p_target [s], located by root-finding on the solver's dense
    output (an event), not by scanning output samples. math.inf if it never gets there."""
    m0, rhs = _room_rhs(volume, area, p0, T0, p_back, Cd, gamma, R)
    m_target = m0 * (p_target / p0)**(1 / gamma)

    def reached(t, y):
        return y[0] - m_target
    reached.terminal = True
    reached.direction = -1
    sol = solve_ivp(rhs, (0, t_end), [m0], events=reached, rtol=1e-10, atol=1e-12 * m0)
    return float(sol.t_events[0][0]) if sol.t_events[0].size else math.inf


def pressure_force(dp, area):
    """Net force on a body plugging the aperture [N]."""
    return dp * area


def water_jet(depth, area, Cd=0.62, rho=C.rho_seawater, g=C.g0, p_back=C.P_sea_level, p_surface=C.P_sea_level):
    """Bernoulli jet from a portal at `depth` under water into air at p_back.

    Returns (speed m/s, volumetric flow m^3/s, mass flow kg/s, dp Pa).
    """
    dp = p_surface + rho * g * depth - p_back
    v = math.sqrt(2 * dp / rho)
    q = Cd * area * v
    return v, q, rho * q, dp


def radiative_flux(T_hot, T_cold=300.0):
    """Net black-body flux through an aperture between two black enclosures [W/m^2]."""
    return C.sigma_SB * (T_hot**4 - T_cold**4)


def gravity_flux_equivalent_mass(g, area):
    """Newtonian-limit 'mass' whose flux equals g * area threading the portal [kg].

    Gauss: flux = 4 pi G M. A floor portal facing up in a field g lets g*area of flux
    through; the far mouth looks like a point source of |M| = g area / (4 pi G).
    """
    return g * area / (4 * math.pi * C.G)
