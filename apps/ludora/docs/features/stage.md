# Stage: the live game screens, looked at again

Workstream `stage`. No migration. No new dependency. One new preference on the account,
`stageBackdrop` (`server/src/modules/users/preferences.ts`, an enum of the seven scenes, default
`floodlights`), so a teacher's backdrop follows them to any computer.

How it was looked at: a throwaway Playwright driver (kept out of the repository) hosted a Classic game
at 1366x768 and 1920x1080 with a phone player at 390x844, with 1, 8 and 40 players (practice bots and
socket guests), a two-team game, the day theme, and the comfort settings (colour-safe tiles, calm mode,
highest contrast with less transparency), and saved every phase: lobby, get ready, each question,
the last five seconds, locked in, the reveal, the leaderboard and the results. About 180 pictures
before and 200 after, all looked at. A second driver caught the moments in between (the question
sting, the phase fade, paused, removed) and a third measured sixty players.

Tests:
- `e2e/stage.spec.ts` (1 flow): the backdrop chosen, saved to the account and still there after a
  reload; axe (WCAG 2.2 A and AA) and no sideways scroll on the backdrop picker, the lobby (host and
  phone), get ready, the question (big screen and phone), right and wrong answers on a phone, the
  reveal, the leaderboard (big screen and phone), the results, the end card and the class photo;
  "Next question" on the host's bar; the podium skip; the class photo's PNG download. Passes in
  Chromium, Firefox and WebKit.
- `server/test/preferences.test.ts`: the backdrop is saved, kept by other changes, and only a known
  scene is accepted (400 otherwise).
