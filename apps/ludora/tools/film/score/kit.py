"""The synthesiser both film scores are played on: oscillators, filters, a drum kit, plucks, pads, a hall.
Every sound is made from arithmetic with numpy. A score sets SCORE_SECONDS before importing this, so the
buffers are the length of its picture (the first film's 68 seconds if it says nothing)."""
import os
import sys, wave
import numpy as np

SR = 44100
BEAT = 0.5
BAR = 2.0
DUR = float(os.environ.get('SCORE_SECONDS', '68.0'))
N = int((DUR + 2.0) * SR)
rng = np.random.default_rng(int(os.environ.get('SCORE_SEED', '20261112')))


def at(bar, beat=0.0):
    """Seconds at a bar (from 1) and a beat within it (from 0)."""
    return (bar - 1) * BAR + beat * BEAT


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ oscillators and shapes

def saw(freq, n, phase=0.0):
    """A sawtooth with its corners rounded just enough not to alias (polyBLEP)."""
    f = np.full(n, float(freq)) if np.ndim(freq) == 0 else np.asarray(freq, dtype=np.float64)[:n]
    dt = f / SR
    ph = (phase + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    t = ph[m] / dt[m]
    y[m] -= t + t - t * t - 1
    m = ph > 1 - dt
    t = (ph[m] - 1) / dt[m]
    y[m] -= t * t + t + t + 1
    return y


def pulse(freq, n, width=0.5):
    return saw(freq, n) - saw(freq, n, phase=width)


def sine(freq, n, phase=0.0):
    f = np.full(n, float(freq)) if np.ndim(freq) == 0 else np.asarray(freq, dtype=np.float64)[:n]
    return np.sin(phase + 2 * np.pi * np.cumsum(f) / SR)


def noise(n):
    return rng.standard_normal(n)


def env(n, attack=0.005, release=0.05, hold=None):
    """Up fast, held, then down: a plain gate with soft edges."""
    e = np.ones(n)
    a = min(n, max(1, int(attack * SR)))
    e[:a] = np.linspace(0, 1, a)
    r = min(n, max(1, int(release * SR)))
    e[-r:] *= np.linspace(1, 0, r)
    return e


def decay(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def filt(x, gain):
    """Filter by multiplying the spectrum: exact, and quick for whole notes and whole stems."""
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    g = gain(f)
    return np.fft.irfft(X * (g[:, None] if x.ndim == 2 else g), n=x.shape[0], axis=0)


def lp(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def hp(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def bp(lo, hi, order=2):
    return lambda f: hp(lo, order)(f) * lp(hi, order)(f)


def low_shelf(fc, db):
    g = 10 ** (db / 20)
    return lambda f: 1 + (g - 1) / (1 + (f / fc) ** 2)


def shelf(fc, db):
    g = 10 ** (db / 20)
    return lambda f: 1 + (g - 1) / (1 + (fc / np.maximum(f, 1e-3)) ** 2)


class Stem:
    """One group of sounds, mixed to stereo, that can be treated as a whole."""

    def __init__(self):
        self.buf = np.zeros((N, 2))

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= N or i < 0:
            return
        n = min(len(sig), N - i)
        if sig.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            self.buf[i:i + n, 0] += sig[:n] * gain * l * 1.414
            self.buf[i:i + n, 1] += sig[:n] * gain * r * 1.414
        else:
            self.buf[i:i + n] += sig[:n] * gain


# ------------------------------------------------------------------ the instruments

def kick(power=1.0, long=False):
    n = int((0.42 if long else 0.3) * SR)
    t = np.arange(n) / SR
    f = 54 + 120 * np.exp(-t / 0.026) + 60 * np.exp(-t / 0.006)
    body = sine(f, n) * np.exp(-t / (0.14 if long else 0.085))
    click = filt(noise(n) * np.exp(-t / 0.003), hp(2500)) * 0.25
    return np.tanh((body + click) * 1.6 * power) * env(n, 0.0005, 0.03)


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    burst = sum(np.where(t >= d, np.exp(-(t - d) / 0.008), 0) for d in (0.0, 0.011, 0.023)) * 0.6 + np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.07), 0)
    return filt(noise(n) * burst, bp(900, 5200)) * 1.5


def snare(power=1.0):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    tone = sine(185 + 60 * np.exp(-t / 0.02), n) * np.exp(-t / 0.07) * 0.7
    rattle = filt(noise(n) * np.exp(-t / 0.09), hp(1800)) * 0.9
    return np.tanh((tone + rattle) * power)


def hat(open_=False, bright=1.0):
    n = int((0.26 if open_ else 0.055) * SR)
    t = np.arange(n) / SR
    return filt(noise(n) * np.exp(-t / (0.09 if open_ else 0.016)), hp(7200 * bright, 3)) * 0.8


def crash(seconds=2.2):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    body = filt(noise(n), hp(3800, 2)) * np.exp(-t / (seconds * 0.3))
    return np.stack([body, np.roll(body, 37)], axis=1) * 0.55


def tom(m):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    return sine(hz(m) * (1 + 0.5 * np.exp(-t / 0.03)), n) * np.exp(-t / 0.11) * env(n, 0.001, 0.05)


def boom(seconds=2.4):
    """The low hit under the big moments."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    sub = sine(42 + 44 * np.exp(-t / 0.09), n) * np.exp(-t / 0.42) * 0.7
    thud = filt(noise(n) * np.exp(-t / 0.12), lp(240, 2)) * 1.3
    air = filt(noise(n) * np.exp(-t / 0.5), bp(1500, 9000)) * 0.12
    return np.tanh((sub + thud) * 1.4) + air


def riser(seconds, top=9000.0):
    """Noise that opens upward and gets louder: the breath before a hit."""
    n = int(seconds * SR)
    x = noise(n)
    out = np.zeros(n)
    u = np.linspace(0, 1, n)
    bands = [300, 600, 1200, 2400, 4800, top]
    for k, fc in enumerate(bands):
        pos = k / (len(bands) - 1)
        w = np.clip(1 - np.abs(u ** 1.3 - pos) * (len(bands) - 1), 0, 1)
        out += filt(x, bp(fc * 0.6, fc * 1.5)) * w
    tone = saw(hz(50) * 2 ** (u * 2), n) * 0.12
    return (out * 0.5 + filt(tone, lp(3000))) * u ** 2.2


def whoosh(seconds=0.5, centre=2400.0):
    n = int(seconds * SR)
    u = np.linspace(0, 1, n)
    shape = np.sin(u * np.pi) ** 2
    lo = filt(noise(n), bp(centre * 0.4, centre)) * (1 - u)
    hi = filt(noise(n), bp(centre, centre * 3)) * u
    mono = (lo + hi) * shape
    return np.stack([mono * (1 - u * 0.7), mono * (0.3 + u * 0.7)], axis=1)


def supersaw(m, seconds, voices=7, spread=0.14, bright=5200.0, attack=0.01, release=0.12):
    """Seven saws a little out of tune with each other, spread left to right."""
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    for v in range(voices):
        d = (v - (voices - 1) / 2) / ((voices - 1) / 2) if voices > 1 else 0
        s = saw(hz(m + d * spread), n, phase=rng.random())
        pan = d * 0.8
        out[:, 0] += s * (1 - pan) * 0.5
        out[:, 1] += s * (1 + pan) * 0.5
    out = filt(out, lp(bright, 1)) / np.sqrt(voices)
    return out * env(n, attack, release)[:, None]


def pluck(m, seconds=0.4, bright=1.0):
    """A short bright note that closes up as it rings: two filtered copies, crossfaded."""
    n = int(seconds * SR)
    raw = saw(hz(m), n) * 0.6 + pulse(hz(m) * 1.003, n, 0.3) * 0.35
    open_ = filt(raw, lp(5200 * bright))
    shut = filt(raw, lp(650))
    e = decay(n, 0.07)
    return (open_ * e + shut * (1 - e)) * decay(n, seconds * 0.38) * env(n, 0.002, 0.03)


def bell(m, seconds=1.6):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = hz(m)
    y = sine(f, n) * np.exp(-t / 0.55) + 0.45 * sine(f * 2.76, n) * np.exp(-t / 0.22) + 0.25 * sine(f * 5.4, n) * np.exp(-t / 0.09) + 0.3 * sine(f * 2, n) * np.exp(-t / 0.4)
    return y * env(n, 0.002, 0.2) * 0.5


def lead(m, seconds, glide_from=None):
    """The tune's voice: a saw and a pulse with a little vibrato once the note has settled."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = np.full(n, hz(m))
    if glide_from is not None:
        g = np.exp(-t / 0.03)
        f = hz(m) * (hz(glide_from) / hz(m)) ** g
    f = f * (1 + 0.006 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.12) / 0.15, 0, 1))
    y = saw(f, n) * 0.55 + pulse(f * 0.5, n, 0.42) * 0.3 + saw(f * 1.006, n) * 0.3
    y = filt(y, lp(6200, 1))
    return y * env(n, 0.006, 0.07)


