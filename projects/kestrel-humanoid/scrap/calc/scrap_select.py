"""Requirement <-> salvaged-actuator selection for the scrap builds (KESTREL S1-Scrap, K1-Scrap).

    cd projects/kestrel-humanoid
    python scrap/calc/scrap_select.py --variant s1scrap      # or k1scrap

For every joint class it tries each allowed salvaged actuator (scrap/data/actuators.json), one or two motors per
joint, and every bicycle-sprocket reduction (one or two chain stages), against the variant's simulated
requirements (calc/kestrel/scenarios.py, scrap_scenarios) with K1's margins:
  * every simulated sample x margins must sit under the motor's current-limited torque-speed line
      I = tau_motor / Kt <= 0.9 I_max,   omega_motor <= (V - I R) / Kt
  * continuous torque within the motor's continuous current
  * momentary (missed step) is reported, not enforced: drill gearmotors keep their torque clutch as a mechanical
    fuse, hub motors back-drive; the chain is checked for strength
Reflected inertia (n x J_rotor x ratio^2) and the actuator and chain masses feed back into the model, and the
requirements are re-run until the selection stops changing. Writes <DATA_DIR>/actuator_family.json and
<GEN_DIR>/actuator_selection.md.
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJ = HERE.parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--variant", default="s1scrap", choices=["s1scrap", "k1scrap"])
args, _ = ap.parse_known_args()
os.environ["KESTREL_VARIANT"] = args.variant
sys.path.insert(0, str(PROJ / "calc"))

import numpy as np  # noqa: E402

from kestrel import linkages as LK  # noqa: E402
from kestrel import params as P  # noqa: E402
from kestrel import requirements as RQ  # noqa: E402

ACTS = {k: v for k, v in json.loads((PROJ / "scrap" / "data" / "actuators.json").read_text()).items() if not k.startswith("_")}
HEADROOM = 0.90
ETA_CHAIN = 0.95                 # per bicycle-chain stage
CHAIN_STAGE_AUD = 6.0            # second-hand sprockets + chain + 2 x 608 + bolts, per stage (R11)
CHAIN_STAGE_KG = 0.30
CHAIN_BREAK_N = 8000.0           # 1/2 in pitch cycle chain, ISO 9633 minimum breaking load (R11)
CHAIN_WORK_N = 1600.0            # repeated working load, top of the R11 estimate (1.0-1.6 kN): fatigue, not breakage
COGS = (11, 12, 13, 14, 16, 18)                       # cassette / freewheel cogs (driver)
RINGS = (22, 24, 26, 28, 30, 32, 34, 36, 38, 42)      # chainrings / large cogs (driven); 42T = 170 mm pitch dia
PITCH = 0.0127


def pd(z):
    return PITCH / np.sin(np.pi / z)


def chain_options(max_ratio=26.0):
    """(ratio, stages, recipe) for direct, one and two chain stages, smallest-sprocket recipe per ratio step."""
    stages1 = sorted({(round(r / c, 3), c, r) for c in COGS for r in RINGS if r / c >= 1.4})
    opts = {1.0: (1.0, 0, "direct")}
    for ratio, c, r in stages1:
        key = round(ratio, 1)
        opts.setdefault(key, (ratio, 1, f"{c}T -> {r}T"))
    for r1, c1, z1 in stages1:
        for r2, c2, z2 in stages1:
            ratio = r1 * r2
            if ratio <= max_ratio:
                key = round(ratio, 1)
                if key not in opts:
                    opts[key] = (ratio, 2, f"{c1}T -> {z1}T, then {c2}T -> {z2}T")
    return sorted(opts.values())


CHAINS = chain_options()

# Hand-made capstan (cable) drive: Dyneema cord wrapped 4-5 turns on a steel rod held in the drill chuck, both ends
# anchored on a plywood or aluminium sector at the joint. One stage, any ratio set by the sector radius; no backlash.
CAP_IN_R = 0.0065                # 10 mm rod + 3 mm cord: radius to the cord centre
CAP_MAX_R = 0.078                # sector radius limit (155 mm diameter fits the thigh and the hip bracket)
CAP_BREAK_N = 8800.0             # 3 mm 12-strand Dyneema (SK78) ~900 kg [estimate: use your cord's rated break]
CAP_ETA = 0.95
CAP_STAGE_AUD, CAP_STAGE_KG = 5.0, 0.20


def capstan_options():
    """(ratio, stages, recipe); a recipe with "2 cords" has two cord loops side by side (double-groove sector)."""
    out = [(1.0, 0, "direct")]
    for cords in (1, 2):
        r = 1.5
        while r * CAP_IN_R <= CAP_MAX_R + 1e-9:
            out.append((round(r, 2), 1, f"capstan, sector radius {r * CAP_IN_R * 1000:.0f} mm on a 10 mm rod"
                        + (", 2 cords" if cords == 2 else "")))
            r += 0.25
    return out


CAPSTANS = capstan_options()


def reductions(cls, typ):
    """Hub motors drive a bike chain (their 165 mm rotor cannot be a capstan input); servos are used direct."""
    a = ACTS[typ]
    if a["kind"] == "servo":
        return "direct", [(1.0, 0, "direct")]
    if a.get("needs_chain"):
        return "chain", CHAINS
    kind = P.SCRAP.get("reduction", {}).get(cls, P.SCRAP.get("reduction", {}).get("*", "chain"))
    return kind, (CAPSTANS if kind == "capstan" else CHAINS)


def classes():
    out = {}
    for j, (c, _, _) in list(P.JOINTS_LEFT.items()) + list(P.JOINTS_CENTRE.items()):
        jj = "ankle" if j.startswith("ankle") else j
        out.setdefault(c, [])
        if jj not in out[c]:
            out[c].append(jj)
    return out


def allowed(cls):
    mod = importlib.import_module(f"kestrel.variant_{args.variant}")
    return mod.ALLOWED.get(cls, mod.ALLOWED["*"])


def joint_need(req, j):
    if j == "ankle":
        rp, rr = req["ankle_pitch"], req["ankle_roll"]
        return (float(LK.ankle_actuator_torque(rp["T_rep_req"], rr["T_rep_req"])),
                float(LK.ankle_actuator_torque(rp["T_mom_req"], rr["T_rep_req"])),
                float(LK.ankle_actuator_torque(rp["T_cont_req"], rr["T_cont_req"])),
                float(LK.ankle_actuator_speed(rp["w_req"], 0)))
    r = req[j]
    return r["T_rep_req"], r["T_mom_req"], r["T_cont_req"], r["w_req"]


def supp_floor(dm, j):
    if j == "ankle":
        return None                       # parallel ankle: keep the corner from joint_need (no armature correction)
    return RQ.supplementary(dm).get(j, {}).get("T", 0.0)


DT = 0.005


def samples(store, names, j):
    """Joint-side torque (signed for direct joints), |speed|, momentary flag and acceleration of every sample. The
    acceleration lets each option be checked with its own reflected inertia: tau + (J_option - J_modelled) qdd."""
    idx = {n: i for i, n in enumerate(names)}
    T, W, M, A = [], [], [], []
    for sc in RQ.REPEATED + RQ.MOMENTARY:
        tau, qd = store[f"{sc}/tau"], store[f"{sc}/qd"]
        if j == "ankle":
            ip, ir = idx["l_ankle_pitch"], idx["l_ankle_roll"]
            t = LK.ankle_actuator_torque(tau[:, ip], tau[:, ir])
            w = LK.ankle_actuator_speed(qd[:, ip], qd[:, ir])
            acc = np.zeros(len(t))
        else:
            i = idx[j] if j in idx else idx[f"l_{j}"]
            t, w = tau[:, i], np.abs(qd[:, i])
            acc = np.gradient(qd[:, i], DT)
        T.append(t), W.append(w), M.append(np.full(len(t), sc in RQ.MOMENTARY)), A.append(acc)
    return np.concatenate(T), np.concatenate(W), np.concatenate(M), np.concatenate(A)


def bus_v(a):
    return P.SCRAP["bus_V"].get(a["kind"], 6.8)


def check(a, n, chain, stages, need, smp, sprocket_pd, dJ=0.0, floor=None, kind="chain", recipe=""):
    T_rep, T_mom, T_cont, w_req = need
    tt, w, mom, acc = smp
    t = np.abs(tt + dJ * acc)
    if floor is not None:                 # direct joint: repeated corner from this option's own samples + floor
        T_rep = max(RQ.MARGIN_T * t[~mom].max(), floor)
    N = a["gear"] * chain
    e_stage = CAP_ETA if kind == "capstan" else ETA_CHAIN
    eta = a["eta_gear"] * e_stage ** stages
    V = bus_v(a)
    nrm = ~mom
    t_need = np.concatenate([t[nrm] * RQ.MARGIN_T, [T_rep]])
    w_need = np.concatenate([w[nrm] * RQ.MARGIN_W, [0.3]])
    if w_req > (w[nrm] * RQ.MARGIN_W).max() + 1e-6:        # an analytic speed minimum governs: 50 % torque there
        t_need, w_need = np.append(t_need, 0.5 * T_rep), np.append(w_need, w_req)
    if a["kind"] == "servo":              # hobby servo: straight torque-speed line, stall torque x 0.5 for life
        tm = t_need / (N * eta * n)
        I = tm / (0.5 * a["T_stall"]) * a["I_max"]          # normalised so the peak check reads 0.5 x stall
        w_motor = w_need * N
        w_avail = a["w_noload"] * np.clip(1 - tm / a["T_stall"], 0, 1)
    else:
        I = t_need / (N * eta * n) / a["Kt"]
        w_motor = w_need * N
        w_avail = np.maximum(V - I * a["R"], 0.0) / a["Kt"]
    m = dict(peak=HEADROOM * a["I_max"] / I.max(),
             speed=float(np.min(w_avail / np.maximum(w_motor, 1e-6))),
             cont=a["I_cont"] / max(T_cont / (N * eta * n) / a["Kt"], 1e-6))
    ok = min(m.values()) >= 1.0
    # momentary (missed step): the reflected rotor inertia makes a large torque spike. A drill gearmotor keeps its
    # adjustable torque clutch (between the planetary and the chain): set to 2 x the normal drill-output torque, it
    # slips before the spike reaches the chain. Hub motors have no clutch: the full spike passes through the chain.
    eta_c = e_stage ** stages
    T_avail = a["I_max"] * a["Kt"] * N * eta * n
    t_mom = max(t[mom].max() if mom.any() else 0.0, T_mom)
    m["mom"] = T_avail / max(t_mom, 1e-6)
    out_rep = T_rep / (chain * eta_c * n)                      # normal peak torque at the gearbox output
    if a.get("clutch"):
        clutch = min(a["max_out_Nm"], max(2.0 * out_rep, 6.0))
        m["clutch_Nm"] = clutch
        m["gear_or_clutch"] = clutch / max(out_rep, 1e-6)      # >= 2 by construction unless capped by the gearbox
        t_chain_mom = min(t_mom, clutch * chain * eta_c * n)
        ok = ok and m["gear_or_clutch"] >= 1.3                 # the clutch must not slip in normal walking
    else:
        m["gear_or_clutch"] = a["max_out_Nm"] / max(t_mom / (chain * eta_c * n), 1e-6)
        t_chain_mom = t_mom
    if stages and kind == "capstan":   # cord on the sector: repeated vs break / 4, missed step vs break / 2
        r = chain * CAP_IN_R
        nc = 2 if "2 cords" in recipe else 1
        m["chain"] = nc * min(CAP_BREAK_N / 4 * r / max(T_rep, 1e-6), (CAP_BREAK_N / 2) * r / max(t_chain_mom, 1e-6))
        ok = ok and m["chain"] >= 1.0
    elif stages:    # last (largest) sprocket carries the joint torque: repeated vs working load, missed step vs break / 2
        r = sprocket_pd / 2
        m["chain"] = min(CHAIN_WORK_N * r / max(T_rep, 1e-6), (CHAIN_BREAK_N / 2) * r / max(t_chain_mom, 1e-6))
        ok = ok and m["chain"] >= 1.0
    return ok, m


def option_cost(a, n, stages, kind="chain"):
    return n * (a["price_aud"] + a["driver_aud"] + a["sensor_aud"]) + stages * (CAP_STAGE_AUD if kind == "capstan" else CHAIN_STAGE_AUD)


def select(req, store, names, dm):
    fam, report = {}, {}
    for cls, joints in classes().items():
        smp = {j: samples(store, names, j) for j in joints}
        J_model = P.ACT[cls]["rotor_J"] * P.ACT[cls]["ratio"] ** 2
        best, tried = None, []
        for typ, n in allowed(cls):
            a = ACTS[typ]
            kind, opts = reductions(cls, typ)
            for ratio, stages, recipe in opts:
                zbig = int(recipe.split("->")[-1].strip().rstrip("T")) if (stages and kind == "chain") else 0
                dJ = n * a["J_rotor"] * (a["gear"] * ratio) ** 2 - J_model
                res = [check(a, n, ratio, stages, joint_need(req, j), smp[j], pd(zbig) if zbig else 0.0, dJ,
                             supp_floor(dm, j), kind, recipe) for j in joints]
                if all(r[0] for r in res):
                    mm = {k: min(r[1][k] for r in res) for k in res[0][1]}
                    cost = option_cost(a, n, stages, kind) + (1.0 if "2 cords" in recipe else 0.0)
                    cand = dict(type=typ, n=n, chain=ratio, stages=stages, recipe=recipe, cost=cost, margins=mm, kind=kind)
                    tried.append(cand)
                    if best is None or (cost, ratio) < (best["cost"], best["chain"]):
                        best = cand
                    break                       # smallest feasible ratio for this (type, n): more is only slower
        report[cls] = dict(joints=joints, best=best, tried=tried, need={j: joint_need(req, j) for j in joints})
        if best:
            a = ACTS[best["type"]]
            N = a["gear"] * best["chain"]
            eta = a["eta_gear"] * (CAP_ETA if best["kind"] == "capstan" else ETA_CHAIN) ** best["stages"]
            fam[cls] = dict(type=best["type"], label=a["label"], n_motors=best["n"], chain=round(best["chain"], 3),
                            chain_stages=best["stages"], sprockets=best["recipe"], reduction=best["kind"],
                            mass=round(best["n"] * a["mass"], 3),
                            drive_kg=round(best["stages"] * (CAP_STAGE_KG if best["kind"] == "capstan" else CHAIN_STAGE_KG), 3),
                            rotor_J=best["n"] * a["J_rotor"], ratio=round(N, 2),
                            T_peak_joint=round(a["I_max"] * a["Kt"] * N * eta * best["n"], 1),
                            w_noload_joint=round((a["w_noload"] if a["kind"] == "servo" else bus_v(a) / a["Kt"]) / N, 2),
                            clutch_Nm=round(best["margins"].get("clutch_Nm", 0.0), 1),
                            cost_aud=best["cost"], margins={k: round(v, 2) for k, v in best["margins"].items() if k != "clutch_Nm"})
    return fam, report


def reload_all():
    for mod in ("kestrel.params", "kestrel.model", "kestrel.dynamics", "kestrel.gait", "kestrel.scenarios", "kestrel.requirements"):
        importlib.reload(importlib.import_module(mod))
    global P, RQ
    from kestrel import params as P_  # noqa: E402
    from kestrel import requirements as RQ_  # noqa: E402
    P, RQ = P_, RQ_


def write_report(req, fam, report, design_mass, passes):
    gen = P.GEN_DIR
    gen.mkdir(parents=True, exist_ok=True)
    tot, cats, _ = P.mass_summary()
    L = [f"# {P.NAME} actuator selection (generated)", "",
         f"Generated by `scrap/calc/scrap_select.py --variant {args.variant}` after {passes} passes. Estimated mass "
         f"**{tot:.1f} kg**, design mass **{design_mass:.1f} kg** (x {P.DESIGN_MASS_GROWTH:.2f}). Actuator data: "
         "`scrap/data/actuators.json` (docs/research/R11). Do not edit by hand.", "",
         f"Bus: drill gearmotors at {P.SCRAP['bus_V']['brushed']:.0f} V, hub motors at {P.SCRAP['bus_V']['bldc']:.0f} V. "
         f"Checks: every simulated sample x 1.2 torque / 1.15 speed (each option with its own reflected inertia) under the current-limited torque-speed line "
         f"({int((1 - HEADROOM) * 100)} % current headroom), continuous current; chain repeated load <= 1.6 kN, capstan cord repeated load <= 1/4 of its break, both missed step <= 1/2 break. The "
         "missed-step (momentary) column is reported only: each drill keeps its torque clutch, set to the value shown so it "
         "slips before the inertia spike of a missed step reaches the chain; hub motors back-drive.", "",
         "| Class | Joints | Actuator | Motors | Reduction after the motor's gearbox | Joint peak / no-load | Margins: peak, speed, continuous | Missed step: push | Clutch set (drill output) | A$ per joint |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    total, count = 0.0, 0
    qty = {}
    for j, (c, _, _) in list(P.JOINTS_LEFT.items()) + list(P.JOINTS_CENTRE.items()):
        mult = 2 if j in P.JOINTS_LEFT else 1
        if j == "ankle_roll":
            continue
        qty[c] = qty.get(c, 0) + (2 * mult if j == "ankle_pitch" else mult)    # 2 actuators per parallel ankle
    for cls, rep in report.items():
        f = fam.get(cls)
        if not f:
            L.append(f"| {cls} | {', '.join(rep['joints'])} | **no feasible option** | | | | | | | |")
            continue
        m = f["margins"]
        L.append(f"| {cls} | {', '.join(rep['joints'])} | {f['label']} | {f['n_motors']} | {f['sprockets']} "
                 f"({f['chain']:.2f}:1) | {f['T_peak_joint']:.0f} N·m / {f['w_noload_joint']:.1f} rad/s | "
                 f"{m['peak']:.2f}, {m['speed']:.2f}, {m['cont']:.2f} | {m['mom']:.2f} | "
                 f"{(str(f['clutch_Nm']) + ' N·m') if f['clutch_Nm'] else 'none'} | {f['cost_aud']:.0f} |")
        total += f["cost_aud"] * qty.get(cls, 0)
        count += f["n_motors"] * qty.get(cls, 0)
    L += ["", f"Actuators: **{count} motors, about A${total:.0f}** (motor + driver + angle sensor + chain stages; "
          "salvage prices from R11).", "", "## Requirements (joint side, before reduction)", "",
          "| Joint | Repeated | Momentary | Continuous | Speed |", "|---|---|---|---|---|"]
    for cls, rep in report.items():
        for j, (a, b, c, d) in rep["need"].items():
            L.append(f"| {j} | {a:.1f} N·m | {b:.1f} N·m | {c:.1f} N·m | {d:.2f} rad/s |")
    L += ["", "## Mass", "", "| Category | kg |", "|---|---|"] + [f"| {k} | {v:.2f} |" for k, v in cats.items()]
    (gen / "actuator_selection.md").write_text("\n".join(L) + "\n")


def main():
    prev, seen = None, []
    for p in range(1, 9):
        store, meta, names = RQ.run_all()
        req, dm = RQ.joint_requirements(store, meta, names)
        RQ.write_markdown(req, meta, dm)
        fam, report = select(req, store, names, dm)
        P.DATA_DIR.mkdir(parents=True, exist_ok=True)
        (P.DATA_DIR / "actuator_family.json").write_text(json.dumps(fam, indent=1, default=float))
        sig = {k: (v["type"], v["n_motors"], v["chain"]) for k, v in fam.items()}
        print(f"pass {p}: design mass {dm:.1f} kg; " + ", ".join(f"{k} {v[0]}x{v[1]} {v[2]:.2f}" for k, v in sig.items())
              + ("" if len(fam) == len(report) else f"  INFEASIBLE: {[c for c in report if c not in fam]}"), flush=True)
        if sig == prev:
            break
        if sig in seen:                   # cycling between near-equal options: keep the heavier set and stop
            print("selection cycles; keeping this set", flush=True)
            break
        seen.append(sig)
        prev = sig
        reload_all()
    write_report(req, fam, report, dm, p)
    return fam


if __name__ == "__main__":
    main()
