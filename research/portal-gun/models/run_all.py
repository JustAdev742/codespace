"""Regenerate every figure and the numerical summary used in the report.

    python run_all.py            # all figures + results/summary.json
    python run_all.py fig_views  # one figure by name

Outputs: ../figures/*.png and ../results/summary.json (+ symbolic_gr.json).
"""

from __future__ import annotations

import json
import math
import pathlib
import sys
import time

import numpy as np

from portalphys import constants as C
from portalphys import dynamics as D
from portalphys import energy as E
from portalphys import environment as EN
from portalphys import newtonian_portal as NP
from portalphys import plotstyle as PS
from portalphys import raytrace as RT
from portalphys import symbolic_gr as S
from portalphys import tidal as T
from portalphys import timeshift as TS

PS.apply()
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIG = ROOT / "figures"
RES = ROOT / "results"
FIG.mkdir(exist_ok=True)
RES.mkdir(exist_ok=True)
SUMMARY: dict = {}


def save(fig, name):
    fig.savefig(FIG / f"{name}.png", bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote figures/{name}.png")


# ----------------------------------------------------------------------------- 1 embedding
def fig_embedding():
    r0 = 1.0
    r = np.linspace(r0, 6, 600)
    z_ellis = r0 * np.arccosh(r / r0)
    z_flamm = 2 * np.sqrt(r0 * (r - r0))          # Flamm paraboloid with r_s = r0
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2), gridspec_kw={"width_ratios": [1.15, 1]})
    ax = axes[0]
    for z, col, lab in ((z_ellis, PS.SERIES[0], "Ellis-Bronnikov (traversable, needs NEC violation)"),
                        (z_flamm, PS.SERIES[1], "Einstein-Rosen / Flamm, r_s = r0 (pinches off)")):
        ax.plot(r, z, color=col, label=lab)
        ax.plot(r, -z, color=col)
        ax.plot(-r, z, color=col)
        ax.plot(-r, -z, color=col)
    # thin shell: two flat sheets joined at a circle (embedding: a step)
    ax.plot([1, 6], [0.02, 0.02], color=PS.SERIES[2], label="thin shell from two flat spaces (kink at r = a)")
    ax.plot([-6, -1], [0.02, 0.02], color=PS.SERIES[2])
    ax.plot([1, 6], [-0.02, -0.02], color=PS.SERIES[2])
    ax.plot([-6, -1], [-0.02, -0.02], color=PS.SERIES[2])
    ax.set_xlabel("areal radius r / r0 (shown on both sides of the axis)")
    ax.set_ylabel("embedding height z / r0")
    ax.set_title("Embedding diagrams (t = const, equatorial slice)")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=1)
    ax.set_aspect("equal")
    ax.set_ylim(-4, 4)
    # 3-D Ellis surface
    ax3 = fig.add_subplot(1, 2, 2, projection="3d")
    axes[1].remove()
    l = np.linspace(-3.2, 3.2, 120)
    th = np.linspace(0, 2 * np.pi, 120)
    L, TH = np.meshgrid(l, th)
    RR = np.sqrt(L**2 + 1)
    X, Y, Z = RR * np.cos(TH), RR * np.sin(TH), np.arcsinh(L)
    cmap = LinearSegmentedColormap.from_list("blue", PS.BLUE_RAMP)
    ax3.plot_surface(X, Y, Z, facecolors=cmap((Z - Z.min()) / np.ptp(Z)), rstride=2, cstride=2,
                     linewidth=0.2, edgecolor=(1, 1, 1, 0.25), antialiased=True, shade=False)
    ax3.set_box_aspect((1, 1, 0.75))
    ax3.set_axis_off()
    ax3.set_title("Ellis throat as a surface of revolution\n(z = r0 arsinh(l/r0), r^2 = l^2 + r0^2)")
    save(fig, "fig01_embedding")


