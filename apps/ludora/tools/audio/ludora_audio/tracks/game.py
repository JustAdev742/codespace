"""Game: "Festival Run". The steady music under the questions.

F major, 116 BPM, 16 bars. Light and moving, but it leaves room to think: a
marimba ostinato and a bouncing pizzicato bass carry it, a vibraphone hums a
small tune in the first half and a flute sings an answer in the second. Soft
four-on-the-floor kick, offbeat hats.
"""

from ..instruments import CELLI_PIZZICATO, FLUTE, GLOCKENSPIEL, KIT_ROOM, MARIMBA, VIBRAPHONE, WARM_PAD
from ..notation import Mix, Part, Song, drums, melody
from ..theory import arp, bass_line, pads

PROGRESSION = [
    "F", "C/E", "Dm7", "Bbmaj7",
    "F", "C", "Bbmaj7", "C7sus4 C7",
    "Dm7", "Am7", "Bbmaj7", "F/A",
    "Gm7", "C", "Bbmaj7", "Gm7 C7",
]

VIBES = """
c5:4 a4:2 c5:2 f5:6 e5:2 | g5:4 e5:4 c5:4 r:4 | d5:4 f5:2 a5:2 g5:4 f5:2 e5:2 | d5:8 r:4 c5:2 d5:2 |
c5:4 a4:2 c5:2 f5:6 g5:2 | a5:4 g5:4 e5:4 c5:4 | d5:4 f5:2 a5:2 g5:4 f5:4 | f5:8 e5:4 g4:2 a4:2
"""

FLUTE_TUNE = """
a5:4 g5:2 f5:2 e5:4 d5:4 | c5:4 e5:2 g5:2 a5:8 | bb5:4 a5:2 g5:2 f5:4 d5:4 | c5:6 a4:2 c5:4 f5:4 |
bb5:4 a5:2 g5:2 d5:4 f5:4 | e5:4 g5:4 c6:4 bb5:2 a5:2 | a5:4 g5:2 f5:2 d5:8 | bb4:4 d5:4 e5:4 g5:4
"""


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        if bar in (7, 15):
            notes += drums({"kick": "X...x...X.......", "hat": "..x...x...x.....", "rim": "....x...........", "snare": "............ooxX"}, t, vel=86)
        else:
            groove = {"kick": "X...x...X...x...", "hat": "..x...x...x...x.", "rim": "....x.......x..."}
            if bar >= 8:
                groove["shaker"] = "oxoxoxoxoxoxoxox"
            notes += drums(groove, t, vel=84)
        if bar in (0, 8):
            notes += drums({"crash": "x..............."}, t, vel=66)
    return notes


def song() -> Song:
    sparkle = []
    for bar in (3, 11):
        sparkle += melody("f6:1 a6:1 c7:1 f7:1", bar * 4 + 3, vel=58)
    return Song(
        id="game",
        title="Festival Run",
        bpm=116,
        bars=16,
        reverb_seconds=1.6,
        target_lufs=-17.0,
        parts=[
            Part("marimba", MARIMBA, arp(PROGRESSION, 60, 77, step=0.5, pattern=[0, 2, 1, 3, 2, 1, 3, 2], vel=78), Mix(gain_db=-1, pan=-0.25, reverb=0.16, eq=[("peak", 400, -2, 1.0)])),
            Part("vibes", VIBRAPHONE, melody(VIBES, 0, vel=90), Mix(gain_db=-2, pan=0.15, reverb=0.25, delay=0.1)),
            Part("flute", FLUTE, melody(FLUTE_TUNE, 32, vel=88, legato=0.9), Mix(gain_db=-8, pan=0.1, reverb=0.3, delay=0.12, highpass=250)),
            Part("bass", CELLI_PIZZICATO, bass_line(PROGRESSION, [(0, 4, "R"), (4, 2, "5"), (6, 2, "8"), (8, 4, "R"), (12, 2, "5"), (14, 2, "C")], octave_note=41, vel=100), Mix(gain_db=-2, reverb=0.06, highpass=40, comp=(-20, 3), duck=0.1)),
            Part("pad", WARM_PAD, pads(PROGRESSION, 60, 72, size=3, vel=50), Mix(gain_db=-7, reverb=0.3, highpass=200, width=1.3, duck=0.3)),
            Part("drums", KIT_ROOM, _drums(), Mix(gain_db=-7, reverb=0.07, comp=(-16, 2.5), eq=[("high_shelf", 9000, -2, 0.7)])),
            Part("glock", GLOCKENSPIEL, sparkle, Mix(gain_db=-8, pan=0.4, reverb=0.4, delay=0.2)),
        ],
    )
