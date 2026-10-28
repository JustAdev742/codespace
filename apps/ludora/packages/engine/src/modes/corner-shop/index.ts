/*
 * Corner Shop: run a little shop. Right answers bring the deliveries;
 * customers bring the cash.
 *
 * Every player has a question stream and a clerk record (their offer, their
 * till and their last sales). Every shop has shelves, a queue, cash, a rating
 * and upgrades. Normally each player runs their own shop; with Team shops on
 * (the Co-op variant) each team shares one, so several clerks serve one queue
 * and fill one set of shelves.
 *
 * Customers arrive on a per-shop schedule. The gap to the next customer is
 * drawn from ctx.rng when the previous one arrives, from the shop's rating,
 * sign, the event running and the host's setting. A customer whose patience
 * runs out leaves. Each shop keeps one timer, at its next arrival or
 * departure, and `advanceShop` plays those out in order up to a given time,
 * so a jump of the clock comes out the same as a steady tick. A shop is never
 * advanced past an event boundary before that event's own timer has fired.
 *
 * Money is whole dollars.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { listNames, nameOf } from '../rules.ts';
import {
  BASE_GAP_MS,
  BIG_SPENDER_SIZES,
  BUSY,
  COOP,
  CRATE_CASH,
  CRATE_CHANCE,
  CRATE_MIXED,
  CRATE_ODDS,
  CUSTOMER_KINDS,
  CUSTOMER_NAMES,
  DECOR_MS,
  EVENT_ORDER,
  EVENT_TIMING,
  EVENTS,
  LINE_CUSTOMERS,
  LINE_ORDER,
  LINES,
  OFFER_SIZE,
  PATIENCE_SPREAD,
  PRODUCTS,
  QUEUE_MAX,
  RATING,
  SALE_OFF,
  SHOP_SIZES,
  SIGN_CUSTOMERS,
  START_STOCK,
  STAR_CUSTOMERS,
  TILL_MS,
  TILL_SERVES,
  TIP,
  TRUCK_STOCK,
  UNSTOCKED_CHANCE,
  UPGRADE_ORDER,
  UPGRADES,
  cashText,
  meta,
  settings,
  type CrateId,
  type CustomerKind,
  type EventKind,
  type LineId,
  type ProductId,
  type UpgradeId,
} from './meta.ts';

type Settings = {
  busy: string;
  specials: boolean;
  events: boolean;
  shopSize: string;
  bigSpenders: boolean;
  coop: boolean;
};
type Ctx = ModeContext<Settings>;

interface Item {
  product: ProductId;
  qty: number;
}

interface Customer {
  /** Unique within the shop. */
  id: number;
  name: string;
  /** A stable seed the renderer turns into this customer's Glim. */
  look: number;
  kind: CustomerKind;
  items: Item[];
  arrivedAt: number;
  patienceMs: number;
  leavesAt: number;
}

type SaleKind = 'full' | 'partial' | 'sorry';

/** What happened when a customer was served, for the clerk who served them. */
interface Sale {
  seq: number;
  at: number;
  customer: { id: number; name: string; look: number; kind: CustomerKind };
  kind: SaleKind;
  got: (Item & { price: number })[];
  missing: Item[];
  paid: number;
  tip: number;
  /** Rating change, in tenths of a star. */
  rating: number;
  waitedMs: number;
  sale: boolean;
}

type DeliveryOption = { kind: 'stock'; product: ProductId; qty: number } | { kind: 'crate' };

interface Delivery {
  seq: number;
  at: number;
  crate: CrateId | null;
  product: ProductId | null;
  added: Item[];
  wasted: number;
  cash: number;
}

interface Clerk {
  shopId: string;
  stream: StreamState;
  offer: { seq: number; options: DeliveryOption[] } | null;
  offers: number;
  /** Game time this clerk's till is ready to serve again. */
  tillReadyAt: number;
  /** What happened at this clerk's last press of Serve: one sale, or two with a double till, in queue order. */
  sales: Sale[];
  delivery: Delivery | null;
  /** Cash this clerk took at the till (sales, tips and crate cash). */
  earned: number;
  served: number;
  away: boolean;
}

type NewsKind = 'left' | 'walked';

interface ShopNews {
  seq: number;
  at: number;
  kind: NewsKind;
  name: string;
  /** Customers who walked past, counted together while it keeps happening. */
  count: number;
}

interface Shop {
  id: string;
  /** The team that runs it, for a team shop. */
  teamId: string | null;
  /** The player who runs it, for a player's own shop. */
  owner: PlayerId | null;
  cash: number;
  /** Tenths of a star, 10 to 50. */
  rating: number;
  lines: LineId[];
  stock: Record<ProductId, number>;
  up: Record<UpgradeId, number>;
  queue: Customer[];
  nextArrivalAt: number | null;
  /** Someone is running it. A shop nobody is in is shut: no customers come. */
  active: boolean;
  nextCustomer: number;
  wakeAt: number | null;
  served: number;
  full: number;
  walked: number;
  left: number;
  sales: number;
  tips: number;
  spent: number;
  wasted: number;
  news: ShopNews[];
  newsSeq: number;
  fiveStars: boolean;
}

interface ShopEvent {
  kind: EventKind;
  startedAt: number;
  endsAt: number;
  seq: number;
}

interface State {
  shops: Record<string, Shop>;
  clerks: Record<PlayerId, Clerk>;
  /** Shop ids in the order they opened: the high street, left to right. */
  street: string[];
  endsAt: number;
  event: ShopEvent | null;
  nextEventAt: number | null;
  lastEvent: EventKind | null;
  events: number;
  saleSeq: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('pickDelivery'), offer: z.number().int().min(0), index: z.number().int().min(0).max(OFFER_SIZE - 1) }),
  z.object({ type: z.literal('serve'), customer: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('upgrade'), upgrade: z.enum(['shelf', 'till', 'decor', 'sign']) }),
  z.object({ type: z.literal('addLine'), line: z.enum(['fruit', 'bakery', 'books', 'plants', 'toys']) }),
]);
type Action = z.infer<typeof action>;

/** Used when the host sets no time limit: the shop always shuts. */
const DEFAULT_TIME_MS = meta.common.defaults.timeLimitSec! * 1000;
const NEWS_KEEP = 3;
/** Shopfronts on the big screen's high street, in the order they opened; more are counted, not drawn. */
const STREET_MAX = 40;
/** The first customer of a new shop comes this soon (plus up to 3 seconds). */
const FIRST_CUSTOMER_MS = 4_000;
/** The longest event, so an event only starts if it can finish before the shop shuts. */
const LONGEST_EVENT_MS = Math.max(...EVENT_ORDER.map((k) => EVENTS[k].lengthMs));
/** Bots stop buying this close to the end: an upgrade would not pay back. */
const BOT_LAST_BUY_MS = 100_000;
/** A bot serves between questions once this many are queuing... */
const BOT_BUSY_QUEUE = 3;
/** ...or someone has less than this share of their patience left... */
const BOT_PATIENCE_LEFT = 0.45;
/** ...and drops its question at once for someone with less than this share left. */
const BOT_PATIENCE_CRITICAL = 0.2;
/** A bot has a question on screen at least this long before it answers. */
const BOT_THINK_MS = 2_200;

