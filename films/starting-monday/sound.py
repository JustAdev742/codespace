"""STARTING MONDAY - sound design and score.

Prompted effects come from audio/sfx (ElevenLabs); the score and the small
foley are synthesized here. Everything is cued off beat ids, like the picture.

The running gag is the hold music: it never stops. It plays from the phone on
the coffee table under the whole film, tinny and low, and surfaces whenever
the room goes quiet.
"""
import numpy as np


def design(mix):
    s, T, E, D = mix.synth, mix.T, mix.E, mix.D
    Fr = lambda bid, f: T(bid) + D(bid) * f  # noqa: E731
    PHONE = "highpass=f=500,lowpass=f=2600,acompressor=threshold=-24dB:ratio=5:makeup=3"

    def loop(x, dur, xf=0.25):
        n, k = s.n_(dur), s.n_(xf)
        out = np.zeros(n)
        pos = 0
        while pos < n:
            seg = x[: min(len(x), n - pos + k)].copy()
            seg[:k] *= np.linspace(0, 1, k) if pos else 1
            seg[-k:] *= np.linspace(1, 0, k)
            out[pos : pos + len(seg)] += seg[: n - pos]
            pos += len(x) - k
        return out

    def env(points, dur):
        """Piecewise-linear gain over film time: [(t, gain), ...]."""
        tt = np.arange(s.n_(dur)) / s.SR
        ts, gs = zip(*points)
        return np.interp(tt, ts, gs)

    def sfx(name, t, gain=1.0, pan=0.0):
        mix.add(t, mix.clip(name), gain, pan)

    # ------------------------------------------------------------ hold music, all film long
    hold = loop(mix.clip("holdmusic", PHONE), mix.dur)
    peel = T("peel.boom") - 0.9
    g = env(
        [
            (0, 0.0), (0.4, 0.55), (T("k1a") - 0.2, 0.55), (T("k1a"), 0.3), (T("k4", 2.3), 0.3),
            (T("inhale"), 0.5), (peel - 0.05, 0.5), (peel + 0.6, 0.0),        # the tear swallows it
            (T("title", 3.0), 0.0), (T("title", 5.0), 0.05),                  # ...and it's still on
            (T("lower", 5.0), 0.05), (T("k52") - 0.4, 0.5), (E("k52", 0.8), 0.5), (T("eyes", 1.0), 0.08),
            (T("black"), 0.08), (T("black", 0.2), 0.0),
            (T("stinger"), 0.0), (T("stinger", 0.3), 0.32), (mix.dur - 0.6, 0.32), (mix.dur, 0.0),
        ],
        mix.dur,
    )
    mix.add(0, hold * g, 1.0, 0.25, bus="bed")

    # room tone: a fridge hum and a little night air
    room = s.lp(s.noise(mix.dur, 21), 300) * 0.035 + s.osc(60, mix.dur) * 0.004
    mix.add(0, room, 1.0, 0, bus="bed")

    # ------------------------------------------------------------ cold open
    mix.add(T("inhale", 0.6), s.rustle(0.4, 3) * 0.5, 0.6, -0.1)               # glances
    mix.add(T("inhale", 1.05), s.rustle(0.4, 4) * 0.5, 0.6, 0.1)
    mix.add(T("inhale", 1.5), s.hiss(1.0, 1800, 2, 0.6) * 0.25, 1.0)             # the big breath in
    sfx("peel", peel, 1.0)
    mix.add(T("peel.boom"), s.boom(2.4, 70, 24), 0.9)
    mix.add(T("peel"), s.whoosh(1.2, 200, 5000, 6, 0.3), 0.5, 0.2)
    sfx("holo", T("peel.figures", 0.2), 0.35, 0.3)
    mix.add(E("d8", -0.25), s.whoosh(0.5, 3000, 400, 7, 0.7), 0.4)              # cut to title
    sfx("titlehit", T("title", 0.05), 1.0)
    for i, f in enumerate((0, 7, 12)):
        mix.add(T("title", 0.12 + i * 0.42), s.bell(s.midi(64 + f), 1.4) * 0.5, 0.6, (i - 1) * 0.4, "music")

    # cosmic pad under the auditors' pitch
    def cosmic(dur, root=45):
        chords = [[root, root + 7, root + 12, root + 15, root + 19], [root - 4, root + 3, root + 8, root + 12, root + 15]]
        half = dur / 2
        a = s.pad([s.midi(n) for n in chords[0]], half + 1, "saw", 900, attack=1.2, release=1.2)
        b = s.pad([s.midi(n) for n in chords[1]], half + 1, "saw", 900, attack=1.2, release=1.2)
        x = s.layer([(0, a), (half, b)], dur + 1)
        return s.reverb(x, 2.5, 0.5)
    mix.add(E("title"), cosmic(T("doorbell") - E("title") - 0.5), 0.2, 0, "music")

    # holo blips whenever a panel changes
    for t in (T("q12"), Fr("z14", 0.34), Fr("z14", 0.47), Fr("z14", 0.86), T("q17"), T("z21"), T("q25", 0.3), T("q27"), T("ding.ding"), T("blaze", 1.0)):
        mix.add(t, s.layer([(0, s.bell(1760, 0.3) * 0.4), (0.06, s.bell(2637, 0.4) * 0.3)]), 0.35, 0.2)
    mix.add(Fr("z14", 0.34), s.thud(0.25, 90), 0.4)                             # GOLD struck out
    mix.add(Fr("z14", 0.47), s.layer([(0, s.thud(0.25, 80)), (0, s.click(0.05, 1500) * 0.5)]), 0.5)  # NEGOTIABLE stamp
    sfx("choir", Fr("z14", 0.86) - 0.1, 0.35)                                     # "...we found you"
    mix.add(T("q12", 1.0), s.hiss(0.5, 4000, 8, 0.2) * 0.3, 0.6)
    mix.add(Fr("z19", 0.78), s.whoosh(0.4, 600, 3000, 9, 0.5), 0.3)              # crash-zoom to the thighs
    for i in range(5):
        mix.add(Fr("z19", 0.8) + i * 0.3, s.bell(s.midi(88 + (i % 3) * 3), 0.6) * 0.35, 0.4, 0.3 - i * 0.15)

    # ------------------------------------------------------------ leverage
    mix.add(T("think", 0.1), s.drone(D("think"), 98, 4, 1.25) * 0.4, 0.5, 0, "music")  # the long think
    sfx("tablet", T("typing", 0.05), 0.6, 0.15)
    mix.add(T("q25", 0.3), s.bell(1318, 0.8) * 0.5, 0.5, 0.2)
    sfx("chaching", T("d28", 0.6), 0.7, -0.1)

    # ------------------------------------------------------------ the short
    sfx("doorbell", T("doorbell.ding"), 0.9, 0.6)
    sfx("doorburst", T("doorbell.burst") - 0.05, 1.0, 0.6)

    def workout(dur, bpm=126):
        spb = 60 / bpm
        beats = int(dur / spb) + 1
        bassline = [40, 40, 52, 40, 43, 43, 55, 45]
        ev = []
        for b in range(beats):
            ev.append((b, 0.5, "kick", None, 1.0))
            ev.append((b + 0.5, 0.25, "hat", None, 0.5))
            ev.append((b + 0.5, 0.45, "bass", bassline[b % 8], 0.9))
            if b % 4 == 3:
                ev.append((b + 0.75, 0.2, "hat", None, 0.35))
            if b % 8 in (0, 3, 6):
                ev.append((b, 0.25, "stab", 64 + (b % 8 == 6) * 3, 0.5))
        voices = {
            "kick": lambda d: s.kick(d),
            "hat": lambda d: s.hiss(d, 7000, 3, 0.02) * 2,
            "bass": lambda f, d: s.lp(s.osc(f, d, "saw"), 900) * s.adsr(d, 0.005, 0.1, 0.6, 0.05) * 0.6,
            "stab": lambda f, d: s.pad([f, f * 1.26, f * 1.5], d, "saw", 2400, attack=0.005, release=0.05) * 1.6,
        }
        return s.sequence(bpm, ev, voices)[: s.n_(dur)]

    def record_stop(x):
        """Slow the tail of a cue to a halt, like a hand on a turntable."""
        n = min(len(x), s.n_(0.7))
        tail = x[-n:]
        idx = np.cumsum(np.linspace(1, 0.05, n))
        idx = np.clip(idx, 0, n - 1)
        x = x.copy()
        x[-n:] = np.interp(idx, np.arange(n), tail) * np.linspace(1, 0, n)
        return x

    a = T("doorbell.burst")
    mix.add(a, record_stop(s.fade(workout(T("z30") - a), 0.01, 0.0)), 0.5, 0, "music")
    mix.add(T("b35"), s.fade(workout(E("b35") - T("b35"), 126) * 0.5, 0.8, 0.6), 0.25, 0, "music")
    a = T("b48")
    mix.add(a, s.fade(workout(T("alarm.on") - a + 0.05), 0.005, 0.02), 0.55, 0, "music")
    mix.add(T("z30"), s.hiss(0.6, 2500, 11, 0.1) * 0.3, 0.6, -0.2)             # "Vex." chill
    mix.add(E("q32", -0.2), s.click(0.03), 0.3)
    sfx("choir", T("nachos.reveal") - 0.15, 0.9, -0.15)
    mix.add(T("nachos.reveal"), s.rustle(0.5, 12), 0.4, -0.2)                   # robe

    # Dale's confession: soft electric piano, nothing else
    def sincere(dur):
        prog = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]
        step = dur / len(prog)
        parts = []
        for i, ch in enumerate(prog):
            for j, n in enumerate(ch):
                parts.append((i * step + j * 0.04, s.epiano(s.midi(n), step + 0.6) * 0.35))
            parts.append((i * step, s.bass(s.midi(ch[0] - 12), step) * 0.5))
        return s.reverb(s.layer(parts, dur + 1), 1.8, 0.35)
    mix.add(T("waver", 0.6), sincere(E("z45") - T("waver")), 0.32, 0, "music")
    mix.add(T("waver", 1.1), s.rustle(0.9, 13), 0.5)                              # stands up off the couch
    mix.add(T("waver", 1.2), s.squeak(0.25, 300, 180) * 0.6, 0.4, -0.2)          # couch springs

    # ------------------------------------------------------------ the push-up
    on = T("alarm.on")
    alarm = loop(mix.clip("alarm"), T("eyes") - on)
    fade_alarm = env([(0, 0.55), (T("q49") - on - 0.2, 0.5), (T("q49") - on, 0.22), (E("q49") - on, 0.22), (E("q49") - on + 0.4, 0.45),
                      (T("lower") - on, 0.4), (T("lower", 5) - on, 0.18), (T("eyes") - on, 0.0)], T("eyes") - on)
    mix.add(on, alarm * fade_alarm, 1.0, 0.1, "sfx")
    sfx("whistle", T("b51", -0.35), 0.6, 0.3)

    def tension(dur):
        x = s.drone(dur, 41, 5, 1.5) * 0.6
        parts = [(0, x)]
        t, gap = 0.0, 0.9
        while t < dur - 0.3:                                                   # heartbeat, quickening
            parts.append((t, s.kick(0.22, 80, 40) * 0.8))
            parts.append((t + 0.22, s.kick(0.2, 70, 38) * 0.5))
            t += gap
            gap = max(0.45, gap * 0.97)
        return s.fade(s.layer(parts, dur), 0.5, 0.4)
    mix.add(T("down1"), tension(T("eyes") - T("down1")), 0.3, 0, "music")
    for t, f in ((T("down1", 3.2), 95), (T("down2", 2.6), 85), (E("d50", 1.4), 80)):
        mix.add(t, s.thud(0.25, f), 0.8, -0.05)                                   # knees, hands, the floor
    for i in range(4):
        mix.add(T("position", 1.7) + i * 0.32, s.bell(s.midi(76 - i * 2), 0.5) * 0.3, 0.3, 0.2, "music")  # stars going out
    for i in range(5):
        mix.add(T("lower", 1.8) + i * 0.3, s.bell(s.midi(72 - i * 2), 0.5) * 0.3, 0.3, 0.2, "music")
    mix.add(T("eyes"), s.whoosh(0.35, 2500, 500, 14, 0.6), 0.35)                # cut under the couch
    sfx("choir", T("eyes", 1.55), 0.8)                                            # the remote, beheld
    mix.add(T("roll", 0.6), s.rustle(1.2, 15), 0.55)

    # ------------------------------------------------------------ the peg holds
    b = T("blaze.on")
    mix.add(b, s.boom(1.8, 110, 50), 0.6)
    for i, n in enumerate((60, 64, 67, 72)):
        mix.add(b + i * 0.05, s.bell(s.midi(n + 12), 2.0) * 0.4, 0.5, (i - 1.5) * 0.3, "music")
    triumph = s.pad([s.midi(n) for n in (48, 55, 60, 64, 67, 72)], 6.5, "saw", 2600, attack=0.05, release=2.0)
    mix.add(b + 0.9, s.reverb(triumph, 2.0, 0.4), 0.35, 0, "music")
    sfx("cheer", b + 1.0, 0.7)
    for i in range(10):
        mix.add(b + 1.0 + i * 0.13, s.click(0.03, 1200 + 300 * (i % 4), 30 + i) * 0.8, 0.4, (i % 5 - 2) * 0.35)  # party poppers
    mix.add(T("b57"), s.fade(s.drone(D("b57") + 1, 55, 6, 0.6), 0.1, 0.6) * 0.5, 0.4, 0.2, "music")

    # repossession
    sfx("beam", T("repo.beam"), 0.7, 0.2)
    sfx("zipper", T("repo.zip"), 0.9, 0.2)
    mix.add(T("repo.zip", 0.3), s.hiss(1.0, 600, 16, 0.2) * 0.6, 0.5, 0.2)       # deflating
    mix.add(T("repo.yank"), s.whoosh(0.9, 300, 6000, 17, 0.2), 0.7, 0.2)
    mix.add(T("repo.plop"), s.layer([(0, s.thud(0.15, 160)), (0, s.lp(s.noise(0.12, 18), 900) * s.decay(0.12, 0.03))]), 0.8, 0.2)
    sfx("squeak", T("repo.squeak"), 0.8, 0.2)
    sfx("weakwhistle", T("repo.toot"), 0.8, 0.2)

    # ------------------------------------------------------------ tag
    sfx("dooropen", T("sharon.open") - 0.1, 0.8, 0.6)
    mix.add(T("sharon.sees"), s.squeak(0.1, 2200, 2600), 0.25, 0.1)
    mix.add(Fr("s60", 0.6), s.rustle(1.4, 19) * 0.6, 0.4, -0.3)                  # grocery bags, leaving
    mix.add(T("ding.ding"), s.bell(1568, 1.2) * 0.6, 0.5, 0.2)
    mix.add(T("ding.ding", 0.15), s.bell(2093, 1.2) * 0.5, 0.5, 0.2)
    mix.add(T("turn"), s.fade(s.drone(T("black") - T("turn"), 36.7, 7, 1.0), 1.0, 0.05), 0.55, 0, "music")
    ominous = s.pad([s.midi(n) for n in (38, 41, 44, 49)], T("black") - T("turn") + 0.1, "saw", 700, attack=2.0, release=0.05)
    mix.add(T("turn"), ominous, 0.25, 0, "music")
    mix.add(E("z62", 0.05), s.boom(2.0, 60, 25), 0.8)                            # cut to black

    # end card theme: one jaunty phrase
    def theme(bpm=132):
        mel = [(0, 0.5, 67), (0.5, 0.5, 69), (1, 1, 72), (2, 0.5, 69), (2.5, 0.5, 67), (3, 1, 64), (4, 0.5, 65), (4.5, 0.5, 67),
               (5, 0.5, 69), (5.5, 0.5, 65), (6, 1.5, 67), (8, 1, 60)]
        ev = [(b, l, "mar", n, 0.9) for b, l, n in mel]
        ev += [(b, 0.9, "bass", n, 0.8) for b, n in ((0, 48), (2, 45), (4, 41), (6, 43), (8, 36))]
        ev += [(b, 0.4, "kick", None, 0.7) for b in range(0, 9, 2)]
        voices = {"mar": s.marimba, "bass": s.bass, "kick": lambda d: s.kick(d)}
        return s.reverb(s.sequence(bpm, ev, voices), 1.0, 0.25)
    mix.add(T("endcard", 0.3), theme(), 0.5, 0, "music")

    # stinger: the bike, the whistle
    bike = loop(mix.clip("bike"), mix.dur - T("stinger"))
    mix.add(T("stinger"), bike * env([(0, 0.0), (0.3, 0.7), (mix.dur - T("stinger"), 0.7)], mix.dur - T("stinger")), 1.0, -0.4)
    sfx("weakwhistle", T("stinger2.toot"), 0.9, -0.4)
