import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

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
/** The caster has just had a cave-in that cost them gold (a rescue crew only comes within 20 seconds). */
const freshCaveIn: Pre = (sim, caster) => void until(sim, () => {
  const last = miners(sim)[caster]?.last;
  return last?.kind === 'cavein' && last.gold < 0 && sim.now - last.at < 15_000;
});
const gearKey = (m: any) => `${m?.gear.pick}/${m?.gear.props}/${m?.gear.pan}`;
/** A rival has bought gear the caster does not have, so there is a different kit to swap. */
const rivalKit: Pre = (sim, caster) => void until(sim, () => rivals(sim, caster).some((id) => gearKey(miners(sim)[id]) !== gearKey(miners(sim)[caster])));
/** A rival is on a different level from the caster. */
const rivalLevel: Pre = (sim, caster) => void until(sim, () => rivals(sim, caster).some((id) => miners(sim)[id]?.depth !== miners(sim)[caster]?.depth));
/** The target goes to bank their cart straight after the cast (a closed bank turns them away). */
const targetBanks: Post = (sim, _caster, _def, target) => void (target && sim.rt.act(target, { type: 'bank' }));
/** The caster owns some gear to sell. */
const callerGear = callerHas((m) => m && m.gear.pick + m.gear.props + m.gear.pan > 0);

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
    'gold-rush.bank-holiday': rivalCart,
    'gold-rush.rescue-crew': freshCaveIn,
    'gold-rush.kit-swap': rivalKit,
    'gold-rush.shaft-swap': rivalLevel,
    'gold-rush.trade-in': callerGear,
    'gold-rush.vein-thief': (sim, caster) => void until(sim, () => !miners(sim)[caster]?.vein && rivals(sim, caster).some((id) => miners(sim)[id]?.vein)),
  },
  post: { 'gold-rush.bank-holiday': targetBanks },
  // Only a miner who has banked enough has gear to sell.
  casters: { 'gold-rush.trade-in': 'richest' },
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
    'gold-rush.bank-holiday',
    'gold-rush.steady-rope',
  ],
};
