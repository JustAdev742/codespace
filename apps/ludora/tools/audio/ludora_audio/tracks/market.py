"""Market: "Night Market Bounce". Playful and busy, for party modes.

B-flat major, 112 BPM, 16 bars. Steel drums sing a syncopated tune over
chopping pizzicato, a funky picked bass, claps and congas; a clarinet answers
in the second half, with a xylophone joining it for the last four bars.
"""

from ..instruments import CLARINET, KIT_STANDARD, PICKED_BASS, STEEL_DRUMS, VIOLINS_PIZZICATO, XYLOPHONE
from ..notation import Mix, Part, Song, drums, melody, shift
from ..theory import bass_line, comp

PROGRESSION = [
    "Bb", "Gm7", "Ebmaj7", "F7",
    "Bb", "Dm7", "Eb F", "Bb",
    "Cm7", "F7", "Dm7", "Gm7",
    "Ebmaj7", "F7", "Cm7 F7", "Bb F7",
]

STEEL = """
f5:2 r:1 d5:1 f5:2 g5:2 f5:4 d5:2 bb4:2 | d5:3 f5:3 g5:2 bb5:4 a5:2 g5:2 |
g5:2 r:1 eb5:1 g5:2 bb5:2 d6:4 c6:2 bb5:2 | a5:6 f5:2 c5:4 eb5:4 |
f5:2 r:1 d5:1 f5:2 g5:2 f5:4 d5:2 bb4:2 | a5:3 f5:3 d5:2 c6:4 a5:4 |
g5:4 bb5:4 a5:4 c6:4 | d6:6 c6:2 bb5:8
"""

CLARINET_TUNE = """
g5:4 eb5:2 c5:2 bb4:4 c5:4 | eb5:3 d5:3 c5:2 a4:8 | f5:4 d5:2 a4:2 c5:4 d5:4 | bb5:6 a5:2 g5:4 f5:4 |
g5:4 bb5:2 g5:2 d5:4 eb5:4 | f5:3 eb5:3 c5:2 a4:4 c5:4 | eb5:4 g5:4 a5:4 c6:4 | bb5:4 d6:4 c6:4 a5:4
"""


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        if bar in (7, 15):
            notes += drums({"kick": "X.....x.X.......", "clap": "....x.......x.x.", "hat": "x.x.x.x.x.x.....", "tom_hi": "............x...", "tom_mid": ".............x..", "tom_lo": "..............xx"}, t, vel=90)
        else:
            notes += drums({"kick": "X.....x.X.....x.", "clap": "....x.......x...", "hat": "x.x.x.x.x.x.x.x.", "conga_hi": "..x...x...x..x..", "conga_lo": "x.......x.......", "shaker": ".x.x.x.x.x.x.x.x"}, t, vel=88)
        if bar in (0, 8):
            notes += drums({"crash": "x..............."}, t, vel=74)
    return notes


def song() -> Song:
    clarinet = melody(CLARINET_TUNE, 32, vel=88, legato=0.92)
    xylo = shift(melody(" ".join(CLARINET_TUNE.split("|")[4:]), 0, vel=70, transpose=12), 48)
    return Song(
        id="market",
        title="Night Market Bounce",
        bpm=112,
        bars=16,
        reverb_seconds=1.5,
        target_lufs=-16.5,
        parts=[
            Part("steel", STEEL_DRUMS, melody(STEEL, 0, vel=96), Mix(gain_db=0, pan=-0.1, reverb=0.18, delay=0.08)),
            Part("clarinet", CLARINET, clarinet, Mix(gain_db=-4, pan=0.12, reverb=0.22, highpass=180)),
            Part("xylo", XYLOPHONE, xylo, Mix(gain_db=-4, pan=0.35, reverb=0.25)),
            Part("pizz", VIOLINS_PIZZICATO, comp(PROGRESSION, 65, 79, steps=[2, 6, 10, 14], length=0.18, vel=74), Mix(gain_db=-1, pan=0.25, reverb=0.18, highpass=220, width=1.3)),
            Part("bass", PICKED_BASS, bass_line(PROGRESSION, [(0, 3, "R"), (3, 1, "R"), (4, 2, "5"), (6, 2, "8"), (8, 3, "R"), (11, 1, "3"), (12, 2, "5"), (14, 2, "C")], octave_note=41, vel=96), Mix(gain_db=-5, reverb=0.03, highpass=38, comp=(-20, 3), duck=0.15, eq=[("peak", 250, -2, 1.0)])),
            Part("drums", KIT_STANDARD, _drums(), Mix(gain_db=-6, reverb=0.08, comp=(-16, 2.5), eq=[("high_shelf", 9000, -2, 0.7)])),
        ],
    )
