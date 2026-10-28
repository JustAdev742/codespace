import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import {
  botDeliveryValues,
  botMove,
  botPressure,
  botPurchase,
  botServeChoice,
  capacityOf,
  cornerShop,
  customerRate,
  drawCrate,
  eventChoices,
  ratingFor,
  salePrice,
  slotsOf,
  starsOf,
  tipFor,
} from '../src/modes/corner-shop/index.ts';
import {
  BASE_GAP_MS,
  CRATE_ODDS,
  CUSTOMER_NAMES,
  DECOR_MS,
  EVENTS,
  LINE_ORDER,
  LINES,
  PRODUCT_ORDER,
  PRODUCTS,
  SHOP_SIZES,
  TILL_MS,
  UPGRADES,
  cashText,
  itemText,
  variants,
  type CrateId,
  type EventKind,
  type ProductId,
} from '../src/modes/corner-shop/meta.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type DriveOptions, type Driven } from './rule-helpers.ts';

/*
 * Corner Shop rules, driven through a GameRuntime on a fake clock. Every
 * question is a true statement, so `right` answers true and `wrong` answers
 * false. Unless a test says otherwise there are no events and no special
 * customers, so every customer is a regular one.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const QUIET = { events: false, specials: false };
const cs = (o: DriveOptions = {}) => drive(cornerShop, { questions: TRUE_SET, players: ['a'], ...o, settings: { ...QUIET, ...o.settings } });
const act = (h: Driven, id: string, a: Record<string, unknown>) => h.rt.act(id, a);
const you = (h: Driven, id = 'a') => h.view(id).you;
const shop = (h: Driven, id = 'p:a') => h.state().shops[id];
const pick = (id: string) => variants.find((v) => v.meta.id === id)!;
/** Runs the clock to a game time. */
const until = (h: Driven, ms: number) => h.tick(Math.max(0, ms - h.rt.gameNow()));

/** Change the committed state directly (tests only). Only fields no timer depends on. */
function patch(h: Driven, fn: (s: any) => void) {
  const s = structuredClone(h.state());
  fn(s);
  (h.rt as unknown as { state: unknown }).state = s;
}

/** Runs the clock until the shop's next customer arrives. */
function nextCustomer(h: Driven, id = 'p:a') {
  const at = shop(h, id).nextArrivalAt;
  if (at === null) throw new Error('no customer coming');
  until(h, at);
}

/** Gives the front customer an order (keeping their arrival and patience). */
function wants(h: Driven, items: { product: ProductId; qty: number }[], kind = 'regular', id = 'p:a') {
  patch(h, (s) => {
    const cu = s.shops[id].queue[0];
    cu.items = items;
    cu.kind = kind;
  });
}

function setStock(h: Driven, stock: Partial<Record<ProductId, number>>, id = 'p:a') {
  patch(h, (s) => Object.assign(s.shops[id].stock, stock));
}

function setCash(h: Driven, cash: number, id = 'p:a') {
  patch(h, (s) => (s.shops[id].cash = cash));
}

describe('Corner Shop: tables and sums', () => {
  it('lists five product lines of two products each, with whole-dollar prices', () => {
    expect(LINE_ORDER).toEqual(['fruit', 'bakery', 'books', 'plants', 'toys']);
    expect(PRODUCT_ORDER).toHaveLength(10);
    for (const l of LINE_ORDER) for (const p of LINES[l].products) expect(PRODUCTS[p].line).toBe(l);
    for (const p of PRODUCT_ORDER) {
      expect(Number.isInteger(PRODUCTS[p].price)).toBe(true);
      expect(PRODUCTS[p].price).toBeGreaterThan(0);
      expect(PRODUCTS[p].delivery).toBeGreaterThan(0);
    }
    expect(itemText('apples', 1)).toBe('1 apple');
    expect(itemText('bread', 3)).toBe('3 loaves of bread');
    expect(cashText(1240)).toBe('$1,240');
    expect(cashText(-5)).toBe('−$5');
  });

  it('shows ratings in half stars and Sale Day prices a fifth off, in whole dollars, never below $1', () => {
    expect([10, 12, 13, 27, 30, 33, 47, 48, 50].map(starsOf)).toEqual([1, 1, 1.5, 2.5, 3, 3.5, 4.5, 5, 5]);
    expect(PRODUCT_ORDER.map((p) => [p, salePrice(PRODUCTS[p].price)])).toEqual([
      ['apples', 1],
      ['melons', 3],
      ['bread', 2],
      ['cakes', 3],
      ['comics', 4],
      ['storybooks', 7],
      ['basil', 3],
      ['succulents', 6],
      ['yoyos', 2],
      ['teddies', 11],
    ]);
  });

  it('tips more the quicker the service, scaled by stars and the kind of customer', () => {
    // $10 served the moment they arrive at 5 stars: 20%.
    expect(tipFor(10, 0, 30_000, 5, 'regular')).toBe(2);
    // Half their patience gone: half the tip. At 3 stars, three fifths of that.
    expect(tipFor(20, 15_000, 30_000, 5, 'regular')).toBe(2);
    expect(tipFor(20, 0, 30_000, 3, 'regular')).toBe(2);
    expect(tipFor(20, 30_000, 30_000, 5, 'regular')).toBe(0);
    // VIPs tip three times as much, customers in a hurry twice; Big Spenders double it again.
    expect(tipFor(10, 0, 30_000, 5, 'vip')).toBe(6);
    expect(tipFor(10, 0, 15_000, 5, 'hurry')).toBe(4);
    expect(tipFor(10, 0, 30_000, 5, 'regular', { big: true })).toBe(4);
    // Partly served: half a tip, and a VIP gives none.
    expect(tipFor(20, 0, 30_000, 5, 'regular', { partial: true })).toBe(2);
    expect(tipFor(20, 0, 30_000, 5, 'vip', { partial: true })).toBe(0);
    expect(tipFor(0, 0, 30_000, 5, 'regular')).toBe(0);
  });

  it('moves the rating by how quickly and how fully a customer was served', () => {
    expect(ratingFor('regular', 'full', 0.2)).toBe(2);
    expect(ratingFor('regular', 'full', 0.5)).toBe(1);
    expect(ratingFor('regular', 'full', 0.9)).toBe(0);
    expect(ratingFor('vip', 'full', 0.2)).toBe(4);
    expect(ratingFor('regular', 'partial', 0.1)).toBe(-2);
    expect(ratingFor('vip', 'partial', 0.1)).toBe(-4);
    expect(ratingFor('hurry', 'sorry', 0)).toBe(-3);
  });

  it('brings customers more often with stars, a sign, more product lines and events', () => {
    expect(customerRate(3, 0)).toBe(1);
    expect(customerRate(5, 0)).toBeCloseTo(1.4, 9);
    expect(customerRate(1, 0)).toBeCloseTo(0.6, 9);
    expect([0, 1, 2].map((sign) => customerRate(3, sign))).toEqual([1, 1.3, 1.6]);
    expect(customerRate(3, 0, { lines: 5 })).toBeCloseTo(1.3, 9);
    expect(customerRate(3, 0, { event: 'rush' })).toBe(2);
    expect(customerRate(3, 0, { event: 'sale' })).toBe(1.5);
    expect(customerRate(3, 0, { event: 'truck' })).toBe(1);
    // Team shops: three quarters more for each teammate after the first, up to six times.
    expect(customerRate(3, 0, { team: 3 })).toBe(2.5);
    expect(customerRate(3, 0, { team: 20 })).toBe(6);
  });

  it('crate odds add up to 100, and seeded draws land on them', () => {
    expect(CRATE_ODDS.reduce((n, o) => n + o.weight, 0)).toBe(100);
    expect([0, 0.399, 0.4, 0.649, 0.65, 0.799, 0.8, 0.919, 0.92, 0.9999].map(drawCrate)).toEqual(['mixed', 'mixed', 'fill', 'fill', 'double', 'double', 'cash', 'cash', 'golden', 'golden']);
    const counts: Record<string, number> = {};
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      for (let i = 0; i < 100; i++) {
        const id = drawCrate(rng.next());
        counts[id] = (counts[id] ?? 0) + 1;
        n++;
      }
    }
    for (const o of CRATE_ODDS) expect(Math.abs(counts[o.id]! / n - o.weight / 100), o.id).toBeLessThan(0.01);
  });
});

