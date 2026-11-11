# Glim Garden (workstream: garden)

A new, original 3D mode: the calm, co-operative one, playable from age 5. The class grows a night garden
together; nobody loses anything and there is no chance in it. Rules and picture: `docs/MODES_3D.md` ("Glim Garden").

| What a person now sees or can do | Where it lives | How it was verified |
|---|---|---|
| Hosts can pick **Glim Garden** in the catalogue (arcade, 3D, 1 to 200 players, 4 to 8 minutes) with its rules, settings (fireflies to light a plot, morning, drooping, team gardens, night and day, show the table) and three variants. Self-paced question types include blanks and sort. | `packages/engine/src/modes/glim-garden/meta.ts`, registered in `modes/index.ts`, `modes/catalog-data.ts`, `packages/engine/package.json` (`./glim-garden`) | `npx vitest run packages/engine/test/{catalog,common-settings,variants,modes,extras-universal,extras-catalogue}.test.ts -t "garden\|Garden\|catalog\|catalogue\|every\|registered"`: 5,953 pass |
| A right answer is a drop of water (hold 3); a wrong answer costs nothing, shows the right answer and the next question comes; a right answer with a full can waters your own plant. | `glim-garden/index.ts` (`onAction` answer) | `rules-glim-garden.test.ts` "drops" (3 tests) |
| Plant a flower (2 drops, 1 firefly), a bush (4 drops, 3) or a lantern tree (6 drops, 4); water your plant; a bloom stays until you plant again and joins the ring round your bed. | `index.ts` (`plant`, `grow`) | "planting and growing" (5 tests, one per plant) |
| A grown lantern tree lights the plots next to it: their plants never droop and grow a step every 30 seconds; it stops when its owner replants. | `index.ts` (`isLit`, `refresh`, `onGrowTimer`) | "the lantern tree" (2 tests) |
| Give a drop to a neighbour's plant: it grows, a firefly comes to their plot, the giver scores 2 and they score 1; the screen puts the neighbour who needs it most first (not glowing, drooping, nearly open). | `index.ts` (`give`, `giftOrder`), `layout.ts` (`neighboursOf`) | "gifts" (3 tests) |
| A plant left 60 seconds without a drop droops; the next drop perks it up; it never dies (off in Calm Garden or with the setting). | `index.ts` (`droopAt`) | "drooping" (2 tests) |
| Fireflies stay at the plot that brought them; a plot glows at 6 (4 or 8 by choice); the garden is full when 8 in 10 of its plots glow (1, 4, 24, 48 for 1, 5, 30, 60 players); a full garden keeps growing until morning. | `meta.ts` (`goalFor`, `PLOT_FIREFLIES`), `index.ts` (`addFireflies`) | "the class goal" (4 tests, including "uses no chance at all: the same moves give the same garden whatever the seed") |
| Variants: **Calm Garden** (no clock, no drooping, ends once the garden is full), **Team Gardens** (one garden and goal per team, neighbours are teammates, team standings by share of goal), **Night Bloom** (70 s nights and 40 s days; flowers sleep and trees go dark by day; bushes grow any time). | `meta.ts` (`variants`), `index.ts` | "variants" (3 tests) and the conformance runs of every variant alone and with churn and a pause |
| Bots garden sensibly and finish games with 1, 4 and 12 players, teams, a flashcard-only set, churn, a pause and a seed replay; a player's view stays under 8 KB with 40 in the room; 200 players play to morning. | `index.ts` (`bot`, `botDelay`) | "conformance" (10 tests) and `modes.test.ts` |
| Each plant is the best choice somewhere: a flower with few drops left, a bush for each drop alone, a lantern tree among growing neighbours. | `meta.ts` (`PLANTS`) | "each plant is the best choice somewhere" (2 tests) and the measured play below |
| Player screen: a 3D garden at night looking at your plot and its neighbours (beds, plants at each stage, drooping, lantern trees and their light, the ring of blooms, fireflies, glowing plots, a pond, your Glim with a watering can that tips, gifts arcing over); drops and your plot's fireflies on the picture, the garden's progress and the morning clock; large buttons to plant, water and give. | `web/src/features/room/modes/glim-garden.tsx` (`GlimGardenPlayer`), `glim-garden-scene.ts` (`GardenScene`) | `e2e/glim-garden.spec.ts` (3D on); screenshots at 390x844 looked at, Ludora and school looks |
| Big screen: the whole garden (or every team garden, each with its sign) filling the picture with the pond beside it, the goal bar, fireflies, garden news, the morning clock and (when shown) the busy gardeners; name tags fit the gap between beds and overlapping tags stack into one (five names, then "and N more"). The whole screen fits 1366x768. | `glim-garden.tsx` (`GlimGardenHost`), `glim-garden-scene.ts` (`GardenHostScene`, `stackTags`) | Spec checks the news names the giver and that the page does not scroll at 1366x768; `/dev/three.html?scene=garden-host&players=60&names=long` and `&teams=1&day=1` screenshots looked at |
| The results open on the garden the class grew (drawn), with its fireflies, blooms and glowing plots; the host can hide the table altogether; a garden that did not fill says so kindly, never "Defeat". | `glim-garden.tsx` (`GlimGardenEnding`), `Results.tsx` and `modes/registry.ts` (optional `Ending` and `tableHidden`) | Spec: results heading and garden picture on host and player; standings present in the 3D run and absent in the 3D-off run (table hidden) |
| With 3D off: a drawn garden from above (trees, path, lawn, beds, plants at their stage, drooping, lantern light, blooms ring, fireflies, glowing plots, your plot outlined in gold), centred on your plot on a phone, whole on the big screen. | `web/src/features/room/modes/glim-garden-map.tsx` | Spec (3D off) in Chromium, Firefox and WebKit; screenshots looked at |
| Everything works by keyboard and screen reader: buttons named as sentences ("Plant a Bush: 4 drops, 3 fireflies.", "Give Ana a drop: Growing bush: needs it most."), the picture's label says your plot, each neighbour's plot and the garden's progress, and a live region says each gift, bloom, droop, glow and what your own drop did. | `glim-garden.tsx` (`Action`), `glim-garden-words.ts` | Spec plants and waters by keyboard and checks the label and announcer; `web/src/features/room/modes/glim-garden-words.test.ts` (5 tests); axe (WCAG 2.2 A/AA) clean on player and host screens |
| Calm music track, existing sounds; screens and scenes lazy-loaded. | `music.ts`, `modes/registry.ts` | `music.test.ts` passes; `npx tsx scripts/check-public-bundle.ts` passes |
| Developers can preview the scenes: `/dev/three.html?scene=garden` and `?scene=garden-host` (`&players`, `&teams=1`, `&day=1`, `&names=long`, `&still=1`). | `web/dev/three.tsx` | Used for the scene screenshots |

