# Game Maker: make a game by writing simple code (`gamecode`)

One Game Maker in the menu (`/game-maker`). Its main view is the game's **code**: one statement a
line, read like a sentence, with the forms beside it on a laptop (a Code / Forms switch on a phone)
and a live test against bots under the code. Old addresses keep working: `/mode-studio` and
`/mode-studio/<id>` land on `/game-maker…`, and `/games` (the old "Game Maker", which saved a mode
with its settings and a set) lands on Game Maker's **Saved games** tab.

The rule that does not change: a made game is **data, never code that runs**. Game code is a
language of Ludora's own that `fromCode` reads into a blueprint; `parseBlueprint` checks it like
any saved game (word filter included) and the one made-game interpreter plays it. Nothing anyone
writes is evaluated, on the server or a device. Every number is capped, every game has its hard
time limit, and a made game pays by the ordinary reward rules. No migration (blueprints are
stored as JSON already); no new dependency.

```
game "Coin keeper"
race to 30 steps
questions: own pace, 40 each, 20 seconds each
right answer: move 1 step
wrong answer: nothing
each player has 0 coins
when a player answers right: add 1 coin
when a player reaches 5 coins: get a leap power-up and set coins to 0
when a player gets halfway: say "Halfway there!"
wins: first to the goal
stops after 5 minutes
looks: 3D harbour, loop track, day
```

