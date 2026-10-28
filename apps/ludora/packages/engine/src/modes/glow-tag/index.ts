/*
 * Glow Tag Royale: a light-tag battle royale. Right answers charge your beam;
 * walk the park, tag rivals to dim their glow, and stay inside the ring.
 *
 * Walking is a quiet action: the move is kept, and instead of full views the
 * room sends the mode's pulse (everyone's position) at most 10 times a second.
 * A move that does anything else (picks up a crate) is an ordinary change.
 * Nothing a quiet move does sets a timer: the ring's drain is its own timer,
 * every 3 seconds, which checks who is outside.
 *
 * The server decides everything: how far a step may go (game time since the
 * walking budget was last spent, at walking speed, plus a little slack),
 * walls and cover, and every tag (range, cone and line of sight, from the
 * server's own positions and the last heading it accepted).
 *
 * Right answers in the arena charge the beam. While dimmed, right answers
 * count towards relighting instead, and a player relights with at least 2
 * charges, so coming back is never helpless.
 *
 * The ring shrinks in phases. Each next ring is drawn from ctx.rng when the
 * last shrink ends and shown at once, so players can move in time. The last
 * phase is the final ring: from its start nobody relights, dimmed players
 * earn cheer points, and the game ends when one player or team is left
 * glowing (or when time runs out, which is the only end in a solo game).
 *
 * Lights Out: a player sees teammates, players within 12 metres and anyone
 * who used their beam in the last 2 seconds. Views are filtered per viewer.
 * The pulse is the same for everyone, so in Lights Out it lists only the
 * players everybody may see (dimmed or lit); nearby players' positions travel
 * in each player's own view, and while players are close enough to see each
 * other their moves refresh the views at most every 200 ms instead of being
 * quiet. The host screen sees what the pulse sees.
 */
import { z } from 'zod';
import { answerSchema, hashString, type Answer, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  ARENA,
  BEAMS,
  BOARD,
  CHARGE,
  CRATE_INFO,
  CRATE_ODDS,
  CRATES,
  FLAGS,
  GLOW,
  LIGHTS_OUT,
  MOVE,
  PLAYER_RADIUS,
  RELIGHT,
  RING,
  SCORE,
  TAG,
  meta,
  settings,
  type ArenaMap,
  type BeamView,
  type BoardRow,
  type CrateKind,
  type CrateView,
  type GlowTagAction,
  type GlowTagHostView,
  type GlowTagPlayer,
  type GlowTagPlayerView,
  type GlowTagPulse,
  type GlowTagYou,
  type PulseEntry,
  type RingCircle,
  type RingView,
  type TagOutcome,
  type TeamRow,
} from './meta.ts';
import { arenaSize, clampToArena, edgeSpots, generateMap, headingTo, inCone, lineOfSight, outsideRing, overlapsCover, pushOut, raycast, ringAt, startRing, walk, wrapAngle, type RingShrink } from './arena.ts';

type Settings = { oneGlow: boolean; lightsOut: boolean; squads: boolean };

interface Glower {
  stream: StreamState;
  team: string | null;
  x: number;
  z: number;
  h: number;
  /** Game time up to which this player's walking allowance has been spent. */
  budgetAt: number;
  glow: number;
  charges: number;
  cooldownUntil: number;
  in: boolean;
  /** Dimmed for the rest of the game. */
  out: boolean;
  /** Right answers towards relighting. */
  relight: number;
  safeUntil: number;
  shield: boolean;
  speedUntil: number;
  /** When this player last used their beam (Lights Out: lit for a moment). */
  beamAt: number;
  lastTag: GlowTagYou['lastTag'];
  lastHit: GlowTagYou['lastHit'];
  score: number;
  tags: number;
  dims: number;
  /** Times this player was dimmed. */
  dimmed: number;
  relights: number;
  cheer: number;
}

interface NextRing extends RingCircle {
  startAt: number;
  endAt: number;
}

interface State {
  map: ArenaMap;
  g: Record<PlayerId, Glower>;
  ring: RingShrink;
  next: NextRing | null;
  /** Shrinks started so far. */
  phase: number;
  /** When the ring next drains glow (from the first shrink on), or null before it. */
  drainAt: number | null;
  /** Game time each phase starts. */
  phaseStarts: number[];
  finalAt: number;
  final: boolean;
  crates: CrateView[];
  beams: BeamView[];
  seq: number;
  endsAt: number;
  /** Lights Out: the next time a move may refresh everyone's views. */
  refreshAt: number;
  stats: { tags: number; dims: number; relights: number; crates: number; ring: number };
  /** The player or team left glowing when the final ring ended the game. */
  winner: { team: string | null; player: PlayerId | null } | null;
  over: boolean;
}

const coord = z.number().min(-1000).max(1000);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), x: coord, z: coord, h: z.number().min(-100).max(100) }),
  z.object({ type: z.literal('tag'), target: z.string().min(1).max(64) }),
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
]);
type Action = z.infer<typeof action>;

/** Used when the host sets no time limit. */
const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
/** A beam that misses still travels this far, or to the first cover in its way. */
const BEAM_REACH = TAG.range;

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function nameOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

const startGlow = (ctx: ModeContext<Settings>) => (ctx.settings.oneGlow ? GLOW.oneGlow : GLOW.start);
const relightNeed = (ctx: ModeContext<Settings>) => (ctx.settings.oneGlow ? RELIGHT.oneGlowNeed : RELIGHT.need);
const teamsOn = (ctx: ModeContext) => ctx.teams().length > 0;

function teammates(ctx: ModeContext, a: Glower, b: Glower) {
  return teamsOn(ctx) && a.team !== null && a.team === b.team;
}

