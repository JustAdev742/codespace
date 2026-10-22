# Ludora status

Live status of the build. Updated with each milestone commit. Everything marked
**verified** was checked by an automated test or by driving the real app in a
browser; anything else says what it is.

Last updated: 2026-10-22.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Audit and plan | Done | Findings and plan in the first report; decisions in [DECISIONS.md](DECISIONS.md). |
| M1 Foundation | Done | Monorepo, Postgres + Drizzle migrations, auth (accounts, guests, recovery codes), design system, app shell. |
| M2 Engine and first loop | Done | Deterministic engine, 8 question types, Classic played host + player in the browser. |
| M3 Multiplayer and modes | Done | 14 playable modes and 70 variants (84 in all), every variant a rule change, all passing the conformance suite. |
| M4 Economy and progression | Done | Shop, Lanterns with disclosed odds, collections, locker, quests, achievements, levels, streaks. |
| M5 Staff tools | Done | Staff API and all 14 staff sections in the web app. An end-to-end test opens every section as a super administrator at phone and desktop widths. |
| M6 Content, social, classes, analytics | Done | Friends, blocks, profiles, my stats, leaderboards, classes, assignments and their reports, hosted games, game reports, the set editor with image uploads, and AI question drafts. |
| M7-8 Polish, CI, deployment | In progress | Production build, Docker image, compose file, CI workflow, docs and end-to-end tests (run in CI) are in. The visual overhaul is done across player pages and the live game, and automated accessibility checks pass on every player page, game screen and staff section. A design review of the whole app was done and its findings fixed. A manual screen-reader pass remains. |

## What works today (verified)

- **Accounts**: register, sign in, guest play, claim a guest account, recovery
  codes, password change, lockout after repeated failures, privacy defaults for
  under-13s. Sessions are HttpOnly cookies storing only a hash server-side. A
  student who loses their recovery code gets a new one from their teacher
  (Sign-in help on the class page) or from support; no email is involved (D38).
- **Rooms**: 6-digit join codes, lobby, reconnection with a reconnect token,
  host controls (start, pause, resume, skip, end, kick, lock, practice bots,
  teams), late joining, solo rooms, per-socket rate limits, join limits per IP.
  "Your open games" on the Host and home pages lets a host rejoin or close a
  game they left; only games in the lobby, running or paused count toward the
  six a host may have open (D40). Leaving mid-game asks first, and says what
  happens: a player starts again from zero; players see a host-paced game
  paused until the host is back, and the game ends after 10 minutes away.
  Someone who joins during a question may still answer it; a missed one is
  not held against them (D39). Players see their own answer when locked in
  and on the reveal, and answering is held while the connection is down.
  Solo games end with Play again.
- **Modes (14)**: Classic, Comet Dash, Quick Draw, Lantern Out, Confidence,
  Glimgo, Lantern Match, Word Scramble, Time Attack, Survival Run, Flashcard
  Study, Sky Lanterns, Gloom Giant, Tug of War. Each one plays to the end with
  1, 4 and 12 bots, survives players leaving and pausing, works with
  flashcard-only sets and teams, is deterministic for a seed, and never leaks
  answers into a view (conformance suite). All 14 were also started, played and
  ended through the real web app.
- **Variants (70)**: each changes a rule, never just a number (for example a
  wrong-answer penalty, a streak multiplier, a knockout, co-op wins, comeback
  bonuses, questions that come back at the end). New rules default to off, and
  173 recorded bot games of the base modes replay identically. Every variant
  plays to the end with its mode's minimum players, survives players leaving
  and replays from a seed; each new rule has its own test. Fading Lights and
  Kindling were also played to the end in the real app.
- **Accessibility**: an axe-core audit (WCAG 2.2 A and AA rules) of every
  player page, the sign-in pages and every staff section, in both themes at
  phone and desktop widths, finds no violations; the layout end-to-end test now
  runs the same checks on thirteen pages, so CI catches regressions. The live
  game was scanned the same way while being played, host on a projector-sized
  screen and player on a phone, from the lobby to the results, in all 14 modes
  (Classic in both themes): 120 scans, no violations after one fix (Lantern
  Match card names now contain every word on the card). For screen reader
  users the game announces each change once through a single polite live
  region: the start, each question with its number, the result with the right
  answer, a five-second warning, the player's place, pauses and the end. When
  the answer button that had focus disappears, focus moves to the new question.
  This was checked by recording the accessibility tree and every live-region
  message through a whole game, and the end-to-end game test asserts the focus
  and the messages. Buttons
  whose visible text is terse (Buy 150, collection cards) take their accessible
  names from their content, so speech users can say what they see. Automated
  checks cover only part of WCAG; a manual screen-reader pass has not been done.
