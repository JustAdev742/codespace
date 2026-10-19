"""Every symbolic identity in symbolic_gr must hold (re-derived from the metric)."""
import sympy as sp

from portalphys import dynamics, symbolic_gr


def test_all_symbolic_checks_pass():
    out, _ = symbolic_gr.main(None)
    failed = [k for k, v in out["checks"].items() if not v]
    assert not failed, failed


def test_poisson_visser_closed_form_matches_sympy():
    st = symbolic_gr.thin_shell_stability()
    M, a0, beta2 = st["symbols"]
    for Mv, av, bv in [(1.0, 2.5, 0.3), (1.0, 4.0, -0.9), (0.0, 1.0, -0.2), (1.0, 10.0, 0.7)]:
        sym = float(st["d2V0"].subs({M: Mv, a0: av, beta2: bv}))
        assert abs(sym - dynamics.Vpp(av, Mv, bv)) < 1e-12 * max(1, abs(sym))
    crit = float(st["beta2_crit"].subs({M: 1.0, a0: 5.0}))
    assert abs(crit - dynamics.v2_critical(5.0, 1.0)) < 1e-12
