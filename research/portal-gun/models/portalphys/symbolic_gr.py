"""Symbolic general-relativity checks for the portal study (sympy).

Everything here is derived from the metric alone, so it is an independent check of
formulas quoted from the literature (Morris & Thorne 1988; Visser 1989; Poisson &
Visser 1995). Geometric units G = c = 1 and signature (-,+,+,+), Riemann convention
R^a_{bcd} = d_c Gamma^a_{db} - d_d Gamma^a_{cb} + Gamma^a_{ce} Gamma^e_{db} - Gamma^a_{de} Gamma^e_{cb}
(Misner, Thorne & Wheeler). Run as a script to print and save every result.
"""

from __future__ import annotations

import json
import pathlib

import sympy as sp

t, r, th, ph = sp.symbols("t r theta phi", real=True)
coords = (t, r, th, ph)
Phi = sp.Function("Phi")(r)   # redshift function
b = sp.Function("b")(r)       # shape function
beta = sp.symbols("beta", real=True)  # traveller speed / c, radial


def christoffel(g, x):
    ginv = sp.simplify(g.inv())
    n = len(x)
    Gam = [[[0] * n for _ in range(n)] for _ in range(n)]
    for a in range(n):
        for b_ in range(n):
            for c_ in range(n):
                Gam[a][b_][c_] = sp.simplify(
                    sum(ginv[a, d] * (sp.diff(g[d, c_], x[b_]) + sp.diff(g[d, b_], x[c_]) - sp.diff(g[b_, c_], x[d]))
                        for d in range(n)) / 2)
    return Gam


def riemann_lower(g, x):
    """R_{abcd} with all indices down."""
    n = len(x)
    Gam = christoffel(g, x)
    Rup = [[[[0] * n for _ in range(n)] for _ in range(n)] for _ in range(n)]
    for a in range(n):
        for b_ in range(n):
            for c_ in range(n):
                for d in range(n):
                    expr = sp.diff(Gam[a][d][b_], x[c_]) - sp.diff(Gam[a][c_][b_], x[d])
                    expr += sum(Gam[a][c_][e] * Gam[e][d][b_] - Gam[a][d][e] * Gam[e][c_][b_] for e in range(n))
                    Rup[a][b_][c_][d] = expr
    Rlo = [[[[sp.simplify(sum(g[a, e] * Rup[e][b_][c_][d] for e in range(n)))
              for d in range(n)] for c_ in range(n)] for b_ in range(n)] for a in range(n)]
    return Rlo, Rup


def einstein(g, x, Rup):
    n = len(x)
    ginv = g.inv()
    Ric = sp.Matrix(n, n, lambda b_, d: sp.simplify(sum(Rup[a][b_][a][d] for a in range(n))))
    Rs = sp.simplify(sum(ginv[i, j] * Ric[i, j] for i in range(n) for j in range(n)))
    return sp.simplify(Ric - g * Rs / 2), Ric, Rs


def morris_thorne():
    """Return orthonormal-frame curvature and stress-energy for the MT metric."""
    g = sp.diag(-sp.exp(2 * Phi), 1 / (1 - b / r), r**2, r**2 * sp.sin(th)**2)
    Rlo, Rup = riemann_lower(g, coords)
    Gmn, _, _ = einstein(g, coords, Rup)
    # orthonormal tetrad scale factors e_a = (1/sqrt|g_aa|) d_a (metric is diagonal)
    s = [sp.exp(-Phi), sp.sqrt(1 - b / r), 1 / r, 1 / (r * sp.sin(th))]

    def Rhat(a, b_, c_, d):
        return sp.simplify(Rlo[a][b_][c_][d] * s[a] * s[b_] * s[c_] * s[d])

    curv = {
        "R_trtr": Rhat(0, 1, 0, 1),
        "R_tthtth": Rhat(0, 2, 0, 2),
        "R_rthrth": Rhat(1, 2, 1, 2),
        "R_thphthph": Rhat(2, 3, 2, 3),
    }
    G_hat = {
        "G_tt": sp.simplify(Gmn[0, 0] * s[0]**2),
        "G_rr": sp.simplify(Gmn[1, 1] * s[1]**2),
        "G_thth": sp.simplify(Gmn[2, 2] * s[2]**2),
    }
    stress = {
        "rho": sp.simplify(G_hat["G_tt"] / (8 * sp.pi)),
        "tau": sp.simplify(-G_hat["G_rr"] / (8 * sp.pi)),   # radial tension = -p_r
        "p": sp.simplify(G_hat["G_thth"] / (8 * sp.pi)),
    }

    # Boosted (radially moving) orthonormal frame, built explicitly from the full
    # Riemann tensor rather than by quoting a boost formula.
    gam = 1 / sp.sqrt(1 - beta**2)
    # coordinate components of the static tetrad vectors
    E = [sp.Matrix([s[0], 0, 0, 0]), sp.Matrix([0, s[1], 0, 0]),
         sp.Matrix([0, 0, s[2], 0]), sp.Matrix([0, 0, 0, s[3]])]
    e0p = gam * (E[0] + beta * E[1])
    e1p = gam * (E[1] + beta * E[0])
    e2p = E[2]

    def R4(A, B, C, D):
        tot = 0
        for a in range(4):
            if A[a] == 0:
                continue
            for b_ in range(4):
                if B[b_] == 0:
                    continue
                for c_ in range(4):
                    if C[c_] == 0:
                        continue
                    for d in range(4):
                        if D[d] == 0:
                            continue
                        tot += Rlo[a][b_][c_][d] * A[a] * B[b_] * C[c_] * D[d]
        return sp.simplify(tot)

    boosted = {
        "R_0p1p0p1p": R4(e0p, e1p, e0p, e1p),
        "R_0p2p0p2p": R4(e0p, e2p, e0p, e2p),
    }
    return g, curv, stress, boosted


