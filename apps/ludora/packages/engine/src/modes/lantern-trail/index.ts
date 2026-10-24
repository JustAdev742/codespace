/*
 * Lantern Trail: a festival board game round the town (the board is in board.ts).
 *
 * A right answer rolls the dice and walks the player's Glim round the loop. A
 * move is a short list of jobs worked through in order: walk the steps, take
 * the space landed on, then look for a stall. It pauses whenever the player has
 * a choice to make (the Crossroads, a Golden Lantern to buy, a player to pick
 * for a chance card), picks for them after 15 seconds, and carries on from
 * where it stopped. While a choice is open the player has no question; when the
 * move is done, the next question comes.
 *
 * The Golden Lantern stall moves somewhere new after every purchase, so the
 * room keeps racing after it. A room event changes a rule for 30 seconds every
 * 90 seconds, and the last 45 seconds are Last lanterns: cheap lanterns, and a
 * stall that stays close.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { listNames, nameOf } from '../rules.ts';
import {
  CHANCE_CARDS,
  CHOICE_SECONDS,
  EVENT_TIMING,
  FINALE,
  FINALE_EVENT,
  GLOOM_CARD_COINS,
  HOT_STREAK,
  MIN_PRICE,
  PAYOUTS,
  PICKPOCKET_COINS,
  PURSE_COINS,
  ROOM_EVENTS,
  RUMOUR_STEPS,
  SECOND_STALL_AT,
  SHOWER_COINS,
  STALL_MOVE_MIN,
  START_COINS,
  TICKET_DISCOUNT,
  WIND_STEPS,
  meta,
  settings,
  type CardId,
  type EventId,
} from './meta.ts';
import { FERRY_PAIR, GATE, LONG_WAY, REJOIN, SHORTCUT, SPACES, placeName, type SpaceKind } from './board.ts';

type Settings = {
  price: string;
  stalls: string;
  events: boolean;
  tricks: boolean;
  luckyDice: boolean;
  goalLanterns: number;
  bumper: boolean;
  puddles: boolean;
};
type Ctx = ModeContext<Settings>;

export type Route = 'long' | 'short';
type Trick = 'pickpocket' | 'trade';

/** One job of a move. */
type Job = { t: 'walk'; n: number } | { t: 'land' } | { t: 'check' };

/** What happened during a move, in order. `i` is the index in the move's path where it happened. */
export type Note =
  | { k: 'gate'; i: number; coins: number }
  | { k: 'space'; i: number; kind: 'coins' | 'fair' | 'gloom'; coins: number }
  | { k: 'ferry'; i: number; to: number }
  | { k: 'route'; i: number; route: Route; auto: boolean }
  | { k: 'card'; i: number; card: CardId; coins: number }
  | { k: 'rumour'; i: number; to: number; came: boolean }
  | { k: 'steal'; i: number; name: string; coins: number }
  | { k: 'trade'; i: number; name: string; to: number }
  | { k: 'fizzle'; i: number; card: Trick }
  | { k: 'short'; i: number; price: number }
  | { k: 'buy'; i: number; price: number; ticket: boolean; to: number; auto: boolean }
  | { k: 'pass'; i: number }
  | { k: 'missed'; i: number; why: 'moved' | 'coins' };

interface Move {
  seq: number;
  at: number;
  /** Game time the move finished, once it has. */
  endedAt: number | null;
  dice: number[];
  /** Lucky dice: the index of the die kept. */
  kept: number | null;
  hot: boolean;
  double: boolean;
  steps: number;
  /** Every space the Glim reached, starting where it stood. */
  path: number[];
  /** Indices in `path` reached by a jump (a ferry, a trade) rather than a step. */
  jumps: number[];
  notes: Note[];
  /** Jobs still to do. Never sent to a client. */
  todo: Job[];
  /** The way chosen at the Crossroads, used by the next step off it. */
  route: Route | null;
  /** Stalls already offered on this move, as "stall@space", so nobody is asked twice. */
  offered: string[];
}

type Pending =
  | { kind: 'fork'; deadline: number }
  | { kind: 'buy'; deadline: number; stall: number; node: number; price: number; ticket: boolean }
  | { kind: 'target'; deadline: number; card: Trick };

/** The last trick another player played on you. */
interface Hit {
  kind: Trick;
  name: string;
  coins: number;
  to: number;
  at: number;
  n: number;
}

interface Walker {
  stream: StreamState;
  pos: number;
  coins: number;
  lanterns: number;
  tickets: number;
  moves: number;
  move: Move | null;
  pending: Pending | null;
  hit: Hit | null;
}

interface Stall {
  id: number;
  pos: number;
  from: number | null;
  movedAt: number;
  why: 'start' | 'bought' | 'parade' | 'rumour';
  /** Counts moves, so screens can tell a new flight from an old one. */
  n: number;
}

interface RoomEvent {
  kind: EventId;
  startsAt: number;
  endsAt: number;
  hops: number;
}

export interface Play {
  n: number;
  kind: 'buy' | 'steal' | 'trade' | 'shower' | 'rumour' | 'goal';
  playerId: PlayerId;
  text: string;
  at: number;
}

