import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';
import { PRODUCTS, type ProductId } from '../../src/modes/corner-shop/meta.ts';

/*
 * Catalogue-suite scenarios for corner-shop cheats. See chaos-scenarios.ts for what each field does.
 *
 * Many Corner Shop cheats need a moment to come: someone queuing at a till,
 * a delivery offer open, a shop that has bought something, an event on (or
 * off). These play both games on (identically, so they stay twins) until the
 * moment comes. Nothing here edits the game state by hand: the only moves
 * made are a player stopping (idle) or pressing Serve, in both games alike.
 *
 * No cheat here needs Co-op, a Market Stall or Big Spenders to be offered, so
 * the suite plays the default shop; the pack's own tests cover team shops.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const state = (sim: ChaosSim): any => sim.state();
const clerk = (sim: ChaosSim, id: string): any => state(sim).clerks[id];
const shopOf = (sim: ChaosSim, id: string): any => {
  const c = clerk(sim, id);
  return c ? state(sim).shops[c.shopId] : undefined;
};
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
/** Players in other shops (an opponent never shares the caster's shop). */
const rivals = (sim: ChaosSim, caster: string) => live(sim).filter((id) => id !== caster && shopOf(sim, id) !== shopOf(sim, caster));

function until(sim: ChaosSim, pred: () => boolean, maxMs = 150_000, stepMs = 250) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += stepMs) sim.run(stepMs);
  return pred();
}

const waiting = (sim: ChaosSim, sh: any, leftMs = 0) => (sh?.queue ?? []).filter((cu: any) => cu.leavesAt - sim.now > leftMs);

const callerHas = (what: (sh: any, sim: ChaosSim, id: string) => boolean): Pre => (sim, caster) => void until(sim, () => what(shopOf(sim, caster), sim, caster));
const rivalHas = (what: (sh: any, sim: ChaosSim, id: string) => boolean): Pre => (sim, caster) =>
  void until(sim, () => rivals(sim, caster).some((id) => what(shopOf(sim, id), sim, id)));

const event = (sim: ChaosSim) => {
  const ev = state(sim).event;
  return ev && ev.endsAt > sim.now ? ev : null;
};
/** No event on, none finishing and none about to start, with time for the longest one before the shops shut. */
const quietStreet: Pre = (sim) =>
  void until(sim, () => {
    const s = state(sim);
    return !s.event && (s.nextEventAt === null || s.nextEventAt > sim.now + 1000) && s.endsAt - sim.now > 40_000;
  });
const eventOn: Pre = (sim) => void until(sim, () => Boolean(event(sim)) && event(sim).endsAt - sim.now > 2000, 200_000);
const busyEventOn: Pre = (sim) => void until(sim, () => ['rush', 'sale'].includes(event(sim)?.kind) && event(sim).endsAt - sim.now > 2000, 250_000);

/** An open offer is picked by the bot within a second or two, so these check every 100 ms. */
const callerOffer: Pre = (sim, caster) => void until(sim, () => Boolean(clerk(sim, caster)?.offer), 150_000, 100);
const rivalOffer: Pre = (sim, caster) => void until(sim, () => rivals(sim, caster).some((id) => Boolean(clerk(sim, id)?.offer)), 150_000, 100);

/** A product both shops sell where the rival has more than the caster. */
const rivalFullerShelf: Pre = (sim, caster) =>
  void until(sim, () => {
    const mine = shopOf(sim, caster);
    return rivals(sim, caster).some((id) => {
      const theirs = shopOf(sim, id);
      const both = (p: ProductId) => mine.lines.includes(PRODUCTS[p].line) && theirs.lines.includes(PRODUCTS[p].line);
      return (Object.keys(PRODUCTS) as ProductId[]).some((p) => both(p) && mine.stock[p] < theirs.stock[p]);
    });
  });

/** The caster stops serving, so their customers give up and the rating would drop. */
const callerStopsServing: Post = (sim, caster) => void sim.idle.add(caster);

/** The target goes to serve as soon as their till is ready (in the twin game too, where nothing stops them). */
const targetServes: Post = (sim, _caster, _def, t) => {
  if (!t) return;
  const ready = () => clerk(sim, t).tillReadyAt <= sim.now && waiting(sim, shopOf(sim, t)).length > 0;
  until(sim, ready, 7000, 100);
  if (ready()) sim.rt.act(t, { type: 'serve' });
};

export const scenarios: ScenarioSet = {
  pre: {
    'corner-shop.rebate': callerHas((sh) => sh.spent > 0),
    'corner-shop.supplier-discount': callerHas((sh) => sh.cash >= 15),
    'corner-shop.cup-of-tea': callerHas((sh, sim) => waiting(sim, sh).some((cu: any) => sim.now - cu.arrivedAt >= 1000)),
    'corner-shop.free-biscuits': callerHas((sh, sim) => waiting(sim, sh).length > 0),
    'corner-shop.raffle-tickets': callerHas((sh, sim) => waiting(sim, sh).length > 0),
    'corner-shop.bigger-van': callerOffer,
    'corner-shop.grumpy-queue': rivalHas((sh, sim) => waiting(sim, sh, 2500).length > 0),
    'corner-shop.free-samples': rivalHas((sh, sim) => waiting(sim, sh).length > 0),
    'corner-shop.stray-cat': rivalHas((sh, sim) => waiting(sim, sh).length > 0),
    'corner-shop.jammed-till': rivalHas((sh, sim) => waiting(sim, sh).length > 0),
    'corner-shop.fake-sale': rivalHas((sh, sim) => waiting(sim, sh).length > 0),
    'corner-shop.shelf-swap': rivalFullerShelf,
    'corner-shop.lost-delivery': rivalOffer,
    'corner-shop.start-rush': quietStreet,
    'corner-shop.start-sale': quietStreet,
    'corner-shop.call-truck': quietStreet,
    'corner-shop.end-event': eventOn,
    'corner-shop.extend-event': busyEventOn,
  },
  post: {
    'corner-shop.glowing-reviews': callerStopsServing,
    'corner-shop.jammed-till': targetServes,
    'corner-shop.fake-sale': targetServes,
  },
  reactive: [
    'corner-shop.gift-wrap',
    'corner-shop.supplier-discount',
    'corner-shop.glowing-reviews',
    'corner-shop.express-till',
    'corner-shop.jammed-till',
    'corner-shop.fake-sale',
    'corner-shop.short-delivery',
  ],
};
