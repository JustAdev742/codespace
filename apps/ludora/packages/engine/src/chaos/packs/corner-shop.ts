import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target } from '../cheats/kit.ts';
import { streamNext } from '../../mechanics/selfPaced.ts';
import {
  STOCK_KEYS,
  clerkOf,
  crewOf,
  csConfig,
  ownedProducts,
  queueRoom,
  rescaleArrival,
  shelfCap,
  shopOf,
  shopRate,
  syncShopTimer,
  unownedProducts,
} from '../adapters/corner-shop.ts';
import { starsOf } from '../../modes/corner-shop/index.ts';
import {
  BIG_SPENDER_SIZES,
  CRATE_CASH,
  CRATE_MIXED,
  CRATE_ODDS,
  CUSTOMER_KINDS,
  CUSTOMER_NAMES,
  DECOR_MS,
  EVENT_ORDER,
  EVENT_TIMING,
  EVENTS,
  PATIENCE_SPREAD,
  PRODUCTS,
  TRUCK_STOCK,
  UNSTOCKED_CHANCE,
  UPGRADES,
  cashText,
  itemText,
  type CrateId,
  type CustomerKind,
  type EventKind,
  type ProductId,
} from '../../modes/corner-shop/meta.ts';

/*
 * Cheats that only make sense in Corner Shop: shelves and deliveries,
 * customers and their patience, the till, the rating, upgrades and the
 * high street's events.
 *
 * Cash, rating, every shelf and what a shop has spent move through the
 * adapter's meters (score, rating, stock.<product>, spent), so cheats that
 * only move those can be undone. Cheats that add, move or hurry customers,
 * lend upgrades, change a delivery offer, hold stock out back or run an
 * event write the mode's state and are not undoable.
 *
 * Nothing is invented: customers are drawn the way the mode draws them (its
 * customer kinds, basket sizes, popularity and patience tables), stock comes
 * in the mode's delivery sizes, crates use the published crate odds, events
 * are the mode's own. Descriptions say which table a draw uses.
 *
 * In a team shop (the Co-op variant) a cheat on a player works on the shop
 * that player runs with their team: the shelves, queue, rating and upgrades
 * are the team's. Tills are per clerk, so till cheats act on one clerk.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'corner-shop';
const M = [MODE] as const;
const LONGEST_EVENT_MS = Math.max(...EVENT_ORDER.map((k) => EVENTS[k].lengthMs));
const UPGRADE_MAX = { sign: UPGRADES.sign.levels.length, till: UPGRADES.till.levels.length } as const;

type Api = ChaosApi;
type Tone = 'good' | 'bad' | 'info';

const settings = (api: Api) => api.ctx.settings as Record<string, unknown>;
const cfg = (api: Api) => csConfig(settings(api));
const shop = (api: Api, id: string): any => shopOf(api.s, id);
const clerk = (api: Api, id: string): any => clerkOf(api.s, id);
const crew = (api: Api, sh: any) => crewOf(api.s, sh, api.ids());
const cap = (api: Api, sh: any) => shelfCap(sh, settings(api));
const stockKey = (p: ProductId) => `stock.${p}`;
const waiting = (api: Api, sh: any): any[] => sh.queue.filter((cu: any) => cu.leavesAt > api.now());
const room = (api: Api, sh: any) => (sh.active ? queueRoom(api.s, sh, api.ids(), settings(api)) - sh.queue.length : 0);
const rate = (api: Api, sh: any, at: number) => shopRate(api.s, sh, at, api.ids(), settings(api));
const resync = (api: Api, sh: any) => syncShopTimer(api.ctx, sh);
const withRoom = (api: Api, sh: any) => ownedProducts(sh).filter((p) => sh.stock[p] < cap(api, sh));
const people = (n: number) => `${n} ${n === 1 ? 'customer' : 'customers'}`;

/** "Bot 2's shop", or "Bot 2's team shop" in the Co-op variant. */
function shopName(api: Api, id: string): string {
  return shop(api, id)?.owner === null ? `${api.name(id)}'s team shop` : `${api.name(id)}'s shop`;
}

/** A line for everyone who works in a shop. */
function tell(api: Api, sh: any, text: string, tone: Tone) {
  const to = crew(api, sh);
  if (to.length) api.feed(text, tone, to);
}

/** Rating, shelves and spending are one number per shop: edit a change for every clerk of it, so the write-back agrees. */
function setShopDelta(api: Api, sh: any, d: Record<string, number>, v: number) {
  for (const id of crew(api, sh)) if (id in d) d[id] = v;
}

/** Sales this clerk made in this transaction, each seen only once per effect. */
function freshSales(api: Api, fx: ActiveEffect, id: string): any[] {
  const c = clerk(api, id);
  if (!c) return [];
  const seen = (fx.data.sales ?? {}) as Record<string, number>;
  const out = (c.sales as any[]).filter((x) => x.at === api.now() && x.seq > (seen[id] ?? 0));
  if (out.length) fx.data.sales = { ...seen, [id]: Math.max(...out.map((x) => x.seq)) };
  return out;
}

/** A delivery a clerk of this shop picked in this transaction. */
function freshDelivery(api: Api, sh: any): { by: string; seq: number } | null {
  for (const id of crew(api, sh)) {
    const d = clerk(api, id)?.delivery;
    if (d && d.at === api.now()) return { by: id, seq: d.seq };
  }
  return null;
}

/** Lasting cheats used up by one event end themselves on their next tick. */
const endWhenUsed = (api: Api, fx: ActiveEffect) => {
  if (fx.data.used) api.endEffect(fx.eid, 'used');
};

/* -------------------------------- customers -------------------------------- */

function weightedPick<T>(api: Api, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((n, t) => n + weight(t), 0);
  let r = api.rng.next() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1]!;
}

/**
 * A customer drawn exactly the way the mode draws one: their kind from the special-customer chances
 * (unless `kind` is given), their order from the basket sizes and product popularity (a VIP: one or two
 * of one thing, dearer things more likely), their patience from the shop's patience and decor.
 */