interface State {
  walkers: Record<PlayerId, Walker>;
  stalls: Stall[];
  endsAt: number;
  /** When Last lanterns starts. */
  lastAt: number;
  last: boolean;
  event: RoomEvent | null;
  nextEventAt: number | null;
  lastEvent: EventId | null;
  plays: Play[];
  playSeq: number;
  sold: number;
  /** The player who reached the goal, ending the game. */
  champion: PlayerId | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('fork'), route: z.enum(['long', 'short']) }),
  z.object({ type: z.literal('buy'), buy: z.boolean() }),
  z.object({ type: z.literal('target'), playerId: z.string().min(1).max(40) }),
]);
type Action = z.infer<typeof action>;

const CHOICE_MS = CHOICE_SECONDS * 1000;
const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const RECENT_PLAYS = 6;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lanternWord = (n: number) => plural(n, 'Golden Lantern');
const timerOf = (id: PlayerId) => `choice:${id}`;

/* -------------------------------- the board -------------------------------- */

const COUNT = SPACES.length;

function distancesFrom(from: number): number[] {
  const d = Array<number>(COUNT).fill(Infinity);
  d[from] = 0;
  const queue = [from];
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of SPACES[a]!.next) {
      if (d[b] !== Infinity) continue;
      d[b] = d[a]! + 1;
      queue.push(b);
    }
  }
  return d;
}

/** Fewest steps from one space to another, moving forward (the shortcut counts). */
export const STEPS: readonly (readonly number[])[] = SPACES.map((s) => distancesFrom(s.id));

/** The spaces on the quickest way from `from` to `to`, both included. Ties take the long way. */
export function pathBetween(from: number, to: number): number[] {
  const prev = Array<number>(COUNT).fill(-1);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length && !seen.has(to)) {
    const a = queue.shift()!;
    for (const b of SPACES[a]!.next) {
      if (seen.has(b)) continue;
      seen.add(b);
      prev[b] = a;
      queue.push(b);
    }
  }
  const path = [to];
  while (path[0] !== from && prev[path[0]!]! >= 0) path.unshift(prev[path[0]!]!);
  return path[0] === from ? path : [from];
}

function stepFrom(node: number, route: Route | null): number {
  const next = SPACES[node]!.next;
  return next.length > 1 && route === 'short' ? next[1]! : next[0]!;
}

/** A space as it plays tonight: with puddles off, every puddle is a lucky fair. */
export function kindAt(node: number, puddles: boolean): SpaceKind {
  const k = SPACES[node]!.kind;
  return k === 'gloom' && !puddles ? 'fair' : k;
}

/** Stalls never stand on a ferry, the Crossroads or another stall. */
function stallCanStand(s: State, node: number, stallId: number): boolean {
  const k = SPACES[node]!.kind;
  return k !== 'ferry' && k !== 'fork' && !s.stalls.some((x) => x.id !== stallId && x.pos === node);
}

/** Steps to the nearest stall ahead, or null when there is none. */
function stallSteps(s: State, node: number): number | null {
  const d = Math.min(...s.stalls.map((x) => STEPS[node]![x.pos]!));
  return Number.isFinite(d) ? d : null;
}

/** Bots take the shortcut when a stall is on it, or just past where it comes back (it is 6 steps nearer that way). */
export function shortcutPays(stalls: readonly number[]): boolean {
  return stalls.some((p) => SHORTCUT.includes(p) || (!LONG_WAY.includes(p) && STEPS[REJOIN]![p]! <= 6));
}

/* ------------------------------- prices, dice ------------------------------- */

function basePrice(ctx: Ctx): number {
  return Number(ctx.settings.price) || 20;
}

/** What a Golden Lantern costs right now, before a Golden ticket. */
function roomPrice(s: State, ctx: Ctx): number {
  const base = basePrice(ctx);
  if (s.last) return Math.min(base, FINALE.price);
  if (s.event?.kind === 'sale') return Math.max(MIN_PRICE, Math.ceil(base / 2));
  return base;
}

/** What this player would pay: the room's price, less a Golden ticket if they hold one and it helps. */
function priceFor(s: State, w: Walker, ctx: Ctx): { price: number; ticket: boolean } {
  const room = roomPrice(s, ctx);
  const off = Math.max(MIN_PRICE, room - TICKET_DISCOUNT);
  return w.tickets > 0 && off < room ? { price: off, ticket: true } : { price: room, ticket: false };
}

function payout(kind: 'coins' | 'fair' | 'gloom', s: State, ctx: Ctx): number {
  const bumper = ctx.settings.bumper ? 2 : 1;
  const ev = s.event?.kind;
  if (kind === 'coins') return PAYOUTS.coins * bumper * (ev === 'rush' ? 3 : 1);
  if (kind === 'fair') return PAYOUTS.fair * bumper * (ev === 'gloomy' ? 2 : 1);
  return PAYOUTS.gloom * (ev === 'gloomy' ? 2 : 1);
}

function roll(s: State, w: Walker, ctx: Ctx): Pick<Move, 'dice' | 'kept' | 'hot' | 'double' | 'steps'> {
  const d6 = () => ctx.rng.int(1, 6);
  const hot = w.stream.streak >= HOT_STREAK;
  const double = s.event?.kind === 'double';
  if (hot || double) {
    const dice = [d6(), d6()];
    return { dice, kept: null, hot, double, steps: dice[0]! + dice[1]! };
  }
  if (ctx.settings.luckyDice) {
    const dice = [d6(), d6()];
    const kept = dice[0]! >= dice[1]! ? 0 : 1;
    return { dice, kept, hot: false, double: false, steps: dice[kept]! };
  }
  const dice = [d6()];
  return { dice, kept: null, hot: false, double: false, steps: dice[0]! };
}

