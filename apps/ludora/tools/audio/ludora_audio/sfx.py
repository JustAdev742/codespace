"""Every sound effect, as a short piece of sound design.

Each effect is layered the way a game sound is: a transient that says when (a
click, a knock, a drum), a tonal body with real harmonics (the synth patches:
mallets, plucks, lantern bells, warm keys, brass), and sparkle or air on top
where it fits (pitched sparkles, the kit's chimes and jingles, a whoosh). The
layers are placed across the stereo field, while everything under 150 Hz is
made mono, so an effect is wide on headphones and loses nothing on a
projector's single speaker. Low hits carry harmonics above 150 Hz, so they are
heard on the laptop and Chromebook speakers a classroom has.

Every effect goes through a small room and is made to the loudness its job
needs: quiet taps and ticks, clear answer feedback, big moments louder. Its
ring is damped to silence within `tail` seconds of its peak, so effects never
pile up into a wash. Effects in a family (players joining, reactions, board
steps, Lantern reveals by rarity) are separate files, so nothing is
pitch-shifted at play time; the ones heard most often have other takes
(`alts`) and a gentle pitch spread (`vary`), so a sound heard all game is
never quite the same twice.

The melodic effects sit in D major pentatonic (D, E, F#, A, B), the "sparkle"
scale, so they stay friendly with each other: joins climb it, so a crowd
arriving plays a little tune, and board steps walk up it. The end-of-game
fanfare and the level-up are in G, like the results music.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from . import dsp, synth
from .engine import Patch, butter_filter, mono_below
from .instruments import BRASS as SF_BRASS
from .instruments import CHOIR, MUTED_TRUMPET, TIMPANI
from .kit import KIT_ARCADE, KIT_FESTIVAL, KIT_LANTERN, Kit
from .notation import DRUM, Instrument, Mix, Note, Part, midi
from .patches import ARP_SYNTH, BRASS_STAB, CHIP_LEAD, FM_BELL, MALLET, PLUCK, ROUND_BASS, SUPERSAW_PAD, WARM_KEYS
from .render import SR, render_part
from .transitions import DOWNLIFTER, IMPACT, REVERSE_SWELL, RISER, SWEEP_UP

# --- The voices, shaped for effects: shorter rings than in the music. ------------------------

BELL = FM_BELL.tweak(decay=1.1, release=0.45)
BELL_SHORT = FM_BELL.tweak(decay=0.45, release=0.2)
BELL_BIG = FM_BELL.tweak(decay=1.9, release=0.8)
KEYS = WARM_KEYS.tweak(decay=1.3, release=0.3)
KEYS_SHORT = WARM_KEYS.tweak(decay=0.55, release=0.15)
MALLET_SHORT = MALLET.tweak(decay=0.32, release=0.12)
PLUCK_SHORT = PLUCK.tweak(decay=0.3, release=0.15)
PAD = SUPERSAW_PAD.tweak(attack=0.03, decay=0.9, sustain=0.55, release=0.55)
SWELL_PAD = SUPERSAW_PAD.tweak(attack=0.5, release=0.25)
BRASS = BRASS_STAB.tweak(release=0.22)
MUTED_BRASS = BRASS_STAB.tweak(cutoff=650, env_amount=1.4, release=0.15)
BASS = ROUND_BASS.tweak(release=0.2)
CHIP = CHIP_LEAD.tweak(cutoff=3800, release=0.05)
ARP = ARP_SYNTH.tweak(release=0.06)

# The "sparkle" scale (D major pentatonic from A4): joins climb through it.
SPARKLE = ["a4", "b4", "d5", "e5", "f#5", "a5", "b5", "d6"]
# Board steps walk up it from D5.
STEPS = ["d5", "e5", "f#5", "a5", "b5", "d6"]


def hz(pitch: str) -> float:
    return 440.0 * 2 ** ((midi(pitch) - 69) / 12)


def n(t: float, dur: float, pitch: str | int, vel: int = 96) -> Note:
    return Note(t, dur, midi(pitch) if isinstance(pitch, str) else pitch, int(np.clip(vel, 1, 127)))


def run(pitches: list[str], start: float, spacing: float, dur: float = 0.6, vel: int = 90, vel_step: int = 0) -> list[Note]:
    """Notes one after another, `spacing` seconds apart (an arpeggio or a glissando)."""
    return [n(start + i * spacing, dur, p, vel + i * vel_step) for i, p in enumerate(pitches)]


def chord(pitches: list[str], start: float, dur: float, vel: int = 96) -> list[Note]:
    return [n(start, dur, p, vel) for p in pitches]


def drum(lane: str, t: float, vel: int = 100, dur: float = 0.2) -> Note:
    return Note(t, dur, DRUM[lane], int(np.clip(vel, 1, 127)))


def roll(lane: str, start: float, end: float, step: float, v0: int, v1: int) -> list[Note]:
    """A drum roll from `start` to `end` (not including it), growing from velocity v0 to v1."""
    count = max(1, round((end - start) / step))
    return [drum(lane, start + i * step, int(v0 + (v1 - v0) * i / max(1, count - 1))) for i in range(count)]


def part(instrument: Instrument | Patch | Kit, notes: list[Note], gain_db: float = 0.0, pan: float = 0.0, reverb: float = 0.2, width: float = 1.0, highpass: float | None = None, lowpass: float | None = None) -> Part:
    return Part("x", instrument, notes, Mix(gain_db=gain_db, pan=pan, reverb=reverb, highpass=highpass, lowpass=lowpass, width=width))


@dataclass
class Effect:
    name: str
    seconds: float
    parts: list[Part] = field(default_factory=list)
    # Synthesised layers: (seconds, audio) or (seconds, audio, reverb send).
    layers: list[tuple] = field(default_factory=list)
    # Loudness of the finished effect (LUFS; very short effects are measured padded to half a second).
    level: float = -18.0
    # The room's reverb time (RT60, seconds).
    room: float = 0.7
    # How the web player treats it: 'once' plays from the start; 'rise' can start part-way so its end lands on time.
    play: str = "once"
    # Other takes of the same sound (their names and play modes are ignored): the player picks one at
    # random each time, never the one it played last, so a sound heard all game never repeats exactly.
    alts: list[Effect] = field(default_factory=list)
    # Cents either way the player may shift the pitch of each play, for the same reason. 'once' only.
    vary: float = 0.0
    # The ring is damped to silence within this many seconds of the peak (or of `hold`, if that is later).
    tail: float = 1.3
    hold: float = 0.0
    # Seeds the kit's round robin and the patches' free phases, so takes differ in their details.
    seed: int = 0
    # Mono under this (Hz), and nothing under `highpass` (Hz): no wasted sub on speakers that cannot play it.
    mono_below: float = 150.0
    highpass: float = 40.0
    # True peak of the finished render (dBTP): under the -1 dBTP ceiling by enough that the MP3
    # encoder's overshoot on sharp transients (up to about 0.8 dB) stays under it too.
    ceiling: float = -2.0


def _damp_tail(mix: np.ndarray, tail: float, hold: float) -> np.ndarray:
    """Damp the ring after the peak (or after `hold`) smoothly to 60 dB down within `tail` seconds.

    The extra attenuation grows with the square of the time, from nothing at 40% of
    the tail to 60 dB at its end, so a ring dies a little faster, as if a hand settled
    on it, rather than stopping.
    """
    env = np.max(np.abs(mix), axis=1)
    anchor = max(int(np.argmax(env)), int(hold * SR))
    t0 = anchor + int(0.4 * tail * SR)
    t1 = anchor + int(tail * SR)
    if t0 >= len(mix):
        return mix
    k = np.arange(len(mix))
    x = np.clip((k - t0) / max(1, t1 - t0), 0.0, 1.0)
    gain = 10 ** (-60 * x**2 / 20)
    gain[k >= t1] = 0.0
    return (mix * gain[:, None]).astype(np.float32)


def render(effect: Effect) -> np.ndarray:
    total = int((effect.seconds + effect.tail + 0.8) * SR)
    dry = np.zeros((total, 2), dtype=np.float32)
    send = np.zeros_like(dry)
    for p in effect.parts:
        audio = render_part(p, 60.0, effect.seconds, repeats=1, seed=effect.seed, gain=0.6)
        x = dsp.fit(audio, total)
        x = dsp.process(x, dsp.eq_board(p.mix.highpass, p.mix.lowpass))
        x = x * dsp.db(p.mix.gain_db)
        if p.mix.width != 1.0:
            x = dsp.width(x, p.mix.width)
        if p.mix.pan:
            x = dsp.pan(x, p.mix.pan)
        dry += x
        send += x * p.mix.reverb
    for layer in effect.layers:
        at, audio = layer[0], layer[1]
        amount = layer[2] if len(layer) > 2 else 0.25
        dsp.place(dry, audio, int(at * SR))
        dsp.place(send, audio * amount, int(at * SR))
    wet = dsp.reverb(send, dsp.make_ir(effect.room, predelay=0.012, seed=5, brightness=0.6), low_cut=250)
    mix = dry + wet * dsp.db(-3)
    # Mono lows (zero phase), then nothing under the highpass: neither changes what small speakers play.
    mix = mono_below(mix.astype(np.float64), effect.mono_below)
    mix = butter_filter(mix, "high", effect.highpass, order=2)
    # The MP3 encoder cuts above about 17 kHz anyway; cutting a little before it keeps sharp transients
    # from overshooting the ceiling when it does (the measured peak is then the peak players get).
    mix = butter_filter(mix, "low", 16000, order=4)
    mix = _damp_tail(mix.astype(np.float32), effect.tail, effect.hold)
    # Cut the silence after the sound has died away, then fade the last few milliseconds.
    env = np.max(np.abs(mix), axis=1)
    loud = np.nonzero(env > dsp.db(-60) * max(env.max(), 1e-9))[0]
    end = int(min(total, (loud[-1] if len(loud) else 0) + 0.02 * SR))
    end = max(end, int(effect.seconds * 0.5 * SR))
    mix = dsp.fade(mix[:end], fade_out=0.03)
    # Limiting a sharp transient to the ceiling costs a little loudness, so it measures again and makes
    # it up, a few times at most.
    for _ in range(3):
        mix = dsp.normalize_loudness(mix, effect.level, ceiling_db=effect.ceiling)
        if abs(dsp.lufs(mix) - effect.level) < 0.1:
            break
    return mix


class Take:
    """The details that differ between takes of one effect: seeds, and a hair of timing and velocity.

    Take 0 (the main file) is exactly as written; the others nudge each note a few
    milliseconds and a few velocity steps, pick other kit hits and other noise.
    """

    def __init__(self, base: int, k: int = 0):
        self.k = k
        self.seed = base * 100 + k
        self._rng = np.random.default_rng(self.seed)

    def s(self, offset: int = 0) -> int:
        return self.seed * 10 + offset

    def v(self, vel: int, spread: int = 6) -> int:
        return int(np.clip(vel + (self._rng.integers(-spread, spread + 1) if self.k else 0), 1, 127))

    def t(self, t: float, spread: float = 0.004) -> float:
        return max(0.0, t + (float(self._rng.uniform(-spread, spread)) if self.k else 0.0))

    def g(self, gain: float, spread_db: float = 1.0) -> float:
        return gain * (10 ** (float(self._rng.uniform(-spread_db, spread_db)) / 20) if self.k else 1.0)


def with_takes(make, base: int, count: int) -> Effect:
    """The main take of an effect (exactly as written), with `count - 1` other takes from the same recipe."""
    main = make(Take(base, 0))
    main.alts = [make(Take(base, k)) for k in range(1, count)]
    return main


# --- Answering ---------------------------------------------------------------------------


def _select(tk: Take) -> Effect:
    return Effect(
        "select",
        0.35,
        [
            part(MALLET, [n(tk.t(0), 0.25, "e6", tk.v(84))], pan=-0.2, reverb=0.15),
            part(PLUCK_SHORT, [n(tk.t(0.004), 0.2, "e5", tk.v(84))], gain_db=1, pan=0.3, reverb=0.15),
        ],
        [
            (0, synth.click(tk.g(0.12), bright=5000, seed=tk.s(1), corr=0.5)),
            (0.004, synth.glint(hz("e7"), 0.2, gain=tk.g(0.06), pan=0.45, decay=0.05), 0.4),
            (0.006, synth.glint(hz("b7"), 0.15, gain=tk.g(0.05), pan=-0.45, decay=0.04), 0.4),
        ],
        level=-25,
        room=0.45,
        tail=0.35,
        vary=12,
        seed=tk.seed,
    )


def _tap(tk: Take) -> Effect:
    return Effect(
        "tap",
        0.15,
        [
            part(KIT_FESTIVAL, [drum("block_hi", 0, tk.v(66))], gain_db=-6, pan=0.2, reverb=0.05),
            part(KIT_FESTIVAL, [drum("hat", 0, tk.v(56))], gain_db=-6, pan=-0.3, reverb=0.05),
        ],
        [
            (0, synth.knock(1350 + 40 * tk.k, 0.07, gain=tk.g(0.25), seed=tk.s(1), pan=-0.15, damp=0.012)),
            (0, synth.thump(330, 0.07, gain=tk.g(0.13), drop=1.4, drive=1.2, decay=0.016)),
            (0, synth.click(tk.g(0.12), bright=5200, seed=tk.s(2), corr=0.45)),
        ],
        level=-25,
        room=0.35,
        tail=0.2,
        vary=15,
        seed=tk.seed,
    )


def _lock_in(tk: Take) -> Effect:
    return Effect(
        "lockIn",
        0.7,
        [
            part(MALLET, [n(tk.t(0), 0.35, "e5", tk.v(92)), n(tk.t(0.075), 0.5, "a5", tk.v(98))], pan=-0.25),
            part(PLUCK, [n(tk.t(0.075), 0.4, "a4", tk.v(84))], gain_db=-7, pan=0.35),
            part(BELL_SHORT, [n(tk.t(0.078), 0.4, "a6", tk.v(76))], gain_db=-2, pan=0.4, reverb=0.3),
            part(KIT_FESTIVAL, [drum("rim", tk.t(0.075), tk.v(64)), drum("shaker", 0, tk.v(56))], gain_db=-12, pan=-0.2, reverb=0.1),
        ],
        [(0.075, synth.click(tk.g(0.06), bright=4500, seed=tk.s(1), corr=0.5))],
        level=-20,
        room=0.6,
        tail=0.7,
        hold=0.075,
        vary=10,
        seed=tk.seed,
    )


def _correct(tk: Take) -> Effect:
    return Effect(
        "correct",
        1.1,
        [
            part(PLUCK, run(["d5", "f#5", "a5"], 0, 0.06, 0.5, tk.v(92), 4), pan=-0.3),
            part(BELL, run(["d6", "f#6", "a6"], 0, 0.06, 0.4, tk.v(80), 4) + [n(0.18, 0.7, "d7", tk.v(98))], gain_db=1, pan=0.3, reverb=0.3),
            part(KEYS, chord(["d4", "a4", "d5"], 0.18, 0.6, tk.v(78)), gain_db=-7),
            part(KIT_FESTIVAL, [drum("chime", 0.18, tk.v(64)), drum("shaker", 0, tk.v(60)), drum("tamb", 0.18, tk.v(52))], gain_db=-10, reverb=0.25),
        ],
        [(0.18, synth.sparkle(0.8, 8, lo=2300, hi=6000, gain=tk.g(0.05), seed=tk.s(1)), 0.35)],
        level=-16,
        room=0.9,
        tail=1.25,
        hold=0.18,
        seed=tk.seed,
    )


def _wrong(tk: Take) -> Effect:
    # Gentle and low, never a buzzer: two soft falling notes with a warm bass under them.
    return Effect(
        "wrong",
        0.8,
        [
            part(KEYS_SHORT, [n(tk.t(0), 0.22, "a4", tk.v(90)), n(tk.t(0.17), 0.45, "f4", tk.v(86))], pan=-0.3),
            part(MALLET, [n(tk.t(0), 0.22, "a4", tk.v(70)), n(tk.t(0.17), 0.4, "f4", tk.v(66))], gain_db=-6, pan=0.4),
            part(BASS, [n(tk.t(0.17), 0.32, "d3", tk.v(70))], gain_db=-9),
            part(KIT_LANTERN, [drum("bongo_lo", tk.t(0.17), tk.v(48))], gain_db=-14, reverb=0.1),
        ],
        [(0.0, synth.whoosh(0.35, 3200, 800, gain=tk.g(0.06), q=1.2, seed=tk.s(1), corr=0.5), 0.2)],
        level=-19,
        room=0.6,
        tail=0.85,
        hold=0.17,
        vary=8,
        seed=tk.seed,
    )


def _tick() -> Effect:
    return Effect(
        "tick",
        0.1,
        [
            part(KIT_FESTIVAL, [drum("block_lo", 0, 92)], gain_db=-8, pan=-0.15, reverb=0.04),
            part(KIT_FESTIVAL, [drum("hat", 0, 72), drum("pedal", 0.004, 50)], gain_db=-2, pan=0.35, reverb=0.04),
        ],
        [
            (0, synth.knock(1050, 0.06, gain=0.22, seed=31, pan=0.1, damp=0.01)),
            (0, synth.thump(392, 0.05, gain=0.15, drop=1.3, drive=1.2, decay=0.012)),
            (0, synth.click(0.14, bright=4200, seed=32, corr=0.4)),
        ],
        level=-23,
        room=0.3,
        tail=0.22,
    )


def _tick_final() -> Effect:
    return Effect(
        "tickFinal",
        0.4,
        [
            part(KIT_FESTIVAL, [drum("block_hi", 0, 110), drum("hat", 0, 56)], gain_db=-6, reverb=0.05),
            part(BELL_SHORT, [n(0, 0.3, "e6", 92), n(0, 0.3, "e7", 70)], gain_db=-1, pan=0.3, reverb=0.3),
            part(PLUCK_SHORT, [n(0, 0.25, "e5", 84)], gain_db=-9, pan=-0.25),
        ],
        [(0, synth.knock(1500, 0.06, gain=0.15, seed=33, damp=0.01)), (0, synth.click(0.06, bright=4500, seed=34, corr=0.5))],
        level=-19,
        room=0.5,
        tail=0.45,
    )


def _time_up() -> Effect:
    return Effect(
        "timeUp",
        1.6,
        [
            part(BELL_BIG, chord(["a4", "e5", "a5"], 0, 0.8, 100), gain_db=4, pan=0.2, reverb=0.3),
            part(KEYS, chord(["e4", "a4"], 0, 0.7, 90), gain_db=-6, pan=-0.25),
            part(KIT_FESTIVAL, [drum("tom_lo", 0, 96)], gain_db=-14, reverb=0.2),
            part(KIT_FESTIVAL, [drum("splash", 0, 84), drum("triangle", 0.01, 60)], gain_db=-8, pan=-0.2, reverb=0.3),
            part(DOWNLIFTER, [n(0, 0.9, "a3", 80)], gain_db=-8, width=0.7, reverb=0.2),
        ],
        [(0, synth.thump(220, 0.4, gain=0.22, drop=1.6, drive=2.2, decay=0.1))],
        level=-16,
        room=1.0,
        tail=1.45,
    )


def _question() -> Effect:
    return Effect(
        "question",
        1.0,
        [
            part(SWEEP_UP, [n(0, 0.32, "c4", 90)], gain_db=-7, width=0.8, reverb=0.25),
            part(BELL, [n(0.28, 0.4, "a5", 84), n(0.36, 0.6, "d6", 90)], pan=-0.2, reverb=0.3),
            part(PLUCK, [n(0.28, 0.35, "a6", 80), n(0.36, 0.5, "d7", 84)], gain_db=-8, pan=0.3),
            part(KIT_FESTIVAL, [drum("triangle", 0.36, 54)], gain_db=-12, reverb=0.3),
        ],
        [(0, synth.click(0.05, bright=3500, seed=35)), (0.36, synth.sparkle(0.5, 4, lo=2600, hi=6000, gain=0.04, seed=36), 0.35)],
        level=-20,
        room=0.8,
        tail=1.0,
        hold=0.36,
    )


def _reveal() -> Effect:
    return Effect(
        "reveal",
        1.4,
        [
            part(PLUCK, run(["d5", "e5", "f#5"], 0, 0.03, 0.5, 80, 3), pan=-0.35),
            part(PLUCK, run(["a5", "b5", "d6"], 0.09, 0.03, 0.6, 88, 3), pan=0.3),
            part(BELL, [n(0.18, 0.6, "d6", 82), n(0.18, 0.6, "a6", 78), n(0.2, 0.8, "d7", 86)], gain_db=-1, pan=0.25, reverb=0.3),
            part(KEYS, chord(["d4", "f#4", "a4", "d5"], 0.18, 0.8, 80), gain_db=-6, pan=-0.15),
            part(BASS, [n(0.18, 0.5, "d3", 72)], gain_db=-10),
            part(KIT_FESTIVAL, [drum("chime", 0.1, 78)], gain_db=-8, reverb=0.3),
        ],
        [(0.18, synth.sparkle(0.7, 6, gain=0.04, seed=37), 0.35)],
        level=-17,
        room=1.0,
        tail=1.3,
        hold=0.2,
    )


def _join(i: int, p: str) -> Effect:
    # Each arrival a little further across, so a crowd joining walks the tune from left to right.
    # The note in three octaves (a warm one under it for the high notes, a bright pluck and a bell over
    # it), so its energy is spread across the spectrum rather than sitting on one sine.
    pan = -0.3 + 0.6 * i / (len(SPARKLE) - 1)
    up = SPARKLE[min(len(SPARKLE) - 1, i + 2)]
    high = i >= 5
    return Effect(
        f"join-{i}",
        0.6,
        [
            part(MALLET, [n(0.01, 0.4, p, 92)], gain_db=-3, pan=pan),
            part(PLUCK_SHORT, [n(0.01, 0.3, midi(p) + (0 if high else 12), 88)], gain_db=-4 if high else 0, pan=float(np.clip(pan + 0.45, -0.6, 0.6))),
            part(BELL_SHORT, [n(0.012, 0.35, midi(p) + 12, 80)], gain_db=0 if high else -1, pan=float(np.clip(pan - 0.45, -0.6, 0.6)), reverb=0.3),
            part(KEYS_SHORT, [n(0.01, 0.3, midi(p) - 12, 84)], gain_db=3 if high else -14, pan=-pan * 0.5),
        ],
        [
            (0, synth.pop(700 + i * 40, gain=0.07, pan=pan, seed=40 + i)),
            (0, synth.click(0.07, bright=5000, seed=70 + i, corr=0.5)),
            (0.03, synth.glint(hz(p) * 8, 0.22, gain=0.06, pan=-pan, decay=0.05), 0.4),
            (0.05, synth.glint(hz(up) * 4, 0.2, gain=0.04, pan=pan, decay=0.04), 0.4),
        ],
        level=-20,
        room=0.6,
        tail=0.75,
    )


REACTION_NOTES = ["d6", "e6", "f#6", "a6"]


def _reaction(i: int, tk: Take) -> Effect:
    p = REACTION_NOTES[i]
    return Effect(
        f"reaction-{i}",
        0.22,
        [part(MALLET_SHORT, [n(tk.t(0.006), 0.15, p, tk.v(80))], gain_db=-9, pan=0.3)],
        [
            (0, synth.pop(520 + i * 70, gain=tk.g(0.5), pan=-0.15, harmonics=0.3, seed=tk.s(1))),
            (0, synth.air(0.06, 2500, 9000, decay=0.012, gain=tk.g(0.1), seed=tk.s(2), corr=0.4)),
            (0.02, synth.sparkle(0.15, 3, lo=2300, hi=6000, gain=tk.g(0.09), seed=tk.s(3)), 0.4),
        ],
        level=-23,
        room=0.45,
        tail=0.4,
        vary=20,
        seed=tk.seed,
    )


def _rank_up() -> Effect:
    return Effect(
        "rankUp",
        0.8,
        [
            part(MALLET, [n(0, 0.35, "a5", 92), n(0.07, 0.5, "d6", 98)], pan=-0.1),
            part(BELL, [n(0.003, 0.3, "a6", 74), n(0.073, 0.5, "d7", 84)], gain_db=-3, pan=0.4, reverb=0.3),
            part(PLUCK, [n(0, 0.3, "a4", 82), n(0.07, 0.4, "d5", 86)], gain_db=-3, pan=-0.4),
            part(KIT_FESTIVAL, [drum("shaker", 0, 62), drum("shaker", 0.07, 70)], gain_db=-12, reverb=0.15),
        ],
        [(0.07, synth.sparkle(0.6, 5, gain=0.045, seed=14), 0.35)],
        level=-18,
        room=0.7,
        tail=0.9,
        hold=0.07,
    )


# --- The end of a game ----------------------------------------------------------------------


def _fanfare() -> Effect:
    pickup = [n(0, 0.14, "d5", 104), n(0.16, 0.14, "g5", 108), n(0.32, 0.14, "b5", 112)]
    hit = chord(["g4", "b4", "d5", "g5"], 0.5, 1.4, 116)
    return Effect(
        "fanfare",
        2.8,
        [
            part(BRASS, pickup + hit, gain_db=0, width=0.8),
            part(SF_BRASS, pickup + hit, gain_db=-4),
            part(KIT_FESTIVAL, roll("snare", 0.0, 0.48, 0.06, 40, 96) + [drum("kick", 0.5, 122), drum("snare", 0.5, 110), drum("crash", 0.5, 112)], gain_db=-4, reverb=0.25),
            part(IMPACT, [n(0.5, 1.2, "g1", 90)], gain_db=-9, reverb=0.15),
            part(PLUCK, run(["g4", "a4", "b4", "d5", "e5", "g5"], 0.0, 0.07, 0.5, 84, 3), gain_db=-3, pan=-0.35),
            part(BELL_BIG, run(["g6", "b6", "d7", "g7"], 0.5, 0.06, 0.9, 96), gain_db=-1, pan=0.35, reverb=0.35),
            part(PAD, chord(["g3", "d4", "g4", "b4"], 0.5, 1.4, 100), gain_db=-6, reverb=0.3),
            part(BASS, [n(0.5, 1.2, "g2", 100)], gain_db=-7),
            part(KIT_FESTIVAL, [drum("jingle", 0.5, 96), drum("chime", 0.62, 80)], gain_db=-8, reverb=0.3),
        ],
        [(0.5, synth.sparkle(1.6, 18, gain=0.06, seed=15), 0.35)],
        level=-13,
        room=1.3,
        tail=2.4,
        hold=0.5,
    )


def _purchase(tk: Take) -> Effect:
    return Effect(
        "purchase",
        0.9,
        [
            part(BELL, [n(tk.t(0.02), 0.35, "e6", tk.v(92)), n(tk.t(0.09), 0.5, "b6", tk.v(100))], gain_db=0, pan=0.2, reverb=0.3),
            part(PLUCK_SHORT, [n(tk.t(0.02), 0.3, "e5", tk.v(84)), n(tk.t(0.09), 0.4, "b5", tk.v(88))], gain_db=-8, pan=-0.25),
            part(KIT_FESTIVAL, [drum("block_lo", 0, tk.v(84)), drum("jingle", tk.t(0.02), tk.v(84)), drum("triangle", tk.t(0.09), tk.v(80))], gain_db=-8, reverb=0.2),
        ],
        [(0.06, synth.coin_shower(0.6, 10, gain=tk.g(0.07), seed=tk.s(1)), 0.3)],
        level=-17,
        room=0.8,
        tail=1.0,
        hold=0.09,
        vary=10,
        seed=tk.seed,
    )


def _level_up() -> Effect:
    land = 0.38
    return Effect(
        "levelUp",
        2.0,
        [
            part(PLUCK, run(["g4", "a4", "b4", "d5", "e5", "g5", "a5", "b5", "d6", "e6", "g6"], 0, 0.034, 0.5, 74, 2), pan=-0.3),
            part(SWEEP_UP, [n(0, land, "c4", 80)], gain_db=-10, width=0.8, reverb=0.25),
            part(BELL_BIG, chord(["g5", "d6", "g6"], land, 0.8, 96), gain_db=-1, pan=0.3, reverb=0.35),
            part(PAD, chord(["g4", "b4", "d5"], land, 1.0, 96), gain_db=-6, reverb=0.3),
            part(KEYS, chord(["g3", "d4", "g4", "b4"], land, 0.8, 86), gain_db=-7, pan=-0.15),
            part(CHOIR, chord(["g4", "b4", "d5"], land, 0.9, 80), gain_db=-10, reverb=0.35),
            part(KIT_FESTIVAL, [drum("kick", land, 96), drum("crash", land, 76), drum("chime", land, 86)], gain_db=-9, reverb=0.25),
        ],
        [(land, synth.sparkle(1.2, 12, gain=0.06, seed=17), 0.35)],
        level=-15,
        room=1.1,
        tail=1.45,
        hold=land,
    )


# --- Lanterns in the shop -----------------------------------------------------------------


def _glimmers(dur: float, count: int, seed: int) -> np.ndarray:
    """Pings that come faster, climb the scale and grow louder: the light building inside a Lantern."""
    rng = np.random.default_rng(seed)
    out = np.zeros((int(dur * SR) + SR // 2, 2), dtype=np.float32)
    notes = [p for p in synth.PENTATONIC if 1100 <= p <= 4800]
    for i in range(count):
        x = (i / count) ** 0.6
        at = int(dur * x * SR)
        f = notes[min(len(notes) - 1, int(x * len(notes) + rng.integers(0, 2)))]
        ping = synth.glint(f, 0.25, gain=0.05 + 0.15 * x**1.5, pan=float(rng.uniform(-0.7, 0.7)), decay=0.06)
        out[at : at + len(ping)] += ping[: len(out) - at]
    return out[: int(dur * SR)]


def _lantern_rise() -> Effect:
    land = 3.2
    # A glassy halo that only grows, cut on the landing.
    t = np.arange(int(2.4 * SR)) / SR
    halo = synth.shimmer(4.8, 1174.7, gain=0.08, seed=25)[: len(t)] * ((t / 2.4) ** 1.5)[:, None]
    return Effect(
        "lanternRise",
        land,
        [
            part(RISER, [n(0, land, "d3", 96)], gain_db=-4, width=0.6, reverb=0.25),
            part(SWELL_PAD, [n(0, 0.9, "d4", 60), n(0.8, 0.9, "f#4", 72), n(1.6, 0.9, "a4", 86), n(2.4, 0.8, "d5", 100)], gain_db=-7, width=0.8, reverb=0.3),
            part(KIT_FESTIVAL, roll("shaker", 1.6, land, 0.1, 30, 96), gain_db=-12, reverb=0.2),
        ],
        [(0.4, _glimmers(land - 0.45, 22, 18), 0.35), (land - 2.4, halo, 0.3)],
        level=-18,
        play="rise",
        room=0.9,
        tail=0.18,
        hold=land,
    )


def _lantern_open() -> Effect:
    return Effect(
        "lanternOpen",
        1.2,
        [
            part(IMPACT, [n(0, 1.0, "d2", 80)], gain_db=-10, reverb=0.15),
            part(KIT_FESTIVAL, [drum("crash", 0, 108), drum("clap", 0, 96), drum("jingle", 0.02, 90)], gain_db=-8, reverb=0.25),
            part(BELL, chord(["d6", "a6", "d7"], 0.02, 0.5, 90), gain_db=-1, pan=0.3, reverb=0.35),
            part(KEYS, chord(["d4", "a4", "d5", "f#5"], 0.0, 0.5, 86), gain_db=-6, pan=-0.25),
        ],
        [
            (0, synth.thump(147, 0.35, gain=0.3, drop=1.8, drive=2.2, decay=0.07)),
            (0, synth.whoosh(0.6, 6000, 800, gain=0.09, seed=19, corr=0.55), 0.3),
            (0.02, synth.sparkle(1.0, 16, gain=0.06, seed=21), 0.35),
        ],
        level=-15,
        room=1.0,
        tail=1.2,
    )


def _reveal_common() -> Effect:
    return Effect(
        "lanternReveal-common",
        0.9,
        [
            part(BELL, [n(0, 0.4, "f#5", 86), n(0.06, 0.4, "a5", 90), n(0.12, 0.6, "d6", 92)], pan=0.2, reverb=0.3),
            part(PLUCK, [n(0, 0.35, "f#5", 80), n(0.06, 0.35, "a5", 82), n(0.12, 0.45, "d6", 86)], gain_db=-6, pan=-0.25),
            part(KIT_FESTIVAL, [drum("triangle", 0.12, 48)], gain_db=-14, reverb=0.3),
        ],
        [(0.12, synth.sparkle(0.5, 4, gain=0.035, seed=51), 0.35)],
        level=-19,
        room=0.8,
        tail=1.0,
        hold=0.12,
    )


def _reveal_uncommon() -> Effect:
    return Effect(
        "lanternReveal-uncommon",
        1.1,
        [
            part(PLUCK, run(["d5", "f#5", "a5", "d6"], 0, 0.06, 0.45, 86, 3), pan=-0.3),
            part(BELL, run(["d6", "f#6", "a6"], 0, 0.06, 0.4, 82, 3) + [n(0.18, 0.7, "d7", 90)], gain_db=-1, pan=0.3, reverb=0.3),
            part(KEYS, chord(["d4", "a4", "d5"], 0, 0.6, 80), gain_db=-8),
            part(KIT_FESTIVAL, [drum("chime", 0.12, 60), drum("shaker", 0, 54)], gain_db=-11, reverb=0.3),
        ],
        [(0.18, synth.sparkle(0.7, 6, gain=0.045, seed=52), 0.35)],
        level=-18,
        room=0.9,
        tail=1.2,
        hold=0.18,
    )


def _reveal_rare() -> Effect:
    return Effect(
        "lanternReveal-rare",
        1.6,
        [
            part(KEYS, chord(["d4", "a4", "d5", "e5", "f#5"], 0, 1.0, 90), gain_db=-4, pan=-0.15),
            part(PLUCK, run(["d5", "f#5", "a5", "d6", "e6"], 0, 0.06, 0.5, 88, 3), gain_db=-2, pan=-0.35),
            part(BELL, run(["d6", "f#6", "a6", "d7"], 0.05, 0.07, 0.5, 92, 2), gain_db=-1, pan=0.35, reverb=0.35),
            part(BELL_BIG, [n(0.28, 0.9, "d6", 88), n(0.28, 0.9, "a6", 76)], gain_db=-5, pan=0.1, reverb=0.35),
            part(BASS, [n(0, 0.8, "d3", 76)], gain_db=-9),
            part(KIT_FESTIVAL, [drum("chime", 0.05, 90), drum("jingle", 0.28, 64), drum("kick", 0.0, 70)], gain_db=-9, reverb=0.3),
        ],
        [(0.2, synth.sparkle(1.0, 10, gain=0.05, seed=22), 0.35)],
        level=-16,
        room=1.1,
        tail=1.4,
        hold=0.3,
    )


def _reveal_epic() -> Effect:
    return Effect(
        "lanternReveal-epic",
        2.2,
        [
            part(PAD, chord(["d4", "a4", "d5", "f#5"], 0, 1.3, 104), gain_db=-4, reverb=0.3),
            part(BRASS, chord(["d4", "a4", "d5"], 0.0, 0.8, 100), gain_db=-7, width=0.8),
            part(PLUCK, run(["d5", "e5", "f#5", "a5", "b5", "d6", "e6"], 0, 0.03, 0.5, 88, 2), gain_db=-2, pan=-0.35),
            part(BELL, run(["a7", "f#7", "d7", "b6", "a6"], 0.2, 0.06, 0.6, 88), gain_db=0, pan=0.35, reverb=0.35),
            part(IMPACT, [n(0, 1.0, "d2", 70)], gain_db=-11, reverb=0.15),
            part(BASS, [n(0, 1.0, "d3", 86)], gain_db=-7),
            part(KIT_FESTIVAL, [drum("crash", 0, 84), drum("chime", 0.2, 92), drum("kick", 0, 96)], gain_db=-9, reverb=0.3),
        ],
        [(0.2, synth.shimmer(1.3, 1760, gain=0.04, seed=23), 0.3), (0.2, synth.sparkle(1.2, 12, gain=0.05, seed=53), 0.35)],
        level=-15,
        room=1.2,
        tail=1.42,
        hold=0.3,
    )


def _reveal_legendary() -> Effect:
    pickup = [n(0, 0.11, "d5", 104), n(0.12, 0.14, "a5", 110)]
    hit = chord(["d4", "a4", "d5", "f#5"], 0.3, 1.2, 116)
    return Effect(
        "lanternReveal-legendary",
        2.6,
        [
            part(BRASS, pickup + hit, width=0.8),
            part(SF_BRASS, pickup + hit, gain_db=-5),
            part(KIT_FESTIVAL, roll("snare", 0.0, 0.28, 0.056, 44, 90) + [drum("kick", 0.3, 120), drum("snare", 0.3, 108), drum("crash", 0.3, 112)], gain_db=-5, reverb=0.25),
            part(IMPACT, [n(0.3, 1.2, "d2", 86)], gain_db=-8, reverb=0.15),
            part(BELL_BIG, run(["d7", "f#7", "a7", "d7", "a6"], 0.35, 0.06, 0.8, 92), gain_db=-1, pan=0.35, reverb=0.35),
            part(PLUCK, run(["d5", "f#5", "a5", "d6"], 0.3, 0.04, 0.5, 90, 3), gain_db=-4, pan=-0.35),
            part(PAD, chord(["d4", "a4", "d5", "f#5"], 0.3, 1.2, 100), gain_db=-6, reverb=0.3),
            part(BASS, [n(0.3, 1.0, "d3", 96)], gain_db=-7),
            part(KIT_FESTIVAL, [drum("jingle", 0.3, 100)], gain_db=-8, reverb=0.3),
        ],
        [(0.3, synth.sparkle(1.5, 18, gain=0.06, seed=24), 0.35)],
        level=-14,
        room=1.3,
        tail=1.5,
        hold=0.32,
    )


def _reveal_mythic() -> Effect:
    hit = 0.36
    pickup = [n(0, 0.11, "d5", 106), n(0.12, 0.11, "f#5", 110), n(0.24, 0.11, "a5", 114)]
    stab = chord(["d4", "f#4", "a4", "d5"], hit, 1.7, 118)
    return Effect(
        "lanternReveal-mythic",
        3.0,
        [
            part(CHOIR, chord(["d4", "a4", "d5", "f#5", "a5"], 0.1, 2.3, 92), gain_db=-6, reverb=0.35),
            part(BRASS, pickup + stab, width=0.8),
            part(SF_BRASS, pickup + stab, gain_db=-4),
            part(TIMPANI, [n(i * 0.045, 0.045, "d2", 60 + i * 6) for i in range(8)] + [n(hit, 1.4, "d2", 120)], gain_db=-4),
            part(KIT_FESTIVAL, [drum("kick", hit, 124), drum("crash", hit, 118), drum("crash2", hit + 0.01, 100), drum("jingle", hit, 104), drum("chime", hit + 0.06, 100)], gain_db=-5, reverb=0.3),
            part(IMPACT, [n(hit, 1.6, "d1", 96)], gain_db=-7, reverb=0.15),
            part(REVERSE_SWELL, [n(0, hit, "d4", 80)], gain_db=-10, width=0.8, reverb=0.2),
            part(BELL_BIG, [n(hit, 1.0, "d5", 96), n(hit + 0.14, 1.0, "a5", 96), n(hit + 0.28, 1.2, "d6", 100)], gain_db=-2, pan=-0.2, reverb=0.35),
            part(BELL, run(["d8", "a7", "f#7", "e7", "d7", "a6", "f#6", "d6"], hit + 0.04, 0.06, 0.7, 92), gain_db=-2, pan=0.35, reverb=0.35),
            part(PAD, chord(["d3", "a3", "d4", "f#4", "a4"], hit, 1.9, 104), gain_db=-6, reverb=0.3),
        ],
        [(0.3, synth.shimmer(2.4, 1760, gain=0.05, seed=25), 0.3), (hit, synth.sparkle(2.2, 26, gain=0.07, seed=26), 0.35)],
        level=-13,
        room=1.6,
        tail=2.6,
        hold=0.7,
    )


# --- Coins and tricks ---------------------------------------------------------------------


def _coin(tk: Take) -> Effect:
    return Effect(
        "coin",
        0.5,
        [
            part(BELL_SHORT, [n(tk.t(0), 0.3, "b6", tk.v(90)), n(tk.t(0.06), 0.4, "e7", tk.v(100))], gain_db=2, pan=0.15, reverb=0.25),
            part(PLUCK_SHORT, [n(tk.t(0), 0.25, "b5", tk.v(80)), n(tk.t(0.06), 0.3, "e6", tk.v(86))], gain_db=-9, pan=-0.25),
        ],
        [
            (0, synth.click(tk.g(0.05), bright=6000, seed=tk.s(1), corr=0.7)),
            (0.05, synth.coin_shower(0.3, 4, gain=tk.g(0.07), seed=tk.s(2), lo=2300, hi=4800), 0.3),
        ],
        level=-19,
        room=0.6,
        tail=0.6,
        hold=0.06,
        vary=20,
        seed=tk.seed,
    )


def _jackpot() -> Effect:
    return Effect(
        "jackpot",
        1.8,
        [
            part(BRASS, chord(["d5", "f#5", "a5", "d6"], 0, 0.5, 110), gain_db=-4, width=0.8),
            part(PLUCK, run(["d6", "f#6", "a6", "d7", "f#7"], 0, 0.05, 0.5, 92), gain_db=-3, pan=-0.35),
            part(BELL, run(["d6", "f#6", "a6", "d7", "f#7"], 0.01, 0.05, 0.7, 94), gain_db=-2, pan=0.35, reverb=0.3),
            part(BASS, [n(0, 0.5, "d3", 96)], gain_db=-7),
            part(KIT_FESTIVAL, [drum("kick", 0, 112), drum("crash", 0, 104), drum("jingle", 0.1, 100)] + roll("tamb", 0.2, 1.2, 0.1, 80, 30), gain_db=-6, reverb=0.25),
        ],
        [(0.15, synth.coin_shower(1.4, 30, gain=0.14, seed=28), 0.3)],
        level=-13,
        room=1.1,
        tail=2.2,
        hold=0.3,
    )


def _steal(tk: Take) -> Effect:
    return Effect(
        "steal",
        0.7,
        [
            part(PLUCK, run(["d5", "f#5", "a5", "d6"], tk.t(0.12), 0.05, 0.35, tk.v(94), 3), pan=0.3),
            part(MALLET, run(["d5", "f#5", "a5", "d6"], tk.t(0.123), 0.05, 0.3, tk.v(80), 3), gain_db=-7, pan=-0.2),
        ],
        [
            (0, synth.whoosh(0.26, 900, 5000, gain=tk.g(0.16), seed=tk.s(1), pan_sweep=0.8, corr=0.65), 0.2),
            (0.11, synth.snap(tk.g(0.14), f=2100, seed=tk.s(2), pan=0.2)),
            (0.28, synth.glint(hz("d7"), 0.25, gain=tk.g(0.04), pan=0.5, decay=0.06), 0.4),
        ],
        level=-17,
        room=0.6,
        tail=0.7,
        hold=0.27,
        vary=15,
        seed=tk.seed,
    )


def _stolen() -> Effect:
    return Effect(
        "stolen",
        0.9,
        [
            part(PLUCK, run(["a5", "f5", "d5"], 0.12, 0.07, 0.35, 92), pan=-0.25),
            part(MALLET, run(["a5", "f5", "d5"], 0.123, 0.07, 0.3, 78), gain_db=-7, pan=0.2),
            part(KIT_LANTERN, [drum("tom_mid", 0.3, 80)], gain_db=-8, reverb=0.15),
        ],
        [
            (0, synth.whoosh(0.26, 5000, 900, gain=0.12, seed=30, pan_sweep=-0.8, corr=0.65), 0.2),
            (0.3, synth.thump(147, 0.25, gain=0.12, drop=1.5, decay=0.06)),
        ],
        level=-18,
        room=0.6,
        tail=0.8,
        hold=0.3,
    )


def _swap() -> Effect:
    return Effect(
        "swap",
        0.8,
        [
            part(PLUCK, run(["d5", "e5", "f#5", "a5", "b5", "d6"], 0, 0.035, 0.4, 84), pan=-0.45),
            part(MALLET, run(["d6", "b5", "a5", "f#5", "e5", "d5"], 0.05, 0.035, 0.35, 84), gain_db=-2, pan=0.45),
            part(KIT_FESTIVAL, [drum("shaker", 0, 70), drum("shaker", 0.12, 56)], gain_db=-11, reverb=0.15),
        ],
        [(0, synth.whoosh(0.32, 1500, 3200, gain=0.08, seed=31, corr=0.6), 0.25)],
        level=-17,
        room=0.7,
        tail=0.8,
        hold=0.25,
    )


def _shield() -> Effect:
    # E, A and B: a bright, open ring that stays inside the scale.
    return Effect(
        "shield",
        1.1,
        [
            part(SWEEP_UP, [n(0, 0.24, "c4", 84)], gain_db=-9, width=0.8, reverb=0.25),
            part(BELL, chord(["e5", "a5", "b5", "e6"], 0.02, 0.6, 86), gain_db=-1, pan=0.15, reverb=0.35),
            part(PAD, chord(["e4", "a4", "b4"], 0.02, 0.5, 90), gain_db=-8, reverb=0.3),
            part(KIT_FESTIVAL, [drum("triangle", 0.02, 66)], gain_db=-10, reverb=0.3),
        ],
        [(0, synth.thump(165, 0.25, gain=0.18, drop=1.5, drive=1.6, decay=0.06)), (0.02, synth.shimmer(0.9, 1318.5, gain=0.045, seed=33), 0.35)],
        level=-17,
        room=0.9,
        tail=1.1,
        hold=0.05,
    )


def _bust() -> Effect:
    # A soft "dud": a muffled thud and a muted, falling wah-wah (in the scale). Disappointed, never harsh.
    notes = [n(0.05, 0.18, "a4", 92), n(0.26, 0.45, "f#4", 86)]
    return Effect(
        "bust",
        0.9,
        [
            part(MUTED_BRASS, notes, gain_db=-1, pan=-0.2),
            part(MUTED_TRUMPET, notes, gain_db=-6, pan=0.3),
            part(KIT_LANTERN, [drum("conga_lo", 0.0, 76), drum("snare2", 0.0, 40)], gain_db=-7, reverb=0.1),
        ],
        [(0, synth.thump(165, 0.3, gain=0.16, drop=1.5, decay=0.06)), (0.02, synth.whoosh(0.32, 3000, 600, gain=0.05, seed=34, corr=0.5), 0.2)],
        level=-18,
        room=0.6,
        tail=0.9,
        hold=0.26,
    )


# --- Building and battles -------------------------------------------------------------------


def _build(tk: Take) -> Effect:
    return Effect(
        "build",
        0.5,
        [
            part(KIT_FESTIVAL, [drum("block_lo", 0, tk.v(96))], gain_db=-8, pan=-0.15, reverb=0.05),
            part(KIT_FESTIVAL, [drum("shaker", 0, tk.v(80)), drum("hat", 0.01, tk.v(60))], gain_db=-5, pan=0.35, reverb=0.05),
            part(MALLET, [n(tk.t(0.02), 0.3, "a4", tk.v(86))], gain_db=-4, pan=0.2),
            part(PLUCK_SHORT, [n(tk.t(0.02), 0.25, "a5", tk.v(76))], gain_db=-10, pan=-0.3),
        ],
        [
            (0, synth.knock(640 + 25 * tk.k, 0.12, gain=tk.g(0.25), seed=tk.s(1), damp=0.02)),
            (0, synth.thump(220, 0.15, gain=tk.g(0.18), drop=1.6, drive=1.8, decay=0.03)),
            (0, synth.click(tk.g(0.08), bright=4000, seed=tk.s(2), corr=0.5)),
        ],
        level=-18,
        room=0.45,
        tail=0.5,
        vary=20,
        seed=tk.seed,
    )


def _upgrade(tk: Take) -> Effect:
    return Effect(
        "upgrade",
        0.9,
        [
            part(PLUCK, run(["a4", "d5", "f#5", "a5"], tk.t(0), 0.05, 0.45, tk.v(86), 3), pan=-0.3),
            part(BELL, run(["d6", "f#6", "a6"], tk.t(0.05), 0.05, 0.4, tk.v(78), 3) + [n(tk.t(0.18), 0.6, "d7", tk.v(88))], gain_db=-1, pan=0.3, reverb=0.3),
            part(SWEEP_UP, [n(0, 0.18, "c4", 70)], gain_db=-13, width=0.8, reverb=0.2),
            part(KIT_FESTIVAL, [drum("chime", tk.t(0.18), tk.v(64))], gain_db=-10, reverb=0.3),
        ],
        [(0.18, synth.sparkle(0.6, 6, gain=tk.g(0.05), seed=tk.s(1)), 0.35)],
        level=-17,
        room=0.8,
        tail=1.0,
        hold=0.18,
        vary=8,
        seed=tk.seed,
    )


def _hit(tk: Take) -> Effect:
    # A punchy thwack that reads on a laptop: a snare's crack and a drum body at 180 Hz with its harmonics.
    return Effect(
        "hit",
        0.45,
        [
            part(KIT_ARCADE, [drum("snare", 0, tk.v(116))], gain_db=1, reverb=0.08),
            part(KIT_ARCADE, [drum("clap", tk.t(0.002, 0.002), tk.v(96))], gain_db=1, pan=0.3, reverb=0.08),
        ],
        [
            (0, synth.thump(196 - 6 * tk.k, 0.2, gain=tk.g(0.28), drop=2.0, drive=2.6, decay=0.04)),
            (0, synth.snap(tk.g(0.3), f=1300 + 80 * tk.k, dur=0.08, seed=tk.s(3), pan=-0.3)),
            (0, synth.impact(0.2, 300, 110, gain=tk.g(0.18), crack=0.4, seed=tk.s(1), harmonics=0.8)),
            (0, synth.air(0.12, 2000, 10000, decay=0.025, gain=tk.g(0.2), seed=tk.s(2), corr=0.45)),
        ],
        level=-15,
        room=0.45,
        tail=0.45,
        highpass=60,
        ceiling=-2.4,
        vary=20,
        seed=tk.seed,
    )


def _hurt(tk: Take) -> Effect:
    # A soft "oof": a round thud and a little falling tone. Felt, not frightening.
    return Effect(
        "hurt",
        0.6,
        [
            part(KIT_LANTERN, [drum("tom_hi", 0, tk.v(90))], gain_db=-9, reverb=0.1),
            part(KIT_LANTERN, [drum("snare2", 0, tk.v(70))], gain_db=-4, pan=0.2, reverb=0.1),
            part(KEYS_SHORT, [n(tk.t(0.03), 0.25, "e4", tk.v(88)), n(tk.t(0.03), 0.25, "b4", tk.v(74))], gain_db=-4, pan=-0.25),
        ],
        [
            (0, synth.thump(185, 0.22, gain=tk.g(0.26), drop=1.7, drive=2.2, decay=0.05)),
            (0.01, synth.chirp(660, 290, 0.22, gain=tk.g(0.22), harmonics=0.6, pan=0.25, decay=0.09)),
            (0, synth.air(0.14, 2500, 10000, decay=0.035, gain=tk.g(0.24), seed=tk.s(2), corr=0.5)),
            (0.03, synth.whoosh(0.28, 2600, 500, gain=tk.g(0.07), seed=tk.s(1), corr=0.5), 0.2),
        ],
        level=-16,
        room=0.5,
        tail=0.6,
        highpass=60,
        vary=15,
        seed=tk.seed,
    )


def _power_up() -> Effect:
    land = 0.38
    return Effect(
        "powerUp",
        1.2,
        [
            part(SWEEP_UP, [n(0, land, "c4", 92)], gain_db=-7, width=0.8, reverb=0.25),
            part(ARP, run(["d4", "f#4", "a4", "d5", "f#5", "a5"], 0, 0.06, 0.07, 84, 4), gain_db=-7, pan=-0.2),
            part(BELL, chord(["d6", "f#6", "a6"], land, 0.6, 92) + [n(land + 0.02, 0.7, "d7", 92)], gain_db=0, pan=0.25, reverb=0.35),
            part(KEYS, chord(["d5", "f#5", "a5"], land, 0.6, 84), gain_db=-7, pan=-0.2),
            part(KIT_FESTIVAL, [drum("chime", land, 84), drum("splash", land, 56)], gain_db=-10, reverb=0.3),
        ],
        [(land, synth.sparkle(0.8, 8, gain=0.06, seed=38), 0.35)],
        level=-16,
        room=0.9,
        tail=1.1,
        hold=land,
    )


def _win() -> Effect:
    hit = 0.32
    brass = [n(0, 0.09, "d5", 104), n(0.1, 0.09, "f#5", 108), n(0.2, 0.09, "a5", 112), n(hit, 0.8, "d6", 116)] + chord(["d4", "f#4", "a4"], hit, 0.8, 104)
    return Effect(
        "win",
        1.3,
        [
            part(BRASS, brass, width=0.8),
            part(SF_BRASS, brass, gain_db=-4),
            part(KIT_FESTIVAL, [drum("snare", 0, 60), drum("snare", 0.1, 70), drum("snare", 0.2, 82), drum("kick", hit, 116), drum("snare", hit, 100), drum("crash", hit, 100), drum("jingle", hit, 84)], gain_db=-5, reverb=0.25),
            part(BELL, [n(hit, 0.7, "d7", 96), n(hit + 0.02, 0.7, "a6", 86)], gain_db=-1, pan=0.35, reverb=0.35),
            part(PLUCK, run(["d5", "f#5", "a5", "d6"], hit, 0.03, 0.5, 88, 3), gain_db=-6, pan=-0.35),
            part(BASS, [n(hit, 0.7, "d3", 96)], gain_db=-8),
        ],
        [(hit, synth.sparkle(1.0, 10, gain=0.05, seed=41), 0.35)],
        level=-15,
        room=1.2,
        tail=1.8,
        hold=hit,
    )


def _lose() -> Effect:
    return Effect(
        "lose",
        1.0,
        [
            part(KEYS_SHORT, [n(0, 0.25, "a4", 86), n(0.18, 0.25, "f4", 84), n(0.36, 0.6, "d4", 82)], pan=-0.35),
            part(MALLET, [n(0, 0.25, "a4", 70), n(0.18, 0.25, "f4", 68), n(0.36, 0.5, "d4", 66)], gain_db=-5, pan=0.4),
            part(PLUCK_SHORT, [n(0, 0.2, "a5", 70), n(0.18, 0.2, "f5", 68), n(0.36, 0.3, "d5", 66)], gain_db=-12, pan=0.1),
            part(BASS, [n(0.36, 0.5, "d3", 72)], gain_db=-10),
            part(KIT_LANTERN, [drum("conga_lo", 0.36, 50)], gain_db=-14, reverb=0.1),
        ],
        [(0.3, synth.air(0.4, 1800, 8000, attack=0.06, decay=0.12, gain=0.04, seed=42, corr=0.5), 0.2)],
        level=-19,
        room=0.7,
        tail=1.0,
        hold=0.36,
    )


# --- The room, and boards ---------------------------------------------------------------------


def _event(tk: Take) -> Effect:
    land = 0.5
    return Effect(
        "event",
        2.0,
        [
            part(TIMPANI, [n(i * 0.05, 0.05, "d2", tk.v(50 + i * 6)) for i in range(10)], gain_db=-4),
            part(KIT_FESTIVAL, roll("tom_lo", 0.0, land, 0.1, 50, 90) + [drum("crash", land, tk.v(96)), drum("kick", land, tk.v(112)), drum("jingle", land, tk.v(84))], gain_db=-7, reverb=0.25),
            part(SWEEP_UP, [n(0, land, "c4", 80)], gain_db=-12, width=0.8, reverb=0.2),
            part(BRASS, chord(["d4", "a4", "d5", "f#5"], land, 1.0, tk.v(106)), gain_db=-2, width=0.8),
            part(IMPACT, [n(land, 1.2, "d2", 80)], gain_db=-10, reverb=0.15),
            part(BELL_BIG, [n(land, 0.9, "d5", 96), n(land + 0.01, 0.9, "a5", 90), n(land + 0.12, 1.0, "d6", 92)], gain_db=-2, pan=0.3, reverb=0.35),
            part(PAD, chord(["d4", "a4", "d5", "f#5"], land, 1.0, 98), gain_db=-7, reverb=0.3),
            part(CHOIR, chord(["d5", "f#5", "a5"], land, 1.0, 80), gain_db=-10, reverb=0.35),
        ],
        [(land, synth.sparkle(1.2, 10, gain=tk.g(0.045), seed=tk.s(1)), 0.35)],
        level=-15,
        room=1.3,
        tail=1.8,
        hold=land,
        vary=6,
        seed=tk.seed,
    )


def _alarm() -> Effect:
    # A friendly warning: four soft two-tone pulses, rounded with a mallet. Urgent, never shrill.
    # The high pulses on the left, the low ones on the right: it sways from side to side.
    high = [n(0.0, 0.12, "e6", 92), n(0.36, 0.12, "e6", 92)]
    low = [n(0.18, 0.14, "b5", 92), n(0.54, 0.14, "b5", 92)]
    return Effect(
        "alarm",
        0.8,
        [
            part(CHIP, high, gain_db=-2, pan=-0.4),
            part(CHIP, low, gain_db=-2, pan=0.4),
            part(MALLET, high + low, gain_db=-5),
            part(BELL_SHORT, [Note(b.start, b.dur, b.pitch + 12, 70) for b in high + low], gain_db=-10, reverb=0.3),
            part(KIT_FESTIVAL, [drum("tom_hi", 0, 92), drum("tom_mid", 0.18, 80), drum("tom_hi", 0.36, 92), drum("tom_mid", 0.54, 80)], gain_db=-9, reverb=0.15),
            part(KIT_FESTIVAL, [drum("shaker", t, 70) for t in (0, 0.18, 0.36, 0.54)], gain_db=-12, pan=0.2, reverb=0.1),
        ],
        level=-18,
        room=0.6,
        tail=0.6,
        hold=0.54,
    )


def _countdown() -> Effect:
    return Effect(
        "countdown",
        0.35,
        [
            part(KIT_FESTIVAL, [drum("block_hi", 0, 104), drum("hat", 0, 50)], gain_db=-6, reverb=0.05),
            part(BELL_SHORT, [n(0, 0.3, "a5", 92)], gain_db=0, pan=0.2, reverb=0.3),
            part(PLUCK_SHORT, [n(0, 0.25, "a5", 84)], gain_db=-7, pan=-0.25),
        ],
        [(0, synth.click(0.08, bright=4500, seed=43)), (0.003, synth.glint(hz("a7"), 0.2, gain=0.03, pan=0.4, decay=0.05), 0.4)],
        level=-19,
        room=0.5,
        tail=0.4,
    )


def _go() -> Effect:
    stab = chord(["d4", "f#4", "a4", "d5"], 0, 0.5, 118)
    return Effect(
        "go",
        1.1,
        [
            part(BRASS, stab, width=0.8),
            part(SF_BRASS, stab, gain_db=-4),
            part(KIT_FESTIVAL, [drum("kick", 0, 118), drum("clap", 0, 100), drum("crash", 0, 108)], gain_db=-5, reverb=0.25),
            part(BELL, chord(["d6", "a6"], 0, 0.5, 90), gain_db=-4, pan=0.3, reverb=0.3),
        ],
        [(0, synth.thump(147, 0.3, gain=0.3, drop=1.8, drive=2.2, decay=0.07)), (0, synth.whoosh(0.4, 600, 5000, gain=0.12, seed=39, corr=0.6), 0.25)],
        level=-14,
        room=0.9,
        tail=1.0,
    )


def _dice(tk: Take) -> Effect:
    land = 0.4
    return Effect(
        "dice",
        0.55,
        [
            part(KIT_FESTIVAL, [drum("block_lo", tk.t(land, 0.01), tk.v(100))], gain_db=-7, reverb=0.05),
            part(KIT_FESTIVAL, [drum("shaker", 0, tk.v(70)), drum("shaker", 0.12, tk.v(50))], gain_db=-9, pan=-0.35, reverb=0.05),
            part(PLUCK_SHORT, [n(tk.t(land, 0.01), 0.2, "e5", tk.v(70))], gain_db=-12, pan=0.3),
        ],
        [
            (0, synth.rattle(0.42, hits=9 + tk.k, gain=tk.g(0.35), seed=tk.s(1), spread=0.85)),
            (land, synth.knock(700, 0.1, gain=tk.g(0.2), seed=tk.s(2), damp=0.02)),
            (land, synth.thump(220, 0.12, gain=tk.g(0.12), drop=1.4, drive=1.5, decay=0.03)),
        ],
        level=-18,
        room=0.45,
        tail=0.5,
        hold=land,
        vary=15,
        seed=tk.seed,
    )


def _step(i: int, p: str) -> Effect:
    return Effect(
        f"step-{i}",
        0.25,
        [
            part(MALLET, [n(0.002, 0.2, p, 84)], gain_db=-3, pan=-0.15),
            part(PLUCK_SHORT, [n(0.002, 0.18, midi(p) + (0 if i >= 3 else 12), 82)], gain_db=-4 if i >= 3 else 0, pan=0.4),
            part(KEYS_SHORT, [n(0.002, 0.2, midi(p) - 12, 80)], gain_db=3 if i >= 3 else -14, pan=-0.35),
            part(BELL_SHORT, [n(0.004, 0.2, midi(p) + 12, 76)], gain_db=-6, pan=0.3, reverb=0.25),
            part(KIT_FESTIVAL, [drum("shaker", 0, 64)], gain_db=-3, pan=0.3, reverb=0.05),
        ],
        [
            (0, synth.knock(900 + 60 * i, 0.05, gain=0.14, seed=60 + i, pan=-0.3, damp=0.009)),
            (0, synth.click(0.1, bright=4000, seed=40 + i, corr=0.5)),
            (0.002, synth.glint(hz(p) * 8, 0.12, gain=0.05, pan=0.4, decay=0.035), 0.4),
        ],
        level=-22,
        room=0.4,
        tail=0.3,
    )


def _capture() -> Effect:
    return Effect(
        "capture",
        1.0,
        [
            part(KIT_FESTIVAL, [drum("kick", 0, 112), drum("tom_lo", 0, 100), drum("crash", 0, 88), drum("clap", 0, 82), drum("jingle", 0.1, 80)], gain_db=-6, reverb=0.2),
            part(BRASS, chord(["d4", "a4", "d5"], 0, 0.3, 108), gain_db=-2, width=0.8),
            part(BELL, [n(0.1, 0.4, "a6", 90), n(0.16, 0.6, "d7", 94)], gain_db=-1, pan=0.3, reverb=0.3),
            part(PLUCK, [n(0.1, 0.35, "a5", 86), n(0.16, 0.45, "d6", 90)], gain_db=-6, pan=-0.3),
        ],
        [(0, synth.thump(147, 0.3, gain=0.3, drop=1.8, drive=2.2, decay=0.07))],
        level=-15,
        room=0.9,
        tail=1.0,
        hold=0.16,
    )


# Building the list renders every synthesised layer, and the build asks for it once per effect: once per process is enough.
@lru_cache(maxsize=1)
def effects() -> list[Effect]:
    fx: list[Effect] = []
    add = fx.append

    # Answering.
    add(with_takes(_select, 1, 3))
    add(with_takes(_tap, 2, 3))
    add(with_takes(_lock_in, 3, 2))
    add(with_takes(_correct, 4, 2))
    add(with_takes(_wrong, 5, 2))
    add(_tick())
    add(_tick_final())
    add(_time_up())
    add(_question())
    add(_reveal())
    for i, p in enumerate(SPARKLE):
        add(_join(i, p))
    for i in range(4):
        add(with_takes(lambda tk, i=i: _reaction(i, tk), 10 + i, 2))
    add(_rank_up())

    # The end of a game.
    add(_fanfare())
    add(with_takes(_purchase, 6, 2))
    add(_level_up())

    # Lanterns in the shop.
    add(_lantern_rise())
    add(_lantern_open())
    add(_reveal_common())
    add(_reveal_uncommon())
    add(_reveal_rare())
    add(_reveal_epic())
    add(_reveal_legendary())
    add(_reveal_mythic())

    # Coins and tricks.
    add(with_takes(_coin, 7, 3))
    add(_jackpot())
    add(with_takes(_steal, 8, 2))
    add(_stolen())
    add(_swap())
    add(_shield())
    add(_bust())

    # Building and battles.
    add(with_takes(_build, 9, 3))
    add(with_takes(_upgrade, 14, 2))
    add(with_takes(_hit, 15, 3))
    add(with_takes(_hurt, 16, 3))
    add(_power_up())
    add(_win())
    add(_lose())

    # The room, and boards.
    add(with_takes(_event, 17, 2))
    add(_alarm())
    add(_countdown())
    add(_go())
    add(with_takes(_dice, 18, 3))
    for i, p in enumerate(STEPS):
        add(_step(i, p))
    add(_capture())
    return fx
