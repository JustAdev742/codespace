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
- **Glims in uniform** (`art/glim/uniform.ts`, `uniform.tsx`). Every Glim wears one of three, the
  same one for the same Glim on every screen, 2D and 3D, and a mix across a class:
  - junior: the bottle-green bucket hat with the badge, the red pullover over a cream shirt, the
    junior tie;
  - senior: the bottle-green blazer with red piping and the badge, a cream shirt, the green and
    red senior tie;
  - sport: the bottle-green sports cap with the badge, and the bottle-green polo with its white
    and red chest stripes.

  The badge is the crest's red target in a white ring. A hat or neckwear the player has put on
  shows instead of the uniform's; the garment always shows. Not-yet-found Glims stay plain, and
  the Creator Studio shows Glims without uniform, since there the Glim itself is the subject.

### Where it comes from

- The logo files in `web/public/schools/hills-grammar/` are the school's own, unchanged from its
  website (hillsgrammar.nsw.edu.au, 2026). The two `crest-*` files are the same files cropped to the
  crest (the first 145 of 377 units).
- The uniforms follow the school's uniform list (Bob Stewart, 2023) and its Uniform Expectations
  policy: the bucket hat for Kindergarten to Year 6, the sports cap for Years 7 to 12, the green
  girls' blazer, the red pullover and vest, the junior and senior ties and the sports polo.

The logo belongs to The Hills Grammar School. It is not covered by this repository's licence, and is
used only on the school's own copy. Confirm with the school before it goes in front of students.

## Adding a school

1. Add its id to `SCHOOL_THEMES` in `server/src/config.ts` and `SchoolId` in `web/src/lib/school.ts`.
2. Add its block to `web/src/styles/schools.css`. Keep text contrast at WCAG AA: check every new
   colour against what sits on it.
3. For a logo, add white versions under `web/public/schools/<id>/` and to `SCHOOL_LOGO` in
   `art/icons.tsx`, with the school's permission.
4. Run the layout and game tests in the look: `E2E_SCHOOL_THEME=<id> npx playwright test e2e/layout.spec.ts e2e/game.spec.ts`.
