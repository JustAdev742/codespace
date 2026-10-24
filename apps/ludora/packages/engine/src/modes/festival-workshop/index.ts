/*
 * Festival Workshop: a workshop for the lantern festival, run on right answers
 * and one market the whole class shares.
 *
 * Money accrues continuously. Each workshop keeps its coins, its takings, its
 * income per second and the game time they were last brought up to date
 * (`since`). Anything that changes the income first settles the money up to
 * that moment; there is no per-second tick. Boosts and pranks that run out are
 * settled at the exact moment they end, and a timer wakes the workshop then so
 * the screens hear about it.
 *
 * The market shifts on a fixed beat. Each goods' price follows the share of
 * the class's goods it makes up (what is made, measured at even prices, not
 * what it earned), so the goods everyone makes go cheap and the goods nobody
 * makes pay well.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { listNames, nameOf } from '../rules.ts';
import {
  EVENT_ORDER,
  EVENT_TIMING,
  EVENTS,
  FAVOUR_EVERY,
  FAVOUR_OFFER_MS,
  FAVOUR_ORDER,
  FAVOURS,
  FINALE,
  GOODS,
  GOODS_INFO,
  HELPER_FIRST,
  HELPER_PER_LEVEL,
  LEVEL_INCOME,
  LUCKY_SPARK_CHANCE,
  MAKER,
  MARKET,
  MAX_LEVEL,
  OVERTIME,
  PARADE,
  PAYDAY,
  PRANK_MS,
  QUARTER_OFF,
  RUSH_HOUR_PAYDAY,
  SECOND_LOCK_COINS,
  STATION_ORDER,
  STATIONS,
  TEA_BREAK_HELPERS,
  TIP_JAR,
  UPGRADE_COST_GROWTH,
  meta,
  settings,
  type EventKind,
  type FavourKind,
  type Goods,
  type StationKind,
} from './meta.ts';

type Settings = {
  slots: string;
  shiftSeconds: string;
  marketRange: string;
  events: boolean;
  rushOrders: boolean;
  favours: boolean;
  pranks: boolean;
  finaleSeconds: string;
  finaleDemand: string;
  startingCoins: string;
  prices: string;
  goal: number;
};
type Ctx = ModeContext<Settings>;
export type PerGoods = Record<Goods, number>;

interface Station {
  kind: StationKind;
  level: number;
  /** Game time a prank stops tangling this station, or null while it works. */
  stoppedUntil: number | null;
  stoppedBy: PlayerId | null;
}

interface Offer {
  cards: FavourKind[];
  /** The cards could have been any of these: the deck the odds are shown for. */
  deck: FavourKind[];
  until: number;
  /** The player picked Prank and is choosing who to prank. */
  prank: boolean;
}

interface FavourNote {
  kind: FavourKind;
  at: number;
  amount: number;
  target: PlayerId | null;
  station: StationKind | null;
  blocked: boolean;
  /** A lock taken while already holding one, or a prank with nobody to prank, turned into coins. */
  swapped: boolean;
  auto: boolean;
}

interface PrankNote {
  by: PlayerId;
  station: StationKind;
  slot: number;
  until: number;
  blocked: boolean;
  at: number;
}

interface Workshop {
  stream: StreamState;
  slots: (Station | null)[];
  coins: number;
  takings: number;
  /** Income per second since `since`, and the part of it from each kind of goods. */
  rate: number;
  byGoods: PerGoods;
  since: number;
  fromPaydays: number;
  fromStations: number;
  fromOrders: number;
  fromFavours: number;
  overtimeUntil: number | null;
  paradeUntil: number | null;
  lock: boolean;
  offer: Offer | null;
  lastTarget: PlayerId | null;
  payday: { amount: number; at: number; notes: string[] } | null;
  favour: FavourNote | null;
  pranked: PrankNote | null;
  /** Income from the parade's goods during the current parade order. */
  contribution: number;
  bonus: { amount: number; at: number; place: number } | null;
  /** Left the game: the workshop is frozen until they come back. */
  away: boolean;
  wakeAt: number | null;
  built: number;
  labs: number;
}

interface FestivalEvent {
  kind: EventKind;
  startedAt: number;
  endsAt: number;
  goods: Goods | null;
  target: number;
  seq: number;
}

interface ParadeResult {
  goods: Goods;
  target: number;
  total: number;
  reached: boolean;
  top: { playerId: PlayerId; amount: number; bonus: number }[];
  boosted: number;
  at: number;
}

type NewsKind = 'prank' | 'blocked' | 'lab' | 'max' | 'spark' | 'streak' | 'parade' | 'finale';

interface News {
  seq: number;
  at: number;
  kind: NewsKind;
  who: PlayerId | null;
  other: PlayerId | null;
  station: StationKind | null;
  level: number;
  goods: Goods | null;
}

interface State {
  workshops: Record<PlayerId, Workshop>;
  endsAt: number;
  finaleAt: number | null;
  finale: boolean;
  market: { demand: PerGoods; prev: PerGoods; shiftAt: number | null; shifts: number; lastShiftAt: number | null };
  swingUntil: number | null;
  event: FestivalEvent | null;
  nextEventAt: number | null;
  lastEvent: EventKind | null;
  events: number;
  parade: ParadeResult | null;
  /** Stations the class has built, by kind, replacements included. */
  built: Record<StationKind, number>;
  news: News[];
  newsSeq: number;
  winner: PlayerId | null;
}

const stationKind = z.enum(['folder', 'loom', 'press', 'lab', 'helpers']);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('build'), slot: z.number().int().min(0).max(15), station: stationKind }),
  z.object({ type: z.literal('upgrade'), slot: z.number().int().min(0).max(15) }),
  z.object({ type: z.literal('favour'), card: z.enum(['overtime', 'tipJar', 'prank', 'lock']), target: z.string().min(1).max(40).optional() }),
]);
type Action = z.infer<typeof action>;

/** Used when the host sets no time limit: the finale and the market need an end. */
const DEFAULT_TIME_MS = meta.common.defaults.timeLimitSec! * 1000;
const NEWS_KEEP = 8;
/** A streak this long earns the biggest payday bonus, which the room hears about. */
const STREAK_NEWS = Math.round(PAYDAY.streakMax / PAYDAY.streakStep) + 1;
/** Bots wait for something better only when they can afford it within this many seconds of income. */
const BOT_SAVE_SECONDS = 20;

/* --------------------------------- numbers -------------------------------- */

