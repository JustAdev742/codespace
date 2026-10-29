"""Hear and measure the synth patches, the drum kits and the transitions. Nothing here ships.

    python showcase.py                  # a 24-second piece using all of them, mixed like a track
    python showcase.py --audition       # every patch, kit voice and transition on its own
    python showcase.py --out /tmp/x

The showcase is twelve bars in D major at 120 BPM, mixed through the same
mixer, reverb and master chain as the tracks:

- Bars 1-4, lanterns waking: soft pad, pluck arpeggio, FM bell tune, sub bass and
  the lantern kit, swelling into
- bars 5-8, the festival: an impact, supersaw pad, punchy bass, bright lead, brass
  stabs and the festival kit, then a sweep and a downlifter into
- bars 9-12, the arcade: warm keys, chip lead, arp synth, mallet, round bass and
  the arcade kit, with a tom fill and a riser back to the top.

It writes showcase.wav, showcase.mp3, a spectrogram and the analysis. The
audition writes a clip and a spectrogram sheet per family, and a table of the
numbers used to tune them (audition.md): each patch's loudness beside the
soundfont preset it would replace, each drum's beside the room kit's, the loss
on a laptop speaker, spectral centroid, energy by band, the ghost-to-accent
range, and how far below the signal any aliasing sits. Both go into
ludora-audio-showcase/ in $LUDORA_AUDIO_OUT, or in the system's temporary
directory, unless --out says otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from ludora_audio import analysis, dsp, instruments, kit, patches, transitions
from ludora_audio.engine import bl_wave
from ludora_audio.mixer import mix_song
from ludora_audio.notation import DRUM, Instrument, Mix, Note, Part, Song, drums, melody, midi
from ludora_audio.render import SR, render_part
from ludora_audio.theory import arp, bass_line, comp, pads

# Like analyze.py: $LUDORA_AUDIO_OUT if set, otherwise the system's temporary directory. Never the repository.
DEFAULT_OUT = Path(os.environ.get("LUDORA_AUDIO_OUT") or tempfile.gettempdir()) / "ludora-audio-showcase"

PROGRESSION = [
    "D", "Bm7", "Gmaj7", "A",
    "D", "A/C#", "Bm", "G",
    "Em7", "G", "Asus4", "A7",
]

BELL = "f#5:4 a5:2 d6:2 c#6:4 a5:4 | b5:6 a5:2 f#5:8 | d5:4 f#5:2 b5:2 a5:4 g5:2 f#5:2 | e5:8 r:8"
LEAD = "a5:3 a5:3 b5:2 d6:4 e6:4 | c#6:3 b5:3 a5:2 e5:8 | f#5:3 a5:3 d6:2 c#6:4 b5:4 | b5:4 a5:4 g5:2 f#5:2 g5:4"
CHIP = "e5:2 g5:2 b5:2 e6:2 d6:2 b5:2 g5:4 | g5:2 b5:2 d6:2 g6:2 f#6:4 d6:4 | a5:2 d6:2 e6:2 a6:2 g6:4 e6:4 | c#6:2 e6:2 g6:2 a6:6 r:4"
STABS = "r:4 [f#4,a4,d5]:2 r:2 [f#4,a4,d5]:2 r:6 | r:4 [e4,a4,c#5]:2 r:2 [e4,a4,c#5]:2 r:6 | r:4 [f#4,b4,d5]:2 r:2 [f#4,b4,d5]:2 r:6 | r:4 [g4,b4,d5]:2 r:2 [d5,g5,b5]:4 r:4"


def _drums() -> tuple[list[Note], list[Note], list[Note]]:
    soft, festival, arcade = [], [], []
    for bar in range(4):
        t = bar * 4
        soft += drums({"kick": "x.......x.......", "rim": "....x.......x...", "shaker": "oxoxoxoxoxoxoxox"}, t, vel=80)
    soft += drums({"chime": "x..............."}, 0, vel=90)
    for bar in range(4, 8):
        t = bar * 4
        groove = {"kick": "X...x...X...x...", "clap": "....X.......X...", "hat": "..x...x...x...x.", "pedal": "o.o.o.o.o.o.o.o.", "tamb": "....x.......x..."}
        if bar == 7:
            groove = {"kick": "X...x...X.x.x...", "clap": "....X.......X...", "hat": "..x...x.........", "tom_hi": "........xx......", "tom_mid": "..........xx....", "tom_lo": "............xxXX"}
        else:
            groove["open"] = "..............x."
        festival += drums(groove, t, vel=96)
    festival += drums({"crash": "X...............", "jingle": "x..............."}, 16, vel=100)
    for bar in range(8, 12):
        t = bar * 4
        groove = {"kick": "X..x..x.X..x....", "snare": "....X.......X...", "hat": "xxxxxxxxxxxxxxxx", "cowbell": "x.....x.....x..."}
        if bar == 11:
            groove = {"kick": "X..x..x.X.......", "snare": "....X...xoxoxxXX", "hat": "x.x.x.x........."}
        arcade += drums(groove, t, vel=94)
    arcade += drums({"crash": "X...............", "agogo": "x.......x......."}, 32, vel=96)
    return soft, festival, arcade


def song() -> Song:
    soft_kit, festival_kit, arcade_kit = _drums()
    intro, drop, breakdown = PROGRESSION[:4], PROGRESSION[4:8], PROGRESSION[8:]
    parts = [
        # Bars 1-4.
        Part("soft pad", patches.SOFT_PAD, pads(intro, 57, 72, size=4, vel=70), Mix(gain_db=-4, reverb=0.3, highpass=150)),
        Part("pluck", patches.PLUCK, arp(intro, 62, 81, step=0.5, pattern=[0, 2, 1, 3, 2, 1, 3, 2], vel=88), Mix(gain_db=-3, pan=-0.25, reverb=0.2, delay=0.18)),
        Part("bell", patches.FM_BELL, melody(BELL, 0, vel=92), Mix(gain_db=-0.5, pan=0.2, reverb=0.35, delay=0.12)),
        Part("sub", patches.SUB_BASS, bass_line(intro, [(0, 8, "R"), (8, 8, "R")], octave_note=38, vel=96), Mix(gain_db=-2.5, reverb=0.0, duck=0.2)),
        Part("lantern kit", kit.KIT_LANTERN, soft_kit, Mix(gain_db=-3.5, reverb=0.12)),
        Part("swell", transitions.REVERSE_SWELL, [transitions.into(4, beats=4, pitch="d4", vel=90)], Mix(gain_db=-6, reverb=0.25)),
        Part("riser", transitions.RISER, [transitions.into(4, beats=8, pitch="d4", vel=90)], Mix(gain_db=-6, reverb=0.3)),
        # Bars 5-8.
        Part("impact", transitions.IMPACT, [transitions.at(4, beats=4, pitch="d1", vel=100)], Mix(gain_db=-5, reverb=0.15)),
        Part("supersaw", patches.SUPERSAW_PAD, [Note(n.start + 16, n.dur, n.pitch, n.vel) for n in pads(drop, 62, 76, size=4, vel=80)], Mix(gain_db=-6.5, reverb=0.25, highpass=180, duck=0.35)),
        Part("punchy bass", patches.PUNCHY_BASS, [Note(n.start + 16, n.dur, n.pitch, n.vel) for n in bass_line(drop, [(0, 2, "R"), (2, 2, "R"), (4, 2, "8"), (6, 2, "R"), (8, 2, "R"), (10, 2, "5"), (12, 2, "8"), (14, 2, "R")], octave_note=38, vel=100)], Mix(gain_db=-1, reverb=0.0, duck=0.4)),
        Part("lead", patches.BRIGHT_LEAD, melody(LEAD, 16, vel=96, legato=1.0), Mix(gain_db=-2, pan=0.05, reverb=0.2, delay=0.15)),
        Part("brass", patches.BRASS_STAB, melody(STABS, 16, vel=100, legato=0.9), Mix(gain_db=-3.5, pan=-0.15, reverb=0.2)),
        Part("festival kit", kit.KIT_FESTIVAL, festival_kit, Mix(gain_db=-4.5, reverb=0.08)),
        Part("sweep", transitions.SWEEP_UP, [transitions.into(8, beats=4, vel=80)], Mix(gain_db=-4.5, reverb=0.3)),
        Part("downlifter", transitions.DOWNLIFTER, [transitions.at(8, beats=4, pitch="d4", vel=90)], Mix(gain_db=-6, reverb=0.3)),
        # Bars 9-12.
        Part("keys", patches.WARM_KEYS, [Note(n.start + 32, n.dur, n.pitch, n.vel) for n in comp(breakdown, 55, 72, steps=[0, 6, 10], length=0.9, size=4, vel=86)], Mix(gain_db=-7, pan=-0.2, reverb=0.25, highpass=120)),
        Part("chip", patches.CHIP_LEAD, melody(CHIP, 32, vel=96, legato=0.9), Mix(gain_db=-2, pan=0.15, reverb=0.18, delay=0.2)),
        Part("arp", patches.ARP_SYNTH, [Note(n.start + 32, n.dur, n.pitch, n.vel) for n in arp(breakdown, 62, 79, step=0.25, pattern=[0, 1, 2, 3, 2, 1], vel=84, gate=0.6)], Mix(gain_db=-2.5, pan=0.3, reverb=0.15, highpass=200, duck=0.3)),
        Part("mallet", patches.MALLET, melody("r:8 b5:2 a5:2 g5:4 | r:8 d6:2 b5:2 a5:4 | r:8 e6:2 c#6:2 a5:4 | r:8 g5:2 a5:2 c#6:4", 32, vel=90), Mix(gain_db=-2.5, pan=-0.35, reverb=0.3)),
        Part("round bass", patches.ROUND_BASS, [Note(n.start + 32, n.dur, n.pitch, n.vel) for n in bass_line(breakdown, [(0, 3, "R"), (3, 3, "R"), (6, 2, "5"), (8, 4, "R"), (12, 4, "8")], octave_note=40, vel=100)], Mix(gain_db=-1, reverb=0.0, duck=0.3)),
        Part("arcade kit", kit.KIT_ARCADE, arcade_kit, Mix(gain_db=-4, reverb=0.08)),
        Part("riser 2", transitions.RISER, [transitions.into(12, beats=4, pitch="a3", vel=80)], Mix(gain_db=-4, reverb=0.3)),
    ]
    return Song(id="showcase", title="Showcase", bpm=120, bars=12, parts=parts, reverb_seconds=1.7, target_lufs=-16.0)


def encode_mp3(audio: np.ndarray, path: Path, quality: int = 2) -> None:
    wav = path.with_suffix(".tmp.wav")
    sf.write(wav, audio, SR, subtype="FLOAT")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", str(quality), str(path)], check=True)
    wav.unlink()


def showcase(out: Path) -> None:
    s = song()
    loop = mix_song(s)
    a, b = int(round(loop.loop_start * SR)), int(round(loop.loop_end * SR))
    audio = loop.audio[a:b]
    sf.write(out / "showcase.wav", audio, SR, subtype="PCM_16")
    encode_mp3(audio, out / "showcase.mp3")
    m = analysis.measure(loop.audio, (loop.loop_start, loop.loop_end), music=True)
    m["flags"] = analysis.flags(m)
    m["stems_lufs"] = loop.stems_lufs
    bar = 60 / s.bpm * 4
    ticks = [(loop.loop_start + k * bar, str(k + 1)) for k in range(s.bars + 1)]
    sub = f"{m['lufs']} LUFS  TP {m['true_peak']}  LRA {m['lra_lu']}  WIDTH {m['width']}%  CENTROID {m['centroid_hz']} HZ  SUB+LOW {m['bands']['sub'] + m['bands']['low']:.0f}%"
    analysis.write_png(out / "showcase.png", analysis.spectrogram(loop.audio, "SHOWCASE: PATCHES, KITS, TRANSITIONS", sub, marks=[loop.loop_start, loop.loop_end], ticks=ticks))
    (out / "showcase.json").write_text(json.dumps(m, indent=1))
    print(json.dumps({k: v for k, v in m.items() if k != "stems_lufs"}, indent=None))
    print("stems (LUFS in the mix):", ", ".join(f"{k} {v}" for k, v in sorted(loop.stems_lufs.items(), key=lambda kv: -kv[1])))
    print(f"wrote {out}/showcase.wav, showcase.mp3, showcase.png, showcase.json")


# --- Audition -----------------------------------------------------------------

CHORDS = [["d4", "f#4", "a4"], ["b3", "d4", "f#4", "a4"], ["g3", "b3", "d4", "f#4"], ["a3", "c#4", "e4", "a4"]]
TUNE = "d5:2 f#5:2 a5:2 d6:2 c#6:4 a5:4 | b5:2 a5:2 f#5:2 e5:2 d5:8 | a5:2 d6:2 f#6:2 a6:2 g6:4 e6:4 | d7:4 a6:4 f#6:4 d6:4"
BASS = "d2:2 d2:2 d3:2 d2:2 a1:2 a1:2 a2:2 a1:2 | b1:2 b1:2 b2:2 b1:2 g1:4 a1:4"
ARP = "d4:1 f#4:1 a4:1 d5:1 f#5:1 a5:1 d6:1 a5:1 f#5:1 d5:1 a4:1 f#4:1 d4:1 f#4:1 a4:1 d5:1 | b3:1 d4:1 f#4:1 b4:1 d5:1 f#5:1 b5:1 f#5:1 d5:1 b4:1 f#4:1 d4:1 b3:1 d4:1 f#4:1 b4:1"

ROLE = {
    "pluck": "arp", "arp synth": "arp", "warm keys": "chords", "supersaw pad": "chords", "soft pad": "chords", "brass stab": "chords",
    "sub bass": "bass", "punchy bass": "bass", "round bass": "bass", "fm bell": "tune", "mallet": "tune", "chip lead": "tune", "bright lead": "tune", "soft lead": "tune",
}

# The soundfont preset each patch would most often replace, to check their levels match.
PRESET = {
    "pluck": instruments.MARIMBA, "warm keys": instruments.EPIANO, "supersaw pad": instruments.POLYSYNTH, "soft pad": instruments.WARM_PAD,
    "sub bass": instruments.SYNTH_BASS, "punchy bass": instruments.SYNTH_BASS_2, "round bass": instruments.CELLI_PIZZICATO, "fm bell": instruments.VIBRAPHONE,
    "mallet": instruments.MARIMBA, "chip lead": instruments.SQUARE_LEAD, "bright lead": instruments.SAW_LEAD, "soft lead": instruments.FLUTE,
    "brass stab": instruments.SYNTH_BRASS, "arp synth": instruments.SAW_LEAD,
}
PRESET_NAME = {id(v): k for k, v in vars(instruments).items() if isinstance(v, Instrument)}


def phrase(role: str) -> list[Note]:
    if role == "chords":
        out = []
        for i, ch in enumerate(CHORDS):
            out += [Note(i * 4, 3.8, midi(p), 92) for p in ch]
        return out
    if role == "bass":
        return melody(BASS, 0, vel=100, legato=0.85)
    if role == "arp":
        return melody(ARP, 0, vel=92, legato=0.6)
    return melody(TUNE, 0, vel=96, legato=0.95)


def alias_floor(wave: str, f0: float = 3520.0) -> float:
    """Energy away from the harmonics of a steady high note, in dB below the total (lower is cleaner)."""
    n = SR
    x = bl_wave(wave, np.full(n, f0), 0.0)
    spec = np.abs(np.fft.rfft(x * np.blackman(n))) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    near = np.zeros_like(f, dtype=bool)
    for k in range(1, int(SR / 2 / f0) + 1):
        near |= np.abs(f - k * f0) < 12
    return float(10 * np.log10(spec[~near].sum() / spec.sum() + 1e-30))


def note_and_phrase(instrument, role: str) -> tuple[np.ndarray, np.ndarray]:
    """A one-second note at velocity 100 (C4, or C2 for a bass) and the role's phrase, in one render at 120 BPM."""
    pitch = 36 if role == "bass" else 60
    notes = [Note(0, 2, pitch, 100)] + [Note(n.start + 8, n.dur, n.pitch, n.vel) for n in phrase(role)]
    audio = render_part(Part("audition", instrument, notes), 120, 24)
    return audio[: 4 * SR], audio[4 * SR : 13 * SR]


