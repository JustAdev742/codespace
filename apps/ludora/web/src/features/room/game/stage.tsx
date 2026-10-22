import type { ReactNode } from 'react';
import type { AvatarLite, GlimArt, Rarity, RoomPlayerView } from '@ludora/shared';
import { Glim, type GlimPose } from '../../../art/glim/Glim.tsx';
import { prefersReducedMotion } from '../../../lib/prefs.ts';

/*
 * Small building blocks for screens drawn on the dusk stage: players' Glims,
 * paper name tags and calm information panels. Kept with the room screens;
 * candidates for the shared UI kit once the look settles.
 */

/**
 * The calm surface for panels, rows and readouts on the stage: deep night blue,
 * opaque enough that a lantern drifting behind never weakens the text on it
 * (white stays above 7:1, coloured text above 4.5:1 anywhere on the sky).
 */
export const NIGHT = 'bg-[rgb(17_10_62/0.62)]';

/**
 * Big headings on the open sky get a hard ink drop shadow and a soft night
 * glow, like a painted festival sign: they read from the back of the room and
 * stay legible when a lantern drifts behind them.
 */
export const SIGN = '[text-shadow:0_0.07em_0_var(--ink),0_0_0.35em_rgb(17_10_62/0.75)]';

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

/** A white paper name tag with an ink edge, for names under Glims. */
export function NameTag({ children, className = '', tone = 'paper' }: { children: ReactNode; className?: string; tone?: 'paper' | 'lantern' }) {
  return (
    <span className={`inline-block max-w-full truncate rounded-full border-2 border-ink px-3 py-0.5 text-center font-bold leading-snug shadow-[0_2px_0_var(--ink)] ${tone === 'lantern' ? 'bg-lantern text-on-accent' : 'paper'} ${className}`}>
      {children}
    </span>
  );
}

/** A calm, flat information panel on the stage. Darker than the sky so coloured text keeps its contrast. */
export function StagePanel({ children, className = '', as: As = 'div', label }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'aside'; label?: string }) {
  return (
    <As className={`rounded-[22px] border border-white/12 ${NIGHT} ${className}`} aria-label={label}>
      {children}
    </As>
  );
}

/** A small rounded readout on the stage: counts, clocks, goals. */
export function Pill({ children, className = '', tone = 'calm' }: { children: ReactNode; className?: string; tone?: 'calm' | 'lantern' | 'glim' | 'ember' | 'dusk' }) {
  const t = {
    calm: `${NIGHT} text-text border border-white/12`,
    lantern: 'bg-lantern text-on-accent border-2 border-ink',
    glim: 'bg-glim text-on-accent border-2 border-ink',
    ember: 'bg-ember text-on-accent border-2 border-ink',
    dusk: 'bg-dusk text-on-accent border-2 border-ink',
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display font-bold whitespace-nowrap ${t} ${className}`}>{children}</span>;
}

/** Three Glims who turn up on the join screens before anyone has an avatar. */
export const GREETERS: GlimArt[] = [
  { kind: 'glim', body: 'cat', hue: 28, accentHue: 50, saturation: 90, eyes: 'happy', mouth: 'cat', pattern: 'stripes', topper: 'none', cheeks: true },
  { kind: 'glim', body: 'jelly', hue: 190, accentHue: 300, saturation: 75, eyes: 'big', mouth: 'smile', pattern: 'spots', topper: 'antenna', cheeks: true },
  { kind: 'glim', body: 'owl', hue: 330, accentHue: 45, saturation: 70, eyes: 'curious', mouth: 'grin', pattern: 'belly', topper: 'none', cheeks: true },
];