# ----------------------------------------------------------------------------- 2 tension
def fig_tension():
    r0 = np.logspace(-35, 17, 400)
    tau = np.array([E.throat_tension(x) for x in r0])
    fig, ax = plt.subplots(figsize=(8.6, 5))
    ax.loglog(r0, tau, color=PS.SERIES[0])
    refs = [
        (C.c**7 / (C.hbar * C.G**2), "Planck pressure c^7/(hbar G^2)"),
        (C.P_neutron_star_core, "neutron-star core pressure ~ nuclear-matter rho c^2 (1e34-1e35 Pa)"),
        (C.graphene_strength, "graphene tensile strength (130 GPa)"),
        (abs(E.casimir_energy_density(1e-9)), "|Casimir rho|, plates 1 nm apart"),
        (abs(E.casimir_energy_density(1e-6)), "|Casimir rho|, plates 1 um apart"),
    ]
    for val, lab in refs:
        ax.axhline(val, color=PS.AXIS, lw=0.8)
        below = "Casimir" in lab and "1 nm" in lab
        PS.note(ax, 2e-35, val / 60 if below else val * 1.6, lab, fontsize=7.5)
    ax.plot([1.0], [E.throat_tension(1.0)], "o", ms=7, color=PS.SERIES[0], mec=PS.SURFACE, mew=2)
    PS.note(ax, 1.6, E.throat_tension(1.0) * 1.6, "1 m throat: 4.8e42 Pa", fontsize=8.5, color=PS.INK)
    rg = E.required_radius_for_tension(C.graphene_strength)
    ax.plot([rg], [C.graphene_strength], "o", ms=6, color=PS.SERIES[0], mec=PS.SURFACE, mew=2)
    PS.note(ax, rg / 3e5, C.graphene_strength * 3e4, f"tension = graphene strength\nonly at r0 = {rg / C.light_year:.2f} light-years", fontsize=7.5, ha="left")
    ax.set_xlabel("throat radius r0 [m]")
    ax.set_ylabel("required radial tension at the throat [Pa]")
    ax.set_title("Throat tension of any static Morris-Thorne portal: tau0 = c^4 / (8 pi G r0^2)")
    ax.set_xlim(1e-35, 1e17)
    save(fig, "fig02_tension")
    SUMMARY["tension"] = {"tau0_1m_Pa": E.throat_tension(1.0), "r0_for_graphene_m": rg,
                          "r0_for_graphene_ly": rg / C.light_year,
                          "r0_for_neutron_star_core_m": E.required_radius_for_tension(C.P_neutron_star_core),
                          "planck_pressure_Pa": C.c**7 / (C.hbar * C.G**2)}


# ----------------------------------------------------------------------------- 3 exotic mass
def fig_mass():
    R = np.logspace(-35, 3, 300)
    m = np.abs([E.ellis_mass_proper(x) for x in R])
    fig, ax = plt.subplots(figsize=(8.6, 5))
    ax.loglog(R, m, color=PS.SERIES[0])
    refs = [(C.M_sun, "Sun"), (C.M_jupiter, "Jupiter"), (C.M_earth, "Earth"), (7.35e22, "Moon"),
            (9.4e20, "Ceres"), (1.6e14, "Mount Everest (~1.6e14 kg, order of magnitude)"),
            (70.0, "a person"), (C.m_P, "Planck mass")]
    for val, lab in refs:
        ax.axhline(val, color=PS.AXIS, lw=0.8)
        PS.note(ax, 2e-35, val * 1.7, lab, fontsize=7.5)
    for x, lab in ((1.0, "1 m"), (1e-2, "1 cm"), (1e-6, "1 um"), (1e-15, "1 fm")):
        y = abs(E.ellis_mass_proper(x))
        ax.plot([x], [y], "o", ms=6, color=PS.SERIES[0], mec=PS.SURFACE, mew=2)
        PS.note(ax, x * 2.5, y / 4, f"{lab}: {y:.1e} kg", fontsize=7.5, color=PS.INK)
    ax.set_xlabel("portal radius R [m]")
    ax.set_ylabel("magnitude of negative mass-energy / c^2 [kg]")
    ax.set_title("Exotic mass needed: |M| = (pi/2) R c^2 / G  (Ellis, proper volume; identical for the\n"
                 "flat-face rim; the thin-shell model needs 4/pi = 1.27x more)")
    ax.set_xlim(1e-35, 1e3)
    save(fig, "fig03_exotic_mass")
    SUMMARY["exotic_mass"] = {
        "ellis_proper_1m_kg": E.ellis_mass_proper(1.0),
        "ellis_proper_numeric_1m_kg": E.ellis_mass_proper_numeric(1.0),
        "ellis_coordinate_1m_kg": E.ellis_mass_coordinate(1.0),
        "thin_shell_flat_1m_kg": E.thin_shell_mass(1.0),
        "thin_shell_surface_pressure_1m_N_per_m": E.thin_shell_surface_pressure(1.0),
        "flat_face_rim_mu_kg_per_m": E.string_mass_per_length(2 * math.pi),
        "flat_face_rim_total_1m_kg": E.flat_face_rim_mass(1.0),
        "vkd_quantifier_ellis_1m_kg": E.vkd_quantifier_ellis(1.0),
        "in_jupiter_masses_ellis_1m": E.ellis_mass_proper(1.0) / C.M_jupiter,
        "energy_1m_J": abs(E.ellis_mass_proper(1.0)) * C.c**2,
        "energy_1m_solar_years": E.solar_output_years(E.ellis_mass_proper(1.0) * C.c**2),
        "energy_1m_over_world_power_1s": abs(E.ellis_mass_proper(1.0)) * C.c**2 / C.world_power_2023,
        "ellis_1cm_kg": E.ellis_mass_proper(0.01), "ellis_1cm_earth_masses": E.ellis_mass_proper(0.01) / C.M_earth,
        "rim_collapse_time_1m_s": E.rim_collapse_time(1.0),
    }


