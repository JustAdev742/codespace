import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for time-attack cheats. See chaos-scenarios.ts for what each field does. */

/** The player answers the question on their screen now: right (skill 1) or wrong (skill 0). */
function answers(sim: ChaosSim, id: string, right: boolean) {
  if (sim.rt.status !== 'running' || !sim.rt.hasPlayer(id)) return;
  const action = sim.rt.botAction(id, right ? 1 : 0, createRng(29));
  if (action) sim.rt.act(id, action);
}

const casterWrong: Post = (sim, caster) => answers(sim, caster, false);
const targetWrong: Post = (sim, _caster, _def, target) => target && answers(sim, target, false);
const targetRight: Post = (sim, _caster, _def, target) => target && answers(sim, target, true);

export const scenarios: ScenarioSet = {
  // Bonus seconds are a run setting.
  settings: { 'time-attack': [{ bonusSeconds: 2 }] },
  post: {
    'time-attack.penalty-box': targetWrong,
    'time-attack.time-shield': casterWrong,
    'time-attack.multiplier-lock': casterWrong,
    'time-attack.safety-net': casterWrong,
    'time-attack.fuse-snuffer': targetRight,
  },
  // A multiplier worth locking comes from a good run.
  casters: { 'time-attack.multiplier-lock': 'richest' },
};
