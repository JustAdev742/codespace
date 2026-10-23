/*
 * Lantern Guard: a co-operative tower defence.
 *
 * Every player answers their own stream of questions; right answers earn
 * gold, which is theirs to spend on light towers beside the road or on
 * upgrading any tower in the room. Waves of gloomlings march down the road on
 * a fixed clock. Each one that reaches the Great Lantern puts out lights;
 * when the last light goes out the gloom wins, and when the last wave is held
 * the whole room wins. Everyone can also feed the Great Lantern gold: when it
 * is full it flares and burns every gloomling on the road, so gold keeps
 * mattering once every spot is built and every tower upgraded.
 *
 * The battle runs in fixed steps of TICK_MS game time, driven by one timer.
 * Each step moves the gloomlings (by progress along their road, in road
 * lengths per second), lets them reach the lantern, starts waves and spawns,
 * fires the towers, then settles defeats, flares and finished waves. A step
 * never depends on when its timer actually fired, so a game replays exactly,
 * and one timer catches up on every step that is due, however late it fires.
 * While nothing is on the road the clock jumps straight to the next wave.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { listNames, nameOf } from '../rules.ts';
import { meta, settings } from './meta.ts';
import { MAPS, MAP_H, MAP_W, pathInReach, pointAt, spotProgress, type GuardMap, type MapId, type Point } from './maps.ts';
import {
  DIFFICULTY_HP,
  FIRST_WAVE_MS,
  FLARE_BURN,
  FLARE_BURN_BOSS,
  FLARE_CROWD,
  FLARE_GIFT,
  FLARE_SLOW_MS,
  GLOOMLINGS,
  GOLD_PER_RIGHT,
  HP_PER_WAVE,
  MAX_LEVEL,
  SPAWN_WINDOW_MS,
  START_GOLD,
  STREAK_FROM,
  STREAK_GOLD,
  TICK_MS,
  TOWERS,
  TOWER_SETS,
  TOWER_SET_TOUGHNESS,
  WAVE_EVERY_MS,
  WAVE_GOLD,
  towerStats,
  upgradeCost,
  type GloomKind,
  type TowerKind,
} from './units.ts';

type Settings = { map: string; waves: number; lives: number; difficulty: string; towers: string; bossEvery: string; crowd: string; endless: boolean };

/* ------------------------------ tuning numbers ------------------------------ */

/**
 * How much tougher gloomlings are for the number of connected players:
 * measured points [players, toughness], with straight lines between them and
 * the last value beyond the end. Toughness grows by about 0.7 a player until
 * a room can fill and upgrade every spot (about a dozen players); after that,
 * more players add flares rather than towers (the Great Lantern's price grows
 * with the room). In very big rooms the cheapest towers fill the map in the
 * first seconds, which makes a weaker map, so the gloom eases off a little.
 * Tuned with practice-bot simulations so a room of any size wins roughly
 * three games in four on normal; the numbers are in the mode's report.
 */
export const ROOM_TOUGHNESS: readonly (readonly [players: number, toughness: number])[] = [
  [1, 0.72],
  [2, 1.58],
  [4, 2.7],
  [8, 5.82],
  [12, 7.3],
  [20, 7.45],
  [30, 6.55],
  [40, 6.6],
];
/**
 * An endless night's extra toughness for the number of connected players, on
 * top of ROOM_TOUGHNESS (points as there). A night runs to the time limit (17
 * waves in the default eight minutes), and a room of more than a handful has
 * filled and upgraded every spot long before dawn, so only its flares still
 * grow while the waves keep growing: its gloom is weaker to match. A small room
 * is still building all night, so its gloom stays as it is. Tuned with
 * practice-bot simulations; the numbers are in the mode's report.
 */
export const ENDLESS_TOUGHNESS: readonly (readonly [players: number, toughness: number])[] = [
  [1, 1],
  [4, 1],
  [8, 0.63],
  [12, 0.45],
];
/** Every gloomling's health is scaled by this on top of the wave, room, difficulty, map and towers. */
export const HP_SCALE = 1;
/** How many Wisps, Shades and Brutes a wave brings, for each `crowd` setting. */
export const CROWD: Record<string, number> = { fewer: 0.8, normal: 1, more: 1.5 };
/**
 * The Great Lantern's flare costs this much gold for every connected guard.
 * Income grows with the room too, so once every tower is built and upgraded a
 * room of any size flares about as often as its answers allow.
 */
export const FLARE_PER_GUARD = 60;
/** Used for an endless night when the host sets no time limit, which would otherwise never end. */
const ENDLESS_DEFAULT_SEC = meta.common.defaults.timeLimitSec!;
/** A late timer catches up at most this many steps at once (the rest follow straight after). */
const MAX_STEPS = 480;
/** Shots older than this are not drawn any more, so views leave them out. */
const SHOT_SHOWN_MS = 600;
const LOG_KEEP = 10;

/* ---------------------------------- state ---------------------------------- */

interface Guard {
  stream: StreamState;
  gold: number;
  /** Gold spent on towers, upgrades and the Great Lantern. */
  spent: number;
  /** Gloomlings that towers this player built have defeated (Gloom Lords included). */
  defeats: number;
  lords: number;
  built: number;
  upgraded: number;
  fed: number;
}

