"""Effects and measurements on stereo float arrays of shape (samples, 2).

The reverb is a convolution with an impulse response generated here (no
recorded spaces to license); EQ, compression and limiting come from Spotify's
pedalboard; loudness is measured to ITU-R BS.1770 with pyloudnorm.
"""

from __future__ import annotations

import numpy as np
import pyloudnorm
from pedalboard import (
    Compressor,
    HighpassFilter,
    HighShelfFilter,
    LowpassFilter,
    LowShelfFilter,
    Pedalboard,
    PeakFilter,
)
from scipy.ndimage import minimum_filter1d
from scipy.signal import fftconvolve, lfilter, resample_poly

from .render import SR


def db(x: float) -> float:
    return float(10 ** (x / 20))


def silence(seconds: float) -> np.ndarray:
    return np.zeros((int(round(seconds * SR)), 2), dtype=np.float32)


def fit(x: np.ndarray, n: int) -> np.ndarray:
    """Pad with silence or cut to exactly n samples."""
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros((n - len(x), x.shape[1]), dtype=x.dtype)])


def place(bus: np.ndarray, x: np.ndarray, at: int) -> None:
    """Add x into bus starting at sample `at`, clipping at the bus's end."""
    if at >= len(bus):
        return
    end = min(len(bus), at + len(x))
    bus[at:end] += x[: end - at]


def process(x: np.ndarray, board: Pedalboard) -> np.ndarray:
    if not len(board):
        return x
    return board(x.T.astype(np.float32), SR).T.astype(np.float32)


def eq_board(highpass: float | None = None, lowpass: float | None = None, bands: list[tuple[str, float, float, float]] | None = None, comp: tuple[float, float] | None = None) -> Pedalboard:
    plugins = []
    if highpass:
        plugins.append(HighpassFilter(cutoff_frequency_hz=highpass))
    if lowpass:
        plugins.append(LowpassFilter(cutoff_frequency_hz=lowpass))
    for kind, freq, gain, q in bands or []:
        if kind == "low_shelf":
            plugins.append(LowShelfFilter(cutoff_frequency_hz=freq, gain_db=gain, q=q))
        elif kind == "high_shelf":
            plugins.append(HighShelfFilter(cutoff_frequency_hz=freq, gain_db=gain, q=q))
        else:
            plugins.append(PeakFilter(cutoff_frequency_hz=freq, gain_db=gain, q=q))
    if comp:
        threshold, ratio = comp
        plugins.append(Compressor(threshold_db=threshold, ratio=ratio, attack_ms=8, release_ms=120))
    return Pedalboard(plugins)


def pan(x: np.ndarray, position: float) -> np.ndarray:
    """Equal-power balance: -1 is hard left, 1 hard right."""
    angle = (position + 1) * np.pi / 4
    out = x.copy()
    out[:, 0] *= np.cos(angle) * np.sqrt(2)
    out[:, 1] *= np.sin(angle) * np.sqrt(2)
    return out


def width(x: np.ndarray, amount: float) -> np.ndarray:
    """Scale the side signal: 0 is mono, 1 unchanged, above 1 wider."""
    mid = (x[:, 0] + x[:, 1]) / 2
    side = (x[:, 0] - x[:, 1]) / 2 * amount
    return np.stack([mid + side, mid - side], axis=1)


def make_ir(seconds: float = 1.8, predelay: float = 0.02, seed: int = 7, brightness: float = 0.55, early: float = 0.6) -> np.ndarray:
    """A stereo impulse response: early reflections, then a tail that darkens as it decays.

    `seconds` is the RT60 (time to fall by 60 dB); `brightness` 0..1 sets how
    much treble the tail starts with.
    """
    rng = np.random.default_rng(seed)
    n = int(seconds * 1.2 * SR)
    t = np.arange(n) / SR
    env = 10 ** (-3 * t / seconds)
    noise = rng.standard_normal((n, 2))
    # Two colours of tail: bright at the start, dark later, crossfaded over the decay.
    a_bright = np.exp(-2 * np.pi * (2000 + 9000 * brightness) / SR)
    a_dark = np.exp(-2 * np.pi * (900 + 2500 * brightness) / SR)
    bright = lfilter([1 - a_bright], [1, -a_bright], noise, axis=0)
    dark = lfilter([1 - a_dark], [1, -a_dark], noise, axis=0)
    mixw = np.clip(t / (seconds * 0.6), 0, 1)[:, None]
    tail = (bright * (1 - mixw) + dark * mixw) * env[:, None]
    # Fade the tail in over the first 25 ms so the early reflections stand out.
    tail *= np.clip(t / 0.025, 0, 1)[:, None]
    ir = tail
    # Early reflections: a few discrete taps, a little different on each side.
    taps = [(0.007, 0.9), (0.013, 0.7), (0.019, 0.55), (0.027, 0.45), (0.034, 0.35), (0.046, 0.25), (0.058, 0.18)]
    for i, (when, amp) in enumerate(taps):
        for ch in (0, 1):
            k = int((when + (0.0015 if (i + ch) % 2 else 0)) * SR)
            if k < n:
                ir[k, ch] += amp * early * (1 if (i + ch) % 3 else -1)
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir /= np.sqrt(np.sum(ir**2, axis=0, keepdims=True))
    return ir.astype(np.float32)


