"""Lobby: "Lanterns Waking". Welcoming and curious while a class joins.

D major, 105 BPM, 36 bars (82.3 s). It plays for minutes, so it keeps moving
without pushing: the sections change colour more than they change level.

- A (bars 1-8): the marimba tune over a pluck arpeggio, a round bass, a soft
  pad and the lantern kit.
- A' (9-16): the tune answers itself higher, with an FM-bell descant above it;
  claps, tambourine and sixteenth shakers lift the groove.
- B (17-24): warmer and curious. Warm keys and a kalimba under a breathy lead,
  congas, the bass in longer notes.
- Breakdown (25-28): the drums drop out. The bell picks out the tune's first
  notes over the pad, through a borrowed C major chord.
- Build (29-32): the kick comes back, the tune's opening climbs a step a bar,
  a riser and a snare build.
- Tag (33-36): the hook in full, with the glockenspiel and a supersaw shimmer,
  and a tom fill back to the top.
"""

from dataclasses import replace

from ..instruments import GLOCKENSPIEL, KALIMBA, MARIMBA, STRINGS_SLOW
from ..kit import KIT_LANTERN
from ..notation import DRUM, Mix, Note, Part, Song, drums, melody, shift
from ..patches import FM_BELL, PLUCK, ROUND_BASS, SOFT_LEAD, SOFT_PAD, SUB_BASS, SUPERSAW_PAD, WARM_KEYS
from ..theory import arp, bass_line, comp, pads
from ..transitions import IMPACT, REVERSE_SWELL, RISER, SWEEP_DOWN, SWEEP_UP, at, into

BARS = 36

# Section by section; each list is one chord string per bar.
A = ["Dmaj7", "Bm7", "Gmaj7", "A7sus4 A7", "Dmaj7", "F#m7", "Gmaj7", "Asus4 A"]
A2 = ["Gmaj7", "A6", "F#m7", "Bm7", "Em7", "A7", "D/F# G", "Asus4 A7"]
B = ["Gmaj7", "A/G", "F#m7", "Bm7", "Em7", "F#m7", "Gmaj7", "A7sus4 A7"]
DOWN = ["Bm9", "Gmaj9", "Cmaj7", "Asus4 A"]
BUILD = ["Gmaj7", "A", "Bm7", "A/C#"]
TAG = ["Dmaj7", "Bm7", "Em7", "A7sus4 A7"]
PROGRESSION = A + A2 + B + DOWN + BUILD + TAG
# Where each section starts, in bars.
S_A, S_A2, S_B, S_DOWN, S_BUILD, S_TAG = 0, 8, 16, 24, 28, 32

# The lantern kit with its clap and rim a little softer: their clicks set the true peak.
KIT = replace(KIT_LANTERN, levels=KIT_LANTERN.levels + (("clap", -3.0), ("rim", -2.0)))

TUNE_A = """
r:2 a4:2 d5:2 e5:2 f#5:4 e5:2 d5:2 | f#5:2 a5:4 f#5:2 e5:4 d5:2 b4:2 |
r:2 b4:2 d5:2 e5:2 f#5:4 a5:2 b5:2 | a5:6 g5:2 e5:4 c#5:4 |
r:2 a4:2 d5:2 e5:2 f#5:4 e5:2 d5:2 | f#5:2 a5:4 c#6:2 b5:4 a5:2 f#5:2 |
g5:3 f#5:1 e5:2 d5:2 e5:4 f#5:2 g5:2 | a5:8 r:4 e5:2 f#5:2
"""

# A': the tune's answer, a little higher.
TUNE_A2 = """
g5:4 f#5:2 e5:2 d5:4 b4:4 | c#5:2 e5:2 f#5:4 e5:4 r:2 a4:2 |
a5:4 f#5:2 e5:2 c#5:4 e5:4 | d5:6 b4:2 d5:4 f#5:4 |
g5:4 f#5:2 e5:2 b5:4 a5:2 g5:2 | f#5:2 e5:2 c#5:4 a4:4 c#5:2 e5:2 |
f#5:4 a5:4 b5:4 d6:4 | e6:4 d6:4 c#6:2 b5:2 a5:4
"""

