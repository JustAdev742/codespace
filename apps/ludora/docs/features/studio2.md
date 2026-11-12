# Studio 2: a studio without the low ceiling, and for everyone

Workstream `studio2`. Migration `0022_designs` (journal idx 22: tables `designs` and `worn_designs`).
No new dependency. No change to prices, odds, rewards or what the shop sells.

How it was looked at: a development page, `web/dev/designs.html` (Vite only, not in the build), draws
check sheets of seeded random designs: 60 in 2D at lobby size (46 px) and at 120 and 200 px, in the day
and night themes and in the Hills Grammar look, and a 3D crowd of 40 and 60. Every sheet was looked at.
A throwaway driver (kept out of the repository) took the My designs page at 1366x768 and 390x844.

Tests:
- `packages/shared/test/designs.test.ts` (11): painter encoding round trip and refusal of bad data;
  mirror, fill and stamps; the richer schema accepts every older Glim and holds the shape sliders to
  their caps; random designs in every style are valid; names follow the display-name rules; slots by
  level; "copies a catalogue item"; design codes round trip and refuse broken or impossible codes.
- `server/test/designs.test.ts` (9): signed out refused, guests may design; caps, broken painter data,
  unknown parts and bad names refused (400); a copy (or a near copy) of a catalogue Glim or item refused
  (409) with how to make it your own; slots full at the level's count, and a higher level opens one
  (save, duplicate and code import all respect it); another account cannot change, delete, duplicate or
  wear my design (403); wearing puts it on the avatar others get (no rarity, its name, the item in its
  slot) and taking it off restores the buddy; design codes; reports (merged, never saying whether a
  design exists); staff with `content.moderate` hide and show with a reason, audited, and a hidden
  design comes off the avatar and cannot be worn; a player cannot hide (403).
- `server/test/designs-ai.test.ts` (3): the "describe a Glim" task.
- `web/src/features/designs/history.test.ts` (3): undo, redo, grouping a run of changes, the limit.
- `e2e/studio2.spec.ts` (6): a plain player paints a Glim (keyboard and pointer, mirror, fill, undo and
  redo), saves and wears it, and the host's lobby shows exactly the painted markings; the profile names
  the design and it can be reported; a design code moves a design to another account (a cut-short code
  is refused); a designer publishes an item from the Creator Studio as before; the editor with Try it on
  and Compare; "describe a Glim" (AI endpoints answered in the browser). Axe (WCAG 2.2 A and AA) at 390
  and 1366. Passes in Chromium, Firefox and WebKit; the 3D turntable test is Chromium only.
- `e2e/school-uniform.spec.ts` and `e2e/studio2.spec.ts` pass with `E2E_SCHOOL_THEME=hills-grammar`.

