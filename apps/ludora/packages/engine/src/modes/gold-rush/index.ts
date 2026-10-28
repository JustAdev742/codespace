/*
 * Gold Rush: right answers give digs; each dig takes your shaft a level
 * deeper and finds something, or caves in. Bank your cart to keep it.
 *
 * Questions and digging run side by side: a player can answer, dig or bank
 * at any moment. A dig's outcome is drawn when the dig happens, from the
 * same odds the player sees (odds.ts), so nothing is decided ahead of time
 * and no view can leak it.
 *
 * Only banked gold counts. Carts still in a shaft when the whistle blows
 * count for nothing, so the last half-minute is a scramble to bank.
 */
import { z } from 'zod';
import { answerSchema, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  BONUS_EVERY,
  DIGS_PER_RIGHT,
  EVENT_INFO,
  EVENT_TIMING,
  FIND_INFO,
  GEAR,
  GEAR_INFO,
  GOLD_EVENTS,
  GROUND,
  JUMP_CONSOLATION,
  JUMP_SHARE,
  MAX_DIGS,
  PAN_BONUS,
  meta,
  settings,
  type FindKind,
  type GearId,
  type GoldEventId,
  type GroundKind,
  type RiskLevel,
} from './meta.ts';
import { averageFind, caveInPercent, digOdds, findWeights, goldRange, type DigMoment } from './odds.ts';

type Settings = {
  claimJumping: boolean;
  events: boolean;
  goalGold: number;
  risk: string;
  ground: string;
};

/** What the last dig turned up, for the player's result card and the scene. */
interface Find {
  seq: number;
  at: number;
  kind: FindKind;
  level: number;
  /** Gold added to the cart (or lost, for a cave-in, as a negative). */
  gold: number;
  /** A quartz vein doubled this find. */
  doubled: boolean;
  /** Claim jumping: whose cart it took from. */
  from: string | null;
  big: boolean;
}

interface Note {
  id: number;
  at: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

interface Miner {
  stream: StreamState;
  digs: number;
  /** The level the shaft has reached; 0 is the top. */
  depth: number;
  cart: number;
  banked: number;
  vein: boolean;
  gear: Record<GearId, number>;
  seq: number;
  last: Find | null;
  /** The last time this miner banked, for the scene's cart ride. */
  bankedAt: number;
  lastBank: number;
  notes: Note[];
  caveIns: number;
  deepest: number;
  best: number;
}

type NewsKind = 'bonanza' | 'nugget' | 'cavein' | 'jump' | 'bank' | 'goal';

interface News {
  id: number;
  at: number;
  kind: NewsKind;
  by: PlayerId;
  to: PlayerId | null;
  gold: number;
  level: number;
}

interface State {
  miners: Record<PlayerId, Miner>;
  endsAt: number;
  event: { id: GoldEventId; endsAt: number } | null;
  nextEventAt: number | null;
  lastEvent: GoldEventId | null;
  news: News[];
  seq: number;
  winner: PlayerId | null;
  biggest: { by: PlayerId; gold: number; kind: FindKind } | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('dig') }),
  z.object({ type: z.literal('bank') }),
  z.object({ type: z.literal('buy'), gear: z.enum(GEAR) }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const NEWS_KEEP = 8;
const NOTES_KEEP = 4;
/** Finds and losses this big make the goldfield news. */
const BIG_FIND = 120;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const goldText = (n: number) => `${fmt(n)} gold`;

function nameOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A miner';
}

