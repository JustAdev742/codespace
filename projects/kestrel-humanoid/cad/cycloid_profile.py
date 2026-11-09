#!/usr/bin/env python3
"""Cycloidal disc profile for the KH-C scratch-build reducers -> DXF for wire EDM.

Standard equations (pin circle radius R, pin radius Rr, eccentricity E, N ring pins, disc has N-1 lobes):
    psi(t) = atan2( sin((1-N) t),  R/(E N) - cos((1-N) t) )
    x(t) =  R cos t - Rr cos(t + psi) - E cos(N t)
    y(t) = -R sin t + Rr sin(t + psi) + E sin(N t)
A small equidistant offset `clearance` (default 0.02 mm) is removed for running clearance.
Disc bore = outer race of the eccentric needle cage running directly on the hardened bore (docs/09 §5.3, hold H6):
  C25: needle cage Fw 20 / Ew 26 on a Ø20 h5 100Cr6 eccentric sleeve -> disc bore Ø26 G6
  C20: needle cage Fw 16 / Ew 22 on a Ø16 h5 sleeve                   -> disc bore Ø22 G6
Output-pin holes: solid Ø8 pins on PCD 52 -> Ø9.80 (C25); Ø6 on PCD 40 -> Ø7.60 (C20) (pin Ø + 2E).
Run:  python cycloid_profile.py  -> cad/out/cycloid_KH-C25.dxf, cycloid_KH-C20.dxf
"""
import math
from pathlib import Path

import cadquery as cq
import numpy as np

DESIGNS = {"KH-C25": dict(R=42.0, Rr=2.5, E=0.9, N=31, holes=(8, 26.0, 4.0 + 0.9), bore=26.0, thick=8.0),
           "KH-C20": dict(R=34.0, Rr=2.0, E=0.8, N=31, holes=(6, 20.0, 3.0 + 0.8), bore=22.0, thick=6.0)}


def profile(R, Rr, E, N, clearance=0.02, n=6000):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    psi = np.arctan2(np.sin((1 - N) * t), R / (E * N) - np.cos((1 - N) * t))
    x = R * np.cos(t) - (Rr + clearance) * np.cos(t + psi) - E * np.cos(N * t)
    y = -R * np.sin(t) + (Rr + clearance) * np.sin(t + psi) + E * np.sin(N * t)
    return x, y


def check(R, Rr, E, N):
    """Undercut guard on the pin-centre epitrochoid: the pin radius must be below the minimum radius
    of curvature of its concave regions; also E*N < R. Returns that minimum radius."""
    assert E * N < R, "eccentricity too large (E*N must be < R)"
    t = np.linspace(0, 2 * np.pi, 40000, endpoint=False)
    x = R * np.cos(t) - E * np.cos(N * t)
    y = -R * np.sin(t) + E * np.sin(N * t)
    dx, dy = np.gradient(x, t), np.gradient(y, t)
    ddx, ddy = np.gradient(dx, t), np.gradient(dy, t)
    k = (dx * ddy - dy * ddx) / np.power(dx * dx + dy * dy, 1.5)
    conc = k[k * np.sign(np.mean(k)) < 0]
    rho = float((1 / np.abs(conc)).min()) if conc.size else float("inf")
    assert Rr < 0.8 * rho, f"undercut risk: pin radius {Rr} vs min curvature radius {rho:.2f}"
    return rho


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "out"
    out.mkdir(exist_ok=True)
    for name, d in DESIGNS.items():
        rmin = check(d["R"], d["Rr"], d["E"], d["N"])
        x, y = profile(d["R"], d["Rr"], d["E"], d["N"])
        pts = [cq.Vector(float(a), float(b), 0) for a, b in zip(x[::10], y[::10])]
        disc = cq.Workplane("XY").add(cq.Wire.assembleEdges([cq.Edge.makeSpline(pts, periodic=True)])).toPending().extrude(d["thick"])
        k, pcd_r, hole_r = d["holes"]
        for i in range(k):
            a = 2 * math.pi * i / k
            disc = disc.cut(cq.Workplane("XY").center(pcd_r * math.cos(a), pcd_r * math.sin(a)).circle(hole_r).extrude(20, both=True))
        disc = disc.cut(cq.Workplane("XY").circle(d["bore"] / 2).extrude(20, both=True))   # needle-cage outer race, G6
        cq.exporters.export(disc.section(d["thick"] / 2), str(out / f"cycloid_{name}.dxf"))
        cq.exporters.export(disc, str(out / "step" / f"cycloid_{name}_disc.step"))
        print(f"{name}: N={d['N']} ratio {d['N'] - 1}:1, min profile radius of curvature {rmin:.2f} mm (pin radius {d['Rr']} mm must be smaller), "
              f"bore Ø{d['bore']:.0f} G6, {d['thick']:.0f} mm disc")
