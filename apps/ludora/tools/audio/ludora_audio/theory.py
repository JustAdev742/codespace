"""Chords and the patterns built on them: bass lines, comping, pads and arpeggios.

A progression is one string per bar: "Dmaj7" fills the bar, "A7sus4 A7" splits
it into halves, "G A Bm C" into quarters. Voicings stay inside a range and move
as little as possible from one chord to the next, as a player's hands would.
"""

from __future__ import annotations

import re

from .notation import Note

QUALITIES = {
    "": [0, 4, 7],
    "maj": [0, 4, 7],
    "m": [0, 3, 7],
    "maj7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10],
    "7": [0, 4, 7, 10],
    "6": [0, 4, 7, 9],
    "m6": [0, 3, 7, 9],
    "add9": [0, 4, 7, 14],
    "madd9": [0, 3, 7, 14],
    "maj9": [0, 4, 7, 11, 14],
    "m9": [0, 3, 7, 10, 14],
    "9": [0, 4, 7, 10, 14],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "7sus4": [0, 5, 7, 10],
    "dim": [0, 3, 6],
    "m7b5": [0, 3, 6, 10],
    "aug": [0, 4, 8],
    "5": [0, 7],
}

PITCH = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

_CHORD = re.compile(r"^([A-G])([#b]?)([a-z0-9]*)(?:/([A-G][#b]?))?$")


def parse(symbol: str) -> tuple[int, list[int], int]:
    """'F#m7' is (6, [0, 3, 7, 10], 6); 'D/F#' is (2, [0, 4, 7], 6): root, intervals, bass note."""
    m = _CHORD.match(symbol)
    if not m:
        raise ValueError(f"not a chord: {symbol!r}")
    letter, acc, quality, bass = m.groups()
    root = (PITCH[letter] + (1 if acc == "#" else -1 if acc == "b" else 0)) % 12
    if quality not in QUALITIES:
        raise ValueError(f"unknown chord quality {quality!r} in {symbol!r}")
    bass_pc = root
    if bass:
        bass_pc = (PITCH[bass[0]] + (1 if bass[1:] == "#" else -1 if bass[1:] == "b" else 0)) % 12
    return root, QUALITIES[quality], bass_pc


def bars_of(progression: list[str], beats_per_bar: int = 4) -> list[tuple[float, float, str]]:
    """(start beat, length in beats, chord) for every chord in a one-string-per-bar progression."""
    out = []
    for i, bar in enumerate(progression):
        chords = bar.split()
        each = beats_per_bar / len(chords)
        for j, c in enumerate(chords):
            out.append((i * beats_per_bar + j * each, each, c))
    return out


def nearest(pc: int, around: int) -> int:
    """The MIDI note with pitch class `pc` nearest to `around`."""
    base = around - ((around - pc) % 12)
    return base if around - base <= 6 else base + 12


def voice_lead(progression: list[str], low: int, high: int, size: int = 4, start: list[int] | None = None, beats_per_bar: int = 4) -> list[tuple[float, float, list[int]]]:
    """Close voicings inside [low, high], each chosen to move least from the one before."""
    out = []
    prev = start
    for t, length, sym in bars_of(progression, beats_per_bar):
        root, ints, _ = parse(sym)
        tones = [(root + i) % 12 for i in ints]
        # Drop the root first when a chord has more tones than voices: the bass has it.
        if len(tones) > size:
            tones = [p for p in tones if p != root][:size] if len(tones) - 1 >= size else tones[:size]
        candidates = _voicings(tones, low, high, size)
        if not candidates:
            raise ValueError(f"no voicing for {sym} in {low}..{high}")
        if prev is None:
            centre = (low + high) / 2
            best = min(candidates, key=lambda v: abs(sum(v) / len(v) - centre) + _rub(v))
        else:
            best = min(candidates, key=lambda v: _distance(prev, v) + _rub(v))
        out.append((t, length, best))
        prev = best
    return out


def _voicings(tones: list[int], low: int, high: int, size: int) -> list[list[int]]:
    pitches = sorted(p for p in range(low, high + 1) if p % 12 in tones)
    results: list[list[int]] = []

    def build(i: int, chosen: list[int]):
        if len(chosen) == size:
            if {p % 12 for p in chosen} >= set(tones[: min(size, len(tones))]):
                results.append(chosen[:])
            return
        for j in range(i, len(pitches)):
            p = pitches[j]
            if chosen and p - chosen[-1] < 1:
                continue
            if chosen and p - chosen[0] > 16:
                break
            chosen.append(p)
            build(j + 1, chosen)
            chosen.pop()

    build(0, [])
    return results