/** How far along between a small room and a full one (0 to 1), for things that scale with the room. */
function roomScale(players: number) {
  return Math.min(1, Math.max(0, (players - ARENA.smallRoom) / (ARENA.bigRoom - ARENA.smallRoom)));
}

/** Milliseconds between crates for a room of this size. */
export function crateEveryMs(players: number) {
  return Math.round(lerp(CRATES.everySmall, CRATES.everyBig, roomScale(players)) / 100) * 100;
}

/** The most crates lying about at once for a room of this size. */
export function crateMax(players: number) {
  return Math.round(lerp(CRATES.maxSmall, CRATES.maxBig, roomScale(players)));
}

/** Percent chance of each crate kind, as the screen shows them. */
export function crateOdds(): { kind: CrateKind; percent: number }[] {
  const total = CRATE_ODDS.reduce((n, c) => n + c.weight, 0);
  return CRATE_ODDS.map((c) => ({ kind: c.kind, percent: Math.round((c.weight / total) * 100) }));
}

function pickWeighted<T extends { weight: number }>(rows: readonly T[], rng: Rng): T {
  const total = rows.reduce((n, r) => n + r.weight, 0);
  let roll = rng.next() * total;
  for (const r of rows) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return rows[rows.length - 1]!;
}

/** The players in the arena now (present, with state). */
function present(s: State, ctx: ModeContext): (EnginePlayer & { g: Glower })[] {
  const out: (EnginePlayer & { g: Glower })[] = [];
  for (const p of ctx.players()) {
    const g = s.g[p.id];
    if (g) out.push({ ...p, g });
  }
  return out;
}

/** Clamp to the walls and step out of cover. */
function placeAt(map: ArenaMap, x: number, z: number): [number, number] {
  const [cx, cz] = clampToArena(map.size, x, z);
  const [px, pz] = pushOut(map, cx, cz);
  return clampToArena(map.size, px, pz);
}

function newGlower(ctx: ModeContext<Settings>, p: EnginePlayer, spot: { x: number; z: number; h: number }): Glower {
  return {
    stream: streamInit(ctx),
    team: p.teamId,
    x: spot.x,
    z: spot.z,
    h: spot.h,
    budgetAt: 0,
    glow: startGlow(ctx),
    charges: 0,
    cooldownUntil: 0,
    in: true,
    out: false,
    relight: 0,
    safeUntil: 0,
    shield: false,
    speedUntil: 0,
    beamAt: -1e9,
    lastTag: null,
    lastHit: null,
    score: 0,
    tags: 0,
    dims: 0,
    dimmed: 0,
    relights: 0,
    cheer: 0,
  };
}

/* ---------------------------------- the ring -------------------------------- */

/** How long phase k takes to shrink: RING.shrinkMs, or less when the phases are close together. */
function shrinkMs(s: State, k: number) {
  const start = s.phaseStarts[k]!;
  const after = s.phaseStarts[k + 1] ?? s.endsAt;
  return Math.max(1000, Math.min(RING.shrinkMs, Math.floor(((after - start) * 0.8) / 100) * 100));
}

/** Draw where phase k's ring will be and show it: inside the ring before it, drifting a little, kept in the arena. */
function decideNext(s: State, ctx: ModeContext<Settings>, k: number) {
  const phase = RING.phases[k];
  if (!phase) return;
  const half = s.map.size / 2;
  const prev = s.ring.to;
  const r = r1(phase.radius * half);
  const room = Math.max(0, prev.r - r);
  const angle = ctx.rng.next() * Math.PI * 2;
  const dist = ctx.rng.next() * RING.drift * room;
  const lim = Math.max(0, half - r);
  const x = r1(Math.min(lim, Math.max(-lim, prev.x + Math.sin(angle) * dist)));
  const zc = r1(Math.min(lim, Math.max(-lim, prev.z + Math.cos(angle) * dist)));
  const startAt = s.phaseStarts[k]!;
  s.next = { x, z: zc, r, startAt, endAt: startAt + shrinkMs(s, k) };
  ctx.setTimer('ring', startAt);
}

/** A shrink starts. Its times are the ones shown in advance, even if the timer runs a little late. */
function startShrink(s: State, ctx: ModeContext<Settings>) {
  const next = s.next;
  if (!next) return;
  const from = ringAt(s.ring, next.startAt);
  s.ring = { from: { x: r1(from.x), z: r1(from.z), r: r1(from.r) }, to: { x: next.x, z: next.z, r: next.r }, startAt: next.startAt, endAt: next.endAt };
  s.next = null;
  s.phase++;
  ctx.setTimer('ringDone', s.ring.endAt);
  if (s.drainAt === null) {
    s.drainAt = next.startAt + RING.drainEveryMs;
    ctx.setTimer('drain', s.drainAt);
  }
  if (s.phase >= RING.phases.length) startFinal(s, ctx);
  else ctx.feed('The ring is shrinking. Head for the new ring.', { tone: 'big' });
}

function startFinal(s: State, ctx: ModeContext<Settings>) {
  s.final = true;
  for (const p of present(s, ctx)) {
    if (p.g.in) p.g.score += SCORE.finalRing;
    else {
      p.g.out = true;
      p.g.relight = 0;
    }
  }
  ctx.feed('Final ring! Nobody relights now. Dimmed players can still earn cheer points.', { tone: 'big' });
  checkEnd(s, ctx);
}

/** Every few seconds: everyone outside the ring loses glow. */
function drainTick(s: State, ctx: ModeContext<Settings>) {
  const now = ctx.now();
  s.drainAt = (s.drainAt ?? now) + RING.drainEveryMs;
  ctx.setTimer('drain', s.drainAt);
  const ring = ringAt(s.ring, now);
  for (const p of present(s, ctx)) {
    if (p.g.in && outsideRing(ring, p.g.x, p.g.z)) {
      s.stats.ring++;
      loseGlow(s, ctx, p.id, null);
    }
  }
  checkEnd(s, ctx);
}

