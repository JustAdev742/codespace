# What was added in the November 2026 improvement programme

Each file here belongs to one piece of work. Every row in a file is something a person can now see
or do, with where it lives in the code and the exact test or check that verified it. Only finished,
verified rows are counted. Things that already existed, were replaced or were not done are listed
in each file under their own headings and are not counted.

Counts are of the main branch as it stands (last updated 11 November 2026).

## Features

| Area | File | Features |
|---|---|---|
| Class tools for teachers | [classes.md](classes.md) | 22 |
| The student's side | [students.md](students.md) | 23 |
| Question sets, the editor and three new question types | [sets.md](sets.md) | 27 |
| Hosting a live game | [hosting.md](hosting.md) | 33 |
| A school's own copy: houses, cups, tournaments, assembly | [school.md](school.md) | 21 |
| Accessibility, comfort and devices | [access.md](access.md) | 25 |
| Reports that tell a teacher what to teach next | [reports.md](reports.md) | 20 |
| **Total** | | **171** |

## New 3D game modes

| Mode | File | What it is |
|---|---|---|
| Summit Scramble | [summit.md](summit.md) | Everyone climbs the same mountain; right answers are how you climb. |
| Spot Kick | [spotkick.md](spotkick.md) | A penalty shoot-out under floodlights. |
| Lantern Rally | [rally.md](rally.md) | A night rally round a lantern-lit circuit, with auto-steer for anyone who wants it. |
| Tower Together | [tower.md](tower.md) | The whole class builds one tower before dawn and wins or loses together. |
| Glim Garden | [garden.md](garden.md) | The calm one: a class grows a night garden, and nobody loses anything. |

That makes 30 modes, 10 of them with a 3D screen (and a drawn 2D screen for devices with 3D off).
Each new mode has three variants that change the rules. See [../MODES_3D.md](../MODES_3D.md).

## Bugs fixed and visual improvements

| Area | File | Bugs fixed | Visual improvements |
|---|---|---|---|
| App pages | [pages-polish.md](pages-polish.md) | 20 | 6 |
| The live game | [live-polish.md](live-polish.md) | 21 | 3 |
| Found while building features | [sets.md](sets.md), [hosting.md](hosting.md), [reports.md](reports.md) | 4 | |
| **Total** | | **45** | **9** |

Not in these counts: what was found and fixed while merging each piece (for example the second
screen that could be used to watch a class-only game, and a request refused on every guest's
device at the end of every game). Those are described in the commit that merged each piece.

## Still to come in this programme

Not merged yet, so not counted above: lessons (several games and teaching steps in one room),
illustrated covers for every mode, and a visual lift of the live game screens.

## What has not been checked

Nothing here has been tried on a real Chromebook, iPad or phone in a classroom, and no person has
used it with a screen reader: the checks are automated (unit tests, browser tests in Chromium,
Firefox and WebKit, and automated accessibility checks). Each file says what else was not checked.
