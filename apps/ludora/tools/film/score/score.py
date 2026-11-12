#!/usr/bin/env python3
"""The film's music and sound, written and played by this script: every sound is made from
arithmetic (no samples, no instruments from anywhere else). 120 beats a minute, in D major, cut to
the picture's bars. Writes one stereo WAV.

    python3 score.py [out.wav]
"""
import sys, wave
import numpy as np

SR = 44100
BEAT = 0.5
BAR = 2.0
DUR = 68.0
N = int((DUR + 2.0) * SR)
rng = np.random.default_rng(20261112)
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film/audio/score.wav'


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


# ------------------------------------------------------------------ the tune

# Bm, G, D, A: the lift that never quite lands, one chord a bar.
CHORDS = [
    {'root': 35, 'tones': [59, 62, 66]},  # B minor
    {'root': 31, 'tones': [55, 59, 62]},  # G
    {'root': 38, 'tones': [57, 62, 66]},  # D
    {'root': 33, 'tones': [57, 61, 64]},  # A
]
# The hook: four bars, (beat, length in beats, note).
HOOK = [
    [(0, .5, 78), (.5, .5, 78), (1, .5, 74), (1.5, 1, 71), (2.5, .5, 74), (3, 1, 78)],
    [(0, .75, 79), (.75, .75, 78), (1.5, 1, 74), (2.5, .5, 71), (3, 1, 74)],
    [(0, .5, 81), (.5, .5, 81), (1, .5, 78), (1.5, 1, 74), (2.5, .5, 78), (3, 1, 81)],
    [(0, .75, 83), (.75, .75, 81), (1.5, 1, 76), (2.5, .5, 73), (3, 1, 76)],
]

drums, low, chords, pads, plucks, tune, fx, hits = (Stem() for _ in range(8))
kicks = []  # times, for the pumping of everything else


def chord_of(bar):
    return CHORDS[(bar - 1) % 4]


def do_kick(t, power=1.0, long=False, gain=0.95):
    drums.add(kick(power, long), t, gain)
    kicks.append(t)


def four_floor(bar, hats=True, claps=True, sixteenths=False, gain=1.0):
    for b in range(4):
        do_kick(at(bar, b), gain=0.95 * gain)
        if claps and b in (1, 3):
            drums.add(clap(), at(bar, b), 0.5 * gain)
            drums.add(snare(0.8), at(bar, b), 0.22 * gain)
        if hats:
            drums.add(hat(), at(bar, b + 0.5), 0.34 * gain, pan=0.2)
    if hats:
        drums.add(hat(open_=True), at(bar, 3.5), 0.2 * gain, pan=-0.2)
    if sixteenths:
        for s in range(16):
            if s % 2:
                drums.add(hat(bright=1.25), at(bar, s * 0.25), (0.1 + 0.06 * (s % 4 == 3)) * gain, pan=0.5 if s % 4 == 1 else -0.5)


def half_time(bar, level=1.0, shaker=False):
    do_kick(at(bar, 0), gain=0.85 * level)
    do_kick(at(bar, 1.5), power=0.8, gain=0.7 * level)
    if bar % 2 == 0:
        do_kick(at(bar, 2.75), power=0.7, gain=0.55 * level)
    drums.add(snare(0.9), at(bar, 2), 0.38 * level)
    drums.add(clap(), at(bar, 2), 0.3 * level)
    for e in range(8):
        drums.add(hat(), at(bar, e * 0.5), (0.12 + 0.08 * (e % 2)) * level, pan=0.25)
    if shaker:
        for s in range(16):
            drums.add(hat(bright=1.4), at(bar, s * 0.25), 0.05 + 0.04 * (s % 4 == 2), pan=-0.4)


def roll(t0, t1, start_gain=0.15, end_gain=0.6):
    """A snare roll that tightens from eighths to thirty-seconds."""
    t = t0
    while t < t1 - 1e-6:
        u = (t - t0) / (t1 - t0)
        drums.add(snare(0.7 + 0.5 * u), t, start_gain + (end_gain - start_gain) * u ** 1.5)
        t += BEAT / (2 if u < 0.4 else 4 if u < 0.75 else 8)