/* ---------------------------------- glowing --------------------------------- */

function loseGlow(s: State, ctx: ModeContext<Settings>, id: PlayerId, by: PlayerId | null) {
  const g = s.g[id]!;
  g.glow = Math.max(0, g.glow - (by ? 1 : RING.drain));
  g.lastHit = { n: ++s.seq, at: ctx.now(), by, name: by ? nameOf(ctx, by) : null, outcome: g.glow <= 0 ? 'dimmed' : 'hit' };
  if (g.glow <= 0) dim(s, ctx, id, by);
}

function dim(s: State, ctx: ModeContext<Settings>, id: PlayerId, by: PlayerId | null) {
  const g = s.g[id]!;
  g.in = false;
  g.glow = 0;
  g.relight = 0;
  g.shield = false;
  g.speedUntil = 0;
  g.dimmed++;
  if (s.final) g.out = true;
  s.stats.dims++;
  ctx.feed(by ? `${nameOf(ctx, by)} dimmed ${nameOf(ctx, id)}.` : `${nameOf(ctx, id)} was dimmed by the ring.`);
}

/** Where a dimmed player relights: beside a glowing teammate (Squad relight), or at the edge of the ring, as far from rivals as possible. */
function relightSpot(s: State, ctx: ModeContext<Settings>, id: PlayerId): { x: number; z: number; h: number } {
  const me = s.g[id]!;
  const now = ctx.now();
  const ring = s.ring.endAt > now ? s.ring.to : ringAt(s.ring, now);
  const others = present(s, ctx).filter((p) => p.id !== id && p.g.in);
  const rivals = others.filter((p) => !teammates(ctx, me, p.g));
  const candidates: [number, number][] = [];
  if (ctx.settings.squads && teamsOn(ctx)) {
    const mates = others
      .filter((p) => teammates(ctx, me, p.g))
      .sort((a, b) => Math.hypot(a.g.x - ring.x, a.g.z - ring.z) - Math.hypot(b.g.x - ring.x, b.g.z - ring.z) || a.id.localeCompare(b.id));
    for (const mate of mates) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const [x, zz] = placeAt(s.map, mate.g.x + Math.sin(a) * 2.5, mate.g.z + Math.cos(a) * 2.5);
        if (!outsideRing(ring, x, zz) && !overlapsCover(s.map, x, zz, PLAYER_RADIUS - 0.01)) candidates.push([x, zz]);
      }
      if (candidates.length) break;
    }
  }
  if (!candidates.length) {
    const rad = Math.max(0, Math.min(ring.r - 2, s.map.size / 2 - ARENA.edgeBand / 2));
    const start = ctx.rng.next() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = start + (k * Math.PI * 2) / 12;
      candidates.push(placeAt(s.map, ring.x + Math.sin(a) * rad, ring.z + Math.cos(a) * rad));
    }
  }
  let best = candidates[0]!;
  let bestRoom = -1;
  for (const c of candidates) {
    const room = rivals.length ? Math.min(...rivals.map((p) => Math.hypot(p.g.x - c[0], p.g.z - c[1]))) : 0;
    if (room > bestRoom) {
      best = c;
      bestRoom = room;
    }
  }
  return { x: r2(best[0]), z: r2(best[1]), h: r3(headingTo(best[0], best[1], ring.x, ring.z)) };
}

function relight(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const g = s.g[id]!;
  const now = ctx.now();
  const spot = relightSpot(s, ctx, id);
  g.x = spot.x;
  g.z = spot.z;
  g.h = spot.h;
  g.in = true;
  g.glow = startGlow(ctx);
  g.relight = 0;
  g.charges = Math.max(g.charges, RELIGHT.charges);
  g.safeUntil = now + RELIGHT.safeMs;
  g.budgetAt = now;
  g.relights++;
  s.stats.relights++;
}

/** In the final ring, the game ends when only one player or team is still glowing (never in a game with only one side). */
function checkEnd(s: State, ctx: ModeContext<Settings>) {
  if (!s.final || s.over) return;
  const here = present(s, ctx);
  const side = (p: (typeof here)[number]) => (teamsOn(ctx) && p.g.team ? `t:${p.g.team}` : `p:${p.id}`);
  const sides = new Set(here.map(side));
  if (sides.size < 2) return;
  const glowing = here.filter((p) => p.g.in);
  const left = new Set(glowing.map(side));
  if (left.size > 1) return;
  const last = glowing[0];
  s.winner = last ? (teamsOn(ctx) && last.g.team ? { team: last.g.team, player: null } : { team: null, player: last.id }) : null;
  finish(s, ctx);
}

/** End the game: everyone still glowing earns the last-glow bonus. */
function finish(s: State, ctx: ModeContext<Settings>) {
  if (s.over) return;
  s.over = true;
  for (const p of present(s, ctx)) if (p.g.in) p.g.score += SCORE.lastGlow;
  ctx.endGame();
}

/* ---------------------------------- crates ---------------------------------- */

