/*
 * Lantern Rally: a lane racer. Right answers give boost charges; the karts
 * drive themselves round a circuit of three lanes.
 *
 * The server owns every position and speed. Devices send only intents: a
 * boost, a step left or right, and whether auto-steer is on. The race is a
 * small fixed-step simulation (50 ms steps) that is advanced to the game
 * clock at the start of every hook: a player's action, the 500 ms tick that
 * keeps every screen up to date while racing, the race's end. Effects (a
 * boost, a lantern's glow, a puddle, a cough) are windows of game time that
 * add to or take from the cruising speed while they last, so a kart's speed
 * between two steps is a plain sum and replays exactly.
 *
 * Steering is a quiet action: it changes a lane and the room sends the
 * mode's pulse (every kart's distance, lane, speed and what it is doing)
 * instead of full views. Anything that also changes what a player's own
 * screen shows (a lap, a finish, a feed line) becomes a full update by
 * itself, as the runtime decides.
 *
 * Items lie round the lap in rows (puddles, cones and lanterns), the same
 * every lap of a race, placed from ctx.rng when the race starts. Lanterns are
 * collected by each kart once a lap (nobody takes one from anyone else), and
 * what one gives is drawn from ctx.rng from the weights every screen prints
 * (odds.ts). Auto-steer decides each hazard and lantern once, with ctx.rng, as
 * an average driver would: it notices most hazards in time, goes for some
 * lanterns, and spends charges on clear road.
 *
 * Kinds of race (settings, one at a time): a race of laps (the default), a
 * Team Relay against the clock (team distances add up), a Grand Prix of three
 * one-lap races on the three circuits with points carried over and reversed
 * grids, and a Time Trial where everyone drives alone against their own best
 * lap.
 */