describe('Corner Shop: deliveries', () => {
  it('a right answer offers three different deliveries and hides the question until one is picked; a wrong one brings the next question', () => {
    const h = cs();
    expect(h.answer('a', 'wrong').ok).toBe(true);
    expect(you(h)).toMatchObject({ offer: null, last: { correct: false, text: 'No delivery this time.' } });
    expect(you(h).question).not.toBeNull();
    expect(h.answer('a', 'right').ok).toBe(true);
    const v = you(h);
    expect(v.question).toBeNull();
    expect(v.last.text).toBe('Delivery: pick one of three.');
    expect(v.offer.options).toHaveLength(3);
    const products = v.offer.options.filter((o: any) => o.kind === 'stock').map((o: any) => o.product);
    expect(new Set(products).size).toBe(products.length);
    for (const p of products) expect(['apples', 'melons', 'bread', 'cakes']).toContain(p);
    expect(act(h, 'a', { type: 'answer', iid: 'x', answer: { type: 'truefalse', value: true } })).toMatchObject({ ok: false, message: 'Pick a delivery first.' });
  });

  it('fills the shelf up to its capacity, says how much fits, and wastes the rest', () => {
    const h = cs();
    setStock(h, { apples: 7, melons: 7, bread: 7, cakes: 7 });
    h.answer('a', 'right');
    const offer = you(h).offer;
    const i = offer.options.findIndex((o: any) => o.kind === 'stock');
    const o = offer.options[i];
    // Shelves hold 12; 7 are there.
    expect(o).toMatchObject({ qty: PRODUCTS[o.product as ProductId].delivery, fits: Math.min(5, PRODUCTS[o.product as ProductId].delivery) });
    expect(act(h, 'a', { type: 'pickDelivery', offer: offer.seq + 1, index: i })).toMatchObject({ ok: false, message: 'That delivery has already been picked.' });
    expect(act(h, 'a', { type: 'pickDelivery', offer: offer.seq, index: i }).ok).toBe(true);
    const v = you(h);
    expect(v.shelves.find((sh: any) => sh.product === o.product)).toMatchObject({ stock: 7 + o.fits, cap: 12 });
    expect(v.delivery).toMatchObject({ crate: null, product: o.product, added: [{ product: o.product, qty: o.fits }], wasted: o.qty - o.fits });
    expect(shop(h).wasted).toBe(o.qty - o.fits);
    expect(v.offer).toBeNull();
    expect(v.question).not.toBeNull();
    expect(act(h, 'a', { type: 'pickDelivery', offer: offer.seq, index: 0 })).toMatchObject({ ok: false, message: 'There is no delivery to pick right now.' });
  });

  it('a mystery crate shows only that it is a crate, with the odds; what is inside is drawn when it opens', () => {
    // Find a seed whose first offer holds a crate.
    let h: Driven | null = null;
    for (let seed = 1; seed < 80 && !h; seed++) {
      const g = cs({ seed });
      g.answer('a', 'right');
      if (you(g).offer.options.some((o: any) => o.kind === 'crate')) h = g;
    }
    expect(h).not.toBeNull();
    const v = you(h!);
    const crate = v.offer.options.find((o: any) => o.kind === 'crate');
    expect(crate).toEqual({ kind: 'crate' });
    expect(v.crateOdds).toEqual(CRATE_ODDS.map((o) => ({ id: o.id, weight: o.weight })));
    expect(act(h!, 'a', { type: 'pickDelivery', offer: v.offer.seq, index: v.offer.options.indexOf(crate) }).ok).toBe(true);
    expect(CRATE_ODDS.map((o) => o.id)).toContain(you(h!).delivery.crate);
  });

  it('crates opened in real games land near their odds', () => {
    const counts: Record<string, number> = {};
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const h = cs({ seed });
      for (let k = 0; k < 6; k++) {
        h.answer('a', 'right');
        const offer = you(h).offer;
        const i = offer.options.findIndex((o: any) => o.kind === 'crate');
        if (i < 0) {
          act(h, 'a', { type: 'pickDelivery', offer: offer.seq, index: 0 });
          continue;
        }
        act(h, 'a', { type: 'pickDelivery', offer: offer.seq, index: i });
        const id = you(h).delivery.crate as CrateId;
        counts[id] = (counts[id] ?? 0) + 1;
        n++;
      }
    }
    // About one offer in five holds a crate.
    expect(n / (300 * 6)).toBeGreaterThan(0.15);
    expect(n / (300 * 6)).toBeLessThan(0.25);
    for (const o of CRATE_ODDS) expect(Math.abs((counts[o.id] ?? 0) / n - o.weight / 100), o.id).toBeLessThan(0.05);
  });

  it('crates do what they say', () => {
    const open = (crate: CrateId) => {
      for (let seed = 1; seed < 3000; seed++) {
        const h = cs({ seed });
        setStock(h, { apples: 2, melons: 11, bread: 5, cakes: 12 });
        h.answer('a', 'right');
        const offer = you(h).offer;
        const i = offer.options.findIndex((o: any) => o.kind === 'crate');
        if (i < 0) continue;
        act(h, 'a', { type: 'pickDelivery', offer: offer.seq, index: i });
        if (you(h).delivery.crate === crate) return h;
      }
      throw new Error(`no ${crate} crate found`);
    };
    const stock = (h: Driven) => Object.fromEntries(you(h).shelves.map((sh: any) => [sh.product, sh.stock]));
    expect(stock(open('mixed'))).toEqual({ apples: 4, melons: 12, bread: 7, cakes: 12 });
    expect(you(open('mixed')).delivery).toMatchObject({ wasted: 3 });
    expect(stock(open('fill'))).toEqual({ apples: 12, melons: 11, bread: 5, cakes: 12 });
    expect(stock(open('golden'))).toEqual({ apples: 12, melons: 12, bread: 12, cakes: 12 });
    const cash = open('cash');
    expect(you(cash)).toMatchObject({ cash: 10, earned: 10, delivery: { cash: 10, added: [] } });
    const double = open('double');
    const p = double.view('a').you.delivery.product as ProductId;
    expect(double.view('a').you.delivery.added[0]?.qty ?? 0).toBe(Math.min(2 * PRODUCTS[p].delivery, 12 - ({ apples: 2, melons: 11, bread: 5, cakes: 12 } as Record<string, number>)[p]!));
  });

  it('a market stall with only two products always offers a crate as the third choice', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const h = cs({ seed, variant: pick('corner-shop-market-stall') });
      h.answer('a', 'right');
      const kinds = you(h).offer.options.map((o: any) => o.kind).sort();
      expect(kinds).toEqual(['crate', 'stock', 'stock']);
    }
  });
});

