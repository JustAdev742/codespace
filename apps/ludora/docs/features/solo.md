# Playing solo in stages: your questions, a game, then your settings

The owner, after playing solo on the live site, felt the settings choice was missing or not a proper
step. Solo stays on the host page (`/host?solo=1`, every entry point unchanged), now as three
stages a player moves through: 1 Questions, 2 Game mode, 3 Your settings, then Start playing.

What a solo player could not set before, compared with hosting:

- **A made game (Mode Studio) had no settings at all.** "Play with these questions" started the room
  at once with three Mixed-class bots: no choice of bots, their level, or only the hard questions.
- **The settings were not a stage.** The panel appeared only after a mode was picked, below 25 mode
  cards (on a phone, thousands of pixels down), while the sticky bar offered Start playing straight
  away. A player who picked a mode and pressed Start never saw it.
- Hosting's extra fields (teams, the room switches) do not apply alone and stay hidden. Most
  self-paced modes read only "Time limit" plus their own rules; "How many questions" and "Seconds
  per question" appear for the modes that read them (Word Scramble reads both; Flashcard Study reads how many questions). Solo
  offers the same modes as before (host-paced modes are still left out on the client).

| What a person now sees or can do | Where it lives | How it was verified |
|---|---|---|
| A "3 Your settings" stage on the solo page from the start (before a game is chosen it says what it will hold), with the mode's time limit, how many questions and seconds per question where the mode reads them, "Which questions" (only the hard ones) where the set marks difficulty, the mode's own rules, and practice bots with their level | `web/src/features/host/HostSetup.tsx` (`Setup`, solo branch) | `e2e/solo.spec.ts` "a solo player chooses their settings as a stage…" (changes questions, seconds, word timer, hard only, 2 Hard bots; axe at 390 and 1366) |
| The sticky bar says what Start playing will start ("Word Scramble with “Planet words”: 4 questions, only the hard ones, 30 seconds each, 4 min to play, 2 bots (Hard)") and has a "Your settings" button beside Start that brings the stage into view and focuses its heading; Start stays in the bar wherever the page is scrolled | `HostSetup.tsx` (bar, `toSettings`), wording in `web/src/features/host/soloSettings.ts` `soloSummary` | `e2e/solo.spec.ts` (bar text, heading focused); `soloSettings.test.ts` "says what Start playing will start" |
| The game the server makes honours the settings: its room has the chosen questions limit, seconds, mode setting, only the hard questions and the chosen bots | unchanged server (`POST /api/rooms`); the page sends them | `e2e/solo.spec.ts` reads the room view on the socket: `common.questionLimit` 4, `questionTimeSec` 30, `settings.wordTimer` true, at most 5 questions (the hard ones), 2 bots |
| What a player changed for a game (mode, variant or made game) is where that game starts next time on the same device, with a line saying so; other games keep their own defaults; defaults from the set still fill in the rest | `soloSettings.ts` (`readSoloPrefs`, `writeSoloPrefs`: local storage, cleaned on read, 30 games at most), `HostSetup.tsx` `startFrom` | `soloSettings.test.ts` (5 tests); `e2e/solo.spec.ts` (second visit shows 4, 30, timer on, 2 Hard bots; Gold Rush still 0 bots) |
| Games made in Mode Studio are chosen in step 2 as cards like the built-in modes (yours first, then public ones, playable only), and go through "Your settings": bots (three by default, as before), their level, only the hard questions. Mode Studio's Play solo link (`?blueprint=`) arrives with that game chosen and asks only for the set. Hosting a class keeps Mode Studio's own section | `web/src/features/host/SoloMadeGames.tsx`, `HostSetup.tsx` (`pickMade`, `playMade`) | `e2e/solo.spec.ts` "a game made in Mode Studio…" (request has `blueprintId`, `difficulty: 'hard'`, 1 Easy bot; the room has 1 bot; axe at 390 and 1366) |
| Arriving with a set (`?set=`) or a mode (`?mode=`) already chosen still works: the other is asked for, and a mode arriving this way gets its settings stage (and remembered settings) at once | `HostSetup.tsx` preset effects | `e2e/solo.spec.ts` "arriving with a set or a game already chosen…" |