/* --------------------------------- numbers -------------------------------- */

interface Config {
  size: (typeof SHOP_SIZES)['shop' | 'stall'];
  busy: number;
  specials: boolean;
  events: boolean;
  big: boolean;
  coop: boolean;
  sizes: readonly number[];
}

function config(ctx: Ctx): Config {
  const st = ctx.settings;
  const size = SHOP_SIZES[st.shopSize === 'stall' ? 'stall' : 'shop'];
  const big = st.bigSpenders === true;
  return {
    size,
    busy: BUSY[st.busy]?.mult ?? 1,
    specials: st.specials !== false,
    events: st.events !== false,
    big,
    coop: st.coop === true,
    sizes: big ? BIG_SPENDER_SIZES : size.sizes,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Stars in halves, from a rating in tenths of a star. */
export function starsOf(rating: number): number {
  return Math.round(rating / 5) / 2;
}

/** A Sale Day price: a fifth off, in whole dollars, never below $1. */
export function salePrice(price: number): number {
  return Math.max(1, Math.round(price * (1 - SALE_OFF)));
}

/** Room on each shelf. */
export function capacityOf(shelf: number, size: Config['size'] = SHOP_SIZES.shop): number {
  return size.capacity + size.capacityStep * shelf;
}

/** Product lines a shop has room for. */
export function slotsOf(shelf: number, size: Config['size'] = SHOP_SIZES.shop): number {
  return size.slots + shelf;
}

/**
 * The tip for a sale: `rate` of what they paid, times stars ÷ 5, times their kind's tip, shrinking
 * to nothing as their patience runs out. Partly served customers tip half; a VIP, nothing.
 */
export function tipFor(paid: number, waitedMs: number, patienceMs: number, stars: number, kind: CustomerKind, opts: { partial?: boolean; big?: boolean } = {}): number {
  if (paid <= 0) return 0;
  const left = clamp(1 - waitedMs / Math.max(1, patienceMs), 0, 1);
  let tip = paid * TIP.rate * left * (stars / 5) * CUSTOMER_KINDS[kind].tip * (opts.big ? TIP.bigSpenders : 1);
  if (opts.partial) tip *= kind === 'vip' ? 0 : TIP.partial;
  return Math.round(tip);
}

/** The rating change for a sale, in tenths of a star, given the share of their patience a customer had used up. */
export function ratingFor(kind: CustomerKind, sale: SaleKind, waited: number): number {
  if (sale === 'sorry') return RATING.sorry;
  if (sale === 'partial') return kind === 'vip' ? RATING.vipPartial : RATING.partial;
  const speed = waited <= 1 / 3 ? RATING.quick : waited <= 2 / 3 ? RATING.full : 0;
  return speed + (kind === 'vip' ? RATING.vip : 0);
}

/** A crate's contents from one draw in [0, 1), by the weights in CRATE_ODDS. */
export function drawCrate(roll: number): CrateId {
  const total = CRATE_ODDS.reduce((n, o) => n + o.weight, 0);
  let r = roll * total;
  for (const o of CRATE_ODDS) {
    r -= o.weight;
    if (r < 0) return o.id;
  }
  return CRATE_ODDS[CRATE_ODDS.length - 1]!.id;
}

/** The index of one of `weights`, chosen in proportion to them by a draw in [0, 1). */
function weightedIndex(weights: readonly number[], roll: number): number {
  const total = weights.reduce((n, w) => n + w, 0);
  let r = roll * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function weighted<T>(items: readonly T[], weight: (t: T) => number, roll: number): T {
  const total = items.reduce((n, t) => n + weight(t), 0);
  let r = roll * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1]!;
}

const owned = (shop: Shop): ProductId[] => LINE_ORDER.filter((l) => shop.lines.includes(l)).flatMap((l) => LINES[l].products);
const unowned = (shop: Shop): ProductId[] => LINE_ORDER.filter((l) => !shop.lines.includes(l)).flatMap((l) => LINES[l].products);
const capOf = (shop: Shop, c: Config) => capacityOf(shop.up.shelf, c.size);
const shelfMax = (c: Config) => c.size.shelfMax;
const upgradeMax = (id: UpgradeId, c: Config) => (id === 'shelf' ? shelfMax(c) : UPGRADES[id].levels.length);

function eventAt(s: State, at: number): EventKind | null {
  const ev = s.event;
  return ev && at >= ev.startedAt && at < ev.endsAt ? ev.kind : null;
}

function priceAt(s: State, product: ProductId, at: number): number {
  const p = PRODUCTS[product].price;
  return eventAt(s, at) === 'sale' ? salePrice(p) : p;
}

/** Clerks in the game who work in this shop. */
function members(s: State, ctx: Ctx, shopId: string): PlayerId[] {
  return ctx
    .players()
    .filter((p) => s.clerks[p.id]?.shopId === shopId && !s.clerks[p.id]!.away)
    .map((p) => p.id);
}

/** Shops someone in the game works in, counted in one pass over the players. */
function staffed(s: State, ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const p of ctx.players()) {
    const clerk = s.clerks[p.id];
    if (clerk && !clerk.away) out.add(clerk.shopId);
  }
  return out;
}

function teamShop(shop: Shop, c: Config) {
  return c.coop && shop.teamId !== null;
}

function queueMax(s: State, ctx: Ctx, shop: Shop, c: Config): number {
  if (!teamShop(shop, c)) return QUEUE_MAX;
  const n = Math.max(1, members(s, ctx, shop.id).length);
  return Math.min(COOP.queueMax, QUEUE_MAX + COOP.queuePerMember * (n - 1));
}

/** How many times as often customers come to this shop as to a new shop at 3 stars, at game time `at`. */
export function customerRate(stars: number, sign: number, opts: { lines?: number; busy?: number; size?: number; event?: EventKind | null; team?: number } = {}): number {
  const ev = opts.event ? EVENTS[opts.event].customers : 1;
  const team = opts.team && opts.team > 1 ? Math.min(COOP.max, 1 + COOP.perMember * (opts.team - 1)) : 1;
  const lines = 1 + LINE_CUSTOMERS * ((opts.lines ?? 2) - 2);
  return (1 + STAR_CUSTOMERS * (stars - 3)) * (SIGN_CUSTOMERS[sign] ?? 1) * lines * (opts.busy ?? 1) * (opts.size ?? 1) * ev * team;
}

function rateOf(s: State, ctx: Ctx, shop: Shop, at: number, c: Config): number {
  return customerRate(starsOf(shop.rating), shop.up.sign, {
    lines: shop.lines.length,
    busy: c.busy,
    size: c.size.customers,
    event: eventAt(s, at),
    team: teamShop(shop, c) ? members(s, ctx, shop.id).length : 1,
  });
}

/* -------------------------------- customers -------------------------------- */

function newCustomer(shop: Shop, at: number, ctx: Ctx, c: Config): Customer {
  let kind: CustomerKind = 'regular';
  if (c.specials) {
    const roll = ctx.rng.next();
    const vip = c.big ? CUSTOMER_KINDS.vip.bigChance : CUSTOMER_KINDS.vip.chance;
    const hurry = c.big ? CUSTOMER_KINDS.hurry.bigChance : CUSTOMER_KINDS.hurry.chance;
    kind = roll < vip ? 'vip' : roll < vip + hurry ? 'hurry' : 'regular';
  }
  const name = ctx.rng.pick(CUSTOMER_NAMES);
  const look = ctx.rng.int(0, 999_999);
  const mine = owned(shop);
  const others = unowned(shop);
  const wants: Partial<Record<ProductId, number>> = {};
  if (kind === 'vip') {
    // One special thing the shop sells, more likely the dear ones.
    const product = weighted(mine, (p) => PRODUCTS[p].price, ctx.rng.next());
    wants[product] = (c.big ? 2 : 1) + ctx.rng.int(0, 1);
  } else {
    const n = 1 + weightedIndex(c.sizes, ctx.rng.next());
    for (let i = 0; i < n; i++) {
      const product = others.length && ctx.rng.chance(UNSTOCKED_CHANCE) ? ctx.rng.pick(others) : weighted(mine, (p) => PRODUCTS[p].popularity, ctx.rng.next());
      wants[product] = (wants[product] ?? 0) + 1;
    }
  }
  const items = (Object.keys(PRODUCTS) as ProductId[]).filter((p) => wants[p]).map((p) => ({ product: p, qty: wants[p]! }));
  const spread = 1 - PATIENCE_SPREAD + 2 * PATIENCE_SPREAD * ctx.rng.next();
  const patienceMs = Math.round(((c.size.patienceMs + DECOR_MS[shop.up.decor]!) * CUSTOMER_KINDS[kind].patience * spread) / 100) * 100;
  shop.nextCustomer++;
  return { id: shop.nextCustomer, name, look, kind, items, arrivedAt: at, patienceMs, leavesAt: at + patienceMs };
}

function addNews(shop: Shop, at: number, kind: NewsKind, name: string) {
  const top = shop.news[0];
  // Walk-pasts come in bunches while the queue is full: count them on one line.
  if (kind === 'walked' && top?.kind === 'walked' && at - top.at < 10_000) {
    top.count++;
    top.at = at;
    return;
  }
  shop.newsSeq++;
  shop.news = [{ seq: shop.newsSeq, at, kind, name, count: 1 }, ...shop.news].slice(0, NEWS_KEEP);
}

function changeRating(s: State, ctx: Ctx, shop: Shop, delta: number) {
  shop.rating = clamp(shop.rating + delta, RATING.min, RATING.max);
  if (starsOf(shop.rating) === 5 && !shop.fiveStars) {
    shop.fiveStars = true;
    ctx.feed(`${shopName(shop, ctx)} reached 5 stars.`, { tone: 'good' });
  }
}

function drawGap(s: State, ctx: Ctx, shop: Shop, at: number, c: Config): number {
  return Math.round((BASE_GAP_MS / rateOf(s, ctx, shop, at, c)) * (0.5 + ctx.rng.next()));
}

function scheduleArrival(s: State, ctx: Ctx, shop: Shop, at: number, c: Config) {
  const next = at + drawGap(s, ctx, shop, at, c);
  shop.nextArrivalAt = next < s.endsAt ? next : null;
}

function arrive(s: State, ctx: Ctx, shop: Shop, at: number, c: Config) {
  if (shop.queue.length < queueMax(s, ctx, shop, c)) shop.queue.push(newCustomer(shop, at, ctx, c));
  else {
    shop.walked++;
    addNews(shop, at, 'walked', ctx.rng.pick(CUSTOMER_NAMES));
  }
  scheduleArrival(s, ctx, shop, at, c);
}

function leave(s: State, ctx: Ctx, shop: Shop, i: number) {
  const cu = shop.queue.splice(i, 1)[0]!;
  shop.left++;
  changeRating(s, ctx, shop, RATING.left);
  addNews(shop, cu.leavesAt, 'left', cu.name);
}

function firstToLeave(shop: Shop): number {
  let best = -1;
  shop.queue.forEach((cu, i) => {
    if (best < 0 || cu.leavesAt < shop.queue[best]!.leavesAt) best = i;
  });
  return best;
}

/** Plays out a shop's arrivals and departures, in order, up to game time `to`. */
function advanceShop(s: State, ctx: Ctx, shop: Shop, to: number, c: Config) {
  for (let guard = 0; guard < 2_000; guard++) {
    const i = firstToLeave(shop);
    const leaveAt = i >= 0 ? shop.queue[i]!.leavesAt : Infinity;
    const arriveAt = shop.active && shop.nextArrivalAt !== null ? shop.nextArrivalAt : Infinity;
    const t = Math.min(leaveAt, arriveAt);
    if (t > to) return;
    if (leaveAt <= arriveAt) leave(s, ctx, shop, i);
    else arrive(s, ctx, shop, arriveAt, c);
  }
}

/** Shops are never played past the next event boundary before its own timer fires. */
function boundary(s: State, now: number): number {
  let b = now;
  if (s.nextEventAt !== null) b = Math.min(b, s.nextEventAt);
  if (s.event) b = Math.min(b, s.event.endsAt);
  return b;
}

function advanceAll(s: State, ctx: Ctx, to: number, c: Config) {
  for (const id of s.street) advanceShop(s, ctx, s.shops[id]!, to, c);
}

function syncTimer(ctx: Ctx, shop: Shop) {
  const i = firstToLeave(shop);
  const leaveAt = i >= 0 ? shop.queue[i]!.leavesAt : null;
  const arriveAt = shop.active ? shop.nextArrivalAt : null;
  const at = leaveAt === null ? arriveAt : arriveAt === null ? leaveAt : Math.min(leaveAt, arriveAt);
  if (at === shop.wakeAt) return;
  shop.wakeAt = at;
  if (at === null) ctx.clearTimer(`shop:${shop.id}`);
  else ctx.setTimer(`shop:${shop.id}`, at);
}

function syncAll(s: State, ctx: Ctx) {
  for (const id of s.street) syncTimer(ctx, s.shops[id]!);
}

/** A change in how often customers come: the wait for the next one stretches or shrinks to match, from `at`. */
function rescale(shop: Shop, at: number, before: number, after: number) {
  if (shop.nextArrivalAt === null || !shop.active || before === after) return;
  shop.nextArrivalAt = at + Math.round(((shop.nextArrivalAt - at) * before) / after);
}

/* ---------------------------------- shops ---------------------------------- */

function shopName(shop: Shop, ctx: Ctx): string {
  if (shop.teamId !== null && shop.owner === null) {
    const team = ctx.teams().find((t) => t.id === shop.teamId);
    return `The ${team?.name ?? 'team'}' shop`;
  }
  return `${nameOf(ctx, shop.owner ?? '')}'s shop`;
}

function displayName(shop: Shop, ctx: Ctx): string {
  if (shop.teamId !== null && shop.owner === null) return ctx.teams().find((t) => t.id === shop.teamId)?.name ?? 'Team';
  return nameOf(ctx, shop.owner ?? '');
}

function emptyStock(): Record<ProductId, number> {
  return Object.fromEntries((Object.keys(PRODUCTS) as ProductId[]).map((p) => [p, 0])) as Record<ProductId, number>;
}

function openShop(s: State, ctx: Ctx, id: string, owner: PlayerId | null, teamId: string | null, now: number, c: Config): Shop {
  const shop: Shop = {
    id,
    teamId,
    owner,
    cash: 0,
    rating: RATING.start,
    lines: [...c.size.startLines],
    stock: emptyStock(),
    up: { shelf: 0, till: 0, decor: 0, sign: 0 },
    queue: [],
    nextArrivalAt: null,
    active: true,
    nextCustomer: 0,
    wakeAt: null,
    served: 0,
    full: 0,
    walked: 0,
    left: 0,
    sales: 0,
    tips: 0,
    spent: 0,
    wasted: 0,
    news: [],
    newsSeq: 0,
    fiveStars: false,
  };
  for (const p of owned(shop)) shop.stock[p] = Math.floor(capOf(shop, c) * START_STOCK);
  shop.nextArrivalAt = now + FIRST_CUSTOMER_MS + ctx.rng.int(0, 3_000);
  s.shops[id] = shop;
  s.street.push(id);
  return shop;
}

/** The shop a player works in: their team's, with Team shops on, or their own. */
function shopIdFor(p: EnginePlayer, c: Config): { id: string; owner: PlayerId | null; teamId: string | null } {
  if (c.coop && p.teamId) return { id: `t:${p.teamId}`, owner: null, teamId: p.teamId };
  return { id: `p:${p.id}`, owner: p.id, teamId: p.teamId };
}

function newClerk(ctx: Ctx, shopId: string): Clerk {
  return { shopId, stream: streamInit(ctx), offer: null, offers: 0, tillReadyAt: 0, sales: [], delivery: null, earned: 0, served: 0, away: false };
}

function join(s: State, ctx: Ctx, p: EnginePlayer, now: number, c: Config) {
  const where = shopIdFor(p, c);
  const shop = s.shops[where.id] ?? openShop(s, ctx, where.id, where.owner, where.teamId, now, c);
  s.clerks[p.id] = newClerk(ctx, shop.id);
  if (!shop.active) reopen(s, ctx, shop, now, c);
}

function reopen(s: State, ctx: Ctx, shop: Shop, now: number, c: Config) {
  shop.active = true;
  scheduleArrival(s, ctx, shop, now, c);
}

/** Nobody is left to run the shop: it shuts until someone comes back, and the queue drifts away. */
function shut(shop: Shop) {
  shop.active = false;
  shop.queue = [];
  shop.nextArrivalAt = null;
}

/* -------------------------------- deliveries ------------------------------- */

function makeOffer(shop: Shop, ctx: Ctx): DeliveryOption[] {
  const mine = owned(shop);
  const crate = mine.length < OFFER_SIZE || ctx.rng.chance(CRATE_CHANCE);
  const picks = ctx.rng.shuffle(mine).slice(0, crate ? OFFER_SIZE - 1 : OFFER_SIZE);
  const options: DeliveryOption[] = picks.map((product) => ({ kind: 'stock', product, qty: PRODUCTS[product].delivery }));
  while (options.length < OFFER_SIZE) options.splice(ctx.rng.int(0, options.length), 0, { kind: 'crate' });
  return options;
}

/** Puts up to `qty` on a shelf; returns how many fitted. */
function stockUp(shop: Shop, product: ProductId, qty: number, c: Config, added: Item[]): number {
  const fits = Math.max(0, Math.min(qty, capOf(shop, c) - shop.stock[product]));
  shop.stock[product] += fits;
  if (fits > 0) {
    const row = added.find((a) => a.product === product);
    if (row) row.qty += fits;
    else added.push({ product, qty: fits });
  }
  return fits;
}

function deliver(ctx: Ctx, clerk: Clerk, shop: Shop, option: DeliveryOption, seq: number, at: number, c: Config) {
  const added: Item[] = [];
  let offered = 0;
  let cash = 0;
  let crate: CrateId | null = null;
  let product: ProductId | null = null;
  const mine = owned(shop);
  const cap = capOf(shop, c);
  if (option.kind === 'stock') {
    product = option.product;
    offered = option.qty;
    stockUp(shop, product, offered, c, added);
  } else {
    crate = drawCrate(ctx.rng.next());
    switch (crate) {
      case 'mixed':
        for (const p of mine) {
          offered += CRATE_MIXED;
          stockUp(shop, p, CRATE_MIXED, c, added);
        }
        break;
      case 'fill': {
        // The emptiest shelf, by how full it is (the first in line on a tie).
        product = mine.reduce((a, b) => (shop.stock[b] < shop.stock[a] ? b : a));
        offered = cap - shop.stock[product];
        stockUp(shop, product, offered, c, added);
        break;
      }
      case 'double':
        product = ctx.rng.pick(mine);
        offered = 2 * PRODUCTS[product].delivery;
        stockUp(shop, product, offered, c, added);
        break;
      case 'cash':
        cash = CRATE_CASH;
        shop.cash += cash;
        clerk.earned += cash;
        break;
      case 'golden':
        for (const p of mine) {
          offered += cap - shop.stock[p];
          stockUp(shop, p, cap - shop.stock[p], c, added);
        }
        break;
    }
  }
  const wasted = offered - added.reduce((n, a) => n + a.qty, 0);
  shop.wasted += wasted;
  clerk.delivery = { seq, at, crate, product, added, wasted, cash };
}

/* --------------------------------- serving --------------------------------- */

function sell(s: State, ctx: Ctx, clerk: Clerk, shop: Shop, cu: Customer, at: number, c: Config): Sale {
  shop.queue = shop.queue.filter((x) => x.id !== cu.id);
  const got: (Item & { price: number })[] = [];
  const missing: Item[] = [];
  for (const it of cu.items) {
    const have = Math.min(it.qty, shop.stock[it.product]);
    if (have > 0) {
      shop.stock[it.product] -= have;
      got.push({ product: it.product, qty: have, price: priceAt(s, it.product, at) });
    }
    if (have < it.qty) missing.push({ product: it.product, qty: it.qty - have });
  }
  const kind: SaleKind = got.length === 0 ? 'sorry' : missing.length ? 'partial' : 'full';
  const waitedMs = at - cu.arrivedAt;
  const paid = got.reduce((n, g) => n + g.qty * g.price, 0);
  const tip = tipFor(paid, waitedMs, cu.patienceMs, starsOf(shop.rating), cu.kind, { partial: kind === 'partial', big: c.big });
  const delta = ratingFor(cu.kind, kind, waitedMs / cu.patienceMs);
  shop.cash += paid + tip;
  shop.sales += paid;
  shop.tips += tip;
  shop.served++;
  if (kind === 'full') shop.full++;
  clerk.earned += paid + tip;
  clerk.served++;
  changeRating(s, ctx, shop, delta);
  s.saleSeq++;
  return {
    seq: s.saleSeq,
    at,
    customer: { id: cu.id, name: cu.name, look: cu.look, kind: cu.kind },
    kind,
    got,
    missing,
    paid,
    tip,
    rating: delta,
    waitedMs,
    sale: eventAt(s, at) === 'sale',
  };
}

const canHaveAny = (shop: Shop, cu: Customer) => cu.items.some((it) => shop.stock[it.product] > 0);

/* --------------------------------- events ---------------------------------- */

function scheduleEvent(s: State, ctx: Ctx, at: number) {
  if (at + LONGEST_EVENT_MS <= s.endsAt) {
    s.nextEventAt = at;
    ctx.setTimer('event', at);
  } else {
    s.nextEventAt = null;
    ctx.clearTimer('event');
  }
}

/** Every event is equally likely, never the same one twice in a row. */
export function eventChoices(last: EventKind | null): EventKind[] {
  return EVENT_ORDER.filter((k) => k !== last);
}

function rates(s: State, ctx: Ctx, at: number, c: Config): number[] {
  return s.street.map((id) => rateOf(s, ctx, s.shops[id]!, at, c));
}

function startEvent(s: State, ctx: Ctx, c: Config) {
  const at = s.nextEventAt ?? ctx.now();
  advanceAll(s, ctx, at, c);
  const before = rates(s, ctx, at, c);
  const kind = ctx.rng.pick(eventChoices(s.lastEvent));
  s.events++;
  s.event = { kind, startedAt: at, endsAt: at + EVENTS[kind].lengthMs, seq: s.events };
  const after = rates(s, ctx, at, c);
  s.street.forEach((id, i) => rescale(s.shops[id]!, at, before[i]!, after[i]!));
  if (kind === 'truck') {
    for (const id of s.street) {
      const shop = s.shops[id]!;
      if (!shop.active) continue;
      for (const p of owned(shop)) stockUp(shop, p, TRUCK_STOCK, c, []);
    }
    ctx.feed(`The Delivery Truck is here: ${TRUCK_STOCK} more of everything for every shop.`, { tone: 'big' });
  } else if (kind === 'rush') ctx.feed('Rush Hour: twice as many customers for 25 seconds.', { tone: 'big' });
  else ctx.feed('Sale Day: everything is a fifth cheaper for 30 seconds, and customers flock in.', { tone: 'big' });
  ctx.setTimer('eventEnd', s.event.endsAt);
  scheduleEvent(s, ctx, at + ctx.rng.int(EVENT_TIMING.gapMinMs, EVENT_TIMING.gapMaxMs));
}

function endEvent(s: State, ctx: Ctx, c: Config) {
  const ev = s.event;
  if (!ev) return;
  const at = ev.endsAt;
  advanceAll(s, ctx, at, c);
  const before = rates(s, ctx, at - 1, c);
  s.lastEvent = ev.kind;
  s.event = null;
  const after = rates(s, ctx, at, c);
  s.street.forEach((id, i) => rescale(s.shops[id]!, at, before[i]!, after[i]!));
}

/* ---------------------------------- views ---------------------------------- */

interface Row {
  id: string;
  name: string;
  teamId: string | null;
  cash: number;
  stars: number;
  rank: number;
}

/** Shops with someone in them, most cash first; equal cash shares a rank. */
function ranking(s: State, ctx: Ctx, open: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const id of s.street) {
    const shop = s.shops[id]!;
    if (!open.has(id)) continue;
    rows.push({ id, name: displayName(shop, ctx), teamId: shop.teamId, cash: shop.cash, stars: starsOf(shop.rating), rank: 0 });
  }
  rows.sort((a, b) => b.cash - a.cash || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.cash === r.cash ? rows[i - 1]!.rank : i + 1));
  return rows;
}