import { z } from 'zod';
import { answerSchema, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { BotContext, BotMind, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  AUTO,
  BOOST,
  BREAK_MS,
  COUGH,
  GLOW,
  GP_RACES,
  GRID,
  GRID_MS,
  HAZARD,
  LANE_MS,
  LAYOUT,
  MAX_CHARGES,
  PARK_M,
  POINTS,
  SLIP,
  SPEED,
  STEADY_MS,
  STEP_MS,
  TICK_MS,
  WHISTLE_MS,
  meta,
  placePoints,
  settings,
  trialScore,
  type ItemKind,
  type Prize,
} from './meta.ts';
import { CIRCUITS, CIRCUIT_IDS, LANES, lapLength, lapPos, type CircuitId } from './track.ts';
import { drawPrize, prizeOdds } from './odds.ts';

type Settings = { circuit: string; laps: number; hazards: boolean; relay: boolean; grandPrix: boolean; trial: boolean };

export type RaceKind = 'race' | 'relay' | 'gp' | 'trial';

export interface Item {
  at: number;
  lane: number;
  kind: ItemKind;
}

export type EventKind = 'boost' | 'full' | 'puddle' | 'cone' | 'shield' | 'lantern' | 'cough' | 'lap' | 'finish' | 'up' | 'down' | 'start';

/** Something that happened to a kart, for its driver's words and the scene. */
export interface RallyEvent {
  seq: number;
  at: number;
  kind: EventKind;
  prize?: Prize;
  place?: number;
  lap?: number;
  ms?: number;
  best?: boolean;
  final?: boolean;
}

interface Kart {
  stream: StreamState;
  steadyUntil: number;
  /** Metres from the start line, all laps counted; negative on the grid. */
  d: number;
  lane: number;
  laneAt: number;
  /** Speed in the last step, metres a second. */
  v: number;
  charges: number;
  boostUntil: number;
  glowUntil: number;
  slowUntil: number;
  slowCut: number;
  coughUntil: number;
  shield: boolean;
  slip: boolean;
  /** Game time the current lap began (when the kart crossed the line). */
  lapStart: number;
  lapsDone: number;
  lastLap: number | null;
  bestLap: number | null;
  /** Lanterns collected this lap, by item index. */
  got: number[];
  finished: number | null;
  /** Race time at the line, from the start. */
  finishMs: number | null;
  place: number;
  placeAt: number;
  /** Right answers this race. */
  answers: number;
  auto: boolean;
  autoAt: number;
  autoBoostAt: number;
  /** Items auto-steer has made up its mind about this lap: going for (or dodging) them, or not. */
  autoYes: number[];
  autoNo: number[];
  seq: number;
  events: RallyEvent[];
  /** Points from each finished race of a Grand Prix. */
  gp: number[];
  /** Time trial: where the kart was every half second of this lap, and of its best lap (metres × 10). */
  cur: number[];
  ghost: number[] | null;
  stats: { hits: number; shielded: number; lanterns: number; boosts: number };
}

type NewsKind = 'lead' | 'pass' | 'finish' | 'final' | 'best';

interface News {
  id: number;
  at: number;
  kind: NewsKind;
  who: PlayerId;
  other: PlayerId | null;
  place: number;
  ms: number | null;
}

interface State {
  kind: RaceKind;
  karts: Record<PlayerId, Kart>;
  race: number;
  circuit: CircuitId;
  length: number;
  laps: number | null;
  items: Item[];
  phase: 'race' | 'break';
  startAt: number;
  endsAt: number;
  /** When the whistle blows after the first finisher, if it has. */
  whistleAt: number | null;
  /** Game time the simulation has reached. */
  simAt: number;
  breakUntil: number | null;
  finished: PlayerId[];
  /** This race's points have been added to the Grand Prix. */
  banked: boolean;
  leader: PlayerId | null;
  leadFeedAt: number;
  /** Lead changes and overtakes go on the big screen at most this often, so a tussle does not flicker. */
  newsAt: number;
  fastest: { id: PlayerId; ms: number } | null;
  news: News[];
  seq: number;
  /** Grand Prix: each race's winner and circuit, for the summary. */
  history: { circuit: CircuitId; winner: PlayerId | null }[];
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('boost') }),
  z.object({ type: z.literal('steer'), dir: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ type: z.literal('auto'), on: z.boolean() }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const NEWS_KEEP = 8;
const EVENTS_KEEP = 5;
/** Karts in a player's view besides their own: the nearest on the track. */
const NEAR_MAX = 15;
/** Karts drawn on the big screen. */
const HOST_MAX = 40;
/** A driver's place change is told to them at most this often. */
const PLACE_EVENT_MS = 1500;
/** "Takes the lead" goes in the feed at most this often. */
const LEAD_FEED_MS = 8000;
/** Overtakes and lead changes on the big screen at most this often. */
const NEWS_GAP_MS = 4000;
/** Time trial ghost: one sample every this long. */
const GHOST_MS = 500;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const pointsText = (n: number) => `${fmt(n)} ${n === 1 ? 'point' : 'points'}`;
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
/** A race time: "41.2 s" under a minute, "1:02.3" from a minute. */
export function timeText(ms: number): string {
  const tenths = Math.round(ms / 100);
  const s = tenths / 10;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/* --------------------------------- helpers --------------------------------- */

function kindOf(ctx: ModeContext<Settings>): RaceKind {
  if (ctx.settings.trial) return 'trial';
  if (ctx.settings.grandPrix) return 'gp';
  if (ctx.settings.relay) return 'relay';
  return 'race';
}

function nameOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A driver';
}

function teamOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.teamId ?? ctx.everyone().find((p) => p.id === id)?.teamId ?? null;
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function firstCircuit(ctx: ModeContext<Settings>): CircuitId {
  return (CIRCUIT_IDS as string[]).includes(ctx.settings.circuit) ? (ctx.settings.circuit as CircuitId) : 'harbour';
}

/** The circuit of race `n` (0-based): a Grand Prix visits all three, starting with the chosen one. */
function circuitFor(ctx: ModeContext<Settings>, n: number): CircuitId {
  const i = CIRCUIT_IDS.indexOf(firstCircuit(ctx));
  return CIRCUIT_IDS[(i + n) % CIRCUIT_IDS.length]!;
}

/** How long one race may run, its grid included. */
function raceCapMs(ctx: ModeContext<Settings>, kind: RaceKind) {
  const total = timeLimitMs(ctx);
  if (kind !== 'gp') return total;
  return Math.max(60_000, Math.floor((total - (GP_RACES - 1) * BREAK_MS) / GP_RACES));
}

/** Karts still in the game, in the order players joined (which keeps every step deterministic). */
function present(s: State, ctx: ModeContext): [PlayerId, Kart][] {
  return ctx.players().filter((p) => s.karts[p.id]).map((p) => [p.id, s.karts[p.id]!]);
}

function racing(s: State, now: number) {
  return s.phase === 'race' && now >= s.startAt;
}

function pushEvent(k: Kart, at: number, e: Omit<RallyEvent, 'seq' | 'at'>) {
  k.events = [...k.events, { seq: ++k.seq, at, ...e }].slice(-EVENTS_KEEP);
}

function addNews(s: State, at: number, n: Omit<News, 'id' | 'at'>) {
  s.news = [{ id: ++s.seq, at, ...n }, ...s.news].slice(0, NEWS_KEEP);
}

/** Puddles, cones and lanterns round one lap, in rows: never all three lanes blocked, never right after the line. */
export function layoutItems(length: number, hazards: boolean, rng: Rng): Item[] {
  const out: Item[] = [];
  const lanes = [0, 1, 2];
  for (let at = LAYOUT.firstM; at < length - LAYOUT.endGapM; at += rng.int(LAYOUT.gapMin, LAYOUT.gapMax)) {
    const r = rng.next();
    const hazard = (): ItemKind => (rng.next() < 0.5 ? 'puddle' : 'cone');
    const shuffled = rng.shuffle(lanes);
    if (!hazards) {
      if (r < 0.5) out.push({ at, lane: shuffled[0]!, kind: 'lantern' });
      else if (r < 0.7) out.push({ at, lane: shuffled[0]!, kind: 'lantern' }, { at, lane: shuffled[1]!, kind: 'lantern' });
      continue;
    }
    if (r < 0.34) out.push({ at, lane: shuffled[0]!, kind: hazard() });
    else if (r < 0.52) out.push({ at, lane: shuffled[0]!, kind: hazard() }, { at, lane: shuffled[1]!, kind: hazard() });
    else if (r < 0.78) out.push({ at, lane: shuffled[0]!, kind: 'lantern' });
    else out.push({ at, lane: shuffled[0]!, kind: hazard() }, { at, lane: shuffled[1]!, kind: 'lantern' });
  }
  return out;
}

/** Where the nth kart (0-based) starts: rows of three behind the line, never spread over more than GRID.maxSpan. */
function gridSpot(n: number, count: number): { d: number; lane: number } {
  const rows = Math.max(1, Math.ceil(count / LANES));
  const gap = Math.min(GRID.gap, GRID.maxSpan / rows);
  const row = Math.floor(n / LANES);
  // The front row starts in the middle lane, then the outside lanes.
  const lane = [1, 0, 2][n % LANES]!;
  return { d: -1 - row * gap - (n % LANES) * 0.6, lane };
}

function newKart(ctx: ModeContext<Settings>, spot: { d: number; lane: number }, at: number): Kart {
  return {
    stream: streamInit(ctx),
    steadyUntil: 0,
    d: spot.d,
    lane: spot.lane,
    laneAt: -Infinity,
    v: 0,
    charges: 0,
    boostUntil: 0,
    glowUntil: 0,
    slowUntil: 0,
    slowCut: 0,
    coughUntil: 0,
    shield: false,
    slip: false,
    lapStart: at,
    lapsDone: 0,
    lastLap: null,
    bestLap: null,
    got: [],
    finished: null,
    finishMs: null,
    place: 0,
    placeAt: 0,
    answers: 0,
    auto: false,
    autoAt: 0,
    autoBoostAt: -Infinity,
    autoYes: [],
    autoNo: [],
    seq: 0,
    events: [],
    gp: [],
    cur: [],
    ghost: null,
    stats: { hits: 0, shielded: 0, lanterns: 0, boosts: 0 },
  };
}

/* --------------------------------- ranking --------------------------------- */

/** Race order: finishers by place, then the furthest round. Time trial: the best lap. Relay: points. */
function order(s: State, ids: PlayerId[]): PlayerId[] {
  const k = (id: PlayerId) => s.karts[id]!;
  const sorted = [...ids];
  if (s.kind === 'trial') sorted.sort((a, b) => (k(a).bestLap ?? Infinity) - (k(b).bestLap ?? Infinity) || k(b).d - k(a).d || a.localeCompare(b));
  else if (s.kind === 'relay') sorted.sort((a, b) => relayPoints(s, k(b)) - relayPoints(s, k(a)) || k(b).d - k(a).d || a.localeCompare(b));
  else sorted.sort((a, b) => (k(a).finished ?? Infinity) - (k(b).finished ?? Infinity) || k(b).d - k(a).d || a.localeCompare(b));
  return sorted;
}

function answerPoints(k: Kart) {
  return Math.min(k.answers, POINTS.answerCap) * POINTS.answer;
}

function relayPoints(s: State, k: Kart) {
  return Math.floor(Math.max(0, k.d) / POINTS.perPointM) + answerPoints(k);
}

/** This race's points for every kart that raced it (players who left included), by place. */
function racePoints(s: State): Map<PlayerId, number> {
  const ids = Object.keys(s.karts);
  const out = new Map<PlayerId, number>();
  if (s.kind === 'trial') {
    for (const id of ids) out.set(id, trialScore(s.karts[id]!.bestLap, s.karts[id]!.d));
    return out;
  }
  if (s.kind === 'relay') {
    for (const id of ids) out.set(id, relayPoints(s, s.karts[id]!));
    return out;
  }
  order(s, ids).forEach((id, i) => {
    const k = s.karts[id]!;
    out.set(id, placePoints(i + 1, ids.length, k.finished !== null) + answerPoints(k));
  });
  return out;
}

/** Points so far: this race's, plus a Grand Prix's earlier races. */
function totals(s: State): Map<PlayerId, number> {
  const now = s.banked ? new Map<PlayerId, number>() : racePoints(s);
  const out = new Map<PlayerId, number>();
  for (const [id, k] of Object.entries(s.karts)) out.set(id, k.gp.reduce((a, b) => a + b, 0) + (now.get(id) ?? 0));
  return out;
}

/* --------------------------------- driving --------------------------------- */

function speedOf(k: Kart, t: number) {
  let v = SPEED.cruise;
  if (k.boostUntil > t) v += BOOST.add;
  if (k.glowUntil > t) v += GLOW.add;
  if (k.slip) v += SLIP.add;
  if (k.slowUntil > t) v -= k.slowCut;
  if (k.coughUntil > t) v -= COUGH.cut;
  return Math.max(SPEED.min, v);
}

function boost(k: Kart, t: number) {
  k.charges--;
  k.boostUntil = Math.min(Math.max(k.boostUntil, t) + BOOST.ms, t + BOOST.capMs);
  k.stats.boosts++;
}

/** The first time the kart, moving from d0 to d1, passes lap position `at` (or null). */
function crossing(d0: number, d1: number, at: number, length: number): number | null {
  const x = at + length * (Math.floor((d0 - at) / length) + 1);
  return x <= d1 && x >= 0 ? x : null;
}

/** Metres ahead from lap position `from` to `to`, going forwards round the lap. */
function ahead(from: number, to: number, length: number) {
  return lapPos(to - from, length);
}

/** Auto-steer: look ahead, dodge what it notices, go for some lanterns, spend charges on clear road. */
function autoSteer(s: State, ctx: ModeContext<Settings>, k: Kart, t: number) {
  if (t < k.autoAt) return;
  k.autoAt = t + 250;
  const pos = lapPos(k.d, s.length);
  const look = Math.max(15, speedOf(k, t) * AUTO.lookSec);
  const near = s.items.map((it, i) => ({ it, i, dist: ahead(pos, it.at, s.length) })).filter((x) => x.dist > 0.5 && x.dist <= Math.max(look, AUTO.clearM));
  const hazardIn = (lane: number, within: number) => near.some((x) => x.it.lane === lane && x.it.kind !== 'lantern' && x.dist <= within);
  const lanternIn = (lane: number) => near.find((x) => x.it.lane === lane && x.it.kind === 'lantern' && x.dist <= look && !k.got.includes(x.i));
  const decide = (i: number, chance: number) => {
    if (k.autoYes.includes(i)) return true;
    if (k.autoNo.includes(i)) return false;
    const yes = ctx.rng.next() < chance;
    (yes ? k.autoYes : k.autoNo).push(i);
    return yes;
  };
  const canMove = t - k.laneAt >= LANE_MS;
  const threat = near.find((x) => x.it.lane === k.lane && x.it.kind !== 'lantern' && x.dist <= look);
  if (threat && canMove && !k.shield && decide(threat.i, AUTO.notice)) {
    const options = [k.lane - 1, k.lane + 1].filter((l) => l >= 0 && l < LANES && !hazardIn(l, threat.dist + 6));
    // Prefer a lane with a lantern in it, then the middle.
    options.sort((a, b) => Number(Boolean(lanternIn(b))) - Number(Boolean(lanternIn(a))) || Math.abs(a - 1) - Math.abs(b - 1));
    let to = options[0];
    // Boxed in on both sides: head across towards the far lane if it is clear.
    if (to === undefined && k.lane !== 1) {
      const far = k.lane === 0 ? 2 : 0;
      if (!hazardIn(far, threat.dist + 6)) to = 1;
    }
    if (to !== undefined) {
      k.lane = to;
      k.laneAt = t;
    }
  } else if (!threat && canMove) {
    for (const l of [k.lane - 1, k.lane + 1]) {
      if (l < 0 || l >= LANES) continue;
      const lan = lanternIn(l);
      if (lan && !hazardIn(l, lan.dist + 4) && decide(lan.i, AUTO.lantern)) {
        k.lane = l;
        k.laneAt = t;
        break;
      }
    }
  }
  if (k.charges > 0 && k.boostUntil <= t && t - k.autoBoostAt >= AUTO.boostGapMs && !hazardIn(k.lane, AUTO.clearM)) {
    boost(k, t);
    k.autoBoostAt = t;
  }
}

/** Slipstreams: a kart close ahead in the same lane, any lap (finished karts parked past the line do not count). */
function slipstreams(s: State, karts: [PlayerId, Kart][]) {
  for (const [, k] of karts) k.slip = false;
  if (s.kind === 'trial') return;
  for (let lane = 0; lane < LANES; lane++) {
    const inLane = karts.filter(([, k]) => k.lane === lane && k.finished === null && k.d >= 0).map(([, k]) => ({ k, p: lapPos(k.d, s.length) }));
    if (inLane.length < 2) continue;
    inLane.sort((a, b) => a.p - b.p);
    for (let i = 0; i < inLane.length; i++) {
      const me = inLane[i]!;
      const next = inLane[(i + 1) % inLane.length]!;
      const gap = ahead(me.p, next.p, s.length);
      if (next !== me && gap >= SLIP.min && gap <= SLIP.max) me.k.slip = true;
    }
  }
}

function step(s: State, ctx: ModeContext<Settings>, t: number) {
  const karts = present(s, ctx);
  slipstreams(s, karts);
  const dt = STEP_MS / 1000;
  for (const [id, k] of karts) {
    if (k.finished !== null) {
      // Roll to a stop just past the line.
      const park = (s.laps ?? 0) * s.length + PARK_M;
      k.v = Math.max(0, Math.min(k.v, (park - k.d) * 1.6));
      k.d = Math.min(park, k.d + k.v * dt);
      continue;
    }
    if (k.auto) autoSteer(s, ctx, k, t);
    const v = speedOf(k, t);
    const d0 = k.d;
    const d1 = d0 + v * dt;
    // Items in this kart's lane that it drives over in this step.
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i]!;
      if (it.lane !== k.lane || crossing(d0, d1, it.at, s.length) === null) continue;
      if (it.kind === 'lantern') {
        if (k.got.includes(i)) continue;
        k.got.push(i);
        k.stats.lanterns++;
        const prize = drawPrize(ctx.rng);
        if (prize === 'glow') k.glowUntil = t + GLOW.ms;
        else if (prize === 'shield') k.shield = true;
        else k.charges = Math.min(MAX_CHARGES, k.charges + 1);
        pushEvent(k, t, { kind: 'lantern', prize });
      } else if (k.shield) {
        k.shield = false;
        k.stats.shielded++;
        pushEvent(k, t, { kind: 'shield' });
      } else {
        const h = HAZARD[it.kind];
        k.slowUntil = t + h.ms;
        k.slowCut = h.cut;
        k.stats.hits++;
        pushEvent(k, t, { kind: it.kind });
      }
    }
    // The line.
    const before = Math.floor(d0 / s.length);
    const after = Math.floor(d1 / s.length);
    if (after > before && d1 >= 0) {
      const tc = t + ((after * s.length - d0) / Math.max(1e-6, d1 - d0)) * STEP_MS;
      if (after >= 1) lapDone(s, ctx, id, k, after, tc);
      else {
        // Over the line from the grid: the first lap's clock starts here.
        k.lapStart = tc;
        k.cur = [];
      }
    }
    k.d = d1;
    k.v = v;
    if (s.kind === 'trial' && k.d >= 0 && k.finished === null) {
      const idx = Math.floor((t + STEP_MS - k.lapStart) / GHOST_MS);
      while (k.cur.length <= idx && k.cur.length < 400) k.cur.push(Math.round(lapPos(k.d, s.length) * 10));
    }
  }
}

