import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for comet-dash cheats. See chaos-scenarios.ts for what each field does. */

/** The player answers the question on their screen now: right (skill 1) or wrong (skill 0). */
export function forceAnswer(sim: ChaosSim, id: string, right: boolean) {
  if (sim.rt.status !== 'running' || !sim.rt.hasPlayer(id)) return;
  const action = sim.rt.botAction(id, right ? 1 : 0, createRng(17));
  if (action) sim.rt.act(id, action);
}

const casterWrong: Pre = (sim, caster) => forceAnswer(sim, caster, false);
const targetWrong: Post = (sim, _caster, _def, target) => target && forceAnswer(sim, target, false);
const targetRightThrice: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  for (let i = 0; i < 3; i++) forceAnswer(sim, target, true);
};
/** Build a streak, let the stabiliser see it, then miss. */
const casterStreakThenMiss: Post = (sim, caster) => {
  forceAnswer(sim, caster, true);
  sim.run(600);
  forceAnswer(sim, caster, false);
};
const casterMiss: Post = (sim, caster) => forceAnswer(sim, caster, false);

export const scenarios: ScenarioSet = {
  // Setbacks, star gates, momentum and wormholes are race settings.
  settings: { 'comet-dash': [{ wrongSetback: true }, { starGates: 5 }, { momentum: true }, { wormholes: true }] },
  pre: { 'comet-dash.rewind': casterWrong },
  post: {
    'comet-dash.meteor-shower': targetWrong,
    'comet-dash.boost-hijack': targetRightThrice,
    'comet-dash.streak-saver': casterStreakThenMiss,
    'comet-dash.gate-anchor': casterMiss,
  },
  casters: { 'comet-dash.gate-anchor': 'richest', 'comet-dash.slipstream-lock': 'richest' },
};
