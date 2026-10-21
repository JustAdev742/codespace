import type { GlimArt } from '@ludora/shared';

/*
 * Geometry for each Glim body, in a 120 x 120 box. `face` is where the eyes
 * centre, `top` is the crown of the head (hats and toppers sit there, with
 * `headW` as the head's width), and `neck` is where neckwear goes.
 */

export interface BodyGeometry {
  path: string;
  face: { x: number; y: number };
  top: { x: number; y: number };
  headW: number;
  neck: number;
  /** Extra shapes drawn behind the body (wings, ears that are not part of the outline). */
  back?: (c: GlimColors) => { d: string; fill: string; stroke?: string }[];
  /** Extra shapes drawn in front of the body but behind the face (mushroom cap, sprout leaves). */
  front?: (c: GlimColors) => { d: string; fill: string; stroke?: string; strokeWidth?: number }[];
}

export interface GlimColors {
  body: string;
  outline: string;
  accent: string;
  belly: string;
  glow: string;
  ink: string;
}

function softStar(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  // Rounded corners: quadratic curves through midpoints, with the corners as control points.
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const next = pts[(i + 1) % pts.length]!;
    const m = mid(p, next);
    if (i === 0) {
      const prev = pts[pts.length - 1]!;
      const m0 = mid(prev, p);
      d += `M${m0[0].toFixed(1)} ${m0[1].toFixed(1)} `;
    }
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)} `;
  }
  return `${d}Z`;
}

export const BODIES: Record<GlimArt['body'], BodyGeometry> = {
  blob: {
    path: 'M60 26C86 26 98 46 98 67C98 89 82 101 60 101C38 101 22 89 22 67C22 46 34 26 60 26Z',
    face: { x: 60, y: 62 },
    top: { x: 60, y: 27 },
    headW: 52,
    neck: 86,
  },
  drop: {
    path: 'M60 16C67 30 96 50 96 71C96 90 80 102 60 102C40 102 24 90 24 71C24 50 53 30 60 16Z',
    face: { x: 60, y: 70 },
    top: { x: 60, y: 36 },
    headW: 38,
    neck: 90,
  },
  bean: {
    path: 'M60 22C80 22 90 35 90 53V79C90 93 78 102 60 102C42 102 30 93 30 79V53C30 35 40 22 60 22Z',
    face: { x: 60, y: 57 },
    top: { x: 60, y: 23 },
    headW: 46,
    neck: 80,
  },
  star: {
    path: softStar(60, 64, 44, 24),
    face: { x: 60, y: 66 },
    top: { x: 60, y: 26 },
    headW: 30,
    neck: 86,
  },
  cloud: {
    path: 'M34 94C22 94 15 84 18 74C13 64 21 53 32 55C34 41 48 35 58 41C66 31 84 33 88 47C100 47 106 59 100 69C106 80 99 94 87 94Z',
    face: { x: 60, y: 70 },
    top: { x: 60, y: 40 },
    headW: 44,
    neck: 92,
  },
  bell: {
    path: 'M60 22C77 22 85 35 87 53C89 71 93 83 101 92C101 95 99 96 96 96H24C21 96 19 95 19 92C27 83 31 71 33 53C35 35 43 22 60 22Z',
    face: { x: 60, y: 60 },
    top: { x: 60, y: 23 },
    headW: 42,
    neck: 84,
    front: (c) => [{ d: 'M53 96A7 7 0 0 0 67 96Z', fill: c.accent, stroke: c.outline, strokeWidth: 3 }],
  },
  ghost: {
    path: 'M28 60C28 38 42 23 60 23C78 23 92 38 92 60V97C86 91 82 91 76 97C70 103 66 103 60 97C54 91 50 91 44 97C38 103 34 103 28 97Z',
    face: { x: 60, y: 57 },
    top: { x: 60, y: 24 },
    headW: 50,
    neck: 82,
  },
  cat: {
    path: 'M30 46L35 17L53 34C57 33 63 33 67 34L85 17L90 46C96 55 98 63 98 71C98 91 82 102 60 102C38 102 22 91 22 71C22 63 24 55 30 46Z',
    face: { x: 60, y: 67 },
    top: { x: 60, y: 33 },
    headW: 34,
    neck: 90,
  },
  owl: {
    path: 'M60 24C67 24 72 19 78 15C80 21 81 26 84 30C91 37 94 50 94 64C94 88 80 102 60 102C40 102 26 88 26 64C26 50 29 37 36 30C39 26 40 21 42 15C48 19 53 24 60 24Z',
    face: { x: 60, y: 56 },
    top: { x: 60, y: 25 },
    headW: 40,
    neck: 84,
    back: (c) => [
      { d: 'M27 62C16 70 15 84 24 92C30 86 31 74 29 64Z', fill: c.accent, stroke: c.outline },
      { d: 'M93 62C104 70 105 84 96 92C90 86 89 74 91 64Z', fill: c.accent, stroke: c.outline },
    ],
  },
  jelly: {
    path: 'M23 66C23 41 40 26 60 26C80 26 97 41 97 66C97 70 94 72 90 72H30C26 72 23 70 23 66Z',
    face: { x: 60, y: 52 },
    top: { x: 60, y: 27 },
    headW: 50,
    neck: 72,
    back: (c) =>
      [34, 48, 62, 76, 88].map((x, i) => ({
        d: `M${x - 4} 70C${x - 8} 80 ${x + (i % 2 ? 6 : -6)} 88 ${x - 2} 100C${x + 2} 102 ${x + 6} 100 ${x + 4} 96C${x} 88 ${x + 6} 80 ${x + 4} 70Z`,
        fill: c.accent,
        stroke: c.outline,
      })),
  },
  flame: {
    path: 'M60 12C66 28 80 33 84 50C89 45 90 39 88 33C98 45 100 59 98 70C96 90 80 102 60 102C40 102 24 90 22 70C20 54 30 42 40 34C40 44 44 50 50 52C46 38 52 23 60 12Z',
    face: { x: 60, y: 73 },
    top: { x: 60, y: 44 },
    headW: 40,
    neck: 94,
  },
  sprout: {
    path: 'M60 32C82 32 94 49 94 69C94 89 80 101 60 101C40 101 26 89 26 69C26 49 38 32 60 32Z',
    face: { x: 60, y: 69 },
    top: { x: 60, y: 33 },
    headW: 44,
    neck: 90,
    front: (c) => [
      { d: 'M60 34C60 28 60 24 61 20', fill: 'none', stroke: c.outline, strokeWidth: 3 },
      { d: 'M61 22C52 12 40 14 38 20C46 26 56 25 61 22Z', fill: c.accent, stroke: c.outline, strokeWidth: 3 },
      { d: 'M61 22C68 10 82 11 84 17C78 24 68 26 61 22Z', fill: c.accent, stroke: c.outline, strokeWidth: 3 },
    ],
  },
  crystal: {
    path: 'M60 14L90 39L85 86L60 103L35 86L30 39Z',
    face: { x: 60, y: 62 },
    top: { x: 60, y: 22 },
    headW: 36,
    neck: 88,
    front: (c) => [
      { d: 'M30 39L60 48L90 39M60 48V103M35 86L60 48L85 86', fill: 'none', stroke: c.outline, strokeWidth: 1.5 },
    ],
  },
  moth: {
    path: 'M60 30C74 30 80 44 80 62C80 84 72 99 60 99C48 99 40 84 40 62C40 44 46 30 60 30Z',
    face: { x: 60, y: 56 },
    top: { x: 60, y: 31 },
    headW: 34,
    neck: 76,
    back: (c) => [
      { d: 'M44 50C30 26 10 28 10 46C10 64 26 70 42 66Z', fill: c.accent, stroke: c.outline },
      { d: 'M76 50C90 26 110 28 110 46C110 64 94 70 78 66Z', fill: c.accent, stroke: c.outline },
      { d: 'M43 70C28 72 18 84 24 94C32 100 42 90 46 80Z', fill: c.accent, stroke: c.outline },
      { d: 'M77 70C92 72 102 84 96 94C88 100 78 90 74 80Z', fill: c.accent, stroke: c.outline },
      { d: 'M54 32C50 22 44 18 40 18M66 32C70 22 76 18 80 18', fill: 'none', stroke: c.outline },
    ],
  },
  orb: {
    path: 'M60 27A37 37 0 1 1 59.9 27Z',
    face: { x: 60, y: 62 },
    top: { x: 60, y: 28 },
    headW: 46,
    neck: 88,
    back: (c) => [{ d: 'M12 70C12 60 108 52 108 62C108 72 12 80 12 70Z', fill: 'none', stroke: c.accent }],
  },
  mushroom: {
    path: 'M41 62H79C82 75 82 89 77 100H43C38 89 38 75 41 62Z',
    face: { x: 60, y: 81 },
    top: { x: 60, y: 23 },
    headW: 60,
    neck: 98,
    front: (c) => [
      { d: 'M17 58C17 36 37 22 60 22C83 22 103 36 103 58C103 64 97 67 91 67H29C23 67 17 64 17 58Z', fill: c.accent, stroke: c.outline, strokeWidth: 3 },
      { d: 'M38 44A6 6 0 1 0 38.1 44ZM60 33A5 5 0 1 0 60.1 33ZM80 46A7 7 0 1 0 80.1 46ZM56 54A4 4 0 1 0 56.1 54Z', fill: c.belly },
    ],
  },
};