function lapDone(s: State, ctx: ModeContext<Settings>, id: PlayerId, k: Kart, laps: number, tc: number) {
  const ms = Math.round(tc - k.lapStart);
  const best = k.bestLap === null || ms < k.bestLap;
  k.lapsDone = laps;
  k.lastLap = ms;
  if (best) {
    k.bestLap = ms;
    if (s.kind === 'trial') k.ghost = k.cur.slice();
  }
  k.lapStart = tc;
  k.cur = [];
  k.got = [];
  k.autoYes = [];
  k.autoNo = [];
  const quickest = !s.fastest || ms < s.fastest.ms;
  if (quickest) {
    s.fastest = { id, ms };
    if (s.kind !== 'race' || laps > 1 || s.laps === 1) addNews(s, tc, { kind: 'best', who: id, other: null, place: 0, ms });
  }
  const finishing = s.laps !== null && laps >= s.laps;
  const final = s.laps !== null && laps === s.laps - 1;
  pushEvent(k, tc, { kind: 'lap', lap: laps, ms, best, final });
  if (final && s.leader === id) addNews(s, tc, { kind: 'final', who: id, other: null, place: 1, ms: null });
  if (finishing) finish(s, ctx, id, k, tc);
}

function finish(s: State, ctx: ModeContext<Settings>, id: PlayerId, k: Kart, tc: number) {
  s.finished.push(id);
  k.finished = s.finished.length;
  k.finishMs = Math.round(tc - s.startAt);
  k.boostUntil = 0;
  k.glowUntil = 0;
  pushEvent(k, tc, { kind: 'finish', place: k.finished, ms: k.finishMs });
  addNews(s, tc, { kind: 'finish', who: id, other: null, place: k.finished, ms: k.finishMs });
  const first = k.finished === 1;
  ctx.feed(`${nameOf(ctx, id)} crossed the line ${first ? 'first' : `in ${ordinal(k.finished)} place`}${first ? ` in ${timeText(k.finishMs)}!` : '.'}`, { tone: first ? 'big' : 'info' });
  if (first && s.whistleAt === null) {
    s.whistleAt = Math.min(s.endsAt, Math.round(tc) + WHISTLE_MS);
    if (s.whistleAt < s.endsAt) {
      s.endsAt = s.whistleAt;
      ctx.setTimer('time', s.endsAt);
    }
  }
}

