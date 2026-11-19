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

## The second film: "What's new"

An 88-second film of everything added between 12 and 19 November 2026, shot on The Hills Grammar
School's copy (`SCHOOL_THEME=hills-grammar`) with every Glim in the school's uniform. It uses the same
camera, stage and synthesiser as the first film.

| Part | Where |
|---|---|
| Footage | `capture/updates.mjs`: the 3D home, a calm Classic game with the walkthrough (thirteen players, twelve of them small windows that really join in their own year's uniform), the Wallet, class rewards, a sale, the economy room, the school's pages, and the staff dashboard. |
| Timeline and scenes | `comp/updates.html`, `comp/src/updates.ts`, `comp/src/news/` (one file a section). `?only=guard,end` builds only those scenes. |
| Music and sound | `score/updates.py`, on `score/kit.py` (the synthesiser, split out of the first score, which still comes out bit for bit the same). |

The dashboard is filmed from its no-server demo (`os/demo`): the real pages, with a pretend server
moved on by hand (`window.ludoraDemo.script`) through a calm morning, a probe, password guessing, a
decoy port, a flood and the shield. The film says "A pretend attack on a demo server" on screen while
it runs. The alert text shown is what `alerts.compose` writes for those events.

```bash
# from apps/ludora, with Postgres running and the app built (npm run build)
#   1. the private Hills copy: port 8981, its own database, SCHOOL_THEME=hills-grammar (serve.sh in the scratch folder)
#   2. the dashboard demo: python3 os/demo/build.py OUT --standalone, served on port 8791
export FILM_OUT=/path/to/scratch/upd FILM_APP=http://127.0.0.1:8981
node tools/film/capture/updates.mjs                      # or: game economy wallet home school dash
npx vite --config tools/film/comp/vite.config.ts &       # port 5188
FILM_URL=http://127.0.0.1:5188/updates.html node tools/film/render.mjs --frames 300,900,2000
FILM_URL=http://127.0.0.1:5188/updates.html FILM_FRAMES=2640 FILM_NAME=ludora-whats-new FILM_SCORE=tools/film/score/updates.py tools/film/build.sh 3
```

What it claims, and where each claim is true: calm play and the walkthrough (D57), the 3D home (D56),
the navigation (D59), the Wallet, class rewards, sales, boosts and the economy manager (D58), the
school's copy (D56, D60), and Ludora OS (`docs/LUDORA-OS.md`). It gives no number for the self-check,
because the demo's list is shorter than a real server's.

Things worth knowing before shooting it again:

- The question's clock runs in real time on the server while two pages are filmed at about two
  seconds a frame, so the student answers within the first few frames and the class after. The timer
  on screen falls faster than it does in a classroom for that half second; nothing else is sped up.
- One scene failing does not stop the others, and the student's account is the same on every run, so
  a single scene can be shot again (`wallet` re-films only the Wallet).
- Do not edit `comp/src` while a render is running: the preview server reloads the page under it.
- To change one shot after a full render, render only its frames into the same folder
  (`render.mjs --from 1080 --to 1260 --out $FILM_OUT/frames`) and join them again with the `ffmpeg`
  line in `build.sh`. The sound was lowered by 3.6 dB when it was joined (to -14 LUFS, peaks under
  -2 dB); `build.sh` alone writes it louder than that.
- What was checked: every scene on contact sheets, 132 frames across the film. Nobody has listened
  to the score; its loudness was measured, not heard.
