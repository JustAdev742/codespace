"""Energy and stress requirements of a portal under several explicit throat models.

All functions take and return SI units. Each model is a *conditional* estimate: it
answers "if a portal were this particular solution of the Einstein equations, what
stress-energy would general relativity require?" None of them says such matter exists.

Models
------
MT throat   Any static Morris-Thorne throat of radius r0: radial tension at the throat
            tau0 = c^4 / (8 pi G r0^2), independent of the shape function.
Ellis       Zero-tidal-force Ellis-Bronnikov wormhole (Phi = 0, b = r0^2/r): smooth,
            spherical mouths, negative energy spread over r ~ r0.
Thin shell  Two flat (M = 0) or Schwarzschild exteriors glued at r = a (Visser 1989):
            all exotic matter in a spherical shell.
Flat face   A disc-shaped "doorway" pair (flat-face construction in the spirit of Visser
            1989): space is flat except at the rim, which must be a negative-tension
            string with a conical *excess* angle of 2 pi (total angle 4 pi).
"""

from __future__ import annotations

import math

from scipy import integrate

from . import constants as C


# --- local stresses ----------------------------------------------------------------

def throat_tension(r0: float) -> float:
    """Radial tension at the throat of any static MT wormhole [Pa = J/m^3]."""
    return C.c**4 / (8 * math.pi * C.G * r0**2)


def ellis_energy_density(r: float, r0: float) -> float:
    """rho c^2 of the Ellis wormhole at areal radius r >= r0 [J/m^3] (negative)."""
    return -(C.c**4 / (8 * math.pi * C.G)) * r0**2 / r**4


# --- integrated "exotic mass" for each model -----------------------------------

def ellis_mass_proper(r0: float) -> float:
    """Integral of rho over *proper* volume, both sides of the throat [kg].

    rho = -c^2 r0^2 / (8 pi G r^4); dV = 4 pi r^2 dr / sqrt(1 - r0^2/r^2).
    Closed form: -(pi/2) r0 c^2 / G.
    """
    return -(math.pi / 2) * r0 * C.c2_over_G


def ellis_mass_proper_numeric(r0: float) -> float:
    """Same integral evaluated by quadrature (independent check)."""
    def integrand(u):  # substitute r = r0 / u, u in (0, 1]
        r = r0 / u
        rho = -C.c**2 * r0**2 / (8 * math.pi * C.G * r**4)
        dr_du = r0 / u**2
        return rho * 4 * math.pi * r**2 / math.sqrt(1 - u**2) * dr_du
    val, _ = integrate.quad(integrand, 0, 1, limit=200)
    return 2 * val


def ellis_mass_coordinate(r0: float) -> float:
    """Integral of rho over coordinate volume 4 pi r^2 dr, both sides [kg] = -r0 c^2/G.

    This is the quantity that enters the mass function m(r) = b(r) c^2 / (2G); the
    Ellis wormhole has zero ADM mass because the throat's m(r0) = r0 c^2/(2G) is exactly
    cancelled by the negative energy outside it.
    """
    return -r0 * C.c2_over_G


def vkd_quantifier_ellis(r0: float) -> float:
    """Visser-Kar-Dadhich volume-integral quantifier, Integral (rho + p_r) dV, for Ellis [kg].

    rho + p_r = (b'r - b) c^2 / (8 pi G r^3) = -c^2 r0^2 / (4 pi G r^4); integrated over
    4 pi r^2 dr on both sides gives -2 r0 c^2 / G (expressed as a mass).
    """
    return -2 * r0 * C.c2_over_G


def thin_shell_mass(a: float, M: float = 0.0) -> float:
    """Total surface mass-energy (/c^2) of a static Schwarzschild thin-shell wormhole [kg].

    sigma = -(c^4 / (2 pi G a)) sqrt(1 - 2GM/(c^2 a)); E = 4 pi a^2 sigma.
    """
    rs = 2 * C.G * M / C.c**2
    if a <= rs:
        raise ValueError("shell radius must exceed the Schwarzschild radius")
    sigma = -(C.c**4 / (2 * math.pi * C.G * a)) * math.sqrt(1 - rs / a)
    return 4 * math.pi * a**2 * sigma / C.c**2


def thin_shell_surface_pressure(a: float, M: float = 0.0) -> float:
    """Surface pressure P of the static thin shell [N/m] (positive = pressure)."""
    rs = 2 * C.G * M / C.c**2
    m = rs / 2
    return (C.c**4 / (4 * math.pi * C.G * a)) * (1 - m / a) / math.sqrt(1 - rs / a)