def _rub(v: list[int]) -> float:
    """A penalty for semitone clashes inside a voicing, worst low down where they turn to mud."""
    return sum(3.0 + max(0, 60 - lo) * 0.3 for lo, hi in zip(v, v[1:]) if hi - lo == 1)


def _distance(a: list[int], b: list[int]) -> float:
    a, b = sorted(a), sorted(b)
    if len(a) != len(b):
        return abs(sum(a) / len(a) - sum(b) / len(b)) * len(b)
    return float(sum(abs(x - y) for x, y in zip(a, b)))


def pads(progression: list[str], low: int, high: int, size: int = 4, vel: int = 60, legato: float = 1.0, beats_per_bar: int = 4) -> list[Note]:
    """Held chords, one per chord symbol."""
    out = []
    for t, length, voicing in voice_lead(progression, low, high, size, beats_per_bar=beats_per_bar):
        out += [Note(t, length * legato, p, vel) for p in voicing]
    return out


def comp(progression: list[str], low: int, high: int, steps: list[int], length: float = 0.25, size: int = 3, vel: int = 76, accent: dict[int, int] | None = None, beats_per_bar: int = 4) -> list[Note]:
    """Short chord stabs on the given sixteenth steps of every bar (0 to 15), voiced inside [low, high]."""
    out = []
    voiced = voice_lead(progression, low, high, size, beats_per_bar=beats_per_bar)
    bars = len(progression)
    for bar in range(bars):
        for s in steps:
            t = bar * beats_per_bar + s * 0.25
            chord = next(v for (st, ln, v) in reversed(voiced) if st <= t + 1e-9)
            v = vel + (accent or {}).get(s, 0)
            out += [Note(t, length, p, v) for p in chord]
    return out


def bass_line(progression: list[str], pattern: list[tuple[int, int, str]], octave_note: int = 38, vel: int = 96, beats_per_bar: int = 4) -> list[Note]:
    """A bass line from a per-bar pattern of (sixteenth step, length in sixteenths, degree).

    Degrees: 'R' root (or the slash bass), '5' fifth, '8' octave up, '3' third,
    '7' seventh, 'A' an approach note a step below the next chord's root, 'C'
    a chromatic approach a semitone below it. Each chord's root sits nearest
    `octave_note`. For bars split into several chords, each step uses the chord
    sounding at that moment.
    """
    chords = bars_of(progression, beats_per_bar)
    out = []
    total = len(progression) * beats_per_bar
    for bar in range(len(progression)):
        for step, length, degree in pattern:
            t = bar * beats_per_bar + step * 0.25
            idx = max(i for i, (st, _, _) in enumerate(chords) if st <= t + 1e-9)
            root, ints, bass_pc = parse(chords[idx][2])
            nxt_root, _, nxt_bass = parse(chords[(idx + 1) % len(chords)][2])
            base = nearest(bass_pc, octave_note)
            third = ints[1] if len(ints) > 1 else 4
            seventh = ints[3] if len(ints) > 3 else 10
            if degree == "R":
                p = base
            elif degree == "5":
                p = nearest((root + 7) % 12, base + 5)
            elif degree == "8":
                p = base + 12
            elif degree == "3":
                p = nearest((root + third) % 12, base + 4)
            elif degree == "7":
                p = nearest((root + seventh) % 12, base + 9)
            elif degree in ("A", "C"):
                target = nearest(nxt_bass, base)
                p = target - (1 if degree == "C" else 2)
            else:
                raise ValueError(degree)
            if t < total:
                out.append(Note(t, length * 0.25 * 0.92, p, vel))
    return out


def arp(progression: list[str], low: int, high: int, step: float = 0.25, pattern: list[int] | None = None, size: int = 4, vel: int = 80, gate: float = 0.8, beats_per_bar: int = 4) -> list[Note]:
    """Each chord's voicing played one note at a time, in `pattern` order (indexes into the voicing, low to high)."""
    order = pattern or [0, 1, 2, 3]
    out = []
    for t0, length, voicing in voice_lead(progression, low, high, size, beats_per_bar=beats_per_bar):
        k = 0
        t = t0
        while t < t0 + length - 1e-9:
            out.append(Note(t, step * gate, voicing[order[k % len(order)] % len(voicing)], vel))
            t += step
            k += 1
    return out