def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """Each channel through its own channel of the impulse response; output trimmed to len(x)."""
    out = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in (0, 1)], axis=1)
    return out.astype(np.float32)


def reverb(x: np.ndarray, ir: np.ndarray, low_cut: float = 280, high_cut: float = 9000) -> np.ndarray:
    """A reverb return: the send filtered (no boomy lows, no fizzy highs) and convolved."""
    send = process(x, Pedalboard([HighpassFilter(cutoff_frequency_hz=low_cut), LowpassFilter(cutoff_frequency_hz=high_cut)]))
    return convolve(send, ir)


def echo(x: np.ndarray, delay_s: float, feedback: float = 0.45, repeats: int = 6, high_cut: float = 5000) -> np.ndarray:
    """A ping-pong echo built from a fixed number of repeats, alternating sides, each darker."""
    mono = x.mean(axis=1)
    out = np.zeros_like(x)
    d = int(round(delay_s * SR))
    for k in range(repeats):
        shift = d * (k + 1)
        if shift >= len(mono):
            break
        out[shift:, k % 2] += mono[: len(mono) - shift] * feedback**k
    return process(out, Pedalboard([LowpassFilter(cutoff_frequency_hz=high_cut), HighpassFilter(cutoff_frequency_hz=300)]))


def duck_curve(n: int, hits_s: list[float], depth: float, release_s: float = 0.16, attack_s: float = 0.006) -> np.ndarray:
    """A gain curve that dips by `depth` at each hit and recovers over `release_s` (sidechain pumping)."""
    g = np.ones(n, dtype=np.float32)
    length = int((attack_s + release_s * 5) * SR)
    k = np.arange(length) / SR
    shape = np.where(k < attack_s, 1 - depth * (k / attack_s), 1 - depth * np.exp(-(k - attack_s) / release_s)).astype(np.float32)
    for h in hits_s:
        i = int(round(h * SR))
        if i >= n:
            continue
        j = min(n, i + length)
        g[i:j] = np.minimum(g[i:j], shape[: j - i])
    return g


def fade(x: np.ndarray, fade_in: float = 0.0, fade_out: float = 0.0) -> np.ndarray:
    out = x.copy()
    if fade_in > 0:
        k = min(len(out), int(fade_in * SR))
        out[:k] *= np.linspace(0, 1, k, dtype=np.float32)[:, None] ** 2
    if fade_out > 0:
        k = min(len(out), int(fade_out * SR))
        out[len(out) - k :] *= np.linspace(1, 0, k, dtype=np.float32)[:, None] ** 2
    return out


def limit(x: np.ndarray, ceiling_db: float = -1.0, lookahead_ms: float = 3.0, release_ms: float = 60.0) -> np.ndarray:
    """A look-ahead peak limiter: turns the peaks down to the ceiling and leaves everything else alone.

    (pedalboard's Limiter adds make-up gain, which is not what a safety limiter
    at the end of a chain should do.) The gain needed at each sample is spread
    over the look-ahead window before the peak, eased back up over the release
    time, and never allowed above what each sample needs.
    """
    ceiling = db(ceiling_db)
    peak = np.max(np.abs(x), axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9)).astype(np.float64)
    if need.min() >= 1.0:
        return x
    w = max(1, int(lookahead_ms * SR / 1000))
    ahead = minimum_filter1d(need, size=2 * w + 1, mode="nearest")
    # Release: the reduction r = 1 - gain decays by a factor `a` per sample unless a new peak needs more,
    # r[n] = max(r_needed[n], a * r[n-1]). Unrolled, that is a running maximum in the log domain, so it
    # needs no per-sample loop.
    log_a = -1.0 / (release_ms * SR / 1000)
    k = np.arange(len(ahead), dtype=np.float64)
    reduction = 1.0 - ahead
    with np.errstate(divide="ignore"):
        log_r = np.where(reduction > 1e-12, np.log(np.maximum(reduction, 1e-300)), -np.inf)
    held = np.exp(np.maximum.accumulate(log_r - k * log_a) + k * log_a)
    gain = np.minimum(1.0 - held, need)
    return (x * gain[:, None]).astype(np.float32)


