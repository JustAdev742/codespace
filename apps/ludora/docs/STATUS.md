# Ludora status

Live status of the build. Updated with each milestone commit. Everything marked
**verified** was checked by an automated test or by driving the real app in a
browser; anything else says what it is.

Last updated: 2026-10-21.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Audit and plan | Done | Findings and plan in the first report; decisions in [DECISIONS.md](DECISIONS.md). |
| M1 Foundation | Done | Monorepo, Postgres + Drizzle migrations, auth (accounts, guests, recovery codes), design system, app shell. |
| M2 Engine and first loop | Done | Deterministic engine, 8 question types, Classic played host + player in the browser. |
| M3 Multiplayer and modes | Done | 14 playable modes, 28 variants, all passing the conformance suite and smoke-tested in the real app. |
| M4 Economy and progression | Done | Shop, Lanterns with disclosed odds, collections, locker, quests, achievements, levels, streaks. |
| M5 Staff tools | Done | Staff API and all 14 staff sections in the web app. An end-to-end test opens every section as a super administrator at phone and desktop widths. |
| M6 Content, social, classes, analytics | In progress | Server done and tested (friends, blocks, leaderboards, classes, assignments, reports, stats). Quests, friends, profiles, my stats, leaderboards, classes, assignment reports, hosted games and game reports done. The set editor is being built. |
| M7-8 Polish, CI, deployment | In progress | Production build, Docker image, compose file, CI workflow, docs and end-to-end tests (run in CI) are in. A visual overhaul, a full accessibility pass and the final design review are next. |

## What works today (verified)

- **Accounts**: register, sign in, guest play, claim a guest account, recovery
  codes, password change, lockout after repeated failures, privacy defaults for
  under-13s. Sessions are HttpOnly cookies storing only a hash server-side.
- **Rooms**: 6-digit join codes, lobby, reconnection with a reconnect token,
  host controls (start, pause, resume, skip, end, kick, lock, practice bots,
  teams), late joining, solo rooms, per-socket rate limits, join limits per IP.
- **Modes (14)**: Classic, Comet Dash, Quick Draw, Lantern Out, Confidence,
  Glimgo, Lantern Match, Word Scramble, Time Attack, Survival Run, Flashcard
  Study, Sky Lanterns, Gloom Giant, Tug of War. Each one plays to the end with
  1, 4 and 12 bots, survives players leaving and pausing, works with
  flashcard-only sets and teams, is deterministic for a seed, and never leaks
  answers into a view (conformance suite). All 14 were also started, played and
  ended through the real web app.
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
- **End-to-end tests** (`e2e/`, Playwright against the production build and a
  fresh database, locally and in CI): a host and a guest play Classic from join code to results;
  a new player buys and opens a Lantern; a staff warning reaches the player and
  the audit log; ten player pages and every staff section fit a phone, have one
  main heading and log no errors.

## Tests

Run `npm test` from `apps/ludora` (needs a local Postgres; each server test file
creates and drops its own database).

| Project | Files | Tests |
|---|---|---|
| content | 2 | catalogue integrity and every built-in question set |
| engine | 8 | 373, including the conformance suite for every mode and variant |
| server | 6 | auth and rate limits, realtime, economy (20), staff (53), social and classes (13), reward counting |
| shared | 0 | no tests of its own; its schemas are exercised by the other projects |
| **Total** | **16** | **594 passing** at the last full run |

End-to-end: `npm run test:e2e` (needs Postgres; builds first, then runs 5
browser tests against a fresh `ludora_e2e` database). All 5 pass.

`npm run typecheck` is clean. `npm run lint` reports 12 stylistic warnings and
no errors.

## Open items

Being built now:
- A visual overhaul: brighter, chunkier and more character-led, with better
  original Glims (D30). The dusk stage, sidebar and controls are in.
- Set editor with CSV, JSON and paste import and export.
- More honestly labelled mode variants.

Not built yet:
- **Image uploads.** Questions accept images only from Ludora's own upload
  store (`/uploads/...`), and there is no upload endpoint yet, so new sets have
  no images. Existing image fields are kept when a set is edited.
- **AI question drafts.** The `ai.question_drafts` flag and the
  `ANTHROPIC_API_KEY` setting exist; the feature does not.
- **Email.** An outbox table exists; nothing sends email yet, so there is no
  email verification or email password reset (recovery codes cover resets).

## Running it

```bash
cd apps/ludora
npm install
npm run db:migrate && npm run db:seed   # needs Postgres; DATABASE_URL defaults to postgres://postgres:postgres@localhost:5432/ludora
npm run dev                             # API on :8787, web on :5173
npm run admin -- grant <username> superadmin --reason "first admin"
```
