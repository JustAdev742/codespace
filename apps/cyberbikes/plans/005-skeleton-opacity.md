# 005 — Pulse the loading cards with opacity

- **Status**: DONE
- **Commit**: 53d5353
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 file, 2 lines

## Problem

The finder's loading cards pulse by animating `background` (a paint on every frame):

```css
/* src/components/finder.js:109-110 — current */
.skeleton { ...; background: var(--cb-sand-50); animation: wait 1.1s ease-in-out infinite alternate; }
@keyframes wait { to { background: var(--cb-sand-100); } }
```

## Target

```css
.skeleton { ...; background: var(--cb-sand-100); animation: wait 1.1s ease-in-out infinite alternate; }
@keyframes wait { from { opacity: 0.55; } to { opacity: 1; } }
```

A constant loop is the one place keyframes are right; it stays gated by reduced motion (line 111).

## Steps

1. In `src/components/finder.js`, set the skeleton background to `var(--cb-sand-100)`.
2. Replace the `@keyframes wait` body with `from { opacity: 0.55; } to { opacity: 1; }`.

## Verification

- **Mechanical**: `npm run build`.
- **Feel check**: throttle the network, open the finder: the placeholders breathe softly, no flicker.
- **Done when**: no keyframe in `src/` animates `background`.