/** Team averages in a normal team game; each team's shop cash with Team shops on. */
function teamRows(s: State, ctx: Ctx, c: Config) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    if (c.coop) {
      const shop = s.shops[`t:${t.id}`];
      return { teamId: t.id, name: t.name, hue: t.hue, members: everyone.filter((p) => p.teamId === t.id).length, cash: shop?.cash ?? 0 };
    }
    const shops = everyone.filter((p) => p.teamId === t.id).map((p) => s.shops[`p:${p.id}`]).filter((x): x is Shop => Boolean(x));
    const total = shops.reduce((n, x) => n + x.cash, 0);
    return { teamId: t.id, name: t.name, hue: t.hue, members: shops.length, cash: shops.length ? Math.round(total / shops.length) : 0 };
  });
}

function upgradeView(shop: Shop, c: Config) {
  return UPGRADE_ORDER.map((id) => {
    const level = shop.up[id];
    const max = upgradeMax(id, c);
    const next = level < max ? UPGRADES[id].levels[level]! : null;
    // Titles and what each level does are in UPGRADES (meta.ts), for the screens.
    return { id, level, max, cost: next ? next.cost : null };
  });
}

function customerView(shop: Shop, cu: Customer) {
  return {
    id: cu.id,
    name: cu.name,
    look: cu.look,
    kind: cu.kind,
    items: cu.items.map((it) => ({ product: it.product, qty: it.qty, have: Math.min(it.qty, shop.stock[it.product]) })),
    arrivedAt: cu.arrivedAt,
    patienceMs: cu.patienceMs,
    leavesAt: cu.leavesAt,
  };
}