function newCustomer(api: Api, sh: any, kind?: CustomerKind): any {
  const c = cfg(api);
  const rng = api.rng;
  const now = api.now();
  let k: CustomerKind = kind ?? 'regular';
  if (!kind && c.specials) {
    const roll = rng.next();
    const vip = c.big ? CUSTOMER_KINDS.vip.bigChance : CUSTOMER_KINDS.vip.chance;
    const hurry = c.big ? CUSTOMER_KINDS.hurry.bigChance : CUSTOMER_KINDS.hurry.chance;
    k = roll < vip ? 'vip' : roll < vip + hurry ? 'hurry' : 'regular';
  }
  const name = rng.pick(CUSTOMER_NAMES);
  const look = rng.int(0, 999_999);
  const mine = ownedProducts(sh);
  const others = unownedProducts(sh);
  const wants: Partial<Record<ProductId, number>> = {};
  if (k === 'vip') {
    const product = weightedPick(api, mine, (p) => PRODUCTS[p].price);
    wants[product] = (c.big ? 2 : 1) + rng.int(0, 1);
  } else {
    const sizes: readonly number[] = c.big ? BIG_SPENDER_SIZES : c.size.sizes;
    const n = 1 + weightedPick(api, sizes.map((_, i) => i), (i) => sizes[i]!);
    for (let i = 0; i < n; i++) {
      const product = others.length && rng.chance(UNSTOCKED_CHANCE) ? rng.pick(others) : weightedPick(api, mine, (p) => PRODUCTS[p].popularity);
      wants[product] = (wants[product] ?? 0) + 1;
    }
  }
  const items = (Object.keys(PRODUCTS) as ProductId[]).filter((p) => wants[p]).map((p) => ({ product: p, qty: wants[p]! }));
  const spread = 1 - PATIENCE_SPREAD + 2 * PATIENCE_SPREAD * rng.next();
  const patienceMs = Math.round(((c.size.patienceMs + DECOR_MS[sh.up.decor]!) * CUSTOMER_KINDS[k].patience * spread) / 100) * 100;
  sh.nextCustomer++;
  return { id: sh.nextCustomer, name, look, kind: k, items, arrivedAt: now, patienceMs, leavesAt: now + patienceMs };
}

/** Customers join a shop's queue (as many as it has room for). Returns how many came. */
function walkIn(api: Api, sh: any, n: number, kind?: CustomerKind): any[] {
  const came: any[] = [];
  for (let i = Math.min(n, room(api, sh)); i > 0; i--) {
    const cu = newCustomer(api, sh, kind);
    sh.queue.push(cu);
    came.push(cu);
  }
  if (came.length) resync(api, sh);
  return came;
}

/** Give each waiting customer more patience (or less), as cosy decor does: customers in a hurry by half as much. */
function stretchPatience(api: Api, sh: any, ms: number, minLeftMs = 0): number {
  let changed = 0;
  for (const cu of waiting(api, sh)) {
    let by = Math.round(ms * CUSTOMER_KINDS[cu.kind as CustomerKind].patience);
    if (by < 0) by = -Math.min(-by, Math.max(0, cu.leavesAt - api.now() - minLeftMs));
    if (by === 0) continue;
    cu.patienceMs += by;
    cu.leavesAt += by;
    changed++;
  }
  if (changed) resync(api, sh);
  return changed;
}

/* --------------------------------- stock ---------------------------------- */

/** One of the mode's deliveries (the delivery size in its product table) of a product, onto `id`'s shelves. Returns what fitted. */
function deliverTo(api: Api, id: string, product: ProductId, qty: number): number {
  return api.add(stockKey(product), id, qty);
}

function emptiest(sh: any): ProductId {
  // The crate's rule: the emptiest shelf, the first in line on a tie.
  return ownedProducts(sh).reduce((a, b) => (sh.stock[b] < sh.stock[a] ? b : a));
}

function fullest(sh: any): ProductId {
  return ownedProducts(sh).reduce((a, b) => (sh.stock[b] > sh.stock[a] ? b : a));
}

/* --------------------------------- events --------------------------------- */

const rates = (api: Api, at: number) => (api.s.street as string[]).map((id) => rate(api, api.s.shops[id], at));

function rescaleAll(api: Api, before: number[], after: number[]) {
  (api.s.street as string[]).forEach((id, i) => rescaleArrival(api.s.shops[id], api.now(), before[i]!, after[i]!));
}

function resyncAll(api: Api) {
  for (const id of api.s.street as string[]) resync(api, api.s.shops[id]);
}

/** The event on right now, if any. */
function runningEvent(api: Api): any | null {
  const ev = api.s.event;
  return ev && ev.endsAt > api.now() && ev.startedAt <= api.now() ? ev : null;
}

/** The mode's startEvent, brought forward to now: rates rescale, the truck unloads, and the next event is 70 to 90 seconds away. */
function startEvent(api: Api, kind: EventKind): void | { error: string } {
  const s = api.s;
  const now = api.now();
  const on = runningEvent(api);
  if (on) return { error: `${EVENTS[on.kind as EventKind].title} is already on.` };
  if (s.event) return { error: 'The last event is just finishing. Try again in a moment.' };
  if (s.nextEventAt !== null && s.nextEventAt <= now) return { error: 'An event is starting right now.' };
  const length = EVENTS[kind].lengthMs;
  if (now + length > s.endsAt) return { error: 'The shops shut before it could finish.' };
  const before = rates(api, now);
  s.events++;
  s.event = { kind, startedAt: now, endsAt: now + length, seq: s.events };
  rescaleAll(api, before, rates(api, now));
  if (kind === 'truck') {
    for (const id of s.street as string[]) {
      const sh = s.shops[id];
      if (!sh.active) continue;
      for (const p of ownedProducts(sh)) sh.stock[p] += Math.max(0, Math.min(TRUCK_STOCK, cap(api, sh) - sh.stock[p]));
    }
  }
  api.ctx.setTimer('eventEnd', s.event.endsAt);
  const next = now + api.rng.int(EVENT_TIMING.gapMinMs, EVENT_TIMING.gapMaxMs);
  if (next + LONGEST_EVENT_MS <= s.endsAt) {
    s.nextEventAt = next;
    api.ctx.setTimer('event', next);
  } else {
    s.nextEventAt = null;
    api.ctx.clearTimer('event');
  }
  resyncAll(api);
  const lines: Record<EventKind, string> = {
    rush: 'Rush Hour: twice as many customers for 25 seconds.',
    sale: 'Sale Day: everything is a fifth cheaper for 30 seconds, and customers flock in.',
    truck: `The Delivery Truck is here: ${TRUCK_STOCK} more of everything for every shop.`,
  };
  api.feed(lines[kind], 'big');
}

const eventNote = 'Not while another event is on. The next event then comes 70 to 90 seconds later, as after any event.';

/* --------------------------------- cheats --------------------------------- */

