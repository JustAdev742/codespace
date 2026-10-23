# Ludora's music and sound effects

Every track and effect in this folder was composed for Ludora. They were written as code in
`tools/audio/ludora_audio` (the scores in `tracks/`, the effects in `sfx.py`) and rendered
by `tools/audio/build.py`. No recordings, loops or sound packs from anywhere else are used.

| Track | File | Where it plays |
|---|---|---|
| Lanterns Waking | `music/lobby.mp3` | The lobby, while players arrive |
| Festival Run | `music/game.mp3` | Most games |
| Moonlit Study | `music/calm.mp3` | Thinking games (Confidence, Lantern Match, Word Scramble, Flashcard Study), and after a co-op game is lost |
| Night Market Bounce | `music/market.mp3` | Trading and party games |
| Spark Duel | `music/battle.mp3` | Races, duels, the Gloom Giant, tower defence |
| Final Stretch | `music/intense.mp3` | The last half minute or the last questions of a game |
| Lanterns Rise | `music/results.mp3` | The results, after the fanfare |

The instruments are samples from the MuseScore General soundfont, played through FluidSynth.
The reverb is generated in code. The soundfont is under the MIT licence, with some parts in
the public domain or under CC0:

```
MuseScore_General SoundFont (MIT, parts PD or CC0)

MuseScore Drumline (MDL) samples (CC0) by S. Christian Collins & Amir Oosman
Splendid Grand piano from AKAI S5000 (verified Public Domain)
Marching Cymbals: open crash samples from Versilian Community Sample Library
https://github.com/sgossner/VCSL (CC0) by Sam Gossner
Ensemble strings from Versilian Studios Chamber Orchestra (VSCO) 2.1.1
Community Edition (CC0) by Sam Gossner, Simon Dalzell, Elan Hickler/Soundemote
Adaptation for MuseScore_General Copyright © 2018-2021 S. Christian Collins

Fluid (R3) GM SoundFont (MIT), on which MuseScore General builds:
Copyright © 2000-2002, 2008 Frank Wen <getfrank@gmail.com>
Mono version Copyright © 2014-2017 Michael Cowgill
Temple Blocks instrument Copyright © 2002 Ethan Winer
Drumline Cymbals Copyright © 2016 Michael Schorsch

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```