- **Look and feel** (D30, Ludora's own lantern-festival world): a dusk-sky
  stage behind the landing hero, sign-in, the dashboard greeting, the Lantern
  opening and the whole live game; stall cards for modes and Lanterns with the odds written on
  every Lantern; collectible cards with rarity frames in the shop, collection
  and locker; shape-only silhouettes for Glims not found yet. The Lantern
  opening builds up longer for rarer Glims, can be skipped by tapping, shows
  the Glim straight away under reduced motion, and keeps the odds on screen.
  Every redesigned page was checked at 360 pixels in both themes for one h1,
  no sideways scroll and no console errors.
- **Live game screens**: joining shows greeter Glims and a large code entry.
  The host lobby puts the room code on a paper ticket while players' Glims pop
  into a crowd that resizes so 30 players with full names fit a 1366 by 768
  projector. Questions use chunky answer tiles, each with a shape, a letter and
  a colour, two-up and thumb-sized on phones; reveals show how many picked each
  answer; leaderboard rows slide to their new rank; results raise a podium,
  third place first, with the winner cheering on top (co-op games get a team
  photo). Question pictures display at a fixed height on every screen size.
  All 14 modes use the same stage, every player's Glim shows its real rarity
  finish (D36), and a host can run a game from a phone. Measured after the
  design review: every host screen fits a 1366 by 768 and a 1920 by 1080
  projector without scrolling with 5, 12, 21 and 30 players (long lists show
  their top rows and count the rest), and on phones every single-answer
  question and its action fit at 390 by 844, 375 by 667 and 360 by 640.
  Matching, ordering and select-all questions still need a scroll below 390
  by 844, but their button stays in view once it can be pressed. Variant
  intros name the variant and state each rule switched on. Every mode was played
  to its results in a real browser with a host, a player and bots, at 390
  pixels and at projector size; eight variants were played to check their new
  screen text; with reduced motion nothing moves and nothing waits to appear.
- **Sound and music** (D41): every sound is synthesised in the browser, with
  no recordings: answering, results, the clock's last seconds, players joining,
  reactions, purchases, and Lantern openings that grow grander with rarity.
  Two original music loops (lobby and game) play on the host's screen and in
  solo games, never on players' phones. A speaker button in the game header
  mutes everything on that device and is remembered; Settings turns effects
  and music off for the account. Checked:
  - every effect and both loops render offline without errors or clipping,
    with the music at about -24 LUFS under the effects;
  - a browser run counting sound starts showed music on the host's screen only,
    silence after muting (still muted after a reload), the player's own
    lock-in and result sounds, and the music stopping at the results.
  **Not yet judged by ear**: nobody has listened to it through speakers.
- **Glims**: all 112 redrawn as original die-cut sticker characters with faces,
  arms and feet, distinct silhouettes per collection, rarity finishes (glossy,
  gradient, gold rim light, iridescent sheen) and idle, wave and cheer poses,
  legible from 28 to 240 pixels in both themes. A development gallery at
  `/dev/glims.html` shows every collection, size, part, accessory, pose and
  finish.
- **Rewards**: Sparks, XP, quests and achievements after each game, with a daily
  Spark cap, a minimum number of answers, a solo multiplier, and counting that
  stops puzzle retries or self-graded flashcards from paying more than a quiz.
- **Economy**: idempotent purchases (ten parallel buys against a balance for
  three charge exactly three), ledger with balance after each change, CHECK
  constraints, daily and weekly shop rotations, Lanterns with odds computed from
  the same table the server rolls against, pity counter, recycle and craft,
  one-time collection rewards, Frost Festival event shop with event quests.
- **Staff API**: authorisation matrix over 7 roles and 54 endpoints; moderation
  (warn, mute, suspend, ban, reset name) with typed confirmation checked on the
  server; reports; role assignment with rank rules and the operator CLI;
  capped, audited grants; catalogue, Lantern, shop, event, flag, mode and room
  management; system health; audit log; test accounts, resets, QA scenarios and
  unlimited test currency with production restrictions.
- **Player safety**: report a room, a set or a profile; warnings and mutes
  reach the player as a notice; blocks; friend requests follow privacy settings
  and never reveal why they were refused; staff can switch friends off with a
  flag while blocks keep working; no free-text chat in rooms.
- **Friends and profiles**: add friends by code, accept, decline, cancel and
  remove; block and unblock; profiles that follow privacy settings; my stats by
  mode and subject with an accessible chart and a table view; leaderboards for
  friends, a class and everyone, this week or all time. Every action was driven
  in a real browser at phone and desktop widths, by keyboard as well.
- **Classes**: teacher accounts create classes with join codes, students join,
  assignments are played solo (even from a private set, without exposing its
  answers), teachers get per-student results and per-question first-try rates,
  with CSV downloads that cannot inject spreadsheet formulas. Teachers rename,
  archive and re-code classes and remove students; students see only their own
  results. Anyone can switch account type in Settings (D32). Hosts get a report
  for every game they ran. All of it was driven in a real browser at phone and
  desktop widths, with an axe check in both themes.
- **Staff area**: 14 sections (overview, players and player detail, reports,
  question sets, live rooms, game modes, economy, catalogue, shop, events, feature
  flags, testing, system health, audit log). Menus show only what a role may
  use, and every action is checked again by the API. Each section was driven in
  a real browser at phone and desktop widths, and the end-to-end suite opens
  every one of them at 390 and 1366 pixels.
- **Docker image**: CI builds it on every change, starts it against Postgres
  and checks that it answers (the development sandbox cannot build images, as
  its network goes through a proxy containers cannot use).
- **Set editor**: all 8 question types, import from JSON, CSV or pasted text
  with a preview that names each bad row, export to JSON and CSV (formula-safe,
  round trips keep question ids), local drafts with restore, a leave warning,
  keyboard reordering, an error summary that links to each field, and a copy
  flow for other people's sets. 157 browser checks and an axe check in six
  states passed.
- **Question images**: authors upload PNG, JPEG, GIF or WebP up to 2 MB in the
  set editor, with a preview, a description for players who cannot see it,
  replace and remove. The server identifies the format from the file's bytes
  (an SVG or HTML file named .png is refused), caps dimensions at 4000 pixels,
  strips location and camera metadata, stores files under random names and
  serves them with a sandboxing policy. Sets may only use real, visible
  uploads; moderators can hide one. Upload, save and play were driven in a real
  browser; metadata stripping was checked by decoding the results in Chromium.
- **AI question drafts** (D37): with an Anthropic API key and the
  `ai.question_drafts` flag on, teachers, creators and staff can describe a
  topic, age band, number and kinds of question, and get drafts back in the
  set editor to tick, add and edit before saving. The server checks who may
  draft, the daily allowances (30 per account, a site-wide cap) and one request
  at a time; it validates every draft against the question rules and records
  each request without its topic. Server tests run the drafter against a
  stand-in for the API client and the routes against a stand-in drafter; an
  end-to-end test drives the dialog with the AI endpoints answered in the
  browser and saves the drafted set through the real server, with axe checks
  on both steps. **Not yet done: a real call to the Claude API**, because this
  environment has no API key.
- **End-to-end tests** (`e2e/`, Playwright against the production build and a
  fresh database, locally and in CI): a host and a guest play Classic from join code to results;
  a teacher writes a set with a picture and players see it in a game; a teacher
  drafts questions with AI, keeps two and saves the set; a teacher makes a
  student a recovery code and the student gets back in with it; a new
  player buys and opens a Lantern; a staff warning reaches the player and the
  audit log; thirteen player pages and every staff section fit a phone, have one
  main heading and log no errors, and the player pages pass axe.

## Tests

Run `npm test` from `apps/ludora` (needs a local Postgres; each server test file
creates and drops its own database).

| Project | Files | Tests |
|---|---|---|
| content | 2 | 112: catalogue integrity and every built-in question set |
| engine | 14 | 720, including the conformance suite for every mode and variant |
| server | 11 | 142: auth and rate limits (14), realtime (5), economy (20), staff (54), social and classes (17), preferences (4), open games (4), sign-in help (3), uploads (6), AI drafts (11), reward counting (4) |
| web | 2 | 61: the set editor's checks, import and export (45); the music, in key and looping cleanly (16) |
| shared | 0 | no tests of its own; its schemas are exercised by the other projects |
| **Total** | **29** | **1035 passing** at the last full run |

End-to-end: `npm run test:e2e` (needs Postgres; builds first, then runs 8
browser tests against a fresh `ludora_e2e` database). All 8 pass.

`npm run typecheck` is clean. `npm run lint` reports 12 stylistic warnings and
no errors.

## Open items

Left out on purpose:
- **Email.** Accounts do not collect email addresses (D38): recovery codes,
  teachers and support cover sign-in help, which suits an audience of
  children. The unused outbox table and `SMTP_URL` setting remain in case an
  operator wants email later.

Not checked yet:
- **A manual screen-reader pass.** Automated axe checks pass wherever they run
  and the game's announcements were recorded and tested, but nobody has played
  a game with NVDA, JAWS or VoiceOver.

## Running it

```bash
cd apps/ludora
npm install
npm run db:migrate && npm run db:seed   # needs Postgres; DATABASE_URL defaults to postgres://postgres:postgres@localhost:5432/ludora
npm run dev                             # API on :8787, web on :5173
npm run admin -- grant <username> superadmin --reason "first admin"
```
