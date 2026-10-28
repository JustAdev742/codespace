import { describe, expect, it } from 'vitest';
import '../src/chaos/cheats/index.ts';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { allCheats, getCheat } from '../src/chaos/registry.ts';
import { chaosAdapterFor } from '../src/chaos/adapters/index.ts';
import { capacityOf } from '../src/modes/corner-shop/index.ts';
import { CUSTOMER_KINDS, EVENT_TIMING, EVENTS, PRODUCTS, QUEUE_MAX, SHOP_SIZES, TRUCK_STOCK, UPGRADES, type ProductId } from '../src/modes/corner-shop/meta.ts';

/* Exact behaviour of the Corner Shop cheat pack and adapter: amounts, limits, refusals, expiry, team shops. */

/* eslint-disable @typescript-eslint/no-explicit-any */

function street(settings: Record<string, unknown> = {}, warm = 15_000, opts: { players?: number; teams?: number; seed?: number } = {}) {
  const sim = new ChaosSim({
    modeId: 'corner-shop',
    questions: MIXED_SET,
    players: opts.players ?? 4,
    seed: opts.seed ?? 11,
    settings: { events: false, ...settings },
    common: opts.teams ? { teamCount: opts.teams } : {},
  });
  sim.run(warm);
  return sim;
}

/** A Co-op game: p1 and p3 run one team shop, p2 and p4 the other. */
const coop = (settings: Record<string, unknown> = {}, warm = 20_000) => street({ coop: true, ...settings }, warm, { teams: 2 });

const s = (sim: ChaosSim): any => sim.state();
const clerk = (sim: ChaosSim, id: string): any => s(sim).clerks[id];
const shop = (sim: ChaosSim, id: string): any => s(sim).shops[clerk(sim, id).shopId];
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string) => sim.cast(by, { cheatId: `corner-shop.${cheat}`, target: target ?? null });
const act = (sim: ChaosSim, id: string, a: unknown) => sim.rt.act(id, a);
const owned = (sh: any): ProductId[] => (Object.keys(PRODUCTS) as ProductId[]).filter((p) => sh.lines.includes(PRODUCTS[p].line));
const capOf = (sh: any, size: 'shop' | 'stall' = 'shop') => capacityOf(sh.up.shelf, SHOP_SIZES[size]);
const waiting = (sim: ChaosSim, id: string): any[] => shop(sim, id).queue.filter((cu: any) => cu.leavesAt > sim.now);
const canSell = (sh: any, cu: any) => cu.items.some((it: any) => sh.stock[it.product] > 0);
const stockOf = (sim: ChaosSim, id: string) => ({ ...shop(sim, id).stock }) as Record<ProductId, number>;

function until(sim: ChaosSim, pred: () => boolean, maxMs = 240_000, step = 250) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += step) sim.run(step);
  if (!pred()) throw new Error('the situation never came up');
}

/** Play on until `id` has an open delivery offer, then stop their bot so it stays open. */
function holdOffer(sim: ChaosSim, id: string) {
  until(sim, () => Boolean(clerk(sim, id).offer), 240_000, 50);
  sim.idle.add(id);
}

function percents(cheat: string) {
  return [...getCheat(`corner-shop.${cheat}`)!.description.matchAll(/(\d+)%/g)].map((x) => Number(x[1]));
}