describe('Corner Shop: customers', () => {
  it('opens with half-full shelves, and the first customer comes within 4 to 7 seconds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const h = cs({ seed });
      const s = shop(h);
      expect(s.nextArrivalAt).toBeGreaterThanOrEqual(4_000);
      expect(s.nextArrivalAt).toBeLessThanOrEqual(7_000);
      expect(you(h).shelves.map((sh: any) => [sh.product, sh.stock, sh.cap, sh.price])).toEqual([
        ['apples', 6, 12, 1],
        ['melons', 6, 12, 4],
        ['bread', 6, 12, 3],
        ['cakes', 6, 12, 4],
      ]);
    }
  });

  it('decides each next arrival when a customer comes: from half to one and a half times the average gap for the shop’s stars', () => {
    const h = cs({ settings: {} });
    for (let i = 0; i < 30; i++) {
      const at = shop(h).nextArrivalAt;
      if (at === null) break;
      until(h, at);
      const s = shop(h);
      const cu = s.queue.find((x: any) => x.arrivedAt === at);
      expect(cu, `customer ${i}`).toBeDefined();
      // No customer is due after the shop shuts.
      if (s.nextArrivalAt === null) break;
      const mean = BASE_GAP_MS / customerRate(starsOf(s.rating), s.up.sign);
      const gap = s.nextArrivalAt - at;
      expect(gap).toBeGreaterThanOrEqual(Math.floor(mean * 0.5));
      expect(gap).toBeLessThanOrEqual(Math.ceil(mean * 1.5));
    }
  });

  it('a better rating and a sign bring more customers, shown as customers a minute', () => {
    const h = cs();
    expect(you(h).perMinute).toBe(6);
    patch(h, (s) => (s.shops['p:a'].rating = 50));
    expect(you(h).perMinute).toBe(8.4);
    patch(h, (s) => (s.shops['p:a'].rating = 10));
    expect(you(h).perMinute).toBe(3.6);
    // Over many draws the gaps follow the rating.
    const average = (rating: number, sign: number) => {
      let total = 0;
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const g = cs({ seed });
        patch(g, (s) => {
          s.shops['p:a'].rating = rating;
          s.shops['p:a'].up.sign = sign;
          s.shops['p:a'].stock = Object.fromEntries(PRODUCT_ORDER.map((p) => [p, 0]));
        });
        for (let i = 0; i < 6; i++) {
          nextCustomer(g);
          const s = shop(g);
          // Keep the rating fixed for the test: departures would move it.
          patch(g, (x) => (x.shops['p:a'].rating = rating));
          total += s.nextArrivalAt - g.rt.gameNow();
          n++;
        }
      }
      return total / n;
    };
    const three = average(30, 0);
    const five = average(50, 0);
    const signed = average(30, 2);
    expect(three).toBeGreaterThan(8_500);
    expect(three).toBeLessThan(11_500);
    expect(five).toBeLessThan(three * 0.85);
    expect(signed).toBeLessThan(three * 0.8);
  });

  it('customers are friendly Glims with a stable look, a name, one to three things they want and about 30 seconds of patience', () => {
    const h = cs();
    const seen: any[] = [];
    for (let i = 0; i < 12; i++) {
      nextCustomer(h);
      const v = you(h);
      seen.push(v.queue[v.queue.length - 1]);
      // Serve them to keep the queue short.
      h.tick(3_000);
      act(h, 'a', { type: 'serve' });
    }
    for (const cu of seen) {
      expect(CUSTOMER_NAMES).toContain(cu.name);
      expect(Number.isInteger(cu.look)).toBe(true);
      expect(cu.kind).toBe('regular');
      const n = cu.items.reduce((m: number, it: any) => m + it.qty, 0);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      expect(cu.patienceMs).toBeGreaterThanOrEqual(25_500);
      expect(cu.patienceMs).toBeLessThanOrEqual(34_500);
      expect(cu.leavesAt - cu.arrivedAt).toBe(cu.patienceMs);
    }
    // The same customer keeps the same look from view to view.
    nextCustomer(h);
    const look = you(h).queue.at(-1).look;
    h.tick(500);
    expect(you(h).queue.at(-1).look).toBe(look);
  });

  it('sometimes asks for something the shop does not sell yet', () => {
    let asked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const h = cs({ seed });
      for (let i = 0; i < 8; i++) {
        nextCustomer(h);
        const cu = you(h).queue.at(-1);
        if (cu.items.some((it: any) => !['apples', 'melons', 'bread', 'cakes'].includes(it.product))) asked++;
      }
    }
    expect(asked).toBeGreaterThan(5);
    expect(asked).toBeLessThan(60);
  });

  it('a customer who runs out of patience leaves, and the rating drops half a star', () => {
    const h = cs();
    nextCustomer(h);
    const cu = you(h).queue[0];
    expect(shop(h).rating).toBe(30);
    until(h, cu.leavesAt - 1);
    expect(you(h).queue.some((x: any) => x.id === cu.id)).toBe(true);
    h.tick(1);
    expect(you(h).queue.some((x: any) => x.id === cu.id)).toBe(false);
    expect(shop(h).rating).toBeLessThanOrEqual(25);
    expect(you(h).left).toBeGreaterThanOrEqual(1);
    expect(you(h).news.some((n: any) => n.kind === 'left' && n.name === cu.name)).toBe(true);
  });

  it('a full queue turns new customers away: they walk past', () => {
    const h = cs({ settings: { busy: 'busy' } });
    patch(h, (s) => {
      s.shops['p:a'].rating = 50;
      s.shops['p:a'].up.sign = 2;
      s.shops['p:a'].up.decor = 2;
    });
    for (let i = 0; i < 40 && shop(h).walked === 0; i++) nextCustomer(h);
    expect(shop(h).queue).toHaveLength(6);
    expect(shop(h).walked).toBeGreaterThan(0);
    expect(you(h).queueMax).toBe(6);
    expect(you(h).news[0]).toMatchObject({ kind: 'walked' });
  });
});

