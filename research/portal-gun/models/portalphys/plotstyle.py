"""Shared matplotlib styling: reference dataviz palette (fixed categorical order, thin
marks, hairline solid grid, text in ink tokens rather than series colours)."""

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
DIVERGING_MID = "#f0efec"


def apply():
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": AXIS, "axes.linewidth": 0.8, "axes.labelcolor": INK2,
        "axes.titlecolor": INK, "axes.titlesize": 11, "axes.titleweight": "semibold",
        "axes.labelsize": 9.5, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
        "grid.linestyle": "-", "xtick.color": MUTED, "ytick.color": MUTED,
        "xtick.labelcolor": INK2, "ytick.labelcolor": INK2, "xtick.labelsize": 8.5,
        "ytick.labelsize": 8.5, "legend.frameon": False, "legend.fontsize": 8.5,
        "legend.labelcolor": INK2, "lines.linewidth": 2.0, "lines.solid_capstyle": "round",
        "lines.solid_joinstyle": "round", "font.family": "DejaVu Sans", "text.color": INK,
        "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 110, "savefig.dpi": 150,
        "axes.prop_cycle": matplotlib.cycler(color=SERIES),
    })


def note(ax, x, y, text, **kw):
    """Direct label in secondary ink (never the series colour)."""
    kw.setdefault("fontsize", 8)
    kw.setdefault("color", INK2)
    ax.text(x, y, text, **kw)
