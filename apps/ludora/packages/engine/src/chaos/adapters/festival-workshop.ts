import { streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { helperBonus } from '../../modes/festival-workshop/index.ts';
import { LEVEL_INCOME, OVERTIME, PARADE, QUARTER_OFF, STATIONS, TEA_BREAK_HELPERS, type Goods, type StationKind } from '../../modes/festival-workshop/meta.ts';

/*
 * Festival Workshop money is continuous: each workshop stores its coins and
 * takings as of `since`, and earns `rate` coins a second from then on. The
 * mode never ticks; it settles a workshop (brings it up to now) whenever
 * something changes its income, and every screen shows the projection.
 *
 * So the meters here read the projected value at the moment of the
 * transaction, exactly as the mode's own ranking and results do, and write by
 * settling the workshop to now first. Reading the stored field instead would
 * be wrong by however much the workshop has earned since it was last settled
 * (and different for every player), which breaks swaps, rankings and
 * "set to the average" cheats, and would let delta hooks see stale income in
 * bursts. With projected meters a delta hook sees what the mode actually
 * hands out in a transaction (paydays, parade bonuses, tip jars, spending),
 * not the steady station income.
 *
 * The functions below mirror the mode's own (see modes/festival-workshop/
 * index.ts: ratesFor, accrue, advance, projected, syncWakes) for chaos code
 * that changes stations, boosts or prices and must settle first. They are
 * exported for the festival-workshop pack.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FwConfig {
  wide: boolean;
  events: boolean;
  rush: boolean;
  favours: boolean;
  pranks: boolean;
  finaleDemand: number;
  price: number;
  goal: number;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function fwConfig(settings: Record<string, unknown>): FwConfig {
  return {
    wide: settings.marketRange === 'wide',
    events: settings.events !== false,
    rush: settings.events !== false && settings.rushOrders === true,
    favours: settings.favours !== false,
    pranks: settings.pranks !== false,
    finaleDemand: num(settings.finaleDemand, 2),
    price: settings.prices === 'quarterOff' ? QUARTER_OFF : 1,
    goal: Math.max(0, num(settings.goal, 0)),
  };
}

export const working = (st: any, at: number) => st.stoppedUntil === null || st.stoppedUntil <= at;
export const eventOn = (s: any, kind: string, at: number) => s.event !== null && s.event.kind === kind && at >= s.event.startedAt && at < s.event.endsAt;

function priceOf(s: any, goods: Goods, c: FwConfig): number {
  return s.finale && goods === 'fireworks' ? c.finaleDemand : s.market.demand[goods];
}

const perGoods = (): Record<Goods, number> => ({ lanterns: 0, kites: 0, candles: 0, fireworks: 0 });

/** A workshop's income per second at `at` for a set of stations (the mode's ratesFor). */
export function ratesFor(slots: readonly any[], w: any, s: any, at: number, c: FwConfig, even = false): { total: number; byGoods: Record<Goods, number> } {
  let help = 0;
  for (const st of slots) if (st && st.kind === 'helpers' && working(st, at)) help += helperBonus(st.level);
  if (eventOn(s, 'tea', at)) help *= TEA_BREAK_HELPERS;
  const boost = (w.overtimeUntil !== null && w.overtimeUntil > at ? OVERTIME.mult : 1) * (w.paradeUntil !== null && w.paradeUntil > at ? PARADE.boost : 1);
  const byGoods = perGoods();
  let total = 0;
  for (const st of slots) {
    if (!st || !working(st, at)) continue;
    const goods = STATIONS[st.kind as StationKind].goods;
    if (!goods) continue;
    const income = STATIONS[st.kind as StationKind].income * LEVEL_INCOME ** (st.level - 1) * (even ? 1 : priceOf(s, goods, c)) * (1 + help) * boost;
    byGoods[goods] += income;
    total += income;
  }
  return { total, byGoods };
}

export function recompute(w: any, s: any, at: number, c: FwConfig) {
  if (w.away) return;
  const r = ratesFor(w.slots, w, s, at, c);
  w.rate = r.total;
  w.byGoods = r.byGoods;
}

function nextExpiry(w: any, after: number): number | null {
  let e: number | null = null;
  const consider = (t: number | null) => {
    if (t !== null && t > after && (e === null || t < e)) e = t;
  };
  consider(w.overtimeUntil);
  consider(w.paradeUntil);
  for (const st of w.slots) if (st) consider(st.stoppedUntil);
  return e;
}

function accrue(w: any, s: any, at: number) {
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

function clearExpired(w: any, at: number) {
  if (w.overtimeUntil !== null && w.overtimeUntil <= at) w.overtimeUntil = null;
  if (w.paradeUntil !== null && w.paradeUntil <= at) w.paradeUntil = null;
  for (const st of w.slots) {
    if (st && st.stoppedUntil !== null && st.stoppedUntil <= at) {
      st.stoppedUntil = null;
      st.stoppedBy = null;
    }
  }
}

/** Brings a workshop's money up to `to` (the mode's advance). */
export function advance(w: any, s: any, to: number, c: FwConfig) {
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

/** What a workshop holds at `to`, without changing it (the mode's projected). */
export function projected(w: any, s: any, to: number, c: FwConfig): { coins: number; takings: number; rate: number; contribution: number } {
  if (w.away || to <= w.since) return { coins: w.coins, takings: w.takings, rate: w.away ? 0 : w.rate, contribution: w.contribution };
  const copy = { ...w, slots: w.slots.map((st: any) => (st ? { ...st } : null)), byGoods: { ...w.byGoods } };
  advance(copy, s, to, c);
  return { coins: copy.coins, takings: copy.takings, rate: copy.rate, contribution: copy.contribution };
}

export function settleAll(s: any, at: number, c: FwConfig) {
  for (const w of Object.values(s.workshops)) advance(w, s, at, c);
}

export function recomputeAll(s: any, at: number, c: FwConfig) {
  for (const w of Object.values(s.workshops) as any[]) if (!w.away) recompute(w, s, at, c);
}

/** One wake timer per workshop at its next boost or prank expiry (the mode's syncWakes). */
export function syncWakes(s: any, ctx: ModeContext) {
  for (const [id, w] of Object.entries(s.workshops) as [string, any][]) {
    const at = w.away ? null : nextExpiry(w, w.since);
    if (at === w.wakeAt) continue;
    w.wakeAt = at;
    if (at === null) ctx.clearTimer(`wake:${id}`);
    else ctx.setTimer(`wake:${id}`, at);
  }
}

/**
 * With a takings goal on, incomes changed by chaos move the moment someone
 * reaches it; the mode re-plans its goal timer whenever any timer fires.
 */
export function pokeGoal(ctx: ModeContext) {
  if (fwConfig(ctx.settings).goal > 0) ctx.setTimer('goal', ctx.now() + 1);
}

/** Game time, when the context has a clock (the catalogue suite reads meters with a bare one). */
function nowOf(ctx: ModeContext | undefined): number | null {
  return typeof ctx?.now === 'function' ? ctx.now() : null;
}

const workshopOf = (s: any, id: PlayerId) => s?.workshops?.[id];

/** A projected money meter: reads the value now, writes by settling the workshop first. */
function moneyMeter(key: string, label: string, field: 'takings' | 'coins' | 'contribution', opts: Pick<MeterDef, 'max'> = {}): MeterDef {
  return {
    key,
    label,
    scope: 'player',
    integer: false,
    get: (s, id, ctx) => {
      const w = workshopOf(s, id);
      if (!w) return 0;
      const now = nowOf(ctx);
      return now === null ? Number(w[field] ?? 0) : projected(w, s, now, fwConfig(ctx.settings))[field];
    },
    set: (s, id, v, ctx) => {
      const w = workshopOf(s, id);
      if (!w) return;
      const now = nowOf(ctx);
      if (now !== null) advance(w, s, now, fwConfig(ctx.settings));
      if (field === 'takings') {
        w.takings = v;
        // Keep the earnings breakdown on the player's screen whole: no part may be more than the total.
        const parts = w.fromPaydays + w.fromOrders + w.fromFavours;
        if (parts > v && parts > 0) {
          const k = Math.max(0, v) / parts;
          w.fromPaydays *= k;
          w.fromOrders *= k;
          w.fromFavours *= k;
        }
        if (now !== null) pokeGoal(ctx);
      } else w[field] = v;
    },
    ...opts,
  };
}

export const festivalWorkshopAdapter: ChaosAdapter = {
  modeId: 'festival-workshop',
  meters: [
    // Takings are the standing. With a goal on, reaching it is the mode's moment, so cheats stop a coin short.
    moneyMeter('score', 'Takings', 'takings', {
      max: (s: any, _id, ctx) => {
        const goal = fwConfig(ctx.settings).goal;
        return goal > 0 && s.winner === null ? goal - 1 : Number.MAX_SAFE_INTEGER;
      },
    }),
    // Coins to spend. Spending never lowers takings, so moving coins leaves the standings alone.
    moneyMeter('currency', 'Coins', 'coins'),
    // What a workshop has made for the parade order running now (it starts again at 0 with each order).
    moneyMeter('parade', 'Parade goods', 'contribution', { max: (s: any) => (s.event?.kind === 'parade' ? Number.MAX_SAFE_INTEGER : 0) }),
    {
      key: 'lock',
      label: 'Lock',
      scope: 'player',
      get: (s, id) => (workshopOf(s, id)?.lock ? 1 : 0),
      set: (s, id, v) => {
        const w = workshopOf(s, id);
        if (w) w.lock = v > 0;
      },
      max: (_s, _id, ctx) => (fwConfig(ctx.settings).pranks ? 1 : 0),
    },
    {
      key: 'streak',
      label: 'Answer streak',
      scope: 'player',
      get: (s, id) => Number(workshopOf(s, id)?.stream?.streak ?? 0),
      set: (s, id, v) => {
        const w = workshopOf(s, id);
        if (w) w.stream.streak = v;
      },
      // A streak can never be longer than the right answers given.
      max: (s: any, id) => Number(workshopOf(s, id)?.stream?.correct ?? 0),
    },
  ],
  ...streamParts((s: any, id) => s.workshops[id]?.stream),
  features: (settings) => {
    const c = fwConfig(settings);
    return [...(c.pranks ? ['pranks'] : []), ...(c.favours ? ['favours'] : []), ...(c.events ? ['events'] : [])];
  },
};
