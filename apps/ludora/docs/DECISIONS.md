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

**D28. Question images come only from Ludora's own upload store.** Never
arbitrary URLs: the content security policy blocks external images too.
Uploads are checked without an image library (format from the bytes,
dimensions from the header, metadata stripped by rewriting segments), which
keeps native dependencies out of the server. Uploaded images are served for a
day at a time, not forever, so an image moderators hide stops showing soon.

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

**D33. A set that class assignments use cannot be deleted.** The database would
cascade and silently remove the assignments, and with them a class's work.
The server refuses and says how many assignments use the set; the teacher
removes them first or makes the set private instead.

**D34. A variant changes a rule, never just a number.** Titles promise a
different game, so each variant turns on a rule the base mode does not have
(a penalty, a multiplier, a knockout, a co-op goal, a returning question) and
says plainly what changed. New rule settings default to off, so the base modes
play exactly as before; a question that comes back is recorded as an attempt,
so it never pays twice. Rules that would need new screens wait for them.

**D35. Free squares never make a Glimgo line on their own.** A small set leaves
several free squares on each card, and a row made only of them used to count as
a finished line, so a player's first correct mark anywhere won the game. Only
lines with at least one answer square count now.

**D36. A Glim looks as rare as it is, everywhere.** The lobby, leaderboards,
podium and every mode screen show each player's own buddy with its real rarity
finish, and the winner's glow only adds light around it. A common Glim that
wins still looks common, so a game never shows a rarer collectible than the
player owns.

**D37. AI drafts are for teachers, and every draft is reviewed.** Claude drafts
questions only for teacher accounts, creators who publish public sets, and
staff, never guests or children, and only when the server has a key and staff
have switched the flag on. Drafts arrive in the editor like an import: the
teacher unticks what they do not want and edits the rest before saving, so no
AI text reaches players without a person choosing it. Each draft must pass
the same question rules as a typed one; any that fail are dropped and counted.
Daily allowances per account and per site cap the spending. Requests are
recorded without their topic, so a teacher's notes are not kept.

**D38. No email; sign-in help comes from recovery codes, teachers and support.**
Most players are children, and an email address is personal data Ludora does
not need. So accounts do not collect one. Everyone gets a recovery code at
sign-up. A student who loses theirs asks their teacher, who can make a new one
from the class page; teacher and staff accounts ask support. A teacher's code
changes nothing until the student uses it, the student is told who made it,
and the audit log records it without the code. This also means there are no
reset links to phish.

**D39. A question someone joins halfway through does not count against them.**
A player who joins while a question is open may still answer it, and scores as
usual if they do. If they do not, the reveal says they joined during the
question instead of showing a red "Not this time", and their streak is
untouched. The engine reports this as `joinedLate` in the synced-round view, so
every mode built on synced rounds can say the same. In a knockout game, people
who join after the start watch, because they would have dodged the questions
that knocked others out; the screen says they are watching, not that they are
out.

**D40. A host may have six games open, and closes them from the Host page.**
Only games in the lobby, running or paused count toward the six; finished and
solo games do not, so a finished game no longer blocks a new one for 20
minutes. "Your open games", on the Host page and the home page, lets a host
rejoin a game they left or close it. Closing a game in progress ends it the
way End game does: it is saved and players see their results and rewards.
Closing a lobby sends its players out. Only the room's host can close it, and
anyone else gets the same answer as for a code that does not exist, so codes
cannot be probed. A finished room stays open for its results screen and Play
again, but once a host holds more than six rooms the oldest finished ones
close, so Play again in old rooms cannot take a host past the limit.

**D41. Sound is made in the browser, and phones keep to their own.** Every
effect and both music loops are synthesised with the Web Audio API from
Ludora's own notes, so there are no recordings to license or copy. Music plays
on the host's screen and in solo games only: thirty phones playing music in
one classroom would drown the teacher. Phones play short sounds about their own
answers; the clock, the reveal and players joining sound once, on the big
screen. Effects and music are on by default and follow the account's Settings.
A speaker button in every game mutes the device at once, and the choice is
remembered on that device. Nothing plays before the person has interacted with
the page, as browsers require.

**D42. The playable demo runs the server's own room in the browser, on its
own build.** GitHub Pages serves only static files, so the demo cannot have
accounts, rewards, the shop or classes, and does not pretend to. It runs a
real game instead: the same `Room` class the server runs (it uses nothing
Node-only), with the page as the player's screen and the host's big screen,
and practice bots in the other seats. Its save hook does nothing, so no
rewards are paid and nothing is stored, and the API client refuses every
request in the demo build, so the static page never calls a server. Host-paced
modes run with Automatic advance on, as nobody is at the front to press Next;
the one variant that locks it off (Discussion) is left out. The demo is a
separate Vite entry (`web/demo.html`, `vite.demo.config.ts`) with relative
paths and hash routes, so it works at a project's Pages address and survives a
reload. It shares the app's screens unchanged, and its own end-to-end tests
serve it under a sub-path with no server, as Pages does. Pages publishes from
the default branch, and only once the repository turns Pages on.

