# School looks

A copy of Ludora run for one school can wear that school's touches. Set `SCHOOL_THEME` on the
server and the page it serves carries `data-school="<id>"` on `<html>`; the stylesheet, the logo and
the Glims pick that up before the first paint. Unset, nothing changes: the demo and every other
copy keep Ludora's own look.

## The Hills Grammar School (`SCHOOL_THEME=hills-grammar`)

Made at the request of the school's junior principal. The first, all-green version looked too much
like Shrek; the second kept Ludora's navy and gold and added the school's green and red as accents.
After the playtest the school asked for two things, and this is the third (D56):

- **The colour logo.** The school's colour lockup and crest (`logo-colour.svg`, `crest-colour.svg`),
  never recoloured, redrawn or stretched (`art/icons.tsx`). Its lettering is near-black and its
  crest bottle green, so it does not read on the dark chrome (1.3:1). Everywhere it shows it stands
  on a warm-white plate (#FFFDF8) with clear space round it: at the start of the page header on a
  wide screen, level with Ludora's mark in the sidebar (so the sidebar fits a 1366x768 laptop as
  in Ludora's own look); beside Ludora's on the sign-in and join pages; in the game bar the crest
  beside Ludora's mark, and the whole logo on a wide screen (the board); the crest beside Ludora's
  mark in the phone header, and the crest alone in a phone's game bar so the game's name keeps its
  room. The crest and the school's name also head the School page and every printed class login
  card (D60). Those places are on the stage in both colour schemes, so the plate is
  always there; on it the lettering is 16:1 and the crest's green 9.8:1, and the plate stands out
  from the chrome at 12.5:1. Ludora's own gold mark stays gold: it is Ludora's, not the school's.
- **Typeface.** Lato, the school's, for everything.
- **Colours: the uniform.** The bottle-green blazer is the chrome, the cream shirt is the page and
  the red of the pullover is a trim used in very few places (`styles/schools.css`):

  | Role | Light | Dark |
  |---|---|---|
  | Sidebar, header, stage (deep bottle) | #083A2B to #031611 | the same |
  | Page / raised surface | cream #F8F4EA / #FFFDF8 | green-black #101815 / #18231E |
  | Text / secondary / quiet | #14211B / #36413A / #59655D | #F6F1E4 / #C8CFC6 / #A3AEA6 |
  | Primary actions, links, focus | action green #00603F, white words (7.6:1) | cream #F6ECD2, bottle-green words |
  | Highlights on the stage and chrome | cream #F6ECD2, bottle-green words (13:1) | the same |
  | Trim | the red #EE3350, a 3px line under the header with a fine cream line above it | the same |
  | Right answers, good news, progress | #00A766 fill, ink words (5.7:1); #00664A as words on cream | #5FDCAA as words |
  | Wrong answers, warnings | #F04B65 fill, ink words (5.0:1); #C02327 as words on cream | #FFA3AD as words |

  Bright green is kept for meaning (right, done, progress) and never used for a surface: that is
  what made the first version look like Shrek. The surfaces are cream and a deep, nearly black
  bottle green, and red appears as a line, not a fill. Right and wrong still carry their shape and
  icon on every tile and result, so they never rely on green and red alone. Every text pair passes
  WCAG 2.1 AA; the automated checks in `e2e/layout.spec.ts` and `e2e/school.spec.ts` pass in this
  look in both schemes. Answer tiles C and D take the school's green and red; A, B, E and F stay.
- **The home menu's yard** in the school's colours: cream and stone paving, bottle-green paint,
  red only as trim (`features/home/place/scene.ts`, `HILLS_YARD`).
- **Glims in uniform** (`art/glim/uniform.ts`, `uniform.tsx`). Seven uniforms, from the school's
  Uniform Expectations Policy:
  - Senior School (Years 7 to 12), green or grey: the bottle-green (girls') or grey tweed (boys')
    blazer, the crest on the breast pocket, school pins on the left lapel, the red V-neck pullover,
    a cream shirt and the striped tie, green and red with a fine white line;
  - Junior School (Years 3 to 6), green: the bottle-green blazer and red pullover with the junior
    girls' rounded cream collar, no tie;
  - Junior School, grey: the grey blazer and red pullover with the junior boys' argyle tie;
  - Kindergarten to Year 2: the red polo with the crest, and the bottle-green bucket hat;
  - sport, Years 3 to 6: the bottle-green polo with the crest, and the bucket hat;
  - sport, Years 7 to 12: the bottle-green polo with the crest, and the sports cap.

- **Year groups** (`packages/shared/src/schoolUniform.ts`). Each player says which year they are
  in, and from Year 3 which blazer and whether it is a sport day:
  - accounts choose in Settings, under School uniform (saved in their preferences);
  - guests choose on the join screen; the choice stays on that device for next time;
  - Kindergarten to Year 2 wear the polo whatever else is chosen.

  Only the uniform goes out with a player's avatar to everyone else: never the year itself.
  A player's avatar wears their uniform on every screen, 2D and 3D. Every other Glim they see
  (their collection, the shop, a Lantern opening) wears their uniform too. A player who has not
  given a year, or a practice bot, wears one of six picked from their Glim's looks, the same one
  everywhere.

  The crest is drawn from the school's own logo file, measured to its proportions: the banner, the
  three chevrons with their stars, the red target in its laurel and the motto ring, in the school's
  green and red on cream. It sits over the Glim's shading so it stays clear. Sleeves are the
  garment's colour (long on blazers, short on polos), in 2D and on 3D Glims' arms, and the far side
  of a 3D Glim wears the back of its garment and hat. A hat or neckwear the player has put on shows
  instead of the uniform's; the garment always shows. Not-yet-found Glims stay plain, and the
  Creator Studio shows Glims without uniform, since there the Glim itself is the subject.

- **The finishing pass (D60).** Checked screen by screen at 1366x768, 1440x900, 390x844 and on a
  1920x1080 board, in both schemes:
  - a player who picked Dark in Settings gets the school's green-black, not Ludora's navy;
  - the browser's bar is the school's green (#083A2B) in both schemes, and an installed copy is
    called "Ludora at The Hills Grammar School" in the same colours
    (`public/schools/hills-grammar/manifest.webmanifest`, linked by `server/src/school-theme.ts`).
    The tab's icon stays Ludora's: the crest is not cut down to a 16px icon;
  - the board's lobby floor, the light under each player, the phone's "You are in" glow and the
    host's backdrops are lit cream and green instead of Ludora blue (`--stage-floor`,
    `--stage-spot`, `--stage-glow` in `schools.css`; `HILLS_LIGHT` in `room/game/Backdrop.tsx`);
  - a three-figure timer (a two-minute question) is set a size down so it stays in its disc;
  - a disabled solid button keeps grey words, and a focused white field on the stage gets a cream
    ring with a green gap, so it shows;
  - the Locker's big buddy wears the player's own uniform.

### Where it comes from

- The logo files in `web/public/schools/hills-grammar/` are the school's own, unchanged from its
  website (hillsgrammar.nsw.edu.au, 2026). The two `crest-*` files are the same files cropped to the
  crest (the first 145 of 377 units).
- The uniforms and which years wear them follow the school's Uniform Expectations Policy (2025) and the photographs of
  students in uniform on its website: the bottle-green blazer for girls and the grey tweed blazer
  for boys, crest on the pocket and badges on the left lapel; the red pullover and cream shirt; the
  striped senior tie, the argyle tie for junior boys (Years 3 to 6) and the junior girls' rounded
  collar; the red polo for Kindergarten to Year 2 and the green PE polo for Years 3 to 12; the bucket
  hat and, for Years 7 to 12, the sports cap. The PE polo is drawn plain green with the crest: no
  photograph of it was found.

The logo belongs to The Hills Grammar School. It is not covered by this repository's licence, and is
used only on the school's own copy. Confirm with the school before it goes in front of students.

## Adding a school

1. Add its id to `SCHOOL_THEMES` in `server/src/config.ts` and `SchoolId` in `web/src/lib/school.ts`.
2. Add its block to `web/src/styles/schools.css`. Keep text contrast at WCAG AA: check every new
   colour against what sits on it.
3. For a logo, add the school's own files under `web/public/schools/<id>/` and to `SCHOOL_LOGO` in
   `art/icons.tsx` with their proportions, with the school's permission. They are shown on a light
   plate, so a colour logo reads on the dark chrome; check that it does.
4. Run the layout and game tests in the look: `E2E_SCHOOL_THEME=<id> npx playwright test e2e/layout.spec.ts e2e/game.spec.ts`.