/** Run the race up to the game clock. */
function advance(s: State, ctx: ModeContext<Settings>) {
  const now = ctx.now();
  if (!racing(s, now)) return;
  if (s.simAt < s.startAt) s.simAt = s.startAt;
  while (s.simAt + STEP_MS <= now && s.phase === 'race') {
    step(s, ctx, s.simAt);
    s.simAt += STEP_MS;
  }
}

/** Everyone still in the game has finished. */
function allFinished(s: State, ctx: ModeContext) {
  if (s.laps === null) return false;
  const karts = present(s, ctx);
  return karts.length > 0 && karts.every(([, k]) => k.finished !== null);
}

/** Places and overtakes, once a tick: each driver hears when they move up or down, the big screen hears about the front. */
function places(s: State, ctx: ModeContext<Settings>) {
  const now = s.simAt;
  const ids = order(
    s,
    present(s, ctx).map(([id]) => id),
  );
  const before = new Map(ids.map((id) => [id, s.karts[id]!.place]));
  ids.forEach((id, i) => {
    const k = s.karts[id]!;
    const place = i + 1;
    const was = k.place;
    if (was && place !== was && now - k.placeAt >= PLACE_EVENT_MS && s.kind !== 'trial' && now > s.startAt + 1500) {
      pushEvent(k, now, { kind: place < was ? 'up' : 'down', place });
      k.placeAt = now;
    }
    k.place = place;
  });
  if (s.kind === 'trial' || s.kind === 'relay' || now <= s.startAt + 1500) {
    s.leader = ids[0] ?? null;
    return;
  }
  const lead = ids[0] ?? null;
  if (lead && s.leader && lead !== s.leader && s.karts[lead]!.finished === null) {
    if (now - s.newsAt >= NEWS_GAP_MS) {
      s.newsAt = now;
      addNews(s, now, { kind: 'lead', who: lead, other: s.leader, place: 1, ms: null });
    }
    if (now - s.leadFeedAt >= LEAD_FEED_MS) {
      s.leadFeedAt = now;
      ctx.feed(`${nameOf(ctx, lead)} takes the lead!`, { tone: 'info' });
    }
  } else {
    // The best overtake for a podium place this tick.
    for (let i = 1; i < Math.min(3, ids.length); i++) {
      const id = ids[i]!;
      const was = before.get(id) ?? 0;
      if (was > i + 1 && s.karts[id]!.finished === null) {
        const passed = ids.find((o) => before.get(o) === i + 1);
        if (passed && passed !== id && now - s.newsAt >= NEWS_GAP_MS) {
          s.newsAt = now;
          addNews(s, now, { kind: 'pass', who: id, other: passed, place: i + 1, ms: null });
        }
        break;
      }
    }
  }
  s.leader = lead;
}

