"""Tiny numpy synthesizer for the films' effects and music.

Everything here returns mono float arrays at SR unless it says stereo. It is
deliberately small: oscillators, noise, filters, envelopes, a cheap reverb and a
step sequencer are enough for hold music, whooshes, alarms and ringtones.
"""
import numpy as np
from scipy import signal

SR = 44100


def n_(dur):
    return max(1, int(round(dur * SR)))


def t_(dur):
    return np.arange(n_(dur)) / SR


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def glide(f0, f1, dur, curve=1.0):
    """Frequency ramp from f0 to f1 (exponential in pitch); curve bends the timing."""
    x = np.linspace(0, 1, n_(dur)) ** curve
    return f0 * (f1 / f0) ** x


def osc(freq, dur=None, wave="sine", phase=0.0):
    """Oscillator. freq is a number (needs dur) or a per-sample array."""
    if np.isscalar(freq):
        freq = np.full(n_(dur), float(freq))
    ph = phase + 2 * np.pi * np.cumsum(freq) / SR
    if wave == "sine":
        return np.sin(ph)
    if wave == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if wave == "square":
        return np.tanh(6 * np.sin(ph))
    if wave == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    raise ValueError(wave)


def noise(dur, seed=0):
    return np.random.default_rng(seed).uniform(-1, 1, n_(dur))


def _sos(kind, f, order):
    f = np.clip(np.atleast_1d(f).astype(float), 20, SR / 2 - 200)
    return signal.butter(order, f if len(f) > 1 else f[0], kind, fs=SR, output="sos")


def lp(x, f, order=2):
    return signal.sosfilt(_sos("low", f, order), x)


def hp(x, f, order=2):
    return signal.sosfilt(_sos("high", f, order), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("band", [lo, hi], order), x)


def sweep_bp(x, f0, f1, q=4.0, blocks=64):
    """Band-pass whose centre moves from f0 to f1 (block-wise, crossfaded)."""
    out = np.zeros_like(x)
    edges = np.linspace(0, len(x), blocks + 1).astype(int)
    fs = f0 * (f1 / f0) ** np.linspace(0, 1, blocks)
    zi = None
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        if b <= a:
            continue
        lo, hi = fs[i] / (1 + 0.5 / q), fs[i] * (1 + 0.5 / q)
        sos = _sos("band", [lo, hi], 1)
        if zi is None or zi.shape != (sos.shape[0], 2):
            zi = np.zeros((sos.shape[0], 2))
        out[a:b], zi = signal.sosfilt(sos, x[a:b], zi=zi)
    return out


def adsr(dur, a=0.005, d=0.05, s=0.7, r=0.05):
    n = n_(dur)
    e = np.full(n, s)
    na, nd, nr = min(n, n_(a)), min(n, n_(d)), min(n, n_(r))
    e[:na] = np.linspace(0, 1, na)
    e[na : na + nd] = np.linspace(1, s, max(1, min(nd, n - na)))[: max(0, n - na)][:nd]
    e[n - nr :] *= np.linspace(1, 0, nr)
    return e


def decay(dur, tau):
    return np.exp(-t_(dur) / tau)


def fade(x, a=0.005, r=0.02):
    x = np.array(x, dtype=float)
    na, nr = min(len(x) // 2, n_(a)), min(len(x) // 2, n_(r))
    if x.ndim == 1:
        x[:na] *= np.linspace(0, 1, na)
        x[len(x) - nr :] *= np.linspace(1, 0, nr)
    else:
        x[:na] *= np.linspace(0, 1, na)[:, None]
        x[len(x) - nr :] *= np.linspace(1, 0, nr)[:, None]
    return x


def swell(dur, peak=0.5, power=2.0):
    """0 -> 1 -> 0 envelope peaking at `peak` (fraction of dur)."""
    x = np.linspace(0, 1, n_(dur))
    up = np.clip(x / max(peak, 1e-6), 0, 1) ** power
    down = np.clip((1 - x) / max(1 - peak, 1e-6), 0, 1) ** power
    return np.minimum(up, down)


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) if len(x) else 0
    return x if m < 1e-9 else x * (peak / m)