function fillOf(shop: Shop, c: Config): number {
  const mine = owned(shop);
  if (!mine.length) return 0;
  const cap = capOf(shop, c) * mine.length;
  return Math.round((mine.reduce((n, p) => n + shop.stock[p], 0) / cap) * 100);
}

/* ---------------------------------- bots ----------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How pressing the queue is for a bot that has a question on the go. Critical: someone it can sell
 * to is about to give up, a customer in a hurry is waiting, the queue is nearly full, or there is no
 * question to answer. Busy: the queue is backing up, someone is past half their patience, or a VIP
 * can be served in full. Otherwise the till can wait.
 */
export function botPressure(you: any, now: number): 'critical' | 'busy' | 'calm' {
  const queue: any[] = you?.queue ?? [];
  if (!queue.length) return 'calm';
  const stock: Record<string, number> = Object.fromEntries((you.shelves as any[]).map((sh) => [sh.product, sh.stock]));
  const any = (cu: any) => (cu.items as any[]).some((it) => (stock[it.product] ?? 0) > 0);
  const all = (cu: any) => (cu.items as any[]).every((it) => (stock[it.product] ?? 0) >= it.qty);
  const left = (cu: any) => (cu.leavesAt - now) / cu.patienceMs;
  if (!you.question || queue.length >= you.queueMax - 1 || queue.some((cu) => any(cu) && (cu.kind === 'hurry' || left(cu) < BOT_PATIENCE_CRITICAL))) return 'critical';
  if (queue.length >= BOT_BUSY_QUEUE || queue.some((cu) => left(cu) < BOT_PATIENCE_LEFT || (cu.kind === 'vip' && all(cu)))) return 'busy';
  return 'calm';
}

