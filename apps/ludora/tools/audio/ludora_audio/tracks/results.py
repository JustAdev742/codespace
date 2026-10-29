"""Results: "Lanterns Rise". The celebration under the podium and the scores.

G major, 112 BPM, 32 bars (68.6 s). Joyful and triumphant, with room to come
down and rise again, so it can loop for as long as the scores stay up.

- A (bars 1-8): the brass tune, with synth-brass stabs, a glockenspiel
  doubling it, an octave-bouncing bass and the festival kit at full tilt.
- A' (9-16): the strings take the tune higher over a choir and running
  sixteenths; agogo bells, harp sweeps.
- Breakdown (17-20): the kick drops out after a downlifter. Claps and
  sleigh bells, a pluck arpeggio and the bell playing the tune's opening.
- Build (21-24): the kick returns, brass fanfares climb, a snare and timpani
  roll and a riser.
- Finale (25-32): an impact, then the tune with everything: brass, choir, a
  string descant, supersaw shimmer; a tom fill back to the top.
"""

from dataclasses import replace

from ..instruments import BRASS, CHOIR, GLOCKENSPIEL, HARP, TIMPANI, VIOLINS_FAST
from ..kit import KIT_FESTIVAL
from ..notation import DRUM, Mix, Note, Part, Song, arpeggio, drums, melody, shift
from ..patches import BRASS_STAB, FM_BELL, PLUCK, PUNCHY_BASS, SUB_BASS, SUPERSAW_PAD
from ..theory import arp, bass_line, comp, pads
from ..transitions import DOWNLIFTER, IMPACT, REVERSE_SWELL, RISER, SWEEP_UP, at, into

BARS = 32

A = ["G", "D/F#", "Em7", "Cmaj7", "G", "D", "C", "D7"]
A2 = ["Em", "C", "G/B", "Am7", "C", "D", "C D", "Am7 D7"]
DOWN = ["Em7", "Cmaj7", "Am7", "Dsus4"]
BUILD = ["C", "D", "Em7", "D/F#"]
FINALE = ["G", "D/F#", "Em7", "Cmaj7", "Am7", "Bm7", "Cmaj7", "Dsus4 D7"]
PROGRESSION = A + A2 + DOWN + BUILD + FINALE

# The festival kit with its hats and tambourine a little softer, so the top stays sweet.
KIT = replace(KIT_FESTIVAL, levels=KIT_FESTIVAL.levels + (("hat", -2.0), ("tamb", -3.0), ("clap", -1.0)))
S_A, S_A2, S_DOWN, S_BUILD, S_FINALE = 0, 8, 16, 20, 24

BRASS_TUNE = """
d5:4 g5:4 b5:6 a5:2 | a5:4 f#5:4 d5:8 | e5:4 g5:4 b5:4 d6:4 | c6:6 b5:2 g5:8 |
d5:4 g5:4 b5:6 c6:2 | d6:4 c6:2 b5:2 a5:8 | g5:4 e5:2 g5:2 c6:4 e6:4 | d6:8 c6:4 a5:4
"""

STRINGS_TUNE = """
b5:6 a5:2 g5:4 e5:4 | e5:4 g5:4 c6:8 | d6:6 b5:2 g5:4 b5:4 | c6:4 b5:4 a5:4 e5:4 |
e6:6 d6:2 c6:4 g5:4 | f#6:6 e6:2 d6:8 | e6:4 c6:4 d6:4 f#6:4 | e6:4 c6:4 a5:4 c6:4
"""

# The finale: the tune's first half, then a new climb to the top.
FINALE_TUNE = """
d5:4 g5:4 b5:6 a5:2 | a5:4 f#5:4 d5:8 | e5:4 g5:4 b5:4 d6:4 | c6:6 b5:2 g5:8 |
c6:4 b5:2 a5:2 e6:8 | d6:4 b5:2 a5:2 f#5:8 | e5:4 g5:4 c6:4 e6:4 | d6:8 c6:4 a5:4
"""

DESCANT = """
g6:8 f#6:8 | f#6:8 d6:8 | e6:8 g6:8 | e6:8 d6:8 |
e6:8 c6:8 | d6:8 f#6:8 | g6:8 e6:8 | g6:8 f#6:8
"""

BELL_DOWN = """
e5:4 g5:4 b5:6 a5:2 | g5:4 e5:4 b4:8 | c5:4 e5:4 a5:4 c6:4 | a5:4 g5:4 d5:8
"""

FANFARE = """
e5:2 g5:2 c6:4 r:8 | f#5:2 a5:2 d6:4 r:8 | g5:2 b5:2 e6:4 r:8 | f#5:2 a5:2 d6:4 a5:2 f#5:2 e5:2 f#5:2
"""

# Off-beat synth-brass stabs under the tune.
STAB_STEPS = [2, 6, 10, 14]


def at_bar(notes: list[Note], bar: int) -> list[Note]:
    return shift(notes, bar * 4)


