"""The trailer's score: an original 86-second cue at 120 BPM in D minor, written for the cut.

One bar is 2 seconds, so the edit and the music share a grid:

  bars  0-3   0-8 s   cold open: a low drone, a ticking clock, a heartbeat, the 3-2-1 countdown
  bars  4-7   8-16 s  the game appears: the groove starts on a big hit
  bars  8-11  16-24 s joining: the groove with plucked strings
  bars 12-19  24-40 s the modes montage: the hook on horns and strings, full drums
  bars 20-25  40-52 s for teachers: piano and strings, no drums, then a build
  bars 26-29  52-60 s rewards: the groove with a glockenspiel sparkle
  bars 30-33  60-68 s trust: half-time drums, wide strings
  bars 34-37  68-76 s the podium: everything, the hook with choir; silence for the last half beat
  bars 38-41  76-84 s the logo: one hit and a long chord

Rendered with Ludora's own audio library (FluidSynth and the MIT MuseScore General soundfont, mixed in
Python). Run with tools/audio/.venv/bin/python score.py <out.wav> [cues.json]. cues.json may list the
app's own sound effects to lay over the music at given times: [{"t": 11.5, "file": "...mp3", "db": -6}],
with paths relative to apps/ludora.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

LUDORA = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(LUDORA / "tools" / "audio"))
from ludora_audio import dsp, synth  # noqa: E402
from ludora_audio.instruments import (  # noqa: E402
    BRASS,
    CELESTA,
    CELLI_FAST,
    CHOIR,
    FRENCH_HORNS,
    GLOCKENSPIEL,
    GRAND_PIANO,
    KIT_POWER,
    PIZZICATO,
    STRINGS_SLOW,
    SYNTH_BASS,
    TAIKO,
    TIMPANI,
    TROMBONE,
    VIOLINS_FAST,
)
from ludora_audio.notation import DRUM, Mix, Note, Part, drums, melody, midi  # noqa: E402
from ludora_audio.render import SR, render_part  # noqa: E402
from ludora_audio.theory import arp, bass_line, pads  # noqa: E402

BPM = 120
BEAT = 60 / BPM
BARS = 42
TOTAL_BEATS = BARS * 4


def b(bar: float, beat: float = 0) -> float:
    """Beats from the start for a bar (0-based) and a beat within it."""
    return bar * 4 + beat


def sec(t: float) -> float:
    return t / BEAT


# --- Harmony, one chord per bar -------------------------------------------------------------------
MAIN = ["Dm", "Bb", "F", "C"]
TURN = ["Gm", "Bb", "F", "A"]
CHORDS: list[str] = (
    ["Dm"] * 4  # cold open (the drone)
    + MAIN  # 4-7
    + MAIN  # 8-11
    + MAIN + TURN  # 12-19
    + ["Bb", "F", "Gm", "Dm", "Bb", "C"]  # 20-25 breakdown
    + MAIN  # 26-29
    + ["Bb", "F", "C", "A"]  # 30-33
    + MAIN[:2] + ["Gm", "A"]  # 34-37
    + ["Dm", "Dm", "D", "D"]  # 38-41
)
assert len(CHORDS) == BARS


def span(first: int, last: int) -> list[str]:
    """The progression for bars first..last, padded so a part's pattern can start at beat 0 of `first`."""
    return CHORDS[first : last + 1]


def at_bar(notes: list[Note], bar: int) -> list[Note]:
    return [Note(n.start + b(bar), n.dur, n.pitch, n.vel) for n in notes]


# --- The hook --------------------------------------------------------------------------------------
HOOK_A = "d5:4 f5:2 a5:2 d6:6 c6:2 | bb5:4 a5:2 f5:2 d5:8 | c5:4 f5:2 a5:2 c6:6 bb5:2 | a5:4 g5:4 e5:4 c5:4"
HOOK_B = "g5:4 bb5:2 d6:2 g6:6 f6:2 | f6:4 d6:2 bb5:2 f5:8 | a5:4 c6:2 f6:2 e6:4 c6:4 | c#6:8 e6:8"
HOOK_C = "d5:4 f5:2 a5:2 d6:6 c6:2 | bb5:4 a5:2 f5:2 d5:8 | g5:4 bb5:2 d6:2 g6:6 f6:2 | e6:8 c#6:8"


def hook_part() -> list[Note]:
    notes = melody(HOOK_A, b(12), vel=96, legato=0.92) + melody(HOOK_B, b(16), vel=100, legato=0.92)
    notes += melody(HOOK_C, b(34), vel=110, legato=0.95)
    return notes