## Built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | Shape sliders: body width (85 to 118%), height (88 to 115%) and eye size (80 to 125%). The outline stretches; ears, toppers, arms, feet, face and anything worn move to the new shape without being distorted. | `art/glim/shape.ts`, `Glim.tsx`; schema `economy.ts` | shared caps test; check sheets 2D and 3D |
| 2 | More parts: 4 eyes (button, lash, sly, heart), 3 mouths (bean, zigzag, grit), 3 ears (round, antlers, tufts), 4 antennae and toppers (twin antennae, spring, dish, bobble), 3 tails (pom, zigzag, spiral), and feet as a choice of 7 (round, none to float, paws, boots, claws, flippers, tiptoes). Drawn in 2D; in 3D the feet change shape and colour and "none" floats. | `face.tsx`, `parts.ts`, `three/glim3d.ts` | check sheets; turntable e2e (flippers) |
| 3 | Three-colour schemes (an optional third colour), and a colour wash over the body (from the top, bottom or side, or a glow from inside). Lightness stays Ludora's, so every choice keeps its outline and face readable. | `Glim.tsx` (`glimColors`, `Wash`) | check sheets in both themes |
| 4 | The painter: a 12 by 12 grid in the design's five palette colours, with pen, fill, eraser, six stamps, mirror (off, left and right, four ways), clear, and undo per stroke. Keyboard: arrows, Home and End, Space or Enter, 1 to 5 and 0. Pointer drag, phone included. Stored as a short run-length string (at most 300 characters), drawn by Ludora as at most ten paths, and kept faint over the face so markings never hide it. | `features/designs/Painter.tsx`, `art/glim/paint.tsx`, `shared/designs.ts` | shared painter tests; e2e (keyboard, tap, fill, undo); axe at 390 |
| 5 | Emblems: the same painter puts a badge on a hat or neckwear design. | `art/glim/accessories.tsx` (`Emblem`) | server test (worn hat carries its emblem); e2e code test |
| 6 | Quick expressions (cheery, sure of itself, wide-eyed, fierce, sleepy, shy, robotic) and a choice of idle movement in 3D (calm, bob, sway, bounce, hover, wiggle); lobbies and game screens hold still, and so does everything under reduced motion. | `GlimControls.tsx`, `glim3d.ts` (`idleMove`) | check sheets; turntable e2e under reduced motion (picture holds still until the design changes) |
| 7 | My designs, for every account (guests too): design Glims and hats, glasses and neckwear for yourself. Free, personal, no rarity, not sold, traded or in the collection book. 3 slots, one more at levels 5, 10, 20 and 35, decided on the server. | `server/src/modules/designs/routes.ts`, `features/designs/DesignStudio.tsx`, nav "My designs" | server tests; e2e |
| 8 | Wear a design: a Glim design becomes your buddy and an item takes its slot, wherever your Glim shows (lobby, game screens, profile, 3D scenes), for everyone who sees you. Take it off to go back. | `profiles/avatar.ts` (`wornDesignsOf`) | server test; e2e (host's lobby shows the painted markings exactly) |
| 9 | Not a way round the shop: a design that copies a catalogue Glim or item (same parts, colours within 15 degrees, nothing of its own) is refused, saying how to make it your own; the editor says so before you save. | `shared/designs.ts` (`copiesCatalogue`), `/api/designs/check` | shared and server tests |
| 10 | Others see a worn design's name on your profile ("Wearing their own design, ..."), filtered like display names, with a Report button. Staff with `content.moderate` review reported, hidden and new designs (My designs, "Review designs"), and hide or show one with a reason; hiding takes it off, closes its reports and is audited. | `WornDesign.tsx`, `Profile.tsx` (one line), `/api/staff/designs` | server tests; e2e (report from the profile) |
| 11 | Working tools: undo and redo (buttons and Ctrl+Z, Ctrl+Shift+Z), duplicate, randomise within a style (anything, cute, spooky, robot, nature, sea), start from any Glim you own, compare two versions side by side and go back to one, a 3D turntable, and Try it on: the design drawn by the room's own components in a full lobby, a small lobby and a game screen. | `DesignStudio.tsx`, `history.ts`, `TryOn.tsx` | history tests; e2e (undo, redo, compare, try it on, turntable) |
| 12 | Design codes: a short string carrying the look (never the name), to copy to a friend or another account; importing checks it and runs it through the same rules as any design. | `shared/designs.ts` (`encodeDesign`, `decodeDesign`), `/api/designs/import` | shared, server and e2e tests |
| 13 | The Creator Studio's Glim Maker has the richer controls, the painter, and undo and redo; designers keep publishing and Lanterns as before. | `features/studio/Studio.tsx` | e2e "a designer still publishes an item"; `server/test/studio.test.ts` passes |
| 14 | "Describe a Glim": an AI helper in the editor turns a description into a design from the vocabulary, checked against the schema and caps, shown beside yours to accept. A registered task; no provider is called directly. | `server/src/modules/ai/tasks/glims.ts`, `DesignStudio.tsx` | `designs-ai.test.ts`; e2e with stubbed endpoints |
| 15 | For the Make page: `MyDesignsCard` (a card linking to My designs) is exported from `features/designs/WornDesign.tsx`, ready to drop in. Not placed: that page belongs to another workstream. | `WornDesign.tsx` | typecheck only |

## Measured

Sixty in a lobby (host's screen at 1366x768, 40 signed-in players arriving four a second, then 20 bots;
headless Chromium on this shared machine): before (catalogue buddies, the branch as it was) arriving
median 16.7 ms, 95th percentile 16.8 ms, settled 16.7 / 16.7 ms. After, everyone wearing a random
design: arriving 16.7 / 33.3 ms and 16.7 / 33.4 ms (two runs), settled 16.7 / 16.7 ms; the same build with
catalogue buddies in between gave 16.7 / 33.4 ms arriving, so the arriving difference is the machine's
load at the time, not the designs. A painted Glim adds at most ten paths and one gradient.

3D crowd of 40 (`designs.html?view=3d`, SwiftShader software rendering): medians between 67 and 133 ms
for the same scene from run to run, too noisy to separate small differences. Designs measured 17 to 33
ms slower than catalogue Glims in each alternating pair, and also against themselves with the new
fields taken off (`&strip=1`), so the random mix of parts (more wings and wide bodies) is the likely
cause. The new fields add no meshes or draw calls (feet are the same two meshes scaled; idle moves
change transforms only). Not measured on a real GPU.

## Not done

- More kinds of thing: capes and things worn on the back, things held, trails and auras in 3D, name
  plates and reactions as designs. Only Glims and the existing hat, glasses and neckwear slots (with
  emblems) are designable.
- The brief names `e2e/studio.spec.ts`: there is no such file in the tree; the Creator Studio publish
  flow is covered in `e2e/studio2.spec.ts` instead.
- Account download (the data export) does not yet include designs; deleting an account deletes them.
- The staff reports queue lists design reports with their raw id; the review lives under My designs.
