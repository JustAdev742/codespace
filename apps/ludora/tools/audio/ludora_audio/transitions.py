"""Transition sounds for songs: risers, downlifters, impacts, reverse swells and filtered sweeps.

Each one is an instrument and plays in a Part. A note says where it sits and
how long it lasts, its pitch tunes the tonal part (the riser's rising tone, the
impact's boom, the swell's chord) and its velocity sets how strong it is. A
riser, swell or upward sweep ends where its note ends, on the bar line it leads
into; an impact, downlifter or downward sweep starts where its note starts.

    from ..transitions import IMPACT, RISER, at, into
    Part("riser", RISER, [into(8, beats=8, pitch="f3")], Mix(gain_db=-8, reverb=0.3))
    Part("impact", IMPACT, [at(8, beats=4, pitch="f1")], Mix(gain_db=-6, reverb=0.2))

Bars count from 0, as in the tracks (bar 8 starts on beat 32). Transitions are
never humanised: they have to land on the bar line.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar

import numpy as np

from .engine import Rendered, bl_wave, butter_filter, midi_hz, stable_seed, svf
from .notation import Note, midi
from .render import SR


def into(bar: float, beats: float = 4, pitch: str | int = "c3", vel: int = 100, beats_per_bar: int = 4) -> Note:
    """A note that ends on the downbeat of `bar`: for a riser, swell or upward sweep.

    One leading into the top of a loop goes at its end (`into(16)` in a 16-bar song):
    the mixer's repeats carry it over the seam.
    """
    p = midi(pitch) if isinstance(pitch, str) else pitch
    start = bar * beats_per_bar - beats
    if start < 0:
        raise ValueError(f"into({bar}, beats={beats}) would start before the song does; to lead into the top of a loop, end it on the loop's last bar line instead")
    return Note(start, beats, p, vel)


def at(bar: float, beats: float = 4, pitch: str | int = "c2", vel: int = 100, beats_per_bar: int = 4) -> Note:
    """A note that starts on the downbeat of `bar`: for an impact, downlifter or downward sweep."""
    p = midi(pitch) if isinstance(pitch, str) else pitch
    return Note(bar * beats_per_bar, beats, p, vel)


def _t(seconds: float) -> np.ndarray:
    return np.arange(max(1, int(round(seconds * SR)))) / SR


def _fades(x: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    n = len(x)
    a, b = min(n, max(1, int(fade_in * SR))), min(n, max(1, int(fade_out * SR)))
    x = x.copy()
    x[:a] *= np.linspace(0, 1, a)[:, None]
    x[n - b :] *= np.linspace(1, 0, b)[:, None]
    return x


def _noise2(rng, n: int, correlation: np.ndarray | float) -> np.ndarray:
    """Stereo noise whose channels are `correlation` alike (1 mono, 0 fully wide)."""
    a, b = rng.standard_normal(n), rng.standard_normal(n)
    c = np.clip(correlation, 0, 1)
    return np.stack([a, c * a + np.sqrt(1 - c**2) * b], axis=1)


def _saws(freq: np.ndarray, rng, voices: int = 3, cents: float = 18) -> np.ndarray:
    """Detuned band-limited saws, spread left to right."""
    n = len(freq)
    out = np.zeros((n, 2))
    for d in np.linspace(-1, 1, voices):
        w = bl_wave("saw", freq * 2 ** (d * cents / 2 / 1200), rng.random())
        pos = d * 0.7
        out[:, 0] += w * np.cos((pos + 1) * np.pi / 4)
        out[:, 1] += w * np.sin((pos + 1) * np.pi / 4)
    return out / np.sqrt(voices)


@dataclass(frozen=True)
class Transition(Rendered):
    """One kind of transition sound.

    `tone` sets the riser's, downlifter's and swell's mix: 0 is all noise, 1 mostly the pitched layer.
    `bright` scales the filters; `width` the stereo spread (0 mono).
    """

    kind: str
    tone: float = 0.4
    bright: float = 1.0
    width: float = 1.0
    # Output trim in dB: each kind measures about -24 LUFS over a two-bar note at velocity 100.
    level: float = 0.0
    description: str = field(default="", compare=False)

    humanize_scale: ClassVar[float] = 0.0

    def _render(self, events, bpm: float, length_beats: float, seed: int) -> np.ndarray:
        spb = 60.0 / bpm
        clips = []
        for k, (start, dur, pitch, vel) in enumerate(events):
            rng = np.random.default_rng(stable_seed(self.kind, seed, k))
            make = {"riser": self._riser, "downlifter": self._downlifter, "impact": self._impact, "swell": self._swell, "sweep_up": self._sweep, "sweep_down": self._sweep}[self.kind]
            x = make(max(0.05, dur * spb), pitch, rng)
            if self.width != 1.0:
                mid = x.mean(axis=1, keepdims=True)
                x = mid + (x - mid) * self.width
            clips.append((int(round(start * spb * SR)), x * (vel / 100.0) ** 1.5 * 10 ** (self.level / 20)))
        end = max([s + len(x) for s, x in clips] + [int(round(length_beats * spb * SR))]) + 1
        out = np.zeros((end, 2))
        for s, x in clips:
            out[s : s + len(x)] += x
        return out

    def _riser(self, dur: float, pitch: int, rng) -> np.ndarray:
        t = _t(dur)
        n = len(t)
        x = t / dur
        noise = _noise2(rng, n, 0.7 - 0.6 * x)
        centre = 300 * (9000 * self.bright / 300) ** (x**1.5)
        # A resonant band climbing through the noise, over a thinner wash that loses its lows as it goes.
        band = svf(noise, centre, 0.82, "bp")
        wash = svf(noise, 120 * (2500 / 120) ** (x**2), 0.0, "hp") * 0.25
        noise = band + wash
        tone = _saws(midi_hz(pitch + 12 * x**1.7), rng)
        tone = svf(tone, 500 * (10000 * self.bright / 500) ** (x**1.3), 0.3, "lp")
        out = noise * (1 - 0.6 * self.tone) * 1.6 + tone * self.tone
        out *= (0.06 + 0.94 * x**2.2)[:, None]
        return _fades(out * 0.5, 0.05, 0.004)

    def _downlifter(self, dur: float, pitch: int, rng) -> np.ndarray:
        t = _t(dur)
        n = len(t)
        x = t / dur
        noise = _noise2(rng, n, 0.2 + 0.6 * x)
        centre = 8000 * self.bright * (250 / (8000 * self.bright)) ** (x**0.7)
        noise = svf(noise, centre, 0.78, "bp") + svf(noise, centre * 0.5, 0.0, "lp") * 0.2
        tone = _saws(midi_hz(pitch + 12 - 24 * x**0.8), rng)
        tone = svf(tone, 6000 * self.bright * (300 / (6000 * self.bright)) ** (x**0.6), 0.2, "lp")
        out = noise * (1 - 0.6 * self.tone) * 1.6 + tone * self.tone
        out *= ((1 - x) ** 2.2)[:, None]
        return _fades(out * 0.5, 0.003, 0.01)

    def _impact(self, dur: float, pitch: int, rng) -> np.ndarray:
        dur = max(dur, 0.6)
        t = _t(dur)
        n = len(t)
        f0 = float(midi_hz(pitch))
        # Every layer has died away by the end of the note, so nothing is cut off.
        tail = min(0.3 + 0.2 * dur, dur / 6)
        # The boom falls two octaves onto the note; saturation gives it harmonics small speakers can play.
        freq = f0 + 3 * f0 * np.exp(-t / 0.045)
        boom = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / tail)
        boom = np.tanh(boom * 2.2) / np.tanh(2.2)
        # The body: a drum-like thump two octaves up, for the punch in the mids.
        body_f = 4 * f0 * (1 + 0.8 * np.exp(-t / 0.02))
        body = np.sin(2 * np.pi * np.cumsum(body_f) / SR) * np.exp(-t / 0.09) * 0.45
        crack = butter_filter(rng.standard_normal(n), "band", (900, 7000 * self.bright)) * np.exp(-t / 0.025) * 0.5
        rumble = butter_filter(_noise2(rng, n, 0.3), "low", 260) * np.exp(-t / tail)[:, None] * 1.6
        shimmer = butter_filter(_noise2(rng, n, 0.1), "high", 4000 * self.bright) * np.exp(-t / (dur / 6))[:, None] * 0.12
        out = (boom + body + crack)[:, None] * np.ones((1, 2)) + rumble + shimmer
        return _fades(out * 0.55, 0.0005, 0.2 * dur)

    def _swell(self, dur: float, pitch: int, rng) -> np.ndarray:
        """A decaying chord and cymbal wash, played backwards, so it grows into the bar line."""
        t = _t(dur)
        n = len(t)
        decay = np.exp(-t / (0.2 * dur))
        chord = np.zeros((n, 2))
        for semis in (0, 7, 12, 19, 24):
            chord += _saws(np.full(n, float(midi_hz(pitch + semis))), rng, voices=2, cents=12)
        chord = butter_filter(chord, "low", 2600 * self.bright) / 3.0
        wash = butter_filter(_noise2(rng, n, 0.15), "high", 3500 * self.bright) * 0.5
        forward = (chord * self.tone + wash * (1 - 0.5 * self.tone)) * decay[:, None]
        return _fades(forward[::-1] * 0.5, 0.02, 0.004)

    def _sweep(self, dur: float, pitch: int, rng) -> np.ndarray:
        t = _t(dur)
        n = len(t)
        x = t / dur if self.kind == "sweep_up" else 1 - t / dur
        lo, hi = 150.0, 12000.0 * self.bright
        noise = _noise2(rng, n, 0.25)
        out = np.zeros((n, 2))
        for c, skew in ((0, 0.95), (1, 1.05)):
            cutoff = lo * (hi / lo) ** x * skew
            out[:, c] = svf(noise[:, c], cutoff, 0.86, "bp") + svf(noise[:, c], cutoff, 0.0, "lp") * 0.15
        env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.6
        return _fades(out * env[:, None] * 0.45, 0.01, 0.01)


RISER = Transition("riser", level=-13.5, description="Noise and a detuned saw climbing together to the bar line, opening as they go.")
DOWNLIFTER = Transition("downlifter", level=-10.5, description="A falling, darkening whoosh after a big moment, letting the energy out.")
IMPACT = Transition("impact", level=-8.9, description="A boom on the downbeat: a tuned sub drop, a crack and a rumbling tail.")
REVERSE_SWELL = Transition("swell", tone=0.6, level=-6.8, description="A chord and cymbal wash played backwards, swelling into the bar line.")
SWEEP_UP = Transition("sweep_up", level=-7.1, description="Noise through a resonant filter rising: a lighter lift into a new section.")
SWEEP_DOWN = Transition("sweep_down", level=-7.2, description="The same falling: a section winding down.")
