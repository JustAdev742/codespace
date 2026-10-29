"""Calm: "Moonlit Study". For studying on your own, unhurried.

A major, 84 BPM, 32 bars (91.4 s). Warm but awake: the chords sit up in the
middle of the range, a soft sub carries the weight underneath, and shakers,
chimes and bells keep some air over the top.

- A (bars 1-8): warm keys and a soft pad, the music box tune, a sub bass
  that blooms and fades like a plucked string, and the lantern kit played
  softly.
- A' (9-16): the vibraphone takes the tune; the music box answers its phrase
  ends; a kalimba ripples underneath and soft hats come in.
- B (17-24): a new turn of chords; a breathy lead sings over keys broken into
  falling eighths, with a high string bed.
- Breakdown (25-28): the kit, keys and bass rest; the music box remembers
  the tune over the pad, with bells and a chime, and the keys and bass come
  back in for its last two bars.
- Return (29-32): the tune's last phrase comes home on music box and
  vibraphone, and a soft swell leads back to the top.
"""

from dataclasses import replace

from ..instruments import KALIMBA, MUSIC_BOX, STRINGS_SLOW, VIBRAPHONE
from ..kit import KIT_LANTERN
from ..notation import Mix, Note, Part, Song, drums, melody, shift
from ..patches import FM_BELL, SOFT_LEAD, SOFT_PAD, SUB_BASS, WARM_KEYS
from ..theory import arp, bass_line, comp, pads
from ..transitions import REVERSE_SWELL, SWEEP_UP, into

BARS = 32

A = ["Amaj7", "F#m9", "Dmaj9", "E7sus4 E7", "Amaj7", "C#m7", "Bm9", "E7sus4 E7"]
A2 = ["F#m9", "C#m7", "Dmaj9", "Amaj7/C#", "Bm9", "E7sus4", "Dmaj9 Bm9", "E7sus4 E7"]
B = ["Dmaj9", "C#m7", "Bm9", "Amaj7", "Dmaj9", "C#m7", "F#m9", "E7sus4"]
DOWN = ["F#m9", "Dmaj9", "Bm9", "E7sus4"]
HOME = ["Dmaj9", "C#m7", "Bm9", "E7sus4 E7"]
PROGRESSION = A + A2 + B + DOWN + HOME
# Where each section starts, in bars.
S_A, S_A2, S_B, S_DOWN, S_HOME = 0, 8, 16, 24, 28

# The lantern kit with a softer rim: its click sets the true peak.
KIT = replace(KIT_LANTERN, levels=KIT_LANTERN.levels + (("rim", -4.0),))

MUSIC_BOX_TUNE = """
c#6:6 b5:2 a5:8 | r:4 g#5:4 a5:4 c#6:4 | e6:6 c#6:2 a5:8 | b5:8 g#5:4 r:4 |
c#6:6 b5:2 a5:4 e5:4 | g#5:4 e5:4 b5:6 g#5:2 | a5:6 f#5:2 c#6:8 | b5:4 a5:4 g#5:8
"""

VIBES_TUNE = """
c#5:4 e5:4 g#5:4 a5:4 | g#5:6 e5:2 c#5:8 | f#5:4 a5:4 c#6:4 e6:4 | e6:6 c#6:2 a5:8 |
d6:4 c#6:4 b5:4 f#5:4 | e5:6 a5:2 b5:8 | a5:4 f#5:4 d5:4 c#5:4 | b4:4 e5:4 g#5:4 b5:4
"""

# The music box answering the vibraphone's phrase ends in A'.
ANSWERS = """
r:16 | r:8 e6:4 c#6:4 | r:16 | r:8 b5:2 c#6:2 e6:4 |
r:16 | r:8 d6:4 b5:4 | r:16 | r:16
"""

LEAD_B = """
a5:6 f#5:2 e5:8 | e5:4 g#5:4 b5:8 | c#6:6 b5:2 f#5:8 | a5:12 r:4 |
f#5:4 a5:4 c#6:4 e6:4 | e6:6 c#6:2 b5:8 | a5:6 g#5:2 f#5:4 c#5:4 | b4:4 d5:4 e5:8
"""

BOX_DOWN = """
c#6:8 a5:8 | r:4 f#5:4 a5:4 e6:4 | d6:8 c#6:8 | b5:12 r:4
"""

BOX_HOME = """
a5:6 f#5:2 c#6:8 | b5:4 g#5:4 e5:8 | f#5:4 a5:4 d6:4 c#6:4 | b5:8 g#5:8
"""


def at_bar(notes: list[Note], bar: int) -> list[Note]:
    return shift(notes, bar * 4)


def _drums() -> list[Note]:
    notes: list[Note] = []
    groove_a = {"kick": "x.....o...x.....", "rim": "....x.......x...", "shaker": "o.x.o.x.o.x.o.x."}
    groove_a2 = {"kick": "x.....o...x.....", "rim": "....x.......x...", "shaker": "o.x.o.x.o.x.o.x.", "hat": "..o...o...o...o."}
    groove_b = {"kick": "x.....o...x...o.", "rim": "....x.......x...", "shaker": "oxoxoxoxoxoxoxox", "hat": "..o...o...o...o."}
    for bar in range(BARS):
        t = bar * 4
        if bar < S_A2:
            notes += drums(groove_a, t, vel=74)
        elif bar < S_B:
            notes += drums(groove_a2, t, vel=76)
            if bar == S_B - 1:
                notes += drums({"rim": "..............oo"}, t, vel=76)
        elif bar < S_DOWN:
            notes += drums(groove_b, t, vel=76)
        elif bar < S_HOME:
            pass
        else:
            groove = dict(groove_a2)
            if bar == S_HOME:
                groove = {"shaker": "o.x.o.x.o.x.o.x.", "rim": "....x.......x..."}
            notes += drums(groove, t, vel=72)
    notes += drums({"chime": "x..............."}, S_A * 4, vel=60)
    notes += drums({"triangle": "x..............."}, S_A2 * 4, vel=52)
    notes += drums({"chime": "x..............."}, S_B * 4, vel=56)
    notes += drums({"chime": "x..............."}, S_DOWN * 4, vel=64)
    notes += drums({"triangle": "x..............."}, (S_DOWN + 2) * 4, vel=50)
    return notes