describe('Corner Shop: serving', () => {
  it('serves the front customer in full: they pay the prices, tip for quick service, and the rating rises', () => {
    const h = cs();
    nextCustomer(h);
    wants(h, [
      { product: 'bread', qty: 2 },
      { product: 'apples', qty: 1 },
    ]);
    h.tick(2_000);
    const cu = you(h).queue[0];
    expect(act(h, 'a', { type: 'serve' }).ok).toBe(true);
    const tip = tipFor(7, 2_000, cu.patienceMs, 3, 'regular');
    const v = you(h);
    expect(v.cash).toBe(7 + tip);
    expect(v.sales[0]).toMatchObject({ kind: 'full', paid: 7, tip, rating: 2, waitedMs: 2_000, missing: [], customer: { id: cu.id, name: cu.name, look: cu.look, kind: 'regular' } });
    expect(v.sales[0].got).toEqual([
      { product: 'bread', qty: 2, price: 3 },
      { product: 'apples', qty: 1, price: 1 },
    ]);
    expect(v.shelves.find((sh: any) => sh.product === 'bread').stock).toBe(4);
    expect(v.shelves.find((sh: any) => sh.product === 'apples').stock).toBe(5);
    expect(shop(h).rating).toBe(32);
    expect(v.queue.some((x: any) => x.id === cu.id)).toBe(false);
    expect(v).toMatchObject({ served: 1, earned: 7 + tip, shopServed: 1 });
  });

  it('the till is busy for 2.5 seconds after a serve', () => {
    const h = cs();
    nextCustomer(h);
    nextCustomer(h);
    expect(act(h, 'a', { type: 'serve' }).ok).toBe(true);
    expect(you(h).till).toMatchObject({ level: 0, readyAt: h.rt.gameNow() + 2_500, serves: 1, busyMs: 2_500 });
    expect(act(h, 'a', { type: 'serve' })).toMatchObject({ ok: false, message: 'The till is still busy. Try again in a moment.' });
    h.tick(2_500);
    expect(act(h, 'a', { type: 'serve' }).ok).toBe(true);
    expect(act(h, 'a', { type: 'serve' })).toMatchObject({ ok: false });
  });

  it('serves any customer in the queue by id, and refuses with nobody there or a customer who has gone', () => {
    const h = cs();
    expect(act(h, 'a', { type: 'serve' })).toMatchObject({ ok: false, message: 'Nobody is waiting to be served.' });
    nextCustomer(h);
    nextCustomer(h);
    const [first, second] = you(h).queue;
    expect(act(h, 'a', { type: 'serve', customer: 999 })).toMatchObject({ ok: false, message: 'That customer is not in the queue any more.' });
    expect(act(h, 'a', { type: 'serve', customer: second.id }).ok).toBe(true);
    expect(you(h).queue.map((x: any) => x.id)).toEqual([first.id]);
  });

  it('with some of the order missing, sells what it has: half a tip and the rating dips', () => {
    const h = cs();
    nextCustomer(h);
    wants(h, [
      { product: 'cakes', qty: 3 },
      { product: 'comics', qty: 1 },
    ]);
    setStock(h, { cakes: 2 });
    const cu = you(h).queue[0];
    expect(you(h).queue[0].items).toEqual([
      { product: 'cakes', qty: 3, have: 2 },
      { product: 'comics', qty: 1, have: 0 },
    ]);
    act(h, 'a', { type: 'serve' });
    const sale = you(h).sales[0];
    expect(sale).toMatchObject({ kind: 'partial', paid: 8, rating: -2, missing: [{ product: 'cakes', qty: 1 }, { product: 'comics', qty: 1 }] });
    expect(sale.tip).toBe(tipFor(8, 0, cu.patienceMs, 3, 'regular', { partial: true }));
    expect(shop(h).rating).toBe(28);
    expect(you(h).shelves.find((sh: any) => sh.product === 'cakes').stock).toBe(0);
  });

  it('with none of it, says sorry: no sale, and the rating drops less than if they had waited it out', () => {
    const h = cs();
    nextCustomer(h);
    wants(h, [{ product: 'teddies', qty: 1 }]);
    act(h, 'a', { type: 'serve' });
    expect(you(h)).toMatchObject({ cash: 0, queue: [], sales: [{ kind: 'sorry', paid: 0, tip: 0, rating: -3 }] });
    expect(shop(h).rating).toBe(27);
  });

  it('a VIP wants one special thing, tips three times as much and is delighted when served in full', () => {
    const h = cs({ settings: { specials: true } });
    nextCustomer(h);
    wants(h, [{ product: 'melons', qty: 2 }], 'vip');
    const cu = you(h).queue[0];
    expect(cu.kind).toBe('vip');
    act(h, 'a', { type: 'serve' });
    expect(you(h).sales[0]).toMatchObject({ kind: 'full', paid: 8, tip: tipFor(8, 0, cu.patienceMs, 3, 'vip'), rating: 4 });
    expect(tipFor(8, 0, cu.patienceMs, 3, 'vip')).toBeGreaterThan(tipFor(8, 0, cu.patienceMs, 3, 'regular'));
  });

  it('a VIP served only part of it gives no tip and is cross', () => {
    const h = cs({ settings: { specials: true } });
    nextCustomer(h);
    wants(h, [{ product: 'melons', qty: 2 }], 'vip');
    setStock(h, { melons: 1 });
    act(h, 'a', { type: 'serve' });
    expect(you(h).sales[0]).toMatchObject({ kind: 'partial', paid: 4, tip: 0, rating: -4 });
  });

  it('special customers: about one in eight is a VIP wanting one product, about one in eight is in a hurry with half the patience', () => {
    const kinds: Record<string, number> = { regular: 0, vip: 0, hurry: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const h = cs({ seed, settings: { specials: true } });
      for (let i = 0; i < 5; i++) {
        nextCustomer(h);
        const cu = you(h).queue.at(-1);
        kinds[cu.kind]!++;
        if (cu.kind === 'vip') {
          expect(cu.items).toHaveLength(1);
          expect(cu.items[0].qty).toBeLessThanOrEqual(2);
          expect(['apples', 'melons', 'bread', 'cakes']).toContain(cu.items[0].product);
        }
        if (cu.kind === 'hurry') {
          expect(cu.patienceMs).toBeGreaterThanOrEqual(12_700);
          expect(cu.patienceMs).toBeLessThanOrEqual(17_300);
        }
      }
    }
    expect(kinds.vip).toBeGreaterThan(10);
    expect(kinds.vip).toBeLessThan(45);
    expect(kinds.hurry).toBeGreaterThan(10);
    expect(kinds.hurry).toBeLessThan(45);
  });
});