interface Shot {
  at: number;
  /** Where the target was: its road and its progress along it. */
  road: number;
  p: number;
}

interface Tower {
  spot: number;
  kind: TowerKind;
  level: number;
  by: PlayerId;
  /** Who paid for each upgrade, in order. */
  ups: PlayerId[];
  /** Milliseconds of reload built up; it fires when this reaches its fire interval. */
  charge: number;
  shot: Shot | null;
  defeats: number;
}

interface Gloomling {
  id: number;
  kind: GloomKind;
  road: number;
  /** Progress along its road, 0 at the entrance and 1 at the Great Lantern. */
  p: number;
  hp: number;
  maxHp: number;
  /** Game time when its slow wears off. */
  slowUntil: number;
  wave: number;
}

interface Spawn {
  at: number;
  kind: GloomKind;
  road: number;
  wave: number;
}

type LogEntry =
  | { seq: number; at: number; kind: 'build'; playerId: PlayerId; tower: TowerKind }
  | { seq: number; at: number; kind: 'upgrade'; playerId: PlayerId; tower: TowerKind; level: number }
  | { seq: number; at: number; kind: 'feed'; playerId: PlayerId; gold: number }
  | { seq: number; at: number; kind: 'held'; wave: number; lost: number }
  | { seq: number; at: number; kind: 'lord'; playerId: PlayerId | null }
  | { seq: number; at: number; kind: 'flare'; burned: number }
  | { seq: number; at: number; kind: 'leak'; gloom: GloomKind; lights: number };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type LogInput = DistributiveOmit<LogEntry, 'seq'>;

interface Flare {
  pot: number;
  cost: number;
  /** Full: it flares at the next step with a busy road (see busyRoad). */
  charged: boolean;
  count: number;
  /** Game time of the last flare, for the screens. */
  at: number | null;
  /** Who has fed it since the last flare. */
  givers: PlayerId[];
}

interface State {
  guards: Record<PlayerId, Guard>;
  towers: Tower[];
  gloom: Gloomling[];
  /** Gloomlings still to set off, soonest first. */
  spawns: Spawn[];
  nextId: number;
  lights: number;
  maxLights: number;
  /** The latest wave to have started (0 before the first). */
  wave: number;
  nextWaveAt: number | null;
  /** Waves not over yet: wave number to gloomlings still to come or on the road. */
  open: Record<string, number>;
  /** Lights each open wave has put out so far. */
  lost: Record<string, number>;
  held: number;
  /** Gloom Lords brought down so far, by towers or by the flare. */
  lordsDown: number;
  /** Game time the battle has been worked out to. */
  simAt: number;
  start: number;
  endsAt: number | null;
  flare: Flare;
  /** The room has been warned that the lantern is running low (said once). */
  warned: boolean;
  result: 'win' | 'loss' | null;
  reason: 'waves' | 'lights' | 'time' | null;
  log: LogEntry[];
  seq: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('build'), spot: z.number().int().min(0).max(63), tower: z.enum(['spark', 'beam', 'frost', 'firework']) }),
  z.object({ type: z.literal('upgrade'), spot: z.number().int().min(0).max(63), level: z.number().int().min(2).max(MAX_LEVEL) }),
  z.object({ type: z.literal('feed') }),
]);
type Action = z.infer<typeof action>;

/* --------------------------------- helpers --------------------------------- */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/** Gloomling toughness for a room of this many connected players (see ROOM_TOUGHNESS). */
export function roomFactor(players: number): number {
  return byRoom(ROOM_TOUGHNESS, players);
}

/** The extra toughness the `towers` setting and an endless night add for a room of this many connected players. */
export function variantFactor(st: Pick<Settings, 'towers' | 'endless'>, players: number): number {
  return byRoom(TOWER_SET_TOUGHNESS[st.towers] ?? TOWER_SET_TOUGHNESS.all!, players) * (st.endless ? byRoom(ENDLESS_TOUGHNESS, players) : 1);
}

/** A value from a table of measured points [players, value]: straight lines between them, the end values beyond them. */
function byRoom(table: readonly (readonly [players: number, value: number])[], players: number): number {
  const n = Math.max(1, players);
  if (n <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [n1, v1] = table[i]!;
    if (n > n1) continue;
    const [n0, v0] = table[i - 1]!;
    return v0 + ((v1 - v0) * (n - n0)) / (n1 - n0);
  }
  return table[table.length - 1]![1];
}

/** A wave's health multiplier before the room and difficulty. */
export function waveHp(wave: number): number {
  return 1 + HP_PER_WAVE * (wave - 1);
}

/**
 * The Wisps, Shades and Brutes each wave brings: `start` on wave `from`, then
 * `per` more for every wave after it (before the host's crowd setting).
 */
export const WAVE_MIX: Record<'wisp' | 'shade' | 'brute', { from: number; start: number; per: number }> = {
  wisp: { from: 1, start: 8, per: 0.4 },
  shade: { from: 2, start: 4, per: 0.6 },
  brute: { from: 3, start: 1, per: 0.4 },
};

