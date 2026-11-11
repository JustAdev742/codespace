# Art: mode covers and illustration

Workstream `art`. No migration, no new dependency.

Every mode now has an original illustrated cover: a 160 x 100 night scene drawn in code (SVG React), in the Glims' style
(crisp dark contour, flat fill, hard cel shading), with depth (backdrop: night sky warming to the mode's colour, hills,
rooftops or a crowd; one subject that says what you do; a dark foreground), the mode's own colours and real catalogue
Glims. No text in any cover. Shared pieces live in `web/src/art/covers/kit.tsx` (sky, floodlight beams, glows, ridges,
rooftops, crowd silhouettes, lantern strings, `Cel` shading for any shape, Glim placement); each cover is one small
module in `web/src/art/covers/modes/<mode id>.tsx`, loaded on demand by `ModeArt` (`web/src/art/ModeArt.tsx`).

Each cover was checked rendered at card size (200 px wide) on a dark and a light card, as the narrow strip used on phones and
on Host (80 x 90 crop), and large (800 px); then all 30 side by side on one contact sheet, and the weakest five redrawn
(marked below). Verified in the app: `e2e/covers.spec.ts` (screenshots of Game modes, Host and a mode page at 1366x768 and
390x844, day and night, and the Hills Grammar look).

Weight: covers are not in the entry bundle. Entry (script, preloads, CSS) before 934,084 B raw / 274,787 B gzip, after
939,080 B / 276,187 B (+1.4 KB gzip, from the empty-state art and loading mark, which every page can show). The cover code
(`ModeArt` chunk with the kit) is 8.8 KB gzip; each cover adds 1 to 3 KB raw, about 54 KB raw for all 30.

