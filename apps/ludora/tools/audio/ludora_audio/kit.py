"""A synthesised drum kit that plays the same step patterns as the soundfont kits.

    from ..kit import KIT_FESTIVAL
    Part("drums", KIT_FESTIVAL, drums({"kick": "X...x...", "hat": "..x...x."}, t), Mix(gain_db=-4))

Every lane name in notation.DRUM has a voice. Each drum is built from a transient
(a click, a crack, a stick) and a body (a pitched membrane, wires, metal), and
each hit is chosen from four velocity layers, so a ghost note is darker and
softer than an accent rather than only quieter. Each layer has four round-robin
variations (a different noise, a hair of tuning and decay), picked by a seeded
generator so repeated hits are never machine-identical and every build is the
same. An open hat is cut short by the next closed or pedal hat.

Three kits share the voices with different settings:

- KIT_FESTIVAL: modern and punchy, bright hats. Most tracks.
- KIT_LANTERN: soft and round, darker, gentler transients. Calm and lobby.
- KIT_ARCADE: tight and electronic, a punchier kick, crisp snare and hats. Battle and intense.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar

import numpy as np

from .engine import Rendered, bl_wave, butter_filter, pan_gains, stable_seed
from .notation import DRUM
from .render import SR

ROUND_ROBIN = 4
# Each voice lasts this many of its longest time constant: long enough to fall about 60 dB, so nothing is cut off audibly.
RING = 7.0
# Velocity layers: the lowest velocity of each, and the intensity its sound is made at.
LAYERS = ((1, 0.3), (48, 0.52), (82, 0.75), (110, 0.95))


def _t(seconds: float) -> np.ndarray:
    return np.arange(int(round(seconds * SR))) / SR


def _ramp(n: int, seconds: float) -> np.ndarray:
    """A linear fade-in over `seconds`, so an attack starts from zero without a click."""
    k = max(1, int(seconds * SR))
    r = np.ones(n)
    r[: min(n, k)] = np.linspace(0.0, 1.0, k)[: min(n, k)]
    return r


def _end(x: np.ndarray, seconds: float = 0.004) -> np.ndarray:
    k = min(len(x), int(seconds * SR))
    x = x.copy()
    x[len(x) - k :] *= np.linspace(1.0, 0.0, k)[:, None] if x.ndim == 2 else np.linspace(1.0, 0.0, k)
    return x


def _sine_sweep(freq: np.ndarray, phase: float = 0.0) -> np.ndarray:
    return np.sin(2 * np.pi * (np.cumsum(freq) / SR) + phase)


def _partials(t: np.ndarray, base: float, ratios, amps, decays, rng, beat: float = 0.0) -> np.ndarray:
    """Decaying sine partials (a bell, a bar, a jingle), left out above 18 kHz. `beat` pairs each with a slightly detuned twin."""
    x = np.zeros(len(t))
    for r, a, d in zip(ratios, amps, decays):
        f = base * r
        if f >= 18000:
            continue
        # Every partial starts at zero, so the strike has no low thump from a jump in level.
        tone = np.sin(2 * np.pi * f * t)
        if beat:
            tone = 0.5 * tone + 0.5 * np.sin(2 * np.pi * (f + beat * r) * t)
        x += a * tone * np.exp(-t / d)
    return x


def _metal(n: int, base: float, ratios, rng, phases=None) -> np.ndarray:
    """Band-limited square waves at inharmonic ratios: the clangorous core of hats and cymbals."""
    x = np.zeros(n)
    for i, r in enumerate(ratios):
        f = np.full(n, base * r)
        x += bl_wave("square", f, phases[i] if phases is not None else rng.random())
    return x / len(ratios)


def _stereo(x: np.ndarray, pan: float = 0.0) -> np.ndarray:
    lg, rg = pan_gains(pan)
    return np.stack([x * lg, x * rg], axis=1)


# The 808's six hat oscillators, as ratios to the lowest.
HAT_RATIOS = (1.0, 1.4827, 1.8003, 2.5460, 2.6303, 3.8968)


@dataclass(frozen=True)
class Kit(Rendered):
    """A drum kit made of synthesised voices. See the module docstring."""

    name: str
    # Semitones for every drum, a multiplier on every decay, a brightness multiplier
    # on the noise and metal, and how hard the transients and pitch drops hit.
    tune: float = 0.0
    decay: float = 1.0
    tone: float = 1.0
    punch: float = 1.0
    # Extra dB per lane name, on top of the kit's own balance.
    levels: tuple[tuple[str, float], ...] = ()
    description: str = field(default="", compare=False)

    drums: ClassVar[bool] = True

    @property
    def pitch(self) -> float:
        return 2 ** (self.tune / 12)

    def _render(self, events, bpm: float, length_beats: float, seed: int) -> np.ndarray:
        spb = 60.0 / bpm
        hits = sorted((round(s * spb * SR), p, v) for s, _, p, v in events)
        chooser = np.random.default_rng(stable_seed(self.name, "round robin", seed))
        extra = dict(self.levels)
        made: dict[tuple[int, int, int], np.ndarray] = {}
        last: dict[tuple[int, int], int] = {}
        pieces = []
        for i, (start, pitch, vel) in enumerate(hits):
            if pitch not in VOICES:
                raise ValueError(f"the synthesised kit has no drum on note {pitch}")
            lane, fn, level_db = VOICES[pitch]
            layer = max(j for j, (lo, _) in enumerate(LAYERS) if vel >= lo)
            # A random variation, never the same one twice running on a lane.
            options = [v for v in range(ROUND_ROBIN) if v != last.get((pitch, layer))]
            variant = int(options[chooser.integers(len(options))])
            last[(pitch, layer)] = variant
            key = (pitch, layer, variant)
            if key not in made:
                made[key] = fn(LAYERS[layer][1], np.random.default_rng(stable_seed(self.name, pitch, layer, variant)), self)
            gain = (vel / 100.0) ** 1.6 * 10 ** ((level_db + extra.get(lane, 0.0) + chooser.uniform(-0.6, 0.6)) / 20)
            x = made[key] * gain
            if lane == "open":
                # Choke: the next closed or pedal hat cuts an open hat.
                for later, p2, _ in hits[i + 1 :]:
                    if p2 in (DRUM["hat"], DRUM["pedal"]):
                        cut = later - start
                        if cut < len(x):
                            x = _end(x[: cut + int(0.008 * SR)], 0.008)
                        break
            pieces.append((start, x))
        end = max([s + len(x) for s, x in pieces] + [int(round(length_beats * spb * SR))]) + 1
        out = np.zeros((end, 2))
        for s, x in pieces:
            out[s : s + len(x)] += x
        return out


# --- The voices. Each takes (intensity 0..1, a seeded generator, the kit) and returns stereo audio.


def kick(i: float, rng, kit: Kit, long: bool = False) -> np.ndarray:
    tune = kit.pitch * (1 + rng.uniform(-0.008, 0.008))
    t = _t(0.012 + RING * (0.34 if long else 0.075) * kit.decay * 1.03)
    f_end = (45.0 if long else 52.0) * tune
    f_start = f_end * (2.4 + 1.9 * i * kit.punch)
    freq = f_end + (f_start - f_end) * np.exp(-t / (0.05 if long else 0.033))
    body = _sine_sweep(freq)
    # Held briefly at full level, then a smooth fall: weight without boom. The short kick is
    # down 20 dB in about a fifth of a second, so its sub clears before the next beat.
    tau = (0.34 if long else 0.075) * kit.decay * (1 + rng.uniform(-0.03, 0.03))
    env = np.exp(-np.maximum(t - 0.012, 0) / tau) * _ramp(len(t), 0.0006)
    drive = 1.6 + 1.1 * i
    body = np.tanh(body * env * drive) / np.tanh(drive)
    click = butter_filter(rng.standard_normal(len(t)), "band", (1400 * kit.tone, 7500 * kit.tone)) * np.exp(-t / 0.0022)
    click *= (0.22 + 0.3 * i) * kit.punch
    x = body * 0.92 + click
    return _end(_stereo(x))


def kick2(i, rng, kit):
    return kick(i, rng, kit, long=True)


def snare(i: float, rng, kit: Kit, tight: bool = False) -> np.ndarray:
    tune = kit.pitch * (1 + rng.uniform(-0.01, 0.01))
    t = _t(RING * ((0.05 if tight else 0.06) + 0.03 * i) * kit.decay * 1.05)
    n = len(t)
    f1 = (238.0 if tight else 188.0) * tune
    drop = 1 + 0.22 * kit.punch * np.exp(-t / 0.009)
    shell = 0.75 * _sine_sweep(f1 * drop) * np.exp(-t / 0.055) + 0.35 * _sine_sweep(f1 * 1.72 * drop) * np.exp(-t / 0.032)
    shell *= _ramp(n, 0.0005)
    lo, hi = 1600 * kit.tone * (0.85 + 0.3 * i), 7800 * min(1.4, kit.tone)
    # Tight and dry: the mix's reverb gives it its room.
    wires_tau = ((0.05 if tight else 0.06) + 0.03 * i) * kit.decay * (1 + rng.uniform(-0.04, 0.04))
    wenv = np.exp(-t / wires_tau) * _ramp(n, 0.0008)
    n1, n2 = rng.standard_normal(n), rng.standard_normal(n)
    wl = butter_filter(n1, "band", (lo, hi))
    wr = butter_filter(0.85 * n1 + 0.53 * n2, "band", (lo, hi))
    wires = (0.4 + 0.45 * i) * wenv
    crack = butter_filter(rng.standard_normal(n), "band", (1800 * kit.tone, 5500 * kit.tone)) * np.exp(-t / 0.005) * (0.2 + 0.35 * i) * kit.punch
    left = shell + wl * wires + crack
    right = shell + wr * wires + crack
    return _end(np.stack([left, right], axis=1) * 0.8)


def snare2(i, rng, kit):
    return snare(i, rng, kit, tight=True)


def clap(i: float, rng, kit: Kit) -> np.ndarray:
    t = _t(0.04 + RING * (0.05 + 0.035 * i) * kit.decay)
    n = len(t)
    out = np.zeros((n, 2))
    offsets = [0.0] + [o + rng.uniform(-0.0015, 0.0015) for o in (0.0105, 0.0215, 0.033)]
    for k, o in enumerate(offsets):
        tt = np.maximum(t - o, 0)
        on = t >= o
        tail = k == len(offsets) - 1
        env = np.where(on, np.exp(-tt / ((0.05 + 0.035 * i) * kit.decay if tail else 0.0035)), 0.0) * (0.7 if tail else 1.0)
        burst = butter_filter(rng.standard_normal(n), "band", (850 * kit.tone, 3400 * kit.tone)) * env
        out += _stereo(burst, rng.uniform(-0.3, 0.3))
    body = butter_filter(rng.standard_normal(n), "band", (1050, 1500)) * np.exp(-t / 0.03) * 0.5
    out += _stereo(body)
    return _end(out * (0.55 + 0.25 * i))


def rim(i: float, rng, kit: Kit) -> np.ndarray:
    tune = kit.pitch * (1 + rng.uniform(-0.01, 0.01))
    t = _t(0.12)
    click = butter_filter(rng.standard_normal(len(t)), "high", 2500 * kit.tone) * np.exp(-t / 0.0015)
    ring = np.sin(2 * np.pi * 1720 * tune * t) * np.exp(-t / 0.017)
    wood = np.sin(2 * np.pi * 510 * tune * t) * np.exp(-t / 0.011)
    x = (0.35 + 0.25 * i) * click + 0.6 * ring + 0.45 * wood
    return _end(_stereo(x * _ramp(len(t), 0.0003) * 0.8))


def _hat(i: float, rng, kit: Kit, seconds: float, tau: float, hp: float, chick: bool = False) -> np.ndarray:
    t = _t(seconds * kit.decay)
    n = len(t)
    base = 330.0 * kit.pitch * (1 + rng.uniform(-0.004, 0.004))
    metal = _metal(n, base, HAT_RATIOS, rng)
    tone = kit.tone * (0.85 + 0.3 * i)
    out = []
    for _ in range(2):
        noise = rng.standard_normal(n) * 0.55
        src = metal + noise
        x = butter_filter(src, "high", hp * tone, order=4)
        # Above 15 kHz a hat only fizzes (and children hear all of it).
        x = butter_filter(x, "low", (9000 if chick else 15000) * tone, order=2)
        out.append(x)
    env = np.exp(-t / (tau * kit.decay * (0.85 + 0.3 * i) * (1 + rng.uniform(-0.05, 0.05))))
    env *= _ramp(n, 0.002 if chick else 0.0003)
    x = np.stack(out, axis=1) * env[:, None]
    return _end(x * 1.1)


def hat(i, rng, kit):
    return _hat(i, rng, kit, 0.25, 0.026, 6000)


def pedal(i, rng, kit):
    return _hat(i, rng, kit, 0.15, 0.014, 5000, chick=True)


def open_hat(i, rng, kit):
    return _hat(i, rng, kit, 2.4, 0.28, 5400)


def _cymbal(i: float, rng, kit: Kit, base: float, bright_tau: float, dark_tau: float, ratio_seed: str) -> np.ndarray:
    t = _t(RING * dark_tau * kit.decay)
    n = len(t)
    # The partials belong to the cymbal (fixed per kit); only their phases change between variations.
    ratios = np.random.default_rng(stable_seed(kit.name, ratio_seed)).uniform(1.0, 3.4, 10)
    base = base * kit.pitch * (1 + rng.uniform(-0.003, 0.003))
    tone = kit.tone * (0.85 + 0.3 * i)
    chans = []
    for _ in range(2):
        metal = _metal(n, base, ratios, rng)
        noise = rng.standard_normal(n) * 0.6
        bright = butter_filter(butter_filter(metal + noise, "high", 5000 * tone, order=2), "low", 14000, order=2) * np.exp(-t / (bright_tau * kit.decay))
        dark = butter_filter(metal * 0.8 + noise * 0.5, "band", (2400 * tone, 9500 * tone)) * np.exp(-t / (dark_tau * kit.decay))
        splash = butter_filter(rng.standard_normal(n), "high", 2000) * np.exp(-t / 0.012) * 0.5
        chans.append(bright * 0.8 + dark * 0.6 + splash)
    x = np.stack(chans, axis=1) * _ramp(n, 0.001)[:, None]
    return _end(x * (0.7 + 0.3 * i), 0.05)


def crash(i, rng, kit):
    return _cymbal(i, rng, kit, 410, 0.45, 0.95, "crash")


def crash2(i, rng, kit):
    return _cymbal(i, rng, kit, 455, 0.5, 1.05, "crash2")


def splash(i, rng, kit):
    return _cymbal(i, rng, kit, 560, 0.18, 0.4, "splash")


def ride(i: float, rng, kit: Kit, bell: bool = False) -> np.ndarray:
    t = _t(RING * 0.9 * kit.decay)
    n = len(t)
    base = (1650 if bell else 1350) * kit.pitch * (1 + rng.uniform(-0.003, 0.003))
    ping = _partials(t, base, (1.0, 1.48, 2.03, 2.76, 3.4), (1.0, 0.6, 0.45, 0.35, 0.25), [d * kit.decay for d in (0.9, 0.7, 0.55, 0.42, 0.33)], rng, beat=0.6)
    stick = butter_filter(rng.standard_normal(n), "high", 4000) * np.exp(-t / 0.003)
    chans = []
    for _ in range(2):
        wash = butter_filter(_metal(n, 420 * kit.pitch, (1.0, 1.37, 1.91, 2.33, 2.97, 3.41), rng) + rng.standard_normal(n) * 0.4, "high", 6000 * kit.tone, order=2)
        wash *= np.exp(-t / (0.9 * kit.decay))
        chans.append(ping * (0.55 if bell else 0.3) + wash * (0.25 if bell else 0.5) + stick * (0.2 + 0.2 * i))
    x = np.stack(chans, axis=1) * _ramp(n, 0.0005)[:, None]
    return _end(x * 0.8, 0.05)


def ride_bell(i, rng, kit):
    return ride(i, rng, kit, bell=True)


def _tom(i: float, rng, kit: Kit, base: float, pan: float) -> np.ndarray:
    t = _t(RING * 0.27 * kit.decay * (110 / base) ** 0.5)
    n = len(t)
    f = base * kit.pitch * (1 + rng.uniform(-0.01, 0.01))
    freq = f * (1 + (0.35 + 0.25 * i) * kit.punch * np.exp(-t / 0.035))
    tau = 0.26 * kit.decay * (110 / base) ** 0.5 * (1 + rng.uniform(-0.04, 0.04))
    body = _sine_sweep(freq) * np.exp(-t / tau)
    # The head's upper modes and the stick carry a tom on small speakers, which miss its fundamental.
    mode = _sine_sweep(freq * 1.59) * np.exp(-t / 0.12) * 0.7 + _sine_sweep(freq * 2.41) * np.exp(-t / 0.07) * 0.45 + _sine_sweep(freq * 3.2) * np.exp(-t / 0.035) * 0.25
    head = butter_filter(rng.standard_normal(n), "band", (500, 5000 * kit.tone)) * np.exp(-t / 0.01) * (0.6 + 0.4 * i)
    # Saturation adds the overtones that carry a tom on small speakers.
    x = np.tanh((body + mode) * 1.9) / np.tanh(1.9) + head
    return _end(_stereo(x * _ramp(n, 0.0005) * 0.85, pan))


def tom_lo(i, rng, kit):
    return _tom(i, rng, kit, 98, 0.3)


def tom_mid(i, rng, kit):
    return _tom(i, rng, kit, 132, 0.0)


def tom_hi(i, rng, kit):
    return _tom(i, rng, kit, 176, -0.3)


def _grains(n: int, rng, density: float, ms: float) -> np.ndarray:
    """A crackle of tiny impacts: the beads in a shaker."""
    g = (rng.random(n) < density) * rng.random(n)
    k = np.exp(-np.arange(int(ms * SR / 1000 * 6)) / (ms * SR / 1000))
    return np.convolve(g, k)[:n]


def _shake(i: float, rng, kit: Kit, lo: float, hi: float, attack: float, tau: float, seconds: float, pan: float) -> np.ndarray:
    t = _t(max(seconds, attack * 1.3 + RING * tau * kit.decay))
    n = len(t)
    attack = attack * (1 + rng.uniform(-0.3, 0.3))
    env = np.where(t < attack, (t / attack) ** 1.5, np.exp(-(t - attack) / (tau * kit.decay)))
    chans = []
    for _ in range(2):
        grains = _grains(n, rng, 0.05, 1.2)
        tex = rng.standard_normal(n) * (0.4 + grains / (grains.max() + 1e-9))
        chans.append(butter_filter(tex, "band", (lo * kit.tone * (0.9 + 0.2 * i), hi * min(1.3, kit.tone))) * env)
    x = np.stack(chans, axis=1)
    x[:, 0], x[:, 1] = 0.8 * x[:, 0] + 0.2 * x[:, 1], 0.2 * x[:, 0] + 0.8 * x[:, 1]
    lg, rg = pan_gains(pan)
    x[:, 0] *= lg
    x[:, 1] *= rg
    return _end(x * 1.2)


def shaker(i, rng, kit):
    return _shake(i, rng, kit, 4200, 12500, 0.008, 0.042, 0.2, 0.3)


def cabasa(i, rng, kit):
    return _shake(i, rng, kit, 5500, 15000, 0.003, 0.03, 0.15, 0.35)


def tamb(i: float, rng, kit: Kit) -> np.ndarray:
    t = _t(0.015 + RING * 0.16 * kit.decay)
    n = len(t)
    out = np.zeros((n, 2))
    for _ in range(6):
        o = rng.uniform(0, 0.012)
        tt = np.maximum(t - o, 0)
        f = rng.uniform(4800, 7800) * min(1.2, kit.tone)
        jingle = _partials(tt, f, (1.0, 1.53, 2.17), (1.0, 0.6, 0.35), [rng.uniform(0.08, 0.16) * kit.decay] * 3, rng) * (t >= o)
        out += _stereo(jingle, rng.uniform(-0.25, 0.65))
    hiss = butter_filter(rng.standard_normal(n), "high", 6000) * np.exp(-t / 0.05) * 0.5
    skin = butter_filter(rng.standard_normal(n), "band", (200, 800)) * np.exp(-t / 0.01) * 0.25
    out += _stereo(hiss + skin, 0.3)
    return _end(out * (0.18 + 0.1 * i) * _ramp(n, 0.0005)[:, None])


def jingle(i: float, rng, kit: Kit) -> np.ndarray:
    """Sleigh bells: a cluster of small bells, then the rattle of them settling."""
    t = _t(0.11 + RING * 0.3 * kit.decay)
    n = len(t)
    out = np.zeros((n, 2))
    for j in range(14):
        o = rng.uniform(0, 0.035) if j < 9 else rng.uniform(0.07, 0.11)
        amp = 1.0 if j < 9 else 0.5
        tt = np.maximum(t - o, 0)
        f = rng.uniform(2600, 6200) * kit.pitch
        bell = _partials(tt, f, (1.0, 2.4, 3.9), (1.0, 0.45, 0.2), [rng.uniform(0.12, 0.3) * kit.decay] * 3, rng) * (t >= o)
        out += _stereo(bell * amp, rng.uniform(-0.7, 0.7))
    hiss = butter_filter(rng.standard_normal(n), "high", 7000) * np.exp(-t / 0.03) * 0.6
    out += _stereo(hiss)
    return _end(out * (0.09 + 0.05 * i) * _ramp(n, 0.0005)[:, None], 0.02)


def chime(i: float, rng, kit: Kit) -> np.ndarray:
    """A bell tree: bright little bells falling in a glissando from left to right."""
    t = _t(0.33 + RING * 1.0 * kit.decay)
    n = len(t)
    out = np.zeros((n, 2))
    count = 11
    freqs = np.geomspace(6400, 2200, count) * kit.pitch
    for k in range(count):
        o = 0.32 * (k / count) ** 0.85 + rng.uniform(0, 0.006)
        tt = np.maximum(t - o, 0)
        bell = _partials(tt, freqs[k] * (1 + rng.uniform(-0.004, 0.004)), (1.0, 2.76, 5.4), (1.0, 0.35, 0.12), [1.0 * kit.decay, 0.45, 0.2], rng) * (t >= o)
        out += _stereo(bell * (0.6 + 0.4 * (1 - k / count)), -0.6 + 1.2 * k / (count - 1))
    return _end(out * (0.07 + 0.05 * i), 0.05)


def triangle(i: float, rng, kit: Kit, mute: bool = False) -> np.ndarray:
    t = _t(RING * (0.08 if mute else 1.2) * kit.decay)
    n = len(t)
    f0 = 1180 * kit.pitch * (1 + rng.uniform(-0.003, 0.003))
    ratios = (1.0, 2.03, 3.01, 4.05, 5.1, 6.15, 7.22, 8.3, 9.4)
    amps = [1 / (k + 1) ** 0.6 for k in range(len(ratios))]
    decays = [((0.08 if mute else 1.2) * kit.decay) / (1 + 0.15 * k) for k in range(len(ratios))]
    ring = _partials(t, f0, ratios, amps, decays, rng, beat=0.7)
    strike = butter_filter(rng.standard_normal(n), "high", 5000) * np.exp(-t / 0.002) * 0.5
    return _end(_stereo((ring * 0.35 + strike) * (0.25 + 0.12 * i) * _ramp(n, 0.0003), 0.35), 0.02)


def triangle_mute(i, rng, kit):
    return triangle(i, rng, kit, mute=True)


def cowbell(i: float, rng, kit: Kit) -> np.ndarray:
    t = _t(RING * 0.09 * kit.decay)
    n = len(t)
    x = bl_wave("square", np.full(n, 540 * kit.pitch), rng.random()) + bl_wave("square", np.full(n, 800 * kit.pitch), rng.random())
    x = butter_filter(x, "band", (500, 4200 * kit.tone))
    env = 0.6 * np.exp(-t / 0.012) + 0.4 * np.exp(-t / (0.09 * kit.decay))
    return _end(_stereo(x * env * (0.3 + 0.15 * i) * _ramp(n, 0.0003), -0.2))


def agogo(i: float, rng, kit: Kit) -> np.ndarray:
    """A sweet, bright festival bell."""
    t = _t(RING * 0.4 * kit.decay)
    n = len(t)
    f = 1050 * kit.pitch * (1 + rng.uniform(-0.003, 0.003))
    ring = _partials(t, f, (1.0, 2.0, 2.76, 4.07, 5.4), (1.0, 0.35, 0.5, 0.25, 0.12), [d * kit.decay for d in (0.4, 0.25, 0.2, 0.12, 0.08)], rng)
    strike = butter_filter(rng.standard_normal(n), "high", 3000) * np.exp(-t / 0.0015) * 0.4
    return _end(_stereo((ring * 0.5 + strike) * (0.35 + 0.15 * i) * _ramp(n, 0.0003), 0.25))


def claves(i: float, rng, kit: Kit) -> np.ndarray:
    t = _t(RING * 0.028)
    f = 2500 * kit.pitch * (1 + rng.uniform(-0.005, 0.005))
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.028) + 0.2 * np.sin(2 * np.pi * f * 2.7 * t) * np.exp(-t / 0.01)
    return _end(_stereo(x * (0.35 + 0.15 * i) * _ramp(len(t), 0.0003), -0.3))


def _block(i: float, rng, kit: Kit, base: float, pan: float) -> np.ndarray:
    t = _t(RING * 0.045)
    n = len(t)
    f = base * kit.pitch * (1 + rng.uniform(-0.006, 0.006))
    wood = _partials(t, f, (1.0, 2.37, 3.9), (1.0, 0.4, 0.2), (0.045, 0.02, 0.012), rng)
    click = butter_filter(rng.standard_normal(n), "band", (1000, 6000)) * np.exp(-t / 0.002) * 0.4
    return _end(_stereo((wood + click) * (0.3 + 0.15 * i) * _ramp(n, 0.0003), pan))


def block_hi(i, rng, kit):
    return _block(i, rng, kit, 1180, 0.2)


def block_lo(i, rng, kit):
    return _block(i, rng, kit, 820, -0.2)


def _hand_drum(i: float, rng, kit: Kit, base: float, tau: float, slap: float, pan: float) -> np.ndarray:
    t = _t(RING * tau * kit.decay)
    n = len(t)
    f = base * kit.pitch * (1 + rng.uniform(-0.01, 0.01))
    freq = f * (1 + 0.18 * np.exp(-t / 0.012))
    body = _sine_sweep(freq) * np.exp(-t / (tau * kit.decay)) + 0.3 * _sine_sweep(freq * 1.5) * np.exp(-t / (tau * 0.5))
    hit = butter_filter(rng.standard_normal(n), "band", (1500, 5500 * kit.tone)) * np.exp(-t / 0.004) * slap * (0.6 + 0.6 * i)
    return _end(_stereo((body * 0.8 + hit) * (0.6 + 0.3 * i) * _ramp(n, 0.0004), pan))


def bongo_hi(i, rng, kit):
    return _hand_drum(i, rng, kit, 420, 0.1, 0.4, -0.35)


def bongo_lo(i, rng, kit):
    return _hand_drum(i, rng, kit, 300, 0.14, 0.35, -0.2)


def conga_mute(i, rng, kit):
    return _hand_drum(i, rng, kit, 340, 0.04, 0.7, 0.25)


def conga_hi(i, rng, kit):
    return _hand_drum(i, rng, kit, 330, 0.2, 0.3, 0.25)


def conga_lo(i, rng, kit):
    return _hand_drum(i, rng, kit, 220, 0.26, 0.25, 0.4)


def timbale(i: float, rng, kit: Kit) -> np.ndarray:
    t = _t(RING * 0.35 * kit.decay)
    n = len(t)
    skin = _hand_drum(i, rng, kit, 520, 0.12, 0.5, 0.0)[:n, 0]
    skin = np.pad(skin, (0, n - len(skin)))
    shell = _partials(t, 1450 * kit.pitch, (1.0, 1.47, 2.09, 2.56), (1.0, 0.7, 0.5, 0.3), [0.35 * kit.decay] * 4, rng) * 0.3
    return _end(_stereo(skin + shell, 0.3))


def guiro(i: float, rng, kit: Kit) -> np.ndarray:
    t = _t(0.3)
    n = len(t)
    x = np.zeros(n)
    for k in range(16):
        o = 0.22 * (k / 16) + rng.uniform(0, 0.003)
        tt = np.maximum(t - o, 0)
        x += butter_filter(rng.standard_normal(n), "band", (1800, 4500)) * np.exp(-tt / 0.0025) * (t >= o) * np.sin(np.pi * (k + 0.5) / 16)
    return _end(_stereo(x * (0.25 + 0.15 * i), -0.25))


def whistle(i: float, rng, kit: Kit) -> np.ndarray:
    """A festival pea whistle, trilling."""
    t = _t(0.4)
    n = len(t)
    f = 2750 * kit.pitch
    trill = np.sin(2 * np.pi * 32 * t)
    tone = _sine_sweep(f * (1 + 0.015 * trill)) * (0.65 + 0.35 * trill)
    breath = butter_filter(rng.standard_normal(n), "band", (2000, 6000)) * 0.15
    env = np.clip(t / 0.02, 0, 1) * np.clip((0.4 - t) / 0.05, 0, 1)
    return _end(_stereo((tone + breath) * env * (0.2 + 0.1 * i), 0.1))


# Note number: (lane name, voice, level in dB). The levels are set against the soundfont's room kit
# (KIT_ROOM): at velocity 100 each core voice has the same momentary loudness (the loudest 400 ms, about
# -25 LUFS for the kick and snare) and the same energy as its room-kit counterpart, so a groove measures
# within about 1 dB and a track can swap kits without changing its gain. The percussion is within a dB
# or two; the triangle, jingle and chime 3 to 4 dB under the soundfont's very loud ones, and the whistle
# 16 dB under on purpose. `showcase.py --audition` measures every lane against the room kit.
VOICES = {
    DRUM["kick"]: ("kick", kick, -16.8),
    DRUM["kick2"]: ("kick2", kick2, -19.7),
    DRUM["snare"]: ("snare", snare, -12.5),
    DRUM["snare2"]: ("snare2", snare2, -14.3),
    DRUM["clap"]: ("clap", clap, -5.0),
    DRUM["rim"]: ("rim", rim, -5.8),
    DRUM["hat"]: ("hat", hat, -18.8),
    DRUM["pedal"]: ("pedal", pedal, -12.1),
    DRUM["open"]: ("open", open_hat, -26.6),
    DRUM["crash"]: ("crash", crash, -11.8),
    DRUM["crash2"]: ("crash2", crash2, -13.5),
    DRUM["splash"]: ("splash", splash, -13.5),
    DRUM["ride"]: ("ride", ride, -17.9),
    DRUM["bell"]: ("bell", ride_bell, -20.1),
    DRUM["tom_lo"]: ("tom_lo", tom_lo, -20.5),
    DRUM["tom_mid"]: ("tom_mid", tom_mid, -19.8),
    DRUM["tom_hi"]: ("tom_hi", tom_hi, -21.2),
    DRUM["shaker"]: ("shaker", shaker, -14.9),
    DRUM["cabasa"]: ("cabasa", cabasa, -11.3),
    DRUM["tamb"]: ("tamb", tamb, -15.7),
    DRUM["jingle"]: ("jingle", jingle, -11.1),
    DRUM["chime"]: ("chime", chime, -11.6),
    DRUM["triangle"]: ("triangle", triangle, -7.0),
    DRUM["triangle_mute"]: ("triangle_mute", triangle_mute, -2.3),
    DRUM["cowbell"]: ("cowbell", cowbell, -10.5),
    DRUM["agogo"]: ("agogo", agogo, -12.4),
    DRUM["claves"]: ("claves", claves, -8.0),
    DRUM["block_hi"]: ("block_hi", block_hi, -7.8),
    DRUM["block_lo"]: ("block_lo", block_lo, -7.0),
    DRUM["bongo_hi"]: ("bongo_hi", bongo_hi, -12.9),
    DRUM["bongo_lo"]: ("bongo_lo", bongo_lo, -12.9),
    DRUM["conga_mute"]: ("conga_mute", conga_mute, -11.8),
    DRUM["conga_hi"]: ("conga_hi", conga_hi, -13.2),
    DRUM["conga_lo"]: ("conga_lo", conga_lo, -12.5),
    DRUM["timbale"]: ("timbale", timbale, -13.0),
    DRUM["guiro"]: ("guiro", guiro, 1.2),
    DRUM["whistle"]: ("whistle", whistle, -18.1),
}

KIT_FESTIVAL = Kit("festival", description="Modern and punchy, with bright hats: most tracks.")
KIT_LANTERN = Kit("lantern", tune=-1.0, decay=1.15, tone=0.75, punch=0.6, levels=(("hat", -2.0), ("open", -2.0)), description="Soft and round, darker hats, gentle transients: calm and lobby.")
KIT_ARCADE = Kit("arcade", tune=0.5, decay=0.85, tone=1.15, punch=1.3, levels=(("kick", 1.0),), description="Tight and electronic, crisp snare and hats: battle and intense.")
