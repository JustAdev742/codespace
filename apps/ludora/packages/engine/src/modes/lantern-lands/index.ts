/*
 * Lantern Lands: teams light up a shared map of hexagon lands.
 *
 * Right answers give a player energy (1, or 2 after three right in a row).
 * Energy is spent on the map, one action at a time, applied in the order the
 * actions arrive: claim an empty land next to your team's, fortify one of
 * your team's lands, or raid a rival land next to yours (a raid takes off a
 * fort, and captures a land that has none). Every action is checked against
 * the map as it is when it arrives; one that no longer makes sense (someone
 * got there first) is refused with a friendly message and costs nothing.
 *
 * Every few seconds each team with players scores its lands plus a bonus per
 * shrine. Room events change the rules for 30 seconds at a time, and the last
 * 45 seconds (the final glow) score double. Team score is points, not an
 * average: instead a smaller team's right answers fill a team bonus meter
 * (the small team boost), as do a team's that is behind on lands (the
 * underdog boost), and the meter pays out bonus energy to its players.
 *
 * The map itself (geometry, homes, shrines, lakes and hills) lives in map.ts,
 * which the screens import too.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, EngineTeam, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { makeTeams } from '../../teams.ts';
import { nameOf } from '../rules.ts';
import { MAP_SIZES, buildMap, distancesFrom, grid, orderFrom, shrineName, type LanternMap, type MapSize } from './map.ts';
import {
  BOOST_CAP,
  DEFAULT_TIME_SEC,
  EVENTS,
  EVENT_EVERY_MS,
  EVENT_FIRST_MS,
  EVENT_KINDS,
  EVENT_MS,
  EVENT_WEIGHTS,
  FINAL_GLOW_MS,
  SHRINE_BONUS,
  SHRINE_ONLY_POINTS,
  SHRINE_FORT_COST,
  SHRINE_RAID_COST,
  STREAK_FOR_DOUBLE,
  UNDERDOG_BOOST,
  meta,
  settings,
  type EventKind,
} from './meta.ts';

type Settings = {
  mapSize: string;
  shrines: string;
  scoreEvery: string;
  fortMax: string;
  events: boolean;
  fog: boolean;
  goalPoints: number;
  scoring: string;
  claimFort: boolean;
  energyCap: number;
  doubleEnergy: boolean;
};

type Ctx = ModeContext<Settings>;
export type MoveKind = 'claim' | 'fortify' | 'raid' | 'capture';

/** No team: an empty land (and, in a fogged view, a land you cannot see is -2). */
export const NOBODY = -1;
export const UNSEEN = -2;
/** A fort you cannot see (fog), in a view. */
export const HIDDEN_FORT = -1;

/** Ownership changes kept for the big screen's glow, and how long a change glows. */
const CHANGES_KEPT = 24;
const CHANGE_GLOW_MS = 4000;
const PLAYS_KEPT = 6;
/** A shrine that keeps changing hands is announced to the room at most this often; Big plays still lists every capture. */
export const SHRINE_NEWS_GAP_MS = 15_000;
/** A team's bonus meter holds at most this much, so it cannot be saved up for the final glow. */
export const BONUS_METER_MAX = 3;
/** Contribution points: what each kind of help is worth in the player standings. */
export const CONTRIBUTION = { claims: 3, captures: 5, raids: 2, forts: 2, right: 1 } as const;

interface Member {
  stream: StreamState;
  team: number;
  energy: number;
  claims: number;
  captures: number;
  /** Raids that took a fort off without capturing. */
  raids: number;
  forts: number;
  right: number;
  /** The player's last map action, for their own screen. */
  move: { kind: MoveKind; land: number; at: number; fort: number } | null;
}

interface Change {
  land: number;
  at: number;
  team: number;
  from: number;
}

interface Play {
  at: number;
  team: number;
  text: string;
  shrine: boolean;
}

interface State {
  teams: EngineTeam[];
  map: LanternMap;
  /** Team index holding each land, or NOBODY. */
  owner: number[];
  fort: number[];
  points: number[];
  /**
   * Each team's bonus meter: the small team and underdog boosts fill it with
   * every right answer by anyone on the team, and each whole unit becomes 1
   * energy for the next teammate who answers right with room to hold it.
   */
  bonus: number[];
  /** Points each team gained at the last scoring. */
  gains: number[];
  members: Record<PlayerId, Member>;
  endsAt: number;
  glowAt: number;
  scoreMs: number;
  nextScoreAt: number;
  lastScoreAt: number | null;
  event: { kind: EventKind; startedAt: number; endsAt: number } | null;
  lastEvent: EventKind | null;
  nextEventAt: number | null;
  eventsRun: number;
  /** Shrines lit at least once, so only the first claim of each is announced. */
  lit: number[];
  /** When each shrine's capture was last announced, by land. */
  shrineNews: Record<number, number>;
  changes: Change[];
  plays: Play[];
  winners: number[] | null;
  endedBy: 'time' | 'goal' | null;
}

