# The chaos layer: writing cheats

Chaos is Ludora's secret cheat menu. Players unlock it by finding an Easter egg (see
`docs/CHAOS.md`); after that they can cast cheats in live games. This folder is the engine
side: what a cheat is, how it runs, and how it is tested.

Everything runs on the server inside the game runtime. A cheat either changes the real game
state, in the same kind of transaction a mode's own moves use, or it is refused and nothing
changes. The browser only asks; it never decides.

## Files

| Path | What it is |
|---|---|
| `types.ts` | Every type: `CheatDef`, `ChaosApi`, `ActiveEffect`, `ChaosAdapter`, `MeterDef`. Read it first. |
| `registry.ts` | `defineCheat(s)`, the checks every cheat must pass, availability per mode. |
| `engine.ts` | Casting (targets, params, energy, cooldowns, shields, conflicts, combos), effects, undo, view. |
| `adapters/<mode>.ts` | How each mode's state looks to cheats: meters, rounds, question streams, features. |
| `cheats/*.ts` | Universal cheats that work in any mode with the right capabilities. |
| `packs/<mode>.ts` | Cheats that only make sense in one mode. |
| `../testing/chaos.ts` | `ChaosSim`: a bot game on a fake clock you can cast into, for tests. |
| `../../test/chaos-catalogue.test.ts` | The suite every cheat must pass (see Testing). |

## A cheat

```ts
{
  id: 'tug-of-war.rope-burn',      // '<pack>.<words>', lowercase
  name: 'Rope Burn',                // unique across the whole catalogue
  category: 'troll',                // score | advantage | troll | economy | round | visual | random
  description: 'For 10 seconds, an opponent\'s pulls move the knot half as far.',
  target: 'opponent',               // see ChaosTarget in types.ts
  modes: ['tug-of-war'],            // packs: always exactly their own mode
  needs: ['rope'],                  // capabilities the game must have (meters, 'sync', 'stream', 'teams', features)
  cost: 25,                         // chaos energy, out of 100; refills at 4 per second
  cooldownMs: 30_000,
  durationMs: 10_000,               // present = a lasting effect
  apply(api, cast, fx) { ... },     // runs once when cast; return { error } to refuse (everything rolls back)
  hooks: { delta, gate, tick, end },
  overlay: (fx) => ({ kind: 'badge', text: 'Rope burn', tone: 'bad' }),
}
```

- **apply** does the instant part. It gets a `ChaosApi` bound to a draft of the game state.
  Refuse with `{ error }` whenever the cheat could not do anything right now (nobody has points,
  no question is open). A cast that succeeds must change something real.
- **delta** hooks see how much each meter changed in one of the mode's own transactions
  (`d` maps player, team or `'game'` id to the change) and may edit `d` in place: double it,
  move part of it to someone else, zero it. The engine writes the result back through the
  meter. Hooks run lowest `priority` first.
- **gate** sees an action from one of the effect's targets before the mode does. Return
  `{ block: 'message' }` to refuse it. Gates read the committed state and must not change it.
- **tick** runs every `tickMs` while the effect lasts. **end** runs when it expires, is stopped,
  undone, calmed, or its target leaves (`reason` says which).
- **overlay** is what the targets' screens show while the effect lasts. Kinds the web app draws
  are listed in `overlays.ts`; packs should stick to `badge`, `countdown` and `banner`.

Instant cheats can be undone by their caster for 20 seconds: the engine records every meter
change `apply` makes through the api and reverses it. Changes made by writing to `api.s`
directly cannot be reversed, so a cheat that does that must set `undoable: false`.

## Meters and the mode's own rules

Read and write numbers through meters (`api.get`, `api.set`, `api.add`, `api.score`), never by
reaching into the state for them, so undo, clamping and delta bending all work. A meter is
declared in the mode's adapter with a `min` and `max` that keep the mode's own rules intact: a
racer can be dragged to one space short of the finish but not over it, because crossing the
line is the mode's moment (it hands out places and may end the game). Follow the same rule
when you add meters or change state directly: **chaos never ends a game, never knocks a
player out, and never leaves the state in a shape the mode could not have produced.** If in
doubt, read the mode's `onAction` and `onTimer` and check what they assume.

When a meter only means something with some settings (Big Catch's score is the wallet plus the
tank, but in Trophy Hunt it is the three heaviest fish, which no cheat can write), give it
`offered(settings)`: with settings it returns false for, its `meter:<key>` capability is left out
and the cheats that need it are not offered. The meter still reads, so rankings stay right; give
it a min and max equal to its value there too, so nothing can write it by accident.

Scores run on very different scales across modes (a Classic answer is worth about 1,000, a
Tug of War pull is worth 1). Move shares, not flat amounts: `share(v, p)` in `cheats/kit.ts`
is p% of v and at least 1 when v is positive; `scaleGain` multiplies a gain so it always
changes.

## Distinct, real, honest

- Each cheat must do something no other cheat does. "+10%" and "+20%" are one cheat; a steal
  and a swap are two. Parameters are fine on one cheat; a second cheat that is the first with
  a different number is not.
- No cheat may claim something happened that did not. Feed lines and overlays describe what
  actually changed.
- Random outcomes use `api.rng` (seeded, rolled back with the cast) and state their odds in the
  description, using `odds()` from the kit.
- Chaos never touches anything outside the game: accounts, wallets, collections, rewards.
- Players are 8 to 17. Names, feed lines and overlays stay school friendly: no weapons,
  violence or cruelty (a sunbeam burst, not a ballista; a pinky swap, not a blood pact).

## Testing

`test/chaos-catalogue.test.ts` plays two identical bot games for every cheat and every mode it
claims to support, casts the cheat in one, and fails unless they then differ (in game state;
for purely visual cheats, in what the targets are told to show). It also fails if the cast is
refused in every situation it tries, or if any error is logged. Some cheats need a situation
set up first (a shield needs an attacker); describe it in `test/chaos-scenarios/<pack>.ts`.
That file may import only types from `test/chaos-scenarios.ts`: the folder is loaded from inside
that file, so a value import back into it leaves the pack's scenarios out.

Run it for one pack while working:

```bash
npx vitest run test/chaos-catalogue.test.ts -t "tug-of-war\."
```

Write targeted tests too, for behaviour the catalogue suite cannot see (exact amounts, limits,
what happens on expiry). `ChaosSim` makes that short:

```ts
const sim = new ChaosSim({ modeId: 'tug-of-war', questions: MIXED_SET, players: 4, common: { teamCount: 2 } });
sim.run(15_000);
expect(sim.cast('p1', { cheatId: 'tug-of-war.rope-burn', target: 'p2' }).ok).toBe(true);
```