function rollText(m: Move): string {
  if (m.kept !== null) return `Lucky dice: ${m.dice[0]} and ${m.dice[1]}, you keep ${m.dice[m.kept]}`;
  if (m.dice.length === 2) return `${m.hot ? 'Hot streak' : 'Double dice'}: you rolled ${m.dice[0]} + ${m.dice[1]} = ${m.steps}`;
  return `You rolled ${m.steps}`;
}

/* ---------------------------------- people --------------------------------- */

function newWalker(ctx: Ctx): Walker {
  return { stream: streamInit(ctx), pos: GATE, coins: START_COINS, lanterns: 0, tickets: 0, moves: 0, move: null, pending: null, hit: null };
}

const midMove = (w: Walker) => w.pending !== null;
const standing = (w: Walker) => w.lanterns * 100_000 + w.coins;

/** Players a trick card can pick: everyone else still in the game, on another team, and (to trade) not halfway through a move. */
function targetsFor(s: State, id: PlayerId, card: Trick, ctx: Ctx): PlayerId[] {
  const team = ctx.player(id)?.teamId ?? null;
  return ctx
    .players()
    .filter((p) => p.id !== id && s.walkers[p.id] && !(team && p.teamId === team) && (card !== 'trade' || !midMove(s.walkers[p.id]!)))
    .map((p) => p.id);
}

/** The leader among some players: most lanterns, then most coins. */
function leaderOf(s: State, ids: readonly PlayerId[]): PlayerId | null {
  let best: PlayerId | null = null;
  for (const id of ids) if (best === null || standing(s.walkers[id]!) > standing(s.walkers[best]!)) best = id;
  return best;
}

/** The chance cards this player can draw now, with their weights. */
function cardsFor(s: State, id: PlayerId | null, ctx: Ctx) {
  return CHANCE_CARDS.filter((c) => {
    if (c.id === 'gloom' && !ctx.settings.puddles) return false;
    if (!c.trick) return true;
    if (!ctx.settings.tricks) return false;
    // The big screen shows the odds for a player with someone to pick.
    return id === null ? ctx.players().length > 1 : targetsFor(s, id, c.id as Trick, ctx).length > 0;
  });
}

/** Each card's chance in whole percent, as shown to players. */
function oddsFor(s: State, id: PlayerId | null, ctx: Ctx) {
  const cards = cardsFor(s, id, ctx);
  const total = cards.reduce((n, c) => n + c.weight, 0);
  return cards.map((c) => ({ card: c.id, pct: Math.round((c.weight / total) * 1000) / 10 }));
}

function addPlay(s: State, kind: Play['kind'], playerId: PlayerId, text: string, ctx: Ctx) {
  s.plays = [{ n: ++s.playSeq, kind, playerId, text, at: ctx.now() }, ...s.plays].slice(0, RECENT_PLAYS);
}

/* ---------------------------------- stalls --------------------------------- */

function moveStall(s: State, stall: Stall, to: number, why: Stall['why'], ctx: Ctx) {
  const from = stall.pos;
  stall.from = from;
  stall.pos = to;
  stall.movedAt = ctx.now();
  stall.why = why;
  stall.n++;
  // Anyone stopped at the stall, deciding whether to buy, has missed it: their move carries on.
  for (const [id, w] of Object.entries(s.walkers)) {
    const p = w.pending;
    if (p?.kind !== 'buy' || p.stall !== stall.id || p.node !== from) continue;
    w.pending = null;
    ctx.clearTimer(timerOf(id));
    w.move!.notes.push({ k: 'missed', i: w.move!.path.length - 1, why: 'moved' });
    run(s, id, ctx);
  }
}

/** A random space for a stall, `min` to `max` steps ahead of `from`, where a stall may stand. */
function stallSpot(s: State, stallId: number, from: number, min: number, max: number, ctx: Ctx): number {
  const free = SPACES.filter((sp) => stallCanStand(s, sp.id, stallId) && sp.id !== from).map((sp) => sp.id);
  const near = free.filter((n) => STEPS[from]![n]! >= min && STEPS[from]![n]! <= max);
  return ctx.rng.pick(near.length ? near : free);
}

function placeStalls(s: State, ctx: Ctx) {
  const count = ctx.settings.stalls === '2' || (ctx.settings.stalls === 'auto' && ctx.players().length >= SECOND_STALL_AT) ? 2 : 1;
  for (let id = 0; id < count; id++) {
    const free = SPACES.filter((sp) => stallCanStand(s, sp.id, id) && STEPS[GATE]![sp.id]! >= STALL_MOVE_MIN).map((sp) => sp.id);
    // A second stall starts well away from the first, so the two pull the room in different directions.
    const apart = free.filter((n) => s.stalls.every((x) => Math.min(STEPS[n]![x.pos]!, STEPS[x.pos]![n]!) >= STALL_MOVE_MIN));
    const pos = ctx.rng.pick(apart.length ? apart : free);
    s.stalls.push({ id, pos, from: null, movedAt: ctx.now(), why: 'start', n: 0 });
  }
}

