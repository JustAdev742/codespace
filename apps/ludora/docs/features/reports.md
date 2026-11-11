# Reports: what to teach next after the games a teacher hosts

Branch `wip/reports`. Migration `0016_reports` (`answer_events.given`, `game_sessions.teams`; tables
`report_notes` and `report_settings`). No new dependencies.

Every report is checked on the server. A game's routes go through `gameAccess`
(`server/src/modules/analytics/gameData.ts`): the host, the teacher of the class it was played in, or
staff; anyone else, including another teacher and a student who played, gets the same 404 as for a
game that does not exist. The lists (reports home, term overview, set and student across games,
export) only ever read games whose `host_user_id` is the caller. Responses carry display names only:
never an account id, username or email. Players are keyed per game (`p3`), and a student across games
is addressed by a keyed hash of teacher and student that the server checks against the teacher's own
roster, so neither links to an account. Wrong answers in words go through the name filter before a
teacher sees them. New stored data is in "Your data" (`report_notes`, `report_settings`) and in the
report download.

Tests:
- `server/test/reports.test.ts` (13): every new route, each refused to another teacher and to a student
  who played, and checked for account details; a real game through a room saves wrong answers in words
  and team names.
- `server/test/report-analysis.test.ts` (15): the analysis functions on hand-worked fixtures (the
  numbers are in the comments), and five modes played to the end by bots.
