import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for survival-run cheats. See chaos-scenarios.ts for what each field does. */

/** The runner answers now, right (skill 1) or wrong (skill 0), first moving on from a result screen if they are on one. */
export function runnerAnswers(sim: ChaosSim, id: string, right: boolean) {
  for (let i = 0; i < 2; i++) {
    if (sim.rt.status !== 'running' || !sim.rt.hasPlayer(id)) return;
    const action = sim.rt.botAction(id, right ? 1 : 0, createRng(23)) as { type?: string } | null;
    if (!action) return;
    sim.rt.act(id, action);
    if (action.type === 'answer') return;
  }
}

// Defined here, not imported: chaos-scenarios.ts loads this file while it is still loading itself.
const idleTarget: Post = (sim, _caster, _def, target) => void (target && sim.idle.add(target));
const casterRight: Post = (sim, caster) => runnerAnswers(sim, caster, true);
const casterWrong: Post = (sim, caster) => runnerAnswers(sim, caster, false);
const targetWrong: Post = (sim, _caster, _def, target) => target && runnerAnswers(sim, target, false);

export const scenarios: ScenarioSet = {
  // Second wind is a run setting.
  settings: { 'survival-run': [{ secondWind: true }] },
  post: {
    'survival-run.guardian-heart': casterWrong,
    'survival-run.lifesteal': casterRight,
    'survival-run.last-stand': casterRight,
    'survival-run.glass-heart': targetWrong,
    'survival-run.ticking-heart': idleTarget,
  },
};
