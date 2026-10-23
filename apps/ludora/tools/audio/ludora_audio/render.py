"""Turning parts into audio: MIDI files rendered through FluidSynth.

Every part renders on its own, dry (FluidSynth's reverb and chorus off), so the
mixer can treat each one separately. Renders are cached by the exact MIDI
bytes, so rebuilding after a small change only renders the parts that changed.
"""

from __future__ import annotations

import hashlib
import io
import random
import subprocess
from pathlib import Path

import mido
import numpy as np
import soundfile as sf

from .notation import Note, Part

SR = 44100
SOUNDFONT = Path("/usr/share/sounds/sf3/MuseScore_General_Full.sf3")
CACHE = Path(__file__).resolve().parent.parent / ".cache"
TICKS = 960


def part_midi(part: Part, bpm: float, length_beats: float, repeats: int = 1, humanize: float = 0.0, seed: int = 0, tail_beats: float = 8.0) -> bytes:
    """A one-track MIDI file of `part`, its notes repeated `repeats` times every `length_beats` beats.

    `humanize` nudges note times by up to that many beats and velocities by a
    little, from a seeded random generator, so the part does not sound
    mechanical and renders stay identical from build to build. Each note gets
    the same nudge in every repeat, so the repeats are identical and a loop cut
    from the middle one joins up without a seam.
    """
    rng = random.Random(seed)
    nudges = [(rng.uniform(-humanize, humanize), rng.randint(-5, 5)) if humanize else (0.0, 0) for _ in part.notes]
    mid = mido.MidiFile(ticks_per_beat=TICKS)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    channel = 9 if part.instrument.drums else 0
    if not part.instrument.drums:
        track.append(mido.Message("control_change", channel=channel, control=0, value=part.instrument.bank, time=0))
        track.append(mido.Message("control_change", channel=channel, control=32, value=0, time=0))
    track.append(mido.Message("program_change", channel=channel, program=part.instrument.preset, time=0))
    track.append(mido.Message("control_change", channel=channel, control=7, value=110, time=0))
    track.append(mido.Message("control_change", channel=channel, control=10, value=64, time=0))
    events: list[tuple[int, int, mido.Message]] = []
    for r in range(repeats):
        for n, (jitter, vel_nudge) in zip(part.notes, nudges):
            start = r * length_beats + max(0.0, n.start + jitter)
            vel = n.vel + vel_nudge
            on = round(start * TICKS)
            off = max(on + 1, round((start + n.dur) * TICKS))
            # Note-offs sort before note-ons at the same tick, so repeated notes retrigger cleanly.
            events.append((on, 1, mido.Message("note_on", channel=channel, note=n.pitch, velocity=max(1, min(127, vel)))))
            events.append((off, 0, mido.Message("note_off", channel=channel, note=n.pitch, velocity=0)))
    events.sort(key=lambda e: (e[0], e[1]))
    now = 0
    for tick, _, msg in events:
        track.append(msg.copy(time=tick - now))
        now = tick
    # Silence after the last note, so long decays and releases render in full.
    end = round((repeats * length_beats + tail_beats) * TICKS)
    track.append(mido.MetaMessage("end_of_track", time=max(0, end - now)))
    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()


def render_midi(data: bytes, gain: float = 0.6) -> np.ndarray:
    """Render MIDI bytes to a float32 stereo array of shape (samples, 2)."""
    key = hashlib.sha256(data + f"{SOUNDFONT}|{gain}|{SR}".encode()).hexdigest()[:24]
    CACHE.mkdir(parents=True, exist_ok=True)
    wav = CACHE / f"{key}.wav"
    if wav.exists():
        # Marks the render as still in use; build.py clears out renders nothing used.
        wav.touch()
    else:
        mid_path = CACHE / f"{key}.mid"
        mid_path.write_bytes(data)
        tmp = CACHE / f"{key}.tmp.wav"
        subprocess.run(
            ["fluidsynth", "-ni", "-q", "-R", "0", "-C", "0", "-g", str(gain), "-r", str(SR), "-T", "wav", "-O", "float", "-F", str(tmp), str(SOUNDFONT), str(mid_path)],
            check=True,
            capture_output=True,
        )
        tmp.rename(wav)
        mid_path.unlink(missing_ok=True)
    audio, sr = sf.read(wav, dtype="float32", always_2d=True)
    assert sr == SR, sr
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    return audio


def render_part(part: Part, bpm: float, length_beats: float, repeats: int = 1, humanize: float = 0.0, seed: int = 0, gain: float = 0.6) -> np.ndarray:
    return render_midi(part_midi(part, bpm, length_beats, repeats, humanize, seed), gain)


def notes_at(notes: list[Note], pitch: int) -> list[float]:
    """Start times (beats) of every note of one pitch, such as the kick drum."""
    return sorted(n.start for n in notes if n.pitch == pitch)