**D43. Music and effects are rendered offline from Ludora's own scores.** The
synthesised sounds of D41 were thin next to the games players know. The scores
and effects are now code in `tools/audio`. They render through FluidSynth with
the MuseScore General soundfont (MIT; some samples public domain or CC0), then
are mixed and mastered in Python: EQ and compression from pedalboard, a reverb
generated in code, and loudness measured to ITU-R BS.1770. There are still no
recordings, loops or sound packs from anywhere else. The soundfont's notice
ships next to the files (`web/src/assets/audio/CREDITS.md`).

The build's output is committed (the MP3s and a generated manifest), so
building the app needs no Python. Rebuilding with no changes gives
byte-identical files. A loop's file holds half a second of music either side of
the loop, so a decoder that shifts the audio by a few milliseconds cannot break
the seam.

Each kind of game has its own track, with a final-stretch track for the end and
results music after the fanfare. In the browser, the common effects load first
after the first interaction and the rest follow in the background; until a file
is ready, its synthesised version plays. Phones fetch the effects (about
1.4 MB) but never the music. Who hears what is unchanged from D41.

**D44. New modes are games first: a choice after every right answer, and
players affecting each other.** Players asked for modes as lively as the
games they know, not a quiz with a skin. Each new mode is built around:
- a decision after answering (which lantern to open, which tower to build,
  which power to spend);
- ways to affect other players, each with a limit;
- room-wide events;
- a way back for whoever is behind.

The limits are part of the design:
- Tricks can be blocked by shields everyone can see.
- A player who was just tricked is safe for a few seconds, and nobody can
  trick the same player twice in a row.
- A choice nobody makes is made for the player after a short time.
- Co-op modes scale their toughness with the size of the room.

Every random outcome uses the room's seeded generator on the server, and its
odds are shown to players where they choose. Balance is tuned with bot
simulations before a mode ships, and the numbers go in its commit. The
mechanics, names and art are Ludora's own.

**D45. The origin check also accepts the address a request was sent to.**
Ludora is reached at addresses its operator cannot always name in advance:
- a Codespace's forwarded `app.github.dev` address;
- the localhost port VS Code desktop forwards it to, which can change when
  the port is busy;
- a school network address.

With a single configured origin, a page at any of these loaded but every
sign-in, join and game connection was refused as an unexpected origin.

The check now also passes when the page's origin is the host the request was
sent to (the `Host` header, or `X-Forwarded-Host` behind a trusted proxy).
This keeps the protection:
- A cross-site page sends its own origin, while its requests carry our host.
- It cannot set `X-Forwarded-Host`: that needs a CORS preflight the server
  never answers, and browsers add no headers to WebSocket handshakes.
- The `x-ludora-csrf` header requirement, the first line against forged
  requests, is unchanged.

**D46. Ludora looks like a game for 8 to 17, not for small children.** The
first look read as made for young children: a bubbly display font,
ink-outlined "sticker" pieces, lilac washes, string lights, drifting paper
lanterns and blush-cheeked Glims as decoration. The owner asked for the range
Blooket plays to. The games that age group chooses in class do not win with
cute art. They win with:
- competition shown live: ranks that move, streaks, a podium;
- collectibles with status;
- saturated colour on dark;
- instant, neutral feedback;
- short words.

The new direction is "game night, live" (docs/DESIGN.md):
- a midnight stage under a floodlight, with faint arena glows in the corners
  and no pattern;
- Barlow Condensed for headings and numbers;
- solid pressable pieces with a darker bottom edge instead of ink outlines;
- one signature device, a slanted plate for big moments;
- Glims only where a collectible belongs, redrawn without blush and with
  more attitude;
- rarity shown like a trading card;
- straight-talk copy: "Incorrect", never "Not this time".

An early version put a faint grid of squares on the stage; the owner found it
horrible on game screens and sign-in, and it is gone. It stays Ludora's own
(D30): no other product's fonts, colours, layouts, art or words. Behaviour,
odds and sound are unchanged.


**D47. Chaos is an Easter egg anyone can find, kept secret by the server.** The
owner asked for a hidden cheat menu that any player can unlock, themselves
included, with no admin grant and no request form, and for the cheat code to
stay hidden from people who download the app's files. So:

*Superseded by D54 (the cheat system is removed from the code, 15 November 2026).*

- The unlock is a four-stage sequence (knock, riddle, ritual, light) checked
  stage by stage on the server. The knock comes from a server secret, the
  riddle and ritual are drawn fresh each attempt, and the browser only
  reports what the player did. Finding it is the only way in.
