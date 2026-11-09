"""Printable 1:1 cutting templates for the capstan sectors, and the walking trajectories as CSV, for the scrap builds.

    cd projects/kestrel-humanoid
    python scrap/calc/scrap_templates.py          # -> scrap/<s1|k1>/templates/*.svg and scrap/<s1|k1>/data/gait_*.csv

Templates: one A4 SVG per joint class, drawn in millimetres. Print at 100 % ("actual size", no fit-to-page), check the
50 mm scale bar with a ruler, glue the sheet to 12 mm plywood (or 6 mm aluminium for the knee), drill the holes on the
drill press, then cut the outline with a jigsaw and sand to the line. Where the capstan ratio is below 3:1 the
template scales both drums up (input drum = 25 mm tube sleeved over the 10 mm rod), so the cord is not bent around a
tiny radius; the ratio is unchanged.

Gait CSV: the joint angles of the simulated motions at 100 Hz, in degrees, for replay on the ESP32 controllers in the
gantry (scrap guide step 9): slow walk (W1), fast walk (W2), stairs up (ST), single-leg step-up (SU) and squat (SQ),
plus a bring-up walk (W0) generated here. W1 and W2 balance dynamically (ZMP): played slower than real time their
centre of pressure leaves the foot (W1 at quarter speed: half of every single-support phase). W0 (0.18 m steps,
0.9 s single + 1.2 s double support, 0.086 m/s) keeps it 1 cm inside the sole at any replay speed, standing still
included, and is checked here against every joint's torque limit; ST (2 s per step) is the same.
"""
from __future__ import annotations

import csv
import importlib
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PROJ = HERE.parents[1]
IN_R_SMALL, IN_R_LARGE = 6.5, 16.0      # mm to cord centre: 10 mm rod + 3 mm cord; 25 mm sleeve + 3 mm cord + clearance


def sector_svg(name, joints, ratio, cords, rng_deg, clutch):
    in_r = IN_R_SMALL if ratio >= 3.0 else IN_R_LARGE
    R = ratio * in_r                                          # cord-centre radius on the sector
    Ro = R + 1.5                                              # outline: cord sits in a groove cut 3 mm deep at R
    span = min(rng_deg + 70.0, 300.0)                         # joint range + wrap allowance for the cord anchors
    cx, cy = 105.0, 150.0
    a0, a1 = math.radians(90 - span / 2), math.radians(90 + span / 2)
    hub_r = max(18.0, 0.35 * R)

    def pt(r, a):
        return cx + r * math.cos(a), cy - r * math.sin(a)

    x0, y0 = pt(Ro, a0)
    x1, y1 = pt(Ro, a1)
    big = 1 if span > 180 else 0
    path = (f"M {cx:.2f} {cy:.2f} L {x0:.2f} {y0:.2f} A {Ro:.2f} {Ro:.2f} 0 {big} 0 {x1:.2f} {y1:.2f} Z")
    holes = [(cx, cy, 4.0, "M8 axle (or 22 mm for a 608 bearing seat)")]
    pcd = max(14.0, 0.55 * hub_r + 6)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        holes.append((cx + pcd * math.cos(a), cy + pcd * math.sin(a), 2.75, "M5"))
    for a in (a0 + math.radians(12), a1 - math.radians(12)):
        x, y = pt(R - 7.0, a)
        holes.append((x, y, 2.25, "cord anchor M4"))
    hub_r = max(hub_r, pcd_hub := max(14.0, 0.55 * max(18.0, 0.35 * R) + 6) + 9.0)
    els = [f'<path d="{path}" fill="none" stroke="#000" stroke-width="0.4"/>',
           f'<circle cx="{cx}" cy="{cy}" r="{hub_r:.2f}" fill="none" stroke="#000" stroke-width="0.4"/>',
           f'<circle cx="{cx}" cy="{cy}" r="{R:.2f}" fill="none" stroke="#999" stroke-width="0.25" stroke-dasharray="2 2"/>',
           f'<circle cx="{cx}" cy="{cy}" r="11" fill="none" stroke="#999" stroke-width="0.25" stroke-dasharray="1 1"/>']
    for x, y, r, _ in holes:
        els.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="none" stroke="#000" stroke-width="0.35"/>')
        els.append(f'<path d="M {x - r - 2:.2f} {y:.2f} H {x + r + 2:.2f} M {x:.2f} {y - r - 2:.2f} V {y + r + 2:.2f}" stroke="#000" stroke-width="0.2"/>')
    txt = [f"KESTREL scrap build - capstan sector {name} ({', '.join(joints)})",
           f"ratio {ratio:.2f}:1, cord-centre radius {R:.1f} mm, outline {Ro:.1f} mm; input drum radius {in_r:.1f} mm "
           + ("(10 mm rod + 3 mm cord)" if in_r == IN_R_SMALL else "(25 mm tube sleeved on the 10 mm rod)"),
           f"cords: {cords} x 3 mm Dyneema, 4-5 turns on the input drum" + ("; cut 2 grooves 6 mm apart" if cords == 2 else ""),
           f"span {span:.0f} deg = joint range {rng_deg:.0f} deg + anchors; drill clutch set to {clutch:.1f} N·m (lever test)",
           "PRINT AT 100 % (actual size). Check the 50 mm bar. Cut the OUTER contour of the slice + hub disc. Dashed: cord groove (3 mm deep), 608 seat."]
    for i, s in enumerate(txt):
        els.append(f'<text x="12" y="{14 + 5.5 * i}" font-family="Arial" font-size="{4.2 if i == 0 else 3.2}">{s}</text>')
    els.append('<path d="M 12 285 H 62" stroke="#000" stroke-width="0.6"/><path d="M 12 282 V 288 M 62 282 V 288" stroke="#000" stroke-width="0.4"/>'
               '<text x="30" y="280" font-family="Arial" font-size="3.2">50 mm</text>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">'
            '<rect width="210" height="297" fill="#fff"/>' + "".join(els) + "</svg>\n")


