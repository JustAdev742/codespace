#!/usr/bin/env python3
"""KESTREL K1 engineering pipeline. Regenerates every computed table, plot and model.

    python run_all.py            # full run (~3-5 min on 4 cores)

Pipeline
  1. whole-body inverse dynamics over all design scenarios      -> data/scenario_*.{npz,json}
  2. joint requirements                                          -> docs/generated/joint_requirements.md
  3. actuator sizing (motor x gear x drive x linkage)            -> data/actuator_family.json
  4. masses fed back into the model; 1-2 iterate until converged
  5. power budget + battery sizing                               -> docs/generated/power_budget.md
  6. structural hand checks                                      -> docs/generated/structure_checks.md
  7. mass budget                                                 -> docs/generated/mass_budget.md
  8. MuJoCo model with sized torque limits                       -> sim/kestrel_k1.xml
  9. torque-speed envelope plots                                 -> docs/img/envelope_*.png
"""
from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = HERE.parent
DATA, GEN, IMG, SIM = ROOT / "data", ROOT / "docs" / "generated", ROOT / "docs" / "img", ROOT / "sim"
for p in (DATA, GEN, IMG, SIM):
    p.mkdir(parents=True, exist_ok=True)


def reload_all():
    import kestrel.params as P
    importlib.reload(P)
    import kestrel.model, kestrel.dynamics, kestrel.gait, kestrel.scenarios, kestrel.requirements, kestrel.actuators, kestrel.power  # noqa
    for mod in (kestrel.model, kestrel.dynamics, kestrel.gait, kestrel.scenarios, kestrel.requirements, kestrel.actuators, kestrel.power):
        importlib.reload(mod)


def sizing_iteration(max_iter=3):
    from kestrel import actuators as A
    from kestrel import requirements as RQ
    prev = None
    for it in range(max_iter):
        reload_all()
        from kestrel import actuators as A
        from kestrel import requirements as RQ
        from kestrel import params as P
        tot, _, _ = P.mass_summary()
        print(f"[iter {it}] estimated mass {tot:.1f} kg -> running scenarios ...", flush=True)
        store, meta, names = RQ.run_all()
        req, dm = RQ.joint_requirements(store, meta, names)
        fam, rep = A.size_all(store, names, req)
        missing = [g.name for g in A.GROUPS if g.name not in fam]
        if missing:
            raise SystemExit(f"no feasible actuator for {missing}; see diagnostics")
        (DATA / "actuator_family.json").write_text(json.dumps(fam, indent=1, default=float))
        masses = {k: v["mass"] for k, v in fam.items()}
        print(f"[iter {it}] family masses: { {k: round(v, 2) for k, v in masses.items()} }")
        if prev and all(abs(masses[k] - prev[k]) / prev[k] < 0.03 for k in masses):
            break
        prev = masses
    return store, meta, names, req, dm, fam, rep


