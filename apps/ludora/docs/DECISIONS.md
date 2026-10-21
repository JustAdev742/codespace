# Decisions

Choices made while building Ludora, newest last, with the reason for each.
When a decision is reversed, it stays here with a note rather than being
deleted.

## Product and identity

**D1. An original identity: Ludora, Glims and Lanterns.** The genre (quiz-powered
multiplayer games with collectibles) is shared with existing products; the name,
characters, art and vocabulary are not. Glims are drawn procedurally from a
small art spec (16 bodies, eyes, mouths, patterns, toppers, accessories), so
there are no copied or licensed assets, and packs are "Lanterns" opened with
"Sparks". No other service's branding, sounds or layouts are reproduced.

**D2. No free-text chat in rooms.** Players react with a fixed set of emotes.
Most players are children; free text needs real-time moderation that a
classroom game should not depend on. Display names go through a blocked-words
check, and hosts can switch the whole room to generated names.

**D3. Guests can play and host; friends and classes need an account.** Joining a
game must take seconds, so a code and a name are enough. Anything that ties
people together over time (friends, classes, assignments) needs an account, so
that it belongs to someone and can be moderated.

**D4. Safer defaults for under-13s.** Players who give a birth year under 13
start with a friends-only profile and friend requests by code only. They can be
changed in Settings; the defaults decide what happens when nobody thinks about it.

## Architecture

**D5. One TypeScript monorepo.** `packages/shared` (contracts and zod schemas),
`packages/engine` (game logic, no I/O), `packages/content` (shipped catalogue),
`server` (Fastify, Socket.IO, Postgres via Drizzle) and `web` (React, Vite).
The same schemas validate input in the browser and on the server.

**D6. Server-authoritative, deterministic games.** The engine runs only on the
server. Each game has a seeded random generator and a game clock that stops
while paused, so the same seed and inputs give the same game. Every action runs
in a clone-on-write transaction that rolls back on error; three errors end a
game with scores saved. Views are built per player and never include answers:
choices are sent as positional tokens, and a test checks every view of every
mode for leaks.

**D7. A conformance suite gates every mode.** A mode is only marked `playable`
when it plays to the end with 1, 4 and 12 bots, survives churn and pausing,
works with flashcard-only sets and teams, is deterministic and leak-free, for
the base mode and every variant. Modes that are designed but not built would be
listed as `planned` and cannot be started.

**D8. Rooms live in one process.** Live rooms are held in memory by a
RoomManager, with results written to Postgres when a game ends. This keeps
latency low and the code simple. Running several API processes would need
sticky sessions and a shared room directory; that is a deployment change, not
a rewrite.

**D9. Mode metadata declares the shared settings it reads.** Each mode lists the
shared settings it uses (seconds per question, time limit, number of questions)
and its defaults, and the engine uses that same object. The host form shows only
those fields, so hosts are never offered a setting that does nothing. A test
keeps the declaration, the engine defaults and the browser catalogue in step.

## Economy

**D10. Integer amounts, row locks, a ledger and idempotency keys.** Every balance
change locks the wallet row, writes a ledger entry with the balance after, and
relies on a CHECK constraint as the last defence against a negative balance.
Purchases, Lantern openings and claims run once per request key, so retries and
double clicks never charge twice.

**D11. Lantern odds come from the same table the server rolls against.** The
odds dialog is computed from the drop table and the live pool, not typed by
hand. Rarities with no Glims available are dropped and the rest rescaled.
Drop tables point at collections rather than item lists, so a new Glim joins the
pool without editing tables. Rolls use a cryptographic random source. A pity
counter guarantees an epic or better after 15 Lanterns without one.

**D12. Earning stays tied to playing.** Nothing costs real money. Games pay for
taking part, correct answers and podium places, with a daily Spark cap, a
minimum number of answers before a game pays, and a lower rate for solo play, so
farming solo games is not the best way to earn.

**D13. Rewards count questions, not attempts.** Some modes record many small
tries (memory pairs, bingo marks, self-graded flashcards). Rewards, quests and
achievements count each question once, never count self-graded answers as
correct, build streaks only from graded answers, and pay for at most 40
questions a game. Answer records carry their kind so teacher reports can judge
questions on the first try.

**D14. Events are a flag, a stored window, a currency and quests.** The Frost
Festival's dates live in the database, so staff can move them; moving them moves
the event's shop listings and its currency's expiry in one transaction. Event
quests are the only source of Frost Tickets, which stop being spendable when the
festival ends.

## Staff tools and security