const land = z.number().int().min(0).max(400);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('claim'), land }),
  z.object({ type: z.literal('fortify'), land }),
  z.object({ type: z.literal('raid'), land }),
]);
type Action = z.infer<typeof action>;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export const fortMaxOf = (st: Pick<Settings, 'fortMax'>) => (st.fortMax === '5' ? 5 : 3);
export const radiusOf = (st: Pick<Settings, 'mapSize'>) => MAP_SIZES[(st.mapSize in MAP_SIZES ? st.mapSize : 'normal') as MapSize];

function teamName(s: State, team: number) {
  return s.teams[team]?.name ?? 'other team';
}

const blockedOf = (map: LanternMap) => new Set([...map.lakes, ...map.hills]);
const isShrine = (s: State, l: number) => s.map.shrines.includes(l);
const isHome = (s: State, l: number) => s.map.homes.includes(l);
const labelOf = (s: State, l: number) => grid(s.map.radius).labels[l] ?? '?';
const placeName = (s: State, l: number) => (isShrine(s, l) ? shrineName(s.map.radius, l) : labelOf(s, l));

/** Players still in the game on each team (connected or not). */
function presentCounts(s: State, ctx: Ctx, connectedOnly: boolean): number[] {
  const counts = s.teams.map(() => 0);
  for (const p of ctx.players()) {
    const m = s.members[p.id];
    if (m && (!connectedOnly || p.connected)) counts[m.team] = (counts[m.team] ?? 0) + 1;
  }
  return counts;
}

/** Lands and shrines each team holds. */
function holdings(s: State): { lands: number[]; shrines: number[] } {
  const lands = s.teams.map(() => 0);
  const shrines = s.teams.map(() => 0);
  s.owner.forEach((o, i) => {
    if (o < 0) return;
    lands[o] = (lands[o] ?? 0) + 1;
    if (isShrine(s, i)) shrines[o] = (shrines[o] ?? 0) + 1;
  });
  return { lands, shrines };
}

/**
 * Underdogs: the teams still playing that hold the fewest lands, unless every
 * team playing is level. Their players can hold one more energy.
 */
function underdogs(s: State, ctx: Ctx): boolean[] {
  const playing = presentCounts(s, ctx, false).map((n) => n > 0);
  const { lands } = holdings(s);
  const counts = lands.filter((_, i) => playing[i]);
  const min = Math.min(...counts);
  const level = counts.every((n) => n === min);
  return lands.map((n, i) => Boolean(playing[i]) && !level && n === min);
}

function capOf(s: State, team: number, ctx: Ctx, under = underdogs(s, ctx)): number {
  return ctx.settings.energyCap + (under[team] ? 1 : 0);
}

/**
 * Small team boost: how much extra a right answer is worth on this team,
 * (players on the biggest team) ÷ (players on yours) − 1, counting connected
 * players, so a team of 6 against a team of 7 gets 1 bonus energy every 6 right answers.
 */
export function smallTeamBoost(mine: number, biggest: number): number {
  if (biggest <= mine || biggest <= 0) return 0;
  return Math.min(BOOST_CAP, biggest / Math.max(1, mine)) - 1;
}

/**
 * Underdog boost: (1 − your team's lands ÷ the leading team's lands) × UNDERDOG_BOOST,
 * so a team with half the leader's lands charges 0.375 bonus energy per energy earned.
 */
export function underdogBoost(mine: number, most: number): number {
  return most > 0 ? round6(Math.max(0, 1 - mine / most) * UNDERDOG_BOOST) : 0;
}

/** Both boosts for a team, and what they come from (for the player's screen). */
function boostOf(s: State, team: number, ctx: Ctx) {
  const connected = presentCounts(s, ctx, true);
  const players = Math.max(1, connected[team] ?? 0);
  const biggest = Math.max(0, ...connected);
  const { lands } = holdings(s);
  const mine = lands[team] ?? 0;
  const most = Math.max(0, ...lands);
  const small = round6(smallTeamBoost(players, biggest));
  const under = underdogBoost(mine, most);
  return { small, under, total: small + under, players, biggest, lands: mine, most };
}

/** Energy one right answer gives before any boost: 2 after a streak, in a double-energy event, or with double energy on. */
export function energyFor(streak: number, double: boolean): number {
  return double || streak > STREAK_FOR_DOUBLE ? 2 : 1;
}

function teamOf(s: State, p: EnginePlayer, ctx: Ctx): number {
  const i = s.teams.findIndex((t) => t.id === p.teamId);
  if (i >= 0) return i;
  // Teams are required, so this is a safety net: join the team with the fewest players.
  const counts = presentCounts(s, ctx, false);
  let best = 0;
  counts.forEach((n, t) => {
    if (n < (counts[best] ?? 0)) best = t;
  });
  return best;
}