function paradeHop(s: State, ctx: Ctx) {
  for (const stall of s.stalls) {
    let to = stall.pos;
    for (let k = 0; k < EVENT_TIMING.paradeSteps; k++) to = SPACES[to]!.next[0]!;
    for (let guard = 0; guard < COUNT && !stallCanStand(s, to, stall.id); guard++) to = SPACES[to]!.next[0]!;
    if (to !== stall.pos) moveStall(s, stall, to, 'parade', ctx);
  }
}

/** Stall rumour: the nearest stall (either way round) moves 3 spaces towards the player, stopping on their space at most. */
function rumour(s: State, id: PlayerId, ctx: Ctx): { to: number; came: boolean } | null {
  const w = s.walkers[id]!;
  let best: { stall: Stall; route: number[] } | null = null;
  for (const stall of s.stalls) {
    const ahead = STEPS[w.pos]![stall.pos]!;
    const behind = STEPS[stall.pos]![w.pos]!;
    // The route from the stall to the player: back along the player's way, or on along the stall's own.
    const route = ahead <= behind ? pathBetween(w.pos, stall.pos).reverse() : pathBetween(stall.pos, w.pos);
    if (!best || route.length < best.route.length) best = { stall, route };
  }
  if (!best || best.route.length < 2) return null;
  const { stall, route } = best;
  const want = Math.min(RUMOUR_STEPS, route.length - 1);
  // Where it cannot stand, one step further towards the player, or else as close to 3 as it can.
  const tries = [want, want + 1, ...Array.from({ length: want - 1 }, (_, k) => want - 1 - k)].filter((k) => k >= 1 && k < route.length);
  const k = tries.find((t) => stallCanStand(s, route[t]!, stall.id));
  if (k === undefined) return null;
  const to = route[k]!;
  moveStall(s, stall, to, 'rumour', ctx);
  return { to, came: to === w.pos };
}

/* ---------------------------------- moves ---------------------------------- */

function note(w: Walker, n: Note) {
  w.move!.notes.push(n);
}

const here = (w: Walker) => w.move!.path.length - 1;

/**
 * Offers the stall on the player's space, if there is one they have not been
 * offered on this move and can afford. Returns true when it paused the move.
 * `passing` is true while the Glim is walking past (with steps still to go).
 */
function offerStall(s: State, id: PlayerId, ctx: Ctx, passing: boolean): boolean {
  const w = s.walkers[id]!;
  const m = w.move!;
  const stall = s.stalls.find((x) => x.pos === w.pos);
  if (!stall) return false;
  const key = `${stall.id}@${w.pos}`;
  if (m.offered.includes(key)) return false;
  const deal = priceFor(s, w, ctx);
  if (w.coins < deal.price) {
    // Landing may still bring the coins: say so only when walking past, or after the space has paid.
    if (passing || m.todo.every((j) => j.t !== 'land')) {
      m.offered.push(key);
      note(w, { k: 'short', i: here(w), price: deal.price });
    }
    return false;
  }
  m.offered.push(key);
  w.pending = { kind: 'buy', deadline: ctx.now() + CHOICE_MS, stall: stall.id, node: w.pos, price: deal.price, ticket: deal.ticket };
  return true;
}

function walk(s: State, id: PlayerId, steps: number, ctx: Ctx) {
  const w = s.walkers[id]!;
  const m = w.move!;
  for (let left = steps; left > 0; ) {
    if (SPACES[w.pos]!.next.length > 1 && m.route === null) {
      m.todo.unshift({ t: 'walk', n: left });
      w.pending = { kind: 'fork', deadline: ctx.now() + CHOICE_MS };
      return;
    }
    w.pos = stepFrom(w.pos, m.route);
    m.route = null;
    left--;
    m.path.push(w.pos);
    if (w.pos === GATE) {
      w.coins += PAYOUTS.gate;
      note(w, { k: 'gate', i: here(w), coins: PAYOUTS.gate });
    }
    if (offerStall(s, id, ctx, left > 0)) {
      if (left > 0) m.todo.unshift({ t: 'walk', n: left });
      return;
    }
  }
}

function land(s: State, id: PlayerId, ctx: Ctx) {
  const w = s.walkers[id]!;
  const m = w.move!;
  const kind = kindAt(w.pos, ctx.settings.puddles);
  if (kind === 'coins' || kind === 'fair') {
    const coins = payout(kind, s, ctx);
    w.coins += coins;
    note(w, { k: 'space', i: here(w), kind, coins });
  } else if (kind === 'gloom') {
    const coins = Math.min(w.coins, payout('gloom', s, ctx));
    w.coins -= coins;
    note(w, { k: 'space', i: here(w), kind, coins: -coins });
  } else if (kind === 'ferry') {
    const to = w.pos === FERRY_PAIR[0] ? FERRY_PAIR[1] : FERRY_PAIR[0];
    w.pos = to;
    m.path.push(to);
    m.jumps.push(here(w));
    note(w, { k: 'ferry', i: here(w), to });
  } else if (kind === 'chance') {
    drawCard(s, id, ctx);
  }
}

