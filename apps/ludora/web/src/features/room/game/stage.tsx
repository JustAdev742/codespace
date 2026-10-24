import type { ReactNode } from 'react';
import type { AvatarLite, GlimArt, Rarity, RoomPlayerView } from '@ludora/shared';
import { Glim, type GlimPose } from '../../../art/glim/Glim.tsx';
import { prefersReducedMotion } from '../../../lib/prefs.ts';

/*
 * Small building blocks for screens drawn on the stage: players' Glims, name
 * tags, calm information panels, HUD chips. Every mode screen uses them, so
 * they carry the look ("game night, live", docs/DESIGN.md): smoked panels on
 * the midnight stage, solid chips with no outline, numbers in the display face.
 */

/**
 * The calm surface for panels, rows and readouts on the stage: a smoked,
 * slightly lit panel. White text stays above 12:1 on it and coloured text
 * above 4.5:1, nested or not. Kept under its old name for the screens that
 * pass it as a class.
 */
export const NIGHT = 'bg-white/[0.07]';

/**
 * Headings on the stage used to carry a painted sign's ink drop shadow. Nothing
 * drifts behind them any more and the stage is dark everywhere, so a heading
 * needs nothing extra: this is empty, kept so screens that add it still compile.
 */
export const SIGN = '';

/** True unless the player (or their device) asked for less motion. Read at render; settings change rarely. */
export function motionOK(): boolean {
  return !prefersReducedMotion();
}

const BODIES = ['blob', 'drop', 'bean', 'cloud', 'orb', 'bell'] as const;
const EYES = ['dot', 'big', 'happy', 'curious', 'sparkle'] as const;
const MOUTHS = ['smile', 'grin', 'o', 'cat'] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** A stand-in Glim for anyone who has no avatar yet, always the same for the same seed. */
export function fallbackArt(seed: string): GlimArt {
  const h = hash(seed);
  const hue = h % 360;
  return {
    kind: 'glim',
    body: BODIES[(h >>> 9) % BODIES.length]!,
    hue,
    accentHue: (hue + 40) % 360,
    saturation: 65,
    eyes: EYES[(h >>> 13) % EYES.length]!,
    mouth: MOUTHS[(h >>> 17) % MOUTHS.length]!,
    pattern: 'none',
    topper: 'none',
    cheeks: true,
  };
}

export const avatarOf = (players: RoomPlayerView[], id: string): AvatarLite | null => players.find((p) => p.id === id)?.avatar ?? null;

/**
 * A player's Glim, or a stand-in when they have none. Size it with `size`, or
 * with a CSS size class (the SVG scales to its box) for crowds that flex with the screen.
 *
 * The finish follows the player's own buddy (`avatar.rarity`): gloss on a rare,
 * a gold rim on a legendary, wherever that Glim turns up in the room. Guests and
 * stand-ins stay plain. An `aura` (the winner's glow) only adds light around the
 * Glim; it never dresses a buddy up as a rarer collectible than it is.
 */
export function PlayerGlim({
  avatar,
  seed,
  size = 72,
  className,
  bob = false,
  aura = null,
  rarity,
  pose = 'idle',
  title,
}: {
  avatar: AvatarLite | null | undefined;
  seed: string;
  size?: number;
  className?: string;
  bob?: boolean;
  aura?: Rarity | null;
  rarity?: Rarity;
  pose?: GlimPose;
  title?: string;
}) {
  return (
    <Glim
      art={avatar?.art ?? fallbackArt(seed)}
      accessories={avatar?.accessories}
      size={size}
      className={className}
      bob={bob}
      aura={aura}
      rarity={rarity ?? avatar?.rarity ?? 'common'}
      pose={pose}
      title={title}
    />
  );
}

/** A name on a white tag (or a gold one), for names under Glims: no outline, a soft float. */
export function NameTag({ children, className = '', tone = 'paper' }: { children: ReactNode; className?: string; tone?: 'paper' | 'lantern' }) {
  return (
    <span className={`inline-block max-w-full truncate rounded-[var(--radius-s)] px-2.5 py-0.5 text-center leading-snug font-bold shadow-[0_6px_16px_-8px_rgb(2_5_20/0.8)] ${tone === 'lantern' ? 'bg-lantern text-on-accent' : 'paper'} ${className}`}>
      {children}
    </span>
  );
}

/** A calm, flat information panel on the stage: smoked, with a fine edge. Coloured text keeps its contrast on it. */
export function StagePanel({ children, className = '', as: As = 'div', label }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'aside'; label?: string }) {
  return (
    <As className={`rounded-[var(--radius-l)] border border-white/10 ${NIGHT} ${className}`} aria-label={label}>
      {children}
    </As>
  );
}

/**
 * A small readout chip on the stage: counts, clocks, goals, a streak. Solid
 * colour with ink text for the accents, smoked for calm; no outline. Body face,
 * tabular figures; put a number that is the hero of a screen in `font-display` yourself.
 */
export function Pill({ children, className = '', tone = 'calm' }: { children: ReactNode; className?: string; tone?: 'calm' | 'lantern' | 'glim' | 'ember' | 'dusk' }) {
  const t = {
    calm: 'bg-white/[0.09] text-text',
    lantern: 'bg-lantern text-on-accent',
    glim: 'bg-glim text-on-accent',
    ember: 'bg-ember text-on-accent',
    dusk: 'bg-dusk text-on-accent',
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 leading-tight font-bold whitespace-nowrap tabular ${t} ${className}`}>{children}</span>;
}

/** Three Glims who turn up on the join screens before anyone has an avatar. */
export const GREETERS: GlimArt[] = [
  { kind: 'glim', body: 'cat', hue: 28, accentHue: 50, saturation: 90, eyes: 'happy', mouth: 'cat', pattern: 'stripes', topper: 'none', cheeks: true },
  { kind: 'glim', body: 'jelly', hue: 190, accentHue: 300, saturation: 75, eyes: 'big', mouth: 'smile', pattern: 'spots', topper: 'antenna', cheeks: true },
  { kind: 'glim', body: 'owl', hue: 330, accentHue: 45, saturation: 70, eyes: 'curious', mouth: 'grin', pattern: 'belly', topper: 'none', cheeks: true },
];