function teamOf(ctx: ModeContext, id: PlayerId) {
  return (ctx.player(id) ?? ctx.everyone().find((p) => p.id === id))?.teamId ?? null;
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function newMiner(ctx: ModeContext): Miner {
  return { stream: streamInit(ctx), digs: 0, depth: 0, cart: 0, banked: 0, vein: false, gear: { pick: 0, props: 0, pan: 0 }, seq: 0, last: null, bankedAt: 0, lastBank: 0, notes: [], caveIns: 0, deepest: 0, best: 0 };
}

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

function moment(s: State, ctx: ModeContext<Settings>, m: Miner): DigMoment {
  return {
    ground: ctx.settings.ground as GroundKind,
    risk: ctx.settings.risk as RiskLevel,
    claimJumping: ctx.settings.claimJumping,
    level: m.depth + 1,
    props: m.gear.props,
    event: s.event && s.event.endsAt > ctx.now() ? s.event.id : null,
    vein: m.vein,
  };
}

/** Everyone whose cart a map could reach: the others in the game, never teammates. */
function rivals(s: State, ctx: ModeContext, id: PlayerId): EnginePlayer[] {
  const team = ctx.teams().length ? teamOf(ctx, id) : null;
  return ctx.players().filter((p) => p.id !== id && s.miners[p.id] && !(team !== null && p.teamId === team));
}

function note(s: State, m: Miner, at: number, text: string, tone: Note['tone']) {
  m.notes = [{ id: ++s.seq, at, text, tone }, ...m.notes].slice(0, NOTES_KEEP);
}

function addNews(s: State, at: number, item: Omit<News, 'id' | 'at'>) {
  s.news = [{ id: ++s.seq, at, ...item }, ...s.news].slice(0, NEWS_KEEP);
}

/* ---------------------------------- digging --------------------------------- */

/**
 * What one dig turns up at a moment: a cave-in, or a find and its gold (a map's
 * gold is worked out by the caller, from the cart it jumps). Draws from exactly
 * the odds players are shown.
 */
export function drawFind(mo: DigMoment, rng: Rng): { kind: FindKind; gold: number } {
  if (rng.next() * 100 < caveInPercent(mo)) return { kind: 'cavein', gold: 0 };
  const w = findWeights(mo);
  const kind = pickWeighted(
    (Object.entries(w) as [FindKind, number][]).map(([k, weight]) => ({ kind: k, weight })),
    rng,
  ).kind;
  const range = goldRange(kind, mo);
  return { kind, gold: range ? Math.round(range[0] + rng.next() * (range[1] - range[0])) : 0 };
}

function dig(s: State, ctx: ModeContext<Settings>, id: PlayerId): void {
  const m = s.miners[id]!;
  const mo = moment(s, ctx, m);
  const at = ctx.now();
  m.digs--;
  const drawn = drawFind(mo, ctx.rng);
  const kind = drawn.kind;
  if (kind === 'cavein') {
    const lost = m.cart;
    m.last = { seq: ++m.seq, at, kind: 'cavein', level: mo.level, gold: -lost, doubled: false, from: null, big: lost >= BIG_FIND };
    m.cart = 0;
    m.depth = 0;
    m.vein = false;
    m.caveIns++;
    if (lost >= BIG_FIND) addNews(s, at, { kind: 'cavein', by: id, to: null, gold: lost, level: mo.level });
    return;
  }
  m.depth = mo.level;
  m.deepest = Math.max(m.deepest, m.depth);
  const doubled = m.vein;
  m.vein = false;
  let gold = drawn.gold;
  let from: PlayerId | null = null;
  if (kind === 'vein') m.vein = true;
  if (kind === 'relic') m.digs = Math.min(MAX_DIGS, m.digs + 1);
  if (kind === 'map') {
    const target = rivals(s, ctx, id)
      .filter((p) => s.miners[p.id]!.cart > 0)
      .sort((a, b) => s.miners[b.id]!.cart - s.miners[a.id]!.cart || a.id.localeCompare(b.id))[0];
    if (target) {
      const t = s.miners[target.id]!;
      gold = Math.max(1, Math.floor(t.cart * JUMP_SHARE));
      t.cart -= gold;
      from = target.id;
      note(s, t, at, `${nameOf(ctx, id)} jumped your claim and took ${goldText(gold)} from your cart.`, 'bad');
      addNews(s, at, { kind: 'jump', by: id, to: target.id, gold, level: mo.level });
    } else gold = JUMP_CONSOLATION;
  }
  m.cart += gold;
  m.best = Math.max(m.best, gold);
  const big = gold >= BIG_FIND || kind === 'bonanza';
  m.last = { seq: ++m.seq, at, kind, level: mo.level, gold, doubled, from: from ? nameOf(ctx, from) : null, big };
  if (big && kind !== 'map') addNews(s, at, { kind: kind === 'bonanza' ? 'bonanza' : 'nugget', by: id, to: null, gold, level: mo.level });
  if (gold > 0 && (!s.biggest || gold > s.biggest.gold) && kind !== 'map') s.biggest = { by: id, gold, kind };
}

function bank(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const m = s.miners[id]!;
  const bonus = m.gear.pan ? Math.round(m.cart * PAN_BONUS) : 0;
  const total = m.cart + bonus;
  m.banked += total;
  m.lastBank = total;
  m.bankedAt = ctx.now();
  m.cart = 0;
  m.depth = 0;
  if (total >= BIG_FIND * 2) addNews(s, ctx.now(), { kind: 'bank', by: id, to: null, gold: total, level: 0 });
  const goal = ctx.settings.goalGold;
  if (goal && !s.winner && m.banked >= goal) {
    s.winner = id;
    addNews(s, ctx.now(), { kind: 'goal', by: id, to: null, gold: m.banked, level: 0 });
    ctx.feed(`${nameOf(ctx, id)} banked ${goldText(goal)} first!`, { tone: 'big' });
    ctx.endGame(`${nameOf(ctx, id)} banked ${goldText(goal)} first.`);
  }
}

/* ---------------------------------- events ---------------------------------- */

function scheduleEvent(s: State, ctx: ModeContext<Settings>, at: number) {
  if (at >= s.endsAt - 15_000) {
    s.nextEventAt = null;
    return;
  }
  s.nextEventAt = at;
  ctx.setTimer('event', at);
}

function startEvent(s: State, ctx: ModeContext<Settings>) {
  const at = s.nextEventAt ?? ctx.now();
  // Steady Ground means nothing on a creek with no cave-ins.
  const pool = GOLD_EVENTS.filter((e) => e !== s.lastEvent && !(e === 'steady' && !GROUND[ctx.settings.ground as GroundKind].caveIns));
  const id = pool[ctx.rng.int(0, pool.length - 1)]!;
  const endsAt = at + EVENT_INFO[id].seconds * 1000;
  s.event = { id, endsAt };
  s.lastEvent = id;
  ctx.setTimer('eventEnd', endsAt);
  ctx.feed(`${EVENT_INFO[id].label}: ${EVENT_INFO[id].blurb}`, { tone: 'big' });
  const jitter = ctx.rng.int(-EVENT_TIMING.jitterSec, EVENT_TIMING.jitterSec);
  scheduleEvent(s, ctx, at + (EVENT_TIMING.everySec + jitter) * 1000);
}

/* ---------------------------------- views ----------------------------------- */

function ranking(s: State, ctx: ModeContext, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.miners[p.id])
    .map((p) => {
      const m = s.miners[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, banked: m.banked, cart: m.cart, depth: m.depth, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.banked - a.banked || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.banked === r.banked ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function teamRows(s: State, ctx: ModeContext) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.miners[p.id]);
    const total = members.reduce((n, p) => n + s.miners[p.id]!.banked, 0);
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, average: members.length ? Math.round(total / members.length) : 0 };
  });
}