function crateTick(s: State, ctx: ModeContext<Settings>) {
  const now = ctx.now();
  const n = ctx.players().length;
  ctx.setTimer('crate', now + crateEveryMs(n));
  if (s.crates.length >= crateMax(n)) return;
  // Inside the ring to come, clear of cover, players and other crates.
  const area = s.next ?? s.ring.to;
  const glowing = present(s, ctx).filter((p) => p.g.in);
  for (let tries = 0; tries < 30; tries++) {
    const rad = Math.max(0, area.r - 1.5) * Math.sqrt(ctx.rng.next());
    const a = ctx.rng.next() * Math.PI * 2;
    const [x, zz] = clampToArena(s.map.size, area.x + Math.sin(a) * rad, area.z + Math.cos(a) * rad, 1.5).map(r1) as [number, number];
    if (overlapsCover(s.map, x, zz, PLAYER_RADIUS + 0.6)) continue;
    if (glowing.some((p) => Math.hypot(p.g.x - x, p.g.z - zz) < 4)) continue;
    if (s.crates.some((c) => Math.hypot(c.x - x, c.z - zz) < 3)) continue;
    s.crates.push({ id: ++s.seq, kind: pickWeighted(CRATE_ODDS, ctx.rng).kind, x, z: zz });
    return;
  }
}

/** Distance from point p to the segment a-b. */
function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Pick up every useful crate this step passed. Returns whether anything was picked up. */
function pickUp(s: State, ctx: ModeContext<Settings>, id: PlayerId, fromX: number, fromZ: number): boolean {
  const g = s.g[id]!;
  const now = ctx.now();
  const got: CrateKind[] = [];
  s.crates = s.crates.filter((c) => {
    if (segmentDistance(c.x, c.z, fromX, fromZ, g.x, g.z) > CRATES.reach) return true;
    if (c.kind === 'charge') {
      if (g.charges >= CHARGE.max) return true;
      g.charges = Math.min(CHARGE.max, g.charges + CRATES.charge);
    } else if (c.kind === 'shield') {
      if (g.shield) return true;
      g.shield = true;
    } else g.speedUntil = now + CRATES.speedMs;
    got.push(c.kind);
    return false;
  });
  if (!got.length) return false;
  s.stats.crates += got.length;
  ctx.feed(`You picked up ${got.map((k) => `a ${CRATE_INFO[k].label.toLowerCase()}`).join(' and ')}.`, { tone: 'good', to: [id] });
  return true;
}

/* ---------------------------------- actions --------------------------------- */

function dimmedError(g: Glower) {
  return { error: g.out ? 'You are out for the rest of this game. Keep answering for cheer points.' : 'You are dimmed. Answer questions right to relight.' };
}

function move(s: State, ctx: ModeContext<Settings>, id: PlayerId, a: Extract<Action, { type: 'move' }>) {
  const g = s.g[id]!;
  if (!g.in) return dimmedError(g);
  const now = ctx.now();
  const speed = MOVE.speed * (now < g.speedUntil ? MOVE.boost : 1);
  // A walking allowance: game time since it was last spent (at most windowMs of standing still), plus slack for jitter.
  const base = Math.max(g.budgetAt, now - MOVE.windowMs);
  const reach = (speed * Math.max(0, now + MOVE.slackMs - base)) / 1000;
  let dx = a.x - g.x;
  let dz = a.z - g.z;
  const want = Math.hypot(dx, dz);
  const step = Math.min(want, reach);
  if (want > step) {
    dx = (dx / want) * step;
    dz = (dz / want) * step;
  }
  g.budgetAt = base + (step / speed) * 1000;
  const fromX = g.x;
  const fromZ = g.z;
  const [nx, nz] = step > 0 ? walk(s.map, g.x, g.z, g.x + dx, g.z + dz) : [g.x, g.z];
  g.x = r2(nx);
  g.z = r2(nz);
  g.h = r3(wrapAngle(a.h));
  if (s.crates.length && pickUp(s, ctx, id, fromX, fromZ)) return;
  if (ctx.settings.lightsOut && now >= s.refreshAt && seenUpClose(s, ctx, id, fromX, fromZ)) {
    s.refreshAt = now + LIGHTS_OUT.refreshMs;
    return;
  }
  return { quiet: true as const };
}

/** Lights Out: someone (not a teammate) is close enough to see this player, before or after the step. */
function seenUpClose(s: State, ctx: ModeContext<Settings>, id: PlayerId, fromX: number, fromZ: number) {
  const me = s.g[id]!;
  const range = LIGHTS_OUT.sight + 1;
  return present(s, ctx).some(
    (p) => p.id !== id && p.g.in && !teammates(ctx, me, p.g) && (Math.hypot(p.g.x - me.x, p.g.z - me.z) <= range || Math.hypot(p.g.x - fromX, p.g.z - fromZ) <= range),
  );
}