function newMember(s: State, p: EnginePlayer, ctx: Ctx): Member {
  return { stream: streamInit(ctx), team: teamOf(s, p, ctx), energy: 0, claims: 0, captures: 0, raids: 0, forts: 0, right: 0, move: null };
}

export function contribution(m: Pick<Member, 'claims' | 'captures' | 'raids' | 'forts' | 'right'>): number {
  return m.claims * CONTRIBUTION.claims + m.captures * CONTRIBUTION.captures + m.raids * CONTRIBUTION.raids + m.forts * CONTRIBUTION.forts + m.right * CONTRIBUTION.right;
}

/** "4 claims, 2 captures, 1 raid, 3 forts", or the right answers when nothing was done on the map. */
export function contributionLabel(m: Pick<Member, 'claims' | 'captures' | 'raids' | 'forts' | 'right'>): string {
  const parts = [
    m.claims ? plural(m.claims, 'claim') : '',
    m.captures ? plural(m.captures, 'capture') : '',
    m.raids ? plural(m.raids, 'raid') : '',
    m.forts ? plural(m.forts, 'fort') : '',
  ].filter(Boolean);
  if (!parts.length) return plural(m.right, 'right answer');
  return parts.join(', ');
}

/** Lands next to (not on) the team's lands. */
function nearTeam(s: State, team: number): boolean[] {
  const g = grid(s.map.radius);
  const near = s.owner.map(() => false);
  s.owner.forEach((o, i) => {
    if (o !== team) return;
    for (const n of g.adj[i]!) if (s.owner[n] !== team) near[n] = true;
  });
  return near;
}

/** Lands a player of `team` could act on right now. */
function optionsFor(s: State, team: number, ctx: Ctx) {
  const near = nearTeam(s, team);
  const blocked = blockedOf(s.map);
  const max = fortMaxOf(ctx.settings);
  const claim: number[] = [];
  const fortify: number[] = [];
  const raid: number[] = [];
  s.owner.forEach((o, i) => {
    if (blocked.has(i)) return;
    if (o === NOBODY && near[i]) claim.push(i);
    else if (o === team && !isHome(s, i) && (s.fort[i] ?? 0) < max) fortify.push(i);
    else if (o >= 0 && o !== team && near[i] && !isHome(s, i)) raid.push(i);
  });
  return { claim, fortify, raid };
}

function recordChange(s: State, l: number, team: number, from: number, at: number) {
  s.changes = [{ land: l, at, team, from }, ...s.changes.filter((c) => at - c.at < CHANGE_GLOW_MS)].slice(0, CHANGES_KEPT);
}

function recordPlay(s: State, play: Play) {
  s.plays = [play, ...s.plays].slice(0, PLAYS_KEPT);
}

/* -------------------------------- actions ------------------------------- */

function refuseEnergy(cost: number) {
  return { error: cost === 1 ? 'You need 1 energy for that. Answer a question to get some.' : `That costs ${cost} energy. Answer another question first.` };
}