- The unlock lives on the account until the player puts the lantern out.
  Effects never outlast a game and never touch Sparks, items or collections.
- Casts run in the game runtime's transactions and either change real state
  or are refused. The server checks the unlock on every cast.
- The menu's code and the cheat list are served only to unlocked accounts and
  answer 404 otherwise; the public build holds no cheat, and CI checks that.
- Chaos must not buy rewards: a caster earns nothing from that game and places
  earn nothing for anyone. The host can calm the room and assignments never
  have chaos.
- The brief asked for 1,000 cheats. 666 are built and each passes a test that
  shows it changing a real game; the count is reported as it is rather than
  padded with copies (docs/CHAOS.md).

**D48. The site dresses itself by a Sydney calendar, worked out on the server.**
Seasons are Southern Hemisphere (summer is December to February) and the
celebrations are school friendly ones most Australian schools mark: New Year,
Australia Day, Lunar New Year, Harmony Week, Easter, Science Week, Book Week,
Spooky Week and Summer Christmas. Dates that move are worked out by rule
(Easter by computus, the August weeks by their usual Saturdays, Lunar New Year
from a published table to 2035). Where a real event's dates are set by someone
else, the rule follows recent years and staff can move or drop it for one year;
nothing has to be switched on. The server answers from its own clock, so a
changed device clock changes nothing, and the browser only works it out itself
in the demo, which has no server. A school's own events are not invented: the
calendar holds no school's dates, crest or branding.

**D49. Monthly Glims are on sale for their month only, and kept forever.** Each
month has its own collection of seven Glims, sold only in that month's Lantern
(standard odds rescaled to its rarities, shown on the Lantern, pity at 15), and
one accessory. Both go on sale at midnight on the 1st in Sydney and leave at
the last second of the month. Whoever found a Glim keeps it; the collection
stays in everyone's book after its month with a note that its Lantern has
gone, and a month still to come is not shown. Monthly Glims never appear in the
daily picks or the Moonlit Lantern, so the month is the only way to find them.
The drops run October 2026 to March 2027; later months are added the same way
(`packages/content/src/monthly.ts`).

**D50. The Creator Studio is a role the server checks, not a hidden page.**
Chosen people get the `designer` role through the same audited role system as
every other role (Staff, Players, or `npm run admin -- grant <username>
designer --reason "..."` on the server); there is no secret link, flag in the
browser or name that grants it. Designers have `studio.use` and
`studio.publish` and nothing from the staff panel. Every Studio route checks
the permission on the server and refuses guests; anyone else who opens
/studio sees the ordinary "page not found", and the nav shows no Studio.
What designers make keeps the house style because it can only be built from
the Glim genome and the cosmetic vocabulary (no uploads), with the
catalogue's naming rules, unique names and looks, rarities up to legendary
and Spark prices inside a band for each rarity. Publishing needs a reason and
is audited. A Studio Lantern publishes its Glims into their own collection,
on sale only between its dates, with the standard odds shown; Studio Glims,
like monthly ones, never appear in the Moonlit Lantern.

**D51. A made game is a saved setup, checked like a room.** The Game Maker
saves a mode (2D or 3D) and variant, its settings, a question set, a name and
a cover. The server checks it as it would a room: the mode and variant exist
and the maker may host them, settings are clamped to the mode's own fields
and a variant's locked settings win, and the set is one the maker may play.
Games are private, shared by link, or (for accounts trusted to publish sets)
listed in Community games; makers show by display name only, and moderators
can hide a listed game, audited. Making happens on the host page itself (Save
as a game), so there is one place to set up a game, not two.

**D52. A school's events come from its teacher, never from Ludora.** A
teacher can type their school's name on a class and schedule events for it
(a carnival, a Book Week parade, a house day): a name, a line for students,
dates (a month at most) and decorations from the seasonal set. Students in the
class see an event on their home page while it is on, in place of the
season's garland, and on the class page with what is coming. Ludora holds no
school's dates and shows no crest or logo; the school name is plain text as
the teacher typed it, so "The Hills Grammar School" appears only where a
teacher there wrote it.

**D53. The cheat menu is removed; the unlock stays (15 November 2026).** At the owner's request, the menu that unlocked players cast cheats from is gone. The app no longer serves the cheat list or the menu's code, and nothing in the app can cast. Kept: the knock, riddle, ritual and light; the unlock and its audit entry; the server's cast rules; the cheats in the engine. Removed: the lantern button in games, the private menu build (`web/extras-menu/`, `web/vite.extras.config.ts`), the `/api/lantern/book` and `/api/lantern/book.js` routes, and the `WEB_PRIVATE_DIST` setting. The end-to-end test now checks that nothing is left to open.

*Superseded by D54 (the cheat system is removed from the code, 15 November 2026).*

