"""SI constants (CODATA 2018 exact or recommended values) and derived Planck units."""
import math

c = 299_792_458.0            # m/s, exact
G = 6.674_30e-11             # m^3 kg^-1 s^-2
hbar = 1.054_571_817e-34     # J s, exact
g0 = 9.806_65                # m/s^2, standard gravity
atm = 101_325.0              # Pa
M_sun = 1.988_47e30          # kg
M_jup = 1.898_13e27          # kg
year = 365.25 * 86400.0      # s (Julian year)
day = 86400.0

l_P = math.sqrt(hbar * G / c**3)     # Planck length, 1.616e-35 m
t_P = l_P / c
m_P = math.sqrt(hbar * c / G)
E_P = m_P * c**2
rho_P = c**7 / (hbar * G**2)         # Planck energy density, J/m^3

# Conversion of geometric curvature (1/m^2) to stress or energy density (Pa = J/m^3):
# G_ab = (8 pi G / c^4) T_ab  =>  T = (c^4 / 8 pi G) * (Einstein tensor in 1/m^2)
STRESS_PER_CURVATURE = c**4 / (8 * math.pi * G)   # Pa per (1/m^2)
FORCE_GR = c**4 / G                                # 1.21e44 N, the natural force scale
POWER_GR = c**5 / G                                # 3.63e52 W, the natural power scale
MASS_PER_LENGTH_GR = c**2 / G                      # 1.35e27 kg/m