function mapAction(s: State, playerId: PlayerId, m: Member, kind: 'claim' | 'fortify' | 'raid', l: number, ctx: Ctx) {
  if (s.winners) return { error: 'The game is over.' };
  if (l >= s.owner.length) return { error: 'That land is not on this map.' };
  if (blockedOf(s.map).has(l)) return { error: 'Nobody can light a lake or a hill.' };
  const team = m.team;
  const owner = s.owner[l]!;
  const near = grid(s.map.radius).adj[l]!.some((n) => s.owner[n] === team);
  const at = ctx.now();
  const who = nameOf(ctx, playerId);
  switch (kind) {
    case 'claim': {
      if (owner === team) return { error: 'Your team already holds that land.' };
      if (owner >= 0) return { error: `The ${teamName(s, owner)} got there first. You could raid it instead.` };
      if (!near) return { error: 'You can only claim a land next to your team’s lands.' };
      if (m.energy < 1) return refuseEnergy(1);
      m.energy--;
      s.owner[l] = team;
      s.fort[l] = ctx.settings.claimFort ? 1 : 0;
      m.claims++;
      m.move = { kind: 'claim', land: l, at, fort: s.fort[l]! };
      recordChange(s, l, team, NOBODY, at);
      if (isShrine(s, l) && !s.lit.includes(l)) {
        s.lit.push(l);
        const name = shrineName(s.map.radius, l);
        ctx.feed(`The ${teamName(s, team)} lit ${name}.`, { tone: 'good' });
        recordPlay(s, { at, team, text: `${who} lit ${name} for the ${teamName(s, team)}`, shrine: true });
      }
      return;
    }
    case 'fortify': {
      if (owner !== team) {
        if (owner >= 0) return { error: `The ${teamName(s, owner)} captured that land before you got there.` };
        return { error: 'Your team does not hold that land. Claim it first.' };
      }
      if (isHome(s, l)) return { error: 'Homes can never be raided, so they need no fort.' };
      const max = fortMaxOf(ctx.settings);
      if ((s.fort[l] ?? 0) >= max) return { error: `That land already has ${plural(max, 'fort')}, the most it can hold.` };
      const cost = isShrine(s, l) ? SHRINE_FORT_COST : 1;
      if (m.energy < cost) return refuseEnergy(cost);
      m.energy -= cost;
      s.fort[l] = (s.fort[l] ?? 0) + 1;
      m.forts++;
      m.move = { kind: 'fortify', land: l, at, fort: s.fort[l]! };
      return;
    }
    case 'raid': {
      if (owner === team) return { error: 'Your team holds that land now.' };
      if (owner === NOBODY) return { error: 'Nobody holds that land. Claim it instead.' };
      if (isHome(s, l)) return { error: 'Homes cannot be raided.' };
      if (!near) return { error: 'You can only raid a land next to your team’s lands.' };
      if (s.event?.kind === 'storm') return { error: 'The lantern storm protects every land. Raid again when it passes.' };
      const cost = isShrine(s, l) ? SHRINE_RAID_COST : 1;
      if (m.energy < cost) return refuseEnergy(cost);
      m.energy -= cost;
      if ((s.fort[l] ?? 0) > 0) {
        s.fort[l] = s.fort[l]! - 1;
        m.raids++;
        m.move = { kind: 'raid', land: l, at, fort: s.fort[l]! };
        return;
      }
      s.owner[l] = team;
      s.fort[l] = 0;
      m.captures++;
      m.move = { kind: 'capture', land: l, at, fort: 0 };
      recordChange(s, l, team, owner, at);
      const shrine = isShrine(s, l);
      recordPlay(s, { at, team, text: `${who} captured ${placeName(s, l)} from the ${teamName(s, owner)}`, shrine });
      if (shrine && at - (s.shrineNews[l] ?? -SHRINE_NEWS_GAP_MS) >= SHRINE_NEWS_GAP_MS) {
        s.shrineNews[l] = at;
        ctx.feed(`${who} captured ${shrineName(s.map.radius, l)} from the ${teamName(s, owner)} for the ${teamName(s, team)}.`, { tone: 'big' });
      }
      return;
    }
  }
}

/* -------------------------------- timers -------------------------------- */

const inGlow = (s: State, at: number) => at >= s.glowAt;

/** Points a team scores at one scoring, from what it holds then. */
export function scoreFor(lands: number, shrines: number, opts: { shrinesOnly: boolean; bloom: boolean; glow: boolean }): number {
  const bloom = opts.bloom ? 2 : 1;
  const base = opts.shrinesOnly ? shrines * SHRINE_ONLY_POINTS * bloom : lands + shrines * SHRINE_BONUS * bloom;
  return base * (opts.glow ? 2 : 1);
}

function scoreTick(s: State, at: number, ctx: Ctx) {
  const { lands, shrines } = holdings(s);
  const present = presentCounts(s, ctx, false);
  const opts = { shrinesOnly: ctx.settings.scoring === 'shrines', bloom: s.event?.kind === 'bloom', glow: inGlow(s, at) };
  // A team whose players have all left keeps its lands, but they stop scoring.
  s.gains = s.teams.map((_, t) => ((present[t] ?? 0) > 0 ? scoreFor(lands[t] ?? 0, shrines[t] ?? 0, opts) : 0));
  for (let t = 0; t < s.gains.length; t++) s.points[t] = (s.points[t] ?? 0) + s.gains[t]!;
  s.lastScoreAt = at;
  s.nextScoreAt = at + s.scoreMs;
  const goal = ctx.settings.goalPoints;
  if (goal > 0) {
    const best = Math.max(...s.points);
    if (best >= goal) {
      s.winners = s.points.flatMap((p, t) => (p === best ? [t] : []));
      s.endedBy = 'goal';
      ctx.feed(`The ${s.winners.map((t) => teamName(s, t)).join(' and the ')} reached ${fmt(goal)} points.`, { tone: 'big' });
      ctx.endGame();
      return;
    }
  }
  if (s.nextScoreAt <= s.endsAt) ctx.setTimer('score', s.nextScoreAt);
}

/** Draws the next event: every event but the last one, by weight. */
export function eventPool(last: EventKind | null): { kind: EventKind; chance: number }[] {
  const kinds = EVENT_KINDS.filter((k) => k !== last);
  const total = kinds.reduce((n, k) => n + EVENT_WEIGHTS[k], 0);
  return kinds.map((k) => ({ kind: k, chance: EVENT_WEIGHTS[k] / total }));
}