**D54. The cheat system is removed from the code (15 November 2026).** At the owner's
request every cheat is taken out of the code. This supersedes D47 and D53, which kept
the secret unlock. Deleted: the cheat engine and its catalogue, the server module, the
`room:chaos` socket event, the cheat menu in the app, the secret unlock (knock, riddle,
ritual and light), the `ChaosSim` test helper, the `CHAOS_SECRET` environment variable,
the CI check that kept cheats out of the public bundle, and docs/CHAOS.md. The two
database columns, `users.chaos_unlocked_at` and `game_sessions.chaos`, stay in the schema
but are no longer written or read, so no data is dropped. Migrations are not rewritten.
Kept: Game Maker's extras (power-ups and events), and the lantern game modes and their
art. Later the same day the owner asked for the anti-cheat wording to go as well: the
`cheating` report reason, its privacy line and the sales-deck claim are removed. Hidden
answers and server-decided scores stay, because the game depends on them.


**D55. A live game reports integrity signals to staff, and does nothing else
(18 November 2026).** At the owner's request Ludora notices three patterns in
a live game and tells staff. This is not the cheat system D54 removed and
brings none of it back: there is nothing a player can use, no `cheating`
report reason, and nothing in any player's or host's screen. A reported player
is scored, ranked and treated exactly as before, so a wrong signal costs a
player nothing. The rules are in `server/src/realtime/integrity.ts`, a small
file with no I/O that the room hands facts to.

- *Answers faster than a person can read.* 5 right answers in one game, each
  under 250 ms after its question opened, by the server's clock. Five, not
  three, and only while at most one in ten of the player's answers that fast
  were wrong: number keys answer, so a key held down is as fast as a program
  and right by chance, about one game in eight at three on true-or-false
  questions. A program that knows the answers is right nearly every time. The
  engine now reports the clock time between a question being presented and
  its answer, because the response time it scores with stops for a pause and
  is halved by extra time; either would have reported a pupil for a teacher's
  pause or for their own access arrangement.
- *Moves the game does not allow.* 5 messages in one game that the app never
  sends: not a move at all, not a move this mode has, or a host command from a
  player. Moves the rules refused are not counted. The modes have over 200 of
  those refusals and they are ordinary play (a second tap, an answer as the
  timer ends, a tap during a pause, "You need 30 more gold"), all reported by
  the engine with one code, so counting them would report slow connections
  and impatient fingers.
- *One device playing as many players.* 3 players connected at once from one
  browser. Not by network address: a class shares one. Not by address and
  browser name either, which the brief allowed as weaker evidence: a set of
  identical school tablets shares both, so every such class would be
  reported, at any count. An account already holds one seat in a room
  whatever it does. For players who join with only a name the server held
  nothing that meant "the same device", so a join now also sends the
  reconnect token of the seat that browser last took in that room. That is a
  token Ludora already gave it, it identifies nothing outside the room, and
  no new cookie or device id was made. Two seats are not reported: that is a
  pupil who rejoined under a new name with the old tab still open. A private
  window or a second browser is not noticed; that is the price of not
  guessing from the address.

A signal goes out once for a player and kind in a game, as a warn line in the
server log (for the operating system layer to turn into an alert) and an entry
in the existing audit log, `room.integrity_signal`, so no table or migration
was added. Both carry the name shown in the game, never an address, an
account id or an email. Practice bots are never watched, and the playable demo
watches for nothing.

**D56. The home menu is a calm 3D place over a real menu, and the Hills Grammar copy wears
the school's colours and colour logo (18 November 2026).** Two requests in one piece of work.

*The menu.* The owner asked for the signed-in home to be a 3D, interactive place rather than
flat cards. The Hills Grammar School had just told us the games over-stimulate, so the place
(the yard: the player's buddy on a dais, ringed by a hosting board, a practice target, an arcade
cabinet, a quest board, a lantern stall and a podium) impresses with depth, light and response
to the player, not motion. Nothing moves by itself except breathing and lamplight that change
over several seconds. Everything else answers the player: the view leans a few degrees with the
pointer or a tablet's tilt, a drag looks round, the buddy turns its head to the pointer, and the
place whose link is hovered or focused lights and the buddy points to it. With reduced motion
or Calm the picture is still and is only redrawn when something changes. At rest it draws about
15 frames a second, every frame only while the player is doing something, and not at all when
hidden or scrolled away.
- The menu is ordinary HTML, on the page from the first paint and in one Tab order: the join box,
  six links (Host a game, Play solo, Game modes, Quests, Lantern shop, My Glims), the buddy's
  link to the locker and the 3D switch. The canvas is decoration behind it (the links stand over
  the things they lead to), never the navigation. Without 3D the same links sit round a drawing
  of the buddy on a wide screen, and in a grid on a phone or tablet.
- Three.js and the scene are fetched only after the flat menu is up, in an idle moment, so the
  first paint never waits for them and the entry bundle carries none of it.
