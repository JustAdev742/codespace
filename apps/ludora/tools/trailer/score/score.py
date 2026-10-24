"""The trailer's score: an upbeat synth-pop cue in D major at 120 BPM, written to the edit.

One bar is 2 seconds. Every instrument is synthesized here (band-limited saws, FM keys, a synthesized drum kit),
the classroom is crowd.py, and the app's own sound effects are laid over it from cues.json. Run with
tools/audio/.venv/bin/python score.py <out.wav> [cues.json].

  0-8     cold open: a school bell, a ticking clock, the class murmuring, a pad and a dark arpeggio; 3-2-1; silence
  8-18    the game: the drop, the groove; the classroom erupts at 12.2
  18-26   joining: a lighter groove
  26-28   build: snare roll and riser
  28-40   the modes: the hook, everything in
  40-52   for teachers: keys, a shaker, then a build
  52-60   rewards: the groove with a glockenspiel
  60-68   built for school: half time, wide pads
  68-78   the finale: the hook again, the class on its feet; a hard stop at 78
  78.5    the logo: one hit and a long major chord
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

LUDORA = Path(os.environ.get("LUDORA", Path(__file__).resolve().parents[3]))
sys.path.insert(0, str(LUDORA / "tools" / "audio"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ludora_audio import dsp, synth  # noqa: E402
import crowd  # noqa: E402

SR = 48000
BEAT = 0.5
BAR = 2.0
DUR = 88.5
N = int((DUR + 3) * SR)
rng = np.random.default_rng(12)


def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def T(n: int) -> np.ndarray:
    return np.arange(n) / SR


def env_adsr(n: int, a: float, d: float, s: float, r: float, hold: float | None = None) -> np.ndarray:
    t = T(n)
    hold = (n / SR) - r if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
    return (e * (1 - rel)).astype(np.float32)


def saw(f: float | np.ndarray, n: int, phase0: float = 0.0) -> np.ndarray:
    """A band-limited sawtooth (polyBLEP)."""
    f = np.broadcast_to(np.asarray(f, dtype=np.float64), (n,))
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    tt = ph[m] / dt[m]
    y[m] -= tt + tt - tt * tt - 1
    m = ph > 1 - dt
    tt = (ph[m] - 1) / dt[m]
    y[m] -= tt * tt + tt + tt + 1
    return y.astype(np.float32)


def lowpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(order, min(fc, SR * 0.45) / (SR / 2), output="sos"), x, axis=0).astype(np.float32)


def highpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(order, fc / (SR / 2), btype="high", output="sos"), x, axis=0).astype(np.float32)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], btype="band", output="sos"), x, axis=0).astype(np.float32)


def st(x: np.ndarray, pan: float = 0.0) -> np.ndarray:
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1).astype(np.float32)


# ---------------------------------------------------------------- the kit
def kick(gain: float = 1.0) -> np.ndarray:
    n = int(0.5 * SR)
    t = T(n)
    f = 46 + 110 * np.exp(-t / 0.032)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = highpass(rng.normal(0, 1, n).astype(np.float32), 2500) * np.exp(-t / 0.004) * 0.35
    return st(np.tanh(1.8 * (x + click)) * gain)


def clap(gain: float = 1.0) -> np.ndarray:
    n = int(0.4 * SR)
    t = T(n)
    e = np.zeros(n)
    for o in (0.0, 0.009, 0.019):
        e += np.exp(-np.clip(t - o, 0, None) / 0.006) * (t >= o)
    e += np.exp(-np.clip(t - 0.028, 0, None) / 0.11) * (t >= 0.028)
    x = bandpass(rng.normal(0, 1, n).astype(np.float32), 900, 4200) * e
    return st(x * 0.9 * gain)


def snare(gain: float = 1.0) -> np.ndarray:
    n = int(0.35 * SR)
    t = T(n)
    tone = np.sin(2 * np.pi * 195 * t) * np.exp(-t / 0.06)
    noise = highpass(rng.normal(0, 1, n).astype(np.float32), 1400) * np.exp(-t / 0.13)
    return st((tone * 0.6 + noise * 0.7) * gain)


def hat(open_: bool = False, gain: float = 1.0) -> np.ndarray:
    n = int((0.3 if open_ else 0.08) * SR)
    t = T(n)
    x = bandpass(rng.normal(0, 1, n).astype(np.float32), 7000, 15000) * np.exp(-t / (0.16 if open_ else 0.028))
    return st(x * 0.55 * gain, 0.25)


def shaker(gain: float = 1.0) -> np.ndarray:
    n = int(0.12 * SR)
    t = T(n)
    x = bandpass(rng.normal(0, 1, n).astype(np.float32), 4500, 11000) * np.minimum(1, t / 0.012) * np.exp(-t / 0.04)
    return st(x * 0.4 * gain, -0.3)


def crash(gain: float = 1.0, dur: float = 2.6) -> np.ndarray:
    n = int(dur * SR)
    t = T(n)
    noise = highpass(rng.normal(0, 1, (n, 2)).astype(np.float32), 3500)
    metal = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (3120, 4470, 5310, 6890, 8120)) * 0.08
    x = (noise * 0.5 + metal[:, None]) * (np.exp(-t / 0.9) * np.minimum(1, t / 0.002))[:, None]
    return (x * gain).astype(np.float32)


def tom(m: float, gain: float = 1.0) -> np.ndarray:
    n = int(0.6 * SR)
    t = T(n)
    f = hz(m) * (0.62 + 0.38 * np.exp(-t / 0.08))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.32)
    x += lowpass(rng.normal(0, 1, n).astype(np.float32), 1200) * np.exp(-t / 0.05) * 0.4
    return st(np.tanh(1.6 * x) * gain)


def tick(high: bool, gain: float = 1.0) -> np.ndarray:
    n = int(0.06 * SR)
    t = T(n)
    f = 2300 if high else 1750
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + bandpass(rng.normal(0, 1, n).astype(np.float32), 2000, 6000) * np.exp(-t / 0.004) * 0.6
    return st(x * 0.35 * gain, 0.15 if high else -0.15)


# ---------------------------------------------------------------- the synths
def supersaw(m: float, dur: float, voices: int = 7, spread: float = 0.16) -> np.ndarray:
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    for i in range(voices):
        d = (i - (voices - 1) / 2) / ((voices - 1) / 2) * spread
        x = saw(hz(m + d), n, rng.random())
        out += st(x, (i - (voices - 1) / 2) / ((voices - 1) / 2) * 0.8)
    return out / voices


def stab(chord: list[int], dur: float = 0.32, bright: float = 5200, gain: float = 1.0) -> np.ndarray:
    n = int((dur + 0.25) * SR)
    x = sum(supersaw(m, n / SR) for m in chord)
    x = lowpass(x, bright)
    return (x * env_adsr(n, 0.004, 0.16, 0.25, 0.2, dur)[:, None] * 0.5 * gain).astype(np.float32)


def pad(chord: list[int], dur: float, cutoff: float = 2200, gain: float = 1.0, attack: float = 0.35) -> np.ndarray:
    n = int((dur + 0.9) * SR)
    x = sum(supersaw(m, n / SR, voices=5, spread=0.12) for m in chord)
    x = lowpass(x, cutoff)
    return (x * env_adsr(n, attack, 1.0, 0.85, 0.9, dur)[:, None] * 0.32 * gain).astype(np.float32)


def pluck(m: float, dur: float = 0.25, dark: float = 0.0, gain: float = 1.0, pan: float = 0.0) -> np.ndarray:
    n = int((dur + 0.35) * SR)
    t = T(n)
    x = 0.6 * saw(hz(m), n, rng.random()) + 0.4 * saw(hz(m) * 1.006, n, rng.random())
    bright = lowpass(x, lerp(7500, 1800, dark))
    dull = lowpass(x, lerp(1100, 450, dark))
    k = np.exp(-t / 0.07)
    y = (bright * k + dull * (1 - k)) * np.minimum(1, t / 0.002) * np.exp(-t / 0.32)
    return st(y * 0.5 * gain, pan)


def lead(m: float, dur: float, gain: float = 1.0, pan: float = 0.0) -> np.ndarray:
    n = int((dur + 0.18) * SR)
    t = T(n)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.4 * t) * np.clip((t - 0.14) / 0.1, 0, 1)
    f = hz(m) * vib
    sq = saw(f, n, 0.0) - saw(f, n, 0.5)
    x = 0.55 * saw(f, n, 0.1) + 0.35 * sq + 0.25 * saw(f * 2.0, n, 0.3)
    x = lowpass(x, 5200)
    return st(x * env_adsr(n, 0.006, 0.12, 0.7, 0.1, dur) * 0.32 * gain, pan)


def bass(m: float, dur: float, gain: float = 1.0) -> np.ndarray:
    n = int((dur + 0.05) * SR)
    t = T(n)
    x = np.sin(2 * np.pi * hz(m) * t) + 0.35 * lowpass(saw(hz(m), n), 420)
    x = np.tanh(1.4 * x) * env_adsr(n, 0.004, 0.2, 0.8, 0.04, dur)
    return st(x * 0.55 * gain)


def keys(m: float, dur: float = 1.8, gain: float = 1.0, pan: float = 0.0) -> np.ndarray:
    n = int((dur + 1.0) * SR)
    t = T(n)
    f = hz(m)
    idx = 2.0 * np.exp(-t / 0.35) + 0.3
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t / 1.4)
    x += np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.05) * 0.12
    x *= np.minimum(1, t / 0.002) * (1 - np.clip((t - dur) / 0.6, 0, 1))
    return st(x * 0.3 * gain, pan)


def glock(m: float, gain: float = 1.0, pan: float = 0.0) -> np.ndarray:
    n = int(1.4 * SR)
    t = T(n)
    f = hz(m)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.9), (2.76, 0.35, 0.35), (5.4, 0.18, 0.15)))
    return st(x * np.minimum(1, t / 0.001) * 0.22 * gain, pan)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


# ---------------------------------------------------------------- the arrangement
BUS = {k: np.zeros((N, 2), np.float32) for k in ("drums", "bass", "music", "lead", "fx", "crowd", "app", "keys")}
KICKS: list[float] = []


def put(bus: str, x: np.ndarray, at: float, gain_db: float = 0.0) -> None:
    dsp.place(BUS[bus], x * dsp.db(gain_db), int(at * SR))


CH = {"D": [62, 66, 69], "A": [61, 64, 69], "Bm": [62, 66, 71], "G": [62, 67, 71]}
ROOT = {"D": 38, "A": 33, "Bm": 35, "G": 31}
PROG = ["D", "A", "Bm", "G"]
# The hook, on an eighth-note grid, one list per bar: (eighth, note, length in eighths).
HOOK = [
    [(0, 74, 1), (2, 78, 1), (3, 81, 2), (5, 81, 1), (6, 83, 1), (7, 81, 1)],
    [(1, 76, 1), (3, 76, 1), (4, 78, 1), (5, 76, 1), (6, 73, 2)],
    [(0, 74, 1), (2, 78, 1), (3, 83, 2), (5, 81, 1), (6, 78, 1), (7, 74, 1)],
    [(0, 76, 1), (2, 74, 1), (3, 76, 1), (4, 78, 2), (6, 76, 2)],
]


def chord_at(t: float) -> str:
    return PROG[int(t // BAR) % 4]


def groove(a: float, b: float, *, kick_on: bool = True, clap_db: float = 0.0, hats: bool = True, open_hats: bool = True,
           bass_on: bool = True, arp_db: float | None = -2.0, stabs_db: float | None = None, pad_db: float | None = None,
           hook_db: float | None = None, glock_db: float | None = None, half: bool = False) -> None:
    t = a
    while t < b - 1e-6:
        c = chord_at(t)
        bar_t = t
        for beat in range(4):
            bt = bar_t + beat * BEAT
            if bt >= b - 1e-6:
                break
            if kick_on and (not half or beat in (0,)) :
                put("drums", kick(), bt)
                KICKS.append(bt)
            if half and beat == 2:
                put("drums", snare(), bt, -2)
                put("drums", clap(), bt, -4)
            if not half and beat in (1, 3) and clap_db > -60:
                put("drums", clap(), bt, clap_db)
            if hats:
                for s in range(4 if not half else 2):
                    ht = bt + s * (BEAT / (4 if not half else 2))
                    if ht < b:
                        put("drums", hat(gain=1.0 if s % 2 else 0.6), ht, -6 if s % 2 == 0 else -3)
                if open_hats and not half:
                    put("drums", hat(True), bt + BEAT / 2, -7)
            if bass_on:
                r = ROOT[c]
                if half:
                    if beat == 0:
                        put("bass", bass(r, 1.9), bt, -1)
                else:
                    for e in range(2):
                        put("bass", bass(r + (12 if (beat == 3 and e == 1) else 0), 0.22), bt + e * 0.25, -1)
        if arp_db is not None:
            tones = CH[c] + [m + 12 for m in CH[c]]
            order = [0, 1, 2, 3, 4, 3, 2, 1]
            for s in range(16):
                at = bar_t + s * 0.125
                if at < b:
                    put("music", pluck(tones[order[s % 8]] + 12, 0.12, gain=0.8, pan=(-0.35 if s % 2 else 0.35)), at, arp_db)
        if stabs_db is not None:
            for off in (0.25, 0.75, 1.25, 1.75):
                if bar_t + off < b:
                    put("music", stab(CH[c], 0.14), bar_t + off, stabs_db)
        if pad_db is not None:
            put("music", pad(CH[c] + [CH[c][0] + 12], min(BAR, b - bar_t), cutoff=3000), bar_t, pad_db)
        if hook_db is not None or glock_db is not None:
            cycle = int((bar_t - a) // BAR) % 4
            for e, m, ln in HOOK[cycle]:
                at = bar_t + e * 0.25
                if at >= b:
                    continue
                if hook_db is not None:
                    put("lead", lead(m, ln * 0.25 - 0.03), at, hook_db)
                if glock_db is not None:
                    put("music", glock(m + 12, pan=0.2), at, glock_db)
        t += BAR


def roll(a: float, b: float, gain_db: float = -4.0) -> None:
    """A snare roll that speeds up and swells into b."""
    t = a
    while t < b - 0.01:
        p = (t - a) / (b - a)
        put("drums", snare(0.4 + 0.6 * p), t, gain_db)
        t += 0.25 if p < 0.5 else 0.125 if p < 0.8 else 0.0625


def build() -> None:
    # 0-8: the cold open.
    put("fx", crowd.room_tone(8.0), 0.0, -6)
    put("crowd", crowd.murmur(6.2), 0.0, -14)
    put("fx", crowd.bell(), 0.25, 4)
    for i in range(16):
        put("drums", tick(i % 2 == 0, 0.5 + 0.5 * i / 15), i * BEAT, -10 + i * 0.4)
    put("music", pad([50, 57, 62, 66], 7.5, cutoff=900, attack=2.0), 0.6, -6)
    for s in range(int((7.5 - 2.0) / 0.125)):
        at = 2.0 + s * 0.125
        tones = CH["D"] + [m + 12 for m in CH["D"]]
        p = s / ((7.5 - 2.0) / 0.125)
        put("music", pluck(tones[[0, 1, 2, 3, 4, 3, 2, 1][s % 8]] + 12, 0.12, dark=1 - p, gain=0.3 + 0.7 * p), at, -10 + 6 * p)
    for e in range(int((7.5 - 4.0) / 0.25)):
        put("bass", bass(38, 0.2, gain=0.4 + 0.6 * e / 14), 4.0 + e * 0.25, -4)
    put("fx", synth.riser(3.15, f0=160, f1=1800, gain=0.3), 4.6, -2)
    for i, at in enumerate((6.0, 6.5, 7.0)):
        put("drums", tom(45 - i * 3, 1.0), at, 0)
        put("fx", synth.impact(0.6, 120, 40, 0.5), at, -6)
    put("crowd", crowd.cheer(1.8, voices=22, seed=7, word="ooh", spread=0.3, shout=0.1), 5.9, -10)

    # 8-18: the game.
    put("fx", synth.impact(1.2, 150, 38, 1.0, crack=0.4), 8.0, 0)
    put("drums", crash(1.0), 8.0, -3)
    groove(8.0, 12.0, arp_db=-3, stabs_db=-10, clap_db=-2)
    put("fx", synth.whoosh(0.6, 400, 2500, 0.4), 11.7, -6)
    put("drums", crash(1.0), 12.2, -2)
    put("fx", synth.impact(0.8, 130, 40, 0.7), 12.2, -4)
    groove(12.0, 18.0, arp_db=-4, stabs_db=-8, pad_db=-10, clap_db=-2)
    put("crowd", crowd.cheer(3.6, voices=34, seed=11, word="mix", spread=0.3), 12.25, 0)
    put("crowd", crowd.applause(3.8, clappers=28, seed=12), 12.45, 2)
    put("drums", crash(0.7), 16.0, -6)
    for at in (17.0, 17.5):
        put("music", stab(CH["D"] + [74], 0.4, gain=1.2), at, -3)
        put("fx", synth.impact(0.5, 110, 45, 0.5), at, -8)

    # 18-26: joining.
    groove(18.0, 26.0, arp_db=-3, clap_db=-5, stabs_db=-10)

    # 26-28: the build into the modes.
    groove(26.0, 27.5, kick_on=True, clap_db=-80, open_hats=False, arp_db=-6, bass_on=True)
    roll(26.0, 27.9, -4)
    put("fx", synth.riser(1.9, f0=200, f1=2600, gain=0.35), 26.0, -2)
    put("music", stab(CH["Bm"] + [83], 0.35, gain=1.2), 27.0, -3)

    # 28-40: the modes. The hook, everything in.
    put("fx", synth.impact(1.2, 150, 38, 1.0, crack=0.4), 28.0, 0)
    put("drums", crash(1.0), 28.0, -3)
    groove(28.0, 40.0, arp_db=-7, pad_db=-8, hook_db=0, clap_db=-1)
    put("crowd", crowd.cheer(0.9, voices=14, seed=21, word="woo", spread=0.15), 30.05, -6)
    put("crowd", crowd.cheer(0.9, voices=14, seed=22, word="yeah", spread=0.15), 30.55, -6)
    put("crowd", crowd.cheer(1.0, voices=16, seed=23, word="woo", spread=0.15), 31.05, -5)
    put("drums", crash(0.9), 36.0, -4)
    for i in range(20):
        at = 36.3 + 1.1 * (1 - (1 - i / 19) ** 1.6)
        put("fx", synth.pop(900 + i * 70, 0.06, 0.4), at, -12)

    # 40-52: for teachers.
    put("fx", synth.whoosh(1.0, 2500, 300, 0.35), 40.0, -6)
    put("keys", keys(62, 1.8) + keys(66, 1.8, pan=-0.2) + keys(69, 1.8, pan=0.2) + keys(76, 1.8, gain=0.6), 41.0, -2)
    for bi, c in enumerate(["D", "A", "Bm", "G"]):
        at = 42.0 + bi * BAR
        for m in CH[c]:
            put("keys", keys(m, 1.8, pan=(m % 3 - 1) * 0.2), at, -3)
        put("keys", keys(ROOT[c] + 12, 1.8), at, -5)
        for beat in (0, 2):
            put("drums", kick(0.6), at + beat * BEAT, -4)
            KICKS.append(at + beat * BEAT)
        for s in range(8):
            put("drums", shaker(1.0 if s % 2 else 0.6), at + s * 0.25, -8)
        for e, m, ln in HOOK[bi]:
            put("music", pluck(m, ln * 0.25, gain=0.6, pan=0.25), at + e * 0.25, -9)
    groove(50.0, 52.0, clap_db=-80, open_hats=False, arp_db=-6)
    roll(50.0, 51.95, -3)
    put("fx", synth.riser(1.95, f0=180, f1=2400, gain=0.35), 50.0, -2)

    # 52-60: rewards.
    put("fx", synth.impact(1.0, 140, 40, 0.9), 52.0, -1)
    put("drums", crash(1.0), 52.0, -4)
    groove(52.0, 60.0, arp_db=-8, stabs_db=-12, glock_db=-4, clap_db=-2)

    # 60-68: built for school, half time.
    put("drums", crash(0.8), 60.0, -6)
    groove(60.0, 68.0, half=True, arp_db=None, pad_db=-6, bass_on=True)
    for bi in range(4):
        c = PROG[bi]
        put("lead", lead(CH[c][2] + 12, 1.7, gain=0.7), 60.0 + bi * BAR, -7)

    # 68-78: the finale.
    put("fx", synth.impact(1.2, 150, 38, 1.0, crack=0.4), 68.0, 0)
    put("drums", crash(1.0), 68.0, -3)
    groove(68.0, 76.5, arp_db=-7, pad_db=-7, hook_db=0, clap_db=-1)
    for at in (68.0, 70.0, 72.0, 74.0):
        cycle = int((at - 68.0) // BAR) % 4
        for e, m, ln in HOOK[cycle]:
            put("lead", lead(m + 12, ln * 0.25 - 0.03, gain=0.5, pan=0.3), at + e * 0.25, -6)
    put("drums", crash(1.0), 71.0, -3)
    put("crowd", crowd.cheer(3.2, voices=38, seed=31, word="mix", spread=0.35), 71.05, 1)
    put("crowd", crowd.applause(3.4, clappers=34, seed=32), 71.2, 3)
    put("drums", crash(0.8), 75.5, -5)
    # One more round? The class says yes.
    put("crowd", crowd.cheer(1.6, voices=34, seed=41, word="yeah", spread=0.12), 76.02, 0)
    put("crowd", crowd.applause(1.9, clappers=26, seed=42, fade=0.8), 76.2, -1)
    groove(76.5, 78.0, clap_db=-80, open_hats=False, arp_db=-5)
    roll(76.5, 77.98, -2)
    put("fx", synth.riser(1.5, f0=220, f1=3000, gain=0.35), 76.5, -1)

    # 78.5: the logo.
    put("fx", synth.impact(1.6, 160, 34, 1.0, crack=0.5), 78.5, 0)
    put("drums", crash(1.0, 4.0), 78.5, -2)
    put("music", pad([50, 57, 62, 66, 69, 76], 7.0, cutoff=2600, attack=0.02), 78.5, -3)
    put("keys", keys(62, 5.0) + keys(66, 5.0, pan=-0.2) + keys(69, 5.0, pan=0.2) + keys(74, 5.0) + keys(78, 5.0, gain=0.7), 78.5, -3)
    put("bass", bass(38, 3.0), 78.5, 0)
    for i, m in enumerate([74, 78, 81, 86, 90]):
        put("music", glock(m, pan=-0.4 + i * 0.2), 79.4 + i * 0.12, -4)
    for i, m in enumerate([74, 78, 81, 86]):
        put("music", pluck(m, 0.2, gain=0.8, pan=0.2), 82.0 + i * 0.125, -6)


def app_cues(path: str | None) -> None:
    if not path:
        return
    for cue in json.loads(Path(path).read_text()):
        data = subprocess.run(["ffmpeg", "-v", "error", "-i", str(LUDORA / cue["file"]), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
        x = np.frombuffer(data, dtype=np.float32).reshape(-1, 2)
        put("app", x, cue["t"], cue.get("db", 0))


def mix(out_path: str) -> None:
    n = N
    duck = dsp.duck_curve(n, KICKS, 0.55, release_s=0.18)[:, None]
    ir_room = dsp.make_ir(1.6, seed=31)
    ir_hall = dsp.make_ir(2.6, seed=32)
    music = BUS["music"] * duck
    lead_ = BUS["lead"]
    lead_ = lead_ + dsp.echo(lead_, 0.375, feedback=0.3, repeats=4) * dsp.db(-9)
    bass_ = BUS["bass"] * (0.35 + 0.65 * duck)
    drums = dsp.process(BUS["drums"], dsp.eq_board(30, 16000, None, (-14, 3.0)))
    crowd_bus = dsp.process(BUS["crowd"], dsp.eq_board(150, 9000, None, (-18, 2.5)))
    crowd_bus = crowd_bus + dsp.reverb(crowd_bus, ir_room) * dsp.db(-8)
    wet = dsp.reverb(music * 0.5 + lead_ * 0.4 + BUS["keys"] * 0.6, ir_hall) * dsp.db(-6)
    full = drums * dsp.db(-4) + bass_ * dsp.db(-6) + music * dsp.db(2) + lead_ * dsp.db(1) + BUS["keys"] * dsp.db(1) + wet
    full = full + BUS["fx"] * dsp.db(-3) + dsp.reverb(BUS["fx"], ir_hall) * dsp.db(-12)
    full = full + crowd_bus * dsp.db(-2) + BUS["app"] * dsp.db(-2)
    # The silences: just before the first drop, and the beat before the logo.
    t = np.arange(n) / SR
    gate = np.ones(n, np.float32)
    gate[(t >= 7.76) & (t < 8.0)] = 0.0
    gate[(t >= 78.0) & (t < 78.5)] = 0.0
    from scipy.ndimage import uniform_filter1d
    gate = uniform_filter1d(gate, 48)
    full = full * gate[:, None]
    full = dsp.master(full, glue=(-16, 2.0))
    full = full[: int(DUR * SR)]
    full = dsp.fade(full, 0.0, 2.0)
    full = dsp.normalize_loudness(full, -13.8, ceiling_db=-1.0)
    full = dsp.limit(full, -2.8)
    sf.write(out_path, full, SR, subtype="PCM_24")
    print("loudness", round(dsp.lufs(full), 2), "LUFS; true peak", round(dsp.true_peak_db(full), 2), "dBTP;", round(len(full) / SR, 2), "s")


if __name__ == "__main__":
    build()
    app_cues(sys.argv[2] if len(sys.argv) > 2 else None)
    mix(sys.argv[1])