# ----------------------------------------------------------------------------- 4 casimir / QI
def fig_casimir():
    r0 = np.logspace(-30, 17, 300)
    gap = np.array([E.casimir_gap_for_throat(x) for x in r0])
    qi = np.array([E.qi_max_sampling_length(E.throat_tension(x)) for x in r0])
    fig, ax = plt.subplots(figsize=(8.6, 5))
    ax.loglog(r0, gap, color=PS.SERIES[0], label="Casimir plate gap giving |rho| = tau0")
    ax.loglog(r0, qi, color=PS.SERIES[1], label="Ford-Roman QI: max coherent length c t0 at |rho| = tau0")
    band = np.array([E.ford_roman_band_max(x) for x in r0])
    ax.loglog(r0, band, color=PS.SERIES[2], label="Ford-Roman 1996: max thickness of the negative-energy band (f = 0.01)")
    ax.axhspan(1e-7, 6e-6, color=PS.SERIES[2], alpha=0.10, lw=0)
    PS.note(ax, 2e-30, 1.3e-7, "Casimir force measured (~0.1-6 um gaps)", fontsize=7.5)
    for val, lab in ((C.bohr_radius, "Bohr radius"), (C.proton_radius, "proton radius"), (C.l_P, "Planck length")):
        ax.axhline(val, color=PS.AXIS, lw=0.8)
        PS.note(ax, 2e-30, val * 1.8, lab, fontsize=7.5)
    for x in (1.0, C.AU):
        ax.plot([x], [E.casimir_gap_for_throat(x)], "o", ms=6, color=PS.SERIES[0], mec=PS.SURFACE, mew=2)
    PS.note(ax, 1.5, E.casimir_gap_for_throat(1.0) / 6, "1 m: 3.1e-18 m", fontsize=8, color=PS.INK)
    PS.note(ax, C.AU * 1.5, E.casimir_gap_for_throat(C.AU) / 6, "1 AU: 1.2e-12 m\n(MTY88 formula: 1.6e-10 cm)", fontsize=8, color=PS.INK)
    ax.set_xlabel("throat radius r0 [m]")
    ax.set_ylabel("length scale [m]")
    ax.set_title("Negative energy at the density a throat needs is confined to sub-nuclear scales\n"
                 "(Casimir and QI lengths scale as sqrt(l_P r0); the band bound as (l_P^2 r0)^(1/3))")
    ax.legend(loc="lower right")
    ax.set_ylim(1e-36, 1e-4)
    save(fig, "fig04_casimir_qi")
    SUMMARY["casimir_qi"] = {"casimir_gap_1m_m": E.casimir_gap_for_throat(1.0), "casimir_gap_1AU_m": E.casimir_gap_for_throat(C.AU),
                             "qi_length_1m_m": E.qi_max_sampling_length(E.throat_tension(1.0)),
                             "casimir_rho_1um_J_m3": E.casimir_energy_density(1e-6),
                             "casimir_rho_1nm_J_m3": E.casimir_energy_density(1e-9),
                             "ratio_tau0_to_casimir_1um": E.throat_tension(1.0) / abs(E.casimir_energy_density(1e-6)),
                             "ford_roman_band_1m_m": E.ford_roman_band_max(1.0),
                             "ford_roman_band_1m_in_lP": E.ford_roman_band_max(1.0) / C.l_P}


