/**
 * Limits and small rules for the player features outside a live game (study, goals,
 * outfits, favourites), shared so the browser and the server agree. The server checks
 * every one of them again.
 */

/** Saved outfits in the locker. */
export const MAX_OUTFITS = 5;
/** Favourites of each kind (modes, sets, Glims). */
export const MAX_FAVOURITES = 50;
/** Wishlist entries in the shop. */
export const MAX_WISHLIST = 30;
/** Questions in one round of "Fix my mistakes". */
export const MISTAKES_PER_ROUND = 10;
/** Questions in the daily challenge. */
export const DAILY_CHALLENGE_QUESTIONS = 5;
/** Right answers, on different days, that take a question off the mistakes list. */
export const MISTAKE_CLEAR_DAYS = 2;
/**
 * Days a mistake rests after it has been got right, before it is asked again. Coming back to
 * something just as it starts to fade is what makes it stick, so a question got right today is not
 * due again tomorrow: it comes back after this rest. (It may still be practised sooner, and a
 * right answer on any later day still counts.)
 */
export const MISTAKE_REST_DAYS = 2;

/**
 * When a mistake is next due. One not yet got right since it was last missed is due now. One got
 * right rests for MISTAKE_REST_DAYS, then is due. Days are `YYYY-MM-DD` in UTC.
 */
export function mistakeDue(rightDays: number, lastRightDay: string | null, today: string): { due: boolean; on: string } {
  if (rightDays <= 0 || !lastRightDay) return { due: true, on: today };
  const d = new Date(`${lastRightDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + MISTAKE_REST_DAYS);
  const on = d.toISOString().slice(0, 10);
  return { due: on <= today, on };
}

export const GOAL_METRICS = ['games', 'correct'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const GOAL_LIMITS: Record<GoalMetric, { min: number; max: number; default: number; label: string; unit: [string, string] }> = {
  games: { min: 1, max: 50, default: 5, label: 'Games played', unit: ['game', 'games'] },
  correct: { min: 10, max: 1000, default: 50, label: 'Right answers', unit: ['right answer', 'right answers'] },
};

/** Card poses and faces a player can choose for their profile card. */
export const CARD_POSES = ['stand', 'wave', 'cheer'] as const;
export type CardPose = (typeof CARD_POSES)[number];
export const CARD_EXPRESSIONS = ['own', 'happy', 'cool', 'fierce', 'surprised'] as const;
export type CardExpression = (typeof CARD_EXPRESSIONS)[number];

/** `YYYY-MM-DD` plus n days, in UTC. */
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Days in a row up to today, from a list of `YYYY-MM-DD` days. A run that ended yesterday still
 * counts (today is not over yet); one that ended before that is broken, so the streak is 0.
 */
export function streakEnding(days: readonly string[], today: string): number {
  const set = new Set(days);
  let day = set.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}
