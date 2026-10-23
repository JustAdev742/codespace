# Ludora's audio build

Ludora's music and sound effects are written here as code and rendered to MP3s for the web app.
Seven music loops and sixty effects, all composed for Ludora.

```bash
sudo apt install fluidsynth musescore-general-soundfont ffmpeg
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python build.py
```

The build writes:

- `web/src/assets/audio/music/*.mp3`: the loops.
- `web/src/assets/audio/sfx/*.mp3`: the effects.
- `web/src/lib/sound/assets.generated.ts`: the manifest the web player reads. It holds the file
  URLs (through Vite, so they are hashed), loop points, tempos and how each effect is played.

The build takes about 30 seconds when the render cache is warm, and several minutes from cold.
The cache is `.cache/`; it is safe to delete. Rebuilding with no changes produces byte-identical
files.

## What is in here

| File | What it does |
|---|---|
| `ludora_audio/notation.py` | Notes, parts, mixes and songs. `melody("d5:4 e5:2 …")` writes a tune with lengths in sixteenths; `drums({...})` writes a step pattern. |
| `ludora_audio/theory.py` | Chords by name (`"F#m7"`), voice-leading for pads and comping, bass lines, arpeggios. |
| `ludora_audio/instruments.py` | The soundfont presets used. |
| `ludora_audio/tracks/*.py` | One file per music track, each a `song()`. |
| `ludora_audio/sfx.py` | Every sound effect, and the loudness it is made to. |
| `ludora_audio/synth.py` | Sounds a soundfont lacks, made with numpy: whooshes, impacts, sparkles, coin showers, risers. |
| `ludora_audio/render.py` | Parts to MIDI to audio with FluidSynth (dry: its reverb and chorus off). Cached by the MIDI's hash. |
| `ludora_audio/dsp.py` | EQ and compression (Spotify's pedalboard), the generated reverb, echo, ducking, a look-ahead limiter, loudness (pyloudnorm). |
| `ludora_audio/mixer.py` | A song's parts into a seamless loop. |
| `build.py` | Everything into MP3s and the manifest. |

## How a track becomes a loop

Each part renders once, dry, and is laid down three times exactly one loop apart. It is then
processed with its EQ, compressor, stereo width, level and pan. Parts can also dip under the kick.
The parts are mixed with a shared reverb and echo, glued with a bus compressor and a limiter, and
normalised to the track's loudness. The middle repeat is cut out with half a second of music on
either side.

Because every repeat is identical to the sample, the audio after the loop's end is the same as
the audio after its start. Reverb tails from the end are already in the start. The web player
jumps from `loopEnd` to `loopStart` with no seam (the build reports the seam at about -130 dB),
and an MP3 decoder that shifts the file by a few milliseconds does not break it.

FluidSynth places notes on 64-sample blocks. Rendering three repeats in one pass would leave
each repeat slightly different, which is why each part renders once and is copied.

## Levels

Loudness is measured to ITU-R BS.1770, with the true peak under -1 dBTP. The levels:

- Music: -15.5 to -18 LUFS. The calm track is quietest and the final stretch loudest. The web
  mix plays music about 8 dB under the effects.
- Effects: by job.
  - Taps and selections: -25 LUFS.
  - Clock ticks: -23 LUFS.
  - Answer feedback: -16 to -20 LUFS.
  - Big moments: -13 LUFS (the fanfare, a jackpot, a mythic reveal).

`python build.py` prints every track's loudness, peak and seam, and the effects' total size.

## Adding a sound

- **An effect:** add it to `effects()` in `sfx.py`, then add its name to `EFFECTS` in
  `web/src/lib/sound/sfx.ts`. That file holds the synthesised version, which plays until the
  recording has loaded. Run the build. `samples.test.ts` fails if an effect has no file, or a
  file has no effect.
- **A track:** add a file to `tracks/`, add it to `TRACKS` in `build.py`, and give modes it in
  `MODE_MUSIC` (`web/src/features/room/music.ts`).

## Licence

The compositions and effects are Ludora's own. The instrument samples come from the MuseScore
General soundfont: MIT, with parts in the public domain or under CC0. The full notice is in
`web/src/assets/audio/CREDITS.md`, next to the files.
