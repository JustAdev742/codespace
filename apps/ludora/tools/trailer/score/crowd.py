"""The room around the music, synthesized: a school bell down the corridor and the hum of the room.

The cheering and applause are real recordings (samples/), layered in score.py; voices synthesized here did not
sound like people. Everything is stereo float32 at SR and seeded, so a render is repeatable.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000


def _band(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = butter(order, [lo / (SR / 2), min(hi / (SR / 2), 0.99)], btype="band", output="sos")
    return sosfilt(sos, x, axis=0)


def _low(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, f / (SR / 2), output="sos"), x, axis=0)


def _high(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, f / (SR / 2), btype="high", output="sos"), x, axis=0)


def _pan(x: np.ndarray, p: float) -> np.ndarray:
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def _env(n: int, points: list[tuple[float, float]]) -> np.ndarray:
    t = np.arange(n) / SR
    xs, ys = zip(*points)
    return np.interp(t, xs, ys).astype(np.float32)


def bell(dur: float = 1.8, seed: int = 3, ring: float = 1.3) -> np.ndarray:
    """An electric school bell down the corridor: a hammer on a gong, about 22 strikes a second."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    partials = [(1.0, 1.0, 1.2), (2.32, 0.6, 0.8), (4.25, 0.35, 0.5), (6.63, 0.2, 0.35), (8.9, 0.12, 0.25)]
    f0 = 1180
    tone = sum(a * np.sin(2 * np.pi * f0 * r * t) for r, a, _ in partials)
    strikes = np.zeros(n)
    for i, s in enumerate(np.arange(0, ring, 1 / 22)):
        strikes[int(s * SR)] = 0.75 + 0.25 * rng.random()
    hammer = np.convolve(strikes, np.exp(-np.arange(int(0.05 * SR)) / SR / 0.012))[:n]
    x = tone * (0.35 + hammer) * _env(n, [(0, 0), (0.01, 1), (ring, 1), (dur, 0)])
    x = _band(x, 500, 5000)
    return (_pan(x.astype(np.float32), -0.3) * 0.1).astype(np.float32)


def room_tone(dur: float, seed: int = 4) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    x = _low(np.cumsum(rng.normal(0, 1, (n, 2)), axis=0) * 0.002, 500)
    x = _high(x, 40)
    return (x / (np.max(np.abs(x)) + 1e-9) * 0.02).astype(np.float32)