describe('corner-shop adapter', () => {
  const adapter = chaosAdapterFor('corner-shop')!;
  const meter = (key: string) => adapter.meters.find((m) => m.key === key)!;

  it('reads a player\'s own shop: cash is the score, rating in tenths, every shelf and what the shop spent', () => {
    const sim = street();
    const ctx = { settings: sim.rt.settings } as any;
    const sh = shop(sim, 'p1');
    expect(meter('score').get(s(sim), 'p1', ctx)).toBe(sh.cash);
    expect(meter('rating').get(s(sim), 'p1', ctx)).toBe(sh.rating);
    expect(meter('stock.apples').get(s(sim), 'p1', ctx)).toBe(sh.stock.apples);
    expect(meter('spent').get(s(sim), 'p1', ctx)).toBe(sh.spent);
    // Rating stays within 1 to 5 stars; a shelf holds its capacity, and nothing for a line the shop does not sell.
    expect((meter('rating').min as any)(s(sim), 'p1', ctx)).toBe(10);
    expect(meter('rating').max!(s(sim), 'p1', ctx)).toBe(50);
    expect(meter('stock.apples').max!(s(sim), 'p1', ctx)).toBe(capOf(sh));
    expect(meter('stock.teddies').max!(s(sim), 'p1', ctx)).toBe(0);
  });

  it('in a team shop, the score is what the clerk took at the till, and can never empty the team\'s cash box below $0', () => {
    const sim = coop();
    const ctx = { settings: sim.rt.settings } as any;
    expect(clerk(sim, 'p1').shopId).toBe(clerk(sim, 'p3').shopId);
    const sh = shop(sim, 'p1');
    expect(meter('score').get(s(sim), 'p1', ctx)).toBe(clerk(sim, 'p1').earned);
    expect(meter('score').get(s(sim), 'p3', ctx)).toBe(clerk(sim, 'p3').earned);
    expect((meter('score').min as any)(s(sim), 'p1', ctx)).toBe(Math.max(0, clerk(sim, 'p1').earned - sh.cash));
    // Rating and shelves are the team's.
    expect(meter('rating').get(s(sim), 'p3', ctx)).toBe(sh.rating);
    expect(adapter.features).toBeTypeOf('function');
    expect((adapter.features as any)(sim.rt.settings)).toEqual(expect.arrayContaining(['cash-is-score', 'specials', 'team-shops']));
    expect((adapter.features as any)({ specials: false, events: false })).toEqual(['cash-is-score']);
  });

  it('a universal steal from a rival clerk empties their team\'s till into yours', () => {
    const sim = coop();
    until(sim, () => clerk(sim, 'p2').earned >= 10 && shop(sim, 'p2').cash >= 10);
    for (const id of sim.ids) sim.idle.add(id);
    const a = { cash: shop(sim, 'p1').cash, p1: clerk(sim, 'p1').earned, p3: clerk(sim, 'p3').earned };
    const b = { cash: shop(sim, 'p2').cash, p2: clerk(sim, 'p2').earned };
    expect(sim.cast('p1', { cheatId: 'score.pickpocket', target: 'p2' }).ok).toBe(true);
    const took = Math.max(1, Math.round(b.p2 / 10));
    expect(clerk(sim, 'p2').earned).toBe(b.p2 - took);
    expect(shop(sim, 'p2').cash).toBe(b.cash - took);
    expect(clerk(sim, 'p1').earned).toBe(a.p1 + took);
    expect(shop(sim, 'p1').cash).toBe(a.cash + took);
    expect(clerk(sim, 'p3').earned).toBe(a.p3);
  });

  it('a universal Double Points on one clerk doubles their sales for the team, and leaves a teammate\'s alone', () => {
    const sim = coop();
    sim.idle.add('p1');
    sim.idle.add('p3');
    until(sim, () => waiting(sim, 'p1').some((cu) => canSell(shop(sim, 'p1'), cu)) && clerk(sim, 'p1').tillReadyAt <= sim.now);
    expect(sim.cast('p1', { cheatId: 'score.double-points' }).ok).toBe(true);
    const before = { cash: shop(sim, 'p1').cash, p1: clerk(sim, 'p1').earned, p3: clerk(sim, 'p3').earned };
    const first = waiting(sim, 'p1').find((cu) => canSell(shop(sim, 'p1'), cu));
    expect(act(sim, 'p1', { type: 'serve', customer: first.id }).ok).toBe(true);
    const sale = clerk(sim, 'p1').sales[0];
    expect(sale.paid).toBeGreaterThan(0);
    const gain = (sale.paid + sale.tip) * 2;
    expect(clerk(sim, 'p1').earned).toBe(before.p1 + gain);
    expect(shop(sim, 'p1').cash).toBe(before.cash + gain);
    expect(clerk(sim, 'p3').earned).toBe(before.p3);
  });
});

