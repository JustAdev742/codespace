"""Music as data, and a compact notation for writing it by hand.

A song is a set of parts; a part is an instrument, its notes and how it sits in
the mix. Times are in beats from the start of the loop. The helpers here turn
short strings into notes, so a melody reads like a score:

    melody("d5:4 e5:2 f#5:2 | a5:8 r:8")

Each token is a pitch (or `r` for a rest, or `[d4,f#4,a4]` for a chord) and a
length in sixteenth notes. `!` after a token accents it, `?` softens it. Bar
lines are only for the reader.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

NOTE_INDEX = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}

# General MIDI drum notes, by the names the patterns use.
DRUM = {
    "kick": 36,
    "kick2": 35,
    "rim": 37,
    "snare": 38,
    "clap": 39,
    "snare2": 40,
    "tom_lo": 45,
    "tom_mid": 47,
    "tom_hi": 50,
    "hat": 42,
    "pedal": 44,
    "open": 46,
    "crash": 49,
    "ride": 51,
    "bell": 53,
    "tamb": 54,
    "splash": 55,
    "cowbell": 56,
    "crash2": 57,
    "bongo_hi": 60,
    "bongo_lo": 61,
    "conga_mute": 62,
    "conga_hi": 63,
    "conga_lo": 64,
    "timbale": 65,
    "agogo": 67,
    "cabasa": 69,
    "shaker": 70,
    "whistle": 72,
    "guiro": 74,
    "claves": 75,
    "block_hi": 76,
    "block_lo": 77,
    "triangle_mute": 80,
    "triangle": 81,
}


def midi(name: str) -> int:
    """'c4' is 60 (middle C), 'f#5' is 78, 'bb3' is 58."""
    m = re.fullmatch(r"([a-gA-G])([#b]?)(-?\d)", name.strip())
    if not m:
        raise ValueError(f"not a note name: {name!r}")
    letter, accidental, octave = m.groups()
    n = NOTE_INDEX[letter.lower()] + (1 if accidental == "#" else -1 if accidental == "b" else 0)
    return 12 * (int(octave) + 1) + n


@dataclass
class Note:
    start: float  # beats from the start of the loop
    dur: float  # beats
    pitch: int
    vel: int = 96


@dataclass(frozen=True)
class Instrument:
    """A soundfont preset. Drum kits live in bank 128 and play on the drum channel."""

    bank: int
    preset: int
    drums: bool = False


@dataclass
class Mix:
    """How a part sits in the mix. Gains in dB, frequencies in Hz, pan from -1 (left) to 1 (right)."""

    gain_db: float = 0.0
    pan: float = 0.0
    highpass: float | None = None
    lowpass: float | None = None
    # Extra EQ bands: ("low_shelf" | "high_shelf" | "peak", frequency, gain_db, q).
    eq: list[tuple[str, float, float, float]] = field(default_factory=list)
    # Compression: (threshold_db, ratio).
    comp: tuple[float, float] | None = None
    reverb: float = 0.15
    delay: float = 0.0
    # How far the part dips under the kick drum, 0 to 1.
    duck: float = 0.0
    # Stereo width: 0 makes the part mono, 1 leaves it as rendered.
    width: float = 1.0


@dataclass
class Part:
    name: str
    instrument: Instrument
    notes: list[Note]
    mix: Mix = field(default_factory=Mix)


@dataclass
class Song:
    id: str
    title: str
    bpm: float
    bars: int
    parts: list[Part]
    beats_per_bar: int = 4
    reverb_seconds: float = 1.8
    # Loudness of the finished loop.
    target_lufs: float = -16.0
    # Gain on the shared reverb's return, in dB.
    reverb_db: float = -4.0
    delay_beats: float = 0.75

    @property
    def beats(self) -> float:
        return self.bars * self.beats_per_bar

    @property
    def seconds(self) -> float:
        return self.beats * 60.0 / self.bpm


SIXTEENTH = 0.25

_TOKEN = re.compile(r"^(\[[^\]]+\]|r|[a-gA-G][#b]?-?\d):(\d+(?:\.\d+)?)([!?]?)$")


def melody(text: str, start: float = 0.0, vel: int = 92, transpose: int = 0, legato: float = 0.95) -> list[Note]:
    """Notes from the compact notation, beginning at beat `start`."""
    notes: list[Note] = []
    t = start
    for token in text.replace("|", " ").split():
        m = _TOKEN.match(token)
        if not m:
            raise ValueError(f"bad token {token!r} in {text!r}")
        pitch_text, length_text, mark = m.groups()
        length = float(length_text) * SIXTEENTH
        v = vel + (14 if mark == "!" else -18 if mark == "?" else 0)
        if pitch_text != "r":
            pitches = [midi(p) for p in pitch_text.strip("[]").split(",")] if pitch_text.startswith("[") else [midi(pitch_text)]
            for p in pitches:
                notes.append(Note(t, length * legato, p + transpose, max(1, min(127, v))))
        t += length
    return notes


def length_of(text: str) -> float:
    """How many beats a notation string lasts."""
    total = 0.0
    for token in text.replace("|", " ").split():
        m = _TOKEN.match(token)
        if not m:
            raise ValueError(f"bad token {token!r}")
        total += float(m.group(2)) * SIXTEENTH
    return total


def drums(patterns: dict[str, str], start: float = 0.0, vel: int = 96, step: float = SIXTEENTH) -> list[Note]:
    """Drum hits from step patterns: 'x' a hit, 'X' an accent, 'o' a ghost note, '.' nothing."""
    notes: list[Note] = []
    for name, pattern in patterns.items():
        pitch = DRUM[name]
        steps = pattern.replace(" ", "").replace("|", "")
        for i, ch in enumerate(steps):
            if ch == ".":
                continue
            v = {"x": vel, "X": min(127, vel + 22), "o": max(1, vel - 40)}[ch]
            notes.append(Note(start + i * step, step * 0.9, pitch, v))
    return notes


def shift(notes: list[Note], beats: float) -> list[Note]:
    return [Note(n.start + beats, n.dur, n.pitch, n.vel) for n in notes]


def repeat(notes: list[Note], every: float, times: int) -> list[Note]:
    out: list[Note] = []
    for i in range(times):
        out += shift(notes, every * i)
    return out


def chord_notes(pitches: list[str], start: float, dur: float, vel: int = 80, strum: float = 0.0) -> list[Note]:
    """A chord held for `dur` beats, optionally strummed upward by `strum` beats per note."""
    return [Note(start + i * strum, dur - i * strum, midi(p), vel) for i, p in enumerate(pitches)]


def arpeggio(pitches: list[str], start: float, length: float, step: float = SIXTEENTH, pattern: list[int] | None = None, vel: int = 84, gate: float = 0.9) -> list[Note]:
    """Steps through a chord's notes (or `pattern` indexes into them) every `step` beats for `length` beats."""
    order = pattern if pattern is not None else list(range(len(pitches)))
    out: list[Note] = []
    i = 0
    t = start
    while t < start + length - 1e-9:
        p = pitches[order[i % len(order)] % len(pitches)]
        out.append(Note(t, step * gate, midi(p), vel))
        t += step
        i += 1
    return out
