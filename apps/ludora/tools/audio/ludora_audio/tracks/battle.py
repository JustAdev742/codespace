"""Battle: "Spark Duel". Driving and heroic, never scary: friendly duels, races and giants.

E minor, 125 BPM, 40 bars (76.8 s).

- A, "Face-off" (bars 1-8): a chiptune lead states the theme over a squelchy
  sixteenth arpeggio, a driving eighth-note bass, synth brass stabs and the arcade kit.
- B, "Rally" (9-16): the theme answers itself in climbing sequences; staccato strings
  and a brass riff join, the hats double up and a riser and an impact launch the chorus.
- C, "Hero chorus" (17-24): a lift to G major. A singing lead plays the big tune over a
  wide supersaw pad, a sub an octave down, taiko hits and open hats.
- D, "Second wind" (25-32): a half-time breather. A pluck plays the theme's head over a
  dark pad and long sub notes; the snare builds back from eighths to sixteenths while
  the arpeggio's filter opens.
- E, "Final chorus" (33-40): the tune again with horns underneath, strings and doubled
  hats, ending on B major and a tom fill that turns round to the top.
"""

from ..instruments import FRENCH_HORNS, TAIKO, VIOLINS_FAST
from ..kit import KIT_ARCADE
from ..notation import Mix, Note, Part, Song, drums, melody
from ..patches import ARP_SYNTH, BRASS_STAB, BRIGHT_LEAD, CHIP_LEAD, PLUCK, PUNCHY_BASS, SUB_BASS, SUPERSAW_PAD
from ..theory import arp, bass_line, comp, pads, voice_lead
from ..transitions import DOWNLIFTER, IMPACT, REVERSE_SWELL, RISER, SWEEP_UP, at, into

BARS = 40
BPM = 125

A = ["Em", "Em", "C", "D", "Em", "Em", "Am C", "B"]
B = ["C", "D", "Bm", "Em", "Am", "C", "Dsus4", "D"]
C = ["G", "D/F#", "Em", "C", "G", "Bm", "C", "D"]
D = ["Em", "Em", "C", "C", "Am", "Am", "C", "D"]
E = ["G", "D/F#", "Em", "C", "G", "Bm", "C", "B"]
PROGRESSION = A + B + C + D + E

# The theme: a rising call and a falling answer, in sixteenths.
THEME = [
    "b4:2 e5:2 g5:2 b5:4 a5:2 g5:2 f#5:2",
    "g5:3 e5:3 b4:2 r:2 e5:1 f#5:1 g5:2 a5:2",
    "c6:2 b5:2 g5:2 e5:4 g5:2 c6:2 e6:2",
    "d6:6 c6:2 b5:2 a5:2 f#5:2 a5:2",
    "b4:2 e5:2 g5:2 b5:4 a5:2 g5:2 f#5:2",
    "g5:3 b5:3 e6:2 r:2 d6:1 e6:1 f#6:2 g6:2",
    "e6:3 c6:3 a5:2 g5:3 e5:3 c5:2",
    "f#5:3 d#5:3 b4:2 d#5:2 f#5:2 a5:2 b5:2",
]
# The rally: a repeated-note figure climbing in sequence.
RALLY = [
    "e5:2 e5:2 g5:2 e5:2 c6:4 b5:2 g5:2",
    "f#5:2 f#5:2 a5:2 f#5:2 d6:4 c6:2 a5:2",
    "d6:2 d6:2 f#6:2 d6:2 b5:4 a5:2 f#5:2",
    "g5:6 f#5:2 e5:4 b4:4",
    "a5:2 a5:2 c6:2 a5:2 e6:4 d6:2 c6:2",
    "e6:2 e6:2 g6:2 e6:2 c6:4 b5:2 g5:2",
    "a5:4 g5:4 a5:4 d6:4",
    "f#6:8 r:2 d6:2 e6:2 f#6:2",
]
# The chorus: wide leaps and long notes.
CHORUS = [
    "d5:2 g5:4 a5:2 b5:6 d6:2",
    "d6:4 c6:2 a5:2 f#5:6 d5:2",
    "e5:2 g5:4 a5:2 b5:6 e6:2",
    "e6:4 d6:2 c6:2 g5:8",
    "d5:2 g5:4 a5:2 b5:6 d6:2",
    "f#6:4 e6:2 d6:2 b5:6 d6:2",
    "e6:4 d6:2 c6:2 g6:4 e6:4",
]
CHORUS_END_C = "f#6:8 e6:4 d6:4"
CHORUS_END_E = "d#6:8 f#6:4 b5:4"
# The breather: the theme's head on each chord, answered, then climbing back.
BREATHER = [
    "b4:2 e5:2 g5:2 b5:4 r:6",
    "r:8 a5:2 g5:2 f#5:2 e5:2",
    "c5:2 e5:2 g5:2 c6:4 r:6",
    "r:8 b5:2 g5:2 e5:2 g5:2",
    "a4:2 c5:2 e5:2 a5:4 r:6",
    "r:8 b5:2 c6:2 b5:2 a5:2",
    "g5:2 e5:2 g5:2 c6:2 e6:2 c6:2 e6:2 g6:2",
    "f#6:4 e6:4 d6:4 a5:4",
]


