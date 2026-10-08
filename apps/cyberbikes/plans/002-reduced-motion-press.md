# 002 — Drop the press scale under reduced motion

- **Status**: DONE
- **Commit**: 53d5353
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 files, ~4 lines

## Problem

Reduced motion sets `--cb-dur-tap` to 0 ms, so the `scale(0.97)` press does not go away; it becomes an
instant jump, which is harsher than the animated version.

```css
/* src/ui.js:179 — current */
.btn:active { transform: scale(0.97); }
/* src/components/finder.js:89 — current */
.chip:active { transform: scale(0.97); }
```

## Target

Under `prefers-reduced-motion: reduce`, pressing changes colour only:

```css
@media (prefers-reduced-motion: reduce) { .btn:active { transform: none; } }
@media (prefers-reduced-motion: reduce) { .chip:active { transform: none; } }
```

## Repo conventions to follow

- Reduced motion keeps fades and colour, drops movement (`src/tokens.css`, the reduced-motion block).
- Exemplar: `src/components/finder.js:111` gates the skeleton pulse the same way.

## Steps

1. In `src/ui.js`, directly after `.btn:active { transform: scale(0.97); }`, add
   `@media (prefers-reduced-motion: reduce) { .btn:active { transform: none; } }`.
2. In `src/components/finder.js`, directly after `.chip:active { transform: scale(0.97); }`, add
   `@media (prefers-reduced-motion: reduce) { .chip:active { transform: none; } }`.

## Boundaries

- Do NOT change the press scale for users without the preference.

## Verification

- **Mechanical**: `npm run build` succeeds.
- **Feel check**: DevTools → Rendering → emulate `prefers-reduced-motion: reduce`; press a button and a
  finder chip: no size change, colour change still visible. Without emulation: 0.97 press as before.
- **Done when**: both media queries are present.
