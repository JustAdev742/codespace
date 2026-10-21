import type { CSSProperties } from 'react';
import type { GlimArt, LanternArt, Rarity } from '@ludora/shared';
import { Glim, type GlimPose } from '../../art/glim/Glim.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import './festival.css';

/*
 * A crowd of Glims gathered under festival lanterns on a hill at dusk. Drawn
 * for the stage: the landing hero and the sign-in pages. Everything is placed
 * in percentages, so the scene scales with its box. Decorative only.
 */

/** Real Glims from the catalogue, so the crowd shows what players can find. */
export const GLIMS = {
  sprig: { kind: 'glim', body: 'sprout', hue: 108, accentHue: 84, saturation: 64, eyes: 'happy', mouth: 'smile', pattern: 'belly', topper: 'none', cheeks: true, ears: 'leaf' },
  dewdrop: { kind: 'glim', body: 'drop', hue: 196, accentHue: 175, saturation: 74, eyes: 'sparkle', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true, brows: 'soft' },
  buzzbean: { kind: 'glim', body: 'blob', hue: 50, accentHue: 30, saturation: 92, eyes: 'big', mouth: 'grin', pattern: 'bands', topper: 'none', cheeks: true, ears: 'feelers', back: 'fairy' },
  briarcat: { kind: 'glim', body: 'cat', hue: 88, accentHue: 342, saturation: 58, eyes: 'big', mouth: 'fang', pattern: 'freckles', topper: 'rose', cheeks: false, brows: 'worried', tail: 'curl' },
  lamplighter: { kind: 'glim', body: 'lantern', hue: 32, accentHue: 270, saturation: 84, eyes: 'star', mouth: 'o', pattern: 'belly', topper: 'flame', cheeks: true, brows: 'soft', tail: 'tassel' },
  hearthkeeper: { kind: 'glim', body: 'blob', hue: 20, accentHue: 52, saturation: 96, eyes: 'half', mouth: 'cat', pattern: 'stars', topper: 'flame', cheeks: true, brows: 'bushy', ears: 'fox', tail: 'fox', face: 'whiskers' },
  novabelle: { kind: 'glim', body: 'moth', hue: 300, accentHue: 46, saturation: 100, eyes: 'sparkle', mouth: 'o', pattern: 'stars', topper: 'halo', cheeks: true, brows: 'surprised', back: 'burst' },
  constella: { kind: 'glim', body: 'star', hue: 250, accentHue: 46, saturation: 88, eyes: 'star', mouth: 'grin', pattern: 'constellation', topper: 'star', cheeks: true, brows: 'soft' },
  quillington: { kind: 'glim', body: 'owl', hue: 354, accentHue: 46, saturation: 52, eyes: 'big', mouth: 'o', pattern: 'patch', topper: 'quill', cheeks: true, brows: 'surprised' },
  anglet: { kind: 'glim', body: 'blob', hue: 220, accentHue: 54, saturation: 62, eyes: 'big', mouth: 'toothy', pattern: 'spots', topper: 'lure', cheeks: false, brows: 'soft', ears: 'fin' },
  dappledew: { kind: 'glim', body: 'mushroom', hue: 92, accentHue: 284, saturation: 44, eyes: 'sparkle', mouth: 'smile', pattern: 'stars', topper: 'antenna', cheeks: true },
  pebblet: { kind: 'glim', body: 'blob', hue: 30, accentHue: 110, saturation: 22, eyes: 'dot', mouth: 'smile', pattern: 'freckles', topper: 'sprout', cheeks: true, brows: 'soft' },
  moonchill: { kind: 'glim', body: 'ghost', hue: 220, accentHue: 268, saturation: 32, eyes: 'sparkle', mouth: 'none', pattern: 'stars', topper: 'halo', cheeks: false, ears: 'crystal' },
} satisfies Record<string, GlimArt>;

export interface CrowdGlim {
  art: GlimArt;
  /** Width as a percentage of the scene. */
  w: number;
  left: number;
  /** Standing Glims give `bottom`; floating ones give `top`. */
  bottom?: number;
  top?: number;
  /** Its catalogue rarity, which sets the finish. */
  rarity: Rarity;
  /** A glow behind it, for the light spirits floating near the lanterns. */
  aura?: boolean;
  pose?: GlimPose;
  bob?: boolean;
  /** Behind the front hill. */
  back?: boolean;
}

export interface CrowdLantern {
  art: LanternArt;
  w: number;
  left: number;
  /** Cord from the garland to the Lantern, as a percentage of the Lantern's width. */
  cord: number;
}

export interface CrowdScene {
  glims: CrowdGlim[];
  lanterns: CrowdLantern[];
  /** Garland curve: y at the left edge, the lowest point, and the right edge (percentages). */
  garland: [number, number, number];
}

