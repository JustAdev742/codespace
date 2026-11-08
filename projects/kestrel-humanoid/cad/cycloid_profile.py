#!/usr/bin/env python3
"""Cycloidal disc profile for the KH-C scratch-build reducers -> DXF for wire EDM.

Standard equations (pin circle radius R, pin radius Rr, eccentricity E, N ring pins, disc has N-1 lobes):
    psi(t) = atan2( sin((1-N) t),  R/(E N) - cos((1-N) t) )
    x(t) =  R cos t - Rr cos(t + psi) - E cos(N t)
    y(t) = -R sin t + Rr sin(t + psi) + E sin(N t)
A small equidistant offset `clearance` (default 0.02 mm) is removed for running clearance.
Run:  python cycloid_profile.py  -> cad/out/cycloid_KH-C25.dxf, cycloid_KH-C20.dxf
"""
import math
from pathlib import Path

import cadquery as cq
import numpy as np

DESIGNS = {"KH-C25": dict(R=42.0, Rr=2.5, E=0.9, N=31, holes=(8, 26.0, 4.0 + 0.9)),
           "KH-C20": dict(R=34.0, Rr=2.0, E=0.8, N=31, holes=(6, 20.0, 3.0 + 0.8))}


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
        disc = cq.Workplane("XY").add(cq.Wire.assembleEdges([cq.Edge.makeSpline(pts, periodic=True)])).toPending().extrude(8)
        k, pcd_r, hole_r = d["holes"]
        for i in range(k):
            a = 2 * math.pi * i / k
            disc = disc.cut(cq.Workplane("XY").center(pcd_r * math.cos(a), pcd_r * math.sin(a)).circle(hole_r).extrude(20, both=True))
        disc = disc.cut(cq.Workplane("XY").circle(11.0).extrude(20, both=True))   # eccentric bearing bore (6802 class OD 24 -> adjust)
        cq.exporters.export(disc.section(4.0), str(out / f"cycloid_{name}.dxf"))
        cq.exporters.export(disc, str(out / "step" / f"cycloid_{name}_disc.step"))
        print(f"{name}: N={d['N']} ratio {d['N'] - 1}:1, min profile radius of curvature {rmin:.2f} mm (pin radius {d['Rr']} mm must be smaller)")