def _drums() -> list[Note]:
    notes: list[Note] = []
    full = {"kick": "X...x...X...x...", "clap": "....x.......x...", "hat": "x.x.x.x.x.x.x.x.", "tamb": "oxoxoxoxoxoxoxox"}
    lifted = dict(full, agogo="x..x..x...x.x...", open="..............x.")
    for bar in range(BARS):
        t = bar * 4
        if bar < S_A2:
            if bar == S_A2 - 1:
                notes += drums({"kick": "X...x...X...x...", "clap": "....x.......x...", "hat": "x.x.x.x.x.x.....", "snare": "............ooxX"}, t, vel=92)
            else:
                notes += drums(full, t, vel=92)
        elif bar < S_DOWN:
            if bar == S_DOWN - 1:
                notes += drums({"kick": "X...x...X.......", "clap": "....x.......x...", "hat": "x.x.x.x.x.......", "tom_hi": "..........xx....", "tom_mid": "............xx..", "tom_lo": "..............xX"}, t, vel=92)
            else:
                notes += drums(lifted, t, vel=92)
        elif bar < S_BUILD:
            notes += drums({"clap": "....x.......x...", "jingle": "x.x.x.x.x.x.x.x.", "hat": "..o...o...o...o."}, t, vel=84)
        elif bar < S_FINALE:
            k = bar - S_BUILD
            if k < 2:
                notes += drums({"kick": "x...x...x...x...", "clap": "....x.......x...", "jingle": "x.x.x.x.x.x.x.x."}, t, vel=84 + 4 * k)
            elif k == 2:
                notes += drums({"kick": "x.x.x.x.x.x.x.x.", "clap": "....x.......x...", "snare": "x.x.x.x.x.x.x.x.", "hat": "xxxxxxxxxxxxxxxx"}, t, vel=88)
            else:
                notes += drums({"kick": "x...x...x...x..."}, t, vel=96)
                notes += [Note(t + i * 0.25, 0.2, DRUM["snare"], 60 + 4 * i) for i in range(16)]
        else:
            if bar == BARS - 1:
                notes += drums({"kick": "X...x...X.......", "clap": "....x...........", "hat": "x.x.x.x.........", "tom_hi": "........xx......", "tom_mid": "..........xx....", "tom_lo": "............xxxX"}, t, vel=94)
            else:
                notes += drums(lifted if bar >= S_FINALE + 4 else full, t, vel=94)
    notes += drums({"crash": "X...............", "chime": "x..............."}, S_A * 4, vel=92)
    notes += drums({"crash": "X..............."}, S_A2 * 4, vel=86)
    notes += drums({"crash": "x..............."}, S_DOWN * 4, vel=80)
    notes += drums({"crash": "X...............", "crash2": "X...............", "jingle": "x..............."}, S_FINALE * 4, vel=96)
    notes += drums({"crash": "x..............."}, (S_FINALE + 4) * 4, vel=82)
    return notes