describe('universal cheats in Corner Shop', () => {
  it('Sweet Revenge refuses when nobody who cheated against you has any cash to pay', () => {
    const sim = street({}, 1000);
    expect(shop(sim, 'p2').cash).toBe(0);
    expect(sim.cast('p2', { cheatId: 'score.halve-gains', target: 'p1' }).ok).toBe(true);
    const r = sim.cast('p1', { cheatId: 'score.revenge' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('anything to pay');
  });
});

describe('corner-shop pack: takings', () => {
  it('Gift Wrapping adds $1 for every thing sold', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => waiting(sim, 'p1').some((cu) => canSell(shop(sim, 'p1'), cu)) && clerk(sim, 'p1').tillReadyAt <= sim.now);
    expect(cast(sim, 'p1', 'gift-wrap').ok).toBe(true);
    const cash = shop(sim, 'p1').cash;
    const cu = waiting(sim, 'p1').find((x) => canSell(shop(sim, 'p1'), x));
    expect(act(sim, 'p1', { type: 'serve', customer: cu.id }).ok).toBe(true);
    const sale = clerk(sim, 'p1').sales[0];
    const items = sale.got.reduce((n: number, g: any) => n + g.qty, 0);
    expect(items).toBeGreaterThan(0);
    expect(shop(sim, 'p1').cash).toBe(cash + sale.paid + sale.tip + items);
  });

  it('Raffle Tickets takes $2 from everyone waiting, and refuses an empty queue', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => waiting(sim, 'p1').length >= 2);
    const n = waiting(sim, 'p1').length;
    const cash = shop(sim, 'p1').cash;
    expect(cast(sim, 'p1', 'raffle-tickets').ok).toBe(true);
    expect(shop(sim, 'p1').cash).toBe(cash + 2 * n);
    const fresh = street({}, 1000);
    const r = cast(fresh, 'p1', 'raffle-tickets');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Nobody is waiting');
  });

  it("Collector's Visit sells the dearest thing in stock for twice its price", () => {
    const sim = street();
    sim.idle.add('p1');
    const sh = shop(sim, 'p1');
    const stocked = owned(sh).filter((p) => sh.stock[p] > 0);
    const dearest = stocked.reduce((a, b) => (PRODUCTS[b].price > PRODUCTS[a].price ? b : a));
    const before = { cash: sh.cash, stock: sh.stock[dearest] };
    expect(cast(sim, 'p1', 'collector').ok).toBe(true);
    expect(shop(sim, 'p1').stock[dearest]).toBe(before.stock - 1);
    expect(shop(sim, 'p1').cash).toBe(before.cash + 2 * PRODUCTS[dearest].price);
  });

  it('School Order sells half the fullest shelf at the shelf price, and can be undone', () => {
    const sim = street();
    sim.idle.add('p1');
    const sh = shop(sim, 'p1');
    const fullest = owned(sh).reduce((a, b) => (sh.stock[b] > sh.stock[a] ? b : a));
    const n = Math.max(1, Math.floor(sh.stock[fullest] / 2));
    const before = { cash: sh.cash, stock: sh.stock[fullest] };
    const r = cast(sim, 'p1', 'school-order');
    expect(r.ok).toBe(true);
    expect(shop(sim, 'p1').stock[fullest]).toBe(before.stock - n);
    expect(shop(sim, 'p1').cash).toBe(before.cash + n * PRODUCTS[fullest].price);
    if (r.ok) expect(sim.rt.undoCast('p1', r.castId).ok).toBe(true);
    expect(shop(sim, 'p1').stock[fullest]).toBe(before.stock);
    expect(shop(sim, 'p1').cash).toBe(before.cash);
  });
});

describe('corner-shop pack: stock and spending', () => {
  it('Surprise Delivery brings one product\'s usual delivery, only as much as fits', () => {
    const sim = street();
    sim.idle.add('p1');
    const before = stockOf(sim, 'p1');
    const cap = capOf(shop(sim, 'p1'));
    expect(cast(sim, 'p1', 'surprise-delivery').ok).toBe(true);
    const after = stockOf(sim, 'p1');
    const changed = (Object.keys(PRODUCTS) as ProductId[]).filter((p) => after[p] !== before[p]);
    expect(changed).toHaveLength(1);
    const p = changed[0]!;
    expect(after[p] - before[p]).toBe(Math.min(PRODUCTS[p].delivery, cap - before[p]));
  });

  it('Night Shift Restock fills the emptiest shelf; a full Market Stall refuses deliveries and crates', () => {
    const sim = street({ shopSize: 'stall' }, 3000);
    sim.idle.add('p1');
    const cap = capOf(shop(sim, 'p1'), 'stall');
    for (let i = 0; i < 2; i++) {
      const sh = shop(sim, 'p1');
      const emptiest = owned(sh).reduce((a, b) => (sh.stock[b] < sh.stock[a] ? b : a));
      expect(cast(sim, 'p1', 'night-restock').ok).toBe(true);
      expect(shop(sim, 'p1').stock[emptiest]).toBe(cap);
      sim.run(61_000);
    }
    // Nobody serves at an idle stall, so both shelves are still full.
    for (const cheat of ['night-restock', 'surprise-delivery', 'mystery-crate']) {
      const r = cast(sim, 'p1', cheat);
      expect(r.ok, cheat).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/full/);
    }
  });

  it('Supplier Discount refunds half of the next purchase, once; Supplier Rebate pays back a fifth of what was spent', () => {
    const sim = street({}, 5000);
    until(sim, () => shop(sim, 'p1').cash >= 15 && shop(sim, 'p1').up.decor === 0);
    sim.idle.add('p1');
    sim.run(2000);
    expect(cast(sim, 'p1', 'supplier-discount').ok).toBe(true);
    const cash = shop(sim, 'p1').cash;
    const spent = shop(sim, 'p1').spent;
    const cost = UPGRADES.decor.levels[0]!.cost;
    expect(act(sim, 'p1', { type: 'upgrade', upgrade: 'decor' }).ok).toBe(true);
    const back = Math.floor(cost / 2);
    expect(shop(sim, 'p1').cash).toBe(cash - cost + back);
    expect(shop(sim, 'p1').spent).toBe(spent + cost - back);
    sim.run(1000);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'corner-shop.supplier-discount')).toBe(false);
    // Rebate: a fifth of what the shop has spent, which then no longer counts as spent.
    const before = { cash: shop(sim, 'p1').cash, spent: shop(sim, 'p1').spent };
    expect(cast(sim, 'p1', 'rebate').ok).toBe(true);
    const rebate = Math.max(1, Math.round(before.spent / 5));
    expect(shop(sim, 'p1').cash).toBe(before.cash + rebate);
    expect(shop(sim, 'p1').spent).toBe(before.spent - rebate);
    const fresh = street({}, 1000);
    expect(cast(fresh, 'p2', 'rebate').ok).toBe(false);
  });

  it('Mystery Crate shows the published crate odds, adding up to 100', () => {
    expect(percents('mystery-crate')).toEqual([40, 25, 15, 12, 8]);
    const sim = street();
    sim.idle.add('p1');
    const before = JSON.stringify([shop(sim, 'p1').stock, shop(sim, 'p1').cash]);
    expect(cast(sim, 'p1', 'mystery-crate').ok).toBe(true);
    expect(JSON.stringify([shop(sim, 'p1').stock, shop(sim, 'p1').cash])).not.toBe(before);
  });
});

