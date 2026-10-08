# 003 — Let the compare tray leave the way it came

- **Status**: DONE
- **Commit**: 53d5353
- **Severity**: LOW
- **Category**: Missed opportunities / Spatial consistency
- **Estimated scope**: 1 file, ~8 lines

## Problem

The tray rises from the bottom edge when the first bike is picked (`@starting-style`), but when the
last bike is removed it is set `hidden` and vanishes in the same frame: an entrance with no exit.

```js
// src/components/compare.js — refresh()
this.tray.hidden = chosen.length === 0;
```

## Target

On hide, the tray drops back below the edge and fades in 160 ms (exit faster than the 220 ms entrance),
then leaves the layout. Browsers without `transition-behavior: allow-discrete` keep today's instant hide.

```css
.tray[hidden] {
  display: none;
  transform: translateY(calc(100% + var(--cb-space-3)));
  opacity: 0;
  transition: transform var(--cb-dur-exit) var(--cb-ease-move), opacity var(--cb-dur-exit) linear,
    display var(--cb-dur-exit) allow-discrete;
}
```

The shared `[hidden] { display: none !important; }` in `src/ui.js` would block the discrete transition,
so the tray needs its own rule that wins: give the tray rule higher specificity than `[hidden]` and
remove the `!important` dependency for it by excluding the tray: change the base rule to
`[hidden]:not(.tray) { display: none !important; }`.

## Repo conventions to follow

- Durations: `--cb-dur-exit: 160ms`; curve `--cb-ease-move: cubic-bezier(0.32, 0.72, 0, 1)` (`src/tokens.css`).
- Exemplar: the dialog exit in `src/components/compare.js:68-75` uses `display … allow-discrete`.

## Steps

1. In `src/ui.js` BASE, change `[hidden] { display: none !important; }` to `[hidden]:not(.tray) { display: none !important; }`.
2. In `src/components/compare.js`, after the `.tray` rule, add the `.tray[hidden]` rule above.

## Boundaries

- Do NOT change how the tray is shown or the store logic.

## Verification

- **Mechanical**: `npm run build` succeeds; `node --test` passes.
- **Feel check**: pick one bike, then remove it: the tray slides down and fades, faster than it arrived.
  With reduced motion emulated, it only fades.
- **Done when**: removing the last bike no longer makes the tray vanish in one frame (Chrome 117+).
