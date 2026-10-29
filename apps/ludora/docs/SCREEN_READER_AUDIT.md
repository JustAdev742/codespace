# Screen-reader audit

What a screen reader is given in Ludora's key flows, checked by machine on 2026-10-29. This is
not a substitute for a person playing with a real screen reader; that pass is listed at the end
and still needs doing.

## How it was checked

Against the production build, in Chromium:

- **Recordings.** A host on a desktop and a player on a phone (390 px, reduced motion)
  played real games. The player answered by keyboard: focus on the answer, then Enter. The
  recording kept every message the page put in a live region and where focus landed after each
  answer, and captured the accessibility tree mid-question. Modes: Classic, Glim Duels,
  Gold Rush, Glow Tag Royale and Code Breakers (3D), Word Scramble and Tug of War (tree only).
  An earlier recording covered a whole Classic game from join to results.
- **Automated rules.** axe-core (WCAG 2.0 to 2.2, A and AA) runs in the end-to-end tests:
  - on 15 pages at phone width, now including `/privacy` and `/terms`;
  - on the delete-account dialog while it is open;
  - in an earlier pass, while a live game was played in each of the 14 original modes.
- **Tests that keep it so.** `e2e/game.spec.ts` answers by keyboard and asserts the
  announcements and where focus is, for each question and after each answer.
  `e2e/account.spec.ts` covers downloading data and deleting an account. Both pass in
  Chromium, WebKit and Firefox here, and CI runs them in all three.

## What a player hears

From the Classic recording, condensed:

> Joining the game. You are in. Waiting for Ms Rivera to start. The game is starting: Classic.
> The first question is coming up. Question 1 of 12. What is a group of lions called?
> Answer locked in. Your answer: A, A herd. Incorrect. The answer was D, A pride.
> You are 3rd with 0 points. Question 2 of 12. ...

- One polite live region speaks each change once: joining, the start, each question with its
  number, the locked-in answer, the result with the right answer, a five-second warning, the
  player's place, pauses ("The host lost connection. The game is paused...") and the end.
- The self-paced 3D modes say the result and the next question together ("Correct. +1 dig.
  How many hearts does an octopus have?").
- The 3D pictures are images with a text description. Gold Rush and Code Breakers describe the
  player's state in it ("Your mine: your Glim is at the top of the shaft, with 0 gold in the
  cart").
- Word Scramble's letter tiles are buttons named "Letter L" and so on, with Back, Clear, Hint
  and a "Type it" alternative. Matching questions mark the chosen item as pressed.

## Found and fixed

| Finding | Fix |
|---|---|
| In Classic and Glim Duels, answering replaced the answer buttons with "locked in" and focus fell to the page body. A screen reader went back to the top of the page after every answer. | The question card watches for the focused element disappearing and moves focus to the question (`QuestionCard.tsx`). The game test now answers by keyboard and checks focus after every answer; it fails without the fix. |
| A player who did not answer in time was told "Incorrect", on screen and aloud. | Classic and Glim Duels now show and say "Time's up, no answer", with the right answer. |
| In WebKit, focus now and then stayed off a new question (once in CI), or off the image description after an upload (once here). | Focus now checks again on each frame for a second, and moves only if it is still on the page body or on something gone or hidden (`lib/focus.ts`). |
| Firefox logged a blocked `eval` on every page that checked a form (zod's speed test against the security policy). That was noise for anyone listening to errors, and failed the Firefox tests. | Turned off; every CSP violation is now an error in the browser tests. |

## Known gaps

- Glow Tag Royale's picture description never changes ("The park at night, seen from behind
  your Glim"). Its score and charge are on screen as text, but the description could say where
  the action is.
- In a fast room, the locked-in message, the result and the next question can arrive within a
  second of each other. Screen readers queue polite messages, so nothing is lost, but it is a
  lot at once. Only a listener can judge whether to trim it.
- The host's big screen is built to be seen from across a room; its announcements were
  recorded, but nobody has run a lesson from it with a screen reader.

## Still to do: a person with a screen reader

Nobody has played Ludora with NVDA, JAWS, VoiceOver or TalkBack. Before telling a school it
works for blind or low-vision students, have someone who uses one daily:

1. Join a game on a phone (VoiceOver on iOS, TalkBack on Android) and play Classic, one
   self-paced mode and one 3D mode to the end.
2. Sign up, change settings, download their data and delete the account, on a laptop with
   NVDA or VoiceOver.
3. Host a game as a teacher with a screen reader, from setup to results.

Note what was confusing, slow or missing, not only what failed.
