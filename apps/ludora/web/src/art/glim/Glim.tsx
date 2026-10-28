import { memo, useId, useMemo } from 'react';
import type { AccessoryArt, GlimArt, Rarity } from '@ludora/shared';
import { BODIES, type BodyGeometry, type GlimColors, type Part } from './bodies.ts';
import { Accessory } from './accessories.tsx';
import { Brows, browFor, Eyes, FaceOver, FaceUnder, FrostMarks, Mouth, type EyeCtx, type FaceInk } from './face.tsx';
import { FINE_PATTERNS, Pattern } from './patterns.tsx';
import { armParts, backParts, BIG_BACKS, earParts, feetParts, tailParts, topperParts, type Pose } from './parts.ts';
import { pathBounds } from './geometry.ts';

/*
 * Draws a Glim from its genome. Pure SVG, no images: every Glim in the
 * catalogue is generated from a few numbers and choices, so new Glims cost
 * a line of data, not an illustration.
 *
 * The look is a vinyl collectible: every shape is drawn once as a crisp, dark
 * outer contour (a near-black tint of the Glim's hue), then again with its
 * flat fill and a fine inner seam. Inside the body there is hard cel shading:
 * a shadow crescent at the lower right and a highlight crescent at the upper
 * left. The face is small and has attitude (see face.tsx). Rarity adds
 * finishes, the way a card gets foil: a glint from rare, a two-tone body from
 * epic, a gold rim light on legendaries and an iridescent rim and sheen on
 * mythics. Nothing idles: the only motion is a wave that greets three times
 * and stops, and none at all under reduced motion.
 */

