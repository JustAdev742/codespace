import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, share, target, transfer } from '../cheats/kit.ts';
import { streamNext } from '../../mechanics/selfPaced.ts';
import { drawFavours, marketPrice, paradeChoices, paradeTarget, paydayFor } from '../../modes/festival-workshop/index.ts';
import {
  EVENT_TIMING,
  EVENTS,
  EVENT_ORDER,
  FAVOUR_OFFER_MS,
  FAVOUR_ORDER,
  FAVOURS,
  GOODS,
  GOODS_INFO,
  MARKET,
  MAX_LEVEL,
  OVERTIME,
  PARADE,
  PRANK_MS,
  STATION_ORDER,
  STATIONS,
  type EventKind,
  type FavourKind,
  type Goods,
  type StationKind,
} from '../../modes/festival-workshop/meta.ts';
import { advance, eventOn, fwConfig, projected, ratesFor, recompute, recomputeAll, settleAll, syncWakes, pokeGoal, working, type FwConfig } from '../adapters/festival-workshop.ts';

/*
 * Cheats that only make sense in Festival Workshop: stations and slots,
 * income boosts, pranks and locks, paydays and streaks, the shared market,
 * festival events and parade orders, and Festival Favours.
 *
 * Money in this mode is continuous (see adapters/festival-workshop.ts): a
 * cheat that changes what a workshop earns per second first settles it up to
 * now at the old rate, then makes the change, recomputes the rate, re-arms the
 * workshop's wake timer (boosts and stopped stations end on a timer) and asks
 * the mode to re-plan its goal timer. `change()` does all of that.
 *
 * Coins, takings, locks, streaks and parade goods move through meters, so
 * cheats that only touch those can be undone. Cheats that also change
 * stations, offers, events or the market are not undoable.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'festival-workshop';
const M = [MODE] as const;
const NEWS_KEEP = 8;
/** The smallest amount a station or upgrade can cost (prices round to 5). Smaller drops in coins are not spending. */
const MIN_SPEND = 5;
/** Free upgrades Pocket Lucky Sparks carries. */
const POCKET_SPARKS = 3;

type Api = ChaosApi;
type Workshop = any;

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const cfg = (api: Api): FwConfig => fwConfig(api.ctx.settings);
const ws = (api: Api, id: string): Workshop | undefined => {
  const w = api.s.workshops[id];
  return w && !w.away ? w : undefined;
};
/** Players still in the game, with their workshops. */
const present = (api: Api): [string, Workshop][] => api.ids().flatMap((id) => (ws(api, id) ? [[id, ws(api, id)] as [string, Workshop]] : []));
const stationName = (kind: StationKind) => STATIONS[kind].name;

/** Settle these workshops to now, change them, then recompute their income and timers. */
function change(api: Api, ids: readonly string[], fn: () => void) {
  const c = cfg(api);
  const now = api.now();
  for (const id of ids) {
    const w = ws(api, id);
    if (w) advance(w, api.s, now, c);
  }
  fn();
  for (const id of ids) {
    const w = ws(api, id);
    if (w) recompute(w, api.s, now, c);
  }
  syncWakes(api.s, api.ctx);
  pokeGoal(api.ctx);
}

/** The same for a change that touches every workshop (prices, events). */
function changeAll(api: Api, fn: () => void) {
  const c = cfg(api);
  const now = api.now();
  settleAll(api.s, now, c);
  fn();
  recomputeAll(api.s, now, c);
  syncWakes(api.s, api.ctx);
  pokeGoal(api.ctx);
}

const rateNow = (api: Api, w: Workshop) => projected(w, api.s, api.now(), cfg(api)).rate;

/** What each station adds to a workshop's income now (0 for a stopped one). */
function contributions(api: Api, w: Workshop): (number | null)[] {
  const c = cfg(api);
  const now = api.now();
  const total = ratesFor(w.slots, w, api.s, now, c).total;
  return w.slots.map((st: any, i: number) => (st ? total - ratesFor(w.slots.map((x: any, j: number) => (j === i ? null : x)), w, api.s, now, c).total : null));
}

/** The working station whose stop would cost the most now; ties go to the higher level, then the first slot (the mode's bestStation). */
function bestSlot(api: Api, w: Workshop): number | null {
  const now = api.now();
  const loss = contributions(api, w);
  let best: number | null = null;
  w.slots.forEach((st: any, i: number) => {
    if (!st || !working(st, now)) return;
    if (best === null || loss[i]! > loss[best]! + 1e-9 || (Math.abs(loss[i]! - loss[best]!) <= 1e-9 && st.level > w.slots[best].level)) best = i;
  });
  return best;
}

/** The station adding least to a workshop now (a stopped one adds nothing). */
function weakestSlot(api: Api, w: Workshop): number | null {
  const loss = contributions(api, w);
  let worst: number | null = null;
  w.slots.forEach((st: any, i: number) => {
    if (st && (worst === null || loss[i]! < loss[worst]! - 1e-9)) worst = i;
  });
  return worst;
}

const stationCount = (w: Workshop) => w.slots.filter(Boolean).length;
const freeSlot = (w: Workshop) => w.slots.findIndex((st: any) => st === null);

function addNews(api: Api, item: { kind: string; who: string | null; other: string | null; station: StationKind | null; level: number; goods: Goods | null }) {
  api.s.newsSeq++;
  api.s.news = [{ ...item, at: api.now(), seq: api.s.newsSeq }, ...api.s.news].slice(0, NEWS_KEEP);
}

const listNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/* -------------------------------- market -------------------------------- */

const wideAt = (api: Api, at: number) => cfg(api).wide || (api.s.swingUntil !== null && at < api.s.swingUntil);

/** The share of everything the class makes, at even prices, that each goods is (the mode's shares). */
function shares(api: Api, at: number): Record<Goods, number> {
  const c = cfg(api);
  const supply: Record<Goods, number> = { lanterns: 0, kites: 0, candles: 0, fireworks: 0 };
  let total = 0;
  for (const [, w] of present(api)) {
    const r = ratesFor(w.slots, w, api.s, at, c, true);
    for (const g of GOODS) supply[g] += r.byGoods[g];
    total += r.total;
  }
  const out: Record<Goods, number> = { lanterns: 0.25, kites: 0.25, candles: 0.25, fireworks: 0.25 };
  if (total > 0) for (const g of GOODS) out[g] = supply[g] / total;
  return out;
}