def published_forms():
    """Expressions exactly as printed by Morris & Thorne (1988), G = c = 1.

    Eqs. 17-19:  rho = b'/(8 pi r^2),  tau = [b/r - 2(r-b)Phi']/(8 pi r^2),
                 p = (r/2)[(rho - tau)Phi' - tau'] - tau
    Eq. 47a:     R_{1'0'1'0'} = -(1-b/r)[-Phi'' + (b'r-b)/(2r(r-b)) Phi' - Phi'^2]
    Eq. 47b:     R_{2'0'2'0'} = gamma^2/(2r^2) [beta^2 (b' - b/r) + 2(r-b)Phi']
    """
    bp = sp.diff(b, r)
    Pp = sp.diff(Phi, r)
    rho = bp / (8 * sp.pi * r**2)
    tau = (b / r - 2 * (r - b) * Pp) / (8 * sp.pi * r**2)
    p = (r / 2) * ((rho - tau) * Pp - sp.diff(tau, r)) - tau
    gam2 = 1 / (1 - beta**2)
    Rrad = -(1 - b / r) * (-sp.diff(Phi, r, 2) + (bp * r - b) / (2 * r * (r - b)) * Pp - Pp**2)
    Rlat = gam2 / (2 * r**2) * (beta**2 * (bp - b / r) + 2 * (r - b) * Pp)
    return rho, tau, p, Rrad, Rlat


def thin_shell():
    """Darmois-Israel thin shell joining two Schwarzschild exteriors of mass M at r = a(tau).

    Derives K^tau_tau and K^theta_theta from the worldline of the shell, then the
    surface energy density sigma and surface pressure P via the Lanczos equations.
    """
    M = sp.symbols("M", nonnegative=True)
    tau_ = sp.symbols("tau", real=True)
    a = sp.Function("a")(tau_)
    f = 1 - 2 * M / r
    g = sp.diag(-f, 1 / f, r**2, r**2 * sp.sin(th)**2)
    Gam = christoffel(g, coords)
    ad = sp.diff(a, tau_)
    add = sp.diff(a, tau_, 2)
    fa = f.subs(r, a)
    tdot = sp.sqrt(fa + ad**2) / fa                  # from -f tdot^2 + adot^2/f = -1
    u = [tdot, ad, 0, 0]
    # outward unit normal (covariant), n.u = 0, n.n = +1
    n_cov = [-ad, tdot, 0, 0]
    # 4-acceleration a^mu = du^mu/dtau + Gamma^mu_ab u^a u^b
    acc = []
    for mu in range(4):
        expr = sp.diff(u[mu], tau_) if u[mu] != 0 else 0
        expr += sum(Gam[mu][al][be].subs(r, a) * u[al] * u[be] for al in range(4) for be in range(4))
        acc.append(sp.simplify(expr))
    K_tautau = sp.simplify(-sum(n_cov[mu] * acc[mu] for mu in range(4)))   # K_ab = -n_mu (a^mu) for the tau tau part
    K_thth = sp.simplify(-n_cov[1] * Gam[1][2][2].subs(r, a))               # -n_r Gamma^r_{theta theta}
    Kup_tautau = sp.simplify(-K_tautau)           # raise with h^{tau tau} = -1
    Kup_thth = sp.simplify(K_thth / a**2)
    # symmetric construction: jump [K] = 2 K
    sigma = sp.simplify(-(1 / (4 * sp.pi)) * 2 * Kup_thth)
    P = sp.simplify((1 / (8 * sp.pi)) * (2 * Kup_tautau + 2 * Kup_thth))
    expected_sigma = -sp.sqrt(1 - 2 * M / a + ad**2) / (2 * sp.pi * a)
    expected_P = (1 - M / a + ad**2 + a * add) / (4 * sp.pi * a * sp.sqrt(1 - 2 * M / a + ad**2))
    return {
        "M": M, "a": a,
        "Kup_tautau": Kup_tautau, "Kup_thth": Kup_thth,
        "sigma": sigma, "P": P,
        "sigma_matches_visser": sp.simplify(sigma - expected_sigma) == 0,
        "P_matches_visser": sp.simplify(sp.simplify(P - expected_P)) == 0,
    }


