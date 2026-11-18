# Writing a game mode

Every Ludora game mode is a small module of pure functions on top of a shared
runtime. The runtime owns players, time, randomness, questions, persistence and
networking. A mode only decides what happens. This guide is everything needed to
add one.

## The pieces

| Where | What |
|---|---|
| `packages/engine/src/modes/<id>/meta.ts` | Catalogue data: title, rules, category, settings, variants. The browser imports this file, so it must not import game logic. |
| `packages/engine/src/modes/<id>/index.ts` | The mode: `defineMode({ meta, settings, action, init, onAction, onTimer, view, results, bot, botDelay })`. |
| `packages/engine/src/modes/index.ts` | Register the mode and its variants (`MODES`, `VARIANTS`). |
| `packages/engine/src/modes/catalog-data.ts` | Register the metadata for the browser catalogue. A test checks this matches `MODES`. |
| `web/src/features/room/modes/<id>.tsx` | The player screen and the host (big screen) view. |
| `web/src/features/room/modes/registry.ts` | Register both screens (lazy-loaded). |

Start by copying `packages/engine/src/modes/_template/` (a complete minimal mode)
and `web/src/features/room/modes/classic.tsx` or `comet-dash.tsx`.

## The contract

A mode is `GameMode<State, Settings, Action>` (see `packages/engine/src/sdk/types.ts`):

- `init(ctx)` returns the initial state when the host presses Start.
- `onAction(state, playerId, action, ctx)` handles a player action that already
  passed the mode's Zod `action` schema. Return `{ error: 'message' }` to refuse it.
- `onTimer(state, timerId, ctx)` fires timers set with `ctx.setTimer(id, at)`.
- `onHostNext(state, ctx)` (optional) for host-paced modes: the host pressed Next.
- `onPlayerJoin` / `onPlayerLeave` (optional) for late joiners and leavers.
- `view(state, viewer, ctx)` returns what one viewer sees: a player
  (`{ kind: 'player', playerId }`) or the host screen (`{ kind: 'host' }`).
- `results(state, ctx)` returns standings (higher score ranks higher; ties share
  a rank), optional team standings, an outcome (`competitive`, `coop-win`,
  `coop-loss`) and a one-line summary.
- `bot(view, ctx)` / `botDelay(view, rng)` drive practice bots and the automated
  full-game tests. Bots see exactly what a player sees and get answers from
  `ctx.answer(iid)`, which is right with probability `ctx.skill`.

### Rules the runtime relies on

1. **State is plain data.** It is deep-cloned before every hook and committed
   only if the hook returns normally. If a hook throws or returns `{ error }`,
   the state, timers, feed lines and random-number draws are all rolled back.
   Three errors stop the game and save the scores so far.
2. **Time comes from `ctx.now()`**, which is game time: it stops while the game is
   paused, so modes never need pause logic.
3. **Randomness comes from `ctx.rng`**, which is seeded per game. Replaying the
   same inputs gives the same game; the tests check this.
4. **`view()` must not change state.** In tests the state is deep-frozen, so a
   mutation throws.
5. **Never put an unrevealed answer in a player's view.** Show questions with
   `ctx.questions.view(iid)`, which strips answers and replaces authored ids with
   positional tokens. Reveal with `ctx.questions.reveal(iid)` only after the
   question closes for that player. The harness fails a mode whose views contain
   authored question objects.
6. **Grade with the engine.** Use the self-paced stream helpers
   (`mechanics/selfPaced.ts`) or the synced-round helpers (`mechanics/syncRounds.ts`).
   Both grade, time and record every answer for stats, rewards and teacher reports.
   If you grade directly with `ctx.questions.grade`, call `ctx.recordAnswer` yourself.
7. **Use `ctx.everyone()` in `results()`** so players who left still appear.
8. **Per-player state for late joiners**: create it in `onPlayerJoin`.

## Mechanics you can reuse

- `selfPaced.ts`: one question stream per player (`streamInit`, `streamSubmit`,
  `streamNext`, `streamQuestionView`). Duplicate and stale answers are refused.
- `syncRounds.ts`: host-paced rounds with intro, question, reveal and leaderboard
  phases, a shared deadline with a short network grace period, early close when
  everyone has answered, buzzer mode (`closeOnFirstCorrect`), eligibility for
  eliminations (`canAnswer`), and `leaderboard()` for ranked rows.
- `questions/deck.ts`: shuffled decks that reshuffle without immediate repeats.
- `oneThing.ts`: calm play's turns (below): `thinking`, `holdBegin`/`holdEnd`,
  `goBegin`/`goEnd`, `putAway`, `shiftClocks`, `turnView`.

## The walkthrough (every mode)

Before a game the server opens a short walkthrough on every screen for players who
have not played the mode (D57). It is made from `meta.tutorial`:

- `steps`: two to four, each a title of up to 28 characters and one or two short
  sentences (up to 150 characters, ending in a full stop) a player of 8 can read on a
  phone. One idea a step. Write them from your rules, not new rules.
- `controls`: every button the mode has besides answering, with the words on the
  game's button, what it does in a sentence, and its key if it has one ("Left
  arrow", "B", "Space", "W, A, S, D or the arrow keys"). Players press them in the
  walkthrough to see what they do; nothing is sent to the game. Required for 3D and
  strategy modes.

`TUTORIAL_LIMITS` in `@ludora/shared` holds the limits and
`packages/engine/test/calm-play.test.ts` checks every mode. A mode without a
walkthrough (a made game) gets its first rules as steps (`tutorialOf`).

## Calm play (`ctx.calm`)