interface Config {
  slots: number;
  shiftMs: number;
  wide: boolean;
  events: boolean;
  rush: boolean;
  favours: boolean;
  pranks: boolean;
  finaleMs: number;
  finaleDemand: number;
  startingCoins: number;
  price: number;
  goal: number;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function config(ctx: Ctx): Config {
  const st = ctx.settings;
  return {
    slots: Math.max(1, Math.round(num(st.slots, 6))),
    shiftMs: Math.max(10, num(st.shiftSeconds, 60)) * 1000,
    wide: st.marketRange === 'wide',
    events: st.events !== false,
    rush: st.events !== false && st.rushOrders === true,
    favours: st.favours !== false,
    pranks: st.pranks !== false,
    finaleMs: Math.max(0, num(st.finaleSeconds, 45)) * 1000,
    finaleDemand: num(st.finaleDemand, 2),
    startingCoins: Math.max(0, num(st.startingCoins, 50)),
    price: st.prices === 'quarterOff' ? QUARTER_OFF : 1,
    goal: Math.max(0, num(st.goal, 0)),
  };
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const perGoods = (v = 0): PerGoods => ({ lanterns: v, kites: v, candles: v, fireworks: v });
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

/** What it costs to build a station. */
export function buildCost(kind: StationKind, price = 1): number {
  return round5(STATIONS[kind].cost * price);
}

/** What it costs to upgrade a station from `level` to the next. */
export function upgradeCost(kind: StationKind, level: number, price = 1): number {
  return round5(STATIONS[kind].cost * price * UPGRADE_COST_GROWTH ** level);
}

/** How much Glim Helpers at `level` add to every other station. */
export function helperBonus(level: number): number {
  return HELPER_FIRST + HELPER_PER_LEVEL * (level - 1);
}

/** A goods' price at a market shift, before the random nudge is added when `nudge` is 0. */
export function marketPrice(share: number, range: 'normal' | 'wide', nudge = 0): number {
  const r = MARKET[range];
  const base = clamp(1 + r.slope * (0.25 - share), r.min, r.max);
  return round1(clamp(base + nudge, r.min, r.max));
}

const working = (st: Station, at: number) => st.stoppedUntil === null || st.stoppedUntil <= at;
const eventOn = (s: State, kind: EventKind, at: number) => s.event !== null && s.event.kind === kind && at >= s.event.startedAt && at < s.event.endsAt;

function priceOf(s: State, goods: Goods, c: Config): number {
  return s.finale && goods === 'fireworks' ? c.finaleDemand : s.market.demand[goods];
}

/**
 * A workshop's income per second at game time `at`, in total and by goods, for
 * a given set of stations. `even` measures what is made at even prices (×1),
 * which is what the market reads.
 */
function ratesFor(slots: readonly (Station | null)[], w: Workshop, s: State, at: number, c: Config, even = false): { total: number; byGoods: PerGoods } {
  let help = 0;
  for (const st of slots) if (st && st.kind === 'helpers' && working(st, at)) help += helperBonus(st.level);
  if (eventOn(s, 'tea', at)) help *= TEA_BREAK_HELPERS;
  const boost = (w.overtimeUntil !== null && w.overtimeUntil > at ? OVERTIME.mult : 1) * (w.paradeUntil !== null && w.paradeUntil > at ? PARADE.boost : 1);
  const byGoods = perGoods();
  let total = 0;
  for (const st of slots) {
    if (!st || !working(st, at)) continue;
    const goods = STATIONS[st.kind].goods;
    if (!goods) continue;
    const income = STATIONS[st.kind].income * LEVEL_INCOME ** (st.level - 1) * (even ? 1 : priceOf(s, goods, c)) * (1 + help) * boost;
    byGoods[goods] += income;
    total += income;
  }
  return { total, byGoods };
}

/* ------------------------------ settling money ----------------------------- */

function recompute(w: Workshop, s: State, at: number, c: Config) {
  const r = ratesFor(w.slots, w, s, at, c);
  w.rate = r.total;
  w.byGoods = r.byGoods;
}

/** The next moment a boost or a prank on this workshop runs out, after `after`. */
function nextExpiry(w: Workshop, after: number): number | null {
  let e: number | null = null;
  const consider = (t: number | null) => {
    if (t !== null && t > after && (e === null || t < e)) e = t;
  };
  consider(w.overtimeUntil);
  consider(w.paradeUntil);
  for (const st of w.slots) if (st) consider(st.stoppedUntil);
  return e;
}

function accrue(w: Workshop, s: State, at: number) {
  if (at <= w.since) return;
  const gain = (w.rate * (at - w.since)) / 1000;
  w.coins += gain;
  w.takings += gain;
  w.fromStations += gain;
  const ev = s.event;
  if (ev && ev.kind === 'parade' && ev.goods) {
    const from = Math.max(w.since, ev.startedAt);
    const until = Math.min(at, ev.endsAt);
    if (until > from) w.contribution += (w.byGoods[ev.goods] * (until - from)) / 1000;
  }
  w.since = at;
}

function clearExpired(w: Workshop, at: number) {
  if (w.overtimeUntil !== null && w.overtimeUntil <= at) w.overtimeUntil = null;
  if (w.paradeUntil !== null && w.paradeUntil <= at) w.paradeUntil = null;
  for (const st of w.slots) {
    if (st && st.stoppedUntil !== null && st.stoppedUntil <= at) {
      st.stoppedUntil = null;
      st.stoppedBy = null;
    }
  }
}

/** Brings a workshop's money up to game time `to`, ending boosts and pranks at the exact moment they run out. */
function advance(w: Workshop, s: State, to: number, c: Config) {
  if (w.away) return;
  for (let guard = 0; guard < 32; guard++) {
    const e = nextExpiry(w, w.since);
    if (e === null || e > to) break;
    accrue(w, s, e);
    clearExpired(w, e);
    recompute(w, s, e, c);
  }
  accrue(w, s, to);
}

/** The same, without changing anything: what a workshop holds at `to`. For views and results. */
function projected(w: Workshop, s: State, to: number, c: Config): { coins: number; takings: number; rate: number; contribution: number } {
  if (w.away || to <= w.since) return { coins: w.coins, takings: w.takings, rate: w.away ? 0 : w.rate, contribution: w.contribution };
  const e = nextExpiry(w, w.since);
  if (e === null || e > to) {
    const gain = (w.rate * (to - w.since)) / 1000;
    let contribution = w.contribution;
    const ev = s.event;
    if (ev && ev.kind === 'parade' && ev.goods) {
      const from = Math.max(w.since, ev.startedAt);
      const until = Math.min(to, ev.endsAt);
      if (until > from) contribution += (w.byGoods[ev.goods] * (until - from)) / 1000;
    }
    return { coins: w.coins + gain, takings: w.takings + gain, rate: w.rate, contribution };
  }
  const copy: Workshop = { ...w, slots: w.slots.map((st) => (st ? { ...st } : null)), byGoods: { ...w.byGoods } };
  advance(copy, s, to, c);
  return { coins: copy.coins, takings: copy.takings, rate: copy.rate, contribution: copy.contribution };
}

/** Settles every workshop to `at`, so a change that touches everyone starts from the right moment. */
function settleAll(s: State, at: number, c: Config) {
  for (const w of Object.values(s.workshops)) advance(w, s, at, c);
}

function recomputeAll(s: State, at: number, c: Config) {
  for (const w of Object.values(s.workshops)) if (!w.away) recompute(w, s, at, c);
}

/** Keeps one timer per workshop at the moment its next boost or prank runs out. */
function syncWakes(s: State, ctx: Ctx) {
  for (const [id, w] of Object.entries(s.workshops)) {
    const at = w.away ? null : nextExpiry(w, w.since);
    if (at === w.wakeAt) continue;
    w.wakeAt = at;
    if (at === null) ctx.clearTimer(`wake:${id}`);
    else ctx.setTimer(`wake:${id}`, at);
  }
}

/* -------------------------------- workshops -------------------------------- */

function newWorkshop(ctx: Ctx, c: Config, now: number, coins = c.startingCoins): Workshop {
  return {
    stream: streamInit(ctx),
    slots: Array.from({ length: c.slots }, () => null),
    coins,
    takings: 0,
    rate: 0,
    byGoods: perGoods(),
    since: now,
    fromPaydays: 0,
    fromStations: 0,
    fromOrders: 0,
    fromFavours: 0,
    overtimeUntil: null,
    paradeUntil: null,
    lock: false,
    offer: null,
    lastTarget: null,
    payday: null,
    favour: null,
    pranked: null,
    contribution: 0,
    bonus: null,
    away: false,
    wakeAt: null,
    built: 0,
    labs: 0,
  };
}

function addNews(s: State, item: Omit<News, 'seq'>) {
  s.newsSeq++;
  s.news = [{ ...item, seq: s.newsSeq }, ...s.news].slice(0, NEWS_KEEP);
}

function present(s: State, ctx: Ctx): [PlayerId, Workshop][] {
  const out: [PlayerId, Workshop][] = [];
  for (const p of ctx.players()) {
    const w = s.workshops[p.id];
    if (w && !w.away) out.push([p.id, w]);
  }
  return out;
}

interface Row {
  playerId: PlayerId;
  name: string;
  teamId: string | null;
  takings: number;
  coins: number;
  rate: number;
  rank: number;
}

/** Everyone still in the game, biggest takings first; equal takings share a rank. */
function ranking(s: State, ctx: Ctx, at: number, c: Config): Row[] {
  const rows: Row[] = [];
  for (const p of ctx.players()) {
    const w = s.workshops[p.id];
    if (!w) continue;
    const pr = projected(w, s, at, c);
    rows.push({ playerId: p.id, name: p.name, teamId: p.teamId, takings: Math.floor(pr.takings), coins: Math.floor(pr.coins), rate: pr.rate, rank: 0 });
  }
  rows.sort((a, b) => b.takings - a.takings || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.takings === r.takings ? rows[i - 1]!.rank : i + 1));
  return rows;
}

/** The station whose stopping would cost a workshop the most income now (ties: the higher level, then the first slot). */
function bestStation(w: Workshop, s: State, at: number, c: Config): number | null {
  const now = ratesFor(w.slots, w, s, at, c).total;
  let best: number | null = null;
  let bestLoss = -1;
  w.slots.forEach((st, i) => {
    if (!st || !working(st, at)) return;
    const without = w.slots.map((x, j) => (j === i ? null : x));
    const loss = now - ratesFor(without, w, s, at, c).total;
    const cur = best === null ? null : w.slots[best]!;
    if (loss > bestLoss + 1e-9 || (Math.abs(loss - bestLoss) <= 1e-9 && cur && st.level > cur.level)) {
      best = i;
      bestLoss = loss;
    }
  });
  return best;
}

/** Who a player can prank now: anyone else still in the game with a working station, but not the player they pranked last. Biggest takings first. */
function prankTargets(s: State, ctx: Ctx, pid: PlayerId, at: number, c: Config): Row[] {
  const me = s.workshops[pid];
  return ranking(s, ctx, at, c).filter((r) => {
    if (r.playerId === pid || r.playerId === me?.lastTarget) return false;
    const w = s.workshops[r.playerId];
    return Boolean(w && !w.away && w.slots.some((st) => st && working(st, at)));
  });
}

/* --------------------------------- market ---------------------------------- */

/** The share of everything the class makes (at even prices) that each kind of goods is. Even shares when nothing is made yet. */
function shares(s: State, ctx: Ctx, at: number, c: Config): PerGoods {
  const supply = perGoods();
  let total = 0;
  for (const [, w] of present(s, ctx)) {
    const r = ratesFor(w.slots, w, s, at, c, true);
    for (const g of GOODS) supply[g] += r.byGoods[g];
    total += r.total;
  }
  const out = perGoods(0.25);
  if (total > 0) for (const g of GOODS) out[g] = supply[g] / total;
  return out;
}

const wideAt = (s: State, at: number, c: Config) => c.wide || (s.swingUntil !== null && at < s.swingUntil);

/** New prices for every goods, read from what the class makes, with a seeded nudge each. */
function reprice(s: State, ctx: Ctx, at: number, c: Config, wide: boolean) {
  const range = wide ? 'wide' : 'normal';
  const nudges = MARKET[range].nudges;
  const sh = shares(s, ctx, at, c);
  const demand = perGoods();
  for (const g of GOODS) demand[g] = marketPrice(sh[g], range, nudges[ctx.rng.int(0, nudges.length - 1)]!);
  s.market.prev = s.market.demand;
  s.market.demand = demand;
  s.market.lastShiftAt = at;
}

function scheduleShift(s: State, ctx: Ctx, from: number, c: Config) {
  const at = from + c.shiftMs;
  if (at < s.endsAt) {
    s.market.shiftAt = at;
    ctx.setTimer('shift', at);
  } else {
    s.market.shiftAt = null;
    ctx.clearTimer('shift');
  }
}

function marketLine(s: State): string {
  const d = s.market.demand;
  const top = [...GOODS].sort((a, b) => d[b] - d[a])[0]!;
  const low = [...GOODS].sort((a, b) => d[a] - d[b])[0]!;
  if (d[top] === d[low]) return `The market shifted: everything sells at ×${d[top]}.`;
  return `The market shifted: ${GOODS_INFO[top].many} are in demand at ×${d[top]}, ${GOODS_INFO[low].many} sell at ×${d[low]}.`;
}

function shiftMarket(s: State, ctx: Ctx, c: Config) {
  const at = s.market.shiftAt ?? ctx.now();
  settleAll(s, at, c);
  reprice(s, ctx, at, c, wideAt(s, at, c));
  s.market.shifts++;
  recomputeAll(s, at, c);
  scheduleShift(s, ctx, at, c);
  ctx.feed(marketLine(s), { tone: 'info' });
}

/* --------------------------------- events ---------------------------------- */

/** Events only start if they can finish before the finale (or the end). */
function eventFits(at: number, s: State) {
  return at + EVENT_TIMING.lengthMs <= (s.finaleAt ?? s.endsAt);
}

function scheduleEvent(s: State, ctx: Ctx, at: number) {
  if (eventFits(at, s)) {
    s.nextEventAt = at;
    ctx.setTimer('event', at);
  } else {
    s.nextEventAt = null;
    ctx.clearTimer('event');
  }
}

/** Equal odds, never the same event twice in a row, and a tea break only when someone has Glim Helpers. */
export function eventChoices(last: EventKind | null, someoneHasHelpers: boolean): EventKind[] {
  return EVENT_ORDER.filter((k) => k !== last && (k !== 'tea' || someoneHasHelpers));
}

function pickEvent(s: State, ctx: Ctx, c: Config): EventKind {
  if (c.rush) return 'parade';
  const helpers = present(s, ctx).some(([, w]) => w.slots.some((st) => st?.kind === 'helpers'));
  const pool = eventChoices(s.lastEvent, helpers);
  const total = pool.reduce((n, k) => n + EVENTS[k].weight, 0);
  let roll = ctx.rng.next() * total;
  for (const k of pool) {
    roll -= EVENTS[k].weight;
    if (roll < 0) return k;
  }
  return pool[pool.length - 1]!;
}

/** What a parade order can ask for: the goods someone in the class makes, or any goods while nobody makes anything. */
export function paradeChoices(made: readonly Goods[]): Goods[] {
  return made.length ? [...made] : [...GOODS];
}

/** The class target for a parade order: so many seconds of one level-1 station of that goods for every player. */
export function paradeTarget(goods: Goods, players: number): number {
  return PARADE.targetSeconds * Math.max(1, players) * STATIONS[MAKER[goods]].income;
}

function startEvent(s: State, ctx: Ctx, c: Config) {
  const at = s.nextEventAt ?? ctx.now();
  settleAll(s, at, c);
  const kind = pickEvent(s, ctx, c);
  s.events++;
  const ev: FestivalEvent = { kind, startedAt: at, endsAt: at + EVENT_TIMING.lengthMs, goods: null, target: 0, seq: s.events };
  if (kind === 'parade') {
    // The parade asks for goods someone in the class already makes, each equally likely, so the bar can move.
    const made = GOODS.filter((g) => present(s, ctx).some(([, w]) => w.slots.some((st) => st !== null && STATIONS[st.kind].goods === g)));
    const goods = ctx.rng.pick(paradeChoices(made));
    ev.goods = goods;
    ev.target = paradeTarget(goods, present(s, ctx).length);
    for (const w of Object.values(s.workshops)) w.contribution = 0;
    ctx.feed(`Parade order: the parade needs ${GOODS_INFO[goods].many}. Make ${fmt(ev.target)} coins' worth together in 30 seconds.`, { tone: 'big' });
  } else if (kind === 'swing') {
    s.swingUntil = ev.endsAt;
    s.event = ev;
    reprice(s, ctx, at, c, true);
    ctx.feed(`Market swing: prices jump between ×${MARKET.wide.min} and ×${MARKET.wide.max} for 30 seconds.`, { tone: 'big' });
  } else if (kind === 'rush') ctx.feed('Rush hour: paydays are doubled for 30 seconds.', { tone: 'big' });
  else if (kind === 'sparks') ctx.feed('Lucky sparks: each right answer has a 1 in 4 chance to upgrade a station for free.', { tone: 'big' });
  else ctx.feed('Glim tea break: Glim Helpers count double for 30 seconds.', { tone: 'big' });
  s.event = ev;
  recomputeAll(s, at, c);
  ctx.setTimer('eventEnd', ev.endsAt);
  scheduleEvent(s, ctx, at + (c.rush ? EVENT_TIMING.rushEveryMs : EVENT_TIMING.everyMs));
}

function endEvent(s: State, ctx: Ctx, c: Config) {
  const ev = s.event;
  if (!ev) return;
  const at = ev.endsAt;
  settleAll(s, at, c);
  if (ev.kind === 'parade' && ev.goods) finishParade(s, ctx, ev, at, c);
  if (ev.kind === 'swing') s.swingUntil = null;
  s.lastEvent = ev.kind;
  s.event = null;
  recomputeAll(s, at, c);
}

function finishParade(s: State, ctx: Ctx, ev: FestivalEvent, at: number, c: Config) {
  const goods = ev.goods!;
  const makers = present(s, ctx)
    .filter(([, w]) => w.contribution > 0)
    .sort((a, b) => b[1].contribution - a[1].contribution || nameOf(ctx, a[0]).localeCompare(nameOf(ctx, b[0])));
  const total = makers.reduce((n, [, w]) => n + w.contribution, 0);
  const reached = total >= ev.target;
  const seconds = c.rush ? PARADE.rushBonusSeconds : PARADE.bonusSeconds;
  const top = makers.slice(0, PARADE.rewarded).map(([id, w], i) => {
    const bonus = Math.max(1, Math.round(w.rate * seconds));
    w.coins += bonus;
    w.takings += bonus;
    w.fromOrders += bonus;
    w.bonus = { amount: bonus, at, place: i + 1 };
    return { playerId: id, amount: Math.round(w.contribution), bonus };
  });
  if (reached) for (const [, w] of makers) w.paradeUntil = at + PARADE.boostMs;
  s.parade = { goods, target: ev.target, total: Math.round(total), reached, top, boosted: reached ? makers.length : 0, at };
  const many = GOODS_INFO[goods].many;
  if (reached) ctx.feed(`The parade got its ${many}. Everyone who made some earns ×${PARADE.boost} income for 30 seconds.`, { tone: 'good' });
  else ctx.feed(`The parade fell short this time: ${fmt(total)} of ${fmt(ev.target)} coins of ${many}.`, { tone: 'info' });
  if (top.length) {
    ctx.feed(`Top ${many} makers: ${listNames(top.map((t) => nameOf(ctx, t.playerId)))}. Each earns ${seconds} seconds of income.`, { tone: 'good' });
    addNews(s, { at, kind: 'parade', who: top[0]!.playerId, other: null, station: null, level: 0, goods });
  }
}

function startFinale(s: State, ctx: Ctx, c: Config) {
  const at = s.finaleAt ?? ctx.now();
  settleAll(s, at, c);
  s.finale = true;
  recomputeAll(s, at, c);
  ctx.feed(`Grand finale: fireworks sell at ×${c.finaleDemand} and paydays are 50% bigger.`, { tone: 'big' });
  addNews(s, { at, kind: 'finale', who: null, other: null, station: null, level: 0, goods: 'fireworks' });
}

/* -------------------------------- favours ---------------------------------- */

/** The favours a player can be offered now: no pranks or locks when nobody could be pranked. */
function favourDeck(s: State, ctx: Ctx, pid: PlayerId, at: number, c: Config): FavourKind[] {
  const others = ctx.players().some((p) => p.id !== pid && s.workshops[p.id]);
  const canPrank = c.pranks && prankTargets(s, ctx, pid, at, c).length > 0;
  return FAVOUR_ORDER.filter((k) => (k === 'prank' ? canPrank : k === 'lock' ? c.pranks && others : true));
}

/** Two different cards, drawn by weight. */
export function drawFavours(deck: readonly FavourKind[], next: () => number, count = 2): FavourKind[] {
  const left = [...deck];
  const out: FavourKind[] = [];
  while (out.length < count && left.length) {
    const total = left.reduce((n, k) => n + FAVOURS[k].weight, 0);
    let roll = next() * total;
    let i = 0;
    for (; i < left.length - 1; i++) {
      roll -= FAVOURS[left[i]!].weight;
      if (roll < 0) break;
    }
    out.push(left.splice(i, 1)[0]!);
  }
  return out;
}

function openOffer(s: State, ctx: Ctx, pid: PlayerId, w: Workshop, at: number, c: Config) {
  const deck = favourDeck(s, ctx, pid, at, c);
  w.offer = { cards: drawFavours(deck, () => ctx.rng.next()), deck, until: at + FAVOUR_OFFER_MS, prank: false };
  ctx.setTimer(`offer:${pid}`, w.offer.until);
}

function closeOffer(w: Workshop, pid: PlayerId, ctx: Ctx) {
  w.offer = null;
  ctx.clearTimer(`offer:${pid}`);
  if (!w.stream.iid) streamNext(w.stream, ctx);
}

function giveCoins(w: Workshop, amount: number) {
  w.coins += amount;
  w.takings += amount;
  w.fromFavours += amount;
}

function tipJar(w: Workshop, at: number, auto: boolean, swapped = false) {
  const amount = Math.max(TIP_JAR.min, Math.round(w.coins * TIP_JAR.share));
  giveCoins(w, amount);
  w.favour = { kind: 'tipJar', at, amount, target: null, station: null, blocked: false, swapped, auto };
}

function playPrank(s: State, ctx: Ctx, pid: PlayerId, targetId: PlayerId, at: number, c: Config, auto: boolean) {
  const w = s.workshops[pid]!;
  const t = s.workshops[targetId]!;
  advance(t, s, at, c);
  // A prank on the leader is news for the whole room; any other stays between the two players.
  const toAll = ranking(s, ctx, at, c).some((r) => r.playerId === targetId && r.rank === 1);
  const by = nameOf(ctx, pid);
  const them = nameOf(ctx, targetId);
  const slot = bestStation(t, s, at, c);
  w.lastTarget = targetId;
  if (slot === null) {
    tipJar(w, at, auto, true);
    return;
  }
  const kind = t.slots[slot]!.kind;
  const to = toAll ? undefined : [pid, targetId];
  if (t.lock) {
    t.lock = false;
    t.pranked = { by: pid, station: kind, slot, until: at, blocked: true, at };
    w.favour = { kind: 'prank', at, amount: 0, target: targetId, station: kind, blocked: true, swapped: false, auto };
    ctx.feed(`${them}'s lock stopped ${by}'s prank.`, { tone: 'info', ...(to ? { to } : {}) });
    addNews(s, { at, kind: 'blocked', who: targetId, other: pid, station: kind, level: 0, goods: null });
    return;
  }
  const st = t.slots[slot]!;
  st.stoppedUntil = at + PRANK_MS;
  st.stoppedBy = pid;
  recompute(t, s, at, c);
  t.pranked = { by: pid, station: kind, slot, until: st.stoppedUntil, blocked: false, at };
  w.favour = { kind: 'prank', at, amount: 0, target: targetId, station: kind, blocked: false, swapped: false, auto };
  ctx.feed(`${by}'s prank tangled ${them}'s ${STATIONS[kind].name} for ${PRANK_MS / 1000} seconds.`, { tone: 'bad', ...(to ? { to } : {}) });
  addNews(s, { at, kind: 'prank', who: pid, other: targetId, station: kind, level: 0, goods: null });
}

function takeFavour(s: State, ctx: Ctx, pid: PlayerId, card: FavourKind, target: PlayerId | null, at: number, c: Config, auto: boolean) {
  const w = s.workshops[pid]!;
  if (card === 'overtime') {
    w.overtimeUntil = Math.max(w.overtimeUntil ?? at, at) + OVERTIME.ms;
    recompute(w, s, at, c);
    w.favour = { kind: 'overtime', at, amount: 0, target: null, station: null, blocked: false, swapped: false, auto };
  } else if (card === 'tipJar') tipJar(w, at, auto);
  else if (card === 'lock') {
    if (w.lock) {
      giveCoins(w, SECOND_LOCK_COINS);
      w.favour = { kind: 'lock', at, amount: SECOND_LOCK_COINS, target: null, station: null, blocked: false, swapped: true, auto };
    } else {
      w.lock = true;
      w.favour = { kind: 'lock', at, amount: 0, target: null, station: null, blocked: false, swapped: false, auto };
    }
  } else if (target) playPrank(s, ctx, pid, target, at, c, auto);
  else tipJar(w, at, auto, true);
  closeOffer(w, pid, ctx);
}

/** The offer ran out: the first card is taken, and a prank goes to the player with the biggest takings. */
function autoFavour(s: State, ctx: Ctx, pid: PlayerId, c: Config) {
  const w = s.workshops[pid];
  if (!w?.offer) return;
  const at = w.offer.until;
  advance(w, s, at, c);
  const card = w.offer.prank ? 'prank' : w.offer.cards[0]!;
  const target = card === 'prank' ? (prankTargets(s, ctx, pid, at, c)[0]?.playerId ?? null) : null;
  takeFavour(s, ctx, pid, card, target, at, c, true);
}

/* --------------------------------- paydays --------------------------------- */

export function paydayFor(rate: number, streak: number, mods: { rush?: boolean; finale?: boolean } = {}): { amount: number; notes: string[] } {
  const bonus = Math.min(PAYDAY.streakMax, PAYDAY.streakStep * Math.max(0, streak - 1));
  const notes: string[] = [];
  let mult = 1 + bonus;
  if (bonus > 0) notes.push(`streak +${Math.round(bonus * 100)}%`);
  if (mods.rush) {
    mult *= RUSH_HOUR_PAYDAY;
    notes.push(`rush hour ×${RUSH_HOUR_PAYDAY}`);
  }
  if (mods.finale) {
    mult *= FINALE.payday;
    notes.push(`finale +${Math.round((FINALE.payday - 1) * 100)}%`);
  }
  return { amount: Math.round(Math.max(PAYDAY.min, PAYDAY.seconds * rate) * mult), notes };
}

/* ---------------------------------- goal ----------------------------------- */

function checkGoal(s: State, ctx: Ctx, c: Config) {
  if (!c.goal || s.winner) return;
  const now = ctx.now();
  let winner: { id: PlayerId; takings: number } | null = null;
  let soonest: number | null = null;
  for (const [id, w] of present(s, ctx)) {
    const pr = projected(w, s, now, c);
    if (pr.takings >= c.goal - 1e-6) {
      if (!winner || pr.takings > winner.takings) winner = { id, takings: pr.takings };
    } else if (pr.rate > 0) {
      const at = now + ((c.goal - pr.takings) / pr.rate) * 1000;
      if (soonest === null || at < soonest) soonest = at;
    }
  }
  if (winner) {
    s.winner = winner.id;
    settleAll(s, now, c);
    ctx.feed(`${nameOf(ctx, winner.id)}'s workshop reached ${fmt(c.goal)} coins.`, { tone: 'big' });
    ctx.endGame();
    return;
  }
  if (soonest !== null && soonest < s.endsAt) ctx.setTimer('goal', Math.max(now + 1, Math.ceil(soonest)));
  else ctx.clearTimer('goal');
}

/** After every change: wake timers for boosts and pranks, and the goal. */
function afterChange(s: State, ctx: Ctx, c: Config) {
  syncWakes(s, ctx);
  checkGoal(s, ctx, c);
}

/* ---------------------------------- views ---------------------------------- */

function stationView(w: Workshop, i: number, s: State, ctx: Ctx, at: number, c: Config, full: boolean, base: number) {
  const st = w.slots[i];
  if (!st) return null;
  const alone = ratesFor(
    w.slots.map((x, j) => (j === i ? null : x)),
    w,
    s,
    at,
    c,
  ).total;
  const upgrade =
    st.level < MAX_LEVEL
      ? {
          cost: upgradeCost(st.kind, st.level, c.price),
          gain: ratesFor(
            w.slots.map((x, j) => (j === i ? { ...x!, level: x!.level + 1 } : x)),
            w,
            s,
            at,
            c,
          ).total - base,
        }
      : null;
  let replace: Partial<Record<StationKind, number>> | null = null;
  if (full) {
    replace = {};
    for (const k of STATION_ORDER) {
      if (k === st.kind) continue;
      replace[k] = round1(ratesFor(w.slots.map((x, j) => (j === i ? { kind: k, level: 1, stoppedUntil: null, stoppedBy: null } : x)), w, s, at, c).total - base);
    }
  }
  const stopped = !working(st, at);
  return {
    kind: st.kind,
    level: st.level,
    /** What this station adds to the workshop now (for Glim Helpers: the boost they give). */
    income: round1(base - alone),
    stoppedUntil: stopped ? st.stoppedUntil : null,
    stoppedBy: stopped && st.stoppedBy ? nameOf(ctx, st.stoppedBy) : null,
    upgrade: upgrade ? { cost: upgrade.cost, gain: round1(upgrade.gain) } : null,
    replace,
  };
}

/** How many of each station stand in these players' workshops. */
function standingStations(s: State, ids: readonly PlayerId[]): Record<StationKind, number> {
  const out: Record<StationKind, number> = { folder: 0, loom: 0, press: 0, lab: 0, helpers: 0 };
  for (const id of ids) for (const st of s.workshops[id]?.slots ?? []) if (st) out[st.kind]++;
  return out;
}

function teamRows(s: State, ctx: Ctx, at: number, c: Config) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.workshops[p.id]);
    const total = members.reduce((n, p) => n + projected(s.workshops[p.id]!, s, at, c).takings, 0);
    const average = members.length ? Math.floor(total / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, average };
  });
}