/**
 * Who a bot serves: a customer in a hurry it can sell something to (the one leaving first), then
 * a VIP it can serve in full, then the front of the queue, then anyone it can sell something to.
 * A VIP it cannot serve in full waits for stock until their last few seconds. With nothing to sell
 * anybody, it says sorry to the front customer rather than let them wait it out. Null while the
 * till is busy.
 */
export function botServeChoice(you: any, now: number): number | null {
  const queue: any[] = you?.queue ?? [];
  if (!queue.length || you.till.readyAt > now) return null;
  const stock: Record<string, number> = Object.fromEntries((you.shelves as any[]).map((sh) => [sh.product, sh.stock]));
  const any = (cu: any) => (cu.items as any[]).some((it) => (stock[it.product] ?? 0) > 0);
  const all = (cu: any) => (cu.items as any[]).every((it) => (stock[it.product] ?? 0) >= it.qty);
  const servable = (cu: any) => any(cu) && (cu.kind !== 'vip' || all(cu) || cu.leavesAt - now < 4_000);
  const soonest = (list: any[]) => [...list].sort((a, b) => a.leavesAt - b.leavesAt)[0];
  const hurry = soonest(queue.filter((cu) => cu.kind === 'hurry' && any(cu)));
  if (hurry) return hurry.id;
  const vip = queue.find((cu) => cu.kind === 'vip' && all(cu));
  if (vip) return vip.id;
  if (servable(queue[0])) return queue[0].id;
  const other = soonest(queue.filter(servable));
  if (other) return other.id;
  return queue.some(any) ? null : queue[0].id;
}

