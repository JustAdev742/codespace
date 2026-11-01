import { streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { capacityOf, customerRate, starsOf } from '../../modes/corner-shop/index.ts';
import { BUSY, COOP, LINE_ORDER, LINES, PRODUCT_ORDER, PRODUCTS, QUEUE_MAX, RATING, SHOP_SIZES, type EventKind, type ProductId } from '../../modes/corner-shop/meta.ts';

/*
 * Corner Shop keeps money, rating, shelves, queue and upgrades on a shop, and
 * a question stream, a till and a delivery offer on each clerk. Normally a
 * player runs their own shop. With Team shops on (the Co-op variant) a team
 * shares one: one cash box, one rating, one set of shelves and one queue,
 * served by several clerks with a till each.
 *
 * Meters are per player, so in a team shop several players' meters point at
 * the same shop. That is harmless for the shop's rating and shelves (cheats
 * that change them change the team's shop, which is what they mean), but not
 * for the score, which universal cheats steal, swap and double:
 *
 *  - Player's own shop: the score is the shop's cash, as on the leaderboard.
 *  - Team shop: the score is what that clerk took at the till (`earned`),
 *    which is exactly what the mode's results rank players by in a team shop.
 *    Writing it moves the shop's cash by the same amount, so a steal from a
 *    rival clerk really empties their team's till into yours, and doubling
 *    one clerk's sale doubles it for the team too. Two teammates' scores
 *    never alias each other, so delta hooks on one never undo the other.
 *    Spending does not change it (the mode does not take spending off a
 *    clerk's takings either), and it can never be pushed so low that the
 *    team's cash would go below $0.
 *
 * Rating, stock and spending meters alias across a team shop. Pack hooks that
 * edit one of those deltas set the same value for every clerk of the shop
 * (see `sameShop`), so the engine's write-back agrees with itself.
 *
 * The helpers below mirror the mode's own (modes/corner-shop/index.ts:
 * config, owned, members, queueMax, rateOf, rescale, syncTimer) for chaos code
 * that adds customers, changes patience or upgrades, or starts and ends
 * events. They are exported for the corner-shop pack.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CsConfig {
  size: (typeof SHOP_SIZES)['shop' | 'stall'];
  busy: number;
  specials: boolean;
  events: boolean;
  big: boolean;
  coop: boolean;
}

export function csConfig(settings: Record<string, unknown>): CsConfig {
  return {
    size: SHOP_SIZES[settings.shopSize === 'stall' ? 'stall' : 'shop'],
    busy: BUSY[String(settings.busy)]?.mult ?? 1,
    specials: settings.specials !== false,
    events: settings.events !== false,
    big: settings.bigSpenders === true,
    coop: settings.coop === true,
  };
}

export const clerkOf = (s: any, id: PlayerId): any => s?.clerks?.[id];
export function shopOf(s: any, id: PlayerId): any {
  const clerk = clerkOf(s, id);
  return clerk ? s.shops[clerk.shopId] : undefined;
}

/** A team shop with Team shops on: several clerks, one cash box. */
export const isTeamShop = (shop: any, settings: Record<string, unknown>) => csConfig(settings).coop && shop?.teamId != null && shop?.owner === null;

/** Products the shop sells, in shelf order. */
export const ownedProducts = (shop: any): ProductId[] => LINE_ORDER.filter((l) => shop.lines.includes(l)).flatMap((l) => LINES[l].products);
export const unownedProducts = (shop: any): ProductId[] => LINE_ORDER.filter((l) => !shop.lines.includes(l)).flatMap((l) => LINES[l].products);
export const shelfCap = (shop: any, settings: Record<string, unknown>) => capacityOf(shop.up.shelf, csConfig(settings).size);

/** Players in the game who work in this shop (`ids` is the game's players). */
export function crewOf(s: any, shop: any, ids: readonly PlayerId[]): PlayerId[] {
  return ids.filter((id) => {
    const c = s.clerks[id];
    return c && !c.away && c.shopId === shop.id;
  });
}

export function eventAt(s: any, at: number): EventKind | null {
  const ev = s.event;
  return ev && at >= ev.startedAt && at < ev.endsAt ? ev.kind : null;
}

/** The mode's queueMax: a team shop's queue grows with its clerks. */
export function queueRoom(s: any, shop: any, ids: readonly PlayerId[], settings: Record<string, unknown>): number {
  if (!isTeamShop(shop, settings)) return QUEUE_MAX;
  const n = Math.max(1, crewOf(s, shop, ids).length);
  return Math.min(COOP.queueMax, QUEUE_MAX + COOP.queuePerMember * (n - 1));
}

/** The mode's rateOf: how often customers come to this shop at game time `at`. */
export function shopRate(s: any, shop: any, at: number, ids: readonly PlayerId[], settings: Record<string, unknown>): number {
  const c = csConfig(settings);
  return customerRate(starsOf(shop.rating), shop.up.sign, {
    lines: shop.lines.length,
    busy: c.busy,
    size: c.size.customers,
    event: eventAt(s, at),
    team: isTeamShop(shop, settings) ? crewOf(s, shop, ids).length : 1,
  });
}

/** The mode's rescale: a change in how often customers come stretches or shrinks the wait for the next one. */
export function rescaleArrival(shop: any, at: number, before: number, after: number) {
  if (shop.nextArrivalAt === null || !shop.active || before === after) return;
  shop.nextArrivalAt = at + Math.round(((shop.nextArrivalAt - at) * before) / after);
}

/** The mode's syncTimer: one timer per shop, at its next arrival or departure. */
export function syncShopTimer(ctx: ModeContext, shop: any) {
  let leaveAt: number | null = null;
  for (const cu of shop.queue) if (leaveAt === null || cu.leavesAt < leaveAt) leaveAt = cu.leavesAt;
  const arriveAt = shop.active ? shop.nextArrivalAt : null;
  const at = leaveAt === null ? arriveAt : arriveAt === null ? leaveAt : Math.min(leaveAt, arriveAt);
  if (at === shop.wakeAt) return;
  shop.wakeAt = at;
  if (at === null) ctx.clearTimer(`shop:${shop.id}`);
  else ctx.setTimer(`shop:${shop.id}`, at);
}

/** The score: a shop's cash, or in a team shop what this clerk took at the till (see the note above). */
const scoreMeter: MeterDef = {
  key: 'score',
  label: 'Cash',
  scope: 'player',
  get: (s: any, id, ctx) => {
    const shop = shopOf(s, id);
    if (!shop) return 0;
    return isTeamShop(shop, ctx.settings) ? Number(clerkOf(s, id).earned) : Number(shop.cash);
  },
  set: (s: any, id, v, ctx) => {
    const shop = shopOf(s, id);
    if (!shop) return;
    if (!isTeamShop(shop, ctx.settings)) {
      shop.cash = v;
      return;
    }
    const clerk = clerkOf(s, id);
    shop.cash += v - clerk.earned;
    clerk.earned = v;
  },
  // A team's cash box never goes below $0, whoever's takings a cheat lowers.
  min: (s: any, id, ctx) => {
    const shop = shopOf(s, id);
    return shop && isTeamShop(shop, ctx.settings) ? Math.max(0, Number(clerkOf(s, id).earned) - Number(shop.cash)) : 0;
  },
};

/** The shop's rating in tenths of a star, kept within the mode's 1 to 5 stars. */
const ratingMeter: MeterDef = {
  key: 'rating',
  label: 'Rating (tenths of a star)',
  scope: 'player',
  get: (s: any, id) => Number(shopOf(s, id)?.rating ?? 0),
  set: (s: any, id, v) => {
    const shop = shopOf(s, id);
    if (shop) shop.rating = v;
  },
  min: (s: any, id) => (shopOf(s, id) ? RATING.min : 0),
  max: (s: any, id) => (shopOf(s, id) ? RATING.max : 0),
};

/** One shelf: never more than its capacity, and nothing on a shelf for a line the shop does not sell. */
function stockMeter(product: ProductId): MeterDef {
  const p = PRODUCTS[product];
  return {
    key: `stock.${product}`,
    label: `${p.many.charAt(0).toUpperCase()}${p.many.slice(1)} on the shelf`,
    scope: 'player',
    get: (s: any, id) => Number(shopOf(s, id)?.stock[product] ?? 0),
    set: (s: any, id, v) => {
      const shop = shopOf(s, id);
      if (shop) shop.stock[product] = v;
    },
    max: (s: any, id, ctx) => {
      const shop = shopOf(s, id);
      return shop && shop.lines.includes(p.line) ? shelfCap(shop, ctx.settings) : 0;
    },
  };
}

/** What the shop has spent on upgrades and product lines, so cheats can see a purchase and refund part of it. */
const spentMeter: MeterDef = {
  key: 'spent',
  label: 'Spent on the shop',
  scope: 'player',
  get: (s: any, id) => Number(shopOf(s, id)?.spent ?? 0),
  set: (s: any, id, v) => {
    const shop = shopOf(s, id);
    if (shop) shop.spent = v;
  },
};

export const STOCK_KEYS: readonly string[] = PRODUCT_ORDER.map((p) => `stock.${p}`);

export const cornerShopAdapter: ChaosAdapter = {
  modeId: 'corner-shop',
  meters: [scoreMeter, ratingMeter, ...PRODUCT_ORDER.map(stockMeter), spentMeter],
  ...streamParts((s: any, id) => s.clerks[id]?.stream),
  features: (settings) => {
    const c = csConfig(settings);
    return ['cash-is-score', ...(c.specials ? ['specials'] : []), ...(c.events ? ['events'] : []), ...(c.coop ? ['team-shops'] : [])];
  },
};
