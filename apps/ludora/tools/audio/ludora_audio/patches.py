"""The named synth patches. Each plays in a Part where a soundfont preset would.

    from ..patches import PLUCK, SUB_BASS
    Part("arp", PLUCK, arp(PROGRESSION, 60, 76, step=0.5), Mix(gain_db=-4, pan=-0.2))

Each patch is levelled against the soundfont preset it would most often replace
(showcase.py's PRESET): on the same phrase the two measure within about a dB, so
swapping one for the other needs little change to the part's gain. `tweak()`
makes a variant:

    SUPERSAW_PAD.tweak(cutoff=1600, release=2.0)

What each one is for is in its description, and in tools/audio/README.md.
"""

from .engine import Env, Filter, Lfo, Osc, Patch

PLUCK = Patch(
    "pluck",
    (
        Osc("saw", 0.8, unison=3, spread=14, width=0.55),
        Osc("square", 0.25, octave=1),
        Osc("sine", 0.35, octave=-1),
    ),
    amp=Env(0.002, 0.55, 0.0, 0.28),
    filter=Filter("lp", cutoff=650, res=0.22, slope=24, env=Env(0.001, 0.28, 0.0, 0.25), env_amount=4.4, keytrack=0.6, vel_amount=0.8),
    vel_amp=0.5,
    retrig=True,
    chorus=0.25,
    mono_below=140,
    level=-14.0,
    description="Bright and quick to decay: arpeggios and ostinatos that sparkle and leave no tail.",
)

WARM_KEYS = Patch(
    "warm keys",
    (
        # The body: a sine with a soft FM bark that mellows as the note rings.
        Osc("fm", 1.0, ratio=1.0, index=1.8, index_end=0.35, index_decay=0.5, index_vel=0.8),
        # The tine: a quick metallic ping on top.
        Osc("fm", 0.3, ratio=14.0, index=1.0, index_end=0.0, index_decay=0.03, decay=0.06),
        Osc("sine", 0.25, octave=-1, decay=1.2),
    ),
    amp=Env(0.002, 3.2, 0.0, 0.35),
    lfos=(Lfo("amp", rate=4.2, depth=0.12, retrigger=False),),
    vel_amp=0.6,
    chorus=0.35,
    mono_below=140,
    level=-16.1,
    description="An electric-piano-like FM key, round with a gentle bell on top: chords and comping in calm or warm tracks.",
)

SUPERSAW_PAD = Patch(
    "supersaw pad",
    (
        Osc("saw", 1.0, unison=7, spread=36, width=1.0),
        Osc("saw", 0.35, octave=-1, unison=3, spread=16, width=0.5),
    ),
    amp=Env(0.35, 1.2, 0.85, 1.3),
    filter=Filter("lp", cutoff=3600, res=0.1, slope=12, env=Env(0.7, 1.6, 0.45, 1.3), env_amount=0.8, keytrack=0.4),
    lfos=(Lfo("cutoff", rate=8, depth=0.25, sync=True, retrigger=False),),
    vel_amp=0.4,
    chorus=0.2,
    mono_below=160,
    level=-18.8,
    description="A wide, shimmering stack of detuned saws that swells in: big choruses and the final stretch.",
)

SOFT_PAD = Patch(
    "soft pad",
    (
        Osc("triangle", 1.0, unison=3, spread=10, width=0.7),
        Osc("saw", 0.35, unison=2, spread=14, width=0.8),
    ),
    amp=Env(0.6, 1.5, 0.8, 1.6),
    filter=Filter("lp", cutoff=1400, res=0.05, slope=12, env=Env(0.9, 2.0, 0.5, 1.6), env_amount=0.6, keytrack=0.3),
    lfos=(Lfo("cutoff", rate=16, depth=0.2, sync=True, retrigger=False),),
    vel_amp=0.4,
    chorus=0.4,
    mono_below=150,
    level=-22.7,
    description="Dark, warm and slow: a bed under quiet tracks that never draws the ear.",
)

SUB_BASS = Patch(
    "sub bass",
    (
        Osc("sine", 1.0),
        # The second harmonic and a little more above it, so the bass still reads on laptop
        # and Chromebook speakers, which play almost nothing under 150 Hz.
        Osc("sine", 0.42, octave=1),
        Osc("triangle", 0.2, octave=1),
    ),
    amp=Env(0.004, 0.5, 0.9, 0.08),
    filter=Filter("lp", cutoff=900, res=0.0, slope=12, keytrack=0.3),
    vel_amp=0.3,
    mono=True,
    glide=0.03,
    retrig=True,
    drive=0.4,
    level=-15.7,
    description="A clean, round sine bass, with enough second and third harmonic to stay audible on laptop speakers: the weight under a mix, mono.",
)

PUNCHY_BASS = Patch(
    "punchy bass",
    (
        # Both on the note itself: an octave under it, small speakers and the headroom would lose the weight.
        Osc("saw", 1.0, unison=2, spread=8),
        Osc("square", 0.35),
    ),
    amp=Env(0.002, 0.3, 0.75, 0.06),
    filter=Filter("lp", cutoff=600, res=0.45, slope=24, env=Env(0.001, 0.18, 0.45, 0.1), env_amount=3.0, keytrack=0.4, vel_amount=0.6),
    vel_amp=0.5,
    mono=True,
    glide=0.03,
    retrig=True,
    drive=0.5,
    level=-13.4,
    description="A filtered, driven saw bass with a snappy envelope: driving lines in battle and market tracks, mono.",
)

