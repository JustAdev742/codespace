"""Market: "Night Market Bounce". Bouncy and playful, for the trading and tycoon modes.

B-flat major, 112 BPM, 32 bars (68.6 s), with a light swing on the sixteenths.

- A, "Stalls open" (bars 1-8): a woody mallet states the tune over offbeat keys, a
  round bouncing bass and a light festival kit of rim, shaker and congas.
- B, "Busy lanes" (9-16): steel drums take the tune and finish it a new way, a
  clarinet answers in long notes, claps, hats and a tambourine fill the groove and a
  pluck sparkles on top. A reverse swell and a crash lead in.
- C, "Lantern alley" (17-24): the kick drops out. Pizzicato strings bounce under a
  soft pad while a lantern bell and the mallet trade phrases; the kick comes back
  and a riser climbs into the last section.
- D, "Festival" (25-32): an impact, then everything: steel drums with a xylophone an
  octave up, the clarinet higher, brass stabs, a wide pad, chimes and a conga fill
  that turns round to the top.
"""

import dataclasses

from ..instruments import CLARINET, STEEL_DRUMS, VIOLINS_PIZZICATO, XYLOPHONE
from ..kit import KIT_FESTIVAL
from ..notation import DRUM, Mix, Note, Part, Song, drums, melody
from ..patches import BRASS_STAB, FM_BELL, MALLET, PLUCK, ROUND_BASS, SOFT_PAD, SUB_BASS, SUPERSAW_PAD, WARM_KEYS
from ..theory import arp, bass_line, comp, pads, voice_lead
from ..transitions import DOWNLIFTER, IMPACT, REVERSE_SWELL, RISER, SWEEP_DOWN, at, into

BARS = 32
BPM = 112
# How late an offbeat sixteenth lands, in beats: about a 57% swing.
SWING = 0.035
# Hand percussion plays on its own, wider part; the congas a little down, as they ring around 330 Hz.
PERC = {DRUM[k] for k in ("conga_hi", "conga_lo", "conga_mute", "shaker", "tamb", "agogo", "jingle", "chime", "bongo_hi", "bongo_lo")}
KIT_PERC = dataclasses.replace(KIT_FESTIVAL, name="festival perc", levels=(("conga_hi", -2.5), ("conga_lo", -2.5)))

A = ["Bb", "Gm7", "Ebmaj7", "F", "Bb", "Dm7 G7", "Cm7", "F7"]
B = ["Bb", "Gm7", "Ebmaj7", "F", "Gm7", "Cm7", "Eb F", "Bb7"]
C = ["Ebmaj7", "F", "Dm7", "Gm7", "Cm7", "Dm7", "Ebmaj7", "F7sus4 F7"]
D = ["Bb", "Gm7", "Ebmaj7", "F", "Bb", "Dm7 G7", "Cm7 F7", "Bb F7"]
PROGRESSION = A + B + C + D

# The tune, bar by bar: a bouncing figure that climbs in sequence and answers itself.
T = [
    "d5:2 f5:2 r:1 g5:1 f5:2 d5:2 c5:2 bb4:2 c5:2",
    "d5:3 bb4:3 g4:2 r:2 bb4:1 c5:1 d5:2 f5:2",
    "g5:2 f5:2 r:1 g5:1 bb5:2 g5:2 f5:2 eb5:2 d5:2",
    "c5:3 a4:3 f4:2 r:4 c5:2 eb5:2",
    "d5:2 f5:2 r:1 g5:1 f5:2 d5:2 c5:2 bb4:2 c5:2",
    "d5:3 f5:3 a5:2 b5:3 a5:1 g5:2 f5:2",
    "eb5:2 g5:2 r:1 bb5:1 c6:2 bb5:2 g5:2 eb5:2 c5:2",
    "f5:3 eb5:3 c5:2 a4:2 c5:2 eb5:2 f5:2",
]
# B finishes the tune higher, and turns towards E-flat.
B_END = [
    "bb5:2 d6:2 r:1 bb5:1 a5:2 g5:2 f5:2 d5:2 f5:2",
    "g5:3 eb5:3 c5:2 r:2 c5:1 d5:1 eb5:2 g5:2",
    "bb5:3 g5:3 eb5:2 a5:3 c6:3 f5:2",
    "bb5:4 ab5:2 f5:2 d5:2 r:2 bb4:2 r:2",
]
D_END = [
    "eb5:2 g5:2 c6:2 bb5:2 a5:2 f5:2 eb5:2 c5:2",
    "d5:3 bb4:3 f4:2 a4:2 c5:2 eb5:2 c5:2",
]

