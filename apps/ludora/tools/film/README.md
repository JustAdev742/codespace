# The Ludora film

A 68-second trailer made from the real app. Nothing in this folder ships in the product, and it
shares nothing with `tools/trailer` (the earlier trailer).

## How it is made

1. **A private copy of Ludora** runs on this machine with its own empty database (never the live
   site), and the web app's dev server serves the 3D scene gallery.
2. **The camera** (`capture/`) films it with Playwright. Every filmed page runs on a clock the
   script owns: timers, animation frames and CSS animations all move one thirtieth of a second at
   a time, and a picture is taken after each step. So every shot is exactly 30 frames a second at
   full 1080p, however slowly this machine draws, and software-rendered 3D comes out smooth.
   - `scenes3d.mjs`: each 3D game, from the app's own scene gallery (`web/dev/three.html`).
   - `live.mjs`: a real game from lobby to podium on the big screen and a phone (thirteen players,
     twelve of them small windows that really join and answer), notes becoming questions, the
     modes gallery, My designs, classroom tools and the Game Maker.
   - `pages.mjs`: sharp stills of the app's pages (the slides use these too).
   Two things differ from the real site and are corrected in what is filmed: the "Dev" badge is
   hidden, and a lobby's "go to this address" shows the real site's address.
3. **The film** (`comp/`) is one Three.js stage laid out in screen pixels: the footage on cards,
   phones and a big screen; captions on a layer fixed to the camera; stage lights and confetti;
   and the game's own 3D Glims, built by the game's own code, as the cast. `window.film.render(n)`
   draws frame `n`; any frame can be drawn on its own, so several browsers render side by side.
4. **The music and sound** (`score/score.py`) are synthesised from arithmetic with numpy: no
   samples and no instruments from anywhere else. 120 beats a minute, cut to the picture's bars.
5. `build.sh` renders every frame, runs the score, and joins them with ffmpeg.

## Making it again

```bash
# from apps/ludora, with Postgres running and the app built (npm run build)
#   1. the private copy (see serve.sh in the scratch folder: port 8980, its own database)
#   2. LUDORA_API=http://127.0.0.1:8980 npx vite --port 5199 --strictPort   (in web/, for the 3D gallery)
node tools/film/capture/scenes3d.mjs
node tools/film/capture/live.mjs
node tools/film/capture/pages.mjs
npx vite --config tools/film/comp/vite.config.ts &     # the film's own page, port 5188
node tools/film/render.mjs --frames 250,700,1900       # a few frames, to look at
tools/film/build.sh 3                                  # everything, in three browsers
```

Footage, frames and the finished file go to `FILM_OUT` (a scratch folder outside the repository;
frames are large).

## Honest limits

- Nobody has listened to the score: it was balanced by measuring loudness and tone by section and
  by reading its spectrogram.
- The classmates in the game shots are real joined players driven by the script, not children.
- Rendering uses a software graphics driver here, so a full render takes a while.
