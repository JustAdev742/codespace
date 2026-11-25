# The live game: anticipation and payoff

Workstream `game-feel`, 25 November 2026 (decision D61). The owner asked for the game to feel like a
top studio made it. I played it end to end in Chromium on the production build (a teacher hosting
on a 1366x768 and a 1920x1080 board, two to four phones at 390x844, 375x667 and 360x640, guests and
signed-in students, solo with and without practice bots), wrote down what stood between it and that,
ranked it, and worked down the list. The look was already there. What was missing was anticipation
and payoff: results arrived early, or all at once, or flashed past.

The ranked list, as found:

1. A score gave the answer away before the reveal (a bug in the rules as much as in the feel).
2. The reveal, the one moment of every round, was flat on both screens: nothing landed.
3. The end of a game was over in a second and a half, and phones told the winner before the board.
4. A phone's answer tiles used a third of the screen.
5. The rewards after a game were a small number and a plain list.
6. In self-paced games a wrong answer's explanation was on screen for about 2.4 seconds.
7. A solo player saw no result of their own at the end, and Play again was two screens down.
8. Smaller things: a silent countdown, a board half empty on True or False, "Sol..." in a header.

## What changed

| What it was | What a person sees now | Where | How it was verified |
|---|---|---|---|
| In Classic, its 14 variants and Lantern Out, a player's score changed the moment they answered (in Classic the streak chip too): on their own HUD, in other players' leaderboards and on the big screen, with the question still open. In Glim Duels and made games in rounds the streak sent to the browser changed the same way, though no screen showed it. | Scores and streaks stand as they did when the question opened and land together at the reveal, on every screen. Mind the Embers' wrong-answer penalty waits too. | `packages/engine/src/mechanics/syncRounds.ts` (`syncShown`), `modes/classic/index.ts`, `modes/lantern-out/index.ts` | `packages/engine/test/reveal-secrecy.test.ts` (38 tests): each mode and variant is played twice from one seed, differing only in whether one answer is right, and every player's view, the host's view and the room's news must be identical while the question is open. 33 of them fail without the change. In the browser: a phone's HUD read "0 pts" while locked in and counted up at the reveal. |
| A phone showed "Correct +950" beside a score that had already changed. | The result appears, then its points reach the score in the HUD: the number counts up with a gold beat. A streak chip pops when it appears and bumps when it grows; the result says "3 in a row". | `web/src/features/room/game/parts.tsx` (`HudScore`, `StreakChip`), `countUp.ts`, `modes/classic.tsx` | Frames of the reveal captured in Chromium at 70 ms steps and in slow motion (animation rate 0.12): the HUD read 765 on its way to 950 beside "+947" counting up. |
| The big screen's reveal changed everything in one frame. | Staged in under a second: answers out of play lose their colour, the right one lifts and is checked as the chime plays, then the counts and their bars arrive (the bars are thicker). When the clock ran out with answers still to come, a "time's up" sting plays first and the answer waits a beat longer. | `game/AnswerInput.tsx` (`ChoiceTile`), `game/Reveal.tsx`, `stage.css` | Twelve frames in slow motion at 1366x768 (colour draining, the right tile lifting, the check, then the counts), and a round where the host called time. |
| At the reveal the timer vanished and the question jumped up the screen. | The question glides to its new place. | `game/glide.ts`, `modes/classic.tsx` | Slow-motion frames on the board: the question part-way to its new place. |
| Each answer arriving changed "2 of 3 answered" silently. | The count lands on its number with a small beat. | `game/parts.tsx` (`HudCount`) | Seen in the browser run. |
| Between rounds, leaderboard rows slid to their new places with their new totals already written. | Each score counts up from last round's total while the rows move. A climb is heard as its arrow lands: a player's own on their phone, anyone's on the board. | `game/Leaderboard.tsx` | Frames of the board at 150 ms steps (1,872 on its way to 1,950); `Leaderboard.test.ts` (3 tests of `placesClimbed`). |
| A player's own screen said "You are 2nd, 1,980 points so far". | It also says what it would take to climb ("130 more to reach 2nd."), or how far ahead the leader is; from below the rows shown, how to get onto them. | `game/Leaderboard.tsx` (`standingLine`), `modes/classic.tsx` | `Leaderboard.test.ts` (4 tests of `standingLine`); seen on a phone ("1,160 ahead of 2nd."). |
| On a phone, four answers sat in the top half of the screen with empty stage below. | In Classic, Quick Draw, Lantern Out and Confidence the answer tiles take the room the screen has left: about 210 px each on a 390x844 phone. A long question leaves less, down to the tiles' usual size. | `game/AnswerInput.tsx` (`fill`), `stage.css` (`.round-fill`) | Measured in the page on three phones through a game: tiles of 212 px at 390x844, 123 px at 375x667 and 115 px at 360x640, every one above the reactions bar, no sideways scroll. |
| Every answer was set in the same size whatever its length. | When every answer of a question is a word or two, its words are set a size up on the phone and the board, decided for the question so its tiles match. True and False stand taller on the board. | `game/AnswerInput.tsx` (`allShort`), `game/Reveal.tsx` | The board measured at 1366x768 and 1920x1080 at each question and reveal: never taller than the screen. |
| The podium rose in a second and a half beside the host's buttons; each phone showed "You came 2nd" at once. | In a room the podium is a ceremony of about seven seconds: third, second, a held breath, the winner, each named on a plate with the name in large type, a shower as the winner lands and the fanfare timed to it. The host's next steps, awards and standings wait for it. Phones show the same podium at the same moments and a player's card lands with their place. | `web/src/features/room/ceremony.ts`, `Results.tsx`, `music.ts` | `ceremony.test.ts` (9 tests: the timeline, joining part-way, ties, who gets which pace, the server's clock, the music). In the browser: the board and three phones (the winner's, third place's and fourth's) captured together at nine moments of the ceremony; a phone reloaded afterwards shows the result at once. |
| Under reduced motion the old reveal was skipped; a second screen showing the game (the school's hall screen) listed the top players at once. | The ceremony's moments are the same on every screen whatever its motion setting, so screens keep step and nobody's device tells the winner early. With less motion, or in a calm room, each place is simply there at its moment: nothing rises, lands or bursts. The second screen runs the same podium before its own lists. A solo game's quick reveal is left out under reduced motion, as before. | `Results.tsx` (`Podium`, `PodiumCeremony`), `features/school/Watch.tsx` | A game played with every screen on reduced motion, and one in a calm room, captured at the same nine moments: third place at 1.5 s, second at 3.3 s, "The winner" at 4.7 s and the winner at 5.9 s, with no shower. The hall screen opened beside the board and captured at four moments. |
| "Skip to the winner" was a button only, and when it went it left a keyboard's focus at the top of the page. | It keeps its name and also answers to Escape; if the button had the focus, the host's next step takes it. | `Results.tsx` | Driven in the browser: Escape skips it; Enter on the focused button skips it and focus lands on "Play again with the same players". |
| Screens could not have kept step: nothing said when the game ended. | Results carry `endedAt` on the server's clock; each screen works out where the ceremony has got to. | `packages/shared/src/realtime.ts`, `server/src/realtime/room.ts` | `server/test/realtime.test.ts`; `ceremony.test.ts` (`sinceEnd`). |
| Players level on points were "1st" and then "The winner". | "Joint 1st" for both. | `ceremony.ts` (`placeTitle`) | `ceremony.test.ts`. |
| A signed-in player's rewards were "59" beside "+56 XP" and a list reading "6/10". | Sparks and XP count up in their own tiles; the level bar fills from where it stood to where it stands (through a level-up when there was one) and says how far the next level is; each quest shows its progress as a bar. It only reports. | `web/src/features/room/Rewards.tsx`, `server/src/modules/progression/rewards.ts` (`xpTotal`) | `Rewards.test.ts` (4 tests); two signed-in students played to the end, with frames of the bar 300 ms apart; a second game in a row took the winner from level 1 to level 2, filmed as the bar ran over and the plate turned. |
| In ten self-paced modes a wrong answer's explanation stayed up 2.2 to 2.6 seconds, with a faint "Next question" under it. | It stays its mode's own pace plus the time to read the explanation (about 180 words a minute, 7 seconds at most). The way on is a full-width button with a line along its foot running out. A right answer is as quick as before. | `game/answerFlow.tsx` and the ten modes' screens | `answerFlow.test.ts` (4 tests); Comet Dash and Tug of War played on phones. The other eight were not played after the change: they share the hook or call the same function. |
| A player on their own saw rewards first, then "awards" won against nobody and a table of one. | Their screen opens on their own result (score, accuracy, how many right, and what they did as chips), with no table of one. A solo game leaves out the awards won against nobody; the only player in a teacher's room keeps the room's awards, as on the board. | `Results.tsx` (`EndCard`) | Solo Classic on a phone, alone and against three practice bots; `e2e/hosting.spec.ts` (one student in a teacher's room sees the award on both screens). |
| In a solo game Play again was below the rewards, two screens down on a phone. | Play again and Try another mode stay at the foot of the screen. | `Results.tsx`, `stage.css` (`.results-next`) | Solo runs at 390x844. |
| The start was silent. | The last three seconds of "Starting in" and "Get ready" tick on the shared screen (never in calm play). The intro names the question set, and the class's Glims take their places one by one. | `game/parts.tsx`, `host/overlays.tsx` | Board screenshot of the intro. The ticks were not heard: they are asked for through the sound engine, whose own rule leaves countdown sounds out of a calm room (`CALM_SILENT`). |
| A waiting player could make their Glim hop on the big screen, if they found out. | The lobby says so, and the player's Glim waves as they arrive. | `Lobby.tsx` | The phone's lobby passed axe with the line on it; the wave was not filmed. |
| With awards on screen the board's results were taller than a 1366x768 projector: by 99 px with three players and 234 px with eleven (measured on the build before this work). | They fit: the host's buttons are a little lower and closer on a short board, and the standings scroll inside the room that is left. | `Results.tsx` (`Standings`), `stage.css` (`.host-next`) | Measured before and after with 2 and 11 in the room at 1366x768 (0 px over), and with 11 at 1920x1080 (0 px over). |

## Bugs fixed on the way

| What was wrong | Now | Where |
|---|---|---|
| A solo game's phone header read "LIVE Sol..." | "Solo game" in full: the mark and the LIVE tag give way on a phone. | `RoomPage.tsx` |
| A player's own "Sunny Otter joined." dropped over their own "You are in". | Their own arrival is not news to them. | `RoomPage.tsx` |
| With the app's own "reduce motion" setting (and so in every calm room), an entrance with a delay stayed invisible for its delay before appearing. | The delay is cleared, as it already was for the device's setting. | `styles/app.css` |
| A long name in the final standings cut "(you)" off with it. | The name is cut; "(you)" never is. | `Results.tsx` |
| Lantern Out's "Answer locked in" did not show the answer on its tile as the other modes do. | It uses the shared panel. | `modes/lantern-out.tsx` |
| Six modes each carried a copy of the same hook, differing by a number. | One hook. | `game/answerFlow.tsx` |
| The school's second screen never loaded the room's motion stylesheet when opened by itself, so nothing on it that should rise, pop or count did. | It loads it, as the room, the demo and Game Maker's live test do. | `features/school/Watch.tsx` |
| A celebration burst was laid out as a box of its own size (up to 760 px), which could make a page taller than its screen while it played. | It is a point the pieces fly out from. | `art/bursts.tsx` |

## Left alone on purpose

- **Opening a Lantern.** It stays at 1 to 1.7 seconds with the odds on screen. A chance-based reward
  for children is not the place to build suspense.
- **Haptics.** The buzz on answering is a setting a player turns on, off by default. Unchanged.
- **Quick Draw's instant verdict.** A buzzer round ends on the first right answer by design.
- **The home pages, the host page, the lobby's layout and the join flow.** Looked at; they hold up.
- **Survival Run and Time Attack's own pace between answers**, which they set on purpose.

## Not done

- The other 26 modes' own screens (their boards, 3D scenes and special panels) were not restyled.
  They get what is shared: the result banner, the score landing, the streak chip, the leaderboard,
  the button between answers, the ceremony and the rewards.
- The full-screen answer tiles are in the four modes whose phone screen is a question and its
  answers. Modes that share the phone with a board keep their compact tiles.
- Nothing new for the ear was composed: every sound used was already in the game.
- A team game's ceremony still reveals the top three players, not the teams.

## Not checked

- Any real phone, Chromebook, iPad or projector, and a real class. Timing was judged from frames
  captured in headless Chromium, not by eye at full speed on a classroom's hardware.
- The sound. Nothing was listened to, and which sound is asked for at which moment was read from
  the code, not measured: the count-in ticks, the "time's up" sting, the chime on a climb, the
  chimes and fanfare of the ceremony and a phone's own sound at the end.
- The reveal under reduced motion and in a calm room was not filmed. The code leaves the staging
  and the count-up out there (the ceremony's still form was filmed in both).
- The hall screen during a game. It now loads the room's motion, so its game screens move as the
  board's do; only the end of a game was looked at on it.
- A person using a screen reader. The results are announced once, as they open, as before; the
  ceremony's captions are for the eye and hidden from screen readers.
- Safari and Firefox. Nothing was run in either here; CI runs the browser tests in both.
- Phones' clocks: the ceremony is timed from the server's clock, so a wrong device clock does not
  move it, but a slow connection delays the view that starts it on that phone.
