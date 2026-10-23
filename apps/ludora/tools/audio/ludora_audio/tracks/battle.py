"""Battle: "Spark Duel". Driving and heroic, never scary: duels, towers, giants.

E minor, 128 BPM, 16 bars. A square-wave lead with a chiptune glint states the
theme over a pulsing synth bass, staccato strings and a power kit; in the
second half brass stabs take over, taiko drums mark the phrases and the hats
double up.
"""

from ..instruments import BRASS, KIT_POWER, SQUARE_LEAD, SYNTH_BASS, TAIKO, TIMPANI, VIOLINS_FAST
from ..notation import Mix, Note, Part, Song, drums, melody
from ..theory import arp, bass_line

PROGRESSION = [
    "Em", "C", "G", "D",
    "Em", "C", "Am", "B7",
    "Em", "C", "G", "D/F#",
    "Am", "C", "Am D", "B7",
]

LEAD = """
e5:3 g5:3 b5:2 e6:4 d6:2 b5:2 | c6:6 b5:2 g5:4 e5:4 | d6:3 b5:3 g5:2 d6:4 e6:2 d6:2 | f#6:8 e6:4 d6:4 |
e5:3 g5:3 b5:2 e6:4 d6:2 b5:2 | e6:6 d6:2 c6:4 g5:4 | a5:3 c6:3 e6:2 d6:4 c6:2 b5:2 | b5:8 d#6:4 f#6:4
"""

STABS = """
[e4,g4,b4]:2 r:2 [e4,g4,b4]:2 r:6 b4:2 e5:2 | [e4,g4,c5]:2 r:2 [e4,g4,c5]:2 r:6 c5:2 e5:2 |
[d4,g4,b4]:2 r:2 [d4,g4,b4]:2 r:6 d5:2 g5:2 | [f#4,a4,d5]:2 r:2 [f#4,a4,d5]:2 r:2 a4:4 d5:4 |
[e4,a4,c5]:4 [e4,a4,c5]:2 r:2 e5:4 c5:4 | [e4,g4,c5]:4 [e4,g4,c5]:2 r:2 g5:4 e5:4 |
[e4,a4,c5]:6 r:2 [f#4,a4,d5]:6 r:2 | [d#4,f#4,a4,b4]:8 [d#4,f#4,a4,b4]:4 f#5:4
"""


def _drums():
    notes = []
    for bar in range(16):
        t = bar * 4
        second = bar >= 8
        if bar in (7, 15):
            notes += drums({"kick": "X.....x.X.......", "snare": "....X...xoxoxxXX", "hat": "x.x.x.x........."}, t, vel=96)
        else:
            notes += drums(
                {
                    "kick": "X..x..x.X..x..x." if second else "X.....x.X.....x.",
                    "snare": "....X.......X...",
                    "hat": "xoxoxoxoxoxoxoxo" if second else "x.x.x.x.x.x.x.x.",
                },
                t,
                vel=94,
            )
        if bar in (0, 8):
            notes += drums({"crash": "X..............."}, t, vel=90)
    return notes


def _taiko():
    notes = []
    for bar in (0, 4, 8, 12):
        notes.append(Note(bar * 4, 1.0, 50, 110))
    for bar in (7, 15):
        notes += [Note(bar * 4 + 3, 0.25, 50, 100), Note(bar * 4 + 3.5, 0.25, 50, 110)]
    return notes


def song() -> Song:
    return Song(
        id="battle",
        title="Spark Duel",
        bpm=128,
        bars=16,
        reverb_seconds=1.5,
        target_lufs=-16.0,
        parts=[
            Part("lead", SQUARE_LEAD, melody(LEAD, 0, vel=92, legato=0.85), Mix(gain_db=-4, pan=0.05, reverb=0.16, delay=0.12, lowpass=7000, highpass=300)),
            Part("brass", BRASS, melody(STABS, 32, vel=100, legato=0.9), Mix(gain_db=-8, pan=-0.1, reverb=0.2, highpass=150)),
            Part("strings", VIOLINS_FAST, arp(PROGRESSION, 59, 74, step=0.5, pattern=[0, 1, 2, 1], size=3, vel=82, gate=0.45), Mix(gain_db=0, pan=0.3, reverb=0.2, highpass=220, width=1.3)),
            Part("bass", SYNTH_BASS, bass_line(PROGRESSION, [(0, 2, "R"), (2, 2, "R"), (4, 2, "8"), (6, 2, "R"), (8, 2, "R"), (10, 2, "R"), (12, 2, "8"), (14, 2, "5")], octave_note=40, vel=100), Mix(gain_db=-8, reverb=0.02, highpass=35, lowpass=4000, comp=(-18, 3), duck=0.3)),
            Part("drums", KIT_POWER, _drums(), Mix(gain_db=-5, reverb=0.1, comp=(-14, 3), eq=[("high_shelf", 9000, -2, 0.7)])),
            Part("taiko", TAIKO, _taiko(), Mix(gain_db=-6, reverb=0.25, highpass=40)),
            Part("timpani", TIMPANI, [Note(0, 2, 40, 100), Note(32, 2, 40, 104)], Mix(gain_db=-6, reverb=0.25)),
        ],
    )
