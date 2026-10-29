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

function until(sim: ChaosSim, pred: () => boolean, maxMs = 150_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
}

const LIGHTS: Record<string, number> = { wisp: 1, shade: 1, brute: 2, lord: 6 };
/**
 * The gloom has put out at least one light, so there is one to relight. A room of bots holds most
 * nights without a leak, so the guards stop building and spending until one gets through.
 */
const lightLost: Pre = (sim) => {
  const resting = sim.ids.filter((id) => !sim.idle.has(id));
  for (const id of resting) sim.idle.add(id);
  until(sim, () => sim.state().lights < sim.state().maxLights);
  for (const id of resting) sim.idle.delete(id);
};
/** Some gloomling on the road is weaker (fewer lights, then less health) than the one nearest the Great Lantern. */
const weakerBehind: Pre = (sim) =>
  until(sim, () => {
    const on = (sim.state().gloom as { hp: number; p: number; kind: string }[]).filter((g) => g.hp > 0);
    if (on.length < 2) return false;
    const front = on.reduce((a, b) => (b.p > a.p ? b : a));
    return on.some((g) => LIGHTS[g.kind]! < LIGHTS[front.kind]! || (LIGHTS[g.kind] === LIGHTS[front.kind] && g.hp < front.hp));
  });

export const scenarios: ScenarioSet = {
  pre: { 'lantern-guard.lantern-pilfer': someGoldIn, 'lantern-guard.ignite': lanternFull, 'lantern-guard.relight': lightLost, 'lantern-guard.changeling': weakerBehind },
  post: { 'lantern-guard.matching-funds': casterFeeds },
  reactive: ['lantern-guard.matching-funds', 'lantern-guard.gloom-bounty'],
};