def bass_bar(bar, pattern='eighths', gain=0.5):
    r = chord_of(bar)['root']
    if pattern == 'eighths':
        for e in range(8):
            m = r + 12 if e == 7 else r
            low.add(bass(m, BEAT * 0.5 * 0.92), at(bar, e * 0.5), gain * (1.0 if e % 2 == 0 else 0.85))
    else:  # long notes that follow the half-time kick
        low.add(bass(r, BEAT * 1.4), at(bar, 0), gain)
        low.add(bass(r, BEAT * 1.1), at(bar, 1.5), gain * 0.9)
        low.add(bass(r + 7, BEAT * 0.6), at(bar, 3), gain * 0.7)


def stabs(bar, gain=0.2, bright=1.0):
    """Three hits a bar, the 3-3-2 push."""
    c = chord_of(bar)
    for b in (0, 1.5, 3):
        for i, m in enumerate(c['tones'] + [c['tones'][0] + 12]):
            chords.add(pluck(m, 0.5, bright), at(bar, b), gain * (0.9 if i else 1.0), pan=(i - 1.5) * 0.35)


def wall(bar, gain=0.2, bars=1):
    """The big held chord of the loud sections."""
    c = chord_of(bar)
    for m in c['tones'] + [c['tones'][0] + 12, c['tones'][1] + 12]:
        chords.add(supersaw(m, BAR * bars - 0.02, bright=6500), at(bar), gain)


def arp(bar, gain=0.13, bright=0.8, sixteenths=True):
    c = chord_of(bar)
    t = c['tones']
    order = [t[0], t[2], t[0] + 12, t[1], t[2], t[0] + 12, t[1] + 12, t[2]]
    steps = 16 if sixteenths else 8
    for s in range(steps):
        m = order[s % len(order)]
        when = at(bar, s * (4 / steps))
        plucks.add(pluck(m, 0.32, bright), when, gain * (1.0 if s % 4 == 0 else 0.72), pan=0.6 if s % 2 else -0.6)
        plucks.add(pluck(m, 0.32, bright * 0.7), when + BEAT * 0.75, gain * 0.28, pan=-0.6 if s % 2 else 0.6)  # an echo, across


def hook(bar, phrase, gain=0.26, octave=0, voice='lead'):
    prev = None
    for beat, length, m in HOOK[phrase]:
        m += 12 * octave
        if voice == 'lead':
            tune.add(lead(m, length * BEAT * 0.95, glide_from=prev), at(bar, beat), gain)
            tune.add(lead(m, length * BEAT * 0.95), at(bar, beat) + BEAT * 0.75, gain * 0.2, pan=0.6)
        elif voice == 'pluck':
            tune.add(pluck(m, 0.45, 1.2), at(bar, beat), gain, pan=-0.1)
            tune.add(pluck(m, 0.45, 0.8), at(bar, beat) + BEAT * 0.75, gain * 0.3, pan=0.5)
        else:
            tune.add(bell(m, 1.4), at(bar, beat), gain, pan=0.15)
        prev = m


def big_hit(t, chord_bar, gain=1.0, crash_len=2.4):
    hits.add(boom(), t, 0.9 * gain)
    hits.add(crash(crash_len), t, 0.5 * gain)
    c = chord_of(chord_bar)
    for m in c['tones'] + [c['tones'][0] + 12, c['tones'][2] + 12]:
        hits.add(supersaw(m, 1.3, bright=7500, release=0.9), t, 0.2 * gain)
    low.add(bass(c['root'], 0.9), t, 0.5 * gain)


def reverse_into(t, seconds=1.2, gain=0.4):
    c = crash(seconds)[::-1].copy()
    fx.add(c * np.linspace(0, 1, len(c))[:, None] ** 1.5, t - seconds, gain)


