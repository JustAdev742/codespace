# The Ludora trailer

An 86-second trailer for schools, made entirely from real Ludora footage. No Blender and no mock-ups: Playwright
plays real games against a local server and films the projector and the phones; an HTML page composes the
shots; Chromium renders it frame by frame; ffmpeg joins the frames to a score rendered with `tools/audio`.

| Folder | What it does |
|---|---|
| `capture/` | Films the footage. `rig.mts` registers a teacher, opens rooms and plays as eight named students. `cast.mts` records a page with the Chrome DevTools screencast and resamples it to 30 fps. |
| `comp/` | The composition. `trailer.js` draws any frame from its time alone (`window.renderFrame(t)`); `footage.js` says which frames of which shot each scene uses. |
| `score/` | `score.py`, the music (120 BPM, one bar = 2 s, cut to the edit), and `cues.json`, the app's own sound effects laid over it. |
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
```

Then pick in-points with `python3 ../sheet.py ../footage/classic/r2-phone r2.png` and set them in `comp/footage.js`.
`modes.mts` takes mode titles to film again (`npx tsx modes.mts ../footage/redo "Sky Lanterns"`).

Render and encode:

```bash
cd tools/trailer && python3 -m http.server 8770 --bind 127.0.0.1 &   # the page loads its footage over HTTP
cd capture && npx tsx render.mts ../frames 0 86 1 4                     # every frame, four browsers
npx tsx render.mts ../preview 0 86 15 3 && python3 ../tsheet.py ../preview ../pv   # a quick review pass
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

The local server is a development build, so its header shows a "Dev" badge that production does not. The phone
shots hide it with a style rule (`extras.mts`, `school.mts`); nothing else in the footage is altered.
