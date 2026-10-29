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

The build takes about 30 seconds when the render cache is warm, and about eight minutes from cold
on four cores (FluidSynth is the slow part).
The cache is `.cache/`; it is safe to delete. Rebuilding with no changes produces byte-identical
files.

## What is in here

| File | What it does |
|---|---|
| `ludora_audio/notation.py` | Notes, parts, mixes and songs. `melody("d5:4 e5:2 …")` writes a tune with lengths in sixteenths; `drums({...})` writes a step pattern. |
| `ludora_audio/theory.py` | Chords by name (`"F#m7"`), voice-leading for pads and comping, bass lines, arpeggios. |
| `ludora_audio/instruments.py` | The soundfont presets used. |
| `ludora_audio/engine.py` | The synthesiser: band-limited oscillators, unison, FM, noise, envelopes, a resonant filter, LFOs, glide. Renders patches, the kit and transitions, cached by content hash. |
| `ludora_audio/patches.py` | The named synth patches: plucks, keys, pads, basses, bells, leads, brass, arps. |
| `ludora_audio/kit.py` | A synthesised drum kit (three settings of it) that plays the `drums({...})` lanes. |
| `ludora_audio/transitions.py` | Risers, downlifters, impacts, reverse swells and filtered sweeps, placed at bar lines. |
| `ludora_audio/tracks/*.py` | One file per music track, each a `song()`. |
| `ludora_audio/sfx.py` | Every sound effect, and the loudness it is made to. |
| `ludora_audio/synth.py` | Sounds a soundfont lacks, made with numpy: whooshes, impacts, sparkles, coin showers, risers. |
| `ludora_audio/render.py` | Parts to MIDI to audio with FluidSynth (dry: its reverb and chorus off). Cached by the MIDI's hash. Hands patches, the kit and transitions to engine.py. |
| `ludora_audio/dsp.py` | EQ and compression (Spotify's pedalboard), the generated reverb, echo, ducking, a look-ahead limiter, loudness (pyloudnorm). |
| `ludora_audio/mixer.py` | A song's parts into a seamless loop. |
| `ludora_audio/analysis.py` | Measurements and spectrogram pictures, for analyze.py and showcase.py. |
| `build.py` | Everything into MP3s and the manifest. |
| `analyze.py` | Measures every shipped track and effect and draws their spectrograms. Writes outside the repository. |
| `showcase.py` | A short piece using the patches, kits and transitions, and an audition of each. Not shipped. |

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

## Synth patches

A part can play a synth patch instead of a soundfont preset. The notes and the `Mix` are the
same; only the instrument changes:

```python
from ..patches import PLUCK, SUB_BASS, SUPERSAW_PAD

Part("arp", PLUCK, arp(PROGRESSION, 62, 81, step=0.5), Mix(gain_db=-4, pan=-0.25, delay=0.18)),
Part("pad", SUPERSAW_PAD.tweak(cutoff=2400, release=2.0), pads(PROGRESSION, 62, 76), Mix(gain_db=-6, duck=0.35)),
Part("bass", SUB_BASS, bass_line(PROGRESSION, [(0, 8, "R"), (8, 8, "R")], octave_note=38), Mix(gain_db=-3, duck=0.2)),
```

Patches work in effects too (`sfx.py` renders parts at 60 BPM, so beats are seconds).

| Patch | What it sounds like, and where it fits |
|---|---|
| `PLUCK` | Bright and quick to decay: arpeggios and ostinatos that sparkle and leave no tail. |
| `WARM_KEYS` | An electric-piano-like FM key, round with a gentle bell on top: chords and comping. |
| `SUPERSAW_PAD` | A wide, shimmering stack of seven detuned saws that swells in: big choruses, the final stretch. |
| `SOFT_PAD` | Dark, warm and slow: a bed under quiet tracks that never draws the ear. |
| `SUB_BASS` | A round sine bass, with enough second and third harmonic to stay audible on laptop speakers. Mono. |
| `PUNCHY_BASS` | A filtered, driven saw bass with a snappy envelope: driving lines. Mono, glides between tied notes. |
| `ROUND_BASS` | A soft, plucked-sounding synth bass, for gentle tracks where a pizzicato bass is too thin. |
| `FM_BELL` | A glassy lantern bell with inharmonic partials, mellower and quieter up high: melodies over sparse beds, answers. |
| `MALLET` | A woody FM mallet, between marimba and kalimba: ostinatos and soft hooks. |
| `CHIP_LEAD` | A pulse-wave lead with a late vibrato: playful chiptune hooks. |
| `BRIGHT_LEAD` | A singing saw lead that glides between legato notes: the tune in big sections. |
| `SOFT_LEAD` | A breathy, flute-like sine lead: tunes in calm and lobby tracks. |
| `BRASS_STAB` | Synth brass that blooms open on each hit: stabs, fanfares, heroic chords. |
| `ARP_SYNTH` | A resonant, squelchy sequence voice: fast sixteenth-note arpeggios. |

Each patch is levelled against the soundfont preset it would most often replace (`PLUCK` and
`MARIMBA`, `WARM_KEYS` and `EPIANO`, `SUPERSAW_PAD` and `POLYSYNTH`, `SUB_BASS` and `SYNTH_BASS`,
and so on; `showcase.py --audition` lists them all). Playing the same phrase, the two measure
within about 1.3 dB, so swapping one for the other needs little change to the part's gain. The
exceptions: `ARP_SYNTH` is 3 dB louder than `SAW_LEAD` on short notes (and quieter on held ones),
and `ROUND_BASS` is level with `SYNTH_BASS` but 4 dB louder than the thin pizzicato it replaces.

The basses play on the note, never an octave under it, and keep harmonics between 150 and 600 Hz,
so they still read on the laptop and Chromebook speakers in a classroom, which play almost nothing
under 150 Hz. Through a 200 Hz highpass they lose 7 to 10 dB, close to a soundfont synth bass.

`tweak()` makes a variant. Besides any `Patch` field it takes `cutoff`, `res`, `env_amount` and
`keytrack` for the filter, and `attack`, `decay`, `sustain` and `release` for the amplitude:

```python
SUPERSAW_PAD.tweak(cutoff=1600, release=2.0)   # darker, with a longer tail
PLUCK.tweak(decay=0.9, level=-15.0)            # a longer pluck, a dB quieter
```

A new patch is a `Patch(name, oscs, amp=Env(...), filter=Filter(...), lfos=(Lfo(...),), ...)`;
`engine.py` documents every setting.

How the engine makes a note:

- **Oscillators:** saw, square, pulse, triangle, sine, noise and two-operator FM. Each reads a
  single-cycle table holding only the harmonics below 19 kHz for the highest pitch the note
  reaches, so nothing folds back however high it plays: the alias floor is under -98 dB at A1
  and under -130 dB at A7. A pulse is the difference of two saws, so its width can move. The FM
  index is capped so its sidebands stay under 19 kHz. Every wave's fundamental is in phase with a
  sine's, and a `retrig` patch starts all its oscillators at phase 0 on every note, so
  oscillators stacked on one pitch add up instead of partly cancelling.
- **Unison:** copies of an oscillator detuned over a spread in cents and panned across the
  field. Seven copies use the uneven supersaw spacing, so the beating never lines up.
- **Filter:** a state-variable filter (lowpass, bandpass or highpass; 12 or 24 dB per octave)
  whose cutoff follows an envelope, the note's pitch (key tracking), velocity and LFOs, every
  sample. The recursion runs as a chunked scan in numpy, with no Python loop per sample.
- **Envelopes:** ADSR for the amplitude and the filter. Velocity sets the level (`vel_amp`), the
  filter's opening (`vel_amount`) and the FM brightness (`index_vel`).
- **LFOs:** on pitch (vibrato with a delay and fade-in), cutoff, amplitude or pulse width; in
  Hz, or in beats with `sync`.
- **Key scaling:** an FM oscillator's index can fall as the notes rise (`key_scale`: it halves
  every 1/key_scale octaves above middle C) and a patch's level too (`key_level`, dB per octave),
  as a real bell or bar does, so bells and mallets stay sweet at the top of the range.