# ---- bars 1 to 4: a dark stage, a tune far away ----
for bar in range(1, 5):
    level = 0.45 + 0.18 * (bar - 1)
    arp(bar, gain=0.1 * level + 0.03, bright=0.35 + 0.16 * bar)
    pads.add(pad(chord_of(bar)['tones'], BAR), at(bar), 0.2 + 0.05 * bar)
    if bar >= 3:
        for b in range(4):
            do_kick(at(bar, b), power=0.7, gain=0.4 + 0.12 * (bar - 3))
# One Glim's footsteps: four hops in, then the class.
for k, t in enumerate([0.7 + 0.4 * (k + 1) for k in range(4)]):
    fx.add(pluck(86 + [0, 2, 4, 7][k], 0.25, 1.4), t, 0.2, pan=-0.6 + 0.2 * k)
fx.add(bell(90, 1.2), 2.55, 0.22)  # the wave
hits.add(boom(1.6), at(3), 0.42)  # the screen wakes
fx.add(whoosh(0.5, 1800), at(3) - 0.25, 0.3)
for i in range(12):
    fx.add(pluck(83 + [0, 3, 5, 7, 10, 12][i % 6], 0.22, 1.5), 4.15 + i * 0.19 + 1.15, 0.13, pan=-0.8 if i % 2 else 0.8)
fx.add(riser(3.9), at(3) + 0.1, 0.5)
roll(at(4), at(5), 0.1, 0.55)
reverse_into(at(5), 1.6, 0.45)

# ---- bar 5: the name ----
big_hit(at(5), 3, 1.0)
fx.add(bell(86, 2.0), at(5), 0.3)
fx.add(bell(93, 2.0), at(5) + 0.12, 0.22, pan=0.4)
hook_tail = [(0.0, 0.5, 86), (0.5, 0.5, 90), (1.0, 1.5, 93)]
for beat, length, m in hook_tail:
    tune.add(lead(m, length * BEAT), at(5, 1) + beat * BEAT, 0.2)
fx.add(whoosh(0.55, 2600), at(6) - 0.42, 0.5)

# ---- bars 6 to 11: how a game plays ----
for i, bar in enumerate(range(6, 12)):
    four_floor(bar, sixteenths=bar >= 8)
    bass_bar(bar)
    stabs(bar, 0.17 + 0.01 * i, bright=0.9 + 0.05 * i)
    pads.add(pad(chord_of(bar)['tones'], BAR), at(bar), 0.14)
    if bar in (6, 8, 10):
        hits.add(crash(1.8), at(bar), 0.28)
for bar in range(6, 10):
    hook(bar, (bar - 6) % 4, gain=0.2, voice='pluck')
for bar in (10, 11):
    hook(bar, (bar - 6) % 4, gain=0.22, voice='lead')
fx.add(bell(90, 0.9), at(8, 1) + 0.12, 0.3)  # Correct
fx.add(bell(97, 0.9), at(8, 1) + 0.24, 0.24, pan=0.3)
fx.add(riser(2.8), at(11) - 0.8, 0.55)
roll(at(11, 2), at(12), 0.12, 0.6)
reverse_into(at(12), 1.4, 0.5)

# ---- bars 12 to 17: thirty games, and a new one every second ----
big_hit(at(12), 12, 1.0)
for i, bar in enumerate(range(12, 18)):
    last = bar == 17
    four_floor(bar, sixteenths=True, gain=1.0)
    bass_bar(bar, gain=0.55)
    wall(bar, 0.17)
    stabs(bar, 0.15, bright=1.25)
    hook(bar, i % 4, gain=0.25, octave=0)
    if i % 2 == 0:
        hook(bar, i % 4, gain=0.09, octave=1)
    if bar >= 13:
        # Every cut of the picture (one a second) gets its own knock and breath.
        for half in (0, 2):
            fx.add(whoosh(0.3, 3200), at(bar, half) - 0.16, 0.26)
            hits.add(tom(50 if half == 0 else 45), at(bar, half), 0.3)
    if bar in (13, 15, 17):
        hits.add(crash(1.8), at(bar), 0.32)
