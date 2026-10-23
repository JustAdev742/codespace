"""Mixing a song into a seamless loop.

Each part is rendered once and laid down three times, one loop length apart,
processed and mixed; then the middle repeat is cut out with a little audio
either side. Because the repeats are identical to the sample, the audio just
after the loop's end is the same music as just after its start: a player can
jump from end to start without a seam, even if an audio decoder shifts the
file by a few milliseconds. Reverb and echo tails from the end of the loop are
already in its start, as they would be in a real loop.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import dsp
from .notation import DRUM, Song
from .render import SR, render_part

PRE_ROLL = 0.5
POST_ROLL = 0.5


@dataclass
class Loop:
    audio: np.ndarray
    loop_start: float
    loop_end: float
    stems_peak: dict[str, float]
    # Each part's loudness inside the finished mix (LUFS over one repeat), to judge the balance.
    stems_lufs: dict[str, float]


def mix_song(song: Song, humanize: float = 0.012) -> Loop:
    beats = song.beats
    period = int(round(song.seconds * SR))
    total = period * 3 + int(4 * SR)
    beat_s = 60.0 / song.bpm
    dry = np.zeros((total, 2), dtype=np.float32)
    rev_send = np.zeros_like(dry)
    echo_send = np.zeros_like(dry)
    # Kick hits across all three repeats, for parts that dip under the kick.
    kicks: list[float] = []
    for part in song.parts:
        if part.instrument.drums:
            kicks += [n.start * beat_s for n in part.notes if n.pitch in (DRUM["kick"], DRUM["kick2"])]
    kick_times = sorted({k + r * song.seconds for r in range(3) for k in kicks})
    peaks: dict[str, float] = {}
    processed: dict[str, np.ndarray] = {}
    for i, part in enumerate(song.parts):
        # Drums get half the timing nudge: a loose kick sounds sloppy where a loose melody sounds human.
        once = render_part(part, song.bpm, beats, repeats=1, humanize=humanize * (0.5 if part.instrument.drums else 1.0), seed=hash_seed(song.id, part.name))
        # Three copies at exact sample offsets: each repeat's tail rings on into the next, and every repeat
        # is identical to the sample (rendering three repeats in one pass would not be: FluidSynth places
        # notes on 64-sample blocks, so each repeat would land a little differently).
        x = np.zeros((total, 2), dtype=np.float32)
        for r in range(3):
            dsp.place(x, once, r * period)
        m = part.mix
        x = dsp.process(x, dsp.eq_board(m.highpass, m.lowpass, m.eq, m.comp))
        if m.width != 1.0:
            x = dsp.width(x, m.width)
        x = x * dsp.db(m.gain_db)
        if m.duck > 0 and kick_times:
            x = x * dsp.duck_curve(total, kick_times, m.duck)[:, None]
        if m.pan:
            x = dsp.pan(x, m.pan)
        peaks[part.name] = round(float(np.max(np.abs(x))), 3)
        processed[part.name] = x[period : 2 * period]
        dry += x
        if m.reverb > 0:
            rev_send += x * m.reverb
        if m.delay > 0:
            echo_send += x * m.delay
    ir = dsp.make_ir(song.reverb_seconds, seed=11)
    wet = dsp.reverb(rev_send, ir) * dsp.db(song.reverb_db)
    mix = dry + wet
    if np.any(echo_send):
        mix += dsp.echo(echo_send, song.delay_beats * beat_s)
    mix = dsp.master(mix)
    pre = int(PRE_ROLL * SR)
    post = int(POST_ROLL * SR)
    loop = mix[period - pre : 2 * period + post]
    # Loudness is measured over exactly one repeat of the loop.
    before = dsp.lufs(loop[pre : pre + period])
    loop = dsp.normalize_loudness(loop, song.target_lufs, measure=slice(pre, pre + period))
    shift_db = song.target_lufs - before
    stems = {name: round(dsp.lufs(x) + shift_db, 1) for name, x in processed.items()}
    return Loop(loop, pre / SR, (pre + period) / SR, peaks, stems)


def hash_seed(*parts: str) -> int:
    h = 0
    for p in parts:
        for ch in p:
            h = (h * 131 + ord(ch)) % 2_147_483_647
    return h
