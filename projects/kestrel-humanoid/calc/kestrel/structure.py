"""Hand calculations for the primary load paths (to be confirmed by FEA + proof tests, docs/11).

Load cases
  N  normal operation envelope (repeated-peak torques, docs/generated/joint_requirements.md)
  M  momentary: unplanned 0.10 m drop (SD)
  X  structural: 0.15 m drop absorbed over 0.10 m (SX) - parts must not yield; actuators may slip
     their overload clutches / saturate.
Safety factors: >= 1.5 on yield for X, >= 2.0 on yield for N, fatigue checked for N at 10^7.

Materials (docs/research/R6, ASM data): 7075-T6 sy 503 MPa, fatigue 159 MPa (5e8, R=-1);
Ti-6Al-4V sy 880 MPa, fatigue 510 MPa unnotched / 240 notched; 17-4PH H900 sy 1170 MPa;
CFRP roll-wrapped tube axial E ~90 GPa, compressive ~700 MPa (design 350 MPa).
"""
from __future__ import annotations

import json
from math import cos, pi, radians, sin, sqrt
from pathlib import Path

import numpy as np

from . import linkages as LK
from . import requirements as RQ

ROOT = Path(__file__).resolve().parents[2]
MAT = {
    "7075-T6": dict(sy=503e6, fat=159e6, E=71.7e9, rho=2810),
    "Ti-6Al-4V": dict(sy=880e6, fat=240e6, E=113.8e9, rho=4430),
    "17-4PH H900": dict(sy=1170e6, fat=500e6, E=196e9, rho=7750),
    "CFRP tube": dict(sy=350e6, fat=200e6, E=90e9, rho=1550),
    # needle raceways need >= 58 HRC (docs/09 hold H13): through-hardened, ground bearing steel; conservative yield
    "100Cr6 60-64 HRC": dict(sy=1400e6, fat=600e6, E=210e9, rho=7810),
}


def tube_I(do, di):
    return pi * (do**4 - di**4) / 64


F_ROD_MAX = 12e3      # knee push-rod force cap for the drive table: rod-end C0 ~ 30 kN (unverified) / 2.5 (hold H7)


def knee_limit_table(fam, req, store, meta, names):
    """Knee actuator torque limit vs knee angle, and the check that every simulated sample sits under it.

    tau_act <= min(actuator peak, joint cap / G, F_ROD_MAX r2 |sin mu| / G), with G = joint / actuator torque.
    The joint cap is the momentary knee requirement (structure and gear sized for it). Written to
    data/knee_torque_limit.json for the HC2 parameter table.
    """
    kf = json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    th = np.array(kf["theta_deg"])
    G = np.array(kf["G"])
    mu = np.radians(kf["mu_deg"])
    r2 = kf["r2"]
    T_pk = fam["KA-130K"]["T_peak_out"]
    J_cap = max(535.0, round(req["knee"]["T_mom_req"]))
    act = np.minimum.reduce([np.full_like(G, T_pk), J_cap / G, F_ROD_MAX * r2 * np.abs(np.sin(mu)) / G])
    avail = act * G
    j = names.index("l_knee")
    demand = {}
    for s in meta:
        if s == "SX" or f"{s}/tau" not in store:      # SX: structural drop, actuators may saturate by design
            continue
        tau = np.abs(store[f"{s}/tau"][:, j])
        q = np.degrees(np.abs(store[f"{s}/q"][:, j]))
        m = 1.0 if s in RQ.MOMENTARY else RQ.MARGIN_T
        av = np.interp(q, th, avail)
        r = av / (tau * m + 1e-9)
        i = int(r.argmin())
        demand[s] = dict(scenario=s, ratio=float(r[i]), theta_deg=float(q[i]), demand_Nm=float(tau[i] * m),
                         avail_Nm=float(av[i]), margin=m)
    tab = dict(note="HC2 knee torque limit table, interpolate linearly in knee angle (docs/09 hold H7, P07 sec. F)",
               F_rod_max_N=F_ROD_MAX, joint_cap_Nm=J_cap, actuator_peak_Nm=round(T_pk, 1),
               theta_deg=th.tolist(), G=G.tolist(), mu_deg=np.degrees(mu).tolist(),
               act_limit_Nm=act.round(1).tolist(), joint_avail_Nm=avail.round(1).tolist(), demand=demand)
    (ROOT / "data" / "knee_torque_limit.json").write_text(json.dumps(tab, indent=1))
    return tab