for k in range(13):  # the count up to thirty
    fx.add(pluck(84 + k, 0.08, 1.6), at(12) + 0.03 + k * 0.045, 0.1 + 0.01 * k, pan=(k % 3 - 1) * 0.5)
for t0 in (at(17, 2), at(17, 2.5), at(17, 3), at(17, 3.25), at(17, 3.5), at(17, 3.75)):
    hits.add(tom(48 - int((t0 - at(17, 2)) * 6)), t0, 0.42)

# ---- bars 18 and 19: quiet. One Glim, one question ----
for bar in (18, 19):
    pads.add(pad(chord_of(bar + 1)['tones'], BAR), at(bar), 0.3)
    arp(bar + 1, gain=0.07, bright=0.45, sixteenths=False)
for k, t in enumerate([at(18) + 0.25 + (k + 1) * (1.25 / 3) for k in range(3)]):
    fx.add(pluck(88 + [0, 3, 7][k], 0.25, 1.4), t, 0.18, pan=0.6 - 0.3 * k)
hits.add(boom(1.8), at(19), 0.5)  # Make your own.
for m, d in ((78, 0), (81, 0.07), (86, 0.14), (90, 0.21)):
    fx.add(bell(m, 2.2), at(19) + d, 0.28, pan=(d - 0.1) * 4)
do_kick(at(19), power=0.9, long=True, gain=0.7)

# ---- bars 20 to 26: making things. Half time, warm ----
for i, bar in enumerate(range(20, 27)):
    half_time(bar, level=0.85 + 0.03 * i, shaker=bar >= 22)
    bass_bar(bar, pattern='long', gain=0.5)
    pads.add(pad(chord_of(bar)['tones'], BAR), at(bar), 0.24)
    arp(bar, gain=0.085 + 0.006 * i, bright=0.6 + 0.05 * i, sixteenths=bar >= 24)
    if bar % 2 == 0:
        fx.add(whoosh(0.5, 2000), at(bar) - 0.28, 0.32)
        hits.add(crash(1.4), at(bar), 0.16)
for bar in (20, 21, 24, 25):
    hook(bar, (bar - 20) % 4, gain=0.2, voice='bell')
for bar in (22, 23, 26):
    hook(bar, (bar - 20) % 4, gain=0.17, voice='pluck')
for k in range(34):  # a keyboard, while the notes are typed
    fx.add(filt(noise(900) * decay(900, 0.004), bp(1800, 6000)), at(20) + 0.1 + k * 0.045 + rng.random() * 0.012, 0.07, pan=rng.random() - 0.5)
for t0 in (at(26, 2), at(26, 2.5), at(26, 3), at(26, 3.5)):
    hits.add(tom(47 + int((t0 - at(26, 2)) * 4)), t0, 0.36)
fx.add(whoosh(0.55, 2400), at(27) - 0.36, 0.42)

# ---- bars 27 and 28: the classroom. The pulse comes back ----
for bar in (27, 28):
    four_floor(bar, sixteenths=True, gain=0.92)
    bass_bar(bar)
    stabs(bar, 0.18, bright=1.1)
    pads.add(pad(chord_of(bar)['tones'], BAR), at(bar), 0.16)
    hook(bar, (bar - 27) % 4 + 2, gain=0.2, voice='lead')
hits.add(crash(1.8), at(27), 0.3)
roll(at(28, 2), at(29), 0.12, 0.5)
reverse_into(at(29), 0.9, 0.4)

# ---- bars 29 and 30: three plain promises, then the breath in ----
for k, t in enumerate((at(29), at(29, 2), at(30))):
    big_hit(t, 29 + k, 0.8 + 0.1 * k, crash_len=1.4)
fx.add(riser(1.95, top=11000), at(30, 1) - 0.42, 0.62)
roll(at(30, 1), at(31), 0.12, 0.66)
reverse_into(at(31), 1.5, 0.55)