# A bell descant above the answer: long notes moving against the tune.
DESCANT = """
d6:8 b5:8 | c#6:8 e6:8 | c#6:8 a5:8 | d6:8 f#6:8 |
e6:8 g6:4 f#6:4 | e6:8 c#6:8 | a5:8 b5:8 | a5:8 r:8
"""

# B: a breathy lead with room around it.
TUNE_B = """
f#5:6 e5:2 d5:4 b4:4 | c#5:4 e5:4 a5:8 |
a5:6 f#5:2 e5:4 c#5:4 | d5:8 r:4 b4:2 c#5:2 |
d5:6 e5:2 g5:4 b5:4 | a5:6 c#6:2 b5:4 a5:4 |
b5:4 a5:2 g5:2 f#5:4 d5:4 | e5:8 c#5:4 r:4
"""

# Breakdown: the tune's opening, slowed into bell notes.
BELL_DOWN = """
r:2 f#5:2 b5:2 c#6:2 d6:8 | r:2 d5:2 g5:2 a5:2 b5:8 |
r:2 e5:2 g5:2 b5:2 c6:8 | d6:8 c#6:8
"""

# Build: the same opening climbing a step each bar.
TUNE_BUILD = """
r:2 b4:2 d5:2 e5:2 f#5:4 d5:4 | r:2 c#5:2 e5:2 f#5:2 g5:4 e5:4 |
r:2 d5:2 f#5:2 g5:2 a5:4 f#5:4 | r:2 e5:2 a5:2 b5:2 c#6:4 e6:4
"""

# Tag: the hook, up top.
HOOK = """
d6:4 a5:2 f#5:2 a5:4 d6:2 e6:2 | f#6:4 e6:2 d6:2 b5:4 a5:4 |
g5:2 b5:2 e6:2 d6:2 b5:4 g5:2 a5:2 | a5:6 g5:2 e5:4 c#5:4
"""


def at_bar(notes: list[Note], bar: int) -> list[Note]:
    return shift(notes, bar * 4)


def _drums() -> list[Note]:
    notes: list[Note] = []
    groove_a = {"kick": "X.....x.x.......", "rim": "....x.......x...", "shaker": "o.x.o.x.o.x.o.x.", "hat": "..x...x...x...x."}
    groove_a2 = {"kick": "X.....x.x.x.....", "clap": "....x.......x...", "shaker": "oxxxoxxxoxxxoxxx", "tamb": "....x.......x...", "hat": "..x...x...x...x."}
    groove_b = {"kick": "X.......x.......", "rim": "........x.......", "conga_hi": "..x...x...x.x...", "conga_lo": "x.......x.....x.", "shaker": "x.x.x.x.x.x.x.x."}
    groove_tag = {"kick": "X.....x.x.x.....", "clap": "....x.......x...", "hat": "x.x.x.x.x.x.x.x.", "shaker": "oxxxoxxxoxxxoxxx", "tamb": "..x...x...x...x."}
    for bar in range(BARS):
        t = bar * 4
        if bar < S_A2:
            if bar == S_A2 - 1:
                # Toms on the last beat into A'.
                notes += drums({"kick": "X.....x.x.......", "rim": "....x...........", "shaker": "o.x.o.x.o.x....."}, t, vel=86)
                notes += drums({"tom_hi": "............xx..", "tom_mid": "..............x.", "tom_lo": "...............x"}, t, vel=80)
            else:
                notes += drums(groove_a, t, vel=86)
                if bar == 3:
                    notes += drums({"open": "..............x."}, t, vel=64)
        elif bar < S_B:
            if bar == S_B - 1:
                # A lighter turn into B: the groove stops on beat three and the swell carries it.
                notes += drums({"kick": "X.....x.........", "clap": "....x...........", "shaker": "oxxxoxxxoxxx....", "open": "..........x....."}, t, vel=86)
            else:
                notes += drums(groove_a2, t, vel=88)
                if bar in (11, 13):
                    notes += drums({"open": "..............x."}, t, vel=66)
        elif bar < S_DOWN:
            notes += drums(groove_b, t, vel=80)
            if bar == S_DOWN - 1:
                notes += drums({"conga_hi": "............xxxx"}, t, vel=70)
        elif bar < S_BUILD:
            notes += drums({"shaker": "o.x.o.x.o.x.o.x."}, t, vel=70)
        elif bar < S_TAG:
            k = bar - S_BUILD
            if k < 2:
                notes += drums({"kick": "x...x...x...x...", "shaker": "o.x.o.x.o.x.o.x."}, t, vel=74 + 6 * k)
                if k == 1:
                    notes += drums({"rim": "....x.......x..."}, t, vel=80)
            elif k == 2:
                notes += drums({"kick": "x...x...x...x...", "clap": "....x.......x...", "shaker": "oxxxoxxxoxxxoxxx", "hat": "..x...x...x...x."}, t, vel=88)
            else:
                notes += drums({"kick": "x...x...x...x...", "hat": "..x...x........."}, t, vel=90)
                # A snare build: eighths, then sixteenths, louder all the way.
                hits = [0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15]
                notes += [Note(t + s * 0.25, 0.2, DRUM["snare"], 46 + 6 * i) for i, s in enumerate(hits)]
        else:
            if bar == BARS - 1:
                notes += drums({"kick": "X.....x.x.......", "clap": "....x...........", "hat": "x.x.x.x.x.x....."}, t, vel=90)
                notes += drums({"tom_hi": "..........xx....", "tom_mid": "............xx..", "tom_lo": "..............xX"}, t, vel=84)
            else:
                notes += drums(groove_tag, t, vel=90)
    # Cymbals and festive bells at the section changes.
    notes += drums({"crash": "x...............", "chime": "x..............."}, S_A * 4, vel=74)
    notes += drums({"crash": "x..............."}, S_A2 * 4, vel=70)
    notes += drums({"chime": "x..............."}, S_B * 4, vel=70)
    notes += drums({"chime": "x..............."}, S_DOWN * 4, vel=76)
    notes += drums({"triangle": "x..............."}, (S_DOWN + 2) * 4, vel=60)
    notes += drums({"crash": "X...............", "jingle": "x..............."}, S_TAG * 4, vel=86)
    return notes


