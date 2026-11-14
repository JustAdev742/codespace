"""UN-BLESS YOU - sound design.

Shot like live action, so it is mixed like live action: a street that never
stops, foley for every small thing a hand does, and almost no score. The
score only arrives when the sketch gets grand about something petty: a
requiem for an AirPod, strings for a thank-you, a western standoff at a bus
stop. Each cue is cut dead rather than faded, which is the joke.

Prompted effects come from audio/sfx (ElevenLabs); the rest is synthesized.
"""
import numpy as np


def design(mix):
    s, T, E, D = mix.synth, mix.T, mix.E, mix.D
    dur = mix.dur

    def loop(x, length, xf=0.3):
        n, k = s.n_(length), s.n_(xf)
        out, pos = np.zeros(n), 0
        while pos < n:
            seg = x[: min(len(x), n - pos + k)].copy()
            if pos:
                seg[:k] *= np.linspace(0, 1, k)
            seg[-k:] *= np.linspace(1, 0, k)
            out[pos : pos + len(seg)] += seg[: n - pos]
            pos += len(x) - k
        return out

    def env(points, length):
        tt = np.arange(s.n_(length)) / s.SR
        ts, gs = zip(*points)
        return np.interp(tt, ts, gs)

    def at_peak(name, t, gain=1.0, pan=0.0, af=None):
        """Place a clip so its loudest moment lands on t (sneezes, crashes)."""
        x = mix.clip(name, af)
        peak = int(np.argmax(np.abs(x))) / s.SR
        mix.add(t - peak, x, gain, pan)

    def sfx(name, t, gain=1.0, pan=0.0, cut=None, af=None):
        x = mix.clip(name, af)
        if cut is not None:
            x = s.fade(x[: max(1, s.n_(cut - t))], 0.005, 0.01)  # cut dead, the way an editor would
        mix.add(t, x, gain, pan)

    # ------------------------------------------------------------ the street, which never stops (twice)
    amb = loop(mix.clip("ambience"), dur)
    un = T("l19")
    gone = T("sneeze2.hit") + 0.25
    back = T("phone2.ring")
    g = env(
        [
            (0, 0), (0.6, 0.9),
            (un - 0.05, 0.9), (un + 0.05, 0.0), (E("l19", 2.5), 0.0), (T("sits", 3.0), 0.75),   # the world holds its breath
            (gone - 0.05, 0.75), (gone + 0.02, 0.0), (back - 0.3, 0.0), (back + 1.5, 0.8),     # the long silence
            (T("black") - 0.05, 0.8), (T("black"), 0.0), (dur, 0.0),
        ],
        dur,
    )
    mix.add(0, amb * g, 0.9, 0, "bed")
    wind = loop(mix.clip("wind"), back - gone)
    mix.add(gone, wind * env([(0, 0), (2.5, 0), (5.0, 0.55), (back - gone - 0.6, 0.55), (back - gone, 0)], back - gone), 0.8, 0, "bed")

    # small helpers for foley
    def steps(t0, t1, rate=1.9, gain=0.25, pan=0.0, f=180, seed=0):
        t, i = t0, 0
        while t < t1:
            mix.add(t, s.thud(0.09, f + (i % 2) * 20, seed + i) * s.decay(0.09, 0.03), gain, pan)
            t += 1 / rate
            i += 1

    def ringtone(t0, t1, gain=0.35, pan=0.0):
        phrase = [(0, 76), (0.18, 79), (0.36, 84), (0.54, 79), (0.72, 81), (0.9, 84)]
        t = t0
        while t < t1 - 0.2:
            for o, n in phrase:
                if t + o < t1:
                    mix.add(t + o, s.marimba(s.midi(n), 0.3), gain, pan)
            t += 1.6

    def buzz(t, n=2, gain=0.45):
        for i in range(n):
            mix.add(t + i * 0.55, s.buzz(0.4), gain, 0.15)

    # ------------------------------------------------------------ the sneeze
    steps(T("m1", 0.5), T("m1", 3.7), 1.9, 0.18, 0.3)
    at_peak("sneeze_marcus", T("sneeze1.hit"), 0.9, 0.3)
    mix.add(T("open", 0.4), s.rustle(1.2, 2) * 0.5, 0.25, -0.3)                  # crossword
    sfx("pen", T("open", 1.0), 0.25, -0.3)
    sfx("newspaper", T("lb1") - 0.35, 0.5, -0.3)
    mix.add(T("finger.up"), s.rustle(0.25, 3), 0.25, 0.2)

    # ------------------------------------------------------------ the revocation
    mix.add(T("rise.cap"), s.click(0.03, 2500, 4), 0.6, -0.2)
    mix.add(T("rise.cap", 0.2), s.rustle(0.6, 5), 0.4, -0.2)
    mix.add(T("rise.glasses", 0.5), s.click(0.025, 3000, 6), 0.4, -0.2)
    mix.add(T("rise.stand"), s.rustle(0.8, 7), 0.4, -0.2)
    steps(T("rise.stand", 1.0), T("rise.stand", 2.7), 1.5, 0.22, -0.1, 150)
    drone_len = T("l19") - T("rise") + 0.2
    drone = s.fade(s.drone(drone_len, 49, 8, 1.06), 2.5, 0.02)
    mix.add(T("rise"), drone, 0.28, 0, "music")
    sfx("soul", T("ritual.pull") - 0.2, 0.75, 0.1)
    mix.add(T("fold.snap"), s.pluck(s.midi(88), 0.5), 0.5, 0.1)
    for k in ("fold1", "fold2"):
        mix.add(T(f"fold.{k}"), s.rustle(0.25, 8), 0.3, 0)
    for i in range(3):
        mix.add(T("fold.pat") + i * 0.2, s.thud(0.08, 140, 9 + i), 0.3, 0)
    mix.add(T("l19") + D("l19") * 0.35, s.boom(2.6, 62, 22), 0.85)
    sfx("bell", E("l19", 0.5), 0.55, -0.4)
    steps(T("sits", 0.3), T("sits", 1.8), 1.5, 0.2, -0.2, 150, 20)
    mix.add(T("sits", 2.6), s.rustle(0.6, 10), 0.35, -0.3)

    # ------------------------------------------------------------ consequences
    mix.add(T("denise.msit", 0.6), s.thud(0.15, 90, 11), 0.35, 0.1)               # Marcus drops onto the bench
    sfx("heels", T("denise.walk") - 0.2, 0.6, 0.2)
    a0 = T("airpod.slip")
    for k, f in (("b1", 3200), ("b2", 3600), ("b3", 4000)):
        mix.add(T(f"airpod.{k}"), s.bell(f, 0.12, 0.4) * s.decay(0.12, 0.02), 0.5, 0.1)
    mix.add(T("airpod.roll"), s.hp(s.noise(T("airpod.grate") - T("airpod.roll"), 12), 3000) * 0.04, 0.6, 0.2)
    sfx("requiem", T("airpod.roll") - 0.1, 0.65, 0, cut=T("airpod.drop"))
    sfx("plink", T("airpod.plink") - 0.05, 0.9, 0.3)
    sfx("pen", T("l23", 0.6), 0.3, -0.3)
    buzz(T("buzz.buzz"))
    steps(T("mum"), E("u25", 0.8), 2.0, 0.16, -0.5, 200, 30)
    steps(T("mum"), E("u25", 0.8), 2.8, 0.1, -0.4, 260, 40)
    ringtone(T("ring.ring"), T("ring.answer"), 0.32, 0.1)
    for i, n in enumerate((79, 76, 72)):
        mix.add(T("lower.click") + i * 0.13, s.bell(s.midi(n), 0.18, 0.3) * s.decay(0.18, 0.05), 0.35, 0.1)

    # ------------------------------------------------------------ the return
    steps(T("lower.turn"), T("lower.turn", 0.9), 2.0, 0.2, 0.1)
    sfx("notebook", T("l38") - 0.2, 0.55, -0.2)
    mix.add(E("l44", 0.05), s.whoosh(0.3, 2000, 600, 14, 0.6), 0.15)
    # the menu: a laminated card whipped out, and a little lift under each tier
    mix.add(T("menu.out"), s.layer([(0, s.whoosh(0.25, 900, 3000, 22, 0.7)), (0.2, s.click(0.03, 1200, 23) * 1.5)]), 0.4, -0.2)
    for i, k in enumerate(("lp2", "lp3", "lp4", "lp5")):
        mix.add(T(k), s.bell(s.midi(76 + (0, 2, 4, 7)[i]), 0.6, 0.6), 0.22, -0.1, "music")
    # the supervisor: one low, ominous chord for the least dramatic reveal possible
    sup = s.pad([s.midi(n) for n in (38, 45, 50, 53)], 2.4, "saw", 900, attack=0.01, release=1.4)
    mix.add(T("reveal.badge", 0.25), s.layer([(0, s.boom(1.6, 70, 30)), (0, sup)]), 0.45, 0, "music")
    mix.add(T("crouch.down"), s.rustle(0.8, 15), 0.35, 0)
    sfx("strings", T("m48") - 0.6, 0.55, 0, cut=T("l49"))
    far = T("pepper.bus") - T("l51")
    mix.add(T("l51"), s.lp(s.noise(far, 16), 160) * env([(0, 0), (far, 1)], far), 0.25, 0.6)         # the bus, still distant

    # a clock that is not there, ticking
    t, i = E("l52"), 0
    while t < T("pepper.stop"):
        mix.add(t, s.click(0.02, 2400 if i % 2 else 1800, 50 + i), 0.22, 0.4, "music")
        t += 0.5
        i += 1

    # ------------------------------------------------------------ the forced sneeze
    glare = s.fade(s.osc(2637, D("sun") + 1.6) * 0.15 + s.osc(3951, D("sun") + 1.6) * 0.08, 1.0, 0.6)
    mix.add(T("sun.look"), glare, 0.25, 0, "music")
    sfx("packet", T("pepper.tear"), 0.7, 0.1)
    sfx("snort", T("pepper.snort") - 0.1, 0.8, 0.1)
    sfx("busarrive", T("pepper.bus") - 0.3, 0.8, 0.5)
    steps(T("m55", 0.2), T("m55", 3.0), 1.9, 0.2, 0.4, 150, 60)                   # Leonard, to the kerb
    steps(T("backfire", 1.5), T("backfire", 2.2), 2.4, 0.2, 0.5, 160, 70)        # and up the step
    mix.add(T("backfire.fling") - 0.05, s.whoosh(0.4, 600, 2500, 24, 0.4), 0.35, 0.3)
    mix.add(T("backfire.burst"), s.layer([(0, s.lp(s.noise(0.5, 25), 1800) * s.decay(0.5, 0.12)), (0, s.thud(0.1, 220, 26))]), 0.55, 0.4)
    riser = mix.clip("riser")
    mix.add(T("crest.die") - len(riser) / s.SR, riser, 0.6)
    mix.add(T("crest.die"), s.whoosh(0.8, 1500, 150, 17, 0.1), 0.35)            # ...and it's gone

    # ------------------------------------------------------------ the reversal
    at_peak("sneeze_leonard", T("sneeze2.hit"), 1.0, 0.45)
    mix.add(T("silence.driver", 1.2), s.click(0.03, 2200, 18), 0.35, 0.5)       # shades on
    sfx("standoff", T("silence.driver") - 0.2, 0.6, 0, cut=T("l58", -0.1))
    ringtone(T("phone2.ring"), T("phone2.finger"), 0.4, 0.2)
    for t in (T("doors.close"),):
        mix.add(t, s.hiss(0.7, 1500, 19, 0.15) * 0.8, 0.5, 0.5)                 # pneumatic doors
    mix.add(T("doors.shut"), s.thud(0.2, 90, 20), 0.6, 0.5)
    for i in range(2):
        mix.add(T("doors.palms") + i * 0.12, s.thud(0.1, 200, 21 + i), 0.45, 0.5)
    sfx("busleave", T("doors.go") - 0.2, 0.8, 0.2)
    sfx("crash", T("crash.hit"), 0.6, -0.85, af="lowpass=f=5000")
    sfx("hubcap", T("crash.hubcap"), 0.7, -0.2)
    sfx("pigeon", T("crash.settle", 0.5), 0.45, 0.3)
    sfx("endsting", T("endcard", 0.2), 0.75)
