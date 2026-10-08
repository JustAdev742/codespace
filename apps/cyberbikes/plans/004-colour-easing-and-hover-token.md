# 004 — Colour changes on `ease`; one hover scale

- **Status**: DONE
- **Commit**: 53d5353
- **Severity**: LOW
- **Category**: Easing / Cohesion
- **Estimated scope**: 4 files, ~6 lines

## Problem

1. Button background colour uses the strong ease-out curve, meant for movement; colour and hover changes
   take `ease`.
   ```css
   /* src/ui.js:176 — current */
   transition: background-color var(--cb-dur-tap) var(--cb-ease-out), transform var(--cb-dur-tap) var(--cb-ease-out);
   ```
2. Two hand-typed hover scales that nearly match: `scale(1.03)` (`src/components/card.js:113`) and
   `scale(1.04)` (`src/components/home.js:103`).

## Target

```css
/* src/ui.js */
transition: background-color var(--cb-dur-tap) ease, transform var(--cb-dur-tap) var(--cb-ease-out);
/* src/tokens.css, motion block */
--cb-hover-scale: 1.03;
/* card.js and home.js hover rules */
transform: scale(var(--cb-hover-scale));
```

## Repo conventions to follow

- All motion values are tokens in `src/tokens.css`. Exemplar: `src/components/finder.js:86` already uses `ease` for colour.

## Steps

1. `src/ui.js`: replace `background-color var(--cb-dur-tap) var(--cb-ease-out)` with `background-color var(--cb-dur-tap) ease`.
2. `src/tokens.css`: add `--cb-hover-scale: 1.03;` after `--cb-dur-fade`.
3. `src/components/card.js`: `transform: scale(1.03)` → `transform: scale(var(--cb-hover-scale))`.
4. `src/components/home.js`: `transform: scale(1.04)` → `transform: scale(var(--cb-hover-scale))`.

## Boundaries

- Motion values only.

## Verification

- **Mechanical**: `npm run build`; `grep -rn "scale(1.0[0-9])" src/components` returns nothing.
- **Feel check**: hover a card and a ride tile: identical lift.
- **Done when**: both steps' greps are clean.