/* ------------------------------- race and break ------------------------------ */

function startRace(s: State, ctx: ModeContext<Settings>, n: number, at: number) {
  s.race = n;
  s.circuit = circuitFor(ctx, n);
  s.length = lapLength(s.circuit);
  s.items = layoutItems(s.length, ctx.settings.hazards, ctx.rng);
  s.phase = 'race';
  s.startAt = at + GRID_MS;
  s.endsAt = at + raceCapMs(ctx, s.kind);
  s.whistleAt = null;
  s.simAt = s.startAt;
  s.breakUntil = null;
  s.finished = [];
  s.banked = false;
  s.leader = null;
  s.fastest = null;
  // The grid: in a Grand Prix, after the first race, the fewest points start at the front.
  let ids = present(s, ctx).map(([id]) => id);
  if (s.kind === 'gp' && n > 0) {
    const t = totals(s);
    ids = ids.sort((a, b) => (t.get(a) ?? 0) - (t.get(b) ?? 0) || a.localeCompare(b));
  } else ids = ctx.rng.shuffle(ids);
  ids.forEach((id, i) => {
    const k = s.karts[id]!;
    const spot = s.kind === 'trial' ? { d: -1, lane: 1 } : gridSpot(i, ids.length);
    Object.assign(k, {
      d: spot.d,
      lane: spot.lane,
      laneAt: -Infinity,
      v: 0,
      boostUntil: 0,
      glowUntil: 0,
      slowUntil: 0,
      coughUntil: 0,
      shield: false,
      slip: false,
      lapStart: s.startAt,
      lapsDone: 0,
      lastLap: null,
      got: [],
      finished: null,
      finishMs: null,
      place: i + 1,
      placeAt: 0,
      answers: 0,
      autoYes: [],
      autoNo: [],
      cur: [],
    });
    if (n > 0) k.bestLap = null;
    pushEvent(k, at, { kind: 'start', lap: n + 1 });
  });
  ctx.setTimer('tick', s.startAt);
  ctx.setTimer('time', s.endsAt);
}

function bank(s: State) {
  if (s.banked) return;
  const pts = racePoints(s);
  for (const [id, k] of Object.entries(s.karts)) k.gp.push(pts.get(id) ?? 0);
  s.history.push({ circuit: s.circuit, winner: order(s, Object.keys(s.karts))[0] ?? null });
  s.banked = true;
}

