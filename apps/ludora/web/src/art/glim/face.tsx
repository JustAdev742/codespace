import type { ReactNode } from 'react';
import type { GlimArt } from '@ludora/shared';
import type { BodyGeometry, GlimColors } from './bodies.ts';
import { fmt as f, softStar, sparkle } from './geometry.ts';

/*
 * Faces. The eyes are the cute centre of gravity: big, a little below the
 * middle of the body, wide apart, with a big pupil and two catchlights.
 */

const WHITE = '#fff';
const TONGUE = 'hsl(350 90% 72%)';
const TONGUE_DEEP = 'hsl(350 60% 45%)';

export interface FaceInk {
  /** Eye and mouth colour. */
  ink: string;
  /** Iris glow at the bottom of big eyes. */
  iris: string;
  outline: string;
}

interface EyeCtx {
  x: number;
  y: number;
  gap: number;
  k: number;
  ink: FaceInk;
  blink: boolean;
}

/** Top of the eye above its centre, for placing brows. */
export function eyeTop(kind: GlimArt['eyes']): number {
  switch (kind) {
    case 'big':
    case 'sparkle':
    case 'curious':
      return 9.6;
    case 'cyclops':
      return 13;
    case 'visor':
      return 8.6;
    case 'sleepy':
    case 'happy':
      return 5.5;
    case 'half':
      return 4;
    default:
      return 8;
  }
}

function bead(cx: number, cy: number, rx: number, ry: number, k: number, ink: FaceInk) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx * k} ry={ry * k} fill={ink.ink} />
      <circle cx={cx + rx * 0.36 * k} cy={cy - ry * 0.36 * k} r={Math.max(rx, ry) * 0.33 * k} fill={WHITE} />
      <circle cx={cx - rx * 0.36 * k} cy={cy + ry * 0.4 * k} r={Math.max(rx, ry) * 0.15 * k} fill={WHITE} />
    </>
  );
}

function bigEye(cx: number, cy: number, k: number, ink: FaceInk, sparkly = false) {
  const rx = 8.2 * k;
  const ry = 9.6 * k;
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={ink.ink} />
      <ellipse cx={cx} cy={cy + 4.6 * k} rx={5.6 * k} ry={3.6 * k} fill={ink.iris} opacity={0.92} />
      {sparkly ? (
        <>
          <path d={sparkle(cx + 2.5 * k, cy - 3.3 * k, 4.6 * k, 0.26)} fill={WHITE} />
          <circle cx={cx - 3.1 * k} cy={cy + 1.9 * k} r={1.5 * k} fill={WHITE} />
          <circle cx={cx - 2.9 * k} cy={cy - 4.2 * k} r={1 * k} fill={WHITE} opacity={0.9} />
        </>
      ) : (
        <>
          <circle cx={cx + 2.7 * k} cy={cy - 3.6 * k} r={3.4 * k} fill={WHITE} />
          <circle cx={cx - 3 * k} cy={cy + 1.8 * k} r={1.6 * k} fill={WHITE} />
        </>
      )}
    </>
  );
}

function arc(cx: number, cy: number, w: number, h: number, k: number, color: string, width: number) {
  return <path d={`M${f(cx - w * k)} ${f(cy)}Q${f(cx)} ${f(cy + h * k)} ${f(cx + w * k)} ${f(cy)}`} fill="none" stroke={color} strokeWidth={width * k} strokeLinecap="round" />;
}

