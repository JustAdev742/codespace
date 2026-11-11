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
| Lessons: several games and teaching steps in one room | [lessons.md](lessons.md) | 16 |
| Loose ends the pieces above left (co-teachers, class groups, challenge a friend and more) | [finish.md](finish.md) | 19 |
| **Total** | | **206** |

## New 3D game modes

| Mode | File | What it is |
|---|---|---|
| Summit Scramble | [summit.md](summit.md) | Everyone climbs the same mountain; right answers are how you climb. |
| Spot Kick | [spotkick.md](spotkick.md) | A penalty shoot-out under floodlights. |
| Lantern Rally | [rally.md](rally.md) | A night rally round a lantern-lit circuit, with auto-steer for anyone who wants it. |
| Tower Together | [tower.md](tower.md) | The whole class builds one tower before dawn and wins or loses together. |
| Glim Garden | [garden.md](garden.md) | The calm one: a class grows a night garden, and nobody loses anything. |

That makes 30 modes with 130 variants, 10 of the modes with a 3D screen (and a drawn 2D screen for
devices with 3D off). Each new mode has three variants that change the rules. See
[../MODES_3D.md](../MODES_3D.md).

## How it looks

| Area | File | Rows |
|---|---|---|
| An illustrated cover for every one of the 30 modes, and where covers show | [art.md](art.md) | 39 (30 covers, 9 other) |
| The live game screens: backdrops, lobby, question, reveal, leaderboard, podium | [stage.md](stage.md) | 18 |
| App pages | [pages-polish.md](pages-polish.md) | 6 |
| The live game, first pass | [live-polish.md](live-polish.md) | 3 |
| **Total** | | **66** |

## Bugs fixed

| Area | File | Bugs fixed |
|---|---|---|
| App pages | [pages-polish.md](pages-polish.md) | 20 |
| The live game | [live-polish.md](live-polish.md) | 21 |
| Found while building features | [sets.md](sets.md), [hosting.md](hosting.md), [reports.md](reports.md), [finish.md](finish.md) | 7 |
| **Total** | | **48** |

Not in these counts: what was found and fixed while merging each piece (for example the second
screen that could be used to watch a class-only game, and a request refused on every guest's
device at the end of every game). Those are described in the commit that merged each piece.

## Left out on purpose or not done

- A how-to-play card before the first question (the mode's page still has its rules).
- Big-screen question text steps between three sizes rather than fitting its box.
- The modes' own screens were not restyled in the visual pass.
- Room options apply to a whole lesson, not to each step.
- Each file lists the rest under "Not done".

## What has not been checked

Nothing here has been tried on a real Chromebook, iPad or phone in a classroom, and no person has
used it with a screen reader: the checks are automated (unit tests, browser tests in Chromium,
Firefox and WebKit, and automated accessibility checks). Each file says what else was not checked.
