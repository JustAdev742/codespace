# Hosting: features for the teacher running a live game

Workstream `hosting`. Migration `0010_hosting` (`game_sessions.options`; `classes.host_generated_names`,
`classes.host_quiet`). New dependency: `qrcode-generator` (web, loaded only when a QR code is drawn).

Every host setting is enforced by the room server (`server/src/realtime/room.ts`); a player's device is
never trusted. New options default to how the game behaved before (`roomOptionsSchema` in
`packages/shared/src/realtime.ts`). The lobby and the host's bar stay calm: the main actions are buttons,
everything else sits behind one **Room settings** button in the lobby and one **Host menu** (`…`) in the
game bar (`web/src/features/room/host/`).

Tests:
- `server/test/hosting-room.test.ts` (22): the room on its own, including one test that plays **every
  mode** (3D included) with a break, names hidden, still answering, add time and the report.
- `server/test/hosting-routes.test.ts` (7): class hosting, attendance, class goal, class defaults,
  missed questions, practice, Host again; each against the wrong account.
- `web/src/features/room/host/summary.test.ts` (4).
- `e2e/hosting.spec.ts` (5 flows), passing in Chromium, Firefox and WebKit, and in Chromium with
  `E2E_SCHOOL_THEME=hills-grammar`. Every new screen passes axe (WCAG 2.2 A and AA) with no sideways
  scroll, at 1366x768 (big screen) and 390x844 (phones, remote, class page).