function tag(s: State, ctx: ModeContext<Settings>, id: PlayerId, targetId: PlayerId) {
  const me = s.g[id]!;
  const now = ctx.now();
  if (!me.in) return dimmedError(me);
  if (me.charges < 1) return { error: 'No charge. Answer a question right to charge your beam.' };
  if (now < me.cooldownUntil) return { error: 'Your beam is still recharging.' };
  if (targetId === id) return { error: 'You cannot tag yourself.' };
  const t = s.g[targetId];
  if (!t || !ctx.player(targetId)) return { error: 'That player is not in the game.' };
  if (teammates(ctx, me, t)) return { error: 'That is your teammate.' };
  if (!t.in) return { error: 'That player is already dimmed.' };
  if (now < t.safeUntil) return { error: 'That player is flickering and cannot be tagged for a moment.' };

  me.charges--;
  me.cooldownUntil = now + TAG.cooldownMs;
  me.beamAt = now;
  const dist = Math.hypot(t.x - me.x, t.z - me.z);
  const toward = headingTo(me.x, me.z, t.x, t.z);
  let outcome: TagOutcome;
  if (dist > TAG.range) outcome = 'range';
  else if (!inCone(me.h, toward, dist, TAG.coneDeg)) outcome = 'front';
  else if (!lineOfSight(s.map, me.x, me.z, t.x, t.z)) outcome = 'blocked';
  else if (t.shield) outcome = 'shield';
  else outcome = 'hit';

  // Where the beam went: to the target on a hit, otherwise straight ahead until cover or its full reach.
  let end: [number, number];
  if (outcome === 'hit' || outcome === 'shield') end = [t.x, t.z];
  else {
    const dx = Math.sin(me.h);
    const dz = Math.cos(me.h);
    const len = raycast(s.map, me.x, me.z, dx, dz, BEAM_REACH);
    end = [me.x + dx * len, me.z + dz * len];
  }

  if (outcome === 'shield') {
    t.shield = false;
    t.lastHit = { n: ++s.seq, at: now, by: id, name: nameOf(ctx, id), outcome: 'shield' };
  } else if (outcome === 'hit') {
    me.score += SCORE.tag;
    me.tags++;
    s.stats.tags++;
    t.safeUntil = now + TAG.safeMs;
    loseGlow(s, ctx, targetId, id);
    if (!t.in) {
      outcome = 'dimmed';
      me.score += SCORE.dim;
      me.dims++;
    }
  }
  const n = ++s.seq;
  me.lastTag = { n, at: now, target: targetId, name: nameOf(ctx, targetId), outcome };
  s.beams = [{ n, by: id, to: targetId, x1: r1(me.x), z1: r1(me.z), x2: r1(end[0]), z2: r1(end[1]), at: now, outcome }, ...s.beams].slice(0, BEAMS.keep);
  if (outcome === 'dimmed') checkEnd(s, ctx);
  return undefined;
}

function answer(s: State, ctx: ModeContext<Settings>, id: PlayerId, a: Extract<Action, { type: 'answer' }>) {
  const g = s.g[id]!;
  const res = streamSubmit(g.stream, id, a.iid, a.answer, ctx);
  if ('error' in res) return res;
  const last = g.stream.last;
  if (!res.correct) {
    if (last) last.text = g.in || g.out ? 'No charge this time.' : 'Not this time. Try the next one.';
    streamNext(g.stream, ctx);
    return undefined;
  }
  let points: number = SCORE.answer;
  let text: string;
  if (g.out) {
    g.cheer += SCORE.cheer;
    points += SCORE.cheer;
    text = `+${String(SCORE.cheer)} cheer points`;
  } else if (!g.in) {
    // While dimmed, right answers relight you; they do not charge your beam.
    g.relight++;
    const need = relightNeed(ctx);
    if (g.relight >= need) {
      relight(s, ctx, id);
      text = `Relit! Back in the arena with ${plural(g.charges, 'charge')}.`;
    } else text = `Relight ${String(g.relight)} of ${String(need)}.`;
  } else {
    const bonus = res.streak % CHARGE.streakEvery === 0 ? CHARGE.streakBonus : 0;
    const before = g.charges;
    g.charges = Math.min(CHARGE.max, g.charges + CHARGE.perRight + bonus);
    const gained = g.charges - before;
    text = gained > 0 ? `+${plural(gained, 'charge')}${bonus ? ` (${String(res.streak)} in a row)` : ''}` : `Charges full (${String(CHARGE.max)})`;
  }
  g.score += points;
  if (last) {
    last.text = text;
    last.points = points;
  }
  streamNext(g.stream, ctx);
  return undefined;
}

/* ----------------------------------- views ---------------------------------- */

function flagsOf(g: Glower, now: number) {
  return (
    (g.in ? FLAGS.in : 0) |
    (now < g.safeUntil ? FLAGS.safe : 0) |
    (g.shield ? FLAGS.shield : 0) |
    (now < g.speedUntil ? FLAGS.speed : 0) |
    (now - g.beamAt <= LIGHTS_OUT.litMs ? FLAGS.lit : 0)
  );
}

/**
 * Whether `viewer` (null for the host screen and the pulse) can see where a
 * player is. Without Lights Out, always. In Lights Out: dimmed players and
 * anyone lit by their own beam are seen by all; a player sees themself, their
 * teammates and anyone within sight.
 */
function canSee(s: State, ctx: ModeContext<Settings>, viewer: PlayerId | null, id: PlayerId, now: number) {
  if (!ctx.settings.lightsOut) return true;
  const o = s.g[id];
  if (!o || !o.in || now - o.beamAt <= LIGHTS_OUT.litMs) return true;
  if (viewer === null) return false;
  if (viewer === id) return true;
  const v = s.g[viewer];
  if (!v) return false;
  if (teammates(ctx, v, o)) return true;
  return v.in && Math.hypot(v.x - o.x, v.z - o.z) <= LIGHTS_OUT.sight;
}

function circle(c: RingCircle): RingCircle {
  return { x: r1(c.x), z: r1(c.z), r: r1(c.r) };
}

function ringView(s: State, now: number): RingView {
  return {
    ...circle(ringAt(s.ring, now)),
    from: circle(s.ring.from),
    to: circle(s.ring.to),
    startAt: s.ring.startAt,
    endAt: s.ring.endAt,
    next: s.next ? { ...circle(s.next), startAt: s.next.startAt, endAt: s.next.endAt } : null,
    phase: s.phase,
    phases: RING.phases.length,
    final: s.final,
    finalAt: s.finalAt,
    drainEveryMs: RING.drainEveryMs,
  };
}

