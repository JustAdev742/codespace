# Access: accessibility, comfort and device features

Workstream `access`. Migration `0015_access` (`class_members.extra_time`, `sessions.shared`). No new
dependency: Atkinson Hyperlegible Next was already the body face, so the easier-to-read setting uses it
everywhere instead of adding `@fontsource/atkinson-hyperlegible`.

Every new preference defaults to how Ludora behaved before (`access` in `server/src/modules/users/preferences.ts`,
the same defaults in `web/src/lib/prefs.ts`). Signed in, settings follow the account; signed out (most students
join with a code) they are kept on the device; volumes, the voice and installing always stay with the device.
Settings that change layout are data attributes on `<html>`, mirrored in localStorage and put back by
`public/theme.js` before the first paint.

Tests:
- `e2e/access.spec.ts` (4 flows), passing in Chromium, Firefox and WebKit; axe (WCAG 2.2 A and AA) and no
  sideways scroll on every screen it opens, at 390x844 and 1366x768.
- `server/test/access.test.ts` (7): extra time in a room and for a class (wrong accounts refused), room
  switches, preferences, shared-device sessions.
- `packages/engine/test/extra-time.test.ts` (6), `web/src/lib/access.test.ts` (9).

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **Read aloud**: a speaker button reads the question and its answers with the browser's own speech (off until turned on); voice and speed in Settings; "read each new question by itself"; the host can have the big screen read every question (room setting). Hidden where the browser has no speech. | `lib/speech.ts` (`spokenQuestion`), `room/game/comfort.tsx` (`ReadAloud`), `QuestionCard.tsx`, `RoomSettings.tsx` | unit (wording for each type, maths in words); e2e: the room switch is set (speech itself not heard by a test) |
| 2 | **Extra time** for chosen players: a quarter, half or double, from the seat menu in the lobby or the players list in a game (and the phone remote). The server keeps that player's question open longer for them alone; their timer shows their own time; speed points are measured against their own time; no news line, nothing on other screens. **For a class**, the teacher sets it once on the Students tab and it follows the student into every live game hosted for the class. | engine `syncRounds.ts` (`syncPlayerDeadline`, `closeAt`), `runtime.setExtraTime`, `room.ts` (`extraTime`), `modules/access/routes.ts`, `host/ExtraTime.tsx`, `classes/ExtraTimePanel.tsx` | engine: open only for them, closes at their end, fair speed points, add time, from the next question; server: players never get the list, class extra time applied on join, student 403 and other teacher 404; e2e: phone timer above 40 s while the big screen shows 30 or less |
| 3 | **Answer by keyboard with letters**: A to F as well as 1 to 6 (number keys already worked), not beside a 3D board where the letters walk; the key shows on each tile only once a keyboard is in use (`aria-keyshortcuts` too). | `AnswerInput.tsx` (`keyToChoice`, `useKeyboardHints`) | unit; e2e: hints hidden, Tab shows them, B answers False |
| 4 | **Easier-to-read typeface** for headings and numbers too, and **letter and word spacing** and **line spacing** (normal, wide, wider at WCAG 1.4.12 values). Wins over a school's typeface. | `app.css` (`data-font`, `data-letters`, `data-lines`) | e2e: attributes set and restored before the account loads; axe at 390 |
| 5 | **Colour-safe answer tiles**: the Okabe-Ito palette (ink text 4.9:1 or more on each) and a light pattern on every tile, word-bank word and sorting group. | `app.css` (`data-tiles`), `data-tile` on tiles | e2e: axe on a revealed question with the palette on; screenshot checked |
| 6 | **Calm mode**: no reactions (bar or floating), celebration bursts or countdown tick for that player. | `RoomPage.tsx`, `art/bursts.tsx`, `sound/engine.ts` (`setComfort`) | e2e: saved to the account |
| 7 | **Separate volume sliders** for effects and music (this device). | `sound/engine.ts` (`setVolume`), `AccessSettings.tsx` | typecheck; shown in the comfort dialog (axe) |
| 8 | **Show sounds**: a caption with an icon for sounds that mean something (answer locked in, right, wrong, time nearly up, time's up), the timer warning on phones too. | `comfort.tsx` (`SoundCues`, `showCue`), `TimerBar.tsx` | e2e: "Sound: answer locked in / wrong answer" after a keyboard answer |
| 9 | **A buzz on phones** when an answer locks in, a double for right, a long one for wrong (setting, where the browser can). | `comfort.tsx` (`BUZZ`) | not testable in a desktop browser: code path shared with captions, which is tested |
| 10 | **Keep the screen on** during a game (setting, Wake Lock where supported), taken again when the tab returns. | `comfort.tsx` (`useWakeLock`) | typecheck; not exercised by a test |
| 11 | **Install as an app**: manifest, icons (any and maskable), an offline page, and a service worker that stores only `/assets/` (hashed) files and the offline page; pages always come from the network, `/api`, `/socket.io` and `/uploads` are never touched. Registered only by the production app (the demo does not). "Install Ludora" in Settings, with iPhone instructions. | `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, `lib/pwa.ts` | e2e: manifest and icons load; in Chromium the worker is active and `/api/auth/me` still answers `no-store` from the server; demo build served from a sub-path loads with no errors and no worker |
| 12 | **Connection banner**: in a game, "Connection lost. Reconnecting…" and "Back online" for a moment, as a clear banner; on app pages, an offline banner. (The small pill and announcement already existed.) | `comfort.tsx` (`ConnectionBanner`), `app/OfflineBanner.tsx` | typecheck; not exercised by a test (needs a dropped socket) |
| 13 | **Data saver** (Auto, On, Off; Auto follows Save-Data and `prefers-reduced-data`): no music downloads (the synthesised stand-ins play), low 3D on automatic quality, no seasonal drift in 3D, loading shimmer still. | `prefs.ts` (`dataSaverOn`), `sound/engine.ts`, `three/quality.ts`, `Stage3D.tsx` | unit (`saver` attribute); e2e none |
| 14 | **Little hands**: bigger text and buttons on game screens, as a player setting and as a room setting for every player. | `app.css` (`data-game`, `data-little`), `RoomPage.tsx`, `RoomSettings.tsx` | server unit (room switch mid-game); e2e: phone gets `data-little`, axe on the question at 390 |
| 15 | **How the timer shows**: both, bar, number or hidden (hidden also silences the time warning); the projector always shows both. | `TimerBar.tsx` | e2e: setting applied |
| 17 | **Screen readers**: a "Skip to the game" link on game screens (the app already had one), comfort and extra-time controls named, the offline banner as a status region. | `RoomPage.tsx`, `OfflineBanner.tsx` | axe on every screen in the spec |
| 18 | **"This is a shared device"** at sign-in: a browser-session cookie, the session ends after 30 minutes without use (server), and the page signs out when the tab that signed in has closed or after 20 minutes with nothing pressed. The next person gets the device's own look. | `auth/routes.ts`, `auth/service.ts` (`SHARED_IDLE_MS`), `app/SharedDevice.tsx`, `SignIn.tsx` | server: no Max-Age, ends after its idle time, other sessions untouched; e2e: a new tab is signed out |
| 19 | **Battery saver for 3D**: at most 30 frames a second; and a **one-time tip** offering "3D off" when frames stay slow at the lowest quality. | `Stage3D.tsx`, `stage3d.css` | typecheck only: headless browsers here have no reliable frame timing |
| 20 | **Settings**: a search (with words like "colour blind" or "dyslexia"), **Back to defaults** (asks first; privacy and account untouched), and a plain statement of what follows the account and what stays on the device ("This device" tags). The same settings in a **Comfort settings** dialog one tap from a game's header, signed in or not. | `settings/AccessSettings.tsx`, `Settings.tsx`, `room/game/ComfortDialog.tsx` | unit (search); e2e both, axe |
| 21 | **Highest contrast** (beyond high) and **less transparency** (solid panels, no frosted glass). | `app.css` (`data-contrast='max'`, `data-transparency`) | e2e: attribute set, axe at 390 |
| 22 | **Phones**: game screens keep clear of notches and rounded corners (safe-area padding, header and bottom), and a dismissable hint to turn the phone sideways during 3D games. | `RoomPage.tsx`, `app.css` (`.safe-x`), `comfort.tsx` (`RotateHint`) | typecheck; not testable without a device |
| 23 | **Sections fail on their own**: a broken page keeps the menu, a broken game screen keeps the header with Leave, a broken setting keeps the others, each with "Try again", reported to System health. | `ui/SectionBoundary.tsx`, `Shell.tsx`, `RoomPage.tsx`, `AccessSettings.tsx` | typecheck; no test forces a crash |
| 24 | **What's new**: entries from `features/whatsnew/whats-new.json`, a header button with a dot until read (on wider screens), and a button in Settings. | `features/whatsnew/` | unit (`unseen`); e2e: dot, panel, axe |
| 25 | **Dates and time zones**: choose a time zone (dates, times and assignment due dates show and are entered in it) and British or the device's own number and date style. Applied in `format.ts` and the reports and class date helpers, not yet in every page's own date code. | `lib/format.ts`, `reports/reportUi.tsx`, `classes/classData.ts` | unit (zone parts, offsets, wall-clock to instant across summer time) |
| 26 | **Always-underlined links** and **an always-visible focus ring** (thicker, mouse focus too, with a halo). | `app.css` (`data-links`, `data-focus`) | e2e: focus ring on in the 390 axe check |

## Already existed or checked (not counted)

- 16 **Drags by tap and keyboard**: checked each one. Ordering (arrow buttons), matching (tap left then right),
  sort into groups (tap or keys 1 to 3, drag optional), fill in the blanks (tap a word, tap a gap) and the
  editor's question order (arrow buttons) all work by tap and keyboard already; nothing needed fixing.
- Number keys for answers, the room's "Reconnecting…" pill and announcement, the app's skip link, place
  changes and time warnings announced politely (`docs/SCREEN_READER_AUDIT.md`), 3D off per device.

## Not done or not verified

- Read aloud, buzzes, wake lock, battery saver, the slow-3D tip and safe areas were not tried on a real phone,
  Chromebook or iPad; headless browsers have no voices or vibration.
- Extra time works in host-paced modes built on shared rounds (Classic, Confidence, Glim Duels, Lantern Out,
  Quick Draw, Survival Run, Word Scramble rounds, GlimGo); self-paced modes have no per-question clock to extend.
  The big screen waits at 0 while a player with extra time is still answering.
- The time zone and locale apply to shared date helpers only; about forty `toLocaleDateString('en-GB')` calls
  in other areas' pages still use the device's zone and British style.
- In the school look, signed-out pages at 390 px scroll sideways by 10 px because of the header (Dev badge,
  crest, Sign in and Create account); it is not caused by this work but makes the first settings check fail
  with `E2E_SCHOOL_THEME=hills-grammar`.
