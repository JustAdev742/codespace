# Lessons: run a whole lesson, not just one game

Branch `wip/lessons`. Migration `0017_lessons` (tables `lessons` and `lesson_runs`). No new dependencies.
Server: `server/src/modules/lessons/` (new: `model.ts` pure logic, `run.ts` the lesson in a room, `routes.ts`).
Shared: `packages/shared/src/lessons.ts` (step schemas, `LessonRoomView`). Web: `web/src/features/lessons/` (new).

A lesson is an ordered list of steps (a game: a set with a mode and its settings; an info slide; a discussion)
run in one room. Every lesson route is for a teacher account and checks on the server that the caller owns the
lesson: another teacher gets the same 404 as for a lesson that does not exist, a student a 403. The teacher's
plan note is stored with the lesson and leaves the server only on the owner's own lesson routes; the room never
holds it, so no view (player, host, remote, spectator) can carry it. Everything a class reads (title, goals,
slide title, lines and picture description, discussion question, game titles) goes through the same language
filter as other teacher text; a picture must be one uploaded to Ludora. Lesson standings carry names and points
only: an account is keyed in the run by a hash of run and account, never its id. Scheduling opens nothing: it is
shown on the class page, and the teacher still opens the room and starts each game. `lessons` and `lesson_runs`
are in "Your data" (download) and go with the account.

Tests:
- `server/test/lessons.test.ts` (13): every route refused to another teacher (404) and a student (403); create,
  rename, reorder, duplicate, delete with lengths; templates and "add a step"; the language filter (slide line,
  goal) and modes played alone refused; a set the teacher cannot play flagged and refused at run; sharing
  (unknown name and a student's name get the same answer, a copy without notes, a notification, no access to the
  original); scheduling (class page, no room opened, another teacher's class refused, Join code once opened, a
  class game); a slide, two games and a discussion run in one room by an account and a guest with standings,
  the end, the report linking each game report, no account ids, and the plan note in no view; carrying on
  another day with step and points; standings off; a slide picture on every screen and outside pictures refused.
- `server/test/lessons-model.test.ts` (8): lesson points, ranking with ties, estimated lengths, templates valid,
  step titles, what the filter checks.
