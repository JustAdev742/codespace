# School looks

A copy of Ludora run for one school can wear that school's touches. Set `SCHOOL_THEME` on the
server and the page it serves carries `data-school="<id>"` on `<html>`; the stylesheet, the logo and
the Glims pick that up before the first paint. Unset, nothing changes: the demo and every other
copy keep Ludora's own look.

## The Hills Grammar School (`SCHOOL_THEME=hills-grammar`)

Made at the request of the school's junior principal, then reworked after a first, all-green version
looked too much like Shrek. It keeps Ludora's own look and adds the school to it:

- **Logo.** Ludora's gold mark and wordmark, with the school's logo beside them: under Ludora's in
  the sidebar, beside it on the sign-in and join pages, and the crest alone next to the gold mark in
  the game bar and the phone header (`art/icons.tsx`).
- **Typeface.** Lato, the school's, for everything.
- **Colours.** Ludora's navy stage and gold, with the school's green (#00A766) for right answers and
  good news, its red (#EE3350, tinted to #F04B65 so dark text on it passes 4.5:1) for wrong answers,
  both on answer tiles C and D, and as the stage's two corner glows (`styles/schools.css`).
- **Glims in uniform** (`art/glim/uniform.ts`, `uniform.tsx`). Every Glim wears one of six, the
  same one for the same Glim on every screen, 2D and 3D, and a mix across a class:
  - Senior School, green or grey: the bottle-green (girls') or grey tweed (boys') blazer, the crest
    on the breast pocket, school pins on the left lapel, the red V-neck pullover, a cream shirt and
    the striped tie, green and red with a fine white line;
  - Junior School, green: the bottle-green blazer and red pullover with the junior girls' rounded
    cream collar, no tie;
  - Junior School, grey: the grey blazer and red pullover with the junior boys' argyle tie;
  - Kindergarten: the red polo with the crest, and the bottle-green bucket hat with the crest;
  - sport: the bottle-green polo with the crest, and the sports cap with the crest.

  The crest is drawn from the school's own logo file, measured to its proportions: the banner, the
  three chevrons with their stars, the red target in its laurel and the motto ring, in the school's
  green and red on cream. It sits over the Glim's shading so it stays clear. Sleeves are the
  garment's colour (long on blazers, short on polos), in 2D and on 3D Glims' arms, and the far side
  of a 3D Glim wears the back of its garment and hat. A hat or neckwear the player has put on shows
  instead of the uniform's; the garment always shows. Not-yet-found Glims stay plain, and the
  Creator Studio shows Glims without uniform, since there the Glim itself is the subject.

### Where it comes from

- The logo files in `web/public/schools/hills-grammar/` are the school's own, unchanged from its
  website (hillsgrammar.nsw.edu.au, 2026). The two `crest-*` files are the same files cropped to the
  crest (the first 145 of 377 units).
- The uniforms follow the school's Uniform Expectations Policy (2025) and the photographs of
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
3. For a logo, add white versions under `web/public/schools/<id>/` and to `SCHOOL_LOGO` in
   `art/icons.tsx`, with the school's permission.
4. Run the layout and game tests in the look: `E2E_SCHOOL_THEME=<id> npx playwright test e2e/layout.spec.ts e2e/game.spec.ts`.