describe('Corner Shop: upgrades', () => {
  it('lists every upgrade with the cost and effect of its next level', () => {
    const h = cs();
    expect(you(h).upgrades).toEqual([
      { id: 'shelf', level: 0, max: 3, cost: 15 },
      { id: 'till', level: 0, max: 2, cost: 20 },
      { id: 'decor', level: 0, max: 2, cost: 15 },
      { id: 'sign', level: 0, max: 2, cost: 15 },
    ]);
    // What each level is called and does, for the screens.
    expect(UPGRADES.shelf.levels.map((l) => [l.cost, l.title])).toEqual([
      [15, 'Bigger shelves'],
      [30, 'Tall shelves'],
      [50, 'Grand shelves'],
    ]);
    expect(UPGRADES.till.levels.map((l) => [l.cost, l.title])).toEqual([
      [20, 'Quick till'],
      [45, 'Double till'],
    ]);
    expect(UPGRADES.decor.levels.map((l) => [l.cost, l.title])).toEqual([
      [15, 'Comfy chairs'],
      [30, 'Plants and music'],
    ]);
    expect(UPGRADES.sign.levels.map((l) => [l.cost, l.title])).toEqual([
      [15, 'Painted sign'],
      [35, 'Neon sign'],
    ]);
    expect(you(h).lineShop).toEqual(LINE_ORDER.map((line) => ({ line, cost: LINES[line].cost, owned: line === 'fruit' || line === 'bakery' })));
  });

  it('refuses what cannot be bought, with a reason, and charges nothing', () => {
    const h = cs();
    setCash(h, 10);
    expect(act(h, 'a', { type: 'upgrade', upgrade: 'sign' })).toMatchObject({ ok: false, message: 'You need $15 for painted sign.' });
    expect(act(h, 'a', { type: 'addLine', line: 'books' })).toMatchObject({ ok: false, message: 'There is no room for another product line. Buy bigger shelves first.' });
    expect(act(h, 'a', { type: 'addLine', line: 'fruit' })).toMatchObject({ ok: false, message: 'Your shop already sells fruit.' });
    expect(you(h).cash).toBe(10);
  });

  it('shelves hold 4 more a level and make room for one more product line; a new line opens with empty shelves', () => {
    expect([0, 1, 2, 3].map((l) => [capacityOf(l), slotsOf(l)])).toEqual([
      [12, 2],
      [16, 3],
      [20, 4],
      [24, 5],
    ]);
    const h = cs();
    setCash(h, 500);
    expect(act(h, 'a', { type: 'upgrade', upgrade: 'shelf' }).ok).toBe(true);
    expect(you(h)).toMatchObject({ cash: 485, slots: 3 });
    expect(you(h).shelves.every((sh: any) => sh.cap === 16)).toBe(true);
    expect(act(h, 'a', { type: 'addLine', line: 'books' }).ok).toBe(true);
    expect(you(h).cash).toBe(460);
    expect(you(h).lines).toEqual(['fruit', 'bakery', 'books']);
    expect(you(h).shelves.filter((sh: any) => PRODUCTS[sh.product as ProductId].line === 'books')).toEqual([
      { product: 'comics', stock: 0, cap: 16, price: 5, salePrice: null },
      { product: 'storybooks', stock: 0, cap: 16, price: 9, salePrice: null },
    ]);
    // More lines bring more customers: 10% a line beyond two.
    expect(you(h).perMinute).toBe(6.6);
    act(h, 'a', { type: 'upgrade', upgrade: 'shelf' });
    act(h, 'a', { type: 'upgrade', upgrade: 'shelf' });
    expect(act(h, 'a', { type: 'upgrade', upgrade: 'shelf' })).toMatchObject({ ok: false, message: 'Your shelves cannot go any higher.' });
    expect(you(h).upgrades[0]).toMatchObject({ level: 3, max: 3, cost: null });
    expect(shop(h).spent).toBe(15 + 25 + 30 + 50);
  });

  it('a quick till is ready again after 1 second; a double till serves two customers at once', () => {
    const h = cs();
    setCash(h, 100);
    act(h, 'a', { type: 'upgrade', upgrade: 'till' });
    nextCustomer(h);
    act(h, 'a', { type: 'serve' });
    expect(you(h).till).toMatchObject({ level: 1, readyAt: h.rt.gameNow() + TILL_MS[1], serves: 1 });
    expect(you(h).sales).toHaveLength(1);
    act(h, 'a', { type: 'upgrade', upgrade: 'till' });
    nextCustomer(h);
    nextCustomer(h);
    nextCustomer(h);
    const queue = you(h).queue.map((x: any) => x.id);
    expect(queue.length).toBeGreaterThanOrEqual(2);
    setStock(h, { apples: 12, melons: 12, bread: 12, cakes: 12 });
    expect(act(h, 'a', { type: 'serve' }).ok).toBe(true);
    expect(you(h).sales.map((x: any) => x.customer.id)).toEqual([queue[0], queue[1]]);
    expect(you(h).queue.map((x: any) => x.id)).toEqual(queue.slice(2));
    expect(you(h).served).toBe(3);
  });

  it('cosy decor makes new customers and those already waiting more patient', () => {
    const h = cs();
    setCash(h, 100);
    nextCustomer(h);
    const before = you(h).queue[0];
    act(h, 'a', { type: 'upgrade', upgrade: 'decor' });
    const after = you(h).queue[0];
    expect(after.leavesAt - before.leavesAt).toBe(DECOR_MS[1]);
    expect(after.patienceMs - before.patienceMs).toBe(DECOR_MS[1]);
    nextCustomer(h);
    const next = you(h).queue.at(-1);
    expect(next.patienceMs).toBeGreaterThanOrEqual(Math.round((30_000 + 8_000) * 0.85));
  });

  it('a sign brings 30% more customers at once: the wait for the next one shrinks to match', () => {
    const h = cs();
    setCash(h, 100);
    h.tick(1_000);
    const was = shop(h).nextArrivalAt;
    const now = h.rt.gameNow();
    act(h, 'a', { type: 'upgrade', upgrade: 'sign' });
    expect(shop(h).nextArrivalAt).toBe(now + Math.round((was - now) / 1.3));
    expect(you(h).perMinute).toBe(7.8);
    expect(you(h)).toMatchObject({ cash: 85 });
  });

  it('a market stall’s shelves stop at level 2, with room for three product lines at most', () => {
    const h = cs({ variant: pick('corner-shop-market-stall') });
    setCash(h, 500);
    expect(you(h)).toMatchObject({ lines: ['fruit'], slots: 1 });
    expect(you(h).shelves.map((sh: any) => [sh.product, sh.stock, sh.cap])).toEqual([
      ['apples', 4, 8],
      ['melons', 4, 8],
    ]);
    act(h, 'a', { type: 'upgrade', upgrade: 'shelf' });
    act(h, 'a', { type: 'upgrade', upgrade: 'shelf' });
    expect(act(h, 'a', { type: 'upgrade', upgrade: 'shelf' })).toMatchObject({ ok: false });
    expect(you(h)).toMatchObject({ slots: 3 });
    expect(you(h).shelves[0].cap).toBe(16);
  });
});