ROUND_BASS = Patch(
    "round bass",
    (
        Osc("triangle", 1.0),
        Osc("saw", 0.6),
    ),
    amp=Env(0.003, 0.6, 0.6, 0.1),
    filter=Filter("lp", cutoff=900, res=0.1, slope=12, env=Env(0.001, 0.2, 0.25, 0.1), env_amount=1.4, keytrack=0.4, vel_amount=0.5),
    vel_amp=0.5,
    mono=True,
    glide=0.02,
    retrig=True,
    drive=0.3,
    level=-15.8,
    description="A soft, plucked-sounding synth bass: gentle tracks where a pizzicato bass is too thin.",
)

FM_BELL = Patch(
    "fm bell",
    (
        Osc("fm", 1.0, ratio=3.5, index=1.8, index_end=0.25, index_decay=0.45, index_vel=0.7, key_scale=0.5),
        Osc("fm", 0.4, ratio=1.0, index=0.8, index_end=0.1, index_decay=0.8, octave=1, key_scale=0.5),
    ),
    amp=Env(0.002, 2.6, 0.0, 1.2),
    key_level=-2.0,
    vel_amp=0.5,
    chorus=0.15,
    level=-23.2,
    description="A glassy lantern bell with inharmonic partials, mellower and quieter up high: melodies over sparse beds, sparkles and answers.",
)

MALLET = Patch(
    "mallet",
    (
        Osc("fm", 1.0, ratio=4.0, index=2.0, index_end=0.0, index_decay=0.03, index_vel=0.9, key_scale=0.3),
        Osc("sine", 0.14, semi=24, decay=0.08),
    ),
    amp=Env(0.001, 0.8, 0.0, 0.3),
    vel_amp=0.6,
    retrig=True,
    level=-19.3,
    description="A woody FM mallet, between marimba and kalimba: ostinatos and soft hooks.",
)

CHIP_LEAD = Patch(
    "chip lead",
    (
        Osc("pulse", 1.0, pw=0.25),
        Osc("pulse", 0.3, pw=0.125, octave=1),
    ),
    amp=Env(0.004, 0.2, 0.75, 0.08),
    filter=Filter("lp", cutoff=9000, res=0.0, slope=12, keytrack=0.0),
    lfos=(Lfo("pitch", rate=5.5, depth=18, delay=0.18, fade=0.2), Lfo("pw", rate=0.4, depth=0.08, retrigger=False)),
    vel_amp=0.2,
    mono=True,
    glide=0.025,
    level=-23.7,
    description="A pulse-wave lead with a late vibrato: playful chiptune hooks for game and battle tracks.",
)

BRIGHT_LEAD = Patch(
    "bright lead",
    (
        Osc("saw", 1.0, unison=2, spread=12, width=0.5),
        Osc("square", 0.4, octave=-1),
        Osc("noise", 0.04, decay=0.04),
    ),
    amp=Env(0.004, 0.3, 0.85, 0.2),
    filter=Filter("lp", cutoff=2400, res=0.22, slope=24, env=Env(0.005, 0.4, 0.35, 0.3), env_amount=1.5, keytrack=0.7, vel_amount=0.5),
    lfos=(Lfo("pitch", rate=5.2, depth=14, delay=0.25, fade=0.3),),
    vel_amp=0.4,
    mono=True,
    glide=0.06,
    chorus=0.15,
    level=-20.4,
    description="A singing saw lead that glides between notes: the tune in big, bright sections.",
)

SOFT_LEAD = Patch(
    "soft lead",
    (
        Osc("sine", 1.0),
        Osc("triangle", 0.35, octave=1),
        Osc("noise", 0.06, decay=0.08),
    ),
    amp=Env(0.03, 0.4, 0.85, 0.25),
    filter=Filter("lp", cutoff=3000, res=0.0, slope=12, keytrack=0.8),
    lfos=(Lfo("pitch", rate=4.8, depth=12, delay=0.3, fade=0.4),),
    vel_amp=0.4,
    mono=True,
    glide=0.05,
    chorus=0.2,
    level=-19.8,
    description="A breathy, flute-like sine lead: tunes in calm and lobby tracks.",
)

BRASS_STAB = Patch(
    "brass stab",
    (
        Osc("saw", 1.0, unison=3, spread=16, width=0.6),
        Osc("saw", 0.3, octave=-1),
    ),
    amp=Env(0.012, 0.4, 0.7, 0.18),
    filter=Filter("lp", cutoff=1250, res=0.12, slope=12, env=Env(0.035, 0.35, 0.4, 0.25), env_amount=2.4, keytrack=0.5, vel_amount=0.7),
    pitch_env=(-0.3, 0.03),
    vel_amp=0.5,
    chorus=0.2,
    mono_below=140,
    level=-20.4,
    description="Synth brass that blooms open on each hit: stabs, fanfares and heroic chords.",
)

ARP_SYNTH = Patch(
    "arp synth",
    (
        Osc("square", 0.7),
        Osc("saw", 0.6, cents=7),
    ),
    amp=Env(0.001, 0.25, 0.3, 0.08),
    filter=Filter("lp", cutoff=900, res=0.55, slope=12, env=Env(0.001, 0.13, 0.1, 0.1), env_amount=3.2, keytrack=0.6, vel_amount=0.6),
    vel_amp=0.5,
    retrig=True,
    chorus=0.2,
    mono_below=140,
    level=-19.5,
    description="A resonant, squelchy sequence voice: fast sixteenth-note arpeggios that drive a section.",
)

ALL = {p.name: p for p in (PLUCK, WARM_KEYS, SUPERSAW_PAD, SOFT_PAD, SUB_BASS, PUNCHY_BASS, ROUND_BASS, FM_BELL, MALLET, CHIP_LEAD, BRIGHT_LEAD, SOFT_LEAD, BRASS_STAB, ARP_SYNTH)}
