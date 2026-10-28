import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, ScenarioSet } from '../chaos-scenarios.ts';

/*
 * Catalogue-suite scenarios for festival-workshop cheats. See chaos-scenarios.ts for what each field does.
 *
 * Some cheats work on a moment that comes and goes (a Festival Favour offer,
 * a running event, a parade order). These play both games on identically
 * until the moment arrives, stop a bot so it lasts when needed, or have
 * another player cast a cheat that sets it up. Nothing edits the state by hand.
 */

const workshops = (sim: ChaosSim): Record<string, any> => sim.state().workshops;
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
const rivals = (sim: ChaosSim, caster: string) => live(sim).filter((id) => id !== caster);

function until(sim: ChaosSim, pred: () => boolean, maxMs = 150_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  return pred();
}

/** Play on until a rival is in some state, then stop that rival's bot so the state lasts. */
const rivalHolds =
  (what: (w: any, sim: ChaosSim) => boolean): Pre =>
  (sim, caster) => {
    const find = () => rivals(sim, caster).find((id) => what(workshops(sim)[id], sim));
    if (!find()) until(sim, () => Boolean(find()));
    const id = find();
    if (id) sim.idle.add(id);
  };

const rivalOffer = rivalHolds((w) => Boolean(w?.offer));
const rivalOfferCallerFree: Pre = (sim, caster) => {
  until(sim, () => !workshops(sim)[caster]?.offer);
  rivalOffer(sim, caster);
};
const rivalBoost = rivalHolds((w, sim) => (w?.overtimeUntil ?? 0) > sim.now + 2000 || (w?.paradeUntil ?? 0) > sim.now + 2000);
const callerOffer: Pre = (sim, caster) => void until(sim, () => Boolean(workshops(sim)[caster]?.offer && !workshops(sim)[caster].offer.prank));

/** Another player stops the caster's stations, so there is something to fix. */
const callerStopped: Pre = (sim, caster) => {
  const by = rivals(sim, caster)[0];
  if (by && !workshops(sim)[caster].slots.some((st: any) => st && st.stoppedUntil > sim.now)) sim.cast(by, { cheatId: 'festival-workshop.stop-line', target: caster });
};

const callerLock: Pre = (sim, caster) => {
  if (!workshops(sim)[caster]?.lock) sim.cast(caster, { cheatId: 'festival-workshop.spare-lock' });
};

const eventOn: Pre = (sim) => void until(sim, () => Boolean(sim.state().event));

/** A parade order with goods already made: wait for a quiet moment, have another player call one, and let it run a little. */
const paradeOn: Pre = (sim, caster) => {
  if (sim.state().event?.kind !== 'parade') {
    until(sim, () => !sim.state().event);
    const by = rivals(sim, caster)[0];
    if (by) sim.cast(by, { cheatId: 'festival-workshop.summon-event', params: { event: 'parade' } });
  }
  until(sim, () => rivals(sim, caster).some((id) => workshops(sim)[id].contribution > 0), 10_000);
  sim.run(2000);
};

export const scenarios: ScenarioSet = {
  pre: {
    'festival-workshop.untangle': callerStopped,
    'festival-workshop.boost-heist': rivalBoost,
    'festival-workshop.pass-lock': callerLock,
    'festival-workshop.reshuffle-favours': callerOffer,
    'festival-workshop.torn-cards': rivalOffer,
    'festival-workshop.card-snatch': rivalOfferCallerFree,
    'festival-workshop.hurry-favour': rivalOffer,
    'festival-workshop.early-bell': eventOn,
    'festival-workshop.encore-hour': eventOn,
    'festival-workshop.parade-poach': paradeOn,
    'festival-workshop.short-parade': paradeOn,
  },
};