def song() -> Song:
    brass = melody(BRASS_TUNE, 0, vel=100, legato=0.9) + melody(FANFARE, S_BUILD * 4, vel=96, legato=0.9) + melody(FINALE_TUNE, S_FINALE * 4, vel=106, legato=0.9)
    glock = melody(BRASS_TUNE, 0, vel=60, transpose=12) + melody(FINALE_TUNE, S_FINALE * 4, vel=64, transpose=12)
    strings_tune = melody(STRINGS_TUNE, S_A2 * 4, vel=110, legato=0.95) + melody(DESCANT, S_FINALE * 4, vel=88, legato=0.98)
    runs = at_bar(arp(A2, 67, 84, step=0.25, pattern=[0, 1, 2, 3, 2, 1], size=4, vel=72, gate=0.6), S_A2) + at_bar(arp(FINALE, 67, 84, step=0.25, pattern=[0, 1, 2, 3, 2, 1], size=4, vel=74, gate=0.6), S_FINALE)
    stabs = comp(A + A2, 62, 76, steps=STAB_STEPS, length=0.3, size=3, vel=88) + at_bar(comp(FINALE, 62, 76, steps=STAB_STEPS, length=0.3, size=3, vel=92), S_FINALE)
    shimmer = pads(A, 67, 83, size=4, vel=70) + at_bar(pads(BUILD, 64, 81, size=4, vel=70), S_BUILD) + at_bar(pads(FINALE, 67, 83, size=4, vel=82), S_FINALE)
    choir = at_bar(pads(A2, 64, 79, size=3, vel=70), S_A2) + at_bar(pads(FINALE, 64, 79, size=3, vel=70), S_FINALE)
    pluck = at_bar(arp(DOWN + BUILD, 67, 86, step=0.25, pattern=[0, 2, 1, 3], vel=80), S_DOWN)
    bell = melody(BELL_DOWN, S_DOWN * 4, vel=92)
    octaves = [(0, 2, "R"), (2, 2, "8"), (4, 2, "R"), (6, 2, "8"), (8, 2, "R"), (10, 2, "8"), (12, 2, "R"), (14, 2, "8")]
    bass = (
        bass_line(A, octaves, octave_note=36, vel=100)
        + at_bar(bass_line(A2, [(0, 3, "R"), (3, 3, "R"), (6, 2, "8"), (8, 3, "R"), (11, 3, "5"), (14, 2, "8")], octave_note=36, vel=100), S_A2)
        + at_bar(bass_line(BUILD, [(s, 2, "R") for s in range(0, 16, 2)], octave_note=36, vel=96), S_BUILD)
        + at_bar(bass_line(FINALE, octaves, octave_note=36, vel=104), S_FINALE)
    )
    sub = at_bar(bass_line(DOWN, [(0, 16, "R")], octave_note=36, vel=70), S_DOWN)
    harp = []
    for bar in (3, 11, 27):
        harp += arpeggio(["g4", "a4", "b4", "d5", "e5", "g5", "a5", "b5"], bar * 4 + 3, 1.0, step=0.125, vel=72, gate=1.6)
    harp += arpeggio(["d4", "e4", "f#4", "a4", "d5", "e5", "f#5", "a5"], 15 * 4 + 3, 1.0, step=0.125, vel=72, gate=1.6)
    timpani = [Note(bar * 4, 1.0, 43, 104) for bar in (S_A, S_A2, S_FINALE, S_FINALE + 4)]
    timpani += [Note((S_FINALE - 1) * 4 + 2 + i * 0.125, 0.125, 38, 60 + i * 3) for i in range(16)]
    return Song(
        id="results",
        title="Lanterns Rise",
        bpm=112,
        bars=BARS,
        reverb_seconds=2.0,
        target_lufs=-15.5,
        parts=[
            Part("brass", BRASS, brass, Mix(gain_db=-2.5, pan=-0.1, reverb=0.24, highpass=180, eq=[("peak", 400, -2.5, 1.0), ("high_shelf", 5000, -2, 0.7)])),
            Part("glock", GLOCKENSPIEL, glock, Mix(gain_db=1, pan=0.4, reverb=0.3, lowpass=10000)),
            Part("strings", VIOLINS_FAST, strings_tune, Mix(gain_db=-3, pan=0.15, reverb=0.28, highpass=250, eq=[("high_shelf", 5000, -2, 0.7)])),
            Part("runs", VIOLINS_FAST, runs, Mix(gain_db=2, pan=0.35, reverb=0.22, highpass=300, width=1.3)),
            Part("stabs", BRASS_STAB, stabs, Mix(gain_db=-4, pan=-0.3, reverb=0.18, highpass=200, duck=0.25, eq=[("peak", 400, -3, 1.0)])),
            Part("shimmer", SUPERSAW_PAD.tweak(cutoff=2800), shimmer, Mix(gain_db=-9, reverb=0.25, highpass=280, width=1.4, duck=0.35)),
            Part("choir", CHOIR, choir, Mix(gain_db=-5, reverb=0.35, highpass=250, width=1.4)),
            Part("pluck", PLUCK, pluck, Mix(gain_db=-4, pan=-0.35, reverb=0.2, delay=0.18, highpass=260)),
            Part("bell", FM_BELL, bell, Mix(gain_db=0, pan=0.3, reverb=0.32, delay=0.16)),
            Part("bass", PUNCHY_BASS, bass, Mix(gain_db=-4, reverb=0.0, duck=0.25)),
            Part("sub", SUB_BASS, sub, Mix(gain_db=-4, reverb=0.0)),
            Part("harp", HARP, harp, Mix(gain_db=-3, pan=0.3, reverb=0.35, highpass=200)),
            Part("drums", KIT, _drums(), Mix(gain_db=-5.5, reverb=0.08, comp=(-16, 2.5), lowpass=15000)),
            Part("timpani", TIMPANI, timpani, Mix(gain_db=-8, reverb=0.25, width=0.5)),
            Part("sweep up", SWEEP_UP, [into(S_A2, beats=4, vel=70), into(BARS, beats=4, vel=60)], Mix(gain_db=-9, reverb=0.3)),
            Part("downlifter", DOWNLIFTER, [at(S_DOWN, beats=8, pitch="g4", vel=80)], Mix(gain_db=-8, reverb=0.3)),
            Part("riser", RISER, [into(S_FINALE, beats=8, pitch="d4", vel=88)], Mix(gain_db=-8, reverb=0.3)),
            Part("swell", REVERSE_SWELL, [into(S_FINALE, beats=4, pitch="g3", vel=80)], Mix(gain_db=-9, reverb=0.25)),
            Part("impact", IMPACT, [at(S_A, beats=4, pitch="g1", vel=72), at(S_FINALE, beats=4, pitch="g1", vel=92)], Mix(gain_db=-7, reverb=0.15, width=0.3)),
        ],
    )
