"""Plot a run's training curves from runs/<name>/log.csv.

    python plot.py --run rough --out runs/rough/curves.png
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent


def smooth(y, k=25):
    y = np.asarray(y, float)
    if len(y) < k:
        return y
    c = np.convolve(np.nan_to_num(y), np.ones(k) / k, mode="valid")
    return np.concatenate([np.full(k - 1, np.nan), c])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="rough")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    rows = list(csv.DictReader(open(HERE / "runs" / a.run / "log.csv")))
    col = lambda k: np.array([float(r[k]) for r in rows])  # noqa: E731
    steps = col("steps") / 1e6
    hours = col("time_s") / 3600
    fig, ax = plt.subplots(2, 2, figsize=(11, 7), constrained_layout=True)
    ax[0, 0].plot(steps, smooth(col("ep_len_s")), color="#1f6f8b")
    ax[0, 0].set(title="Episode length (s, 20 s = time-out)", xlabel="environment steps (M)")
    ax[0, 1].plot(steps, smooth(col("fall_rate")), color="#b5442c")
    ax[0, 1].set(title="Fraction of episodes ending in a fall", xlabel="environment steps (M)", ylim=(0, 1.02))
    names = [("row_flat", "flat"), ("row_rough", "rough"), ("row_slope_dn", "slope down"), ("row_slope_up", "slope up"),
             ("row_stairs_dn", "stairs down"), ("row_stairs_up", "stairs up")]
    for k, lab in names:
        ax[1, 0].plot(steps, smooth(col(k)), label=lab, lw=1.6 if "stairs" in k else 1.0)
    ax[1, 0].set(title="Curriculum level per terrain (0 = easiest, 5 = 18 cm steps / 15°)",
                 xlabel="environment steps (M)", ylim=(-0.1, 5.1))
    ax[1, 0].legend(fontsize=8, ncol=2)
    ax[1, 1].plot(steps, smooth(col("ep_return")), color="#3d7a3d")
    ax[1, 1].set(title="Episode return", xlabel="environment steps (M)")
    for x in ax.ravel():
        x.grid(alpha=0.3)
    fig.suptitle(f"KESTREL K1 locomotion, CPU PPO: {steps[-1]:.0f} M steps in {hours[-1]:.1f} h of wall time "
                 f"on 4 vCPUs", fontsize=10)
    out = a.out or HERE / "runs" / a.run / "curves.png"
    fig.savefig(out, dpi=110)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