/** New prices by the mode's rule, with the usual random nudge drawn from the chaos stream (the mode's reprice). */
function reprice(api: Api, at: number, wide: boolean) {
  const range = wide ? 'wide' : 'normal';
  const nudges = MARKET[range].nudges;
  const sh = shares(api, at);
  const demand = { ...api.s.market.demand };
  for (const g of GOODS) demand[g] = marketPrice(sh[g], range, nudges[api.rng.int(0, nudges.length - 1)]!);
  api.s.market.prev = api.s.market.demand;
  api.s.market.demand = demand;
  api.s.market.lastShiftAt = at;
}

function marketLine(api: Api): string {
  const d = api.s.market.demand as Record<Goods, number>;
  const top = [...GOODS].sort((a, b) => d[b] - d[a])[0]!;
  const low = [...GOODS].sort((a, b) => d[a] - d[b])[0]!;
  if (d[top] === d[low]) return `everything sells at ×${d[top]}`;
  return `${GOODS_INFO[top].many} are in demand at ×${d[top]}, ${GOODS_INFO[low].many} sell at ×${d[low]}`;
}

/* -------------------------------- events -------------------------------- */

const eventLimit = (api: Api) => (api.s.finaleAt ?? api.s.endsAt) as number;

/** Puts the next scheduled event at `at`, or drops it when it would run into the finale (the mode's scheduleEvent). */
function scheduleNextEvent(api: Api, at: number) {
  if (at + EVENT_TIMING.lengthMs <= eventLimit(api)) {
    api.s.nextEventAt = at;
    api.ctx.setTimer('event', at);
  } else {
    api.s.nextEventAt = null;
    api.ctx.clearTimer('event');
  }
}

function pushNextEvent(api: Api, after: number) {
  if (api.s.nextEventAt !== null && api.s.nextEventAt < after) scheduleNextEvent(api, after);
}

/** The top makers' bonuses a parade order would pay if it were judged now, in the mode's order. */
function paradeMakers(api: Api): [string, Workshop][] {
  return present(api)
    .filter(([, w]) => w.contribution > 0)
    .sort((a, b) => b[1].contribution - a[1].contribution || api.name(a[0]).localeCompare(api.name(b[0])));
}

const paradeSeconds = (api: Api) => (cfg(api).rush ? PARADE.rushBonusSeconds : PARADE.bonusSeconds);

/** Judge a parade order at `at` (the mode's finishParade). Every workshop must be settled to `at` first. */
function finishParade(api: Api, ev: any, at: number) {
  const goods = ev.goods as Goods;
  const makers = paradeMakers(api);
  const total = makers.reduce((n, [, w]) => n + w.contribution, 0);
  const reached = total >= ev.target;
  const seconds = paradeSeconds(api);
  const top = makers.slice(0, PARADE.rewarded).map(([id, w], i) => {
    const bonus = Math.max(1, Math.round(w.rate * seconds));
    w.coins += bonus;
    w.takings += bonus;
    w.fromOrders += bonus;
    w.bonus = { amount: bonus, at, place: i + 1 };
    return { playerId: id, amount: Math.round(w.contribution), bonus };
  });
  if (reached) for (const [, w] of makers) w.paradeUntil = at + PARADE.boostMs;
  api.s.parade = { goods, target: ev.target, total: Math.round(total), reached, top, boosted: reached ? makers.length : 0, at };
  const many = GOODS_INFO[goods].many;
  if (reached) api.feed(`The parade got its ${many} early. Everyone who made some earns ×${PARADE.boost} income for 30 seconds.`, 'good');
  else api.feed(`The parade was called early and fell short: ${fmt(total)} of ${fmt(ev.target)} coins of ${many}.`, 'info');
  if (top.length) {
    api.feed(`Top ${many} makers: ${listNames(top.map((t) => api.name(t.playerId)))}. Each earns ${seconds} seconds of income.`, 'good');
    addNews(api, { kind: 'parade', who: top[0]!.playerId, other: null, station: null, level: 0, goods });
  }
}

function needsEvent(api: Api): { error: string } | null {
  return api.s.event ? null : { error: 'No festival event is running right now.' };
}

function needsParade(api: Api): { error: string } | null {
  return api.s.event?.kind === 'parade' && api.s.event.goods ? null : { error: 'No parade order is running right now.' };
}

/* -------------------------------- favours ------------------------------- */

/** Who a player could prank now (the mode's prankTargets, without the ranking). */
function prankable(api: Api, pid: string): string[] {
  const now = api.now();
  const me = ws(api, pid);
  return present(api)
    .filter(([id, w]) => id !== pid && id !== me?.lastTarget && w.slots.some((st: any) => st && working(st, now)))
    .map(([id]) => id);
}

/** The favours a player could be offered now (the mode's favourDeck). */
function favourDeck(api: Api, pid: string): FavourKind[] {
  const c = cfg(api);
  const others = api.ids().some((id) => id !== pid && api.s.workshops[id]);
  const canPrank = c.pranks && prankable(api, pid).length > 0;
  return FAVOUR_ORDER.filter((k) => (k === 'prank' ? canPrank : k === 'lock' ? c.pranks && others : true));
}

const FAVOUR_ODDS = FAVOUR_ORDER.map((k) => `${FAVOURS[k].title} ${FAVOURS[k].weight}`).join(', ');

/** Closes a player's favour offer (the mode's closeOffer): back to their question, or a new one. */
function closeOffer(api: Api, id: string) {
  const w = ws(api, id)!;
  w.offer = null;
  api.ctx.clearTimer(`offer:${id}`);
  if (!w.stream.iid) streamNext(w.stream, api.ctx);
}

function needsOffer(api: Api, id: string, mine: boolean): { error: string } | null {
  return ws(api, id)?.offer ? null : { error: mine ? 'You have no Festival Favour cards to pick from right now.' : `${api.name(id)} has no Festival Favour cards open right now.` };
}

/* ------------------------------- stations -------------------------------- */

function upgradeOne(api: Api, id: string, slot: number): string {
  const st = ws(api, id)!.slots[slot];
  st.level++;
  return `${stationName(st.kind)} went up to level ${st.level}`;
}

