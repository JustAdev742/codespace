import { Anchor, Bird, Compass, Crown, Flame, Heart, KeyRound, Leaf, Moon, Mountain, Shield, Star, Sun, TreePine, Waves, Zap, type LucideIcon } from 'lucide-react';
import { houseFill, type HouseEmblem } from '@ludora/shared';

/*
 * House emblems and the house crest: the house's colour (the same fill the team colours use, with
 * ink on it) and its emblem. Never colour alone: the name goes with it wherever it is shown.
 */

export const EMBLEM_ICONS: Record<HouseEmblem, LucideIcon> = {
  shield: Shield,
  star: Star,
  flame: Flame,
  leaf: Leaf,
  wave: Waves,
  mountain: Mountain,
  crown: Crown,
  bird: Bird,
  anchor: Anchor,
  sun: Sun,
  moon: Moon,
  bolt: Zap,
  tree: TreePine,
  key: KeyRound,
  compass: Compass,
  heart: Heart,
};

export const EMBLEM_NAMES: Record<HouseEmblem, string> = {
  shield: 'Shield',
  star: 'Star',
  flame: 'Flame',
  leaf: 'Leaf',
  wave: 'Wave',
  mountain: 'Mountain',
  crown: 'Crown',
  bird: 'Bird',
  anchor: 'Anchor',
  sun: 'Sun',
  moon: 'Moon',
  bolt: 'Lightning',
  tree: 'Tree',
  key: 'Key',
  compass: 'Compass',
  heart: 'Heart',
};

export interface HouseLike {
  name: string;
  hue: number;
  emblem: string;
}

/** The house's emblem on its colour. Decorative: put the house name beside it. */
export function HouseCrest({ house, size = 40, className = '' }: { house: HouseLike; size?: number; className?: string }) {
  const Icon = EMBLEM_ICONS[house.emblem as HouseEmblem] ?? Shield;
  return (
    <span className={`grid shrink-0 place-items-center rounded-[var(--radius-m)] text-on-accent shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)] ${className}`} style={{ width: size, height: size, background: houseFill(house.hue) }} aria-hidden>
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.2} />
    </span>
  );
}

/** A small chip with the house name on its colour, for seats, rosters and lists. */
export function HouseChip({ house, className = '' }: { house: HouseLike; className?: string }) {
  const Icon = EMBLEM_ICONS[house.emblem as HouseEmblem] ?? Shield;
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-on-accent ${className}`} style={{ background: houseFill(house.hue) }}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{house.name}</span>
    </span>
  );
}
