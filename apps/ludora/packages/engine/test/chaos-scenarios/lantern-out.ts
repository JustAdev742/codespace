import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for lantern-out cheats. See chaos-scenarios.ts for what each field does. */

/** The last player stops answering, so they run out of lanterns and there is someone to revive (or not). */
const lastPlayerFades: Pre = (sim) => void sim.idle.add(sim.ids[sim.ids.length - 1]!);

/** The target stops answering, so they lose lanterns while the effect runs. */
const targetFades: Post = (sim, _caster, _def, target) => void (target && sim.idle.add(target));

export const scenarios: ScenarioSet = {
  settings: { 'lantern-out': [{ kindling: true }] },
  pre: {
    'lantern-out.call-revival': lastPlayerFades,
    'lantern-out.snuff-revival': lastPlayerFades,
  },
  post: {
    'lantern-out.windbreak': targetFades,
    'lantern-out.downdraft': targetFades,
    'lantern-out.moth-to-the-flame': targetFades,
  },
};
