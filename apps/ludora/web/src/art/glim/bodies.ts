import type { GlimArt } from '@ludora/shared';
import { circle, ellipse, mirrored, place, roundPoly, smooth, softStar } from './geometry.ts';

/*
 * Geometry for each Glim body, in a 120 x 120 box. `face` is where the eyes
 * centre, `top` is the crown of the head (hats and toppers sit there, with
 * `headW` as the head's width), and `neck` is where neckwear goes. The other
 * anchors are for the right-hand side and are mirrored for the left: `ear`
 * (with an outward tilt in degrees), `arm` (the shoulder), `foot`, `tail`
 * and `wing`.
 */

export interface GlimColors {
  body: string;
  outline: string;
  accent: string;
  belly: string;
  glow: string;
  ink: string;
  /** A deeper tone of the body: feet, floppy ears, tabby stripes, wing-arms. */
  deep: string;
  /** Darker accent, for linework drawn on accent-coloured parts. */
  accentDeep: string;
  /** Kept for older callers; the restyle has no blush, so this is the deep tone. */
  blush: string;
  /** A hue a third of the way round from the accent, for two-colour parts (aurora ribbons). */
  second: string;
}

/**
 * One shape of a Glim. Shapes are drawn twice: first all together as a crisp,
 * dark outer contour, then one by one with their fill and a thin inner line,
 * so parts that overlap show a fine seam.
 */
export interface Part {
  d: string;
  fill: string;
  /** A stroked line of this width instead of a filled shape. */
  line?: number;
  /** Detail: no contour, no inner line, and left out of silhouettes. */
  flat?: boolean;
  /** A dark line (stalk, stem, cable): drawn as it is, kept in silhouettes, left out of the contour. */
  stalk?: boolean;
  opacity?: number;
  /** Fill rule for shapes with holes. */
  evenodd?: boolean;
  /** CSS animation class and transform origin (both passes animate together). */
  anim?: { cls: string; origin: string };
}

export interface BodyGeometry {
  path: string;
  face: { x: number; y: number };
  top: { x: number; y: number };
  headW: number;
  neck: number;
  /** Extra shapes drawn behind the body (wings, tentacles). */
  back?: (c: GlimColors) => Part[];
  /** Extra shapes drawn in front of the body but behind the face (mushroom cap, sprout leaves). */
  front?: (c: GlimColors) => Part[];
  /** Markings drawn inside the body outline, under the shading (inner ears, facets, page edges). */
  marks?: (c: GlimColors) => Part[];
  /** Fill for the body itself when it is not the plain body colour (toast crumb). */
  fill?: (c: GlimColors) => string;
  /** Width of a band of the body colour just inside the outline, over `fill` (toast crust). */
  crust?: number;
  /** Half the distance between the eyes. */
  eyeGap: number;
  /** Eye size multiplier. */
  eyeScale: number;
  ear: { x: number; y: number; a: number; s?: number };
  /** Resting shoulder; null when the shape does without arms (a jellyfish has its tentacles). */
  arm: { x: number; y: number } | null;
  /** Foot centre; null for floaters (ghosts, jellies). */
  foot: { x: number; y: number } | null;
  tail: { x: number; y: number };
  wing: { x: number; y: number };
  /** Highlight ellipse: x, y, rx, ry, rotation. */
  hl: readonly [number, number, number, number, number];
  /** Bounding box, for patterns: x0, y0, x1, y1. */
  box: readonly [number, number, number, number];
  /** How the arms are drawn. */
  armStyle?: 'nub' | 'wing';
  /** False when the body's own shape stands in for resting arms (a star's points); arms still appear to wave and cheer. */
  armIdle?: boolean;
  /** Shoulder for raised arms, when the default (just above the resting shoulder, at eye height) does not suit the shape. */
  armUp?: { x: number; y: number };
  /** Half the body's width at eye height, when the bounding box is wider there (bells, stars). Headphones sit here. */
  sideW?: number;
}