function drawCard(s: State, id: PlayerId, ctx: Ctx) {
  const w = s.walkers[id]!;
  const m = w.move!;
  const cards = cardsFor(s, id, ctx);
  let roll = ctx.rng.next() * cards.reduce((n, c) => n + c.weight, 0);
  const card = (cards.find((c) => (roll -= c.weight) < 0) ?? cards[cards.length - 1]!).id;
  const i = here(w);
  const name = nameOf(ctx, id);
  switch (card) {
    case 'wind':
      note(w, { k: 'card', i, card, coins: 0 });
      m.todo.unshift({ t: 'walk', n: WIND_STEPS }, { t: 'land' });
      return;
    case 'purse':
      w.coins += PURSE_COINS;
      note(w, { k: 'card', i, card, coins: PURSE_COINS });
      return;
    case 'shower': {
      for (const p of ctx.players()) if (p.id !== id && s.walkers[p.id]) s.walkers[p.id]!.coins += SHOWER_COINS.others;
      w.coins += SHOWER_COINS.you;
      note(w, { k: 'card', i, card, coins: SHOWER_COINS.you });
      const text = `${name}’s coin shower: everyone gets ${SHOWER_COINS.others} coins.`;
      ctx.feed(text, { tone: 'good' });
      addPlay(s, 'shower', id, text, ctx);
      return;
    }
    case 'rumour': {
      note(w, { k: 'card', i, card, coins: 0 });
      const moved = rumour(s, id, ctx);
      if (moved) {
        note(w, { k: 'rumour', i, to: moved.to, came: moved.came });
        // The big screen lists it with the other big plays; phones see the stall move on their own trail.
        const text = moved.came ? `A stall rumour brought the stall right to ${name}.` : `A stall rumour moved the stall to ${placeName(moved.to)}.`;
        addPlay(s, 'rumour', id, text, ctx);
      }
      return;
    }
    case 'ticket':
      w.tickets++;
      note(w, { k: 'card', i, card, coins: 0 });
      return;
    case 'gloom': {
      const coins = Math.min(w.coins, GLOOM_CARD_COINS);
      w.coins -= coins;
      note(w, { k: 'card', i, card, coins: -coins });
      return;
    }
    case 'pickpocket':
    case 'trade':
      note(w, { k: 'card', i, card, coins: 0 });
      w.pending = { kind: 'target', deadline: ctx.now() + CHOICE_MS, card };
      return;
  }
}

/** Works through the move's jobs until it pauses for a choice or ends. */
function run(s: State, id: PlayerId, ctx: Ctx) {
  const w = s.walkers[id];
  const m = w?.move;
  if (!w || !m || m.endedAt !== null) return;
  while (!w.pending && m.todo.length && !s.champion) {
    const job = m.todo.shift()!;
    if (job.t === 'walk') walk(s, id, job.n, ctx);
    else if (job.t === 'land') land(s, id, ctx);
    else offerStall(s, id, ctx, false);
  }
  if (s.champion) return;
  if (w.pending) {
    ctx.setTimer(timerOf(id), w.pending.deadline);
    return;
  }
  m.endedAt = ctx.now();
  ctx.clearTimer(timerOf(id));
  // A player who has left gets their next question if they come back.
  if (!w.stream.iid && ctx.player(id)) streamNext(w.stream, ctx);
}

function startMove(s: State, id: PlayerId, ctx: Ctx) {
  const w = s.walkers[id]!;
  const r = roll(s, w, ctx);
  w.moves++;
  w.move = { seq: w.moves, at: ctx.now(), endedAt: null, ...r, path: [w.pos], jumps: [], notes: [], todo: [{ t: 'walk', n: r.steps }, { t: 'land' }, { t: 'check' }], route: null, offered: [] };
  run(s, id, ctx);
}

/* --------------------------------- choices --------------------------------- */

function chooseRoute(s: State, id: PlayerId, route: Route, auto: boolean, ctx: Ctx) {
  const w = s.walkers[id]!;
  w.pending = null;
  ctx.clearTimer(timerOf(id));
  w.move!.route = route;
  note(w, { k: 'route', i: here(w), route, auto });
  run(s, id, ctx);
}

function buy(s: State, id: PlayerId, stall: Stall, price: number, ticket: boolean, auto: boolean, ctx: Ctx) {
  const w = s.walkers[id]!;
  w.coins -= price;
  if (ticket) w.tickets--;
  w.lanterns++;
  s.sold++;
  const name = nameOf(ctx, id);
  const goal = ctx.settings.goalLanterns;
  const won = goal > 0 && w.lanterns >= goal;
  // Last lanterns: the stall stays close, half as far as usual.
  const [min, max] = s.last ? [FINALE.minSteps, FINALE.maxSteps] : [STALL_MOVE_MIN, Infinity];
  const to = stallSpot(s, stall.id, w.pos, min, max, ctx);
  note(w, { k: 'buy', i: here(w), price, ticket, to, auto });
  const text = `${name} bought a Golden Lantern. The stall moved to ${placeName(to)}.`;
  ctx.feed(text, { tone: 'big' });
  addPlay(s, 'buy', id, `${name} bought a Golden Lantern.`, ctx);
  moveStall(s, stall, to, 'bought', ctx);
  if (won) {
    s.champion = id;
    const line = `${name} collected ${lanternWord(w.lanterns)} first.`;
    addPlay(s, 'goal', id, line, ctx);
    ctx.endGame(line);
  }
}