/** The event a roll in [0, 1) picks from the pool after `last`. */
export function pickEvent(last: EventKind | null, roll: number): EventKind {
  const pool = eventPool(last);
  let left = roll;
  for (const p of pool) {
    left -= p.chance;
    if (left < 0) return p.kind;
  }
  return pool[pool.length - 1]!.kind;
}

const EVENT_START: Record<EventKind, string> = {
  storm: 'Lantern storm: for 30 seconds no fort can be lowered and no land captured.',
  bloom: 'Shrine bloom: shrines score double for 30 seconds.',
  double: 'Double energy: every right answer gives 2 energy for 30 seconds.',
  rumble: 'Rumbling ground: every fort dropped by 1.',
  fog: 'Fog: rival forts are hidden for 30 seconds.',
};

function startEvent(s: State, at: number, ctx: Ctx) {
  const kind = pickEvent(s.lastEvent, ctx.rng.next());
  s.event = { kind, startedAt: at, endsAt: at + EVENT_MS };
  s.lastEvent = kind;
  s.eventsRun++;
  if (kind === 'rumble') s.fort = s.fort.map((f) => Math.max(0, f - 1));
  ctx.feed(EVENT_START[kind], { tone: 'big' });
  recordPlay(s, { at, team: NOBODY, text: EVENTS[kind].label, shrine: false });
  ctx.setTimer('eventEnd', s.event.endsAt);
  // Events never start in the final glow; one already running may run into it.
  const next = at + EVENT_EVERY_MS;
  s.nextEventAt = next < s.glowAt && next < s.endsAt ? next : null;
  if (s.nextEventAt !== null) ctx.setTimer('event', s.nextEventAt);
}

function endEvent(s: State, ctx: Ctx) {
  const kind = s.event?.kind;
  s.event = null;
  if (kind === 'storm') ctx.feed('The lantern storm has passed. Raids are back on.', { tone: 'info' });
  if (kind === 'fog') ctx.feed('The fog has lifted.', { tone: 'info' });
}

function finish(s: State, ctx: Ctx) {
  const best = Math.max(...s.points);
  s.winners = s.points.flatMap((p, t) => (p === best ? [t] : []));
  s.endedBy = 'time';
  ctx.endGame();
}

/* --------------------------------- bots --------------------------------- */

interface BotView {
  map: LanternMap;
  owner: number[];
  fort: number[];
  event: { kind: EventKind } | null;
  winners: number[] | null;
  you: { team: number; energy: number; cap: number; options: { claim: number[]; fortify: number[]; raid: number[] }; question: { iid: string } | null } | null;
}

/** How long a bot keeps one temper (raiding first, or shoring up first) before switching. */
const TEMPER_MS = 15_000;
/** How long the bots keep breaking ties one way round before switching to the mirror image. */
const MIRROR_MS = 20_000;

/**
 * About half the bots on a team lean to raiding at any moment, and each bot
 * switches every 15 seconds, so every team both attacks and defends and the
 * borders keep moving.
 */
function raider(playerId: string, now: number): boolean {
  let h = 2166136261;
  for (let i = 0; i < playerId.length; i++) h = Math.imul(h ^ playerId.charCodeAt(i), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h >>> 7) + Math.floor(now / TEMPER_MS)) % 2 === 1;
}

/**
 * A bot's next map move, or null to answer a question instead. In order:
 * capture a rival shrine with no fort left; claim towards the nearest unlit
 * shrine; claim any empty land next to the team (free land first: it costs the
 * same as a capture and nobody takes it back); capture a rival land with no
 * fort left; shore up the weakest shrine or border land; and, with energy to
 * spare, wear down the weakest rival land. Raiders wear rival lands down before
 * shoring up their own.
 */