function scallopCircle(cx: number, cy: number, r: number, bumps: number, bulge: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2 + Math.PI / bumps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const chord = 2 * r * Math.sin(Math.PI / bumps);
  const br = (chord / 2) * bulge;
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i <= bumps; i++) {
    const p = pts[i % bumps]!;
    d += `A${br.toFixed(1)} ${br.toFixed(1)} 0 0 1 ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

const TENTACLE = 'M-5 0C-6 8 2 12 -1 20C-3 25 0 30 4 27C7 23 3 17 5 10C6 6 5 2 5 0Z';
const RING_BACK = place('M-54 0A54 12.5 0 0 1 54 0L44 0A44 7 0 0 0 -44 0Z', { x: 60, y: 80, r: -9 });
const RING_FRONT = place('M-54 0A54 12.5 0 0 0 54 0L44 0A44 7 0 0 1 -44 0Z', { x: 60, y: 80, r: -9 });

const blobPath = smooth(mirrored([[60, 33], [81, 36], [95, 51], [98, 72], [94, 92], [80, 102], [60, 104]]));

export const BODIES: Record<GlimArt['body'], BodyGeometry> = {
  blob: {
    path: blobPath,
    face: { x: 60, y: 71 },
    top: { x: 60, y: 34 },
    headW: 56,
    neck: 92,
    eyeGap: 16,
    eyeScale: 1,
    ear: { x: 81, y: 42, a: 30 },
    arm: { x: 93, y: 80 },
    foot: { x: 74, y: 103 },
    tail: { x: 90, y: 92 },
    wing: { x: 88, y: 60 },
    hl: [40, 50, 8, 5, -38],
    box: [22, 33, 98, 104],
  },
  drop: {
    path: smooth(mirrored([[60, 15, 0.2], [68, 29], [84, 48], [95, 71], [92, 91], [79, 102], [60, 105]])),
    face: { x: 60, y: 75 },
    top: { x: 60, y: 31 },
    headW: 40,
    neck: 95,
    eyeGap: 15,
    eyeScale: 1,
    ear: { x: 79, y: 50, a: 38 },
    arm: { x: 92, y: 83 },
    foot: { x: 73, y: 104 },
    tail: { x: 90, y: 94 },
    wing: { x: 86, y: 64 },
    hl: [45, 55, 6.5, 4.5, -45],
    box: [25, 15, 95, 105],
  },
  bean: {
    path: smooth(mirrored([[60, 27], [77, 30], [87, 45], [90, 66], [89, 88], [79, 101], [60, 104]])),
    face: { x: 60, y: 67 },
    top: { x: 60, y: 28 },
    headW: 48,
    neck: 89,
    eyeGap: 14.5,
    eyeScale: 0.95,
    ear: { x: 77, y: 35, a: 24 },
    arm: { x: 87, y: 80 },
    foot: { x: 71, y: 103 },
    tail: { x: 86, y: 94 },
    wing: { x: 84, y: 58 },
    hl: [45, 43, 6, 4.5, -35],
    box: [30, 27, 90, 104],
  },
  star: {
    path: softStar(60, 67, 47, 30),
    face: { x: 60, y: 70 },
    top: { x: 60, y: 24 },
    headW: 32,
    sideW: 31,
    neck: 92,
    eyeGap: 13.5,
    eyeScale: 0.95,
    ear: { x: 74, y: 40, a: 30, s: 0.85 },
    arm: { x: 86, y: 56 },
    armIdle: false,
    armUp: { x: 80, y: 44 },
    foot: { x: 82, y: 103 },
    tail: { x: 88, y: 92 },
    wing: { x: 86, y: 52 },
    hl: [48, 45, 5, 3.5, -40],
    box: [13, 20, 107, 105],
  },
  cloud: {
    path: smooth(
      mirrored([
        [60, 34],
        [71, 37],
        [76, 44, 0.3],
        [86, 40],
        [97, 47],
        [99, 57, 0.3],
        [104, 67],
        [103, 84],
        [93, 99],
        [77, 103],
        [60, 103],
      ]),
    ),
    face: { x: 60, y: 73 },
    top: { x: 60, y: 35 },
    headW: 52,
    neck: 94,
    eyeGap: 16.5,
    eyeScale: 1,
    ear: { x: 84, y: 43, a: 32 },
    arm: { x: 100, y: 82 },
    foot: { x: 75, y: 102 },
    tail: { x: 96, y: 92 },
    wing: { x: 92, y: 64 },
    hl: [36, 55, 7, 4.5, -30],
    box: [16, 34, 104, 103],
  },
  bell: {
    path: smooth(mirrored([[60, 24], [73, 27], [82, 40], [85, 58], [88, 77], [96, 90], [101, 96, 0.4], [95, 100, 0.4], [60, 100]])),
    face: { x: 60, y: 65 },
    top: { x: 60, y: 24 },
    headW: 44,
    sideW: 27,
    neck: 86,
    eyeGap: 14,
    eyeScale: 0.95,
    ear: { x: 77, y: 32, a: 24 },
    arm: { x: 86, y: 74 },
    foot: { x: 77, y: 101 },
    tail: { x: 92, y: 94 },
    wing: { x: 84, y: 54 },
    hl: [47, 40, 5.5, 4, -35],
    box: [19, 24, 101, 100],
    front: (c) => [{ d: circle(60, 101, 6.5), fill: c.accent }],
  },
  ghost: {
    path: smooth(
      mirrored([
        [60, 27],
        [80, 31],
        [92, 48],
        [94, 70],
        [94, 96],
        [92, 104, 0.3],
        [82, 98, 0.6],
        [71, 105, 0.3],
        [60, 99, 0.6],
      ]),
    ),
    face: { x: 60, y: 64 },
    top: { x: 60, y: 27 },
    headW: 52,
    neck: 86,
    eyeGap: 15.5,
    eyeScale: 1,
    ear: { x: 80, y: 35, a: 28 },
    arm: { x: 93, y: 76 },
    foot: null,
    tail: { x: 90, y: 94 },
    wing: { x: 88, y: 56 },
    hl: [41, 44, 7, 4.5, -35],
    box: [26, 27, 94, 105],
  },
  cat: {
    path: smooth(mirrored([[60, 39], [68, 37.5, 0.5], [81, 19, 0.15], [92, 41, 0.6], [97, 60], [97, 81], [90, 96], [76, 103], [60, 104]])),
    face: { x: 60, y: 71 },
    top: { x: 60, y: 38 },
    headW: 46,
    neck: 93,
    eyeGap: 16,
    eyeScale: 1,
    ear: { x: 81, y: 30, a: 22 },
    arm: { x: 95, y: 82 },
    foot: { x: 74, y: 103 },
    tail: { x: 91, y: 94 },
    wing: { x: 90, y: 62 },
    hl: [40, 53, 7, 4.5, -35],
    box: [23, 19, 97, 104],
    marks: (c) => [
      { d: 'M71.5 37.5C74 32 77 27.5 80 25C82.5 30 85 35 86.5 40.5C82 38 76 37 71.5 37.5Z', fill: c.deep, flat: true, opacity: 0.8 },
      { d: 'M48.5 37.5C46 32 43 27.5 40 25C37.5 30 35 35 33.5 40.5C38 38 44 37 48.5 37.5Z', fill: c.deep, flat: true, opacity: 0.8 },
    ],
  },
  owl: {
    path: smooth(mirrored([[60, 31], [69, 29.5, 0.5], [81, 15, 0.15], [87, 31, 0.6], [95, 47], [97, 69], [93, 90], [79, 102], [60, 104]])),
    face: { x: 60, y: 63 },
    top: { x: 60, y: 31 },
    headW: 46,
    neck: 88,
    eyeGap: 16,
    eyeScale: 1.08,
    ear: { x: 82, y: 30, a: 22 },
    arm: { x: 93, y: 74 },
    foot: { x: 72, y: 103 },
    tail: { x: 90, y: 94 },
    wing: { x: 90, y: 58 },
    hl: [40, 46, 6, 4, -35],
    box: [23, 15, 97, 104],
    armStyle: 'wing',
    marks: (c) => [{ d: smooth(mirrored([[60, 54, 0.6], [69, 47], [83, 48], [92, 60], [88, 74], [74, 81], [60, 84]])), fill: c.belly, flat: true, opacity: 0.55 }],
  },
  jelly: {
    path: smooth(
      mirrored([
        [60, 27],
        [80, 31],
        [94, 47],
        [97, 66],
        [95, 76, 0.4],
        [88, 73, 0.6],
        [80, 78, 0.4],
        [70, 74, 0.6],
        [60, 78, 0.4],
      ]),
    ),
    face: { x: 60, y: 56 },
    top: { x: 60, y: 27 },
    headW: 52,
    neck: 75,
    eyeGap: 16,
    eyeScale: 1,
    ear: { x: 81, y: 35, a: 30 },
    arm: null,
    foot: null,
    tail: { x: 92, y: 70 },
    wing: { x: 90, y: 50 },
    hl: [40, 41, 7, 4.5, -35],
    box: [23, 27, 97, 78],
    back: (c) =>
      [36, 48, 60, 72, 84].map((x, i) => ({
        d: place(TENTACLE, { x, y: 72, m: i % 2 === 1, s: i === 2 ? 1.08 : 1 }),
        fill: c.accent,
      })),
  },
  flame: {
    path: smooth(mirrored([[60, 13, 0.15], [68, 29], [78, 39], [86, 31, 0.15], [93, 48], [98, 69], [94, 91], [80, 102], [60, 104]])),
    face: { x: 60, y: 74 },
    top: { x: 60, y: 40 },
    headW: 40,
    neck: 95,
    eyeGap: 15.5,
    eyeScale: 1,
    ear: { x: 84, y: 46, a: 34 },
    arm: { x: 94, y: 84 },
    foot: { x: 74, y: 103 },
    tail: { x: 90, y: 94 },
    wing: { x: 88, y: 64 },
    hl: [41, 58, 6.5, 4, -40],
    box: [22, 13, 98, 104],
  },
  sprout: {
    path: smooth(mirrored([[60, 37], [80, 40], [93, 54], [97, 74], [92, 93], [78, 102], [60, 104]])),
    face: { x: 60, y: 73 },
    top: { x: 60, y: 38 },
    headW: 48,
    neck: 94,
    eyeGap: 15.5,
    eyeScale: 1,
    ear: { x: 80, y: 46, a: 32 },
    arm: { x: 93, y: 83 },
    foot: { x: 73, y: 103 },
    tail: { x: 90, y: 94 },
    wing: { x: 88, y: 64 },
    hl: [41, 54, 7, 4.5, -35],
    box: [23, 37, 97, 104],
    front: (c) => [
      { d: 'M60 40C60 33 60.5 28 62 23', fill: c.outline, line: 3.4, stalk: true },
      { d: 'M61 25C55 14 42 12 36 18C42 27 54 29 61 25Z', fill: c.accent },
      { d: 'M62 24C67 12 81 9 87 15C82 25 70 28 62 24Z', fill: c.accent },
    ],
  },
  crystal: {
    path: roundPoly(
      [
        [60, 13],
        [91, 37],
        [93, 79],
        [73, 103],
        [47, 103],
        [27, 79],
        [29, 37],
      ],
      6,
    ),
    face: { x: 60, y: 68 },
    top: { x: 60, y: 22 },
    headW: 38,
    neck: 92,
    eyeGap: 15,
    eyeScale: 1,
    ear: { x: 80, y: 30, a: 36 },
    arm: { x: 92, y: 78 },
    foot: { x: 71, y: 103 },
    tail: { x: 88, y: 92 },
    wing: { x: 88, y: 56 },
    hl: [42, 40, 5, 3.5, -40],
    box: [27, 13, 93, 103],
    marks: (c) => [
      { d: 'M60 13L91 37L60 45L29 37Z', fill: c.belly, flat: true, opacity: 0.55 },
      { d: 'M27 79L47 103H73L93 79L60 92Z', fill: c.outline, flat: true, opacity: 0.12 },
      { d: 'M29 37L60 45L91 37M27 79L60 92L93 79', fill: c.outline, line: 1.6, flat: true, opacity: 0.35 },
    ],
  },
  moth: {
    path: smooth(mirrored([[60, 34], [74, 37], [83, 52], [85, 72], [81, 92], [72, 102], [60, 104]])),
    face: { x: 60, y: 67 },
    top: { x: 60, y: 34 },
    headW: 42,
    neck: 91,
    eyeGap: 12.5,
    eyeScale: 0.88,
    ear: { x: 72, y: 40, a: 24, s: 0.85 },
    arm: { x: 83, y: 82 },
    foot: { x: 70, y: 103 },
    tail: { x: 82, y: 94 },
    wing: { x: 82, y: 56 },
    hl: [48, 48, 5, 3.5, -35],
    box: [35, 34, 85, 104],
    back: (c) => [
      { d: 'M55 37C53 27 48 19 41 14', fill: c.outline, line: 3.2, stalk: true },
      { d: 'M65 37C67 27 72 19 79 14', fill: c.outline, line: 3.2, stalk: true },
      { d: `${ellipse(40, 14, 5, 3.5)}`, fill: c.accent },
      { d: `${ellipse(80, 14, 5, 3.5)}`, fill: c.accent },
      { d: 'M80 52C87 36 101 28 109 33C115 38 113 55 104 62C97 68 88 69 81 67Z', fill: c.accent },
      { d: 'M40 52C33 36 19 28 11 33C5 38 7 55 16 62C23 68 32 69 39 67Z', fill: c.accent },
      { d: 'M81 74C92 72 104 78 105 89C106 98 96 101 88 96C84 93 82 86 81 80Z', fill: c.accent },
      { d: 'M39 74C28 72 16 78 15 89C14 98 24 101 32 96C36 93 38 86 39 80Z', fill: c.accent },
      { d: `${circle(99, 45, 5.5)}${circle(21, 45, 5.5)}${circle(96, 88, 3.6)}${circle(24, 88, 3.6)}`, fill: c.belly, flat: true },
    ],
  },
  orb: {
    path: circle(60, 68, 35.5),
    face: { x: 60, y: 63 },
    top: { x: 60, y: 33 },
    headW: 50,
    neck: 83,
    eyeGap: 15.5,
    eyeScale: 1,
    ear: { x: 81, y: 41, a: 34 },
    arm: { x: 92, y: 66 },
    foot: { x: 73, y: 101 },
    tail: { x: 90, y: 90 },
    wing: { x: 88, y: 56 },
    hl: [42, 47, 7, 4.5, -38],
    box: [24, 32, 96, 104],
    back: (c) => [{ d: RING_BACK, fill: c.accent }],
    front: (c) => [{ d: RING_FRONT, fill: c.accent }],
  },
  mushroom: {
    path: smooth(mirrored([[60, 56], [79, 58], [86, 74], [85, 93], [76, 103], [60, 104]])),
    face: { x: 60, y: 80 },
    top: { x: 60, y: 17 },
    headW: 64,
    neck: 100,
    eyeGap: 13,
    eyeScale: 0.92,
    ear: { x: 84, y: 34, a: 40 },
    arm: { x: 85, y: 86 },
    foot: { x: 72, y: 104 },
    tail: { x: 84, y: 96 },
    wing: { x: 84, y: 74 },
    hl: [46, 70, 4.5, 3, -40],
    box: [34, 56, 86, 104],
    front: (c) => [
      { d: smooth(mirrored([[60, 16], [84, 20], [102, 36], [106, 54], [98, 64], [80, 66], [60, 66]])), fill: c.accent },
      { d: `${ellipse(40, 39, 6, 5)}${ellipse(60, 28, 5.5, 4)}${ellipse(82, 40, 7, 5.5)}${ellipse(25, 53, 4, 3.5)}${ellipse(95, 55, 4, 3.5)}${ellipse(60, 52, 4.5, 3.5)}`, fill: c.belly, flat: true },
    ],
  },
  fluff: {
    path: scallopCircle(60, 69, 34.5, 14, 1.25),
    face: { x: 60, y: 72 },
    top: { x: 60, y: 33 },
    headW: 54,
    neck: 93,
    eyeGap: 16,
    eyeScale: 1,
    ear: { x: 81, y: 42, a: 32 },
    arm: { x: 95, y: 82 },
    foot: { x: 73, y: 103 },
    tail: { x: 92, y: 94 },
    wing: { x: 90, y: 60 },
    hl: [42, 51, 7, 4.5, -35],
    box: [21, 30, 99, 108],
  },
  lantern: {
    path: smooth(mirrored([[60, 33], [81, 35], [96, 48], [100, 68], [96, 88], [81, 99], [60, 101]])),
    face: { x: 60, y: 69 },
    top: { x: 60, y: 30 },
    headW: 46,
    neck: 92,
    eyeGap: 16,
    eyeScale: 1,
    ear: { x: 82, y: 39, a: 30 },
    arm: { x: 97, y: 76 },
    foot: { x: 72, y: 104 },
    tail: { x: 92, y: 92 },
    wing: { x: 92, y: 58 },
    hl: [39, 50, 7, 4.5, -35],
    box: [20, 33, 100, 101],
    marks: (c) => [
      { d: 'M37 37C27 50 27 86 37 97M83 37C93 50 93 86 83 97', fill: c.outline, line: 1.8, flat: true, opacity: 0.22 },
      { d: 'M24 54C44 50 76 50 96 54M24 84C44 88 76 88 96 84', fill: c.outline, line: 1.6, flat: true, opacity: 0.16 },
    ],
    front: (c) => [
      { d: roundPoly([[44, 27], [76, 27], [78, 37], [42, 37]], 3), fill: c.accentDeep },
      { d: roundPoly([[42, 97], [78, 97], [76, 106], [44, 106]], 3), fill: c.accentDeep },
    ],
  },
  book: {
    path: roundPoly([[30, 27], [92, 27], [92, 104], [30, 104]], 9),
    face: { x: 63, y: 68 },
    top: { x: 61, y: 27 },
    headW: 56,
    neck: 92,
    eyeGap: 14.5,
    eyeScale: 1,
    ear: { x: 84, y: 30, a: 28 },
    arm: { x: 91, y: 80 },
    foot: { x: 73, y: 104 },
    tail: { x: 90, y: 96 },
    wing: { x: 90, y: 56 },
    hl: [46, 38, 6, 3.5, -30],
    box: [30, 27, 92, 104],
    marks: (c) => [
      { d: 'M30 27H41V104H30Z', fill: c.accent, flat: true },
      { d: 'M30 36H41M30 95H41', fill: c.outline, line: 1.8, flat: true, opacity: 0.45 },
      { d: 'M41 27V104', fill: c.outline, line: 2, flat: true, opacity: 0.5 },
      { d: 'M86 31V100', fill: c.belly, line: 3, flat: true, opacity: 0.9 },
    ],
  },
  box: {
    path: roundPoly([[24, 35], [96, 35], [96, 102], [24, 102]], 17),
    face: { x: 60, y: 69 },
    top: { x: 60, y: 35 },
    headW: 58,
    neck: 92,
    eyeGap: 16,
    eyeScale: 1,
    ear: { x: 84, y: 38, a: 34 },
    arm: { x: 95, y: 80 },
    foot: { x: 73, y: 102 },
    tail: { x: 92, y: 94 },
    wing: { x: 92, y: 58 },
    hl: [37, 47, 6.5, 4, -35],
    box: [24, 35, 96, 102],
  },
  dumpling: {
    path: smooth(mirrored([[60, 37, 0.3], [71, 41], [87, 52], [100, 71], [102, 89], [90, 101], [60, 104]])),
    face: { x: 60, y: 78 },
    top: { x: 60, y: 40 },
    headW: 46,
    neck: 98,
    eyeGap: 17,
    eyeScale: 1,
    ear: { x: 82, y: 52, a: 40 },
    arm: { x: 100, y: 86 },
    foot: { x: 76, y: 103 },
    tail: { x: 96, y: 94 },
    wing: { x: 92, y: 68 },
    hl: [38, 66, 6.5, 4, -40],
    box: [18, 37, 102, 104],
    marks: (c) => [{ d: 'M60 39C55 45 50 49 43 52M60 39C65 45 70 49 77 52M60 39C58 46 57 51 55 56M60 39C62 46 63 51 65 56', fill: c.outline, line: 2, flat: true, opacity: 0.3 }],
  },
  bulb: {
    path: smooth(mirrored([[60, 22], [82, 26], [96, 43], [96, 63], [87, 78], [79, 87], [60, 89]])),
    face: { x: 60, y: 57 },
    top: { x: 60, y: 22 },
    headW: 52,
    neck: 86,
    eyeGap: 15.5,
    eyeScale: 1,
    ear: { x: 84, y: 31, a: 34 },
    arm: { x: 94, y: 64 },
    foot: { x: 69, y: 106 },
    tail: { x: 80, y: 94 },
    wing: { x: 90, y: 48 },
    hl: [41, 37, 7, 4.5, -38],
    box: [24, 22, 96, 89],
    front: (c) => [
      { d: roundPoly([[42, 84], [78, 84], [76, 101], [44, 101]], 4), fill: c.belly },
      { d: 'M44 90H76M45 96H75', fill: c.outline, line: 1.8, flat: true, opacity: 0.4 },
      { d: roundPoly([[50, 100], [70, 100], [66, 107], [54, 107]], 3), fill: c.accentDeep },
    ],
  },
  toast: {
    path: smooth(mirrored([[60, 29], [79, 27], [95, 33], [100, 47], [93, 58, 0.5], [94, 95], [89, 103, 0.4], [60, 104]])),
    face: { x: 60, y: 72 },
    top: { x: 60, y: 29 },
    headW: 58,
    sideW: 35,
    neck: 94,
    eyeGap: 15.5,
    eyeScale: 1,
    ear: { x: 84, y: 32, a: 30 },
    arm: { x: 93, y: 82 },
    foot: { x: 73, y: 103 },
    tail: { x: 92, y: 94 },
    wing: { x: 92, y: 60 },
    hl: [42, 42, 6, 3.5, -25],
    box: [20, 27, 100, 104],
    fill: (c) => c.belly,
    crust: 13,
  },
};
