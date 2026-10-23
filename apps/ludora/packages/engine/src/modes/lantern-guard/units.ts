/*
 * Lantern Guard's pieces: what each tower and gloomling can do, and the gold,
 * wave and upgrade numbers. Pure data (no game rules), shared by the engine,
 * the rules text and the screens, so none of them can disagree.
 */

export type TowerKind = 'spark' | 'beam' | 'frost' | 'firework';
export type GloomKind = 'wisp' | 'shade' | 'brute' | 'lord';

export interface TowerSpec {
  name: string;
  cost: number;
  /** Damage per shot at level 1. */
  damage: number;
  /** Milliseconds between shots at level 1. */
  every: number;
  /** Reach in map units at level 1. */
  range: number;
  /** Who it aims at: the gloomling furthest along, the one with the most health left, or the furthest along that is not slowed yet. */
  aim: 'first' | 'toughest' | 'unslowed';
  /** Fires this much faster per level above 1 (0.1 is 10%). */
  haste: number;
  /** A firework hits every gloomling this close to its target. */
  splash?: number;
  /** A frost tower slows its target by this share for this long. Slows do not stack. */
  slow?: { by: number; ms: number };
  /** One line for the build sheet. */
  blurb: string;
}

export const TOWERS: Record<TowerKind, TowerSpec> = {
  spark: { name: 'Spark', cost: 40, damage: 6, every: 500, range: 22, aim: 'first', haste: 0.1, blurb: 'Quick zaps at the gloomling in front.' },
  beam: { name: 'Beam', cost: 75, damage: 28, every: 1600, range: 32, aim: 'toughest', haste: 0, blurb: 'A long, strong beam at the toughest gloomling.' },
  frost: { name: 'Frost', cost: 60, damage: 2, every: 1000, range: 20, aim: 'unslowed', haste: 0.1, slow: { by: 0.45, ms: 1600 }, blurb: 'Slows a gloomling down by almost half.' },
  firework: { name: 'Firework', cost: 110, damage: 16, every: 2000, range: 26, aim: 'first', haste: 0, splash: 12, blurb: 'Bursts over a crowd and hits them all.' },
};

export const TOWER_ORDER: readonly TowerKind[] = ['spark', 'beam', 'frost', 'firework'];

/** Which towers each `towers` setting allows. */
export const TOWER_SETS: Record<string, readonly TowerKind[]> = {
  all: TOWER_ORDER,
  'frost-fire': ['frost', 'firework'],
};

/**
 * Gloomling health for each `towers` setting. Frost and Firework towers on
 * their own deal far less damage for their gold than a mix with Sparks and
 * Beams, so the gloom is weaker to match (measured with bot games).
 */
export const TOWER_SET_TOUGHNESS: Record<string, number> = { all: 1, 'frost-fire': 0.66 };

export const MAX_LEVEL = 3;
/** Upgrade price as a share of the tower's own price: to level 2, then to level 3. */
export const UPGRADE_SHARE = [0.8, 1.4] as const;
/** Every level multiplies damage and reach by these. */
export const LEVEL_DAMAGE = 1.55;
export const LEVEL_RANGE = 1.08;

export interface TowerStats {
  damage: number;
  every: number;
  range: number;
  splash: number;
  slow: { by: number; ms: number } | null;
}

/** A tower's numbers at a level (1 to 3). */
export function towerStats(kind: TowerKind, level: number): TowerStats {
  const t = TOWERS[kind];
  const up = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return {
    damage: Math.round(t.damage * LEVEL_DAMAGE ** up * 10) / 10,
    every: Math.round(t.every / (1 + t.haste) ** up),
    range: Math.round(t.range * LEVEL_RANGE ** up * 10) / 10,
    splash: t.splash ?? 0,
    slow: t.slow ?? null,
  };
}

/** Gold to take a tower from `level` to the next one, or null at the top level. */
export function upgradeCost(kind: TowerKind, level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  return Math.round(TOWERS[kind].cost * UPGRADE_SHARE[level - 1]!);
}

export interface GloomSpec {
  name: string;
  plural: string;
  /** Health before the wave, room and difficulty multipliers. */
  hp: number;
  /** Path lengths per second, so every map takes about as long to cross. */
  speed: number;
  /** Lights it puts out if it reaches the Great Lantern. */
  lights: number;
  boss: boolean;
}

export const GLOOMLINGS: Record<GloomKind, GloomSpec> = {
  wisp: { name: 'Wisp', plural: 'Wisps', hp: 30, speed: 0.065, lights: 1, boss: false },
  shade: { name: 'Shade', plural: 'Shades', hp: 60, speed: 0.05, lights: 1, boss: false },
  brute: { name: 'Brute', plural: 'Brutes', hp: 180, speed: 0.032, lights: 2, boss: false },
  lord: { name: 'Gloom Lord', plural: 'Gloom Lords', hp: 600, speed: 0.025, lights: 6, boss: true },
};

export const GLOOM_ORDER: readonly GloomKind[] = ['wisp', 'shade', 'brute', 'lord'];

/* Gold. */
export const START_GOLD = 50;
export const GOLD_PER_RIGHT = 20;
/** Extra gold for a right answer on a streak of STREAK_FROM or more. */
export const STREAK_GOLD = 5;
export const STREAK_FROM = 3;
/** Every connected player gets this when a wave is held. */
export const WAVE_GOLD = 10;

/* Waves. */
export const FIRST_WAVE_MS = 15_000;
export const WAVE_EVERY_MS = 28_000;
/** A wave's gloomlings set off over this long. */
export const SPAWN_WINDOW_MS = 12_000;
/** Each wave after the first adds this share of base health. */
export const HP_PER_WAVE = 0.28;
export const DIFFICULTY_HP: Record<string, number> = { easy: 0.75, normal: 1, hard: 1.15 };

/* The Great Lantern's flare: the whole room feeds it gold, and when it is full it burns every gloomling on the path. */
/** Gold one tap gives. */
export const FLARE_GIFT = 25;
/** The flare takes this share of every gloomling's full health (a Gloom Lord's a smaller share). */
export const FLARE_BURN = 0.35;
export const FLARE_BURN_BOSS = 0.1;
/** ...and slows them all for a moment, like frost. */
export const FLARE_SLOW_MS = 3_000;
/** A full lantern waits for a busy road: this many gloomlings, or any Gloom Lord. */
export const FLARE_CROWD = 5;

/** The battle moves on in steps of this long (game time). */
export const TICK_MS = 250;
