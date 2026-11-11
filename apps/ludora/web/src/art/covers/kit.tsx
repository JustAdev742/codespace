import { useId, type ReactNode } from 'react';
import type { GlimArt } from '@ludora/shared';
import { Glim, type GlimPose } from '../glim/Glim.tsx';

/*
 * The shared pieces every mode cover is built from, so thirty covers cost one
 * kit and thirty small scenes. A cover is a 160 x 100 night scene in three
 * planes: a backdrop (the night sky warming to the mode's colour at the
 * horizon, under the floodlight, with hills, rooftops or a crowd in deep tints
 * of that colour), one clear subject that says what you do in the game, drawn
 * like the Glims (a crisp dark contour, a flat fill, hard cel shading: one
 * shadow, one light), and a dark foreground that frames it.
 *
 * Covers are cropped to a tall strip in narrow slots (the Host page, rows on a
 * phone), so the subject always sits in the middle: x 40 to 120.
 */

export const W = 160;
export const H = 100;
/** The contour: the same near-black navy as text on bright fills. */
export const INK = '#0b1020';
export const NIGHT = '#0a0f2c';

export const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${s}% ${l}%)`;

/** A mode's colours, from its thumbnail hue and accent hue. */
export interface Palette {
  hue: number;
  accentHue: number;
  /** The horizon glow behind the hills. */
  horizon: string;
  /** Backdrop planes, far to near. */
  far: string;
  mid: string;
  near: string;
  /** The subject's fills. */
  main: string;
  mainDeep: string;
  mainLight: string;
  accent: string;
  accentDeep: string;
  accentLight: string;
}

export function palette(hue: number, accentHue: number): Palette {
  return {
    hue,
    accentHue,
    horizon: hsl(hue, 70, 40),
    far: hsl(hue, 42, 23),
    mid: hsl(hue, 46, 15),
    near: hsl(hue, 50, 8),
    main: hsl(hue, 82, 57),
    mainDeep: hsl(hue, 72, 38),
    mainLight: hsl(hue, 92, 76),
    accent: hsl(accentHue, 95, 62),
    accentDeep: hsl(accentHue, 78, 40),
    accentLight: hsl(accentHue, 100, 80),
  };
}

/** Ids for gradients and clips that stay unique when a page shows thirty covers. */
export function useUid(): string {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * The backdrop: midnight at the top, warming to the mode's colour at the
 * horizon, lit by the floodlight from the top centre. `horizon` is the height
 * where the glow is strongest.
 */
export function Sky({ p, horizon = 70, light = 0.2 }: { p: Palette; horizon?: number; light?: number }) {
  const id = useUid();
  return (
    <>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
          <stop offset="0.25" stopColor={NIGHT} />
          <stop offset="1" stopColor={p.horizon} />
        </linearGradient>
        <radialGradient id={`${id}f`} cx="80" cy="-8" r="78" gradientUnits="userSpaceOnUse" gradientTransform="translate(80 -8) scale(1 1.15) translate(-80 8)">
          <stop offset="0" stopColor="#fff" stopOpacity={light} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}s)`} />
      <rect width={W} height={H} fill={`url(#${id}f)`} />
    </>
  );
}

/** A soft round glow: a lantern's light, a bloom, the light on a goal. */
export function Glow({ x, y, r, color, strength = 0.6 }: { x: number; y: number; r: number; color: string; strength?: number }) {
  const id = useUid();
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={color} stopOpacity={strength} />
          <stop offset="0.45" stopColor={color} stopOpacity={strength * 0.35} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r={r} fill={`url(#${id})`} />
    </>
  );
}

/** A floodlight beam from above: a soft wedge of light. */
export function Beam({ x, top = -4, spread = 18, width = 6, to = H, tilt = 0, strength = 0.14 }: { x: number; top?: number; spread?: number; width?: number; to?: number; tilt?: number; strength?: number }) {
  const id = useUid();
  const bx = x + tilt;
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1={top} x2="0" y2={to} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity={strength} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`M${x - width / 2} ${top}H${x + width / 2}L${bx + spread} ${to}H${bx - spread}Z`} fill={`url(#${id})`} />
    </>
  );
}

