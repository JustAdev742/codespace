#!/usr/bin/env python3
"""The music and sound of "What's new", written and played by this script on the same synthesiser as
the first film (kit.py): every sound is arithmetic, no samples. 120 beats a minute, in D major with a
turn to B minor while the server is under attack, cut to the picture's bars (two seconds a bar).

    python3 updates.py [out.wav]

The picture, by bar:   1-2 one Glim on a dark stage    3-4 eight quick looks    5-6 the title
  7-10 the 3D home    11-12 the navigation    13-18 calm play and the walkthrough
  19-26 the Wallet, class rewards, sales, the economy room    27-30 the school's colours and uniform
  31 the lights go down    32-34 calm, a probe, guessing, a decoy    35 the attack    36 the list
  37 the alert    38 the reading    39 lockdown    40 self-checks    41 calm again    42-44 everyone
"""
import os, sys, wave

os.environ.setdefault('SCORE_SECONDS', '88.0')
os.environ.setdefault('SCORE_SEED', '20261119')
import numpy as np
from kit import *  # noqa: F401,F403  (the synthesiser)

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/upd/audio/score.wav'

# ------------------------------------------------------------------ harmony

D = {'root': 38, 'tones': [57, 62, 66]}
A = {'root': 33, 'tones': [57, 61, 64]}
Bm = {'root': 35, 'tones': [59, 62, 66]}
G = {'root': 31, 'tones': [55, 59, 62]}
Em = {'root': 40, 'tones': [55, 59, 64]}
Fs = {'root': 30, 'tones': [54, 58, 61]}   # F sharp major: the pull back to B minor
MAIN = [D, A, Bm, G]        # home, out, the shadow, and the lift back
DARK = [Bm, G, Em, Fs]

# The tune: four bars over D, A, Bm, G. (beat, length in beats, note)
HOOK = [
    [(0, 1, 78), (1, .5, 81), (1.5, 1.5, 86), (3, 1, 85)],
    [(0, 1, 81), (1, .5, 85), (1.5, 1.5, 88), (3, 1, 86)],
    [(0, 1, 78), (1, .5, 83), (1.5, 1.5, 90), (3, 1, 88)],
    [(0, 1.5, 86), (1.5, .5, 83), (2, 2, 81)],
]

drums, low, chords, pads, plucks, tune, fx, hits = (Stem() for _ in range(8))
kicks = []


def do_kick(t, power=1.0, long=False, gain=0.95):
    drums.add(kick(power, long), t, gain)
    kicks.append(t)


def four_floor(bar, hats=True, claps=True, sixteenths=False, gain=1.0):
    for b in range(4):
        do_kick(at(bar, b), gain=0.95 * gain)
        if claps and b in (1, 3):
            drums.add(clap(), at(bar, b), 0.5 * gain)
            drums.add(snare(0.8), at(bar, b), 0.22 * gain)
        if hats:
            drums.add(hat(), at(bar, b + 0.5), 0.34 * gain, pan=0.2)
    if hats:
        drums.add(hat(open_=True), at(bar, 3.5), 0.2 * gain, pan=-0.2)
    if sixteenths:
        for s in range(16):
            if s % 2:
                drums.add(hat(bright=1.25), at(bar, s * 0.25), (0.1 + 0.06 * (s % 4 == 3)) * gain, pan=0.5 if s % 4 == 1 else -0.5)


def soft_beat(bar, level=1.0, rim=True):
    """Calm play: a heartbeat and a rim click, nothing sharp."""
    do_kick(at(bar, 0), power=0.7, gain=0.6 * level)
    do_kick(at(bar, 2.5), power=0.6, gain=0.42 * level)
    if rim:
        drums.add(tom(74) * 0.5, at(bar, 2), 0.3 * level, pan=0.2)
    for e in (1, 3):
        drums.add(hat(bright=0.8), at(bar, e), 0.1 * level, pan=-0.3)


def half_time(bar, level=1.0):
    do_kick(at(bar, 0), gain=0.85 * level)
    do_kick(at(bar, 1.5), power=0.8, gain=0.7 * level)
    drums.add(snare(0.9), at(bar, 2), 0.38 * level)
    drums.add(clap(), at(bar, 2), 0.3 * level)
    for e in range(8):
        drums.add(hat(), at(bar, e * 0.5), (0.12 + 0.08 * (e % 2)) * level, pan=0.25)