function gearView(m: Miner) {
  return GEAR.map((g) => {
    const level = m.gear[g];
    const next = GEAR_INFO[g].levels[level];
    return { id: g, label: GEAR_INFO[g].label, level, max: GEAR_INFO[g].levels.length, cost: next?.cost ?? null, effect: next?.effect ?? null, canBuy: Boolean(next && m.banked >= next.cost) };
  });
}

/** Shafts on the host's goldfield picture: every miner, most banked first, at most 40. */
const FIELD_MAX = 40;

/* ----------------------------------- mode ----------------------------------- */

export const goldRush = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const miners: Record<PlayerId, Miner> = {};
    for (const p of ctx.players()) miners[p.id] = newMiner(ctx);
    const now = ctx.now();
    const endsAt = now + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    const s: State = { miners, endsAt, event: null, nextEventAt: null, lastEvent: null, news: [], seq: 0, winner: null, biggest: null };
    if (ctx.settings.events) scheduleEvent(s, ctx, now + EVENT_TIMING.firstSec * 1000);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.miners[p.id] ??= newMiner(ctx);
  },
  onAction(s, playerId, a, ctx) {
    const m = s.miners[playerId];
    if (!m) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(m.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (res.correct) {
          const pick = Math.min(m.gear.pick, DIGS_PER_RIGHT.length - 1);
          let gained: number = DIGS_PER_RIGHT[pick] ?? 1;
          const bonus = res.streak > 0 && res.streak % (BONUS_EVERY[pick] ?? 3) === 0;
          if (bonus) gained++;
          const before = m.digs;
          m.digs = Math.min(MAX_DIGS, m.digs + gained);
          const got = m.digs - before;
          if (m.stream.last) m.stream.last.text = got === 0 ? 'Your dig bag is full: dig to make room' : `+${String(got)} ${got === 1 ? 'dig' : 'digs'}${bonus ? ' (streak bonus)' : ''}`;
        } else if (m.stream.last) m.stream.last.text = 'No dig';
        streamNext(m.stream, ctx);
        return;
      }
      case 'dig': {
        if (m.digs <= 0) return { error: 'You have no digs. Answer a question right to earn one.' };
        dig(s, ctx, playerId);
        return;
      }
      case 'bank': {
        if (m.cart <= 0) return { error: 'Your cart is empty. Dig something up first.' };
        bank(s, ctx, playerId);
        return;
      }
      case 'buy': {
        const level = m.gear[a.gear];
        const next = GEAR_INFO[a.gear].levels[level];
        if (!next) return { error: 'You already have the best of that.' };
        if (m.banked < next.cost) return { error: `That costs ${goldText(next.cost)} of banked gold.` };
        m.banked -= next.cost;
        m.gear[a.gear] = level + 1;
        note(s, m, ctx.now(), `${GEAR_INFO[a.gear].label}: ${next.effect}`, 'good');
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
    else if (id === 'eventEnd' && s.event && ctx.now() >= s.event.endsAt) s.event = null;
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const ground = ctx.settings.ground as GroundKind;
    const base = {
      endsAt: s.endsAt,
      goal: ctx.settings.goalGold,
      ground,
      levels: GROUND[ground].levels,
      claimJumping: ctx.settings.claimJumping,
      event: s.event && s.event.endsAt > ctx.now() ? { id: s.event.id, endsAt: s.event.endsAt } : null,
      nextEventAt: s.nextEventAt,
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') {
      return {
        ...base,
        field: rows.slice(0, FIELD_MAX).map((r) => {
          const m = s.miners[r.playerId]!;
          return { playerId: r.playerId, name: r.name, teamId: r.teamId, depth: m.depth, cart: m.cart, banked: m.banked, lastKind: m.last?.kind ?? null, lastSeq: m.seq, bankedAt: m.bankedAt };
        }),
        news: s.news.map((n) => ({ ...n, name: nameOf(ctx, n.by), target: n.to ? nameOf(ctx, n.to) : null })),
        banked: rows.reduce((n, r) => n + r.banked, 0),
        biggest: s.biggest ? { name: nameOf(ctx, s.biggest.by), gold: s.biggest.gold, kind: s.biggest.kind } : null,
      };
    }
    const m = me ? s.miners[me] : undefined;
    if (!me || !m) return { ...base, you: null };
    const mo = moment(s, ctx, m);
    return {
      ...base,
      you: {
        banked: m.banked,
        cart: m.cart,
        depth: m.depth,
        digs: m.digs,
        maxDigs: MAX_DIGS,
        vein: m.vein,
        rank: mine?.rank ?? null,
        teamId: ctx.player(me)?.teamId ?? null,
        streak: m.stream.streak,
        bonusEvery: BONUS_EVERY[Math.min(m.gear.pick, BONUS_EVERY.length - 1)],
        next: { level: mo.level, caveIn: caveInPercent(mo), odds: digOdds(mo), average: Math.round(averageFind(mo)) },
        gear: gearView(m),
        panBonus: m.gear.pan ? PAN_BONUS : 0,
        lastFind: m.last,
        bankedAt: m.bankedAt,
        lastBank: m.lastBank,
        notes: m.notes,
        question: streamQuestionView(m.stream, ctx),
        last: m.stream.last,
      },
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const gold = s.miners[p.id]?.banked ?? 0;
      return { playerId: p.id, score: gold, label: goldText(gold) };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leaders = standings.filter((r) => r.score === best);
    let summary = 'The whistle blew before anyone banked any gold.';
    if (s.winner) summary = `${nameOf(ctx, s.winner)} banked ${goldText(ctx.settings.goalGold)} first.`;
    else if (best > 0) summary = leaders.length === 1 ? `${nameOf(ctx, leaders[0]!.playerId)} banked the most gold: ${goldText(best)}.` : `${String(leaders.length)} miners tied with ${goldText(best)} banked.`;
    if (s.biggest) summary += ` Biggest find: ${FIND_INFO[s.biggest.kind].label.toLowerCase()} of ${goldText(s.biggest.gold)} by ${nameOf(ctx, s.biggest.by)}.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.average, label: `${goldText(t.average)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    const left = view.endsAt - ctx.now;
    // The whistle is close: get the cart to the bank.
    if (left < 25_000 && you.cart > 0) return { type: 'bank' };
    const affordable = (you.gear as { id: GearId; canBuy: boolean; cost: number | null }[]).filter((g) => g.canBuy && g.cost !== null && you.banked >= g.cost * 1.6);
    const buy = affordable.find((g) => g.id === 'props') ?? affordable[0];
    if (buy && left > 60_000) return { type: 'buy', gear: buy.id };
    // Braver bots dig deeper. The cave-in chance they will face is shown in the view, as for people.
    const nerve = 12 + ctx.skill * 14 + ctx.rng.int(-3, 3);
    if (you.cart > 0 && (you.next.caveIn > nerve || you.cart > 250 + ctx.skill * 250)) return { type: 'bank' };
    if (you.digs > 0) return { type: 'dig' };
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (you && (you.digs > 0 || (you.cart > 0 && you.next.caveIn > 20))) return 700 + rng.int(0, 900);
    return 2200 + rng.int(0, 4300);
  },
});
