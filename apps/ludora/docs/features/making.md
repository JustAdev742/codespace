# Making things, and the teacher's working day (`making`)

One place to make anything, a way from notes to a game in about a minute with no AI, one press
from each thing to what comes next, classroom tools for the board (also as a lesson step), the
teacher's day on one page, bulk actions, and the same set picker in every making page.

Migration **0023** (`server/drizzle/0023_making.sql`): `making_drafts` (work in progress on the
Make page, owner only, at most 20 each), `making_tool_state` (what the classroom tools remember for
one teacher and one class: who the picker has chosen this round, the scoreboard), `making_prefs`
(help on the Make page closed for good). Server routes: `server/src/modules/making/routes.ts`.

**Adding a kind of thing to make** is one line in `web/src/features/making/registry.tsx`
(`MAKE_REGISTRY`: id, title, description, icon, link, who can use it, group).

## What was built

| What a person now sees or can do | Where in the code | How it was verified |
|---|---|---|
| A **Make** page in the navigation: everything there is to make, from one registry, shown only to accounts that may make it (teacher things for teachers, the Studio for `studio.use`) | `web/src/features/making/MakePage.tsx`, `registry.tsx`; one line each in `web/src/app/Shell.tsx`, `routes.tsx` | `e2e/making.spec.ts` "a new teacher goes from nothing…" (nav link, axe at 390 and 1366), "a student gets a shorter checklist…" (no teacher sections) |
| Someone who has made nothing sees four guided starts (notes, a ready-made set, maths practice, a lesson or solo play) instead of an empty page | `MakePage.tsx` `GuidedStarts` | e2e "a new teacher…" (Start here, then gone once a set exists); "a student gets…" |
| "Carry on where you stopped": drafts kept on the server and the sets, lessons and saved games changed last, newest first | `MakePage.tsx` `CarryOn`; `GET /api/making/overview` | `server/test/making.test.ts` "lists what the account made lately…", "saves a draft…"; e2e "a new teacher…" (the set is listed after) |
| Drafts carry on from any device; they can be thrown away (with a confirmation); a draft is dropped once it is saved as a set | `QuickMake.tsx` autosave; `/api/making/drafts` routes | `making.test.ts` "saves a draft, carries it on from another device and keeps it from everyone else" (404 for anyone else), "keeps at most twenty drafts…"; e2e "a draft carries on from another device" |
| A checklist of first things to make that ticks itself off from what the account really made, and closes for good (teacher: five steps; student: three) | `MakePage.tsx` `Checklist`; `POST /api/making/help/:key/dismiss` | `making.test.ts` "closes help for good, for known keys only"; e2e "a student gets…" (closed, still closed after reload), "a new teacher…" (0 of 5, then 1 of 5) |
| From notes to questions in code, with no AI: word lists with any separator ("bonjour - hello", "merci: thanks", en and em dashes, bullets, Windows line ends) become choice questions and matching | `web/src/features/making/fromText.ts` | `fromText.test.ts` "reads a vocabulary list…", "handles Windows line endings…" |
| Definitions in prose ("Osmosis is …", "The Nile is …") become questions whose choices are the words, keeping names' capitals | `fromText.ts` `readDefinition`, `pairQuestions` | `fromText.test.ts` "turns definitions in prose…", "keeps the article and capital on a name" |
| Number facts ("Mount Everest is 8,849 metres high") become typed number questions; years are preferred; numbers glued to words (COVID-19) are skipped | `fromText.ts` `readNumberFact` | `fromText.test.ts` "makes number facts…", "does not take numbers glued to words…" |
| Any other sentence becomes a fill-the-gap question on its key word, with a word bank from the other sentences | `fromText.ts` `keyWord`, `blanksQuestion` | `fromText.test.ts` "turns ordinary sentences into gaps…", "picks a name, else the longest word…" |
| Lists become ordering questions (a heading that says "in order", or a numbered list; long lists split into eights) and "Label: a, b, c" lines become one sorting question | `fromText.ts` | `fromText.test.ts` "reads a list in order…", "splits a long list…", "makes groups into one sorting question" |
| Tables pasted from a spreadsheet (tabs, pipes or commas, header row skipped) and "Q: … / A: …" lines are read; the set editor's quick add grammar still works inside notes; nothing is invented from empty or odd input | `fromText.ts` `tableRows`, `answerQuestion` | `fromText.test.ts` "reads a table…", "reads a markdown table…", "reads Q and A lines…", "copes with empty, odd and very long input…" |
| Every suggestion shows what it was made from, and can be left out, kept again or changed in place; a bad change is refused with what to fix | `QuickMake.tsx` `SuggestionCard`; `fromText.ts` `editSuggestion` | `fromText.test.ts` "changing a suggestion" (2 tests); e2e "a new teacher…" (leave out, empty question refused, change saved) |
| A ready-made set from the built-in library in one press, copied into the teacher's own sets | `QuickMake.tsx` `TopicPicker` | e2e "more ways to make and organise…" (copied, suggested games shown; axe at both widths) |
| Maths practice in a minute: sums, numbers and count chosen, every answer worked out, saved as a set | `QuickMake.tsx` `MathsMaker` (uses the editor's `templates.ts`) | e2e "more ways…" (8 sums, saved) |
| After saving, the three games that suit the set best (hosting's own ranking), each one press from hosting it, playing it solo or adding it to a lesson; the host page opens with the set and that mode chosen | `SuggestedGames.tsx`; `?mode=` preset in `web/src/features/host/HostSetup.tsx` | e2e "a new teacher…" (best mode is checked on the host page, room created) |
| From a set's page: "Make a lesson with it" (a starter, main and exit ticket with the set in every game) and "Set as homework" | `NextSteps.tsx`, `lessonFromSet.ts`; one line in `SetDetail.tsx` | `bulk.test.ts` "a lesson from a set"; e2e "more ways…" (every game step holds the set) |
| After a hosted game, the host's "What next" adds the full report and "Missed questions as a new set" (then a link to open it) | `GameNextSteps.tsx`; one line in `web/src/features/room/Results.tsx` | e2e "after a game the host has the full report and the missed questions as a new set…" |
| On a class's page, the next thing due (or the latest one still to play), one press from its report and the day view | `ClassNextUp.tsx`, `next.ts`; one line in `ClassDetail.tsx` | `bulk.test.ts` "the next thing due for a class"; e2e "classroom tools…" |
| Classroom tools: a stopwatch with laps | `web/src/features/making/tools/Tools.tsx` `StopwatchTool` | `tools/logic.test.ts` "reads the stopwatch"; e2e "classroom tools…" |
| Classroom tools: a quiet traffic-light check-in (students hold up a colour; the teacher counts each with one press) with the split and what it suggests | `Tools.tsx` `CheckInTool`; `tools/logic.ts` | `logic.test.ts` "check-in" (2 tests); e2e "classroom tools…" ("50% are stuck…") |
| Classroom tools: a scoreboard for anything (add rows, +1, −1, +5, ties share a place, back to zero), remembered for the class on the server | `Tools.tsx` `ScoreboardTool`; `/api/making/classes/:id/tools` | `logic.test.ts` "scoreboard" (2 tests); `making.test.ts` "remembers the picker and the scoreboard for the class's teacher only" (student 403, other teacher 404); e2e (kept after reload) |
| The random picker remembers who has had a turn this round between visits ("not again"), only for students still in the class | `Tools.tsx` `PickerTool`; `ClassTools.tsx` `useToolMemory`; `today.ts` `cleanToolState` | `making.test.ts` (outsider never remembered); e2e "classroom tools…" (after a reload the other student is picked) |
| The team maker can use the class's own groups | `Tools.tsx` `GroupsTool` | Typecheck only for the groups button; the shuffle is the existing tested `makeTeams`. Not counted separately. |
| A classroom tool as a lesson step: "Add a classroom tool" in the lesson editor; the tool runs on the big screen with the room's players, devices show the slide and "Look at the big screen"; the step's time counts in the lesson's minutes | `packages/shared/src/lessons.ts` (`tool` on a slide), `server/src/modules/lessons/run.ts`, `model.ts`; `StepDialog.tsx`, `LessonEditor.tsx`, `lessons/room.tsx`, `making/tools/BoardTool.tsx` | `making.test.ts` "a classroom tool as a lesson step" (2 tests: plan note never reaches the room, wrong account 404); e2e "classroom tools…" (picker picks the joined player; axe on host and phone) |
| The teacher's day (`/today`): lessons planned for the day, homework due, due in the next week, and work past its date that someone has still not done, each one press from its report; tools for each class; any day by arrows; prints on its own sheet | `web/src/features/making/Today.tsx`, `day.ts`; `GET /api/making/today`, `today.ts` | `making.test.ts` "sorts work into today…", "gives a teacher their day…" (student 403, other teacher sees nothing, too long a range 409); `bulk.test.ts` "a day in this device's time"; e2e "classroom tools…" and "more ways…" (print, the day before) |
| The same homework for several classes at once, from the shared picker, with each class's result listed (and the server's reason for any refused) | `Organise.tsx` `Homework`, `bulk.ts` | `bulk.test.ts` "bulk actions" (2 tests); e2e "classroom tools…" ("2 classes done") |
| Many sets into a folder, or into the bin, at once | `Organise.tsx` `Sets` | e2e "more ways…" (3 into a folder, 1 to the bin; axe at both widths) |
| Old classes archived together at the end of the year (owners only, as before) | `Organise.tsx` `Classes` | e2e "more ways…" (2 archived, checked through the API) |
| One set picker on the making pages: Recent (sets this account hosted, on any device), Starred (any set it starred and may still see), Made by me, All sets | `SetPicker.tsx`; `GET /api/making/sets` | `making.test.ts` "lists sets for the shared picker…" (a set made private leaves both lists; another account's stars are its own); e2e "classroom tools…" (Made by me) |

**28 rows**, every one verified as described. Not counted: the team maker's "Use the class's groups"
button (no test of its own) and the AI panel beside the quick maker (below).

## Before and after

Screenshots of the screens changed, from the base commit and from this branch, taken with the
same script: set page, class page, class tools, lesson editor, teacher home. Plainly:

- **Class tools**: clearly better (three more tools, each with full screen; the picker and
  scoreboard are remembered).
- **Class page**: the "Next due" strip is new above the join code; otherwise the same.
- **Set page**: busier. Two more buttons ("Make a lesson with it", "Set as homework") in the action
  row push the star button onto a line of its own at 1366 pixels. Not clearly better to look at.
- **Lesson editor**: one more button in the "Add a step" row; the slide dialog has a tool choice.
- **Teacher home**: unchanged (the Make page is reached from the navigation).

## AI helpers

Where the AI question drafts are switched on for the account, the quick maker offers "Draft with AI
instead" and "Draft more with AI", which open the editor's existing drafts dialog; kept drafts join
the suggestions like any other. Everything on these pages works with AI off, which is how every
test above ran. The AI button itself was not tested here (no provider in the test server).

## Not done

- Students' devices do not take part in the check-in (it is the teacher counting held-up colours).
  A device vote would need a new room message.
- The host page's own set picker and the lesson step dialog's set chooser were not switched to the
  shared picker (they belong to other screens; the picker is ready to drop in).
- Lesson starting points: the existing three templates are unchanged; no "test without scores".
  "Try a step without opening a room" and dragging a set into a lesson were not built.
- No exports beyond what existed; printing is the day view only.
- A tool step in a lesson does not remember the picker between lessons (the class tools page does).

## Not checked

No real classroom, projector, Chromebook or screen reader. Full screen per tool was only checked by
hand in the code (headless browsers do not show it); its button is covered by axe.
