"""Run every phase II calculation, write results/*.json and figures/*.png.

    python run_phase2.py            # everything except the parametric-drive PDE scan (106-111 s measured)
    python run_phase2.py --full     # also re-runs that scan (kapitza_scan.json); the same loop took
                                    # 55 s from the command line; --full itself was not run in phase II

Results are written to ../results and figures to ../figures.
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from portal2 import audit, charged, chronology as ch, energy as en, families as fam, feasibility as fz
from portal2 import qi, search, stability as st, tides
from portal2.constants import c, G, g0, l_P, M_jup, day, year

ROOT = Path(__file__).resolve().parent.parent
RES, FIG = ROOT / "results", ROOT / "figures"
RES.mkdir(exist_ok=True)
FIG.mkdir(exist_ok=True)
F = 0.01
REF = (4 * np.pi / 3) * F**4 / l_P**2
# Okabe-Ito order validated with the dataviz palette checker (CVD-safe adjacent pairs);
# orange and purple fall below 3:1 contrast, so every series also gets a marker and a label.
PAL = ["#0072B2", "#D55E00", "#009E73", "#E69F00", "#CC79A7"]
INK, MUTED = "#1d2329", "#5b6670"
plt.rcParams.update({"font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
                     "xtick.color": MUTED, "ytick.color": MUTED, "axes.grid": True,
                     "grid.color": "#e3e6e9", "grid.linewidth": 0.6, "lines.linewidth": 2,
                     "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False})


def save(name, obj):
    (RES / name).write_text(json.dumps(obj, indent=1, default=float))


# ------------------------------------------------------------------ quantum inequalities

def run_qi():
    out = {"f": F, "D_ref_r0_1m": REF}
    eps_list = [2.0, 0.5, 0.2, 0.05, 0.01, 0.003, 0.001]
    rows = []
    for eps in eps_list:
        g = fam.ellis(1.0) if eps == 2.0 else fam.two_scale(1.0, eps, max(20.0, 4.0 / eps))
        G_ = np.geomspace(1 + 1e-6, 1e5, 3000)
        t = qi.local_deficit(g, np.zeros_like(G_), G_, F)
        if eps == 2.0:
            t0 = qi.local_deficit(g, 0.0, 1.0, F)
            if t0["D"][0] > t["D"].max():
                t = {k: np.concatenate([t0[k], t[k]]) for k in t}
        j = int(np.argmax(t["D"]))
        Da, xa = qi.throat_deficit_analytic(eps, 0.0, F, 1.0)
        rows.append({"eps": eps, "family": g.name, "D_numeric_over_ref": t["D"][j] / REF,
                     "gamma_at_max": t["gamma"][j], "gamma_predicted": np.sqrt(max(2 / eps, 1.0)),
                     "D_analytic_over_ref": Da / REF, "L0": t["L0"][j], "d": t["d"][j]})
    out["throat_vs_flare_out"] = rows
    a_list = [0.3, 0.2, 0.1, 0.05, 0.02, 0.01]
    band = []
    for a in a_list:
        best, _ = qi.scan(fam.Compact(1.0, a), F, l_extent=3.0)
        tc = tides.crossing(fam.Compact(1.0, a), 1.0)
        band.append({"a": a, "D_over_ref": best["D"] / REF, "dv_th_m_s": tc["dv_th"],
                     "a_th_peak_g": tc["a_th_max"] / g0, "E_static_r0": en.integrated_energy(fam.Compact(1.0, a))})
    small = [b for b in band if b["a"] <= 0.05]
    slope = np.polyfit(np.log([b["a"] for b in small]), np.log([b["D_over_ref"] for b in small]), 1)[0]
    out["thin_region"] = {"rows": band, "fitted_exponent": slope,
                          "a_at_D_1_m": fz.numbers()["a_band_m"], "rho_band_J_m3": fz.numbers()["rho_band_J_m3"]}
    # Ellis tail
    g = fam.ellis(1.0)
    ls = np.array([0.0, 1.0, 3.0, 10.0, 30.0])
    tail = qi.local_deficit(g, ls, np.ones_like(ls), F)
    out["ellis_tail"] = [{"l": float(l), "D_over_ref": float(d / REF)} for l, d in zip(ls, tail["D"])]
    # redshift structures
    reds = []
    for (phi, w) in [(-1.0, 1.0), (-3.0, 0.5), (0.01, 0.01), (2.0, 0.3)]:
        geom = fam.Compact(1.0, 1.0, phi, w)
        best, _ = qi.scan(geom, F, l_extent=4.0)
        vmin = tides.min_v_inf(geom)
        rec = {"phi_a": phi, "w": w, "D_over_ref": best["D"] / REF, "v_inf_min": vmin}
        if vmin < 0.99 * c:
            tc = tides.crossing(geom, max(1.0, 1.001 * vmin))
            rec.update({"beta_max": tc["beta_max"], "a_r_peak_g": tc["a_r_max"] / g0, "a_th_peak_g": tc["a_th_max"] / g0})
        reds.append(rec)
    out["redshift_structures"] = reds
    # stage B: the two window prescriptions on the Morris-Thorne thin band (static observer at the
    # throat is the worst case under both), and the flare-out b'(r0) = 1 case
    win = []
    pos = np.geomspace(1e-5, 3.0, 300)
    lg = np.concatenate([-pos[::-1], [0.0], pos])
    for a in (0.03, 0.01, 0.003, 0.001):
        g = fam.ThinBand(1.0, a)
        win.append({"a": a,
                    "D_fr96_throat": float(qi.local_deficit(g, 0.0, 1.0, F, "fr96")["D"][0]),
                    "D_fr96_analytic": (32 * np.pi / 3) * F**4 * a**3 / l_P**2,
                    "D_curvature_selfconsistent_max": float(qi.static_deficit_curvature_window(g, lg, F)["D"].max()),
                    "D_curvature_analytic": (8 * np.pi / 3) * F**4 * a / l_P**2})
    nb = fz.numbers()
    out["window_comparison"] = {"thin_band": win, "a_star_fr96_m": nb["a_band_m"],
                                "a_star_curvature_m": nb["a_band_curvature_window_m"],
                                "a_star_curvature_in_l_P": nb["a_band_curvature_window_m"] / l_P}
    zero = []
    for Lz in (1.0, 3.0, 10.0):
        g = fam.two_scale(1.0, 0.0, Lz)
        gam = np.geomspace(1 + 1e-6, 1e6, 400)
        best, _ = qi.scan(g, F, l_extent=4 * Lz)
        zero.append({"L": Lz, "D_max_at_throat_over_ref": float(qi.local_deficit(g, np.zeros_like(gam), gam, F)["D"].max() / REF),
                     "D_max_over_ref": best["D"] / REF, "l_at_max": best["l"], "gamma_at_max": best["gamma"],
                     "r_at_max": float(g.local(np.array([best["l"]]))[0][0])})
    out["zero_flare_out_at_throat"] = zero
    # scope of the throat theorem: a shallow redshift dip at a gentle throat (eps = 0.01)
    dips = []
    for P2 in (0.0, 0.0025, 0.01, 0.1):
        g = fam.two_scale_redshift(1.0, 0.01, 400.0, P2, 3.0)
        gam = np.geomspace(1 + 1e-6, 1e5, 3000)
        t = qi.local_deficit(g, np.zeros_like(gam), gam, F)
        j = int(np.argmax(t["D"]))
        best, _ = qi.scan(g, F, l_extent=9.0)
        dips.append({"Phi2_r0sq": P2, "dip_depth": P2 * 9.0 / 2, "D_throat_over_ref": float(t["D"][j] / REF),
                     "d_t_at_throat_max": float(t["d_t"][j]), "D_scan_max_over_ref": best["D"] / REF,
                     "l_at_scan_max": best["l"]})
    out["redshift_dip_at_gentle_throat"] = dips
    out["analytic"] = {k: v for k, v in nb.items()}
    save("qi_results.json", out)
    return out


# ------------------------------------------------------------------ charged wormholes near extremality

def run_charged():
    crit = []
    for q in (0.5, 0.9, 0.95, 0.99, 0.999, 0.9999):
        p = charged.critical_at(q)
        crit.append({"Q_over_rT": q, "M_over_rT": p["M"] / p["r_T"], "G_throat": p["G_throat"],
                     "Delta_Phi": 0.5 * np.log(p["G_throat"]), "gamma_from_rest": charged.crossing_gamma(p["G_throat"])})
    sym = []
    for mu in (0.5, 0.9, 0.99, 0.999, 0.9999):
        p = charged.supercritical_symmetric(mu)
        sym.append({"Q_over_rT": mu, "M_over_rT": p["M"] / p["r_T"], "G_throat": p["G_throat"],
                    "gamma_from_rest": charged.crossing_gamma(p["G_throat"])})
    out = {"source": "background of Gonzalez, Guzman & Sarbach 2009 as written in Blazquez-Salcedo et al. 2026, eqs. 2-7",
           "critical": crit, "supercritical_symmetric": sym, "fields_rT_1m_extremal": charged.field_limits(1.0),
           "tau0_rT_1m_s": {"Q_over_rT_0.95": charged.tau0_scaled(0.13, 1e4, 1.0),
                            "Q_over_rT_0.9999": charged.tau0_scaled(1.1 * year, 1e4, 1.0)},
           "tau0_reference": "critical wormhole, r_T = 10 km: 0.13 s at 0.95, about 1.1 yr at 0.9999 (Blazquez-Salcedo et al. 2026)"}
    save("charged_results.json", out)
    return out


# ------------------------------------------------------------------ energy

def run_energy():
    rows = []
    for g in [fam.ellis(1.0), fam.gen_ellis(1.0, 4), fam.Compact(1.0, 1.0), fam.Compact(1.0, 0.01),
              fam.Compact(1.0, 1.0, -0.5, 1.0), fam.two_scale(1.0, 0.01, 400.0)]:
        E = en.integrated_energy(g)
        d, i = en.anec_radial(g)
        rows.append({"family": g.name, "E_static_r0": E, "E_static_MJ_for_1m": en.to_kg(E) / M_jup,
                     "tolman": en.tolman_mass(g), "anec_direct": d, "anec_identity": i,
                     "anec_J_m2_for_1m": en.to_J_per_m2(d)})
    out = {"families": rows,
           "closed_forms": {"ellis_E": en.ellis_static_energy(1.0), "ellis_anec": en.ellis_anec(1.0),
                            "thin_shell_E_M0": en.thin_shell_energy(1.0)[0],
                            "flat_face_rim": en.flat_face_rim(1.0)[:2],
                            "misner_sharp_per_side_kg_1m": -c**2 / (2 * G)}}
    save("energy_results.json", out)
    return out


# ------------------------------------------------------------------ stability

def run_stability(full=False):
    out = {}
    out["shooting"] = st.growth_rate_shooting()
    out["fd"] = [{"N": N, "s": st.growth_rate_matrix(N=N, X=60.0)[0]} for N in (500, 1000, 2000, 4000)]
    out["chebyshev"] = [{"N": N, "s": st.growth_rate_chebyshev(N=N, X=30.0)} for N in (100, 140, 180, 220)]
    ts, rec = st.evolve(T=40.0)
    out["time_domain"] = {"N": 3000, "s": st.fit_growth(ts, rec, 20.0)}
    s = out["shooting"][0]
    out["efold_ns_1m"] = 1 / s / c * 1e9
    out["uncontrolled_lifetime_planck_seed_r0_over_c"] = np.log(1 / l_P) / s
    out["traveller_collapse_ns_70kg_1m"] = np.log(c**2 / (G * 70)) / s / c * 1e9
    a0s = np.concatenate([np.linspace(2.02, 2.98, 49), np.linspace(3.02, 20, 50)])
    out["thin_shell"] = [{"a0_over_M": float(a), "beta2_crit": st.thin_shell_beta2_critical(a, 1.0)[0],
                          "stable_above": bool(st.thin_shell_beta2_critical(a, 1.0)[1] > 0)} for a in a0s]
    out["thin_shell_min_upper_branch"] = 1.5 + np.sqrt(3)
    from scipy.optimize import minimize
    rows = []
    for x in (1.0, 1.3, 1.38, 1.41, 1.414, 1.42, 1.45, 1.6):
        f = lambda p: st.dde_rightmost_root(1.0, np.exp(p[0]), np.exp(p[1]), x, n=30)
        r = min((minimize(f, x0, method="Nelder-Mead", options={"xatol": 1e-7, "fatol": 1e-10, "maxiter": 4000})
                 for x0 in [(0.3, 0.4), (0.05, 0.35)]), key=lambda q: q.fun)
        rows.append({"s_tau": x, "best_rightmost_root": r.fun, "K_over_s2": float(np.exp(r.x[0])), "D_over_s": float(np.exp(r.x[1]))})
    out["pd_delay"] = rows
    out["kapitza_single_mode"] = [{"Omega_over_s": r, "a_threshold": st.kapitza_threshold(s, r * s),
                                   "averaging_estimate": np.sqrt(2) * s * r * s} for r in (3, 5, 10, 20, 40)]
    if full:
        scan = []
        for prof, w in [("gauss", 0.5), ("gauss", 1.0), ("gauss", 2.0), ("gauss", 4.0), ("V1", None)]:
            for Om_r in (5.0, 10.0, 20.0):
                for a in np.geomspace(1, 400, 16):
                    t_, r_ = st.evolve_parametric(a, Om_r * s, U_width=w or 1.0, T=25.0, profile=prof)
                    scan.append((prof, w, Om_r, float(a), float(np.polyfit(t_[t_ > 12], np.log(r_[t_ > 12]), 1)[0])))
        (RES / "kapitza_scan.json").write_text(json.dumps(scan))
    out["kapitza_pde_scans"] = ["kapitza_scan.json", "kapitza_scan_extreme.json", "kapitza_refine.json"]
    save("stability_results.json", out)
    return out


# ------------------------------------------------------------------ chronology scenarios

def run_chronology():
    U = lambda x: g0 * x[2]
    sc = []

    def pair(name, pa, pb, Ufun, t_max, note, n=4001):
        net = ch.Network([ch.Mouth("a", lambda t: np.asarray(pa, float), Ufun),
                          ch.Mouth("b", lambda t: np.asarray(pb, float), Ufun)], [ch.Link(0, 1)])
        T, _, _ = ch.first_ctc_time(net, t_max, n=n)
        sc.append({"scenario": name, "years": None if T is None else T / year, "note": note})

    pair("Floor and ceiling (2.5 m)", (0, 0, 0), (0, 0, 2.5), U, 2 * year, "any height: c/g")
    pair("Gun at 1.2 m, wall mouth 10 m away at 1.5 m", (0, 0, 1.2), (10, 0, 1.5), U, 100 * year, "")
    pair("Home and office, 20 km apart, 100 m height difference", (0, 0, 0), (20e3, 0, 100), U, 1000 * year, "")
    pair("Valley and mountain top, 10 km apart, 3 km higher", (0, 0, 0), (10e3, 0, 3000), U, 20 * year, "")
    GM, R = 3.986004e14, 6.371e6
    # orbiting / distant cases from constant rates (closed form; minimum light-time distance)
    def const(name, rate, dmin, note):
        sc.append({"scenario": name, "years": dmin / c / abs(rate) / year, "rate": rate, "note": note})
    v_leo = np.sqrt(GM / (R + 4e5))
    const("Ground and space station (400 km, 7.67 km/s)", (GM / R - GM / (R + 4e5) - v_leo**2 / 2) / c**2, 4e5,
          "at closest approach; velocity term dominates")
    U_e, U_m = -GM / R, -GM / 3.844e8 - 4.9048695e12 / 1.7374e6
    const("Earth surface and Moon surface", (U_m - 1.022e3**2 / 2 - U_e) / c**2, 3.844e8 - R - 1.7374e6, "")
    GMs, AU = 1.32712440018e20, 1.495978707e11
    rate_mars = ((-GMs / (1.524 * AU) - 24.07e3**2 / 2 - 4.282837e13 / 3.3895e6)
                 - (-GMs / AU - 29.78e3**2 / 2 - GM / R)) / c**2
    const("Earth and Mars (surface to surface)", rate_mars, 0.524 * AU, "at opposition")
    const("Sun-neighbour star (4.37 ly, 25 km/s relative)", (25e3) ** 2 / 2 / c**2, 4.37 * c * year, "velocity term only")
    out = {"scenarios": sc, "launched_mouth_margin": [{"beta": b, "margin_fraction": ch.launched_mouth_margin(b)}
                                                      for b in (0.01, 0.1, 0.5, 0.9, 0.99, 0.999)]}
    save("chronology_results.json", out)
    return out


# ------------------------------------------------------------------ feasibility, milestones, audit

def run_framework():
    archs = fz.architectures()
    table = fz.comparison_table(archs)
    detail = [{"key": a.key, "name": a.name, "portal": a.meets_portal_definition, "description": a.description,
               "reqs": [r.__dict__ for r in a.ordered()]} for a in archs]
    ms = fz.milestones()
    save("feasibility.json", {"table": table, "architectures": detail, "numbers": fz.numbers(),
                              "milestones": [m.__dict__ for m in ms], "acyclic": fz.is_acyclic(ms)})
    (RES / "milestones.mmd").write_text(fz.mermaid(ms))
    save("audit_ledger.json", audit.ledger())
    return table


# ------------------------------------------------------------------ figures

def figures(qir, stab, chron):
    # F1: throat deficit vs flare-out, and thin-region law
    fig, ax = plt.subplots(1, 2, figsize=(9.2, 3.6))
    rows = qir["throat_vs_flare_out"]
    e = [r["eps"] for r in rows]
    ax[0].semilogx(e, [r["D_analytic_over_ref"] for r in rows], color=PAL[0], label="analytic (smooth throat)")
    ax[0].semilogx(e, [r["D_numeric_over_ref"] for r in rows], "o", color=PAL[1], ms=6, label="numerical audit")
    ax[0].set_xlabel("flare-out at the throat, 1 - b'(r0)")
    ax[0].set_ylabel("worst QI deficit / (4π/3) f⁴ (r0/lP)²")
    ax[0].set_ylim(0, 1.3)
    ax[0].set_title("Gentler flare-out does not help", fontsize=10, color=INK, loc="left")
    for r in rows:
        if r["D_numeric_over_ref"] < 0.6:
            ax[0].annotate("geometry varies faster than r0", (r["eps"], r["D_numeric_over_ref"]),
                           xytext=(0.02, 0.45), fontsize=8, color=MUTED,
                           arrowprops={"arrowstyle": "-", "color": MUTED, "lw": 0.6})
    ax[0].legend(loc="lower left")
    b = qir["thin_region"]["rows"]
    aa = np.array([x["a"] for x in b])
    ax[1].loglog(aa, [x["D_over_ref"] for x in b], "s", color=PAL[2], ms=6, label="compact throat, exotic region of width a")
    k0 = b[-1]["D_over_ref"] / b[-1]["a"] ** 3
    ax[1].loglog(aa, k0 * aa**3, color=PAL[0], lw=1.2, label="∝ (a/r0)³")
    ax[1].set_xlabel("width of the exotic region, a / r0")
    ax[1].set_ylabel("worst QI deficit / smooth-throat value")
    ax[1].set_title(f"Thin exotic region: deficit ∝ a³ (fit {qir['thin_region']['fitted_exponent']:.2f} for a ≤ 0.05 r0)", fontsize=10, color=INK, loc="left")
    ax[1].legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(FIG / "p2_fig1_qi_throat.png", dpi=160)
    plt.close(fig)

    # F2: the length scale the QI forces, versus throat radius
    r0 = np.geomspace(1e-30, 1e3, 200)
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    a_band = (3 * r0 * l_P**2 / (32 * np.pi * F**4)) ** (1 / 3)
    ax.loglog(r0, a_band, color=PAL[2], label="thin band: allowed thickness")
    ax.loglog(r0, np.full_like(r0, np.sqrt(3 / (8 * np.pi)) * l_P / F**2), "--", color=PAL[1], label="flat-face rim: allowed core radius")
    ax.loglog(r0, np.sqrt(l_P * r0), ":", color=PAL[4], label="pulsed throat: c × allowed open time")
    ax.loglog(r0, r0, color=MUTED, lw=1, label="throat radius")
    ax.axvline(0.49 * l_P / F**2, color=PAL[0], lw=1.2)
    ax.text(0.49 * l_P / F**2 * 1.6, 1e-3, "largest smooth throat\nallowed (f = 0.01)", color=PAL[0], fontsize=8.5)
    ax.axhline(l_P, color=MUTED, lw=0.8)
    ax.text(1e-29, l_P * 2, "Planck length", color=MUTED, fontsize=8.5)
    ax.set_xlabel("throat radius r0 (m)")
    ax.set_ylabel("length scale required by the QI (m)")
    ax.legend(loc="lower right", fontsize=8.5)
    fig.tight_layout()
    fig.savefig(FIG / "p2_fig2_qi_scales.png", dpi=160)
    plt.close(fig)

    # F3: Ellis unstable mode and convergence
    s_ref = stab["shooting"][0]
    fig, ax = plt.subplots(1, 2, figsize=(9.2, 3.6))
    sN, xg, vec = st.growth_rate_matrix(N=2000, X=60.0)
    vec = vec / vec[0]
    sel = xg < 12
    ax[0].plot(xg[sel], vec[sel], color=PAL[0], label=f"unstable mode, s = {s_ref:.5f} c/b")
    ax[0].plot(xg[sel], (xg[sel] * np.exp(-s_ref * xg[sel])) / (xg[sel] * np.exp(-s_ref * xg[sel]))[np.argmin(abs(xg[sel] - 8))] * vec[sel][np.argmin(abs(xg[sel] - 8))],
               "--", color=PAL[1], lw=1.2, label="x e^(−s x) tail")
    ax[0].set_xlabel("proper radial distance x / b")
    ax[0].set_ylabel("δR (normalised at the throat)")
    ax[0].legend()
    N = [r["N"] for r in stab["fd"]]
    ax[1].loglog(N, [abs(r["s"] - s_ref) for r in stab["fd"]], "o-", color=PAL[1], ms=5, label="finite differences")
    Nc = [r["N"] for r in stab["chebyshev"]]
    ax[1].loglog(Nc, [max(abs(r["s"] - s_ref), 1e-12) for r in stab["chebyshev"]], "s-", color=PAL[2], ms=5, label="Chebyshev in x²")
    ax[1].loglog(N, 0.7 * np.array(N, float) ** -2, color=MUTED, lw=1, label="∝ N⁻²")
    ax[1].set_xlabel("grid points N")
    ax[1].set_ylabel("|s − s_shooting| (c/b)")
    ax[1].legend()
    fig.tight_layout()
    fig.savefig(FIG / "p2_fig3_ellis_mode.png", dpi=160)
    plt.close(fig)

    # F4: parametric drive
    fig, ax = plt.subplots(figsize=(6.4, 4.0))
    scan = json.loads((RES / "kapitza_scan.json").read_text())
    ext = json.loads((RES / "kapitza_refine.json").read_text())
    for k, (prof, w, Om) in enumerate([("gauss", 2.0, 20.0), ("V1", None, 20.0)]):
        pts = [(a, g) for (p, ww, o, a, g) in scan if p == prof and ww == w and o == Om]
        a, g = zip(*pts)
        ax.semilogx(np.array(a) / (np.sqrt(2) * s_ref * Om * s_ref), g, "o-", color=PAL[k], ms=4,
                    label=f"{'Gaussian drive, width 2b' if prof == 'gauss' else 'drive ∝ exotic stress'}, Ω = {Om:.0f}s")
    pts = [(a, g2) for (p, ww, o, a, g1, g2, fin) in ext if ww == 8.0 and o == 80.0]
    a, g = zip(*pts)
    ax.semilogx(np.array(a) / (np.sqrt(2) * s_ref * 80 * s_ref), g, "s-", color=PAL[2], ms=4, label="Gaussian, width 8b, Ω = 80s (late growth)")
    ax.axhline(s_ref, color=MUTED, lw=1)
    ax.text(0.012, s_ref + 0.08, "undriven growth rate", color=MUTED, fontsize=8.5)
    ax.axhline(0, color=INK, lw=0.8)
    ax.axvline(1, color=PAL[4], lw=1, ls="--")
    ax.text(1.08, -0.22, "single-mode Kapitza threshold", color=INK, fontsize=8.5)
    ax.set_xlabel("drive amplitude / (√2 s Ω)")
    ax.set_ylabel("growth rate of the throat perturbation (c/b)")
    ax.set_ylim(-0.3, 3.4)
    ax.legend(fontsize=8, loc="upper left")
    fig.tight_layout()
    fig.savefig(FIG / "p2_fig4_parametric.png", dpi=160)
    plt.close(fig)

    # F5: thin-shell stability map
    ts_ = stab["thin_shell"]
    fig, ax = plt.subplots(figsize=(6.4, 4.0))
    lo = [(r["a0_over_M"], r["beta2_crit"]) for r in ts_ if r["stable_above"]]
    hi = [(r["a0_over_M"], r["beta2_crit"]) for r in ts_ if not r["stable_above"]]
    x1, y1 = zip(*lo)
    x2, y2 = zip(*hi)
    ax.plot(x1, y1, color=PAL[0], label="stable above the curve (2M < a0 < 3M)")
    ax.plot(x2, y2, color=PAL[1], label="stable below the curve (a0 > 3M)")
    ax.fill_between(x1, y1, 12, color=PAL[0], alpha=0.12)
    ax.fill_between(x2, -12, y2, color=PAL[1], alpha=0.12)
    ax.axhline(1, color=MUTED, lw=0.8)
    ax.text(15, 1.3, "β² = 1", color=MUTED, fontsize=8.5)
    ax.axhline(-0.5, color=MUTED, lw=0.8, ls=":")
    ax.text(14, -1.4, "β² → −1/2 as a0 → ∞", color=MUTED, fontsize=8.5)
    ax.set_ylim(-12, 12)
    ax.set_xlabel("shell radius a0 / M")
    ax.set_ylabel("β² = dp/dσ")
    ax.legend(fontsize=8.5, loc="lower right")
    fig.tight_layout()
    fig.savefig(FIG / "p2_fig5_thin_shell.png", dpi=160)
    plt.close(fig)

    # F6: chronology scenarios
    sc = [s for s in chron["scenarios"] if s["years"] is not None]
    fig, ax = plt.subplots(figsize=(8.0, 3.9))
    names = [s["scenario"] for s in sc]
    yrs = [s["years"] for s in sc]
    ax.barh(range(len(sc)), yrs, color=PAL[0], height=0.55)
    ax.set_xscale("log")
    ax.set_yticks(range(len(sc)))
    ax.set_yticklabels(names, fontsize=8.5)
    for k, y in enumerate(yrs):
        ax.text(y * 1.3, k, f"{y:.3g} yr", va="center", fontsize=8.5, color=INK)
    ax.invert_yaxis()
    ax.set_xlabel("years until a closed causal curve exists (clocks synchronised at the start)")
    ax.grid(axis="y", visible=False)
    ax.set_xlim(1e-2, 1e12)
    fig.tight_layout()
    fig.savefig(FIG / "p2_fig6_chronology.png", dpi=160)
    plt.close(fig)


def main():
    full = "--full" in sys.argv
    t0 = time.time()
    qir = run_qi(); print(f"qi done {time.time() - t0:.0f}s", flush=True)
    save("design_search.json", search.random_search(400)); print(f"design search done {time.time() - t0:.0f}s", flush=True)
    run_energy(); print(f"energy done {time.time() - t0:.0f}s", flush=True)
    run_charged(); print(f"charged done {time.time() - t0:.0f}s", flush=True)
    stab = run_stability(full); print(f"stability done {time.time() - t0:.0f}s", flush=True)
    chron = run_chronology(); print(f"chronology done {time.time() - t0:.0f}s", flush=True)
    run_framework(); print(f"framework done {time.time() - t0:.0f}s", flush=True)
    figures(qir, stab, chron); print(f"figures done {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