export const HERO_SCENE: CrowdScene = {
  garland: [4, 14, 3],
  lanterns: [
    { art: { hue: 38, accentHue: 18, pattern: 'stars' }, w: 25, left: 37.5, cord: 6 },
    { art: { hue: 338, accentHue: 50, pattern: 'leaves' }, w: 14, left: 9, cord: 22 },
    { art: { hue: 176, accentHue: 205, pattern: 'waves' }, w: 16, left: 75, cord: 34 },
  ],
  glims: [
    { art: GLIMS.buzzbean, rarity: 'uncommon', w: 19, left: 31, bottom: 17, back: true, pose: 'cheer' },
    { art: GLIMS.dappledew, rarity: 'rare', w: 17, left: 58, bottom: 19, back: true },
    { art: GLIMS.sprig, rarity: 'common', w: 24, left: -2, bottom: 2, pose: 'wave' },
    { art: GLIMS.lamplighter, rarity: 'legendary', w: 33, left: 15, bottom: 0, aura: true, pose: 'cheer' },
    { art: GLIMS.hearthkeeper, rarity: 'legendary', w: 29, left: 46, bottom: 1 },
    { art: GLIMS.dewdrop, rarity: 'common', w: 23, left: 75, bottom: 3 },
    { art: GLIMS.novabelle, rarity: 'mythic', w: 18, left: 63, top: 33, aura: true, bob: true },
    { art: GLIMS.constella, rarity: 'legendary', w: 16, left: 8, top: 35, aura: true, bob: true },
  ],
};

/** Phones: a row of Glims peeking over the join ticket, under two lanterns. */
export const COMPACT_SCENE: CrowdScene = {
  // The ends start above the box, so the string lights look hung from somewhere overhead.
  garland: [-6, 16, -8],
  lanterns: [
    { art: { hue: 38, accentHue: 18, pattern: 'stars' }, w: 16, left: 42, cord: 8 },
    { art: { hue: 176, accentHue: 205, pattern: 'waves' }, w: 11, left: 80, cord: 30 },
    { art: { hue: 338, accentHue: 50, pattern: 'leaves' }, w: 10, left: 9, cord: 22 },
  ],
  glims: [
    { art: GLIMS.sprig, rarity: 'common', w: 25, left: -1, bottom: 0, pose: 'wave' },
    { art: GLIMS.lamplighter, rarity: 'legendary', w: 31, left: 18, bottom: 0, aura: true, pose: 'cheer' },
    { art: GLIMS.hearthkeeper, rarity: 'legendary', w: 28, left: 47, bottom: 0 },
    { art: GLIMS.dewdrop, rarity: 'common', w: 24, left: 76, bottom: 0 },
    { art: GLIMS.novabelle, rarity: 'mythic', w: 15, left: 63, top: 22, aura: true, bob: true },
  ],
};

export const AUTH_SCENE: CrowdScene = {
  garland: [6, 17, 5],
  lanterns: [
    { art: { hue: 44, accentHue: 20, pattern: 'moons' }, w: 21, left: 40, cord: 6 },
    { art: { hue: 200, accentHue: 240, pattern: 'frost' }, w: 13, left: 12, cord: 28 },
    { art: { hue: 330, accentHue: 50, pattern: 'flames' }, w: 14, left: 74, cord: 22 },
  ],
  glims: [
    { art: GLIMS.pebblet, rarity: 'common', w: 16, left: 30, bottom: 18, back: true },
    { art: GLIMS.anglet, rarity: 'epic', w: 16, left: 58, bottom: 18, back: true },
    { art: GLIMS.quillington, rarity: 'legendary', w: 27, left: 2, bottom: 1, pose: 'wave' },
    { art: GLIMS.lamplighter, rarity: 'legendary', w: 29, left: 27, bottom: 0, aura: true },
    { art: GLIMS.sprig, rarity: 'common', w: 22, left: 55, bottom: 2, pose: 'cheer' },
    { art: GLIMS.dewdrop, rarity: 'common', w: 19, left: 78, bottom: 3 },
    { art: GLIMS.novabelle, rarity: 'mythic', w: 16, left: 66, top: 37, aura: true, bob: true },
  ],
};

/** The garland's control point, chosen so the curve passes through `low` at the middle. */
const controlY = ([a, low, b]: [number, number, number]) => 2 * low - (a + b) / 2;

/** Height of the garland at x (0..100). The control point sits at x = 50, so x maps linearly to t. */
function garlandY(g: [number, number, number], x: number): number {
  const t = x / 100;
  return (1 - t) * (1 - t) * g[0] + 2 * (1 - t) * t * controlY(g) + t * t * g[2];
}

const BULBS = ['#ffd36b', '#7df0cb', '#ff9fd8', '#9fd8ff'];

/** Hills drawn four times wider than the crowd, so the ground runs the full width of the stage behind it. */
const WIDE_BACK = 'M0 70C200 62 420 66 600 52C660 22 730 18 800 34C860 46 920 20 1000 30C1120 44 1300 52 1600 58';
const WIDE_FRONT = 'M0 62C220 50 440 58 600 40C680 8 770 4 840 22C900 36 950 26 1000 18C1150 6 1350 30 1600 36';
const NARROW_BACK = 'M0 52C60 22 130 18 200 34C260 46 320 20 400 30';
const NARROW_FRONT = 'M0 40C80 8 170 4 240 22C300 36 350 26 400 18';

