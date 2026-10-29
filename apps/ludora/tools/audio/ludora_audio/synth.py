"""Synthesised layers for the sound effects: transients, thumps, whooshes, sparkles, pops, risers.

Things the patches, the kit and the transitions do not cover, made with numpy.
Every function returns a stereo float32 array of shape (samples, 2) and takes
a seed where it uses noise, so effects render the same on every build.

How they are kept safe on every speaker:

- Stereo comes from placing sounds (equal-power panning) and from noise whose
  two channels are only partly alike (`corr`), never from delaying one
  channel: a delay comb-filters when a projector folds the sound to mono.
- Anything low (thumps, impacts) is mono, and carries harmonics between 150
  and 600 Hz, so it is heard on laptop and Chromebook speakers too.
- Pitched sparkles sit on D major pentatonic, the key of the effects, so a
  shower of pings is in tune with the notes under it.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfilt

from .engine import svf
from .render import SR

# D major pentatonic (D, E, F#, A, B) from D5 to F#8, in Hz: what pitched sparkles and coins pick from.
PENTATONIC = [587.33 * 2 ** (s / 12) for octave in range(4) for s in (12 * octave, 12 * octave + 2, 12 * octave + 4, 12 * octave + 7, 12 * octave + 9)]


def _t(seconds: float) -> np.ndarray:
    return np.arange(max(1, round(seconds * SR))) / SR


def _stereo(left: np.ndarray, right: np.ndarray | None = None) -> np.ndarray:
    return np.stack([left, left if right is None else right], axis=1).astype(np.float32)


def _pan(x: np.ndarray, position: float) -> np.ndarray:
    """A mono signal placed in the field with equal-power panning, -1 left to 1 right."""
    angle = (np.clip(position, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(angle) * np.sqrt(2), x * np.sin(angle) * np.sqrt(2)], axis=1)


def _band(x: np.ndarray, lo: float, hi: float, order: int = 4) -> np.ndarray:
    sos = butter(order, [max(20, lo), min(SR / 2 - 100, hi)], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def _high(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x, axis=0)


def _noise2(rng, n: int, corr: float | np.ndarray = 0.6) -> np.ndarray:
    """Stereo noise whose channels are `corr` alike: 1 is mono, 0 unrelated (wide, but it thins out in mono)."""
    a, b = rng.standard_normal(n), rng.standard_normal(n)
    c = np.clip(corr, 0, 1)
    return np.stack([a, c * a + np.sqrt(1 - c**2) * b], axis=1)


def _ramp_in(n: int, seconds: float) -> np.ndarray:
    k = max(1, min(n, int(seconds * SR)))
    r = np.ones(n)
    r[:k] = np.linspace(0, 1, k)
    return r


def _fade_end(x: np.ndarray, seconds: float = 0.005) -> np.ndarray:
    k = max(1, min(len(x), int(seconds * SR)))
    x = np.array(x, dtype=np.float64)
    ramp = np.linspace(1, 0, k)
    x[len(x) - k :] *= ramp[:, None] if x.ndim == 2 else ramp
    return x


def _norm(x: np.ndarray, gain: float) -> np.ndarray:
    return (x * (gain / (np.max(np.abs(x)) + 1e-9))).astype(np.float32)


def nearest_pentatonic(f: float) -> float:
    return min(PENTATONIC, key=lambda p: abs(np.log2(p / f)))


# --- Air and transients ------------------------------------------------------


def whoosh(dur: float, f0: float, f1: float, gain: float = 0.3, q: float = 1.6, shape: float = 1.5, seed: int = 1, pan_sweep: float = 0.0, corr: float = 0.6) -> np.ndarray:
    """Noise through a resonant band-pass sweeping from f0 to f1 Hz, swelling and fading.

    The channels share most of their noise (`corr`), so it is wide but folds to mono
    without thinning; `pan_sweep` moves it from left to right (a negative value, right
    to left), at most two thirds of the way to each side.
    """
    rng = np.random.default_rng(seed)
    t = _t(dur)
    n = len(t)
    x = t / dur
    noise = _noise2(rng, n, corr)
    centre = f0 * (f1 / f0) ** x
    res = float(np.clip(1 - 1 / (2 * q), 0.2, 0.9))
    band = svf(noise, centre, res, "bp")
    # A little of the noise under the band, so it has body as well as a whistle.
    body = svf(noise, centre * 0.7, 0.0, "lp") * 0.25
    out = band + body
    env = np.sin(np.pi * np.clip(x, 0, 1)) ** shape
    out *= env[:, None]
    if pan_sweep:
        p = np.clip(-pan_sweep + 2 * pan_sweep * x, -1, 1) * 0.65
        angle = (p + 1) * np.pi / 4
        out[:, 0] *= np.cos(angle) * np.sqrt(2)
        out[:, 1] *= np.sin(angle) * np.sqrt(2)
    return _norm(_fade_end(out, 0.004), gain)


def click(gain: float = 0.3, dur: float = 0.012, bright: float = 3000, seed: int = 5, corr: float = 0.85) -> np.ndarray:
    """A short high noise tick: the edge on a tap or a tick."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    x = _high(_noise2(rng, len(t), corr), bright) * np.exp(-t * 400)[:, None]
    return _norm(x, gain)


