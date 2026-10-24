"""A classroom in sound, synthesized: applause, a cheering class, an anticipating "ooh", a school bell, room tone.

Voices are additive formant synthesis (harmonics of a wandering pitch, shaped by moving vowel formants, plus
breath); applause is a crowd of individual clappers, each a train of short filtered noise bursts. Everything is
stereo float32 at SR and seeded, so a render is repeatable.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000

# Vowel formants for young voices (F1, F2, F3 in Hz), a little higher than an adult's.
VOWELS = {
    "i": (330, 2750, 3500),
    "e": (520, 2350, 3200),
    "E": (720, 2050, 3050),
    "a": (950, 1550, 3000),
    "ae": (920, 1950, 3150),
    "o": (560, 980, 2900),
    "u": (380, 960, 2700),
}


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


def voice(dur: float, f0: float, vowels: list[tuple[float, str]], rng: np.random.Generator, shout: float = 0.7,
          glide: float = 0.18, attack: float = 0.06, release: float = 0.25, breath: float = 0.25) -> np.ndarray:
    """One voice: a pitch that rises into the shout and falls away, through a sequence of vowels [(time, vowel)]."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    # Pitch: up into the shout, a wobble, a fall at the end, and a little jitter all the way.
    rise = np.interp(t, [0, glide, dur * 0.7, dur], [0.84, 1.12, 1.02, 0.86])
    vib = 1 + 0.018 * np.sin(2 * np.pi * rng.uniform(4.5, 6.5) * t + rng.uniform(0, 6.28))
    jit = np.cumsum(rng.normal(0, 1, n)) / SR * 0.6
    jit = 1 + (jit - np.convolve(jit, np.ones(4800) / 4800, mode="same")) * 0.4
    f = f0 * rise * vib * jit
    phase = 2 * np.pi * np.cumsum(f) / SR
    # Formant tracks, moving between vowels.
    times = [v[0] for v in vowels]
    tracks = [np.interp(t, times, [VOWELS[v[1]][j] for v in vowels]) * rng.uniform(0.95, 1.06) for j in range(3)]
    bw = [110 + 90 * shout, 140 + 110 * shout, 220 + 150 * shout]
    gains = [1.0, 0.7, 0.35 + 0.2 * shout]
    out = np.zeros(n)
    kmax = int(6500 / f0)
    tilt = 0.9 - 0.45 * shout
    for k in range(1, kmax + 1):
        fk = f * k
        a = sum(g * np.exp(-(((fk - F) / B) ** 2)) for F, B, g in zip(tracks, bw, gains)) + 0.04
        # A shout carries its energy in the 1-3 kHz region, not in the fundamental.
        presence = np.clip((fk / 900.0) ** (0.35 + 0.5 * shout), 0.25, 1.8)
        out += np.sin(k * phase + rng.uniform(0, 6.28)) * a * presence / k**tilt
    out *= 0.6
    # Breath through roughly the same vowel.
    noise = rng.normal(0, 1, n)
    out += _band(noise, 900, 4200) * breath * (0.25 + 0.6 * shout)
    env = _env(n, [(0, 0), (attack, 1), (dur - release, 0.75), (dur, 0)])
    out = np.tanh(out * env * (1.2 + shout)) * 0.5
    return out.astype(np.float32)