- 3D or flat is decided before anything is fetched (`features/home/place/capability.ts`, with
  unit tests): no WebGL, 3D off in the graphics menu, data saver, or WebGL drawn by the processor
  (school Chromebooks) mean flat. If the first frames on a device run under about 20 a second,
  the flat menu comes back and the device remembers it. A player can switch either way; a player
  who asked for 3D keeps it, with the usual lowering of resolution and quality.
- Reused, not added: the existing `Stage3D`, `World`, `Glim3D`, props and quality tiers. `World`
  gained `wantsFrame()` so a scene can skip frames, and `Stage3D` an `onUnavailable` callback so a
  page that works without 3D takes over by itself rather than offering the "3D off?" tip.

*The school's look.* After the playtest the school asked for its colour logo and its colours.
Ludora's navy and gold give way to the uniform: deep bottle green for the chrome and the stage,
cream pages, action green for primary actions (white words), and the red only as a trim line
under the header. Bright green is kept for meaning (right, done, progress) and never used as a
surface, because the first, all-green version looked too much like Shrek. Dark mode is
green-black with cream highlights. The colour logo is never recoloured; it does not read on the
dark chrome, so it always stands on a warm-white plate. Ludora's own gold mark stays gold: it
is Ludora's, not the school's. Every text pair passes WCAG 2.1 AA (palette and ratios in
SCHOOL_LOOKS.md). Text on the highlight follows it wherever it is used as a fill
(`--on-lantern`), which the axe checks in the e2e tests caught on tabs.

**D57. Calm play is the host's choice for a room, enforced by the game's rules; every game opens
with a short walkthrough (18 November 2026).** The Hills Grammar School's playtest found the
modes over-stimulating, with no tutorial, and players having to "drive a car while answering
questions".

*Calm play* is a room option (`calmPlay`) the host sets before a game (Host page and Room
settings; it cannot change mid-game). New games take the host's saved choice (`host.calmPlay` in
their preferences, kept when they flip the switch), else the copy's usual: `CALM_PLAY_DEFAULT`,
or on when `SCHOOL_THEME` is set and off elsewhere. The server holds it and every screen shows it
(a Calm tag; "Your teacher chose calm play" in the lobby). It does two things:

- *Turns the room down on every screen, the big screen too*, whatever each player chose. It is
  the existing per-player calm mode plus "less motion", applied while the page shows the room
  (`setRoomCalm`, lib/prefs.ts), so everything that already obeyed those obeys it: no reactions,
  confetti, celebration bursts or flashing; still backdrops and covers; 3D scenes with no camera
  swoops or shake, fewer and slower particles and no seasonal drift. Sound is quieter (effects
  70%, music 55%), countdown ticks, the race grid's beeps and alarms are silent, and music is the
  gentle track all game with no final-stretch track. The timer counts down and nothing more: no
  coral, ring, beat or warning cue (a screen reader still hears "5 seconds left" once).
- *One thing at a time*, in the engine (`ctx.calm`, `mechanics/oneThing.ts`), so no client can
  get round it. I went through all 30 modes. Four ask a player to steer, aim or time something
  while a question is open, and now take turns in calm play:
  Lantern Rally (while a question is open the kart drives itself at cruising speed, passes every
  item and hazard, takes no slipstream, and its boost or slow-down waits; then 7 s to steer and
  boost with no question), Glow Tag (a player answering is hidden: cannot walk or tag, cannot be
  tagged, the ring takes no glow, for at most 30 s; then 10 s to walk and tag, with 4 s of grace
  from the ring), Big Catch (no casting while a question is open, and no question while the line
  is out; a player who sits on a cast gets the next question after 20 s) and Corner Shop (while
  everyone in a shop is reading a question or picking a delivery its queue waits politely: people
  arrive, nobody's patience runs down; then a go at the till until the queue is served or 12 s).
  The other 26 are turn-based, choose-then-spend or wait for an answer (Spot Kick picks a place
  and strength from buttons, Summit Scramble and Tower Together announce wind and gusts seconds
  ahead, Gold Rush, Code Breakers and Lantern Guard spend earned resources whenever the player
  likes, the rest are question-only): nothing in them competes with a question, so calm play
  changes only how they look and sound there, and a test proves each plays the identical game
  from a seed with calm play on or off.

*Fairness when some players are answering and others acting.* Everyone in a room plays under the
same rule, and each player's turns are their own. The game opens a question, never the player,
so nobody can call up shelter when in trouble. Waiting is never better than playing: a coasting
kart cruises with no boosts or lanterns and a driver who never answers finishes behind one who
plays (tested); a hidden tagger earns nothing, the shelter is bounded and an unanswered question is
then put away uncounted, and calm Glow Tag pays no bonus for still glowing at a ring change or the
end, so hiding can never score; the fish and the shop only pause what belongs to the player who
is reading. Scoring is otherwise unchanged, and with calm play off every mode plays exactly as
before (no extra random numbers or timers).

*The walkthrough.* When the host presses Start and anyone connected has not finished this mode's
walkthrough, the server opens it on every screen (`room.intro`) and the game waits. Each player
steps through two to four short steps from the mode's metadata (`meta.tutorial`, written for a
reader of 8 to 17 on a phone), the mode's controls to press and try (unscored, nothing sent),
what calm play changes, and Ready; or skips. The big screen shows the same steps large with how
many are ready, Start now and Back to the lobby. The game starts when everyone is ready or the
host says so, then the room's countdown if it has one. A finished walkthrough is remembered by
mode (`made:<id>` for a made game): in an account's preferences (`tutorials`, added to and never
replaced, newest 300; the server reads it at join) or, signed out, on the device. A player who
knows it is ready at once and sees a short note with "Show me how to play"; How to play in the
lobby replays it at any time. The host can turn it off for a game, and an operator for the copy
(`TUTORIAL_DEFAULT`); practice bots and "start now" never wait for it, nor does Play again.