describe('corner-shop pack: customers', () => {
  it('Red Carpet brings a VIP who wants one or two of one thing the shop sells; not without special customers', () => {
    const sim = street();
    sim.idle.add('p1');
    const n = shop(sim, 'p1').queue.length;
    expect(cast(sim, 'p1', 'red-carpet').ok).toBe(true);
    const q = shop(sim, 'p1').queue;
    expect(q).toHaveLength(n + 1);
    const vip = q.at(-1);
    expect(vip.kind).toBe('vip');
    expect(vip.items).toHaveLength(1);
    expect([1, 2]).toContain(vip.items[0].qty);
    expect(shop(sim, 'p1').lines).toContain(PRODUCTS[vip.items[0].product as ProductId].line);
    expect(vip.leavesAt - vip.arrivedAt).toBe(vip.patienceMs);
    expect(s(sim).shops[clerk(sim, 'p1').shopId].wakeAt).toBeLessThanOrEqual(vip.leavesAt);
    const plain = street({ specials: false }, 2000);
    const r = cast(plain, 'p1', 'red-carpet');
    expect(r.ok).toBe(false);
  });

  it('Bus Stop fills the queue up to its limit, then the queue is full', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => shop(sim, 'p1').queue.length >= QUEUE_MAX - 3);
    const n = shop(sim, 'p1').queue.length;
    expect(cast(sim, 'p1', 'bus-stop').ok).toBe(true);
    expect(shop(sim, 'p1').queue).toHaveLength(QUEUE_MAX);
    expect(shop(sim, 'p1').queue.slice(n).every((cu: any) => cu.arrivedAt === sim.now)).toBe(true);
    const r = cast(sim, 'p1', 'red-carpet');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('queue is full');
  });

  it('Cup of Tea tops the most hurried customer\'s patience back up to full', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => waiting(sim, 'p1').some((cu) => sim.now - cu.arrivedAt >= 3000));
    const cu = waiting(sim, 'p1').reduce((a, b) => (b.leavesAt < a.leavesAt ? b : a));
    expect(cast(sim, 'p1', 'cup-of-tea').ok).toBe(true);
    const after = shop(sim, 'p1').queue.find((x: any) => x.id === cu.id);
    expect(after.leavesAt).toBe(sim.now + cu.patienceMs);
    expect(after.patienceMs).toBe(cu.patienceMs + (sim.now - cu.arrivedAt));
  });

  it('Free Biscuits and Grumpy Queue move patience by the stated seconds (half for a hurry), never below 2 seconds left', () => {
    const sim = street();
    sim.idle.add('p1');
    sim.idle.add('p2');
    until(sim, () => waiting(sim, 'p1').length > 0 && waiting(sim, 'p2').length > 0);
    const mine = waiting(sim, 'p1').map((cu) => ({ ...cu }));
    expect(cast(sim, 'p1', 'free-biscuits').ok).toBe(true);
    for (const cu of mine) {
      const after = shop(sim, 'p1').queue.find((x: any) => x.id === cu.id);
      expect(after.leavesAt - cu.leavesAt).toBe(10_000 * CUSTOMER_KINDS[cu.kind as 'regular'].patience);
    }
    const theirs = waiting(sim, 'p2').map((cu) => ({ ...cu }));
    expect(cast(sim, 'p1', 'grumpy-queue', 'p2').ok).toBe(true);
    for (const cu of theirs) {
      const after = shop(sim, 'p2').queue.find((x: any) => x.id === cu.id);
      const want = Math.min(6000 * CUSTOMER_KINDS[cu.kind as 'regular'].patience, Math.max(0, cu.leavesAt - sim.now - 2000));
      expect(cu.leavesAt - after.leavesAt).toBe(want);
      expect(after.leavesAt - sim.now).toBeGreaterThanOrEqual(Math.min(2000, cu.leavesAt - sim.now));
    }
  });

  it('Free Samples walks the front two of a rival\'s queue over, orders and patience kept', () => {
    const sim = street();
    sim.idle.add('p1');
    sim.idle.add('p2');
    until(sim, () => waiting(sim, 'p2').length >= 2 && shop(sim, 'p1').queue.length <= QUEUE_MAX - 2);
    const lured = waiting(sim, 'p2').slice(0, 2).map((cu) => ({ ...cu }));
    const mine = shop(sim, 'p1').queue.length;
    expect(cast(sim, 'p1', 'free-samples', 'p2').ok).toBe(true);
    expect(shop(sim, 'p1').queue).toHaveLength(mine + 2);
    for (const cu of lured) {
      expect(shop(sim, 'p2').queue.some((x: any) => x.id === cu.id && x.name === cu.name)).toBe(false);
      const moved = shop(sim, 'p1').queue.find((x: any) => x.name === cu.name && x.arrivedAt === cu.arrivedAt);
      expect(moved.items).toEqual(cu.items);
      expect(moved.leavesAt).toBe(cu.leavesAt);
    }
    const ids = shop(sim, 'p1').queue.map((x: any) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Closed Sign keeps new customers out of a rival\'s shop for 12 seconds', () => {
    const sim = street();
    sim.idle.add('p2');
    until(sim, () => shop(sim, 'p2').nextArrivalAt !== null && shop(sim, 'p2').nextArrivalAt - sim.now < 8000);
    const next = shop(sim, 'p2').nextCustomer;
    const at = sim.now;
    expect(cast(sim, 'p1', 'closed-sign', 'p2').ok).toBe(true);
    expect(shop(sim, 'p2').nextArrivalAt).toBe(at + 12_000);
    sim.run(11_900);
    expect(shop(sim, 'p2').nextCustomer).toBe(next);
    sim.run(200);
    expect(shop(sim, 'p2').nextCustomer).toBeGreaterThan(next);
  });

  it('Stray Cat shows odds that add up to 100 and always does something', () => {
    expect(percents('stray-cat').reduce((a, b) => a + b, 0)).toBe(100);
    expect(percents('lucky-doorbell').reduce((a, b) => a + b, 0)).toBe(100);
    const sim = street();
    sim.idle.add('p2');
    const before = JSON.stringify([shop(sim, 'p2').stock, shop(sim, 'p2').queue.length, shop(sim, 'p2').rating]);
    expect(cast(sim, 'p1', 'stray-cat', 'p2').ok).toBe(true);
    expect(JSON.stringify([shop(sim, 'p2').stock, shop(sim, 'p2').queue.length, shop(sim, 'p2').rating])).not.toBe(before);
    sim.idle.add('p1');
    const mine = JSON.stringify([shop(sim, 'p1').stock, shop(sim, 'p1').queue.length, shop(sim, 'p1').rating, shop(sim, 'p1').cash]);
    expect(cast(sim, 'p1', 'lucky-doorbell').ok).toBe(true);
    expect(JSON.stringify([shop(sim, 'p1').stock, shop(sim, 'p1').queue.length, shop(sim, 'p1').rating, shop(sim, 'p1').cash])).not.toBe(mine);
  });
});

