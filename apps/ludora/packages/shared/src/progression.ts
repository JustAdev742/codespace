/**
 * Level curve, shared so the client can draw progress bars that match the
 * server exactly. Each level needs 50 more XP than the one before.
 */
export const MAX_LEVEL = 100;

export function xpToNext(level: number): number {
  return 100 + 50 * (level - 1);
}

export function totalXpForLevel(level: number): number {
  // Sum of xpToNext(1..level-1).
  const n = level - 1;
  return 100 * n + 25 * n * (n - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level needs in total; 0 at the cap. */
  needed: number;
  total: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level++;
  const base = totalXpForLevel(level);
  return { level, into: xp - base, needed: level >= MAX_LEVEL ? 0 : xpToNext(level), total: xp };
}