const cheats: CheatDef[] = [
  /* -------------------------------- your takings ------------------------------- */
  {
    id: 'corner-shop.gift-wrap',
    name: 'Gift Wrapping',
    category: 'score',
    description: 'For 20 seconds, everyone you serve pays $1 more for each thing they buy, for gift wrapping.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const items = freshSales(api, fx, fx.caster).reduce((n, x) => n + (x.got as any[]).reduce((m, g) => m + Number(g.qty), 0), 0);
          if (items <= 0) return;
          d[fx.caster] = (d[fx.caster] ?? 0) + items;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Gift wrapping', tone: 'good' }),
  },
  {
    id: 'corner-shop.raffle-tickets',
    name: 'Raffle Tickets',
    category: 'score',
    description: 'Run a raffle at your till: everyone waiting in your queue buys a $2 ticket while they wait.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const n = waiting(api, shop(api, c.caster)).length;
      if (!n) return { error: 'Nobody is waiting in your queue.' };
      const paid = api.add('score', c.caster, 2 * n);
      api.feed(`Raffle Tickets: ${people(n)} bought a ticket, ${cashText(paid)} in all.`, 'good', [c.caster]);
    },
  },
  {
    id: 'corner-shop.collector',
    name: "Collector's Visit",
    category: 'score',
    description: 'A collector buys the dearest thing you have in stock for twice its price.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const stocked = ownedProducts(sh).filter((p) => sh.stock[p] > 0);
      if (!stocked.length) return { error: 'Your shelves are empty.' };
      const p = stocked.reduce((a, b) => (PRODUCTS[b].price > PRODUCTS[a].price ? b : a));
      api.add(stockKey(p), c.caster, -1);
      const paid = api.add('score', c.caster, PRODUCTS[p].price * 2);
      api.feed(`A collector bought ${itemText(p, 1)} for ${cashText(paid)}.`, 'good', [c.caster]);
    },
  },

  /* ------------------------------ stock and spending ------------------------------ */
  {
    id: 'corner-shop.school-order',
    name: 'School Order',
    category: 'economy',
    description: 'The school down the road orders half of your fullest shelf, and pays the shelf price for every one.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const p = fullest(sh);
      if (sh.stock[p] <= 0) return { error: 'Your shelves are empty.' };
      const n = Math.max(1, Math.floor(sh.stock[p] / 2));
      api.add(stockKey(p), c.caster, -n);
      const paid = api.add('score', c.caster, n * PRODUCTS[p].price);
      api.feed(`School Order: ${itemText(p, n)} for ${cashText(paid)}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'corner-shop.supplier-discount',
    name: 'Supplier Discount',
    category: 'economy',
    description: 'For 60 seconds, the next upgrade or product line your shop buys costs half: the other half goes back in the till. Used up on that purchase.',
    target: 'self',
    modes: M,
    needs: ['meter:spent'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 60_000,
    tickMs: 500,
    hooks: {
      tick: endWhenUsed,
      delta: {
        spent: (api, fx, d) => {
          const sh = shop(api, fx.caster);
          const paid = d[fx.caster] ?? 0;
          if (fx.data.used || !sh || paid <= 0) return;
          fx.data.used = 1;
          const back = Math.floor(paid / 2);
          setShopDelta(api, sh, d, paid - back);
          sh.cash += back;
          tell(api, sh, `Supplier Discount: ${cashText(back)} back in the till.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Half price', tone: 'good' }),
  },
  {
    id: 'corner-shop.rebate',
    name: 'Supplier Rebate',
    category: 'economy',
    description: 'Your suppliers send back a fifth of everything your shop has spent on upgrades and product lines so far (at least $1). Rebated money no longer counts as spent.',
    target: 'self',
    modes: M,
    needs: ['meter:score', 'meter:spent'],
    cost: 30,
    cooldownMs: 90_000,
    apply: (api, c) => {
      const spent = api.get('spent', c.caster);
      if (spent <= 0) return { error: 'Your shop has not bought anything yet.' };
      const back = api.add('score', c.caster, Math.max(1, Math.round(spent / 5)));
      api.add('spent', c.caster, -back);
      api.feed(`Supplier Rebate: ${cashText(back)} back.`, 'good', [c.caster]);
    },
  },
  {
    id: 'corner-shop.surprise-delivery',
    name: 'Surprise Delivery',
    category: 'economy',
    description: 'A free delivery arrives: one delivery (its usual size from the product table) of something you sell that has room on its shelf, each equally likely. What does not fit is wasted.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const open = withRoom(api, sh);
      if (!open.length) return { error: 'Every shelf is full.' };
      const p = api.rng.pick(open);
      const fitted = deliverTo(api, c.caster, p, PRODUCTS[p].delivery);
      api.feed(`Surprise Delivery: ${itemText(p, fitted)} on your shelves.`, 'good', [c.caster]);
    },
  },
  {
    id: 'corner-shop.night-restock',
    name: 'Night Shift Restock',
    category: 'economy',
    description: 'The night shift fills your emptiest shelf to the top (the first in line on a tie), like the Top-up crate.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const p = emptiest(sh);
      const fitted = api.set(stockKey(p), c.caster, cap(api, sh));
      if (fitted <= 0) return { error: 'Every shelf is full.' };
      api.feed(`Night Shift Restock: ${itemText(p, fitted)} on your shelves.`, 'good', [c.caster]);
    },
  },

  /* -------------------------------- your customers ------------------------------- */
  {
    id: 'corner-shop.red-carpet',
    name: 'Red Carpet',
    category: 'advantage',
    description: 'A VIP walks into your shop now. What they want is drawn the way the shop draws any VIP: one or two of one thing you sell (two or three with Big Spenders), dearer things more likely. They tip three times as much if you can serve it all.',
    target: 'self',
    modes: M,
    needs: ['specials'],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const [vip] = walkIn(api, sh, 1, 'vip');
      if (!vip) return { error: 'Your queue is full.' };
      tell(api, sh, `A VIP, ${vip.name}, has walked in.`, 'good');
    },
  },
  {
    id: 'corner-shop.bus-stop',
    name: 'Bus Stop',
    category: 'advantage',
    description: 'A bus stops outside your shop: up to 3 customers join your queue now (as many as it has room for), drawn like any other customers.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const came = walkIn(api, sh, 3);
      if (!came.length) return { error: 'Your queue is full.' };
      tell(api, sh, `A bus stopped outside: ${people(came.length)} joined the queue.`, 'good');
    },
  },
  {
    id: 'corner-shop.cup-of-tea',
    name: 'Cup of Tea',
    category: 'advantage',
    description: 'The customer in your queue with the least patience left gets a cup of tea: their patience is topped back up to full.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const cu = waiting(api, sh).reduce<any>((a, b) => (!a || b.leavesAt < a.leavesAt ? b : a), null);
      if (!cu) return { error: 'Nobody is waiting in your queue.' };
      const more = api.now() - cu.arrivedAt;
      if (more <= 0) return { error: `${cu.name} has only just walked in.` };
      cu.patienceMs += more;
      cu.leavesAt += more;
      resync(api, sh);
      tell(api, sh, `${cu.name} enjoys a cup of tea and is happy to wait.`, 'good');
    },
  },
  {
    id: 'corner-shop.free-biscuits',
    name: 'Free Biscuits',
    category: 'advantage',
    description: 'Hand out biscuits: everyone waiting in your queue is happy to wait 10 seconds longer (5 for customers in a hurry, as with cosy decor).',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const n = stretchPatience(api, sh, 10_000);
      if (!n) return { error: 'Nobody is waiting in your queue.' };
      tell(api, sh, `Free biscuits: ${people(n)} will wait longer.`, 'good');
    },
  },
  {
    id: 'corner-shop.word-of-mouth',
    name: 'Word of Mouth',
    category: 'advantage',
    description: 'People are talking about your shop: its rating goes up half a star (never above 5 stars). A better rating brings more customers.',
    target: 'self',
    modes: M,
    needs: ['meter:rating'],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      if (api.add('rating', c.caster, 5) <= 0) return { error: 'Your shop already has 5 stars.' };
    },
  },
  {
    id: 'corner-shop.glowing-reviews',
    name: 'Glowing Reviews',
    category: 'advantage',
    description: 'For 25 seconds, your shop\'s rating cannot drop: customers who leave or are only partly served do not count against it.',
    target: 'self',
    modes: M,
    needs: ['meter:rating'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 25_000,
    priority: 50,
    hooks: {
      delta: {
        rating: (api, fx, d) => {
          const sh = shop(api, fx.caster);
          if (sh && (d[fx.caster] ?? 0) < 0) setShopDelta(api, sh, d, 0);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Glowing reviews', tone: 'good' }),
  },

  /* ------------------------------- your counter ------------------------------- */
  {
    id: 'corner-shop.borrowed-sign',
    name: 'Borrowed Neon Sign',
    category: 'advantage',
    description: 'Borrow the next sign up for 30 seconds (a painted sign brings 30% more customers, a neon sign 60%). You cannot buy a sign while it is on loan.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 30_000,
    undoable: false,
    apply: (api, c, fx) => {
      const sh = shop(api, c.caster);
      if (sh.up.sign >= UPGRADE_MAX.sign) return { error: 'Your shop already has the brightest sign.' };
      const now = api.now();
      const before = rate(api, sh, now);
      sh.up.sign++;
      rescaleArrival(sh, now, before, rate(api, sh, now));
      resync(api, sh);
      if (fx) {
        fx.data.lent = 1;
        // The sign is the shop's: everyone who runs it is under the loan.
        fx.targets = crew(api, sh);
      }
    },
    hooks: {
      gate: (_api, _fx, _id, a: any) => (a?.type === 'upgrade' && a.upgrade === 'sign' ? { block: 'Your sign is on loan. Buy one when it goes back.' } : undefined),
      end: (api, fx) => {
        const sh = shop(api, fx.caster);
        if (!sh || !fx.data.lent || sh.up.sign <= 0) return;
        const now = api.now();
        const before = rate(api, sh, now);
        sh.up.sign--;
        rescaleArrival(sh, now, before, rate(api, sh, now));
        resync(api, sh);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Borrowed sign', tone: 'good' }),
  },
  {
    id: 'corner-shop.spare-till',
    name: 'Spare Till',
    category: 'advantage',
    description: 'A double till on loan for 20 seconds: every press of Serve serves two customers, and the till is ready again after 1 second. You cannot buy a till while it is on loan.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    undoable: false,
    apply: (api, c, fx) => {
      const sh = shop(api, c.caster);
      if (sh.up.till >= UPGRADE_MAX.till) return { error: 'Your shop already has a double till.' };
      if (fx) {
        fx.data.from = sh.up.till;
        fx.targets = crew(api, sh);
      }
      sh.up.till = UPGRADE_MAX.till;
    },
    hooks: {
      gate: (_api, _fx, _id, a: any) => (a?.type === 'upgrade' && a.upgrade === 'till' ? { block: 'Your till is on loan. Buy one when it goes back.' } : undefined),
      end: (api, fx) => {
        const sh = shop(api, fx.caster);
        if (sh && sh.up.till === UPGRADE_MAX.till && fx.data.from !== undefined) sh.up.till = Number(fx.data.from);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Double till', tone: 'good' }),
  },
  {
    id: 'corner-shop.express-till',
    name: 'Express Till',
    category: 'advantage',
    description: 'For 20 seconds, your till is ready again within a quarter of a second of every serve, instead of 2.5 seconds (1 with a quick till).',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 20_000,
    tickMs: 250,
    undoable: false,
    apply: (api, c) => {
      const k = clerk(api, c.caster);
      if (k.tillReadyAt > api.now()) k.tillReadyAt = api.now();
    },
    hooks: {
      tick: (api, fx) => {
        const k = clerk(api, fx.caster);
        if (k && k.tillReadyAt > api.now()) k.tillReadyAt = api.now();
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Express till', tone: 'good' }),
  },
  {
    id: 'corner-shop.bigger-van',
    name: 'Bigger Van',
    category: 'advantage',
    description: 'Your open delivery offer comes in a bigger van: every stock option in it brings twice as much. A mystery crate stays a crate.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const offer = clerk(api, c.caster)?.offer;
      if (!offer) return { error: 'You have no delivery to pick right now.' };
      const stock = (offer.options as any[]).filter((o) => o.kind === 'stock');
      if (!stock.length) return { error: 'Your offer is all mystery crates.' };
      for (const o of stock) o.qty *= 2;
      api.feed('Bigger Van: every delivery on offer is doubled.', 'good', [c.caster]);
    },
  },

  /* -------------------------------- other shops -------------------------------- */
  {
    id: 'corner-shop.shelf-topple',
    name: 'Shelf Topple',
    category: 'troll',
    description: 'Knock over an opponent\'s shelves: a quarter of the stock on each shelf is gone (at least 1 from every shelf that has any).',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      const sh = shop(api, t);
      let lost = 0;
      for (const p of ownedProducts(sh)) if (sh.stock[p] > 0) lost -= api.add(stockKey(p), t, -Math.max(1, Math.floor(sh.stock[p] / 4)));
      if (lost <= 0) return { error: `${shopName(api, t)} has nothing on its shelves.` };
      tell(api, sh, `${api.name(c.caster)} knocked over your shelves: ${lost} things are gone.`, 'bad');
    },
  },
  {
    id: 'corner-shop.jammed-till',
    name: 'Jammed Till',
    category: 'troll',
    description: 'Jam the till of an opponent who has customers waiting: for 8 seconds they cannot serve anyone, and their customers keep waiting.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 8_000,
    tags: ['x:corner-shop-till-block'],
    apply: (api, c) => {
      const t = target(c);
      if (!waiting(api, shop(api, t)).length) return { error: `Nobody is waiting at ${api.name(t)}'s till.` };
    },
    hooks: {
      gate: (_api, _fx, _id, a: any) => (a?.type === 'serve' ? { block: 'Your till is jammed! It will be fixed in a moment.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Till jammed', until: fx.endsAt }),
  },
  {
    id: 'corner-shop.grumpy-queue',
    name: 'Grumpy Queue',
    category: 'troll',
    description: 'Everyone waiting in an opponent\'s queue gets grumpy and loses 6 seconds of patience (3 for customers in a hurry), but nobody is left with less than 2 seconds.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const sh = shop(api, t);
      const n = stretchPatience(api, sh, -6_000, 2_000);
      if (!n) return { error: `Nobody in ${shopName(api, t)}'s queue has patience to lose.` };
      tell(api, sh, `${api.name(c.caster)} made your queue grumpy.`, 'bad');
    },
  },
  {
    id: 'corner-shop.bad-review',
    name: 'Bad Review',
    category: 'troll',
    description: 'Post a grumpy review of an opponent\'s shop: its rating drops half a star (never below 1 star).',
    target: 'opponent',
    modes: M,
    needs: ['meter:rating'],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.add('rating', t, -5) >= 0) return { error: `${shopName(api, t)} is already down to 1 star.` };
      tell(api, shop(api, t), `${api.name(c.caster)} posted a bad review of your shop.`, 'bad');
    },
  },
  {
    id: 'corner-shop.fake-sale',
    name: 'Fake Sale Sign',
    category: 'troll',
    description: 'Hang a half-price sign on an opponent\'s shop: for 15 seconds, everything they sell goes for half price, rounded down to whole dollars (so an apple goes free).',
    target: 'opponent',
    modes: M,
    needs: ['meter:score'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const sh = shop(api, target(fx));
          if (!sh) return;
          for (const id of crew(api, sh)) {
            const loss = freshSales(api, fx, id).reduce((n, x) => n + (x.got as any[]).reduce((m, g) => m + g.qty * (g.price - Math.floor(g.price / 2)), 0), 0);
            if (loss > 0 && (d[id] ?? 0) > 0) d[id] = Math.max(0, d[id]! - loss);
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Half-price sign', tone: 'bad' }),
  },
  {
    id: 'corner-shop.free-samples',
    name: 'Free Samples',
    category: 'troll',
    description: 'Hand out free samples: the first 2 customers waiting in an opponent\'s queue walk over to yours (as many as you have room for), keeping their orders and their patience, even for things you do not sell.',
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const theirs = shop(api, t);
      const mine = shop(api, c.caster);
      if (theirs === mine) return { error: 'You share that shop.' };
      const space = room(api, mine);
      if (space <= 0) return { error: 'Your queue is full.' };
      const lured = waiting(api, theirs).slice(0, Math.min(2, space));
      if (!lured.length) return { error: `Nobody is waiting in ${shopName(api, t)}.` };
      const ids = new Set(lured.map((cu) => cu.id));
      theirs.queue = theirs.queue.filter((cu: any) => !ids.has(cu.id));
      for (const cu of lured) {
        mine.nextCustomer++;
        mine.queue.push({ ...cu, id: mine.nextCustomer });
      }
      resync(api, theirs);
      resync(api, mine);
      tell(api, theirs, `${api.name(c.caster)} lured ${people(lured.length)} away with free samples.`, 'bad');
      tell(api, mine, `Free samples: ${lured.map((cu) => cu.name).join(' and ')} walked over to your queue.`, 'good');
    },
  },
  {
    id: 'corner-shop.shelf-swap',
    name: 'Shelf Swap',
    category: 'troll',
    description: 'Swap one shelf with an opponent: the product you both sell where they have the most more than you. What does not fit on your shelf is lost.',
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      const mine = shop(api, c.caster);
      const theirs = shop(api, t);
      if (theirs === mine) return { error: 'You share that shop.' };
      const both = ownedProducts(mine).filter((p) => theirs.lines.includes(PRODUCTS[p].line));
      const best = both.reduce<ProductId | null>((a, p) => (theirs.stock[p] - mine.stock[p] > (a ? theirs.stock[a] - mine.stock[a] : 0) ? p : a), null);
      if (!best) return { error: `None of ${shopName(api, t)}'s shelves has more on it than yours.` };
      const a = mine.stock[best];
      const b = theirs.stock[best];
      api.set(stockKey(best), c.caster, b);
      api.set(stockKey(best), t, a);
      tell(api, theirs, `${api.name(c.caster)} swapped shelves with you: you have ${itemText(best, theirs.stock[best])} now.`, 'bad');
    },
  },
  {
    id: 'corner-shop.lost-delivery',
    name: 'Lost Delivery',
    category: 'troll',
    description: 'An opponent\'s open delivery offer gets lost on the way: no delivery this time, and their next question comes up.',
    target: 'opponent',
    modes: M,
    needs: ['stream'],
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const k = clerk(api, t);
      if (!k?.offer) return { error: `${api.name(t)} has no delivery to pick right now.` };
      k.offer = null;
      if (k.stream.last) k.stream.last = { ...k.stream.last, text: 'Your delivery got lost on the way.' };
      streamNext(k.stream, api.ctx);
      api.feed(`${api.name(c.caster)} sent your delivery van the wrong way.`, 'bad', [t]);
    },
  },
  {
    id: 'corner-shop.short-delivery',
    name: 'Short Delivery',
    category: 'troll',
    description: 'For 20 seconds, only half of each delivery an opponent\'s shop picks arrives (rounded up). The Delivery Truck still comes in full.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    hooks: {
      delta: Object.fromEntries(
        STOCK_KEYS.map((key) => [
          key,
          (api: Api, fx: ActiveEffect, d: Record<string, number>) => {
            const sh = shop(api, target(fx));
            const got = d[target(fx)] ?? 0;
            if (!sh || got <= 1) return;
            const fresh = freshDelivery(api, sh);
            if (!fresh) return;
            const mark = `${fresh.by}:${fresh.seq}:${key}`;
            const seen = (fx.data.seen ?? []) as string[];
            if (seen.includes(mark)) return;
            fx.data.seen = [...seen.slice(-19), mark];
            const lost = Math.floor(got / 2);
            setShopDelta(api, sh, d, got - lost);
            // The delivery card says what really arrived.
            const product = key.slice('stock.'.length) as ProductId;
            const card = clerk(api, fresh.by).delivery;
            card.added = (card.added as any[]).map((row) => (row.product === product ? { ...row, qty: Math.max(0, row.qty - lost) } : row));
            tell(api, sh, `Short delivery: ${itemText(product, lost)} never arrived.`, 'bad');
          },
        ]),
      ),
    },
    overlay: () => ({ kind: 'badge', text: 'Short deliveries', tone: 'bad' }),
  },
  {
    id: 'corner-shop.closed-sign',
    name: 'Closed Sign',
    category: 'troll',
    description: 'Turn an opponent\'s door sign to Closed: for 12 seconds no new customers come in. Customers already queuing stay.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 55_000,
    durationMs: 12_000,
    tickMs: 500,
    apply: (api, c, fx) => {
      const t = target(c);
      const sh = shop(api, t);
      const until = fx?.endsAt ?? api.now() + 12_000;
      if (!sh.active) return { error: `${shopName(api, t)} is shut.` };
      if (sh.nextArrivalAt === null || sh.nextArrivalAt >= until) return { error: `No customer is due at ${shopName(api, t)} in the next 12 seconds.` };
      holdDoor(api, sh, until);
      tell(api, sh, `${api.name(c.caster)} turned your sign to Closed.`, 'bad');
    },
    hooks: {
      tick: (api, fx) => {
        const sh = shop(api, target(fx));
        if (sh) holdDoor(api, sh, fx.endsAt);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Shop sign says Closed', until: fx.endsAt }),
  },
  {
    id: 'corner-shop.stocktake',
    name: 'Surprise Stocktake',
    category: 'troll',
    description:
      "Call a surprise stocktake at an opponent's shop: everything on their fullest shelf is carried out back to be counted, so for 12 seconds none of it can be sold. Then it all goes back on the shelf (if deliveries have filled the shelf meanwhile, what does not fit is lost).",
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 12_000,
    // The stock comes back by itself when the stocktake ends, so an undo on top would count it twice.
    undoable: false,
    apply: (api, c, fx) => {
      const t = target(c);
      const sh = shop(api, t);
      if (!sh) return { error: `${api.name(t)} has no shop.` };
      const p = fullest(sh);
      const n = Number(sh.stock[p]);
      if (n <= 0) return { error: `${shopName(api, t)} has nothing on its shelves.` };
      api.set(stockKey(p), t, 0);
      if (fx) {
        fx.data.shop = sh.id;
        fx.data.product = p;
        fx.data.held = n;
        // The shelf is the shop's: everyone who runs it is under the stocktake.
        fx.targets = crew(api, sh);
      }
      tell(api, sh, `${api.name(c.caster)} called a surprise stocktake: your ${PRODUCTS[p].many} are out back being counted.`, 'bad');
    },
    hooks: {
      end: (api, fx) => {
        const sh = api.s.shops[String(fx.data.shop)];
        const p = fx.data.product as ProductId | undefined;
        if (!sh || !p) return;
        const held = Number(fx.data.held);
        const back = Math.max(0, Math.min(held, cap(api, sh) - sh.stock[p]));
        sh.stock[p] += back;
        tell(api, sh, `The stocktake is over: ${itemText(p, back)} back on your shelf${back < held ? ` (${held - back} did not fit)` : ''}.`, 'info');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: `Stocktake: no ${PRODUCTS[fx.data.product as ProductId]?.many ?? 'stock'} to sell`, until: fx.endsAt }),
  },
  {
    id: 'corner-shop.wrong-address',
    name: 'Wrong Address',
    category: 'troll',
    description:
      "The stock the next delivery an opponent's shop picks (within 30 seconds) would put on their shelves goes to the wrong address: yours. It goes on your shelves wherever you sell it and have room, and the rest is lost on the way. They get none of it. A mystery crate with stock in it counts; a Thank-you card and the Delivery Truck do not.",
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 500,
    apply: (api, c) => {
      const t = target(c);
      if (!shop(api, t) || shop(api, t) === shop(api, c.caster)) return { error: 'You share that shop.' };
    },
    hooks: {
      tick: endWhenUsed,
      delta: Object.fromEntries(
        STOCK_KEYS.map((key) => [
          key,
          (api: Api, fx: ActiveEffect, d: Record<string, number>) => {
            const t = fx.targets[0];
            const sh = t ? shop(api, t) : null;
            const mine = shop(api, fx.caster);
            const got = t ? (d[t] ?? 0) : 0;
            if (!sh || !mine || sh === mine || got <= 0) return;
            const fresh = freshDelivery(api, sh);
            if (!fresh) return;
            // Only the first delivery: every product in it, and nothing from a later one.
            const mark = `${fresh.by}:${fresh.seq}`;
            if (fx.data.used && fx.data.used !== mark) return;
            fx.data.used = mark;
            const product = key.slice('stock.'.length) as ProductId;
            setShopDelta(api, sh, d, 0);
            const fits = mine.lines.includes(PRODUCTS[product].line) ? Math.max(0, Math.min(got, cap(api, mine) - mine.stock[product])) : 0;
            if (fits > 0) for (const id of crew(api, mine)) d[id] = (d[id] ?? 0) + fits;
            // The delivery card says what really arrived.
            const card = clerk(api, fresh.by).delivery;
            card.added = (card.added as any[]).filter((row) => row.product !== product);
            tell(api, sh, `Wrong address: ${itemText(product, got)} went to ${shopName(api, fx.caster)} instead.`, 'bad');
            tell(api, mine, `Wrong Address: ${itemText(product, fits)} from ${shopName(api, t!)}'s delivery${fits < got ? ` (${got - fits} did not fit)` : ''}.`, 'good');
          },
        ]),
      ),
    },
    overlay: () => ({ kind: 'badge', text: 'Next delivery goes astray', tone: 'bad' }),
  },
  {
    id: 'corner-shop.review-swap',
    name: 'Review Swap',
    category: 'troll',
    description: "Swap your shop's reviews with an opponent's: you take their rating and they take yours. Only when their shop shows more stars than yours. A better rating brings more customers and bigger tips.",
    target: 'opponent',
    modes: M,
    needs: ['meter:rating'],
    cost: 40,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const mine = shop(api, c.caster);
      const theirs = shop(api, t);
      if (!theirs || theirs === mine) return { error: 'You share that shop.' };
      const a = api.get('rating', c.caster);
      const b = api.get('rating', t);
      // Stars are shown (and count) in halves, so a swap inside the same half star would change nothing anyone sees.
      if (starsOf(b) <= starsOf(a)) return { error: `${shopName(api, t)} does not show more stars than yours.` };
      api.set('rating', c.caster, b);
      api.set('rating', t, a);
      tell(api, theirs, `${api.name(c.caster)} swapped reviews with you: your shop shows ${String(starsOf(a))} stars now.`, 'bad');
      tell(api, mine, `Review Swap: your shop shows ${String(starsOf(b))} stars now.`, 'good');
    },
  },
  {
    id: 'corner-shop.queue-swap',
    name: 'Queue Swap',
    category: 'troll',
    description:
      'You and an opponent swap queues: everyone waiting at their till walks over to yours and everyone waiting at yours walks over to theirs, keeping their orders and their patience, even for things the new shop does not sell. If a queue is longer than its new shop has room for, the customers at the back walk away.',
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const mine = shop(api, c.caster);
      const theirs = shop(api, t);
      if (!theirs || theirs === mine) return { error: 'You share that shop.' };
      if (!mine.active || !theirs.active) return { error: 'One of the two shops is shut.' };
      const toThem = waiting(api, mine);
      const toMe = waiting(api, theirs);
      if (!toThem.length && !toMe.length) return { error: 'Nobody is waiting at either till.' };
      // Customers whose patience has already run out stay where they are: the mode sees them leave.
      const leaving = (list: any[]) => new Set(list.map((cu) => cu.id));
      const fromMine = leaving(toThem);
      const fromTheirs = leaving(toMe);
      mine.queue = mine.queue.filter((cu: any) => !fromMine.has(cu.id));
      theirs.queue = theirs.queue.filter((cu: any) => !fromTheirs.has(cu.id));
      const arrive = (sh: any, list: any[]) => {
        const fits = list.slice(0, Math.max(0, room(api, sh)));
        for (const cu of fits) {
          sh.nextCustomer++;
          sh.queue.push({ ...cu, id: sh.nextCustomer });
        }
        return fits.length;
      };
      const cameToMe = arrive(mine, toMe);
      const wentToThem = arrive(theirs, toThem);
      resync(api, mine);
      resync(api, theirs);
      const away = toMe.length - cameToMe + toThem.length - wentToThem;
      tell(api, theirs, `${api.name(c.caster)} swapped queues with you: ${people(wentToThem)} walked over to your till.`, 'bad');
      tell(api, mine, `Queue Swap: ${people(cameToMe)} walked over to your till${away ? ` (${people(away)} walked away for lack of room)` : ''}.`, 'good');
    },
  },
  {
    id: 'corner-shop.mystery-shopper',
    name: 'Mystery Shopper',
    category: 'troll',
    description:
      "Send a mystery shopper to an opponent's shop. They join the queue like any other customer, drawn the same way, and nobody there is told which one they are. Served everything they wanted, and their report is glowing: the shop's rating goes up half a star. Served only part of it or nothing, or kept waiting until they give up, and the rating drops half a star. That is on top of what the visit does to the rating anyway, and never past 1 or 5 stars. If another cheat takes them away first, there is no report. Needs room in the queue.",
    target: 'opponent',
    modes: M,
    needs: ['meter:rating'],
    cost: 30,
    cooldownMs: 60_000,
    // Longer than the most patient customer can wait (30 s, cosy decor's 16 s, and the 15% spread).
    durationMs: 60_000,
    tickMs: 250,
    undoable: false,
    apply: (api, c, fx) => {
      const t = target(c);
      const sh = shop(api, t);
      if (!sh || sh === shop(api, c.caster)) return { error: 'You share that shop.' };
      if (!sh.active) return { error: `${shopName(api, t)} is shut.` };
      const [cu] = walkIn(api, sh, 1);
      if (!cu) return { error: `${shopName(api, t)} has no room in its queue.` };
      if (fx) {
        fx.data.shop = sh.id;
        fx.data.cid = cu.id;
        fx.data.name = cu.name;
        fx.data.leavesAt = cu.leavesAt;
        fx.data.where = shopName(api, t);
        fx.targets = crew(api, sh);
      }
      api.feed(`Your mystery shopper, ${cu.name}, has joined the queue at ${shopName(api, t)}.`, 'info', [c.caster]);
      tell(api, sh, 'A mystery shopper is somewhere in your queue.', 'info');
    },
    hooks: {
      // A visit ends in a sale (cash or rating changes) or in the shopper giving up (rating drops): judged in that very move.
      delta: {
        score: (api, fx) => judgeShopper(api, fx, null),
        rating: (api, fx, d) => judgeShopper(api, fx, d),
      },
      tick: (api, fx) => judgeShopper(api, fx, null),
      end: (api, fx, reason) => {
        if (!fx.data.done && reason === 'expired') api.feed(`Your mystery shopper ${String(fx.data.name)} was still waiting when the visit ran out of time: no report.`, 'info', [fx.caster]);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Mystery shopper in your queue', tone: 'info' }),
  },

  /* -------------------------------- the high street ------------------------------- */
  {
    id: 'corner-shop.start-rush',
    name: 'Rush Hour Bell',
    category: 'round',
    description: `Start Rush Hour now: twice as many customers in every shop for ${EVENTS.rush.lengthMs / 1000} seconds. ${eventNote}`,
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'rush'),
  },
  {
    id: 'corner-shop.start-sale',
    name: 'Sale Day Banner',
    category: 'round',
    description: `Start Sale Day now: everything a fifth cheaper and half as many customers again, in every shop, for ${EVENTS.sale.lengthMs / 1000} seconds. ${eventNote}`,
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'sale'),
  },
  {
    id: 'corner-shop.call-truck',
    name: 'Call the Truck',
    category: 'round',
    description: `Call the Delivery Truck now: every open shop gets ${TRUCK_STOCK} more of everything it sells (what does not fit is wasted). ${eventNote}`,
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'truck'),
  },
  {
    id: 'corner-shop.end-event',
    name: 'Back to Business',
    category: 'round',
    description: 'End the shop event that is on right now: customers come as often as usual again, and prices go back to normal.',
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const ev = runningEvent(api);
      if (!ev) return { error: 'No shop event is on.' };
      const now = api.now();
      const before = rates(api, now);
      api.s.lastEvent = ev.kind;
      api.s.event = null;
      rescaleAll(api, before, rates(api, now));
      api.ctx.clearTimer('eventEnd');
      resyncAll(api);
      api.feed(`${EVENTS[ev.kind as EventKind].title} is over early.`, 'info');
    },
  },
  {
    id: 'corner-shop.extend-event',
    name: 'Event Encore',
    category: 'round',
    description: 'Rush Hour or Sale Day, whichever is on, lasts 15 seconds longer. Not if the shops shut or the next event is due before then.',
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const ev = runningEvent(api);
      if (!ev) return { error: 'No shop event is on.' };
      if (ev.kind === 'truck') return { error: 'The Delivery Truck has already unloaded.' };
      const end = ev.endsAt + 15_000;
      if (end > api.s.endsAt) return { error: 'The shops shut before then.' };
      if (api.s.nextEventAt !== null && api.s.nextEventAt < end) return { error: 'The next event is due before then.' };
      api.s.event = { ...ev, endsAt: end };
      api.ctx.setTimer('eventEnd', end);
      api.feed(`${EVENTS[ev.kind as EventKind].title} lasts 15 seconds longer.`, 'info');
    },
  },

  /* ---------------------------------- random ---------------------------------- */
  {
    id: 'corner-shop.mystery-crate',
    name: 'Mystery Crate',
    category: 'random',
    description: `Open a mystery crate now, with the crate odds the shop shows: ${odds(CRATE_ODDS.map((o) => [`${o.title} (${o.text.replace(/\.$/, '').toLowerCase()})`, o.weight]))}. A Double delivery picks one thing you sell that has room. Needs room on a shelf.`,
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const open = withRoom(api, sh);
      if (!open.length) return { error: 'Every shelf is full: the crate would go to waste.' };
      const crate = rollOdds(api, CRATE_ODDS.map((o) => [o.id, o.weight] as [CrateId, number]));
      const full = cap(api, sh);
      let added = 0;
      switch (crate) {
        case 'mixed':
          for (const p of ownedProducts(sh)) added += deliverTo(api, c.caster, p, CRATE_MIXED);
          break;
        case 'fill':
          added = api.set(stockKey(emptiest(sh)), c.caster, full);
          break;
        case 'double': {
          const p = api.rng.pick(open);
          added = deliverTo(api, c.caster, p, 2 * PRODUCTS[p].delivery);
          break;
        }
        case 'cash':
          api.add('score', c.caster, CRATE_CASH);
          break;
        case 'golden':
          for (const p of ownedProducts(sh)) added += api.set(stockKey(p), c.caster, full);
          break;
      }
      const title = CRATE_ODDS.find((o) => o.id === crate)!.title;
      api.feed(`Mystery Crate: ${title}${crate === 'cash' ? `, ${cashText(CRATE_CASH)}` : `, ${added} things on your shelves`}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'corner-shop.lucky-doorbell',
    name: 'Lucky Doorbell',
    category: 'random',
    description: `Ring the lucky doorbell: ${odds([
      ['a customer walks in', 40],
      ['a free delivery of something with room on its shelf', 30],
      ['a kind review (+0.3 stars)', 20],
      ['a $5 tip', 10],
    ])}. If what you get cannot change anything (a full queue, full shelves, 5 stars), you get a $3 tip instead.`,
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const sh = shop(api, c.caster);
      const pick = rollOdds(api, [
        ['customer', 40],
        ['delivery', 30],
        ['review', 20],
        ['tip', 10],
      ] as const);
      let text = '';
      if (pick === 'customer') {
        const [cu] = walkIn(api, sh, 1);
        if (cu) text = `${cu.name} walked in`;
      } else if (pick === 'delivery') {
        const open = withRoom(api, sh);
        if (open.length) {
          const p = api.rng.pick(open);
          text = `${itemText(p, deliverTo(api, c.caster, p, PRODUCTS[p].delivery))} delivered`;
        }
      } else if (pick === 'review') {
        if (api.add('rating', c.caster, 3) > 0) text = 'a kind review';
      } else if (api.add('score', c.caster, 5) > 0) text = `a ${cashText(5)} tip`;
      if (!text) {
        api.add('score', c.caster, 3);
        text = `a ${cashText(3)} tip`;
      }
      api.feed(`Lucky Doorbell: ${text}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'corner-shop.stray-cat',
    name: 'Stray Cat',
    category: 'random',
    description: `A stray cat wanders into an opponent's shop: ${odds([
      ['it knocks 3 things off one of their shelves', 40],
      ['the last customer in their queue runs out after it', 30],
      ['their customers love it (+0.2 stars for them)', 30],
    ])}. If what it rolls cannot happen, it does the next thing on that list.`,
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const sh = shop(api, t);
      const order = ['shelf', 'customer', 'cute'] as const;
      const first = rollOdds(api, [
        ['shelf', 40],
        ['customer', 30],
        ['cute', 30],
      ] as const);
      const start = order.indexOf(first);
      for (let i = 0; i < order.length; i++) {
        const what = order[(start + i) % order.length]!;
        if (what === 'shelf') {
          const stocked = ownedProducts(sh).filter((p) => sh.stock[p] > 0);
          if (!stocked.length) continue;
          const p = api.rng.pick(stocked);
          const lost = -api.add(stockKey(p), t, -3);
          tell(api, sh, `A stray cat knocked ${itemText(p, lost)} off your shelf.`, 'bad');
          return;
        }
        if (what === 'customer') {
          const cu = waiting(api, sh).at(-1);
          if (!cu) continue;
          sh.queue = sh.queue.filter((x: any) => x.id !== cu.id);
          resync(api, sh);
          tell(api, sh, `${cu.name} ran out of your shop after a stray cat.`, 'bad');
          return;
        }
        if (api.add('rating', t, 2) > 0) {
          tell(api, sh, 'A stray cat wandered in and your customers loved it.', 'good');
          return;
        }
      }
      return { error: `${shopName(api, t)} has no stock, no queue and 5 stars: the cat has nothing to do there.` };
    },
  },
];