| What a person now sees or can do | Where it lives | How it was verified |
|---|---|---|
| One "Game Maker" in the side menu, search and Make page; Mode Studio is gone from the menu. Game Maker's front page has two tabs: **Make a game** (starting points, each card showing its first lines of code; your games; games others listed) and **Saved games** (the old page: a mode with its settings and a set, saved from the host page, described as that, with Yours / Shared by others) | `web/src/app/Shell.tsx`, `routes.tsx`, `features/modestudio/ModeStudioHome.tsx`, `features/games/Games.tsx` (`SavedGames`), `features/search/SearchPalette.tsx`, `features/making/registry.tsx`, `MakePage.tsx` | `e2e/gamecode.spec.ts` test 1 (one menu item, no Mode Studio link, tabs, axe at 390 and 1366) |
| Old links land in the right place: `/mode-studio` → `/game-maker`, `/mode-studio/new?from=gem-hunt` → `/game-maker/new?from=gem-hunt`, `/games?tab=community` → `/game-maker?tab=saved&saved=community`; every link that said Mode Studio now says Game Maker (cards, host page section "Games made in Game Maker", set and profile pages, staff reports) | `features/modestudio/OldLinks.tsx`, `data.ts`, `MadeGameCard.tsx`, `HostMadeGames.tsx`, `MakerGames.tsx`, `admin/Reports.tsx` | e2e test 1; `e2e/modestudio.spec.ts` updated to the new names and passing; `e2e/pages.spec.ts` "Game Maker tabs" still opens `/games` |
| **Game code**, both ways: `toCode` writes any blueprint as code with a comment heading each part; `fromCode` reads it back. Forgiving: capitals, extra spaces, number words ("thirty"), "1 life", singular or plural, `#` and `//` notes (a `#` inside quotes is words). For every valid blueprint, `fromCode(toCode(bp))` equals the blueprint in its plain form (`normaliseBlueprint`: unused settings such as a speed bonus on a steady game reset), and the plain form plays exactly the same | `packages/shared/src/gamecode.ts`, `normaliseBlueprint` in `blueprint.ts` | `packages/engine/test/gamecode-roundtrip.test.ts`: **1,000 random valid blueprints plus every starting point** round trip (over 400 of them with rules); 80 random blueprints play identically before and after normalising (standings, summary, length); `packages/shared/test/gamecode.test.ts` (22 tests) |
| Code and forms always in step: typing updates the forms, the rules in words, the heading and the live test whenever the code reads as a working game; changing a form rewrites the code, keeping the person's notes, blank lines, line order and their own wording of every line that still means the same; Undo (button and Ctrl+Z outside the editor) covers both views, a run of typing is one step | `ModeStudio.tsx` (`changeCode`, `change`), `mergeCode` | round-trip test "a form change rewrites the code but keeps comments…" (200 random pairs); shared test "keeps the person's own words"; e2e test 2 (Lives form → `4 lives` in the code, the note on line 1 kept, Undo back to `5 lives`) |
| **Problems a child can fix**: each names its line, says what is wrong in words and, where it can, offers the nearest thing that works as a button: "Line 2: I do not know “rase”. Did you mean “race”?" (Use “race”), misspelt power-ups, places, props, colours, covers, events, unknown numbers in rules ("Did you mean “coins”?"), the wrong twist for the kind, a line said twice, a rule without a colon, a message of your own, ranges from the check on their line ("Line 2: Track length must be at most 60."), and a line it cannot read (offer: make it a note). The editor underlines the line and marks its number; the live test keeps playing the last working game and says so | `fromCode`, `nearest` (edit distance with swapped letters), `CodeEditor.tsx` | shared tests "problems a child can fix" (8 tests, every message checked word for word, every message is a sentence); e2e test 2 (“rockett” → message, last game still running, fix button, ready again; axe on the mistake state at 390 and 1366) |
| **Help while typing**: ideas for the next word under the editor (statement starts, kinds, places, twists, triggers, conditions after "if", actions after the colon or "and", the game's own numbers), keyboard: Ctrl+Space or Alt+Down to reach them, arrows to move, Escape back; **What you can write**: every kind of line in groups with a one-line help, searchable, each inserts itself after the caret's line; **Starting points as code** to read, with Use this code; **Copy the code** and **Paste code to make a game** (checked before it can be used) | `completeLine`, `CODE_CATALOGUE`, `CodeEditor.tsx`, `CodeHelp.tsx` | shared tests "completes the next word", "every example in the list reads"; e2e test 2 (next-word idea completes "stops after 4 min" to minutes; help search "golden", pressing the line inserts it) |
| The editor is a plain textarea over a coloured copy in the same font (Atkinson Hyperlegible), so a screen reader, a phone keyboard and selection work as usual; line numbers; colours from the theme tokens (works in day, night and the school look); labelled, with its hint and problems linked by `aria-describedby` | `CodeEditor.tsx`, `highlightLine` | shared test "colours the words of a line"; e2e axe at 390 and 1366 |
| **Numbers of the game's own**: up to 6, each kept for each player, each team or the whole game, with a start and a top ("each player has 3 health, up to 5"); never below 0 or above the top. Players see theirs (and their team's) on their screen with a picture chosen from the name (coins, hearts for health, keys, stars, gems, energy, flags, rounds; # otherwise); numbers for the whole game everyone sees | `packages/shared/src/gamerules.ts`, interpreter `made-game/index.ts`, `web/src/features/room/modes/made-game.tsx` (`VarPills`) | rules test "keeps numbers per player…"; fuzz test checks every number in every view is a whole number within 0 and its top, and the big screen never holds a player's numbers; e2e test 2 (the live test and a real player's screen show "3 keys") |
| **Rules**: up to 16 of "when something happens, if these hold: do these". 15 triggers (the game starts, answers right, wrong, quickly, N right in a row, N wrong in a row, every N questions, reaches N of a number or the score, runs out of a number, gets halfway, takes the lead, uses a power-up, a round starts, a round ends, N minutes left), 7 conditions (a number or the score at least / at most N, first place, last place, on team N, an N% chance, in the last N minutes) and 21 actions (gain, lose, add, take, set a number, everyone gains, everyone behind gains, everyone ahead loses, the leader loses, get a power-up, get a shield, freeze the leader, golden round, rally, double points from now on, gain a life, lose a life, swap with the leader, win, end the game, say one of 12 fixed messages). Phases such as "sudden death in the last 2 minutes" are written with the time condition | `gamerules.ts`, `logicProblems` and `describeRule` in `blueprint.ts`, interpreter | `packages/engine/test/made-game-rules.test.ts` (10 games written in code and played move by move); shared test "numbers and rules: every trigger, condition and action reads" |
| Rules are bounded everywhere: at most 2 conditions and 3 actions a rule, amounts 1 to 10 (numbers 1 to 100, set 0 to 999), a rule works at most 30 times for each player and its room-wide actions at most 10 times a game, rules set off by what changed (reach, run out, halfway, the lead) run once and never set off more, nothing a rule does stops the time limit | `RULE_FIRES_PER_PLAYER`, `RULE_FIRES_ROOM`, `derived` in the interpreter | rules test "a rule works at most 30 times for each player"; fuzz below |
| The check explains rule problems in words: a number the game does not have, "rounds" in a game played at own pace, minutes left longer than the game, halfway in a game without a goal, lives outside a lives game, swapping in a kind without a single score, "win" for everyone, and anything acting against others in a game everyone plays together | `logicProblems` | shared tests; 11 new ways of breaking a blueprint in `BREAKERS` (each refused with a sentence) in the fuzz test |
| Anything a rule does to another player (behind gains, ahead loses, leader loses, freeze, swap) is listed on the game's card as "Rule: …" with the other parts that act on others; the plain-words rules list every number and rule as a sentence | `rulesActingOnOthers`, `describeVar`, `describeRule` | server test "saves a game with numbers and rules… lists rules acting on others"; e2e test 2 (rules in words follow each line) |
| **The fuzz test with rules**: random blueprints now include random numbers and rules drawn from the whole catalogue | `randomLogic` in `packages/engine/src/testing/blueprints.ts` | `made-game-fuzz.test.ts`: **400 random games played to the end, 238 with 1,037 rules of their own, which worked 7,914 times**: no errors, every game ended inside its time limit, scores and numbers finite and in range, no answers or private state in any view; all 14 kind and pacing pairs |
| Games saved before game code still load and play the same | `packages/engine/test/made-game-compat.test.ts` with a fixture recorded from the interpreter before any change (`fixtures/made-game-before-rules.json`) | 67 blueprints (the starting points and 60 random ones): still valid and unchanged by the check, and each plays to exactly the same standings, summary and length from its seed |
| A rule builder in the forms for the same list: numbers (name, kept for, start) and rules (When, an optional If, Do, with the number, power-up or message each needs), each shown as a sentence and as its line of code, removable; parts that do not fit the game are not offered | `Builder.tsx` (`RulesSection`) | e2e test 2 (When "takes the lead", Do "say" → the line appears in the code) |
| Two new starting points that show numbers and rules: Coin keeper (a 3D harbour race with coins that buy a leap) and Sudden death (lives, where a wrong answer costs two in the last two minutes and last place gets a boost each round) | `STARTER_BLUEPRINTS` | played by the fuzz suite's starting-point tests (1, 4 and 12 players, twice from one seed; a minded class) |
| A rule played in a real room: a game written in code from blank (5 lives, own pace, a number and two rules), saved, hosted and played to the end by two players: "when the game starts: everyone gains 5" shows on the player's screen, their keys show, and the results name the game | the whole path | e2e test 2 |
| "Describe your game" (AI helper) answers in game code: the model is given the catalogue of lines and asked for `{"code": …}`; the server reads it with `fromCode` and the same check (word filter, fixed messages), sends any problem back to the model, and returns the code with the blueprint; flat answers still work | `server/src/modules/ai/tasks/modestudio.ts` | server test "answers as game code the maker can read" (good code, a range problem on its line, a filtered name and a message of its own refused) |

## Browser tests

`e2e/gamecode.spec.ts` (2 tests) passes in Chromium, Firefox and WebKit, and with
`E2E_SCHOOL_THEME=hills-grammar`; `e2e/modestudio.spec.ts` (renamed strings only) passes in all three
(its 3D test is Chromium only, as before); `e2e/pages.spec.ts` "Game Maker tabs" passes through the
old `/games` address. Axe (WCAG 2.2 A and AA) reports nothing on the Game Maker home, Saved games,
the builder (code with a mistake, and with rules) and a player's screen in a made game, at 390 and 1366.

## What a maker still cannot express

- Power-ups and events of their own: rules can give the five built-in power-ups and start the two
  events, but a maker cannot define a new power-up from actions.
- Named phases as blocks: "sudden death in the last 2 minutes" is written as a condition on each
  rule, not as a phase with its own set of rules.
- How you win as a free condition: winning is the kind's ending, or a rule that says "win" or
  "end the game".
- Conditions joined with "or", comparing two numbers with each other, teams by name (only "team 1"
  to "team 4"), and triggers for a team ("when a team reaches 10 flags").
- Moving to a square, sending back to the start, or giving and taking between two players.
- Rules that set off further rules beyond one step (bounded on purpose).

## Not done or not verified

- The solo page's own section for made games (`web/src/features/host/SoloMadeGames.tsx`, another
  workstream's file) still says "Games made in Mode Studio" and links to `/mode-studio`, which now
  redirects to Game Maker. Its words should change to Game Maker when that file is next touched.
- The host page's own copy was not changed (not this workstream's files); its Save as a game still
  saves to what is now Game Maker's Saved games tab.
- The editor was checked by keyboard in the browser tests (typing, ideas, fixes) but not with a real
  screen reader or on a real phone.

- The AI helper's code answer was tested on the server with a model answer, not against a real provider.
- The plain-words list of rules is generated in English sentences only (as the rest of Ludora).