No database migration: both preferences live in the existing `preferences` JSON. The playable
demo starts its game at once, with no walkthrough.

**D58. An economy manager runs the in-game economy, and nothing else (19 November 2026).** The owner asked
for "a super full economy role and so much more economy stuff". Read as: a staff role whose job is Ludora's
in-game economy with a proper control room, and more economy for players and teachers. Sparks, Moonstones
and Dust stay in-game only; there is no real money anywhere and none was added.

*The role.* `economist`, shown as "Economy manager", rank 3 (beside moderator and support), so only an
administrator or above can grant it (`canAssignRole`). It holds `staff.access`, `economy.view`,
`economy.configure`, `economy.grant`, `shop.manage` and `events.manage`, and nothing else: no `users.read`
(players' records), moderation, roles, catalogue, flags, system pages or `audit.read`. The server enforces
every one; the staff menu only follows. To grant without player records it has its own finder
(`/api/admin/economy/accounts`) that returns a name and kind only. It reads the economy's own part of the
audit log (`/api/admin/economy/activity`) and no other. Staff tools never change one's own balance, and that
now covers class grants and refunds too.

*The daily total.* An economy manager's grants (single and class) add up per currency per UTC day against
limits an administrator sets (`economy.limits`, a new permission only administrators hold; 20,000 Sparks,
1,000 Moonstones, 10,000 Dust and 2,000 of anything else by default). The total is read from the audit log,
which every grant writes in its own transaction, so the count and the grants cannot disagree; an advisory
lock per person makes simultaneous grants queue. Removals and refunds do not count (a refund returns what
was paid). Administrators are not held to it; the per-change cap (`REAL_GRANT_MAX`) holds for everyone.

*The economy room* is the existing Economy section, rebuilt as tabs: Health (per-day earning and spending,
sources and sinks, balance bands with a median and never a ranked list, most and least bought, daily-limit
hits, Lantern odds), Rules (with a live preview in example games computed by the same `computeGameReward`
that pays, a history from the audit log and a one-step undo of the newest change), Shop and sales (prices,
featured listings, sales with dates), Grants and refunds (single, whole class, refunds, the daily limit),
Ledger (with CSV, whose download is audited), Currencies and History. Every figure leaves out test accounts,
unlimited test currency and test resets. Tables, each with a sentence above it; there is no charting
library, so there are no charts.

*Sales and refunds.* A sale is a price and two dates on a listing (lower than the price, at most 31 days);
the shop charges it in the purchase transaction and shows "On sale until Friday", never a countdown
(`calmUntil`). A refund returns the price and takes back what the purchase gave (a bundle's cosmetics the
player already had stay theirs), once per purchase, idempotent and audited; refunded purchases no longer
count towards per-player limits. Lantern purchases are not refundable because the draw has happened.

*For teachers and players.* A teacher gives Sparks to one student or the whole class with a reason the
student sees, from a weekly budget per class in the economy rules (500 Sparks, at most 25 to one student at
a time, by default), recorded in `class_rewards` and pointed to by the ledger. This is the only way a teacher
gives currency: school merits still earn house points and never currency, and students cannot give each
other anything (gifting invites pressure and bullying). Anyone can switch to a teacher account and open up
to 30 classes, so the class budget alone would let a student make up classes and pass Sparks to a friend.
One student can therefore be given at most 100 Sparks a week (`classRewards.weeklyPerStudent`, in the rules)
across every class they are in; a whole-class reward leaves out anyone already at that total, tells the
teacher how many, and charges the budget only for the students it reached. The Wallet shows a player's balances, today's game
Sparks against the limit, a saving goal chosen from their wishlist, the week so far and every movement,
newest first. A Sparks boost (an economy event in the rules: a multiplier from 1.1 to 3 for at most 14 days)
multiplies game Sparks but never the daily limit, so it changes how fast a day's Sparks come, not how many.
Nothing compares players by wealth, nothing counts down and nothing nags.

*Migration 0024* adds nullable columns and one defaulted boolean to `shop_listings` and `purchases`, a CHECK
over the new sale columns (null on every existing row), and the new `class_rewards` table. All are quick on
a live database and leave existing rows unchanged; the new rule fields have defaults, so stored rules parse
as before.

**D59. Every section in the navigation says what you do there (19 November 2026).** The owner
asked for the sidebar's buttons to be easier to understand: a new student or teacher could not
tell Make from Game Maker, Question sets and Game modes, Collection from Locker and My designs, or
Host from Join a game. Each section now has a short line under its name in words a nine-year-old
knows ("Game Maker: Invent a game with code", "Locker: Dress up your buddy"), and the sections sit
under plain headings: Play, Make things, Glims and rewards, With others. The same names and lines
are in the phone's More sheet; the bottom bar keeps its short names (Home, Join, Host, Glims, More).

- *The line is the link's description, not its name.* A screen reader says the name, then the
  line; tests, voice control and links in docs keep finding a section by its name alone.
- *Two names changed, to match the page they open:* Host is "Host a game" and Studio is
  "Creator Studio". The rest keep their names, which are also their pages' headings.
- *Nothing merged.* Make is the front door to everything you can make; Question sets is the
  library (built-in and your own); Game Maker is writing your own mode; Game modes is the
  catalogue. Collection, Locker and My designs are three different jobs. Each now says which.
- *Settings is the gear beside the logo* (named "Settings" for screen readers and in its
  tooltip; in words in the account menu and the More sheet), so a student's whole sidebar fits a
  1366x768 laptop with nothing to scroll. A teacher's scrolls about 40px, staff's about 155px, and a
  school's look (its logo under Ludora's) about 90px for a student.