# ----------------------------------------------------------------------------- 5 tidal
def fig_tidal():
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.4))
    v = np.linspace(0, 12, 300)
    ax = axes[0]
    for i, r0 in enumerate((0.5, 1.0, 2.0, 5.0)):
        a = np.array([T.ellis_tidal(x, r0, 2.0)[1] for x in v]) / C.g0
        ax.plot(v, a, color=PS.SERIES[i], label=f"r0 = {r0:g} m")
        k = np.searchsorted(a, 7.5)
        if k < len(v):
            PS.note(ax, v[k] + 0.15, 7.5, f"{r0:g} m", fontsize=8)
    ax.axhline(1.0, color=PS.INK2, lw=0.9)
    PS.note(ax, 0.2, 1.2, "1 g (Morris-Thorne comfort limit)", fontsize=7.5)
    ax.set_ylim(0, 10)
    ax.set_xlabel("traversal speed v [m/s]")
    ax.set_ylabel("head-to-foot stretch [g], body length 2 m")
    ax.set_title("Lateral tidal stretch at an Ellis throat:\nDelta a = gamma^2 v^2 xi / r0^2")
    ax.legend(loc="upper left")
    ax = axes[1]
    r0s = np.logspace(-1, 3, 200)
    ax.loglog(r0s, [T.ellis_max_speed(x, 2.0, C.g0) for x in r0s], color=PS.SERIES[0])
    for val, lab in ((1.4, "walking 1.4 m/s"), (10.0, "sprinting 10 m/s"), (343.0, "speed of sound")):
        ax.axhline(val, color=PS.AXIS, lw=0.8)
        PS.note(ax, 0.12, val * 1.15, lab, fontsize=7.5)
    ax.set_xlabel("throat radius r0 [m]")
    ax.set_ylabel("max speed for <= 1 g stretch [m/s]")
    ax.set_title("Speed limit through an Ellis throat\nv_max ~ r0 sqrt(g / xi) = 2.2 r0 per second")
    save(fig, "fig05_tidal")
    SUMMARY["tidal"] = {f"vmax_r0_{r}m": T.ellis_max_speed(r, 2.0, C.g0) for r in (0.5, 1.0, 2.0, 10.0)}
    SUMMARY["tidal"]["stretch_1m_at_1mps_m_s2"] = T.ellis_tidal(1.0, 1.0, 2.0)[1]
    SUMMARY["tidal"]["mt_curvature_bound_m-2"] = T.mt_tidal_limit_curvature()


# ----------------------------------------------------------------------------- 6 views
def fig_views():
    cams = [(8.0, "l = 8 r0 (approaching)"), (3.0, "l = 3 r0"), (1.0, "l = 1 r0"), (0.0, "at the throat, l = 0"), (-3.0, "l = -3 r0 (through, looking back)")]
    fig, axes = plt.subplots(1, len(cams), figsize=(16, 3.8))
    meta = {}
    for ax, (lc, title) in zip(axes, cams):
        t0 = time.time()
        # camera always faces the throat; for l < 0 that means looking back toward our side
        img, info = RT.render(lc, fov_deg=100, size=360, look_inward=True)
        ax.imshow(img, interpolation="bilinear")
        ax.set_title(title, fontsize=9)
        ax.set_axis_off()
        meta[title] = {"disc_angular_radius_deg": RT.apparent_angular_radius(lc), "render_s": time.time() - t0}
    fig.suptitle("Ray-traced view toward an Ellis wormhole mouth (100 deg field of view). Blue grid = our sky,"
                 " amber checker = the far universe", fontsize=10, color=PS.INK)
    save(fig, "fig06_wormhole_views")
    SUMMARY["views"] = meta


# ----------------------------------------------------------------------------- 7 deflection check
def fig_deflection():
    b_t = np.linspace(0.02, 0.995, 40)
    b_r = np.concatenate([np.linspace(1.005, 1.2, 15), np.linspace(1.25, 10, 30)])
    num_t = np.array([RT._seg(-math.inf, math.inf, b, 1.0) for b in b_t])
    num_r = np.array([2 * RT._from_turning(math.sqrt(b * b - 1), math.inf, b, 1.0) for b in b_r])
    ex_t, ex_r = RT.sweep_transmitted_exact(b_t), RT.sweep_reflected_exact(b_r)
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2))
    ax = axes[0]
    ax.plot(b_t, ex_t, color=PS.SERIES[0], label="transmitted, exact 2(b/r0)K(b/r0)")
    ax.plot(b_r, ex_r - math.pi, color=PS.SERIES[1], label="reflected deflection, exact 2K(r0/b) - pi")
    ax.plot(b_t, num_t, "o", ms=4, color=PS.SERIES[0], mec=PS.SURFACE, mew=1)
    ax.plot(b_r, num_r - math.pi, "o", ms=4, color=PS.SERIES[1], mec=PS.SURFACE, mew=1)
    bb = np.linspace(2, 10, 50)
    ax.plot(bb, math.pi / (4 * bb**2), color=PS.SERIES[2], lw=1.5, label="weak field pi r0^2/(4 b^2)")
    ax.set_yscale("log")
    ax.set_xlabel("impact parameter b / r0")
    ax.set_ylabel("angle [rad]")
    ax.set_title("Ellis optics: quadrature (dots) vs closed form (lines)")
    ax.legend(loc="upper right")
    ax = axes[1]
    ax.semilogy(b_t, np.abs(num_t / ex_t - 1) + 1e-17, "o-", ms=3, lw=1, color=PS.SERIES[0], label="transmitted")
    ax.semilogy(b_r, np.abs(num_r / ex_r - 1) + 1e-17, "o-", ms=3, lw=1, color=PS.SERIES[1], label="reflected")
    ax.set_xlabel("impact parameter b / r0")
    ax.set_ylabel("relative error")
    ax.set_title("Residuals")
    ax.legend()
    save(fig, "fig07_deflection_check")
    SUMMARY["deflection_check"] = {"max_rel_err_transmitted": float(np.max(np.abs(num_t / ex_t - 1))),
                                   "max_rel_err_reflected": float(np.max(np.abs(num_r / ex_r - 1)))}