describe('Corner Shop: events', () => {
  /** A one-player game whose first event (at 60 seconds) is `kind`. */
  const firstEvent = (kind: EventKind, players = ['a']) => {
    for (let seed = 1; seed < 60; seed++) {
      const h = cs({ seed, players, settings: { events: true } });
      until(h, 60_000);
      if (h.view(players[0]!).event?.kind === kind) return h;
    }
    throw new Error(`no seed starts with ${kind}`);
  };

  it('come every 70 to 90 seconds from the first minute, never the same twice in a row, and only if they can finish in time', () => {
    expect(eventChoices('rush')).toEqual(['sale', 'truck']);
    expect(eventChoices(null)).toEqual(['rush', 'sale', 'truck']);
    const h = cs({ settings: { events: true } });
    expect(h.view('a').nextEventAt).toBe(60_000);
    const starts: [number, string][] = [];
    for (let t = 1_000; t <= 420_000 && h.rt.status !== 'ended'; t += 1_000) {
      until(h, t);
      const ev = h.view('a')?.event;
      if (ev && ev.seq > starts.length) starts.push([ev.startedAt, ev.kind]);
    }
    expect(starts[0]![0]).toBe(60_000);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]![0] - starts[i - 1]![0]).toBeGreaterThanOrEqual(70_000);
      expect(starts[i]![0] - starts[i - 1]![0]).toBeLessThanOrEqual(90_000);
      expect(starts[i]![1]).not.toBe(starts[i - 1]![1]);
    }
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (const [t] of starts) expect(t + 30_000).toBeLessThanOrEqual(420_000);
  });

  it('Rush Hour: twice the customers for 25 seconds', () => {
    const h = firstEvent('rush');
    expect(h.view('a').event).toMatchObject({ kind: 'rush', startedAt: 60_000, endsAt: 60_000 + EVENTS.rush.lengthMs });
    const stars = starsOf(shop(h).rating);
    expect(you(h).perMinute).toBeCloseTo(6 * customerRate(stars, 0) * 2, 1);
    expect(h.feed.map((f) => f.text)).toContain('Rush Hour: twice as many customers for 25 seconds.');
    until(h, 85_000);
    expect(h.view('a').event).toBeNull();
    expect(you(h).perMinute).toBeCloseTo(6 * customerRate(starsOf(shop(h).rating), 0), 1);
  });

  it('Sale Day: prices a fifth off for 30 seconds, sold at those prices, and half as many customers again', () => {
    const h = firstEvent('sale');
    const v = you(h);
    expect(v.shelves.map((sh: any) => [sh.product, sh.price, sh.salePrice])).toEqual([
      ['apples', 1, 1],
      ['melons', 4, 3],
      ['bread', 3, 2],
      ['cakes', 4, 3],
    ]);
    expect(v.perMinute).toBeCloseTo(6 * customerRate(starsOf(shop(h).rating), 0) * 1.5, 1);
    nextCustomer(h);
    patch(h, (s) => {
      const q = s.shops['p:a'].queue;
      q[q.length - 1].items = [{ product: 'cakes', qty: 2 }];
      s.shops['p:a'].queue = [q[q.length - 1]];
    });
    act(h, 'a', { type: 'serve' });
    expect(you(h).sales[0]).toMatchObject({ paid: 6, sale: true, got: [{ product: 'cakes', qty: 2, price: 3 }] });
    until(h, 90_000);
    expect(you(h).shelves.every((sh: any) => sh.salePrice === null)).toBe(true);
  });

  it('Delivery Truck: 3 more of everything for every shop, up to what the shelves hold', () => {
    for (let seed = 1; seed < 60; seed++) {
      const h = cs({ seed, players: ['a', 'b'], settings: { events: true } });
      setStock(h, { apples: 11, melons: 0, bread: 5, cakes: 12 }, 'p:a');
      setStock(h, { apples: 0, melons: 0, bread: 0, cakes: 0 }, 'p:b');
      // Keep customers from buying anything before the truck comes.
      patch(h, (s) => {
        for (const id of ['p:a', 'p:b']) s.shops[id].nextArrivalAt = 59_000;
      });
      until(h, 60_000);
      if (h.view('a').event?.kind !== 'truck') continue;
      const stock = (id: string) => Object.fromEntries(you(h, id).shelves.map((sh: any) => [sh.product, sh.stock]));
      // The customers who came at 59 seconds are still waiting.
      expect(stock('a')).toEqual({ apples: 12, melons: 3, bread: 8, cakes: 12 });
      expect(stock('b')).toEqual({ apples: 3, melons: 3, bread: 3, cakes: 3 });
      expect(h.feed.map((f) => f.text)).toContain('The Delivery Truck is here: 3 more of everything for every shop.');
      return;
    }
    throw new Error('no truck first');
  });
});