/**
 * A bot's next move, like a player juggling a question and a queue: pick a delivery at once; leave
 * the question for the till only when the queue is critical; answer once it has had the question
 * long enough to think it through; serve a busy queue in between; buy when nothing else needs doing.
 */
export function botMove(view: any, now: number): 'pick' | 'serve' | 'answer' | 'buy' | null {
  const you = view?.you;
  if (!you) return null;
  if (you.offer) return 'pick';
  const pressure = botPressure(you, now);
  const canServe = botServeChoice(you, now) !== null;
  if (canServe && pressure === 'critical') return 'serve';
  const q = you.question;
  if (q && now - q.shownAt >= BOT_THINK_MS) return 'answer';
  if (canServe && pressure === 'busy') return 'serve';
  if (botPurchase(view, now)) return 'buy';
  return q ? 'answer' : null;
}

/** A rough dollar value for each delivery option: what fits, at its price, with extra weight on what the queue is short of. */
export function botDeliveryValues(you: any): number[] {
  const shelves: any[] = you.shelves;
  const short: Record<string, number> = {};
  for (const cu of you.queue as any[]) for (const it of cu.items) short[it.product] = (short[it.product] ?? 0) + it.qty;
  for (const sh of shelves) short[sh.product] = Math.max(0, (short[sh.product] ?? 0) - sh.stock);
  const room = (sh: any) => sh.cap - sh.stock;
  const worth = (sh: any, n: number) => Math.min(n, room(sh)) * sh.price + Math.min(n, room(sh), short[sh.product] ?? 0) * sh.price * 2;
  const total = CRATE_ODDS.reduce((n, o) => n + o.weight, 0);
  const holds: Record<CrateId, number> = {
    mixed: shelves.reduce((n, sh) => n + worth(sh, CRATE_MIXED), 0),
    fill: Math.max(0, ...shelves.map((sh) => worth(sh, room(sh)))),
    double: shelves.reduce((n, sh) => n + worth(sh, 2 * PRODUCTS[sh.product as ProductId].delivery), 0) / Math.max(1, shelves.length),
    cash: CRATE_CASH,
    golden: shelves.reduce((n, sh) => n + worth(sh, room(sh)), 0),
  };
  const crate = CRATE_ODDS.reduce((n, o) => n + (o.weight / total) * holds[o.id], 0);
  return (you.offer.options as any[]).map((o) => {
    if (o.kind === 'crate') return crate;
    const sh = shelves.find((x) => x.product === o.product);
    return sh ? worth(sh, o.qty) : 0;
  });
}

/**
 * What a bot buys next, if anything. It buys growth only while its shelves are full enough to feed
 * more customers: a new product line when there is room, a sign, then shelves to make room for
 * another line. Decor once customers have given up waiting, a faster till once customers have been
 * lost to the queue (given up or walked past). Nothing in the last 100 seconds, when it could not
 * pay back.
 */
export function botPurchase(view: any, now: number): Action | null {
  const you = view?.you;
  if (!you || view.endsAt - now < BOT_LAST_BUY_MS) return null;
  const up: Record<UpgradeId, any> = Object.fromEntries((you.upgrades as any[]).map((u) => [u.id, u])) as Record<UpgradeId, any>;
  const free = you.lines.length < you.slots;
  const lineToBuy = (['books', 'toys', 'plants', 'bakery', 'fruit'] as LineId[]).map((l) => (you.lineShop as any[]).find((x) => x.line === l && !x.owned)).find(Boolean);
  const fill = you.shelves.length ? (you.shelves as any[]).reduce((n, sh) => n + sh.stock / sh.cap, 0) / you.shelves.length : 0;
  const plan: { action: Action; cost: number; want: boolean }[] = [
    { action: { type: 'addLine', line: lineToBuy?.line ?? 'books' }, cost: lineToBuy?.cost ?? Infinity, want: free && Boolean(lineToBuy) && fill >= 0.3 },
    { action: { type: 'upgrade', upgrade: 'sign' }, cost: up.sign.cost ?? Infinity, want: up.sign.level === 0 && fill >= 0.4 },
    { action: { type: 'upgrade', upgrade: 'shelf' }, cost: up.shelf.cost ?? Infinity, want: !free && Boolean(lineToBuy) && fill >= 0.5 },
    { action: { type: 'upgrade', upgrade: 'decor' }, cost: up.decor.cost ?? Infinity, want: up.decor.level === 0 && you.left >= 3 },
    { action: { type: 'upgrade', upgrade: 'till' }, cost: up.till.cost ?? Infinity, want: up.till.level === 0 && you.walked + you.left >= 4 },
    { action: { type: 'upgrade', upgrade: 'sign' }, cost: up.sign.cost ?? Infinity, want: up.sign.level === 1 && fill >= 0.55 },
    { action: { type: 'upgrade', upgrade: 'till' }, cost: up.till.cost ?? Infinity, want: up.till.level === 1 && you.walked + you.left >= 8 },
    { action: { type: 'upgrade', upgrade: 'decor' }, cost: up.decor.cost ?? Infinity, want: up.decor.level === 1 && you.left >= 8 },
  ];
  return plan.find((p) => p.want && p.cost <= you.cash)?.action ?? null;
}

