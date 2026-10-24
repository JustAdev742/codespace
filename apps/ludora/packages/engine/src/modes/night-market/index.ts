/*
 * Night Market: answer right, pick one of three mystery lanterns, and run the
 * richest stall when the market closes.
 *
 * A right answer opens an offer of three lanterns, each drawn on its own by
 * kind weight. Players see each lantern's kind (its colour, icon and word),
 * never its contents unless Lantern Sight is on, so the pick is a real choice.
 * Contents are decided when the offer is made and kept out of every view;
 * amounts are worked out when a lantern opens, with the event running then.
 *
 * Swipes and swaps need a target. The player has TRICK_CHOOSE_SEC to choose,
 * then the trick goes to the richest player they may trick. While an offer or
 * a target choice is open, the player has no question.
 *
 * Market events run for 30 seconds every 90 seconds from the first minute, and
 * the last 45 seconds are always Last Call. Which event comes next is only
 * decided when it starts, so no view can show it early.
 */
import { z } from 'zod';
import { answerSchema, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  EVENT_INFO,
  EVENT_TIMING,
  EVENT_WEIGHTS,
  FORTUNE_ODDS,
  LANTERN_KINDS,
  LEVEL_EVERY,
  LUCKY_CHARGES,
  LUCKY_MAX,
  MARKET_EVENTS,
  NO_TARGET_COINS,
  OFFER_SIZE,
  SHIELD_REFUND,
  SWIPE_MIN,
  TARGET_LIST_MAX,
  TOLL,
  TRICK_CHOOSE_SEC,
  TRICK_GUARD_SEC,
  meta,
  settings,
  type ContentId,
  type LanternKind,
  type MarketEventId,
} from './meta.ts';
import { contentWeights, fortuneMultiplier, kindWeights, levelMultiplier, stallLevel, swipePercent, toNextLevel, wildGrowMin, wildGrowth, wildLossPercent, type OddsMoment } from './odds.ts';

type Settings = {
  tricks: boolean;
  events: boolean;
  goalCoins: number;
  greed: string;
  trickOdds: string;
  wildness: string;
  fog: boolean;
};

interface Lantern {
  kind: LanternKind;
  content: ContentId;
}

interface Offer {
  seq: number;
  lanterns: Lantern[];
  /** Lantern Sight: this offer shows what is inside. */
  sight: boolean;
  /** The second pick of a Lantern Rain answer. */
  bonus: boolean;
}

interface Pending {
  seq: number;
  content: ContentId;
  /** Game time the choice closes and the trick goes to the richest player it may. */
  deadline: number;
}

/** The last lantern a player opened, for their result card. */
interface Opened {
  seq: number;
  at: number;
  kind: LanternKind;
  content: ContentId;
  /** Coins this lantern changed for its opener (once a trick has found its target). */
  delta: number;
  title: string;
  detail: string | null;
  /** A swipe or swap still waiting for its target. */
  waiting: boolean;
  /** The trick hit a shield. */
  blocked: boolean;
  /** A jackpot, a double or a big win: worth a fanfare. */
  big: boolean;
}

interface Note {
  id: number;
  at: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
  /** What happened, so a screen can pick an icon and a sound without reading the words. */
  icon: 'swipe' | 'swap' | 'shield' | 'toll' | 'level';
  /** Something this player did (their result card already said so), not something done to them. */
  mine: boolean;
}

interface Stall {
  stream: StreamState;
  coins: number;
  shield: boolean;
  /** Lantern Sight: the next offer shows what is inside. */
  sight: boolean;
  /** Fortune lanterns a Lucky Streak still doubles. */
  lucky: number;
  offer: Offer | null;
  pending: Pending | null;
  /** Lantern Rain: picks still to come from the last right answer. */
  extraPicks: number;
  lastTarget: PlayerId | null;
  /** Game time until which nobody can swipe or swap this stall (it was just tricked). */
  guardUntil: number;
  opened: Opened | null;
  notes: Note[];
  seq: number;
  opens: number;
  /** The most coins one lantern gave this stall. */
  best: number;
}

type NewsKind = 'jackpot' | 'double' | 'coins' | 'swipe' | 'swap' | 'block' | 'toll' | 'wildWin' | 'wildLoss' | 'goal';

/** A big play for the market news on the big screen. */
interface News {
  id: number;
  at: number;
  kind: NewsKind;
  by: PlayerId;
  to: PlayerId | null;
  amount: number;
  trick: 'swipe' | 'swap' | null;
}

interface MarketEvent {
  id: MarketEventId;
  startedAt: number;
  endsAt: number;
}

interface State {
  stalls: Record<PlayerId, Stall>;
  endsAt: number;
  /** When Last Call starts, or null with events off. */
  lastCallAt: number | null;
  event: MarketEvent | null;
  /** When the next 30-second event starts, or null when no more will run. */
  nextEventAt: number | null;
  lastEvent: MarketEventId | null;
  news: News[];
  seq: number;
  /** Lanterns opened in the whole market, by kind. */
  opened: Record<LanternKind, number>;
  tricks: number;
  biggestSwipe: { by: PlayerId; from: PlayerId; amount: number } | null;
  winner: PlayerId | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('pick'), offer: z.number().int().min(0), index: z.number().int().min(0).max(OFFER_SIZE - 1) }),
  z.object({ type: z.literal('target'), playerId: z.string().min(1).max(64) }),
]);
type Action = z.infer<typeof action>;