def thin_shell_stability():
    """Linear stability of a static Schwarzschild thin-shell wormhole (Poisson & Visser 1995).

    Equation of motion from sigma(a): adot^2 + V(a) = 0 with
    V(a) = 1 - 2M/a - (2 pi a sigma(a))^2, and sigma(a) evolving by the conservation law
    d sigma / d a = -(2/a)(sigma + P), with a linearised equation of state
    P(sigma) = P0 + beta2 (sigma - sigma0) about the static solution.
    Returns V''(a0) and the critical beta^2 where V''(a0) = 0.
    """
    M, a0, beta2 = sp.symbols("M a0 beta2", positive=True)
    s0 = -sp.sqrt(1 - 2 * M / a0) / (2 * sp.pi * a0)
    P0 = (1 - M / a0) / (4 * sp.pi * a0 * sp.sqrt(1 - 2 * M / a0))
    # Use derivatives evaluated at a0 via the chain rule (no need to solve for sigma(a)).
    sig, Pv, a_ = sp.symbols("sigma P a", real=True)
    V = 1 - 2 * M / a_ - (2 * sp.pi * a_ * sig)**2
    dsig = -(2 / a_) * (sig + Pv)          # d sigma/da
    dP = beta2 * dsig                      # dP/da
    dV = sp.diff(V, a_) + sp.diff(V, sig) * dsig
    d2V = sp.diff(dV, a_) + sp.diff(dV, sig) * dsig + sp.diff(dV, Pv) * dP
    subs = {a_: a0, sig: s0, Pv: P0}
    V0 = sp.simplify(V.subs(subs))
    dV0 = sp.simplify(dV.subs(subs))
    d2V0 = sp.simplify(d2V.subs(subs))
    beta2_crit = sp.simplify(sp.solve(sp.Eq(d2V0, 0), beta2)[0])
    return {"V0": V0, "dV0": dV0, "d2V0": d2V0, "beta2_crit": beta2_crit, "symbols": (M, a0, beta2)}