function halfEye(cx: number, cy: number, k: number, ink: FaceInk, side: 1 | -1) {
  const rx = 7 * k;
  const ry = 8.2 * k;
  const ly = cy - 1.6 * k;
  const wx = rx * Math.sqrt(1 - ((ly - cy) / ry) ** 2);
  return (
    <>
      <path d={`M${f(cx - wx)} ${f(ly)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + wx)} ${f(ly)}Z`} fill={ink.ink} />
      <path d={`M${f(cx - wx - 1.6 * k)} ${f(ly + (side > 0 ? 0.6 : -0.6) * k)}L${f(cx + wx + 1.6 * k)} ${f(ly + (side > 0 ? -0.6 : 0.6) * k)}`} stroke={ink.ink} strokeWidth={3 * k} strokeLinecap="round" />
      <circle cx={cx + 2.5 * k} cy={ly + 2.8 * k} r={2 * k} fill={WHITE} />
      <circle cx={cx - 2.7 * k} cy={ly + 5.4 * k} r={1 * k} fill={WHITE} />
    </>
  );
}

function pixelEye(cx: number, cy: number, k: number, ink: FaceInk) {
  const w = 11.4 * k;
  const h = 12.6 * k;
  return (
    <>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={2.8 * k} fill={ink.ink} />
      <rect x={cx + 0.6 * k} y={cy - 4.6 * k} width={3.4 * k} height={3.4 * k} rx={0.7 * k} fill={WHITE} />
      <rect x={cx - 3.8 * k} y={cy + 1.9 * k} width={1.8 * k} height={1.8 * k} rx={0.4 * k} fill={WHITE} />
    </>
  );
}

function EyePair({ kind, ctx }: { kind: GlimArt['eyes']; ctx: EyeCtx }): ReactNode {
  const { x, y, gap, k, ink } = ctx;
  const L = x - gap;
  const R = x + gap;
  switch (kind) {
    case 'dot':
      return (
        <>
          {bead(L, y, 6, 7.3, k, ink)}
          {bead(R, y, 6, 7.3, k, ink)}
        </>
      );
    case 'big':
      return (
        <>
          {bigEye(L, y, k, ink)}
          {bigEye(R, y, k, ink)}
        </>
      );
    case 'sparkle':
      return (
        <>
          {bigEye(L, y, k, ink, true)}
          {bigEye(R, y, k, ink, true)}
        </>
      );
    case 'sleepy':
      return (
        <>
          {arc(L, y - 1 * k, 6.8, 5.6, k, ink.ink, 3.5)}
          {arc(R, y - 1 * k, 6.8, 5.6, k, ink.ink, 3.5)}
          <path d={`M${f(L - 6.6 * k)} ${f(y - 0.6 * k)}l${f(-2.6 * k)} ${f(-1.4 * k)}M${f(R + 6.6 * k)} ${f(y - 0.6 * k)}l${f(2.6 * k)} ${f(-1.4 * k)}`} stroke={ink.ink} strokeWidth={2.4 * k} strokeLinecap="round" />
        </>
      );
    case 'happy':
      return (
        <>
          {arc(L, y + 3 * k, 7.2, -11, k, ink.ink, 3.7)}
          {arc(R, y + 3 * k, 7.2, -11, k, ink.ink, 3.7)}
        </>
      );
    case 'wink':
      return (
        <>
          {bead(L, y, 6.6, 8, k, ink)}
          {arc(R, y + 3 * k, 7.2, -11, k, ink.ink, 3.7)}
        </>
      );
    case 'star':
      return (
        <>
          {[L, R].map((cx) => (
            <g key={cx}>
              <path d={softStar(cx, y + 0.5 * k, 9.6 * k, 5.2 * k)} fill={ink.ink} />
              <circle cx={cx + 2.3 * k} cy={y - 1.8 * k} r={2.2 * k} fill={WHITE} />
              <circle cx={cx - 2.1 * k} cy={y + 2.6 * k} r={1 * k} fill={WHITE} />
            </g>
          ))}
        </>
      );
    case 'cyclops':
      return (
        <>
          <circle cx={x} cy={y - 1 * k} r={13.2 * k} fill={WHITE} stroke={ink.outline} strokeWidth={2.6 * k} />
          <circle cx={x + 0.6 * k} cy={y} r={8.8 * k} fill={ink.iris} />
          <circle cx={x + 0.6 * k} cy={y} r={5 * k} fill={ink.ink} />
          <circle cx={x + 3.8 * k} cy={y - 3.8 * k} r={3 * k} fill={WHITE} />
          <circle cx={x - 2.9 * k} cy={y + 3.1 * k} r={1.4 * k} fill={WHITE} />
        </>
      );
    case 'visor':
      return (
        <>
          <rect x={x - 27 * k} y={y - 8.6 * k} width={54 * k} height={17.2 * k} rx={8.6 * k} fill={ink.outline} />
          {[L + 2 * k, R - 2 * k].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy={y} rx={5.8 * k} ry={6.2 * k} fill={ink.iris} />
              <circle cx={cx + 2 * k} cy={y - 2.1 * k} r={1.9 * k} fill={WHITE} />
            </g>
          ))}
        </>
      );
    case 'curious':
      return (
        <>
          {bead(L, y + 1 * k, 5.2, 6.4, k, ink)}
          {bigEye(R, y, k, ink)}
        </>
      );
    case 'half':
      return (
        <>
          {halfEye(L, y, k, ink, -1)}
          {halfEye(R, y, k, ink, 1)}
        </>
      );
    case 'pixel':
      return (
        <>
          {pixelEye(L, y, k, ink)}
          {pixelEye(R, y, k, ink)}
        </>
      );
  }
}

