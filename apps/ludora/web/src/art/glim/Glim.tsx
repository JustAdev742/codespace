import { memo, useId, useMemo, type ReactNode } from 'react';
import type { AccessoryArt, GlimArt, Rarity } from '@ludora/shared';
import { BODIES, type BodyGeometry, type GlimColors, type Part } from './bodies.ts';
import { Accessory } from './accessories.tsx';
import { Brows, Cheeks, Eyes, FaceOver, FaceUnder, Mouth, type FaceInk } from './face.tsx';
import { FINE_PATTERNS, Pattern } from './patterns.tsx';
import { armParts, backParts, BIG_BACKS, earParts, feetParts, tailParts, topperParts, type Pose } from './parts.ts';
import { pathBounds, sparkle } from './geometry.ts';

/*
 * Draws a Glim from its genome. Pure SVG, no images: every Glim in the
 * catalogue is generated from a few numbers and choices, so new Glims cost
 * a line of data, not an illustration.
 *
 * The look is a die-cut sticker: every shape is drawn once as a thick outer
 * contour in a dark tint of the Glim's hue, then again with its flat fill and
 * a fine inner line. Inside the body there is one cel-shade crescent at the
 * lower right and one soft highlight at the upper left. Rarity adds finishes
 * on top: a pattern accent, gloss and sparkles, a two-tone body, a gold rim
 * light with a halo and motes, and an iridescent sheen.
 */