def checks(store, meta, names, req, fam):
    jidx = {n: i for i, n in enumerate(names)}
    R = []
    g = 9.81
    m_des = next(iter(meta.values()))["mass"]

    def add(item, case, load, stress, allow, unit="MPa", note="", req_sf=None):
        R.append(dict(item=item, case=case, load=load, value=stress, allow=allow, SF=allow / stress if stress else 99,
                      unit=unit, note=note, req_sf=req_sf))

    # ---------------- knee push-rod: Ti-6Al-4V tube, rod ends
    kf = json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    th = np.radians(kf["theta_deg"])
    mu = np.radians(kf["mu_deg"])
    r2 = kf["r2"]
    Lrod = kf["L"]
    Fmax = {}
    for case, scen in (("N", RQ.REPEATED), ("M", ["SD"]), ("X", ["SX"])):
        fm = 0.0
        for s in scen:
            k = f"{s}/tau"
            if k not in store:
                continue
            tk = store[k][:, jidx["l_knee"]]
            qk = store[f"{s}/q"][:, jidx["l_knee"]]
            mus = np.interp(np.abs(qk), th, mu)
            F = np.abs(tk) / (r2 * np.abs(np.sin(mus)))
            fm = max(fm, float(F.max()))
        Fmax[case] = fm * (RQ.MARGIN_T if case == "N" else 1.0)
    do, di = 0.016, 0.012
    A = pi * (do**2 - di**2) / 4
    I = tube_I(do, di)
    Pcr = pi**2 * MAT["Ti-6Al-4V"]["E"] * I / Lrod**2        # pinned-pinned (rod ends)
    for case in ("N", "X"):
        add("Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress", case, f"{Fmax[case] / 1e3:.1f} kN",
            Fmax[case] / A / 1e6, MAT["Ti-6Al-4V"]["sy"] / 1e6)
        add("Knee push-rod Euler buckling (pinned, L=%.0f mm)" % (Lrod * 1e3), case, f"{Fmax[case] / 1e3:.1f} kN",
            Fmax[case] / 1e3, Pcr / 1e3, "kN", "Pcr")
    add("Knee rod ends: M12 PTFE-lined spherical (e.g. SKF SIKAC 12 M class, C0 ~ 30 kN, verify)", "X",
        f"{Fmax['X'] / 1e3:.1f} kN", Fmax["X"] / 1e3, 30.0, "kN", "static rating - confirm with chosen part")

    # ---------------- knee push-rod over the whole range at actuator capability (docs/09 hold H7)
    # The drive limits the knee actuator to min(peak, joint cap / G, F_ROD_MAX r2 |sin mu| / G); the table is written
    # to data/knee_torque_limit.json for the HC2 parameter set (P07 sec. F, P13 step 1).
    tab = knee_limit_table(fam, req, store, meta, names)
    F_rng = (np.array(tab["act_limit_Nm"]) * np.array(tab["G"])) / (r2 * np.abs(np.sin(np.radians(tab["mu_deg"]))))
    add("Knee push-rod at the drive torque limit, whole range 0-130 deg: rod-end static", "M",
        f"{F_rng.max() / 1e3:.1f} kN max", F_rng.max() / 1e3, 30.0, "kN", "C0 ~ 30 kN, verify with chosen part (H7)")
    add("Knee push-rod at the drive torque limit, whole range 0-130 deg: Euler buckling", "M",
        f"{F_rng.max() / 1e3:.1f} kN max", F_rng.max() / 1e3, Pcr / 1e3, "kN", "Pcr (H7)")
    worst = min(tab["demand"].values(), key=lambda d: d["ratio"])
    add("Knee: joint torque available under the limit table vs every simulated sample (x1.2; SD, LM x1.0)", "N",
        f"{worst['scenario']} at {worst['theta_deg']:.0f} deg", worst["demand_Nm"], worst["avail_Nm"], "N m",
        "required >= 1.0; per-scenario table in data/knee_torque_limit.json (H7)", req_sf=1.0)

    # ---------------- thigh: bending at the knee-actuator section from the X drop GRF
    # GRF in X: m (g + a); lever: knee forward offset of the GRF line ~ worst 0.16 m at 60 deg knee flexion
    a_x = (2 * g * 0.15) / (2 * 0.10)
    F_x = m_des * (g + a_x)
    M_thigh = req["knee"]["T_mom_req"] * 1.15                  # thigh carries knee reaction moment + shear
    # twin side plates 7075-T6, each 6 mm thick x 60 mm deep, 60 mm apart, plus CF tube (ignored: conservative)
    t, h = 0.006, 0.060
    I_pl = 2 * (t * h**3 / 12)
    sig = M_thigh * (h / 2) / I_pl
    add("Thigh twin plates 2x 6x60 mm 7075-T6, bending at knee-reaction moment", "X", f"{M_thigh:.0f} N m", sig / 1e6,
        MAT["7075-T6"]["sy"] / 1e6)
    M_n = req["knee"]["T_rep_req"]
    add("Thigh plates, fatigue at repeated knee torque", "N", f"{M_n:.0f} N m", M_n * (h / 2) / I_pl / 1e6,
        MAT["7075-T6"]["fat"] / 1e6, note="R=-1 conservative")
    # ---------------- shank: CF tube 40x36 + 7075 end fittings; bending from foot reaction
    M_shank = max(req["ankle_pitch"]["T_mom_req"], F_x * 0.05)
    do, di = 0.040, 0.036
    sig = M_shank * (do / 2) / tube_I(do, di)
    add("Shank CFRP tube 40x2 mm, bending at ankle", "X", f"{M_shank:.0f} N m", sig / 1e6, MAT["CFRP tube"]["sy"] / 1e6)
    add("Shank CFRP tube axial compression in X drop", "X", f"{F_x / 1e3:.2f} kN", F_x / (pi * (do**2 - di**2) / 4) / 1e6,
        MAT["CFRP tube"]["sy"] / 1e6)
    # ---------------- actuator output flange bolts (friction joint): n bolts on PCD
    for gname, n_b, d_b, pcd in (("KA-130K", 12, "M5 12.9", 0.105), ("KA-110P", 12, "M5 12.9", 0.100), ("KA-90P", 8, "M4 12.9", 0.075)):
        T_mom = max(req[j]["T_mom_req"] if j in req else 0 for j in fam[gname]["joints"] if j != "ankle")
        if gname == "KA-90P":
            T_mom = max(T_mom, LK.ankle_actuator_torque(req["ankle_pitch"]["T_mom_req"], req["ankle_roll"]["T_rep_req"]))
        Fp = {"M5 12.9": 9.9e3, "M4 12.9": 6.9e3}[d_b]     # 70 % proof preload (VDI 2230 table values, mu_thread 0.12)
        T_slip = n_b * Fp * 0.15 * pcd / 2
        add(f"{gname} output flange: {n_b}x {d_b} on PCD {pcd * 1e3:.0f} mm, slip torque (mu 0.15)", "M",
            f"{T_mom:.0f} N m", T_mom, T_slip, "N m", "plus 2 dowels for location; slip = overload fuse")
    # ---------------- ankle cross pins: 100Cr6 12 mm ground (they are needle-roller raceways), double shear
    F_ank = F_x
    tau_pin = F_ank / (2 * pi * 0.012**2 / 4)
    add("Ankle cross pins 100Cr6 60-64 HRC D12 ground, double shear (X drop GRF)", "X", f"{F_ank / 1e3:.2f} kN", tau_pin / 1e6,
        0.58 * MAT["100Cr6 60-64 HRC"]["sy"] / 1e6)
    # ---------------- foot plate: 7075 8 mm with ribs; cantilever toe load = full authority at toe
    M_toe = m_des * g * 1.5 * 0.12
    Z = 0.10 * 0.010**2 / 6 * 2.2           # ribbed section factor ~2.2 over flat 10 mm plate
    add("Foot plate 7075-T6 10 mm ribbed, toe cantilever at 1.5 g", "N", f"{M_toe:.0f} N m", M_toe / Z / 1e6,
        MAT["7075-T6"]["fat"] / 1e6)
    # ---------------- KA-130K planetary: sun-planet Lewis bending, stage 2 (output stage)
    T_out = fam["KA-130K"]["T_peak_out"]
    m_mod, b, z_s, Y, n_pl = 1.25e-3, 0.018, 18, 0.30, 4
    # stage 2 ratio ~3.75 -> carrier torque = T_out; sun torque = T_out / 3.75 ; tangential per planet
    Ft = (T_out / 3.75) / (m_mod * z_s / 2) / n_pl * 1.25    # 1.25 load-sharing factor
    sig = Ft / (b * m_mod * Y)
    add("KA-130K stage-2 sun teeth, Lewis bending (m 1.25, b 18, 4 planets, 17-4PH/18CrNiMo7-6)", "M",
        f"{T_out:.0f} N m out", sig / 1e6, 1170.0, note="carburised 18CrNiMo7-6 preferred (sy > 1000 MPa); AGMA check in FEA phase")
    # ---------------- output crossed-roller bearing life (KA-130K, KA-130H), walking
    C_dyn = 33.1e3    # THK RB9016 (90 x 130 x 16) catalogue dynamic rating, docs/09 hold H1 (verify against the current catalogue)
    P_eq = m_des * g * 1.2 + 2 * req["knee"]["rms_W1"] / 0.11     # radial from weight + moment couple / Dpw
    n_rpm = 30.0
    L10_h = (C_dyn / P_eq) ** (10 / 3) * 1e6 / (60 * n_rpm)
    add("KA-130K output crossed-roller THK RB9016 L10 life at walking load (oscillating, 30 rpm equiv.)", "N",
        f"P_eq {P_eq / 1e3:.1f} kN", 3000.0, L10_h, "h", "required >= 3000 h; value = L10 hours")
    return R