const OPEN_EYES: ReadonlySet<GlimArt['eyes']> = new Set(['dot', 'big', 'sparkle', 'star', 'cyclops', 'curious', 'pixel', 'wink']);

export function Eyes({ kind, ctx }: { kind: GlimArt['eyes']; ctx: EyeCtx }) {
  const pair = <EyePair kind={kind} ctx={ctx} />;
  if (!ctx.blink || !OPEN_EYES.has(kind)) return pair;
  return (
    <g className="glim-blink" style={{ transformOrigin: `${ctx.x}px ${ctx.y}px` }}>
      {pair}
    </g>
  );
}

/* ------------------------------------------------------------------ */

export function Brows({ kind, eyes, ctx }: { kind: GlimArt['brows']; eyes: GlimArt['eyes']; ctx: EyeCtx }): ReactNode {
  const { x, y, gap, k, ink } = ctx;
  const single = eyes === 'cyclops' || eyes === 'visor';
  const by = y - (eyeTop(eyes) + 4.6) * k;
  // Brow paths for the right eye, centred on (ex, by); the left one mirrors it.
  const right = (ex: number): string | null => {
    switch (kind) {
      case 'soft':
        return `M${f(ex - 4.6 * k)} ${f(by + 1 * k)}Q${f(ex)} ${f(by - 2.2 * k)} ${f(ex + 4.6 * k)} ${f(by + 1 * k)}`;
      case 'determined':
        return `M${f(ex - 5 * k)} ${f(by + 2.2 * k)}Q${f(ex)} ${f(by - 0.4 * k)} ${f(ex + 4.8 * k)} ${f(by - 1.6 * k)}`;
      case 'worried':
        return `M${f(ex - 5 * k)} ${f(by - 2.2 * k)}Q${f(ex)} ${f(by - 1.2 * k)} ${f(ex + 4.6 * k)} ${f(by + 1.8 * k)}`;
      case 'surprised':
        return `M${f(ex - 4.6 * k)} ${f(by - 1.8 * k)}Q${f(ex)} ${f(by - 6.4 * k)} ${f(ex + 4.6 * k)} ${f(by - 1.8 * k)}`;
      case 'grumpy':
        return `M${f(ex - 5.6 * k)} ${f(by + 4 * k)}L${f(ex + 5 * k)} ${f(by - 0.8 * k)}`;
      default:
        return null;
    }
  };
  const mirror = (d: string) => d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (_, a: string, b: string) => `${f(2 * x - Number(a))} ${b}`);
  const stroke = { fill: 'none', stroke: ink.ink, strokeWidth: (kind === 'grumpy' ? 4 : 3.3) * k, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'smug') {
    const ex = single ? x + 5 * k : x + gap;
    const lx = single ? x - 5 * k : x - gap;
    return (
      <g {...stroke}>
        <path d={`M${f(ex - 4.6 * k)} ${f(by - 0.8 * k)}Q${f(ex)} ${f(by - 5 * k)} ${f(ex + 4.6 * k)} ${f(by - 0.6 * k)}`} />
        <path d={`M${f(lx - 4.6 * k)} ${f(by + 1.6 * k)}L${f(lx + 4.6 * k)} ${f(by + 1.4 * k)}`} />
      </g>
    );
  }
  if (kind === 'bushy') {
    const brow = (ex: number, dir: 1 | -1) => {
      const p = (dx: number, dy: number) => `${f(ex + dx * dir * k)} ${f(by + dy * k)}`;
      return `M${p(-6.5, 2.4)}Q${p(-7.5, -2.5)} ${p(-3.5, -2.8)}Q${p(-1.5, -5.6)} ${p(1.5, -3.6)}Q${p(5.5, -5)} ${p(7, -0.6)}Q${p(8, 2.6)} ${p(4.5, 2.2)}Q${p(0, 3.6)} ${p(-6.5, 2.4)}Z`;
    };
    return <path d={single ? brow(x, 1) : `${brow(x + gap, 1)}${brow(x - gap, -1)}`} fill={WHITE} stroke={ink.outline} strokeWidth={1.8 * k} strokeLinejoin="round" />;
  }
  if (kind === 'none' || kind === undefined) {
    // Curious eyes raise one brow on their own.
    if (eyes !== 'curious') return null;
    return <path d={`M${f(x + gap - 5 * k)} ${f(by - 1.6 * k)}Q${f(x + gap)} ${f(by - 5.6 * k)} ${f(x + gap + 5.6 * k)} ${f(by - 0.6 * k)}`} {...stroke} />;
  }
  // One big eye gets one brow across the middle, drawn as two mirrored halves.
  const d = right(single ? x + 5 * k : x + gap);
  if (!d) return null;
  return (
    <g {...stroke}>
      <path d={d} />
      <path d={mirror(d)} />
    </g>
  );
}