export type GlimPose = Pose;

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(Math.max(0, Math.min(100, s)))}% ${Math.round(Math.max(0, Math.min(100, l)))}%)`;

/** Shadows lean towards blue and purple, which reads warmer than plain darkening. */
function deepHue(h: number) {
  return h > 70 && h < 260 ? h + 10 : h - 10;
}

export function glimColors(art: GlimArt): GlimColors {
  const sat = art.saturation ?? 70;
  const h = art.hue;
  const ah = art.accentHue;
  const pale = sat < 35;
  // Pale Glims get a little more colour than their number says, so they still read as stickers.
  const s = pale ? sat + 12 : sat;
  const L = pale ? 82 - sat * 0.2 : 63 + (h >= 200 && h <= 290 ? 3 : 0);
  return {
    body: hsl(h, s, L),
    deep: hsl(deepHue(h), s + 4, L - 14),
    outline: hsl(h, Math.min(62, Math.max(24, sat * 0.8)), 21),
    accent: hsl(ah, Math.max(sat, 62), 66),
    accentDeep: hsl(ah, Math.max(sat, 50), 38),
    belly: hsl(h, s * 0.6, Math.min(95, L + 22)),
    glow: hsl(ah, 100, 76),
    ink: hsl(h, 45, 13),
    blush: 'hsl(350 95% 74%)',
    second: hsl(ah + 120, Math.max(sat, 62), 70),
  };
}

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

const AURA: Partial<Record<Rarity, string>> = {
  uncommon: 'var(--r-uncommon)',
  rare: 'var(--r-rare)',
  epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)',
  mythic: 'var(--r-mythic)',
};

const SILHOUETTE: GlimColors = {
  body: 'var(--surface-3)',
  deep: 'var(--surface-3)',
  outline: 'var(--line-strong)',
  accent: 'var(--surface-3)',
  accentDeep: 'var(--surface-3)',
  belly: 'var(--surface-3)',
  glow: 'var(--surface-3)',
  ink: 'var(--line-strong)',
  blush: 'var(--surface-3)',
  second: 'var(--surface-3)',
};

const GOLD_RIM = 'hsl(45 100% 70%)';
const MOTION_CSS = `@keyframes glim-wave{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-26deg)}}@keyframes glim-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}@keyframes glim-mote{0%{transform:translateY(4px);opacity:0}25%{opacity:1}100%{transform:translateY(-10px);opacity:0}}@keyframes glim-sheen{from{transform:translateX(-44px)}to{transform:translateX(44px)}}@keyframes glim-spin{to{transform:rotate(360deg)}}.glim-wave{animation:glim-wave 1.3s ease-in-out infinite}.glim-blink{animation:glim-blink 5.4s infinite}.glim-mote{animation:glim-mote 3.6s ease-in-out infinite}.glim-sheen{animation:glim-sheen 4.8s ease-in-out infinite alternate}.glim-rays{animation:glim-spin 40s linear infinite}@media (prefers-reduced-motion:reduce){:root:not([data-motion='on']) :is(.glim-wave,.glim-blink,.glim-mote,.glim-sheen,.glim-rays){animation:none}}:root[data-motion='off'] :is(.glim-wave,.glim-blink,.glim-mote,.glim-sheen,.glim-rays){animation:none}`;

export interface GlimProps {
  art: GlimArt;
  accessories?: AccessoryArt[] | undefined;
  size?: number;
  /** Rarity glow behind the Glim (collection and reveal views). Also sets the finish when `rarity` is not given. */
  aura?: Rarity | null;
  /** Rarity finish: gloss, sparkles, two-tone body, gold rim light, iridescence. Defaults to `aura`. */
  rarity?: Rarity | null | undefined;
  /** Arm pose: 'wave' to greet, 'cheer' (arms up) for reveals and podiums. */
  pose?: GlimPose | undefined;
  /**
   * Gentle idle bob for featured Glims (reveals, profiles, lobbies). Also turns on the decorative motion:
   * a blink now and then, floating motes and slowly turning rays on legendaries, the sheen on mythics.
   * All of it stops under reduced motion.
   */
  bob?: boolean;
  /** Draw as one dark shape (not yet collected). */
  silhouette?: boolean;
  title?: string;
  className?: string;
}

interface Built {
  geo: BodyGeometry;
  back: Part[];
  front: Part[];
  /** Scale (around the feet) that keeps every part inside the box. */
  fit: number;
}

/** The feet stay put when a Glim is scaled to fit: everything shrinks towards this point. */
const GROUND = { x: 60, y: 109 };
const MARGIN = 2.5;

function fitScale(parts: Part[]): number {
  let s = 1;
  for (const p of parts) {
    const [x0, y0, x1] = pathBounds(p.d);
    const pad = (p.line ? p.line / 2 : 0) + 3.2;
    if (y0 - pad < MARGIN) s = Math.min(s, (GROUND.y - MARGIN) / (GROUND.y - (y0 - pad)));
    if (x0 - pad < MARGIN) s = Math.min(s, (GROUND.x - MARGIN) / (GROUND.x - (x0 - pad)));
    if (x1 + pad > 120 - MARGIN) s = Math.min(s, (120 - MARGIN - GROUND.x) / (x1 + pad - GROUND.x));
  }
  return s;
}

function build(art: GlimArt, c: GlimColors, pose: Pose, hideTopper: boolean): Built {
  const geo = BODIES[art.body] ?? BODIES.blob;
  const ears = earParts(art.ears ?? 'none', geo, c);
  const backs = backParts(art.back ?? 'none', geo, c);
  const bigBack = BIG_BACKS.includes(art.back ?? 'none');
  const ringed = art.ears === 'mane' || art.ears === 'petals';
  const back: Part[] = [
    ...(bigBack ? backs : []),
    ...(ringed ? ears.behind : []),
    ...tailParts(art.tail ?? 'none', geo, c),
    ...(bigBack ? [] : backs),
    ...(ringed ? [] : ears.behind),
    ...(geo.back?.(c) ?? []),
    ...feetParts(geo, c),
  ];
  const front: Part[] = [...armParts(geo, c, pose), ...(geo.front?.(c) ?? []), ...ears.front, ...(hideTopper ? [] : topperParts(art.topper ?? 'none', geo, c))];
  return { geo, back, front, fit: fitScale([...back, ...front]) };
}

function ContourPass({ parts, color, width }: { parts: Part[]; color: string; width: number }) {
  return (
    <g fill={color} stroke={color} strokeLinejoin="round" strokeLinecap="round">
      {parts.map((p, i) =>
        p.flat || p.stalk ? null : (
          <path
            key={i}
            d={p.d}
            fill={p.line ? 'none' : color}
            strokeWidth={p.line ? p.line + width : width}
            fillRule={p.evenodd ? 'evenodd' : undefined}
            className={p.anim?.cls}
            style={p.anim ? { transformOrigin: p.anim.origin } : undefined}
          />
        ),
      )}
    </g>
  );
}

function FillPass({ parts, line, width, silhouette, silhouetteFill }: { parts: Part[]; line: string; width: number; silhouette: boolean; silhouetteFill: string }) {
  return (
    <>
      {parts.map((p, i) => {
        if (silhouette && p.flat) return null;
        const anim = p.anim ? { className: p.anim.cls, style: { transformOrigin: p.anim.origin } } : {};
        if (p.line) {
          return <path key={i} d={p.d} fill="none" stroke={silhouette && !p.stalk ? silhouetteFill : p.fill} strokeWidth={p.line} strokeLinecap="round" strokeLinejoin="round" opacity={silhouette ? undefined : p.opacity} {...anim} />;
        }
        return (
          <path
            key={i}
            d={p.d}
            fill={silhouette ? silhouetteFill : p.fill}
            fillRule={p.evenodd ? 'evenodd' : undefined}
            stroke={silhouette || p.flat ? 'none' : line}
            strokeWidth={width}
            strokeLinejoin="round"
            opacity={silhouette ? undefined : p.opacity}
            {...anim}
          />
        );
      })}
    </>
  );
}

/** Second colour of a two-tone body: the hue leans towards the accent, at most 50 degrees. */
function twoTone(art: GlimArt): string {
  const sat = art.saturation ?? 70;
  let delta = ((art.accentHue - art.hue + 540) % 360) - 180;
  delta = Math.max(-50, Math.min(50, delta === 0 ? 30 : delta));
  const pale = sat < 35;
  return hsl(art.hue + delta, (pale ? sat + 12 : sat) + 8, pale ? 74 : 56);
}

export const Glim = memo(function Glim({ art, accessories, size = 96, aura = null, rarity, pose = 'idle', bob = false, silhouette = false, title, className }: GlimProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const c = useMemo(() => glimColors(art), [art]);
  const hasHat = Boolean(accessories?.some((a) => a.slot === 'hat'));
  const hasEyewear = Boolean(accessories?.some((a) => a.slot === 'eyes'));
  const sc = silhouette ? SILHOUETTE : c;
  const { geo, back, front, fit } = useMemo(() => build(art, sc, pose, hasHat), [art, sc, pose, hasHat]);

  const tiny = size <= 40;
  const finish: Rarity = silhouette ? 'common' : (rarity ?? aura ?? 'common');
  const rank = RANK[finish];
  const contourW = silhouette ? 8 : tiny ? 8.4 : 6.4;
  const innerW = tiny ? 3.2 : 2.6;
  const k = geo.eyeScale * (tiny ? 1.08 : 1);
  const auraColor = aura && !silhouette ? AURA[aura] : undefined;
  const legendary = rank >= 4;
  const mythic = rank >= 5;
  // Decorative motion (blinks, motes, rays, sheen) only runs on featured Glims, the ones callers ask to bob,
  // so a page of 112 collection tiles stays still and cheap to paint. Waving is part of the pose, so it always runs.
  const lively = bob && !silhouette && !tiny;
  const blink = lively;
  const animated = !silhouette && (pose === 'wave' || lively);

  const id = (name: string) => `glim-${name}-${uid}`;
  const bodyFill = rank >= 3 ? `url(#${id('tone')})` : (geo.fill?.(c) ?? c.body);
  const onScreen = art.face === 'screen';
  const ink: FaceInk = onScreen ? { ink: c.glow, iris: c.accent, outline: c.ink } : { ink: c.ink, iris: `hsl(${art.accentHue} 90% 66%)`, outline: c.outline };
  const eyeCtx = { x: geo.face.x, y: geo.face.y, gap: geo.eyeGap, k, ink, blink };
  const mouthY = geo.face.y + (art.face === 'snout' ? 15.5 : art.face === 'beard' ? 14 : 13) * k;
  const [x0, , x1] = geo.box;
  const legendGlow = legendary && !auraColor;

  const shadeClip = `M-200 -200H320V320H-200Z${geo.path}`;

  let interior: ReactNode = null;
  if (!silhouette) {
    interior = (
      <g clipPath={`url(#${id('clip')})`}>
        {geo.fill && rank >= 3 ? <path d={geo.path} fill={geo.fill(c)} opacity={0.55} /> : null}
        {geo.crust ? <path d={geo.path} fill="none" stroke={rank >= 3 ? `url(#${id('tone')})` : c.body} strokeWidth={geo.crust} /> : null}
        {geo.marks?.(c).map((m, i) =>
          m.line ? <path key={i} d={m.d} fill="none" stroke={m.fill} strokeWidth={m.line} strokeLinecap="round" opacity={m.opacity} /> : <path key={i} d={m.d} fill={m.fill} opacity={m.opacity} />,
        )}
        {rank === 1 && !tiny ? <PrintAccent geo={geo} clip={id('trim')} /> : null}
        {tiny && FINE_PATTERNS.has(art.pattern ?? 'none') ? null : <Pattern kind={art.pattern ?? 'none'} geo={geo} c={c} />}
        <rect x={-10} y={-10} width={140} height={140} fill={c.outline} opacity={0.2} clipPath={`url(#${id('shade')})`} />
        {legendary ? <rect x={-10} y={-10} width={140} height={140} fill={mythic ? `url(#${id('iri')})` : GOLD_RIM} clipPath={`url(#${id('rim')})`} opacity={0.95} /> : null}
        {mythic ? (
          <g className={lively ? 'glim-sheen' : undefined}>
            <rect x={x0 - 30} y={-10} width={(x1 - x0) * 0.7} height={140} fill={`url(#${id('sheen')})`} opacity={0.5} transform={`rotate(18 60 60)`} />
          </g>
        ) : null}
        {art.cheeks !== false && !onScreen ? <Cheeks geo={geo} k={k} c={c} frosty={art.face === 'frosty'} onScreen={false} /> : null}
        <ellipse cx={geo.hl[0]} cy={geo.hl[1]} rx={geo.hl[2] * (rank >= 2 ? 1.25 : 1)} ry={geo.hl[3] * (rank >= 2 ? 1.25 : 1)} transform={`rotate(${geo.hl[4]} ${geo.hl[0]} ${geo.hl[1]})`} fill={`url(#${id('hl')})`} />
        {rank >= 2 ? (
          <>
            <ellipse cx={geo.hl[0] - 0.5} cy={geo.hl[1] - 0.5} rx={geo.hl[2] * 0.5} ry={geo.hl[3] * 0.42} transform={`rotate(${geo.hl[4]} ${geo.hl[0]} ${geo.hl[1]})`} fill="#fff" opacity={0.95} />
            <circle cx={geo.hl[0] + geo.hl[2] * 1.15} cy={geo.hl[1] + geo.hl[3] * 0.9} r={1.6} fill="#fff" opacity={0.9} />
          </>
        ) : null}
      </g>
    );
  }

  // Hats need headroom, and so do tall ears and toppers: shrink the whole Glim towards its feet so nothing is clipped.
  const scale = Math.min(fit, hasHat ? 0.84 : 1);
  const shrink = scale < 1 ? `translate(${GROUND.x} ${GROUND.y}) scale(${scale.toFixed(3)}) translate(${-GROUND.x} ${-GROUND.y})` : undefined;

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {animated ? <style>{MOTION_CSS}</style> : null}
      <defs>
        <clipPath id={id('clip')}>
          <path d={geo.path} />
        </clipPath>
        {!silhouette ? (
          <>
            <clipPath id={id('shade')}>
              <path d={shadeClip} clipRule="evenodd" transform="translate(-5 -6)" />
            </clipPath>
            <radialGradient id={id('hl')}>
              <stop offset="0%" stopColor="#fff" stopOpacity={rank >= 2 ? 0.95 : 0.8} />
              <stop offset="60%" stopColor="#fff" stopOpacity={rank >= 2 ? 0.55 : 0.4} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0} />
            </radialGradient>
          </>
        ) : null}
        {rank === 1 && !tiny ? (
          <clipPath id={id('trim')}>
            <rect x={0} y={Math.min(geo.face.y + 13, geo.box[3] - (geo.box[3] - geo.box[1]) * 0.3)} width={120} height={120} />
          </clipPath>
        ) : null}
        {rank >= 3 ? (
          <linearGradient id={id('tone')} x1="0.15" y1="0" x2="0.6" y2="1">
            <stop offset="0.25" stopColor={c.body} />
            <stop offset="1" stopColor={twoTone(art)} />
          </linearGradient>
        ) : null}
        {legendary ? (
          <clipPath id={id('rim')}>
            <path d={shadeClip} clipRule="evenodd" transform="translate(-2.4 -2.8)" />
          </clipPath>
        ) : null}
        {mythic ? (
          <>
            <linearGradient id={id('iri')} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="hsl(320 100% 78%)" />
              <stop offset="0.5" stopColor="hsl(190 100% 72%)" />
              <stop offset="1" stopColor="hsl(55 100% 72%)" />
            </linearGradient>
            <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity={0} />
              <stop offset="0.2" stopColor="hsl(320 100% 80%)" />
              <stop offset="0.4" stopColor="hsl(55 100% 80%)" />
              <stop offset="0.6" stopColor="hsl(160 100% 76%)" />
              <stop offset="0.8" stopColor="hsl(220 100% 80%)" />
              <stop offset="1" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </>
        ) : null}
        {auraColor || legendGlow ? (
          <radialGradient id={id('aura')}>
            <stop offset="0%" stopColor={auraColor ?? (mythic ? 'var(--r-mythic)' : 'var(--r-legendary)')} stopOpacity={legendary ? 0.7 : 0.45} />
            <stop offset="55%" stopColor={auraColor ?? (mythic ? 'var(--r-mythic)' : 'var(--r-legendary)')} stopOpacity={legendary ? 0.28 : 0.16} />
            <stop offset="100%" stopColor={auraColor ?? (mythic ? 'var(--r-mythic)' : 'var(--r-legendary)')} stopOpacity={0} />
          </radialGradient>
        ) : null}
      </defs>
      {auraColor || legendGlow ? <circle cx="60" cy="64" r="58" fill={`url(#${id('aura')})`} /> : null}
      {legendary && !tiny ? <Rays mythic={mythic} spin={lively} id={id('rays')} /> : null}
      <ellipse cx="60" cy="109" rx="28" ry="4.6" fill="var(--ink)" opacity={0.18} />
      <g transform={shrink}>
        <g style={bob ? { animation: 'glim-bob 3.2s ease-in-out infinite', transformOrigin: '60px 100px' } : undefined}>
          <ContourPass parts={[...back, { d: geo.path, fill: '' }, ...front]} color={sc.outline} width={contourW} />
          <FillPass parts={back} line={sc.outline} width={innerW} silhouette={silhouette} silhouetteFill={SILHOUETTE.body} />
          <path d={geo.path} fill={silhouette ? SILHOUETTE.body : bodyFill} />
          {interior}
          {!silhouette ? <path d={geo.path} fill="none" stroke={c.outline} strokeWidth={innerW} strokeLinejoin="round" /> : null}
          <FillPass parts={front} line={sc.outline} width={innerW} silhouette={silhouette} silhouetteFill={SILHOUETTE.body} />
          {!silhouette ? (
            <>
              <FaceUnder kind={art.face} geo={geo} k={k} c={c} />
              {art.cheeks !== false && onScreen ? <Cheeks geo={geo} k={k} c={c} frosty={false} onScreen /> : null}
              <Eyes kind={art.eyes} ctx={eyeCtx} />
              <Brows kind={art.brows} eyes={art.eyes} ctx={eyeCtx} />
              <Mouth kind={art.mouth} x={geo.face.x} y={mouthY} k={k * 1.15} ink={ink} />
              {art.face === 'spectacles' && hasEyewear ? null : <FaceOver kind={art.face} eyes={art.eyes} geo={geo} k={k} c={c} />}
              {accessories?.map((a, i) => <Accessory key={`${a.slot}-${i}`} art={a} geo={geo} />)}
            </>
          ) : null}
        </g>
      </g>
      {!silhouette && rank >= 2 && !tiny ? <Sparkles rank={rank} geo={geo} c={c} float={lively} /> : null}
    </svg>
  );
});