function Hill({ d, wide, height, fill, rim }: { d: string; wide: boolean; height: string; fill: string; rim: string }) {
  const w = wide ? 1600 : 400;
  return (
    <svg className={`absolute bottom-0 ${wide ? 'left-[-150%] w-[400%]' : 'inset-x-0 w-full'}`} style={{ height }} viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" focusable={false}>
      <path d={`${d}V100H0Z`} fill={fill} />
      <path d={d} fill="none" stroke={rim} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function GlimCrowd({ scene, className = '', entrance = false, aspect = '10 / 9', ground = 'hills' }: { scene: CrowdScene; className?: string; entrance?: boolean; aspect?: string; ground?: 'hills' | 'wide' | 'none' }) {
  const [a, , b] = scene.garland;
  const c = controlY(scene.garland);
  const glimNode = (g: CrowdGlim, i: number, delayBase: number) => {
    const style: CSSProperties = { left: `${g.left}%`, width: `${g.w}%`, ...(g.top !== undefined ? { top: `${g.top}%` } : { bottom: `${g.bottom ?? 0}%` }) };
    const delay = `${delayBase + i * 90}ms`;
    return (
      <div key={i} className="absolute" style={style}>
        <div className={entrance ? 'fx-pop-up' : undefined} style={entrance ? { animationDelay: delay, transformOrigin: '50% 90%' } : undefined} data-fx-delay={entrance || undefined}>
          <Glim art={g.art} size={240} rarity={g.rarity} aura={g.aura ? g.rarity : null} pose={g.pose} bob={g.bob} className="h-auto w-full" />
        </div>
      </div>
    );
  };
  const back = scene.glims.filter((g) => g.back);
  const front = scene.glims.filter((g) => !g.back);
  return (
    <div className={`pointer-events-none relative w-full select-none ${className}`} style={{ aspectRatio: aspect }} aria-hidden>
      {/* Garland with string lights */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" focusable={false}>
        <path d={`M0 ${a} Q50 ${c} 100 ${b}`} fill="none" stroke="#120b3d" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Posts holding the string lights, standing on the hill */}
      {ground !== 'none'
        ? ([
            [0, a],
            [100, b],
          ] as const).map(([x, y]) => (
            <span key={x} className="absolute bottom-0 w-[7px] -translate-x-1/2 rounded-t-full bg-[#120b3d]" style={{ left: `${x}%`, top: `${y - 1.5}%` }}>
              <span className="absolute -top-1.5 left-1/2 size-3.5 -translate-x-1/2 rounded-full border-2 border-[#120b3d] bg-[#ffd36b] shadow-[0_0_12px_3px_rgb(255_211_107/0.6)]" />
            </span>
          ))
        : null}
      {Array.from({ length: 13 }, (_, i) => {
        const x = 4 + i * 7.6;
        if (garlandY(scene.garland, x) < 2) return null;
        return <span key={i} className="absolute size-2.5 -translate-x-1/2 rounded-full border-2 border-[#120b3d]" style={{ left: `${x}%`, top: `calc(${garlandY(scene.garland, x)}% - 1px)`, background: BULBS[i % BULBS.length], boxShadow: `0 0 10px 2px ${BULBS[i % BULBS.length]}88` }} />;
      })}
      {/* Lanterns hanging from the garland */}
      {scene.lanterns.map((l, i) => (
        <div key={i} className="absolute" style={{ left: `${l.left}%`, top: `${garlandY(scene.garland, l.left + l.w / 2) - 0.5}%`, width: `${l.w}%` }}>
          <div className={entrance ? 'fx-lower' : undefined} style={entrance ? { animationDelay: `${i * 140}ms` } : undefined} data-fx-delay={entrance || undefined}>
            {/* Padding in % follows the width, so the cord scales with the Lantern. */}
            <div className="mx-auto w-[3px] bg-[#120b3d]" style={{ paddingBottom: `${l.cord}%` }} />
            <Lantern art={l.art} size={200} lit className="h-auto w-full" />
          </div>
        </div>
      ))}
      {/* Back hill, back row, front hill, front row */}
      {ground !== 'none' ? <Hill d={ground === 'wide' ? WIDE_BACK : NARROW_BACK} wide={ground === 'wide'} height="34%" fill="#3f1f99" rim="#7d5ce0" /> : null}
      {back.map((g, i) => glimNode(g, i, 420))}
      {ground !== 'none' ? <Hill d={ground === 'wide' ? WIDE_FRONT : NARROW_FRONT} wide={ground === 'wide'} height="20%" fill="#26126b" rim="#5b3fc4" /> : null}
      {front.map((g, i) => glimNode(g, i, 520))}
    </div>
  );
}
