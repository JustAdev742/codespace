"""Measuring finished audio: loudness, dynamics, spectrum, stereo, the loop, onsets; and spectrogram pictures.

Used by analyze.py (every shipped track and effect) and showcase.py. Everything
here only reads audio; it never changes what the build makes. The pictures are
PNGs written with zlib and a tiny built-in font, so there is nothing extra to
install.
"""

from __future__ import annotations

import struct
import subprocess
import zlib
from pathlib import Path

import numpy as np
import pyloudnorm
import soundfile as sf
from scipy.ndimage import median_filter
from scipy.signal import butter, csd, lfilter, sosfiltfilt, welch

from . import dsp
from .render import SR

BANDS = {
    "sub": (20, 60),
    "low": (60, 250),
    "low-mid": (250, 800),
    "mid": (800, 3000),
    "presence": (3000, 6000),
    "air": (6000, 20000),
}


def load(path: Path) -> np.ndarray:
    """Any audio file as float32 stereo at 44.1 kHz (MP3s through ffmpeg, which honours the encoder delay)."""
    path = Path(path)
    if path.suffix.lower() in (".wav", ".flac"):
        x, sr = sf.read(path, dtype="float32", always_2d=True)
        if sr == SR:
            return np.repeat(x, 2, axis=1) if x.shape[1] == 1 else x[:, :2]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


# --- Loudness and dynamics -------------------------------------------------

_meter = pyloudnorm.Meter(SR)


def _k_weighted(x: np.ndarray) -> np.ndarray:
    y = x.astype(np.float64)
    for f in _meter._filters.values():
        y = lfilter(f.b, f.a, y, axis=0) * f.passband_gain
    return y


def short_term(x: np.ndarray, window: float = 3.0, hop: float = 0.1, circular: bool = False) -> np.ndarray:
    """Short-term loudness (LUFS) every `hop` seconds over `window`-second windows (EBU R128).

    With `circular` the audio is treated as a loop, so windows wrap around its end.
    """
    if circular:
        x = np.concatenate([x, x[: int(window * SR)]])
    p = np.sum(_k_weighted(x) ** 2, axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    w, h = int(window * SR), int(hop * SR)
    starts = np.arange(0, max(1, len(p) - w + 1), h)
    if circular:
        starts = starts[starts < len(x) - int(window * SR)]
    ms = (c[np.minimum(starts + w, len(p))] - c[starts]) / w
    return -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))


def loudness_range(x: np.ndarray, circular: bool = False) -> float:
    """EBU Tech 3342 loudness range (LU): the spread between quiet and loud passages."""
    st = short_term(x, circular=circular)
    st = st[st > -70]
    if len(st) < 2:
        return 0.0
    rel = 10 * np.log10(np.mean(10 ** (st / 10))) - 20
    st = st[st > rel]
    return float(np.percentile(st, 95) - np.percentile(st, 10))


def envelope_db(x: np.ndarray, ms: float = 5.0) -> np.ndarray:
    """Peak level per `ms` block, in dB full scale."""
    k = max(1, int(ms * SR / 1000))
    mono = np.max(np.abs(x), axis=1)
    n = len(mono) // k * k
    if n == 0:
        return np.array([-120.0])
    blocks = mono[:n].reshape(-1, k).max(axis=1)
    return 20 * np.log10(np.maximum(blocks, 1e-6))


# --- Spectrum, stereo and onsets ---------------------------------------------


def band_shares(x: np.ndarray) -> tuple[dict[str, float], float, float]:
    """Each band's share of the energy (percent), the spectral centroid and the 85% roll-off (Hz)."""
    mono = x.mean(axis=1).astype(np.float64)
    nper = min(8192, max(256, 2 ** int(np.log2(max(len(mono), 256)))))
    if len(mono) < nper:
        mono = np.pad(mono, (0, nper - len(mono)))
    f, p = welch(mono, SR, nperseg=nper)
    keep = (f >= 20) & (f <= 20000)
    f, p = f[keep], p[keep]
    total = float(p.sum()) or 1e-20
    shares = {k: round(100 * float(p[(f >= lo) & (f < hi)].sum()) / total, 2) for k, (lo, hi) in BANDS.items()}
    centroid = float((f * p).sum() / total)
    rolloff = float(f[np.searchsorted(np.cumsum(p), 0.85 * total)])
    return shares, centroid, rolloff