| # | What a person now sees | Where | How verified |
|---|---|---|---|
| 1 | Classic cover: Four answer tiles light up over the stage (the right one lit), a Glim leaps, the crowd cheers. | `web/src/art/covers/modes/classic.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 2 | Comet Dash cover: Two Glims ride comets up a dotted trail to the finishing gate, one slipstreaming. | `web/src/art/covers/modes/comet-dash.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 3 | Quick Draw cover: A Glim slams a gold buzzer in a burst of light; its rival reaches too late. | `web/src/art/covers/modes/quick-draw.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 4 | Lantern Out cover: A row of lanterns in the wind, one blown out and smoking, a Glim guarding the rest. | `web/src/art/covers/modes/lantern-out.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 5 | Confidence cover: A three-step gauge swung to certain, a Glim backing itself. | `web/src/art/covers/modes/confidence.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 6 | Glimgo cover: A tilted bingo card with squares marked, the called ball glowing, a Glim with the next mark. | `web/src/art/covers/modes/glimgo.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 7 | Lantern Match cover: Face-down cards, two turned over and glowing as a pair. | `web/src/art/covers/modes/lantern-match.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 8 | Word Scramble cover: Tiles tumbling into the answer slot, three already snapped in (no letters: covers carry no text). | `web/src/art/covers/modes/word-scramble.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 9 | Time Attack cover: A giant stopwatch with most of its time gone, a Glim sprinting past. | `web/src/art/covers/modes/time-attack.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 10 | Survival Run cover: Two hearts and a cracked one over a Glim running a road into the night. | `web/src/art/covers/modes/survival-run.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 11 | Flashcard Study cover: A card mid-turn (question side, ticked side) over boxes of filed cards. | `web/src/art/covers/modes/flashcard-study.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 12 | Sky Lanterns cover: Paper lanterns riding the wind over the town, a Glim sending up one more. | `web/src/art/covers/modes/sky-lanterns.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 13 | Gloom Giant cover: The giant looms over the hills while three Glims strike it with light. | `web/src/art/covers/modes/gloom-giant.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 14 | Tug of War cover: Two Glims heave on one rope over a lit centre line, crowds both sides, lanterns overhead. | `web/src/art/covers/modes/tug-of-war.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 15 | Night Market cover: A striped stall with three mystery lanterns, coins spilling from the opened one. | `web/src/art/covers/modes/night-market.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 16 | Lantern Guard cover: A light tower blasts gloomlings creeping up the road to the Great Lantern (redrawn). | `web/src/art/covers/modes/lantern-guard.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 17 | Glim Duels cover: Two Glims face off on lit pads under health bars, their hits meeting in a burst. | `web/src/art/covers/modes/glim-duels.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 18 | Lantern Trail cover: Board spaces wind through town to the Golden Lantern stall, a die mid-roll. | `web/src/art/covers/modes/lantern-trail.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 19 | Lantern Lands cover: A hex map in two teams' colours with a fort and shrine, a Glim planting a flag. | `web/src/art/covers/modes/lantern-lands.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 20 | Festival Workshop cover: A Glim behind the belt as lanterns roll out, kites on the racks, a firework overhead (redrawn). | `web/src/art/covers/modes/festival-workshop.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 21 | Gold Rush cover: A cut-away mine: shaft and winch down to a lit cavern where a Glim strikes a huge nugget (redrawn). | `web/src/art/covers/modes/gold-rush.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 22 | Glow Tag Royale cover: A night park, one Glim tagging another with its beam inside the closing ring. | `web/src/art/covers/modes/glow-tag.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 23 | Big Catch cover: A Glim on the jetty, line tight, a big fish leaping from the moonlit river. | `web/src/art/covers/modes/big-catch.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 24 | Corner Shop cover: A lit shop front with full shelves, a customer and a delivery crate. | `web/src/art/covers/modes/corner-shop.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 25 | Code Breakers cover: A padlock behind a firewall shield, data packets streaming, a Glim with the key. | `web/src/art/covers/modes/code-breakers.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 26 | Summit Scramble cover: A Glim halfway up a night cliff on its rope, lantern swinging, the summit flag above (redrawn). | `web/src/art/covers/modes/summit-scramble.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 27 | Spot Kick cover: The ball bending into the top corner past a diving keeper under floodlights. | `web/src/art/covers/modes/spot-kick.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 28 | Lantern Rally cover: A Glim boosts its kart round a lantern-lit circuit, a rival behind. | `web/src/art/covers/modes/lantern-rally.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 29 | Tower Together cover: Timber and stone stacked high in the wind with a lantern brace, Glims adding the next piece (redrawn). | `web/src/art/covers/modes/tower-together.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 30 | Glim Garden cover: A Glim waters glowing blooms in a night garden while fireflies gather. | `web/src/art/covers/modes/glim-garden.tsx` | Looked at at 200 px (dark and light card), 80x90 strip and 800 px; on the contact sheet; `covers.test.ts` draws it |
| 31 | Covers on Game modes, a mode's page (large, named "<mode> artwork"), Host a game (modes and, new, each variant), the home "Pick a game" list, open games, class assignments and their dialog. While a cover's few kilobytes load, its sky and hills hold the place. | `ModeArt.tsx`, `covers/index.ts`, callers in `features/modes`, `features/host`, `features/home/StudentHome.tsx`, `features/classes` | `e2e/covers.spec.ts` (Chromium, Firefox, WebKit, and the school look): 30 covers drawn on Game modes, none left loading, axe WCAG 2.2 A/AA clean, no sideways scroll, on /modes, /host, /modes/classic |
| 32 | Variants show their parent's cover with a small mark of what they change (a glyph on a disc in the variant's colour: a stopwatch for Lightning Round, a heart for Sudden Death). | `covers/marks.ts`, `ModeArt.tsx` | `covers.test.ts`: every one of the 130 variants resolves to its parent's cover and a known glyph unlike its parent's |
| 33 | Game Maker cards show the cover of the game's mode, with the glyph and colour its maker chose as the mark. | `features/games/Games.tsx` | Looked at in the app (screenshot); typecheck |
| 34 | Recent games on the home dashboard show the mode's cover beside each game. | `features/home/Dashboard.tsx` | Typecheck; `e2e/layout.spec.ts` passes |
| 35 | Covers lift a little when their card is pointed at or focused; still with reduced motion and in calm mode. | `covers/cover.css` | `e2e/covers.spec.ts` reduced-motion test (hover leaves no transform) |
| 36 | A cover beside a mode's name is hidden from screen readers; a cover standing alone (a mode's page, a game card) is named. | `ModeArt.tsx` | `covers.test.ts`; axe in `covers.spec.ts` |
| 37 | Empty states show a small night scene: a Glim on a hill looking up at the page's icon on the gold slanted plate (the same Glim each time for the same message). | `web/src/art/EmptyArt.tsx`, `ui/primitives.tsx` (EmptyState) | Looked at in the app (Friends, Game Maker, both themes); `e2e/layout.spec.ts` and `e2e/pages.spec.ts` pass (axe included) |
| 38 | The not-found page has a Glim with its lantern up, out looking for the page, beside the 404. | `features/errors/NotFound.tsx` | Looked at in the app (screenshot) |
| 39 | Loading: Ludora's mark with a sweep of light across its plate and three dots taking turns, instead of a spinner; still under reduced motion. | `web/src/art/LoadingMark.tsx`, `app/routes.tsx` | Typecheck; shown while the app loads |

Not done: achievement and quest badges, the results podium and the "Get ready" moment were not changed; the lobby header
(stage agent's) does not show the cover yet: `ModeArt` with `mode` (and `variant`) is ready to drop in. The route error page
(`app/routes.tsx` RouteError) keeps the logo only.