def write_markdown(R):
    GEN = ROOT / "docs" / "generated"
    L = ["# Structural hand checks (generated)", "",
         "Cases: **N** normal repeated peak (x1.2 margin), **M** momentary (0.10 m unplanned drop), "
         "**X** structural (0.15 m drop over 0.10 m). Required SF: X >= 1.5 on yield, N >= 2.0 (fatigue values shown "
         "directly against endurance strength). These are hand calculations to set section sizes; FEA and proof "
         "loading (docs/11) are mandatory before walking trials.", "",
         "| Item | Case | Load | Value | Allowable | SF | Note |", "|---|---|---|---|---|---|---|"]
    for r in R:
        need = r.get("req_sf") or (1.5 if r["case"] in ("X", "M") else 2.0)
        flag = "" if r["SF"] >= need else " ⚠"
        L.append(f"| {r['item']} | {r['case']} | {r['load']} | {r['value']:.1f} {r['unit']} | {r['allow']:.1f} {r['unit']} | "
                 f"**{r['SF']:.2f}**{flag} | {r['note']} |")
    kt = ROOT / "data" / "knee_torque_limit.json"
    if kt.exists():
        tab = json.loads(kt.read_text())
        th = np.array(tab["theta_deg"])
        pts = [0, 20, 40, 60, 80, 100, 120, 130]
        L += ["", "## Knee drive torque limit (hold H7)", "",
              f"τ_act ≤ min({tab['actuator_peak_Nm']:.0f} N·m, {tab['joint_cap_Nm']:.0f} / G(θ), "
              f"{tab['F_rod_max_N'] / 1e3:.0f} kN · r2 · |sin μ(θ)| / G(θ)). Full table: `data/knee_torque_limit.json`.", "",
              "| Knee angle | " + " | ".join(f"{p}°" for p in pts) + " |", "|---|" + "---|" * len(pts)]
        row = lambda key, fmt: " | ".join(fmt.format(np.interp(p, th, tab[key])) for p in pts)
        L.append("| G(θ) | " + row("G", "{:.2f}") + " |")
        L.append("| Transmission angle μ | " + row("mu_deg", "{:.0f}°") + " |")
        L.append("| **Actuator limit (N·m)** | " + row("act_limit_Nm", "{:.0f}") + " |")
        L.append("| Joint torque available (N·m) | " + row("joint_avail_Nm", "{:.0f}") + " |")
        L += ["", "Worst sample per scenario against that table (demand includes the 1.2 margin; SD and LM 1.0):", "",
              "| Scenario | Knee angle | Demand | Available | Ratio |", "|---|---|---|---|---|"]
        for d in sorted(tab["demand"].values(), key=lambda d: d["ratio"]):
            L.append(f"| {d['scenario']} | {d['theta_deg']:.0f}° | {d['demand_Nm']:.0f} N·m | {d['avail_Nm']:.0f} N·m | "
                     f"**{d['ratio']:.2f}** |")
    (GEN / "structure_checks.md").write_text("\n".join(L) + "\n")
