"""Aggregate scenario inverse dynamics into per-joint design requirements.

Torque classes (standard servo / gear practice):
  * continuous  - thermal: RMS over sustained nominal walking (W1) x margin
  * hold        - largest static holding torque (single-leg stance, arms forward + 5 kg,
                  squat-hold) - must sit inside the actuator's 60 s (S2) rating
  * repeated    - largest peak in normal operation x 1.20 margin (model uncertainty,
                  disturbance rejection) - must sit inside the gear's repeated-peak rating
  * momentary   - rare events (missed 0.10 m step) - the actuator may saturate, but the
                  gear / bearings / structure must survive it (gear momentary rating)
Speed requirement = 1.15 x largest joint speed in normal operation.
Supplementary minimums cover what the simulated set does not exercise (turning in place,
tool use at the wrist, full-authority ankle torque). Each is justified inline.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import params as P

ROOT = P.ROOT
DATA = P.DATA_DIR
GEN = P.GEN_DIR

REPEATED = [s for s in ["W1", "W2", "ST", "SQ", "DS", "SU", "SL", "AH", "AL", "AF", "AS", "TB", "NK", "CW", "AO"]
            if s not in P.SCENARIOS_SKIP]
MOMENTARY = ["SD", "LM"]
STATIC = ["SL", "AH", "AO"]
MARGIN_T = 1.20
MARGIN_W = 1.15
MARGIN_MOM = 1.10
MARGIN_CONT = 1.20

G = 9.81


def supplementary(design_mass):
    d = P.DIM
    toe = d["foot_len"] - d["heel"]
    return {
        "ankle_pitch": dict(T=design_mass * G * toe, w=7.0,
                            why=f"full authority: CoP at toe tip in single support ({design_mass:.1f} kg x g x {toe:.2f} m)"),
        "ankle_roll": dict(T=design_mass * G * d["foot_w"] / 2, w=4.0,
                           why=f"full authority: CoP at sole edge ({design_mass:.1f} kg x g x {d['foot_w'] / 2:.3f} m)"),
        "hip_yaw": dict(T=60.0, w=5.0, why="turning in place: whole-body yaw inertia ~4 kg m^2 x 10 rad/s^2 + foot scrub, x1.4"),
        "hip_roll": dict(T=0.0, w=4.0, why="lateral stepping for push recovery needs >= 4 rad/s"),
        "waist_yaw": dict(T=60.0, w=4.0, why="upper-body yaw ~1.5 kg m^2 x 20 rad/s^2 + reaction from one-arm loads"),
        "shoulder_yaw": dict(T=30.0, w=6.0, why="internal/external rotation with 3 kg tool on 0.3 m forearm lever + dynamics"),
        "wrist_yaw": dict(T=12.0, w=8.0, why="tool use: turning a valve/driver (human pronation ~7-10 N m)"),
        "wrist_pitch": dict(T=10.0, w=6.0, why="5 kg in hand at 0.09 m + tool reaction"),
        "wrist_roll": dict(T=10.0, w=6.0, why="radial/ulnar deviation with 5 kg in hand"),
        "neck_yaw": dict(T=12.0, w=7.0, why="1.2 rad look-around in 0.4 s + shock margin"),
        "neck_pitch": dict(T=12.0, w=7.0, why="nod 0.8 rad in 0.3 s + 2 kg head x 0.09 m + shock margin"),
        "elbow": dict(T=0.0, w=7.0, why="reaching speed target 7 rad/s"),
        "shoulder_pitch": dict(T=0.0, w=6.0, why="reaching speed target 6 rad/s"),
        "shoulder_roll": dict(T=0.0, w=6.0, why="reaching speed target 6 rad/s"),
    }


def _prune(meta):
    """Keep only the cases this variant/workload actually ran (Mk II adds CW, AO, LM)."""
    for lst in (REPEATED, MOMENTARY, STATIC):
        lst[:] = [s for s in lst if s in meta]


def run_all(cache=True):
    from . import scenarios as S

    DATA.mkdir(parents=True, exist_ok=True)
    res = S.all_scenarios()
    store = {}
    meta = {}
    for r in res:
        o, c = r["out"], r["cut"]
        names = o["jnames"]
        store[r["name"] + "/tau"] = o["tau"][c]
        store[r["name"] + "/qd"] = o["qd"][c]
        store[r["name"] + "/q"] = o["q"][c]
        meta[r["name"]] = dict(desc=r["desc"], cop_ok=r["cop_ok"], mass=r["mass"], dt=r["dt"],
                               duration=float((c.stop - c.start) * r["dt"]),
                               speed=float(r.get("speed", 0.0)))
    _prune(meta)
    if cache:
        np.savez_compressed(DATA / "scenario_series.npz", **store)
        (DATA / "scenario_meta.json").write_text(json.dumps(dict(joints=names, scenarios=meta), indent=1))
    return store, meta, names


def load():
    meta = json.loads((DATA / "scenario_meta.json").read_text())
    z = np.load(DATA / "scenario_series.npz")
    _prune(meta["scenarios"])
    return {k: z[k] for k in z.files}, meta["scenarios"], meta["joints"]


def joint_requirements(store, meta, names):
    design_mass = next(iter(meta.values()))["mass"]
    supp = supplementary(design_mass)
    out = {}
    for j, jn in enumerate(names):
        if jn.startswith("r_"):
            continue
        base = jn[2:] if jn.startswith("l_") else jn
        rec = dict(joint=base)

        def peak(sc_list, arr="tau"):
            best, who = 0.0, ""
            for s in sc_list:
                k = f"{s}/{arr}"
                if k in store:
                    v = float(np.abs(store[k][:, j]).max())
                    if v > best:
                        best, who = v, s
            return best, who

        rec["peak_rep"], rec["peak_rep_case"] = peak(REPEATED)
        rec["peak_mom"], _ = peak(MOMENTARY)
        rec["hold"], rec["hold_case"] = peak(STATIC)
        rec["vmax"], rec["vmax_case"] = peak(REPEATED, "qd")
        rec["rms_W1"] = float(np.sqrt((store["W1/tau"][:, j] ** 2).mean()))
        rec["rms_W2"] = float(np.sqrt((store["W2/tau"][:, j] ** 2).mean()))
        rec["rms_ST"] = float(np.sqrt((store["ST/tau"][:, j] ** 2).mean()))
        pw = 0.0
        for s in REPEATED:
            pw = max(pw, float(np.abs(store[f"{s}/tau"][:, j] * store[f"{s}/qd"][:, j]).max()))
        rec["pmax"] = pw
        sp = supp.get(base, dict(T=0.0, w=0.0, why=""))
        rec["T_rep_req"] = max(MARGIN_T * rec["peak_rep"], sp["T"])
        rec["T_mom_req"] = max(MARGIN_MOM * rec["peak_mom"], rec["T_rep_req"])
        rec["T_cont_req"] = MARGIN_CONT * max(rec["rms_W1"], 0.8 * rec["rms_W2"])
        rec["T_hold_req"] = rec["hold"]
        rec["w_req"] = max(MARGIN_W * rec["vmax"], sp["w"])
        rec["supp_note"] = sp["why"] if (sp["T"] >= MARGIN_T * rec["peak_rep"] or sp["w"] >= MARGIN_W * rec["vmax"]) else ""
        out[base] = rec
    return out, design_mass


def envelopes(store, names, joint):
    """(|tau|, |qd|) samples across repeated scenarios for one joint (left side / centre)."""
    jn = joint if joint in names else f"l_{joint}"
    j = names.index(jn)
    pts = []
    for s in REPEATED + MOMENTARY:
        t = np.abs(store[f"{s}/tau"][:, j])
        w = np.abs(store[f"{s}/qd"][:, j])
        pts.append(np.c_[t, w, np.full(len(t), REPEATED.index(s) if s in REPEATED else -1)])
    return np.vstack(pts)


ORDER = ["hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll", "waist_yaw", "waist_pitch",
         "shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll",
         "neck_yaw", "neck_pitch"]


def write_markdown(req, meta, design_mass):
    GEN.mkdir(parents=True, exist_ok=True)
    L = ["# Joint requirements (generated)", "",
         f"Generated by `calc/run_all.py` from whole-body inverse dynamics at design mass **{design_mass:.1f} kg** "
         f"(estimate x {P.DESIGN_MASS_GROWTH:.2f}). Joint-side values (before any linkage). Do not edit by hand.", "",
         "## Scenarios", "", "| ID | Scenario | Duration analysed (s) | CoP inside sole |", "|---|---|---|---|"]
    for k, v in meta.items():
        L.append(f"| {k} | {v['desc']} | {v['duration']:.1f} | {100 * v['cop_ok']:.0f} % |")
    L += ["", "## Requirements", "",
          "| Joint | Sim peak (case) | **Repeated req** | Momentary req | Hold | RMS W1 / W2 / ST | **Continuous req** | Sim speed (case) | **Speed req** | Peak power |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for k in [o for o in ORDER if o in req]:
        r = req[k]
        L.append(f"| {k} | {r['peak_rep']:.0f} N·m ({r['peak_rep_case']}) | **{r['T_rep_req']:.0f} N·m** | {r['T_mom_req']:.0f} N·m | "
                 f"{r['hold']:.0f} N·m ({r['hold_case']}) | {r['rms_W1']:.0f} / {r['rms_W2']:.0f} / {r['rms_ST']:.0f} | **{r['T_cont_req']:.0f} N·m** | "
                 f"{r['vmax']:.1f} rad/s ({r['vmax_case']}) | **{r['w_req']:.1f} rad/s** | {r['pmax']:.0f} W |")
    L += ["", "Supplementary minimums applied (where they govern):", ""]
    for k in [o for o in ORDER if o in req]:
        if req[k]["supp_note"]:
            L.append(f"- **{k}**: {req[k]['supp_note']}")
    L += ["", f"Margins: repeated x{MARGIN_T}, momentary x{MARGIN_MOM}, continuous x{MARGIN_CONT}, speed x{MARGIN_W}.", ""]
    (GEN / "joint_requirements.md").write_text("\n".join(L))