# --- Drums -----------------------------------------------------------------------------------------
GROOVE = {"kick": "X.....x.X.x.....", "snare": "....X.......X...", "hat": "x.x.x.x.x.x.x.x."}
DRIVE = {"kick": "X..x..x.X..x..x.", "snare": "....X.......X...", "hat": "xxxxxxxxxxxxxxxx", "open": "..............x."}
HALF = {"kick": "X.........x.....", "snare": "........X.......", "hat": "x...x...x...x..."}
FILL = {"kick": "X.....x.X.......", "snare": "....X...xoxoxxXX", "tom_hi": "........x.x.....", "tom_lo": "............x.x."}


def kit() -> list[Note]:
    notes: list[Note] = []
    for bar in range(2, 4):  # a heartbeat under the cold open
        notes += drums({"kick": "x..x............"}, b(bar), vel=72)
    plan = {**{bar: GROOVE for bar in range(4, 12)}, **{bar: DRIVE for bar in range(12, 20)}, **{bar: GROOVE for bar in range(26, 30)}, **{bar: HALF for bar in range(30, 34)}, **{bar: DRIVE for bar in range(34, 38)}}
    fills = {7, 11, 15, 19, 29, 33}
    for bar, pattern in plan.items():
        notes += drums(FILL if bar in fills else pattern, b(bar), vel=94 if pattern is not HALF else 100)
    for bar in (4, 8, 12, 16, 26, 30, 34):
        notes += drums({"crash": "X..............."}, b(bar), vel=100)
    # A snare build into the rewards, and a roll into the silence before the logo.
    notes += drums({"snare": "x...x...x...x..." "x.x.x.x.x.x.x.x." "xxxxxxxxxxxxxxxx" "xxxxxxxxXXXXXXXX"}, b(22), vel=70)
    notes += drums({"snare": "xxxxxxxxxxxxxxxx" "xxxxxxxxXXXX...."}, b(36), vel=88)
    # The bar of 37 ends half a beat early: nothing after 75.5 s.
    return [n for n in notes if not (b(37, 3.5) <= n.start < b(38))]


def taiko() -> list[Note]:
    notes: list[Note] = []
    # The countdown: 3, 2, 1 at 6.0, 6.5 and 7.0 s.
    for i, t in enumerate((6.0, 6.5, 7.0)):
        notes.append(Note(sec(t), 1.0, 50, 96 + i * 12))
        notes.append(Note(sec(t), 1.0, 45, 90 + i * 12))
    for bar in (4, 12, 16, 26, 34, 36):
        notes.append(Note(b(bar), 1.5, 50, 118))
    for bar in (11, 19, 25, 33):
        notes += [Note(b(bar, 3), 0.25, 50, 100), Note(b(bar, 3.5), 0.25, 50, 116)]
    notes.append(Note(b(38), 2.0, 50, 127))
    return notes


def timpani() -> list[Note]:
    notes = [Note(b(4), 2, midi("d2"), 116), Note(b(12), 2, midi("d2"), 110), Note(b(26), 2, midi("d2"), 110), Note(b(34), 2, midi("d2"), 120), Note(b(38), 3, midi("d2"), 127)]
    # Rolls into the big moments.
    for start, end, pitch in ((b(3), b(3, 3.5), "a1"), (b(25), b(26), "a1"), (b(37), b(37, 3.5), "a1")):
        t = start
        while t < end:
            v = int(60 + 60 * (t - start) / max(0.1, end - start))
            notes.append(Note(t, 0.12, midi(pitch), v))
            t += 0.125
    return notes


def ticks() -> list[Note]:
    """A clock under the cold open: every beat from 0.5 s to the countdown."""
    return [Note(t, 0.1, DRUM["rim"], 64 + (8 if i % 2 == 0 else 0)) for i, t in enumerate(np.arange(1, 12, 1.0))]


# --- Pitched parts ---------------------------------------------------------------------------------
def bass() -> list[Note]:
    notes: list[Note] = []
    pattern = [(i * 2, 2, "R") for i in range(8)]
    for first, last in ((4, 19), (26, 37)):
        line = bass_line(span(first, last), pattern, octave_note=38, vel=100)
        notes += [Note(n.start + b(first), n.dur, n.pitch, n.vel) for n in line]
    return [n for n in notes if n.start < b(37, 3.5)]


def strings_ostinato() -> list[Note]:
    notes: list[Note] = []
    for first, last, step in ((4, 11, 0.5), (12, 19, 0.25), (26, 29, 0.25), (30, 33, 0.5), (34, 37, 0.25)):
        ns = arp(span(first, last), 62, 77, step=step, pattern=[0, 1, 2, 1], size=3, vel=80, gate=0.45)
        notes += [Note(n.start + b(first), n.dur, n.pitch, n.vel) for n in ns]
    return [n for n in notes if n.start < b(37, 3.5)]


