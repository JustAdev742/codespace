"""Synthesised layers for the sound effects: whooshes, impacts, sparkles, pops, risers.

Things a soundfont does not have, made from noise and sine waves with numpy.
Every function returns a stereo float32 array of shape (samples, 2) and takes
a seed, so effects render the same on every build.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfilt

from .render import SR


def _t(seconds: float) -> np.ndarray:
    return np.arange(int(round(seconds * SR))) / SR


def _stereo(left: np.ndarray, right: np.ndarray | None = None) -> np.ndarray:
    return np.stack([left, left if right is None else right], axis=1).astype(np.float32)


def _band(x: np.ndarray, lo: float, hi: float, order: int = 4) -> np.ndarray:
    sos = butter(order, [max(20, lo), min(SR / 2 - 100, hi)], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def _high(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def whoosh(dur: float, f0: float, f1: float, gain: float = 0.3, q: float = 1.6, shape: float = 1.5, seed: int = 1, pan_sweep: float = 0.0) -> np.ndarray:
    """Noise through a band-pass filter sweeping from f0 to f1 Hz, swelling and fading (short-time FFT masking)."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    frame, hop = 1024, 256
    win = np.hanning(frame)
    freqs = np.fft.rfftfreq(frame, 1 / SR)
    out = []
    for ch in range(2):
        noise = rng.standard_normal(n + frame)
        y = np.zeros(n + frame)
        for start in range(0, n, hop):
            p = start / max(1, n)
            fc = f0 * (f1 / f0) ** p
            bw = max(60.0, fc / q)
            mask = np.exp(-0.5 * ((freqs - fc) / bw) ** 2)
            seg = noise[start : start + frame] * win
            y[start : start + frame] += np.fft.irfft(np.fft.rfft(seg) * mask, frame) * win
        out.append(y[:n])
    t = np.arange(n) / n
    env = np.sin(np.pi * np.clip(t, 0, 1)) ** shape
    left, right = out[0] * env, out[1] * env
    if pan_sweep:
        angle = (np.clip(-pan_sweep + 2 * pan_sweep * t, -1, 1) + 1) * np.pi / 4
        left, right = left * np.cos(angle) * 1.41, right * np.sin(angle) * 1.41
    x = _stereo(left, right)
    return (x * (gain / (np.max(np.abs(x)) + 1e-9))).astype(np.float32)


def impact(dur: float = 0.4, f_start: float = 150, f_end: float = 42, gain: float = 0.8, crack: float = 0.25, seed: int = 2) -> np.ndarray:
    """A punchy low hit: a falling sine thump with a short bright crack on top."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    freq = f_end + (f_start - f_end) * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 8)
    noise = _high(rng.standard_normal(len(t)), 2500) * np.exp(-t * 70) * crack
    x = body + noise
    return _stereo(x * gain / (np.max(np.abs(x)) + 1e-9))


def sparkle(dur: float, count: int = 10, lo: float = 2500, hi: float = 7000, gain: float = 0.12, seed: int = 3, start_spread: float = 1.0) -> np.ndarray:
    """Tiny high pings scattered over `dur` seconds, each placed somewhere in the stereo field."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for _ in range(count):
        at = int(rng.uniform(0, dur * start_spread * 0.85) * SR)
        f = rng.uniform(lo, hi)
        length = int(rng.uniform(0.06, 0.18) * SR)
        tt = np.arange(length) / SR
        ping = np.sin(2 * np.pi * f * tt) * np.exp(-tt * rng.uniform(25, 45)) * rng.uniform(0.5, 1.0)
        p = rng.uniform(-0.8, 0.8)
        end = min(n, at + length)
        out[at:end, 0] += ping[: end - at] * np.cos((p + 1) * np.pi / 4) * 1.41
        out[at:end, 1] += ping[: end - at] * np.sin((p + 1) * np.pi / 4) * 1.41
    return (out * gain).astype(np.float32)