def stereo(x: np.ndarray, below: float = 120.0) -> dict[str, float]:
    """Width (side energy as a share of the total), L/R correlation, and the same for the lows under `below` Hz.

    A mix's energy is mostly its (mono) bass, so `width` stays low even when the pads
    and hats are wide; `width_hi` is the same share above 300 Hz, where stereo is heard.

    The lows are measured in the spectrum (Welch, bins of 3 to 5 Hz), so a pad's
    fundamental just above `below` does not leak in and read as wide lows. They
    count as mono when the side signal there is 20 dB under the mid, the two
    channels correlate above 0.97, or there are hardly any lows at all.
    mono_loss_db is how much quieter the sound gets folded down to mono (a
    classroom projector's single speaker): about 0 for a mono-safe mix, 3 dB for
    unrelated channels, more where the channels cancel.
    """
    y = x.astype(np.float64)
    l, r = y[:, 0], y[:, 1]
    mid, side = (l + r) / 2, (l - r) / 2
    em, es = float(np.sum(mid**2)), float(np.sum(side**2))
    corr = float(np.sum(l * r) / np.sqrt(np.sum(l * l) * np.sum(r * r) + 1e-20))
    nper = min(16384, max(256, 2 ** int(np.log2(max(len(y), 256)))))
    if len(y) < nper:
        y = np.pad(y, ((0, nper - len(y)), (0, 0)))
        l, r = y[:, 0], y[:, 1]
        mid, side = (l + r) / 2, (l - r) / 2
    f, pm = welch(mid, SR, nperseg=nper)
    _, ps = welch(side, SR, nperseg=nper)
    _, pl = welch(l, SR, nperseg=nper)
    _, pr = welch(r, SR, nperseg=nper)
    _, plr = csd(l, r, SR, nperseg=nper)
    low = (f >= 20) & (f < below)
    audible = f >= 20
    upper = f >= 300
    lm, ls = float(pm[low].sum()), float(ps[low].sum())
    low_share = 100 * (lm + ls) / (float(pm[audible].sum() + ps[audible].sum()) + 1e-20)
    low_corr = float(np.real(plr[low].sum()) / np.sqrt(pl[low].sum() * pr[low].sum() + 1e-30))
    low_side_db = 10 * np.log10((ls + 1e-20) / (lm + 1e-20))
    folded = np.repeat(((x[:, 0] + x[:, 1]) / 2)[:, None], 2, axis=1)
    mono_loss = k_energy_ratio_db(x, folded) if em + es > 0 else 0.0
    return {
        "width": round(100 * es / (em + es + 1e-20), 1),
        "width_hi": round(100 * float(ps[upper].sum()) / (float(pm[upper].sum() + ps[upper].sum()) + 1e-20), 1),
        "correlation": round(corr, 3),
        "mono_loss_db": round(float(mono_loss), 1),
        "low_share": round(low_share, 2),
        "low_correlation": round(low_corr, 3),
        "low_side_db": round(float(low_side_db), 1),
        "lows_mono": bool(low_side_db < -20 or low_corr > 0.97 or low_share < 0.5),
    }


def onset_times(x: np.ndarray) -> np.ndarray:
    """Onsets (seconds) from the spectral flux: the moments new sound starts."""
    mono = x.mean(axis=1).astype(np.float64)
    nfft, hop = 1024, 441
    if len(mono) < nfft:
        mono = np.pad(mono, (0, nfft - len(mono)))
    frames = 1 + (len(mono) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(mono[idx] * np.hanning(nfft), axis=1))
    logs = np.log1p(1000 * spec / (spec.max() + 1e-12))
    flux = np.concatenate([[0.0], np.maximum(0, np.diff(logs, axis=0)).sum(axis=1)])
    flux /= flux.max() + 1e-12
    threshold = median_filter(flux, size=31, mode="nearest") + 0.06
    peaks = []
    last = -10
    for i in range(1, len(flux) - 1):
        lo, hi = max(0, i - 3), min(len(flux), i + 4)
        if flux[i] > threshold[i] and flux[i] == flux[lo:hi].max() and i - last >= 5:
            peaks.append(i)
            last = i
    return np.array(peaks) * hop / SR