function newsView(s: State, ctx: Ctx, limit: number) {
  return s.news.slice(0, limit).map((n) => ({
    seq: n.seq,
    at: n.at,
    kind: n.kind,
    who: n.who ? nameOf(ctx, n.who) : null,
    other: n.other ? nameOf(ctx, n.other) : null,
    station: n.station,
    level: n.level,
    goods: n.goods,
  }));
}

type Heading = 'up' | 'down' | 'steady';

/** The class's shares of goods now, and where each price is heading at the next shift if the class keeps making what it makes now. */
function heading(s: State, ctx: Ctx, at: number, c: Config): { shares: PerGoods; dir: Record<Goods, Heading> } {
  const sh = shares(s, ctx, at, c);
  const range = s.market.shiftAt !== null && wideAt(s, s.market.shiftAt, c) ? 'wide' : 'normal';
  const dir: Record<Goods, Heading> = { lanterns: 'steady', kites: 'steady', candles: 'steady', fireworks: 'steady' };
  for (const g of GOODS) {
    const next = marketPrice(sh[g], range);
    dir[g] = next > s.market.demand[g] ? 'up' : next < s.market.demand[g] ? 'down' : 'steady';
  }
  // The finale fixes the firework price, whatever the market says.
  if (s.finale) dir.fireworks = 'steady';
  return { shares: sh, dir };
}

