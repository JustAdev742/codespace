# Chaos: the secret cheat menu

Chaos is an Easter egg. A player who finds the secret unlocks a menu of cheats they can cast in
live games: score swings, shields, pranks on rivals, round twists and screen effects. Anyone can
unlock it, the owner included, and only by finding it. There is no admin grant, no request form
and no role that turns it on.

This page gives the secret away. It is for people who maintain Ludora, not for players.

## How a player unlocks it

Every stage is checked by the server. The browser reports what the player did; it never
decides whether that was right, and the web app's files hold none of the answers.

1. **Knock.** Settings has an About Ludora panel with a small lantern. Every 22 seconds it
   flickers a rhythm (not under reduced motion). Tapping the same seven-tap rhythm at any
   steady tempo counts as a knock. The rhythm comes from an HMAC of `CHAOS_SECRET`, or of
   `IP_HASH_KEY` when that is unset, so every deployment has its own and it is not in the
   source. A wrong knock gets no reply at all. Each account gets 30 knocks an hour.
2. **Riddle.** A right knock opens "The lantern whispers": *Open your collection book to
   {collection}. Who is the {nth} Glim on that page?* Three wrong answers start the whole
   sequence over.
3. **Ritual.** A right answer reveals four reactions. In a running game, as a player, the
   player sends those reactions in that order, with no other reactions in between.
4. **Light.** A lantern glows on that player's screen. Holding it for 3 seconds within 3
   minutes unlocks the account.

The whole sequence must be finished within 20 minutes of the knock. Progress is held in the
server's memory, so a restart starts everyone over. The unlock is written to the account
(`users.chaos_unlocked_at`) with an audit entry.

"Put the lantern out", at the bottom of the menu's Active tab, locks the account again; it is
also audited. After that the player has to find the secret again.

## What it does in a game

Players with chaos unlocked see a lantern button in the game header. It loads the menu, which
has three tabs:

- **Cheats**: search, category chips (Favourites, Recent and the seven categories), and "Only ones
  that work here". Each card shows its cost, target, duration, cooldown and why it would not work
  in this game.
- **Active**: the effects running now, each with stop and, for the first 20 seconds, undo.
- **Combos**: ten named combinations that do something extra when cast together.

A cast can hold up to five cheats. Picking a target or setting a parameter happens in the tray at
the bottom.

### Rules every cast follows

- **The server decides.** The menu sends a request; the game runtime checks it and runs it in a
  transaction like a mode's own moves. It either changes real game state or is refused with a
  reason and changes nothing. No success is shown for a cast that did nothing.
- **Energy and cooldowns.** Each player has 100 chaos energy, refilling at 4 a second. Each cheat
  has a cost and a cooldown.
- **Fair targets.** No more than 4 hostile effects can sit on one player at a time. Shields,
  reflects, decoys and bodyguards block or turn back hostile cheats. Cheats that need an
  opponent are refused in a solo room.
- **Limits.** Chaos never ends a game, knocks anyone out or wins it for anyone. Meters keep their
  modes' limits (no negative lives, no score above a goal that would end the game).
- **Conflicts.** Cheats that contradict each other are refused. Cheats that share an exclusive
  slot replace each other. Casting a cheat again refreshes it.
- **Effects end with the game.** Nothing outlasts a game, and nothing touches the account's
  Sparks, items or collection.
- **Random cheats show their odds** in the menu, and the server rolls them.
- **Duplicates.** Each request carries an action id; a repeat of a request already handled is
  answered from memory instead of running twice.
- **Disconnects.** When a player leaves, effects on them end, and so do helpful effects they
  cast. Pranks they cast on others run out as normal.

### Guardrails

- **The host can calm the room.** "Calm the room" in the host controls ends every effect and
  stops new casts for the rest of the game.
- **Homework is off limits.** Chaos never runs in an assignment.
- **Rooms without chaos.** The room API's `chaos` option (on by default) turns it off for a
  room. The host page does not offer it, so as not to give the secret away; calming the room
  does the same job once a game is running.
- **Rewards.** A player who casts in a game earns nothing from that game. Everyone else is paid
  for their answers, but places earn nothing, because chaos may have decided them. The game's
  record and the teacher's report show that chaos was used.
- **Rate limits.** 6 casts in a burst, then 2 a second, per connection.

## Keeping it hidden

The goal is that nobody gets cheats by downloading the app's files, editing them or guessing
addresses. The protection is the server, not the obscurity:

- **Casting** checks the account's unlock in the database on every request (cached for 5
  seconds per connection). A locked account gets "Nothing happens."
- **The cheat list and the menu's code** come from `GET /api/lantern/book` and
  `GET /api/lantern/book.js`. For a locked account both answer exactly like an address that does
  not exist (404 Not Found).