/* ------------------------------------------------------------------ */

export function Mouth({ kind, x, y, k, ink }: { kind: GlimArt['mouth']; x: number; y: number; k: number; ink: FaceInk }): ReactNode {
  const m = y;
  const line = { fill: 'none', stroke: ink.ink, strokeWidth: 3 * k, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const X = (dx: number) => f(x + dx * k);
  const Y = (dy: number) => f(m + dy * k);
  switch (kind) {
    case 'smile':
      return <path d={`M${X(-6.5)} ${Y(0)}Q${X(0)} ${Y(6.4)} ${X(6.5)} ${Y(0)}`} {...line} />;
    case 'grin':
      return (
        <>
          <path d={`M${X(-8)} ${Y(-1)}Q${X(0)} ${Y(1.6)} ${X(8)} ${Y(-1)}Q${X(7.4)} ${Y(9.6)} ${X(0)} ${Y(9.6)}Q${X(-7.4)} ${Y(9.6)} ${X(-8)} ${Y(-1)}Z`} fill={ink.ink} stroke={ink.ink} strokeWidth={1.4 * k} strokeLinejoin="round" />
          <path d={`M${X(-4.6)} ${Y(7.4)}Q${X(0)} ${Y(3)} ${X(4.6)} ${Y(7.4)}Q${X(0)} ${Y(9.4)} ${X(-4.6)} ${Y(7.4)}Z`} fill={TONGUE} />
        </>
      );
    case 'o':
      return (
        <>
          <ellipse cx={x} cy={m + 2.6 * k} rx={3.5 * k} ry={4.2 * k} fill={ink.ink} />
          <ellipse cx={x} cy={m + 4.6 * k} rx={2 * k} ry={1.3 * k} fill={TONGUE} />
        </>
      );
    case 'cat':
      return <path d={`M${X(-7)} ${Y(0)}Q${X(-3.5)} ${Y(4.8)} ${X(0)} ${Y(0.6)}Q${X(3.5)} ${Y(4.8)} ${X(7)} ${Y(0)}`} {...line} strokeWidth={2.8 * k} />;
    case 'tooth':
      return (
        <>
          <path d={`M${X(-3)} ${Y(2.6)}h${f(6 * k)}v${f(3.2 * k)}q0 ${f(1 * k)} ${f(-1 * k)} ${f(1 * k)}h${f(-4 * k)}q${f(-1 * k)} 0 ${f(-1 * k)} ${f(-1 * k)}Z`} fill={WHITE} stroke={ink.ink} strokeWidth={1.3 * k} strokeLinejoin="round" />
          <path d={`M${X(0)} ${Y(2.8)}v${f(3.6 * k)}`} stroke={ink.ink} strokeWidth={1.1 * k} />
          <path d={`M${X(-7)} ${Y(0)}Q${X(0)} ${Y(6)} ${X(7)} ${Y(0)}`} {...line} />
        </>
      );
    case 'tongue':
      return (
        <>
          <path d={`M${X(0.6)} ${Y(2.6)}q0 ${f(5.4 * k)} ${f(3.4 * k)} ${f(5.4 * k)}q${f(3.4 * k)} 0 ${f(3.4 * k)} ${f(-5.6 * k)}Z`} fill={TONGUE} stroke={ink.ink} strokeWidth={1.4 * k} strokeLinejoin="round" />
          <path d={`M${X(4)} ${Y(3.4)}v${f(2.6 * k)}`} stroke={TONGUE_DEEP} strokeWidth={1 * k} strokeLinecap="round" />
          <path d={`M${X(-7.5)} ${Y(0)}Q${X(0)} ${Y(6)} ${X(7.5)} ${Y(0)}`} {...line} />
        </>
      );
    case 'smirk':
      return <path d={`M${X(-6)} ${Y(1.8)}Q${X(1)} ${Y(4.8)} ${X(6.4)} ${Y(-1.6)}M${X(5)} ${Y(-2.6)}l${f(2.6 * k)} ${f(1.6 * k)}`} {...line} />;
    case 'fang':
      return (
        <>
          <path d={`M${X(1.2)} ${Y(2.6)}L${X(2.9)} ${Y(6.6)}L${X(4.6)} ${Y(2.1)}Z`} fill={WHITE} stroke={ink.ink} strokeWidth={1.3 * k} strokeLinejoin="round" />
          <path d={`M${X(-6.5)} ${Y(0)}Q${X(0)} ${Y(5.6)} ${X(6.5)} ${Y(0)}`} {...line} />
        </>
      );
    case 'toothy':
      return (
        <>
          <path d={`M${X(-9.5)} ${Y(-1.4)}Q${X(0)} ${Y(1.4)} ${X(9.5)} ${Y(-1.4)}Q${X(8.4)} ${Y(10)} ${X(0)} ${Y(10)}Q${X(-8.4)} ${Y(10)} ${X(-9.5)} ${Y(-1.4)}Z`} fill={ink.ink} stroke={ink.ink} strokeWidth={1.4 * k} strokeLinejoin="round" />
          <path d={`M${X(-8.6)} ${Y(-0.6)}Q${X(0)} ${Y(2.1)} ${X(8.6)} ${Y(-0.6)}L${X(8)} ${Y(2.6)}Q${X(0)} ${Y(5.2)} ${X(-8)} ${Y(2.6)}Z`} fill={WHITE} />
          <path d={`M${X(-3)} ${Y(0.8)}V${Y(4)}M${X(3)} ${Y(0.8)}V${Y(4)}`} stroke={ink.ink} strokeWidth={1.1 * k} />
          <path d={`M${X(-4.4)} ${Y(8.2)}Q${X(0)} ${Y(5)} ${X(4.4)} ${Y(8.2)}Q${X(0)} ${Y(9.8)} ${X(-4.4)} ${Y(8.2)}Z`} fill={TONGUE} />
        </>
      );
    case 'beak':
      return (
        <>
          <path d={`M${X(-5.4)} ${Y(-2.4)}Q${X(0)} ${Y(-4.4)} ${X(5.4)} ${Y(-2.4)}Q${X(2.4)} ${Y(4.8)} ${X(0)} ${Y(6.4)}Q${X(-2.4)} ${Y(4.8)} ${X(-5.4)} ${Y(-2.4)}Z`} fill="hsl(38 96% 60%)" stroke={ink.outline} strokeWidth={2 * k} strokeLinejoin="round" />
          <path d={`M${X(-3.6)} ${Y(0.2)}Q${X(0)} ${Y(1.6)} ${X(3.6)} ${Y(0.2)}`} fill="none" stroke={ink.outline} strokeWidth={1.2 * k} strokeLinecap="round" opacity={0.6} />
        </>
      );
    case 'yawn':
      return (
        <>
          <ellipse cx={x} cy={m + 3.6 * k} rx={4.9 * k} ry={6.4 * k} fill={ink.ink} />
          <ellipse cx={x} cy={m + 7.2 * k} rx={3.1 * k} ry={2.1 * k} fill={TONGUE} />
        </>
      );
    case 'wobble':
      return <path d={`M${X(-7.5)} ${Y(1.2)}q${f(1.9 * k)} ${f(-2.6 * k)} ${f(3.75 * k)} 0t${f(3.75 * k)} 0t${f(3.75 * k)} 0t${f(3.75 * k)} 0`} {...line} strokeWidth={2.7 * k} />;
    case 'none':
      return null;
  }
}

/* ------------------------------------------------------------------ */

/** The blush, under the eyes. Frosty Glims get icy cheeks with a glint. */
export function Cheeks({ geo, k, c, frosty, onScreen }: { geo: BodyGeometry; k: number; c: GlimColors; frosty: boolean; onScreen: boolean }) {
  const dx = geo.eyeGap + 6.8 * k;
  const y = geo.face.y + 11.2 * k;
  const { x } = geo.face;
  if (onScreen) {
    return (
      <g fill={c.blush} opacity={0.9}>
        <rect x={x - dx - 3.6 * k} y={y - 1.6 * k} width={7.2 * k} height={3.2 * k} rx={1.6 * k} />
        <rect x={x + dx - 3.6 * k} y={y - 1.6 * k} width={7.2 * k} height={3.2 * k} rx={1.6 * k} />
      </g>
    );
  }
  const fill = frosty ? 'hsl(194 95% 86%)' : c.blush;
  return (
    <>
      <g fill={fill} opacity={frosty ? 0.9 : 0.6}>
        <ellipse cx={x - dx} cy={y} rx={5.8 * k} ry={3.6 * k} />
        <ellipse cx={x + dx} cy={y} rx={5.8 * k} ry={3.6 * k} />
      </g>
      {frosty ? <path d={`${sparkle(x - dx + 2.4 * k, y - 1.4 * k, 2.4 * k)}${sparkle(x + dx + 2.4 * k, y - 1.4 * k, 2.4 * k)}`} fill={WHITE} /> : null}
    </>
  );
}

/** Things on the face that sit behind the eyes (screen, mask, snout, beard). */
export function FaceUnder({ kind, geo, k, c }: { kind: GlimArt['face']; geo: BodyGeometry; k: number; c: GlimColors }): ReactNode {
  const { x, y } = geo.face;
  const g = geo.eyeGap;
  switch (kind) {
    case 'screen':
      return (
        <>
          <rect x={x - g - 12.5 * k} y={y - 12.5 * k} width={2 * g + 25 * k} height={33 * k} rx={9 * k} fill={c.ink} stroke={c.outline} strokeWidth={2.4} />
          <path d={`M${f(x - g - 7 * k)} ${f(y - 8.5 * k)}h${f(9 * k)}`} stroke={WHITE} strokeWidth={2 * k} strokeLinecap="round" opacity={0.28} />
        </>
      );
    case 'mask':
      return (
        <path
          d={`M${f(x - g - 12 * k)} ${f(y - 3 * k)}Q${f(x)} ${f(y - 12 * k)} ${f(x + g + 12 * k)} ${f(y - 3 * k)}Q${f(x + g + 13 * k)} ${f(y + 7 * k)} ${f(x + g + 3 * k)} ${f(y + 7.5 * k)}Q${f(x)} ${f(y + 4 * k)} ${f(x - g - 3 * k)} ${f(y + 7.5 * k)}Q${f(x - g - 13 * k)} ${f(y + 7 * k)} ${f(x - g - 12 * k)} ${f(y - 3 * k)}Z`}
          fill={c.deep}
          stroke={c.outline}
          strokeWidth={1.6 * k}
          opacity={0.95}
        />
      );
    case 'snout':
      return (
        <>
          <ellipse cx={x} cy={y + 13.5 * k} rx={10.5 * k} ry={7.8 * k} fill={c.belly} stroke={c.outline} strokeWidth={1.8 * k} />
          <path d={`M${f(x - 3.4 * k)} ${f(y + 8.4 * k)}Q${f(x)} ${f(y + 7.2 * k)} ${f(x + 3.4 * k)} ${f(y + 8.4 * k)}Q${f(x + 1 * k)} ${f(y + 12 * k)} ${f(x)} ${f(y + 12 * k)}Q${f(x - 1 * k)} ${f(y + 12 * k)} ${f(x - 3.4 * k)} ${f(y + 8.4 * k)}Z`} fill={c.ink} />
        </>
      );
    case 'beard': {
      const top = y + 15 * k;
      return (
        <path
          d={`M${f(x - 15 * k)} ${f(top)}Q${f(x)} ${f(top - 5 * k)} ${f(x + 15 * k)} ${f(top)}Q${f(x + 16 * k)} ${f(top + 9 * k)} ${f(x + 9 * k)} ${f(top + 14 * k)}Q${f(x + 6 * k)} ${f(top + 20 * k)} ${f(x + 1 * k)} ${f(top + 18 * k)}Q${f(x - 4 * k)} ${f(top + 21 * k)} ${f(x - 7 * k)} ${f(top + 15 * k)}Q${f(x - 15 * k)} ${f(top + 12 * k)} ${f(x - 15 * k)} ${f(top)}Z`}
          fill={WHITE}
          stroke={c.outline}
          strokeWidth={1.8 * k}
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
        return <circle cx={x} cy={y - 1 * k} r={15 * k} fill={WHITE} fillOpacity={0.15} stroke={c.ink} strokeWidth={2.4 * k} />;
      }
      const r = 10.5 * k;
      return (
        <g fill={WHITE} fillOpacity={0.16} stroke={c.ink} strokeWidth={2.3 * k} strokeLinecap="round">
          <circle cx={x - g} cy={y} r={r} />
          <circle cx={x + g} cy={y} r={r} />
          <path d={`M${f(x - g + r)} ${f(y - 1 * k)}Q${f(x)} ${f(y - 4.5 * k)} ${f(x + g - r)} ${f(y - 1 * k)}`} fill="none" />
        </g>
      );
    }
    case 'whiskers': {
      const wx = g + 9 * k;
      const wy = y + 7 * k;
      const d = [-1, 1]
        .map((dir) => {
          const sx = x + dir * wx;
          return `M${f(sx)} ${f(wy)}l${f(dir * 12 * k)} ${f(-3 * k)}M${f(sx)} ${f(wy + 3.4 * k)}l${f(dir * 12.5 * k)} ${f(1 * k)}`;
        })
        .join('');
      return <path d={d} stroke={c.ink} strokeWidth={2.1 * k} strokeLinecap="round" opacity={0.8} />;
    }
    default:
      return null;
  }
}