def roll(t0, t1, start_gain=0.15, end_gain=0.6):
    t = t0
    while t < t1 - 1e-6:
        u = (t - t0) / (t1 - t0)
        drums.add(snare(0.7 + 0.5 * u), t, start_gain + (end_gain - start_gain) * u ** 1.5)
        t += BEAT / (2 if u < 0.4 else 4 if u < 0.75 else 8)


def bass_bar(bar, c, pattern='eighths', gain=0.5):
    r = c['root']
    if pattern == 'eighths':
        for e in range(8):
            low.add(bass(r + 12 if e == 7 else r, BEAT * 0.5 * 0.92), at(bar, e * 0.5), gain * (1.0 if e % 2 == 0 else 0.85))
    elif pattern == 'long':
        low.add(bass(r, BEAT * 1.6), at(bar, 0), gain)
        low.add(bass(r, BEAT * 1.0), at(bar, 2.5), gain * 0.8)
    else:  # 'push': the 3-3-2 the stabs play
        for b, m in ((0, r), (1.5, r), (3, r + 7)):
            low.add(bass(m, BEAT * 0.9), at(bar, b), gain)


def stabs(bar, c, gain=0.2, bright=1.0):
    for b in (0, 1.5, 3):
        for i, m in enumerate(c['tones'] + [c['tones'][0] + 12]):
            chords.add(pluck(m, 0.5, bright), at(bar, b), gain * (0.9 if i else 1.0), pan=(i - 1.5) * 0.35)


def wall(bar, c, gain=0.2, bars=1, bright=6500):
    for m in c['tones'] + [c['tones'][0] + 12, c['tones'][1] + 12]:
        chords.add(supersaw(m, BAR * bars - 0.02, bright=bright), at(bar), gain)


def warm(bar, c, gain=0.5, bars=1):
    pads.add(pad(c['tones'] + [c['tones'][0] + 12], BAR * bars + 0.3), at(bar), gain)


def arp(bar, c, gain=0.13, bright=0.8, steps=16):
    t = c['tones']
    order = [t[0], t[2], t[0] + 12, t[1], t[2], t[0] + 12, t[1] + 12, t[2]]
    for s in range(steps):
        m = order[s % len(order)]
        when = at(bar, s * (4 / steps))
        plucks.add(pluck(m, 0.32, bright), when, gain * (1.0 if s % 4 == 0 else 0.72), pan=0.6 if s % 2 else -0.6)
        plucks.add(pluck(m, 0.32, bright * 0.7), when + BEAT * 0.75, gain * 0.28, pan=-0.6 if s % 2 else 0.6)


def hook(bar, phrase, gain=0.26, octave=0, voice='lead'):
    prev = None
    for beat, length, m in HOOK[phrase]:
        m += 12 * octave
        if voice == 'lead':
            tune.add(lead(m, length * BEAT * 0.95, glide_from=prev), at(bar, beat), gain)
            tune.add(lead(m, length * BEAT * 0.95), at(bar, beat) + BEAT * 0.75, gain * 0.2, pan=0.6)
        elif voice == 'pluck':
            tune.add(pluck(m, 0.45, 1.2), at(bar, beat), gain, pan=-0.1)
            tune.add(pluck(m, 0.45, 0.8), at(bar, beat) + BEAT * 0.75, gain * 0.3, pan=0.5)
        else:
            tune.add(bell(m, 1.4), at(bar, beat), gain, pan=0.15)
        prev = m


def big_hit(t, c, gain=1.0, crash_len=2.4):
    hits.add(boom(), t, 0.9 * gain)
    hits.add(crash(crash_len), t, 0.5 * gain)
    for m in c['tones'] + [c['tones'][0] + 12, c['tones'][2] + 12]:
        hits.add(supersaw(m, 1.3, bright=7500, release=0.9), t, 0.2 * gain)
    low.add(bass(c['root'], 0.9), t, 0.5 * gain)


def reverse_into(t, seconds=1.2, gain=0.4):
    c = crash(seconds)[::-1].copy()
    fx.add(c * np.linspace(0, 1, len(c))[:, None] ** 1.5, t - seconds, gain)


def ping(t, m=93, gain=0.2, pan=0.0, echoes=3):
    """A radar ping: one clean note and its echoes, each fainter and further off."""
    n = int(0.5 * SR)
    note = sine(hz(m), n) * decay(n, 0.09) * env(n, 0.002, 0.1)
    for k in range(echoes + 1):
        fx.add(note, t + k * 0.375, gain * 0.5 ** k, pan=pan + (0.5 if k % 2 else -0.5) * (k > 0))


