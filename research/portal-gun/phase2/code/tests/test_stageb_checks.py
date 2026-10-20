"""Checks added after the stage B literature comparison.

1. The QI window prescription: Ford & Roman's (variation-length cap) and the curvature-only
   reading (Krasnikov 2003) agree for smooth throats and differ for thin bands, where the
   curvature window gives D = (8 pi/3) f^4 a r0 / l_P^2 for the static observer at the throat.
2. b'(r0) = 1 (zero flare-out at the throat, Kuhfittig's choice): no observer at the throat sees
   negative energy, but just off the throat the boost-optimised deficit returns.
3. Near-extremal charged Ellis-Bronnikov wormholes: closed forms, the uncharged limit, and the
   redshift and field strength in the long-lived limit.
"""
import numpy as np
import pytest

from portal2 import charged as ch, families as fam, qi
from portal2.constants import l_P

F = 0.01
REF = (4 * np.pi / 3) * F**4 / l_P**2


def test_windows_agree_for_smooth_throats():
    for eps in (0.2, 0.01):
        g = fam.two_scale(1.0, eps, max(20.0, 4.0 / eps))
        gam = np.geomspace(1 + 1e-6, 1e5, 2000)
        d1 = qi.local_deficit(g, np.zeros_like(gam), gam, F, "fr96")["D"].max()
        d2 = qi.local_deficit(g, np.zeros_like(gam), gam, F, "curvature")["D"].max()
        assert d2 == pytest.approx(d1, rel=1e-9)
        assert d1 / REF == pytest.approx(1.0, rel=1e-3)


@pytest.mark.parametrize("a", [0.01, 0.003, 0.001])
def test_thin_band_under_both_windows(a):
    g = fam.ThinBand(1.0, a)
    fr = qi.local_deficit(g, 0.0, 1.0, F, "fr96")["D"][0]
    an_fr = (32 * np.pi / 3) * F**4 * a**3 / l_P**2
    assert fr / an_fr == pytest.approx(1.0, abs=0.06)
    pos = np.geomspace(1e-5, 3.0, 200)
    t = qi.static_deficit_curvature_window(g, np.concatenate([-pos[::-1], [0.0], pos]), F)
    an_cu = (8 * np.pi / 3) * F**4 * a / l_P**2
    assert t["D"].max() / an_cu == pytest.approx(1.0, abs=0.02)
    assert t["D"].max() / fr > 1e3 / (a / 0.01) ** 2      # the curvature window excludes far more


def test_zero_flare_out_at_the_throat_does_not_help():
    g = fam.two_scale(1.0, 0.0, 10.0)
    assert g.local(np.array([0.0]))[2][0] == pytest.approx(0.0, abs=1e-12)    # r''(0) = 0
    gam = np.geomspace(1 + 1e-6, 1e6, 400)
    at_throat = qi.local_deficit(g, np.zeros_like(gam), gam, F)["D"]
    assert np.all(at_throat == 0.0)
    best, _ = qi.scan(g, F, l_extent=40.0)
    assert best["D"] / REF > 0.5 and abs(best["l"]) > 1.0


def test_charged_closed_forms_and_limits():
    p = ch.supercritical_symmetric(1e-6)
    assert p["G_throat"] == pytest.approx(1.0, abs=1e-10) and p["M"] == pytest.approx(0.0, abs=1e-10)
    for mu in (0.5, 0.99):
        p = ch.supercritical_symmetric(mu)
        assert p["Q"] / p["r_T"] == pytest.approx(mu)
        assert p["M"] / p["r_T"] == pytest.approx(mu * np.sin(mu * np.pi / 2))
    q = ch.critical_at(0.5)
    assert q["Q"] / q["r_T"] == pytest.approx(0.5, rel=1e-9)
    g = [ch.critical_at(x)["G_throat"] for x in (0.99, 0.999, 0.9999)]
    assert g[0] > g[1] > g[2]
    assert g[2] / (1 - 0.9999) ** 2 == pytest.approx(g[0] / (1 - 0.99) ** 2, rel=0.02)   # G ~ (1-q)^2


def test_field_limits_for_a_one_metre_throat():
    f = ch.field_limits(1.0)
    assert f["E_V_per_m"] == pytest.approx(1.043e27, rel=1e-3)
    assert f["E_over_Schwinger"] == pytest.approx(7.88e8, rel=1e-2)
    assert f["dirac_monopoles"] == pytest.approx(1.057e34, rel=1e-2)
    assert f["extremal_mass_kg"] == pytest.approx(1.3466e27, rel=1e-3)
    assert ch.tau0_scaled(1.1 * 365.25 * 86400, 1e4, 1.0) == pytest.approx(3471, rel=1e-3)


def test_framework_and_ledger_carry_no_pending_literature_checks():
    from portal2 import audit, feasibility as fz
    archs = fz.architectures()
    first = {a.key: a.first_decisive().key for a in archs}
    assert first == {"A": "A1", "B": "B2", "C": "C2", "D1": "D1b", "D2": "D2b", "D3": "D3a",
                     "D4": "D4b", "D5": "D5a"}
    for a in archs:
        for r in a.reqs:
            assert "to be checked" not in r.basis and "stage B" not in r.basis, r.key
    for e in audit.ledger():
        text = " ".join(str(e.get(k, "")) for k in ("note", "literature", "recomputed"))
        assert "stage B" not in text and "see stage" not in text, e["id"]
    assert fz.is_acyclic(fz.milestones())