function belowMax(w: Workshop): number[] {
  return w.slots.map((st: any, i: number) => (st && st.level < MAX_LEVEL ? i : -1)).filter((i: number) => i >= 0);
}

/* --------------------------------- cheats -------------------------------- */

const stations: CheatDef[] = [
  {
    id: 'festival-workshop.tangle',
    name: 'Workshop Tangle',
    category: 'troll',
    description: `Play a prank on an opponent right now, by the festival’s rules: their best station (the one whose stop costs them most) is tangled for ${PRANK_MS / 1000} seconds. A lock blocks it, and breaks.`,
    target: 'opponent',
    needs: ['pranks'],
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const w = ws(api, t)!;
      const at = api.now();
      advance(w, api.s, at, cfg(api));
      const slot = bestSlot(api, w);
      if (slot === null) return { error: `${api.name(t)} has no working station to tangle.` };
      const kind = w.slots[slot].kind as StationKind;
      if (w.lock) {
        w.lock = false;
        w.pranked = { by: c.caster, station: kind, slot, until: at, blocked: true, at };
        api.feed(`${api.name(t)}'s lock stopped ${api.name(c.caster)}'s tangle.`, 'info', [c.caster, t]);
        addNews(api, { kind: 'blocked', who: t, other: c.caster, station: kind, level: 0, goods: null });
        return;
      }
      change(api, [t], () => {
        w.slots[slot].stoppedUntil = at + PRANK_MS;
        w.slots[slot].stoppedBy = c.caster;
        w.pranked = { by: c.caster, station: kind, slot, until: at + PRANK_MS, blocked: false, at };
      });
      api.feed(`${api.name(c.caster)} tangled ${api.name(t)}'s ${stationName(kind)} for ${PRANK_MS / 1000} seconds.`, 'bad', [c.caster, t]);
      addNews(api, { kind: 'prank', who: c.caster, other: t, station: kind, level: 0, goods: null });
    },
  },
  {
    id: 'festival-workshop.stop-line',
    name: 'Stop the Workshop Line',
    category: 'troll',
    description: 'Every station of the kind you choose in an opponent’s workshop (or every station) stops for 10 seconds. A lock does not help against it.',
    target: 'opponent',
    modes: M,
    params: [
      {
        key: 'kind',
        label: 'Stations',
        kind: 'choice',
        options: [{ value: 'all', label: 'Every station' }, ...STATION_ORDER.map((k) => ({ value: k, label: STATIONS[k].many }))],
        default: 'all',
      },
    ],
    cost: 35,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const w = ws(api, t)!;
      const kind = String(c.params.kind);
      const until = api.now() + 10_000;
      const hit = w.slots.filter((st: any) => st && (kind === 'all' || st.kind === kind) && (st.stoppedUntil ?? 0) < until);
      if (!hit.length) return { error: kind === 'all' ? `${api.name(t)} has no station to stop.` : `${api.name(t)} has no ${STATIONS[kind as StationKind].name} to stop.` };
      change(api, [t], () => {
        for (const st of hit) {
          st.stoppedUntil = until;
          st.stoppedBy = c.caster;
        }
      });
      api.feed(`${api.name(c.caster)} stopped ${hit.length} of ${api.name(t)}'s stations for 10 seconds.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.untangle',
    name: 'Workshop Quick Fix',
    category: 'advantage',
    description: 'Every stopped station in your workshop (tangled by a prank or stopped by chaos) starts working again now.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const w = ws(api, c.caster)!;
      const now = api.now();
      const stopped = w.slots.filter((st: any) => st && !working(st, now));
      if (!stopped.length) return { error: 'All your stations are working.' };
      change(api, [c.caster], () => {
        for (const st of stopped) {
          st.stoppedUntil = null;
          st.stoppedBy = null;
        }
      });
    },
  },
  {
    id: 'festival-workshop.station-swap',
    name: 'Workshop Station Swap',
    category: 'troll',
    description: 'Your weakest station (the one adding least to your income) trades places with an opponent’s best station, levels and all. A stopped station stays stopped where it goes.',
    target: 'opponent',
    modes: M,
    cost: 50,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = ws(api, c.caster)!;
      const them = ws(api, t)!;
      const mine = weakestSlot(api, me);
      const theirs = bestSlot(api, them);
      if (mine === null) return { error: 'You have no station to trade.' };
      if (theirs === null) return { error: `${api.name(t)} has no working station to trade.` };
      const a = me.slots[mine];
      const b = them.slots[theirs];
      if (a.kind === b.kind && a.level === b.level) return { error: 'Your stations are the same, so a swap would change nothing.' };
      change(api, [c.caster, t], () => {
        me.slots[mine] = b;
        them.slots[theirs] = a;
      });
      api.feed(`${api.name(c.caster)} swapped their ${stationName(a.kind)} (level ${a.level}) for ${api.name(t)}'s ${stationName(b.kind)} (level ${b.level}).`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.rust',
    name: 'Workshop Rust',
    category: 'troll',
    description: 'An opponent’s highest-level station drops one level (never below level 1). If several share the top level, the one earning most rusts.',
    target: 'opponent',
    modes: M,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const w = ws(api, t)!;
      const loss = contributions(api, w);
      let pick: number | null = null;
      w.slots.forEach((st: any, i: number) => {
        if (!st || st.level <= 1) return;
        const cur = pick === null ? null : w.slots[pick];
        if (!cur || st.level > cur.level || (st.level === cur.level && loss[i]! > loss[pick!]!)) pick = i;
      });
      if (pick === null) return { error: `Every station ${api.name(t)} has is at level 1.` };
      const st = w.slots[pick];
      change(api, [t], () => void st.level--);
      api.feed(`${api.name(c.caster)}'s rust took ${api.name(t)}'s ${stationName(st.kind)} down to level ${st.level}.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.elbow-grease',
    name: 'Workshop Elbow Grease',
    category: 'economy',
    description: `Your lowest-level station below level ${MAX_LEVEL} goes up one level for free. If several share the lowest level, the one earning most goes up.`,
    target: 'self',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const w = ws(api, c.caster)!;
      const loss = contributions(api, w);
      const pick = belowMax(w).sort((i, j) => w.slots[i].level - w.slots[j].level || loss[j]! - loss[i]!)[0];
      if (pick === undefined) return { error: `You have no station below level ${MAX_LEVEL}.` };
      let text = '';
      change(api, [c.caster], () => void (text = upgradeOne(api, c.caster, pick)));
      api.feed(`Workshop Elbow Grease: your ${text}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'festival-workshop.blueprint-theft',
    name: 'Workshop Blueprint Theft',
    category: 'economy',
    description: 'Build a copy of an opponent’s best station, at level 1, in your first free slot, for free. They keep theirs. You need a free slot.',
    target: 'opponent',
    hostile: false,
    modes: M,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = ws(api, c.caster)!;
      const them = ws(api, t)!;
      const slot = freeSlot(me);
      if (slot < 0) return { error: 'Your workshop has no free slot.' };
      const best = bestSlot(api, them) ?? weakestSlot(api, them);
      if (best === null) return { error: `${api.name(t)} has no station to copy.` };
      const kind = them.slots[best].kind as StationKind;
      change(api, [c.caster], () => {
        me.slots[slot] = { kind, level: 1, stoppedUntil: null, stoppedBy: null };
        me.built++;
        api.s.built[kind]++;
        if (kind === 'lab') me.labs++;
      });
      api.feed(`Workshop Blueprint Theft: you built a copy of ${api.name(t)}'s ${stationName(kind)}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'festival-workshop.poach-station',
    name: 'Workshop Station Poach',
    category: 'troll',
    description: 'Move an opponent’s best station, level and all, into your first free slot. Their slot is left empty, to build in again. They must have at least two stations, and you need a free slot.',
    target: 'opponent',
    modes: M,
    cost: 70,
    cooldownMs: 120_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = ws(api, c.caster)!;
      const them = ws(api, t)!;
      const slot = freeSlot(me);
      if (slot < 0) return { error: 'Your workshop has no free slot.' };
      if (stationCount(them) < 2) return { error: `${api.name(t)} has only one station; it cannot be poached.` };
      const best = bestSlot(api, them) ?? weakestSlot(api, them)!;
      const st = them.slots[best];
      change(api, [c.caster, t], () => {
        me.slots[slot] = st;
        them.slots[best] = null;
      });
      api.feed(`${api.name(c.caster)} poached ${api.name(t)}'s ${stationName(st.kind)} (level ${st.level}).`, 'big');
    },
  },
  {
    id: 'festival-workshop.night-shift',
    name: 'Festival Night Shift',
    category: 'economy',
    description: 'For 20 seconds your stations earn double: every second you get another second of your current income on top, in coins and takings.',
    target: 'self',
    modes: M,
    cost: 40,
    cooldownMs: 75_000,
    // Ticks at 1 to 20 seconds: twenty bonus seconds.
    durationMs: 20_500,
    tickMs: 1000,
    apply: (api, c) => (rateNow(api, ws(api, c.caster)!) > 0 ? undefined : { error: 'Your workshop earns nothing yet, so there is nothing to double.' }),
    hooks: {
      tick: (api, fx) => {
        const w = ws(api, fx.caster);
        if (!w) return;
        const extra = rateNow(api, w);
        if (extra <= 0) return;
        api.add('score', fx.caster, extra);
        api.add('currency', fx.caster, extra);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Night shift ×2', tone: 'good' }),
  },
  {
    id: 'festival-workshop.boost-heist',
    name: 'Festival Overtime Heist',
    category: 'troll',
    description: `Take an opponent’s running income boosts with the time they have left: Overtime (×${OVERTIME.mult}) and the parade boost (×${PARADE.boost}). Theirs end now; time on a boost you already have is added to.`,
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = ws(api, c.caster)!;
      const them = ws(api, t)!;
      const now = api.now();
      const left = (until: number | null) => (until !== null && until > now ? until - now : 0);
      const ot = left(them.overtimeUntil);
      const pa = left(them.paradeUntil);
      if (!ot && !pa) return { error: `${api.name(t)} has no income boost running.` };
      change(api, [c.caster, t], () => {
        if (ot) {
          me.overtimeUntil = Math.max(me.overtimeUntil ?? now, now) + ot;
          them.overtimeUntil = null;
        }
        if (pa) {
          me.paradeUntil = Math.max(me.paradeUntil ?? now, now) + pa;
          them.paradeUntil = null;
        }
      });
      const what = [ot ? `Overtime (${Math.round(ot / 1000)} s)` : '', pa ? `a parade boost (${Math.round(pa / 1000)} s)` : ''].filter(Boolean).join(' and ');
      api.feed(`${api.name(c.caster)} took ${api.name(t)}'s ${what}.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.red-tape',
    name: 'Workshop Red Tape',
    category: 'troll',
    description: 'For 20 seconds an opponent cannot build, replace or upgrade stations. They can still answer and pick favours.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      gate: (_api, _fx, _id, action) => {
        const type = (action as any)?.type;
        return type === 'build' || type === 'upgrade' ? { block: 'Workshop Red Tape: the permits for building and upgrading are stuck for a few more seconds.' } : undefined;
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'No building', until: fx.endsAt }),
  },
  {
    id: 'festival-workshop.spark-gamble',
    name: 'Workshop Spark Gamble',
    category: 'random',
    description: `Strike a spark in your workshop. Odds: ${odds([
      [`a random station of yours below level ${MAX_LEVEL} goes up a level`, 60],
      ['a random working station of yours is tangled for 10 seconds', 40],
    ])}.`,
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const w = ws(api, c.caster)!;
      const now = api.now();
      const up = belowMax(w);
      const run: number[] = w.slots.map((st: any, i: number) => (st && working(st, now) ? i : -1)).filter((i: number) => i >= 0);
      if (!up.length || !run.length) return { error: 'You need a working station and one below level 5 to gamble with.' };
      if (rollOdds(api, [[true, 60], [false, 40]])) {
        let text = '';
        change(api, [c.caster], () => void (text = upgradeOne(api, c.caster, api.rng.pick(up))));
        api.feed(`Workshop Spark Gamble: your ${text}.`, 'good', [c.caster]);
      } else {
        const st = w.slots[api.rng.pick(run)];
        change(api, [c.caster], () => {
          st.stoppedUntil = now + 10_000;
          st.stoppedBy = c.caster;
        });
        api.feed(`Workshop Spark Gamble: the spark tangled your ${stationName(st.kind)} for 10 seconds.`, 'bad', [c.caster]);
      }
    },
  },
  {
    id: 'festival-workshop.pocket-sparks',
    name: 'Pocket Festival Sparks',
    category: 'advantage',
    description: `For 40 seconds you carry ${POCKET_SPARKS} sparks: each right answer you give strikes one, which upgrades a random station of yours below level ${MAX_LEVEL} for free (each such station equally likely). It ends when the sparks are used up.`,
    target: 'self',
    modes: M,
    cost: 40,
    cooldownMs: 75_000,
    durationMs: 40_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const w = ws(api, c.caster)!;
      if (!belowMax(w).length) return { error: `Every station you have is at level ${MAX_LEVEL}.` };
      fx!.data.correct = w.stream.correct;
      fx!.data.left = POCKET_SPARKS;
    },
    hooks: {
      tick: (api, fx) => {
        const w = ws(api, fx.caster);
        if (!w) return;
        const fresh = w.stream.correct - Number(fx.data.correct);
        fx.data.correct = w.stream.correct;
        for (let i = 0; i < fresh && Number(fx.data.left) > 0; i++) {
          const up = belowMax(w);
          if (!up.length) break;
          fx.data.left = Number(fx.data.left) - 1;
          let text = '';
          change(api, [fx.caster], () => void (text = upgradeOne(api, fx.caster, api.rng.pick(up))));
          api.feed(`Pocket Festival Sparks: your ${text}.`, 'good', [fx.caster]);
        }
        if (Number(fx.data.left) <= 0 || !belowMax(w).length) api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `${Number(fx.data.left)} sparks`, tone: 'good' }),
  },
];

const money: CheatDef[] = [
  {
    id: 'festival-workshop.payday-freeze',
    name: 'Festival Payday Freeze',
    category: 'troll',
    description: 'For 20 seconds an opponent’s right answers bring no payday: the coins and takings each payday would have paid are cancelled.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 40,
    hooks: {
      delta: {
        // Both meters move by the payday; whichever hook runs first records it and fixes the payday card.
        score: (api, fx, d) => freezePayday(api, fx, d),
        currency: (api, fx, d) => freezePayday(api, fx, d),
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Payday frozen', tone: 'bad' }),
  },
  {
    id: 'festival-workshop.payday-advance',
    name: 'Festival Payday Advance',
    category: 'economy',
    description: 'Get your next payday now without answering: 8 seconds of your income (at least 10 coins), with your streak bonus as if this answer kept it going, and rush hour and the finale as a right answer would get them. It adds to your coins and takings.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const w = ws(api, c.caster)!;
      const now = api.now();
      const pay = paydayFor(rateNow(api, w), w.stream.streak + 1, { rush: eventOn(api.s, 'rush', now), finale: api.s.finale });
      const got = api.add('score', c.caster, pay.amount);
      if (got <= 0) return { error: 'Your takings cannot go any higher.' };
      api.add('currency', c.caster, pay.amount);
      w.fromPaydays += got;
      api.feed(`Festival Payday Advance: +${fmt(pay.amount)} coins${pay.notes.length ? ` (${pay.notes.join(', ')})` : ''}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'festival-workshop.streak-snap',
    name: 'Workshop Streak Snap',
    category: 'troll',
    description: 'Break an opponent’s run of right answers: their streak goes back to 0, so their next payday has no streak bonus.',
    target: 'opponent',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('streak', t) < 2) return { error: `${api.name(t)} has no streak to break.` };
      api.set('streak', t, 0);
      api.feed(`${api.name(c.caster)} snapped your answer streak.`, 'bad', [t]);
    },
  },
  {
    id: 'festival-workshop.cash-box-raid',
    name: 'Workshop Cash Box Raid',
    category: 'economy',
    description: 'Take 20% of an opponent’s coins to spend. Only coins move: takings, which rank the workshops, stay where they are for both of you.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      const have = api.get('currency', t);
      if (have < 1) return { error: `${api.name(t)} has no coins in the cash box.` };
      const got = transfer(api, 'currency', t, c.caster, share(have, 20));
      api.feed(`${api.name(c.caster)} raided your cash box for ${fmt(got)} coins.`, 'bad', [t]);
    },
  },
  {
    id: 'festival-workshop.purse-swap',
    name: 'Workshop Purse Swap',
    category: 'economy',
    description: 'Trade coins to spend with an opponent. Takings stay where they are.',
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      const a = api.get('currency', c.caster);
      const b = api.get('currency', t);
      if (Math.round(a) === Math.round(b)) return { error: 'You have the same coins already.' };
      api.set('currency', c.caster, b);
      api.set('currency', t, a);
      api.feed(`${api.name(c.caster)} swapped purses with ${api.name(t)}.`, 'info', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.ground-rent',
    name: 'Workshop Ground Rent',
    category: 'economy',
    description: 'Every other workshop pays you 5 seconds of its current income in coins (as many as it has). Only coins to spend move; takings stay put.',
    target: 'everyone-else',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      let total = 0;
      for (const t of c.targets) {
        const w = ws(api, t);
        if (!w) continue;
        total += transfer(api, 'currency', t, c.caster, rateNow(api, w) * 5);
      }
      if (total <= 0) return { error: 'Nobody had income or coins to pay rent.' };
      api.feed(`${api.name(c.caster)} collected ${fmt(total)} coins of ground rent.`, 'info');
    },
  },
  {
    id: 'festival-workshop.discount',
    name: 'Festival Discount',
    category: 'economy',
    description: 'For 30 seconds, half of every coin you spend on building, replacing or upgrading stations comes straight back.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 20,
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const spent = -(d[fx.caster] ?? 0);
          if (spent < MIN_SPEND) return;
          const back = Math.round(spent / 2);
          d[fx.caster]! += back;
          api.feed(`Festival Discount: ${fmt(back)} coins came back.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Half price', tone: 'good' }),
  },
  {
    id: 'festival-workshop.price-gouging',
    name: 'Workshop Price Gouging',
    category: 'troll',
    description: 'For 20 seconds an opponent pays 50% more for stations and upgrades: the extra is taken from their coins straight after each purchase (as many as they have left).',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          const spent = -(d[t] ?? 0);
          if (spent < MIN_SPEND) return;
          const extra = Math.min(Math.round(spent / 2), Math.floor(api.get('currency', t)));
          if (extra <= 0) return;
          d[t]! -= extra;
          api.feed(`Workshop Price Gouging: that cost you ${fmt(extra)} coins more.`, 'bad', [t]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Prices +50%', tone: 'bad' }),
  },
  {
    id: 'festival-workshop.glim-lottery',
    name: 'Festival Glim Lottery',
    category: 'random',
    description: `Draw a Glim lottery ticket. Odds: ${odds([
      ['10 seconds of your income in coins and takings (at least 10)', 45],
      [`Overtime: ×${OVERTIME.mult} income for 30 seconds`, 30],
      ['a lock (the coins prize if you hold one or pranks are off)', 15],
      [`a random station of yours goes up a level (the coins prize if all are at level ${MAX_LEVEL})`, 10],
    ])}.`,
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const w = ws(api, c.caster)!;
      const coins = () => {
        const amount = Math.max(10, Math.round(rateNow(api, w) * 10));
        api.add('score', c.caster, amount);
        api.add('currency', c.caster, amount);
        return `+${fmt(amount)} coins`;
      };
      const prize = rollOdds(api, [
        ['coins', 45],
        ['overtime', 30],
        ['lock', 15],
        ['upgrade', 10],
      ] as const);
      let text: string;
      if (prize === 'overtime') {
        const now = api.now();
        change(api, [c.caster], () => void (w.overtimeUntil = Math.max(w.overtimeUntil ?? now, now) + OVERTIME.ms));
        text = 'Overtime for 30 seconds';
      } else if (prize === 'lock' && api.set('lock', c.caster, 1)) text = 'a lock';
      else if (prize === 'upgrade' && belowMax(w).length) {
        let up = '';
        change(api, [c.caster], () => void (up = upgradeOne(api, c.caster, api.rng.pick(belowMax(w)))));
        text = `your ${up}`;
      } else text = coins();
      api.feed(`Festival Glim Lottery: ${text}.`, 'good', [c.caster]);
    },
  },
];

/** Payday Freeze: cancel the payday this transaction paid the target, on both meters. */
function freezePayday(api: Api, fx: any, d: Record<string, number>) {
  const t = target(fx);
  const w = ws(api, t);
  const now = api.now();
  if (!w || (d[t] ?? 0) <= 0) return;
  let amount = 0;
  if (fx.data.at === now) amount = Number(fx.data.amount);
  else if (w.payday && w.payday.at === now && w.payday.amount > 0) {
    amount = w.payday.amount;
    fx.data.at = now;
    fx.data.amount = amount;
    // The payday card and the earnings breakdown say what really happened.
    w.fromPaydays = Math.max(0, w.fromPaydays - amount);
    w.payday = { ...w.payday, amount: 0, notes: [...w.payday.notes, `frozen by ${api.name(fx.caster)}`] };
    if (w.stream.last?.text) w.stream.last.text = w.stream.last.text.replace(/^Payday: \+[\d,]+ coins( \([^)]*\))?/, `Payday frozen by ${api.name(fx.caster)}'s chaos`);
    api.feed(`Festival Payday Freeze: your ${fmt(amount)} coin payday was cancelled.`, 'bad', [t]);
  }
  if (amount > 0) d[t] = Math.max(0, d[t]! - amount);
}

const locks: CheatDef[] = [
  {
    id: 'festival-workshop.lock-pick',
    name: 'Workshop Lock Pick',
    category: 'troll',
    description: 'Break an opponent’s lock, so the next prank on them lands.',
    target: 'opponent',
    needs: ['pranks'],
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (!api.get('lock', t)) return { error: `${api.name(t)} holds no lock.` };
      api.set('lock', t, 0);
      api.feed(`${api.name(c.caster)} picked your lock.`, 'bad', [t]);
    },
  },
  {
    id: 'festival-workshop.spare-lock',
    name: 'Spare Workshop Lock',
    category: 'advantage',
    description: 'Gain a lock if you hold none: it blocks the next prank on you, then breaks.',
    target: 'self',
    needs: ['pranks'],
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    apply: (api, c) => (api.set('lock', c.caster, 1) ? undefined : { error: 'You already hold a lock.' }),
  },
  {
    id: 'festival-workshop.pass-lock',
    name: 'Pass the Workshop Lock',
    category: 'advantage',
    description: 'Hand your lock to a teammate who holds none: it blocks the next prank on them instead of you.',
    target: 'teammate',
    hostile: false,
    needs: ['teams', 'pranks'],
    modes: M,
    cost: 10,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      if (!api.get('lock', c.caster)) return { error: 'You hold no lock to pass on.' };
      if (api.get('lock', t)) return { error: `${api.name(t)} already holds a lock.` };
      api.set('lock', c.caster, 0);
      api.set('lock', t, 1);
      api.feed(`${api.name(c.caster)} passed you their lock.`, 'good', [t]);
    },
  },
];

