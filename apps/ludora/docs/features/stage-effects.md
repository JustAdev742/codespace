# Production value: effects that scale with the device

Workstream `stage-effects`, 25 November 2026 (decision D62). The owner relaxed the performance
limit: aim at laptops, phones and boards from roughly the last four years, keep an older device
working and let it look plainer. This file lists what that bought, with how each was checked.

What separated the game from a top studio's after the first pass (game-feel.md), as ranked:

1. Celebrations were thin: a win was two dozen CSS pieces from one point.
2. The graphics choice existed only inside a 3D game's corner menu.
3. The stage is a still picture between its moments.
4. Phases cut from one to the next.
5. The sound, which could not be judged here (nothing can be listened to).

## What changed

| What it was | What a person sees now | Where | How it was verified |
|---|---|---|---|
| Every device drew the same effects, sized for a 2017 Chromebook. | Three levels. Plain is the game exactly as it was. Full and rich draw celebrations on a canvas, rich with more pieces. Automatic picks from the device's processors, memory, graphics chip and data saver, and a frame-time check while effects play halves the pieces, then goes back to plain for the visit, on a device that cannot keep up. | `web/src/fx/decide.ts`, `governor.ts`, `index.ts` | `fx.test.ts`: 5 tests of the choice, 5 of the frame-time check. In headless Chromium (no graphics chip) Automatic chose plain: the effects file was never fetched and no canvas appeared through a whole game. |
| The graphics choice was a cog in the corner of a 3D game. | "Graphics and effects" on the Settings page, under This device: Automatic, High, Medium, Low, 3D off, and on Automatic it says what it has chosen here. | `features/settings/AccessSettings.tsx` | Driven in the browser at 390 and 1366 wide: the choice is kept and cleared, axe finds nothing, no sideways scroll. |
| A burst was 16 pieces that flew out and faded in 700 ms. | Where effects are up, the same burst in the same style and colours (a player's own answer and victory effects included) throws more pieces, which tumble, fall and settle. | `art/bursts.tsx`, `fx/particles.ts`, `fx/runtime.ts` | `fx.test.ts`: 12 tests of the pieces (the same seed throws the same celebration, how far a burst flies, a rising burst, every piece gone when its life is over, a full store drops what does not fit, each style has its pieces). Frames of a phone's reveal at 140 ms steps with the setting on High. |
| The winner's moment was a burst round the podium. | As the winner lands in a room's ceremony, paper falls on every screen: two cannons from the foot of a big screen and a shower across it, with pieces that grow with the screen; a lighter fall on a phone. | `fx/runtime.ts` (`shower`), `features/room/Results.tsx` | A game with a board at 1366x768 and three phones, on High: frames from 5.7 s to 9.8 s after the end on the board and the winner's phone. |
| The right answer's tick stamped in place. | On the big screen, stars fly from the tick as it lands. | `game/AnswerInput.tsx` | Frames of the board's reveal on High. |
| A player arriving in the lobby slid in. | On the big screen, a player who walks in while the class watches arrives in a puff of stars in their Glim's own colour. | `features/room/Lobby.tsx` | Frames of two arrivals on High. |
| The default backdrop's floodlights were two flat wedges that swept slowly. | Where effects are up they are light: two soft beams leaning in from above the stage with dust turning slowly in them, and a low haze on the floor, drawn by the graphics chip in the stage's own colours (a school's copy has its own). It shows where a backdrop shows, in the lobby and between questions, and never behind a question. It is drawn at half size, at most 30 times a second, and not at all while faded out or in a hidden tab. A browser with no WebGL, one that loses it, or a device whose frames turn slow gets the flat beams back. | `fx/stageLight.ts`, `game/Backdrop.tsx` (`StageLight`) | Filmed in the lobby and on the standings on High; off during a question (the backdrop's opacity read as 0). Its brightest pixel over a second of frames was read from the canvas: 33, 39, 54 of 255, against the flat beams' 35, 40, 56; over the brightest stage colour that leaves white text at 10.4:1 and the dimmest stage text at 5.1:1. `fx.test.ts`: 2 tests (the colour helper, and the gain that holds it to the flat beams' brightness). With reduced motion and on Automatic in headless Chromium: no canvas, the flat beams stay. |
| "You are in" appeared on a player's phone with their Glim. | Their Glim arrives in a ring of stars in its own colours, about a quarter of a second after the lobby shows. It is the first moment on the page, before anything has been fetched, so it waits up to 2.5 s for the effects to arrive and is skipped if they are later than that. | `features/room/Lobby.tsx`, `fx/index.ts` (`fxWhenReady`) | Frames of a guest joining on High: the canvas was up 394 ms after "You are in" and gone afterwards. |
| A climb on the standings was an arrow. | It lands with a few stars. | `game/Leaderboard.tsx` | Not seen: nobody climbed in the game that was filmed. |
| One phase cut to the next: the new screen faded in over 200 ms and the old one was simply gone. | Where effects are up, a scene change: the screen being left lifts away towards the viewer while the next arrives from behind it (260 and 440 ms on a big screen, 180 and 260 ms on a phone). What leaves is a picture of the old screen that nothing can reach, so the new one is live from its first frame. A 3D game's screen, which cannot be copied, changes as before. | `game/PhaseFade.tsx`, `stage.css` (`.scene-leaving`) | Filmed in slow motion on the board and a phone: the reveal to the standings and the standings to the next question. No copy was left on the page afterwards, and an answer tapped as the next question arrived was locked in. |
| The winner stood on the podium with their arms up. | They jump for joy three times as they land, then stand still for the teacher. | `Results.tsx` (`Podium`), `stage.css` (`glim-cheer`) | Measured in the page every 60 ms from the landing: the top of the winner's Glim rose 30 px twice in the samples taken, then held still. |
| A new level was a plate that popped. | It turns over in a ring of stars. A level is earned, never drawn by chance. | `Rewards.tsx` | Two signed-in students played two games in a row on High: frames of level 1 becoming level 2. |

