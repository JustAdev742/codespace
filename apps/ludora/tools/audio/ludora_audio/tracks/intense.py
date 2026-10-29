"""Intense: "Final Stretch". The last half minute of a timed game: a rising final lap.

D minor rising to E minor, 140 BPM, 32 bars (54.9 s). The player starts it at the top
and a timed game hears about 17 bars of it, so those bars climb all the way: every
four bars something joins, the arpeggio's filter opens, and nothing repeats.

- Lap 1 (bars 1-8): an impact, then a squelchy sixteenth arpeggio whose filter opens
  over sixteen bars, an eighth-note bass over a sub, a pumping supersaw pad, a
  four-on-the-floor kick with claps and a syncopated synth brass riff; the snare joins
  at bar 5 while a pluck hints at the theme.
- Lap 2 (9-16): a riser, then the theme on a singing lead, an octave-jumping bass,
  sixteenth hats and taiko; a timpani roll and a riser climb into
- Lap 3 (17-24): the key change, up a whole step to E minor. The theme again with horns
  under it, a choir, racing violins, a galloping bass, a ride and a tambourine.
- Lap 4 (25-32): the theme's last climb an octave up; then the harmony turns back
  through C, A minor and B-flat to A7, with a snare roll, a timpani roll and a riser
  into the impact at the top, so a loop arrives like the start of another lap.
"""

from ..instruments import CHOIR, FRENCH_HORNS, TAIKO, TIMPANI, VIOLINS_FAST
from ..kit import KIT_ARCADE
from ..notation import Mix, Note, Part, Song, drums, melody
from ..patches import ARP_SYNTH, BRASS_STAB, BRIGHT_LEAD, PLUCK, PUNCHY_BASS, SUB_BASS, SUPERSAW_PAD
from ..theory import arp, bass_line, comp, pads
from ..transitions import IMPACT, REVERSE_SWELL, RISER, at, into

BARS = 32
BPM = 140

LAP1 = ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Gm", "A"]
LAP2 = ["Dm", "Bb", "F", "C", "Dm", "Bb", "C", "B7"]
LAP3 = ["Em", "C", "G", "D", "Em", "C", "Am", "B7"]
LAP4 = ["Em", "C", "G", "D", "C", "Am", "Bb", "A7"]
PROGRESSION = LAP1 + LAP2 + LAP3 + LAP4

# The theme: two quick repeated notes and a leap, climbing in sequence.
THEME = [
    "d5:2 d5:2 a5:4 f5:2 e5:2 d5:2 e5:2",
    "f5:6 d5:2 bb4:4 d5:4",
    "c5:2 c5:2 a5:4 g5:2 f5:2 e5:2 f5:2",
    "g5:8 e5:4 c5:4",
    "d5:2 d5:2 a5:4 c6:2 bb5:2 a5:2 f5:2",
    "d6:6 c6:2 bb5:4 f5:4",
    "e5:2 g5:2 c6:4 e6:4 c6:4",
    "d#6:6 b5:2 f#5:4 a5:4",
]
# Lap 3's second half, in E minor.
LAP3_END = [
    "e5:2 e5:2 b5:4 d6:2 c6:2 b5:2 g5:2",
    "e6:6 d6:2 c6:4 g5:4",
    "a5:2 c6:2 e6:4 g6:4 e6:4",
    "f#6:6 d#6:2 b5:4 a5:4",
]
# Lap 4's turn back to D minor: long notes falling by thirds, then climbing into the top.
LAP4_END = [
    "g6:8 e6:4 c6:4",
    "e6:8 c6:4 a5:4",
    "f6:8 d6:4 bb5:4",
    "c#6:4 e6:4 g6:4 a6:4",
]
# Lap 1's hint of the theme.
HINT = "d5:2 d5:2 a5:4 r:8 | d5:2 d5:2 a5:4 r:4 c6:2 a5:2 | g5:2 g5:2 d6:4 r:4 bb5:2 d6:2 | e6:2 e6:2 c#6:4 a5:2 e5:2 c#5:2 e5:2"


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