const favours: CheatDef[] = [
  {
    id: 'festival-workshop.favour-owed',
    name: 'Festival Favour Owed',
    category: 'economy',
    description: `Get a Festival Favour offer now, as on every fifth right answer: two different cards drawn by weight from the usual deck (${FAVOUR_ODDS}; no Prank or Lock when they cannot be played), with ${FAVOUR_OFFER_MS / 1000} seconds to choose. Your question waits for you.`,
    target: 'self',
    needs: ['favours'],
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const w = ws(api, c.caster)!;
      if (w.offer) return { error: 'Pick from the favours you have first.' };
      const deck = favourDeck(api, c.caster);
      const until = api.now() + FAVOUR_OFFER_MS;
      w.offer = { cards: drawFavours(deck, () => api.rng.next()), deck, until, prank: false };
      api.ctx.setTimer(`offer:${c.caster}`, until);
    },
  },
  {
    id: 'festival-workshop.reshuffle-favours',
    name: 'Reshuffled Festival Favours',
    category: 'economy',
    description: `Put back the two Festival Favour cards you are choosing from and draw two different ones from the same deck, by the usual weights (${FAVOUR_ODDS}). Refused if the deck holds only those two cards.`,
    target: 'self',
    needs: ['favours'],
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsOffer(api, c.caster, true);
      if (no) return no;
      const o = ws(api, c.caster)!.offer;
      if (o.prank) return { error: 'You are already choosing who to prank.' };
      if (o.deck.length <= o.cards.length) return { error: 'The deck holds no other cards.' };
      const cards = drawFavours(o.deck, () => api.rng.next());
      if ([...cards].sort().join() === [...o.cards].sort().join()) return { error: 'The deck dealt the same two cards. Try again.' };
      o.cards = cards;
      api.feed(`Reshuffled Festival Favours: ${cards.map((k: FavourKind) => FAVOURS[k].title).join(' or ')}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'festival-workshop.torn-cards',
    name: 'Torn Favour Cards',
    category: 'troll',
    description: 'Tear up the Festival Favour cards an opponent is choosing from: they get no favour this time and go back to their questions.',
    target: 'opponent',
    needs: ['favours'],
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsOffer(api, t, false);
      if (no) return no;
      closeOffer(api, t);
      api.feed(`${api.name(c.caster)} tore up your Festival Favour cards.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.card-snatch',
    name: 'Favour Card Snatch',
    category: 'troll',
    description: `Take the Festival Favour cards an opponent is choosing from: you choose one (with ${FAVOUR_OFFER_MS / 1000} seconds, as usual), and they go back to their questions. You must not have cards of your own open.`,
    target: 'opponent',
    needs: ['favours'],
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsOffer(api, t, false);
      if (no) return no;
      const me = ws(api, c.caster)!;
      if (me.offer) return { error: 'Pick from your own favours first.' };
      const o = ws(api, t)!.offer;
      const until = api.now() + FAVOUR_OFFER_MS;
      me.offer = { cards: [...o.cards], deck: [...o.deck], until, prank: false };
      api.ctx.setTimer(`offer:${c.caster}`, until);
      closeOffer(api, t);
      api.feed(`${api.name(c.caster)} snatched your Festival Favour cards.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.hurry-favour',
    name: 'Festival Favour Deadline',
    category: 'troll',
    description: 'An opponent choosing a Festival Favour has only 3 seconds left. If they do not choose, the first card is taken for them (a prank goes to the biggest takings), as usual when time runs out.',
    target: 'opponent',
    needs: ['favours'],
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsOffer(api, t, false);
      if (no) return no;
      const o = ws(api, t)!.offer;
      const at = api.now() + 3000;
      if (o.until <= at) return { error: `${api.name(t)} has less than 3 seconds left anyway.` };
      o.until = at;
      api.ctx.setTimer(`offer:${t}`, at);
      api.feed(`${api.name(c.caster)} rushed you: 3 seconds to pick a favour.`, 'bad', [t]);
    },
  },
];

const market: CheatDef[] = [
  {
    id: 'festival-workshop.rig-market',
    name: 'Rig the Festival Market',
    category: 'economy',
    description: 'The goods you choose jump to the top price (×1.6, or ×2 while the market is wide) or crash to the bottom (×0.6, or ×0.4) until the next market shift, when the market sets its own prices again. Fireworks in the finale keep their finale price.',
    target: 'room',
    modes: M,
    params: [
      { key: 'goods', label: 'Goods', kind: 'choice', options: GOODS.map((g) => ({ value: g, label: GOODS_INFO[g].label })), default: 'lanterns' },
      {
        key: 'way',
        label: 'Price',
        kind: 'choice',
        options: [
          { value: 'up', label: 'Top price' },
          { value: 'down', label: 'Bottom price' },
        ],
        default: 'up',
      },
    ],
    cost: 40,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const g = String(c.params.goods) as Goods;
      const range = MARKET[wideAt(api, api.now()) ? 'wide' : 'normal'];
      const price = c.params.way === 'down' ? range.min : range.max;
      if (api.s.finale && g === 'fireworks') return { error: 'Fireworks sell at the finale price until closing time.' };
      if (api.s.market.demand[g] === price) return { error: `${GOODS_INFO[g].label} already sell at ×${price}.` };
      changeAll(api, () => void (api.s.market.demand = { ...api.s.market.demand, [g]: price }));
      api.feed(`${api.name(c.caster)} rigged the market: ${GOODS_INFO[g].many} sell at ×${price} until the next shift.`, 'big');
    },
  },
  {
    id: 'festival-workshop.market-bell',
    name: 'Festival Market Bell',
    category: 'round',
    description: 'The market shifts now, by its usual rule: each price follows how much of the class’s goods it makes up, with the usual random nudge. The next scheduled shift still comes on time.',
    target: 'room',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const was = JSON.stringify(api.s.market.demand);
      const now = api.now();
      changeAll(api, () => {
        reprice(api, now, wideAt(api, now));
        api.s.market.shifts++;
      });
      if (JSON.stringify(api.s.market.demand) === was) return { error: 'The market would not move right now.' };
      api.feed(`${api.name(c.caster)} rang the market bell: ${marketLine(api)}.`, 'big');
    },
  },
  {
    id: 'festival-workshop.price-freeze',
    name: 'Festival Price Freeze',
    category: 'round',
    description: 'The next market shift is put off by 30 seconds, so the prices now hold longer. Never past closing time.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const at = api.s.market.shiftAt;
      if (at === null) return { error: 'No more market shifts are coming.' };
      if (at + 30_000 >= api.s.endsAt) return { error: 'The workshop closes before the shift could come.' };
      api.s.market.shiftAt = at + 30_000;
      api.ctx.setTimer('shift', at + 30_000);
      api.feed(`${api.name(c.caster)} froze the market: the next shift comes 30 seconds later.`, 'info');
    },
  },
  {
    id: 'festival-workshop.summon-event',
    name: 'Workshop Event Herald',
    category: 'round',
    description:
      'Start the festival event you choose now, for its usual 30 seconds: a parade order (for goods someone makes, each equally likely), rush hour, lucky sparks, a market swing or a Glim tea break (only when someone has Glim Helpers; with Rush Orders on, only parades). Not while another event is on, and only if it ends before the finale. The next scheduled event waits until it is over.',
    target: 'room',
    needs: ['events'],
    modes: M,
    params: [{ key: 'event', label: 'Event', kind: 'choice', options: EVENT_ORDER.map((k) => ({ value: k, label: EVENTS[k].title })), default: 'rush' }],
    cost: 45,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const kind = String(c.params.event) as EventKind;
      const s = api.s;
      if (s.event) return { error: `${EVENTS[s.event.kind as EventKind].title} is on right now.` };
      if (cfg(api).rush && kind !== 'parade') return { error: 'Rush Orders: every festival event is a parade order.' };
      const at = api.now();
      const endsAt = at + EVENT_TIMING.lengthMs;
      if (endsAt > eventLimit(api)) return { error: 'There is not enough time before the finale.' };
      const helpers = present(api).some(([, w]) => w.slots.some((st: any) => st?.kind === 'helpers'));
      if (kind === 'tea' && !helpers) return { error: 'Nobody has Glim Helpers, so a tea break would do nothing.' };
      let line = '';
      changeAll(api, () => {
        s.events++;
        const ev = { kind, startedAt: at, endsAt, goods: null as Goods | null, target: 0, seq: s.events };
        if (kind === 'parade') {
          const made = GOODS.filter((g) => present(api).some(([, w]) => w.slots.some((st: any) => st && STATIONS[st.kind as StationKind].goods === g)));
          const goods = api.rng.pick(paradeChoices(made));
          ev.goods = goods;
          ev.target = paradeTarget(goods, present(api).length);
          for (const w of Object.values(s.workshops) as Workshop[]) w.contribution = 0;
          line = `a parade order for ${GOODS_INFO[goods].many}: make ${fmt(ev.target)} coins' worth together in 30 seconds`;
        } else if (kind === 'swing') {
          s.swingUntil = endsAt;
          s.event = ev;
          reprice(api, at, true);
          line = `a market swing: prices jump between ×${MARKET.wide.min} and ×${MARKET.wide.max} for 30 seconds`;
        } else line = `${EVENTS[kind].title} (${EVENTS[kind].text.slice(0, -1)})`;
        s.event = ev;
      });
      api.ctx.setTimer('eventEnd', endsAt);
      pushNextEvent(api, endsAt);
      api.feed(`${api.name(c.caster)} called ${line}.`, 'big');
    },
  },
  {
    id: 'festival-workshop.early-bell',
    name: 'Festival Early Bell',
    category: 'round',
    description: 'The festival event running now ends at once, exactly as if its time had run out: a parade order is judged on what has been made so far (top makers paid, everyone boosted if the target is met), and a market swing’s prices stay until the next shift. Not if judging the parade would take someone to the takings goal.',
    target: 'room',
    needs: ['events'],
    modes: M,
    cost: 35,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsEvent(api);
      if (no) return no;
      const s = api.s;
      const ev = s.event;
      const now = api.now();
      const conf = cfg(api);
      settleAll(s, now, conf);
      if (ev.kind === 'parade' && conf.goal > 0) {
        const seconds = paradeSeconds(api);
        if (paradeMakers(api).slice(0, PARADE.rewarded).some(([, w]) => w.takings + Math.max(1, Math.round(w.rate * seconds)) >= conf.goal)) {
          return { error: 'Judging the parade now would decide the game.' };
        }
      }
      ev.endsAt = now;
      changeAll(api, () => {
        if (ev.kind === 'parade' && ev.goods) finishParade(api, ev, now);
        if (ev.kind === 'swing') s.swingUntil = null;
        s.lastEvent = ev.kind;
        s.event = null;
      });
      api.ctx.clearTimer('eventEnd');
      api.feed(`${api.name(c.caster)} rang the early bell: ${EVENTS[ev.kind as EventKind].title} is over.`, 'big');
    },
  },
  {
    id: 'festival-workshop.encore-hour',
    name: 'Festival Encore',
    category: 'round',
    description: 'The festival event running now lasts 15 seconds longer, if it still ends before the finale. A parade order keeps its target. The next scheduled event waits until it is over.',
    target: 'room',
    needs: ['events'],
    modes: M,
    cost: 30,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsEvent(api);
      if (no) return no;
      const ev = api.s.event;
      const endsAt = ev.endsAt + 15_000;
      if (endsAt > eventLimit(api)) return { error: 'The event would run into the finale.' };
      ev.endsAt = endsAt;
      if (ev.kind === 'swing') api.s.swingUntil = endsAt;
      api.ctx.setTimer('eventEnd', endsAt);
      pushNextEvent(api, endsAt);
      api.feed(`${api.name(c.caster)} called an encore: ${EVENTS[ev.kind as EventKind].title} lasts 15 seconds longer.`, 'big');
    },
  },
  {
    id: 'festival-workshop.parade-poach',
    name: 'Parade Poach',
    category: 'troll',
    description: 'During a parade order, half of what an opponent has made for the parade so far counts as yours instead. The class total stays the same, but it can move you up among the top makers who get paid.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const no = needsParade(api);
      if (no) return no;
      const t = target(c);
      const have = api.get('parade', t);
      if (have <= 0) return { error: `${api.name(t)} has made nothing for the parade yet.` };
      const got = transfer(api, 'parade', t, c.caster, have / 2);
      api.feed(`${api.name(c.caster)} poached ${fmt(got)} coins' worth of your parade goods.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'festival-workshop.short-parade',
    name: 'Shorter Parade Route',
    category: 'round',
    description: 'The parade order running now needs a quarter less: its class target drops by 25%.',
    target: 'room',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsParade(api);
      if (no) return no;
      const ev = api.s.event;
      const was = ev.target;
      ev.target = Math.max(1, Math.round(was * 0.75));
      if (ev.target === was) return { error: 'The parade target cannot get any smaller.' };
      api.feed(`${api.name(c.caster)} shortened the parade route: the class needs ${fmt(ev.target)} coins' worth instead of ${fmt(was)}.`, 'big');
    },
  },
];

const cheats: CheatDef[] = [...stations, ...money, ...locks, ...favours, ...market];

for (const c of cheats) if (!c.modes || c.modes.length !== 1 || c.modes[0] !== MODE || !c.id.startsWith(`${MODE}.`)) throw new Error(`${c.id} is not a ${MODE} cheat`);
defineCheats(cheats);
