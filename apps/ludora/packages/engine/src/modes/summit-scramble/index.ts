/*
 * Summit Scramble: right answers give grip; grip moves you up the mountain.
 *
 * Questions and climbing run side by side, as in Gold Rush: a player can
 * answer, climb, leap or throw a rope at any moment. A leap's outcome is
 * drawn when the leap happens, from the chance the Leap button shows
 * (odds.ts), so nothing is decided ahead of time and no view can leak it.
 *
 * Where a climber is on the mountain is a "party": one per player, or one per
 * team in Roped Teams, where the team shares a height, a grip bag and a score.
 */
import { z } from 'zod';
import { answerSchema, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { BotContext, BotMind, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { BONUS_EVERY, CAMP_EVERY, CLIMB, LEAP, MAX_GRIP, NIGHT_SIGHT, POINTS, ROPE_PULL, ROPES_PER_STRETCH, STEADY_MS, WIND, campBonus, campsBelow, meta, settings, summitBonus } from './meta.ts';
import { leapOdds } from './odds.ts';

type Settings = {
  summit: number;
  finishers: number;
  leaps: boolean;
  wind: boolean;
  ropes: boolean;
  roped: boolean;
  night: boolean;
};

export type MoveKind = 'climb' | 'leap' | 'slip' | 'pull' | 'pulled';

/** The last thing that moved a party, for the result line and the scene. */
interface Move {
  seq: number;
  at: number;
  kind: MoveKind;
  from: number;
  to: number;
  /** The player who did it (a teammate, in Roped Teams). */
  by: PlayerId;
  /** The other party of a rope: who you pulled up, or who pulled you. */
  other: string | null;
  /** The chance a leap had, in percent. */
  chance: number | null;
  /** A camp reached on this move, and in what place. */
  camp: { ledge: number; order: number; bonus: number } | null;
  /** Finishing place, when the move reached the summit. */
  summit: number | null;
  /** Picked up a rope on landing. */
  rope: boolean;
}

interface Party {
  id: string;
  ledge: number;
  /** The highest camp reached: nobody slides below it. */
  camp: number;
  grip: number;
  rope: boolean;
  seq: number;
  last: Move | null;
  /** Points beyond height: camps, the summit and ropes thrown. */
  bonus: number;
  /** Finishing place at the summit. */
  finished: number | null;
  /** When the party reached its current ledge, for breaking ties. */
  reachedAt: number;
  ropesThrown: number;
  slips: number;
}

interface Climber {
  stream: StreamState;
  party: string;
  /** No question until then: the Glim is catching its balance after a wrong answer. */
  steadyUntil: number;
}

type NewsKind = 'camp' | 'summit' | 'rope';

interface News {
  id: number;
  at: number;
  kind: NewsKind;
  party: string;
  other: string | null;
  ledge: number;
  order: number;
}

interface Wind {
  startsAt: number;
  endsAt: number;
}

interface State {
  climbers: Record<PlayerId, Climber>;
  parties: Record<string, Party>;
  endsAt: number;
  ropes: number[];
  /** Parties in the order they reached each camp. */
  camps: Record<number, string[]>;
  finished: string[];
  /** The gust announced or blowing, if any. */
  wind: Wind | null;
  nextWind: Wind | null;
  news: News[];
  seq: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('climb') }),
  z.object({ type: z.literal('leap') }),
  z.object({ type: z.literal('rope') }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const NEWS_KEEP = 8;
/** Climbers in a player's view besides themselves: the nearest on the mountain. */
const NEAR_MAX = 15;
/** Climbers drawn on the big screen. */
const HOST_MAX = 40;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const pointsText = (n: number) => `${fmt(n)} ${n === 1 ? 'point' : 'points'}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
export const campName = (ledge: number) => `Camp ${ledge / CAMP_EVERY}`;

/* --------------------------------- helpers --------------------------------- */

function findPlayer(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id) ?? ctx.everyone().find((p) => p.id === id);
}

function playerName(ctx: ModeContext, id: PlayerId) {
  return findPlayer(ctx, id)?.name ?? 'A climber';
}

function roped(ctx: ModeContext<Settings>) {
  return ctx.settings.roped && ctx.teams().length > 0;
}

function partyIdFor(ctx: ModeContext<Settings>, id: PlayerId) {
  const team = findPlayer(ctx, id)?.teamId ?? null;
  return roped(ctx) && team ? `team:${team}` : id;
}

/** A party's name: the team's in Roped Teams, otherwise the climber's. */
function partyName(ctx: ModeContext, partyId: string) {
  if (partyId.startsWith('team:')) return ctx.teams().find((t) => `team:${t.id}` === partyId)?.name ?? 'A team';
  return playerName(ctx, partyId);
}

function points(p: Party) {
  return p.ledge * POINTS.ledge + p.bonus;
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function newParty(id: string, at: number): Party {
  return { id, ledge: 0, camp: 0, grip: 0, rope: false, seq: 0, last: null, bonus: 0, finished: null, reachedAt: at, ropesThrown: 0, slips: 0 };
}

function join(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const party = partyIdFor(ctx, id);
  s.parties[party] ??= newParty(party, ctx.now());
  s.climbers[id] ??= { stream: streamInit(ctx), party, steadyUntil: 0 };
}

function addNews(s: State, at: number, item: Omit<News, 'id' | 'at'>) {
  s.news = [{ id: ++s.seq, at, ...item }, ...s.news].slice(0, NEWS_KEEP);
}

/** Where ropes hang: a couple on each stretch between camps, never on a camp or the summit. */
export function placeRopes(summit: number, rng: Rng): number[] {
  const out: number[] = [];
  for (let base = 0; base < summit; base += CAMP_EVERY) {
    const spots: number[] = [];
    for (let l = base + 2; l <= base + CAMP_EVERY - 2 && l < summit; l++) spots.push(l);
    for (let i = 0; i < ROPES_PER_STRETCH && spots.length; i++) out.push(spots.splice(rng.int(0, spots.length - 1), 1)[0]!);
  }
  return out.sort((a, b) => a - b);
}

/** Whether a leap works, drawn with exactly the chance the button shows. */
export function drawLeap(chance: number, rng: Rng): boolean {
  return rng.next() * 100 < chance;
}

function windBlowing(s: State, now: number) {
  return Boolean(s.wind && now >= s.wind.startsAt && now < s.wind.endsAt);
}

/** Parties with someone still in the game. */
function activeParties(s: State, ctx: ModeContext, without: PlayerId | null = null): Party[] {
  const ids = new Set(ctx.players().filter((p) => p.id !== without && s.climbers[p.id]).map((p) => s.climbers[p.id]!.party));
  return [...ids].map((id) => s.parties[id]!).filter(Boolean);
}

function checkFinish(s: State, ctx: ModeContext<Settings>, without: PlayerId | null = null) {
  const active = activeParties(s, ctx, without);
  if (!active.length) return;
  const needed = Math.min(ctx.settings.finishers, active.length);
  const done = active.filter((p) => p.finished !== null).length;
  // Climbers who reached the summit and left still count towards the limit, so no finishing place
  // is ever past it (the summit bonus is scaled to it).
  if (done >= needed || s.finished.length >= ctx.settings.finishers) {
    const first = s.finished[0];
    ctx.endGame(first ? `${partyName(ctx, first)} reached the summit first.` : undefined);
  }
}

/* --------------------------------- moving --------------------------------- */

/**
 * Put a party on a ledge: camps passed on the way, the summit, and a rope to
 * pick up on landing. Returns what happened, for the move record.
 */
function arrive(s: State, ctx: ModeContext<Settings>, p: Party, to: number): Pick<Move, 'camp' | 'summit' | 'rope'> {
  const summit = ctx.settings.summit;
  const at = ctx.now();
  const out: Pick<Move, 'camp' | 'summit' | 'rope'> = { camp: null, summit: null, rope: false };
  if (to !== p.ledge) p.reachedAt = at;
  p.ledge = Math.max(0, Math.min(summit, to));
  for (const c of campsBelow(summit)) {
    if (c <= p.camp || c > p.ledge) continue;
    const list = (s.camps[c] ??= []);
    list.push(p.id);
    const order = list.length;
    const bonus = campBonus(order);
    p.bonus += bonus;
    p.camp = c;
    out.camp = { ledge: c, order, bonus };
    if (order <= 3) addNews(s, at, { kind: 'camp', party: p.id, other: null, ledge: c, order });
  }
  if (p.ledge >= summit && p.finished === null) {
    s.finished.push(p.id);
    p.finished = s.finished.length;
    p.bonus += summitBonus(p.finished, ctx.settings.finishers);
    p.rope = false;
    out.summit = p.finished;
    addNews(s, at, { kind: 'summit', party: p.id, other: null, ledge: summit, order: p.finished });
    ctx.feed(`${partyName(ctx, p.id)} reached the summit ${p.finished === 1 ? 'first' : `in ${ordinal(p.finished)} place`}!`, { tone: p.finished === 1 ? 'big' : 'info' });
  }
  if (ctx.settings.ropes && !p.rope && p.finished === null && s.ropes.includes(p.ledge)) {
    p.rope = true;
    out.rope = true;
  }
  return out;
}

function record(p: Party, at: number, m: Omit<Move, 'seq' | 'at'>) {
  p.last = { seq: ++p.seq, at, ...m };
}

/** The climber a rope would reach: the nearest party below, never your own, never one at the summit. */
function ropeTarget(s: State, ctx: ModeContext, p: Party): Party | null {
  const below = activeParties(s, ctx).filter((o) => o.id !== p.id && o.finished === null && o.ledge < p.ledge);
  below.sort((a, b) => b.ledge - a.ledge || a.reachedAt - b.reachedAt || a.id.localeCompare(b.id));
  return below[0] ?? null;
}

/* ---------------------------------- wind ----------------------------------- */

function scheduleWind(s: State, ctx: ModeContext<Settings>, startsAt: number) {
  const endsAt = startsAt + WIND.blowSec * 1000;
  if (endsAt >= s.endsAt - 5000) {
    s.nextWind = null;
    return;
  }
  s.nextWind = { startsAt, endsAt };
  ctx.setTimer('windWarn', startsAt - WIND.warnSec * 1000);
  ctx.setTimer('windStart', startsAt);
  ctx.setTimer('windEnd', endsAt);
}

/* ---------------------------------- views ---------------------------------- */

interface Row {
  playerId: PlayerId;
  name: string;
  teamId: string | null;
  ledge: number;
  points: number;
  finished: number | null;
  rank: number;
  isYou: boolean;
}

function ranking(s: State, ctx: ModeContext, me: PlayerId | null): Row[] {
  const rows = ctx
    .players()
    .filter((p) => s.climbers[p.id])
    .map((p) => {
      const party = s.parties[s.climbers[p.id]!.party]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, ledge: party.ledge, points: points(party), finished: party.finished, reachedAt: party.reachedAt, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.points - a.points || b.ledge - a.ledge || a.reachedAt - b.reachedAt || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.rank : i + 1));
  return rows.map(({ reachedAt: _r, ...r }) => r);
}

function teamRows(s: State, ctx: ModeContext<Settings>) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.climbers[p.id]);
    if (roped(ctx)) {
      const party = s.parties[`team:${t.id}`];
      return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, score: party ? points(party) : 0, ledge: party?.ledge ?? 0 };
    }
    const total = members.reduce((n, p) => n + points(s.parties[s.climbers[p.id]!.party]!), 0);
    const top = Math.max(0, ...members.map((p) => s.parties[s.climbers[p.id]!.party]!.ledge));
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, score: members.length ? Math.round(total / members.length) : 0, ledge: top };
  });
}

function moveView(ctx: ModeContext, m: Move | null) {
  if (!m) return null;
  return { ...m, by: playerName(ctx, m.by), other: m.other ? partyName(ctx, m.other) : null };
}

/** One climber as the scenes draw them. */
function climberView(s: State, ctx: ModeContext, id: PlayerId, me: PlayerId | null) {
  const p = s.parties[s.climbers[id]!.party]!;
  const pl = findPlayer(ctx, id);
  return { playerId: id, name: pl?.name ?? 'A climber', teamId: pl?.teamId ?? null, ledge: p.ledge, seq: p.seq, kind: p.last?.kind ?? null, finished: p.finished, rope: p.rope, isYou: id === me };
}

/** The race for the next camp nobody has reached (or for the summit): the three nearest it. */
function race(s: State, ctx: ModeContext<Settings>) {
  const summit = ctx.settings.summit;
  const goal = campsBelow(summit).find((c) => !s.camps[c]?.length) ?? summit;
  const parties = activeParties(s, ctx)
    .filter((p) => p.ledge < goal)
    .sort((a, b) => b.ledge - a.ledge || a.reachedAt - b.reachedAt || a.id.localeCompare(b.id))
    .slice(0, 3);
  return { ledge: goal, summit: goal === summit, leaders: parties.map((p) => ({ name: partyName(ctx, p.id), ledge: p.ledge, togo: goal - p.ledge })) };
}

/* ----------------------------------- mode ---------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A practice bot with a mind reads the leap chance on screen and goes for it when it feels lucky
 * enough: a bold bot leaps on worse odds than a careful one, and a bot on a roll a little sooner.
 * It throws a rope to a teammate whenever one is in reach.
 */
function mindedBot(view: any, ctx: BotContext, mind: BotMind): Action | null {
  const you = view?.you;
  if (!you) return null;
  if (you.finished === null) {
    if (you.rope && you.ropeTarget) return { type: 'rope' };
    const leap = you.leap as { chance: number; cost: number } | null;
    if (leap && you.grip >= leap.cost) {
      const need = 88 - mind.boldness() * 35;
      if (leap.chance >= need + (mind.random() - 0.5) * 10) return { type: 'leap' };
    }
    if (you.grip >= 1) return { type: 'climb' };
  }
  const q = you.question;
  return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
}

export const summitScramble = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const now = ctx.now();
    const endsAt = now + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    const s: State = { climbers: {}, parties: {}, endsAt, ropes: [], camps: {}, finished: [], wind: null, nextWind: null, news: [], seq: 0 };
    for (const p of ctx.players()) join(s, ctx, p.id);
    if (ctx.settings.ropes) s.ropes = placeRopes(ctx.settings.summit, ctx.rng);
    if (ctx.settings.wind && ctx.settings.leaps) scheduleWind(s, ctx, now + WIND.firstSec * 1000);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    join(s, ctx, p.id);
  },
  onPlayerLeave(s, p, ctx) {
    if (ctx.now() < s.endsAt) checkFinish(s, ctx, p.id);
  },
  onAction(s, playerId, a, ctx) {
    const c = s.climbers[playerId];
    if (!c) return { error: 'You are not in this game.' };
    const p = s.parties[c.party]!;
    const now = ctx.now();
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(c.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        const last = c.stream.last;
        if (res.correct) {
          if (p.finished !== null) {
            if (last) last.text = 'Right! You are already at the summit.';
          } else {
            const bonus = res.streak > 0 && res.streak % BONUS_EVERY === 0;
            const before = p.grip;
            p.grip = Math.min(MAX_GRIP, p.grip + 1 + (bonus ? 1 : 0));
            const got = p.grip - before;
            if (last) last.text = got === 0 ? 'Your grip is full: climb to use it' : `+${String(got)} grip${bonus ? ' (streak bonus)' : ''}`;
          }
          streamNext(c.stream, ctx);
        } else {
          if (last) last.text = 'No grip this time. Your Glim is catching its balance.';
          c.steadyUntil = now + STEADY_MS;
          ctx.setTimer(`steady:${playerId}`, c.steadyUntil);
        }
        return;
      }
      case 'climb': {
        if (p.finished !== null) return { error: 'You are already at the summit.' };
        if (p.grip < CLIMB.cost) return { error: 'You have no grip. Answer a question right to earn some.' };
        p.grip -= CLIMB.cost;
        const from = p.ledge;
        const what = arrive(s, ctx, p, from + CLIMB.gain);
        record(p, now, { kind: 'climb', from, to: p.ledge, by: playerId, other: null, chance: null, ...what });
        checkFinish(s, ctx);
        return;
      }
      case 'leap': {
        if (!ctx.settings.leaps) return { error: 'There are no leaps in this climb.' };
        if (p.finished !== null) return { error: 'You are already at the summit.' };
        if (p.grip < LEAP.cost) return { error: `A leap takes ${String(LEAP.cost)} grip.` };
        p.grip -= LEAP.cost;
        const from = p.ledge;
        const odds = leapOdds(from, p.camp, ctx.settings.summit, windBlowing(s, now));
        if (drawLeap(odds.chance, ctx.rng)) {
          const what = arrive(s, ctx, p, odds.land);
          record(p, now, { kind: 'leap', from, to: p.ledge, by: playerId, other: null, chance: odds.chance, ...what });
          checkFinish(s, ctx);
        } else {
          if (odds.fall !== p.ledge) p.reachedAt = now;
          p.ledge = odds.fall;
          p.slips++;
          record(p, now, { kind: 'slip', from, to: p.ledge, by: playerId, other: null, chance: odds.chance, camp: null, summit: null, rope: false });
        }
        return;
      }
      case 'rope': {
        if (!p.rope) return { error: 'You have no rope. Land on a ledge with a rope to pick one up.' };
        const target = ropeTarget(s, ctx, p);
        if (!target) return { error: 'There is nobody below you to throw a rope to.' };
        p.rope = false;
        p.ropesThrown++;
        if (p.ropesThrown <= POINTS.ropeScored) p.bonus += POINTS.rope;
        const from = target.ledge;
        const what = arrive(s, ctx, target, Math.min(p.ledge, from + ROPE_PULL));
        record(target, now, { kind: 'pulled', from, to: target.ledge, by: playerId, other: p.id, chance: null, ...what });
        record(p, now, { kind: 'pull', from: p.ledge, to: p.ledge, by: playerId, other: target.id, chance: null, camp: null, summit: null, rope: false });
        addNews(s, now, { kind: 'rope', party: p.id, other: target.id, ledge: target.ledge, order: 0 });
        checkFinish(s, ctx);
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'time') {
      ctx.endGame();
      return;
    }
    if (id.startsWith('steady:')) {
      const c = s.climbers[id.slice('steady:'.length)];
      if (c && !c.stream.iid) streamNext(c.stream, ctx);
      return;
    }
    if (id === 'windWarn' && s.nextWind) {
      s.wind = s.nextWind;
      if (!ctx.settings.night) ctx.feed(`The wind is picking up! In ${String(WIND.warnSec)} seconds leaps will work only 5 times in 10.`, { tone: 'big' });
    } else if (id === 'windStart' && s.wind) {
      s.wind = { ...s.wind };
      if (ctx.settings.night) ctx.feed('A gust out of the dark! Leaps work only 5 times in 10 while it blows.', { tone: 'big' });
    } else if (id === 'windEnd') {
      s.wind = null;
      const jitter = ctx.rng.int(-WIND.jitterSec, WIND.jitterSec);
      scheduleWind(s, ctx, ctx.now() + (WIND.everySec + jitter) * 1000);
    }
  },
  view(s, viewer, ctx) {
    const now = ctx.now();
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const night = ctx.settings.night;
    const summit = ctx.settings.summit;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const blowing = windBlowing(s, now);
    // In a Night Climb the wind is a surprise: nobody sees it coming.
    const wind = s.wind && s.wind.endsAt > now && (!night || blowing) ? { startsAt: s.wind.startsAt, endsAt: s.wind.endsAt, blowing } : null;
    const base = {
      endsAt: s.endsAt,
      summit,
      camps: campsBelow(summit).map((ledge) => ({ ledge, first: (s.camps[ledge] ?? []).slice(0, 3).map((id) => partyName(ctx, id)) })),
      rules: { leaps: ctx.settings.leaps, ropes: ctx.settings.ropes, roped: roped(ctx), night, sight: NIGHT_SIGHT },
      wind,
      finishers: Math.min(ctx.settings.finishers, Math.max(1, activeParties(s, ctx).length)),
      finished: s.finished.map((id) => partyName(ctx, id)),
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') {
      const shown = rows.slice(0, HOST_MAX);
      const highest = Math.max(0, ...shown.map((r) => r.ledge));
      return {
        ...base,
        ropes: night ? s.ropes.filter((l) => l <= highest + NIGHT_SIGHT) : s.ropes,
        climbers: shown.map((r) => climberView(s, ctx, r.playerId, null)),
        news: s.news.map((n) => ({ ...n, name: partyName(ctx, n.party), other: n.other ? partyName(ctx, n.other) : null })),
        race: race(s, ctx),
      };
    }
    const c = me ? s.climbers[me] : undefined;
    if (!me || !c) return { ...base, ropes: night ? [] : s.ropes, climbers: [], you: null };
    const p = s.parties[c.party]!;
    const near = ctx
      .players()
      .filter((o) => o.id !== me && s.climbers[o.id])
      .map((o) => ({ id: o.id, d: Math.abs(s.parties[s.climbers[o.id]!.party]!.ledge - p.ledge) }))
      .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
      .slice(0, NEAR_MAX)
      .map((o) => climberView(s, ctx, o.id, me));
    const target = p.rope ? ropeTarget(s, ctx, p) : null;
    const nextCamp = campsBelow(summit).find((l) => l > p.ledge) ?? summit;
    return {
      ...base,
      ropes: night ? s.ropes.filter((l) => l <= p.ledge + NIGHT_SIGHT) : s.ropes,
      climbers: [climberView(s, ctx, me, me), ...near],
      you: {
        ledge: p.ledge,
        camp: p.camp,
        nextCamp,
        grip: p.grip,
        maxGrip: MAX_GRIP,
        rope: p.rope,
        ropeTarget: target ? partyName(ctx, target.id) : null,
        steadyUntil: c.steadyUntil > now ? c.steadyUntil : null,
        finished: p.finished,
        points: points(p),
        rank: mine?.rank ?? null,
        team: c.party.startsWith('team:') ? partyName(ctx, c.party) : null,
        streak: c.stream.streak,
        bonusEvery: BONUS_EVERY,
        climb: { cost: CLIMB.cost, gain: CLIMB.gain },
        leap: ctx.settings.leaps ? leapOdds(p.ledge, p.camp, summit, blowing) : null,
        move: moveView(ctx, p.last),
        question: streamQuestionView(c.stream, ctx),
        last: c.stream.last,
      },
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((pl) => {
      const c = s.climbers[pl.id];
      const p = c ? s.parties[c.party] : undefined;
      const score = p ? points(p) : 0;
      const where = !p ? 'did not climb' : p.finished !== null ? `summit, ${ordinal(p.finished)}` : p.ledge === 0 ? 'at the foot' : `ledge ${String(p.ledge)}`;
      return { playerId: pl.id, score, label: `${pointsText(score)} (${where})` };
    });
    const teams = teamRows(s, ctx);
    let summary: string;
    const first = s.finished[0];
    if (first) {
      summary = `${partyName(ctx, first)} reached the summit first.`;
      if (s.finished.length > 1) summary += ` ${String(s.finished.length)} made it to the top.`;
    } else {
      const parties = Object.values(s.parties).sort((a, b) => b.ledge - a.ledge || a.reachedAt - b.reachedAt);
      const top = parties[0];
      summary = top && top.ledge > 0 ? `Nobody reached the summit. ${partyName(ctx, top.id)} climbed highest: ledge ${String(top.ledge)} of ${String(ctx.settings.summit)}.` : 'Nobody left the foot of the mountain.';
    }
    const ropes = Object.values(s.parties).reduce((n, p) => n + p.ropesThrown, 0);
    if (ropes) summary += ` ${String(ropes)} ${ropes === 1 ? 'rope was' : 'ropes were'} thrown to climbers below.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.score, label: roped(ctx) ? `${pointsText(t.score)} (ledge ${String(t.ledge)})` : `${pointsText(t.score)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    if (ctx.mind) return mindedBot(view, ctx, ctx.mind);
    const you = view?.you;
    if (!you) return null;
    if (you.finished === null) {
      if (you.rope && you.ropeTarget) return { type: 'rope' };
      const leap = you.leap as { chance: number; cost: number } | null;
      // In calm air a leap is the better bet on average; in the wind two climbs are. Bots mostly play the odds.
      if (leap && you.grip >= leap.cost && leap.chance >= 70 && (you.ledge === you.camp || ctx.rng.next() < 0.75)) return { type: 'leap' };
      if (you.grip >= 1) return { type: 'climb' };
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (you && you.finished === null && (you.grip > 0 || (you.rope && you.ropeTarget))) return 500 + rng.int(0, 900);
    if (you && you.finished !== null) return 6000 + rng.int(0, 6000);
    return 2200 + rng.int(0, 4300);
  },
});
