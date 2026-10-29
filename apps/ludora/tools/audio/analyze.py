"""Measure Ludora's music and sound effects, and draw their spectrograms.

    python analyze.py                       # every shipped track and effect
    python analyze.py --out /tmp/audio-report
    python analyze.py some.wav other.mp3    # any files (a shipped track's name gets its loop points)

For every sound it reports integrated loudness (LUFS) and true peak, crest
factor, loudness range (music) and peak-to-loudness ratio; the share of energy
in six bands and the spectral centroid; stereo width and correlation, whether
the lows under 120 Hz are mono, and how much quieter it gets folded to mono;
how much it loses on a laptop speaker; the loop's length and seam; onsets per
second; and for effects how quickly they start and how long they ring. It flags
what looks wrong (a thin low end, mud, harshness, mono, a short loop, weak on
small speakers, cancelling in mono).

It writes report.md, report.json, a spectrogram PNG per sound and two contact
sheets (music-sheet.png, sfx-sheet.png) into --out: by default
ludora-audio-analysis/ in $LUDORA_AUDIO_OUT, or in the system's temporary
directory. Never the repository. It reads the MP3s the build shipped, so what
it measures is what players hear.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from ludora_audio import analysis
from ludora_audio.render import SR

HERE = Path(__file__).resolve().parent
WEB = HERE.parent.parent / "web"
ASSETS = WEB / "src" / "assets" / "audio"
MANIFEST = WEB / "src" / "lib" / "sound" / "assets.generated.ts"
# $LUDORA_AUDIO_OUT, if set, holds the reports of analyze.py and showcase.py; otherwise the system's temporary directory.
DEFAULT_OUT = Path(os.environ.get("LUDORA_AUDIO_OUT") or tempfile.gettempdir()) / "ludora-audio-analysis"


def manifest_tracks() -> dict[str, dict]:
    """Loop points, tempo and bars of each shipped track, from the generated manifest."""
    tracks = {}
    pattern = re.compile(r"^\s+(\w+): \{ url: \w+, title: (\"[^\"]*\"), bpm: ([\d.]+), beatsPerBar: (\d+), bars: (\d+), loopStart: ([\d.]+), loopEnd: ([\d.]+) \},$")
    for line in MANIFEST.read_text().splitlines():
        m = pattern.match(line)
        if m:
            tracks[m.group(1)] = {"title": json.loads(m.group(2)), "bpm": float(m.group(3)), "beats_per_bar": int(m.group(4)), "bars": int(m.group(5)), "loop": (float(m.group(6)), float(m.group(7)))}
    return tracks


def analyse(path: Path, out: Path, info: dict | None, music: bool) -> dict:
    x = analysis.load(path)
    loop = info["loop"] if info else None
    m = analysis.measure(x, loop, music=music)
    m["name"] = path.stem
    m["kind"] = "music" if music else "sfx"
    m["flags"] = analysis.flags(m, music=music)
    seconds = len(x) / SR
    if info:
        bar = 60.0 / info["bpm"] * info["beats_per_bar"]
        ticks = [(loop[0] + k * bar, str(k + 1)) for k in range(info["bars"] + 1) if k % 2 == 0]
        sub = f"{m['lufs']} LUFS  TP {m['true_peak']}  LRA {m.get('lra_lu', '-')}  WIDTH {m['width']}%  CENTROID {m['centroid_hz']} HZ  LOOP {m['loop_seconds']:.1f} S  BARS 1-{info['bars']}"
        img = analysis.spectrogram(x, f"{path.stem}: {info['title']}", sub, marks=list(loop), ticks=ticks)
    else:
        step = 0.1 if seconds < 1.5 else 0.5 if seconds < 6 else 2.0
        ticks = [(k * step, f"{k * step:g}") for k in range(int(seconds / step) + 1)]
        sub = f"{m['lufs']} LUFS  TP {m['true_peak']}  CREST {m['crest_db']}  CENTROID {m['centroid_hz']} HZ  {seconds:.2f} S"
        img = analysis.spectrogram(x, path.stem, sub, width=700 if seconds < 4 else 1100, height=240, ticks=ticks)
    analysis.write_png(out / "spectrograms" / f"{m['kind']}-{path.stem}.png", img)
    thumb = analysis.spectrogram(x, path.stem, width=260 if not music else 540, height=90 if not music else 120, small=True, marks=list(loop) if loop else None)
    return {"measure": m, "thumb": thumb}


def table(rows: list[dict], music: bool) -> list[str]:
    lines = []
    if music:
        lines.append("| Track | LUFS | TP | LRA | PLR | Crest | Small spk | Sub | Low | LowMid | Mid | Pres | Air | Centroid | Width (>300 Hz) | Corr | Mono loss | Lows mono | Loop s | Seam (wave / spectrum / jump) | Onsets/s |")
        lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for m in rows:
            b = m["bands"]
            seam = f"{m['seam_db']} / {m['seam_spectrum_db']} / {m['splice_jump_db']}" if "seam_db" in m else "-"
            lines.append(
                f"| {m['name']} | {m['lufs']} | {m['true_peak']} | {m.get('lra_lu', '-')} | {m['plr_db']} | {m['crest_db']} | {m['small_speaker_db']} | {b['sub']} | {b['low']} | {b['low-mid']} | {b['mid']} | {b['presence']} | {b['air']} | {m['centroid_hz']} | {m['width']} ({m['width_hi']}) | {m['correlation']} | {m['mono_loss_db']} | {'yes' if m['lows_mono'] else 'no'} ({m['low_side_db']} dB) | {m.get('loop_seconds', '-')} | {seam} | {m['onsets_per_s']} |"
            )
    else:
        lines.append("| Effect | s | LUFS | TP | Crest | Small spk | Sub | Low | LowMid | Mid | Pres | Air | Centroid | Width (>300 Hz) | Corr | Mono loss | Onsets/s | Start ms | Tail ms |")
        lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for m in rows:
            b = m["bands"]
            lines.append(
                f"| {m['name']} | {m['seconds']} | {m['lufs']} | {m['true_peak']} | {m['crest_db']} | {m['small_speaker_db']} | {b['sub']} | {b['low']} | {b['low-mid']} | {b['mid']} | {b['presence']} | {b['air']} | {m['centroid_hz']} | {m['width']} ({m['width_hi']}) | {m['correlation']} | {m['mono_loss_db']} | {m['onsets_per_s']} | {m['start_ms']} | {m['tail_ms']} |"
            )
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="*", type=Path, help="audio files to measure (default: every shipped track and effect)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"where the report and pictures go (default {DEFAULT_OUT})")
    args = ap.parse_args()
    out = args.out.resolve()
    if out.is_relative_to(HERE.parent.parent.parent.parent):
        print(f"note: {out} is inside the repository; the report is not meant to be committed", file=sys.stderr)
    (out / "spectrograms").mkdir(parents=True, exist_ok=True)
    tracks = manifest_tracks()
    if args.files:
        jobs = [(p, tracks.get(p.stem), p.stem in tracks) for p in args.files]
    else:
        names = list(tracks)
        jobs = [(ASSETS / "music" / f"{t}.mp3", tracks[t], True) for t in names]
        jobs += [(p, None, False) for p in sorted((ASSETS / "sfx").glob("*.mp3"))]
    with ProcessPoolExecutor() as pool:
        results = list(pool.map(analyse, [j[0] for j in jobs], [out] * len(jobs), [j[1] for j in jobs], [j[2] for j in jobs]))
    music = [r for r in results if r["measure"]["kind"] == "music"]
    effects = [r for r in results if r["measure"]["kind"] == "sfx"]
    if music:
        analysis.write_png(out / "music-sheet.png", analysis.sheet([r["thumb"] for r in music], 2))
    if effects:
        analysis.write_png(out / "sfx-sheet.png", analysis.sheet([r["thumb"] for r in effects], 5))
    report = ["# Ludora audio analysis", ""]
    for title, group, is_music in (("Music", music, True), ("Effects", effects, False)):
        if not group:
            continue
        rows = [r["measure"] for r in group]
        report += [f"## {title}", "", "Bands are each band's share of the energy, in percent: sub 20-60 Hz, low 60-250, low-mid 250-800, mid 0.8-3k, presence 3-6k, air 6-20k. Width is the side signal's share of the energy. Mono loss is how much quieter (dB) it is folded down to one speaker. Small spk is the loudness lost through a 200 Hz highpass, like a laptop or Chromebook speaker.", ""]
        report += table(rows, is_music)
        report += ["", "### Flags", ""]
        for m in rows:
            if m["flags"]:
                report.append(f"- **{m['name']}**: " + "; ".join(m["flags"]))
        report.append("")
    (out / "report.md").write_text("\n".join(report))
    (out / "report.json").write_text(json.dumps([r["measure"] for r in results], indent=1))
    for r in music:
        m = r["measure"]
        print(f"{m['name']:<9} {m['lufs']:>6} LUFS  TP {m['true_peak']:>5}  LRA {m.get('lra_lu', '-'):>4}  sub+low {m['bands']['sub'] + m['bands']['low']:5.1f}%  centroid {m['centroid_hz']:>5} Hz  width {m['width']:>4}% ({m['width_hi']:>4}% >300 Hz)  small speaker -{m['small_speaker_db']} dB  mono -{m['mono_loss_db']} dB  loop {m.get('loop_seconds', 0):5.1f} s  {'; '.join(m['flags'])}")
    if effects:
        flagged = sum(1 for r in effects if r["measure"]["flags"])
        print(f"{len(effects)} effects, {flagged} flagged")
    print(f"wrote {out}/report.md, report.json, music-sheet.png, sfx-sheet.png and spectrograms/")


if __name__ == "__main__":
    main()