def string_mass_per_length(excess_angle: float) -> float:
    """Mass per unit length of a straight string with conical *excess* angle [kg/m].

    For a straight Nambu-Goto string (tension = mu c^2) the exterior is a cone with
    deficit 8 pi G mu / c^2. An excess angle therefore needs mu = -excess c^2/(8 pi G).
    """
    return -excess_angle * C.c**2 / (8 * math.pi * C.G)


def visser_edge_mass_per_length(bending_angle: float) -> float:
    """Visser (1989): an edge where the throat surface bends by angle phi carries
    mu = T = -phi c^2 / (4 pi G) (mass per length; G = c = 1 form: -phi/(4 pi G)).
    The cube edge (phi = pi/2) gives -c^2/(8G); a zero-thickness disc rim (phi = pi)
    gives -c^2/(4G). Equivalent to the cone formula with excess angle = 2 phi."""
    return -bending_angle * C.c**2 / (4 * math.pi * C.G)


def flat_face_rim_mass(R: float, excess_angle: float = 2 * math.pi) -> float:
    """Total rim mass of a circular flat-face portal pair of radius R [kg].

    The two rims are one closed curve of length 2 pi R after the identification, with
    total angle 4 pi around it (excess 2 pi, i.e. Visser bending angle pi). Treats the
    rim locally as a straight string, valid when the string thickness << R.
    """
    return string_mass_per_length(excess_angle) * 2 * math.pi * R


def rim_collapse_time(R: float) -> float:
    """Collapse time of a circular Nambu-Goto loop released from rest [s].

    r(t) = R cos(c t / R) => collapse at t = pi R / (2 c). The equation of motion is
    independent of the sign of mu, so a negative-tension loop collapses too unless held.
    """
    return math.pi * R / (2 * C.c)


# --- Casimir comparison --------------------------------------------------------

def casimir_energy_density(a: float) -> float:
    """Energy density between ideal parallel plates separated by a [J/m^3] (negative)."""
    return -math.pi**2 * C.hbar * C.c / (720 * a**4)


def casimir_separation_for(energy_density: float) -> float:
    """Plate gap whose Casimir energy density has magnitude |energy_density| [m]."""
    return (math.pi**2 * C.hbar * C.c / (720 * abs(energy_density)))**0.25


def casimir_gap_for_throat(r0: float) -> float:
    """Plate gap needed for |rho_Casimir| to equal the throat tension of radius r0 [m].

    Closed form: (pi^3 hbar G r0^2 / (90 c^3))^(1/4) = (pi^3/90)^(1/4) sqrt(l_P r0).
    """
    return casimir_separation_for(throat_tension(r0))


# --- quantum inequality ----------------------------------------------------------

def qi_max_sampling_length(energy_density: float) -> float:
    """Ford-Roman bound for a massless scalar field (Lorentzian sampling).

    <rho> >= -3 hbar / (32 pi^2 c^3 t0^4), so a negative energy density of magnitude
    |rho| can only be sustained, for an inertial observer, over a sampling time t0 with
    c t0 <= (3 hbar c / (32 pi^2 |rho|))^(1/4). Returns that length c t0 [m].
    """
    return (3 * C.hbar * C.c / (32 * math.pi**2 * abs(energy_density)))**0.25


def ford_roman_band_max(r0: float, f: float = 0.01) -> float:
    """Ford & Roman (1996) bound on the thickness of the negative-energy band [m].

    Applying the flat-space quantum inequality over a sampling time t0 = f x (smallest
    local length scale), with f ~ 0.01, they obtain a0 <~ (r0 / (8 f^4 l_P))^(1/3) l_P.
    This is an argument (the QI is proven only in flat space), not a theorem.
    """
    return (r0 / (8 * f**4 * C.l_P))**(1 / 3) * C.l_P


def ford_roman_ellis_max_radius(f: float = 0.01) -> float:
    """Ford & Roman (1996) eq. 51: an Ellis-type throat (Phi = 0, b = r0^2/r) whose negative
    energy comes from a free quantum field must satisfy r0 <~ l_P / (2 f^2)  (~1e-31 m for f = 0.01)."""
    return C.l_P / (2 * f**2)


# --- comparisons -------------------------------------------------------------------

def solar_output_years(energy_joules: float) -> float:
    """Express an energy as years of total solar luminosity."""
    return abs(energy_joules) / C.L_sun / C.year


def required_radius_for_tension(tension: float) -> float:
    """Throat radius at which the required throat tension equals `tension` [m]."""
    return math.sqrt(C.c**4 / (8 * math.pi * C.G * tension))


def exoticity_of_material(tensile_strength: float, density: float) -> float:
    """Ratio tension / (rho c^2) for an ordinary material; > 1 would be 'exotic'."""
    return tensile_strength / (density * C.c**2)