/**
 * What a wave brings. Waves grow; Brutes join from wave 3; a Gloom Lord marches
 * on every `bossEvery`th wave, and (when Lords are on) the last wave of a night
 * always ends with one, so every game finishes on its biggest moment.
 */
export function roster(wave: number, st: Pick<Settings, 'bossEvery' | 'crowd' | 'waves' | 'endless'>): Record<GloomKind, number> {
  const crowd = CROWD[st.crowd] ?? 1;
  const count = (kind: keyof typeof WAVE_MIX) => {
    const m = WAVE_MIX[kind];
    return wave >= m.from ? Math.max(1, Math.round((m.start + m.per * (wave - m.from)) * crowd)) : 0;
  };
  const every = Number(st.bossEvery) || 0;
  const finale = every > 0 && !st.endless && wave === st.waves;
  return {
    wisp: count('wisp'),
    shade: count('shade'),
    brute: count('brute'),
    // Deep into an endless night the Gloom Lords come in pairs.
    lord: every > 0 && (wave % every === 0 || finale) ? 1 + Math.floor((wave - 1) / (every * 4)) : 0,
  };
}

/** The gold the next flare needs: FLARE_PER_GUARD for every connected guard. */
export function flareCost(players: number): number {
  return FLARE_PER_GUARD * Math.max(1, players);
}

/** Guard points: 10 per right answer, 1 per gold spent, 3 per gloomling your towers defeat and 30 per Gloom Lord. */
export function guardPoints(g: Guard | undefined): number {
  if (!g) return 0;
  return 10 * g.stream.correct + g.spent + 3 * (g.defeats - g.lords) + 30 * g.lords;
}

function mapOf(ctx: ModeContext<Settings>): GuardMap {
  return MAPS[(ctx.settings.map in MAPS ? ctx.settings.map : 'river') as MapId];
}

function allowedTowers(ctx: ModeContext<Settings>): readonly TowerKind[] {
  return TOWER_SETS[ctx.settings.towers] ?? TOWER_SETS.all!;
}

function connected(ctx: ModeContext) {
  return ctx.players().filter((p) => p.connected);
}

/** The cheapest tower in the game that fights rather than only slows: a Spark, or a Firework in Frost and Fire. */
export function firstFighter(allowed: readonly TowerKind[]): TowerKind {
  const fighters = allowed.filter((k) => !TOWERS[k].slow);
  return (fighters.length ? fighters : allowed).reduce((a, b) => (TOWERS[b].cost < TOWERS[a].cost ? b : a));
}

/**
 * Everyone starts able to build a tower that fights at once: START_GOLD, or the
 * price of firstFighter if that is more. In Frost and Fire that is a Firework,
 * since a lone Frost tower slows the first wave but cannot stop it.
 */
export function startingGold(allowed: readonly TowerKind[]): number {
  return Math.max(START_GOLD, TOWERS[firstFighter(allowed)].cost);
}

function newGuard(ctx: ModeContext<Settings>): Guard {
  return { stream: streamInit(ctx), gold: startingGold(allowedTowers(ctx)), spent: 0, defeats: 0, lords: 0, built: 0, upgraded: 0, fed: 0 };
}

function log(s: State, entry: LogInput) {
  s.seq++;
  s.log = [...s.log, { ...entry, seq: s.seq } as LogEntry].slice(-LOG_KEEP);
}

function speedOf(g: Gloomling, at: number): number {
  const base = GLOOMLINGS[g.kind].speed;
  return g.slowUntil > at ? base * (1 - TOWERS.frost.slow!.by) : base;
}

/** Road left before the lantern, in map units: the smaller, the further along. */
function remaining(g: Target, map: GuardMap): number {
  return (1 - g.p) * map.paths[g.road]!.length;
}

/** Every Wisp, Shade and Brute of a wave, mixed evenly through it, setting off over SPAWN_WINDOW_MS; Gloom Lords come last. */
function schedule(wave: number, at: number, st: Settings, roads: number): Spawn[] {
  const counts = roster(wave, st);
  const order: GloomKind[] = ['wisp', 'shade', 'brute'];
  const small = order
    .flatMap((kind, k) => Array.from({ length: counts[kind] }, (_, j) => ({ kind, key: (j + 0.5) / counts[kind] + k * 1e-6 })))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.kind);
  const gap = small.length > 1 ? SPAWN_WINDOW_MS / (small.length - 1) : 0;
  const out: Spawn[] = small.map((kind, i) => ({ at: at + Math.round((i * gap) / TICK_MS) * TICK_MS, kind, road: i % roads, wave }));
  for (let j = 0; j < counts.lord; j++) out.push({ at: at + SPAWN_WINDOW_MS + j * 2000, kind: 'lord', road: (wave + j) % roads, wave });
  return out;
}

/* --------------------------------- the battle -------------------------------- */

