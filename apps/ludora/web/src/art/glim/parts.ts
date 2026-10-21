import type { GlimArt } from '@ludora/shared';
import type { BodyGeometry, GlimColors, Part } from './bodies.ts';
import { circle, ellipse, fmt as f, pair, place, roundPoly, smooth, softStar, sparkle, type Place } from './geometry.ts';

/*
 * Ears, tails, wings, toppers, arms and feet. Each is drawn in its own small
 * coordinate frame (root at the origin, pointing up or out to the right) and
 * placed on the body's anchors, so every part fits every body.
 */

export type Pose = 'idle' | 'wave' | 'cheer';

const ICE = 'hsl(196 85% 90%)';
const GOLD = 'hsl(44 100% 64%)';
const GOLD_DEEP = 'hsl(36 90% 46%)';
const FLAME = 'hsl(30 100% 58%)';
const FLAME_CORE = 'hsl(50 100% 72%)';
const WHITE = 'hsl(48 60% 97%)';
const LEAF = 'hsl(112 55% 52%)';
/** Insect wings: pale and see-through whatever the Glim's colours. */
const WING = 'hsl(196 90% 92%)';

/** A crescent: the circle (cx, cy, r) with a circle of radius r2 bitten out at an offset. */
export function crescent(cx: number, cy: number, r: number, ox: number, oy: number, r2: number): string {
  const d = Math.hypot(ox, oy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const px = cx + (a * ox) / d;
  const py = cy + (a * oy) / d;
  const x1 = px - (h * oy) / d;
  const y1 = py + (h * ox) / d;
  const x2 = px + (h * oy) / d;
  const y2 = py - (h * ox) / d;
  return `M${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 1 1 ${f(x2)} ${f(y2)}A${f(r2)} ${f(r2)} 0 0 0 ${f(x1)} ${f(y1)}Z`;
}

/* ------------------------------------------------------------------ */
/* Ears                                                                */
/* ------------------------------------------------------------------ */

const EAR = {
  cat: 'M-11 5C-9 -5 -5 -14 -1.5 -19.5C0 -21.5 2.5 -21.5 4 -19C8 -11 11 -3 12 5Z',
  catIn: 'M-6 2.5C-5 -4 -2.5 -10 0.5 -14.5C3 -10 5.5 -4 7 2.5Z',
  fox: 'M-12 6C-11 -6 -6 -19 -0.5 -27.5C1 -29.5 3.5 -29.5 5 -27C10 -17 13 -6 14 6Z',
  foxIn: 'M-6.5 3C-5.5 -6 -3 -13.5 1 -20.5C4.5 -13.5 7 -6 8.5 3Z',
  bunny: 'M-7 6C-11 -9 -10.5 -30 -1.5 -34.5C7.5 -37 11 -22 8 -6C7.5 -1 7 6 7 6Z',
  bunnyIn: 'M-3 2C-6 -9 -5.5 -25 -0.5 -28.5C4.5 -28.5 5.5 -16 3.8 -4C3.4 -1 3 2 3 2Z',
  droopy: 'M-7 -2C2 -8 13 -5 15 5C17 14 14 23 8 25C2 26 -1 20 -2 12C-3 6 -8 2 -7 -2Z',
  fold: 'M-12 6C-11 -4 -5 -12 4 -14C10 -15 16 -11 17 -5L9 11C3 10 -5 8 -12 6Z',
  foldUnder: 'M-4 8C1 3 6 -2 9 -7C12 -4 14 -2 17 -5L9 11C5 10.5 0 9.5 -4 8Z',
  fin: 'M-4 5C-6 -6 0 -18 10 -24C12 -18 16 -14 22 -12C19 -6 18 0 20 4C12 6 4 6 -4 5Z',
  finRibs: 'M0 3L9 -19M1 3L17 -11M1 4L17 2',
  leaf: 'M0 6C-9 -2 -9.5 -19 1 -31C11 -19 10 -2 0 6Z',
  leafRib: 'M0.5 3C0.5 -7 1 -17 1 -27',
  prism: 'M-3.6 4L-4 -12L0 -18.5L4 -12L3.6 4Z',
  bolt: 'M-3 -6H5.5C7.5 -6 8.5 -5 8.5 -3V3C8.5 5 7.5 6 5.5 6H-3Z',
  boltCap: 'M7.5 -8.5H11.5C13 -8.5 14 -7.5 14 -6V6C14 7.5 13 8.5 11.5 8.5H7.5Z',
};

function earScale(geo: BodyGeometry) {
  return geo.ear.s ?? 1;
}

/** Ears drawn behind the head, and ears that flop in front of it. */
export function earParts(kind: GlimArt['ears'], geo: BodyGeometry, c: GlimColors): { behind: Part[]; front: Part[] } {
  const { x, y, a } = geo.ear;
  const s = earScale(geo);
  const at = { x, y, r: a, s };
  const behind: Part[] = [];
  const front: Part[] = [];
  const both = (d: string, fill: string, t: Place = at, extra: Partial<Part> = {}) => pair(d, t).map((p) => ({ d: p, fill, ...extra }) as Part);
  switch (kind) {
    case 'cat':
      behind.push(...both(EAR.cat, c.body), ...both(EAR.catIn, c.blush, at, { flat: true, opacity: 0.85 }));
      break;
    case 'fox':
      behind.push(...both(EAR.fox, c.body), ...both(EAR.foxIn, c.belly, at, { flat: true }));
      break;
    case 'bunny': {
      const t = { ...at, r: a * 0.45, s: s * 1.02 };
      behind.push(...both(EAR.bunny, c.body, t), ...both(EAR.bunnyIn, c.blush, t, { flat: true, opacity: 0.8 }));
      break;
    }
    case 'bear': {
      const t = { ...at, x: x + 1, y: y + 1 };
      behind.push(...both(circle(0, -5, 11.5), c.body, t), ...both(circle(0, -5.5, 6.5), c.deep, t, { flat: true, opacity: 0.75 }));
      break;
    }
    case 'mouse': {
      const t = { ...at, x: x + 1, y: y + 2 };
      behind.push(...both(circle(0, -9, 13.5), c.body, t), ...both(circle(0, -9.5, 8.5), c.blush, t, { flat: true, opacity: 0.8 }));
      break;
    }
    case 'droopy': {
      const t = { x: x + 4, y: y + 1, r: a * 0.3 - 8, s: s * 0.95 };
      behind.push(...both(EAR.droopy, c.deep, t));
      break;
    }
    case 'dogear': {
      // One ear up, one folded over like the corner of a page.
      behind.push({ d: place(EAR.fox, { x: 120 - x, y, r: -a, s: s * 0.92, m: true }), fill: c.body }, { d: place(EAR.foxIn, { x: 120 - x, y, r: -a, s: s * 0.92, m: true }), fill: c.belly, flat: true });
      const t = { x: x - 1, y: y + 1, r: a * 0.4, s };
      front.push({ d: place(EAR.fold, t), fill: c.body }, { d: place(EAR.foldUnder, t), fill: c.belly });
      break;
    }
    case 'fin': {
      const t = { x: geo.box[2] - 5, y: geo.face.y - 9, r: 62, s: s * 1.05 };
      behind.push(...both(EAR.fin, c.accent, t), ...both(EAR.finRibs, c.accentDeep, t, { line: 1.6, flat: true, opacity: 0.55 }));
      break;
    }
    case 'leaf': {
      const t = { ...at, r: a + 10 };
      behind.push(...both(EAR.leaf, c.accent, t), ...both(EAR.leafRib, c.accentDeep, t, { line: 1.6, flat: true, opacity: 0.6 }));
      break;
    }
    case 'feelers': {
      const t = { ...at, r: a * 0.4 };
      behind.push(...both('M0 4C1 -8 6 -18 12 -24', c.outline, t, { line: 3.2, stalk: true }), ...both(circle(13, -25.5, 4.4), c.accent, t));
      break;
    }
    case 'crystal': {
      for (const [r, k] of [
        [-22, 1.05],
        [6, 1.4],
        [34, 1.08],
      ] as const) {
        const t = { ...at, r: a + r, s: s * k };
        behind.push(...both(EAR.prism, ICE, t), ...both('M-1.2 2L-1.6 -11', WHITE, t, { line: 1.4, flat: true, opacity: 0.9 }));
      }
      break;
    }
    case 'bolts': {
      const t = { x: geo.box[2] - 3, y: geo.face.y - 4, s: 1.3 };
      behind.push(...both(EAR.bolt, c.belly, t), ...both(EAR.boltCap, c.accent, t));
      break;
    }
    case 'mane': {
      const cx = geo.face.x;
      const cy = geo.face.y - 6;
      const R = Math.max(40, geo.headW * 0.78);
      const pts: [number, number, number][] = [];
      const n = 13;
      for (let i = 0; i < n * 2; i++) {
        const ang = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const tip = i % 2 === 0;
        const r = tip ? R + 9 : R - 3;
        pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang) * 0.94, tip ? 0.35 : 0.9]);
      }
      behind.push({ d: smooth(pts), fill: c.accent });
      break;
    }
    case 'petals': {
      const cx = geo.face.x;
      const cy = geo.face.y - 5;
      const R = Math.max(38, geo.headW * 0.74);
      const petal = (r0: number, len: number, w: number) => `M0 ${-r0}C${w} ${-r0 - len * 0.3} ${w * 0.8} ${-r0 - len} 0 ${-r0 - len}C${-w * 0.8} ${-r0 - len} ${-w} ${-r0 - len * 0.3} 0 ${-r0}Z`;
      const ring = (count: number, offset: number, fill: string, r0: number, len: number, w: number) => {
        let d = '';
        for (let i = 0; i < count; i++) d += place(petal(r0, len, w), { x: cx, y: cy, r: (360 / count) * (i + offset) });
        behind.push({ d, fill });
      };
      ring(12, 0.5, c.accent, R - 10, 17, 8);
      behind[behind.length - 1]!.opacity = 0.72;
      ring(12, 0, c.accent, R - 12, 17, 8);
      break;
    }
    default:
      break;
  }
  return { behind, front };
}