# The clarinet's answers: long notes on the chords' thirds and sevenths, higher in D.
CLARINET_B = "d5:12 c5:4 | bb4:8 r:4 d5:2 eb5:2 | d5:12 bb4:4 | a4:8 r:4 c5:2 d5:2 | d5:12 c5:2 bb4:2 | bb4:8 r:4 g4:2 bb4:2 | g5:8 a5:8 | ab5:8 f5:4 d5:4"
CLARINET_D = "f5:12 d5:4 | bb4:8 r:4 f5:2 g5:2 | g5:12 f5:4 | f5:8 r:4 eb5:2 f5:2 | f5:12 eb5:2 d5:2 | f5:8 f5:8 | g5:8 a5:8 | bb5:8 a5:8"

# Lantern alley: the bell calls, the mallet answers, and both climb into the last section.
BELL_C = "g5:4 bb5:4 d6:6 c6:2 | a5:4 c6:4 f5:8 | r:16 | r:16 | eb6:4 d6:4 c6:4 bb5:4 | a5:4 f5:4 d5:8 | g5:2 bb5:2 d6:2 bb5:2 g5:2 bb5:2 d6:2 f6:2 | eb6:4 f6:4 eb6:2 c6:2 a5:2 f5:2"
MALLET_C = "r:16 | r:16 | r:2 a5:2 f5:2 d5:2 c5:2 d5:2 f5:4 | r:2 bb5:2 g5:2 d5:2 f5:2 g5:2 bb5:4 | r:16 | r:8 r:2 f5:2 a5:2 c6:2 | d6:2 r:2 bb5:2 r:2 d6:2 r:2 f6:2 r:2 | f6:4 r:4 c6:2 a5:2 f5:2 c5:2"


def _swing(notes: list[Note], amount: float = SWING) -> list[Note]:
    """Every note on an offbeat sixteenth lands a little late, and ends no later for it."""
    out = []
    for n in notes:
        steps = n.start * 4
        if abs(steps - round(steps)) < 1e-6 and round(steps) % 2 == 1:
            out.append(Note(n.start + amount, max(0.05, n.dur - amount), n.pitch, n.vel))
        else:
            out.append(n)
    return out


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
            # A: rim, shaker and congas, a light kick.
            kick = "X.....x.X.....x." if bar in (3, 7) else "X.....x.X......."
            n += drums({"kick": kick, "rim": "....x.......x..o", "shaker": "xoxoxoxoxoxoxoxo"}, t, vel=84)
            if bar == 7:
                n += drums({"conga_hi": "..x...x...xx.xx.", "conga_lo": "x.......x.....xx"}, t, vel=84)
            else:
                n += drums({"conga_hi": "..x....x..x..x..", "conga_lo": "x.......x......."}, t, vel=80)
            if bar in (5, 6, 7):
                n += drums({"hat": "..x...x...x...x."}, t, vel=70)
        elif bar < 16:
            # B: claps, hats and a tambourine; a festival bell in the second half.
            n += drums({"kick": "X.....x.X.....x.", "clap": "....X.......X...", "hat": "x.x.x.x.x.x.x.x.", "shaker": ".o.o.o.o.o.o.o.o", "tamb": "..x...x...x...x."}, t, vel=88)
            if bar == 15:
                n += drums({"tom_hi": "............x...", "tom_mid": ".............x..", "tom_lo": "..............xx"}, t, vel=86)
                n += drums({"conga_hi": "..x...x........."}, t, vel=80)
            else:
                n += drums({"conga_hi": "..x....x..x..x..", "conga_lo": "x.......x......."}, t, vel=82)
            if bar in (11,):
                n += drums({"open": "..............x."}, t, vel=78)
            if bar >= 12:
                n += drums({"agogo": "x.....x...x....."}, t, vel=74)
        elif bar < 24:
            # C: no kick at first, then it comes back and the claps build.
            n += drums({"shaker": "xoxoxoxoxoxoxoxo", "conga_hi": "..x....x..x..x..", "conga_lo": "x.......x......."}, t, vel=66 if bar < 20 else 76)
            if bar >= 20:
                n += drums({"kick": "X.......X......." if bar < 22 else "X.....x.X.....x."}, t, vel=86)
            if bar == 22:
                n += drums({"clap": "....x.......x..."}, t, vel=80)
            if bar == 23:
                build = drums({"clap": "x.x.x.x.xxxxxxxx", "kick": "X...X...X...X..."}, t, vel=88)
                n += _ramp(build, 23, 24, 0.55, 1.15)
        else:
            # D: the full groove, with a conga and tom fill into the top.
            kick = "X.....x.X......." if bar == 31 else "X.....x.X.....x."
            n += drums({"kick": kick, "clap": "....X.......X...", "hat": "x.x.x.x.x.x.x.x.", "shaker": ".o.o.o.o.o.o.o.o", "tamb": "..x...x...x...x.", "agogo": "x.....x...x....."}, t, vel=90)
            if bar == 31:
                n += drums({"conga_hi": "..x...x.x.x.xx..", "conga_lo": "x.......x...x..x", "tom_mid": "............x...", "tom_lo": "..............x."}, t, vel=84)
            else:
                n += drums({"conga_hi": "..x....x..x..x..", "conga_lo": "x.......x......."}, t, vel=84)
            if bar in (27, 29):
                n += drums({"open": "..............x."}, t, vel=80)
    n += drums({"jingle": "x..............."}, 0, vel=84)
    n += drums({"crash": "X..............."}, 8 * 4, vel=84)
    n += drums({"chime": "x..............."}, 16 * 4, vel=92)
    n += drums({"jingle": "x...............", "chime": "........x......."}, 20 * 4, vel=80)
    n += drums({"crash": "X...............", "jingle": "x..............."}, 24 * 4, vel=96)
    n += drums({"chime": "x..............."}, 28 * 4, vel=84)
    return n