def reverb(x, secs=1.2, mix=0.25, seed=7, bright=5000, pre=0.012):
    """Convolve with decaying filtered noise. Returns mono, tail included."""
    ir = noise(secs, seed) * np.exp(-t_(secs) / (secs / 5.5))
    ir = lp(ir, bright)
    ir = np.concatenate([np.zeros(n_(pre)), ir])
    wet = signal.fftconvolve(x, ir)
    wet = wet / (np.sqrt(np.sum(ir**2)) + 1e-9)
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry * (1 - mix * 0.4) + wet * mix


def stereo(x, pan=0.0):
    """Mono -> stereo, equal power. pan -1 (left) .. 1 (right)."""
    if x.ndim == 2:
        return x
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def wide(x, seed=3, amount=0.35):
    """Mono -> decorrelated stereo, for pads and ambience."""
    d = n_(0.011)
    left = x
    right = np.concatenate([np.zeros(d), x[:-d]]) if len(x) > d else x
    side = hp(noise(len(x) / SR, seed), 300) * 0
    return np.stack([left + side, left * (1 - amount) + right * amount], axis=1)


def layer(parts, dur=None):
    """Sum [(offset_seconds, mono_array), ...] into one mono array."""
    end = max(n_(o) + len(a) for o, a in parts)
    if dur is not None:
        end = max(end, n_(dur))
    out = np.zeros(end)
    for o, a in parts:
        i = n_(o) if o > 0 else 0
        out[i : i + len(a)] += a
    return out


# ------------------------------------------------------------------ instruments


def bell(freq, dur=1.2, bright=1.0):
    t = t_(dur)
    return (
        np.sin(2 * np.pi * freq * t) * np.exp(-t / (dur / 4))
        + 0.4 * bright * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / (dur / 9))
        + 0.2 * bright * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / (dur / 16))
    ) * 0.6


def epiano(freq, dur):
    t = t_(dur)
    mod = np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.12) * 1.2
    body = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / max(0.25, dur * 0.7))
    return fade(body * 0.5, 0.004, 0.03)


def bass(freq, dur):
    t = t_(dur)
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
    return fade(lp(x, 500) * np.exp(-t / max(0.2, dur)), 0.005, 0.03) * 0.7


def pluck(freq, dur=0.5):
    t = t_(dur)
    return fade(osc(freq, dur, "tri") * np.exp(-t / (dur / 5)), 0.002, 0.02) * 0.6


def marimba(freq, dur=0.45):
    t = t_(dur)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.16) + 0.3 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t / 0.03)
    return fade(x, 0.002, 0.02) * 0.6


def pad(freqs, dur, wave="saw", cutoff=1400, detune=0.004, attack=0.4, release=0.6):
    x = np.zeros(n_(dur))
    for i, f in enumerate(freqs):
        for k, d in enumerate((-detune, 0, detune)):
            x += osc(f * (1 + d), dur, wave, phase=i * 1.3 + k * 2.1)
    x = lp(x / (3 * len(freqs)), cutoff, 2)
    return x * adsr(dur, attack, 0.1, 1.0, release)


def choir(freqs, dur, vowel="ah", attack=0.5, release=0.8):
    """Saw stack through vowel formants: a passable 'aaah'."""
    formants = {"ah": [(800, 1.0), (1150, 0.5), (2900, 0.25)], "oo": [(350, 1.0), (640, 0.4), (2700, 0.1)]}[vowel]
    src = np.zeros(n_(dur))
    t = t_(dur)
    for i, f in enumerate(freqs):
        vib = 1 + 0.006 * np.sin(2 * np.pi * (4.6 + 0.3 * i) * t + i)
        for d in (-0.006, 0.0, 0.007):
            src += osc(f * (1 + d) * vib, wave="saw", phase=i * 0.7 + d * 300)
    out = np.zeros_like(src)
    for fc, g in formants:
        out += g * bp(src, fc * 0.85, fc * 1.15, 1)
    return norm(out) * adsr(dur, attack, 0.1, 1.0, release) * 0.6