def coin_shower(dur: float, count: int = 22, gain: float = 0.14, seed: int = 4) -> np.ndarray:
    """Metallic pings with inharmonic partials, like a pile of coins landing."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for i in range(count):
        at = int((dur * 0.8) * (i / count) ** 0.7 * SR + rng.uniform(0, 0.03) * SR)
        f = rng.uniform(2200, 4200)
        length = int(0.25 * SR)
        tt = np.arange(length) / SR
        # Partials above about 18 kHz are left out: they would only alias.
        partials = [(r, a) for r, a in ((1, 1.0), (2.76, 0.5), (5.4, 0.25)) if f * r < 18000]
        ping = sum(a * np.sin(2 * np.pi * f * r * tt) for r, a in partials) * np.exp(-tt * rng.uniform(18, 30))
        p = rng.uniform(-0.7, 0.7)
        if at >= n:
            continue
        end = min(n, at + length)
        out[at:end, 0] += ping[: end - at] * np.cos((p + 1) * np.pi / 4)
        out[at:end, 1] += ping[: end - at] * np.sin((p + 1) * np.pi / 4)
    return (out * gain / (np.max(np.abs(out)) + 1e-9)).astype(np.float32)


def pop(f: float = 600, dur: float = 0.12, gain: float = 0.5) -> np.ndarray:
    """A bubble pop: a sine that leaps up in pitch and is gone."""
    t = _t(dur)
    freq = f * (1 + 1.2 * (1 - np.exp(-t * 60)))
    x = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 32) * np.clip(t / 0.003, 0, 1)
    return _stereo(x * gain)


def click(gain: float = 0.3, dur: float = 0.012, bright: float = 3000, seed: int = 5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = _t(dur)
    x = _high(rng.standard_normal(len(t)), bright) * np.exp(-t * 400)
    return _stereo(x * gain / (np.max(np.abs(x)) + 1e-9))


def shimmer(dur: float, base: float = 1760, gain: float = 0.12, seed: int = 6) -> np.ndarray:
    """A glassy halo: detuned high sines with a slow tremolo, fading in and out."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    x = np.zeros((len(t), 2))
    for i, ratio in enumerate((1, 1.5, 2, 2.5, 3)):
        for ch in (0, 1):
            f = base * ratio * (1 + rng.uniform(-0.004, 0.004))
            trem = 0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(5, 9) * t + rng.uniform(0, 6))
            x[:, ch] += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * trem / (1 + i)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.2
    x *= env[:, None]
    return (x * gain / (np.max(np.abs(x)) + 1e-9)).astype(np.float32)


def riser(dur: float, f0: float = 180, f1: float = 1400, gain: float = 0.25, noise: float = 0.35, seed: int = 7) -> np.ndarray:
    """A rising build: a soft band-limited sawtooth sweeping up, with a noise swell, cut off at the top."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    freq = f0 * (f1 / f0) ** (t / dur) ** 1.6
    phase = 2 * np.pi * np.cumsum(freq) / SR
    saw = sum(np.sin(k * phase) / k for k in range(1, 9))
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t)
    saw = saw * vib
    hiss = _band(rng.standard_normal(len(t)), 800, 9000) * noise
    env = (t / dur) ** 1.8
    x = (saw * 0.35 + hiss) * env
    x[-int(0.01 * SR) :] *= np.linspace(1, 0, int(0.01 * SR))
    left = x
    right = np.roll(x, int(0.004 * SR))
    st = _stereo(left, right)
    return (st * gain / (np.max(np.abs(st)) + 1e-9)).astype(np.float32)


def rattle(dur: float = 0.42, hits: int = 9, gain: float = 0.4, seed: int = 8) -> np.ndarray:
    """Dice tumbling: woody clicks that come faster and softer, then stop."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    at = 0.0
    gap = 0.07
    for i in range(hits):
        length = int(0.03 * SR)
        tt = np.arange(length) / SR
        f = rng.uniform(1400, 2600)
        knock = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 1.7 * tt)) * np.exp(-tt * 140)
        k = int(at * SR)
        if k >= n:
            break
        amp = (1 - i / hits) ** 0.6
        p = rng.uniform(-0.6, 0.6)
        end = min(n, k + length)
        out[k:end, 0] += knock[: end - k] * amp * np.cos((p + 1) * np.pi / 4)
        out[k:end, 1] += knock[: end - k] * amp * np.sin((p + 1) * np.pi / 4)
        at += gap * rng.uniform(0.6, 1.2)
        gap *= 0.82
    return (out * gain / (np.max(np.abs(out)) + 1e-9)).astype(np.float32)


def tone(f: float, dur: float, gain: float = 0.3, kind: str = "square", decay: float = 6.0) -> np.ndarray:
    """A plain synth tone (softened square or triangle) with a quick decay, for alarms and beeps."""
    t = _t(dur)
    phase = 2 * np.pi * f * t
    if kind == "square":
        x = sum(np.sin(k * phase) / k for k in range(1, 12, 2))
    else:
        x = sum(((-1) ** ((k - 1) // 2)) * np.sin(k * phase) / k**2 for k in range(1, 12, 2))
    env = np.exp(-t * decay) * np.clip(t / 0.004, 0, 1)
    env[-int(0.006 * SR) :] *= np.linspace(1, 0, int(0.006 * SR))
    return _stereo(x * env * gain / (np.max(np.abs(x)) + 1e-9))