def air(dur: float, lo: float = 3000, hi: float = 14000, attack: float = 0.004, decay: float = 0.08, gain: float = 0.2, corr: float = 0.5, seed: int = 9) -> np.ndarray:
    """A puff of band-limited noise: breath on a pop, the hiss of a spark, the top of a hit. `decay` is a time constant."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    x = _band(_noise2(rng, len(t), corr), lo, hi, order=2)
    env = _ramp_in(len(t), attack) * np.exp(-np.maximum(t - attack, 0) / decay)
    return _norm(_fade_end(x * env[:, None]), gain)


def snap(gain: float = 0.3, f: float = 1800, dur: float = 0.06, seed: int = 10, pan: float = 0.0) -> np.ndarray:
    """A finger-snap-like crack: a resonant noise burst with a fast decay, for grabbing and placing."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    n = rng.standard_normal(len(t))
    x = svf(n, f, 0.75, "bp") + 0.35 * _high(n, 4000)
    x *= np.exp(-t / 0.009) * _ramp_in(len(t), 0.0004)
    return _norm(_fade_end(_pan(x, pan)), gain)


def knock(f: float = 900, dur: float = 0.09, gain: float = 0.3, seed: int = 11, pan: float = 0.0, damp: float = 0.022) -> np.ndarray:
    """A woody knock: two damped modes of a small block with a noise contact on top."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    modes = np.sin(2 * np.pi * f * t) * np.exp(-t / damp) + 0.45 * np.sin(2 * np.pi * f * 2.57 * t) * np.exp(-t / (damp * 0.45))
    contact = _band(rng.standard_normal(len(t)), 2500, 9000, order=2) * np.exp(-t / 0.0025) * 0.6
    x = (modes + contact) * _ramp_in(len(t), 0.0003)
    return _norm(_fade_end(_pan(x, pan)), gain)


# --- Weight ----------------------------------------------------------------


def thump(f: float = 110, dur: float = 0.3, gain: float = 0.5, drop: float = 1.8, drive: float = 2.0, decay: float = 0.07) -> np.ndarray:
    """A pitched low hit, mono: a membrane falling `drop` times its pitch onto `f`, with its upper modes.

    Saturated, so its harmonics (2f to 5f) carry it on small speakers that play
    nothing under 150 Hz. `decay` is the time constant of the body.
    """
    t = _t(dur)
    freq = f * (1 + (drop - 1) * np.exp(-t / 0.018))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    env = np.exp(-t / decay) * _ramp_in(len(t), 0.0008)
    body = np.sin(phase) + 0.5 * np.sin(1.59 * phase) * np.exp(-t / (decay * 0.5)) + 0.3 * np.sin(2.14 * phase) * np.exp(-t / (decay * 0.35))
    x = np.tanh(body * env * drive) / np.tanh(drive)
    return _norm(_fade_end(_stereo(x)), gain)


def impact(dur: float = 0.4, f_start: float = 150, f_end: float = 55, gain: float = 0.8, crack: float = 0.25, seed: int = 2, harmonics: float = 0.6) -> np.ndarray:
    """A punchy low hit: a falling sine thump, saturated for harmonics, with a body an octave and a half up and a bright crack.

    The crack is a little wide; everything under it is mono.
    """
    rng = np.random.default_rng(seed)
    t = _t(dur)
    freq = f_end + (f_start - f_end) * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t * 9)
    body = np.tanh(body * (1 + 3 * harmonics)) / np.tanh(1 + 3 * harmonics)
    # The punch small speakers can play: a tone near 3x the thump, quick to go.
    mid = harmonics * 0.5 * np.sin(3.02 * phase) * np.exp(-t / 0.045)
    x = _stereo(body + mid).astype(np.float64)
    noise = _high(_noise2(rng, len(t), 0.7), 2200) * np.exp(-t * 70)[:, None] * crack
    out = (x + noise) * _ramp_in(len(t), 0.0005)[:, None]
    return _norm(_fade_end(out), gain)


# --- Pitched sparkle ---------------------------------------------------------


def glint(f: float, dur: float = 0.35, gain: float = 0.2, pan: float = 0.0, decay: float = 0.09) -> np.ndarray:
    """One tiny glassy bell ping: a sine with faint inharmonic partials, the highest decaying first."""
    t = _t(dur)
    x = np.zeros(len(t))
    for r, a, d in ((1.0, 1.0, 1.0), (2.76, 0.28, 0.45), (5.40, 0.10, 0.25)):
        if f * r < 17500:
            x += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (decay * d))
    x *= _ramp_in(len(t), 0.0006)
    return _norm(_fade_end(_pan(x, pan)), gain)


def sparkle(dur: float, count: int = 10, lo: float = 2300, hi: float = 7000, gain: float = 0.12, seed: int = 3, start_spread: float = 1.0, spread: float = 0.8, pitched: bool = True) -> np.ndarray:
    """Tiny high pings scattered over `dur` seconds, each placed somewhere in the stereo field.

    `pitched` keeps them on D major pentatonic; otherwise any frequency between lo and hi.
    """
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    notes = [p for p in PENTATONIC if lo <= p <= hi] or [nearest_pentatonic((lo + hi) / 2)]
    for _ in range(count):
        at = int(rng.uniform(0, dur * start_spread * 0.85) * SR)
        f = float(rng.choice(notes)) * 2 ** (rng.uniform(-6, 6) / 1200) if pitched else rng.uniform(lo, hi)
        length = int(rng.uniform(0.07, 0.2) * SR)
        tt = np.arange(length) / SR
        d = rng.uniform(0.022, 0.04)
        ping = (np.sin(2 * np.pi * f * tt) + 0.2 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt / (d * 0.4)) * (f * 2.76 < 17500)) * np.exp(-tt / d) * rng.uniform(0.5, 1.0)
        ping *= _ramp_in(length, 0.0005)
        p = rng.uniform(-spread, spread)
        end = min(n, at + length)
        if at >= n:
            continue
        out[at:end] += _pan(ping[: end - at], p)
    return (out * gain).astype(np.float32)


def coin_shower(dur: float, count: int = 22, gain: float = 0.14, seed: int = 4, lo: float = 2000, hi: float = 4500, spread: float = 0.7) -> np.ndarray:
    """Metallic pings with inharmonic partials, like a pile of coins landing, their fundamentals on the pentatonic scale."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    notes = [p for p in PENTATONIC if lo <= p <= hi]
    for i in range(count):
        at = int((dur * 0.8) * (i / count) ** 0.7 * SR + rng.uniform(0, 0.03) * SR)
        if at >= n:
            continue
        f = float(rng.choice(notes)) * 2 ** (rng.uniform(-8, 8) / 1200)
        length = int(0.25 * SR)
        tt = np.arange(length) / SR
        # Partials above about 17.5 kHz are left out: they would only alias.
        partials = [(r, a) for r, a in ((1, 1.0), (2.76, 0.5), (5.4, 0.25)) if f * r < 17500]
        decay = rng.uniform(18, 30)
        ping = sum(a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt * decay * (1 + 0.6 * (r > 1))) for r, a in partials) * _ramp_in(length, 0.0004)
        # A tiny contact noise on each, so they clink rather than beep.
        ping += _high(rng.standard_normal(length), 5000) * np.exp(-tt / 0.002) * 0.25
        end = min(n, at + length)
        out[at:end] += _pan(ping[: end - at], rng.uniform(-spread, spread))
    return _norm(out, gain)


