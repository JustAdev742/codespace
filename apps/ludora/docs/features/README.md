# What was added in the November 2026 improvement programme

Each file here belongs to one piece of work. Every row in a file is something a person can now see
or do, with where it lives in the code and the exact test or check that verified it. Only finished,
verified rows are counted. Things that already existed, were replaced or were not done are listed
in each file under their own headings and are not counted.

Counts are of the main branch as it stands (last updated 12 November 2026). The making programme
that followed is counted in its own section below.

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
| Loose ends the pieces above left (co-teachers, class groups, challenge a friend, how to play and more) | [finish.md](finish.md) | 20 |
| **Total** | | **207** |

## The making programme (12 November 2026)

Making things (sets, lessons, games, Glims, game modes) easier, richer and less limited.

| Area | File | Features |
|---|---|---|
| Practice bots that play like people | [bots.md](bots.md) | 9 |
| AI helpers in the making tools, on any free provider, with an allowance per account | [ai.md](ai.md) | 18 |
| Sets with sound, a feel of their own, and games that adapt to the set | [sets2.md](sets2.md) | 23 |
| Game Maker (first built as Mode Studio): people make their own game modes, in 2D and 3D | [modestudio.md](modestudio.md) | 12 |
| Game Maker: a game written in simple code, with the maker's own numbers and rules | [gamecode.md](gamecode.md) | 11 |
| Solo play: a "Your settings" stage | [solo.md](solo.md) | 5 |
| A richer Studio, a painter, and "My designs" for every account | [studio2.md](studio2.md) | 15 |
| One place to make things, notes to a game with no AI, classroom tools, the teacher's day | [making.md](making.md) | 28 |
| **Total** | | **121** |

With the 207 above, that is 328 features. What each piece left undone is under "Not done" in its
file. The main ones: no AI helper has ever been run against a live AI service (they are tested
against a stand-in); a made game has a 3D scene only for races and climbs; capes, held items,
trails and name plates cannot be designed yet; the host page and the lesson dialog still use
their own set pickers.

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

- Big-screen question text steps between three sizes rather than fitting its box.
- The modes' own screens were not restyled in the visual pass.
- Room options apply to a whole lesson, not to each step.
- Each file lists the rest under "Not done".

## What has not been checked

Nothing here has been tried on a real Chromebook, iPad or phone in a classroom, and no person has
used it with a screen reader: the checks are automated (unit tests, browser tests in Chromium,
Firefox and WebKit, and automated accessibility checks). Each file says what else was not checked.