A host can make a game calm for the whole room. Screens turn down on their own
(no flashes, shaking, bursts or pressure sounds, less motion, quieter sound): a
mode screen only needs to use the shared pieces and `motionOK()`.

The rule part is yours if your mode has an action that needs steering, aiming or
timing while a question is open. Then, when `ctx.calm` is true, a question and the
action must take turns for each player, and you must set `meta.calmPlay` (up to 150
characters, for players) saying what changes. Use `mechanics/oneThing.ts`:

- While a question is open the player's piece waits in neutral: it does nothing,
  nothing can happen to it, and its own clocks stand still (`shiftClocks` when it
  resumes). Refuse the action with a plain message.
- After an answer it is the player's go, with no question open, for a set time or
  until the action is finished (`goBegin`, `goEnd`). The game opens the next
  question, never the player.
- Waiting must never be better than playing. Where others could reach the piece,
  bound the wait (`holdBegin` with `shelterMs`; `putAway` the question, uncounted,
  when it runs out), and pay nothing for merely surviving.
- Put the turn in the player's view as `you.calm` (`turnView`), null outside calm
  play, and put the action's buttons away on screen while `phase` is `'question'`
  (`web/src/features/room/CalmPlay.tsx`, `CalmTurn`).
- With `ctx.calm` false the mode must play exactly as before: draw no extra random
  numbers and set no extra timers. The test suite checks that every mode without
  `calmPlay` plays the same game from a seed with calm play on or off, and plays every
  mode with it through the conformance scenarios in calm play.

## Settings and variants

Host settings are declared as fields (`number`, `select`, `toggle`); the host form
is generated from them and values are clamped and validated on the server.
Common settings (seconds per question, time limit, question limit, shuffling,
team count) are available on `ctx.common`; set mode defaults with `defaults`.

A **variant** is a preset of settings that changes how the game plays (for
example Classic's Sudden Death). Variants can lock settings so hosts cannot undo
the twist. Only add variants a player would describe as a different game; never
pad the catalogue with renames.

### Adding a rule option behind a variant

Most variants need a new rule, not just new numbers. The pattern:

1. **Add a setting that defaults to off** (`false`, `0`, or the current
   behaviour as a select's default), so the base mode plays exactly as before.
   It appears in the host form automatically.
2. **Implement it in the mode**, and lock it in the variant. `meta.changes`
   says plainly what differs.
3. **Make it visible through what the screen already shows**: the per-answer
   `text` on the feedback (`stream.last.text`, e.g. "+3 spaces (Momentum)"),
   counters the view already has (scores, lives, positions, team totals,
   question totals), and `ctx.feed` lines (`{ to: [...] }` for private ones;
   send one line for many players rather than one line each). Extra view fields
   are fine only if the screen can ignore them. If the rule cannot be understood
   without new UI, it is the wrong rule for now.
4. **Keep randomness behind the setting.** Draw from `ctx.rng` only when the
   option is on, so seeded games with the option off replay exactly as they did.
5. **Second goes at the same question** (encores, second chances) are recorded
   as attempts, so they count for reports but never twice for rewards or
   streaks: pass `recordingAs(ctx, 'attempt')` from `modes/rules.ts` to the
   helper that records the answer.
6. **Leave the mechanics alone.** Synced rounds can be extended from the mode:
   append to `state.sync.order` in `onClosed` to replay a question, take a
   penalty off `state.sync.scores` inside `score` and show it through
   `state.sync.lastGain` in `onClosed`, and catch the start of a round by
   wrapping `syncOnTimer`/`syncHostNext` (see Classic and Lantern Out).

Test each option with a focused test that proves the rule, driving a
`GameRuntime` on a fake clock (`test/rule-helpers.ts` has a small driver).
`test/variants.test.ts` plays every variant with its mode's fewest players, with
churn on a flashcard-only set, and twice from one seed.

## Status and the conformance test

`packages/engine/test/modes.test.ts` plays every registered mode and variant to the
end with bots: with 1, 4 and 12 players, with teams, with a flashcard-only set,
through a pause, a disconnect, a late joiner and a leaver, and twice with the same
seed to check determinism. It fails on any mode error, stall, or answer leak.
A mode may only be marked `playable` once it passes. Use `beta` for modes that pass
but are still changing, and `planned` for designs that cannot be launched yet (the
catalogue shows them as such and the server refuses to create rooms for them).

Before registering, you can test a mode directly:

```ts
import { simulateGame } from '../src/testing/harness.ts';
import { myMode } from '../src/modes/my-mode/index.ts';
const r = simulateGame({ modeId: myMode.meta.id, mode: myMode, questions: MIXED_SET, players: 4 });
expect(r.errors).toEqual([]);
expect(r.stalled).toBe(false);
expect(r.leaks).toEqual([]);
```

## Screens

Player and host screens receive `{ view, room, act, gameNow, paused }`
(`ModeScreenProps`). Send actions with `act({ type: ..., ... })`; it resolves with
the server's acknowledgement, and the next view reflects the result. Reuse the
shared pieces in `web/src/features/room/game/`: `QuestionCard`, `AnswerInput` (all
question types, keyboard shortcuts, accessible reordering and matching),
`TimerBar` and `Countdown` (driven by the game clock), `ResultBanner`,
`RevealAnswer`, `ChoicesDisplay` (host screen while answers are open),
`Leaderboard` and `TeamScores`.

Design rules: use the theme tokens (`bg-raised`, `text-text-2`, `border-line`,
`bg-lantern`, `bg-glim`, `bg-ember`, `bg-dusk`); keep the host screen readable from
the back of a classroom (large type, high contrast); never rely on colour alone;
respect reduced motion (CSS animations are disabled automatically); keep text in
plain British English.