/**
 * Uncommon finish: a dotted white trim following the body's own outline just
 * inside it, around the lower half, like a printed sticker border.
 */
function PrintAccent({ geo, clip }: { geo: BodyGeometry; clip: string }) {
  const [x0, y0, x1, y1] = geo.box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const k = 0.84;
  return (
    <g clipPath={`url(#${clip})`}>
      <path d={geo.path} transform={`translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={3 / k} strokeDasharray={`0.01 ${6.2 / k}`} strokeLinecap="round" />
    </g>
  );
}

/** Legendary and mythic: soft beams of light behind the Glim, fading out towards their tips. */
function Rays({ mythic, spin, id }: { mythic: boolean; spin: boolean; id: string }) {
  const color = mythic ? 'hsl(325 100% 72%)' : 'hsl(44 100% 62%)';
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const a1 = a - 0.1;
    const a2 = a + 0.1;
    d += `M60 64L${(60 + 62 * Math.cos(a1)).toFixed(1)} ${(64 + 62 * Math.sin(a1)).toFixed(1)}L${(60 + 62 * Math.cos(a2)).toFixed(1)} ${(64 + 62 * Math.sin(a2)).toFixed(1)}Z`;
  }
  return (
    <>
      <defs>
        <radialGradient id={id} cx="60" cy="64" r="62" gradientUnits="userSpaceOnUse">
          <stop offset="0.4" stopColor={color} stopOpacity={0.75} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g className={spin ? 'glim-rays' : undefined} style={spin ? { transformOrigin: '60px 64px' } : undefined}>
        <path d={d} fill={`url(#${id})`} />
      </g>
    </>
  );
}

function Sparkles({ rank, geo, c, float }: { rank: number; geo: BodyGeometry; c: GlimColors; float: boolean }) {
  const [x0, y0, x1, y1] = geo.box;
  const spots: [number, number, number][] = [[Math.min(112, x1 + 3), Math.max(10, y0 + 6), 5.5]];
  if (rank >= 3) spots.push([Math.max(8, x0 - 4), y0 + (y1 - y0) * 0.45, 4], [Math.min(113, x1 + 6), y0 + (y1 - y0) * 0.72, 3.2]);
  const motes: [number, number, number, number][] =
    rank >= 4
      ? [
          [Math.max(9, x0 - 1), y0 + 4, 1.9, 0],
          [Math.min(110, x1 - 2), y1 - 2, 1.6, 1.2],
          [30, 22, 1.4, 2.1],
          [92, 30, 2.1, 0.6],
          [16, y1 - 8, 1.5, 1.7],
        ]
      : [];
  // Strong enough to read on the light theme too: sparkles get a thin dark edge, motes a deeper gold.
  const moteFill = rank >= 5 ? 'hsl(322 95% 68%)' : 'hsl(42 100% 56%)';
  return (
    <>
      <path d={spots.map(([x, y, r]) => sparkle(x, y, r, 0.24)).join('')} fill="#fff" stroke={c.outline} strokeOpacity={0.55} strokeWidth={1.1} strokeLinejoin="round" />
      {motes.map(([x, y, r, delay], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 2 && rank >= 5 ? 'hsl(188 95% 55%)' : moteFill} className={float ? 'glim-mote' : undefined} style={float ? { animationDelay: `${delay}s` } : undefined} />
      ))}
    </>
  );
}