/* ---------------------------------- bots ----------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
interface BotOption {
  action: Action;
  cost: number;
  gain: number;
}

/** The purchase a bot wants next: the best income gain per coin among what it can afford within 20 seconds of income. */
export function botPurchase(view: any, now: number): BotOption | null {
  const you = view?.you;
  if (!you) return null;
  const coins = you.coins + (you.rate * Math.max(0, now - you.asOf)) / 1000;
  const options: BotOption[] = [];
  const free = (you.stations as unknown[]).findIndex((st) => st === null);
  if (free >= 0) for (const o of you.shop as { kind: StationKind; cost: number; gain: number }[]) options.push({ action: { type: 'build', slot: free, station: o.kind }, cost: o.cost, gain: o.gain });
  (you.stations as any[]).forEach((st, i) => {
    if (!st) return;
    if (st.upgrade) options.push({ action: { type: 'upgrade', slot: i }, cost: st.upgrade.cost, gain: st.upgrade.gain });
    if (st.replace) {
      for (const [kind, gain] of Object.entries(st.replace as Record<StationKind, number>)) {
        // Replacing is only worth it for a clear step up, so bots do not swap stations back and forth.
        if (gain <= Math.max(1, st.income * 0.5)) continue;
        const cost = (you.shop as { kind: string; cost: number }[]).find((o) => o.kind === kind)?.cost ?? Infinity;
        options.push({ action: { type: 'build', slot: i, station: kind as StationKind }, cost, gain });
      }
    }
  });
  const reach = Math.max(coins, coins + BOT_SAVE_SECONDS * you.rate);
  const pool = options.filter((o) => o.gain > 0 && o.cost <= reach);
  if (!pool.length) return null;
  pool.sort((a, b) => b.gain / b.cost - a.gain / a.cost || b.gain - a.gain);
  return pool[0]!;
}