function startWave(s: State, at: number, ctx: ModeContext<Settings>) {
  const st = ctx.settings;
  s.wave++;
  const w = s.wave;
  const list = schedule(w, at, st, mapOf(ctx).paths.length);
  s.spawns = [...s.spawns, ...list].sort((a, b) => a.at - b.at);
  s.open[String(w)] = list.length;
  s.nextWaveAt = st.endless || w < st.waves ? at + WAVE_EVERY_MS : null;
  const lords = list.filter((x) => x.kind === 'lord').length;
  if (lords) ctx.feed(lords > 1 ? `Wave ${w}: ${lords} Gloom Lords are coming!` : `Wave ${w}: a Gloom Lord is coming!`, { tone: 'bad' });
}

function spawn(s: State, sp: Spawn, ctx: ModeContext<Settings>) {
  const g = GLOOMLINGS[sp.kind];
  const st = ctx.settings;
  const n = connected(ctx).length;
  const tough = roomFactor(n) * variantFactor(st, n) * (DIFFICULTY_HP[st.difficulty] ?? 1) * mapOf(ctx).toughness * HP_SCALE;
  const maxHp = Math.max(1, Math.round(g.hp * waveHp(sp.wave) * tough));
  s.nextId++;
  s.gloom.push({ id: s.nextId, kind: sp.kind, road: sp.road, p: 0, hp: maxHp, maxHp, slowUntil: 0, wave: sp.wave });
}

function finish(s: State, result: 'win' | 'loss', reason: NonNullable<State['reason']>, ctx: ModeContext<Settings>) {
  if (s.result) return;
  s.result = result;
  s.reason = reason;
  ctx.clearTimer('tick');
  ctx.endGame();
}

/** What a tower needs to know about a gloomling to aim at it. */
export type Target = Pick<Gloomling, 'hp' | 'p' | 'road' | 'slowUntil'>;

/**
 * The gloomling a tower at `spot` aims at, from those on the road (`live`, with
 * their positions): Beams take the one with the most health left, Frost the
 * furthest along that is not slowed yet, everything else the furthest along.
 * Only gloomlings within `range` (straight-line distance) count, and only
 * once they have walked onto the map: nothing is shot while still in the
 * gloom beyond the edge, where the class cannot see it.
 */
export function pickTarget<T extends Target>(kind: TowerKind, range: number, live: { g: T; at: Point }[], spot: Point, map: GuardMap, now: number): { g: T; at: Point } | null {
  const r2 = range * range;
  let best: { g: T; at: Point } | null = null;
  let bestUnslowed: { g: T; at: Point } | null = null;
  const aimFor = TOWERS[kind].aim;
  for (const c of live) {
    if (c.g.hp <= 0) continue;
    if (c.at[0] < 0 || c.at[0] > MAP_W || c.at[1] < 0 || c.at[1] > MAP_H) continue;
    if ((c.at[0] - spot[0]) ** 2 + (c.at[1] - spot[1]) ** 2 > r2) continue;
    if (aimFor === 'toughest') {
      if (!best || c.g.hp > best.g.hp || (c.g.hp === best.g.hp && remaining(c.g, map) < remaining(best.g, map))) best = c;
      continue;
    }
    if (!best || remaining(c.g, map) < remaining(best.g, map)) best = c;
    if (aimFor === 'unslowed' && c.g.slowUntil <= now && (!bestUnslowed || remaining(c.g, map) < remaining(bestUnslowed.g, map))) bestUnslowed = c;
  }
  // Frost would rather slow a gloomling that is not slowed yet; if every one in reach is, it keeps the front one slow.
  return bestUnslowed ?? best;
}

function defeat(s: State, g: Gloomling, by: Tower, ctx: ModeContext<Settings>) {
  by.defeats++;
  const guard = s.guards[by.by];
  if (guard) {
    guard.defeats++;
    if (g.kind === 'lord') guard.lords++;
  }
  if (g.kind === 'lord') {
    s.lordsDown++;
    ctx.feed(`The Gloom Lord is down! ${nameOf(ctx, by.by)}’s ${TOWERS[by.kind].name} tower landed the last hit.`, { tone: 'big' });
    log(s, { at: s.simAt, kind: 'lord', playerId: by.by });
  }
}

function fireTowers(s: State, T: number, map: GuardMap, live: { g: Gloomling; at: Point }[], ctx: ModeContext<Settings>) {
  for (const t of s.towers) {
    const stats = towerStats(t.kind, t.level);
    t.charge += TICK_MS;
    if (t.charge < stats.every) continue;
    const spot = map.spots[t.spot]!;
    const target = pickTarget(t.kind, stats.range, live, spot, map, T);
    if (!target) {
      // Nothing in reach: stay ready to fire the moment something is.
      t.charge = stats.every - TICK_MS;
      continue;
    }
    t.charge -= stats.every;
    t.shot = { at: T, road: target.g.road, p: round(target.g.p, 4) };
    const hits = stats.splash ? live.filter((c) => c.g.hp > 0 && (c.at[0] - target.at[0]) ** 2 + (c.at[1] - target.at[1]) ** 2 <= stats.splash ** 2) : [target];
    for (const c of hits) {
      c.g.hp -= stats.damage;
      if (c.g.hp <= 0) defeat(s, c.g, t, ctx);
    }
    if (stats.slow && target.g.hp > 0) target.g.slowUntil = T + stats.slow.ms;
  }
}