def ting(t, m=98, gain=0.2, pan=0.0):
    """A Spark landing: a small bright bell."""
    fx.add(bell(m, 0.9), t, gain, pan=pan)
    fx.add(bell(m + 12, 0.5), t + 0.03, gain * 0.4, pan=pan)


def blip(t, m=81, gain=0.2, pan=0.0):
    """A warning from the dashboard: two short square notes, the second lower."""
    n = int(0.11 * SR)
    for k, mm in enumerate((m, m - 5)):
        fx.add(filt(pulse(hz(mm), n, 0.5), lp(3200)) * env(n, 0.002, 0.03), t + k * 0.13, gain, pan=pan)


def clunk(t, gain=0.5):
    """A bolt going home."""
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    body = sine(70 + 90 * np.exp(-tt / 0.012), n) * np.exp(-tt / 0.09)
    metal = filt(noise(n) * np.exp(-tt / 0.02), bp(1800, 5200)) * 0.5
    hits.add(np.tanh((body + metal) * 1.6), t, gain)
    hits.add(filt(noise(n) * np.exp(-tt / 0.008), hp(3000)) * 0.4, t - 0.07, gain * 0.5)


# ------------------------------------------------------------------ the picture, bar by bar

# ---- bars 1 and 2: a dark stage, one Glim, the tune as far-off bells ----
warm(1, D, 0.32, 2)
for phrase, bar in ((0, 1), (1, 2)):
    hook(bar, phrase, 0.12, voice='bell')
for k, hop_t in enumerate((0.75, 1.15, 1.55, 1.95)):   # four hops in
    drums.add(tom(50 + k * 2) * 0.6, hop_t + 0.36, 0.3, pan=-0.7 + k * 0.4)
fx.add(bell(86, 1.6), at(2, 1), 0.14, pan=0.2)          # it waves

# ---- bars 3 and 4: eight quick looks, one a beat, climbing ----
fx.add(riser(4.0), at(3), 0.42)
roll(at(4), at(5), 0.12, 0.55)
climb = [62, 64, 66, 69, 71, 74, 76, 78]
for k in range(8):
    t = at(3, k)
    do_kick(t, gain=0.8)
    fx.add(whoosh(0.34, 1800 + k * 350), t - 0.17, 0.2)
    plucks.add(pluck(climb[k], 0.4, 1.1), t, 0.2, pan=-0.5 + k * 0.14)
    plucks.add(pluck(climb[k] + 12, 0.3, 1.0), t + 0.25, 0.1, pan=0.5 - k * 0.14)
    low.add(bass(38 if k < 4 else 33, BEAT * 0.9), t, 0.4)
reverse_into(at(5), 1.4, 0.5)

# ---- bars 5 and 6: the title ----
big_hit(at(5), D, 1.0)
for bar, c, ph in ((5, D, 0), (6, A, 1)):
    four_floor(bar, sixteenths=True)
    bass_bar(bar, c)
    wall(bar, c, 0.17)
    stabs(bar, c, 0.14, 1.2)
    hook(bar, ph, 0.27)

# ---- bars 7 to 10: the 3D home. Open air: the groove steps back, the tune goes to plucks ----
for i, bar in enumerate(range(7, 11)):
    c = MAIN[(i + 2) % 4]   # Bm, G, D, A: arriving home on the third bar
    four_floor(bar, claps=bar >= 9, gain=0.8)
    bass_bar(bar, c, 'push', 0.46)
    warm(bar, c, 0.36)
    arp(bar, c, 0.1, 0.9)
hook(9, 0, 0.2, voice='pluck')
hook(10, 1, 0.2, voice='pluck')
# The pointer visits six places; each lights with a note of its own.
for k, m in enumerate((86, 88, 90, 93, 95, 98)):
    ting(at(7) + 1.35 + k * 1.02, m, 0.13, pan=-0.6 + k * 0.24)

# ---- bars 11 and 12: the navigation. Tidy: a tick for every row ----
for bar, c in ((11, Bm), (12, G)):
    do_kick(at(bar, 0), gain=0.8)
    do_kick(at(bar, 2), gain=0.7)
    bass_bar(bar, c, 'long', 0.44)
    warm(bar, c, 0.3)
    for s in range(8):
        drums.add(hat(bright=1.1), at(bar, s * 0.5), 0.14 + 0.06 * (s % 2), pan=0.3)
        plucks.add(pluck(c['tones'][s % 3] + 12, 0.25, 1.0), at(bar, s * 0.5), 0.12, pan=-0.4 + s * 0.1)
