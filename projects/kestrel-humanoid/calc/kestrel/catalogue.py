"""Per-joint actuator spec sheets + custom KM motor design sheets (generated markdown)."""
from __future__ import annotations

import json
from math import pi, sqrt
from pathlib import Path

import numpy as np

from . import actuators as A
from . import linkages as LK
from . import motor_design as MD
from . import params as P

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "docs" / "generated"

DECISION = {
    "KA-130K": ("build", "custom KM-130x45 motor + custom planetary; no verified commercial kit meets the walking thermal duty at 52 V"),
    "KA-130H": ("build", "same housing as KA-130K, 40 mm stack"),
    "KA-110P": ("modify", "buy TQ ILM85x26 frameless kit; custom housing + planetary"),
    "KA-90P": ("modify", "buy CubeMars RI85-PH frameless kit; custom housing + planetary"),
    "KH-25": ("modify", "buy TQ ILM85x13 + Leaderdrive size-25 set; custom housing + torque flexure"),
    "KH-20": ("modify", "buy RI85-PH + size-20 set; custom housing + torque flexure"),
    "KH-14": ("build", "custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 set"),
}
COMMERCIAL_ALT = {
    "KA-130K": "MyActuator X15-450 (450 N·m pk, 3.5 kg, rated at 72 V — ~25 % slower at 59 V); for Phase-0 mules only",
    "KA-130H": "MyActuator X12-320 (320 N·m pk, 125 rpm no-load, 2.37 kg, EtherCAT) [ds R1]",
    "KA-110P": "MyActuator X12-320 / X10-200 [ds R1]",
    "KA-90P": "RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1]",
    "KH-25": "MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1]",
    "KH-20": "MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1]",
    "KH-14": "CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — needs a 24 V branch) [ds R1]",
}
JOINT_RANGE = {k: v[1] for k, v in P.JOINTS_LEFT.items()}
JOINT_RANGE.update({k: v[1] for k, v in P.JOINTS_CENTRE.items()})