function ranking(s: State, ctx: ModeContext): BoardRow[] {
  const rows: BoardRow[] = present(s, ctx)
    .map((p) => ({ id: p.id, name: p.name, team: p.g.team, score: p.g.score, rank: 0, in: p.g.in }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.score === r.score ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function teamRows(s: State, ctx: ModeContext): TeamRow[] | null {
  if (!teamsOn(ctx)) return null;
  const here = present(s, ctx);
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => ({
    id: t.id,
    name: t.name,
    hue: t.hue,
    score: everyone.filter((p) => p.teamId === t.id).reduce((n, p) => n + (s.g[p.id]?.score ?? 0), 0),
    members: here.filter((p) => p.g.team === t.id).length,
    glowing: here.filter((p) => p.g.team === t.id && p.g.in).length,
  }));
}

function baseView(s: State, ctx: ModeContext<Settings>, viewer: PlayerId | null, now: number, rows: BoardRow[], top: number) {
  const board = rows.slice(0, top);
  const mine = viewer ? rows.find((r) => r.id === viewer) : undefined;
  if (mine && !board.includes(mine)) board.push(mine);
  const players: GlowTagPlayer[] = present(s, ctx).map((p) => {
    const seen = canSee(s, ctx, viewer, p.id, now);
    return [p.id, p.name, p.g.team, seen ? r1(p.g.x) : null, seen ? r1(p.g.z) : null, seen ? r2(p.g.h) : null, p.g.glow, flagsOf(p.g, now)];
  });
  return {
    at: now,
    endsAt: s.endsAt,
    map: s.map,
    rules: { glow: startGlow(ctx), relight: relightNeed(ctx), lightsOut: ctx.settings.lightsOut, squads: ctx.settings.squads },
    ring: ringView(s, now),
    crates: s.crates,
    crateOdds: crateOdds(),
    players,
    beams: s.beams.filter((b) => now - b.at <= BEAMS.showMs),
    board: board.map((r) => (r.id === viewer ? { ...r, you: true as const } : r)),
    teams: teamRows(s, ctx),
    glowing: players.filter((p) => p[7] & FLAGS.in).length,
    ...(s.final ? { finalStretch: true as const } : {}),
  };
}

function youView(s: State, ctx: ModeContext<Settings>, id: PlayerId, rows: BoardRow[]): GlowTagYou | null {
  const g = s.g[id];
  if (!g) return null;
  return {
    id,
    team: g.team,
    x: g.x,
    z: g.z,
    h: g.h,
    glow: g.glow,
    maxGlow: startGlow(ctx),
    charges: g.charges,
    maxCharges: CHARGE.max,
    cooldownUntil: g.cooldownUntil,
    in: g.in,
    out: g.out,
    relight: !g.in && !g.out ? { have: g.relight, need: relightNeed(ctx) } : null,
    safeUntil: g.safeUntil,
    shield: g.shield,
    speedUntil: g.speedUntil,
    lastTag: g.lastTag,
    lastHit: g.lastHit,
    score: g.score,
    rank: rows.find((r) => r.id === id)?.rank ?? rows.length + 1,
    tags: g.tags,
    dims: g.dims,
    cheer: g.cheer,
    streak: g.stream.streak,
    question: streamQuestionView(g.stream, ctx),
    last: g.stream.last,
  };
}

/* ----------------------------------- mode ----------------------------------- */

export const glowTag = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const players = ctx.players();
    const size = arenaSize(players.length);
    const map = generateMap(size, ctx.rng);
    const now = ctx.now();
    const total = timeLimitMs(ctx);
    const phaseStarts = RING.phases.map((p) => now + Math.round((p.at * total) / 100) * 100);
    const ring0 = startRing(size);
    const s: State = {
      map,
      g: {},
      ring: { from: ring0, to: { ...ring0 }, startAt: now, endAt: now },
      next: null,
      phase: 0,
      drainAt: null,
      phaseStarts,
      finalAt: phaseStarts[phaseStarts.length - 1]!,
      final: false,
      crates: [],
      beams: [],
      seq: 0,
      endsAt: now + total,
      refreshAt: 0,
      stats: { tags: 0, dims: 0, relights: 0, crates: 0, ring: 0 },
      winner: null,
      over: false,
    };
    // Teammates start side by side; the spots are spread evenly round the edge.
    const order = players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (a.p.teamId ?? '').localeCompare(b.p.teamId ?? '') || a.i - b.i)
      .map((x) => x.p);
    const spots = edgeSpots(size, order.length, ctx.rng.next());
    order.forEach((p, i) => (s.g[p.id] = newGlower(ctx, p, spots[i]!)));
    decideNext(s, ctx, 0);
    ctx.setTimer('end', s.endsAt);
    ctx.setTimer('crate', now + CRATES.firstMs);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    if (s.g[p.id]) return;
    const g = newGlower(ctx, p, { x: 0, z: 0, h: 0 });
    s.g[p.id] = g;
    if (s.final) {
      g.in = false;
      g.out = true;
      g.glow = 0;
      return;
    }
    const spot = relightSpot(s, ctx, p.id);
    g.x = spot.x;
    g.z = spot.z;
    g.h = spot.h;
    g.safeUntil = ctx.now() + RELIGHT.safeMs;
    g.budgetAt = ctx.now();
  },
  onPlayerLeave(s, _p, ctx) {
    checkEnd(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    if (!s.g[playerId]) return { error: 'You are not in this game.' };
    if (s.over) return { error: 'The game is over.' };
    switch (a.type) {
      case 'move':
        return move(s, ctx, playerId, a);
      case 'tag':
        return tag(s, ctx, playerId, a.target);
      case 'answer':
        return answer(s, ctx, playerId, a);
    }
  },
  onTimer(s, id, ctx) {
    if (s.over) return;
    if (id === 'end') finish(s, ctx);
    else if (id === 'ring') startShrink(s, ctx);
    else if (id === 'ringDone') decideNext(s, ctx, s.phase);
    else if (id === 'drain') drainTick(s, ctx);
    else if (id === 'crate') crateTick(s, ctx);
  },
  view(s, viewer, ctx): GlowTagPlayerView | GlowTagHostView {
    const now = ctx.now();
    const rows = ranking(s, ctx);
    if (viewer.kind === 'host') return { ...baseView(s, ctx, null, now, rows, BOARD.host), stats: { ...s.stats } };
    return { ...baseView(s, ctx, viewer.playerId, now, rows, BOARD.player), you: youView(s, ctx, viewer.playerId, rows) };
  },
  pulse(s, ctx): GlowTagPulse {
    const now = ctx.now();
    const ring = ringAt(s.ring, now);
    const p: PulseEntry[] = [];
    for (const pl of present(s, ctx)) {
      if (!canSee(s, ctx, null, pl.id, now)) continue;
      p.push([pl.id, Math.round(pl.g.x * 10), Math.round(pl.g.z * 10), Math.round(pl.g.h * 100), flagsOf(pl.g, now), pl.g.glow]);
    }
    return { t: now, ring: [Math.round(ring.x * 10), Math.round(ring.z * 10), Math.round(ring.r * 10)], p };
  },
  results(s, ctx) {
    const everyone = ctx.everyone();
    const standings = everyone.map((p) => {
      const g = s.g[p.id];
      const score = g?.score ?? 0;
      return { playerId: p.id, score, label: `${plural(score, 'point')}${g?.tags ? ` · ${plural(g.tags, 'tag')}` : ''}` };
    });
    const teams = teamRows(s, ctx);
    let summary: string;
    if (s.winner?.team) summary = `The ${ctx.teams().find((t) => t.id === s.winner!.team)?.name ?? 'last team'} were the last team glowing.`;
    else if (s.winner?.player) summary = `${nameOf(ctx, s.winner.player)} was the last one glowing.`;
    else {
      const best = Math.max(0, ...standings.map((r) => r.score));
      const leaders = standings.filter((r) => r.score === best);
      summary =
        best <= 0
          ? 'Nobody scored this time.'
          : leaders.length === 1
            ? `${nameOf(ctx, leaders[0]!.playerId)} scored the most, with ${plural(best, 'point')}.`
            : `${String(leaders.length)} players tied for the most points, with ${fmt(best)}.`;
    }
    const tagger = everyone.map((p) => ({ id: p.id, tags: s.g[p.id]?.tags ?? 0 })).sort((a, b) => b.tags - a.tags || a.id.localeCompare(b.id))[0];
    if (tagger && tagger.tags > 0) summary += ` Most tags: ${nameOf(ctx, tagger.id)} (${String(tagger.tags)}).`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.id, score: t.score, label: plural(t.score, 'point') })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    return botAction(view as GlowTagPlayerView, ctx.playerId, ctx.now, ctx.rng, (iid) => ctx.answer(iid));
  },
  botDelay(view, _rng) {
    const v = view as GlowTagPlayerView | null;
    const you = v?.you;
    if (!v || !you) return 1000;
    if (you.in) return BOT_STEP_MS;
    const q = you.question;
    if (!q) return 500;
    // A dimmed bot has nothing to do but think about its question.
    return Math.max(100, Math.ceil((thinkingSince(you) + thinkMs(q.iid) - v.at) / 100) * 100);
  },
});