def _drums() -> list[Note]:
    n: list[Note] = []
    for bar in range(BARS):
        t = bar * 4
        if bar < 4:
            n += drums({"kick": "X...X...X...X...", "hat": "..x...x...x...x.", "clap": "....x.......x...", "shaker": "x.x.x.x.x.x.x.x."}, t, vel=92)
        elif bar < 8:
            snare = "....X...x.x.xxxx" if bar == 7 else "....X.......X..."
            n += drums({"kick": "X...X...X...X...", "hat": "o.x.o.x.o.x.o.x.", "snare": snare, "clap": "....x.......x...", "shaker": "xoxoxoxoxoxoxoxo"}, t, vel=92)
        elif bar < 16:
            if bar == 15:
                n += drums({"kick": "X...X...X...X...", "snare": "....X...xxxxxxXX", "clap": "....x...........", "hat": "xoxoxoxo........", "tom_lo": "............x.x."}, t, vel=94)
            else:
                n += drums({"kick": "X...X...X...X...", "snare": "....X.......X...", "clap": "....x.......x...", "hat": "xoxoxoxoxoxoxoxo", "open": "..............x."}, t, vel=94)
        elif bar < 30:
            kick = "X...X...X...X.x." if bar % 4 == 3 else "X...X...X...X..."
            n += drums({"kick": kick, "snare": "....X.......X...", "clap": "....x.......x...", "hat": "xoxoxoxoxoxoxoxo", "ride": "x.x.x.x.x.x.x.x.", "tamb": "..x...x...x...x."}, t, vel=96)
            if bar == 23:
                n += drums({"snare": "........x.x.xxxx", "tom_lo": "............x.x."}, t, vel=94)
        else:
            # The turn: a snare roll that swells into the top.
            n += drums({"kick": "X...X...X...X...", "snare": "x.x.x.x.xxxxxxxx" if bar == 30 else "xxxxxxxxxxxxxxxx", "hat": "x.x.x.x.x.x.x.x."}, t, vel=90)
            if bar == 31:
                n += drums({"tom_hi": "............x...", "tom_lo": "..............x."}, t, vel=96)
    n = _ramp(n, 30, 32, 0.65, 1.25)
    for bar, lane, vel in ((0, "crash", 100), (8, "crash", 96), (16, "crash", 108), (20, "crash2", 96), (24, "crash", 104), (28, "crash2", 96)):
        n += drums({lane: "X..............."}, bar * 4, vel=vel)
    return n


def _timpani() -> list[Note]:
    notes = [Note(0, 1.5, 38, 110), Note(16 * 4, 1.5, 40, 112)]
    for bar, pitch in ((15, 47), (31, 45)):
        # A roll on the dominant that swells into the next bar.
        notes += [Note(bar * 4 + i * 0.25, 0.25, pitch, 64 + i * 3) for i in range(16)]
    return notes


