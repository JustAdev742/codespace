#!/usr/bin/env python3
"""Lay out a film's timeline from its recorded dialogue and mix the soundtrack.

    python films/scripts/mix.py <slug> [--timeline-only]

Reads   films/<slug>/script.mjs        beats, cast, prompted effects
        films/<slug>/audio/vo/*.mp3    one take per line (generate-audio.mjs)
        films/<slug>/audio/sfx/*.mp3   prompted effects
        films/<slug>/sound.py          the sound design: design(ctx)
Writes  films/<slug>/build/timeline.json   beat times, marks, per-frame mouth levels
        films/<slug>/build/mix.wav         stereo master
        films/<slug>/build/captions.srt    subtitles

Each line's length comes from its audio, so the timeline is whatever the
performances make it; the animation reads the same timeline.json.
"""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).parent))
import synth  # noqa: E402

SR = synth.SR
ROOT = Path(__file__).resolve().parent.parent


# ------------------------------------------------------------------ loading


def load_script(slug):
    code = "import('%s').then(m=>console.log(JSON.stringify(m.default)))" % (ROOT / slug / "script.mjs").as_uri()
    return json.loads(subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout)


def decode(path, af=None):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
    if af:
        cmd += ["-af", af]
    cmd += ["-f", "f32le", "-ac", "1", "-ar", str(SR), "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).astype(float)


def trim_silence(x, thresh_db=-42, pad=0.03):
    win = int(0.01 * SR)
    if len(x) < win * 2:
        return x
    rms = np.sqrt(signal.convolve(x**2, np.ones(win) / win, mode="same"))
    loud = np.where(rms > 10 ** (thresh_db / 20))[0]
    if len(loud) == 0:
        return x
    a, b = max(0, loud[0] - int(pad * SR)), min(len(x), loud[-1] + int(pad * 2 * SR))
    return synth.fade(x[a:b], 0.004, 0.02)


def level(x, target_db=-20.0):
    """Normalise speech to a target RMS measured over its loud parts."""
    win = int(0.05 * SR)
    if len(x) < win:
        return x
    frames = x[: len(x) // win * win].reshape(-1, win)
    rms = np.sqrt((frames**2).mean(axis=1))
    active = rms[rms > rms.max() * 0.15]
    cur = 20 * np.log10(np.sqrt((active**2).mean()) + 1e-9)
    return x * 10 ** ((target_db - cur) / 20)


# Voice treatments, applied at decode time by ffmpeg. Pitch moves use the
# resample trick (formants move too), which is what a creature voice wants.
def voice_filter(fx):
    def pitch(semitones):
        r = 2 ** (semitones / 12)
        return f"asetrate={SR}*{r:.5f},aresample={SR},atempo={1 / r:.5f}"

    return {
        None: None,
        "phone": "highpass=f=420,lowpass=f=3100,acompressor=threshold=-22dB:ratio=6:makeup=4",
        "deep": pitch(-2.2),
        "tiny": pitch(3.0),
    }[fx]


# ------------------------------------------------------------------ timeline


def build_timeline(film, vo):
    fps = film["fps"]
    t = 0.0
    beats, order = {}, []
    for b in film["beats"]:
        bid = b["id"]
        if "wait" in b:
            t0, t1 = t, t + b["wait"]
            t = t1
        else:
            dur = len(vo[bid]) / SR
            t0 = t + b.get("lead", 0.0) - b.get("over", 0.0)
            t1 = t0 + dur
            t = t1 + b.get("gap", 0.35)
        entry = {"t0": round(t0, 4), "t1": round(t1, 4)}
        if "who" in b:
            entry["who"] = b["who"]
            entry["say"] = b.get("say") or re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", "", b["text"])).strip()
        beats[bid] = entry
        order.append(bid)
        for name, off in (b.get("marks") or {}).items():
            beats[f"{bid}.{name}"] = {"t0": round(t0 + off, 4), "t1": round(t0 + off, 4)}
    duration = np.ceil(t * fps) / fps
    return {"fps": fps, "duration": float(duration), "frames": int(round(duration * fps)), "beats": beats, "order": order}


def mouth_tracks(film, tl, vo):
    """Per character, a 0..1 mouth level for every frame of the film."""
    fps, frames = tl["fps"], tl["frames"]
    hop = SR / fps
    tracks = {who: np.zeros(frames) for who in film["cast"]}
    for b in film["beats"]:
        if "who" not in b:
            continue
        x = vo[b["id"]]
        n = int(np.ceil(len(x) / hop))
        e = np.array([np.sqrt(np.mean(x[int(i * hop) : int((i + 1) * hop) + 1] ** 2) + 1e-12) for i in range(n)])
        e = np.clip(e / (np.percentile(e, 92) + 1e-9), 0, 1) ** 0.7
        f0 = int(round(tl["beats"][b["id"]]["t0"] * fps))
        seg = tracks[b["who"]][f0 : f0 + n]
        seg[:] = np.maximum(seg, e[: len(seg)])
    return {who: [round(float(v), 2) for v in tr] for who, tr in tracks.items()}


def write_srt(film, tl, path):
    def stamp(s):
        ms = int(round(s * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

    out, n = [], 0
    for bid in tl["order"]:
        b = tl["beats"][bid]
        if "who" not in b:
            continue
        n += 1
        out.append(f"{n}\n{stamp(b['t0'])} --> {stamp(max(b['t1'], b['t0'] + 0.7))}\n{b['who']}: {b['say']}\n")
    path.write_text("\n".join(out))


# ------------------------------------------------------------------ mixing


class Mix:
    """Three stereo buses. 'music' and 'bed' duck under the dialogue."""

    def __init__(self, slug, film, tl):
        self.slug, self.film, self.tl = slug, film, tl
        self.n = int(round((tl["duration"] + 0.5) * SR))
        self.bus = {k: np.zeros((self.n, 2)) for k in ("vo", "sfx", "music", "bed")}
        self.synth = synth
        self.dur = tl["duration"]

    # times -----------------------------------------------------------
    def T(self, key, off=0.0):
        return self.tl["beats"][key]["t0"] + off

    def E(self, key, off=0.0):
        return self.tl["beats"][key]["t1"] + off

    def D(self, key):
        b = self.tl["beats"][key]
        return b["t1"] - b["t0"]

    # audio -----------------------------------------------------------
    def add(self, t, x, gain=1.0, pan=0.0, bus="sfx"):
        if t < 0:
            x, t = x[int(-t * SR) :], 0.0
        st = synth.stereo(np.asarray(x, dtype=float), pan)
        i = int(round(t * SR))
        st = st[: max(0, self.n - i)]
        self.bus[bus][i : i + len(st)] += st * gain

    def clip(self, name, af=None):
        """A prompted effect from audio/sfx, trimmed of silence."""
        return trim_silence(decode(ROOT / self.slug / "audio" / "sfx" / f"{name}.mp3", af), -50, 0.01)

    def has_clip(self, name):
        return (ROOT / self.slug / "audio" / "sfx" / f"{name}.mp3").exists()

    def render(self):
        vo = self.bus["vo"]
        env = np.abs(vo).max(axis=1)
        k = int(0.08 * SR)
        env = signal.convolve(env, np.ones(k) / k, mode="same")
        env = signal.sosfilt(signal.butter(1, 2.5, fs=SR, output="sos"), env)
        talk = np.clip(env / 0.03, 0, 1)[:, None]
        out = vo + self.bus["sfx"] + self.bus["music"] * (1 - 0.55 * talk) + self.bus["bed"] * (1 - 0.4 * talk)
        out = np.tanh(out * 1.15) / 1.15  # gentle limiter
        peak = np.max(np.abs(out))
        if peak > 0.97:
            out *= 0.97 / peak
        return out[: int(round(self.dur * SR))]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    slug = args[0]
    film = load_script(slug)
    build = ROOT / slug / "build"
    build.mkdir(exist_ok=True)

    vo = {}
    for b in film["beats"]:
        if "who" not in b:
            continue
        cast = film["cast"][b["who"]]
        src = ROOT / slug / "audio" / "vo" / f"{b.get('clip', b['id'])}.mp3"
        x = trim_silence(decode(src, voice_filter(cast.get("fx"))))
        if "trim" in b:
            x = synth.fade(x[: int(b["trim"] * SR)], 0.003, 0.012)
        vo[b["id"]] = level(x, cast.get("level", -20.0)) * b.get("vol", 1.0)

    tl = build_timeline(film, vo)
    tl["mouth"] = mouth_tracks(film, tl, vo)
    tl["title"] = film["title"]
    (build / "timeline.json").write_text(json.dumps(tl, separators=(",", ":")))
    write_srt(film, tl, build / "captions.srt")
    speech = sum(len(v) for v in vo.values()) / SR
    print(f"{slug}: {tl['duration']:.1f}s ({tl['duration'] / 60:.2f} min), {speech:.0f}s of speech, {tl['frames']} frames")
    if "--timeline-only" in sys.argv:
        return

    mix = Mix(slug, film, tl)
    for b in film["beats"]:
        if "who" not in b:
            continue
        cast = film["cast"][b["who"]]
        mix.add(tl["beats"][b["id"]]["t0"], vo[b["id"]], pan=b.get("pan", cast.get("pan", 0.0)), bus="vo")

    spec = importlib.util.spec_from_file_location("sound", ROOT / slug / "sound.py")
    sound = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sound)
    sound.design(mix)

    out = mix.render()
    raw = build / "mix_raw.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", str(raw)],
        input=out.astype(np.float32).tobytes(),
        check=True,
    )
    # Static gain to -16 LUFS integrated (measured, not the dynamic loudnorm mode).
    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:print_format=json", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    measured = float(json.loads(probe[probe.rindex("{") :])["input_i"])
    gain = min(-16.0 - measured, 12.0)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89", "-ar", "48000", str(build / "mix.wav")],
        check=True,
    )
    raw.unlink()
    print(f"mix: {measured:.1f} LUFS in, {gain:+.1f} dB applied -> {build / 'mix.wav'}")


if __name__ == "__main__":
    main()