def _in(notes: list[Note], *bars: tuple[int, int]) -> list[Note]:
    """Only the notes that start inside the given [first bar, end bar) ranges."""
    return [n for n in notes if any(a * 4 <= n.start + 1e-9 < b * 4 for a, b in bars)]


def _ramp(notes: list[Note], first: int, end: int, v0: float, v1: float) -> list[Note]:
    """Scales velocities from v0 to v1 (multipliers) across bars [first, end)."""
    out = []
    for n in notes:
        if first * 4 <= n.start < end * 4:
            k = v0 + (v1 - v0) * (n.start - first * 4) / ((end - first) * 4)
            n = Note(n.start, n.dur, n.pitch, max(1, min(127, round(n.vel * k))))
        out.append(n)
    return out


def _tune(bars: list[str], start_bar: int, vel: int, transpose: int = 0, legato: float = 0.9) -> list[Note]:
    return melody(" | ".join(bars), start_bar * 4, vel=vel, transpose=transpose, legato=legato)


def _hits(progression: list[str], low: int, high: int, hits: list[tuple[int, int, float, int]], size: int = 3) -> list[Note]:
    """Chord stabs at (bar, sixteenth step, length in beats, velocity), voiced inside [low, high]."""
    voiced = voice_lead(progression, low, high, size)
    out = []
    for bar, step, length, vel in hits:
        t = bar * 4 + step * 0.25
        chord = next(v for (st, _, v) in reversed(voiced) if st <= t + 1e-9)
        out += [Note(t, length, p, vel) for p in chord]
    return out


