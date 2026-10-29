import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import { answersWrong } from './tug-of-war.ts';

/* Catalogue-suite scenarios for sky-lanterns cheats. See chaos-scenarios.ts for what each field does. */

/** A player taps launch or light (refused harmlessly if they have nothing to launch or too little oil). */
const tap = (sim: ChaosSim, id: string | null, type: 'launch' | 'light') => {
  if (id && sim.rt.hasPlayer(id)) sim.rt.act(id, { type });
};

/** The target stops playing, so lanterns they have waiting stay on the ground for the cheat to reach. */
const targetWaits: Post = (sim, _caster, _def, target) => {
  if (target) sim.idle.add(target);
};

const targetLaunches: Post = (sim, _caster, _def, target) => tap(sim, target, 'launch');
const casterLaunches: Post = (sim, caster) => tap(sim, caster, 'launch');

const someoneElse = (sim: ChaosSim, caster: string) => sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id));

/** Lightning (cast by someone else) blows out some of the caster's lanterns, so there are lost lanterns to relight. */
const casterStruck: Pre = (sim, caster) => {
  const other = someoneElse(sim, caster);
  if (other) sim.cast(other, { cheatId: 'sky-lanterns.lightning', target: caster });
};

export const scenarios: ScenarioSet = {
  pre: { 'sky-lanterns.rekindle': casterStruck },
  post: {
    'sky-lanterns.raincloud': targetWaits,
    'sky-lanterns.fuse-lantern': targetWaits,
    // A storm front makes the next change 90% stormy; the sheltered caster keeps their lanterns on the ground for it.
    'sky-lanterns.shelter': (sim, caster) => {
      sim.idle.add(caster);
      const other = someoneElse(sim, caster);
      if (other) sim.cast(other, { cheatId: 'sky-lanterns.storm-front' });
    },
    // Everyone else keeps their lanterns on the ground, and a storm front makes the next change 90% stormy.
    'sky-lanterns.storm-chaser': (sim, caster) => {
      for (const id of sim.ids) if (id !== caster) sim.idle.add(id);
      const other = someoneElse(sim, caster);
      if (other) sim.cast(other, { cheatId: 'sky-lanterns.storm-front' });
    },
    'sky-lanterns.updraft': casterLaunches,
    'sky-lanterns.high-drift': casterLaunches,
    // The wind drops to calm, so the bottled (stronger) wind is worth uncorking on the next launch.
    'sky-lanterns.bottled-wind': (sim, caster) => {
      const other = someoneElse(sim, caster);
      if (other) sim.cast(other, { cheatId: 'sky-lanterns.dead-calm' });
      tap(sim, caster, 'launch');
    },
    'sky-lanterns.crosswind': targetLaunches,
    // Tangling needs a launch of two or more: the target lights what it can, a festival adds one, then it launches.
    'sky-lanterns.tangled-strings': (sim, caster, _def, target) => {
      tap(sim, target, 'light');
      tap(sim, target, 'light');
      sim.cast(caster, { cheatId: 'sky-lanterns.festival' });
      tap(sim, target, 'launch');
    },
    'sky-lanterns.grounded': targetLaunches,
    'sky-lanterns.wet-wicks': (sim, _caster, _def, target) => tap(sim, target, 'light'),
    'sky-lanterns.leaky-curse': answersWrong,
  },
  // Cheats on your own waiting lanterns need someone with lanterns to cast them.
  casters: {
    'sky-lanterns.updraft': 'richest',
    'sky-lanterns.bottled-wind': 'richest',
    'sky-lanterns.shelter': 'richest',
    'sky-lanterns.twin-wicks': 'richest',
    'sky-lanterns.high-drift': 'richest',
    'sky-lanterns.rekindle': 'richest',
  },
};