fx.add(whoosh(0.5, 1500), at(13) - 0.3, 0.2)

# ---- bars 13 to 18: calm play. Everything turned down: a heartbeat, a pad, bells ----
CALM = [G, D, Em, A, G, D]
for i, bar in enumerate(range(13, 19)):
    c = CALM[i]
    soft_beat(bar, 1.0 if i else 0.7)
    warm(bar, c, 0.5)
    low.add(bass(c['root'], BEAT * 3.2), at(bar, 0), 0.34)
    t = c['tones']
    for s, m in enumerate((t[0] + 12, t[1] + 12, t[2] + 12, t[1] + 12)):   # one bell a beat: one thing at a time
        plucks.add(bell(m, 1.3), at(bar, s), 0.11, pan=-0.3 + s * 0.2)
hook(15, 0, 0.13, voice='bell')
hook(16, 1, 0.13, voice='bell')
hook(17, 2, 0.14, voice='bell')
hook(18, 3, 0.14, voice='bell')
fx.add(riser(2.0, 6000), at(18), 0.22)
reverse_into(at(19), 1.0, 0.3)

# ---- bars 19 to 26: the economy. The pulse comes back and builds ----
ECON = [D, A, Bm, G, D, A, Bm, G]
for i, bar in enumerate(range(19, 27)):
    c = ECON[i]
    full = bar >= 22
    four_floor(bar, claps=bar >= 21, sixteenths=full, gain=0.85 if not full else 1.0)
    bass_bar(bar, c, 'eighths' if full else 'push', 0.48)
    if full:
        stabs(bar, c, 0.16, 1.1)
        wall(bar, c, 0.1)
    else:
        warm(bar, c, 0.38)
        arp(bar, c, 0.1, 0.95)
big_hit(at(22), G, 0.7, 1.8)
hook(22, 3, 0.22)
hook(23, 0, 0.24)
hook(24, 1, 0.24)
hook(25, 2, 0.24)
hook(26, 3, 0.24)
# Sparks landing: the balance, the goal, the teacher's reward reaching each phone, the sale.
for k in range(5):
    ting(at(19) + 0.5 + k * 0.16, 93 + k, 0.1, pan=-0.4 + k * 0.2)
ting(at(21, 1), 98, 0.16)
for k in range(6):
    ting(at(23) + 0.2 + k * 0.14, 90 + (k * 2) % 9, 0.13, pan=-0.6 + k * 0.24)
ting(at(24, 0.5), 102, 0.16, pan=0.3)
ting(at(24, 1), 105, 0.14, pan=0.4)
roll(at(26, 2), at(27), 0.14, 0.5)
reverse_into(at(27), 1.3, 0.45)

# ---- bars 27 to 30: the school's colours and uniform. The proudest the tune gets ----
big_hit(at(27), D, 0.95)
for i, bar in enumerate(range(27, 31)):
    c = MAIN[i]
    four_floor(bar, sixteenths=True)
    bass_bar(bar, c)
    wall(bar, c, 0.18)
    stabs(bar, c, 0.14, 1.25)
    hook(bar, i, 0.27)
    hook(bar, i, 0.1, octave=-1)
    if i < 3:
        for b in (1, 3):
            drums.add(clap(), at(bar, b) + 0.01, 0.3, pan=0.4)
# Seven uniforms step forward in a quick run, a half beat apart, and then stand as a line.
for k in range(7):
    drums.add(tom(57 + k) * 0.7, at(28, 1) + k * 0.25, 0.22, pan=-0.6 + k * 0.2)
# The last half bar falls away: the lights are about to go down.
fx.add(whoosh(1.0, 900)[::-1].copy(), at(30, 2.4), 0.3)

# ---- bar 31: dark. A low note and a radar ping ----
drone_n = int(BAR * 5.2 * SR)
tt = np.arange(drone_n) / SR
drone = (sine(hz(35), drone_n) * 0.6 + filt(saw(hz(47), drone_n), lp(260)) * 0.35) * env(drone_n, 0.7, 1.2) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.25 * tt))
low.add(drone, at(31), 0.5)
for b in (0, 2):
    ping(at(31, b), 93, 0.16)
pads.add(pad([59, 66, 71], BAR * 2), at(31), 0.3)

