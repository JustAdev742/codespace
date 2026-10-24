import type { CSSProperties } from 'react';
import type { GlimArt, LanternArt, Rarity } from '@ludora/shared';
import { Glim, type GlimPose } from '../../art/glim/Glim.tsx';

/*
 * Real Glims from the catalogue (GLIMS), used where collectibles are shown, and
 * GlimCrowd, a row of them standing in a box.
 *
 * Ludora's own pages no longer draw crowds: characters are collectibles, not
 * page decoration (docs/DESIGN.md). GlimCrowd stays for the demo's start page,
 * which still imports it, and it no longer draws the festival around the Glims:
 * no string lights, lanterns or hills, and nothing moves. `scene.lanterns`,
 * `scene.garland`, `ground` and `entrance` are accepted and ignored, and Glims
 * that floated near the lanterns are left out.
 */

/** Real Glims from the catalogue, so what is shown is what players can find. */
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
  /** Standing Glims give `bottom`; floating ones give `top` (no longer drawn). */
  bottom?: number;
  top?: number;
  /** Its catalogue rarity, which sets the finish. */
  rarity: Rarity;
  /** A glow behind it, in its rarity's colour. */
  aura?: boolean;
  pose?: GlimPose;
  /** Ignored: nothing bobs. */
  bob?: boolean;
  /** Drawn first, so the others stand in front of it. */
  back?: boolean;
}

export interface CrowdLantern {
  art: LanternArt;
  w: number;
  left: number;
  cord: number;
}

export interface CrowdScene {
  glims: CrowdGlim[];
  /** Ignored: no lanterns are drawn. */
  lanterns: CrowdLantern[];
  /** Ignored: no string lights are drawn. */
  garland: [number, number, number];
}

export const HERO_SCENE: CrowdScene = {
  garland: [4, 14, 3],
  lanterns: [],
  glims: [
    { art: GLIMS.buzzbean, rarity: 'uncommon', w: 19, left: 31, bottom: 17, back: true, pose: 'cheer' },
    { art: GLIMS.dappledew, rarity: 'rare', w: 17, left: 58, bottom: 19, back: true },
    { art: GLIMS.sprig, rarity: 'common', w: 24, left: -2, bottom: 2 },
    { art: GLIMS.lamplighter, rarity: 'legendary', w: 33, left: 15, bottom: 0, aura: true, pose: 'cheer' },
    { art: GLIMS.hearthkeeper, rarity: 'legendary', w: 29, left: 46, bottom: 1 },
    { art: GLIMS.dewdrop, rarity: 'common', w: 23, left: 75, bottom: 3 },
  ],
};

export const COMPACT_SCENE: CrowdScene = {
  garland: [-6, 16, -8],
  lanterns: [],
  glims: [
    { art: GLIMS.sprig, rarity: 'common', w: 25, left: -1, bottom: 0 },
    { art: GLIMS.lamplighter, rarity: 'legendary', w: 31, left: 18, bottom: 0, aura: true, pose: 'cheer' },
    { art: GLIMS.hearthkeeper, rarity: 'legendary', w: 28, left: 47, bottom: 0 },
    { art: GLIMS.dewdrop, rarity: 'common', w: 24, left: 76, bottom: 0 },
  ],
};

export const AUTH_SCENE: CrowdScene = {
  garland: [6, 17, 5],
  lanterns: [],
  glims: [
    { art: GLIMS.pebblet, rarity: 'common', w: 16, left: 30, bottom: 18, back: true },
    { art: GLIMS.anglet, rarity: 'epic', w: 16, left: 58, bottom: 18, back: true },
    { art: GLIMS.quillington, rarity: 'legendary', w: 27, left: 2, bottom: 1 },
    { art: GLIMS.lamplighter, rarity: 'legendary', w: 29, left: 27, bottom: 0, aura: true },
    { art: GLIMS.sprig, rarity: 'common', w: 22, left: 55, bottom: 2, pose: 'cheer' },
    { art: GLIMS.dewdrop, rarity: 'common', w: 19, left: 78, bottom: 3 },
  ],
};

/** Glims standing in a box, placed in percentages so the row scales with it. Still, and decorative only. */
export function GlimCrowd({ scene, className = '', aspect = '10 / 9' }: { scene: CrowdScene; className?: string; entrance?: boolean; aspect?: string; ground?: 'hills' | 'wide' | 'none' }) {
  const standing = scene.glims.filter((g) => g.top === undefined);
  const ordered = [...standing.filter((g) => g.back), ...standing.filter((g) => !g.back)];
  return (
    <div className={`pointer-events-none relative w-full select-none ${className}`} style={{ aspectRatio: aspect }} aria-hidden>
      {ordered.map((g, i) => {
        const style: CSSProperties = { left: `${g.left}%`, width: `${g.w}%`, bottom: `${g.bottom ?? 0}%` };
        // A wave loops forever, so it is left out: nothing here moves.
        const pose = g.pose === 'wave' ? undefined : g.pose;
        return (
          <div key={i} className="absolute" style={style}>
            <Glim art={g.art} size={240} rarity={g.rarity} aura={g.aura ? g.rarity : null} pose={pose} className="h-auto w-full" />
          </div>
        );
      })}
    </div>
  );
}
