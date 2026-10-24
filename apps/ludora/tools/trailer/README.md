# The Ludora trailer

An 88-second trailer for schools. No Blender: Playwright plays real games against a local server and films the
projector and the phones; an HTML page composes the shots, with an illustrated classroom (28 students at their
desks, the real game on their projector) for the moments the room reacts; Chromium renders it frame by frame;
ffmpeg joins the frames to a score synthesized in Python.

| Folder | What it does |
|---|---|
| `capture/` | Films the footage. `rig.mts` registers a teacher, opens rooms and plays as eight named students. `cast.mts` records a page with the Chrome DevTools screencast and resamples it to 30 fps. |
| `comp/` | The composition. `trailer.js` draws any frame from its time alone (`window.renderFrame(t)`); `footage.js` says which frames of which shot each scene uses; `classroom.js` draws the illustrated classroom (students, desks, laptops and tablets, a teacher at the lectern) from the time and a cue (lean in, cheer, stand, team colours). |
| `score/` | `score.py`, the music: synth-pop in D major at 120 BPM (one bar = 2 s), every instrument synthesized, cut to the edit. `crowd.py`, the classroom: applause, cheering, an anticipating "ooh", a school bell, all synthesized. `cues.json`, the app's own sound effects laid over it. `spec.py` draws a spectrogram, for checking a render by eye. |
| `sheet.py`, `tsheet.py` | Contact sheets of a shot or of rendered frames, for picking in-points and reviewing a render. |

Footage, frames and the finished video are large and stay out of git (`.gitignore`).

## Rebuilding it

Everything runs from `apps/ludora`. Build first (`npm run build`), then start a development server on port 8990
with its own database. Development is needed: the Lantern shot uses the staff QA scenarios, which only exist
outside production.

```bash
createdb ludora_e2e_trailer   # or any empty database; migrations run on start
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ludora_e2e_trailer APP_ENV=development \
  HOST=127.0.0.1 PORT=8990 PUBLIC_ORIGIN=http://127.0.0.1:8990 WEB_DIST=$PWD/web/dist node server/dist/index.js
```

The browser maps `ludora.local` to that server, so the lobby shows a neutral address. Set `CHROMIUM_PATH` if
Playwright's own Chromium is not installed.

```bash
cd tools/trailer/capture
npx tsx classic.mts ../footage/classic   # a whole Classic game: lobby, questions, podium
npx tsx modes.mts ../footage/modes       # every class mode, projector and phone
npx tsx extras.mts ../footage/extras     # a Lantern opening, the collection, the teacher's pages
npx tsx school.mts ../footage/school     # an 11-year-old's privacy defaults; text size and contrast changing live
npx tsx reactions.mts ../footage/react16 16    # a class of 16: the lobby waving, a reveal with reactions, Play again
npx tsx reactions.mts ../footage/react16b 16   # the same, with the hero's phone filmed alongside the projector
```

Then pick in-points with `python3 ../sheet.py ../footage/classic/r2-phone r2.png` and set them in `comp/footage.js`.
`modes.mts` takes mode titles to film again (`npx tsx modes.mts ../footage/redo "Sky Lanterns"`).

Render and encode:

```bash
cd tools/trailer && python3 -m http.server 8770 --bind 127.0.0.1 &   # the page loads its footage over HTTP
cd capture && npx tsx render.mts ../frames 0 88.5 1 4                   # every frame, four browsers
npx tsx render.mts ../preview 0 88.5 15 3 && python3 ../tsheet.py ../preview ../pv   # a quick review pass
../../audio/.venv/bin/python ../score/score.py ../score.wav ../score/cues.json
cd .. && ffmpeg -framerate 30 -i frames/f%05d.jpg -i score.wav -c:v libx264 -preset slow -crf 21 -tune grain \
  -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart ludora-trailer.mp4
```

## What it says, and why each line is true

Every claim in the trailer is something the product does today:

- 20 game modes and 100 variants: `packages/engine/src/modes/*/meta.ts`. 8 question types and 20 ready-made sets:
  the set editor and `packages/content/src/sets`.
- No student emails: players join rooms as guests; accounts are optional.
- 112 Glims; odds shown on every Lantern before it opens; nothing sold for real money (`docs/DECISIONS.md`).
- No free-text chat, friends-only defaults for under-13s, reporting and moderation (`docs/SECURITY.md`).
- Large text, high contrast, reduced motion and screen-reader announcements (Settings, `web/src/features/room/game/announce.tsx`).

The classroom is an illustration and looks like one: it stands for the room. What is on its projector is real
footage (the reactions, the reveal, the podium and Play again); the laptops are drawn, in the answer colours. It
shows nothing Ludora does not do.

The local server is a development build, so its header shows a "Dev" badge that production does not. The phone
shots hide it with a style rule (`extras.mts`, `school.mts`); nothing else in the footage is altered.
