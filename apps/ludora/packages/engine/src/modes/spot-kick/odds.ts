/*
 * The chances of every penalty, worked out in one place: the mode draws from
 * these numbers and players see exactly the same ones. Browser-safe.
 */
import { AIMS, BASE_ODDS, GUARD_BONUS, MIN_GOAL, POWERS, READ_MAX, READ_STEP, type Aim, type Outcome, type Power } from './meta.ts';

/** How well the keeper has learned each place, 0 to READ_MAX. */
export type Reads = Record<Aim, number>;

export interface ShotMoment {
  aim: Aim;
  power: Power;
  /** What the keeper has learned of this place (0 to READ_MAX). */
  read: number;
  /** Keeper duty: the keeper guards this place. */
  guarded: boolean;
}

export interface ShotOdds {
  aim: Aim;
  power: Power;
  /** Percent, 0 to 100; the three add up to 100. */
  goal: number;
  saved: number;
  wide: number;
  read: number;
  guarded: boolean;
}

export const noReads = (): Reads => ({ tl: 0, tr: 0, mid: 0, bl: 0, br: 0 });

/** The chances of one shot. */
export function shotOdds(m: ShotMoment): ShotOdds {
  const base = BASE_ODDS[m.power][m.aim];
  const read = Math.max(0, Math.min(READ_MAX, m.read));
  const wide = base.wide;
  const saved = Math.min(100 - wide - MIN_GOAL, base.save + read * READ_STEP + (m.guarded ? GUARD_BONUS : 0));
  return { aim: m.aim, power: m.power, goal: 100 - wide - saved, saved, wide, read, guarded: m.guarded };
}

/** Every shot a player could take now, in the order of the buttons. */
export function allOdds(reads: Reads, guard: readonly Aim[] | null): ShotOdds[] {
  return POWERS.flatMap((power) => AIMS.map((aim) => shotOdds({ aim, power, read: reads[aim], guarded: Boolean(guard?.includes(aim)) })));
}

/** What the keeper learns from a shot at `aim`: that place a step more, every other place a step less. */
export function learn(reads: Reads, aim: Aim): Reads {
  const next = { ...reads };
  for (const a of AIMS) next[a] = a === aim ? Math.min(READ_MAX, reads[a] + 1) : Math.max(0, reads[a] - 1);
  return next;
}

/** The average points a shot is worth (a goal is 1, or 2 on fire). */
export const expectedPoints = (o: ShotOdds, onFire: boolean) => (o.goal / 100) * (onFire ? 2 : 1);

/** Turn one roll in [0, 1) into an outcome, with exactly the chances shown. */
export function outcomeOf(o: ShotOdds, roll: number): Outcome {
  const r = roll * 100;
  if (r < o.wide) return 'wide';
  if (r < o.wide + o.saved) return 'saved';
  return 'goal';
}
