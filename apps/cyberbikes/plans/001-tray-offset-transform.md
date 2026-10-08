# 001 — Move the compare tray with transform, not `bottom`

- **Status**: DONE
- **Commit**: 53d5353
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file, ~6 lines

## Problem

When the mobile buy bar appears, the compare tray rises above it by transitioning `bottom`, a layout
property: every frame of the 220 ms move re-runs layout and paint.

```css
/* src/components/compare.js:40-46 — current */
.tray {
  position: fixed; z-index: 2147482000; left: 50%; bottom: calc(var(--cb-bottom-offset, 0px) + var(--cb-space-3));
  translate: -50% 0;
  ...
  transition: bottom var(--cb-dur-state) var(--cb-ease-move), transform var(--cb-dur-state) var(--cb-ease-move),
    opacity var(--cb-dur-fade) linear;
  @starting-style { transform: translateY(calc(100% + var(--cb-space-3))); opacity: 0; }
}
```

## Target

```css
.tray {
  position: fixed; z-index: 2147482000; left: 50%; bottom: var(--cb-space-3);
  translate: -50% 0;
  transform: translateY(calc(var(--cb-bottom-offset, 0px) * -1));
  ...
  transition: transform var(--cb-dur-state) var(--cb-ease-move), opacity var(--cb-dur-fade) linear;
  @starting-style { transform: translateY(calc(100% + var(--cb-space-3))); opacity: 0; }
}
```

## Repo conventions to follow

- Motion tokens live in `src/tokens.css` (`--cb-ease-move: cubic-bezier(0.32, 0.72, 0, 1)`, `--cb-dur-state: 220ms`).
- Exemplar: the buy bar in `src/components/product.js:159-163` moves with `transform` only.

## Steps

1. In `src/components/compare.js`, in the `.tray` rule, replace `bottom: calc(var(--cb-bottom-offset, 0px) + var(--cb-space-3));`
   with `bottom: var(--cb-space-3);` and add `transform: translateY(calc(var(--cb-bottom-offset, 0px) * -1));`.
2. In the same rule, remove `bottom var(--cb-dur-state) var(--cb-ease-move),` from `transition`.

## Boundaries

- Do NOT touch `src/components/product.js` (it sets `--cb-bottom-offset`).
- Motion properties only.

## Verification

- **Mechanical**: `npm run build` succeeds.
- **Feel check**: on a 390 px viewport, pick a bike to compare on a product page, scroll past Add to cart:
  the tray rises with the bar in one motion and settles without overshoot. In DevTools → Performance,
  the move shows no Layout entries per frame.
- **Done when**: no `transition` in `compare.js` lists `bottom`.
