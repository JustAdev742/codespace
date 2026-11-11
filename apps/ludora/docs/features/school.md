# School: features for a whole school's own copy

Workstream `school`. Migration `0014_school` (tables `houses`, `house_members`, `house_points`, `house_cups`,
`merits`, `school_notices`, `school_events`, `student_sport_days`, `class_sport_days`, `tournaments`,
`tournament_matches`, `class_challenges`; school settings in `economy_config` under `school:settings`).
No new dependencies. Server: `server/src/modules/school/` (new) and `server/src/modules/events/school.ts`;
web: `web/src/features/school/`.

Nothing here is Ludora's: every house name, colour, value, cup and date is typed by the school's staff.
School-wide pages show totals and display names only (no account details, no per-player points), so
the leaderboard setting is never overridden. House points and merits never give currency, items or a
game advantage (a server test checks the ledger). New stored data is in "Your data" (`users/account.ts`).

Tests: `server/test/school.test.ts` (15, each changing route also tried by the wrong account),
`server/test/school-logic.test.ts` (7), `server/test/school-spectator.test.ts` (1),
`web/src/art/glim/uniform.test.ts` (house pin), `e2e/school.spec.ts` (2 flows; every screen named below
passes axe with WCAG 2.2 A and AA tags and has no sideways scroll at 1366x768 and 390x844; passing in
Chromium, Firefox and WebKit, and in Chromium with `E2E_SCHOOL_THEME=hills-grammar`).

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **Houses**: school staff add up to 6 houses (name through the filter, a colour, an emblem from 16 built-in icons), and retire them. A teacher puts students in their own classes into houses (a 404 for anyone else's); staff can sort any student; a student may choose once, only when the school allows it. | `school/routes.ts`, `Manage.tsx` (Houses, Students), `ClassHouses.tsx`, `SchoolPage.tsx` (`MyHouse`) | server "lets a teacher sort...", "lets a student choose once..."; e2e adds two houses through the form and sorts a student |
| 2 | **House points**: each right answer (each question once, self-graded never) in a live game or an assignment pays the player's house, decided in `persistGame`, capped per student per school day (default 20), never twice for one game; solo practice pays nothing. The results screen says "6 house points for Banksia." or that today's limit is reached. | `school/service.ts` (`awardGamePoints`, advisory lock per player), `school/teams.ts` (`recordSchoolGame`), hook in `realtime/persist.ts` | server "pays right answers ... capped per student per day" (6, then 4 to the cap of 10, then the limit note; ledger-free) |
| 3 | **House standings** (this week, the current cup, all time) as a scoreboard with ranks in figures and words; **house chips on lobby seats**; **house points per game** on the results screen. | `SchoolPage.tsx`, `Standings.tsx`, `GameHouses.tsx`, one line each in `room/Lobby.tsx` and `room/Results.tsx`, `house` on `AvatarLite` (filled in `profiles/avatar.ts`) | server "shows standings ... totals only, and per game"; e2e standings show Banksia 5, lobby seat shows "Waratah", axe at both widths |
| 4 | **House cup**: staff schedule cups between dates (no overlaps); the current cup's standings; when its last day passes it closes by itself with frozen totals and the winner (joint winners named), every house member gets a notification, and it stays in the hall of fame. | `service.ts` (`closeFinishedCups`), `Cups.tsx`, `Manage.tsx` (Cups) | server "runs between dates, names the winner..."; e2e cups tab with axe |
| 5 | **House match**: a host option that makes the teams the houses in any team mode; players without a house join the smallest team. | `school/teams.ts` (`schoolTeamPlan`), `HostSchoolGame.tsx`; `school` field on `POST /api/rooms`, `teamPlan` in `room.ts` | server "makes house match and class against class teams"; e2e hosts one, teams are the houses |
| 6 | **House pin** on the blazer lapel in the house colour, on the school's copy (not on polos). | `art/glim/uniform.tsx`, `housePin` prop on `Glim`, passed by `PlayerGlim`, `PlayerAvatar`, `ProfileCard` | unit test (pin on blazer, not on polo); rendered and checked by eye |
| 7 | **Welcome to your house**: shown once, on home or the School page, after the house is set: the crest lands with a burst in the house colour (still under reduced motion). | `Welcome.tsx`, `POST /api/school/me/welcomed` | server (welcome true, then false); e2e sees it, axe on it, gone after reload |
| 8 | **Year group standings**: totals by year from the year each player gives, recorded with each point (never shown per player). | `service.ts` (`yearTotals`), `Standings.tsx` (`YearTable`) | server (years sum to the house total); e2e |
| 9 | **Assembly mode**: a preset (house teams, up to 200 players, 30 s to answer) that opens the room and a hall screen: very large type, the houses in the room with their counts, and at the end the house points revealed from last place to first, then the winner. | `HostSchoolGame.tsx` (`assembly`), `Watch.tsx` (`?hall=1`, `HouseRollCall`, `HouseReveal`) | e2e: hall screen lobby with the houses, axe. The end-of-game reveal was not driven in a browser |
| 10 | **Spectator screen** `/school/watch/:code`: a signed-in account shows a running game on a second display. It gets the big screen's view (names hidden when the host hides them) without anything only the host sees (still answering, waiting room, class summary), and the server refuses every command, move and reaction from it. | `room:watch` in `realtime/attach.ts`, `modules/school/spectator.ts`, `Watch.tsx` | `school-spectator.test.ts` (anonymous refused, no reconnect token or username, no `host` data, start/move/reaction refused); e2e signed-out refusal |
| 11 | **Tournaments**: a teacher sets up a knockout (byes to the top seeds) or round robin among their classes or named teams; **Host it** opens a room whose teams are the two entrants, and the bracket fills in when the game ends; or record a result by hand. Students in the classes see it. | `school/compete.ts`, `logic.ts` (`knockoutBracket`, `roundRobin`), `TournamentPage.tsx` | `school-logic.test.ts`; server "builds a knockout ... fills in from games, names the winner" (also another teacher's class refused); e2e bracket, record result, axe |
| 12 | **Class against class over a week**: a teacher challenges another class by its join code; once its teacher accepts, both classes get the same assignment for the same dates; the score is the mean of each student's best accuracy, so class size does not matter. | `compete.ts` (`challengeResults`), `logic.ts` (`classAccuracy`), `Compete.tsx` | unit test for the fairness rule; server "needs the other teacher to accept..." |
| 13 | **Class against class live**: two of the host's classes in one room, each class a team. | `teams.ts`, `HostSchoolGame.tsx` | server (another teacher's class refused). The dialog was not driven in a browser |
| 14 | **Sport days**: a student's own weekdays (in the Locker) or their class's (set by the teacher); on those days in the school's time zone the Glim wears sport uniform everywhere, seen by others and by the player, without asking. | `service.ts` (`sportDaysOf`, `sportToday`), `profiles/avatar.ts`, `app/PrefsSync.tsx`, `ClassHouses.tsx`, `LockerUniform.tsx` | server sport days test; e2e (Hills Grammar look) saves a student's own days; run on a Wednesday, the class's Wednesday had already put the Glims in sport kit (checked in the screenshot) |
| 15 | **Uniform choice in the Locker** with a live preview on your own buddy, beside Settings. The picker now sizes itself by its box. | `LockerUniform.tsx`, `UniformPicker.tsx`, one line in `collection/Locker.tsx` | e2e (Hills Grammar look): Year 8 shows the senior blazer; axe at both widths; `school-uniform.spec.ts` still passes |
| 16 | **School staff role** (`school_staff`, rank 2, permissions `school.manage` and `school.view`, no staff panel), granted through the audited role system or `npm run admin -- grant <user> school_staff`; every school route checks it on the server; every staff change is audited. | `packages/shared/src/permissions.ts`, `admin/common.ts` (`staff`) | server: teacher cannot grant it, super administrator can, permissions listed, no `staff.access`; e2e grants it with the operator CLI |
| 17 | **School usage** for that role: live games and players per week (8 weeks), classes playing this week and month, most-played sets, students in a house. Totals only. | `GET /api/school/usage`, `Manage.tsx` (Usage) | server (staff 200, student 403); e2e, axe |
| 18 | **Scheduled notices** with an audience (students, teachers and staff, everyone) and start and end, on home and the School page. | `events/school.ts`, `SchoolStrip.tsx`, `Manage.tsx` | server "shows notices to their audience..."; e2e schedules one through the form and the student sees it |
| 19 | **Countdown banner** to the next school event (two weeks ahead) on everyone's home page with its decorations, and on the day **a themed lobby**: the event's decorations and name on the host's lobby. | `currentSchoolEvent`, `SchoolStrip.tsx`, `LobbyTheme.tsx`, one line in `room/Lobby.tsx` | server; e2e "3 days to go" on home, "Today at school: House day" in the lobby, axe |
| 20 | **Merits**: a student's teacher gives a merit for one of the school's values (limited per teacher per day), with a note; it earns house points, notifies the student and shows on their profile (counts for anyone who can see a public profile; notes only for the student, their teachers and staff). | `POST /api/school/merits`, `MeritsPanel.tsx`, one line in `profile/Profile.tsx` | server (other teacher 404, classmate 403, unknown value 400, limit 429, ledger unchanged, notes hidden from others); e2e dialog with axe, profile shows it |
| 21 | **Hall of fame**: past house cups with final standings, and tournament winners. | `GET /api/school/hall-of-fame`, `Cups.tsx` | server (cup and tournament both listed); e2e |

Also: a notification kind `school` (bell and page), a School item in the sidebar, and labels for the two
new permissions on the staff overview.

## Room hooks (shared files, for the lead to merge)

- `server/src/realtime/room.ts`: `teamPlan` on `RoomInit` and `Room`, the `TeamPlan` type, `planTeam()`,
  `setupTeams()` uses the plan's teams, `join()` puts an account in its planned team; `'spectator'` in
  `RoomSubscriber.role`; `sendView` sends `spectatorView(...)` to spectators.
- `server/src/realtime/attach.ts`: the `room:watch` handler; reactions refused for spectators.
- `server/src/realtime/persist.ts`: `recordSchoolGame` after the study record; its note added to rewards.
- `server/src/modules/rooms/routes.ts`: `school` in the create schema; the team plan built and passed, with
  `teamCount` set to its number of teams.
- `web/src/features/room/Lobby.tsx`: the house chip under a seat's name; `SchoolLobbyTheme` above the title.
- `web/src/features/room/Results.tsx`: `GameHouses` before the standings.
- `web/src/features/room/game/stage.tsx`: `housePin` passed by `PlayerGlim`.

## Not built

- **22, shared classroom device** (sign the guest out after a game and return to a "next player" join
  screen): it lives in the room's results and join screens, which the hosting workstream was changing.
- The assembly end-of-game reveal and the class-against-class live dialog were checked by type checks and
  server tests, not driven in a browser.