describe('corner-shop pack: rating', () => {
  it('Word of Mouth adds half a star; Bad Review takes half a star off and stops at 1 star', () => {
    const sim = street();
    const r = shop(sim, 'p1').rating;
    expect(cast(sim, 'p1', 'word-of-mouth').ok).toBe(true);
    expect(shop(sim, 'p1').rating).toBe(Math.min(50, r + 5));
    // An idle shop's customers give up, and its rating falls to the floor.
    sim.idle.add('p2');
    const r2 = shop(sim, 'p2').rating;
    expect(cast(sim, 'p1', 'bad-review', 'p2').ok).toBe(true);
    expect(shop(sim, 'p2').rating).toBe(Math.max(10, r2 - 5));
    until(sim, () => shop(sim, 'p2').rating === 10);
    const refused = cast(sim, 'p3', 'bad-review', 'p2');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toContain('1 star');
  });

  it('Glowing Reviews stops the rating dropping for 25 seconds', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => waiting(sim, 'p1').some((cu) => cu.leavesAt - sim.now < 15_000));
    expect(cast(sim, 'p1', 'glowing-reviews').ok).toBe(true);
    const r = shop(sim, 'p1').rating;
    sim.run(24_000);
    expect(shop(sim, 'p1').left).toBeGreaterThan(0);
    expect(shop(sim, 'p1').rating).toBe(r);
    until(sim, () => shop(sim, 'p1').rating < r, 60_000);
  });

  it('Glowing Reviews holds a whole team shop\'s rating while both clerks are away from the till', () => {
    const sim = coop();
    sim.idle.add('p1');
    sim.idle.add('p3');
    expect(cast(sim, 'p1', 'glowing-reviews').ok).toBe(true);
    const r = shop(sim, 'p1').rating;
    const left = shop(sim, 'p1').left;
    sim.run(24_000);
    expect(shop(sim, 'p1').left).toBeGreaterThan(left);
    expect(shop(sim, 'p1').rating).toBe(r);
  });
});