- `e2e/game.spec.ts` updated (seat menu; keep-out in a new tab).

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **QR code** on the lobby's join card ("Scan to join"), drawn in the browser, opening `/join/<code>` with the code filled in. | `room/host/QrCode.tsx`, `Lobby.tsx` | e2e: QR image present, axe on the lobby |
| 2 | **Full screen** button in the host's header, and the F key. Hidden where the browser has no full screen. | `host/tools.ts` (`useFullscreen`), `host/HostTools.tsx` | e2e: button and F turn `document.fullscreenElement` on and off |
| 3 | **Host keyboard shortcuts**: N next, P pause/resume, + add 10 s, W still answering, L lock, F full screen, M mute, ? the shortcuts sheet, Esc closes a panel. Never while typing in a field, never with Ctrl/Cmd/Alt, never inside an open dialog; keys shown on the buttons' tooltips and `aria-keyshortcuts`. | `host/tools.ts` (`useShortcuts`, `isTyping`), `HostTools.tsx`, `GameStage.tsx` | e2e: ? opens the sheet (axe), + adds time, F full screen; unit test for `isTyping` |
| 4 | **Start countdown**: "Starting in 3/5/10" over every screen, with Cancel and Start now for the host (a room setting, off by default). Refused up front when the game could not start. | `room.ts` (`beginCountdown`), `host/overlays.tsx` (`StartCountdown`) | unit: count, cancel, start, refusal, start now; e2e: timer on host and phone, axe |
| 5 | **Auto-start** once a chosen number of players are in (with the countdown). Fires once per lobby; a cancelled one does not come back. | `room.ts` (`checkAutoStart`), `RoomSettings.tsx` | unit test |
| 6 | **Teams in the lobby**: rename a team (name filter), move a player to another team from the seat's menu, and optionally let players pick their own team on their device. (Shuffle already existed.) | `room.ts` (`renameTeam`, `setTeam`, `playerRequest`), `Lobby.tsx` (`SeatMenu`, `TeamCrowd`, `PlayerLobby`) | unit: filter, pick only when allowed; e2e: player picks, host renames to "Rocket Owls", moves her back, axe on the seat menu and the picker |
| 7 | **Who has not answered**: Host menu → Still answering lists names still thinking (a count on the menu button), each with **Nudge**; that player's device alone shows "Your teacher is waiting for your answer". Server-checked (only players on the open question; once per 10 s). Self-paced modes say there is no one question to wait for. | engine `waitingOn` hook (`syncWaitingOn`, Confidence), `room.ts` (`hostExtras`, `nudge`), `host/panels.tsx`, `overlays.tsx` (`NudgeBanner`) | unit: list, refusal, rate limit, players never see the list; e2e: nudge, banner on the phone, axe on both |
| 8 | **Add time**: "+10 seconds" (menu, + key, remote) on an open timed question in host-paced modes; disabled with the reason otherwise; refused by the server in self-paced modes. | engine `addTime` hook (`syncAddTime`, Confidence), `runtime.ts` | unit: deadline moves and the question stays open; refused in self-paced modes (all-modes test); e2e |
| 10 | **Names hidden on the big screen**: the projector shows "Player 1, 2…" in every mode's view, the news, reactions and the results; each player still sees their own name and place, and the host's phone remote keeps real names. Question content is never rewritten. | `realtime/hideNames.ts`, `room.ts` (`nameAliases`) | unit: every mode's big screen and results carry no real name; e2e: lobby shows "Player 1", remote shows the real name |
| 11 | **Podium awards** beyond the top three: longest streak, fastest right answer, most improved (second half against first), best comeback (place on right answers at half time against the final place), worked out on the server from the answers; bots never take one from a person. | `realtime/report.ts` (`computeAwards`), `Results.tsx` (`Awards`) | unit with a scripted game; e2e: "Fastest right answer" on the student's and host's results, axe |
| 12 | **Class summary** (host only, in a dialog, not on the big screen by itself): class accuracy, the three hardest questions with the most common wrong answer, who may need a hand (under 50% after 3 answers), how it felt, and **Play the missed questions again** (a new room, same mode, settings and options, with only the most-missed questions, topped up from the set when the mode needs more, and said so). | `report.ts` (`hostReport`, `missedQuestionIds`), runtime records each answer's words (`runtime/answerText.ts`), `POST /api/rooms/:code/missed`, `host/ClassSummary.tsx` | unit and route tests (wrong host refused, top-up); e2e: summary content, axe, the new room opens |
| 13 | **Results**: a per-question table (right first time, most common wrong answer, average time), a **printable results sheet** (only it goes on paper, black on white), and **Copy summary** (plain text). | `ClassSummary.tsx`, `host/summary.ts` | e2e: print media shows the sheet with standings and questions; unit test of the summary text |
| 14 | **Exit ticket** (setting): "How did that feel?" with three faces on players' devices at the end; the host sees counts only, live on the results and in the summary. | `room.ts` (`feelings`), `Results.tsx` (`ExitTicket`) | unit: counts only, never who chose what, players never see counts; e2e |
| 15 | **Catch-up for late joiners** (setting, off by default; Classic and Confidence): a late joiner starts level with the lowest score. Stated on the lobby. | engine `catchUp` hook, `room.ts` | unit test |
| 16 | **Waiting room** (setting): new players wait on "Waiting to be let in" until the host lets them in or turns them away; Let everyone in. Requests lapse after 10 minutes or when the page closes. | `room.ts` (`pending`, `admit`), `attach.ts`, `useRoom.ts`, `Lobby.tsx` (`WaitingRoom`) | unit: let in, turned away, old clients refused; e2e with axe on the waiting screen |
| 17 | **Ready check**: players tap Ready; the lobby says "3 ready" and marks each card. | `room.ts`, `Lobby.tsx` | unit; e2e |
| 18 | **Lobby play**: tapping your Glim makes it hop on the big screen, through the reactions path and its rate limit (lobby only; off with reactions). | `room.react('hop')`, `Lobby.tsx`, `stage.css` (`seat-hop`, still under reduced motion) | unit: lobby only, rate limited; e2e taps it |
| 19 | **Brain break**: 30 s or 1 min stretch screen on every device with a ring timer and stretch prompts; the game carries on by itself (or the host ends it early); works in every mode. | `room.ts` (`break`, `endBreak`), `overlays.tsx` (`BrainBreak`) | unit (incl. all modes); e2e on host and phone, axe |
| 20 | **Double points on the final question** (setting; Classic and Confidence), announced before it: "Final question: double points" on every screen. | `syncRounds.ts` (`isDoubleRound`), Confidence `changeFor`, `room.ts` (`doubleNow`), `overlays.tsx` | unit: the last answer is worth double; e2e: banner on host and player |
| 21 | **Rename a player** (replaces per-player answer order, see below): from the seat's menu, through the name filter. | `room.ts` (`renamePlayer`), `Lobby.tsx` (`RenameDialog`) | unit; e2e: rude name refused, fair one shown on the phone |
| 22 | **Quiet room**: one switch silences every device (without touching each device's own mute; the sound button says why), and one turns reactions off (refused by the server). Both can change mid-game. | `room.ts`, `lib/sound/engine.ts` (`setSilenced`), `MuteButton.tsx` | unit; e2e: the student's button reads "Quiet room: the host turned sound off" |
| 23 | **Remote control**: Host menu → "Use your phone as a remote" shows a QR code; the phone (same account, checked by the server) gets Start, Next, Pause, +10 s, breaks, End, still answering with nudges, the waiting room and players, while the laptop stays the big screen. | `host/RemoteControls.tsx`, `attach.ts` (`as: 'remote'`) | e2e: start, pause, resume, end from the phone; axe at 390 |
| 24 | **Host again** from past results: "Host again" on each hosted game and on its report opens the Host page with the same set, mode, settings, room options and class (chaos never comes back by itself). | `GET /api/games/:id/report` (`setup`, host only), `HostSetup.tsx` (`?again=`), `reports/*` | route test (wrong account 404); e2e |
| 25 | **Share the invite**: the system share sheet on touch devices, otherwise copy, with the button turning to "Copied". | `Lobby.tsx` (`ShareButton`) | e2e: "Copied" and the clipboard holds the join link |
| 26 | **Before starting**: the lobby shows how many questions and "About N minutes", and **Preview the questions** (prompts only, never answers, since the screen is often on the projector). | `host/tools.ts` (`estimateMinutes`), `room.ts` (`preview`), `PreviewDialog` | unit (no answers; estimate); e2e with axe |
| 27 | **Pinned lobby message** (up to 120 characters, through the filter), on every lobby screen. | `room.ts` (`pin`), `Lobby.tsx` (`PinnedMessage`) | unit; e2e on host and phone |
| 28 | **Connection health**: the host's Players panel (and the remote) says who is reconnecting; the host menu counts them. (A player's own "Reconnecting…" and automatic rejoin already existed.) | `host/panels.tsx` (`PlayersList`) | e2e: a phone drops off, the remote shows "1 reconnecting" |
| 29 | **Remove and keep out**: a removed player cannot come back from the same browser under another name, in a new tab either. | `lib/useRoom.ts` (`ludora.removed.<code>`) | `e2e/game.spec.ts` |
| 30 | **Practise these questions on your own** on a player's results: a solo Time Attack (or flashcards for a short set) with the same questions; proven by the room's reconnect token, guests get a guest account. | `POST /api/rooms/:code/practice`, `Results.tsx` | route test (wrong token refused); e2e |
| A | **Host for a class** from the class page (Live games tab): only that class's members can join, checked on the server (and re-checked in the database for someone added after the room opened); the game is saved with the class. | `rooms/routes.ts` (`classId`), `room.ts` (`classMembers`), `manager.isClassMember` | route tests (other teacher 404, student 403, outsider and guest refused); e2e |
| B | **Attendance** for each class live game on the class page: who took part (right of answered) and who did not. Teacher only. | `classes/live.ts`, `classes/LiveGames.tsx` | route test (student 403, others 404); e2e at 1366 and 390 with axe |
| C | **Right answers in class live games count toward the class goal** (the goal sums the class's saved games). | `persist.ts` (classId), `classes/tools.ts` unchanged | route test: progress rises after a class game |
| D | **Class hosting defaults**: generated names only and quiet room, set on the class page, applied when hosting for the class. | `classes/routes.ts` (`hostDefaults`), `LiveGames.tsx`, `HostSetup.tsx` | route test; e2e: the default is on in the host form and in the room |
| E | **Long names on the Lantern Trail and Festival Workshop host boards** (left by the bug hunt): a long name takes two smaller lines instead of "Bartholomew Fitzgerald…". | `modes/lantern-trail.tsx`, `modes/festival-workshop.tsx` | e2e measures the name is not clipped in both modes; screenshots |

Also fixed on the way: changing one room or game setting from the lobby reset every other one to its
default (the configure command's schema filled in defaults), unit test "changing one switch leaves the
others as they were".

## Already existed (not counted)

- 9: the reveal already shows how many chose each answer on the tiles and the question's explanation.
- 6: Shuffle teams. 28: a player's own "Reconnecting…" pill and automatic rejoin.

## Replaced

- 21 **Answer order shuffled per player**: a bad idea here. The big screen shows the tiles in one order
  with colour, shape and letter, and players look up at it; each phone in a different order would break
  that link, and the reveal on the board would not match anyone's phone. Choices are positional tokens
  per question instance, so it would also need an instance per player, breaking the answer chart.
  Replaced with **Rename a player** (row 21).

## Not done

- Host again from the **home page's** recent games: that list is games you played, on a page another
  workstream owns; Host again is on the hosted games list and each game report instead.
- The exit ticket counts are not saved with the game (they show on the results and in the summary).
- Attendance compares with the class's members now, so a student who joined the class later shows as
  not taking part in older games.