function endRace(s: State, ctx: ModeContext<Settings>) {
  places(s, ctx);
  if (s.kind === 'gp' && s.race < GP_RACES - 1) {
    bank(s);
    s.phase = 'break';
    s.breakUntil = ctx.now() + BREAK_MS;
    ctx.clearTimer('tick');
    ctx.clearTimer('time');
    ctx.setTimer('next', s.breakUntil);
    const won = s.history[s.history.length - 1]?.winner;
    ctx.feed(`${won ? `${nameOf(ctx, won)} won race ${s.race + 1}. ` : ''}Next: ${CIRCUITS[circuitFor(ctx, s.race + 1)].name}, in ${BREAK_MS / 1000} seconds.`, { tone: 'big' });
    return;
  }
  if (s.kind === 'gp') bank(s);
  ctx.endGame();
}

/* ---------------------------------- views ---------------------------------- */

const flagBits = (k: Kart, t: number) =>
  (k.boostUntil > t ? 1 : 0) | (k.slowUntil > t ? 2 : 0) | (k.shield ? 4 : 0) | (k.glowUntil > t ? 8 : 0) | (k.finished !== null ? 16 : 0) | (k.coughUntil > t ? 32 : 0) | (k.slip ? 64 : 0);

/** Compact kart positions for every screen: [id, metres × 10, lane, speed × 10, flags]. */
export type PulseKart = [string, number, number, number, number];
export interface RallyPulse {
  /** Game time the positions are for. */
  t: number;
  k: PulseKart[];
}

function kartView(s: State, ctx: ModeContext, id: PlayerId, me: PlayerId | null) {
  const k = s.karts[id]!;
  return {
    playerId: id,
    name: nameOf(ctx, id),
    teamId: teamOf(ctx, id),
    d: Math.round(k.d * 10) / 10,
    lane: k.lane,
    v: Math.round(k.v * 10) / 10,
    flags: flagBits(k, s.simAt),
    place: k.place,
    lap: lapOf(s, k),
    finished: k.finished,
    isYou: id === me,
  };
}

/** The lap a kart is on (1 on the grid), never past the last. */
function lapOf(s: State, k: Kart) {
  const lap = Math.max(1, k.lapsDone + 1);
  return s.laps !== null ? Math.min(s.laps, lap) : lap;
}

function boardRows(s: State, ctx: ModeContext, me: PlayerId | null) {
  const ids = order(
    s,
    present(s, ctx).map(([id]) => id),
  );
  const pts = totals(s);
  return ids.map((id, i) => {
    const k = s.karts[id]!;
    return {
      playerId: id,
      name: nameOf(ctx, id),
      teamId: teamOf(ctx, id),
      place: i + 1,
      lap: lapOf(s, k),
      finished: k.finished,
      finishMs: k.finishMs,
      bestLap: k.bestLap,
      metres: Math.max(0, Math.round(k.d)),
      points: pts.get(id) ?? 0,
      isYou: id === me,
    };
  });
}

function teamRows(s: State, ctx: ModeContext) {
  if (!ctx.teams().length) return null;
  const pts = totals(s);
  const everyone = ctx.everyone();
  const members = (teamId: string) => everyone.filter((p) => p.teamId === teamId && s.karts[p.id]);
  const biggest = Math.max(1, ...ctx.teams().map((t) => members(t.id).length));
  return ctx.teams().map((t) => {
    const list = members(t.id);
    if (s.kind === 'relay') {
      const metres = list.reduce((n, p) => n + Math.max(0, s.karts[p.id]!.d), 0);
      const scaled = list.length ? Math.round((metres * biggest) / list.length) : 0;
      return { teamId: t.id, name: t.name, hue: t.hue, members: list.length, score: scaled, metres: scaled };
    }
    const total = list.reduce((n, p) => n + (pts.get(p.id) ?? 0), 0);
    return { teamId: t.id, name: t.name, hue: t.hue, members: list.length, score: list.length ? Math.round(total / list.length) : 0, metres: null };
  });
}

/* ----------------------------------- mode ---------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A practice bot with a mind lets auto-steer drive, as many players do, but spends boosts by
 * temperament: a bold bot fires a charge as soon as it has a spare one, a careful one saves them.
 */
function mindedBot(view: any, ctx: BotContext, mind: BotMind): Action | null {
  const you = view?.you;
  if (!you) return null;
  if (!you.auto && view.phase === 'race' && you.finished === null) return { type: 'auto', on: true };
  if (view.phase === 'race' && you.finished === null && you.charges >= 2 && mind.chance(mind.boldness() * 0.35)) return { type: 'boost' };
  const q = you.question;
  return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
}

