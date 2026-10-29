"""Game: "Festival Run". The steady music under the questions.

F major, 112 BPM, 32 bars (68.6 s). Light and always moving, but it leaves room
to think: a marimba ostinato and a bouncing round bass carry it, and the tunes
are short figures with rests between them, never a busy lead over the reading.

- A (bars 1-8): the ostinato, a vibraphone figure answered by silence, a soft
  pad, four-on-the-floor kick with offbeat hats.
- A' (9-16): an FM bell takes the figure and a woody mallet adds a
  syncopated counter-rhythm; shaker and tambourine.
- B (17-24): new chords, offbeat warm-key chops and a slow, breathy line in
  long notes; the kick halves its pace, congas come in.
- Breakdown (25-28): the kick and bass rest; the ostinato goes on softly under
  the pad and the bell.
- Build (29-32): the kick returns, the bell climbs, a riser and a snare build
  land on a soft impact at the top.

Every low is mono: the bass and kick are mono synths, and every soundfont part
is high-passed well above them.
"""

from ..instruments import GLOCKENSPIEL, MARIMBA, VIBRAPHONE
from ..kit import KIT_FESTIVAL
from ..notation import DRUM, Mix, Note, Part, Song, drums, melody, shift
from ..patches import FM_BELL, MALLET, ROUND_BASS, SOFT_LEAD, SOFT_PAD, WARM_KEYS
from ..theory import arp, bass_line, comp, pads
from ..transitions import IMPACT, REVERSE_SWELL, RISER, SWEEP_DOWN, SWEEP_UP, at, into

BARS = 32

A = ["F", "C/E", "Dm7", "Bbmaj7", "F", "C", "Bbmaj7", "C7sus4 C7"]
A2 = ["Dm7", "Am7", "Bbmaj7", "F/A", "Gm7", "C", "Bbmaj7", "Gm7 C7"]
B = ["Bbmaj7", "C", "Am7", "Dm7", "Gm7", "Am7", "Bbmaj7", "Csus4 C"]
DOWN = ["Dm7", "Bbmaj7", "Gm7", "Csus4 C"]
BUILD = ["Bbmaj7", "C", "Dm7", "C/E"]
PROGRESSION = A + A2 + B + DOWN + BUILD
S_A, S_A2, S_B, S_DOWN, S_BUILD = 0, 8, 16, 24, 28

# A: a one-bar figure, then a bar of space.
FIGURE_A = """
c5:2 f5:2 a5:4 g5:2 f5:2 c5:4 | e5:8 r:8 |
d5:2 f5:2 a5:4 g5:2 f5:2 d5:4 | f5:6 d5:2 r:8 |
c5:2 f5:2 a5:4 c6:4 a5:4 | g5:8 r:8 |
f5:2 g5:2 a5:4 d6:4 c6:4 | bb5:6 g5:2 e5:8
"""

# A': the bell's version over the second half's chords.
FIGURE_A2 = """
a5:2 f5:2 d5:4 e5:2 f5:2 a5:4 | c6:8 r:8 |
bb5:2 a5:2 f5:4 d5:2 f5:2 bb5:4 | a5:8 r:8 |
g5:2 a5:2 bb5:4 d6:4 bb5:4 | c6:8 r:4 g5:2 a5:2 |
bb5:4 a5:2 f5:2 d5:8 | d5:4 f5:4 e5:4 g5:4
"""

# B: a slow line in long notes.
LINE_B = """
d6:8 c6:4 a5:4 | g5:8 e5:8 | c6:8 a5:4 g5:4 | f5:8 a5:8 |
bb5:8 a5:4 g5:4 | e5:8 c6:8 | d6:8 c6:4 bb5:4 | c6:4 bb5:4 g5:8
"""

BELL_DOWN = """
r:4 d5:2 f5:2 a5:8 | r:4 d5:2 f5:2 bb5:8 | r:4 d5:2 g5:2 bb5:8 | c6:8 g5:4 e5:4
"""

BELL_BUILD = """
f5:2 g5:2 a5:4 r:8 | e5:2 g5:2 c6:4 r:8 | f5:2 a5:2 d6:4 r:8 | g5:2 c6:2 e6:4 r:4 c6:2 e6:2
"""