def joint_sheets():
    req = json.loads((ROOT / "data" / "joint_requirements.json").read_text())
    fam = json.loads((ROOT / "data" / "actuator_family.json").read_text())
    kf = json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    G = np.array(kf["G"])
    L = ["# Joint actuator spec sheets (generated)", "",
         "Joint-side capability after linkages. Peak = actuator peak (motor saturation or drive current, whichever is lower) × ratio × gear efficiency × linkage. "
         "Margin = capability / requirement (requirements already include ×1.2 torque and ×1.15 speed margins). "
         "Continuous = thermal at the stated derate. Speed = no-load at 52 V minimum bus (field weakening not counted).", ""]
    order = ["hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll", "waist_yaw", "waist_pitch", "shoulder_pitch",
             "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll", "neck_yaw", "neck_pitch"]
    group_of = {}
    for g, a in fam.items():
        for j in a["joints"]:
            group_of[j] = g
    for j in order:
        r = req[j]
        rng = JOINT_RANGE[j]
        L.append(f"## {j.replace('_', ' ').title()}  (range {rng[0]}° … {rng[1]}°)")
        L.append("")
        if j in ("wrist_pitch", "wrist_roll"):
            F = LK.wrist_actuator_force(req["wrist_pitch"]["T_rep_req"], req["wrist_roll"]["T_rep_req"])
            v = LK.wrist_actuator_speed(req["wrist_pitch"]["w_req"], 0)
            L += [f"Actuation: two parallel ball-screw linear actuators (maxon DCX 16 L + GPX 16 + KSS Ø6 × 2 mm) on lever arms "
                  f"r_p = {LK.WRIST['r_p'] * 1e3:.0f} mm / d = {LK.WRIST['d'] * 1e3:.0f} mm. Required force per actuator at the combined corner "
                  f"≈ {F:.0f} N; speed ≈ {v * 1e3:.0f} mm/s. DCX 16 L (10.9 mN·m cont, 37 mN·m stall [ds R5]) × GPX 16 3.9:1 × 2π/2 mm × 0.88 "
                  f"gives ≈ {10.9e-3 * 3.9 * 0.9 * 2 * pi / 0.002 * 0.88:.0f} N continuous / ≈ {37e-3 * 3.9 * 0.9 * 2 * pi / 0.002 * 0.88:.0f} N stall. "
                  f"Requirement: {r['T_rep_req']:.0f} N·m repeated, {r['w_req']:.1f} rad/s. Build class: **modify** (buy motor/gearhead/screw, custom housing).", ""]
            continue
        g = group_of["ankle" if j.startswith("ankle") else j]
        a = fam[g]
        m = A.MOTORS[a["motor"]]
        if j == "knee":
            from . import requirements as RQ
            store, _, names = RQ.load()
            Gf = LK.knee_G_function()
            ik = names.index("l_knee")
            env = []
            for sc in RQ.REPEATED:
                t, q = np.abs(store[f"{sc}/tau"][:, ik]), store[f"{sc}/q"][:, ik]
                sel = t > 20
                if sel.any():
                    env.append((a["T_peak_out"] * Gf(q[sel]) / (RQ.MARGIN_T * t[sel])).min())
            cap_pk = (a["T_peak_out"] * G.min(), a["T_peak_out"] * G.max())
            cap_c = a["T_cont_out"] * G.min()
            cap_w = a["w_noload_out"] / G.min()
            trans = f"four-bar, G = {G.min():.2f}–{G.max():.2f} (see knee_linkage.svg)"
            pk_txt = f"{cap_pk[0]:.0f} N·m at 20–40° … {cap_pk[1]:.0f} N·m at 110° (by angle)"
            pk_margin = min(env)
            L.append(f"*Knee margin is the envelope margin: min over every simulated sample of capability-at-that-angle / (1.2 × demand). "
                     f"The by-angle minimum ({cap_pk[0]:.0f} N·m) occurs at 20–40°, where demands are lower.*")
            L.append("")
        elif j == "ankle_pitch":
            cap_p = 2 * a["T_peak_out"] * LK.ANKLE["r_p"] / LK.ANKLE["r_c"]
            cap_c = 2 * a["T_cont_out"] * LK.ANKLE["r_p"] / LK.ANKLE["r_c"]
            cap_w = a["w_noload_out"] * LK.ANKLE["r_c"] / LK.ANKLE["r_p"]
            trans = f"2 push-rods, r_c {LK.ANKLE['r_c'] * 1e3:.0f} / r_p {LK.ANKLE['r_p'] * 1e3:.0f} mm (shared with roll)"
            pk_txt = f"{cap_p:.0f} N·m (pure pitch)"
            pk_margin = cap_p / r["T_rep_req"]
        elif j == "ankle_roll":
            cap_p = 2 * a["T_peak_out"] * LK.ANKLE["d"] / LK.ANKLE["r_c"]
            cap_c = 2 * a["T_cont_out"] * LK.ANKLE["d"] / LK.ANKLE["r_c"]
            cap_w = a["w_noload_out"] * LK.ANKLE["r_c"] / LK.ANKLE["d"]
            trans = f"2 push-rods, half spacing d {LK.ANKLE['d'] * 1e3:.0f} mm (shared with pitch)"
            pk_txt = f"{cap_p:.0f} N·m (pure roll)"
            pk_margin = cap_p / r["T_rep_req"]
        else:
            cap_c = a["T_cont_out"]
            cap_w = a["w_noload_out"]
            trans = "direct"
            pk_txt = f"{a['T_peak_out']:.0f} N·m"
            pk_margin = a["T_peak_out"] / r["T_rep_req"]
        gear = f"CSG-{a['hd']}-{int(a['ratio'])} strain-wave (Leaderdrive LHSG equivalent)" if a["hd"] else f"2-stage planetary {a['ratio']:.0f}:1 (custom, ground)"
        eta = A.ETA[a["gear"]]
        dec = DECISION[g]
        L += ["| Item | Requirement | Delivered | Margin |", "|---|---|---|---|",
              f"| Peak (repeated) torque | {r['T_rep_req']:.0f} N·m (sim {r['peak_rep']:.0f} in {r['peak_rep_case']}) | {pk_txt} | {pk_margin:.2f} |",
              f"| Momentary torque (gear/structure must survive) | {r['T_mom_req']:.0f} N·m | " + (f"gear momentary {A.HD_CSG[a['hd']]['r'][int(a['ratio'])][3]} N·m" if a['hd'] else "flange slip ≥ 2.15× (structure.py)") + " | — |",
              f"| Continuous torque | {r['T_cont_req']:.0f} N·m (RMS W1/W2/ST {r['rms_W1']:.0f}/{r['rms_W2']:.0f}/{r['rms_ST']:.0f}) | {cap_c:.0f} N·m | {cap_c / max(r['T_cont_req'], 1e-6):.2f} |" if r['T_cont_req'] > 1 else
              f"| Continuous torque | < 1 N·m | {cap_c:.0f} N·m | — |",
              f"| Static hold | {r['hold']:.0f} N·m ({r['hold_case'] or '—'}) | ≤ {1.5 * cap_c:.0f} N·m for 60 s | — |",
              f"| Speed | {r['w_req']:.1f} rad/s (sim {r['vmax']:.1f}) | {cap_w:.1f} rad/s no-load | {cap_w / r['w_req']:.2f} |",
              f"| Peak mechanical power | {r['pmax']:.0f} W | — | — |", "",
              f"* Actuator class **{g}** — motor **{a['motor']}** ({m['src']}), {gear}, gear efficiency {eta:.2f} (assumed, to be measured), transmission: {trans}.",
              f"* Motor: Kt {m['Kt']:.3f} N·m/A rms, R(LL) {m['R_LL'] * 1e3:.0f} mΩ, continuous {m['T_cont']:.2f} N·m, peak {m['T_pk']:.1f} N·m; drive {a['drive']}; reflected inertia {a['J_reflected']:.3f} kg·m²; actuator mass ≈ {a['mass']:.2f} kg [est].",
              f"* Thermal: continuous rating at derate {'1.00 (ducted air, potted stator)' if g.startswith('KA-130') else '0.85 (conduction to structure)'}; winding NTC limit 130 °C warn / 150 °C trip.",
              f"* Build class: **{dec[0]}** — {dec[1]}. Commercial alternative: {COMMERCIAL_ALT[g]}.", ""]
    (GEN / "joint_catalogue.md").write_text("\n".join(L) + "\n")