/* ----------------------------------- bots ----------------------------------- */

/**
 * How bots play. They act every `stepMs` (a multiple of 100, so a room of bots
 * moves together). Like a person with a phone, a bot cannot answer and play
 * at once: it stands still while it thinks, and using its beam or being
 * tagged starts its thinking again. It tops up its charges when it has fewer
 * than `lowCharge`, or when no rival is within `threat` metres. It notices a
 * chance to tag with probability `reaction` each step, aims up to `aimDeg`
 * off, tags when a rival looks within `tagDeg` of straight ahead, judges
 * distance to within 10%, and tags without checking for cover `careless` of
 * the time, so bots miss now and then, as people do. A bot thinking outside
 * the ring notices with probability `noticeRing` each step.
 */
const BOT = { stepMs: 200, lowCharge: 2, threat: 18, reaction: 0.3, aimDeg: 25, tagDeg: 24, careless: 0.15, noticeRing: 0.2 } as const;
const BOT_STEP_MS = BOT.stepMs;
const DEG = Math.PI / 180;

/** How long a bot thinks about a question: 3 to 8 seconds, the same every time it looks at it. */
function thinkMs(iid: string) {
  return 3000 + (hashString(iid) % 5000);
}

/** When a bot started thinking about its question: when it appeared, or the bot's last beam or tag, whichever came last. */
function thinkingSince(you: GlowTagYou) {
  return Math.max(you.question?.shownAt ?? 0, you.lastTag?.at ?? 0, you.lastHit?.at ?? 0);
}

interface Foe {
  id: string;
  x: number;
  z: number;
  f: number;
  d: number;
}

/**
 * A bot's next move. It answers once it has thought long enough (and wants
 * charges); otherwise, in the arena, it may tag a rival in front of it, or
 * walks: back into the ring when outside it (or the ring about to shrink), to
 * a useful crate nearby, to a fighting distance of 8 to 12 metres from the
 * nearest rival it can see (away, with no charge), or about the ring. It picks
 * a heading clear of cover by trying a few, and faces the rival it is
 * stalking so a tag can follow.
 */
