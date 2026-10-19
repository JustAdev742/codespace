import math

import pytest

from portalphys import constants as C
from portalphys import energy as E


def test_throat_tension_value_and_scaling():
    assert E.throat_tension(1.0) == pytest.approx(4.8155e42, rel=1e-4)
    assert E.throat_tension(10.0) == pytest.approx(E.throat_tension(1.0) / 100, rel=1e-12)


def test_morris_thorne_order_of_magnitude_statement():
    # MT88 quote the throat tension as ~5e41 dyn/cm^2 for b0 = 10 m (1 dyn/cm^2 = 0.1 Pa)
    assert E.throat_tension(10.0) / 0.1 == pytest.approx(4.8e41, rel=0.02)


def test_ellis_mass_closed_form_matches_quadrature():
    for r0 in (1e-3, 1.0, 1e3):
        assert E.ellis_mass_proper_numeric(r0) == pytest.approx(E.ellis_mass_proper(r0), rel=1e-8)


def test_ellis_one_metre_is_about_one_jupiter_mass():
    assert E.ellis_mass_proper(1.0) / C.M_jupiter == pytest.approx(-1.114, abs=0.002)


def test_flat_face_rim_matches_cone_formula():
    # excess 2 pi -> mu = -c^2 / (4 G); total over the rim = -(pi/2) R c^2/G
    assert E.string_mass_per_length(2 * math.pi) == pytest.approx(-C.c**2 / (4 * C.G), rel=1e-12)
    assert E.flat_face_rim_mass(2.0) == pytest.approx(-math.pi * C.c**2 / C.G, rel=1e-12)


def test_thin_shell_flat_limit():
    assert E.thin_shell_mass(1.0) == pytest.approx(-2 * C.c**2 / C.G, rel=1e-12)
    with pytest.raises(ValueError):
        E.thin_shell_mass(1.0, M=C.c**2 / C.G)  # shell inside its Schwarzschild radius


def test_casimir_gap_closed_form_and_mt_au_example():
    for r0 in (1.0, C.AU):
        closed = (math.pi**3 * C.hbar * C.G * r0**2 / (90 * C.c**3))**0.25
        assert E.casimir_gap_for_throat(r0) == pytest.approx(closed, rel=1e-12)
        assert E.casimir_gap_for_throat(r0) == pytest.approx((math.pi**3 / 90)**0.25 * math.sqrt(C.l_P * r0), rel=1e-9)
    # MT88: a 1 AU throat needs plates ~1e-10 cm apart
    assert 0.5e-12 < E.casimir_gap_for_throat(C.AU) < 2e-12


def test_casimir_round_trip():
    a = 1e-7
    assert E.casimir_separation_for(E.casimir_energy_density(a)) == pytest.approx(a, rel=1e-12)


def test_quantum_inequality_length_is_planck_like_for_metre_throat():
    L = E.qi_max_sampling_length(E.throat_tension(1.0))
    assert 1e-18 < L < 1e-17
    # same scaling as the Casimir gap: both ~ sqrt(l_P r0)
    ratio = L / E.casimir_gap_for_throat(1.0)
    assert ratio == pytest.approx(E.qi_max_sampling_length(E.throat_tension(100.0)) / E.casimir_gap_for_throat(100.0), rel=1e-9)


def test_rim_collapse_time():
    assert E.rim_collapse_time(1.0) == pytest.approx(5.24e-9, rel=1e-3)


def test_graphene_is_far_from_exotic():
    assert E.exoticity_of_material(C.graphene_strength, C.graphite_density) < 1e-9


def test_ford_roman_band_example():
    # FR96: for a 1 m throat the band must be thinner than ~1e14 Planck lengths (~1e-21 m)
    a0 = E.ford_roman_band_max(1.0)
    assert 1e-21 < a0 < 3e-21
    assert 5e13 < a0 / C.l_P < 2e14