def cheer(dur: float, voices: int = 32, seed: int = 1, word: str = "yeah", spread: float = 0.35, power: float = 1.0,
          shout: float = 0.75) -> np.ndarray:
    """A class cheering together: many voices starting within `spread` seconds of each other."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    bus = np.zeros((n, 2), np.float32)
    for i in range(voices):
        young = rng.random() < 0.62
        f0 = rng.uniform(235, 340) if young else rng.uniform(130, 210)
        start = rng.uniform(0, spread) ** 1.4
        length = min(dur - start, rng.uniform(0.9, 2.1) if word != "ooh" else rng.uniform(1.4, dur))
        if length < 0.2:
            continue
        w = word if word != "mix" else rng.choice(["yeah", "woo", "yes", "yay"])
        if w == "yeah":
            seq = [(0, "i"), (0.07, "E"), (0.25, "ae"), (length, "a")]
        elif w == "woo":
            seq = [(0, "u"), (0.18, "u"), (0.4, "o"), (length, "o")]
        elif w == "yes":
            seq = [(0, "i"), (0.06, "E"), (length * 0.6, "E"), (length, "i")]
        elif w == "yay":
            seq = [(0, "i"), (0.08, "e"), (length, "e")]
        else:  # ooh: soft, long, rising together
            seq = [(0, "u"), (length, "o")]
        sh = shout * rng.uniform(0.7, 1.15) if w != "ooh" else 0.15
        v = voice(length, f0, seq, rng, shout=sh, glide=0.18 if w != "ooh" else length * 0.8,
                  attack=0.05 if w != "ooh" else 0.35, release=0.35 if w != "ooh" else 0.5, breath=0.18 if w != "ooh" else 0.05)
        if rng.random() < 0.4:
            v = _low(v, rng.uniform(2200, 3800))
        v *= rng.uniform(0.45, 1.0)
        a = int(start * SR)
        bus[a:a + len(v)] += _pan(v, rng.uniform(-0.85, 0.85))
    # A bed of breath and noise under the voices, so it sounds like a room full of people.
    bed = _band(rng.normal(0, 1, (n, 2)), 350, 3200) * 0.035
    bed *= _env(n, [(0, 0), (min(0.15, dur / 3), 1), (dur * 0.65, 0.6), (dur, 0)])[:, None]
    bus += bed.astype(np.float32)
    return (bus * power).astype(np.float32)


def applause(dur: float, clappers: int = 26, seed: int = 2, rate: tuple[float, float] = (4.2, 6.2), fade: float = 1.2,
             attack: float = 0.25) -> np.ndarray:
    """Applause: each clapper a train of short noise bursts through their own hand resonance."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    bus = np.zeros((n, 2), np.float32)
    burst_len = int(0.03 * SR)
    tt = np.arange(burst_len) / SR
    for _ in range(clappers):
        r = rng.uniform(*rate)
        t = rng.uniform(0, attack)
        train = np.zeros(n)
        while t < dur:
            i = int(t * SR)
            if i < n:
                train[i] = rng.uniform(0.6, 1.0)
            t += (1 / r) * rng.uniform(0.86, 1.14)
        decay = rng.uniform(0.006, 0.014)
        burst = rng.normal(0, 1, burst_len) * np.exp(-tt / decay) * np.minimum(1, tt / 0.0012)
        x = np.convolve(train, burst)[:n]
        c = rng.uniform(800, 2400)
        x = _band(x, c / 1.8, c * 1.8)
        x *= rng.uniform(0.5, 1.0)
        bus += _pan(x.astype(np.float32), rng.uniform(-0.9, 0.9))
    bus *= _env(n, [(0, 0), (0.06, 1), (max(0.1, dur - fade), 0.9), (dur, 0)])[:, None]
    return (bus * 0.35).astype(np.float32)


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


def murmur(dur: float, voices: int = 12, seed: int = 5) -> np.ndarray:
    """A class talking quietly before the game: syllables on random vowels, low and far away."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    bus = np.zeros((n, 2), np.float32)
    for _ in range(voices):
        f0 = rng.uniform(150, 290)
        t = rng.uniform(0, 0.6)
        while t < dur - 0.4:
            words = rng.integers(2, 6)
            seq, tt = [], 0.0
            for _w in range(words):
                seq.append((tt, rng.choice(list(VOWELS))))
                tt += rng.uniform(0.1, 0.22)
            seq.append((tt, seq[-1][1]))
            v = voice(tt + 0.05, f0 * rng.uniform(0.9, 1.1), seq, rng, shout=0.05, glide=0.05, attack=0.03, release=0.05, breath=0.35)
            syll = 0.55 + 0.45 * np.abs(np.sin(np.pi * np.arange(len(v)) / SR / rng.uniform(0.12, 0.2)))
            v = _low(v * syll, 2400)
            a = int(t * SR)
            bus[a:a + len(v)] += _pan(v[: max(0, n - a)].astype(np.float32), rng.uniform(-0.8, 0.8)) * rng.uniform(0.3, 0.7)
            t += tt + rng.uniform(0.3, 1.4)
    return (bus * 0.4).astype(np.float32)
