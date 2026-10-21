import { memo, useId } from 'react';
import type { AccessoryArt, GlimArt, Rarity } from '@ludora/shared';
import { BODIES, type BodyGeometry, type GlimColors } from './bodies.ts';
import { Accessory } from './accessories.tsx';

/*
 * Draws a Glim from its genome. Pure SVG, no images: every Glim in the
 * catalogue is generated from a few numbers and choices, so new Glims cost
 * a line of data, not an illustration.
 */

export function glimColors(art: GlimArt): GlimColors {
  const sat = art.saturation ?? 70;
  const light = sat < 35 ? 78 : 64;
  return {
    body: `hsl(${art.hue} ${sat}% ${light}%)`,
    outline: `hsl(${art.hue} ${Math.min(sat, 55)}% 20%)`,
    accent: `hsl(${art.accentHue} ${Math.max(sat, 45)}% ${sat < 35 ? 82 : 70}%)`,
    belly: `hsl(${art.hue} ${Math.round(sat * 0.6)}% ${Math.min(94, light + 18)}%)`,
    glow: `hsl(${art.accentHue} 100% 75%)`,
    ink: `hsl(${art.hue} 40% 14%)`,
  };
}

function Eyes({ kind, x, y, c }: { kind: GlimArt['eyes']; x: number; y: number; c: GlimColors }) {
  const L = x - 13;
  const R = x + 13;
  const pupil = (cx: number, r = 4) => (
    <>
      <circle cx={cx} cy={y} r={r} fill={c.ink} />
      <circle cx={cx + r * 0.35} cy={y - r * 0.4} r={r * 0.35} fill="#fff" />
    </>
  );
  switch (kind) {
    case 'dot':
      return (
        <>
          <circle cx={L} cy={y} r={3.6} fill={c.ink} />
          <circle cx={R} cy={y} r={3.6} fill={c.ink} />
        </>
      );
    case 'big':
      return (
        <>
          <circle cx={L} cy={y} r={7.5} fill="#fff" stroke={c.outline} strokeWidth={1.5} />
          <circle cx={R} cy={y} r={7.5} fill="#fff" stroke={c.outline} strokeWidth={1.5} />
          {pupil(L + 1, 4.2)}
          {pupil(R + 1, 4.2)}
        </>
      );
    case 'sleepy':
      return (
        <g fill="none" stroke={c.ink} strokeWidth={3} strokeLinecap="round">
          <path d={`M${L - 6} ${y} Q${L} ${y + 5} ${L + 6} ${y}`} />
          <path d={`M${R - 6} ${y} Q${R} ${y + 5} ${R + 6} ${y}`} />
        </g>
      );
    case 'happy':
      return (
        <g fill="none" stroke={c.ink} strokeWidth={3.2} strokeLinecap="round">
          <path d={`M${L - 6} ${y + 2} Q${L} ${y - 6} ${L + 6} ${y + 2}`} />
          <path d={`M${R - 6} ${y + 2} Q${R} ${y - 6} ${R + 6} ${y + 2}`} />
        </g>
      );
    case 'wink':
      return (
        <>
          <circle cx={L} cy={y} r={3.8} fill={c.ink} />
          <path d={`M${R - 6} ${y + 2} Q${R} ${y - 6} ${R + 6} ${y + 2}`} fill="none" stroke={c.ink} strokeWidth={3.2} strokeLinecap="round" />
        </>
      );
    case 'star': {
      const star = (cx: number) => `M${cx} ${y - 6}Q${cx + 1.2} ${y - 1.2} ${cx + 6} ${y}Q${cx + 1.2} ${y + 1.2} ${cx} ${y + 6}Q${cx - 1.2} ${y + 1.2} ${cx - 6} ${y}Q${cx - 1.2} ${y - 1.2} ${cx} ${y - 6}Z`;
      return <path d={`${star(L)} ${star(R)}`} fill={c.ink} />;
    }
    case 'cyclops':
      return (
        <>
          <circle cx={x} cy={y - 1} r={10.5} fill="#fff" stroke={c.outline} strokeWidth={1.8} />
          <circle cx={x + 1} cy={y - 1} r={6} fill={c.ink} />
          <circle cx={x + 3} cy={y - 4} r={2} fill="#fff" />
        </>
      );
    case 'visor':
      return (
        <>
          <rect x={x - 22} y={y - 6} width={44} height={12} rx={6} fill={c.ink} />
          <rect x={x - 18} y={y - 3} width={36} height={6} rx={3} fill={c.glow} opacity={0.95} />
          <circle cx={L} cy={y} r={2} fill="#fff" />
          <circle cx={R} cy={y} r={2} fill="#fff" />
        </>
      );
    case 'sparkle':
      return (
        <>
          <circle cx={L} cy={y} r={7} fill={c.ink} />
          <circle cx={R} cy={y} r={7} fill={c.ink} />
          {[L, R].map((cx) => (
            <g key={cx} fill="#fff">
              <path d={`M${cx + 2.5} ${y - 5}Q${cx + 3} ${y - 3} ${cx + 5} ${y - 2.5}Q${cx + 3} ${y - 2} ${cx + 2.5} ${y}Q${cx + 2} ${y - 2} ${cx} ${y - 2.5}Q${cx + 2} ${y - 3} ${cx + 2.5} ${y - 5}Z`} />
              <circle cx={cx - 2.5} cy={y + 2.5} r={1.4} />
            </g>
          ))}
        </>
      );
    case 'curious':
      return (
        <>
          <circle cx={L} cy={y + 1} r={4} fill={c.ink} />
          <circle cx={R} cy={y} r={6.5} fill="#fff" stroke={c.outline} strokeWidth={1.5} />
          {pupil(R + 1, 3.6)}
          <path d={`M${R - 6} ${y - 11} Q${R} ${y - 15} ${R + 7} ${y - 10}`} fill="none" stroke={c.ink} strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
  }
}

function Mouth({ kind, x, y, c }: { kind: GlimArt['mouth']; x: number; y: number; c: GlimColors }) {
  const m = y + 13;
  const line = { fill: 'none', stroke: c.ink, strokeWidth: 2.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'smile':
      return <path d={`M${x - 7} ${m} Q${x} ${m + 6} ${x + 7} ${m}`} {...line} />;
    case 'grin':
      return (
        <>
          <path d={`M${x - 9} ${m - 1} Q${x} ${m + 12} ${x + 9} ${m - 1}Z`} fill={c.ink} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />
          <path d={`M${x - 4} ${m + 5} Q${x} ${m + 2} ${x + 4} ${m + 5} Q${x} ${m + 8} ${x - 4} ${m + 5}Z`} fill="#ff8aa6" />
        </>
      );
    case 'o':
      return <ellipse cx={x} cy={m + 2} rx={3.6} ry={4.4} fill={c.ink} />;
    case 'cat':
      return <path d={`M${x - 8} ${m} Q${x - 4} ${m + 5} ${x} ${m} Q${x + 4} ${m + 5} ${x + 8} ${m}`} {...line} />;
    case 'tooth':
      return (
        <>
          <path d={`M${x - 8} ${m} Q${x} ${m + 7} ${x + 8} ${m}`} {...line} />
          <rect x={x - 3} y={m + 2} width={6} height={4.5} rx={1} fill="#fff" stroke={c.ink} strokeWidth={1.2} />
        </>
      );
    case 'tongue':
      return (
        <>
          <path d={`M${x + 1} ${m + 2} q0 7 4.5 7 q4.5 0 4.5 -7Z`} fill="#ff8aa6" stroke={c.ink} strokeWidth={1.4} />
          <path d={`M${x - 8} ${m} Q${x} ${m + 6} ${x + 8} ${m}`} {...line} />
        </>
      );
    case 'smirk':
      return <path d={`M${x - 7} ${m + 1} Q${x + 2} ${m + 4} ${x + 8} ${m - 3}`} {...line} />;
    case 'none':
      return null;
  }
}

function Pattern({ kind, geo, c }: { kind: GlimArt['pattern']; geo: BodyGeometry; c: GlimColors }) {
  const { x, y } = geo.face;
  switch (kind) {
    case 'spots':
      return (
        <g fill={c.accent} opacity={0.85}>
          <circle cx={x - 26} cy={y - 14} r={6} />
          <circle cx={x + 28} cy={y + 6} r={7} />
          <circle cx={x - 20} cy={y + 26} r={5} />
          <circle cx={x + 14} cy={y - 26} r={4} />
          <circle cx={x + 6} cy={y + 32} r={4.5} />
        </g>
      );
    case 'stripes':
      return (
        <g fill="none" stroke={c.accent} strokeWidth={6} opacity={0.75} strokeLinecap="round">
          <path d={`M${x - 50} ${y - 22} Q${x} ${y - 30} ${x + 50} ${y - 22}`} />
          <path d={`M${x - 50} ${y + 22} Q${x} ${y + 14} ${x + 50} ${y + 22}`} />
          <path d={`M${x - 50} ${y + 36} Q${x} ${y + 28} ${x + 50} ${y + 36}`} />
        </g>
      );
    case 'belly':
      return <ellipse cx={x} cy={y + 26} rx={22} ry={18} fill={c.belly} opacity={0.95} />;
    case 'freckles':
      return (
        <g fill={c.outline} opacity={0.45}>
          {[-24, -20, -26, 20, 24, 26].map((dx, i) => (
            <circle key={i} cx={x + dx} cy={y + 8 + (i % 3) * 3} r={1.3} />
          ))}
        </g>
      );
    case 'stars':
      return (
        <g fill={c.glow} opacity={0.9}>
          {[
            [-28, -12, 4],
            [26, -18, 3],
            [30, 18, 4.5],
            [-22, 24, 3],
            [4, 34, 3.5],
          ].map(([dx, dy, r], i) => (
            <path
              key={i}
              d={`M${x + dx!} ${y + dy! - r!}Q${x + dx! + r! * 0.25} ${y + dy! - r! * 0.25} ${x + dx! + r!} ${y + dy!}Q${x + dx! + r! * 0.25} ${y + dy! + r! * 0.25} ${x + dx!} ${y + dy! + r!}Q${x + dx! - r! * 0.25} ${y + dy! + r! * 0.25} ${x + dx! - r!} ${y + dy!}Q${x + dx! - r! * 0.25} ${y + dy! - r! * 0.25} ${x + dx!} ${y + dy! - r!}Z`}
            />
          ))}
        </g>
      );
    case 'patch':
      return <path d={`M${x + 8} ${y - 34}C${x + 34} ${y - 34} ${x + 50} ${y - 10} ${x + 44} ${y + 12}C${x + 30} ${y + 8} ${x + 14} ${y - 8} ${x + 8} ${y - 34}Z`} fill={c.accent} opacity={0.8} />;
    case 'none':
      return null;
  }
}

function Topper({ kind, geo, c }: { kind: GlimArt['topper']; geo: BodyGeometry; c: GlimColors }) {
  const { x, y } = geo.top;
  const st = { stroke: c.outline, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'antenna':
      return (
        <>
          <path d={`M${x} ${y + 2} Q${x + 3} ${y - 9} ${x + 1} ${y - 15}`} fill="none" {...st} />
          <circle cx={x + 1} cy={y - 18} r={5} fill={c.glow} {...st} strokeWidth={2.5} />
        </>
      );
    case 'leaf':
      return <path d={`M${x} ${y + 2}C${x - 2} ${y - 6} ${x + 4} ${y - 16} ${x + 16} ${y - 18}C${x + 16} ${y - 8} ${x + 10} ${y} ${x} ${y + 2}Z`} fill={c.accent} {...st} />;
    case 'horns':
      return (
        <>
          <path d={`M${x - 16} ${y + 6}C${x - 22} ${y - 2} ${x - 22} ${y - 10} ${x - 18} ${y - 16}C${x - 14} ${y - 8} ${x - 10} ${y - 2} ${x - 8} ${y + 4}Z`} fill={c.accent} {...st} />
          <path d={`M${x + 16} ${y + 6}C${x + 22} ${y - 2} ${x + 22} ${y - 10} ${x + 18} ${y - 16}C${x + 14} ${y - 8} ${x + 10} ${y - 2} ${x + 8} ${y + 4}Z`} fill={c.accent} {...st} />
        </>
      );
    case 'flame':
      return <path d={`M${x} ${y - 20}C${x + 4} ${y - 12} ${x + 10} ${y - 10} ${x + 9} ${y - 2}C${x + 8} ${y + 4} ${x + 3} ${y + 5} ${x} ${y + 5}C${x - 3} ${y + 5} ${x - 8} ${y + 4} ${x - 9} ${y - 2}C${x - 10} ${y - 8} ${x - 3} ${y - 10} ${x} ${y - 20}Z`} fill="#ffb020" {...st} />;
    case 'halo':
      return <ellipse cx={x} cy={y - 10} rx={geo.headW * 0.38} ry={4.5} fill="none" stroke={c.glow} strokeWidth={4} />;
    case 'tuft':
      return (
        <g fill="none" {...st} strokeWidth={3.2}>
          <path d={`M${x} ${y + 2} Q${x - 2} ${y - 8} ${x - 8} ${y - 12}`} />
          <path d={`M${x} ${y + 2} Q${x + 1} ${y - 10} ${x + 2} ${y - 15}`} />
          <path d={`M${x} ${y + 2} Q${x + 4} ${y - 8} ${x + 10} ${y - 10}`} />
        </g>
      );
    case 'spikes':
      return <path d={`M${x - 16} ${y + 6}L${x - 11} ${y - 8}L${x - 5} ${y + 3}L${x} ${y - 11}L${x + 5} ${y + 3}L${x + 11} ${y - 8}L${x + 16} ${y + 6}Z`} fill={c.accent} {...st} />;
    case 'bolt':
      return <path d={`M${x + 3} ${y - 22}L${x - 7} ${y - 6}H${x}L${x - 4} ${y + 6}L${x + 9} ${y - 10}H${x + 2}Z`} fill="#ffd23f" {...st} strokeWidth={2.5} />;
    case 'bud':
      return (
        <>
          <path d={`M${x} ${y + 2} V${y - 8}`} fill="none" {...st} />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={x + 6 * Math.cos(((a - 90) * Math.PI) / 180)} cy={y - 13 + 6 * Math.sin(((a - 90) * Math.PI) / 180)} r={4.2} fill={c.accent} stroke={c.outline} strokeWidth={1.8} />
          ))}
          <circle cx={x} cy={y - 13} r={3.2} fill="#ffd23f" stroke={c.outline} strokeWidth={1.5} />
        </>
      );
    case 'none':
      return null;
  }
}

