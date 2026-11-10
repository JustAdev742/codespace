/*
 * The chance of a leap, worked out in one place: the mode draws from this
 * number and the Leap button prints the same one. Browser-safe.
 */
import { LEAP, LEAP_CHANCE } from './meta.ts';

/** Percent chance a leap works now. */
export function leapChance(windBlowing: boolean): number {
  return windBlowing ? LEAP_CHANCE.wind : LEAP_CHANCE.calm;
}

export interface LeapOdds {
  /** Percent, 0 to 100. */
  chance: number;
  cost: number;
  gain: number;
  slip: number;
  /** Where a leap would land, and where a slip would leave you, from a ledge. */
  land: number;
  fall: number;
  /** Ledges a leap gains on average from here (a slip counted as a loss), to set against two climbs. */
  average: number;
}

/** The odds of a leap from a ledge, never landing past the summit nor falling below the last camp. */
export function leapOdds(ledge: number, floor: number, summit: number, windBlowing: boolean): LeapOdds {
  const chance = leapChance(windBlowing);
  const land = Math.min(summit, ledge + LEAP.gain);
  const fall = Math.max(floor, ledge - LEAP.slip);
  const average = (chance / 100) * (land - ledge) - (1 - chance / 100) * (ledge - fall);
  return { chance, cost: LEAP.cost, gain: LEAP.gain, slip: LEAP.slip, land, fall, average: Math.round(average * 100) / 100 };
}
