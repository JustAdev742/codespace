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
| A climb on the standings was an arrow. | It lands with a few stars. | `game/Leaderboard.tsx` | Not seen: nobody climbed in the game that was filmed. |
| One phase cut to the next: the new screen faded in over 200 ms and the old one was simply gone. | Where effects are up, a scene change: the screen being left lifts away towards the viewer while the next arrives from behind it (260 and 440 ms on a big screen, 180 and 260 ms on a phone). What leaves is a picture of the old screen that nothing can reach, so the new one is live from its first frame. A 3D game's screen, which cannot be copied, changes as before. | `game/PhaseFade.tsx`, `stage.css` (`.scene-leaving`) | Filmed in slow motion on the board and a phone: the reveal to the standings and the standings to the next question. No copy was left on the page afterwards, and an answer tapped as the next question arrived was locked in. |
| The winner stood on the podium with their arms up. | They jump for joy three times as they land, then stand still for the teacher. | `Results.tsx` (`Podium`), `stage.css` (`glim-cheer`) | Measured in the page every 60 ms from the landing: the top of the winner's Glim rose 30 px twice in the samples taken, then held still. |
| A new level was a plate that popped. | It turns over in a ring of stars. A level is earned, never drawn by chance. | `Rewards.tsx` | Two signed-in students played two games in a row on High: frames of level 1 becoming level 2. |

## Kept as they were, on purpose

- **Glims hold still, and nothing drifts.** DESIGN.md's rule (one orchestrated moment per screen;
  no idle bobbing or drifting) was kept on purpose: a board is for reading, and a class includes
  children whom constant movement distracts. So there is no breathing crowd, no drifting haze
  and no shader behind the question. What was added are moments: they start, play and stop.

- **Reduced motion and calm rooms.** No effects at all, as before, and the effects file is not
  fetched. Checked on High with reduced motion: no canvas through a whole game.
- **Opening a Lantern, and the Night Market's lantern.** Always the plain burst (`plain`): what
  they hold is chance.
- **The plain game.** A device on the plain level runs the same code as before this work.

## Cost

The effects file is 8.2 KB (3.5 KB compressed), fetched 1.5 s after a room opens and only where it
will be used. Nothing else was added to the page's first load beyond the choice itself. No
dependency was added.

## Not checked

- Any real device. The levels were decided from what a device reports, and the frame-time check
  from its unit tests: neither was watched working on a slow phone or an old Chromebook, and no
  real frame rate was measured (headless Chromium draws in software).
- Safari and Firefox.
- The standings' stars, and a burst in each of the shop's twelve styles: only the festival
  default, the tick's sparkle, the arrival's and the level's stars were looked at.
- A scene change at full speed, by eye, and on any screen other than Classic's.
- **The sound.** Nothing was changed, because nothing can be listened to here: the engine already
  ducks music under its big effects and crosses between tracks, and a change that cannot be heard
  cannot be judged.