- `web/src/features/reports/logic.test.ts` (6): compare, filters in the address, CSV rows, term weeks.
- `e2e/reports.spec.ts` (1 long flow): a teacher hosts a classic game for her student and a guest, then
  uses every report page; axe (WCAG 2.2 A and AA) and no sideways scrolling at 1366x768 and 390x844 on
  each page. Passes in Chromium, Firefox and WebKit.

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **Reports home**: every game you hosted, with search (set, class or mode), filters (class, set, mode, from and to dates), four sorts (newest, oldest, lowest accuracy, most players), the count, and on each row accuracy, players, questions, length and when. Filters live in the address, so Back returns to them. | `GET /api/reports/games` (`analytics/reports.ts`), `reports/HostedGames.tsx`, `logic.ts` (`readFilters`, `apiQuery`) | `reports.test.ts` "lists only your games, with search, filters, sorting..."; e2e row shows "67% right", "2 players"; search and class filter |
| 2 | **Shared wrong answers** (misconceptions), kept with the report: for each question the most-chosen wrong answer and how many chose it, and a "What to teach next" list of questions where two players (or a quarter) gave the same wrong answer. The end-of-game class summary showed this only live; it is now saved (`answer_events.given`). | `realtime/persist.ts` (one line), `analytics/analysis.ts` (`analyseQuestions`, `misconceptions`), `GameSections.tsx` (`TeachNext`, `QuestionAnalysis`) | unit fixture (Sydney chosen by 2 of 4); route test; room test saves the words; e2e "2 players answered True" |
| 3 | **Who answered few questions or left early**: under half of what most players answered (the median, so a steady player in a self-paced mode is not flagged), and who left, each opening that player's answers. | `analysis.ts` (`participation`), `GameSections.tsx` (`CheckIn`) | unit fixture (median 8: Eve 3 and Fin 0 flagged, Gus left early) |
| 4 | **Possibly guessing**, worded as a prompt to check in: three or more wrong first tries much faster than the class took on the same question (under 40% of its median, never above 4 s), making up a third of their answers. | `analysis.ts` (`possiblyGuessing`), `CheckIn` | unit fixture (Dan flagged; Eli with two and Flo, slow, are not) |
| 5 | **One student across your games** (students in your classes only): games, accuracy over time (chart and table), by subject and by question type, with links to each game and their class. **One player's answers in one game** (guests included) from any name on a report. | `GET /api/reports/students`, `/students/:key`, `/api/games/:id/players/:key`; `Students.tsx`, `PlayerDialog` | route test (key names no account; other teacher and the student refused); e2e opens Ada across games and Bo Guest's answers |
| 6 | **One set across your games**: each question's right first time over every play with a sparkline game by game, questions never reached, and "Worth rewriting" with the reason (almost nobody gets it, everybody does, one wrong answer takes half the players, takes twice as long), only after 8 answers. Set owners' overall set statistics already existed ([sets.md](sets.md) #21); this is per question, for the host. | `GET /api/reports/sets/:id`, `analysis.ts` (`setPerformance`), `SetReport.tsx` | unit fixture (each reason, and too few answers to judge); route test (a student refused); e2e |
| 7 | **Before and after**: compare two games of the same set; each question's change in points (improved or fell by 10 or more), overall accuracy over the shared questions, and questions only in one game. Both reports come through the checked report route. | `logic.ts` (`compareGames`), `Compare.tsx`, `GameActions.tsx` (`ComparePicker`) | `logic.test.ts` (+60, +10, -20; 5 points is "about the same"); e2e plays a second game and compares |
| 8 | **Reteach from a game**: one click makes a private set in your library from the game's most-missed questions, hardest first (the class page's reteach already existed for assignments). | `POST /api/games/:id/reteach` | route test (private, owner, order; other teacher and student refused); e2e |
| 9 | **Assign the missed questions to a class**: a class you teach, a mode played alone that fits the number of questions, a title and due date, set through the existing assignments route (which checks you teach the class). | `GameActions.tsx` (`FollowUpDialog`) | e2e: "Set for Year 5 Oak", and the class has "Follow-up: Nature facts" |
| 10 | **A private note on a report**, seen only by its author, in the downloads, deleted with the report. | `PUT /api/games/:id/note`, `report_notes`, `NoteEditor` | route test (length limit, empty deletes, others refused); e2e saves and reloads |
| 11 | **Term overview**: this term, the last 12 weeks or the school year; games each week with the accuracy line (SVG drawn at its real width, with the table under it), totals, most-used modes and sets linking on. | `GET /api/reports/overview`, `TermOverview.tsx`, `charts.tsx` (`BarLineChart`), `logic.ts` (`fillWeeks`, `termStart`) | route test (only your games); `logic.test.ts`; e2e |
| 12 | **This week on the teacher's home page**: this week's reports with their accuracy, or the last game when there were none this week, and a link to all reports (replaces "Your last game"). | `ThisWeek.tsx`, one block in `home/NextUp.tsx` | e2e: two items in "This week's reports" |
| 13 | **Print from a saved report**: a one-page class report (shared wrong answers, questions, players with notes) and a slip per student (went well, to practise), black on white. The end-of-game results sheet already existed for a live game only. | `GamePrint.tsx`, `PrintSheet` from classes | e2e checks both sheets; their print preview saved as PDF in Chromium and read |
| 14 | **Downloads**: every answer as CSV (player, student or guest, team, question, answer given, right, try, kind, time) and the question analysis as CSV (with the most common wrong answer and median time). The old single CSV had no answers. Formula-safe as before. | `GET /api/games/:id/answers`, `logic.ts` (`answersCsv`, `questionsCsv`) | `logic.test.ts`; route test; e2e reads both files |
| 15 | **Delete a report, delete all reports before a date, and a retention setting** (3, 6, 12 or 24 months) the server enforces at once and every six hours. Each place says plainly what goes: the game, every result and answer, the note, and the game from players' history and class attendance; rewards stay. | `DELETE /api/games/:id/report`, `POST /api/reports/delete-older`, `/api/reports/settings`, `purgeExpiredReports`, `ReportData.tsx` | route test (host only, another teacher's games untouched, scheduled purge); e2e deletes one and saves 12 months |
| 16 | **Download everything about your hosted games** as one JSON file: settings, players by display name, every answer, teams and notes. | `GET /api/reports/export` | route test (no account details; another teacher gets only theirs); e2e reads the file |
| 17 | **Students and guests**: each player is marked "Your student" (in the class the game was for, or any class you teach), "Signed in" or "Guest", and **Count guests in the totals** switches the numbers and question lists to leave guests out. (Class games admit only members, so this matters in open games.) | `gameData.ts` (`loadGame`, `viewAccounts`), `GameReport.tsx` | route test (membership; without the guest q1 is 1 of 2); e2e |
| 18 | **By team**: team games now save team names and results, and the report shows each team's place, players and accuracy, with each player's team in the standings and CSV. | `persist.ts` (one line), `analysis.ts` (`teamReport`), `GameSections.tsx` (`Teams`) | unit fixture; room test with two teams |
| 19 | **Reports that fit the mode**: self-paced modes say so and lead with "How far each player got" (questions answered, right first time, pace a minute); puzzle tries count as attempts, self-marked flashcards never as right or wrong, polls never. Classic, Gold Rush, Lantern Match, Word Scramble and Tug of War were played to the end by bots and their reports checked. | `analysis.ts` (`pace`, `firstTries`), `GameSections.tsx` (`Pace`) | `report-analysis.test.ts` "reports for five different modes" |
| 20 | **Phone layout and helpful empty states**: on phones the standings, questions, pace and compare tables become cards; "Host a game to see a report here", "No games match" with Show every game, and an empty state on each new page. | all pages above | e2e: axe and no sideways scroll at 390x844 on every page |

Also fixed on the way: after deleting a report the page fetched it again and logged a 404 (found by
the e2e's console check).

## Already existed (not counted)

- Brief item 3, **hardest and easiest with time**: the game report already listed questions hardest
  first with average time. "What to teach next" now lists the hardest and easiest apart.

## Not done or not checked

- Exit-ticket counts are still not saved with a game (hosting owns that).
- Polls are never saved, so a report cannot show how a class voted.
- Games saved before this migration have no wrong answers in words or team names.
- Ordering, matching and sorting answers have no words, so they never appear as shared wrong answers.
- Not tried on a real device or with a screen reader; the checks are automated.
