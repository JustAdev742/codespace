import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for glim-duels cheats. See chaos-scenarios.ts for what each field does. */

/** Every other player casts a free power on their own Glim, so there is something to break or steal. */
const othersCast =
  (cheatId: string): Pre =>
  (sim, caster) => {
    for (const id of sim.ids) if (id !== caster && sim.rt.hasPlayer(id)) sim.cast(id, { cheatId });
  };

/**
 * One player (never the caster) leaves, so from the next round an odd player out duels the Shadow Glim.
 * Only for cheats that target themselves or the room: the suite builds opponent casts from every caster
 * it started with, and the one who left is no longer there to cast.
 */
const oddOneOut: Pre = (sim, caster) => {
  const here = sim.ids.filter((id) => sim.rt.hasPlayer(id));
  if (here.length % 2 === 1) return;
  const leaver = here.filter((id) => id !== caster).at(-1);
  if (leaver) sim.rt.removePlayer(leaver);
};

/** Play on (both games alike) until a question is open. */
function untilQuestion(sim: ChaosSim) {
  for (let i = 0; i < 120 && sim.rt.status === 'running' && sim.state().sync.phase !== 'question'; i++) sim.run(250);
}

/** A player spends charge on a power, so cheats that react to powers have one to see. */
function usePower(sim: ChaosSim, id: string | null) {
  if (!id) return;
  untilQuestion(sim);
  const s = sim.state();
  if (s.sync.phase !== 'question' || s.sync.answers[id]) return;
  for (const power of ['shield', 'strike', 'mend']) {
    if (sim.rt.act(id, { type: 'power', iid: s.sync.iid, power }).ok) return;
  }
}

const targetUsesPower: Post = (sim, _caster, _def, target) => usePower(sim, target);
const casterUsesPower: Post = (sim, caster) => usePower(sim, caster);

export const scenarios: ScenarioSet = {
  pre: {
    'glim-duels.shatter': othersCast('glim-duels.aegis'),
    'glim-duels.strike-thief': othersCast('glim-duels.overdrive'),
    'glim-duels.shadow-fumble': oddOneOut,
    'glim-duels.shadow-surge': oddOneOut,
  },
  post: { 'glim-duels.short-circuit': targetUsesPower, 'glim-duels.spark-refund': casterUsesPower },
  casters: { 'glim-duels.spark-refund': 'richest' },
};