W0 = (0.18, 0.9, 1.2)      # bring-up walk: step length (m), single and double support (s)


def bringup_walk(variant, names, fam_file):
    """W0: a walk that stays balanced when replayed at any speed. Returns (q, meta) or None if it fails a check."""
    for m in ("kestrel.params", "kestrel.dynamics", "kestrel.gait", "kestrel.scenarios"):
        if m in sys.modules:
            importlib.reload(sys.modules[m])
    from kestrel import params as P, dynamics as D, scenarios as SC
    step, tss, tds = W0
    r = SC.walk("W0", "", step, tss, tds, P.SCRAP.get("hip_h", (0.83, 0.82))[0], n_steps=6)
    Q, wl, cut = r["Q"], r["plan"]["wl"], r["cut"]
    R = D.Robot(payloads={})
    assert R.jnames == list(names), "joint order differs from the scenario store"
    ok = 1.0
    for k in (1.0, 2.0, 4.0, 1e3):                      # real time, half, quarter, standing still
        out = R.inverse_dynamics(Q, dt=SC.DT * k, wL=wl)
        ok = min(ok, float((D.cop_feasible(out["cop_l"][cut], margin=0.01) & D.cop_feasible(out["cop_r"][cut], margin=0.01)).mean()))
        if k == 1.0:
            tau = out["tau"] if "tau" in out else None
    if ok < 1.0:
        print(f"  W0 not written for {variant}: CoP leaves the sole ({ok:.0%} inside)")
        return None
    if tau is not None and fam_file.exists():
        fam = json.loads(fam_file.read_text())
        mod = importlib.import_module(f"kestrel.variant_{variant}")
        cls = dict(mod.JOINTS_LEFT, **getattr(mod, "JOINTS_CENTRE", {}))
        worst = (0.0, "")
        for j, n in enumerate(names):
            base = n[2:] if n[:2] in ("l_", "r_") else n
            c = cls.get(base, (None,))[0]
            lim = fam.get(c, {}).get("T_peak_joint")
            if not lim:
                continue
            worst = max(worst, (np.abs(tau[cut, j]).max() / lim, n))
            if worst[0] > 1.0:
                print(f"  W0 not written for {variant}: {n} needs {np.abs(tau[cut, j]).max():.0f} N·m > {lim:.0f}")
                return None
        print(f"  W0 for {variant}: highest torque {worst[0]:.0%} of the joint's peak ({worst[1]})")
    return Q, dict(desc=f"bring-up walk {step / (tss + tds):.3f} m/s, balanced at any replay speed", dt=SC.DT)


def gait_csv(sub, variant, out_dir):
    os.environ["KESTREL_VARIANT"] = variant
    sys.path.insert(0, str(PROJ / "calc"))
    for m in ("kestrel.params", "kestrel.requirements"):
        if m in sys.modules:
            importlib.reload(sys.modules[m])
    from kestrel import requirements as RQ
    store, meta, names = RQ.load()
    w0 = bringup_walk(variant, names, out_dir.parent / "data" / "actuator_family.json")
    if w0 is not None:
        store["W0/q"], meta["W0"] = w0
    for sc in ("W0", "W1", "W2", "ST", "SU", "SQ"):
        if f"{sc}/q" not in store:
            continue
        q = store[f"{sc}/q"]
        dt = meta[sc].get("dt", 0.005)
        cols = [n for n in names]
        rows = [[f"{k * dt:.3f}"] + [f"{math.degrees(v):.2f}" for v in q[k, :]] for k in range(0, len(q), 2)]
        with open(out_dir / f"gait_{sc}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["t_s"] + [f"{c}_deg" for c in cols])
            w.writerows(rows)
        print(f"  {out_dir.relative_to(PROJ)}/gait_{sc}.csv: {len(rows)} rows, {meta[sc]['desc'] if 'desc' in meta[sc] else sc}")


def main():
    for sub, variant in (("s1", "s1scrap"), ("k1", "k1scrap"), ("s1fast", "s1fast"), ("k1fast", "k1fast")):
        ff = PROJ / "scrap" / sub / "data" / "actuator_family.json"
        if not ff.exists():
            continue
        fam = json.loads(ff.read_text())
        sys.path.insert(0, str(PROJ / "calc"))
        mod = importlib.import_module(f"kestrel.variant_{variant}")
        jl = dict(mod.JOINTS_LEFT)
        jl.update(getattr(mod, "JOINTS_CENTRE", {}))
        out = PROJ / "scrap" / sub / "templates"
        out.mkdir(parents=True, exist_ok=True)
        for c, f in fam.items():
            if f.get("reduction") != "capstan" or not f["chain_stages"]:
                continue
            joints = [j for j, (cc, _, _) in jl.items() if cc == c]
            rng = max(jl[j][1][1] - jl[j][1][0] for j in joints)
            cords = 2 if "2 cords" in f["sprockets"] else 1
            (out / f"sector_{c}.svg").write_text(sector_svg(c, joints, f["chain"], cords, rng, f["clutch_Nm"]))
            print(f"  {out.relative_to(PROJ)}/sector_{c}.svg")
        gait_csv(sub, variant, PROJ / "scrap" / sub / "data")


if __name__ == "__main__":
    main()