- `web/src/features/room/game/modeFill.test.ts`: a mode's colour keeps ink text at 4.6:1 on every hue.
- `web/src/features/room/ClassPhoto.test.ts`: first names only; everyone inside the picture, front rows
  bigger, rows shared evenly.

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **Big-screen backdrops**: six original scenes (Floodlights, Night hills, Harbour, Northern lights, Rooftops, Pine forest) and the plain stage, picked from a **Backdrop** button in the lobby with a preview of each. Shown behind the lobby, get ready and the leaderboard, faded out while a question is up. One slow layer per scene (a sweeping beam, drifting mist, a lighthouse, lit windows), transform and opacity only; still with reduced motion, data saver or calm mode; left out with less transparency or highest contrast. Saved to the teacher's account (to the device when signed out). | `room/game/Backdrop.tsx`, `stage.css` (`bd-*`), `RoomPage.tsx`, `Lobby.tsx`, `users/preferences.ts` | `e2e/stage.spec.ts` (choose Harbour, reload, still Harbour, the account says `harbour`, gone during the question, axe on the picker); server test; screenshots of every scene |
| 2 | **The lobby as a crowd**: Glims stand on a lit stage floor with their names on dark tags instead of a grid of identical cards; a player sending a reaction throws their Glim's arms up on the big screen. With more than 16 players the join card tightens so 40 fit three rows on a 1366x768 projector, and the join code stays the biggest thing on screen. Team lobbies are solid panels under a banner in the team's colour. | `Lobby.tsx` (`Seat`, `Crowd`, `seatSize`, `TeamCrowd`) | screenshots at 1, 8 and 40 players and two teams, 1366 and 1920; axe on the lobby in `e2e/stage.spec.ts` |
| 3 | **Get ready, in the mode's colour**: the "Get ready" plate and the countdown take the mode's own colour (worked out per hue so ink text keeps 4.6:1). Before every question, "Question 3 of 10" sweeps across a dark band on the big screen and phones for just over a second. Left out with reduced motion, calm mode and for anyone arriving mid-question. | `game/parts.tsx` (`IntroScreen`, `BigCountdown`), `game/modeFill.ts`, `GameStage.tsx` (`QuestionSting`) | unit test (`modeFill.test.ts`); screenshot of the sting on the host and phone; axe on get ready |
| 4 | **The question on the big screen**: with four answers or fewer the tiles grow to fill the projector's height instead of leaving its lower quarter empty; each tile's shape and letter sit on a lighter chip that reads from the back. | `game/AnswerInput.tsx` (`TALL`, `ChoiceTile`) | screenshots of a short and a 220-character question at 1366 and 1920 |
| 5 | **Answer tiles on devices**: a chosen tile locks in with a firm press; then the wait shows **your own tile** (its colour, shape, letter and words) under a lock, so "locked in" is unmistakable. Colour-safe tiles keep their pattern on it. (Taps after the first were already refused.) | `game/AnswerInput.tsx`, `game/parts.tsx` (`LockedIn`, `tileOfWords`), `stage.css` (`tile-lock`) | screenshots, standard and colour-safe tiles; axe on the phone question |
| 6 | **The last five seconds**: the timer's disc turns coral with a ring and each second lands with a beat. The ring stays in calm mode and with reduced motion, without the beat; the player's timer setting is respected (hidden shows nothing). | `game/TimerBar.tsx`, `stage.css` (`timer-beat`) | screenshots at 4 seconds left on the projector and phone, and in calm mode |
| 7 | **The reveal on a phone**: "Correct" with the points counting up on their plate, and the score in the header counting up; a wrong answer says "Incorrect" and then shows the right answer as the biggest thing in it, on white with a tick. Screen readers hear the final numbers. | `game/Reveal.tsx` (`ResultBanner`, `PointsPlate`), `game/countUp.ts`, `game/parts.tsx` (`HudScore`) | `e2e/stage.spec.ts` ("Answer: True" after a wrong answer, axe on both); screenshots |
| 8 | **The leaderboard**: climbers get an "up 3" arrow that lands once the rows have slid; rows are solid so a backdrop never shows through them; on a phone only your own climb is called out so names keep their room. | `game/Leaderboard.tsx` (`Climb`) | screenshots at 8 and 40 players, big screen and phone; axe on both |
| 9 | **Podium skip**: while third, second and first are revealed, the host has **Skip to the winner**, which shows every place and the standings at once. | `Results.tsx` (`Podium` `still`) | `e2e/stage.spec.ts` (button seen, pressed, gone, standings shown) in three browsers |
| 10 | **The player's end card**: their Glim (cheering on the podium places), "You came 5th" on the gold plate, their result, accuracy and right answers, and any award they took. | `Results.tsx` (`EndCard`) | `e2e/stage.spec.ts` (heading and Accuracy, axe); screenshots |
| 11 | **Team games from across the room**: with two teams the big screen's leaderboard shows a broadcast scoreline (each team's name on a plate in its colour, the score huge, a split bar), and team colours are fills ink text passes on. | `game/Leaderboard.tsx` (`TeamScores`, `teamFill`), `Lobby.tsx` | screenshots of a two-team game, lobby and leaderboard |
| 12 | **Waiting on a device**: the locked-in wait has the player's Glim and a bar of how many have answered; paused shows the player's own Glim with the pause sign. | `game/parts.tsx` (`LockedIn`), `GameStage.tsx` | screenshots (locked in, paused) |
| 13 | **Removed, closed, could not join, waiting room**: each says it with a Glim, not an error icon, and keeps its way on (Enter another code, Home, Cancel). | `RoomPage.tsx` | screenshot of "Removed from the game"; the waiting room is covered by `e2e/hosting.spec.ts` |
| 14 | **One transition between phases**: lobby to game to results, and get ready, each question and the leaderboard, settle in from just below in 200 ms, without remounting anything (focus, answers and announcements are untouched); the reveal lands on the question already there. Still with reduced motion. | `game/PhaseFade.tsx`, `GameStage.tsx`, `RoomPage.tsx` | the moments driver saw one 200 ms animation as the leaderboard opened; `e2e/game.spec.ts` focus checks still pass |
| 15 | **The host's next action says where it goes**: "Next question" from the leaderboard (and "Next: results" where a mode shows standings after its last question); "Next" otherwise. | `GameStage.tsx` (`HostControls`) | `e2e/stage.spec.ts` |
| 16 | **Class photo**: on the results, **Class photo** shows every player's Glim on the stage in rows like a school photograph, with the game's title and date, and downloads it as a PNG. No names by default; **Show first names** adds first names only, and is not offered when names are hidden in the room. Drawn in the browser; nothing is uploaded. | `ClassPhoto.tsx` | unit tests; `e2e/stage.spec.ts` (preview, first names, `ludora-<code>-class-photo.png` download, axe) |
| 17 | **Sixty players on one projector**: the lobby's crowd gets two more size steps (over 36 and over 48), so 40 players and 20 bots fit under the join code at 1366x768 with every Glim and name visible. | `Lobby.tsx` (`seatSize`, `crowdVars`) | screenshot `perf-lobby-60.png`; the measurement below |
| 18 | **The day theme and the school look**: the stage stays the stage in the day theme (checked phase by phase), and the Hills Grammar look keeps its own typeface and crest on every screen above, backdrops included. | tokens only, nothing hard-coded | screenshots in both; `e2e/game.spec.ts` and `e2e/stage.spec.ts` pass with `E2E_SCHOOL_THEME=hills-grammar` |

