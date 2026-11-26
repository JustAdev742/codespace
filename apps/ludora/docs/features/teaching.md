# The next generation of teaching

Workstream `teaching`, 26 November 2026. The owner asked for what would most change a real
classroom. Ranked, with what Ludora already had:

1. **Insight during the game, not after it.** Reports already said, after a game, which wrong
   answer the class shared, who answered few and who might be guessing. By then the lesson has
   moved on. Built (below).
2. **What to teach next, across a class's games.** Each report had a line and the class page had
   "most missed"; nothing gathered them by topic or said what to do. Built (below).
3. **Spaced re-practice of what each student got wrong.** "My mistakes" kept them and played
   the most-missed first, all at once. Built (below).
4. **A mastery map across topics** for a student and a class. A student's page had accuracy by
   subject and question type; the mastery grid was one assignment at a time. Built (below), with
   what to teach next, because they are the same counting.
5. **Adaptive difficulty.** Not built. What exists already is close to it and is listed under
   "Not built" below.

## What was built

| What it was | What a teacher sees now | Where | How it was verified |
|---|---|---|---|
| A teacher learned which wrong answer the class shared, and who was struggling, from the report after the game. | On the teacher's phone remote, while the game is being played: how much of the class is right so far; **Worth a word now** (the latest question where at least two players gave the same wrong answer, and what they said); the questions found hardest so far; and **Might like a hand** (three first tries missed in a row, or under half right after four). Worded kindly. It is worked out from the answers the room already holds for the report: nothing more is collected and nothing is kept. | `server/src/modules/analytics/live.ts`, `server/src/realtime/room.ts` (`insight`), `web/src/features/room/host/Insight.tsx`, `RemoteControls.tsx` | `server/test/live-insight.test.ts` (7 tests: first tries only and no practice bots, the shared wrong answer, the open question left out, three in a row and under half, a right answer ends a run, blocked language never repeated, and who is sent it). A game played in the browser with the remote open on a phone: nothing while the first question was open; after three questions "3 of 5 said Oxygen", two harder questions and three names. |

| "My mistakes" played the most-missed questions first, whenever asked, and a question got right today could be asked again tomorrow. | Each mistake comes back when it is due: at once until it has been got right, then after a rest of two days, because coming back to something as it starts to fade is what makes it stick. The student's home page says how many are ready to try again and how many are resting; the list says "Ready now" or "Resting. Back on Thursday 28 November"; a round plays the ready ones first and is never refused for being early. Nothing new is stored: the schedule is worked out from the two things the list already kept (how many days a question has been got right, and the last of them). The rule that two right days clear a question is unchanged. | `packages/shared/src/students.ts` (`mistakeDue`), `server/src/modules/study/service.ts`, `web/src/features/profile/Mistakes.tsx`, `features/home/StudentHome.tsx` | `server/test/spaced-mistakes.test.ts` (3 tests of the schedule) and `students.test.ts` (with the database: both mistakes ready at once; after one is got right it rests and the other comes first). Not looked at in the browser. |

| The class page had "most missed" across every assignment and a mastery grid for one assignment. Nothing was by topic, live games hosted for the class did not count, and nothing said what to do next. | A **Teach next** tab on the class page. One step for each topic the class has played, the most pressing first: **Teach it again** (the class is under 60% right first time), **Practise once more** (60% to under 80%), **Ready to move on** (80% or more), or **Too few have played to say** (under a third of the class). Each step has the class's share, how the class is spread over the levels, the questions that tripped them with the wrong answer at least two students gave, who is furthest from it or a small group to sit with, who has not played it, and two buttons: make a reteach set of that topic (hardest first) and host it again for the class. Under the steps, **Who knows what**: every student against every topic, as Secure, Nearly there, Still learning, Just started or Not played, each with its own shape and words and the numbers. A student's own report shows their own row, to them and to their teacher. A topic is what a set says it is about: its topic, or its title when it names none. A student is judged on their latest first try at each question, so getting it right the next time counts and the old miss stops counting. | `server/src/modules/classes/teachNext.ts` (the counting), `teach.ts` (the routes), `web/src/features/classes/TeachNext.tsx`, `StudentReport.tsx` | `server/test/teach-next.test.ts` (15 tests: the levels, the latest try counting, the map, the order of the steps, a class past a topic with a group still to sit with, the shared wrong answer and blocked language; then against a database: live games count as well as assignments, somebody outside the class is never counted, a student in the class is refused and anyone else is told there is no such class, a student sees their own topics and nobody else's, a reteach set holds only that topic's missed questions, a set moderators have hidden is left out). |

## Rules it keeps

- **Nothing about the question still open.** In a game played in rounds the room does not yet say
  who is right (D61). The insight leaves the open question out altogether, and the test requires it.
- **For the teacher only.** The server sends it to the host's remote and to nothing else: not the
  big screen (which a class is watching), not a player. The test requires that too.
- **No new data.** It reads the answers already held in memory for the end-of-game report, and
  lasts as long as the game.
- **No AI.** It is counting.
- **Teach next is for the teacher, and a student's row is theirs.** The class's map and steps go to
  the class's teachers only. A student can ask for their own topics and for nobody else's. Names in
  a step are capped at eight, so it is never a register of who is behind.
- **Teach next stores nothing.** It is counted each time from the first tries Ludora already keeps
  for reports, in the class's own games. Answers by anyone who is not in the class are left out.

## Not built

- **Adaptive difficulty.** No game changes its questions to suit a player while it is being
  played. In a game played in rounds everyone must be asked the same thing, so it would have to
  live in solo practice and the self-paced modes, in the engine's own picking of questions, and
  that was not started. What already adapts: "My mistakes" asks what a student got wrong, when it
  is due; practice bots on "My level" stay close to the player; a reteach set holds only what the
  class missed; and Teach next tells the teacher which topic and which students. The next step
  would be solo practice that starts with a student's due mistakes and the questions they have
  not met, from the record Ludora already keeps.
- **Lessons that blend slides, checks and games** were already there (a lesson's steps are info
  slides, classroom tools, polls and exit tickets, and games, run in one room) and were not changed.
- **AI.** Nothing here uses it. The AI module, its consent and its settings were not touched.

## Not checked

- A real class. The thresholds (three in a row, under half after four; 60% and 80% for a topic;
  a third of the class before it is judged; three questions before a level is named) are a first
  judgement.
- A self-paced game on the remote: only Classic was played in the browser. The unit tests do not
  depend on the mode.
- Teach next with a large class or many topics: it was looked at in a browser with twelve students
  and three topics, on a desktop and a phone, with the reteach set made from it. The table scrolls
  sideways when there are more topics than fit; that was not looked at with more than three.
- Spaced practice was looked at only through its tests and the student's home page.
