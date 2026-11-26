# Art direction: Lanternlight

Ludora is a place, and the place is lit. After dark it is an indigo night with lanterns in it;
by day it is warm paper under a window. Everything on a screen is an object in that light: it
has thickness, a lit top edge and a shadow under it, and the one thing that matters most on the
screen glows.

This replaces "game night, live" (DESIGN.md, D46): the flat navy panels, the cool white pages,
the slanted broadcast plates and the condensed italic headings. DESIGN.md's rules about what is
on a screen and when still hold; this file says what it looks like. Recorded as D63.

It should read as one studio's product: confident, warm, a little theatrical. It should not be
mistaken for the quiz tools a class already knows. No flat purple with white geometry, no blocky
cute, no pastel dashboard. Night, lantern light, lacquer and paper, and characters who live there.

## The light

One light, from above and a little in front, slightly warm. It gives every raised surface the
same three things, and they are the system:

1. **A lit top edge**: a hairline of light inside the top of a surface.
2. **A body that falls away**: a surface is a touch lighter at its top than at its foot.
3. **A shadow below**: soft, tinted by the time of day (indigo at night, umber by day), deeper
   the higher the thing floats.

Nothing is lit from the side or from below, and nothing has an outline drawn round it to make up
for a missing shadow.

## Two times of day

| | Night (dark theme, the stage, every game) | Morning (light theme, where teachers work) |
|---|---|---|
| Ground | indigo ink `#0c0a26`, with a breath of aurora (teal low on the left, violet low on the right) | warm paper `#f6f1e6` |
| Raised | lacquer `#171440` | card `#fffdf8` |
| Sunken | `#080619` | `#ebe4d3` |
| Lines | `#332d78`, strong `#5148a8` | `#e2d9c4`, strong `#b9ad90` |
| Words | `#f6f4ff`, `#cbc6f2`, `#9d97d0` | ink `#1b1638`, `#453f6b`, `#625c88` |
| Focus and links | lantern gold ring; links `#a9b8ff` | ink-blue `#3b2fd6` |

Night is indigo leaning to violet, never navy. Morning is paper, never the cool grey-white of an
office tool. Every pair of word and ground above passes 4.5:1.

The accents keep their names and their jobs: **lantern** gold `#ffc233` is light itself (the one
glowing action, a win, a reward), **glim** mint `#1fd38f` is right and go, **ember** coral
`#ff4d6a` is wrong and stop, **sky** `#3d9bff` and **dusk** `#8c6bff` are information and magic.
Aurora (teal `#22cfc3`, violet `#8c6bff`, rose `#ff5ca8`) is only ever a glow in the distance.

## Materials

- **Lacquer** (night surfaces): top-lit indigo, a hairline of light along the top, a fine edge,
  a deep soft shadow. Panels, cards, the sidebar, menus.
- **Paper** (morning surfaces, and any card laid on the stage): warm ivory, a bright top edge, an
  umber shadow. Never pure white.
- **Keys** (anything pressed): a solid colour with thickness. A gloss across its top half, a
  darker band along its foot, a shadow under it. Pressed, it sinks two pixels and the band thins.
  The primary key is lantern gold and has a halo.
- **Enamel** (answer tiles): the tile colours, glossy, thick, with the letter set into a raised
  boss. The colours are never the only cue: letter and shape stay.
- **Glass** (the HUD, bars over a scene): smoked indigo, blurred behind, a fine light edge.
- **Glow**: a soft halo in the thing's own colour. One per screen for the action that matters,
  and on whatever has just happened. Focus is a ring, never a glow, so it is always sharp.

## Shape

Softer and larger than before: corners of 8, 12 and 18 px (26 for a hero card), pills for chips
and tags. The **lantern tag** is the signature: an upright rounded label with a lit top and a
glow, for the few words at a big moment ("Question 3 of 6", "You are in", "The winner"). It
replaces the slanted plate everywhere.

## Type

- **Display: Bricolage Grotesque** (variable, OFL). A grotesque with a hand in it: ink traps,
  a slight swagger, numerals that read across a hall. Set bold or extra-bold, a little narrow
  (width 80%), tight, never italic and never all capitals for more than a label.
- **Body: Atkinson Hyperlegible Next** (variable, OFL), kept on purpose. It was drawn so that
  similar letters cannot be confused, which is what a child, a dyslexic reader and the back row
  of a classroom all need. Nothing prettier would be better.

Display is for names of things, numbers and moments. Body is for everything a person reads.

## Depth and space

Four heights, and a screen uses as few as it can: the ground; things resting on it (a panel); things
held above it (a key, a card you can pick up); things in front of everything (a dialog, the HUD).
Each step up adds shadow and nothing else. Space is generous: a screen has one thing it is about,
and that thing has room round it.

On a big screen that can draw it, the ground itself is a place: the board's world (`world/`), a
stage in the open at night that the class's Glims stand on. Each game mode has its own.

## Motion

Things have weight. They press down and come back, lift when a hand comes near, and settle
when they arrive (a short rise, a soft landing, 160 to 260 ms). A glow may breathe; nothing
else moves by itself in front of something being read. Moments are staged in order (D61). With
less motion, nothing moves at all, and nothing is lost by it.

## Characters

The Glims are who live here, and they are lit like everything else: a soft light on the upper
left, a shadow on the ground under them. They are alive. On a device that can draw it they
breathe where they stand, look up when their player arrives, throw their arms up when their player
is right, and jump on the podium. They never mock a wrong answer: at most a Glim looks thoughtful.
On the board's world they are there in three dimensions, the same characters players collect.

## Tokens

Everything above is in `web/src/styles/app.css` as custom properties; nothing sets a colour, a
shadow or a corner by hand. A school's own look (`schools.css`, D60) changes the colours and the
faces and keeps the light, the materials and the shapes.

| Token | For |
|---|---|
| `--bg`, `--bg-raised`, `--bg-sunken`, `--surface-2`, `--surface-3` | the ground and what rests on it |
| `--line`, `--line-strong` | fine edges |
| `--text`, `--text-2`, `--text-3`, `--link`, `--focus` | words, links, the focus ring |
| `--lantern`, `--glim`, `--ember`, `--sky`, `--dusk`, `--rose` | the accents |
| `--tile-a` to `--tile-f` | answer tiles |
| `--stage-1` to `--stage-4`, `--stage-sky` | the night a game is played in |
| `--edge-light` | the hairline of light along a surface's top |
| `--shadow-1`, `--shadow-2`, `--shadow-3` | the three heights above the ground |
| `--gloss` | the light across the top of a key or a tile |
| `--glow-lantern` | the halo of the action that matters |
| `--radius-s`, `--radius-m`, `--radius-l`, `--radius-xl` | corners |
| `--face-display`, `--face-sans` | the two faces |
| `--ease-out`, `--ease-spring`, `--press` | how things move and how far a key travels |

Classes that carry the materials: `.panel` (lacquer or paper, by theme), `.paper`, `.sticker` and
`.press-soft` (keys), `.stage` and `.stage-card`, `.plate` (the lantern tag), `.hud` (glass),
`.lift`, `.glow`.

## Credits

Bricolage Grotesque is by Mathieu Triay; Atkinson Hyperlegible Next is by the Braille Institute.
Both are under the SIL Open Font License 1.1 and come from Fontsource (`CREDITS.md`).