/* ---------------------------------- mode ----------------------------------- */

export const cornerShop = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const c = config(ctx);
    const now = ctx.now();
    const s: State = {
      shops: {},
      clerks: {},
      street: [],
      endsAt: now + (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec * 1000 : DEFAULT_TIME_MS),
      event: null,
      nextEventAt: null,
      lastEvent: null,
      events: 0,
      saleSeq: 0,
    };
    for (const p of ctx.players()) join(s, ctx, p, now, c);
    ctx.setTimer('end', s.endsAt);
    if (c.events) scheduleEvent(s, ctx, now + EVENT_TIMING.firstAtMs);
    syncAll(s, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    const c = config(ctx);
    const now = ctx.now();
    const clerk = s.clerks[p.id];
    if (!clerk) join(s, ctx, p, now, c);
    else if (clerk.away) {
      clerk.away = false;
      const shop = s.shops[clerk.shopId]!;
      if (!shop.active) {
        advanceShop(s, ctx, shop, now, c);
        reopen(s, ctx, shop, now, c);
      }
    }
    syncAll(s, ctx);
  },
  onPlayerLeave(s, p, ctx) {
    const c = config(ctx);
    const clerk = s.clerks[p.id];
    if (!clerk) return;
    clerk.away = true;
    const shop = s.shops[clerk.shopId]!;
    if (!members(s, ctx, shop.id).filter((id) => id !== p.id).length) {
      advanceShop(s, ctx, shop, ctx.now(), c);
      shut(shop);
    }
    syncAll(s, ctx);
  },
  onAction(s, pid, a, ctx) {
    const clerk = s.clerks[pid];
    if (!clerk || clerk.away) return { error: 'You are not in this game.' };
    const c = config(ctx);
    const now = ctx.now();
    const shop = s.shops[clerk.shopId]!;
    advanceShop(s, ctx, shop, now, c);
    switch (a.type) {
      case 'answer': {
        if (clerk.offer) return { error: 'Pick a delivery first.' };
        const res = streamSubmit(clerk.stream, pid, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (!res.correct) {
          if (clerk.stream.last) clerk.stream.last.text = 'No delivery this time.';
          streamNext(clerk.stream, ctx);
          break;
        }
        clerk.offers++;
        clerk.offer = { seq: clerk.offers, options: makeOffer(shop, ctx) };
        if (clerk.stream.last) clerk.stream.last.text = 'Delivery: pick one of three.';
        break;
      }
      case 'pickDelivery': {
        const offer = clerk.offer;
        if (!offer) return { error: 'There is no delivery to pick right now.' };
        if (offer.seq !== a.offer) return { error: 'That delivery has already been picked.' };
        const option = offer.options[a.index];
        if (!option) return { error: 'There is no delivery there.' };
        clerk.offer = null;
        deliver(ctx, clerk, shop, option, offer.seq, now, c);
        streamNext(clerk.stream, ctx);
        break;
      }
      case 'serve': {
        if (!shop.queue.length) return { error: 'Nobody is waiting to be served.' };
        if (clerk.tillReadyAt > now) return { error: 'The till is still busy. Try again in a moment.' };
        const first = a.customer === undefined ? shop.queue[0]! : shop.queue.find((cu) => cu.id === a.customer);
        if (!first) return { error: 'That customer is not in the queue any more.' };
        const served = [first];
        // A double till takes the next customer in line too, if there is anything to sell them.
        if (TILL_SERVES[shop.up.till]! > 1) {
          const second = shop.queue.find((cu) => cu.id !== first.id && canHaveAny(shop, cu));
          if (second) served.push(second);
        }
        const sales = served.map((cu) => sell(s, ctx, clerk, shop, cu, now, c));
        clerk.sales = sales;
        clerk.tillReadyAt = now + TILL_MS[shop.up.till]!;
        break;
      }
      case 'upgrade': {
        const id = a.upgrade;
        const level = shop.up[id];
        const info = UPGRADES[id];
        if (level >= upgradeMax(id, c)) return { error: `Your ${info.name.toLowerCase()} cannot go any higher.` };
        const cost = info.levels[level]!.cost;
        if (shop.cash < cost) return { error: `You need ${cashText(cost)} for ${info.levels[level]!.title.toLowerCase()}.` };
        const before = rateOf(s, ctx, shop, now, c);
        shop.cash -= cost;
        shop.spent += cost;
        shop.up[id]++;
        if (id === 'sign') rescale(shop, now, before, rateOf(s, ctx, shop, now, c));
        // Cosy decor makes everyone already waiting more patient too.
        if (id === 'decor') {
          const extra = DECOR_MS[shop.up.decor]! - DECOR_MS[level]!;
          for (const cu of shop.queue) {
            const more = Math.round(extra * CUSTOMER_KINDS[cu.kind].patience);
            cu.patienceMs += more;
            cu.leavesAt += more;
          }
        }
        break;
      }
      case 'addLine': {
        const line = a.line;
        if (shop.lines.includes(line)) return { error: `Your shop already sells ${LINES[line].name.toLowerCase()}.` };
        if (shop.lines.length >= slotsOf(shop.up.shelf, c.size)) return { error: 'There is no room for another product line. Buy bigger shelves first.' };
        const cost = LINES[line].cost;
        if (shop.cash < cost) return { error: `You need ${cashText(cost)} for the ${LINES[line].name.toLowerCase()} line.` };
        const before = rateOf(s, ctx, shop, now, c);
        shop.cash -= cost;
        shop.spent += cost;
        shop.lines = LINE_ORDER.filter((l) => l === line || shop.lines.includes(l));
        // A new line opens with empty shelves: deliveries fill them, like everything else.
        rescale(shop, now, before, rateOf(s, ctx, shop, now, c));
        break;
      }
    }
    syncTimer(ctx, shop);
  },
  onTimer(s, id, ctx) {
    const c = config(ctx);
    if (id === 'end') {
      advanceAll(s, ctx, s.endsAt, c);
      ctx.endGame();
      return;
    }
    if (id === 'event') startEvent(s, ctx, c);
    else if (id === 'eventEnd') endEvent(s, ctx, c);
    else if (id.startsWith('shop:')) {
      const shop = s.shops[id.slice(5)];
      if (shop) {
        shop.wakeAt = null;
        advanceShop(s, ctx, shop, boundary(s, ctx.now()), c);
      }
    }
    syncAll(s, ctx);
  },
  view(s, viewer, ctx) {
    const c = config(ctx);
    const now = ctx.now();
    const open = staffed(s, ctx);
    const rows = ranking(s, ctx, open);
    const host = viewer.kind === 'host';
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const clerk = me ? s.clerks[me] : undefined;
    const mineId = clerk?.shopId ?? null;
    const top = rows.slice(0, host ? 10 : 5).map((r) => ({ ...r, isYou: r.id === mineId }));
    const mine = rows.find((r) => r.id === mineId);
    if (mine && !top.some((r) => r.isYou)) top.push({ ...mine, isYou: true });
    const ev = s.event && now < s.event.endsAt ? s.event : null;
    const base = {
      endsAt: s.endsAt,
      coop: c.coop && ctx.teams().length > 0,
      event: ev ? { kind: ev.kind, startedAt: ev.startedAt, endsAt: ev.endsAt, seq: ev.seq } : null,
      nextEventAt: s.nextEventAt,
      board: top,
      shops: rows.length,
      teams: teamRows(s, ctx, c),
    };
    if (host) {
      const street = s.street.map((id) => s.shops[id]!).filter((shop) => open.has(shop.id));
      return {
        ...base,
        street: street.slice(0, STREET_MAX).map((shop) => ({
          id: shop.id,
          name: displayName(shop, ctx),
          teamId: shop.teamId,
          cash: shop.cash,
          stars: starsOf(shop.rating),
          queue: shop.queue.length,
          vip: shop.queue.some((cu) => cu.kind === 'vip'),
          fill: fillOf(shop, c),
          lines: shop.lines.length,
          /** Shelf, till, decor and sign levels. */
          up: UPGRADE_ORDER.map((id) => shop.up[id]),
        })),
        streetMore: Math.max(0, street.length - STREET_MAX),
        served: s.street.reduce((n, id) => n + s.shops[id]!.served, 0),
        left: s.street.reduce((n, id) => n + s.shops[id]!.left, 0),
      };
    }
    if (!clerk || !me) return { ...base, you: null };
    const shop = s.shops[clerk.shopId]!;
    const cap = capOf(shop, c);
    const sale = eventAt(s, now) === 'sale';
    return {
      ...base,
      you: {
        shopId: shop.id,
        shopName: shopName(shop, ctx),
        asOf: now,
        rank: mine?.rank ?? null,
        cash: shop.cash,
        rating: shop.rating / 10,
        stars: starsOf(shop.rating),
        perMinute: Math.round((60_000 / BASE_GAP_MS) * rateOf(s, ctx, shop, now, c) * 10) / 10,
        shelves: owned(shop).map((p) => ({
          product: p,
          stock: shop.stock[p],
          cap,
          price: PRODUCTS[p].price,
          salePrice: sale ? salePrice(PRODUCTS[p].price) : null,
        })),
        lines: shop.lines,
        slots: slotsOf(shop.up.shelf, c.size),
        lineShop: LINE_ORDER.map((line) => ({ line, cost: LINES[line].cost, owned: shop.lines.includes(line) })),
        queue: shop.queue.map((cu) => customerView(shop, cu)),
        queueMax: queueMax(s, ctx, shop, c),
        till: { level: shop.up.till, readyAt: clerk.tillReadyAt, serves: TILL_SERVES[shop.up.till]!, busyMs: TILL_MS[shop.up.till]! },
        upgrades: upgradeView(shop, c),
        offer: clerk.offer
          ? {
              seq: clerk.offer.seq,
              options: clerk.offer.options.map((o) =>
                o.kind === 'crate' ? { kind: 'crate' as const } : { kind: 'stock' as const, product: o.product, qty: o.qty, fits: Math.max(0, Math.min(o.qty, cap - shop.stock[o.product])) },
              ),
            }
          : null,
        crateOdds: CRATE_ODDS.map((o) => ({ id: o.id, weight: o.weight })),
        question: clerk.offer ? null : streamQuestionView(clerk.stream, ctx),
        last: clerk.stream.last,
        streak: clerk.stream.streak,
        sales: clerk.sales,
        delivery: clerk.delivery,
        news: shop.news,
        served: clerk.served,
        earned: clerk.earned,
        shopServed: shop.served,
        walked: shop.walked,
        left: shop.left,
      },
    };
  },
  results(s, ctx) {
    const c = config(ctx);
    const coop = c.coop && ctx.teams().length > 0;
    const standings = ctx.everyone().map((p) => {
      const clerk = s.clerks[p.id];
      const shop = clerk ? s.shops[clerk.shopId] : undefined;
      // In a team shop everyone shares the cash, so a player's own score is what they took at the till.
      if (coop && clerk && shop && shop.owner === null) return { playerId: p.id, score: clerk.earned, label: `${cashText(clerk.earned)} taken at the till` };
      const cash = shop?.cash ?? 0;
      return { playerId: p.id, score: cash, label: `${cashText(cash)} in the till` };
    });
    const teams = teamRows(s, ctx, c);
    const shops = s.street.map((id) => s.shops[id]!);
    const best = Math.max(0, ...shops.map((x) => x.cash));
    const leaders = shops.filter((x) => x.cash === best);
    const served = shops.reduce((n, x) => n + x.served, 0);
    let summary: string;
    if (best <= 0) summary = 'No shop took any cash this time.';
    else if (leaders.length === 1) summary = `${shopName(leaders[0]!, ctx)} made ${cashText(best)} and served ${leaders[0]!.served} customers.`;
    else summary = `${listNames(leaders.map((x) => shopName(x, ctx)))} tied on ${cashText(best)}.`;
    if (served > 0 && shops.length > 1) summary += ` The high street served ${served} customers in all.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.cash, label: coop ? `${cashText(t.cash)} in the till` : `${cashText(t.cash)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    switch (botMove(view, ctx.now)) {
      case 'pick': {
        const values = botDeliveryValues(you);
        return { type: 'pickDelivery', offer: you.offer.seq, index: Math.max(0, values.indexOf(Math.max(...values))) };
      }
      case 'serve':
        return { type: 'serve', customer: botServeChoice(you, ctx.now)! };
      case 'buy':
        return botPurchase(view, ctx.now);
      case 'answer':
        return { type: 'answer', iid: you.question.iid, answer: ctx.answer(you.question.iid) };
      default:
        return null;
    }
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (!you) return 2000;
    const now = you.asOf;
    // Picking a delivery is a quick tap.
    if (you.offer) return 700 + rng.int(0, 1300);
    // A queue that needs the till: wait for it to be ready, then a moment to react.
    const ready = Math.max(now, you.till.readyAt);
    if (botServeChoice(you, ready) !== null && botPressure(you, ready) !== 'calm') return ready - now + 600 + rng.int(0, 1200);
    if (botPurchase(view, now)) return 800 + rng.int(0, 800);
    // Answering takes 2.2 to 6.7 seconds from when the question appeared, serving included.
    const age = you.question ? now - you.question.shownAt : 0;
    return Math.max(400, 2200 + rng.int(0, 4500) - age);
  },
});
