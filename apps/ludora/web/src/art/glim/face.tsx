import type { ReactNode } from 'react';
import type { GlimArt } from '@ludora/shared';
import type { BodyGeometry, GlimColors } from './bodies.ts';
import { fmt as f, softStar, sparkle } from './geometry.ts';

/*
 * Faces with attitude. The eyes are small and set under a lid whose angle
 * comes from the brow, so every Glim wears an expression: steady, sure of
 * itself, worried, wide-eyed or fed up. A genome that names no brow gets one
 * from its eyes and mouth. One small catchlight per eye; no blush.
 */

const WHITE = '#fff';
const TONGUE = 'hsl(355 78% 60%)';
const TONGUE_DEEP = 'hsl(352 62% 36%)';

export interface FaceInk {
  /** Eye and mouth colour. */
  ink: string;
  /** Iris glow at the bottom of big eyes. */
  iris: string;
  outline: string;
}

export type Brow = NonNullable<GlimArt['brows']>;

export interface EyeCtx {
  x: number;
  y: number;
  gap: number;
  k: number;
  ink: FaceInk;
  /** The expression: sets the lids and the brows. */
  brow: Brow;
  /** Avatar sizes: no catchlights or lid lines, which would only blur at 24 to 40 pixels. */
  tiny: boolean;
}

/** The brow a Glim wears when its genome names none, read from its eyes and mouth. */
export function browFor(art: Pick<GlimArt, 'brows' | 'eyes' | 'mouth' | 'face'>): Brow {
  if (art.brows && art.brows !== 'none') return art.brows;
  if (art.eyes === 'visor') return 'none';
  if (art.eyes === 'wink' || art.eyes === 'half') return 'smug';
  if (art.eyes === 'star') return 'surprised';
  switch (art.mouth) {
    case 'smirk':
    case 'tongue':
      return 'smug';
    case 'fang':
    case 'toothy':
    case 'grin':
    case 'beak':
      return 'determined';
    case 'wobble':
      return 'worried';
    case 'o':
    case 'yawn':
      return art.eyes === 'sleepy' ? 'soft' : 'surprised';
    default:
      return art.eyes === 'cyclops' ? 'determined' : 'soft';
  }
}

/** How far the lid comes down (a share of the eye's height, at its middle) and how it tilts (positive: lower at the inner corner). */
const LID: Record<Brow, { drop: number; tilt: number }> = {
  none: { drop: 0.1, tilt: 0 },
  soft: { drop: 0.16, tilt: 0.06 },
  determined: { drop: 0.26, tilt: 0.34 },
  worried: { drop: 0.2, tilt: -0.34 },
  smug: { drop: 0.42, tilt: 0.08 },
  surprised: { drop: 0, tilt: 0 },
  grumpy: { drop: 0.36, tilt: 0.5 },
  bushy: { drop: 0.26, tilt: 0.12 },
};

interface Lid {
  /** y of the lid line through the eye's centre column. */
  mid: number;
  /** Slope in y per unit of x (already signed for the eye's side). */
  m: number;
}

function lidFor(brow: Brow, cx: number, cy: number, ry: number, side: 1 | -1, scale = 1): Lid | null {
  const l = LID[brow];
  if (l.drop <= 0 && l.tilt === 0) return null;
  // Positive tilt drops the inner corner (towards the face centre): for the right eye that is the left end, so y falls as x grows.
  return { mid: cy - ry + 2 * ry * l.drop * scale, m: -l.tilt * side * scale };
}

const lidY = (lid: Lid, cx: number, x: number) => lid.mid + lid.m * (x - cx);