def celli() -> list[Note]:
    notes: list[Note] = []
    for first, last in ((12, 19), (34, 37)):
        ns = arp(span(first, last), 38, 53, step=0.5, pattern=[0, 2, 0, 1], size=3, vel=88, gate=0.55)
        notes += [Note(n.start + b(first), n.dur, n.pitch, n.vel) for n in ns]
    return [n for n in notes if n.start < b(37, 3.5)]


def plucks() -> list[Note]:
    ns = arp(span(8, 11), 62, 81, step=0.5, pattern=[0, 2, 1, 3, 2, 1], size=4, vel=78, gate=0.4)
    return [Note(n.start + b(8), n.dur, n.pitch, n.vel) for n in ns]


def brass_stabs() -> list[Note]:
    notes: list[Note] = []
    stab = "[d4,f4,a4]:2 r:6 [d4,f4,a4]:2 r:2 [d4,f4,a4]:2 r:2"
    for bar, chord in zip(range(4, 8), ["[d4,f4,a4]", "[d4,f4,bb4]", "[c4,f4,a4]", "[c4,e4,g4]"]):
        notes += melody(stab.replace("[d4,f4,a4]", chord), b(bar), vel=104, legato=0.8)
    # The card at 14 and 15 s: two hits.
    notes += melody("[c4,e4,g4,c5]:4", sec(14.0), vel=118, legato=0.9) + melody("[c4,e4,g4,c5]:4", sec(15.0), vel=124, legato=0.9)
    return notes


def brass_long() -> list[Note]:
    notes = pads(span(30, 33), 50, 67, size=3, vel=86)
    notes = [Note(n.start + b(30), n.dur, n.pitch, n.vel) for n in notes]
    notes += [Note(n.start + b(34), n.dur, n.pitch, n.vel) for n in pads(span(34, 37), 50, 69, size=4, vel=104)]
    notes = [Note(n.start, min(n.dur, b(37, 3.5) - n.start), n.pitch, n.vel) for n in notes if n.start < b(37, 3.5)]
    # The logo: one long D minor chord, opening to D major two bars later.
    notes += [Note(b(38), 8, midi(p), 118) for p in ("d3", "a3", "d4", "f4", "a4")]
    notes += [Note(b(40), 7, midi(p), 96) for p in ("d3", "a3", "d4", "f#4", "a4")]
    return notes


def trombones() -> list[Note]:
    ns = [Note(b(bar), 3.8, midi(p), 100) for bar, p in zip(range(12, 20), ["d3", "bb2", "f2", "c3", "g2", "bb2", "f2", "a2"])]
    ns += [Note(b(bar), 3.8, midi(p), 112) for bar, p in zip(range(34, 38), ["d3", "bb2", "g2", "a2"])]
    return [Note(n.start, min(n.dur, b(37, 3.5) - n.start), n.pitch, n.vel) for n in ns]


def pad_drone() -> list[Note]:
    notes = [Note(0, b(4) - 0.1, midi(p), 70) for p in ("d2", "a2", "d3")]
    ns = pads(span(20, 25), 50, 69, size=4, vel=66)
    notes += [Note(n.start + b(20), n.dur, n.pitch, n.vel) for n in ns]
    notes += [Note(b(38), 16, midi(p), 92) for p in ("d2", "a2", "f3", "a3", "d4")]
    return notes


def choir() -> list[Note]:
    ns = pads(span(34, 37), 57, 74, size=3, vel=96)
    ns = [Note(n.start + b(34), min(n.dur, b(37, 3.5) - (n.start + b(34))), n.pitch, n.vel) for n in ns]
    ns += [Note(b(38), 10, midi(p), 110) for p in ("d4", "f4", "a4", "d5")]
    return ns


def piano() -> list[Note]:
    ns = arp(span(20, 25), 55, 76, step=0.5, pattern=[0, 2, 1, 3, 2, 1, 2, 3], size=4, vel=70, gate=1.6)
    notes = [Note(n.start + b(20), n.dur, n.pitch, n.vel) for n in ns]
    # The hook, slow and quiet, over the breakdown.
    notes += melody("d5:8 f5:4 a5:4 | g5:8 f5:4 c5:4 | bb4:8 d5:4 g5:4 | a5:16", b(20), vel=84, legato=1.0)
    return notes