- `e2e/lessons.spec.ts` (2 flows), passing in Chromium, Firefox and WebKit, and in Chromium with
  `E2E_SCHOOL_THEME=hills-grammar`. Every page and room screen below passes axe (WCAG 2.2 A and AA) with no
  sideways scroll; the editor at 1366x768 and 390x844, room screens on the host at 1366 and on phones at 390.

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **Lessons page**: a teacher's lessons (steps, games, length, schedule), a new lesson, and a lesson page to rename it, add, edit, duplicate and delete steps, reorder them by dragging the handle or with the arrow buttons (and Alt+Up, Alt+Down, focus staying on the moved step, announced), duplicate or delete the lesson. Saves by itself ("All changes saved"). Teachers see Lessons in the sidebar. | `LessonsPage.tsx`, `LessonEditor.tsx`, `StepDialog.tsx`; `GET/POST /api/lessons`, `GET/PUT/DELETE /api/lessons/:id`, `/duplicate` | server "creates, renames, reorders, duplicates and deletes"; e2e makes a lesson, moves a step by keyboard, drags one (Chromium; keyboard in the others), duplicates and deletes a step and the lesson, axe on each page |
| 2 | **Run a lesson in one room**: Run lesson opens a room; after a game's results the host presses **Next: <step>** and the same players carry on without rejoining (late arrivals can still join between steps); the lobby shows "Step 2 of 3: Starter quiz" with a progress bar. | `run.ts` (`LessonRun`), `room.ts` (`goToLessonStep`), `POST /api/lessons/:id/run`, `POST /api/lessons/rooms/:code/next`, `lessons/room.tsx` (`NextStepButton`, `LessonLobbyLine`) | server "carries the same players through..."; e2e two guests on phones through a slide and two games |
| 3 | **Lesson standings** (a lesson setting, on by default): 10 points per right answer and 30, 20, 10 for the top three places, so a mode with huge scores cannot swamp the lesson; shown on the results between games and at the end, the player's own row marked; names hidden on the big screen when the host hides names. Off: each game stands alone. | `model.ts` (`lessonPoints`, `rankTally`), `room.tsx` (`LessonStandings`) | unit tests; server standings 60/20 then 80/80 sharing first; e2e on host and phone |
| 4 | **Info slides**: a title, up to six lines and an optional picture (uploaded, with a required description) on the big screen and every device, for teaching between games. | `StepDialog.tsx` (uses the set editor's `QuestionImage`), `room.tsx` (`LessonScreen`) | server slide screen with and without a picture; e2e on host and phone with axe. The picture upload itself was not driven in a browser |
| 5 | **Discussion step**: a question on the big screen with a ring timer (30 s to 10 min), and "Talk to the person next to you" with no answering on devices. | `room.tsx` (`DiscussionTimer`) | server; e2e on host and a student's phone with axe |
| 6 | **Templates**: starter, main and exit ticket; revision carousel; Friday quiz. A new lesson starts from one; its games say "Choose a question set" until one is chosen, and it will not run before. | `model.ts` (`TEMPLATES`), `GET /api/lessons/templates` | unit (each template valid); server (template, "Step 2 needs a question set"); e2e shows them with axe |
| 7 | **Add to a lesson from anywhere**: a set's page ("Add to a lesson") and the Host page ("Add to a lesson instead", with the chosen mode and settings), to the end of a lesson or as a new lesson. | `AddToLesson.tsx`, `POST /api/lessons/:id/steps`, one button each in `SetDetail.tsx` and `HostSetup.tsx` | server; e2e from both pages |
| 8 | **Schedule**: a class and a start time; the class page shows "Starts at 10:15" to its teacher and students, and a Join button appears once the teacher has opened the room (a lesson with one game is a single game). The lesson is then hosted for the class (members only). | `PUT /api/lessons/:id/schedule`, `GET /api/lessons/class/:id`, `ClassLessons.tsx`, one line each in `ClassDetail.tsx` | server (no room opened, other teacher's class refused); e2e: no Join before, Join after, the student lands in the lesson |
| 9 | **Stop and carry on next time**: each step reached, the points and the games are saved as they happen; the lesson page offers "Carry on from step N" (or Start again), which picks up after the last game played, with its standings. | `lesson_runs`, `routes.ts` (`saver`, `carryOn`) | server "remembers the step and the standings". The Carry on button was not driven in a browser |
| 10 | **Learning goals** (up to five), shown in the lobby and at the end under "Today we". | `LessonEditor.tsx` (`Goals`), `room.tsx` | e2e in the lobby on both screens and on the end screen |
| 11 | **Private plan note** on each step, on the lesson page and the printed plan only. | `StepDialog.tsx`, `routes.ts` | server: not in any room view, not in a shared copy, not on the class page; e2e: not in the players' pages |
| 12 | **Estimated length** of each step and the whole lesson, from the questions and settings. | `model.ts` (`stepMinutes`) | unit tests with the sums; e2e "3 steps. About 8 min in all." |
| 13 | **Share with another teacher by username**: they get their own copy (without your notes or schedule) and a notification; an unknown name, a student and a guest all get "No teacher with that username." | `POST /api/lessons/:id/share`, `ShareDialog` | server; e2e the unknown-name answer with axe |
| 14 | **Print the plan**: goals, each step with its start minute and length, set and mode, and your notes, black on white. | `LessonPrint.tsx` | e2e: sheet has the note; print media colour is black |
| 15 | **Homework in two clicks**: Set homework (end of the lesson, or its report), then Set beside a set: a Time Attack assignment due in a week (flashcards when the set is too short, decided on the server) through the class page's own assignment route. | `Homework.tsx` | e2e: "Set for Year 6 Elm" and the class has "Homework: Space quiz" |
| 16 | **One report for the whole lesson**: each step, a link to each game's own report, players, the lesson standings and goals; listed on the lesson page. | `GET /api/lessons/runs/:id`, `/api/lessons/:id/runs`, `LessonReport.tsx` | server (links work, refused to others, no account ids); e2e opens a game report from it |

## Room hooks (shared files)

- `server/src/realtime/room.ts`: `RoomLesson` interface; `set` no longer readonly; `lesson` field; `goToLessonStep()`;
  `start()` refuses while a slide or discussion shows; `lesson.gameEnded()` after a game is saved; `lesson` in `view()`.
- `packages/shared/src/realtime.ts`: `lesson?` on `RoomView`. `packages/shared/src/index.ts`: one export.
- `web/src/features/room/RoomPage.tsx`: `LessonScreen` instead of the lobby when a step is not a game; the header title.
- `web/src/features/room/Lobby.tsx`: `LessonLobbyLine` on the host's and the player's lobby.
- `web/src/features/room/Results.tsx`: `NextStepButton` first in What next; `LessonResults` above the standings.
- Also: `server/src/routes.ts`, `server/src/db/schema.ts` (end), `server/src/modules/users/account.ts` (export list),
  `web/src/app/routes.tsx`, `web/src/app/Shell.tsx` (a `teacher` nav item), `SetDetail.tsx`, `HostSetup.tsx`, `ClassDetail.tsx`.

## Not done or not checked

- Per-step room options (an exit ticket on one game only): room settings are kept for the whole lesson.
- The Carry on button, using a template from the page and uploading a slide picture were checked by server tests,
  not driven in a browser. Not tried on a real device or with a screen reader.
- If a lesson is edited while it runs, the next step comes from the saved lesson; the steps already shown keep their place.