- **The menu is a separate build** (`web/vite.chaos.config.ts`, written to `web/dist-private/`).
  It is never served as a static file, and the public build does not contain it.
- **The engine's public entry point does not export the cheats.** They register only through
  `@ludora/engine/chaos-cheats`, which only the server imports.
- **CI checks the public files.** `scripts/check-public-bundle.ts` searches `web/dist` and
  `web/dist-demo` for every cheat id and description, and fails the build if one turns up.
- **The demo has no chaos.**

What a determined person *can* learn from the public app: that the About lantern exists and
reports taps, and the names of the endpoints. None of that unlocks anything without the right
knock, the riddle's answer and the ritual.

## Architecture

| Path | What it is |
|---|---|
| `packages/engine/src/chaos/` | The engine side: types, registry, casting, effects, adapters for every mode. Its README is the guide to writing cheats. |
| `packages/engine/src/chaos/cheats/` | The 209 universal cheats and the combos. |
| `packages/engine/src/chaos/packs/` | One pack per mode. |
| `packages/engine/src/runtime/runtime.ts` | Runs casts in transactions; `cast`, `undoCast`, `stopEffect`, `calmChaos`, `chaosView`. |
| `server/src/modules/chaos/` | The sequence, the unlock and the `/api/lantern/*` routes. |
| `server/src/realtime/room.ts`, `attach.ts` | Casting over the socket, dedupe, rate limits, calm. |
| `web/src/features/chaos/` | The public end: the About lantern, the glowing lantern, the menu button and the screen effects. |
| `web/chaos-menu/` | The private menu, built separately. |

## The catalogue

**958 cheats and 10 combos**, every one tested. That is short of the 1,000 the brief aimed for.
The count is honest: nothing in it is an alias, a renamed copy or a button that does nothing.
All five 3D modes have their packs, and the smaller packs have grown until their modes ran out
of distinct ideas.

| Category | Cheats |
|---|---|
| Score | 91 |
| Advantage | 244 |
| Troll | 275 |
| Round | 116 |
| Economy | 111 |
| Visual | 61 |
| Random | 60 |

| Pack | Cheats | Pack | Cheats |
|---|---|---|---|
| Universal | 209 | Time Attack | 32 |
| Glow Tag Royale | 39 | Gold Rush | 31 |
| Lantern Trail | 39 | Comet Dash | 30 |
| Night Market | 39 | Sky Lanterns | 30 |
| Big Catch | 38 | Survival Run | 28 |
| Festival Workshop | 38 | Glim Duels | 27 |
| Gloom Giant | 37 | Classic | 24 |
| Corner Shop | 36 | Word Scramble | 23 |
| Lantern Guard | 35 | Lantern Match | 22 |
| Tug of War | 35 | Confidence | 21 |
| Code Breakers | 34 | Lantern Out | 21 |
| Glimgo | 33 | Quick Draw | 14 |
| Lantern Lands | 32 | Flashcard Study | 11 |

### How every cheat is tested

`packages/engine/test/chaos-catalogue.test.ts` runs two identical bot games for every cheat in
every mode it supports, casts it into one, and requires the two games to differ afterwards:

- a cheat that changes the game must change the mode's state;
- a screen cheat must show its effect on the target's screen;
- a cheat about chaos itself (energy, cooldowns) must change those;
- a cheat that waits for something to happen counts as untried in a game where it never does,
  but every cheat must work in at least one mode.

Mode-specific setups live in `packages/engine/test/chaos-scenarios/`. The core rules (energy,
shields, conflicts, undo, calm, dedupe) have their own tests in `chaos-core.test.ts`, the
sequence and routes in `server/test/chaos.test.ts`, and `e2e/chaos.spec.ts` drives the whole
thing in real browsers: knock, riddle, ritual, light, open the menu, cast Upside Down on another
player, see their screen turn over, and calm the room.

## Known limits

- Effects that hide or restyle one part of the screen (a player's name, scores, a choice) only
  work where that part uses the shared components (leaderboard, answer tiles, question card).
  Whole-screen effects work on every mode's screen.
- Sequence progress resets when the server restarts. Unlocks do not.
- With several server processes, a player has to finish the sequence on the same process.
  Ludora runs one process today.

## Deployment

Set `CHAOS_SECRET` (at least 16 random characters) to give the knock its own secret. Without it
the rhythm is derived from `IP_HASH_KEY`, which production already requires. Changing either one
changes the rhythm; unlocks already on accounts stay.

The production image copies `web/dist-private` and sets `WEB_PRIVATE_DIST`. If that file is
missing the menu cannot open; casting still works for unlocked players, but they have no way to
do it from the app.