export type GlimPose = Pose;

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(Math.max(0, Math.min(100, s)))}% ${Math.round(Math.max(0, Math.min(100, l)))}%)`;

/** Shadows lean towards blue and purple, which reads richer than plain darkening. */
function deepHue(h: number) {
  return h > 70 && h < 260 ? h + 10 : h - 10;
}

export function glimColors(art: GlimArt): GlimColors {
  const sat = art.saturation ?? 70;
  const h = art.hue;
  const ah = art.accentHue;
  const pale = sat < 35;
  // Pale Glims (stone, ghost and snow tones) get a little more colour than their number says, so they never look washed out.
  const s = pale ? sat + 14 : Math.min(100, sat + 8);
  const L = pale ? 76 - sat * 0.18 : 58 + (h >= 200 && h <= 290 ? 4 : 0);
  return {
    body: hsl(h, s, L),
    deep: hsl(deepHue(h), s + 4, L - 15),
    outline: hsl(h, Math.min(55, Math.max(28, sat * 0.6)), 10),
    accent: hsl(ah, Math.max(sat, 66) + 6, 62),
    accentDeep: hsl(ah, Math.max(sat, 52), 34),
    belly: hsl(h, s * 0.55, Math.min(94, L + 24)),
    glow: hsl(ah, 100, 74),
    ink: hsl(h, 42, 9),
    // No blush in this look; kept as a deeper tone for anything that still asks for it.
    blush: hsl(deepHue(h), s + 4, L - 15),
    second: hsl(ah + 120, Math.max(sat, 62), 66),
  };
}

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

const AURA: Partial<Record<Rarity, string>> = {
  common: 'var(--r-common)',
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

const GOLD_RIM = 'hsl(44 100% 62%)';
/* The wave greets three times, then the arm stays up. Nothing else moves. */
const MOTION_CSS = `@keyframes glim-wave{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-24deg)}}.glim-wave{animation:glim-wave 520ms var(--ease-out,ease-out) 3}@media (prefers-reduced-motion:reduce){:root:not([data-motion='on']) .glim-wave{animation:none}}:root[data-motion='off'] .glim-wave{animation:none}`;

export interface GlimProps {
  art: GlimArt;
  accessories?: AccessoryArt[] | undefined;
  size?: number;
  /** Rarity light behind the Glim (collection and reveal views). Also sets the finish when `rarity` is not given. */
  aura?: Rarity | null;
  /** Rarity finish: glint, two-tone body, gold rim light, iridescence. Defaults to `aura`. */
  rarity?: Rarity | null | undefined;
  /** Arm pose: 'wave' to greet, 'cheer' (arms up) for reveals and podiums. */
  pose?: GlimPose | undefined;
  /** No longer does anything: Glims hold still in this look. Kept so existing callers stay valid. */
  bob?: boolean;
  /** Draw as one dark shape (not yet collected). */
  silhouette?: boolean;
  /** Arms and feet. The 3D Glims leave them out of their texture and build real ones. */
  limbs?: boolean;
  /** The soft shadow under the feet. */
  ground?: boolean;
  /** No face or accessories: the back of a 3D Glim. */
  faceless?: boolean;
  /** The dark outer contour. 3D Glims draw their own outline, so their pictures leave it out. */
  contour?: boolean;
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
    const pad = (p.line ? p.line / 2 : 0) + 3;
    if (y0 - pad < MARGIN) s = Math.min(s, (GROUND.y - MARGIN) / (GROUND.y - (y0 - pad)));
    if (x0 - pad < MARGIN) s = Math.min(s, (GROUND.x - MARGIN) / (GROUND.x - (x0 - pad)));
    if (x1 + pad > 120 - MARGIN) s = Math.min(s, (120 - MARGIN - GROUND.x) / (x1 + pad - GROUND.x));
  }
  return s;
}

function build(art: GlimArt, c: GlimColors, pose: Pose, hideTopper: boolean, limbs = true): Built {
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
  ];
  const feet = feetParts(geo, c);
  const arms = armParts(geo, c, pose);
  const front: Part[] = [...(geo.front?.(c) ?? []), ...ears.front, ...(hideTopper ? [] : topperParts(art.topper ?? 'none', geo, c))];
  // The fit always counts the limbs, so a Glim drawn without them sits exactly where it would with them.
  const fit = fitScale([...back, ...feet, ...arms, ...front]);
  return limbs ? { geo, back: [...back, ...feet], front: [...arms, ...front], fit } : { geo, back, front, fit };
}

/** The scale a Glim is drawn at and the point it shrinks towards, for placing 3D limbs on a drawn body. */
export function glimFrame(art: GlimArt, accessories?: AccessoryArt[]): { geo: BodyGeometry; scale: number; ground: { x: number; y: number } } {
  const hasHat = Boolean(accessories?.some((a) => a.slot === 'hat'));
  const { geo, fit } = build(art, glimColors(art), 'idle', hasHat);
  return { geo, scale: Math.min(fit, hasHat ? 0.84 : 1), ground: GROUND };
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
  return hsl(art.hue + delta, (pale ? sat + 14 : sat) + 12, pale ? 70 : 52);
}

export const Glim = memo(function Glim({ art, accessories, size = 96, aura = null, rarity, pose = 'idle', silhouette = false, limbs = true, ground = true, faceless = false, contour = true, title, className }: GlimProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const c = useMemo(() => glimColors(art), [art]);
  const hasHat = Boolean(accessories?.some((a) => a.slot === 'hat'));
  const hasEyewear = Boolean(accessories?.some((a) => a.slot === 'eyes'));
  const sc = silhouette ? SILHOUETTE : c;
  const { geo, back, front, fit } = useMemo(() => build(art, sc, pose, hasHat, limbs), [art, sc, pose, hasHat, limbs]);

  const tiny = size <= 40;
  const finish: Rarity = silhouette ? 'common' : (rarity ?? aura ?? 'common');
  const rank = RANK[finish];
  const contourW = silhouette ? 7.6 : tiny ? 7.6 : 5.4;
  const innerW = tiny ? 2.8 : 2.1;
  const k = geo.eyeScale * (tiny ? 1.2 : 1);
  const auraColor = aura && !silhouette ? AURA[aura] : undefined;
  const legendary = rank >= 4;
  const mythic = rank >= 5;
  const animated = !silhouette && pose === 'wave';

  const id = (name: string) => `glim-${name}-${uid}`;
  const bodyFill = rank >= 3 ? `url(#${id('tone')})` : (geo.fill?.(c) ?? c.body);
  const onScreen = art.face === 'screen';
  const ink: FaceInk = onScreen ? { ink: c.glow, iris: c.accent, outline: c.ink } : { ink: c.ink, iris: `hsl(${art.accentHue} 92% 62%)`, outline: c.outline };
  const eyeCtx: EyeCtx = { x: geo.face.x, y: geo.face.y, gap: geo.eyeGap, k, ink, brow: browFor(art), tiny };
  const mouthY = geo.face.y + (art.face === 'snout' ? 13.4 : art.face === 'beard' ? 11.6 : 11) * k;
  const [x0, , x1] = geo.box;

  // Everything outside the body moved by (dx, dy): clipped to the body, that leaves a crescent along the opposite edge.
  const outside = `M-200 -200H320V320H-200Z${geo.path}`;

  // Hats need headroom, and so do tall ears and toppers: shrink the whole Glim towards its feet so nothing is clipped.
  const scale = Math.min(fit, hasHat ? 0.84 : 1);
  const shrink = scale < 1 ? `translate(${GROUND.x} ${GROUND.y}) scale(${scale.toFixed(3)}) translate(${-GROUND.x} ${-GROUND.y})` : undefined;
  const shade = hsl(deepHue(art.hue), 55, 16);

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
              <path d={outside} clipRule="evenodd" transform="translate(-6 -7)" />
            </clipPath>
            <clipPath id={id('hl')}>
              <path d={outside} clipRule="evenodd" transform="translate(3.4 4.2)" />
            </clipPath>
          </>
        ) : null}
        {rank >= 3 ? (
          <linearGradient id={id('tone')} x1="0.15" y1="0" x2="0.6" y2="1">
            <stop offset="0.3" stopColor={c.body} />
            <stop offset="1" stopColor={twoTone(art)} />
          </linearGradient>
        ) : null}
        {legendary ? (
          <clipPath id={id('rim')}>
            <path d={outside} clipRule="evenodd" transform="translate(-2.6 -3)" />
          </clipPath>
        ) : null}
        {mythic ? (
          <>
            <linearGradient id={id('iri')} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="hsl(322 100% 72%)" />
              <stop offset="0.5" stopColor="hsl(188 100% 66%)" />
              <stop offset="1" stopColor="hsl(52 100% 66%)" />
            </linearGradient>
            <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity={0} />
              <stop offset="0.3" stopColor="hsl(320 100% 84%)" stopOpacity={0.9} />
              <stop offset="0.5" stopColor="hsl(55 100% 86%)" stopOpacity={0.9} />
              <stop offset="0.7" stopColor="hsl(190 100% 82%)" stopOpacity={0.9} />
              <stop offset="1" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </>
        ) : null}
        {auraColor ? (
          <radialGradient id={id('aura')}>
            <stop offset="0%" stopColor={auraColor} stopOpacity={legendary ? 0.55 : rank >= 2 ? 0.42 : 0.3} />
            <stop offset="60%" stopColor={auraColor} stopOpacity={legendary ? 0.2 : 0.12} />
            <stop offset="100%" stopColor={auraColor} stopOpacity={0} />
          </radialGradient>
        ) : null}
      </defs>
      {auraColor ? <circle cx="60" cy="64" r="58" fill={`url(#${id('aura')})`} /> : null}
      {ground ? <ellipse cx="60" cy="109" rx="27" ry="4.2" fill="var(--ink)" opacity={0.2} /> : null}
      <g transform={shrink}>
        {contour ? <ContourPass parts={[...back, { d: geo.path, fill: '' }, ...front]} color={sc.outline} width={contourW} /> : null}
        <FillPass parts={back} line={sc.outline} width={innerW} silhouette={silhouette} silhouetteFill={SILHOUETTE.body} />
        <path d={geo.path} fill={silhouette ? SILHOUETTE.body : bodyFill} />
        {silhouette ? null : (
          <g clipPath={`url(#${id('clip')})`}>
            {geo.fill && rank >= 3 ? <path d={geo.path} fill={geo.fill(c)} opacity={0.55} /> : null}
            {geo.crust ? <path d={geo.path} fill="none" stroke={rank >= 3 ? `url(#${id('tone')})` : c.body} strokeWidth={geo.crust} /> : null}
            {geo.marks?.(c).map((m, i) =>
              m.line ? <path key={i} d={m.d} fill="none" stroke={m.fill} strokeWidth={m.line} strokeLinecap="round" opacity={m.opacity} /> : <path key={i} d={m.d} fill={m.fill} opacity={m.opacity} />,
            )}
            {tiny && FINE_PATTERNS.has(art.pattern ?? 'none') ? null : <Pattern kind={art.pattern ?? 'none'} geo={geo} c={c} />}
            {/* Hard cel shading: one shadow, one light. */}
            <rect x={-10} y={-10} width={140} height={140} fill={shade} opacity={0.34} clipPath={`url(#${id('shade')})`} />
            <rect x={-10} y={-10} width={140} height={140} fill="#fff" opacity={rank >= 2 ? 0.34 : 0.26} clipPath={`url(#${id('hl')})`} />
            {legendary ? <rect x={-10} y={-10} width={140} height={140} fill={mythic ? `url(#${id('iri')})` : GOLD_RIM} clipPath={`url(#${id('rim')})`} /> : null}
            {mythic ? <rect x={x0 - 26} y={-10} width={(x1 - x0) * 0.42} height={140} fill={`url(#${id('sheen')})`} opacity={0.42} transform="rotate(20 60 60)" /> : null}
            {rank >= 2 && !tiny ? (
              <>
                <ellipse cx={geo.hl[0]} cy={geo.hl[1]} rx={geo.hl[2] * 0.62} ry={geo.hl[3] * 0.5} transform={`rotate(${geo.hl[4]} ${geo.hl[0]} ${geo.hl[1]})`} fill="#fff" opacity={0.92} />
                <circle cx={geo.hl[0] + geo.hl[2] * 1.05} cy={geo.hl[1] + geo.hl[3] * 0.85} r={1.3} fill="#fff" opacity={0.85} />
              </>
            ) : null}
          </g>
        )}
        {!silhouette ? <path d={geo.path} fill="none" stroke={c.outline} strokeWidth={innerW} strokeLinejoin="round" /> : null}
        <FillPass parts={front} line={sc.outline} width={innerW} silhouette={silhouette} silhouetteFill={SILHOUETTE.body} />
        {!silhouette && !faceless ? (
          <>
            <FaceUnder kind={art.face} geo={geo} k={k} c={c} />
            {art.face === 'frosty' ? <FrostMarks geo={geo} k={k} /> : null}
            <Eyes kind={art.eyes} ctx={eyeCtx} />
            <Brows eyes={art.eyes} ctx={eyeCtx} />
            <Mouth kind={art.mouth} x={geo.face.x} y={mouthY} k={k} ink={ink} tiny={tiny} />
            {art.face === 'spectacles' && hasEyewear ? null : <FaceOver kind={art.face} eyes={art.eyes} geo={geo} k={k} c={c} />}
            {accessories?.map((a, i) => <Accessory key={`${a.slot}-${i}`} art={a} geo={geo} />)}
          </>
        ) : null}
      </g>
    </svg>
  );
});