# ----------------------------------------------------------------------------- 8 thin shell
def fig_shell():
    x = np.linspace(2.02, 8, 800)
    crit = np.array([D.v2_critical(a, 1.0) for a in x])
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.3))
    ax = axes[0]
    lo, hi = -4, 8
    m1 = x < 3
    ax.fill_between(x[m1], np.clip(crit[m1], lo, hi), hi, color=PS.SERIES[2], alpha=0.12, lw=0)
    ax.fill_between(x[~m1], lo, np.clip(crit[~m1], lo, hi), color=PS.SERIES[2], alpha=0.12, lw=0)
    ax.plot(x[m1], crit[m1], color=PS.SERIES[2])
    ax.plot(x[~m1], crit[~m1], color=PS.SERIES[2])
    ax.axhline(1, color=PS.INK2, lw=0.8)
    ax.axhline(0, color=PS.AXIS, lw=0.8)
    ax.axvline(3, color=PS.AXIS, lw=0.8)
    PS.note(ax, 2.1, 6.8, "stable", fontsize=9, color=PS.INK)
    PS.note(ax, 5.5, -3.3, "stable", fontsize=9, color=PS.INK)
    PS.note(ax, 3.6, 1.2, "beta^2 = 1 (would be sound speed = c\nfor ordinary matter)", fontsize=7.5)
    PS.note(ax, 3.05, 6.8, "a0 = 3M (photon sphere)", fontsize=7.5)
    ax.set_ylim(lo, hi)
    ax.set_xlabel("static shell radius a0 / M")
    ax.set_ylabel("beta^2 = dP / d sigma")
    ax.set_title("Linear stability of Schwarzschild thin-shell wormholes\n(re-derived; shaded = V''(a0) > 0)")
    ax = axes[1]
    for i, (a0, M, b2, lab) in enumerate(((1.0, 0.0, -1.0, "flat shell, beta^2 = -1 (stable)"),
                                          (1.0, 0.0, 0.0, "flat shell, beta^2 = 0 (unstable)"))):
        t, a, _ = D.evolve_shell(a0, M, b2, dsigma_frac=-1e-4, tau_end=12.0)
        ax.plot(t, a / a0, color=PS.SERIES[i], label=lab)
    ax.set_xlabel("proper time tau / a0 (c = 1)")
    ax.set_ylabel("shell radius a / a0")
    ax.set_title("Non-linear evolution after a 1e-4 perturbation")
    ax.legend(loc="upper left")
    save(fig, "fig08_thin_shell_stability")
    SUMMARY["thin_shell"] = {"beta2_crit_flat": D.v2_critical(1.0, 1e-15),
                             "beta2_crit_a0_2.5M": D.v2_critical(2.5, 1.0), "beta2_crit_a0_5M": D.v2_critical(5.0, 1.0),
                             "beta2_min_lower_bound_2M_3M": float(np.min(crit[m1]))}


