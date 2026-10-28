import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, ScenarioSet } from '../chaos-scenarios.ts';

/*
 * Catalogue-suite scenarios for night-market cheats. See chaos-scenarios.ts for what each field does.
 *
 * Many Night Market cheats work on a moment that comes and goes: an offer of
 * lanterns being held, a trick waiting for its target, a Lantern Sight charm.
 * These scenarios play both games on (identically, so they stay twins) until
 * the moment arrives, and sometimes stop a bot so the moment lasts until the
 * cast. Nothing here edits the game state by hand.
 */

const stalls = (sim: ChaosSim): Record<string, any> => sim.state().stalls;
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
const rivals = (sim: ChaosSim, caster: string) => live(sim).filter((id) => id !== caster);

/** Play on in small steps until `pred` holds (or time runs out). */
function until(sim: ChaosSim, pred: () => boolean, maxMs = 150_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  return pred();
}

/** Play on until a rival of the caster is in some state, then stop that rival's bot so the state lasts. */
const rivalHolds =
  (what: (st: any) => boolean): Pre =>
  (sim, caster) => {
    const find = () => rivals(sim, caster).find((id) => what(stalls(sim)[id]));
    if (!find()) until(sim, () => Boolean(find()));
    const id = find();
    if (id) sim.idle.add(id);
  };

const callerHoldsOffer: Pre = (sim, caster) => void until(sim, () => Boolean(stalls(sim)[caster]?.offer));

const rivalOfferCallerFree: Pre = (sim, caster) =>
  void until(sim, () => {
    const st = stalls(sim);
    return !st[caster]?.offer && !st[caster]?.pending && rivals(sim, caster).some((id) => st[id]?.offer);
  });

/** Both the caster and a rival hold offers: stop the caster's bot once it has one, then wait for a rival's. */
const bothHoldOffers: Pre = (sim, caster) => {
  if (until(sim, () => Boolean(stalls(sim)[caster]?.offer))) sim.idle.add(caster);
  rivalHolds((st) => Boolean(st?.offer))(sim, caster);
};

/** Two offers open anywhere in the market. */
const twoOffers: Pre = (sim) => {
  const holders = () => live(sim).filter((id) => stalls(sim)[id]?.offer);
  for (let i = 0; i < 2 && holders().length < 2; i++) {
    until(sim, () => holders().some((id) => !sim.idle.has(id)));
    for (const id of holders()) sim.idle.add(id);
  }
};

const rivalPending = rivalHolds((st) => Boolean(st?.pending));
const rivalSight = rivalHolds((st) => Boolean(st?.sight));
const rivalSeesOffer = rivalHolds((st) => Boolean(st?.sight || st?.offer?.sight));

/** The richest rival tops up a Lucky Streak, so there is one to pinch (Lucky Streaks are rare among bots). */
const rivalLucky: Pre = (sim, caster) => {
  if (rivals(sim, caster).some((id) => stalls(sim)[id]?.lucky > 0)) return;
  const rich = rivals(sim, caster).sort((a, b) => stalls(sim)[b].coins - stalls(sim)[a].coins)[0];
  if (rich) sim.cast(rich, { cheatId: 'night-market.four-leaf' });
};

/** Someone swipes the caster, so the market news has a swipe to pay back. */
const swipedByRival: Pre = (sim, caster) => {
  if ((stalls(sim)[caster]?.coins ?? 0) < 100) until(sim, () => stalls(sim)[caster].coins >= 100);
  const by = rivals(sim, caster)[0];
  if (!by) return;
  if (stalls(sim)[caster].shield) sim.cast(by, { cheatId: 'night-market.shield-smash', target: caster });
  sim.cast(by, { cheatId: 'night-market.moonlight-swipe', target: caster });
};

/** The caster tricks someone, so there is a guard and a "last time" to lift. */
const callerTricked: Pre = (sim, caster) => {
  const st = stalls(sim);
  if (st[caster]?.lastTarget || rivals(sim, caster).some((id) => st[id].guardUntil > sim.now)) return;
  const victim = rivals(sim, caster).sort((a, b) => st[b].coins - st[a].coins)[0];
  if (victim) sim.cast(caster, { cheatId: 'night-market.moonlight-swipe', target: victim });
};

const callerShield: Pre = (sim, caster) => {
  if (!stalls(sim)[caster]?.shield) sim.cast(caster, { cheatId: 'night-market.night-watch' });
};

const recentFortune: Pre = (sim, caster) =>
  void until(sim, () => {
    const o = stalls(sim)[caster]?.opened;
    return Boolean(o && o.kind === 'fortune' && o.delta > 0 && sim.now - o.at < 20_000);
  });

const eventOn: Pre = (sim) => void until(sim, () => Boolean(sim.state().event) && sim.state().event.id !== 'lastCall');

export const scenarios: ScenarioSet = {
  pre: {
    'night-market.reroll-offer': callerHoldsOffer,
    'night-market.paint-offer': callerHoldsOffer,
    'night-market.moonlit-peek': callerHoldsOffer,
    'night-market.snatch-offer': rivalOfferCallerFree,
    'night-market.dump-offer': rivalOfferCallerFree,
    'night-market.lockout': rivalOfferCallerFree,
    'night-market.swap-offers': bothHoldOffers,
    'night-market.carousel': twoOffers,
    'night-market.hijack-trick': rivalPending,
    'night-market.fizzle-trick': rivalPending,
    'night-market.point-finger': rivalPending,
    'night-market.hurry-trick': rivalPending,
    'night-market.payback': swipedByRival,
    'night-market.open-season': callerTricked,
    'night-market.pass-shield': callerShield,
    'night-market.sight-thief': rivalSight,
    'night-market.copy-sight': rivalSight,
    'night-market.blindfold': rivalSeesOffer,
    'night-market.lucky-pinch': rivalLucky,
    'night-market.encore': recentFortune,
    'night-market.snuff-event': eventOn,
    'night-market.stretch-event': eventOn,
    'night-market.fickle-moon': eventOn,
  },
  // Lucky Streaks and the trick target come from the richest players first; the default order suits everything else.
  reactive: ['night-market.second-helping'],
};
