# The next generation of teaching

Workstream `teaching`, 26 November 2026. The owner asked for what would most change a real
classroom. Ranked, with what Ludora already had:

1. **Insight during the game, not after it.** Reports already said, after a game, which wrong
   answer the class shared, who answered few and who might be guessing. By then the lesson has
   moved on. Built (below).
2. **What to teach next, across a class's games.** Each report has a line; nothing gathers them.
   Not built yet.
3. **Spaced re-practice of what each student got wrong.** "My mistakes" kept them and played
   the most-missed first, all at once. Built (below).
4. **A mastery map across topics** for a student and a class. A student's page has accuracy by
   subject and question type; there is no map. Not built yet.
5. **Adaptive difficulty.** Not built.

## What was built

| What it was | What a teacher sees now | Where | How it was verified |
|---|---|---|---|
| A teacher learned which wrong answer the class shared, and who was struggling, from the report after the game. | On the teacher's phone remote, while the game is being played: how much of the class is right so far; **Worth a word now** (the latest question where at least two players gave the same wrong answer, and what they said); the questions found hardest so far; and **Might like a hand** (three first tries missed in a row, or under half right after four). Worded kindly. It is worked out from the answers the room already holds for the report: nothing more is collected and nothing is kept. | `server/src/modules/analytics/live.ts`, `server/src/realtime/room.ts` (`insight`), `web/src/features/room/host/Insight.tsx`, `RemoteControls.tsx` | `server/test/live-insight.test.ts` (7 tests: first tries only and no practice bots, the shared wrong answer, the open question left out, three in a row and under half, a right answer ends a run, blocked language never repeated, and who is sent it). A game played in the browser with the remote open on a phone: nothing while the first question was open; after three questions "3 of 5 said Oxygen", two harder questions and three names. |

| "My mistakes" played the most-missed questions first, whenever asked, and a question got right today could be asked again tomorrow. | Each mistake comes back when it is due: at once until it has been got right, then after a rest of two days, because coming back to something as it starts to fade is what makes it stick. The student's home page says how many are ready to try again and how many are resting; the list says "Ready now" or "Resting. Back on Thursday 28 November"; a round plays the ready ones first and is never refused for being early. Nothing new is stored: the schedule is worked out from the two things the list already kept (how many days a question has been got right, and the last of them). The rule that two right days clear a question is unchanged. | `packages/shared/src/students.ts` (`mistakeDue`), `server/src/modules/study/service.ts`, `web/src/features/profile/Mistakes.tsx`, `features/home/StudentHome.tsx` | `server/test/spaced-mistakes.test.ts` (3 tests of the schedule) and `students.test.ts` (with the database: both mistakes ready at once; after one is got right it rests and the other comes first). Not looked at in the browser. |

## Rules it keeps

- **Nothing about the question still open.** In a game played in rounds the room does not yet say
  who is right (D61). The insight leaves the open question out altogether, and the test requires it.
- **For the teacher only.** The server sends it to the host's remote and to nothing else: not the
  big screen (which a class is watching), not a player. The test requires that too.
- **No new data.** It reads the answers already held in memory for the end-of-game report, and
  lasts as long as the game.
- **No AI.** It is counting.

## Not checked

- A real class. The thresholds (three in a row, under half after four) are a first judgement.
- A self-paced game on the remote: only Classic was played in the browser. The unit tests do not
  depend on the mode.