def k_energy_ratio_db(x: np.ndarray, y: np.ndarray) -> float:
    """How much quieter y is than x (dB, never negative), from their K-weighted energy (BS.1770's weighting, without its gate).

    Ungated, so it never goes the wrong way on a short effect, where the loudness gate
    can drop different blocks from the two measurements.
    """
    ex = float(np.sum(_k_weighted(x) ** 2))
    ey = float(np.sum(_k_weighted(y) ** 2))
    return max(0.0, 10 * np.log10((ex + 1e-20) / (ey + 1e-20)))


def small_speaker_loss(x: np.ndarray) -> float:
    """How much quieter (dB) the sound gets on a laptop or Chromebook speaker, which plays little under 200 Hz.

    Measured as the K-weighted energy lost through a steep 200 Hz highpass. A mix whose
    weight is all sub-bass loses a lot and sounds thin in a classroom.
    """
    sos = butter(4, 200, btype="highpass", fs=SR, output="sos")
    return k_energy_ratio_db(x, sosfiltfilt(sos, x.astype(np.float64), axis=0))


def seam(x: np.ndarray, start: int, end: int) -> dict:
    """How well the loop joins, three ways.

    seam_db: the waveform after the loop's end against the waveform after its start
    (build.py's measure). Below about -40 dB the two are the same music. Through an
    MP3 it is only that low when the loop is a whole number of MP3 granules (576
    samples), because otherwise the encoder quantises the two stretches differently;
    the difference is then codec noise, not a click.
    seam_spectrum_db: the average difference of the two stretches' third-octave band
    levels. Codec noise leaves this near 0; a real mismatch (wrong loop points) does not.
    splice_jump_db: the step at the join when the player jumps, against the music's own
    sample-to-sample movement there. Near 0 dB is seamless; a click shows as +10 dB or more.
    """
    n = min(int(0.25 * SR), len(x) - end, end - start)
    a = x[start : start + n].mean(axis=1).astype(np.float64)
    b = x[end : end + n].mean(axis=1).astype(np.float64)
    win = np.hanning(n)
    pa, pb = np.abs(np.fft.rfft(a * win)) ** 2, np.abs(np.fft.rfft(b * win)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    edges = 50 * 2 ** (np.arange(0, 28) / 3)
    la, lb = [], []
    for lo, hi in zip(edges, edges[1:]):
        sel = (f >= lo) & (f < hi)
        if sel.any():
            la.append(10 * np.log10(pa[sel].sum() + 1e-20))
            lb.append(10 * np.log10(pb[sel].sum() + 1e-20))
    la, lb = np.array(la), np.array(lb)
    loud = la > la.max() - 50
    w = int(0.01 * SR)
    mono = x.mean(axis=1).astype(np.float64)
    played = np.concatenate([mono[end - w : end], mono[start : start + w]])
    cont = mono[end - w : end + w]
    step = abs(played[w] - played[w - 1])
    typical = np.sqrt(np.mean(np.diff(cont) ** 2)) + 1e-12
    return {
        "seam_db": round(dsp.seam_error_db(x, start, end), 1),
        "seam_spectrum_db": round(float(np.mean(np.abs(la - lb)[loud])), 2),
        "splice_jump_db": round(20 * np.log10(max(step, 1e-12) / typical), 1),
        "loop_granule_aligned": (end - start) % 576 == 0,
    }


# --- Everything about one sound ------------------------------------------------


def measure(x: np.ndarray, loop: tuple[float, float] | None = None, music: bool = True) -> dict:
    """Every number analyze.py reports. For a loop, levels and spectrum are measured over one repeat."""
    region = x
    out: dict = {"seconds": round(len(x) / SR, 3)}
    if loop:
        a, b = int(round(loop[0] * SR)), int(round(loop[1] * SR))
        region = x[a:b]
        out["loop_seconds"] = round((b - a) / SR, 3)
        out.update(seam(x, a, b))
    out["lufs"] = round(dsp.lufs(region), 1)
    out["true_peak"] = round(dsp.true_peak_db(x), 1)
    peak = float(np.max(np.abs(region))) + 1e-12
    rms = float(np.sqrt(np.mean(region.astype(np.float64) ** 2))) + 1e-12
    out["crest_db"] = round(20 * np.log10(peak / rms), 1)
    out["plr_db"] = round(out["true_peak"] - out["lufs"], 1)
    if music and len(region) > 3 * SR:
        out["lra_lu"] = round(loudness_range(region, circular=bool(loop)), 1)
        st = short_term(region, circular=bool(loop))
        out["short_term_max"] = round(float(st.max()), 1)
    out["small_speaker_db"] = round(small_speaker_loss(region), 1)
    shares, centroid, rolloff = band_shares(region)
    out["bands"] = shares
    out["centroid_hz"] = round(centroid)
    out["rolloff_hz"] = round(rolloff)
    out.update(stereo(region))
    onsets = onset_times(region)
    out["onsets_per_s"] = round(len(onsets) / max(len(region) / SR, 1e-3), 2)
    if not music:
        env = envelope_db(x, 1.0)
        top = env.max()
        above = np.nonzero(env > top - 40)[0]
        out["start_ms"] = int(above[0]) if len(above) else 0
        out["attack_ms"] = int(np.argmax(env) - (above[0] if len(above) else 0))
        alive = np.nonzero(env > top - 60)[0]
        out["tail_ms"] = int(alive[-1] - np.argmax(env)) if len(alive) else 0
    return out


def flags(m: dict, music: bool = True) -> list[str]:
    """Plain-language warnings from the numbers. The thresholds are rules of thumb for a finished pop mix."""
    out = []
    b = m["bands"]
    if music:
        if b["sub"] + b["low"] < 35:
            out.append(f"thin low end (sub+low {b['sub'] + b['low']:.0f}%)")
        if b["sub"] < 3:
            out.append(f"little sub ({b['sub']:.1f}%)")
        if b["low-mid"] > 28:
            out.append(f"muddy low-mids ({b['low-mid']:.0f}%)")
        if b["presence"] > 9:
            out.append(f"harsh presence ({b['presence']:.1f}%)")
        if b["air"] > 7:
            out.append(f"bright air ({b['air']:.1f}%)")
        if b["air"] < 0.8:
            out.append(f"dull top ({b['air']:.2f}% air)")
        if m["width"] < 4:
            out.append(f"near mono (width {m['width']}%)")
        if m.get("loop_seconds", 99) < 30:
            out.append(f"short loop ({m['loop_seconds']:.0f} s)")
        if m.get("seam_spectrum_db", 0) > 1.5 or m.get("splice_jump_db", -99) > 10:
            out.append(f"audible loop seam (spectrum {m['seam_spectrum_db']} dB, jump {m['splice_jump_db']} dB)")
        elif m.get("seam_db", -999) > -40:
            out.append(f"loop not bit-exact through the MP3 (codec noise at {m['seam_db']} dB: the loop is not a whole number of 576-sample MP3 granules)")
        if m.get("lra_lu", 99) < 2.0:
            out.append(f"flat dynamics (LRA {m['lra_lu']} LU)")
    else:
        if b["presence"] + b["air"] > 55:
            out.append(f"harsh ({b['presence'] + b['air']:.0f}% above 3 kHz)")
        if m.get("start_ms", 0) > 15:
            out.append(f"slow to start ({m['start_ms']} ms)")
    if m["small_speaker_db"] > (4 if music else 6):
        out.append(f"weak on laptop speakers (loses {m['small_speaker_db']} dB under 200 Hz)")
    if m["correlation"] < 0.3:
        out.append(f"phasey stereo (correlation {m['correlation']})")
    if m["mono_loss_db"] > 3:
        out.append(f"cancels in mono ({m['mono_loss_db']} dB quieter on one speaker)")
    if not m["lows_mono"] and m["low_side_db"] > -14 and m["low_share"] > 5:
        out.append(f"wide lows (side {m['low_side_db']} dB below 120 Hz)")
    if m["true_peak"] > -1.0:
        out.append(f"true peak over -1 dBTP ({m['true_peak']})")
    return out


# --- Pictures ----------------------------------------------------------------

# A 3x5 pixel font: each glyph is five rows of three bits.
_FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
    "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001010010",
    "8": "111101111101111", "9": "111101111001111", "A": "010101111101101", "B": "110101110101110",
    "C": "011100100100011", "D": "110101101101110", "E": "111100110100111", "F": "111100110100100",
    "G": "011100101101011", "H": "101101111101101", "I": "111010010010111", "J": "001001001101010",
    "K": "101101110101101", "L": "100100100100111", "M": "101111111101101", "N": "110101101101101",
    "O": "010101101101010", "P": "110101110100100", "Q": "010101101110011", "R": "110101110101101",
    "S": "011100010001110", "T": "111010010010010", "U": "101101101101111", "V": "101101101101010",
    "W": "101101111111101", "X": "101101010101101", "Y": "101101010010010", "Z": "111001010100111",
    " ": "000000000000000", ".": "000000000000010", "-": "000000111000000", ":": "000010000010000",
    "/": "001001010100100", "%": "101001010100101", "+": "000010111010000", "(": "010100100100010",
    ")": "010001001001010", ",": "000000000010100", "=": "000111000111000", "_": "000000000000111",
    "|": "010010010010010", "<": "001010100010001", ">": "100010001010100",
}


