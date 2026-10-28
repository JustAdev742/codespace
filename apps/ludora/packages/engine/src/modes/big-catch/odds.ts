/*
 * Big Catch odds for the current moment: the tables in species.ts and
 * meta.ts with the water, the player's lure, the event and the settings
 * applied. Pure functions over plain values, shared by the engine (to decide
 * a catch) and the screens (to show the odds and species cards), so both
 * always agree. The browser imports this as `@ludora/engine/big-catch`.
 */
import {
  BITE_MS,
  DEEP_SEA,
  FEEDING_BITE,
  FRENZY_BITE,
  GOLDEN_BOOST,
  LURES,
  MAX_LURE,
  POINTS_PER_KG,
  SCHOOL_WEIGHT,
  SET_BONUS,
  SET_SIZE,
  WATER_ORDER,
  type EventId,
  type Lure,
} from './meta.ts';
import { RARITIES, speciesOf, type Rarity, type Species, type SpeciesId, type WaterId } from './species.ts';

/** Everything the screens need, from one entry point. */
export {
  BITE_MS,
  BONUS_CAST_EVERY,
  DECIDE_SEC,
  EVENTS,
  EVENT_INFO,
  EVENT_TIMING,
  LURES,
  MAX_LURE,
  PERFECT_BONUS,
  PERFECT_MS,
  POINTS_PER_KG,
  REEL_WINDOW_MS,
  SET_BONUS,
  SET_SIZE,
  TANK_SIZE,
  TROPHY_COUNT,
  WATER_ORDER,
  WATER_ROTATE_SEC,
  type EventId,
  type Lure,
} from './meta.ts';
export { RARITIES, RARITY_INFO, SPECIES, WATERS, WATER_INFO, speciesById, speciesOf, type Rarity, type Species, type SpeciesId, type SpeciesShape, type WaterId } from './species.ts';

export interface OddsMoment {
  water: WaterId;
  /** The player's lure level, 0 to 3. */
  lure: number;
  /** The event running now, if any. */
  event: EventId | null;
  deepSea: boolean;
  frenzy: boolean;
}

export interface OddsRow {
  species: SpeciesId;
  /** Chance of this fish on the next cast, in percent. */
  percent: number;
  /** Its weight range right now, in kilograms (Passing School makes common fish heavier). */
  minKg: number;
  maxKg: number;
}

export function lureOf(level: number): Lure {
  return LURES[Math.max(0, Math.min(MAX_LURE, Math.floor(level)))]!;
}

/** The next lure a player at `level` can buy, or null at the top. */
export function nextLure(level: number): Lure | null {
  return level >= MAX_LURE ? null : lureOf(level + 1);
}

/** Relative weight of each species in the water right now. */
export function speciesWeights(m: OddsMoment): { species: Species; weight: number }[] {
  const lure = lureOf(m.lure);
  return speciesOf(m.water).map((species) => {
    const r = species.rarity;
    let weight = species.weight * lure.boost[r];
    if (m.event === 'golden') weight *= GOLDEN_BOOST[r];
    if (m.deepSea && r === 'common') weight *= DEEP_SEA.common;
    return { species, weight };
  });
}

/** A species' weight range right now, in kilograms. */
export function weightRange(species: Species, m: Pick<OddsMoment, 'event'>): readonly [number, number] {
  const mult = m.event === 'school' && species.rarity === 'common' ? SCHOOL_WEIGHT : 1;
  return [species.kg[0] * mult, species.kg[1] * mult];
}

/**
 * The weight skew: a fish weighs min + (max − min) × u^skew for an even u in
 * [0, 1), so most fish are near the light end. Better lures and Deep Sea lower
 * the skew, which makes heavy fish more likely.
 */
export function sizeSkew(m: Pick<OddsMoment, 'lure' | 'deepSea'>): number {
  const skew = lureOf(m.lure).skew + (m.deepSea ? DEEP_SEA.skew : 0);
  return Math.max(DEEP_SEA.minSkew, skew);
}

/** A fish's weight in grams for an even draw `u` in [0, 1). */
export function gramsFor(species: Species, u: number, m: OddsMoment): number {
  const [min, max] = weightRange(species, m);
  return Math.round(1000 * (min + (max - min) * Math.pow(u, sizeSkew(m))));
}