def shimmer(dur: float, base: float = 1760, gain: float = 0.12, seed: int = 6) -> np.ndarray:
    """A glassy halo: high partials with a slow tremolo, each placed in the field, fading in and out.

    Width comes from where each partial sits, not from different phases in the two
    channels, so it does not cancel folded to mono.
    """
    rng = np.random.default_rng(seed)
    t = _t(dur)
    x = np.zeros((len(t), 2))
    for i, ratio in enumerate((1, 1.5, 2, 3, 4)):
        f = base * ratio * (1 + rng.uniform(-0.002, 0.002))
        if f > 16000:
            continue
        trem = 0.65 + 0.35 * np.sin(2 * np.pi * rng.uniform(4.5, 7.5) * t + rng.uniform(0, 6))
        tone = np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * trem / (1 + i)
        x += _pan(tone, (-0.6, 0.55, -0.3, 0.7, 0.1)[i])
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.2
    x *= env[:, None]
    return _norm(x, gain)


# --- Pitched one-shots ---------------------------------------------------------


def pop(f: float = 600, dur: float = 0.12, gain: float = 0.5, pan: float = 0.0, harmonics: float = 0.35, seed: int = 12) -> np.ndarray:
    """A bubble pop: a tone that leaps up in pitch and is gone, with an overtone and a breath of air on top."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    freq = f * (1 + 1.2 * (1 - np.exp(-t * 60)))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    env = np.exp(-t * 32) * np.clip(t / 0.003, 0, 1)
    x = (np.sin(phase) + harmonics * np.sin(2 * phase) * np.exp(-t * 20)) * env
    puff = _band(rng.standard_normal(len(t)), 2500, 9000, order=2) * np.exp(-t / 0.006) * 0.12
    return _norm(_fade_end(_pan(x + puff, pan)), gain)


def chirp(f0: float, f1: float, dur: float = 0.2, gain: float = 0.3, harmonics: float = 0.4, pan: float = 0.0, decay: float | None = None) -> np.ndarray:
    """A tone gliding from f0 to f1 Hz with its second and third harmonics: a bonk, a boing, a little fall."""
    t = _t(dur)
    freq = f0 * (f1 / f0) ** (t / dur)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    x = np.sin(phase) + harmonics * np.sin(2 * phase) + harmonics * 0.45 * np.sin(3 * phase)
    env = _ramp_in(len(t), 0.002) * (np.exp(-t / decay) if decay else np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.5)
    return _norm(_fade_end(_pan(x * env, pan), 0.01), gain)


def riser(dur: float, f0: float = 180, f1: float = 1400, gain: float = 0.25, noise: float = 0.35, seed: int = 7, corr: float = 0.6) -> np.ndarray:
    """A rising build: two soft band-limited saws a few cents apart sweeping up, with a noise swell, cut off at the top."""
    rng = np.random.default_rng(seed)
    t = _t(dur)
    freq = f0 * (f1 / f0) ** (t / dur) ** 1.6
    out = np.zeros((len(t), 2))
    for cents, pos in ((-6, -0.5), (6, 0.5)):
        phase = 2 * np.pi * np.cumsum(freq * 2 ** (cents / 1200)) / SR
        top = int(max(1, min(8, 16000 // max(float(freq.max()), 1))))
        saw = sum(np.sin(k * phase) / k for k in range(1, top + 1))
        out += _pan(saw * 0.25, pos)
    hiss = _band(_noise2(rng, len(t), corr), 800, 9000) * noise
    env = (t / dur) ** 1.8
    x = (out + hiss) * env[:, None]
    k = int(0.01 * SR)
    x[-k:] *= np.linspace(1, 0, k)[:, None]
    return _norm(x, gain)


def rattle(dur: float = 0.42, hits: int = 9, gain: float = 0.4, seed: int = 8, lo: float = 1300, hi: float = 2600, spread: float = 0.6) -> np.ndarray:
    """Dice tumbling: woody clicks that come faster and softer, then stop, each from a different place."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    at = 0.0
    gap = 0.07
    for i in range(hits):
        k = int(at * SR)
        if k >= n:
            break
        length = int(0.035 * SR)
        tt = np.arange(length) / SR
        f = rng.uniform(lo, hi)
        tok = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 1.7 * tt) + 0.25 * np.sin(2 * np.pi * f * 2.9 * tt)) * np.exp(-tt * 140)
        tok += _band(rng.standard_normal(length), 3000, 10000, order=2) * np.exp(-tt / 0.0015) * 0.5
        tok *= _ramp_in(length, 0.0003)
        amp = (1 - i / hits) ** 0.6 * rng.uniform(0.7, 1.0)
        end = min(n, k + length)
        out[k:end] += _pan(tok[: end - k] * amp, rng.uniform(-spread, spread))
        at += gap * rng.uniform(0.6, 1.2)
        gap *= 0.82
    return _norm(out, gain)


def tone(f: float, dur: float, gain: float = 0.3, kind: str = "square", decay: float = 6.0) -> np.ndarray:
    """A plain synth tone (softened square or triangle) with a quick decay, for alarms and beeps."""
    t = _t(dur)
    phase = 2 * np.pi * f * t
    if kind == "square":
        x = sum(np.sin(k * phase) / k for k in range(1, 12, 2) if k * f < 17500)
    else:
        x = sum(((-1) ** ((k - 1) // 2)) * np.sin(k * phase) / k**2 for k in range(1, 12, 2) if k * f < 17500)
    env = np.exp(-t * decay) * np.clip(t / 0.004, 0, 1)
    env[-int(0.006 * SR) :] *= np.linspace(1, 0, int(0.006 * SR))
    return _stereo(x * env * gain / (np.max(np.abs(x)) + 1e-9))
