"""Every sound effect, as a short piece of sound design.

Each effect is a few soundfont instruments (notes timed in seconds) and
synthesised layers, through a small room reverb, at a loudness that suits its
job: quiet ticks and taps, clear answer feedback, big moments louder. Effects
in a family (players joining, reactions, board steps, Lantern reveals by
rarity) are separate files, so nothing is pitch-shifted at play time.

Most melodic effects sit in D major pentatonic, the key the old synthesised
effects used, so they stay friendly with each other.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import dsp, synth
from .instruments import (
    BRASS,
    CELESTA,
    CELLI_PIZZICATO,
    CHOIR,
    CONCERT_BASS_DRUM,
    CRYSTAL,
    GLOCKENSPIEL,
    HARP,
    KALIMBA,
    KIT_ORCHESTRA,
    KIT_STANDARD,
    MARIMBA,
    MUTED_TRUMPET,
    REVERSE_CYMBAL,
    STRINGS_SLOW,
    STRINGS_TREMOLO,
    TAIKO,
    TIMPANI,
    TUBULAR_BELLS,
    VIBRAPHONE,
    VIOLINS_PIZZICATO,
)
from .notation import DRUM, Instrument, Mix, Note, Part, midi
from .render import SR, render_part


def n(t: float, dur: float, pitch: str | int, vel: int = 96) -> Note:
    return Note(t, dur, midi(pitch) if isinstance(pitch, str) else pitch, vel)


def run(pitches: list[str], start: float, spacing: float, dur: float = 0.6, vel: int = 90, vel_step: int = 0) -> list[Note]:
    """Notes one after another, `spacing` seconds apart (an arpeggio or a glissando)."""
    return [n(start + i * spacing, dur, p, vel + i * vel_step) for i, p in enumerate(pitches)]


def chord(pitches: list[str], start: float, dur: float, vel: int = 96) -> list[Note]:
    return [n(start, dur, p, vel) for p in pitches]


def hit(name: str, start: float, vel: int = 100, dur: float = 0.2) -> Note:
    return Note(start, dur, DRUM[name], vel)


def part(instrument: Instrument, notes: list[Note], gain_db: float = 0.0, pan: float = 0.0, reverb: float = 0.2, **eq) -> Part:
    return Part("x", instrument, notes, Mix(gain_db=gain_db, pan=pan, reverb=reverb, highpass=eq.get("highpass"), lowpass=eq.get("lowpass")))


@dataclass
class Effect:
    name: str
    seconds: float
    parts: list[Part] = field(default_factory=list)
    layers: list[tuple[float, np.ndarray]] = field(default_factory=list)
    # Loudness of the finished effect (LUFS; very short effects are measured padded to half a second).
    level: float = -18.0
    room: float = 0.9
    # How the web player treats it: 'once' plays from the start; 'rise' can start part-way so its end lands on time.
    play: str = "once"
    # Other takes of the same sound (their names and play modes are ignored): the player picks one at
    # random each time, never the one it played last, so a sound heard all game never repeats exactly.
    alts: list["Effect"] = field(default_factory=list)
    # Cents either way the player may shift the pitch of each play, for the same reason. 'once' only.
    vary: float = 0.0


def render(effect: Effect) -> np.ndarray:
    total = int((effect.seconds + 1.2) * SR)
    dry = np.zeros((total, 2), dtype=np.float32)
    send = np.zeros_like(dry)
    for p in effect.parts:
        audio = render_part(p, 60.0, effect.seconds, repeats=1, gain=0.6)
        x = dsp.fit(audio, total)
        x = dsp.process(x, dsp.eq_board(p.mix.highpass, p.mix.lowpass))
        x = x * dsp.db(p.mix.gain_db)
        if p.mix.pan:
            x = dsp.pan(x, p.mix.pan)
        dry += x
        send += x * p.mix.reverb
    for at, layer in effect.layers:
        dsp.place(dry, layer, int(at * SR))
        dsp.place(send, layer * 0.25, int(at * SR))
    wet = dsp.reverb(send, dsp.make_ir(effect.room, predelay=0.012, seed=5, brightness=0.6), low_cut=200)
    mix = dry + wet * dsp.db(-3)
    # Cut the silence after the sound has died away, then fade the last few milliseconds.
    env = np.max(np.abs(mix), axis=1)
    loud = np.nonzero(env > dsp.db(-60) * max(env.max(), 1e-9))[0]
    end = int(min(total, (loud[-1] if len(loud) else 0) + 0.02 * SR))
    end = max(end, int(effect.seconds * 0.5 * SR))
    mix = dsp.fade(mix[:end], fade_out=0.03)
    return dsp.normalize_loudness(mix, effect.level)


# MIDI notes of the old "sparkle" scale (D major pentatonic from A4): joins and steps climb through it.
SPARKLE = ["a4", "b4", "d5", "e5", "f#5", "a5", "b5", "d6"]


def effects() -> list[Effect]:
    fx: list[Effect] = []
    add = fx.append

    # Answering.
    add(Effect("select", 0.35, [part(KALIMBA, [n(0, 0.3, "e6", 74)], reverb=0.15)], [(0, synth.click(0.12))], level=-25))
    add(Effect("tap", 0.15, [part(KIT_STANDARD, [hit("block_hi", 0, 84)], reverb=0.05)], [(0, synth.click(0.1, bright=4500))], level=-25))
    add(Effect("lockIn", 0.7, [part(KALIMBA, [n(0, 0.4, "e5", 92), n(0.075, 0.6, "a5", 96)]), part(GLOCKENSPIEL, [n(0.075, 0.5, "a6", 66)], gain_db=-1)], level=-20))
    add(
        Effect(
            "correct",
            1.1,
            [
                part(CELESTA, run(["d6", "f#6", "a6"], 0, 0.06, 0.7, 100)),
                part(GLOCKENSPIEL, [n(0.18, 0.9, "d7", 96)], gain_db=3, pan=0.2),
                part(HARP, chord(["d5", "a5"], 0, 0.8, 80), gain_db=4, pan=-0.2),
            ],
            [(0.15, synth.sparkle(0.8, 8, gain=0.05, seed=11))],
            level=-16,
        )
    )
    add(Effect("wrong", 0.8, [part(MARIMBA, [n(0, 0.3, "a4", 90), n(0.17, 0.5, "f4", 86)]), part(CELLI_PIZZICATO, [n(0.17, 0.4, "d3", 70)], gain_db=-8)], level=-19))
    add(Effect("tick", 0.1, [part(KIT_STANDARD, [hit("block_lo", 0, 96)], reverb=0.04)], [(0, synth.click(0.15, bright=4000))], level=-23))
    add(Effect("tickFinal", 0.4, [part(KIT_STANDARD, [hit("block_hi", 0, 112)], reverb=0.05), part(GLOCKENSPIEL, [n(0, 0.35, "e7", 72)], gain_db=-4)], level=-19))
    add(
        Effect(
            "timeUp",
            1.6,
            [part(TUBULAR_BELLS, [n(0, 1.4, "a4", 100)]), part(CELLI_PIZZICATO, [n(0, 0.6, "a2", 100)], gain_db=-2), part(TIMPANI, [n(0, 1.2, "a2", 92)], gain_db=-4)],
            [(0, synth.whoosh(0.5, 3000, 300, gain=0.07, seed=12))],
            level=-16,
        )
    )
    add(Effect("question", 1.0, [part(CELESTA, [n(0.28, 0.5, "a6", 84), n(0.36, 0.7, "d7", 88)]), part(GLOCKENSPIEL, [n(0.36, 0.6, "d7", 70)], gain_db=4)], [(0, synth.whoosh(0.34, 400, 4200, gain=0.12, seed=13))], level=-20))
    add(
        Effect(
            "reveal",
            1.4,
            [part(HARP, run(["d5", "e5", "f#5", "a5", "b5", "d6"], 0, 0.03, 0.8, 80)), part(GLOCKENSPIEL, [n(0.18, 1.0, "d7", 84)], gain_db=-3), part(VIBRAPHONE, chord(["d5", "f#5", "a5"], 0.18, 1.1, 80), gain_db=-4)],
            level=-17,
        )
    )
    for i, p in enumerate(SPARKLE):
        add(Effect(f"join-{i}", 0.6, [part(KALIMBA, [n(0, 0.55, p, 92)])], [(0, synth.pop(700 + i * 40, gain=0.05))], level=-20))
    for i in range(4):
        add(Effect(f"reaction-{i}", 0.22, [], [(0, synth.pop(520 + i * 70, gain=0.5)), (0.02, synth.sparkle(0.15, 2, lo=3000, hi=5000, gain=0.08, seed=20 + i))], level=-23))
    add(Effect("rankUp", 0.8, [part(MARIMBA, [n(0, 0.4, "a5", 92), n(0.07, 0.6, "d6", 98)])], [(0.07, synth.sparkle(0.6, 5, gain=0.05, seed=14))], level=-18))

    # The end of a game.
    add(
        Effect(
            "fanfare",
            2.8,
            [
                part(BRASS, [n(0, 0.15, "d5", 104), n(0.16, 0.15, "g5", 108), n(0.32, 0.15, "b5", 112)] + chord(["g4", "b4", "d5", "g5"], 0.5, 1.5, 116)),
                part(TIMPANI, [n(i * 0.06, 0.06, "g2", 60 + i * 5) for i in range(8)] + [n(0.5, 1.2, "g2", 116)], gain_db=-2),
                part(KIT_ORCHESTRA, [hit("crash", 0.5, 110, 1.5)], gain_db=-3),
                part(GLOCKENSPIEL, run(["g6", "b6", "d7", "g7"], 0.5, 0.06, 1.0, 96), gain_db=2, pan=0.25),
                part(HARP, run(["g4", "a4", "b4", "d5", "e5", "g5"], 0.0, 0.07, 0.8, 84), gain_db=4, pan=-0.25),
            ],
            [(0.5, synth.sparkle(1.6, 18, gain=0.08, seed=15))],
            level=-13,
            room=1.4,
        )
    )
    add(Effect("purchase", 0.9, [part(GLOCKENSPIEL, [n(0, 0.4, "e7", 92), n(0.07, 0.6, "b7", 96)]), part(KIT_STANDARD, [hit("triangle", 0, 84, 0.6)], gain_db=0)], [(0.05, synth.coin_shower(0.6, 10, gain=0.09, seed=16))], level=-17))
    add(
        Effect(
            "levelUp",
            2.0,
            [
                part(HARP, run(["g4", "a4", "b4", "d5", "e5", "g5", "a5", "b5", "d6", "e6", "g6"], 0, 0.035, 0.9, 74, 2)),
                part(CHOIR, chord(["g4", "b4", "d5"], 0.35, 1.3, 84), gain_db=-4),
                part(TUBULAR_BELLS, [n(0.4, 1.4, "g5", 96)], gain_db=-3),
            ],
            [(0.4, synth.sparkle(1.3, 12, gain=0.09, seed=17))],
            level=-15,
            room=1.3,
        )
    )

    # Lanterns in the shop.
    add(
        Effect(
            "lanternRise",
            3.2,
            [
                part(REVERSE_CYMBAL, [n(0.2, 3.0, 60, 100)], gain_db=-6),
                part(STRINGS_TREMOLO, [n(0, 0.85, "d4", 60), n(0.8, 0.85, "f#4", 72), n(1.6, 0.85, "a4", 86), n(2.4, 0.8, "d5", 100)], gain_db=0),
            ],
            [(0, synth.riser(3.2, 200, 1600, gain=0.11, seed=18))],
            level=-18,
            play="rise",
        )
    )
    add(
        Effect(
            "lanternOpen",
            1.2,
            [part(KIT_ORCHESTRA, [hit("crash", 0, 112, 1.0)], gain_db=-3), part(TAIKO, [n(0, 0.8, "d2", 110)], gain_db=3)],
            [(0, synth.whoosh(0.6, 6000, 800, gain=0.13, seed=19)), (0.02, synth.sparkle(1.0, 16, gain=0.07, seed=21))],
            level=-15,
        )
    )
    add(Effect("lanternReveal-common", 0.9, [part(CELESTA, [n(0, 0.6, "f#6", 86), n(0.06, 0.7, "a6", 90)]), part(GLOCKENSPIEL, [n(0.12, 0.6, "d7", 76)], gain_db=3)], level=-19))
    add(Effect("lanternReveal-uncommon", 1.1, [part(CELESTA, run(["d6", "f#6", "a6"], 0, 0.06, 0.7, 92)), part(GLOCKENSPIEL, run(["d7", "f#7"], 0.18, 0.06, 0.7, 72), gain_db=-5), part(HARP, [n(0, 0.8, "d5", 84)], gain_db=2)], level=-18))
    add(
        Effect(
            "lanternReveal-rare",
            1.6,
            [part(VIBRAPHONE, chord(["d5", "f#5", "a5", "c#6"], 0, 1.3, 92), gain_db=1), part(CELESTA, run(["d6", "f#6", "a6", "d7"], 0.05, 0.07, 0.8, 94)), part(TUBULAR_BELLS, [n(0.28, 1.2, "d6", 84)], gain_db=-6)],
            [(0.2, synth.sparkle(1.0, 10, gain=0.055, seed=22))],
            level=-16,
            room=1.2,
        )
    )
    add(
        Effect(
            "lanternReveal-epic",
            2.2,
            [
                part(STRINGS_SLOW, chord(["d4", "a4", "d5", "f#5"], 0, 1.8, 92), gain_db=-2),
                part(CHOIR, chord(["d5", "f#5", "a5"], 0.1, 1.7, 80), gain_db=-5),
                part(GLOCKENSPIEL, run(["a7", "f#7", "d7", "b6", "a6"], 0.2, 0.06, 0.8, 86), gain_db=-4, pan=0.2),
                part(HARP, run(["d5", "e5", "f#5", "a5", "b5", "d6", "e6"], 0, 0.03, 0.8, 88), gain_db=4, pan=-0.2),
            ],
            [(0.2, synth.shimmer(1.6, 1760, gain=0.06, seed=23))],
            level=-15,
            room=1.4,
        )
    )
    add(
        Effect(
            "lanternReveal-legendary",
            2.6,
            [
                part(BRASS, [n(0, 0.12, "d5", 104), n(0.12, 0.15, "a5", 110)] + chord(["d4", "a4", "d5", "f#5"], 0.3, 1.6, 116)),
                part(TIMPANI, [n(0.3, 1.2, "d2", 116)], gain_db=2),
                part(KIT_ORCHESTRA, [hit("crash", 0.3, 110, 1.4)], gain_db=-1),
                part(GLOCKENSPIEL, run(["d7", "f#7", "a7", "d7", "a6"], 0.35, 0.06, 0.9, 92), gain_db=1, pan=0.25),
            ],
            [(0.3, synth.sparkle(1.8, 20, gain=0.09, seed=24))],
            level=-14,
            room=1.5,
        )
    )
    add(
        Effect(
            "lanternReveal-mythic",
            3.0,
            [
                part(CHOIR, chord(["d4", "a4", "d5", "f#5", "a5"], 0, 2.6, 90), gain_db=-4),
                part(BRASS, [n(0, 0.12, "d5", 106), n(0.12, 0.12, "f#5", 110), n(0.24, 0.12, "a5", 114)] + chord(["d4", "f#4", "a4", "d5"], 0.36, 1.8, 118)),
                part(TIMPANI, [n(i * 0.045, 0.045, "d2", 60 + i * 6) for i in range(8)] + [n(0.36, 1.4, "d2", 120)], gain_db=-2),
                part(KIT_ORCHESTRA, [hit("crash", 0.36, 115, 1.6)], gain_db=-4),
                part(TUBULAR_BELLS, [n(0.36, 1.2, "d5", 96), n(0.5, 1.2, "a5", 96), n(0.64, 1.4, "d6", 100)], gain_db=0),
                part(GLOCKENSPIEL, run(["d8", "a7", "f#7", "e7", "d7", "a6", "f#6", "d6"], 0.4, 0.06, 0.9, 94), gain_db=-1, pan=0.3),
            ],
            [(0.3, synth.shimmer(2.4, 1760, gain=0.07, seed=25)), (0.36, synth.sparkle(2.2, 26, gain=0.1, seed=26))],
            level=-13,
            room=1.7,
        )
    )

    # Coins and tricks.
    add(Effect("coin", 0.5, [part(GLOCKENSPIEL, [n(0, 0.35, "b6", 90), n(0.06, 0.45, "e7", 100)])], [(0.05, synth.coin_shower(0.3, 4, gain=0.1, seed=27))], level=-19))
    add(
        Effect(
            "jackpot",
            1.8,
            [
                part(BRASS, chord(["d5", "f#5", "a5", "d6"], 0, 0.5, 108), gain_db=-6),
                part(GLOCKENSPIEL, run(["d6", "f#6", "a6", "d7", "f#7"], 0, 0.05, 1.0, 96), gain_db=-2, pan=0.2),
                part(KIT_ORCHESTRA, [hit("crash", 0, 108, 1.2)], gain_db=-5),
            ],
            [(0.15, synth.coin_shower(1.4, 30, gain=0.16, seed=28))],
            level=-13,
            room=1.2,
        )
    )
    add(Effect("steal", 0.7, [part(VIOLINS_PIZZICATO, run(["d5", "f#5", "a5", "d6"], 0.12, 0.05, 0.4, 96))], [(0, synth.whoosh(0.26, 900, 5000, gain=0.16, seed=29, pan_sweep=0.8))], level=-17))
    add(
        Effect(
            "stolen",
            0.9,
            [part(VIOLINS_PIZZICATO, run(["a5", "f5", "d5"], 0.12, 0.07, 0.4, 92)), part(CONCERT_BASS_DRUM, [n(0.3, 0.6, 40, 70)], gain_db=-8)],
            [(0, synth.whoosh(0.26, 5000, 900, gain=0.1, seed=30, pan_sweep=-0.8))],
            level=-18,
        )
    )
    add(
        Effect(
            "swap",
            0.8,
            [part(HARP, run(["d5", "e5", "f#5", "a5", "b5", "d6"], 0, 0.035, 0.5, 84), pan=-0.4), part(HARP, run(["d6", "b5", "a5", "f#5", "e5", "d5"], 0.05, 0.035, 0.5, 84), pan=0.4)],
            [(0, synth.whoosh(0.32, 1500, 3200, gain=0.1, seed=31))],
            level=-17,
        )
    )
    add(
        Effect(
            "shield",
            1.1,
            [part(VIBRAPHONE, chord(["e5", "g#5", "b5", "e6"], 0.02, 1.0, 86), gain_db=-2), part(CRYSTAL, [n(0, 0.9, "e6", 80)], gain_db=-8)],
            [(0, synth.whoosh(0.3, 1200, 6000, gain=0.08, seed=32)), (0.02, synth.shimmer(0.9, 1318.5, gain=0.05, seed=33))],
            level=-17,
        )
    )
    add(Effect("bust", 0.9, [part(CONCERT_BASS_DRUM, [n(0, 0.6, 40, 96)], gain_db=-3), part(MUTED_TRUMPET, [n(0.05, 0.18, "g4", 86), n(0.26, 0.5, "e4", 82)], gain_db=-2)], level=-18))

    # Building and battles.
    add(Effect("build", 0.5, [part(KIT_STANDARD, [hit("block_lo", 0, 100)], reverb=0.05), part(TAIKO, [n(0, 0.4, "d2", 70)], gain_db=-8), part(MARIMBA, [n(0.02, 0.4, "a4", 86)], gain_db=-3)], [(0, synth.click(0.12, bright=2500))], level=-18))
    add(Effect("upgrade", 0.9, [part(HARP, run(["a4", "d5", "f#5", "a5"], 0, 0.05, 0.6, 86)), part(GLOCKENSPIEL, [n(0.18, 0.6, "d7", 84)], gain_db=-4)], [(0.18, synth.sparkle(0.6, 6, gain=0.08, seed=34))], level=-17))
    add(Effect("hit", 0.45, [part(KIT_STANDARD, [hit("snare", 0, 112)], gain_db=-4, reverb=0.08), part(TAIKO, [n(0, 0.35, "d2", 100)], gain_db=-4)], [(0, synth.impact(0.35, gain=0.6, crack=0.3))], level=-15))
    add(Effect("hurt", 0.6, [part(MARIMBA, [n(0.04, 0.4, "e3", 84)], gain_db=-4)], [(0, synth.impact(0.45, 110, 34, gain=0.7, crack=0.08, seed=35)), (0.04, synth.whoosh(0.3, 2000, 400, gain=0.08, seed=36))], level=-16))
    add(
        Effect(
            "powerUp",
            1.2,
            [part(CELESTA, chord(["d6", "f#6", "a6"], 0.38, 0.8, 92)), part(GLOCKENSPIEL, [n(0.38, 0.7, "d7", 92)], gain_db=2)],
            [(0, synth.riser(0.4, 300, 1500, gain=0.16, seed=37)), (0.38, synth.sparkle(0.8, 8, gain=0.09, seed=38))],
            level=-16,
        )
    )
    add(Effect("win", 1.3, [part(BRASS, [n(0, 0.1, "d5", 104), n(0.1, 0.1, "f#5", 108), n(0.2, 0.1, "a5", 112), n(0.32, 0.8, "d6", 116)] + chord(["d4", "f#4", "a4"], 0.32, 0.8, 104)), part(KIT_ORCHESTRA, [hit("crash", 0.32, 100, 1.0)], gain_db=-2), part(GLOCKENSPIEL, [n(0.32, 0.8, "d7", 96)], gain_db=5)], level=-15))
    add(Effect("lose", 1.0, [part(MARIMBA, [n(0, 0.3, "a4", 86), n(0.18, 0.3, "f4", 84), n(0.36, 0.6, "d4", 82)]), part(CELLI_PIZZICATO, [n(0.36, 0.5, "d3", 72)], gain_db=-8)], level=-19))

    # The room, and boards.
    add(
        Effect(
            "event",
            2.0,
            [
                part(TIMPANI, [n(i * 0.05, 0.05, "d2", 50 + i * 6) for i in range(10)], gain_db=-2),
                part(BRASS, chord(["d4", "a4", "d5", "f#5"], 0.5, 1.1, 102), gain_db=-2),
                part(TUBULAR_BELLS, [n(0.5, 1.3, "d5", 96)], gain_db=-1),
                part(CHOIR, chord(["d5", "f#5", "a5"], 0.5, 1.2, 80), gain_db=-6),
                part(KIT_ORCHESTRA, [hit("crash", 0.5, 90, 1.2)], gain_db=-8),
            ],
            level=-15,
            room=1.4,
        )
    )
    add(Effect("alarm", 0.8, [part(KIT_STANDARD, [hit("tom_lo", 0, 104)], gain_db=6, reverb=0.1)], [(0.0, synth.tone(1320, 0.14, kind="triangle", decay=4)), (0.18, synth.tone(990, 0.16, kind="triangle", decay=4)), (0.36, synth.tone(1320, 0.14, kind="triangle", decay=4)), (0.54, synth.tone(990, 0.16, kind="triangle", decay=4))], level=-18))
    add(Effect("countdown", 0.35, [part(KIT_STANDARD, [hit("block_hi", 0, 104)], reverb=0.05), part(GLOCKENSPIEL, [n(0, 0.3, "a6", 74)], gain_db=-5)], level=-19))
    add(Effect("go", 1.1, [part(BRASS, chord(["d4", "f#4", "a4", "d5"], 0, 0.6, 116)), part(KIT_ORCHESTRA, [hit("crash", 0, 108, 1.0)], gain_db=1)], [(0, synth.whoosh(0.4, 600, 5000, gain=0.18, seed=39))], level=-14))
    add(Effect("dice", 0.55, [part(KIT_STANDARD, [hit("block_lo", 0.4, 104)], reverb=0.05)], [(0, synth.rattle(0.42))], level=-18))
    for i, p in enumerate(["d5", "e5", "f#5", "a5", "b5", "d6"]):
        add(Effect(f"step-{i}", 0.25, [part(MARIMBA, [n(0, 0.2, p, 82)], reverb=0.1)], [(0, synth.click(0.06, bright=3500, seed=40 + i))], level=-22))
    add(
        Effect(
            "capture",
            1.0,
            [part(TAIKO, [n(0, 0.6, "d2", 112)], gain_db=1), part(BRASS, chord(["d4", "a4", "d5"], 0, 0.3, 108), gain_db=-3), part(GLOCKENSPIEL, run(["a6", "d7"], 0.1, 0.06, 0.6, 90), gain_db=0), part(KIT_ORCHESTRA, [hit("crash", 0, 88, 0.8)], gain_db=-4)],
            level=-15,
        )
    )
    return fx