## Measured play

`packages/engine/test/glim-garden-sim.ts` plays whole 6-minute games with seeded classes of bot gardeners
(4 seeds each; `npx tsx packages/engine/test/glim-garden-sim.run.ts goal|strat|mixed|big`). Young pupils:
right 6 times in 10, 12 to 26 seconds a question. Older: 8 in 10, 5 to 13 seconds. "Full" is games where the
garden filled; "at" is the average time it filled. 4 is meant for the youngest, 8 is a challenge for older classes.

| Class (sensible play) | 4 fireflies a plot | 6 (usual) | 8 |
|---|---|---|---|
| Young, 1 | 3 of 4 full, at 334 s | 3 of 4, at 334 s | not measured |
| Young, 5 | 4 of 4, at 248 s | 3 of 4, at 264 s | not measured |
| Young, 30 | 4 of 4, at 282 s | 3 of 4, at 346 s (24.3 plots glowing on average, 24 needed) | 0 of 4 (14.3 plots) |
| Young, 60 | 4 of 4, at 276 s | 4 of 4, at 326 s | not measured |
| Older, 1 | 4 of 4, at 153 s | 4 of 4, at 153 s | not measured |
| Older, 5 | 4 of 4, at 105 s | 4 of 4, at 122 s | 3 of 4, at 205 s |
| Older, 30 | 4 of 4, at 109 s | 4 of 4, at 138 s | 2 of 4, at 200 s |
| Older, 60 | 4 of 4, at 106 s | 4 of 4, at 128 s | 1 of 4, at 359 s |

How the class plays (30 players, 6 fireflies a plot, plots glowing at the end of 24 needed):

| Way of playing | Young | Older |
|---|---|---|
| Sensible (plant, water, give about 4 drops in 10) | 24.3, full 3 of 4 | 28.5, full 4 of 4 at 138 s |
| Never give (bushes only) | 12.5, full 0 of 4 | 30, full 4 of 4 at 151 s |
| Only give when anyone can be given to | 21.0, full 0 of 4 | 25.3, full 3 of 4 |
| Flowers only / trees only, no gifts | 0 / 4.8 | 30 at 261 s / 30 at 205 s |

- Giving is worth doing: a young class that never gives fills about half as many plots; but it is not the
  only thing: a class that only gives fills fewer plots than one that also tends its own.
- Half the class playing one way and half sensibly (older, 30): points of the half that never gives 39.5
  against 37.1 for the sensible half (giving no longer loses you points, as it did before gifts scored 2
  for the giver); half planting lantern trees fills the garden in 4 of 4 games at 278 s, half planting bushes
  in 1 of 4: the tree's light is worth most to its neighbours.
- Each plant: flowers bloom with 3 drops (the only plant that does), a bush gives 0.6 fireflies a drop alone
  (a tree 0.57, a flower 0.33), and a tree among growing neighbours brings the class the most.
- Not measured: Night Bloom and Team Gardens were played by bots in the conformance runs but not timed
  against the goal.

Checks run at the end: see the final report.