def at_bar(notes: list[Note], bar: int) -> list[Note]:
    return shift(notes, bar * 4)


def on_steps(notes: list[Note], steps: set[int], length: float = 0.2) -> list[Note]:
    """Only the notes on these sixteenth steps of each bar, cut short: a syncopated rhythm from a running arpeggio."""
    return [Note(n.start, length, n.pitch, n.vel) for n in notes if round((n.start % 4) / 0.25) in steps]


def _drums() -> list[Note]:
    notes: list[Note] = []
    groove_a = {"kick": "X...x...X...x...", "hat": "o.x.o.x.o.x.o.x.", "rim": "....x.......x..."}
    groove_a2 = {"kick": "X...x...X...x...", "hat": "..x...x...x...x.", "rim": "....x.......x...", "shaker": "oxoxoxoxoxoxoxox", "tamb": "....x.......x..."}
    groove_b = {"kick": "X.......X.......", "hat": "x.x.x.x.x.x.x.x.", "rim": "....x.......x...", "conga_hi": "..x..x....x..x..", "conga_lo": "x.......x......."}
    for bar in range(BARS):
        t = bar * 4
        if bar < S_A2:
            if bar == S_A2 - 1:
                notes += drums({"kick": "X...x...X.......", "hat": "..x...x...x.....", "rim": "....x...........", "snare": "............ooxX"}, t, vel=80)
            else:
                notes += drums(groove_a, t, vel=80)
        elif bar < S_B:
            if bar == S_B - 1:
                notes += drums({"kick": "X...x...X.......", "hat": "..x...x.........", "shaker": "oxoxoxoxoxoxoxox", "tom_hi": "..........xx....", "tom_mid": "............xx..", "tom_lo": "..............xx"}, t, vel=80)
            else:
                notes += drums(groove_a2, t, vel=82)
        elif bar < S_DOWN:
            notes += drums(groove_b, t, vel=78)
            if bar == S_DOWN - 1:
                notes += drums({"open": "..............x."}, t, vel=70)
        elif bar < S_BUILD:
            notes += drums({"hat": "..x...x...x...x.", "shaker": "oxoxoxoxoxoxoxox"}, t, vel=70)
        else:
            k = bar - S_BUILD
            if k < 2:
                notes += drums({"kick": "x...x...x...x...", "hat": "..x...x...x...x.", "shaker": "oxoxoxoxoxoxoxox"}, t, vel=74 + 4 * k)
            elif k == 2:
                notes += drums({"kick": "x...x...x...x...", "hat": "..x...x...x...x.", "clap": "....x.......x...", "shaker": "oxoxoxoxoxoxoxox"}, t, vel=82)
            else:
                notes += drums({"kick": "x...x...x...x...", "hat": "..x...x........."}, t, vel=84)
                notes += [Note(t + s * 0.25, 0.2, DRUM["snare"], 44 + 5 * i) for i, s in enumerate(range(4, 16))]
    notes += drums({"crash": "x..............."}, S_A * 4, vel=72)
    notes += drums({"crash": "x..............."}, S_A2 * 4, vel=66)
    notes += drums({"splash": "x..............."}, S_B * 4, vel=60)
    for bar in (3, 11):
        notes += drums({"triangle": "............x..."}, bar * 4, vel=56)
    return notes