# ---- bars 32 to 34: calm, then a probe, password guessing, a decoy touched. A clock ticking faster ----
for i, bar in enumerate(range(32, 35)):
    c = DARK[i]
    pads.add(pad(c['tones'], BAR + 0.3), at(bar), 0.34)
    do_kick(at(bar, 0), power=0.8, gain=0.6)
    if i:
        do_kick(at(bar, 2), power=0.7, gain=0.5)
    steps = (4, 8, 16)[i]
    for s in range(steps):
        drums.add(hat(bright=0.9), at(bar, s * 4 / steps), 0.1 + 0.03 * i, pan=0.3 if s % 2 else -0.3)
    for e in range(8 if i else 4):
        low.add(bass(c['root'], BEAT * 0.4), at(bar, e * (0.5 if i else 1)), 0.34 + 0.05 * i)
    ping(at(bar, 0), 93, 0.12)
blip(at(32, 3), 81, 0.22, pan=-0.3)     # the probe
blip(at(33, 3), 83, 0.24, pan=0.3)      # password guessing
blip(at(34, 1.5), 85, 0.26, pan=-0.2)   # the decoy port
fx.add(riser(2.0, 8000), at(34), 0.45)
roll(at(34, 2), at(35), 0.12, 0.55)

# ---- bar 35: the attack, and the shield ----
big_hit(at(35), Bm, 1.0, 2.0)
four_floor(35, sixteenths=True)
bass_bar(35, Bm)
wall(35, Bm, 0.17, bright=5200)
for b in (0, 1, 2, 3):      # an alarm that is a tune, not a siren: two notes, falling
    tune.add(lead(83, BEAT * 0.45), at(35, b), 0.2)
    tune.add(lead(78, BEAT * 0.45), at(35, b + 0.5), 0.18)
hits.add(supersaw(47, 1.2, bright=1800, release=0.8), at(35, 1), 0.3)   # the shield: a low door of sound

# ---- bar 36: what it has seen, line by line ----
four_floor(36, sixteenths=True, gain=0.95)
bass_bar(36, G)
wall(36, G, 0.15, bright=5200)
for s in range(8):
    blip(at(36, s * 0.5), 76 + (s % 4) * 2, 0.07, pan=-0.5 + s * 0.14)

# ---- bar 37: it tells the right people. Two bells: a message arriving ----
half_time(37, 0.8)
bass_bar(37, Em, 'long', 0.44)
warm(37, Em, 0.4)
fx.add(bell(88, 1.4), at(37, 0.7), 0.3, pan=-0.4)
fx.add(bell(93, 1.6), at(37, 1.0), 0.3, pan=-0.3)
fx.add(whoosh(0.4, 2400), at(37, 0.1), 0.2)

# ---- bar 38: the reading. Held, plain ----
half_time(38, 0.75)
bass_bar(38, Fs, 'long', 0.44)
warm(38, Fs, 0.42)
for s in range(4):
    plucks.add(pluck(Fs['tones'][s % 3] + 12, 0.3, 0.9), at(38, s), 0.12, pan=-0.3 + s * 0.2)

# ---- bar 39: lockdown. One switch ----
do_kick(at(39, 0), gain=0.85)
pads.add(pad(Bm['tones'], BAR), at(39), 0.4)
low.add(bass(35, BEAT * 1.4), at(39, 0), 0.45)
clunk(at(39) + 0.8, 0.6)
low.add(bass(35, BEAT * 1.6), at(39) + 0.8, 0.5)
for s in (5, 6, 7):
    drums.add(hat(), at(39, s * 0.5), 0.16)

# ---- bar 40: self-checks and backups. The harmony starts to climb out ----
half_time(40, 0.8)
bass_bar(40, G, 'push', 0.46)
wall(40, G, 0.1)
warm(40, A, 0.2)
for s in range(8):      # a row of ticks, one for each check passing
    plucks.add(pluck(67 + s, 0.22, 1.1), at(40, s * 0.5), 0.12, pan=-0.6 + s * 0.17)
fx.add(riser(1.6, 7000), at(40, 0.8), 0.28)

# ---- bar 41: calm again. Home ----
warm(41, D, 0.6)
low.add(bass(38, BEAT * 3.4), at(41), 0.4)
for k, m in enumerate((74, 78, 81, 86)):
    fx.add(bell(m, 2.0), at(41) + k * 0.16, 0.22, pan=-0.4 + k * 0.27)
ping(at(41, 2), 98, 0.1)
roll(at(41, 2.5), at(42), 0.1, 0.5)
reverse_into(at(42), 1.4, 0.5)

