# Classes: tools for running a class

Owner: the classes workstream. Builds on the class pages after the bug hunt in
[pages-polish.md](pages-polish.md). Migration `0012_class_tools` (columns on `assignments` and
`classes`; tables `class_notices`, `class_student_notes`, `class_goals`, `class_goal_badges`,
`class_logins`).

Every route checks on the server that the caller teaches the class (or, for a student's own
report, is that student); students in the class get a 403, everyone else a 404 that does not
confirm the class exists. Students never see a classmate's results; the teacher's notes are never
sent to a student. New stored data is in "Your data": the export lists `class_notices`,
`class_student_notes` (by author), `class_goals`, `class_goal_badges` and `class_logins`; deleting
an account or class cascades.

Tests: `server/test/class-tools.test.ts` (14), `web/src/features/classes/classLogic.test.ts` (11),
`e2e/classes.spec.ts` (2 flows; every screen below passes axe with WCAG 2.2 A and AA tags and has
no sideways scroll at 390x844 and 1366x768; the same spec passes with `E2E_SCHOOL_THEME=hills-grammar`).

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **New assignment never offers a set too short for the mode** (left over from pages-polish). Once a mode is chosen, short sets stay in the list, greyed, with "Too short for Classic: 1 question, needs 3"; once a set is chosen, modes needing more questions say "Needs at least N questions. The chosen set has M." Neither can be picked. | `web/src/features/classes/AssignmentDialog.tsx` (`SetPicker`, `ModePicker`) | `e2e/classes.spec.ts` (one-question set shown but no button for it; axe on the dialog) |
| 2 | **Assignment report on a phone**: each student is a card (name linking to their report, status, best result, tries and when) instead of a 900px table scrolling sideways. Laptops keep the sortable table. | `AssignmentReport.tsx` (`StudentCards`) | e2e: report at 390 with no overflow, axe clean |
| 3 | **Assignment options**: opens on a date (students do not see it before), closes on a date (cannot be started after), tries allowed (1 to 20 or any), all editable later; late work still flagged. Students see "Closes …", "One try left", or why they cannot play, and Play is disabled; the server refuses starts outside the window or over the limit (the teacher can always try it). Dates that contradict each other are refused per field. | `server/src/modules/classes/routes.ts`, `access.ts` (`assignmentBlocker`), `AssignmentDialog.tsx`, `ClassDetail.tsx` | `class-tools.test.ts` "assignment options…" and arithmetic tests; e2e: scheduled work hidden from the student, "You have used all 3 attempts…", Play disabled |
| 4 | **Gradebook**: students down, assignments across, each cell the best result with a shape, words and colour band, right of answered, tries and a Late mark; sortable by name, average or any assignment; one assignment at a time on a phone; Gradebook CSV download (formula-safe). | `Gradebook.tsx`, `gradeUi.tsx`, `GET /api/classes/:id/insights` (`tools.ts`, `insights.ts`) | server test "gradebook and insights are for the teacher only"; e2e checks cells (50%, 75%) and the CSV row contents |
| 5 | **Mastery grid** for an assignment: students × questions, each cell right/wrong first time by tick or cross and word as well as colour, from the first or latest try; sort by name, score or any question; a "right first time" row per question; on a phone, one student at a time. | `Mastery.tsx`, `GET /api/classes/:id/assignments/:aid/attempts` | server test "mastery grid and attempts…"; e2e axe/overflow on the report page at both widths |
| 6 | **Compare two tries**: pick any two of a student's attempts; see both scores, the change in points, how many questions are now right or now wrong, and each question side by side. | `Mastery.tsx` (`CompareDialog`) | e2e: "Up 25 points.", "1 question now right", axe on the dialog |
| 7 | **A student's report**: assignments done and late, right answers, games and time on task, every assignment with first and latest accuracy, accuracy by subject and by question type, a week-by-week chart (with a text list for screen readers). Printable on plain paper for a parent meeting. The student can open their own ("Your progress"), without the teacher's note or their username; classmates are refused. | `StudentReport.tsx`, `PrintSheet.tsx`, `print.css`, `GET /api/classes/:id/students/:uid/report` | server test "a student's report…"; e2e: print sheet contains the report, student sees own report, classmate's refused |
| 8 | **May need a hand**: students under a chosen right-first-time threshold (50 to 80%) over the last 30 days, judged only after 5 answers, with the questions they missed most recently and overdue work; plus who has not started work already due. | `Insights.tsx`, `insights.ts` (`needsAHand`) | unit and server tests; e2e: Ada listed, Bo not |
| 9 | **Reteach**: the class's most-missed questions, hardest first, and one click makes a private set of up to 5 to 20 of them in the teacher's library (questions copied, hidden sets skipped, set limits respected), with a link to open it. | `Insights.tsx`, `POST /api/classes/:id/reteach` | server test (set owned by the teacher, private, hardest first; refused with nothing missed or for a student); e2e makes one |
| 10 | **Class logins**: the teacher pastes first names; Ludora makes student accounts (username from the name plus digits, passcode of three short words, under-13 settings, no email or birth year), puts them in the class and shows cards once, ready to print and cut out. "Reset passcode" for those students gives a new card and signs them out everywhere. Names go through the name filter; Argon2id hashes; rate limited; audited without the passcode; only that class's teacher. | `server/src/modules/classes/logins.ts`, `ClassLogins.tsx`, roster in `ClassDetail.tsx` | server test "class logins…" (sign in with the card, old passcode refused, wrong teacher/class refused, self-registered students cannot be reset); e2e: make 3, print the cards, sign in on a phone, reset |
| 11 | **Roster import and class data export**: "Import a CSV" reads a school export (First name or Name column, quotes, BOM) into the names list to check before making logins; "All class data" downloads the roster, assignments and gradebook as one CSV. | `classLogic.ts` (`parseNames`), `ClassLogins.tsx`, `Gradebook.tsx` | `classLogic.test.ts` (4 roster cases); e2e: CSV file fills the list; class data download contains the roster |
| 12 | **Noticeboard**: the teacher posts short notices (280 characters, through the name filter, tidied); students read them on the class page and cannot reply; the teacher can delete them. | `Board.tsx` (`Notices`), `POST/DELETE /api/classes/:id/notices` | server test (filter, student refused); e2e posts one and the student sees it |
| 13 | **Class goal**: a shared target (right answers in the class's assignments by a date) with a progress bar for everyone; when reached, every member gets a class badge, shown on the class page. No currency, items or game advantage (the ledger is checked). | `tools.ts` (`activeGoal`), `Board.tsx` (`GoalCard`, `MyBadges`) | server test (progress, badges for both members, ledger unchanged); e2e: goal set through the form, student sees "You earned the class badge." |
| 14 | **Weekly class leaderboard the teacher can turn off**: shown on the class page (display names and Glims only) with a switch for the teacher; when off, students get "Your teacher has turned off this class leaderboard." from the server. | `Board.tsx` (`WeeklyBoard`); one check added in `server/src/modules/social/routes.ts` | server test "the teacher can turn the weekly class leaderboard off" |
| 15 | **Private notes on a student**: written on the student's report, never sent to students, in the teacher's data download, deleted when the student leaves or is removed and with the class; the roster says "Has your note". | `tools.ts` (`PUT …/note`), `StudentReport.tsx`, `users/account.ts` | server test (export contains it for the teacher only, student refused); e2e saves one and the student's own report does not show it |
| 16 | **Bulk actions**: tick students (or Select all), then Remove or Move to another of the teacher's classes, with their notes and class logins; capacity and ownership checked on the server. | `ClassDetail.tsx` (`Roster`), `POST /api/classes/:id/members/bulk` | server test (other teacher's class refused, notes move, outsiders ignored); e2e moves a student |
| 17 | **Class calendar**: a month grid of when assignments open, are due and close (icon and word for each), and the same dates listed in order (the list is what screen readers and phones use). | `Calendar.tsx`, `classLogic.ts` (`monthGrid`) | unit test for the month grid; e2e: listed dates, axe/overflow at both widths |
| 18 | **Certificates**: from a student's report, a printable certificate with their Glim, a heading, what it is for (or a preset), signature and date, previewed live. Nothing stored. | `Certificate.tsx` | e2e: axe on the dialog, the print sheet carries the chosen heading |
| 19 | **Class tools page** for the board: a fair random picker with Glims (everyone once before anyone twice, never the same twice in a row), a team maker (2 to 10 even teams), and a countdown (presets or minutes, pause, announced when time is up). | `ClassTools.tsx`, `classLogic.ts` (`pickNext`, `makeTeams`) | `classLogic.test.ts` (fairness, even teams); e2e: pick, make teams, axe/overflow |
| 20 | **Reminders on a student's home page**: "N assignments due in the next two days" and past-due work, with Due soon on each; closed or used-up work is no longer listed as waiting. | `web/src/features/home/NextUp.tsx` | e2e: "1 assignment due in the next two days." on the student's home; `e2e/pages.spec.ts` still passes |
| 21 | **Student's to-do on the class page**: each assignment says To do, Due soon, Past due, Done, All tries used or Closed, with tries left; still to do comes first. (The home page list of unplayed work already existed.) | `ClassDetail.tsx` (`StudentAssignmentRow`, `orderForStudent`), `classLogic.ts` (`studentWork`) | unit test for `studentWork`; e2e on the student's class page |
| 22 | **Time on task and accuracy by question type** for the class: median and total time per assignment, and right first time per question type. | `Insights.tsx`, `tools.ts` | server test (270 s total, 90 s median, 12 true/false answers); e2e insights at both widths |

Also: the class page tab is kept in the address (`?tab=gradebook`), so Back from a report returns
to it; teachers see "Scheduled: students cannot see it yet" on future assignments.

## Already existed (not counted)

- A student's list of unplayed assignments on their home page (pages-polish).
- Late attempts flagged in the assignment report.

## Not built

Groups inside a class, hosting live for a class with members-only joins, attendance, co-teachers
and class hosting defaults (items 9, 10, 11, 15, 17 of the brief). Items 10 and 11 need hooks in
the room server, which another agent owns this round. "When answers are shown" and "which game
modes" under assignment options were also left out: both change the live game.