def master(x: np.ndarray, glue: tuple[float, float] = (-14, 2.0), tilt_db: float = 0.0, ceiling_db: float = -1.0) -> np.ndarray:
    """Bus glue compression, a gentle tilt, and a limiter so nothing clips."""
    board = Pedalboard(
        [
            HighpassFilter(cutoff_frequency_hz=28),
            Compressor(threshold_db=glue[0], ratio=glue[1], attack_ms=20, release_ms=180),
            HighShelfFilter(cutoff_frequency_hz=6000, gain_db=tilt_db, q=0.7),
            LowShelfFilter(cutoff_frequency_hz=180, gain_db=-tilt_db / 2, q=0.7),
        ]
    )
    return limit(process(x, board), ceiling_db)


_meter = pyloudnorm.Meter(SR)


def lufs(x: np.ndarray) -> float:
    """Integrated loudness (LUFS). Very short sounds are measured padded with silence to 0.5 s."""
    if len(x) < SR // 2:
        x = fit(x, SR // 2)
    return float(_meter.integrated_loudness(x.astype(np.float64)))


def true_peak_db(x: np.ndarray) -> float:
    """Peak after 4x oversampling, which catches peaks between samples."""
    up = np.stack([resample_poly(x[:, c], 4, 1) for c in (0, 1)], axis=1)
    peak = float(np.max(np.abs(up)))
    return 20 * np.log10(max(peak, 1e-9))


def normalize_loudness(x: np.ndarray, target_lufs: float, ceiling_db: float = -1.0, measure: slice | None = None) -> np.ndarray:
    """Gain to reach `target_lufs` (measured over `measure` if given), keeping the true peak under the ceiling.

    Limiting the peaks lowers the loudness a little, so it measures again and
    makes up the difference, a few times at most.
    """
    region = measure or slice(None)
    y = x
    for _ in range(4):
        current = lufs(y[region])
        # Loudness gating is not quite scale-invariant (quiet tails cross the -70 LUFS gate), so check again after gain.
        if abs(current - target_lufs) < 0.05 and true_peak_db(y) <= ceiling_db:
            break
        y = (y * db(target_lufs - current)).astype(np.float32)
        tp = true_peak_db(y)
        if tp > ceiling_db:
            # Sample peaks 0.5 dB under the ceiling leave room for the peaks between samples.
            y = limit(y, ceiling_db - 0.5 - max(0.0, tp - ceiling_db) * 0.1)
    return y


def normalize_peak(x: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    peak = float(np.max(np.abs(x)))
    return (x * (db(peak_db) / max(peak, 1e-9))).astype(np.float32)


def seam_error_db(loop: np.ndarray, start: int, end: int, seconds: float = 0.25) -> float:
    """How different the audio after the loop end is from the audio after the loop start, in dB below the signal.

    For a seamless loop the two stretches are the same music, so the error is
    tiny (below about -40 dB).
    """
    n = min(int(seconds * SR), len(loop) - end, end - start)
    a = loop[start : start + n]
    b = loop[end : end + n]
    signal = np.sqrt(np.mean(a**2)) + 1e-12
    err = np.sqrt(np.mean((a - b) ** 2)) + 1e-12
    return float(20 * np.log10(err / signal))


def spectrum_bands(x: np.ndarray) -> dict[str, float]:
    """Energy share (dB relative to the loudest band) in broad bands, to spot a muddy or harsh mix."""
    mono = x.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    freqs = np.fft.rfftfreq(len(mono), 1 / SR)
    bands = {"sub <60": (20, 60), "bass 60-250": (60, 250), "low-mid 250-800": (250, 800), "mid 0.8-3k": (800, 3000), "presence 3-6k": (3000, 6000), "air 6-16k": (6000, 16000)}
    energy = {k: float(spec[(freqs >= lo) & (freqs < hi)].sum()) for k, (lo, hi) in bands.items()}
    top = max(energy.values()) or 1.0
    return {k: round(10 * np.log10(max(v, 1e-12) / top), 1) for k, v in energy.items()}
