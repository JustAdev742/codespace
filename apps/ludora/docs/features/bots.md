# Practice bots that play like people

A practice bot used to be a coin: right with a fixed chance, after a random delay, and in modes with
choices it mostly did the first legal thing. Server practice bots now have a **mind**: a model of a
player written in code (no outside service, no learning library), seeded from the room's code and
game so a game's bots replay the same.

The engine's test harness (`simulateGame`, `ChaosSim`, `simulateTower`) is untouched: its bots have
no mind and play exactly as before. The mind is an optional `mind` on `BotContext` that only the
server's rooms supply; `GameRuntime.botAction`/`botDelay` take it as an optional last argument and
fall back to the old path, with the same random draws, when it is absent.

| What a person now sees or can do | Where it lives | How it was verified |
|---|---|---|
| Each bot is someone: one of seven original personalities (Careful, Quick, Steady, Strong finisher, Nervous starter, Guesser, Daydreamer), a point in ability, speed, consistency, nerve and attention, plus how it moves through a game (shaky start, second wind, how much a mistake knocks it), with personal variation so two Steady bots differ | `packages/engine/src/bots/personas.ts`, words in `packages/shared/src/practice.ts` | `packages/engine/test/bots-mind.test.ts` ("two bots of the same personality differ … replays exactly") |
| Bots miss hard questions more than easy ones: difficulty is estimated from the question itself (type, length, choices, number size, how alike the choices are, authored difficulty) | `bots/difficulty.ts`, `bots/mind.ts` `plan()` | bots-mind test "misses hard questions more than easy ones" |
| Bots remember: a question seen earlier in the game is more often right, a wrong idea sometimes comes back; each bot is consistently better at some topics than others | `bots/mind.ts` (`seen`, `leaning`) | bots-mind test "right more often the second time" |
| Wrong answers look human: the look-alike choice, the number one off or with digits swapped, a similar word from elsewhere in the game or a bad misspelling, two neighbours swapped in an order, half a matching right, one gap or one item wrong (partial credit applies) | `bots/wrong.ts` | bots-mind test "is wrong like a person" |
| Answer timing: reading time from the words on screen, typing or dragging time, then thinking time with a long tail; quicker when sure, slower when hard, sometimes drifting off, sometimes holding on to the last second, never under 0.9 s; on a short clock a bot can run out of time (a Guesser throws something in instead) | `bots/mind.ts`; the runtime holds the mode's action until the mind has finished thinking (`runtime.ts` `mindedBotAction`, `mindedBotDelay`) | bots-mind tests "human spread of times", "runs out of time"; runtime test "holds the action until it has thought" |
| Bots have feelings: confidence grows on a streak and wobbles after mistakes (a Nervous starter tilts, a Steady bot shrugs), tiredness over a long game, a second wind near the end | `bots/mind.ts` `commit()` | bots-mind test "feels a run of results" |
| Levels people understand on the solo setup: Easy, Medium, Hard, **Mixed class** (the default: a spread of personalities and abilities) and **My level** (bots follow the player's own accuracy and speed in this game). The setup lists, in words, the personalities each level brings. The client only names a level; the server builds the bots | `web/src/features/host/HostSetup.tsx` (`BotLevelPicker`), `server/src/modules/rooms/routes.ts`, `server/src/realtime/room.ts` (`addPracticeBots`, `makeMinds`) | `e2e/bots.spec.ts` test 1 (Chromium, Firefox, WebKit; axe at 390 and 1366); `server/test/rooms.test.ts` "practice bots with personalities" |
| Bots a host adds in the lobby are a mixed class and each seat shows its personality ("Careful", "Guesser") | `room.ts` `addBots`, `RoomPlayerView.persona`, `web/src/features/room/Lobby.tsx` `Seat` | `e2e/bots.spec.ts` test 2 (three browsers, axe) |
| Every one of the thirty modes plays with minded bots: a mixed class finishes with no error, stall or answer leak, the results spread out, and over four games two Hard bots place above two Easy bots of the same personality | each mode's `bot()` dispatches to `mindedBot` when `ctx.mind` is set; `packages/engine/src/testing/minded.ts` | `packages/engine/test/bots-modes.test.ts` (31 tests) |
| A solo race against a Mixed class plays to the end in the browser, with the bots moving at different moments (seen from the room's own views) | — | `e2e/bots.spec.ts` test 1 |

## Mode policies

Each policy scores the options a player would see in their own view, adds noise scaled by the
personality (`BotMind.choose`), and picks. Bots act only on their own view.

- **Real policies for the choices beyond answering (20 modes):** Confidence (wager from self-belief and the
  stakes), Glimgo (mark when its answer is on the card; otherwise only a bold bot gambles), Lantern Match
  (explores unseen cards, never retries a pair it has tried, forgets with poor attention), Word Scramble
  (hints when unsure, skips after misses), Gold Rush (each dig weighed: average find against cave-in chance
  and cart), Sky Lanterns (launch now against waiting, given the storm chance), Night Market, Lantern Guard,
  Glim Duels (powers by feel; timing from the mind), Lantern Trail, Lantern Lands (claim, raid, fortify or
  save energy), Festival Workshop, Big Catch (reaction time to a bite, keep or sell), Corner Shop (till
  against question by attention), Code Breakers, Summit Scramble (leap odds against nerve), Spot Kick,
  Lantern Rally (spending boosts), Tower Together (margin under the wind line), Glim Garden (giving against
  tending its own plot).
- **Partial:** Glow Tag keeps the plain bot's movement tactics, with the mind's own reflexes (slow or
  dreamy bots react late) and its own random stream; its answers come from the mind.
- **Answering is the only decision (9 modes):** Classic, Comet Dash, Quick Draw, Lantern Out, Time Attack,
  Survival Run, Gloom Giant, Tug of War and Flashcard Study (its self-grade). They use the mind for what,
  how and when to answer.

## Not changed

Scoring, rewards and mode rules are unchanged. Practice bots still earn nothing and do not change what a
player earns. `PRACTICE_LEVELS` keeps its accuracy and pace numbers (the fallback for a bot without a mind).
