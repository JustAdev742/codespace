"""KESTREL S1 actuator selection: off-the-shelf actuator modules against the simulated requirements.

    python simple/calc/s1_select.py            # iterate requirements <-> selection, write the reports

Loop (converges in 2-3 passes):
  1. whole-body inverse dynamics of the S1 model over the K1 scenario set (minus torso bend) at design
     mass -> per-joint requirements (calc/kestrel/requirements.py, variant s1)
  2. for every joint class, every catalogue actuator (data/cots_actuators.json, sourced in
     docs/research/R9) x every allowed external reduction (timing belt for knee / hip pitch, the K1
     parallel ankle linkage for the ankle) is checked against:
       repeated peak  : T_rep_req  <= 0.90 x T_peak x r x eta      (10 % headroom for control)
       momentary      : T_mom_req  <= 1.00 x T_peak x r x eta      (missed-step case; actuator may saturate)
       continuous     : T_cont_req <= DERATE x T_rated x r x eta    (DERATE 0.80: no heatsink, enclosed frame)
       envelope       : every simulated (torque, speed) sample x margins (1.2, 1.15) under a conservative
                        torque-speed line (no-load speed falling to 40 % at peak torque)
     entries without a published speed or rated torque are skipped (we do not guess datasheets)
  3. the cheapest feasible option per class wins (the "strongest" option is reported alongside);
     its mass (+ reduction hardware) and an estimated rotor inertia go back into the S1 model.
Outputs: simple/data/actuator_family.json, simple/generated/actuator_selection.md
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ["KESTREL_VARIANT"] = "s1"
HERE = Path(__file__).resolve().parent
PROJ = HERE.parents[1]
sys.path.insert(0, str(PROJ / "calc"))

import numpy as np  # noqa: E402

from kestrel import linkages as LK  # noqa: E402
from kestrel import params as P  # noqa: E402
from kestrel import requirements as RQ  # noqa: E402

CAT = PROJ / "data" / "cots_actuators.json"
DERATE = 0.80
# Per-joint thermal derate where the mounting is better than "enclosed": the hip-pitch X12 is direct-drive (as built in
# simple/cad) on an open aluminium cradle plate with a 40 mm 12 V fan blowing across its housing (2 W) -> 0.90.
# Firmware must still derate on the actuator's temperature reading (docs/S1-software.md, safety layer).
JOINT_DERATE = {"hip_pitch": 0.90}
HEADROOM = 0.90
ETA_BELT = 0.95
ETA_LINK = 0.97
AUD_PER_USD = 1.52
V_BUS = 48.0          # 13S Li-ion nominal (54.6 V full): MyActuator X2-X8 max 55 V, DAMIAO J10010 <= 52 V advised (R9)
# mass is not free: each kg on a limb costs torque upstream. Cost function = price + LAMBDA x mass (USD/kg),
# heavier penalty the further out on the chain the actuator sits
# one protocol, one tool chain, one spares box: every maker other than RobStride (AU stock, published overload
# tables - R9) carries an integration penalty, so a second brand appears only where RobStride cannot do the job
PREFERRED_MAKER = "RobStride"
BRAND_PENALTY = 200.0
LAMBDA = {"S-LX": 250, "S-L": 250, "S-M": 250, "S-A": 400, "S-SH": 400, "S-EL": 600, "S-WR": 900, "S-NK": 400}

# joint classes: joints served, allowed external reductions, reduction hardware mass per actuator (kg).
# hw_kg is 0 now: belts, pulleys, cranks and levers are in the CAD structure masses (calc/kestrel/variant_s1.py)
CLASSES = {
    "S-LX": dict(joints=["hip_pitch", "knee"], reductions={"hip_pitch": [1.0], "knee": [1.0, 1.5, 2.0, 2.5, 3.0]},
                 hw_kg=0.0, note="knee driven by an HTD-8M belt from the upper thigh; hip pitch direct or belt"),
    "S-L": dict(joints=["hip_roll"], reductions={"hip_roll": [1.0, 1.5, 2.0]}, hw_kg=0.0,
                note="direct, or a crank + push-rod (rod ends) when the continuous pelvis-holding torque needs it"),
    "S-M": dict(joints=["hip_yaw", "waist_yaw"], reductions={"hip_yaw": [1.0], "waist_yaw": [1.0]}, hw_kg=0.0, note="direct"),
    "S-A": dict(joints=["ankle"], reductions={"ankle": [1.0, 1.25, 1.5]}, hw_kg=0.0,
                note="two actuators per ankle through the K1 parallel push-rod linkage (crank 40 mm, foot levers 52 mm; "
                     "a reduction r > 1 means foot levers of 52 x r mm)"),
    "S-SH": dict(joints=["shoulder_pitch", "shoulder_roll"], reductions={"shoulder_pitch": [1.0], "shoulder_roll": [1.0]}, hw_kg=0.0, note="direct"),
    "S-EL": dict(joints=["shoulder_yaw", "elbow"], reductions={"shoulder_yaw": [1.0], "elbow": [1.0]}, hw_kg=0.0, note="direct"),
    "S-WR": dict(joints=["wrist_yaw", "wrist_pitch"], reductions={"wrist_yaw": [1.0], "wrist_pitch": [1.0]}, hw_kg=0.0, note="direct"),
    "S-NK": dict(joints=["neck_yaw", "neck_pitch"], reductions={"neck_yaw": [1.0], "neck_pitch": [1.0]}, hw_kg=0.0, note="direct"),
}


def load_catalogue():
    """Integrated (motor + gear + driver) 48 V-class modules with complete, maker-verified data."""
    cat = json.loads(CAT.read_text())
    ok = []
    for a in cat:
        if not all(isinstance(a.get(k), (int, float)) and a.get(k) for k in ("peak_Nm", "rated_Nm", "speed_rads", "mass_kg")):
            continue
        if not a.get("verified") or "no integrated driver" in (a.get("name", "") + " " + str(a.get("notes", ""))).lower():
            continue
        v = a.get("voltage_V") or 0
        if v < 44:                       # 24/36 V units would be destroyed on a 13S bus
            continue
        price = a.get("price_usd") or (a.get("price_aud") / AUD_PER_USD if a.get("price_aud") else None)
        if not price:
            continue
        # speed is voltage-limited: scale a higher-voltage rating down to the 48 V bus
        a = dict(a, price=float(price), speed_rads=a["speed_rads"] * min(1.0, V_BUS / v))
        ok.append(a)
    return ok


def joint_need(req, j):
    """(T_rep, T_mom, T_cont, w) requirement corners on the actuator side BEFORE external reduction."""
    if j == "ankle":
        rp, rr = req["ankle_pitch"], req["ankle_roll"]
        return (float(LK.ankle_actuator_torque(rp["T_rep_req"], rr["T_rep_req"])),
                float(LK.ankle_actuator_torque(rp["T_mom_req"], rr["T_rep_req"])),
                float(LK.ankle_actuator_torque(rp["T_cont_req"], rr["T_cont_req"])),
                float(LK.ankle_actuator_speed(rp["w_req"], 0)))
    r = req[j]
    return r["T_rep_req"], r["T_mom_req"], r["T_cont_req"], r["w_req"]


def samples(store, names, j):
    """|tau|, |w| of every repeated + momentary sample (joint side; ankle mapped to one push-rod actuator)."""
    idx = {n: i for i, n in enumerate(names)}
    T, W, M = [], [], []
    for sc in RQ.REPEATED + RQ.MOMENTARY:
        tau, qd = store[f"{sc}/tau"], store[f"{sc}/qd"]
        if j == "ankle":
            ip, ir = idx["l_ankle_pitch"], idx["l_ankle_roll"]
            t = LK.ankle_actuator_torque(tau[:, ip], tau[:, ir])
            w = LK.ankle_actuator_speed(qd[:, ip], qd[:, ir])
        else:
            i = idx[j] if j in idx else idx[f"l_{j}"]
            t, w = np.abs(tau[:, i]), np.abs(qd[:, i])
        T.append(t), W.append(w), M.append(np.full(len(t), sc in RQ.MOMENTARY))
    return np.concatenate(T), np.concatenate(W), np.concatenate(M)


def w_line(a, t):
    """Conservative torque-speed line of a COTS module at nominal bus voltage: no-load speed at zero torque
    falling to 40 % of it at peak torque (QDD modules are voltage-limited near their peak)."""
    return a["speed_rads"] * (1.0 - 0.6 * np.clip(t / a["peak_Nm"], 0, 1))


def check(a, need, smp, r, eta, derate=DERATE):
    """Every simulated sample with the requirement margins must sit under the torque-speed line; peaks,
    momentary, continuous and hold checked as for K1 (calc/kestrel/actuators.py)."""
    T_rep, T_mom, T_cont, w_req = need
    t, w, mom = smp
    ta, wa = t / (r * eta), w * r
    tp = a["peak_Nm"]
    nrm = ~mom
    t_need = np.concatenate([ta[nrm] * RQ.MARGIN_T, [T_rep / (r * eta)]])
    w_need = np.concatenate([wa[nrm] * RQ.MARGIN_W, [1.0]])
    sim_w = (wa[nrm] * RQ.MARGIN_W).max() if nrm.any() else 0.0
    if w_req * r > sim_w + 1e-6:                  # an analytic speed minimum governs: 50 % torque at that speed
        t_need = np.append(t_need, 0.5 * T_rep / (r * eta))
        w_need = np.append(w_need, w_req * r)
    m = dict(peak=HEADROOM * tp / t_need.max(),
             speed=float(np.min(w_line(a, t_need) / np.maximum(w_need, 1e-6))),
             mom=tp / max(ta[mom].max() if mom.any() else 0.0, T_mom / (r * eta), 1e-6),
             cont=derate * a["rated_Nm"] / (T_cont / (r * eta)) if T_cont > 0.5 else 9.9)
    return min(m.values()) >= 1.0, m


def select(req, cat, store, names):
    fam, report = {}, {}
    smp = {j: samples(store, names, j) for spec in CLASSES.values() for j in spec["joints"]}
    for cls, spec in CLASSES.items():
        options = []
        for a in cat:
            per_joint, feasible = {}, True
            for j in spec["joints"]:
                eta_ext = ETA_LINK if j == "ankle" else ETA_BELT
                best = None
                for r in spec["reductions"][j]:
                    ok, m = check(a, joint_need(req, j), smp[j], r, 1.0 if r == 1.0 else eta_ext, JOINT_DERATE.get(j, DERATE))
                    if ok:
                        best = (r, m)
                        break               # smallest reduction that works (keeps speed and back-drivability)
                if best is None:
                    feasible = False
                    break
                per_joint[j] = best
            if feasible:
                n_red = sum(1 for (r, _) in per_joint.values() if r > 1.0)
                mass = a["mass_kg"] + (spec["hw_kg"] if n_red else 0.0)
                options.append(dict(act=a, per_joint=per_joint, mass=mass, price=a["price"],
                                    min_margin=min(min(m.values()) for (_, m) in per_joint.values())))
        options.sort(key=lambda o: o["price"] + LAMBDA[cls] * o["mass"]
                     + (0.0 if PREFERRED_MAKER.lower() in str(o["act"].get("maker", "")).lower() else BRAND_PENALTY))
        report[cls] = options
        if options:
            o = options[0]
            a = o["act"]
            r_main = max(r for (r, _) in o["per_joint"].values())
            # rotor inertia estimate where the datasheet gives none: rotor ~25 % of module mass at ~0.4 x OD/2
            od = (a.get("od_mm") or 80) / 1000
            J = a.get("rotor_J") or 0.25 * a["mass_kg"] * (0.4 * od / 2) ** 2
            fam[cls] = dict(mass=round(o["mass"], 3), rotor_J=J, ratio=float(a.get("ratio") or 9.0) * r_main,
                            actuator=a["name"], maker=a.get("maker"), price_usd=a["price"],
                            reductions={j: r for j, (r, _) in o["per_joint"].items()},
                            peak_Nm=a["peak_Nm"], rated_Nm=a["rated_Nm"], speed_rads=a["speed_rads"],
                            min_margin=round(o["min_margin"], 2), source_url=a.get("source_url"),
                            verified=a.get("verified"))
    return fam, report


def write_report(req, fam, report, design_mass, passes):
    gen = P.GEN_DIR
    gen.mkdir(parents=True, exist_ok=True)
    L = ["# KESTREL S1 actuator selection (generated)", "",
         f"Generated by `simple/calc/s1_select.py` after {passes} requirement/selection passes. Design mass "
         f"**{design_mass:.1f} kg** (estimate x {P.DESIGN_MASS_GROWTH:.2f}). Catalogue: `data/cots_actuators.json` "
         "(sources in `docs/research/R9-cots-actuators-and-parts.md`). Do not edit by hand.", "",
         f"Checks per joint: repeated peak with {int((1 - HEADROOM) * 100)} % headroom, momentary peak, continuous "
         f"x {DERATE} thermal derate ({', '.join(f'{k} {v}' for k, v in JOINT_DERATE.items())} with a 40 mm fan on the open hip cradle), every simulated sample x margins under a torque-speed line (no-load speed to 40 % at peak). External reductions: belt eta "
         f"{ETA_BELT}, ankle linkage eta {ETA_LINK}.", "",
         "## Chosen actuators", "",
         "| Class | Joints | Actuator | Reduction | Peak / rated (N·m) | No-load (rad/s) | Mass (kg) | Price (USD) | Qty | Lowest margin |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    qty = {"S-LX": 4, "S-L": 2, "S-M": 3, "S-A": 4, "S-SH": 4, "S-EL": 4, "S-WR": 4, "S-NK": 2}
    total = 0.0
    for cls, f in fam.items():
        red = ", ".join(f"{j} {r:g}:1" for j, r in f["reductions"].items())
        L.append(f"| {cls} | {', '.join(CLASSES[cls]['joints'])} | {f['maker']} {f['actuator']} | {red} | "
                 f"{f['peak_Nm']:.0f} / {f['rated_Nm']:.0f} | {f['speed_rads']:.1f} | {f['mass']:.2f} | {f['price_usd']:.0f} | "
                 f"{qty[cls]} | {f['min_margin']:.2f} |")
        total += f["price_usd"] * qty[cls]
    L += ["", f"Actuator total: **USD {total:,.0f}** (≈ AUD {total * AUD_PER_USD:,.0f}) for {sum(qty.values())} actuators.", ""]
    missing = [c for c in CLASSES if c not in fam]
    if missing:
        L += [f"**No feasible catalogue actuator for: {', '.join(missing)}** (see requirements below).", ""]
    L += ["## Requirements on the actuator side (before external reduction)", "",
          "| Joint | Repeated (N·m) | Momentary (N·m) | Continuous (N·m) | Speed (rad/s) |", "|---|---|---|---|---|"]
    for cls, spec in CLASSES.items():
        for j in spec["joints"]:
            t = joint_need(req, j)
            L.append(f"| {j} | {t[0]:.0f} | {t[1]:.0f} | {t[2]:.0f} | {t[3]:.1f} |")
    L += ["", "## Feasible alternatives per class (ranked by price + mass penalty + second-brand penalty, top 5)", ""]
    for cls, opts in report.items():
        L.append(f"**{cls}** ({CLASSES[cls]['note']}):")
        L.append("")
        if not opts:
            L.append("- none feasible")
        for o in opts[:5]:
            a = o["act"]
            red = ", ".join(f"{j} {r:g}:1" for j, (r, _) in o["per_joint"].items())
            L.append(f"- {a.get('maker')} {a['name']}: USD {o['price']:.0f}, {o['mass']:.2f} kg, {red}, lowest margin {o['min_margin']:.2f}")
        if len(opts) > 1:
            strong = max(opts, key=lambda o: o["min_margin"])
            L.append(f"- strongest feasible: {strong['act'].get('maker')} {strong['act']['name']} (lowest margin {strong['min_margin']:.2f})")
        L.append("")
    (gen / "actuator_selection.md").write_text("\n".join(L) + "\n")


def main():
    cat = load_catalogue()
    print(f"{len(cat)} catalogue actuators with complete data")
    fam_prev = None
    for p in range(1, 5):
        store, meta, names = RQ.run_all()
        req, design_mass = RQ.joint_requirements(store, meta, names)
        RQ.write_markdown(req, meta, design_mass)
        fam, report = select(req, cat, store, names)
        P.DATA_DIR.mkdir(parents=True, exist_ok=True)
        (P.DATA_DIR / "actuator_family.json").write_text(json.dumps(fam, indent=1, default=float))
        masses = {k: v["mass"] for k, v in fam.items()}
        print(f"pass {p}: design mass {design_mass:.1f} kg; " + ", ".join(f"{k} {v.get('actuator')}" for k, v in fam.items()))
        if fam_prev is not None and masses == {k: v["mass"] for k, v in fam_prev.items()}:
            break
        if p >= 3 and fam_prev is not None:            # a class flipping between near-equal options: keep the
            fam = {k: fam_prev.get(k, v) for k, v in fam.items()}   # heavier (conservative) choice and stop
            fam = {k: max((fam_prev.get(k, v), v), key=lambda f: f["mass"]) for k, v in fam.items()}
            (P.DATA_DIR / "actuator_family.json").write_text(json.dumps(fam, indent=1, default=float))
            break
        fam_prev = fam
        P.load_actuator_overrides()      # feed masses back for the next pass
    write_report(req, fam, report, design_mass, p)
    return fam


if __name__ == "__main__":
    main()