def sparkle() -> list[Note]:
    ns = arp(span(26, 29), 74, 93, step=0.25, pattern=[0, 1, 2, 3, 2, 1], size=4, vel=70, gate=0.5)
    notes = [Note(n.start + b(26), n.dur, n.pitch, n.vel) for n in ns]
    return notes


def celesta_end() -> list[Note]:
    return [Note(b(40), 3, midi(p), 80) for p in ("d6", "f#6", "a6")] + [Note(b(40, 1.5), 3, midi("d7"), 70)]


# --- Mixing a linear cue ---------------------------------------------------------------------------
PARTS: list[tuple[Part, list[tuple[float, float]] | None]] = [
    (Part("drone", STRINGS_SLOW, pad_drone(), Mix(gain_db=-4, reverb=0.35, highpass=40, width=1.2)), [(0, -18), (7.6, 0), (7.75, -60), (40, -6), (52, -6), (76, 0)]),
    (Part("ticks", KIT_POWER, ticks(), Mix(gain_db=-12, reverb=0.3, highpass=300, delay=0.15)), None),
    (Part("kit", KIT_POWER, kit(), Mix(gain_db=-4, reverb=0.1, comp=(-14, 3), eq=[("high_shelf", 9000, -2, 0.7)])), None),
    (Part("taiko", TAIKO, taiko(), Mix(gain_db=-3, reverb=0.3, highpass=35)), None),
    (Part("timpani", TIMPANI, timpani(), Mix(gain_db=-5, reverb=0.3)), None),
    (Part("bass", SYNTH_BASS, bass(), Mix(gain_db=-9, reverb=0.02, highpass=32, lowpass=3500, comp=(-18, 3), duck=0.35)), None),
    (Part("strings", VIOLINS_FAST, strings_ostinato(), Mix(gain_db=-2, pan=0.25, reverb=0.22, highpass=220, width=1.3)), None),
    (Part("celli", CELLI_FAST, celli(), Mix(gain_db=-4, pan=-0.2, reverb=0.2, highpass=60)), None),
    (Part("plucks", PIZZICATO, plucks(), Mix(gain_db=-4, pan=-0.3, reverb=0.25, highpass=200)), None),
    (Part("stabs", BRASS, brass_stabs(), Mix(gain_db=-7, pan=-0.05, reverb=0.22, highpass=140)), None),
    (Part("brass", BRASS, brass_long(), Mix(gain_db=-8, reverb=0.3, highpass=120)), None),
    (Part("horns", FRENCH_HORNS, hook_part(), Mix(gain_db=-3, pan=-0.1, reverb=0.3, highpass=120)), None),
    (Part("hook_vln", VIOLINS_FAST, [Note(n.start, n.dur, n.pitch + 12, max(1, n.vel - 14)) for n in hook_part()], Mix(gain_db=-10, pan=0.15, reverb=0.3, highpass=400)), None),
    (Part("trombones", TROMBONE, trombones(), Mix(gain_db=-8, pan=0.1, reverb=0.25, highpass=60)), None),
    (Part("choir", CHOIR, choir(), Mix(gain_db=-6, reverb=0.4, highpass=150, width=1.3)), None),
    (Part("piano", GRAND_PIANO, piano(), Mix(gain_db=-3, reverb=0.35, highpass=80)), None),
    (Part("sparkle", GLOCKENSPIEL, sparkle(), Mix(gain_db=-13, pan=0.3, reverb=0.3, delay=0.15, highpass=900)), None),
    (Part("celesta", CELESTA, celesta_end(), Mix(gain_db=-8, reverb=0.5, delay=0.25, highpass=600)), None),
]


def envelope(n: int, points: list[tuple[float, float]]) -> np.ndarray:
    """A gain curve (linear amplitude) through (seconds, dB) points."""
    t = np.arange(n) / SR
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (10 ** (np.interp(t, xs, ys) / 20)).astype(np.float32)


