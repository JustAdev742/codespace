import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for lantern-guard cheats. See chaos-scenarios.ts for what each field does. */

/** Guards feed the Great Lantern (the mode's own action) until `enough` says stop or nobody can. */
function feedUntil(sim: ChaosSim, enough: (flare: { pot: number; charged: boolean }) => boolean) {
  for (let round = 0; round < 20; round++) {
    let fed = false;
    for (const id of sim.ids) {
      const flare = sim.state().flare;
      if (enough(flare) || flare.charged) return;
      if (sim.rt.hasPlayer(id) && sim.rt.act(id, { type: 'feed' }).ok) fed = true;
    }
    if (!fed) return;
  }
}

/** There is some gold in the Great Lantern to take. */
const someGoldIn: Pre = (sim) => feedUntil(sim, (f) => f.pot > 0);
/** The Great Lantern is full (it flares by itself once the road is busy, so this runs before every try). */
const lanternFull: Pre = (sim) => feedUntil(sim, (f) => f.charged);
/** The caster feeds the Great Lantern straight after casting. */
const casterFeeds: Post = (sim, caster) => void sim.rt.act(caster, { type: 'feed' });

export const scenarios: ScenarioSet = {
  pre: { 'lantern-guard.lantern-pilfer': someGoldIn, 'lantern-guard.ignite': lanternFull },
  post: { 'lantern-guard.matching-funds': casterFeeds },
  reactive: ['lantern-guard.matching-funds', 'lantern-guard.gloom-bounty'],
};