/** Used when the host sets no time limit: the market always closes. */
const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const NEWS_KEEP = 8;
const NOTES_KEEP = 4;
/** Swipes of at least this many coins are announced to the whole room. */
const BIG_SWIPE = 100;
/** Wild results of at least this many coins make the market news. */
const BIG_WILD = 100;
/** Fortune lanterns worth at least this many coins make the market news. */
const BIG_FORTUNE = 200;
/** Tolls and swipes smaller than these stay off the market news, so it keeps to the big plays. */
const NEWS_TOLL = 50;
const NEWS_SWIPE = 15;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const coinsText = (n: number) => `${fmt(n)} ${Math.round(n) === 1 ? 'coin' : 'coins'}`;
const signed = (n: number) => (n < 0 ? `−${fmt(-n)}` : `+${fmt(n)}`);

function nameOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function teamOf(ctx: ModeContext, id: PlayerId) {
  return (ctx.player(id) ?? ctx.everyone().find((p) => p.id === id))?.teamId ?? null;
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function newStall(ctx: ModeContext): Stall {
  return { stream: streamInit(ctx), coins: 0, shield: false, sight: false, lucky: 0, offer: null, pending: null, extraPicks: 0, lastTarget: null, guardUntil: 0, opened: null, notes: [], seq: 0, opens: 0, best: 0 };
}

/** Pick one row by weight. Rows with no weight are never picked. */
function pickWeighted<T extends { weight: number }>(rows: readonly T[], rng: Rng): T {
  const live = rows.filter((r) => r.weight > 0);
  const total = live.reduce((n, r) => n + r.weight, 0);
  let roll = rng.next() * total;
  for (const r of live) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return live[live.length - 1]!;
}

/** Everyone a player may trick or charge a toll: the others in the game, but never teammates. */
function rivals(s: State, ctx: ModeContext, id: PlayerId): EnginePlayer[] {
  const team = ctx.teams().length ? teamOf(ctx, id) : null;
  return ctx.players().filter((p) => p.id !== id && s.stalls[p.id] && !(team !== null && p.teamId === team));
}

/** Why a rival cannot be tricked right now: tricked by this player last time, or just tricked by anyone. */
function blockedBy(s: State, ctx: ModeContext, id: PlayerId, target: PlayerId): 'last' | 'guard' | null {
  if (s.stalls[id]?.lastTarget === target) return 'last';
  if ((s.stalls[target]?.guardUntil ?? 0) > ctx.now()) return 'guard';
  return null;
}

/**
 * Who a swipe or swap may go to: rivals, except the player this one tricked
 * last time and stalls that were just tricked. When that leaves nobody, the
 * rules relax (the guard first, then "not twice in a row"), so a small game
 * never runs out of targets.
 */
function trickable(s: State, ctx: ModeContext, id: PlayerId): EnginePlayer[] {
  const all = rivals(s, ctx, id);
  const now = ctx.now();
  const last = s.stalls[id]?.lastTarget;
  const unguarded = (p: EnginePlayer) => (s.stalls[p.id]?.guardUntil ?? 0) <= now;
  for (const keep of [(p: EnginePlayer) => p.id !== last && unguarded(p), (p: EnginePlayer) => p.id !== last, unguarded]) {
    const open = all.filter(keep);
    if (open.length) return open;
  }
  return all;
}

/** Tricks can be played by somebody right now. */
function tricksPossible(s: State, ctx: ModeContext<Settings>) {
  return ctx.settings.tricks && ctx.players().some((p) => s.stalls[p.id] && rivals(s, ctx, p.id).length > 0);
}

function moment(s: State, ctx: ModeContext<Settings>, id: PlayerId): OddsMoment {
  const st = s.stalls[id]!;
  return {
    settings: ctx.settings,
    event: s.event?.id ?? null,
    tricksLive: ctx.settings.tricks && rivals(s, ctx, id).length > 0,
    level: stallLevel(st.stream.correct),
    lucky: st.lucky,
  };
}

function richestFirst(s: State) {
  return (a: EnginePlayer, b: EnginePlayer) => s.stalls[b.id]!.coins - s.stalls[a.id]!.coins || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function note(s: State, st: Stall, at: number, text: string, tone: Note['tone'], icon: Note['icon'], mine = false) {
  st.notes = [{ id: ++s.seq, at, text, tone, icon, mine }, ...st.notes].slice(0, NOTES_KEEP);
}

function addNews(s: State, at: number, item: Omit<News, 'id' | 'at'>) {
  s.news = [{ id: ++s.seq, at, ...item }, ...s.news].slice(0, NEWS_KEEP);
}

/* --------------------------------- offers --------------------------------- */

/**
 * What each player pays a toll, given their coins: TOLL.percent of their
 * coins, at most TOLL.max each; when that adds up to more than TOLL.total,
 * everyone's share shrinks in proportion (rounded down).
 */
export function tollPayments(coins: readonly number[]): number[] {
  const asked = coins.map((c) => Math.min(TOLL.max, Math.round((Math.max(0, c) * TOLL.percent) / 100)));
  const sum = asked.reduce((n, x) => n + x, 0);
  return sum <= TOLL.total ? asked : asked.map((x) => Math.floor((x * TOLL.total) / sum));
}

/** One lantern for an offer: a kind by the kind weights of the moment, then what is inside by that kind's table. */
export function drawLantern(m: OddsMoment, rng: Rng): Lantern {
  const weights = kindWeights(m);
  const kind = pickWeighted(
    LANTERN_KINDS.map((k) => ({ kind: k, weight: weights[k] })),
    rng,
  ).kind;
  return { kind, content: pickWeighted(contentWeights(kind, m), rng).id };
}

function makeOffer(s: State, ctx: ModeContext<Settings>, id: PlayerId, bonus: boolean) {
  const st = s.stalls[id]!;
  const m = moment(s, ctx, id);
  // Each of the three is drawn on its own, so three of a kind can happen.
  const lanterns = Array.from({ length: OFFER_SIZE }, () => drawLantern(m, ctx.rng));
  st.offer = { seq: ++st.seq, lanterns, sight: st.sight, bonus };
  st.sight = false;
}

/** After a lantern (and its trick) is done: the second Lantern Rain pick, or the next question. */
function moveOn(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const st = s.stalls[id];
  if (!st || s.winner) return;
  if (st.extraPicks > 0) {
    st.extraPicks--;
    makeOffer(s, ctx, id, true);
    return;
  }
  streamNext(st.stream, ctx);
}

/** The first player to reach the goal wins on the spot. */
function checkGoal(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const goal = ctx.settings.goalCoins;
  const st = s.stalls[id];
  if (!goal || s.winner || !st || st.coins < goal) return;
  s.winner = id;
  addNews(s, ctx.now(), { kind: 'goal', by: id, to: null, amount: st.coins, trick: null });
  ctx.feed(`${nameOf(ctx, id)} reached ${coinsText(goal)}.`, { tone: 'big' });
  ctx.endGame();
}

/* ------------------------------ opening lanterns ----------------------------- */

function boostDetail(event: MarketEventId | null, lucky: boolean, levelUp: number | null): string | null {
  const parts: string[] = [];
  if (event === 'golden' || event === 'lastCall') parts.push(`${EVENT_INFO[event].label} paid double.`);
  if (lucky) parts.push('Lucky Streak paid double.');
  if (levelUp) parts.push(`Stall level ${levelUp} bonus.`);
  return parts.length ? parts.join(' ') : null;
}

function openFortune(s: State, ctx: ModeContext<Settings>, id: PlayerId, content: ContentId, m: OddsMoment): Omit<Opened, 'seq' | 'at' | 'kind' | 'content'> {
  const st = s.stalls[id]!;
  const row = FORTUNE_ODDS.find((r) => r.id === content)!;
  // Doubling (Golden Hour, Last Call, a Lucky Streak) and the stall level only touch flat amounts:
  // a share of your coins already grows with you, and doubling it again would decide the game in one lantern.
  const flat = row.coins !== undefined;
  const mult = flat ? fortuneMultiplier(m.event, m.lucky) : 1;
  const base = flat ? row.coins! * levelMultiplier(m.level) : Math.max(row.min ?? 0, (st.coins * (row.percent ?? 0)) / 100);
  const gain = Math.round(base * mult);
  const lucky = flat && st.lucky > 0;
  if (lucky) st.lucky--;
  st.coins += gain;
  const name = nameOf(ctx, id);
  const at = ctx.now();
  let title = `+${coinsText(gain)}`;
  let detail = flat ? boostDetail(m.event, lucky, m.level > 1 ? m.level : null) : null;
  let big = false;
  if (content === 'jackpot') {
    title = `Jackpot: +${coinsText(gain)}`;
    big = true;
    addNews(s, at, { kind: 'jackpot', by: id, to: null, amount: gain, trick: null });
    ctx.feed(`${name} found a jackpot: +${coinsText(gain)}.`, { tone: 'big' });
  } else if (content === 'double') {
    title = `Double: +${coinsText(gain)}`;
    big = true;
    addNews(s, at, { kind: 'double', by: id, to: null, amount: gain, trick: null });
    ctx.feed(`${name}’s coins doubled: +${fmt(gain)}.`, { tone: 'big' });
  } else {
    if (content === 'quarter') detail = `${String(row.percent ?? 0)}% of your coins.`;
    if (gain >= BIG_FORTUNE) {
      big = true;
      addNews(s, at, { kind: 'coins', by: id, to: null, amount: gain, trick: null });
    }
  }
  return { delta: gain, title, detail, waiting: false, blocked: false, big };
}

function openWild(s: State, ctx: ModeContext<Settings>, id: PlayerId, content: ContentId, m: OddsMoment): Omit<Opened, 'seq' | 'at' | 'kind' | 'content'> {
  const st = s.stalls[id]!;
  const at = ctx.now();
  if (content === 'grow') {
    const growth = wildGrowth(ctx.settings.wildness, m.event);
    const gain = Math.max(wildGrowMin(ctx.settings.wildness), Math.round(st.coins * (growth - 1)));
    st.coins += gain;
    if (gain >= BIG_WILD) addNews(s, at, { kind: 'wildWin', by: id, to: null, amount: gain, trick: null });
    return { delta: gain, title: `Coins ×${String(growth)}: +${coinsText(gain)}`, detail: m.event === 'winds' ? 'Wild Winds made it bigger.' : null, waiting: false, blocked: false, big: gain >= BIG_WILD };
  }
  const pct = wildLossPercent(ctx.settings.wildness, content as 'loseSmall' | 'loseBig');
  const loss = Math.round((st.coins * pct) / 100);
  st.coins -= loss;
  if (loss >= BIG_WILD) addNews(s, at, { kind: 'wildLoss', by: id, to: null, amount: -loss, trick: null });
  return { delta: -loss, title: loss ? `Lost ${String(pct)}%: −${coinsText(loss)}` : `Lost ${String(pct)}%, but you had nothing to lose`, detail: null, waiting: false, blocked: false, big: false };
}

function openTrick(s: State, ctx: ModeContext<Settings>, id: PlayerId, content: ContentId, seq: number): Omit<Opened, 'seq' | 'at' | 'kind' | 'content'> {
  const st = s.stalls[id]!;
  const at = ctx.now();
  const name = nameOf(ctx, id);
  if (content === 'toll') {
    let total = 0;
    let payers = 0;
    const from = rivals(s, ctx, id);
    const pays = tollPayments(from.map((p) => s.stalls[p.id]!.coins));
    from.forEach((p, i) => {
      const payer = s.stalls[p.id]!;
      const pay = pays[i]!;
      if (pay <= 0) return;
      payer.coins -= pay;
      total += pay;
      payers++;
      note(s, payer, at, `${name}’s toll took ${coinsText(pay)} from you.`, 'bad', 'toll');
    });
    st.coins += total;
    s.tricks++;
    if (total > 0) {
      if (total >= NEWS_TOLL) addNews(s, at, { kind: 'toll', by: id, to: null, amount: total, trick: null });
      // Everyone paid, but only a big toll is worth a line for the whole room; the payers each get a note.
      ctx.feed(`${name} rang the toll bell and collected ${coinsText(total)}.`, total >= BIG_SWIPE ? { tone: 'big' } : { tone: 'info', to: [id] });
    }
    return {
      delta: total,
      title: total ? `Toll: +${coinsText(total)}` : 'Toll: nobody had coins to pay',
      detail: payers ? `${String(payers)} ${payers === 1 ? 'player' : 'players'} paid you.` : null,
      waiting: false,
      blocked: false,
      big: total >= BIG_SWIPE,
    };
  }
  if (!trickable(s, ctx, id).length) {
    st.coins += NO_TARGET_COINS;
    return { delta: NO_TARGET_COINS, title: `Nobody to trick: +${coinsText(NO_TARGET_COINS)}`, detail: 'Everyone you could trick has left the market.', waiting: false, blocked: false, big: false };
  }
  const deadline = at + TRICK_CHOOSE_SEC * 1000;
  st.pending = { seq, content, deadline };
  ctx.setTimer(`trick:${id}`, deadline);
  const swap = content === 'swap';
  return {
    delta: 0,
    title: swap ? 'Swap' : `Swipe ${String(swipePercent(ctx.settings.greed, content as 'swipe1'))}%`,
    detail: swap ? 'Choose who to swap coins with.' : 'Choose who to swipe from.',
    waiting: true,
    blocked: false,
    big: false,
  };
}

function openCharm(s: State, ctx: ModeContext<Settings>, id: PlayerId, content: ContentId): Omit<Opened, 'seq' | 'at' | 'kind' | 'content'> {
  const st = s.stalls[id]!;
  const plain = { waiting: false, blocked: false, big: false };
  if (content === 'shield') {
    if (st.shield) {
      st.coins += SHIELD_REFUND;
      return { delta: SHIELD_REFUND, title: `+${coinsText(SHIELD_REFUND)}`, detail: 'You already hold a shield, so this one became coins.', ...plain };
    }
    st.shield = true;
    return { delta: 0, title: 'Shield ready', detail: 'It blocks the next swipe or swap played on you.', ...plain };
  }
  if (content === 'sight') {
    st.sight = true;
    return { delta: 0, title: 'Lantern Sight', detail: 'Your next three lanterns show what is inside.', ...plain };
  }
  st.lucky = Math.min(LUCKY_MAX, st.lucky + LUCKY_CHARGES);
  return { delta: 0, title: 'Lucky Streak', detail: `Your next ${String(st.lucky)} Fortune lanterns pay double.`, ...plain };
}

function openLantern(s: State, ctx: ModeContext<Settings>, id: PlayerId, lantern: Lantern, seq: number) {
  const st = s.stalls[id]!;
  // The moment is read before the lantern changes anything (a Lucky Streak charge, say).
  const m = moment(s, ctx, id);
  const at = ctx.now();
  st.opens++;
  s.opened[lantern.kind]++;
  const result =
    lantern.kind === 'fortune'
      ? openFortune(s, ctx, id, lantern.content, m)
      : lantern.kind === 'wild'
        ? openWild(s, ctx, id, lantern.content, m)
        : lantern.kind === 'trick'
          ? openTrick(s, ctx, id, lantern.content, seq)
          : openCharm(s, ctx, id, lantern.content);
  st.opened = { seq, at, kind: lantern.kind, content: lantern.content, ...result };
  st.best = Math.max(st.best, result.delta);
  checkGoal(s, ctx, id);
}

/* --------------------------------- tricks --------------------------------- */

function playTrick(s: State, ctx: ModeContext<Settings>, id: PlayerId, targetId: PlayerId, auto: boolean) {
  const st = s.stalls[id]!;
  const target = s.stalls[targetId]!;
  const pending = st.pending!;
  const at = ctx.now();
  ctx.clearTimer(`trick:${id}`);
  st.pending = null;
  st.lastTarget = targetId;
  target.guardUntil = at + TRICK_GUARD_SEC * 1000;
  s.tricks++;
  const me = nameOf(ctx, id);
  const them = nameOf(ctx, targetId);
  const swap = pending.content === 'swap';
  const word = swap ? 'swap' : 'swipe';
  const autoNote = auto ? `Time ran out, so it went to ${them}, the richest player you could trick.` : null;
  const finish = (delta: number, title: string, detail: string | null, blocked = false) => {
    if (st.opened && st.opened.seq === pending.seq) st.opened = { ...st.opened, delta, title, detail, waiting: false, blocked, big: !blocked && delta >= BIG_SWIPE };
    st.best = Math.max(st.best, delta);
  };

  if (target.shield) {
    const calm = s.event?.id === 'calm';
    if (!calm) target.shield = false;
    note(s, target, at, `Your shield blocked ${me}’s ${word}.${calm ? ' Calm Night kept it whole.' : ''}`, 'good', 'shield');
    note(s, st, at, `${them}’s shield blocked your ${word}.`, 'bad', 'shield', true);
    addNews(s, at, { kind: 'block', by: id, to: targetId, amount: 0, trick: swap ? 'swap' : 'swipe' });
    ctx.feed(`${them}’s shield blocked ${me}’s ${word}.`, { tone: 'info', to: [id, targetId] });
    finish(0, `${them}’s shield blocked your ${word}`, [autoNote, calm ? 'Calm Night: their shield held.' : 'Their shield broke.'].filter(Boolean).join(' '), true);
    return;
  }

  if (swap) {
    const mine = st.coins;
    st.coins = target.coins;
    target.coins = mine;
    const delta = st.coins - mine;
    note(s, target, at, delta > 0 ? `${me} swapped coins with you: you lost ${coinsText(delta)}.` : delta < 0 ? `${me} swapped coins with you: you gained ${coinsText(-delta)}.` : `${me} swapped coins with you. You had the same.`, delta > 0 ? 'bad' : 'good', 'swap');
    note(s, st, at, `You swapped coins with ${them}: ${signed(delta)}.`, delta >= 0 ? 'good' : 'bad', 'swap', true);
    addNews(s, at, { kind: 'swap', by: id, to: targetId, amount: delta, trick: 'swap' });
    ctx.feed(`${me} swapped coins with ${them}.`, { tone: 'big' });
    finish(delta, delta === 0 ? `Swapped with ${them}: no change` : `Swapped with ${them}: ${signed(delta)} coins`, autoNote);
    checkGoal(s, ctx, id);
    checkGoal(s, ctx, targetId);
    return;
  }

  const pct = swipePercent(ctx.settings.greed, pending.content as 'swipe1');
  const amount = Math.min(target.coins, Math.max(SWIPE_MIN, Math.round((target.coins * pct) / 100)));
  target.coins -= amount;
  st.coins += amount;
  note(s, target, at, `${me} swiped ${coinsText(amount)} from you.`, 'bad', 'swipe');
  note(s, st, at, `You swiped ${coinsText(amount)} from ${them}.`, 'good', 'swipe', true);
  if (amount > (s.biggestSwipe?.amount ?? 0)) s.biggestSwipe = { by: id, from: targetId, amount };
  if (amount >= NEWS_SWIPE) addNews(s, at, { kind: 'swipe', by: id, to: targetId, amount, trick: 'swipe' });
  ctx.feed(`${me} swiped ${coinsText(amount)} from ${them}.`, amount >= BIG_SWIPE ? { tone: 'big' } : { tone: 'info', to: [id, targetId] });
  finish(amount, amount ? `Swiped ${coinsText(amount)} from ${them}` : `${them} had no coins to swipe`, autoNote);
  checkGoal(s, ctx, id);
}

/** The choice ran out or the player left: the trick goes to the richest player they may trick. */
function autoTrick(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const st = s.stalls[id];
  if (!st?.pending) return;
  const target = trickable(s, ctx, id).sort(richestFirst(s))[0];
  if (target) {
    playTrick(s, ctx, id, target.id, true);
    return;
  }
  // Everyone it could reach has gone: a small consolation instead.
  ctx.clearTimer(`trick:${id}`);
  const seq = st.pending.seq;
  st.pending = null;
  st.coins += NO_TARGET_COINS;
  if (st.opened && st.opened.seq === seq) st.opened = { ...st.opened, delta: NO_TARGET_COINS, title: `Nobody to trick: +${coinsText(NO_TARGET_COINS)}`, detail: 'Everyone you could trick has left the market.', waiting: false };
  checkGoal(s, ctx, id);
}

/* ------------------------------ market events ----------------------------- */

const EVENT_LINES: Record<MarketEventId, string> = {
  golden: 'Golden Hour: Fortune lanterns pay double for 30 seconds.',
  trickster: 'Trickster Moon: Trick lanterns are twice as likely for 30 seconds.',
  rain: 'Lantern Rain: every right answer gives two picks for 30 seconds.',
  calm: 'Calm Night: no Trick lanterns for 30 seconds, and shields cannot break.',
  winds: 'Wild Winds: Wild lanterns are twice as likely and win bigger for 30 seconds.',
  lastCall: 'Last Call: Fortune lanterns pay double until the market closes.',
};

/** Schedule the next 30-second event `from` a game time, if it ends before Last Call. */
function scheduleEvent(s: State, ctx: ModeContext<Settings>, at: number) {
  const limit = s.lastCallAt ?? s.endsAt;
  if (at + EVENT_TIMING.lastsSec * 1000 <= limit) {
    s.nextEventAt = at;
    ctx.setTimer('event', at);
  } else {
    s.nextEventAt = null;
    ctx.clearTimer('event');
  }
}

function startEvent(s: State, ctx: ModeContext<Settings>) {
  const at = s.nextEventAt ?? ctx.now();
  // Timers that fall due together (after a long gap) fire at the same moment in any order:
  // never start an event once Last Call is on, and skip one whose half-minute is already over.
  if (s.event?.id === 'lastCall' || (s.lastCallAt !== null && at + EVENT_TIMING.lastsSec * 1000 > s.lastCallAt)) {
    s.nextEventAt = null;
    return;
  }
  if (at + EVENT_TIMING.lastsSec * 1000 <= ctx.now()) {
    scheduleEvent(s, ctx, at + EVENT_TIMING.everySec * 1000);
    return;
  }
  const live = tricksPossible(s, ctx);
  const pool = MARKET_EVENTS.filter((e) => e !== s.lastEvent && (live || !EVENT_INFO[e].needsTricks)).map((id) => ({ id, weight: EVENT_WEIGHTS[id] }));
  const id = pickWeighted(pool, ctx.rng).id;
  const endsAt = at + EVENT_TIMING.lastsSec * 1000;
  s.event = { id, startedAt: at, endsAt };
  s.lastEvent = id;
  ctx.setTimer('eventEnd', endsAt);
  ctx.feed(EVENT_LINES[id], { tone: 'big' });
  scheduleEvent(s, ctx, at + EVENT_TIMING.everySec * 1000);
}

function startLastCall(s: State, ctx: ModeContext<Settings>) {
  const at = s.lastCallAt ?? ctx.now();
  ctx.clearTimer('eventEnd');
  s.event = { id: 'lastCall', startedAt: at, endsAt: s.endsAt };
  s.lastEvent = 'lastCall';
  ctx.feed(EVENT_LINES.lastCall, { tone: 'big' });
}

/* ---------------------------------- views --------------------------------- */

function ranking(s: State, ctx: ModeContext, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.stalls[p.id])
    .map((p) => {
      const st = s.stalls[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, coins: st.coins, shield: st.shield, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  // Equal coins share a rank.
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.coins === r.coins ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function teamRows(s: State, ctx: ModeContext) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.stalls[p.id]);
    const total = members.reduce((n, p) => n + s.stalls[p.id]!.coins, 0);
    const average = members.length ? Math.round(total / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, average };
  });
}

/** The next moment the market changes: the next event, or Last Call. */
function upcoming(s: State) {
  const lastCallSoon = s.lastCallAt !== null && s.event?.id !== 'lastCall' ? s.lastCallAt : null;
  if (s.nextEventAt !== null && (lastCallSoon === null || s.nextEventAt < lastCallSoon)) return { at: s.nextEventAt, lastCall: false };
  return lastCallSoon !== null ? { at: lastCallSoon, lastCall: true } : null;
}

function choiceView(s: State, ctx: ModeContext<Settings>, id: PlayerId, st: Stall) {
  const p = st.pending!;
  const all = rivals(s, ctx, id).sort(richestFirst(s));
  const allowed = new Set(trickable(s, ctx, id).map((x) => x.id));
  return {
    seq: p.seq,
    trick: p.content === 'swap' ? ('swap' as const) : ('swipe' as const),
    percent: p.content === 'swap' ? null : swipePercent(ctx.settings.greed, p.content as 'swipe1'),
    deadline: p.deadline,
    /** The usual limits were relaxed because nobody else could be tricked. */
    relaxed: all.some((x) => allowed.has(x.id) && blockedBy(s, ctx, id, x.id) !== null),
    total: all.length,
    targets: all.slice(0, TARGET_LIST_MAX).map((x) => {
      const why = allowed.has(x.id) ? null : blockedBy(s, ctx, id, x.id);
      return {
        playerId: x.id,
        name: x.name,
        coins: s.stalls[x.id]!.coins,
        shield: s.stalls[x.id]!.shield,
        /** Why this player cannot be chosen now: tricked by you last time, or just tricked and watched until `guardUntil`. */
        blocked: why,
        guardUntil: why === 'guard' ? s.stalls[x.id]!.guardUntil : null,
      };
    }),
  };
}

/* ---------------------------------- mode ---------------------------------- */

export const nightMarket = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const stalls: Record<PlayerId, Stall> = {};
    for (const p of ctx.players()) stalls[p.id] = newStall(ctx);
    const now = ctx.now();
    const endsAt = now + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    const s: State = {
      stalls,
      endsAt,
      lastCallAt: null,
      event: null,
      nextEventAt: null,
      lastEvent: null,
      news: [],
      seq: 0,
      opened: { fortune: 0, wild: 0, trick: 0, charm: 0 },
      tricks: 0,
      biggestSwipe: null,
      winner: null,
    };
    if (ctx.settings.events) {
      s.lastCallAt = Math.max(now, endsAt - EVENT_TIMING.lastCallSec * 1000);
      if (s.lastCallAt <= now) startLastCall(s, ctx);
      else ctx.setTimer('lastCall', s.lastCallAt);
      scheduleEvent(s, ctx, now + EVENT_TIMING.firstSec * 1000);
    }
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.stalls[p.id] ??= newStall(ctx);
  },
  onPlayerLeave(s, p, ctx) {
    const st = s.stalls[p.id];
    if (!st) return;
    // A trick waiting for its target still lands, on the richest player it may reach.
    if (st.pending) autoTrick(s, ctx, p.id);
    st.offer = null;
    st.extraPicks = 0;
  },
  onAction(s, playerId, a, ctx) {
    const st = s.stalls[playerId];
    if (!st) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'answer': {
        if (st.offer) return { error: 'Pick a lantern first.' };
        if (st.pending) return { error: 'Choose a player for your trick first.' };
        const res = streamSubmit(st.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (!res.correct) {
          if (st.stream.last) st.stream.last.text = 'No lantern';
          streamNext(st.stream, ctx);
          return;
        }
        const rain = s.event?.id === 'rain';
        st.extraPicks = rain ? 1 : 0;
        makeOffer(s, ctx, playerId, false);
        const levelUp = st.stream.correct % LEVEL_EVERY === 0 ? stallLevel(st.stream.correct) : null;
        if (levelUp) note(s, st, ctx.now(), `Stall level ${String(levelUp)}: your coin lanterns are worth more.`, 'good', 'level', true);
        if (st.stream.last) st.stream.last.text = `${levelUp ? `Stall level ${String(levelUp)}. ` : ''}${rain ? 'Lantern Rain: pick 2 lanterns.' : 'Pick a lantern.'}`;
        return;
      }
      case 'pick': {
        const offer = st.offer;
        if (!offer) return { error: st.pending ? 'Choose a player for your trick first.' : 'There is no lantern to open right now.' };
        if (offer.seq !== a.offer) return { error: 'That lantern has already been opened.' };
        const lantern = offer.lanterns[a.index];
        if (!lantern) return { error: 'There is no lantern there.' };
        st.offer = null;
        openLantern(s, ctx, playerId, lantern, offer.seq);
        if (!st.pending) moveOn(s, ctx, playerId);
        return;
      }
      case 'target': {
        if (!st.pending) return { error: 'There is no trick waiting for a player.' };
        if (a.playerId === playerId) return { error: 'You cannot trick yourself.' };
        if (!ctx.player(a.playerId) || !s.stalls[a.playerId]) return { error: 'That player has left the market.' };
        if (!rivals(s, ctx, playerId).some((p) => p.id === a.playerId)) return { error: 'You cannot trick a teammate.' };
        if (!trickable(s, ctx, playerId).some((p) => p.id === a.playerId)) {
          return { error: blockedBy(s, ctx, playerId, a.playerId) === 'guard' ? 'That stall was just tricked and is being watched. Choose someone else.' : 'You tricked that player last time. Choose someone else.' };
        }
        playTrick(s, ctx, playerId, a.playerId, false);
        moveOn(s, ctx, playerId);
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'time') {
      ctx.endGame();
      return;
    }
    if (id === 'event') startEvent(s, ctx);
    else if (id === 'eventEnd') {
      if (s.event && s.event.id !== 'lastCall' && ctx.now() >= s.event.endsAt) s.event = null;
    } else if (id === 'lastCall') {
      if (s.event?.id !== 'lastCall') startLastCall(s, ctx);
    }
    else if (id.startsWith('trick:')) {
      const playerId = id.slice('trick:'.length);
      if (s.stalls[playerId]?.pending) {
        autoTrick(s, ctx, playerId);
        moveOn(s, ctx, playerId);
      }
    }
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const base = {
      endsAt: s.endsAt,
      goal: ctx.settings.goalCoins,
      fog: ctx.settings.fog,
      tricks: ctx.settings.tricks,
      event: s.event ? { id: s.event.id, endsAt: s.event.endsAt } : null,
      // Last Call is the room's final stretch (its music); otherwise the last 30 seconds of `endsAt` are.
      ...(s.event?.id === 'lastCall' ? { finalStretch: true } : {}),
      next: upcoming(s),
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') {
      return {
        ...base,
        tricksLive: tricksPossible(s, ctx),
        opened: s.opened,
        tricksPlayed: s.tricks,
        coins: rows.reduce((n, r) => n + r.coins, 0),
        news: s.news.map((n) => ({ ...n, name: nameOf(ctx, n.by), target: n.to ? nameOf(ctx, n.to) : null })),
      };
    }
    const st = me ? s.stalls[me] : undefined;
    if (!me || !st) return { ...base, you: null };
    const m = moment(s, ctx, me);
    const showKinds = !ctx.settings.fog;
    return {
      ...base,
      you: {
        coins: st.coins,
        rank: mine?.rank ?? null,
        teamId: ctx.player(me)?.teamId ?? null,
        level: m.level,
        rights: st.stream.correct,
        toNext: toNextLevel(st.stream.correct),
        shield: st.shield,
        sight: st.sight,
        lucky: st.lucky,
        tricksLive: m.tricksLive,
        extraPicks: st.extraPicks,
        question: streamQuestionView(st.stream, ctx),
        last: st.stream.last,
        // What is inside stays secret unless Lantern Sight is on; fog hides the kinds too.
        offer: st.offer
          ? {
              seq: st.offer.seq,
              bonus: st.offer.bonus,
              sight: st.offer.sight,
              lanterns: st.offer.lanterns.map((l) => ({ kind: showKinds || st.offer!.sight ? l.kind : null, content: st.offer!.sight ? l.content : null })),
            }
          : null,
        choose: st.pending ? choiceView(s, ctx, me, st) : null,
        opened: st.opened,
        notes: st.notes,
      },
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const coins = s.stalls[p.id]?.coins ?? 0;
      return { playerId: p.id, score: coins, label: coinsText(coins) };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leaders = standings.filter((r) => r.score === best);
    let summary = 'The market closed before anyone earned a coin.';
    if (s.winner) summary = `${nameOf(ctx, s.winner)} reached ${coinsText(ctx.settings.goalCoins)} first.`;
    else if (best > 0) summary = leaders.length === 1 ? `${nameOf(ctx, leaders[0]!.playerId)} ran the richest stall with ${coinsText(best)}.` : `${String(leaders.length)} stalls tied for the richest with ${coinsText(best)}.`;
    const swipe = s.biggestSwipe;
    if (swipe) summary += ` Biggest swipe: ${nameOf(ctx, swipe.by)} took ${coinsText(swipe.amount)} from ${nameOf(ctx, swipe.from)}.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.average, label: `${coinsText(t.average)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    if (you.choose) {
      const target = botTarget(you);
      // Everyone it could trick has just left: the timer hands out a consolation instead.
      return target ? { type: 'target', playerId: target } : null;
    }
    if (you.offer) return { type: 'pick', offer: you.offer.seq, index: botPick(view, you, ctx.rng) };
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    // Picking a lantern or a player is a quick tap; answering takes a while.
    if (you?.offer || you?.choose) return 700 + rng.int(0, 1300);
    return 2200 + rng.int(0, 4500);
  },
});

/* ---------------------------------- bots ---------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A rough value in coins of what a lantern holds, for a bot that can see inside. */
function botValue(content: ContentId, you: any, richest: number): number {
  const f = FORTUNE_ODDS.find((r) => r.id === content);
  if (f) return f.coins !== undefined ? f.coins * levelMultiplier(you.level) : Math.max(f.min ?? 0, (you.coins * (f.percent ?? 0)) / 100);
  switch (content) {
    case 'grow':
      return Math.max(40, you.coins / 2);
    case 'loseSmall':
    case 'loseBig':
      return -you.coins / 5;
    case 'swap':
      return richest - you.coins;
    case 'toll':
      return 40;
    case 'shield':
      return you.shield ? SHIELD_REFUND : 45;
    case 'sight':
    case 'lucky':
      return 40;
    default:
      return richest / 6;
  }
}

/**
 * Lantern choice: a trick when someone has at least 1.4 times the bot's coins,
 * a charm when it leads with no shield, a gamble when it is poor or far behind,
 * otherwise coins. With Lantern Sight it takes what looks best; in fog it guesses.
 */
function botPick(view: any, you: any, rng: Rng): number {
  const lanterns: { kind: LanternKind | null; content: ContentId | null }[] = you.offer.lanterns;
  const rivalsOnBoard = (view.board as any[]).filter((r) => !r.isYou && !(you.teamId && r.teamId === you.teamId));
  const richest = Math.max(0, ...rivalsOnBoard.map((r) => r.coins as number));
  const leader = Math.max(0, ...(view.board as any[]).map((r) => r.coins as number));
  if (you.offer.sight) {
    let bestAt = 0;
    lanterns.forEach((l, i) => {
      if (botValue(l.content!, you, richest) > botValue(lanterns[bestAt]!.content!, you, richest)) bestAt = i;
    });
    return bestAt;
  }
  if (lanterns.every((l) => l.kind === null)) return rng.int(0, lanterns.length - 1);
  const at = (kind: LanternKind) => lanterns.findIndex((l) => l.kind === kind);
  if (at('trick') >= 0 && richest >= Math.max(50, you.coins * 1.4)) return at('trick');
  if (at('charm') >= 0 && you.rank === 1 && you.coins > 0 && !you.shield) return at('charm');
  if (at('wild') >= 0 && (you.coins < 100 || you.coins < leader / 2)) return at('wild');
  for (const kind of ['fortune', 'charm', 'wild', 'trick'] as const) if (at(kind) >= 0) return at(kind);
  return 0;
}

/** Swipe the richest player without a shield; swap with the richest player who has more, shield or not; otherwise the least bad. */
function botTarget(you: any): string | null {
  const open = (you.choose.targets as any[]).filter((t) => !t.blocked);
  if (you.choose.trick === 'swipe') return (open.find((t) => !t.shield) ?? open[0])?.playerId ?? null;
  const richer = open.filter((t) => t.coins > you.coins);
  return (richer.find((t) => !t.shield) ?? richer[0] ?? open[0])?.playerId ?? null;
}
