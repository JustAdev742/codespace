---
name: design-pipeline
description: Router and sequencer for the seven design skills that contradict each other if loaded together - ui-ux-pro-max, bencium-innovative-ux-designer, bencium-controlled-ux-designer, ui-styling, apple-design, animation-vocabulary and improve. Picks one of three tracks (invent a new visual language, build against an existing system, or audit what exists), then loads only the skills whose rules are compatible with that track, in the right order. Use when a design task would otherwise need several of these skills at once, when it is unclear which design skill applies, or to run a whole design pass - research, direction, build, motion, audit - as one pipeline instead of separate slash commands.
license: MIT
metadata:
  author: codespace
  version: "1.0.0"
---

# Design Pipeline

One entry point for seven design skills. This skill routes and sequences; it
contains no design guidance of its own. Every rule you follow comes from the
skill the track tells you to load.

**Load skills one at a time, in the order given.** Do not pre-load a track's
skills together — several of them claim exclusive authority and will contradict
each other (see [Exclusivity](#exclusivity)).

## Step 0 — pick the track

| Signal | Track |
|---|---|
| New product or identity, originality matters, no design system yet | **A — Invent** |
| Design system, brand, or component library already exists; building or fixing UI | **B — Build** |
| Code already exists, want a prioritized roadmap rather than changes now | **C — Audit** |

Ambiguous? Ask one question — "Are we inventing a visual language, building
against one that exists, or auditing what is already there?" — and then commit.
Do not run two tracks at once. Track A ends by handing its locked direction to
Track B.

## Track A — Invent

`bencium-innovative-ux-designer` governs, **alone**, until a direction is locked.

1. Load `bencium-innovative-ux-designer`. Follow it exactly.
2. Round 1 produces ten typography-only HTML directions, A through J. The human
   opens them and judges. You do not render, screenshot, or evaluate them.
3. Stop until the human explicitly locks one. Praise is not a lock.
4. After the lock, its Round 2 builds the production system.
5. Then continue into **Track B step 2** to implement, carrying the locked
   concept capsule as the governing context.

During Round 1 load nothing else. `ui-ux-pro-max`, `ui-styling`, `apple-design`
and `animation-vocabulary` are all disallowed inputs at that stage — see below.

## Track B — Build

1. **Ground it.** Load `ui-ux-pro-max`. Run its search for the product domain:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<domain + qualities>" --design-system -p "<Project>"
   ```
   Take from it: style, palette, type pairing, UX guidelines, stack notes.
   *Skip this step if arriving from Track A* — the locked direction already
   decides these, and regenerating them would overwrite it.
2. **Decide.** Load `bencium-controlled-ux-designer` for accessibility floors,
   contrast, spacing and its decision checklist. It requires you to present
   options and wait for approval before choosing. Honor that on anything
   visually consequential; do not stall on obvious mechanical work.
3. **Build.** Load `ui-styling` for shadcn/ui plus Tailwind implementation.
4. **Make it feel right.** Load `apple-design` for motion: springs over
   durations, interruptibility, velocity handoff, direct manipulation. Load
   `animation-vocabulary` only when you need the precise name for an effect you
   are about to build or describe.
5. **Verify.** Run `/design-review` (browser, WCAG 2.1 AA) or
   `accessibility-scan` on the running page. Fix blockers before reporting done.

## Track C — Audit

Load `improve`, alone. It is strictly read-only: it writes plans under `plans/`
and never edits source. If the user wants the work done rather than planned,
finish the audit, then start Track B as a separate pass — do not let a build
skill and `improve` be active at once.

For motion-specific audits use `improve-animations`; for visual-polish audits
use `design-audit`.

## Exclusivity

Real contradictions in these skills' own rules. Violating one means ignoring an
instruction the skill states as non-negotiable.

| Never load together | Why |
|---|---|
| `bencium-innovative-ux-designer` (Round 1) + `ui-ux-pro-max` | Its Law 1 forbids design systems, tokens, UI kits, icon libraries and Google Fonts as creative input. `ui-ux-pro-max` is exactly that: a searchable bank of styles, palettes, font pairings and icons. |
| `bencium-innovative-ux-designer` (Round 1) + `ui-styling` | Law 6 limits Round 1 to type, color and whitespace; Law 12 forbids SVG outright, which rules out shadcn's icon set. |
| `bencium-innovative-ux-designer` (Round 1) + `apple-design` / `animation-vocabulary` | Law 6 bars motion from Round 1. |
| `bencium-innovative-ux-designer` (Round 1) + `design-review` or any browser tool | Law 14 reserves first visual judgement for the human. |
| `bencium-innovative-ux-designer` + `bencium-controlled-ux-designer` | Law 11 says default to zero preliminary questions; the controlled skill says ALWAYS ASK before any design decision. Opposite defaults — pick the track, get one. |
| `improve` + any build skill | Its Hard Rule 1 forbids editing source, and Rule 5 tells you to decline direct implementation requests. Loaded mid-build it blocks the build. |

`ui-ux-pro-max` is allowed *after* a Track A lock, but only to check work against
guidelines — never to generate the direction. That is the skill's own Law 8:
tokens record a committed language, they do not create it.

## Handoffs

Each phase hands the next a small, explicit artifact. Keep them in the
conversation so nothing is re-derived:

- Track A → B: the locked direction's concept capsule and its type/color decisions.
- Step 1 → 2: the design system (style, palette, type, spacing).
- Step 2 → 3: approved component decisions plus accessibility constraints.
- Step 3 → 4: the built components that need motion, and what each should signal.
- Any track → C: the paths that changed, so the audit has a scope.

## Notes

These seven also exist as plugins (`emil-skills:apple-design`,
`ui-ux-pro-max:ui-styling`, `motion-dev:improve`, and so on). This repo vendors
the same skills under bare names, which is what the steps above load. If both
are installed you have two copies of each; prefer one source.
