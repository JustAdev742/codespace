"""Physical constants (SI) used throughout the portal study.

Fundamental constants are CODATA 2018 recommended values (the values in force for
the 2019 SI; c, h, hbar, k_B are exact by definition). Astronomical values are IAU
nominal values or widely used reference values; each is labelled so a reader can
substitute a newer value.
"""

import math

# --- fundamental (CODATA 2018) -------------------------------------------------
c = 299_792_458.0                 # speed of light, m/s (exact)
G = 6.674_30e-11                  # Newtonian constant, m^3 kg^-1 s^-2 (rel. unc. 2.2e-5)
hbar = 1.054_571_817e-34          # reduced Planck constant, J s (exact)
k_B = 1.380_649e-23               # Boltzmann constant, J/K (exact)
sigma_SB = 5.670_374_419e-8       # Stefan-Boltzmann constant, W m^-2 K^-4 (exact-derived)

# Planck units derived from the above (not independent inputs)
l_P = math.sqrt(hbar * G / c**3)  # Planck length  ~1.616e-35 m
t_P = l_P / c                     # Planck time    ~5.391e-44 s
m_P = math.sqrt(hbar * c / G)     # Planck mass    ~2.176e-8 kg

# Combinations that recur in wormhole formulas
c4_over_G = c**4 / G              # force scale ~1.21e44 N  (a "maximal tension")
c2_over_G = c**2 / G              # mass per length ~1.35e27 kg/m

# --- Earth / Solar System (reference values) --------------------------------------
g0 = 9.806_65                     # standard gravity, m/s^2 (exact by convention)
GM_earth = 3.986_004_418e14       # m^3/s^2 (IERS / WGS 84)
R_earth = 6.371_0e6               # mean radius, m
M_earth = GM_earth / G            # ~5.972e24 kg
GM_sun = 1.327_124_4e20           # m^3/s^2 (IAU 2015 nominal)
M_sun = GM_sun / G                # ~1.989e30 kg
R_sun = 6.957e8                   # nominal solar radius, m (IAU 2015)
L_sun = 3.828e26                  # nominal solar luminosity, W (IAU 2015)
T_sun_eff = 5772.0                # nominal solar effective temperature, K (IAU 2015)
GM_jupiter = 1.266_865_3e17       # m^3/s^2 (IAU 2015 nominal)
M_jupiter = GM_jupiter / G        # ~1.898e27 kg
AU = 1.495_978_707e11             # astronomical unit, m (exact, IAU 2012)
light_year = c * 365.25 * 86400   # Julian light year, m
year = 365.25 * 86400             # Julian year, s

# --- matter reference values (order-of-magnitude benchmarks) ----------------------
rho_nuclear = 2.3e17              # nuclear saturation mass density, kg/m^3 (~0.16 fm^-3)
P_neutron_star_core = 1e35        # order of magnitude of central pressure, Pa
graphene_strength = 1.3e11        # intrinsic tensile strength of monolayer graphene, Pa
                                  # (Lee et al., Science 321, 385 (2008): ~130 GPa)
graphite_density = 2.2e3          # kg/m^3, used to express graphene's tension/energy ratio
world_power_2023 = 2.0e13         # order of magnitude of world primary power use, W (~20 TW)

# Atmosphere / fluids
P_sea_level = 101_325.0           # Pa (standard atmosphere, exact by convention)
rho_air_sl = 1.225                # kg/m^3 (ISA sea level)
T_air_sl = 288.15                 # K (ISA sea level)
gamma_air = 1.4                   # ratio of specific heats for dry air
R_air = 287.05                    # specific gas constant of dry air, J kg^-1 K^-1
rho_seawater = 1025.0             # kg/m^3

# Atomic/nuclear length benchmarks
bohr_radius = 5.291_772_109e-11   # m (CODATA 2018)
proton_radius = 8.41e-16          # m (CODATA 2018 charge radius 0.8414 fm)