/* Deterministic noise for ridges and crowds, so a cover draws the same every time. */
function wave(x: number, seed: number) {
  return Math.sin(x * 0.045 + seed) * 0.55 + Math.sin(x * 0.11 + seed * 2.3) * 0.3 + Math.sin(x * 0.23 + seed * 0.7) * 0.15;
}

/** A rolling ridge from edge to edge, filled down to the bottom. */
export function ridgePath(y: number, amp: number, seed: number, step = 8): string {
  let d = `M-2 ${H + 2}L-2 ${(y + wave(-2, seed) * amp).toFixed(1)}`;
  let px = -2;
  let py = y + wave(-2, seed) * amp;
  for (let x = -2 + step; x <= W + 2 + step; x += step) {
    const ny = y + wave(x, seed) * amp;
    const mx = (px + x) / 2;
    const my = (py + ny) / 2;
    d += `Q${px.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    px = x;
    py = ny;
  }
  return `${d}L${W + 2} ${H + 2}Z`;
}

export function Ridge({ y, amp = 4, seed = 1, fill }: { y: number; amp?: number; seed?: number; fill: string }) {
  return <path d={ridgePath(y, amp, seed)} fill={fill} />;
}

/** Rooftops of the festival town: a row of houses, some with a lit window. */
export function Rooftops({ y, fill, lit, seed = 1, from = -4, to = W + 4 }: { y: number; fill: string; lit?: string; seed?: number; from?: number; to?: number }) {
  let d = '';
  const windows: [number, number][] = [];
  let x = from;
  let i = 0;
  while (x < to) {
    const w = 12 + Math.round((Math.sin(seed * 3.1 + i * 1.7) * 0.5 + 0.5) * 9);
    const hgt = 9 + Math.round((Math.sin(seed * 1.3 + i * 2.9) * 0.5 + 0.5) * 9);
    const top = y - hgt;
    const peak = i % 3 === 1;
    d += peak ? `M${x} ${H + 2}V${top}L${x + w / 2} ${top - 6}L${x + w} ${top}V${H + 2}Z` : `M${x} ${H + 2}V${top}H${x + w}V${H + 2}Z`;
    if (lit && (i + seed) % 2 === 0) windows.push([x + w / 2 - 1.6, top + 4]);
    x += w + 0.5;
    i++;
  }
  return (
    <>
      <path d={d} fill={fill} />
      {lit ? windows.map(([wx, wy], k) => <rect key={k} x={wx} y={wy} width="3.2" height="3.6" rx="0.6" fill={lit} />) : null}
    </>
  );
}

/**
 * A crowd in silhouette: heads and shoulders along a row, some arms up. One
 * path, so a full stand costs one element.
 */
export function crowdPath(y: number, from: number, to: number, seed = 1, size = 1, cheer = 0.3): string {
  let d = '';
  let i = 0;
  for (let x = from; x < to; i++) {
    const s = size * (0.85 + (Math.sin(seed * 5.3 + i * 2.1) * 0.5 + 0.5) * 0.3);
    const dy = (Math.sin(seed + i * 1.9) * 0.5 + 0.5) * 2.4 * size;
    const r = 3 * s;
    const cy = y - 7 * s + dy;
    // Shoulders, then the head.
    d += `M${(x - 5.2 * s).toFixed(1)} ${H + 2}V${(cy + 6 * s).toFixed(1)}Q${(x - 5.2 * s).toFixed(1)} ${(cy + 3.6 * s).toFixed(1)} ${x.toFixed(1)} ${(cy + 3.6 * s).toFixed(1)}Q${(x + 5.2 * s).toFixed(1)} ${(cy + 3.6 * s).toFixed(1)} ${(x + 5.2 * s).toFixed(1)} ${(cy + 6 * s).toFixed(1)}V${H + 2}Z`;
    d += `M${(x - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0Z`;
    if (Math.sin(seed * 2.7 + i * 3.3) * 0.5 + 0.5 < cheer) {
      const side = i % 2 ? 1 : -1;
      const ax = x + side * 4.6 * s;
      d += `M${(ax - 1.3 * s).toFixed(1)} ${(cy + 6 * s).toFixed(1)}L${(ax + side * 1.6 * s - 1.3 * s).toFixed(1)} ${(cy - 6 * s).toFixed(1)}h${(2.6 * s).toFixed(1)}L${(ax + 1.3 * s).toFixed(1)} ${(cy + 6 * s).toFixed(1)}Z`;
    }
    x += 9.2 * s;
  }
  return d;
}

export function Crowd({ y, fill, from = -4, to = W + 4, seed = 1, size = 1, cheer = 0.3 }: { y: number; fill: string; from?: number; to?: number; seed?: number; size?: number; cheer?: number }) {
  return <path d={crowdPath(y, from, to, seed, size, cheer)} fill={fill} />;
}

/**
 * A string of festival lanterns sagging between two points. The lanterns are
 * small, bold and lit, with a glow behind each.
 */
export function LanternString({ x1, y1, x2, y2, sag = 8, n = 5, hues, size = 1, line }: { x1: number; y1: number; x2: number; y2: number; sag?: number; n?: number; hues: number[]; size?: number; line?: string }) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2;
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2,
    y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2,
  });
  const pts = Array.from({ length: n }, (_, i) => at((i + 0.5) / n));
  return (
    <g>
      <path d={`M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`} fill="none" stroke={line ?? INK} strokeWidth={0.8} />
      {pts.map((q, i) => (
        <MiniLantern key={i} x={q.x} y={q.y + 1} hue={hues[i % hues.length]!} size={size} />
      ))}
    </g>
  );
}

/** A small lit paper lantern hanging from (x, y): cap, glowing body, tassel. */
export function MiniLantern({ x, y, hue, size = 1, glow = true }: { x: number; y: number; hue: number; size?: number; glow?: boolean }) {
  const s = size;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {glow ? <circle cx="0" cy="5" r="7" fill={hsl(hue, 100, 70)} opacity={0.22} /> : null}
      <path d="M0 -1V1.2" stroke={INK} strokeWidth="0.8" />
      <rect x="-3.8" y="1.2" width="7.6" height="8" rx="3.4" fill={hsl(hue, 96, 62)} stroke={INK} strokeWidth="1.1" />
      <path d="M-1.2 2.4V8M1.6 2.4V8" stroke={hsl(hue, 80, 42)} strokeWidth="0.7" />
      <rect x="-2.4" y="2.4" width="1.4" height="4.4" rx="0.7" fill="#fff" opacity={0.55} />
      <path d="M-2.2 1.2H2.2M-2.2 9.2H2.2" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M0 9.6V12" stroke={hsl(hue, 90, 50)} strokeWidth="0.9" strokeLinecap="round" />
    </g>
  );
}

/**
 * Any shape drawn like a Glim: the dark contour outside, a flat fill, and hard
 * cel shading clipped inside it (a shadow along the lower right, a light along
 * the upper left). `off` is how far the shading reaches, in cover units.
 */
export function Cel({ d, fill, line = 1.6, off = 2.4, shade = 0.3, light = 0.3, transform, children }: { d: string; fill: string; line?: number; off?: number; shade?: number; light?: number; transform?: string; children?: ReactNode }) {
  const id = useUid();
  const outside = `M-400 -400H560V500H-400Z${d}`;
  return (
    <g transform={transform}>
      <defs>
        <clipPath id={`${id}c`}>
          <path d={d} />
        </clipPath>
        <clipPath id={`${id}s`}>
          <path d={outside} clipRule="evenodd" transform={`translate(${-off} ${-off * 1.15})`} />
        </clipPath>
        <clipPath id={`${id}h`}>
          <path d={outside} clipRule="evenodd" transform={`translate(${off * 0.55} ${off * 0.65})`} />
        </clipPath>
      </defs>
      {line > 0 ? <path d={d} fill={INK} stroke={INK} strokeWidth={line * 2} strokeLinejoin="round" /> : null}
      <path d={d} fill={fill} />
      <g clipPath={`url(#${id}c)`}>
        {children}
        {shade > 0 ? <rect x={-400} y={-400} width={960} height={900} fill={INK} opacity={shade} clipPath={`url(#${id}s)`} /> : null}
        {light > 0 ? <rect x={-400} y={-400} width={960} height={900} fill="#fff" opacity={light} clipPath={`url(#${id}h)`} /> : null}
      </g>
    </g>
  );
}

/** A small hard highlight: the glint on glass, a ball, a coin. */
export function Glint({ x, y, r = 1.4, rot = -30 }: { x: number; y: number; r?: number; rot?: number }) {
  return <ellipse cx={x} cy={y} rx={r * 1.4} ry={r * 0.7} transform={`rotate(${rot} ${x} ${y})`} fill="#fff" opacity={0.9} />;
}

/** A soft shadow on the ground. */
export function Shadow({ x, y, rx, ry = rx * 0.18, opacity = 0.4 }: { x: number; y: number; rx: number; ry?: number; opacity?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={INK} opacity={opacity} />;
}

/**
 * A Glim standing in the scene with its feet at (x, y), `size` cover units
 * tall. `turn` leans it (degrees), `flip` faces it the other way.
 */
export function Cast({ art, x, y, size, pose = 'idle', flip = false, turn = 0, shadow = true }: { art: GlimArt; x: number; y: number; size: number; pose?: GlimPose; flip?: boolean; turn?: number; shadow?: boolean }) {
  // A Glim's box is 120 x 120 with its feet at (60, 109).
  const k = size / 120;
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})${flip ? ' scale(-1 1)' : ''} translate(${-60 * k} ${-109 * k})`}>
      {shadow ? <ellipse cx={60 * k} cy={109 * k} rx={27 * k} ry={5 * k} fill={INK} opacity={0.45} /> : null}
      <Glim art={art} size={size} pose={pose} uniform={false} ground={false} />
    </g>
  );
}

/** The six answer-tile colours and shapes, as in a live game (DESIGN.md). */
export const TILE = ['#FF8A2A', '#3D9BFF', '#2BD47E', '#FF5C8A', '#A07CFF', '#22CFC3'] as const;
export const TILE_DEEP = ['#B8560A', '#1A5FB8', '#12864B', '#B8284F', '#6340C2', '#0E857D'] as const;
export const SHAPE: Record<'sun' | 'moon' | 'leaf' | 'flame' | 'star' | 'drop', string> = {
  sun: 'M12 6.5A5.5 5.5 0 1 1 11.9 6.5Z',
  moon: 'M15.5 3.2A9 9 0 1 0 20.8 15.5A7 7 0 1 1 15.5 3.2Z',
  leaf: 'M4 20C4 10 10 4 20 4C20 14 14 20 4 20Z',
  flame: 'M12 2C13 6 17 8 17.5 12.5C18 17 15.5 21 12 21C8.5 21 6 18.5 6 15C6 12 8 10.5 9 8C9.5 10 10.5 11 11.5 11.5C10.5 8 11 5 12 2Z',
  star: 'M12 2.5L14.8 8.6L21.5 9.3L16.5 13.8L17.9 20.4L12 17L6.1 20.4L7.5 13.8L2.5 9.3L9.2 8.6Z',
  drop: 'M12 2.5C14 6.5 19 10.5 19 15A7 7 0 0 1 5 15C5 10.5 10 6.5 12 2.5Z',
};

/** A rounded rectangle as a path, so it can go through Cel. */
export function rr(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
}

/** A circle as a path, for Cel. */
export function circ(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

/** A sparkle: four points, for a correct answer or a find. */
export function sparkle(x: number, y: number, r: number): string {
  const q = r * 0.28;
  return `M${x} ${y - r}Q${x + q * 0.3} ${y - q * 0.3} ${x + r} ${y}Q${x + q * 0.3} ${y + q * 0.3} ${x} ${y + r}Q${x - q * 0.3} ${y + q * 0.3} ${x - r} ${y}Q${x - q * 0.3} ${y - q * 0.3} ${x} ${y - r}Z`;
}

/** The part of a cover that moves a little under the pointer or on focus (see cover.css). */
export function Lift({ children, className = 'cover-lift' }: { children: ReactNode; className?: string }) {
  return <g className={className}>{children}</g>;
}