def _drums() -> list[Note]:
    n: list[Note] = []
    for bar in range(BARS):
        t = bar * 4
        if bar < 8:
            kick = "X.....x.X......." if bar == 7 else "X.....x.X.x....."
            snare = "....X.......X.oo" if bar in (3, 7) else "....X.......X..."
            n += drums({"kick": kick, "snare": snare, "hat": "x.x.x.x.x.x.x.x."}, t, vel=92)
        elif bar < 16:
            if bar == 15:
                n += drums({"kick": "X.....x.X.......", "snare": "....X...x.x.xxxx", "clap": "....x...........", "hat": "xoxoxoxo........", "tom_hi": "........x.......", "tom_mid": "..........x.....", "tom_lo": "............x.x."}, t, vel=94)
            else:
                n += drums({"kick": "X.....x.X.....x.", "snare": "....X.......X...", "hat": "xoxoxoxoxoxoxoxo"}, t, vel=92)
                if bar >= 12:
                    n += drums({"clap": "....x.......x..."}, t, vel=88)
        elif bar < 24 or bar >= 32:
            # The choruses: open hats on the offbeats, claps on the snare.
            last = bar in (23, 39)
            kick = "X.....x.X......." if last else "X.....x.X.x...x."
            n += drums({"snare": "....x.......x..."}, t, vel=106)
            n += drums({"kick": kick, "clap": "....x.......x...", "open": "..x...x...x...x." if not last else "..x...x.........", "pedal": "x...x...x...x..."}, t, vel=94)
            if bar >= 32 and not last:
                n += drums({"hat": ".x.x.x.x.x.x.x.x"}, t, vel=70)
            if bar == 23:
                n += drums({"snare": "........x.x.xxxx", "tom_lo": "..............x."}, t, vel=90)
            if bar == 39:
                n += drums({"tom_hi": "........x.x.....", "tom_mid": "............x...", "tom_lo": "..............xx", "snare": ".........x.x.x.."}, t, vel=96)
        else:
            # The breather: half time, then the snare builds from eighths to sixteenths.
            if bar < 28:
                n += drums({"kick": "X.........x.....", "hat": "x...x...x...x...", "rim": "........x......."}, t, vel=86)
            elif bar < 30:
                n += drums({"kick": "X.......X.......", "hat": "x.x.x.x.x.x.x.x.", "snare": "x.x.x.x.x.x.x.x."}, t, vel=84)
            else:
                n += drums({"kick": "X...X...X...X..." if bar == 30 else "X...X...X...X.X.", "snare": "xxxxxxxxxxxxxxxx", "hat": "x.x.x.x.x.x.x.x."}, t, vel=86)
    n = _ramp(n, 28, 32, 0.6, 1.2)
    for bar, lane, vel in ((0, "crash", 88), (8, "crash", 92), (16, "crash", 104), (20, "crash2", 92), (32, "crash", 106), (36, "crash2", 94)):
        n += drums({lane: "X..............."}, bar * 4, vel=vel)
    return n