export const lanternRally = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const now = ctx.now();
    const kind = kindOf(ctx);
    const circuit = circuitFor(ctx, 0);
    const s: State = {
      kind,
      karts: {},
      race: 0,
      circuit,
      length: lapLength(circuit),
      laps: kind === 'relay' || kind === 'trial' ? null : ctx.settings.laps,
      items: [],
      phase: 'race',
      startAt: now + GRID_MS,
      endsAt: now,
      whistleAt: null,
      simAt: now,
      breakUntil: null,
      finished: [],
      banked: false,
      leader: null,
      leadFeedAt: -Infinity,
      newsAt: -Infinity,
      fastest: null,
      news: [],
      seq: 0,
      history: [],
    };
    for (const p of ctx.players()) s.karts[p.id] = newKart(ctx, { d: -1, lane: 1 }, now);
    startRace(s, ctx, 0, now);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    if (s.karts[p.id]) return;
    advance(s, ctx);
    const now = ctx.now();
    const others = present(s, ctx).filter(([id]) => id !== p.id);
    let spot: { d: number; lane: number };
    if (s.kind === 'trial') spot = { d: -1, lane: 1 };
    else if (s.phase === 'race' && now >= s.startAt && others.length) {
      // Late to the race: start a little behind the last kart still racing.
      const racingKarts = others.map(([, k]) => k).filter((k) => k.finished === null);
      const last = racingKarts.length ? Math.min(...racingKarts.map((k) => k.d)) : 0;
      spot = { d: Math.max(-GRID.maxSpan, last - 8), lane: 1 };
    } else spot = gridSpot(others.length, others.length + 1);
    const k = newKart(ctx, spot, Math.max(now, s.startAt));
    k.place = others.length + 1;
    // A Grand Prix newcomer has nothing banked from the races they missed.
    if (s.kind === 'gp') k.gp = Array.from({ length: s.history.length }, () => 0);
    s.karts[p.id] = k;
  },
  onPlayerLeave(s, _p, ctx) {
    advance(s, ctx);
    if (s.phase === 'race' && allFinished(s, ctx)) endRace(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    const k = s.karts[playerId];
    if (!k) return { error: 'You are not in this race.' };
    advance(s, ctx);
    const now = ctx.now();
    const t = s.simAt;
    let result: void | { quiet: true } = undefined;
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(k.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        const last = k.stream.last;
        if (res.correct) {
          const live = s.phase === 'race';
          if (live) k.answers++;
          const scored = live && k.answers <= POINTS.answerCap ? ` (+${POINTS.answer} points)` : '';
          if (k.charges < MAX_CHARGES) {
            k.charges++;
            if (last) last.text = `+1 boost charge${scored}`;
          } else if (racing(s, now) && k.finished === null) {
            boost(k, t);
            k.charges = MAX_CHARGES;
            pushEvent(k, t, { kind: 'full' });
            if (last) last.text = `Charges full, so it boosted at once${scored}`;
          } else if (last) last.text = `Your charges are full${scored}`;
          streamNext(k.stream, ctx);
        } else {
          if (last) last.text = 'Your engine coughed. The next question comes when it clears.';
          if (racing(s, now) && k.finished === null) {
            k.coughUntil = t + COUGH.ms;
            pushEvent(k, t, { kind: 'cough' });
          }
          k.steadyUntil = now + STEADY_MS;
          ctx.setTimer(`steady:${playerId}`, k.steadyUntil);
        }
        break;
      }
      case 'boost': {
        if (s.phase !== 'race') return { error: 'Wait for the next race to start.' };
        if (now < s.startAt) return { error: 'Wait for the lights: the race has not started.' };
        if (k.finished !== null) return { error: 'You have finished the race.' };
        if (k.charges < 1) return { error: 'You have no boost charges. Answer a question right to earn one.' };
        boost(k, t);
        pushEvent(k, t, { kind: 'boost' });
        break;
      }
      case 'steer': {
        if (s.phase !== 'race') return { error: 'Wait for the next race to start.' };
        if (k.finished !== null) return { error: 'You have finished the race.' };
        const to = k.lane + a.dir;
        if (to < 0 || to >= LANES) return { error: a.dir < 0 ? 'You are already in the left lane.' : 'You are already in the right lane.' };
        if (t - k.laneAt < LANE_MS) return { error: 'Your kart is still changing lane.' };
        const wasAuto = k.auto;
        k.lane = to;
        k.laneAt = t;
        // Steering by hand takes over from auto-steer.
        k.auto = false;
        if (!wasAuto) result = { quiet: true };
        break;
      }
      case 'auto': {
        k.auto = a.on;
        k.autoAt = 0;
        break;
      }
    }
    if (s.phase === 'race' && allFinished(s, ctx)) endRace(s, ctx);
    return result;
  },
  onTimer(s, id, ctx) {
    if (id.startsWith('steady:')) {
      const k = s.karts[id.slice('steady:'.length)];
      if (k && !k.stream.iid) streamNext(k.stream, ctx);
      return;
    }
    if (id === 'next') {
      startRace(s, ctx, s.race + 1, ctx.now());
      return;
    }
    if (s.phase !== 'race') return;
    advance(s, ctx);
    if (id === 'time') {
      endRace(s, ctx);
      return;
    }
    if (id === 'tick') {
      places(s, ctx);
      if (allFinished(s, ctx)) {
        endRace(s, ctx);
        return;
      }
      ctx.setTimer('tick', Math.max(ctx.now(), s.startAt) + TICK_MS);
    }
  },
  view(s, viewer, ctx) {
    const now = ctx.now();
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = boardRows(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const base = {
      kind: s.kind,
      phase: s.phase,
      race: s.race + 1,
      races: s.kind === 'gp' ? GP_RACES : 1,
      circuit: s.circuit,
      length: s.length,
      laps: s.laps,
      startAt: s.startAt,
      endsAt: s.endsAt,
      whistleAt: s.whistleAt,
      breakUntil: s.breakUntil,
      /** Puddles, cones and lanterns round the lap: [metres, lane, 0 puddle / 1 cone / 2 lantern]. */
      items: s.items.map((it) => [Math.round(it.at * 10) / 10, it.lane, it.kind === 'puddle' ? 0 : it.kind === 'cone' ? 1 : 2] as [number, number, number]),
      odds: prizeOdds(),
      at: s.simAt,
      racers: rows.length,
      finished: s.finished.length,
      fastest: s.fastest ? { name: nameOf(ctx, s.fastest.id), ms: s.fastest.ms } : null,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') {
      return {
        ...base,
        karts: rows.slice(0, HOST_MAX).map((r) => kartView(s, ctx, r.playerId, null)),
        news: s.news.map((n) => ({ id: n.id, playerId: n.who, at: n.at, kind: n.kind, name: nameOf(ctx, n.who), other: n.other ? nameOf(ctx, n.other) : null, place: n.place, ms: n.ms })),
      };
    }
    const k = me ? s.karts[me] : undefined;
    if (!me || !k) return { ...base, karts: [], you: null };
    const pos = k.d;
    const near =
      s.kind === 'trial'
        ? []
        : present(s, ctx)
            .filter(([id]) => id !== me)
            .map(([id, o]) => ({ id, gap: Math.abs(o.d - pos) }))
            .sort((a, b) => a.gap - b.gap || a.id.localeCompare(b.id))
            .slice(0, NEAR_MAX)
            .map((o) => kartView(s, ctx, o.id, me));
    const t = s.simAt;
    const pts = totals(s);
    return {
      ...base,
      karts: [kartView(s, ctx, me, me), ...near],
      you: {
        d: Math.round(k.d * 10) / 10,
        lane: k.lane,
        v: Math.round(k.v * 10) / 10,
        charges: k.charges,
        maxCharges: MAX_CHARGES,
        auto: k.auto,
        place: mine?.place ?? k.place,
        lap: lapOf(s, k),
        lapStart: k.lapStart,
        lastLap: k.lastLap,
        bestLap: k.bestLap,
        finished: k.finished,
        finishMs: k.finishMs,
        boostUntil: k.boostUntil > t ? k.boostUntil : null,
        glowUntil: k.glowUntil > t ? k.glowUntil : null,
        slowUntil: k.slowUntil > t ? k.slowUntil : null,
        coughUntil: k.coughUntil > t ? k.coughUntil : null,
        shield: k.shield,
        slip: k.slip,
        canSteerAt: k.laneAt + LANE_MS,
        steadyUntil: k.steadyUntil > now ? k.steadyUntil : null,
        points: pts.get(me) ?? 0,
        gp: s.kind === 'gp' ? k.gp : null,
        answers: Math.min(k.answers, POINTS.answerCap),
        answerCap: POINTS.answerCap,
        team: teamOf(ctx, me) ? (ctx.teams().find((tm) => tm.id === teamOf(ctx, me))?.name ?? null) : null,
        ghost: s.kind === 'trial' ? k.ghost : null,
        /** Lanterns collected this lap (item indices): drawn dim until the next lap. */
        got: k.got,
        events: k.events,
        stats: { ...k.stats },
        question: streamQuestionView(k.stream, ctx),
        last: k.stream.last,
      },
    };
  },
  pulse(s, ctx): RallyPulse {
    const t = s.simAt;
    return { t, k: present(s, ctx).map(([id, k]) => [id, Math.round(k.d * 10), k.lane, Math.round(k.v * 10), flagBits(k, t)]) };
  },
  results(s, ctx) {
    const pts = totals(s);
    const ids = order(s, Object.keys(s.karts));
    const placeOf = new Map(ids.map((id, i) => [id, i + 1]));
    const standings = ctx.everyone().map((pl) => {
      const k = s.karts[pl.id];
      const score = pts.get(pl.id) ?? 0;
      let where: string;
      if (!k) where = 'did not race';
      else if (s.kind === 'trial') where = k.bestLap !== null ? `best lap ${timeText(k.bestLap)}` : 'no full lap';
      else if (s.kind === 'relay') where = `${fmt(Math.max(0, k.d))} m`;
      else if (s.kind === 'gp') where = `${k.gp.length ? k.gp.map((n) => fmt(n)).join(' + ') : '0'}`;
      else if (k.finished !== null) where = `${ordinal(k.finished)}, ${timeText(k.finishMs ?? 0)}`;
      else where = `${ordinal(placeOf.get(pl.id) ?? ids.length)}, lap ${lapOf(s, k)} at the whistle`;
      return { playerId: pl.id, score, label: `${pointsText(score)} (${where})` };
    });
    const teams = teamRows(s, ctx);
    let summary: string;
    const circuit = CIRCUITS[s.circuit].name;
    if (s.kind === 'trial') {
      summary = s.fastest ? `Fastest lap of ${circuit}: ${nameOf(ctx, s.fastest.id)}, ${timeText(s.fastest.ms)}.` : `Nobody completed a lap of ${circuit}.`;
    } else if (s.kind === 'relay') {
      const best = teams?.slice().sort((a, b) => b.score - a.score)[0];
      const far = ids[0];
      summary = best ? `${best.name} covered the most ground: ${fmt(best.score)} metres.` : far ? `${nameOf(ctx, far)} drove furthest: ${fmt(Math.max(0, s.karts[far]!.d))} metres.` : 'Nobody drove.';
    } else if (s.kind === 'gp') {
      const top = [...pts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      summary = top ? `${nameOf(ctx, top[0])} won the Grand Prix with ${pointsText(top[1])}.` : 'The Grand Prix ended.';
      const wins = s.history.map((h, i) => (h.winner ? `race ${i + 1} to ${nameOf(ctx, h.winner)}` : null)).filter((w): w is string => Boolean(w));
      if (wins.length) {
        const line = wins.join(', ');
        summary += ` ${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
      }
    } else {
      const first = s.finished[0];
      summary = first ? `${nameOf(ctx, first)} won the race round ${circuit}.` : ids[0] ? `Nobody finished. ${nameOf(ctx, ids[0])} was in front at the whistle.` : 'Nobody raced.';
      if (s.fastest) summary += ` Fastest lap: ${nameOf(ctx, s.fastest.id)}, ${timeText(s.fastest.ms)}.`;
    }
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.score, label: s.kind === 'relay' ? `${fmt(t.score)} metres` : `${pointsText(t.score)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    if (ctx.mind) return mindedBot(view, ctx, ctx.mind);
    const you = view?.you;
    if (!you) return null;
    // Bots let auto-steer drive and spend their charges, and answer questions.
    if (!you.auto && view.phase === 'race' && you.finished === null) return { type: 'auto', on: true };
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (you && !you.auto) return 400 + rng.int(0, 800);
    return 2200 + rng.int(0, 4300);
  },
});