describe('corner-shop pack: tills and upgrades', () => {
  it('Jammed Till blocks serving for 8 seconds, and needs someone waiting', () => {
    const sim = street();
    sim.idle.add('p2');
    until(sim, () => waiting(sim, 'p2').length >= 1 && clerk(sim, 'p2').tillReadyAt <= sim.now);
    expect(cast(sim, 'p1', 'jammed-till', 'p2').ok).toBe(true);
    const r = act(sim, 'p2', { type: 'serve' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('jammed');
    sim.run(8100);
    const after = act(sim, 'p2', { type: 'serve' });
    if (!after.ok) expect(after.message).not.toContain('jammed');
    const fresh = street({}, 1000);
    expect(cast(fresh, 'p1', 'jammed-till', 'p2').ok).toBe(false);
  });

  it('Spare Till serves two at once for 20 seconds, blocks buying a till, and goes back', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => waiting(sim, 'p1').filter((cu) => canSell(shop(sim, 'p1'), cu)).length >= 2 && clerk(sim, 'p1').tillReadyAt <= sim.now);
    expect(cast(sim, 'p1', 'spare-till').ok).toBe(true);
    expect(shop(sim, 'p1').up.till).toBe(2);
    expect(act(sim, 'p1', { type: 'serve' }).ok).toBe(true);
    expect(clerk(sim, 'p1').sales).toHaveLength(2);
    expect(clerk(sim, 'p1').tillReadyAt).toBe(sim.now + 1000);
    const buy = act(sim, 'p1', { type: 'upgrade', upgrade: 'till' });
    expect(buy.ok).toBe(false);
    if (!buy.ok) expect(buy.message).toContain('on loan');
    sim.run(20_500);
    expect(shop(sim, 'p1').up.till).toBe(0);
  });

  it('Express Till makes the till ready again within a quarter of a second', () => {
    const sim = street();
    sim.idle.add('p1');
    until(sim, () => waiting(sim, 'p1').length >= 2 && clerk(sim, 'p1').tillReadyAt <= sim.now);
    expect(cast(sim, 'p1', 'express-till').ok).toBe(true);
    expect(act(sim, 'p1', { type: 'serve' }).ok).toBe(true);
    expect(clerk(sim, 'p1').tillReadyAt).toBe(sim.now + 2500);
    sim.run(300);
    expect(clerk(sim, 'p1').tillReadyAt).toBeLessThanOrEqual(sim.now);
  });

  it('Borrowed Neon Sign lends the next sign for 30 seconds, more customers come, and buying one waits', () => {
    const sim = street();
    sim.idle.add('p1');
    const sh = shop(sim, 'p1');
    const next = sh.nextArrivalAt;
    expect(cast(sim, 'p1', 'borrowed-sign').ok).toBe(true);
    expect(shop(sim, 'p1').up.sign).toBe(1);
    if (next !== null) expect(shop(sim, 'p1').nextArrivalAt).toBeLessThanOrEqual(next);
    const buy = act(sim, 'p1', { type: 'upgrade', upgrade: 'sign' });
    expect(buy.ok).toBe(false);
    if (!buy.ok) expect(buy.message).toContain('on loan');
    sim.run(30_500);
    expect(shop(sim, 'p1').up.sign).toBe(0);
  });

  it('in a team shop, a loan covers the teammate too', () => {
    const sim = coop();
    sim.idle.add('p1');
    sim.idle.add('p3');
    const sign = shop(sim, 'p1').up.sign;
    expect(sign).toBeLessThan(UPGRADES.sign.levels.length);
    expect(cast(sim, 'p1', 'borrowed-sign').ok).toBe(true);
    expect(shop(sim, 'p3').up.sign).toBe(sign + 1);
    const fx = sim.chaos().effects.find((e) => e.cheatId === 'corner-shop.borrowed-sign')!;
    expect(fx.targets.slice().sort()).toEqual(['p1', 'p3']);
    // The teammate is stopped by the loan, before the shop even looks at the cash box.
    const buy = act(sim, 'p3', { type: 'upgrade', upgrade: 'sign' });
    expect(buy.ok).toBe(false);
    if (!buy.ok) expect(buy.message).toContain('on loan');
    sim.run(30_500);
    expect(shop(sim, 'p3').up.sign).toBe(sign);
  });
});