/** The middle weight of a species right now, in kilograms: half of these fish are lighter. */
export function medianKg(species: Species, m: OddsMoment): number {
  const [min, max] = weightRange(species, m);
  return min + (max - min) * Math.pow(0.5, sizeSkew(m));
}

/** The chance of every fish on the next cast, in percent, adding up to 100. */
export function oddsTable(m: OddsMoment): OddsRow[] {
  const rows = speciesWeights(m);
  const total = rows.reduce((n, r) => n + r.weight, 0);
  return rows.map(({ species, weight }) => {
    const [minKg, maxKg] = weightRange(species, m);
    return { species: species.id, percent: (weight / total) * 100, minKg, maxKg };
  });
}

/** The chance of each rarity on the next cast, in percent. */
export function rarityPercents(m: OddsMoment): Record<Rarity, number> {
  const out = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  const rows = speciesWeights(m);
  const total = rows.reduce((n, r) => n + r.weight, 0);
  for (const { species, weight } of rows) out[species.rarity] += (weight / total) * 100;
  return out;
}

/** How long a bite takes after a cast right now, in milliseconds: anywhere between the two, evenly. */
export function biteRangeMs(m: Pick<OddsMoment, 'event' | 'deepSea' | 'frenzy'>): readonly [number, number] {
  const [lo, hi] = m.deepSea ? BITE_MS.deepSea : BITE_MS.normal;
  const mult = (m.frenzy ? FRENZY_BITE : 1) * (m.event === 'feeding' ? FEEDING_BITE : 1);
  return [Math.round(lo * mult), Math.round(hi * mult)];
}

/** Points a fish is worth: 10 a kilogram, to the nearest point. */
export function pointsFor(grams: number): number {
  return Math.round((grams * POINTS_PER_KG) / 1000);
}

/** How long (or wide, for a crab) a fish of this weight is, in whole centimetres. Weight grows with the cube of length. */
export function sizeCm(species: Species, grams: number): number {
  const [g0, g1] = [species.kg[0] * 1000, species.kg[1] * 1000];
  const [c0, c1] = species.cm;
  const t = (Math.cbrt(Math.max(1, grams)) - Math.cbrt(g0)) / (Math.cbrt(g1) - Math.cbrt(g0));
  return Math.max(1, Math.round(c0 + (c1 - c0) * t));
}

export interface TankFish {
  species: SpeciesId;
  grams: number;
}

export interface TankValue {
  /** Points of the fish themselves. */
  fish: number;
  /** Set bonuses: every SET_SIZE fish of one rarity. */
  bonus: number;
  total: number;
  /** Fish of each rarity in the tank, and the sets they make. */
  sets: { rarity: Rarity; count: number; sets: number; bonus: number }[];
}

/** What a tank is worth: every fish's points, plus SET_BONUS for every SET_SIZE fish of one rarity. */
export function tankValue(tank: readonly TankFish[], rarityOf: (id: SpeciesId) => Rarity, withSets = true): TankValue {
  const fish = tank.reduce((n, f) => n + pointsFor(f.grams), 0);
  const sets = RARITIES.map((rarity) => {
    const count = tank.filter((f) => rarityOf(f.species) === rarity).length;
    const made = withSets ? Math.floor(count / SET_SIZE) : 0;
    return { rarity, count, sets: made, bonus: made * SET_BONUS[rarity] };
  });
  const bonus = sets.reduce((n, s) => n + s.bonus, 0);
  return { fish, bonus, total: fish + bonus, sets };
}

/** The water after this one when the waters rotate. */
export function nextWater(water: WaterId): WaterId {
  return WATER_ORDER[(WATER_ORDER.indexOf(water) + 1) % WATER_ORDER.length]!;
}

/** A weight as a player reads it: "450 g", "2.3 kg", "31.0 kg". */
export function formatWeight(grams: number): string {
  if (grams < 1000) return `${String(Math.max(10, Math.round(grams / 10) * 10))} g`;
  return `${(grams / 1000).toFixed(1)} kg`;
}