def song() -> Song:
    ostinato_pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    ostinato = (
        arp(A + A2 + B, 69, 88, step=0.5, pattern=ostinato_pattern, vel=78)
        + at_bar(arp(DOWN, 69, 88, step=0.5, pattern=ostinato_pattern, vel=62), S_DOWN)
        + at_bar(arp(BUILD, 69, 88, step=0.5, pattern=ostinato_pattern, vel=72), S_BUILD)
    )
    counter = at_bar(on_steps(arp(A2, 67, 84, step=0.25, pattern=[2, 0, 3, 1], vel=84), {0, 3, 6, 10, 12}), S_A2) + at_bar(on_steps(arp(BUILD[2:], 67, 84, step=0.25, pattern=[2, 0, 3, 1], vel=76), {0, 3, 6, 10, 12}), S_BUILD + 2)
    vibes = melody(FIGURE_A, 0, vel=90)
    bell = melody(FIGURE_A2, S_A2 * 4, vel=88) + melody(BELL_DOWN, S_DOWN * 4, vel=84) + melody(BELL_BUILD, S_BUILD * 4, vel=86)
    line = melody(LINE_B, S_B * 4, vel=86, legato=0.94)
    chops = at_bar(comp(B, 64, 79, steps=[2, 6, 10, 14], length=0.22, size=3, vel=76), S_B)
    pad = pads(A + A2 + B + DOWN + BUILD, 69, 84, size=3, vel=62)
    bounce = [(0, 4, "R"), (4, 2, "5"), (6, 2, "8"), (8, 4, "R"), (12, 2, "5"), (14, 2, "C")]
    bass = (
        bass_line(A + A2, bounce, octave_note=36, vel=96)
        + at_bar(bass_line(B, [(0, 6, "R"), (6, 2, "8"), (8, 6, "R"), (14, 2, "A")], octave_note=36, vel=90), S_B)
        + at_bar(bass_line(DOWN[2:], [(0, 16, "R")], octave_note=36, vel=72), S_DOWN + 2)
        + at_bar(bass_line(BUILD, [(0, 2, "R"), (2, 2, "R"), (4, 2, "R"), (6, 2, "R"), (8, 2, "R"), (10, 2, "R"), (12, 2, "8"), (14, 2, "R")], octave_note=36, vel=88), S_BUILD)
    )
    sparkle = []
    for bar in (7, 15):
        sparkle += melody("f6:1 a6:1 c7:1 f7:1", bar * 4 + 3, vel=56)
    return Song(
        id="game",
        title="Festival Run",
        bpm=112,
        bars=BARS,
        reverb_seconds=1.7,
        target_lufs=-17.0,
        parts=[
            Part("marimba", MARIMBA, ostinato, Mix(gain_db=-2.5, pan=-0.4, reverb=0.16, delay=0.08, highpass=300, eq=[("peak", 600, -1.5, 0.9)])),
            Part("mallet", MALLET, counter, Mix(gain_db=-4, pan=0.5, reverb=0.2, delay=0.12)),
            Part("vibes", VIBRAPHONE, vibes, Mix(gain_db=0.5, pan=0.25, reverb=0.25, delay=0.14, highpass=250, eq=[("peak", 500, -2.5, 0.9)])),
            Part("bell", FM_BELL, bell, Mix(gain_db=-1.5, pan=0.35, reverb=0.3, delay=0.16)),
            Part("line", SOFT_LEAD, line, Mix(gain_db=-9, pan=-0.05, reverb=0.32, delay=0.12, highpass=300)),
            Part("chops", WARM_KEYS, chops, Mix(gain_db=-7, pan=-0.45, reverb=0.18, highpass=250, eq=[("peak", 400, -3, 1.0)])),
            Part("pad", SOFT_PAD.tweak(cutoff=2200), pad, Mix(gain_db=-11, reverb=0.3, highpass=300, width=1.7, duck=0.3, eq=[("high_shelf", 3000, 3, 0.7)])),
            Part("bass", ROUND_BASS, bass, Mix(gain_db=-5.5, reverb=0.0, duck=0.15)),
            Part("drums", KIT_FESTIVAL, _drums(), Mix(gain_db=-5, reverb=0.08, comp=(-18, 2.0), lowpass=15000)),
            Part("glock", GLOCKENSPIEL, sparkle, Mix(gain_db=-9, pan=0.45, reverb=0.4, delay=0.2)),
            Part("sweep up", SWEEP_UP, [into(S_A2, beats=4, vel=50)], Mix(gain_db=-11, reverb=0.3)),
            Part("swell", REVERSE_SWELL, [into(S_B, beats=4, pitch="bb3", vel=60)], Mix(gain_db=-10, reverb=0.3)),
            Part("sweep down", SWEEP_DOWN, [at(S_DOWN, beats=8, vel=55)], Mix(gain_db=-10, reverb=0.35)),
            Part("riser", RISER, [into(BARS, beats=8, pitch="c4", vel=70)], Mix(gain_db=-10, reverb=0.3)),
            Part("impact", IMPACT, [at(0, beats=4, pitch="f1", vel=55)], Mix(gain_db=-10, reverb=0.15, width=0.3)),
        ],
    )