# ----------------------------------------------------------------------------- 9 newtonian portal
def fig_newtonian():
    R, h, g = 1.0, 4.0, 9.81
    F = NP.solve(R=R, h=h, g=g, dx=0.05, pad=6.0)
    st = NP.face_field_stats(F)
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.6), gridspec_kw={"width_ratios": [1.0, 1, 1]}, layout="constrained")
    ax = axes[0]
    sel_s = F.s < 4.0
    sel_z = (F.z > -3) & (F.z < h + 3)
    S_, Z_ = np.meshgrid(F.s[sel_s], F.z[sel_z])
    P = F.phi[np.ix_(sel_z, sel_s)] - g * h / 2
    full_s = np.concatenate([-S_[:, ::-1], S_], 1)
    full_z = np.concatenate([Z_[:, ::-1], Z_], 1)
    full_p = np.concatenate([P[:, ::-1], P], 1)
    dev = full_p - (g * full_z - g * h / 2)
    lim = np.max(np.abs(dev))
    cmap = LinearSegmentedColormap.from_list("div", [PS.SERIES[0], PS.DIVERGING_MID, PS.SERIES[7]])
    im = ax.pcolormesh(full_s, full_z, dev, cmap=cmap, norm=TwoSlopeNorm(0, -lim, lim), shading="auto")
    ax.contour(full_s, full_z, full_p, levels=np.arange(-60, 61, 4), colors=[PS.INK2], linewidths=0.5, linestyles="solid")
    for zc in (0, h):
        ax.plot([-R, R], [zc, zc], color=PS.INK, lw=3, solid_capstyle="butt")
    PS.note(ax, R + 0.1, 0.1, "A (floor, faces up)", fontsize=8, color=PS.INK)
    PS.note(ax, R + 0.1, h + 0.1, "B (ceiling, faces down)", fontsize=8, color=PS.INK)
    cb = fig.colorbar(im, ax=ax, orientation="horizontal", fraction=0.05, pad=0.12)
    cb.set_label("phi - g z  [J/kg]: change caused by the portals", color=PS.INK2)
    ax.set_aspect("equal")
    ax.set_xlabel("s [m] (axisymmetric)")
    ax.set_ylabel("z [m]")
    ax.set_title("Static potential with a floor/ceiling portal pair\n(contours: phi every 4 J/kg)")
    ax = axes[1]
    z, ph = F.axis_profile()
    m = (z > -2.5) & (z < h + 2.5)
    ax.plot(z[m], g * z[m], color=PS.SERIES[1], label="no portals: phi = g z")
    ax.plot(z[m], ph[m], color=PS.SERIES[0], label="with portals (on the axis)")
    for zc in (0, h):
        ax.axvline(zc, color=PS.AXIS, lw=0.8)
    PS.note(ax, 0.1, -20, "A", fontsize=9, color=PS.INK)
    PS.note(ax, h + 0.1, -20, "B", fontsize=9, color=PS.INK)
    ax.set_xlabel("height z on the axis [m]")
    ax.set_ylabel("potential phi [J/kg]")
    ax.set_title("Single-valued potential: the faces sit at ~g h / 2")
    ax.legend(loc="upper left")
    ax = axes[2]
    d = NP.axis_drop(F, z0=3.0, t_end=6.0, dt=5e-4)
    tk, vk, ek = NP.kinematic_drop(3.0, h, g, t_end=6.0)
    ax.plot(tk, np.abs(vk), color=PS.SERIES[1], label="game rule (uniform g, speed kept)")
    ax.plot(d["t"], np.abs(d["v"]), color=PS.SERIES[0], label="static field on portal topology")
    ax.set_xlabel("time after release from rest at z = 3 m [s]")
    ax.set_ylabel("speed [m/s]")
    ax.set_title("The 'infinite fall' disappears when\nenergy is conserved")
    ax.legend(loc="upper left")
    save(fig, "fig09_newtonian_portal")
    SUMMARY["newtonian_portal"] = {"R_m": R, "h_m": h, "g": g, "dx": 0.05, **st,
                                   "drop_max_speed_mps": float(np.max(np.abs(d["v"]))),
                                   "drop_energy_drift_J_per_kg": float(np.ptp(d["E"])),
                                   "drop_crossings": len(d["crossings"]),
                                   "game_rule_speed_after_6s_mps": float(abs(vk[-1]))}


def newtonian_scaling():
    """Field strength near the mouths as the height difference grows (R = 1 m)."""
    rows = []
    for h in (2.0, 4.0, 8.0, 16.0):
        F = NP.solve(R=1.0, h=h, g=9.81, dx=0.05, pad=3.0)
        st = NP.face_field_stats(F)
        rows.append({"h_m": h, "room_midpoint_g": st["room_midpoint"] / 9.81, "room_above_A_g": st["room_above_A"] / 9.81,
                     "behind_A_g": st["behind_A (below floor)"] / 9.81, "loop_phi_range_J_kg": st["phi_loop_max"] - st["phi_loop_min"]})
        print("   h=%5.1f  mid %.3f g  aboveA %.3f g  behindA %.3f g  loop range %.2f J/kg" % (h, rows[-1]["room_midpoint_g"], rows[-1]["room_above_A_g"], rows[-1]["behind_A_g"], rows[-1]["loop_phi_range_J_kg"]))
    SUMMARY["newtonian_scaling"] = rows