## Sixty players, measured

Headless Chromium at 1366x768 on this shared 4-core machine (other agents' tests running), the host's page
recording every frame interval and every long task (`PerformanceObserver`), 40 socket guests arriving four a
second and then 20 practice bots (`perf.mjs`, kept out of the repository):

| Moment | Frames | Median frame | 95th percentile | Frames over 50 ms | Long tasks (longest) |
|---|---|---|---|---|---|
| Lobby filling to 60 | 775 | 16.7 ms | 33.3 ms | 7 | 7 (87 ms) |
| Leaderboard slide | 132 | 16.7 ms | 33.3 ms | 0 | 0 |
| Podium and results | 154 | 16.7 ms | 16.7 ms | 2 | 1 (151 ms, the results screen mounting) |

A quieter earlier run gave 16.8 ms at the 95th percentile in all three. The results screen's one long task is
the whole standings list of 60 rendering at once; it happens before the podium starts to rise.

## Before and after

Pictures (not in the repository): `/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/stage/`:
`before/` (the branch as it was: 1, 8 and 40 players, two teams, day theme, colour-safe tiles),
`after2/` (the same scenarios plus calm mode, highest contrast, the backdrop picker and scenes, the class
photo, the moments driver's sting, paused and removed, and the sixty-player pictures), `school/` (Hills
Grammar look) and `modes/` (Tug of War, which shares the answer tiles and result banner).

## Changed in other areas' files

- `e2e/reports.spec.ts`: its loop looked for a button named exactly "Next"; the host's button now says
  where it goes, so it looks for "Next", "Next question" or "Next: results".

## Not done or not verified

- **Glims idling** in the lobby: left out on purpose, `docs/DESIGN.md` says no idle bobbing; arriving and
  reacting are there. The reaction pose (arms up while a player's reaction is on screen) was not driven by a
  test or a screenshot.
- **The big-screen question type** still steps in three sizes by length rather than fitting the box; a
  220-character question and its answers fit 1366x768 and 1920x1080, a question with a picture and six long
  answers was not tried.
- The backdrops' movement was checked in the code and by eye in still pictures only (a still cannot show
  motion); that it holds still with reduced motion, data saver and calm mode is CSS (`stage.css`), not a test.
- Mode screens under `room/modes/**` were not restyled: Classic's big-screen leaderboard still puts the
  team scoreline in its side column. Tug of War and the 3D modes' 3D-off cases were looked at or run
  (their specs pass); other modes that use the shared tiles and banner were not each looked at.
- Nothing was tried on a real projector, Chromebook or phone.
