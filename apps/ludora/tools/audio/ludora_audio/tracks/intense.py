"""Intense: "Final Stretch". The last seconds of a game, a boss wave, a final round.

D minor, 140 BPM, 16 bars. Violins race in sixteenths over driving celli,
brass stabs land on the accents and a four-on-the-floor kick pushes it on; in
the second half the horns take up a heroic theme over a choir, a trumpet joins
them for the climb, and timpani roll into the turnaround.
"""

from ..instruments import BRASS, CELLI_FAST, CHOIR, FRENCH_HORNS, KIT_POWER, SYNTH_BASS, TAIKO, TIMPANI, TRUMPET, VIOLINS_FAST
from ..notation import Mix, Note, Part, Song, drums, melody, shift
from ..theory import arp, bass_line, comp, pads

PROGRESSION = [
    "Dm", "Bb", "C", "A7",
    "Dm", "Bb", "Gm", "A7",
    "Dm", "F", "C", "Bb",
    "Gm", "Bb", "A7sus4", "A7",
]

HORNS = """
d4:6 e4:2 f4:4 a4:4 | c5:6 a4:2 f4:8 | g4:6 a4:2 g4:4 e4:4 | f4:6 d4:2 bb3:8 |
g4:6 a4:2 bb4:4 d5:4 | f5:6 d5:2 bb4:8 | a4:6 d5:2 e5:8 | c#5:6 e5:2 a4:8
"""


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        if bar in (7, 15):
            notes += drums({"kick": "X...X...X...X.X.", "snare": "....X...XoXoXXXX", "hat": "xxxxxxxx........", "tom_lo": "............x.x."}, t, vel=98)
        else:
            notes += drums({"kick": "X...X...X...X...", "snare": "....X.......X...", "hat": "xoxoxoxoxoxoxoxo", "open": "..............x."}, t, vel=96)
        if bar in (0, 8):
            notes += drums({"crash": "X..............."}, t, vel=96)
    return notes


def _timpani():
    notes = [Note(0, 1.5, 38, 108), Note(32, 1.5, 38, 110)]
    for bar in (6, 14):
        # A roll on A that swells into the next bar.
        notes += [Note(bar * 4 + 4 + i * 0.25, 0.25, 45, 70 + i * 2) for i in range(16)]
    return notes


def song() -> Song:
    horns = melody(HORNS, 32, vel=100, legato=0.92)
    trumpet = shift(melody(" ".join(HORNS.split("|")[4:]), 0, vel=94, transpose=12), 48)
    stabs = comp(PROGRESSION, 55, 69, steps=[0, 10], length=0.4, size=3, vel=104)
    taiko = [Note(bar * 4 + s, 0.5, 50, v) for bar in range(8, 16) for s, v in ((0, 112), (2, 90), (2.5, 96))]
    return Song(
        id="intense",
        title="Final Stretch",
        bpm=140,
        bars=16,
        reverb_seconds=1.6,
        target_lufs=-15.5,
        parts=[
            Part("violins", VIOLINS_FAST, arp(PROGRESSION, 62, 77, step=0.25, pattern=[0, 2, 1, 2], size=3, vel=84, gate=0.55), Mix(gain_db=3, pan=-0.25, reverb=0.18, highpass=250, width=1.3)),
            Part("celli", CELLI_FAST, bass_line(PROGRESSION, [(0, 2, "R"), (2, 2, "8"), (4, 2, "R"), (6, 2, "8"), (8, 2, "R"), (10, 2, "8"), (12, 2, "R"), (14, 2, "8")], octave_note=38, vel=96), Mix(gain_db=-2, pan=0.2, reverb=0.12, highpass=45)),
            Part("bass", SYNTH_BASS, bass_line(PROGRESSION, [(0, 16, "R")], octave_note=38, vel=84), Mix(gain_db=-12, reverb=0.0, highpass=30, lowpass=900, duck=0.4)),
            Part("stabs", BRASS, stabs, Mix(gain_db=-6, pan=0.1, reverb=0.2, highpass=150)),
            Part("horns", FRENCH_HORNS, horns, Mix(gain_db=-5, pan=-0.05, reverb=0.25)),
            Part("trumpet", TRUMPET, trumpet, Mix(gain_db=-9, pan=0.15, reverb=0.25, delay=0.06)),
            Part("choir", CHOIR, shift(pads(PROGRESSION[8:], 62, 74, size=3, vel=60), 32), Mix(gain_db=-8, reverb=0.35, highpass=200, width=1.4)),
            Part("drums", KIT_POWER, _drums(), Mix(gain_db=-5, reverb=0.08, comp=(-14, 3), eq=[("high_shelf", 9000, -2, 0.7)])),
            Part("taiko", TAIKO, taiko, Mix(gain_db=-7, reverb=0.22, highpass=40)),
            Part("timpani", TIMPANI, _timpani(), Mix(gain_db=-6, reverb=0.25)),
        ],
    )