# ----------------------------------------------------------------------------- 10 time machines
def fig_timemachine():
    rows = TS.scenarios()
    fig, ax = plt.subplots(figsize=(8.6, 3.9))
    names = [r["scenario"] for r in rows][::-1]
    years = [r["T_ctc_years"] for r in rows][::-1]
    y = np.arange(len(names))
    ax.barh(y, years, height=0.42, color=PS.SERIES[0])
    for yi, val in zip(y, years):
        txt = f"{val * 365.25:.0f} days" if val < 2 else f"{val:,.0f} yr" if val > 50 else f"{val:.1f} yr"
        PS.note(ax, val * 1.25, yi, txt, va="center", fontsize=8, color=PS.INK)
    ax.set_yticks(y, names)
    ax.set_xscale("log")
    ax.set_xlim(1e-2, 1e6)
    ax.set_xlabel("time until a closed timelike curve forms [years, log scale]")
    ax.set_title("If portal clocks stay synchronised through the throat, drift turns a pair into a time machine\n"
                 "(T = (d/c)/eps; Morris-Thorne-Yurtsever 1988, Frolov-Novikov 1990 mechanism)", fontsize=9.5)
    ax.grid(axis="y", visible=False)
    save(fig, "fig10_time_machine")
    SUMMARY["time_machine"] = rows


# ----------------------------------------------------------------------------- 11 environment
def fig_environment():
    fig, ax = plt.subplots(figsize=(8.6, 4.4))
    V = 50.0
    for i, (r, lab) in enumerate(((1.0, "R = 1 m"), (0.1, "R = 10 cm"), (0.01, "R = 1 cm"))):
        t, p = EN.blowdown(V, math.pi * r * r, Cd=0.8, t_end=5e4)
        ax.semilogx(np.maximum(t, 1e-4), p / 1000, color=PS.SERIES[i], label=lab)
    ax.axhline(C.P_sea_level * 0.47 / 1000, color=PS.AXIS, lw=0.8)
    PS.note(ax, 1.2e-4, C.P_sea_level * 0.47 / 1000 + 2, "~47 kPa: equivalent of 6 km altitude", fontsize=7.5)
    ax.set_xlim(1e-4, 5e4)
    ax.set_xlabel("time after opening [s] (log)")
    ax.set_ylabel("room pressure [kPa]")
    ax.set_title("A 50 m^3 room at sea level, portal opened onto vacuum (choked isentropic blow-down, Cd = 0.8)")
    ax.legend()
    save(fig, "fig11_environment")
    A = math.pi
    SUMMARY["environment"] = {
        "air_to_vacuum_mass_flow_1m_kg_s_Cd1": EN.orifice_mass_flow(C.P_sea_level, C.T_air_sl, 0, A, Cd=1.0),
        "air_to_vacuum_jet_speed_mps": EN.exit_velocity(C.P_sea_level, C.T_air_sl, 0),
        "pressure_force_1m_N": EN.pressure_force(C.P_sea_level, A),
        "room50_to_half_atm_1m_s": EN.time_to_pressure(V, A, 0.5 * C.P_sea_level, Cd=0.8),
        "room50_to_half_atm_10cm_s": EN.time_to_pressure(V, math.pi * 0.01, 0.5 * C.P_sea_level, Cd=0.8),
        "room50_to_half_atm_1cm_s": EN.time_to_pressure(V, math.pi * 1e-4, 0.5 * C.P_sea_level, Cd=0.8),
        "everest_flow_1m_kg_s": EN.orifice_mass_flow(C.P_sea_level, C.T_air_sl, 33_700.0, A, Cd=0.8),
        "water_4km": dict(zip(("speed_mps", "volume_m3_s", "mass_kg_s", "dp_Pa"), EN.water_jet(4000.0, A))),
        "water_10m": dict(zip(("speed_mps", "volume_m3_s", "mass_kg_s", "dp_Pa"), EN.water_jet(10.0, A))),
        "photosphere_flux_W_m2": EN.radiative_flux(C.T_sun_eff), "photosphere_power_1m_W": EN.radiative_flux(C.T_sun_eff) * A,
        "chimney_100m_dp_Pa": C.rho_air_sl * C.g0 * 100, "chimney_100m_wind_mps": math.sqrt(2 * C.g0 * 100),
    }