- **Voices:** polyphonic, up to `voices` at once (the oldest is cut past that). A key played
  again while it still sounds continues its voice, its envelopes restarting from where they are,
  so held chords that share notes do not dip. `mono` patches play one voice: an overlapping note
  is legato and glides (`glide` seconds); a later note retriggers from where the envelope is.
- **After the voices:** soft saturation (`drive`, cubic, so it barely aliases), a stereo chorus
  (only above 220 Hz), width, `mono_below` (lows made mono, zero phase) and a DC blocker.

Renders are cached in `.cache/` as `syn-*.wav`, keyed by the patch's settings, the notes, the
tempo and the source of `engine.py`, `kit.py` and `transitions.py`, so changing any of those
renders again and nothing else does. Random phases and noise come from seeded generators. A
rebuild gives the same bytes. From cold, 16 bars of a part take 0.3 seconds (the kit) to 10
seconds (four-note chords on the supersaw pad, the slowest), against a minute or two for a
soundfont part.

## The synthesised drum kit

`kit.py` has a drum kit made in numpy that plays the same `drums({...})` patterns as the
soundfont kits, with every lane name in `notation.DRUM`:

```python
from ..kit import KIT_FESTIVAL

Part("drums", KIT_FESTIVAL, _drums(), Mix(gain_db=-5, reverb=0.08, comp=(-16, 2.5))),
```

