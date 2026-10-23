"""Results: "Lanterns Rise". The celebration under the podium and the scores.

G major, 108 BPM, 16 bars. Brass sing a triumphant tune with a glockenspiel
glinting above it and strings running arpeggios underneath; in the second half
the strings take the tune higher over a choir. Timpani, claps and a harp sweep
at the end of every phrase.
"""

from ..instruments import BRASS, CHOIR, FRENCH_HORNS, GLOCKENSPIEL, HARP, KIT_ROOM, PIZZICATO, TIMPANI, VIOLINS_FAST
from ..notation import Mix, Note, Part, Song, arpeggio, drums, melody, shift
from ..theory import arp, bass_line, pads

PROGRESSION = [
    "G", "D/F#", "Em7", "Cmaj7",
    "G", "D", "C", "D7",
    "Em", "C", "G/B", "Am7",
    "C", "D", "C D", "Am7 D7",
]

BRASS_TUNE = """
d5:4 g5:4 b5:6 a5:2 | a5:4 f#5:4 d5:8 | e5:4 g5:4 b5:4 d6:4 | c6:6 b5:2 g5:8 |
d5:4 g5:4 b5:6 c6:2 | d6:4 c6:2 b5:2 a5:8 | g5:4 e5:2 g5:2 c6:4 e6:4 | d6:8 c6:4 a5:4
"""

STRINGS_TUNE = """
b5:6 a5:2 g5:4 e5:4 | e5:4 g5:4 c6:8 | d6:6 b5:2 g5:4 b5:4 | c6:4 b5:4 a5:4 e5:4 |
e6:6 d6:2 c6:4 g5:4 | f#6:6 e6:2 d6:8 | e6:4 c6:4 d6:4 f#6:4 | e6:4 c6:4 a5:4 c6:4
"""


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        if bar in (7, 15):
            notes += drums({"kick": "X.......X.x.....", "clap": "....x.......x...", "snare": "............xxxX", "hat": "x.x.x.x.x.x....."}, t, vel=92)
        else:
            notes += drums({"kick": "X.......X.x.....", "clap": "....x.......x...", "hat": "x.x.x.x.x.x.x.x.", "tamb": "..x...x...x...x."}, t, vel=90)
        if bar in (0, 8):
            notes += drums({"crash": "X..............."}, t, vel=88)
    return notes


def song() -> Song:
    harp = []
    for bar in (3, 7, 11, 15):
        harp += arpeggio(["g4", "a4", "b4", "d5", "e5", "g5", "a5", "b5"], bar * 4 + 3, 1.0, step=0.125, vel=70, gate=1.6)
    timpani = [Note(bar * 4, 1.0, 43, 100) for bar in (0, 4, 8, 12)] + [Note(15 * 4 + 2 + i * 0.125, 0.125, 38, 64 + i * 3) for i in range(16)]
    return Song(
        id="results",
        title="Lanterns Rise",
        bpm=108,
        bars=16,
        reverb_seconds=2.0,
        target_lufs=-15.5,
        parts=[
            Part("brass", BRASS, melody(BRASS_TUNE, 0, vel=100, legato=0.9), Mix(gain_db=-3, pan=-0.1, reverb=0.24, highpass=150)),
            Part("glock", GLOCKENSPIEL, melody(BRASS_TUNE, 0, vel=62, transpose=12), Mix(gain_db=-3, pan=0.35, reverb=0.3, lowpass=10000)),
            Part("strings_tune", VIOLINS_FAST, melody(STRINGS_TUNE, 32, vel=96, legato=0.95), Mix(gain_db=-2, pan=0.1, reverb=0.28, highpass=220)),
            Part("strings_arp", VIOLINS_FAST, arp(PROGRESSION[:8], 62, 79, step=0.25, pattern=[0, 1, 2, 3, 2, 1], size=4, vel=70, gate=0.6), Mix(gain_db=-1, pan=0.3, reverb=0.22, highpass=250, width=1.3)),
            Part("horns", FRENCH_HORNS, pads(PROGRESSION, 55, 67, size=3, vel=66), Mix(gain_db=-8, pan=-0.2, reverb=0.3, highpass=120)),
            Part("choir", CHOIR, shift(pads(PROGRESSION[8:], 62, 74, size=3, vel=58), 32), Mix(gain_db=-9, reverb=0.35, highpass=200, width=1.4)),
            Part("bass", PIZZICATO, bass_line(PROGRESSION, [(0, 4, "R"), (6, 2, "5"), (8, 4, "8"), (12, 2, "5"), (14, 2, "A")], octave_note=43, vel=100), Mix(gain_db=-4, reverb=0.05, highpass=40, comp=(-20, 3))),
            Part("harp", HARP, harp, Mix(gain_db=-7, pan=0.3, reverb=0.35)),
            Part("drums", KIT_ROOM, _drums(), Mix(gain_db=-6, reverb=0.08, comp=(-15, 2.5), eq=[("high_shelf", 9000, -2, 0.7)])),
            Part("timpani", TIMPANI, timpani, Mix(gain_db=-7, reverb=0.25)),
        ],
    )