- *Sections for someone else are hidden.* The first group was not filtered, so students and
  signed-out visitors saw Lessons (teachers only) and visitors saw Make; they no longer do.

A section added later is one line in its list with a `hint`.

**D60. The Hills Grammar copy gets a finishing pass: the school is on every screen it is shown on,
and nothing of Ludora's navy is left (19 November 2026).** The owner asked to "make the Hills
Grammar version really good". I shot every surface in the school's look (laptop, phone and a
1920 board, both schemes) and ranked what was weak: what looks broken on the board in front of a
class first, then what pupils see every day, then rare screens. What changed, and why:

- *A player who picked Dark got Ludora's navy pages.* `:root[data-theme='dark']` in app.css is as
  specific as the school's block and comes later, so its navy won whenever the theme was set
  explicitly (the default, "match the device", was fine). The school's block now names that case
  too. Worst of the list because it was every page for anyone who had chosen Dark.
- *The board.* A two-minute question's "120" spilled out of the timer disc (Lato's figures are
  wider than Ludora's condensed face), so three figures are set a size down in this look. The
  game bar showed only a 30px crest; on a wide screen (the lobby from 1280px, a live game from
  1600px) it shows the school's whole colour logo on its plate. The lobby's floor, the spot
  under each player, the phone's "You are in" glow and the host's backdrops were lit Ludora blue;
  in this look they are the cream of the stage's light and the backdrops' navies are the blazer's
  greens at the same lightness (a colour map in `Backdrop.tsx`, CSS variables for the rest).
- *The phone's game bar* cut the game's name to "C": Ludora's mark, the crest, the Calm leaf and
  four buttons did not fit 390px. On a school's copy the crest alone stands for the game there
  (Ludora's mark is back from 640px), and in a calm room the LIVE tag gives way to the leaf.
- *The sidebar no longer scrolls.* The school's logo under Ludora's cost about 90px at 1366x768
  (D59). It now starts the page header on a wide screen, level with Ludora's mark, where the
  header had empty room; the sidebar is exactly Ludora's. The layout test checks this in both
  looks now. A school with houses adds a School row for every student, which scrolled about
  38px in either look; on a screen up to 800px tall the rows are now 3px shorter, so a student's
  sidebar fits with that row too (the layout test checks there is room for one more). A
  teacher's sidebar still scrolls, as in D59.
- *Small things that looked broken:* a disabled Join game read bottle green on grey (the rule
  that inks the highlight outranked the disabled grey); a focused white field on the stage had a
  white ring round it, which vanished (now cream with a green gap); the Locker's big buddy wore a
  look picked at random instead of the player's own uniform.
- *Made for the school, using only what the repository already has:* the browser's bar is the
  school's green and an installed copy is "Ludora at The Hills Grammar School" in its colours (a
  manifest of its own, served by `school-theme.ts`); the printable class login cards carry the
  crest and the school's name; the School page has them above its heading. No motto, house
  names, staff, dates or history were added: none is in the repository.