def km_sheets():
    L = ["# Custom KM motor design sheets (generated by calc/kestrel/motor_design.py)", "",
         "Analytic, calibrated to CubeMars RI115-PH and TQ ILM115x25 datasheets (Km within ±5 % after a single resistance factor). "
         "Confirm in FEA (FEMM 2-D magnetostatic + Motor-CAD thermal) before cutting laminations.", "",
         "| Quantity | " + " | ".join(A.CUSTOM) + " |", "|---|" + "---|" * len(A.CUSTOM)]
    D = {k: MD.design(s) for k, s in A.CUSTOM.items()}
    def row(name, f):
        L.append(f"| {name} | " + " | ".join(f(D[k], A.CUSTOM[k]) for k in A.CUSTOM) + " |")
    row("Stator OD / stack (mm)", lambda d, s: f"{s.D_o * 1e3:.0f} / {s.L * 1e3:.0f}")
    row("Slots / poles", lambda d, s: f"{s.Qs} / {s.poles}")
    row("Winding factor kw1", lambda d, s: f"{d['kw']:.3f}")
    row("Airgap diameter / mech. airgap (mm)", lambda d, s: f"{d['D_g'] * 1e3:.1f} / {s.g * 1e3:.2f}")
    row("Magnets: thickness, arc, grade", lambda d, s: f"{s.h_m * 1e3:.1f} mm, {s.alpha_m:.2f}, N42SH")
    row("Airgap flux density Bg / Bg1 (T, 80 °C)", lambda d, s: f"{d['Bg']:.2f} / {d['Bg1']:.2f}")
    row("Tooth width / yoke / slot depth (mm)", lambda d, s: f"{d['w_t'] * 1e3:.1f} / {d['h_y'] * 1e3:.1f} / {d['h_s'] * 1e3:.1f}")
    row("Slot area (mm²), fill", lambda d, s: f"{d['A_slot'] * 1e6:.0f}, {s.k_fill:.2f}")
    row("Turns per coil × parallel paths", lambda d, s: f"{s.N_c} × {s.a}")
    row("Conductor (equiv. Ø mm)", lambda d, s: f"{d['wire_d_equiv'] * 1e3:.2f} (use multi-strand)")
    row("Series turns per phase", lambda d, s: f"{d['N_ph']:.0f}")
    row("Kt (N·m/A rms)", lambda d, s: f"{d['Kt']:.3f}")
    row("Ke line-line peak (V·s/rad)", lambda d, s: f"{d['Ke_LL_pk']:.3f}")
    row("R line-line @120 °C / 20 °C (mΩ)", lambda d, s: f"{d['R_LL'] * 1e3:.1f} / {d['R_LL20'] * 1e3:.1f}")
    row("Km (N·m/√W)", lambda d, s: f"{d['Km']:.3f}")
    row("Continuous current / torque (7 A/mm²)", lambda d, s: f"{d['I_cont']:.1f} A / {d['T_cont']:.2f} N·m")
    row("Peak current / torque (28 A/mm², saturation-limited)", lambda d, s: f"{d['I_pk']:.0f} A / {d['T_pk']:.1f} N·m")
    row("Copper loss cont / peak (W)", lambda d, s: f"{d['P_cu_cont']:.0f} / {d['P_cu_peak']:.0f}")
    row("No-load speed @ 52 V (rpm)", lambda d, s: f"{52 / d['Ke_LL_pk'] * 60 / (2 * pi):.0f}")
    row("Mass: stator Fe / Cu / magnets / rotor Fe / total (kg)", lambda d, s: f"{d['m_stator_fe']:.2f} / {d['m_cu']:.2f} / {d['m_mag']:.2f} / {d['m_rotor_fe']:.2f} / {d['mass']:.2f}")
    row("Rotor inertia (kg·m²)", lambda d, s: f"{d['J_rotor']:.2e}")
    row("Rotor OD / ID (mm)", lambda d, s: f"{d['rotor_OD'] * 1e3:.1f} / {d['rotor_ID'] * 1e3:.1f}")
    row("Overall length incl. end turns (mm)", lambda d, s: f"{d['length_total'] * 1e3:.0f}")
    (GEN / "km_motor_designs.md").write_text("\n".join(L) + "\n")