def song() -> Song:
    # The tune: mallet in A, steel drums in B and D (with a xylophone an octave up in D).
    mallet = _tune(T, 0, vel=92) + melody(MALLET_C, 16 * 4, vel=90, legato=0.9)
    steel = _tune(T[:4] + B_END, 8, vel=96) + _tune(T[:6] + D_END, 24, vel=100)
    xylo = _tune(T[:6] + D_END, 24, vel=74, transpose=12)
    clarinet = melody(CLARINET_B, 8 * 4, vel=86, legato=0.94) + melody(CLARINET_D, 24 * 4, vel=92, legato=0.94)
    bell = melody(BELL_C, 16 * 4, vel=96, legato=1.0)

    # Offbeat keys in A, B and D; held, soft chords in lantern alley.
    skank = _in(comp(PROGRESSION, 62, 77, steps=[2, 6, 10, 14], length=0.3, size=3, vel=80, accent={6: 6, 14: 6}), (0, 16), (24, 32))
    keys_c = _in(comp(PROGRESSION, 60, 76, steps=[0, 10], length=1.6, size=4, vel=64), (16, 24))
    pluck = _in(arp(PROGRESSION, 67, 86, step=0.5, pattern=[0, 2, 1, 3, 2, 1, 3, 2], size=4, vel=84, gate=0.5), (8, 16)) + _in(
        arp(PROGRESSION, 67, 86, step=0.25, pattern=[0, 2, 1, 3, 2, 3, 1, 2], size=4, vel=80, gate=0.45), (24, 32)
    )
    pizz = _ramp(_in(comp(PROGRESSION, 62, 79, steps=[0, 3, 6, 8, 11, 14], length=0.22, size=3, vel=82, accent={0: 8, 8: 6}), (16, 24)), 20, 24, 0.9, 1.1)
    soft_pad = _in(pads(PROGRESSION, 62, 79, size=4, vel=70), (16, 24))
    wide_pad = _in(pads(PROGRESSION, 65, 81, size=3, vel=64), (24, 32))
    stabs = _hits(
        PROGRESSION,
        62,
        74,
        [(24, 0, 0.3, 104), (25, 14, 0.25, 96), (26, 0, 0.3, 104), (27, 14, 0.25, 96), (28, 0, 0.3, 106), (29, 14, 0.25, 96), (30, 0, 0.3, 104), (30, 8, 0.3, 100), (31, 0, 0.3, 106), (31, 6, 0.25, 98)],
    )

    # The bass bounces in A, B and D; in lantern alley a sub holds long notes, then walks back in.
    bounce = [(0, 3, "R"), (3, 1, "R"), (6, 2, "8"), (8, 2, "5"), (10, 2, "R"), (12, 2, "8"), (14, 2, "C")]
    bass = _in(bass_line(PROGRESSION, bounce, octave_note=36, vel=100), (0, 16), (24, 32))
    sub = _in(bass_line(PROGRESSION, [(0, 6, "R"), (6, 2, "5"), (8, 8, "R")], octave_note=36, vel=92), (16, 20)) + _in(
        bass_line(PROGRESSION, [(0, 3, "R"), (3, 3, "R"), (6, 2, "5"), (8, 3, "R"), (11, 3, "R"), (14, 2, "8")], octave_note=36, vel=96), (20, 24)
    )

    kit = _drums()
    parts = [
        Part("mallet", MALLET, mallet, Mix(gain_db=-1.5, pan=-0.3, reverb=0.2, delay=0.1, highpass=200)),
        Part("steel", STEEL_DRUMS, steel, Mix(gain_db=0, pan=-0.08, reverb=0.18, delay=0.08, highpass=250, eq=[("peak", 420, -3, 1.0), ("high_shelf", 7000, 2, 0.7)])),
        Part("xylo", XYLOPHONE, xylo, Mix(gain_db=-1, pan=0.4, reverb=0.25, highpass=400)),
        Part("clarinet", CLARINET, clarinet, Mix(gain_db=-6, pan=0.3, reverb=0.25, highpass=250, eq=[("peak", 400, -3, 1.0)])),
        Part("bell", FM_BELL, bell, Mix(gain_db=-1, pan=0.2, reverb=0.3, delay=0.15)),
        Part("keys", WARM_KEYS.tweak(decay=1.0), skank, Mix(gain_db=-6, pan=0.15, reverb=0.15, highpass=250, eq=[("peak", 450, -3, 1.0)], width=1.7)),
        Part("keys c", WARM_KEYS, keys_c, Mix(gain_db=-10, pan=-0.1, reverb=0.3, highpass=250, width=1.7, eq=[("peak", 400, -3, 1.0)])),
        Part("pluck", PLUCK.tweak(level=-15.0), pluck, Mix(gain_db=-4, pan=0.4, reverb=0.15, delay=0.2, highpass=400, duck=0.25)),
        Part("pizz", VIOLINS_PIZZICATO, pizz, Mix(gain_db=-1, pan=-0.25, reverb=0.2, highpass=250, width=1.7)),
        Part("soft pad", SOFT_PAD.tweak(cutoff=2200), soft_pad, Mix(gain_db=-7, reverb=0.3, highpass=300, width=1.8, eq=[("peak", 450, -2, 1.0), ("high_shelf", 5000, 3, 0.7)])),
        Part("wide pad", SUPERSAW_PAD.tweak(cutoff=2600, attack=0.5), wide_pad, Mix(gain_db=-11, reverb=0.25, highpass=350, width=1.6, duck=0.35, eq=[("high_shelf", 8000, 3, 0.7)])),
        Part("brass", BRASS_STAB, stabs, Mix(gain_db=-7, pan=0.1, reverb=0.2, highpass=220, eq=[("peak", 450, -3, 1.0)])),
        Part("bass", ROUND_BASS, bass, Mix(gain_db=-2, reverb=0.0, duck=0.2, eq=[("peak", 320, -3, 1.0)])),
        Part("sub", SUB_BASS.tweak(release=0.2), sub, Mix(gain_db=-6, reverb=0.0, duck=0.15)),
        Part("drums", KIT_FESTIVAL, [n for n in kit if n.pitch not in PERC], Mix(gain_db=-5, reverb=0.08, comp=(-16, 2.5))),
        Part("perc", KIT_PERC, [n for n in kit if n.pitch in PERC], Mix(gain_db=-5, pan=0.1, reverb=0.12, width=1.6, eq=[("peak", 330, -3, 2.0)])),
        Part("swell", REVERSE_SWELL, [into(8, beats=4, pitch="bb4", vel=80)], Mix(gain_db=-9, reverb=0.25)),
        Part("downlifter", DOWNLIFTER, [at(16, beats=4, pitch="f4", vel=75)], Mix(gain_db=-11, reverb=0.3)),
        Part("riser", RISER, [into(24, beats=8, pitch="f3", vel=85)], Mix(gain_db=-10, reverb=0.3)),
        Part("impact", IMPACT, [at(24, beats=4, pitch="bb1", vel=80)], Mix(gain_db=-9, reverb=0.15)),
        Part("settle", SWEEP_DOWN, [at(0, beats=4, vel=70)], Mix(gain_db=-10, reverb=0.3)),
    ]
    swung = []
    for p in parts:
        notes = p.notes if p.name in ("swell", "downlifter", "riser", "impact", "settle") else _swing(p.notes)
        swung.append(Part(p.name, p.instrument, notes, p.mix))
    return Song(
        id="market",
        title="Night Market Bounce",
        bpm=BPM,
        bars=BARS,
        reverb_seconds=1.5,
        target_lufs=-16.5,
        parts=swung,
    )