def kick(dur=0.25, f0=120, f1=42):
    return osc(glide(f0, f1, dur, 0.5)) * decay(dur, dur / 4)


def boom(dur=2.0, f0=90, f1=28):
    x = osc(glide(f0, f1, dur, 0.4)) * decay(dur, dur / 3.2)
    x += 0.5 * lp(noise(dur, 5), 220) * decay(dur, dur / 6)
    return fade(np.tanh(x * 1.6), 0.002, 0.2)


def whoosh(dur=1.0, f0=300, f1=4000, seed=2, peak=0.6):
    return sweep_bp(noise(dur, seed), f0, f1, q=2.0) * swell(dur, peak, 2.0)


def click(dur=0.02, f=2500, seed=1):
    return hp(noise(dur, seed), f) * decay(dur, dur / 4)


def thud(dur=0.18, f=110, seed=1):
    x = osc(glide(f, f * 0.5, dur)) * decay(dur, dur / 3) + 0.4 * lp(noise(dur, seed), 400) * decay(dur, dur / 6)
    return fade(x, 0.001, 0.02)


def hiss(dur=0.8, lo=3000, seed=4, peak=0.1):
    return hp(noise(dur, seed), lo) * swell(dur, peak, 1.5)


def rustle(dur=0.5, seed=5, density=18):
    rng = np.random.default_rng(seed)
    x = hp(noise(dur, seed), 2500)
    env = np.zeros(n_(dur))
    for _ in range(int(density * dur)):
        i = rng.integers(0, len(env))
        ln = rng.integers(200, 1500)
        env[i : i + ln] += rng.uniform(0.3, 1.0)
    env = lp(env, 60, 1)
    return fade(x * np.clip(env, 0, 1.5), 0.01, 0.05) * 0.5


def whistle(dur=0.5, f=2900, wobble=38, depth=0.06, breath=0.25, seed=3):
    """Pea whistle. Lower `f`, add droop via the caller for a weak one."""
    t = t_(dur)
    fr = f * (1 + depth * np.sign(np.sin(2 * np.pi * wobble * t)))
    x = osc(fr) + 0.5 * osc(fr * 1.012) + breath * bp(noise(dur, seed), f * 0.7, f * 1.5)
    return fade(x * 0.4, 0.01, 0.04)


def squeak(dur=0.12, f0=1800, f1=2600):
    return fade(osc(glide(f0, f1, dur), wave="tri") * decay(dur, dur / 2), 0.004, 0.02) * 0.5


def buzz(dur=0.45, f=155):
    t = t_(dur)
    x = osc(f, dur, "square") * (0.6 + 0.4 * np.sin(2 * np.pi * 27 * t))
    return fade(lp(x, 700), 0.01, 0.03) * 0.5


def drone(dur, f=55, seed=9, rise=1.0):
    t = t_(dur)
    fr = f * rise ** (t / dur)
    x = osc(fr, wave="saw") + osc(fr * 1.059, wave="saw", phase=1.0) + 0.6 * osc(fr * 0.5)
    x = lp(x, 420) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.31 * t))
    return x / 3


def wind(dur, seed=11, f=600):
    t = t_(dur)
    x = bp(noise(dur, seed), f * 0.5, f * 1.6, 1)
    return x * (0.55 + 0.45 * np.sin(2 * np.pi * 0.17 * t + 1.0)) * 0.6


# ------------------------------------------------------------------ sequencing


def sequence(bpm, events, voices, bars=None, beats_per_bar=4):
    """events: [(beat, length_in_beats, voice_name, midi_note_or_None, velocity)]."""
    spb = 60.0 / bpm
    parts = []
    for beat, length, voice, note, vel in events:
        fn = voices[voice]
        a = fn(midi(note), length * spb) if note is not None else fn(length * spb)
        parts.append((beat * spb, a * vel))
    dur = None if bars is None else bars * beats_per_bar * spb
    out = layer(parts, dur)
    return out if dur is None else out[: n_(dur)]