describe('corner-shop pack: deliveries', () => {
  it('Bigger Van doubles every stock option in an open offer', () => {
    const sim = street({}, 2000);
    holdOffer(sim, 'p1');
    const options = clerk(sim, 'p1').offer.options.map((o: any) => ({ ...o }));
    expect(cast(sim, 'p1', 'bigger-van').ok).toBe(true);
    clerk(sim, 'p1').offer.options.forEach((o: any, i: number) => {
      if (o.kind === 'stock') expect(o.qty).toBe(options[i].qty * 2);
      else expect(options[i].kind).toBe('crate');
    });
  });

  it('Lost Delivery takes away an open offer and brings the next question', () => {
    const sim = street({}, 2000);
    holdOffer(sim, 'p2');
    expect(cast(sim, 'p1', 'lost-delivery', 'p2').ok).toBe(true);
    expect(clerk(sim, 'p2').offer).toBeNull();
    expect(clerk(sim, 'p2').stream.iid).not.toBeNull();
    expect(clerk(sim, 'p2').stream.last.text).toContain('lost');
    expect(cast(sim, 'p3', 'lost-delivery', 'p2').ok).toBe(false);
  });

  it('Short Delivery lets only half of a picked delivery arrive (rounded up), and the card says so', () => {
    const sim = street({}, 2000);
    let checked = false;
    for (let tries = 0; tries < 6 && !checked; tries++) {
      sim.idle.delete('p2');
      holdOffer(sim, 'p2');
      const cap = capOf(shop(sim, 'p2'));
      const offer = clerk(sim, 'p2').offer;
      const i = offer.options.findIndex((o: any) => o.kind === 'stock' && Math.min(o.qty, cap - shop(sim, 'p2').stock[o.product]) >= 2);
      if (i < 0) {
        act(sim, 'p2', { type: 'pickDelivery', offer: offer.seq, index: 0 });
        continue;
      }
      if (!sim.chaos().effects.some((e) => e.cheatId === 'corner-shop.short-delivery')) expect(cast(sim, 'p1', 'short-delivery', 'p2').ok).toBe(true);
      const o = offer.options[i];
      const before = shop(sim, 'p2').stock[o.product];
      const fits = Math.min(o.qty, cap - before);
      expect(act(sim, 'p2', { type: 'pickDelivery', offer: offer.seq, index: i }).ok).toBe(true);
      const kept = fits - Math.floor(fits / 2);
      expect(shop(sim, 'p2').stock[o.product]).toBe(before + kept);
      expect(clerk(sim, 'p2').delivery.added.find((a: any) => a.product === o.product).qty).toBe(kept);
      checked = true;
    }
    expect(checked).toBe(true);
  });

  it('in a team shop, Short Delivery halves a teammate\'s pick too', () => {
    const sim = coop({}, 2000);
    sim.idle.add('p2');
    let checked = false;
    for (let tries = 0; tries < 6 && !checked; tries++) {
      sim.idle.delete('p4');
      holdOffer(sim, 'p4');
      const cap = capOf(shop(sim, 'p4'));
      const offer = clerk(sim, 'p4').offer;
      const i = offer.options.findIndex((o: any) => o.kind === 'stock' && Math.min(o.qty, cap - shop(sim, 'p4').stock[o.product]) >= 2);
      if (i < 0) {
        act(sim, 'p4', { type: 'pickDelivery', offer: offer.seq, index: 0 });
        continue;
      }
      if (!sim.chaos().effects.some((e) => e.cheatId === 'corner-shop.short-delivery')) expect(cast(sim, 'p1', 'short-delivery', 'p2').ok).toBe(true);
      const o = offer.options[i];
      const before = shop(sim, 'p4').stock[o.product];
      const fits = Math.min(o.qty, cap - before);
      expect(act(sim, 'p4', { type: 'pickDelivery', offer: offer.seq, index: i }).ok).toBe(true);
      expect(shop(sim, 'p2').stock[o.product]).toBe(before + fits - Math.floor(fits / 2));
      checked = true;
    }
    expect(checked).toBe(true);
  });
});