def fx_track(n: int) -> np.ndarray:
    """Trailer sound design: booms, risers, whooshes and downlifters on the cuts."""
    out = np.zeros((n, 2), dtype=np.float32)

    def put(x: np.ndarray, t: float, db: float = 0.0):
        dsp.place(out, x * dsp.db(db), int(t * SR))

    def boom(t: float, db: float = 0.0, length: float = 2.6):
        # A deep pitched-down sine under a crack: the trailer "braaam" floor.
        tt = np.arange(int(length * SR)) / SR
        f = 26 + 64 * np.exp(-tt * 5)
        sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.4)
        st = np.stack([sub, sub], axis=1).astype(np.float32) * 0.9
        put(st, t, db)
        put(synth.impact(0.6, 160, 40, gain=0.7, crack=0.35, seed=int(t * 10)), t, db - 2)

    put(synth.riser(3.6, 120, 1800, gain=0.32, noise=0.5, seed=3), 4.05, -3)
    boom(8.0, 0)
    put(synth.whoosh(0.7, 300, 3000, gain=0.25, seed=5, pan_sweep=0.8), 15.5, -6)
    boom(16.0, -6, 1.6)
    put(synth.whoosh(0.8, 200, 2400, gain=0.3, seed=6, pan_sweep=-0.8), 23.3, -4)
    boom(24.0, -2)
    put(synth.riser(1.9, 300, 2600, gain=0.25, noise=0.6, seed=8), 32.1, -6)
    boom(34.0, -3, 2.0)
    # Into the breakdown: a downlifter.
    put(synth.whoosh(1.4, 2600, 180, gain=0.28, seed=9, pan_sweep=0.3), 39.9, -6)
    put(synth.riser(3.8, 150, 2200, gain=0.3, noise=0.55, seed=10), 48.2, -4)
    boom(52.0, -1)
    put(synth.whoosh(0.7, 400, 3200, gain=0.26, seed=11, pan_sweep=0.8), 59.4, -6)
    boom(60.0, -6, 1.8)
    put(synth.riser(1.9, 200, 2400, gain=0.28, noise=0.55, seed=12), 66.1, -5)
    boom(68.0, 0)
    put(synth.riser(2.4, 160, 3200, gain=0.34, noise=0.6, seed=13), 73.1, -2)
    boom(76.0, 2, 4.5)
    return out


def main(out_path: str, cues_path: str | None = None) -> None:
    n = int((BARS * 4 * BEAT + 6) * SR)
    dry = np.zeros((n, 2), dtype=np.float32)
    rev = np.zeros_like(dry)
    echo = np.zeros_like(dry)
    kick_times = sorted(nn.start * BEAT for part, _ in PARTS if part.name == "kit" for nn in part.notes if nn.pitch in (DRUM["kick"], DRUM["kick2"]))
    for part, env in PARTS:
        x = render_part(part, BPM, TOTAL_BEATS, repeats=1, humanize=0.006 if not part.instrument.drums else 0.003, seed=len(part.name))
        x = dsp.fit(x, n)
        m = part.mix
        x = dsp.process(x, dsp.eq_board(m.highpass, m.lowpass, m.eq, m.comp))
        if m.width != 1.0:
            x = dsp.width(x, m.width)
        x = x * dsp.db(m.gain_db)
        if m.duck and kick_times:
            x = x * dsp.duck_curve(n, kick_times, m.duck)[:, None]
        if m.pan:
            x = dsp.pan(x, m.pan)
        if env:
            x = x * envelope(n, env)[:, None]
        dry += x
        rev += x * m.reverb
        if m.delay:
            echo += x * m.delay
        print(f"{part.name:10s} peak {np.max(np.abs(x)):.3f}")
    wet = dsp.reverb(rev, dsp.make_ir(2.4, seed=21)) * dsp.db(-3)
    mix = dry + wet + dsp.echo(echo, 0.75 * BEAT)
    fx = fx_track(n)
    mix = mix + fx + dsp.reverb(fx * 0.25, dsp.make_ir(1.6, seed=22)) * dsp.db(-6)
    # The two cuts to silence: just before the first hit, and just before the logo.
    mix = mix * envelope(n, [(0, 0), (7.72, 0), (7.76, -70), (7.99, -70), (8.0, 0), (75.48, 0), (75.52, -80), (75.99, -80), (76.0, 0)])[:, None]
    if cues_path:
        for cue in json.loads(Path(cues_path).read_text()):
            data = subprocess.run(["ffmpeg", "-v", "error", "-i", str(LUDORA / cue["file"]), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
            x = np.frombuffer(data, dtype=np.float32).reshape(-1, 2)
            dsp.place(mix, x * dsp.db(cue.get("db", 0)), int(cue["t"] * SR))
    mix = dsp.master(mix, glue=(-16, 2.2))
    end = int(86 * SR)
    mix = mix[:end]
    mix = dsp.fade(mix, 0.0, 1.5)
    mix = dsp.normalize_loudness(mix, -14.0, ceiling_db=-1.0)
    sf.write(out_path, mix, SR, subtype="PCM_24")
    print("loudness", round(dsp.lufs(mix), 2), "LUFS, true peak", round(dsp.true_peak_db(mix), 2), "dBTP,", round(len(mix) / SR, 2), "s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