# ----------------------------------------------------------------------------- 12 identification sketch
def fig_identification():
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.4))
    for ax in axes:
        ax.set_aspect("equal")
        ax.grid(False)
        ax.set_xticks([])
        ax.set_yticks([])
        for sp_ in ax.spines.values():
            sp_.set_visible(False)
    ax = axes[0]
    ax.set_xlim(-4, 4)
    ax.set_ylim(-2.7, 2.7)
    for x0, lab in ((-2.4, "A"), (1.2, "B")):
        ax.plot([x0, x0 + 1.6], [0, 0], color=PS.INK, lw=3, solid_capstyle="butt")
        PS.note(ax, x0 - 0.45, -0.08, lab, fontsize=12, color=PS.INK)
    ax.annotate("", xy=(-1.6, 0.08), xytext=(-1.6, 1.7), arrowprops=dict(arrowstyle="->", color=PS.SERIES[0], lw=2))
    ax.annotate("", xy=(2.0, -1.7), xytext=(2.0, -0.08), arrowprops=dict(arrowstyle="->", color=PS.SERIES[0], lw=2))
    ax.annotate("", xy=(1.85, -0.35), xytext=(-1.45, 0.3), arrowprops=dict(arrowstyle="->", color=PS.SERIES[1], lw=1.3, connectionstyle="arc3,rad=0.3"))
    PS.note(ax, -3.9, 2.25, "Cut two discs out of flat space and glue crosswise:\ntop of A <-> bottom of B,  bottom of A <-> top of B", fontsize=8.5)
    PS.note(ax, -3.9, -2.55, "blue: an object falling into A continues downward out of B", fontsize=8.5)
    ax.set_title("Flat-face portal pair (2-D slice through both discs)")
    ax = axes[1]
    ax.set_xlim(-2.3, 5.3)
    ax.set_ylim(-2.7, 2.7)
    for cx, lab, col in ((0.0, "near A's rim", PS.SERIES[0]), (3.0, "near B's rim", PS.SERIES[1])):
        ax.plot([cx - 1.6, cx], [0, 0], color=PS.INK, lw=3, solid_capstyle="butt")   # disc interior (the cut)
        ax.plot([cx], [0], "o", ms=7, color=PS.INK)
        th = np.linspace(0.12, 2 * np.pi - 0.12, 200) + np.pi            # from top side of the cut, around, to bottom side
        ax.plot(cx + 0.9 * np.cos(th[::-1]), 0.9 * np.sin(th[::-1]), color=col, lw=2)
        ax.annotate("", xy=(cx + 0.9 * np.cos(th[0] - 0.02), 0.9 * np.sin(th[0] - 0.02)),
                    xytext=(cx + 0.9 * np.cos(th[3]), 0.9 * np.sin(th[3])), arrowprops=dict(arrowstyle="->", color=col, lw=2))
        PS.note(ax, cx - 0.75, 1.15, f"{lab}: 2 pi", fontsize=8.5)
    ax.text(-2.2, -1.2, "Circling the rim once: 2 pi around A, through the cut, 2 pi around B,\n"
            "back through the cut. Total angle 4 pi = conical excess of 2 pi.\n"
            "A straight string has deficit 8 pi G mu / c^2, so the rim needs\n"
            "mu = -c^2/(4G) = -3.4e26 kg per metre (negative tension).", fontsize=8, color=PS.INK2, va="top")
    ax.set_title("Why the rim must carry negative tension")
    save(fig, "fig12_identification")


ALL = [fig_embedding, fig_tension, fig_mass, fig_casimir, fig_tidal, fig_deflection, fig_shell,
       fig_newtonian, newtonian_scaling, fig_timemachine, fig_environment, fig_identification, fig_views]


def main(names):
    t0 = time.time()
    sym, _ = S.main(RES)
    SUMMARY["symbolic_checks"] = sym["checks"]
    todo = [f for f in ALL if not names or f.__name__ in names]
    prev = {}
    if names and (RES / "summary.json").exists():
        prev = json.loads((RES / "summary.json").read_text())
    for f in todo:
        print(f"[{f.__name__}]")
        f()
    prev.update(SUMMARY)
    prev["constants"] = {"c": C.c, "G": C.G, "hbar": C.hbar, "l_P": C.l_P, "M_jupiter": C.M_jupiter, "g0": C.g0}
    (RES / "summary.json").write_text(json.dumps(prev, indent=2, default=float))
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main(sys.argv[1:])