function resolveBuy(s: State, id: PlayerId, yes: boolean, auto: boolean, ctx: Ctx) {
  const w = s.walkers[id]!;
  const p = w.pending;
  if (p?.kind !== 'buy') return;
  w.pending = null;
  ctx.clearTimer(timerOf(id));
  const stall = s.stalls.find((x) => x.id === p.stall);
  if (!stall || stall.pos !== p.node) note(w, { k: 'missed', i: here(w), why: 'moved' });
  else if (!yes) note(w, { k: 'pass', i: here(w) });
  else {
    // The price offered stands if the room's price has gone up since; a lower price is better still.
    const now = priceFor(s, w, ctx);
    const deal = now.price <= p.price ? now : { price: p.price, ticket: p.ticket && w.tickets > 0 };
    if (w.coins < deal.price) note(w, { k: 'missed', i: here(w), why: 'coins' });
    else buy(s, id, stall, deal.price, deal.ticket, auto, ctx);
  }
  run(s, id, ctx);
}

function resolveTarget(s: State, id: PlayerId, target: PlayerId | null, ctx: Ctx) {
  const w = s.walkers[id]!;
  const p = w.pending;
  if (p?.kind !== 'target') return;
  w.pending = null;
  ctx.clearTimer(timerOf(id));
  const valid = targetsFor(s, id, p.card, ctx);
  // Nobody picked in time: the trick goes to the leader.
  const t = target && valid.includes(target) ? target : leaderOf(s, valid);
  const me = nameOf(ctx, id);
  if (!t) note(w, { k: 'fizzle', i: here(w), card: p.card });
  else {
    const tw = s.walkers[t]!;
    const them = nameOf(ctx, t);
    const n = (tw.hit?.n ?? 0) + 1;
    if (p.card === 'pickpocket') {
      const coins = Math.min(PICKPOCKET_COINS, tw.coins);
      tw.coins -= coins;
      w.coins += coins;
      tw.hit = { kind: 'pickpocket', name: me, coins, to: tw.pos, at: ctx.now(), n };
      note(w, { k: 'steal', i: here(w), name: them, coins });
      const text = coins ? `${me}’s Pickpocket Glim took ${plural(coins, 'coin')} from ${them}.` : `${me}’s Pickpocket Glim found ${them}’s purse empty.`;
      ctx.feed(text, { tone: 'bad' });
      addPlay(s, 'steal', id, text, ctx);
    } else {
      const mine = w.pos;
      w.pos = tw.pos;
      tw.pos = mine;
      w.move!.path.push(w.pos);
      w.move!.jumps.push(here(w));
      tw.hit = { kind: 'trade', name: me, coins: 0, to: tw.pos, at: ctx.now(), n };
      note(w, { k: 'trade', i: here(w), name: them, to: w.pos });
      const text = `${me} traded places with ${them}.`;
      ctx.feed(text, { tone: 'info' });
      addPlay(s, 'trade', id, text, ctx);
    }
  }
  run(s, id, ctx);
}

/* ------------------------------- room events ------------------------------- */

function scheduleEvent(s: State, at: number, ctx: Ctx) {
  if (ctx.settings.events && at + EVENT_TIMING.minSec * 1000 <= s.lastAt) {
    s.nextEventAt = at;
    ctx.setTimer('event', at);
  } else s.nextEventAt = null;
}

function eventLine(kind: EventId, stalls: number): string {
  const e = ROOM_EVENTS.find((x) => x.id === kind)!;
  const text = kind === 'parade' && stalls > 1 ? 'Both stalls hop 3 spaces forward every 10 seconds.' : e.text;
  return `${e.title}. ${text}`;
}

function startEvent(s: State, ctx: Ctx) {
  const at = s.nextEventAt ?? ctx.now();
  s.nextEventAt = null;
  // Never the same event twice in a row; no gloomy night when there are no puddles.
  const pool = ROOM_EVENTS.filter((e) => e.id !== s.lastEvent && (e.id !== 'gloomy' || ctx.settings.puddles));
  const kind = ctx.rng.pick(pool).id;
  s.event = { kind, startsAt: at, endsAt: Math.min(at + EVENT_TIMING.lengthSec * 1000, s.lastAt), hops: 0 };
  s.lastEvent = kind;
  ctx.setTimer('event', s.event.endsAt);
  ctx.feed(eventLine(kind, s.stalls.length), { tone: 'big' });
  if (kind === 'parade') hop(s, ctx);
}

/** Stall parade: a hop now, and the next one in 10 seconds if the parade lasts that long. */
function hop(s: State, ctx: Ctx) {
  const e = s.event;
  if (e?.kind !== 'parade') return;
  paradeHop(s, ctx);
  e.hops++;
  const next = e.startsAt + e.hops * EVENT_TIMING.paradeEverySec * 1000;
  if (next < e.endsAt) ctx.setTimer('parade', next);
}

function endEvent(s: State, ctx: Ctx) {
  const started = s.event!.startsAt;
  s.event = null;
  ctx.clearTimer('parade');
  scheduleEvent(s, started + EVENT_TIMING.everySec * 1000, ctx);
}