def main(out_dir: pathlib.Path | None = None):
    out = {}
    g, curv, stress, boosted = morris_thorne()
    rho_p, tau_p, p_p, Rrad_p, Rlat_p = published_forms()
    out["mt_curvature_orthonormal"] = {k: sp.sstr(v) for k, v in curv.items()}
    out["mt_stress_energy"] = {k: sp.sstr(v) for k, v in stress.items()}
    out["mt_boosted"] = {k: sp.sstr(v) for k, v in boosted.items()}
    checks = {
        "rho == MT88": sp.simplify(stress["rho"] - rho_p) == 0,
        "tau == MT88": sp.simplify(stress["tau"] - tau_p) == 0,
        "p == MT88 (conservation form)": sp.simplify(stress["p"] - p_p) == 0,
        "R_1'0'1'0' == MT88 eq. 47a exactly":
            sp.simplify(boosted["R_0p1p0p1p"] - Rrad_p) == 0,
        "R_1'0'1'0' boost invariant": sp.simplify(boosted["R_0p1p0p1p"] - curv["R_trtr"]) == 0,
        "R_2'0'2'0' == MT88 eq. 47b exactly":
            sp.simplify(boosted["R_0p2p0p2p"] - Rlat_p) == 0,
    }
    # Schwarzschild limit: Phi = (1/2) ln(1-2M/r), b = 2M must reproduce MTW eq. 31.4
    M = sp.symbols("M", positive=True)
    schw = {Phi: sp.log(1 - 2 * M / r) / 2, b: 2 * M}

    def sub_s(e):
        return sp.simplify(e.subs(schw).doit())
    out["schwarzschild_limit"] = {k: sp.sstr(sub_s(v)) for k, v in curv.items()}
    checks["Schwarzschild R_trtr = -2M/r^3 (MTW 31.4)"] = sp.simplify(sub_s(curv["R_trtr"]) + 2 * M / r**3) == 0
    checks["Schwarzschild R_tthtth = +M/r^3 (MTW 31.4)"] = sp.simplify(sub_s(curv["R_tthtth"]) - M / r**3) == 0
    checks["Schwarzschild G_ab = 0"] = all(sub_s(v) == 0 for v in stress.values())

    # Ellis (zero tidal force, Phi = 0, b = r0^2/r)
    r0 = sp.symbols("r0", positive=True)
    ellis = {Phi: 0, b: r0**2 / r}

    def sub_e(e):
        return sp.simplify(e.subs(ellis).doit())
    out["ellis_stress_energy"] = {k: sp.sstr(sub_e(v)) for k, v in stress.items()}
    out["ellis_boosted"] = {k: sp.sstr(sub_e(v)) for k, v in boosted.items()}
    checks["Ellis rho = -r0^2/(8 pi r^4)"] = sp.simplify(sub_e(stress["rho"]) + r0**2 / (8 * sp.pi * r**4)) == 0
    checks["Ellis tau = +r0^2/(8 pi r^4)"] = sp.simplify(sub_e(stress["tau"]) - r0**2 / (8 * sp.pi * r**4)) == 0
    checks["Ellis p = +r0^2/(8 pi r^4)"] = sp.simplify(sub_e(stress["p"]) - r0**2 / (8 * sp.pi * r**4)) == 0
    lat = sub_e(boosted["R_0p2p0p2p"])
    checks["Ellis lateral R_0'2'0'2' = -beta^2 gamma^2 r0^2/r^4"] = sp.simplify(lat + beta**2 * r0**2 / ((1 - beta**2) * r**4)) == 0
    checks["Ellis radial tidal = 0"] = sub_e(boosted["R_0p1p0p1p"]) == 0
    # General throat result: tau(r0) = 1/(8 pi r0^2) whenever b(r0) = r0 and Phi finite.
    tau_throat = sp.simplify(stress["tau"].subs(b, r).subs(r, r0))
    out["tau_at_throat"] = sp.sstr(tau_throat)
    checks["tau(throat) = 1/(8 pi r0^2)"] = sp.simplify(tau_throat - 1 / (8 * sp.pi * r0**2)) == 0
    # Exoticity at the throat: rho - tau = (b' - 1)/(8 pi r0^2) < 0 whenever b'(r0) < 1 (flare-out)
    bp0 = sp.symbols("bprime0", real=True)
    exot = sp.simplify((bp0 / (8 * sp.pi * r0**2)) - tau_throat)
    out["rho_minus_tau_at_throat"] = sp.sstr(exot)

    ts = thin_shell()
    out["thin_shell"] = {
        "K^tau_tau": sp.sstr(ts["Kup_tautau"]), "K^theta_theta": sp.sstr(ts["Kup_thth"]),
        "sigma": sp.sstr(ts["sigma"]), "P": sp.sstr(ts["P"]),
    }
    checks["thin shell sigma == Visser 1989"] = bool(ts["sigma_matches_visser"])
    checks["thin shell P == Visser 1989"] = bool(ts["P_matches_visser"])

    st = thin_shell_stability()
    out["thin_shell_stability"] = {k: sp.sstr(v) for k, v in st.items() if k != "symbols"}
    checks["static solution: V(a0) = 0"] = sp.simplify(st["V0"]) == 0
    checks["static solution: V'(a0) = 0"] = sp.simplify(st["dV0"]) == 0

    out["checks"] = {k: bool(v) for k, v in checks.items()}
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "symbolic_gr.json").write_text(json.dumps(out, indent=2))
    return out, st


if __name__ == "__main__":
    here = pathlib.Path(__file__).resolve().parents[2]
    res, st = main(here / "results")
    for k, v in res["checks"].items():
        print(f"[{'PASS' if v else 'FAIL'}] {k}")
    print("\nOrthonormal curvature (MT metric):")
    for k, v in res["mt_curvature_orthonormal"].items():
        print(f"  {k} = {v}")
    print("\nBoosted frame:")
    for k, v in res["mt_boosted"].items():
        print(f"  {k} = {v}")
    print("\nThin shell:", res["thin_shell"])
    print("\nPoisson-Visser V''(a0) =", res["thin_shell_stability"]["d2V0"])
    print("critical beta^2 =", res["thin_shell_stability"]["beta2_crit"])