def lufs_or_dash(audio: np.ndarray) -> str:
    v = dsp.lufs(audio)
    return f"{v:.1f}" if v > -70 else "-"


def momentary(audio: np.ndarray) -> float:
    """The loudest 400 ms (EBU momentary loudness), which is how loud a drum hit sounds; a lone hit's
    integrated loudness depends on how long its tail stays above the gate."""
    return float(analysis.short_term(np.pad(audio, ((0, SR), (0, 0))), window=0.4, hop=0.01).max())


def audition(out: Path) -> None:
    clips = out / "audition"
    clips.mkdir(parents=True, exist_ok=True)
    rows = [
        "# Audition",
        "",
        "## Patches",
        "",
        "Loudness of a one-second note at velocity 100 and of a phrase, beside the soundfont preset the patch would most often replace, playing the same notes.",
        "",
        "| Patch | Preset | 1 s note LUFS (patch / preset) | Phrase LUFS (patch / preset) | TP | Small spk | Centroid | Sub | Low | LowMid | Mid | Pres | Air | Width | Lows mono |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    thumbs = []
    for name, patch in patches.ALL.items():
        one, audio = note_and_phrase(patch, ROLE[name])
        sf_one, sf_audio = note_and_phrase(PRESET[name], ROLE[name])
        m = analysis.measure(audio, music=False)
        b = m["bands"]
        rows.append(
            f"| {name} | {PRESET_NAME[id(PRESET[name])]} | {lufs_or_dash(one)} / {lufs_or_dash(sf_one)} | {m['lufs']} / {lufs_or_dash(sf_audio)} | {m['true_peak']} | {m['small_speaker_db']} | {m['centroid_hz']} | {b['sub']} | {b['low']} | {b['low-mid']} | {b['mid']} | {b['presence']} | {b['air']} | {m['width']} | {'yes' if m['lows_mono'] else 'no'} |"
        )
        encode_mp3(dsp.normalize_peak(audio, -3), clips / f"patch-{name.replace(' ', '-')}.mp3")
        thumbs.append(analysis.spectrogram(audio, name, width=520, height=150, small=True))
        analysis.write_png(clips / f"patch-{name.replace(' ', '-')}.png", analysis.spectrogram(audio, name, f"{m['lufs']} LUFS  CENTROID {m['centroid_hz']} HZ", width=900, height=260, ticks=[(k * 0.5, f"{k * 0.5:g}") for k in range(18)]))
    analysis.write_png(out / "patches-sheet.png", analysis.sheet(thumbs, 2))
    rows += ["", "Aliasing: energy away from the harmonics of a steady note, in dB below the total (A1, A3, A5, A7):", ""]
    for wave in ("saw", "square", "triangle"):
        rows.append(f"- {wave}: " + ", ".join(f"{alias_floor(wave, f):.0f}" for f in (55.0, 220.0, 880.0, 3520.0)))
    # Kit voices at four velocities, one per layer; and one hit at velocity 100 beside the soundfont's room kit.
    lanes = list(DRUM.items())
    room = render_part(Part("room", instruments.KIT_ROOM, [Note(k * 4.0, 0.2, pitch, 100) for k, (_, pitch) in enumerate(lanes)]), 60, 4 * len(lanes))
    rows += [
        "",
        "## Kit voices",
        "",
        "Each lane at velocities 40, 70, 100 and 127 (the four layers), festival kit. Momentary loudness (the loudest 400 ms) of one hit at velocity 100, beside the soundfont's room kit (KIT_ROOM); a ghost note `o` against an accent `X` at the same lane velocity.",
        "",
        "| Lane | Momentary LUFS at 100 (festival / room kit) | Ghost o / accent X (dB) | Small spk | Centroid | Sub | Low | LowMid | Mid | Pres | Air |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    thumbs = []
    for k, (lane, pitch) in enumerate(lanes):
        spacing = 1.5 if lane in ("crash", "crash2", "ride", "bell", "chime", "triangle", "open", "kick2") else 0.6
        notes = [Note(j * spacing, 0.2, pitch, v) for j, v in enumerate((40, 70, 100, 127))]
        audio = kit.KIT_FESTIVAL._render([(n.start, n.dur, n.pitch, n.vel) for n in notes], 60, 4 * spacing + 1, 0).astype(np.float32)
        one = kit.KIT_FESTIVAL._render([(0.0, 0.2, pitch, 100)], 60, 1, 0).astype(np.float32)
        # drums() makes a ghost note `o` 40 under the lane's velocity and an accent `X` 22 over it: at 96, velocities 56 and 118.
        ghost = kit.KIT_FESTIVAL._render([(0.0, 0.2, pitch, 56)], 60, 1, 0).astype(np.float32)
        accent = kit.KIT_FESTIVAL._render([(0.0, 0.2, pitch, 118)], 60, 1, 0).astype(np.float32)
        m = analysis.measure(one, music=False)
        b = m["bands"]
        sf_hit = room[k * 4 * SR : (k + 1) * 4 * SR]
        sf_level = f"{momentary(sf_hit):.1f}" if dsp.lufs(sf_hit) > -70 else "-"
        rows.append(f"| {lane} | {momentary(one):.1f} / {sf_level} | {momentary(ghost) - momentary(accent):.1f} | {m['small_speaker_db']} | {m['centroid_hz']} | {b['sub']} | {b['low']} | {b['low-mid']} | {b['mid']} | {b['presence']} | {b['air']} |")
        thumbs.append(analysis.spectrogram(audio, lane, width=300, height=100, small=True))
        encode_mp3(dsp.normalize_peak(audio, -3), clips / f"kit-{lane}.mp3")
    analysis.write_png(out / "kit-sheet.png", analysis.sheet(thumbs, 4))
    # The three kits on one groove.
    groove = []
    for bar in range(2):
        groove += drums({"kick": "X...x...X...x...", "snare": "....X.......X..o", "hat": "x.x.x.x.x.x.x.xo", "open": "..............x."}, bar * 4, vel=96)
    groove += drums({"crash": "X..............."}, 0, vel=100)
    rows += ["", "One two-bar groove (kick, snare, hats, an open hat and a crash) at 110 BPM:", ""]
    for k in (kit.KIT_FESTIVAL, kit.KIT_LANTERN, kit.KIT_ARCADE, instruments.KIT_ROOM):
        name = k.name if isinstance(k, kit.Kit) else "soundfont room kit"
        audio = render_part(Part(name, k, groove), 110, 8)
        rows.append(f"- {name}: {dsp.lufs(audio):.1f} LUFS")
        if isinstance(k, kit.Kit):
            encode_mp3(dsp.normalize_peak(audio, -3), clips / f"groove-{k.name}.mp3")
            analysis.write_png(clips / f"groove-{k.name}.png", analysis.spectrogram(audio, f"kit {k.name}", f"{dsp.lufs(audio):.1f} LUFS", width=900, height=260))
    # Transitions, two bars each at 120 BPM.
    thumbs = []
    for name, tr in (("riser", transitions.RISER), ("downlifter", transitions.DOWNLIFTER), ("impact", transitions.IMPACT), ("reverse swell", transitions.REVERSE_SWELL), ("sweep up", transitions.SWEEP_UP), ("sweep down", transitions.SWEEP_DOWN)):
        note = Note(0, 8, midi("d1" if name == "impact" else "d4"), 100)
        audio = render_part(Part(name, tr, [note]), 120, 8)
        thumbs.append(analysis.spectrogram(audio, name, width=520, height=150, small=True))
        encode_mp3(dsp.normalize_peak(audio, -3), clips / f"transition-{name.replace(' ', '-')}.mp3")
    analysis.write_png(out / "transitions-sheet.png", analysis.sheet(thumbs, 2))
    (out / "audition.md").write_text("\n".join(rows) + "\n")
    print("\n".join(rows))
    print(f"wrote {out}/audition.md, patches-sheet.png, kit-sheet.png, transitions-sheet.png and audition/")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--audition", action="store_true", help="every patch, kit voice and transition on its own")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"where to write (default {DEFAULT_OUT})")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if args.audition:
        audition(args.out)
    else:
        showcase(args.out)


if __name__ == "__main__":
    main()