/* ---------------------------------- views ---------------------------------- */

function ranks(s: State, ctx: Ctx): Map<PlayerId, number> {
  const ids = ctx.players().map((p) => p.id).filter((id) => s.walkers[id]);
  const sorted = ids.slice().sort((a, b) => standing(s.walkers[b]!) - standing(s.walkers[a]!));
  const out = new Map<PlayerId, number>();
  sorted.forEach((id, i) => out.set(id, i > 0 && standing(s.walkers[sorted[i - 1]!]!) === standing(s.walkers[id]!) ? out.get(sorted[i - 1]!)! : i + 1));
  return out;
}

function teamRows(s: State, ctx: Ctx) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.walkers[p.id]).map((p) => s.walkers[p.id]!);
    const n = members.length;
    const lanterns = n ? members.reduce((a, w) => a + w.lanterns, 0) / n : 0;
    const coins = n ? members.reduce((a, w) => a + w.coins, 0) / n : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, members: n, lanterns: Math.round(lanterns * 10) / 10, coins: Math.round(coins), exact: { lanterns, coins } };
  });
}

function moveView(m: Move | null) {
  if (!m) return null;
  return { seq: m.seq, at: m.at, done: m.endedAt !== null, dice: m.dice, kept: m.kept, hot: m.hot, double: m.double, steps: m.steps, path: m.path, jumps: m.jumps, notes: m.notes };
}

function pendingView(s: State, id: PlayerId, w: Walker, ctx: Ctx) {
  const p = w.pending;
  if (!p) return null;
  if (p.kind === 'fork') return { kind: 'fork' as const, deadline: p.deadline };
  if (p.kind === 'buy') {
    const now = priceFor(s, w, ctx);
    const price = Math.min(now.price, p.price);
    return { kind: 'buy' as const, deadline: p.deadline, price, ticket: price === now.price ? now.ticket : p.ticket, stall: p.stall };
  }
  const targets = targetsFor(s, id, p.card, ctx).map((t) => {
    const tw = s.walkers[t]!;
    return { id: t, name: nameOf(ctx, t), coins: tw.coins, lanterns: tw.lanterns, stallSteps: stallSteps(s, tw.pos) };
  });
  return { kind: 'target' as const, deadline: p.deadline, card: p.card, targets };
}

/* ---------------------------------- mode ----------------------------------- */