def _text(img: np.ndarray, x: int, y: int, s: str, color=(230, 230, 230), scale: int = 2) -> None:
    for ch in s.upper():
        g = _FONT.get(ch, _FONT[" "])
        for r in range(5):
            for c in range(3):
                if g[r * 3 + c] == "1":
                    y0, x0 = y + r * scale, x + c * scale
                    if 0 <= y0 < img.shape[0] - scale and 0 <= x0 < img.shape[1] - scale:
                        img[y0 : y0 + scale, x0 : x0 + scale] = color
        x += 4 * scale


def write_png(path: Path, img: np.ndarray) -> None:
    """An RGB uint8 array (height, width, 3) as a PNG."""
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


_MAGMA = np.array([[0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191]], dtype=np.float64)


def _colour(v: np.ndarray) -> np.ndarray:
    v = np.clip(v, 0, 1) * (len(_MAGMA) - 1)
    i = np.minimum(v.astype(int), len(_MAGMA) - 2)
    f = (v - i)[..., None]
    return (_MAGMA[i] * (1 - f) + _MAGMA[i + 1] * f).astype(np.uint8)


def spectrogram(x: np.ndarray, title: str = "", subtitle: str = "", width: int = 1100, height: int = 300, marks: list[float] | None = None, ticks: list[tuple[float, str]] | None = None, floor_db: float = 90.0, small: bool = False) -> np.ndarray:
    """A log-frequency spectrogram (30 Hz to 20 kHz) with a level strip on top, as an RGB image.

    `marks` are times (s) drawn as white lines (loop points); `ticks` are (time, label) along the bottom.
    """
    mono = x.mean(axis=1).astype(np.float64)
    seconds = len(mono) / SR
    nfft = 4096 if seconds > 3 else 2048 if seconds > 1 else 1024
    hop = max(1, len(mono) // width)
    pad = np.pad(mono, (nfft // 2, nfft // 2 + hop * width))
    idx = np.arange(nfft)[None, :] + hop * np.arange(width)[:, None]
    power = np.abs(np.fft.rfft(pad[idx] * np.hanning(nfft), axis=1)) ** 2
    df = SR / nfft
    edges = np.geomspace(20000, 30, height + 1)
    lo = np.minimum((edges[1:] / df).astype(int), power.shape[1] - 1)
    hi = np.maximum(lo + 1, np.ceil(edges[:-1] / df).astype(int))
    cs = np.concatenate([np.zeros((width, 1)), np.cumsum(power, axis=1)], axis=1)
    rows = (cs[:, np.minimum(hi, power.shape[1])] - cs[:, lo]) / (np.minimum(hi, power.shape[1]) - lo)
    db = 10 * np.log10(np.maximum(rows, 1e-20))
    db -= db.max()
    spec = _colour(1 + db.T / floor_db)
    left, top_text, strip, bottom = (0, 0, 0, 0) if small else (46, 34, 36, 16)
    if small:
        top_text = 12
    img = np.full((top_text + strip + height + bottom, left + width, 3), 18, dtype=np.uint8)
    y0 = top_text + strip
    img[y0 : y0 + height, left : left + width] = spec
    # Frequency grid.
    for f, label in ((50, "50"), (100, "100"), (200, "200"), (500, "500"), (1000, "1K"), (2000, "2K"), (5000, "5K"), (10000, "10K")):
        r = int(round(np.log(20000 / f) / np.log(20000 / 30) * height))
        img[y0 + r, left : left + width] = (img[y0 + r, left : left + width] * 0.6 + 40).astype(np.uint8)
        if not small:
            _text(img, 2, y0 + r - 5, label, (170, 170, 170))
    # Level strip: peak (light) and RMS (dark) per column, -60 to 0 dBFS.
    if strip:
        frames = mono[: hop * width].reshape(width, hop) if hop * width <= len(mono) else np.pad(mono, (0, hop * width - len(mono))).reshape(width, hop)
        pk = 20 * np.log10(np.maximum(np.abs(frames).max(axis=1), 1e-6))
        rm = 20 * np.log10(np.maximum(np.sqrt((frames**2).mean(axis=1)), 1e-6))
        for c in range(width):
            for val, col in ((pk[c], (120, 150, 200)), (rm[c], (60, 90, 150))):
                hgt = int(np.clip((val + 60) / 60, 0, 1) * (strip - 4))
                img[top_text + strip - 2 - hgt : top_text + strip - 2, left + c] = col
        for dbl in (-6, -20, -40):
            r = top_text + strip - 2 - int((dbl + 60) / 60 * (strip - 4))
            img[r, left : left + width : 3] = (90, 90, 90)
    for t in marks or []:
        c = int(round(t / seconds * width))
        if 0 <= c < width:
            img[top_text : y0 + height, left + c] = (255, 255, 255)
    for t, label in ticks or []:
        c = int(round(t / seconds * width))
        if 0 <= c < width:
            img[y0 + height : y0 + height + 4, left + c] = (200, 200, 200)
            img[y0 : y0 + height : 4, left + c] = (img[y0 : y0 + height : 4, left + c] * 0.5 + 60).astype(np.uint8)
            if not small:
                _text(img, left + c + 2, y0 + height + 4, label, (170, 170, 170))
    if small:
        _text(img, 2, 2, title, (235, 235, 235), scale=2 if len(title) * 8 < width else 1)
    else:
        _text(img, 4, 4, title, (240, 240, 240))
        _text(img, 4, 18, subtitle, (170, 170, 170))
    return img


def sheet(images: list[np.ndarray], columns: int, gap: int = 4) -> np.ndarray:
    """Pictures of one size in a grid."""
    h, w, _ = images[0].shape
    rows = -(-len(images) // columns)
    out = np.full((rows * (h + gap) + gap, columns * (w + gap) + gap, 3), 40, dtype=np.uint8)
    for k, im in enumerate(images):
        r, c = divmod(k, columns)
        out[gap + r * (h + gap) : gap + r * (h + gap) + h, gap + c * (w + gap) : gap + c * (w + gap) + w] = im
    return out
