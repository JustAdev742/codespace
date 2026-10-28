import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, ScenarioSet } from '../chaos-scenarios.ts';

/*
 * Catalogue-suite scenarios for gold-rush cheats. See chaos-scenarios.ts for what each field does.
 *
 * Most Gold Rush cheats need something in a cart, someone deep enough to be
 * knocked back up, a bank trip behind them or an event running. These play
 * both games on (identically, so they stay twins) until the moment comes.
 * Nothing here edits the game state by hand.
 */

const miners = (sim: ChaosSim): Record<string, any> => sim.state().miners;
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
const rivals = (sim: ChaosSim, caster: string) => live(sim).filter((id) => id !== caster);

function until(sim: ChaosSim, pred: () => boolean, maxMs = 150_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  return pred();
}

const rivalHas = (what: (m: any) => boolean): Pre => (sim, caster) => void until(sim, () => rivals(sim, caster).some((id) => what(miners(sim)[id])));
const callerHas = (what: (m: any) => boolean): Pre => (sim, caster) => void until(sim, () => what(miners(sim)[caster]));

const rivalCart = rivalHas((m) => m?.cart > 0);
const callerCart = callerHas((m) => m?.cart >= 2);
const eventOn: Pre = (sim) => void until(sim, () => Boolean(sim.state().event) && sim.state().event.endsAt > sim.now);
const noEvent: Pre = (sim) => void until(sim, () => !sim.state().event || sim.state().event.endsAt <= sim.now);

export const scenarios: ScenarioSet = {
  // Cave-ins come sooner on wild ground, so the charm and termites get their chance.
  settings: { 'gold-rush': [{ risk: 'wild' }] },
  pre: {
    'gold-rush.claim-map': rivalCart,
    'gold-rush.leaky-cart': rivalCart,
    'gold-rush.cart-swap': rivalCart,
    'gold-rush.licence-fee': rivalCart,
    'gold-rush.loose-rocks': rivalHas((m) => m?.depth >= 1),
    'gold-rush.pickpocket': rivalHas((m) => m?.digs > 0),
    'gold-rush.flash-flood': rivalHas((m) => m?.digs > 0),
    'gold-rush.termites': rivalHas((m) => m?.gear.props > 0),
    'gold-rush.night-bank': callerCart,
    'gold-rush.gold-buyer': callerCart,
    'gold-rush.pan-tailings': callerHas((m) => m?.lastBank > 0),
    'gold-rush.calm-field': eventOn,
    'gold-rush.long-shift': eventOn,
    'gold-rush.start-fever': noEvent,
    'gold-rush.start-steady': noEvent,
    'gold-rush.start-rich-lead': noEvent,
  },
  reactive: [
    'gold-rush.golden-touch',
    'gold-rush.timber-charm',
    'gold-rush.mudlark',
    'gold-rush.dig-rush',
    'gold-rush.bonanza-sense',
    'gold-rush.gear-sale',
    'gold-rush.sticky-mud',
    'gold-rush.blunt-pick',
    'gold-rush.fools-gold',
    'gold-rush.flash-flood',
  ],
};
