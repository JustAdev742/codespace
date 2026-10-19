"""Verification: grid and padding convergence of the Newtonian floor/ceiling portal solution.

R = 1 m, h = 4 m, g = 9.81 m/s^2. Prints one JSON line per run; results/grid_convergence.log
holds the output of the run reported in the maths appendix.

    python checks/grid_convergence.py
"""
import json
import pathlib
import sys
import time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from portalphys import newtonian_portal as NP

rows = []
for dx in (0.1, 0.05, 0.025):
    t0 = time.time()
    F = NP.solve(R=1.0, h=4.0, g=9.81, dx=dx, pad=3.0)
    st = NP.face_field_stats(F)
    d = NP.axis_drop(F, z0=3.0, t_end=6.0, dt=5e-4)
    row = {"dx": dx, "mid_g": st["room_midpoint"] / 9.81, "aboveA_g": st["room_above_A"] / 9.81,
           "behindA_g": st["behind_A (below floor)"] / 9.81, "phiA": st["phi_face_A"], "phiB": st["phi_face_B"],
           "vmax": float(abs(d["v"]).max()), "secs": round(time.time() - t0, 1)}
    rows.append(row)
    print(json.dumps(row), flush=True)
# padding sensitivity at dx = 0.05
for pad in (3.0, 6.0, 9.0):
    F = NP.solve(R=1.0, h=4.0, g=9.81, dx=0.05, pad=pad)
    st = NP.face_field_stats(F)
    print(json.dumps({"pad": pad, "mid_g": st["room_midpoint"] / 9.81, "aboveA_g": st["room_above_A"] / 9.81,
                      "behindA_g": st["behind_A (below floor)"] / 9.81}), flush=True)