describe('corner-shop pack: other shops', () => {
  it('Shelf Topple takes a quarter of every shelf (at least 1), and Shelf Swap trades the shelf they lead on', () => {
    const sim = street();
    sim.idle.add('p1');
    sim.idle.add('p2');
    const before = stockOf(sim, 'p2');
    expect(cast(sim, 'p1', 'shelf-topple', 'p2').ok).toBe(true);
    for (const p of owned(shop(sim, 'p2'))) expect(shop(sim, 'p2').stock[p]).toBe(before[p] > 0 ? before[p] - Math.max(1, Math.floor(before[p] / 4)) : 0);
    until(sim, () => owned(shop(sim, 'p1')).some((p) => shop(sim, 'p2').lines.includes(PRODUCTS[p].line) && shop(sim, 'p2').stock[p] > shop(sim, 'p1').stock[p]));
    const mine = stockOf(sim, 'p1');
    const theirs = stockOf(sim, 'p2');
    const best = owned(shop(sim, 'p1'))
      .filter((p) => shop(sim, 'p2').lines.includes(PRODUCTS[p].line))
      .reduce<ProductId | null>((a, p) => (theirs[p] - mine[p] > (a ? theirs[a] - mine[a] : 0) ? p : a), null)!;
    expect(cast(sim, 'p1', 'shelf-swap', 'p2').ok).toBe(true);
    expect(shop(sim, 'p1').stock[best]).toBe(Math.min(theirs[best], capOf(shop(sim, 'p1'))));
    expect(shop(sim, 'p2').stock[best]).toBe(mine[best]);
  });

  it('Fake Sale Sign makes a rival sell at half price, rounded down', () => {
    const sim = street();
    sim.idle.add('p2');
    until(sim, () => waiting(sim, 'p2').some((cu) => canSell(shop(sim, 'p2'), cu)) && clerk(sim, 'p2').tillReadyAt <= sim.now);
    expect(cast(sim, 'p1', 'fake-sale', 'p2').ok).toBe(true);
    const cash = shop(sim, 'p2').cash;
    const cu = waiting(sim, 'p2').find((x) => canSell(shop(sim, 'p2'), x));
    expect(act(sim, 'p2', { type: 'serve', customer: cu.id }).ok).toBe(true);
    const sale = clerk(sim, 'p2').sales[0];
    const half = sale.got.reduce((n: number, g: any) => n + g.qty * Math.floor(g.price / 2), 0);
    expect(shop(sim, 'p2').cash).toBe(cash + half + sale.tip);
  });
});

describe('corner-shop pack: the high street', () => {
  it('starts Rush Hour now, refuses a second event, stretches it, and ends it', () => {
    const sim = street({ events: true });
    expect(s(sim).event).toBeNull();
    expect(cast(sim, 'p1', 'start-rush').ok).toBe(true);
    const ev = s(sim).event;
    expect(ev.kind).toBe('rush');
    expect(ev.startedAt).toBe(sim.now);
    expect(ev.endsAt).toBe(sim.now + EVENTS.rush.lengthMs);
    expect(s(sim).nextEventAt - sim.now).toBeGreaterThanOrEqual(EVENT_TIMING.gapMinMs);
    expect(s(sim).nextEventAt - sim.now).toBeLessThanOrEqual(EVENT_TIMING.gapMaxMs);
    expect((sim.rt.view({ kind: 'player', playerId: 'p3' }) as any).event.kind).toBe('rush');
    const second = cast(sim, 'p2', 'start-sale');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toContain('Rush Hour is already on');
    expect(cast(sim, 'p2', 'extend-event').ok).toBe(true);
    expect(s(sim).event.endsAt).toBe(ev.endsAt + 15_000);
    expect(cast(sim, 'p3', 'end-event').ok).toBe(true);
    expect(s(sim).event).toBeNull();
    expect(s(sim).lastEvent).toBe('rush');
    expect(cast(sim, 'p4', 'end-event').ok).toBe(false);
  });

  it('Call the Truck gives every open shop 3 more of everything, as much as fits, and cannot be stretched', () => {
    const sim = street({ events: true });
    const before = Object.fromEntries(sim.ids.map((id) => [id, stockOf(sim, id)]));
    expect(cast(sim, 'p1', 'call-truck').ok).toBe(true);
    for (const id of sim.ids) {
      const sh = shop(sim, id);
      for (const p of owned(sh)) expect(sh.stock[p]).toBe(Math.min(capOf(sh), before[id]![p] + TRUCK_STOCK));
    }
    expect(cast(sim, 'p2', 'extend-event').ok).toBe(false);
  });

  it('event cheats need shop events on', () => {
    const sim = street({ events: false });
    const r = cast(sim, 'p1', 'start-rush');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('does not work here');
  });
});

describe('corner-shop pack: catalogue', () => {
  it('registers 36 Corner Shop cheats; lasting ones have a duration, random ones state odds, money is whole dollars', () => {
    const mine = allCheats().filter((d) => d.id.startsWith('corner-shop.'));
    expect(mine).toHaveLength(36);
    for (const def of mine) {
      expect(def.modes, def.id).toEqual(['corner-shop']);
      if (def.hooks?.gate || def.hooks?.delta || def.hooks?.tick || def.overlay) expect(def.durationMs, def.id).toBeGreaterThan(0);
      if (def.category === 'random') expect(percents(def.id.slice('corner-shop.'.length)).reduce((a, b) => a + b, 0), def.id).toBe(100);
      expect(def.description, def.id).not.toMatch(/\$\d+\.\d/);
    }
  });
});