- *The front page.* A school's copy plays calmly by default (D57), yet its front page said "Answer
  fast. Climb the board." On a school's copy it now says "Quiz games for your class.", describes
  playing together one question at a time, and offers Sign in beside Host a game (students
  arrive with a login card; Create account stays in the header). Ludora's own front page is
  unchanged.

Left alone on purpose: Ludora's own gold mark and favicon (they are Ludora's), answer tiles A, B,
E and F, rarity colours and the seasonal garland (they mean something), and the 3D modes' own
scenes. Ludora's own look is unchanged; the default-look browser tests prove it.

**D61. Nothing tells a player they were right before the reveal, and the end of a game is a
ceremony the whole room shares (25 November 2026).** The owner asked for the live game to feel
like a top studio made it. I played it through as a host with phones beside it, and ranked what
stood between it and that. The look was already there; what was missing was anticipation and
payoff: results arrived early or all at once.

*Scores wait for the reveal.* In Classic, its 14 variants and Lantern Out a player's score changed
the moment they answered (and in Classic the streak chip with it), on their own screen, on other
players' leaderboards and on the big screen, while the question was still open for everyone else.
A score that jumped told the player the answer; a child can call it across the room. In Glim Duels
and made games played in rounds no screen showed it, but the streak sent to the player's browser
changed in the same way. The state is still scored at once, because rules read it (a knockout,
a pot, a penalty). What views show is `syncShown(s)`: scores and streaks as they stood when the
question opened, landing together at the reveal. A test plays each of those modes and variants
twice from one seed, differing only in whether one answer is right, and requires every view and the
room's news to be identical while the question is open. Quick Draw is left out by design: a buzzer
round ends on the first right answer and locks out a wrong one, at once. Self-paced games are not
affected: each player has their own question, and its result is theirs alone.

*The reveal is where the points land.* With nothing given away early, the reveal carries the
round: on the board the wrong answers lose their colour, the right one lifts as the chime plays and
the counts arrive; on a phone the result appears and its points reach the score. When the clock ran
out with answers still to come the board says so first ("time's up", a sound that shipped and was
never played). Docs/DESIGN.md now says how a moment is told in order.

*The podium is a ceremony, timed by the server's clock.* The end of a game was over in a second and
a half beside a panel of the host's buttons, and each phone showed its player's place at once, so
the winner knew before the board said so. In a room the podium now takes about seven seconds (third
place, second, a held breath, the winner), with each place named in type the back of the room can
read and the fanfare kept for the winner; the rest of the results wait for it, and the host can
skip it (a button, or Escape). Seven seconds is longer than DESIGN.md's 150 to 220 ms because it is
not interface motion but the one event a game builds to, seen once a game. Phones show the same
podium at the same moments, and a player's own card lands with their place. Every screen works out
where the ceremony has got to from when the game ended on the server's clock (`results.endedAt`,
beside `serverNow`), so nothing is sent between them, a screen that opens late joins part-way, and a
reload afterwards shows the result. A solo game keeps the quick reveal: nobody is watching, and the
player wants to go again.

*The moments are the room's; the movement is the device's.* The first version left the ceremony out
wherever motion was reduced, as the old reveal had been. That would have put a board with reduced
motion seven seconds ahead of the phones beside it, and left the ceremony out of every calm room,
which is how a school's own copy plays by default. So the ceremony's moments are the same on every
screen whatever its motion setting; less motion (the device's, the player's, or a calm room's)
changes how a place appears, not when: it is simply there at its moment, with no rise, landing or
shower (and in a calm room the sounds are at their calm level). This is the one place where
something waits to appear under reduced motion. It is a sequence in time, not movement, and the
host can still skip it; a solo game's reveal, which is only movement, is left out under reduced
motion as before. A second screen showing the game (the school's hall screen) runs the same
ceremony before its own lists.

*What was left alone on purpose.* Opening a Lantern stays at 1 to 1.7 seconds with the odds on
screen (D46): a chance-based reward for children is not the place to build suspense. The rewards
after a game now count up and show the level bar filling, and say how far the next level is, but
they only report: no countdown, no "one more game", nothing that nags. A wrong answer in a
self-paced game stays up long enough to read the explanation (about 180 words a minute, seven
seconds at most) instead of 2.2 to 2.6 seconds, with a button to move on at once: slower by default
after a miss, which also takes a little off guessing fast. No haptics were added: the buzz is a
setting a player turns on, off by default, and it stays that way.

No database migration. Two optional fields were added to what the server sends (`results.endedAt`,
`rewards.xpTotal`). Without them the app still works: the ceremony starts as each screen opens
rather than from the server's clock, and the rewards show no level bar.
