/*
 * The numbers worked out in one place: the mode draws gusts and applies pieces
 * with these functions, and the buttons and the gauge print the same numbers.
 * Browser-safe.
 */
import { GUST_ODDS, LEVERAGE, MAX_SWAY, PIECES, STAR_STEPS, STRENGTHS, TARGET, type GustStrength, type PieceKind, type TargetSetting, type WindSetting } from './meta.ts';

export interface GustChance {
  strength: GustStrength;
  name: string;
  /** The most sway the tower can have when this strength lands and still hold. */
  limit: number;
  /** Percent, whole numbers summing to 100. */
  chance: number;
}

/** The chance of each gust strength for a wind setting (none in calm air). */
export function gustOdds(wind: WindSetting): GustChance[] {
  if (wind === 'calm') return [];
  const odds = GUST_ODDS[wind];
  return (Object.keys(odds) as GustStrength[]).map((strength) => ({ strength, name: STRENGTHS[strength].name, limit: STRENGTHS[strength].limit, chance: odds[strength] }));
}

/** Draw a gust's strength with exactly the printed chances. `roll` is a uniform number in [0, 1). */
export function pickGust(odds: readonly GustChance[], roll: number): GustStrength {
  let at = roll * 100;
  for (const o of odds) {
    if (at < o.chance) return o.strength;
    at -= o.chance;
  }
  return odds[odds.length - 1]!.strength;
}

/** How much one piece's own sway moves the gauge for a crew of `crew` builders, to one decimal place. */
export function swayFor(kind: PieceKind, crew: number): number {
  return round1(PIECES[kind].sway / Math.max(1, crew));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(MAX_SWAY, n));

/** A tower as the numbers need it. */
export interface TowerNow {
  /** Sway from the pieces themselves (timber up, stone down), 0 to MAX_SWAY. */
  build: number;
  /** Floors above the highest brace (or the ground). */
  unbraced: number;
  target: number;
  crew: number;
}

/** Sway from the floors standing above the highest brace. */
export function leverage(unbraced: number, target: number): number {
  return round1((LEVERAGE * unbraced) / Math.max(1, target));
}

/** What the gauge shows: the pieces' sway plus leverage, 0 to MAX_SWAY. */
export function towerSway(t: Pick<TowerNow, 'build' | 'unbraced' | 'target'>): number {
  return round1(clamp(t.build + leverage(t.unbraced, t.target)));
}

export interface PieceEffect {
  kind: PieceKind;
  floors: number;
  /** Change to the gauge, as printed. */
  sway: number;
  /** The gauge after placing it (0 to MAX_SWAY). */
  after: number;
  /** The tower's numbers after placing it. */
  next: Pick<TowerNow, 'build' | 'unbraced'>;
}

/** What placing a piece would do to a tower. */
export function pieceEffect(kind: PieceKind, t: TowerNow): PieceEffect {
  const floors = PIECES[kind].floors;
  const next = { build: round1(clamp(t.build + swayFor(kind, t.crew))), unbraced: kind === 'lantern' ? 0 : t.unbraced + floors };
  const before = towerSway(t);
  const after = towerSway({ ...next, target: t.target });
  return { kind, floors, sway: round1(after - before), after, next };
}

/** Whether a gust of this strength knocks down a tower swaying this much. */
export function topples(sway: number, strength: GustStrength): boolean {
  return sway > STRENGTHS[strength].limit;
}

/** The class target in floors for a crew of `crew` builders over a night of `nightSec` (lower on a Storm Night). */
export function targetFloors(crew: number, nightSec: number, setting: TargetSetting = 'standard', wind: WindSetting = 'normal'): number {
  const n = Math.max(1, crew);
  const per = TARGET.perBuilder[setting] * Math.max(0.25, nightSec / TARGET.nightSec) * (wind === 'storm' ? TARGET.storm : 1);
  return Math.max(8, Math.round((TARGET.base + per * n) / 2) * 2);
}

/** Stars for a height against a target (0 to 3) and the heights each star needs. */
export function starsFor(height: number, target: number): { stars: number; steps: number[] } {
  const steps = STAR_STEPS.map((k) => Math.ceil(target * k));
  return { stars: steps.filter((s) => height >= s).length, steps };
}