def bass(m, seconds):
    n = int(seconds * SR)
    # Played an octave above the chord's root, with the root itself as a quiet sine underneath.
    y = saw(hz(m + 12), n) * 0.55 + pulse(hz(m + 12), n, 0.5) * 0.3 + sine(hz(m), n) * 0.42
    open_ = filt(y, lp(2200))
    shut = filt(y, lp(420))
    e = decay(n, 0.09)
    return np.tanh((open_ * e + shut * (1 - e)) * 1.5) * env(n, 0.003, 0.03)


def pad(notes, seconds):
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    for m in notes:
        out += supersaw(m, seconds, voices=5, spread=0.1, bright=1500, attack=min(0.6, seconds * 0.3), release=min(0.8, seconds * 0.3)) * 0.5
    return out



def room(x, seconds=2.2, wet=0.25, bright=6500.0, pre=0.018):
    """A hall, made from decaying noise, added to the dry sound."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.stack([noise(n), noise(n)], axis=1) * np.exp(-t / (seconds * 0.22))[:, None]
    ir = filt(ir, lambda f: lp(bright, 1)(f) * hp(250, 1)(f))
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(axis=0)).max()
    size = 1 << int(np.ceil(np.log2(N + n)))
    y = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(ir, size, axis=0), size, axis=0)[:N]
    return x + y * wet


