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
| M5 Staff tools | In progress | Staff API complete and tested. Staff web pages: overview, players and player detail done; the other twelve sections are being built. |
| M6 Content, social, classes, analytics | In progress | Server done and tested (friends, blocks, leaderboards, classes, assignments, reports, stats). Quests and achievements page done. Set editor, social, class and report pages are being built. |
| M7-8 Polish, CI, deployment | In progress | Production build, Docker image, compose file, CI workflow and the docs set are in. End-to-end tests in the repo, a full accessibility pass and the final design review are next. |

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
- **Player safety**: report a room, a set or (soon) a profile; warnings and mutes
  reach the player as a notice; blocks; friend requests follow privacy settings
  and never reveal why they were refused; no free-text chat in rooms.
- **Classes**: teacher accounts create classes with join codes, students join,
  assignments are played solo (even from a private set, without exposing its
  answers), teachers get per-student results and per-question first-try rates.

## Tests

Run `npm test` from `apps/ludora` (needs a local Postgres; each server test file
creates and drops its own database).

| Project | Files | Tests |
|---|---|---|
| content | 2 | catalogue integrity and every built-in question set |
| engine | 8 | 373, including the conformance suite for every mode and variant |
| server | 6 | auth, realtime, economy (20), staff (52), social and classes (13), reward counting |
| shared | 0 | no tests of its own; its schemas are exercised by the other projects |
| **Total** | **16** | **591 passing** at the last full run |

`npm run typecheck` is clean. `npm run lint` reports 12 stylistic warnings and
no errors.

## Open items

Being built now:
- Staff web pages for reports, question sets, rooms, modes, flags, system,
  audit, economy, catalogue, shop, events and testing.
- Set editor with CSV, JSON and paste import and export.
- Friends, profile, my stats and leaderboard pages.
- Class, assignment report, hosted games and game report pages.

Not built yet:
- **Image uploads.** Questions accept images only from Ludora's own upload
  store (`/uploads/...`), and there is no upload endpoint yet, so new sets have
  no images. Existing image fields are kept when a set is edited.
- **AI question drafts.** The `ai.question_drafts` flag and the
  `ANTHROPIC_API_KEY` setting exist; the feature does not.
- **Email.** An outbox table exists; nothing sends email yet, so there is no
  email verification or email password reset (recovery codes cover resets).
- **Docker image not built here.** The image could not be built in this
  development sandbox (its network goes through a proxy containers cannot use),
  so the Dockerfile's runtime steps were checked by hand instead: the server's
  production-only install, the bundles, migrations, seeding and serving the web
  app in production mode all work. The CI workflow builds and starts the real
  image on every change.
- **End-to-end tests in the repo.** Browser checks so far were run from
  scripts outside the repo; Playwright tests in `e2e/` are M7-8.

## Running it

```bash
cd apps/ludora
npm install
npm run db:migrate && npm run db:seed   # needs Postgres; DATABASE_URL defaults to postgres://postgres:postgres@localhost:5432/ludora
npm run dev                             # API on :8787, web on :5173
npm run admin -- grant <username> superadmin --reason "first admin"
```