## A bug found on the way

A burst chose its form (canvas, plain or nothing) each time it was drawn. If the effects arrived
while a burst was already on the page, its next render threw it again in the other form: seen as a
player's arrival stars going off seconds late, over the next screen. A burst now decides once, as
it appears (`art/bursts.tsx`). Found by playing seven other modes with effects on and looking at
the screenshots; checked the same way afterwards.

## Kept as they were, on purpose

- **Glims hold still, and nothing moves behind a question.** DESIGN.md's rule (one orchestrated
  moment per screen; no idle bobbing or drifting) was kept on purpose: a board is for reading,
  and a class includes children whom constant movement distracts. So there is no breathing
  crowd and nothing drawn behind a question. What was added are moments (they start, play and
  stop) and one slow layer in the backdrop, which already had one and already gives way to the
  question.

- **Reduced motion and calm rooms.** No effects at all, as before, and the effects file is not
  fetched. Checked on High with reduced motion: no canvas through a whole game.
- **Opening a Lantern, and the Night Market's lantern.** Always the plain burst (`plain`): what
  they hold is chance.
- **The plain game.** A device on the plain level runs the same code as before this work.

## Kept covered

`e2e/effects.spec.ts` (2 browser tests) is the one place the canvas is drawn in the test suite:
the other tests run on Automatic, which picks the plain game in a headless browser. With the
setting on High it plays a game to the end and requires the canvas on the board and a phone as
the winner lands, hidden from screen readers and letting clicks through, gone when the paper has
fallen, no copy of an old screen left behind, the results usable and no console errors; with
less motion it requires that nothing is drawn; and it drives the setting on the Settings page.

## Cost

The effects file is 8.2 KB (3.5 KB compressed), fetched 1.5 s after a room opens and only where it
will be used. The stage light is a second file of its own (4 KB, 2 KB compressed), fetched only by a board
showing the Floodlights backdrop with effects up. Nothing else was added to the page's first load beyond the choice itself. No
dependency was added, and no third-party art, sound or font: everything here is code written for
Ludora, so there is nothing new to credit.

## Not checked

- Any real device. The levels were decided from what a device reports, and the frame-time check
  from its unit tests: neither was watched working on a slow phone or an old Chromebook, and no
  real frame rate was measured (headless Chromium draws in software).
- Safari and Firefox.
- The standings' stars, and a burst in each of the shop's twelve styles: only the festival
  default, the tick's sparkle, the arrival's and the level's stars were looked at.
- The stage light moving. Stills were looked at and its brightness measured; how the dust drifts
  was not seen, and it was not run on a real graphics chip (headless Chromium draws it in
  software). The other six backdrops are unchanged.
- A scene change at full speed, by eye. Besides Classic, Quick Draw, Lantern Out, Confidence,
  Glim Duels, Comet Dash, Tug of War and Spot Kick (3D) were played with effects on, watching for
  console errors and anything left on the page: none. Their scene changes were not filmed.
- **The sound.** Nothing was changed, because nothing can be listened to here: the engine already
  ducks music under its big effects and crosses between tracks, and a change that cannot be heard
  cannot be judged.
