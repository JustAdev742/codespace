import type { Post, ScenarioSet } from '../chaos-scenarios.ts';
import { answersWrong } from './tug-of-war.ts';

/* Catalogue-suite scenarios for gloom-giant cheats. See chaos-scenarios.ts for what each field does. */

/** Someone gets a question wrong straight after the cast: the target, or the caster for cheats aimed at the room. */
const someoneMisses: Post = (sim, caster, def, target) => answersWrong(sim, caster, def, target ?? caster);

export const scenarios: ScenarioSet = {
  // Healing Giant cheats need the giant to heal.
  settings: { 'gloom-giant': [{ regen: true }] },
  post: {
    'gloom-giant.ward': someoneMisses,
    'gloom-giant.jinx': someoneMisses,
    'gloom-giant.thorns': someoneMisses,
    'gloom-giant.vampire': someoneMisses,
    'gloom-giant.lullaby': someoneMisses,
    'gloom-giant.decoy': someoneMisses,
  },
};
