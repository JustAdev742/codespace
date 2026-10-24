import type { ChaosSim } from '../src/testing/chaos.ts';
import type { CheatDef } from '../src/chaos/types.ts';

/*
 * Situations some cheats need before they can show what they do, used by the
 * catalogue suite. PRE runs on both games before the cast; POST runs on both
 * games after it, with the cheat's first target.
 */

export const SETTINGS: Record<string, Record<string, unknown>[]> = {
  // Modes where play can take score away only with these settings on.
  classic: [{ wrongPenalty: 200 }],
  'quick-draw': [{ penalty: true }],
};

/** Someone else casts a harmless-to-test cheat on `victim`, so there is a culprit to get revenge on. */
function attackedBy(sim: ChaosSim, victim: string) {
  const other = sim.ids.find((id) => id !== victim && sim.rt.hasPlayer(id));
  if (other) sim.cast(other, { cheatId: 'score.halve-gains', target: victim });
}

export const PRE: Record<string, (sim: ChaosSim, caster: string) => void> = {
  'score.revenge': attackedBy,
};

/** The target stops playing, so a cheat that punishes not scoring can go off. */
const idleTarget = (sim: ChaosSim, _caster: string, _def: CheatDef, target: string | null) => {
  if (target) sim.idle.add(target);
};

/** Which casters to try first (default: furthest behind first). */
export const CASTERS: Record<string, 'richest'> = {
  // Protection against losses needs something to lose.
  'score.lock': 'richest',
  'score.insurance': 'richest',
};

/** Which targets to try first (default: richest first). */
export const TARGETS: Record<string, 'closest-above'> = {
  'score.bounty': 'closest-above',
};

/** Lasting cheats that wait for a situation (the hunter overtaking the target) before they act. */
export const REACTIVE = new Set(['score.bounty']);

export const POST: Record<string, (sim: ChaosSim, caster: string, def: CheatDef, target: string | null) => void> = {
  'score.time-bomb': idleTarget,
  // The bounty target stops scoring so the hunter can catch up.
  'score.bounty': idleTarget,
};