# ---- bars 31 to 34: everyone on stage ----
big_hit(at(31), 31, 1.05)
for i, bar in enumerate(range(31, 34)):
    four_floor(bar, sixteenths=True)
    bass_bar(bar, gain=0.56)
    wall(bar, 0.18)
    stabs(bar, 0.15, bright=1.3)
    hook(bar, i % 4, gain=0.26)
    hook(bar, i % 4, gain=0.1, octave=1)
    if bar == 33:
        hits.add(crash(1.8), at(bar), 0.32)
for t0 in (at(33, 3), at(33, 3.25), at(33, 3.5), at(33, 3.75)):
    hits.add(snare(1.1), t0, 0.5)
# The last bar: one chord, home at last (D), left to ring.
big_hit(at(34), 31 + 2, 1.0, crash_len=3.4)
for m in (50, 57, 62, 66, 69, 74, 78):
    chords.add(supersaw(m, 3.6, bright=6000, release=2.6), at(34), 0.15)
low.add(bass(26, 2.6), at(34), 0.55)
for m, d in ((86, 0.0), (90, 0.14), (93, 0.28), (98, 0.42)):
    fx.add(bell(m, 2.8), at(34) + d, 0.25, pan=(d - 0.2) * 3)

# ------------------------------------------------------------------ the mix

t_all = np.arange(N) / SR
pump = np.ones(N)
for k in kicks:
    i = int(k * SR)
    n = min(N - i, int(0.34 * SR))
    u = np.arange(n) / SR
    pump[i:i + n] = np.minimum(pump[i:i + n], 1 - 0.78 * np.exp(-u / 0.085))


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


low.buf = filt(low.buf, lp(5000)) * (0.25 + 0.75 * pump)[:, None]
low.buf = (low.buf.sum(axis=1, keepdims=True) * 0.5).repeat(2, axis=1)  # the bass sits in the middle
chords.buf = room(filt(chords.buf, hp(160)), 2.0, 0.22) * (0.3 + 0.7 * pump)[:, None]
pads.buf = room(filt(pads.buf, hp(200)), 3.0, 0.4, 4500) * (0.4 + 0.6 * pump)[:, None]
plucks.buf = room(filt(plucks.buf, hp(300)), 2.4, 0.35) * (0.55 + 0.45 * pump)[:, None]
tune.buf = room(filt(tune.buf, hp(240)), 2.2, 0.26)
fx.buf = room(fx.buf, 2.6, 0.3)
hits.buf = room(hits.buf, 2.8, 0.22)
drums.buf = room(drums.buf, 0.9, 0.07, 9000)

mix = drums.buf * 0.8 + low.buf * 0.62 + chords.buf * 1.5 + pads.buf * 1.15 + plucks.buf * 1.45 + tune.buf * 1.6 + fx.buf * 1.1 + hits.buf * 0.8

# The montage's last second falls away; the quiet bar that follows starts clean.
fall = np.ones(N)
a, b = int(at(17, 3.1) * SR), int(at(18) * SR)
fall[a:b] = np.linspace(1, 0.0, b - a) ** 1.5
dark = filt(mix, lp(500))
mix = mix * fall[:, None] + dark * (1 - fall)[:, None] * 0.8
c = int((at(18) + 0.02) * SR)
mix[b:c] *= np.linspace(0, 1, c - b)[:, None]

mix = filt(mix, lambda f: hp(36, 2)(f) * low_shelf(110, -2.5)(f) * shelf(8000, 2.5)(f))
# Glue: lean into a soft ceiling rather than a hard one.
peak = np.percentile(np.abs(mix), 99.9)
mix = np.tanh(mix / peak * 1.25) / np.tanh(1.25)
# Out by the last frame of the picture.
end = int(DUR * SR)
tail = int(1.3 * SR)
mix[end - tail:end] *= np.linspace(1, 0, tail)[:, None] ** 1.6
mix = mix[:end]
mix *= 0.89 / np.abs(mix).max()
rms = np.sqrt((mix ** 2).mean())
print(f'peak {np.abs(mix).max():.2f}  rms {20 * np.log10(rms):.1f} dBFS  length {len(mix) / SR:.2f} s')

with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', OUT)
