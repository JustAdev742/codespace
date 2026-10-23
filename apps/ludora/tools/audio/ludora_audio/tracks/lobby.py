"""Lobby: "Lanterns Waking". Warm and bouncy while players arrive.

D major, 100 BPM, 16 bars. A marimba tune over pizzicato strings and a
fingered bass, a soft room kit and a bed of slow strings. The second half
answers the first a little higher, with a kalimba weaving underneath and a
glockenspiel doubling the tune. The last bar turns back to the first.
"""

from ..instruments import CELESTA, FINGERED_BASS, GLOCKENSPIEL, KALIMBA, KIT_ROOM, MARIMBA, PIZZICATO, STRINGS_SLOW
from ..notation import Mix, Part, Song, drums, melody, shift
from ..theory import arp, bass_line, comp, pads

PROGRESSION = [
    "Dmaj7", "Bm7", "Gmaj7", "A7sus4 A7",
    "Dmaj7", "F#m7", "Gmaj7", "Asus4 A",
    "Gmaj7", "A6", "F#m7", "Bm7",
    "Em7", "A7", "D/F# G", "Asus4 A7",
]

TUNE_A = """
r:2 a4:2 d5:2 e5:2 f#5:4 e5:2 d5:2 | f#5:2 a5:4 f#5:2 e5:4 d5:2 b4:2 |
r:2 b4:2 d5:2 e5:2 f#5:4 a5:2 b5:2 | a5:6 g5:2 e5:4 c#5:4 |
r:2 a4:2 d5:2 e5:2 f#5:4 e5:2 d5:2 | f#5:2 a5:4 c#6:2 b5:4 a5:2 f#5:2 |
g5:3 f#5:1 e5:2 d5:2 e5:4 f#5:2 g5:2 | a5:8 r:4 e5:2 f#5:2
"""

TUNE_B = """
g5:4 f#5:2 e5:2 d5:4 b4:4 | c#5:2 e5:2 f#5:4 e5:4 r:2 a4:2 |
a5:4 f#5:2 e5:2 c#5:4 e5:4 | d5:6 b4:2 d5:4 f#5:4 |
g5:4 f#5:2 e5:2 b5:4 a5:2 g5:2 | f#5:2 e5:2 c#5:4 a4:4 c#5:2 e5:2 |
f#5:4 a5:4 b5:4 d6:4 | e6:4 d6:4 c#6:2 b5:2 a5:4
"""

GROOVE = {"kick": "X.....x.x.......", "rim": "....x.......x...", "shaker": "o.x.o.x.o.x.o.x."}
GROOVE_B = {"kick": "X.....x.x.x.....", "rim": "....x.......x...", "shaker": "oxxxoxxxoxxxoxxx", "tamb": "....x.......x..."}


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        groove = GROOVE_B if bar >= 8 else GROOVE
        if bar in (7, 15):
            # Fills into the next half: toms on the last beat, then a crash on the next downbeat.
            notes += drums({"kick": "X.....x.x.......", "rim": "....x...........", "shaker": "o.x.o.x.o.x....."}, t, vel=88)
            notes += drums({"tom_hi": "............xx..", "tom_mid": "..............x.", "tom_lo": "...............x"}, t, vel=84)
        else:
            notes += drums(groove, t, vel=88)
            if bar in (3, 11):
                notes += drums({"open": "..............x."}, t, vel=70)
        if bar in (0, 8):
            notes += drums({"crash": "x..............."}, t, vel=72)
    return notes


def song() -> Song:
    tune = melody(TUNE_A, 0, vel=94) + melody(TUNE_B, 32, vel=96)
    sparkle = []
    for bar in (3, 7, 11, 15):
        sparkle += melody("a5:1 d6:1 f#6:1 a6:1", bar * 4 + 3, vel=62)
    return Song(
        id="lobby",
        title="Lanterns Waking",
        bpm=100,
        bars=16,
        reverb_seconds=1.9,
        target_lufs=-16.5,
        parts=[
            Part("marimba", MARIMBA, tune, Mix(gain_db=1, pan=-0.12, reverb=0.2, delay=0.07, eq=[("peak", 2500, 1.5, 0.8)])),
            Part("glock", GLOCKENSPIEL, shift(melody(TUNE_B, 0, vel=60, transpose=12), 32), Mix(gain_db=-3, pan=0.3, reverb=0.3, lowpass=9000)),
            Part("kalimba", KALIMBA, shift(arp(PROGRESSION[8:], 57, 74, step=0.5, pattern=[0, 2, 1, 3, 2, 3, 1, 2], vel=66), 32), Mix(gain_db=-1, pan=0.35, reverb=0.22)),
            Part("pizz", PIZZICATO, comp(PROGRESSION, 62, 76, steps=[2, 6, 10, 14], length=0.2, vel=70), Mix(gain_db=3, pan=0.22, reverb=0.22, highpass=180, width=1.2)),
            Part("bass", FINGERED_BASS, bass_line(PROGRESSION, [(0, 6, "R"), (6, 2, "5"), (8, 4, "8"), (12, 2, "5"), (14, 2, "A")], vel=94), Mix(gain_db=-4.5, reverb=0.03, highpass=35, comp=(-20, 3), duck=0.15, eq=[("peak", 240, -2.5, 1.0)])),
            Part("strings", STRINGS_SLOW, pads(PROGRESSION, 62, 74, size=3, vel=46), Mix(gain_db=-8, reverb=0.32, highpass=180, width=1.3, duck=0.25)),
            Part("drums", KIT_ROOM, _drums(), Mix(gain_db=-6, reverb=0.08, comp=(-16, 2.5), eq=[("high_shelf", 8000, -2, 0.7)])),
            Part("celesta", CELESTA, sparkle, Mix(gain_db=-9, pan=0.45, reverb=0.4, delay=0.18)),
        ],
    )