/* ------------------------------------------------------------------ */
/* Tails                                                               */
/* ------------------------------------------------------------------ */

export function tailParts(kind: GlimArt['tail'], geo: BodyGeometry, c: GlimColors): Part[] {
  const { x, y } = geo.tail;
  const at = { x: Math.min(x, 90), y };
  const P = (d: string, t: Place = at) => place(d, t);
  switch (kind) {
    case 'curl':
      return [{ d: P('M-6 0C8 3 19 -3 20 -14C21 -22 14 -26 10 -21C7 -17 11 -14 13 -16.5'), fill: c.body, line: 7 }];
    case 'fox':
      return [
        { d: P('M-8 3C4 11 19 9 25 -3C30 -13 28 -27 20 -38C19 -29 15 -22 8 -18C1 -14 -7 -8 -8 3Z'), fill: c.body },
        { d: P('M26 -10C29 -20 27 -30 20 -38C19 -31 17 -26 13 -22C18 -19 23 -15 26 -10Z'), fill: c.belly },
      ];
    case 'flame':
      return [
        { d: P('M-7 3C5 9 18 6 23 -4C26 -11 24 -19 28 -29C20 -26 17 -20 16 -15C15 -21 13 -27 7 -31C8 -23 5 -16 0 -11C-5 -7 -8 -2 -7 3Z'), fill: 'hsl(30 100% 58%)' },
        { d: P('M3 0C9 3 15 1 17 -5C18 -9 17 -12 19 -17C14 -15 12 -11 11 -8C10 -12 9 -15 5 -17C6 -12 4 -8 1 -5Z'), fill: 'hsl(50 100% 72%)', flat: true },
      ];
    case 'comet':
      return [
        { d: P('M-6 4C9 5 23 -7 28 -33C21 -21 13 -17 5 -16C13 -23 17 -31 18 -44C11 -30 3 -24 -5 -21C-9 -13 -9 -3 -6 4Z'), fill: c.glow },
        { d: P('M-2 1C8 1 17 -8 20 -22C15 -14 10 -12 4 -11C9 -16 12 -21 13 -28C8 -20 2 -16 -3 -15C-5 -9 -5 -3 -2 1Z'), fill: c.accent, flat: true },
        { d: P(`${sparkle(26, -40, 4.2)}${sparkle(14, -48, 2.8)}`), fill: '#fff', flat: true },
      ];
    case 'fish': {
      const t = { x: at.x - 4, y: at.y - 2, r: -24, s: 0.95 };
      return [
        { d: place('M-4 0C4 -1 10 -3 13 -6C16 -10 21 -13 26 -14C25 -8 23 -3 19 1C23 4 26 9 27 15C22 14 17 11 14 8C10 6 4 5 -4 5Z', t), fill: c.accent },
        { d: place('M14 -2L23 -10M15 2.5L24 2.5M14 6L23 12', t), fill: c.accentDeep, line: 1.5, flat: true, opacity: 0.5 },
      ];
    }
    case 'dragon':
      return [
        { d: P('M-8 0C6 3 16 -3 18 -13C19 -19 17 -23 19 -27'), fill: c.body, line: 7.4 },
        { d: P('M13 -25C11 -32 15 -39 22 -43C26 -37 25 -29 20 -23Z'), fill: c.accent },
      ];
    case 'tassel': {
      const t = { x: at.x - 2, y: at.y - 4 };
      return [
        { d: place('M0 0C6 2 9 6 9 11', t), fill: c.outline, line: 2.4, stalk: true },
        { d: place(circle(9, 13, 3.6), t), fill: 'hsl(44 100% 64%)' },
        { d: place('M5 16H13L15 28C12 30.5 6 30.5 3 28Z', t), fill: c.accent },
        { d: place('M7 19L6.5 27M9 19V28M11 19L11.5 27', t), fill: c.accentDeep, line: 1.2, flat: true, opacity: 0.6 },
      ];
    }
    case 'plug':
      return [
        { d: P('M-6 0C6 0 14 3 17 9C18 12 18 14 19 15'), fill: c.outline, line: 3.4, stalk: true },
        { d: P(roundPoly([[13, 13], [25, 13], [25, 21], [13, 21]], 3)), fill: c.accent },
        { d: P('M16 21V25M22 21V25'), fill: c.outline, line: 2.4, stalk: true },
      ];
    case 'ribbon':
      return [
        { d: P('M-6 -2C4 -8 6 -18 12 -26C17 -33 23 -32 27 -40C28 -32 26 -26 21 -21C15 -15 14 -6 6 2C2 5 -4 5 -6 3Z'), fill: c.accent },
        { d: P('M-4 6C8 4 14 -4 20 -10C24 -14 28 -13 31 -18C31 -11 28 -7 24 -4C18 1 14 8 4 11C0 12 -4 10 -4 6Z'), fill: c.second },
      ];
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ */
/* Backs: wings, shells, capes                                         */
/* ------------------------------------------------------------------ */

export function backParts(kind: GlimArt['back'], geo: BodyGeometry, c: GlimColors): Part[] {
  const at = { x: geo.wing.x, y: geo.wing.y };
  const both = (d: string, fill: string, extra: Partial<Part> = {}, t: Place = at) => pair(d, t).map((p) => ({ d: p, fill, ...extra }) as Part);
  switch (kind) {
    case 'feather':
      return [
        ...both('M-8 8C-6 -6 4 -20 18 -27C21 -28.5 24 -26.5 22 -23.5C26 -24 27.5 -20.5 24.5 -18C28 -17.5 28.5 -13.5 25 -12C27 -9 25.5 -6 22 -5.5C17 1 9 7 0 10C-4 11 -7 11 -8 8Z', c.accent),
        ...both('M2 2C9 -6 15 -14 21 -22M5 6C12 0 18 -7 24 -14M8 8C14 4 19 -1 23 -7', c.accentDeep, { line: 1.4, flat: true, opacity: 0.5 }),
      ];
    case 'fairy':
      return [
        ...both('M-6 2C-4 -12 6 -26 18 -29C27 -31 30 -21 25 -13C20 -5 8 0 -6 2Z', WING, { opacity: 0.95 }),
        ...both('M-6 7C3 5 13 7 18 13C21 18 16 23 10 20C4 17 -1 12 -6 7Z', WING, { opacity: 0.95 }),
        ...both('M-2 1C5 -6 11 -14 17 -22M-1 7C5 10 9 13 12 17', c.accentDeep, { line: 1.3, flat: true, opacity: 0.45 }),
      ];
    case 'bat':
      return [
        ...both('M-6 2C-3 -10 7 -23 22 -29C21 -22 23 -16 27 -11C21 -11 18 -7 17 -2C13 -4 9 -2 8 3C5 1 0 2 -6 6Z', c.accentDeep),
        ...both('M-2 1C5 -8 12 -17 21 -26M1 3C8 -2 13 -5 17 -2M0 4C4 3 6 4 8 3', c.outline, { line: 1.4, flat: true, opacity: 0.45 }),
      ];
    case 'paper':
      return [
        ...both('M-6 2L24 -30L22 6Z', c.belly),
        ...both('M-6 2L24 -30L10 -2Z', WHITE, { flat: true, opacity: 0.6 }),
        ...both('M-6 2L24 -30M10 -2L22 6', c.accentDeep, { line: 1.3, flat: true, opacity: 0.45 }),
        ...both('M-4 8L20 10L12 22Z', c.belly),
      ];
    case 'cape':
      return [
        { d: smooth([[34, 50], [60, 46], [86, 50], [98, 70], [108, 96], [112, 107, 0.3], [98, 104], [86, 108, 0.3], [74, 104], [60, 108, 0.3], [46, 104], [34, 108, 0.3], [22, 104], [8, 107, 0.3], [12, 96], [22, 70]]), fill: c.accent },
        { d: `${sparkle(18, 92, 3)}${sparkle(104, 86, 3.6)}${circle(22, 78, 1.4)}${circle(99, 70, 1.6)}${sparkle(94, 100, 2)}`, fill: c.glow, flat: true },
      ];
    case 'snail': {
      const cx = Math.min(geo.wing.x + 6, 92);
      const cy = geo.wing.y + 2;
      const pts: string[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const ang = t * Math.PI * 3.4 + Math.PI * 0.2;
        const r = 3 + t * 15;
        pts.push(`${f(cx + r * Math.cos(ang))} ${f(cy + r * Math.sin(ang))}`);
      }
      return [
        { d: circle(cx, cy, 22), fill: c.accent },
        { d: `M${pts.join('L')}`, fill: c.accentDeep, line: 2.6, flat: true, opacity: 0.7 },
      ];
    }
    case 'scallop': {
      const px = 60;
      const py = 80;
      const R = 54;
      const n = 11;
      const a0 = (194 * Math.PI) / 180;
      const a1 = (346 * Math.PI) / 180;
      let d = `M${px} ${py}`;
      let ribs = '';
      for (let i = 0; i <= n; i++) {
        const ang = a0 + ((a1 - a0) * i) / n;
        const ex = px + R * Math.cos(ang);
        const ey = py + R * Math.sin(ang);
        if (i === 0) d += `L${f(ex)} ${f(ey)}`;
        else d += `A${f(R * 0.2)} ${f(R * 0.2)} 0 0 1 ${f(ex)} ${f(ey)}`;
        if (i > 0 && i < n) ribs += `M${px} ${py}L${f(px + (R - 3) * Math.cos(ang))} ${f(py + (R - 3) * Math.sin(ang))}`;
      }
      return [
        { d: `${d}Z`, fill: c.belly },
        { d: ribs, fill: c.accentDeep, line: 1.6, flat: true, opacity: 0.4 },
      ];
    }
    case 'burst':
      return [
        { d: softStar(60, 64, 58, 38, 12, Math.PI / 12), fill: 'hsl(50 100% 93%)' },
        { d: softStar(60, 64, 48, 35, 12), fill: c.glow, flat: true, opacity: 0.9 },
      ];
    default:
      return [];
  }
}

/** Backs that sit behind everything else, including the tail. */
export const BIG_BACKS: readonly GlimArt['back'][] = ['cape', 'scallop', 'burst'];

/* ------------------------------------------------------------------ */
/* Toppers                                                             */
/* ------------------------------------------------------------------ */

export function topperParts(kind: GlimArt['topper'], geo: BodyGeometry, c: GlimColors): Part[] {
  const s = Math.min(1.12, Math.max(0.85, geo.headW / 50));
  const at = { x: geo.top.x, y: geo.top.y + 2, s };
  const P = (d: string, t: Place = at) => place(d, t);
  switch (kind) {
    case 'antenna':
      return [
        { d: P('M0 4C1 -4 3 -10 2 -16'), fill: c.outline, line: 3.2, stalk: true },
        { d: P(circle(2, -20.5, 5.4)), fill: c.glow },
        { d: P(circle(0.4, -22.2, 1.7)), fill: WHITE, flat: true, opacity: 0.9 },
      ];
    case 'leaf':
      return [
        { d: P('M-1 4C-3 -4 1 -15 15 -19C17 -8 11 1 -1 4Z'), fill: c.accent },
        { d: P('M0 2C4 -5 8 -10 13 -15'), fill: c.accentDeep, line: 1.5, flat: true, opacity: 0.6 },
      ];
    case 'horns': {
      const horn = 'M-5 5C-6 -3 -4 -12 3 -18C2.5 -10 4.5 -4 6.5 5Z';
      return pair(horn, { x: geo.top.x + 13 * s, y: geo.top.y + 6, r: 12, s }, geo.top.x).map((d) => ({ d, fill: c.accent }));
    }
    case 'flame':
      return [
        { d: P('M0 -23C5 -15 11 -12 10.5 -2C10 5 4.5 7 0 7C-4.5 7 -10 5 -10.5 -2C-11 -10 -4 -13 0 -23Z'), fill: FLAME },
        { d: P('M0 -10C3 -5 5 -3 4.5 1C4 4 2 5 0 5C-2 5 -4 4 -4.5 1C-5 -3 -2 -5 0 -10Z'), fill: FLAME_CORE, flat: true },
      ];
    case 'halo':
      return [{ d: ellipse(geo.top.x, geo.top.y - 9, Math.max(14, geo.headW * 0.36), 4.6), fill: GOLD, line: 4.2 }];
    case 'tuft':
      return [{ d: P('M-9 5C-11 -2 -13 -7 -17 -11C-9 -12 -5 -8 -3 -4C-4 -10 -3 -16 1 -22C3.5 -14 4 -8 3 -3C6 -8 10 -11 16 -11C12 -6 9.5 -1 8.5 5Z'), fill: c.accent }];
    case 'spikes':
      return [{ d: P(roundPoly([[-17, 7], [-12, -8], [-6, 2], [0, -13], [6, 2], [12, -8], [17, 7]], 2.2)), fill: c.accent }];
    case 'bolt':
      return [{ d: P('M4 -25L-8.5 -6H-0.5L-4.5 8L10 -11H2Z'), fill: 'hsl(50 100% 60%)' }];
    case 'bud': {
      let petals = '';
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
        petals += circle(6.2 * Math.cos(ang), -14 + 6.2 * Math.sin(ang), 4.6);
      }
      return [
        { d: P('M0 4V-8'), fill: c.outline, line: 3, stalk: true },
        { d: P(petals), fill: c.accent },
        { d: P(circle(0, -14, 3.8)), fill: 'hsl(48 100% 62%)' },
      ];
    }
    case 'sprout':
      return [
        { d: P('M0 4C0 -2 0 -6 1 -10'), fill: c.outline, line: 3, stalk: true },
        { d: P('M1 -9C-4 -18 -14 -19.5 -18.5 -14C-14 -7.5 -4 -6 1 -9Z'), fill: LEAF },
        { d: P('M1 -10C6 -20 16.5 -22 20.5 -16C16.5 -9 6 -6 1 -10Z'), fill: LEAF },
      ];
    case 'clover': {
      const heart = 'M0 0C-3 -3 -8.5 -4 -8.5 -8.5C-8.5 -11.5 -4.5 -12.5 -2.5 -10.5C-1 -9 0 -7.5 0 -7.5C0 -7.5 1 -9 2.5 -10.5C4.5 -12.5 8.5 -11.5 8.5 -8.5C8.5 -4 3 -3 0 0Z';
      let leaves = '';
      for (let i = 0; i < 4; i++) leaves += place(heart, { x: 1.5, y: -17, r: i * 90 + 45 });
      return [
        { d: P('M0 5C0 -2 0.5 -8 1.5 -13'), fill: c.outline, line: 3, stalk: true },
        { d: P(leaves), fill: LEAF },
        { d: P(circle(1.5, -17, 2)), fill: 'hsl(110 50% 38%)', flat: true },
      ];
    }
    case 'fern':
      return [
        { d: P('M0 5C0 -6 2 -14 8 -19C13 -22.5 18.5 -19.5 17.5 -14C16.5 -10 11.5 -10 11.5 -13.5'), fill: LEAF, line: 4.6 },
        { d: P('M1 -3C-5 -5 -9 -9 -9 -14C-3 -13 0 -8.5 1 -3Z'), fill: LEAF },
      ];
    case 'kelp':
      return [
        { d: P('M-3 5C-8 -3 0 -10 -4 -19C-6 -24 -4 -28 1 -31C-1 -24 5 -19 3 -10C2 -4 3 0 3 5Z'), fill: c.accent },
        { d: P('M3 5C8 -1 4 -7 9 -13C11 -16 14 -17 17 -16C14 -12 15 -7 11 -2C9 1 8 3 8 5Z'), fill: c.accent },
      ];
    case 'shell': {
      const t = { x: geo.top.x + 12 * s, y: geo.top.y + 6, r: 22, s: s * 1.35 };
      let ribs = '';
      for (let i = 1; i < 5; i++) {
        const ang = Math.PI + (Math.PI * i) / 5;
        ribs += `M0 2L${f(11 * Math.cos(ang))} ${f(-2 + 11 * Math.sin(ang))}`;
      }
      return [
        { d: place('M0 3L-12 -4C-11 -15 11 -15 12 -4Z', t), fill: 'hsl(14 90% 82%)' },
        { d: place(ribs, t), fill: 'hsl(10 60% 55%)', line: 1.4, flat: true, opacity: 0.6 },
        { d: place('M-4 1H4L3 5H-3Z', t), fill: 'hsl(14 90% 82%)' },
      ];
    }
    case 'coral':
      return [{ d: P('M0 5V-12M0 -3C-6 -5 -9 -9 -10 -16M0 -7C5 -9 8 -13 9 -19M-6 -7C-9 -7 -12 -8 -14 -10'), fill: c.accent, line: 4.6 }];
    case 'lure':
      return [
        { d: P('M0 4C2 -10 11 -19 21 -17C25 -16 26.5 -12 25.5 -8'), fill: c.outline, line: 3, stalk: true },
        { d: P(circle(25, -4, 5.6)), fill: c.glow },
        { d: P(circle(23.4, -5.8, 1.8)), fill: WHITE, flat: true, opacity: 0.9 },
      ];
    case 'steam':
      return [
        { d: P('M-7 -2C-11 -8 -3 -12 -7 -18C-9 -21 -7 -24 -5 -26'), fill: WHITE, line: 4.2, opacity: 0.95 },
        { d: P('M4 -4C0 -11 9 -15 5 -22C3 -26 5 -29 8 -31'), fill: WHITE, line: 4.2, opacity: 0.95 },
      ];
    case 'snowflake': {
      let arms = '';
      for (let i = 0; i < 6; i++) {
        const t = { x: 0, y: -15, r: i * 60 };
        arms += place('M0 0V-10M0 -6L-3.4 -9M0 -6L3.4 -9', t);
      }
      return [
        { d: P('M0 4V-4'), fill: c.outline, line: 3, stalk: true },
        { d: P(arms), fill: ICE, line: 3.2 },
      ];
    }
    case 'icicles':
      return [
        { d: P('M-15 6L-12 -9L-7 4ZM-6 4L0 -18L6 4ZM7 4L12 -10L15 6Z'), fill: ICE },
        { d: P('M-1.6 0L0 -12M-12 2L-11.5 -5'), fill: WHITE, line: 1.4, flat: true, opacity: 0.9 },
      ];
    case 'berries':
      return [
        { d: P('M0 2C-6 -2 -15 -2 -19 -8C-10 -12 -2 -8 0 2Z'), fill: LEAF },
        { d: P('M0 2C6 -2 15 -2 19 -8C10 -12 2 -8 0 2Z'), fill: LEAF },
        { d: P(`${circle(-3.5, -4, 3.8)}${circle(3.5, -4.5, 3.8)}${circle(0, -10, 3.8)}`), fill: WHITE },
      ];
    case 'quill': {
      const t = { x: geo.top.x + 9 * s, y: geo.top.y + 4, r: 20, s };
      return [
        { d: place('M0 4C-3 -6 -1 -20 8 -33C12 -24 12 -9 3 3Z', t), fill: WHITE },
        { d: place('M1.5 4C3 -8 5 -20 8 -31M3 -8L8 -12M2 -15L7.5 -20', t), fill: c.accentDeep, line: 1.4, flat: true, opacity: 0.55 },
      ];
    }
    case 'moon':
      return [{ d: P(crescent(0, -15, 12, 6, -4, 10)), fill: GOLD }];
    case 'star':
      return [
        { d: P('M0 4V-8'), fill: c.outline, line: 3, stalk: true },
        { d: P(softStar(0, -15, 11, 5.6)), fill: GOLD },
      ];
    case 'unihorn':
      return [
        { d: P('M-6.5 5C-5 -6 -2 -18 0 -27C2 -18 5 -6 6.5 5Z'), fill: 'hsl(46 95% 78%)' },
        { d: P('M-5 -1L4.6 -4M-3.6 -9L3.2 -11.5M-2 -17L1.8 -18.5'), fill: GOLD_DEEP, line: 1.6, flat: true, opacity: 0.7 },
      ];
    case 'book': {
      const t = { ...at, r: -12 };
      return [
        { d: P('M-23 7C-15 1 -8 -2 0 -3C8 -2 15 1 23 7L21 11C14 6 7 3 0 2.5C-7 3 -14 6 -21 11Z', t), fill: WHITE },
        { d: P('M-19 8.5C-12 4 -6 2 0 1.5M19 8.5C12 4 6 2 0 1.5', t), fill: c.outline, line: 1, flat: true, opacity: 0.35 },
        { d: P('M0 -12C-9 -11 -17 -6 -26 2L-23 7C-15 1 -8 -2 0 -3C8 -2 15 1 23 7L26 2C17 -6 9 -11 0 -12Z', t), fill: c.accent },
        { d: P('M-3 -11.6C-1 -12 1 -12 3 -11.6L2.4 -3H-2.4Z', t), fill: c.accentDeep },
        { d: P('M-20 -1.5L-12 -6.5M20 -1.5L12 -6.5', t), fill: 'hsl(44 100% 70%)', line: 1.8, flat: true },
      ];
    }
    case 'stem':
      return [
        { d: P('M0 -4C0 -11 3 -15 8 -17'), fill: 'hsl(110 45% 40%)', line: 4.4 },
        { d: P('M-14 3C-10 -2 -6 -4 -3 -4C-6 -8 -4 -10.5 0 -8C4 -10.5 6 -8 3 -4C6 -4 10 -2 14 3C8 5 4 2.5 0 2.5C-4 2.5 -8 5 -14 3Z'), fill: LEAF },
      ];
    case 'crown':
      return [
        { d: P(roundPoly([[-14, 5], [-16, -11], [-7, -3], [0, -15], [7, -3], [16, -11], [14, 5]], 2)), fill: GOLD },
        { d: P(`${circle(0, -1.5, 2.6)}${circle(-9, 1, 1.8)}${circle(9, 1, 1.8)}`), fill: c.accent, flat: true },
      ];
    case 'rose': {
      // A rosebud tucked beside one ear.
      const t = { x: geo.top.x + 15 * s, y: geo.top.y + 8, r: 24, s };
      return [
        { d: place('M-1 2C-7 4 -13 2 -15 -3C-10 -5 -5 -3 -1 2Z', t), fill: LEAF },
        { d: place('M1 2C7 4 13 1 14 -4C9 -5 4 -3 1 2Z', t), fill: LEAF },
        { d: place('M-7.5 -1C-8.5 -8 -4.5 -13.5 0 -13.5C4.5 -13.5 8.5 -8 7.5 -1C6 3.5 -6 3.5 -7.5 -1Z', t), fill: c.accent },
        { d: place('M-3.6 -5C-3.6 -9.5 3.4 -9.6 3.4 -5.6C3.4 -2.4 -1.2 -2.2 -1.2 -5.4', t), fill: c.accentDeep, line: 1.5, flat: true, opacity: 0.7 },
      ];
    }
    case 'tendrils': {
      // A crown of waving tentacles, each with a glowing tip.
      let tips = '';
      const lines: Part[] = [];
      for (const a of [-52, -26, 0, 26, 52]) {
        const t = { x: geo.top.x, y: geo.top.y + 6, r: a, s };
        lines.push({ d: place('M0 2C-3 -5 3 -10 0 -17C-1.5 -20 0 -22 1 -23', t), fill: c.accent, line: 4.4 });
        tips += place(circle(1, -24, 2.6), t);
      }
      return [...lines, { d: tips, fill: c.glow }];
    }
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ */
/* Arms and feet                                                       */
/* ------------------------------------------------------------------ */

const NUB = 'M-5.6 0C-5.6 -5.2 5.6 -5.2 5.6 0V9.4C5.6 16 -5.6 16 -5.6 9.4Z';
const WING_ARM = 'M-6 -3C-1.5 -6.5 5.5 -5.5 8 0C10 6.5 8.5 14 4 20C2.5 16 -1.5 14 -3.8 9.5C-6 5 -7 1 -6 -3Z';

/** Arm angles in degrees from hanging straight down, for the right arm (the left mirrors it). */
const RESTING = -36;
const RAISED = -142;

/**
 * Arms, in front of the body. Resting arms lie against its sides; raised arms
 * (waving, cheering) start higher, at the edge of the body near eye height,
 * so they read clearly as arms in the air even on a small avatar.
 */
export function armParts(geo: BodyGeometry, c: GlimColors, pose: Pose): Part[] {
  if (!geo.arm) return [];
  const shape = geo.armStyle === 'wing' ? WING_ARM : NUB;
  const fill = geo.armStyle === 'wing' ? c.deep : c.body;
  const rest = geo.arm;
  const up = geo.armUp ?? { x: rest.x + 2, y: geo.face.y + 3 };
  const resting = (side: 1 | -1): Part => ({ d: place(shape, { x: side > 0 ? rest.x : 120 - rest.x, y: rest.y, r: side * RESTING, m: side < 0 }), fill });
  const raised = (side: 1 | -1): Part => ({ d: place(shape, { x: side > 0 ? up.x : 120 - up.x, y: up.y, r: side * RAISED, s: 1.12, m: side < 0 }), fill });
  if (pose === 'cheer') return [raised(-1), raised(1)];
  if (pose === 'wave') {
    const wave = { ...raised(1), anim: { cls: 'glim-wave', origin: `${up.x}px ${up.y}px` } };
    return geo.armIdle === false ? [wave] : [resting(-1), wave];
  }
  return geo.armIdle === false ? [] : [resting(-1), resting(1)];
}

export function feetParts(geo: BodyGeometry, c: GlimColors): Part[] {
  if (!geo.foot) return [];
  const { x, y } = geo.foot;
  return pair(ellipse(0, 0, 8.6, 5.8), { x, y, r: 8 }).map((d) => ({ d, fill: c.deep }));
}
