# Tower Together (`tower-together`): results

A new, original 3D game mode: the whole class builds one lantern tower on a hill before dawn, and wins
or loses together. Design and rules are in `docs/MODES_3D.md` ("Tower Together").

| What a person now sees or can do | Where it lives | How it was verified |
|---|---|---|
| Hosts can pick Tower Together in the catalogue (party, 3D, 1 to 200 players, 4 to 8 minutes) with its rules, settings (wind, target, two towers) and three variants. | `packages/engine/src/modes/tower-together/meta.ts`, registered in `modes/index.ts`, `modes/catalog-data.ts`; `@ludora/engine/tower-together` export; `tower` glyph in `web/src/art/ModeArt.tsx` | `npx vitest run packages/engine/test/{modes,catalog,common-settings,variants}.test.ts`: all pass |
| Right answers earn pieces (hold up to 3); a wrong answer costs a 2-second pause and nothing else. Timber (+2 floors, +18 sway), stone (+1 floor, −9 sway) and lantern braces (nothing below can fall). A piece's sway is divided by the crew size, so the gauge moves at the same pace for 1 builder or 60. Floors above the highest brace add leverage; a brace takes it away. | `tower-together/index.ts`, `odds.ts` (`pieceEffect`, `swayFor`, `towerSway`) | `rules-tower-together.test.ts` "pieces" (8 tests) |
| Gusts on a fixed schedule, announced 8 seconds ahead on every screen with their strength and what sway they can stand; the odds of each strength are always on screen and the server draws from the game's seeded source with exactly those numbers. A gust that finds the tower swaying too much drops every floor above the highest brace, and credits the brace's placer with the floors it saved. | `index.ts` (`scheduleGust`, `land`), `odds.ts` (`gustOdds`, `pickGust`) | "gusts and falls" (7 tests): printed chances matched within 1 point over 30,000 seeded draws (normal and storm) and within 7 points over 300 real seeded games |
| A class target set from the number of builders (32 alone, 176 for 5, 1,076 for 30, 2,156 for 60), raised for late joiners; stars at 100, 125 and 150%; coop win or loss at dawn; each player's own score (pieces, floors standing, floors saved), with the live board in the results' order. | `odds.ts` (`targetFloors`, `starsFor`), `index.ts` (`results`, `ranking`) | "targets, stars and the end" (5 tests) |
| Variants: Two Towers (each team its own tower, same gusts, nearer its target wins), Storm Night (gusts every 30 s, gales far likelier, 90% target), Calm Build (no gusts or falls; full sway blocks timber). | `meta.ts`, `index.ts` | "variants" (3 tests); every variant played to dawn by bots alone and with churn and a pause |
| Practice bots that read the gauge; games play to dawn with 1, 4 and 12 players, teams, flashcards, churn, a pause, and replay the same from a seed; a player's view stays under 8 KB with 40 in the room. | `index.ts` (`bot`, `choosePiece`) | "conformance" (10 tests), "bots and balance" (2 tests) |
| 3D: a toon tower of planked timber, blue-grey stone and glowing gold brace bands on a night hill, with lit windows on braced floors; Glims on a scaffold throw each piece up; the tower leans with the gauge; wind streaks thicken before a gust; toppled floors tumble downwind; the sky warms to first light. Phones look from their own Glim's side; the big screen frames the tower itself (pulling back as it grows) with a target ring and a "N floors to go" marker. Glims in one place share one stacked name tag. | `web/src/features/room/modes/tower-scene.ts`, `tower-layout.ts` | Looked at SwiftShader screenshots at 390x844 and 1366x768, 3D and 2D, dark and light themes, and the Hills Grammar look; `/dev/three.html?scene=tower(-host)` with 19 builders, long names, Two Towers and falls |
| 2D for 3D off: the same tower drawn flat, with braces, the lean, target and star lines (or a marker above), builders and the dawn sky. | `tower-side.tsx` | Browser test "with 3D off" and screenshots |
| Every action is a labelled button ("Place Timber: +2 floors, sway +18 to 41."); the sway gauge and height are meters with words; the picture's label says height, target, sway, highest brace and the coming gust; your pieces and each gust's result are announced once drawn. | `tower-together.tsx` | `e2e/tower-together.spec.ts`: a host and two players to the results with 3D on (Chromium) and 3D off (Chromium, Firefox, WebKit), keyboard and tap, axe WCAG 2.2 A/AA clean on both screens; also passed with `E2E_SCHOOL_THEME=hills-grammar` |
| Screens lazy-loaded; existing sounds; the game music track. | `modes/registry.ts`, `music.ts` | `music.test.ts`; `npx tsx scripts/check-public-bundle.ts` passes |

## Balance, measured by simulation

`npx tsx scripts/tower-sim.ts 40 normal` (bot classes answering right 70% of the time, at the practice
bots' pace; 40 nights each for 1 and 5 builders, 13 for 30, 8 for 60). Each cell: nights reaching the
target, mean height as a share of the target, mean falls.

| Builders | Target | Reads the gauge | Random pieces | Mostly timber, untimed | Brace whenever, else timber | Timber only | Stone only |
|---|---|---|---|---|---|---|---|
| 1 | 32 | 93%, 113%, 0.5 | 13%, 72%, 3.5 | 5%, 53%, 4.1 | 0%, 36%, 7.2 | 0%, 20%, 7.6 | 0%, 38%, 1.1 |
| 5 | 176 | 95%, 121%, 0.6 | 18%, 88%, 3.6 | 20%, 76%, 4.5 | 0%, 23%, 7.9 | 0%, 20%, 7.9 | 0%, 37%, 1.0 |
| 30 | 1,076 | 85%, 122%, 0.5 | 15%, 85%, 3.8 | 31%, 92%, 4.1 | 0%, 19%, 8.0 | 0%, 19%, 8.0 | 0%, 40%, 0.9 |
| 60 | 2,156 | 88%, 109%, 1.4 | 13%, 85%, 4.1 | 0%, 61%, 5.8 | 0%, 19%, 8.0 | 0%, 19%, 8.0 | 0%, 52%, 0.8 |

A class that reads the gauge usually reaches the target; one that ignores it usually does not; no
single piece played alone ever does (stone alone never braces, so leverage topples it). Storm Night
(`... 20 storm 1,5` and `... 20 storm 30`, with its 90% target): reads the gauge 90% / 65% / 63% for
1 / 5 / 30 builders, random 10% / 10% / 38%. It is the hard variant, for older classes.

## Why the floor numbers stay large

Each piece a child places is 1 or 2 floors on their own screen ("+2 floors"), and the target is
36 floors a builder, so a class of 20 aims for 716. Scaling floors down for big classes would make one
child's piece a fraction of a floor (0.1 for 20 builders), which reads worse on a button than a big
class total. The big screen now frames the tower itself rather than the whole climb to the target, and
shows "N floors to go"; the lead may still prefer a smaller unit, which would be a display change only
(the balance is in pieces).

## Not verified

A real Chromebook or projector (software 3D in headless Chromium only); a class of 60 real players
(60 measured in the engine by simulation; screens checked with 20 in the demo and 19 builders on the
dev page); the 3D case in Firefox and WebKit (no WebGL headless).
