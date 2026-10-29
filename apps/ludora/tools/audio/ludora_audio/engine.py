"""A synthesiser for melodic parts, written in numpy.

It has band-limited oscillators, unison, FM, noise, envelopes, a resonant filter, LFOs and
glide. It is polyphonic, follows velocity and is deterministic. A `Patch` (the
named ones are in patches.py) plays in a Part where a soundfont preset would:

    Part("arp", patches.PLUCK, arp(PROGRESSION, 60, 76, step=0.5), Mix(gain_db=-4))

The synthesised drum kit (kit.py) and the transition sounds (transitions.py)
render through the same machinery: humanised the same way as a soundfont part,
and cached in .cache by a hash of the instrument, the notes and this code, so
a rebuild only renders what changed.

How the sound is made, per note (a "voice"):

- Oscillators read single-cycle tables holding only the harmonics below
  19 kHz for the highest pitch the voice reaches, so nothing folds back
  (aliases) however high the note. A pulse is the difference of two saws,
  so its width can move. FM is a sine carrier phase-modulated by a sine,
  its index capped so the sidebands stay under 19 kHz.
- Unison stacks detuned copies of an oscillator across the stereo field.
- The filter is a state-variable filter (lowpass, bandpass or highpass, 12
  or 24 dB per octave), its cutoff moved every sample by an envelope, the
  note's pitch (key tracking), velocity and LFOs. The per-sample recursion
  runs as a chunked linear scan, so numpy does it without a Python loop per
  sample, and the state carries over smoothly while the cutoff moves.
- The amplitude follows an ADSR envelope scaled by velocity.

Patches marked `mono` play one voice at a time; overlapping notes glide.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import random
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import ClassVar

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt

from .notation import Note
from .render import CACHE, SR

# Harmonics stop below this, so the highest ones never alias however a note bends.
F_LIMIT = 19000.0
TABLE = 8192
# Soundfont parts render at FluidSynth gain 0.6; patch levels are set against that.
REFERENCE_GAIN = 0.6

_HERE = Path(__file__).resolve().parent


# --- Building blocks -------------------------------------------------------


@dataclass(frozen=True)
class Env:
    """An ADSR envelope. Times in seconds; `decay` and `release` are the time to fall about 40 and 60 dB."""

    attack: float = 0.005
    decay: float = 0.3
    sustain: float = 1.0
    release: float = 0.25


@dataclass(frozen=True)
class Osc:
    """One oscillator of a patch.

    wave: saw, square, pulse, triangle, sine, noise or fm.
    octave, semi, cents: offset from the note.
    unison, spread: copies detuned over `spread` cents in total, panned over `width` (0 to 1).
    pw: pulse width, 0.5 is square.
    ratio, index, index_end, index_decay: FM. The modulator runs at `ratio` times the
      note; the index falls from `index` to `index_end` with time constant `index_decay`.
      `index_vel` is how much velocity scales it (harder is brighter). `key_scale` makes
      high notes mellower, as a real bell or bar is: the index halves every 1/key_scale
      octaves above middle C (and grows as much below it).
    decay: if set, this oscillator dies away on its own (time constant, seconds),
      for attack layers such as an FM tine or a breath of noise.
    """

    wave: str = "saw"
    level: float = 1.0
    octave: int = 0
    semi: float = 0.0
    cents: float = 0.0
    unison: int = 1
    spread: float = 0.0
    width: float = 0.0
    pw: float = 0.5
    ratio: float = 1.0
    index: float = 0.0
    index_end: float = 0.0
    index_decay: float = 0.3
    index_vel: float = 0.5
    key_scale: float = 0.0
    decay: float | None = None


@dataclass(frozen=True)
class Filter:
    """A resonant state-variable filter.

    cutoff is in Hz for middle C (with `keytrack` 1 it follows the note an octave per octave).
    res: 0 to 0.95. env_amount: octaves the envelope opens it. vel_amount: octaves per 64
    steps of velocity above or below 100.
    """

    kind: str = "lp"
    cutoff: float = 18000.0
    res: float = 0.0
    slope: int = 12
    env: Env = Env(0.002, 0.3, 0.0, 0.3)
    env_amount: float = 0.0
    keytrack: float = 0.5
    vel_amount: float = 0.0


@dataclass(frozen=True)
class Lfo:
    """A low-frequency oscillator.

    target: pitch (depth in cents), cutoff (octaves), amp (0 to 1) or pw.
    rate: Hz, or beats per cycle with `sync`. delay and fade: seconds after the note
    starts before it begins and how long it takes to reach full depth (vibrato).
    retrigger: the cycle starts with each note; otherwise it follows the song's clock.
    """

    target: str = "pitch"
    rate: float = 5.0
    depth: float = 0.0
    sync: bool = False
    delay: float = 0.0
    fade: float = 0.0
    shape: str = "sine"
    retrigger: bool = True


# --- Shared machinery for everything that renders itself -------------------


def _source_hash() -> str:
    h = hashlib.sha256()
    for name in ("engine.py", "kit.py", "transitions.py"):
        p = _HERE / name
        if p.exists():
            h.update(p.read_bytes())
    return h.hexdigest()


_CODE = _source_hash()


def humanized(notes: list[Note], humanize: float, seed: int) -> list[tuple[float, float, int, int]]:
    """(start, length, pitch, velocity) in beats, nudged exactly as render.part_midi nudges a soundfont part."""
    rng = random.Random(seed)
    nudges = [(rng.uniform(-humanize, humanize), rng.randint(-5, 5)) if humanize else (0.0, 0) for _ in notes]
    out = []
    for n, (jitter, vel_nudge) in zip(notes, nudges):
        out.append((max(0.0, n.start + jitter), n.dur, n.pitch, max(1, min(127, n.vel + vel_nudge))))
    return out


def stable_seed(*parts: object) -> int:
    """A seed from any values, the same in every process (Python's own hash() is not)."""
    return int.from_bytes(hashlib.sha256(repr(parts).encode()).digest()[:4], "little")


class Rendered:
    """Base for instruments that render themselves (patches, the kit, transitions).

    Subclasses are frozen dataclasses and implement `_render(events, bpm, length_beats, seed)`,
    returning float64 stereo audio. This class adds humanising, repeats and the cache.
    """

    drums: ClassVar[bool] = False
    # How much of the mixer's timing nudge to apply (transitions must land exactly).
    humanize_scale: ClassVar[float] = 1.0

    def render(self, notes: list[Note], bpm: float, length_beats: float, repeats: int = 1, humanize: float = 0.0, seed: int = 0, gain: float = REFERENCE_GAIN) -> np.ndarray:
        events = humanized(notes, humanize * self.humanize_scale, seed)
        spec = json.dumps(
            {"kind": type(self).__name__, "self": {k: v for k, v in dataclasses.asdict(self).items() if k != "description"}, "events": events, "bpm": bpm, "length": length_beats, "repeats": repeats, "seed": seed, "gain": gain, "sr": SR, "code": _CODE},
            sort_keys=True,
        )
        key = hashlib.sha256(spec.encode()).hexdigest()[:24]
        CACHE.mkdir(parents=True, exist_ok=True)
        wav = CACHE / f"syn-{key}.wav"
        if wav.exists():
            # Marks the render as still in use; build.py clears out renders nothing used.
            wav.touch()
            audio, sr = sf.read(wav, dtype="float32", always_2d=True)
            assert sr == SR, sr
            return audio
        once = self._render(events, bpm, length_beats, seed) * (gain / REFERENCE_GAIN)
        period = int(round(length_beats * 60.0 / bpm * SR))
        n = max(len(once), period) + (repeats - 1) * period
        out = np.zeros((n, 2))
        for r in range(repeats):
            out[r * period : r * period + len(once)] += once
        audio = out.astype(np.float32)
        tmp = CACHE / f"syn-{key}.{os.getpid()}.tmp.wav"
        sf.write(tmp, audio, SR, subtype="FLOAT")
        tmp.rename(wav)
        return audio

    def _render(self, events: list[tuple[float, float, int, int]], bpm: float, length_beats: float, seed: int) -> np.ndarray:
        raise NotImplementedError


# --- Oscillators -----------------------------------------------------------


@lru_cache(maxsize=None)
def _table(wave: str, harmonics: int) -> np.ndarray:
    """One cycle of a saw or triangle with `harmonics` harmonics, plus a wrap-around sample.

    Every wave's fundamental is in phase with a sine's, so oscillators stacked on one
    pitch and started together (a patch with `retrig`) reinforce instead of cancelling.
    """
    k = np.arange(1, harmonics + 1, dtype=np.float64)
    if wave == "saw":
        # A falling ramp from 1 to -1 (its fundamental is a positive sine).
        amp = 2.0 / (np.pi * k)
    elif wave == "triangle":
        amp = np.where(k % 2 == 1, 8.0 / (np.pi**2 * k**2) * (-1.0) ** ((k - 1) // 2), 0.0)
    else:
        raise ValueError(wave)
    # Ease off the top few harmonics, so the spectrum has no hard edge to ring.
    if harmonics > 8:
        top = np.clip((k / harmonics - 0.8) / 0.2, 0, 1)
        amp = amp * (0.5 + 0.5 * np.cos(np.pi * top))
    spec = np.zeros(TABLE // 2 + 1, dtype=np.complex128)
    spec[1 : harmonics + 1] = -1j * amp * TABLE / 2
    cycle = np.fft.irfft(spec, TABLE)
    return np.append(cycle, cycle[0])


def _harmonics(f_max: float) -> int:
    return int(max(1, min(TABLE // 2 - 1, F_LIMIT // max(f_max, 1.0))))


def _read(table: np.ndarray, phase: np.ndarray) -> np.ndarray:
    x = phase * TABLE
    i = x.astype(np.int64)
    frac = x - i
    a = table[i]
    return a + (table[i + 1] - a) * frac


def phase_of(freq: np.ndarray, start: float = 0.0) -> np.ndarray:
    """Phase in cycles (0 to 1) of an oscillator following `freq` (Hz per sample)."""
    return np.mod(start + np.cumsum(freq) / SR - freq[0] / SR, 1.0)


def bl_wave(wave: str, freq: np.ndarray, phase0: float = 0.0, pw: np.ndarray | float = 0.5) -> np.ndarray:
    """A band-limited oscillator following `freq` (Hz per sample): saw, square, pulse, triangle or sine."""
    ph = phase_of(freq, phase0)
    if wave == "sine":
        return np.sin(2 * np.pi * ph)
    h = _harmonics(float(np.max(freq)))
    if wave == "saw":
        return _read(_table("saw", h), ph)
    if wave == "triangle":
        return _read(_table("triangle", h), ph)
    if wave in ("square", "pulse"):
        saw = _table("saw", h)
        width = 0.5 if wave == "square" else np.clip(pw, 0.03, 0.97)
        return _read(saw, ph) - _read(saw, np.mod(ph + width, 1.0))
    raise ValueError(f"unknown wave {wave!r}")


def midi_hz(pitch: np.ndarray | float) -> np.ndarray | float:
    return 440.0 * 2.0 ** ((np.asarray(pitch, dtype=np.float64) - 69.0) / 12.0)


# --- Filters ---------------------------------------------------------------


def _scan(m11, m12, m21, m22, u1, u2, init1, init2, chunk: int = 64):
    """s[n] = M[n] s[n-1] + u[n] for a 2-element state, from state (init1, init2); u is (N, channels).

    The samples are split into chunks. One Python loop steps through the chunk
    length for all chunks at once, starting each from silence; a doubling scan
    then works out the state each chunk really starts from, and that is added
    back through each chunk's running matrix product. N is kept small (a
    segment), so every array stays in the processor's cache.
    """
    n, ch = u1.shape
    k = -(-n // chunk)
    pad = k * chunk - n

    def blocks(a, fill):
        if pad:
            a = np.concatenate([a, np.full((pad,) + a.shape[1:], fill, dtype=np.float64)])
        return a.reshape((k, chunk) + a.shape[1:])

    a11, a12, a21, a22 = (blocks(m, f)[..., None] for m, f in ((m11, 1.0), (m12, 0.0), (m21, 0.0), (m22, 1.0)))
    b1, b2 = blocks(u1, 0.0), blocks(u2, 0.0)
    s1 = np.empty_like(b1)
    s2 = np.empty_like(b2)
    q11, q12, q21, q22 = (np.empty((k, chunk, 1)) for _ in range(4))
    x1 = np.zeros((k, ch))
    x2 = np.zeros((k, ch))
    p11 = np.ones((k, 1))
    p12 = np.zeros((k, 1))
    p21 = np.zeros((k, 1))
    p22 = np.ones((k, 1))
    for t in range(chunk):
        c11, c12, c21, c22 = a11[:, t], a12[:, t], a21[:, t], a22[:, t]
        y1 = c11 * x1 + c12 * x2 + b1[:, t]
        x2 = c21 * x1 + c22 * x2 + b2[:, t]
        x1 = y1
        s1[:, t] = x1
        s2[:, t] = x2
        p11, p12, p21, p22 = c11 * p11 + c12 * p21, c11 * p12 + c12 * p22, c21 * p11 + c22 * p21, c21 * p12 + c22 * p22
        q11[:, t], q12[:, t], q21[:, t], q22[:, t] = p11, p12, p21, p22
    # The state entering chunk j: e[j] = F[j-1] e[j-1] + L[j-1], e[0] = init. As a doubling scan over
    # affine maps (A, b), with chunk 0's map sending anything to `init`.
    A11 = np.concatenate([np.zeros((1, 1)), q11[:-1, -1]])
    A12 = np.concatenate([np.zeros((1, 1)), q12[:-1, -1]])
    A21 = np.concatenate([np.zeros((1, 1)), q21[:-1, -1]])
    A22 = np.concatenate([np.zeros((1, 1)), q22[:-1, -1]])
    e1 = np.concatenate([np.asarray(init1, dtype=np.float64).reshape(1, ch), s1[:-1, -1]])
    e2 = np.concatenate([np.asarray(init2, dtype=np.float64).reshape(1, ch), s2[:-1, -1]])
    d = 1
    while d < k:
        n1 = A11[d:] * e1[:-d] + A12[d:] * e2[:-d] + e1[d:]
        n2 = A21[d:] * e1[:-d] + A22[d:] * e2[:-d] + e2[d:]
        B11 = A11[d:] * A11[:-d] + A12[d:] * A21[:-d]
        B12 = A11[d:] * A12[:-d] + A12[d:] * A22[:-d]
        B21 = A21[d:] * A11[:-d] + A22[d:] * A21[:-d]
        B22 = A21[d:] * A12[:-d] + A22[d:] * A22[:-d]
        e1 = np.concatenate([e1[:d], n1])
        e2 = np.concatenate([e2[:d], n2])
        A11 = np.concatenate([A11[:d], B11])
        A12 = np.concatenate([A12[:d], B12])
        A21 = np.concatenate([A21[:d], B21])
        A22 = np.concatenate([A22[:d], B22])
        d *= 2
    s1 += q11 * e1[:, None, :] + q12 * e2[:, None, :]
    s2 += q21 * e1[:, None, :] + q22 * e2[:, None, :]
    return s1.reshape(-1, ch)[:n], s2.reshape(-1, ch)[:n]


SEGMENT = 1 << 15


def svf(x: np.ndarray, cutoff: np.ndarray | float, res: float = 0.0, kind: str = "lp", resets: np.ndarray | None = None) -> np.ndarray:
    """A state-variable filter (Simper's trapezoidal form) whose cutoff (Hz) may change every sample.

    x is (samples, channels); `res` 0 to 0.97. `resets` are sample indexes where the
    state starts from silence again, so many voices can be filtered in one pass.
    Because the state is the filter's own integrators, moving the cutoff does not click.
    """
    x = np.asarray(x, dtype=np.float64)
    squeeze = x.ndim == 1
    if squeeze:
        x = x[:, None]
    n, ch = x.shape
    fc_all = np.broadcast_to(np.clip(np.asarray(cutoff, dtype=np.float64), 10.0, 0.45 * SR), (n,))
    k = 2.0 - 2.0 * min(max(res, 0.0), 0.97)
    reset = np.zeros(n, dtype=bool)
    if resets is not None and len(resets):
        reset[np.asarray(resets)] = True
    out = np.empty_like(x)
    st1 = np.zeros(ch)
    st2 = np.zeros(ch)
    for a in range(0, n, SEGMENT):
        b = min(n, a + SEGMENT)
        xs = x[a:b]
        g = np.tan(np.pi * fc_all[a:b] / SR)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        m11 = 2 * a1 - 1
        m12 = -2 * a2
        m21 = 2 * a2
        m22 = 1 - 2 * a3
        r = reset[a:b]
        if r.any():
            for m in (m11, m12, m21, m22):
                m[r] = 0.0
        s1, s2 = _scan(m11, m12, m21, m22, (2 * a2)[:, None] * xs, (2 * a3)[:, None] * xs, st1, st2)
        # The outputs at each sample come from the state before it.
        p1 = np.concatenate([st1[None], s1[:-1]])
        p2 = np.concatenate([st2[None], s2[:-1]])
        if r.any():
            p1[r] = 0.0
            p2[r] = 0.0
        st1, st2 = s1[-1], s2[-1]
        v1 = a1[:, None] * p1 - a2[:, None] * p2 + a2[:, None] * xs
        v2 = a2[:, None] * p1 + (1 - a3)[:, None] * p2 + a3[:, None] * xs
        if kind == "lp":
            out[a:b] = v2
        elif kind == "bp":
            out[a:b] = v1 * k
        elif kind == "hp":
            out[a:b] = xs - k * v1 - v2
        else:
            raise ValueError(kind)
    return out[:, 0] if squeeze else out


def butter_filter(x: np.ndarray, kind: str, freq, order: int = 2) -> np.ndarray:
    """A fixed Butterworth filter (low, high or band) along the first axis."""
    if kind == "band":
        lo, hi = freq
        freq = [max(15.0, lo), min(0.45 * SR, hi)]
    else:
        freq = min(max(15.0, freq), 0.45 * SR)
    sos = butter(order, freq, btype={"low": "lowpass", "high": "highpass", "band": "bandpass"}[kind], fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def mono_below(x: np.ndarray, freq: float = 120.0) -> np.ndarray:
    """Removes the stereo difference below `freq` Hz (zero phase), so the lows are mono and the rest untouched."""
    mid = (x[:, 0] + x[:, 1]) / 2
    side = (x[:, 0] - x[:, 1]) / 2
    sos = butter(2, freq, btype="highpass", fs=SR, output="sos")
    side = sosfiltfilt(sos, side)
    return np.stack([mid + side, mid - side], axis=1).astype(x.dtype)


def chorus(x: np.ndarray, mix: float, rate: float = 0.5, depth_ms: float = 2.4, base_ms: float = 11.0) -> np.ndarray:
    """A stereo chorus: two delays swaying a quarter cycle apart, the wet signal above 220 Hz only."""
    n = len(x)
    t = np.arange(n) / SR
    mono = x.mean(axis=1)
    out = np.array(x, dtype=np.float64)
    for c, phase in ((0, 0.0), (1, np.pi / 2)):
        d = (base_ms + depth_ms * np.sin(2 * np.pi * rate * t + phase)) * SR / 1000.0
        pos = np.arange(n) - d
        i = np.floor(pos).astype(np.int64)
        frac = pos - i
        ok = i >= 0
        i = np.clip(i, 0, n - 2)
        wet = np.where(ok, mono[i] * (1 - frac) + mono[i + 1] * frac, 0.0)
        out[:, c] += mix * butter_filter(wet, "high", 220.0)
    return out / (1.0 + 0.35 * mix)


def soft_clip(x: np.ndarray, drive: float) -> np.ndarray:
    """A cubic saturator: it adds only third harmonics, so it cannot alias much. drive 0 to 1."""
    if drive <= 0:
        return x
    gain = 1.0 + 3.0 * drive
    y = np.clip(x * gain, -1.0, 1.0)
    return (y - y**3 / 3.0) * (1.5 / gain)


def pan_gains(position: float) -> tuple[float, float]:
    angle = (position + 1) * np.pi / 4
    return float(np.cos(angle) * np.sqrt(2)), float(np.sin(angle) * np.sqrt(2))


# --- Envelopes and LFOs -----------------------------------------------------


def envelope(env: Env, n: int, segments: list[tuple[int, int]]) -> np.ndarray:
    """An ADSR envelope over n samples, ending at exactly zero.

    `segments` are (trigger, gate off) sample pairs, the first triggered at 0. Each
    trigger restarts the attack from wherever the envelope is (as an analogue
    envelope does), so a key played again while it still sounds has no dip.
    """
    a0 = max(env.attack, 1e-4)
    d = max(env.decay, 1e-4)
    r = max(env.release, 2e-3)
    s = env.sustain
    out = np.zeros(n)
    level = 0.0
    for i, (start, gate_off) in enumerate(segments):
        end = segments[i + 1][0] if i + 1 < len(segments) else n
        tt = np.arange(end - start + 1) / SR
        a = max(a0 * (1.0 - level), 1e-4)
        x = np.clip(tt / a, 0.0, 1.0)
        rise = level + (1.0 - level) * (1 - np.exp(-3 * x)) / (1 - np.exp(-3))
        fall = s + (1 - s) * np.exp(-np.maximum(tt - a, 0.0) * 4.6 / d)
        held = np.where(tt < a, rise, fall)
        g = max(0, gate_off - start)
        at_off = held[min(g, len(held) - 1)]
        seg = np.where(np.arange(len(tt)) < g, held, at_off * np.exp(-np.maximum(tt - g / SR, 0.0) * 6.9 / r))
        out[start:end] = seg[:-1]
        level = float(seg[-1])
    tail = min(n, int(0.003 * SR))
    if tail:
        out[n - tail :] *= np.linspace(1.0, 0.0, tail)
    return out


def adsr(env: Env, n: int, gate: int) -> np.ndarray:
    """The envelope over n samples for one note held `gate` samples."""
    return envelope(env, n, [(0, gate)])


def lfo_wave(lfo: Lfo, t_note: np.ndarray, t_song: np.ndarray, bpm: float) -> np.ndarray:
    hz = (bpm / 60.0) / lfo.rate if lfo.sync else lfo.rate
    tt = t_note if lfo.retrigger else t_song
    ph = hz * tt
    if lfo.shape == "triangle":
        w = 4 * np.abs(ph - np.floor(ph + 0.5)) - 1
    else:
        w = np.sin(2 * np.pi * ph)
    if lfo.delay or lfo.fade:
        w = w * np.clip((t_note - lfo.delay) / max(lfo.fade, 1e-3), 0.0, 1.0)
    return w * lfo.depth


# --- Patches -----------------------------------------------------------------

# Relative detunes of a seven-voice supersaw: uneven, so the beating never lines up.
_SUPERSAW = np.array([-0.11002313, -0.06288439, -0.01952356, 0.0, 0.01991221, 0.06216538, 0.10745242]) / 0.11002313


def _unison(count: int) -> tuple[np.ndarray, np.ndarray]:
    """Detune positions (-1 to 1) and pan positions (-1 to 1) for `count` stacked copies."""
    if count == 1:
        return np.zeros(1), np.zeros(1)
    det = _SUPERSAW if count == 7 else np.linspace(-1, 1, count) * (1 + 0.07 * np.sin(np.arange(count) * 2.1))
    # Alternate sides, so neighbouring detunes do not sit next to each other.
    order = np.argsort(det)
    pans = np.zeros(count)
    spots = np.linspace(-1, 1, count)
    interleaved = np.concatenate([spots[0::2], spots[1::2][::-1]])
    pans[order] = interleaved
    return det, pans


@dataclass(frozen=True)
class Voice:
    """One continuous run of sound: a note, or several that share the voice.

    notes are (offset, gate off, pitch, velocity, retrigger) in samples from `start`.
    A retriggered note restarts the envelopes from where they are; one that is not
    (a legato note on a mono patch) glides to its pitch under the same envelope.
    """

    start: int
    length: int
    notes: tuple[tuple[int, int, int, int, bool], ...]
    index: int
    cut: bool = False

    def segments(self) -> list[tuple[int, int]]:
        """(trigger, gate off) for the envelopes: legato notes extend the gate instead of retriggering."""
        out: list[list[int]] = []
        for offset, gate_off, _, _, retrigger in self.notes:
            if retrigger or not out:
                out.append([offset, gate_off])
            else:
                out[-1][1] = gate_off
        return [(a, b) for a, b in out]


@dataclass(frozen=True)
class Patch(Rendered):
    """A synth sound. See patches.py for the named ones and what each is for."""

    name: str
    oscs: tuple[Osc, ...]
    amp: Env = Env()
    filter: Filter | None = None
    lfos: tuple[Lfo, ...] = ()
    # 0: velocity leaves the level alone; 1: velocity 50 is 6 dB under velocity 100.
    vel_amp: float = 0.5
    # A pitch drop at the start of each note: (semitones, time constant in seconds).
    pitch_env: tuple[float, float] = (0.0, 0.03)
    # Level per octave above middle C, in dB (negative keeps high notes from poking out).
    key_level: float = 0.0
    mono: bool = False
    glide: float = 0.0
    voices: int = 24
    # Oscillators restart at the same phase for every note (punchy basses and plucks); otherwise free.
    retrig: bool = False
    drive: float = 0.0
    chorus: float = 0.0
    width: float = 1.0
    # Below this many Hz the patch is mono (0 leaves it alone).
    mono_below: float = 0.0
    # Output trim in dB, so every patch sits near a soundfont preset's level at velocity 100.
    level: float = 0.0
    description: str = field(default="", compare=False)

    def tweak(self, **changes) -> "Patch":
        """A copy with some settings changed. Besides the Patch's own fields: cutoff, res,
        env_amount (filter); attack, decay, sustain, release (amplitude envelope)."""
        amp = {k: changes.pop(k) for k in ("attack", "decay", "sustain", "release") if k in changes}
        flt = {k: changes.pop(k) for k in ("cutoff", "res", "env_amount", "keytrack") if k in changes}
        out = dataclasses.replace(self, **changes)
        if amp:
            out = dataclasses.replace(out, amp=dataclasses.replace(out.amp, **amp))
        if flt:
            if out.filter is None:
                raise ValueError(f"{self.name} has no filter")
            out = dataclasses.replace(out, filter=dataclasses.replace(out.filter, **flt))
        return out

    # Voice allocation.

    def _voices(self, events, bpm: float) -> list[Voice]:
        """Notes into voices.

        Poly: a key played again while its last voice still sounds (held or releasing)
        continues that voice; past the voice limit the oldest voice is cut. Mono: one
        voice at a time; a note that overlaps the one before is legato (glides, no
        retrigger), a note that comes during a release retriggers from where it is.
        """
        spb = 60.0 / bpm
        notes = sorted(((round(s * spb * SR), max(1, round(d * spb * SR)), p, v) for s, d, p, v in events), key=lambda e: (e[0], e[2]))
        release = int(round(self.amp.release * SR))
        if self.filter is not None:
            release = max(release, int(round(min(self.filter.env.release, self.amp.release * 2) * SR)))
        fade = int(0.012 * SR)
        slack = int(0.002 * SR)
        # Each voice while being built: [start, [notes in absolute samples], end including release].
        building: list[list] = []
        for start, dur, pitch, vel in notes:
            gate_off = start + dur
            if self.mono:
                cur = building[-1] if building else None
                if cur and start < cur[2]:
                    last = cur[1][-1]
                    legato = start < last[1] - slack
                    if legato:
                        last[1] = start
                    cur[1].append([start, gate_off, pitch, vel, not legato])
                    cur[2] = max(cur[2], gate_off + release)
                else:
                    building.append([start, [[start, gate_off, pitch, vel, True]], gate_off + release, False])
                continue
            same = next((v for v in building if v[1][0][2] == pitch and v[2] > start and not v[3]), None)
            if same is not None:
                last = same[1][-1]
                last[1] = min(last[1], start)
                same[1].append([start, gate_off, pitch, vel, True])
                same[2] = max(same[2], gate_off + release)
                continue
            alive = [v for v in building if v[2] > start and not v[3]]
            while len(alive) >= self.voices:
                oldest = alive.pop(0)
                oldest[2] = start + fade
                oldest[3] = True
                for nt in oldest[1]:
                    nt[1] = min(nt[1], start)
            building.append([start, [[start, gate_off, pitch, vel, True]], gate_off + release, False])
        voices = []
        for i, (start, ns, end, cut) in enumerate(building):
            rel = tuple((s - start, max(s - start + 1, g - start), p, v, r) for s, g, p, v, r in ns)
            voices.append(Voice(start, max(1, end - start), rel, i, cut))
        return voices

    def _render(self, events, bpm: float, length_beats: float, seed: int) -> np.ndarray:
        voices = self._voices(events, bpm)
        end = max([v.start + v.length for v in voices] + [int(round(length_beats * 60.0 / bpm * SR))]) + 1
        out = np.zeros((end, 2))
        base_seed = stable_seed(self.name, seed)
        # Voices go through the filter in batches, concatenated, with the state reset at each.
        batch: list[tuple[Voice, np.ndarray, np.ndarray, np.ndarray]] = []
        size = 0
        for v in voices:
            raw, cutoff, post = self._voice(v, bpm, base_seed)
            batch.append((v, raw, cutoff, post))
            size += len(raw)
            if size > 1 << 20:
                self._flush(batch, out)
                batch, size = [], 0
        if batch:
            self._flush(batch, out)
        if self.chorus > 0:
            out = chorus(out, self.chorus)
        if self.width != 1.0:
            mid = out.mean(axis=1, keepdims=True)
            out = mid + (out - mid) * self.width
        if self.mono_below > 0:
            out = mono_below(out, self.mono_below)
        # FM at simple ratios puts a sideband on 0 Hz; drive and pulse-width changes can leave an offset too.
        out = butter_filter(out, "high", 16.0)
        return out * 10 ** (self.level / 20)

    def _flush(self, batch, out: np.ndarray) -> None:
        raw = np.concatenate([b[1] for b in batch])
        if self.filter is not None:
            cutoff = np.concatenate([b[2] for b in batch])
            starts = np.cumsum([0] + [len(b[1]) for b in batch[:-1]])
            f = self.filter
            if f.slope == 24:
                raw = svf(raw, cutoff, 0.29, f.kind, starts)
            raw = svf(raw, cutoff, f.res, f.kind, starts)
        at = 0
        for v, r, _, post in batch:
            seg = raw[at : at + len(r)]
            at += len(r)
            seg = soft_clip(seg, self.drive) * post[:, None]
            out[v.start : v.start + len(seg)] += seg

    def _voice(self, v: Voice, bpm: float, base_seed: int):
        """One voice before the filter: (stereo signal, cutoff per sample, gain after the filter)."""
        n = v.length
        t = np.arange(n) / SR
        t_song = t + v.start / SR
        rng = np.random.default_rng([base_seed, v.index])
        segments = v.segments()
        # Time since the latest trigger: envelopes inside oscillators, the onset drop and vibrato restart there.
        t_trig = t.copy()
        for trig, _ in segments[1:]:
            if trig < n:
                t_trig[trig:] = t[trig:] - t[trig]
        # Pitch: a step per note, gliding into legato notes; the onset drop; pitch LFOs.
        first = v.notes[0]
        pitch = np.full(n, float(first[2]))
        vel_curve = np.full(n, float(first[3]))
        if len(v.notes) > 1:
            tau = max(self.glide / 3.0, 1e-4)
            for offset, _, p1, vel1, retrigger in v.notes[1:]:
                if offset >= n:
                    break
                current = pitch[offset - 1] if offset > 0 else p1
                if self.glide > 0 and not retrigger:
                    pitch[offset:] = p1 + (current - p1) * np.exp(-(t[offset:] - t[offset]) / tau)
                else:
                    pitch[offset:] = p1
                vel_curve[offset:] = vel1
            k = max(1, int(0.005 * SR))
            vel_curve = np.convolve(np.pad(vel_curve, (k, k), mode="edge"), np.ones(k) / k, mode="same")[k:-k]
        if self.pitch_env[0]:
            pitch = pitch + self.pitch_env[0] * np.exp(-t_trig / max(self.pitch_env[1], 1e-4))
        cutoff_lfo = np.zeros(n)
        amp_lfo = np.ones(n)
        pw_lfo = np.zeros(n)
        for lfo in self.lfos:
            w = lfo_wave(lfo, t_trig, t_song, bpm)
            if lfo.target == "pitch":
                pitch = pitch + w / 100.0
            elif lfo.target == "cutoff":
                cutoff_lfo += w
            elif lfo.target == "amp":
                amp_lfo *= 1.0 - (0.5 + 0.5 * w / max(lfo.depth, 1e-9)) * lfo.depth
            elif lfo.target == "pw":
                pw_lfo += w
        signal = np.zeros((n, 2))
        for osc in self.oscs:
            offset = 12 * osc.octave + osc.semi + osc.cents / 100.0
            f = midi_hz(pitch + offset)
            amp = np.full(n, osc.level)
            if osc.decay:
                amp = amp * np.exp(-t_trig / osc.decay)
            if osc.wave == "noise":
                noise = rng.standard_normal((n, 2)) * 0.5
                noise[:, 1] = noise[:, 1] * 0.3 + noise[:, 0] * 0.7
                signal += noise * amp[:, None]
                continue
            dets, pans = _unison(osc.unison)
            gain = 1.0 / np.sqrt(osc.unison)
            for u, (det, pos) in enumerate(zip(dets, pans)):
                fu = f * 2.0 ** (det * osc.spread / 2.0 / 1200.0)
                # Retriggered: every oscillator starts each note at phase 0, so those on one pitch add up;
                # only unison copies are spread. Otherwise each starts wherever chance puts it.
                phase0 = ((u * 0.618034) % 1.0) if self.retrig else float(rng.random())
                if osc.wave == "fm":
                    fm = fu * osc.ratio
                    peak_c, peak_m = float(fu.max()), float(fm.max())
                    cap = max(0.0, (F_LIMIT - peak_c) / max(peak_m, 1.0) - 1.0)
                    index = (osc.index_end + (osc.index - osc.index_end) * np.exp(-t_trig / max(osc.index_decay, 1e-4))) * ((1 - osc.index_vel) + osc.index_vel * vel_curve / 100.0)
                    if osc.key_scale:
                        index = index * 2.0 ** (-osc.key_scale * (pitch - 60.0) / 12.0)
                    index = np.minimum(index, cap)
                    # Both operators start at zero, so the note starts from silence without a click.
                    mod = np.sin(2 * np.pi * phase_of(fm, 0.0))
                    wave = np.sin(2 * np.pi * phase_of(fu, 0.0) + index * mod)
                else:
                    wave = bl_wave(osc.wave, fu, phase0, osc.pw + pw_lfo)
                lg, rg = pan_gains(pos * osc.width)
                w = wave * amp * (gain * (1.0 if det == 0 or osc.unison < 3 else 0.85))
                signal[:, 0] += w * lg
                signal[:, 1] += w * rg
        # Velocity and envelopes.
        vel_gain = (vel_curve / 100.0) ** (2 * self.vel_amp)
        env = envelope(self.amp, n, segments)
        if v.cut:
            fade = min(n, int(0.012 * SR))
            env[n - fade :] *= np.linspace(1.0, 0.0, fade)
        post = env * vel_gain * amp_lfo
        if self.key_level:
            post = post * 10.0 ** (self.key_level * (pitch - 60.0) / 12.0 / 20.0)
        cutoff = None
        if self.filter is not None:
            fl = self.filter
            fenv = envelope(fl.env, n, segments)
            octaves = fl.keytrack * (pitch - 60.0) / 12.0 + fl.env_amount * fenv + fl.vel_amount * (vel_curve - 100.0) / 64.0 + cutoff_lfo
            cutoff = fl.cutoff * 2.0**octaves
        return signal, cutoff if cutoff is not None else np.zeros(0), post
