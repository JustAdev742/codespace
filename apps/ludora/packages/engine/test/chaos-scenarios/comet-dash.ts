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

/**
 * A racer answers right, one answer at a time, until a move of theirs reaches a wormhole (the mode's or a
 * magnet's) or no wormhole is left ahead of them, so wormhole cheats have a jump to work on.
 */
function untilWormhole(sim: ChaosSim, id: string | null) {
  if (!id) return;
  for (let i = 0; i < 15 && sim.rt.status === 'running' && sim.rt.hasPlayer(id); i++) {
    const r = sim.state().racers[id];
    if (!r || r.place !== null || !(sim.state().wormholes as number[]).some((w) => w > r.pos)) return;
    forceAnswer(sim, id, true);
    const notes: string[] = sim.state().racers[id]?.lastMove?.notes ?? [];
    if (notes.includes('Wormhole') || notes.includes('Wormhole magnet')) return;
  }
}

export const scenarios: ScenarioSet = {
  // Setbacks, star gates, momentum, wormholes and racing together are race settings.
  settings: { 'comet-dash': [{ wrongSetback: true }, { starGates: 5 }, { momentum: true }, { wormholes: true }, { together: true }] },
  pre: { 'comet-dash.rewind': casterWrong },
  post: {
    'comet-dash.meteor-shower': targetWrong,
    'comet-dash.boost-hijack': targetRightThrice,
    'comet-dash.streak-saver': casterStreakThenMiss,
    'comet-dash.gate-anchor': casterMiss,
    'comet-dash.wormhole-backfire': (sim, _caster, _def, target) => untilWormhole(sim, target),
    'comet-dash.wormhole-magnet': (sim, caster) => untilWormhole(sim, caster),
    'comet-dash.gate-lock': targetRightThrice,
  },
  casters: { 'comet-dash.gate-anchor': 'richest', 'comet-dash.slipstream-lock': 'richest' },
  // The chart is information on the caster's screen.
  screen: ['comet-dash.star-chart'],
};