function flareNow(s: State, T: number, ctx: ModeContext<Settings>) {
  let burned = 0;
  for (const g of s.gloom) {
    if (g.hp <= 0) continue;
    g.hp -= Math.round(g.maxHp * (GLOOMLINGS[g.kind].boss ? FLARE_BURN_BOSS : FLARE_BURN));
    g.slowUntil = Math.max(g.slowUntil, T + FLARE_SLOW_MS);
    if (g.hp > 0) continue;
    burned++;
    if (g.kind === 'lord') {
      s.lordsDown++;
      ctx.feed('The Great Lantern’s flare brought down the Gloom Lord!', { tone: 'big' });
      log(s, { at: T, kind: 'lord', playerId: null });
    }
  }
  const givers = s.flare.givers.map((id) => nameOf(ctx, id));
  const thanks = givers.length > 3 ? `${givers.slice(0, 2).join(', ')} and ${plural(givers.length - 2, 'other')}` : listNames(givers);
  ctx.feed(`The Great Lantern flared${burned ? ` and burned away ${plural(burned, 'gloomling')}` : ''}! Thanks to ${thanks}.`, { tone: 'big' });
  log(s, { at: T, kind: 'flare', burned });
  s.flare = { pot: 0, cost: flareCost(connected(ctx).length), charged: false, count: s.flare.count + 1, at: T, givers: [] };
}

/** A full lantern flares when the road is busy enough to be worth it: FLARE_CROWD gloomlings, or a Gloom Lord. */
function busyRoad(s: State) {
  const live = s.gloom.filter((g) => g.hp > 0);
  return live.length >= FLARE_CROWD || live.some((g) => GLOOMLINGS[g.kind].boss);
}

/** True when nothing is on the road or about to set off, so steps would change nothing. */
function idle(s: State) {
  return s.gloom.length === 0 && s.spawns.length === 0;
}

/** One step of the battle, ending at game time T. */
function step(s: State, T: number, ctx: ModeContext<Settings>) {
  const map = mapOf(ctx);
  s.simAt = T;

  // 1. Gloomlings march, at the speed they had when the step began.
  for (const g of s.gloom) g.p += (speedOf(g, T - TICK_MS) * TICK_MS) / 1000;

  // 2. Any that reach the Great Lantern put out its lights.
  const arrived = s.gloom.filter((g) => g.p >= 1);
  if (arrived.length) {
    s.gloom = s.gloom.filter((g) => g.p < 1);
    for (const g of arrived) {
      const lights = Math.min(s.lights, GLOOMLINGS[g.kind].lights);
      s.lights -= lights;
      s.open[String(g.wave)] = (s.open[String(g.wave)] ?? 1) - 1;
      s.lost[String(g.wave)] = (s.lost[String(g.wave)] ?? 0) + lights;
      if (g.kind === 'lord' || g.kind === 'brute') log(s, { at: T, kind: 'leak', gloom: g.kind, lights });
      if (g.kind === 'lord' && s.lights > 0) ctx.feed(`A Gloom Lord reached the Great Lantern and put out ${plural(lights, 'light')}!`, { tone: 'bad' });
    }
    if (s.lights <= 0) {
      ctx.feed(`The gloom reached the Great Lantern and its last light went out on wave ${s.wave}.`, { tone: 'bad' });
      return finish(s, 'loss', 'lights', ctx);
    }
    if (!s.warned && s.lights <= Math.max(3, Math.ceil(s.maxLights / 4))) {
      s.warned = true;
      ctx.feed(`Only ${plural(s.lights, 'light')} left on the Great Lantern!`, { tone: 'bad' });
    }
  }

  // 3. Waves start and their gloomlings set off.
  while (s.nextWaveAt !== null && s.nextWaveAt <= T) startWave(s, s.nextWaveAt, ctx);
  while (s.spawns.length && s.spawns[0]!.at <= T) {
    spawn(s, s.spawns[0]!, ctx);
    s.spawns = s.spawns.slice(1);
  }

  // 4. Towers fire, then a full Great Lantern flares.
  const live = s.gloom.map((g) => ({ g, at: pointAt(map.paths[g.road]!, g.p) }));
  fireTowers(s, T, map, live, ctx);
  if (s.flare.charged && busyRoad(s)) flareNow(s, T, ctx);

  // 5. The defeated leave the road.
  const fallen = s.gloom.filter((g) => g.hp <= 0);
  if (fallen.length) {
    s.gloom = s.gloom.filter((g) => g.hp > 0);
    for (const g of fallen) s.open[String(g.wave)] = (s.open[String(g.wave)] ?? 1) - 1;
  }

  // 6. A wave is held once all of it is gone and the lantern still shines.
  for (const key of Object.keys(s.open).sort((a, b) => Number(a) - Number(b))) {
    if (s.open[key]! > 0) continue;
    delete s.open[key];
    s.held++;
    for (const p of connected(ctx)) {
      const g = s.guards[p.id];
      if (g) g.gold += WAVE_GOLD;
    }
    const lost = s.lost[key] ?? 0;
    delete s.lost[key];
    log(s, { at: T, kind: 'held', wave: Number(key), lost });
    const last = !ctx.settings.endless && s.nextWaveAt === null && idle(s);
    if (!last) ctx.feed(lost ? `Wave ${key} is over, with ${plural(lost, 'light')} lost. Every guard gets ${WAVE_GOLD} gold.` : `Wave ${key} held! Every guard gets ${WAVE_GOLD} gold.`, { tone: lost ? 'info' : 'good' });
  }

  // 7. The last wave held: the festival is safe.
  if (!ctx.settings.endless && s.nextWaveAt === null && idle(s) && Object.keys(s.open).length === 0) {
    ctx.feed(`The festival is safe! Every wave was held with ${plural(s.lights, 'light')} still burning.`, { tone: 'big' });
    finish(s, 'win', 'waves', ctx);
  }
}

