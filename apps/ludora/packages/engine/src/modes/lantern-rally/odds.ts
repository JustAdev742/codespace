/*
 * What a lantern gives, worked out in one place: the mode draws from these
 * weights and the screens print the same numbers as percentages. Browser-safe.
 */
import type { Rng } from '@ludora/shared';
import { PRIZES, type Prize } from './meta.ts';

/** The chance of each prize, in whole percent, as every screen shows them. */
export function prizeOdds(): { prize: Prize; percent: number }[] {
  const total = PRIZES.reduce((n, p) => n + p.weight, 0);
  return PRIZES.map((p) => ({ prize: p.prize, percent: Math.round((p.weight / total) * 100) }));
}

/** Draw a lantern's prize with exactly the weights the screens print. */
export function drawPrize(rng: Rng): Prize {
  const total = PRIZES.reduce((n, p) => n + p.weight, 0);
  let roll = rng.next() * total;
  for (const p of PRIZES) {
    roll -= p.weight;
    if (roll < 0) return p.prize;
  }
  return PRIZES[PRIZES.length - 1]!.prize;
}