export function botMove(view: BotView, playerId: string, now: number, coin = false): Action | null {
  const you = view.you;
  if (!you || view.winners || you.energy < 1) return null;
  const { map, owner, fort } = view;
  const g = grid(map.radius);
  const blocked = blockedOf(map);
  const shrine = (l: number) => map.shrines.includes(l);
  const cost = (l: number) => (shrine(l) ? SHRINE_RAID_COST : 1);
  const fortCost = (l: number) => (shrine(l) ? SHRINE_FORT_COST : 1);
  const storm = view.event?.kind === 'storm';
  const team = you.team;
  // Ties go by place on the map as seen from the bot's own home, so every team's bots play alike.
  // Raids and forts follow one handedness for the whole room at a time (so teammates pick the same
  // land) and switch to the mirror image now and then; claims toss a coin, so no opening rush leans one way.
  // The map's own layout picks which way round each game starts, so no game always opens the same way.
  const salt = [...map.lakes, ...map.hills, ...map.shrines].reduce((n, l) => n + l, 0);
  const order = orderFrom(map.radius, map.homes[team] ?? 0, (Math.floor(now / MIRROR_MS) + salt) % 2 === 1);
  const claimOrder = orderFrom(map.radius, map.homes[team] ?? 0, coin);
  const byIndex = (a: number, b: number) => order[a]! - order[b]!;
  const byClaim = (a: number, b: number) => claimOrder[a]! - claimOrder[b]!;
  const affordable = you.options.raid.filter((l) => cost(l) <= you.energy);

  const undefended = storm ? [] : affordable.filter((l) => fort[l] === 0).sort((a, b) => Number(shrine(b)) - Number(shrine(a)) || byIndex(a, b));
  if (undefended[0] !== undefined && shrine(undefended[0])) return { type: 'raid', land: undefended[0] };
  const unlit = map.shrines.filter((l) => owner[l] === NOBODY);
  if (unlit.length && you.options.claim.length) {
    const dist = distancesFrom(map.radius, unlit, (l) => !blocked.has(l));
    const reachable = you.options.claim.filter((l) => (dist[l] ?? -1) >= 0);
    if (reachable.length) {
      reachable.sort((a, b) => dist[a]! - dist[b]! || byClaim(a, b));
      return { type: 'claim', land: reachable[0]! };
    }
  }
  if (you.options.claim.length) {
    // Prefer the land with the most empty land around it: it opens the most ground.
    const room = (l: number) => g.adj[l]!.filter((n) => owner[n] === NOBODY && !blocked.has(n)).length;
    const pick = [...you.options.claim].sort((a, b) => room(b) - room(a) || byClaim(a, b))[0]!;
    return { type: 'claim', land: pick };
  }
  if (undefended[0] !== undefined) return { type: 'raid', land: undefended[0] };
  const wearDown = () => {
    if (storm || !affordable.length) return null;
    // Unknown forts (fog) count as one; the whole team picks the same land, so their raids add up.
    const known = (l: number) => (fort[l]! < 0 ? 1 : fort[l]!);
    const target = [...affordable].sort((a, b) => known(a) - known(b) || Number(shrine(b)) - Number(shrine(a)) || byIndex(a, b))[0]!;
    return { type: 'raid' as const, land: target };
  };
  if (raider(playerId, now) && you.energy >= 2) {
    const raid = wearDown();
    if (raid) return raid;
  }
  const border = you.options.fortify.filter((l) => (shrine(l) || g.adj[l]!.some((n) => owner[n]! >= 0 && owner[n] !== team)) && fortCost(l) <= you.energy);
  if (border.length) {
    border.sort((a, b) => fort[a]! - fort[b]! || Number(shrine(b)) - Number(shrine(a)) || byIndex(a, b));
    return { type: 'fortify', land: border[0]! };
  }
  if (you.energy >= you.cap) return wearDown();
  return null;
}

/* --------------------------------- mode --------------------------------- */