/** Work the battle out up to game time `now`, then set the timer for the next step. */
function advance(s: State, ctx: ModeContext<Settings>) {
  const now = ctx.now();
  let steps = 0;
  while (!s.result && steps < MAX_STEPS) {
    const T = s.simAt + TICK_MS;
    if (T > now) break;
    if (idle(s) && s.nextWaveAt !== null && s.nextWaveAt > T) {
      // Nothing on the road: skip to the step that starts the next wave, or as far as the clock has got.
      const reached = s.start + Math.floor((now - s.start) / TICK_MS) * TICK_MS;
      const to = Math.min(s.nextWaveAt - TICK_MS, reached);
      if (to > s.simAt) {
        s.simAt = to;
        for (const t of s.towers) t.charge = Math.max(t.charge, towerStats(t.kind, t.level).every - TICK_MS);
        continue;
      }
    }
    step(s, T, ctx);
    steps++;
  }
  if (s.result) return;
  if (idle(s) && s.nextWaveAt !== null) ctx.setTimer('tick', s.nextWaveAt);
  else if (!idle(s)) ctx.setTimer('tick', s.simAt + TICK_MS);
}

/* ---------------------------------- views ---------------------------------- */

function ranking(s: State, ctx: ModeContext, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.guards[p.id])
    .map((p) => ({ playerId: p.id, name: p.name, points: guardPoints(s.guards[p.id]), isYou: p.id === me, rank: 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function logView(e: LogEntry, ctx: ModeContext) {
  const { seq, at, kind } = e;
  switch (e.kind) {
    case 'build':
      return { seq, at, kind, name: nameOf(ctx, e.playerId), tower: e.tower };
    case 'upgrade':
      return { seq, at, kind, name: nameOf(ctx, e.playerId), tower: e.tower, level: e.level };
    case 'feed':
      return { seq, at, kind, name: nameOf(ctx, e.playerId), gold: e.gold };
    case 'held':
      return { seq, at, kind, wave: e.wave, lost: e.lost };
    case 'lord':
      return { seq, at, kind, name: e.playerId ? nameOf(ctx, e.playerId) : null };
    case 'flare':
      return { seq, at, kind, burned: e.burned };
    case 'leak':
      return { seq, at, kind, gloom: e.gloom, lights: e.lights };
  }
}

/* ----------------------------------- bots ----------------------------------- */

/** The order bots pick towers in once the room has its first Sparks, so a room of bots builds a mix. */
const BOT_MIX: readonly TowerKind[] = ['spark', 'beam', 'frost', 'spark', 'firework', 'beam', 'spark', 'firework'];
/** The room's first towers are Sparks (cheap, and ready before the first wave; Fireworks in Frost and Fire); after that each bot follows the mix. */
const BOT_SPARKS_FIRST = 4;
const reachMemo = new Map<string, number>();
const progressMemo = new Map<string, number>();

/** How much road a tower of this reach would see from a spot (worked out once per map, spot and reach). */
function reachOf(map: GuardMap, spot: number, range: number) {
  const key = `${map.id}:${spot}:${range}`;
  let v = reachMemo.get(key);
  if (v === undefined) {
    v = pathInReach(map, map.spots[spot]!, range);
    reachMemo.set(key, v);
  }
  return v;
}

function progressOf(map: GuardMap, spot: number) {
  const key = `${map.id}:${spot}`;
  let v = progressMemo.get(key);
  if (v === undefined) {
    v = spotProgress(map, map.spots[spot]!);
    progressMemo.set(key, v);
  }
  return v;
}

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * The tower a bot saves up for next: Sparks (firstFighter) while the room has
 * fewer than BOT_SPARKS_FIRST towers, then its own place in the mix. Without
 * the room-wide count, a big room of bots would fill every spot with a first
 * Spark and never build a Beam.
 */
export function botTowerChoice(allowed: readonly TowerKind[], built: number, playerId: string, roomTowers: number): TowerKind {
  if (roomTowers < BOT_SPARKS_FIRST) return firstFighter(allowed);
  const mix = BOT_MIX.filter((k) => allowed.includes(k));
  const pool = mix.length ? mix : allowed;
  return pool[(hashId(playerId) + built) % pool.length]!;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** What a bot spends gold on now, or null to keep answering: build on the free spot that sees most road; once the spots run out, upgrade the towers nearest the middle of the road; once those are all at the top, feed the Great Lantern. */
export function botSpend(view: any, playerId: string): Action | null {
  const you = view?.you;
  if (!you || view.result) return null;
  const map = MAPS[view.map as MapId];
  if (!map) return null;
  const taken = new Set<number>(view.towers.map((t: any) => t.spot));
  const free = map.spots.map((_, i) => i).filter((i) => !taken.has(i));
  if (free.length) {
    const kind = botTowerChoice(view.allowed, you.built, playerId, view.towers.length);
    if (you.gold < TOWERS[kind].cost) return null;
    const range = towerStats(kind, 1).range;
    const spot = free.reduce((a, b) => (reachOf(map, b, range) > reachOf(map, a, range) ? b : a));
    return { type: 'build', spot, tower: kind };
  }
  const upgradable = (view.towers as any[]).filter((t) => t.level < MAX_LEVEL);
  if (upgradable.length) {
    const middle = (t: any) => Math.abs(progressOf(map, t.spot) - 0.5);
    const t = upgradable.reduce((a, b) => (middle(b) < middle(a) ? b : a));
    return you.gold >= upgradeCost(t.kind, t.level)! ? { type: 'upgrade', spot: t.spot, level: t.level + 1 } : null;
  }
  return !view.flare.charged && you.gold >= FLARE_GIFT ? { type: 'feed' } : null;
}

/* ----------------------------------- mode ----------------------------------- */

export const lanternGuard = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const guards: Record<PlayerId, Guard> = {};
    for (const p of ctx.players()) guards[p.id] = newGuard(ctx);
    const now = ctx.now();
    const st = ctx.settings;
    const limitSec = ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : st.endless ? ENDLESS_DEFAULT_SEC : 0;
    const endsAt = limitSec > 0 ? now + limitSec * 1000 : null;
    if (endsAt !== null) ctx.setTimer('time', endsAt);
    const firstWave = now + FIRST_WAVE_MS;
    ctx.setTimer('tick', firstWave);
    return {
      guards,
      towers: [],
      gloom: [],
      spawns: [],
      nextId: 0,
      lights: st.lives,
      maxLights: st.lives,
      wave: 0,
      nextWaveAt: firstWave,
      open: {},
      lost: {},
      held: 0,
      lordsDown: 0,
      simAt: now,
      start: now,
      endsAt,
      flare: { pot: 0, cost: flareCost(connected(ctx).length), charged: false, count: 0, at: null, givers: [] },
      warned: false,
      result: null,
      reason: null,
      log: [],
      seq: 0,
    };
  },
  onPlayerJoin(s, p, ctx) {
    s.guards[p.id] ??= newGuard(ctx);
  },
  onAction(s, playerId, a, ctx) {
    const g = s.guards[playerId];
    if (!g) return { error: 'You are not in this game.' };
    if (s.result) return { error: 'The battle is over.' };
    const map = mapOf(ctx);
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(g.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (res.correct) {
          const bonus = res.streak >= STREAK_FROM;
          const gain = GOLD_PER_RIGHT + (bonus ? STREAK_GOLD : 0);
          g.gold += gain;
          if (g.stream.last) g.stream.last.text = `+${gain} gold${bonus ? ' (streak bonus)' : ''}`;
        } else if (g.stream.last) g.stream.last.text = 'No gold this time';
        streamNext(g.stream, ctx);
        return;
      }
      case 'build': {
        if (a.spot >= map.spots.length) return { error: 'There is no spot there.' };
        if (!allowedTowers(ctx).includes(a.tower)) return { error: 'That tower is not used in this game.' };
        if (s.towers.some((t) => t.spot === a.spot)) return { error: 'Someone has just built on that spot.' };
        const spec = TOWERS[a.tower];
        if (g.gold < spec.cost) return { error: `You need ${spec.cost - g.gold} more gold for a ${spec.name} tower.` };
        g.gold -= spec.cost;
        g.spent += spec.cost;
        g.built++;
        // A new tower is ready to fire at once.
        s.towers.push({ spot: a.spot, kind: a.tower, level: 1, by: playerId, ups: [], charge: towerStats(a.tower, 1).every - TICK_MS, shot: null, defeats: 0 });
        log(s, { at: ctx.now(), kind: 'build', playerId, tower: a.tower });
        return;
      }
      case 'upgrade': {
        const t = s.towers.find((x) => x.spot === a.spot);
        if (!t) return { error: 'There is no tower on that spot.' };
        if (t.level >= MAX_LEVEL) return { error: 'That tower is already at the top level.' };
        if (a.level !== t.level + 1) return { error: 'Someone has just upgraded that tower. Have another look.' };
        const cost = upgradeCost(t.kind, t.level)!;
        if (g.gold < cost) return { error: `You need ${cost - g.gold} more gold for that upgrade.` };
        g.gold -= cost;
        g.spent += cost;
        g.upgraded++;
        t.level++;
        t.ups.push(playerId);
        log(s, { at: ctx.now(), kind: 'upgrade', playerId, tower: t.kind, level: t.level });
        if (t.by !== playerId && ctx.player(t.by)) ctx.feed(`${nameOf(ctx, playerId)} upgraded your ${TOWERS[t.kind].name} tower to level ${t.level}.`, { tone: 'good', to: [t.by] });
        return;
      }
      case 'feed': {
        if (s.flare.charged) return { error: 'The Great Lantern is full. It will flare when the gloom crowds the road.' };
        const gift = Math.min(FLARE_GIFT, g.gold, s.flare.cost - s.flare.pot);
        if (gift <= 0) return { error: 'You need some gold to feed the Great Lantern.' };
        g.gold -= gift;
        g.spent += gift;
        g.fed += gift;
        s.flare.pot += gift;
        if (!s.flare.givers.includes(playerId)) s.flare.givers = [...s.flare.givers, playerId];
        log(s, { at: ctx.now(), kind: 'feed', playerId, gold: gift });
        if (s.flare.pot >= s.flare.cost) {
          s.flare.charged = true;
          if (!busyRoad(s)) ctx.feed('The Great Lantern is full! It will flare when the gloom crowds the road.', { tone: 'good' });
        }
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (s.result) return;
    if (id === 'tick') return advance(s, ctx);
    if (id !== 'time') return;
    advance(s, ctx);
    if (s.result) return;
    const st = ctx.settings;
    ctx.feed(
      st.endless ? `Dawn has come! The class held ${plural(s.held, 'wave')} with ${plural(s.lights, 'light')} still burning.` : `Time is up! The Great Lantern is still burning with ${plural(s.lights, 'light')}.`,
      { tone: 'big' },
    );
    finish(s, 'win', 'time', ctx);
  },
  view(s, viewer, ctx) {
    const st = ctx.settings;
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const host = viewer.kind === 'host';
    const g = me ? s.guards[me] : undefined;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, host ? 6 : 3);
    const mine = rows.find((r) => r.isYou);
    const at = s.simAt;
    return {
      map: mapOf(ctx).id,
      tick: at,
      lights: s.lights,
      maxLights: s.maxLights,
      wave: s.wave,
      waves: st.endless ? null : st.waves,
      held: s.held,
      lordsDown: s.lordsDown,
      nextWaveAt: s.nextWaveAt,
      next: s.nextWaveAt !== null ? { wave: s.wave + 1, ...roster(s.wave + 1, st) } : null,
      endsAt: s.endsAt,
      result: s.result,
      reason: s.reason,
      allowed: allowedTowers(ctx),
      towers: s.towers.map((t) => ({
        spot: t.spot,
        kind: t.kind,
        level: t.level,
        by: t.by,
        ...(t.ups.length ? { ups: t.ups } : {}),
        defeats: t.defeats,
        shot: t.shot && at - t.shot.at < SHOT_SHOWN_MS ? t.shot : null,
      })),
      gloom: s.gloom.map((x) => ({ id: x.id, kind: x.kind, road: x.road, p: round(x.p, 4), v: round(speedOf(x, at), 5), hp: Math.ceil(x.hp), max: x.maxHp })),
      flare: { pot: s.flare.pot, cost: s.flare.cost, charged: s.flare.charged, count: s.flare.count, at: s.flare.at },
      guards: rows.length,
      top,
      log: host ? s.log.slice(-8).reverse().map((e) => logView(e, ctx)) : [],
      you: g
        ? {
            id: me,
            gold: g.gold,
            points: guardPoints(g),
            rank: mine?.rank ?? null,
            right: g.stream.correct,
            streak: g.stream.streak,
            defeats: g.defeats,
            built: g.built,
            upgraded: g.upgraded,
            fed: g.fed,
            question: streamQuestionView(g.stream, ctx),
            last: g.stream.last,
          }
        : null,
    };
  },
  results(s, ctx) {
    const st = ctx.settings;
    const standings = ctx.everyone().map((p) => {
      const points = guardPoints(s.guards[p.id]);
      return { playerId: p.id, score: points, label: plural(points, 'guard point') };
    });
    const lights = plural(s.lights, 'light');
    let summary: string;
    if (s.reason === 'lights') summary = st.endless ? `The gloom reached the Great Lantern on wave ${s.wave}, after ${plural(s.held, 'wave')} held.` : `The gloom reached the Great Lantern on wave ${s.wave}.`;
    else if (s.reason === 'waves') summary = `The festival is safe! ${s.held} of ${st.waves} waves held with ${lights} left.`;
    else if (s.reason === 'time') summary = st.endless ? `Dawn came with ${plural(s.held, 'wave')} held and ${lights} left.` : `Time ran out with ${s.held} of ${st.waves} waves held and ${lights} left.`;
    else summary = `The game ended on wave ${s.wave} with ${lights} left.`;
    return { standings, outcome: s.result === 'win' ? 'coop-win' : 'coop-loss', summary };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you || view.result) return null;
    const spend = botSpend(view, ctx.playerId);
    if (spend) return spend;
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    // Spending is a quick tap; answering takes a while.
    if (view?.you && botSpend(view, view.you.id)) return 700 + rng.int(0, 1300);
    return 2200 + rng.int(0, 4500);
  },
});