def song() -> Song:
    chip = _tune(THEME + RALLY, 0, vel=96)
    lead = _tune(CHORUS + [CHORUS_END_C], 16, vel=100, legato=0.96) + _tune(CHORUS + [CHORUS_END_E], 32, vel=104, legato=0.96)
    horns = _tune(CHORUS + [CHORUS_END_E], 32, vel=88, transpose=-12, legato=0.95)
    pluck = _tune(BREATHER, 24, vel=94)

    arps = arp(PROGRESSION, 67, 86, step=0.25, pattern=[0, 1, 2, 3, 2, 1, 2, 3], size=4, vel=88, gate=0.55)
    arps = _ramp(_in(arps, (0, 16), (24, 40)), 24, 32, 0.62, 1.15)
    strings = _in(arp(PROGRESSION, 67, 81, step=0.5, pattern=[0, 1, 2, 1], size=3, vel=86, gate=0.4), (8, 16), (32, 40))
    stabs = _hits(PROGRESSION, 62, 74, [(b, 0, 0.35, 104) for b in range(0, 8, 2)] + [(b, 14, 0.25, 96) for b in (1, 3, 5)] + [(7, 0, 0.35, 100), (7, 6, 0.35, 100), (7, 12, 0.5, 106)])
    stabs += _in(comp(PROGRESSION, 62, 74, steps=[0, 3, 6, 12], length=0.25, size=3, vel=96, accent={0: 8}), (8, 16))
    stabs += _in(comp(PROGRESSION, 64, 76, steps=[0, 6, 10], length=0.3, size=3, vel=98, accent={0: 8}), (16, 24), (32, 40))
    pad = _in(pads(PROGRESSION, 64, 81, size=4, vel=78), (16, 24), (32, 40))
    dark_pad = _in(pads(PROGRESSION, 62, 76, size=4, vel=72), (24, 32))

    drive = [(0, 2, "R"), (2, 2, "R"), (4, 2, "8"), (6, 2, "R"), (8, 2, "R"), (10, 2, "R"), (12, 2, "8"), (14, 2, "5")]
    bass = _in(bass_line(PROGRESSION, drive, octave_note=40, vel=100), (0, 24), (32, 40))
    # A sine an octave under the bass's roots in the choruses (none under E1), and long notes in the breather.
    sub = [Note(n.start, 1.5, n.pitch - 12, 96) for n in _in(bass, (16, 24), (32, 40)) if (n.start % 4) in (0.0, 2.0) and n.pitch - 12 >= 28]
    sub += _in(bass_line(PROGRESSION, [(0, 14, "R")], octave_note=36, vel=92), (24, 28))
    sub += _in(bass_line(PROGRESSION, [(0, 4, "R"), (6, 2, "R"), (8, 4, "R"), (12, 2, "8"), (14, 2, "R")], octave_note=36, vel=96), (28, 32))
    taiko = [Note(b * 4, 1.0, 50, 110) for b in (16, 18, 20, 22, 32, 34, 36, 38)] + [Note(b * 4 + 3, 0.5, 50, 96) for b in (17, 19, 21, 33, 35, 37)] + [Note(b * 4 + 3.5, 0.5, 50, 104) for b in (17, 19, 21, 33, 35, 37)]

    return Song(
        id="battle",
        title="Spark Duel",
        bpm=BPM,
        bars=BARS,
        reverb_seconds=1.5,
        target_lufs=-16.0,
        parts=[
            Part("chip", CHIP_LEAD, chip, Mix(gain_db=-0.5, pan=0.05, reverb=0.15, delay=0.12, highpass=300)),
            Part("lead", BRIGHT_LEAD.tweak(cutoff=2800), lead, Mix(gain_db=-2, reverb=0.2, delay=0.14, highpass=250, eq=[("peak", 330, -4, 1.2), ("peak", 520, -2, 1.0), ("high_shelf", 6000, 2, 0.7)])),
            Part("horns", FRENCH_HORNS, horns, Mix(gain_db=-7, pan=-0.2, reverb=0.25, highpass=200, eq=[("peak", 400, -3, 1.0)])),
            Part("pluck", PLUCK, pluck, Mix(gain_db=-1, pan=-0.1, reverb=0.25, delay=0.25, highpass=250)),
            Part("arp", ARP_SYNTH, arps, Mix(gain_db=-4, pan=0.3, reverb=0.12, delay=0.08, highpass=350, duck=0.3, width=1.4)),
            Part("strings", VIOLINS_FAST, strings, Mix(gain_db=0, pan=-0.3, reverb=0.2, highpass=300, width=1.6)),
            Part("brass", BRASS_STAB, stabs, Mix(gain_db=-5, pan=-0.1, reverb=0.18, highpass=220, eq=[("peak", 420, -3, 1.0)], width=1.3)),
            Part("pad", SUPERSAW_PAD, pad, Mix(gain_db=-7, reverb=0.25, highpass=300, duck=0.35, width=1.7, eq=[("peak", 500, -2, 1.0), ("high_shelf", 7000, 2, 0.7)])),
            Part("dark pad", SUPERSAW_PAD.tweak(cutoff=1500, attack=0.6), dark_pad, Mix(gain_db=-8, reverb=0.3, highpass=280, width=1.8)),
            Part("bass", PUNCHY_BASS, bass, Mix(gain_db=-2.5, reverb=0.0, duck=0.3, eq=[("peak", 300, -3, 1.0)])),
            Part("sub", SUB_BASS, sub, Mix(gain_db=-3, reverb=0.0, duck=0.4)),
            Part("drums", KIT_ARCADE, _drums(), Mix(gain_db=-3.5, reverb=0.08, comp=(-16, 2.5))),
            Part("taiko", TAIKO, taiko, Mix(gain_db=-3.5, reverb=0.22, highpass=45)),
            Part("sweep", SWEEP_UP, [into(8, beats=4, vel=80)], Mix(gain_db=-12, reverb=0.3)),
            Part("riser", RISER, [into(16, beats=8, pitch="d3", vel=90), into(32, beats=8, pitch="d3", vel=95)], Mix(gain_db=-10, reverb=0.3)),
            Part("impact", IMPACT, [at(16, beats=4, pitch="g1", vel=90), at(32, beats=4, pitch="g1", vel=95)], Mix(gain_db=-8, reverb=0.15)),
            Part("downlifter", DOWNLIFTER, [at(24, beats=8, pitch="e3", vel=85)], Mix(gain_db=-10, reverb=0.3)),
            Part("swell", REVERSE_SWELL, [into(32, beats=4, pitch="g4", vel=85)], Mix(gain_db=-9, reverb=0.25)),
        ],
    )