describe('Corner Shop: views', () => {
  it('never puts an answer in any view: questions, offers, the queue and the big screen', () => {
    const h = cs({ players: ['a', 'b'], settings: { events: true, specials: true } });
    for (let i = 0; i < 60; i++) {
      for (const id of ['a', 'b']) {
        const v = you(h, id);
        if (v.offer) act(h, id, { type: 'pickDelivery', offer: v.offer.seq, index: i % 3 });
        else if (v.queue.length && v.till.readyAt <= h.rt.gameNow() && i % 2) act(h, id, { type: 'serve' });
        else h.answer(id, i % 4 ? 'right' : 'wrong');
      }
      h.tick(1_500);
      expect([...findAnswerLeaks(h.view('a'), 'a'), ...findAnswerLeaks(h.view('b'), 'b'), ...findAnswerLeaks(h.host(), 'host')]).toEqual([]);
    }
    expect(h.errors).toEqual([]);
  });

  it('stays under 8 KB for a player and the big screen with 40 players and full queues', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i + 1}`);
    const h = cs({ players: ids, settings: { busy: 'busy', specials: true, events: true } });
    patch(h, (s) => {
      for (const id of ids) {
        const x = s.shops[`p:${id}`];
        x.rating = 50;
        x.up = { shelf: 3, till: 2, decor: 2, sign: 2 };
        x.lines = [...LINE_ORDER];
      }
    });
    until(h, 70_000);
    ids.slice(0, 20).forEach((id) => h.answer(id, 'right'));
    const queues = ids.map((id) => you(h, id).queue.length);
    expect(Math.max(...queues)).toBe(6);
    const player = JSON.stringify(h.view('p1')).length;
    const host = JSON.stringify(h.host()).length;
    expect(player).toBeLessThan(8_000);
    expect(host).toBeLessThan(8_000);
    expect(h.host().street).toHaveLength(40);
    expect(h.host().streetMore).toBe(0);
    expect(h.view('p1').board.length).toBeLessThanOrEqual(6);
  });

  it('the big screen shows every shop on the high street: name, cash, stars, queue and how full the shelves are', () => {
    const h = cs({ players: ['a', 'b'] });
    nextCustomer(h);
    const street = h.host().street;
    expect(street.map((x: any) => x.name)).toEqual(['A', 'B']);
    expect(street[0]).toMatchObject({ id: 'p:a', cash: 0, stars: 3, fill: 50, lines: 2, up: [0, 0, 0, 0], vip: false });
    expect(typeof street[0].queue).toBe('number');
    expect(h.host().board.map((r: any) => r.name)).toEqual(['A', 'B']);
  });
});

describe('Corner Shop: the room and results', () => {
  it('ranks shops by cash, with results for everyone, a summary and team averages', () => {
    const h = cs({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], teams: 2 });
    setCash(h, 50, 'p:a');
    setCash(h, 30, 'p:b');
    setCash(h, 70, 'p:c');
    expect(h.host().board.map((r: any) => [r.name, r.cash, r.rank])).toEqual([
      ['C', 70, 1],
      ['A', 50, 2],
      ['B', 30, 3],
    ]);
    expect(you(h, 'b').rank).toBe(3);
    h.rt.removePlayer('b');
    expect(h.host().board.map((r: any) => r.name)).toEqual(['C', 'A']);
    patch(h, (s) => {
      for (const id of ['p:a', 'p:c']) s.shops[id].nextArrivalAt = null;
    });
    until(h, 420_000);
    expect(h.rt.status).toBe('ended');
    const r = h.rt.results!;
    expect(r.standings.map((x) => [x.name, x.score, x.label])).toEqual([
      ['C', 70, '$70 in the till'],
      ['A', 50, '$50 in the till'],
      ['B', 30, '$30 in the till'],
    ]);
    expect(r.teamStandings!.find((t) => t.teamId === 't1')).toMatchObject({ score: 40, label: '$40 on average' });
    expect(r.teamStandings!.find((t) => t.teamId === 't2')).toMatchObject({ score: 70, label: '$70 on average' });
    expect(r.summary).toMatch(/^C's shop made \$70 and served \d+ customers\./);
  });

  it('a late joiner opens a shop of their own; a leaver’s shop shuts until they come back', () => {
    const h = cs({ players: ['a', 'b'] });
    h.tick(10_000);
    h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false });
    expect(you(h, 'late')).toMatchObject({ shopId: 'p:late', cash: 0, stars: 3, lines: ['fruit', 'bakery'] });
    expect(you(h, 'late').question).not.toBeNull();
    expect(h.host().street.map((x: any) => x.name)).toEqual(['A', 'B', 'Late']);
    h.rt.removePlayer('a');
    expect(shop(h)).toMatchObject({ active: false, queue: [], nextArrivalAt: null });
    const left = shop(h).left;
    h.tick(60_000);
    expect(shop(h)).toMatchObject({ left, queue: [] });
    h.rt.addPlayer({ id: 'a', name: 'A', teamId: null, isBot: false });
    expect(shop(h).active).toBe(true);
    expect(shop(h).nextArrivalAt).toBeGreaterThan(h.rt.gameNow());
    // A disconnected player's shop keeps running.
    h.rt.setConnected('b', false);
    nextCustomer(h, 'p:b');
    expect(you(h, 'b').queue.length).toBeGreaterThan(0);
  });

  it('with no time limit the shop still shuts after 7 minutes', () => {
    const h = cs({ common: { timeLimitSec: 0 } });
    expect(h.view('a').endsAt).toBe(420_000);
    until(h, 420_000);
    expect(h.rt.status).toBe('ended');
  });

  it('ends at the time limit the host sets', () => {
    const h = cs({ common: { timeLimitSec: 300 } });
    expect(h.view('a').endsAt).toBe(300_000);
    until(h, 300_000);
    expect(h.rt.status).toBe('ended');
  });
});

describe('Corner Shop: variants', () => {
  it('Market Stall: one product line, small shelves, and quicker customers with 20 seconds of patience', () => {
    const v = pick('corner-shop-market-stall');
    expect(v.locked).toEqual(['shopSize']);
    const h = cs({ variant: v });
    expect(you(h)).toMatchObject({ lines: ['fruit'], slots: 1 });
    // ×1.35 for a stall, ×0.9 for one line: about 7.3 a minute at 3 stars.
    expect(you(h).perMinute).toBe(7.3);
    for (let i = 0; i < 6; i++) {
      nextCustomer(h);
      const cu = you(h).queue.at(-1);
      expect(cu.patienceMs).toBeGreaterThanOrEqual(17_000);
      expect(cu.patienceMs).toBeLessThanOrEqual(23_000);
      expect(cu.items.reduce((n: number, it: any) => n + it.qty, 0)).toBeLessThanOrEqual(3);
    }
    expect(SHOP_SIZES.stall).toMatchObject({ capacity: 8, slots: 1, shelfMax: 2, patienceMs: 20_000 });
  });

  it('Big Spenders: baskets of 2 to 5 things, tips twice as big, and a VIP in every four', () => {
    const v = pick('corner-shop-big-spenders');
    expect(v.locked).toEqual(['bigSpenders', 'specials']);
    const kinds: Record<string, number> = { regular: 0, vip: 0, hurry: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const h = cs({ seed, variant: v, settings: { specials: true } });
      for (let i = 0; i < 5; i++) {
        nextCustomer(h);
        const cu = you(h).queue.at(-1);
        kinds[cu.kind]!++;
        const n = cu.items.reduce((m: number, it: any) => m + it.qty, 0);
        if (cu.kind === 'vip') expect([2, 3]).toContain(n);
        else {
          expect(n).toBeGreaterThanOrEqual(2);
          expect(n).toBeLessThanOrEqual(5);
        }
      }
    }
    expect(kinds.vip).toBeGreaterThan(14);
    // Tips are doubled for every sale.
    const h = cs({ variant: v });
    nextCustomer(h);
    wants(h, [{ product: 'cakes', qty: 3 }]);
    const cu = you(h).queue[0];
    act(h, 'a', { type: 'serve' });
    expect(you(h).sales[0].tip).toBe(tipFor(12, 0, cu.patienceMs, 3, 'regular', { big: true }));
    // $12 at 3 stars: $1.44 of tip doubles to $2.88, so $3 instead of $1.
    expect([tipFor(12, 0, 30_000, 3, 'regular'), tipFor(12, 0, 30_000, 3, 'regular', { big: true })]).toEqual([1, 3]);
  });

  it('Co-op Shop: each team shares one shop: everyone’s deliveries fill it, anyone serves its queue, and its cash is the team’s score', () => {
    const v = pick('corner-shop-co-op');
    expect(v).toMatchObject({ settings: { coop: true }, common: { teamCount: 2 }, locked: ['coop'] });
    const h = cs({ variant: v, players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }] });
    expect(you(h, 'a').shopId).toBe('t:t1');
    expect(you(h, 'b').shopId).toBe('t:t1');
    expect(you(h, 'c').shopId).toBe('t:t2');
    expect(you(h, 'a').shopName).toBe("The Comets' shop");
    expect(h.view('a').coop).toBe(true);
    // Two clerks: more customers and a longer queue.
    expect(you(h, 'a').perMinute).toBe(10.5);
    expect(you(h, 'a').queueMax).toBe(8);
    expect(you(h, 'c').queueMax).toBe(6);
    // B's delivery fills the shelves A sees.
    h.answer('b', 'right');
    const offer = you(h, 'b').offer;
    const i = offer.options.findIndex((o: any) => o.kind === 'stock');
    act(h, 'b', { type: 'pickDelivery', offer: offer.seq, index: i });
    const product = offer.options[i].product;
    expect(you(h, 'a').shelves.find((sh: any) => sh.product === product).stock).toBe(you(h, 'b').shelves.find((sh: any) => sh.product === product).stock);
    expect(you(h, 'a').offer).toBeNull();
    // Each clerk has their own till, on one queue.
    nextCustomer(h, 't:t1');
    nextCustomer(h, 't:t1');
    expect(act(h, 'a', { type: 'serve' }).ok).toBe(true);
    expect(act(h, 'b', { type: 'serve' }).ok).toBe(true);
    expect(shop(h, 't:t1').served).toBe(2);
    patch(h, (s) => {
      s.shops['t:t1'].cash = 90;
      s.shops['t:t2'].cash = 40;
      s.clerks.a.earned = 60;
      s.clerks.b.earned = 30;
      s.clerks.c.earned = 40;
      for (const id of ['t:t1', 't:t2']) s.shops[id].nextArrivalAt = null;
    });
    expect(h.host().board.map((r: any) => [r.name, r.cash])).toEqual([
      ['Comets', 90],
      ['Lanterns', 40],
    ]);
    until(h, 420_000);
    const r = h.rt.results!;
    expect(r.teamStandings!.map((t) => [t.teamId, t.score, t.label])).toEqual([
      ['t1', 90, '$90 in the till'],
      ['t2', 40, '$40 in the till'],
    ]);
    expect(r.standings.map((x) => [x.name, x.score, x.label])).toEqual([
      ['A', 60, '$60 taken at the till'],
      ['C', 40, '$40 taken at the till'],
      ['B', 30, '$30 taken at the till'],
    ]);
    expect(r.summary).toMatch(/^The Comets' shop made \$90/);
  });

  it('every variant changes a setting that is off in the base mode, and locks it', () => {
    const defaults = Object.fromEntries(cornerShop.settings.map((f) => [f.key, f.default]));
    expect(defaults).toMatchObject({ shopSize: 'shop', bigSpenders: false, coop: false, specials: true, events: true, busy: 'normal' });
    for (const v of variants) {
      for (const k of v.locked ?? []) expect(k in (v.settings ?? {})).toBe(true);
      expect(Object.entries(v.settings ?? {}).some(([k, val]) => defaults[k] !== val)).toBe(true);
    }
  });
});

describe('Corner Shop: bots', () => {
  const view = (over: Record<string, unknown> = {}) => ({
    endsAt: 420_000,
    you: {
      asOf: 10_000,
      cash: 0,
      question: { iid: 'q1', shownAt: 9_000 },
      queueMax: 6,
      till: { readyAt: 0 },
      shelves: [
        { product: 'apples', stock: 6, cap: 12, price: 1 },
        { product: 'bread', stock: 0, cap: 12, price: 3 },
      ],
      lines: ['fruit', 'bakery'],
      slots: 2,
      lineShop: LINE_ORDER.map((line) => ({ line, cost: LINES[line].cost, owned: line === 'fruit' || line === 'bakery' })),
      upgrades: ['shelf', 'till', 'decor', 'sign'].map((id) => ({ id, level: 0, cost: (UPGRADES as any)[id].levels[0].cost })),
      queue: [],
      left: 0,
      offer: null,
      ...over,
    },
  });
  const customer = (id: number, items: { product: string; qty: number }[], o: Record<string, unknown> = {}) => ({ id, kind: 'regular', items, arrivedAt: 0, patienceMs: 30_000, leavesAt: 30_000, ...o });

  it('serve a customer in a hurry first, then a VIP they can serve in full, then the front of the queue', () => {
    const v = view({
      queue: [customer(1, [{ product: 'apples', qty: 1 }]), customer(2, [{ product: 'apples', qty: 2 }], { kind: 'vip' }), customer(3, [{ product: 'apples', qty: 1 }], { kind: 'hurry' })],
    }).you;
    expect(botServeChoice(v, 10_000)).toBe(3);
    expect(botServeChoice({ ...v, queue: v.queue.slice(0, 2) }, 10_000)).toBe(2);
    expect(botServeChoice({ ...v, queue: v.queue.slice(0, 1) }, 10_000)).toBe(1);
    // A VIP who cannot have it all waits for stock.
    expect(botServeChoice({ ...v, queue: [customer(4, [{ product: 'bread', qty: 1 }, { product: 'apples', qty: 1 }], { kind: 'vip' }), customer(5, [{ product: 'apples', qty: 1 }])] }, 10_000)).toBe(5);
    // Nothing to sell anyone: sorry to the front customer.
    expect(botServeChoice({ ...v, queue: [customer(6, [{ product: 'bread', qty: 1 }])] }, 10_000)).toBe(6);
    // Not while the till is busy.
    expect(botServeChoice({ ...v, till: { readyAt: 11_000 } }, 10_000)).toBeNull();
  });

  it('keep answering while the queue is calm, serve between questions when it backs up, and drop everything when someone is about to leave', () => {
    const calm = view({ queue: [customer(1, [{ product: 'apples', qty: 1 }], { leavesAt: 35_000 })] });
    expect(botPressure(calm.you, 10_000)).toBe('calm');
    expect(botMove(calm, 10_000)).toBe('answer');
    const busy = view({ queue: [1, 2, 3].map((i) => customer(i, [{ product: 'apples', qty: 1 }], { leavesAt: 35_000 })), question: { iid: 'q1', shownAt: 9_500 } });
    expect(botPressure(busy.you, 10_000)).toBe('busy');
    // Fresh question: serve first, then answer once it has had time to think.
    expect(botMove(busy, 10_000)).toBe('serve');
    expect(botMove(busy, 12_000)).toBe('answer');
    const critical = view({ queue: [customer(1, [{ product: 'apples', qty: 1 }], { leavesAt: 15_000 })], question: { iid: 'q1', shownAt: 0 } });
    expect(botPressure(critical.you, 10_000)).toBe('critical');
    expect(botMove(critical, 10_000)).toBe('serve');
    expect(botMove(view({ offer: { seq: 1, options: [] } }), 10_000)).toBe('pick');
  });

  it('pick the delivery that fills what is low and what the queue is waiting for', () => {
    const v = view({
      shelves: [
        { product: 'apples', stock: 11, cap: 12, price: 1 },
        { product: 'bread', stock: 2, cap: 12, price: 3 },
      ],
      queue: [customer(1, [{ product: 'bread', qty: 5 }])],
      offer: {
        seq: 1,
        options: [
          { kind: 'stock', product: 'apples', qty: 10 },
          { kind: 'stock', product: 'bread', qty: 5 },
          { kind: 'crate' },
        ],
      },
    }).you;
    const values = botDeliveryValues(v);
    expect(values.indexOf(Math.max(...values))).toBe(1);
  });

  it('buy a product line, then a sign, then shelves, while the shelves can feed more customers, and nothing near the end', () => {
    const full = [
      { product: 'apples', stock: 10, cap: 12, price: 1 },
      { product: 'bread', stock: 10, cap: 12, price: 3 },
    ];
    expect(botPurchase(view({ cash: 100, shelves: full }), 10_000)).toEqual({ type: 'upgrade', upgrade: 'sign' });
    expect(botPurchase(view({ cash: 100, shelves: full, slots: 3 }), 10_000)).toEqual({ type: 'addLine', line: 'books' });
    const signed = ['shelf', 'till', 'decor', 'sign'].map((id) => ({ id, level: id === 'sign' ? 1 : 0, cost: (UPGRADES as any)[id].levels[id === 'sign' ? 1 : 0].cost }));
    expect(botPurchase(view({ cash: 100, shelves: full, upgrades: signed }), 10_000)).toEqual({ type: 'upgrade', upgrade: 'shelf' });
    // Empty shelves: save the cash, it could not feed more customers.
    expect(botPurchase(view({ cash: 100 }), 10_000)).toBeNull();
    expect(botPurchase(view({ cash: 100, shelves: full }), 330_000)).toBeNull();
    expect(botPurchase(view({ cash: 5, shelves: full }), 10_000)).toBeNull();
  });

  it('a room of bots stocks, serves, buys and finishes with cash for everyone', () => {
    const r = simulateGame({ modeId: 'corner-shop', questions: MIXED_SET, players: 6, seed: 12 });
    expect(r.errors).toEqual([]);
    expect(r.stalled).toBe(false);
    expect(r.leaks).toEqual([]);
    expect(r.results?.standings.every((s) => s.score > 50)).toBe(true);
    expect(r.results?.summary).toMatch(/shop made \$[\d,]+ and served \d+ customers\./);
  });

  it('upgrades pay for themselves: bots that buy end with more cash than bots that never do', () => {
    const noBuy = {
      ...cornerShop,
      bot: (v: any, ctx: any) => cornerShop.bot!(v?.you ? { ...v, you: { ...v.you, cash: 0 } } : v, ctx),
      botDelay: (v: any, rng: any) => cornerShop.botDelay!(v?.you ? { ...v, you: { ...v.you, cash: 0 } } : v, rng),
    };
    let buying = 0;
    let saving = 0;
    for (const seed of [3, 5, 7]) {
      const a = simulateGame({ modeId: 'corner-shop', questions: MIXED_SET, players: 2, seed });
      const b = simulateGame({ modeId: 'corner-shop', mode: noBuy, questions: MIXED_SET, players: 2, seed });
      buying += a.results!.standings.reduce((n, s) => n + s.score, 0);
      saving += b.results!.standings.reduce((n, s) => n + s.score, 0);
    }
    expect(buying).toBeGreaterThan(saving * 1.1);
  });

  it('a slower answerer still runs a shop worth having', () => {
    const total = (skill: number) => [11, 13, 17].reduce((n, seed) => n + simulateGame({ modeId: 'corner-shop', questions: MIXED_SET, players: 2, seed, skill }).results!.standings.reduce((m, s) => m + s.score, 0), 0);
    const slow = total(0.4);
    const quick = total(0.85);
    expect(slow).toBeGreaterThan(quick * 0.6);
    expect(slow).toBeLessThan(quick);
  });
});