SCRATCH = [
    ("KM-130x45", "KA-130K knee", MD.MotorSpec("KM-130x45", D_o=0.130, split=0.74, L=0.045, Qs=36, poles=42, N_c=5, a=2, h_m=0.0030), "custom (no commercial equivalent verified)"),
    ("KM-130x40", "KA-130H hip pitch", MD.MotorSpec("KM-130x40", D_o=0.130, split=0.74, L=0.040, Qs=36, poles=42, N_c=3, h_m=0.0030), "custom"),
    ("KM-85x26", "KA-110P (replaces TQ ILM85x26)", MD.MotorSpec("KM-85x26", D_o=0.085, split=0.70, L=0.026, Qs=36, poles=42, N_c=6, h_m=0.0025), "ILM85x26: Kt 0.253, Km 0.365 (calc)"),
    ("KM-85x17", "KA-90P, KH-20 (replaces CubeMars RI85-PH)", MD.MotorSpec("KM-85x17", D_o=0.085, split=0.70, L=0.017, Qs=36, poles=42, N_c=5, h_m=0.0025), "RI85-PH: Kt 0.13, Km 0.285"),
    ("KM-85x12", "KH-25 (replaces TQ ILM85x13)", MD.MotorSpec("KM-85x12", D_o=0.085, split=0.70, L=0.012, Qs=36, poles=42, N_c=7, h_m=0.0025), "ILM85x13: Kt 0.134, Km 0.233 (calc)"),
    ("KM-50x20", "KH-14 wrist yaw, neck", MD.MotorSpec("KM-50x20", D_o=0.050, split=0.62, L=0.020, Qs=12, poles=14, N_c=18, h_m=0.0020, g=0.0004), "custom"),
]


