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
function usePower(sim: ChaosSim, id: string | null, powers = ['shield', 'strike', 'mend']) {
  if (!id) return;
  untilQuestion(sim);
  const s = sim.state();
  if (s.sync.phase !== 'question' || s.sync.answers[id]) return;
  for (const power of powers) {
    if (sim.rt.act(id, { type: 'power', iid: s.sync.iid, power }).ok) return;
  }
}

const targetUsesPower: Post = (sim, _caster, _def, target) => usePower(sim, target);
const casterUsesPower: Post = (sim, caster) => usePower(sim, caster);

/** Two other players hex the caster's Glim down to half health and the caster fills their charge, so a mend has room to heal twice over. */
const hurtAndCharged: Pre = (sim, caster) => {
  for (const id of sim.ids.filter((x) => x !== caster && sim.rt.hasPlayer(x)).slice(0, 2)) sim.cast(id, { cheatId: 'glim-duels.hex-bolt', target: caster });
  sim.cast(caster, { cheatId: 'glim-duels.overcharge' });
};

export const scenarios: ScenarioSet = {
  pre: {
    'glim-duels.shatter': othersCast('glim-duels.aegis'),
    'glim-duels.strike-thief': othersCast('glim-duels.overdrive'),
    'glim-duels.shadow-fumble': oddOneOut,
    'glim-duels.shadow-surge': oddOneOut,
    // The mirror needs a raised shield to polish.
    'glim-duels.mirror-shield': (sim, caster) => sim.cast(caster, { cheatId: 'glim-duels.aegis' }),
    'glim-duels.golden-mend': hurtAndCharged,
  },
  post: {
    'glim-duels.short-circuit': targetUsesPower,
    'glim-duels.spark-refund': casterUsesPower,
    'glim-duels.golden-mend': (sim, caster) => usePower(sim, caster, ['mend']),
  },
  // A wager that is lost needs a point to lose.
  casters: { 'glim-duels.spark-refund': 'richest', 'glim-duels.wager': 'richest' },
  // These wait for something in the duel (a blocked hit, its end) and act on a timer rather than bending a move.
  reactive: ['glim-duels.mirror-shield', 'glim-duels.wager'],
};