def song() -> Song:
    # The tune, on marimba: A, A', silent through B and the breakdown, the build, the hook.
    tune = melody(TUNE_A, 0, vel=94) + melody(TUNE_A2, S_A2 * 4, vel=96) + melody(TUNE_BUILD, S_BUILD * 4, vel=88) + melody(HOOK, S_TAG * 4, vel=100)
    bell = melody(DESCANT, S_A2 * 4, vel=78) + melody(BELL_DOWN, S_DOWN * 4, vel=88) + melody(HOOK, S_TAG * 4, vel=70)
    # B's lead, and the bell answering its phrase ends.
    lead = melody(TUNE_B, S_B * 4, vel=92, legato=0.92)
    bell += melody("r:8 a5:2 b5:2 d6:4", (S_B + 3) * 4, vel=66) + melody("r:8 a5:2 c#6:2 e6:4", (S_B + 7) * 4, vel=66)
    pluck_pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    pluck = (
        arp(A + A2, 64, 83, step=0.5, pattern=pluck_pattern, vel=80)
        + at_bar(arp(BUILD[2:], 64, 83, step=0.5, pattern=pluck_pattern, vel=70), S_BUILD + 2)
        + at_bar(arp(TAG, 64, 83, step=0.5, pattern=pluck_pattern, vel=86), S_TAG)
    )
    kalimba = at_bar(arp(B + DOWN, 67, 84, step=0.5, pattern=[0, 2, 1, 3, 2, 3, 1, 2], vel=70), S_B)
    keys = at_bar(comp(B, 62, 79, steps=[0, 6, 10], length=0.9, size=4, vel=78, accent={6: -10}), S_B)
    pad = (
        pads(A + A2, 62, 77, size=4, vel=64)
        + at_bar(pads(B, 62, 77, size=4, vel=60), S_B)
        + at_bar(pads(DOWN, 62, 79, size=4, vel=76), S_DOWN)
        + at_bar(pads(BUILD + TAG, 62, 77, size=4, vel=66), S_BUILD)
    )
    strings = at_bar(pads(A2, 69, 84, size=3, vel=50), S_A2) + at_bar(pads(TAG, 69, 84, size=3, vel=56), S_TAG)
    shimmer = at_bar(pads(TAG, 66, 81, size=4, vel=76), S_TAG)
    bounce = [(0, 6, "R"), (6, 2, "5"), (8, 4, "8"), (12, 2, "5"), (14, 2, "A")]
    bass = (
        bass_line(A + A2, bounce, octave_note=38, vel=96)
        + at_bar(bass_line(B, [(0, 7, "R"), (8, 3, "5"), (12, 4, "R")], octave_note=38, vel=86), S_B)
        + at_bar(bass_line(BUILD, [(0, 2, "R"), (2, 2, "R"), (4, 2, "R"), (6, 2, "R"), (8, 2, "R"), (10, 2, "R"), (12, 2, "8"), (14, 2, "R")], octave_note=38, vel=90), S_BUILD)
        + at_bar(bass_line(TAG, bounce, octave_note=38, vel=100), S_TAG)
    )
    sub = at_bar(bass_line(DOWN[1:], [(0, 16, "R")], octave_note=38, vel=74), S_DOWN + 1)
    glock = melody(HOOK, S_TAG * 4, vel=56, transpose=12)
    return Song(
        id="lobby",
        title="Lanterns Waking",
        bpm=105,
        bars=BARS,
        reverb_seconds=2.0,
        target_lufs=-16.5,
        parts=[
            Part("marimba", MARIMBA, tune, Mix(gain_db=-1, pan=-0.15, reverb=0.2, delay=0.07, highpass=220, eq=[("low_shelf", 520, -2.5, 0.7), ("peak", 2500, 2, 0.8)])),
            Part("bell", FM_BELL, bell, Mix(gain_db=2.5, pan=0.4, reverb=0.32, delay=0.16)),
            Part("lead", SOFT_LEAD, lead, Mix(gain_db=-5.5, pan=-0.08, reverb=0.3, delay=0.12, highpass=300)),
            Part("pluck", PLUCK.tweak(decay=0.45), pluck, Mix(gain_db=-2, pan=-0.4, reverb=0.18, delay=0.18, highpass=280, duck=0.2)),
            Part("kalimba", KALIMBA, kalimba, Mix(gain_db=-3, pan=0.45, reverb=0.25, delay=0.1, highpass=320)),
            Part("keys", WARM_KEYS, keys, Mix(gain_db=-6.5, pan=-0.35, reverb=0.22, highpass=220, eq=[("peak", 380, -4, 1.0)], duck=0.15)),
            Part("pad", SOFT_PAD.tweak(cutoff=1900), pad, Mix(gain_db=-9.5, reverb=0.3, highpass=300, width=1.6, duck=0.25, eq=[("peak", 400, -3, 0.9), ("high_shelf", 3000, 3, 0.7)])),
            Part("strings", STRINGS_SLOW, strings, Mix(gain_db=-9, reverb=0.35, highpass=350, width=1.4)),
            Part("shimmer", SUPERSAW_PAD.tweak(cutoff=2600, release=1.6), shimmer, Mix(gain_db=-11, reverb=0.3, highpass=300, width=1.5, duck=0.3)),
            Part("glock", GLOCKENSPIEL, glock, Mix(gain_db=-3, pan=0.4, reverb=0.35, lowpass=9000)),
            Part("bass", ROUND_BASS, bass, Mix(gain_db=-3, reverb=0.0, duck=0.2)),
            Part("sub", SUB_BASS, sub, Mix(gain_db=-4, reverb=0.0)),
            Part("drums", KIT, _drums(), Mix(gain_db=-3.5, reverb=0.1, comp=(-18, 2.0), lowpass=15000)),
            Part("swell", REVERSE_SWELL, [into(S_B, beats=4, pitch="g3", vel=70)], Mix(gain_db=-9, reverb=0.3)),
            Part("sweep up", SWEEP_UP, [into(S_A2, beats=4, vel=55), into(BARS, beats=2, vel=50)], Mix(gain_db=-10, reverb=0.3)),
            Part("sweep down", SWEEP_DOWN, [at(S_DOWN, beats=8, vel=60)], Mix(gain_db=-9, reverb=0.35)),
            Part("riser", RISER, [into(S_TAG, beats=8, pitch="a3", vel=80)], Mix(gain_db=-9, reverb=0.3)),
            Part("impact", IMPACT, [at(S_TAG, beats=4, pitch="d1", vel=62)], Mix(gain_db=-9, reverb=0.15, width=0.4)),
        ],
    )