/** An ellipse with everything above the lid line cut away. */
function lidEllipse(cx: number, cy: number, rx: number, ry: number, lid: Lid | null): string {
  const full = `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
  if (!lid) return full;
  // Solve u^2/rx^2 + (c0 + m u)^2/ry^2 = 1, with u = x - cx and v = y - cy on the line v = c0 + m u.
  const c0 = lid.mid - cy;
  const m = lid.m;
  const A = 1 / (rx * rx) + (m * m) / (ry * ry);
  const B = (2 * c0 * m) / (ry * ry);
  const C = (c0 * c0) / (ry * ry) - 1;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return c0 < 0 ? full : '';
  const s = Math.sqrt(disc);
  const u1 = (-B - s) / (2 * A);
  const u2 = (-B + s) / (2 * A);
  const p1 = [cx + u1, cy + c0 + m * u1] as const;
  const p2 = [cx + u2, cy + c0 + m * u2] as const;
  const large = c0 < 0 ? 1 : 0;
  return `M${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}A${f(rx)} ${f(ry)} 0 ${large} 1 ${f(p1[0])} ${f(p1[1])}Z`;
}

/** The lid's own line, a little past the eye at the outer corner, like a lash line. */
function lidLine(cx: number, rx: number, lid: Lid, side: 1 | -1, k: number, color: string, w = 2.1): ReactNode {
  const xi = cx - side * rx * 0.92;
  const xo = cx + side * (rx + 1.3 * k);
  return <path d={`M${f(xi)} ${f(lidY(lid, cx, xi))}L${f(xo)} ${f(lidY(lid, cx, xo) - 0.5 * k)}`} fill="none" stroke={color} strokeWidth={w * k} strokeLinecap="round" />;
}

/** One catchlight, high on the outer side of the eye, kept under the lid. */
function catchlight(cx: number, cy: number, rx: number, ry: number, lid: Lid | null, side: 1 | -1, r: number): ReactNode {
  const x = cx + side * rx * 0.34;
  let y = cy - ry * 0.32;
  if (lid) y = Math.max(y, lidY(lid, cx, x) + r * 1.15);
  if (y + r > cy + ry * 0.7) return null;
  return <circle cx={x} cy={y} r={r} fill={WHITE} />;
}

function bead(cx: number, cy: number, rx0: number, ry0: number, ctx: EyeCtx, side: 1 | -1) {
  const { k, ink, brow, tiny } = ctx;
  const rx = rx0 * k;
  const ry = ry0 * k;
  const lid = lidFor(brow, cx, cy, ry, side, tiny ? 0.7 : 1);
  return (
    <>
      <path d={lidEllipse(cx, cy, rx, ry, lid)} fill={ink.ink} />
      {tiny ? null : catchlight(cx, cy, rx, ry, lid, side, Math.max(rx, ry) * 0.27)}
    </>
  );
}

function bigEye(cx: number, cy: number, ctx: EyeCtx, side: 1 | -1, sparkly = false) {
  const { k, ink, brow, tiny } = ctx;
  const rx = 6.3 * k;
  const ry = 7.4 * k;
  const lid = lidFor(brow, cx, cy, ry, side, tiny ? 0.7 : 1);
  const shape = lidEllipse(cx, cy, rx, ry, lid);
  const r = 1.75 * k;
  const hx = cx + side * rx * 0.3;
  const hy = lid ? Math.max(cy - ry * 0.3, lidY(lid, cx, hx) + r * 1.2) : cy - ry * 0.3;
  return (
    <>
      <path d={shape} fill={ink.ink} />
      {tiny ? null : (
        <>
          <ellipse cx={cx} cy={cy + 3.9 * k} rx={3.9 * k} ry={2.4 * k} fill={ink.iris} opacity={0.95} />
          {sparkly ? <path d={sparkle(hx, hy, 2.9 * k, 0.26)} fill={WHITE} /> : <circle cx={hx} cy={hy} r={r} fill={WHITE} />}
        </>
      )}
    </>
  );
}

function arc(cx: number, cy: number, w: number, h: number, k: number, color: string, width: number) {
  return <path d={`M${f(cx - w * k)} ${f(cy)}Q${f(cx)} ${f(cy + h * k)} ${f(cx + w * k)} ${f(cy)}`} fill="none" stroke={color} strokeWidth={width * k} strokeLinecap="round" />;
}

function halfEye(cx: number, cy: number, ctx: EyeCtx, side: 1 | -1) {
  const { k, ink, tiny } = ctx;
  const rx = 5.5 * k;
  const ry = 6.4 * k;
  // A heavy, level lid: the bored half-look, whatever the brow.
  const lid: Lid = { mid: cy - 0.9 * k, m: -0.06 * side };
  return (
    <>
      <path d={lidEllipse(cx, cy, rx, ry, lid)} fill={ink.ink} />
      {lidLine(cx, rx, lid, side, k, ink.ink, 2.6)}
      {tiny ? null : <circle cx={cx + side * 1.8 * k} cy={cy + 1.6 * k} r={1.4 * k} fill={WHITE} />}
    </>
  );
}

function pixelEye(cx: number, cy: number, ctx: EyeCtx, side: 1 | -1) {
  const { k, ink, brow, tiny } = ctx;
  const w = 8.6 * k;
  const h = 9.8 * k;
  const lid = lidFor(brow, cx, cy, h / 2, side, 0.8);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const top0 = lid ? Math.max(cy - h / 2, lidY(lid, cx, x0)) : cy - h / 2;
  const top1 = lid ? Math.max(cy - h / 2, lidY(lid, cx, x1)) : cy - h / 2;
  const bottom = cy + h / 2;
  const r = 1.6 * k;
  return (
    <>
      <path d={`M${f(x0)} ${f(top0)}L${f(x1)} ${f(top1)}V${f(bottom - r)}Q${f(x1)} ${f(bottom)} ${f(x1 - r)} ${f(bottom)}H${f(x0 + r)}Q${f(x0)} ${f(bottom)} ${f(x0)} ${f(bottom - r)}Z`} fill={ink.ink} />
      {tiny ? null : <rect x={cx + side * 0.6 * k - (side < 0 ? 2.6 * k : 0)} y={Math.max(top0, top1) + 1.2 * k} width={2.6 * k} height={2.6 * k} rx={0.5 * k} fill={WHITE} />}
    </>
  );
}

function EyePair({ kind, ctx }: { kind: GlimArt['eyes']; ctx: EyeCtx }): ReactNode {
  const { x, y, gap, k, ink, brow, tiny } = ctx;
  const L = x - gap;
  const R = x + gap;
  switch (kind) {
    case 'dot':
      return (
        <>
          {bead(L, y, 4.9, 6.2, ctx, -1)}
          {bead(R, y, 4.9, 6.2, ctx, 1)}
        </>
      );
    case 'big':
      return (
        <>
          {bigEye(L, y, ctx, -1)}
          {bigEye(R, y, ctx, 1)}
        </>
      );
    case 'sparkle':
      return (
        <>
          {bigEye(L, y, ctx, -1, true)}
          {bigEye(R, y, ctx, 1, true)}
        </>
      );
    case 'sleepy':
      return (
        <>
          {arc(L, y - 0.6 * k, 5.2, 3.8, k, ink.ink, 3)}
          {arc(R, y - 0.6 * k, 5.2, 3.8, k, ink.ink, 3)}
          {tiny ? null : <path d={`M${f(L - 5 * k)} ${f(y - 0.4 * k)}l${f(-2 * k)} ${f(-1.1 * k)}M${f(R + 5 * k)} ${f(y - 0.4 * k)}l${f(2 * k)} ${f(-1.1 * k)}`} stroke={ink.ink} strokeWidth={2.1 * k} strokeLinecap="round" />}
        </>
      );
    case 'happy':
      return (
        <>
          {arc(L, y + 2.2 * k, 5.4, -7.6, k, ink.ink, 3.2)}
          {arc(R, y + 2.2 * k, 5.4, -7.6, k, ink.ink, 3.2)}
        </>
      );
    case 'wink':
      return (
        <>
          {bead(L, y, 5.2, 6.4, ctx, -1)}
          {arc(R, y + 2.2 * k, 5.6, -7.6, k, ink.ink, 3.2)}
        </>
      );
    case 'star':
      return (
        <>
          {[L, R].map((cx) => (
            <g key={cx}>
              <path d={softStar(cx, y + 0.4 * k, 7.4 * k, 4 * k)} fill={ink.ink} />
              {tiny ? null : <circle cx={cx + 1.7 * k} cy={y - 1.3 * k} r={1.5 * k} fill={WHITE} />}
            </g>
          ))}
        </>
      );
    case 'cyclops': {
      const r = 10.4 * k;
      const cy = y - 1 * k;
      const lid = lidFor(brow, x, cy, r, 1, 0.8);
      // A single eye has no inner corner: level the lid, keep its height.
      const level = lid ? { mid: lid.mid, m: 0 } : null;
      const ix = x + 0.5 * k;
      const iy = y + 0.6 * k;
      const shine = { x: x + 2.9 * k, y: Math.max(y - 1.6 * k, level ? level.mid + 2.4 * k : -Infinity) };
      return (
        <>
          <path d={lidEllipse(x, cy, r, r, level)} fill={WHITE} stroke={ink.outline} strokeWidth={2.2 * k} strokeLinejoin="round" />
          <path d={lidEllipse(ix, iy, 6.6 * k, 6.6 * k, level)} fill={ink.iris} />
          <path d={lidEllipse(ix, iy, 3.8 * k, 3.8 * k, level)} fill={ink.ink} />
          {tiny ? null : <circle cx={shine.x} cy={shine.y} r={1.9 * k} fill={WHITE} />}
          {level && !tiny ? <path d={`M${f(x - r * 0.96)} ${f(level.mid)}H${f(x + r * 0.96)}`} stroke={ink.outline} strokeWidth={2.4 * k} strokeLinecap="round" /> : null}
        </>
      );
    }
    case 'visor': {
      const lidL = lidFor(brow === 'none' ? 'determined' : brow, L + 2 * k, y, 4.6 * k, -1, 0.8);
      const lidR = lidFor(brow === 'none' ? 'determined' : brow, R - 2 * k, y, 4.6 * k, 1, 0.8);
      return (
        <>
          <rect x={x - 25 * k} y={y - 7.4 * k} width={50 * k} height={14.8 * k} rx={7.4 * k} fill={ink.outline} />
          <path d={lidEllipse(L + 2 * k, y + 0.4 * k, 5.6 * k, 4.6 * k, lidL)} fill={ink.iris} />
          <path d={lidEllipse(R - 2 * k, y + 0.4 * k, 5.6 * k, 4.6 * k, lidR)} fill={ink.iris} />
          {tiny ? null : <path d={`M${f(x - 20 * k)} ${f(y - 4.6 * k)}h${f(7 * k)}`} stroke={WHITE} strokeWidth={1.6 * k} strokeLinecap="round" opacity={0.35} />}
        </>
      );
    }
    case 'curious':
      return (
        <>
          {bead(L, y + 0.8 * k, 4.5, 5.6, { ...ctx, brow: 'determined' }, -1)}
          {bigEye(R, y, { ...ctx, brow: 'surprised' }, 1)}
        </>
      );
    case 'half':
      return (
        <>
          {halfEye(L, y, ctx, -1)}
          {halfEye(R, y, ctx, 1)}
        </>
      );
    case 'pixel':
      return (
        <>
          {pixelEye(L, y, ctx, -1)}
          {pixelEye(R, y, ctx, 1)}
        </>
      );
  }
}

export function Eyes({ kind, ctx }: { kind: GlimArt['eyes']; ctx: EyeCtx }) {
  return <EyePair kind={kind} ctx={ctx} />;
}

/* ------------------------------------------------------------------ */

/** Top of the eye above its centre, for placing brows. */
function eyeTop(kind: GlimArt['eyes']): number {
  switch (kind) {
    case 'big':
    case 'sparkle':
    case 'curious':
      return 7.4;
    case 'cyclops':
      return 11.4;
    case 'visor':
      return 7.4;
    case 'sleepy':
    case 'happy':
      return 4.4;
    case 'half':
      return 3.4;
    case 'pixel':
      return 4.9;
    case 'star':
      return 7;
    default:
      return 6.2;
  }
}

/**
 * A brow as a filled, tapering stroke from the inner end to the outer end,
 * through a control point: heavier at the inner end, the way a drawn brow sits.
 */
function taper(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t0: number, t1: number): string {
  const n = 8;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
    const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (t0 + (t1 - t0) * t) / 2;
    top.push(`${f(px + nx * w)} ${f(py + ny * w)}`);
    bottom.push(`${f(px - nx * w)} ${f(py - ny * w)}`);
  }
  return `M${top.join('L')}L${bottom.reverse().join('L')}Z`;
}

/** The right brow's centre line for an expression: inner end, control point, outer end (dx, dy from the brow's centre), and weights. */
const BROW_LINE: Record<Exclude<Brow, 'none' | 'bushy' | 'smug'>, { i: [number, number]; c: [number, number]; o: [number, number]; t: [number, number] }> = {
  soft: { i: [-4.6, 0.9], c: [0, -1.6], o: [4.8, 0.5], t: [2.6, 1.7] },
  determined: { i: [-4.8, 2.5], c: [0, 0.3], o: [4.8, -1.4], t: [3.1, 1.9] },
  worried: { i: [-4.8, -1.8], c: [0, -0.9], o: [4.6, 1.8], t: [2.8, 1.8] },
  surprised: { i: [-4.4, -0.6], c: [0, -4.4], o: [4.6, -0.6], t: [2.5, 1.7] },
  grumpy: { i: [-5.2, 3.6], c: [0, 1.3], o: [5, -1.6], t: [3.7, 2.3] },
};

export function Brows({ eyes, ctx, kind }: { eyes: GlimArt['eyes']; ctx: EyeCtx; kind?: Brow }): ReactNode {
  const { x, y, gap, k, ink, tiny } = ctx;
  const brow = kind ?? ctx.brow;
  if (eyes === 'visor') return null;
  const single = eyes === 'cyclops';
  const by = y - (eyeTop(eyes) + (tiny ? 2.6 : 3.4)) * k;
  const weight = tiny ? 1.35 : 1;
  const draw = (line: { i: [number, number]; c: [number, number]; o: [number, number]; t: [number, number] }, ex: number, side: 1 | -1, lift = 0) => {
    const X = (dx: number) => ex + side * dx * k;
    const Y = (dy: number) => by + (dy + lift) * k;
    return taper(X(line.i[0]), Y(line.i[1]), X(line.c[0]), Y(line.c[1]), X(line.o[0]), Y(line.o[1]), line.t[0] * k * weight, line.t[1] * k * weight);
  };
  if (brow === 'bushy') {
    const shape = (ex: number, dir: 1 | -1) => {
      const p = (dx: number, dy: number) => `${f(ex + dx * dir * k)} ${f(by + dy * k)}`;
      return `M${p(-6, 2.2)}Q${p(-7, -2.3)} ${p(-3.2, -2.6)}Q${p(-1.4, -5.2)} ${p(1.4, -3.3)}Q${p(5.1, -4.6)} ${p(6.5, -0.5)}Q${p(7.4, 2.4)} ${p(4.2, 2)}Q${p(0, 3.3)} ${p(-6, 2.2)}Z`;
    };
    return <path d={single ? shape(x, 1) : `${shape(x + gap, 1)}${shape(x - gap, -1)}`} fill={WHITE} stroke={ink.outline} strokeWidth={1.7 * k} strokeLinejoin="round" />;
  }
  if (brow === 'none') {
    // Curious eyes raise one brow on their own.
    if (eyes !== 'curious') return null;
    return <path d={`${draw(BROW_LINE.surprised, x + gap, 1, -0.6)}${draw(BROW_LINE.determined, x - gap, -1, 0.8)}`} fill={ink.ink} />;
  }
  if (brow === 'smug') {
    // One brow up, one flat: sure of itself.
    const up = { i: [-4.4, 0.2] as [number, number], c: [0, -3.4] as [number, number], o: [4.8, -0.4] as [number, number], t: [2.6, 1.7] as [number, number] };
    const flat = { i: [-4.6, 1.6] as [number, number], c: [0, 1] as [number, number], o: [4.6, 1.4] as [number, number], t: [2.8, 1.9] as [number, number] };
    if (single) return <path d={`${draw(up, x + 4.2 * k, 1)}${draw(flat, x - 4.2 * k, -1)}`} fill={ink.ink} />;
    return <path d={`${draw(up, x + gap, 1, -0.4)}${draw(flat, x - gap, -1, 0.6)}`} fill={ink.ink} />;
  }
  const line = BROW_LINE[brow];
  if (eyes === 'curious') {
    return <path d={`${draw(BROW_LINE.surprised, x + gap, 1, -0.6)}${draw(line, x - gap, -1, 0.8)}`} fill={ink.ink} />;
  }
  // One big eye gets one brow across the middle, drawn as two mirrored halves.
  if (single) return <path d={`${draw(line, x + 5 * k, 1)}${draw(line, x - 5 * k, -1)}`} fill={ink.ink} />;
  return <path d={`${draw(line, x + gap, 1)}${draw(line, x - gap, -1)}`} fill={ink.ink} />;
}

/* ------------------------------------------------------------------ */

export function Mouth({ kind, x, y, k, ink, tiny = false }: { kind: GlimArt['mouth']; x: number; y: number; k: number; ink: FaceInk; tiny?: boolean }): ReactNode {
  const m = y;
  const w = (tiny ? 3.4 : 2.7) * k;
  const line = { fill: 'none', stroke: ink.ink, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const X = (dx: number) => f(x + dx * k);
  const Y = (dy: number) => f(m + dy * k);
  switch (kind) {
    case 'smile':
      return <path d={`M${X(-5.4)} ${Y(0.2)}Q${X(0.4)} ${Y(5)} ${X(5.6)} ${Y(-0.4)}`} {...line} />;
    case 'grin':
      return (
        <>
          <path d={`M${X(-6.6)} ${Y(-0.8)}Q${X(0)} ${Y(1.2)} ${X(6.6)} ${Y(-0.8)}Q${X(6)} ${Y(7.6)} ${X(0)} ${Y(7.6)}Q${X(-6)} ${Y(7.6)} ${X(-6.6)} ${Y(-0.8)}Z`} fill={ink.ink} stroke={ink.ink} strokeWidth={1.3 * k} strokeLinejoin="round" />
          {tiny ? null : <path d={`M${X(-3.6)} ${Y(5.9)}Q${X(0)} ${Y(2.6)} ${X(3.6)} ${Y(5.9)}Q${X(0)} ${Y(7.4)} ${X(-3.6)} ${Y(5.9)}Z`} fill={TONGUE} />}
        </>
      );
    case 'o':
      return <ellipse cx={x} cy={m + 2.2 * k} rx={2.8 * k} ry={3.3 * k} fill={ink.ink} />;
    case 'cat':
      return <path d={`M${X(-5.6)} ${Y(0.2)}Q${X(-2.8)} ${Y(3.6)} ${X(0)} ${Y(0.6)}Q${X(2.8)} ${Y(3.6)} ${X(5.6)} ${Y(0.2)}`} {...line} />;
    case 'tooth':
      return (
        <>
          {tiny ? null : (
            <>
              <path d={`M${X(-2.4)} ${Y(2)}h${f(4.8 * k)}v${f(2.6 * k)}q0 ${f(0.8 * k)} ${f(-0.8 * k)} ${f(0.8 * k)}h${f(-3.2 * k)}q${f(-0.8 * k)} 0 ${f(-0.8 * k)} ${f(-0.8 * k)}Z`} fill={WHITE} stroke={ink.ink} strokeWidth={1.2 * k} strokeLinejoin="round" />
              <path d={`M${X(0)} ${Y(2.2)}v${f(2.8 * k)}`} stroke={ink.ink} strokeWidth={1 * k} />
            </>
          )}
          <path d={`M${X(-5.8)} ${Y(0)}Q${X(0)} ${Y(4.8)} ${X(5.8)} ${Y(0)}`} {...line} />
        </>
      );
    case 'tongue':
      return (
        <>
          {tiny ? null : (
            <>
              <path d={`M${X(0.6)} ${Y(2.1)}q0 ${f(4.4 * k)} ${f(2.8 * k)} ${f(4.4 * k)}q${f(2.8 * k)} 0 ${f(2.8 * k)} ${f(-4.6 * k)}Z`} fill={TONGUE} stroke={ink.ink} strokeWidth={1.3 * k} strokeLinejoin="round" />
              <path d={`M${X(3.4)} ${Y(2.8)}v${f(2.1 * k)}`} stroke={TONGUE_DEEP} strokeWidth={0.9 * k} strokeLinecap="round" />
            </>
          )}
          <path d={`M${X(-6)} ${Y(0)}Q${X(0)} ${Y(4.8)} ${X(6)} ${Y(0)}`} {...line} />
        </>
      );
    case 'smirk':
      return <path d={`M${X(-5)} ${Y(1.6)}Q${X(1)} ${Y(4)} ${X(5.4)} ${Y(-1.2)}M${X(4.2)} ${Y(-2.1)}l${f(2.1 * k)} ${f(1.3 * k)}`} {...line} />;
    case 'fang':
      return (
        <>
          {tiny ? null : <path d={`M${X(1)} ${Y(2)}L${X(2.4)} ${Y(5.4)}L${X(3.8)} ${Y(1.6)}Z`} fill={WHITE} stroke={ink.ink} strokeWidth={1.2 * k} strokeLinejoin="round" />}
          <path d={`M${X(-5.4)} ${Y(0.2)}Q${X(0)} ${Y(4.6)} ${X(5.4)} ${Y(-0.2)}`} {...line} />
        </>
      );
    case 'toothy':
      return (
        <>
          <path d={`M${X(-7.8)} ${Y(-1.1)}Q${X(0)} ${Y(1.2)} ${X(7.8)} ${Y(-1.1)}Q${X(6.9)} ${Y(8.2)} ${X(0)} ${Y(8.2)}Q${X(-6.9)} ${Y(8.2)} ${X(-7.8)} ${Y(-1.1)}Z`} fill={ink.ink} stroke={ink.ink} strokeWidth={1.3 * k} strokeLinejoin="round" />
          {tiny ? null : (
            <>
              <path d={`M${X(-7)} ${Y(-0.5)}Q${X(0)} ${Y(1.7)} ${X(7)} ${Y(-0.5)}L${X(6.5)} ${Y(2.1)}Q${X(0)} ${Y(4.2)} ${X(-6.5)} ${Y(2.1)}Z`} fill={WHITE} />
              <path d={`M${X(-2.4)} ${Y(0.7)}V${Y(3.3)}M${X(2.4)} ${Y(0.7)}V${Y(3.3)}`} stroke={ink.ink} strokeWidth={1 * k} />
              <path d={`M${X(-3.6)} ${Y(6.7)}Q${X(0)} ${Y(4.1)} ${X(3.6)} ${Y(6.7)}Q${X(0)} ${Y(8)} ${X(-3.6)} ${Y(6.7)}Z`} fill={TONGUE} />
            </>
          )}
        </>
      );
    case 'beak':
      return (
        <>
          <path d={`M${X(-4.6)} ${Y(-2)}Q${X(0)} ${Y(-3.7)} ${X(4.6)} ${Y(-2)}Q${X(2)} ${Y(4)} ${X(0)} ${Y(5.4)}Q${X(-2)} ${Y(4)} ${X(-4.6)} ${Y(-2)}Z`} fill="hsl(38 96% 58%)" stroke={ink.outline} strokeWidth={1.9 * k} strokeLinejoin="round" />
          {tiny ? null : <path d={`M${X(-3)} ${Y(0.2)}Q${X(0)} ${Y(1.4)} ${X(3)} ${Y(0.2)}`} fill="none" stroke={ink.outline} strokeWidth={1.1 * k} strokeLinecap="round" opacity={0.6} />}
        </>
      );
    case 'yawn':
      return (
        <>
          <ellipse cx={x} cy={m + 3 * k} rx={4 * k} ry={5.2 * k} fill={ink.ink} />
          {tiny ? null : <ellipse cx={x} cy={m + 5.9 * k} rx={2.5 * k} ry={1.7 * k} fill={TONGUE} />}
        </>
      );
    case 'wobble':
      return <path d={`M${X(-6)} ${Y(1)}q${f(1.5 * k)} ${f(-2.1 * k)} ${f(3 * k)} 0t${f(3 * k)} 0t${f(3 * k)} 0t${f(3 * k)} 0`} {...line} strokeWidth={w * 0.92} />;
    case 'none':
      return null;
  }
}

/* ------------------------------------------------------------------ */

/** Frosty faces: two short strokes of frost across each cheek, like face paint. No blush. */
export function FrostMarks({ geo, k }: { geo: BodyGeometry; k: number }) {
  const dx = geo.eyeGap + 5.4 * k;
  const y = geo.face.y + 8.6 * k;
  const { x } = geo.face;
  const mark = (cx: number, dir: 1 | -1) => `M${f(cx - dir * 2.6 * k)} ${f(y - 1.4 * k)}l${f(dir * 4.6 * k)} ${f(-1.6 * k)}M${f(cx - dir * 2 * k)} ${f(y + 1.6 * k)}l${f(dir * 4.2 * k)} ${f(-1.5 * k)}`;
  return <path d={`${mark(x - dx, -1)}${mark(x + dx, 1)}`} fill="none" stroke="hsl(196 100% 90%)" strokeWidth={1.9 * k} strokeLinecap="round" />;
}

/** Things on the face that sit behind the eyes (screen, mask, snout, beard). */
export function FaceUnder({ kind, geo, k, c }: { kind: GlimArt['face']; geo: BodyGeometry; k: number; c: GlimColors }): ReactNode {
  const { x, y } = geo.face;
  const g = geo.eyeGap;
  switch (kind) {
    case 'screen':
      return (
        <>
          <rect x={x - g - 11 * k} y={y - 11 * k} width={2 * g + 22 * k} height={28 * k} rx={7 * k} fill={c.ink} stroke={c.outline} strokeWidth={2.4} />
          <path d={`M${f(x - g - 6 * k)} ${f(y - 7.4 * k)}h${f(8 * k)}`} stroke={WHITE} strokeWidth={1.8 * k} strokeLinecap="round" opacity={0.26} />
        </>
      );
    case 'mask':
      return (
        <path
          d={`M${f(x - g - 10.5 * k)} ${f(y - 2.6 * k)}Q${f(x)} ${f(y - 10.5 * k)} ${f(x + g + 10.5 * k)} ${f(y - 2.6 * k)}Q${f(x + g + 11.4 * k)} ${f(y + 6 * k)} ${f(x + g + 2.6 * k)} ${f(y + 6.5 * k)}Q${f(x)} ${f(y + 3.5 * k)} ${f(x - g - 2.6 * k)} ${f(y + 6.5 * k)}Q${f(x - g - 11.4 * k)} ${f(y + 6 * k)} ${f(x - g - 10.5 * k)} ${f(y - 2.6 * k)}Z`}
          fill={c.deep}
          stroke={c.outline}
          strokeWidth={1.6 * k}
        />
      );
    case 'snout':
      return (
        <>
          <ellipse cx={x} cy={y + 11.5 * k} rx={9 * k} ry={6.6 * k} fill={c.belly} stroke={c.outline} strokeWidth={1.7 * k} />
          <path d={`M${f(x - 2.9 * k)} ${f(y + 7.2 * k)}Q${f(x)} ${f(y + 6.2 * k)} ${f(x + 2.9 * k)} ${f(y + 7.2 * k)}Q${f(x + 0.9 * k)} ${f(y + 10.2 * k)} ${f(x)} ${f(y + 10.2 * k)}Q${f(x - 0.9 * k)} ${f(y + 10.2 * k)} ${f(x - 2.9 * k)} ${f(y + 7.2 * k)}Z`} fill={c.ink} />
        </>
      );
    case 'beard': {
      const top = y + 12.6 * k;
      return (
        <path
          d={`M${f(x - 13 * k)} ${f(top)}Q${f(x)} ${f(top - 4.4 * k)} ${f(x + 13 * k)} ${f(top)}Q${f(x + 14 * k)} ${f(top + 8 * k)} ${f(x + 8 * k)} ${f(top + 12 * k)}Q${f(x + 5 * k)} ${f(top + 17.5 * k)} ${f(x + 1 * k)} ${f(top + 15.6 * k)}Q${f(x - 3.6 * k)} ${f(top + 18.4 * k)} ${f(x - 6.2 * k)} ${f(top + 13 * k)}Q${f(x - 13 * k)} ${f(top + 10.5 * k)} ${f(x - 13 * k)} ${f(top)}Z`}
          fill={WHITE}
          stroke={c.outline}
          strokeWidth={1.7 * k}
          strokeLinejoin="round"
        />
      );
    }
    default:
      return null;
  }
}

/** Things on the face that sit over the eyes (spectacles, whiskers). */
export function FaceOver({ kind, eyes, geo, k, c }: { kind: GlimArt['face']; eyes: GlimArt['eyes']; geo: BodyGeometry; k: number; c: GlimColors }): ReactNode {
  const { x, y } = geo.face;
  const g = geo.eyeGap;
  switch (kind) {
    case 'spectacles': {
      if (eyes === 'cyclops') {
        return <circle cx={x} cy={y - 1 * k} r={12.4 * k} fill={WHITE} fillOpacity={0.14} stroke={c.ink} strokeWidth={2.2 * k} />;
      }
      const r = 8.6 * k;
      return (
        <g fill={WHITE} fillOpacity={0.14} stroke={c.ink} strokeWidth={2.1 * k} strokeLinecap="round">
          <circle cx={x - g} cy={y} r={r} />
          <circle cx={x + g} cy={y} r={r} />
          <path d={`M${f(x - g + r)} ${f(y - 0.8 * k)}Q${f(x)} ${f(y - 3.8 * k)} ${f(x + g - r)} ${f(y - 0.8 * k)}`} fill="none" />
        </g>
      );
    }
    case 'whiskers': {
      const wx = g + 7.6 * k;
      const wy = y + 6 * k;
      const d = [-1, 1]
        .map((dir) => {
          const sx = x + dir * wx;
          return `M${f(sx)} ${f(wy)}l${f(dir * 10.5 * k)} ${f(-2.6 * k)}M${f(sx)} ${f(wy + 3 * k)}l${f(dir * 11 * k)} ${f(0.9 * k)}`;
        })
        .join('');
      return <path d={d} stroke={c.ink} strokeWidth={1.9 * k} strokeLinecap="round" opacity={0.85} />;
    }
    default:
      return null;
  }
}