**D15. Roles and permissions are enforced on the server only.** The browser uses
the same permission table to decide what to show, but every staff endpoint
checks its permission, and a hidden button is never the protection. A guest
session never holds staff rights even if a role row exists.

**D16. Rank rules for people.** Staff can act on an account only when they
outrank it, never on their own account through staff tools, and can grant a role
only below their own (super administrators can grant any). The last super
administrator cannot be removed.

**D17. The first super administrator comes from the operator CLI.** `npm run admin
-- grant <username> superadmin --reason "..."` needs shell access to a server
with database credentials, which is already the root of trust. There is no
special URL, environment allowlist or client flag that grants rights. CLI
changes are audited as `system:cli`.

**D18. Destructive actions need the target's name typed, checked by the server.**
Bans, open-ended suspensions, admin role changes, grants to real accounts,
resets, closing rooms and ending events early all require a typed confirmation
that the server compares, so a forged or accidental request does nothing.

**D19. Everything staff change is audited in the same transaction.** Each change
writes an audit row with actor, roles, reason, before and after, and a hashed
IP. Staff writes are rate limited per account rather than per IP.

**D20. Test accounts are separate, and special balances need two things.**
Testers create fresh test accounts; turning an existing account into a test
account needs a super administrator. Unlimited currency needs both a test
account and an active entitlement. In production only super administrators can
grant that entitlement and QA scenarios are switched off; in sandbox and
development testers can. Test accounts are excluded from leaderboards and
economy analytics.

**D21. Reports never reveal anything.** Reporting a player, set or room always
returns the same answer, whether or not the target exists or was reported
before, so reports cannot be used to probe for accounts. Repeat reports from the
same person merge.

**D22. Refusals do not explain privacy settings.** A refused friend request reads
the same whether the player blocked you, accepts requests only by code, or
accepts none. A player who blocked you looks the same as one who does not exist.

## Classes and data

**D23. Assignments can use a teacher's private set.** Students play it in a solo
room linked to the assignment; the set itself stays private, so students never
get its answer list. Only solo-capable modes can be assigned.

**D24. Students never see each other's results.** Students see their class,
their teacher's display name and their own results. Teachers see their own
classes' rosters (display name, username, level) and results.

**D25. Leaderboards show names, levels and avatars only.** The global board has no
account ids or usernames; friend and class boards include ids because those
players can already open each other's profiles. Players can opt out.

## Balance

**D26. Gloom Giant's shield defaults to 3 per player.** With the original half a
shield per player, simulated rooms of 12 players at 80% accuracy never won.
With 3 per player they win about 85% of the time and rooms at 70% still lose.
Hosts can choose a thinner shield.

**D27. Sky Lanterns caps the oil can at two lanterns.** Without a cap, holding
unlit oil and launching only on a gust removed all the risk the mode is about.

## Deferred, on purpose

**D28. Image uploads are not built yet.** Question images may only come from
Ludora's own upload store, never arbitrary URLs (the content security policy
also blocks external images). Until uploads exist, new sets have no images, and
existing image fields are preserved when a set is edited.

## Classrooms and originality

**D29. Rate limits count accounts, not school IPs.** Schools usually put every
pupil behind one public IP. The global API limit is therefore counted per
account for signed-in requests (guests included) and per IP only for anonymous
ones, static files are not limited at all (one page load fetches dozens), and
room lookups and joins allow a few classes at once. Sign-in, sign-up and
recovery stay per IP even with a session, so a fresh guest is not a fresh
budget. The end-to-end suite found this: forty page loads from one address got
blank pages.

**D30. Ludora's look and characters are its own.** The genre's conventions are
fair to use: bright colour, chunky controls, collectible characters, packs with
disclosed odds, live games joined with a code. Another game's characters,
artwork, names and branding are not, even on request. Visual work goes into
Ludora's own Glims, Lanterns and style.

**D31. Shipped item art updates itself until staff customise the item.** Redrawn
Glims should reach existing installs without a forced reseed, which would also
wipe staff edits. Items carry `customized_at`, set by any staff edit (the
migration marks items already changed since creation). On start the seed
refreshes art, name and description for uncustomised shipped items when they
differ, and never touches rarity, collection or release state.

**D32. Account type is self-service, with two limits.** It only decides who can
make classes, so anyone with an account can switch between player, student and
teacher in Settings. Under-13 accounts cannot become teachers, and a teacher
archives their active classes before switching away, so students are never
left in a class nobody runs. Modes that wait for a host (a host-paced variant
with automatic moving on turned off) cannot be assigned or played solo: the
server refuses them, using the same check as the assignment picker.