def scratch_sheets():
    from math import pi
    L = ["# Scratch-build motor family (generated)", "",
         "A custom motor for every actuator class, sized to match (or replace) the motor chosen in the baseline. "
         "Model: calc/kestrel/motor_design.py, calibrated against RI115-PH and ILM115x25; at Ø85 it reproduces ILM85x26 / RI85-PH / ILM85x13 "
         "Km within ±6 %. Confirm every design in FEMM before cutting laminations (docs/13 §3.1).", "",
         "| Motor | For | Stator OD × stack | Slots/poles | Turns × paths | Kt (N·m/A) | R LL 20 °C (mΩ) | Km | Cont / peak (N·m) | No-load @52 V (rpm) | Mass (kg) | Baseline equivalent |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for name, use, s, eq in SCRATCH:
        d = MD.design(s)
        L.append(f"| **{name}** | {use} | Ø{s.D_o * 1e3:.0f} × {s.L * 1e3:.0f} | {s.Qs}/{s.poles} | {s.N_c} × {s.a} | {d['Kt']:.3f} | {d['R_LL20'] * 1e3:.0f} | {d['Km']:.3f} | "
                 f"{d['T_cont']:.2f} / {d['T_pk']:.1f} | {52 / d['Ke_LL_pk'] * 60 / (2 * pi):.0f} | {d['mass']:.2f} | {eq} |")
    L += ["", "## Lamination and winding geometry", "",
          "| Motor | Airgap Ø (mm) | Tooth width | Yoke | Slot depth | Slot area | Conductor equiv. Ø | Magnet arc × thickness × length | Rotor OD/ID |", "|---|---|---|---|---|---|---|---|---|"]
    for name, use, s, eq in SCRATCH:
        d = MD.design(s)
        L.append(f"| {name} | {d['D_g'] * 1e3:.1f} | {d['w_t'] * 1e3:.1f} | {d['h_y'] * 1e3:.1f} | {d['h_s'] * 1e3:.1f} | {d['A_slot'] * 1e6:.0f} mm² | {d['wire_d_equiv'] * 1e3:.2f} mm | "
                 f"{s.alpha_m * 180 * 2 / s.poles:.2f}° × {s.h_m * 1e3:.1f} × {s.L * 1e3:.0f} mm (×{s.poles}) | {d['rotor_OD'] * 1e3:.1f} / {d['rotor_ID'] * 1e3:.1f} |")
    L += ["", "## Winding layouts (double-layer tooth coils, coil k wound around tooth k; star connection)", ""]
    done = set()
    for name, use, s, eq in SCRATCH:
        key = (s.Qs, s.poles)
        if key in done:
            continue
        done.add(key)
        coils, kw = MD.winding_layout(*key)
        L.append(f"**{s.Qs} slots / {s.poles} poles** (kw1 = {kw:.3f}). '+' = wind clockwise seen from the lead end, '−' = counter-clockwise. "
                 "Connect all coils of one phase in series (or in the stated parallel paths), observing the sign, then join the three phase ends in a star.")
        L.append("")
        for i in range(0, len(coils), 12):
            L.append("`" + "  ".join(f"T{j + 1:02d}:{c}" for j, c in enumerate(coils[i:i + 12], start=i)) + "`  ")
        L.append("")
    (GEN / "km_scratch_designs.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    joint_sheets()
    km_sheets()
    scratch_sheets()
    print("written joint_catalogue.md, km_motor_designs.md, km_scratch_designs.md")
