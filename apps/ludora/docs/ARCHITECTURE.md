# Ludora architecture

## Overview

```
 browser (React app)                    server (one Node process)                 Postgres
 ───────────────────                    ───────────────────────────               ────────
 pages, staff area  ── HTTPS /api ──▶  Fastify routes ── services ── Drizzle ──▶  accounts, economy,
 game screens       ◀─ Socket.IO ───▶  RoomManager ── Room ── GameRuntime          content, games,
                                        (engine package, pure logic)              classes, audit
```

Five workspace packages, all TypeScript:

| Package | Role | Depends on |
|---|---|---|
| `packages/shared` | Types, zod schemas and vocabulary used everywhere: questions, modes, economy, permissions, realtime messages, staff vocabulary. | zod |
| `packages/engine` | Game logic with no I/O: the mode SDK, the runtime, question grading and adaptation, shared mechanics, the 14 modes, and a test harness. | shared |
| `packages/content` | Shipped catalogue: currencies, 112 Glims, 111 cosmetics, Lanterns, shop listings, quests, achievements and 20 question sets. | shared |
| `server` | HTTP API, realtime rooms, persistence, rewards, staff tools, operator CLI. | shared, engine, content |
| `web` | The single-page app: player pages, game screens, staff area. | shared, engine (catalogue only) |

## The engine

A mode is a definition (`packages/engine/src/sdk`), not a class: metadata,
settings, an initial state, action and timer handlers, per-player views and
results. The `GameRuntime` drives it:

- **Clock.** Game time stops while paused. Timers are scheduled in game time.
- **Randomness.** One seeded generator per game; the same seed and inputs give
  the same game.
- **Transactions.** Every action and timer runs on a copy of the state. If the
  handler throws, the copy is thrown away, so a bug cannot leave half-applied
  state. Three errors end the game with scores saved.
- **Views.** Built per player from the state. Questions reach players through
  `ctx.questions`, which presents choices by positional token and grades
  answers on the server, so a view never contains an answer.
- **Answers.** Modes record each answer with its kind (`answer`, `attempt`,
  `self`) so rewards and reports can treat retries and self-grading fairly.
- **Mechanics.** `syncRounds` (everyone on the same question, host or timer
  moves on) and `selfPaced` (each player on their own deck) cover most modes.

Mode metadata (`meta.ts`) carries no logic and is what the browser imports, via
`@ludora/engine/catalog`. It declares the shared settings the mode reads, so the
host form only shows those.

The conformance suite (`packages/engine/test`) plays every mode and variant with
bots and checks the rules in [GAME_MODE_SDK.md](GAME_MODE_SDK.md).

## The server

```
server/src
  app.ts            builds the Fastify app: security headers, cookies, rate limits, CSRF, auth hook, error shape
  routes.ts         every route module
  config.ts         environment variables, validated at start
  db/               Drizzle schema, migrations runner, content seed
  http/             request context (who is signed in, permissions) and plugins
  realtime/         RoomManager, Room (wraps a GameRuntime), Socket.IO transport, persistence of results
  modules/          one folder per area: auth, economy, shop, packs, inventory, progression, profiles,
                    sets, rooms, modes, flags, events, social, classes, analytics, admin, audit, system
  cli/admin.ts      operator commands (grant and revoke roles)
```

- **Requests** pass through: helmet headers, global rate limit, cookie parsing,
  session lookup (`req.auth`), CSRF guard, the route's own rate limit and zod
  parsing, then services. Services take a `Db` or a transaction handle, so
  callers compose them inside one transaction.
- **Rooms** live in memory in the `RoomManager`. Each `Room` owns a
  `GameRuntime`, the player roster, reconnect tokens and subscribers. Views are
  coalesced and sent per viewer about every 40 ms. When a game ends, results are
  written in one transaction and each player's rewards are paid as their own
  idempotent operation.
- **Money-like data** (wallets, ledger, inventory, purchases, pack openings)
  only changes through `modules/economy/service.ts` and the inventory service,
  inside transactions, with row locks and idempotency keys.
- **Staff endpoints** live under `/api/admin`, each guarded by a permission and
  written with an audit row in the same transaction.

## The web app

```
web/src
  app/        router, shell (navigation, balances, account menu), preference sync
  lib/        API client (adds the CSRF header), session and permission hooks, room hook (Socket.IO), formatting, sound
  assets/     the music and sound effects (MP3s rendered by tools/audio) and their credits
  ui/         primitives (panels, forms, dialogs, tabs, badges) and buttons
  art/        procedural art: Glims, accessories, cosmetics, Lanterns, mode thumbnails, effects
  features/   one folder per area; features/admin is the staff area
```

- Data comes from the API through TanStack Query; every change invalidates the
  queries it affects.
- Each mode has a player screen and a host screen in `features/room/modes`,
  loaded only when that mode is played.
- Design tokens are CSS variables with a dark and a light theme, player-chosen
  text size, high contrast and reduced motion (docs/DESIGN.md). Pressable
  pieces are solid colour with a darker bottom edge (the `.sticker` and
  `.piece` classes); answers are told apart by shape and letter as well as
  colour.
- Sound (`lib/sound`) is one engine per page. The effects and the music loops
  are files rendered offline by `tools/audio`, a Python build that turns
  Ludora's scores into MP3s and writes `assets.generated.ts` (file URLs, loop
  points, tempos). Effects play their synthesised version from `sfx.ts` until
  their file has loaded. Music loops between the points the manifest gives,
  changes on the bar line, and dips under big effects.
  `features/room/music.ts` picks the track: the lobby, each mode's own, the
  final stretch, then the results.

## Data model highlights

- `users` (with `is_test_account`, status, mute and suspension), `user_roles`,
  `sessions` (hashed tokens), `entitlements`.
- `question_sets` with questions stored as validated JSON.
- `game_sessions`, `game_participants`, `answer_events` (with kind).
- `currencies`, `wallets`, `ledger_entries`, `economy_ops` (idempotency),
  `economy_config` (rules and event windows).
- `items`, `collections`, `inventory`, `equipped`, `packs`, `pack_openings`,
  `pity_counters`, `shop_listings`, `purchases`.
- `quests`, `user_quests`, `achievements`, `user_achievements`, `user_stats`.
- `friendships`, `blocks`, `classes`, `class_members`, `assignments`.
- `reports`, `moderation_actions`, `audit_log`, `feature_flags`,
  `mode_overrides`, `error_reports`.

CHECK constraints protect balances, item counts, statuses and enumerations at
the database level as well as in code.
