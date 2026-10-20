"""Linearised Einstein-phantom-scalar equations about the Ellis-Bronnikov wormhole.

Metric ds^2 = -e^{2a} dt^2 + e^{2c} dx^2 + R^2 dOmega^2, scalar phi, G = c = 1,
T_ab = -(d_a phi d_b phi - g_ab (d phi)^2 / 2) (phantom).  Background a = c = 0,
R0 = sqrt(x^2 + b^2), phi0 = arctan(x/b) / (2 sqrt(pi)).  Gauge: delta-phi = 0.

derive() returns the background residuals (all zero) and the linear parts of the tt, tx, xx,
thth components of G_ab - 8 pi T_ab and of the scalar equation.  reduce() substitutes the
constraint solutions delta-c = dR'/R0', delta-a = delta-c - 2 dR/R0 and returns
(tt residual, xx residual, master-equation residual), which should all be zero for
    dR_tt = dR_xx - (2/x) dR_x + (2 x^2 + b^2)/(x^2 + b^2)^2 dR.
"""
import sympy as sp


def derive():
    t, x, th, ph, eps = sp.symbols("t x theta phi epsilon", real=True)
    b = sp.Symbol("b", positive=True)
    da, dc, dR = (sp.Function(n)(t, x) for n in ("da", "dc", "dR"))
    R0 = sp.sqrt(x**2 + b**2)
    phi0 = sp.atan(x / b) / (2 * sp.sqrt(sp.pi))
    a, c, R, phi = eps * da, eps * dc, R0 + eps * dR, phi0
    X = [t, x, th, ph]
    n = 4
    g = sp.diag(-sp.exp(2 * a), sp.exp(2 * c), R**2, R**2 * sp.sin(th) ** 2)
    ginv = sp.diag(-sp.exp(-2 * a), sp.exp(-2 * c), 1 / R**2, 1 / (R**2 * sp.sin(th) ** 2))
    Gam = [[[sum(ginv[A, D] * (sp.diff(g[D, B], X[C]) + sp.diff(g[D, C], X[B]) - sp.diff(g[B, C], X[D]))
                 for D in range(n)) / 2 for C in range(n)] for B in range(n)] for A in range(n)]

    def ric(B, D):
        e = 0
        for A in range(n):
            e += sp.diff(Gam[A][D][B], X[A]) - sp.diff(Gam[A][A][B], X[D])
            for E in range(n):
                e += Gam[A][A][E] * Gam[E][D][B] - Gam[A][D][E] * Gam[E][A][B]
        return e

    Rc = sp.Matrix(n, n, lambda B, D: ric(B, D))
    Rs = sum(ginv[A, A] * Rc[A, A] for A in range(n))
    Ein = Rc - g * Rs / 2
    dphi = [sp.diff(phi, v) for v in X]
    kin = sum(ginv[A, A] * dphi[A] ** 2 for A in range(n))
    T = sp.Matrix(n, n, lambda A, B: -(dphi[A] * dphi[B] - g[A, B] * kin / 2))
    out = {}
    for (A, B, name) in [(0, 0, "tt"), (0, 1, "tx"), (1, 1, "xx"), (2, 2, "thth")]:
        e = Ein[A, B] - 8 * sp.pi * T[A, B]
        out[name] = (sp.simplify(e.subs(eps, 0)), sp.simplify(sp.diff(e, eps).subs(eps, 0)))
    sqrtg = sp.exp(a + c) * R**2 * sp.sin(th)
    box = sum(sp.diff(sqrtg * ginv[A, A] * dphi[A], X[A]) for A in range(n)) / sqrtg
    out["scalar"] = (sp.simplify(box.subs(eps, 0)), sp.simplify(sp.diff(box, eps).subs(eps, 0)))
    return out, (t, x, b, da, dc, dR, R0)


def reduce():
    eqs, (t, x, b, da, dc, dR, R0) = derive()
    dc_sol = sp.diff(dR, x) / sp.diff(R0, x)
    da_sol = dc_sol - 2 * dR / R0
    subs = {dc: dc_sol, da: da_sol}

    def apply(e):
        return sp.simplify(e.subs(subs).doit())

    tx = apply(eqs["tx"][1])
    scal = apply(eqs["scalar"][1])
    tt = apply(eqs["tt"][1])
    xx = apply(eqs["xx"][1])
    master = (sp.diff(dR, t, 2) - sp.diff(dR, x, 2) + 2 / x * sp.diff(dR, x)
              - (2 * x**2 + b**2) / (x**2 + b**2) ** 2 * dR)
    # xx should be proportional to the master equation: check the ratio is independent of dR
    ratio = sp.simplify(xx / master)
    return {"background": [v[0] for v in eqs.values()], "tx": tx, "scalar": scal, "tt": tt,
            "xx_over_master": ratio}


if __name__ == "__main__":
    r = reduce()
    for k, v in r.items():
        print(k, ":", v)