def write_actuator_md(fam, rep, req):
    from kestrel import actuators as A
    from kestrel import linkages as LK
    L = ["# Actuator family (generated)", "",
         f"Sizing at minimum loaded bus voltage {A.V_MIN:.0f} V (16S). Torques/speeds at the actuator output "
         "(before linkages). Masses are estimates (motor model/datasheet + gear + housing + electronics) until "
         "replaced by CAD masses.", "",
         "| Class | Joints | Motor (status) | Gear | Ratio | Peak out | Continuous out | No-load speed | Speed @ ½ peak | Reflected inertia | Mass | Drive | Feasible options |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for g, a in fam.items():
        st = {"V": "datasheet", "C": "custom KM design"}[a["motor_status"]]
        gear = f"CSG-{a['hd']}-{int(a['ratio'])} strain-wave" if a["hd"] else "2-stage planetary (custom)"
        L.append(f"| **{g}** | {', '.join(a['joints'])} | {a['motor']} ({st}) | {gear} | {a['ratio']:.0f}:1 | {a['T_peak_out']:.0f} N·m | "
                 f"{a['T_cont_out']:.0f} N·m | {a['w_noload_out']:.1f} rad/s | {a['w_at_half_peak']:.1f} rad/s | {a['J_reflected']:.3f} kg·m² | "
                 f"{a['mass']:.2f} kg | {a['drive']} | {a['n_feasible']} |")
    L += ["", "Drives: **HC** = " + A.DRIVES["HC"]["name"] + "; **EV** = " + A.DRIVES["EV"]["name"] + ".", "",
          "## Motor data used", "", "| Motor | Kt (N·m/A rms) | R LL (Ω) | Km (N·m/√W) | Cont / peak (N·m) | Mass (kg) | Rotor J (kg·m²) | OD (mm) | Source |",
          "|---|---|---|---|---|---|---|---|---|"]
    from kestrel.power import km
    for mn in sorted({a["motor"] for a in fam.values()}):
        m = A.MOTORS[mn]
        L.append(f"| {mn} | {m['Kt']:.3f} | {m['R_LL']:.4f} | {km(m):.3f} | {m['T_cont']:.2f} / {m['T_pk']:.2f} | {m['mass']:.3f} | "
                 f"{m['J']:.2e} | {m['OD'] * 1e3:.0f} | {m['src']} |")
    kf = json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    L += ["", "## Knee four-bar", "",
          f"Crank r1 = {kf['r1'] * 1e3:.1f} mm (actuator), rod L = {kf['L'] * 1e3:.1f} mm, knee crank r2 = {kf['r2'] * 1e3:.1f} mm at "
          f"{kf['beta_deg']:.1f}° (shank frame), actuator crank zero at {kf['phi0_deg']:.1f}°, actuator sweep {kf['actuator_sweep_deg']:.0f}°.", "",
          "| Knee angle | 0° | 20° | 40° | 60° | 80° | 100° | 120° | 130° |", "|---|---|---|---|---|---|---|---|---|"]
    th = np.array(kf["theta_deg"])
    row_g, row_mu = ["G = τ_knee/τ_act"], ["transmission angle μ"]
    for a in (0, 20, 40, 60, 80, 100, 120, 130):
        i = int(np.argmin(abs(th - a)))
        row_g.append(f"{kf['G'][i]:.2f}")
        row_mu.append(f"{kf['mu_deg'][i]:.0f}°")
    L += ["| " + " | ".join(row_g) + " |", "| " + " | ".join(row_mu) + " |", "",
          "## Ankle and wrist parallel linkages", "",
          f"Ankle: actuator crank r_c = {LK.ANKLE['r_c'] * 1e3:.0f} mm, foot lever r_p = {LK.ANKLE['r_p'] * 1e3:.0f} mm, half rod spacing d = {LK.ANKLE['d'] * 1e3:.0f} mm. "
          f"Per-actuator torque = r_c(|τp|/2r_p + |τr|/2d): full-authority corner "
          f"{LK.ankle_actuator_torque(req['ankle_pitch']['T_rep_req'], req['ankle_roll']['T_rep_req']):.0f} N·m.", ""]
    (GEN / "actuator_family.md").write_text("\n".join(L) + "\n")


def write_mass_md():
    from kestrel import params as P
    bodies = P.build_bodies()
    tot, cat, by_body = P.mass_summary(bodies)
    L = ["# Mass budget (generated)", "", f"Estimated mass **{tot:.1f} kg**; design mass for requirements **{tot * P.DESIGN_MASS_GROWTH:.1f} kg** "
         f"(x{P.DESIGN_MASS_GROWTH} growth contingency).", "", "## By category", "", "| Category | kg | % |", "|---|---|---|"]
    for k, v in sorted(cat.items(), key=lambda x: -x[1]):
        L.append(f"| {k} | {v:.2f} | {100 * v / tot:.1f} |")
    L += ["", "## By body", "", "| Body | kg | Main components |", "|---|---|---|"]
    for b in bodies:
        if b.name.startswith("r_"):
            continue
        L.append(f"| {b.name}{' (x2)' if b.name.startswith('l_') else ''} | {by_body[b.name]:.2f} | " +
                 "; ".join(f"{c.name} {c.mass:.2f}" for c in b.comps) + " |")
    (GEN / "mass_budget.md").write_text("\n".join(L) + "\n")
    return tot


def write_power_md(store, names, fam):
    from kestrel import power as PW
    from kestrel import requirements as RQ
    e_avg, e_pk = PW.electronics_power()
    rows = {}
    for s in RQ.REPEATED + ["SD"]:
        tot, per = PW.scenario_power(store, names, fam, s)
        rows[s] = dict(mean=float(tot.mean()), peak=float(tot.max()), per={k: float(v.mean()) for k, v in per.items()})
    stand = rows["SL"]["mean"] * 0.5  # double-support standing ~ half of single-leg holding losses
    modes = {
        "Idle standing (perception on, double support)": e_avg * 0.85 + stand,
        "Normal mixed (40 % stand, 30 % walk 0.8 m/s, 30 % manipulation)": e_avg + 0.4 * stand + 0.3 * rows["W1"]["mean"] + 0.3 * rows["AH"]["mean"],
        "Continuous walking 0.8 m/s": e_avg + rows["W1"]["mean"],
        "Demanding (fast walk 1.2 m/s / stairs, continuous)": e_avg + max(rows["W2"]["mean"], rows["ST"]["mean"]),
    }
    peak_W = e_pk + max(r["peak"] for r in rows.values())
    L = ["# Power budget and battery sizing (generated)", "",
         "Actuator electrical power from inverse-dynamics torque/speed through each joint's sized motor, gear, linkage "
         f"and drive (copper loss via Km, gear efficiency both directions, {PW.DRIVE_EFF_LOSS * 100:.0f} % drive loss, "
         f"{PW.REGEN_EFF * 100:.0f} % regeneration recovery).", "",
         "## Electronics", "", "| Load | Typical W | Peak W |", "|---|---|---|"]
    for n, a, p in PW.ELECTRONICS:
        L.append(f"| {n} | {a:.1f} | {p:.1f} |")
    L.append(f"| **Total electronics** | **{e_avg:.0f}** | **{e_pk:.0f}** |")
    L += ["", "## Actuators by scenario", "", "| Scenario | Mean W | Peak W |", "|---|---|---|"]
    for s, r in rows.items():
        L.append(f"| {s} | {r['mean']:.0f} | {r['peak']:.0f} |")
    L += ["", "## Operating modes (whole robot)", "", "| Mode | Average W |", "|---|---|"]
    for k, v in modes.items():
        L.append(f"| {k} | **{v:.0f}** |")
    L += [f"", f"Simultaneous peak (electronics peak + worst actuator peak): **{peak_W:.0f} W**.", "",
          "## Battery options (16S)", "",
          "| Cell | Config | Cells | Energy Wh | Usable Wh | Pack kg (est.) | Runtime normal (h) | Runtime walking (h) | Peak A | A/cell | Sag V |",
          "|---|---|---|---|---|---|---|---|---|---|---|"]
    opts = PW.battery_options(modes["Normal mixed (40 % stand, 30 % walk 0.8 m/s, 30 % manipulation)"], peak_W)
    for o in opts:
        rw = o["usable_Wh"] / modes["Continuous walking 0.8 m/s"]
        L.append(f"| {o['cell']} | {o['config']} | {o['cells']} | {o['Wh']:.0f} | {o['usable_Wh']:.0f} | {o['pack_kg']:.1f} | "
                 f"{o['runtime_h']:.1f} | {rw:.1f} | {o['I_peak']:.0f} | {o['I_per_cell']:.1f} | {o['sag_V']:.1f} |")
    (GEN / "power_budget.md").write_text("\n".join(L) + "\n")
    json.dump(dict(modes=modes, peak_W=peak_W, electronics=(e_avg, e_pk), scenarios={k: {kk: vv for kk, vv in v.items() if kk != "per"} for k, v in rows.items()}),
              open(DATA / "power_budget.json", "w"), indent=1)
    return modes, peak_W


def write_envelope_plots(store, names, fam):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from kestrel import actuators as A
    from kestrel import requirements as RQ
    for g, a in fam.items():
        fig, ax = plt.subplots(figsize=(7, 4.6))
        m = A.MOTORS[a["motor"]]
        N, eta = a["ratio"], A.ETA[a["gear"]]
        T_av = min(m["T_pk"], m["Kt"] * A.DRIVES[a["drive"]]["I_pk"])
        tt = np.linspace(0, T_av, 60)
        ax.plot(A.omega_lim(m, tt) / N, tt * N * eta, "k-", lw=2, label=f"actuator limit @ {A.V_MIN:.0f} V")
        ax.axhline(a["T_cont_out"], color="tab:red", ls="--", label="continuous (thermal)")
        cmap = plt.get_cmap("tab20")
        for j in a["joints"]:
            t, w, tag = A.actuator_points(store, names, j)
            for k, s in enumerate(RQ.REPEATED + ["SD"]):
                sel = tag == s
                if sel.any() and t[sel].max() > 0.5:
                    ax.scatter(w[sel], t[sel], s=3, color=cmap(k % 20), label=f"{j}:{s}" if t[sel].max() > 0.15 * T_av * N else None)
        ax.set_xlabel("actuator speed (rad/s)")
        ax.set_ylabel("actuator torque (N·m)")
        ax.set_title(f"{g}: {a['motor']} + {int(N)}:1 — simulated operating points (no margins)")
        ax.grid(alpha=0.3)
        ax.legend(fontsize=6, ncol=2, loc="upper right")
        fig.tight_layout()
        fig.savefig(IMG / f"envelope_{g}.png", dpi=110)
        plt.close(fig)


def export_mjcf(fam, req):
    from kestrel import model as Mo
    from kestrel import params as P
    from kestrel import linkages as LK
    eff = {}
    jt = P.joint_table()
    for jn, j in jt.items():
        base = jn[2:] if jn[:2] in ("l_", "r_") else jn
        a = P.ACT[j["act"]]
        famrow = fam.get(j["act"])
        if base == "knee":
            eff[jn] = famrow["T_peak_out"] * 1.2  # G ~ 1.2 typical across the stance-to-flexed range
        elif base in ("ankle_pitch",):
            eff[jn] = 2 * fam["KA-90P"]["T_peak_out"] * LK.ANKLE["r_p"] / LK.ANKLE["r_c"]
        elif base in ("ankle_roll",):
            eff[jn] = 2 * fam["KA-90P"]["T_peak_out"] * LK.ANKLE["d"] / LK.ANKLE["r_c"]
        elif base in ("wrist_pitch", "wrist_roll"):
            eff[jn] = req[base]["T_rep_req"] * 1.3
        elif famrow:
            eff[jn] = famrow["T_peak_out"]
    xml = Mo.build_mjcf(mass_scale=1.0, effort=eff, damping=0.5, timestep=0.002)
    (SIM / "kestrel_k1.xml").write_text(xml)
    return eff


def main():
    store, meta, names, req, dm, fam, rep = sizing_iteration()
    from kestrel import requirements as RQ
    from kestrel import structure as ST
    import json as _j
    _j.dump(req, open(DATA / "joint_requirements.json", "w"), indent=1)
    RQ.write_markdown(req, meta, dm)
    write_actuator_md(fam, rep, req)
    tot = write_mass_md()
    modes, peak = write_power_md(store, names, fam)
    R = ST.checks(store, meta, names, req, fam)
    ST.write_markdown(R)
    write_envelope_plots(store, names, fam)
    eff = export_mjcf(fam, req)
    print(f"done: estimated mass {tot:.1f} kg | modes { {k[:22]: round(v) for k, v in modes.items()} } | peak {peak:.0f} W")
    for r in R:
        print(f"  SF {r['SF']:5.2f}  {r['case']}  {r['item'][:80]}")


if __name__ == "__main__":
    main()