export const lanternLands = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const st = ctx.settings;
    // Teams are required, so the room always brings them; two stand-ins keep the game sane if it does not.
    const teams = ctx.teams().length ? ctx.teams().map((t) => ({ ...t })) : makeTeams(2);
    const radius = radiusOf(st);
    const map = buildMap({ radius, teams: teams.length, shrines: Number(st.shrines) || 5, rng: ctx.rng });
    const g = grid(radius);
    const owner = g.hexes.map(() => NOBODY);
    map.homes.forEach((h, t) => (owner[h] = t));
    const now = ctx.now();
    const limit = (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
    const endsAt = now + limit;
    const scoreMs = (st.scoreEvery === '15' ? 15 : 10) * 1000;
    const s: State = {
      teams,
      map,
      owner,
      fort: g.hexes.map(() => 0),
      points: teams.map(() => 0),
      bonus: teams.map(() => 0),
      gains: teams.map(() => 0),
      members: {},
      endsAt,
      glowAt: Math.max(now, endsAt - FINAL_GLOW_MS),
      scoreMs,
      nextScoreAt: now + scoreMs,
      lastScoreAt: null,
      event: null,
      lastEvent: null,
      nextEventAt: null,
      eventsRun: 0,
      lit: [],
      shrineNews: {},
      changes: [],
      plays: [],
      winners: null,
      endedBy: null,
    };
    for (const p of ctx.players()) s.members[p.id] = newMember(s, p, ctx);
    ctx.setTimer('time', endsAt);
    if (s.nextScoreAt <= endsAt) ctx.setTimer('score', s.nextScoreAt);
    if (s.glowAt > now) ctx.setTimer('glow', s.glowAt);
    else ctx.feed('Final glow: every score counts double.', { tone: 'big' });
    if (st.events && now + EVENT_FIRST_MS < s.glowAt) {
      s.nextEventAt = now + EVENT_FIRST_MS;
      ctx.setTimer('event', s.nextEventAt);
    }
    if (st.fog) ctx.feed('Fog of war: you can only see the lands next to your team’s.', { tone: 'info' });
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.members[p.id] ??= newMember(s, p, ctx);
  },
  onPlayerLeave(s, p, ctx) {
    const m = s.members[p.id];
    if (!m || s.winners) return;
    if ((presentCounts(s, ctx, false)[m.team] ?? 0) === 0) {
      ctx.feed(`Everyone on the ${teamName(s, m.team)} has left. Their lands stay on the map but stop scoring.`, { tone: 'info' });
    }
  },
  onAction(s, playerId, a, ctx) {
    const m = s.members[playerId];
    if (!m) return { error: 'You are not on a team in this game.' };
    if (a.type !== 'answer') return mapAction(s, playerId, m, a.type, a.land, ctx);
    if (s.winners) return { error: 'The game is over.' };
    const res = streamSubmit(m.stream, playerId, a.iid, a.answer, ctx);
    if ('error' in res) return res;
    let text = 'No energy';
    if (res.correct) {
      m.right++;
      const surge = s.event?.kind === 'double';
      const base = energyFor(res.streak, ctx.settings.doubleEnergy || surge);
      const boost = boostOf(s, m.team, ctx);
      const cap = capOf(s, m.team, ctx);
      // The team's bonus meter fills with every right answer and pays out to whoever has room, so it never waits long.
      let meter = Math.min(BONUS_METER_MAX, round6((s.bonus[m.team] ?? 0) + base * boost.total));
      let bonus = 0;
      while (meter >= 1 - 1e-9 && m.energy + base + bonus < cap) {
        bonus++;
        meter = round6(meter - 1);
      }
      s.bonus[m.team] = meter;
      const gain = base + bonus;
      const kept = Math.max(0, Math.min(gain, cap - m.energy));
      m.energy += kept;
      const notes: string[] = [];
      if (base === 2 && !ctx.settings.doubleEnergy) notes.push(surge ? 'double energy' : `${res.streak} in a row`);
      if (bonus) notes.push(boost.under > 0 && boost.small > 0 ? 'bonus energy' : boost.under > 0 ? 'underdog boost' : 'small team boost');
      if (kept === 0) text = 'Your energy is full: spend it on the map';
      else text = `+${kept} energy${notes.length ? ` (${notes.join(', ')})` : ''}${kept < gain ? '. The rest did not fit' : ''}`;
    }
    if (m.stream.last) m.stream.last.text = text;
    streamNext(m.stream, ctx);
  },
  onTimer(s, id, ctx) {
    if (s.winners) return;
    switch (id) {
      case 'score':
        scoreTick(s, s.nextScoreAt, ctx);
        return;
      case 'glow':
        ctx.feed('Final glow: every score counts double for the last 45 seconds.', { tone: 'big' });
        recordPlay(s, { at: s.glowAt, team: NOBODY, text: 'Final glow', shrine: false });
        return;
      case 'event':
        if (s.nextEventAt !== null) startEvent(s, s.nextEventAt, ctx);
        return;
      case 'eventEnd':
        endEvent(s, ctx);
        return;
      case 'time':
        // Every scoring due by the end still counts, even one the clock jumped past.
        while (!s.winners && s.nextScoreAt <= s.endsAt) scoreTick(s, s.nextScoreAt, ctx);
        ctx.clearTimer('score');
        if (!s.winners) finish(s, ctx);
        return;
    }
  },
  view(s, viewer, ctx) {
    const now = ctx.now();
    const st = ctx.settings;
    const me = viewer.kind === 'player' ? s.members[viewer.playerId] : undefined;
    const team = me?.team ?? NOBODY;
    const fogEvent = s.event?.kind === 'fog';
    let owner = s.owner;
    let fort = s.fort;
    if (viewer.kind === 'host') {
      // The projector is seen by every team, so fog hides every fort there.
      if (st.fog || fogEvent) fort = s.fort.map(() => HIDDEN_FORT);
    } else if (me && (st.fog || fogEvent)) {
      const seen = st.fog ? nearTeam(s, team).map((n, i) => n || s.owner[i] === team) : null;
      owner = s.owner.map((o, i) => (seen && !seen[i] ? UNSEEN : o));
      fort = s.fort.map((f, i) => {
        if (seen && !seen[i]) return HIDDEN_FORT;
        return fogEvent && s.owner[i]! >= 0 && s.owner[i] !== team ? HIDDEN_FORT : f;
      });
    }
    const { lands, shrines } = holdings(s);
    const present = presentCounts(s, ctx, false);
    const under = underdogs(s, ctx);
    const pool = st.events && s.nextEventAt !== null ? eventPool(s.lastEvent) : [];
    const base = {
      map: s.map,
      owner,
      fort,
      fortMax: fortMaxOf(st),
      claimFort: st.claimFort ? 1 : 0,
      fog: st.fog,
      teams: s.teams.map((t, i) => ({
        name: t.name,
        hue: t.hue,
        points: s.points[i] ?? 0,
        gain: s.gains[i] ?? 0,
        lands: lands[i] ?? 0,
        shrines: shrines[i] ?? 0,
        players: present[i] ?? 0,
        underdog: under[i] ?? false,
      })),
      scoring: { shrinesOnly: st.scoring === 'shrines', every: s.scoreMs, next: s.nextScoreAt <= s.endsAt ? s.nextScoreAt : null, last: s.lastScoreAt },
      endsAt: s.endsAt,
      glowAt: s.glowAt,
      finalStretch: !s.winners && now >= s.glowAt,
      goal: st.goalPoints,
      event: s.event ? { kind: s.event.kind, label: EVENTS[s.event.kind].label, text: EVENTS[s.event.kind].text, endsAt: s.event.endsAt } : null,
      nextEvent: s.nextEventAt !== null ? { at: s.nextEventAt, pool: pool.map((p) => ({ kind: p.kind, label: EVENTS[p.kind].label, chance: Math.round(p.chance * 100) })) } : null,
      winners: s.winners,
    };
    if (viewer.kind === 'host') {
      const board = ctx
        .players()
        .flatMap((p) => {
          const m = s.members[p.id];
          return m ? [{ playerId: p.id, name: p.name, team: m.team, score: contribution(m), label: contributionLabel(m) }] : [];
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 8);
      return { ...base, changes: s.changes.filter((c) => now - c.at < CHANGE_GLOW_MS), plays: s.plays, board, you: null };
    }
    if (!me) return { ...base, you: null };
    const boost = boostOf(s, team, ctx);
    return {
      ...base,
      you: {
        team,
        energy: me.energy,
        cap: capOf(s, team, ctx, under),
        underdog: under[team] ?? false,
        // Bonus energy charged per energy earned, and why: fewer players than the biggest team, fewer lands than the leader.
        boost: boost.total > 0 || (s.bonus[team] ?? 0) > 0 ? { small: boost.small, under: boost.under, players: boost.players, biggest: boost.biggest, lands: boost.lands, most: boost.most, meter: s.bonus[team] ?? 0 } : null,
        streak: me.stream.streak,
        score: contribution(me),
        stats: { claims: me.claims, captures: me.captures, raids: me.raids, forts: me.forts, right: me.right },
        move: me.move,
        options: optionsFor(s, team, ctx),
        question: streamQuestionView(me.stream, ctx),
        last: me.stream.last,
      },
    };
  },
  results(s, ctx) {
    const { lands, shrines } = holdings(s);
    const teamStandings = s.teams.map((t, i) => ({
      teamId: t.id,
      score: s.points[i] ?? 0,
      label: `${plural(s.points[i] ?? 0, 'point')}, ${plural(lands[i] ?? 0, 'land')}, ${plural(shrines[i] ?? 0, 'shrine')}`,
    }));
    const standings = ctx.everyone().map((p) => {
      const m = s.members[p.id];
      return { playerId: p.id, score: m ? contribution(m) : 0, label: m ? contributionLabel(m) : 'Left before playing' };
    });
    const best = Math.max(...s.points);
    const top = s.points.flatMap((p, t) => (p === best ? [t] : []));
    let summary: string;
    if (best <= 0) summary = 'Nobody scored this time.';
    else if (top.length > 1) summary = `The ${top.map((t) => teamName(s, t)).join(' and the ')} tied on ${plural(best, 'point')}.`;
    else {
      const t = top[0]!;
      summary =
        s.endedBy === 'goal'
          ? `The ${teamName(s, t)} reached ${fmt(ctx.settings.goalPoints)} points first, with ${plural(lands[t] ?? 0, 'land')} lit.`
          : `The ${teamName(s, t)} lit up ${plural(lands[t] ?? 0, 'land')} and scored ${plural(best, 'point')}.`;
    }
    return { standings, teamStandings, outcome: 'competitive', summary };
  },
  bot(view, ctx) {
    const v = view as BotView | null;
    if (!v?.you || v.winners) return null;
    const move = botMove(v, ctx.playerId, ctx.now, ctx.rng.next() < 0.5);
    if (move) return move;
    const q = v.you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const v = view as BotView | null;
    const you = v?.you;
    const canMove = you && !v.winners && you.energy >= 1 && (you.options.claim.length > 0 || you.options.fortify.length > 0 || (you.options.raid.length > 0 && v.event?.kind !== 'storm'));
    // Map moves are quick taps, but not instant, so the map moves at a human pace.
    if (canMove) return 1100 + rng.int(0, 1700);
    return 2200 + rng.int(0, 4500);
  },
});