Three settings of it:

- `KIT_FESTIVAL`: modern and punchy, bright hats. Most tracks.
- `KIT_LANTERN`: a semitone lower, softer and rounder, darker hats, gentle transients. Calm and lobby.
- `KIT_ARCADE`: tight and electronic, a crisp snare, the kick a little louder. Battle and intense.

`Kit(name, tune=, decay=, tone=, punch=, levels=)` makes another: semitones, a decay multiplier,
a brightness multiplier, transient strength, and extra dB per lane.

Each drum is a transient and a body: the kick is a sine falling from about 200 to 52 Hz,
saturated so its harmonics reach small speakers, with a beater click, and 20 dB down in a fifth
of a second so its sub clears before the next beat; the snare two shell modes, short band-passed
wires (the mix's reverb gives it its room) and a crack; the hats and cymbals the 808's six
square waves at inharmonic ratios plus noise, band-limited, with the cymbal's brightness
decaying faster than its body. Toms, congas and bongos are tuned membranes with a pitch drop,
upper head modes and a slap; the bells, blocks, claves and triangle are inharmonic partials.

- **Velocity layers:** four (below 48, 48 to 81, 82 to 109, 110 and up). A soft hit is made
  darker, shorter and with less transient, not only quieter. A step pattern's ghost note `o`
  comes out 10 to 12 dB under an accent `X`.
- **Round robin:** each layer has four variations (a different noise, a hair of tuning and
  decay), picked by a seeded generator and never the same twice running, plus a small level
  variation per hit. Repeated hits are never identical, and every build is the same.
- **Choke:** an open hat is cut by the next closed or pedal hat.
- **Festive voices:** `jingle` (sleigh bells, the rattle of small bells settling) and `chime`
  (a bell tree falling from left to right) are new lanes, on GS notes 83 and 84. `agogo` is a
  sweet festival bell, `tamb` a jingling tambourine, `whistle` a trilling pea whistle.
- **Levels:** set against the soundfont's room kit, `KIT_ROOM`. At velocity 100 the kick,
  snares, clap, rim, toms, hats and crashes each have the same momentary loudness (the loudest
  400 ms) as the room kit's within half a dB, and the same energy, so a groove measures within
  about 1 dB of the room kit's (the long `kick2` is a dB fuller than its counterpart). A track
  can swap `KIT_ROOM` for `KIT_FESTIVAL` without changing its gain. The hand percussion, bells
  and blocks are within about 1.5 dB too, the claves and cabasa 2 to 3 dB under. The triangle,
  jingle and chime sit 3 to 4 dB under the soundfont's, which are very loud, and the whistle
  16 dB under it, on purpose: a classroom does not need a loud whistle.

The kit is a drum part to the mixer: its kicks drive `duck`, and it gets half the timing nudge.

## Transitions

`transitions.py` has sounds that move a song from one section to the next, each an
instrument played by a note. The note's length is the transition's length, its pitch tunes the
pitched part and its velocity sets its strength.

| Instrument | What it does |
|---|---|
| `RISER` | Noise through a resonant band and a detuned saw climbing together, opening, cut on the bar line. |
| `DOWNLIFTER` | A falling, darkening whoosh after a big moment. |
| `IMPACT` | A boom on the downbeat: a sub drop onto the note, a drum-like body two octaves up, a crack and a rumbling tail. |
| `REVERSE_SWELL` | A chord and a cymbal wash played backwards, swelling into the bar line. |
| `SWEEP_UP`, `SWEEP_DOWN` | Noise through a resonant filter rising or falling: a lighter lift, or a section winding down. |

`into(bar, beats)` makes a note that ends on a bar line (risers, swells, upward sweeps);
`at(bar, beats)` one that starts on it (impacts, downlifters). Bars count from 0:

```python
from ..transitions import IMPACT, RISER, at, into

Part("riser", RISER, [into(8, beats=8, pitch="f3")], Mix(gain_db=-8, reverb=0.3)),
Part("impact", IMPACT, [at(8, beats=4, pitch="f1")], Mix(gain_db=-6, reverb=0.15)),
```

Transitions are never nudged in time. A riser into bar 0 belongs at the end of the loop
(`into(16)` in a 16-bar song); the mixer's repeats carry it over the seam. `into()` refuses a note
that would start before the song does.

## Measuring the sound

```bash
python analyze.py                        # every shipped track and effect
python analyze.py --out /tmp/my-report   # somewhere else
python analyze.py path/to/sound.wav      # any files
```

It reads the MP3s the build shipped, so it measures what players hear, and reports for each:

- integrated loudness (LUFS) and true peak; crest factor; loudness range (LRA, music) and the
  peak-to-loudness ratio;
- the share of energy in six bands (sub 20-60 Hz, low 60-250, low-mid 250-800, mid 0.8-3k,
  presence 3-6k, air 6-20k), the spectral centroid and roll-off;
- stereo width (the side signal's share of the energy, overall and above 300 Hz, where stereo is
  heard; a mix's energy is mostly its mono bass) and left-right correlation;
- whether the lows under 120 Hz are mono, measured in the spectrum so a pad's fundamental just
  above 120 Hz does not leak in;
- how much quieter it gets folded down to mono, as on a classroom projector's single speaker
  (about 0 dB for a mono-safe mix, 3 dB for unrelated channels, more where they cancel);
- how much it loses on a laptop or Chromebook speaker (the energy under a 200 Hz highpass);
- the loop's length and its seam three ways: the waveform after the end against after the
  start; their spectra; and the step at the join;
- onsets per second; for effects, how long they take to start and how long they ring.

The speaker and mono measures compare K-weighted energy without BS.1770's gate, so they never go
the wrong way on a short effect.

It flags what looks wrong (a thin low end, muddy low-mids, harsh presence, a dull top, mono,
flat dynamics, a short loop, wide lows, weak on laptop speakers, phasey or cancelling in mono, a
true peak over -1 dBTP) and writes `report.md`, `report.json`, a spectrogram per sound (log
frequency, with a level strip, bar numbers and the loop points) and contact sheets of all of
them. They go into `ludora-audio-analysis/` in the folder `$LUDORA_AUDIO_OUT` names, or in the
system's temporary directory, unless `--out` says otherwise. Nothing it writes belongs in the
repository.

A loop only stays bit-exact through the MP3 when its length is a whole number of 576-sample
MP3 granules. Otherwise the encoder treats the end and the start differently and the waveform
seam reads about -15 dB. That is codec noise, not a click: the spectra match within a fraction
of a dB, and the step at the join is no bigger than the music's own movement. Above about 16 kHz
every track is silent: LAME's low-pass at the music's quality setting.

## The showcase

```bash
python showcase.py                  # a 24-second piece in D major
python showcase.py --audition       # every patch, kit voice and transition alone
python showcase.py --out /tmp/x     # somewhere else
```

The piece runs through a soft intro (soft pad, pluck, FM bell, sub bass, the lantern kit, a
reverse swell and a riser), a festival drop (an impact, supersaw pad, punchy bass, bright lead,
brass, the festival kit, a sweep and a downlifter) and an arcade section (warm keys, chip lead,
arp synth, mallet, round bass, the arcade kit, a tom fill and a riser back to the top), mixed
through the same mixer and master as the tracks. It writes the audio, its spectrogram and its
analysis, with each part's loudness in the mix.

The audition writes a clip per sound, contact sheets, and `audition.md` with the numbers the
patches and the kit were tuned by: each patch beside the soundfont preset it would replace
(loudness of a held note and of a phrase, small-speaker loss, bands), the oscillators' alias
floor, each drum lane's momentary loudness beside `KIT_ROOM`'s with its ghost-to-accent range,
and one groove on every kit. Both go into `ludora-audio-showcase/` under `$LUDORA_AUDIO_OUT` or
the temporary directory, like the analysis. None of it ships.

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
`web/src/assets/audio/CREDITS.md`, next to the files. The synth patches, the drum kit and the
transitions use no samples at all: every sound is computed here.
