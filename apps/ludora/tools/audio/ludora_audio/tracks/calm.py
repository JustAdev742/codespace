"""Calm: "Moonlit Study". For studying on your own, unhurried.

A major, 84 BPM, 16 bars. Electric piano chords with a soft pad, an upright
bass and brushes; a music box picks out a slow tune with plenty of air, and a
vibraphone answers it in the second half.
"""

from ..instruments import ACOUSTIC_BASS, EPIANO, KIT_BRUSH, MUSIC_BOX, VIBRAPHONE, WARM_PAD
from ..notation import Mix, Part, Song, drums, melody
from ..theory import bass_line, comp, pads

PROGRESSION = [
    "Amaj7", "F#m9", "Dmaj9", "E7sus4 E7",
    "Amaj7", "C#m7", "Bm9", "E7sus4 E7",
    "F#m9", "C#m7", "Dmaj9", "Amaj7/C#",
    "Bm9", "E7sus4", "Dmaj9 Bm9", "E7sus4 E7",
]

MUSIC_BOX_TUNE = """
c#6:6 b5:2 a5:8 | r:4 g#5:4 a5:4 c#6:4 | e6:6 c#6:2 a5:8 | b5:8 g#5:4 r:4 |
c#6:6 b5:2 a5:4 e5:4 | g#5:4 e5:4 b5:6 g#5:2 | a5:6 f#5:2 c#6:8 | b5:4 a5:4 g#5:8
"""

VIBES_TUNE = """
c#5:4 e5:4 g#5:4 a5:4 | g#5:6 e5:2 c#5:8 | f#5:4 a5:4 c#6:4 e6:4 | e6:6 c#6:2 a5:8 |
d6:4 c#6:4 b5:4 f#5:4 | e5:6 a5:2 b5:8 | a5:4 f#5:4 d5:4 c#5:4 | b4:4 e5:4 g#5:4 b5:4
"""


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        groove = {"kick": "x.....o...x.....", "snare": "....x.......x...", "hat": "o.o.o.o.o.o.o.o."}
        if bar in (7, 15):
            groove["snare"] = "....x.......x.oo"
        notes += drums(groove, t, vel=72)
    return notes


def song() -> Song:
    return Song(
        id="calm",
        title="Moonlit Study",
        bpm=84,
        bars=16,
        reverb_seconds=2.2,
        target_lufs=-18.0,
        parts=[
            Part("epiano", EPIANO, comp(PROGRESSION, 60, 76, steps=[0, 10], length=1.6, size=4, vel=64, accent={10: -8}), Mix(gain_db=-2, pan=-0.15, reverb=0.25, eq=[("high_shelf", 5000, -3, 0.7)])),
            Part("pad", WARM_PAD, pads(PROGRESSION, 57, 69, size=3, vel=44), Mix(gain_db=-9, reverb=0.35, highpass=160, width=1.4)),
            Part("musicbox", MUSIC_BOX, melody(MUSIC_BOX_TUNE, 0, vel=84), Mix(gain_db=2, pan=0.2, reverb=0.4, delay=0.2, lowpass=10000)),
            Part("vibes", VIBRAPHONE, melody(VIBES_TUNE, 32, vel=82), Mix(gain_db=-2, pan=0.15, reverb=0.35, delay=0.12)),
            Part("bass", ACOUSTIC_BASS, bass_line(PROGRESSION, [(0, 8, "R"), (8, 6, "5"), (14, 2, "A")], octave_note=45, vel=86), Mix(gain_db=-7, reverb=0.05, highpass=38, comp=(-22, 3))),
            Part("drums", KIT_BRUSH, _drums(), Mix(gain_db=-9, reverb=0.12, comp=(-18, 2))),
        ],
    )