function botAction(view: GlowTagPlayerView, id: PlayerId, now: number, rng: Rng, answerFor: (iid: string) => Answer): GlowTagAction | null {
  const you = view?.you;
  if (!you) return null;
  const map = view.map;
  const foes: Foe[] = [];
  for (const [pid, , team, x, z, , , f] of view.players) {
    if (pid === id || x === null || z === null || !(f & FLAGS.in)) continue;
    if (you.team !== null && team === you.team && view.teams) continue;
    foes.push({ id: pid, x, z, f, d: Math.hypot(x - you.x, z - you.z) });
  }
  foes.sort((a, b) => a.d - b.d);
  const nearest = foes[0];
  const q = you.question;
  const wantsCharge = !you.in || you.charges < BOT.lowCharge || (!(nearest && nearest.d < BOT.threat) && you.charges < CHARGE.max - 1);
  const thinking = Boolean(q && wantsCharge);
  if (q && thinking && now >= thinkingSince(you) + thinkMs(q.iid)) return { type: 'answer', iid: q.iid, answer: answerFor(q.iid) };
  if (!you.in) return null;

  if (you.charges > 0 && now >= you.cooldownUntil && rng.next() < BOT.reaction) {
    const target = foes.find(
      (p) =>
        !(p.f & FLAGS.safe) &&
        p.d * (0.9 + rng.next() * 0.2) <= TAG.range &&
        Math.abs(wrapAngle(headingTo(you.x, you.z, p.x, p.z) - you.h)) <= BOT.tagDeg * DEG &&
        (rng.next() < BOT.careless || lineOfSight(map, you.x, you.z, p.x, p.z)),
    );
    if (target) return { type: 'tag', target: target.id };
  }

  const ring = view.ring;
  const edge = Math.hypot(you.x - ring.x, you.z - ring.z) - ring.r;
  // Thinking about a question: stand still. A bot caught outside the ring notices after a moment.
  if (thinking && !(edge > 0 && rng.next() < BOT.noticeRing)) return null;
  const outside = edge > -1;
  const speed = MOVE.speed * (now < you.speedUntil ? MOVE.boost : 1);
  const step = (speed * BOT_STEP_MS * 0.95) / 1000;
  // Head for the ring that is shrinking now (the next one only once it has started).
  const soon = now < ring.endAt ? ring.to : ring;
  let goal: [number, number];
  const fromCentre = Math.hypot(you.x - soon.x, you.z - soon.z);
  const crate = view.crates
    .filter((c) => (c.kind === 'charge' ? you.charges <= CHARGE.max - CRATES.charge : c.kind === 'shield' ? !you.shield : now >= you.speedUntil))
    .map((c) => ({ c, d: Math.hypot(c.x - you.x, c.z - you.z) }))
    .filter((c) => c.d < 14 && Math.hypot(c.c.x - soon.x, c.c.z - soon.z) < soon.r)
    .sort((a, b) => a.d - b.d)[0];
  if (outside || fromCentre > Math.max(1, soon.r - 2.5)) goal = [soon.x, soon.z];
  else if (crate) goal = [crate.c.x, crate.c.z];
  else if (nearest && nearest.d < 30) {
    const away: [number, number] = [you.x + ((you.x - nearest.x) / (nearest.d || 1)) * 4, you.z + ((you.z - nearest.z) / (nearest.d || 1)) * 4];
    if (you.charges === 0) goal = away;
    else if (nearest.d > 11) goal = [nearest.x, nearest.z];
    else if (nearest.d < 7) goal = away;
    else {
      // Circle the rival, changing direction every few seconds.
      const side = (hashString(id) + Math.floor(now / 3000)) % 2 === 0 ? 1 : -1;
      const around = headingTo(nearest.x, nearest.z, you.x, you.z) + side * 0.5;
      goal = [nearest.x + Math.sin(around) * 9.5, nearest.z + Math.cos(around) * 9.5];
    }
  } else {
    // Wander the park inside the ring, a new spot every 6 seconds.
    const a = ((hashString(id) % 360) * Math.PI) / 180 + Math.floor(now / 6000) * 2.1;
    const far = Math.min(soon.r * 0.8, map.size / 2 - 3) * (0.4 + (Math.floor(now / 6000 + hashString(id)) % 3) * 0.3);
    goal = [soon.x + Math.sin(a) * far, soon.z + Math.cos(a) * far];
  }
  const to = steer(map, you.x, you.z, goal[0], goal[1], step, rng);
  const aim = (rng.next() * 2 - 1) * BOT.aimDeg * DEG;
  const h = nearest && nearest.d < 20 ? headingTo(to.x, to.z, nearest.x, nearest.z) + aim : to.h;
  return { type: 'move', x: r2(to.x), z: r2(to.z), h: r3(wrapAngle(h)) };
}

/** A step towards a goal that does not walk into cover: straight if clear, otherwise the nearest clear heading either side. */
function steer(map: ArenaMap, x: number, z: number, gx: number, gz: number, step: number, rng: Rng): { x: number; z: number; h: number } {
  const dist = Math.hypot(gx - x, gz - z);
  const base = dist > 1e-6 ? headingTo(x, z, gx, gz) : 0;
  if (dist < 0.2) return { x, z, h: base };
  const len = Math.min(step, dist);
  const side = rng.next() < 0.5 ? 1 : -1;
  const jitter = (rng.next() - 0.5) * 0.2;
  const lim = map.size / 2 - PLAYER_RADIUS - 0.1;
  for (const off of [0, 30, 60, 90, 120, 150, 180]) {
    for (const sign of off === 0 || off === 180 ? [1] : [side, -side]) {
      const h = base + jitter + (sign * off * Math.PI) / 180;
      const nx = x + Math.sin(h) * len;
      const nz = z + Math.cos(h) * len;
      if (Math.abs(nx) > lim || Math.abs(nz) > lim) continue;
      if (!overlapsCover(map, nx, nz, PLAYER_RADIUS + 0.15)) return { x: nx, z: nz, h: wrapAngle(h) };
    }
  }
  return { x, z, h: base };
}