# ---- bars 42 to 44: everyone on stage ----
big_hit(at(42), D, 1.0)
for bar, c, ph in ((42, D, 0), (43, G, 3)):
    four_floor(bar, sixteenths=True)
    bass_bar(bar, c)
    wall(bar, c, 0.19)
    stabs(bar, c, 0.15, 1.3)
    hook(bar, ph, 0.28)
    hook(bar, ph, 0.12, octave=-1)
# The last bar: one chord, home, left to ring.
big_hit(at(44), D, 0.9, 3.0)
for m in (50, 57, 62, 66, 69, 74, 78):
    chords.add(supersaw(m, 3.6, bright=6000, release=2.4), at(44), 0.17)
low.add(bass(38, 2.2), at(44), 0.55)
for m, d in ((86, 0.0), (90, 0.14), (93, 0.28), (98, 0.42)):
    fx.add(bell(m, 2.8), at(44) + d, 0.25, pan=(d - 0.2) * 3)

# ------------------------------------------------------------------ the mix

pump = np.ones(N)
for k in kicks:
    i = int(k * SR)
    n = min(N - i, int(0.34 * SR))
    u = np.arange(n) / SR
    pump[i:i + n] = np.minimum(pump[i:i + n], 1 - 0.78 * np.exp(-u / 0.085))

low.buf = filt(low.buf, lp(5000)) * (0.25 + 0.75 * pump)[:, None]
low.buf = (low.buf.sum(axis=1, keepdims=True) * 0.5).repeat(2, axis=1)
chords.buf = room(filt(chords.buf, hp(160)), 2.0, 0.22) * (0.3 + 0.7 * pump)[:, None]
pads.buf = room(filt(pads.buf, hp(200)), 3.0, 0.4, 4500) * (0.4 + 0.6 * pump)[:, None]
plucks.buf = room(filt(plucks.buf, hp(300)), 2.4, 0.35) * (0.55 + 0.45 * pump)[:, None]
tune.buf = room(filt(tune.buf, hp(240)), 2.2, 0.26)
fx.buf = room(fx.buf, 2.6, 0.3)
hits.buf = room(hits.buf, 2.8, 0.22)
drums.buf = room(drums.buf, 0.9, 0.07, 9000)

mix = drums.buf * 0.8 + low.buf * 0.62 + chords.buf * 1.5 + pads.buf * 1.15 + plucks.buf * 1.45 + tune.buf * 1.6 + fx.buf * 1.1 + hits.buf * 0.8


def fall_away(mix, t0, t1, floor=500.0):
    """The sound closes down to a murmur between t0 and t1, and the next bar starts clean."""
    f = np.ones(N)
    a, b = int(t0 * SR), int(t1 * SR)
    f[a:b] = np.linspace(1, 0.0, b - a) ** 1.5
    dark = filt(mix, lp(floor))
    out = mix * f[:, None] + dark * (1 - f)[:, None] * 0.8
    c = int((t1 + 0.02) * SR)
    out[b:c] *= np.linspace(0, 1, c - b)[:, None]
    return out


mix = fall_away(mix, at(30, 2.6), at(31))       # the lights go down
mix = filt(mix, lambda f: hp(36, 2)(f) * low_shelf(110, -2.5)(f) * shelf(8000, 2.5)(f))
peak = np.percentile(np.abs(mix), 99.9)
mix = np.tanh(mix / peak * 1.25) / np.tanh(1.25)
end = int(DUR * SR)
tail = int(1.3 * SR)
mix[end - tail:end] *= np.linspace(1, 0, tail)[:, None] ** 1.6
mix = mix[:end]
mix *= 0.89 / np.abs(mix).max()
rms = np.sqrt((mix ** 2).mean())
print(f'peak {np.abs(mix).max():.2f}  rms {20 * np.log10(rms):.1f} dBFS  length {len(mix) / SR:.2f} s')
# Loudness by section, to check the shape of the piece without ears: quiet where the picture is quiet.
for name, a, b in (('open', 1, 3), ('looks', 3, 5), ('title', 5, 7), ('home', 7, 11), ('nav', 11, 13), ('calm', 13, 19), ('economy', 19, 27), ('school', 27, 31), ('dark', 31, 32), ('watch', 32, 35), ('attack', 35, 37), ('after', 37, 41), ('calm again', 41, 42), ('end', 42, 45)):
    seg_ = mix[int(at(a) * SR):int(min(at(b), DUR) * SR)]
    print(f'  {name:11s} bars {a:2d}-{b - 1:2d}  {20 * np.log10(np.sqrt((seg_ ** 2).mean()) + 1e-9):6.1f} dBFS')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', OUT)