const AURA: Partial<Record<Rarity, string>> = {
  uncommon: 'var(--r-uncommon)',
  rare: 'var(--r-rare)',
  epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)',
  mythic: 'var(--r-mythic)',
};

export interface GlimProps {
  art: GlimArt;
  accessories?: AccessoryArt[] | undefined;
  size?: number;
  /** Rarity glow behind the Glim (collection and reveal views). */
  aura?: Rarity | null;
  /** Gentle idle bob. Respects reduced motion through CSS. */
  bob?: boolean;
  /** Draw as a dark silhouette (not yet collected). */
  silhouette?: boolean;
  title?: string;
  className?: string;
}

export const Glim = memo(function Glim({ art, accessories, size = 96, aura = null, bob = false, silhouette = false, title, className }: GlimProps) {
  const uid = useId().replace(/:/g, '');
  const geo = BODIES[art.body] ?? BODIES.blob;
  const c = glimColors(art);
  const sc: GlimColors = silhouette ? { body: 'var(--surface-3)', outline: 'var(--line-strong)', accent: 'var(--surface-3)', belly: 'var(--surface-3)', glow: 'var(--surface-3)', ink: 'var(--line-strong)' } : c;
  const auraColor = aura && !silhouette ? AURA[aura] : undefined;
  const clip = `glim-clip-${uid}`;
  // Hats need headroom: shrink the whole Glim a little towards its feet so tall hats are not clipped.
  const hasHat = Boolean(accessories?.some((a) => a.slot === 'hat'));
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clip}>
          <path d={geo.path} />
        </clipPath>
        {auraColor ? (
          <radialGradient id={`aura-${uid}`}>
            <stop offset="0%" stopColor={auraColor} stopOpacity={aura === 'legendary' || aura === 'mythic' ? 0.75 : 0.5} />
            <stop offset="100%" stopColor={auraColor} stopOpacity={0} />
          </radialGradient>
        ) : null}
      </defs>
      {auraColor ? <circle cx="60" cy="62" r="58" fill={`url(#aura-${uid})`} /> : null}
      <ellipse cx="60" cy="108" rx="30" ry="5" fill="var(--ink)" opacity={0.18} />
      <g transform={hasHat ? 'translate(60 108) scale(0.84) translate(-60 -108)' : undefined}>
      <g style={bob ? { animation: 'glim-bob 3.2s ease-in-out infinite', transformOrigin: '60px 100px' } : undefined}>
        {geo.back?.(sc).map((s, i) => <path key={i} d={s.d} fill={s.fill} stroke={s.stroke ?? sc.outline} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />)}
        <path d={geo.path} fill={sc.body} />
        {!silhouette ? (
          <g clipPath={`url(#${clip})`}>
            <Pattern kind={art.pattern ?? 'none'} geo={geo} c={c} />
            <ellipse cx={geo.face.x - 18} cy={geo.face.y - 22} rx={9} ry={5.5} fill="#fff" opacity={0.35} transform={`rotate(-25 ${geo.face.x - 18} ${geo.face.y - 22})`} />
          </g>
        ) : null}
        <path d={geo.path} fill="none" stroke={sc.outline} strokeWidth={3.2} strokeLinejoin="round" />
        {geo.front?.(sc).map((s, i) => <path key={i} d={s.d} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth ?? 0} strokeLinejoin="round" strokeLinecap="round" />)}
        <Topper kind={art.topper ?? 'none'} geo={geo} c={sc} />
        {!silhouette ? (
          <>
            <Eyes kind={art.eyes} x={geo.face.x} y={geo.face.y} c={c} />
            <Mouth kind={art.mouth} x={geo.face.x} y={geo.face.y} c={c} />
            {art.cheeks !== false ? (
              <g fill="#ff7f9c" opacity={0.45}>
                <ellipse cx={geo.face.x - 22} cy={geo.face.y + 9} rx={5} ry={3} />
                <ellipse cx={geo.face.x + 22} cy={geo.face.y + 9} rx={5} ry={3} />
              </g>
            ) : null}
            {accessories?.map((a, i) => <Accessory key={`${a.slot}-${i}`} art={a} geo={geo} />)}
          </>
        ) : null}
      </g>
      </g>
    </svg>
  );
});