export const lanternTrail = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const now = ctx.now();
    const endsAt = now + (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
    const lastAt = Math.max(now, endsAt - FINALE.seconds * 1000);
    const walkers: Record<PlayerId, Walker> = {};
    for (const p of ctx.players()) walkers[p.id] = newWalker(ctx);
    const s: State = { walkers, stalls: [], endsAt, lastAt, last: lastAt <= now, event: null, nextEventAt: null, lastEvent: null, plays: [], playSeq: 0, sold: 0, champion: null };
    placeStalls(s, ctx);
    ctx.setTimer('time', endsAt);
    if (!s.last) ctx.setTimer('last', lastAt);
    scheduleEvent(s, now + EVENT_TIMING.firstSec * 1000, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    const w = s.walkers[p.id];
    if (!w) {
      s.walkers[p.id] = newWalker(ctx);
      return;
    }
    // Back after leaving: carry on with the move, or with a new question.
    if (w.move && w.move.endedAt === null) run(s, p.id, ctx);
    else if (!w.stream.iid) streamNext(w.stream, ctx);
  },
  onPlayerLeave(s, p, ctx) {
    const w = s.walkers[p.id];
    if (!w) return;
    // Their move stops where it is, so nobody waits on them.
    w.pending = null;
    ctx.clearTimer(timerOf(p.id));
  },
  onAction(s, id, a, ctx) {
    const w = s.walkers[id];
    if (!w) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'answer': {
        if (w.pending) return { error: 'Make your choice first.' };
        const res = streamSubmit(w.stream, id, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (!res.correct) {
          if (w.stream.last) w.stream.last.text = 'No roll this time.';
          streamNext(w.stream, ctx);
          return;
        }
        startMove(s, id, ctx);
        if (w.stream.last && w.move) w.stream.last.text = `${rollText(w.move)}.`;
        return;
      }
      case 'fork':
        if (w.pending?.kind !== 'fork') return { error: 'There is no way to choose right now.' };
        chooseRoute(s, id, a.route, false, ctx);
        return;
      case 'buy':
        if (w.pending?.kind !== 'buy') return { error: 'There is nothing to buy right now.' };
        resolveBuy(s, id, a.buy, false, ctx);
        return;
      case 'target': {
        const p = w.pending;
        if (p?.kind !== 'target') return { error: 'There is nobody to pick right now.' };
        if (!targetsFor(s, id, p.card, ctx).includes(a.playerId)) return { error: p.card === 'trade' ? 'You cannot trade places with them right now. Pick someone else.' : 'You cannot pick them right now. Pick someone else.' };
        resolveTarget(s, id, a.playerId, ctx);
        return;
      }
    }
  },
  onTimer(s, timerId, ctx) {
    if (timerId === 'time') {
      ctx.endGame();
      return;
    }
    if (timerId === 'last') {
      s.last = true;
      ctx.feed(`${FINALE_EVENT.title}: Golden Lanterns cost ${Math.min(basePrice(ctx), FINALE.price)} coins until the end, and the stall stays close.`, { tone: 'big' });
      return;
    }
    if (timerId === 'event') {
      if (s.event) endEvent(s, ctx);
      else if (s.nextEventAt !== null) startEvent(s, ctx);
      return;
    }
    if (timerId === 'parade') {
      hop(s, ctx);
      return;
    }
    if (timerId.startsWith('choice:')) {
      const id = timerId.slice('choice:'.length);
      const p = s.walkers[id]?.pending;
      if (!p) return;
      // Nothing chosen in time: the long way, buy if possible, the leader.
      if (p.kind === 'fork') chooseRoute(s, id, 'long', true, ctx);
      else if (p.kind === 'buy') resolveBuy(s, id, true, true, ctx);
      else resolveTarget(s, id, null, ctx);
    }
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const w = me ? s.walkers[me] : undefined;
    const host = viewer.kind === 'host';
    const rank = ranks(s, ctx);
    const walkers = ctx
      .players()
      .filter((p) => s.walkers[p.id])
      .map((p) => {
        const x = s.walkers[p.id]!;
        // The big screen walks every Glim along its latest move; a phone only needs where everyone stands.
        return { id: p.id, pos: x.pos, l: x.lanterns, c: x.coins, rank: rank.get(p.id) ?? 0, seq: x.move?.seq ?? 0, ...(host && x.move ? { path: x.move.path, jumps: x.move.jumps } : {}) };
      });
    return {
      endsAt: s.endsAt,
      lastAt: s.lastAt,
      finalStretch: s.last,
      price: roomPrice(s, ctx),
      basePrice: basePrice(ctx),
      goal: ctx.settings.goalLanterns,
      stalls: s.stalls.map((x) => ({ id: x.id, pos: x.pos, from: x.from, movedAt: x.movedAt, why: x.why, n: x.n })),
      event: s.event ? { kind: s.event.kind, startsAt: s.event.startsAt, endsAt: s.event.endsAt } : null,
      nextEventAt: s.nextEventAt,
      walkers,
      plays: s.plays,
      sold: s.sold,
      odds: oddsFor(s, me, ctx),
      teams: teamRows(s, ctx)?.map(({ exact: _exact, ...t }) => t) ?? null,
      you:
        w && me
          ? {
              pos: w.pos,
              coins: w.coins,
              lanterns: w.lanterns,
              tickets: w.tickets,
              streak: w.stream.streak,
              rank: rank.get(me) ?? 0,
              price: priceFor(s, w, ctx).price,
              stallSteps: stallSteps(s, w.pos),
              question: w.pending ? null : streamQuestionView(w.stream, ctx),
              last: w.stream.last,
              move: moveView(w.move),
              pending: pendingView(s, me, w, ctx),
              hit: w.hit,
            }
          : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const w = s.walkers[p.id];
      const l = w?.lanterns ?? 0;
      const c = w?.coins ?? 0;
      return { playerId: p.id, score: l * 100_000 + c, label: `${lanternWord(l)}, ${plural(c, 'coin')}` };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...ctx.everyone().map((p) => s.walkers[p.id]?.lanterns ?? 0));
    const leaders = ctx.everyone().filter((p) => (s.walkers[p.id]?.lanterns ?? 0) === best).map((p) => nameOf(ctx, p.id));
    let summary = 'Nobody bought a Golden Lantern this time.';
    if (s.champion) summary = `${nameOf(ctx, s.champion)} collected ${lanternWord(s.walkers[s.champion]!.lanterns)} first.`;
    else if (best > 0) summary = leaders.length === 1 ? `${leaders[0]} collected ${lanternWord(best)}.` : `${listNames(leaders)} collected ${lanternWord(best)} each.`;
    return {
      standings,
      ...(teams
        ? {
            teamStandings: teams.map((t) => ({
              teamId: t.teamId,
              // Average lanterns, with average coins to break a tie.
              score: t.exact.lanterns + t.exact.coins / 1_000_000,
              label: `${t.lanterns === 1 ? '1 Golden Lantern' : `${t.lanterns} Golden Lanterns`} on average, ${plural(t.coins, 'coin')}`,
            })),
          }
        : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    const p = you.pending;
    if (p?.kind === 'fork') return { type: 'fork', route: shortcutPays(view.stalls.map((x: { pos: number }) => x.pos)) ? 'short' : 'long' };
    // Bots buy whenever they can.
    if (p?.kind === 'buy') return { type: 'buy', buy: true };
    if (p?.kind === 'target') {
      const targets: { id: string; coins: number; stallSteps: number | null }[] = p.targets;
      if (!targets.length) return null;
      // Pickpocket the richest; trade places with whoever is nearest a stall.
      const pick =
        p.card === 'pickpocket'
          ? targets.reduce((a, b) => (b.coins > a.coins ? b : a))
          : targets.reduce((a, b) => ((b.stallSteps ?? 99) < (a.stallSteps ?? 99) ? b : a));
      return { type: 'target', playerId: pick.id };
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    // Choices are quick taps. Answering takes a while, and a little longer than in other modes,
    // so practice bots keep pace with a player who watches every roll.
    if (view?.you?.pending) return 700 + rng.int(0, 1500);
    return 4000 + rng.int(0, 5000);
  },
});