/**
 * Mystery Shopper: once the shopper has left the queue, judge the visit. Served in full is a good report
 * (+half a star); served partly, not at all, or given up on is a bad one (-half a star). A shopper who left
 * the queue before their patience ran out without being served was taken by another cheat: no report.
 * Called from the rating hook with its changes (`d`), so the verdict joins them; from elsewhere it writes
 * the rating itself.
 */
function judgeShopper(api: Api, fx: ActiveEffect, d: Record<string, number> | null) {
  if (fx.data.done) return;
  const sh = api.s.shops[String(fx.data.shop)];
  if (!sh) return;
  const cid = Number(fx.data.cid);
  const still = (sh.queue as any[]).find((cu) => cu.id === cid);
  if (still) {
    fx.data.leavesAt = still.leavesAt;
    return;
  }
  let sale: any = null;
  for (const k of Object.values(api.s.clerks) as any[]) if (k.shopId === sh.id) sale = (k.sales as any[]).find((x) => x.customer.id === cid) ?? sale;
  const gaveUp = !sale && api.now() >= Number(fx.data.leavesAt);
  fx.data.done = 1;
  const name = String(fx.data.name);
  if (!sale && !gaveUp) {
    api.feed(`Your mystery shopper ${name} was taken away before the visit was over: no report.`, 'info', [fx.caster]);
    api.endEffect(fx.eid, 'used');
    return;
  }
  const good = sale?.kind === 'full';
  const v = good ? 5 : -5;
  const team = crew(api, sh);
  if (d) {
    // Rating is one number per shop: every clerk of it gets the same change, so the write-back agrees.
    const base = team.map((id) => d[id]).find((x) => x !== undefined) ?? 0;
    for (const id of team) d[id] = base + v;
  } else if (team.length) api.add('rating', team[0]!, v);
  const how = good ? 'served everything they wanted' : sale ? 'did not get everything they wanted' : 'gave up waiting';
  tell(api, sh, `${name} was a mystery shopper and ${how}: a ${good ? 'glowing' : 'poor'} report for your shop.`, good ? 'good' : 'bad');
  api.feed(`Your mystery shopper ${name} ${how} at ${String(fx.data.where)}: a ${good ? 'glowing' : 'poor'} report.`, 'info', [fx.caster]);
  api.endEffect(fx.eid, 'used');
}

/** Keep a shop's next customer outside until `until` (or for good, if the shops shut first). */
function holdDoor(api: Api, sh: any, until: number) {
  if (!sh.active || sh.nextArrivalAt === null || sh.nextArrivalAt >= until) return;
  sh.nextArrivalAt = until < api.s.endsAt ? until : null;
  resync(api, sh);
}

defineCheats(cheats);
