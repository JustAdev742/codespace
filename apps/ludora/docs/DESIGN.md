# Ludora's look: game night, live

Ludora is for players aged 8 to 17 and the teachers who run their games. It
should feel like a game they would choose to play, never like an app made for
small children. A classroom game is a live event: a scoreboard, a countdown,
a crowd, a winner. The look borrows the energy of a live sports or esports
broadcast. Everything in it is Ludora's own: no other product's colours,
fonts, characters or layouts.

What changed from the first look (D46): the bubbly display font, ink-outlined
"sticker" pieces, pastel lilac washes, star fields, string lights and floating
paper lanterns read as made for young children. They are gone.

## Principles

1. **Numbers are the heroes.** Scores, ranks, timers and coins are big, bold,
   condensed and tabular. A player should read the state of the game from
   across the room.
2. **One signature device: the slanted plate.** Short, important labels sit on
   a plate leaning back like a broadcast caption: the question number, a score
   gain, a rank, a mode's title, a results callout. Use it for moments, not for
   every label. The `.plate` class does it.
3. **Pieces you press feel physical.** Buttons and answer tiles are solid
   colour with a darker bottom edge that collapses when pressed, like a
   controller button. There are no outlines around them.
4. **Characters are collectibles, not wallpaper.** Glims appear where a
   collectible belongs: avatars, cards, podiums, lobbies, the shop. They do
   not decorate page backgrounds or headers.
5. **Straight talk.** Copy is short, confident and kind, never babyish.
   "Correct", "Incorrect, it is 0 °C", "+850", "Streak ×3", "You are in".
   British spelling, sentence case, digits for numbers.
6. **Projector first.** Contrast and size are judged on a classroom
   projector at the back of the room, and on a phone held at arm's length.

## Colour

Core palette (tokens in `web/src/styles/app.css`):

| Name | Hex | Use |
|---|---|---|
| Midnight | `#0B1130` | The stage: game screens, the landing hero, the sidebar |
| Floodlight | `#3A6BFF` | Brand blue: glows, focus on the stage, links on dark |
| Gold | `#FFC233` | Primary calls to action, coins and rewards; ink text on it |
| Mint | `#1FD38F` | Correct, success |
| Coral | `#FF4D6A` | Incorrect, danger |
| Ink | `#0B1020` | Text on bright fills; text on light surfaces |

Answer tiles, A to F: orange `#FF8A2A`, blue `#3D9BFF`, green `#2BD47E`, pink
`#FF5C8A`, violet `#A07CFF`, teal `#22CFC3`. Ink text on all of them (each
passes 4.5:1). Tiles are also told apart by their letter and shape icon, never
by colour alone.

Rarity: common `#9AA5C4`, uncommon `#34D17B`, rare `#3D8BFF`, epic `#A66BFF`,
legendary `#FFB627`, mythic `#FF4FA3`, with a moving sheen for mythic.

Themes: the app pages follow the device's light or dark setting (Settings can
override). Dark is midnight navy; light is a cool white. The stage is always
dark, in both themes.

Avoid: pastel lilac washes, purple-to-pink sky gradients, glitter, blush pink.

## Type

- **Display: Barlow Condensed**, 700 for headings, 800 for big numbers, 800
  italic for live moments (a score pop, the countdown, "Correct"). Use
  `font-display`. Tabular figures (`tabular`) for anything that counts.
- **Body: Atkinson Hyperlegible Next**, chosen for reading at every age.
- Condensed type runs small: give display headings about one size step more
  than a regular font would need.
- No all-caps sentences or labels. Capitals are fine in a short tag of one or
  two words, such as LIVE or a rarity on a card.

## Shape and depth

- Radii: 6px small, 10px medium, 14px large (`--radius-s/m/l`). Pills only
  for chips and avatars.
- **Pressable pieces** (`.sticker`, kept as the class name): solid fill, a
  darker band inside the bottom edge (an inset shadow, so it works on any
  colour), a slight lift; pressing moves it down 2px and thins the band.
  No ink outline. `.press-soft` is the quiet version for secondary buttons.
- **Panels and cards**: flat surface, 1px line, `--radius-l`. On the stage,
  cards float with a soft dark shadow (`.stage-card`), no outline.
- **The slanted plate** (`.plate`): the box leans back 10°, its content stays
  upright (`.plate > *`). Gold with ink text, Midnight with white text, or a
  tile colour.

## The stage

Midnight navy, lit from the top centre by a soft blue floodlight, with a faint
grid like the lines of a pitch. No stars, lanterns or string lights. Game
screens lay out like a broadcast: a slim header bar, the action in the
middle, scores and timers as HUD elements.

## Motion

Fast and purposeful: 150 to 220 ms with `--ease-out`. One orchestrated
moment per screen (the reveal, the score landing, the rank change); no idle
bobbing or drifting. Everything holds still under reduced motion.

## Characters

Glims stay Ludora's collectibles, restyled to suit 8 to 17:
- no blush;
- eyes with more attitude (smaller, with brows that set an expression);
- a crisp dark contour instead of a white die-cut edge;
- cel shading kept.

Rarity finishes read like a trading card: a coloured frame, then foil and
sheen for epic and above.

## Sound

Unchanged: the recorded music and effects (D43) already suit the range.

## Checklist for any screen

- Nothing important uses colour alone; every control has a name.
- Text passes WCAG 2.2 AA in both themes and on the stage.
- Touch targets are at least 44px; no sideways scrolling at 360px.
- No leftovers of the old look: `font-display` on body text, `border-ink`
  outlines on pieces, offset ink shadows (`shadow-[0_Npx_0_var(--ink)]`),
  lilac or purple-pink gradients, star or lantern decoration, blush.