def song() -> Song:
    lead = _tune(THEME, 8, vel=98, legato=0.96) + _tune(THEME[:4], 16, vel=102, transpose=2, legato=0.96) + _tune(LAP3_END, 20, vel=104, legato=0.96)
    lead += _tune(THEME[:4], 24, vel=104, transpose=14, legato=0.96) + _tune(LAP4_END, 28, vel=106, legato=0.96)
    horns = _tune(THEME[:4], 16, vel=90, transpose=2 - 12, legato=0.95) + _tune(LAP3_END, 20, vel=92, transpose=-12, legato=0.95)
    horns += _tune(THEME[:4], 24, vel=94, transpose=2, legato=0.95) + _tune(LAP4_END, 28, vel=96, transpose=-12, legato=0.95)
    hint = melody(HINT, 4 * 4, vel=92, legato=0.85)

    arps = _ramp(arp(PROGRESSION, 64, 84, step=0.25, pattern=[0, 2, 1, 3, 2, 1, 3, 2], size=4, vel=96, gate=0.55), 0, 16, 0.84, 1.12)
    arps = [Note(n.start, n.dur, n.pitch, min(n.vel, 108)) for n in arps]
    violins = _in(arp(PROGRESSION, 69, 86, step=0.25, pattern=[0, 2, 1, 2], size=3, vel=88, gate=0.5), (16, 32))
    stabs = _in(comp(PROGRESSION, 62, 74, steps=[0, 3, 6, 10, 12], length=0.22, size=3, vel=106, accent={0: 8}), (0, 8))
    stabs += _in(comp(PROGRESSION, 62, 74, steps=[0, 3, 6, 10, 12], length=0.22, size=3, vel=100, accent={0: 8}), (16, 30))
    stabs += _in(comp(PROGRESSION, 62, 74, steps=[0, 6, 12], length=0.25, size=3, vel=92), (8, 16))
    stabs += _in(comp(PROGRESSION, 62, 74, steps=[0, 4, 8, 12], length=0.3, size=3, vel=104), (30, 32))
    pad = _ramp(pads(PROGRESSION, 64, 81, size=4, vel=76), 0, 8, 0.88, 0.96)
    choir = _in(pads(PROGRESSION, 64, 79, size=3, vel=72), (16, 32))

    straight = [(s, 2, "R") for s in range(0, 16, 2)]
    octaves = [(s, 2, "R" if s % 4 == 0 else "8") for s in range(0, 16, 2)]
    gallop = [(0, 2, "R"), (2, 1, "R"), (3, 1, "R"), (4, 2, "8"), (6, 1, "R"), (7, 1, "R"), (8, 2, "R"), (10, 1, "R"), (11, 1, "R"), (12, 2, "8"), (14, 1, "5"), (15, 1, "R")]
    bass = _in(bass_line(PROGRESSION, straight, octave_note=38, vel=106), (0, 8))
    bass += _in(bass_line(PROGRESSION, octaves, octave_note=38, vel=100), (8, 16))
    bass += _in(bass_line(PROGRESSION, gallop, octave_note=38, vel=102), (16, 32))
    # The sub doubles the bass's roots (not its octaves).
    sub = [Note(n.start, n.dur, n.pitch, 96) for n in bass if n.pitch <= 43]
    taiko = [Note(b * 4 + s, 0.5, 50, v) for b in range(8, 30) for s, v in ((0, 110), (2.5, 92), (3, 100))]

    return Song(
        id="intense",
        title="Final Stretch",
        bpm=BPM,
        bars=BARS,
        reverb_seconds=1.6,
        target_lufs=-15.5,
        parts=[
            Part("lead", BRIGHT_LEAD.tweak(cutoff=3000), lead, Mix(gain_db=-2.5, reverb=0.18, delay=0.12, highpass=250, eq=[("peak", 450, -2, 1.0), ("high_shelf", 6000, 2, 0.7)])),
            Part("horns", FRENCH_HORNS, horns, Mix(gain_db=-7, pan=-0.2, reverb=0.25, highpass=200, eq=[("peak", 400, -3, 1.0)])),
            Part("hint", PLUCK, hint, Mix(gain_db=-3, pan=-0.15, reverb=0.2, delay=0.22, highpass=250)),
            Part("arp", ARP_SYNTH, arps, Mix(gain_db=-5, pan=0.25, reverb=0.12, delay=0.06, highpass=300, duck=0.3, width=1.4)),
            Part("violins", VIOLINS_FAST, violins, Mix(gain_db=-1, pan=-0.3, reverb=0.18, highpass=350, width=1.6)),
            Part("brass", BRASS_STAB, stabs, Mix(gain_db=-5, pan=0.05, reverb=0.18, highpass=220, eq=[("peak", 420, -3, 1.0)], width=1.3)),
            Part("pad", SUPERSAW_PAD, pad, Mix(gain_db=-10, reverb=0.25, highpass=300, duck=0.4, width=1.7, eq=[("peak", 500, -2, 1.0), ("high_shelf", 7000, 2, 0.7)])),
            Part("choir", CHOIR, choir, Mix(gain_db=-8, reverb=0.35, highpass=280, width=1.6)),
            Part("bass", PUNCHY_BASS, bass, Mix(gain_db=-2, reverb=0.0, duck=0.35, eq=[("peak", 300, -3, 1.0)])),
            Part("sub", SUB_BASS, sub, Mix(gain_db=-5.5, reverb=0.0, duck=0.45, lowpass=180)),
            Part("drums", KIT_ARCADE, _drums(), Mix(gain_db=-4.5, reverb=0.08, comp=(-16, 2.5))),
            Part("taiko", TAIKO, taiko, Mix(gain_db=-5, reverb=0.22, highpass=45)),
            Part("timpani", TIMPANI, _timpani(), Mix(gain_db=-5, reverb=0.25, highpass=40)),
            Part("riser", RISER, [into(8, beats=4, pitch="a3", vel=80), into(16, beats=8, pitch="b3", vel=95), into(32, beats=8, pitch="a3", vel=100)], Mix(gain_db=-10, reverb=0.3)),
            Part("impact", IMPACT, [at(0, beats=4, pitch="d1", vel=95), at(16, beats=4, pitch="e1", vel=100)], Mix(gain_db=-8, reverb=0.15)),
            Part("swell", REVERSE_SWELL, [into(24, beats=4, pitch="e4", vel=85)], Mix(gain_db=-9, reverb=0.25)),
        ],
    )