function botFavour(view: any): Action {
  const you = view.you;
  const cards: FavourKind[] = you.offer.cards;
  const targets: { playerId: string; lock: boolean }[] = you.offer.targets ?? [];
  const leader = view.board?.[0];
  if (cards.includes('prank') && targets.length && leader && you.takings < leader.takings * 0.7) {
    const target = targets.find((t) => t.playerId === leader.playerId) ?? targets[0]!;
    return { type: 'favour', card: 'prank', target: target.playerId };
  }
  if (cards.includes('lock') && you.rank === 1 && !you.lock) return { type: 'favour', card: 'lock' };
  for (const k of ['overtime', 'tipJar', 'lock'] as const) if (cards.includes(k)) return { type: 'favour', card: k };
  return { type: 'favour', card: 'prank', ...(targets[0] ? { target: targets[0].playerId } : {}) };
}

/* ---------------------------------- mode ----------------------------------- */

function name(ctx: Ctx, id: PlayerId) {
  return nameOf(ctx, id);
}

export const festivalWorkshop = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const c = config(ctx);
    const now = ctx.now();
    const endsAt = now + (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec * 1000 : DEFAULT_TIME_MS);
    const finaleAt = c.finaleMs > 0 && endsAt - c.finaleMs > now ? endsAt - c.finaleMs : null;
    const workshops: Record<PlayerId, Workshop> = {};
    for (const p of ctx.players()) workshops[p.id] = newWorkshop(ctx, c, now);
    const s: State = {
      workshops,
      endsAt,
      finaleAt,
      finale: false,
      market: { demand: perGoods(1), prev: perGoods(1), shiftAt: null, shifts: 0, lastShiftAt: null },
      swingUntil: null,
      event: null,
      nextEventAt: null,
      lastEvent: null,
      events: 0,
      parade: null,
      built: { folder: 0, loom: 0, press: 0, lab: 0, helpers: 0 },
      news: [],
      newsSeq: 0,
      winner: null,
    };
    ctx.setTimer('end', endsAt);
    if (finaleAt !== null) ctx.setTimer('finale', finaleAt);
    scheduleShift(s, ctx, now, c);
    if (c.events) scheduleEvent(s, ctx, now + EVENT_TIMING.firstAtMs);
    return s;
  },
  onPlayerJoin(s, p: EnginePlayer, ctx) {
    const c = config(ctx);
    const now = ctx.now();
    const w = s.workshops[p.id];
    if (w) {
      // Back after leaving: the workshop starts up again from now, with nothing earned while away.
      if (w.away) {
        w.away = false;
        w.since = now;
        clearExpired(w, now);
        recompute(w, s, now, c);
        if (w.offer) {
          w.offer.until = now + FAVOUR_OFFER_MS;
          ctx.setTimer(`offer:${p.id}`, w.offer.until);
        }
      }
    } else {
      // A late joiner gets the starting coins plus a welcome gift of 20 seconds of the class's average income, to spend (not takings).
      const room = present(s, ctx).filter(([id]) => id !== p.id);
      const average = room.length ? room.reduce((n, [, x]) => n + projected(x, s, now, c).rate, 0) / room.length : 0;
      s.workshops[p.id] = newWorkshop(ctx, c, now, c.startingCoins + Math.round(average * 20));
    }
    afterChange(s, ctx, c);
  },
  onPlayerLeave(s, p, ctx) {
    const c = config(ctx);
    const w = s.workshops[p.id];
    if (!w) return;
    advance(w, s, ctx.now(), c);
    w.away = true;
    w.rate = 0;
    w.byGoods = perGoods();
    ctx.clearTimer(`offer:${p.id}`);
    afterChange(s, ctx, c);
  },
  onAction(s, pid, a, ctx) {
    const w = s.workshops[pid];
    if (!w || w.away) return { error: 'You are not in this game.' };
    const c = config(ctx);
    const now = ctx.now();
    switch (a.type) {
      case 'answer': {
        if (w.offer) return { error: 'Pick a Festival Favour first.' };
        advance(w, s, now, c);
        const res = streamSubmit(w.stream, pid, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (!res.correct) {
          if (w.stream.last) w.stream.last.text = 'No payday';
          streamNext(w.stream, ctx);
          break;
        }
        const pay = paydayFor(w.rate, res.streak, { rush: eventOn(s, 'rush', now), finale: s.finale });
        w.coins += pay.amount;
        w.takings += pay.amount;
        w.fromPaydays += pay.amount;
        w.payday = { amount: pay.amount, at: now, notes: pay.notes };
        const parts = [`Payday: +${fmt(pay.amount)} coins${pay.notes.length ? ` (${pay.notes.join(', ')})` : ''}`];
        if (res.streak === STREAK_NEWS) addNews(s, { at: now, kind: 'streak', who: pid, other: null, station: null, level: res.streak, goods: null });
        if (eventOn(s, 'sparks', now)) {
          const eligible = w.slots.map((st, i) => (st && st.level < MAX_LEVEL ? i : -1)).filter((i) => i >= 0);
          if (eligible.length && ctx.rng.chance(LUCKY_SPARK_CHANCE)) {
            const st = w.slots[ctx.rng.pick(eligible)]!;
            st.level++;
            recompute(w, s, now, c);
            parts.push(`Lucky spark: your ${STATIONS[st.kind].name} went up to level ${st.level}`);
            addNews(s, { at: now, kind: 'spark', who: pid, other: null, station: st.kind, level: st.level, goods: null });
          }
        }
        if (c.favours && w.stream.correct % FAVOUR_EVERY === 0) {
          openOffer(s, ctx, pid, w, now, c);
          parts.push('Festival Favour: pick a card');
        } else streamNext(w.stream, ctx);
        if (w.stream.last) w.stream.last.text = parts.join('. ');
        break;
      }
      case 'build': {
        if (a.slot >= w.slots.length) return { error: 'Your workshop does not have that slot.' };
        const cur = w.slots[a.slot];
        const info = STATIONS[a.station];
        if (cur?.kind === a.station) return { error: `That slot already has ${info.name === 'Glim Helpers' ? '' : 'a '}${info.name}.` };
        if (cur && w.slots.some((st) => st === null)) return { error: 'Build in a free slot first. You can replace a station once every slot is full.' };
        const cost = buildCost(a.station, c.price);
        advance(w, s, now, c);
        if (w.coins < cost) return { error: `You need ${fmt(cost)} coins for ${a.station === 'helpers' ? '' : 'a '}${info.name}.` };
        w.coins -= cost;
        w.slots[a.slot] = { kind: a.station, level: 1, stoppedUntil: null, stoppedBy: null };
        w.built++;
        s.built[a.station]++;
        recompute(w, s, now, c);
        if (a.station === 'lab') {
          w.labs++;
          if (w.labs === 1) addNews(s, { at: now, kind: 'lab', who: pid, other: null, station: 'lab', level: 1, goods: 'fireworks' });
        }
        break;
      }
      case 'upgrade': {
        const st = w.slots[a.slot];
        if (!st) return { error: 'There is no station in that slot.' };
        if (st.level >= MAX_LEVEL) return { error: `Your ${STATIONS[st.kind].name} is already at level ${MAX_LEVEL}.` };
        const cost = upgradeCost(st.kind, st.level, c.price);
        advance(w, s, now, c);
        if (w.coins < cost) return { error: `You need ${fmt(cost)} coins for that upgrade.` };
        w.coins -= cost;
        st.level++;
        recompute(w, s, now, c);
        if (st.level === MAX_LEVEL) addNews(s, { at: now, kind: 'max', who: pid, other: null, station: st.kind, level: st.level, goods: null });
        break;
      }
      case 'favour': {
        const o = w.offer;
        if (!o) return { error: 'There is no Festival Favour to pick right now.' };
        if (!o.cards.includes(a.card)) return { error: 'That favour is not on offer.' };
        advance(w, s, now, c);
        if (a.card === 'prank') {
          if (!a.target) {
            o.prank = true;
            break;
          }
          if (!prankTargets(s, ctx, pid, now, c).some((r) => r.playerId === a.target)) return { error: 'That player cannot be pranked right now. Pick someone else.' };
        }
        takeFavour(s, ctx, pid, a.card, a.target ?? null, now, c, false);
        break;
      }
    }
    afterChange(s, ctx, c);
  },
  onTimer(s, id, ctx) {
    const c = config(ctx);
    if (id === 'end') {
      settleAll(s, s.endsAt, c);
      ctx.endGame();
      return;
    }
    if (id === 'shift') shiftMarket(s, ctx, c);
    else if (id === 'event') startEvent(s, ctx, c);
    else if (id === 'eventEnd') endEvent(s, ctx, c);
    else if (id === 'finale') startFinale(s, ctx, c);
    else if (id.startsWith('offer:')) autoFavour(s, ctx, id.slice(6), c);
    else if (id.startsWith('wake:')) {
      const w = s.workshops[id.slice(5)];
      if (w) {
        w.wakeAt = null;
        advance(w, s, ctx.now(), c);
      }
    }
    afterChange(s, ctx, c);
  },
  view(s, viewer, ctx) {
    const c = config(ctx);
    const now = ctx.now();
    const host = viewer.kind === 'host';
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, now, c);
    const mine = me ? rows.find((r) => r.playerId === me) : undefined;
    const top = rows.slice(0, host ? 10 : 3).map((r) => ({ ...r, rate: round1(r.rate), lock: Boolean(s.workshops[r.playerId]?.lock) }));
    const ev = s.event;
    let progress = 0;
    if (ev?.kind === 'parade') for (const [, w] of present(s, ctx)) progress += projected(w, s, now, c).contribution;
    const head = heading(s, ctx, now, c);
    const market = {
      demand: { ...s.market.demand, ...(s.finale ? { fireworks: c.finaleDemand } : {}) },
      prev: s.market.prev,
      shiftAt: s.market.shiftAt,
      lastShiftAt: s.market.lastShiftAt,
      shifts: s.market.shifts,
      wide: c.wide,
      swingUntil: s.swingUntil,
      heading: head.dir,
      /** Percent of everything the class makes. */
      shares: { lanterns: round1(head.shares.lanterns * 100), kites: round1(head.shares.kites * 100), candles: round1(head.shares.candles * 100), fireworks: round1(head.shares.fireworks * 100) },
    };
    const base = {
      endsAt: s.endsAt,
      ...(s.finaleAt !== null ? { finalStretch: s.finale } : {}),
      finale: { at: s.finaleAt, on: s.finale, demand: c.finaleDemand },
      slots: c.slots,
      price: c.price,
      goal: c.goal,
      favours: c.favours,
      pranks: c.pranks,
      market,
      event: ev ? { kind: ev.kind, startedAt: ev.startedAt, endsAt: ev.endsAt, goods: ev.goods, target: ev.target, progress: Math.floor(progress), seq: ev.seq } : null,
      nextEventAt: s.nextEventAt,
      rush: c.rush,
      parade: s.parade
        ? { ...s.parade, top: s.parade.top.map((t) => ({ name: name(ctx, t.playerId), amount: t.amount, bonus: t.bonus, isYou: t.playerId === me })) }
        : null,
      board: top,
      players: rows.length,
      teams: teamRows(s, ctx, now, c),
      standing: host ? standingStations(s, rows.map((r) => r.playerId)) : null,
      news: host ? newsView(s, ctx, 6) : [],
      winner: s.winner ? name(ctx, s.winner) : null,
    };
    const w = me ? s.workshops[me] : undefined;
    if (!w || !me) return { ...base, you: null };
    const pr = projected(w, s, now, c);
    // Everything below is worked out from a copy brought up to now, so a boost that just ran out is not counted.
    const live: Workshop = { ...w, slots: w.slots.map((st) => (st ? { ...st } : null)), byGoods: { ...w.byGoods } };
    advance(live, s, now, c);
    const full = live.slots.every((st) => st !== null);
    const rate = ratesFor(live.slots, live, s, now, c).total;
    const shop = STATION_ORDER.map((kind) => {
      const free = live.slots.findIndex((st) => st === null);
      const gain = free >= 0 ? ratesFor(live.slots.map((x, j) => (j === free ? { kind, level: 1, stoppedUntil: null, stoppedBy: null } : x)), live, s, now, c).total - rate : 0;
      return { kind, cost: buildCost(kind, c.price), gain: round1(gain) };
    });
    const offer = live.offer
      ? {
          cards: live.offer.cards,
          deck: live.offer.deck,
          until: live.offer.until,
          prank: live.offer.prank,
          targets: live.offer.cards.includes('prank')
            ? // The 40 biggest takings: enough for any class, and the view stays small with 200 players.
              prankTargets(s, ctx, me, now, c)
                .slice(0, 40)
                .map((r) => {
                  const t = s.workshops[r.playerId]!;
                  const slot = bestStation(t, s, now, c);
                  const st = slot === null ? null : t.slots[slot]!;
                  return { playerId: r.playerId, name: r.name, coins: r.coins, rank: r.rank, lock: t.lock, best: st ? { kind: st.kind, level: st.level } : null };
                })
            : [],
        }
      : null;
    return {
      ...base,
      you: {
        coins: pr.coins,
        takings: pr.takings,
        rate: pr.rate,
        asOf: now,
        rank: mine?.rank ?? null,
        stations: live.slots.map((_, i) => stationView(live, i, s, ctx, now, c, full, rate)),
        shop,
        full,
        lock: live.lock,
        overtimeUntil: live.overtimeUntil,
        paradeUntil: live.paradeUntil,
        streak: live.stream.streak,
        toFavour: FAVOUR_EVERY - (live.stream.correct % FAVOUR_EVERY),
        contribution: ev?.kind === 'parade' ? Math.floor(pr.contribution) : 0,
        question: live.offer ? null : streamQuestionView(live.stream, ctx),
        last: live.stream.last,
        payday: live.payday,
        offer,
        favour: live.favour ? { ...live.favour, target: live.favour.target ? name(ctx, live.favour.target) : null } : null,
        pranked: live.pranked ? { ...live.pranked, by: name(ctx, live.pranked.by) } : null,
        bonus: live.bonus,
        from: { paydays: Math.floor(live.fromPaydays), stations: Math.floor(pr.takings - live.fromPaydays - live.fromOrders - live.fromFavours), orders: Math.floor(live.fromOrders), favours: Math.floor(live.fromFavours) },
      },
    };
  },
  results(s, ctx) {
    const c = config(ctx);
    const now = Math.min(ctx.now(), s.endsAt);
    const takings = (id: PlayerId) => {
      const w = s.workshops[id];
      return w ? Math.floor(projected(w, s, now, c).takings) : 0;
    };
    const standings = ctx.everyone().map((p) => {
      const score = takings(p.id);
      return { playerId: p.id, score, label: `${fmt(score)} coins taken` };
    });
    const teams = teamRows(s, ctx, now, c);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leaders = standings.filter((r) => r.score === best).map((r) => name(ctx, r.playerId));
    // Cheap starter stations are built and then replaced, so the class's favourite is what stands in the workshops at the end.
    const standing = standingStations(s, ctx.everyone().map((p) => p.id));
    const favourite = [...STATION_ORDER].sort((a, b) => standing[b] - standing[a])[0]!;
    const builtLine = standing[favourite] > 0 ? ` The class built ${STATIONS[favourite].many} most.` : '';
    let summary: string;
    if (s.winner) summary = `${name(ctx, s.winner)}'s workshop reached ${fmt(c.goal)} coins first.${builtLine}`;
    else if (best <= 0) summary = 'No workshop took any coins this time.';
    else if (leaders.length === 1) summary = `${leaders[0]}'s workshop took ${fmt(best)} coins.${builtLine}`;
    else summary = `${listNames(leaders)} tied with ${fmt(best)} coins each.${builtLine}`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.average, label: `${fmt(t.average)} coins taken on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    if (you.offer) return botFavour(view);
    const buy = botPurchase(view, ctx.now);
    if (buy) {
      const coins = you.coins + (you.rate * Math.max(0, ctx.now - you.asOf)) / 1000;
      if (buy.cost <= coins) return buy.action;
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (you?.offer) return 1500 + rng.int(0, 2500);
    // Buying is a quick tap; answering takes a while.
    const buy = you ? botPurchase(view, you.asOf) : null;
    if (buy && buy.cost <= you.coins) return 700 + rng.int(0, 1300);
    return 2200 + rng.int(0, 4500);
  },
});