def song() -> Song:
    keys = (
        comp(A + A2, 64, 80, steps=[0, 10], length=1.6, size=4, vel=66, accent={10: -8})
        + at_bar(arp(B, 64, 81, step=0.5, pattern=[3, 2, 1, 0, 2, 1, 3, 0], vel=64, gate=1.4), S_B)
        + at_bar(pads(DOWN[2:], 64, 80, size=4, vel=44), S_DOWN + 2)
        + at_bar(comp(HOME, 64, 80, steps=[0, 10], length=1.6, size=4, vel=62, accent={10: -8}), S_HOME)
    )
    pad = pads(PROGRESSION, 69, 84, size=3, vel=56)
    box = melody(MUSIC_BOX_TUNE, 0, vel=84) + melody(ANSWERS, S_A2 * 4, vel=70) + melody(BOX_DOWN, S_DOWN * 4, vel=82) + melody(BOX_HOME, S_HOME * 4, vel=80)
    vibes = melody(VIBES_TUNE, S_A2 * 4, vel=82) + melody(BOX_HOME, S_HOME * 4, vel=66, transpose=-12)
    lead = melody(LEAD_B, S_B * 4, vel=86, legato=0.94)
    kalimba = at_bar(arp(A2, 69, 86, step=0.5, pattern=[0, 2, 1, 3, 2, 3, 1, 2], vel=60), S_A2)
    strings = at_bar(pads(B, 72, 88, size=3, vel=46), S_B)
    sparkle = []
    for bar, figure in ((3, "e6:2 a6:2 c#7:4"), (19, "c#6:2 e6:2 a6:4"), (25, "f#6:2 a6:2 e7:4"), (27, "b5:2 e6:2 g#6:4")):
        sparkle += melody(figure, bar * 4 + 2, vel=60)
    bass = (
        bass_line(A + A2, [(0, 8, "R"), (8, 6, "5"), (14, 2, "A")], octave_note=38, vel=84)
        + at_bar(bass_line(B, [(0, 6, "R"), (6, 2, "5"), (8, 8, "R")], octave_note=38, vel=82), S_B)
        + at_bar(bass_line(DOWN[2:], [(0, 16, "R")], octave_note=38, vel=60), S_DOWN + 2)
        + at_bar(bass_line(HOME, [(0, 8, "R"), (8, 6, "5"), (14, 2, "A")], octave_note=38, vel=80), S_HOME)
    )
    return Song(
        id="calm",
        title="Moonlit Study",
        bpm=84,
        bars=BARS,
        reverb_seconds=2.0,
        target_lufs=-18.0,
        parts=[
            Part("keys", WARM_KEYS, keys, Mix(gain_db=-7, pan=-0.2, reverb=0.25, highpass=220, eq=[("peak", 340, -4.5, 0.9), ("high_shelf", 4000, 3, 0.7)])),
            Part("pad", SOFT_PAD.tweak(cutoff=2400), pad, Mix(gain_db=-13.5, reverb=0.35, highpass=300, width=1.4, eq=[("high_shelf", 3000, 4, 0.7)])),
            Part("musicbox", MUSIC_BOX, box, Mix(gain_db=8.5, pan=0.22, reverb=0.4, delay=0.2, lowpass=11000)),
            Part("vibes", VIBRAPHONE, vibes, Mix(gain_db=-0.5, pan=-0.15, reverb=0.35, delay=0.12, highpass=220)),
            Part("lead", SOFT_LEAD, lead, Mix(gain_db=-9, pan=0.05, reverb=0.35, delay=0.14, highpass=280)),
            Part("kalimba", KALIMBA, kalimba, Mix(gain_db=-3, pan=0.45, reverb=0.3, delay=0.1, highpass=260)),
            Part("strings", STRINGS_SLOW, strings, Mix(gain_db=-10, reverb=0.4, highpass=400, width=1.5)),
            Part("bell", FM_BELL, sparkle, Mix(gain_db=2, pan=-0.4, reverb=0.4, delay=0.2)),
            Part("bass", SUB_BASS.tweak(decay=1.4, sustain=0.45, release=0.25), bass, Mix(gain_db=-6, reverb=0.0)),
            Part("drums", KIT, _drums(), Mix(gain_db=-3.5, reverb=0.14, comp=(-20, 2.0), lowpass=12000, eq=[("high_shelf", 7000, 1, 0.7)])),
            Part("sweep", SWEEP_UP, [into(S_A2, beats=4, vel=40)], Mix(gain_db=-14, reverb=0.4)),
            Part("swell", REVERSE_SWELL, [into(S_B, beats=4, pitch="d4", vel=50), into(BARS, beats=4, pitch="a3", vel=46)], Mix(gain_db=-11, reverb=0.35)),
        ],
    )
